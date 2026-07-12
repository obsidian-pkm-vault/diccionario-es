import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createSchema, createWriter } from './mm-sqlite-writer.mjs';
import { searchEntries, getEntryDetail } from './mm-sqlite-reader.mjs';

function seededDb() {
  const db = new DatabaseSync(':memory:');
  createSchema(db);
  const { insertEntry } = createWriter(db);

  insertEntry(
    { id: 'ademan', lemma: 'ademán', types: ['m'], initialMeta: '', header: 'ademán m.', source: 'mm', startLine: 1, endLine: 1 },
    {
      senses: [
        {
          number: 1,
          definition: 'Movimiento que revela una actitud.',
          examples: ['Hizo un ademán'],
          synonyms: ['Actitud'],
          crossReferences: [],
          antonym: null,
          catalog: ['Un dato de catálogo.'],
          subsenses: [
            {
              definition: '(pl.) Con un calificativo.',
              examples: ['Tener ademanes suaves'],
              synonyms: [],
              crossReferences: [],
              antonym: null,
              catalog: [],
            },
          ],
        },
      ],
      expressions: [
        {
          phrase: 'EN ADEMAN DE',
          senses: [
            { number: 1, definition: 'Con actitud de.', examples: [], synonyms: [], crossReferences: [], antonym: null, subsenses: [], catalog: [] },
          ],
        },
      ],
    },
    {
      etimologia: ['árabe andalusí'],
      areaUso: [],
      nivelUso: [],
      catGram: ['masculino'],
      nombreCientifico: null,
      conjugacion: null,
      notasUso: null,
      voz: 'ademán del árabe andalusí',
      anagrama: 'a d e m a n',
      antiguo: false,
      desuso: false,
      sinonimos: ['Actitud', 'Maneras'],
    },
  );

  insertEntry(
    { id: 'abad', lemma: 'abad', types: ['m'], initialMeta: '', header: 'abad m.', source: 'mm', startLine: 2, endLine: 2 },
    { senses: [{ number: 1, definition: 'Superior de un monasterio.', examples: [], synonyms: [], crossReferences: [], antonym: null, catalog: [], subsenses: [] }], expressions: [] },
  );

  return db;
}

test('searchEntries finds entries whose lemma starts with the given prefix', () => {
  const db = seededDb();
  const results = searchEntries(db, 'adem', 10);
  assert.deepEqual(results, [{ id: results[0].id, lemma: 'ademán', header: 'ademán m.' }]);
  db.close();
});

test('searchEntries excludes entries that do not match the prefix', () => {
  const db = seededDb();
  const results = searchEntries(db, 'adem', 10);
  assert.equal(results.some((r) => r.lemma === 'abad'), false);
  db.close();
});

test('getEntryDetail reconstructs the full nested entry: senses, subsenses, catalog, expressions, enrichment', () => {
  const db = seededDb();
  const entryId = searchEntries(db, 'adem', 10)[0].id;

  const detail = getEntryDetail(db, entryId);

  assert.equal(detail.lemma, 'ademán');
  assert.equal(detail.header, 'ademán m.');
  assert.deepEqual(detail.senses, [
    {
      number: 1,
      definition: 'Movimiento que revela una actitud.',
      examples: ['Hizo un ademán'],
      synonyms: ['Actitud'],
      crossReferences: [],
      antonym: null,
      catalog: ['Un dato de catálogo.'],
      subsenses: [
        {
          definition: '(pl.) Con un calificativo.',
          examples: ['Tener ademanes suaves'],
          synonyms: [],
          crossReferences: [],
          antonym: null,
          catalog: [],
        },
      ],
    },
  ]);
  assert.deepEqual(detail.expressions, [
    {
      phrase: 'EN ADEMAN DE',
      senses: [
        { number: 1, definition: 'Con actitud de.', examples: [], synonyms: [], crossReferences: [], antonym: null, catalog: [], subsenses: [] },
      ],
    },
  ]);
  assert.deepEqual(detail.enrichment, {
    etimologia: ['árabe andalusí'],
    areaUso: [],
    nivelUso: [],
    catGram: ['masculino'],
    nombreCientifico: null,
    conjugacion: null,
    notasUso: null,
    voz: 'ademán del árabe andalusí',
    anagrama: 'a d e m a n',
    antiguo: false,
    desuso: false,
    sinonimos: ['Actitud', 'Maneras'],
  });
  db.close();
});

test('getEntryDetail omits enrichment when the entry has none', () => {
  const db = seededDb();
  const entryId = searchEntries(db, 'abad', 10)[0].id;

  const detail = getEntryDetail(db, entryId);
  assert.equal(detail.enrichment, null);
  db.close();
});
