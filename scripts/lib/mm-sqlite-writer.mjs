export function createSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id TEXT NOT NULL,
      lemma TEXT NOT NULL,
      types TEXT,
      initial_meta TEXT,
      header TEXT,
      source TEXT,
      start_line INTEGER,
      end_line INTEGER,
      etymology TEXT,
      usage_area TEXT,
      usage_level TEXT,
      part_of_speech TEXT,
      gender TEXT,
      scientific_name TEXT,
      conjugation TEXT,
      usage_notes TEXT,
      headword TEXT,
      anagram TEXT,
      archaic INTEGER,
      obsolete INTEGER,
      synonyms_lucene TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_entries_source_id ON entries(source_id);
    CREATE INDEX IF NOT EXISTS idx_entries_lemma ON entries(lemma);

    CREATE TABLE IF NOT EXISTS expressions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_id INTEGER NOT NULL REFERENCES entries(id),
      phrase TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS senses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_id INTEGER NOT NULL REFERENCES entries(id),
      expression_id INTEGER REFERENCES expressions(id),
      number INTEGER NOT NULL,
      definition TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS subsenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sense_id INTEGER NOT NULL REFERENCES senses(id),
      definition TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS examples (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sense_id INTEGER REFERENCES senses(id),
      subsense_id INTEGER REFERENCES subsenses(id),
      text TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS synonyms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sense_id INTEGER REFERENCES senses(id),
      subsense_id INTEGER REFERENCES subsenses(id),
      word TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS antonyms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sense_id INTEGER REFERENCES senses(id),
      subsense_id INTEGER REFERENCES subsenses(id),
      word TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cross_references (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sense_id INTEGER REFERENCES senses(id),
      subsense_id INTEGER REFERENCES subsenses(id),
      word TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS catalog_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sense_id INTEGER REFERENCES senses(id),
      subsense_id INTEGER REFERENCES subsenses(id),
      text TEXT NOT NULL
    );
  `);
}

export function createWriter(db) {
  const statements = {
    entry: db.prepare(
      `INSERT INTO entries (
        source_id, lemma, types, initial_meta, header, source, start_line, end_line,
        etymology, usage_area, usage_level, part_of_speech, gender, scientific_name, conjugation,
        usage_notes, headword, anagram, archaic, obsolete, synonyms_lucene
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    expression: db.prepare('INSERT INTO expressions (entry_id, phrase) VALUES (?, ?)'),
    sense: db.prepare('INSERT INTO senses (entry_id, expression_id, number, definition) VALUES (?, ?, ?, ?)'),
    subsense: db.prepare('INSERT INTO subsenses (sense_id, definition) VALUES (?, ?)'),
    example: db.prepare('INSERT INTO examples (sense_id, subsense_id, text) VALUES (?, ?, ?)'),
    synonym: db.prepare('INSERT INTO synonyms (sense_id, subsense_id, word) VALUES (?, ?, ?)'),
    antonym: db.prepare('INSERT INTO antonyms (sense_id, subsense_id, word) VALUES (?, ?, ?)'),
    crossReference: db.prepare('INSERT INTO cross_references (sense_id, subsense_id, word) VALUES (?, ?, ?)'),
    catalogItem: db.prepare('INSERT INTO catalog_items (sense_id, subsense_id, text) VALUES (?, ?, ?)'),
  };

  function insertLeafChildren(leaf, senseId, subsenseId) {
    for (const text of leaf.examples) statements.example.run(senseId, subsenseId, text);
    for (const word of leaf.synonyms) statements.synonym.run(senseId, subsenseId, word);
    for (const word of leaf.crossReferences) statements.crossReference.run(senseId, subsenseId, word);
    if (leaf.antonym) statements.antonym.run(senseId, subsenseId, leaf.antonym);
  }

  function insertSubsense(senseId, subsense) {
    const info = statements.subsense.run(senseId, subsense.definition);
    const subsenseId = Number(info.lastInsertRowid);
    insertLeafChildren(subsense, null, subsenseId);
    for (const text of subsense.catalog) statements.catalogItem.run(null, subsenseId, text);
  }

  function insertSense(entryId, expressionId, sense) {
    const info = statements.sense.run(entryId, expressionId, sense.number, sense.definition);
    const senseId = Number(info.lastInsertRowid);
    insertLeafChildren(sense, senseId, null);
    for (const text of sense.catalog) statements.catalogItem.run(senseId, null, text);
    for (const subsense of sense.subsenses) insertSubsense(senseId, subsense);
  }

  function insertEntry(record, built, enrichment = null) {
    const entryInfo = statements.entry.run(
      record.id,
      record.lemma,
      JSON.stringify(record.types ?? []),
      record.initialMeta ?? '',
      record.header ?? '',
      record.source ?? '',
      record.startLine ?? null,
      record.endLine ?? null,
      enrichment?.etymology ? JSON.stringify(enrichment.etymology) : null,
      enrichment?.usageArea ? JSON.stringify(enrichment.usageArea) : null,
      enrichment?.usageLevel ? JSON.stringify(enrichment.usageLevel) : null,
      enrichment?.partOfSpeech ? JSON.stringify(enrichment.partOfSpeech) : null,
      enrichment?.gender ? JSON.stringify(enrichment.gender) : null,
      enrichment?.scientificName ?? null,
      enrichment?.conjugation ?? null,
      enrichment?.usageNotes ?? null,
      enrichment?.headword ?? null,
      enrichment?.anagram ?? null,
      enrichment ? Number(enrichment.archaic) : null,
      enrichment ? Number(enrichment.obsolete) : null,
      enrichment?.synonyms ? JSON.stringify(enrichment.synonyms) : null,
    );
    const entryId = Number(entryInfo.lastInsertRowid);

    for (const sense of built.senses) insertSense(entryId, null, sense);

    for (const expression of built.expressions) {
      const info = statements.expression.run(entryId, expression.phrase);
      const expressionId = Number(info.lastInsertRowid);
      for (const sense of expression.senses) insertSense(entryId, expressionId, sense);
    }
  }

  return { insertEntry };
}
