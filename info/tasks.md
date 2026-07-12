# Tasks

Historial de lo ya resuelto: `info/roadmap.md` (Task 15, Task 16).

## Pendiente

- [ ] **Colisión asterisco/comilla suelta** — `*palabra` (referencia cruzada) a veces OCR'd como comilla curva suelta (visto en `bendecir`, `abandonar`). `extractExamples()` empareja comillas tolerante a desajustes OCR a propósito, así que una comilla-asterisco suelta hace que trague prosa real como si fuera ejemplo, corrompiendo la definición. Arreglarlo bien requiere repensar cómo `extractExamples`/`extractCrossReferencesAsterisk` distinguen ambos casos — no trivial, no se tocó.
- [ ] **Sinónimos Lucene fragmentados** — el campo `sinonimos` de Lucene no tiene delimitador entre frases, así que "armar una bronca" se guarda como 3 sinónimos sueltos (`armar`, `una`, `bronca`) en vez de una frase. El dedup ya está, pero la fragmentación en sí no tiene fix limpio sin delimitador en la fuente — limitación de los datos, no del parser.
- [ ] **~0.3% de expresiones cortadas mal** — ruido OCR variado: `!` en vez de `.` como fin de frase, `l.` OCR'd de `I.`, puntos dobles. Heurística de `splitExpressions` ya aceptada como imperfecta en ese margen — el corpus original no siempre da una señal limpia.

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
