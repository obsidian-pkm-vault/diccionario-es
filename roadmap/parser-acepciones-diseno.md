# Parser de definiciones DUE → estructura semántica

STATUS: active

Diseño para la tarea pendiente en `AI+PC/TODO.md`: convertir el campo `definition` (texto plano) de `data/diccionario-maria-moliner.jsonl` en una estructura de acepciones, sinónimos, catálogo de afines, antónimos y ejemplos.

**Convención de nombres:** claves JSON y columnas SQL en inglés (`definition`, `number`, `synonyms`...) — consistente con el extractor existente, que ya usa `lemma`/`types`/`source`/`startLine`/`endLine` en inglés. Evita además el problema de tildes en identificadores.

## Auditoría de marcadores (hecha, con verificación en texto real)

Símbolos reales, tomados de la sección "SIMBOLOS" del propio DUE (front matter del `.txt`, ~byte 26900):

| Símbolo                                          | Función                                                                   |
|---------------------------------------------------|----------------------------------------------------------------------------|
| `=`                                                | introduce sinónimos                                                       |
| `` ` `` (acento grave)                             | marca la palabra que representa el complemento directo del verbo definido |
| `[...]`                                            | encierra un elemento opcional                                             |
| `[o...]`                                           | encierra un elemento alternativo                                          |
| `©`                                                | introduce una subacepción (matiz dentro del mismo número)                 |
| símbolo ilegible (aparece como letra `E` suelta)   | introduce etiquetas de notas de uso y conjugación                         |
| VERSALITA (mayúsculas en el `.txt` plano)          | destaca la palabra bajo la cual está definida una expresión pluriverbal   |

Marcadores adicionales identificados por inspección directa (no están en la lista oficial de símbolos, pero aparecen consistentemente):

- `O ` (letra O mayúscula + espacio, no `©`): bullet de catálogo/sub-nota dentro de una acepción. A veces introduce un catálogo etiquetado (`O Contacto: "al contacto de..."`), a veces solo una aclaración sin etiqueta.
- `*palabra`: referencia cruzada — la palabra tiene su propia entrada en el diccionario.
- `/`: separador de expresiones pluriverbales dentro de la misma entrada (p. ej. `/ Casa DE BAÑOS. Establecimiento...`). La expresión suele repetir el lema abreviado a su inicial (`C.` por `Casa`, `V.` por `Válvula`) — **hay que resolver esa abreviatura a la palabra completa** al construir `expressions[].phrase`, comparando la inicial contra `lemma`.
- `V. PALABRA` **fuera** de una expresión `/`-separada (es decir, como contenido normal de una acepción numerada, p. ej. `4 V. ARTÍCULO determinado.`): abreviatura de "véase", referencia cruzada real → va a `crossReferences`, no a `expressions`. Distinguir de la abreviatura de lema de arriba por contexto: si aparece justo tras `/` y coincide con la inicial del lema, es abreviatura del lema; si no, es "véase".
- Sin marcador dedicado de antónimos. Los antónimos, cuando aparecen, están en prosa libre (`"opuesto a X"`, `"contrario de X"`, `"contrario a X"`) — no hay símbolo dedicado. **Verificado con 82 ocurrencias reales de esas frases**: la mayoría son prosa genérica sin relación léxica de antonimia (p. ej. "extremo *opuesto a* la punta" describe posición, no es un par antónimo). Precisión esperada baja si se dispara en cualquier punto de la definición. Mitigación: limitar el heurístico a **el caso en que la definición completa (o la acepción completa) es solo el patrón** `Opuesto a *X*.` / `Contrario de *X*.` / `Contrario a *X*.` — patrón de "definición por redirección a opuesto", no búsqueda libre dentro de texto largo.
- Comillas de ejemplo: `"..."` y `'...'` mezcladas (variantes tipográficas del OCR), ambas delimitan ejemplos de uso.
- Verificado con 6 muestras reales que `=` efectivamente introduce una lista de sinónimos separados por comas, terminada en punto (p. ej. `= Precipitarse.`, `= Dejado, desastrado, descuidado, desidioso.`) — el diseño del tokenizador para este marcador es correcto tal cual.
- No existe una sección de "catálogo" con encabezado propio en el texto (se buscó "Catálogo"/"CATÁLOGO"/"AFINES" — la única ocurrencia de la palabra "Catálogo" es dentro de la definición de la propia palabra "glosario", no un marcador estructural). Confirma que `O ` es el único mecanismo real para listas de afines/catálogo en esta edición.

## Bug de extracción encontrado (a corregir primero)

`scripts/extract-mm-txt-to-jsonl.mjs` trata cualquier línea en blanco como límite de bloque. El `.txt` fuente tiene números de página sueltos (p. ej. `787`) rodeados de líneas en blanco en medio de una entrada — esto corta la entrada ahí. Confirmado en `ir`: la definición real continúa una página entera más allá de donde la extracción actual corta (116 caracteres en vez de la definición completa). Hay ~1439 líneas de número de página suelto en el cuerpo del diccionario — afecta sobre todo a las entradas largas, que son justo las que más importan para este parser (catálogos, subacepciones).

**Decisión (aprobada):** corregir la extracción antes de escribir el nuevo parser. `splitIntoBlocks` debe ignorar como separador una línea en blanco si la siguiente línea no-blanca es solo dígitos (número de página) — en ese caso saltar el número de página y seguir acumulando el bloque actual en vez de cerrarlo.

## Esquema destino

```json
{
  "id": "casa",
  "lemma": "casa",
  "types": ["f"],
  "senses": [
    {
      "number": 1,
      "definition": "Edificio destinado a vivienda.",
      "examples": [],
      "subsenses": [
        { "definition": "texto tras ©", "examples": ["..."] }
      ],
      "catalog": [
        { "label": "Contacto", "text": "al contacto de, al roce de" },
        { "label": null, "text": "texto tras O sin etiqueta" }
      ]
    }
  ],
  "synonyms": [],
  "antonyms": [],
  "antonymsHeuristic": true,
  "crossReferences": [],
  "expressions": [
    { "phrase": "CASA DE BAÑOS", "definition": "Establecimiento público de baños." }
  ],
  "semanticField": null,
  "source": "diccionario-maria-moliner.txt",
  "startLine": 0,
  "endLine": 0
}
```

Notas:
- `semanticField` queda `null` en v1 — no hay señal en el texto para derivarlo; según el paso 5 del TODO se enriquece con OMW/ConceptNet solo si hace falta, no aquí.
- `antonymsHeuristic: true` marca que el campo `antonyms` viene de heurística de prosa restringida (ver arriba), no de un símbolo dedicado — para que consumidores del dato sepan que necesita revisión/verificación si la usan. Si el heurístico no dispara para una entrada, el campo queda `[]` y `antonymsHeuristic: false`.
- `number: null` para entradas de una sola acepción sin número inicial.
- `expressions[].phrase` siempre con la abreviatura del lema ya resuelta a palabra completa (ver marcador `/` arriba).

## Arquitectura del parser — dos fases

Mismo estilo que `extract-mm-txt-to-jsonl.mjs` (regex + funciones puras, sin dependencias), pero separado en dos fases en vez de un único regex-soup entrelazado:

1. **Tokenizar**: un regex combinado recorre `definition` y encuentra, en orden: número de acepción inicial de segmento, `©`, bullet `O ` standalone, ejemplos entre comillas, tramo introducido por `=`, referencias `*palabra`, separador `/` de expresión (con resolución de abreviatura de lema), `V. PALABRA` fuera de expresión, patrón de antónimo por redirección completa. Devuelve lista ordenada de `{ type, text, index }`.
2. **Construir árbol**: recorre los tokens secuencialmente, mantiene contexto (acepción actual, subacepción actual), va llenando la estructura del esquema de arriba.

Dos fases en vez de un parser combinator o motor de gramática — la decisión doc del roadmap ya avisa de no montar arquitectura pesada sin necesidad; esto es suficiente para el volumen (37,792 entradas) y la irregularidad del texto.

## Almacenamiento

`node:sqlite` (módulo built-in de Node, verificado funcional en esta versión — Node v24.15) — cero dependencias nuevas, no hace falta `package.json` ni instalar `better-sqlite3`. Tablas normalizadas (snake_case, consistente con convención SQL habitual):

- `entries` (id PK, lemma, types_json, semantic_field, source, start_line, end_line)
- `senses` (id PK, entry_id FK, number, definition, sort_order)
- `subsenses` (id PK, sense_id FK, definition, sort_order)
- `examples` (id PK, owner_type, owner_id, text)
- `catalog_items` (id PK, sense_id FK, label, text, sort_order)
- `synonyms` (id PK, entry_id FK, word)
- `antonyms` (id PK, entry_id FK, word, heuristic BOOLEAN)
- `cross_references` (id PK, entry_id FK, word)
- `expressions` (id PK, entry_id FK, phrase, definition)

El mismo paso de parseo escribe además `data/diccionario-maria-moliner-v2.jsonl` (una línea JSON anidada por entrada, mismo esquema de arriba) — no se re-deriva desde SQLite, ambos salen del mismo recorrido.

## Archivos

- Modificar: `scripts/extract-mm-txt-to-jsonl.mjs` (fix de números de página en `splitIntoBlocks`)
- Nuevo: `scripts/parse-mm-definitions.mjs`
- Salidas: `data/diccionario-maria-moliner.jsonl` (regenerado), `data/diccionario-maria-moliner-v2.jsonl` (nuevo), `data/diccionario-maria-moliner.sqlite` (nuevo)

## Validación

- Regenerar jsonl base, confirmar que `ir` (y otras entradas conocidas por cruzar salto de página) ya no queda truncado.
- Muestra manual de ~20 lemas (`a`, `casa`, `ir`, `abandonar`, `abaratar`, `abarcar` — estas tres últimas confirmadas con `=` real durante la auditoría — y ~14 más variados en longitud/complejidad) comparados contra el `.txt` original.
- Estadísticas agregadas sobre las 37,792 entradas: % con ≥1 acepción parseada, % con sinónimos encontrados, % con catálogo encontrado, % con antónimos heurísticos encontrados, % con expresiones encontradas — para calibrar si el parser propio basta o hace falta el paso 5 (enriquecimiento externo).

## Fuera de alcance (v1)

- `semanticField` (requiere taxonomía externa).
- Enriquecimiento vía WordNet/OMW/ConceptNet — solo si esta versión se queda corta (paso 5 del TODO).
- Uso comercial o distribución del dato — uso personal únicamente, ver README del repo.
