import { test } from 'node:test';
import assert from 'node:assert/strict';
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

test('extractExamples pulls quoted text out, handling mismatched OCR quote pairs', () => {
  const input = 'Se aplica a la cosa: “Un ejemplo’ o también: ‘Otro ejemplo”.';
  const result = extractExamples(input);
  assert.deepEqual(result.examples, ['Un ejemplo', 'Otro ejemplo']);
  assert.equal(result.text.includes('"'), false);
});

test('extractSynonyms reads a comma list after = and strips it from the text', () => {
  const result = extractSynonyms('Dejar de tener asida una cosa. = Soltar. O tr. Hacer que baje.');
  assert.deepEqual(result.synonyms, ['Soltar']);
  assert.equal(result.text.includes('='), false);
});

test('extractSynonyms handles a multi-word synonym list', () => {
  const result = extractSynonyms('Descuido en la limpieza. = Dejado, desastrado, descuidado, desidioso.');
  assert.deepEqual(result.synonyms, ['Dejado', 'desastrado', 'descuidado', 'desidioso']);
});

test('extractCrossReferencesAsterisk keeps the word, drops only the asterisk', () => {
  const result = extractCrossReferencesAsterisk('Rodear con los brazos la *cosa que se expresa.');
  assert.deepEqual(result.crossReferences, ['cosa']);
  assert.equal(result.text, 'Rodear con los brazos la cosa que se expresa.');
});

test('extractCrossReferencesVease finds V. WORD outside of expressions', () => {
  const refs = extractCrossReferencesVease('4 V. ARTÍCULO determinado.');
  assert.deepEqual(refs, ['artículo']);
});

test('detectAntonymRedirect matches a whole-definition redirect', () => {
  assert.equal(detectAntonymRedirect('Opuesto a bueno.'), 'bueno');
  assert.equal(detectAntonymRedirect('Contrario de rápido.'), 'rápido');
});

test('detectAntonymRedirect does not match generic prose containing the phrase', () => {
  assert.equal(
    detectAntonymRedirect('Clavo doblado en ángulo recto por el extremo opuesto a la punta.'),
    null,
  );
});

test('stripEnclosingQuotes removes only leading/trailing quote characters', () => {
  assert.equal(stripEnclosingQuotes('”al contacto de, al roce de”'), 'al contacto de, al roce de');
  assert.equal(stripEnclosingQuotes('sin comillas'), 'sin comillas');
});

test('splitNumberedSenses returns a single implicit sense 1 when no markers present', () => {
  const result = splitNumberedSenses(
    'Movimiento del cuerpo, particularmente de la cabeza o las manos, que revela una actitud.',
  );
  assert.deepEqual(result, [
    { number: 1, text: 'Movimiento del cuerpo, particularmente de la cabeza o las manos, que revela una actitud.' },
  ]);
});

test('splitNumberedSenses splits on "N " boundaries following a sentence end', () => {
  const result = splitNumberedSenses(
    'Extravío: apartamiento del camino conveniente. 2 Apartamiento de la conducta conveniente. 3 ÓpT. Defecto en una lente o espejo que produce una imagen alterada.',
  );
  assert.deepEqual(result, [
    { number: 1, text: 'Extravío: apartamiento del camino conveniente.' },
    { number: 2, text: 'Apartamiento de la conducta conveniente.' },
    { number: 3, text: 'ÓpT. Defecto en una lente o espejo que produce una imagen alterada.' },
  ]);
});

test('splitNumberedSenses honors an explicit leading sense number', () => {
  const result = splitNumberedSenses(
    '1 m. Paleta de metal que se emplea para recoger la ceniza, la basura, etc. 2 Paleta formada por una plancha pequeña en forma de disco y un mango largo.',
  );
  assert.deepEqual(result, [
    { number: 1, text: 'm. Paleta de metal que se emplea para recoger la ceniza, la basura, etc.' },
    { number: 2, text: 'Paleta formada por una plancha pequeña en forma de disco y un mango largo.' },
  ]);
});

test('splitNumberedSenses does not split on a number inside a quoted example', () => {
  const result = splitNumberedSenses(
    'Distancia: ʻA 10 km de Madrid”. 4 Distribución: ‘A tres por cabeza”.',
  );
  assert.deepEqual(result, [
    { number: 1, text: 'Distancia: ʻA 10 km de Madrid”.' },
    { number: 4, text: 'Distribución: ‘A tres por cabeza”.' },
  ]);
});

test('splitSubsenses returns the full text with no subsenses when © is absent', () => {
  const result = splitSubsenses('Revela una actitud o intención.');
  assert.deepEqual(result, { text: 'Revela una actitud o intención.', subsenses: [] });
});

test('splitSubsenses splits off a © marked subsense from the main sense text', () => {
  const result = splitSubsenses(
    'Revela una actitud o intención. © (pl.) Con un calificativo, movimientos o gestos peculiares de una persona.',
  );
  assert.deepEqual(result, {
    text: 'Revela una actitud o intención.',
    subsenses: ['(pl.) Con un calificativo, movimientos o gestos peculiares de una persona.'],
  });
});

test('splitSubsenses collects multiple © marked subsenses in order', () => {
  const result = splitSubsenses('Primero. © Segundo. © Tercero.');
  assert.deepEqual(result, { text: 'Primero.', subsenses: ['Segundo.', 'Tercero.'] });
});

test('splitCatalog returns the full text with no items when O is absent', () => {
  const result = splitCatalog('Alma de los difuntos.');
  assert.deepEqual(result, { text: 'Alma de los difuntos.', catalog: [] });
});

test('splitCatalog splits off an O marked item following a sentence end', () => {
  const result = splitCatalog(
    'Alma de los difuntos. O Particularmente, las que están en el Purgatorio.',
  );
  assert.deepEqual(result, {
    text: 'Alma de los difuntos.',
    catalog: ['Particularmente, las que están en el Purgatorio.'],
  });
});

test('splitCatalog also splits on an O marker following a comma mid-sentence', () => {
  const result = splitCatalog(
    'Cualquier separación entre dos cosas próximas, O agujero que permite el paso a través de ellas.',
  );
  assert.deepEqual(result, {
    text: 'Cualquier separación entre dos cosas próximas,',
    catalog: ['agujero que permite el paso a través de ellas.'],
  });
});

test('splitCatalog collects multiple O marked items in order', () => {
  const result = splitCatalog(
    'Alma de los difuntos. O Particularmente, las que están en el Purgatorio. O Otro dato.',
  );
  assert.deepEqual(result, {
    text: 'Alma de los difuntos.',
    catalog: ['Particularmente, las que están en el Purgatorio.', 'Otro dato.'],
  });
});

test('splitExpressions returns the full text with no expressions when / is absent', () => {
  const result = splitExpressions('Se aplica al que influye en favor de alguien.');
  assert.deepEqual(result, { text: 'Se aplica al que influye en favor de alguien.', expressions: [] });
});

test('splitExpressions splits off a / PHRASE. expression with its own body', () => {
  const result = splitExpressions(
    'Se aplica al que influye en favor de alguien. / ABOGADO DEL DIABLO. Miembro de la Sagrada Congregación de Ritos del Vaticano.',
  );
  assert.deepEqual(result, {
    text: 'Se aplica al que influye en favor de alguien.',
    expressions: [
      { phrase: 'ABOGADO DEL DIABLO', text: 'Miembro de la Sagrada Congregación de Ritos del Vaticano.' },
    ],
  });
});

test('splitExpressions handles a mixed-case OCR phrase', () => {
  const result = splitExpressions(
    'Quizá: sirve para expresar la posibilidad. / Por st acaso. En previsión de que ocurra la cosa que se expresa.',
  );
  assert.deepEqual(result, {
    text: 'Quizá: sirve para expresar la posibilidad.',
    expressions: [
      { phrase: 'Por st acaso', text: 'En previsión de que ocurra la cosa que se expresa.' },
    ],
  });
});

test('splitExpressions keeps a single-letter abbreviation prefix inside the phrase', () => {
  const result = splitExpressions(
    '/ A. DEL EstaDo. Abogado al servicio del Estado para defender sus derechos en juicio.',
  );
  assert.deepEqual(result.expressions, [
    {
      phrase: 'A. DEL EstaDo',
      text: 'Abogado al servicio del Estado para defender sus derechos en juicio.',
    },
  ]);
});

test('splitExpressions does not treat a period inside parentheses as the phrase terminator', () => {
  const result = splitExpressions(
    '/ A. DE GANCHO (Arg., Bol., Chi., Col., Salv., Guat., Ur.). Imperdible.',
  );
  assert.deepEqual(result.expressions, [
    {
      phrase: 'A. DE GANCHO (Arg., Bol., Chi., Col., Salv., Guat., Ur.)',
      text: 'Imperdible.',
    },
  ]);
});

test('splitExpressions keeps a multi-letter abbreviation prefix inside the phrase', () => {
  const result = splitExpressions(
    '/ CH. CRUZADO. Cheque en cuyo anverso escribe el expedidor el nombre de un banco.',
  );
  assert.deepEqual(result.expressions, [
    {
      phrase: 'CH. CRUZADO',
      text: 'Cheque en cuyo anverso escribe el expedidor el nombre de un banco.',
    },
  ]);
});

test('splitExpressions collects multiple expressions in order', () => {
  const result = splitExpressions('Prefacio. / AL ABRIGO DE. Protegido. / DE ABRIGO. Fuerte.');
  assert.deepEqual(result, {
    text: 'Prefacio.',
    expressions: [
      { phrase: 'AL ABRIGO DE', text: 'Protegido.' },
      { phrase: 'DE ABRIGO', text: 'Fuerte.' },
    ],
  });
});
