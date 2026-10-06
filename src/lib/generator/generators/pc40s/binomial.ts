import { grouped, monomial } from '../../format.ts';
import type { Rng } from '../../rng.ts';
import { math, pc40s } from './common.ts';
import { C, nCr } from './counting.ts';
import { optNum, optOne, radioOption, sizeOption } from '../../options.ts';
import type { GenOptions } from '../../types.ts';


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

const FORM_OPTION = radioOption('form', 'Binomial', [['xa', '(x + a)'], ['axb', '(ax + b)'], ['xy', '(ax + by), two variables'], ['neg', 'A negative power, like (x² + a/x)'], ['mono', 'General powers, like (2x³ − 3/x²)'], ['mixed', 'Mixed']], ['xa', 'axb', 'mixed']);
const SIZE_OPTION = sizeOption([2, 3, 4, 6], [4, 3, 3], 'Size of constants');

/** The two terms of the binomial, from the form and size options (or the level). */
function parts(rng: Rng, difficulty: number, o?: GenOptions): [Part, Part] {
  const N = optNum(o, 'size', difficulty === 1 ? 4 : 3);
  let form = optOne(o, 'form', difficulty === 1 ? 'xa' : difficulty === 2 ? 'axb' : 'mixed');
  if (form === 'mixed') form = rng.pick(['neg', 'xy', 'neg']);
  if (form === 'xa') return [{ coef: 1, px: 1, py: 0 }, { coef: rng.nonZero(-N, N), px: 0, py: 0 }];
  if (form === 'axb') return [{ coef: rng.int(1, Math.min(N, 3)), px: 1, py: 0 }, { coef: rng.nonZero(-N, N), px: 0, py: 0 }];
  if (form === 'xy') return [{ coef: rng.int(1, 2), px: 1, py: 0 }, { coef: rng.nonZero(-N, N), px: 0, py: 1 }];
  // Negative powers keep the constants small, since they multiply quickly.
  const M = Math.min(N, 3);
  if (form === 'mono') return monoParts(rng, M);
  return rng.pick([
    [{ coef: 1, px: 2, py: 0 }, { coef: rng.nonZero(-M, M), px: -1, py: 0 }],
    [{ coef: 1, px: 1, py: 0 }, { coef: rng.nonZero(-Math.min(M, 2), Math.min(M, 2)), px: -1, py: 0 }],
  ] as Array<[Part, Part]>);
}

/** (a x^p + b/x^q): any positive power and any negative power, with small constants. */
function monoParts(rng: Rng, M = 3): [Part, Part] {
  const p = rng.int(1, 3), q = rng.int(1, 2);
  return [{ coef: rng.int(1, Math.min(M, 2)), px: p, py: 0 }, { coef: rng.nonZero(-M, M), px: -q, py: 0 }];
}

/** `x`, `x^4`, `x^(-3)`. */
const xPower = (e: number) => (e === 1 ? 'x' : e < 0 ? `x^(${e})` : `x^${e}`);
/** The x-exponent of the general term of (x^p + b/x^q)^n: `2(6 - k) - k`. */
const exponentText = (p: number, q: number, n: number) => `${p === 1 ? '' : p}(${n} - k) - ${q === 1 ? '' : q}k`;
const ord = (m: number) => `${m}${m % 10 === 1 && m !== 11 ? 'st' : m % 10 === 2 && m !== 12 ? 'nd' : m % 10 === 3 && m !== 13 ? 'rd' : 'th'}`;

export const binPascal = pc40s('40s-bin-pascal', {
  points: 1,
  levels: { 1: 'Write a row', 2: 'Find an entry in a row', 3: 'Find the next row' },
  options: [radioOption('rows', 'Rows', [['small', 'Short (powers 3 to 6)'], ['large', 'Longer (powers 6 to 10)'], ['larger', 'Long (powers 10 to 13)']], ['small', 'large', 'large'])],
  generate(rng, difficulty, o) {
    const rows = optOne(o, 'rows', difficulty === 1 ? 'small' : 'large');
    const n = rows === 'small' ? rng.int(3, 6) : rows === 'large' ? rng.int(6, 10) : rng.int(10, 13);
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
  options: [
    FORM_OPTION, SIZE_OPTION, radioOption('n', 'Exponent', [['34', '3 or 4'], ['4', '4'], ['5', '5'], ['6', '6']], ['34', '4', '4']),
    radioOption('task', 'Task', [['expand', 'Expand'], ['negative', 'How many terms are negative (without expanding)']], ['expand', 'expand', 'expand']),
  ],
  generate(rng, difficulty, o) {
    const [A, B] = parts(rng, difficulty, o);
    const nOpt = optOne(o, 'n', difficulty === 1 ? '34' : '4');
    const n = nOpt === '34' ? rng.int(3, 4) : Number(nOpt);
    if (optOne(o, 'task', 'expand') === 'negative') return negativeTerms(A, B, n);
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

/** How many terms of (A + B)^n are negative, by the parity of each term's power of B. */
function negativeTerms(A: Part, B0: Part, n: number) {
  // A always has a positive coefficient here; make B negative so the question has substance.
  const B = { ...B0, coef: -Math.abs(B0.coef) };
  const count = Math.floor((n + 1) / 2);
  const candidates = [n + 1 - count, count + 1, count - 1, n + 1, n];
  return {
    body: `Without expanding, determine how many terms in the expansion of ${math(`${binomialText(A, B)}^${n}`)} are negative. Explain.`,
    answer: math(String(count)),
    distractors: [...new Set(candidates)].filter((v) => v !== count && v >= 0).slice(0, 4).map((v) => math(String(v))),
    solution: `The general term is ${math(`${C(n, 'k')} (${termText(A)})^(${n} - k) (${termText(B)})^k`)}, for ${math(`k = 0, 1, ..., ${n}`)}. Only ${math(termText(B))} carries a negative sign, so a term is negative exactly when ${math('k')} is odd. `
      + `Of the ${n + 1} values of ${math('k')}, ${count} are odd (${math(Array.from({ length: count }, (_, i) => 2 * i + 1).join(', '))}), so ${count} terms are negative.`,
  };
}

export const binTerm = pc40s('40s-bin-term', {
  levels: { 1: '(x + a)ⁿ', 2: '(ax + b)ⁿ', 3: 'Two variables or negative powers' },
  options: [
    FORM_OPTION, SIZE_OPTION, radioOption('n', 'Exponent', [['low', '5 to 7'], ['high', '8 to 10']], ['low', 'low', 'low']),
    radioOption('ask', 'Which term', [['nth', 'The kth term'], ['middle', 'The middle term'], ['end', 'The kth term from the end']], ['nth', 'nth', 'nth']),
  ],
  generate(rng, difficulty, o) {
    const [A, B] = parts(rng, difficulty, o);
    const ask = optOne(o, 'ask', 'nth');
    const n0 = optOne(o, 'n', 'low') === 'high' ? rng.int(8, 10) : rng.int(5, 7);
    // A middle term needs an even exponent (an odd number of terms).
    const n = ask === 'middle' && n0 % 2 ? n0 + 1 : n0;
    const k = ask === 'middle' ? n / 2 : rng.int(1, n - 1);
    const t = term(A, B, n, k);
    const answer = termText(t);
    const fromEnd = n - k + 1;
    const which = ask === 'middle' ? 'middle term' : ask === 'end' ? `${ord(fromEnd)} term from the end` : `${ord(k + 1)} term`;
    const locate = ask === 'middle'
      ? `There are ${n + 1} terms, so the middle one is ${math(`t_${k + 1}`)}. `
      : ask === 'end' ? `There are ${n + 1} terms, so the ${ord(fromEnd)} term from the end is term ${math(`${n + 1} - ${fromEnd} + 1 = ${k + 1}`)} from the start. ` : '';
    const wrongEnd = ask === 'end' ? [termText(term(A, B, n, fromEnd - 1))] : [];
    return {
      body: `Find the ${which} in the expansion of ${math(`${binomialText(A, B)}^${n}`)}.`,
      answer: math(answer),
      distractors: [...new Set([...wrongEnd, termText(term(A, B, n, k + 1)), termText(term(A, B, n, k - 1)), termText({ ...t, coef: t.coef / nCr(n, k) }), termText({ ...t, coef: -t.coef })])].filter((d) => d !== answer).map(math),
      solution: `${locate}${math(`t_(k + 1) = ${C(n, 'k')} (${termText(A)})^(${n} - k) (${termText(B)})^k`)}, with ${math(`k = ${k}`)}: ${math(`t_${k + 1} = ${C(n, k)} ${raised(termText(A), n - k)} ${raised(termText(B), k)} = ${answer}`)}.`,
    };
  },
});

export const binTermPower = pc40s('40s-bin-term-power', {
  levels: { 1: 'Coefficient of xᵐ in (x + a)ⁿ', 2: 'Coefficient of xᵐ in (ax + b)ⁿ', 3: 'The constant term' },
  options: [
    radioOption('task', 'Find', [['power', 'The coefficient of a power of x'], ['constant', 'The constant term'], ['general', 'The term containing xᵐ, with negative powers'], ['absent', 'A coefficient that turns out to be 0 (no such term)']], ['power', 'power', 'constant']),
    radioOption('form', 'Binomial (for a power of x)', [['xa', '(x + a)'], ['axb', '(ax + b)']], ['xa', 'axb', 'axb']),
    SIZE_OPTION,
  ],
  generate(rng, difficulty, o) {
    const task = optOne(o, 'task', difficulty === 3 ? 'constant' : 'power');
    if (task === 'general' || task === 'absent') return powerOfX(rng, task === 'absent');
    if (task === 'constant') {
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
        solution: `The general term has ${math(`x^(${p === 1 ? '' : p}(${n} - k)) x^(-${q === 1 ? '' : q}k)`.replace(`x^((${n} - k))`, `x^(${n} - k)`))}. The exponent is 0 when ${math(`${p === 1 ? '' : p}(${n} - k) = ${q === 1 ? '' : q}k`)}, so ${math(`k = ${k}`)}. `
          + `The term is ${math(`${C(n, k)} ${raised(b, k)} = ${grouped(value)}`)}.`,
      };
    }
    const [A, B] = parts(rng, difficulty, { ...o, form: optOne(o, 'form', difficulty === 1 ? 'xa' : 'axb') });
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

/** The term containing x^e in (a x^p + b/x^q)^n, or (absent) a power no term reaches, whose coefficient is 0. */
function powerOfX(rng: Rng, absent: boolean) {
  const [A, B] = monoParts(rng, 3);
  const p = A.px, q = -B.px, n = rng.int(4, 8);
  const expo = (k: number) => p * (n - k) - q * k;
  const head = `The general term is ${math(`${C(n, 'k')} (${termText(A)})^(${n} - k) (${termText(B)})^k`)}, whose power of ${math('x')} is ${math(exponentText(p, q, n))}`;
  const expansion = math(`${binomialText(A, B)}^${n}`);
  if (absent) {
    // A power between the highest and lowest that no whole k reaches.
    const misses = Array.from({ length: (p + q) * n + 1 }, (_, i) => p * n - i).filter((e) => e !== 0 && (p * n - e) % (p + q) !== 0);
    const e = rng.pick(misses);
    const kExact = (p * n - e) / (p + q);
    const near = [Math.floor(kExact), Math.ceil(kExact)];
    return {
      body: `Find the coefficient of ${math(xPower(e))} in the expansion of ${expansion}.`,
      answer: math('0'),
      distractors: [...new Set([...near.map((k) => term(A, B, n, k).coef), nCr(n, near[0])])].filter((v) => v !== 0).slice(0, 3).map((v) => math(grouped(v))),
      solution: `${head}. Setting ${math(`${exponentText(p, q, n)} = ${e}`)} gives ${math(`${p * n} - ${p + q}k = ${e}`)}, so ${math(`k = ${p * n - e}/${p + q}`)}. That is not a whole number, so no term contains ${math(xPower(e))}: its coefficient is ${math('0')}.`,
    };
  }
  const k0 = rng.int(0, n);
  const k = expo(k0) !== 0 ? k0 : k0 > 0 ? k0 - 1 : k0 + 1;
  const e = expo(k);
  const t = term(A, B, n, k);
  const answer = termText(t);
  return {
    body: `Find the term containing ${math(xPower(e))} in the expansion of ${expansion}.`,
    answer: math(answer),
    distractors: [...new Set([termText({ ...t, coef: t.coef / nCr(n, k) }), termText({ ...t, coef: -t.coef }), termText(term(A, B, n, k === n ? k - 1 : k + 1)), termText({ ...t, coef: nCr(n, k) })])].filter((d) => d !== answer).map(math),
    solution: `${head}. Setting ${math(`${exponentText(p, q, n)} = ${e}`)} gives ${math(`${p * n} - ${p + q}k = ${e}`)}, so ${math(`k = ${k}`)}: ${math(`t_${k + 1} = ${C(n, k)} ${raised(termText(A), n - k)} ${raised(termText(B), k)} = ${answer}`)}.`,
  };
}

export const binCoefficient = pc40s('40s-bin-coefficient', {
  points: 1,
  levels: { 1: 'Coefficient as a combination', 2: 'Numerical coefficient', 3: 'Sum of all coefficients' },
  options: [radioOption('n', 'Exponent', [['low', '5 to 10'], ['high', '10 to 15']], ['low', 'low', 'low'])],
  generate(rng, difficulty, o) {
    const n = optOne(o, 'n', 'low') === 'high' ? rng.int(10, 15) : rng.int(5, 10);
    if (difficulty === 3) {
      const a = rng.int(1, 3), b = rng.nonZero(-2, 3);
      const value = (a + b) ** n;
      return {
        body: `Find the sum of the coefficients in the expansion of ${math(`(${a === 1 ? '' : a}x ${b < 0 ? '-' : '+'} ${Math.abs(b)})^${n}`)}.`,
        answer: math(grouped(value)),
        // 2^n from ignoring the coefficients, dropped signs, only the end terms, one power too few, n(a + b), the leading coefficient, or n.
        distractors: [...new Set([2 ** n, (a + Math.abs(b)) ** n, a ** n + b ** n, (a + b) ** (n - 1), n * (a + b), (a - b) ** n, 1, n])].filter((v) => v !== value).slice(0, 3).map((v) => math(grouped(v))),
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
