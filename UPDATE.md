# Procedimiento de actualización del meta

Lo ejecuta la tarea programada diaria de Claude (o tú a mano). El objetivo es que `data/meta.json` refleje siempre el meta competitivo actual sin tocar la app.

> **Lo automático (no lo edites a mano).** GitHub Actions (`.github/workflows/live.yml`) se ejecuta cada 6 h y cada vez que cambia `meta.json`:
> - `data/stats.json` ← `tools/fetch-meta.js`: estadísticas reales de Competitivo de seemeta (win rate y % de pick por brawler y por mapa, counters y compañeros medidos). **Es lo que más pesa en las recomendaciones.** Si seemeta cambia de formato, el script no sobrescribe el archivo bueno y la app avisa cuando tiene más de 3 días.
> - `data/live.json` ← `tools/fetch-live.js`: imágenes de mapas y retratos (API pública de Brawlify `api.brawlapi.com` + wiki). Si añades un mapa o brawler nuevo a `meta.json`, la Action buscará su imagen por su nombre en inglés.
>
> `meta.json` es el respaldo (mapas nuevos sin datos, brawlers recién salidos) y lo que no se puede medir: clases, reglas, pools, alcance, tags.

## 0. Reglas de veracidad (obligatorias)

- **Nada sin fuente.** Cada línea de `changelog` y `avisos` tiene que poder señalarse en una fuente concreta (notas oficiales, seemeta, medio que cite las notas). No escribas interpretaciones como «rework», «domina», «roto» si la fuente no lo dice: describe el cambio («Buffie de Mr. P: Service Bell +114 daño y +740 vida al portero»).
- **Tiers y tops no se copian a mano:** ejecuta `node tools/sync-meta.js`, que los toma de `data/stats.json`. Solo edita `top` a mano en mapas sin estadísticas (los nuevos), y entonces usa `sugeridos`, no `top`.
- **Popular ≠ fuerte.** seemeta separa win rate y % de pick; no subas el tier de un brawler porque se elija mucho.
- Si `data/stats.json` tiene más de 3 días, **no lo arregles editando el JSON**: mira el log de la Action «Imágenes y datos en vivo» y avisa en `avisos`.

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
| Tier global de cada brawler (`S+`…`F`) y top 5 por mapa | `brawlers[].tier`, `mapas[].top` | **automático:** `node tools/sync-meta.js` (desde `data/stats.json`) |
| Pool de mapas Ranked | `mapas[].pools` incluye `"ranked"` | mapas etiquetados *Ranked* en seemeta / notas de temporada |
| Pool BSC | `mapas[].pools` incluye `"bsc"` | rulebook BSC vigente |
| Mejores por modo | `modos.<modo>.mejores` | seemeta, sección "best by mode" |
| Brawler nuevo | añadir a `brawlers` | clase, alcance (1-5), tags, `tier: "?"` si no hay datos, `gameId: null` si no se conoce |
| Mapa nuevo | añadir a `mapas` | `nombre` (inglés), `nombreEs` (nombre oficial en español si aparece en las notas oficiales en español), `arquetipo` (abierto/mixto/cerrado), `arbustos`, `modo`; si aún no hay estadísticas, `top: []` y `sugeridos` con 3 brawlers recomendados por guías |
| Counters notables | `counters` `[a, b, ventaja -1..1, nota]` | solo matchups de mecánica muy claros que las estadísticas no recojan (los medidos ya vienen en `stats.json`) |

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
node tools/sync-meta.js
node tools/validate.js
```

Lee también los avisos (⚠) de `validate.js`: datos viejos, brawlers de seemeta que faltan en `meta.json` o un mismo brawler como primer pick en más de la mitad de los mapas.

Si falla, corrige el JSON hasta que pase. **Nunca hagas push de un meta.json que no valide.** Después:

```bash
git add data/meta.json
git commit -m "meta: <resumen corto>"
git push origin main
```

GitHub Pages publica el cambio en 1-2 minutos. La app lee `data/meta.json` sin caché, así que el usuario ve el meta nuevo al recargar.
