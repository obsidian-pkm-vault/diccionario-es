export const CANONICAL_CATEGORIES = [
  'sustantivo',
  'adjetivo',
  'verbo',
  'pronombre',
  'adverbio',
  'preposición',
  'conjunción',
  'interjección',
  'determinante',
];

export const CANONICAL_GENDERS = ['masculino', 'femenino', 'neutro'];

const CATEGORY_BY_WORD = {
  sustantivo: 'sustantivo',
  nombre: 'sustantivo',
  adjetivo: 'adjetivo',
  verbo: 'verbo',
  transitivo: 'verbo',
  intransitivo: 'verbo',
  pronominal: 'verbo',
  auxiliar: 'verbo',
  pronombre: 'pronombre',
  adverbio: 'adverbio',
  preposicion: 'preposición',
  preposición: 'preposición',
  conjuncion: 'conjunción',
  conjunción: 'conjunción',
  interjeccion: 'interjección',
  interjección: 'interjección',
  determinante: 'determinante',
  articulo: 'determinante',
  artículo: 'determinante',
};

const GENDER_BY_WORD = {
  masculino: 'masculino',
  femenino: 'femenino',
  neutro: 'neutro',
};

export function classifyPhrase(phrase, { categories = new Set(), genders = new Set() } = {}) {
  const words = phrase.match(/\p{L}+/gu) ?? [];

  for (const word of words) {
    const key = word.toLowerCase();
    if (CATEGORY_BY_WORD[key]) categories.add(CATEGORY_BY_WORD[key]);
    if (GENDER_BY_WORD[key]) genders.add(GENDER_BY_WORD[key]);
  }

  return { categories, genders };
}

export function classifyPhrases(phrases) {
  const categories = new Set();
  const genders = new Set();

  for (const phrase of phrases) classifyPhrase(phrase, { categories, genders });

  return { categories: [...categories], genders: [...genders] };
}
