import { grouped, monomial } from '../../format.ts';
import type { Rng } from '../../rng.ts';
import { math, pc40s } from './common.ts';
import { C, nCr } from './counting.ts';


/** One term of a binomial: coef · x^px · y^py (powers may be negative, e.g. 3/x). */
interface Part { coef: number; px: number; py: number }

/** A term with only positive exponents shown: `-12x^2 y`, `16/x^3`, `5`. */
function termText(t: Part): string {
  const top: Array<[string, number]> = [['x', t.px], ['y', t.py]].filter(([, p]) => (p as number) > 0) as Array<[string, number]>;
  const bottom: Array<[string, number]> = [['x', -t.px], ['y', -t.py]].filter(([, p]) => (p as number) > 0) as Array<[string, number]>;
  if (!bottom.length) return monomial(t.coef, top);
  const sign = t.coef < 0 ? '-' : '';
  const numerator = monomial(Math.abs(t.coef), top);
  const denominator = monomial(1, bottom);
  return `${sign}${/^[0-9a-z]+$/.test(numerator) ? numerator : `(${numerator})`}/${/^[a-z](\^[0-9]+)?$/.test(denominator) ? denominator : `(${denominator})`}`;
}

/** Join terms with signs: `x^3 - 6x^2 + 12x - 8`. */
function sumText(terms: Part[]): string {
  return terms.filter((t) => t.coef !== 0).map((t, i) => {
    const text = termText({ ...t, coef: Math.abs(t.coef) });
    return i === 0 ? (t.coef < 0 ? `-${text}` : text) : ` ${t.coef < 0 ? '-' : '+'} ${text}`;
  }).join('');
}

/** The (k + 1)th term of (A + B)^n. */
function term(A: Part, B: Part, n: number, k: number): Part {
  return {
    coef: nCr(n, k) * A.coef ** (n - k) * B.coef ** k,
    px: A.px * (n - k) + B.px * k,
    py: A.py * (n - k) + B.py * k,
  };
}

/** `(3x)^2`, `(3x)` for a first power, `1` for a zeroth. */
function raised(text: string | number, e: number): string {
  if (e === 0) return '1';
  return e === 1 ? `(${text})` : `(${text})^${e}`;
}

function binomialText(A: Part, B: Part): string {
  return `(${sumText([A, B])})`;
}

/** A pair of terms for each difficulty. */
function parts(rng: Rng, difficulty: number): [Part, Part] {
  if (difficulty === 1) return [{ coef: 1, px: 1, py: 0 }, { coef: rng.nonZero(-4, 4), px: 0, py: 0 }];
  if (difficulty === 2) return [{ coef: rng.int(1, 3), px: 1, py: 0 }, { coef: rng.nonZero(-3, 3), px: 0, py: 0 }];
  return rng.pick([
    [{ coef: 1, px: 2, py: 0 }, { coef: rng.nonZero(-3, 3), px: -1, py: 0 }],
    [{ coef: rng.int(1, 2), px: 1, py: 0 }, { coef: rng.nonZero(-3, 3), px: 0, py: 1 }],
    [{ coef: 1, px: 1, py: 0 }, { coef: rng.nonZero(-2, 2), px: -1, py: 0 }],
  ] as Array<[Part, Part]>);
}

export const binPascal = pc40s('40s-bin-pascal', {
  points: 1,
  levels: { 1: 'Write a row', 2: 'Find an entry in a row', 3: 'Find the next row' },
  generate(rng, difficulty) {
    const n = difficulty === 1 ? rng.int(3, 6) : rng.int(6, 10);
    const row = (m: number) => Array.from({ length: m + 1 }, (_, k) => nCr(m, k));
    if (difficulty === 2) {
      const k = rng.int(2, n - 2);
      const value = nCr(n, k);
      return {
        body: `What is entry number ${k + 1} (from the left) in the row of Pascal's triangle that gives the coefficients of ${math(`(x + y)^${n}`)}?`,
        answer: math(String(value)),
        distractors: [nCr(n, k + 1), nCr(n - 1, k), nCr(n + 1, k), nCr(n, k - 1)].filter((v) => v !== value).map((v) => math(String(v))),
        solution: `The row for ${math(`(x + y)^${n}`)} is row ${n + 1}: ${math(row(n).join(', '))}. Entry ${k + 1} is ${math(`${C(n, k)} = ${value}`)}.`,
      };
    }
    const given = difficulty === 3 ? row(n - 1) : null;
    const answer = row(n).join(', ');
    return {
      body: given
        ? `One row of Pascal's triangle is ${math(given.join(', '))}. Write the next row.`
        : `Write the row of Pascal's triangle that gives the coefficients in the expansion of ${math(`(x + y)^${n}`)}.`,
      answer: math(answer),
      distractors: [row(n - 1).join(', '), row(n + 1).join(', '), row(n).map((v, i) => (i === 1 || i === n - 1 ? v + 1 : v)).join(', ')].filter((d) => d !== answer).map(math),
      solution: given
        ? `Start and end with 1; each other entry is the sum of the two entries above it: ${math(answer)}.`
        : `The coefficients of ${math(`(x + y)^${n}`)} are row ${n + 1} of Pascal's triangle (the row beginning ${math(`1, ${n}`)}): ${math(answer)}.`,
    };
  },
});

export const binExpand = pc40s('40s-bin-expand', {
  levels: { 1: '(x + a)³ and (x + a)⁴', 2: '(ax + b)⁴', 3: 'Two variables or negative powers' },
  generate(rng, difficulty) {
    const [A, B] = parts(rng, difficulty);
    const n = difficulty === 1 ? rng.int(3, 4) : 4;
    const terms = Array.from({ length: n + 1 }, (_, k) => term(A, B, n, k));
    const answer = sumText(terms);
    const noCoefficients = terms.map((t, k) => ({ ...t, coef: A.coef ** (n - k) * B.coef ** k }));
    const noSigns = terms.map((t) => ({ ...t, coef: Math.abs(t.coef) }));
    const firstLast = [terms[0], terms[n]];
    return {
      body: `Expand using the binomial theorem: ${math(`${binomialText(A, B)}^${n}`)}`,
      answer: math(answer),
      distractors: [sumText(noCoefficients), sumText(noSigns), sumText(firstLast), sumText(terms.map((t, k) => (k === 1 ? { ...t, coef: -t.coef } : t)))].filter((d) => d !== answer).map(math),
      solution: `${math(`${binomialText(A, B)}^${n} = sum_(k = 0)^${n} ${C(n, 'k')} (${termText(A)})^(${n} - k) (${termText(B)})^k`)}, with coefficients ${math(Array.from({ length: n + 1 }, (_, k) => nCr(n, k)).join(', '))}:\n\n${math(answer)}`,
    };
  },
});

export const binTerm = pc40s('40s-bin-term', {
  levels: { 1: '(x + a)ⁿ', 2: '(ax + b)ⁿ', 3: 'Two variables or negative powers' },
  generate(rng, difficulty) {
    const [A, B] = parts(rng, difficulty);
    const n = rng.int(5, difficulty === 1 ? 8 : 7);
    const k = rng.int(1, n - 1);
    const t = term(A, B, n, k);
    const answer = termText(t);
    const ord = (m: number) => `${m}${m % 10 === 1 && m !== 11 ? 'st' : m % 10 === 2 && m !== 12 ? 'nd' : m % 10 === 3 && m !== 13 ? 'rd' : 'th'}`;
    return {
      body: `Find the ${ord(k + 1)} term in the expansion of ${math(`${binomialText(A, B)}^${n}`)}.`,
      answer: math(answer),
      distractors: [termText(term(A, B, n, k + 1)), termText(term(A, B, n, k - 1)), termText({ ...t, coef: t.coef / nCr(n, k) }), termText({ ...t, coef: -t.coef })].filter((d) => d !== answer).map(math),
      solution: `${math(`t_(k + 1) = ${C(n, 'k')} (${termText(A)})^(${n} - k) (${termText(B)})^k`)}, with ${math(`k = ${k}`)}: ${math(`t_${k + 1} = ${C(n, k)} ${raised(termText(A), n - k)} ${raised(termText(B), k)} = ${answer}`)}.`,
    };
  },
});

export const binTermPower = pc40s('40s-bin-term-power', {
  levels: { 1: 'Coefficient of xᵐ in (x + a)ⁿ', 2: 'Coefficient of xᵐ in (ax + b)ⁿ', 3: 'The constant term' },
  generate(rng, difficulty) {
    if (difficulty === 3) {
      // (x^p + b/x^q)^n has a constant term when p(n − k) = q k.
      const [p, q, n] = rng.pick([[1, 1, 4], [1, 1, 6], [2, 1, 6], [2, 1, 3], [1, 2, 6], [2, 1, 9]] as const);
      const b = rng.nonZero(-3, 3);
      const k = (p * n) / (p + q);
      const A: Part = { coef: 1, px: p, py: 0 }, B: Part = { coef: b, px: -q, py: 0 };
      const value = term(A, B, n, k).coef;
      return {
        body: `Find the constant term in the expansion of ${math(`${binomialText(A, B)}^${n}`)}.`,
        answer: math(String(value)),
        distractors: [nCr(n, k), -value, term(A, B, n, Math.max(0, k - 1)).coef].filter((v) => v !== value).map((v) => math(String(v))),
        solution: `The general term has ${math(`x^(${p}(${n} - k)) x^(-${q === 1 ? '' : q}k)`)}. The exponent is 0 when ${math(`${p === 1 ? '' : p}(${n} - k) = ${q === 1 ? '' : q}k`)}, so ${math(`k = ${k}`)}. `
          + `The term is ${math(`${C(n, k)} ${raised(b, k)} = ${grouped(value)}`)}.`,
      };
    }
    const [A, B] = parts(rng, difficulty);
    const n = rng.int(5, 8);
    const m = rng.int(1, n - 1);
    const k = n - m; // x appears only in A
    const value = term(A, B, n, k).coef;
    return {
      body: `Find the coefficient of ${math(m === 1 ? 'x' : `x^${m}`)} in the expansion of ${math(`${binomialText(A, B)}^${n}`)}.`,
      answer: math(grouped(value)),
      distractors: [nCr(n, m) * A.coef ** k * B.coef ** m, nCr(n, k), -value, term(A, B, n, Math.max(0, k - 1)).coef].filter((v) => v !== value).map((v) => math(grouped(v))),
      solution: `${math(m === 1 ? 'x' : `x^${m}`)} comes from ${math(raised(termText(A), m))}, so ${math(`k = ${k}`)}: ${math(`${C(n, k)} ${raised(A.coef, m)} ${raised(B.coef, k)} = ${grouped(value)}`)}.`,
    };
  },
});

export const binCoefficient = pc40s('40s-bin-coefficient', {
  points: 1,
  levels: { 1: 'Coefficient as a combination', 2: 'Numerical coefficient', 3: 'Sum of all coefficients' },
  generate(rng, difficulty) {
    const n = rng.int(5, 10);
    if (difficulty === 3) {
      const a = rng.int(1, 3), b = rng.nonZero(-2, 3);
      const value = (a + b) ** n;
      return {
        body: `Find the sum of the coefficients in the expansion of ${math(`(${a === 1 ? '' : a}x ${b < 0 ? '-' : '+'} ${Math.abs(b)})^${n}`)}.`,
        answer: math(grouped(value)),
        distractors: [2 ** n, (a + Math.abs(b)) ** n, a ** n + b ** n].filter((v) => v !== value).map((v) => math(grouped(v))),
        solution: `Substitute ${math('x = 1')}: the sum of the coefficients is ${math(`(${a} ${b < 0 ? '-' : '+'} ${Math.abs(b)})^${n} = ${grouped(value)}`)}.`,
      };
    }
    const k = rng.int(1, n - 1);
    const termVars = `${n - k === 1 ? 'x' : `x^${n - k}`} ${k === 1 ? 'y' : `y^${k}`}`;
    if (difficulty === 1) {
      return {
        body: `Which combination gives the coefficient of ${math(termVars)} in the expansion of ${math(`(x + y)^${n}`)}?`,
        answer: math(C(n, k)),
        distractors: [C(n, k + 1 > n ? k - 1 : k + 1), C(n - 1, k), C(k, n - k > k ? k : n - k), C(n + 1, k)].filter((d) => d !== C(n, k) && d !== C(n, n - k)).map(math),
        solution: `The term with ${math(k === 1 ? 'y' : `y^${k}`)} is ${math(`t_${k + 1} = ${C(n, k)} ${termVars}`)}. (${math(`${C(n, n - k)}`)} is equal, since ${math(`${C(n, k)} = ${C(n, n - k)}`)}.)`,
      };
    }
    return {
      body: `Find the coefficient of ${math(termVars)} in the expansion of ${math(`(x + y)^${n}`)}.`,
      answer: math(String(nCr(n, k))),
      distractors: [nCr(n, k + 1), nCr(n - 1, k), n * k, nCr(n + 1, k)].filter((v) => v !== nCr(n, k)).map((v) => math(String(v))),
      solution: math(`${C(n, k)} = ${n}!/(${k}! ${n - k}!) = ${nCr(n, k)}`),
    };
  },
});

export const BINOMIAL_GENERATORS = [binPascal, binExpand, binTerm, binTermPower, binCoefficient];
