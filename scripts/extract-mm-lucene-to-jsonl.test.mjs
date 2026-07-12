import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLemaField, normalizeLuceneRecord } from './extract-mm-lucene-to-jsonl.mjs';

test('parseLemaField splits a trailing homograph number off the lemma', () => {
  assert.deepEqual(parseLemaField('a 1'), { lemma: 'a', homographNumber: 1 });
  assert.deepEqual(parseLemaField('aba 2'), { lemma: 'aba', homographNumber: 2 });
});

test('parseLemaField returns a null homographNumber when there is no trailing number', () => {
  assert.deepEqual(parseLemaField('abadejo'), { lemma: 'abadejo', homographNumber: null });
  assert.deepEqual(parseLemaField('abadiado o abadiato'), { lemma: 'abadiado o abadiato', homographNumber: null });
});

test('normalizeLuceneRecord strips the leading @ sentinel from text fields', () => {
  const record = normalizeLuceneRecord({ lema: 'abad', acepcion: '@ Superior de un monasterio' });
  assert.equal(record.definition, 'Superior de un monasterio');
});

test('normalizeLuceneRecord splits pipe-delimited fields into arrays', () => {
  const record = normalizeLuceneRecord({
    lema: 'ademán',
    etimologia: '@ | árabe andalusí | | árabe clásico |',
    catGram: '@ | masculino |',
  });
  assert.deepEqual(record.etimologia, ['árabe andalusí', 'árabe clásico']);
  assert.deepEqual(record.catGram, ['masculino']);
});

test('normalizeLuceneRecord splits the flat sinonimos field on whitespace', () => {
  const record = normalizeLuceneRecord({ lema: 'ademán', sinonimos: '@ Actitud Maneras modales' });
  assert.deepEqual(record.sinonimos, ['Actitud', 'Maneras', 'modales']);
});

test('normalizeLuceneRecord treats antiguo/desuso as booleans (present, even if empty, means true)', () => {
  const present = normalizeLuceneRecord({ lema: 'x', antiguo: '@', desuso: '@' });
  assert.equal(present.antiguo, true);
  assert.equal(present.desuso, true);

  const absent = normalizeLuceneRecord({ lema: 'x' });
  assert.equal(absent.antiguo, false);
  assert.equal(absent.desuso, false);
});

test('normalizeLuceneRecord keeps free-text fields as trimmed strings, defaulting to null when absent', () => {
  const record = normalizeLuceneRecord({
    lema: 'abandonar 1',
    nombreCientifico: '@ Gadus pollachius Mycteroperca bonaci',
    conjugacion: '@ conjugación como agradecer',
  });
  assert.equal(record.nombreCientifico, 'Gadus pollachius Mycteroperca bonaci');
  assert.equal(record.conjugacion, 'conjugación como agradecer');
  assert.equal(record.notasUso, null);
});

test('normalizeLuceneRecord carries the parsed lemma, homograph number and source tag', () => {
  const record = normalizeLuceneRecord({ lema: 'ademán 2', acepcion: '@ algo' });
  assert.equal(record.lemma, 'ademán');
  assert.equal(record.homographNumber, 2);
  assert.equal(record.source, 'lucene-todo-index');
});
