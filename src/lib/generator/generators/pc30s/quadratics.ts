import type { Rng } from '../../rng.ts';
import { poly, round } from '../../format.ts';
import { Q, simplifySqrt, Surds } from '../../exact.ts';
import { graphTypst } from '../../graph.ts';
import { math, pc30s } from '../pc40s/common.ts';
import { optNum, optOn, optOne, radioOption, sizeOption, toggleOption } from '../../options.ts';

/** y = a(x − p)² + q, with a rational. */
interface Vertex { a: Q; p: number; q: number }

function vertexText(v: Vertex): string {
  const lead = v.a.eq(1) ? '' : v.a.eq(-1) ? '-' : v.a.isInt ? String(v.a.n) : `${v.a.typst()} `;
  const inner = v.p === 0 ? 'x^2' : `(x ${v.p > 0 ? '-' : '+'} ${Math.abs(v.p)})^2`;
  return `y = ${lead}${inner}${v.q === 0 ? '' : ` ${v.q < 0 ? '-' : '+'} ${Math.abs(v.q)}`}`;
}

/** `(x - 3)^2`, `(x + 3/2)^2`, `x^2` for a shift p. */
const squared = (p: number | Q) => { const P = Q.of(p); return P.eq(0) ? 'x^2' : `(x ${P.sign > 0 ? '-' : '+'} ${P.abs().typst()})^2`; };
/** ` + 3`, ` - 17/4`, or nothing. */
const plusQ = (q: number | Q) => { const Qv = Q.of(q); return Qv.eq(0) ? '' : ` ${Qv.sign < 0 ? '-' : '+'} ${Qv.abs().typst()}`; };
/** Two sides of an equation ax² + c = −bx, written without zero terms. */
const rearranged = (a: number, b: number, c: number) => `${poly([a, 0, c])} = ${b === 0 ? '0' : poly([-b, 0])}`;

const at = (v: Vertex, x: number) => v.a.value * (x - v.p) ** 2 + v.q;
/** Standard-form coefficients of a vertex-form quadratic. */
const standard = (v: Vertex): Q[] => [v.a, v.a.mul(-2 * v.p), v.a.mul(v.p * v.p).add(v.q)];
const standardText = (v: Vertex) => {
  const [a, b, c] = standard(v);
  return a.isInt && b.isInt && c.isInt ? poly([a.n, b.n, c.n]) : null;
};

function randomVertex(rng: Rng, difficulty: number, integerStandard = false, N = 5): Vertex {
  for (;;) {
    const a = difficulty === 1 ? new Q(1) : difficulty === 2 ? new Q(rng.pick([-1, 2, -2, 3, -3])) : new Q(rng.pick([1, -1, 1, 2, -2]), rng.pick([1, 2]));
    const v = { a, p: rng.int(-N, N), q: rng.int(-N - 2, N + 2) };
    if (integerStandard && !standardText(v)) continue;
    return v;
  }
}

/** x-intercepts of y = a(x − p)² + q as exact text, or null when there are none. */
function xIntercepts(v: Vertex): string[] | null {
  const k = new Q(-v.q).div(v.a); // (x − p)² = −q/a
  if (k.value < 0) return null;
  if (k.eq(0)) return [String(v.p)];
  const root = Surds.of(1, k.n * k.d).div(k.d); // √(n/d) = √(nd)/d
  return [Surds.of(v.p).sub(root).typst(), Surds.of(v.p).add(root).typst()];
}

function parabolaGraph(v: Vertex, size: number, dots: Array<{ x: number; y: number }> = [], vertex = true): string {
  return graphTypst({ xMin: -8, xMax: 8, yMin: -8, yMax: 8, xLabelStep: 2, yLabelStep: 2, width: size, height: size, curves: [{ f: (x) => at(v, x) }], dots: [...(vertex ? [{ x: v.p, y: v.q }] : []), ...dots] });
}

// ── Vertex form ───────────────────────────────────────────────────────────

export const qvVertex = pc30s('30s-qv-vertex', {
  points: 1,
  levels: { 1: 'y = (x − p)² + q', 2: 'With a stretch or reflection', 3: 'Fractional a' },
  options: [
    radioOption('form', 'Equation', [['1', 'y = (x − p)² + q'], ['2', 'With a stretch or reflection'], ['3', 'Fractional a']], ['1', '2', '3']),
    sizeOption([3, 5, 7], [5, 5, 5], 'Size of the vertex coordinates'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const v = randomVertex(rng, difficulty, false, optNum(o, 'size', 5));
    const answer = `(${v.p}, ${v.q})`;
    return {
      body: `State the coordinates of the vertex of ${math(vertexText(v))}.`,
      answer: math(answer),
      distractors: [`(${-v.p}, ${v.q})`, `(${v.p}, ${-v.q})`, `(${v.q}, ${v.p})`, `(${-v.p}, ${-v.q})`].filter((d, i, all) => d !== answer && all.indexOf(d) === i).map(math),
      solution: `In ${math('y = a(x - p)^2 + q')} the vertex is ${math('(p, q)')}. Here ${math(`p = ${v.p}`)} (note the sign inside the bracket) and ${math(`q = ${v.q}`)}: ${math(answer)}.`,
    };
  },
});

export const qvCharacteristics = pc30s('30s-qv-characteristics', {
  levels: { 1: 'Opening, axis, and domain', 2: 'Range and y-intercept', 3: 'x-intercepts' },
  options: [
    radioOption('form', 'Ask for', [['1', 'Opening, axis, and domain'], ['2', 'Range and y-intercept'], ['3', 'x-intercepts']], ['1', '2', '3']),
    sizeOption([3, 5, 7], [5, 5, 5], 'Size of the vertex coordinates'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const v = randomVertex(rng, Math.max(difficulty, 2), false, optNum(o, 'size', 5));
    const up = v.a.value > 0;
    const ask = difficulty === 1 ? rng.pick(['opening', 'axis', 'domain'] as const) : difficulty === 2 ? rng.pick(['range', 'yint'] as const) : 'xint';
    const yInt = v.a.mul(v.p * v.p).add(v.q);
    const xs = xIntercepts(v);
    const answers = {
      opening: `"${up ? 'upward' : 'downward'}"`,
      axis: `x = ${v.p}`,
      domain: '{x | x in RR}',
      range: `{y | y ${up ? '>=' : '<='} ${v.q}, y in RR}`,
      yint: `(0, ${yInt.typst()})`,
      xint: xs ? xs.map((x) => `(${x}, 0)`).join(', ') : '"none"',
    };
    const wrong = {
      opening: [`"${up ? 'downward' : 'upward'}"`, '"to the right"', '"to the left"'],
      axis: [`x = ${-v.p}`, `y = ${v.q}`, `x = ${v.q}`],
      domain: [`{x | x >= ${v.p}, x in RR}`, `{x | x >= ${v.q}, x in RR}`, `{x | x != ${v.p}, x in RR}`],
      range: [`{y | y ${up ? '<=' : '>='} ${v.q}, y in RR}`, `{y | y ${up ? '>=' : '<='} ${v.p}, y in RR}`, '{y | y in RR}'],
      yint: [`(0, ${v.q})`, `(0, ${new Q(v.p * v.p).add(v.q).typst()})`, `(0, ${yInt.neg().typst()})`],
      xint: xs ? [xs.map((x) => `(${x}, 0)`).slice(0, 1).join(''), `(${v.p}, 0)`, '"none"'] : [`(${v.p}, 0)`, `(${v.p - 1}, 0), (${v.p + 1}, 0)`, `(0, ${v.q})`],
    };
    const noun = { opening: 'the direction of opening', axis: 'the equation of the axis of symmetry', domain: 'the domain', range: 'the range', yint: 'the y-intercept', xint: 'the x-intercepts' }[ask];
    return {
      body: `State ${noun} of ${math(vertexText(v))}.`,
      answer: math(answers[ask]),
      distractors: wrong[ask].filter((w, i, all) => w !== answers[ask] && all.indexOf(w) === i).map(math),
      solution: {
        opening: `${math(`a = ${v.a.typst()}`)} is ${up ? 'positive' : 'negative'}, so the parabola opens ${up ? 'upward' : 'downward'}.`,
        axis: `The axis of symmetry passes through the vertex ${math(`(${v.p}, ${v.q})`)}: ${math(answers.axis)}.`,
        domain: `Any ${math('x')} can be squared: ${math(answers.domain)}.`,
        range: `The vertex ${math(`(${v.p}, ${v.q})`)} is a ${up ? 'minimum' : 'maximum'}: ${math(answers.range)}.`,
        yint: `At ${math('x = 0')}: ${math(`y = ${v.a.typst()}(${-v.p})^2 ${v.q < 0 ? '-' : '+'} ${Math.abs(v.q)} = ${yInt.typst()}`)}.`,
        xint: xs ? `Set ${math('y = 0')}: ${math(`${squared(v.p)} = ${new Q(-v.q).div(v.a).typst()}`)}, so ${math(`x = ${xs.join(', ')}`)}.` : `The vertex is ${up ? 'above' : 'below'} the x-axis and the parabola opens ${up ? 'upward' : 'downward'}, so there are no x-intercepts.`,
      }[ask],
    };
  },
});

export const qvEffects = pc30s('30s-qv-effects', {
  levels: { 1: 'One parameter', 2: 'Translations', 3: 'All parameters' },
  options: [
    radioOption('form', 'Parameters', [['1', 'One parameter'], ['2', 'Translations'], ['3', 'All parameters']], ['1', '2', '3']),
    sizeOption([3, 5, 7], [5, 5, 5], 'Size of the vertex coordinates'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const N = optNum(o, 'size', 5);
    const v = difficulty === 1
      ? rng.pick([{ a: new Q(rng.pick([2, 3, -1, 1])), p: 0, q: rng.nonZero(-N, N) }, { a: new Q(rng.pick([2, 3, -2])), p: 0, q: 0 }, { a: new Q(1), p: rng.nonZero(-N, N), q: 0 }])
      : difficulty === 2 ? { a: new Q(1), p: rng.nonZero(-N, N), q: rng.nonZero(-N, N) } : randomVertex(rng, 3, false, N);
    const describe = (w: Vertex) => {
      const parts: string[] = [];
      const A = w.a.abs();
      if (!A.eq(1)) parts.push(`a vertical ${A.value > 1 ? 'stretch' : 'compression'} by a factor of ${A.typst()}`);
      if (w.a.sign < 0) parts.push('a reflection in the x-axis');
      if (w.p) parts.push(`a translation ${Math.abs(w.p)} ${w.p > 0 ? 'right' : 'left'}`);
      if (w.q) parts.push(`a translation ${Math.abs(w.q)} ${w.q > 0 ? 'up' : 'down'}`);
      const list = parts.length <= 1 ? parts[0] ?? 'no change' : `${parts.slice(0, -1).join(', ')}${parts.length > 2 ? ',' : ''} and ${parts[parts.length - 1]}`;
      return list.charAt(0).toUpperCase() + list.slice(1);
    };
    const answer = describe(v);
    return {
      body: `Describe how the graph of ${math(vertexText(v))} compares to the graph of ${math('y = x^2')}.`,
      answer,
      distractors: [describe({ ...v, p: -v.p, q: v.p ? v.q : -v.q }), describe({ ...v, a: v.a.neg() }), describe({ ...v, a: v.a.abs().eq(1) ? new Q(2) : new Q(v.a.d, v.a.n) }), describe({ ...v, p: v.q, q: v.p })].filter((d, i, all) => d !== answer && all.indexOf(d) === i),
      solution: `${math(`a = ${v.a.typst()}`)}, ${math(`p = ${v.p}`)}, ${math(`q = ${v.q}`)}: ${answer.charAt(0).toLowerCase() + answer.slice(1)}.`,
    };
  },
});

export const qvInterceptCount = pc30s('30s-qv-intercept-count', {
  points: 1,
  levels: { 1: 'Opening upward', 2: 'Either direction', 3: 'From standard form' },
  options: [
    radioOption('form', 'Form', [['1', 'Opening upward'], ['2', 'Either direction'], ['3', 'From standard form']], ['1', '2', '3']),
    sizeOption([3, 5, 7], [5, 5, 5], 'Size of the vertex coordinates'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const v = randomVertex(rng, difficulty === 1 ? 1 : 2, difficulty === 3, optNum(o, 'size', 5));
    if (difficulty === 1 && v.a.value < 0) v.a = v.a.neg();
    const count = v.q === 0 ? 1 : (v.a.value > 0) === (v.q < 0) ? 2 : 0;
    const answer = ['No x-intercepts', 'One x-intercept', 'Two x-intercepts'][count];
    const given = difficulty === 3 ? `y = ${standardText(v)}` : vertexText(v);
    return {
      body: `How many x-intercepts does the graph of ${math(given)} have?`,
      answer,
      distractors: ['No x-intercepts', 'One x-intercept', 'Two x-intercepts', 'Infinitely many'].filter((d) => d !== answer),
      solution: `${difficulty === 3 ? `Complete the square: ${math(vertexText(v))}. ` : ''}The vertex is ${math(`(${v.p}, ${v.q})`)} and the parabola opens ${v.a.value > 0 ? 'upward' : 'downward'}. ${count === 1 ? 'The vertex is on the x-axis.' : count === 2 ? 'The vertex is on the opposite side of the x-axis from the opening direction, so the graph crosses twice.' : 'The graph opens away from the x-axis and never reaches it.'}`,
    };
  },
});

export const qvEquation = pc30s('30s-qv-equation', {
  levels: { 1: 'Vertex and a whole-number a', 2: 'Negative a', 3: 'Fractional a' },
  options: [
    radioOption('form', 'a', [['1', 'Vertex and a whole-number a'], ['2', 'Negative a'], ['3', 'Fractional a']], ['1', '2', '3']),
    sizeOption([3, 5, 7], [5, 5, 5], 'Size of the vertex coordinates'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const v = randomVertex(rng, difficulty, false, optNum(o, 'size', 5));
    // An even offset keeps a·(offset)² whole when a is a half; the point is never the vertex.
    const x1 = v.p + (v.a.d === 2 ? rng.pick([-4, -2, 2, 4]) : rng.nonZero(-3, 3));
    const y1 = at(v, x1);
    const answer = vertexText(v);
    return {
      body: `A parabola has vertex ${math(`(${v.p}, ${v.q})`)} and passes through ${math(`(${x1}, ${y1})`)}. Write its equation in the form ${math('y = a(x - p)^2 + q')}.`,
      answer: math(answer),
      distractors: [vertexText({ ...v, p: -v.p }), vertexText({ ...v, a: v.a.neg() }), vertexText({ ...v, a: new Q(y1 - v.q) })].filter((d, i, all) => d !== answer && all.indexOf(d) === i).map(math),
      solution: `${math(`y = a ${squared(v.p)}${plusQ(v.q)}`)}. Substitute ${math(`(${x1}, ${y1})`)}: ${math(`${y1} = a(${x1 - v.p})^2${plusQ(v.q)}`)}, so ${math(`a = ${v.a.typst()}`)}. ${math(answer)}.`,
    };
  },
});

export const qvSketch = pc30s('30s-qv-sketch', {
  levels: { 1: 'Translations', 2: 'With a stretch or reflection', 3: 'Fractional a' },
  options: [
    radioOption('form', 'Equation', [['1', 'Translations'], ['2', 'With a stretch or reflection'], ['3', 'Fractional a']], ['1', '2', '3']),
    sizeOption([3, 4, 5], [5, 5, 5], 'Size of the vertex coordinates'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const v = randomVertex(rng, difficulty, false, optNum(o, 'size', 5));
    return {
      body: `Graph ${math(vertexText(v))}.`,
      answer: parabolaGraph(v, 3.4),
      distractors: [parabolaGraph({ ...v, p: -v.p }, 3.4), parabolaGraph({ ...v, a: v.a.neg() }, 3.4), parabolaGraph({ ...v, q: -v.q || 2 }, 3.4)],
      solution: `Vertex ${math(`(${v.p}, ${v.q})`)}; opens ${v.a.value > 0 ? 'upward' : 'downward'}; from the vertex, go 1 left or right and ${math(v.a.abs().typst())} ${v.a.value > 0 ? 'up' : 'down'}, and 2 left or right and ${math(v.a.abs().mul(4).typst())} ${v.a.value > 0 ? 'up' : 'down'}.`,
    };
  },
});

export const qvFromGraph = pc30s('30s-qv-from-graph', {
  levels: { 1: 'a = 1 or −1', 2: 'Whole-number a', 3: 'Fractional a' },
  options: [
    radioOption('form', 'a', [['1', 'a = 1 or −1'], ['2', 'Whole-number a'], ['3', 'Fractional a']], ['1', '2', '3']),
    sizeOption([3, 4, 5], [5, 5, 5], 'Size of the vertex coordinates'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const v = randomVertex(rng, difficulty === 1 ? 1 : difficulty, false, optNum(o, 'size', 5));
    if (difficulty === 1 && rng.next() < 0.5) v.a = new Q(-1);
    const x1 = v.p + (v.a.d === 2 ? 2 : 1);
    const answer = vertexText(v);
    return {
      body: `Write the equation of the parabola in the form ${math('y = a(x - p)^2 + q')}.\n\n${parabolaGraph(v, 5.5, [{ x: x1, y: at(v, x1) }])}`,
      answer: math(answer),
      distractors: [vertexText({ ...v, p: -v.p }), vertexText({ ...v, a: v.a.neg() }), vertexText({ ...v, p: v.q, q: v.p }), vertexText({ ...v, a: v.a.eq(1) ? new Q(2) : new Q(1) })].filter((d, i, all) => d !== answer && all.indexOf(d) === i).map(math),
      solution: `The vertex is ${math(`(${v.p}, ${v.q})`)}. The marked point ${math(`(${x1}, ${at(v, x1)})`)} gives ${math(`a = (${at(v, x1)} - (${v.q}))/(${x1 - v.p})^2 = ${v.a.typst()}`)}. ${math(answer)}.`,
    };
  },
});

// ── Standard form ─────────────────────────────────────────────────────────

export const qsCompleteSquare = pc30s('30s-qs-complete-square', {
  levels: { 1: 'a = 1, even b', 2: 'a = 1, odd b', 3: 'a ≠ 1' },
  options: [
    radioOption('form', 'Coefficients', [['1', 'a = 1, even b'], ['2', 'a = 1, odd b'], ['3', 'a ≠ 1']], ['1', '2', '3']),
    sizeOption([3, 5, 8], [5, 5, 5], 'Size of numbers'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const a = difficulty === 3 ? rng.pick([2, 3, -2, -1]) : 1;
    // Level 2's odd b gives a fractional vertex, such as y = (x - 3/2)^2 - 17/4.
    const b = difficulty === 2 ? rng.pick([1, 3, 5, 7]) * rng.sign() : 2 * a * rng.nonZero(-optNum(o, 'size', 5), optNum(o, 'size', 5));
    const c = rng.int(-2 * optNum(o, 'size', 5), 2 * optNum(o, 'size', 5));
    const p = new Q(-b, 2 * a), q = new Q(c).sub(p.mul(p).mul(a));
    const lead = a === 1 ? '' : a === -1 ? '-' : String(a);
    const vertex = `y = ${lead}${squared(p)}${plusQ(q)}`;
    const forgotA = new Q(c).sub(p.mul(p)); // subtracting the square without multiplying by a
    return {
      body: `Write ${math(`y = ${poly([a, b, c])}`)} in vertex form by completing the square.`,
      answer: math(vertex),
      distractors: [
        `y = ${lead}${squared(p.neg())}${plusQ(q)}`,
        `y = ${lead}${squared(p)}${plusQ(forgotA.eq(q) ? q.add(p.mul(p)) : forgotA)}`,
        `y = ${lead}${squared(p.mul(2))}${plusQ(q)}`,
        `y = ${lead}${squared(p)}${plusQ(new Q(c))}`,
      ].filter((d, i, all) => d !== vertex && all.indexOf(d) === i).map(math),
      solution: `${a === 1 ? '' : `Factor ${math(String(a))} from the first two terms: ${math(`y = ${a}(x^2 ${b / a < 0 ? '-' : '+'} ${new Q(Math.abs(b), Math.abs(a)).typst()}x)${plusQ(c)}`)}. `}`
        + `Half of the x-coefficient${a === 1 ? '' : ' inside the bracket'} is ${math(p.neg().typst())}; add and subtract its square ${math(p.mul(p).typst())}${a === 1 ? '' : `, moving ${math(`${a} dot ${p.mul(p).typst()}`)} outside`}: ${math(vertex)}. The vertex is ${math(`(${p.typst()}, ${q.typst()})`)}.`,
    };
  },
});

export const qsFindError = pc30s('30s-qs-find-error', {
  levels: { 1: 'Wrong sign inside the bracket', 2: 'Forgot to multiply by a', 3: 'Added instead of subtracted' },
  options: [
    radioOption('form', 'Error', [['1', 'Wrong sign inside the bracket'], ['2', 'Forgot to multiply by a'], ['3', 'Added instead of subtracted']], ['1', '2', '3']),
    sizeOption([3, 5, 8], [5, 5, 5], 'Size of numbers'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const a = difficulty === 2 ? rng.pick([2, 3]) : 1;
    const N = optNum(o, 'size', 5);
    const p = rng.nonZero(-N, N), q = rng.int(-N - 3, N + 3);
    const b = -2 * a * p, c = a * p * p + q;
    const lead = a === 1 ? '' : String(a);
    const right = `y = ${lead}${squared(p)}${plusQ(q)}`;
    const wrongQ = difficulty === 2 ? c - p * p : difficulty === 3 ? c + a * p * p : q;
    const wrongP = difficulty === 1 ? -p : p;
    const student = `y = ${lead}${squared(wrongP)}${plusQ(wrongQ)}`;
    const explain = { 1: 'The sign inside the bracket is wrong: half of the x-coefficient goes in with its own sign.', 2: `The square that was added inside the bracket is multiplied by ${a}, so ${a} times it must be subtracted, not just the square.`, 3: 'The square was added inside the bracket, so it must be subtracted outside to keep the expression the same.' }[difficulty];
    return {
      body: `A student completed the square for ${math(`y = ${poly([a, b, c])}`)} and got ${math(student)}. Find the error and give the correct vertex form.`,
      answer: math(right),
      distractors: [student, `y = ${lead}${squared(-p)}${plusQ(wrongQ)}`, `y = ${lead}${squared(p)}${plusQ(c)}`, `y = ${lead}${squared(-p)}${plusQ(c)}`, `y = ${lead}${squared(p)}${plusQ(-q)}`].filter((d, i, all) => d !== right && all.indexOf(d) === i).map(math),
      solution: `${explain} Correct: ${math(right)}.`,
    };
  },
});

export const qsCharacteristics = pc30s('30s-qs-characteristics', {
  levels: { 1: 'Vertex', 2: 'Axis and maximum or minimum', 3: 'Range and intercepts' },
  options: [
    radioOption('form', 'Ask for', [['1', 'Vertex'], ['2', 'Axis and maximum or minimum'], ['3', 'Range and intercepts']], ['1', '2', '3']),
    sizeOption([3, 5, 7], [5, 5, 5], 'Size of the vertex coordinates'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const v = randomVertex(rng, 2, true, optNum(o, 'size', 5));
    const std = standardText(v)!;
    const up = v.a.value > 0;
    const ask = difficulty === 1 ? 'vertex' : difficulty === 2 ? rng.pick(['axis', 'extreme'] as const) : rng.pick(['range', 'yint'] as const);
    const c = standard(v)[2];
    const answers = { vertex: `(${v.p}, ${v.q})`, axis: `x = ${v.p}`, extreme: `"${up ? 'minimum' : 'maximum'} value" ${v.q}`, range: `{y | y ${up ? '>=' : '<='} ${v.q}, y in RR}`, yint: `(0, ${c.typst()})` };
    const wrong = {
      vertex: [`(${-v.p}, ${v.q})`, `(${v.p}, ${-v.q})`, `(${v.p}, ${c.typst()})`],
      axis: [`x = ${-v.p}`, `y = ${v.q}`, `x = ${standard(v)[1].typst()}`],
      extreme: [`"${up ? 'maximum' : 'minimum'} value" ${v.q}`, `"${up ? 'minimum' : 'maximum'} value" ${v.p}`, `"${up ? 'minimum' : 'maximum'} value" ${c.typst()}`],
      range: [`{y | y ${up ? '<=' : '>='} ${v.q}, y in RR}`, `{y | y ${up ? '>=' : '<='} ${c.typst()}, y in RR}`, '{y | y in RR}'],
      yint: [`(${c.typst()}, 0)`, `(0, ${v.q})`, `(0, ${c.neg().typst()})`],
    };
    const noun = { vertex: 'the coordinates of the vertex', axis: 'the equation of the axis of symmetry', extreme: 'the maximum or minimum value', range: 'the range', yint: 'the y-intercept' }[ask];
    const [A, B] = standard(v);
    return {
      body: `State ${noun} of ${math(`y = ${std}`)}.`,
      answer: math(answers[ask]),
      distractors: wrong[ask].filter((w, i, all) => w !== answers[ask] && all.indexOf(w) === i).map(math),
      solution: `${math(`x = -b/(2a) = -(${B.typst()})/(2(${A.typst()})) = ${v.p}`)}, and ${math(`y(${v.p}) = ${v.q}`)}, so the vertex is ${math(`(${v.p}, ${v.q})`)}; the parabola opens ${up ? 'upward' : 'downward'}. ${ask === 'yint' ? `At ${math('x = 0')}, ${math(`y = ${c.typst()}`)}.` : ''}`,
    };
  },
});

export const qsModel = pc30s('30s-qs-model', {
  levels: { 1: 'Maximum height of a projectile', 2: 'When it lands', 3: 'Maximum area' },
  options: [
    radioOption('form', 'Problem', [['1', 'Maximum height of a projectile'], ['2', 'When it lands'], ['3', 'Maximum area']], ['1', '2', '3']),
    sizeOption([20, 30, 50], [30, 30, 30], 'Largest initial speed or fence length'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    if (difficulty === 3) {
      const L = rng.int(20, 4 * optNum(o, 'size', 30)) * 2;
      const x = L / 4, area = x * (L - 2 * x);
      return {
        body: `A farmer has ${L} m of fence to enclose a rectangular pen against a barn wall (no fence along the wall). What is the maximum area?`,
        answer: math(`${area} "m"^2`),
        // A square pen, a pen fenced on all four sides, or half the fence as the length.
        distractors: [(L / 4) ** 2, (L / 3) ** 2, (L / 2) ** 2, (L * L) / 16].map((v) => Math.round(v)).filter((v, i, all) => v !== area && all.indexOf(v) === i).map((v) => math(`${v} "m"^2`)),
        solution: `Let ${math('x')} be the width. Then the length is ${math(`${L} - 2x`)} and ${math(`A = x(${L} - 2x) = -2x^2 + ${L}x`)}. The vertex is at ${math(`x = -${L}/(2(-2)) = ${x}`)}, so ${math(`A = ${x}(${L - 2 * x}) = ${area}`)} m².`,
      };
    }
    const v0 = rng.int(10, optNum(o, 'size', 30)), h0 = rng.int(1, 20);
    const tMax = v0 / 9.8, hMax = h0 + (v0 * v0) / (2 * 9.8);
    const model = `h = -4.9t^2 + ${v0}t + ${h0}`;
    if (difficulty === 1) {
      return {
        body: `A ball's height is ${math(model)}, in metres after ${math('t')} seconds. Find its maximum height, to the nearest tenth of a metre.`,
        answer: math(`${round(hMax, 1)} "m"`),
        // Forgetting the starting height, doubling, or using the time as the height.
        distractors: [(v0 * v0) / (2 * 9.8), h0 + (v0 * v0) / 9.8, tMax, 2 * hMax].map((v) => math(`${round(v, 1)} "m"`)).filter((d, i, all) => d !== math(`${round(hMax, 1)} "m"`) && all.indexOf(d) === i),
        solution: `The vertex is at ${math(`t = -${v0}/(2(-4.9)) approx ${round(tMax, 2)}`)} s, so the maximum height is ${math(`h approx ${round(hMax, 1)}`)} m.`,
      };
    }
    const tLand = (v0 + Math.sqrt(v0 * v0 + 4 * 4.9 * h0)) / 9.8;
    return {
      body: `A ball's height is ${math(model)}, in metres after ${math('t')} seconds. When does it hit the ground? Round to the nearest tenth of a second.`,
      answer: math(`${round(tLand, 1)} "s"`),
      distractors: [(v0 - Math.sqrt(v0 * v0 + 4 * 4.9 * h0)) / -9.8, 2 * tMax, tMax].map((v) => math(`${round(Math.abs(v), 1)} "s"`)).filter((d) => d !== math(`${round(tLand, 1)} "s"`)),
      solution: `Solve ${math(`0 = -4.9t^2 + ${v0}t + ${h0}`)} with the quadratic formula: ${math(`t = (-${v0} ± sqrt(${v0}^2 + 4(4.9)(${h0})))/(-9.8)`)}. The positive root is ${math(`t approx ${round(tLand, 1)}`)} s; the negative root is rejected.`,
    };
  },
});

export const qsSketch = pc30s('30s-qs-sketch', {
  levels: { 1: 'a = 1', 2: 'a = −1 or 2', 3: 'Any whole-number a' },
  options: [
    radioOption('form', 'a', [['1', 'a = 1'], ['2', 'a = −1 or 2'], ['3', 'Any whole-number a']], ['1', '2', '3']),
    sizeOption([3, 4, 5], [5, 5, 5], 'Size of the vertex coordinates'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const v = randomVertex(rng, difficulty === 1 ? 1 : 2, true, optNum(o, 'size', 5));
    return {
      body: `Graph ${math(`y = ${standardText(v)}`)}.`,
      answer: parabolaGraph(v, 3.4),
      distractors: [parabolaGraph({ ...v, p: -v.p }, 3.4), parabolaGraph({ ...v, a: v.a.neg(), q: v.q }, 3.4), parabolaGraph({ ...v, q: standard(v)[2].value > -8 && standard(v)[2].value < 8 ? standard(v)[2].value : -v.q }, 3.4)],
      solution: `Find the vertex: ${math(`x = -b/(2a) = ${v.p}`)}, ${math(`y = ${v.q}`)}. The y-intercept is ${math(`(0, ${standard(v)[2].typst()})`)}; use symmetry and the direction of opening to sketch.`,
    };
  },
});

// ── Quadratic equations ───────────────────────────────────────────────────

/** Roots of ax² + bx + c = 0 as exact text (rational or simplest radical form), or null if none. */
function exactRoots(a: number, b: number, c: number): string[] | null {
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  if (disc === 0) return [new Q(-b, 2 * a).typst()];
  const { coef, radicand } = simplifySqrt(disc);
  if (radicand === 1) return [...new Set([new Q(-b - coef, 2 * a), new Q(-b + coef, 2 * a)].sort((p, q) => p.value - q.value).map((r) => r.typst()))];
  const rational = new Q(-b, 2 * a), irr = new Q(coef, 2 * a).abs();
  const base = Surds.of(rational);
  return [base.sub(Surds.of(irr, radicand)).typst(), base.add(Surds.of(irr, radicand)).typst()];
}

const rootsText = (rs: string[] | null) => (rs ? `x = ${rs.join(', ')}` : '"no real roots"');

export const qeSquareRoots = pc30s('30s-qe-square-roots', {
  levels: { 1: 'x² = k', 2: '(x − p)² = k', 3: 'a(x − p)² + q = 0' },
  options: [
    radioOption('form', 'Equation', [['1', 'x² = k'], ['2', '(x − p)² = k'], ['3', 'a(x − p)² + q = 0']], ['1', '2', '3']),
    radioOption('roots', 'Roots', [['perfect', 'Whole numbers'], ['radical', 'Radicals'], ['either', 'Either']], ['either', 'either', 'either']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const p = difficulty === 1 ? 0 : rng.nonZero(-6, 6);
    const rootsOpt = optOne(o, 'roots', 'either');
    const perfect = rootsOpt === 'either' ? rng.next() < 0.5 : rootsOpt === 'perfect';
    const k = perfect ? rng.int(1, 9) ** 2 : rng.pick([2, 3, 5, 6, 7, 8, 12, 18, 20]);
    const a = difficulty === 3 ? rng.pick([2, 3, -2]) : 1;
    const q = -a * k;
    const eq = difficulty === 3 ? `${a}(x ${p > 0 ? '-' : '+'} ${Math.abs(p)})^2 ${q < 0 ? '-' : '+'} ${Math.abs(q)} = 0` : `${p === 0 ? 'x' : `(x ${p > 0 ? '-' : '+'} ${Math.abs(p)})`}^2 = ${k}`;
    const roots = exactRoots(1, -2 * p, p * p - k)!;
    const answer = rootsText(roots);
    return {
      body: `Solve: ${math(eq)}`,
      answer: math(answer),
      // Only the positive root, the wrong sign of p, not taking the square root, or halving.
      distractors: [`x = ${Surds.of(p).add(Surds.of(1, k)).typst()}`, rootsText(exactRoots(1, 2 * p, p * p - k)), `x = ${p - k}, ${p + k}`, `x = ${new Q(p * 2 - k, 2).typst()}, ${new Q(p * 2 + k, 2).typst()}`].filter((d, i, all) => d !== answer && all.indexOf(d) === i).map(math),
      solution: `${difficulty === 3 ? `Isolate the square: ${math(`(x ${p > 0 ? '-' : '+'} ${Math.abs(p)})^2 = ${k}`)}. ` : ''}Take the square root of both sides (both signs): ${math(`${p === 0 ? 'x' : `x ${p > 0 ? '-' : '+'} ${Math.abs(p)}`} = ± ${Surds.of(1, k).typst()}`)}, so ${math(answer)}.`,
    };
  },
});

export const qeFactoring = pc30s('30s-qe-factoring', {
  levels: { 1: 'x² + bx + c = 0', 2: 'ax² + bx + c = 0', 3: 'Rearrange first' },
  options: [
    radioOption('form', 'Equation', [['1', 'x² + bx + c = 0'], ['2', 'ax² + bx + c = 0'], ['3', 'Rearrange first']], ['1', '2', '3']),
    sizeOption([4, 7, 10], [7, 7, 7], 'Size of the roots'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const N = optNum(o, 'size', 7);
    const r = rng.nonZero(-N, N), s = rng.nonZero(-N, N);
    const m = difficulty === 1 ? 1 : rng.pick([2, 3]);
    // (m x − r)(x − s)
    const coefs = [m, -(m * s + r), r * s];
    const roots = [new Q(r, m), new Q(s)].sort((a, b) => a.value - b.value).map((v) => v.typst()).filter((v, i, all) => all.indexOf(v) === i);
    const answer = `x = ${roots.join(', ')}`;
    // Signs flipped, the coefficient ignored, one root only, or one sign flipped.
    const list = (vs: Q[]) => `x = ${vs.sort((a, b) => a.value - b.value).map((v) => v.typst()).filter((v, i, all) => all.indexOf(v) === i).join(', ')}`;
    let eq = `${poly(coefs)} = 0`;
    if (difficulty === 3) eq = rearranged(coefs[0], coefs[1], coefs[2]);
    return {
      body: `Solve by factoring: ${math(eq)}`,
      answer: math(answer),
      distractors: [list([new Q(-r, m), new Q(-s)]), list([new Q(r), new Q(s)]), `x = ${roots[0]}`, list([new Q(r, m), new Q(-s)]), list([new Q(-r, m), new Q(s)])].filter((d, i, all) => d !== answer && all.indexOf(d) === i).map(math),
      solution: `${difficulty === 3 ? `Move every term to one side: ${math(`${poly(coefs)} = 0`)}. ` : ''}Factor: ${math(`(${m === 1 ? '' : m}x ${r > 0 ? '-' : '+'} ${Math.abs(r)})(x ${s > 0 ? '-' : '+'} ${Math.abs(s)}) = 0`)}. Set each factor to zero: ${math(answer)}.`,
    };
  },
});

export const qeCompleteSquare = pc30s('30s-qe-complete-square', {
  levels: { 1: 'Even b', 2: 'Odd b', 3: 'a ≠ 1' },
  options: [
    radioOption('form', 'Equation', [['1', 'Even b'], ['2', 'Odd b'], ['3', 'a ≠ 1']], ['1', '2', '3']),
    sizeOption([3, 5, 8], [5, 5, 5], 'Size of numbers'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    for (;;) {
      const a = difficulty === 3 ? rng.pick([2, 3]) : 1;
      const b = difficulty === 2 ? rng.pick([1, 3, 5, 7]) * rng.sign() * a : 2 * rng.nonZero(-optNum(o, 'size', 5), optNum(o, 'size', 5)) * a;
      const c = rng.int(-2 * optNum(o, 'size', 5) - 2, optNum(o, 'size', 5) + 3);
      const roots = exactRoots(a, b, c);
      if (!roots || roots.length < 2 || !roots[0].includes('sqrt')) continue;
      const answer = rootsText(roots);
      const half = new Q(b, 2 * a);
      const rhs = half.mul(half).sub(new Q(c, a));
      return {
        body: `Solve by completing the square. Give exact answers: ${math(`${poly([a, b, c])} = 0`)}`,
        answer: math(answer),
        distractors: [rootsText(exactRoots(a, -b, c)), rootsText(exactRoots(a, b, -c)), `x = ${roots[1]}`].filter((d, i, all) => d !== answer && all.indexOf(d) === i && !d.includes('no real')).map(math),
        solution: `${a !== 1 ? `Divide by ${a}. ` : ''}${math(`(x ${half.value > 0 ? '+' : '-'} ${half.abs().typst()})^2 = ${rhs.typst()}`)}, so ${math(`x = ${half.neg().typst()} ± sqrt(${rhs.typst()})`)}, which simplifies to ${math(answer)}.`,
      };
    }
  },
});

export const qeFormula = pc30s('30s-qe-formula', {
  levels: { 1: 'Rational roots', 2: 'Exact radical roots', 3: 'Approximate roots' },
  options: [
    radioOption('form', 'Roots', [['1', 'Rational roots'], ['2', 'Exact radical roots'], ['3', 'Approximate roots']], ['1', '2', '3']),
    sizeOption([5, 9, 12], [9, 9, 9], 'Size of coefficients'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    for (;;) {
      const N = optNum(o, 'size', 9);
      const a = rng.nonZero(-4, 5), b = rng.int(-N, N), c = rng.int(-N, N);
      const disc = b * b - 4 * a * c;
      if (disc <= 0) continue;
      const perfect = Number.isInteger(Math.sqrt(disc));
      if ((difficulty === 1) !== perfect) continue;
      if (difficulty === 3) {
        const r1 = (-b - Math.sqrt(disc)) / (2 * a), r2 = (-b + Math.sqrt(disc)) / (2 * a);
        const rs = [r1, r2].sort((p, q) => p - q);
        const answer = `x approx ${round(rs[0], 2)}, ${round(rs[1], 2)}`;
        return {
          body: `Use the quadratic formula to solve, to two decimal places: ${math(`${poly([a, b, c])} = 0`)}`,
          answer: math(answer),
          distractors: [`x approx ${round(-rs[1], 2)}, ${round(-rs[0], 2)}`, `x approx ${round((-b + Math.sqrt(disc)) / 2, 2)}, ${round((-b - Math.sqrt(disc)) / 2, 2)}`, `x approx ${round(-b / (2 * a) + Math.sqrt(disc), 2)}, ${round(-b / (2 * a) - Math.sqrt(disc), 2)}`].filter((d) => d !== answer).map(math),
          solution: `${math(`x = (-b ± sqrt(b^2 - 4 a c))/(2 a) = (${-b} ± sqrt(${disc}))/${2 * a}`)}, so ${math(answer)}.`,
        };
      }
      const answer = rootsText(exactRoots(a, b, c));
      return {
        body: `Use the quadratic formula to solve${difficulty === 2 ? ', giving exact answers' : ''}: ${math(`${poly([a, b, c])} = 0`)}`,
        answer: math(answer),
        distractors: [rootsText(exactRoots(a, -b, c)), rootsText(exactRoots(a, 2 * b, 4 * c)), rootsText(exactRoots(a, b, -c))].filter((d, i, all) => d !== answer && all.indexOf(d) === i && !d.includes('no real')).map(math),
        solution: `${math(`x = (-b ± sqrt(b^2 - 4 a c))/(2 a) = (${-b} ± sqrt(${disc}))/${2 * a}`)}, which simplifies to ${math(answer)}.`,
      };
    }
  },
});

export const qeDiscriminant = pc30s('30s-qe-discriminant', {
  points: 1,
  levels: { 1: 'Compute the discriminant', 2: 'Number of roots', 3: 'Rearrange first' },
  options: [
    radioOption('form', 'Task', [['1', 'Compute the discriminant'], ['2', 'Number of roots'], ['3', 'Rearrange first']], ['1', '2', '3']),
    sizeOption([4, 8, 12], [8, 8, 8], 'Size of coefficients'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const N = optNum(o, 'size', 8);
    const a = rng.nonZero(-4, 4), b = rng.int(-N, N), c = rng.int(-N, N);
    const disc = b * b - 4 * a * c;
    if (difficulty === 1) {
      return {
        body: `Find the discriminant of ${math(`${poly([a, b, c])} = 0`)}.`,
        answer: math(String(disc)),
        distractors: [b * b + 4 * a * c, -b * b - 4 * a * c, b - 4 * a * c].filter((v, i, all) => v !== disc && all.indexOf(v) === i).map((v) => math(String(v))),
        solution: math(`b^2 - 4 a c = (${b})^2 - 4(${a})(${c}) = ${disc}`),
      };
    }
    const count = disc > 0 ? 2 : disc === 0 ? 1 : 0;
    const answer = ['No real roots', 'One real root', 'Two real roots'][count];
    const eq = difficulty === 3 ? rearranged(a, b, c) : `${poly([a, b, c])} = 0`;
    return {
      body: `How many real roots does ${math(eq)} have?`,
      answer,
      distractors: ['No real roots', 'One real root', 'Two real roots', 'Infinitely many roots'].filter((d) => d !== answer),
      solution: `${difficulty === 3 ? `Rearrange: ${math(`${poly([a, b, c])} = 0`)}. ` : ''}${math(`b^2 - 4 a c = ${disc}`)}, which is ${disc > 0 ? 'positive: two real roots' : disc === 0 ? 'zero: one real root' : 'negative: no real roots'}.`,
    };
  },
});

export const qeDiscriminantK = pc30s('30s-qe-discriminant-k', {
  levels: { 1: 'k in the constant term', 2: 'k in the x-coefficient', 3: 'An inequality for k' },
  options: [
    radioOption('form', 'Condition', [['1', 'k in the constant term'], ['2', 'k in the x-coefficient'], ['3', 'An inequality for k']], ['1', '2', '3']),
    sizeOption([3, 6, 9], [6, 6, 6], 'Size of numbers'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const a = rng.int(1, 4), b = 2 * rng.int(1, optNum(o, 'size', 6));
    if (difficulty === 1) {
      const k = new Q(b * b, 4 * a);
      return {
        body: `For what value of ${math('k')} does ${math(`${poly([a, b, 0])} + k = 0`)} have exactly one real root?`,
        answer: math(`k = ${k.typst()}`),
        distractors: [k.neg(), new Q(b * b, 2 * a), new Q(b, 2 * a)].map((v) => math(`k = ${v.typst()}`)),
        solution: `One root means ${math('b^2 - 4 a c = 0')}: ${math(`${b}^2 - 4(${a})k = 0`)}, so ${math(`k = ${k.typst()}`)}.`,
      };
    }
    // c = a·m² makes 4ac a perfect square, so k is a whole number.
    const m = rng.int(1, 4), c = a * m * m;
    const kk = 2 * a * m;
    if (difficulty === 2) {
      return {
        body: `For what values of ${math('k')} does ${math(`${a === 1 ? '' : a}x^2 + k x + ${c} = 0`)} have exactly one real root?`,
        answer: math(`k = ± ${kk}`),
        distractors: [`k = ${kk}`, `k = ± ${kk * kk}`, `k = ± ${kk / 2}`].map(math),
        solution: `${math(`k^2 - 4(${a})(${c}) = 0`)}, so ${math(`k^2 = ${kk * kk}`)} and ${math(`k = ± ${kk}`)}.`,
      };
    }
    const kc = new Q(b * b, 4 * a);
    const two = rng.next() < 0.5;
    return {
      body: `For what values of ${math('k')} does ${math(`${poly([a, b, 0])} + k = 0`)} have ${two ? 'two' : 'no'} real roots?`,
      answer: math(`k ${two ? '<' : '>'} ${kc.typst()}`),
      distractors: [`k ${two ? '>' : '<'} ${kc.typst()}`, `k = ${kc.typst()}`, `k ${two ? '<' : '>'} ${kc.neg().typst()}`].map(math),
      solution: `${two ? 'Two' : 'No'} real roots means ${math(`b^2 - 4 a c ${two ? '>' : '<'} 0`)}: ${math(`${b * b} - ${4 * a}k ${two ? '>' : '<'} 0`)}, so ${math(`k ${two ? '<' : '>'} ${kc.typst()}`)}.`,
    };
  },
});

export const qeFindError = pc30s('30s-qe-find-error', {
  levels: { 1: 'A sign error with −b', 2: 'Dividing only part by 2a', 3: 'Losing a root when dividing by x' },
  options: [
    radioOption('form', 'Error', [['1', 'A sign error with −b'], ['2', 'Dividing only part by 2a'], ['3', 'Losing a root when dividing by x']], ['1', '2', '3']),
    sizeOption([5, 9, 12], [9, 9, 9], 'Size of coefficients'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    if (difficulty === 3) {
      const a = rng.int(1, 4), b = rng.nonZero(-optNum(o, 'size', 9), optNum(o, 'size', 9));
      const root = new Q(-b, a);
      return {
        body: `A student solved ${math(`${poly([a, 0, 0])} = ${poly([-b, 0])}`)} by dividing both sides by ${math('x')} and got ${math(`x = ${root.typst()}`)}. Find the error and give the correct solution.`,
        answer: math(`x = ${[new Q(0), root].sort((p, q) => p.value - q.value).map((v) => v.typst()).join(', ')}`),
        distractors: [math(`x = ${root.typst()}`), math(`x = ${root.neg().typst()}, 0`), math('x = 0')],
        solution: `Dividing by ${math('x')} loses the root ${math('x = 0')}. Instead, ${math(`${poly([a, b, 0])} = 0`)} factors as ${math(`x(${poly([a, b])}) = 0`)}, so ${math(`x = 0`)} or ${math(`x = ${root.typst()}`)}.`,
      };
    }
    for (;;) {
      const N = optNum(o, 'size', 9);
      const a = rng.int(1, 3), b = rng.nonZero(-N, N), c = rng.int(-N, 5);
      const disc = b * b - 4 * a * c;
      if (disc <= 0 || !Number.isInteger(Math.sqrt(disc))) continue;
      const s = Math.sqrt(disc);
      const right = rootsText(exactRoots(a, b, c));
      const wrong = difficulty === 1
        ? `x = ${[new Q(b - s, 2 * a), new Q(b + s, 2 * a)].sort((p, q) => p.value - q.value).map((v) => v.typst()).join(', ')}`
        : `x = ${[new Q(-b).sub(new Q(s, 2 * a)), new Q(-b).add(new Q(s, 2 * a))].sort((p, q) => p.value - q.value).map((v) => v.typst()).join(', ')}`;
      if (wrong === right) continue;
      return {
        body: `A student used the quadratic formula on ${math(`${poly([a, b, c])} = 0`)} and got ${math(wrong)}. Find the error and give the correct solution.`,
        answer: math(right),
        distractors: [wrong, rootsText(exactRoots(a, b, -c)), `x = ${new Q(-b, 2 * a).typst()}`].filter((d, i, all) => d !== right && all.indexOf(d) === i && !d.includes('no real')).map(math),
        solution: `${difficulty === 1 ? `The formula starts with ${math('-b')}, which is ${math(String(-b))}, not ${math(String(b))}.` : `The whole numerator, ${math('-b ± sqrt(b^2 - 4 a c)')}, is divided by ${math('2a')}, not just the square root.`} ${math(`x = (${-b} ± ${s})/${2 * a}`)}, so ${math(right)}.`,
      };
    }
  },
});

export const qeProblem = pc30s('30s-qe-problem', {
  levels: { 1: 'Consecutive integers', 2: 'Rectangle dimensions', 3: 'A border of uniform width' },
  options: [
    radioOption('form', 'Context', [['1', 'Consecutive integers'], ['2', 'Rectangle dimensions'], ['3', 'A border of uniform width']], ['1', '2', '3']),
    sizeOption([10, 20, 30], [20, 20, 20], 'Size of the answer'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    if (difficulty === 1) {
      const n = rng.int(3, optNum(o, 'size', 20));
      return {
        body: `The product of two consecutive positive integers is ${n * (n + 1)}. Find the integers.`,
        answer: math(`${n} "and" ${n + 1}`),
        distractors: [`${n - 1} "and" ${n}`, `${n + 1} "and" ${n + 2}`, `${-n - 1} "and" ${-n}`].map(math),
        solution: `${math(`n(n + 1) = ${n * (n + 1)}`)}, so ${math(`n^2 + n - ${n * (n + 1)} = 0`)} and ${math(`(n - ${n})(n + ${n + 1}) = 0`)}. The positive solution is ${math(`n = ${n}`)}: the integers are ${n} and ${n + 1}.`,
      };
    }
    if (difficulty === 2) {
      const w = rng.int(3, Math.round(optNum(o, 'size', 20) * 0.75)), d = rng.int(2, 8);
      return {
        body: `A rectangle's length is ${d} cm more than its width, and its area is ${w * (w + d)} cm². Find its dimensions.`,
        answer: math(`${w} "cm by" ${w + d} "cm"`),
        distractors: [`${w + 1} "cm by" ${w + d + 1} "cm"`, `${w - 1} "cm by" ${w + d - 1} "cm"`, `${d} "cm by" ${w * (w + d) / d} "cm"`].map(math),
        solution: `${math(`w(w + ${d}) = ${w * (w + d)}`)} gives ${math(`w^2 + ${d}w - ${w * (w + d)} = 0`)}, so ${math(`(w - ${w})(w + ${w + d}) = 0`)}. The width is ${w} cm (the negative root is rejected) and the length is ${w + d} cm.`,
      };
    }
    const L = rng.int(6, optNum(o, 'size', 20)), W = rng.int(4, L), x = rng.int(1, 4);
    const total = (L + 2 * x) * (W + 2 * x);
    return {
      body: `A ${L} m by ${W} m garden has a path of uniform width around it. The garden and path together cover ${total} m². How wide is the path?`,
      answer: math(`${x} "m"`),
      distractors: [x + 1, x * 2, (total - L * W) / (2 * (L + W))].map((v) => math(`${Number.isInteger(v) ? v : round(v, 2)} "m"`)).filter((d, i, all) => d !== math(`${x} "m"`) && all.indexOf(d) === i),
      solution: `${math(`(${L} + 2x)(${W} + 2x) = ${total}`)} expands to ${math(`${poly([4, 2 * (L + W), L * W - total])} = 0`)}. The positive solution is ${math(`x = ${x}`)} m.`,
    };
  },
});

export const qeRootsGraph = pc30s('30s-qe-roots-graph', {
  levels: { 1: 'Two roots', 2: 'One root or none', 3: 'After rearranging' },
  options: [
    radioOption('form', 'Roots', [['1', 'Two roots'], ['2', 'One root or none'], ['3', 'After rearranging']], ['1', '2', '3']),
    toggleOption('dots', 'Mark the x-intercepts', [true, true, true]),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const kind = difficulty === 2 ? rng.pick(['one', 'none'] as const) : 'two';
    let v: Vertex;
    if (kind === 'two') {
      // Roots r and r + 2d keep the vertex at a whole number.
      const r = rng.int(-6, 2), d = rng.int(1, 3), a = rng.pick([1, -1]);
      v = { a: new Q(a), p: r + d, q: -a * d * d };
    }
    else if (kind === 'one') v = { a: new Q(rng.pick([1, -1])), p: rng.int(-5, 5), q: 0 };
    else { const a = rng.pick([1, -1]); v = { a: new Q(a), p: rng.int(-4, 4), q: a * rng.int(1, 4) }; }
    const xs = xIntercepts(v);
    const answer = rootsText(xs);
    const std = standardText(v)!;
    const eq = difficulty === 3 ? `${poly([standard(v)[0].n, standard(v)[1].n, 0])} = ${-standard(v)[2].n}` : `${std} = 0`;
    return {
      body: `The graph of ${math(`y = ${std}`)} is shown. Use it to solve ${math(eq)}.\n\n${parabolaGraph(v, 5, optOn(o, 'dots', true) ? (xs ?? []).map((x) => ({ x: Number(x), y: 0 })) : [])}`,
      answer: math(answer),
      distractors: [xs ? `x = ${xs.map((x) => -Number(x)).sort((p, q) => p - q).join(', ')}` : `x = ${v.p}`, `x = ${v.q}`, xs ? '"no real roots"' : `x = ${v.p - 1}, ${v.p + 1}`, `x = ${standard(v)[2].typst()}`].filter((d, i, all) => d !== answer && all.indexOf(d) === i).map(math),
      solution: `The roots of the equation are the x-intercepts of the graph: ${xs ? math(answer) : 'the graph does not cross the x-axis, so there are no real roots'}.`,
    };
  },
});

export const QUADRATIC_30S = [qvVertex, qvCharacteristics, qvEffects, qvInterceptCount, qvEquation, qvSketch, qvFromGraph, qsCompleteSquare, qsFindError, qsCharacteristics, qsModel, qsSketch, qeSquareRoots, qeFactoring, qeCompleteSquare, qeFormula, qeDiscriminant, qeDiscriminantK, qeFindError, qeProblem, qeRootsGraph];

