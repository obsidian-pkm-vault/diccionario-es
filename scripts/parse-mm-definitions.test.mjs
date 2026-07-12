import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toJsonlRecord } from './parse-mm-definitions.mjs';

test('toJsonlRecord keeps the original entry fields and adds the built senses/expressions', () => {
  const record = {
    id: 'abad',
    lemma: 'abad',
    types: ['m'],
    initialMeta: '',
    header: 'abad m.',
    definition: 'Superior de un monasterio.',
    source: 'mm',
    startLine: 1,
    endLine: 1,
  };
  const built = { senses: [{ number: 1, definition: 'Superior de un monasterio.' }], expressions: [] };

  assert.deepEqual(toJsonlRecord(record, built), {
    id: 'abad',
    lemma: 'abad',
    types: ['m'],
    initialMeta: '',
    header: 'abad m.',
    definition: 'Superior de un monasterio.',
    source: 'mm',
    startLine: 1,
    endLine: 1,
    senses: built.senses,
    expressions: built.expressions,
  });
});
