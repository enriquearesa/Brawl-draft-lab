#!/usr/bin/env node
/* Valida data/meta.json y hace una prueba rápida del motor en todos los mapas.
   Uso: node tools/validate.js   (sale con código 1 si hay errores) */
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const errs = [];
let meta;
try { meta = JSON.parse(fs.readFileSync(path.join(root, "data/meta.json"), "utf8")); }
catch (e) { console.error("meta.json no es JSON válido:", e.message); process.exit(1); }

const CLASSES = ["DD", "TK", "MK", "AR", "CT", "AS", "SP"];
const TIERS = ["S+", "S", "A", "B", "C", "D", "F", "?"];
const TAGS = ["W", "T", "D", "H", "M", "C", "B", "Z", "S", "P"];
const ARQ = ["abierto", "mixto", "cerrado"];

["meta", "reglas", "modos", "brawlers", "mapas", "changelog"].forEach((k) => { if (!meta[k]) errs.push("Falta la clave " + k); });
const m = meta.meta || {};
["version", "fechaDatos", "comprobado", "parche", "temporada"].forEach((k) => { if (m[k] == null) errs.push("meta." + k + " vacío"); });
if (!Number.isInteger(m.version)) errs.push("meta.version debe ser entero");
if (isNaN(Date.parse(m.comprobado))) errs.push("meta.comprobado no es una fecha ISO");

const ids = new Set();
(meta.brawlers || []).forEach((b, i) => {
  const w = "brawler[" + i + "] " + (b.nombre || "?");
  if (!b.id || !/^[a-z0-9]+$/.test(b.id)) errs.push(w + ": id inválido");
  if (ids.has(b.id)) errs.push(w + ": id duplicado");
  ids.add(b.id);
  if (CLASSES.indexOf(b.clase) < 0) errs.push(w + ": clase inválida " + b.clase);
  if (TIERS.indexOf(b.tier) < 0) errs.push(w + ": tier inválido " + b.tier);
  if (!(b.alcance >= 1 && b.alcance <= 5)) errs.push(w + ": alcance fuera de 1-5");
  if (!Array.isArray(b.tags) || b.tags.some((t) => TAGS.indexOf(t) < 0)) errs.push(w + ": tags inválidos");
  if (b.gameId != null && !(b.gameId >= 16000000 && b.gameId < 16100000)) errs.push(w + ": gameId sospechoso");
});
const mids = new Set();
(meta.mapas || []).forEach((mp, i) => {
  const w = "mapa[" + i + "] " + (mp.nombre || "?");
  if (mids.has(mp.id)) errs.push(w + ": id duplicado");
  mids.add(mp.id);
  if (!meta.modos[mp.modo]) errs.push(w + ": modo desconocido " + mp.modo);
  if (ARQ.indexOf(mp.arquetipo) < 0) errs.push(w + ": arquetipo inválido");
  if (!Array.isArray(mp.pools) || !mp.pools.length) errs.push(w + ": sin pools");
  (mp.top || []).forEach((id) => { if (!ids.has(id)) errs.push(w + ": top contiene brawler desconocido " + id); });
  (mp.sugeridos || []).forEach((id) => { if (!ids.has(id)) errs.push(w + ": sugeridos contiene brawler desconocido " + id); });
});
Object.entries(meta.modos || {}).forEach(([k, md]) => {
  (md.mejores || []).forEach((id) => { if (!ids.has(id)) errs.push("modo " + k + ": mejores contiene " + id); });
});
(meta.counters || []).forEach((c, i) => {
  if (!ids.has(c[0]) || !ids.has(c[1])) errs.push("counters[" + i + "]: id desconocido " + c[0] + "/" + c[1]);
  if (typeof c[2] !== "number" || Math.abs(c[2]) > 1) errs.push("counters[" + i + "]: valor fuera de -1..1");
});
["ranked", "bsc"].forEach((f) => {
  const r = (meta.reglas || {})[f];
  if (!r || !Array.isArray(r.ordenPicks) || r.ordenPicks.length !== 6) errs.push("reglas." + f + ".ordenPicks debe tener 6 elementos");
});

// data/stats.json (estadísticas automáticas): opcional, pero si está debe cuadrar con meta.json
let stats = null;
const warns = [];
try { stats = JSON.parse(fs.readFileSync(path.join(root, "data/stats.json"), "utf8")); } catch (e) { warns.push("sin data/stats.json válido: el motor usará solo los tiers"); }
if (stats) {
  Object.keys(stats.brawlers || {}).forEach((id) => { if (!ids.has(id)) errs.push("stats.json: brawler desconocido " + id); });
  Object.entries(stats.mapas || {}).forEach(([k, v]) => {
    if (!mids.has(k)) errs.push("stats.json: mapa desconocido " + k);
    (v.top || []).forEach((r) => { if (!ids.has(r.id)) errs.push("stats.json: " + k + " con brawler desconocido " + r.id); });
  });
  (stats.counters || []).concat(stats.companeros || []).forEach((c) => { if (!ids.has(c[0]) || !ids.has(c[1])) errs.push("stats.json: par desconocido " + c[0] + "/" + c[1]); });
  const age = (Date.now() - Date.parse(stats.t)) / 86400e3;
  if (age > 3) warns.push("stats.json tiene " + age.toFixed(1) + " días: revisa la Action «Imágenes y datos en vivo»");
  (stats.sinId || []).forEach((n) => warns.push("brawler de seemeta sin entrada en meta.json: " + n + " (añádelo)"));
}
// Aviso (no error) si los tops de meta.json no coinciden con las estadísticas: suele indicar datos copiados a mano mal
if (stats) {
  (meta.mapas || []).forEach((mp) => {
    const sm = stats.mapas[mp.id];
    if (sm && mp.top.length && sm.top.length && mp.top[0] !== sm.top[0].id) warns.push(mp.nombre + ": el #1 de meta.json (" + mp.top[0] + ") no coincide con stats.json (" + sm.top[0].id + "); ejecuta node tools/sync-meta.js");
  });
}

if (!errs.length) {
  const Engine = require(path.join(root, "engine.js"));
  const e = new Engine(meta);
  if (stats) e.setStats(stats);
  meta.mapas.forEach((mp) => {
    const st = { format: "ranked", mapId: mp.id, firstPick: "us", bans: { us: [], them: [] }, globalBans: { us: [], them: [] }, picks: { us: [], them: [] } };
    try {
      for (let i = 0; i < 6; i++) {
        const np = e.nextPick(st);
        const r = e.recommendPicks(st, np.side, 1)[0];
        if (!r || !isFinite(r.score)) throw new Error("sin recomendación");
        st.picks[np.side][np.slot] = r.b.id;
      }
      const ev = e.evaluate(st);
      if (!(ev.win > 0 && ev.win < 1)) throw new Error("evaluación inválida");
    } catch (x) { errs.push("motor en " + mp.nombre + ": " + x.message); }
  });
}

// Diversidad: si un solo brawler encabeza las recomendaciones en casi todos los mapas, avisar
if (!errs.length) {
  const Engine = require(path.join(root, "engine.js"));
  const e = new Engine(meta);
  if (stats) e.setStats(stats);
  const cnt = {};
  let n = 0;
  meta.mapas.filter((mp) => mp.pools.indexOf("ranked") >= 0).forEach((mp) => {
    n++;
    const st = { format: "ranked", mapId: mp.id, firstPick: "us", bans: { us: [], them: [] }, picks: { us: [], them: [] } };
    const b = e.recommendBans(st, "us", 3).map((r) => r.b.id);
    st.bans.us = b;
    const r = e.recommendPicks(st, "us", 1)[0];
    cnt[r.b.id] = (cnt[r.b.id] || 0) + 1;
  });
  const top = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0];
  if (top && top[1] > n * 0.5) warns.push("tras los bloqueos recomendados, " + top[0] + " es el primer pick en " + top[1] + "/" + n + " mapas: revisa los datos");
  console.log("Primer pick tras bloqueos recomendados: " + Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => k + " " + v).join(", ") + " (" + n + " mapas)");
}

warns.forEach((w) => console.warn("⚠ " + w));
if (errs.length) { console.error("✗ " + errs.length + " errores:\n - " + errs.join("\n - ")); process.exit(1); }
console.log("✓ meta.json válido · " + meta.brawlers.length + " brawlers · " + meta.mapas.length + " mapas · v" + m.version);
