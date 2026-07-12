# ROADMAP

## Estrategia general: construir vs reutilizar

No sobre-invertir en infraestructura antes de validar valor. Ya existen recursos fragmentados en español (RAE, Wiktionary, ConceptNet, WordNet, OMW); el objetivo no es reconstruirlos sino integrar lo mínimo útil.

**Decisión:** empezar pequeño (SQLite + JSON/JSONL, consulta local, web mínima), escalar (API, relaciones más ricas, grafo) solo si hay tiempo sostenido, continuidad y el MVP ya demostró utilidad.

## Extracción de datos — histórico

Enfoque inicial explorado: parsear los índices Lucene de `Setup/index` (15 índices, 91,752 entradas: `lemas/`, `gentilicios/`, `toponimos/`, `Gramatica/`, `exprePlu2/`, etc.) descomprimiendo el formato binario `.cfs`, con fallback a parsear `diccionario-maria-moliner.txt` línea a línea.

**Superado:** se optó directamente por el fallback. `scripts/extract-mm-txt-to-jsonl.mjs` ya extrae `data/diccionario-maria-moliner.jsonl` (37,792 entradas) desde el `.txt`, sin pasar por Lucene.

## Parser de acepciones DUE (activo)

Tarea: convertir el campo `definition` (texto plano) de `data/diccionario-maria-moliner.jsonl` en estructura de acepciones/sinónimos/catálogo/antónimos/expresiones. Fuente completa del diseño (marcadores auditados contra texto real, esquema JSON, arquitectura del parser, esquema SQLite): historial de git, commit `6b6df63` (`roadmap/parser-acepciones-diseno.md`, ahora eliminado tras consolidar aquí).

**Convención:** claves JSON / columnas SQL en inglés (`definition`, `number`, `synonyms`, `antonyms`, `crossReferences`, `expressions`, `semanticField`), consistente con el extractor existente.

**Bug a corregir primero:** `splitIntoBlocks` en `scripts/extract-mm-txt-to-jsonl.mjs` corta entradas en los números de página sueltos que aparecen en medio de una entrada (~1439 casos) — afecta sobre todo a entradas largas (catálogos, subacepciones), que son las que más importan para este parser.

**Marcadores DUE identificados:** `=` (sinónimos), `` ` `` (complemento directo), `[...]`/`[o...]` (opcional/alternativa), `©` (subacepción), `O ` (bullet de catálogo/afines), `*palabra` (referencia cruzada), `/` (separador de expresión pluriverbal, con resolución de abreviatura de lema), `V. PALABRA` fuera de expresión (referencia "véase"), antónimos solo por heurística de prosa restringida (`Opuesto a X.` / `Contrario de X.` / `Contrario a X.`, patrón de definición completa, no búsqueda libre).

**Arquitectura:** dos fases (tokenizar con regex combinado → construir árbol), sin dependencias nuevas, `node:sqlite` built-in. Tablas: `entries`, `senses`, `subsenses`, `examples`, `catalog_items`, `synonyms`, `antonyms`, `cross_references`, `expressions`. Salidas: `data/diccionario-maria-moliner.jsonl` (regenerado con fix), `data/diccionario-maria-moliner-v2.jsonl` (nuevo, anidado), `data/diccionario-maria-moliner.sqlite` (nuevo).

**Estado real (verificado en repo):** ningún paso implementado todavía — `scripts/lib/` no existe, no hay `v2.jsonl` ni `.sqlite`. Solo existe `scripts/extract-mm-txt-to-jsonl.mjs` (v1, sin el fix de página).

**Plan de implementación (existía como plan TDD detallado de 7 tasks, ahora eliminado tras consolidar aquí — replanificar antes de retomar):**
1. Fix del bug de página en el extractor.
2. Extractores de texto: ejemplos, sinónimos, referencias cruzadas, heurística de antónimos.
3. Splitters estructurales: acepciones numeradas, subacepciones (`©`), catálogo (`O `), expresiones (`/`).
4. `buildEntry()` — pipeline que compone 2+3 según el esquema destino.
5. Escritor SQLite normalizado.
6. Orquestador CLI (`scripts/parse-mm-definitions.mjs`) + corrida sobre el corpus completo.
7. Validación manual contra el `.txt` original (muestra de ~20 lemas) + registrar resultados + actualizar `AI+PC/TODO.md`.

**Fuera de alcance (v1):** `semanticField` (requiere taxonomía externa), enriquecimiento vía WordNet/OMW/ConceptNet (solo si esta versión se queda corta), uso comercial o distribución del dato.
