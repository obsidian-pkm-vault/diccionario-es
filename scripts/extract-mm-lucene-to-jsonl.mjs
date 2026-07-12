#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseCompoundFileDirectory, parseFieldNames, readStoredFields } from './lib/lucene-cfs-reader.mjs';
import { makeId } from './extract-mm-txt-to-jsonl.mjs';

const DEFAULT_INPUT = path.resolve('data/Diccionario_Maria_Moliner_3a_ed/Setup/index/todo/_7kh.cfs');
const DEFAULT_OUTPUT = path.resolve('data/diccionario-maria-moliner-lucene.jsonl');

const AT_SENTINEL_REGEX = /^@\s*/u;
const PIPE_LIST_FIELDS = ['etimologia', 'areaUso', 'nivelUso', 'catGram'];
const BOOLEAN_FIELDS = ['antiguo', 'desuso'];
const FREE_TEXT_FIELDS = ['nombreCientifico', 'conjugacion', 'notasUso', 'voz', 'anagrama'];

function parseArgs(argv) {
  const options = { input: DEFAULT_INPUT, output: DEFAULT_OUTPUT, limit: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--input' && argv[index + 1]) { options.input = path.resolve(argv[index + 1]); index += 1; continue; }
    if (arg === '--output' && argv[index + 1]) { options.output = path.resolve(argv[index + 1]); index += 1; continue; }
    if (arg === '--limit' && argv[index + 1]) { options.limit = Number.parseInt(argv[index + 1], 10); index += 1; continue; }
  }
  return options;
}

export function parseLemaField(rawLema) {
  const match = /^(.*?)\s+(\d+)$/u.exec(rawLema);
  if (!match) return { lemma: rawLema, homographNumber: null };
  return { lemma: match[1], homographNumber: Number(match[2]) };
}

function stripSentinel(value) {
  return value.replace(AT_SENTINEL_REGEX, '').trim();
}

function parsePipeList(value) {
  return stripSentinel(value)
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean);
}

export function normalizeLuceneRecord(doc) {
  const { lemma, homographNumber } = parseLemaField(doc.lema);
  const record = {
    id: makeId(lemma),
    lemma,
    homographNumber,
    definition: doc.acepcion ? stripSentinel(doc.acepcion) : '',
    source: 'lucene-todo-index',
  };

  for (const field of PIPE_LIST_FIELDS) {
    record[field] = doc[field] ? parsePipeList(doc[field]) : [];
  }

  for (const field of BOOLEAN_FIELDS) {
    record[field] = Boolean(doc[field]);
  }

  for (const field of FREE_TEXT_FIELDS) {
    record[field] = doc[field] ? stripSentinel(doc[field]) : null;
  }

  record.sinonimos = doc.sinonimos
    ? stripSentinel(doc.sinonimos).split(/\s+/u).filter(Boolean)
    : [];

  return record;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const buffer = fs.readFileSync(options.input);
  const { files } = parseCompoundFileDirectory(buffer);
  const fnmFile = files.find((f) => f.name.endsWith('.fnm'));
  const fdtFile = files.find((f) => f.name.endsWith('.fdt'));
  const fdtIndex = files.indexOf(fdtFile);
  const fdtEnd = fdtIndex + 1 < files.length ? files[fdtIndex + 1].offset : buffer.length;

  const { fields } = parseFieldNames(buffer, fnmFile.offset);

  const records = [];
  for (const doc of readStoredFields(buffer, { start: fdtFile.offset, end: fdtEnd, fields })) {
    if (!doc.lema) continue;
    records.push(normalizeLuceneRecord(doc));
    if (options.limit && records.length >= options.limit) break;
  }

  const jsonl = records.map((record) => JSON.stringify(record)).join('\n');
  fs.mkdirSync(path.dirname(options.output), { recursive: true });
  fs.writeFileSync(options.output, jsonl ? `${jsonl}\n` : '', 'utf8');

  console.log(`Entradas extraidas: ${records.length}`);
  console.log(`Salida: ${options.output}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
