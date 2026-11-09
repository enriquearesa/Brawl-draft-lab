#!/usr/bin/env node
/* Genera data/live.json con imágenes de mapas (y de brawlers sin ID) + win rates si hay fuente.
   Lo ejecuta GitHub Actions (.github/workflows/live.yml). Fuentes, en orden:
     1. API pública de Brawlify (api.brawlapi.com): IDs de brawlers e imágenes de mapas. Sus win rates por mapa
        llegan vacíos desde 2026; las estadísticas de Competitivo salen de tools/fetch-meta.js (data/stats.json).
     2. Wiki de Brawl Stars en Fandom (MediaWiki API, imagen principal de cada página).
     3. Liquipedia (MediaWiki API) como respaldo. */
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const UA = { "User-Agent": "DraftLab/1.0 (https://github.com/enriquearesa/Brawl-draft-lab; fan tool)", Accept: "application/json" };
const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[^a-z0-9]/g, "");
const listOf = (j) => (j && (j.list || j.items || (Array.isArray(j) ? j : null))) || [];
const API = "https://api.brawlapi.com/v1"; // api.brawlify.com responde 403 desde nov 2026
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, tries) {
  for (let i = 0; i < (tries || 2); i++) {
    try {
      const r = await fetch(url, { headers: UA });
      if (r.ok) return await r.json();
      console.warn("  " + url.slice(0, 90) + " → " + r.status);
    } catch (e) { console.warn("  " + url.slice(0, 90) + " → " + e.message); }
    await sleep(1500 * (i + 1));
  }
  return null;
}

// Imagen principal de varias páginas de una wiki MediaWiki (hasta 50 títulos por llamada)
async function wikiImages(api, titles) {
  const out = {};
  for (let i = 0; i < titles.length; i += 40) {
    const chunk = titles.slice(i, i + 40);
    const url = api + "?action=query&format=json&redirects=1&prop=pageimages&piprop=original&pilicense=any&titles=" + encodeURIComponent(chunk.join("|"));
    const j = await get(url);
    if (!j || !j.query) continue;
    const back = {};
    chunk.forEach((t) => (back[t] = t));
    (j.query.normalized || []).forEach((n) => (back[n.to] = back[n.from] || n.from));
    (j.query.redirects || []).forEach((n) => (back[n.to] = back[n.from] || n.from));
    Object.values(j.query.pages || {}).forEach((p) => {
      const orig = back[p.title] || p.title;
      if (p.original && p.original.source) out[orig] = p.original.source;
    });
    await sleep(2100);
  }
  return out;
}

(async () => {
  const meta = JSON.parse(fs.readFileSync(path.join(root, "data/meta.json"), "utf8"));
  let prev = {};
  try { prev = JSON.parse(fs.readFileSync(path.join(root, "data/live.json"), "utf8")); } catch (e) {}

  const out = { t: new Date().toISOString(), fuentes: [], brawlers: [], maps: [], stats: {}, imgBrawlers: {} };

  // 1) Brawlify
  console.log("Brawlify…");
  const [bj, mj] = await Promise.all([get(API + "/brawlers"), get(API + "/maps")]);
  const bl = listOf(bj), ml = listOf(mj);
  if (bl.length || ml.length) {
    out.fuentes.push("brawlify");
    out.brawlers = bl.map((x) => ({ id: x.id, name: x.name, cls: x.class && x.class.name })).filter((x) => x.id && x.name);
    for (const m of meta.mapas) {
      const modeEn = norm((meta.modos[m.modo] || {}).en);
      const c = ml.filter((x) => norm(x.name) === norm(m.nombre)).sort((a, b) => (norm(a.gameMode && a.gameMode.name) === modeEn ? 0 : 1) - (norm(b.gameMode && b.gameMode.name) === modeEn ? 0 : 1))[0];
      if (!c) continue;
      out.maps.push({ id: c.id, name: m.nombre, mapId: m.id, img: c.imageUrl || "https://cdn.brawlify.com/maps/regular/" + c.id + ".png" });
      const d = await get(API + "/maps/" + c.id, 1);
      const s = {};
      ((d && d.stats) || []).forEach((y) => { const id = y.brawler || y.brawlerId; if (id && y.winRate != null) s[id] = { wr: Math.round(y.winRate * 10) / 10, use: +(y.useRate || 0) }; });
      if (Object.keys(s).length) out.stats[m.id] = s;
      await sleep(250);
    }
  }

  // 2) y 3) Wikis para los mapas que falten y brawlers sin ID de imagen
  const have = new Set(out.maps.map((m) => m.mapId));
  const missing = meta.mapas.filter((m) => !have.has(m.id));
  const noId = meta.brawlers.filter((b) => !b.gameId);
  const wikis = [
    ["fandom", "https://brawlstars.fandom.com/api.php"],
    ["liquipedia", "https://liquipedia.net/brawlstars/api.php"],
  ];
  let pend = missing.slice();
  let pendB = noId.slice();
  for (const [name, api] of wikis) {
    if (!pend.length && !pendB.length) break;
    console.log(name + "… (" + pend.length + " mapas, " + pendB.length + " brawlers)");
    const imgs = await wikiImages(api, pend.map((m) => m.nombre).concat(pendB.map((b) => b.nombre)));
    if (Object.keys(imgs).length) out.fuentes.push(name);
    pend = pend.filter((m) => {
      const src = imgs[m.nombre];
      if (!src) return true;
      out.maps.push({ id: null, name: m.nombre, mapId: m.id, img: src, fuente: name });
      return false;
    });
    pendB = pendB.filter((b) => {
      const src = imgs[b.nombre];
      if (!src) return true;
      out.imgBrawlers[b.id] = src;
      return false;
    });
  }

  // Nombres en español de los mapas (enlaces entre idiomas de la wiki en Fandom)
  out.es = {};
  const sinEs = meta.mapas.filter((m) => !m.nombreEs);
  for (let i = 0; i < sinEs.length; i += 40) {
    const chunk = sinEs.slice(i, i + 40);
    const url = "https://brawlstars.fandom.com/api.php?action=query&format=json&redirects=1&prop=langlinks&lllang=es&lllimit=max&titles=" + encodeURIComponent(chunk.map((m) => m.nombre).join("|"));
    const j = await get(url);
    if (!j || !j.query) continue;
    const back = {};
    chunk.forEach((m) => (back[m.nombre] = m.id));
    (j.query.normalized || []).forEach((n) => (back[n.to] = back[n.from]));
    (j.query.redirects || []).forEach((n) => (back[n.to] = back[n.from]));
    Object.values(j.query.pages || {}).forEach((p) => {
      const id = back[p.title];
      const ll = (p.langlinks || [])[0];
      if (id && ll && ll["*"]) out.es[id] = ll["*"];
    });
    await sleep(2100);
  }
  // Respaldo: buscar en la wiki española páginas cuyo enlace al inglés coincida exactamente con el mapa
  for (const m of meta.mapas.filter((x) => !x.nombreEs && !out.es[x.id])) {
    const url = "https://brawlstars.fandom.com/es/api.php?action=query&format=json&generator=search&gsrnamespace=0&gsrlimit=6&gsrsearch=" +
      encodeURIComponent('"' + m.nombre + '"') + "&prop=langlinks&lllang=en&lllimit=max";
    const j = await get(url, 1);
    const pages = Object.values((j && j.query && j.query.pages) || {});
    const hit = pages.find((p) => (p.langlinks || []).some((l) => norm(l["*"]) === norm(m.nombre)));
    if (hit) out.es[m.id] = hit.title;
    await sleep(1200);
  }
  // Respaldo de imágenes: búsqueda en la wiki inglesa (p. ej. diferencias de mayúsculas)
  for (const m of meta.mapas.filter((x) => !out.maps.some((y) => y.mapId === x.id))) {
    const url = "https://brawlstars.fandom.com/api.php?action=query&format=json&generator=search&gsrnamespace=0&gsrlimit=5&gsrsearch=" +
      encodeURIComponent(m.nombre) + "&prop=pageimages&piprop=original";
    const j = await get(url, 1);
    const pages = Object.values((j && j.query && j.query.pages) || {});
    const hit = pages.find((p) => norm(p.title) === norm(m.nombre) && p.original);
    if (hit) { out.maps.push({ id: null, name: m.nombre, mapId: m.id, img: hit.original.source, fuente: "fandom-busqueda" }); pend = pend.filter((x) => x.id !== m.id); }
    await sleep(1200);
  }
  Object.entries(out.es).forEach(([k, v]) => console.log("  [es] " + k + " → " + v));

  // Conservar lo que ya teníamos si esta vez alguna fuente falla
  (prev.maps || []).forEach((m) => { if (!out.maps.some((x) => x.mapId === m.mapId) && meta.mapas.some((x) => x.id === m.mapId)) out.maps.push(m); });
  Object.entries(prev.imgBrawlers || {}).forEach(([k, v]) => { if (!out.imgBrawlers[k]) out.imgBrawlers[k] = v; });
  if (!out.brawlers.length && prev.brawlers) out.brawlers = prev.brawlers;
  if (!Object.keys(out.stats).length && prev.stats) out.stats = prev.stats;
  Object.entries(prev.es || {}).forEach(([k, v]) => { if (!out.es[k]) out.es[k] = v; });

  out.maps.forEach((m) => console.log("  " + m.name + " → " + m.img));
  Object.entries(out.imgBrawlers).forEach(([k, v]) => console.log("  [brawler] " + k + " → " + v));
  if (!out.maps.length) { console.error("No se encontró ninguna imagen de mapa"); process.exit(1); }

  fs.writeFileSync(path.join(root, "data/live.json"), JSON.stringify(out) + "\n");
  console.log("✓ live.json · " + out.maps.length + "/" + meta.mapas.length + " mapas con imagen · " +
    Object.keys(out.imgBrawlers).length + "/" + noId.length + " brawlers sin ID con imagen · fuentes: " + out.fuentes.join(", "));
  if (pend.length) console.log("Sin imagen: " + pend.map((m) => m.nombre).join(", "));
})();
