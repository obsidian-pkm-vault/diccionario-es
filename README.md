# Diccionario de María Moliner

App local para consultar el *Diccionario de uso del español* de María Moliner. Uso personal, no venta — ver [info/sources.md](info/sources.md) para las fuentes originales.

## Requisitos

- Node.js 22.5+ (usa `node:sqlite`, nativo desde esa versión — el pipeline de datos y el servidor local no tienen dependencias npm)

## Uso local

```sh
node server.mjs
```

Abre `http://localhost:3000`. El servidor sirve la app y consulta `data/diccionario-maria-moliner.sqlite` bajo demanda (la base tiene ~90k entradas; no se carga entera en el navegador).

## Versión estática (GitHub Pages)

`server.mjs` necesita Node corriendo del lado del servidor — GitHub Pages solo sirve archivos estáticos, así que hay una segunda variante del frontend que corre la base de datos entera en el navegador vía [sql.js](https://github.com/sql-js/sql.js) (SQLite compilado a WASM). Es la única dependencia npm del proyecto, y es solo del lado del navegador (el pipeline de datos sigue sin dependencias).

```sh
npm install
node scripts/export-static-site.mjs
```

Genera `dist/` con: el HTML/JS de la variante estática (`index.pages.html` → `index.html`, `main.pages.js` → `main.js`), sql.js vendorizado, y `data/diccionario-maria-moliner.sqlite` comprimido con gzip (~30MB → ~12MB, se descarga una sola vez y el navegador lo cachea). `.github/workflows/deploy-pages.yml` corre este mismo script en cada push a `main` y publica `dist/` en GitHub Pages — requiere activar Pages una vez en Settings → Pages → Source: GitHub Actions.

**Nota de exposición:** a diferencia de la versión local, la variante estática publica el contenido completo del diccionario (comprimido) a cualquier visitante público del sitio. La fuente original tiene copyright — confirmar que eso es aceptable antes de activar el deploy en un repo público.

## Estructura

```
index.html, main.js, render.js, style.css   — frontend local (server.mjs + /api/*)
index.pages.html, main.pages.js,
browser-sqlite-reader.js                     — frontend estático (GitHub Pages + sql.js), comparte render.js
server.mjs                                   — servidor local: estáticos + /api/search, /api/entry/:id
scripts/export-static-site.mjs               — genera dist/ para GitHub Pages
scripts/lib/                                 — lógica de parseo/lectura, reutilizable
scripts/*.mjs                                — CLI para regenerar los datos
data/                                         — solo diccionario-maria-moliner.sqlite se commitea; el resto son fuentes con copyright (gitignored) o subproductos regenerables
info/roadmap.md                              — plan detallado, decisiones de diseño, resultados de cada tarea
```

## Regenerar los datos

Solo `data/diccionario-maria-moliner.sqlite` está en el repo — es lo único que la app lee en tiempo real. Los jsonl intermedios (`data/diccionario-maria-moliner*.jsonl`) son subproductos del pipeline, no se commitean.

**`data/book/` y `data/Diccionario_Maria_Moliner_3a_ed/` (el `.txt` OCR y el índice Lucene) tampoco están en el repo** (`.gitignore`, son las fuentes con derechos de autor) — sin esos archivos localmente no se puede regenerar nada. Si los tienes:

```sh
# 1. Extrae del .txt OCR (data/book/diccionario-maria-moliner.txt) — acepciones, subacepciones, catálogo, expresiones
node scripts/extract-mm-txt-to-jsonl.mjs

# 2. Extrae del índice Lucene (data/Diccionario_Maria_Moliner_3a_ed/Setup/index/todo/) — etymology, usageArea, usageLevel, scientificName, conjugation, etc.
node scripts/extract-mm-lucene-to-jsonl.mjs

# 3. Combina ambas fuentes (enriquece las entradas del .txt, rellena con las que solo están en Lucene) y escribe el SQLite final
node scripts/parse-mm-definitions.mjs
```

Cada script acepta `--input`/`--output*` para rutas alternativas y `--limit N` para pruebas rápidas. Ver [info/roadmap.md](info/roadmap.md) para el detalle de qué extrae cada fuente y por qué.
