import { angle, Q, reciprocalFn, SPECIAL_ANGLES, Surds, TRIG_FNS, exactTrig, type TrigFn } from '../../exact.ts';
import { optNum, optOne, radioOption } from '../../options.ts';
import type { Rng } from '../../rng.ts';
import type { Difficulty, GeneratedProblem, GenOptions, OptionSpec } from '../../types.ts';
import { block, math, pc40s } from './common.ts';
import {
  COMPOUND_EXAMPLES, TWO_ANGLE_EXAMPLES, combinedRatios, compoundValue, quadrantName, ratioSign,
  ratioValue, recoverRatios, sameSurds, termValue,
  type CompoundTrig, type Quadrant, type RatioGiven, type TrigTerm, type TwoAngleTrig,
} from './exact-trig-model.ts';

const withExamples = (options: OptionSpec[]): OptionSpec[] => [options.at(-1)!, ...options.slice(0, -1).map(spec => ({ ...spec, enabledWhen: { id: 'example', value: 'practice' } }))];
const EXAMPLE_HELP = 'Exam examples keep the original mathematical values and task. Choose Practice variants to use the other settings.';
const functions = (choice: string): TrigFn[] => choice === 'primary' ? ['sin', 'cos', 'tan'] : choice === 'reciprocal' ? ['csc', 'sec', 'cot'] : TRIG_FNS;
const formatTerm = (term: TrigTerm, unit: 'deg' | 'rad') => `${term.fn}${term.power === 1 ? '' : `^${term.power}`}(${angle(term.degrees, unit)})`;
export function compoundExpression(model: CompoundTrig, unit: 'deg' | 'rad'): string {
  const [a, b, c] = model.terms.map(term => formatTerm(term, unit));
  return model.task === 'product' ? `${a} dot ${b}` : `${a} ${model.sign === 1 ? '+' : '-'} ${b}${model.task === 'sum-product' ? ` dot ${c}` : ''}`;
}

export function compoundModel(rng: Rng, difficulty: Difficulty, o?: GenOptions): CompoundTrig {
  const example = COMPOUND_EXAMPLES[optOne(o, 'example', 'practice')];
  if (example) return example;
  const task = optOne(o, 'task', difficulty === 1 ? 'sum' : difficulty === 2 ? 'product' : 'sum-product') as CompoundTrig['task'];
  const fns = functions(optOne(o, 'ratios', difficulty === 1 ? 'primary' : 'all'));
  const maxPower = optNum(o, 'powers', difficulty === 1 ? 1 : difficulty === 2 ? 2 : 3);
  const wide = optOne(o, 'range', difficulty === 3 ? 'wide' : 'basic') === 'wide';
  const terms = Array.from({ length: task === 'sum-product' ? 3 : 2 }, () => {
    const fn = rng.pick(fns);
    const base = rng.pick(SPECIAL_ANGLES.filter(a => exactTrig(fn, a) !== null));
    return { fn, degrees: base + (wide ? 360 * rng.pick([-2, -1, 1, 2]) : 0), power: maxPower === 1 ? 1 : rng.int(1, maxPower) };
  });
  return { terms, task, sign: rng.pick([1, -1] as const) };
}

export function compoundProblem(model: CompoundTrig, unit: 'deg' | 'rad'): GeneratedProblem {
  const value = compoundValue(model);
  const values = model.terms.map(termValue);
  const [a, b, c] = values;
  // Mistakes in signs, powers, the operation, or omitting part of the expression.
  const candidates = [
    compoundValue({ ...model, sign: model.sign === 1 ? -1 : 1 }),
    compoundValue({ ...model, terms: model.terms.map(t => ({ ...t, power: 1 })) }),
    compoundValue({ ...model, terms: model.terms.map(t => {
      const d = ((t.degrees % 360) + 360) % 360;
      return { ...t, degrees: d <= 90 ? d : d <= 180 ? 180 - d : d <= 270 ? d - 180 : 360 - d };
    }) }),
    value.scale(-1), a, b, a.add(b), a.mul(b),
    // Dropping/adding a unit term or a numerical factor during simplification.
    value.add(Surds.of(1)), value.sub(Surds.of(1)), value.scale(2), value.div(2), value.add(Surds.of(2)),
  ];
  const wrong: Surds[] = [];
  for (const candidate of candidates) if (!sameSurds(candidate, value) && !wrong.some(w => sameSurds(candidate, w))) wrong.push(candidate);
  const expr = compoundExpression(model, unit);
  const substituted = model.task === 'product' ? `(${a.typst()}) dot (${b.typst()})`
    : `(${a.typst()}) ${model.sign === 1 ? '+' : '-'} (${b.typst()})${model.task === 'sum-product' ? ` dot (${c.typst()})` : ''}`;
  const substitutions = model.terms.map((t, i) => math(`${formatTerm(t, unit)} = ${values[i].typst()}`)).join(', ');
  return {
    body: `Evaluate exactly, without a calculator: ${math(expr)}.`,
    answer: math(value.typst()),
    distractors: wrong.slice(0, 4).map(v => math(v.typst())),
    solution: `Reduce each angle by full rotations and use its reference angle and quadrant. Evaluate reciprocal ratios and powers before combining terms.\n\n${substitutions}.\n\n${block(`${expr} &= ${substituted} \\\\ &= ${value.typst()}`)}`,
  };
}

export const compoundExactTrig = pc40s('40s-ratio-expression', {
  points: 3,
  levels: { 1: 'Sums of primary ratios', 2: 'Products, reciprocal ratios and squares', 3: 'Mixed expressions, cubes and angles beyond one rotation' },
  options: withExamples([
    radioOption('task', 'Expression', [['sum', 'Sum or difference'], ['product', 'Product'], ['sum-product', 'Sum or difference with a product']], ['sum', 'product', 'sum-product']),
    radioOption('unit', 'Angles in', [['deg', 'Degrees'], ['rad', 'Radians']], ['deg', 'rad', 'rad']),
    radioOption('ratios', 'Ratios', [['primary', 'sin, cos, tan'], ['reciprocal', 'csc, sec, cot'], ['all', 'All six']], ['primary', 'all', 'all']),
    radioOption('powers', 'Largest power', [['1', 'No powers'], ['2', 'Squares'], ['3', 'Squares and cubes']], ['1', '2', '3']),
    radioOption('range', 'Angles', [['basic', 'One rotation'], ['wide', 'Negative and beyond one rotation']], ['basic', 'basic', 'wide']),
    radioOption('example', 'Exam example', [['practice', 'Practice variants'], ['2026-jun-q25', 'June 2026 · Q25'], ['2026-jan-q37', 'January 2026 · Q37'], ['2025-jun-q28', 'June 2025 · Q28']], ['practice', 'practice', 'practice'], EXAMPLE_HELP),
  ]),
  generate(rng, difficulty, o) {
    const example = optOne(o, 'example', 'practice');
    return compoundProblem(compoundModel(rng, difficulty, o), example === 'practice' ? optOne(o, 'unit', difficulty === 1 ? 'deg' : 'rad') as 'deg' | 'rad' : 'rad');
  },
});

function randomGiven(rng: Rng, quadrant: Quadrant, fn: TrigFn, difficulty: Difficulty): RatioGiven {
  const magnitude = difficulty === 1 ? rng.pick([new Q(3, 5), new Q(4, 5), new Q(5, 13), new Q(12, 13)])
    : rng.pick([new Q(1, 3), new Q(2, 3), new Q(2, 5), new Q(3, 7), new Q(4, 7), new Q(5, 8), new Q(3, 5), new Q(5, 13)]);
  const value = fn === 'csc' || fn === 'sec' ? new Q(1).div(magnitude)
    : fn === 'tan' || fn === 'cot' ? rng.pick(difficulty === 1 ? [new Q(3, 4), new Q(4, 3), new Q(5, 12), new Q(12, 5)] : [new Q(3, 4), new Q(5, 12), new Q(2, 3), new Q(4, 5), new Q(1, 2)]) : magnitude;
  return { fn, value: value.mul(ratioSign(fn, quadrant)), quadrant };
}

export function twoAngleModel(rng: Rng, difficulty: Difficulty, o?: GenOptions): TwoAngleTrig {
  const example = TWO_ANGLE_EXAMPLES[optOne(o, 'example', 'practice')];
  if (example) return example;
  const inferQuadrant = optOne(o, 'quadrants', difficulty === 3 ? 'same' : 'explicit') === 'same';
  const givenFns = functions(optOne(o, 'given', difficulty === 3 ? 'all' : 'primary'));
  // To infer a shared quadrant uniquely, give one sine sign and one cosine sign.
  const sineFns = givenFns.filter(fn => fn === 'sin' || fn === 'csc');
  const cosineFns = givenFns.filter(fn => fn === 'cos' || fn === 'sec');
  for (let attempt = 0; attempt < 100; attempt++) {
    const qa = rng.pick([1, 2, 3, 4] as const), qb = inferQuadrant ? qa : rng.pick([1, 2, 3, 4] as const);
    const swap = rng.next() < 0.5;
    const fa = inferQuadrant ? rng.pick(swap ? sineFns : cosineFns) : rng.pick(givenFns);
    const fb = inferQuadrant ? rng.pick(swap ? cosineFns : sineFns) : rng.pick(givenFns);
    const choice = optOne(o, 'fn', difficulty === 1 ? 'sin' : difficulty === 2 ? 'cos' : 'tan');
    const model: TwoAngleTrig = {
      alpha: randomGiven(rng, qa, fa, difficulty), beta: randomGiven(rng, qb, fb, difficulty),
      operation: optOne(o, 'operation', difficulty === 1 ? '+' : '-') as '+' | '-',
      fn: choice === 'either' ? rng.pick(TRIG_FNS) : choice as TrigFn,
      paired: optOne(o, 'task', difficulty === 3 ? 'paired' : 'single') === 'paired', inferQuadrant,
    };
    const ratios = combinedRatios(model);
    const requested = model.paired ? [model.fn, reciprocalFn(model.fn)] : [model.fn];
    const needsSin = requested.some(fn => fn === 'csc' || fn === 'cot');
    const needsCos = requested.some(fn => fn === 'sec' || fn === 'tan');
    if ((needsSin && !ratios.sin.terms.size) || (needsCos && !ratios.cos.terms.size)) continue;
    return model;
  }
  throw new Error('Could not choose defined exact ratios for these settings.');
}

function recoveryWorking(given: RatioGiven, name: string): string {
  const r = recoverRatios(given);
  const known = given.fn === 'csc' || given.fn === 'sec' ? new Q(1).div(given.value) : given.value;
  const fn = given.fn === 'csc' ? 'sin' : given.fn === 'sec' ? 'cos' : given.fn;
  const intro = `${math(`${given.fn} ${name} = ${given.value.typst()}`)} and quadrant ${quadrantName(given.quadrant)} give `;
  if (fn === 'sin' || fn === 'cos') {
    const other = fn === 'sin' ? 'cos' : 'sin';
    const missing = r[other];
    const sign = ratioSign(other, given.quadrant) < 0 ? '-' : '';
    return `${intro}${math(`${fn} ${name} = ${known.typst()}`)}. Using ${math(`sin^2 ${name} + cos^2 ${name} = 1`)},\n\n${block(`${other} ${name} &= ${sign}sqrt(1 - (${known.typst()})^2) \\\\ &= ${missing.typst()}`)}`;
  }
  const normalized = fn === 'tan' ? 'cos' : 'sin', other = fn === 'tan' ? 'sin' : 'cos';
  const square = new Q(1).div(new Q(1).add(known.mul(known)));
  const sign = ratioSign(normalized, given.quadrant) < 0 ? '-' : '';
  return `${intro}${math(`${fn} ${name} = ${known.typst()}`)}. Substitute ${math(`${other} ${name} = (${known.typst()}) ${normalized} ${name}`)} into ${math(`sin^2 ${name} + cos^2 ${name} = 1`)}:

${block(`${normalized}^2 ${name} &= 1/(1 + (${known.typst()})^2) = ${square.typst()} \\\\ ${normalized} ${name} &= ${sign}sqrt(${square.typst()}) = ${r[normalized].typst()} \\\\ ${other} ${name} &= (${known.typst()})(${r[normalized].typst()}) = ${r[other].typst()}`)}. The quadrant fixes the sign of the square root.`;
}

export function twoAngleProblem(model: TwoAngleTrig): GeneratedProblem {
  const a = recoverRatios(model.alpha), b = recoverRatios(model.beta), ratios = combinedRatios(model);
  const value = ratioValue(model.fn, ratios), reciprocal = reciprocalFn(model.fn);
  const target = `(alpha ${model.operation} beta)`;
  const expr = `${model.fn}${target}`;
  const second = model.paired ? ratioValue(reciprocal, ratios) : null;
  const signReason = model.inferQuadrant
    ? `The angles are in the same quadrant. Their given sine/cosine signs therefore place both in quadrant ${quadrantName(model.alpha.quadrant)}.\n\n` : '';
  const given = `${math(`${model.alpha.fn} alpha = ${model.alpha.value.typst()}`)} and ${math(`${model.beta.fn} beta = ${model.beta.value.typst()}`)}`;
  const quadrants = model.inferQuadrant ? 'where the angles terminate in the same quadrant'
    : `where ${math('alpha')} terminates in quadrant ${quadrantName(model.alpha.quadrant)} and ${math('beta')} terminates in quadrant ${quadrantName(model.beta.quadrant)}`;
  const sSign = model.operation === '+' ? '+' : '-', cSign = model.operation === '+' ? '-' : '+';
  const sine = `sin${target} &= sin alpha cos beta ${sSign} cos alpha sin beta \\\\ &= (${a.sin.typst()})(${b.cos.typst()}) ${sSign} (${a.cos.typst()})(${b.sin.typst()}) \\\\ &= ${ratios.sin.typst()}`;
  const cosine = `cos${target} &= cos alpha cos beta ${cSign} sin alpha sin beta \\\\ &= (${a.cos.typst()})(${b.cos.typst()}) ${cSign} (${a.sin.typst()})(${b.sin.typst()}) \\\\ &= ${ratios.cos.typst()}`;
  const needsBoth = model.fn !== 'sin' && model.fn !== 'cos';
  const working = [needsBoth || model.fn === 'sin' || model.fn === 'csc' || (model.paired && reciprocal === 'sin') ? block(sine) : '',
    needsBoth || model.fn === 'cos' || model.fn === 'sec' || (model.paired && reciprocal === 'cos') ? block(cosine) : ''].filter(Boolean).join('\n\n');
  const ratioStep = (fn: TrigFn, result: Surds) => {
    const fraction = fn === 'tan' ? `(${ratios.sin.typst()})/(${ratios.cos.typst()})`
      : fn === 'cot' ? `(${ratios.cos.typst()})/(${ratios.sin.typst()})`
      : fn === 'sec' ? `1/(${ratios.cos.typst()})` : fn === 'csc' ? `1/(${ratios.sin.typst()})` : null;
    return fraction ? math(`${fn}${target} = ${fraction} = ${result.typst()}`) + ' (rationalize the denominator when needed).' : '';
  };
  return {
    body: `Given ${given}, ${quadrants}, determine the exact ${model.paired ? 'values' : 'value'}, without a calculator.${model.paired ? `\n\na) ${math(expr)}\n\nb) ${math(`${reciprocal}${target}`)}` : `\n\n${math(expr)}`}`,
    answer: model.paired ? `a) ${math(value.typst())}\n\nb) ${math(second!.typst())}` : math(value.typst()),
    distractors: [],
    solution: `${signReason}${recoveryWorking(model.alpha, 'alpha')}\n\n${recoveryWorking(model.beta, 'beta')}\n\n${working}\n\n${ratioStep(model.fn, value)}${model.paired ? `\n\n${ratioStep(reciprocal, second!)}` : ''}`.trim(),
  };
}

export const twoAngleExactTrig = pc40s('40s-id-two-angle', {
  mcq: false, points: 4,
  levels: { 1: 'Given primary ratios and quadrants, with rational missing ratios', 2: 'Sum or difference with radical missing ratios', 3: 'Infer a shared quadrant and find a ratio plus its reciprocal' },
  options: withExamples([
    radioOption('fn', 'Find', [['sin', 'sin'], ['cos', 'cos'], ['tan', 'tan'], ['csc', 'csc'], ['sec', 'sec'], ['cot', 'cot'], ['either', 'Any ratio']], ['sin', 'cos', 'tan']),
    radioOption('operation', 'Identity', [['+', 'Angle sum'], ['-', 'Angle difference']], ['+', '-', '-']),
    radioOption('given', 'Given ratios', [['primary', 'sin, cos, tan'], ['reciprocal', 'csc, sec, cot'], ['all', 'All six']], ['primary', 'primary', 'all']),
    radioOption('quadrants', 'Quadrant information', [['explicit', 'Both quadrants given'], ['same', 'Infer their shared quadrant']], ['explicit', 'explicit', 'same']),
    radioOption('task', 'Parts', [['single', 'One ratio'], ['paired', 'Ratio and its reciprocal']], ['single', 'single', 'paired']),
    radioOption('example', 'Exam example', [['practice', 'Practice variants'], ['2026-jun-q31', 'June 2026 · Q31'], ['2025-jun-q35', 'June 2025 · Q35'], ['2025-jan-q31', 'January 2025 · Q31']], ['practice', 'practice', 'practice'], EXAMPLE_HELP),
  ]),
  generate(rng, difficulty, o) { return twoAngleProblem(twoAngleModel(rng, difficulty, o)); },
});

export const EXACT_TRIG_GENERATORS = [compoundExactTrig, twoAngleExactTrig];
