import type { Rng } from '../../rng.ts';
import type { GenOptions } from '../../types.ts';
import { gcd, round } from '../../format.ts';
import { exactTrig, exactTypst, Q, SPECIAL_ANGLES, Surds } from '../../exact.ts';
import { graphTypst, type Pt } from '../../graph.ts';
import { math, pc30s } from '../pc40s/common.ts';
import { optNum, optOn, optOne, radioOption, sizeOption, toggleOption } from '../../options.ts';
import { angleSketch, quadrantOf, ratioFromPoint, refAngle, solveSpecial } from '../pc40s/angles.ts';

const QUAD = ['', 'I', 'II', 'III', 'IV'];
const PRIMARY: Array<'sin' | 'cos' | 'tan'> = ['sin', 'cos', 'tan'];
const deg = (d: number) => `${d}°`;
const rad = (d: number) => (d * Math.PI) / 180;
const TRIPLES: Array<[number, number, number]> = [[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25]];

/** Angles in [0°, 360°) with the same reference angle, in order. */
const sameReference = (r: number) => [...new Set([r, 180 - r, 180 + r, 360 - r].map((a) => a % 360))].sort((a, b) => a - b);

/** A point with integer coordinates in a quadrant: from a triple, or with a radical r. */
function pointIn(rng: Rng, q: number, triple = true, N = 7): [number, number] {
  const sx = q === 1 || q === 4 ? 1 : -1, sy = q <= 2 ? 1 : -1;
  if (triple) { const [a, b] = rng.pick(TRIPLES); const [p, s] = rng.next() < 0.5 ? [a, b] : [b, a]; return [sx * p, sy * s]; }
  for (;;) { const p = rng.int(1, N), s = rng.int(1, N); if (!Number.isInteger(Math.hypot(p, s))) return [sx * p, sy * s]; }
}

/** The ratio chosen by the option, or a random one. */
const fnOf = (rng: Rng, o: GenOptions | undefined, pool: Array<'sin' | 'cos' | 'tan'> = PRIMARY): 'sin' | 'cos' | 'tan' => {
  const f = optOne(o, 'fn', 'any');
  return f === 'any' || !pool.includes(f as 'sin') ? rng.pick(pool) : f as 'sin' | 'cos' | 'tan';
};
const rText = (x: number, y: number) => Surds.of(1, x * x + y * y).typst();

/**
 * Wrong ratios for a point on the terminal arm: the other primary ratios, the
 * reciprocal, the opposite sign, and x and y swapped.
 */
function pointDistractors(fn: 'sin' | 'cos' | 'tan', x: number, y: number): string[] {
  const answer = ratioFromPoint(fn, x, y);
  const reciprocal = ({ sin: 'csc', cos: 'sec', tan: 'cot' } as const)[fn];
  const pool = [
    ...PRIMARY.filter((f) => f !== fn).map((f) => ratioFromPoint(f, x, y)),
    ratioFromPoint(reciprocal, x, y),
    ratioFromPoint(fn, -x, -y) === answer ? ratioFromPoint(fn, x, -y) : ratioFromPoint(fn, -x, -y),
    ratioFromPoint(fn, y, x),
  ];
  return pool.filter((d, i, all) => d !== answer && all.indexOf(d) === i);
}

// ── Angles in standard position ───────────────────────────────────────────

export const angReference = pc30s('30s-ang-reference', {
  points: 1,
  levels: { 1: 'Special angles', 2: 'Any angle', 3: 'The angle from its reference angle and quadrant' },
  options: [
    radioOption('form', 'Given', [['1', 'Special angles'], ['2', 'Any angle'], ['3', 'The angle from its reference angle and quadrant']], ['1', '2', '3']),
    radioOption('quad', 'Quadrant (last two forms)', [['any', 'Any'], ['2', 'II'], ['3', 'III'], ['4', 'IV']], ['any', 'any', 'any']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    if (difficulty === 3) {
      const quad = optOne(o, 'quad', 'any');
      const r = rng.int(5, 85), q = quad === 'any' ? rng.int(2, 4) : Number(quad);
      const theta = [0, r, 180 - r, 180 + r, 360 - r][q];
      return {
        body: `An angle in standard position has a reference angle of ${math(deg(r))} and terminates in quadrant ${QUAD[q]}. Find the angle.`,
        answer: math(deg(theta)),
        distractors: sameReference(r).filter((a) => a !== theta).map((a) => math(deg(a))),
        solution: `In quadrant ${QUAD[q]}, ${q === 2 ? math(`theta = 180° - ${r}°`) : q === 3 ? math(`theta = 180° + ${r}°`) : math(`theta = 360° - ${r}°`)} ${math(`= ${theta}°`)}.`,
      };
    }
    const theta = difficulty === 1 ? rng.pick(SPECIAL_ANGLES.filter((a) => a % 90 !== 0)) : (() => { const quad = optOne(o, 'quad', 'any'); const ranges = [[91, 179], [181, 269], [271, 359]]; const [lo, hi] = quad === 'any' ? rng.pick(ranges) : ranges[Number(quad) - 2]; return rng.int(lo, hi); })();
    const r = refAngle(theta);
    return {
      body: `Find the reference angle for ${math(deg(theta))}.`,
      answer: math(deg(r)),
      distractors: [180 - theta, 360 - theta, theta - 90, 90 - r, theta - 180, 180 - r, theta % 90].filter((a) => a > 0 && a !== r && a < 360).map((a) => math(deg(a))).filter((d, i, all) => all.indexOf(d) === i),
      solution: `${math(deg(theta))} terminates in quadrant ${QUAD[quadrantOf(theta)]}. The reference angle is the acute angle to the x-axis: ${math(`${deg(r)}`)}.`,
    };
  },
});

export const angQuadrant = pc30s('30s-ang-quadrant', {
  points: 1,
  levels: { 1: 'From the angle', 2: 'Angles on the axes too', 3: 'From the signs of two ratios' },
  options: [
    radioOption('form', 'Given', [['1', 'From the angle'], ['2', 'Angles on the axes too'], ['3', 'From the signs of two ratios']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const options = ['quadrant I', 'quadrant II', 'quadrant III', 'quadrant IV'];
    if (difficulty === 3) {
      const q = rng.int(1, 4);
      const signs = { sin: q <= 2 ? 1 : -1, cos: q === 1 || q === 4 ? 1 : -1, tan: q === 1 || q === 3 ? 1 : -1 };
      // The signs of any two different primary ratios pin down one quadrant.
      const shown = rng.shuffle(PRIMARY).slice(0, 2);
      return {
        body: `In which quadrant does ${math('theta')} terminate if ${math(`${shown[0]} theta ${signs[shown[0]] > 0 ? '>' : '<'} 0`)} and ${math(`${shown[1]} theta ${signs[shown[1]] > 0 ? '>' : '<'} 0`)}?`,
        answer: `Quadrant ${QUAD[q]}`,
        distractors: [1, 2, 3, 4].filter((v) => v !== q).map((v) => `Quadrant ${QUAD[v]}`),
        solution: `${math('sin theta')} is positive in quadrants I and II, ${math('cos theta')} in I and IV, and ${math('tan theta')} in I and III. Only quadrant ${QUAD[q]} fits both conditions.`,
      };
    }
    const axis = difficulty === 2 && rng.next() < 0.4;
    const theta = axis ? rng.pick([0, 90, 180, 270]) : rng.pick([rng.int(1, 89), rng.int(91, 179), rng.int(181, 269), rng.int(271, 359)]);
    const answer = axis ? (theta === 0 ? 'On the positive x-axis' : theta === 90 ? 'On the positive y-axis' : theta === 180 ? 'On the negative x-axis' : 'On the negative y-axis') : `Quadrant ${QUAD[quadrantOf(theta)]}`;
    const all = axis ? ['On the positive x-axis', 'On the positive y-axis', 'On the negative x-axis', 'On the negative y-axis'] : options.map((o) => o.charAt(0).toUpperCase() + o.slice(1));
    return {
      body: `Where does the terminal arm of ${math(deg(theta))} lie?`,
      answer,
      distractors: all.filter((o) => o !== answer),
      solution: `Quadrant I is 0° to 90°, II is 90° to 180°, III is 180° to 270°, and IV is 270° to 360°. ${math(deg(theta))} is ${answer.startsWith('Quadrant') ? answer.replace('Quadrant', 'in quadrant') : answer.charAt(0).toLowerCase() + answer.slice(1)}.`,
    };
  },
});

export const angSameReference = pc30s('30s-ang-same-reference', {
  points: 1,
  levels: { 1: 'From a special angle', 2: 'From any angle', 3: 'From an angle in another quadrant' },
  options: [
    radioOption('form', 'Start from', [['1', 'From a special angle'], ['2', 'From any angle'], ['3', 'From an angle in another quadrant']], ['1', '2', '3']),
    toggleOption('special', 'Special reference angles only', [true, false, false]),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const r = optOn(o, 'special', difficulty === 1) ? rng.pick([30, 45, 60]) : rng.int(5, 85);
    const start = difficulty === 3 ? rng.pick([180 - r, 180 + r, 360 - r]) : r;
    const all = sameReference(r);
    const answer = all.filter((a) => a !== start).map(deg).join(', ');
    return {
      body: `Find all other angles from ${math('0°')} to ${math('360°')} with the same reference angle as ${math(deg(start))}.`,
      answer: math(answer),
      distractors: [
        [start + 90, start + 180, start + 270].map((a) => a % 360).sort((a, b) => a - b).map(deg).join(', '),
        all.filter((a) => a !== start).slice(0, 2).map(deg).join(', '),
        [90 - r, 90 + r, 270 - r].map(deg).join(', '),
      ].filter((d) => d !== answer).map(math),
      solution: `The reference angle is ${math(deg(r))}. In each quadrant: ${math(`${r}°, 180° - ${r}°, 180° + ${r}°, 360° - ${r}°`)}, i.e. ${math(all.map(deg).join(', '))}. Leaving out ${math(deg(start))}: ${math(answer)}.`,
    };
  },
});

export const angReflectedPoints = pc30s('30s-ang-reflected-points', {
  levels: { 1: 'P(−x, y)', 2: 'P(−x, −y) or P(x, −y)', 3: 'Which point matches an angle' },
  options: [
    radioOption('form', 'Task', [['1', 'P(−x, y)'], ['2', 'P(−x, −y) or P(x, −y)'], ['3', 'Which point matches an angle']], ['1', '2', '3']),
    sizeOption([5, 9, 15], [9, 9, 9], 'Size of coordinates'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const N = optNum(o, 'size', 9);
    // The angle comes from the point (to the nearest degree), so the two always agree.
    let x = 1, y = 1, theta = 45;
    do { [x, y] = [rng.int(1, N), rng.int(1, N)]; theta = Math.round((Math.atan2(y, x) * 180) / Math.PI); } while (theta < 10 || theta > 80);
    const images: Array<[string, number]> = [[`P(-${x}, ${y})`, 180 - theta], [`P(-${x}, -${y})`, 180 + theta], [`P(${x}, -${y})`, 360 - theta]];
    if (difficulty === 3) {
      const [pt, angle] = rng.pick(images);
      return {
        body: `The point ${math(`P(${x}, ${y})`)} is on the terminal arm of an angle of about ${math(deg(theta))}. Which point is on the terminal arm of an angle of about ${math(deg(angle))}?`,
        answer: math(pt),
        distractors: [...images.filter(([p]) => p !== pt).map(([p]) => p), `P(${y}, ${x})`].map(math),
        solution: `${math(deg(angle))} has reference angle ${math(deg(theta))} and terminates in quadrant ${QUAD[quadrantOf(angle)]}, so the point is ${math(pt)}: the same distances from the axes, with the signs of that quadrant.`,
      };
    }
    const [pt, angle] = difficulty === 1 ? images[0] : rng.pick(images.slice(1));
    return {
      body: `The point ${math(`P(${x}, ${y})`)} is on the terminal arm of an angle of about ${math(deg(theta))}. To the nearest degree, find the angle in standard position whose terminal arm passes through ${math(pt)}.`,
      answer: math(deg(angle)),
      distractors: images.filter(([p]) => p !== pt).map(([, a]) => a).concat([90 + theta]).map((a) => math(deg(a))),
      solution: `${math(pt)} is a reflection of ${math(`P(${x}, ${y})`)}, so the reference angle is still ${math(deg(theta))}; it lies in quadrant ${QUAD[quadrantOf(angle)]}, giving ${math(deg(angle))}.`,
    };
  },
});

export const angSketch30 = pc30s('30s-ang-sketch', {
  points: 1,
  levels: { 1: 'Quadrants I and II', 2: 'Any quadrant', 3: 'Close to an axis' },
  options: [
    radioOption('form', 'Angles', [['1', 'Quadrants I and II'], ['2', 'Any quadrant'], ['3', 'Close to an axis']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const d = difficulty === 1 ? rng.pick([30, 45, 60, 120, 135, 150]) : difficulty === 2 ? rng.pick([210, 225, 240, 300, 315, 330, 100, 160]) : rng.pick([95, 175, 185, 265, 275, 355]);
    return {
      body: `Sketch ${math(deg(d))} in standard position.`,
      answer: angleSketch(d, 3.2),
      distractors: [angleSketch(360 - d, 3.2), angleSketch((180 + d) % 360, 3.2), angleSketch((d + 90) % 360, 3.2)],
      solution: `Start on the positive x-axis and rotate counterclockwise ${math(deg(d))}. The terminal arm is in quadrant ${QUAD[quadrantOf(d)]} with reference angle ${math(deg(refAngle(d)))}.`,
    };
  },
});

/** A sketch of the angle whose terminal arm passes through (x, y), with the point marked. */
function pointSketch(x: number, y: number, size: number): string {
  const d = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  const R = Math.max(Math.abs(x), Math.abs(y), 1);
  const scale = 4 / R;
  const spiral: Pt[] = [];
  for (let i = 0; i <= 40; i++) { const t = (d * i) / 40; spiral.push([1.2 * Math.cos(rad(t)), 1.2 * Math.sin(rad(t))]); }
  return graphTypst({
    xMin: -5, xMax: 5, yMin: -5, yMax: 5, width: size, height: size, grid: false, numbers: false,
    curves: [{ points: [[0, 0], [x * scale, y * scale]] }, { points: spiral, arrow: true }],
    dots: [{ x: x * scale, y: y * scale }],
    labels: [{ x: x * scale + (x > 0 ? 0.3 : -0.3), y: y * scale + (y > 0 ? 0.5 : -0.5), text: `(${x}, ${y})` }],
  });
}

export const angPointSketch = pc30s('30s-ang-point-sketch', {
  points: 1,
  levels: { 1: 'Quadrant II', 2: 'Any quadrant', 3: 'Then find the reference angle' },
  options: [
    radioOption('form', 'Task', [['1', 'Quadrant II'], ['2', 'Any quadrant'], ['3', 'Then find the reference angle']], ['1', '2', '3']),
    sizeOption([4, 7, 10], [7, 7, 7], 'Size of coordinates'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const q = difficulty === 1 ? 2 : rng.int(1, 4);
    const [x, y] = pointIn(rng, q, false, optNum(o, 'size', 7));
    return {
      body: `Draw the angle in standard position whose terminal arm passes through ${math(`P(${x}, ${y})`)}.${difficulty === 3 ? ' Then find its reference angle to the nearest degree.' : ''}`,
      answer: pointSketch(x, y, 3.2),
      distractors: [pointSketch(-x, y, 3.2), pointSketch(x, -y, 3.2), pointSketch(-x, -y, 3.2)],
      solution: `Plot ${math(`P(${x}, ${y})`)} in quadrant ${QUAD[q]} and draw the terminal arm from the origin through it.${difficulty === 3 ? ` The reference angle is ${math(`tan^(-1)(${Math.abs(y)}/${Math.abs(x)}) approx ${Math.round((Math.atan(Math.abs(y / x)) * 180) / Math.PI)}°`)}.` : ''}`,
    };
  },
});

// ── Primary trigonometric ratios ──────────────────────────────────────────

export const trigDistance = pc30s('30s-trig-distance', {
  points: 1,
  levels: { 1: 'Whole-number distances', 2: 'Radical distances', 3: 'Given r, find a coordinate' },
  options: [
    radioOption('form', 'Distance', [['1', 'Whole-number distances'], ['2', 'Radical distances'], ['3', 'Given r, find a coordinate']], ['1', '2', '3']),
    sizeOption([4, 7, 10], [7, 7, 7], 'Size of coordinates (radical distances)'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const q = rng.int(1, 4);
    if (difficulty === 3) {
      const [x, y] = pointIn(rng, q);
      const r = Math.hypot(x, y);
      return {
        body: `The point ${math(`P(${x}, y)`)} is on the terminal arm of an angle in quadrant ${QUAD[q]}, ${math(`r = ${r}`)} units from the origin. Find ${math('y')}.`,
        answer: math(`y = ${y}`),
        distractors: [`y = ${-y}`, `y = ${r - Math.abs(x)}`, `y = ${r * r - x * x}`].map(math),
        solution: `${math(`x^2 + y^2 = r^2`)}: ${math(`y^2 = ${r * r} - ${x * x} = ${y * y}`)}. In quadrant ${QUAD[q]}, ${math('y')} is ${y > 0 ? 'positive' : 'negative'}: ${math(`y = ${y}`)}.`,
      };
    }
    const [x, y] = pointIn(rng, q, difficulty === 1, optNum(o, 'size', 7));
    const answer = rText(x, y);
    return {
      body: `Find the exact distance from the origin to ${math(`P(${x}, ${y})`)}.`,
      answer: math(answer),
      distractors: [String(Math.abs(x) + Math.abs(y)), Surds.of(1, Math.abs(x * x - y * y) || 2).typst(), String(x * x + y * y)].filter((d) => d !== answer).map(math),
      solution: math(`r = sqrt((${x})^2 + (${y})^2) = sqrt(${x * x + y * y}) = ${answer}`),
    };
  },
});

export const trigRatioFromPoint = pc30s('30s-trig-ratio-from-point', {
  levels: { 1: 'Quadrant I', 2: 'Any quadrant', 3: 'Radical values of r' },
  options: [
    radioOption('form', 'Point', [['1', 'Quadrant I'], ['2', 'Any quadrant'], ['3', 'Radical values of r']], ['1', '2', '3']),
    radioOption('fn', 'Ratio', [['sin', 'sin'], ['cos', 'cos'], ['tan', 'tan'], ['any', 'Any']], ['any', 'any', 'any']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const q = difficulty === 1 ? 1 : rng.int(1, 4);
    const [x, y] = pointIn(rng, q, difficulty < 3);
    const fn = fnOf(rng, o);
    const answer = ratioFromPoint(fn, x, y);
    return {
      body: `The point ${math(`P(${x}, ${y})`)} is on the terminal arm of ${math('theta')}. Find the exact value of ${math(`${fn} theta`)}.`,
      answer: math(answer),
      distractors: pointDistractors(fn, x, y).map(math),
      solution: `${math(`r = ${rText(x, y)}`)}. ${math(`${fn} theta = ${{ sin: 'y/r', cos: 'x/r', tan: 'y/x' }[fn]} = ${answer}`)}.`,
    };
  },
});

export const trigQuadrantal = pc30s('30s-trig-quadrantal', {
  points: 1,
  levels: { 1: 'sin and cos', 2: 'tan', 3: 'Expressions' },
  options: [
    radioOption('form', 'Task', [['1', 'sin and cos'], ['2', 'tan'], ['3', 'Expressions']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const angles = [0, 90, 180, 270, 360];
    if (difficulty === 3) {
      const [a, b] = [rng.pick(angles), rng.pick(angles)];
      const va = Math.round(Math.sin(rad(a))), vb = Math.round(Math.cos(rad(b)));
      const k = rng.int(2, 4);
      const value = k * va - vb;
      return {
        body: `Evaluate without technology: ${math(`${k} sin ${a}° - cos ${b}°`)}`,
        answer: math(String(value)),
        distractors: [k * va + vb, k * vb - va, value + k, -value].filter((v, i, all) => v !== value && all.indexOf(v) === i).map((v) => math(String(v))),
        solution: `${math(`sin ${a}° = ${va}`)} and ${math(`cos ${b}° = ${vb}`)} (from the points on the unit circle), so the value is ${math(`${k}(${va}) - (${vb}) = ${value}`)}.`,
      };
    }
    const fn: 'sin' | 'cos' | 'tan' = difficulty === 2 ? 'tan' : rng.pick(['sin', 'cos'] as const);
    const d = rng.pick(angles);
    const e = exactTrig(fn, d);
    const answer = e ? exactTypst(e) : '"undefined"';
    return {
      body: `Find the value of ${math(`${fn} ${d}°`)} without technology.`,
      answer: math(answer),
      distractors: ['0', '1', '-1', '"undefined"'].filter((w) => w !== answer).map(math),
      solution: `The terminal arm of ${math(deg(d))} passes through ${math(`(${Math.round(Math.cos(rad(d)))}, ${Math.round(Math.sin(rad(d)))})`)} on the unit circle, so ${math(`${fn} ${d}° = ${fn === 'tan' ? `y/x` : fn === 'sin' ? 'y' : 'x'} = ${answer}`)}${answer === '"undefined"' ? ' (division by zero)' : ''}.`,
    };
  },
});

export const trigSign = pc30s('30s-trig-sign', {
  points: 1,
  levels: { 1: 'For a given angle', 2: 'For a quadrant', 3: 'Quadrants where two conditions hold' },
  options: [
    radioOption('form', 'Task', [['1', 'For a given angle'], ['2', 'For a quadrant'], ['3', 'Quadrants where two conditions hold']], ['1', '2', '3']),
    radioOption('fn', 'Ratio', [['sin', 'sin'], ['cos', 'cos'], ['tan', 'tan'], ['any', 'Any']], ['any', 'any', 'any']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const fn = fnOf(rng, o);
    const positive = (q: number) => ({ sin: q <= 2, cos: q === 1 || q === 4, tan: q === 1 || q === 3 }[fn]);
    if (difficulty < 3) {
      const d = difficulty === 1 ? rng.pick([rng.int(91, 179), rng.int(181, 269), rng.int(271, 359)]) : 0;
      const q = difficulty === 1 ? quadrantOf(d) : rng.int(1, 4);
      const answer = positive(q) ? 'Positive' : 'Negative';
      return {
        body: difficulty === 1 ? `Is ${math(`${fn} ${d}°`)} positive or negative? Explain without technology.` : `Is ${math(`${fn} theta`)} positive or negative when ${math('theta')} is in quadrant ${QUAD[q]}?`,
        answer: `${answer}`,
        distractors: [positive(q) ? 'Negative' : 'Positive', 'Zero', 'It depends on the angle'],
        solution: `In quadrant ${QUAD[q]}, ${math('x')} is ${q === 1 || q === 4 ? 'positive' : 'negative'} and ${math('y')} is ${q <= 2 ? 'positive' : 'negative'}. ${math(`${fn} theta = ${{ sin: 'y/r', cos: 'x/r', tan: 'y/x' }[fn]}`)} is therefore ${answer.toLowerCase()}.`,
      };
    }
    const other = rng.pick(PRIMARY.filter((f) => f !== fn));
    const s1 = rng.pick([1, -1]), s2 = rng.pick([1, -1]);
    const pos = (f: string, q: number) => ({ sin: q <= 2, cos: q === 1 || q === 4, tan: q === 1 || q === 3 } as Record<string, boolean>)[f];
    const qs = [1, 2, 3, 4].filter((q) => pos(fn, q) === (s1 > 0) && pos(other, q) === (s2 > 0));
    const answer = qs.length ? `Quadrant ${qs.map((q) => QUAD[q]).join(' and ')}` : 'No quadrant';
    return {
      body: `In which quadrant(s) is ${math(`${fn} theta ${s1 > 0 ? '>' : '<'} 0`)} and ${math(`${other} theta ${s2 > 0 ? '>' : '<'} 0`)}?`,
      answer,
      distractors: ['Quadrant I', 'Quadrant II', 'Quadrant III', 'Quadrant IV', 'No quadrant'].filter((d) => d !== answer).slice(0, 4),
      solution: `${math('sin theta > 0')} in I and II, ${math('cos theta > 0')} in I and IV, ${math('tan theta > 0')} in I and III. Both conditions: ${answer.replace(/^Quadrant/, 'quadrant').replace(/^No quadrant/, 'no quadrant')}.`,
    };
  },
});

export const trigExact = pc30s('30s-trig-exact', {
  points: 1,
  levels: { 1: 'Quadrant I', 2: 'Any quadrant', 3: 'Expressions' },
  options: [
    radioOption('form', 'Angles', [['1', 'Quadrant I'], ['2', 'Any quadrant'], ['3', 'Expressions']], ['1', '2', '3']),
    radioOption('fn', 'Ratio', [['sin', 'sin'], ['cos', 'cos'], ['tan', 'tan'], ['any', 'Any']], ['any', 'any', 'any']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const pool = difficulty === 1 ? [30, 45, 60] : SPECIAL_ANGLES.filter((a) => a % 90 !== 0);
    if (difficulty === 3) {
      // k·sin²θ or k·cos²θ, which is always rational at a special angle.
      const d = rng.pick(pool), fn1 = fnOf(rng, o, ['sin', 'cos']) as 'sin' | 'cos', k = rng.int(2, 4);
      const e = exactTrig(fn1, d)!;
      const value = new Q(k * (e.a * e.a + e.b * e.b * e.r), e.d * e.d);
      const unsquared = new Surds([[e.a, 1], [e.b, e.r]]).scale(k).div(e.d);
      return {
        body: `Find the exact value: ${math(`${k} ${fn1}^2 ${d}°`)}`,
        answer: math(value.typst()),
        distractors: [unsquared.typst(), value.mul(2).typst(), String(k), new Q(k).sub(value).typst()].filter((w, i, all) => w !== value.typst() && all.indexOf(w) === i).map(math),
        solution: `${math(`${fn1} ${d}° = ${exactTypst(e)}`)}, so ${math(`${k} (${exactTypst(e)})^2 = ${value.typst()}`)}.`,
      };
    }
    const fn = fnOf(rng, o), d = rng.pick(pool);
    const e = exactTrig(fn, d);
    const answer = exactTypst(e);
    const cof = fn === 'sin' ? 'cos' : fn === 'cos' ? 'sin' : 'tan';
    const wrong = [exactTrig(fn, d + 180), exactTrig(cof, d), exactTrig(fn, 90 - refAngle(d) + (d - refAngle(d)))].map(exactTypst);
    return {
      body: `Find the exact value of ${math(`${fn} ${d}°`)}.`,
      answer: math(answer),
      distractors: [...new Set([...wrong, '1/2', 'sqrt(3)/2', 'sqrt(3)'])].filter((w) => w !== answer).slice(0, 4).map(math),
      solution: `The reference angle is ${math(deg(refAngle(d)))} in quadrant ${QUAD[quadrantOf(d)]}, where ${math(`${fn} theta`)} is ${exactTrig(fn, d) && (exactTrig(fn, d)!.a + exactTrig(fn, d)!.b) > 0 ? 'positive' : 'negative'}. So ${math(`${fn} ${d}° = ${answer}`)}.`,
    };
  },
});

export const trigGivenOne = pc30s('30s-trig-given-one', {
  levels: { 1: 'Rational values', 2: 'Radical values', 3: 'Quadrant given by a sign' },
  options: [
    radioOption('form', 'Values', [['1', 'Rational values'], ['2', 'Radical values'], ['3', 'Quadrant given by a sign']], ['1', '2', '3']),
    radioOption('given', 'Given ratio', [['sin', 'sin'], ['cos', 'cos'], ['tan', 'tan'], ['any', 'Any']], ['any', 'any', 'any']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const q = rng.int(1, 4);
    const [x, y] = pointIn(rng, q, difficulty !== 2);
    const g = optOne(o, 'given', 'any');
    const given = g === 'any' ? rng.pick(PRIMARY) : g as 'sin' | 'cos' | 'tan';
    const ask = rng.pick(PRIMARY.filter((f) => f !== given));
    // Level 3 fixes the quadrant with the sign of the third ratio (the asked ratio's sign would give the answer away).
    const third = PRIMARY.find((f) => f !== given && f !== ask)!;
    const thirdPositive = { sin: y > 0, cos: x > 0, tan: x * y > 0 }[third];
    const hint = difficulty === 3 ? math(`${third} theta ${thirdPositive ? '>' : '<'} 0`) : `${math('theta')} in quadrant ${QUAD[q]}`;
    const answer = ratioFromPoint(ask, x, y);
    // The smallest similar triangle, for the solution (the ratios are the same).
    const k = gcd(Math.abs(x), Math.abs(y)) || 1;
    return {
      body: `Given ${math(`${given} theta = ${ratioFromPoint(given, x, y)}`)} and ${hint}, find the exact value of ${math(`${ask} theta`)}.`,
      answer: math(answer),
      distractors: pointDistractors(ask, x, y).map(math),
      solution: `Sketch the reference triangle in quadrant ${QUAD[q]}: ${math(`x = ${x / k}`)}, ${math(`y = ${y / k}`)}, ${math(`r = ${rText(x / k, y / k)}`)}. Then ${math(`${ask} theta = ${answer}`)}.`,
    };
  },
});

export const trigSolve = pc30s('30s-trig-solve', {
  levels: { 1: 'Exact values', 2: 'To the nearest degree', 3: 'tan θ = a and negative values' },
  options: [
    radioOption('form', 'Equation', [['1', 'Exact values'], ['2', 'To the nearest degree'], ['3', 'tan θ = a and negative values']], ['1', '2', '3']),
    radioOption('fn', 'Ratio', [['sin', 'sin'], ['cos', 'cos'], ['tan', 'tan'], ['any', 'Any']], ['any', 'any', 'any']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    if (difficulty === 1) {
      const fn = fnOf(rng, o);
      let e = exactTrig(fn, rng.pick(SPECIAL_ANGLES));
      while (!e) e = exactTrig(fn, rng.pick(SPECIAL_ANGLES));
      const sols = solveSpecial(fn, e, 0, 360);
      const answer = `theta = ${sols.map(deg).join(', ')}`;
      const flipped = solveSpecial(fn, { ...e, a: -e.a, b: -e.b }, 0, 360);
      return {
        body: `Solve for ${math('0° <= theta < 360°')}: ${math(`${fn} theta = ${exactTypst(e)}`)}`,
        answer: math(answer),
        distractors: [sols.slice(0, 1), flipped, solveSpecial(fn === 'sin' ? 'cos' : fn === 'cos' ? 'sin' : 'cot', e, 0, 360)].map((l) => `theta = ${l.length ? l.map(deg).join(', ') : '"none"'}`).filter((d, i, all) => d !== answer && all.indexOf(d) === i).map(math),
        solution: `Find the reference angle for ${math(exactTypst(e))}, then use the quadrants where ${math(`${fn} theta`)} has that sign: ${math(answer)}.`,
      };
    }
    const fn: 'sin' | 'cos' | 'tan' = optOne(o, 'fn', 'any') !== 'any' ? fnOf(rng, o) : difficulty === 3 ? rng.pick(['tan', 'sin', 'cos'] as const) : rng.pick(['sin', 'cos'] as const);
    const value = fn === 'tan' ? rng.nonZero(-40, 40) / 10 : (difficulty === 3 ? -1 : 1) * rng.int(5, 95) / 100;
    const base = fn === 'sin' ? Math.asin(value) : fn === 'cos' ? Math.acos(value) : Math.atan(value);
    const b = (base * 180) / Math.PI;
    const raw = fn === 'sin' ? [b, 180 - b] : fn === 'cos' ? [b, 360 - b] : [b, b + 180];
    const sols = [...new Set(raw.map((a) => Math.round(((a % 360) + 360) % 360) % 360))].sort((p, q) => p - q);
    const answer = `theta approx ${sols.map(deg).join(', ')}`;
    const ref = Math.round((Math.abs(fn === 'sin' ? Math.asin(value) : fn === 'cos' ? Math.acos(Math.abs(value)) : Math.atan(value)) * 180) / Math.PI);
    return {
      body: `Solve for ${math('0° <= theta < 360°')}, to the nearest degree: ${math(`${fn} theta = ${value}`)}`,
      answer: math(answer),
      distractors: [`theta approx ${sols[0]}°`, `theta approx ${[ref, 180 - ref].map(deg).join(', ')}`, `theta approx ${[180 + ref, 360 - ref].map(deg).join(', ')}`, `theta approx ${[ref, 360 - ref].map(deg).join(', ')}`].filter((d, i, all) => d !== answer && all.indexOf(d) === i).map(math),
      solution: `The reference angle is ${math(`${fn}^(-1)(${Math.abs(value)}) approx ${ref}°`)}. ${math(`${fn} theta`)} is ${value > 0 ? 'positive' : 'negative'} in quadrants ${{ sin: value > 0 ? 'I and II' : 'III and IV', cos: value > 0 ? 'I and IV' : 'II and III', tan: value > 0 ? 'I and III' : 'II and IV' }[fn]}, so ${math(answer)}.`,
    };
  },
});

export const trigProblem = pc30s('30s-trig-problem', {
  levels: { 1: 'Angle of elevation', 2: 'Angle of depression', 3: 'A rotating arm' },
  options: [
    radioOption('form', 'Context', [['1', 'Angle of elevation'], ['2', 'Angle of depression'], ['3', 'A rotating arm']], ['1', '2', '3']),
    sizeOption([50, 150, 300], [150, 150, 150], 'Largest distance'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    if (difficulty === 3) {
      const L = rng.int(20, Math.max(30, Math.round(optNum(o, 'size', 150) * 0.6))), d = rng.int(100, 260);
      const x = L * Math.cos(rad(d)), y = L * Math.sin(rad(d));
      return {
        body: rng.pick([
          `A robotic arm ${L} cm long starts along the positive x-axis and rotates ${math(deg(d))} counterclockwise about the origin. Find the coordinates of its end, to the nearest tenth.`,
          `A crane's boom is drawn on a grid as a segment ${L} cm long from the origin. It starts along the positive x-axis and swings ${math(deg(d))} counterclockwise. Find the coordinates of its tip, to the nearest tenth.`,
          `A clock-style dial has a pointer ${L} cm long pivoting at the origin. The pointer starts along the positive x-axis and turns ${math(deg(d))} counterclockwise. Find the coordinates of its tip, to the nearest tenth.`,
          `In a video game, a laser beam ${L} cm long on screen starts pointing along the positive x-axis from the origin and rotates ${math(deg(d))} counterclockwise. Find the coordinates of its end, to the nearest tenth.`,
        ]),
        answer: math(`(${round(x, 1)}, ${round(y, 1)})`),
        distractors: [`(${round(y, 1)}, ${round(x, 1)})`, `(${round(-x, 1)}, ${round(y, 1)})`, `(${round(L * Math.cos(d), 1)}, ${round(L * Math.sin(d), 1)})`].map(math),
        solution: math(`(${L} cos ${d}°, ${L} sin ${d}°) approx (${round(x, 1)}, ${round(y, 1)})`),
      };
    }
    const angle = rng.int(15, 70), dist = rng.int(20, optNum(o, 'size', 150));
    const h = dist * Math.tan(rad(angle));
    const body = difficulty === 1
      ? `From a point ${dist} m from the base of a tower, the angle of elevation to the top is ${math(deg(angle))}. How tall is the tower, to the nearest tenth of a metre?`
      : `From the top of a cliff, the angle of depression to a boat ${dist} m from the base of the cliff is ${math(deg(angle))}. How high is the cliff, to the nearest tenth of a metre?`;
    return {
      body,
      answer: math(`${round(h, 1)} "m"`),
      distractors: [round(dist * Math.sin(rad(angle)), 1), round(dist / Math.tan(rad(angle)), 1), round(dist * Math.tan(angle), 1)].map((v) => math(`${v} "m"`)),
      solution: `${difficulty === 2 ? 'The angle of depression equals the angle of elevation from the boat (alternate angles). ' : ''}${math(`tan ${angle}° = h/${dist}`)}, so ${math(`h = ${dist} tan ${angle}° approx ${round(h, 1)}`)} m.`,
    };
  },
});

// ── Sine law and cosine law ───────────────────────────────────────────────

const sinD = (d: number) => Math.sin(rad(d));
const cosD = (d: number) => Math.cos(rad(d));
const asinD = (v: number) => (Math.asin(v) * 180) / Math.PI;
const acosD = (v: number) => (Math.acos(v) * 180) / Math.PI;
const cm = (v: number) => `${round(v, 1)} "cm"`;

export const lawSineSide = pc30s('30s-law-sine-side', {
  levels: { 1: 'Two angles and an opposite side', 2: 'Find the third angle first', 3: 'An obtuse angle' },
  options: [
    radioOption('form', 'Given', [['1', 'Two angles and an opposite side'], ['2', 'Find the third angle first'], ['3', 'An obtuse angle']], ['1', '2', '3']),
    sizeOption([10, 20, 40], [20, 20, 20], 'Largest side length'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const A = difficulty === 3 ? rng.int(95, 130) : rng.int(30, 80);
    const B = rng.int(20, Math.min(80, 170 - A));
    const C = 180 - A - B;
    const a = rng.int(50, Math.round(optNum(o, 'size', 20) * 12.5)) / 10;
    // Level 2 gives A, C and a, and asks for b (which needs B = 180 − A − C).
    const b = (a * sinD(B)) / sinD(A);
    const given = difficulty === 2 ? `${math(`angle A = ${A}°`)}, ${math(`angle C = ${C}°`)}` : `${math(`angle A = ${A}°`)}, ${math(`angle B = ${B}°`)}`;
    return {
      body: `In ${math('triangle A B C')}, ${given}, and ${math(`a = ${a}`)} cm. Find ${math('b')} to the nearest tenth.`,
      answer: math(cm(b)),
      distractors: [(a * sinD(A)) / sinD(B), (a * sinD(C)) / sinD(A), a * sinD(B) * sinD(A)].map((v) => math(cm(v))).filter((d) => d !== math(cm(b))),
      solution: `${difficulty === 2 ? `First, ${math(`angle B = 180° - ${A}° - ${C}° = ${B}°`)}. ` : ''}By the sine law, ${math(`b/(sin B) = a/(sin A)`)}, so ${math(`b = (${a} sin ${B}°)/(sin ${A}°) approx ${round(b, 1)}`)} cm.`,
    };
  },
});

export const lawSineAngle = pc30s('30s-law-sine-angle', {
  levels: { 1: 'Acute result', 2: 'With the third angle', 3: 'Find the third side too' },
  options: [
    radioOption('form', 'Find', [['1', 'Acute result'], ['2', 'With the third angle'], ['3', 'Find the third side too']], ['1', '2', '3']),
    sizeOption([10, 20, 40], [20, 20, 20], 'Largest side length'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    // a ≥ b with A given, so the triangle is unique (no ambiguous case).
    const A = rng.int(40, 110), b = rng.int(40, Math.round(optNum(o, 'size', 20) * 7.5)) / 10;
    const a = Number((b * (1.1 + rng.int(0, 8) / 10)).toFixed(1));
    const B = asinD((b * sinD(A)) / a);
    const C = 180 - A - B;
    const ask = difficulty === 2 ? 'C' : 'B';
    const value = ask === 'B' ? B : C;
    const c = (a * sinD(C)) / sinD(A);
    if (difficulty === 3) {
      return {
        body: `In ${math('triangle A B C')}, ${math(`angle A = ${A}°`)}, ${math(`a = ${a}`)} cm, and ${math(`b = ${b}`)} cm. Find ${math('c')} to the nearest tenth.`,
        answer: math(cm(c)),
        distractors: [(a * sinD(B)) / sinD(A), Math.sqrt(a * a + b * b), (b * sinD(C)) / sinD(A)].map((v) => math(cm(v))),
        solution: `${math(`sin B = (${b} sin ${A}°)/${a}`)}, so ${math(`angle B approx ${round(B, 1)}°`)}. Then ${math(`angle C approx ${round(C, 1)}°`)} and ${math(`c = (${a} sin C)/(sin ${A}°) approx ${round(c, 1)}`)} cm.`,
      };
    }
    return {
      body: `In ${math('triangle A B C')}, ${math(`angle A = ${A}°`)}, ${math(`a = ${a}`)} cm, and ${math(`b = ${b}`)} cm. Find ${math(`angle ${ask}`)} to the nearest tenth of a degree.`,
      answer: math(`${round(value, 1)}°`),
      distractors: [ask === 'B' ? asinD(Math.min(1, (a * sinD(A)) / b / 2)) : B, ask === 'B' ? 180 - B : 180 - A, (b / a) * A].map((v) => math(`${round(v, 1)}°`)).filter((d) => d !== math(`${round(value, 1)}°`)),
      solution: `By the sine law, ${math(`sin B = (b sin A)/a = (${b} sin ${A}°)/${a}`)}, so ${math(`angle B approx ${round(B, 1)}°`)}.${ask === 'C' ? ` Then ${math(`angle C = 180° - ${A}° - ${round(B, 1)}° approx ${round(C, 1)}°`)}.` : ''}`,
    };
  },
});

export const lawCosineSide = pc30s('30s-law-cosine-side', {
  levels: { 1: 'Acute included angle', 2: 'Obtuse included angle', 3: 'In a context' },
  options: [
    radioOption('form', 'Angle', [['1', 'Acute included angle'], ['2', 'Obtuse included angle'], ['3', 'In a context']], ['1', '2', '3']),
    sizeOption([10, 20, 40], [20, 20, 20], 'Largest side length'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const A = difficulty === 2 ? rng.int(95, 150) : rng.int(25, 85);
    const S = optNum(o, 'size', 20) * 10;
    const b = rng.int(30, S) / 10, c = rng.int(30, S) / 10;
    const a = Math.sqrt(b * b + c * c - 2 * b * c * cosD(A));
    const body = difficulty === 3
      ? `Two boats leave a dock. One travels ${b} km and the other ${c} km, on courses ${math(deg(A))} apart. How far apart are they, to the nearest tenth of a kilometre?`
      : `In ${math('triangle A B C')}, ${math(`b = ${b}`)} cm, ${math(`c = ${c}`)} cm, and ${math(`angle A = ${A}°`)}. Find ${math('a')} to the nearest tenth.`;
    const unit = difficulty === 3 ? 'km' : 'cm';
    const show = (v: number) => math(`${round(v, 1)} "${unit}"`);
    return {
      body,
      answer: show(a),
      distractors: [Math.sqrt(b * b + c * c + 2 * b * c * cosD(A)), Math.sqrt(b * b + c * c), Math.sqrt(Math.abs(b * b + c * c - 2 * b * c * cosD(A) * 2))].map(show).filter((d) => d !== show(a)),
      solution: `By the cosine law, ${math(`a^2 = b^2 + c^2 - 2 b c cos A = ${b}^2 + ${c}^2 - 2(${b})(${c}) cos ${A}°`)}, so ${math(`a approx ${round(a, 1)}`)} ${unit}.`,
    };
  },
});

export const lawCosineAngle = pc30s('30s-law-cosine-angle', {
  levels: { 1: 'An acute angle', 2: 'The largest angle', 3: 'An obtuse angle' },
  options: [
    radioOption('form', 'Angle', [['1', 'An acute angle'], ['2', 'The largest angle'], ['3', 'An obtuse angle']], ['1', '2', '3']),
    sizeOption([10, 20, 40], [20, 20, 20], 'Largest side length'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    for (;;) {
      const S = Math.round(optNum(o, 'size', 20) * 7.5);
      const a = rng.int(30, S) / 10, b = rng.int(30, S) / 10, c = rng.int(30, S) / 10;
      if (a + b <= c || a + c <= b || b + c <= a) continue;
      const A = acosD((b * b + c * c - a * a) / (2 * b * c));
      if (difficulty === 3 && A <= 92) continue;
      if (difficulty === 1 && A >= 88) continue;
      if (difficulty === 2 && (a < b || a < c)) continue;
      return {
        body: `In ${math('triangle A B C')}, ${math(`a = ${a}`)} cm, ${math(`b = ${b}`)} cm, and ${math(`c = ${c}`)} cm. Find ${math('angle A')} to the nearest tenth of a degree.`,
        answer: math(`${round(A, 1)}°`),
        distractors: [180 - A, acosD(Math.max(-1, Math.min(1, (a * a + b * b - c * c) / (2 * a * b)))), acosD(Math.max(-1, Math.min(1, (a * a + c * c - b * b) / (2 * a * c))))].map((v) => math(`${round(v, 1)}°`)).filter((d, i, all) => d !== math(`${round(A, 1)}°`) && all.indexOf(d) === i),
        solution: `${math(`cos A = (b^2 + c^2 - a^2)/(2 b c) = (${b}^2 + ${c}^2 - ${a}^2)/(2(${b})(${c}))`)}, so ${math(`angle A approx ${round(A, 1)}°`)}.${A > 90 ? ' The cosine is negative, so the angle is obtuse.' : ''}`,
      };
    }
  },
});

export const lawWhich = pc30s('30s-law-which', {
  points: 1,
  levels: { 1: 'SAS or SSS', 2: 'AAS, ASA, or SSA', 3: 'Including right triangles' },
  options: [
    radioOption('form', 'Given', [['1', 'SAS or SSS'], ['2', 'AAS, ASA, or SSA'], ['3', 'Including right triangles']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const cases: Array<[string, string, string]> = [
      ['two sides and the angle between them (SAS)', 'The cosine law', 'With the included angle, the cosine law gives the third side directly.'],
      ['all three sides (SSS)', 'The cosine law', 'With three sides, the cosine law gives any angle.'],
      ['two angles and a side (AAS or ASA)', 'The sine law', 'Find the third angle, then use the sine law with a side and its opposite angle.'],
      ['two sides and an angle opposite one of them (SSA)', 'The sine law (check the ambiguous case)', 'A side and its opposite angle make a sine law pair; SSA can give zero, one, or two triangles.'],
      ['a right angle, one other angle, and a side', 'The primary trigonometric ratios', 'In a right triangle, sine, cosine, and tangent are enough.'],
    ];
    const pool = difficulty === 1 ? cases.slice(0, 2) : difficulty === 2 ? cases.slice(2, 4) : cases;
    const [given, answer, reason] = rng.pick(pool);
    const options = ['The cosine law', 'The sine law', 'The sine law (check the ambiguous case)', 'The primary trigonometric ratios', 'The Pythagorean theorem'];
    return {
      body: `You know ${given} of a triangle. Which should you use first to solve it?`,
      answer,
      distractors: options.filter((o) => o !== answer).slice(0, 4),
      solution: reason,
    };
  },
});

export const lawAmbiguousCount = pc30s('30s-law-ambiguous-count', {
  levels: { 1: 'a ≥ b', 2: 'Compare a with the height', 3: 'Obtuse angle A' },
  options: [
    radioOption('form', 'Case', [['1', 'a ≥ b'], ['2', 'Compare a with the height'], ['3', 'Obtuse angle A']], ['1', '2', '3']),
    sizeOption([10, 20, 40], [20, 20, 20], 'Largest side length'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const A = difficulty === 3 ? rng.int(95, 140) : rng.int(25, 70);
    const b = rng.int(80, optNum(o, 'size', 20) * 10) / 10;
    const h = b * sinD(A);
    let a: number, count: number;
    if (difficulty === 1) { a = Number((b * (1 + rng.int(1, 5) / 10)).toFixed(1)); count = 1; }
    else if (difficulty === 2) {
      const kind = rng.pick([0, 2, 2]);
      a = kind === 0 ? Number((h * (0.5 + rng.int(1, 4) / 10)).toFixed(1)) : Number((h + (b - h) * (0.2 + rng.int(1, 6) / 10)).toFixed(1));
      count = a < h ? 0 : a < b ? 2 : 1;
    } else { a = Number((b * (rng.next() < 0.5 ? 0.7 : 1.3)).toFixed(1)); count = a > b ? 1 : 0; }
    const answer = ['No triangle', 'One triangle', 'Two triangles'][count];
    return {
      body: `In ${math('triangle A B C')}, ${math(`angle A = ${A}°`)}, ${math(`a = ${a}`)} cm, and ${math(`b = ${b}`)} cm. How many triangles are possible?`,
      answer,
      distractors: ['No triangle', 'One triangle', 'Two triangles', 'Infinitely many triangles'].filter((d) => d !== answer),
      solution: A > 90
        ? `${math('angle A')} is obtuse, so ${math('a')} must be the longest side: ${math(`a = ${a} ${a > b ? '>' : '<='} b = ${b}`)}, so ${answer.toLowerCase()}.`
        : `The height is ${math(`h = b sin A = ${b} sin ${A}° approx ${round(h, 2)}`)}. ${a < h ? `${math(`a < h`)}: the side cannot reach, so no triangle.` : a >= b ? `${math('a >= b')}: one triangle.` : `${math('h < a < b')}: two triangles.`}`,
    };
  },
});

export const lawAmbiguousSolve = pc30s('30s-law-ambiguous-solve', {
  levels: { 1: 'Both values of angle B', 2: 'Both values of angle C', 3: 'Both values of side c' },
  options: [
    radioOption('form', 'Find', [['1', 'Both values of angle B'], ['2', 'Both values of angle C'], ['3', 'Both values of side c']], ['1', '2', '3']),
    sizeOption([10, 20, 40], [20, 20, 20], 'Largest side length'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    for (;;) {
      const A = rng.int(25, 60), b = rng.int(80, optNum(o, 'size', 20) * 10) / 10;
      const h = b * sinD(A);
      const a = Number((h + (b - h) * (0.25 + rng.int(0, 5) / 10)).toFixed(1));
      if (!(a > h && a < b)) continue;
      const B1 = asinD((b * sinD(A)) / a), B2 = 180 - B1;
      const C1 = 180 - A - B1, C2 = 180 - A - B2;
      if (C2 <= 1) continue;
      const c1 = (a * sinD(C1)) / sinD(A), c2 = (a * sinD(C2)) / sinD(A);
      const [label, v1, v2, unit] = difficulty === 1 ? ['angle B', B1, B2, '°'] : difficulty === 2 ? ['angle C', C1, C2, '°'] : ['c', c1, c2, ' cm'];
      const f = (v: number) => `${round(v, 1)}${unit === '°' ? '°' : ''}`;
      const answer = `${f(Math.min(v1, v2))} "or" ${f(Math.max(v1, v2))}${unit === ' cm' ? ' "cm"' : ''}`;
      return {
        body: `In ${math('triangle A B C')}, ${math(`angle A = ${A}°`)}, ${math(`a = ${a}`)} cm, and ${math(`b = ${b}`)} cm. This is the ambiguous case. Find both possible values of ${math(label)}, to the nearest tenth.`,
        answer: math(answer),
        distractors: [`${f(v1)}${unit === ' cm' ? ' "cm"' : ''}`, `${f(v2)}${unit === ' cm' ? ' "cm"' : ''}`, `${f(Math.min(v1, v2))} "or" ${f(180 - Math.min(v1, v2) - A)}${unit === ' cm' ? ' "cm"' : ''}`].filter((d) => d !== answer).map(math),
        solution: `${math(`sin B = (${b} sin ${A}°)/${a}`)} gives ${math(`angle B approx ${round(B1, 1)}°`)} or ${math(`180° - ${round(B1, 1)}° = ${round(B2, 1)}°`)}. Then ${math(`angle C approx ${round(C1, 1)}°`)} or ${math(`${round(C2, 1)}°`)}${difficulty === 3 ? `, and ${math(`c = (a sin C)/(sin A)`)} gives ${math(`${round(c1, 1)}`)} cm or ${math(`${round(c2, 1)}`)} cm` : ''}.`,
      };
    }
  },
});

export const lawProblem = pc30s('30s-law-problem', {
  levels: { 1: 'Surveying across a river (sine law)', 2: 'Distance between two points (cosine law)', 3: 'Two observers and a balloon' },
  options: [
    radioOption('form', 'Context', [['1', 'Surveying across a river (sine law)'], ['2', 'Distance between two points (cosine law)'], ['3', 'Two observers and a balloon']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    if (difficulty === 1) {
      const d = rng.int(80, 300), A = rng.int(40, 75), B = rng.int(40, 75);
      const C = 180 - A - B;
      const x = (d * sinD(B)) / sinD(C);
      return {
        body: `Two ${rng.pick(['surveyors', 'hikers', 'students on a field trip', 'park rangers'])} at points ${math('A')} and ${math('B')}, ${d} m apart on one bank of a river, sight ${rng.pick(['a tree', 'a cabin', 'a large rock', 'a flagpole'])} ${math('T')} on the other bank. ${math(`angle T A B = ${A}°`)} and ${math(`angle T B A = ${B}°`)}. How far is the tree from ${math('A')}, to the nearest metre?`,
        answer: math(`${Math.round(x)} "m"`),
        distractors: [(d * sinD(A)) / sinD(C), (d * sinD(B)) / sinD(A), d * sinD(B)].map((v) => math(`${Math.round(v)} "m"`)),
        solution: `${math(`angle T = 180° - ${A}° - ${B}° = ${C}°`)}. By the sine law, ${math(`A T = (${d} sin ${B}°)/(sin ${C}°) approx ${Math.round(x)}`)} m.`,
      };
    }
    if (difficulty === 2) {
      const p = rng.int(100, 500), q = rng.int(100, 500), ang = rng.int(40, 140);
      const x = Math.sqrt(p * p + q * q - 2 * p * q * cosD(ang));
      return {
        body: rng.pick([
          `From a point, a lake's ends are ${p} m and ${q} m away, with an angle of ${math(deg(ang))} between the two lines of sight. How long is the lake, to the nearest metre?`,
          `A golfer is ${p} m from the tee and ${q} m from the hole, with an angle of ${math(deg(ang))} between the two lines of sight. How far is the tee from the hole, to the nearest metre?`,
          `From a lookout, the two ends of a bridge are ${p} m and ${q} m away, with an angle of ${math(deg(ang))} between the lines of sight. How long is the bridge, to the nearest metre?`,
          `A drone hovers ${p} m from one corner of a field and ${q} m from another, with an angle of ${math(deg(ang))} between the two lines of sight. How far apart are the corners, to the nearest metre?`,
        ]),
        answer: math(`${Math.round(x)} "m"`),
        distractors: [Math.sqrt(p * p + q * q), Math.sqrt(p * p + q * q + 2 * p * q * cosD(ang)), Math.abs(p - q) + 50].map((v) => math(`${Math.round(v)} "m"`)),
        solution: math(`d^2 = ${p}^2 + ${q}^2 - 2(${p})(${q}) cos ${ang}°`) + `, so ${math(`d approx ${Math.round(x)}`)} m.`,
      };
    }
    const d = rng.int(200, 800), A = rng.int(30, 60), B = rng.int(35, 70);
    const C = 180 - A - B;
    const AB = (d * sinD(B)) / sinD(C);
    const height = AB * sinD(A);
    return {
      body: (([who, what]) => `Two observers ${d} m apart on level ground, on opposite sides of ${who}, measure angles of elevation of ${math(deg(A))} and ${math(deg(B))} to it. How high is ${what}, to the nearest metre?`)(
        rng.pick([['a hot-air balloon', 'the balloon'], ['a drone', 'the drone'], ['a kite', 'the kite'], ['a weather balloon', 'the weather balloon']])),
      answer: math(`${Math.round(height)} "m"`),
      distractors: [AB, d * Math.tan(rad(A)), ((d * sinD(A)) / sinD(C)) * sinD(A)].map((v) => math(`${Math.round(v)} "m"`)),
      solution: `The angle at the balloon is ${math(`180° - ${A}° - ${B}° = ${C}°`)}. The distance from the first observer is ${math(`(${d} sin ${B}°)/(sin ${C}°) approx ${Math.round(AB)}`)} m, so the height is ${math(`${Math.round(AB)} sin ${A}° approx ${Math.round(height)}`)} m.`,
    };
  },
});

/** A labelled triangle diagram: vertices A, B, C, given measures, and x for the unknown. */
function triangleDiagram(A: number, b: number, c: number, labels: { sides: Record<'a' | 'b' | 'c', string>; angles: Record<'A' | 'B' | 'C', string> }): string {
  // A at the origin, B on the x-axis, C above: scaled to fit a 10-unit window.
  const pts: Record<'A' | 'B' | 'C', Pt> = { A: [0, 0], B: [c, 0], C: [b * cosD(A), b * sinD(A)] };
  const xs = Object.values(pts).map(([x]) => x), ys = Object.values(pts).map(([, y]) => y);
  const scale = 8 / Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const off: Pt = [-(Math.max(...xs) + Math.min(...xs)) / 2, -(Math.max(...ys) + Math.min(...ys)) / 2];
  const P = (k: 'A' | 'B' | 'C'): Pt => [(pts[k][0] + off[0]) * scale, (pts[k][1] + off[1]) * scale];
  const centroid: Pt = [(P('A')[0] + P('B')[0] + P('C')[0]) / 3, (P('A')[1] + P('B')[1] + P('C')[1]) / 3];
  const away = (p: Pt, k = 0.8): Pt => { const dx = p[0] - centroid[0], dy = p[1] - centroid[1]; const l = Math.hypot(dx, dy) || 1; return [p[0] + (dx / l) * k, p[1] + (dy / l) * k]; };
  const mid = (u: Pt, v: Pt): Pt => away([(u[0] + v[0]) / 2, (u[1] + v[1]) / 2], 0.7);
  const inward = (p: Pt): Pt => { const dx = centroid[0] - p[0], dy = centroid[1] - p[1]; const l = Math.hypot(dx, dy) || 1; return [p[0] + (dx / l) * 1.4, p[1] + (dy / l) * 1.4]; };
  const all = [
    { x: away(P('A'))[0], y: away(P('A'))[1], text: 'A' }, { x: away(P('B'))[0], y: away(P('B'))[1], text: 'B' }, { x: away(P('C'))[0], y: away(P('C'))[1], text: 'C' },
    { x: mid(P('B'), P('C'))[0], y: mid(P('B'), P('C'))[1], text: labels.sides.a }, { x: mid(P('A'), P('C'))[0], y: mid(P('A'), P('C'))[1], text: labels.sides.b }, { x: mid(P('A'), P('B'))[0], y: mid(P('A'), P('B'))[1], text: labels.sides.c },
    ...(['A', 'B', 'C'] as const).map((k) => ({ x: inward(P(k))[0], y: inward(P(k))[1], text: labels.angles[k] })),
  ].filter((l) => l.text);
  return graphTypst({
    xMin: -6, xMax: 6, yMin: -6, yMax: 6, width: 6, height: 6, grid: false, numbers: false, axes: false,
    curves: [{ points: [P('A'), P('B'), P('C'), P('A')] }],
    labels: all,
  });
}

export const lawDiagram = pc30s('30s-law-diagram', {
  levels: { 1: 'Find a side (sine law)', 2: 'Find a side (cosine law)', 3: 'Find an angle (cosine law)' },
  options: [
    radioOption('form', 'Find', [['1', 'Find a side (sine law)'], ['2', 'Find a side (cosine law)'], ['3', 'Find an angle (cosine law)']], ['1', '2', '3']),
    sizeOption([8, 12, 20], [12, 12, 12], 'Largest side length'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const S = optNum(o, 'size', 12) * 10;
    const A = rng.int(35, 100), b = rng.int(40, S) / 10, c = rng.int(40, S) / 10;
    const a = Math.sqrt(b * b + c * c - 2 * b * c * cosD(A));
    const B = acosD((a * a + c * c - b * b) / (2 * a * c)), C = 180 - A - B;
    const none = { a: '', b: '', c: '' }, noAngles = { A: '', B: '', C: '' };
    if (difficulty === 1) {
      const diagram = triangleDiagram(A, b, c, { sides: { ...none, a: 'x', b: `${b}` }, angles: { ...noAngles, A: `${A}°`, B: `${round(B, 0)}°` } });
      const Bi = Number(round(B, 0)), x = (b * sinD(A)) / sinD(Bi);
      return {
        body: `Find ${math('x')} to the nearest tenth. (Lengths in cm; the diagram is not to scale.)\n\n${diagram}`,
        answer: math(cm(x)),
        distractors: [(b * sinD(Bi)) / sinD(A), b * sinD(A), (b * sinD(180 - A - Bi)) / sinD(Bi)].map((v) => math(cm(v))),
        solution: `${math('x')} is opposite the ${math(`${A}°`)} angle and ${b} cm is opposite the ${math(`${Bi}°`)} angle. By the sine law, ${math(`x = (${b} sin ${A}°)/(sin ${Bi}°) approx ${round(x, 1)}`)} cm.`,
      };
    }
    if (difficulty === 2) {
      const diagram = triangleDiagram(A, b, c, { sides: { a: 'x', b: `${b}`, c: `${c}` }, angles: { ...noAngles, A: `${A}°` } });
      return {
        body: `Find ${math('x')} to the nearest tenth. (Lengths in cm; the diagram is not to scale.)\n\n${diagram}`,
        answer: math(cm(a)),
        distractors: [Math.sqrt(b * b + c * c), Math.sqrt(b * b + c * c + 2 * b * c * cosD(A)), (b * sinD(A)) / sinD(C)].map((v) => math(cm(v))),
        solution: `The ${math(`${A}°`)} angle is between the known sides. By the cosine law, ${math(`x^2 = ${b}^2 + ${c}^2 - 2(${b})(${c}) cos ${A}°`)}, so ${math(`x approx ${round(a, 1)}`)} cm.`,
      };
    }
    const aShown = Number(round(a, 1));
    const Ax = acosD((b * b + c * c - aShown * aShown) / (2 * b * c));
    const diagram = triangleDiagram(A, b, c, { sides: { a: `${aShown}`, b: `${b}`, c: `${c}` }, angles: { ...noAngles, A: 'theta' } });
    return {
      body: `Find ${math('theta')} to the nearest tenth of a degree. (Lengths in cm; the diagram is not to scale.)\n\n${diagram}`,
      answer: math(`${round(Ax, 1)}°`),
      distractors: [180 - Ax, acosD(Math.max(-1, Math.min(1, (aShown * aShown + c * c - b * b) / (2 * aShown * c)))), acosD(Math.max(-1, Math.min(1, (aShown * aShown + b * b - c * c) / (2 * aShown * b))))].map((v) => math(`${round(v, 1)}°`)).filter((d, i, all) => d !== math(`${round(Ax, 1)}°`) && all.indexOf(d) === i),
      solution: `${math('theta')} is opposite the ${aShown} cm side. ${math(`cos theta = (${b}^2 + ${c}^2 - ${aShown}^2)/(2(${b})(${c}))`)}, so ${math(`theta approx ${round(Ax, 1)}°`)}.`,
    };
  },
});

export const TRIG_30S = [angReference, angQuadrant, angSameReference, angReflectedPoints, angSketch30, angPointSketch, trigDistance, trigRatioFromPoint, trigQuadrantal, trigSign, trigExact, trigGivenOne, trigSolve, trigProblem, lawSineSide, lawSineAngle, lawCosineSide, lawCosineAngle, lawWhich, lawAmbiguousCount, lawAmbiguousSolve, lawProblem, lawDiagram];

