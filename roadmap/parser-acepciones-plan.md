# Parser de acepciones DUE — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix a page-break truncation bug in the existing extractor, then parse `data/diccionario-maria-moliner.jsonl`'s plain-text `definition` field into structured senses/synonyms/catalog/antonyms/expressions, writing both a nested JSONL export and a normalized SQLite database.

**Architecture:** Two-phase parser — leaf-level text extractors (quotes, `=` synonyms, `*word`/`V. WORD` cross-references, antonym-redirect heuristic) and structural splitters (sense numbers, `©` subsenses, `O ` catalog bullets, `/` expressions) live in `scripts/lib/mm-segmenter.mjs`. `scripts/lib/mm-entry-builder.mjs` composes them into one `buildEntry()` pipeline per the target schema. `scripts/lib/mm-sqlite-writer.mjs` persists parsed entries to SQLite. `scripts/parse-mm-definitions.mjs` is the CLI orchestrator.

**Tech Stack:** Node.js (v22+, built-in `node:test`, `node:assert/strict`, `node:sqlite`). Zero new npm dependencies — matches existing `scripts/extract-mm-txt-to-jsonl.mjs` (no `package.json` in this repo).

## Global Constraints

- Field names: English (`definition`, `number`, `synonyms`, `antonyms`, `crossReferences`, `expressions`, `semanticField`) — per spec decision, consistent with existing `lemma`/`types`/`source`/`startLine`/`endLine`.
- SQL identifiers: `snake_case`.
- No new dependencies — use `node:sqlite`, `node:test`, `node:assert/strict` only.
- `semanticField` stays `null` in v1 (no in-text signal; out of scope per spec).
- `antonyms` is heuristic-only (no dedicated DUE symbol exists) — restricted to whole-definition/whole-sense redirect pattern (`Opuesto a X.` / `Contrario de X.` / `Contrario a X.`), not free search within longer prose.
- Source spec: `roadmap/parser-acepciones-diseno.md` (commit `6b6df63`). Every task below traces to a section of that spec.

---

### Task 1: Fix page-break bug in the extractor

**Files:**
- Modify: `scripts/extract-mm-txt-to-jsonl.mjs`
- Test: `scripts/extract-mm-txt-to-jsonl.test.mjs` (new)

**Interfaces:**
- Produces: `splitIntoBlocks(lines: string[], startLine: number): { startLine: number, endLine: number, lines: string[] }[]` — now exported (was module-private).

- [ ] **Step 1: Write the failing tests**

Create `scripts/extract-mm-txt-to-jsonl.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitIntoBlocks } from './extract-mm-txt-to-jsonl.mjs';

test('splitIntoBlocks merges an entry that spans a bare page-number line', () => {
  const lines = [
    'ir. 1 intr. Moverse hacia un sitio que se expresa: veces no',
    'se expresa el lugar ni la direccion.',
    '',
    '',
    '787',
    '',
    '',
    'sino alguna circunstancia del movimiento.',
  ];
  const blocks = splitIntoBlocks(lines, 1);
  assert.equal(blocks.length, 1);
  assert.deepEqual(blocks[0].lines, [
    'ir. 1 intr. Moverse hacia un sitio que se expresa: veces no',
    'se expresa el lugar ni la direccion.',
    'sino alguna circunstancia del movimiento.',
  ]);
});

test('splitIntoBlocks keeps two entries separate when a page number falls between them', () => {
  const lines = [
    'abalorio 1 m., gralm. pl. Bolita de vidrio.',
    '',
    '',
    '42',
    '',
    '',
    'abanderado n. Encargado de llevar una bandera.',
  ];
  const blocks = splitIntoBlocks(lines, 1);
  assert.equal(blocks.length, 2);
  assert.deepEqual(blocks[0].lines, ['abalorio 1 m., gralm. pl. Bolita de vidrio.']);
  assert.deepEqual(blocks[1].lines, ['abanderado n. Encargado de llevar una bandera.']);
});

test('splitIntoBlocks still splits on an ordinary blank-line paragraph break', () => {
  const lines = ['primero m. Primera cosa.', '', '', 'segundo m. Segunda cosa.'];
  const blocks = splitIntoBlocks(lines, 1);
  assert.equal(blocks.length, 2);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test scripts/extract-mm-txt-to-jsonl.test.mjs`
Expected: FAIL — `splitIntoBlocks is not a function` (not yet exported) or import error.

- [ ] **Step 3: Export `splitIntoBlocks`, add the page-break fix, and guard `main()`**

In `scripts/extract-mm-txt-to-jsonl.mjs`:

1. Add near the top, after the existing `import` lines:

```js
import { pathToFileURL } from 'node:url';
```

2. Add a new constant right after `HEADER_MARKER_REGEX`:

```js
const PAGE_NUMBER_LINE_REGEX = /^\s*\d{1,4}\s*$/u;
```

3. Add a new helper function right after `collectAllHeaderTypes`:

```js
function looksLikeEntryStart(line) {
  const trimmed = line.trim();

  if (!/^\p{Ll}/u.test(trimmed)) {
    return false;
  }

  const window = trimmed.slice(0, 220);
  return [...window.matchAll(TYPE_REGEX)].length > 0;
}
```

4. Replace the entire `splitIntoBlocks` function with:

```js
export function splitIntoBlocks(lines, startLine) {
  const blocks = [];
  let currentLines = [];
  let blockStartLine = startLine;
  let lastContentLine = startLine - 1;

  let offset = 0;

  while (offset < lines.length) {
    const absoluteLine = startLine + offset;
    const line = lines[offset];

    if (APPENDIX_MARKER.test(line.trim())) {
      break;
    }

    if (line.trim() !== '' && PAGE_NUMBER_LINE_REGEX.test(line)) {
      offset += 1;
      continue;
    }

    if (line.trim() === '') {
      if (currentLines.length > 0) {
        let peek = offset + 1;

        while (peek < lines.length && lines[peek].trim() === '') {
          peek += 1;
        }

        let sawPageNumber = false;

        if (peek < lines.length && lines[peek].trim() !== '' && PAGE_NUMBER_LINE_REGEX.test(lines[peek])) {
          sawPageNumber = true;
          peek += 1;

          while (peek < lines.length && lines[peek].trim() === '') {
            peek += 1;
          }
        }

        const nextContentLine = peek < lines.length ? lines[peek] : '';

        if (sawPageNumber && nextContentLine && !looksLikeEntryStart(nextContentLine)) {
          offset = peek;
          continue;
        }

        blocks.push({
          startLine: blockStartLine,
          endLine: lastContentLine,
          lines: currentLines,
        });
        currentLines = [];
      }

      offset += 1;
      continue;
    }

    if (currentLines.length === 0) {
      blockStartLine = absoluteLine;
    }

    currentLines.push(line);
    lastContentLine = absoluteLine;
    offset += 1;
  }

  if (currentLines.length > 0) {
    blocks.push({
      startLine: blockStartLine,
      endLine: lastContentLine,
      lines: currentLines,
    });
  }

  return blocks;
}
```

5. At the very bottom of the file, replace the unconditional `main();` call with:

```js
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test scripts/extract-mm-txt-to-jsonl.test.mjs`
Expected: PASS (3/3 tests)

- [ ] **Step 5: Regenerate the real data file and spot-check `ir`**

Run: `node scripts/extract-mm-txt-to-jsonl.mjs`
Expected output: `Entradas extraidas: <count>` (count should be ≥ 37792, page-break merges reduce block fragmentation so total entries should not drop) followed by `Salida: <path>` and first/last lemma lines.

Then verify the fix on the known-bad entry:

```bash
node -e "
const fs = require('fs');
const lines = fs.readFileSync('data/diccionario-maria-moliner.jsonl','utf8').split('\n').filter(Boolean);
for (const l of lines) {
  const o = JSON.parse(l);
  if (o.lemma === 'ir') { console.log(o.definition.length, o.definition.slice(0,200)); }
}
"
```

Expected: definition length is now several times the old 116 chars, and does not end mid-sentence at `A`.

- [ ] **Step 6: Commit**

```bash
git add scripts/extract-mm-txt-to-jsonl.mjs scripts/extract-mm-txt-to-jsonl.test.mjs data/diccionario-maria-moliner.jsonl
git commit -m "fix(extract): merge entries split by mid-page page-number lines"
```

---

### Task 2: Leaf-level text extractors (`mm-segmenter.mjs`, part 1)

**Files:**
- Create: `scripts/lib/mm-segmenter.mjs`
- Test: `scripts/lib/mm-segmenter.test.mjs`

**Interfaces:**
- Produces:
  - `extractExamples(text: string): { text: string, examples: string[] }`
  - `extractSynonyms(text: string): { text: string, synonyms: string[] }`
  - `extractCrossReferencesAsterisk(text: string): { text: string, crossReferences: string[] }`
  - `extractCrossReferencesVease(text: string): string[]`
  - `detectAntonymRedirect(text: string): string | null`
  - `stripEnclosingQuotes(text: string): string`

- [ ] **Step 1: Write the failing tests**

Create `scripts/lib/mm-segmenter.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractExamples,
  extractSynonyms,
  extractCrossReferencesAsterisk,
  extractCrossReferencesVease,
  detectAntonymRedirect,
  stripEnclosingQuotes,
} from './mm-segmenter.mjs';

test('extractExamples pulls quoted text out, handling mismatched OCR quote pairs', () => {
  const input = 'Se aplica a la cosa: “Un ejemplo’, o también: ‘Otro ejemplo”.';
  const result = extractExamples(input);
  assert.deepEqual(result.examples, ['Un ejemplo', 'Otro ejemplo']);
  assert.equal(result.text.includes('“'), false);
});

test('extractSynonyms reads a comma list after = and strips it from the text', () => {
  const result = extractSynonyms('Dejar de tener asida una cosa. = Soltar. O tr. Hacer que baje.');
  assert.deepEqual(result.synonyms, ['Soltar']);
  assert.equal(result.text.includes('='), false);
});

test('extractSynonyms handles a multi-word synonym list', () => {
  const result = extractSynonyms('Descuido en la limpieza. = Dejado, desastrado, descuidado, desidioso.');
  assert.deepEqual(result.synonyms, ['Dejado', 'desastrado', 'descuidado', 'desidioso']);
});

test('extractCrossReferencesAsterisk keeps the word, drops only the asterisk', () => {
  const result = extractCrossReferencesAsterisk('Rodear con los brazos la *cosa que se expresa.');
  assert.deepEqual(result.crossReferences, ['cosa']);
  assert.equal(result.text, 'Rodear con los brazos la cosa que se expresa.');
});

test('extractCrossReferencesVease finds V. WORD outside of expressions', () => {
  const refs = extractCrossReferencesVease('4 V. ARTÍCULO determinado.');
  assert.deepEqual(refs, ['artículo']);
});

test('detectAntonymRedirect matches a whole-definition redirect', () => {
  assert.equal(detectAntonymRedirect('Opuesto a bueno.'), 'bueno');
  assert.equal(detectAntonymRedirect('Contrario de rápido.'), 'rápido');
});

test('detectAntonymRedirect does not match generic prose containing the phrase', () => {
  assert.equal(
    detectAntonymRedirect('Clavo doblado en ángulo recto por el extremo opuesto a la punta.'),
    null,
  );
});

test('stripEnclosingQuotes removes only leading/trailing quote characters', () => {
  assert.equal(stripEnclosingQuotes('“al contacto de, al roce de”'), 'al contacto de, al roce de');
  assert.equal(stripEnclosingQuotes('sin comillas'), 'sin comillas');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test scripts/lib/mm-segmenter.test.mjs`
Expected: FAIL — cannot find module `./mm-segmenter.mjs`.

- [ ] **Step 3: Create `scripts/lib/mm-segmenter.mjs` with these functions**

```js
const EXAMPLE_REGEX = /[“‘ʻ]([^”’]{2,400})[”’]/gu;

export function extractExamples(text) {
  const examples = [];
  const cleaned = text.replace(EXAMPLE_REGEX, (match, inner) => {
    examples.push(inner.trim());
    return '';
  });
  return {
    text: cleaned.replace(/\s*:\s*(?=\.|$)/gu, '').replace(/\s{2,}/gu, ' ').trim(),
    examples,
  };
}

const SYNONYM_REGEX = /=\s*([^.]+)\./gu;

export function extractSynonyms(text) {
  const synonyms = [];
  const cleaned = text.replace(SYNONYM_REGEX, (match, group) => {
    for (const raw of group.split(',')) {
      const word = raw.trim();
      if (word) synonyms.push(word);
    }
    return '';
  });
  return { text: cleaned.replace(/\s{2,}/gu, ' ').trim(), synonyms };
}

const ASTERISK_REGEX = /\*(\p{L}[\p{L}-]*)/gu;

export function extractCrossReferencesAsterisk(text) {
  const crossReferences = [];
  const cleaned = text.replace(ASTERISK_REGEX, (match, word) => {
    crossReferences.push(word.toLowerCase());
    return word;
  });
  return { text: cleaned, crossReferences };
}

const VEASE_REGEX = /\bV\.\s+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s]{1,40}?)(?=[.,]|\s[a-záéíóúñ]|$)/gu;

export function extractCrossReferencesVease(text) {
  return [...text.matchAll(VEASE_REGEX)].map((match) => match[1].trim().toLowerCase());
}

const ANTONYM_REDIRECT_REGEX = /^(?:Opuesto|Contrario)\s+(?:a|de)\s+(.+?)\.?$/iu;

export function detectAntonymRedirect(text) {
  const match = ANTONYM_REDIRECT_REGEX.exec(text.trim());
  return match ? match[1].trim().toLowerCase() : null;
}

export function stripEnclosingQuotes(text) {
  return text.replace(/^[“‘ʻ"']+|[”’"']+$/gu, '').trim();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test scripts/lib/mm-segmenter.test.mjs`
Expected: PASS (8/8 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/mm-segmenter.mjs scripts/lib/mm-segmenter.test.mjs
git commit -m "feat(parser): leaf-level extractors for examples, synonyms, cross-refs, antonym heuristic"
```

---

### Task 3: Structural splitters (`mm-segmenter.mjs`, part 2)

**Files:**
- Modify: `scripts/lib/mm-segmenter.mjs`
- Modify: `scripts/lib/mm-segmenter.test.mjs`

**Interfaces:**
- Consumes: nothing from Task 2 (independent functions, same file)
- Produces:
  - `splitSenseChunks(text: string): { number: number | null, text: string }[]`
  - `splitSubsenses(text: string): { mainText: string, subsenseTexts: string[] }`
  - `splitCatalogItems(text: string): { mainText: string, catalogItems: { label: string | null, text: string }[] }`
  - `splitExpressionsRegion(text: string): { sensesText: string, expressionChunks: string[] }`
  - `resolveExpressionPhrase(chunk: string, lemma: string): { phrase: string, definition: string }`

- [ ] **Step 1: Write the failing tests**

Append to `scripts/lib/mm-segmenter.test.mjs`:

```js
import {
  splitSenseChunks,
  splitSubsenses,
  splitCatalogItems,
  splitExpressionsRegion,
  resolveExpressionPhrase,
} from './mm-segmenter.mjs';

test('splitSenseChunks splits on sentence-boundary sense numbers', () => {
  const text = 'Edificio destinado a vivienda. 2 Piso o local. 3 Conjunto de miembros.';
  const chunks = splitSenseChunks(text);
  assert.deepEqual(chunks, [
    { number: 1, text: 'Edificio destinado a vivienda.' },
    { number: 2, text: 'Piso o local.' },
    { number: 3, text: 'Conjunto de miembros.' },
  ]);
});

test('splitSenseChunks does not split on a number inside an example', () => {
  const text = 'Distancia: ‘A 10 km de Madrid’. 4 Distribución: algo.';
  const chunks = splitSenseChunks(text);
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].number, 1);
  assert.equal(chunks[1].number, 4);
});

test('splitSenseChunks returns a single null-numbered chunk when there is no numbering', () => {
  const chunks = splitSenseChunks('Una definición corta sin acepciones numeradas.');
  assert.deepEqual(chunks, [{ number: null, text: 'Una definición corta sin acepciones numeradas.' }]);
});

test('splitSubsenses splits on the © marker', () => {
  const result = splitSubsenses('Texto principal. © Primer matiz. © Segundo matiz.');
  assert.equal(result.mainText, 'Texto principal.');
  assert.deepEqual(result.subsenseTexts, ['Primer matiz.', 'Segundo matiz.']);
});

test('splitCatalogItems finds labeled and unlabeled O bullets', () => {
  const text =
    'Hay un grupo de relaciones. O Contacto: al contacto de, al roce de. O Con referencia a los que lo ocupan.';
  const result = splitCatalogItems(text);
  assert.equal(result.mainText, 'Hay un grupo de relaciones.');
  assert.deepEqual(result.catalogItems, [
    { label: 'Contacto', text: 'al contacto de, al roce de.' },
    { label: null, text: 'Con referencia a los que lo ocupan.' },
  ]);
});

test('splitCatalogItems returns no items when there is no O bullet', () => {
  const result = splitCatalogItems('Definición simple sin catálogo.');
  assert.equal(result.mainText, 'Definición simple sin catálogo.');
  assert.deepEqual(result.catalogItems, []);
});

test('splitExpressionsRegion separates senses from / -delimited expressions', () => {
  const text =
    'Edificio destinado a vivienda. / Casa DE BAÑOS. Establecimiento público de baños. / C. DE CAMPAÑA (Antill.). Tienda de campaña.';
  const result = splitExpressionsRegion(text);
  assert.equal(result.sensesText, 'Edificio destinado a vivienda.');
  assert.deepEqual(result.expressionChunks, [
    'Casa DE BAÑOS. Establecimiento público de baños.',
    'C. DE CAMPAÑA (Antill.). Tienda de campaña.',
  ]);
});

test('splitExpressionsRegion returns no chunks when there is no expression separator', () => {
  const result = splitExpressionsRegion('Solo una definición, sin expresiones.');
  assert.equal(result.sensesText, 'Solo una definición, sin expresiones.');
  assert.deepEqual(result.expressionChunks, []);
});

test('resolveExpressionPhrase resolves a single-letter lemma abbreviation', () => {
  const result = resolveExpressionPhrase('C. DE CAMPAÑA (Antill.). Tienda de campaña.', 'casa');
  assert.equal(result.phrase, 'Casa DE CAMPAÑA (Antill.).');
  assert.equal(result.definition, 'Tienda de campaña.');
});

test('resolveExpressionPhrase resolves the lemma when it appears mid-phrase', () => {
  const result = resolveExpressionPhrase('A Lo GRANDE. Con mucho lujo.', 'grande');
  assert.equal(result.phrase, 'A Lo Grande.');
  assert.equal(result.definition, 'Con mucho lujo.');
});

test('resolveExpressionPhrase leaves an already-correct full lemma untouched', () => {
  const result = resolveExpressionPhrase('Casa DE BAÑOS. Establecimiento público de baños.', 'casa');
  assert.equal(result.phrase, 'Casa DE BAÑOS.');
  assert.equal(result.definition, 'Establecimiento público de baños.');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test scripts/lib/mm-segmenter.test.mjs`
Expected: FAIL — `splitSenseChunks`/etc. are not exported yet.

- [ ] **Step 3: Append these functions to `scripts/lib/mm-segmenter.mjs`**

```js
const SENSE_NUMBER_REGEX = /(?<=[.”’"'ʻ]\s)(\d{1,2})\s+(?=\S)/gu;

export function splitSenseChunks(text) {
  const matches = [...text.matchAll(SENSE_NUMBER_REGEX)];

  if (matches.length === 0) {
    return [{ number: null, text: text.trim() }];
  }

  const chunks = [{ number: 1, text: text.slice(0, matches[0].index).trim() }];

  for (let i = 0; i < matches.length; i += 1) {
    const start = matches[i].index + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    chunks.push({
      number: Number.parseInt(matches[i][1], 10),
      text: text.slice(start, end).trim(),
    });
  }

  return chunks.filter((chunk) => chunk.text.length > 0);
}

export function splitSubsenses(text) {
  const [mainText, ...subsenseTexts] = text
    .split('©')
    .map((part) => part.trim())
    .filter(Boolean);
  return { mainText: mainText ?? '', subsenseTexts };
}

const CATALOG_BULLET_REGEX = /(?<=[.”’"'ʻ]\s)O\s+(?=[A-ZÁÉÍÓÚÑ¡¿«"'‘“])/gu;
const CATALOG_LABEL_REGEX = /^([\p{Lu}][\p{L}\s]{0,40}):\s*(.+)$/u;

export function splitCatalogItems(text) {
  const matches = [...text.matchAll(CATALOG_BULLET_REGEX)];

  if (matches.length === 0) {
    return { mainText: text.trim(), catalogItems: [] };
  }

  const mainText = text.slice(0, matches[0].index).trim();
  const catalogItems = [];

  for (let i = 0; i < matches.length; i += 1) {
    const start = matches[i].index + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const chunk = text.slice(start, end).trim();

    if (!chunk) continue;

    const labelMatch = CATALOG_LABEL_REGEX.exec(chunk);
    if (labelMatch) {
      catalogItems.push({ label: labelMatch[1].trim(), text: labelMatch[2].trim() });
    } else {
      catalogItems.push({ label: null, text: chunk });
    }
  }

  return { mainText, catalogItems };
}

export function splitExpressionsRegion(fullText) {
  const idx = fullText.indexOf(' / ');

  if (idx === -1) {
    return { sensesText: fullText.trim(), expressionChunks: [] };
  }

  const sensesText = fullText.slice(0, idx).trim();
  const expressionChunks = fullText
    .slice(idx + 3)
    .split(' / ')
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  return { sensesText, expressionChunks };
}

function findPhraseSplitIndex(chunk) {
  let depth = 0;

  for (let i = 0; i < chunk.length - 1; i += 1) {
    const ch = chunk[i];

    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (depth > 0) continue;

    if (ch === '.' && chunk[i + 1] === ' ') {
      const wordStart = chunk.lastIndexOf(' ', i - 1) + 1;
      const word = chunk.slice(wordStart, i);
      if (word.length === 1 && /\p{Lu}/u.test(word)) continue;
      return i;
    }
  }

  return -1;
}

const ABBREVIATION_TOKEN_REGEX = /\b([\p{Lu}][\p{Lu}]*|\p{Lu}\.)\b/gu;

export function resolveExpressionPhrase(chunk, lemma) {
  const splitIdx = findPhraseSplitIndex(chunk);
  const phraseRaw = splitIdx === -1 ? chunk : chunk.slice(0, splitIdx + 1);
  const definition = splitIdx === -1 ? '' : chunk.slice(splitIdx + 2).trim();

  const lemmaLower = lemma.toLowerCase();
  const lemmaInitial = lemmaLower.charAt(0).toUpperCase();
  const capitalizedLemma = lemma.charAt(0).toUpperCase() + lemma.slice(1);

  const phrase = phraseRaw.replace(ABBREVIATION_TOKEN_REGEX, (token) => {
    const bare = token.replace(/\.$/u, '');
    if (bare.length === 1 && bare === lemmaInitial) return capitalizedLemma;
    if (bare.toLowerCase() === lemmaLower) return capitalizedLemma;
    return token;
  });

  return { phrase: phrase.trim(), definition };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test scripts/lib/mm-segmenter.test.mjs`
Expected: PASS (19/19 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/mm-segmenter.mjs scripts/lib/mm-segmenter.test.mjs
git commit -m "feat(parser): structural splitters for senses, subsenses, catalog, expressions"
```

---

### Task 4: Entry builder pipeline

**Files:**
- Create: `scripts/lib/mm-entry-builder.mjs`
- Test: `scripts/lib/mm-entry-builder.test.mjs`

**Interfaces:**
- Consumes: every export from `scripts/lib/mm-segmenter.mjs` (Tasks 2 and 3)
- Produces: `buildEntry(rawEntry: { id, lemma, types, definition, source, startLine, endLine }): Entry` matching the schema in `roadmap/parser-acepciones-diseno.md`

- [ ] **Step 1: Write the failing test**

Create `scripts/lib/mm-entry-builder.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEntry } from './mm-entry-builder.mjs';

test('buildEntry parses a casa-like entry with senses, catalog, and expressions', () => {
  const raw = {
    id: 'casa',
    lemma: 'casa',
    types: ['f'],
    definition:
      'Edificio destinado a vivienda. 2 Piso o local. O Con referencia a los que lo ocupan, cualquier lugar cerrado. / Casa DE BAÑOS. Establecimiento público de baños. / C. DE CAMPAÑA (Antill.). Tienda de campaña.',
    source: 'diccionario-maria-moliner.txt',
    startLine: 10,
    endLine: 12,
  };

  const entry = buildEntry(raw);

  assert.equal(entry.id, 'casa');
  assert.equal(entry.senses.length, 2);
  assert.equal(entry.senses[0].number, 1);
  assert.equal(entry.senses[0].definition, 'Edificio destinado a vivienda.');
  assert.equal(entry.senses[1].number, 2);
  assert.equal(entry.senses[1].catalog.length, 1);
  assert.equal(entry.senses[1].catalog[0].label, null);
  assert.equal(entry.expressions.length, 2);
  assert.equal(entry.expressions[0].phrase, 'Casa DE BAÑOS.');
  assert.equal(entry.expressions[1].phrase, 'Casa DE CAMPAÑA (Antill.).');
  assert.equal(entry.semanticField, null);
  assert.equal(entry.source, 'diccionario-maria-moliner.txt');
});

test('buildEntry collects synonyms, asterisk cross-references, and subsenses', () => {
  const raw = {
    id: 'abandonar',
    lemma: 'abandonar',
    types: ['tr'],
    definition:
      'Dejar de tener asida o sujeta cierta *cosa que se vende. = Soltar. © Con *idea o propósito, desistir o renunciar.',
    source: 'diccionario-maria-moliner.txt',
    startLine: 1,
    endLine: 2,
  };

  const entry = buildEntry(raw);

  assert.deepEqual(entry.synonyms, ['Soltar']);
  assert.deepEqual(entry.crossReferences, ['cosa', 'idea']);
  assert.equal(entry.senses[0].subsenses.length, 1);
  assert.equal(entry.senses[0].subsenses[0].definition, 'Con idea o propósito, desistir o renunciar.');
});

test('buildEntry flags heuristic antonyms only for whole-sense redirects', () => {
  const raw = {
    id: 'alcayata',
    lemma: 'alcayata',
    types: ['f'],
    definition: 'Clavo doblado en ángulo recto por el extremo opuesto a la punta.',
    source: 'diccionario-maria-moliner.txt',
    startLine: 1,
    endLine: 1,
  };

  const entry = buildEntry(raw);

  assert.deepEqual(entry.antonyms, []);
  assert.equal(entry.antonymsHeuristic, false);
});

test('buildEntry extracts a real whole-sense antonym redirect', () => {
  const raw = {
    id: 'malo',
    lemma: 'malo',
    types: ['adj'],
    definition: 'Opuesto a bueno.',
    source: 'diccionario-maria-moliner.txt',
    startLine: 1,
    endLine: 1,
  };

  const entry = buildEntry(raw);

  assert.deepEqual(entry.antonyms, ['bueno']);
  assert.equal(entry.antonymsHeuristic, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/lib/mm-entry-builder.test.mjs`
Expected: FAIL — cannot find module `./mm-entry-builder.mjs`.

- [ ] **Step 3: Create `scripts/lib/mm-entry-builder.mjs`**

```js
import {
  extractCrossReferencesVease,
  extractSynonyms,
  extractCrossReferencesAsterisk,
  extractExamples,
  detectAntonymRedirect,
  splitSenseChunks,
  splitSubsenses,
  splitCatalogItems,
  splitExpressionsRegion,
  resolveExpressionPhrase,
  stripEnclosingQuotes,
} from './mm-segmenter.mjs';

function dedupe(list) {
  return [...new Set(list.map((item) => item.trim()).filter(Boolean))];
}

function buildLeaf(text) {
  const { text: definition, examples } = extractExamples(text);
  return { definition, examples };
}

export function buildEntry(rawEntry) {
  const { sensesText, expressionChunks } = splitExpressionsRegion(rawEntry.definition);

  const crossReferencesVease = extractCrossReferencesVease(sensesText);
  const { text: afterSynonyms, synonyms } = extractSynonyms(sensesText);
  const { text: afterAsterisk, crossReferences: crossReferencesAsterisk } =
    extractCrossReferencesAsterisk(afterSynonyms);

  const antonymHits = [];

  const senses = splitSenseChunks(afterAsterisk).map((chunk) => {
    const { mainText, subsenseTexts } = splitSubsenses(chunk.text);
    const { mainText: catalogMainText, catalogItems } = splitCatalogItems(mainText);
    const senseLeaf = buildLeaf(catalogMainText);

    const senseAntonym = detectAntonymRedirect(senseLeaf.definition);
    if (senseAntonym) antonymHits.push(senseAntonym);

    const subsenses = subsenseTexts.map((subText) => {
      const subLeaf = buildLeaf(subText);
      const subAntonym = detectAntonymRedirect(subLeaf.definition);
      if (subAntonym) antonymHits.push(subAntonym);
      return subLeaf;
    });

    return {
      number: chunk.number,
      definition: senseLeaf.definition,
      examples: senseLeaf.examples,
      subsenses,
      catalog: catalogItems.map((item) => ({
        label: item.label,
        text: stripEnclosingQuotes(item.text),
      })),
    };
  });

  const expressionCrossReferences = [];
  const expressions = expressionChunks.map((chunk) => {
    const { phrase, definition } = resolveExpressionPhrase(chunk, rawEntry.lemma);
    const { text: cleanedDefinition, crossReferences: exprRefs } =
      extractCrossReferencesAsterisk(definition);
    expressionCrossReferences.push(...exprRefs);
    return { phrase, definition: cleanedDefinition.trim() };
  });

  return {
    id: rawEntry.id,
    lemma: rawEntry.lemma,
    types: rawEntry.types,
    senses,
    synonyms: dedupe(synonyms),
    antonyms: dedupe(antonymHits),
    antonymsHeuristic: antonymHits.length > 0,
    crossReferences: dedupe([
      ...crossReferencesVease,
      ...crossReferencesAsterisk,
      ...expressionCrossReferences,
    ]),
    expressions,
    semanticField: null,
    source: rawEntry.source,
    startLine: rawEntry.startLine,
    endLine: rawEntry.endLine,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/lib/mm-entry-builder.test.mjs`
Expected: PASS (4/4 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/mm-entry-builder.mjs scripts/lib/mm-entry-builder.test.mjs
git commit -m "feat(parser): buildEntry pipeline composing segmenter into full schema"
```

---

### Task 5: SQLite writer

**Files:**
- Create: `scripts/lib/mm-sqlite-writer.mjs`
- Test: `scripts/lib/mm-sqlite-writer.test.mjs`

**Interfaces:**
- Consumes: `Entry` objects shaped like `buildEntry()`'s return value (Task 4)
- Produces: `writeEntriesToSqlite(entries: Entry[], dbPath: string): void`

- [ ] **Step 1: Write the failing test**

Create `scripts/lib/mm-sqlite-writer.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unlinkSync, existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { writeEntriesToSqlite } from './mm-sqlite-writer.mjs';

const FIXTURE_ENTRIES = [
  {
    id: 'casa',
    lemma: 'casa',
    types: ['f'],
    senses: [
      {
        number: 1,
        definition: 'Edificio destinado a vivienda.',
        examples: [],
        subsenses: [],
        catalog: [{ label: 'Contacto', text: 'al contacto de' }],
      },
    ],
    synonyms: ['Vivienda'],
    antonyms: [],
    antonymsHeuristic: false,
    crossReferences: ['hogar'],
    expressions: [{ phrase: 'Casa DE BAÑOS.', definition: 'Establecimiento público de baños.' }],
    semanticField: null,
    source: 'diccionario-maria-moliner.txt',
    startLine: 1,
    endLine: 2,
  },
];

test('writeEntriesToSqlite round-trips through a real file', () => {
  const dbPath = new URL('./__fixture_test.sqlite', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
  if (existsSync(dbPath)) unlinkSync(dbPath);

  writeEntriesToSqlite(FIXTURE_ENTRIES, dbPath);

  const db = new DatabaseSync(dbPath);

  const entryRow = db.prepare('SELECT * FROM entries WHERE id = ?').get('casa');
  assert.deepEqual(
    { ...entryRow },
    {
      id: 'casa',
      lemma: 'casa',
      types_json: '["f"]',
      semantic_field: null,
      source: 'diccionario-maria-moliner.txt',
      start_line: 1,
      end_line: 2,
    },
  );

  const senseRow = db.prepare('SELECT * FROM senses WHERE entry_id = ?').get('casa');
  assert.equal(senseRow.number, 1);
  assert.equal(senseRow.definition, 'Edificio destinado a vivienda.');

  const catalogRow = db.prepare('SELECT * FROM catalog_items WHERE sense_id = ?').get(senseRow.id);
  assert.equal(catalogRow.label, 'Contacto');

  const synonymRow = db.prepare('SELECT word FROM synonyms WHERE entry_id = ?').get('casa');
  assert.equal(synonymRow.word, 'Vivienda');

  const crossRefRow = db.prepare('SELECT word FROM cross_references WHERE entry_id = ?').get('casa');
  assert.equal(crossRefRow.word, 'hogar');

  const expressionRow = db.prepare('SELECT * FROM expressions WHERE entry_id = ?').get('casa');
  assert.equal(expressionRow.phrase, 'Casa DE BAÑOS.');

  db.close();
  unlinkSync(dbPath);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/lib/mm-sqlite-writer.test.mjs`
Expected: FAIL — cannot find module `./mm-sqlite-writer.mjs`.

- [ ] **Step 3: Create `scripts/lib/mm-sqlite-writer.mjs`**

```js
import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
CREATE TABLE entries (
  id TEXT PRIMARY KEY,
  lemma TEXT NOT NULL,
  types_json TEXT NOT NULL,
  semantic_field TEXT,
  source TEXT NOT NULL,
  start_line INTEGER,
  end_line INTEGER
);
CREATE TABLE senses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id TEXT NOT NULL REFERENCES entries(id),
  number INTEGER,
  definition TEXT NOT NULL,
  sort_order INTEGER NOT NULL
);
CREATE TABLE subsenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sense_id INTEGER NOT NULL REFERENCES senses(id),
  definition TEXT NOT NULL,
  sort_order INTEGER NOT NULL
);
CREATE TABLE examples (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_type TEXT NOT NULL,
  owner_id INTEGER NOT NULL,
  text TEXT NOT NULL
);
CREATE TABLE catalog_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sense_id INTEGER NOT NULL REFERENCES senses(id),
  label TEXT,
  text TEXT NOT NULL,
  sort_order INTEGER NOT NULL
);
CREATE TABLE synonyms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id TEXT NOT NULL REFERENCES entries(id),
  word TEXT NOT NULL
);
CREATE TABLE antonyms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id TEXT NOT NULL REFERENCES entries(id),
  word TEXT NOT NULL,
  heuristic INTEGER NOT NULL
);
CREATE TABLE cross_references (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id TEXT NOT NULL REFERENCES entries(id),
  word TEXT NOT NULL
);
CREATE TABLE expressions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id TEXT NOT NULL REFERENCES entries(id),
  phrase TEXT NOT NULL,
  definition TEXT NOT NULL
);
`;

export function writeEntriesToSqlite(entries, dbPath) {
  const db = new DatabaseSync(dbPath);
  db.exec(SCHEMA);

  const insertEntry = db.prepare(
    'INSERT INTO entries (id, lemma, types_json, semantic_field, source, start_line, end_line) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );
  const insertSense = db.prepare(
    'INSERT INTO senses (entry_id, number, definition, sort_order) VALUES (?, ?, ?, ?)',
  );
  const insertSubsense = db.prepare(
    'INSERT INTO subsenses (sense_id, definition, sort_order) VALUES (?, ?, ?)',
  );
  const insertExample = db.prepare('INSERT INTO examples (owner_type, owner_id, text) VALUES (?, ?, ?)');
  const insertCatalogItem = db.prepare(
    'INSERT INTO catalog_items (sense_id, label, text, sort_order) VALUES (?, ?, ?, ?)',
  );
  const insertSynonym = db.prepare('INSERT INTO synonyms (entry_id, word) VALUES (?, ?)');
  const insertAntonym = db.prepare('INSERT INTO antonyms (entry_id, word, heuristic) VALUES (?, ?, ?)');
  const insertCrossReference = db.prepare('INSERT INTO cross_references (entry_id, word) VALUES (?, ?)');
  const insertExpression = db.prepare(
    'INSERT INTO expressions (entry_id, phrase, definition) VALUES (?, ?, ?)',
  );

  db.exec('BEGIN');

  try {
    for (const entry of entries) {
      insertEntry.run(
        entry.id,
        entry.lemma,
        JSON.stringify(entry.types),
        entry.semanticField,
        entry.source,
        entry.startLine,
        entry.endLine,
      );

      entry.senses.forEach((sense, senseIndex) => {
        const { lastInsertRowid: senseId } = insertSense.run(
          entry.id,
          sense.number,
          sense.definition,
          senseIndex,
        );

        sense.examples.forEach((text) => insertExample.run('sense', senseId, text));

        sense.subsenses.forEach((subsense, subIndex) => {
          const { lastInsertRowid: subsenseId } = insertSubsense.run(
            senseId,
            subsense.definition,
            subIndex,
          );
          subsense.examples.forEach((text) => insertExample.run('subsense', subsenseId, text));
        });

        sense.catalog.forEach((item, itemIndex) => {
          insertCatalogItem.run(senseId, item.label, item.text, itemIndex);
        });
      });

      entry.synonyms.forEach((word) => insertSynonym.run(entry.id, word));
      entry.antonyms.forEach((word) =>
        insertAntonym.run(entry.id, word, entry.antonymsHeuristic ? 1 : 0),
      );
      entry.crossReferences.forEach((word) => insertCrossReference.run(entry.id, word));
      entry.expressions.forEach((expr) =>
        insertExpression.run(entry.id, expr.phrase, expr.definition),
      );
    }

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  db.close();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/lib/mm-sqlite-writer.test.mjs`
Expected: PASS (1/1 test)

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/mm-sqlite-writer.mjs scripts/lib/mm-sqlite-writer.test.mjs
git commit -m "feat(parser): normalized SQLite writer via node:sqlite"
```

---

### Task 6: CLI orchestrator + real run

**Files:**
- Create: `scripts/parse-mm-definitions.mjs`
- Test: `scripts/parse-mm-definitions.test.mjs`

**Interfaces:**
- Consumes: `buildEntry` (Task 4), `writeEntriesToSqlite` (Task 5)
- Produces: `data/diccionario-maria-moliner-v2.jsonl`, `data/diccionario-maria-moliner.sqlite` when run as `node scripts/parse-mm-definitions.mjs`

- [ ] **Step 1: Write the failing test**

Create `scripts/parse-mm-definitions.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runParse } from './parse-mm-definitions.mjs';

test('runParse reads a small jsonl fixture and writes v2.jsonl + sqlite with correct stats', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'mm-parse-test-'));
  const inputPath = path.join(dir, 'input.jsonl');
  const outputJsonlPath = path.join(dir, 'output-v2.jsonl');
  const outputSqlitePath = path.join(dir, 'output.sqlite');

  const fixtureLines = [
    { id: 'casa', lemma: 'casa', types: ['f'], definition: 'Edificio destinado a vivienda. = Vivienda.', source: 'x', startLine: 1, endLine: 1 },
    { id: 'malo', lemma: 'malo', types: ['adj'], definition: 'Opuesto a bueno.', source: 'x', startLine: 2, endLine: 2 },
  ];
  writeFileSync(inputPath, fixtureLines.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf8');

  const stats = runParse({ inputPath, outputJsonlPath, outputSqlitePath });

  assert.equal(stats.totalEntries, 2);
  assert.equal(stats.withSynonyms, 1);
  assert.equal(stats.withAntonyms, 1);
  assert.equal(existsSync(outputJsonlPath), true);
  assert.equal(existsSync(outputSqlitePath), true);

  const outputLines = readFileSync(outputJsonlPath, 'utf8').trim().split('\n');
  assert.equal(outputLines.length, 2);
  const casaEntry = JSON.parse(outputLines[0]);
  assert.deepEqual(casaEntry.synonyms, ['Vivienda']);

  unlinkSync(inputPath);
  unlinkSync(outputJsonlPath);
  unlinkSync(outputSqlitePath);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/parse-mm-definitions.test.mjs`
Expected: FAIL — cannot find module `./parse-mm-definitions.mjs`.

- [ ] **Step 3: Create `scripts/parse-mm-definitions.mjs`**

```js
#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildEntry } from './lib/mm-entry-builder.mjs';
import { writeEntriesToSqlite } from './lib/mm-sqlite-writer.mjs';

const DEFAULT_INPUT = path.resolve('data/diccionario-maria-moliner.jsonl');
const DEFAULT_OUTPUT_JSONL = path.resolve('data/diccionario-maria-moliner-v2.jsonl');
const DEFAULT_OUTPUT_SQLITE = path.resolve('data/diccionario-maria-moliner.sqlite');

export function runParse({ inputPath, outputJsonlPath, outputSqlitePath }) {
  const rawLines = fs.readFileSync(inputPath, 'utf8').split('\n').filter(Boolean);
  const entries = rawLines.map((line) => buildEntry(JSON.parse(line)));

  const stats = {
    totalEntries: entries.length,
    withSenses: entries.filter((e) => e.senses.length > 0).length,
    withSynonyms: entries.filter((e) => e.synonyms.length > 0).length,
    withAntonyms: entries.filter((e) => e.antonyms.length > 0).length,
    withCatalog: entries.filter((e) => e.senses.some((s) => s.catalog.length > 0)).length,
    withExpressions: entries.filter((e) => e.expressions.length > 0).length,
    withCrossReferences: entries.filter((e) => e.crossReferences.length > 0).length,
  };

  fs.mkdirSync(path.dirname(outputJsonlPath), { recursive: true });
  fs.writeFileSync(
    outputJsonlPath,
    entries.map((entry) => JSON.stringify(entry)).join('\n') + '\n',
    'utf8',
  );

  writeEntriesToSqlite(entries, outputSqlitePath);

  return stats;
}

function main() {
  const stats = runParse({
    inputPath: DEFAULT_INPUT,
    outputJsonlPath: DEFAULT_OUTPUT_JSONL,
    outputSqlitePath: DEFAULT_OUTPUT_SQLITE,
  });

  const pct = (n) => `${((n / stats.totalEntries) * 100).toFixed(1)}%`;

  console.log(`Entradas procesadas: ${stats.totalEntries}`);
  console.log(`Con senses: ${stats.withSenses} (${pct(stats.withSenses)})`);
  console.log(`Con sinónimos: ${stats.withSynonyms} (${pct(stats.withSynonyms)})`);
  console.log(`Con antónimos (heurístico): ${stats.withAntonyms} (${pct(stats.withAntonyms)})`);
  console.log(`Con catálogo: ${stats.withCatalog} (${pct(stats.withCatalog)})`);
  console.log(`Con expresiones: ${stats.withExpressions} (${pct(stats.withExpressions)})`);
  console.log(`Con referencias cruzadas: ${stats.withCrossReferences} (${pct(stats.withCrossReferences)})`);
  console.log(`Salida JSONL: ${DEFAULT_OUTPUT_JSONL}`);
  console.log(`Salida SQLite: ${DEFAULT_OUTPUT_SQLITE}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/parse-mm-definitions.test.mjs`
Expected: PASS (1/1 test)

- [ ] **Step 5: Run against the full real corpus**

Run: `node scripts/parse-mm-definitions.mjs`
Expected: prints stats for all ~37,792 entries (exact count depends on Task 1's regenerated jsonl), creates `data/diccionario-maria-moliner-v2.jsonl` and `data/diccionario-maria-moliner.sqlite`. Note the printed percentages — they feed Task 7's validation write-up.

- [ ] **Step 6: Commit**

```bash
git add scripts/parse-mm-definitions.mjs scripts/parse-mm-definitions.test.mjs data/diccionario-maria-moliner-v2.jsonl data/diccionario-maria-moliner.sqlite
git commit -m "feat(parser): CLI orchestrator, run full corpus to v2.jsonl + sqlite"
```

---

### Task 7: Manual validation against the original text

**Files:**
- Create: `scripts/inspect-mm-entry.mjs`
- Modify: `roadmap/parser-acepciones-diseno.md` (record findings)

**Interfaces:**
- Consumes: `data/diccionario-maria-moliner-v2.jsonl` (Task 6 output)
- Produces: no new exports — this is a CLI inspection tool plus a documentation update

- [ ] **Step 1: Create `scripts/inspect-mm-entry.mjs`**

```js
#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const [, , ...ids] = process.argv;

if (ids.length === 0) {
  console.error('Uso: node scripts/inspect-mm-entry.mjs <id> [id2] [id3] ...');
  process.exit(1);
}

const inputPath = path.resolve('data/diccionario-maria-moliner-v2.jsonl');
const wanted = new Set(ids);
const lines = fs.readFileSync(inputPath, 'utf8').split('\n').filter(Boolean);

for (const line of lines) {
  const entry = JSON.parse(line);
  if (wanted.has(entry.id)) {
    console.log(JSON.stringify(entry, null, 2));
    console.log('---');
  }
}
```

- [ ] **Step 2: Run it against the 20 sample lemmas from the spec**

```bash
node scripts/inspect-mm-entry.mjs a casa ir abandonar abaratar abarcar grande bonito pequeno abanderado abalorio abalear glosario azadon antimilitarismo alcayata malo bueno determinante primo
```

For each printed entry, open `data/diccionario-maria-moliner.txt` at the corresponding `startLine`/`endLine` and compare the parsed `senses`/`synonyms`/`catalog`/`antonyms`/`expressions` against the real dictionary prose. Note any lemma from that list not found in the output (missing from the corpus — record separately, don't block on it).

- [ ] **Step 3: Record findings in the spec doc**

Append a `## Resultados de validación` section to `roadmap/parser-acepciones-diseno.md` with: the stats printed by Task 6 Step 5, which of the ~20 sample lemmas parsed correctly vs. showed problems, and — critically — whether the aggregate quality is good enough to close this TODO item, or whether TODO step 5 (external enrichment via OMW/ConceptNet) is now warranted. Base this on what Step 2 actually shows; do not restate the plan's predictions as results.

- [ ] **Step 4: Update `AI+PC/TODO.md`**

In `d:\Workspaces\AI+PC\TODO.md`, move the "Pendiente" list's items 1–4 into "Hecho (no repetir)" with a one-line pointer to `roadmap/parser-acepciones-diseno.md`, and keep item 5 (external enrichment) pending only if Step 3's findings say it's warranted.

- [ ] **Step 5: Commit**

```bash
git add scripts/inspect-mm-entry.mjs roadmap/parser-acepciones-diseno.md
git commit -m "docs(roadmap): record validation results for the acepciones parser"
```

Then, separately, in the `AI+PC` repo:

```bash
git add TODO.md
git commit -m "chore: mark María Moliner parser steps done"
```

---

### Task 8: Fix entry-start detection blind spots (page-break peek hardening)

> **Dispatch order note:** despite its number, this task must run **immediately after Task 1 and before Task 2** — it patches the same `splitIntoBlocks`/`looksLikeEntryStart` code Task 1 touched and regenerates the same `data/diccionario-maria-moliner.jsonl` that Tasks 2–7 build on. It is numbered last only so it didn't collide with the plan's existing `Task 1`–`Task 7` headings when appended after Task 1 was already implemented and reviewed.

**Why:** Task 1's review turned up a genuine, pre-existing data-loss bug — not caused by Task 1's own fix, but exposed while investigating a discrepancy Task 1's fix surfaced. `looksLikeEntryStart` only inspects a single physical line when deciding whether content after a page break is a new entry. Two real failure patterns follow from that:

1. **Misfiled entries:** when a real entry's grammatical type marker (`f.`, `m.`, `tr.`, …) falls on the line *after* its lemma/header line — common when the header line is long (e.g. carries a parenthetical usage note) — `looksLikeEntryStart` checks only the first line, finds no marker, wrongly concludes "not a new entry," and bridges the page break onto the *previous* entry instead of starting fresh. The real entry's text becomes an unsearchable tail of an unrelated neighbor. Confirmed on real corpus lemmas: `ánimo`, `brasier`, `carcoma`, `desorientado, -a`, `enfermo, -a`, `engaño`, `gana`, `gravamen`, `grito`, `torpedo`.
2. **Vanished entries:** occasionally a stray non-blank, non-digit scan-noise line (e.g. `AA`, `-— —-` — OCR/print artifacts with no lowercase letters) sits between the blank-line runs around a page break. It isn't a page number, so it's treated as real content and starts a bogus block; the genuine entry that follows then gets bridged onto *that* artifact line (same single-line lookahead weakness as above); `parseBlock`'s lowercase-first-character validation then rejects the whole merged block, silently dropping both the artifact and the real entry it swallowed. Confirmed on real corpus lemmas: `actividad`, `pamue`.

**Explicitly out of scope:** a third, unrelated pre-existing issue where very long multi-sense entries (e.g. `pasar`) lose most of their senses across *multiple* internal page breaks — that needs a fundamentally different merge strategy (folding in possibly-many page breaks with real intervening acepción numbers) and is not a lookahead-window problem. Do not attempt it here; it needs its own dedicated investigation.

**Files:**
- Modify: `scripts/extract-mm-txt-to-jsonl.mjs`
- Modify: `scripts/extract-mm-txt-to-jsonl.test.mjs`
- Regenerate: `data/diccionario-maria-moliner.jsonl`

**Interfaces:**
- Changes: `looksLikeEntryStart` signature changes from `(line: string): boolean` to `(lines: string[], startIndex: number): boolean` — it now joins a short lookahead window of upcoming lines (stopping at the next blank line, capped at 5 lines) before testing, instead of testing only `lines[startIndex]`. Update its one call site inside `splitIntoBlocks` accordingly.
- `splitIntoBlocks(lines, startLine)`'s external signature and return shape are unchanged.

- [ ] **Step 1: Write the failing tests**

Append to `scripts/extract-mm-txt-to-jsonl.test.mjs`:

```js
test('splitIntoBlocks does not bridge a page break onto an entry whose type marker is on its second line', () => {
  const lines = [
    'animizar tr. Dar animo, alentar.',
    '',
    '',
    '500',
    '',
    '',
    'animo («Con, Dar, Levantar, Perder, Tener») ',
    'm. Energia para hacer algo o afrontar una dificultad.',
  ];
  const blocks = splitIntoBlocks(lines, 1);
  assert.equal(blocks.length, 2);
  assert.deepEqual(blocks[0].lines, ['animizar tr. Dar animo, alentar.']);
  assert.deepEqual(blocks[1].lines, [
    'animo («Con, Dar, Levantar, Perder, Tener») ',
    'm. Energia para hacer algo o afrontar una dificultad.',
  ]);
});

test('splitIntoBlocks skips a stray scan-noise line and still separates the real entry that follows', () => {
  const lines = [
    'previo m. Palabra anterior en el texto.',
    '',
    '',
    'AA',
    '',
    '',
    '501',
    '',
    '',
    'actividad («En, Dedicar, Desarrollar») ',
    'f. Estado de lo que se mueve o actua.',
  ];
  const blocks = splitIntoBlocks(lines, 1);
  assert.equal(blocks.length, 2);
  assert.deepEqual(blocks[0].lines, ['previo m. Palabra anterior en el texto.']);
  assert.deepEqual(blocks[1].lines, [
    'actividad («En, Dedicar, Desarrollar») ',
    'f. Estado de lo que se mueve o actua.',
  ]);
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `node --test scripts/extract-mm-txt-to-jsonl.test.mjs`
Expected: the 5 existing tests still pass; the 2 new tests FAIL (the misfiled-neighbor one asserts 2 blocks but gets 1; the scan-noise one either throws or asserts 2 blocks but gets a wrong split, since `AA` currently gets treated as content).

- [ ] **Step 3: Apply the fix**

In `scripts/extract-mm-txt-to-jsonl.mjs`:

1. Add a new constant next to `PAGE_NUMBER_LINE_REGEX`:

```js
const SCAN_NOISE_LINE_REGEX = /^[^\p{Ll}\d]{1,12}$/u;
```

2. Replace the existing `looksLikeEntryStart` function with:

```js
function joinLookaheadWindow(lines, startIndex, maxLines = 5) {
  const collected = [];

  for (let i = startIndex; i < lines.length && collected.length < maxLines; i += 1) {
    if (lines[i].trim() === '') break;
    collected.push(lines[i]);
  }

  return collected.join(' ');
}

function looksLikeEntryStart(lines, startIndex) {
  const window = joinLookaheadWindow(lines, startIndex).trim();

  if (!/^\p{Ll}/u.test(window)) {
    return false;
  }

  const scanWindow = window.slice(0, 220);
  return [...scanWindow.matchAll(TYPE_REGEX)].length > 0;
}
```

3. In `splitIntoBlocks`, update the top-level unconditional skip check (the one currently reading `if (line.trim() !== '' && PAGE_NUMBER_LINE_REGEX.test(line))`) to also match scan-noise lines:

```js
    if (line.trim() !== '' && (PAGE_NUMBER_LINE_REGEX.test(line) || SCAN_NOISE_LINE_REGEX.test(line))) {
      offset += 1;
      continue;
    }
```

4. In the blank-line peek loop (the `while (peek < lines.length) { ... }` loop Task 1 added), update the candidate check to treat scan-noise lines the same as page-number lines, and update the two call sites of `looksLikeEntryStart` accordingly. Replace the loop body with:

```js
        let peek = offset + 1;
        let sawNoise = false;

        while (peek < lines.length) {
          while (peek < lines.length && lines[peek].trim() === '') {
            peek += 1;
          }

          const candidate = peek < lines.length ? lines[peek].trim() : '';

          if (candidate && (PAGE_NUMBER_LINE_REGEX.test(candidate) || SCAN_NOISE_LINE_REGEX.test(candidate))) {
            sawNoise = true;
            peek += 1;
            continue;
          }

          break;
        }

        const nextContentLine = peek < lines.length ? lines[peek] : '';

        if (sawNoise && nextContentLine && !looksLikeEntryStart(lines, peek)) {
          offset = peek;
          continue;
        }
```

(Rename `sawPageNumber` to `sawNoise` throughout this block — same variable, clearer name now that it also covers scan-noise lines. Everything else in `splitIntoBlocks` — the appendix-marker check, the final block-push, the rest of the loop — is unchanged.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test scripts/extract-mm-txt-to-jsonl.test.mjs`
Expected: PASS (7/7 tests — the original 5 plus these 2 new ones)

- [ ] **Step 5: Regenerate the real data and verify the specific known-bad lemmas are fixed**

Run: `node scripts/extract-mm-txt-to-jsonl.mjs`, then check that `ánimo`, `actividad`, and `pamue` are now present as their own entries (not absent, not merged into a neighbor):

```bash
node -e "
const fs = require('fs');
const lines = fs.readFileSync('data/diccionario-maria-moliner.jsonl','utf8').split('\n').filter(Boolean);
const ids = new Set(lines.map((l) => JSON.parse(l).id));
for (const id of ['animo', 'actividad', 'pamue']) {
  console.log(id, ids.has(id) ? 'PRESENT' : 'MISSING');
}
"
```

Expected: all three print `PRESENT`. Also print the new total entry count and compare it to 37718 (Task 1's post-fix count) — report the new number and a brief sanity note (it should be close to 37718, likely a little higher since previously-misfiled/vanished entries now surface as their own entries; it is **not** expected to reach exactly 37792, since ~64 of the original 74-entry gap was correct orphan-fragment cleanup that this task does not undo).

- [ ] **Step 6: Commit**

```bash
git add scripts/extract-mm-txt-to-jsonl.mjs scripts/extract-mm-txt-to-jsonl.test.mjs data/diccionario-maria-moliner.jsonl
git commit -m "fix(extract): widen entry-start lookahead, skip scan-noise lines around page breaks"
```

---

## Self-Review

**Spec coverage:** Marker table (Task 2/3), page-break bug (Task 1), schema (Task 4), storage (Task 5), files/CLI (Task 6), validation (Task 7) — every spec section has a task. `campoSemantico`/enrichment are explicitly out of scope per spec and untouched here.

**Placeholder scan:** No TBD/TODO markers; every step has runnable code and an exact command.

**Type consistency:** `buildEntry()`'s return shape (Task 4) matches `writeEntriesToSqlite()`'s consumed shape (Task 5) and the spec's JSON schema field-for-field (`senses`, `subsenses`, `catalog`, `synonyms`, `antonyms`, `antonymsHeuristic`, `crossReferences`, `expressions`, `semanticField`, `source`, `startLine`, `endLine`) — checked against both Task definitions above.
