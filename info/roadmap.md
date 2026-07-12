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

### Fase 2 — Enriquecimiento vía Lucene ✅ completa, mergeada a `main`

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

#### Task 8 — Lector Lucene CFS de bajo nivel ✅ (hecho en `parser-acepciones`)
- `scripts/lib/lucene-cfs-reader.mjs`: `parseCompoundFileDirectory()`, `parseFieldNames()`, `readStoredFields()` (inflate zlib solo si `bits & FIELD_IS_COMPRESSED`, verificado: en este archivo esa bandera está siempre activa — valores de `bits` vistos: `4`/`5`)
- Tests con buffers sintéticos pequeños (5 tests), sin depender del archivo real de 137MB
- Verificado contra el archivo real: 88,112 documentos decodificados en ~7.5s, 0 errores

#### Task 9 — Extractor Lucene → jsonl plano ✅ (hecho en `parser-acepciones`)
- `scripts/extract-mm-lucene-to-jsonl.mjs`, mismo estilo que `extract-mm-txt-to-jsonl.mjs`; reutiliza `makeId()` (exportado desde ese archivo) para que los ids coincidan entre ambas fuentes
- Parsea `lema` (`"a 1"` → lemma `"a"` + homógrafo `1`), separa campos `|`-delimitados en arrays, trata `antiguo`/`desuso` como booleanos, limpia el sentinela `@`
- Salida: `data/diccionario-maria-moliner-lucene.jsonl` — 88,112 entradas, 26,980 con etimología, 15,915 con sinónimos, 10,612 con área de uso, 6,770 con nivel de uso, 2,644 con nombre científico, 985 con conjugación; solo 1 con definición vacía

#### Task 10 — Fusión: enriquecer entradas existentes + rellenar huecos ✅ (hecho en `parser-acepciones`)
- `matchLuceneToTxtEntries()`: agrupa por id y empareja homógrafos por posición dentro del grupo (ambas fuentes preservan el orden alfabético del diccionario original, así que la posición es más fiable que el número de homógrafo, que no siempre está presente en ambos lados). Verificado contra el corpus completo: 35,957/37,686 emparejados (95.4%), solo 323 con diferencia de lema entre fuentes (ruido de normalización esperado: acentos, comillas OCR, guiones de prefijo)
- `entries` ganó columnas nullable: `etimologia`, `area_uso`, `nivel_uso`, `cat_gram`, `nombre_cientifico`, `conjugacion`, `notas_uso`, `voz`, `anagrama`, `antiguo`, `desuso`, `sinonimos_lucene` (arrays como JSON text, igual que `types`)
- `buildGapFillRecord()` envuelve un registro Lucene-only en la misma forma que `buildEntry()`/`insertEntry()` esperan; al no tener puntuación no hay nada que dividir, así que produce una sola acepción plana — comportamiento correcto y esperado, no un bug
- Verificado contra el corpus completo: **89,841 entradas totales** (37,686 `.txt`, 35,957 de ellas enriquecidas + 52,155 nuevas de Lucene), 2.7s, 0 crashes. Caso de control (`a` 2, preposición, 23 acepciones): mantiene su estructura Fase 1 intacta y recibe `etimologia`/`catGram`/`notasUso` del homógrafo correcto

#### Task 11 — Regenerar datos y validar contra el corpus completo ✅
Validación ya cubierta dentro de Task 8-10 (0 crashes en cada etapa, conteos cruzados verificados de forma independiente en cada paso). Sin hallazgos nuevos que registrar.

#### Task 12 — Conectar la app a los datos estructurados/enriquecidos ✅ (hecho en `parser-acepciones`)
- **Cambio de arquitectura necesario:** el v2 jsonl con Fase 2 pesa 73MB — inviable para `fetch()` completo en el navegador (el v1 ya era pesado a 13MB, pero 73MB cruza a "roto", no solo "no óptimo"). Se decidió con el usuario: servidor local mínimo en vez de sitio estático.
- `scripts/lib/mm-sqlite-reader.mjs` — `searchEntries()` (prefijo de lema, para autocompletar) y `getEntryDetail()` (reconstruye la entrada completa: acepciones, subacepciones, catálogo, expresiones, enriquecimiento) consultando SQLite bajo demanda. TDD'd vía round-trip escritor→lector.
- `server.mjs` — `node:http` + `node:sqlite` puro, sin dependencias nuevas. Sirve los archivos estáticos y `GET /api/search?q=`, `GET /api/entry/:id`.
- `main.js`/`style.css` reescritos: búsqueda con debounce contra `/api/search`, panel de resultado con acepciones numeradas, subacepciones anidadas, ejemplos, sinónimos, referencias cruzadas, antónimo, catálogo, expresiones con sus propias acepciones, y panel de enriquecimiento Lucene (etimología, categoría, área/nivel de uso, nombre científico, conjugación, notas de uso, sinónimos).

#### Task 13 — Probar la app en navegador ✅
Probado con Chrome DevTools MCP contra el servidor real: búsqueda (debounce + botón Buscar), entrada rica con subacepción+sinónimos (`ademán`), entrada con catálogo (`ánima`), entrada con expresiones (`abogado, -a` — confirma visualmente el fix de `A. DEL EstaDo` de Task 3), entrada plana de Lucene (`aaronita`), búsqueda sin resultados. 0 errores de consola (solo el 404 automático del favicon del navegador). Confirmado visualmente el límite ya documentado de `sinonimosLucene` (fragmenta frases multi-palabra al no tener delimitador — ver `ánima`).

#### Task 14 — Mergear `parser-acepciones` a `main` ✅
- Probado el merge en seco con `git merge-tree` antes de tocar nada — encontró conflictos reales que un `git merge` a ciegas habría resuelto mal
- Conflictos resueltos: `data/diccionario-maria-moliner.jsonl` → versión de `parser-acepciones` (37,686 entradas con los fixes de Task 1; la de `main`, 37,792, no los tenía). `data/sample/*` → se aceptó el borrado (fixtures de prototipo ya marcadas obsoletas en un commit previo del propio branch). `info/sources.md` → se mantuvo la versión de `main` (evolución del `roadmap/ref.md` que `parser-acepciones` había borrado antes de que existiera esa reorganización)
- Verificado tras el merge: 81/81 tests, servidor arrancado en `main` y probado contra la base de datos real

#### Task 15 — Corrección de bugs de calidad de datos (post-Fase 2) ✅ (hecho directamente en `main`, cambios sin commitear)
Origen: errores reportados por el usuario en `info/tasks.md` tras usar la app.
- **Palabras cortadas por salto de línea OCR** (`vesti- do`, `desti- nado`): `normalizeBlock` (`extract-mm-txt-to-jsonl.mjs`) no toleraba el espacio OCR entre el guion y el `\n` — la regex exigía el `\n` inmediatamente tras el guion. Ajustada a `/(\p{L})-[ \t]*\n[ \t]*(\p{Ll})/gu`.
- **Categoría/nivel de uso/sinónimos Lucene repetidos** (ej. "informal, informal, informal"): `parsePipeList` no deduplicaba los segmentos separados por `|`. Corregido con `Set`. Mismo fix aplicado a `sinonimos` (bug no listado originalmente, encontrado en verificación manual: "Alimoche, boñiguero, Alimoche, Alimoche").
- **Categoría y género mezclados en el mismo campo** (ej. "adjetivo, masculino, adjetivo, masculino"): `catGram` es texto libre en Lucene y nunca separaba la palabra de categoría de la de género. Causa real del bug reportado, más allá del simple duplicado.
- **Homógrafos duplicados en búsqueda** (`bonito` con 3 resultados en vez de 2: `bonito 2, -a` / `bonito' (Sarda sarda) m.` / `bonito", -a 1 adj.`): `parseLemaField` solo reconocía el número de homógrafo al final del lema (`"bonito 1"`), no en medio (`"bonito 2, -a"`) — el emparejamiento con la entrada `.txt` fallaba y se creaba una entrada Lucene "gap-fill" duplicada en vez de enriquecer la existente. Regex corregida a `/^(.*?)\s+(\d+)\b(.*)$/u`. Además, `cleanLemmaPrefix` no limpiaba las marcas de comilla OCR (`'`, `"`, `"`) del lema mostrado — añadido el mismo strip que ya usaba `makeId()` para el id.
- **Categorías gramaticales y género ausentes**: nuevo módulo `scripts/lib/mm-grammar.mjs` — clasifica el texto libre de `catGram` a 9 categorías canónicas (sustantivo, adjetivo, verbo, pronombre, adverbio, preposición, conjunción, interjección, determinante) y 3 géneros (masculino, femenino, neutro) como dos campos separados. Nueva columna SQLite `gender`; `part_of_speech` pasa de texto libre mezclado a categorías limpias y deduplicadas.
- **UI**: panel de enriquecimiento reorganizado en grupos visuales (Categoría+Género / Área+Nivel de uso / Etimología / científico+conjugación+sinónimos) con separadores sutiles.
- **Limpieza revisada**: sin archivos ni módulos huérfanos que quitar del repo.
- **Verificado**: pipeline completo regenerado — 37,687 entradas `.txt`, 88,112 Lucene, 36,161 enriquecidas correctamente (204 más que antes del fix de homógrafos), 89,638 entradas totales en SQLite (203 menos que las 89,841 previas, por eliminación de duplicados falsos de homógrafo). Probado en navegador real (Chrome DevTools MCP) contra `abanto` y `bonito`: 0 errores de consola, categoría/género se muestran separados y sin repetición.
- **Nota:** sin suite de tests (removida a pedido del usuario, commit `6bb1c63`) — verificación hecha regenerando el pipeline completo y comparando contra ejemplos reales conocidos, más prueba visual en navegador.
- Commiteado (`79711b0`) y pusheado a `origin/main`.

#### Task 16 — Desactivar heurística de antónimo (0/8 en el corpus) ✅
La nota pendiente de Task 7.2 ("requiere decidir: quitar el campo, o buscar otra señal") ya tenía la respuesta en los propios datos: `detectAntonymRedirect()` nunca acertó ni una vez en todo el corpus, y no existe ningún caso genuino de remisión para calibrar una regex mejor. Se desconectó de `buildLeaf()` (`mm-build-entry.mjs`) — deja de poblar el campo en vez de poblarlo mal. La función y su regex se dejan exportadas en `mm-segmenter.mjs` por si aparece una señal mejor más adelante; el esquema SQLite (`antonyms`) y el render en `main.js` se dejan intactos, simplemente quedan sin filas.
- Verificado: tabla `antonyms` pasó de 8 filas (todas falsos positivos conocidos) a 0 tras regenerar.

### Bugs conocidos, sin corregir
Documentados también en `info/tasks.md`:
- **Colisión asterisco/comilla suelta** (Task 7.3): `*palabra` a veces OCR'd como comilla suelta, hace que `extractExamples()` trague prosa real como ejemplo. Requiere repensar cómo `extractExamples`/`extractCrossReferencesAsterisk` distinguen ambos casos.
- **Sinónimos Lucene fragmentados**: sin delimitador en la fuente, frases multi-palabra como "armar una bronca" quedan como 3 sinónimos sueltos. Dedup ya aplicado (Task 15); la fragmentación en sí es una limitación de los datos de origen, no del parser.
- **~0.3% de expresiones cortadas mal por ruido OCR** (Task 3): `!` en vez de `.`, `l.` OCR'd de `I.`, puntos dobles.

## Estado: Fase 1 y Fase 2 completas, mergeadas a `main`. Task 15 y 16 (correcciones de calidad) commiteadas. Fase 3 queda para el futuro (post-MVP, ver más abajo).

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
