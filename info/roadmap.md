# ROADMAP

## Estrategia general: construir vs reutilizar

No sobre-invertir en infraestructura antes de validar valor. Ya existen recursos fragmentados en español (RAE, Wiktionary, ConceptNet, WordNet, OMW); el objetivo no es reconstruirlos sino integrar lo mínimo útil.

**Decisión:** empezar pequeño (SQLite + JSON/JSONL, consulta local, web mínima), escalar (API, relaciones más ricas, grafo) solo si hay tiempo sostenido, continuidad y el MVP ya demostró utilidad.

## Flujo de trabajo

El desarrollo activo se realiza en **worktrees** separados de `main`. Cada worktree implementa una feature o fase del roadmap. Cuando el trabajo en un worktree está completo y estable (tests verdes, datos regenerados), se **mergea a `main`** para integrarlo.

**Worktrees activos:**
- `parser-acepciones` — Fase 1 del parser de acepciones (extractor mejorado + segmenter)

**Regla:** nunca trabajar directamente en `main` salvo para docs o fixes urgentes. Todo avance significativo va en un worktree, se prueba ahí, y luego se mergea.

---

## Fuentes de datos disponibles

### A) `diccionario-maria-moliner.txt` (texto plano OCR)
- **37,792 entradas** extraídas a `data/diccionario-maria-moliner.jsonl`
- Contiene: `lemma`, `types`, `definition` (texto plano con marcadores tipográficos)
- **Sinónimos:** embebidos en `definition` con marcador `= palabra.` — extraíbles vía regex
- **Antónimos:** solo como prosa (`Opuesto a X.` / `Contrario de X.`) — heurística, no 100% fiable
- **Referencias cruzadas:** con `*palabra` y `V. PALABRA`
- **Catálogo/afines:** con `O ` (bullet)
- **Expresiones:** con `/` como separador
- **NO tiene:** `etimologia`, `areaUso`, `nivelUso`, `nombreCientifico`, `conjugacion`

### B) Índices Lucene (`data/Diccionario_Maria_Moliner_3a_ed/Setup/index/`)
15 índices en formato Lucene `.cfs` (archivos compuestos). El más importante es **`todo/`** (137 MB) que indexa el texto completo con **campos estructurados**:

| Campo Lucene               | ¿En `.txt`?  | Descripción                           |
|----------------------------|--------------|---------------------------------------|
| `sinonimos`                | ⚠️ embebido   | Lista limpia de sinónimos             |
| `acepcion`                 | ⚠️ embebido   | Acepciones numeradas                  |
| `catalogo`                 | ⚠️ embebido   | Catálogo/afines                       |
| `expresionesPluriverbales` | ⚠️ embebido   | Expresiones                           |
| `epigrafe`                 | ⚠️ embebido   | Referencias cruzadas                  |
| `ejemplo`                  | ⚠️ embebido   | Ejemplos de uso                       |
| `etimologia`               | ❌ no existe  | Etimología de la palabra              |
| `areaUso`                  | ❌ no existe  | Área geográfica/temática              |
| `nivelUso`                 | ❌ no existe  | Nivel de uso (culto, vulgar, etc.)    |
| `nombreCientifico`         | ❌ no existe  | Nombre científico (plantas, animales) |
| `conjugacion`              | ❌ no existe  | Conjugación verbal                    |
| `notasUso`                 | ❌ no existe  | Notas gramaticales/de uso             |
| `catGram`                  | ✅ en `types` | Categoría gramatical                  |
| `anagrama`                 | ❌ no existe  | Anagramas                             |
| `antiguo`                  | ❌ no existe  | Formas antiguas/en desuso             |
| `voz`                      | ❌ no existe  | Voz activa/pasiva                     |
| `desuso`                   | ❌ no existe  | Marca de desuso                       |
| `texto`                    | ✅ completo   | Texto completo de la entrada          |
| `lema` / `lemaSimple`      | ✅            | Lema y variantes                      |

**Conclusión:** el Lucene tiene ~10 campos que el `.txt` **no tiene**. No hay campo `antonimo` ni en Lucene ni en el `.txt` — los antónimos solo existen como prosa descriptiva.

---

## Estado actual del desarrollo

### Rama `main` — extractor base
- `scripts/extract-mm-txt-to-jsonl.mjs` — extrae `data/diccionario-maria-moliner.jsonl` desde el `.txt`
- `data/diccionario-maria-moliner.jsonl` — 37,797 entradas con `{id, lemma, types, initialMeta, header, definition, source, startLine, endLine}`

### Worktree `parser-acepciones` — avances reales (5 commits ahead)
- `scripts/extract-mm-txt-to-jsonl.mjs` — mejorado con:
  - Page-break fix (`splitIntoBlocks` con lookahead)
  - `looksLikeEntryStart()` — detección robusta de inicio de entrada
  - `joinLookaheadWindow()` — ventana de contexto para decisiones
  - Filtro de scan-noise lines
- `scripts/extract-mm-txt-to-jsonl.test.mjs` — tests del extractor
- `scripts/lib/mm-segmenter.mjs` — extractores de texto hoja:
  - `extractExamples()` — extrae ejemplos entre comillas
  - `extractSynonyms()` — extrae sinónimos tras `=`
  - `extractCrossReferencesAsterisk()` — extrae referencias con `*`
  - `extractCrossReferencesVease()` — extrae referencias `V. PALABRA`
  - `detectAntonymRedirect()` — heurística de antónimos (`Opuesto a X.`)
  - `stripEnclosingQuotes()` — limpia comillas envolventes
- `scripts/lib/mm-segmenter.test.mjs` — tests del segmenter

---

## Problema actual: límites del `.txt`

Los sinónimos y antónimos en el `.txt` están **embebidos en prosa** con marcadores tipográficos, no como campos limpios:

- **Sinónimos:** `= Soltar.` o `= Dejado, desastrado, descuidado, desidioso.` — extraíbles pero mezclados con el texto
- **Antónimos:** solo frases como `Opuesto a bueno.` / `Contrario de rápido.` — heurística frágil, no hay campo dedicado
- **Campo semántico:** no existe en ninguna fuente (requeriría WordNet/ConceptNet externo)

El Lucene tiene `sinonimos` como campo limpio, pero parsear Lucene es complejo (formato binario `.cfs` con segmentos `.fdt`, `.frq`, `.prx`, `.tii`, `.tis`).

---

## Estrategia revisada: híbrida por fases

### Fase 1 — Completar parser sobre `.txt` (en progreso en `parser-acepciones`)
Extraer del texto plano todo lo que se pueda con regex. Ya implementado:
- [x] Fix page-break bug en `splitIntoBlocks`
- [x] `looksLikeEntryStart` robusto
- [x] Extractores hoja: ejemplos, sinónimos, referencias cruzadas, antónimos (heurística)
- [x] Splitters estructurales: acepciones numeradas, subacepciones (`©`), catálogo (`O `), expresiones (`/`)
- [ ] `buildEntry()` — pipeline que compone extractores + splitters
- [ ] Escritor SQLite normalizado (`node:sqlite`)
- [ ] Orquestador CLI (`scripts/parse-mm-definitions.mjs`)
- [ ] Validación manual (~20 lemas)

### Fase 2 — Parsear Lucene (si se necesita más precisión)
Si los sinónimos extraídos del `.txt` no son suficientemente limpios, parsear el índice `todo/` para obtener `sinonimos`, `etimologia`, `areaUso`, `nivelUso`, `nombreCientifico`, `conjugacion`.

**Formato Lucene `.cfs`:** archivo compuesto que contiene:
- `.fnm` — nombres de campos
- `.fdt` — datos de campo (texto)
- `.frq` — frecuencias de términos
- `.prx` — posiciones de términos
- `.tii` / `.tis` — índice de términos
- `.nrm` — normas de campo

Estrategia propuesta: buscar librería Node.js que lea Lucene índices, o implementar parser mínimo para `.fdt` (datos de campo) que es donde está el texto estructurado.

### Fase 3 — Enriquecimiento externo (póst-MVP)
- `semanticField` vía WordNet/ConceptNet/OMW
- Relaciones semánticas adicionales
- API y visualización en grafo

---

## Plan de implementación detallado (Fase 1)

### Task 1 — Fix extractor base ✅ (hecho en `parser-acepciones`)
- Page-break bug corregido
- `looksLikeEntryStart` implementado
- `joinLookaheadWindow` implementado
- Tests pasando

### Task 2 — Extractores de texto ✅ (hecho en `parser-acepciones`)
- `extractExamples()` ✅
- `extractSynonyms()` ✅
- `extractCrossReferencesAsterisk()` ✅
- `extractCrossReferencesVease()` ✅
- `detectAntonymRedirect()` ✅
- `stripEnclosingQuotes()` ✅

### Task 3 — Splitters estructurales ✅ (hecho en `parser-acepciones`)
- `splitNumberedSenses(text)` — acepciones numeradas (número tras `. `, o número inicial explícito). No confunde números dentro de ejemplos citados (solo separa tras límite de frase).
- `splitSubsenses(text)` — subacepciones con `©`
- `splitCatalog(text)` — catálogo con `O ` (tras `. ` o `, `)
- `splitExpressions(text)` — expresiones `/ FRASE. cuerpo`, tolera OCR mixed-case en la frase
- Tests para cada splitter, basados en fragmentos reales del corpus (23 tests, todos verdes)
- Escaneo del corpus completo (37,792 entradas): 9,753 con múltiples acepciones, 3,330 con subacepciones, 7,339 con catálogo, 1,859 con expresiones. Falsos positivos encontrados solo en entradas ya truncadas por el límite conocido (16 fragmentos garbage, ver commit `6b8e1d7`) — no son bugs nuevos de los splitters.

### Task 4 — `buildEntry()` pipeline (pendiente)
- Componer extractores + splitters
- Generar estructura anidada: `{ senses: [{ number, definition, examples, synonyms, subsenses: [...], catalog: [...], crossReferences: [...] }] }`
- Tests de integración

### Task 5 — Escritor SQLite (pendiente)
- Tablas: `entries`, `senses`, `subsenses`, `examples`, `catalog_items`, `synonyms`, `antonyms`, `cross_references`, `expressions`
- Usar `node:sqlite` (built-in)

### Task 6 — Orquestador CLI (pendiente)
- `scripts/parse-mm-definitions.mjs`
- Lee `data/diccionario-maria-moliner.jsonl`
- Genera `data/diccionario-maria-moliner-v2.jsonl` y `data/diccionario-maria-moliner.sqlite`

### Task 7 — Validación manual (pendiente)
- Muestra de ~20 lemas contra el `.txt` original
- Registrar resultados

---

## Fuera de alcance (v1)
- `semanticField` (requiere taxonomía externa)
- Parseo de Lucene (Fase 2, solo si necesario)
- Enriquecimiento vía WordNet/OMW/ConceptNet
- Uso comercial o distribución del dato
