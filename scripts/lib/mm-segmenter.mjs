const EXAMPLE_REGEX = /[“‘’ʻ””’’](.{2,400}?)[“‘’ʻ””’’]/gu;

export function extractExamples(text) {
  const examples = [];
  const cleaned = text.replace(EXAMPLE_REGEX, (match, inner) => {
    examples.push(inner.trim());
    return '';
  });
  return {
    text: cleaned.replace(/\s*:\s*(?=\.|$)/gu, '').replace(/\s{2,}/gu, ' ').trim(),
    examples,
  };
}

const SYNONYM_REGEX = /=\s*([^.]+)\./gu;

export function extractSynonyms(text) {
  const synonyms = [];
  const cleaned = text.replace(SYNONYM_REGEX, (match, group) => {
    for (const raw of group.split(',')) {
      const word = raw.trim();
      if (word) synonyms.push(word);
    }
    return '';
  });
  return { text: cleaned.replace(/\s{2,}/gu, ' ').trim(), synonyms };
}

const ASTERISK_REGEX = /\*(\p{L}[\p{L}-]*)/gu;

export function extractCrossReferencesAsterisk(text) {
  const crossReferences = [];
  const cleaned = text.replace(ASTERISK_REGEX, (match, word) => {
    crossReferences.push(word.toLowerCase());
    return word;
  });
  return { text: cleaned, crossReferences };
}

const VEASE_REGEX = /\bV\.\s+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s]{1,40}?)(?=[.,]|\s[a-záéíóúñ]|$)/gu;

export function extractCrossReferencesVease(text) {
  return [...text.matchAll(VEASE_REGEX)].map((match) => match[1].trim().toLowerCase());
}

const ANTONYM_REDIRECT_REGEX = /^(?:Opuesto|Contrario)\s+(?:a|de)\s+(.+?)\.?$/iu;

export function detectAntonymRedirect(text) {
  const match = ANTONYM_REDIRECT_REGEX.exec(text.trim());
  return match ? match[1].trim().toLowerCase() : null;
}

export function stripEnclosingQuotes(text) {
  return text.replace(/^["'ʻ“”‘’]+|["'ʻ“”‘’]+$/gu, '').trim();
}

const LEADING_SENSE_NUMBER_REGEX = /^(\d{1,2})\s+/u;
const SENSE_BOUNDARY_REGEX = /(?<=\.\s)(\d{1,2})\s+(?=[A-ZÁÉÍÓÚÑ¿¡(«])/gu;

export function splitNumberedSenses(text) {
  let working = text;
  let currentNumber = 1;

  const leadingMatch = working.match(LEADING_SENSE_NUMBER_REGEX);
  if (leadingMatch) {
    currentNumber = Number(leadingMatch[1]);
    working = working.slice(leadingMatch[0].length);
  }

  const senses = [];
  let lastIndex = 0;
  for (const match of working.matchAll(SENSE_BOUNDARY_REGEX)) {
    senses.push({ number: currentNumber, text: working.slice(lastIndex, match.index).trim() });
    currentNumber = Number(match[1]);
    lastIndex = match.index + match[0].length;
  }
  senses.push({ number: currentNumber, text: working.slice(lastIndex).trim() });

  return senses;
}

export function splitSubsenses(text) {
  const parts = text.split('©').map((part) => part.trim());
  const [main, ...subsenses] = parts;
  return { text: main, subsenses };
}

const CATALOG_BOUNDARY_REGEX = /(?<=[.,]\s)O\s+/gu;

export function splitCatalog(text) {
  const parts = text.split(CATALOG_BOUNDARY_REGEX).map((part) => part.trim());
  const [main, ...catalog] = parts;
  return { text: main, catalog };
}

const EXPRESSION_MARKER_REGEX = /\/\s+([^.]+?)\.\s+/gu;

export function splitExpressions(text) {
  const matches = [...text.matchAll(EXPRESSION_MARKER_REGEX)];
  if (matches.length === 0) {
    return { text: text.trim(), expressions: [] };
  }

  const mainText = text.slice(0, matches[0].index).trim();
  const expressions = matches.map((match, i) => {
    const bodyStart = match.index + match[0].length;
    const bodyEnd = i + 1 < matches.length ? matches[i + 1].index : text.length;
    return { phrase: match[1].trim(), text: text.slice(bodyStart, bodyEnd).trim() };
  });

  return { text: mainText, expressions };
}
