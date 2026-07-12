import {
  extractExamples,
  extractSynonyms,
  extractCrossReferencesAsterisk,
  extractCrossReferencesVease,
  detectAntonymRedirect,
  stripEnclosingQuotes,
  splitNumberedSenses,
  splitSubsenses,
  splitCatalog,
  splitExpressions,
} from './mm-segmenter.mjs';

function buildLeaf(text) {
  const afterExamples = extractExamples(text);
  const afterSynonyms = extractSynonyms(afterExamples.text);
  const afterAsterisk = extractCrossReferencesAsterisk(afterSynonyms.text);
  const veaseRefs = extractCrossReferencesVease(afterAsterisk.text);

  return {
    definition: stripEnclosingQuotes(afterAsterisk.text),
    examples: afterExamples.examples,
    synonyms: afterSynonyms.synonyms,
    crossReferences: [...afterAsterisk.crossReferences, ...veaseRefs],
    antonym: detectAntonymRedirect(afterAsterisk.text),
  };
}

function buildSubsense(text) {
  const { text: leafText, catalog } = splitCatalog(text);
  const leaf = buildLeaf(leafText);

  return {
    ...leaf,
    catalog: catalog.map((item) => buildLeaf(item).definition),
  };
}

function buildSense(number, text) {
  const { text: withoutSubsenses, subsenses } = splitSubsenses(text);
  const { text: leafText, catalog } = splitCatalog(withoutSubsenses);
  const leaf = buildLeaf(leafText);

  return {
    number,
    ...leaf,
    subsenses: subsenses.map(buildSubsense),
    catalog: catalog.map((item) => buildLeaf(item).definition),
  };
}

function buildSenses(text) {
  return splitNumberedSenses(text).map(({ number, text: senseText }) => buildSense(number, senseText));
}

export function buildEntry(text) {
  const { text: mainText, expressions } = splitExpressions(text);

  return {
    senses: buildSenses(mainText),
    expressions: expressions.map(({ phrase, text: expressionText }) => ({
      phrase,
      senses: buildSenses(expressionText),
    })),
  };
}
