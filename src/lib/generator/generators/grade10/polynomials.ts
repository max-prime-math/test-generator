import type { Rng } from '../../rng.ts';
import { gcd, poly, polynomial, type Term } from '../../format.ts';
import { graphTypst } from '../../graph.ts';
import { math, mb10i } from '../pc40s/common.ts';
import { optNum, optOne, radioOption, sizeOption } from '../../options.ts';
import { polyAdd, polyEval, polyMul } from '../pc40s/functions.ts';
import { distinct } from './shared.ts';

/** `(3x - 2)`, `(x + 5)`, `x` for [1, 0]. */
const bin = (a: number, b: number, v = 'x') => (b === 0 && a === 1 ? v : `(${poly([a, b], v)})`);
/** A product of binomials, with a space after a bare variable so `x (x + 2)` never reads as a call. */
const prod = (...fs: string[]) => fs.join('').replace(/^([a-z])\(/, '$1 (');
/** Leading constant in front of a product: `2(x + 1)(x - 3)`, `-(x + 1)`. */
const lead = (k: number, rest: string) => (k === 1 ? rest : k === -1 ? `-${rest}` : `${k}${rest}`);

function coprimePair(rng: Rng, lo: number, hi: number): [number, number] {
  for (;;) {
    const a = rng.int(lo, hi), b = rng.nonZero(-9, 9);
    if (gcd(a, b) === 1) return [a, b];
  }
}

// ── Multiplication ────────────────────────────────────────────────────────

/** (ax + by)² or (ax + by)(ax − by) in two variables. */
const two = (terms: Array<[number, number, number]>) => polynomial(terms.map(([c, px, py]): Term => ({ coef: c, powers: [['x', px], ['y', py]] })));

export const multSpecial = mb10i('10i-mult-special', {
  levels: { 1: '(x ± a)²', 2: '(ax ± b)² and (ax + b)(ax − b)', 3: 'Two variables' },
  options: [
    radioOption('form', 'Product', [['1', '(x ± a)²'], ['2', '(ax ± b)² and (ax + b)(ax − b)'], ['3', 'Two variables']], ['1', '2', '3']),
    sizeOption([5, 9, 12], [9, 9, 9], 'Size of the constant'),
    radioOption('kind', 'Kind (last two forms)', [['square', 'Squares'], ['conj', 'Sum times difference'], ['either', 'Either']], ['either', 'either', 'either']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const kind = optOne(o, 'kind', 'either');
    const conj = difficulty > 1 && (kind === 'either' ? rng.next() < 0.4 : kind === 'conj');
    const N = optNum(o, 'size', 9);
    const a = difficulty === 1 ? 1 : rng.int(2, 5), b = rng.nonZero(-N, N);
    if (difficulty === 3) {
      const c = rng.int(1, 4), d = rng.nonZero(-Math.ceil(N / 2), Math.ceil(N / 2));
      const expr = conj ? `(${two([[a, 1, 0], [d, 0, 1]])})(${two([[a, 1, 0], [-d, 0, 1]])})` : `(${two([[a, 1, 0], [d * c, 0, 1]])})^2`;
      const e = d * (conj ? 1 : c);
      const answer = conj ? two([[a * a, 2, 0], [-d * d, 0, 2]]) : two([[a * a, 2, 0], [2 * a * e, 1, 1], [e * e, 0, 2]]);
      return {
        body: `Expand and simplify: ${math(expr)}`,
        answer: math(answer),
        distractors: distinct(math(answer), (conj
          ? [two([[a * a, 2, 0], [d * d, 0, 2]]), two([[a * a, 2, 0], [-2 * a * d, 1, 1], [-d * d, 0, 2]]), two([[a, 2, 0], [-d, 0, 2]])]
          : [two([[a * a, 2, 0], [e * e, 0, 2]]), two([[a * a, 2, 0], [a * e, 1, 1], [e * e, 0, 2]]), two([[a, 2, 0], [2 * a * e, 1, 1], [e, 0, 2]])]).map(math)),
        solution: conj ? `A difference of squares: ${math(`(${a === 1 ? 'x' : `${a}x`})^2 - (${Math.abs(d) === 1 ? 'y' : `${Math.abs(d)}y`})^2 = ${answer}`)}.` : `${math('(p + q)^2 = p^2 + 2p q + q^2')}: ${math(answer)}.`,
      };
    }
    const expr = conj ? `${bin(a, b)}${bin(a, -b)}` : `${bin(a, b)}^2`;
    const answer = conj ? poly([a * a, 0, -b * b]) : poly([a * a, 2 * a * b, b * b]);
    return {
      body: `Expand and simplify: ${math(expr)}`,
      answer: math(answer),
      distractors: distinct(math(answer), (conj
        ? [poly([a * a, 0, b * b]), poly([a * a, -2 * a * b, -b * b]), poly([a, 0, -b * b]), poly([a * a, 0, -b])]
        : [poly([a * a, 0, b * b]), poly([a * a, a * b, b * b]), poly([a * a, 2 * a * b, -b * b]), poly([a, 2 * b, b * b])]).map(math)),
      solution: conj
        ? `The middle terms cancel: ${math(`${expr} = ${answer}`)}, a difference of squares.`
        : `Use ${math('(p + q)^2 = p^2 + 2p q + q^2')}: the middle term is ${math(`2(${a === 1 ? 'x' : `${a}x`})(${b}) = ${2 * a * b}x`)}, so ${math(`${expr} = ${answer}`)}.`,
    };
  },
});

/** An area model for (ax + b)(cx + d): a rectangle split at the variable and constant parts. */
function areaModel(a: number, b: number, c: number, d: number, fill: boolean): string {
  const X = 3, K = 1.4; // drawn lengths of x and of a constant part
  const top = [a * X, K], side = [c * X, K];
  const W = top[0] + top[1], H = side[0] + side[1];
  const s = 9 / Math.max(W, H);
  const P = (x: number, y: number): [number, number] => [x * s - 4.5, 4.5 - y * s];
  const curves = [
    { points: [P(0, 0), P(W, 0), P(W, H), P(0, H), P(0, 0)] },
    { points: [P(top[0], 0), P(top[0], H)] },
    { points: [P(0, side[0]), P(W, side[0])] },
  ];
  const at = (x: number, y: number, text: string) => { const [px, py] = P(x, y); return { x: px, y: py, text }; };
  const labels = [
    at(top[0] / 2, -0.5, a === 1 ? 'x' : `${a}x`), at(top[0] + top[1] / 2, -0.5, String(b)),
    at(-0.6, side[0] / 2, c === 1 ? 'x' : `${c}x`), at(-0.6, side[0] + side[1] / 2, String(d)),
  ];
  if (fill) {
    const term = (k: number, v: string) => (k === 1 && v ? v : k === -1 && v ? `-${v}` : `${k}${v}`);
    labels.push(at(top[0] / 2, side[0] / 2, term(a * c, 'x^2')), at(top[0] + top[1] / 2, side[0] / 2, term(b * c, 'x')), at(top[0] / 2, side[0] + side[1] / 2, term(a * d, 'x')), at(top[0] + top[1] / 2, side[0] + side[1] / 2, term(b * d, '')));
  }
  return graphTypst({ xMin: -6, xMax: 6, yMin: -6, yMax: 6, width: 4.8, height: 4.8, grid: false, numbers: false, axes: false, curves, labels });
}

export const multAreaModel = mb10i('10i-mult-area-model', {
  levels: { 1: 'Product from an area model', 2: 'Binomials from a completed area model', 3: 'Leading coefficients' },
  options: [
    radioOption('form', 'Task', [['1', 'Product from an area model'], ['2', 'Binomials from a completed area model'], ['3', 'Leading coefficients']], ['1', '2', '3']),
    sizeOption([5, 9, 12], [9, 9, 9], 'Size of the constants'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const a = difficulty === 3 ? rng.int(2, 3) : 1, c = difficulty === 3 ? rng.int(1, 2) : 1;
    const b = rng.int(1, optNum(o, 'size', 9)), d = rng.int(1, optNum(o, 'size', 9));
    const product = poly(polyMul([a, b], [c, d]));
    if (difficulty === 2) {
      const answer = prod(bin(a, b), bin(c, d));
      return {
        body: `The area model shows a product of two binomials. Which product does it show?\n\n${areaModel(a, b, c, d, true)}`,
        answer: math(`${answer} = ${product}`),
        distractors: distinct(math(`${answer} = ${product}`), [`${prod(bin(1, b * d), bin(1, 1))} = ${poly([1, b * d + 1, b * d])}`, `${prod(bin(1, b + d), bin(1, b * d))} = ${poly(polyMul([1, b + d], [1, b * d]))}`, `${prod(bin(a, d), bin(c, b + 1))} = ${poly(polyMul([a, d], [c, b + 1]))}`].map(math)),
        solution: `The side lengths are the factors: ${math(`${bin(a, b)}`)} across the top and ${math(`${bin(c, d)}`)} down the side. The four areas add to ${math(product)}.`,
      };
    }
    return {
      body: `Use the area model to multiply ${math(prod(bin(a, b), bin(c, d)))}.\n\n${areaModel(a, b, c, d, false)}`,
      answer: math(product),
      distractors: distinct(math(product), [poly([a * c, 0, b * d]), poly([a * c, b + d, b * d]), poly([a + c, a * d + b * c, b + d]), poly([a * c, a * d + b * c, b + d])].map(math)),
      solution: `The four parts: ${math(poly([a * c, 0, 0]))}, ${math(poly([b * c, 0]))}, ${math(poly([a * d, 0]))}, and ${math(String(b * d))}. Their sum is ${math(product)}.`,
    };
  },
});

export const multSimplify = mb10i('10i-mult-simplify', {
  levels: { 1: 'Sum of two products', 2: 'Difference of two products', 3: 'With a monomial factor and a square' },
  options: [
    radioOption('form', 'Expression', [['1', 'Sum of two products'], ['2', 'Difference of two products'], ['3', 'With a monomial factor and a square']], ['1', '2', '3']),
    sizeOption([4, 6, 9], [6, 6, 6], 'Size of the constants'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const r = () => rng.nonZero(-optNum(o, 'size', 6), optNum(o, 'size', 6));
    const p1 = [1, r()], p2 = [1, r()], q1 = [difficulty === 3 ? rng.int(2, 3) : 1, r()], q2 = [1, r()];
    const k = difficulty === 3 ? rng.nonZero(-3, 3) : 1;
    const A = polyMul(p1, p2).map((c) => c * k), B = difficulty === 3 ? polyMul(q1, q1) : polyMul(q1, q2);
    const sign = difficulty === 1 ? 1 : -1;
    const result = polyAdd(A, B, sign);
    const secondText = difficulty === 3 ? `${bin(q1[0], q1[1])}^2` : prod(bin(q1[0], q1[1]), bin(q2[0], q2[1]));
    const expr = `${lead(k, prod(bin(p1[0], p1[1]), bin(p2[0], p2[1])))} ${sign > 0 ? '+' : '-'} ${secondText}`;
    // Subtracting only the first term of the second product is the classic slip.
    const slip = polyAdd(A, B.map((c, i) => (i === 0 ? c : -c)), sign);
    return {
      body: `Expand and simplify: ${math(expr)}`,
      answer: math(poly(result)),
      distractors: distinct(math(poly(result)), [poly(polyAdd(A, B, -sign)), poly(slip), poly(polyAdd(polyMul(p1, p2), B, sign)), poly(result.map((c, i) => (i === result.length - 1 ? c + 2 : c)))].map(math)),
      solution: `Expand each product: ${math(poly(A))} and ${math(poly(B))}. ${sign > 0 ? 'Add' : 'Subtract the whole second product'}: ${math(poly(result))}.`,
    };
  },
});

export const multVerify = mb10i('10i-mult-verify', {
  levels: { 1: 'Check a product by substitution', 2: 'Find the wrong term', 3: 'Correct a product' },
  options: [
    radioOption('form', 'Task', [['1', 'Check a product by substitution'], ['2', 'Find the wrong term'], ['3', 'Correct a product']], ['1', '2', '3']),
    sizeOption([4, 7, 10], [7, 7, 7], 'Size of the constants'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const N = optNum(o, 'size', 7);
    const a = rng.int(1, 3), b = rng.nonZero(-N, N), c = 1, d = rng.nonZero(-N, N);
    const right = polyMul([a, b], [c, d]);
    const errs = [
      right.map((v, i) => (i === 1 ? a * d - b * c || v + 2 : v)),
      right.map((v, i) => (i === 2 ? -v : v)),
      right.map((v, i) => (i === 1 ? v + (rng.next() < 0.5 ? 2 : -2) : v)),
    ];
    const wrong = rng.pick(errs.filter((e) => poly(e) !== poly(right)));
    const expr = prod(bin(a, b), bin(c, d));
    if (difficulty === 1) {
      const claimRight = rng.next() < 0.5;
      const claim = claimRight ? right : wrong;
      const x = rng.pick([2, 3, -1, -2]);
      const L = polyEval([a, b], x) * polyEval([c, d], x), R = polyEval(claim, x);
      const answer = L === R ? `Both sides equal ${L}, so it may be correct.` : `The left side is ${L} and the right side is ${R}, so it is incorrect.`;
      return {
        body: `Substitute ${math(`x = ${x}`)} to check whether ${math(`${expr} = ${poly(claim)}`)}.`,
        answer,
        distractors: distinct(answer, [`Both sides equal ${R}, so it may be correct.`, `The left side is ${L + 1} and the right side is ${R}, so it is incorrect.`, `The left side is ${R} and the right side is ${L - 2}, so it is incorrect.`, `Both sides equal ${L}, so it is incorrect.`]),
        solution: `Left: ${math(`${bin(a, b).replace('x', `(${x})`)}${bin(c, d).replace('x', `(${x})`)} = ${L}`.replace('1(', '('))}. Right: ${R}. ${L === R ? 'They agree (one check cannot prove it, but here the expansion is correct).' : 'They differ, so the expansion is wrong.'}`,
      };
    }
    if (difficulty === 2) {
      const idx = wrong.findIndex((v, i) => v !== right[i]);
      const names = ['the $x^2$ term', 'the $x$ term', 'the constant term'];
      return {
        body: `A student wrote ${math(`${expr} = ${poly(wrong)}`)}. Which term is wrong?`,
        answer: names[idx],
        distractors: [...names.filter((_, i) => i !== idx), 'None: the product is correct'],
        solution: `${math(`${expr} = ${poly(right)}`)}. The ${['x²', 'x', 'constant'][idx]} term should be ${math(String(right[idx]))}.`,
      };
    }
    return {
      body: `A student wrote ${math(`${expr} = ${poly(wrong)}`)}. What is the correct product?`,
      answer: math(poly(right)),
      distractors: distinct(math(poly(right)), [...errs.map((e) => poly(e)), poly([a * c, 0, b * d])].map(math)),
      solution: `Multiply each term: ${math(`${polynomial([{ coef: a * c, powers: [['x', 2]] }, { coef: a * d, powers: [['x', 1]] }, { coef: b * c, powers: [['x', 1]] }, { coef: b * d }])} = ${poly(right)}`)}.`,
    };
  },
});

// ── Factoring ─────────────────────────────────────────────────────────────

export const facGcf = mb10i('10i-fac-gcf', {
  levels: { 1: 'Numerical common factor', 2: 'Variable common factor', 3: 'Two variables, three terms' },
  options: [
    radioOption('form', 'Common factor', [['1', 'Numerical common factor'], ['2', 'Variable common factor'], ['3', 'Two variables, three terms']], ['1', '2', '3']),
    sizeOption([5, 9, 12], [9, 9, 9], 'Largest common factor'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    if (difficulty === 3) {
      const g = rng.int(2, Math.max(3, Math.round(optNum(o, 'size', 9) * 0.66))), c = [rng.int(1, 5), -rng.int(1, 5), rng.nonZero(-4, 4)];
      if (c.reduce((x, y) => gcd(x, y)) !== 1) return facGcf.generate(rng, difficulty, o);
      const inside = polynomial([{ coef: c[0], powers: [['a', 1]] }, { coef: c[1], powers: [['b', 1]] }, { coef: c[2] }]);
      const whole = polynomial([{ coef: g * c[0], powers: [['a', 2], ['b', 1]] }, { coef: g * c[1], powers: [['a', 1], ['b', 2]] }, { coef: g * c[2], powers: [['a', 1], ['b', 1]] }]);
      const answer = `${g}a b(${inside})`;
      return {
        body: `Factor: ${math(whole)}`,
        answer: math(answer),
        distractors: distinct(math(answer), [`${g}(${polynomial([{ coef: c[0], powers: [['a', 2], ['b', 1]] }, { coef: c[1], powers: [['a', 1], ['b', 2]] }, { coef: c[2], powers: [['a', 1], ['b', 1]] }])})`, `${g}a b(${polynomial([{ coef: c[0], powers: [['a', 1]] }, { coef: c[1], powers: [['b', 1]] }])})`, `a b(${polynomial([{ coef: g * c[0], powers: [['a', 1]] }, { coef: g * c[1], powers: [['b', 1]] }, { coef: g * c[2] }])})`, `${g}a b(${polynomial([{ coef: c[0], powers: [['a', 1]] }, { coef: -c[1], powers: [['b', 1]] }, { coef: c[2] }])})`].map(math)),
        solution: `Each term has ${math(`${g}a b`)} as a factor. Divide each term by it: ${math(answer)}.`,
      };
    }
    const g = rng.int(2, optNum(o, 'size', 9)), [p, q] = coprimePair(rng, 1, 9);
    const k = difficulty === 2 ? rng.int(1, 3) : 0;
    const gText = k === 0 ? String(g) : `${g}x${k === 1 ? '' : `^${k}`}`;
    const whole = poly([g * p, g * q, ...Array(k).fill(0)]);
    const answer = `${gText}(${poly([p, q])})`;
    const partial = k === 0 ? `${g}(${poly([p, q])})` : `${g}(${poly([p, q, ...Array(k).fill(0)])})`;
    return {
      body: `Factor: ${math(whole)}`,
      answer: math(answer),
      distractors: distinct(math(answer), [partial, `${gText}(${poly([p, -q])})`, `${gText}(${poly([g * p, q])})`, k ? `${g}x^${k + 1}(${poly([p, q])})`.replace('^1(', '(') : `${g * p}(${poly([1, q])})`].map(math)),
      solution: `The greatest common factor is ${math(gText)}. Divide each term by it: ${math(answer)}.`,
    };
  },
});

export const facDifferenceSquares = mb10i('10i-fac-difference-squares', {
  levels: { 1: 'x² − a²', 2: 'a²x² − b²y²', 3: 'With a common factor or a fourth power' },
  options: [
    radioOption('form', 'Expression', [['1', 'x² − a²'], ['2', 'a²x² − b²y²'], ['3', 'With a common factor or a fourth power']], ['1', '2', '3']),
    sizeOption([6, 12, 15], [12, 12, 12], 'Largest square root'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const N = optNum(o, 'size', 12);
    const a = rng.int(1, N);
    if (difficulty === 1) {
      return {
        body: `Factor: ${math(poly([1, 0, -a * a]))}`,
        answer: math(`${bin(1, -a)}${bin(1, a)}`),
        distractors: [`${bin(1, -a)}^2`, `${bin(1, a)}^2`, `${bin(1, -a * a)}${bin(1, 1)}`].map(math),
        solution: `${math(`x^2 - ${a * a} = x^2 - ${a}^2 = ${bin(1, -a)}${bin(1, a)}`)}. It is the special case of a trinomial with no middle term, since ${math(`${-a} + ${a} = 0`)}.`,
      };
    }
    if (difficulty === 2) {
      const p = rng.int(2, 7), q = rng.int(1, Math.max(3, Math.round(N * 0.75)));
      if (gcd(p, q) !== 1) return facDifferenceSquares.generate(rng, difficulty, o);
      const whole = two([[p * p, 2, 0], [-q * q, 0, 2]]);
      const f = (s: number) => `(${two([[p, 1, 0], [s * q, 0, 1]])})`;
      return {
        body: `Factor: ${math(whole)}`,
        answer: math(`${f(-1)}${f(1)}`),
        distractors: [`${f(-1)}^2`, `(${two([[p * p, 1, 0], [-q, 0, 1]])})(${two([[1, 1, 0], [q, 0, 1]])})`, `(${two([[p, 1, 0], [-q * q, 0, 1]])})(${two([[p, 1, 0], [q * q, 0, 1]])})`].map(math),
        solution: `${math(`${whole} = (${p === 1 ? '' : p}x)^2 - (${q === 1 ? '' : q}y)^2 = ${f(-1)}${f(1)}`)}.`,
      };
    }
    if (rng.next() < 0.5) {
      const k = rng.int(2, 5), b = rng.int(1, Math.max(3, Math.round(N * 0.75)));
      return {
        body: `Factor completely: ${math(poly([k, 0, -k * b * b]))}`,
        answer: math(`${k}${bin(1, -b)}${bin(1, b)}`),
        distractors: [`${bin(k, -b)}${bin(1, b)}`, `${k}${bin(1, -b)}^2`, `${k}(${poly([1, 0, -b * b])})`].map(math),
        solution: `Common factor first: ${math(`${k}(x^2 - ${b * b})`)}. Then a difference of squares: ${math(`${k}${bin(1, -b)}${bin(1, b)}`)}.`,
      };
    }
    const b = rng.int(1, 3);
    const s = b * b;
    return {
      body: `Factor completely: ${math(`x^4 - ${s * s}`)}`,
      answer: math(`(x^2 + ${s})${bin(1, -b)}${bin(1, b)}`),
      distractors: [`(x^2 - ${s})(x^2 + ${s})`, `${bin(1, -b)}^2 ${bin(1, b)}^2`, `(x^2 - ${s})^2`].map(math),
      solution: `${math(`x^4 - ${s * s} = (x^2 - ${s})(x^2 + ${s})`)}, and ${math(`x^2 - ${s}`)} is again a difference of squares: ${math(`(x^2 + ${s})${bin(1, -b)}${bin(1, b)}`)}. (${math(`x^2 + ${s}`)} does not factor.)`,
    };
  },
});

/** Two integer roots r, s for (x − r)(x − s), non-zero and distinct. */
function roots(rng: Rng, N = 8): [number, number] {
  const r = rng.nonZero(-N, N);
  let s = rng.nonZero(-N, N);
  while (s === r || s === -r) s = rng.nonZero(-N, N);
  return [r, s];
}

export const facCompletely = mb10i('10i-fac-completely', {
  levels: { 1: 'Common factor, then x² + bx + c', 2: 'Negative common factor', 3: 'Common factor with a variable' },
  options: [
    radioOption('form', 'Common factor', [['1', 'Common factor, then x² + bx + c'], ['2', 'Negative common factor'], ['3', 'Common factor with a variable']], ['1', '2', '3']),
    sizeOption([5, 8, 12], [8, 8, 8], 'Size of the numbers in the factors'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const [r, s] = roots(rng, optNum(o, 'size', 8));
    const k = difficulty === 2 ? -rng.int(1, 4) : rng.int(2, 5);
    const withX = difficulty === 3;
    const inner = polyMul([1, -r], [1, -s]);
    const whole = [...inner.map((c) => c * k), ...(withX ? [0] : [])];
    const kText = withX ? `${k}x` : String(k);
    // The factor in front: -(...) rather than -1(...), and nothing for 1.
    const lead = (c: number) => `${c === 1 ? '' : c === -1 ? '-' : c}${withX ? 'x' : ''}`;
    const factored = `${lead(k)}${bin(1, -r)}${bin(1, -s)}`;
    return {
      body: `Factor completely: ${math(poly(whole))}`,
      answer: math(factored),
      distractors: distinct(math(factored), [`${lead(k)}(${poly(inner)})`, `${lead(k)}${bin(1, r)}${bin(1, s)}`, `${withX ? 'x' : ''}${bin(1, -r)}${bin(k, -k * s)}`, `${lead(-k)}${bin(1, -r)}${bin(1, -s)}`].map(math)),
      solution: `Take out ${math(kText)}: ${math(`${lead(k)}(${poly(inner)})`)}. Two numbers with product ${math(String(r * s))} and sum ${math(String(-(r + s)))} are ${math(String(-r))} and ${math(String(-s))}: ${math(factored)}.`,
    };
  },
});

export const facArea = mb10i('10i-fac-area', {
  levels: { 1: 'Length from the area and width', 2: 'Both dimensions from the area', 3: 'Side and perimeter of a square' },
  options: [
    radioOption('form', 'Find', [['1', 'Length from the area and width'], ['2', 'Both dimensions from the area'], ['3', 'Side and perimeter of a square']], ['1', '2', '3']),
    sizeOption([5, 9, 12], [9, 9, 9], 'Size of the constants'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    if (difficulty === 3) {
      const a = rng.int(1, 5), b = rng.int(1, optNum(o, 'size', 9));
      const area = poly([a * a, 2 * a * b, b * b]);
      return {
        body: `A square has an area of ${math(area)} square units. Find an expression for its perimeter.`,
        answer: math(poly([4 * a, 4 * b])),
        distractors: [poly([a, b]), poly([2 * a, 2 * b]), poly([4 * a * a, 4 * b * b])].map(math),
        solution: `${math(`${area} = ${bin(a, b)}^2`)}, so each side is ${math(poly([a, b]))} and the perimeter is ${math(`4${bin(a, b)} = ${poly([4 * a, 4 * b])}`)}.`,
      };
    }
    const a = difficulty === 2 ? rng.int(2, 3) : 1;
    const b = rng.int(1, optNum(o, 'size', 9)), d = rng.int(1, optNum(o, 'size', 9));
    const area = poly(polyMul([a, b], [1, d]));
    if (difficulty === 1) {
      return {
        body: `A rectangle has an area of ${math(area)} and a width of ${math(poly([1, d]))}. Find its length.`,
        answer: math(poly([1, b])),
        distractors: distinct(math(poly([1, b])), [poly([1, b * d]), poly([1, b + d]), poly([1, -b]), poly([1, b - d])].map(math)),
        solution: `Factor: ${math(`${area} = ${bin(1, b)}${bin(1, d)}`)}. The length is ${math(poly([1, b]))}.`,
      };
    }
    const answer = `${bin(a, b)} "by" ${bin(1, d)}`;
    return {
      body: `A rectangle has an area of ${math(area)}. Find expressions for its dimensions.`,
      answer: math(answer),
      distractors: distinct(math(answer), [`${bin(a, d)} "by" ${bin(1, b)}`, `${bin(a, b * d)} "by" ${bin(1, 1)}`, `${bin(1, b)} "by" ${bin(a, d)}`].map(math)),
      solution: `Factor the area: ${math(`${area} = ${bin(a, b)}${bin(1, d)}`)}. Check by expanding.`,
    };
  },
});

export const facError = mb10i('10i-fac-error', {
  levels: { 1: 'Sign errors in trinomials', 2: 'Difference of squares slips', 3: 'Incomplete factoring' },
  options: [
    radioOption('form', 'Error', [['1', 'Sign errors in trinomials'], ['2', 'Difference of squares slips'], ['3', 'Incomplete factoring']], ['1', '2', '3']),
    sizeOption([5, 8, 12], [8, 8, 8], 'Size of numbers'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    if (difficulty === 1) {
      const [r, s] = roots(rng, optNum(o, 'size', 8));
      const whole = poly(polyMul([1, -r], [1, -s]));
      const correct = `${bin(1, -r)}${bin(1, -s)}`, student = `${bin(1, r)}${bin(1, s)}`;
      return {
        body: `A student factored ${math(whole)} as ${math(student)}. What is the correct factorization?`,
        answer: math(correct),
        distractors: distinct(math(correct), [student, `${bin(1, -r)}${bin(1, s)}`, `${bin(1, r)}${bin(1, -s)}`].map(math)),
        solution: `Expanding ${math(student)} gives ${math(poly(polyMul([1, r], [1, s])))}, not the original. The numbers must multiply to ${r * s} and add to ${-(r + s)}: ${-r} and ${-s}. So ${math(correct)}.`,
      };
    }
    if (difficulty === 2) {
      const a = rng.int(2, optNum(o, 'size', 8) + 1);
      const plus = rng.next() < 0.5;
      if (plus) {
        return {
          body: `A student factored ${math(`x^2 + ${a * a}`)} as ${math(`${bin(1, a)}${bin(1, a)}`)}. What is correct?`,
          answer: `It does not factor over the integers.`,
          distractors: [math(`${bin(1, -a)}${bin(1, a)}`), math(`${bin(1, a)}${bin(1, a)}`), math(`${bin(1, -a)}${bin(1, -a)}`)],
          solution: `${math(`${bin(1, a)}^2 = ${poly([1, 2 * a, a * a])}`)}, which has a middle term. A sum of squares ${math(`x^2 + ${a * a}`)} does not factor.`,
        };
      }
      return {
        body: `A student factored ${math(`x^2 - ${a * a}`)} as ${math(`${bin(1, -a)}^2`)}. What is the correct factorization?`,
        answer: math(`${bin(1, -a)}${bin(1, a)}`),
        distractors: [math(`${bin(1, -a)}^2`), math(`${bin(1, a)}^2`), `It does not factor over the integers.`],
        solution: `${math(`${bin(1, -a)}^2 = ${poly([1, -2 * a, a * a])}`)}. A difference of squares factors as ${math(`${bin(1, -a)}${bin(1, a)}`)}.`,
      };
    }
    const k = rng.int(2, 4), b = rng.int(1, Math.max(3, optNum(o, 'size', 8) - 2));
    const whole = poly([k, 0, -k * b * b]);
    const student = `${bin(k, -k * b)}${bin(1, b)}`;
    const correct = `${k}${bin(1, -b)}${bin(1, b)}`;
    return {
      body: `A student factored ${math(whole)} as ${math(student)}. Why is this not fully factored, and what is the complete factorization?`,
      answer: `${math(`${poly([k, -k * b])}`)} still has a common factor ${k}: ${math(correct)}`,
      distractors: [`It is fully factored: ${math(student)}`, `${math(`${poly([k, -k * b])}`)} still has a common factor ${k}: ${math(`${k}${bin(1, -b)}^2`)}`, `The signs are wrong: ${math(`${bin(k, k * b)}${bin(1, -b)}`)}`],
      solution: `${math(poly([k, -k * b]))} = ${math(`${k}${bin(1, -b)}`)}. Taking the common factor out first gives ${math(`${k}(x^2 - ${b * b}) = ${correct}`)}.`,
    };
  },
});

export const POLYNOMIAL_10I = [multSpecial, multAreaModel, multSimplify, multVerify, facGcf, facDifferenceSquares, facCompletely, facArea, facError];
