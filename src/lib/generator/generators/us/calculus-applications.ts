// Calculus: applications of differentiation, after Kuta's
// DifferentiationPowerRuleTangent, DiffAppRollesMVT, DiffAppMVT, DiffAppIncDec,
// DiffAppConcavity, DiffAppRelativeExtrema, DiffAppAbsoluteExtrema,
// DiffAppOptimization, DiffAppCurveSketching, DiffAppGraphicalComparison,
// DiffAppMotionLine, DiffAppRelatedRates, Differentials, NewtonsMethod,
// LimitsDerivativeForm, and LHopitals.
import type { Rng } from '../../rng.ts';
import { Q, Surds } from '../../exact.ts';
import { poly } from '../../format.ts';
import { optOne, radioOption } from '../../options.ts';
import { fromRoots, polyEval } from '../pc40s/functions.ts';
import { us, math, task, wrong, decimal, fixed } from './common.ts';
import { polyD, polyQText } from './calc-common.ts';
import { smallGraph } from './algebra1.ts';
import { graphTypst } from '../../graph.ts';

/** A cubic with integer critical points: f'(x) = 3a(x − p)(x − q). */
function cubicWithCriticalPoints(rng: Rng): { f: number[]; p: number; q: number; a: number } {
  const p = rng.int(-4, 2), q = p + rng.int(1, 4), a = rng.pick([1, -1]);
  // f' = 3a(x² − (p + q)x + pq)  →  f = a x³ − (3a/2)(p + q) x² + 3a pq x + c; keep integers by requiring p + q even.
  if ((p + q) % 2) return cubicWithCriticalPoints(rng);
  return { f: [a, (-3 * a * (p + q)) / 2, 3 * a * p * q, rng.int(-6, 6)], p, q, a };
}
/** q/π as `27/(32pi)`. */
const overPi = (q: Q) => `${q.n}/(${q.d === 1 ? '' : q.d}pi)`;
const interval = (a: number | string, b: number | string) => `(${a}, ${b})`;
const ivs = (list: Array<[string | number, string | number]>) => (list.length ? list.map(([a, b]) => interval(a, b)).join(' union ') : 'emptyset');

export const caTangentLine = us('ca-tangent-line', {
  levels: { 1: 'Slope at a point', 2: 'Equation of the tangent line', 3: 'Equation of the normal line' },
  generate(rng, level) {
    const f = [rng.nonZero(-3, 3), rng.int(-5, 5), rng.int(-6, 6)].concat(level === 3 && rng.next() < 0.5 ? [] : []);
    const a = rng.int(-3, 3);
    const y0 = polyEval(f, a), m = polyEval(polyD(f), a);
    const fText = `f(x) = ${poly(f)}`;
    if (level === 1) {
      return task('Find the slope of the graph of each function at the given point.', 'Find the slope of', fText, {
        answer: math(String(m)), distractors: wrong(math(String(m)), [y0, polyEval(polyD(f), -a), m + f[1], polyEval(f, a + 1) - y0].map((v) => math(String(v)))),
        solution: `${math(`f'(x) = ${poly(polyD(f))}`)}, so ${math(`f'(${a}) = ${m}`)}.`,
      }, ` at ${math(`x = ${a}`)}.`);
    }
    const slope = level === 2 ? new Q(m) : m === 0 ? null : new Q(-1, m);
    if (!slope) {
      const answer = `x = ${a}`;
      return { body: `Find the equation of the normal line to ${math(fText)} at ${math(`x = ${a}`)}.`, answer: math(answer), distractors: wrong(math(answer), [`y = ${y0}`, `x = ${-a}`, `y = ${a}`].map(math)), solution: `The tangent is horizontal (${math(`f'(${a}) = 0`)}), so the normal line is vertical: ${math(answer)}.` };
    }
    const b = new Q(y0).sub(slope.mul(a));
    const line = (s: Q, c: Q) => `y = ${polyQText([s, c])}`;
    const answer = line(slope, b);
    return {
      body: `Find the equation of the ${level === 2 ? 'tangent' : 'normal'} line to ${math(fText)} at ${math(`x = ${a}`)}.`,
      answer: math(answer),
      distractors: wrong(math(answer), [line(level === 2 ? new Q(-1, m || 1) : new Q(m), new Q(y0).sub((level === 2 ? new Q(-1, m || 1) : new Q(m)).mul(a))), line(slope, new Q(y0)), line(slope, new Q(y0).add(slope.mul(a)))].map(math)),
      solution: `The point is ${math(`(${a}, ${y0})`)} and ${math(`f'(${a}) = ${m}`)}${level === 3 ? `, so the normal slope is ${math(slope.typst())}` : ''}. Point-slope form gives ${math(answer)}.`,
    };
  },
});

export const caRolle = us('ca-rolle', {
  levels: { 1: 'Quadratic functions', 2: 'Cubic functions', 3: 'Decide whether the theorem applies' },
  generate(rng, level) {
    if (level === 3 && rng.next() < 0.5) {
      // |x − c| on an interval around c: not differentiable, so Rolle's Theorem does not apply.
      const c = rng.int(-3, 3), h = rng.int(1, 4);
      return {
        body: `Does Rolle's Theorem apply to ${math(`f(x) = |x ${c < 0 ? '+' : '-'} ${Math.abs(c)}|`.replace('x - 0', 'x'))} on ${math(`[${c - h}, ${c + h}]`)}? If so, find the values of ${math('c')} that it guarantees.`,
        answer: `No: ${math('f')} is not differentiable at ${math(`x = ${c}`)}.`,
        distractors: [`Yes: ${math(`c = ${c}`)}`, `Yes: ${math(`c = ${c - h}`)}`, `No: ${math(`f(${c - h}) != f(${c + h})`)}.`],
        solution: `${math(`f(${c - h}) = f(${c + h}) = ${h}`)}, but ${math('f')} has a corner at ${math(`x = ${c}`)}, so it is not differentiable on the interval and the theorem does not apply.`,
      };
    }
    if (level === 1) {
      const r = rng.int(-6, 2), s = r + 2 * rng.int(1, 4), lead = rng.nonZero(-3, 3);
      const f = fromRoots([r, s], lead).map((v, i) => (i === 2 ? v + rng.int(-5, 5) : v));
      const c = (r + s) / 2;
      return {
        body: `Find the values of ${math('c')} guaranteed by Rolle's Theorem for ${math(`f(x) = ${poly(f)}`)} on ${math(`[${r}, ${s}]`)}.`,
        answer: math(`c = ${c}`), distractors: wrong(math(`c = ${c}`), [r, s, c + 1, -c].map((v) => math(`c = ${v}`))),
        solution: `${math(`f(${r}) = f(${s}) = ${polyEval(f, r)}`)}, and ${math(`f'(x) = ${poly(polyD(f))} = 0`)} at ${math(`x = ${c}`)}, which is in the interval.`,
      };
    }
    // f = x³ − k²x on [−k, k]: f' = 3x² − k² = 0 at x = ±k/√3.
    const kk = rng.int(1, 4), shift = rng.int(-5, 5);
    const f = [1, 0, -kk * kk, shift];
    const root = new Surds([[new Q(kk, 3), 3]]).typst();
    const answer = `c = plus.minus ${root}`;
    return {
      body: `Find the values of ${math('c')} guaranteed by Rolle's Theorem for ${math(`f(x) = ${poly(f)}`)} on ${math(`[${-kk}, ${kk}]`)}.`,
      answer: math(answer), distractors: wrong(math(answer), [`c = ${root}`, `c = plus.minus ${kk}`, `c = plus.minus ${new Surds([[1, kk * kk * 3]]).typst()}`, 'c = 0'].map(math)),
      solution: `${math(`f(${-kk}) = f(${kk}) = ${shift}`)}. ${math(`f'(x) = 3x^2 - ${kk * kk} = 0`)} gives ${math(answer)}, both in the interval.`,
    };
  },
});

export const caMvt = us('ca-mvt', {
  levels: { 1: 'Quadratic functions', 2: 'Cubic functions', 3: 'Rational functions' },
  generate(rng, level) {
    const a = rng.int(-3, 1), b = a + rng.int(2, 5);
    if (level === 1) {
      const f = [rng.nonZero(-3, 3), rng.int(-5, 5), rng.int(-6, 6)];
      const c = new Q(a + b, 2);
      const slope = new Q(polyEval(f, b) - polyEval(f, a), b - a);
      return {
        body: `Find the values of ${math('c')} that satisfy the Mean Value Theorem for ${math(`f(x) = ${poly(f)}`)} on ${math(`[${a}, ${b}]`)}.`,
        answer: math(`c = ${c.typst()}`), distractors: wrong(math(`c = ${c.typst()}`), [new Q(a), new Q(b), slope, c.add(1)].map((q) => math(`c = ${q.typst()}`))),
        solution: `The average rate of change is ${math(slope.typst())}. Solve ${math(`f'(c) = ${poly(polyD(f)).replace(/x/g, 'c')} = ${slope.typst()}`)}: ${math(`c = ${c.typst()}`)}.`,
      };
    }
    if (level === 2) {
      // f = x³: 3c² = a² + ab + b², with 0 ≤ a < b so the positive root lies in the interval.
      const lo = rng.int(0, 2), hi = lo + rng.int(1, 3);
      const s = lo * lo + lo * hi + hi * hi;
      const c = new Surds([[new Q(1, 3), 3 * s]]).typst();
      return {
        body: `Find the values of ${math('c')} that satisfy the Mean Value Theorem for ${math('f(x) = x^3')} on ${math(`[${lo}, ${hi}]`)}.`,
        answer: math(`c = ${c}`), distractors: wrong(math(`c = ${c}`), [`c = plus.minus ${c}`, `c = ${new Q(lo + hi, 2).typst()}`, `c = ${new Surds([[1, s]]).typst()}`].map(math)),
        solution: `${math(`(${hi ** 3} - ${lo ** 3})/(${hi} - ${lo}) = ${s}`)}. Solve ${math(`3c^2 = ${s}`)}; only ${math(`c = ${c}`)} is in the interval.`,
      };
    }
    // f = k/x on [p, q] with 0 < p < q: −k/c² = −k/(pq), c = √(pq).
    const p = rng.int(1, 4), q = p + rng.int(1, 6), kk = rng.int(1, 9);
    const c = new Surds([[1, p * q]]).typst();
    return {
      body: `Find the values of ${math('c')} that satisfy the Mean Value Theorem for ${math(`f(x) = ${kk}/x`)} on ${math(`[${p}, ${q}]`)}.`,
      answer: math(`c = ${c}`), distractors: wrong(math(`c = ${c}`), [`c = ${new Q(p + q, 2).typst()}`, `c = plus.minus ${c}`, `c = ${p * q}`].map(math)),
      solution: `The average rate of change is ${math(`-${kk}/${p * q}`)}. Solve ${math(`-${kk}/c^2 = -${kk}/${p * q}`)}: ${math(`c = ${c}`)}, which is in the interval.`,
    };
  },
});

export const caIncreaseDecrease = us('ca-increase-decrease', {
  points: 2,
  levels: { 1: 'Quadratic functions', 2: 'Cubic functions', 3: 'Quartic functions' },
  options: [radioOption('ask', 'Find', [['increase', 'Intervals of increase'], ['decrease', 'Intervals of decrease']], ['increase', 'increase', 'decrease'])],
  generate(rng, level, o) {
    const ask = optOne(o, 'ask', 'increase');
    let f: number[], crits: number[], signs: number[];
    if (level === 1) {
      const p = rng.int(-4, 4), a = rng.nonZero(-3, 3);
      f = [a, -2 * a * p, rng.int(-6, 6)]; crits = [p]; signs = [-Math.sign(a), Math.sign(a)];
    } else if (level === 2) {
      const c = cubicWithCriticalPoints(rng); f = c.f; crits = [c.p, c.q]; signs = [c.a, -c.a, c.a];
    } else {
      // f' = 4x(x − p)(x + p): f = x⁴ − 2p²x² + c
      const p = rng.int(1, 3); f = [1, 0, -2 * p * p, 0, rng.int(-5, 5)]; crits = [-p, 0, p]; signs = [-1, 1, -1, 1];
    }
    const pts = ['-oo', ...crits, 'oo'];
    const want = ask === 'increase' ? 1 : -1;
    const answer = ivs(signs.map((s, i) => [s, pts[i], pts[i + 1]] as const).filter(([s]) => s === want).map(([, a, b]) => [a, b]));
    const other = ivs(signs.map((s, i) => [s, pts[i], pts[i + 1]] as const).filter(([s]) => s !== want).map(([, a, b]) => [a, b]));
    return task(`Find the intervals on which each function is ${ask === 'increase' ? 'increasing' : 'decreasing'}.`, 'Find where', `f(x) = ${poly(f)}`, {
      answer: math(answer),
      distractors: wrong(math(answer), [other, ivs([[pts[0], pts[pts.length - 1]]]), ivs(crits.map((c) => [c - 1, c + 1]))].map(math)),
      solution: `${math(`f'(x) = ${poly(polyD(f))}`)} is zero at ${math(`x = ${crits.join(', ')}`)}. Test the sign of ${math("f'")} on each interval: ${math("f'")} is ${ask === 'increase' ? 'positive' : 'negative'} on ${math(answer)}.`,
    }, ask === 'increase' ? ' is increasing.' : ' is decreasing.');
  },
});

export const caConcavity = us('ca-concavity', {
  points: 2,
  levels: { 1: 'Inflection points of cubics', 2: 'Intervals of concavity of cubics', 3: 'Quartic functions' },
  generate(rng, level) {
    if (level === 3) {
      // f'' = 12x² − 12p² for f = x⁴ − 6p²x² + bx + c: inflection at ±p.
      const p = rng.int(1, 3), b = rng.int(-6, 6), c = rng.int(-5, 5);
      const f = [1, 0, -6 * p * p, b, c];
      const answer = `"up:" (-oo, ${-p}) union (${p}, oo)", down:" (${-p}, ${p})`.replace('", down:"', '"; down:"');
      return task('Find the intervals on which each function is concave up and concave down.', 'Find the intervals of concavity of', `f(x) = ${poly(f)}`, {
        answer: math(answer), distractors: wrong(math(answer), [`"up:" (${-p}, ${p})"; down:" (-oo, ${-p}) union (${p}, oo)`, `"up:" (0, oo)"; down:" (-oo, 0)`, `"up:" (-oo, ${-2 * p}) union (${2 * p}, oo)"; down:" (${-2 * p}, ${2 * p})`].map((t) => math(t.replace('"; down:"', '"; down:"')))),
        solution: `${math(`f''(x) = 12x^2 - ${12 * p * p}`)} is zero at ${math(`x = plus.minus ${p}`)}; it is positive outside and negative between them.`,
      });
    }
    const c = cubicWithCriticalPoints(rng);
    const xi = (c.p + c.q) / 2, yi = polyEval(c.f, xi);
    if (level === 1) {
      const answer = `(${xi}, ${yi})`;
      return task('Find the inflection points of each function.', 'Find the inflection point of', `f(x) = ${poly(c.f)}`, {
        answer: math(answer), distractors: wrong(math(answer), [`(${c.p}, ${polyEval(c.f, c.p)})`, `(${c.q}, ${polyEval(c.f, c.q)})`, `(${-xi}, ${polyEval(c.f, -xi)})`, `(${xi}, ${-yi})`].map(math)),
        solution: `${math(`f''(x) = ${poly(polyD(polyD(c.f)))}`)} changes sign at ${math(`x = ${xi}`)}, where ${math(`f(${xi}) = ${yi}`)}.`,
      });
    }
    const up = c.a > 0 ? `(${xi}, oo)` : `(-oo, ${xi})`, down = c.a > 0 ? `(-oo, ${xi})` : `(${xi}, oo)`;
    const answer = `"up:" ${up}"; down:" ${down}`;
    return task('Find the intervals on which each function is concave up and concave down.', 'Find the intervals of concavity of', `f(x) = ${poly(c.f)}`, {
      answer: math(answer), distractors: wrong(math(answer), [`"up:" ${down}"; down:" ${up}`, `"up:" (${c.q}, oo)"; down:" (-oo, ${c.p})`, `"up:" (-oo, ${c.p}) union (${c.q}, oo)"; down:" (${c.p}, ${c.q})`].map(math)),
      solution: `${math(`f''(x) = ${poly(polyD(polyD(c.f)))}`)} is zero at ${math(`x = ${xi}`)}. Where ${math("f'' > 0")} the graph is concave up; where ${math("f'' < 0")} it is concave down.`,
    });
  },
});

export const caRelativeExtrema = us('ca-relative-extrema', {
  points: 2,
  levels: { 1: 'Quadratic functions', 2: 'Cubic functions', 3: 'Quartic functions' },
  generate(rng, level) {
    const pt = (f: number[], x: number) => `(${x}, ${polyEval(f, x)})`;
    let f: number[], maxs: number[], mins: number[];
    if (level === 1) { const p = rng.int(-4, 4), a = rng.nonZero(-3, 3); f = [a, -2 * a * p, rng.int(-6, 6)]; maxs = a < 0 ? [p] : []; mins = a > 0 ? [p] : []; }
    else if (level === 2) { const c = cubicWithCriticalPoints(rng); f = c.f; maxs = [c.a > 0 ? c.p : c.q]; mins = [c.a > 0 ? c.q : c.p]; }
    else { const p = rng.int(1, 3); f = [1, 0, -2 * p * p, 0, rng.int(-5, 5)]; maxs = [0]; mins = [-p, p]; }
    const list = (xs: number[]) => (xs.length ? xs.map((x) => pt(f, x)).join(', ') : '"none"');
    const answer = `"max:" ${list(maxs)}"; min:" ${list(mins)}`;
    return task('Find the relative maxima and minima of each function.', 'Find the relative extrema of', `f(x) = ${poly(f)}`, {
      answer: math(answer),
      distractors: wrong(math(answer), [`"max:" ${list(mins)}"; min:" ${list(maxs)}`, `"max:" ${maxs.length ? maxs.map((x) => `(${x}, 0)`).join(', ') : '"none"'}"; min:" ${mins.length ? mins.map((x) => `(${x}, 0)`).join(', ') : '"none"'}`, `"max:" ${list(maxs.map((x) => -x))}"; min:" ${list(mins.map((x) => -x))}`].map(math)),
      solution: `${math(`f'(x) = ${poly(polyD(f))}`)}. Its zeros are critical points; ${math("f'")} changes from positive to negative at a maximum and from negative to positive at a minimum: ${math(answer)}.`,
    });
  },
});

export const caAbsoluteExtrema = us('ca-absolute-extrema', {
  points: 2,
  levels: { 1: 'Quadratic functions', 2: 'Cubic functions', 3: 'Cubic functions, critical points outside the interval' },
  generate(rng, level) {
    let f: number[], crits: number[];
    if (level === 1) { const p = rng.int(-3, 3), a = rng.nonZero(-2, 2); f = [a, -2 * a * p, rng.int(-6, 6)]; crits = [p]; }
    else { const c = cubicWithCriticalPoints(rng); f = c.f; crits = [c.p, c.q]; }
    const lo = Math.min(...crits) - rng.int(level === 3 ? -1 : 1, 2), hi = Math.max(...crits) + rng.int(level === 3 ? -1 : 1, 2);
    const cands = [lo, hi, ...crits.filter((c) => c > lo && c < hi)];
    const vals = cands.map((x) => [x, polyEval(f, x)] as const);
    const max = vals.reduce((m, v) => (v[1] > m[1] ? v : m)), min = vals.reduce((m, v) => (v[1] < m[1] ? v : m));
    const answer = `"max:" ${max[1]} "at" x = ${max[0]}"; min:" ${min[1]} "at" x = ${min[0]}`;
    return {
      body: `Find the absolute maximum and minimum values of ${math(`f(x) = ${poly(f)}`)} on ${math(`[${lo}, ${hi}]`)}.`,
      answer: math(answer),
      distractors: wrong(math(answer), [`"max:" ${min[1]} "at" x = ${min[0]}"; min:" ${max[1]} "at" x = ${max[0]}`, `"max:" ${polyEval(f, hi)} "at" x = ${hi}"; min:" ${polyEval(f, lo)} "at" x = ${lo}`, `"max:" ${Math.max(...crits.map((c) => polyEval(f, c)))} "at" x = ${crits[0]}"; min:" ${Math.min(...crits.map((c) => polyEval(f, c)))} "at" x = ${crits[crits.length - 1]}`].map(math)),
      solution: `Compare ${math('f')} at the endpoints and at the critical points inside the interval: ${vals.map(([x, y]) => math(`f(${x}) = ${y}`)).join(', ')}.`,
    };
  },
});

export const caOptimization = us('ca-optimization', {
  points: 3,
  levels: { 1: 'Numbers and fencing', 2: 'Boxes and areas', 3: 'Cost and distance' },
  generate(rng, level) {
    const kind = level === 1 ? rng.pick(['product', 'fence']) : level === 2 ? rng.pick(['box', 'river']) : rng.pick(['can', 'cost']);
    if (kind === 'product') {
      const s = 2 * rng.int(5, 30);
      return { body: `Find two positive numbers whose sum is ${s} and whose product is as large as possible.`, answer: math(`${s / 2} "and" ${s / 2}`), distractors: wrong(math(`${s / 2} "and" ${s / 2}`), [`${s / 2 - 1} "and" ${s / 2 + 1}`, `${s} "and" 0`, `${s / 4} "and" ${(3 * s) / 4}`].map(math)), solution: `Maximize ${math(`P = x(${s} - x)`)}: ${math(`P' = ${s} - 2x = 0`)} at ${math(`x = ${s / 2}`)}.` };
    }
    if (kind === 'fence') {
      const L = 4 * rng.int(10, 60);
      const side = L / 4;
      return { body: `A farmer has ${L} m of fencing to enclose a rectangular field. What dimensions give the largest area?`, answer: `${math(String(side))} m by ${math(String(side))} m`, distractors: wrong(`${math(String(side))} m by ${math(String(side))} m`, [`${math(String(L / 2))} m by ${math(String(L / 2))} m`, `${math(String(side - 5))} m by ${math(String(side + 5))} m`, `${math(String(L / 3))} m by ${math(String(L / 6))} m`]), solution: `Area ${math(`A = x(${L / 2} - x)`)}; ${math(`A' = ${L / 2} - 2x = 0`)} gives ${math(`x = ${side}`)}: a square.` };
    }
    if (kind === 'river') {
      const L = 4 * rng.int(10, 60);
      return { body: `A rectangular pen is built along a straight river, so no fence is needed on that side. With ${L} m of fencing, what dimensions give the largest area?`, answer: `${math(String(L / 4))} m by ${math(String(L / 2))} m`, distractors: wrong(`${math(String(L / 4))} m by ${math(String(L / 2))} m`, [`${math(String(L / 3))} m by ${math(String(L / 3))} m`, `${math(String(L / 4))} m by ${math(String(L / 4))} m`, `${math(String(L / 2))} m by ${math(String(L / 2))} m`]), solution: `With ${math('x')} the sides perpendicular to the river, ${math(`A = x(${L} - 2x)`)}; ${math(`A' = ${L} - 4x = 0`)} gives ${math(`x = ${L / 4}`)}, and the long side is ${L / 2} m.` };
    }
    if (kind === 'box') {
      // Square sheet of side s with squares x cut from corners: V = x(s − 2x)², max at x = s/6.
      const s = 6 * rng.int(2, 10);
      const x = s / 6, V = x * (s - 2 * x) ** 2;
      return { body: `An open box is made from a ${s} cm by ${s} cm square of cardboard by cutting equal squares from the corners and folding up the sides. What size squares give the largest volume, and what is that volume?`, answer: `${math(String(x))} cm squares; ${math(String(V))} cm#super[3]`, distractors: wrong(`${math(String(x))} cm squares; ${math(String(V))} cm#super[3]`, [`${math(String(s / 4))} cm squares; ${math(String((s / 4) * (s / 2) ** 2))} cm#super[3]`, `${math(String(s / 3))} cm squares; ${math(String((s / 3) * (s / 3) ** 2))} cm#super[3]`, `${math(String(s / 2))} cm squares; ${math('0')} cm#super[3]`]), solution: `${math(`V = x(${s} - 2x)^2`)}. ${math(`V' = (${s} - 2x)(${s} - 6x) = 0`)} gives ${math(`x = ${x}`)} (the other root makes no box), and ${math(`V = ${V}`)}.` };
    }
    if (kind === 'can') {
      // Closed cylinder of volume V with least surface area: h = 2r, r = (V/(2π))^(1/3).
      const V = rng.pick([250, 500, 750, 1000, 1500, 2000]);
      const r = Math.cbrt(V / (2 * Math.PI)), h = 2 * r;
      return { body: `A closed cylindrical can must hold ${V} cm#super[3]. What radius and height use the least material? Round to the nearest tenth.`, answer: `${math(`r approx ${fixed(r, 1)}`)} cm, ${math(`h approx ${fixed(h, 1)}`)} cm`, distractors: wrong(`${math(`r approx ${fixed(r, 1)}`)} cm, ${math(`h approx ${fixed(h, 1)}`)} cm`, [`${math(`r approx ${fixed(h, 1)}`)} cm, ${math(`h approx ${fixed(r, 1)}`)} cm`, `${math(`r approx ${fixed(Math.cbrt(V / Math.PI), 1)}`)} cm, ${math(`h approx ${fixed(Math.cbrt(V / Math.PI), 1)}`)} cm`, `${math(`r approx ${fixed(Math.sqrt(V / (2 * Math.PI)), 1)}`)} cm, ${math(`h approx ${fixed(2, 1)}`)} cm`]), solution: `${math(`A = 2pi r^2 + (2 dot ${V})/r`)}; ${math(`A' = 4pi r - ${2 * V}/r^2 = 0`)} gives ${math(`r = root(3, ${V}/(2pi)) approx ${fixed(r, 1)}`)} and ${math(`h = 2r approx ${fixed(h, 1)}`)}.` };
    }
    // Revenue: price p, demand q = a − bp; maximize R = p(a − bp) at p = a/(2b).
    const b = rng.int(2, 10), a = 2 * b * rng.int(5, 40);
    const p = a / (2 * b);
    return { body: `A store sells ${math(`q = ${a} - ${b}p`)} items per week at a price of ${math('p')} dollars. What price maximizes weekly revenue?`, answer: math(`\\$${p}`), distractors: wrong(math(`\\$${p}`), [a / b, p / 2, a / 2].map((v) => math(`\\$${decimal(v, 2)}`))), solution: `${math(`R = p(${a} - ${b}p)`)}; ${math(`R' = ${a} - ${2 * b}p = 0`)} gives ${math(`p = ${p}`)}.` };
  },
});

/** A polynomial graph on a window fitted around its key points (crit), so integer coefficients stay readable. */
function fittedGraph(f: number[], keys: number[]): string {
  const xc = (Math.min(...keys) + Math.max(...keys)) / 2;
  const xs = [...keys, xc - 4, xc + 4];
  const ys = keys.map((x) => polyEval(f, x));
  const span = Math.max(4, (Math.max(...ys) - Math.min(...ys)) * 0.6);
  const yc = (Math.max(...ys) + Math.min(...ys)) / 2;
  const half = Math.ceil(span + (Math.max(...ys) - Math.min(...ys)) / 2);
  const xMin = Math.floor(Math.min(...xs)) - 1, xMax = Math.ceil(Math.max(...xs)) + 1;
  const step = half > 20 ? 10 : half > 8 ? 2 : 1;
  return graphTypst({
    xMin, xMax, yMin: Math.floor(yc - half), yMax: Math.ceil(yc + half), width: 3.6, height: 3.6,
    yStep: step, xLabelStep: 2, yLabelStep: step * (half > 8 ? 2 : 1), curves: [{ f: (x) => polyEval(f, x) }],
  });
}

export const caCurveSketching = us('ca-curve-sketching', {
  points: 3,
  levels: { 1: 'Cubic with turning points', 2: 'Cubic, with the inflection point', 3: 'Quartic' },
  generate(rng, level) {
    let f: number[], keys: number[];
    if (level === 3) { const p = rng.int(1, 2); f = [1, 0, -2 * p * p, 0, rng.int(-3, 2)]; keys = [-p, 0, p]; }
    else { const c = cubicWithCriticalPoints(rng); f = c.f; keys = [c.p, c.q]; }
    const flipped = f.map((v) => -v);
    const shifted = f.map((v, i) => (i === f.length - 1 ? v + 4 : v));
    const mirrored = f.map((v, i) => ((f.length - 1 - i) % 2 ? -v : v));
    // Every choice uses the answer's window, so they differ only in shape.
    const keysAll = [...keys, ...keys.map((x) => -x)];
    return {
      body: `Sketch the graph of ${math(`f(x) = ${poly(f)}`)}, using its critical points${level === 1 ? '' : ' and inflection points'}.`,
      answer: fittedGraph(f, keysAll), distractors: [fittedGraph(flipped, keysAll), fittedGraph(shifted, keysAll), fittedGraph(mirrored, keysAll)],
      solution: `${math(`f'(x) = ${poly(polyD(f))}`)} is zero at ${math(`x = ${keys.join(', ')}`)} (the turning points), and ${math(`f''(x) = ${poly(polyD(polyD(f)))}`)} gives the inflection point${level === 3 ? 's' : ''}. Plot these with the y-intercept ${math(String(f[f.length - 1]))} and the end behaviour.`,
    };
  },
});

export const caGraphicalComparison = us('ca-graphical-comparison', {
  levels: { 1: "Graph of f' from f", 2: "Graph of f from f'", 3: "Graph of f'' from f" },
  generate(rng, level) {
    const c = cubicWithCriticalPoints(rng);
    let f = c.f;
    if ([-6, -3, 0, 3, 6].some((x) => Math.abs(polyEval(f, x)) > 40)) f = f.map((v) => v / 4);
    const d1 = polyD(f), d2 = polyD(d1);
    const g = (p: number[]) => smallGraph({ curves: [{ f: (x) => polyEval(p, x) }] });
    const [given, want, names] = level === 1 ? [f, d1, ['f', "f'"]] : level === 2 ? [d1, f, ["f'", 'f']] : [f, d2, ['f', "f''"]];
    const others = level === 2 ? [d1, d2, f.map((v) => -v)] : level === 1 ? [d2, f, d1.map((v) => -v)] : [d1, f, d2.map((v) => -v)];
    return {
      body: `The graph of ${math(names[0])} is shown. Which graph is ${math(names[1])}?\n\n${g(given)}`,
      answer: g(want), distractors: others.map(g),
      solution: level === 2 ? `Where ${math("f'")} is positive, ${math('f')} rises; where it crosses zero, ${math('f')} has a turning point.` : level === 1 ? `${math("f'")} is zero at the turning points of ${math('f')}, positive where ${math('f')} rises, and negative where it falls.` : `${math("f''")} is positive where ${math('f')} is concave up and crosses zero at the inflection point.`,
    };
  },
});

export const caMotion = us('ca-motion', {
  points: 2,
  levels: { 1: 'Velocity and acceleration at a time', 2: 'When the particle is at rest', 3: 'When the particle is speeding up' },
  generate(rng, level) {
    // s(t) = t³ − (3/2)(p + q)t² + 3pq t, with rest times p and q (positive).
    const p = rng.int(1, 3), q = p + 2 * rng.int(1, 2);
    const s = [1, (-3 * (p + q)) / 2, 3 * p * q, rng.int(-5, 5)];
    const st = `s(t) = ${poly(s, 't')}`;
    if (level === 1) {
      const t = rng.int(0, 5);
      const v = polyEval(polyD(s), t), a = polyEval(polyD(polyD(s)), t);
      const answer = `v(${t}) = ${v}", " a(${t}) = ${a}`;
      return {
        body: `A particle moves along a line with position ${math(st)} (metres, seconds). Find its velocity and acceleration at ${math(`t = ${t}`)}.`,
        answer: math(answer), distractors: wrong(math(answer), [`v(${t}) = ${polyEval(s, t)}", " a(${t}) = ${v}`, `v(${t}) = ${a}", " a(${t}) = ${v}`, `v(${t}) = ${v}", " a(${t}) = ${polyEval(polyD(polyD(polyD(s))), t)}`].map(math)),
        solution: `${math(`v(t) = s'(t) = ${poly(polyD(s), 't')}`)} and ${math(`a(t) = v'(t) = ${poly(polyD(polyD(s)), 't')}`)}.`,
      };
    }
    if (level === 2) {
      const answer = `t = ${p}, ${q}`;
      return {
        body: `A particle moves along a line with position ${math(st)}. When is the particle at rest?`,
        answer: math(answer), distractors: wrong(math(answer), [`t = ${(p + q) / 2}`, `t = ${p}`, `t = ${-p}, ${-q}`].map(math)),
        solution: `${math(`v(t) = ${poly(polyD(s), 't')} = 3(t - ${p})(t - ${q})`)}, which is zero at ${math(answer)}.`,
      };
    }
    const m = (p + q) / 2;
    const answer = `(${p}, ${m}) union (${q}, oo)`;
    return {
      body: `A particle moves along a line with position ${math(st)} for ${math('t >= 0')}. On which intervals is it speeding up?`,
      answer: math(answer), distractors: wrong(math(answer), [`(0, ${p}) union (${m}, ${q})`, `(${q}, oo)`, `(${p}, ${q})`].map(math)),
      solution: `It speeds up when velocity and acceleration have the same sign. ${math(`v(t) = 3(t - ${p})(t - ${q})`)} and ${math(`a(t) = 6t - ${3 * (p + q)}`)} (zero at ${math(`t = ${m}`)}): both negative on ${math(`(${p}, ${m})`)} and both positive on ${math(`(${q}, oo)`)}.`,
    };
  },
});

export const caRelatedRates = us('ca-related-rates', {
  points: 3,
  levels: { 1: 'Circles and squares', 2: 'Spheres and ladders', 3: 'Cones and shadows' },
  generate(rng, level) {
    const kind = level === 1 ? rng.pick(['circle', 'square']) : level === 2 ? rng.pick(['sphere', 'ladder']) : rng.pick(['cone', 'shadow']);
    if (kind === 'circle') {
      const dr = rng.int(1, 5), r = rng.int(2, 15);
      const ans = `${2 * r * dr} pi`;
      return { body: `The radius of a circle increases at ${dr} cm/s. How fast is the area increasing when the radius is ${r} cm?`, answer: `${math(ans)} cm#super[2]/s`, distractors: wrong(`${math(ans)} cm#super[2]/s`, [`${math(`${r * r * dr} pi`)} cm#super[2]/s`, `${math(`${2 * dr} pi`)} cm#super[2]/s`, `${math(`${2 * r * dr}`)} cm#super[2]/s`]), solution: `${math('A = pi r^2')}, so ${math(`(d A)/(d t) = 2pi r (d r)/(d t) = 2pi(${r})(${dr}) = ${ans}`)}.` };
    }
    if (kind === 'square') {
      const ds = rng.int(1, 6), s = rng.int(2, 20);
      return { body: `The sides of a square grow at ${ds} m/min. How fast is the area changing when each side is ${s} m?`, answer: `${math(String(2 * s * ds))} m#super[2]/min`, distractors: wrong(`${math(String(2 * s * ds))} m#super[2]/min`, [s * s * ds, 2 * ds, 4 * ds].map((v) => `${math(String(v))} m#super[2]/min`)), solution: `${math('A = s^2')}, so ${math(`(d A)/(d t) = 2s (d s)/(d t) = ${2 * s * ds}`)}.` };
    }
    if (kind === 'sphere') {
      const dr = rng.int(1, 4), r = rng.int(2, 10);
      const ans = `${4 * r * r * dr} pi`;
      return { body: `A spherical balloon's radius grows at ${dr} cm/s. How fast is its volume increasing when the radius is ${r} cm?`, answer: `${math(ans)} cm#super[3]/s`, distractors: wrong(`${math(ans)} cm#super[3]/s`, [`${math(`${new Q(4 * r ** 3 * dr, 3).typst()} pi`)} cm#super[3]/s`, `${math(`${8 * r * dr} pi`)} cm#super[3]/s`, `${math(`${4 * r * dr} pi`)} cm#super[3]/s`]), solution: `${math('V = 4/3 pi r^3')}, so ${math(`(d V)/(d t) = 4pi r^2 (d r)/(d t) = 4pi(${r})^2(${dr}) = ${ans}`)}.` };
    }
    if (kind === 'ladder') {
      const [a, b, L] = rng.pick([[6, 8, 10], [5, 12, 13], [9, 12, 15], [8, 15, 17], [12, 16, 20]]);
      const dx = rng.int(1, 4);
      const dy = new Q(-a * dx, b);
      return { body: `A ${L} m ladder leans against a wall. Its foot slides away from the wall at ${dx} m/s. How fast is the top sliding down when the foot is ${a} m from the wall?`, answer: `${math(dy.abs().typst())} m/s`, distractors: wrong(`${math(dy.abs().typst())} m/s`, [new Q(b * dx, a), new Q(dx), new Q(a * dx, L)].map((q) => `${math(q.typst())} m/s`)), solution: `${math(`x^2 + y^2 = ${L * L}`)}, so ${math('2x x\' + 2y y\' = 0')}. With ${math(`x = ${a}`)}, ${math(`y = ${b}`)}: ${math(`y' = -(${a} dot ${dx})/${b} = ${dy.typst()}`)}, so the top slides down at ${math(dy.abs().typst())} m/s.` };
    }
    if (kind === 'cone') {
      // Inverted cone, radius R and height H; water flows in at dV; rate dh at depth h: dV = π (R/H)² h² dh.
      const R = rng.int(2, 6), H = R * rng.int(2, 3), dV = rng.int(2, 12), h = rng.int(1, H - 1);
      const dh = new Q(dV * H * H, R * R * h * h);
      return { body: `Water pours into an inverted conical tank (radius ${R} m at the top, height ${H} m) at ${dV} m#super[3]/min. How fast is the water level rising when the water is ${h} m deep?`, answer: `${math(`${dh.n}/(${dh.d === 1 ? '' : dh.d}pi)`)} m/min`, distractors: wrong(`${math(`${overPi(dh)}`)} m/min`, [`${math(`${overPi(dh.mul(3))}`)} m/min`, `${math(dh.typst())} m/min`, `${math(`${overPi(new Q(dV, h * h))}`)} m/min`]), solution: `By similar triangles ${math(`r = ${new Q(R, H).typst()} h`)}, so ${math(`V = 1/3 pi (${new Q(R, H).typst()} h)^2 h`)} and ${math(`(d V)/(d t) = pi (${new Q(R * R, H * H).typst()}) h^2 (d h)/(d t)`)}. With ${math(`h = ${h}`)}: ${math(`(d h)/(d t) = ${overPi(dh)}`)}.` };
    }
    // A person of height p walks away from a lamp post of height L at speed v; the shadow lengthens at p v/(L − p).
    const pH = rng.pick([1.5, 1.6, 1.8, 2]), L = rng.int(4, 8), v = rng.int(1, 3);
    const ds = new Q(Math.round(pH * 10) * v, Math.round((L - pH) * 10));
    return { body: `A ${pH} m tall person walks away from a ${L} m lamp post at ${v} m/s. How fast is the length of their shadow increasing?`, answer: `${math(ds.typst())} m/s`, distractors: wrong(`${math(ds.typst())} m/s`, [ds.add(v), new Q(Math.round(L * 10) * v, Math.round((L - pH) * 10)), new Q(v)].map((q) => `${math(q.typst())} m/s`)), solution: `With ${math('s')} the shadow length and ${math('x')} the distance to the post, similar triangles give ${math(`s/${pH} = (x + s)/${L}`)}, so ${math(`s = ${pH}/${decimal(L - pH)} x`)} and ${math(`(d s)/(d t) = ${ds.typst()}`)} m/s.` };
  },
});

export const caDifferentials = us('ca-differentials', {
  levels: { 1: 'Approximate a root', 2: 'Approximate a power', 3: 'Find dy for a given dx' },
  generate(rng, level) {
    if (level === 3) {
      const f = [rng.nonZero(-3, 3), rng.int(-5, 5), rng.int(-6, 6)];
      const x = rng.int(-3, 4), dx = rng.pick([0.1, 0.05, -0.1, 0.2, 0.01]);
      const dy = polyEval(polyD(f), x) * dx;
      return { body: `For ${math(`y = ${poly(f)}`)}, find ${math('d y')} when ${math(`x = ${x}`)} and ${math(`d x = ${dx}`)}.`, answer: math(`d y = ${decimal(dy, 4)}`), distractors: wrong(math(`d y = ${decimal(dy, 4)}`), [polyEval(f, x + dx) - polyEval(f, x), polyEval(polyD(f), x), dy * 10].map((v) => math(`d y = ${decimal(v, 4)}`))), solution: `${math(`d y = f'(x) d x = (${polyEval(polyD(f), x)})(${dx}) = ${decimal(dy, 4)}`)}.` };
    }
    if (level === 1) {
      const a = rng.int(2, 12), h = rng.pick([-2, -1, 1, 2, 3]);
      const n = a * a + h;
      const approx = a + h / (2 * a);
      return { body: `Use a linear approximation to estimate ${math(`sqrt(${n})`)}. Round to three decimal places.`, answer: math(fixed(approx, 3)), distractors: wrong(math(fixed(approx, 3)), [a + h / a, a + h, Math.sqrt(n) + 0.01].map((v) => math(fixed(v, 3)))), solution: `Use ${math('f(x) = sqrt(x)')} at ${math(`x = ${a * a}`)}: ${math(`L(x) = ${a} + 1/(2 dot ${a})(x - ${a * a})`)}, so ${math(`sqrt(${n}) approx ${fixed(approx, 3)}`)}.` };
    }
    const a = rng.int(1, 5), h = rng.pick([0.1, 0.02, -0.1, 0.05, -0.02]), n = rng.int(2, 4);
    const approx = a ** n + n * a ** (n - 1) * h;
    return { body: `Use a linear approximation to estimate ${math(`(${decimal(a + h)})^${n}`)}.`, answer: math(decimal(approx, 4)), distractors: wrong(math(decimal(approx, 4)), [a ** n + h, a ** n + n * h, (a + h) ** n + 0.1].map((v) => math(decimal(v, 4)))), solution: `${math(`f(x) = x^${n}`)} at ${math(`x = ${a}`)}: ${math(`f(${a}) + f'(${a})(${decimal(h)}) = ${a ** n} + ${n * a ** (n - 1)}(${decimal(h)}) = ${decimal(approx, 4)}`)}.` };
  },
});

export const caNewton = us('ca-newton', {
  points: 2,
  levels: { 1: 'One iteration', 2: 'Two iterations', 3: 'Three iterations' },
  generate(rng, level) {
    const kind = rng.next() < 0.5;
    const f = kind ? [1, 0, -rng.pick([2, 3, 5, 6, 7, 10, 11])] : [1, 0, rng.int(-3, 3) || 1, -rng.int(1, 9)];
    let x = kind ? Math.round(Math.sqrt(-f[2])) || 1 : 1;
    if (polyEval(polyD(f), x) === 0) x += 1;
    const x0 = x;
    const steps: number[] = [];
    for (let i = 0; i < level; i++) { x = x - polyEval(f, x) / polyEval(polyD(f), x); steps.push(x); }
    const answer = fixed(x, 4);
    return {
      body: `Use Newton's Method with ${math(`x_0 = ${x0}`)} to approximate a zero of ${math(`f(x) = ${poly(f)}`)}. Do ${level} iteration${level > 1 ? 's' : ''} and round to four decimal places.`,
      answer: math(`x_${level} approx ${answer}`),
      distractors: wrong(math(`x_${level} approx ${answer}`), [steps.length > 1 ? steps[steps.length - 2] : x0 + polyEval(f, x0) / polyEval(polyD(f), x0), x0 - polyEval(polyD(f), x0) / (polyEval(f, x0) || 1), x + 0.1].map((v) => math(`x_${level} approx ${fixed(v, 4)}`))),
      solution: `${math("x_(n+1) = x_n - f(x_n)/(f'(x_n))")}, with ${math(`f'(x) = ${poly(polyD(f))}`)}: ${steps.map((s, i) => math(`x_${i + 1} approx ${fixed(s, 4)}`)).join(', ')}.`,
    };
  },
});

export const caLimitDerivativeForm = us('ca-limit-derivative-form', {
  levels: { 1: 'Powers', 2: 'Roots and reciprocals', 3: 'Trigonometric and exponential functions' },
  generate(rng, level) {
    let expr: string, value: string, fname: string, wrongs: string[];
    if (level === 1) {
      const a = rng.int(1, 4), n = rng.int(2, 5);
      expr = `((${a} + h)^${n} - ${a ** n})/h`; value = String(n * a ** (n - 1)); fname = `x^${n}`;
      wrongs = [String(a ** n), String(n * a ** n), String((n - 1) * a ** (n - 1))];
    } else if (level === 2) {
      const a = rng.pick([1, 4, 9, 16, 25]);
      if (rng.next() < 0.5) { expr = `(sqrt(${a} + h) - ${Math.sqrt(a)})/h`; value = new Q(1, 2 * Math.sqrt(a)).typst(); fname = 'sqrt(x)'; wrongs = [new Q(1, Math.sqrt(a)).typst(), String(Math.sqrt(a)), '0']; }
      else { const b = rng.int(1, 5); expr = `(1/(${b} + h) - 1/${b})/h`; value = new Q(-1, b * b).typst(); fname = '1/x'; wrongs = [new Q(1, b * b).typst(), new Q(-1, b).typst(), '0']; }
    } else {
      const forms: Array<[string, string, string, string[]]> = [
        ['(sin(pi/6 + h) - 1/2)/h', 'sqrt(3)/2', 'sin x', ['1/2', '0', '-sqrt(3)/2']],
        ['(cos(pi/3 + h) - 1/2)/h', '-sqrt(3)/2', 'cos x', ['sqrt(3)/2', '1/2', '0']],
        ['(e^(2 + h) - e^2)/h', 'e^2', 'e^x', ['2e', '1', 'e']],
        ['(ln(1 + h))/h', '1', 'ln x', ['0', 'e', '"does not exist"']],
        ['(tan(pi/4 + h) - 1)/h', '2', 'tan x', ['1', '0', 'sqrt(2)']],
      ];
      [expr, value, fname, wrongs] = rng.pick(forms);
    }
    return task('Evaluate each limit by recognizing it as a derivative.', 'Evaluate', `lim_(h -> 0) ${expr}`, {
      answer: math(value), distractors: wrong(math(value), wrongs.map(math)),
      solution: `This is the definition of the derivative of ${math(`f(x) = ${fname}`)} at a point, so the limit is that derivative: ${math(value)}.`,
    });
  },
});

export const caLhopital = us('ca-lhopital', {
  levels: { 1: '0/0 with polynomials and sines', 2: 'Exponentials and logarithms', 3: '∞/∞ and repeated use' },
  generate(rng, level) {
    const a = rng.int(2, 7), b = rng.int(2, 7);
    const forms: Array<[string, string, string[], string]> = level === 1
      ? [[`lim_(x -> 0) (sin ${a}x)/(${b}x)`, new Q(a, b).typst(), [new Q(b, a).typst(), '1', '0'], `L'Hôpital: ${math(`lim_(x -> 0) (${a} cos ${a}x)/${b} = ${new Q(a, b).typst()}`)}`],
         [`lim_(x -> ${a}) (x^2 - ${a * a})/(x - ${a})`, String(2 * a), [String(a), '0', String(a * a)], `L'Hôpital: ${math(`lim_(x -> ${a}) (2x)/1 = ${2 * a}`)}`],
         [`lim_(x -> 0) (1 - cos x)/x^2`, '1/2', ['0', '1', '2'], `Apply L'Hôpital twice: ${math('lim_(x -> 0) (sin x)/(2x) = lim_(x -> 0) (cos x)/2 = 1/2')}`]]
      : level === 2
        ? [[`lim_(x -> 0) (e^(${a}x) - 1)/x`, String(a), ['1', '0', `e^${a}`], `L'Hôpital: ${math(`lim_(x -> 0) ${a}e^(${a}x) = ${a}`)}`],
           [`lim_(x -> 1) (ln x)/(x - 1)`, '1', ['0', 'e', 'oo'], `L'Hôpital: ${math('lim_(x -> 1) (1/x)/1 = 1')}`],
           [`lim_(x -> 0) (ln(1 + ${a}x))/x`, String(a), ['1', '0', `ln ${a}`], `L'Hôpital: ${math(`lim_(x -> 0) ${a}/(1 + ${a}x) = ${a}`)}`]]
        : [[`lim_(x -> oo) (ln x)/x`, '0', ['1', 'oo', '"does not exist"'], `L'Hôpital: ${math('lim_(x -> oo) (1/x)/1 = 0')}`],
           [`lim_(x -> oo) x^2/e^x`, '0', ['oo', '1', '2'], `Apply L'Hôpital twice: ${math('lim_(x -> oo) 2/e^x = 0')}`],
           [`lim_(x -> oo) (${a}x^2 + x)/(${b}x^2 - 1)`, new Q(a, b).typst(), ['1', '0', 'oo'], `Apply L'Hôpital twice: ${math(`lim_(x -> oo) ${2 * a}/${2 * b} = ${new Q(a, b).typst()}`)}`]];
    const [expr, value, wr, sol] = rng.pick(forms);
    return task("Evaluate each limit. Use L'Hôpital's Rule where it applies.", 'Evaluate', expr, {
      answer: math(value), distractors: wrong(math(value), wr.map(math)),
      solution: `Direct substitution gives an indeterminate form. ${sol}.`,
    });
  },
});

export const CALCULUS_APPLICATIONS = [
  caTangentLine, caRolle, caMvt, caIncreaseDecrease, caConcavity, caRelativeExtrema, caAbsoluteExtrema, caOptimization,
  caCurveSketching, caGraphicalComparison, caMotion, caRelatedRates, caDifferentials, caNewton, caLimitDerivativeForm, caLhopital,
];
