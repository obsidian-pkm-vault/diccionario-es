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
