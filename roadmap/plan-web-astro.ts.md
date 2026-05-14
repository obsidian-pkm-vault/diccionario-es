# Extracción JSON - Diccionario MM desde Lucene Index

## 📦 Fuente de Datos: Índices Lucene (Setup/index)

15 índices con 91,752 entradas categorizadas:

| Carpeta                   | Contenido                             |
|---------------------------|---------------------------------------|
| **lemas/**                | Todas las palabras (índice principal) |
| **ListaInversos/**        | Palabras por terminación              |
| **gentilicios/**          | Palabras de lugares                   |
| **toponimos/**            | Nombres geográficos                   |
| **Gramatica/GramaticaB/** | Conjugaciones/formas                  |
| **exprePlu2/**            | Expresiones pluriverbales             |
| **abrevUsoGeneral/**      | Abreviaturas                          |
| **formas/**               | Variantes de palabras                 |
| **sugerencias/**          | Auto-complete                         |

Cada carpeta contiene: `.cfs` (binario comprimido) + `.gen` (metadata) + `segments_*` (índice)

---

## 🔍 Lógica de Extracción → JSON

### Paso 1: Parsear Índice Lucene
**Archivo:** `lemas/` → extraer términos

**Desafío:** `.cfs` es contenedor binario Lucene v9
- Investigar especificación format Lucene Index
- Descomprimir + leer term dictionary
- Extraer: `{lema, frecuencia}`

**Alternativa fallback:** Parsear `diccionario-maria-moliner.txt` línea x línea (lento pero confiable)

### Paso 2: Buscar Definición
**Fuente:** `diccionario-maria-moliner.txt`

**Parseo:**
1. Buscar línea que empieza con `lema` (mayúsculas)
2. Capturar párrafos de definición hasta siguiente entrada
3. Extraer categorías: sustantivo, verbo, adjetivo, etc.
4. Extraer variantes: plurales, formas conjugadas

**Resultado:**
```json
{
  "id": "abaco",
  "lema": "ábaco",
  "definiciones": ["Instrumento de..."],
  "etiquetas": ["sustantivo"],
  "variantes": ["ábacos"]
}
```

### Paso 3: Correlacionar con Otros Índices
**Enriquecer lema:**
- Si existe en `gentilicios/` → tag "gentilicio"
- Si existe en `toponimos/` → tag "topónimo"
- Si existe en `Gramatica/` → añadir variantes conjugadas
- Si existe en `exprePlu2/` → referencias cruzadas

### Paso 4: Guardar entries.generated.json
**Output:** `data/entries.generated.json` (91,752 entradas)

---

## 🛠️ Implementación en parse.ts

**Función requerida:**
```typescript
async function parseLuceneIndex(): Promise<Entry[]> {
  // 1. Leer índice lemas/ (o fallback a txt)
  const lemas = await extractLemas();
  
  // 2. Para cada lema, buscar definición en txt
  const entries = lemas.map(lema => findDefinition(lema));
  
  // 3. Enriquecer con etiquetas de otros índices
  enrichWithCategories(entries);
  
  // 4. Guardar JSON
  writeFileSync('entries.generated.json', JSON.stringify(entries));
  
  return entries;
}
```

**Desafíos clave:**
1. **Parser Lucene:** ¿Librería Node.js o implementación propia del parser binario?
2. **Performance:** 91K entradas × búsqueda en txt = cuello de botella (considerar cargar txt indexado en memoria)
3. **Precisión parseo:** Manejar definiciones con múltiples párrafos, caracteres especiales
4. **Integridad:** Correlacionar entre índices sin perder datos
