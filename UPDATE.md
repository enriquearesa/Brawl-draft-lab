# Procedimiento de actualización del meta

Lo ejecuta la tarea programada diaria de Claude (o tú a mano). El objetivo es que `data/meta.json` refleje siempre el meta competitivo actual sin tocar la app.

> `data/live.json` (imágenes de mapas y retratos) lo genera GitHub Actions (`.github/workflows/live.yml`) cada 6 h y cada vez que cambia `meta.json`. No lo edites a mano: si añades un mapa o brawler nuevo a `meta.json`, la Action buscará su imagen en la wiki por su nombre en inglés.

## 1. Comprobar si hay novedades

Busca en la web (usa varias búsquedas, prioriza fuentes oficiales) cualquier cambio posterior a `meta.comprobado`:

- Notas de parche o ajustes de balance de Brawl Stars (blog oficial de Supercell, cuenta oficial, medios que lo cubran).
- Brawlers nuevos lanzados (con su clase).
- Cambio de temporada (nuevo pool de mapas de Ranked).
- Cambios en el pool de mapas o reglas del BSC (rulebook de BLAST / web de esports de Brawl Stars).
- Cambios en las reglas de pick & ban de Ranked.

## 2. Si NO hay novedades

- Actualiza solo `meta.comprobado` (ISO 8601 con zona horaria, p. ej. `2026-11-10T12:45:00+01:00`).
- Si `meta.revisionCompleta` tiene más de 6 días, haz igualmente el paso 3 (refresco semanal de estadísticas): el meta se mueve aunque no haya parche.
- Si no, commit `chore: comprobación diaria del meta` y push. Fin.

## 3. Si HAY novedades (o toca refresco semanal)

Actualiza solo lo que haya cambiado:

| Qué | Dónde | Fuente recomendada |
|---|---|---|
| Tier global de cada brawler (`S+`…`D`) | `brawlers[].tier` | seemeta.com/en/brawl-stars/tier-list (datos de Ranked) |
| Top 5 por mapa, en orden | `mapas[].top` (+ `fuenteTop`) | seemeta.com/en/brawl-stars/maps (solo mapas con etiqueta *Ranked*) |
| Pool de mapas Ranked | `mapas[].pools` incluye `"ranked"` | mapas etiquetados *Ranked* en seemeta / notas de temporada |
| Pool BSC | `mapas[].pools` incluye `"bsc"` | rulebook BSC vigente |
| Mejores por modo | `modos.<modo>.mejores` | seemeta, sección "best by mode" |
| Brawler nuevo | añadir a `brawlers` | clase, alcance (1-5), tags, `tier: "?"` si no hay datos, `gameId: null` si no se conoce |
| Mapa nuevo | añadir a `mapas` | `arquetipo` (abierto/mixto/cerrado), `arbustos`, `modo` |
| Counters notables | `counters` `[a, b, ventaja -1..1, nota]` | solo matchups muy claros |

Reglas:

- `id` de brawler/mapa = nombre en minúsculas sin espacios ni símbolos (`Mr. P` → `mrp`, `Larry & Lawrie` → `larrylawrie`).
- Mantén una línea por brawler y por mapa (diffs legibles).
- No borres brawlers: si uno sale del juego, déjalo con tier `D`.
- Mapas que salen de Ranked: quita `"ranked"` de `pools` (si no queda ningún pool, deja `["archivo"]`).
- Sube `meta.version` en +1, actualiza `fechaDatos`, `comprobado`, `revisionCompleta`, `parche`, `temporada` y `avisos` según toque.
- Añade una entrada al final de `changelog`: `{"fecha": "AAAA-MM-DD", "resumen": "...", "cambios": ["...", "..."]}`. Escribe en español.
- Añade las fuentes nuevas a `meta.fuentes` (máx. 8, quita las más viejas).

## 4. Validar y publicar

```bash
node tools/validate.js
```

Si falla, corrige el JSON hasta que pase. **Nunca hagas push de un meta.json que no valide.** Después:

```bash
git add data/meta.json
git commit -m "meta: <resumen corto>"
git push origin main
```

GitHub Pages publica el cambio en 1-2 minutos. La app lee `data/meta.json` sin caché, así que el usuario ve el meta nuevo al recargar.
