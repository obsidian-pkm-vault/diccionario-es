import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toJsonlRecord, buildGapFillRecord } from './parse-mm-definitions.mjs';

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

test('toJsonlRecord adds Lucene enrichment fields when given an enrichment record', () => {
  const record = {
    id: 'ademan', lemma: 'ademán', types: ['m'], initialMeta: '', header: 'ademán m.',
    definition: 'Movimiento del cuerpo.', source: 'mm', startLine: 1, endLine: 1,
  };
  const built = { senses: [], expressions: [] };
  const enrichment = { etimologia: ['árabe andalusí'], sinonimos: ['Actitud'], catGram: ['masculino'] };

  const result = toJsonlRecord(record, built, enrichment);
  assert.equal(result.etimologia, enrichment.etimologia);
  assert.equal(result.sinonimosLucene, enrichment.sinonimos);
  assert.equal(result.catGram, enrichment.catGram);
});

test('toJsonlRecord omits enrichment fields when no enrichment record is given', () => {
  const record = {
    id: 'abad', lemma: 'abad', types: ['m'], initialMeta: '', header: 'abad m.',
    definition: 'Superior de un monasterio.', source: 'mm', startLine: 1, endLine: 1,
  };
  const result = toJsonlRecord(record, { senses: [], expressions: [] });
  assert.equal('etimologia' in result, false);
  assert.equal('sinonimosLucene' in result, false);
});

test('buildGapFillRecord shapes a Lucene-only record for the buildEntry/insertEntry pipeline', () => {
  const luceneRecord = {
    id: 'aaronita', lemma: 'aaronita', homographNumber: null, source: 'lucene-todo-index',
    definition: 'Perteneciente a la familia de Aarón.',
  };
  assert.deepEqual(buildGapFillRecord(luceneRecord), {
    id: 'aaronita',
    lemma: 'aaronita',
    types: [],
    initialMeta: '',
    header: 'aaronita',
    definition: 'Perteneciente a la familia de Aarón.',
    source: 'lucene-todo-index',
    startLine: null,
    endLine: null,
  });
});

test('buildGapFillRecord includes the homograph number in initialMeta and header when present', () => {
  const luceneRecord = {
    id: 'aba', lemma: 'aba', homographNumber: 2, source: 'lucene-todo-index',
    definition: 'Tela gruesa de lana.',
  };
  const result = buildGapFillRecord(luceneRecord);
  assert.equal(result.initialMeta, '2');
  assert.equal(result.header, 'aba 2');
});
