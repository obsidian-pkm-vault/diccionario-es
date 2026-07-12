#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { parseArgs as parseCliArgs, resolvePath } from './lib/cli-args.mjs';

const DEFAULT_DB = path.resolve('data/diccionario-maria-moliner.sqlite');
const DEFAULT_OUTPUT = path.resolve('dist');
const SQL_JS_DIST = path.resolve('node_modules/sql.js/dist');

function parseArgs(argv) {
  return parseCliArgs(
    argv,
    { db: DEFAULT_DB, output: DEFAULT_OUTPUT },
    {
      '--db': { key: 'db', parse: resolvePath },
      '--output': { key: 'output', parse: resolvePath },
    },
  );
}

function copyFile(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  fs.rmSync(options.output, { recursive: true, force: true });
  fs.mkdirSync(options.output, { recursive: true });

  copyFile(path.resolve('index.pages.html'), path.join(options.output, 'index.html'));
  copyFile(path.resolve('style.css'), path.join(options.output, 'style.css'));
  copyFile(path.resolve('render.js'), path.join(options.output, 'render.js'));
  copyFile(path.resolve('browser-sqlite-reader.js'), path.join(options.output, 'browser-sqlite-reader.js'));
  copyFile(path.resolve('main.pages.js'), path.join(options.output, 'main.js'));

  copyFile(path.join(SQL_JS_DIST, 'sql-wasm.js'), path.join(options.output, 'vendor/sql.js/sql-wasm.js'));
  copyFile(path.join(SQL_JS_DIST, 'sql-wasm.wasm'), path.join(options.output, 'vendor/sql.js/sql-wasm.wasm'));

  const dbBuffer = fs.readFileSync(options.db);
  const gzipped = zlib.gzipSync(dbBuffer, { level: zlib.constants.Z_BEST_COMPRESSION });
  const dbOutput = path.join(options.output, 'data/diccionario-maria-moliner.sqlite.gz');
  fs.mkdirSync(path.dirname(dbOutput), { recursive: true });
  fs.writeFileSync(dbOutput, gzipped);

  // GitHub Pages ignores dotfiles/underscore-prefixed paths by default;
  // vendor/ and data/ don't need it, but keeps future additions safe.
  fs.writeFileSync(path.join(options.output, '.nojekyll'), '');

  console.log(`DB: ${dbBuffer.length} bytes -> ${gzipped.length} bytes gzipped`);
  console.log(`Sitio estático generado en: ${options.output}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
