#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { buildEntry } from './lib/mm-build-entry.mjs';
import { createSchema, createWriter } from './lib/mm-sqlite-writer.mjs';
import { matchLuceneToTxtEntries } from './lib/mm-lucene-merge.mjs';

const DEFAULT_INPUT = path.resolve('data/diccionario-maria-moliner.jsonl');
const DEFAULT_LUCENE_INPUT = path.resolve('data/diccionario-maria-moliner-lucene.jsonl');
const DEFAULT_OUTPUT_JSONL = path.resolve('data/diccionario-maria-moliner-v2.jsonl');
const DEFAULT_OUTPUT_SQLITE = path.resolve('data/diccionario-maria-moliner.sqlite');

function parseArgs(argv) {
  const options = {
    input: DEFAULT_INPUT,
    luceneInput: DEFAULT_LUCENE_INPUT,
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

    if (arg === '--lucene-input' && argv[index + 1]) {
      options.luceneInput = path.resolve(argv[index + 1]);
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

export function toJsonlRecord(record, built, enrichment = null) {
  const jsonlRecord = {
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

  if (enrichment) {
    jsonlRecord.etimologia = enrichment.etimologia;
    jsonlRecord.areaUso = enrichment.areaUso;
    jsonlRecord.nivelUso = enrichment.nivelUso;
    jsonlRecord.catGram = enrichment.catGram;
    jsonlRecord.nombreCientifico = enrichment.nombreCientifico;
    jsonlRecord.conjugacion = enrichment.conjugacion;
    jsonlRecord.notasUso = enrichment.notasUso;
    jsonlRecord.voz = enrichment.voz;
    jsonlRecord.anagrama = enrichment.anagrama;
    jsonlRecord.antiguo = enrichment.antiguo;
    jsonlRecord.desuso = enrichment.desuso;
    jsonlRecord.sinonimosLucene = enrichment.sinonimos;
  }

  return jsonlRecord;
}

export function buildGapFillRecord(luceneRecord) {
  return {
    id: luceneRecord.id,
    lemma: luceneRecord.lemma,
    types: [],
    initialMeta: luceneRecord.homographNumber ? String(luceneRecord.homographNumber) : '',
    header: luceneRecord.homographNumber
      ? `${luceneRecord.lemma} ${luceneRecord.homographNumber}`
      : luceneRecord.lemma,
    definition: luceneRecord.definition,
    source: luceneRecord.source,
    startLine: null,
    endLine: null,
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
  const luceneRecords = fs.existsSync(options.luceneInput) ? readRecords(options.luceneInput) : [];
  const { enrichments, gapFill } = matchLuceneToTxtEntries(records, luceneRecords);

  fs.mkdirSync(path.dirname(options.outputSqlite), { recursive: true });
  if (fs.existsSync(options.outputSqlite)) fs.unlinkSync(options.outputSqlite);
  const db = new DatabaseSync(options.outputSqlite);
  createSchema(db);
  const { insertEntry } = createWriter(db);

  const jsonlLines = [];
  db.exec('BEGIN');
  for (let i = 0; i < records.length; i += 1) {
    const record = records[i];
    const enrichment = enrichments[i];
    const built = buildEntry(record.definition);
    insertEntry(record, built, enrichment);
    jsonlLines.push(JSON.stringify(toJsonlRecord(record, built, enrichment)));
  }
  for (const luceneRecord of gapFill) {
    const record = buildGapFillRecord(luceneRecord);
    const built = buildEntry(record.definition);
    insertEntry(record, built, luceneRecord);
    jsonlLines.push(JSON.stringify(toJsonlRecord(record, built, luceneRecord)));
  }
  db.exec('COMMIT');
  db.close();

  fs.mkdirSync(path.dirname(options.outputJsonl), { recursive: true });
  fs.writeFileSync(options.outputJsonl, jsonlLines.length ? `${jsonlLines.join('\n')}\n` : '', 'utf8');

  console.log(`Entradas .txt procesadas: ${records.length} (${enrichments.filter(Boolean).length} enriquecidas con Lucene)`);
  console.log(`Entradas nuevas de Lucene (gap-fill): ${gapFill.length}`);
  console.log(`JSONL: ${options.outputJsonl}`);
  console.log(`SQLite: ${options.outputSqlite}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
