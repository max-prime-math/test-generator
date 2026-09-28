import type { Rng } from '../../rng.ts';
import { round, sub } from '../../format.ts';
import { angle, deg, exactTrig, exactTypst, exactValue, Q, radians, reciprocalFn, SPECIAL_ANGLES, surd, type Exact, type TrigFn } from '../../exact.ts';
import { graphTypst, type Pt } from '../../graph.ts';
import { math, pc40s } from './common.ts';
import { optNum, optOn, optOne, radioOption, sizeOption, toggleOption } from '../../options.ts';

export type Unit = 'deg' | 'rad';

/** Angles in [lo, hi) degrees that are multiples of 30° or 45°. */
export function specialAnglesIn(lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let a = Math.ceil(lo / 15) * 15; a < hi; a += 15) if (a % 30 === 0 || a % 45 === 0) out.push(a);
  return out;
}

/** Special angles in [lo, hi) where fn has exactly this value. */
export function solveSpecial(fn: TrigFn, value: Exact | null, lo: number, hi: number): number[] {
  const target = exactValue(value);
  return specialAnglesIn(lo, hi).filter((a) => {
    const v = exactTrig(fn, a);
    if (value === null) return v === null;
    return v !== null && Math.abs(exactValue(v) - target) < 1e-9;
  });
}

/** `x = pi/6, (5pi)/6` or `"no solution"`. */
export function solutionList(angles: number[], unit: Unit, variable = 'x'): string {
  if (!angles.length) return '"no solution"';
  return `${variable} = ${angles.map((a) => angle(a, unit)).join(', ')}`;
}

/** Domain text: `0 <= x < 2pi` or `0° <= x < 360°`. */
export function domainText(lo: number, hi: number, unit: Unit, variable = 'x', closedHigh = false): string {
  return `${angle(lo, unit)} <= ${variable} ${closedHigh ? '<=' : '<'} ${angle(hi, unit)}`;
}

const TRIPLES: Array<[number, number, number]> = [[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25], [20, 21, 29]];

const QUADRANT_SIGNS: Record<number, [number, number]> = { 1: [1, 1], 2: [-1, 1], 3: [-1, -1], 4: [1, -1] };
const quadrantName = (q: number) => ['', 'I', 'II', 'III', 'IV'][q];

/** A point on the terminal arm: integer coordinates with r a whole number or a surd. */
function terminalPoint(rng: Rng, difficulty: number, opts?: { quadrants?: string; radical?: boolean }): { x: number; y: number; q: number } {
  const quadrants = opts?.quadrants ?? (difficulty === 1 ? '12' : 'any');
  const radical = opts?.radical ?? difficulty === 3;
  const q = quadrants === '12' ? rng.pick([1, 2]) : rng.int(1, 4);
  const [sx, sy] = QUADRANT_SIGNS[q];
  if (!radical) {
    const [a, b] = rng.pick(TRIPLES);
    const [p, s] = rng.next() < 0.5 ? [a, b] : [b, a];
    return { x: sx * p, y: sy * s, q };
  }
  for (;;) {
    const p = rng.int(1, 7), s = rng.int(1, 7);
    const r2 = p * p + s * s;
    if (Number.isInteger(Math.sqrt(r2))) continue;
    return { x: sx * p, y: sy * s, q };
  }
}

/** A trig ratio from the coordinates of a point: sin = y/r etc., rationalized. */
export function ratioFromPoint(fn: TrigFn, x: number, y: number): string {
  const r2 = x * x + y * y;
  const rootR = Math.sqrt(r2);
  const r = Number.isInteger(rootR) ? { a: rootR, b: 0, rad: 1 } : { a: 0, b: 1, rad: r2 };
  // value = top/bottom where one of them may be r
  const pick = { sin: [y, 'r'], cos: [x, 'r'], tan: [y, x], csc: ['r', y], sec: ['r', x], cot: [x, y] }[fn] as [number | 'r', number | 'r'];
  const [top, bottom] = pick;
  if (top !== 'r' && bottom !== 'r') return bottom === 0 ? '"undefined"' : new Q(top, bottom).typst();
  if (top === 'r') {
    if (bottom === 0) return '"undefined"';
    return r.b === 0 ? new Q(r.a, bottom as number).typst() : surd(0, 1, r2, bottom as number);
  }
  // number over r: rationalize n/√r2 = n√r2/r2
  return r.b === 0 ? new Q(top as number, r.a).typst() : surd(0, top as number, r2, r2);
}

export const angDegToRad = pc40s('40s-ang-deg-to-rad', {
  points: 1,
  levels: { 1: 'Special angles', 2: 'Negative and large angles', 3: 'Approximate values' },
  options: [
    radioOption('range', 'Angles', [['basic', 'Between 0° and 360°'], ['wide', 'Negative and beyond 360°']], ['basic', 'wide', 'wide']),
    radioOption('answer', 'Answers', [['exact', 'Exact (in terms of π)'], ['decimal', 'Decimal']], ['exact', 'exact', 'decimal']),
  ],
  generate(rng, difficulty, o) {
    const wide = optOne(o, 'range', difficulty === 1 ? 'basic' : 'wide') === 'wide';
    if (optOne(o, 'answer', difficulty === 3 ? 'decimal' : 'exact') === 'decimal') {
      const d = wide ? rng.pick([-rng.int(10, 300), rng.int(370, 720)]) : rng.int(10, 350);
      const value = (d * Math.PI) / 180;
      return {
        body: `Convert ${math(deg(d))} to radians, to two decimal places.`,
        answer: math(round(value, 2)),
        distractors: [round((d * 180) / Math.PI, 2), round(d / 180, 2), round((d * Math.PI) / 360, 2)].map(math),
        solution: math(`${d}° times pi/(180°) approx ${round(value, 2)}`),
      };
    }
    const d = !wide ? rng.pick(SPECIAL_ANGLES.filter((a) => a > 0)) : rng.sign() * rng.pick([15, 75, 105, 165, 210, 240, 330, 390, 420, 495, 540, 600, 720]);
    const answer = radians(d);
    return {
      body: `Convert ${math(deg(d))} to radians. Give an exact answer.`,
      answer: math(answer),
      distractors: [radians(d * 2), radians(-d), radians(180 - d || 90), `${d}pi`].filter((x) => x !== answer).map(math),
      solution: `Multiply by ${math('pi/(180°)')}: ${math(`${d}° times pi/(180°) = ${answer}`)}.`,
    };
  },
});

export const angRadToDeg = pc40s('40s-ang-rad-to-deg', {
  points: 1,
  levels: { 1: 'Special angles', 2: 'Negative and large angles', 3: 'Radians as decimals' },
  options: [
    radioOption('range', 'Angles', [['basic', 'Between 0 and 2π'], ['wide', 'Negative and beyond 2π']], ['basic', 'wide', 'wide']),
    radioOption('given', 'Radians given as', [['exact', 'Multiples of π'], ['decimal', 'Decimals']], ['exact', 'exact', 'decimal']),
  ],
  generate(rng, difficulty, o) {
    const wide = optOne(o, 'range', difficulty === 1 ? 'basic' : 'wide') === 'wide';
    if (optOne(o, 'given', difficulty === 3 ? 'decimal' : 'exact') === 'decimal') {
      const r = Number(((wide ? rng.pick([1, -1]) : 1) * rng.int(3, wide ? 120 : 60) / 10).toFixed(1));
      const value = (r * 180) / Math.PI;
      return {
        body: `Convert ${math(String(r))} radians to degrees, to one decimal place.`,
        answer: math(`${round(value, 1)}°`),
        distractors: [round((r * Math.PI) / 180, 1), round(r * 180, 1), round((r * 360) / Math.PI, 1)].map((v) => math(`${v}°`)),
        solution: math(`${r} times (180°)/pi approx ${round(value, 1)}°`),
      };
    }
    const d = !wide ? rng.pick(SPECIAL_ANGLES.filter((a) => a > 0)) : rng.sign() * rng.pick([15, 75, 105, 135, 210, 300, 405, 480, 510, 630, 720]);
    const given = radians(d);
    return {
      body: `Convert ${math(given)} to degrees.`,
      answer: math(deg(d)),
      distractors: [deg(d * 2), deg(-d), deg(Math.round((d / 180) * 100) / 100)].filter((x) => x !== deg(d)).map(math),
      solution: `Multiply by ${math('(180°)/pi')}: ${math(`${given} times (180°)/pi = ${deg(d)}`)}.`,
    };
  },
});

export const angCoterminal = pc40s('40s-ang-coterminal', {
  levels: { 1: 'One positive and one negative (degrees)', 2: 'All in a domain (degrees)', 3: 'All in a domain (radians)' },
  options: [
    radioOption('task', 'Find', [['pair', 'One positive and one negative angle'], ['domain', 'All angles in a domain']], ['pair', 'domain', 'domain']),
    radioOption('unit', 'Angles in', [['deg', 'Degrees'], ['rad', 'Radians']], ['deg', 'deg', 'rad']),
  ],
  generate(rng, difficulty, o) {
    const base = rng.pick([30, 45, 60, 120, 135, 150, 210, 225, 240, 300, 315, 330, 20, 75, 100, 250, 290]);
    const unit: Unit = optOne(o, 'unit', difficulty === 3 ? 'rad' : 'deg') === 'rad' ? 'rad' : 'deg';
    const special = base % 15 === 0 && (base % 30 === 0 || base % 45 === 0);
    const theta = unit === 'rad' && !special ? 150 : base;
    if (optOne(o, 'task', difficulty === 1 ? 'pair' : 'domain') === 'pair') {
      const A = (v: number) => angle(v, unit);
      const turn = unit === 'deg' ? '360°' : '2pi';
      const answer = `${A(theta + 360)}, ${A(theta - 360)}`;
      return {
        body: `Find one positive and one negative angle that are coterminal with ${math(A(theta))}.`,
        answer: math(answer),
        distractors: [`${A(theta + 180)}, ${A(theta - 180)}`, `${A(360 - theta)}, ${A(-theta)}`, `${A(theta + 90)}, ${A(theta - 90)}`].map(math),
        solution: `Add or subtract ${math(turn)}: ${math(`${A(theta)} + ${turn} = ${A(theta + 360)}`)} and ${math(`${A(theta)} - ${turn} = ${A(theta - 360)}`)}. (Any ${math(`theta + ${turn} n`)} works.)`,
      };
    }
    const [lo, hi] = rng.pick([[-360, 720], [-720, 360], [-360, 360]]);
    const all: number[] = [];
    for (let a = theta - 1080; a <= hi; a += 360) if (a >= lo && a <= hi && a !== theta) all.push(a);
    const answer = all.map((a) => angle(a, unit)).join(', ');
    return {
      body: `Find all angles coterminal with ${math(angle(theta, unit))} in the domain ${math(domainText(lo, hi, unit, 'theta', true))}.`,
      answer: math(answer),
      distractors: [
        all.filter((a) => a > 0).map((a) => angle(a, unit)).join(', ') || angle(theta + 360, unit),
        all.map((a) => angle(a + 180, unit)).join(', '),
        [...all, theta].sort((a, b) => a - b).map((a) => angle(a, unit)).join(', '),
      ].filter((d) => d !== answer).map(math),
      solution: `Coterminal angles differ by ${math(unit === 'deg' ? '360°' : '2pi')}. Add and subtract until you leave the domain: ${math(answer)}.`,
    };
  },
});

export const angCoterminalGeneral = pc40s('40s-ang-coterminal-general', {
  levels: { 1: 'Degrees', 2: 'Radians', 3: 'Reduce a large angle first' },
  options: [
    radioOption('unit', 'Angles in', [['deg', 'Degrees'], ['rad', 'Radians'], ['either', 'Either']], ['deg', 'rad', 'either']),
    toggleOption('large', 'Start from a large or negative angle', [false, false, true]),
  ],
  generate(rng, difficulty, o) {
    const u = optOne(o, 'unit', difficulty === 1 ? 'deg' : difficulty === 2 ? 'rad' : 'either');
    const unit: Unit = u === 'either' ? rng.pick(['deg', 'rad'] as const) : (u as Unit);
    const principal = rng.pick(SPECIAL_ANGLES.filter((a) => a > 0));
    const given = optOn(o, 'large', difficulty === 3) ? principal + 360 * rng.pick([2, 3, -1, -2]) : principal;
    const full = unit === 'deg' ? '360° n' : '2pi n';
    const answer = `${angle(principal, unit)} + ${full}, n in ZZ`;
    return {
      body: `Write an expression for all angles coterminal with ${math(angle(given, unit))}.`,
      answer: math(answer),
      distractors: [
        `${angle(principal, unit)} + ${unit === 'deg' ? '180° n' : 'pi n'}, n in ZZ`,
        `${angle(principal, unit)} + ${unit === 'deg' ? '360°' : '2pi'}`,
        `${angle(360 - principal, unit)} + ${full}, n in ZZ`,
      ].map(math),
      solution: given === principal
        ? `Adding any whole number of full rotations gives a coterminal angle: ${math(answer)}.`
        : `First find the coterminal angle between ${math(angle(0, unit))} and ${math(angle(360, unit))}: ${math(`${angle(given, unit)} ${given > principal ? '-' : '+'} ${Math.abs(given - principal) / 360}(${unit === 'deg' ? '360°' : '2pi'}) = ${angle(principal, unit)}`)}. Then ${math(answer)}.`,
    };
  },
});

export const angArcLength = pc40s('40s-ang-arc-length', {
  levels: { 1: 'Find the arc length (radians)', 2: 'Central angle in degrees', 3: 'Find the angle or the radius' },
  options: [
    radioOption('unknown', 'Find', [['arc', 'The arc length'], ['angle', 'The central angle'], ['radius', 'The radius'], ['mixed', 'The angle or the radius']], ['arc', 'arc', 'mixed']),
    radioOption('unit', 'Central angle given in (for arc length)', [['rad', 'Radians'], ['deg', 'Degrees']], ['rad', 'deg', 'rad']),
  ],
  generate(rng, difficulty, o) {
    const r = rng.int(3, 20);
    const unknown = optOne(o, 'unknown', difficulty === 3 ? 'mixed' : 'arc');
    if (unknown === 'arc') {
      const inDeg = optOne(o, 'unit', difficulty === 2 ? 'deg' : 'rad') === 'deg';
      const d = !inDeg ? rng.pick([30, 45, 60, 90, 120, 135, 150, 210, 240, 300]) : rng.int(20, 300);
      const a = (r * d * Math.PI) / 180;
      const thetaText = !inDeg ? radians(d) : deg(d);
      return {
        body: `A circle has radius ${r} cm. Find the length of the arc cut off by a central angle of ${math(thetaText)}, to one decimal place.`,
        answer: math(`${round(a, 1)} "cm"`),
        distractors: [round(r * d, 1), round((r * d * Math.PI) / 360, 1), round((r * r * d * Math.PI) / 360, 1)].filter((v) => v !== round(a, 1)).map((v) => math(`${v} "cm"`)),
        solution: `${inDeg ? `Convert to radians: ${math(`${d}° = ${radians(d)}`)}. ` : ''}${math(`a = r theta = ${r} dot ${radians(d)} approx ${round(a, 1)}`)} cm.`,
      };
    }
    const theta = rng.int(5, 40) / 10;
    const a = Number((r * theta).toFixed(1));
    if (unknown === 'angle' || (unknown === 'mixed' && rng.next() < 0.5)) {
      return {
        body: `An arc of length ${a} cm is cut off on a circle of radius ${r} cm. Find the central angle in radians, to one decimal place.`,
        answer: math(round(a / r, 1)),
        distractors: [round(r / a, 1), round(a * r, 1), round(((a / r) * 180) / Math.PI, 1)].filter((v) => v !== round(a / r, 1)).map(math),
        solution: math(`theta = a/r = ${a}/${r} approx ${round(a / r, 1)}`),
      };
    }
    return {
      body: `A central angle of ${theta} radians cuts off an arc of length ${a} cm. Find the radius, to one decimal place.`,
      answer: math(`${round(a / theta, 1)} "cm"`),
      distractors: [round(theta / a, 2), round(a * theta, 1), round((a / theta) * 2, 1)].filter((v) => v !== round(a / theta, 1)).map((v) => math(`${v} "cm"`)),
      solution: math(`r = a/theta = ${a}/${theta} approx ${round(a / theta, 1)}`),
    };
  },
});

/** A sketch of an angle in standard position: axes, the terminal arm, and a spiral showing the rotation. */
export function angleSketch(d: number, size: number): string {
  const R = 4;
  const arm: Pt[] = [[0, 0], [R * Math.cos((d * Math.PI) / 180), R * Math.sin((d * Math.PI) / 180)]];
  const spiral: Pt[] = [];
  const steps = Math.max(12, Math.ceil(Math.abs(d) / 5));
  for (let i = 0; i <= steps; i++) {
    const t = (d * i) / steps;
    const rr = 1.4 + (0.6 * Math.abs(t)) / 360;
    spiral.push([rr * Math.cos((t * Math.PI) / 180), rr * Math.sin((t * Math.PI) / 180)]);
  }
  return graphTypst({
    xMin: -5, xMax: 5, yMin: -5, yMax: 5, width: size, height: size, grid: false, numbers: false,
    curves: [{ points: arm }, { points: spiral, arrow: true }],
  });
}

export const angSketch = pc40s('40s-ang-sketch', {
  points: 1,
  levels: { 1: 'Positive degrees', 2: 'Negative angles', 3: 'Radians, more than one rotation' },
  options: [
    radioOption('unit', 'Angles in', [['deg', 'Degrees'], ['rad', 'Radians']], ['deg', 'deg', 'rad']),
    radioOption('direction', 'Rotation', [['positive', 'Counterclockwise (positive)'], ['negative', 'Clockwise (negative)'], ['either', 'Either']], ['positive', 'negative', 'either']),
    toggleOption('turns', 'More than one full rotation', [false, false, true]),
  ],
  generate(rng, difficulty, o) {
    const dir = optOne(o, 'direction', difficulty === 1 ? 'positive' : difficulty === 2 ? 'negative' : 'either');
    const sign = dir === 'positive' ? 1 : dir === 'negative' ? -1 : rng.sign();
    const d = sign * (optOn(o, 'turns', difficulty === 3) ? rng.pick([390, 420, 480, 510, 600]) : rng.pick([30, 45, 60, 120, 135, 150, 210, 225, 240, 300, 330]));
    const unit: Unit = optOne(o, 'unit', difficulty === 3 ? 'rad' : 'deg') === 'rad' ? 'rad' : 'deg';
    const size = 3.2;
    return {
      body: `Sketch ${math(angle(d, unit))} in standard position.`,
      answer: angleSketch(d, size),
      distractors: [angleSketch(-d, size), angleSketch(180 - d, size), angleSketch(d + 90, size)],
      solution: `Start on the positive x-axis and rotate ${d > 0 ? 'counterclockwise' : 'clockwise'} ${math(angle(Math.abs(d), unit))}${Math.abs(d) > 360 ? ` (one full turn, then ${math(angle(Math.abs(d) - 360, unit))} more)` : ''}. The terminal arm is in quadrant ${quadrantName(quadrantOf(d))}.`,
    };
  },
});

export function quadrantOf(d: number): number {
  const a = ((d % 360) + 360) % 360;
  return a < 90 ? 1 : a < 180 ? 2 : a < 270 ? 3 : 4;
}

export const ucPoint = pc40s('40s-uc-point', {
  levels: { 1: 'Rational coordinates', 2: 'Radical coordinates', 3: 'Coordinates of P(θ)' },
  options: [
    radioOption('form', 'Find', [['1', 'Rational coordinates'], ['2', 'Radical coordinates'], ['3', 'Coordinates of P(θ)']], ['1', '2', '3']),
    radioOption('unit', 'Angle P(θ) in (for P(θ))', [['rad', 'Radians'], ['deg', 'Degrees']], ['rad', 'rad', 'rad']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    if (difficulty === 3) {
      const d = rng.pick(SPECIAL_ANGLES.filter((a) => a % 90 !== 0));
      const unit: Unit = optOne(o, 'unit', 'rad') === 'deg' ? 'deg' : 'rad';
      const answer = `(${exactTypst(exactTrig('cos', d))}, ${exactTypst(exactTrig('sin', d))})`;
      return {
        body: `Find the exact coordinates of the point ${math(`P(${angle(d, unit)})`)} where the terminal arm of ${math(`theta = ${angle(d, unit)}`)} meets the unit circle.`,
        answer: math(answer),
        distractors: [
          `(${exactTypst(exactTrig('sin', d))}, ${exactTypst(exactTrig('cos', d))})`,
          `(${exactTypst(exactTrig('cos', 180 - d))}, ${exactTypst(exactTrig('sin', d))})`,
          `(${exactTypst(exactTrig('cos', d))}, ${exactTypst(exactTrig('sin', -d))})`,
        ].filter((x) => x !== answer).map(math),
        solution: `On the unit circle, ${math('P(theta) = (cos theta, sin theta)')}. The reference angle is ${math(angle(refAngle(d), unit))} in quadrant ${quadrantName(quadrantOf(d))}, so ${math(`P = ${answer}`)}.`,
      };
    }
    const q = rng.int(1, 4);
    const [sx, sy] = QUADRANT_SIGNS[q];
    let known: string, unknown: string;
    const knownIsX = rng.next() < 0.5;
    let wrongSign: string, noSquare: string;
    if (difficulty === 1) {
      const [a, b, c] = rng.pick(TRIPLES);
      const kx = new Q(sx * (knownIsX ? a : b), c), ky = new Q(sy * (knownIsX ? b : a), c);
      known = (knownIsX ? kx : ky).typst();
      unknown = (knownIsX ? ky : kx).typst();
      wrongSign = (knownIsX ? ky : kx).neg().typst();
      // Forgetting to square: 1 − |known|, with the unknown's sign.
      noSquare = new Q((knownIsX ? sy : sx) * (c - (knownIsX ? a : b)), c).typst();
    } else {
      const d = rng.pick([2, 3, 4, 5]);
      const n = rng.int(1, d - 1);
      // (n/d)² + y² = 1  →  |y| = √(d² − n²)/d
      const s = knownIsX ? sx : sy, t = knownIsX ? sy : sx;
      known = new Q(s * n, d).typst();
      unknown = surd(0, t, d * d - n * n, d);
      wrongSign = surd(0, -t, d * d - n * n, d);
      noSquare = new Q(t * (d - n), d).typst();
    }
    const pointText = knownIsX ? `P(${known}, y)` : `P(x, ${known})`;
    const letter = knownIsX ? 'y' : 'x';
    return {
      body: `The point ${math(pointText)} is on the unit circle in quadrant ${quadrantName(q)}. Find ${math(letter)}.`,
      answer: math(`${letter} = ${unknown}`),
      distractors: [wrongSign, noSquare, known].filter((v) => v !== unknown).map((v) => math(`${letter} = ${v}`)),
      solution: `Use ${math('x^2 + y^2 = 1')}: ${math(`${letter}^2 = 1 - (${known})^2`)}. In quadrant ${quadrantName(q)}, ${math(letter)} is ${(letter === 'x' ? sx : sy) > 0 ? 'positive' : 'negative'}, so ${math(`${letter} = ${unknown}`)}.`,
    };
  },
});

export function refAngle(d: number): number {
  const a = ((d % 360) + 360) % 360;
  return a <= 90 ? a : a <= 180 ? 180 - a : a <= 270 ? a - 180 : 360 - a;
}

export const ucCircleEquation = pc40s('40s-uc-circle-equation', {
  points: 1,
  levels: { 1: 'Given the radius', 2: 'Through a point', 3: 'Is a point on the circle?' },
  options: [
    radioOption('form', 'Task', [['1', 'Given the radius'], ['2', 'Through a point'], ['3', 'Is a point on the circle?']], ['1', '2', '3']),
    sizeOption([5, 8, 12], [8, 8, 8], 'Size of coordinates'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    if (difficulty === 1) {
      const r = rng.pick([2, 3, 4, 5, 6, 7, 8, 10, 12]);
      return {
        body: `Write the equation of the circle with centre ${math('(0, 0)')} and radius ${r}.`,
        answer: math(`x^2 + y^2 = ${r * r}`),
        distractors: [`x^2 + y^2 = ${r}`, `x^2 + y^2 = ${2 * r}`, `x + y = ${r}`].map(math),
        solution: `A circle centred at the origin with radius ${math('r')} is ${math('x^2 + y^2 = r^2')}, so ${math(`x^2 + y^2 = ${r * r}`)}.`,
      };
    }
    const N = optNum(o, 'size', 8);
    const x = rng.nonZero(-N, N), y = rng.nonZero(-N, N);
    const r2 = x * x + y * y;
    if (difficulty === 2) {
      return {
        body: `A circle centred at the origin passes through ${math(`(${x}, ${y})`)}. Write its equation.`,
        answer: math(`x^2 + y^2 = ${r2}`),
        distractors: [`x^2 + y^2 = ${Math.abs(x) + Math.abs(y)}`, `x^2 + y^2 = ${round(Math.sqrt(r2), 2)}`, `x^2 + y^2 = ${(x + y) ** 2}`].filter((d) => d !== `x^2 + y^2 = ${r2}`).map(math),
        solution: `${math(`r^2 = (${x})^2 + (${y})^2 = ${r2}`)}, so ${math(`x^2 + y^2 = ${r2}`)}.`,
      };
    }
    const onCircle = rng.next() < 0.5;
    const rr = onCircle ? r2 : r2 + rng.nonZero(-3, 3);
    return {
      body: `Is the point ${math(`(${x}, ${y})`)} on the circle ${math(`x^2 + y^2 = ${rr}`)}?`,
      answer: onCircle ? `Yes: ${math(`(${x})^2 + (${y})^2 = ${r2}`)}.` : `No: ${math(`(${x})^2 + (${y})^2 = ${r2} != ${rr}`)}.`,
      distractors: onCircle
        ? [`No: ${math(`(${x})^2 + (${y})^2 = ${r2 + 2}`)}.`, `No: ${math(`${sub(x)} + ${sub(y)} != ${rr}`)}.`, `Yes: ${math(`${sub(x)} + ${sub(y)} = ${x + y}`)}.`]
        : [`Yes: ${math(`(${x})^2 + (${y})^2 = ${rr}`)}.`, `Yes: ${math(`${Math.abs(x)} + ${Math.abs(y)} < ${rr}`)}.`, `No: ${math(`${sub(x)} + ${sub(y)} = ${x + y}`)}.`],
      solution: `Substitute: ${math(`(${x})^2 + (${y})^2 = ${r2}`)}, which ${onCircle ? 'equals' : 'does not equal'} ${rr}. The point is ${onCircle ? '' : 'not '}on the circle.`,
    };
  },
});

export const ratioExact = pc40s('40s-ratio-exact', {
  points: 1,
  levels: { 1: 'sin, cos, tan in degrees', 2: 'All six ratios in radians', 3: 'Negative and large angles' },
  options: [
    radioOption('unit', 'Angles in', [['deg', 'Degrees'], ['rad', 'Radians'], ['either', 'Either']], ['deg', 'rad', 'rad']),
    radioOption('ratios', 'Ratios', [['primary', 'sin, cos, tan'], ['reciprocal', 'csc, sec, cot'], ['all', 'All six']], ['primary', 'all', 'all']),
    radioOption('range', 'Angles', [['basic', 'One rotation (0 to 360°)'], ['wide', 'Negative and beyond one rotation']], ['basic', 'basic', 'wide']),
  ],
  generate(rng, difficulty, o) {
    const ratios = optOne(o, 'ratios', difficulty === 1 ? 'primary' : 'all');
    const fns: TrigFn[] = ratios === 'primary' ? ['sin', 'cos', 'tan'] : ratios === 'reciprocal' ? ['csc', 'sec', 'cot'] : ['sin', 'cos', 'tan', 'csc', 'sec', 'cot'];
    const fn = rng.pick(fns);
    const base = rng.pick(SPECIAL_ANGLES);
    const d = optOne(o, 'range', difficulty === 3 ? 'wide' : 'basic') === 'wide' ? base + 360 * rng.pick([-1, -2, 1, 2]) : base;
    const u = optOne(o, 'unit', difficulty === 1 ? 'deg' : 'rad');
    const unit: Unit = u === 'either' ? rng.pick(['deg', 'rad'] as const) : (u as Unit);
    const value = exactTrig(fn, d);
    const answer = exactTypst(value);
    // Common slips: the wrong sign (quadrant), the cofunction, the reciprocal, and swapping the
    // 30° and 60° reference angles within the same quadrant.
    const cofunction: Record<TrigFn, TrigFn> = { sin: 'cos', cos: 'sin', tan: 'cot', cot: 'tan', csc: 'sec', sec: 'csc' };
    const swapped = d - refAngle(d) * (quadrantOf(d) % 2 === 1 ? 1 : -1) + (90 - refAngle(d)) * (quadrantOf(d) % 2 === 1 ? 1 : -1);
    const wrong = [exactTrig(fn, d + 180), exactTrig(cofunction[fn], d), exactTrig(reciprocalFn(fn), d), exactTrig(fn, swapped), exactTrig(fn, -d)]
      .map((e) => (e === null ? '"undefined"' : exactTypst(e)))
      .concat(value ? [exactTypst({ ...value, a: -value.a, b: -value.b })] : ['0'])
      .filter((w) => w !== answer);
    const rad = radians(d);
    const angleText = unit === 'deg' ? `${d}°` : /^[a-z0-9]+$/.test(rad) ? rad : `(${rad})`;
    return {
      body: `Find the exact value of ${math(`${fn} ${angleText}`)}.`,
      answer: math(answer),
      distractors: [...new Set(wrong)].map(math),
      solution: value === null
        ? `${math(`${fn} ${angle(d, unit)}`)} would divide by zero, so it is undefined.`
        : `The reference angle is ${math(angle(refAngle(d), unit))} and the terminal arm is ${d % 90 === 0 ? 'on an axis' : `in quadrant ${quadrantName(quadrantOf(d))}`}, so ${math(`${fn} ${angle(d, unit)} = ${answer}`)}.`,
    };
  },
});

export const ratioApprox = pc40s('40s-ratio-approx', {
  points: 1,
  levels: { 1: 'Degrees', 2: 'Radians', 3: 'Reciprocal ratios' },
  options: [
    radioOption('unit', 'Angles in', [['deg', 'Degrees'], ['rad', 'Radians'], ['either', 'Either']], ['deg', 'rad', 'either']),
    radioOption('ratios', 'Ratios', [['primary', 'sin, cos, tan'], ['reciprocal', 'csc, sec, cot'], ['all', 'All six']], ['primary', 'primary', 'reciprocal']),
  ],
  generate(rng, difficulty, o) {
    const ratios = optOne(o, 'ratios', difficulty === 3 ? 'reciprocal' : 'primary');
    const fn: TrigFn = rng.pick(ratios === 'primary' ? ['sin', 'cos', 'tan'] : ratios === 'reciprocal' ? ['csc', 'sec', 'cot'] : ['sin', 'cos', 'tan', 'csc', 'sec', 'cot']);
    const u = optOne(o, 'unit', difficulty === 1 ? 'deg' : difficulty === 2 ? 'rad' : 'either');
    const inRad = u === 'rad' || (u === 'either' && rng.next() < 0.5);
    const value = inRad ? rng.int(1, 60) / 10 : rng.int(1, 359);
    const r = inRad ? value : (value * Math.PI) / 180;
    const f = (t: number, name: TrigFn) => ({ sin: Math.sin(t), cos: Math.cos(t), tan: Math.tan(t), csc: 1 / Math.sin(t), sec: 1 / Math.cos(t), cot: 1 / Math.tan(t) }[name]);
    const answer = round(f(r, fn), 4);
    const otherMode = inRad ? (value * Math.PI) / 180 : value;
    const inverse = ['csc', 'sec', 'cot'].includes(fn) ? round(f(r, reciprocalFn(fn)), 4) : round(f(r, fn === 'sin' ? 'cos' : fn === 'cos' ? 'sin' : 'cot'), 4);
    return {
      body: `Use technology to evaluate ${math(`${fn} ${inRad ? value : `${value}°`}`)} to four decimal places.`,
      answer: math(answer),
      distractors: [round(f(otherMode, fn), 4), inverse, round(-f(r, fn), 4)].filter((v) => v !== answer && v !== 'NaN' && !v.includes('Infinity')).map(math),
      solution: ['csc', 'sec', 'cot'].includes(fn)
        ? `${math(`${fn} theta = 1/(${reciprocalFn(fn)} theta)`)}, so ${math(`${fn} ${inRad ? value : `${value}°`} = 1/(${reciprocalFn(fn)} ${inRad ? value : `${value}°`}) approx ${answer}`)} (calculator in ${inRad ? 'radian' : 'degree'} mode).`
        : `With the calculator in ${inRad ? 'radian' : 'degree'} mode, ${math(`${fn} ${inRad ? value : `${value}°`} approx ${answer}`)}.`,
    };
  },
});

export const ratioTerminalPoint = pc40s('40s-ratio-terminal-point', {
  levels: { 1: 'Quadrants I and II', 2: 'Any quadrant', 3: 'Radical values of r' },
  options: [
    radioOption('quadrants', 'Quadrants', [['12', 'I and II'], ['any', 'Any']], ['12', 'any', 'any']),
    radioOption('r', 'Distance r', [['whole', 'A whole number'], ['radical', 'A radical']], ['whole', 'whole', 'radical']),
  ],
  generate(rng, difficulty, o) {
    const { x, y } = terminalPoint(rng, difficulty, { quadrants: optOne(o, 'quadrants', difficulty === 1 ? '12' : 'any'), radical: optOne(o, 'r', difficulty === 3 ? 'radical' : 'whole') === 'radical' });
    const fn = rng.pick(['sin', 'cos', 'tan', 'csc', 'sec', 'cot'] as const);
    const answer = ratioFromPoint(fn, x, y);
    const r2 = x * x + y * y;
    const rText = Number.isInteger(Math.sqrt(r2)) ? String(Math.sqrt(r2)) : surd(0, 1, r2);
    return {
      body: `The point ${math(`P(${x}, ${y})`)} is on the terminal arm of an angle ${math('theta')} in standard position. Find the exact value of ${math(`${fn} theta`)}.`,
      answer: math(answer),
      distractors: [ratioFromPoint(reciprocalFn(fn), x, y), ratioFromPoint(fn, -x, y), ratioFromPoint(fn, y, x), ratioFromPoint(fn, x, -y)].filter((d) => d !== answer).map(math),
      solution: `${math(`r = sqrt((${x})^2 + (${y})^2) = ${rText}`)}. Then ${math(`${fn} theta = ${{ sin: 'y/r', cos: 'x/r', tan: 'y/x', csc: 'r/y', sec: 'r/x', cot: 'x/y' }[fn]} = ${answer}`)}.`,
    };
  },
});

export const ratioTerminalAngle = pc40s('40s-ratio-terminal-angle', {
  levels: { 1: 'Special points (exact)', 2: 'Any point (degrees)', 3: 'Two angles in −360° ≤ θ ≤ 360°' },
  options: [
    radioOption('form', 'Point', [['1', 'Special points (exact)'], ['2', 'Any point (degrees)'], ['3', 'Two angles in −360° ≤ θ ≤ 360°']], ['1', '2', '3']),
    radioOption('unit', 'Answer in (special points)', [['deg', 'Degrees'], ['rad', 'Radians'], ['either', 'Either']], ['either', 'either', 'either']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    if (difficulty === 1) {
      const d = rng.pick(SPECIAL_ANGLES.filter((a) => a % 90 !== 0));
      const k = rng.int(1, 4);
      const c = exactTrig('cos', d)!, s = exactTrig('sin', d)!;
      // Scale the unit-circle point by 2k so coordinates are simple: (−√3, 1) etc.
      const coord = (e: Exact) => surd(e.a * 2 * k, e.b * 2 * k, e.r, e.d);
      const px = coord(c), py = coord(s);
      const u = optOne(o, 'unit', 'either');
      const unit: Unit = u === 'either' ? rng.pick(['deg', 'rad'] as const) : u as Unit;
      return {
        body: `The point ${math(`(${px}, ${py})`)} is on the terminal arm of ${math('theta')}, where ${math(domainText(0, 360, unit, 'theta'))}. Find the exact value of ${math('theta')}.`,
        answer: math(`theta = ${angle(d, unit)}`),
        distractors: [angle(180 - d, unit), angle(d + 180, unit), angle(90 - refAngle(d) + (quadrantOf(d) - 1) * 90, unit)].filter((a) => a !== angle(d, unit)).map((a) => math(`theta = ${a}`)),
        solution: `The point is in quadrant ${quadrantName(quadrantOf(d))} with reference angle ${math(angle(refAngle(d), unit))} (from ${math(`tan theta_r = abs(${py})/abs(${px})`)}). So ${math(`theta = ${angle(d, unit)}`)}.`,
      };
    }
    const { x, y } = terminalPoint(rng, difficulty === 2 ? 2 : 3);
    const principal = (Math.atan2(y, x) * 180) / Math.PI;
    const p = principal < 0 ? principal + 360 : principal;
    const ref = (Math.atan(Math.abs(y / x)) * 180) / Math.PI;
    if (difficulty === 2) {
      return {
        body: `The point ${math(`(${x}, ${y})`)} is on the terminal arm of ${math('theta')}, where ${math('0° <= theta < 360°')}. Find ${math('theta')} to the nearest tenth of a degree.`,
        answer: math(`theta approx ${round(p, 1)}°`),
        distractors: [round(ref, 1), round((360 - p) % 360, 1), round((p + 180) % 360, 1)].filter((v) => v !== round(p, 1)).map((v) => math(`theta approx ${v}°`)),
        solution: `The reference angle is ${math(`tan^(-1)(${Math.abs(y)}/${Math.abs(x)}) approx ${round(ref, 1)}°`)}. The point is in quadrant ${quadrantName(quadrantOf(p))}, so ${math(`theta approx ${round(p, 1)}°`)}.`,
      };
    }
    const both = [p - 360, p];
    return {
      body: `The point ${math(`(${x}, ${y})`)} is on the terminal arm of ${math('theta')}. Find all values of ${math('theta')} in ${math('-360° <= theta <= 360°')}, to the nearest tenth of a degree.`,
      answer: math(`theta approx ${both.map((v) => `${round(v, 1)}°`).join(', ')}`),
      distractors: [
        `theta approx ${round(p, 1)}°`,
        `theta approx ${round(ref, 1)}°, ${round(ref - 360, 1)}°`,
        `theta approx ${round(p, 1)}°, ${round(-p, 1)}°`,
      ].map(math),
      solution: `The reference angle is ${math(`approx ${round(ref, 1)}°`)}, so in quadrant ${quadrantName(quadrantOf(p))}, ${math(`theta approx ${round(p, 1)}°`)}. Subtract ${math('360°')} for the coterminal negative angle: ${math(`${round(p - 360, 1)}°`)}.`,
    };
  },
});

export const ratioGivenOne = pc40s('40s-ratio-given-one', {
  levels: { 1: 'Rational values', 2: 'Radical values', 3: 'Given a reciprocal ratio and a sign' },
  options: [
    radioOption('values', 'Values', [['rational', 'Rational'], ['radical', 'Radicals']], ['rational', 'radical', 'rational']),
    radioOption('given', 'The given ratio', [['primary', 'sin, cos, or tan'], ['reciprocal', 'csc, sec, or cot']], ['primary', 'primary', 'reciprocal']),
    radioOption('condition', 'The quadrant is', [['quadrant', 'Stated'], ['sign', 'Given by the sign of another ratio']], ['quadrant', 'quadrant', 'sign']),
  ],
  generate(rng, difficulty, o) {
    const { x, y, q } = terminalPoint(rng, 2, { quadrants: 'any', radical: optOne(o, 'values', difficulty === 2 ? 'radical' : 'rational') === 'radical' });
    const givenFn: TrigFn = optOne(o, 'given', difficulty === 3 ? 'reciprocal' : 'primary') === 'reciprocal' ? rng.pick(['csc', 'sec', 'cot'] as const) : rng.pick(['sin', 'cos', 'tan'] as const);
    const askFn = rng.pick((['sin', 'cos', 'tan', 'csc', 'sec', 'cot'] as TrigFn[]).filter((f) => f !== givenFn && f !== reciprocalFn(givenFn)));
    const given = ratioFromPoint(givenFn, x, y);
    const answer = ratioFromPoint(askFn, x, y);
    const [sx, sy] = QUADRANT_SIGNS[q];
    // State the quadrant directly, or (level 3) with the sign of a ratio that, together with the
    // given one, fixes the quadrant: csc gives the sign of y, so add x (cos); sec and cot need y (sin).
    const hintFn: TrigFn = givenFn === 'csc' ? 'cos' : 'sin';
    const hintSign = { sin: sy, cos: sx, tan: sx * sy, csc: sy, sec: sx, cot: sx * sy }[hintFn];
    const condition = optOne(o, 'condition', difficulty === 3 ? 'sign' : 'quadrant') === 'sign' ? `${math(`${hintFn} theta ${hintSign > 0 ? '>' : '<'} 0`)}` : `${math('theta')} in quadrant ${quadrantName(q)}`;
    return {
      body: `Given ${math(`${givenFn} theta = ${given}`)} and ${condition}, find the exact value of ${math(`${askFn} theta`)}.`,
      answer: math(answer),
      distractors: [ratioFromPoint(askFn, -x, y), ratioFromPoint(askFn, x, -y), ratioFromPoint(reciprocalFn(askFn), x, y), ratioFromPoint(askFn, y, x)].filter((d) => d !== answer).map(math),
      solution: `Draw a reference triangle in quadrant ${quadrantName(q)}: ${math(`x = ${x}`)}, ${math(`y = ${y}`)}, ${math(`r = ${Number.isInteger(Math.sqrt(x * x + y * y)) ? Math.sqrt(x * x + y * y) : surd(0, 1, x * x + y * y)}`)}. Then ${math(`${askFn} theta = ${answer}`)}.`,
    };
  },
});

export const ratioFindAngles = pc40s('40s-ratio-find-angles', {
  levels: { 1: 'Degrees, 0° to 360°', 2: 'Radians, 0 to 2π', 3: 'Reciprocal ratios, −2π to 2π' },
  options: [
    radioOption('unit', 'Angles in', [['deg', 'Degrees'], ['rad', 'Radians']], ['deg', 'rad', 'rad']),
    radioOption('ratios', 'Ratios', [['primary', 'sin, cos, tan'], ['reciprocal', 'csc, sec, cot'], ['all', 'All six']], ['primary', 'primary', 'reciprocal']),
    radioOption('domain', 'Domain', [['one', 'One rotation (0 to 360° or 2π)'], ['two', 'Two rotations (−360° to 360°, or −2π to 2π)']], ['one', 'one', 'two']),
  ],
  generate(rng, difficulty, o) {
    const ratios = optOne(o, 'ratios', difficulty === 3 ? 'reciprocal' : 'primary');
    const fn: TrigFn = rng.pick(ratios === 'primary' ? ['sin', 'cos', 'tan'] : ratios === 'reciprocal' ? ['csc', 'sec', 'cot'] : ['sin', 'cos', 'tan', 'csc', 'sec', 'cot']);
    const unit: Unit = optOne(o, 'unit', difficulty === 1 ? 'deg' : 'rad') === 'deg' ? 'deg' : 'rad';
    const two = optOne(o, 'domain', difficulty === 3 ? 'two' : 'one') === 'two';
    const [lo, hi] = two ? [-360, 360] : [0, 360];
    let d: number, value: Exact | null;
    do { d = rng.pick(SPECIAL_ANGLES); value = exactTrig(fn, d); } while (value === null);
    // Level 3's domain includes its upper end.
    const top = two ? hi + 1 : hi;
    const sols = solveSpecial(fn, value, lo, top);
    const answer = solutionList(sols, unit, 'theta');
    const flipped = solveSpecial(fn, { ...value, a: -value.a, b: -value.b }, lo, top);
    const reflected = [...new Set(sols.map((a) => (a === 0 ? 0 : a > 0 ? 360 - a : -360 - a)))].sort((a, b) => a - b);
    return {
      body: `Solve for ${math('theta')}, where ${math(domainText(lo, hi, unit, 'theta', two))}: ${math(`${fn} theta = ${exactTypst(value)}`)}`,
      answer: math(answer),
      // Only one solution, the wrong sign, reflected angles, mixing up sine and cosine, or the reference angle alone.
      distractors: [
        sols.slice(0, 1), flipped, reflected,
        solveSpecial(({ sin: 'cos', cos: 'sin', tan: 'cot', cot: 'tan', csc: 'sec', sec: 'csc' } as const)[fn], value, lo, top),
        [refAngle(d)],
      ].map((list) => solutionList(list, unit, 'theta')).filter((x) => x !== answer).map(math),
      solution: `${fn === 'csc' || fn === 'sec' || fn === 'cot' ? `Rewrite as ${math(`${reciprocalFn(fn)} theta = ${exactTypst(exactTrig(reciprocalFn(fn), d))}`)}. ` : ''}The reference angle is ${math(angle(refAngle(d), unit))}. ${math(`${fn} theta`)} is ${exactValue(value) > 0 ? 'positive' : exactValue(value) < 0 ? 'negative' : 'zero'} ${exactValue(value) === 0 ? 'on an axis' : 'in the matching quadrants'}, so ${math(answer)}.`,
    };
  },
});

export const ratioProblem = pc40s('40s-ratio-problem', {
  levels: { 1: 'Point on a circle, special angle', 2: 'Point on a circle, any angle', 3: 'Angle of rotation from a point' },
  options: [
    radioOption('form', 'Problem', [['1', 'Point on a circle, special angle'], ['2', 'Point on a circle, any angle'], ['3', 'Angle of rotation from a point']], ['1', '2', '3']),
    sizeOption([5, 12, 20], [12, 12, 12], 'Largest radius'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const r = rng.int(2, optNum(o, 'size', 12));
    if (difficulty === 1) {
      const d = rng.pick(SPECIAL_ANGLES.filter((a) => a % 90 !== 0));
      const cx = exactTrig('cos', d)!, sy = exactTrig('sin', d)!;
      const answer = `(${surd(cx.a * r, cx.b * r, cx.r, cx.d)}, ${surd(sy.a * r, sy.b * r, sy.r, sy.d)})`;
      return {
        body: `A point starts at ${math(`(${r}, 0)`)} and rotates counterclockwise ${math(radians(d))} about the origin. Find its exact coordinates.`,
        answer: math(answer),
        distractors: [`(${surd(sy.a * r, sy.b * r, sy.r, sy.d)}, ${surd(cx.a * r, cx.b * r, cx.r, cx.d)})`, `(${exactTypst(cx)}, ${exactTypst(sy)})`, `(${surd(-cx.a * r, -cx.b * r, cx.r, cx.d)}, ${surd(sy.a * r, sy.b * r, sy.r, sy.d)})`].filter((d2) => d2 !== answer).map(math),
        solution: `The point is ${math(`(r cos theta, r sin theta) = (${r} cos ${radians(d)}, ${r} sin ${radians(d)}) = ${answer}`)}.`,
      };
    }
    if (difficulty === 2) {
      const d = rng.int(10, 350);
      const x = r * Math.cos((d * Math.PI) / 180), y = r * Math.sin((d * Math.PI) / 180);
      return {
        body: `A point on a wheel of radius ${r} m starts at ${math(`(${r}, 0)`)} and rotates counterclockwise ${math(`${d}°`)}. Find its coordinates to the nearest tenth.`,
        answer: math(`(${round(x, 1)}, ${round(y, 1)})`),
        distractors: [`(${round(y, 1)}, ${round(x, 1)})`, `(${round(Math.cos(d) * r, 1)}, ${round(Math.sin(d) * r, 1)})`, `(${round(x / r, 1)}, ${round(y / r, 1)})`].map(math),
        solution: math(`(${r} cos ${d}°, ${r} sin ${d}°) approx (${round(x, 1)}, ${round(y, 1)})`),
      };
    }
    const { x, y } = terminalPoint(rng, 2);
    const p = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
    return {
      body: `A point rotates counterclockwise about the origin from the positive x-axis and stops at ${math(`(${x}, ${y})`)}. Through what angle, between ${math('0')} and ${math('2pi')}, did it rotate? Give the answer in radians to two decimal places.`,
      answer: math(round((p * Math.PI) / 180, 2)),
      distractors: [round(Math.atan(Math.abs(y / x)), 2), round(((360 - p) * Math.PI) / 180, 2), round(p, 2)].filter((v) => v !== round((p * Math.PI) / 180, 2)).map(math),
      solution: `The reference angle is ${math(`tan^(-1)(${Math.abs(y)}/${Math.abs(x)}) approx ${round(Math.atan(Math.abs(y / x)), 2)}`)}. In quadrant ${quadrantName(quadrantOf(p))}, the rotation is ${math(`approx ${round((p * Math.PI) / 180, 2)}`)}.`,
    };
  },
});

export const ANGLE_GENERATORS = [angDegToRad, angRadToDeg, angCoterminal, angCoterminalGeneral, angArcLength, angSketch, ucPoint, ucCircleEquation, ratioExact, ratioApprox, ratioTerminalPoint, ratioTerminalAngle, ratioGivenOne, ratioFindAngles, ratioProblem];
