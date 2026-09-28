import type { Rng } from '../../rng.ts';
import { Q } from '../../exact.ts';
import { graphTypst, type Curve, type Dot } from '../../graph.ts';
import { math, pc40s } from './common.ts';
import { optNum, optOn, radioOption, toggleOption } from '../../options.ts';
import type { GenOptions } from '../../types.ts';
import { describeTransform, IDENTITY, listText, mappingRule, polyEval, transformText, type Transform } from './functions.ts';

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** y − k = a√(b(x − h)) as Typst math. */
const radicalText = (t: Transform) => transformText(t, 'sqrt');

/** Evaluate a√(b(x − h)) + k, or NaN outside the domain. */
const radicalValue = (t: Transform, x: number) => {
  const inside = t.b.value * (x - t.h);
  return inside < -1e-12 ? NaN : t.a.value * Math.sqrt(Math.max(0, inside)) + t.k;
};

const RADICAL_OPTIONS = [
  toggleOption('vertical', 'Include a vertical stretch or reflection (a)', [false, true, true]),
  toggleOption('horizontal', 'Include a horizontal stretch or reflection (b)', [false, false, true]),
];

function randomRadical(rng: Rng, difficulty: number, o?: GenOptions): Transform {
  const h = rng.int(-4, 4), k = rng.int(-4, 4);
  const vertical = optOn(o, 'vertical', difficulty > 1), horizontal = optOn(o, 'horizontal', difficulty === 3);
  const a = vertical ? rng.pick(horizontal ? [new Q(2), new Q(-1), new Q(1), new Q(-2)] : [new Q(2), new Q(-1), new Q(3), new Q(1, 2), new Q(-2)]) : new Q(1);
  const b = horizontal ? rng.pick([new Q(-1), new Q(2), new Q(-2), new Q(1, 2)]) : new Q(1);
  return { a, b, h, k };
}

function radicalGraph(t: Transform, size: number, extra: Curve[] = [], dots: Dot[] = []): string {
  const start = t.b.value > 0 ? t.h : -9, end = t.b.value > 0 ? 9 : t.h;
  return graphTypst({
    xMin: -8, xMax: 8, yMin: -8, yMax: 8, xLabelStep: 4, yLabelStep: 4, width: size, height: size,
    curves: [...extra, { f: (x) => radicalValue(t, x), domain: [start, end] }],
    dots: [{ x: t.h, y: t.k }, ...dots],
  });
}

export const radDomainRange = pc40s('40s-rad-domain-range', {
  levels: { 1: 'Translations', 2: 'With a vertical stretch or reflection', 3: 'With a horizontal reflection' },
  options: RADICAL_OPTIONS,
  generate(rng, difficulty, o) {
    const t = randomRadical(rng, difficulty, o);
    const ask = rng.pick(['domain', 'range'] as const);
    const domain = t.b.value > 0 ? `{x | x >= ${t.h}, x in RR}` : `{x | x <= ${t.h}, x in RR}`;
    const range = t.a.value > 0 ? `{y | y >= ${t.k}, y in RR}` : `{y | y <= ${t.k}, y in RR}`;
    const answer = ask === 'domain' ? domain : range;
    const wrong = ask === 'domain'
      ? [`{x | x >= ${-t.h}, x in RR}`, t.b.value > 0 ? `{x | x <= ${t.h}, x in RR}` : `{x | x >= ${t.h}, x in RR}`, `{x | x >= ${t.k}, x in RR}`, '{x | x in RR}']
      : [`{y | y >= ${-t.k}, y in RR}`, t.a.value > 0 ? `{y | y <= ${t.k}, y in RR}` : `{y | y >= ${t.k}, y in RR}`, `{y | y >= ${t.h}, y in RR}`, '{y | y >= 0, y in RR}'];
    return {
      body: `State the ${ask} of ${math(radicalText(t))}.`,
      answer: math(answer),
      distractors: wrong.filter((w, i, all) => w !== answer && all.indexOf(w) === i).map(math),
      solution: `The graph starts at ${math(`(${t.h}, ${t.k})`)}. It extends to the ${t.b.value > 0 ? 'right' : 'left'} (${t.b.value > 0 ? 'b > 0' : 'b < 0'}) and ${t.a.value > 0 ? 'upward' : 'downward'} (${t.a.value > 0 ? 'a > 0' : 'a < 0'}): domain ${math(domain)}, range ${math(range)}.`,
    };
  },
});

export const radDescribe = pc40s('40s-rad-describe', {
  levels: { 1: 'Translations', 2: 'With a vertical stretch or reflection', 3: 'With horizontal changes' },
  options: RADICAL_OPTIONS,
  generate(rng, difficulty, o) {
    const t = randomRadical(rng, difficulty, o);
    const answer = capitalize(listText(describeTransform(t)));
    const misses: Transform[] = [{ ...t, h: -t.h }, { ...t, k: -t.k, h: t.k === 0 ? -t.h : t.h }, { ...t, a: t.a.neg() }, { ...t, b: new Q(t.b.d, t.b.n), a: t.b.eq(1) ? t.a.mul(2) : t.a }];
    return {
      body: `Describe how the graph of ${math(radicalText(t))} is related to the graph of ${math('y = sqrt(x)')}.`,
      answer,
      distractors: misses.map((m) => capitalize(listText(describeTransform(m)))).filter((d, i, all) => d !== answer && all.indexOf(d) === i),
      solution: `Compare with ${math('y - k = a sqrt(b(x - h))')}: ${math(`a = ${t.a.typst()}`)}, ${math(`b = ${t.b.typst()}`)}, ${math(`h = ${t.h}`)}, ${math(`k = ${t.k}`)}. The graph of ${math('y = sqrt(x)')} undergoes ${listText(describeTransform(t))}.`,
    };
  },
});

export const radSqrtFDomain = pc40s('40s-rad-sqrt-f-domain', {
  levels: { 1: 'f linear', 2: 'f = c² − x²', 3: 'f = x² − c² or (x − p)(x − q)' },
  options: [
    radioOption('form', 'f is', [['1', 'f linear'], ['2', 'f = c² − x²'], ['3', 'f = x² − c² or (x − p)(x − q)']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    if (difficulty === 1) {
      const a = rng.nonZero(-4, 4), c = rng.int(-9, 9);
      const edge = new Q(-c, a);
      const radicand = `${a === 1 ? '' : a === -1 ? '-' : a}x ${c < 0 ? '-' : '+'} ${Math.abs(c)}`;
      const answer = a > 0 ? `{x | x >= ${edge.typst()}, x in RR}` : `{x | x <= ${edge.typst()}, x in RR}`;
      return {
        body: `State the domain of ${math(`y = sqrt(${radicand})`)}.`,
        answer: math(answer),
        distractors: [a > 0 ? `{x | x <= ${edge.typst()}, x in RR}` : `{x | x >= ${edge.typst()}, x in RR}`, `{x | x >= ${edge.neg().typst()}, x in RR}`, '{x | x >= 0, x in RR}'].filter((d) => d !== answer).map(math),
        solution: `The radicand must be non-negative: ${math(`${radicand} >= 0`)}, so ${math(a > 0 ? `x >= ${edge.typst()}` : `x <= ${edge.typst()}`)}${a < 0 ? ' (dividing by a negative reverses the inequality)' : ''}.`,
      };
    }
    if (difficulty === 2) {
      const c = rng.int(2, 7);
      const answer = `{x | -${c} <= x <= ${c}, x in RR}`;
      return {
        body: `State the domain of ${math(`y = sqrt(${c * c} - x^2)`)}.`,
        answer: math(answer),
        distractors: [`{x | x <= -${c} "or" x >= ${c}, x in RR}`, `{x | x <= ${c}, x in RR}`, `{x | -${c * c} <= x <= ${c * c}, x in RR}`].map(math),
        solution: `${math(`${c * c} - x^2 >= 0`)} means ${math(`x^2 <= ${c * c}`)}, so ${math(`-${c} <= x <= ${c}`)}. (The range is ${math(`{y | 0 <= y <= ${c}}`)}.)`,
      };
    }
    const p = rng.int(-6, 2), q = rng.int(p + 1, 7);
    const inside = p === -q ? `x^2 - ${q * q}` : `(x ${p > 0 ? '-' : '+'} ${Math.abs(p)})(x ${q > 0 ? '-' : '+'} ${Math.abs(q)})`.replace('(x + 0)', 'x').replace('(x - 0)', 'x');
    const answer = `{x | x <= ${p} "or" x >= ${q}, x in RR}`;
    return {
      body: `State the domain of ${math(`y = sqrt(${inside})`)}.`,
      answer: math(answer),
      distractors: [`{x | ${p} <= x <= ${q}, x in RR}`, `{x | x >= ${q}, x in RR}`, `{x | x <= ${-q} "or" x >= ${-p}, x in RR}`].filter((d) => d !== answer).map(math),
      solution: `The radicand is zero at ${math(`x = ${p}`)} and ${math(`x = ${q}`)}, positive outside those values and negative between them (it is an upward parabola). So ${math(answer)}.`,
    };
  },
});

export const radSketchTable = pc40s('40s-rad-sketch-table', {
  levels: { 1: 'y = √x', 2: 'y = √(x − h) + k', 3: 'y = a√x' },
  options: [
    radioOption('form', 'Graph', [['1', 'y = √x'], ['2', 'y = √(x − h) + k'], ['3', 'y = a√x']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const t: Transform = difficulty === 1 ? IDENTITY : difficulty === 2 ? { ...IDENTITY, h: rng.nonZero(-4, 4), k: rng.nonZero(-3, 3) } : { ...IDENTITY, a: rng.pick([new Q(2), new Q(-1), new Q(-2)]) };
    const xs = [0, 1, 4, 9].map((x) => x + t.h);
    const rows = xs.map((x) => [x, radicalValue(t, x)]);
    const table = `#table(columns: 5, align: center, inset: 5pt, [$x$], ${rows.map(([x]) => `[$${x}$]`).join(', ')}, [$y$], ${rows.map(() => '[]').join(', ')})`;
    const filled = `#table(columns: 5, align: center, inset: 5pt, [$x$], ${rows.map(([x]) => `[$${x}$]`).join(', ')}, [$y$], ${rows.map(([, y]) => `[$${y}$]`).join(', ')})`;
    const dots = rows.map(([x, y]) => ({ x, y }));
    return {
      body: `Complete the table of values and graph ${math(radicalText(t))}.\n\n${table}`,
      answer: radicalGraph(t, 3.4, [], dots),
      distractors: [radicalGraph({ ...t, a: t.a.neg() }, 3.4), radicalGraph({ ...t, h: -t.h || 2 }, 3.4), radicalGraph({ ...t, b: new Q(-1) }, 3.4)],
      solution: `${filled}\n\nPlot the points and join them with a smooth curve starting at ${math(`(${t.h}, ${t.k})`)}.`,
    };
  },
});

export const radSketchTransform = pc40s('40s-rad-sketch-transform', {
  levels: { 1: 'Translations', 2: 'With a vertical stretch or reflection', 3: 'With a horizontal stretch or reflection' },
  options: RADICAL_OPTIONS,
  generate(rng, difficulty, o) {
    const t = randomRadical(rng, difficulty, o);
    const base: Curve = { f: (x) => Math.sqrt(x), domain: [0, 9], faint: true };
    return {
      body: `Graph ${math(radicalText(t))} using transformations of ${math('y = sqrt(x)')}.`,
      answer: radicalGraph(t, 3.4, [base]),
      distractors: [radicalGraph({ ...t, h: -t.h || 3 }, 3.4, [base]), radicalGraph({ ...t, a: t.a.neg() }, 3.4, [base]), radicalGraph({ ...t, b: t.b.neg() }, 3.4, [base])],
      solution: `Map ${math('(0, 0), (1, 1), (4, 2)')} with ${math(mappingRule(t))}. The graph starts at ${math(`(${t.h}, ${t.k})`)}. (${math('y = sqrt(x)')} is shown dashed.)`,
    };
  },
});

export const radSketchSqrtF = pc40s('40s-rad-sketch-sqrt-f', {
  levels: { 1: 'f linear', 2: 'f an upward parabola', 3: 'f a downward parabola' },
  options: [
    radioOption('form', 'f is', [['1', 'f linear'], ['2', 'f an upward parabola'], ['3', 'f a downward parabola']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const f = difficulty === 1 ? [rng.pick([1, -1, 2, 1 / 2]), rng.int(-4, 4)] : difficulty === 2 ? [1 / 2, 0, -rng.int(1, 4)] : [-1 / 2, 0, rng.int(2, 6)];
    const fx = (x: number) => polyEval(f, x);
    const window = { xMin: -6, xMax: 6, yMin: -6, yMax: 6, xLabelStep: 2, yLabelStep: 2 };
    const graph = (g: (x: number) => number, size: number) => graphTypst({ ...window, width: size, height: size, curves: [{ f: fx, faint: true }, { f: g }] });
    return {
      body: `The graph of ${math('y = f(x)')} is shown. Graph ${math('y = sqrt(f(x))')}.\n\n${graphTypst({ ...window, width: 4.5, height: 4.5, curves: [{ f: fx }] })}`,
      answer: graph((x) => (fx(x) >= 0 ? Math.sqrt(fx(x)) : NaN), 3.4),
      distractors: [graph((x) => (fx(x) >= 0 ? fx(x) ** 2 : NaN), 3.4), graph((x) => Math.abs(fx(x)), 3.4), graph((x) => (fx(x) <= 0 ? Math.sqrt(-fx(x)) : NaN), 3.4)],
      solution: `${math('sqrt(f(x))')} exists only where ${math('f(x) >= 0')}. Points where ${math('f(x) = 0')} or ${math('f(x) = 1')} are invariant; where ${math('f(x) > 1')} the graph is lower than ${math('f')}, and where ${math('0 < f(x) < 1')} it is higher.`,
    };
  },
});

export const radSolveGraphically = pc40s('40s-rad-solve-graphically', {
  levels: { 1: 'The x-intercept of y = √(x + a) − b', 2: 'Intersection with y = k', 3: 'Intersection with a line' },
  options: [
    radioOption('form', 'Solve', [['1', 'The x-intercept of y = √(x + a) − b'], ['2', 'Intersection with y = k'], ['3', 'Intersection with a line']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const s = rng.int(1, 3), x0 = rng.int(-4, 4);
    const a = s * s - x0; // √(x + a) = s at x = x0
    const inside = `x ${a < 0 ? '-' : '+'} ${Math.abs(a)}`.replace(' + 0', '').replace(' - 0', '');
    const root = (x: number) => (x + a >= 0 ? Math.sqrt(x + a) : NaN);
    const window = { xMin: -8, xMax: 8, yMin: -6, yMax: 6, xLabelStep: 2, yLabelStep: 2, width: 5.5, height: 4 };
    if (difficulty === 1) {
      const graph = graphTypst({ ...window, curves: [{ f: (x) => root(x) - s, domain: [-a, 8] }], dots: [{ x: x0, y: 0 }] });
      return {
        body: `The graph of ${math(`y = sqrt(${inside}) - ${s}`)} is shown. Use it to solve ${math(`sqrt(${inside}) - ${s} = 0`)}.\n\n${graph}`,
        answer: math(`x = ${x0}`),
        distractors: [`x = ${-a}`, `x = ${-s}`, `x = ${x0 + 1}`].filter((d) => d !== `x = ${x0}`).map(math),
        solution: `The roots of the equation are the x-intercepts of the graph: ${math(`x = ${x0}`)}. Check: ${math(`sqrt(${x0 + a}) - ${s} = 0`)}.`,
      };
    }
    if (difficulty === 2) {
      const graph = graphTypst({ ...window, curves: [{ f: root, domain: [-a, 8] }, { f: () => s, dashed: true }], dots: [{ x: x0, y: s }] });
      return {
        body: `The graphs of ${math(`y = sqrt(${inside})`)} and ${math(`y = ${s}`)} are shown. Use them to solve ${math(`sqrt(${inside}) = ${s}`)}.\n\n${graph}`,
        answer: math(`x = ${x0}`),
        distractors: [`x = ${s}`, `x = ${-a}`, `x = ${x0 - 1}`].filter((d) => d !== `x = ${x0}`).map(math),
        solution: `The solution is the x-coordinate of the intersection point: ${math(`x = ${x0}`)}. Check: ${math(`sqrt(${x0 + a}) = ${s}`)}.`,
      };
    }
    // √(x + a) = x + c through (x0, s): c = s − x0. Squaring gives a second root that may be extraneous.
    const c = s - x0;
    const other = 1 - 2 * c - x0;
    const valid = [x0, ...(other !== x0 && other + c >= 0 && other + a >= 0 ? [other] : [])].sort((p, q) => p - q);
    const line = `x ${c < 0 ? '-' : '+'} ${Math.abs(c)}`.replace(' + 0', '').replace(' - 0', '');
    const graph = graphTypst({ ...window, curves: [{ f: root, domain: [-a, 8] }, { f: (x) => x + c, dashed: true }], dots: valid.map((x) => ({ x, y: x + c })) });
    const answer = `x = ${valid.join(', ')}`;
    return {
      body: `The graphs of ${math(`y = sqrt(${inside})`)} and ${math(`y = ${line}`)} are shown. Use them to solve ${math(`sqrt(${inside}) = ${line}`)}.\n\n${graph}`,
      answer: math(answer),
      distractors: [`x = ${[x0, other].sort((p, q) => p - q).join(', ')}`, `x = ${other}`, `x = ${x0 + c}`].filter((d, i, all) => d !== answer && all.indexOf(d) === i).map(math),
      solution: `The solutions are where the graphs intersect: ${math(answer)}.${valid.length === 1 && other !== x0 ? ` Solving algebraically also gives ${math(`x = ${other}`)}, but it is extraneous: the graphs do not meet there.` : ''}`,
    };
  },
});

export const RADICAL_GENERATORS = [radDomainRange, radDescribe, radSqrtFDomain, radSketchTable, radSketchTransform, radSketchSqrtF, radSolveGraphically];
