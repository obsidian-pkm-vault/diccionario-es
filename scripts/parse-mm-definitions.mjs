#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { buildEntry } from './lib/mm-build-entry.mjs';
import { createSchema, createWriter } from './lib/mm-sqlite-writer.mjs';
import { matchLuceneToTxtEntries } from './lib/mm-lucene-merge.mjs';
import { parseArgs as parseCliArgs, resolvePath, parseInteger } from './lib/cli-args.mjs';

const DEFAULT_INPUT = path.resolve('data/diccionario-maria-moliner.jsonl');
const DEFAULT_LUCENE_INPUT = path.resolve('data/diccionario-maria-moliner-lucene.jsonl');
const DEFAULT_OUTPUT_JSONL = path.resolve('data/diccionario-maria-moliner-v2.jsonl');
const DEFAULT_OUTPUT_SQLITE = path.resolve('data/diccionario-maria-moliner.sqlite');

function parseArgs(argv) {
  return parseCliArgs(
    argv,
    {
      input: DEFAULT_INPUT,
      luceneInput: DEFAULT_LUCENE_INPUT,
      outputJsonl: DEFAULT_OUTPUT_JSONL,
      outputSqlite: DEFAULT_OUTPUT_SQLITE,
      limit: undefined,
    },
    {
      '--input': { key: 'input', parse: resolvePath },
      '--lucene-input': { key: 'luceneInput', parse: resolvePath },
      '--output-jsonl': { key: 'outputJsonl', parse: resolvePath },
      '--output-sqlite': { key: 'outputSqlite', parse: resolvePath },
      '--limit': { key: 'limit', parse: parseInteger },
    },
  );
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
    jsonlRecord.etymology = enrichment.etymology;
    jsonlRecord.usageArea = enrichment.usageArea;
    jsonlRecord.usageLevel = enrichment.usageLevel;
    jsonlRecord.partOfSpeech = enrichment.partOfSpeech;
    jsonlRecord.gender = enrichment.gender;
    jsonlRecord.scientificName = enrichment.scientificName;
    jsonlRecord.conjugation = enrichment.conjugation;
    jsonlRecord.usageNotes = enrichment.usageNotes;
    jsonlRecord.headword = enrichment.headword;
    jsonlRecord.anagram = enrichment.anagram;
    jsonlRecord.archaic = enrichment.archaic;
    jsonlRecord.obsolete = enrichment.obsolete;
    jsonlRecord.synonymsLucene = enrichment.synonyms;
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

function processEntry(insertEntry, record, enrichment) {
  const built = buildEntry(record.definition);
  insertEntry(record, built, enrichment);
  return JSON.stringify(toJsonlRecord(record, built, enrichment));
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
  records.forEach((record, i) => {
    jsonlLines.push(processEntry(insertEntry, record, enrichments[i]));
  });
  for (const luceneRecord of gapFill) {
    jsonlLines.push(processEntry(insertEntry, buildGapFillRecord(luceneRecord), luceneRecord));
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
