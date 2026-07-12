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
- [x] `buildEntry()` — pipeline que compone extractores + splitters
- [x] Escritor SQLite normalizado (`node:sqlite`)
- [x] Orquestador CLI (`scripts/parse-mm-definitions.mjs`)
- [x] Validación manual (~20 lemas)

### Fase 2 — Enriquecimiento vía Lucene ✅ viabilidad confirmada, en progreso

**Formato confirmado por ingeniería inversa** (índice `todo/`, `_7kh.cfs`, 137MB): formato de compound file Lucene pre-4.x (sin header de codec). Directorio: VInt fileCount, luego por archivo `{Int64 offset big-endian, String VInt-len+UTF8}`. Contiene 8 sub-archivos: `.fnm` (esquema de 36 campos), `.frq`/`.prx`/`.tii`/`.tis`/`.nrm` (índice de términos, no usados), `.fdx` (array de Int64, offset por documento), `.fdt` (campos guardados, **comprimidos con zlib/deflate**, formato `VInt numFields` + por campo `{VInt fieldNumber, byte bits, VInt len, bytes}`).

**Hallazgos clave (verificados contra el archivo real completo, 88,112 documentos, 0 fallos de inflate):**
- El índice tiene **88,102 lemas** (+10 de apéndice) contra los **37,686** que extrae el pipeline de `.txt` — más del doble. Confirmado con muestreo: 8 de 9 lemas Lucene al azar (`aarónico, -a`, `aaronita`, `ababillarse`...) no existen en el jsonl actual.
- Los nombres de campo decodificados coinciden exactamente con la tabla de este documento (`sinonimos`, `etimologia`, `areaUso`, `nivelUso`, `nombreCientifico`, `conjugacion`, `catGram`, etc.), validando el formato.
- **Los campos de texto largo (`acepcion`, `texto`, `ejemplo`, `catalogo`, `expresionesPluriverbales`) están sin puntuación** (texto analizado para búsqueda, no texto de presentación): sin puntos, sin comas, sin marcadores `©`/`O `/`/`. No se pueden reutilizar los splitters de Task 3 sobre este texto — la idea original de "Lucene reemplaza al `.txt` como fuente primaria" no es viable.
- Campos cortos sí son limpios y útiles tal cual: `etimologia` (`"| latín | | germánico |"`), `catGram` (`"| verbo transitivo |"`), `areaUso`, `nivelUso`, `nombreCientifico`, `conjugacion`, `anagrama`, `antiguo`, `desuso`, `voz`. Ninguno existe en el `.txt`.
- `sinonimos` es utilizable (lista separada por espacios) pero plana (no asociada a una acepción concreta) — menor fidelidad que la extracción por acepción que ya hace Task 2-4 sobre el `.txt`.

**Estrategia adoptada — enriquecer, no reemplazar:**
1. Las 37,686 entradas ya extraídas del `.txt` mantienen su estructura rica de Task 1-7 (acepciones numeradas, subacepciones, catálogo, expresiones) sin tocar. Se les añaden los campos cortos de Lucene (`etimologia`, `areaUso`, `nivelUso`, `nombreCientifico`, `conjugacion`, `catGram`, `anagrama`, `antiguo`, `desuso`, `voz`) emparejando por lema + número de homógrafo.
2. Los ~50,000 lemas que solo existen en Lucene se añaden como entradas nuevas con una sola acepción plana (texto de `acepcion`, sin puntuación reconstruible) más los mismos campos cortos. Se marcan con `source` distinto para diferenciarlas.
3. No se usan `sinonimos`/`catalogo`/`ejemplo`/`expresionesPluriverbales` de Lucene para reemplazar la extracción ya existente — sería una regresión de calidad ahí.

#### Task 8 — Lector Lucene CFS de bajo nivel (pendiente)
- `scripts/lib/lucene-cfs-reader.mjs`: `parseCompoundFileDirectory()`, `parseFieldNames()`, `readStoredFields()` (inflate zlib + strip prefijo `@`)
- Tests con buffers sintéticos pequeños (no contra el archivo real de 137MB)

#### Task 9 — Extractor Lucene → jsonl plano (pendiente)
- `scripts/extract-mm-lucene-to-jsonl.mjs`, mismo estilo que `extract-mm-txt-to-jsonl.mjs`
- Parsea `lema` (`"a 1"` → lemma `"a"` + homógrafo `1`), normaliza los 36 campos a un registro plano
- Salida: `data/diccionario-maria-moliner-lucene.jsonl`

#### Task 10 — Fusión: enriquecer entradas existentes + rellenar huecos (pendiente)
- Emparejar por lema+homógrafo contra `data/diccionario-maria-moliner.jsonl`
- Match → añadir columnas de enriquecimiento a la entrada existente
- Sin match → nueva entrada plana, `source` distinto
- Ampliar esquema SQLite (`entries`): columnas nullable para los campos cortos

#### Task 11 — Regenerar datos y validar contra el corpus completo (pendiente)

#### Task 12 — Conectar la app (`index.html`/`main.js`) a los datos estructurados/enriquecidos (pendiente)
Actualmente la app solo lee `definition` plano del jsonl v1; no usa nada de Fase 1. Mostrar acepciones/subacepciones/catálogo/expresiones + campos nuevos.

#### Task 13 — Probar la app en navegador (pendiente)

#### Task 14 — Mergear `parser-acepciones` a `main` (pendiente, solo tras Task 12-13)

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
- `splitExpressions(text)` — expresiones `/ FRASE. cuerpo`; escáner con seguimiento de profundidad de `()`/`[]` (no corta en puntos dentro de paréntesis) y reconoce el prefijo abreviado de 1-4 mayúsculas del lema repetido (`A. DEL ESTADO.`, `CH. CRUZADO.`) como parte de la frase, no como su fin
- Tests para cada splitter, basados en fragmentos reales del corpus (26 tests, todos verdes)
- Escaneo del corpus completo (37,792 entradas): 9,753 con múltiples acepciones, 3,330 con subacepciones, 7,339 con catálogo, 4,617 expresiones (0 crashes vía `buildEntry`). Limitación conocida y aceptada: ~0.3% de frases de expresión mal cortadas por ruido OCR que el escáner no puede resolver (frases terminadas en `!` en vez de `.`, `l.` OCR de `I.`, puntos dobles) — mismo tipo de heurística imperfecta que la de antónimos.

### Task 4 — `buildEntry()` pipeline ✅ (hecho en `parser-acepciones`)
- Compone `splitExpressions` → `splitNumberedSenses` → `splitSubsenses` → `splitCatalog` → extractores hoja (ejemplos, sinónimos, referencias cruzadas, antónimo)
- Estructura anidada: `{ senses: [{ number, definition, examples, synonyms, crossReferences, antonym, subsenses, catalog }], expressions: [{ phrase, senses }] }`
- Tests de integración con fragmentos reales (6 tests) + escaneo del corpus completo: 0 crashes, 54,340 acepciones, 4,617 expresiones generadas

### Task 5 — Escritor SQLite ✅ (hecho en `parser-acepciones`)
- Tablas: `entries`, `senses`, `subsenses`, `examples`, `catalog_items`, `synonyms`, `antonyms`, `cross_references`, `expressions`
- `node:sqlite` (built-in, `DatabaseSync`), sentencias preparadas reutilizadas por escritor (`createWriter(db)`)
- `entries.id` es un **id sustituto** (`INTEGER PRIMARY KEY AUTOINCREMENT`), no el `id` del jsonl: al insertar el corpus completo aparecieron 474 colisiones (37,792 entradas, solo 37,318 `id` únicos) — ruido OCR hace que dos lemas distintos normalicen al mismo slug (`a'` y `a”` → `a`). El `id` original se guarda como columna `source_id` (indexada, no única) para trazabilidad.
- Verificado contra el corpus completo: 0 crashes, 37,792 entradas, 59,331 acepciones (incluye las de expresiones), 4,039 subacepciones, 13,167 ejemplos, 9,920 sinónimos, 10,473 ítems de catálogo, 4,617 expresiones, ~760ms
- De paso se corrigió un bug de Task 4: `buildEntry()` descartaba el catálogo embebido dentro de una subacepción (`© ... O ...`) — afectaba a ~19% de las subacepciones (740/3,970)

### Task 6 — Orquestador CLI ✅ (hecho en `parser-acepciones`)
- `scripts/parse-mm-definitions.mjs` — mismo estilo de `parseArgs` que `extract-mm-txt-to-jsonl.mjs` (`--input`, `--output-jsonl`, `--output-sqlite`, `--limit`)
- Lee `data/diccionario-maria-moliner.jsonl`, corre `buildEntry()` por entrada dentro de una única transacción SQLite
- Genera `data/diccionario-maria-moliner-v2.jsonl` (campos originales + `senses`/`expressions`) y `data/diccionario-maria-moliner.sqlite`, ambos comprometidos al repo (igual que el v1 `.jsonl`)
- **Nota:** este worktree tiene su propio `data/diccionario-maria-moliner.jsonl` regenerado con las mejoras del extractor de Task 1 (37,686 entradas), distinto del de `main` (37,792 entradas, sin esas mejoras) — los conteos de corpus registrados en Tasks 3-5 corrían contra el de `main` (ruta `../../data/...`); la corrida real de Task 6 (por defecto, sin `--input`) usó el de este branch. Ambas corridas dieron 0 crashes; los conteos no son comparables entrada-por-entrada pero ambas validan la lógica igual.
- Corrida completa (branch-local): 0 crashes, ~1.2s, 37,686 entradas, 61,416 acepciones, 4,278 subacepciones, 14,417 ejemplos, 10,376 sinónimos, 11,016 ítems de catálogo, 5,730 expresiones

### Task 7 — Validación manual ✅ (hecho en `parser-acepciones`)
- Muestra de 20 lemas (14 elegidos por cobertura estructural + 6 al azar con espaciado uniforme) comparados a mano: texto original del `.txt` contra la salida de `buildEntry()`
- **Resultado:** 15/20 correctos sin observaciones. 2 confirman limitaciones ya documentadas (`¡ArrIBA!` cortada en `!` en vez de `.`; `l.` OCR de `I.` en `inspección`). 3 revelaron problemas reales:
  1. **[corregido]** `splitNumberedSenses` no reconocía como límite de acepción un número seguido de marca gramatical en minúscula (`5 n. Der...`, `2 m. Cosa absurda.`) — solo aceptaba mayúscula tras el número. Afectaba 2,467/37,686 entradas (6.5%). Arreglado en `ca56c73`, datos regenerados en `2c30b43`.
  2. **[pendiente, decisión de diseño]** `detectAntonymRedirect()` (Task 2) resultó 0/8 aciertos reales en todo el corpus: los 8 casos con antónimo detectado son en realidad definiciones normales que empiezan con «Contrario a X» / «Opuesto a X» como prosa (p. ej. *antinuclear* = "Contrario a la energía nuclear", no una remisión a un antónimo). El patrón textual es indistinguible de una remisión real con regex simple; no se encontró ningún caso genuino de remisión en el corpus para contrastar. Requiere decidir: quitar el campo, o buscar otra señal.
  3. **[pendiente, mayor riesgo]** Marcador de referencia cruzada `*palabra` a veces OCR'd como comilla curva suelta en vez de asterisco (visto en `bendecir`, `abandonar`). Como `extractExamples()` empareja comillas de forma tolerante a desajustes OCR (a propósito, para el caso normal), una comilla-asterisco suelta hace que trague prosa real como si fuera un ejemplo, corrompiendo la definición. Vive en código de Task 2 ya integrado; arreglarlo bien requiere repensar cómo `extractExamples` y `extractCrossReferencesAsterisk` distinguen los dos casos sin romper los tests existentes — no se tocó en esta sesión.

---

## Fuera de alcance (v1)
- `semanticField` (requiere taxonomía externa)
- Parseo de Lucene (Fase 2, solo si necesario)
- Enriquecimiento vía WordNet/OMW/ConceptNet
- Uso comercial o distribución del dato
