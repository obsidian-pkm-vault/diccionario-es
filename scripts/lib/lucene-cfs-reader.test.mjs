import { test } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { parseCompoundFileDirectory, parseFieldNames, readStoredFields } from './lucene-cfs-reader.mjs';

function writeVInt(bytes, value) {
  while (value > 127) {
    bytes.push((value & 0x7f) | 0x80);
    value >>>= 7;
  }
  bytes.push(value);
}

function writeLong(bytes, value) {
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(0, 0);
  buf.writeUInt32BE(value, 4);
  bytes.push(...buf);
}

function writeLuceneString(bytes, str) {
  const utf8 = Buffer.from(str, 'utf8');
  writeVInt(bytes, utf8.length);
  bytes.push(...utf8);
}

test('parseCompoundFileDirectory reads the file count, offsets and names', () => {
  const bytes = [];
  writeVInt(bytes, 2);
  writeLong(bytes, 100);
  writeLuceneString(bytes, '_1.fnm');
  writeLong(bytes, 250);
  writeLuceneString(bytes, '_1.fdt');
  const buffer = Buffer.from(bytes);

  const result = parseCompoundFileDirectory(buffer);
  assert.deepEqual(result.files, [
    { name: '_1.fnm', offset: 100 },
    { name: '_1.fdt', offset: 250 },
  ]);
});

test('parseFieldNames reads field names in declaration order', () => {
  const bytes = [];
  writeVInt(bytes, 3);
  writeLuceneString(bytes, 'lema');
  bytes.push(0x01);
  writeLuceneString(bytes, 'sinonimos');
  bytes.push(0x01);
  writeLuceneString(bytes, 'etimologia');
  bytes.push(0x01);
  const buffer = Buffer.from(bytes);

  const result = parseFieldNames(buffer, 0);
  assert.deepEqual(result.fields, ['lema', 'sinonimos', 'etimologia']);
  assert.equal(result.end, buffer.length);
});

function writeCompressedField(bytes, fieldNumber, text) {
  writeVInt(bytes, fieldNumber);
  bytes.push(0x04); // FIELD_IS_COMPRESSED
  const compressed = zlib.deflateSync(Buffer.from(text, 'utf8'));
  writeVInt(bytes, compressed.length);
  bytes.push(...compressed);
}

function writeUncompressedField(bytes, fieldNumber, text) {
  writeVInt(bytes, fieldNumber);
  bytes.push(0x00);
  writeLuceneString(bytes, text);
}

test('readStoredFields decodes a single document with a zlib-compressed field', () => {
  const bytes = [];
  writeVInt(bytes, 1); // numFields for this doc
  writeCompressedField(bytes, 0, 'ademán');
  const buffer = Buffer.from(bytes);

  const docs = [...readStoredFields(buffer, { start: 0, end: buffer.length, fields: ['lema'] })];
  assert.deepEqual(docs, [{ lema: 'ademán' }]);
});

test('readStoredFields decodes an uncompressed field without inflating it', () => {
  const bytes = [];
  writeVInt(bytes, 1);
  writeUncompressedField(bytes, 0, 'plain value');
  const buffer = Buffer.from(bytes);

  const docs = [...readStoredFields(buffer, { start: 0, end: buffer.length, fields: ['lema'] })];
  assert.deepEqual(docs, [{ lema: 'plain value' }]);
});

test('readStoredFields decodes multiple documents in sequence, each with multiple fields', () => {
  const bytes = [];
  writeVInt(bytes, 2);
  writeCompressedField(bytes, 0, 'abad');
  writeCompressedField(bytes, 1, 'Superior de un monasterio');
  writeVInt(bytes, 1);
  writeCompressedField(bytes, 0, 'abadesa');
  const buffer = Buffer.from(bytes);

  const docs = [...readStoredFields(buffer, { start: 0, end: buffer.length, fields: ['lema', 'acepcion'] })];
  assert.deepEqual(docs, [
    { lema: 'abad', acepcion: 'Superior de un monasterio' },
    { lema: 'abadesa' },
  ]);
});
