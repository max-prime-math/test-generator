// Pre-Algebra: integers, decimals, fractions, factors, exponents, scientific
// notation, and percents. Question types and options follow Kuta's Infinite
// Pre-Algebra (Rounding, NamingPlaces, AddRational, MultiplyFractions, GCF, …).
import type { Rng } from '../../rng.ts';
import type { GenOptions } from '../../types.ts';
import { Q } from '../../exact.ts';
import { gcd, grouped, lcm, monomial, monomialQuotient, type Powers } from '../../format.ts';
import { optList, optNum, optOn, optOne, radioOption, sizeOption, toggleOption, manyOption } from '../../options.ts';
import { us, math, task, wrong, mixed, decimal, fixed, money, NAMES } from './common.ts';

// ── Place value ──────────────────────────────────────────────────────────────

const PLACES: Array<[power: number, name: string]> = [
  [5, 'hundred thousands'], [4, 'ten thousands'], [3, 'thousands'], [2, 'hundreds'], [1, 'tens'], [0, 'ones'],
  [-1, 'tenths'], [-2, 'hundredths'], [-3, 'thousandths'], [-4, 'ten-thousandths'],
];
const PLACE_SINGULAR: Record<number, string> = { 3: 'thousand', 2: 'hundred', 1: 'ten', 0: 'whole number', [-1]: 'tenth', [-2]: 'hundredth', [-3]: 'thousandth' };

/** Digits of a positive number with `intDigits` digits before the point and `decDigits` after (no leading zero). */
function randomDigits(rng: Rng, intDigits: number, decDigits: number): { text: string; value: number } {
  const digits = [rng.int(1, 9), ...Array.from({ length: intDigits - 1 + decDigits }, () => rng.int(0, 9))];
  if (decDigits && digits[digits.length - 1] === 0) digits[digits.length - 1] = rng.int(1, 9);
  const text = digits.slice(0, intDigits).join('') + (decDigits ? '.' + digits.slice(intDigits).join('') : '');
  return { text, value: Number(text) };
}

export const paRound = us('pa-round', {
  levels: { 1: 'Whole numbers', 2: 'Decimals to tenths and hundredths', 3: 'Decimals to thousandths' },
  options: [
    radioOption('ask', 'Question', [['round', 'Round to a place'], ['name', 'Name the place of a digit'], ['both', 'Either']], ['both', 'both', 'both']),
    radioOption('numbers', 'Numbers', [['whole', 'Whole numbers'], ['decimal', 'Decimals'], ['both', 'Both']], ['whole', 'decimal', 'both']),
  ],
  generate(rng, level, o) {
    const kind = optOne(o, 'numbers', 'both');
    const isDecimal = kind === 'decimal' || (kind === 'both' && rng.next() < 0.6);
    const intDigits = isDecimal ? rng.int(1, 3) : rng.int(3, 6);
    const decDigits = isDecimal ? rng.int(2, level === 3 ? 4 : 3) : 0;
    const { text, value } = randomDigits(rng, intDigits, decDigits);
    const ask = optOne(o, 'ask', 'both') === 'both' ? rng.pick(['round', 'name'] as const) : optOne(o, 'ask', 'round');
    const powers = PLACES.filter(([pw]) => pw < intDigits && pw >= -decDigits);
    if (ask === 'name') {
      const [power, name] = rng.pick(powers);
      const index = power >= 0 ? intDigits - 1 - power : intDigits - power;
      const shown = `${text.slice(0, index)}#underline[${text[index]}]${text.slice(index + 1)}`;
      const others = PLACES.filter(([pw]) => pw !== power && Math.abs(pw - power) <= 2).map(([, n]) => n);
      const mirror = PLACES.find(([pw]) => pw === -power)?.[1];
      return {
        body: `Name the place of the underlined digit: ${shown}`,
        task: { instruction: 'Name the place value of each underlined digit.', item: shown },
        answer: name,
        distractors: wrong(name, [mirror, ...rng.shuffle(others)]).slice(0, 3),
        solution: `Counting places from the decimal point, the digit ${text[index]} is in the ${name} place.`,
      };
    }
    const roundable = powers.filter(([pw]) => pw > -decDigits && pw <= Math.min(3, intDigits - 1) && (isDecimal ? pw <= 0 : pw >= 1));
    const [power] = rng.pick(roundable.length ? roundable : powers.slice(0, 1));
    const places = Math.max(0, -power);
    const unit = 10 ** power;
    const rounded = Math.round(value / unit + 1e-9) * unit;
    const answer = fixed(rounded, places);
    const truncated = fixed(Math.floor(value / unit + 1e-9) * unit, places);
    const up = fixed((Math.floor(value / unit + 1e-9) + 1) * unit, places);
    const nextPlace = fixed(Math.round(value / (unit / 10) + 1e-9) * (unit / 10), Math.max(0, places + 1));
    return {
      body: `Round ${math(text)} to the nearest ${PLACE_SINGULAR[power]}.`,
      task: { instruction: `Round each number to the nearest ${PLACE_SINGULAR[power]}.`, item: math(text) },
      answer: math(answer),
      distractors: wrong(answer, [truncated, up, nextPlace, fixed(Math.round(value / (unit * 10) + 1e-9) * unit * 10, places)].map((x) => x && math(x))),
      solution: `Look at the digit to the right of the ${PLACE_SINGULAR[power]} place: ${value / unit - Math.floor(value / unit + 1e-9) >= 0.5 - 1e-9 ? '5 or more, so round up' : 'less than 5, so round down'}. ${math(`${text} approx ${answer}`)}.`,
    };
  },
});

// ── Numbers in words ─────────────────────────────────────────────────────────

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function under1000(n: number): string {
  const parts: string[] = [];
  if (n >= 100) { parts.push(`${ONES[Math.floor(n / 100)]} hundred`); n %= 100; }
  if (n >= 20) parts.push(TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : ''));
  else if (n > 0) parts.push(ONES[n]);
  return parts.join(' ');
}

/** A whole number in words: 30 452 → "thirty thousand four hundred fifty-two". */
export function wholeWords(n: number): string {
  if (n === 0) return 'zero';
  const groups: string[] = [];
  for (const [size, name] of [[1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand'], [1, '']] as const) {
    const g = Math.floor(n / size) % 1000;
    if (g) groups.push(`${under1000(g)}${name ? ` ${name}` : ''}`);
  }
  return groups.join(' ');
}

/** A decimal in words, read as a fraction: 3.25 → "three and twenty-five hundredths". */
export function decimalWords(text: string): string {
  const [whole, frac = ''] = text.split('.');
  const w = Number(whole);
  if (!frac) return wholeWords(w);
  const unit = ['', 'tenth', 'hundredth', 'thousandth', 'ten-thousandth'][frac.length];
  const n = Number(frac);
  const fracWords = `${wholeWords(n)} ${unit}${n === 1 ? '' : 's'}`;
  return w ? `${wholeWords(w)} and ${fracWords}` : fracWords;
}

export const paWords = us('pa-words', {
  levels: { 1: 'Whole numbers to thousands', 2: 'Whole numbers to millions', 3: 'Decimals' },
  options: [
    radioOption('direction', 'Write', [['words', 'Numbers in words'], ['digits', 'Words as numbers'], ['both', 'Either']], ['both', 'both', 'both']),
    radioOption('numbers', 'Numbers', [['small', 'Whole, to thousands'], ['large', 'Whole, to millions'], ['decimal', 'Decimals']], ['small', 'large', 'decimal']),
  ],
  generate(rng, _level, o) {
    const kind = optOne(o, 'numbers', 'small');
    const { text } = kind === 'decimal' ? randomDigits(rng, rng.int(1, 3), rng.int(1, 3)) : randomDigits(rng, kind === 'large' ? rng.int(5, 7) : rng.int(3, 4), 0);
    // Zeros inside the number make it worth reading carefully.
    const shown = kind === 'decimal' ? text : text.replace(/(?<=^\d)\d/, (d) => (rng.next() < 0.4 ? '0' : d));
    const words = kind === 'decimal' ? decimalWords(shown) : wholeWords(Number(shown));
    const direction = optOne(o, 'direction', 'both') === 'both' ? rng.pick(['words', 'digits'] as const) : optOne(o, 'direction', 'words');
    const near = (t: string) => {
      const digits = t.replace('.', '').split('');
      const i = rng.int(1, digits.length - 1);
      return [
        t.includes('.') ? t.replace('.', '') : t + '0',
        t.includes('.') ? (Number(t) * 10).toFixed(Math.max(0, t.split('.')[1].length - 1)) : t.slice(0, -1) || '1',
        (() => { const d = [...digits]; d[i] = String((Number(d[i]) + 1) % 10); const s = d.join(''); return t.includes('.') ? s.slice(0, t.indexOf('.')) + '.' + s.slice(t.indexOf('.')) : s; })(),
      ];
    };
    const group = (t: string) => (t.includes('.') ? t : grouped(Number(t)));
    if (direction === 'words') {
      return {
        body: `Write ${math(group(shown))} in words.`,
        task: { instruction: 'Write each number in words.', item: math(group(shown)) },
        answer: words,
        distractors: wrong(words, near(shown).map((t) => (kind === 'decimal' ? decimalWords(t) : wholeWords(Number(t))))),
        solution: kind === 'decimal' ? `Read the whole number, say "and" for the decimal point, then read the digits after it as a number of ${['', 'tenths', 'hundredths', 'thousandths'][shown.split('.')[1].length]}.` : 'Read each group of three digits, followed by its period name (million, thousand).',
      };
    }
    return {
      body: `Write as a number: ${words}`,
      task: { instruction: 'Write each as a number.', item: words },
      answer: math(group(shown)),
      distractors: wrong(math(group(shown)), near(shown).map((t) => math(group(t)))),
      solution: kind === 'decimal' ? `The last word gives the place of the last digit after the point: ${math(shown)}.` : `Fill each place, writing zeros for places that are not named: ${math(group(shown))}.`,
    };
  },
});

// ── The four operations ──────────────────────────────────────────────────────

type NumberKind = 'int' | 'dec' | 'frac' | 'mixed';
const KIND_CHOICES: Array<[string, string]> = [['int', 'Integers'], ['dec', 'Decimals'], ['frac', 'Fractions'], ['mixed', 'Mixed numbers']];

function randomNumber(rng: Rng, kind: NumberKind, size: number, negatives: boolean): Q {
  const s = negatives ? rng.sign() : 1;
  switch (kind) {
    case 'int': return new Q(s * rng.int(1, size));
    case 'dec': { const places = rng.int(1, 2); const scale = 10 ** places; return new Q(s * rng.int(1, size * scale), scale); }
    case 'frac': { const d = rng.int(2, 12); return new Q(s * rng.int(1, d - 1), d); }
    case 'mixed': { const d = rng.int(2, 9); return new Q(s * (rng.int(1, Math.min(9, size)) * d + rng.int(1, d - 1)), d); }
  }
}

/** How a number is shown in its kind: integer, decimal, fraction, or mixed number. */
function show(q: Q, kind: NumberKind): string {
  if (kind === 'dec') return decimal(q.value);
  if (kind === 'mixed') return mixed(q.n, q.d);
  return q.typst();
}
/** As an answer: decimals stay decimal; fractions become mixed numbers when improper. */
function showAnswer(q: Q, kind: NumberKind): string {
  if (kind === 'dec') return decimal(q.value);
  if (kind === 'int') return q.typst();
  return mixed(q.n, q.d);
}
const wrapNeg = (s: string, first: boolean) => (!first && s.startsWith('-') ? `(${s})` : s);

function arithmeticOptions(levels: [NumberKind, NumberKind, NumberKind]) {
  return [
    radioOption('numbers', 'Numbers', KIND_CHOICES, levels),
    sizeOption([10, 20, 50, 100], [10, 20, 20]),
    toggleOption('negatives', 'Include negative numbers', [false, true, true]),
  ];
}
const kindOf = (o: GenOptions | undefined, fallback: NumberKind) => optOne(o, 'numbers', fallback) as NumberKind;

export const paAddSub = us('pa-add-sub', {
  levels: { 1: 'Integers', 2: 'Decimals', 3: 'Fractions' },
  options: [
    ...arithmeticOptions(['int', 'dec', 'frac']),
    radioOption('operation', 'Operations to use', [['add', 'Addition only'], ['sub', 'Subtraction only'], ['mix', 'Mix addition and subtraction']], ['mix', 'mix', 'mix']),
    radioOption('terms', 'Numbers involved', [['2', 'Two'], ['3', 'Three']], ['2', '2', '2']),
  ],
  generate(rng, _level, o) {
    const kind = kindOf(o, 'int');
    const size = optNum(o, 'size', 20), negatives = optOn(o, 'negatives', true);
    const n = Number(optOne(o, 'terms', '2'));
    const nums = Array.from({ length: n }, () => randomNumber(rng, kind, size, negatives));
    const op = optOne(o, 'operation', 'mix');
    const signs = nums.map((_, i) => (i === 0 ? 1 : op === 'add' ? 1 : op === 'sub' ? -1 : rng.sign()));
    const expr = nums.map((q, i) => (i === 0 ? '' : signs[i] > 0 ? ' + ' : ' - ') + wrapNeg(show(q, kind), i === 0)).join('');
    const total = nums.reduce((acc, q, i) => acc.add(q.mul(signs[i])), new Q(0));
    const answer = showAnswer(total, kind);
    const flipped = nums.reduce((acc, q, i) => acc.add(i === 0 ? q : q.mul(-signs[i])), new Q(0));
    const absAll = nums.reduce((acc, q, i) => acc.add(q.abs().mul(signs[i])), new Q(0));
    const naive = kind === 'frac' || kind === 'mixed'
      ? (() => { const top = nums.reduce((a, q, i) => a + q.n * signs[i], 0), bottom = nums.reduce((a, q) => a + q.d, 0); return new Q(top, bottom); })()
      : total.neg();
    return task(op === 'sub' ? 'Find each difference.' : op === 'add' ? 'Find each sum.' : 'Evaluate each expression.', 'Evaluate', expr, {
      answer: math(answer),
      distractors: wrong(math(answer), [flipped, absAll, naive, total.neg(), total.add(1)].map((q) => math(showAnswer(q, kind)))),
      solution: `${kind === 'frac' || kind === 'mixed' ? `Use the common denominator ${math(String(nums.reduce((a, q) => lcm(a, q.d), 1)))}. ` : ''}Subtracting a number is adding its opposite. ${math(`${expr} = ${answer}`)}`,
    });
  },
});

export const paMultiply = us('pa-multiply', {
  levels: { 1: 'Integers', 2: 'Decimals', 3: 'Fractions' },
  options: [...arithmeticOptions(['int', 'dec', 'frac']), radioOption('terms', 'Numbers involved', [['2', 'Two'], ['3', 'Three']], ['2', '2', '2'])],
  generate(rng, _level, o) {
    const kind = kindOf(o, 'int');
    const size = optNum(o, 'size', 20), negatives = optOn(o, 'negatives', true);
    const n = kind === 'int' ? Number(optOne(o, 'terms', '2')) : 2;
    const nums = Array.from({ length: n }, () => randomNumber(rng, kind, kind === 'dec' ? Math.min(size, 20) : kind === 'int' && n === 3 ? Math.min(size, 10) : size, negatives));
    const expr = nums.map((q, i) => wrapNeg(show(q, kind), i === 0)).join(' times ');
    const product = nums.reduce((a, q) => a.mul(q), new Q(1));
    const answer = showAnswer(product, kind);
    const wrongs = [product.neg(), product.mul(10), product.div(10)];
    if (kind === 'frac' || kind === 'mixed') wrongs.unshift(nums[0].div(nums[1]), new Q(nums[0].n * nums[1].d, nums[0].d + nums[1].d || 1));
    if (kind === 'mixed') {
      // Multiplying whole parts and fraction parts separately.
      const parts = nums.map((q) => ({ w: Math.trunc(q.n / q.d), f: new Q(q.n % q.d, q.d) }));
      wrongs.unshift(new Q(parts[0].w * parts[1].w).add(parts[0].f.mul(parts[1].f)));
    }
    return task('Find each product.', 'Evaluate', expr, {
      answer: math(answer),
      distractors: wrong(math(answer), wrongs.map((q) => math(showAnswer(q, kind)))),
      solution: kind === 'frac' || kind === 'mixed'
        ? `${kind === 'mixed' ? 'Write each mixed number as an improper fraction, then m' : 'M'}ultiply numerators and denominators: ${math(`${nums.map((q, i) => (i ? q.paren() : q.typst())).join(' times ')} = ${product.typst()}${product.d !== 1 && Math.abs(product.n) > product.d ? ` = ${answer}` : ''}`)}`
        : `${product.sign < 0 ? 'An odd number of negative factors gives a negative product. ' : ''}${math(`${expr} = ${answer}`)}`,
    });
  },
});

export const paDivide = us('pa-divide', {
  levels: { 1: 'Integers', 2: 'Decimals', 3: 'Fractions' },
  options: arithmeticOptions(['int', 'dec', 'frac']),
  generate(rng, _level, o) {
    const kind = kindOf(o, 'int');
    const size = optNum(o, 'size', 20), negatives = optOn(o, 'negatives', true);
    let a: Q, b: Q;
    if (kind === 'int') {
      b = randomNumber(rng, 'int', Math.min(size, 12), negatives);
      a = b.mul(randomNumber(rng, 'int', Math.min(size, 12), negatives));
    } else if (kind === 'dec') {
      // A divisor with one decimal place and a quotient with at most two.
      b = new Q((negatives ? rng.sign() : 1) * rng.int(2, 40), 10);
      a = b.mul(new Q(rng.int(2, 60), rng.pick([1, 10])));
    } else {
      a = randomNumber(rng, kind, size, negatives); b = randomNumber(rng, kind, size, negatives);
    }
    const expr = `${show(a, kind)} div ${wrapNeg(show(b, kind), false)}`;
    const quotient = a.div(b);
    const answer = showAnswer(quotient, kind);
    return task('Find each quotient.', 'Evaluate', expr, {
      answer: math(answer),
      distractors: wrong(math(answer), [b.div(a), a.mul(b), quotient.neg(), quotient.mul(10), quotient.div(10)].map((q) => math(showAnswer(q, kind)))),
      solution: kind === 'frac' || kind === 'mixed'
        ? `Multiply by the reciprocal of the divisor: ${math(`${a.typst()} times ${new Q(b.d, b.n).paren()} = ${quotient.typst()}`)}${quotient.d !== 1 && Math.abs(quotient.n) > quotient.d ? `, which is ${math(answer)}` : ''}.`
        : `${kind === 'dec' ? 'Move the decimal point in both numbers so the divisor is a whole number, then divide. ' : ''}${math(`${expr} = ${answer}`)}`,
    });
  },
});

// ── Factors and multiples ────────────────────────────────────────────────────

function primeFactors(n: number): number[] {
  const out: number[] = [];
  for (let f = 2; f * f <= n; f++) while (n % f === 0) { out.push(f); n /= f; }
  if (n > 1) out.push(n);
  return out;
}

const VARS = ['x', 'y', 'a', 'b', 'm', 'n'];

function randomMonomial(rng: Rng, vars: string[], maxPower: number, coefs: number[]): { coef: number; powers: Powers } {
  return { coef: rng.pick(coefs), powers: vars.map((v) => [v, rng.int(0, maxPower)] as [string, number]).filter(([, e], i) => e > 0 || i === 0).map(([v, e]) => [v, Math.max(1, e)] as [string, number]) };
}

export const paFactorMonomial = us('pa-factor-monomial', {
  levels: { 1: 'One variable', 2: 'Two variables', 3: 'Negative coefficients' },
  options: [radioOption('vars', 'Variables', [['1', 'One'], ['2', 'Two']], ['1', '2', '2']), toggleOption('negative', 'Include negative coefficients', [false, false, true])],
  generate(rng, _level, o) {
    const vars = VARS.slice(0, 2).slice(0, Number(optOne(o, 'vars', '1')));
    const coef = rng.pick([6, 8, 9, 10, 12, 14, 15, 18, 20, 24, 27, 28, 30, 36, 40, 42, 45, 48, 50, 54, 60, 63, 72]) * (optOn(o, 'negative', false) && rng.next() < 0.5 ? -1 : 1);
    const powers: Powers = vars.map((v) => [v, rng.int(1, 3)]);
    const factors = [...(coef < 0 ? ['-1'] : []), ...primeFactors(Math.abs(coef)).map(String), ...powers.flatMap(([v, e]) => Array(e).fill(v))];
    const answer = factors.join(' dot ');
    const shuffled = [...(coef < 0 ? ['-1'] : []), ...[Math.abs(coef) / primeFactors(Math.abs(coef))[0], primeFactors(Math.abs(coef))[0]].map(String), ...powers.flatMap(([v, e]) => Array(e).fill(v))].join(' dot ');
    const noVarRepeat = [...(coef < 0 ? ['-1'] : []), ...primeFactors(Math.abs(coef)).map(String), ...powers.map(([v, e]) => (e > 1 ? `${v}^${e}` : v))].join(' dot ');
    const missing = [...(coef < 0 ? ['-1'] : []), ...primeFactors(Math.abs(coef)).slice(1).map(String), ...powers.flatMap(([v, e]) => Array(e).fill(v))].join(' dot ');
    const extra = [...(coef < 0 ? ['-1'] : []), ...primeFactors(Math.abs(coef)).map(String), ...powers.flatMap(([v, e]) => Array(e + 1).fill(v))].join(' dot ');
    const positive = [...primeFactors(Math.abs(coef)).map(String), ...powers.flatMap(([v, e]) => Array(e).fill(v))].join(' dot ');
    return task('Factor each completely.', 'Factor completely:', monomial(coef, powers), {
      answer: math(answer),
      distractors: wrong(math(answer), [shuffled, noVarRepeat, missing, extra, coef < 0 ? positive : ''].filter(Boolean).map(math)),
      solution: `Write the coefficient as a product of primes, and each power as repeated factors: ${math(answer)}.`,
    }, '');
  },
});

function monomialSet(rng: Rng, count: number, twoVars: boolean): Array<{ coef: number; powers: Powers }> {
  const base = rng.pick([2, 3, 4, 5, 6, 7, 8, 9, 10, 12]);
  return Array.from({ length: count }, () => ({
    coef: base * rng.int(1, 9),
    powers: (twoVars ? ['x', 'y'] : ['x']).map((v) => [v, rng.int(1, 4)] as [string, number]),
  }));
}
const gcfOf = (ms: Array<{ coef: number; powers: Powers }>, pick: (a: number, b: number) => number, num: (a: number, b: number) => number) => ({
  coef: ms.map((m) => m.coef).reduce((a, b) => num(a, b)),
  powers: ms[0].powers.map(([v], i) => [v, ms.map((m) => m.powers[i][1]).reduce((a, b) => pick(a, b))] as [string, number]),
});

function monomialFactorGen(which: 'gcf' | 'lcm') {
  return us(which === 'gcf' ? 'pa-gcf-monomials' : 'pa-lcm-monomials', {
    levels: { 1: 'Two monomials, one variable', 2: 'Two monomials, two variables', 3: 'Three monomials' },
    options: [radioOption('count', 'Monomials', [['2', 'Two'], ['3', 'Three']], ['2', '2', '3']), toggleOption('twoVars', 'Use two variables', [false, true, true])],
    generate(rng, _level, o) {
      const ms = monomialSet(rng, Number(optOne(o, 'count', '2')), optOn(o, 'twoVars', false));
      const g = which === 'gcf' ? gcfOf(ms, (a, b) => Math.min(a, b), gcd) : gcfOf(ms, (a, b) => Math.max(a, b), lcm);
      const other = which === 'gcf' ? gcfOf(ms, (a, b) => Math.max(a, b), lcm) : gcfOf(ms, (a, b) => Math.min(a, b), gcd);
      const answer = monomial(g.coef, g.powers);
      const list = ms.map((m) => monomial(m.coef, m.powers)).join(', ');
      return task(`Find the ${which === 'gcf' ? 'GCF' : 'LCM'} of each.`, `Find the ${which === 'gcf' ? 'greatest common factor' : 'least common multiple'} of`, list, {
        answer: math(answer),
        distractors: wrong(math(answer), [
          monomial(other.coef, other.powers),
          monomial(g.coef, other.powers),
          monomial(other.coef, g.powers),
          monomial(ms.map((m) => m.coef).reduce((a, b) => a * b), g.powers),
        ].map(math)),
        solution: which === 'gcf'
          ? `Take the GCF of the coefficients and the lowest power of each variable: ${math(answer)}.`
          : `Take the LCM of the coefficients and the highest power of each variable: ${math(answer)}.`,
      });
    },
  });
}
export const paGcfMonomials = monomialFactorGen('gcf');
export const paLcmMonomials = monomialFactorGen('lcm');

// ── Fractions ────────────────────────────────────────────────────────────────

/** A fraction divided by only the smallest prime of its GCF: a partly simplified answer. */
function partial(n: number, d: number): string {
  const g = gcd(n, d);
  const s = primeFactors(g)[0] ?? 1;
  return s === g ? `${n}/${d}` : `${n / s}/${d / s}`;
}

export const paSimplifyFractions = us('pa-simplify-fractions', {
  levels: { 1: 'Simplify a fraction', 2: 'Improper fraction to mixed number', 3: 'Mixed number to improper fraction' },
  options: [radioOption('form', 'Question', [['simplify', 'Simplify a fraction'], ['toMixed', 'Improper fraction to mixed number'], ['toImproper', 'Mixed number to improper fraction']], ['simplify', 'toMixed', 'toImproper'])],
  generate(rng, _level, o) {
    const form = optOne(o, 'form', 'simplify');
    if (form === 'simplify') {
      const d = rng.int(2, 12), n = rng.int(1, d - 1), k = rng.int(2, 9);
      const f = new Q(n, d);
      const answer = f.typst();
      return task('Simplify each fraction.', 'Simplify', `${n * k}/${d * k}`, {
        answer: math(answer),
        distractors: wrong(math(answer), [partial(n * k, d * k), `${f.d}/${f.n}`, new Q(n * k + 1, d * k).typst(), new Q(n + 1, d).typst()].map(math)),
        solution: `Divide the numerator and the denominator by their GCF, ${math(String(gcd(n * k, d * k)))}: ${math(`${n * k}/${d * k} = ${answer}`)}.`,
      });
    }
    const d = rng.int(2, 12), w = rng.int(1, 9), r = rng.int(1, d - 1);
    const improper = `${w * d + r}/${d}`, mixedText = mixed(w * d + r, d);
    if (form === 'toMixed') {
      return task('Write each as a mixed number.', 'Write as a mixed number:', improper, {
        answer: math(mixedText),
        distractors: wrong(math(mixedText), [`${w} ${d}/${r}`, `${w + 1} ${r}/${d}`, `${w} ${r}/${w * d + r}`, `${r} ${w}/${d}`].map(math)),
        solution: `${math(`${w * d + r} div ${d} = ${w}`)} remainder ${math(String(r))}, so ${math(`${improper} = ${mixedText}`)}.`,
      }, '');
    }
    return task('Write each as an improper fraction.', 'Write as an improper fraction:', mixedText, {
      answer: math(improper),
      distractors: wrong(math(improper), [`${w + r}/${d}`, `${w * d}/${d}`, `${w * r + d}/${d}`, `${w * d + r}/${w * d}`].map(math)),
      solution: `Multiply the whole number by the denominator and add the numerator: ${math(`${w} times ${d} + ${r} = ${w * d + r}`)}, so ${math(`${mixedText} = ${improper}`)}.`,
    }, '');
  },
});

/** A repeating or terminating decimal for n/d, with an overline on the repeating part: 1/6 → `0.1overline(6)`. */
export function decimalExpansion(n: number, d: number): string {
  const sign = n * d < 0 ? '-' : '';
  n = Math.abs(n); d = Math.abs(d);
  const whole = Math.floor(n / d);
  let rem = n % d;
  const digits: number[] = [];
  const seen = new Map<number, number>();
  while (rem && !seen.has(rem) && digits.length < 20) {
    seen.set(rem, digits.length);
    rem *= 10;
    digits.push(Math.floor(rem / d));
    rem %= d;
  }
  if (!digits.length) return `${sign}${whole}`;
  if (!rem) return `${sign}${whole}.${digits.join('')}`;
  const at = seen.get(rem)!;
  return `${sign}${whole}.${digits.slice(0, at).join('')}overline(${digits.slice(at).join('')})`;
}

export const paFracDec = us('pa-frac-dec', {
  levels: { 1: 'Fraction to terminating decimal', 2: 'Fraction to repeating decimal', 3: 'Decimal to fraction' },
  options: [radioOption('form', 'Question', [['terminating', 'Fraction to terminating decimal'], ['repeating', 'Fraction to repeating decimal'], ['toFraction', 'Decimal to fraction']], ['terminating', 'repeating', 'toFraction'])],
  generate(rng, _level, o) {
    const form = optOne(o, 'form', 'terminating');
    if (form === 'toFraction') {
      const places = rng.int(1, 3), scale = 10 ** places;
      let n = rng.int(1, scale * 3 - 1);
      if (n % 10 === 0) n += 1;
      const text = (n / scale).toFixed(places);
      const f = new Q(n, scale);
      const answer = mixed(f.n, f.d);
      return task('Write each as a fraction in simplest form.', 'Write as a fraction in simplest form:', text, {
        answer: math(answer),
        distractors: wrong(math(answer), [`${n}/${scale * 10}`, `${n}/${scale / 10 || 1}`, `${f.d}/${f.n}`, `${n}/${scale}`].map((s) => { const [a, b] = s.split('/').map(Number); return math(b === 1 ? String(a) : `${a}/${b}`); })),
        solution: `${math(`${text} = ${n}/${scale}`)}, which simplifies to ${math(answer)}.`,
      }, '');
    }
    const d = form === 'terminating' ? rng.pick([2, 4, 5, 8, 10, 16, 20, 25, 40]) : rng.pick([3, 6, 7, 9, 11, 12, 15, 18]);
    let n = rng.int(1, d * 2 - 1);
    while (gcd(n, d) !== 1) n++;
    const answer = decimalExpansion(n, d);
    const noBar = answer.replace(/overline\((\d+)\)/, '$1');
    return task('Write each as a decimal.', 'Write as a decimal:', `${n}/${d}`, {
      answer: math(answer),
      distractors: wrong(math(answer), [decimalExpansion(d, n).length < 12 ? decimalExpansion(d, n) : '', noBar !== answer ? noBar : `${answer}0`, decimalExpansion(n, d * 10), decimalExpansion(n + 1, d)].filter(Boolean).map(math)),
      solution: `Divide the numerator by the denominator: ${math(`${n} div ${d} = ${answer}`)}${answer.includes('overline') ? ', with the bar over the digits that repeat' : ''}.`,
    }, '');
  },
});

// ── Divisibility ─────────────────────────────────────────────────────────────

export const paDivisibility = us('pa-divisibility', {
  levels: { 1: 'Two- and three-digit numbers', 2: 'Four-digit numbers', 3: 'Five-digit numbers' },
  options: [sizeOption([3, 4, 5], [3, 4, 5], 'Digits')],
  generate(rng, level, o) {
    const digits = optNum(o, 'size', level + 2);
    // Make divisibility by several numbers likely by building from a multiple of 6 or 10 often.
    const base = rng.pick([1, 2, 3, 6, 10, 9, 4]);
    let n = 0;
    do n = base * rng.int(Math.ceil(10 ** (digits - 1) / base), Math.floor((10 ** digits - 1) / base)); while (n < 10 ** (digits - 1));
    const divisors = [2, 3, 4, 5, 6, 9, 10];
    const yes = divisors.filter((k) => n % k === 0);
    const answer = yes.length ? yes.join(', ') : '"none"';
    const flip = (k: number) => (yes.includes(k) ? yes.filter((x) => x !== k) : [...yes, k].sort((a, b) => a - b));
    return {
      body: `Determine which of 2, 3, 4, 5, 6, 9, and 10 divide ${math(String(n))}.`,
      task: { instruction: 'Determine whether each number is divisible by 2, 3, 4, 5, 6, 9, or 10.', item: math(String(n)) },
      answer: math(answer),
      distractors: wrong(math(answer), rng.shuffle(divisors).slice(0, 4).map((k) => { const l = flip(k); return math(l.length ? l.join(', ') : '"none"'); })),
      solution: `The digit sum is ${String(n).split('').reduce((a, c) => a + Number(c), 0)} (for 3 and 9); the last two digits are ${String(n).slice(-2)} (for 4); the last digit is ${String(n).slice(-1)} (for 2, 5, and 10). So ${math(String(n))} is divisible by ${math(answer)}.`,
    };
  },
});

// ── Exponents ────────────────────────────────────────────────────────────────

export const paExponentProperties = us('pa-exponent-properties', {
  levels: { 1: 'Products and quotients of powers', 2: 'Powers of products and powers', 3: 'Negative exponents' },
  options: [
    manyOption('rules', 'Properties', [['product', 'Product of powers'], ['quotient', 'Quotient of powers'], ['power', 'Power of a power or product']], [['product', 'quotient'], ['product', 'quotient', 'power'], ['product', 'quotient', 'power']]),
    toggleOption('negative', 'Include negative exponents', [false, false, true]),
    toggleOption('coefs', 'Include coefficients', [true, true, true]),
  ],
  generate(rng, _level, o) {
    const rule = rng.pick(optList(o, 'rules', ['product']));
    const neg = optOn(o, 'negative', false), coefs = optOn(o, 'coefs', true);
    const e = () => (neg ? rng.nonZero(-4, 4) : rng.int(1, 5));
    const vars = rng.next() < 0.5 ? ['x'] : ['x', 'y'];
    const c = () => (coefs ? rng.int(1, 6) : 1);
    let expr: string, coef: Q, powers: Powers, naiveCoef: Q, naive: Powers;
    const term = (k: number, ps: Powers) => monomial(k, ps).replace(/\^\((-\d+)\)/g, '^($1)');
    if (rule === 'product') {
      const a = { k: c(), ps: vars.map((v) => [v, e()] as [string, number]) }, b = { k: c(), ps: vars.map((v) => [v, e()] as [string, number]) };
      expr = `${term(a.k, a.ps)} dot ${term(b.k, b.ps)}`;
      coef = new Q(a.k * b.k); powers = vars.map((v, i) => [v, a.ps[i][1] + b.ps[i][1]]);
      naiveCoef = new Q(a.k + b.k); naive = vars.map((v, i) => [v, a.ps[i][1] * b.ps[i][1]]);
    } else if (rule === 'quotient') {
      const b = { k: c(), ps: vars.map((v) => [v, e()] as [string, number]) };
      const k = c() * b.k;
      const a = { k, ps: vars.map((v) => [v, e() + (neg ? 0 : 3)] as [string, number]) };
      expr = `(${term(a.k, a.ps)})/(${term(b.k, b.ps)})`;
      coef = new Q(a.k, b.k); powers = vars.map((v, i) => [v, a.ps[i][1] - b.ps[i][1]]);
      naiveCoef = new Q(a.k - b.k || 1); naive = vars.map((v, i) => [v, Math.max(1, Math.round(a.ps[i][1] / (b.ps[i][1] || 1)))]);
    } else {
      const a = { k: coefs ? rng.int(1, 3) : 1, ps: vars.map((v) => [v, e()] as [string, number]) };
      const n = neg ? rng.pick([-2, -1, 2, 3]) : rng.int(2, 3);
      expr = `(${term(a.k, a.ps)})^${n < 0 ? `(${n})` : n}`;
      coef = n > 0 ? new Q(a.k ** n) : new Q(1, a.k ** -n);
      powers = vars.map((v, i) => [v, a.ps[i][1] * n]);
      naiveCoef = new Q(a.k * Math.abs(n)); naive = vars.map((v, i) => [v, a.ps[i][1] + n]);
    }
    const shown = (k: Q, ps: Powers) => (ps.every(([, x]) => x === 0) ? k.typst() : monomialQuotient(k.n, k.d, ps));
    const answer = shown(coef, powers);
    const flipped: Powers = powers.map(([v, x]) => [v, -x]);
    return task('Simplify. Your answer should contain only positive exponents.', 'Simplify', expr, {
      answer: math(answer),
      distractors: wrong(math(answer), [shown(naiveCoef, powers), shown(coef, naive), shown(naiveCoef, naive), shown(coef, flipped)].map(math)),
      solution: `${rule === 'product' ? 'Multiply the coefficients and add the exponents of each variable' : rule === 'quotient' ? 'Divide the coefficients and subtract the exponents of each variable' : 'Raise each factor to the power, multiplying exponents'}${neg ? '; then write negative exponents as positive exponents in the denominator' : ''}: ${math(`${expr} = ${answer}`)}.`,
    });
  },
});

// ── Scientific notation ──────────────────────────────────────────────────────

/** Mantissa (1 ≤ m < 10, as text) and exponent of a positive value given by digits and a power of ten. */
function sci(m: number, e: number): string {
  return `${decimal(m)} times 10^${e < 0 ? `(${e})` : e}`;
}
function standard(m: number, e: number): string {
  // Exact decimal text without floating noise.
  const [int, frac = ''] = decimal(m).split('.');
  const digits = int + frac;
  const point = int.length + e;
  if (point <= 0) return `0.${'0'.repeat(-point)}${digits}`.replace(/0+$/, '');
  if (point >= digits.length) return grouped(Number(digits + '0'.repeat(point - digits.length)));
  return `${digits.slice(0, point)}.${digits.slice(point)}`;
}

export const paSciWrite = us('pa-sci-write', {
  levels: { 1: 'Large numbers', 2: 'Small numbers', 3: 'Both' },
  options: [
    radioOption('direction', 'Write in', [['sci', 'Scientific notation'], ['std', 'Standard notation'], ['both', 'Either']], ['both', 'both', 'both']),
    radioOption('size', 'Numbers', [['large', 'Large'], ['small', 'Small'], ['both', 'Both']], ['large', 'small', 'both']),
  ],
  generate(rng, _level, o) {
    const size = optOne(o, 'size', 'large');
    const small = size === 'small' || (size === 'both' && rng.next() < 0.5);
    const m = rng.int(10, 999) / 100;
    const e = small ? -rng.int(1, 6) : rng.int(2, 8);
    const direction = optOne(o, 'direction', 'both') === 'both' ? rng.pick(['sci', 'std'] as const) : optOne(o, 'direction', 'sci');
    const s = sci(m, e), t = standard(m, e);
    if (direction === 'sci') {
      return task('Write each number in scientific notation.', 'Write in scientific notation:', t, {
        answer: math(s),
        distractors: wrong(math(s), [sci(m, -e), sci(m, e + 1), sci(m, e - 1), sci(m * 10, e - 1)].map(math)),
        solution: `Move the decimal point ${Math.abs(e)} place${Math.abs(e) === 1 ? '' : 's'} so one non-zero digit is to its left; ${small ? 'the number is less than 1, so the exponent is negative' : 'the number is large, so the exponent is positive'}: ${math(s)}.`,
      }, '');
    }
    return task('Write each number in standard notation.', 'Write in standard notation:', s, {
      answer: math(t),
      distractors: wrong(math(t), [standard(m, -e), standard(m, e + 1), standard(m, e - 1)].map(math)),
      solution: `Move the decimal point ${Math.abs(e)} place${Math.abs(e) === 1 ? '' : 's'} to the ${e > 0 ? 'right' : 'left'}: ${math(t)}.`,
    }, '');
  },
});

function sciOps(addSub: boolean) {
  return us(addSub ? 'a1-sci-add-sub' : 'pa-sci-ops', {
    levels: addSub ? { 1: 'Same power of ten', 2: 'Powers differ by one', 3: 'Powers differ by up to three' } : { 1: 'Multiplication', 2: 'Division', 3: 'Mixed, with negative exponents' },
    options: addSub
      ? [radioOption('operation', 'Operation', [['add', 'Addition'], ['sub', 'Subtraction'], ['mix', 'Either']], ['mix', 'mix', 'mix'])]
      : [radioOption('operation', 'Operation', [['mul', 'Multiplication'], ['div', 'Division'], ['mix', 'Either']], ['mul', 'div', 'mix']), toggleOption('negative', 'Include negative exponents', [false, false, true])],
    generate(rng, level, o) {
      const op = optOne(o, 'operation', 'mix');
      const pick = op === 'mix' ? (addSub ? rng.pick(['add', 'sub']) : rng.pick(['mul', 'div'])) : op;
      const neg = optOn(o, 'negative', false);
      const exp = () => (neg ? rng.int(-6, 6) : rng.int(1, 8));
      const a = { m: rng.int(11, 99) / 10, e: exp() }, b = { m: rng.int(11, 99) / 10, e: exp() };
      if (addSub) b.e = a.e - rng.int(0, level === 1 ? 0 : level === 2 ? 1 : 3);
      if (pick === 'sub' && b.e === a.e && b.m >= a.m) [a.m, b.m] = b.m === a.m ? [a.m, Number((a.m - 0.1).toFixed(1))] : [b.m, a.m];
      const value = pick === 'mul' ? a.m * b.m * 10 ** (a.e + b.e) : pick === 'div' ? (a.m / b.m) * 10 ** (a.e - b.e) : pick === 'add' ? a.m * 10 ** a.e + b.m * 10 ** b.e : a.m * 10 ** a.e - b.m * 10 ** b.e;
      const norm = (v: number) => { const e = Math.floor(Math.log10(Math.abs(v)) + 1e-12); let m = Number((v / 10 ** e).toPrecision(addSub ? 4 : 3)); let ee = e; if (Math.abs(m) >= 10) { m /= 10; ee++; } return { m, e: ee }; };
      const r = norm(value);
      const sym = { mul: 'times', div: 'div', add: '+', sub: '-' }[pick];
      const expr = `(${sci(a.m, a.e)}) ${sym} (${sci(b.m, b.e)})`;
      const answer = sci(r.m, r.e);
      const naive = pick === 'mul' ? sci(Number((a.m * b.m).toPrecision(3)), a.e + b.e) : pick === 'div' ? sci(Number((a.m / b.m).toPrecision(3)), a.e - b.e) : sci(Number((pick === 'add' ? a.m + b.m : a.m - b.m).toPrecision(3)), a.e);
      return task(addSub ? 'Simplify. Write each answer in scientific notation.' : 'Simplify. Write each answer in scientific notation.', 'Simplify:', expr, {
        answer: math(answer),
        distractors: wrong(math(answer), [naive, sci(r.m, r.e + 1), sci(r.m, r.e - 1), sci(r.m, -r.e)].map(math)),
        solution: pick === 'mul' || pick === 'div'
          ? `${pick === 'mul' ? 'Multiply' : 'Divide'} the decimal parts and ${pick === 'mul' ? 'add' : 'subtract'} the exponents, then adjust so the decimal part is between 1 and 10: ${math(answer)}.`
          : `Rewrite with the same power of ten, ${pick === 'add' ? 'add' : 'subtract'} the decimal parts, then adjust: ${math(answer)}.`,
      }, '');
    },
  });
}
export const paSciOps = sciOps(false);
export const a1SciAddSub = sciOps(true);

// ── Percents ─────────────────────────────────────────────────────────────────

export const paFdp = us('pa-fdp', {
  levels: { 1: 'Percents and decimals', 2: 'Fractions and percents', 3: 'Any direction, including over 100% and under 1%' },
  options: [radioOption('from', 'Convert from', [['percent', 'Percent'], ['decimal', 'Decimal'], ['fraction', 'Fraction'], ['any', 'Any']], ['any', 'any', 'any']), toggleOption('unusual', 'Include percents over 100% and under 1%', [false, false, true])],
  generate(rng, level, o) {
    const unusual = optOn(o, 'unusual', false);
    const d = rng.pick(level === 1 ? [100, 20, 25, 50, 10] : [2, 4, 5, 8, 10, 20, 25, 40, 50]);
    let n = rng.int(1, d - 1);
    while (gcd(n, d) !== 1) n++;
    let f = new Q(n, d);
    if (unusual && rng.next() < 0.5) f = rng.next() < 0.5 ? f.add(rng.int(1, 2)) : f.div(rng.pick([10, 100]));
    const pct = decimal(f.value * 100), dec = decimal(f.value), frac = f.typst();
    type Form = 'percent' | 'decimal' | 'fraction';
    const from = (optOne(o, 'from', 'any') === 'any' ? rng.pick(['percent', 'decimal', 'fraction'] as const) : optOne(o, 'from', 'percent')) as Form;
    const to = rng.pick((['percent', 'decimal', 'fraction'] as Form[]).filter((x) => x !== from));
    const text = { percent: `${pct}%`, decimal: dec, fraction: frac };
    const word = { percent: 'a percent', decimal: 'a decimal', fraction: 'a fraction in simplest form' }[to];
    const answer = text[to];
    const wrongs = to === 'percent' ? [`${decimal(f.value * 10)}%`, `${decimal(f.value)}%`, `${decimal(f.value * 1000)}%`] : to === 'decimal' ? [decimal(f.value * 10), decimal(f.value / 10), decimal(f.value * 100)] : [new Q(f.n, f.d * 10).typst(), new Q(f.n * 10, f.d).typst(), `${f.d}/${f.n}`];
    const show = (s: string) => math(s.replace('%', '"%"'));
    return {
      body: `Write ${show(text[from])} as ${word}.`,
      task: { instruction: `Write each as ${word}.`, item: show(text[from]) },
      answer: show(answer),
      distractors: wrong(show(answer), wrongs.map(show)),
      solution: `${from === 'percent' ? 'Percent means "per hundred": divide by 100. ' : to === 'percent' ? 'Multiply by 100 to write a percent. ' : to === 'decimal' ? 'Divide the numerator by the denominator. ' : 'Write the decimal over a power of ten and simplify. '}${show(`${text[from]} = ${answer}`)}.`,
    };
  },
});

export const paPercent = us('pa-percent', {
  levels: { 1: 'Find a percent of a number', 2: 'Find what percent one number is of another', 3: 'Find the whole' },
  options: [radioOption('form', 'Find', [['part', 'The part'], ['percent', 'The percent'], ['whole', 'The whole'], ['any', 'Any']], ['part', 'percent', 'whole']), toggleOption('words', 'Word problems', [false, false, false])],
  generate(rng, _level, o) {
    const form = optOne(o, 'form', 'part') === 'any' ? rng.pick(['part', 'percent', 'whole'] as const) : optOne(o, 'form', 'part');
    const pct = rng.pick([5, 10, 12, 15, 20, 25, 30, 35, 40, 45, 50, 60, 64, 75, 80, 90, 120, 150]);
    const whole = rng.pick([20, 40, 60, 80, 100, 120, 140, 160, 200, 240, 300, 400, 500]);
    const part = (pct * whole) / 100;
    const P = (v: number) => math(`${decimal(v)}"%"`);
    const N = (v: number) => math(decimal(v));
    if (optOn(o, 'words', false)) {
      const name = rng.pick(NAMES);
      const ctx = rng.pick([
        { part: 'questions correct', whole: 'questions on a test', were: 'answered correctly' },
        { part: 'seats filled', whole: 'seats in a theatre', were: 'filled' },
        { part: 'free throws made', whole: 'free throws attempted', were: 'made' },
      ]);
      const q = form === 'part' ? `${name} counted ${N(whole)} ${ctx.whole}. ${P(pct)} of them were ${ctx.were}. How many is that?`
        : form === 'percent' ? `Of ${N(whole)} ${ctx.whole}, ${name} counted ${N(part)} ${ctx.part}. What percent is that?`
          : `${name} counted ${N(part)} ${ctx.part}, which is ${P(pct)} of the ${ctx.whole}. How many ${ctx.whole} are there?`;
      const ans = form === 'part' ? N(part) : form === 'percent' ? P(pct) : N(whole);
      const alt = form === 'part' ? [N(whole / pct), N(part * 10), N(whole - part)] : form === 'percent' ? [P(Math.round((whole / part) * 1000) / 10), P(100 - pct), P(pct / 10)] : [N(part * pct / 100), N(part * 2), N(whole + part)];
      return { body: q, answer: ans, distractors: wrong(ans, alt), solution: `Use part = percent × whole: ${math(`${decimal(part)} = ${decimal(pct / 100)} times ${decimal(whole)}`)}.` };
    }
    if (form === 'part') {
      return {
        body: `What is ${P(pct)} of ${N(whole)}?`, task: { instruction: 'Find each.', item: `${P(pct)} of ${N(whole)}` },
        answer: N(part), distractors: wrong(N(part), [N(whole / pct), N(part * 10), N(whole - part), N(pct + whole)]),
        solution: `${math(`${decimal(pct / 100)} times ${decimal(whole)} = ${decimal(part)}`)}.`,
      };
    }
    if (form === 'percent') {
      return {
        body: `What percent of ${N(whole)} is ${N(part)}?`, task: { instruction: 'Find each percent.', item: `${N(part)} of ${N(whole)}` },
        answer: P(pct), distractors: wrong(P(pct), [P(Math.round((whole / part) * 1000) / 10), P(pct / 10), P(100 - pct), P(part)]),
        solution: `${math(`${decimal(part)} / ${decimal(whole)} = ${decimal(pct / 100)}`)}, which is ${P(pct)}.`,
      };
    }
    return {
      body: `${N(part)} is ${P(pct)} of what number?`, task: { instruction: 'Find each whole.', item: `${N(part)} is ${P(pct)} of what` },
      answer: N(whole), distractors: wrong(N(whole), [N(part * pct / 100), N(part * 2), N(part + pct), N(whole / 10)]),
      solution: `${math(`${decimal(part)} div ${decimal(pct / 100)} = ${decimal(whole)}`)}.`,
    };
  },
});

export const paPercentChange = us('pa-percent-change', {
  levels: { 1: 'Whole-number percents', 2: 'Round to the nearest tenth of a percent', 3: 'Word problems' },
  options: [radioOption('form', 'Questions', [['numbers', 'From one number to another'], ['words', 'Word problems']], ['numbers', 'numbers', 'words']), toggleOption('round', 'Answers need rounding', [false, true, true])],
  generate(rng, _level, o) {
    const round = optOn(o, 'round', false);
    const old = rng.pick([20, 25, 40, 50, 60, 80, 100, 120, 150, 200, 250, 400]);
    const rate = round ? rng.int(-60, 90) + rng.int(1, 9) / 10 : rng.pick([-75, -50, -40, -25, -20, -10, 5, 10, 20, 25, 40, 50, 60, 75, 100, 150]);
    const neu = round ? Math.round(old * (1 + rate / 100)) : (old * (100 + rate)) / 100;
    if (neu === old || neu <= 0) return paPercentChange.generate(rng, 1, o);
    const change = ((neu - old) / old) * 100;
    const pct = round ? fixed(Math.abs(change), 1) : decimal(Math.abs(change));
    const dir = change > 0 ? 'increase' : 'decrease';
    const answer = `${math(`${pct}"%"`)} ${dir}`;
    const other = change > 0 ? 'decrease' : 'increase';
    const byNew = round || (Math.abs(neu - old) / neu * 100) % 1 ? fixed(Math.abs(neu - old) / neu * 100, 1) : decimal(Math.abs(neu - old) / neu * 100);
    const words = optOne(o, 'form', 'numbers') === 'words';
    const item = rng.pick(['a bicycle', 'a concert ticket', 'a monthly phone plan', 'a pair of skates']);
    return {
      body: words
        ? `The price of ${item} changed from ${math(money(old))} to ${math(money(neu))}. Find the percent of change.`
        : `Find the percent of change from ${math(decimal(old))} to ${math(decimal(neu))}.`,
      ...(words ? {} : { task: { instruction: 'Find each percent of change. State whether it is an increase or a decrease.', item: `${math(decimal(old))} to ${math(decimal(neu))}` } }),
      answer,
      distractors: wrong(answer, [`${math(`${pct}"%"`)} ${other}`, `${math(`${byNew}"%"`)} ${dir}`, `${math(`${decimal(Math.abs(neu - old))}"%"`)} ${dir}`]),
      solution: `Percent of change = (new − original) ÷ original = ${math(`(${decimal(neu)} - ${decimal(old)}) / ${decimal(old)} approx ${decimal(change / 100, 4)}`)}, a ${pct}% ${dir}.`,
    };
  },
});

export const paMarkup = us('pa-markup', {
  levels: { 1: 'Find the new price', 2: 'Find the rate', 3: 'Find the original price' },
  options: [
    manyOption('kinds', 'Kinds', [['markup', 'Markup'], ['discount', 'Discount'], ['tax', 'Sales tax'], ['tip', 'Tip']], [['markup', 'discount', 'tax', 'tip'], ['markup', 'discount', 'tax', 'tip'], ['markup', 'discount', 'tax']]),
    radioOption('find', 'Find', [['new', 'The new price'], ['rate', 'The rate'], ['original', 'The original price']], ['new', 'rate', 'original']),
  ],
  generate(rng, _level, o) {
    const kind = rng.pick(optList(o, 'kinds', ['markup'])) as 'markup' | 'discount' | 'tax' | 'tip';
    const find = optOne(o, 'find', 'new');
    const rate = kind === 'tax' ? rng.pick([5, 6, 7, 8, 12, 13, 15]) : kind === 'tip' ? rng.pick([10, 15, 18, 20, 25]) : kind === 'markup' ? rng.pick([20, 25, 30, 40, 50, 60, 75, 100]) : rng.pick([10, 15, 20, 25, 30, 40, 50, 60]);
    const price = rng.int(8, 160) + (find === 'original' ? 0 : rng.pick([0, 0.5, 0.99, 0.25]));
    const factor = kind === 'discount' ? 1 - rate / 100 : 1 + rate / 100;
    const total = Math.round(price * factor * 100) / 100;
    const what = { markup: 'Cost', discount: 'Original price', tax: 'Price', tip: 'Meal' }[kind];
    const word = { markup: 'markup', discount: 'discount', tax: 'tax', tip: 'tip' }[kind];
    const result = { markup: 'selling price', discount: 'sale price', tax: 'total price', tip: 'total cost' }[kind];
    const P = (v: number) => math(`${decimal(v)}"%"`);
    if (find === 'new') {
      const answer = math(money(total));
      return {
        body: `${what}: ${math(money(price))}. ${word.charAt(0).toUpperCase() + word.slice(1)}: ${P(rate)}. Find the ${result}.`,
        answer,
        distractors: wrong(answer, [money(Math.round(price * (rate / 100) * 100) / 100), money(Math.round(price * (kind === 'discount' ? 1 + rate / 100 : 1 - rate / 100) * 100) / 100), money(price + rate)].map(math)),
        solution: `The ${word} is ${math(`${decimal(rate / 100)} times ${money(price)} = ${money(Math.round(price * rate) / 100)}`)}. ${kind === 'discount' ? 'Subtract' : 'Add'} it: ${answer}.`,
      };
    }
    if (find === 'rate') {
      const answer = P(rate);
      return {
        body: `${what}: ${math(money(price))}. ${result.charAt(0).toUpperCase() + result.slice(1)}: ${math(money(total))}. Find the rate of ${word}.`,
        answer,
        distractors: wrong(answer, [P(Math.round(Math.abs(total - price) / total * 1000) / 10), P(rate / 10), P(100 - rate)]),
        solution: `The ${word} is ${math(money(Math.round(Math.abs(total - price) * 100) / 100))}; divide by the original amount: ${math(`${decimal(Math.round(Math.abs(total - price) * 100) / 100)} div ${decimal(price)} approx ${decimal(rate / 100)}`)}, or ${answer}.`,
      };
    }
    const exact = Math.round(price * factor * 100) / 100;
    const answer = math(money(price));
    return {
      body: `After a ${P(rate)} ${word}, the ${result} is ${math(money(exact))}. Find the ${what.toLowerCase()} before the ${word}.`,
      answer,
      distractors: wrong(answer, [money(Math.round(exact * (kind === 'discount' ? 1 + rate / 100 : 1 - rate / 100) * 100) / 100), money(Math.round(exact * factor * 100) / 100), money(exact - rate)].map(math)),
      solution: `The ${result} is ${math(`${decimal(factor)}`)} times the original, so divide: ${math(`${decimal(exact)} div ${decimal(factor)} = ${decimal(price)}`)}.`,
    };
  },
});

export const paInterest = us('pa-interest', {
  levels: { 1: 'Simple interest', 2: 'Compound interest', 3: 'Compounded continuously' },
  options: [
    radioOption('kind', 'Interest', [['simple', 'Simple'], ['compound', 'Compound'], ['continuous', 'Compounded continuously']], ['simple', 'compound', 'continuous']),
    radioOption('find', 'Find', [['balance', 'The balance'], ['interest', 'The interest earned']], ['balance', 'balance', 'balance']),
  ],
  generate(rng, _level, o) {
    const kind = optOne(o, 'kind', 'simple');
    const find = optOne(o, 'find', 'balance');
    const P = rng.pick([200, 500, 750, 1000, 1200, 1500, 2000, 2500, 3000, 5000, 8000, 10000]);
    const r = rng.pick([1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6, 7, 8]);
    const t = rng.int(2, 15);
    const n = rng.pick([[1, 'annually'], [2, 'semi-annually'], [4, 'quarterly'], [12, 'monthly'], [365, 'daily']] as const);
    const A = kind === 'simple' ? P * (1 + (r / 100) * t) : kind === 'compound' ? P * (1 + r / 100 / n[0]) ** (n[0] * t) : P * Math.exp((r / 100) * t);
    const value = find === 'balance' ? A : A - P;
    const answer = math(money(value));
    const how = kind === 'simple' ? 'simple interest' : kind === 'compound' ? `interest compounded ${n[1]}` : 'interest compounded continuously';
    const simpleA = P * (1 + (r / 100) * t), annualA = P * (1 + r / 100) ** t;
    const alt = [simpleA, annualA, P * (1 + r / 100 / n[0]) ** (n[0] * t), P * Math.exp((r / 100) * t), P * (1 + r * t)].map((x) => (find === 'balance' ? x : x - P));
    return {
      body: `${math(money(P))} is invested at ${math(`${r}"%"`)} ${how} for ${t} years. Find the ${find === 'balance' ? 'balance at the end' : 'interest earned'}. Round to the nearest cent.`,
      answer,
      distractors: wrong(answer, [...alt, find === 'balance' ? A - P : A].map((x) => math(money(x)))),
      solution: kind === 'simple'
        ? `${math(`I = P r t = ${P} times ${decimal(r / 100)} times ${t} = ${decimal(P * (r / 100) * t)}`)}${find === 'balance' ? `; the balance is ${math(money(A))}` : ''}.`
        : kind === 'compound'
          ? `${math(`A = P(1 + r/n)^(n t) = ${P}(1 + ${decimal(r / 100)}/${n[0]})^(${n[0] * t}) approx ${fixed(A, 2)}`)}${find === 'interest' ? `; the interest is ${math(money(A - P))}` : ''}.`
          : `${math(`A = P e^(r t) = ${P} e^(${decimal(r / 100)} times ${t}) approx ${fixed(A, 2)}`)}${find === 'interest' ? `; the interest is ${math(money(A - P))}` : ''}.`,
    };
  },
});

export const PREALGEBRA_NUMBER = [
  paRound, paWords, paAddSub, paMultiply, paDivide, paFactorMonomial, paGcfMonomials, paLcmMonomials,
  paSimplifyFractions, paFracDec, paDivisibility, paExponentProperties, paSciWrite, paSciOps, a1SciAddSub,
  paFdp, paPercent, paPercentChange, paMarkup, paInterest,
];
