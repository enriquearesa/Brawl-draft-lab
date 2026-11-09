#!/usr/bin/env node
/* Copia a data/meta.json lo que ya está medido en data/stats.json, para que no haya que pasarlo a mano:
     - tier de cada brawler
     - top 5 de cada mapa con estadísticas (y quita la marca "nuevo")
   Mantiene el formato de una línea por brawler y por mapa. No toca nada más (cabecera, changelog…).
   Uso: node tools/sync-meta.js   → después, node tools/validate.js */
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const P = path.join(root, "data/meta.json");
const stats = JSON.parse(fs.readFileSync(path.join(root, "data/stats.json"), "utf8"));
const fuente = "seemeta Competitivo" + (stats.periodo ? " · " + stats.periodo : "");
const cambios = [];

const out = fs.readFileSync(P, "utf8").split("\n").map((line) => {
  const m = line.match(/^(\s*)(\{"id".*\})(,?)\s*$/);
  if (!m) return line;
  const o = JSON.parse(m[2]);
  if (o.clase) {
    const s = stats.brawlers[o.id];
    if (s && s.tier !== o.tier) { cambios.push(o.nombre + " " + o.tier + "→" + s.tier); o.tier = s.tier; }
  } else if (o.modo && stats.mapas[o.id]) {
    const top = stats.mapas[o.id].top.slice(0, 5).map((r) => r.id);
    if (top.length && top.join() !== (o.top || []).join()) { cambios.push(o.nombre + ": " + top.join(", ")); o.top = top; o.fuenteTop = fuente; delete o.nuevo; }
  } else return line;
  return m[1] + JSON.stringify(o).replace(/","/g, '", "').replace(/":/g, '": ').replace(/,"/g, ', "') + m[3];
});
fs.writeFileSync(P, out.join("\n"));
console.log(cambios.length ? "✓ " + cambios.length + " cambios:\n - " + cambios.join("\n - ") : "✓ meta.json ya coincide con stats.json");
