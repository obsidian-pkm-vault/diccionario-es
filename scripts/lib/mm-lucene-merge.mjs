export function matchLuceneToTxtEntries(txtRecords, luceneRecords) {
  const luceneById = new Map();
  for (const record of luceneRecords) {
    if (!luceneById.has(record.id)) luceneById.set(record.id, []);
    luceneById.get(record.id).push(record);
  }

  const pointerById = new Map();
  const enrichments = txtRecords.map((txtRecord) => {
    const group = luceneById.get(txtRecord.id);
    if (!group) return null;
    const pointer = pointerById.get(txtRecord.id) ?? 0;
    if (pointer >= group.length) return null;
    pointerById.set(txtRecord.id, pointer + 1);
    return group[pointer];
  });

  const gapFill = [];
  for (const [id, group] of luceneById) {
    const consumed = pointerById.get(id) ?? 0;
    for (let i = consumed; i < group.length; i += 1) gapFill.push(group[i]);
  }

  return { enrichments, gapFill };
}
