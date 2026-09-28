import type { Generator } from '../types.ts';
import type { Rng } from '../rng.ts';
import { frac, gcd, lcm, polynomial, reduce, sub, type Fraction } from '../format.ts';
import { optNum, optOn, optOne, radioOption, sizeOption, toggleOption } from '../options.ts';

const math = (text: string) => `$${text}$`;
const point = (x: number, y: number) => `(${x}, ${y})`;

/** Two distinct points with coordinates in [-limit, limit] whose slope is rise/run. */
function pointsWithSlope(rng: Rng, rise: number, run: number, limit = 10): [number, number, number, number] {
  for (;;) {
    const k = rng.pick([1, 1, 1, 2]);
    const x1 = rng.int(-limit, limit), y1 = rng.int(-limit, limit);
    const x2 = x1 + run * k, y2 = y1 + rise * k;
    if (Math.abs(x2) <= limit && Math.abs(y2) <= limit) return [x1, y1, x2, y2];
  }
}

function randomSlope(rng: Rng, fractional: boolean): Fraction {
  if (!fractional) return { n: rng.nonZero(-5, 5), d: 1 };
  for (;;) {
    const f = reduce(rng.nonZero(-6, 6), rng.int(2, 6));
    if (f.d !== 1) return f;
  }
}

export const slopeFromTwoPoints: Generator = {
  id: 'mb-10i-slope-two-points',
  title: 'Slope from two points',
  classId: 'mb-10i',
  unitId: 'R',
  outcomeId: '10I.R.3',
  outcomes: ['10I.R.3'],
  catalogId: '10i-slope-two-points',
  levels: {
    1: 'Integer slopes',
    2: 'Fractional slopes',
    3: 'Includes zero and undefined slopes',
  },
  options: [
    sizeOption([5, 10, 20, 50], [10, 10, 10], 'Size of coordinates'),
    radioOption('numbers', 'Slopes are', [['int', 'Integers'], ['frac', 'Fractions'], ['both', 'Either']], ['int', 'frac', 'frac']),
    toggleOption('special', 'Include zero slope and undefined slope', [false, false, true]),
  ],
  points: 1,
  generate(rng, difficulty, o) {
    const N = optNum(o, 'size', 10);
    const numbers = optOne(o, 'numbers', difficulty === 1 ? 'int' : 'frac');
    const special = optOn(o, 'special', difficulty === 3) ? rng.pick(['none', 'none', 'zero', 'undefined'] as const) : 'none';
    let x1: number, y1: number, x2: number, y2: number;
    if (special === 'zero') {
      x1 = rng.int(-N, N); y1 = rng.int(-N, N); y2 = y1;
      do { x2 = rng.int(-N, N); } while (x2 === x1);
    } else if (special === 'undefined') {
      x1 = rng.int(-N, N); y1 = rng.int(-N, N); x2 = x1;
      do { y2 = rng.int(-N, N); } while (y2 === y1);
    } else {
      // Rise and run must fit inside the coordinate range.
      let slope: Fraction;
      do { slope = randomSlope(rng, numbers === 'frac' || (numbers === 'both' && rng.next() < 0.5)); } while (Math.abs(slope.n) > N || slope.d > N);
      [x1, y1, x2, y2] = pointsWithSlope(rng, slope.n, slope.d, N);
    }
    const rise = y2 - y1, run = x2 - x1;
    const answer = run === 0 ? 'undefined' : math(frac(rise, run));
    const substitution = `(${y2} - ${sub(y1)})/(${x2} - ${sub(x1)}) = ${rise}/${sub(run)}`;
    const distractors = run === 0
      ? [math('0'), math(String(rise)), math(String(-rise)), math(frac(1, rise))]
      : rise === 0
        ? ['undefined', math(String(run)), math(String(-run)), math('1')]
        : [math(frac(run, rise)), math(frac(-rise, run)), math(frac(-run, rise)),
          ...(x1 + x2 !== 0 ? [math(frac(y1 + y2, x1 + x2))] : []), math(frac(rise + run, run))];
    return {
      body: `Find the slope of the line through ${math(point(x1, y1))} and ${math(point(x2, y2))}.`,
      answer,
      distractors,
      solution: run === 0
        ? `${math(`m = (y_2 - y_1)/(x_2 - x_1) = ${substitution}`)}. Division by zero is undefined, so the line is vertical and its slope is undefined.`
        : `${math(`m = (y_2 - y_1)/(x_2 - x_1) = ${substitution}${`${rise}/${sub(run)}` === frac(rise, run) ? '' : ` = ${frac(rise, run)}`}`)}`,
    };
  },
};

/** `y = mx + b` with fractional m and b written the usual way: `y = 3/4 x - 2`. */
function slopeIntercept(m: Fraction, b: Fraction): string {
  const term = (f: Fraction, withX: boolean) => {
    const text = frac(Math.abs(f.n), f.d);
    if (!withX) return text;
    return text === '1' ? 'x' : `${text} x`;
  };
  const parts: string[] = [];
  if (m.n !== 0) parts.push(`${m.n < 0 ? '-' : ''}${term(m, true)}`);
  if (b.n !== 0) parts.push(parts.length ? `${b.n < 0 ? '-' : '+'} ${term(b, false)}` : frac(b.n, b.d));
  return `y = ${parts.join(' ') || '0'}`;
}

/** General form `Ax + By + C = 0` with integer coefficients and A > 0 (or B > 0 when A = 0). */
function generalForm(m: Fraction, b: Fraction): string {
  // y = (mn/md)x + bn/bd → multiply through by lcm(md, bd): Ax + By + C = 0
  const scale = lcm(m.d, b.d);
  let A = -m.n * (scale / m.d), B = scale, C = -b.n * (scale / b.d);
  const g = gcd(gcd(A, B), C) || 1;
  A /= g; B /= g; C /= g;
  if (A < 0 || (A === 0 && B < 0)) { A = -A; B = -B; C = -C; }
  return `${polynomial([{ coef: A, powers: [['x', 1]] }, { coef: B, powers: [['y', 1]] }, { coef: C }])} = 0`;
}

export const lineThroughTwoPoints: Generator = {
  id: 'mb-10i-line-two-points',
  title: 'Equation of a line through two points',
  classId: 'mb-10i',
  unitId: 'R',
  outcomeId: '10I.R.7',
  outcomes: ['10I.R.7'],
  catalogId: '10i-line-two-points',
  levels: {
    1: 'Integer slope, slope-intercept form',
    2: 'Fractional slope, slope-intercept form',
    3: 'Answer in general form',
  },
  points: 2,
  options: [
    radioOption('form', 'Given', [['1', 'Integer slope, slope-intercept form'], ['2', 'Fractional slope, slope-intercept form'], ['3', 'Answer in general form']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const m = randomSlope(rng, difficulty > 1);
    // Choose the y-intercept so the line passes through a lattice point, then pick two such points.
    const x0 = m.d * rng.int(-2, 2);
    const y0 = rng.int(-6, 6);
    const b = reduce(y0 * m.d - m.n * x0, m.d);
    const x1 = x0, y1 = y0;
    const step = m.d * rng.pick([1, 2]) * rng.sign();
    const x2 = x1 + step, y2 = y1 + (m.n * step) / m.d;
    const form = difficulty === 3 ? 'general form' : 'slope-intercept form';
    const answerOf = (slope: Fraction, intercept: Fraction) => difficulty === 3 ? generalForm(slope, intercept) : slopeIntercept(slope, intercept);
    const answer = answerOf(m, b);
    const flipped = reduce(m.d, m.n);
    const bFor = (slope: Fraction) => reduce(y1 * slope.d - slope.n * x1, slope.d);
    const distractors = [
      answerOf(m, reduce(-b.n, b.d)),
      answerOf(flipped, bFor(flipped)),
      answerOf(reduce(-m.n, m.d), bFor(reduce(-m.n, m.d))),
      answerOf(m, reduce(y1 * m.d + m.n * x1, m.d)),
      answerOf(reduce(-m.d, m.n), bFor(reduce(-m.d, m.n))),
      answerOf(m, { n: y1, d: 1 }),
    ].filter((d) => d !== answer);
    const steps = [
      `Slope: ${math(`m = (${y2} - ${sub(y1)})/(${x2} - ${sub(x1)}) = ${frac(m.n, m.d)}`)}.`,
      `Substitute ${math(point(x1, y1))} into ${math('y = m x + b')}: ${math(`${y1} = ${m.d === 1 ? m.n : `(${frac(m.n, m.d)})`}(${x1}) + b`)}, so ${math(`b = ${frac(b.n, b.d)}`)}.`,
      `The equation is ${math(slopeIntercept(m, b))}.`,
    ];
    if (difficulty === 3) steps.push(`In general form: ${math(answer)}.`);
    return {
      body: `Write the equation of the line through ${math(point(x1, y1))} and ${math(point(x2, y2))} in ${form}.`,
      answer: math(answer),
      distractors: distractors.map(math),
      solution: steps.join('\n\n'),
    };
  },
};
