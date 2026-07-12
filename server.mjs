#!/usr/bin/env node

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { searchEntries, getEntryDetail } from './scripts/lib/mm-sqlite-reader.mjs';

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const DB_PATH = path.resolve('data/diccionario-maria-moliner.sqlite');
const SEARCH_LIMIT = 30;

const STATIC_FILES = {
  '/': { file: 'index.html', type: 'text/html; charset=utf-8' },
  '/index.html': { file: 'index.html', type: 'text/html; charset=utf-8' },
  '/main.js': { file: 'main.js', type: 'text/javascript; charset=utf-8' },
  '/render.js': { file: 'render.js', type: 'text/javascript; charset=utf-8' },
  '/style.css': { file: 'style.css', type: 'text/css; charset=utf-8' },
};

const db = new DatabaseSync(DB_PATH, { readOnly: true });

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(payload);
}

function handleSearch(res, url) {
  const prefix = (url.searchParams.get('q') ?? '').trim();
  if (!prefix) return sendJson(res, 200, []);
  sendJson(res, 200, searchEntries(db, prefix, SEARCH_LIMIT));
}

function handleEntry(res, id) {
  const entryId = Number(id);
  if (!Number.isInteger(entryId)) return sendJson(res, 400, { error: 'invalid id' });
  const detail = getEntryDetail(db, entryId);
  if (!detail) return sendJson(res, 404, { error: 'not found' });
  sendJson(res, 200, detail);
}

function handleStatic(res, pathname) {
  const staticFile = STATIC_FILES[pathname];
  if (!staticFile) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
    return;
  }
  const contents = fs.readFileSync(path.resolve(staticFile.file));
  res.writeHead(200, { 'Content-Type': staticFile.type });
  res.end(contents);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/api/search') return handleSearch(res, url);

  const entryMatch = /^\/api\/entry\/(\d+)$/u.exec(url.pathname);
  if (entryMatch) return handleEntry(res, entryMatch[1]);

  return handleStatic(res, url.pathname);
});

server.listen(PORT, () => {
  console.log(`Diccionario María Moliner escuchando en http://localhost:${PORT}`);
});
