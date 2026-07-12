import zlib from 'node:zlib';

const FIELD_IS_COMPRESSED = 0x04;

function readVInt(buffer, pos) {
  let shift = 0;
  let result = 0;
  let b;
  do {
    b = buffer[pos.value++];
    result |= (b & 0x7f) << shift;
    shift += 7;
  } while (b & 0x80);
  return result;
}

function readLong(buffer, pos) {
  const hi = buffer.readUInt32BE(pos.value);
  const lo = buffer.readUInt32BE(pos.value + 4);
  pos.value += 8;
  return hi * 4294967296 + lo;
}

function readLuceneString(buffer, pos) {
  const len = readVInt(buffer, pos);
  const s = buffer.toString('utf8', pos.value, pos.value + len);
  pos.value += len;
  return s;
}

export function parseCompoundFileDirectory(buffer) {
  const pos = { value: 0 };
  const count = readVInt(buffer, pos);
  const files = [];
  for (let i = 0; i < count; i += 1) {
    const offset = readLong(buffer, pos);
    const name = readLuceneString(buffer, pos);
    files.push({ name, offset });
  }
  return { files };
}

export function parseFieldNames(buffer, offset) {
  const pos = { value: offset };
  const count = readVInt(buffer, pos);
  const fields = [];
  for (let i = 0; i < count; i += 1) {
    fields.push(readLuceneString(buffer, pos));
    pos.value += 1; // per-field bits byte, not needed here
  }
  return { fields, end: pos.value };
}

export function* readStoredFields(buffer, { start, end, fields }) {
  const pos = { value: start };
  while (pos.value < end) {
    const numFields = readVInt(buffer, pos);
    const doc = {};
    for (let i = 0; i < numFields; i += 1) {
      const fieldNumber = readVInt(buffer, pos);
      const bits = buffer[pos.value++];
      const len = readVInt(buffer, pos);
      const raw = buffer.subarray(pos.value, pos.value + len);
      pos.value += len;
      const value = bits & FIELD_IS_COMPRESSED ? zlib.inflateSync(raw).toString('utf8') : raw.toString('utf8');
      doc[fields[fieldNumber]] = value;
    }
    yield doc;
  }
}
