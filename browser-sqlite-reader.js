// Browser port of scripts/lib/mm-sqlite-reader.mjs, targeting sql.js's API
// instead of node:sqlite. Query logic and output shape are kept identical
// on purpose so main.js's render functions don't need to know which one
// produced the data.

function queryAll(db, sql, params) {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
}

function queryOne(db, sql, params) {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const row = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();
    return row;
}

function parseJsonArray(value) {
    return value ? JSON.parse(value) : [];
}

function getLeaves(db, table, column, senseId, subsenseId) {
    return queryAll(
        db,
        `SELECT ${column} AS value FROM ${table} WHERE sense_id IS ? AND subsense_id IS ?`,
        [senseId, subsenseId],
    ).map((row) => row.value);
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
    const rows = queryAll(db, 'SELECT id, definition FROM subsenses WHERE sense_id = ?', [senseId]);
    return rows.map((row) => ({
        definition: row.definition,
        ...getLeafData(db, null, row.id),
    }));
}

function getSenses(db, entryId, expressionId) {
    const rows = queryAll(
        db,
        'SELECT id, number, definition FROM senses WHERE entry_id = ? AND expression_id IS ? ORDER BY number',
        [entryId, expressionId],
    );
    return rows.map((row) => ({
        number: row.number,
        definition: row.definition,
        ...getLeafData(db, row.id, null),
        subsenses: getSubsenses(db, row.id),
    }));
}

function getExpressions(db, entryId) {
    const rows = queryAll(db, 'SELECT id, phrase FROM expressions WHERE entry_id = ?', [entryId]);
    return rows.map((row) => ({
        phrase: row.phrase,
        senses: getSenses(db, entryId, row.id),
    }));
}

function searchEntries(db, prefix, limit) {
    return queryAll(
        db,
        'SELECT id, lemma, header FROM entries WHERE lemma LIKE ? ORDER BY lemma LIMIT ?',
        [`${prefix}%`, limit],
    ).map((row) => ({ id: row.id, lemma: row.lemma, header: row.header }));
}

function getEntryDetail(db, entryId) {
    const entry = queryOne(db, 'SELECT * FROM entries WHERE id = ?', [entryId]);
    if (!entry) return null;

    const hasEnrichment = entry.etymology !== null;

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
                etymology: parseJsonArray(entry.etymology),
                usageArea: parseJsonArray(entry.usage_area),
                usageLevel: parseJsonArray(entry.usage_level),
                partOfSpeech: parseJsonArray(entry.part_of_speech),
                gender: parseJsonArray(entry.gender),
                scientificName: entry.scientific_name,
                conjugation: entry.conjugation,
                usageNotes: entry.usage_notes,
                headword: entry.headword,
                anagram: entry.anagram,
                archaic: Boolean(entry.archaic),
                obsolete: Boolean(entry.obsolete),
                synonymsLucene: parseJsonArray(entry.synonyms_lucene),
            }
            : null,
    };
}
