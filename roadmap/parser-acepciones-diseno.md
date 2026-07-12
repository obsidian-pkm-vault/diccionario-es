# Parser de definiciones DUE → estructura semántica

STATUS: active

Diseño para la tarea pendiente en `AI+PC/TODO.md`: convertir el campo `definition` (texto plano) de `data/diccionario-maria-moliner.jsonl` en una estructura de acepciones, sinónimos, catálogo de afines, antónimos y ejemplos.

## Auditoría de marcadores (hecha)

Símbolos reales, tomados de la sección "SIMBOLOS" del propio DUE (front matter del `.txt`, ~byte 26900):

| Símbolo | Función |
|---|---|
| `=` | introduce sinónimos |
| `` ` `` (acento grave) | marca la palabra que representa el complemento directo del verbo definido |
| `[...]` | encierra un elemento opcional |
| `[o...]` | encierra un elemento alternativo |
| `©` | introduce una subacepción (matiz dentro del mismo número) |
| símbolo ilegible (aparece como letra `E` suelta) | introduce etiquetas de notas de uso y conjugación |
| VERSALITA (mayúsculas en el `.txt` plano) | destaca la palabra bajo la cual está definida una expresión pluriverbal |

Marcadores adicionales identificados por inspección directa (no están en la lista oficial de símbolos, pero aparecen consistentemente):

- `O ` (letra O mayúscula + espacio, no `©`): bullet de catálogo/sub-nota dentro de una acepción. A veces introduce un catálogo etiquetado (`O Contacto: "al contacto de..."`), a veces solo una aclaración sin etiqueta.
- `*palabra`: referencia cruzada — la palabra tiene su propia entrada en el diccionario.
- `/`: separador de expresiones pluriverbales dentro de la misma entrada (p. ej. `/ Casa DE BAÑOS. Establecimiento...`).
- Sin marcador de antónimos. Los antónimos, cuando aparecen, están en prosa libre (`"opuesto a X"`, `"contrario de X"`) — no hay símbolo dedicado.
- Comillas de ejemplo: `"..."` y `'...'` mezcladas (variantes tipográficas del OCR), ambas delimitan ejemplos de uso.

## Bug de extracción encontrado (a corregir primero)

`scripts/extract-mm-txt-to-jsonl.mjs` trata cualquier línea en blanco como límite de bloque. El `.txt` fuente tiene números de página sueltos (p. ej. `787`) rodeados de líneas en blanco en medio de una entrada — esto corta la entrada ahí. Confirmado en `ir`: la definición real continúa una página entera más allá de donde la extracción actual corta (116 caracteres en vez de la definición completa). Hay ~1439 líneas de número de página suelto en el cuerpo del diccionario — afecta sobre todo a las entradas largas, que son justo las que más importan para este parser (catálogos, subacepciones).

**Decisión (aprobada):** corregir la extracción antes de escribir el nuevo parser. `splitIntoBlocks` debe ignorar como separador una línea en blanco si la siguiente línea no-blanca es solo dígitos (número de página) — en ese caso saltar el número de página y seguir acumulando el bloque actual en vez de cerrarlo.

## Esquema destino

```json
{
  "id": "casa",
  "lemma": "casa",
  "types": ["f"],
  "acepciones": [
    {
      "numero": 1,
      "definicion": "Edificio destinado a vivienda.",
      "ejemplos": [],
      "subacepciones": [
        { "definicion": "texto tras ©", "ejemplos": ["..."] }
      ],
      "catalogo": [
        { "etiqueta": "Contacto", "texto": "al contacto de, al roce de" },
        { "etiqueta": null, "texto": "texto tras O sin etiqueta" }
      ]
    }
  ],
  "sinonimos": [],
  "antonimos": [],
  "antonimosHeuristico": true,
  "referenciasCruzadas": [],
  "expresiones": [
    { "frase": "CASA DE BAÑOS", "definicion": "Establecimiento público de baños." }
  ],
  "campoSemantico": null,
  "fuente": "diccionario-maria-moliner.txt",
  "startLine": 0,
  "endLine": 0
}
```

Notas:
- `campoSemantico` queda `null` en v1 — no hay señal en el texto para derivarlo; según el paso 5 del TODO se enriquece con OMW/ConceptNet solo si hace falta, no aquí.
- `antonimosHeuristico: true` marca que el campo `antonimos` viene de heurística de prosa (baja precisión esperada), no de un símbolo dedicado — para que consumidores del dato sepan que necesita revisión/verificación si la usan.
- `numero: null` para entradas de una sola acepción sin número inicial.

## Arquitectura del parser — dos fases

Mismo estilo que `extract-mm-txt-to-jsonl.mjs` (regex + funciones puras, sin dependencias), pero separado en dos fases en vez de un único regex-soup entrelazado:

1. **Tokenizar**: un regex combinado recorre `definition` y encuentra, en orden: número de acepción inicial de segmento, `©`, bullet `O ` standalone, ejemplos entre comillas, tramo introducido por `=`, referencias `*palabra`, separador `/` de expresión, frases heurísticas de antónimo (`opuesto a`, `contrario de`, `frente a`). Devuelve lista ordenada de `{ tipo, texto, indice }`.
2. **Construir árbol**: recorre los tokens secuencialmente, mantiene contexto (acepción actual, subacepción actual), va llenando la estructura del esquema de arriba.

Dos fases en vez de un parser combinator o motor de gramática — la decisión doc del roadmap ya avisa de no montar arquitectura pesada sin necesidad; esto es suficiente para el volumen (37,792 entradas) y la irregularidad del texto.

## Almacenamiento

`node:sqlite` (módulo built-in de Node, verificado funcional en esta versión — Node v24.15) — cero dependencias nuevas, no hace falta `package.json` ni instalar `better-sqlite3`. Tablas normalizadas:

- `entries` (id PK, lemma, types_json, campo_semantico, fuente, start_line, end_line)
- `acepciones` (id PK, entry_id FK, numero, definicion, orden)
- `subacepciones` (id PK, acepcion_id FK, definicion, orden)
- `ejemplos` (id PK, owner_type, owner_id, texto)
- `catalogo_items` (id PK, acepcion_id FK, etiqueta, texto, orden)
- `sinonimos` (id PK, entry_id FK, palabra)
- `antonimos` (id PK, entry_id FK, palabra, heuristico BOOLEAN)
- `referencias_cruzadas` (id PK, entry_id FK, palabra)
- `expresiones` (id PK, entry_id FK, frase, definicion)

El mismo paso de parseo escribe además `data/diccionario-maria-moliner-v2.jsonl` (una línea JSON anidada por entrada, mismo esquema de arriba) — no se re-deriva desde SQLite, ambos salen del mismo recorrido.

## Archivos

- Modificar: `scripts/extract-mm-txt-to-jsonl.mjs` (fix de números de página en `splitIntoBlocks`)
- Nuevo: `scripts/parse-mm-definitions.mjs`
- Salidas: `data/diccionario-maria-moliner.jsonl` (regenerado), `data/diccionario-maria-moliner-v2.jsonl` (nuevo), `data/diccionario-maria-moliner.sqlite` (nuevo)

## Validación

- Regenerar jsonl base, confirmar que `ir` (y otras entradas conocidas por cruzar salto de página) ya no queda truncado.
- Muestra manual de ~20 lemas (`a`, `casa`, `ir`, y ~17 más variados en longitud/complejidad) comparados contra el `.txt` original.
- Estadísticas agregadas sobre las 37,792 entradas: % con ≥1 acepción parseada, % con sinónimos encontrados, % con catálogo encontrado, % con antónimos heurísticos encontrados — para calibrar si el parser propio basta o hace falta el paso 5 (enriquecimiento externo).

## Fuera de alcance (v1)

- `campoSemantico` (requiere taxonomía externa).
- Enriquecimiento vía WordNet/OMW/ConceptNet — solo si esta versión se queda corta (paso 5 del TODO).
- Uso comercial o distribución del dato — uso personal únicamente, ver README del repo.
