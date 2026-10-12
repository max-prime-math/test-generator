// Precalculus: functions, inequalities, identities, decomposition, rotated
// conics, induction, and power series, after Kuta's ContinuityPC,
// ExtremaIncreaseDecrease, PowerFunctions, DifferentiationSecants (average
// rate), PiecewiseFunctions, PolynomialRealZeroBounds, Polynomial/Rational
// Inequalities, InverseTrigFunctions, ProductToSum/SumToProduct identities,
// PartialFractions, RotatedConics, Induction, and FunctionsAsInfiniteSeries.
import { Q } from '../../exact.ts';
import { poly, signed } from '../../format.ts';
import { manyOption, optList, optOne, radioOption } from '../../options.ts';
import { fromRoots, plEval, plGraph, polyEval, randomPL, synthetic } from '../pc40s/functions.ts';
import { us, math, task, wrong, decimal } from './common.ts';
import { piText } from './algebra2-advanced.ts';

const factor = (r: number, v = 'x') => (r === 0 ? v : `(${v} ${r < 0 ? '+' : '-'} ${Math.abs(r)})`);

// ── Continuity ───────────────────────────────────────────────────────────────

export const pcContinuity = us('pc-continuity', {
  points: 2,
  levels: { 1: 'Removable and infinite discontinuities', 2: 'Jump discontinuities (piecewise)', 3: 'Any, including continuous functions' },
  options: [
    manyOption('kinds', 'Discontinuities', [['removable', 'Removable'], ['infinite', 'Infinite'], ['jump', 'Jump'], ['none', 'Continuous functions']], [['removable', 'infinite'], ['jump'], ['removable', 'infinite', 'jump', 'none']]),
    radioOption('names', 'Names', [['standard', 'Removable, infinite, jump'], ['alternate', 'Point, essential, step']], ['standard', 'standard', 'standard']),
  ],
  generate(rng, _level, o) {
    const kind = rng.pick(optList(o, 'kinds', ['removable']));
    const alt = optOne(o, 'names', 'standard') === 'alternate';
    const name = { removable: alt ? 'point' : 'removable', infinite: alt ? 'essential' : 'infinite', jump: alt ? 'step' : 'jump' };
    const a = rng.int(-5, 5);
    let f: string, answer: string, wrongs: string[], why: string;
    if (kind === 'removable' || kind === 'infinite') {
      const b = rng.int(-5, 5) === a ? a + 1 : rng.int(-5, 5);
      const c = b === a ? a + 2 : b;
      // removable: (x − a)(x − c)/(x − a); infinite: (x − c)/(x − a)
      f = kind === 'removable' ? `(${poly(fromRoots([a, c]))})/(${poly([1, -a])})` : `(${poly([1, -c])})/(${poly([1, -a])})`;
      answer = `"${name[kind]} discontinuity at" x = ${a}`;
      wrongs = [`"${name[kind === 'removable' ? 'infinite' : 'removable']} discontinuity at" x = ${a}`, `"${name[kind]} discontinuity at" x = ${-a}`, '"continuous"', `"${name.jump} discontinuity at" x = ${a}`];
      why = kind === 'removable' ? `The factor ${math(factor(a))} cancels, so the graph has a hole at ${math(`x = ${a}`)}.` : `The denominator is zero at ${math(`x = ${a}`)} but the numerator is not, so there is a vertical asymptote.`;
    } else if (kind === 'jump') {
      const m1 = rng.nonZero(-3, 3), b1 = rng.int(-5, 5), m2 = rng.nonZero(-3, 3);
      const left = m1 * a + b1, b2 = left + rng.nonZero(-4, 4) - m2 * a;
      f = `cases(${poly([m1, b1])} & "if" x < ${a}, ${poly([m2, b2])} & "if" x >= ${a})`;
      answer = `"${name.jump} discontinuity at" x = ${a}`;
      wrongs = ['"continuous"', `"${name.removable} discontinuity at" x = ${a}`, `"${name.infinite} discontinuity at" x = ${a}`, `"${name.jump} discontinuity at" x = ${-a || 1}`];
      why = `As ${math(`x -> ${a}^-`)}, ${math(`f(x) -> ${left}`)}; as ${math(`x -> ${a}^+`)}, ${math(`f(x) -> ${m2 * a + b2}`)}. The one-sided limits differ.`;
    } else {
      const m1 = rng.nonZero(-3, 3), b1 = rng.int(-5, 5), m2 = rng.nonZero(-3, 3);
      const b2 = m1 * a + b1 - m2 * a;
      f = rng.next() < 0.5 ? `cases(${poly([m1, b1])} & "if" x < ${a}, ${poly([m2, b2])} & "if" x >= ${a})` : `(${poly([1, 0, rng.int(1, 9)])})/(${poly([1, 0, rng.int(1, 9)])})`;
      answer = '"continuous"';
      wrongs = [`"${name.jump} discontinuity at" x = ${a}`, `"${name.removable} discontinuity at" x = ${a}`, `"${name.infinite} discontinuity at" x = 0`];
      why = f.startsWith('cases') ? `Both pieces give ${math(String(m1 * a + b1))} at ${math(`x = ${a}`)}, so the pieces meet.` : 'The denominator is never zero, so the function is continuous everywhere.';
    }
    return {
      body: `Determine whether ${math(`f(x) = ${f}`)} is continuous. If it is not, find and classify each discontinuity.`,
      answer: math(answer), distractors: wrong(math(answer), wrongs.map(math)),
      solution: `${why} ${math(answer)}.`,
    };
  },
});

// ── Graph features ───────────────────────────────────────────────────────────

/** Interval-notation union of open intervals: `(-4, -1) union (2, 3)`. */
const union = (ivs: Array<[number, number]>) => (ivs.length ? ivs.map(([a, b]) => `(${a}, ${b})`).join(' union ') : 'emptyset');

export const pcIncreaseDecrease = us('pc-increase-decrease', {
  points: 2,
  levels: { 1: 'Intervals of increase', 2: 'Intervals of decrease', 3: 'Relative extrema' },
  options: [radioOption('ask', 'Find', [['increase', 'Intervals of increase'], ['decrease', 'Intervals of decrease'], ['extrema', 'Relative extrema']], ['increase', 'decrease', 'extrema'])],
  generate(rng, level, o) {
    const ask = optOne(o, 'ask', ['increase', 'decrease', 'extrema'][level - 1]);
    let f = randomPL(rng, { count: rng.int(4, 6), xMin: -6, xMax: 6, yMin: -5, yMax: 5 });
    // No flat pieces, so every piece is increasing or decreasing.
    f = f.map(([x, y], i) => [x, i && y === f[i - 1][1] ? y + 1 : y]);
    const pieces = f.slice(1).map(([x, y], i) => ({ from: f[i][0], to: x, up: y > f[i][1] }));
    const merge = (up: boolean) => pieces.filter((p) => p.up === up).reduce<Array<[number, number]>>((acc, p) => {
      const last = acc[acc.length - 1];
      if (last && last[1] === p.from) last[1] = p.to; else acc.push([p.from, p.to]);
      return acc;
    }, []);
    const inc = merge(true), dec = merge(false);
    const graph = plGraph([f], 4.5);
    if (ask === 'extrema') {
      const maxima = f.slice(1, -1).filter((p, i) => p[1] > f[i][1] && p[1] > f[i + 2][1]);
      const minima = f.slice(1, -1).filter((p, i) => p[1] < f[i][1] && p[1] < f[i + 2][1]);
      const pts = (ps: number[][]) => (ps.length ? ps.map(([x, y]) => `(${x}, ${y})`).join(', ') : '"none"');
      const answer = `"max:" ${pts(maxima)}; "min:" ${pts(minima)}`;
      return {
        body: `Find the relative maxima and minima of the function graphed below.\n\n${graph}`,
        answer: math(answer),
        distractors: wrong(math(answer), [`"max:" ${pts(minima)}; "min:" ${pts(maxima)}`, `"max:" ${pts(maxima.map(([x, y]) => [y, x]))}; "min:" ${pts(minima.map(([x, y]) => [y, x]))}`, `"max:" ${pts([f[0], ...maxima])}; "min:" ${pts(minima)}`].map(math)),
        solution: `A relative maximum is a peak where the graph changes from increasing to decreasing; a relative minimum is a valley. ${math(answer)}.`,
      };
    }
    const want = ask === 'increase' ? inc : dec, other = ask === 'increase' ? dec : inc;
    const answer = union(want);
    return {
      body: `Find the intervals on which the function graphed below is ${ask === 'increase' ? 'increasing' : 'decreasing'}.\n\n${graph}`,
      answer: math(answer),
      distractors: wrong(math(answer), [union(other), union(want.map(([a, b]) => [plEval(f, a), plEval(f, b)].sort((p, q) => p - q) as [number, number])), union([[f[0][0], f[f.length - 1][0]]])].map(math)),
      solution: `Read the x-values where the graph ${ask === 'increase' ? 'rises' : 'falls'} from left to right: ${math(answer)}.`,
    };
  },
});

export const pcPowerFunctions = us('pc-power-functions', {
  levels: { 1: 'Whole-number exponents', 2: 'Negative exponents', 3: 'Fractional exponents' },
  options: [radioOption('ask', 'Ask for', [['domain', 'Domain'], ['range', 'Range'], ['symmetry', 'Symmetry'], ['end', 'End behaviour'], ['any', 'Any']], ['any', 'any', 'any'])],
  generate(rng, level, o) {
    const a = rng.pick([1, 2, 3, -1, -2, 1 / 2]);
    const n = level === 1 ? rng.int(2, 5) : level === 2 ? -rng.int(1, 3) : rng.pick([1 / 2, 1 / 3, 2 / 3]);
    const nText = Number.isInteger(n) ? (n < 0 ? `(${n})` : String(n)) : `(${new Q(Math.round(n * 6), 6).typst()})`;
    const aText = a === 1 ? '' : a === -1 ? '-' : a === 0.5 ? '1/2 ' : String(a);
    const f = `f(x) = ${aText}x^${nText}`;
    const even = Number.isInteger(n) ? n % 2 === 0 : n === 2 / 3;
    const evenRoot = !Number.isInteger(n) && n === 1 / 2;
    const domain = n < 0 ? '(-oo, 0) union (0, oo)' : evenRoot ? '[0, oo)' : '(-oo, oo)';
    const range = n < 0 ? (even ? (a > 0 ? '(0, oo)' : '(-oo, 0)') : '(-oo, 0) union (0, oo)') : evenRoot ? (a > 0 ? '[0, oo)' : '(-oo, 0]') : even ? (a > 0 ? '[0, oo)' : '(-oo, 0]') : '(-oo, oo)';
    const symmetry = evenRoot ? '"neither"' : even ? '"even (symmetric about the y-axis)"' : '"odd (symmetric about the origin)"';
    const up = a > 0;
    // End behaviour as "as x → −∞, f(x) → L; as x → ∞, f(x) → R" (only the right side for √x).
    const ends = (left: string, right: string) => `"as" x -> -oo, f(x) -> ${left} ";" "as" x -> oo, f(x) -> ${right}`;
    const inf = (pos: boolean) => (pos ? 'oo' : '-oo');
    const end = n < 0 ? ends('0', '0') : evenRoot ? `"as" x -> oo, f(x) -> ${inf(up)}` : even ? ends(inf(up), inf(up)) : ends(inf(!up), inf(up));
    const pick = (optOne(o, 'ask', 'any') === 'any' ? rng.pick(['domain', 'range', 'symmetry', 'end'] as const) : optOne(o, 'ask', 'domain')) as 'domain' | 'range' | 'symmetry' | 'end';
    const values = { domain, range, symmetry, end };
    const pool = { domain: ['(-oo, oo)', '[0, oo)', '(-oo, 0) union (0, oo)', '(0, oo)'], range: ['(-oo, oo)', '[0, oo)', '(-oo, 0]', '(0, oo)', '(-oo, 0) union (0, oo)'], symmetry: ['"neither"', '"even (symmetric about the y-axis)"', '"odd (symmetric about the origin)"'], end: [ends('0', '0'), ends('oo', 'oo'), ends('-oo', '-oo'), ends('-oo', 'oo'), ends('oo', '-oo')] };
    const label = { domain: 'the domain', range: 'the range', symmetry: 'whether the function is even, odd, or neither', end: 'the end behaviour' }[pick];
    return {
      body: `For ${math(f)}, state ${label}.`,
      answer: math(values[pick]),
      distractors: wrong(math(values[pick]), pool[pick].map(math)),
      solution: `${n < 0 ? 'A negative exponent puts x in the denominator, so x ≠ 0. ' : evenRoot ? 'An even root needs a non-negative radicand. ' : ''}${math(values[pick])}.`,
    };
  },
});

export const pcAverageRate = us('pc-average-rate', {
  levels: { 1: 'Linear and quadratic functions', 2: 'Cubic and rational functions', 3: 'From a table of values' },
  generate(rng, level) {
    const a = rng.int(-4, 3), b = a + rng.int(1, 4);
    if (level === 3) {
      const xs = [a, a + 1, a + 2, a + 3, b + 3].sort((p, q) => p - q);
      const ys = xs.map(() => rng.int(-20, 30));
      const [i, j] = [0, rng.int(2, 4)];
      const rate = new Q(ys[j] - ys[i], xs[j] - xs[i]);
      const table = `#table(columns: ${xs.length + 1}, align: center, inset: 5pt, [$x$], ${xs.map((x) => `[$${x}$]`).join(', ')}, [$f(x)$], ${ys.map((y) => `[$${y}$]`).join(', ')})`;
      return {
        body: `Find the average rate of change of ${math('f')} over ${math(`[${xs[i]}, ${xs[j]}]`)}.\n\n${table}`,
        answer: math(rate.typst()),
        distractors: wrong(math(rate.typst()), [new Q(xs[j] - xs[i], ys[j] - ys[i] || 1), new Q(ys[j] - ys[i]), new Q(ys[j] + ys[i], xs[j] - xs[i])].map((q) => math(q.typst()))),
        solution: `${math(`(f(${xs[j]}) - f(${xs[i]}))/(${xs[j]} - ${xs[i] < 0 ? `(${xs[i]})` : xs[i]}) = (${ys[j]} - ${ys[i] < 0 ? `(${ys[i]})` : ys[i]})/${xs[j] - xs[i]} = ${rate.typst()}`)}.`,
      };
    }
    const coefs = level === 1 ? [rng.nonZero(-3, 3), rng.int(-6, 6), rng.int(-9, 9)] : [rng.nonZero(-2, 2), 0, rng.int(-5, 5), rng.int(-9, 9)];
    const fa = polyEval(coefs, a), fb = polyEval(coefs, b);
    const rate = new Q(fb - fa, b - a);
    return task('Find the average rate of change of each function over the given interval.', 'Find the average rate of change of', `f(x) = ${poly(coefs)}`, {
      answer: math(rate.typst()),
      distractors: wrong(math(rate.typst()), [new Q(fb - fa), new Q(fb + fa, b - a), new Q(b - a, fb - fa || 1), new Q(polyEval(coefs, (a + b) / 2) * 2, 2)].map((q) => math(q.typst()))),
      solution: `${math(`(f(${b}) - f(${a}))/(${b} - ${a < 0 ? `(${a})` : a}) = (${fb} - ${fa < 0 ? `(${fa})` : fa})/${b - a} = ${rate.typst()}`)}.`,
    }, ` over ${math(`[${a}, ${b}]`)}.`);
  },
});

export const pcPiecewise = us('pc-piecewise', {
  levels: { 1: 'Evaluate, two pieces', 2: 'Evaluate, three pieces', 3: 'Find x for a given value' },
  generate(rng, level) {
    const c1 = rng.int(-3, 1), c2 = c1 + rng.int(2, 4);
    const pieces = [
      { coefs: [rng.nonZero(-3, 3), rng.int(-5, 5)], cond: `x < ${c1}`, test: (x: number) => x < c1 },
      ...(level === 1
        ? [{ coefs: [1, 0, rng.int(-5, 5)], cond: `x >= ${c1}`, test: (x: number) => x >= c1 }]
        : [{ coefs: [1, 0, rng.int(-5, 5)], cond: `${c1} <= x < ${c2}`, test: (x: number) => x >= c1 && x < c2 }, { coefs: [rng.int(1, 9)], cond: `x >= ${c2}`, test: (x: number) => x >= c2 }]),
    ];
    const f = `f(x) = cases(${pieces.map((p) => `${poly(p.coefs)} & "if" ${p.cond}`).join(', ')})`;
    const evalAt = (x: number) => polyEval(pieces.find((p) => p.test(x))!.coefs, x);
    if (level === 3) {
      // f(x) = k on the first (linear) piece only.
      const x = c1 - rng.int(1, 4), k = evalAt(x);
      const others = pieces.slice(1).flatMap((p) => { const roots: number[] = []; for (let t = -12; t <= 12; t++) if (p.test(t) && polyEval(p.coefs, t) === k) roots.push(t); return roots; });
      const all = [x, ...others].sort((p, q) => p - q);
      const answer = `x = ${all.join(', ')}`;
      return {
        body: `For ${math(f)}, find all ${math('x')} with ${math(`f(x) = ${k}`)}.`,
        answer: math(answer),
        distractors: wrong(math(answer), [`x = ${-x}`, `x = ${x + 1}`, `x = ${all.join(', ')}, ${c1}`].map(math)),
        solution: `Solve ${math(`f(x) = ${k}`)} on each piece and keep only solutions inside that piece's interval: ${math(answer)}.`,
      };
    }
    const xs = [c1 - rng.int(1, 3), c1, level === 2 ? c2 : c1 + rng.int(1, 3)];
    const x = rng.pick(xs);
    const v = evalAt(x);
    const wrongPiece = pieces.filter((p) => !p.test(x)).map((p) => polyEval(p.coefs, x));
    return {
      body: `For ${math(f)}, find ${math(`f(${x})`)}.`,
      answer: math(String(v)),
      distractors: wrong(math(String(v)), [...wrongPiece, v + 1, -v].map((n) => math(String(n)))),
      solution: `${math(`x = ${x}`)} satisfies ${math(pieces.find((p) => p.test(x))!.cond)}, so use that piece: ${math(`f(${x}) = ${v}`)}.`,
    };
  },
});

// ── Zeros and inequalities ───────────────────────────────────────────────────

/** Least whole upper bound and greatest whole lower bound for the real zeros by synthetic division. */
function bounds(coefs: number[]): [number, number] {
  let up = 1; while (synthetic(coefs, up).quotient.concat(synthetic(coefs, up).remainder).some((c) => c < 0)) up++;
  const alternates = (c: number) => { const row = [...synthetic(coefs, c).quotient, synthetic(coefs, c).remainder]; let s = 0; return row.every((v) => { if (v === 0) return true; const ok = s === 0 || Math.sign(v) === -s; s = Math.sign(v); return ok; }); };
  let lo = -1; while (!alternates(lo)) lo--;
  return [up, lo];
}

export const pcZeroBounds = us('pc-zero-bounds', {
  levels: { 1: 'Cubic', 2: 'Quartic', 3: 'Quintic' },
  generate(rng, level) {
    const roots = Array.from({ length: level + 2 }, () => rng.int(-5, 5));
    const coefs = fromRoots(roots);
    const [up, lo] = bounds(coefs);
    const ans = `"upper bound:" ${up}; "lower bound:" ${lo}`;
    return {
      body: `Use synthetic division to find the least whole-number upper bound and the greatest whole-number lower bound for the real zeros of ${math(`f(x) = ${poly(coefs)}`)}.`,
      answer: math(ans),
      distractors: wrong(math(ans), [`"upper bound:" ${-lo}; "lower bound:" ${-up}`, `"upper bound:" ${up + 1}; "lower bound:" ${lo - 1}`, `"upper bound:" ${Math.max(...roots)}; "lower bound:" ${Math.min(...roots)}`].map(math)),
      solution: `Dividing by ${math(`x - ${up}`)} gives a row with no negative numbers, so ${up} is an upper bound (and no smaller whole number works). Dividing by ${math(`x + ${-lo}`)} gives a row whose signs alternate, so ${lo} is a lower bound.`,
    };
  },
});

/** Solve p(x) > 0 (or ≥, <, ≤) from the sign pattern between ordered roots, with simple roots only. */
function signIntervals(roots: number[], positiveRight: boolean, rel: string, holes: number[] = []): string {
  const r = [...new Set(roots)].sort((a, b) => a - b);
  const pts = [-Infinity, ...r, Infinity];
  const want = rel.startsWith('>');
  const strict = rel.length === 1;
  const parts: string[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    // Sign on the interval: alternate from the right, each simple root flipping the sign.
    const flips = r.length - i;
    const positive = positiveRight === (flips % 2 === 0);
    if (positive !== want) continue;
    const lo = pts[i], hi = pts[i + 1];
    const loText = lo === -Infinity ? '(-oo' : `${!strict && !holes.includes(lo) ? '[' : '('}${lo}`;
    const hiText = hi === Infinity ? 'oo)' : `${hi}${!strict && !holes.includes(hi) ? ']' : ')'}`;
    parts.push(`${loText}, ${hiText}`);
  }
  return parts.join(' union ');
}

export const pcPolynomialInequalities = us('pc-polynomial-inequalities', {
  levels: { 1: 'Quadratic', 2: 'Cubic', 3: 'Quartic' },
  generate(rng, level) {
    const n = level + 1;
    const roots = new Set<number>(); while (roots.size < n) roots.add(rng.int(-6, 6));
    const r = [...roots];
    const lead = rng.pick([1, 1, -1]);
    const coefs = fromRoots(r, lead);
    const rel = rng.pick(['>', '<', '>=', '<=']);
    const answer = signIntervals(r, lead > 0, rel);
    const flipRel = ({ '>': '<', '<': '>', '>=': '<=', '<=': '>=' } as Record<string, string>)[rel];
    return task('Solve each inequality. Write the solution in interval notation.', 'Solve', `${poly(coefs)} ${rel} 0`, {
      answer: math(answer),
      distractors: wrong(math(answer), [signIntervals(r, lead > 0, flipRel), signIntervals(r.map((x) => -x), lead > 0, rel), signIntervals(r, lead > 0, rel.length === 1 ? `${rel}=` : rel[0])].map(math)),
      solution: `The zeros are ${math(r.sort((a, b) => a - b).join(', '))}. Test the sign of the polynomial on each interval between them and keep those where it is ${rel.startsWith('>') ? 'positive' : 'negative'}${rel.length > 1 ? ' or zero' : ''}: ${math(answer)}.`,
    });
  },
});

export const pcRationalInequalities = us('pc-rational-inequalities', {
  levels: { 1: '(x − a)/(x − b)', 2: '(x − a)(x − b)/(x − c)', 3: 'Compare with a number first' },
  generate(rng, level) {
    const pickDistinct = (k: number) => { const s = new Set<number>(); while (s.size < k) s.add(rng.int(-6, 6)); return [...s]; };
    const rel = rng.pick(['>', '<', '>=', '<=']);
    if (level === 3) {
      // (x + p)/(x − b) rel 1  →  (p + b)/(x − b) rel 0
      const [b] = pickDistinct(1); const p = rng.nonZero(-6, 6) - b || 1;
      const k = p + b;
      const answer = (k > 0) === rel.startsWith('>') ? `(${b}, oo)` : `(-oo, ${b})`;
      return task('Solve each inequality. Write the solution in interval notation.', 'Solve', `(${poly([1, p])})/(${poly([1, -b])}) ${rel} 1`, {
        answer: math(answer),
        distractors: wrong(math(answer), [(k > 0) !== rel.startsWith('>') ? `(${b}, oo)` : `(-oo, ${b})`, `(-oo, ${-p}) union (${b}, oo)`, `[${b}, oo)`].map(math)),
        solution: `Subtract 1 and combine: ${math(`(${k})/(${poly([1, -b])}) ${rel} 0`)}. The sign depends only on ${math(poly([1, -b]))}, and ${math(`x != ${b}`)}: ${math(answer)}.`,
      });
    }
    const [a, b, c] = pickDistinct(3);
    const zeros = level === 1 ? [a] : [a, b];
    const pole = level === 1 ? b : c;
    const num = level === 1 ? poly([1, -a]) : `(${poly([1, -a])})(${poly([1, -b])})`;
    const answer = signIntervals([...zeros, pole], true, rel, [pole]);
    return task('Solve each inequality. Write the solution in interval notation.', 'Solve', `(${num})/(${poly([1, -pole])}) ${rel} 0`, {
      answer: math(answer),
      distractors: wrong(math(answer), [signIntervals([...zeros, pole], true, rel), signIntervals([...zeros, pole], false, rel, [pole]), signIntervals(zeros, true, rel)].map(math)),
      solution: `The critical values are the zeros ${math(zeros.join(', '))} and the excluded value ${math(String(pole))}, which is never part of the solution. Test the sign on each interval: ${math(answer)}.`,
    });
  },
});

// ── Trigonometry ─────────────────────────────────────────────────────────────

const ARC: Record<'sin' | 'cos' | 'tan', Array<[string, number]>> = {
  sin: [['0', 0], ['1/2', 30], ['sqrt(2)/2', 45], ['sqrt(3)/2', 60], ['1', 90], ['-1/2', -30], ['-sqrt(2)/2', -45], ['-sqrt(3)/2', -60], ['-1', -90]],
  cos: [['1', 0], ['sqrt(3)/2', 30], ['sqrt(2)/2', 45], ['1/2', 60], ['0', 90], ['-1/2', 120], ['-sqrt(2)/2', 135], ['-sqrt(3)/2', 150], ['-1', 180]],
  tan: [['0', 0], ['sqrt(3)/3', 30], ['1', 45], ['sqrt(3)', 60], ['-sqrt(3)/3', -30], ['-1', -45], ['-sqrt(3)', -60]],
};
const TRIPLES = [[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25]];

export const pcInverseTrig = us('pc-inverse-trig', {
  levels: { 1: 'Special values, in radians', 2: 'Special values, in degrees', 3: 'Compositions' },
  options: [radioOption('unit', 'Angles in', [['rad', 'Radians'], ['deg', 'Degrees']], ['rad', 'deg', 'rad'])],
  generate(rng, level, o) {
    const rad = optOne(o, 'unit', level === 2 ? 'deg' : 'rad') === 'rad';
    const show = (d: number) => (rad ? piText(new Q(d, 180)) : `${d}°`);
    if (level === 3) {
      const [a, b, c] = rng.pick(TRIPLES);
      const outer = rng.pick(['sin', 'cos', 'tan'] as const), inner = rng.pick(['sin', 'cos', 'tan'] as const);
      // inner⁻¹(ratio) is an angle in quadrant I (positive ratio) with sides a (opp), b (adj), c (hyp).
      const ratio = { sin: new Q(a, c), cos: new Q(b, c), tan: new Q(a, b) }[inner];
      const value = { sin: new Q(a, c), cos: new Q(b, c), tan: new Q(a, b) }[outer];
      const expr = `${outer}(${inner}^(-1)(${ratio.typst()}))`;
      return task('Find the exact value of each expression.', 'Evaluate', expr, {
        answer: math(value.typst()),
        distractors: wrong(math(value.typst()), [new Q(1).div(value), ratio, new Q(c, a), new Q(b, a)].map((q) => math(q.typst()))),
        solution: `Draw a right triangle for ${math(`${inner}^(-1)(${ratio.typst()})`)}: the sides are ${a}, ${b}, and ${c}. Then ${math(`${outer} = ${value.typst()}`)}.`,
      });
    }
    const fn = rng.pick(['sin', 'cos', 'tan'] as const);
    const [arg, d] = rng.pick(ARC[fn]);
    const answer = show(d);
    const range = { sin: '[-pi/2, pi/2]', cos: '[0, pi]', tan: '(-pi/2, pi/2)' }[fn];
    return task(`Find the exact value of each expression${rad ? ', in radians' : ', in degrees'}.`, 'Evaluate', `${fn}^(-1)(${arg})`, {
      answer: math(answer),
      distractors: wrong(math(answer), [show(fn === 'cos' ? 180 - d : -d), show(90 - d), show(d + 180), show(fn === 'cos' ? -d : 180 - d)].map(math)),
      solution: `${math(`${fn}^(-1)`)} gives the angle in ${math(range)} whose ${fn} is ${math(arg)}: ${math(answer)}.`,
    });
  },
});

export const pcProductSum = us('pc-product-sum', {
  levels: { 1: 'Product to sum', 2: 'Sum to product', 3: 'Exact values' },
  generate(rng, level) {
    const a = rng.int(2, 9);
    let b = rng.int(1, 8); while (b >= a) b = rng.int(1, a - 1);
    const t = (k: number) => (k === 1 ? 'x' : `${k}x`);
    if (level === 1) {
      const kind = rng.pick(['sc', 'cs', 'cc', 'ss'] as const);
      const forms = {
        sc: [`sin ${t(a)} cos ${t(b)}`, `1/2 (sin ${t(a + b)} + sin ${t(a - b)})`],
        cs: [`cos ${t(a)} sin ${t(b)}`, `1/2 (sin ${t(a + b)} - sin ${t(a - b)})`],
        cc: [`cos ${t(a)} cos ${t(b)}`, `1/2 (cos ${t(a - b)} + cos ${t(a + b)})`],
        ss: [`sin ${t(a)} sin ${t(b)}`, `1/2 (cos ${t(a - b)} - cos ${t(a + b)})`],
      };
      const [expr, answer] = forms[kind];
      return task('Write each product as a sum or difference.', 'Write as a sum or difference:', expr, {
        answer: math(answer),
        distractors: wrong(math(answer), Object.values(forms).map(([, x]) => x).concat(`sin ${t(a * b)}`).map(math)),
        solution: `Use the product-to-sum identity: ${math(`${expr} = ${answer}`)}.`,
      }, '');
    }
    if (level === 2) {
      const p = a + b, q = a - b;
      const kind = rng.pick(['s+s', 's-s', 'c+c', 'c-c'] as const);
      const half = (u: number) => t(u / 2);
      if ((p + q) % 2) return pcProductSum.generate(rng, 2);
      const forms = {
        's+s': [`sin ${t(p)} + sin ${t(q)}`, `2 sin ${half(p + q)} cos ${half(p - q)}`],
        's-s': [`sin ${t(p)} - sin ${t(q)}`, `2 cos ${half(p + q)} sin ${half(p - q)}`],
        'c+c': [`cos ${t(p)} + cos ${t(q)}`, `2 cos ${half(p + q)} cos ${half(p - q)}`],
        'c-c': [`cos ${t(p)} - cos ${t(q)}`, `-2 sin ${half(p + q)} sin ${half(p - q)}`],
      };
      const [expr, answer] = forms[kind];
      return task('Write each sum or difference as a product.', 'Write as a product:', expr, {
        answer: math(answer),
        distractors: wrong(math(answer), Object.values(forms).map(([, x]) => x).map(math)),
        solution: `Use the sum-to-product identity: ${math(`${expr} = ${answer}`)}.`,
      }, '');
    }
    // sin 75° cos 15° and similar: exact values from special sums and differences.
    const [A, B] = rng.pick([[75, 15], [105, 15], [75, 45], [165, 15], [105, 45], [195, 15]]);
    const kind = rng.pick(['sc', 'cc', 'ss'] as const);
    const value = kind === 'sc' ? 0.5 * (Math.sin(((A + B) * Math.PI) / 180) + Math.sin(((A - B) * Math.PI) / 180)) : kind === 'cc' ? 0.5 * (Math.cos(((A - B) * Math.PI) / 180) + Math.cos(((A + B) * Math.PI) / 180)) : 0.5 * (Math.cos(((A - B) * Math.PI) / 180) - Math.cos(((A + B) * Math.PI) / 180));
    const exact: Record<string, string> = { '0': '0', '0.25': '1/4', '-0.25': '-1/4', '0.5': '1/2', '-0.5': '-1/2', '0.75': '3/4', '-0.75': '-3/4', '0.933': '(2 + sqrt(3))/4', '0.067': '(2 - sqrt(3))/4', '-0.067': '(sqrt(3) - 2)/4', '-0.933': '-(2 + sqrt(3))/4', '0.683': '(1 + sqrt(3))/4', '0.183': '(sqrt(3) - 1)/4', '-0.183': '(1 - sqrt(3))/4', '-0.683': '-(1 + sqrt(3))/4', '0.433': 'sqrt(3)/4', '-0.433': '-sqrt(3)/4', '0.354': 'sqrt(2)/4', '-0.354': '-sqrt(2)/4', '0.604': '(sqrt(2) + sqrt(6))/8', '0.966': '(sqrt(6) + sqrt(2))/4' };
    const key = decimal(Math.round(value * 1000) / 1000);
    const answer = exact[key];
    if (!answer) return pcProductSum.generate(rng, 1);
    const expr = { sc: `sin ${A}° cos ${B}°`, cc: `cos ${A}° cos ${B}°`, ss: `sin ${A}° sin ${B}°` }[kind];
    return task('Find the exact value of each expression using a product-to-sum identity.', 'Find the exact value of', expr, {
      answer: math(answer),
      distractors: wrong(math(answer), Object.values(exact).filter((x) => x !== answer).slice(0, 12).filter((_, i) => i % 4 === 0).concat(['1/2', 'sqrt(3)/2']).map(math)),
      solution: `Rewrite as a sum: ${math(`${expr} = 1/2 (${kind === 'sc' ? `sin ${A + B}° + sin ${A - B}°` : kind === 'cc' ? `cos ${A - B}° + cos ${A + B}°` : `cos ${A - B}° - cos ${A + B}°`})`)}, then use exact values: ${math(answer)}.`,
    });
  },
});

// ── Partial fractions, rotated conics, induction, power series ──────────────

export const pcPartialFractions = us('pc-partial-fractions', {
  points: 2,
  levels: { 1: 'Two linear factors', 2: 'Three linear factors', 3: 'A repeated linear factor' },
  generate(rng, level) {
    const pick = (k: number) => { const s = new Set<number>(); while (s.size < k) s.add(rng.int(-5, 5)); return [...s]; };
    if (level === 3) {
      const [r, s] = pick(2);
      const A = rng.nonZero(-5, 5), B = rng.nonZero(-5, 5), Cc = rng.nonZero(-5, 5);
      // A/(x − r) + B/(x − r)² + C/(x − s)
      const num = [A + Cc, -A * (r + s) + B - 2 * Cc * r, A * r * s - B * s + Cc * r * r];
      const den = `${factor(r)}^2 ${factor(s)}`;
      const answer = `${A}/${factor(r)} + ${B}/${factor(r)}^2 + ${Cc}/${factor(s)}`.replace(/\+ -/g, '- ');
      return task('Find the partial fraction decomposition of each.', 'Decompose', `(${poly(num)})/(${den})`, {
        answer: math(answer),
        distractors: wrong(math(answer), [`${B}/${factor(r)} + ${A}/${factor(r)}^2 + ${Cc}/${factor(s)}`, `${A}/${factor(r)} + ${Cc}/${factor(s)}`, `${-A}/${factor(r)} + ${B}/${factor(r)}^2 + ${-Cc}/${factor(s)}`].map((t) => math(t.replace(/\+ -/g, '- ')))),
        solution: `Write ${math(`A/${factor(r)} + B/${factor(r)}^2 + C/${factor(s)}`)}, clear denominators, and compare coefficients (or substitute ${math(`x = ${r}`)} and ${math(`x = ${s}`)}): ${math(answer)}.`,
      });
    }
    const roots = pick(level + 1);
    const coefs = roots.map(() => rng.nonZero(-5, 5));
    // Σ c_i / (x − r_i) over the common denominator.
    let num = [0];
    roots.forEach((_, i) => {
      const others = roots.filter((__, j) => j !== i);
      const term = fromRoots(others).map((v) => v * coefs[i]);
      num = addPoly(num, term);
    });
    const den = roots.map((r) => factor(r)).join('');
    const answer = roots.map((r, i) => `${coefs[i]}/${factor(r)}`).join(' + ').replace(/\+ -/g, '- ');
    return task('Find the partial fraction decomposition of each.', 'Decompose', `(${poly(num)})/(${den})`, {
      answer: math(answer),
      distractors: wrong(math(answer), [roots.map((r, i) => `${coefs[(i + 1) % coefs.length]}/${factor(r)}`), roots.map((r, i) => `${-coefs[i]}/${factor(r)}`), roots.map((r, i) => `${coefs[i]}/${factor(-r)}`)].map((ps) => math(ps.join(' + ').replace(/\+ -/g, '- ')))),
      solution: `Write one fraction per factor, clear denominators, and substitute each zero of the denominator: ${math(answer)}.`,
    });
  },
});
function addPoly(p: number[], q: number[]): number[] {
  const n = Math.max(p.length, q.length);
  const pp = Array(n - p.length).fill(0).concat(p), qq = Array(n - q.length).fill(0).concat(q);
  return pp.map((v, i) => v + qq[i]);
}

export const pcRotatedConics = us('pc-rotated-conics', {
  levels: { 1: 'Classify with the discriminant', 2: 'Angle of rotation of 45°', 3: 'Classify and find the angle' },
  generate(rng, level) {
    const A = rng.int(1, 9) * rng.sign(), C = rng.int(1, 9) * rng.sign();
    let B: number, Btext: string, theta: string, disc: number;
    if (level === 2 || rng.next() < 0.4) { const AC = rng.int(1, 9); B = rng.nonZero(-9, 9); Btext = String(B); theta = '45°'; disc = B * B - 4 * AC * AC; return finish(AC, AC); }
    const k = A - C === 0 ? 1 : A - C;
    B = k; Btext = `${k}sqrt(3)`; disc = 3 * k * k - 4 * A * C; theta = k > 0 ? '30°' : '60°';
    return finish(A, C);
    function finish(a: number, c: number) {
      const type = disc < 0 ? (a === c && B === 0 ? 'circle' : 'ellipse') : disc === 0 ? 'parabola' : 'hyperbola';
      const F = -rng.int(1, 20);
      const eq = `${a === 1 ? '' : a === -1 ? '-' : a}x^2 ${Btext.startsWith('-') ? '-' : '+'} ${Btext.replace(/^-/, '').replace(/^1sqrt/, 'sqrt').replace(/^1$/, '')}x y ${c < 0 ? '-' : '+'} ${Math.abs(c) === 1 ? '' : Math.abs(c)}y^2 ${signed(F)} = 0`;
      const answer = level === 1 ? type : `${type}; theta = ${theta}`;
      const others = ['ellipse', 'parabola', 'hyperbola'].filter((t) => t !== type);
      return {
        body: `${level === 1 ? 'Classify' : 'Classify the conic and find its angle of rotation'}: ${math(eq)}`,
        answer: level === 1 ? answer : math(`"${type};" theta = ${theta}`),
        distractors: level === 1 ? wrong(answer, others.concat('circle')) : wrong(math(`"${type};" theta = ${theta}`), [`"${others[0]};" theta = ${theta}`, `"${type};" theta = ${theta === '30°' ? '60°' : theta === '60°' ? '30°' : '22.5°'}`, `"${others[1]};" theta = ${theta}`].map(math)),
        solution: `${math(`B^2 - 4A C = ${disc}`)}, which is ${disc < 0 ? 'negative: an ellipse' : disc === 0 ? 'zero: a parabola' : 'positive: a hyperbola'}.${level === 1 ? '' : ` ${math(`cot 2theta = (A - C)/B`)} gives ${math(`theta = ${theta}`)}.`}`,
      };
    }
  },
});

const INDUCTION: Array<{ claim: string; base: string; step: string }> = [
  { claim: '1 + 2 + 3 + dots.c + n = (n(n + 1))/2', base: '1 = (1 dot 2)/2', step: '(k(k + 1))/2 + (k + 1) = ((k + 1)(k + 2))/2' },
  { claim: '1 + 3 + 5 + dots.c + (2n - 1) = n^2', base: '1 = 1^2', step: 'k^2 + (2k + 1) = (k + 1)^2' },
  { claim: '1^2 + 2^2 + dots.c + n^2 = (n(n + 1)(2n + 1))/6', base: '1 = (1 dot 2 dot 3)/6', step: '(k(k + 1)(2k + 1))/6 + (k + 1)^2 = ((k + 1)(k + 2)(2k + 3))/6' },
  { claim: '1 + 2 + 4 + dots.c + 2^(n - 1) = 2^n - 1', base: '1 = 2^1 - 1', step: '(2^k - 1) + 2^k = 2^(k + 1) - 1' },
  { claim: '2 + 4 + 6 + dots.c + 2n = n(n + 1)', base: '2 = 1 dot 2', step: 'k(k + 1) + 2(k + 1) = (k + 1)(k + 2)' },
  { claim: '1/(1 dot 2) + 1/(2 dot 3) + dots.c + 1/(n(n + 1)) = n/(n + 1)', base: '1/2 = 1/(1 + 1)', step: 'k/(k + 1) + 1/((k + 1)(k + 2)) = (k + 1)/(k + 2)' },
];

export const pcInduction = us('pc-induction', {
  points: 4,
  mcq: false,
  levels: { 1: 'Sums of integers', 2: 'Sums of powers', 3: 'Any' },
  generate(rng, level) {
    const pool = level === 1 ? [INDUCTION[0], INDUCTION[1], INDUCTION[4]] : level === 2 ? [INDUCTION[2], INDUCTION[3], INDUCTION[5]] : INDUCTION;
    const s = rng.pick(pool);
    const proof = `Base case: for ${math('n = 1')}, ${math(s.base)}. Inductive step: assume the statement holds for ${math('n = k')}. Adding the next term, ${math(s.step)}, which is the statement for ${math('n = k + 1')}. By induction, it holds for every positive integer ${math('n')}.`;
    return {
      body: `Use mathematical induction to prove that for every positive integer ${math('n')}: ${math(s.claim)}.`,
      answer: proof, distractors: [], solution: proof,
    };
  },
});

export const pcPowerSeries = us('pc-power-series', {
  levels: { 1: 'a/(1 − bx)', 2: 'a/(c − x) and a/(1 + bx)', 3: 'x^k/(c − x^2)' },
  generate(rng, level) {
    const a = rng.int(1, 6);
    if (level === 1) {
      const b = rng.pick([2, 3, 4, 5]);
      const f = `${a}/(1 - ${b}x)`;
      const series = `sum_(n = 0)^oo ${a === 1 ? '' : a}(${b}x)^n`;
      const answer = `${series}, |x| < 1/${b}`;
      return task('Write each function as a power series and give its interval of convergence.', 'Write as a power series:', `f(x) = ${f}`, {
        answer: math(answer),
        distractors: wrong(math(answer), [`${series}, |x| < ${b}`, `sum_(n = 0)^oo ${a === 1 ? '' : a}(-${b}x)^n, |x| < 1/${b}`, `sum_(n = 1)^oo ${a === 1 ? '' : a}(${b}x)^n, |x| < 1/${b}`].map(math)),
        solution: `Use ${math('1/(1 - r) = sum_(n = 0)^oo r^n')} for ${math('|r| < 1')} with ${math(`r = ${b}x`)}: ${math(answer)}.`,
      }, '');
    }
    if (level === 2) {
      const c = rng.pick([2, 3, 4, 5]);
      const plus = rng.next() < 0.5;
      const f = plus ? `${a}/(1 + ${c}x)` : `${a}/(${c} - x)`;
      const answer = plus ? `sum_(n = 0)^oo ${a === 1 ? '' : a}(-1)^n (${c}x)^n, |x| < 1/${c}` : `sum_(n = 0)^oo ${new Q(a, c).typst()} (x/${c})^n, |x| < ${c}`;
      return task('Write each function as a power series and give its interval of convergence.', 'Write as a power series:', `f(x) = ${f}`, {
        answer: math(answer),
        distractors: wrong(math(answer), (plus ? [`sum_(n = 0)^oo ${a === 1 ? '' : a}(${c}x)^n, |x| < 1/${c}`, `sum_(n = 0)^oo ${a === 1 ? '' : a}(-1)^n (${c}x)^n, |x| < ${c}`] : [`sum_(n = 0)^oo ${a} (x/${c})^n, |x| < ${c}`, `sum_(n = 0)^oo ${new Q(a, c).typst()} (x/${c})^n, |x| < 1/${c}`]).concat(`sum_(n = 0)^oo ${a === 1 ? '' : a}x^n, |x| < 1`).map(math)),
        solution: plus ? `Write ${math(`1/(1 + ${c}x) = 1/(1 - (-${c}x))`)}: ${math(answer)}.` : `Factor out ${c}: ${math(`${a}/(${c} - x) = ${new Q(a, c).typst()} dot 1/(1 - x/${c})`)}, so ${math(answer)}.`,
      }, '');
    }
    const c = rng.pick([4, 9, 16]), k = rng.int(1, 2);
    const f = `x^${k}/(${c} - x^2)`.replace('x^1', 'x');
    const answer = `sum_(n = 0)^oo x^(2n + ${k})/${c}^(n + 1), |x| < ${Math.sqrt(c)}`;
    return task('Write each function as a power series and give its interval of convergence.', 'Write as a power series:', `f(x) = ${f}`, {
      answer: math(answer),
      distractors: wrong(math(answer), [`sum_(n = 0)^oo x^(2n + ${k})/${c}^(n + 1), |x| < ${c}`, `sum_(n = 0)^oo x^(n + ${k})/${c}^(n + 1), |x| < ${c}`, `sum_(n = 0)^oo x^(2n)/${c}^n, |x| < ${Math.sqrt(c)}`].map(math)),
      solution: `${math(`x^${k}/(${c} - x^2) = x^${k}/${c} dot 1/(1 - x^2/${c})`.replace(/x\^1(?!\d)/g, 'x'))}, and the geometric series converges for ${math(`x^2 < ${c}`)}: ${math(answer)}.`,
    }, '');
  },
});

export const PRECALC_FUNCTIONS = [pcContinuity, pcIncreaseDecrease, pcPowerFunctions, pcAverageRate, pcPiecewise, pcZeroBounds, pcPolynomialInequalities, pcRationalInequalities, pcInverseTrig, pcProductSum, pcPartialFractions, pcRotatedConics, pcInduction, pcPowerSeries];
