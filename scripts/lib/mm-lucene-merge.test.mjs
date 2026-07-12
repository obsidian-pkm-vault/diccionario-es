import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchLuceneToTxtEntries } from './mm-lucene-merge.mjs';

test('matchLuceneToTxtEntries pairs a single txt entry with the single Lucene entry sharing its id', () => {
  const txt = [{ id: 'abad', lemma: 'abad' }];
  const lucene = [{ id: 'abad', lemma: 'abad', homographNumber: null }];

  const result = matchLuceneToTxtEntries(txt, lucene);
  assert.deepEqual(result.enrichments, [lucene[0]]);
  assert.deepEqual(result.gapFill, []);
});

test('matchLuceneToTxtEntries leaves a txt entry unenriched when no Lucene id matches (the unrelated Lucene entry becomes gapFill)', () => {
  const txt = [{ id: 'zzz-not-in-lucene', lemma: 'zzz' }];
  const lucene = [{ id: 'abad', lemma: 'abad', homographNumber: null }];

  const result = matchLuceneToTxtEntries(txt, lucene);
  assert.deepEqual(result.enrichments, [null]);
  assert.deepEqual(result.gapFill, [lucene[0]]);
});

test('matchLuceneToTxtEntries aligns same-id homographs positionally, in list order', () => {
  const txt = [
    { id: 'a', lemma: "a'" },
    { id: 'a', lemma: 'a”' },
  ];
  const lucene = [
    { id: 'a', lemma: 'a', homographNumber: 1 },
    { id: 'a', lemma: 'a', homographNumber: 2 },
  ];

  const result = matchLuceneToTxtEntries(txt, lucene);
  assert.deepEqual(result.enrichments, [lucene[0], lucene[1]]);
  assert.deepEqual(result.gapFill, []);
});

test('matchLuceneToTxtEntries sends unmatched extra Lucene homographs to gapFill', () => {
  const txt = [{ id: 'aba', lemma: 'aba' }];
  const lucene = [
    { id: 'aba', lemma: 'aba', homographNumber: 1 },
    { id: 'aba', lemma: 'aba', homographNumber: 2 },
  ];

  const result = matchLuceneToTxtEntries(txt, lucene);
  assert.deepEqual(result.enrichments, [lucene[0]]);
  assert.deepEqual(result.gapFill, [lucene[1]]);
});

test('matchLuceneToTxtEntries puts a Lucene-only id entirely in gapFill', () => {
  const txt = [];
  const lucene = [{ id: 'aaronita', lemma: 'aaronita', homographNumber: null }];

  const result = matchLuceneToTxtEntries(txt, lucene);
  assert.deepEqual(result.enrichments, []);
  assert.deepEqual(result.gapFill, [lucene[0]]);
});

test('matchLuceneToTxtEntries leaves extra txt homographs unenriched when Lucene has fewer', () => {
  const txt = [
    { id: 'x', lemma: 'x' },
    { id: 'x', lemma: 'x' },
  ];
  const lucene = [{ id: 'x', lemma: 'x', homographNumber: null }];

  const result = matchLuceneToTxtEntries(txt, lucene);
  assert.deepEqual(result.enrichments, [lucene[0], null]);
  assert.deepEqual(result.gapFill, []);
});
