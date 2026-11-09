#!/usr/bin/env node
/* Genera data/stats.json con estadísticas reales de Competitivo (Ranked) desde seemeta.com:
     - por brawler: tier, win rate (bruto y ajustado), % de pick, partidas
     - por mapa: top 10 con win rate y % de pick, y mejores tríos
     - counters y compañeros: pares cuyo resultado real se aleja del esperado
   Lo ejecuta GitHub Actions (.github/workflows/live.yml). Si el formato de la web cambia y el
   resultado no pasa los controles, NO sobrescribe el archivo anterior (sale con aviso). */
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const OUT = path.join(root, "data/stats.json");
const UA = { "User-Agent": "Mozilla/5.0 (compatible; DraftLab/1.0; +https://github.com/enriquearesa/Brawl-draft-lab)" };
const BASE = "https://seemeta.com/en/brawl-stars";
const TIERS = new Set(["S+", "S", "A", "B", "C", "D", "F"]);
const MODES = new Set(["gemGrab", "brawlBall", "hotZone", "heist", "knockout", "bounty"]);

const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[^a-z0-9]/g, "");
const pct = (s) => parseFloat(String(s).replace(/[≈%]/g, "").replace("Pick", "").trim());
const num = (s) => parseInt(String(s).replace(/[^0-9]/g, ""), 10);
const isPct = (s) => /^≈?\d+(\.\d+)?%$/.test(s);

function lines(htmlText) {
  return htmlText
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, "")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&amp;/g, "&").replace(/&#39;|&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;| /g, " ")
    .split("\n").map((s) => s.trim()).filter(Boolean);
}

async function get(url) {
  // Pruebas sin red: SEEMETA_DIR=/ruta con tier-list.html y maps.html
  if (process.env.SEEMETA_DIR) return fs.readFileSync(path.join(process.env.SEEMETA_DIR, url.split("/").pop() + ".html"), "utf8");
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { headers: UA });
      if (r.ok) return await r.text();
      console.warn("  " + url + " → " + r.status);
    } catch (e) { console.warn("  " + url + " → " + e.message); }
    await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
  }
  return null;
}

// Pares (nombre, %, "expected x%") a partir de la posición i
function pairs(L, i, stop) {
  const out = [];
  while (i + 2 < L.length && !stop(L[i]) && isPct(L[i + 1]) && /^expected /.test(L[i + 2])) {
    out.push({ n: L[i], wr: pct(L[i + 1]), exp: pct(L[i + 2].replace("expected", "")) });
    i += 3;
  }
  return out;
}

function parseTier(L) {
  const res = { brawlers: {}, cards: {} };
  const h = L.indexOf("Brawl Stars Ranked Tier List");
  if (h < 0) throw new Error("no encuentro la tier list");
  const rb = L.findIndex((x, k) => k > h && x.startsWith("Ranked battles"));
  res.batallas = num(L[rb]);
  // Lista general: tier, nombre, wr, "Pick x%", [≈ajustado]
  let i = rb + 1;
  while (i < L.length && TIERS.has(L[i])) {
    const t = L[i], n = L[i + 1], wr = pct(L[i + 2]);
    if (!/^Pick /.test(L[i + 3])) break;
    const use = pct(L[i + 3]);
    i += 4;
    let adj = null;
    if (/^≈/.test(L[i] || "")) { adj = pct(L[i]); i++; }
    res.brawlers[n] = { tier: t, wr, adj, use };
    while (i < L.length && !TIERS.has(L[i]) && L[i] !== "Tier changes") i++; // saltar anuncios
    if (L[i] === "Tier changes") break;
  }
  // Fichas: "<nombre>", "Tier", t, "Win rate", ..., "Use rate", u, "Picks", p ... "All matchups of <nombre>"
  for (let k = 0; k < L.length; k++) {
    if (!/^All matchups of /.test(L[k])) continue;
    const n = L[k].slice("All matchups of ".length);
    let s = k;
    while (s > 0 && !(L[s] === n && L[s + 1] === "Tier")) s--;
    if (!s) continue;
    const seg = L.slice(s, k);
    const card = { teammates: [], hardest: [] };
    const pi = seg.indexOf("Picks");
    if (pi > 0) card.picks = num(seg[pi + 1]);
    const bt = seg.indexOf("Best teammates");
    if (bt > 0) card.teammates = pairs(seg, bt + 1, (x) => x === "Hardest matchups");
    const hm = seg.indexOf("Hardest matchups");
    if (hm > 0) card.hardest = pairs(seg, hm + 1, () => false);
    res.cards[n] = card;
  }
  return res;
}

function parseMaps(L) {
  const maps = {};
  let mode = null;
  const dp = L.indexOf("Data period");
  const periodo = dp > 0 ? L[dp + 1] : null;
  for (let k = 0; k < L.length; k++) {
    if (MODES.has(L[k])) mode = L[k];
    if (!/^Ranked battles \d/.test(L[k]) || !mode) continue;
    const name = L[k - 1];
    let j = L.indexOf("Picks", k) + 1;
    if (!j) continue;
    const top = [];
    while (j < L.length && TIERS.has(L[j + 1]) && isPct(L[j + 2])) {
      const r = { n: L[j], tier: L[j + 1], wr: pct(L[j + 2]) };
      j += 3;
      if (/^≈/.test(L[j])) { r.adj = pct(L[j]); j++; }
      r.use = pct(L[j]); r.picks = num(L[j + 1]); j += 2;
      top.push(r);
    }
    const trios = [];
    if (/^Best trios/.test(L[j] || "")) {
      j++;
      while (L[j + 3] === "Win rate" && trios.length < 5) {
        trios.push({ b: L.slice(j, j + 3), wr: pct(L[j + 4]) });
        j += 5;
        if (/^expected/.test(L[j])) j++;
      }
    }
    maps[name] = { modo: mode, batallas: num(L[k]), top, trios };
  }
  return { maps, periodo };
}

(async () => {
  const meta = JSON.parse(fs.readFileSync(path.join(root, "data/meta.json"), "utf8"));
  const bId = {};
  meta.brawlers.forEach((b) => { bId[norm(b.nombre)] = b.id; bId[b.id] = b.id; });
  const ALIAS = { larrylawrie: "larrylawrie", larryandlawrie: "larrylawrie", colonelruffs: "ruffs", jaeyong: "jaeyong" };
  const idOf = (n) => { const k = norm(n); return bId[ALIAS[k] || k] || null; };
  const mId = {};
  meta.mapas.forEach((m) => (mId[norm(m.nombre)] = m.id));

  console.log("seemeta…");
  const [th, mh] = [await get(BASE + "/tier-list"), await get(BASE + "/maps")];
  if (!th || !mh) { console.warn("⚠ seemeta no responde: se conserva data/stats.json"); return; }
  let T, M;
  try { T = parseTier(lines(th)); M = parseMaps(lines(mh)); } catch (e) { console.warn("⚠ formato inesperado (" + e.message + "): se conserva data/stats.json"); return; }

  const out = {
    t: new Date().toISOString(),
    fuente: { nombre: "seemeta · Competitivo (todos los rangos)", url: BASE + "/tier-list" },
    periodo: M.periodo, batallas: T.batallas,
    brawlers: {}, mapas: {}, counters: [], companeros: [], sinId: [],
  };
  const miss = new Set();
  const id = (n) => { const x = idOf(n); if (!x) miss.add(n); return x; };

  Object.entries(T.brawlers).forEach(([n, v]) => {
    const k = id(n); if (!k) return;
    out.brawlers[k] = { tier: v.tier, wr: v.wr, adj: v.adj, use: v.use, picks: (T.cards[n] || {}).picks || null };
  });
  // Counters: Y está en "Hardest matchups" de X → delta = esperado − real (puntos de win rate que Y le quita a X)
  const seen = new Set();
  Object.entries(T.cards).forEach(([n, c]) => {
    const a = id(n); if (!a) return;
    c.hardest.forEach((p) => {
      const b = id(p.n); if (!b) return;
      const d = Math.round((p.exp - p.wr) * 10) / 10;
      if (d > 0 && !seen.has(b + ">" + a)) { seen.add(b + ">" + a); out.counters.push([b, a, d]); }
    });
    c.teammates.forEach((p) => {
      const b = id(p.n); if (!b) return;
      const d = Math.round((p.wr - p.exp) * 10) / 10;
      const key = [a, b].sort().join("+");
      if (d > 0 && !seen.has(key)) { seen.add(key); out.companeros.push([a, b, d]); }
    });
  });
  Object.entries(M.maps).forEach(([n, m]) => {
    const k = mId[norm(n)];
    if (!k) { console.log("  mapa sin entrada en meta.json: " + n); return; }
    out.mapas[k] = {
      batallas: m.batallas,
      top: m.top.map((r) => ({ id: id(r.n), tier: r.tier, wr: r.wr, adj: r.adj || null, use: r.use, picks: r.picks })).filter((r) => r.id),
      trios: m.trios.map((t) => ({ b: t.b.map(id), wr: t.wr })).filter((t) => t.b.every(Boolean)),
    };
  });
  out.sinId = [...miss];

  // Controles de calidad: si algo no cuadra, no se toca el archivo bueno anterior
  const nb = Object.keys(out.brawlers).length, nm = Object.keys(out.mapas).length;
  const problems = [];
  if (nb < 80) problems.push(nb + " brawlers (mínimo 80)");
  if (nm < 10) problems.push(nm + " mapas (mínimo 10)");
  if (out.counters.length < 50) problems.push(out.counters.length + " counters (mínimo 50)");
  if (!out.batallas || out.batallas < 20000) problems.push("muestra pequeña: " + out.batallas + " partidas");
  if (problems.length) { console.warn("⚠ datos incompletos (" + problems.join(", ") + "): se conserva data/stats.json"); return; }

  fs.writeFileSync(OUT, JSON.stringify(out, null, 0).replace(/\],\[/g, "],\n[").replace(/\},"/g, '},\n"') + "\n");
  console.log("✓ stats.json · " + nb + " brawlers · " + nm + " mapas · " + out.counters.length + " counters · " + out.companeros.length +
    " parejas · " + out.batallas + " partidas · " + out.periodo + (miss.size ? " · sin id: " + [...miss].join(", ") : ""));
})();
