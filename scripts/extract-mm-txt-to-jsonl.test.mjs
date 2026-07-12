import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitIntoBlocks, looksLikeEntryStart } from './extract-mm-txt-to-jsonl.mjs';

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

test('splitIntoBlocks bridges two consecutive page-number lines with no blank between them', () => {
  const lines = [
    'ir. 1 intr. Moverse hacia un sitio que se expresa: veces no',
    'se expresa el lugar ni la direccion.',
    '',
    '',
    '787',
    '788',
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

test('splitIntoBlocks bridges two consecutive page-number lines separated by a blank', () => {
  const lines = [
    'ir. 1 intr. Moverse hacia un sitio que se expresa: veces no',
    'se expresa el lugar ni la direccion.',
    '',
    '',
    '787',
    '',
    '788',
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

test('splitIntoBlocks does not drop a scan-noise-shaped line that is genuine mid-entry content', () => {
  const lines = [
    'ejemplo m. Primera parte de la definicion.',
    'V.',
    'Segunda parte que continua tras esa linea corta.',
  ];
  const blocks = splitIntoBlocks(lines, 1);
  assert.equal(blocks.length, 1);
  assert.deepEqual(blocks[0].lines, [
    'ejemplo m. Primera parte de la definicion.',
    'V.',
    'Segunda parte que continua tras esa linea corta.',
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

test('looksLikeEntryStart accepts a genuine entry whose type marker follows only a lemma and a usage-note parenthetical', () => {
  const lines = [
    'ánimo 1 («Impresionar, Influir en, Elevar, Levantar, ',
    'Esparcir, Explayar, Abatir, Deprimir») m. Facultad de ',
    'sentir y obrar.',
  ];
  assert.equal(looksLikeEntryStart(lines, 0), true);
});

test('looksLikeEntryStart rejects a coincidental type-marker match inside a quoted example', () => {
  const lines = [
    'un sitio: "Echar una carta al buzón". O («a, en, por, ',
    'sobre») Impulsar una *cosa hacia un sitio de cualquier ',
    'modo.',
  ];
  assert.equal(looksLikeEntryStart(lines, 0), false);
});
