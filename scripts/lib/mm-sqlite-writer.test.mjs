import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createSchema, createWriter } from './mm-sqlite-writer.mjs';

function openDb() {
  const db = new DatabaseSync(':memory:');
  createSchema(db);
  return db;
}

function all(db, sql) {
  return db.prepare(sql).all().map((row) => ({ ...row }));
}

function one(db, sql) {
  return { ...db.prepare(sql).get() };
}

test('createSchema creates one table per roadmap entity', () => {
  const db = openDb();
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all()
    .map((row) => row.name);
  assert.deepEqual(tables, [
    'antonyms',
    'catalog_items',
    'cross_references',
    'entries',
    'examples',
    'expressions',
    'senses',
    'subsenses',
    'synonyms',
  ]);
  db.close();
});

test('insertEntry writes the entries row, keyed by a surrogate id (source_id is not unique)', () => {
  const db = openDb();
  const { insertEntry } = createWriter(db);
  insertEntry(
    { id: 'abad', lemma: 'abad', types: ['m'], initialMeta: '', header: 'abad m.', source: 'mm', startLine: 10, endLine: 12 },
    { senses: [], expressions: [] },
  );
  const rows = all(db, 'SELECT * FROM entries');
  assert.deepEqual(rows, [
    {
      id: rows[0].id,
      source_id: 'abad',
      lemma: 'abad',
      types: '["m"]',
      initial_meta: '',
      header: 'abad m.',
      source: 'mm',
      start_line: 10,
      end_line: 12,
      etimologia: null,
      area_uso: null,
      nivel_uso: null,
      cat_gram: null,
      nombre_cientifico: null,
      conjugacion: null,
      notas_uso: null,
      voz: null,
      anagrama: null,
      antiguo: null,
      desuso: null,
      sinonimos_lucene: null,
    },
  ]);
  db.close();
});

test('insertEntry writes Lucene enrichment columns onto the entries row when given an enrichment record', () => {
  const db = openDb();
  const { insertEntry } = createWriter(db);
  insertEntry(
    { id: 'ademan', lemma: 'ademán', types: ['m'], initialMeta: '', header: 'ademán m.', source: 'mm', startLine: 1, endLine: 1 },
    { senses: [], expressions: [] },
    {
      etimologia: ['árabe andalusí', 'árabe clásico'],
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
      sinonimos: ['Actitud', 'Maneras', 'modales'],
    },
  );
  const row = one(db, 'SELECT etimologia, area_uso, cat_gram, voz, antiguo, desuso, sinonimos_lucene FROM entries');
  assert.deepEqual(row, {
    etimologia: '["árabe andalusí","árabe clásico"]',
    area_uso: '[]',
    cat_gram: '["masculino"]',
    voz: 'ademán del árabe andalusí',
    antiguo: 0,
    desuso: 0,
    sinonimos_lucene: '["Actitud","Maneras","modales"]',
  });
  db.close();
});

test('insertEntry accepts two entries that share a source_id (duplicate OCR ids do not crash)', () => {
  const db = openDb();
  const { insertEntry } = createWriter(db);
  const empty = { senses: [], expressions: [] };
  insertEntry({ id: 'a', lemma: "a'", types: [], initialMeta: '', header: '', source: 'mm', startLine: 1, endLine: 1 }, empty);
  insertEntry({ id: 'a', lemma: 'a”', types: [], initialMeta: '', header: '', source: 'mm', startLine: 2, endLine: 2 }, empty);
  const rows = all(db, 'SELECT source_id, lemma FROM entries ORDER BY id');
  assert.deepEqual(rows, [
    { source_id: 'a', lemma: "a'" },
    { source_id: 'a', lemma: 'a”' },
  ]);
  db.close();
});

test('insertEntry writes a sense row linked to its entry via the surrogate entry id', () => {
  const db = openDb();
  const { insertEntry } = createWriter(db);
  insertEntry(
    { id: 'abad', lemma: 'abad', types: ['m'], initialMeta: '', header: 'abad m.', source: 'mm', startLine: 1, endLine: 1 },
    {
      senses: [
        { number: 1, definition: 'Superior de un monasterio.', examples: [], synonyms: [], crossReferences: [], antonym: null, subsenses: [], catalog: [] },
      ],
      expressions: [],
    },
  );
  const entryId = one(db, 'SELECT id FROM entries').id;
  const rows = all(db, 'SELECT entry_id, expression_id, number, definition FROM senses');
  assert.deepEqual(rows, [{ entry_id: entryId, expression_id: null, number: 1, definition: 'Superior de un monasterio.' }]);
  db.close();
});

test('insertEntry writes examples, synonyms, cross-references and antonym for a sense', () => {
  const db = openDb();
  const { insertEntry } = createWriter(db);
  insertEntry(
    { id: 'soltar', lemma: 'soltar', types: ['tr'], initialMeta: '', header: 'soltar tr.', source: 'mm', startLine: 1, endLine: 1 },
    {
      senses: [
        {
          number: 1,
          definition: 'Dejar de tener asida una cosa.',
          examples: ['Se le soltó de la mano'],
          synonyms: ['Dejar'],
          crossReferences: ['cosa'],
          antonym: 'coger',
          subsenses: [],
          catalog: [],
        },
      ],
      expressions: [],
    },
  );
  const senseId = one(db, 'SELECT id FROM senses').id;
  assert.deepEqual(all(db, 'SELECT sense_id, subsense_id, text FROM examples'), [
    { sense_id: senseId, subsense_id: null, text: 'Se le soltó de la mano' },
  ]);
  assert.deepEqual(all(db, 'SELECT sense_id, subsense_id, word FROM synonyms'), [
    { sense_id: senseId, subsense_id: null, word: 'Dejar' },
  ]);
  assert.deepEqual(all(db, 'SELECT sense_id, subsense_id, word FROM cross_references'), [
    { sense_id: senseId, subsense_id: null, word: 'cosa' },
  ]);
  assert.deepEqual(all(db, 'SELECT sense_id, subsense_id, word FROM antonyms'), [
    { sense_id: senseId, subsense_id: null, word: 'coger' },
  ]);
  db.close();
});

test('insertEntry writes catalog items linked to a sense', () => {
  const db = openDb();
  const { insertEntry } = createWriter(db);
  insertEntry(
    { id: 'anima', lemma: 'ánima', types: ['f'], initialMeta: '1', header: 'ánima 1 f.', source: 'mm', startLine: 1, endLine: 1 },
    {
      senses: [
        {
          number: 1,
          definition: 'Alma de los difuntos.',
          examples: [],
          synonyms: [],
          crossReferences: [],
          antonym: null,
          subsenses: [],
          catalog: ['Particularmente, las que están en el Purgatorio.'],
        },
      ],
      expressions: [],
    },
  );
  const senseId = one(db, 'SELECT id FROM senses').id;
  assert.deepEqual(all(db, 'SELECT sense_id, subsense_id, text FROM catalog_items'), [
    { sense_id: senseId, subsense_id: null, text: 'Particularmente, las que están en el Purgatorio.' },
  ]);
  db.close();
});

test('insertEntry writes a subsense linked to its sense, with its own catalog items', () => {
  const db = openDb();
  const { insertEntry } = createWriter(db);
  insertEntry(
    { id: 'ademan', lemma: 'ademán', types: ['m'], initialMeta: '', header: 'ademán m.', source: 'mm', startLine: 1, endLine: 1 },
    {
      senses: [
        {
          number: 1,
          definition: 'Movimiento que revela una actitud.',
          examples: [],
          synonyms: [],
          crossReferences: [],
          antonym: null,
          catalog: [],
          subsenses: [
            {
              definition: '(pl.) Con un calificativo.',
              examples: ['Tener ademanes suaves'],
              synonyms: [],
              crossReferences: [],
              antonym: null,
              catalog: ['Un dato adicional.'],
            },
          ],
        },
      ],
      expressions: [],
    },
  );
  const senseId = one(db, 'SELECT id FROM senses').id;
  const subsenseRow = one(db, 'SELECT id, sense_id, definition FROM subsenses');
  assert.deepEqual(subsenseRow, { id: subsenseRow.id, sense_id: senseId, definition: '(pl.) Con un calificativo.' });
  assert.deepEqual(all(db, 'SELECT sense_id, subsense_id, text FROM examples'), [
    { sense_id: null, subsense_id: subsenseRow.id, text: 'Tener ademanes suaves' },
  ]);
  assert.deepEqual(all(db, 'SELECT sense_id, subsense_id, text FROM catalog_items'), [
    { sense_id: null, subsense_id: subsenseRow.id, text: 'Un dato adicional.' },
  ]);
  db.close();
});

test('insertEntry writes expressions and links their senses via expression_id', () => {
  const db = openDb();
  const { insertEntry } = createWriter(db);
  insertEntry(
    { id: 'abogado', lemma: 'abogado, -a', types: ['n'], initialMeta: '', header: 'abogado, -a n.', source: 'mm', startLine: 1, endLine: 1 },
    {
      senses: [],
      expressions: [
        {
          phrase: 'ABOGADO DEL DIABLO',
          senses: [
            { number: 1, definition: 'Miembro de una congregación.', examples: [], synonyms: [], crossReferences: [], antonym: null, subsenses: [], catalog: [] },
          ],
        },
      ],
    },
  );
  const entryId = one(db, 'SELECT id FROM entries').id;
  const expressionRow = one(db, 'SELECT id, entry_id, phrase FROM expressions');
  assert.deepEqual(expressionRow, { id: expressionRow.id, entry_id: entryId, phrase: 'ABOGADO DEL DIABLO' });
  const senseRow = one(db, 'SELECT entry_id, expression_id, definition FROM senses');
  assert.deepEqual(senseRow, { entry_id: entryId, expression_id: expressionRow.id, definition: 'Miembro de una congregación.' });
  db.close();
});
