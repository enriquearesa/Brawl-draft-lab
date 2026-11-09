# DRAFT LAB · Brawl Stars

Asistente visual de pick & ban para Brawl Stars (Ranked y formato pro del BSC). Marca lo que pasa en tu draft y te recomienda bans y picks en cada turno, con un plan de partida al final.

**Web:** https://enriquearesa.github.io/brawl-draft-lab/

## Cómo funciona

- `data/meta.json`: el meta (brawlers, tiers, mapas de Ranked y BSC, top por mapa, reglas de draft). Se actualiza solo cada día con una tarea programada de Claude siguiendo [`UPDATE.md`](UPDATE.md).
- `engine.js`: motor de recomendación local e instantáneo (fuerza en el mapa, counters, riesgo de counter, sinergia, pool personal).
- `app.js` + `index.html`: interfaz.
- Imágenes de brawlers y mapas desde el CDN público de Brawlify; si la API de Brawlify responde, la app también usa sus win rates por mapa en vivo y detecta brawlers nuevos.

## Comprobar el meta a mano

```bash
node tools/validate.js
```

No afiliado a Supercell. Contenido de fans según la Fan Content Policy de Supercell.
