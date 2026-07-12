#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { buildEntry } from './lib/mm-build-entry.mjs';
import { createSchema, createWriter } from './lib/mm-sqlite-writer.mjs';

const DEFAULT_INPUT = path.resolve('data/diccionario-maria-moliner.jsonl');
const DEFAULT_OUTPUT_JSONL = path.resolve('data/diccionario-maria-moliner-v2.jsonl');
const DEFAULT_OUTPUT_SQLITE = path.resolve('data/diccionario-maria-moliner.sqlite');

function parseArgs(argv) {
  const options = {
    input: DEFAULT_INPUT,
    outputJsonl: DEFAULT_OUTPUT_JSONL,
    outputSqlite: DEFAULT_OUTPUT_SQLITE,
    limit: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--input' && argv[index + 1]) {
      options.input = path.resolve(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === '--output-jsonl' && argv[index + 1]) {
      options.outputJsonl = path.resolve(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === '--output-sqlite' && argv[index + 1]) {
      options.outputSqlite = path.resolve(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === '--limit' && argv[index + 1]) {
      options.limit = Number.parseInt(argv[index + 1], 10);
      index += 1;
      continue;
    }
  }

  return options;
}

export function toJsonlRecord(record, built) {
  return {
    id: record.id,
    lemma: record.lemma,
    types: record.types,
    initialMeta: record.initialMeta,
    header: record.header,
    definition: record.definition,
    source: record.source,
    startLine: record.startLine,
    endLine: record.endLine,
    senses: built.senses,
    expressions: built.expressions,
  };
}

function readRecords(inputPath, limit) {
  const lines = fs.readFileSync(inputPath, 'utf8').split('\n').filter((line) => line.trim() !== '');
  const records = lines.map((line) => JSON.parse(line));
  return limit ? records.slice(0, limit) : records;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const records = readRecords(options.input, options.limit);

  fs.mkdirSync(path.dirname(options.outputSqlite), { recursive: true });
  if (fs.existsSync(options.outputSqlite)) fs.unlinkSync(options.outputSqlite);
  const db = new DatabaseSync(options.outputSqlite);
  createSchema(db);
  const { insertEntry } = createWriter(db);

  const jsonlLines = [];
  db.exec('BEGIN');
  for (const record of records) {
    const built = buildEntry(record.definition);
    insertEntry(record, built);
    jsonlLines.push(JSON.stringify(toJsonlRecord(record, built)));
  }
  db.exec('COMMIT');
  db.close();

  fs.mkdirSync(path.dirname(options.outputJsonl), { recursive: true });
  fs.writeFileSync(options.outputJsonl, jsonlLines.length ? `${jsonlLines.join('\n')}\n` : '', 'utf8');

  console.log(`Entradas procesadas: ${records.length}`);
  console.log(`JSONL: ${options.outputJsonl}`);
  console.log(`SQLite: ${options.outputSqlite}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
