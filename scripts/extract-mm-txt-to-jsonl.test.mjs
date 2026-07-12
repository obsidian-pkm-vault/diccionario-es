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
