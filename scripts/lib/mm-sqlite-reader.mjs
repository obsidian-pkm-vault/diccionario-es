function parseJsonArray(value) {
  return value ? JSON.parse(value) : [];
}

function getLeaves(db, table, column, senseId, subsenseId) {
  return db
    .prepare(`SELECT ${column} AS value FROM ${table} WHERE sense_id IS ? AND subsense_id IS ?`)
    .all(senseId, subsenseId)
    .map((row) => row.value);
}

function getLeafData(db, senseId, subsenseId) {
  return {
    examples: getLeaves(db, 'examples', 'text', senseId, subsenseId),
    synonyms: getLeaves(db, 'synonyms', 'word', senseId, subsenseId),
    crossReferences: getLeaves(db, 'cross_references', 'word', senseId, subsenseId),
    antonym: getLeaves(db, 'antonyms', 'word', senseId, subsenseId)[0] ?? null,
    catalog: getLeaves(db, 'catalog_items', 'text', senseId, subsenseId),
  };
}

function getSubsenses(db, senseId) {
  const rows = db.prepare('SELECT id, definition FROM subsenses WHERE sense_id = ?').all(senseId);
  return rows.map((row) => ({
    definition: row.definition,
    ...getLeafData(db, null, row.id),
  }));
}

function getSenses(db, entryId, expressionId) {
  const rows = db
    .prepare('SELECT id, number, definition FROM senses WHERE entry_id = ? AND expression_id IS ? ORDER BY number')
    .all(entryId, expressionId);
  return rows.map((row) => ({
    number: row.number,
    definition: row.definition,
    ...getLeafData(db, row.id, null),
    subsenses: getSubsenses(db, row.id),
  }));
}

function getExpressions(db, entryId) {
  const rows = db.prepare('SELECT id, phrase FROM expressions WHERE entry_id = ?').all(entryId);
  return rows.map((row) => ({
    phrase: row.phrase,
    senses: getSenses(db, entryId, row.id),
  }));
}

export function searchEntries(db, prefix, limit) {
  return db
    .prepare('SELECT id, lemma, header FROM entries WHERE lemma LIKE ? ORDER BY lemma LIMIT ?')
    .all(`${prefix}%`, limit)
    .map((row) => ({ id: row.id, lemma: row.lemma, header: row.header }));
}

export function getEntryDetail(db, entryId) {
  const entry = db.prepare('SELECT * FROM entries WHERE id = ?').get(entryId);
  if (!entry) return null;

  const hasEnrichment = entry.etimologia !== null;

  return {
    lemma: entry.lemma,
    types: parseJsonArray(entry.types),
    initialMeta: entry.initial_meta,
    header: entry.header,
    source: entry.source,
    senses: getSenses(db, entryId, null),
    expressions: getExpressions(db, entryId),
    enrichment: hasEnrichment
      ? {
          etimologia: parseJsonArray(entry.etimologia),
          areaUso: parseJsonArray(entry.area_uso),
          nivelUso: parseJsonArray(entry.nivel_uso),
          catGram: parseJsonArray(entry.cat_gram),
          nombreCientifico: entry.nombre_cientifico,
          conjugacion: entry.conjugacion,
          notasUso: entry.notas_uso,
          voz: entry.voz,
          anagrama: entry.anagrama,
          antiguo: Boolean(entry.antiguo),
          desuso: Boolean(entry.desuso),
          sinonimos: parseJsonArray(entry.sinonimos_lucene),
        }
      : null,
  };
}
