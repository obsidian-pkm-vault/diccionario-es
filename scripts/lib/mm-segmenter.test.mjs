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
  const input = 'Se aplica a la cosa: “Un ejemplo’ o también: ‘Otro ejemplo”.';
  const result = extractExamples(input);
  assert.deepEqual(result.examples, ['Un ejemplo', 'Otro ejemplo']);
  assert.equal(result.text.includes('"'), false);
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
  assert.equal(stripEnclosingQuotes('”al contacto de, al roce de”'), 'al contacto de, al roce de');
  assert.equal(stripEnclosingQuotes('sin comillas'), 'sin comillas');
});
