// Algebra 2: points and planes in space, matrices, and complex numbers, after
// Kuta's PointsIn3D, Plane, CramersRule, MatrixEquations, Transformations
// (matrices), ComplexOperations/Multiply/Divide, ComplexGraph,
// ComplexAbsoluteValue, RationalizeDenominator, and SolveQuadFormula with
// complex roots.
import type { Rng } from '../../rng.ts';
import { Q, simplifySqrt, Surds } from '../../exact.ts';
import { graphTypst, type Pt } from '../../graph.ts';
import { det, inverse, matText, mul, systemText, toQ, add, scale } from '../../linalg.ts';
import { poly } from '../../format.ts';
import { manyOption, optList, optOn, optOne, radioOption, toggleOption } from '../../options.ts';
import { us, math, task, wrong } from './common.ts';

// ── Points and planes in space ───────────────────────────────────────────────

const octant = ([x, y, z]: number[]) => {
  const signs = `${x > 0 ? '+' : '-'}${y > 0 ? '+' : '-'}${z > 0 ? '+' : '-'}`;
  return ['+++', '-++', '--+', '+-+', '++-', '-+-', '---', '+--'].indexOf(signs) + 1;
};
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];

/** √n simplified, as Typst. */
function rootText(n: number): string {
  const { coef, radicand } = simplifySqrt(n);
  return radicand === 1 ? String(coef) : `${coef === 1 ? '' : coef}sqrt(${radicand})`;
}

export const a2Points3d = us('a2-points-3d', {
  levels: { 1: 'Name the octant', 2: 'Distance between two points', 3: 'Midpoint, or an endpoint from the midpoint' },
  options: [manyOption('ask', 'Ask for', [['octant', 'Octant'], ['distance', 'Distance'], ['midpoint', 'Midpoint']], [['octant'], ['distance'], ['midpoint']])],
  generate(rng, _level, o) {
    const ask = rng.pick(optList(o, 'ask', ['octant']));
    const P = [rng.nonZero(-9, 9), rng.nonZero(-9, 9), rng.nonZero(-9, 9)];
    const pt = (p: number[] | Q[]) => `(${p.map((v) => (v instanceof Q ? v.typst() : String(v))).join(', ')})`;
    if (ask === 'octant') {
      const answer = `Octant ${ROMAN[octant(P)]}`;
      return {
        body: `In which octant does the point ${math(pt(P))} lie?`, task: { instruction: 'Name the octant in which each point lies.', item: math(pt(P)) },
        answer, distractors: wrong(answer, [octant([P[0], P[1], -P[2]]), octant([-P[0], P[1], P[2]]), octant([P[0], -P[1], P[2]]), octant(P.map((v) => -v))].map((n) => `Octant ${ROMAN[n]}`)),
        solution: `The signs of the coordinates are ${math(`(${P.map((v) => (v > 0 ? '+' : '-')).join(', ')})`)}, which is Octant ${ROMAN[octant(P)]}.`,
      };
    }
    const R = [rng.int(-9, 9), rng.int(-9, 9), rng.int(-9, 9)];
    if (ask === 'distance') {
      const sq = P.reduce((s, v, i) => s + (v - R[i]) ** 2, 0);
      const answer = rootText(sq);
      return {
        body: `Find the distance between ${math(pt(P))} and ${math(pt(R))}.`,
        answer: math(answer),
        distractors: wrong(math(answer), [rootText(P.reduce((s, v, i) => s + (v + R[i]) ** 2, 0) || 1), String(P.reduce((s, v, i) => s + Math.abs(v - R[i]), 0)), rootText(sq + 2), String(sq)].map(math)),
        solution: `${math(`d = sqrt(${P.map((v, i) => `(${R[i]} - ${v < 0 ? `(${v})` : v})^2`).join(' + ')}) = sqrt(${sq})${answer !== `sqrt(${sq})` ? ` = ${answer}` : ''}`)}.`,
      };
    }
    const M = P.map((v, i) => new Q(v + R[i], 2));
    if (rng.next() < 0.5) {
      const answer = math(pt(M));
      return {
        body: `Find the midpoint of the segment with endpoints ${math(pt(P))} and ${math(pt(R))}.`,
        answer, distractors: wrong(answer, [pt(P.map((v, i) => new Q(v - R[i], 2))), pt(P.map((v, i) => v + R[i])), pt(P.map((v, i) => new Q(R[i] - v, 2)))].map(math)),
        solution: `Average each coordinate: ${answer}.`,
      };
    }
    const answer = math(pt(R));
    return {
      body: `The midpoint of a segment is ${math(pt(M))} and one endpoint is ${math(pt(P))}. Find the other endpoint.`,
      answer, distractors: wrong(answer, [pt(M.map((m, i) => m.add(P[i]).div(2))), pt(M.map((m, i) => m.sub(P[i]))), pt(P.map((v, i) => 2 * v - R[i]))].map(math)),
      solution: `Each coordinate of the other endpoint is ${math('2m - p')}: ${answer}.`,
    };
  },
});

export const a2PlaneIntercepts = us('a2-plane-intercepts', {
  levels: { 1: 'Whole-number intercepts', 2: 'Fractional intercepts', 3: 'Write the equation from the intercepts' },
  generate(rng, level) {
    let coefs: number[], d: number;
    if (level === 2) {
      coefs = [rng.nonZero(-6, 6), rng.nonZero(-6, 6), rng.nonZero(-6, 6)];
      d = rng.nonZero(-12, 12);
    } else {
      const ints = [rng.nonZero(-6, 6), rng.nonZero(-6, 6), rng.nonZero(-6, 6)];
      d = Math.abs(ints.reduce((a, b) => (a * b) / gcdN(a, b)));
      coefs = ints.map((i) => d / i);
    }
    const [x, y, z] = coefs.map((c) => new Q(d, c));
    const term = (c: number, v: string, first: boolean) => `${first ? (c < 0 ? '-' : '') : c < 0 ? ' - ' : ' + '}${Math.abs(c) === 1 ? '' : Math.abs(c)}${v}`;
    const eq = `${term(coefs[0], 'x', true)}${term(coefs[1], 'y', false)}${term(coefs[2], 'z', false)} = ${d}`;
    const intText = (p: Q, q: Q, r: Q) => `x"-int" = ${p.typst()}, y"-int" = ${q.typst()}, z"-int" = ${r.typst()}`;
    if (level === 3) {
      return {
        body: `Write the equation of the plane with x-intercept ${math(x.typst())}, y-intercept ${math(y.typst())}, and z-intercept ${math(z.typst())}.`,
        answer: math(eq),
        distractors: wrong(math(eq), [`${term(x.n, 'x', true)}${term(y.n, 'y', false)}${term(z.n, 'z', false)} = ${d}`, eq.replace(/= -?d+$/, '= 1'), `${term(coefs[0], 'x', true)}${term(coefs[1], 'y', false)}${term(coefs[2], 'z', false)} = ${-d}`].map(math)),
        solution: `Use the intercept form ${math(`x/${x.paren()} + y/${y.paren()} + z/${z.paren()} = 1`)} and multiply by ${d}: ${math(eq)}.`,
      };
    }
    const answer = intText(x, y, z);
    return {
      body: `Find the x-, y-, and z-intercepts of the plane ${math(eq)}.`, task: { instruction: 'Find the intercepts of each plane.', item: math(eq) },
      answer: math(answer),
      distractors: wrong(math(answer), [intText(x.neg(), y.neg(), z.neg()), intText(...coefs.map((c) => new Q(c)) as [Q, Q, Q]), intText(...coefs.map((c) => new Q(c, d)) as [Q, Q, Q])].map(math)),
      solution: `Set the other two variables to zero each time: for example, ${math(`${term(coefs[0], 'x', true)} = ${d}`)} gives ${math(`x = ${x.typst()}`)}.`,
    };
  },
});
function gcdN(a: number, b: number): number { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; }

// ── Matrices ─────────────────────────────────────────────────────────────────

function invertible(rng: Rng, n: number, max = 6): number[][] {
  for (;;) {
    const m = Array.from({ length: n }, () => Array.from({ length: n }, () => rng.int(-max, max)));
    if (!det(toQ(m)).eq(0)) return m;
  }
}

export const a2Cramer = us('a2-cramer', {
  points: 3,
  levels: { 1: 'Two variables, whole-number solutions', 2: 'Two variables, fractional solutions', 3: 'Three variables' },
  options: [radioOption('vars', 'Variables', [['2', 'Two'], ['3', 'Three']], ['2', '2', '3']), toggleOption('fractions', 'Allow fractional solutions', [false, true, false])],
  generate(rng, level, o) {
    const n = Number(optOne(o, 'vars', level === 3 ? '3' : '2'));
    const A = invertible(rng, n, n === 3 ? 4 : 7);
    const sol = optOn(o, 'fractions', level === 2) && n === 2 ? [new Q(rng.int(-9, 9), rng.int(2, 4)), new Q(rng.int(-9, 9))] : Array.from({ length: n }, () => new Q(rng.int(-6, 6)));
    let b = A.map((row) => row.reduce((s, a, j) => s.add(sol[j].mul(a)), new Q(0)));
    // Keep the constants whole: scale the system if a fractional solution made them fractions.
    const d0 = b.reduce((d, q) => (d * q.d) / gcdN(d, q.d), 1);
    const A2 = A.map((r) => r.map((v) => v * d0));
    b = b.map((q) => q.mul(d0));
    const D = det(toQ(A2));
    const names = ['x', 'y', 'z'].slice(0, n);
    const Ds = names.map((_, j) => det(toQ(A2).map((row, i) => row.map((v, k) => (k === j ? b[i] : v)))));
    const answer = `(${sol.map((q) => q.typst()).join(', ')})`;
    return {
      body: `Solve the system using Cramer's Rule: ${math(systemText(A2, b, names))}`,
      answer: math(answer),
      distractors: wrong(math(answer), [`(${[...sol].reverse().map((q) => q.typst()).join(', ')})`, `(${sol.map((q) => q.neg().typst()).join(', ')})`, `(${Ds.map((q) => q.typst()).join(', ')})`, `(${sol.map((q, i) => (i === 0 ? q.add(1) : q).typst()).join(', ')})`].map(math)),
      solution: `${math(`D = ${D.typst()}`)}; ${names.map((v, j) => math(`D_${v} = ${Ds[j].typst()}`)).join(', ')}. Each variable is ${math('D_v / D')}: ${math(answer)}.`,
    };
  },
});

export const a2MatrixEquations = us('a2-matrix-equations', {
  points: 2,
  levels: { 1: 'X + A = B', 2: 'kX + A = B', 3: 'AX = B with an inverse' },
  options: [radioOption('form', 'Form', [['1', 'X + A = B'], ['2', 'kX + A = B'], ['3', 'AX = B']], ['1', '2', '3'])],
  generate(rng, level, o) {
    const form = Number(optOne(o, 'form', String(level)));
    const rows = form === 3 ? 2 : rng.int(1, 2) + 1, cols = form === 3 ? rng.int(1, 2) : rng.int(2, 3);
    const X = toQ(Array.from({ length: rows }, () => Array.from({ length: cols }, () => rng.int(-9, 9))));
    if (form === 3) {
      let A: number[][];
      do A = invertible(rng, 2, 5); while (Math.abs(det(toQ(A)).n) !== 1 && rng.next() < 0.7);
      const B = mul(toQ(A), X);
      const inv = inverse(toQ(A))!;
      return {
        body: `Solve for ${math('X')}: ${math(`${matText(A)} X = ${matText(B)}`)}`,
        answer: math(`X = ${matText(X)}`),
        distractors: wrong(math(`X = ${matText(X)}`), [mul(toQ(A), B), scale(X, -1), B].map((m) => math(`X = ${matText(m)}`))),
        solution: `Multiply both sides on the left by ${math(`A^(-1) = ${matText(inv)}`)}: ${math(`X = A^(-1) B = ${matText(X)}`)}.`,
      };
    }
    const k = form === 2 ? rng.pick([2, 3, -2, 4]) : 1;
    const A = toQ(Array.from({ length: rows }, () => Array.from({ length: cols }, () => rng.int(-9, 9))));
    const B = add(scale(X, k), A);
    const answer = `X = ${matText(X)}`;
    const naive = form === 2 ? add(B, A, -1) : add(B, A);
    return {
      body: `Solve for ${math('X')}: ${math(`${k === 1 ? '' : k}X + ${matText(A)} = ${matText(B)}`)}`,
      answer: math(answer),
      distractors: wrong(math(answer), [naive, add(A, B, -1), scale(add(B, A), new Q(1, k))].map((m) => math(`X = ${matText(m)}`))),
      solution: `Subtract ${math('A')} from both sides${k === 1 ? '' : `, then divide by ${k}`}: ${math(answer)}.`,
    };
  },
});

export const a2MatrixTransformations = us('a2-matrix-transformations', {
  points: 2,
  levels: { 1: 'Translations', 2: 'Dilations and reflections', 3: 'Rotations' },
  options: [manyOption('kinds', 'Transformations', [['translate', 'Translation'], ['dilate', 'Dilation'], ['reflect', 'Reflection'], ['rotate', 'Rotation']], [['translate'], ['dilate', 'reflect'], ['rotate']])],
  generate(rng, _level, o) {
    const kind = rng.pick(optList(o, 'kinds', ['translate']));
    const pts: Pt[] = [];
    while (pts.length < 3) { const p: Pt = [rng.int(-5, 5), rng.int(-5, 5)]; if (!pts.some((q) => q[0] === p[0] && q[1] === p[1])) pts.push(p); }
    const V = [pts.map((p) => p[0]), pts.map((p) => p[1])];
    let text: string, image: number[][], how: string;
    if (kind === 'translate') {
      const a = rng.nonZero(-4, 4), b = rng.nonZero(-4, 4);
      image = [V[0].map((x) => x + a), V[1].map((y) => y + b)];
      text = `translated ${Math.abs(a)} unit${Math.abs(a) === 1 ? '' : 's'} ${a > 0 ? 'right' : 'left'} and ${Math.abs(b)} unit${Math.abs(b) === 1 ? '' : 's'} ${b > 0 ? 'up' : 'down'}`;
      how = `Add ${math(matText([[a, a, a], [b, b, b]]))} to the vertex matrix.`;
    } else {
      const k = rng.pick([2, 3, -2]);
      const choices: Record<string, Array<[number[][], string]>> = {
        dilate: [[[[k, 0], [0, k]], `dilated by a scale factor of ${k}`]],
        reflect: [[[[1, 0], [0, -1]], 'reflected across the x-axis'], [[[-1, 0], [0, 1]], 'reflected across the y-axis'], [[[0, 1], [1, 0]], `reflected across the line ${math('y = x')}`]],
        rotate: [[[[0, -1], [1, 0]], 'rotated 90° counterclockwise about the origin'], [[[0, 1], [-1, 0]], 'rotated 90° clockwise about the origin'], [[[-1, 0], [0, -1]], 'rotated 180° about the origin']],
      };
      const [T, words] = rng.pick(choices[kind]);
      text = words;
      image = mul(toQ(T), toQ(V)).map((r) => r.map((q) => q.value));
      how = `Multiply the vertex matrix on the left by ${math(matText(T))}.`;
    }
    const answer = math(matText(image));
    return {
      body: `The vertices of a triangle are given by the matrix ${math(matText(V))}. Write the vertex matrix of its image when it is ${text}.`,
      answer,
      distractors: wrong(answer, [matText([image[1], image[0]]), matText(image.map((r) => r.map((v) => -v))), matText([V[0].map((x, i) => x + image[0][i] - V[0][i] + 1), image[1]]), matText([image[0], V[1]])].map(math)),
      solution: `${how} ${answer}`,
    };
  },
});

// ── Complex numbers ──────────────────────────────────────────────────────────

/** An exact complex number a + bi with rational parts. */
export class C {
  readonly re: Q;
  readonly im: Q;
  constructor(re: Q, im: Q) { this.re = re; this.im = im; }
  static of(re: number | Q, im: number | Q = 0): C { return new C(Q.of(re), Q.of(im)); }
  add(o: C) { return new C(this.re.add(o.re), this.im.add(o.im)); }
  sub(o: C) { return new C(this.re.sub(o.re), this.im.sub(o.im)); }
  mul(o: C) { return new C(this.re.mul(o.re).sub(this.im.mul(o.im)), this.re.mul(o.im).add(this.im.mul(o.re))); }
  conj() { return new C(this.re, this.im.neg()); }
  get norm2(): Q { return this.re.mul(this.re).add(this.im.mul(this.im)); }
  div(o: C) { const d = o.norm2; const n = this.mul(o.conj()); return new C(n.re.div(d), n.im.div(d)); }
  eq(o: C) { return this.re.eq(o.re) && this.im.eq(o.im); }
  /** `3 - 2i`, `-i`, `4`, `2/5 + 3/5 i`. */
  typst(): string {
    const imPart = (q: Q) => (q.eq(1) ? 'i' : q.eq(-1) ? '-i' : q.isInt ? `${q.n}i` : `${q.typst()} i`);
    if (this.im.eq(0)) return this.re.typst();
    if (this.re.eq(0)) return imPart(this.im);
    const mag = imPart(this.im.abs());
    return `${this.re.typst()} ${this.im.sign < 0 ? '-' : '+'} ${mag}`;
  }
  paren() { return this.im.eq(0) && this.re.sign >= 0 ? this.typst() : `(${this.typst()})`; }
}
const randC = (rng: Rng, N = 9) => C.of(rng.int(-N, N), rng.nonZero(-N, N));

export const a2ComplexOps = us('a2-complex-ops', {
  levels: { 1: 'Add and subtract', 2: 'Multiply', 3: 'Divide, and powers of i' },
  options: [manyOption('ops', 'Operations', [['add', 'Addition'], ['sub', 'Subtraction'], ['mul', 'Multiplication'], ['div', 'Division'], ['pow', 'Powers of i']], [['add', 'sub'], ['mul'], ['div', 'pow']])],
  generate(rng, _level, o) {
    const op = rng.pick(optList(o, 'ops', ['add']));
    if (op === 'pow') {
      const n = rng.int(5, 99);
      const vals = ['1', 'i', '-1', '-i'];
      const answer = vals[n % 4];
      return task('Simplify.', 'Simplify', `i^${n}`, {
        answer: math(answer), distractors: wrong(math(answer), vals.map(math)),
        solution: `The powers of ${math('i')} repeat every 4. ${math(`${n} = 4 dot ${Math.floor(n / 4)} + ${n % 4}`)}, so ${math(n % 4 === 0 ? `i^${n} = (i^4)^${n / 4} = 1` : n % 4 === 1 ? `i^${n} = i` : `i^${n} = i^${n % 4} = ${answer}`)}.`,
      });
    }
    const a = randC(rng), b = randC(rng, op === 'div' ? 5 : 9);
    const sym = { add: '+', sub: '-', mul: '', div: '/' }[op as 'add'];
    const expr = op === 'div' ? `(${a.typst()})/(${b.typst()})` : `${a.paren()}${sym ? ` ${sym} ` : ''}${b.paren()}`;
    const result = op === 'add' ? a.add(b) : op === 'sub' ? a.sub(b) : op === 'mul' ? a.mul(b) : a.div(b);
    const answer = result.typst();
    const wrongs = op === 'mul'
      ? [new C(a.re.mul(b.re).add(a.im.mul(b.im)), a.re.mul(b.im).add(a.im.mul(b.re))), new C(a.re.mul(b.re), a.im.mul(b.im)), result.conj()]
      // Forgetting to divide by the new denominator, the conjugate, or multiplying by b instead of its conjugate.
      : op === 'div' ? [a.mul(b.conj()), result.conj(), a.mul(b).div(C.of(b.norm2))]
        : [op === 'add' ? a.sub(b) : a.add(b), result.conj(), new C(result.re, result.im.add(1))];
    return task(op === 'div' ? 'Simplify. Write each answer in the form a + bi.' : 'Simplify.', 'Simplify', expr, {
      answer: math(answer),
      distractors: wrong(math(answer), wrongs.map((w) => math(w.typst()))),
      solution: op === 'mul' ? `Expand and use ${math('i^2 = -1')}: ${math(`${expr} = ${answer}`)}.`
        : op === 'div' ? `Multiply the numerator and denominator by the conjugate ${math(b.conj().typst())}: the denominator becomes ${math(b.norm2.typst())}, and ${math(`${expr} = ${answer}`)}.`
          : `Combine the real parts and the imaginary parts: ${math(`${expr} = ${answer}`)}.`,
    });
  },
});

export const a2ComplexGraph = us('a2-complex-graph', {
  levels: { 1: 'Name a plotted number', 2: 'Name a plotted number', 3: 'Name a plotted number' },
  generate(rng) {
    const pts = Array.from({ length: 4 }, () => [rng.int(-6, 6), rng.int(-6, 6)] as Pt).filter((p, i, all) => all.findIndex((q) => q[0] === p[0] && q[1] === p[1]) === i);
    while (pts.length < 4) pts.push([rng.int(-6, 6), rng.nonZero(-6, 6)]);
    const names = ['A', 'B', 'C', 'D'];
    const i = rng.int(0, pts.length - 1), z = C.of(pts[i][0], pts[i][1]);
    const graph = graphTypst({ xMin: -7, xMax: 7, yMin: -7, yMax: 7, width: 4.5, height: 4.5, xLabelStep: 2, yLabelStep: 2, dots: pts.map(([x, y]) => ({ x, y })), labels: [...pts.map(([x, y], k) => ({ x: x + 0.6, y: y + 0.6, text: names[k] })), { x: 6.2, y: -0.8, text: '"Re"' }, { x: 0.9, y: 6.4, text: '"Im"' }] });
    const answer = z.typst();
    return {
      body: `Write the complex number shown by point ${names[i]}.\n\n${graph}`,
      answer: math(answer),
      distractors: wrong(math(answer), [C.of(pts[i][1], pts[i][0]), z.conj(), C.of(-pts[i][0], pts[i][1])].map((w) => math(w.typst()))),
      solution: `The horizontal axis is the real axis and the vertical axis is the imaginary axis: ${names[i]} is ${math(answer)}.`,
    };
  },
});

const PYTHAGOREAN = [[3, 4, 5], [5, 12, 13], [8, 15, 17], [6, 8, 10], [7, 24, 25], [9, 12, 15]];

export const a2ComplexAbs = us('a2-complex-abs', {
  levels: { 1: 'Whole-number answers', 2: 'Simplify a radical', 3: 'Either' },
  generate(rng, level) {
    let a: number, b: number;
    if (level === 1 || (level === 3 && rng.next() < 0.5)) { const [p, q] = rng.pick(PYTHAGOREAN); [a, b] = rng.next() < 0.5 ? [p, q] : [q, p]; }
    else { a = rng.nonZero(-9, 9); b = rng.nonZero(-9, 9); }
    a *= rng.sign(); b *= rng.sign();
    const z = C.of(a, b);
    const answer = rootText(a * a + b * b);
    return task('Find the absolute value of each complex number.', 'Find', `|${z.typst()}|`, {
      answer: math(answer),
      distractors: wrong(math(answer), [String(Math.abs(a) + Math.abs(b)), rootText(Math.abs(a * a - b * b) || 2), String(a * a + b * b), rootText(a * a + b * b + 1)].map(math)),
      solution: `${math(`|a + b i| = sqrt(a^2 + b^2) = sqrt(${a * a} + ${b * b}) = ${answer}`)}.`,
    });
  },
});

export const a2ComplexRationalize = us('a2-complex-rationalize', {
  levels: { 1: 'Imaginary denominator', 2: 'Complex denominator', 3: 'Complex numerator and denominator' },
  generate(rng, level) {
    const num = level === 3 ? randC(rng, 6) : C.of(rng.nonZero(-9, 9));
    const den = level === 1 ? C.of(0, rng.nonZero(-6, 6)) : randC(rng, 6);
    const result = num.div(den);
    const expr = `(${num.typst()})/(${den.typst()})`;
    return task('Simplify. Write each answer in the form a + bi.', 'Simplify', expr, {
      answer: math(result.typst()),
      distractors: wrong(math(result.typst()), [result.conj(), num.mul(den.conj()), new C(result.re.neg(), result.im)].map((w) => math(w.typst()))),
      solution: `Multiply by ${math(`(${den.conj().typst()})/(${den.conj().typst()})`)}: the denominator becomes ${math(den.norm2.typst())}, so ${math(`${expr} = ${result.typst()}`)}.`,
    });
  },
});

export const a2QuadraticComplex = us('a2-quadratic-complex', {
  levels: { 1: 'x² + c = 0', 2: 'x² + bx + c = 0', 3: 'ax² + bx + c = 0' },
  generate(rng, level) {
    const v = rng.pick(['x', 'n', 'k', 'p', 'r', 'm']);
    if (level === 1) {
      const a = rng.int(1, 4), k = rng.int(1, 9);
      const eq = `${a === 1 ? '' : a}${v}^2 + ${a * k * k} = 0`;
      const ki = k === 1 ? 'i' : `${k}i`;
      const ans = `${v} = plus.minus ${ki}`;
      return task('Solve each equation.', 'Solve', eq, { answer: math(ans), distractors: wrong(math(ans), [`${v} = plus.minus ${k}`, `${v} = ${ki}`, `${v} = plus.minus ${k * k === 1 ? 2 : k * k}i`].map(math)), solution: `${math(`${v}^2 = -${k * k}`)}, so ${math(ans)}.` });
    }
    const a = level === 2 ? 1 : rng.int(2, 4);
    // Roots p ± q i (q > 0): a v² − 2ap v + a(p² + q²) = 0, with p allowed to be a half.
    const p = new Q(rng.int(-6, 6), level === 3 && rng.next() < 0.5 ? a : 1), q2 = rng.int(1, 12);
    const b = p.mul(-2 * a), c = p.mul(p).add(q2).mul(a);
    if (!b.isInt || !c.isInt) return a2QuadraticComplex.generate(rng, level);
    const s = new Surds([[1, q2]]);
    const ans = `${v} = ${p.eq(0) ? 'plus.minus ' : `${p.typst()} plus.minus `}${s.typst() === '1' ? '' : s.typst()}i`;
    return task('Solve each equation.', 'Solve', `${poly([a, b.n, c.n], v)} = 0`, {
      answer: math(ans),
      distractors: wrong(math(ans), [`${v} = ${p.neg().typst()} plus.minus ${s.typst() === '1' ? '' : s.typst()}i`, `${v} = ${p.typst()} plus.minus ${s.typst()}`, `${v} = ${p.typst()} plus.minus ${new Surds([[1, q2 * 4]]).typst()}i`].map(math)),
      solution: `The discriminant is ${math(`${b.n}^2 - 4(${a})(${c.n}) = ${b.n * b.n - 4 * a * c.n}`)}, which is negative, so the roots are complex: ${math(ans)}.`,
    });
  },
});

export const ALGEBRA_2_MATRICES = [a2Points3d, a2PlaneIntercepts, a2Cramer, a2MatrixEquations, a2MatrixTransformations, a2ComplexOps, a2ComplexGraph, a2ComplexAbs, a2ComplexRationalize, a2QuadraticComplex];
