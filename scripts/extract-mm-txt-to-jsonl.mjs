#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_INPUT = path.resolve('data/diccionario-maria-moliner.txt');
const DEFAULT_OUTPUT = path.resolve('data/diccionario-maria-moliner.jsonl');
const DEFAULT_START_LINE = 1031;
const APPENDIX_MARKER = /^AP(?:E|É)NDICE\b/u;

const TYPE_REGEX = /(?:^|[\s,;])(?<type>adj|adv|m|f|n|tr|intr|prnl|prep|conj|interj|abs|aux|pl|sing|pron|art)\./giu;
const CONNECTOR_GAP_REGEX = /^\s*(?:y|o|u|e|,)??\s*$/iu;
const HEADER_MARKER_REGEX = /\s+(?:\d+\s+)?(?:\([^)]*\)\s+)*(?:Part\.|adj\.|adv\.|m\.|f\.|n\.|tr\.|intr\.|prnl\.|prep\.|conj\.|interj\.|abs\.|aux\.|pl\.|sing\.|pron\.|art\.)/iu;
const PAGE_NUMBER_LINE_REGEX = /^\s*\d{1,4}\s*$/u;
const SCAN_NOISE_LINE_REGEX = /^[^\p{Ll}\d]{1,12}$/u;
const DISQUALIFYING_PREFIX_REGEX = /[:"'“”‘’ʻ=©]/u;

function parseArgs(argv) {
  const options = {
    input: DEFAULT_INPUT,
    output: DEFAULT_OUTPUT,
    startLine: DEFAULT_START_LINE,
    limit: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--input' && argv[index + 1]) {
      options.input = path.resolve(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === '--output' && argv[index + 1]) {
      options.output = path.resolve(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === '--start-line' && argv[index + 1]) {
      options.startLine = Number.parseInt(argv[index + 1], 10);
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

export function splitIntoBlocks(lines, startLine) {
  const blocks = [];
  let currentLines = [];
  let blockStartLine = startLine;
  let lastContentLine = startLine - 1;

  let offset = 0;

  while (offset < lines.length) {
    const absoluteLine = startLine + offset;
    const line = lines[offset];

    if (APPENDIX_MARKER.test(line.trim())) {
      break;
    }

    if (currentLines.length === 0 && line.trim() !== '' && (PAGE_NUMBER_LINE_REGEX.test(line) || SCAN_NOISE_LINE_REGEX.test(line))) {
      offset += 1;
      continue;
    }

    if (line.trim() === '') {
      if (currentLines.length > 0) {
        let peek = offset + 1;
        let sawNoise = false;

        while (peek < lines.length) {
          while (peek < lines.length && lines[peek].trim() === '') {
            peek += 1;
          }

          const candidate = peek < lines.length ? lines[peek].trim() : '';

          if (candidate && (PAGE_NUMBER_LINE_REGEX.test(candidate) || SCAN_NOISE_LINE_REGEX.test(candidate))) {
            sawNoise = true;
            peek += 1;
            continue;
          }

          break;
        }

        const nextContentLine = peek < lines.length ? lines[peek] : '';

        if (sawNoise && nextContentLine && !looksLikeEntryStart(lines, peek)) {
          offset = peek;
          continue;
        }

        blocks.push({
          startLine: blockStartLine,
          endLine: lastContentLine,
          lines: currentLines,
        });
        currentLines = [];
      }

      offset += 1;
      continue;
    }

    if (currentLines.length === 0) {
      blockStartLine = absoluteLine;
    }

    currentLines.push(line);
    lastContentLine = absoluteLine;
    offset += 1;
  }

  if (currentLines.length > 0) {
    blocks.push({
      startLine: blockStartLine,
      endLine: lastContentLine,
      lines: currentLines,
    });
  }

  return blocks;
}

function normalizeBlock(lines) {
  return lines
    .join('\n')
    .replace(/(\p{L})-\n(\p{Ll})/gu, '$1$2')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function collectLeadingTypes(text) {
  const window = text.slice(0, 220);
  const matches = [...window.matchAll(TYPE_REGEX)];

  if (matches.length === 0) {
    return [];
  }

  const leadingMatches = [matches[0]];

  for (let index = 1; index < matches.length; index += 1) {
    const previous = leadingMatches[leadingMatches.length - 1];
    const current = matches[index];
    const gap = window.slice(previous.index + previous[0].length, current.index);

    if (!CONNECTOR_GAP_REGEX.test(gap)) {
      break;
    }

    leadingMatches.push(current);
  }

  return leadingMatches;
}

function collectAllHeaderTypes(text) {
  const window = text.slice(0, 220);
  return [...window.matchAll(TYPE_REGEX)];
}

export function joinLookaheadWindow(lines, startIndex, maxLines = 5) {
  const collected = [];

  for (let i = startIndex; i < lines.length && collected.length < maxLines; i += 1) {
    if (lines[i].trim() === '') break;
    collected.push(lines[i]);
  }

  return collected.join(' ');
}

export function looksLikeEntryStart(lines, startIndex) {
  const window = joinLookaheadWindow(lines, startIndex).trim();

  if (!/^\p{Ll}/u.test(window)) {
    return false;
  }

  const scanWindow = window.slice(0, 220);
  const matches = [...scanWindow.matchAll(TYPE_REGEX)];

  return matches.some((match) => !DISQUALIFYING_PREFIX_REGEX.test(scanWindow.slice(0, match.index)));
}

function cleanLemmaPrefix(prefix) {
  return prefix
    .replace(/\([^)]*\)\s*$/u, '')
    .replace(/\b\d+\s*$/u, '')
    .replace(/Part\.\s*$/iu, '')
    .replace(/\s+O\s*$/u, '')
    .trim();
}

function extractLemma(text) {
  const markerMatch = HEADER_MARKER_REGEX.exec(text);

  if (!markerMatch) {
    return null;
  }

  const prefix = text.slice(0, markerMatch.index).trim();
  const lemma = cleanLemmaPrefix(prefix);

  if (!lemma) {
    return null;
  }

  return {
    lemma,
    markerIndex: markerMatch.index,
  };
}

function makeId(lemma) {
  return lemma
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/["'“”‘’]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function parseBlock(block) {
  const text = normalizeBlock(block.lines);

  if (!text || !/^\p{Ll}/u.test(text)) {
    return null;
  }

  const lemmaData = extractLemma(text);

  if (!lemmaData) {
    return null;
  }

  const typeMatches = collectLeadingTypes(text);

  if (typeMatches.length === 0) {
    return null;
  }

  const firstType = typeMatches[0];
  const lastType = typeMatches[typeMatches.length - 1];
  const lemma = lemmaData.lemma;

  const definitionStart = lastType.index + lastType[0].length;
  const definition = text.slice(definitionStart).trim();

  if (!definition) {
    return null;
  }

  const headerMatches = collectAllHeaderTypes(text);
  const initialMeta = text.slice(lemmaData.markerIndex, firstType.index).trim();
  const hasParticipleNote = /(?:^|\s)(?:\d+\s+)?Part\.\s+de\b/iu.test(text.slice(lemmaData.markerIndex, firstType.index));
  const types = [...new Set([
    ...(hasParticipleNote ? ['part'] : []),
    ...headerMatches.map((match) => match.groups.type.toLowerCase()),
  ])];

  return {
    id: makeId(lemma),
    lemma,
    types,
    initialMeta,
    header: text.slice(0, definitionStart).trim(),
    definition,
    source: 'diccionario-maria-moliner.txt',
    startLine: block.startLine,
    endLine: block.endLine,
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const rawText = fs.readFileSync(options.input, 'utf8');
  const allLines = rawText.split(/\r?\n/u);
  const sourceLines = allLines.slice(options.startLine - 1);
  const blocks = splitIntoBlocks(sourceLines, options.startLine);

  const entries = [];

  for (const block of blocks) {
    const entry = parseBlock(block);

    if (!entry) {
      continue;
    }

    entries.push(entry);

    if (options.limit && entries.length >= options.limit) {
      break;
    }
  }

  const jsonl = entries.map((entry) => JSON.stringify(entry)).join('\n');
  fs.mkdirSync(path.dirname(options.output), { recursive: true });
  fs.writeFileSync(options.output, jsonl ? `${jsonl}\n` : '', 'utf8');

  console.log(`Entradas extraidas: ${entries.length}`);
  console.log(`Salida: ${options.output}`);

  if (entries.length > 0) {
    console.log(`Primera: ${entries[0].lemma}`);
    console.log(`Ultima: ${entries[entries.length - 1].lemma}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}