import type { Rng } from '../../rng.ts';
import { gcd, lcm, monomial, polynomial } from '../../format.ts';

const cx = (k: number, v = 'x') => monomial(k, [[v, 1]]);
import { Q, simplifySqrt } from '../../exact.ts';
import { graphTypst, type Pt } from '../../graph.ts';
import { math, mb10i } from '../pc40s/common.ts';
import { dec, distinct, pt } from './shared.ts';
import { optNum, optOne, radioOption, sizeOption } from '../../options.ts';
import { grid, yEquals } from './relations.ts';

// ── Linear forms ──────────────────────────────────────────────────────────

/** Ax + By + C = 0 for y = mx + b, with integers, A > 0 (or B > 0 when A = 0) and no common factor. */
function generalCoefs(m: Q, b: Q): [number, number, number] {
  const L = lcm(m.d, b.d);
  let A = m.n * (L / m.d), B = -L, C = b.n * (L / b.d);
  const g = gcd(gcd(A, B), C) || 1;
  A /= g; B /= g; C /= g;
  if (A < 0 || (A === 0 && B < 0)) { A = -A; B = -B; C = -C; }
  return [A, B, C];
}
const generalText = ([A, B, C]: [number, number, number]) => `${polynomial([{ coef: A, powers: [['x', 1]] }, { coef: B, powers: [['y', 1]] }, { coef: C }])} = 0`;
const general = (m: Q, b: Q) => generalText(generalCoefs(m, b));
/** y − y1 = m(x − x1), with zero coordinates dropped: `y + 3 = -2(x - 1)`, `y = 1/2 (x + 4)`. */
function slopePoint(m: Q, x1: number, y1: number): string {
  const left = y1 === 0 ? 'y' : `y ${y1 < 0 ? '+' : '-'} ${Math.abs(y1)}`;
  const inner = x1 === 0 ? 'x' : `(x ${x1 < 0 ? '+' : '-'} ${Math.abs(x1)})`;
  const coef = m.eq(1) ? '' : m.eq(-1) ? '-' : m.isInt ? String(m.n) : `${m.typst()} `;
  return `${left} = ${coef}${inner}`.replace(/ = (-?)x$/, ' = $1x');
}
function randomSlope(rng: Rng, fractional: boolean): Q {
  if (!fractional) return new Q(rng.nonZero(-5, 5));
  for (;;) { const q = new Q(rng.nonZero(-5, 5), rng.int(2, 5)); if (!q.isInt) return q; }
}
/** A line with slope m through a lattice point, and its intercept. */
function lineThrough(rng: Rng, m: Q, lim = 5): { x1: number; y1: number; b: Q } {
  const x1 = rng.int(-lim, lim) * (m.isInt ? 1 : 1), y1 = rng.int(-lim, lim);
  return { x1, y1, b: new Q(y1).sub(m.mul(x1)) };
}

export const formSlopeIntercept = mb10i('10i-form-slope-intercept', {
  levels: { 1: 'From general form with B = ±1', 2: 'From general form', 3: 'From slope–point form' },
  options: [
    radioOption('form', 'Starting form', [['1', 'From general form with B = ±1'], ['2', 'From general form'], ['3', 'From slope–point form']], ['1', '2', '3']),
    sizeOption([5, 9, 12], [9, 9, 9], 'Size of the y-intercept'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const m = randomSlope(rng, difficulty > 1), N = optNum(o, 'size', 9), b = difficulty === 1 ? new Q(rng.int(-N, N)) : new Q(rng.int(-N, N), m.d);
    const from = difficulty === 3 ? (() => { const { x1, y1 } = lineThrough(rng, m); return { text: slopePoint(m, x1, y1), b: new Q(y1).sub(m.mul(x1)) }; })() : { text: general(m, b), b };
    const answer = yEquals(m, from.b);
    return {
      body: `Write ${math(from.text)} in slope–intercept form.`,
      answer: math(answer),
      distractors: distinct(math(answer), [yEquals(m.neg(), from.b), yEquals(m, from.b.neg()), yEquals(new Q(m.d, m.n), from.b), yEquals(m.neg(), from.b.neg())].map(math)),
      solution: difficulty === 3 ? `Distribute and isolate ${math('y')}: ${math(answer)}.` : `Isolate ${math('y')}: move the other terms across and divide by the coefficient of ${math('y')}. ${math(answer)}.`,
    };
  },
});

export const formGeneral = mb10i('10i-form-general', {
  levels: { 1: 'From y = mx + b, integer slope', 2: 'Fractional slope', 3: 'From slope–point form' },
  options: [
    radioOption('form', 'Starting form', [['1', 'From y = mx + b, integer slope'], ['2', 'Fractional slope'], ['3', 'From slope–point form']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const m = randomSlope(rng, difficulty > 1);
    const { x1, y1, b } = lineThrough(rng, m);
    const start = difficulty === 3 ? slopePoint(m, x1, y1) : yEquals(m, b);
    const [A, B, C] = generalCoefs(m, b);
    const answer = generalText([A, B, C]);
    return {
      body: `Write ${math(start)} in general form, ${math('A x + B y + C = 0')}.`,
      answer: math(answer),
      distractors: distinct(math(answer), [generalText([A, -B, C]), generalText([A, B, -C]), generalText([B < 0 ? -B : B, A === 0 ? 1 : -A, C]), `${polynomial([{ coef: A, powers: [['x', 1]] }, { coef: B, powers: [['y', 1]] }])} = ${C}`].map(math)),
      solution: `Move every term to one side, clear fractions, and make ${math('A')} positive: ${math(answer)}.`,
    };
  },
});

export const formSlopePoint = mb10i('10i-form-slope-point', {
  levels: { 1: 'Read the slope and point', 2: 'Read them with signs to watch', 3: 'Write slope–point form' },
  options: [
    radioOption('form', 'Task', [['1', 'Read the slope and point'], ['2', 'Read them with signs to watch'], ['3', 'Write slope–point form']], ['1', '2', '3']),
    sizeOption([4, 6, 9], [6, 6, 6], 'Size of the point'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const m = randomSlope(rng, difficulty === 2), x1 = rng.nonZero(-optNum(o, 'size', 6), optNum(o, 'size', 6)), y1 = rng.nonZero(-optNum(o, 'size', 6), optNum(o, 'size', 6));
    if (difficulty === 3) {
      const answer = slopePoint(m, x1, y1);
      return {
        body: `Write an equation in slope–point form for the line through ${math(pt(x1, y1))} with slope ${math(m.typst())}.`,
        answer: math(answer),
        distractors: distinct(math(answer), [slopePoint(m, -x1, -y1), slopePoint(m, y1, x1), slopePoint(m.neg(), x1, y1), slopePoint(m, x1, -y1)].map(math)),
        solution: `Substitute into ${math('y - y_1 = m(x - x_1)')}: ${math(answer)}.`,
      };
    }
    const eq = slopePoint(m, x1, y1);
    const answer = `m = ${m.typst()}, ${pt(x1, y1)}`;
    return {
      body: `State the slope and a point on the line ${math(eq)}.`,
      answer: math(answer),
      distractors: distinct(math(answer), [`m = ${m.typst()}, ${pt(-x1, -y1)}`, `m = ${m.typst()}, ${pt(y1, x1)}`, `m = ${m.neg().typst()}, ${pt(x1, y1)}`, `m = ${m.typst()}, ${pt(-x1, y1)}`].map(math)),
      solution: `Compare with ${math('y - y_1 = m(x - x_1)')}: ${math(`m = ${m.typst()}`)}, ${math(`x_1 = ${x1}`)}, ${math(`y_1 = ${y1}`)}. The signs in the equation are opposite to the coordinates.`,
    };
  },
});

export const formFeatures = mb10i('10i-form-features', {
  levels: { 1: 'Slope from general form', 2: 'y-intercept from general form', 3: 'Both intercepts' },
  options: [
    radioOption('form', 'Ask for', [['1', 'Slope from general form'], ['2', 'y-intercept from general form'], ['3', 'Both intercepts']], ['1', '2', '3']),
    sizeOption([4, 6, 9], [6, 6, 6], 'Size of the coefficients'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const N = optNum(o, 'size', 6);
    let A = rng.nonZero(-N, N), B = rng.nonZero(-N, N);
    const C = rng.nonZero(-2 * N, 2 * N);
    if (gcd(gcd(A, B), C) !== 1) return formFeatures.generate(rng, difficulty, o);
    if (A < 0) { A = -A; B = -B; }
    const eq = generalText([A, B, C]);
    const m = new Q(-A, B), b = new Q(-C, B), xi = new Q(-C, A);
    if (difficulty === 1) {
      return {
        body: `Find the slope of ${math(eq)}.`,
        answer: math(m.typst()),
        distractors: distinct(math(m.typst()), [new Q(A, B).typst(), new Q(-B, A).typst(), new Q(B, A).typst(), String(A)].map(math)),
        solution: `Solve for ${math('y')}: ${math(yEquals(m, b))}. The slope is ${math(`-A/B = ${m.typst()}`)}.`,
      };
    }
    if (difficulty === 2) {
      return {
        body: `Find the y-intercept of ${math(eq)}.`,
        answer: math(b.typst()),
        distractors: distinct(math(b.typst()), [b.neg().typst(), xi.typst(), String(C), new Q(-C, A + B || 1).typst()].map(math)),
        solution: `Set ${math('x = 0')}: ${math(`${cx(B, 'y')} ${C < 0 ? '-' : '+'} ${Math.abs(C)} = 0`)}, so ${math(`y = ${b.typst()}`)}.`,
      };
    }
    const answer = `x"-int" ${xi.typst()}, y"-int" ${b.typst()}`;
    return {
      body: `Find the x- and y-intercepts of ${math(eq)}.`,
      answer: math(answer),
      distractors: distinct(math(answer), [`x"-int" ${b.typst()}, y"-int" ${xi.typst()}`, `x"-int" ${xi.neg().typst()}, y"-int" ${b.neg().typst()}`, `x"-int" ${new Q(A, -C).typst()}, y"-int" ${b.typst()}`].map(math)),
      solution: `${math('y = 0')} gives ${math(`x = ${xi.typst()}`)}; ${math('x = 0')} gives ${math(`y = ${b.typst()}`)}.`,
    };
  },
});

export const formEquivalent = mb10i('10i-form-equivalent', {
  points: 1,
  levels: { 1: 'Integer slope', 2: 'Fractional slope', 3: 'Across all three forms' },
  options: [
    radioOption('form', 'Forms', [['1', 'Integer slope'], ['2', 'Fractional slope'], ['3', 'Across all three forms']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const m = randomSlope(rng, difficulty > 1), { x1, y1, b } = lineThrough(rng, m);
    const given = yEquals(m, b);
    const correct = difficulty === 3 ? rng.pick([general(m, b), slopePoint(m, x1, y1)]) : general(m, b);
    const wrongs = [general(m.neg(), b), general(m, b.neg()), difficulty === 3 ? slopePoint(m, -x1, -y1) : general(new Q(m.d, m.n), b), slopePoint(m.neg(), x1, y1)];
    return {
      body: `Which equation is equivalent to ${math(given)}?`,
      answer: math(correct),
      distractors: distinct(math(correct), wrongs.map(math)),
      solution: `Rearrange ${math(correct)} into slope–intercept form to get ${math(given)}.`,
    };
  },
});

function lineGraph(m: Q | null, b: number, size: number, x0 = 0): string {
  return m === null ? grid([{ points: [[x0, -8], [x0, 8]] as Pt[] }], size) : grid([{ f: (x) => m.value * x + b }], size);
}

export const formGraph = mb10i('10i-form-graph', {
  levels: { 1: 'Slope–intercept form', 2: 'Slope–point form', 3: 'General form' },
  options: [
    radioOption('form', 'Form', [['1', 'Slope–intercept form'], ['2', 'Slope–point form'], ['3', 'General form']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const m = randomSlope(rng, rng.next() < 0.5);
    const b = rng.int(-5, 5);
    const x1 = rng.int(-3, 3), y1 = m.value * x1 + b;
    const eq = difficulty === 1 ? yEquals(m, new Q(b)) : difficulty === 2 && Number.isInteger(y1) ? slopePoint(m, x1, y1) : general(m, new Q(b));
    return {
      body: `Which graph shows ${math(eq)}?`,
      answer: lineGraph(m, b, 3.4),
      distractors: [lineGraph(m.neg(), b, 3.4), lineGraph(m, -b || 2, 3.4), lineGraph(new Q(m.d, m.n), b, 3.4)],
      solution: `In slope–intercept form this is ${math(yEquals(m, new Q(b)))}: start at ${math(pt(0, b))} and use the slope ${math(m.typst())}.`,
    };
  },
});

export const formMatchGraph = mb10i('10i-form-match-graph', {
  levels: { 1: 'Slope–intercept choices', 2: 'Slope–point choices', 3: 'General form choices' },
  options: [
    radioOption('form', 'Form', [['1', 'Slope–intercept choices'], ['2', 'Slope–point choices'], ['3', 'General form choices']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const m = randomSlope(rng, difficulty > 1 && rng.next() < 0.6), b = rng.int(-5, 5);
    const B = new Q(b);
    const write = (mm: Q, bb: Q) => (difficulty === 1 ? yEquals(mm, bb) : difficulty === 2 ? slopePoint(mm, mm.d, bb.add(mm.mul(mm.d)).value) : general(mm, bb));
    const answer = write(m, B);
    return {
      body: `Which equation matches the graph?\n\n${lineGraph(m, b, 4.2)}`,
      answer: math(answer),
      distractors: distinct(math(answer), [write(m.neg(), B), write(m, B.neg().eq(B) ? B.add(2) : B.neg()), write(new Q(m.d, m.n), B)].map(math)),
      solution: `The y-intercept is ${b} and the slope is ${math(m.typst())}, so the line is ${math(yEquals(m, B))}${difficulty > 1 ? `, which is ${math(answer)}` : ''}.`,
    };
  },
});

// ── Equations of lines ────────────────────────────────────────────────────

export const eqFromGraph = mb10i('10i-eq-from-graph', {
  levels: { 1: 'Integer slope', 2: 'Fractional slope', 3: 'Horizontal and vertical lines, or general form' },
  options: [
    radioOption('form', 'Line', [['1', 'Integer slope'], ['2', 'Fractional slope'], ['3', 'Horizontal and vertical lines, or general form']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    if (difficulty === 3 && rng.next() < 0.4) {
      const c = rng.nonZero(-6, 6), vertical = rng.next() < 0.5;
      const answer = vertical ? `x = ${c}` : `y = ${c}`;
      return {
        body: `Write the equation of the line.\n\n${vertical ? lineGraph(null, 0, 4.2, c) : lineGraph(new Q(0), c, 4.2)}`,
        answer: math(answer),
        distractors: [vertical ? `y = ${c}` : `x = ${c}`, `y = ${cx(c)}`, `x = ${-c}`, `y = ${-c}`].filter((d) => d !== answer).map(math),
        solution: vertical ? `Every point has x-coordinate ${c}.` : `Every point has y-coordinate ${c}; the slope is 0.`,
      };
    }
    const m = randomSlope(rng, difficulty > 1), b = rng.int(-5, 5);
    const answer = difficulty === 3 ? general(m, new Q(b)) : yEquals(m, new Q(b));
    const write = (mm: Q, bb: Q) => (difficulty === 3 ? general(mm, bb) : yEquals(mm, bb));
    return {
      body: `Write the equation of the line${difficulty === 3 ? ' in general form' : ''}.\n\n${grid([{ f: (x) => m.value * x + b }], 4.2, { dots: [{ x: 0, y: b }, { x: m.d, y: b + m.n }] })}`,
      answer: math(answer),
      distractors: distinct(math(answer), [write(m.neg(), new Q(b)), write(new Q(m.d, m.n), new Q(b)), write(m, new Q(-b || 1)), write(new Q(b || 1), m)].map(math)),
      solution: `The y-intercept is ${b}; from ${math(pt(0, b))} to ${math(pt(m.d, b + m.n))} the slope is ${math(m.typst())}. ${math(yEquals(m, new Q(b)))}${difficulty === 3 ? `, or ${math(answer)}` : ''}.`,
    };
  },
});

export const eqPointSlope = mb10i('10i-eq-point-slope', {
  levels: { 1: 'Integer slope, slope–intercept form', 2: 'Fractional slope', 3: 'Answer in general form' },
  options: [
    radioOption('form', 'Slope and answer', [['1', 'Integer slope, slope–intercept form'], ['2', 'Fractional slope'], ['3', 'Answer in general form']], ['1', '2', '3']),
    sizeOption([4, 6, 9], [6, 6, 6], 'Size of the point'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const m = randomSlope(rng, difficulty > 1), x1 = rng.int(-optNum(o, 'size', 6), optNum(o, 'size', 6)), y1 = rng.int(-optNum(o, 'size', 6), optNum(o, 'size', 6));
    const b = new Q(y1).sub(m.mul(x1));
    const write = (mm: Q, bb: Q) => (difficulty === 3 ? general(mm, bb) : yEquals(mm, bb));
    const answer = write(m, b);
    return {
      body: `Write the equation of the line through ${math(pt(x1, y1))} with slope ${math(m.typst())}${difficulty === 3 ? ', in general form' : ''}.`,
      answer: math(answer),
      distractors: distinct(math(answer), [write(m, new Q(y1).add(m.mul(x1))), write(m, new Q(y1)), write(m.neg(), new Q(y1).add(m.mul(x1))), write(m, new Q(x1).sub(m.mul(y1)))].map(math)),
      solution: `${math(slopePoint(m, x1, y1))}. Solve for ${math('y')}: ${math(yEquals(m, b))}${difficulty === 3 ? `, so ${math(answer)}` : ''}.`,
    };
  },
});

export const eqParallelPerpendicular = mb10i('10i-eq-parallel-perpendicular', {
  levels: { 1: 'Parallel to y = mx + b', 2: 'Perpendicular to y = mx + b', 3: 'To a line in general form' },
  options: [
    radioOption('form', 'Relationship', [['1', 'Parallel to y = mx + b'], ['2', 'Perpendicular to y = mx + b'], ['3', 'To a line in general form']], ['1', '2', '3']),
    sizeOption([3, 5, 8], [5, 5, 5], 'Size of the point'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const m0 = randomSlope(rng, rng.next() < 0.5), b0 = new Q(rng.int(-6, 6));
    const kind = difficulty === 1 ? 'parallel' : difficulty === 2 ? 'perpendicular' : rng.pick(['parallel', 'perpendicular'] as const);
    const m = kind === 'parallel' ? m0 : new Q(-m0.d, m0.n);
    const x1 = rng.int(-optNum(o, 'size', 5), optNum(o, 'size', 5)), y1 = rng.int(-optNum(o, 'size', 5), optNum(o, 'size', 5));
    const b = new Q(y1).sub(m.mul(x1));
    const given = difficulty === 3 ? general(m0, b0) : yEquals(m0, b0);
    const answer = yEquals(m, b);
    const other = kind === 'parallel' ? new Q(-m0.d, m0.n) : m0;
    return {
      body: `Write the equation of the line through ${math(pt(x1, y1))} that is ${kind} to ${math(given)}. Give it in slope–intercept form.`,
      answer: math(answer),
      distractors: distinct(math(answer), [yEquals(other, new Q(y1).sub(other.mul(x1))), yEquals(m.neg(), new Q(y1).add(m.mul(x1))), yEquals(new Q(m0.d, m0.n), new Q(y1).sub(new Q(m0.d, m0.n).mul(x1))), yEquals(m, b0)].map(math)),
      solution: `${difficulty === 3 ? `The given line has slope ${math(m0.typst())}. ` : ''}A ${kind} line has slope ${math(m.typst())}. Through ${math(pt(x1, y1))}: ${math(slopePoint(m, x1, y1))}, so ${math(answer)}.`,
    };
  },
});

export const eqContext = mb10i('10i-eq-context', {
  levels: { 1: 'Equation from a rate and a start value', 2: 'Equation from two data points', 3: 'Predict with the equation' },
  options: [
    radioOption('form', 'Given', [['1', 'Equation from a rate and a start value'], ['2', 'Equation from two data points'], ['3', 'Predict with the equation']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const rate = rng.int(2, 9), start = rng.int(5, 30);
    const w1 = rng.int(1, 4), w2 = w1 + rng.int(2, 6);
    const h1 = start + rate * w1, h2 = start + rate * w2;
    if (difficulty === 1) {
      return {
        body: `${rng.pick(['A plant', 'A sunflower', 'A tomato plant', 'A bean plant', 'A bamboo shoot'])} is ${start} cm tall and grows ${rate} cm per week. Write an equation for its height ${math('h')} after ${math('w')} weeks.`,
        answer: math(`h = ${rate}w + ${start}`),
        distractors: [`h = ${start}w + ${rate}`, `h = ${rate + start}w`, `h = ${rate}(w + ${start})`].map(math),
        solution: `The growth rate is the slope and the starting height is the intercept: ${math(`h = ${rate}w + ${start}`)}.`,
      };
    }
    const eq = `h = ${rate}w + ${start}`;
    if (difficulty === 2) {
      return {
        body: `${rng.pick(['A plant', 'A sunflower', 'A tomato plant', 'A bean plant', 'A bamboo shoot'])} is ${h1} cm tall after ${w1} ${w1 === 1 ? 'week' : 'weeks'} and ${h2} cm tall after ${w2} weeks, growing at a steady rate. Write an equation for its height ${math('h')} after ${math('w')} weeks.`,
        answer: math(eq),
        distractors: distinct(math(eq), [`h = ${rate}w + ${h1}`, `h = ${dec(h2 / w2, 2)}w`, `h = ${start}w + ${rate}`].map(math)),
        solution: `Slope: ${math(`(${h2} - ${h1})/(${w2} - ${w1}) = ${rate}`)}. Then ${math(`${h1} = ${rate}(${w1}) + b`)}, so ${math(`b = ${start}`)}: ${math(eq)}.`,
      };
    }
    const target = w2 + rng.int(3, 10);
    return {
      body: `${rng.pick(['A plant', 'A sunflower', 'A tomato plant', 'A bean plant', 'A bamboo shoot'])} is ${h1} cm tall after ${w1} ${w1 === 1 ? 'week' : 'weeks'} and ${h2} cm tall after ${w2} weeks, growing at a steady rate. Predict its height after ${target} weeks.`,
      answer: `${start + rate * target} cm`,
      distractors: distinct(`${start + rate * target} cm`, [`${rate * target} cm`, `${h1 + rate * target} cm`, `${Math.round((h2 / w2) * target)} cm`]),
      solution: `The equation is ${math(eq)}. At ${math(`w = ${target}`)}: ${math(`${rate}(${target}) + ${start} = ${start + rate * target}`)} cm.`,
    };
  },
});

export const eqScatterplot = mb10i('10i-eq-scatterplot', {
  levels: { 1: 'Describe the correlation', 2: 'Choose the line of best fit', 3: 'Use the line of best fit to predict' },
  options: [
    radioOption('form', 'Task', [['1', 'Describe the correlation'], ['2', 'Choose the line of best fit'], ['3', 'Use the line of best fit to predict']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const kind = difficulty === 1 ? rng.pick(['strong positive', 'strong negative', 'weak positive', 'none'] as const) : rng.pick(['strong positive', 'strong negative'] as const);
    const m = kind.includes('negative') ? -rng.pick([0.5, 0.75, 1]) : rng.pick([0.5, 0.75, 1, 1.5]);
    const b = kind.includes('negative') ? rng.int(8, 11) : rng.int(0, 3);
    const noise = kind.startsWith('strong') ? 0.6 : kind === 'none' ? 0 : 2.2;
    // Keep x where the trend stays inside the window.
    const xMax = m < 0 ? Math.min(11.5, (b - 1) / -m) : Math.min(11.5, (11 - b) / m);
    const pts = Array.from({ length: 14 }, () => {
      const x = kind === 'none' ? rng.int(5, 115) / 10 : 0.8 + rng.next() * (xMax - 0.8);
      const y = kind === 'none' ? rng.int(10, 110) / 10 : m * x + b + (rng.next() * 2 - 1) * noise;
      return { x, y: Math.max(0.3, Math.min(11.7, y)) };
    });
    const plot = graphTypst({ xMin: 0, xMax: 12, yMin: 0, yMax: 12, xLabelStep: 2, yLabelStep: 2, width: 4.8, height: 4.8, dots: pts });
    if (difficulty === 1) {
      const label = { 'strong positive': 'Strong positive correlation', 'strong negative': 'Strong negative correlation', 'weak positive': 'Weak positive correlation', none: 'No correlation' }[kind];
      return {
        body: `Describe the correlation shown in the scatterplot.\n\n${plot}`,
        answer: label,
        distractors: ['Strong positive correlation', 'Strong negative correlation', 'Weak positive correlation', 'No correlation'].filter((d) => d !== label),
        solution: `${kind === 'none' ? 'The points show no trend.' : `The points ${m > 0 ? 'rise' : 'fall'} from left to right${kind.startsWith('strong') ? ', close to a line' : ', but are widely scattered'}.`}`,
      };
    }
    const fit = (mm: number, bb: number) => `y = ${dec(mm)}x ${bb < 0 ? '-' : '+'} ${dec(Math.abs(bb))}`.replace(/= 1x/, '= x').replace(/= -1x/, '= -x').replace(/ \+ 0$/, '');
    if (difficulty === 2) {
      return {
        body: `Which equation best fits the data?\n\n${plot}`,
        answer: math(fit(m, b)),
        distractors: distinct(math(fit(m, b)), [fit(-m, b), fit(m, b + (m > 0 ? 5 : -5)), fit(m * 3, b)].map(math)),
        solution: `The line should follow the trend: slope about ${dec(m)} and y-intercept about ${b}. ${math(fit(m, b))} passes through the middle of the points.`,
      };
    }
    const x = Math.max(1, Math.round(xMax * rng.pick([0.4, 0.6, 0.8])));
    const y = m * x + b;
    return {
      body: `The line of best fit for the data is ${math(fit(m, b))}. Predict ${math('y')} when ${math(`x = ${x}`)}.\n\n${plot}`,
      answer: math(`y approx ${dec(y, 2)}`),
      distractors: distinct(math(`y approx ${dec(y, 2)}`), [dec(m * x - b, 2), dec((x - b) / m, 2), dec(m + x + b, 2)].map((v) => math(`y approx ${v}`))),
      solution: `${math(`y = ${dec(m)}(${x}) ${b < 0 ? '-' : '+'} ${Math.abs(b)} = ${dec(y, 2)}`)}.`,
    };
  },
});

// ── Function notation ─────────────────────────────────────────────────────

const fText = (a: number, b: number, name = 'f') => `${name}(x) = ${polynomial([{ coef: a, powers: [['x', 1]] }, { coef: b }])}`;

export const fnotEvaluate = mb10i('10i-fnot-evaluate', {
  points: 1,
  levels: { 1: 'f(a) for a number', 2: 'Negative and fractional inputs', 3: 'Combinations like f(2) − f(−1)' },
  options: [
    radioOption('form', 'Input', [['1', 'f(a) for a number'], ['2', 'Negative and fractional inputs'], ['3', 'Combinations like f(2) − f(−1)']], ['1', '2', '3']),
    sizeOption([4, 6, 9], [6, 6, 6], 'Size of the slope'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const a = rng.nonZero(-optNum(o, 'size', 6), optNum(o, 'size', 6)), b = rng.int(-9, 9);
    const f = (x: Q) => x.mul(a).add(b);
    if (difficulty === 3) {
      const p = rng.int(-4, 5), q = rng.int(-4, 5);
      const v = f(new Q(p)).sub(f(new Q(q)));
      return {
        body: `For ${math(fText(a, b))}, find ${math(`f(${p}) - f(${q})`)}.`,
        answer: math(v.typst()),
        distractors: distinct(math(v.typst()), [f(new Q(p - q)).typst(), f(new Q(p)).add(f(new Q(q))).typst(), String(a * (p + q)), String(v.value + 2 * b)].map(math)),
        solution: `${math(`f(${p}) = ${f(new Q(p)).typst()}`)} and ${math(`f(${q}) = ${f(new Q(q)).typst()}`)}, so the difference is ${math(v.typst())}.`,
      };
    }
    const x = difficulty === 1 ? new Q(rng.int(0, 8)) : rng.next() < 0.5 ? new Q(-rng.int(1, 8)) : new Q(rng.nonZero(-5, 5), 2);
    const v = f(x);
    return {
      body: `For ${math(fText(a, b))}, find ${math(`f(${x.typst()})`)}.`,
      answer: math(v.typst()),
      distractors: distinct(math(v.typst()), [x.mul(a).sub(b).typst(), x.neg().mul(a).add(b).typst(), x.add(a).add(b).typst(), x.mul(a).typst()].map(math)),
      // Always bracket the substituted value: 6(3), not 63.
      solution: `${math(`f(${x.typst()}) = ${a}(${x.typst()})${b === 0 ? '' : ` ${b < 0 ? '-' : '+'} ${Math.abs(b)}`} = ${v.typst()}`)}.`,
    };
  },
});

export const fnotSolve = mb10i('10i-fnot-solve', {
  points: 1,
  levels: { 1: 'Whole-number answers', 2: 'Fractional answers', 3: 'Solve f(x) = g(x)' },
  options: [
    radioOption('form', 'Answer', [['1', 'Whole-number answers'], ['2', 'Fractional answers'], ['3', 'Solve f(x) = g(x)']], ['1', '2', '3']),
    sizeOption([4, 6, 9], [6, 6, 6], 'Size of the slope'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const a = rng.nonZero(-optNum(o, 'size', 6), optNum(o, 'size', 6)), b = rng.int(-9, 9);
    if (difficulty === 3) {
      let c = rng.nonZero(-6, 6);
      while (c === a) c = rng.nonZero(-6, 6);
      const x = rng.int(-5, 5), d = a * x + b - c * x;
      return {
        body: `For ${math(fText(a, b))} and ${math(fText(c, d, 'g'))}, find ${math('x')} so that ${math('f(x) = g(x)')}.`,
        answer: math(`x = ${x}`),
        distractors: distinct(math(`x = ${x}`), [`x = ${-x}`, `x = ${new Q(d + b, a - c || 1).typst()}`, `x = ${a * x + b}`].map(math)),
        solution: `${math(`${a}x ${b < 0 ? '-' : '+'} ${Math.abs(b)} = ${c}x ${d < 0 ? '-' : '+'} ${Math.abs(d)}`)} gives ${math(`${a - c}x = ${d - b}`)}, so ${math(`x = ${x}`)}.`.replace(/\$1x/g, '$x').replace(/ 1x/g, ' x').replace(/-1x/g, '-x'),
      };
    }
    const x = difficulty === 1 ? new Q(rng.int(-8, 8)) : new Q(rng.nonZero(-9, 9), Math.abs(a) > 1 ? Math.abs(a) : 2);
    const target = x.mul(a).add(b);
    return {
      body: `For ${math(fText(a, b))}, find ${math('x')} when ${math(`f(x) = ${target.typst()}`)}.`,
      answer: math(`x = ${x.typst()}`),
      distractors: distinct(math(`x = ${x.typst()}`), [target.mul(a).add(b).typst(), target.add(b).div(a).typst(), target.sub(b).div(-a).typst(), target.sub(b).typst()].map((v) => math(`x = ${v}`))),
      solution: `${math(`${polynomial([{ coef: a, powers: [['x', 1]] }, { coef: b }])} = ${target.typst()}`)}, so ${a === 1 ? math(`x = ${x.typst()}`) : `${math(`${a}x = ${target.sub(b).typst()}`).replace('$-1x', '$-x')} and ${math(`x = ${x.typst()}`)}`}.`,
    };
  },
});

export const fnotConvert = mb10i('10i-fnot-convert', {
  points: 1,
  levels: { 1: 'Equation to function notation', 2: 'Function notation to an equation', 3: 'A value as an ordered pair' },
  options: [
    radioOption('form', 'Convert', [['1', 'Equation to function notation'], ['2', 'Function notation to an equation'], ['3', 'A value as an ordered pair']], ['1', '2', '3']),
    sizeOption([4, 6, 9], [6, 6, 6], 'Size of the slope'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const a = rng.nonZero(-optNum(o, 'size', 6), optNum(o, 'size', 6)), b = rng.int(-9, 9);
    const rhs = polynomial([{ coef: a, powers: [['x', 1]] }, { coef: b }]);
    if (difficulty === 3) {
      const p = rng.int(-6, 6), q = a * p + b;
      return {
        body: `For a function, ${math(`f(${p}) = ${q}`)}. Which point is on the graph of ${math('y = f(x)')}?`,
        answer: math(pt(p, q)),
        distractors: distinct(math(pt(p, q)), [pt(q, p), pt(0, q), pt(p, 0), pt(-p, q)].map(math)),
        solution: `${math(`f(${p}) = ${q}`)} means ${math(`y = ${q}`)} when ${math(`x = ${p}`)}: the point ${math(pt(p, q))}.`,
      };
    }
    if (difficulty === 1) {
      return {
        body: `Write ${math(`y = ${rhs}`)} in function notation.`,
        answer: math(`f(x) = ${rhs}`),
        distractors: [`f(y) = ${rhs}`, `f(x) = y`, `x = f(${rhs})`].map(math),
        solution: `Replace ${math('y')} with ${math('f(x)')}: ${math(`f(x) = ${rhs}`)}.`,
      };
    }
    return {
      body: `Write ${math(`f(x) = ${rhs}`)} as an equation in ${math('x')} and ${math('y')}.`,
      answer: math(`y = ${rhs}`),
      distractors: [`x = ${rhs}`, `y = f(${rhs})`, `f(y) = ${rhs}`].map(math),
      solution: `${math('f(x)')} is the y-value: ${math(`y = ${rhs}`)}.`,
    };
  },
});

export const fnotGraph = mb10i('10i-fnot-graph', {
  points: 1,
  levels: { 1: 'Read f(a)', 2: 'Find x when f(x) = k', 3: 'Combine values' },
  options: [
    radioOption('form', 'Task', [['1', 'Read f(a)'], ['2', 'Find x when f(x) = k'], ['3', 'Combine values']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const m = rng.pick([new Q(1), new Q(-1), new Q(2), new Q(-2), new Q(1, 2), new Q(-1, 2)]), b = rng.int(-4, 4);
    const f = (x: number) => m.value * x + b;
    const xs = [-6, -4, -2, 0, 2, 4, 6].filter((x) => Math.abs(f(x)) <= 7);
    const graph = grid([{ f }], 4.5);
    if (difficulty === 2) {
      const x = rng.pick(xs), k = f(x);
      return {
        body: `The graph of ${math('y = f(x)')} is shown. Find ${math('x')} when ${math(`f(x) = ${k}`)}.\n\n${graph}`,
        answer: math(`x = ${x}`),
        distractors: distinct(math(`x = ${x}`), [`x = ${k}`, `x = ${f(k)}`, `x = ${-x}`, `x = ${x + 2}`].map(math)),
        solution: `Find ${math(`y = ${k}`)} on the graph and read across to ${math(`x = ${x}`)}.`,
      };
    }
    if (difficulty === 3) {
      const [p, q] = rng.shuffle(xs).slice(0, 2);
      const v = f(p) + f(q);
      return {
        body: `The graph of ${math('y = f(x)')} is shown. Find ${math(`f(${p}) + f(${q})`)}.\n\n${graph}`,
        answer: math(String(v)),
        distractors: distinct(math(String(v)), [String(f(p + q)), String(p + q), String(f(p) - f(q)), String(v + 1)].map(math)),
        solution: `${math(`f(${p}) = ${f(p)}`)} and ${math(`f(${q}) = ${f(q)}`)}, so the sum is ${v}.`,
      };
    }
    const x = rng.pick(xs);
    return {
      body: `The graph of ${math('y = f(x)')} is shown. Find ${math(`f(${x})`)}.\n\n${graph}`,
      answer: math(String(f(x))),
      distractors: distinct(math(String(f(x))), [String(x), String(-f(x)), String(f(x) + 1), String(f(-x))].map(math)),
      solution: `Go to ${math(`x = ${x}`)} and read the y-value: ${math(`f(${x}) = ${f(x)}`)}.`,
    };
  },
});

export const fnotContext = mb10i('10i-fnot-context', {
  levels: { 1: 'Evaluate in a context', 2: 'Solve in a context', 3: 'Interpret a statement' },
  options: [
    radioOption('form', 'Task', [['1', 'Evaluate in a context'], ['2', 'Solve in a context'], ['3', 'Interpret a statement']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const per = rng.pick([0.5, 0.75, 1.25, 2]), fixed = rng.pick([10, 12, 15, 25]);
    const def = `${math(`C(n) = ${dec(per)}n + ${fixed}`)}`;
    if (difficulty === 1) {
      const n = rng.int(10, 80);
      return {
        body: `The cost in dollars ${rng.pick(['to print', 'to make', 'to order', 'to print and ship'])} ${math('n')} ${rng.pick(['posters', 'T-shirts', 'mugs', 'team hoodies', 'yearbooks'])} is ${def}. Find ${math(`C(${n})`)}.`,
        answer: `\\$${(per * n + fixed).toFixed(2)}`,
        distractors: distinct(`\\$${(per * n + fixed).toFixed(2)}`, [`\\$${(per * n).toFixed(2)}`, `\\$${(fixed * n + per).toFixed(2)}`, `\\$${((n - fixed) / per).toFixed(2)}`]),
        solution: `${math(`C(${n}) = ${dec(per)}(${n}) + ${fixed} = ${dec(per * n + fixed, 2)}`)}.`,
      };
    }
    if (difficulty === 2) {
      const n = rng.int(10, 80), cost = per * n + fixed;
      return {
        body: `The cost in dollars to print ${math('n')} posters is ${def}. How many posters cost \\$${cost.toFixed(2)}?`,
        answer: `${n} posters`,
        distractors: distinct(`${n} posters`, [`${Math.round(cost / per)} posters`, `${Math.round(per * cost + fixed)} posters`, `${Math.round((cost + fixed) / per)} posters`]),
        solution: `Solve ${math(`${dec(per)}n + ${fixed} = ${dec(cost, 2)}`)}: ${math(`n = (${dec(cost, 2)} - ${fixed})/${dec(per)} = ${n}`)}.`,
      };
    }
    const n = rng.int(10, 60), cost = per * n + fixed;
    return {
      body: `The cost in dollars to print ${math('n')} posters is ${def}. What does ${math(`C(${n}) = ${dec(cost, 2)}`)} mean?`,
      answer: `Printing ${n} posters costs \\$${cost.toFixed(2)}.`,
      distractors: [`Printing ${dec(cost, 2)} posters costs \\$${n}.`, `Each poster costs \\$${dec(cost / n, 2)} plus \\$${fixed}.`, `\\$${n} buys ${dec(cost, 2)} posters.`],
      solution: `The input ${math('n')} is the number of posters and the output ${math('C(n)')} is the cost: ${n} posters cost \\$${cost.toFixed(2)}.`,
    };
  },
});

// ── Systems of linear equations ───────────────────────────────────────────

const lin2 = (a: number, b: number, c: number) => `${polynomial([{ coef: a, powers: [['x', 1]] }, { coef: b, powers: [['y', 1]] }])} = ${c}`;
const sysText = (e1: string, e2: string) => `display(cases(${e1}, ${e2}))`;
/** Two equations a x + b y = c with the solution (x, y), not parallel. */
function system(rng: Rng, x: number, y: number, style: 'unit' | 'add' | 'scale' | 'both'): [[number, number, number], [number, number, number]] {
  for (;;) {
    let a1 = rng.nonZero(-5, 5), b1 = rng.nonZero(-5, 5), a2 = rng.nonZero(-5, 5), b2 = rng.nonZero(-5, 5);
    if (style === 'unit') { b1 = 1; }
    if (style === 'add') { b2 = -b1; }
    if (style === 'scale') { a2 = a1 * rng.pick([2, 3, -2]); }
    if (a1 * b2 === a2 * b1) continue;
    if (style === 'both' && (Math.abs(a1) < 2 || Math.abs(a2) < 2 || Math.abs(b1) < 2 || Math.abs(b2) < 2 || a2 % a1 === 0 || a1 % a2 === 0 || b1 % b2 === 0 || b2 % b1 === 0)) continue;
    return [[a1, b1, a1 * x + b1 * y], [a2, b2, a2 * x + b2 * y]];
  }
}

export const sysVerify = mb10i('10i-sys-verify', {
  points: 1,
  levels: { 1: 'Is the point a solution?', 2: 'Which point is the solution?', 3: 'Fractional solutions' },
  options: [
    radioOption('form', 'Question', [['1', 'Is the point a solution?'], ['2', 'Which point is the solution?'], ['3', 'Fractional solutions']], ['1', '2', '3']),
    sizeOption([3, 5, 8], [5, 5, 5], 'Size of the solution'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const x = difficulty === 3 ? new Q(rng.nonZero(-optNum(o, 'size', 5) - 2, optNum(o, 'size', 5) + 2), 2) : new Q(rng.int(-optNum(o, 'size', 5), optNum(o, 'size', 5))), y = new Q(rng.int(-optNum(o, 'size', 5), optNum(o, 'size', 5)));
    const [[a1, b1, ], [a2, b2, ]] = system(rng, 0, 0, 'unit');
    const c1 = x.mul(a1).add(y.mul(b1)), c2 = x.mul(a2).add(y.mul(b2));
    const eqs = sysText(`${polynomial([{ coef: a1, powers: [['x', 1]] }, { coef: b1, powers: [['y', 1]] }])} = ${c1.typst()}`, `${polynomial([{ coef: a2, powers: [['x', 1]] }, { coef: b2, powers: [['y', 1]] }])} = ${c2.typst()}`);
    if (difficulty === 1) {
      const good = rng.next() < 0.5;
      const px = good ? x : x.add(1), py = y;
      const ok1 = px.mul(a1).add(py.mul(b1)).eq(c1), ok2 = px.mul(a2).add(py.mul(b2)).eq(c2);
      const answer = ok1 && ok2 ? 'Yes: it satisfies both equations' : ok1 || ok2 ? 'No: it satisfies only one equation' : 'No: it satisfies neither equation';
      return {
        body: `Is ${math(pt(px.typst(), py.typst()))} a solution of ${math(eqs)}?`,
        answer,
        distractors: ['Yes: it satisfies both equations', 'No: it satisfies only one equation', 'No: it satisfies neither equation', 'Yes: it satisfies one equation'].filter((d) => d !== answer),
        solution: `Substitute into each equation: the first ${ok1 ? 'holds' : 'fails'} and the second ${ok2 ? 'holds' : 'fails'}. A solution must satisfy both.`,
      };
    }
    const answer = pt(x.typst(), y.typst());
    return {
      body: `Which point is the solution of ${math(eqs)}?`,
      answer: math(answer),
      distractors: distinct(math(answer), [pt(y.typst(), x.typst()), pt(x.neg().typst(), y.typst()), pt(x.typst(), y.add(1).typst()), pt(x.add(1).typst(), y.sub(1).typst())].map(math)),
      solution: `${math(answer)} satisfies both equations: substitute to check each.`,
    };
  },
});

export const sysGraphical = mb10i('10i-sys-graphical', {
  levels: { 1: 'Lines in slope–intercept form', 2: 'Lines in general form', 3: 'Including parallel lines' },
  options: [
    radioOption('form', 'Form', [['1', 'Lines in slope–intercept form'], ['2', 'Lines in general form'], ['3', 'Including parallel lines']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const parallel = difficulty === 3 && rng.next() < 0.35;
    const x = rng.int(-4, 4), y = rng.int(-4, 4);
    const m1 = randomSlope(rng, rng.next() < 0.4);
    let m2 = parallel ? m1 : randomSlope(rng, rng.next() < 0.4);
    while (!parallel && m2.eq(m1)) m2 = randomSlope(rng, false);
    const b1 = new Q(y).sub(m1.mul(x)), b2 = parallel ? b1.add(rng.pick([-4, -3, 3, 4])) : new Q(y).sub(m2.mul(x));
    const e = (m: Q, b: Q) => (difficulty === 2 ? general(m, b) : yEquals(m, b));
    const graph = grid([{ f: (t) => m1.value * t + b1.value }, { f: (t) => m2.value * t + b2.value, dashed: true }], 4.5);
    const answer = parallel ? 'No solution' : math(pt(x, y));
    return {
      body: `The system ${math(sysText(e(m1, b1), e(m2, b2)))} is graphed. What is its solution?\n\n${graph}`,
      answer,
      distractors: distinct(answer, parallel ? [math(pt(0, b1.value)), math(pt(0, b2.value)), 'Infinitely many solutions'] : [math(pt(y, x)), math(pt(-x, y)), math(pt(0, b1.value).replace(/\.\d+/, '')), 'No solution']),
      solution: parallel ? 'The lines have the same slope and different intercepts: they never meet, so there is no solution.' : `The lines cross at ${math(pt(x, y))}. Check it in both equations.`,
    };
  },
});

export const sysSubstitution = mb10i('10i-sys-substitution', {
  levels: { 1: 'One equation solved for y', 2: 'Isolate a variable first', 3: 'Fractional solutions' },
  options: [
    radioOption('form', 'First equation', [['solved', 'Already solved for y'], ['isolate', 'Needs y isolated']], ['solved', 'isolate', 'isolate']),
    radioOption('solutions', 'Solutions are', [['int', 'Integers'], ['frac', 'Fractions']], ['int', 'int', 'frac']),
    sizeOption([5, 6, 9, 12], [6, 6, 6], 'Size of the solution'),
  ],
  generate(rng, difficulty, o) {
    const N = optNum(o, 'size', 6), fracSol = optOne(o, 'solutions', difficulty === 3 ? 'frac' : 'int') === 'frac';
    const solved = optOne(o, 'form', difficulty === 1 ? 'solved' : 'isolate') === 'solved';
    let x = new Q(rng.int(-N, N));
    while (fracSol && x.isInt) x = new Q(rng.nonZero(-N, N), rng.int(2, 3));
    const y = new Q(rng.int(-N, N));
    const m = rng.nonZero(-4, 4);
    const k = y.sub(x.mul(m));
    const [a, b] = [rng.nonZero(-5, 5), rng.nonZero(-5, 5)];
    if (a + b * m === 0) return sysSubstitution.generate(rng, difficulty, o);
    const c = x.mul(a).add(y.mul(b));
    const first = solved ? `y = ${polynomial([{ coef: m, powers: [['x', 1]] }])}${k.n === 0 ? '' : ` ${k.sign < 0 ? '-' : '+'} ${k.abs().typst()}`}` : `${polynomial([{ coef: -m, powers: [['x', 1]] }, { coef: 1, powers: [['y', 1]] }])} = ${k.typst()}`;
    const second = `${polynomial([{ coef: a, powers: [['x', 1]] }, { coef: b, powers: [['y', 1]] }])} = ${c.typst()}`;
    const answer = pt(x.typst(), y.typst());
    return {
      body: `Solve by substitution: ${math(sysText(first, second))}`,
      answer: math(answer),
      distractors: distinct(math(answer), [pt(y.typst(), x.typst()), pt(x.neg().typst(), y.neg().typst()), pt(x.typst(), x.mul(m).sub(k).typst()), pt(x.add(1).typst(), x.add(1).mul(m).add(k).typst())].map(math)),
      solution: `${solved ? '' : `Solve the first equation for ${math('y')}. `}Substitute ${math(`y = ${polynomial([{ coef: m, powers: [['x', 1]] }])}${k.n === 0 ? '' : ` ${k.sign < 0 ? '-' : '+'} ${k.abs().typst()}`}`)} into the second: ${math(`x = ${x.typst()}`)}. Then ${math(`y = ${y.typst()}`)}.`,
    };
  },
});

export const sysElimination = mb10i('10i-sys-elimination', {
  levels: { 1: 'Add or subtract directly', 2: 'Multiply one equation', 3: 'Multiply both equations' },
  options: [
    radioOption('method', 'Before adding or subtracting', [['1', 'No multiplying needed'], ['2', 'Multiply one equation'], ['3', 'Multiply both equations']], ['1', '2', '3']),
    sizeOption([5, 6, 9, 12, 20], [6, 6, 6], 'Size of the solution'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'method', gl), N = optNum(o, 'size', 6);
    const x = rng.int(-N, N), y = rng.int(-N, N);
    const [[a1, b1, c1], [a2, b2, c2]] = system(rng, x, y, difficulty === 1 ? 'add' : difficulty === 2 ? 'scale' : 'both');
    const answer = pt(x, y);
    return {
      body: `Solve by elimination: ${math(sysText(lin2(a1, b1, c1), lin2(a2, b2, c2)))}`,
      answer: math(answer),
      distractors: distinct(math(answer), [pt(y, x), pt(-x, y), pt(x, -y), pt(x + 1, y - 1)].map(math)),
      solution: difficulty === 1
        ? `Add the equations to eliminate ${math('y')}: ${math(`${cx(a1 + a2)} = ${c1 + c2}`)}, so ${math(`x = ${x}`)}. Substitute: ${math(`y = ${y}`)}.`
        : difficulty === 2
          ? `Multiply the first equation by ${a2 / a1} and subtract to eliminate ${math('x')}: ${math(`${cx(b2 - (a2 / a1) * b1, 'y')} = ${c2 - (a2 / a1) * c1}`)}, so ${math(`y = ${y}`)}. Then ${math(`x = ${x}`)}.`
          : `Multiply the first equation by ${a2} and the second by ${a1}, then subtract to eliminate ${math('x')}: ${math(`${cx(b1 * a2 - b2 * a1, 'y')} = ${c1 * a2 - c2 * a1}`)}, so ${math(`y = ${y}`)}. Then ${math(`x = ${x}`)}.`,
    };
  },
});

export const sysCount = mb10i('10i-sys-count', {
  points: 1,
  levels: { 1: 'Slope–intercept form', 2: 'General form', 3: 'Find k for no solution' },
  options: [
    radioOption('form', 'Form', [['1', 'Slope–intercept form'], ['2', 'General form'], ['3', 'Find k for no solution']], ['1', '2', '3']),
    radioOption('answer', 'Answer (first two forms)', [['any', 'Any'], ['one', 'One solution'], ['none', 'No solution'], ['infinite', 'Infinitely many']], ['any', 'any', 'any']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const m = randomSlope(rng, rng.next() < 0.4), b = new Q(rng.int(-6, 6));
    if (difficulty === 3) {
      const [A, B, C] = generalCoefs(m, b);
      const c2 = C + rng.nonZero(-5, 5), s = rng.pick([2, 3]);
      return {
        body: `For what value of ${math('k')} does the system ${math(sysText(generalText([A, B, C]), `${polynomial([{ coef: s * A, powers: [['x', 1]] }])} + k y ${c2 * s < 0 ? '-' : '+'} ${Math.abs(c2 * s)} = 0`))} have no solution?`,
        answer: math(`k = ${s * B}`),
        distractors: distinct(math(`k = ${s * B}`), [`k = ${B}`, `k = ${-s * B}`, `k = ${s * A}`].map(math)),
        solution: `No solution means parallel, distinct lines: the coefficients of ${math('x')} and ${math('y')} must be in the same ratio (${s}), but not the constants. So ${math(`k = ${s} dot (${B}) = ${s * B}`)}.`,
      };
    }
    const ans = optOne(o, 'answer', 'any');
    const kind = ans === 'any' ? rng.pick(['one', 'none', 'infinite'] as const) : ans as 'one' | 'none' | 'infinite';
    const m2 = kind === 'one' ? m.add(rng.nonZero(-2, 2)) : m, b2 = kind === 'none' ? b.add(rng.nonZero(-4, 4)) : b;
    const e1 = difficulty === 1 ? yEquals(m, b) : general(m, b);
    const e2 = difficulty === 1 ? (kind === 'infinite' ? general(m2, b2) : yEquals(m2, b2)) : (() => { const [A, B, C] = generalCoefs(m2, b2); const s = kind === 'infinite' ? 2 : 1; return generalText([A * s, B * s, C * s]); })();
    const answer = { one: 'Exactly one solution', none: 'No solution', infinite: 'Infinitely many solutions' }[kind];
    return {
      body: `How many solutions does the system ${math(sysText(e1, e2))} have?`,
      answer,
      distractors: ['Exactly one solution', 'No solution', 'Infinitely many solutions', 'Exactly two solutions'].filter((d) => d !== answer),
      solution: kind === 'one' ? 'The slopes differ, so the lines cross once.' : kind === 'none' ? 'The slopes are equal and the intercepts differ: parallel lines never meet.' : 'The equations describe the same line, so every point on it is a solution.',
    };
  },
});

const SCENARIOS = [
  (rng: Rng) => { const pa = rng.pick([12, 15, 18]), ps = rng.pick([6, 8, 9]), a = rng.int(40, 150), s = rng.int(40, 150); return { text: `A school play sold adult tickets for \\$${pa} and student tickets for \\$${ps}. ${a + s} tickets were sold for \\$${pa * a + ps * s}.`, vars: 'a for adult tickets and s for student tickets', question: 'How many of each type of ticket were sold?', e1: `a + s = ${a + s}`, e2: `${pa}a + ${ps}s = ${pa * a + ps * s}`, wrong: [`${ps}a + ${pa}s = ${pa * a + ps * s}`, `a + s = ${pa * a + ps * s}`, `${pa}a + ${ps}s = ${a + s}`], answer: `${a} adult and ${s} student tickets`, alt: [`${s} adult and ${a} student tickets`, `${a + 5} adult and ${s - 5} student tickets`, `${Math.round((a + s) / 2)} of each`] }; },
  (rng: Rng) => { const n = rng.int(10, 30), q = rng.int(5, 25); return { text: `A jar holds ${n + q} coins, all dimes and quarters, worth \\$${((10 * n + 25 * q) / 100).toFixed(2)}.`, vars: 'd for the number of dimes and q for the number of quarters', question: 'How many of each coin are there?', e1: `d + q = ${n + q}`, e2: `10d + 25q = ${10 * n + 25 * q}`, wrong: [`25d + 10q = ${10 * n + 25 * q}`, `d + q = ${10 * n + 25 * q}`, `0.10d + 0.25q = ${n + q}`], answer: `${n} dimes and ${q} quarters`, alt: [`${q} dimes and ${n} quarters`, `${n + 2} dimes and ${q - 2} quarters`, `${n - 3} dimes and ${q + 3} quarters`] }; },
  (rng: Rng) => { const l = rng.int(12, 40), w = rng.int(5, l - 2); return { text: `A rectangle's perimeter is ${2 * (l + w)} m and its length is ${l - w} m more than its width.`, vars: 'l for the length and w for the width', question: 'Find its length and width.', e1: `2l + 2w = ${2 * (l + w)}`, e2: `l = w + ${l - w}`, wrong: [`l + w = ${2 * (l + w)}`, `w = l + ${l - w}`, `l w = ${2 * (l + w)}`], answer: `length ${l} m and width ${w} m`, alt: [`length ${w} m and width ${l} m`, `length ${l + w} m and width ${l - w} m`, `length ${l - 1} m and width ${w + 1} m`] }; },
];

export const sysModel = mb10i('10i-sys-model', {
  levels: { 1: 'Tickets', 2: 'Coins', 3: 'Perimeter' },
  options: [
    radioOption('form', 'Context', [['1', 'Tickets'], ['2', 'Coins'], ['3', 'Perimeter']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const s = SCENARIOS[difficulty - 1](rng);
    const answer = math(sysText(s.e1, s.e2));
    return {
      body: `${s.text} Which system models the situation, using ${s.vars.replace(/\b([a-z]) for/g, (_m, v) => `$${v}$ for`)}?`,
      answer,
      distractors: distinct(answer, [math(sysText(s.e1, s.wrong[0])), math(sysText(s.wrong[1], s.e2)), math(sysText(s.e1, s.wrong[2]))]),
      solution: `One equation counts the items (or sums the sides) and the other totals the value (or compares them): ${answer}.`,
    };
  },
});

export const sysProblem = mb10i('10i-sys-problem', {
  levels: { 1: 'Tickets', 2: 'Coins', 3: 'Perimeter' },
  options: [
    radioOption('form', 'Context', [['1', 'Tickets'], ['2', 'Coins'], ['3', 'Perimeter']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const s = SCENARIOS[difficulty - 1](rng);
    return {
      body: `${s.text} ${s.question}`,
      answer: s.answer,
      distractors: distinct(s.answer, s.alt),
      solution: `Model with ${math(sysText(s.e1, s.e2))} and solve by substitution or elimination: ${s.answer}.`,
    };
  },
});

// ── Distance and midpoint ─────────────────────────────────────────────────

const radicalText = (n: number) => { const s = simplifySqrt(n); return s.radicand === 1 ? String(s.coef) : `${s.coef === 1 ? '' : s.coef}sqrt(${s.radicand})`; };

export const distDistance = mb10i('10i-dist-distance', {
  points: 1,
  levels: { 1: 'Whole-number distances', 2: 'Exact radical form', 3: 'To the nearest tenth' },
  options: [
    radioOption('form', 'Answer', [['1', 'Whole-number distances'], ['2', 'Exact radical form'], ['3', 'To the nearest tenth']], ['1', '2', '3']),
    sizeOption([5, 9, 12], [9, 9, 9], 'Size of the horizontal and vertical change'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const x1 = rng.int(-8, 6), y1 = rng.int(-8, 6);
    let dx: number, dy: number;
    if (difficulty === 1) { const [a, b] = rng.pick([[3, 4], [6, 8], [5, 12], [8, 6], [4, 3], [12, 5]]); dx = a * rng.sign(); dy = b * rng.sign(); }
    else { do { dx = rng.nonZero(-optNum(o, 'size', 9), optNum(o, 'size', 9)); dy = rng.nonZero(-optNum(o, 'size', 9), optNum(o, 'size', 9)); } while (Number.isInteger(Math.hypot(dx, dy))); }
    const x2 = x1 + dx, y2 = y1 + dy, sq = dx * dx + dy * dy;
    const answer = difficulty === 3 ? dec(Math.sqrt(sq), 1) : radicalText(sq);
    const alt = (n: number) => (difficulty === 3 ? dec(Math.sqrt(n), 1) : radicalText(n));
    return {
      body: `Find the distance between ${math(pt(x1, y1))} and ${math(pt(x2, y2))}${difficulty === 2 ? ' in exact simplest form' : difficulty === 3 ? ', to the nearest tenth' : ''}.`,
      answer: math(answer),
      distractors: distinct(math(answer), [alt((x1 + x2) ** 2 + (y1 + y2) ** 2 || 2), String(Math.abs(dx) + Math.abs(dy)), alt(Math.abs(dx * dx - dy * dy) || 3), alt(sq + 2 * Math.abs(dx))].map(math)),
      solution: `${math(`d = sqrt((${x2} - ${x1 < 0 ? `(${x1})` : x1})^2 + (${y2} - ${y1 < 0 ? `(${y1})` : y1})^2) = sqrt(${dx * dx} + ${dy * dy}) = sqrt(${sq})`)}${answer === `sqrt(${sq})` ? '' : ` ${difficulty === 3 ? '≈' : '='} ${math(answer)}`}.`,
    };
  },
});

export const distMidpoint = mb10i('10i-dist-midpoint', {
  points: 1,
  levels: { 1: 'Whole-number midpoints', 2: 'Fractional midpoints', 3: 'Midpoint and length together' },
  options: [
    radioOption('form', 'Midpoint', [['1', 'Whole-number midpoints'], ['2', 'Fractional midpoints'], ['3', 'Midpoint and length together']], ['1', '2', '3']),
    sizeOption([5, 9, 12], [9, 9, 9], 'Size of coordinates'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const N = optNum(o, 'size', 9);
    const x1 = rng.int(-N, N), y1 = rng.int(-N, N);
    const even = difficulty === 1;
    const x2 = x1 + (even ? 2 * rng.nonZero(-Math.ceil(N / 2), Math.ceil(N / 2)) : rng.nonZero(-N, N)), y2 = y1 + (even ? 2 * rng.nonZero(-Math.ceil(N / 2), Math.ceil(N / 2)) : rng.nonZero(-N, N));
    const mx = new Q(x1 + x2, 2), my = new Q(y1 + y2, 2);
    const answer = pt(mx.typst(), my.typst());
    if (difficulty === 3) {
      const len = radicalText((x2 - x1) ** 2 + (y2 - y1) ** 2);
      const full = `M ${answer}, "length" ${len}`;
      return {
        body: `A segment joins ${math(pt(x1, y1))} and ${math(pt(x2, y2))}. Find its midpoint and its exact length.`,
        answer: math(full),
        distractors: distinct(math(full), [`M ${pt(new Q(x2 - x1, 2).typst(), new Q(y2 - y1, 2).typst())}, "length" ${len}`, `M ${answer}, "length" ${radicalText(((x2 - x1) ** 2 + (y2 - y1) ** 2) * 4)}`, `M ${pt(x1 + x2, y1 + y2)}, "length" ${len}`].map(math)),
        solution: `Midpoint: average the coordinates, ${math(answer)}. Length: ${math(`sqrt(${(x2 - x1) ** 2} + ${(y2 - y1) ** 2}) = ${len}`)}.`,
      };
    }
    return {
      body: `Find the midpoint of the segment joining ${math(pt(x1, y1))} and ${math(pt(x2, y2))}.`,
      answer: math(answer),
      distractors: distinct(math(answer), [pt(new Q(x2 - x1, 2).typst(), new Q(y2 - y1, 2).typst()), pt(x1 + x2, y1 + y2), pt(my.typst(), mx.typst()), pt(mx.typst(), new Q(y1 - y2, 2).typst())].map(math)),
      solution: `${math(`M = ((${x1} + ${x2})/2, (${y1} + ${y2})/2) = ${answer}`).replace(/\+ -/g, '- ').replace(/- -/g, '+ ')}.`,
    };
  },
});

export const distEndpoint = mb10i('10i-dist-endpoint', {
  points: 1,
  levels: { 1: 'Whole-number coordinates', 2: 'Negative coordinates', 3: 'Fractional midpoint' },
  options: [
    radioOption('form', 'Coordinates', [['1', 'Whole-number coordinates'], ['2', 'Negative coordinates'], ['3', 'Fractional midpoint']], ['1', '2', '3']),
    sizeOption([5, 9, 12], [9, 9, 9], 'Size of coordinates'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const N = optNum(o, 'size', 9);
    const ax = difficulty === 1 ? rng.int(0, N - 1) : rng.int(-N, N), ay = difficulty === 1 ? rng.int(0, N - 1) : rng.int(-N, N);
    const bx = ax + rng.nonZero(1 - N, N - 1) * (difficulty === 3 ? 1 : 2), by = ay + rng.nonZero(1 - N, N - 1) * (difficulty === 3 ? 1 : 2);
    const mx = new Q(ax + bx, 2), my = new Q(ay + by, 2);
    const answer = pt(bx, by);
    return {
      body: `The midpoint of ${math('A B')} is ${math(`M${pt(mx.typst(), my.typst())}`)} and ${math(`A${pt(ax, ay)}`)}. Find ${math('B')}.`,
      answer: math(answer),
      distractors: distinct(math(answer), [pt(new Q(ax, 1).add(mx).div(2).typst(), new Q(ay, 1).add(my).div(2).typst()), pt(mx.sub(ax).typst(), my.sub(ay).typst()), pt(2 * ax - mx.value, 2 * ay - my.value), pt(bx, -by)].map(math)),
      solution: `The step from ${math('A')} to ${math('M')} repeats from ${math('M')} to ${math('B')}: ${math(`B = (2(${mx.typst()}) - ${ax < 0 ? `(${ax})` : ax}, 2(${my.typst()}) - ${ay < 0 ? `(${ay})` : ay}) = ${answer}`)}.`,
    };
  },
});

export const distProblem = mb10i('10i-dist-problem', {
  levels: { 1: 'Perimeter of a triangle', 2: 'Classify a triangle by its sides', 3: 'Centre and radius of a circle' },
  options: [
    radioOption('form', 'Problem', [['1', 'Perimeter of a triangle'], ['2', 'Classify a triangle by its sides'], ['3', 'Centre and radius of a circle']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    if (difficulty === 3) {
      const cx = rng.int(-5, 5), cy = rng.int(-5, 5), dx = rng.nonZero(-6, 6), dy = rng.nonZero(-6, 6);
      const r = radicalText(dx * dx + dy * dy);
      const answer = `"centre" ${pt(cx, cy)}, "radius" ${r}`;
      return {
        body: `The endpoints of a diameter of a circle are ${math(pt(cx - dx, cy - dy))} and ${math(pt(cx + dx, cy + dy))}. Find the centre and the exact radius.`,
        answer: math(answer),
        distractors: distinct(math(answer), [`"centre" ${pt(cx, cy)}, "radius" ${radicalText(4 * (dx * dx + dy * dy))}`, `"centre" ${pt(dx, dy)}, "radius" ${r}`, `"centre" ${pt(cx, cy)}, "radius" ${Math.abs(dx) + Math.abs(dy)}`].map(math)),
        solution: `The centre is the midpoint, ${math(pt(cx, cy))}. The radius is the distance from the centre to an endpoint: ${math(`sqrt(${dx * dx} + ${dy * dy}) = ${r}`)}.`,
      };
    }
    if (difficulty === 2) {
      const kind = rng.pick(['isosceles', 'scalene'] as const);
      const a = rng.int(2, 6), h = rng.int(2, 7), x0 = rng.int(-5, 1), y0 = rng.int(-5, 1);
      const P: Pt[] = kind === 'isosceles' ? [[x0, y0], [x0 + 2 * a, y0], [x0 + a, y0 + h]] : [[x0, y0], [x0 + 2 * a, y0], [x0 + a + rng.nonZero(1, 2), y0 + h]];
      const d = (p: Pt, q: Pt) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2;
      const sides = [d(P[0], P[1]), d(P[1], P[2]), d(P[0], P[2])];
      const iso = new Set(sides).size < 3;
      const answer = iso ? 'Isosceles: two sides are equal' : 'Scalene: no sides are equal';
      return {
        body: `Classify the triangle with vertices ${P.map(([x, y]) => math(pt(x, y))).join(', ')} by its side lengths.`,
        answer,
        distractors: ['Isosceles: two sides are equal', 'Scalene: no sides are equal', 'Equilateral: all sides are equal', 'Right isosceles: two sides are equal and one angle is 90°'].filter((x) => x !== answer),
        solution: `The side lengths are ${sides.map((s) => math(radicalText(s))).join(', ')}. ${iso ? 'Two are equal.' : 'All three differ.'}`,
      };
    }
    const [a, b] = rng.pick([[3, 4], [6, 8], [5, 12], [9, 12]]);
    const x0 = rng.int(-6, 0), y0 = rng.int(-6, 0);
    const P: Pt[] = [[x0, y0], [x0 + a, y0], [x0, y0 + b]];
    const c = Math.hypot(a, b);
    return {
      body: `Find the perimeter of the triangle with vertices ${P.map(([x, y]) => math(pt(x, y))).join(', ')}.`,
      answer: math(String(a + b + c)),
      distractors: distinct(math(String(a + b + c)), [String(a + b), String(a * b / 2), String(a + b + a + b), String(2 * c)].map(math)),
      solution: `Two sides are horizontal and vertical: ${a} and ${b}. The third is ${math(`sqrt(${a}^2 + ${b}^2) = ${c}`)}. Perimeter: ${a + b + c}.`,
    };
  },
});

export const LINES_10I = [
  formSlopeIntercept, formGeneral, formSlopePoint, formFeatures, formEquivalent, formGraph, formMatchGraph,
  eqFromGraph, eqPointSlope, eqParallelPerpendicular, eqContext, eqScatterplot,
  fnotEvaluate, fnotSolve, fnotConvert, fnotGraph, fnotContext,
  sysVerify, sysGraphical, sysSubstitution, sysElimination, sysCount, sysModel, sysProblem,
  distDistance, distMidpoint, distEndpoint, distProblem,
];
