import type { Rng } from '../../rng.ts';
import { round, sub } from '../../format.ts';
import { Q } from '../../exact.ts';
import { graphTypst } from '../../graph.ts';
import { math, pc40s } from './common.ts';
import { optNum, optOn, optOne, radioOption, sizeOption, toggleOption } from '../../options.ts';
import type { GenOptions } from '../../types.ts';
import { factoredText, fromRoots, poly, polyEval, polyMul, synthetic } from './functions.ts';

/** Distinct integer roots in a range. */
function roots(rng: Rng, count: number, lo = -5, hi = 5): number[] {
  const out = new Set<number>();
  while (out.size < count) out.add(rng.int(lo, hi));
  return [...out];
}

/** `x = -2, 1, 3` from a list of numbers. */
const rootList = (rs: number[]) => `x = ${[...new Set(rs)].sort((a, b) => a - b).map((r) => new Q(r * 1000, 1000).typst()).join(', ')}`;

/** A synthetic division table as Typst markup. */
function syntheticTable(p: number[], a: number): string {
  const { quotient, remainder } = synthetic(p, a);
  const bottom = [...quotient, remainder];
  const middle = ['', ...bottom.slice(0, -1).map((c) => String(c * a))];
  const cell = (v: string | number) => `[$${v}$]`;
  const cols = p.length + 1;
  return `#table(columns: ${cols}, stroke: none, align: center, inset: 4pt, table.vline(x: 1), table.hline(y: 2, start: 1), ${cell(a)}, ${p.map(cell).join(', ')}, [], ${middle.map(cell).join(', ')}, [], ${bottom.map(cell).join(', ')})`;
}

export const polyDivide = pc40s('40s-poly-divide', {
  levels: { 1: 'Cubic by x − a', 2: 'Quartic with missing terms', 3: 'Leading coefficient other than 1' },
  options: [
    radioOption('degree', 'Degree', [['3', 'Cubic'], ['4', 'Quartic']], ['3', '4', '3']),
    radioOption('lead', 'Leading coefficient', [['1', '1'], ['any', 'Other than 1']], ['1', '1', 'any']),
    toggleOption('missing', 'Include missing terms (zero coefficients)', [false, true, false]),
    sizeOption([2, 3, 4, 6], [4, 4, 4], 'Size of a in x − a'),
  ],
  generate(rng, difficulty, o) {
    const A = optNum(o, 'size', 4);
    const a = rng.nonZero(-A, A);
    const degree = optNum(o, 'degree', difficulty === 2 ? 4 : 3);
    const lead = optOne(o, 'lead', difficulty === 3 ? 'any' : '1') === 'any' ? rng.pick([2, 3, -2, -1]) : 1;
    const missing = optOn(o, 'missing', difficulty === 2);
    // Coefficients below the leading one; with missing terms, every other one is zero.
    const p = [lead, ...Array.from({ length: degree }, (_, i) => (missing && i % 2 === 0 ? 0 : rng.int(-9, 9)))];
    if (missing && p.slice(1).every((c) => c === 0)) p[p.length - 1] = rng.nonZero(-9, 9);
    const { quotient, remainder } = synthetic(p, a);
    const divisor = `x ${a > 0 ? '-' : '+'} ${Math.abs(a)}`;
    const answer = `Q(x) = ${poly(quotient)}, R = ${remainder}`;
    const wrongA = synthetic(p, -a);
    return {
      body: `Divide ${math(`P(x) = ${poly(p)}`)} by ${math(divisor)}. State the quotient and the remainder.`,
      answer: math(answer),
      distractors: [
        `Q(x) = ${poly(wrongA.quotient)}, R = ${wrongA.remainder}`,
        `Q(x) = ${poly(quotient)}, R = ${-remainder === remainder ? remainder + 1 : -remainder}`,
        `Q(x) = ${poly([...quotient.slice(0, -1), quotient[quotient.length - 1] + a])}, R = ${remainder + a}`,
      ].filter((d, i, all) => d !== answer && all.indexOf(d) === i).map(math),
      solution: `Synthetic division by ${math(String(a))}${missing ? ' (with zeros for the missing terms)' : ''}:\n\n${syntheticTable(p, a)}\n\nSo ${math(answer)}, i.e. ${math(`P(x) = (${divisor})(${poly(quotient)}) ${remainder < 0 ? '-' : '+'} ${Math.abs(remainder)}`)}.`,
    };
  },
});

export const polyRemainder = pc40s('40s-poly-remainder', {
  points: 1,
  levels: { 1: 'Cubic', 2: 'Quartic', 3: 'Divisor of the form bx − a' },
  options: [
    radioOption('degree', 'Degree', [['3', 'Cubic'], ['4', 'Quartic']], ['3', '4', '4']),
    radioOption('divisor', 'Divisor', [['x', 'x − a'], ['bx', '2x − a']], ['x', 'x', 'bx']),
  ],
  generate(rng, difficulty, o) {
    const p = optNum(o, 'degree', difficulty === 1 ? 3 : 4) === 3 ? [rng.nonZero(-3, 3), rng.int(-6, 6), rng.int(-9, 9), rng.int(-9, 9)] : [rng.nonZero(-2, 2), rng.int(-5, 5), rng.int(-6, 6), rng.int(-6, 6), rng.int(-9, 9)];
    const bx = optOne(o, 'divisor', difficulty === 3 ? 'bx' : 'x') === 'bx';
    const b = bx ? 2 : 1;
    const a = bx ? rng.pick([1, -1, 3, -3]) : rng.nonZero(-3, 3);
    const x = new Q(a, b);
    // P(a/b) as an exact fraction.
    const value = p.reduce((acc, c) => acc.mul(x).add(c), new Q(0));
    const divisor = b === 1 ? `x ${a > 0 ? '-' : '+'} ${Math.abs(a)}` : `2x ${a > 0 ? '-' : '+'} ${Math.abs(a)}`;
    const wrong = p.reduce((acc, c) => acc.mul(x.neg()).add(c), new Q(0));
    return {
      body: `Use the remainder theorem to find the remainder when ${math(poly(p))} is divided by ${math(divisor)}.`,
      answer: math(value.typst()),
      distractors: [wrong, value.neg(), value.add(p[p.length - 1]), new Q(p.reduce((s, c) => s + c, 0))].filter((w) => !w.eq(value)).map((w) => w.typst()).filter((d, i, all) => all.indexOf(d) === i).map(math),
      solution: `The remainder is ${math(`P(${x.typst()})`)}: ${math(`P(${x.typst()}) = ${value.typst()}`)}.`,
    };
  },
});

export const polyRemainderUnknown = pc40s('40s-poly-remainder-unknown', {
  levels: { 1: 'Unknown constant term', 2: 'Unknown coefficient', 3: 'Make x − a a factor' },
  options: [
    radioOption('form', 'Find k so that', [['1', 'Unknown constant term'], ['2', 'Unknown coefficient'], ['3', 'Make x − a a factor']], ['1', '2', '3']),
    sizeOption([2, 3, 4], [3, 3, 3], 'Size of a in x − a'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const A = optNum(o, 'size', 3);
    const a = rng.nonZero(-A, A), k = rng.int(-8, 8);
    const coefs = [1, rng.int(-5, 5), rng.int(-6, 6), rng.int(-9, 9)];
    const slot = difficulty === 1 ? 3 : rng.pick([1, 2]);
    coefs[slot] = k;
    const R = difficulty === 3 ? 0 : polyEval(coefs, a);
    if (difficulty === 3) coefs[3] -= polyEval(coefs, a); // shift the constant so x − a is a factor with this k
    const shown = coefs.map((c, i) => (i === slot ? NaN : c));
    const terms = shown.map((c, i) => {
      const power = 3 - i;
      const v = power === 0 ? '' : power === 1 ? 'x' : `x^${power}`;
      // `k x^2`, not `kx^2`: Typst reads adjacent letters as one variable name.
      if (Number.isNaN(c)) return { text: v ? `k ${v}` : 'k', sign: '+' };
      if (c === 0) return null;
      return { text: `${Math.abs(c) === 1 && v ? '' : Math.abs(c)}${v}`, sign: c < 0 ? '-' : '+' };
    }).filter((t): t is { text: string; sign: string } => t !== null);
    const pText = terms.map((t, i) => (i === 0 ? (t.sign === '-' ? `-${t.text}` : t.text) : ` ${t.sign} ${t.text}`)).join('');
    const power = 3 - slot;
    const divisor = `x ${a > 0 ? '-' : '+'} ${Math.abs(a)}`;
    const others = coefs.reduce((acc, c, i) => acc + (i === slot ? 0 : c * a ** (3 - i)), 0);
    return {
      body: difficulty === 3
        ? `Find the value of ${math('k')} so that ${math(divisor)} is a factor of ${math(`P(x) = ${pText}`)}.`
        : `When ${math(`P(x) = ${pText}`)} is divided by ${math(divisor)}, the remainder is ${math(String(R))}. Find ${math('k')}.`,
      answer: math(`k = ${k}`),
      // Sign slips when isolating k, forgetting to divide by the power of a, or off by one.
      distractors: [new Q(R + others, a ** power), new Q(-(R - others), a ** power), new Q(R - others, -(a ** power) || 1), new Q(k + 1), new Q(-k), new Q(R - others)].filter((w) => !w.eq(k)).map((w) => w.typst()).filter((d, i, all) => all.indexOf(d) === i).map((w) => math(`k = ${w}`)),
      solution: `By the remainder theorem, ${math(`P(${a}) = ${R}`)}: ${math(`${a ** power === 1 ? '' : a ** power === -1 ? '-' : a ** power}k ${others < 0 ? '-' : '+'} ${Math.abs(others)} = ${R}`)}, so ${math(`k = ${k}`)}.`,
    };
  },
});

export const polyFactorTheorem = pc40s('40s-poly-factor-theorem', {
  points: 1,
  levels: { 1: 'Cubic', 2: 'Quartic', 3: 'Factors of the form bx − a' },
  options: [
    radioOption('degree', 'Degree', [['3', 'Cubic'], ['4', 'Quartic']], ['3', '4', '3']),
    radioOption('divisor', 'The possible factor', [['x', 'x − a'], ['bx', '2x − 1']], ['x', 'x', 'bx']),
  ],
  generate(rng, difficulty, o) {
    const isFactor = rng.next() < 0.5;
    const degree = optNum(o, 'degree', difficulty === 1 ? 3 : difficulty === 2 ? 4 : 3);
    const rs = roots(rng, degree);
    let p = fromRoots(rs);
    let test = new Q(isFactor ? rng.pick(rs) : rng.pick([-5, -4, -3, -2, -1, 1, 2, 3, 4, 5].filter((v) => !rs.includes(v))));
    if (optOne(o, 'divisor', difficulty === 3 ? 'bx' : 'x') === 'bx') {
      p = polyMul([2, isFactor ? -1 : -3], fromRoots(rs.slice(0, degree - 1)));
      test = new Q(1, 2);
    }
    const value = p.reduce((acc, c) => acc.mul(test).add(c), new Q(0));
    const factor = test.isInt ? `x ${test.value > 0 ? '-' : '+'} ${Math.abs(test.value)}` : '2x - 1';
    const verdict = (yes: boolean, v: string) => `${yes ? 'Yes' : 'No'}: ${math(`P(${test.typst()}) = ${v}`)}`;
    const answer = verdict(value.eq(0), value.typst());
    return {
      body: `Is ${math(factor)} a factor of ${math(`P(x) = ${poly(p)}`)}?`,
      answer,
      distractors: [verdict(!value.eq(0), value.typst()), verdict(!value.eq(0), value.eq(0) ? '1' : '0'), verdict(value.eq(0), value.eq(0) ? '0' : value.neg().typst())].filter((d, i, all) => d !== answer && all.indexOf(d) === i),
      solution: `By the factor theorem, ${math(factor)} is a factor exactly when ${math(`P(${test.typst()}) = 0`)}. ${math(`P(${test.typst()}) = ${value.typst()}`)}, so it ${value.eq(0) ? 'is' : 'is not'} a factor.`,
    };
  },
});

/** Options shared by factoring and solving. */
const FACTOR_OPTIONS = [
  radioOption('degree', 'Degree', [['3', 'Cubic'], ['4', 'Quartic'], ['either', 'Either']], ['3', 'either', '3']),
  radioOption('repeated', 'Repeated factors', [['never', 'Never'], ['sometimes', 'Sometimes'], ['always', 'Always']], ['never', 'sometimes', 'never']),
  toggleOption('rational', 'Include a rational zero (a factor like 2x − 1)', [false, false, true]),
  sizeOption([3, 4, 5, 6, 8], [5, 4, 5], 'Size of the zeros'),
];

/** A polynomial with integer zeros (and optionally one half-integer zero), as zeros, factored text, and coefficients. */
function factorable(rng: Rng, difficulty: number, o?: GenOptions) {
  const degreeOpt = optOne(o, 'degree', difficulty === 2 ? 'either' : '3');
  const n = degreeOpt === 'either' ? rng.pick([3, 4]) : Number(degreeOpt);
  const rep = optOne(o, 'repeated', difficulty === 2 ? 'sometimes' : 'never');
  const repeated = rep === 'always' || (rep === 'sometimes' && rng.next() < 0.5);
  const rational = optOn(o, 'rational', difficulty === 3);
  const N = optNum(o, 'size', difficulty === 2 ? 4 : 5);
  const ints = n - (rational ? 1 : 0);
  // Integer zeros, with the first one doubled when a repeated factor is wanted.
  const intRoots = repeated && ints >= 2 ? (() => { const d = roots(rng, ints - 1, -N, N); return [d[0], ...d]; })() : roots(rng, ints, -N, N);
  if (!rational) return { rs: intRoots, text: factoredText(intRoots), p: fromRoots(intRoots) };
  const q = rng.pick([1, -1, 3, -3]);
  const lead = `(2x ${q > 0 ? '-' : '+'} ${Math.abs(q)})`;
  return { rs: [...intRoots, q / 2], text: `${lead}${factoredText(intRoots)}`, p: polyMul([2, -q], fromRoots(intRoots)) };
}

export const polyFactor = pc40s('40s-poly-factor', {
  levels: { 1: 'Cubics with integer zeros', 2: 'Quartics or a repeated factor', 3: 'A factor of the form 2x − b' },
  options: FACTOR_OPTIONS,
  generate(rng, difficulty, o) {
    const { rs, text, p } = factorable(rng, difficulty, o);
    const rational = !rs.every(Number.isInteger);
    const flipped = factoredText(rs.filter(Number.isInteger).map((r) => -r));
    const intRoots = rs.filter(Number.isInteger);
    return {
      body: `Factor completely: ${math(`P(x) = ${poly(p)}`)}`,
      answer: math(`P(x) = ${text}`),
      distractors: [
        rational ? `(2x ${rs[rs.length - 1] > 0 ? '+' : '-'} ${Math.abs(rs[rs.length - 1] * 2)})${flipped}` : flipped,
        factoredText([...intRoots.slice(0, -1), -intRoots[intRoots.length - 1]]),
        factoredText(intRoots.map((r, i) => (i === 0 ? r + 1 : r))),
      ].filter((d) => d !== text).map((d) => math(`P(x) = ${d}`)),
      solution: `Test factors of the constant term with the factor theorem. ${math(`P(${intRoots[0]}) = 0`)}, so ${math(`(x ${intRoots[0] > 0 ? '-' : '+'} ${Math.abs(intRoots[0])})`)} is a factor${intRoots[0] === 0 ? ' (x itself)' : ''}. Divide and factor the quotient: ${math(`P(x) = ${text}`)}.`,
    };
  },
});

export const polySolve = pc40s('40s-poly-solve', {
  levels: { 1: 'Cubics with integer roots', 2: 'Quartics or a repeated root', 3: 'A rational root' },
  options: FACTOR_OPTIONS,
  generate(rng, difficulty, o) {
    const { rs, text, p } = factorable(rng, difficulty, o);
    const answer = rootList(rs);
    return {
      body: `Solve: ${math(`${poly(p)} = 0`)}`,
      answer: math(answer),
      // Signs flipped, a lost rational root, one root off by one, or one sign flipped.
      distractors: [rootList(rs.map((r) => -r)), rootList(rs.filter(Number.isInteger)), rootList(rs.map((r, i) => (i === 0 ? r + 1 : r))), rootList(rs.map((r, i) => (i === rs.length - 1 ? -r : r)))]
        .filter((d, i, all) => d !== answer && all.indexOf(d) === i).map(math),
      solution: `Factor: ${math(`${text} = 0`)}. Set each factor to zero: ${math(answer)}.`,
    };
  },
});

export const polyZerosMultiplicity = pc40s('40s-poly-zeros-multiplicity', {
  levels: { 1: 'Zeros and multiplicities', 2: 'y-intercept too', 3: 'Behaviour at each zero' },
  options: [
    radioOption('form', 'State', [['1', 'Zeros and multiplicities'], ['2', 'y-intercept too'], ['3', 'Behaviour at each zero']], ['1', '2', '3']),
    toggleOption('lead', 'Leading coefficient other than 1', [false, true, true]),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const [r, s, t] = roots(rng, 3);
    const mults = rng.shuffle([1, 2, 3]).slice(0, rng.pick([2, 3]));
    const rootsWithMult = [r, s, t].slice(0, mults.length).map((z, i) => [z, mults[i]] as const);
    const lead = optOn(o, 'lead', difficulty > 1) ? rng.pick([-2, -1, 2, 3]) : 1;
    const all = rootsWithMult.flatMap(([z, m]) => Array(m).fill(z) as number[]);
    const text = factoredText(all, lead);
    const describe = (z: number, m: number) => difficulty === 3
      ? `x = ${z}: ${m % 2 === 0 ? '"touches"' : m === 1 ? '"crosses"' : '"crosses (flattens)"'}`
      : `x = ${z} med ("multiplicity" ${m})`;
    const answer = rootsWithMult.sort((a, b) => a[0] - b[0]).map(([z, m]) => describe(z, m)).join(', ');
    const yInt = lead * all.reduce((acc, z) => acc * -z, 1);
    const wrongMult = rootsWithMult.map(([z, m]) => describe(z, m === 1 ? 2 : 1)).join(', ');
    const wrongSign = rootsWithMult.map(([z, m]) => describe(-z, m)).join(', ');
    return {
      body: difficulty === 3
        ? `For ${math(`P(x) = ${text}`)}, state the zeros and describe the behaviour of the graph at each zero.`
        : `For ${math(`P(x) = ${text}`)}, state the zeros and their multiplicities${difficulty === 2 ? ', and the y-intercept' : ''}.`,
      answer: math(answer + (difficulty === 2 ? `; y"-intercept" ${yInt}` : '')),
      distractors: [wrongSign, wrongMult, rootsWithMult.map(([z, m]) => describe(-z, m === 1 ? 2 : 1)).join(', ')].map((d) => math(d + (difficulty === 2 ? `; y"-intercept" ${difficulty === 2 ? -yInt : yInt}` : ''))),
      solution: `Each factor ${math('(x - a)^m')} gives a zero ${math('x = a')} of multiplicity ${math('m')}. ${difficulty === 3 ? 'The graph crosses the x-axis at a zero of odd multiplicity (flattening if the multiplicity is 3) and touches it at a zero of even multiplicity. ' : ''}${difficulty === 2 ? `The y-intercept is ${math(`P(0) = ${yInt}`)}. ` : ''}${math(answer)}.`,
    };
  },
});

const QUADRANTS = { up: 'I', down: 'IV', leftUp: 'II', leftDown: 'III' };

export const polyEndBehaviour = pc40s('40s-poly-end-behaviour', {
  points: 1,
  levels: { 1: 'From standard form', 2: 'From factored form', 3: 'Hidden leading sign, e.g. (3 − x)' },
  options: [radioOption('form', 'Given in', [['standard', 'Standard form'], ['factored', 'Factored form'], ['hidden', 'Factored, with a factor like (3 − x)']], ['standard', 'factored', 'hidden'])],
  generate(rng, gl, o) {
    const form = optOne(o, 'form', gl === 1 ? 'standard' : gl === 2 ? 'factored' : 'hidden');
    const difficulty = form === 'standard' ? 1 : form === 'factored' ? 2 : 3;
    const degree = rng.int(2, 5);
    const leadSign = rng.pick([1, -1]);
    let given: string;
    if (difficulty === 1) {
      const coefs = Array.from({ length: degree + 1 }, (_, i) => (i === 0 ? leadSign * rng.int(1, 4) : rng.int(-6, 6)));
      given = poly(coefs);
    } else {
      const rs = roots(rng, degree, -4, 4);
      if (difficulty === 2) given = factoredText(rs, leadSign * rng.int(1, 2));
      else {
        // Write one factor as (a − x), which flips the sign of the leading coefficient.
        const [first, ...rest] = rs;
        given = `(${first} - x)${factoredText(rest, leadSign * -1)}`.replace('(0 - x)', '(-x)');
      }
    }
    const rightEnd = leadSign > 0 ? QUADRANTS.up : QUADRANTS.down;
    const leftEnd = degree % 2 === 0 ? (leadSign > 0 ? QUADRANTS.leftUp : QUADRANTS.leftDown) : (leadSign > 0 ? QUADRANTS.leftDown : QUADRANTS.leftUp);
    const phrase = (l: string, r: string) => `"Extends from quadrant ${l} to quadrant ${r}"`;
    const answer = phrase(leftEnd, rightEnd);
    const all = [phrase('III', 'I'), phrase('II', 'IV'), phrase('II', 'I'), phrase('III', 'IV')];
    return {
      body: `Describe the end behaviour of the graph of ${math(`y = ${given}`)}.`,
      answer: math(answer),
      distractors: all.filter((d) => d !== answer).map(math),
      solution: `The degree is ${degree} (${degree % 2 === 0 ? 'even' : 'odd'}) and the leading coefficient is ${leadSign > 0 ? 'positive' : 'negative'}${difficulty === 3 ? ` (the ${math('-x')} in the first factor makes it so)` : ''}. ${degree % 2 === 0 ? 'Both ends point the same way' : 'The ends point opposite ways'}: ${math(answer)}.`,
    };
  },
});

const POLYNOMIALS = ['3x^4 - x + 2', '-5', 'x/2 + 7', 'sqrt(2) x^3 - x', '(x - 1)^2 (x + 4)', '0.5x^5'];
const NOT_POLYNOMIALS = ['sqrt(x) + 1', '2^x', '3/x', 'x^(-2) + 1', 'x^(1/2) - 4', '|x| + 2', '1/(x^2 + 1)'];

export const polyIdentify = pc40s('40s-poly-identify', {
  points: 1,
  levels: { 1: 'One polynomial among four', 2: 'Two polynomials among four', 3: 'Tricky forms' },
  options: [
    radioOption('form', 'Polynomials among the four', [['1', 'One polynomial among four'], ['2', 'Two polynomials among four'], ['3', 'Tricky forms']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const yes = difficulty === 2 ? 2 : 1;
    const pool = difficulty === 3 ? { p: ['sqrt(2) x^3 - x', 'x/2 + 7', '-5'], n: ['x^(1/2) - 4', 'x^(-2) + 1', '3/x'] } : { p: POLYNOMIALS, n: NOT_POLYNOMIALS };
    const picks = [...rng.shuffle(pool.p).slice(0, yes).map((f) => [f, true] as const), ...rng.shuffle(pool.n).slice(0, 4 - yes).map((f) => [f, false] as const)];
    const listed = rng.shuffle(picks);
    const labels = ['i', 'ii', 'iii', 'iv'];
    const correct = labels.filter((_, i) => listed[i][1]);
    const combos = [['i'], ['ii'], ['iii'], ['iv'], ['i', 'ii'], ['i', 'iii'], ['ii', 'iv'], ['iii', 'iv'], ['i', 'iv'], ['ii', 'iii']];
    const text = (ls: string[]) => ls.map((l) => `(${l})`).join(' and ');
    return {
      body: `Which of these are polynomial functions?\n\n${listed.map(([f], i) => `(${labels[i]}) ${math(`y = ${f}`)}`).join(' #h(1.5em) ')}`,
      answer: text(correct),
      distractors: combos.filter((c) => c.join() !== correct.join()).slice(0, 6).map(text),
      solution: `A polynomial function has only whole-number exponents on ${math('x')} (no roots of ${math('x')}, no ${math('x')} in a denominator or an exponent, no absolute values). ${listed.map(([f, ok], i) => `(${labels[i]}) ${ok ? 'is' : 'is not'} a polynomial`).join('; ')}.`,
    };
  },
});

export const polyWrite = pc40s('40s-poly-write', {
  levels: { 1: 'Zeros and the leading coefficient', 2: 'Zeros and a point', 3: 'A repeated zero and a point' },
  options: [
    radioOption('given', 'Also given', [['lead', 'The leading coefficient'], ['point', 'A point on the graph']], ['lead', 'point', 'point']),
    toggleOption('repeated', 'Include a repeated zero', [false, false, true]),
  ],
  generate(rng, gl, o) {
    const byPoint = optOne(o, 'given', gl === 1 ? 'lead' : 'point') === 'point';
    const repeated = optOn(o, 'repeated', gl === 3);
    const difficulty = byPoint ? (repeated ? 3 : 2) : 1;
    const rs = repeated ? (() => { const [r, s] = roots(rng, 2, -3, 3); return [r, r, s]; })() : roots(rng, 3, -4, 4);
    const a = !byPoint ? rng.pick([1, -1, 2]) : rng.pick([-2, -1, 2, 3, 1 / 2]);
    let px = rng.int(-4, 4);
    while (rs.includes(px)) px = rng.int(-4, 4);
    const py = a * rs.reduce((acc, r) => acc * (px - r), 1);
    const text = factoredText(rs, 1);
    const aText = new Q(Math.round(a * 2), 2);
    // A leading coefficient in front of factors: '', '-', '2', '1/2 '.
    const lead = (q: Q) => (q.eq(1) ? '' : q.eq(-1) ? '-' : q.isInt ? String(q.n) : `${q.typst()} `);
    const answer = `y = ${lead(aText)}${text}`;
    const zeros = [...new Set(rs)].map((r) => `${r}${rs.filter((z) => z === r).length > 1 ? ` med ("multiplicity" ${rs.filter((z) => z === r).length})` : ''}`).join(', ');
    return {
      body: difficulty === 1
        ? `Write a cubic function with zeros ${math(zeros)} and leading coefficient ${math(aText.typst())}.`
        : `Write the equation of the ${difficulty === 3 ? 'cubic ' : 'cubic '}function with zeros ${math(zeros)} that passes through ${math(`(${px}, ${py})`)}.`,
      answer: math(answer),
      // Zeros with the wrong signs, no leading coefficient, or the opposite leading coefficient.
      distractors: [`y = ${lead(aText)}${factoredText(rs.map((r) => -r))}`, `y = ${factoredText(rs)}`, `y = ${lead(aText.neg())}${text}`, `y = ${lead(new Q(aText.d, aText.n))}${text}`].filter((d, i, all) => d !== answer && all.indexOf(d) === i).map(math),
      solution: difficulty === 1
        ? `Each zero ${math('a')} gives a factor ${math('(x - a)')}: ${math(answer)}.`
        : `${math(`y = a ${text}`)}. Substitute ${math(`(${px}, ${py})`)}: ${math(`${py} = a dot ${sub(rs.reduce((acc, r) => acc * (px - r), 1))}`)}, so ${math(`a = ${aText.typst()}`)} and ${math(answer)}.`,
    };
  },
});

export const polyModel = pc40s('40s-poly-model', {
  levels: { 1: 'Evaluate the volume', 2: 'Write the volume function and domain', 3: 'Maximum volume (technology)' },
  options: [
    radioOption('form', 'Task', [['1', 'Evaluate the volume'], ['2', 'Write the volume function and domain'], ['3', 'Maximum volume (technology)']], ['1', '2', '3']),
    sizeOption([20, 30, 40], [40, 40, 40], 'Largest sheet side (cm)'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const L = rng.int(12, optNum(o, 'size', 40)), W = rng.int(8, Math.min(L, 30));
    const V = (x: number) => x * (L - 2 * x) * (W - 2 * x);
    const setting = `Squares of side ${math('x')} cm are cut from the corners of a ${L} cm by ${W} cm sheet of cardboard, and the sides are folded up to make an open box.`;
    const model = `V(x) = x(${L} - 2x)(${W} - 2x)`;
    if (difficulty === 1) {
      const x = rng.int(1, Math.floor((W - 1) / 2));
      return {
        body: `${setting} Find the volume when ${math(`x = ${x}`)}.`,
        answer: math(`${V(x)} "cm"^3`),
        distractors: [x * (L - x) * (W - x), (L - 2 * x) * (W - 2 * x), x * L * W].filter((v) => v !== V(x)).map((v) => math(`${v} "cm"^3`)),
        solution: `${math(model)}, so ${math(`V(${x}) = ${x}(${L - 2 * x})(${W - 2 * x}) = ${V(x)}`)} cm³.`,
      };
    }
    if (difficulty === 2) {
      const expanded = poly(polyMul([1, 0], polyMul([-2, L], [-2, W])));
      const answer = `V(x) = ${expanded}, 0 < x < ${new Q(W, 2).typst()}`;
      return {
        body: `${setting} Write the volume ${math('V')} as a polynomial function of ${math('x')} in standard form, and state the domain.`,
        answer: math(answer),
        distractors: [`V(x) = ${expanded}, 0 < x < ${new Q(L, 2).typst()}`, `V(x) = ${poly(polyMul([1, 0], polyMul([-1, L], [-1, W])))}, 0 < x < ${W}`, `V(x) = ${expanded}, x > 0`].map(math),
        solution: `${math(`${model} = ${expanded}`)}. Each side length must be positive, so ${math(`0 < x < ${new Q(W, 2).typst()}`)} (the shorter side limits ${math('x')}).`,
      };
    }
    let best = 0, bestX = 0;
    for (let x = 0; x <= W / 2; x += 0.001) if (V(x) > best) { best = V(x); bestX = x; }
    return {
      body: `${setting} Use technology to find the maximum volume and the value of ${math('x')} that gives it, to one decimal place.`,
      answer: math(`V approx ${round(best, 1)} "cm"^3 "at" x approx ${round(bestX, 1)}`),
      distractors: [
        `V approx ${round(V(W / 4), 1)} "cm"^3 "at" x approx ${round(W / 4, 1)}`,
        `V approx ${round(V(bestX + 1), 1)} "cm"^3 "at" x approx ${round(bestX + 1, 1)}`,
        `V approx ${round(best * 2, 1)} "cm"^3 "at" x approx ${round(bestX, 1)}`,
      ].map(math),
      solution: `Graph ${math(model)} on ${math(`0 < x < ${new Q(W, 2).typst()}`)} and find the maximum: ${math(`x approx ${round(bestX, 1)}`)}, ${math(`V approx ${round(best, 1)}`)} cm³.`,
    };
  },
});

const GRAPH_OPTIONS = [
  radioOption('degree', 'Degree', [['3', 'Cubic'], ['4', 'Quartic'], ['either', 'Either']], ['3', 'either', 'either']),
  toggleOption('repeated', 'Include repeated zeros', [false, false, true]),
  radioOption('lead', 'Leading coefficient', [['1', '1 or −1'], ['any', '±1 or ±2']], ['1', '1', 'any']),
];

/** A cubic or quartic with small integer zeros and a leading coefficient of ±1 (or ±2). */
function graphable(rng: Rng, difficulty: number, o?: GenOptions) {
  const degreeOpt = optOne(o, 'degree', difficulty === 1 ? '3' : 'either');
  const degree = degreeOpt === 'either' ? rng.pick([3, 4]) : Number(degreeOpt);
  let rs: number[];
  if (optOn(o, 'repeated', difficulty === 3)) { const [r, s] = roots(rng, 2, -3, 3); rs = degree === 3 ? [r, r, s] : [r, r, s, rng.pick([-4, 4])]; }
  else rs = roots(rng, degree, -4, 4);
  const lead = rng.pick(optOne(o, 'lead', difficulty === 3 ? 'any' : '1') === 'any' ? [1, -1, 2, -2] : [1, -1]);
  return { rs, lead, text: factoredText(rs, 1), p: fromRoots(rs, lead) };
}

/** The graph of a polynomial, with a y-window tall enough for its turning points and y-intercept. */
function polyGraph(p: number[], zeros: number[], size: number): string {
  let peak = Math.abs(polyEval(p, 0));
  for (let x = Math.min(...zeros) - 0.5; x <= Math.max(...zeros) + 0.5; x += 0.05) peak = Math.max(peak, Math.abs(polyEval(p, x)));
  const step = [1, 2, 5, 10, 20, 25, 50, 100].find((k) => peak * 1.2 <= k * 4) ?? 200;
  const top = step * 4;
  return graphTypst({ xMin: -6, xMax: 6, yMin: -top, yMax: top, xLabelStep: 2, yStep: step, yLabelStep: step * 2, width: size, height: size, curves: [{ f: (x) => polyEval(p, x) }], dots: [...new Set(zeros)].map((r) => ({ x: r, y: 0 })) });
}

const withLead = (lead: number, text: string) => `${lead === 1 ? '' : lead === -1 ? '-' : lead}${text}`;

export const polySketch = pc40s('40s-poly-sketch', {
  levels: { 1: 'Cubics with distinct zeros', 2: 'Cubics and quartics', 3: 'Repeated zeros' },
  options: GRAPH_OPTIONS,
  generate(rng, difficulty, o) {
    const { rs, lead, text, p } = graphable(rng, difficulty, o);
    const size = 3.4;
    const distinct = [...new Set(rs)];
    return {
      body: `Graph ${math(`y = ${withLead(lead, text)}`)}.`,
      answer: polyGraph(p, rs, size),
      distractors: [
        polyGraph(p.map((c) => -c), rs, size),
        polyGraph(fromRoots(rs.map((r) => -r), lead), rs.map((r) => -r), size),
        polyGraph(fromRoots(distinct.length < rs.length ? distinct : [...rs, rs[0]], lead), distinct, size),
      ],
      solution: `Zeros at ${math(rootList(rs))}; ${distinct.length < rs.length ? 'the graph touches the x-axis at a zero of even multiplicity and flattens at one of odd multiplicity' : 'each zero has multiplicity 1, so the graph crosses there'}. Degree ${rs.length} with a ${lead > 0 ? 'positive' : 'negative'} leading coefficient sets the end behaviour, and the y-intercept is ${math(String(polyEval(p, 0)))}.`,
    };
  },
});

export const polyMatch = pc40s('40s-poly-match', {
  levels: { 1: 'Cubic in standard form', 2: 'Cubic or quartic in standard form', 3: 'With repeated zeros' },
  options: GRAPH_OPTIONS,
  generate(rng, difficulty, o) {
    const { rs, lead, p } = graphable(rng, difficulty, o);
    const size = 3.4;
    return {
      body: `Which graph could represent ${math(`y = ${poly(p)}`)}?`,
      answer: polyGraph(p, rs, size),
      distractors: [
        polyGraph(p.map((c) => -c), rs, size),
        polyGraph(fromRoots(rs.map((r) => -r), lead), rs.map((r) => -r), size),
        polyGraph(fromRoots(rs.map((r) => r + 1), lead), rs.map((r) => r + 1), size),
      ],
      solution: `Factor to find the zeros: ${math(`y = ${withLead(lead, factoredText(rs))}`)}, so ${math(rootList(rs))}. Check the end behaviour (degree ${rs.length}, leading coefficient ${lead > 0 ? 'positive' : 'negative'}) and the y-intercept ${math(String(polyEval(p, 0)))}.`,
    };
  },
});

export const polyFromGraph = pc40s('40s-poly-from-graph', {
  levels: { 1: 'Cubics with distinct zeros', 2: 'Cubics and quartics', 3: 'Repeated zeros' },
  options: GRAPH_OPTIONS,
  generate(rng, difficulty, o) {
    const { rs, lead, text, p } = graphable(rng, difficulty, o);
    const answer = `y = ${withLead(lead, text)}`;
    return {
      body: `Write the equation of the polynomial function in factored form. The y-intercept is ${math(`(0, ${polyEval(p, 0)})`)}.\n\n${polyGraph(p, rs, 5.5)}`,
      answer: math(answer),
      // The wrong sign of a, zeros with the wrong signs, a repeated zero missed, or a doubled.
      distractors: [`y = ${withLead(-lead, text)}`, `y = ${withLead(lead, factoredText(rs.map((r) => -r)))}`, `y = ${withLead(lead, factoredText([...new Set(rs)]))}`, `y = ${withLead(lead * 2, text)}`]
        .filter((d, i, all) => d !== answer && all.indexOf(d) === i).map(math),
      solution: `The zeros are ${math(rootList(rs))}${rs.length > new Set(rs).size ? ' (the graph touches or flattens at a repeated zero)' : ''}, so ${math(`y = a ${text}`)}. The y-intercept gives ${math(`a = ${lead}`)}: ${math(answer)}.`,
    };
  },
});

export const POLYNOMIAL_GENERATORS = [polyDivide, polyRemainder, polyRemainderUnknown, polyFactorTheorem, polyFactor, polySolve, polyZerosMultiplicity, polyEndBehaviour, polyIdentify, polyWrite, polyModel, polySketch, polyMatch, polyFromGraph];
