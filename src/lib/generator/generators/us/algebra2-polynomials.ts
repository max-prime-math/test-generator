// Algebra 2: polynomials and rational expressions, after Kuta's
// MultiplyPolySpecial (cubes), FactorCubes, ConjugateRootTheorem,
// WritingPolyConjugate, DescartesRuleOfSigns, RationalRootTheorem,
// FundamentalTheorem, RationalExponentEquations, and ComplexFractions.
import type { Rng } from '../../rng.ts';
import { Q, Surds } from '../../exact.ts';
import { gcd, poly } from '../../format.ts';
import { optOn, optOne, radioOption, toggleOption } from '../../options.ts';
import { polyMul } from '../pc40s/functions.ts';
import { us, math, task, wrong } from './common.ts';

const VAR = ['x', 'n', 'k', 'p', 'r', 'm', 'a', 'b'];

export const a2CubeBinomial = us('a2-cube-binomial', {
  levels: { 1: '(x ± b)³', 2: '(ax ± b)³', 3: 'Two variables' },
  generate(rng, level) {
    const v = rng.pick(VAR);
    const a = level === 1 ? 1 : rng.int(2, 4), b = rng.nonZero(-5, 5);
    const coefs = [a ** 3, 3 * a * a * b, 3 * a * b * b, b ** 3];
    if (level === 3) {
      const w = v === 'y' ? 'x' : 'y';
      const bb = Math.abs(b);
      const s = b < 0 ? '-' : '+';
      const t = (c: number, pv: number, pw: number) => `${c === 1 ? '' : c}${pv ? (pv === 1 ? v : `${v}^${pv}`) : ''}${pv && pw ? ' ' : ''}${pw ? (pw === 1 ? w : `${w}^${pw}`) : ''}`;
      const expr = `(${a === 1 ? '' : a}${v} ${s} ${bb === 1 ? '' : bb}${w})^3`;
      const ans = `${t(a ** 3, 3, 0)} ${s} ${t(3 * a * a * bb, 2, 1)} + ${t(3 * a * bb * bb, 1, 2)} ${s} ${t(bb ** 3, 0, 3)}`;
      const slip = `${t(a ** 3, 3, 0)} ${s} ${t(bb ** 3, 0, 3)}`;
      return task('Find each product.', 'Expand', expr, {
        answer: math(ans),
        distractors: wrong(math(ans), [slip, `${t(a ** 3, 3, 0)} ${s} ${t(a * a * bb, 2, 1)} + ${t(a * bb * bb, 1, 2)} ${s} ${t(bb ** 3, 0, 3)}`, `${t(a ** 3, 3, 0)} + ${t(3 * a * a * bb, 2, 1)} + ${t(3 * a * bb * bb, 1, 2)} + ${t(bb ** 3, 0, 3)}`].map(math)),
        solution: `Use ${math('(A + B)^3 = A^3 + 3A^2 B + 3A B^2 + B^3')}: ${math(ans)}.`,
      });
    }
    const expr = `(${poly([a, b], v)})^3`;
    const answer = poly(coefs, v);
    return task('Find each product.', 'Expand', expr, {
      answer: math(answer),
      distractors: wrong(math(answer), [poly([a ** 3, 0, 0, b ** 3], v), poly([a ** 3, a * a * b, a * b * b, b ** 3], v), poly([a ** 3, 3 * a * a * Math.abs(b), 3 * a * b * b, Math.abs(b) ** 3], v)].map(math)),
      solution: `Use ${math('(A + B)^3 = A^3 + 3A^2 B + 3A B^2 + B^3')} with ${math(`A = ${a === 1 ? '' : a}${v}`)} and ${math(`B = ${b}`)}: ${math(answer)}.`,
    });
  },
});

export const a2FactorCubes = us('a2-factor-cubes', {
  levels: { 1: 'x³ ± b³', 2: 'a³x³ ± b³', 3: 'With a common factor or two variables' },
  options: [radioOption('kind', 'Kind', [['sum', 'Sums'], ['diff', 'Differences'], ['both', 'Both']], ['both', 'both', 'both']), toggleOption('gcf', 'Include a common factor', [false, false, true])],
  generate(rng, level, o) {
    const v = rng.pick(VAR);
    const kind = optOne(o, 'kind', 'both') === 'both' ? rng.pick(['sum', 'diff']) : optOne(o, 'kind', 'sum');
    const s = kind === 'sum' ? 1 : -1;
    const a = level === 1 ? 1 : rng.int(1, 4), b = rng.int(1, 5);
    const g = optOn(o, 'gcf', false) ? rng.int(2, 5) : 1;
    const gT = g === 1 ? '' : String(g);
    const expr = poly([g * a ** 3, 0, 0, s * g * b ** 3], v);
    const lin = poly([a, s * b], v), quad = poly([a * a, -s * a * b, b * b], v);
    const answer = `${gT}(${lin})(${quad})`;
    return task('Factor each completely.', 'Factor completely:', expr, {
      answer: math(answer),
      distractors: wrong(math(answer), [`${gT}(${lin})(${poly([a * a, s * a * b, b * b], v)})`, `${gT}(${poly([a, -s * b], v)})(${poly([a * a, s * a * b, b * b], v)})`, `${gT}(${lin})(${poly([a * a, -s * 2 * a * b, b * b], v)})`, `${gT}(${lin})^3`].map(math)),
      solution: `${g > 1 ? `Factor out ${g}, then use` : 'Use'} ${math(kind === 'sum' ? 'A^3 + B^3 = (A + B)(A^2 - A B + B^2)' : 'A^3 - B^3 = (A - B)(A^2 + A B + B^2)')} with ${math(`A = ${a === 1 ? '' : a}${v}`)} and ${math(`B = ${b}`)}: ${math(answer)}.`,
    }, '');
  },
});

// ── Zeros of polynomials ─────────────────────────────────────────────────────

/** A conjugate pair p ± √q or p ± qi, with the quadratic it comes from. */
function conjugatePair(rng: Rng, complex: boolean): { text: string; one: string; quad: number[]; value: [number, number] } {
  const p = rng.int(-4, 4);
  if (complex) {
    const q = rng.int(1, 4);
    const qi = q === 1 ? 'i' : `${q}i`;
    return { text: `${p ? `${p} plus.minus ` : 'plus.minus '}${qi}`, one: `${p ? `${p} + ` : ''}${qi}`, quad: [1, -2 * p, p * p + q * q], value: [p, q] };
  }
  const r = rng.pick([2, 3, 5, 6, 7]);
  const s = new Surds([[1, r]]).typst();
  return { text: `${p ? `${p} plus.minus ` : 'plus.minus '}${s}`, one: `${p ? `${p} + ` : ''}${s}`, quad: [1, -2 * p, p * p - r], value: [p, r] };
}

export const a2ConjugateRoots = us('a2-conjugate-roots', {
  points: 2,
  levels: { 1: 'Cubic, irrational zero given', 2: 'Cubic, complex zero given', 3: 'Quartic' },
  options: [radioOption('kind', 'Given zero', [['irrational', 'Irrational'], ['complex', 'Complex'], ['either', 'Either']], ['irrational', 'complex', 'either'])],
  generate(rng, level, o) {
    const kindOpt = optOne(o, 'kind', 'either');
    const complex = kindOpt === 'either' ? rng.next() < 0.5 : kindOpt === 'complex';
    const pair = conjugatePair(rng, complex);
    const roots = level === 3 ? [rng.int(-5, 5), rng.int(-5, 5)] : [rng.int(-5, 5)];
    let coefs = pair.quad;
    for (const r of roots) coefs = polyMul(coefs, [1, -r]);
    const v = rng.pick(['x', 'x', 'n', 'k']);
    const answer = `${[...new Set(roots)].sort((a, b) => a - b).join(', ')}, ${pair.text}`;
    const flipped = `${roots.map((r) => -r).sort((a, b) => a - b).join(', ')}, ${pair.text}`;
    const conjOnly = `${[...new Set(roots)].sort((a, b) => a - b).join(', ')}, ${pair.one}`;
    const negPair = complex ? `${-pair.value[0]} plus.minus ${pair.value[1] === 1 ? '' : pair.value[1]}i` : `${-pair.value[0]} plus.minus sqrt(${pair.value[1]})`;
    return {
      body: `${math(pair.one)} is a zero of ${math(`f(${v}) = ${poly(coefs, v)}`)}. Find all the zeros.`,
      answer: math(answer),
      distractors: wrong(math(answer), [flipped, conjOnly, `${[...new Set(roots)].sort((a, b) => a - b).join(', ')}, ${negPair}`].map(math)),
      solution: `Zeros of the form ${math(complex ? 'a + b i' : 'a + sqrt(b)')} come in conjugate pairs, so ${math(pair.text)} are both zeros and ${math(`${poly(pair.quad, v)}`)} is a factor. Dividing leaves ${math(poly(polyMul([1], roots.reduce((c, r) => polyMul(c, [1, -r]), [1])), v))}, which gives ${math(roots.join(', '))}.`,
    };
  },
});

export const a2ConjugateWrite = us('a2-conjugate-write', {
  points: 2,
  levels: { 1: 'One rational zero and an irrational zero', 2: 'One rational zero and a complex zero', 3: 'Two zeros that need conjugates' },
  generate(rng, level) {
    const v = 'x';
    const pairs = level === 3 ? [conjugatePair(rng, false), conjugatePair(rng, true)] : [conjugatePair(rng, level === 2)];
    const rational = level === 3 ? [] : [rng.int(-5, 5)];
    let coefs = [1];
    for (const pr of pairs) coefs = polyMul(coefs, pr.quad);
    for (const r of rational) coefs = polyMul(coefs, [1, -r]);
    const zeros = [...rational.map(String), ...pairs.map((pr) => pr.one)].join(', ');
    const answer = `f(${v}) = ${poly(coefs, v)}`;
    // Wrong: forgetting the conjugate (not a real polynomial), or a sign slip in a factor.
    let slip = [1];
    for (const pr of pairs) slip = polyMul(slip, [1, pr.quad[1], -pr.quad[2] + 2 * pr.value[0] ** 2]);
    for (const r of rational) slip = polyMul(slip, [1, r]);
    let noConj = [1];
    for (const r of rational) noConj = polyMul(noConj, [1, -r]);
    for (const pr of pairs) noConj = polyMul(noConj, [1, -pr.value[0]]);
    return {
      body: `Write a polynomial function of least degree with integral coefficients that has the given zeros: ${math(zeros)}.`,
      answer: math(answer),
      distractors: wrong(math(answer), [slip, noConj, polyMul(coefs, [1, 1]).slice(0, coefs.length)].map((c) => math(`f(${v}) = ${poly(c, v)}`))),
      solution: `Include each conjugate: the zeros are ${math([...rational.map(String), ...pairs.map((pr) => pr.text)].join(', '))}. Multiply the factors: ${math(answer)}.`,
    };
  },
});

function signChanges(coefs: number[]): number {
  const nz = coefs.filter((c) => c !== 0);
  return nz.slice(1).reduce((n, c, i) => n + (Math.sign(c) !== Math.sign(nz[i]) ? 1 : 0), 0);
}
const possible = (n: number) => Array.from({ length: Math.floor(n / 2) + 1 }, (_, i) => n - 2 * i).join(' "or" ');

export const a2Descartes = us('a2-descartes', {
  levels: { 1: 'Degree 3', 2: 'Degree 4', 3: 'Degree 5 or 6' },
  generate(rng, level) {
    const degree = level === 1 ? 3 : level === 2 ? 4 : rng.int(5, 6);
    const coefs = Array.from({ length: degree + 1 }, (_, i) => (i === 0 ? rng.int(1, 4) : rng.next() < 0.2 ? 0 : rng.nonZero(-9, 9)));
    if (coefs[degree] === 0) coefs[degree] = rng.nonZero(-9, 9);
    const negCoefs = coefs.map((c, i) => ((degree - i) % 2 ? -c : c));
    const pos = signChanges(coefs), neg = signChanges(negCoefs);
    const answer = `"Positive:" ${possible(pos)}; "Negative:" ${possible(neg)}`;
    return {
      body: `State the possible number of positive and negative real zeros of ${math(`f(x) = ${poly(coefs)}`)}.`,
      task: { instruction: 'State the possible number of positive real zeros and negative real zeros of each function.', item: math(`f(x) = ${poly(coefs)}`) },
      answer: math(answer),
      distractors: wrong(math(answer), [`"Positive:" ${possible(neg)}; "Negative:" ${possible(pos)}`, `"Positive:" ${pos}; "Negative:" ${neg}`, `"Positive:" ${possible(pos + 1)}; "Negative:" ${possible(Math.max(0, neg - 1))}`].map(math)),
      solution: `${math('f(x)')} has ${pos} sign change${pos === 1 ? '' : 's'}, and ${math(`f(-x) = ${poly(negCoefs)}`)} has ${neg}. Each count may drop by an even number.`,
    };
  },
});

function divisors(n: number): number[] {
  const out: number[] = [];
  for (let d = 1; d <= Math.abs(n); d++) if (n % d === 0) out.push(d);
  return out;
}

export const a2RationalRoots = us('a2-rational-roots', {
  levels: { 1: 'Leading coefficient 1', 2: 'Leading coefficient 2 or 3', 3: 'Any leading coefficient' },
  generate(rng, level) {
    const lead = level === 1 ? 1 : level === 2 ? rng.int(2, 3) : rng.pick([2, 3, 4, 6]);
    const constant = rng.pick([2, 3, 4, 5, 6, 8, 9, 10, 12, 15]) * rng.sign();
    const coefs = [lead, rng.int(-9, 9), rng.int(-9, 9), constant];
    const ps = divisors(constant), qs = divisors(lead);
    const cands = [...new Map(ps.flatMap((pp) => qs.map((qq) => [pp / qq, new Q(pp, qq)] as const))).values()].sort((a, b) => a.value - b.value);
    const list = (qsList: Q[]) => `plus.minus ${qsList.map((q) => q.typst()).join(", ")}`.replace(/, /g, ', plus.minus ');
    const answer = list(cands);
    const inverted = [...new Map(ps.flatMap((pp) => qs.map((qq) => [qq / pp, new Q(qq, pp)] as const))).values()].sort((a, b) => a.value - b.value);
    return {
      body: `List all possible rational zeros of ${math(`f(x) = ${poly(coefs)}`)}.`,
      task: { instruction: 'State the possible rational zeros of each function.', item: math(`f(x) = ${poly(coefs)}`) },
      answer: math(answer),
      distractors: wrong(math(answer), [list(inverted), list(ps.map((pp) => new Q(pp))), cands.map((q) => q.typst()).join(', ')].map(math)),
      solution: `Possible rational zeros are ${math('p/q')}, with ${math('p')} a factor of the constant term ${math(String(constant))} and ${math('q')} a factor of the leading coefficient ${math(String(lead))}: ${math(answer)}.`,
    };
  },
});

export const a2FundamentalTheorem = us('a2-fundamental-theorem', {
  points: 2,
  levels: { 1: 'Cubic with one rational zero', 2: 'Quartic with two rational zeros', 3: 'Quartic, rational and complex zeros' },
  generate(rng, level) {
    const roots = level === 1 ? [rng.int(-5, 5)] : [rng.int(-5, 5), rng.int(-5, 5)];
    const pair = conjugatePair(rng, level !== 2 || rng.next() < 0.5);
    let coefs = pair.quad;
    for (const r of roots) coefs = polyMul(coefs, [1, -r]);
    const sorted = [...new Set(roots)].sort((a, b) => a - b);
    const answer = `${sorted.join(', ')}, ${pair.text}`;
    return {
      body: `Find all zeros of ${math(`f(x) = ${poly(coefs)}`)}.`,
      task: { instruction: 'Find all zeros of each function.', item: math(`f(x) = ${poly(coefs)}`) },
      answer: math(answer),
      distractors: wrong(math(answer), [`${sorted.map((r) => -r).join(', ')}, ${pair.text}`, sorted.join(', '), `${sorted.join(', ')}, ${pair.one}`].map(math)),
      solution: `Test possible rational zeros with synthetic division to find ${math(sorted.join(', '))}. The quotient ${math(poly(pair.quad))} gives ${math(pair.text)} by the quadratic formula. A polynomial of degree ${coefs.length - 1} has ${coefs.length - 1} zeros, counting multiplicity.`,
    };
  },
});

// ── Rational exponents and complex fractions ─────────────────────────────────

export const a2RationalExponentEquations = us('a2-rational-exponent-equations', {
  levels: { 1: 'x^(m/n) = k', 2: '(ax + b)^(m/n) = k', 3: 'Even numerators (two solutions or none)' },
  generate(rng, level) {
    const v = rng.pick(['x', 'n', 'k', 'p', 'r', 'm']);
    const den = rng.pick([2, 3]), num = level === 3 ? 2 * rng.int(1, 2) : rng.pick(den === 2 ? [1, 3, 5] : [1, 2, 4]);
    if (gcd(num, den) > 1) return a2RationalExponentEquations.generate(rng, level);
    const base = rng.int(2, den === 2 ? 5 : 3);
    const k = base ** num;
    const u = base ** den; // the value of the bracket
    const e = `(${num}/${den})`;
    const even = num % 2 === 0;
    if (level === 1) {
      const ans = even ? `${v} = plus.minus ${u}` : `${v} = ${u}`;
      return task('Solve each equation.', 'Solve', `${v}^${e} = ${k}`, {
        answer: math(ans),
        // Multiplying by the reciprocal exponent, stopping at the base, or a lost (or extra) ±.
        distractors: wrong(math(ans), [`${v} = ${new Q(k * den, num).typst()}`, `${v} = ${base}`, even ? `${v} = ${u}` : `${v} = plus.minus ${u}`].map(math)),
        solution: `Raise both sides to the power ${math(`${den}/${num}`)}: ${math(`${v} = ${k}^(${den}/${num}) = ${even ? 'plus.minus ' : ''}${u}`)}.`,
      });
    }
    const a = rng.int(1, 3), b = rng.int(-9, 9);
    const sol1 = new Q(u - b, a), sol2 = new Q(-u - b, a);
    const ans = even ? `${v} = ${sol1.typst()}, ${sol2.typst()}` : `${v} = ${sol1.typst()}`;
    return task('Solve each equation.', 'Solve', `(${poly([a, b], v)})^${e} = ${k}`, {
      answer: math(ans),
      distractors: wrong(math(ans), [`${v} = ${new Q(u + b, a).typst()}`, even ? `${v} = ${sol1.typst()}` : `${v} = ${sol1.typst()}, ${sol2.typst()}`, `${v} = ${new Q(k - b, a).typst()}`].map(math)),
      solution: `Raise both sides to the power ${math(`${den}/${num}`)}: ${math(`${poly([a, b], v)} = ${even ? 'plus.minus ' : ''}${u}`)}, so ${math(ans)}.`,
    });
  },
});

export const a2ComplexFractions = us('a2-complex-fractions', {
  levels: { 1: 'Numbers', 2: 'One variable', 3: 'Two variables' },
  generate(rng, level) {
    if (level === 1) {
      const a = new Q(rng.int(1, 5), rng.int(2, 6)), b = new Q(rng.int(1, 5), rng.int(2, 6)), c = new Q(rng.int(1, 9), rng.int(2, 9));
      const expr = `(${a.typst()} + ${b.typst()})/(${c.typst()})`;
      const value = a.add(b).div(c);
      return task('Simplify each expression.', 'Simplify', expr, {
        answer: math(value.typst()),
        distractors: wrong(math(value.typst()), [a.add(b).mul(c), new Q(a.n + b.n, a.d + b.d).div(c), c.div(a.add(b))].map((q) => math(q.typst()))),
        solution: `Simplify the numerator to ${math(a.add(b).typst())}, then divide by ${math(c.typst())}: ${math(value.typst())}.`,
      });
    }
    const v = 'x';
    if (level === 2) {
      // (a/x + b)/(c/x − d) = (a + bx)/(c − dx)
      const a = rng.int(1, 9), b = rng.int(1, 9), c = rng.int(1, 9), d = rng.int(1, 9);
      const expr = `(${a}/${v} + ${b})/(${c}/${v} - ${d})`;
      const k = (n: number) => (n === 1 ? v : `${n}${v}`);
      const ans = `(${k(b)} + ${a})/(${c} - ${k(d)})`;
      return task('Simplify each expression.', 'Simplify', expr, {
        answer: math(ans),
        distractors: wrong(math(ans), [`(${a} + ${b})/(${c} - ${d})`, `(${k(a)} + ${b})/(${k(c)} - ${d})`, `(${k(b)} + ${a})/(${k(d)} - ${c})`].map(math)),
        solution: `Multiply the numerator and the denominator by ${math(v)}: ${math(ans)}.`,
      });
    }
    const a = rng.int(1, 5), b = rng.int(1, 5);
    const k = (n: number, w: string) => (n === 1 ? w : `${n}${w}`);
    const expr = `(${a}/x + ${b}/y)/(1/x - 1/y)`;
    const ans = `(${k(a, 'y')} + ${k(b, 'x')})/(y - x)`;
    return task('Simplify each expression.', 'Simplify', expr, {
      answer: math(ans),
      distractors: wrong(math(ans), [`(${k(a, 'y')} + ${k(b, 'x')})/(x - y)`, `(${k(a, 'x')} + ${k(b, 'y')})/(y - x)`, `${a + b}/(y - x)`].map(math)),
      solution: `Multiply the numerator and the denominator by the common denominator ${math('x y')}: ${math(ans)}.`,
    });
  },
});

export const ALGEBRA_2_POLYNOMIALS = [a2CubeBinomial, a2FactorCubes, a2ConjugateRoots, a2ConjugateWrite, a2Descartes, a2RationalRoots, a2FundamentalTheorem, a2RationalExponentEquations, a2ComplexFractions];
