import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEntry } from './mm-build-entry.mjs';

test('buildEntry wraps plain prose with no markers as a single sense', () => {
  const result = buildEntry('Superior de un monasterio o de algunas colegiatas.');
  assert.deepEqual(result, {
    senses: [
      {
        number: 1,
        definition: 'Superior de un monasterio o de algunas colegiatas.',
        examples: [],
        synonyms: [],
        crossReferences: [],
        antonym: null,
        subsenses: [],
        catalog: [],
      },
    ],
    expressions: [],
  });
});

test('buildEntry produces one entry per numbered sense', () => {
  const result = buildEntry(
    'Extravío: apartamiento del camino conveniente. 2 Apartamiento de la conducta conveniente. 3 ÓpT. Defecto en una lente o espejo que produce una imagen alterada.',
  );
  assert.deepEqual(
    result.senses.map((sense) => ({ number: sense.number, definition: sense.definition })),
    [
      { number: 1, definition: 'Extravío: apartamiento del camino conveniente.' },
      { number: 2, definition: 'Apartamiento de la conducta conveniente.' },
      { number: 3, definition: 'ÓpT. Defecto en una lente o espejo que produce una imagen alterada.' },
    ],
  );
});

test('buildEntry runs leaf extraction (examples, synonyms, cross-refs) on a sense', () => {
  const result = buildEntry(
    'Rodear con los brazos la *cosa que se expresa: “Le dio un abrazo fuerte”. = Estrechar.',
  );
  assert.deepEqual(result.senses[0], {
    number: 1,
    definition: 'Rodear con los brazos la cosa que se expresa.',
    examples: ['Le dio un abrazo fuerte'],
    synonyms: ['Estrechar'],
    crossReferences: ['cosa'],
    antonym: null,
    subsenses: [],
    catalog: [],
  });
});

test('buildEntry nests a © marked subsense with its own leaf extraction', () => {
  const result = buildEntry(
    'Revela una actitud o intención. © (pl.) Con un calificativo, movimientos o gestos peculiares: “Tener ademanes suaves”.',
  );
  assert.equal(result.senses.length, 1);
  assert.deepEqual(result.senses[0].subsenses, [
    {
      definition: '(pl.) Con un calificativo, movimientos o gestos peculiares.',
      examples: ['Tener ademanes suaves'],
      synonyms: [],
      crossReferences: [],
      antonym: null,
    },
  ]);
});

test('buildEntry collects O marked catalog items as plain definitions', () => {
  const result = buildEntry('Alma de los difuntos. O Particularmente, las que están en el Purgatorio.');
  assert.deepEqual(result.senses[0].catalog, ['Particularmente, las que están en el Purgatorio.']);
});

test('buildEntry splits off expressions, each with their own nested senses', () => {
  const result = buildEntry(
    'Se aplica al que influye en favor de alguien. / ABOGADO DEL DIABLO. 1 Miembro de una congregación. 2 Persona que defiende una causa impopular.',
  );
  assert.deepEqual(result.expressions, [
    {
      phrase: 'ABOGADO DEL DIABLO',
      senses: [
        {
          number: 1,
          definition: 'Miembro de una congregación.',
          examples: [],
          synonyms: [],
          crossReferences: [],
          antonym: null,
          subsenses: [],
          catalog: [],
        },
        {
          number: 2,
          definition: 'Persona que defiende una causa impopular.',
          examples: [],
          synonyms: [],
          crossReferences: [],
          antonym: null,
          subsenses: [],
          catalog: [],
        },
      ],
    },
  ]);
});
