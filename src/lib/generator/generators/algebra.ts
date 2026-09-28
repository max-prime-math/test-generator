import type { Generator } from '../types.ts';
import type { Rng } from '../rng.ts';
import { frac, gcd, monomial, monomialQuotient, paren, poly, polynomial, sub, type Powers } from '../format.ts';
import { optNum, optOn, optOne, radioOption, sizeOption, toggleOption } from '../options.ts';

const math = (text: string) => `$${text}$`;
/** Display math, for aligned multi-line working. */
const block = (text: string) => `$ ${text} $`;

/** Multiply polynomials given as coefficient lists, highest power first. */
function multiply(p: number[], q: number[]): number[] {
  const out = new Array(p.length + q.length - 1).fill(0);
  p.forEach((a, i) => q.forEach((b, j) => { out[i + j] += a * b; }));
  return out;
}

/** Wrong expansions from the usual slips: a sign dropped on one term, or the middle terms left out. */
function expansionDistractors(coefs: number[]): string[] {
  const out: string[] = [];
  for (let i = 1; i < coefs.length; i++) {
    if (coefs[i] === 0) continue;
    const slip = [...coefs];
    slip[i] = -slip[i];
    out.push(poly(slip));
  }
  const firstAndLast = coefs.map((c, i) => (i === 0 || i === coefs.length - 1 ? c : 0));
  out.push(poly(firstAndLast));
  out.push(poly(coefs.map((c, i) => (i === 0 ? c : -c))));
  return out;
}

export const multiplyPolynomials: Generator = {
  id: 'mb-10i-multiply-polynomials',
  title: 'Multiply polynomials',
  classId: 'mb-10i',
  unitId: 'A',
  outcomeId: '10I.A.4',
  outcomes: ['10I.A.4'],
  catalogId: '10i-multiply-polynomials',
  levels: {
    1: '(x + a)(x + b)',
    2: '(ax + b)(cx + d)',
    3: 'Binomial × trinomial',
  },
  options: [
    sizeOption([3, 5, 9, 12, 20], [9, 9, 5], 'Size of constants'),
    radioOption('leading', 'Leading coefficients', [['1', 'Always 1'], ['any', 'Any']], ['1', 'any', 'any']),
    radioOption('form', 'Factors', [['bb', 'Binomial × binomial'], ['bt', 'Binomial × trinomial'], ['tt', 'Trinomial × trinomial']], ['bb', 'bb', 'bt']),
  ],
  points: 2,
  generate(rng, difficulty, o) {
    const N = optNum(o, 'size', difficulty === 3 ? 5 : 9);
    const anyLead = optOne(o, 'leading', difficulty === 1 ? '1' : 'any') === 'any';
    const form = optOne(o, 'form', difficulty === 3 ? 'bt' : 'bb');
    const lc = () => (anyLead ? rng.int(1, Math.min(5, N)) : 1);
    const term = () => rng.nonZero(-N, N);
    let first: number[], second: number[];
    do {
      first = form === 'tt' ? [lc(), term(), term()] : [lc(), term()];
      second = form === 'bb' ? [lc(), term()] : [lc(), term(), term()];
    } while (anyLead && N > 1 && form === 'bb' && first[0] === 1 && second[0] === 1);
    const product = multiply(first, second);
    const factors = `${paren(poly(first))}${paren(poly(second))}`;
    const secondText = paren(poly(second));
    // Distribute each term of the first factor over the second.
    const distributed = first.map((c, i) => {
      const text = monomial(Math.abs(c), [['x', first.length - 1 - i]]);
      return `${i === 0 ? (c < 0 ? '-' : '') : c < 0 ? ' - ' : ' + '}${text === '1' ? '' : text}${secondText}`;
    }).join('');
    const partials = polynomial(first.flatMap((a, i) => second.map((c, j) => ({ coef: a * c, powers: [['x', first.length - 1 - i + second.length - 1 - j]] as Powers }))));
    return {
      body: `Expand and simplify: ${math(factors)}`,
      answer: math(poly(product)),
      distractors: expansionDistractors(product).map(math),
      solution: block(`${factors} &= ${distributed} \\ &= ${partials} \\ &= ${poly(product)}`),
    };
  },
};

/** `(mx + p)` with a positive leading coefficient. */
const factor = (m: number, p: number) => paren(poly([m, p]));

export const factorTrinomials: Generator = {
  id: 'mb-10i-factor-trinomials',
  title: 'Factor trinomials',
  classId: 'mb-10i',
  unitId: 'A',
  outcomeId: '10I.A.5',
  outcomes: ['10I.A.5'],
  catalogId: '10i-factor-trinomials',
  levels: {
    1: 'x² + bx + c',
    2: 'ax² + bx + c',
    3: 'Common factor first',
  },
  options: [
    sizeOption([5, 7, 9, 12, 20], [9, 7, 7], 'Size of constants in the factors'),
    radioOption('leading', 'Leading coefficient', [['1', 'Always 1'], ['any', 'Greater than 1']], ['1', 'any', 'any']),
    toggleOption('gcf', 'Include a common factor', [false, false, true]),
  ],
  points: 2,
  generate(rng, difficulty, o) {
    const N = optNum(o, 'size', difficulty === 1 ? 9 : 7);
    const anyLead = optOne(o, 'leading', difficulty === 1 ? '1' : 'any') === 'any';
    const withGcf = optOn(o, 'gcf', difficulty === 3);
    let k = 1, m = 1, n = 1, p: number, q: number;
    if (!anyLead) {
      do { p = rng.nonZero(-N, N); q = rng.nonZero(-N, N); } while (p + q === 0);
    } else {
      // Each factor must be primitive, so the trinomial has no common factor of its own.
      do {
        m = rng.int(1, 4); n = rng.int(1, 4);
        p = rng.nonZero(-N, N); q = rng.nonZero(-N, N);
      } while ((m === 1 && n === 1) || gcd(m, p) !== 1 || gcd(n, q) !== 1 || m * q + n * p === 0);
    }
    if (withGcf) k = rng.int(2, 5);
    p = p!; q = q!;
    const inner = multiply([m, p], [n, q]);
    const trinomial = inner.map((c) => c * k);
    const lead = k === 1 ? '' : String(k);
    const answer = `${lead}${factor(m, p)}${factor(n, q)}`;
    // Sign slips and swapped constants, dropping any that expand to the answer (a reordered copy is still right).
    const same = (u: number[], v: number[]) => u.length === v.length && u.every((c, i) => c === v[i]);
    const distractors = ([[m, -p, n, -q], [m, p, n, -q], [m, -p, n, q], [m, q, n, p]] as number[][])
      .filter(([m1, p1, n1, q1]) => !same(multiply([m1, p1], [n1, q1]), inner))
      .map(([m1, p1, n1, q1]) => `${lead}${factor(m1, p1)}${factor(n1, q1)}`);
    if (k !== 1) distractors.unshift(`${factor(m, p)}${factor(n, q)}`);

    const steps: string[] = [];
    if (k !== 1) steps.push(`Take out the common factor ${math(String(k))}: ${math(`${poly(trinomial)} = ${k}${paren(poly(inner))}`)}.`);
    const [a, b, c] = inner;
    if (a === 1) {
      steps.push(`Find two integers with product ${math(String(c))} and sum ${math(String(b))}: ${math(`${p}`)} and ${math(`${q}`)}.`);
    } else {
      const r = m * q, s = n * p;
      steps.push(`Find two integers with product ${math(`${a} dot ${c < 0 ? `(${c})` : c} = ${a * c}`)} and sum ${math(String(b))}: ${math(`${r}`)} and ${math(`${s}`)}.`);
      steps.push(`Split the middle term and group: ${math(`${polynomial([
        { coef: a, powers: [['x', 2]] }, { coef: r, powers: [['x', 1]] }, { coef: s, powers: [['x', 1]] }, { coef: c },
      ])} = ${monomial(m, [['x', 1]])}${factor(n, q)} ${p < 0 ? '-' : '+'} ${Math.abs(p)}${factor(n, q)}`)}.`);
    }
    steps.push(`So ${math(`${poly(trinomial)} = ${answer}`)}.`);
    return {
      body: `Factor completely: ${math(poly(trinomial))}`,
      answer: math(answer),
      distractors: distractors.map(math),
      solution: steps.join('\n\n'),
    };
  },
};

type Mono = { coef: number; x: number; y: number };
const monoText = (t: Mono) => monomial(t.coef, [['x', t.x], ['y', t.y]]);

function randomMono(rng: Rng, coef: [number, number], power: [number, number]): Mono {
  return { coef: rng.int(...coef), x: rng.int(...power), y: rng.int(...power) };
}

export const exponentLaws: Generator = {
  id: 'mb-10i-exponent-laws',
  title: 'Simplify using exponent laws',
  classId: 'mb-10i',
  unitId: 'A',
  outcomeId: '10I.A.3',
  outcomes: ['10I.A.3'],
  catalogId: '10i-exponent-laws',
  levels: {
    1: 'Product of monomials',
    2: 'Quotients, negative exponents',
    3: 'Power of a monomial, negative powers',
  },
  points: 2,
  options: [
    radioOption('form', 'Expression', [['1', 'Product of monomials'], ['2', 'Quotients, negative exponents'], ['3', 'Power of a monomial, negative powers']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const positive = 'Simplify. Write your answer using only positive exponents.';
    if (difficulty === 1) {
      const u = randomMono(rng, [2, 6], [1, 6]);
      const v = randomMono(rng, [2, 6], [1, 5]);
      const expr = `${paren(monoText(u))}${paren(monoText(v))}`;
      const answer = monoText({ coef: u.coef * v.coef, x: u.x + v.x, y: u.y + v.y });
      return {
        body: `Simplify: ${math(expr)}`,
        answer: math(answer),
        distractors: [
          monoText({ coef: u.coef + v.coef, x: u.x + v.x, y: u.y + v.y }),
          monoText({ coef: u.coef * v.coef, x: u.x * v.x, y: u.y * v.y }),
          monoText({ coef: u.coef + v.coef, x: u.x * v.x, y: u.y * v.y }),
          monoText({ coef: u.coef * v.coef, x: u.x * v.x, y: u.y + v.y }),
        ].map(math),
        solution: `Multiply the coefficients and add the exponents of each base: ${math(`${expr} = (${u.coef} dot ${v.coef}) x^(${u.x} + ${v.x}) y^(${u.y} + ${v.y}) = ${answer}`)}`,
      };
    }
    if (difficulty === 2) {
      const d = rng.int(2, 6);
      const u = { coef: d * rng.int(1, 6) * rng.pick([1, 1, 2, 3]), x: rng.int(-3, 7), y: rng.int(-3, 6) };
      const v = { coef: d * rng.pick([1, 2, 3]), x: rng.int(-2, 6), y: rng.int(-2, 6) };
      if (u.x === v.x) u.x += 1;
      const expr = `(${monoText(u)})/(${monoText(v)})`;
      const answer = monomialQuotient(u.coef, v.coef, [['x', u.x - v.x], ['y', u.y - v.y]]);
      return {
        body: `${positive} ${math(expr)}`,
        answer: math(answer),
        distractors: [
          monomialQuotient(u.coef, v.coef, [['x', v.x - u.x], ['y', u.y - v.y]]),
          monomialQuotient(u.coef, v.coef, [['x', u.x + v.x], ['y', u.y + v.y]]),
          monomialQuotient(u.coef - v.coef || 1, 1, [['x', u.x - v.x], ['y', u.y - v.y]]),
          monomialQuotient(u.coef, v.coef, [['x', u.x - v.x], ['y', v.y - u.y]]),
          monomialQuotient(u.coef, v.coef, [['x', v.x - u.x], ['y', v.y - u.y]]),
        ].map(math),
        solution: `Divide the coefficients and subtract the exponents, then move negative powers to the denominator: ${math(`${expr} = ${frac(u.coef, v.coef)} ${[['x', u.x, v.x], ['y', u.y, v.y]].filter(([, p, q]) => p || q).map(([name, p, q]) => `${name}^(${p} - ${sub(q as number)})`).join(' ')} = ${answer}`)}`,
      };
    }
    const a = rng.int(2, 4);
    const x = rng.nonZero(-4, 4);
    const y = rng.nonZero(-4, 4);
    const p = rng.pick([-3, -2, -2, 2, 3]);
    const base = monomial(a, [['x', x], ['y', y]]);
    const expr = `(${base})^(${p})`;
    const power = (value: number) => (p > 0 ? [value ** p, 1] : [1, value ** -p]) as [number, number];
    const [n, dd] = power(a);
    const answer = monomialQuotient(n, dd, [['x', x * p], ['y', y * p]]);
    return {
      body: `${positive} ${math(expr)}`,
      answer: math(answer),
      distractors: [
        monomialQuotient(p > 0 ? a * p : 1, p > 0 ? 1 : a * -p, [['x', x * p], ['y', y * p]]),
        monomialQuotient(a, 1, [['x', x * p], ['y', y * p]]),
        monomialQuotient(n, dd, [['x', x + p], ['y', y + p]]),
        monomialQuotient(n, dd, [['x', -x * p], ['y', y * p]]),
      ].map(math),
      solution: `Raise the coefficient to the power and multiply each exponent by ${math(String(p))}: ${math(`${expr} = ${a}^(${p}) x^(${x} dot ${sub(p)}) y^(${y} dot ${sub(p)}) = ${answer}`)}`,
    };
  },
};

export const rationalExponents: Generator = {
  id: 'mb-10i-rational-exponents',
  title: 'Evaluate powers with rational exponents',
  classId: 'mb-10i',
  unitId: 'A',
  outcomeId: '10I.A.3',
  outcomes: ['10I.A.3'],
  catalogId: '10i-rational-exponents',
  levels: {
    1: 'Unit fraction exponents',
    2: 'Fractional exponents',
    3: 'Negative fractional exponents',
  },
  points: 1,
  options: [
    radioOption('form', 'Exponent', [['1', 'Unit fraction exponents'], ['2', 'Fractional exponents'], ['3', 'Negative fractional exponents']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    // [root, base root] pairs; powers are chosen so answers stay under about 1000.
    const [root, r] = rng.pick(difficulty === 1
      ? [[2, 4], [2, 5], [2, 6], [2, 7], [2, 9], [2, 10], [2, 12], [3, 2], [3, 3], [3, 4], [3, 5], [4, 2], [4, 3], [5, 2]]
      : [[2, 2], [2, 3], [2, 4], [2, 5], [3, 2], [3, 3], [3, 4], [4, 2], [4, 3], [5, 2]]);
    const powers: Record<number, number[]> = { 2: [3], 3: [2, 4], 4: [3], 5: [2, 3] };
    const m = difficulty === 1 ? 1 : rng.pick(powers[root]);
    const sign = difficulty === 3 ? -1 : 1;
    const base = r ** root;
    const exponent = sign < 0 ? `-${m}/${root}` : `${m}/${root}`;
    const value = r ** m;
    const answer = sign < 0 ? `1/${value}` : String(value);
    const rootText = root === 2 ? `sqrt(${base})` : `root(${root}, ${base})`;
    return {
      body: `Evaluate: ${math(`${base}^(${exponent})`)}`,
      answer: math(answer),
      distractors: [
        sign < 0 ? String(-value) : `1/${value}`,
        frac(sign * base * m, root),
        sign < 0 ? `1/${r}` : m === 1 ? `-${r}` : String(r),
        sign < 0 ? `1/${r ** (m + 1)}` : String(r ** (m + 1)),
        m === 1 ? String(base) : String(r * m),
      ].map(math),
      solution: math([
        `${base}^(${exponent})`,
        sign < 0 ? `1/(${rootText})^${m}` : m === 1 ? rootText : `(${rootText})^${m}`,
        ...(sign < 0 || m > 1 ? [`${sign < 0 ? '1/' : ''}${r}^${m}`] : []),
        answer,
      ].join(' = ')),
    };
  },
};
