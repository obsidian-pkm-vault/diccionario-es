# Tasks

## Bugs a corregir

- [x] Palabras cortadas mal: "vesti- do", "desti- nado" — regex de `normalizeBlock` en `extract-mm-txt-to-jsonl.mjs` no toleraba el espacio OCR antes del salto de línea. Corregido y datos regenerados.
- [x] Categoría gramatical repetida en misma palabra: "Categoría: adjetivo, masculino, adjetivo, masculino" — `parsePipeList` no deduplicaba, y encima mezclaba categoría con género en el mismo campo. Corregido: dedup + separación en `partOfSpeech`/`gender` (ver `mm-grammar.mjs`).
- [x] Nivel de uso repetido en misma palabra: "Nivel de uso: informal, informal, informal" — mismo `parsePipeList`, mismo fix (dedup).
- [x] Palabras duplicadas en resultados de búsqueda ("bonito 2, -a" / "bonito' (Sarda sarda) m." / "bonito", -a 1 adj.") — dos causas: `parseLemaField` no reconocía el número de homógrafo cuando no estaba al final del lema (creaba una entrada Lucene duplicada en vez de enriquecer la existente), y el lema mostrado no limpiaba las marcas de comilla OCR. Ambas corregidas; "bonito" ahora muestra 2 resultados limpios en vez de 3.
- [x] Faltan categorías gramaticales: sustantivo, adjetivo, verbo, pronombre, adverbio, preposición, conjunción, interjección, determinante — nuevo `scripts/lib/mm-grammar.mjs`, clasifica el texto libre de `catGram` a estas categorías canónicas.
- [x] Falta género: femenino / masculino / neutro — nuevo campo `gender` (columna SQLite + UI), extraído del mismo texto libre.
- [x] (encontrado durante la verificación, no listado originalmente) Sinónimos Lucene repetidos, ej. "Alimoche, boñiguero, Alimoche, Alimoche" — mismo patrón de falta de dedup, corregido.

## Limpieza

- [x] Eliminar código y archivos innecesarios — revisado: sin archivos huérfanos ni módulos sin usar. El repo ya está limpio (`data/sample` se eliminó en un merge anterior, `.gitignore` correcto). Nada que quitar por ahora.

## Futuro

- [x] Agrupar visualmente: Etimología, Categoría, Nivel de uso, Sinónimo, Antónimo — panel de enriquecimiento reorganizado en grupos (Categoría+Género / Área+Nivel de uso / Etimología / Nombre científico+Conjugación+Sinónimos) con separadores sutiles. Sinónimo/Antónimo por acepción ya vivían agrupados junto a cada sentido (`renderLeafExtras`), sin cambios ahí.

---

## Ejemplo de entrada en DLE RAE: https://dle.rae.es/salud

```
Del lat. *salus, -ūtis.*

1. f. Estado en que el ser orgánico ejerce normalmente todas sus funciones.
2. f. Condición física y psíquica en que se encuentra un organismo en un momento determinado.
3. f. Libertad o bien público o particular de cada uno.
4. f. Rel. En el cristianismo, estado de gracia espiritual.
5. f. Rel. En el cristianismo, [salvación](https://dle.rae.es/?id=X7oZFdR#EDO8Fqv) (‖ consecución de la gloria eterna).
6. f. germ. Inmunidad de quien se acoge a lo sagrado.
7. f. pl. p. us. Actos y expresiones corteses.
8. interj. U. para saludar a alguien o desearle un bien.

### salud pública

1. f. Conjunto de condiciones mínimas de salubridad de una población determinada, que los poderes públicos tienen la obligación de garantizar y proteger.

### a mi, tu, su, etc., salud

1. loc. adv. desus. [a su salvo.](https://dle.rae.es/?id=X8yVIlK#I9Q9U62)

### beber a la salud de alguien

1. loc. verb. Brindar a su salud.

### curarse alguien en salud

1. loc. verb. Precaverse de un daño ante la más leve amenaza.
2. loc. verb. Dar satisfacción de algo antes que le hagan cargo de ello.

### en sana salud

1. loc. adv. En estado de perfecta salud.

### gastar salud

1. loc. verb. Gozarla buena.

### para poca salud, más vale morirse

1. expr. coloq. U. para indicar que algo reporta tan escasa ventaja que no merece el esfuerzo de conservarlo.

### vender, o verter, alguien salud

1. locs. verbs. coloqs. Ser o parecer muy robusto o saludable.


año de nuestra salud
atención primaria de salud
centro de salud
cuartel de la salud

## Sinónimos o afines de «salud»
* vigor, vitalidad, lozanía, bienestar, fortaleza, energía, robustez, sanidad, salubridad.
* salvación.

## Antónimos u opuestos de «salud»
* enfermedad
* condenación
```
