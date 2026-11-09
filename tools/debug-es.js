// Diagnóstico temporal: candidatos de nombre en español para revisión manual
const meta = require("../data/meta.json");
const UA = { "User-Agent": "DraftLab/1.0 (https://github.com/enriquearesa/Brawl-draft-lab; fan tool)" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const live = require("../data/live.json");
(async () => {
  const r = await fetch("https://seemeta.com/es/brawl-stars/map-rotation", { headers: UA });
  const html = await r.text();
  const i = html.indexOf("Patata");
  console.log("ROT:", i, JSON.stringify(html.slice(Math.max(0, i - 600), i + 200)));
  for (const m of meta.mapas.filter((x) => !x.nombreEs && !(live.es || {})[x.id])) {
    const j = await (await fetch("https://brawlstars.fandom.com/es/api.php?action=query&format=json&list=search&srlimit=4&srprop=snippet&srsearch=" + encodeURIComponent('"' + m.nombre + '"'), { headers: UA })).json().catch(() => null);
    const hits = ((j && j.query && j.query.search) || []).map((h) => h.title + " ~ " + h.snippet.replace(/<[^>]+>/g, "").slice(0, 90));
    console.log("ES:", m.nombre, "=>", JSON.stringify(hits));
    await sleep(1000);
  }
})();
