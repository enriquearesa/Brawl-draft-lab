# DRAFT LAB · Brawl Stars

Asistente visual de pick & ban para Brawl Stars (Ranked y formato pro del BSC). Marca lo que pasa en tu draft y te recomienda bans y picks en cada turno, con un plan de partida al final.

**Web:** https://enriquearesa.github.io/Brawl-draft-lab/

## Cómo funciona

- `data/stats.json`: estadísticas reales de Competitivo (win rate y % de pick por brawler y mapa, counters y compañeros medidos). Lo genera GitHub Actions cada 6 h con `tools/fetch-meta.js` (fuente: seemeta, todos los rangos).
- `data/meta.json`: lo que no se mide (clases, alcance, mapas, pools, reglas de draft) y el respaldo de tiers para mapas sin datos. Se revisa cada día con una tarea programada de Claude siguiendo [`UPDATE.md`](UPDATE.md); `tools/sync-meta.js` copia tiers y tops desde `stats.json`.
- `engine.js`: motor de recomendación local e instantáneo (win rate medido en el mapa, % de pick, counters y compañeros medidos, riesgo de counter, sinergia, pool personal).
- `app.js` + `index.html`: interfaz.
- Imágenes de brawlers y mapas desde el CDN público de Brawlify y la wiki; la API pública de Brawlify (`api.brawlapi.com`) sirve para detectar brawlers nuevos.

## Comprobar el meta a mano

```bash
node tools/validate.js
```

No afiliado a Supercell. Contenido de fans según la Fan Content Policy de Supercell.
