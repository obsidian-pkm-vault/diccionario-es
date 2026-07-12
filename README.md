# Diccionario de María Moliner

App local para consultar el *Diccionario de uso del español* de María Moliner. Uso personal, no venta — ver [info/sources.md](info/sources.md) para las fuentes originales.

## Requisitos

- Node.js 22.5+ (usa `node:sqlite`, nativo desde esa versión — sin dependencias npm en todo el proyecto)

## Uso

```sh
node server.mjs
```

Abre `http://localhost:3000`. El servidor sirve la app y consulta `data/diccionario-maria-moliner.sqlite` bajo demanda (la base tiene ~90k entradas; no se carga entera en el navegador).

## Estructura

```
index.html, main.js, style.css   — frontend (búsqueda + panel de resultado)
server.mjs                        — servidor local: estáticos + /api/search, /api/entry/:id
scripts/lib/                      — lógica de parseo/lectura, reutilizable
scripts/*.mjs                     — CLI para regenerar los datos
data/                             — fuentes + datos generados (jsonl, sqlite)
info/roadmap.md                   — plan detallado, decisiones de diseño, resultados de cada tarea
```

## Regenerar los datos

Los archivos generados (`data/diccionario-maria-moliner*.jsonl`, `data/diccionario-maria-moliner.sqlite`) ya están en el repo. Para regenerarlos desde las fuentes:

```sh
# 1. Extrae del .txt OCR (data/book/diccionario-maria-moliner.txt) — acepciones, subacepciones, catálogo, expresiones
node scripts/extract-mm-txt-to-jsonl.mjs

# 2. Extrae del índice Lucene (data/Diccionario_Maria_Moliner_3a_ed/Setup/index/todo/) — etimología, área/nivel de uso, nombre científico, conjugación, etc.
node scripts/extract-mm-lucene-to-jsonl.mjs

# 3. Combina ambas fuentes (enriquece las entradas del .txt, rellena con las que solo están en Lucene) y escribe el SQLite + jsonl final
node scripts/parse-mm-definitions.mjs
```

Cada script acepta `--input`/`--output*` para rutas alternativas y `--limit N` para pruebas rápidas. Ver [info/roadmap.md](info/roadmap.md) para el detalle de qué extrae cada fuente y por qué.
