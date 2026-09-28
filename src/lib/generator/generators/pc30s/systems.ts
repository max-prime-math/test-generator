import type { Rng } from '../../rng.ts';
import type { GenOptions } from '../../types.ts';
import { poly } from '../../format.ts';
import { Q } from '../../exact.ts';
import { graphTypst } from '../../graph.ts';
import { math, pc30s } from '../pc40s/common.ts';
import { optNum, optOn, optOne, radioOption, sizeOption, toggleOption } from '../../options.ts';
import { fromRoots, polyAdd, polyEval } from '../pc40s/functions.ts';

const pointsText = (pts: Array<[number, number]>) => pts.sort((a, b) => a[0] - b[0]).map(([x, y]) => `(${x}, ${y})`).join(', ');

/** Distinct whole-number x-values. */
function twoRoots(rng: Rng, lo = -4, hi = 4): [number, number] {
  const r = rng.int(lo, hi);
  let s = rng.int(lo, hi);
  while (s === r) s = rng.int(lo, hi);
  return [Math.min(r, s), Math.max(r, s)];
}

// ── Systems ───────────────────────────────────────────────────────────────

/** A line and a parabola meeting at x = r and x = s: parabola = line + a(x − r)(x − s). */
function linearQuadratic(rng: Rng, a: number, lo = -4, hi = 4) {
  const [r, s] = twoRoots(rng, lo, hi);
  const line = [rng.nonZero(-3, 3), rng.int(-5, 5)];
  const parabola = polyAdd(fromRoots([r, s], a), line);
  return { r, s, line, parabola, points: [[r, polyEval(line, r)], [s, polyEval(line, s)]] as Array<[number, number]> };
}

export const sysLinearQuadratic = pc30s('30s-sys-linear-quadratic', {
  levels: { 1: 'Leading coefficient 1', 2: 'Any leading coefficient', 3: 'One solution (tangent line)' },
  options: [
    radioOption('form', 'System', [['1', 'Leading coefficient 1'], ['2', 'Any leading coefficient'], ['3', 'One solution (tangent line)']], ['1', '2', '3']),
    sizeOption([3, 4, 6], [4, 4, 4], 'Size of the solutions'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    if (difficulty === 3) {
      const N = optNum(o, 'size', 4);
      const r = rng.int(-N, N), line = [rng.nonZero(-3, 3), rng.int(-5, 5)], a = rng.pick([1, -1, 2]);
      const parabola = polyAdd(fromRoots([r, r], a), line);
      const pt: Array<[number, number]> = [[r, polyEval(line, r)]];
      return {
        body: `Solve the system: ${math(`y = ${poly(parabola)}`)} and ${math(`y = ${poly(line)}`)}.`,
        answer: math(pointsText(pt)),
        distractors: [pointsText([[r, polyEval(parabola, r) + 1]]), pointsText([[-r, polyEval(line, -r)]]), '"no solution"'].filter((d) => d !== pointsText(pt)).map(math),
        solution: `Set the right sides equal: ${math(`${poly(polyAdd(parabola, line, -1))} = 0`)}${r === 0 ? '' : `, which is ${math(`${a === 1 ? '' : a === -1 ? '-' : a}(x ${r > 0 ? '-' : '+'} ${Math.abs(r)})^2 = 0`)}`}. One root, ${math(`x = ${r}`)}: the line is tangent to the parabola at ${math(pointsText(pt))}.`,
      };
    }
    const { r, s, line, parabola, points } = linearQuadratic(rng, difficulty === 1 ? 1 : rng.pick([-1, 2, -2, 3]), -optNum(o, 'size', 4), optNum(o, 'size', 4));
    const answer = pointsText(points);
    return {
      body: `Solve the system algebraically: ${math(`y = ${poly(parabola)}`)} and ${math(`y = ${poly(line)}`)}.`,
      answer: math(answer),
      distractors: [pointsText([[r, polyEval(line, r)]]), pointsText(points.map(([x, y]) => [-x, y])), pointsText(points.map(([x]) => [x, polyEval(parabola, x) + polyEval(line, 0)])), pointsText([[r, 0], [s, 0]])].filter((d, i, all) => d !== answer && all.indexOf(d) === i).map(math),
      solution: `Substitute: ${math(`${poly(parabola)} = ${poly(line)}`)}, so ${math(`${poly(polyAdd(parabola, line, -1))} = 0`)} and ${math(`x = ${r}`)} or ${math(`x = ${s}`)}. Substitute into the line for ${math('y')}: ${math(answer)}.`,
    };
  },
});

export const sysQuadraticQuadratic = pc30s('30s-sys-quadratic-quadratic', {
  levels: { 1: 'Opening in opposite directions', 2: 'Same direction', 3: 'One solution' },
  options: [
    radioOption('form', 'System', [['1', 'Opening in opposite directions'], ['2', 'Same direction'], ['3', 'One solution']], ['1', '2', '3']),
    sizeOption([3, 4, 6], [4, 4, 4], 'Size of the solutions'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const [r, s] = difficulty === 3 ? (() => { const v = rng.int(-optNum(o, 'size', 4), optNum(o, 'size', 4)); return [v, v]; })() : twoRoots(rng, -optNum(o, 'size', 4), optNum(o, 'size', 4));
    const q1 = [difficulty === 1 ? 1 : rng.pick([1, 2]), rng.int(-5, 5), rng.int(-6, 6)];
    // q2 = q1 − k(x − r)(x − s) opens the other way when k > q1's leading coefficient.
    const k = difficulty === 1 ? q1[0] * 2 : rng.pick([1, -1, 3]);
    const q2 = polyAdd(q1, fromRoots([r, s], k), -1);
    if (q2.length < 3) return sysQuadraticQuadratic.generate(rng, difficulty, o);
    const pts: Array<[number, number]> = [...new Set([r, s])].map((x) => [x, polyEval(q1, x)]);
    const answer = pointsText(pts);
    return {
      body: `Solve the system algebraically: ${math(`y = ${poly(q1)}`)} and ${math(`y = ${poly(q2)}`)}.`,
      answer: math(answer),
      distractors: [pointsText(pts.map(([x, y]) => [-x, y])), pointsText(pts.map(([x, y]) => [x, -y])), pointsText([[r, polyEval(q1, r)], [r + 1, polyEval(q1, r + 1)]]), '"no solution"'].filter((d, i, all) => d !== answer && all.indexOf(d) === i).map(math),
      solution: `Set them equal and simplify: ${math(`${poly(polyAdd(q1, q2, -1))} = 0`)}, so ${math(`x = ${[...new Set([r, s])].join(', ')}`)}. Find ${math('y')} from either equation: ${math(answer)}.`,
    };
  },
});

export const sysCount = pc30s('30s-sys-count', {
  points: 1,
  levels: { 1: 'Line and parabola', 2: 'Two parabolas', 3: 'Find k for a tangent line' },
  options: [
    radioOption('form', 'System', [['1', 'Line and parabola'], ['2', 'Two parabolas'], ['3', 'Find k for a tangent line']], ['1', '2', '3']),
    sizeOption([3, 5, 8], [5, 5, 5], 'Size of coefficients'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const N = optNum(o, 'size', 5);
    const q = [rng.pick([1, -1, 2]), rng.int(1 - N, N - 1), rng.int(-N, N)];
    if (difficulty === 3) {
      // y = x² + c and y = m x + k touch when (−m)² − 4(c − k) = 0 → k = c − m²/4
      const m = 2 * rng.nonZero(-3, 3), c = rng.int(-5, 5);
      const k = c - (m * m) / 4;
      return {
        body: `For what value of ${math('k')} is the line ${math(`y = ${m}x + k`)} tangent to the parabola ${math(`y = x^2 ${c < 0 ? '-' : '+'} ${Math.abs(c)}`)}?`,
        answer: math(`k = ${k}`),
        distractors: [`k = ${c + (m * m) / 4}`, `k = ${-k}`, `k = ${c - m}`].map(math),
        solution: `Set them equal: ${math(`${poly([1, -m, 0]).replace(/ x$/, 'x')} + (${c} - k) = 0`)}. This has one root when its discriminant is 0: ${math(`${m * m} - 4(${c} - k) = 0`)}, so ${math(`k = ${k}`)}.`,
      };
    }
    const other = difficulty === 1 ? [0, rng.int(2 - N, N - 2), rng.int(-N, N)] : [rng.pick([-1, 1, 3]), rng.int(1 - N, N - 1), rng.int(-N, N)];
    const diff = polyAdd(q, other, -1);
    const [A, B, C] = [...new Array(3 - diff.length).fill(0), ...diff];
    const disc = B * B - 4 * A * C;
    const count = A === 0 ? (B === 0 ? (C === 0 ? Infinity : 0) : 1) : disc > 0 ? 2 : disc === 0 ? 1 : 0;
    if (count === Infinity) return sysCount.generate(rng, difficulty, o);
    const answer = ['No solutions', 'One solution', 'Two solutions'][count];
    const otherText = other[0] === 0 ? poly(other.slice(1)) : poly(other);
    return {
      body: `How many solutions does the system ${math(`y = ${poly(q)}`)} and ${math(`y = ${otherText}`)} have?`,
      answer,
      distractors: ['No solutions', 'One solution', 'Two solutions', 'Infinitely many solutions'].filter((d) => d !== answer),
      solution: `Set the right sides equal: ${math(`${poly([A, B, C].slice(A === 0 ? 1 : 0))} = 0`)}. ${A === 0 ? 'This is linear, with one root.' : `The discriminant is ${math(`${B < 0 ? `(${B})` : B}^2 - 4(${A})(${C < 0 ? `(${C})` : C}) = ${disc}`)}, which is ${disc > 0 ? 'positive: two solutions' : disc === 0 ? 'zero: one solution' : 'negative: no solutions'}.`}`,
    };
  },
});

export const sysProblem = pc30s('30s-sys-problem', {
  levels: { 1: 'Sum and product of two numbers', 2: 'Perimeter and area of a rectangle', 3: 'A ball and a ramp' },
  options: [
    radioOption('form', 'Context', [['1', 'Sum and product of two numbers'], ['2', 'Perimeter and area of a rectangle'], ['3', 'A ball and a ramp']], ['1', '2', '3']),
    sizeOption([10, 20, 40], [20, 20, 20], 'Size of the numbers'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    if (difficulty < 3) {
      const N = optNum(o, 'size', 20);
      const a = rng.int(2, N - 3), b = rng.int(a + 1, N);
      const [sumLabel, prodLabel, unit] = difficulty === 1 ? ['sum', 'product', ''] : ['perimeter', 'area', ' m'];
      const S = difficulty === 1 ? a + b : 2 * (a + b), P = a * b;
      return {
        body: difficulty === 1
          ? `Two positive numbers have a sum of ${S} and a product of ${P}. Find the numbers.`
          : `A rectangle has a perimeter of ${S} m and an area of ${P} m². Find its dimensions.`,
        answer: math(`${a}${unit ? ' "m"' : ''} "and" ${b}${unit ? ' "m"' : ''}`),
        // Near misses, skipping any that are the answer in the other order (e.g. 18 and 17).
        distractors: [`${a - 1} "and" ${b + 1}`, ...(b - a === 2 ? [] : [`${a + 1} "and" ${b - 1}`]), `${a - 2} "and" ${b + 2}`, `${Math.round(Math.sqrt(P))} "and" ${Math.round(Math.sqrt(P))}`].map((d) => (unit ? d.replace(/(\d+) "and" (\d+)/, '$1 "m and" $2 "m"') : d)).map(math),
        solution: `${difficulty === 1 ? math(`x + y = ${S}`) : math(`2x + 2y = ${S}`)} and ${math(`x y = ${P}`)}. Substitute ${math(`y = ${difficulty === 1 ? S : S / 2} - x`)}: ${math(`x^2 - ${a + b}x + ${P} = 0`)}, so ${math(`x = ${a}`)} or ${math(`x = ${b}`)}. The ${sumLabel === 'sum' ? 'numbers' : 'dimensions'} are ${a}${unit} and ${b}${unit}. (${prodLabel} check: ${math(`${a} dot ${b} = ${P}`)}.)`,
      };
    }
    const { r, s, line, parabola, points } = linearQuadratic(rng, -1, 0, 5);
    return {
      body: `A ball's path is ${math(`y = ${poly(parabola)}`)} and a ramp follows ${math(`y = ${poly(line)}`)}. Where do they meet?`,
      answer: math(pointsText(points)),
      distractors: [pointsText([[r, polyEval(line, r)]]), pointsText(points.map(([x, y]) => [x, -y])), pointsText(points.map(([x, y]) => [-x, y]))].map(math),
      solution: `Solve the system: ${math(`${poly(polyAdd(parabola, line, -1))} = 0`)} gives ${math(`x = ${r}`)} and ${math(`x = ${s}`)}. The meeting points are ${math(pointsText(points))}.`,
    };
  },
});

export const sysGraphical = pc30s('30s-sys-graphical', {
  levels: { 1: 'Line and parabola', 2: 'Two parabolas', 3: 'One point of contact' },
  options: [
    radioOption('form', 'Graphs', [['1', 'Line and parabola'], ['2', 'Two parabolas'], ['3', 'One point of contact']], ['1', '2', '3']),
    toggleOption('dots', 'Mark the intersection points', [true, true, true]),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    for (;;) {
      let f: number[], g: number[], xs: number[];
      if (difficulty === 1) { const s = linearQuadratic(rng, rng.pick([1, -1])); f = s.parabola; g = s.line; xs = [s.r, s.s]; }
      else if (difficulty === 2) { const [r, s] = twoRoots(rng, -3, 3); f = [1, rng.int(-3, 3), rng.int(-4, 2)]; g = polyAdd(f, fromRoots([r, s], 2), -1); xs = [r, s]; }
      else { const r = rng.int(-3, 3); g = [rng.nonZero(-2, 2), rng.int(-3, 3)]; f = polyAdd(fromRoots([r, r], rng.pick([1, -1])), g); xs = [r]; }
      const pts = xs.map((x) => [x, polyEval(f, x)] as [number, number]);
      if (pts.some(([, y]) => Math.abs(y) > 7)) continue;
      const answer = pointsText(pts);
      const graph = graphTypst({ xMin: -8, xMax: 8, yMin: -8, yMax: 8, xLabelStep: 2, yLabelStep: 2, width: 5.5, height: 5.5, curves: [{ f: (x) => polyEval(f, x) }, { f: (x) => polyEval(g, x), dashed: true }], dots: optOn(o, 'dots', true) ? pts.map(([x, y]) => ({ x, y })) : [] });
      return {
        body: `The graphs of ${math(`y = ${poly(f)}`)} and ${math(`y = ${poly(g)}`)} are shown. Use the graph to solve the system.\n\n${graph}`,
        answer: math(answer),
        distractors: [pointsText(pts.map(([x, y]) => [y, x])), pointsText(pts.map(([x]) => [x, 0])), pointsText(pts.map(([x, y]) => [-x, y])), '"no solution"'].filter((d, i, all) => d !== answer && all.indexOf(d) === i).map(math),
        solution: `The solutions are the points where the graphs intersect: ${math(answer)}. Check each in both equations.`,
      };
    }
  },
});

// ── Inequalities ──────────────────────────────────────────────────────────

const OPS = ['<', '<=', '>', '>='] as const;
type Op = typeof OPS[number];
const OPS_OPTION = (levels: [string, string, string]) => radioOption('ops', 'Inequality signs', [['strict', '< and > only'], ['inclusive', '≤ and ≥ only'], ['any', 'Any']], levels);
/** An inequality sign allowed by the option. */
function pickOp(rng: Rng, o: GenOptions | undefined, fallback: string): Op {
  const kind = optOne(o, 'ops', fallback);
  return rng.pick(kind === 'strict' ? ['<', '>'] as const : kind === 'inclusive' ? ['<=', '>='] as const : OPS);
}
const holds = (lhs: number, op: Op, rhs: number) => (op === '<' ? lhs < rhs : op === '<=' ? lhs <= rhs : op === '>' ? lhs > rhs : lhs >= rhs);

export const ineqTestPoint = pc30s('30s-ineq-test-point', {
  points: 1,
  levels: { 1: 'Linear inequality', 2: 'Quadratic inequality', 3: 'A point on the boundary' },
  options: [
    radioOption('form', 'Inequality', [['1', 'Linear inequality'], ['2', 'Quadratic inequality'], ['3', 'A point on the boundary']], ['1', '2', '3']),
    OPS_OPTION(['any', 'any', 'any']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const f = difficulty === 1 ? [rng.nonZero(-3, 3), rng.int(-5, 5)] : [rng.pick([1, -1, 2]), rng.int(-4, 4), rng.int(-5, 5)];
    const op = pickOp(rng, o, 'any');
    const x = rng.int(-4, 4);
    const fx = polyEval(f, x);
    const y = difficulty === 3 ? fx : fx + rng.nonZero(-4, 4);
    const ok = holds(y, op, fx);
    return {
      body: `Is ${math(`(${x}, ${y})`)} in the solution region of ${math(`y ${op} ${poly(f)}`)}?`,
      answer: `${ok ? 'Yes' : 'No'}: ${math(`${y} ${op} ${fx}`)} is ${ok ? 'true' : 'false'}.`,
      distractors: [`${ok ? 'No' : 'Yes'}: ${math(`${y} ${op} ${fx}`)} is ${ok ? 'false' : 'true'}.`, `${ok ? 'No' : 'Yes'}: the point is ${difficulty === 3 ? `on the boundary, and boundary points are always included` : 'above the boundary'}.`, `${ok ? 'No' : 'Yes'}: ${math(`${x === y ? fx : x} ${op} ${y}`)}.`],
      solution: `Substitute ${math(`x = ${x}`)}: the right side is ${math(String(fx))}. Then ${math(`${y} ${op} ${fx}`)} is ${ok ? 'true' : 'false'}, so the point ${ok ? 'is' : 'is not'} in the region.${difficulty === 3 ? ` The point is on the boundary, which is ${op.includes('=') ? 'included (solid line)' : 'not included (broken line)'}.` : ''}`,
    };
  },
});

export const ineqQuadraticOneVar = pc30s('30s-ineq-quadratic-one-var', {
  levels: { 1: 'x² + bx + c < 0 or > 0', 2: 'Inclusive inequalities', 3: 'Negative leading coefficient or rearranging' },
  options: [
    radioOption('form', 'Inequality', [['1', 'x² + bx + c < 0 or > 0'], ['2', 'Inclusive inequalities'], ['3', 'Negative leading coefficient or rearranging']], ['1', '2', '3']),
    OPS_OPTION(['strict', 'any', 'any']),
    sizeOption([4, 7, 10], [7, 7, 7], 'Size of the roots'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const [r, s] = twoRoots(rng, -optNum(o, 'size', 7), optNum(o, 'size', 7));
    const a = difficulty === 3 ? rng.pick([-1, -2, 2, 1]) : 1;
    const op = pickOp(rng, o, difficulty === 1 ? 'strict' : 'any');
    const coefs = fromRoots([r, s], a);
    // Between the roots the quadratic has the opposite sign of a.
    const wantPositive = op === '>' || op === '>=';
    const between = (a > 0) !== wantPositive;
    const strict = !op.includes('=');
    const le = strict ? '<' : '<=';
    const answer = between ? `{x | ${r} ${le} x ${le} ${s}, x in RR}` : `{x | x ${le} ${r} "or" x ${strict ? '>' : '>='} ${s}, x in RR}`;
    const other = between ? `{x | x ${le} ${r} "or" x ${strict ? '>' : '>='} ${s}, x in RR}` : `{x | ${r} ${le} x ${le} ${s}, x in RR}`;
    const eq = difficulty === 3 && a === 1 ? `${poly([1, 0, coefs[2]])} ${op} ${poly([-coefs[1], 0])}` : `${poly(coefs)} ${op} 0`;
    return {
      body: `Solve: ${math(eq)}`,
      answer: math(answer),
      distractors: [other, answer.replace(/<=/g, '#').replace(/</g, '<=').replace(/#/g, '<').replace(/>=/g, '@').replace(/>/g, '>=').replace(/@/g, '>'), `{x | ${-s} ${le} x ${le} ${-r}, x in RR}`].filter((d, i, all) => d !== answer && all.indexOf(d) === i).map(math),
      solution: `The related equation has roots ${math(`x = ${r}`)} and ${math(`x = ${s}`)}. Test a value in each interval (or use the parabola opening ${a > 0 ? 'upward' : 'downward'}): the expression is ${wantPositive ? 'positive' : 'negative'} ${between ? 'between the roots' : 'outside the roots'}. ${strict ? 'The roots are not included.' : 'The roots are included.'} ${math(answer)}.`,
    };
  },
});

export const ineqQuadraticProblem = pc30s('30s-ineq-quadratic-problem', {
  levels: { 1: 'Height above a level', 2: 'Profit above zero', 3: 'Area at least a value' },
  options: [
    radioOption('form', 'Context', [['1', 'Height above a level'], ['2', 'Profit above zero'], ['3', 'Area at least a value']], ['1', '2', '3']),
    sizeOption([2, 4, 6], [4, 4, 4], 'Length of the interval'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    if (difficulty === 1) {
      // H is large enough that the ball starts at or above the ground (h(0) >= 0).
      const t1 = rng.int(1, 3), t2 = t1 + rng.int(1, optNum(o, 'size', 4)), H = 5 * t1 * t2 + rng.int(0, 20);
      // h = −5(t − t1)(t − t2) + H is above H between t1 and t2
      const h = polyAdd(fromRoots([t1, t2], -5), [H]);
      return {
        body: `A ball's height is ${math(`h = ${poly(h).replace(/x/g, 't')}`)} metres after ${math('t')} seconds. During what time interval is it higher than ${H} m?`,
        answer: math(`${t1} < t < ${t2}`),
        distractors: [`t < ${t1} "or" t > ${t2}`, `0 < t < ${t2}`, `${t1} <= t <= ${t2 + 1}`].map(math),
        solution: `${math(`${poly(h).replace(/x/g, 't')} > ${H}`)} simplifies to ${math(`-5(t - ${t1})(t - ${t2}) > 0`)}, which holds between the roots: ${math(`${t1} < t < ${t2}`)}.`,
      };
    }
    if (difficulty === 2) {
      const n1 = rng.int(10, 40), n2 = n1 + rng.int(10, 15 * optNum(o, 'size', 4)), k = rng.pick([1, 2, 5]);
      const P = fromRoots([n1, n2], -k);
      return {
        body: `A company's profit is ${math(`P = ${poly(P)}`)} dollars for ${math('x')} items. For what numbers of items is there a profit (${math('P > 0')})?`,
        answer: math(`${n1} < x < ${n2}`),
        distractors: [`x < ${n1} "or" x > ${n2}`, `x > ${n2}`, `${n1} <= x <= ${n2}`].map(math),
        solution: `${math(`${poly(P)} = 0`)} at ${math(`x = ${n1}`)} and ${math(`x = ${n2}`)}. The parabola opens downward, so ${math('P > 0')} between them: ${math(`${n1} < x < ${n2}`)}.`,
      };
    }
    const L = rng.int(20, 60) * 2, lo = rng.int(4, L / 4 - 2);
    const hi = L / 2 - lo, A = lo * hi;
    return {
      body: `A rectangle has a perimeter of ${L} cm. For what widths ${math('w')} is its area at least ${A} cm²?`,
      answer: math(`${lo} <= w <= ${hi}`),
      distractors: [`w <= ${lo} "or" w >= ${hi}`, `${lo} < w < ${hi}`, `w >= ${lo}`].map(math),
      solution: `${math(`w(${L / 2} - w) >= ${A}`)} gives ${math(`w^2 - ${L / 2}w + ${A} <= 0`)}, i.e. ${math(`(w - ${lo})(w - ${hi}) <= 0`)}, so ${math(`${lo} <= w <= ${hi}`)}.`,
    };
  },
});

/** A shaded inequality region: solid boundary for ≤/≥, broken for </>. */
function inequalityGraph(f: number[], op: Op, size: number): string {
  return graphTypst({
    xMin: -8, xMax: 8, yMin: -8, yMax: 8, xLabelStep: 2, yLabelStep: 2, width: size, height: size,
    curves: [{ f: (x) => polyEval(f, x), dashed: !op.includes('=') }],
    shade: [{ f: (x) => polyEval(f, x), side: op.startsWith('>') ? 'above' : 'below' }],
  });
}

const flipOp = (op: Op): Op => ({ '<': '>', '<=': '>=', '>': '<', '>=': '<=' } as const)[op];
const toggleStrict = (op: Op): Op => ({ '<': '<=', '<=': '<', '>': '>=', '>=': '>' } as const)[op];

export const ineqLinearGraph = pc30s('30s-ineq-linear-graph', {
  levels: { 1: 'y > mx + b', 2: 'Solid or broken boundary', 3: 'Rearrange to y = mx + b first' },
  options: [
    radioOption('form', 'Inequality', [['1', 'y > mx + b'], ['2', 'Solid or broken boundary'], ['3', 'Rearrange to y = mx + b first']], ['1', '2', '3']),
    OPS_OPTION(['strict', 'any', 'any']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const m = rng.nonZero(-3, 3), b = rng.int(-5, 5);
    const op = pickOp(rng, o, difficulty === 1 ? 'strict' : 'any');
    let shown = `y ${op} ${poly([m, b])}`;
    if (difficulty === 3) {
      // Write as A x + B y op C with B > 0 so the inequality direction matches.
      const k = rng.int(1, 3);
      shown = `${poly([-m * k, 0]).replace(/^(-?)1x/, '$1x')} + ${k === 1 ? '' : k}y ${op} ${b * k}`.replace('+ -', '- ');
    }
    return {
      body: `Graph ${math(shown)}.`,
      answer: inequalityGraph([m, b], op, 3.4),
      distractors: [inequalityGraph([m, b], flipOp(op), 3.4), inequalityGraph([m, b], toggleStrict(op), 3.4), inequalityGraph([-m, b], op, 3.4)],
      solution: `${difficulty === 3 ? `Solve for ${math('y')}: ${math(`y ${op} ${poly([m, b])}`)}. ` : ''}Draw ${math(`y = ${poly([m, b])}`)} as a ${op.includes('=') ? 'solid' : 'broken'} line (${op.includes('=') ? 'points on it are included' : 'points on it are not included'}) and shade ${op.startsWith('>') ? 'above' : 'below'} it. Check with a test point such as ${math('(0, 0)')}.`,
    };
  },
});

export const ineqQuadraticGraph = pc30s('30s-ineq-quadratic-graph', {
  levels: { 1: 'y > x² + c', 2: 'Solid or broken boundary', 3: 'Any quadratic boundary' },
  options: [
    radioOption('form', 'Inequality', [['1', 'y > x² + c'], ['2', 'Solid or broken boundary'], ['3', 'Any quadratic boundary']], ['1', '2', '3']),
    OPS_OPTION(['strict', 'any', 'any']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const f = difficulty === 3 ? fromRoots([rng.int(-4, 0), rng.int(1, 4)], rng.pick([1, -1])) : [rng.pick([1, -1]), 0, rng.int(-5, 5)];
    const op = pickOp(rng, o, difficulty === 1 ? 'strict' : 'any');
    return {
      body: `Graph ${math(`y ${op} ${poly(f)}`)}.`,
      answer: inequalityGraph(f, op, 3.4),
      distractors: [inequalityGraph(f, flipOp(op), 3.4), inequalityGraph(f, toggleStrict(op), 3.4), inequalityGraph(f.map((c) => -c), op, 3.4)],
      solution: `Draw ${math(`y = ${poly(f)}`)} as a ${op.includes('=') ? 'solid' : 'broken'} curve and shade the region ${op.startsWith('>') ? 'above' : 'below'} it. Check with a test point not on the curve.`,
    };
  },
});

export const ineqFromGraph = pc30s('30s-ineq-from-graph', {
  levels: { 1: 'Linear boundary', 2: 'Quadratic boundary', 3: 'Either, solid or broken' },
  options: [
    radioOption('form', 'Boundary', [['1', 'Linear boundary'], ['2', 'Quadratic boundary'], ['3', 'Either, solid or broken']], ['1', '2', '3']),
    OPS_OPTION(['strict', 'strict', 'any']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const quadratic = difficulty === 2 || (difficulty === 3 && rng.next() < 0.5);
    const f = quadratic ? [rng.pick([1, -1]), 0, rng.int(-5, 5)] : [rng.nonZero(-3, 3), rng.int(-5, 5)];
    const op = pickOp(rng, o, difficulty === 3 ? 'any' : 'strict');
    const answer = `y ${op} ${poly(f)}`;
    return {
      body: `Write the inequality that describes the shaded region. (A broken boundary is not included.)\n\n${inequalityGraph(f, op, 5)}`,
      answer: math(answer),
      distractors: [`y ${flipOp(op)} ${poly(f)}`, `y ${toggleStrict(op)} ${poly(f)}`, `y ${op} ${poly(f.map((c, i) => (i === f.length - 1 ? -c : c)))}`].filter((d, i, all) => d !== answer && all.indexOf(d) === i).map(math),
      solution: `The boundary is ${math(`y = ${poly(f)}`)}, drawn ${op.includes('=') ? 'solid (included)' : 'broken (not included)'}, and the region ${op.startsWith('>') ? 'above' : 'below'} it is shaded: ${math(answer)}.`,
    };
  },
});

// ── Reciprocal functions ──────────────────────────────────────────────────

export const recipAsymptotes = pc30s('30s-recip-asymptotes', {
  points: 1,
  levels: { 1: 'f linear', 2: 'f quadratic with two zeros', 3: 'f quadratic with one zero or none' },
  options: [
    radioOption('form', 'f(x)', [['1', 'f linear'], ['2', 'f quadratic with two zeros'], ['3', 'f quadratic with one zero or none']], ['1', '2', '3']),
    sizeOption([3, 6, 9], [6, 6, 6], 'Size of the zeros'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const N = optNum(o, 'size', 6);
    let f: number[], zeros: number[];
    if (difficulty === 1) { const a = rng.nonZero(-3, 3), z = rng.int(-N, N); f = [a, -a * z]; zeros = [z]; }
    else if (difficulty === 2) { const [r, s] = twoRoots(rng, -N, N); f = fromRoots([r, s]); zeros = [r, s]; }
    else if (rng.next() < 0.5) { const r = rng.int(1 - N, N - 1); f = fromRoots([r, r]); zeros = [r]; }
    else { f = [1, 0, rng.int(1, 9)]; zeros = []; }
    const answer = zeros.length ? zeros.map((z) => `x = ${z}`).join(', ') : '"none"';
    return {
      body: `State the equation(s) of the vertical asymptote(s) of ${math(`y = 1/(${poly(f)})`)}.`,
      answer: math(answer),
      distractors: [zeros.length ? zeros.map((z) => `x = ${-z}`).join(', ') : 'x = 0', 'y = 0', zeros.length ? `x = ${f[f.length - 1]}` : `x = ± ${Math.round(Math.sqrt(f[2]))}`].filter((d, i, all) => d !== answer && all.indexOf(d) === i).map(math),
      solution: `Vertical asymptotes occur where ${math('f(x) = 0')} (the non-permissible values of the reciprocal): ${zeros.length ? math(answer) : `${math(`${poly(f)} > 0`)} for every ${math('x')}, so there are none`}.`,
    };
  },
});

export const recipInvariant = pc30s('30s-recip-invariant', {
  points: 1,
  levels: { 1: 'f(x) = x + b', 2: 'f(x) = ax + b', 3: 'f quadratic' },
  options: [
    radioOption('form', 'f(x)', [['1', 'f(x) = x + b'], ['2', 'f(x) = ax + b'], ['3', 'f quadratic']], ['1', '2', '3']),
    sizeOption([3, 6, 9], [6, 6, 6], 'Size of numbers'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    if (difficulty === 3) {
      const c = rng.int(2, optNum(o, 'size', 6));
      // f = x² − c: f = 1 at x = ±√(c+1), f = −1 at x = ±√(c−1)
      const root = (v: number) => (Number.isInteger(Math.sqrt(v)) ? String(Math.sqrt(v)) : `sqrt(${v})`);
      const pts = [`(-${root(c + 1)}, 1)`, `(${root(c + 1)}, 1)`, `(-${root(c - 1)}, -1)`, `(${root(c - 1)}, -1)`];
      const answer = pts.join(', ');
      return {
        body: `Find the invariant points of ${math(`y = 1/(x^2 - ${c})`)} compared with ${math(`y = x^2 - ${c}`)}.`,
        answer: math(answer),
        distractors: [pts.slice(0, 2).join(', '), `(${root(c)}, 0), (-${root(c)}, 0)`, `(0, ${-c}), (0, -1/${c})`].map(math),
        solution: `Invariant points are where ${math('f(x) = 1')} or ${math('f(x) = -1')}: ${math(`x^2 = ${c + 1}`)} or ${math(`x^2 = ${c - 1}`)}. That gives ${math(answer)}.`,
      };
    }
    const a = difficulty === 1 ? 1 : rng.nonZero(-3, 3), b = rng.int(-optNum(o, 'size', 6), optNum(o, 'size', 6));
    const x1 = new Q(1 - b, a), x2 = new Q(-1 - b, a);
    const pts = [[x1, 1], [x2, -1]].sort((p, q) => (p[0] as Q).value - (q[0] as Q).value).map(([x, y]) => `(${(x as Q).typst()}, ${y})`).join(', ');
    return {
      body: `Find the invariant points of ${math(`y = 1/(${poly([a, b])})`)} compared with ${math(`y = ${poly([a, b])}`)}.`,
      answer: math(pts),
      distractors: [`(${new Q(-b, a).typst()}, 0)`, `(${x1.typst()}, 1)`, [[x1, -1], [x2, 1]].map(([x, y]) => `(${(x as Q).typst()}, ${y})`).join(', ')].map(math),
      solution: `Invariant points are where ${math('f(x) = ± 1')}: ${math(`${poly([a, b])} = 1`)} gives ${math(`x = ${x1.typst()}`)} and ${math(`${poly([a, b])} = -1`)} gives ${math(`x = ${x2.typst()}`)}. So ${math(pts)}.`,
    };
  },
});

export const recipFeatures = pc30s('30s-recip-features', {
  levels: { 1: 'Domain and asymptotes', 2: 'Range and y-intercept', 3: 'With a stretch' },
  options: [
    radioOption('form', 'Ask for', [['1', 'Domain and asymptotes'], ['2', 'Range and y-intercept'], ['3', 'With a stretch']], ['1', '2', '3']),
    sizeOption([3, 6, 9], [6, 6, 6], 'Size of the asymptote'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const h = rng.nonZero(-optNum(o, 'size', 6), optNum(o, 'size', 6)), k = difficulty === 3 ? rng.pick([2, 3, -2]) : 1;
    const f = `y = ${k === 1 ? '1' : k}/(x ${h > 0 ? '-' : '+'} ${Math.abs(h)})`;
    const ask = difficulty === 1 ? rng.pick(['domain', 'vertical', 'horizontal'] as const) : rng.pick(['range', 'yint'] as const);
    const answers = { domain: `{x | x != ${h}, x in RR}`, vertical: `x = ${h}`, horizontal: 'y = 0', range: '{y | y != 0, y in RR}', yint: `(0, ${new Q(k, -h).typst()})` };
    const wrong = {
      domain: [`{x | x != ${-h}, x in RR}`, '{x | x != 0, x in RR}', '{x | x in RR}'],
      vertical: [`x = ${-h}`, 'y = 0', `x = ${k}`],
      horizontal: [`y = ${k}`, `x = ${h}`, `y = ${h}`],
      range: [`{y | y != ${h}, y in RR}`, '{y | y > 0, y in RR}', '{y | y in RR}'],
      yint: [`(0, ${new Q(k, h).typst()})`, `(${h}, 0)`, `(0, ${-h})`],
    };
    const noun = { domain: 'the domain', vertical: 'the vertical asymptote', horizontal: 'the horizontal asymptote', range: 'the range', yint: 'the y-intercept' }[ask];
    return {
      body: `State ${noun} of ${math(f)}.`,
      answer: math(answers[ask]),
      distractors: wrong[ask].filter((w, i, all) => w !== answers[ask] && all.indexOf(w) === i).map(math),
      solution: `The denominator is 0 at ${math(`x = ${h}`)}: a vertical asymptote, and ${math(`x != ${h}`)}. The numerator is never 0, so ${math('y != 0')} and ${math('y = 0')} is the horizontal asymptote. At ${math('x = 0')}, ${math(`y = ${new Q(k, -h).typst()}`)}.`,
    };
  },
});

function reciprocalGraph(f: number[], size: number, showF: boolean, recip = true, asymptotes = true): string {
  // Zeros of f: exact grid hits (including double roots), then sign changes refined by bisection.
  const zeros: number[] = [];
  const at = (x: number) => polyEval(f, x);
  for (let x = -8; x < 8; x += 0.25) {
    if (Math.abs(at(x)) < 1e-9) { zeros.push(x); continue; }
    let [lo, hi] = [x, x + 0.25];
    if (Math.abs(at(hi)) < 1e-9 || Math.sign(at(lo)) === Math.sign(at(hi))) continue;
    for (let i = 0; i < 50; i++) { const mid = (lo + hi) / 2; if (Math.sign(at(mid)) === Math.sign(at(lo))) lo = mid; else hi = mid; }
    zeros.push((lo + hi) / 2);
  }
  return graphTypst({
    xMin: -6, xMax: 6, yMin: -6, yMax: 6, xLabelStep: 2, yLabelStep: 2, width: size, height: size,
    curves: [...(showF ? [{ f: (x: number) => polyEval(f, x), faint: true }] : []), { f: (x: number) => (recip ? 1 / polyEval(f, x) : polyEval(f, x)) }],
    vertical: recip && asymptotes ? zeros : [], horizontal: recip && asymptotes ? [0] : [],
  });
}

export const recipSketch = pc30s('30s-recip-sketch', {
  levels: { 1: 'f linear', 2: 'f quadratic with two zeros', 3: 'f quadratic with no zeros' },
  options: [
    radioOption('form', 'f(x)', [['1', 'f linear'], ['2', 'f quadratic with two zeros'], ['3', 'f quadratic with no zeros']], ['1', '2', '3']),
    toggleOption('guide', 'Show y = f(x) dashed on the choices', [true, true, true]),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const guide = optOn(o, 'guide', true);
    let f: number[], fText: string;
    const signed = (v: number) => (v < 0 ? `- ${-v}` : `+ ${v}`);
    if (difficulty === 1) {
      const a = rng.pick([1, -1, 2, 0.5]), b = rng.int(-3, 3);
      f = [a, b];
      fText = `${a === 0.5 ? '1/2 ' : a === 1 ? '' : a === -1 ? '-' : a}x${b ? ` ${signed(b)}` : ''}`;
    } else if (difficulty === 2) {
      const [r, s] = twoRoots(rng, -4, 4);
      f = fromRoots([r, s]).map((c) => c / 2);
      fText = `1/2 ${[r, s].map((z) => (z ? `(x ${signed(-z)})` : 'x')).join('')}`;
    } else {
      const c = rng.int(1, 2);
      f = [0.5, 0, c];
      fText = `1/2 x^2 + ${c}`;
    }
    return {
      body: `The graph of ${math(`f(x) = ${fText}`)} is shown. Graph ${math('y = 1/f(x)')}.\n\n${reciprocalGraph(f, 4.5, false, false)}`,
      answer: reciprocalGraph(f, 3.4, guide),
      distractors: [reciprocalGraph(f.map((c) => -c), 3.4, guide), reciprocalGraph(f.map((c, i) => (i === f.length - 1 ? c + 2 : c)), 3.4, guide), graphTypst({ xMin: -6, xMax: 6, yMin: -6, yMax: 6, xLabelStep: 2, yLabelStep: 2, width: 3.4, height: 3.4, curves: [...(guide ? [{ f: (x: number) => polyEval(f, x), faint: true }] : []), { f: (x: number) => -polyEval(f, x) }] })],
      solution: `Vertical asymptotes at the zeros of ${math('f')}${difficulty === 3 ? ' (there are none here)' : ''}, horizontal asymptote ${math('y = 0')}, invariant points where ${math('f(x) = ± 1')}. Where ${math('f')} is large, ${math('1/f')} is near 0, and ${math('1/f')} has the same sign as ${math('f')}.`,
    };
  },
});

export const recipFromReciprocal = pc30s('30s-recip-from-reciprocal', {
  levels: { 1: 'f(x) = x + b', 2: 'f(x) = ax + b', 3: 'f(x) = x² + c' },
  options: [
    radioOption('form', 'f(x)', [['1', 'f(x) = x + b'], ['2', 'f(x) = ax + b'], ['3', 'f(x) = x² + c']], ['1', '2', '3']),
    toggleOption('asymptotes', 'Show the asymptotes on the given graph', [true, true, true]),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const f = difficulty === 3 ? [1, 0, rng.int(-4, 1)] : [difficulty === 1 ? 1 : rng.pick([2, -1, -2, 0.5]), rng.int(-3, 3)];
    return {
      body: `The graph of ${math('y = 1/f(x)')} is shown. Which is the graph of ${math('y = f(x)')}?\n\n${reciprocalGraph(f, 4.5, false, true, optOn(o, 'asymptotes', true))}`,
      answer: reciprocalGraph(f, 3.4, false, false),
      distractors: [reciprocalGraph(f.map((c) => -c), 3.4, false, false), reciprocalGraph(f.map((c, i) => (i === f.length - 1 ? -c : c)), 3.4, false, false), reciprocalGraph(f.map((c, i) => (i === 0 ? c * 2 : c)), 3.4, false, false)],
      solution: `The vertical asymptotes of ${math('y = 1/f(x)')} are the zeros of ${math('f')}, the invariant points ${math('y = ± 1')} lie on both graphs, and ${math('f')} has the same sign as ${math('1/f')}. Together these fix the graph of ${math('f')}.`,
    };
  },
});

export const SYSTEM_30S = [sysLinearQuadratic, sysQuadraticQuadratic, sysCount, sysProblem, sysGraphical, ineqTestPoint, ineqQuadraticOneVar, ineqQuadraticProblem, ineqLinearGraph, ineqQuadraticGraph, ineqFromGraph, recipAsymptotes, recipInvariant, recipFeatures, recipSketch, recipFromReciprocal];

