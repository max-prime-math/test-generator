import assert from 'node:assert/strict';
import { calculateAlgorithmicQuestionOriginal, calculateAlgorithmicQuestionVariant, canRestoreAlgorithmicOriginal, formatDisplayValue } from '../src/lib/algorithm-variant.ts';
import { variantNumber, variantSeeds, withVariant, withoutOldVariants, withoutVariant } from '../src/lib/algorithm-history.ts';
import { exportAppDataToRepoEntries, importRepoEntriesToAppData } from '../src/git/repoDataModel.ts';
import { formatBody } from '../src/lib/question-format.ts';
import { parseBulkImportJson } from '../src/lib/bulk-import.ts';
import { graphFromSvg } from '../src/lib/math-graph/svg.ts';
import { findFeatures, showGraphFeatures } from '../src/lib/algorithm-graph-features.ts';
import type { AlgorithmModel, Question } from '../src/lib/types.ts';
import type { Graph } from '../src/lib/math-graph/vendor/model.ts';

function question(fields: Partial<Question> & { algorithmModel: AlgorithmModel }): Question {
  return { id: 'q', body: '', answer: '', solution: '', points: 1, createdAt: 0, ...fields } as Question;
}

function variable(name: string, rawExpression: string, sampleValue?: string, display?: AlgorithmModel['definitions'][number]['display']) {
  return { id: name, name, kind: 'variable' as const, rawExpression, sampleValue, display, dependencies: [], source: 'test' };
}

// Display formats follow ExamView: signed terms, fixed decimals, digit grouping.
assert.equal(formatDisplayValue(-9, { sign: 'always' }), '- 9');
assert.equal(formatDisplayValue(4, { sign: 'always' }), '+ 4');
assert.equal(formatDisplayValue(-0.8, undefined), '-0.8');
assert.equal(formatDisplayValue(0.5, { decimals: 2 }), '0.50');
assert.equal(formatDisplayValue(-0.001, { decimals: 2 }), '0.00');
assert.equal(formatDisplayValue(259459200, { group: true }), '259 459 200');
assert.equal(formatDisplayValue(6435, { group: true }), '6435');
assert.equal(formatDisplayValue('down', undefined), 'down');
assert.equal(formatDisplayValue('-frac(5, 3)', { sign: 'always' }), '- frac(5, 3)');
assert.equal(formatDisplayValue('frac(4, 3)', { sign: 'always' }), '+ frac(4, 3)');

// k and |k| both print 5: value search can't tell them apart, slots can.
const translation = question({
  body: 'The graph of $g(x) = x^(2) + 5$ is the graph of $f(x) = x^(2)$ translated',
  choices: { A: '5 units up', B: '5 units down', C: '5 units left', D: '5 units right' },
  answer: 'A',
  algorithmModel: {
    scope: { kind: 'question' },
    definitions: [
      variable('k', 'range(-9,9,1)', '5', { sign: 'always' }),
      { id: 'c1', name: 'condition_1', kind: 'condition', rawExpression: 'abs(k)>1', dependencies: ['k'], source: 'test' },
      variable('units', 'abs(k)', '5'),
      variable('dir', 'if(k>0,"up","down")', 'up'),
      variable('other', 'if(k<0,"up","down")', 'down'),
    ],
    sequence: [],
    slots: [
      { name: 'k', field: 'body', text: '+ 5', occurrence: 0 },
      ...['A', 'B', 'C', 'D'].map((id) => ({ name: 'units', field: `choice:${id}`, text: '5', occurrence: 0 })),
      { name: 'dir', field: 'choice:A', text: 'up', occurrence: 0 },
      { name: 'other', field: 'choice:B', text: 'down', occurrence: 0 },
    ],
    source: 'test',
  },
});

let sawNegative = false;
let sawPositive = false;
for (let seed = 1; seed <= 40; seed++) {
  const result = calculateAlgorithmicQuestionVariant(translation, seed)!;
  const values = new Map(result.updates.algorithmEvaluation!.entries.map((entry) => [entry.name, entry.value]));
  const k = Number(values.get('k'));
  const body = result.updates.body!;
  const choices = result.updates.choices!;
  assert.ok(Math.abs(k) > 1, 'condition respected');
  assert.ok(body.includes(`x^(2) ${k < 0 ? '-' : '+'} ${Math.abs(k)}$`), body);
  assert.equal(choices.A, `${Math.abs(k)} units ${k > 0 ? 'up' : 'down'}`);
  assert.equal(choices.B, `${Math.abs(k)} units ${k > 0 ? 'down' : 'up'}`);
  assert.equal(choices.C, `${Math.abs(k)} units left`);
  assert.equal(result.updates.answer, undefined, 'the answer letter is not rewritten');
  assert.ok(!result.diagnostics.some((item) => item.level !== 'info'), JSON.stringify(result.diagnostics));
  if (k < 0) sawNegative = true;
  else sawPositive = true;

  // Recalculating from a variant uses the updated slots.
  const again = calculateAlgorithmicQuestionVariant({ ...translation, ...result.updates } as Question, seed + 1000)!;
  const k2 = Number(again.updates.algorithmEvaluation!.entries.find((entry) => entry.name === 'k')!.value);
  assert.ok(again.updates.body!.includes(`x^(2) ${k2 < 0 ? '-' : '+'} ${Math.abs(k2)}$`), again.updates.body);
  assert.equal(again.updates.choices!.C, `${Math.abs(k2)} units left`);
}
assert.ok(sawNegative && sawPositive, 'both signs generated');

// Edited text no longer matches the slots: fall back to value search and say so.
const edited = calculateAlgorithmicQuestionVariant({ ...translation, body: 'Rewritten by hand.' }, 3)!;
assert.ok(edited.diagnostics.some((item) => item.code === 'ALGORITHM_SLOTS_STALE'));

// PQP import keeps slots and display formats.
const imported = parseBulkImportJson(JSON.stringify({
  format: 'portable-question-package',
  version: '1.0',
  questions: [{
    id: 'q1',
    kind: 'mcq',
    content: { stem: { format: 'typst', text: translation.body }, choices: Object.entries(translation.choices!).map(([id, text]) => ({ id, body: { format: 'typst', text } })) },
    answer: { type: 'choice', value: 'A' },
    extensions: { algorithmModel: translation.algorithmModel },
  }],
}))!;
assert.deepEqual(imported.questions[0].algorithmModel!.slots, translation.algorithmModel!.slots);
assert.deepEqual(imported.questions[0].algorithmModel!.definitions[0].display, { sign: 'always' });

// Evaluate a model once and return its values by name.
function values(definitions: Array<[string, string]>, seed = 7): Map<string, string | undefined> {
  const model: AlgorithmModel = {
    scope: { kind: 'question' },
    definitions: definitions.map(([name, rawExpression]) => variable(name, rawExpression)),
    sequence: [],
    source: 'test',
  };
  const result = calculateAlgorithmicQuestionVariant(question({ body: 'x', algorithmModel: model }), seed)!;
  assert.ok(!result.diagnostics.some((item) => item.level !== 'info'), JSON.stringify(result.diagnostics));
  return new Map(result.updates.algorithmEvaluation!.entries.map((entry) => [entry.name, entry.value]));
}

// Negative values raised to a power (JavaScript rejects -6**4).
assert.equal(values([['d', '6'], ['e', '-1*d'], ['p', 'e^4+2*e^2']]).get('p'), String(6 ** 4 + 2 * 36));

// ExamView functions and operators.
const functions = values([
  ['c', 'comb(10,3)'], ['p', 'perm(5,2)'], ['f', '5!'], ['g', '(2+1)!/2'], ['m', '17 mod 5'],
  ['t', 'int(-2.7)'], ['l', 'log10(1000)'], ['g2', 'gcf(12,18)'], ['s', 'sgn(-4)'],
  ['r', 'round(2.346,2)'], ['sf', 'sigfig(0.012345,2)'], ['cs', 'round(csc(pi/6),6)'], ['ac', 'round(arccos(0),6)'],
  ['fr', 'fracs(-10,6)'], ['fi', 'fracs(8,4)'], ['mx', 'mixfracs(5,3)'], ['sq', 'sqrs(12)'], ['sq2', 'sqrs(0.75)'], ['sq3', 'sqrs(2.25)'],
  ['ch', 'chr(45)'], ['st', '"(0, "+str(-2)+")"'], ['both', '1<2 & 3>2'],
]);
assert.deepEqual(Object.fromEntries(functions), {
  c: '120', p: '20', f: '120', g: '3', m: '2', t: '-2', l: '3', g2: '6', s: '-1', r: '2.35', sf: '0.012', cs: '2', ac: '1.570796',
  fr: '-frac(5, 3)', fi: '2', mx: '1 frac(2, 3)', sq: '2 sqrt(3)', sq2: 'frac(sqrt(3), 2)', sq3: 'frac(3, 2)', ch: '-', st: '(0, -2)', both: '1',
});

// rand(n) is an integer 1..n; range() works inside expressions; prime() picks primes.
for (let seed = 1; seed <= 30; seed++) {
  const random = values([['a', 'rand(3)'], ['b', '2*(range(1,3,1))'], ['q', 'prime(2,19)']], seed);
  assert.ok(['1', '2', '3'].includes(random.get('a')!), random.get('a'));
  assert.ok(['2', '4', '6'].includes(random.get('b')!), random.get('b'));
  assert.ok([2, 3, 5, 7, 11, 13, 17, 19].includes(Number(random.get('q'))), random.get('q'));
}

// String values compare in conditions and if().
assert.equal(values([['d', '"even"'], ['a', 'if(d="even",0,1)'], ['b', 'if(d<>"odd","yes","no")']]).get('a'), '0');
assert.equal(values([['d', '"even"'], ['b', 'if(d<>"odd","yes","no")']]).get('b'), 'yes');

// Impossible values (sqrt of a negative) are redrawn, not replaced by the imported value.
for (let seed = 1; seed <= 20; seed++) {
  const drawn = values([['k', 'range(-5,5,1)'], ['r', 'sqrt(k)']], seed);
  assert.ok(Number(drawn.get('k')) >= 0, drawn.get('k'));
}

// Rules may use variables defined later (ExamView evaluates in dependency order).
assert.equal(values([['x', 'cos(radians)'], ['radians', 'degrees*pi/180'], ['degrees', '180']]).get('x'), '-1');

// A rule that can't be evaluated keeps its imported value, but now says so.
const fallback = calculateAlgorithmicQuestionVariant(question({
  body: 'x',
  algorithmModel: { scope: { kind: 'question' }, definitions: [variable('a', 'unknownfn(2)', '5')], sequence: [], source: 'test' },
}), 1)!;
assert.ok(fallback.diagnostics.some((item) => item.code === 'ALGORITHM_RULE_UNSUPPORTED' && item.level === 'warning'));

// Graphs follow the values: templated Math Graph documents are redrawn and the image renamed.
const parabolaGraph = {
  version: 1,
  settings: { appearance: 'worksheet', tickLabels: 'all', xlabelEvery: 2, ylabelEvery: 2, xmin: -9.5, xmax: 9.5, ymin: '-9.5', ymax: 9.5, xtick: 1, ytick: 1,
    grid: true, equal: false, width: 7.62, height: 7.62, xlabel: { text: 'x', math: true }, ylabel: { text: 'y', math: true } },
  objects: [
    { id: 'f', type: 'function', expression: '(x - h)^2 + k', min: '-inf', max: 'inf', color: '#ff0000', width: 1.4, dashed: false, visible: true },
    { id: 'g', type: 'function', expression: 'sec(x) + log(x)', min: 0.5, max: null, color: '#0000ff', width: 1.4, dashed: false, visible: true, visibleIf: 'h > 100' },
    { id: 'v', type: 'point', name: 'V', x: 'h', y: 'k', label: { text: '({h}, {k})', math: false }, open: false, color: '#000000', width: 0.8, dashed: false, visible: true },
  ],
};
const graphed = question({
  body: 'Which transformation maps $y = x^2$ onto the red graph?\n\n#image("/imgs/pc12-ch01-03", width: 3in)',
  images: ['pc12-ch01-03'],
  algorithmModel: {
    scope: { kind: 'question' },
    definitions: [variable('h', 'range(-5,5,1)', '2'), variable('k', 'range(-5,5,1)', '-3')],
    sequence: [],
    graphs: [{ image: 'pc12-ch01-03', graph: parabolaGraph }],
    source: 'test',
  },
});
const drawn = calculateAlgorithmicQuestionVariant(graphed, 5)!;
assert.ok(!drawn.diagnostics.some((item) => item.level !== 'info'), JSON.stringify(drawn.diagnostics));
assert.equal(drawn.images?.length, 1);
const [image] = drawn.images!;
assert.match(image.name, /^pc12-ch01-03-g[0-9a-f]{8}$/);
assert.ok(drawn.updates.body!.includes(`/imgs/${image.name}"`), drawn.updates.body);
assert.deepEqual(drawn.updates.images, [image.name]);
const drawnValues = new Map(drawn.updates.algorithmEvaluation!.entries.map((entry) => [entry.name, Number(entry.value)]));
const model = graphFromSvg(image.svg)!;
const h = drawnValues.get('h')!;
const k = drawnValues.get('k')!;
assert.equal(model.objects[0].type === 'function' && model.objects[0].expression, `(x - (${h}))^2 + (${k})`);
assert.equal(model.objects[1].visible, false, 'visibleIf hides the alternative');
assert.equal(model.objects[1].type === 'function' && model.objects[1].expression, `(1/cos(x)) + (ln(x)/ln(10))`);
assert.ok(model.objects[2].type === 'point' && model.objects[2].x === h && model.objects[2].y === k && model.objects[2].label.text === `(${h}, ${k})`);
assert.equal(model.settings.ymin, -9.5);
// Recalculating from the variant renames from the base name, not the variant name.
const redrawn = calculateAlgorithmicQuestionVariant({ ...graphed, ...drawn.updates } as Question, 6)!;
assert.match(redrawn.images![0].name, /^pc12-ch01-03-g[0-9a-f]{8}$/);
assert.ok(redrawn.updates.body!.includes(`/imgs/${redrawn.images![0].name}"`));
// A graph that can't be drawn keeps its picture and says so.
const broken = calculateAlgorithmicQuestionVariant(question({
  ...graphed,
  algorithmModel: { ...graphed.algorithmModel!, graphs: [{ image: 'pc12-ch01-03', graph: { ...parabolaGraph, objects: [{ ...parabolaGraph.objects[0], expression: 'x + nothere' }] } }] },
}), 5)!;
assert.ok(broken.diagnostics.some((item) => item.code === 'ALGORITHM_GRAPH_FAILED'));
assert.ok(broken.updates.body!.includes('/imgs/pc12-ch01-03"'));

// Graph features: roots, vertical asymptotes (sign change, even power, domain edge) and horizontal limits.
const rounded = (values: number[]) => values.map((value) => Number(value.toFixed(6)));
const hyperbola = findFeatures('(2*x+1)/(x-3)', -40, 40);
assert.deepEqual(rounded(hyperbola.roots), [-0.5]);
assert.deepEqual(rounded(hyperbola.verticalAsymptotes), [3]);
assert.deepEqual(hyperbola.horizontalAsymptotes, [2]);
assert.deepEqual(rounded(findFeatures('1/(x-5)^2', -40, 40).verticalAsymptotes), [5]);
assert.deepEqual(rounded(findFeatures('ln(x+3)', -40, 40).verticalAsymptotes), [-3]);
assert.deepEqual(rounded(findFeatures('(x+1)^2', -40, 40).roots), [-1]);
assert.deepEqual(findFeatures('3', -40, 40).horizontalAsymptotes, [], 'a constant is not an asymptote');
assert.equal(findFeatures('tan(x)', -40, 40).periodic, true);
assert.deepEqual(findFeatures('1/x+2', 0.5, 40, { unboundedLeft: false, unboundedRight: false }).horizontalAsymptotes, [], 'bounded domain');

// A window that hides the features is widened, asymptotes are drawn dashed and captioned, roots labelled.
const hidden = {
  ...parabolaGraph,
  settings: { ...parabolaGraph.settings, xmin: -5, xmax: 5, ymin: -5, ymax: 5, xtick: 1, ytick: 1 },
  objects: [{ id: 'f', type: 'function', expression: '1/(x-8)+7', min: null, max: null, color: '#000000', width: 0.8, dashed: false, visible: true }],
} as unknown as Graph;
const shown = showGraphFeatures(hidden);
assert.ok(shown.settings.xmax > 8 && shown.settings.ymax > 7);
assert.ok(shown.objects.some((object) => object.type === 'line' && object.vertical && object.b === 8 && object.dashed));
assert.ok(shown.objects.some((object) => object.type === 'line' && !object.vertical && object.b === 7));
assert.ok(shown.objects.some((object) => object.type === 'point' && object.label.text === 'x = 8' && object.marker === false));
assert.ok(shown.objects.some((object) => object.type === 'point' && object.label.text === 'y = 7'));
assert.ok(!shown.objects.some((object) => object.type === 'point' && object.y === 0), 'the root 8 - 1/7 is not clean enough to label');
const quadratic = showGraphFeatures({ ...hidden, objects: [{ ...hidden.objects[0], expression: '(x-2)*(x+9)' }] } as Graph);
assert.ok(quadratic.settings.xmin < -9, 'roots widen the window');
assert.deepEqual(quadratic.objects.filter((object) => object.type === 'point').map((object) => object.type === 'point' && object.label.text), ['(-9, 0)', '(2, 0)']);
// The engine applies it only for templates that ask.
const featured = calculateAlgorithmicQuestionVariant(question({
  ...graphed,
  algorithmModel: { ...graphed.algorithmModel!, graphs: [{ image: 'pc12-ch01-03', graph: { ...parabolaGraph, settings: { ...parabolaGraph.settings, showFeatures: true } } }] },
}), 5)!;
assert.ok(!('showFeatures' in graphFromSvg(featured.images![0].svg)!.settings));

// Variants: a seed recalculates the same variant from any state, and Original restores the
// imported text, so the history only needs seeds.
const applyResult = (q: Question, result: { updates: Partial<Question> } | undefined) => ({ ...q, ...result!.updates }) as Question;
const visible = (q: Question) => JSON.stringify([q.body, q.choices, q.solution, q.answer]);
const first = applyResult(translation, calculateAlgorithmicQuestionVariant(translation, 11));
const second = applyResult(first, calculateAlgorithmicQuestionVariant(first, 22));
const firstAgain = applyResult(second, calculateAlgorithmicQuestionVariant(second, 11));
assert.equal(visible(firstAgain), visible(first), 'a seed reproduces its variant after others');
const restored = applyResult(second, calculateAlgorithmicQuestionOriginal(second));
assert.equal(visible(restored), visible(translation), 'Original restores the imported values');
assert.equal(restored.algorithmSeed, undefined);
assert.equal(restored.algorithmVariant, undefined);
assert.equal(restored.algorithmEvaluation, undefined);
assert.equal(canRestoreAlgorithmicOriginal(translation), true);
assert.equal(canRestoreAlgorithmicOriginal(question({ algorithmModel: { ...translation.algorithmModel!, definitions: [variable('m', 'range(1,5)')] } })), false,
  'no Original without imported values');
// A sign on its own is a value ("A + B" with the sign chosen by ExamView).
const signed = question({
  body: 'Simplify $tan(A + B)$',
  algorithmModel: {
    scope: { kind: 'question' }, sequence: [], source: 'test',
    definitions: [variable('sym', 'if(1>0,"-","+")', '+')],
    slots: [{ name: 'sym', field: 'body', text: '+', occurrence: 0 }],
  },
});
const minus = applyResult(signed, calculateAlgorithmicQuestionVariant(signed, 1));
assert.equal(minus.body, 'Simplify $tan(A - B)$');
assert.equal(applyResult(minus, calculateAlgorithmicQuestionOriginal(minus)).body, 'Simplify $tan(A + B)$');

// History bookkeeping.
const tracked = { algorithmSeed: 22, algorithmHistory: [11] };
assert.deepEqual(variantSeeds(tracked), [11, 22], 'the shown seed is part of the history');
assert.deepEqual(withVariant(tracked, 33), [11, 22, 33]);
assert.deepEqual(withVariant(tracked, 11), [11, 22], 'a seed already there keeps its place');
assert.deepEqual(withoutVariant({ algorithmSeed: 22, algorithmHistory: [11, 22, 33] }, 11), [22, 33]);
assert.deepEqual(withoutVariant({ algorithmSeed: 22, algorithmHistory: [11, 22] }, 22), [11, 22], 'the shown variant stays');
assert.deepEqual(withoutOldVariants({ algorithmSeed: 22, algorithmHistory: [11, 22, 33] }), [22]);
assert.equal(withoutOldVariants({ algorithmHistory: [11, 22] }), undefined, 'showing the original clears them all');
assert.equal(variantNumber({ algorithmHistory: [11, 22, 33], algorithmSeed: 33 }, 22), 2);

// Seed, variant number and history survive the folder/Git format.
const stored = JSON.parse(JSON.stringify({ ...first, id: 'variant-q', points: 1, tags: [], createdAt: 1, algorithmSeed: 22, algorithmVariant: 2, algorithmHistory: [11, 22] })) as Question;
const reread = importRepoEntriesToAppData(exportAppDataToRepoEntries({ questions: [stored], customClasses: [], savedTests: [] })).appData.questions[0];
assert.equal(reread.algorithmSeed, 22);
assert.equal(reread.algorithmVariant, 2);
assert.deepEqual(reread.algorithmHistory, [11, 22]);

// Redrawn graphs use a solid grid unless the template asks for dots.
assert.equal(graphFromSvg(drawn.images![0].svg)!.settings.gridStyle, 'lines');
const dotted = calculateAlgorithmicQuestionVariant(question({
  ...graphed,
  algorithmModel: { ...graphed.algorithmModel!, graphs: [{ image: 'pc12-ch01-03', graph: { ...parabolaGraph, settings: { ...parabolaGraph.settings, gridStyle: 'dots' } } }] },
}), 5)!;
assert.equal(graphFromSvg(dotted.images![0].svg)!.settings.gridStyle, 'dots');

// Picture choices are laid out by their width, not their file name, so a redrawn graph's longer
// name doesn't push a two-column choice grid into one column.
const pictureChoices = (suffix: string) => Object.fromEntries(['A', 'B', 'C', 'D'].map((id, index) => [id, `#image("/imgs/pc12-ch09-0${index + 1}${suffix}", width: 2.40in)`]));
const columns = (choices: Record<string, string>) => formatBody('Which graph?', choices).match(/columns: \(([^)]*)\)/)![1].split(',').length;
assert.equal(columns(pictureChoices('')), 2);
assert.equal(columns(pictureChoices('-g0bcb9dd2')), 2);

console.log('algorithm tests passed');
