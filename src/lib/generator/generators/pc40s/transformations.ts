import type { Rng } from '../../rng.ts';
import { Q } from '../../exact.ts';
import type { Pt } from '../../graph.ts';
import { math, pc40s } from './common.ts';
import { manyOption, optList } from '../../options.ts';
import type { GenOptions } from '../../types.ts';
import {
  describeTransform, exactNumber, fitWindow, IDENTITY, listText, mappingRule, mapPoint, plGraph, poly, pointText,
  randomPL, transformPL, transformText, type PL, type Transform,
} from './functions.ts';

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const CHANGE_LEVELS: Record<number, string[]> = { 1: ['translate'], 2: ['vertical', 'horizontal'], 3: ['translate', 'vertical', 'horizontal', 'reflect'] };
/** Which transformations to include (a checklist). */
const CHANGES_OPTION = manyOption('changes', 'Include', [['translate', 'Translations'], ['vertical', 'A vertical stretch or compression'], ['horizontal', 'A horizontal stretch or compression'], ['reflect', 'A reflection']], [CHANGE_LEVELS[1], CHANGE_LEVELS[2], CHANGE_LEVELS[3]], 'With only the two stretches checked, each question uses one of them.');

/** A transformation built from the checked changes (by default: translations; one stretch; everything, with reflections). */
function randomTransform(rng: Rng, difficulty: number, o?: GenOptions): Transform {
  const set = new Set(optList(o, 'changes', CHANGE_LEVELS[difficulty]));
  const factor = () => rng.pick([new Q(2), new Q(3), new Q(1, 2), new Q(1, 3)]);
  let a = new Q(1), b = new Q(1), h = 0, k = 0;
  if (set.has('vertical') && set.has('horizontal') && !set.has('translate') && !set.has('reflect')) {
    if (rng.next() < 0.5) a = factor(); else b = factor();
  } else {
    if (set.has('vertical')) a = rng.pick([new Q(2), new Q(3), new Q(1, 2)]);
    if (set.has('horizontal')) b = rng.pick([new Q(2), new Q(1, 2)]);
  }
  // A reflection in the x-axis (negative a) or the y-axis (negative b).
  if (set.has('reflect')) { if (rng.next() < 0.65) a = a.neg(); else b = b.neg(); }
  if (set.has('translate')) {
    h = rng.int(-4, 4); k = rng.int(-4, 4);
    if (set.size === 1) { h = h || 2; k = k || -1; } else if (!h && !k) h = 2;
  }
  return { a, b, h, k };
}

/** A random f whose key points map to whole or half-unit points under t. */
function plFor(rng: Rng, t: Transform): PL {
  const f = randomPL(rng, { xMin: -3, xMax: 3, yMin: -3, yMax: 3 });
  // Scale so x/b and a·y stay tidy: even x for b = ±2, even y for a = ±1/2.
  const sx = Math.abs(t.b.n) === 2 || Math.abs(t.b.n) === 3 ? Math.abs(t.b.n) : 1;
  const sy = t.a.d !== 1 ? t.a.d : 1;
  return f.map(([x, y]) => [x * sx, y * sy] as Pt);
}

/** Wrong but plausible versions of a transformation. */
function nearMisses(t: Transform): Transform[] {
  return [
    { ...t, h: -t.h, k: t.h === 0 ? -t.k : t.k },
    { ...t, b: new Q(t.b.d, t.b.n), a: t.b.eq(1) ? new Q(t.a.d, t.a.n) : t.a },
    { ...t, a: t.b, b: t.a },
    { ...t, k: -t.k, h: t.k === 0 ? -t.h : t.h },
    { ...t, a: t.a.neg() },
    // Reflection slips: the other axis, both axes, or a stretch as well.
    { ...t, a: t.a.neg(), b: t.b.neg() },
    { ...t, b: t.b.neg() },
    { ...t, a: t.a.mul(2) },
  ];
}

const sameTransform = (s: Transform, t: Transform) => s.a.eq(t.a) && s.b.eq(t.b) && s.h === t.h && s.k === t.k;

export const trDescribe = pc40s('40s-tr-describe', {
  levels: { 1: 'Translations', 2: 'Stretches and compressions', 3: 'Combined, with reflections' },
  options: [CHANGES_OPTION],
  generate(rng, difficulty, o) {
    const t = randomTransform(rng, difficulty, o);
    const answer = capitalize(listText(describeTransform(t)));
    return {
      body: `Describe how the graph of ${math(transformText(t))} is related to the graph of ${math('y = f(x)')}.`,
      answer,
      distractors: nearMisses(t).filter((m) => !sameTransform(m, t)).map((m) => capitalize(listText(describeTransform(m)))).filter((d) => d !== answer),
      solution: `Compare with ${math('y - k = a f(b(x - h))')}: ${math(`a = ${t.a.typst()}`)}, ${math(`b = ${t.b.typst()}`)}, ${math(`h = ${t.h}`)}, ${math(`k = ${t.k}`)}. `
        + `The graph undergoes ${listText(describeTransform(t))}. (A horizontal factor is ${math('1/abs(b)')}.)`,
    };
  },
});

export const trWriteEquation = pc40s('40s-tr-write-equation', {
  levels: { 1: 'Translations', 2: 'Stretches and compressions', 3: 'Combined, with reflections' },
  options: [CHANGES_OPTION],
  generate(rng, difficulty, o) {
    const t = randomTransform(rng, difficulty, o);
    const answer = transformText(t);
    return {
      body: `The graph of ${math('y = f(x)')} undergoes ${listText(describeTransform(t))}. Write the equation of the new graph.`,
      answer: math(answer),
      distractors: nearMisses(t).filter((m) => !sameTransform(m, t)).map((m) => math(transformText(m))),
      solution: `Use ${math('y - k = a f(b(x - h))')} with ${math(`a = ${t.a.typst()}`)}, ${math(`b = ${t.b.typst()}`)} (a horizontal factor of ${math('1/abs(b)')}), ${math(`h = ${t.h}`)}, and ${math(`k = ${t.k}`)}: ${math(answer)}.`,
    };
  },
});

export const trMapPoint = pc40s('40s-tr-map-point', {
  points: 1,
  levels: { 1: 'Translations', 2: 'Stretches and compressions', 3: 'Combined, with reflections' },
  options: [CHANGES_OPTION],
  generate(rng, difficulty, o) {
    const t = randomTransform(rng, difficulty, o);
    const p: Pt = [rng.int(-6, 6) * (Math.abs(t.b.n) === 2 ? 2 : 1), rng.int(-6, 6) * t.a.d];
    const image = mapPoint(p, t);
    const answer = pointText(image);
    return {
      body: `The point ${math(pointText(p))} is on the graph of ${math('y = f(x)')}. Find the corresponding point on the graph of ${math(transformText(t))}.`,
      answer: math(answer),
      distractors: nearMisses(t).map((m) => pointText(mapPoint(p, m))).filter((d, i, all) => d !== answer && all.indexOf(d) === i).map(math),
      solution: `Apply ${math(mappingRule(t))}: ${math(`${pointText(p)} -> ${answer}`)}.`,
    };
  },
});

export const trMappingRule = pc40s('40s-tr-mapping-rule', {
  points: 1,
  levels: { 1: 'Translations', 2: 'Stretches and compressions', 3: 'Combined, with reflections' },
  options: [CHANGES_OPTION],
  generate(rng, difficulty, o) {
    const t = randomTransform(rng, difficulty, o);
    const answer = mappingRule(t);
    return {
      body: `Write the mapping rule for the transformation of ${math('y = f(x)')} to ${math(transformText(t))}.`,
      answer: math(answer),
      distractors: nearMisses(t).filter((m) => !sameTransform(m, t)).map((m) => mappingRule(m)).filter((d, i, all) => d !== answer && all.indexOf(d) === i).map(math),
      solution: `Each point moves as ${math('(x, y) -> (x/b + h, a y + k)')}, so ${math(answer)}.`,
    };
  },
});

export const trDomainRange = pc40s('40s-tr-domain-range', {
  levels: { 1: 'Translations', 2: 'Stretches and compressions', 3: 'Combined, with reflections' },
  options: [CHANGES_OPTION],
  generate(rng, difficulty, o) {
    const t = randomTransform(rng, difficulty, o);
    const [p, q] = [rng.int(-6, 0), rng.int(1, 6)].map((v) => v * (Math.abs(t.b.n) === 2 ? 2 : 1));
    const [r, s] = [rng.int(-5, 0), rng.int(1, 5)].map((v) => v * t.a.d);
    // Ask about a part the transformation changes (a vertical stretch alone leaves the domain as it was).
    const changesDomain = !t.b.eq(1) || t.h !== 0, changesRange = !t.a.eq(1) || t.k !== 0;
    const ask = changesDomain && !changesRange ? 'domain' : changesRange && !changesDomain ? 'range' : rng.pick(['domain', 'range'] as const);
    const ends = ask === 'domain' ? [p / t.b.value + t.h, q / t.b.value + t.h] : [t.a.value * r + t.k, t.a.value * s + t.k];
    const [lo, hi] = ends.sort((x, y) => x - y);
    const letter = ask === 'domain' ? 'x' : 'y';
    const set = (a: number, b: number) => `{${letter} | ${exactNumber(a)} <= ${letter} <= ${exactNumber(b)}, ${letter} in RR}`;
    const answer = set(lo, hi);
    const naive = ask === 'domain' ? [p * t.b.value + t.h, q * t.b.value + t.h].sort((x, y) => x - y) : [t.a.value * r - t.k, t.a.value * s - t.k].sort((x, y) => x - y);
    // Multiplying by b instead of dividing (or subtracting k), ignoring the stretch, or shifting the wrong way.
    // Ignoring the stretch, shifting the wrong way, using the other translation, or leaving it unchanged.
    const others = ask === 'domain'
      ? [[p + t.h, q + t.h], [p / t.b.value - t.h, q / t.b.value - t.h], [p / t.b.value + t.k, q / t.b.value + t.k], [p, q], [p * t.a.value, q * t.a.value], [p * 2, q * 2], [p / t.b.value + t.h, q + t.h], [p + t.h, q / t.b.value + t.h]]
      : [[r + t.k, s + t.k], [t.a.value * r - t.k, t.a.value * s - t.k], [t.a.value * r + t.h, t.a.value * s + t.h], [r, s], [r / t.b.value, s / t.b.value], [r / t.a.value, s / t.a.value], [t.a.value * r + t.k, s + t.k], [r + t.k, t.a.value * s + t.k]];
    return {
      body: `The function ${math('y = f(x)')} has domain ${math(`{x | ${p} <= x <= ${q}, x in RR}`)} and range ${math(`{y | ${r} <= y <= ${s}, y in RR}`)}. State the ${ask} of ${math(transformText(t))}.`,
      answer: math(answer),
      distractors: [naive, ...others].map(([x, y]) => set(Math.min(x, y), Math.max(x, y))).filter((d, i, all) => d !== answer && all.indexOf(d) === i).map(math),
      solution: `${ask === 'domain' ? `Map the x-values with ${math('x/b + h')}` : `Map the y-values with ${math('a y + k')}`}: the endpoints become ${math(`${exactNumber(ends[0])}`)} and ${math(`${exactNumber(ends[1])}`)}. So the ${ask} is ${math(answer)}.`,
    };
  },
});

/** A sketching problem: the graph of f, and choices showing transformed graphs. */
function sketchProblem(rng: Rng, t: Transform, misses: Transform[]) {
  const f = plFor(rng, t);
  const answerPL = transformPL(f, t);
  const window = fitWindow([f, answerPL, ...misses.map((m) => transformPL(f, m))]);
  const choice = (g: PL) => plGraph([f, g], 3.4, window);
  return {
    body: `The graph of ${math('y = f(x)')} is shown. Graph ${math(transformText(t))}.\n\n${plGraph([f], 4.5, window)}`,
    answer: choice(answerPL),
    distractors: misses.filter((m) => !sameTransform(m, t)).map((m) => choice(transformPL(f, m))),
    solution: `Apply ${math(mappingRule(t))} to each key point of ${math('f')}: ${f.map((p) => math(`${pointText(p)} -> ${pointText(mapPoint(p, t))}`)).join(', ')}. (The original graph is shown dashed.)`,
  };
}

export const trSketchTranslation = pc40s('40s-tr-sketch-translation', {
  levels: { 1: 'Vertical translations', 2: 'Horizontal translations', 3: 'Both' },
  generate(rng, difficulty) {
    const h = difficulty === 1 ? 0 : rng.nonZero(-4, 4), k = difficulty === 2 ? 0 : rng.nonZero(-4, 4);
    const t: Transform = { ...IDENTITY, h, k };
    // Wrong directions, horizontal and vertical swapped, or twice as far.
    return sketchProblem(rng, t, [{ ...t, h: -h, k: -k }, { ...t, h: k, k: h }, { ...t, h: -k, k: -h }, { ...t, h: 2 * h, k: 2 * k }, { ...t, h: -h }, { ...t, k: -k }]);
  },
});

export const trSketchStretch = pc40s('40s-tr-sketch-stretch', {
  levels: { 1: 'Vertical stretch', 2: 'Horizontal stretch or compression', 3: 'Both' },
  generate(rng, difficulty) {
    const a = difficulty === 2 ? new Q(1) : rng.pick([new Q(2), new Q(3), new Q(1, 2)]);
    const b = difficulty === 1 ? new Q(1) : rng.pick([new Q(2), new Q(1, 2)]);
    const t: Transform = { ...IDENTITY, a, b };
    return sketchProblem(rng, t, [{ ...t, a: b, b: a }, { ...t, b: new Q(b.d, b.n), a: new Q(a.d, a.n) }, { ...t, a: a.mul(2) }, { ...t, b: b.eq(1) ? new Q(2) : new Q(1) }]);
  },
});

export const trSketchCombined = pc40s('40s-tr-sketch-combined', {
  levels: { 1: 'Stretch and translation', 2: 'Reflection and translation', 3: 'Stretch, reflection, and translation' },
  generate(rng, difficulty) {
    const h = rng.nonZero(-3, 3), k = rng.nonZero(-3, 3);
    const a = difficulty === 2 ? new Q(-1) : difficulty === 1 ? rng.pick([new Q(2), new Q(1, 2)]) : rng.pick([new Q(-2), new Q(2)]);
    const b = difficulty === 3 ? rng.pick([new Q(-1), new Q(1, 2)]) : difficulty === 2 ? rng.pick([new Q(1), new Q(-1)]) : new Q(1);
    const t: Transform = { a, b, h, k };
    return sketchProblem(rng, t, nearMisses(t));
  },
});

export const trEquationFromGraph = pc40s('40s-tr-equation-from-graph', {
  levels: { 1: 'Translations', 2: 'Stretches and compressions', 3: 'Combined' },
  options: [{ ...CHANGES_OPTION, levels: { 1: 'translate', 2: 'vertical,horizontal', 3: 'translate,vertical,horizontal' }, help: 'Level 3 combines one stretch with translations.' }],
  generate(rng, difficulty, o) {
    const chosen = optList(o, 'changes', ['translate']);
    // Reading a graph: at most one stretch at a time keeps the key points on the grid.
    const t = chosen.includes('translate') && chosen.includes('vertical') && chosen.includes('horizontal') && !chosen.includes('reflect')
      ? { ...randomTransform(rng, 2), h: rng.nonZero(-3, 3), k: rng.nonZero(-3, 3) }
      : randomTransform(rng, difficulty, o);
    const f = plFor(rng, t);
    const g = transformPL(f, t);
    const answer = transformText(t);
    return {
      body: `The graph of ${math('y = f(x)')} is dashed. Write the equation of the solid graph in terms of ${math('f')}.\n\n${plGraph([f, g], 5)}`,
      answer: math(answer),
      distractors: nearMisses(t).filter((m) => !sameTransform(m, t)).map((m) => math(transformText(m))),
      solution: `Match key points: ${f.slice(0, 2).map((p) => math(`${pointText(p)} -> ${pointText(mapPoint(p, t))}`)).join(' and ')}. This is ${listText(describeTransform(t))}: ${math(answer)}.`,
    };
  },
});

type Mirror = 'x-axis' | 'y-axis' | 'line y = x';
const reflect = ([x, y]: Pt, m: Mirror): Pt => (m === 'x-axis' ? [x, -y] : m === 'y-axis' ? [-x, y] : [y, x]);

export const trReflectPoint = pc40s('40s-tr-reflect-point', {
  points: 1,
  levels: { 1: 'In the x- or y-axis', 2: 'In the line y = x', 3: 'Two reflections' },
  generate(rng, difficulty) {
    const p: Pt = [rng.nonZero(-7, 7), rng.nonZero(-7, 7)];
    if (p[0] === p[1]) p[1] += 1;
    const mirrors: Mirror[] = difficulty === 1 ? [rng.pick(['x-axis', 'y-axis'] as const)] : difficulty === 2 ? ['line y = x'] : rng.shuffle(['x-axis', 'y-axis', 'line y = x'] as Mirror[]).slice(0, 2);
    const image = mirrors.reduce((q, m) => reflect(q, m), p);
    const answer = pointText(image);
    const all: Mirror[] = ['x-axis', 'y-axis', 'line y = x'];
    return {
      body: `The point ${math(pointText(p))} is reflected in the ${mirrors.join(', then in the ')}. Find its image.`,
      answer: math(answer),
      distractors: [...all.map((m) => pointText(reflect(p, m))), pointText([-p[0], -p[1]]), pointText([-p[1], -p[0]])].filter((d, i, a) => d !== answer && a.indexOf(d) === i).map(math),
      solution: `A reflection in the x-axis maps ${math('(x, y) -> (x, -y)')}; in the y-axis, ${math('(x, y) -> (-x, y)')}; in ${math('y = x')}, ${math('(x, y) -> (y, x)')}. So ${math(`${pointText(p)} -> ${answer}`)}.`,
    };
  },
});

export const trReflectEquation = pc40s('40s-tr-reflect-equation', {
  levels: { 1: 'In the x-axis', 2: 'In the y-axis', 3: 'In the line y = x' },
  generate(rng, difficulty) {
    const coefs = rng.next() < 0.5 ? [rng.nonZero(-4, 4), rng.nonZero(-6, 6)] : [rng.nonZero(-2, 2), rng.nonZero(-5, 5), rng.nonZero(-6, 6)];
    const f = poly(coefs);
    const negX = coefs.map((c, i) => ((coefs.length - 1 - i) % 2 === 1 ? -c : c));
    const answers = { 1: `y = ${poly(coefs.map((c) => -c))}`, 2: `y = ${poly(negX)}`, 3: `x = ${poly(coefs, 'y')}` };
    const answer = answers[difficulty];
    const mirror = { 1: 'the x-axis', 2: 'the y-axis', 3: 'the line $y = x$' }[difficulty];
    return {
      body: `Given ${math(`f(x) = ${f}`)}, write the equation of the reflection of ${math('y = f(x)')} in ${mirror}.`,
      answer: math(answer),
      distractors: [answers[1], answers[2], answers[3], `y = ${poly(negX.map((c) => -c))}`, `y = ${poly(coefs.map((c, i) => (i === coefs.length - 1 ? -c : c)))}`].filter((d, i, all) => d !== answer && all.indexOf(d) === i).map(math),
      solution: {
        1: `A reflection in the x-axis is ${math('y = -f(x)')}: ${math(answer)}.`,
        2: `A reflection in the y-axis is ${math('y = f(-x)')}: replace ${math('x')} with ${math('-x')} to get ${math(answer)}.`,
        3: `A reflection in ${math('y = x')} swaps ${math('x')} and ${math('y')}: ${math(answer)}.`,
      }[difficulty],
    };
  },
});

export const trReflectSketch = pc40s('40s-tr-reflect-sketch', {
  levels: { 1: 'y = −f(x)', 2: 'y = f(−x)', 3: 'The inverse, x = f(y)' },
  generate(rng, difficulty) {
    const f = randomPL(rng, { xMin: -4, xMax: 4, yMin: -4, yMax: 4 });
    const mirrors: Mirror[] = ['x-axis', 'y-axis', 'line y = x'];
    const mirror = mirrors[difficulty - 1];
    // Keep the drawing order of the points, so a reflection in y = x draws correctly even when it is not a function.
    const image = (m: Mirror): PL => f.map((p) => reflect(p, m));
    const window = fitWindow([f, image('line y = x')]);
    const choice = (g: PL) => plGraph([f, g], 3.4, window);
    const label = { 'x-axis': 'y = -f(x)', 'y-axis': 'y = f(-x)', 'line y = x': 'x = f(y)' }[mirror];
    return {
      body: `The graph of ${math('y = f(x)')} is shown. Graph ${math(label)}.\n\n${plGraph([f], 4.5, window)}`,
      answer: choice(image(mirror)),
      distractors: [...mirrors.filter((m) => m !== mirror).map((m) => choice(image(m))), choice(f.map(([x, y]) => [-x, -y] as Pt))],
      solution: `${math(label)} is a reflection of ${math('y = f(x)')} in the ${mirror}. Each key point maps as ${math(mirror === 'x-axis' ? '(x, y) -> (x, -y)' : mirror === 'y-axis' ? '(x, y) -> (-x, y)' : '(x, y) -> (y, x)')}: ${f.map((p) => math(`${pointText(p)} -> ${pointText(reflect(p, mirror))}`)).join(', ')}.`,
    };
  },
});

export const TRANSFORMATION_GENERATORS = [trDescribe, trWriteEquation, trMapPoint, trMappingRule, trDomainRange, trSketchTranslation, trSketchStretch, trSketchCombined, trEquationFromGraph, trReflectPoint, trReflectEquation, trReflectSketch];
