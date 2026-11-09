#!/usr/bin/env node
/* Descarga datos en vivo de Brawlify (IDs de imágenes de brawlers y mapas + win rates por mapa)
   y los guarda en data/live.json. Lo ejecuta GitHub Actions (.github/workflows/live.yml),
   porque el navegador no puede llamar a la API de Brawlify directamente (CORS). */
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const API = "https://api.brawlify.com/v1";
const CDN = "https://cdn.brawlify.com";
const UA = { "User-Agent": "DraftLab/1.0 (+https://github.com/enriquearesa/Brawl-draft-lab)", Accept: "application/json" };
const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[^a-z0-9]/g, "");
const listOf = (j) => (j && (j.list || j.items || (Array.isArray(j) ? j : null))) || [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { headers: UA });
      if (r.ok) return await r.json();
      console.warn(url, "→", r.status);
    } catch (e) { console.warn(url, "→", e.message); }
    await sleep(1500 * (i + 1));
  }
  return null;
}

(async () => {
  const meta = JSON.parse(fs.readFileSync(path.join(root, "data/meta.json"), "utf8"));
  const [bj, mj] = await Promise.all([get(API + "/brawlers"), get(API + "/maps")]);
  const brawlers = listOf(bj).map((x) => ({ id: x.id, name: x.name, cls: x.class && x.class.name })).filter((x) => x.id && x.name);
  const allMaps = listOf(mj);
  if (!brawlers.length && !allMaps.length) { console.error("Brawlify no devolvió datos"); process.exit(1); }

  const maps = [];
  const stats = {};
  for (const m of meta.mapas) {
    const modeEn = norm((meta.modos[m.modo] || {}).en);
    const cands = allMaps.filter((x) => norm(x.name) === norm(m.nombre));
    if (!cands.length) { console.warn("Sin coincidencia en Brawlify:", m.nombre); continue; }
    cands.sort((a, b) => {
      const ma = norm(a.gameMode && a.gameMode.name) === modeEn ? 0 : 1;
      const mb = norm(b.gameMode && b.gameMode.name) === modeEn ? 0 : 1;
      return ma - mb || (a.disabled ? 1 : 0) - (b.disabled ? 1 : 0) || String(b.lastActive || "").localeCompare(String(a.lastActive || ""));
    });
    const x = cands[0];
    maps.push({ id: x.id, name: m.nombre, mapId: m.id, img: x.imageUrl || CDN + "/maps/regular/" + x.id + ".png" });
    const d = await get(API + "/maps/" + x.id);
    const arr = (d && (d.stats || (d.map && d.map.stats))) || [];
    const s = {};
    arr.forEach((y) => {
      const id = y.brawler || y.brawlerId || y.id;
      const wr = y.winRate != null ? y.winRate : y.winrate;
      if (id && wr != null) s[id] = { wr: Math.round(+wr * 10) / 10, use: Math.round(+(y.useRate || 0) * 100) / 100 };
    });
    if (Object.keys(s).length) stats[m.id] = s;
    await sleep(250);
  }

  const out = { t: new Date().toISOString(), fuente: "api.brawlify.com", brawlers, maps, stats };
  fs.writeFileSync(path.join(root, "data/live.json"), JSON.stringify(out) + "\n");
  console.log("✓ live.json · " + brawlers.length + " brawlers · " + maps.length + "/" + meta.mapas.length + " mapas con imagen · " + Object.keys(stats).length + " con estadísticas");
})();
