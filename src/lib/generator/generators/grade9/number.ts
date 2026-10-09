import type { Rng } from '../../rng.ts';
import { Q } from '../../exact.ts';
import { gcd as gcdOf } from '../../format.ts';
import { math, mb10f } from '../pc40s/common.ts';
import { dec, distinct, numberLine } from '../grade10/shared.ts';
import { optNum, optOn, radioOption, sizeOption, toggleOption } from '../../options.ts';

/** Dollars, with the minus sign outside: `−\\$8.00`. */
const money = (v: number) => `${v < 0 ? '−' : ''}\\$${Math.abs(v).toFixed(2)}`;
const par = (n: number) => (n < 0 ? `(${n})` : String(n));
const powText = (b: number, e: number) => `${par(b)}^${e}`;

// ── Powers ────────────────────────────────────────────────────────────────

export const powRepeated = mb10f('10f-pow-repeated', {
  points: 1,
  levels: { 1: 'Power to repeated multiplication', 2: 'Repeated multiplication to a power', 3: 'Compare powers with base and exponent swapped' },
  options: [
    radioOption('form', 'Task', [['1', 'Power to repeated multiplication'], ['2', 'Repeated multiplication to a power'], ['3', 'Compare powers with base and exponent swapped']], ['1', '2', '3']),
    sizeOption([4, 6, 9], [6, 9, 6], 'Largest base'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    if (difficulty === 3) {
      const top = optNum(o, 'size', 6);
      let a = rng.int(2, top), b = rng.int(2, top);
      while (b === a) b = rng.int(2, top);
      const A = a ** b, B = b ** a;
      const choices = [math(`${a}^${b}`), math(`${b}^${a}`), 'They are equal', 'It cannot be decided without evaluating both to the same exponent'];
      const answer = A > B ? choices[0] : A < B ? choices[1] : choices[2];
      return {
        body: `Which is greater, ${math(`${a}^${b}`)} or ${math(`${b}^${a}`)}?`,
        answer,
        distractors: choices.filter((c) => c !== answer),
        solution: `${math(`${a}^${b} = ${Array(b).fill(a).join(' dot ')} = ${A}`)} and ${math(`${b}^${a} = ${Array(a).fill(b).join(' dot ')} = ${B}`)}.`,
      };
    }
    const top = optNum(o, 'size', difficulty === 2 ? 6 : 9);
    const b = difficulty === 2 ? rng.nonZero(1 - top, top) : rng.int(2, top), e = rng.int(2, 5);
    if (difficulty === 1) {
      const answer = Array(e).fill(b).join(' times ');
      return {
        body: `Write ${math(`${b}^${e}`)} as a repeated multiplication.`,
        answer: math(answer),
        distractors: distinct(math(answer), [Array(b).fill(e).join(' times '), `${b} times ${e}`, Array(e + 1).fill(b).join(' times ')].map(math)),
        solution: `The exponent ${e} says how many times the base ${b} is a factor: ${math(answer)}.`,
      };
    }
    const product = Array(e).fill(par(b)).join(' times ');
    return {
      body: `Write ${math(product)} as a power.`,
      answer: math(powText(b, e)),
      distractors: distinct(math(powText(b, e)), [`${b}^${e}`, powText(e, Math.abs(b)), `${par(b * e)}`, powText(b, e + 1)].map(math)),
      solution: `The factor ${math(par(b))} appears ${e} times: ${math(powText(b, e))}.${b < 0 ? ' The brackets show the base is negative.' : ''}`,
    };
  },
});

export const powEvaluate = mb10f('10f-pow-evaluate', {
  points: 1,
  levels: { 1: 'Positive bases', 2: 'Negative bases, with and without brackets', 3: 'Compare several forms' },
  options: [
    radioOption('form', 'Bases', [['1', 'Positive bases'], ['2', 'Negative bases, with and without brackets'], ['3', 'Compare several forms']], ['1', '2', '3']),
    sizeOption([4, 6, 9], [9, 6, 4], 'Largest base'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    if (difficulty === 3) {
      const b = rng.int(2, Math.min(4, optNum(o, 'size', 4))), e = rng.pick([2, 4]);
      const forms: Array<[string, number]> = [[`(-${b})^${e}`, b ** e], [`-${b}^${e}`, -(b ** e)], [`(-${b})^${e + 1}`, -(b ** (e + 1))], [`-(-${b})^${e}`, -(b ** e)]];
      const greatest = forms.reduce((x, y) => (y[1] > x[1] ? y : x));
      return {
        body: `Which has the greatest value: ${forms.map(([t]) => math(t)).join(', ')}?`,
        answer: math(greatest[0]),
        distractors: forms.filter((f) => f !== greatest).map(([t]) => math(t)),
        solution: forms.map(([t, v]) => math(`${t} = ${v}`)).join(', ') + '. Only the bracketed negative base to an even exponent is positive.',
      };
    }
    const b = difficulty === 1 ? rng.int(2, optNum(o, 'size', 9)) : -rng.int(2, optNum(o, 'size', 6));
    const e = difficulty === 1 ? rng.int(2, 4) : rng.int(2, 5);
    const bracket = difficulty === 1 || rng.next() < 0.5;
    const expr = bracket ? powText(b, e) : `-${-b}^${e}`;
    const v = bracket ? b ** e : -((-b) ** e);
    return {
      body: `Evaluate ${math(expr)}.`,
      answer: math(String(v)),
      distractors: distinct(math(String(v)), [String(-v), String(b * e), String(Math.abs(b) ** (e + 1) * Math.sign(v)), String(e ** Math.abs(b))].map(math)),
      solution: bracket ? `${math(`${expr} = ${Array(e).fill(par(b)).join(' dot ')} = ${v}`)}.` : `Without brackets the exponent applies to ${-b} only: ${math(`-(${Array(e).fill(-b).join(' dot ')}) = ${v}`)}.`,
    };
  },
});

export const powZero = mb10f('10f-pow-zero', {
  points: 1,
  levels: { 1: 'a⁰ = 1', 2: 'Signs and coefficients with zero exponents', 3: 'Expressions with zero exponents' },
  options: [
    radioOption('form', 'Expression', [['1', 'a⁰ = 1'], ['2', 'Signs and coefficients with zero exponents'], ['3', 'Expressions with zero exponents']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const a = rng.int(2, 12);
    if (difficulty === 1) {
      return {
        body: `Evaluate ${math(`${rng.pick([a, -a].map(par))}^0`)}.`,
        answer: math('1'),
        distractors: [math('0'), math(String(a)), math('-1')],
        solution: `Any non-zero base to the exponent 0 is 1: for example ${math(`${a}^3 div ${a}^3 = ${a}^0`)} and also equals 1.`,
      };
    }
    if (difficulty === 2) {
      const forms: Array<[string, number]> = [[`-${a}^0`, -1], [`(-${a})^0`, 1], [`${a} dot ${a + 1}^0`, a], [`-(-${a})^0`, -1]];
      const [expr, v] = rng.pick(forms);
      return {
        body: `Evaluate ${math(expr)}.`,
        answer: math(String(v)),
        distractors: distinct(math(String(v)), ['0', String(-v), String(a), '1', '-1'].map(math)),
        solution: `A zero exponent gives 1 for its own base only: ${math(`${expr} = ${v}`)}.`,
      };
    }
    const b = rng.int(2, 5), c = rng.int(2, 6);
    const v = c;
    return {
      body: `Evaluate ${math(`${b}^0 + ${c}(${a}^0) - (${b}^${c})^0`)}.`,
      answer: math(String(v)),
      distractors: distinct(math(String(v)), [String(c + 1), String(c + 2), String(c * a), '0'].map(math)),
      solution: `Each zero power is 1, including ${math(`(${b}^${c})^0`)}: ${math(`1 + ${c}(1) - 1 = ${c}`)}.`,
    };
  },
});

export const powSum = mb10f('10f-pow-sum', {
  points: 1,
  levels: { 1: 'Sum of two powers', 2: 'Difference of two powers', 3: 'Different bases' },
  options: [
    radioOption('form', 'Expression', [['1', 'Sum of two powers'], ['2', 'Difference of two powers'], ['3', 'Different bases']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const b = rng.int(2, 5), m = rng.int(2, 3), n = m + rng.int(1, 2);
    if (difficulty === 3) {
      const c = rng.int(2, 5), p = rng.int(2, 3);
      const v = b ** n + c ** p;
      return {
        body: `Evaluate ${math(`${b}^${n} + ${c}^${p}`)}.`,
        answer: math(String(v)),
        distractors: distinct(math(String(v)), [String((b + c) ** (n + p)), String(b * n + c * p), String((b + c) ** Math.max(n, p)), String(b ** n * c ** p)].map(math)),
        solution: `Evaluate each power first: ${math(`${b ** n} + ${c ** p} = ${v}`)}. Exponent laws do not apply to sums.`,
      };
    }
    const plus = difficulty === 1;
    const v = plus ? b ** m + b ** n : b ** n - b ** m;
    return {
      body: `Evaluate ${math(plus ? `${b}^${m} + ${b}^${n}` : `${b}^${n} - ${b}^${m}`)}.`,
      answer: math(String(v)),
      distractors: distinct(math(String(v)), [String(plus ? b ** (m + n) : b ** (n - m)), String(plus ? (2 * b) ** (m + n) : 0), String(plus ? b * (m + n) : b * (n - m)), String(v + b)].map(math)),
      solution: `${math(`${b}^${plus ? m : n} = ${b ** (plus ? m : n)}`)} and ${math(`${b}^${plus ? n : m} = ${b ** (plus ? n : m)}`)}, so the ${plus ? 'sum' : 'difference'} is ${v}. (Exponents are not ${plus ? 'added' : 'subtracted'} here.)`,
    };
  },
});

export const powProblem = mb10f('10f-pow-problem', {
  levels: { 1: 'Doubling', 2: 'Areas and volumes', 3: 'Comparing growth' },
  options: [
    radioOption('form', 'Context', [['1', 'Doubling'], ['2', 'Areas and volumes'], ['3', 'Comparing growth']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    if (difficulty === 1) {
      const start = rng.pick([1, 2, 3, 5]), h = rng.int(4, 10);
      const v = start * 2 ** h;
      return {
        body: rng.pick([
          `A culture starts with ${start} bacteri${start === 1 ? 'um' : 'a'} and the number doubles every hour. How many are there after ${h} hours?`,
          `A chain message is sent to ${start} ${start === 1 ? 'person' : 'people'}, and the number who have it doubles every hour. How many have it after ${h} hours?`,
          `A pond has ${start} square metre${start === 1 ? '' : 's'} of algae, and the area doubles every day. How many square metres are there after ${h} days?`,
          `A video has ${start} share${start === 1 ? '' : 's'}, and the number of shares doubles every hour. How many shares are there after ${h} hours?`,
        ]),
        answer: `${v}`,
        distractors: distinct(`${v}`, [`${start * 2 * h}`, `${(start * 2) ** h}`, `${start * 2 ** (h - 1)}`, `${start + 2 ** h}`]),
        solution: `After ${h} doublings: ${math(`${start} dot 2^${h} = ${start} dot ${2 ** h} = ${v}`).replace('1 dot ', '')}.`,
      };
    }
    if (difficulty === 2) {
      const s = rng.int(3, 12), cube = rng.next() < 0.5;
      return {
        body: `A ${cube ? 'cube' : 'square'} has sides of ${s} cm. Write its ${cube ? 'volume' : 'area'} as a power and evaluate it.`,
        answer: math(`${s}^${cube ? 3 : 2} = ${s ** (cube ? 3 : 2)}`) + (cube ? ' cm³' : ' cm²'),
        distractors: [math(`${cube ? 3 : 2}^${s} = ${(cube ? 3 : 2) ** s}`), math(`${s} dot ${cube ? 3 : 2} = ${s * (cube ? 3 : 2)}`), math(`${s}^${cube ? 2 : 3} = ${s ** (cube ? 2 : 3)}`)].map((d) => d + (cube ? ' cm³' : ' cm²')),
        solution: `${cube ? 'Volume' : 'Area'} = ${math(`${Array(cube ? 3 : 2).fill(s).join(' dot ')} = ${s}^${cube ? 3 : 2} = ${s ** (cube ? 3 : 2)}`)}.`,
      };
    }
    const n = rng.int(5, 9), add = rng.pick([50, 100, 150]);
    const A = 2 ** n, B = add * n;
    const answer = A > B ? `Plan A: ${A} > ${B}` : `Plan B: ${B} > ${A}`;
    return {
      body: `Two plans award points. With plan A you have ${math(`2^n`)} points in total after ${math('n')} days. With plan B you get ${add} points per day, so ${math(`${add}n`)} points in total after ${math('n')} days. Which plan gives more points in total after ${n} days?`,
      answer,
      distractors: distinct(answer, [A > B ? `Plan B: ${B} > ${A}` : `Plan A: ${A} > ${B}`, `Plan A: ${2 * n} points`, 'They are always equal']),
      solution: `Plan A: ${math(`2^${n} = ${A}`)}. Plan B: ${math(`${add}(${n}) = ${B}`)}. ${answer.split(':')[0]} gives more.`,
    };
  },
});

// ── Exponent laws ─────────────────────────────────────────────────────────

export const lawProductQuotient = mb10f('10f-law-product-quotient', {
  points: 1,
  levels: { 1: 'Product of powers', 2: 'Quotient of powers', 3: 'Products and quotients together' },
  options: [
    radioOption('form', 'Law', [['1', 'Product of powers'], ['2', 'Quotient of powers'], ['3', 'Products and quotients together']], ['1', '2', '3']),
    sizeOption([5, 8, 12], [8, 8, 8], 'Largest exponent'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const b = rng.pick([2, 3, 5, 7, -2, -3]), m = rng.int(2, optNum(o, 'size', 8)), n = rng.int(2, optNum(o, 'size', 8));
    if (difficulty === 1) {
      return {
        body: `Write as a single power: ${math(`${powText(b, m)} times ${powText(b, n)}`)}`,
        answer: math(powText(b, m + n)),
        distractors: distinct(math(powText(b, m + n)), [powText(b, m * n), powText(b * b, m + n), powText(b * b, m * n)].map(math)),
        solution: `Same base: add the exponents. ${math(`${m} + ${n} = ${m + n}`)}, so ${math(powText(b, m + n))}.`,
      };
    }
    if (difficulty === 2) {
      const [hi, lo] = m >= n ? [m + 1, n] : [n + 1, m];
      return {
        body: `Write as a single power: ${math(`${powText(b, hi)} div ${powText(b, lo)}`)}`,
        answer: math(powText(b, hi - lo)),
        distractors: distinct(math(powText(b, hi - lo)), [powText(b, Math.round(hi / lo)) , powText(1, hi - lo), powText(b, hi + lo), powText(b, hi * lo)].map(math)),
        solution: `Same base: subtract the exponents. ${math(`${hi} - ${lo} = ${hi - lo}`)}, so ${math(powText(b, hi - lo))}.`,
      };
    }
    const k = rng.int(2, 6);
    const e = m + n - k;
    if (e < 1) return lawProductQuotient.generate(rng, difficulty, o);
    return {
      body: `Write as a single power: ${math(`(${powText(b, m)} times ${powText(b, n)}) / ${powText(b, k)}`)}`,
      answer: math(powText(b, e)),
      distractors: distinct(math(powText(b, e)), [powText(b, m * n - k), powText(b, m + n + k), powText(b, Math.max(1, Math.round((m * n) / k)))].map(math)),
      solution: `Numerator: ${math(powText(b, m + n))}. Then ${math(`${m + n} - ${k} = ${e}`)}: ${math(powText(b, e))}.`,
    };
  },
});

export const lawPower = mb10f('10f-law-power', {
  points: 1,
  levels: { 1: 'Power of a power', 2: 'Power of a product', 3: 'Power of a quotient' },
  options: [
    radioOption('form', 'Law', [['1', 'Power of a power'], ['2', 'Power of a product'], ['3', 'Power of a quotient']], ['1', '2', '3']),
    sizeOption([3, 5, 8], [5, 5, 5], 'Largest exponent'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const m = rng.int(2, optNum(o, 'size', 5)), n = rng.int(2, Math.max(2, optNum(o, 'size', 5) - 1));
    if (difficulty === 1) {
      const b = rng.pick([2, 3, 4, 5, -2]);
      return {
        body: `Write as a single power: ${math(`(${powText(b, m)})^${n}`)}`,
        answer: math(powText(b, m * n)),
        distractors: distinct(math(powText(b, m * n)), [powText(b, m + n), powText(b, m ** n), powText(b * n, m)].map(math)),
        solution: `Multiply the exponents: ${math(`${m} times ${n} = ${m * n}`)}, so ${math(powText(b, m * n))}.`,
      };
    }
    const a = rng.int(2, 5), c = rng.int(2, 5), e = rng.int(2, 3);
    if (difficulty === 2) {
      const v = (a * c) ** e;
      return {
        body: `Evaluate ${math(`(${a} times ${c})^${e}`)} using the power of a product law.`,
        answer: math(`${a}^${e} times ${c}^${e} = ${v}`),
        distractors: distinct(math(`${a}^${e} times ${c}^${e} = ${v}`), [`${a} times ${c}^${e} = ${a * c ** e}`, `${a}^${e} + ${c}^${e} = ${a ** e + c ** e}`, `${a * c} times ${e} = ${a * c * e}`].map(math)),
        solution: `${math(`(${a} times ${c})^${e} = ${a}^${e} times ${c}^${e} = ${a ** e} times ${c ** e} = ${v}`)}.`,
      };
    }
    const q = new Q(a, c + (a === c ? 1 : 0));
    const v = new Q(q.n ** e, q.d ** e);
    return {
      body: `Evaluate ${math(`(${q.typst()})^${e}`)}.`,
      answer: math(v.typst()),
      // Only the numerator or the denominator raised, or multiplying by the exponent instead (all in lowest terms).
      distractors: distinct(math(v.typst()), [new Q(q.n ** e, q.d), new Q(q.n, q.d ** e), new Q(q.n * e, q.d), new Q(q.n, q.d * e)].map((x) => math(x.typst()))),
      solution: `Raise the numerator and denominator to the power: ${math(`${q.n}^${e}/${q.d}^${e} = ${v.typst()}`)}.`,
    };
  },
});

export const lawEvaluate = mb10f('10f-law-evaluate', {
  levels: { 1: 'Product and quotient', 2: 'With a power of a power', 3: 'Negative bases' },
  options: [
    radioOption('form', 'Expression', [['1', 'Product and quotient'], ['2', 'With a power of a power'], ['3', 'Negative bases']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const b = difficulty === 3 ? -rng.int(2, 3) : rng.int(2, 3);
    const m = rng.int(2, 5), n = rng.int(2, 4);
    const k = difficulty === 2 ? rng.int(2, 3) : 1;
    const top = difficulty === 2 ? `(${powText(b, m)})^${k} times ${powText(b, n)}` : `${powText(b, m)} times ${powText(b, n)}`;
    const topE = m * k + n;
    const d = topE - rng.int(1, 3);
    const e = topE - d;
    const v = b ** e;
    return {
      body: `Simplify, then evaluate: ${math(`(${top}) / ${powText(b, d)}`)}`,
      answer: math(String(v)),
      distractors: distinct(math(String(v)), [String(b * e), String(-v), String(b ** (e + 1)), String(b ** Math.max(1, (m * k * n) - d > 0 && (m * k * n) - d < 8 ? (m * k * n) - d : e + 2))].map(math)),
      solution: `${difficulty === 2 ? `${math(`(${powText(b, m)})^${k} = ${powText(b, m * k)}`)}. ` : ''}Numerator: ${math(powText(b, topE))}. Quotient: ${math(`${powText(b, topE - d)} = ${v}`)}.`,
    };
  },
});

export const lawError = mb10f('10f-law-error', {
  levels: { 1: 'Multiplying the bases', 2: 'Using a law on a sum', 3: 'Power of a product' },
  options: [
    radioOption('form', 'Error', [['1', 'Multiplying the bases'], ['2', 'Using a law on a sum'], ['3', 'Power of a product']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const b = rng.int(2, 5), m = rng.int(2, 4), n = rng.int(2, 4);
    let expr: string, wrong: string, right: string, why: string, alt: string[];
    if (difficulty === 1) {
      expr = `${b}^${m} times ${b}^${n}`; wrong = `${b * b}^${m + n}`; right = `${b}^${m + n}`;
      why = 'When multiplying powers with the same base, keep the base and add the exponents.';
      alt = [`${b}^${m * n}`, `${b * b}^${m * n}`];
    } else if (difficulty === 2) {
      expr = `${b}^${m} + ${b}^${n}`; wrong = `${b}^${m + n} = ${b ** (m + n)}`; right = String(b ** m + b ** n);
      why = 'The exponent laws apply to products and quotients, not sums: evaluate each power, then add.';
      alt = [String(2 * b ** Math.max(m, n)), String((2 * b) ** (m + n))];
    } else {
      const c = rng.int(2, 5);
      expr = `(${b} times ${c})^${m}`; wrong = `${b} times ${c}^${m} = ${b * c ** m}`; right = `${b}^${m} times ${c}^${m} = ${(b * c) ** m}`;
      why = 'The exponent applies to every factor inside the brackets.';
      alt = [`${b * c} times ${m} = ${b * c * m}`, `${b}^${m} + ${c}^${m} = ${b ** m + c ** m}`];
    }
    return {
      body: `A student wrote ${math(`${expr} = ${wrong}`)}. What is the correct result?`,
      task: { instruction: 'A student wrote each of these. What is the correct result?', item: math(`${expr} = ${wrong}`) },
      answer: math(right),
      distractors: distinct(math(right), [wrong, ...alt].map(math)),
      solution: `${why} ${math(`${expr} = ${right}`)}.`,
    };
  },
});

// ── Rational numbers ──────────────────────────────────────────────────────

function rational(rng: Rng, kind: 'dec' | 'frac' | 'mixed'): Q {
  if (kind === 'dec') return new Q(rng.nonZero(-40, 40), rng.pick([4, 10, 20]));
  if (kind === 'frac') { for (;;) { const q = new Q(rng.nonZero(-11, 11), rng.int(2, 12)); if (!q.isInt) return q; } }
  return rng.next() < 0.5 ? rational(rng, 'dec') : rational(rng, 'frac');
}
const decText = (q: Q) => dec(q.value, 3);
const show = (q: Q, asDec: boolean) => (asDec ? decText(q) : q.typst());
/** A mixed number: `-2 1/4`. */
function mixedText(q: Q): string {
  const whole = Math.trunc(q.n / q.d), rem = Math.abs(q.n % q.d);
  if (rem === 0) return String(whole);
  if (whole === 0) return q.typst();
  return `${whole} ${rem}/${q.d}`;
}

export const ratOrder = mb10f('10f-rat-order', {
  levels: { 1: 'Decimals', 2: 'Fractions', 3: 'Fractions and decimals, with negatives' },
  options: [
    radioOption('form', 'Numbers', [['1', 'Decimals'], ['2', 'Fractions'], ['3', 'Fractions and decimals, with negatives']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    let items: Array<[string, Q]>;
    for (;;) {
      items = Array.from({ length: 4 }, (_, i) => {
        const kind = difficulty === 1 ? 'dec' : difficulty === 2 ? 'frac' : (i % 2 ? 'dec' : 'frac');
        const q = rational(rng, kind);
        return [show(q, kind === 'dec'), q] as [string, Q];
      });
      const vals = items.map(([, q]) => q.value);
      if (new Set(vals).size === 4 && new Set(items.map(([t]) => t)).size === 4 && (difficulty < 3 || vals.some((v) => v < 0))) break;
    }
    const asc = [...items].sort((a, b) => a[1].value - b[1].value).map(([t]) => t);
    const byAbs = [...items].sort((a, b) => Math.abs(a[1].value) - Math.abs(b[1].value)).map(([t]) => t);
    const f = (l: string[]) => math(l.join(', '));
    return {
      body: `Order from least to greatest: ${math(rng.shuffle(items.map(([t]) => t)).join(', '))}`,
      answer: f(asc),
      distractors: distinct(f(asc), [f([...asc].reverse()), f(byAbs), f([asc[1], asc[0], asc[2], asc[3]]), f([asc[0], asc[1], asc[3], asc[2]])]),
      solution: `As decimals: ${items.map(([t, q]) => (t.includes('/') ? math(`${t} approx ${dec(q.value, 3)}`) : math(t))).join(', ')}. Negative numbers farther from zero are smaller. ${f(asc)}.`,
    };
  },
});

export const ratBetween = mb10f('10f-rat-between', {
  points: 1,
  levels: { 1: 'Between two decimals', 2: 'Between two fractions', 3: 'Between two negative numbers' },
  options: [
    radioOption('form', 'Numbers', [['1', 'Between two decimals'], ['2', 'Between two fractions'], ['3', 'Between two negative numbers']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    let a: Q, b: Q;
    for (;;) {
      a = rational(rng, difficulty === 1 ? 'dec' : 'frac'); b = rational(rng, difficulty === 1 ? 'dec' : 'frac');
      if (difficulty === 3) { a = a.abs().neg(); b = b.abs().neg(); }
      if (a.value > b.value) [a, b] = [b, a];
      if (b.value - a.value > 0.1 && b.value - a.value < 1.5) break;
    }
    const mid = a.add(b).div(2);
    const asDec = difficulty === 1;
    const answer = show(mid, asDec && dec(mid.value, 3).length < 7);
    const outside = [a.sub(0.25), b.add(0.25), a.neg().eq(b) ? b.add(0.5) : a.neg()].filter((q) => q.value < a.value || q.value > b.value);
    return {
      body: `Which number is between ${math(show(a, asDec))} and ${math(show(b, asDec))}?`,
      task: { instruction: 'Which number is between the two numbers in each pair?', item: `${math(show(a, asDec))} and ${math(show(b, asDec))}` },
      answer: math(answer),
      distractors: distinct(math(answer), [...outside.map((q) => show(q, asDec)), show(b.add(1), asDec)].map(math)),
      solution: `The average of the two numbers is always between them: ${math(`(${show(a, asDec)} + ${show(b, asDec)}) / 2 = ${answer}`).replace(/\+ -/g, '- ')}.`,
    };
  },
});

export const ratNumberLine = mb10f('10f-rat-number-line', {
  points: 1,
  levels: { 1: 'Decimals', 2: 'Fractions', 3: 'Negative fractions and decimals' },
  options: [
    radioOption('form', 'Numbers', [['1', 'Decimals'], ['2', 'Fractions'], ['3', 'Negative fractions and decimals']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const letters = ['A', 'B', 'C', 'D'];
    let items: Q[];
    for (;;) {
      items = Array.from({ length: 4 }, () => {
        const d = difficulty === 1 ? 10 : rng.pick([2, 4]);
        const q = new Q(rng.int(difficulty === 3 ? -3 * d : 0, 3 * d), d);
        return q;
      });
      const vals = items.map((q) => q.value).sort((a, b) => a - b);
      if (vals.every((v, i) => i === 0 || v - vals[i - 1] >= 0.4) && (difficulty < 3 || vals[0] < 0)) break;
    }
    const sorted = [...items].sort((a, b) => a.value - b.value);
    const target = rng.pick(sorted), idx = sorted.indexOf(target);
    const lo = Math.floor(sorted[0].value), hi = Math.ceil(sorted[3].value);
    const line = numberLine({ from: lo, to: hi, step: difficulty === 1 ? 0.5 : 0.25, labelEvery: difficulty === 1 ? 2 : 4, width: 10, points: sorted.map((q, i) => ({ x: q.value, label: letters[i] })) });
    const label = difficulty === 1 ? decText(target) : target.isInt ? target.typst() : rng.next() < 0.5 && difficulty === 3 ? decText(target) : target.typst();
    return {
      body: `Which point represents ${math(label)}?\n\n${line}`,
      answer: `Point ${letters[idx]}`,
      distractors: letters.filter((_, i) => i !== idx).map((l) => `Point ${l}`),
      solution: `${math(label)} ${target.isInt || label === decText(target) ? '' : `= ${decText(target)} `}is at point ${letters[idx]}.`,
    };
  },
});

export const ratAddSubtract = mb10f('10f-rat-add-subtract', {
  points: 1,
  levels: { 1: 'Decimals', 2: 'Fractions', 3: 'Mixed numbers' },
  options: [
    radioOption('form', 'Numbers', [['1', 'Decimals'], ['2', 'Fractions'], ['3', 'Mixed numbers']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const plus = rng.next() < 0.5, op = plus ? '+' : '-';
    if (difficulty === 1) {
      const a = rng.nonZero(-99, 99) / 10, b = rng.nonZero(-99, 99) / 100;
      const v = plus ? a + b : a - b;
      const bt = b < 0 ? `(${dec(b)})` : dec(b);
      return {
        body: `Evaluate ${math(`${dec(a)} ${op} ${bt}`)}.`,
        answer: math(dec(v, 2)),
        distractors: distinct(math(dec(v, 2)), [dec(plus ? a - b : a + b, 2), dec(-v, 2), dec(Math.abs(a) + Math.abs(b), 2), dec(v + 1, 2)].map(math)),
        solution: `${math(`${dec(a)} ${op} ${bt} = ${dec(v, 2)}`)}.`,
      };
    }
    let a = rational(rng, 'frac'), b = rational(rng, 'frac');
    if (difficulty === 3) { a = a.add(rng.nonZero(-3, 3)); b = b.add(rng.nonZero(-3, 3)); }
    const v = plus ? a.add(b) : a.sub(b);
    const t = (q: Q) => (difficulty === 3 ? mixedText(q) : q.typst());
    const bt = b.sign < 0 ? `(${t(b)})` : t(b);
    const naive = new Q(a.n + (plus ? b.n : -b.n), a.d + b.d);
    return {
      body: `Evaluate ${math(`${t(a)} ${op} ${bt}`)}.${difficulty === 3 ? ' Give the answer as a mixed number.' : ''}`,
      answer: math(t(v)),
      distractors: distinct(math(t(v)), [t(plus ? a.sub(b) : a.add(b)), t(v.neg()), t(naive), t(v.add(new Q(1, a.d)))].map(math)),
      // The lowest common denominator of the two fractions (not of the answer).
      solution: `Use the common denominator ${(a.d * b.d) / gcdOf(a.d, b.d)}: ${math(`${a.typst()} ${op} ${b.sign < 0 ? `(${b.typst()})` : b.typst()} = ${v.typst()}`)}${difficulty === 3 && t(v) !== v.typst() ? `, which is ${math(t(v))}` : ''}.`,
    };
  },
});

export const ratMultiplyDivide = mb10f('10f-rat-multiply-divide', {
  points: 1,
  levels: { 1: 'Decimals', 2: 'Fractions', 3: 'Mixed numbers' },
  options: [
    radioOption('form', 'Numbers', [['1', 'Decimals'], ['2', 'Fractions'], ['3', 'Mixed numbers']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const times = rng.next() < 0.5;
    if (difficulty === 1) {
      const a = rng.nonZero(-50, 50) / 10, b = rng.nonZero(-9, 9) / 10;
      const v = times ? a * b : a / b;
      const bt = b < 0 ? `(${dec(b)})` : dec(b);
      return {
        body: `Evaluate ${math(`${dec(a)} ${times ? 'times' : 'div'} ${bt}`)}${times ? '' : ', to the nearest hundredth if needed'}.`,
        answer: math(dec(v, 2)),
        distractors: distinct(math(dec(v, 2)), [dec(-v, 2), dec(times ? a / b : a * b, 2), dec(v * 10, 2), dec(v / 10, 2)].map(math)),
        solution: `${math(`${dec(a)} ${times ? 'times' : 'div'} ${bt} = ${dec(v, 2)}`)}. ${(a < 0) !== (b < 0) ? 'Unlike signs give a negative result.' : 'Like signs give a positive result.'}`,
      };
    }
    let a = rational(rng, 'frac'), b = rational(rng, 'frac');
    if (difficulty === 3) { a = a.add(rng.nonZero(-2, 2)); b = b.add(rng.nonZero(-2, 2)); if (b.n === 0) b = new Q(3, 2); }
    const v = times ? a.mul(b) : a.div(b);
    const t = (q: Q) => (difficulty === 3 ? mixedText(q) : q.typst());
    const bt = b.sign < 0 ? `(${t(b)})` : t(b);
    return {
      body: `Evaluate ${math(`${t(a)} ${times ? 'times' : 'div'} ${bt}`)}.`,
      answer: math(t(v)),
      distractors: distinct(math(t(v)), [t(v.neg()), t(times ? a.div(b) : a.mul(b)), t(new Q(a.n * b.n, a.d + b.d)), t(times ? a.mul(b).mul(2) : b.div(a))].map(math)),
      solution: `${difficulty === 3 ? `As improper fractions: ${math(`${a.typst()} ${times ? 'times' : 'div'} ${b.sign < 0 ? `(${b.typst()})` : b.typst()}`)}. ` : ''}${times ? 'Multiply numerators and denominators' : 'Multiply by the reciprocal'}: ${math(v.typst())}${difficulty === 3 && t(v) !== v.typst() ? `, which is ${math(t(v))}` : ''}.`,
    };
  },
});

export const ratProblem = mb10f('10f-rat-problem', {
  levels: { 1: 'Temperature changes', 2: 'Money and debts', 3: 'Fractions of amounts' },
  options: [
    radioOption('form', 'Context', [['1', 'Temperature changes'], ['2', 'Money and debts'], ['3', 'Fractions of amounts']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    if (difficulty === 1) {
      const t0 = rng.int(-30, 5) + rng.int(0, 9) / 10, drop = rng.int(20, 150) / 10, hours = rng.int(2, 6);
      const t1 = t0 - drop * hours;
      return {
        body: `At 6 p.m. the temperature ${rng.pick(['in Thompson', 'at a campsite', 'on a ski hill', 'at the airport', 'in a northern town'])} was ${dec(t0)}°C. It dropped ${dec(drop)}°C each hour for ${hours} hours. What was the temperature then?`,
        answer: `${dec(t1, 1)}°C`,
        distractors: distinct(`${dec(t1, 1)}°C`, [`${dec(t0 + drop * hours, 1)}°C`, `${dec(t0 - drop, 1)}°C`, `${dec(-t0 - drop * hours, 1)}°C`]),
        solution: `${math(`${dec(t0)} - ${dec(drop)}(${hours}) = ${dec(t1, 1)}`).replace('- -', '+ ')}°C.`,
      };
    }
    if (difficulty === 2) {
      const bal = rng.int(20, 200) + 0.25 * rng.int(0, 3), spend = [rng.int(15, 80) + 0.5, rng.int(10, 60) + 0.75];
      const dep = rng.int(10, 50);
      const v = bal - spend[0] - spend[1] + dep;
      return {
        body: rng.pick([
          `An account has \\$${bal.toFixed(2)}. Two purchases of \\$${spend[0].toFixed(2)} and \\$${spend[1].toFixed(2)} are made, then \\$${dep.toFixed(2)} is deposited. What is the balance?`,
          `A student's bank account has \\$${bal.toFixed(2)}. They buy shoes for \\$${spend[0].toFixed(2)} and a game for \\$${spend[1].toFixed(2)}, then deposit \\$${dep.toFixed(2)} from a paycheque. What is the balance?`,
          `A gift card has \\$${bal.toFixed(2)} on it. Two purchases of \\$${spend[0].toFixed(2)} and \\$${spend[1].toFixed(2)} are made, then \\$${dep.toFixed(2)} is added to the card. What is the balance?`,
          `A club's account has \\$${bal.toFixed(2)}. It pays \\$${spend[0].toFixed(2)} for supplies and \\$${spend[1].toFixed(2)} for snacks, then deposits \\$${dep.toFixed(2)} from a bake sale. What is the balance?`,
        ]),
        answer: money(v),
        distractors: distinct(money(v), [money(bal + spend[0] + spend[1] - dep), money(bal - spend[0] - spend[1] - dep), money(bal - spend[0] + dep)]),
        solution: `${math(`${bal.toFixed(2)} - ${spend[0].toFixed(2)} - ${spend[1].toFixed(2)} + ${dep} = ${v.toFixed(2)}`)}.`,
      };
    }
    const total = rng.pick([24, 36, 48, 60]), f1 = new Q(1, rng.pick([3, 4, 6])), f2 = new Q(rng.int(1, 2), rng.pick([3, 4]));
    const left = f1.add(f2).value < 1 ? new Q(1).sub(f1).sub(f2) : null;
    if (!left) return ratProblem.generate(rng, difficulty, o);
    const v = left.mul(total);
    return {
      body: (([topic, x, y, z]) => `A class of ${total} students voted on ${topic}: ${math(f1.typst())} chose ${x}, ${math(f2.typst())} chose ${y}, and the rest chose ${z}. How many chose ${z}?`)(rng.pick([
        ['a trip', 'the museum', 'the zoo', 'the science centre'], ['a lunch order', 'pizza', 'tacos', 'sushi'], ['a gym activity', 'basketball', 'badminton', 'dodgeball'],
        ['a class pet name', 'Pickles', 'Nugget', 'Waffles'], ['an end-of-year activity', 'skating', 'swimming', 'bowling'],
      ])),
      answer: `${dec(v.value, 2)} students`,
      distractors: distinct(`${dec(v.value, 2)} students`, [`${dec(f1.add(f2).mul(total).value, 2)} students`, `${dec(total - f1.value * total, 2)} students`, `${dec(left.value * 100, 0)} students`]),
      solution: `The fraction left is ${math(`1 - ${f1.typst()} - ${f2.typst()} = ${left.typst()}`)}, and ${math(`${left.typst()} times ${total} = ${v.typst()}`)}.`,
    };
  },
});

// ── Order of operations ───────────────────────────────────────────────────

// An arithmetic expression as tokens, evaluated one operation at a time in the
// order of operations, so the solution can show every step.
type Tok = { t: 'n'; v: number } | { t: 'op'; v: '+' | '-' | '*' | '/' } | { t: 'pow'; v: number } | { t: '(' } | { t: ')' };
const OP_TEXT = { '+': '+', '-': '-', '*': 'times', '/': 'div' } as const;

function tokText(toks: Tok[]): string {
  return toks.map((k, i) => {
    // A negative number needs brackets after an operator or under an exponent, not on its own.
    if (k.t === 'n') return k.v < 0 && (toks[i + 1]?.t === 'pow' || toks[i - 1]?.t === 'op') ? `(${k.v})` : String(k.v);
    if (k.t === 'op') return ` ${OP_TEXT[k.v]} `;
    if (k.t === 'pow') return `^${k.v}`;
    return k.t;
  }).join('');
}
const apply = (a: number, op: '+' | '-' | '*' | '/', b: number) => (op === '+' ? a + b : op === '-' ? a - b : op === '*' ? a * b : a / b);

/** Drop brackets around a single number: (5) becomes 5. */
function unwrap(toks: Tok[]): Tok[] {
  const out = [...toks];
  for (let i = 0; i + 2 < out.length; i++) {
    if (out[i].t === '(' && out[i + 1].t === 'n' && out[i + 2].t === ')') { out.splice(i, 3, out[i + 1]); i = -1; }
  }
  return out;
}
/** One step: the innermost bracket first, then powers, then × and ÷, then + and −, each left to right. Null when done. */
function step(toks: Tok[]): Tok[] | null {
  if (toks.length === 1) return null;
  const close = toks.findIndex((k) => k.t === ')');
  const open = close < 0 ? -1 : toks.slice(0, close).map((k) => k.t).lastIndexOf('(');
  const [lo, hi] = close < 0 ? [0, toks.length] : [open + 1, close];
  if (close >= 0 && hi - lo === 1) return [...toks.slice(0, open), toks[lo], ...toks.slice(close + 1)];
  const region = toks.slice(lo, hi);
  let k = region.findIndex((x) => x.t === 'pow');
  if (k > 0) {
    const base = region[k - 1] as { v: number };
    return [...toks.slice(0, lo + k - 1), { t: 'n', v: base.v ** (region[k] as { v: number }).v }, ...toks.slice(lo + k + 1)];
  }
  k = region.findIndex((x) => x.t === 'op' && (x.v === '*' || x.v === '/'));
  if (k < 0) k = region.findIndex((x) => x.t === 'op');
  const a = region[k - 1] as { v: number }, op = region[k] as { v: '+' | '-' | '*' | '/' }, b = region[k + 1] as { v: number };
  return [...toks.slice(0, lo + k - 1), { t: 'n', v: apply(a.v, op.v, b.v) }, ...toks.slice(lo + k + 2)];
}
/** Evaluate with every step, or null if a division is not exact. */
function evaluate(toks: Tok[]): { value: number; steps: Tok[][] } | null {
  const steps: Tok[][] = [];
  let cur: Tok[] | null = toks;
  while (cur) {
    if (cur.some((k) => k.t === 'n' && (!Number.isInteger(k.v) || Math.abs(k.v) > 2000))) return null;
    steps.push(cur);
    const nxt = step(cur);
    cur = nxt ? unwrap(nxt) : null;
  }
  const last = steps[steps.length - 1];
  return last.length === 1 && last[0].t === 'n' ? { value: last[0].v, steps } : null;
}
/** The common slip: working strictly left to right (brackets still first). */
function leftToRight(toks: Tok[]): number | null {
  const flat: Tok[] = [];
  // Evaluate brackets and powers normally, then sweep left to right.
  let cur: Tok[] = toks;
  for (;;) {
    const hasBr = cur.some((k) => k.t === '(' || k.t === 'pow');
    if (!hasBr) break;
    const nxt = step(cur);
    if (!nxt) break;
    cur = nxt;
  }
  flat.push(...cur);
  let v = (flat[0] as { v: number }).v;
  for (let i = 1; i + 1 < flat.length; i += 2) v = apply(v, (flat[i] as { v: '+' | '-' | '*' | '/' }).v, (flat[i + 1] as { v: number }).v);
  return Number.isFinite(v) ? v : null;
}

/** A random expression with `ops` operations (an exponent counts as one). */
function randomExpression(rng: Rng, ops: number, N: number, opts: { powers: boolean; brackets: boolean; negatives: boolean }): Tok[] {
  const num = () => (opts.negatives && rng.next() < 0.35 ? -rng.int(1, N) : rng.int(1, N));
  const powers = opts.powers ? Math.min(ops - 1, rng.int(1, Math.max(1, Math.floor(ops / 2)))) : 0;
  const binary = ops - powers;
  const nums = Array.from({ length: binary + 1 }, num);
  const kinds = Array.from({ length: binary }, () => rng.pick(['+', '-', '*', '/'] as const));
  // Exact division: make each dividend a multiple of its divisor.
  kinds.forEach((op, i) => {
    if (op !== '/') return;
    if (nums[i + 1] === 0) nums[i + 1] = 2;
    if (i > 0 && kinds[i - 1] === '/') kinds[i] = '*';
    else nums[i] = nums[i + 1] * rng.int(1, Math.max(2, Math.floor(N / 2))) * (rng.next() < 0.3 && opts.negatives ? -1 : 1);
  });
  const toks: Tok[] = [];
  const powAt = new Set(rng.shuffle(nums.map((_, i) => i)).slice(0, powers));
  // A bracketed pair of numbers, when brackets are on.
  const br = opts.brackets && binary >= 2 ? rng.int(0, binary - 1) : -1;
  // Brackets matter most around a sum or difference.
  if (br >= 0 && (kinds[br] === '*' || kinds[br] === '/')) kinds[br] = rng.pick(['+', '-'] as const);
  nums.forEach((n, i) => {
    if (i === br) toks.push({ t: '(' });
    const small = powAt.has(i);
    // Powers use a base of 2 to 4 in size.
    toks.push({ t: 'n', v: small ? Math.sign(n || 1) * Math.max(2, Math.min(4, Math.abs(n))) : n });
    if (small) toks.push({ t: 'pow', v: Math.abs(n) <= 3 && rng.next() < 0.4 ? 3 : 2 });
    if (br >= 0 && i === br + 1) toks.push({ t: ')' });
    if (i < binary) toks.push({ t: 'op', v: kinds[i] });
  });
  return toks;
}

export const oooIntegers = mb10f('10f-ooo-integers', {
  levels: { 1: 'Four operations', 2: 'With exponents', 3: 'With brackets and exponents' },
  options: [
    { ...radioOption('steps', 'Number of operations', [['2', '2'], ['3', '3'], ['4', '4'], ['5', '5'], ['6', '6']], ['3', '3', '4']), slider: true },
    sizeOption([5, 9, 12, 20], [9, 9, 9]),
    toggleOption('powers', 'Include exponents', [false, true, true]),
    toggleOption('brackets', 'Include brackets', [false, false, true]),
    toggleOption('negatives', 'Include negative numbers', [true, true, true]),
  ],
  generate(rng, difficulty, o) {
    const ops = optNum(o, 'steps', difficulty === 3 ? 4 : 3), N = optNum(o, 'size', 9);
    const opts = { powers: optOn(o, 'powers', difficulty > 1), brackets: optOn(o, 'brackets', difficulty === 3), negatives: optOn(o, 'negatives', true) };
    for (;;) {
      const toks = randomExpression(rng, ops, N, opts);
      const e = evaluate(toks);
      if (!e || Math.abs(e.value) > 500) continue;
      const slip = leftToRight(toks);
      const text = tokText(toks);
      return {
        body: `Evaluate ${math(text)}.`,
        answer: math(String(e.value)),
        distractors: distinct(math(String(e.value)), [slip !== null && Number.isInteger(slip) ? String(slip) : String(e.value + 3), String(-e.value), String(e.value + 2), String(e.value - 4), String(e.value * 2)].map(math)),
        solution: `Brackets, then exponents, then multiplication and division from left to right, then addition and subtraction from left to right:\n\n$ ${e.steps.map((s, i) => `${i ? '&= ' : '& '}${tokText(s)}`).join(' \\ ')} $`,
      };
    }
  },
});

export const oooRational = mb10f('10f-ooo-rational', {
  levels: { 1: 'Decimals', 2: 'Fractions', 3: 'Fractions with exponents and brackets' },
  options: [
    radioOption('form', 'Numbers', [['1', 'Decimals'], ['2', 'Fractions'], ['3', 'Fractions with exponents and brackets']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    if (difficulty === 1) {
      const a = rng.int(1, 9) / 2, b = rng.int(1, 9) / 10, c = rng.nonZero(-5, 5);
      const v = a + b * c ** 2;
      return {
        body: `Evaluate ${math(`${dec(a)} + ${dec(b)} times ${par(c)}^2`)}.`,
        answer: math(dec(v, 2)),
        distractors: distinct(math(dec(v, 2)), [dec((a + b) * c * c, 2), dec(a + (b * c) ** 2, 2), dec(a + b * 2 * c, 2)].map(math)),
        solution: `Exponent first: ${math(`${par(c)}^2 = ${c * c}`)}. Then ${math(`${dec(b)} times ${c * c} = ${dec(b * c * c, 2)}`)}, and ${math(`${dec(a)} + ${dec(b * c * c, 2)} = ${dec(v, 2)}`)}.`,
      };
    }
    const p = new Q(rng.int(1, 5), rng.int(2, 6)), q = new Q(rng.nonZero(-5, 5), rng.int(2, 4)), r = new Q(rng.int(1, 3), rng.int(2, 3));
    if (difficulty === 2) {
      const v = p.add(q.mul(r));
      return {
        body: `Evaluate ${math(`${p.typst()} + ${q.paren()} times ${r.typst()}`)}.`,
        answer: math(v.typst()),
        distractors: distinct(math(v.typst()), [p.add(q).mul(r).typst(), p.sub(q.mul(r)).typst(), p.add(q.div(r)).typst()].map(math)),
        solution: `Multiply first: ${math(`${q.paren()} times ${r.typst()} = ${q.mul(r).typst()}`)}. Then add: ${math(v.typst())}.`,
      };
    }
    const s = q.sub(r);
    const v = p.mul(s.mul(s));
    return {
      body: `Evaluate ${math(`${p.typst()} times (${q.typst()} - ${r.typst()})^2`)}.`,
      answer: math(v.typst()),
      distractors: distinct(math(v.typst()), [p.mul(s).mul(p.mul(s)).typst(), p.mul(q.mul(q).sub(r.mul(r))).typst(), p.mul(s).mul(2).typst()].map(math)),
      solution: `Brackets: ${math(`${q.typst()} - ${r.typst()} = ${s.typst()}`)}. Square: ${math(s.mul(s).typst())}. Multiply: ${math(v.typst())}.`,
    };
  },
});

export const oooError = mb10f('10f-ooo-error', {
  levels: { 1: 'Adding before multiplying', 2: 'Negative base and exponents', 3: 'Division left to right' },
  options: [
    radioOption('form', 'Error', [['1', 'Adding before multiplying'], ['2', 'Negative base and exponents'], ['3', 'Division left to right']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    let text: string, wrong: number, right: number, why: string;
    const a = rng.int(2, 9), b = rng.int(2, 6), c = rng.int(2, 6);
    if (difficulty === 1) {
      text = `${a} + ${b} times ${c}`; right = a + b * c; wrong = (a + b) * c;
      why = 'Multiplication comes before addition.';
    } else if (difficulty === 2) {
      text = `${a} - ${b}^2`; right = a - b * b; wrong = (a - b) ** 2;
      why = 'The exponent applies only to its base, before subtracting.';
    } else {
      const k = b * c * rng.int(1, 3);
      text = `${k} div ${b} times ${c}`; right = (k / b) * c; wrong = k / (b * c);
      why = 'Multiplication and division are done from left to right.';
    }
    return {
      body: `A student evaluated ${math(text)} and got ${math(dec(wrong, 2))}. What is the correct value?`,
      answer: math(dec(right, 2)),
      distractors: distinct(math(dec(right, 2)), [dec(wrong, 2), dec(-right, 2), dec(right + a, 2), dec(right - 1, 2)].map(math)),
      solution: `${why} ${math(`${text} = ${dec(right, 2)}`)}.`,
    };
  },
});

// ── Square roots ──────────────────────────────────────────────────────────

export const sqrtPerfect = mb10f('10f-sqrt-perfect', {
  points: 1,
  levels: { 1: 'Fractions', 2: 'Decimals', 3: 'Fractions that reduce' },
  options: [
    radioOption('form', 'Numbers', [['1', 'Fractions'], ['2', 'Decimals'], ['3', 'Fractions that reduce']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const yes = rng.next() < 0.5;
    const p = rng.int(1, 12), q = rng.int(p + 1, 15);
    let text: string, why: string;
    if (difficulty === 1) {
      text = yes ? `${p * p}/${q * q}` : `${p * p}/${q * q + rng.pick([1, 2, 3])}`;
      why = yes ? `${math(`${p * p} = ${p}^2`)} and ${math(`${q * q} = ${q}^2`)}, so ${math(`${text} = (${p}/${q})^2`)}.` : `The denominator is not a perfect square, so ${math(text)} is not the square of a fraction.`;
    } else if (difficulty === 2) {
      const d = rng.int(1, 19) / 10;
      let n = rng.int(2, 99) / 10;
      while (Number.isInteger(Math.round(Math.sqrt(n * 100) * 1e6) / 1e6)) n += 0.1;
      text = yes ? dec(d * d, 2) : dec(n, 1);
      why = yes ? `${math(`${text} = ${dec(d, 1)}^2`)}.` : `No decimal squared gives exactly ${text}.`;
    } else {
      const k = rng.pick([2, 3, 5]);
      text = yes ? `${p * p * k}/${q * q * k}` : `${p * p * k}/${q * q}`;
      why = yes ? `It reduces to ${math(`${p * p}/${q * q} = (${p}/${q})^2`)}.` : `It reduces to ${math(new Q(p * p * k, q * q).typst())}, which is not a perfect square.`;
    }
    const answer = yes ? 'Yes' : 'No';
    return {
      body: `Is ${math(text)} a perfect square?`,
      answer: `${answer}. ${why}`,
      distractors: [`${yes ? 'No' : 'Yes'}. ${yes ? 'Its denominator is not a perfect square.' : 'Its numerator is a perfect square.'}`, `${yes ? 'No' : 'Yes'}. ${yes ? 'Decimals and fractions cannot be perfect squares.' : 'Every positive rational number is a perfect square.'}`, yes ? `No. Only whole numbers can be perfect squares.` : `Yes. Its decimal form ends, so it is a perfect square.`],
      solution: why,
    };
  },
});

export const sqrtEvaluate = mb10f('10f-sqrt-evaluate', {
  points: 1,
  levels: { 1: 'Fractions', 2: 'Decimals', 3: 'Small decimals' },
  options: [
    radioOption('form', 'Numbers', [['1', 'Fractions'], ['2', 'Decimals'], ['3', 'Small decimals']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    if (difficulty === 1) {
      const p = rng.int(1, 12), q = rng.int(p + 1, 15);
      const g = new Q(p, q);
      return {
        body: `Evaluate ${math(`sqrt(${p * p}/${q * q})`)}.`,
        answer: math(g.typst()),
        distractors: distinct(math(g.typst()), [`${p * p}/${q}`, `${p}/${q * q}`, `${new Q(p * p, 2 * q * q).typst()}`, new Q(q, p).typst()].map(math)),
        solution: `${math(`sqrt(${p * p})/sqrt(${q * q}) = ${p}/${q}`)}${g.typst() !== `${p}/${q}` ? ` = ${math(g.typst())}` : ''}.`,
      };
    }
    const r = difficulty === 2 ? rng.int(2, 19) / 10 : rng.int(1, 9) / 100;
    const n = r * r;
    const places = difficulty === 2 ? 2 : 4;
    return {
      body: `Evaluate ${math(`sqrt(${dec(n, places)})`)}.`,
      answer: math(dec(r, 3)),
      distractors: distinct(math(dec(r, 3)), [dec(r * 10, 3), dec(r / 10, 3), dec(n / 2, places), dec(Math.sqrt(n * 10), 3)].map(math)),
      solution: `${math(`${dec(r, 3)}^2 = ${dec(n, places)}`)}, so ${math(`sqrt(${dec(n, places)}) = ${dec(r, 3)}`)}.`,
    };
  },
});

export const sqrtReverse = mb10f('10f-sqrt-reverse', {
  points: 1,
  levels: { 1: 'Decimal roots', 2: 'Fraction roots', 3: 'Both signs of a square root' },
  options: [
    radioOption('form', 'Roots', [['1', 'Decimal roots'], ['2', 'Fraction roots'], ['3', 'Both signs of a square root']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    if (difficulty === 3) {
      const n = rng.int(2, 15) ** 2 / rng.pick([1, 100]);
      const r = Math.sqrt(n);
      return {
        body: `What are the two square roots of ${math(dec(n, 2))}?`,
        answer: math(`${dec(r, 2)} "and" -${dec(r, 2)}`),
        distractors: [math(dec(r, 2)), math(`${dec(n / 2, 2)} "and" -${dec(n / 2, 2)}`), math(`${dec(r, 2)} "and" ${dec(1 / r, 3)}`)],
        solution: `${math(`${dec(r, 2)}^2 = ${dec(n, 2)}`)} and ${math(`(-${dec(r, 2)})^2 = ${dec(n, 2)}`)}: every positive number has a positive and a negative square root.`,
      };
    }
    let r = difficulty === 1 ? new Q(rng.int(2, 15), 10) : new Q(rng.int(1, 9), rng.int(2, 11));
    while (difficulty === 2 && r.isInt) r = new Q(rng.int(1, 9), rng.int(2, 11));
    const n = r.mul(r);
    const t = (q: Q) => (difficulty === 1 ? dec(q.value, 4) : q.typst());
    return {
      body: `The square root of a number is ${math(t(r))}. What is the number?`,
      answer: math(t(n)),
      distractors: distinct(math(t(n)), [t(r.mul(2)), t(r.div(2)), difficulty === 1 ? dec(Math.sqrt(r.value), 3) : new Q(r.n * r.n, r.d).typst(), t(n.mul(10))].map(math)),
      solution: `Square the root: ${math(`(${t(r)})^2 = ${t(n)}`)}.`,
    };
  },
});

export const sqrtArea = mb10f('10f-sqrt-area', {
  levels: { 1: 'Perfect-square decimals', 2: 'Perfect-square fractions', 3: 'Non-perfect squares, to the nearest tenth' },
  options: [
    radioOption('form', 'Area', [['1', 'Perfect-square decimals'], ['2', 'Perfect-square fractions'], ['3', 'Non-perfect squares, to the nearest tenth']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    if (difficulty === 3) {
      let n = rng.int(10, 200) / 10;
      while (Number.isInteger(Math.sqrt(n * 100))) n += 0.1;
      const s = Math.sqrt(n);
      return {
        body: `A square ${rng.pick(['rug', 'garden', 'tablecloth', 'window'])} has an area of ${dec(n, 1)} m². What is its side length, to the nearest tenth?`,
        answer: `${dec(s, 1)} m`,
        distractors: distinct(`${dec(s, 1)} m`, [`${dec(n / 2, 1)} m`, `${dec(n / 4, 1)} m`, `${dec(s + 0.3, 1)} m`, `${dec(4 * s, 1)} m`]),
        solution: `${math(`s = sqrt(${dec(n, 1)}) approx ${dec(s, 1)}`)} m.`,
      };
    }
    const r = difficulty === 1 ? new Q(rng.int(11, 40), 10) : new Q(rng.int(1, 9), rng.int(2, 10));
    const n = r.mul(r);
    const t = (q: Q) => (difficulty === 1 ? dec(q.value, 4) : q.typst());
    return {
      body: `A square has an area of ${math(t(n))} m². What is its perimeter?`,
      answer: math(`${t(r.mul(4))} "m"`),
      distractors: distinct(math(`${t(r.mul(4))} "m"`), [t(r), t(n.mul(4)), t(n.div(4))].map((d) => math(`${d} "m"`))),
      solution: `Side: ${math(`sqrt(${t(n)}) = ${t(r)}`)} m. Perimeter: ${math(`4 times ${t(r)} = ${t(r.mul(4))}`)} m.`,
    };
  },
});

export const sqrtEstimate = mb10f('10f-sqrt-estimate', {
  points: 1,
  levels: { 1: 'Between two whole numbers', 2: 'To one decimal place', 3: 'Decimals and fractions' },
  options: [
    radioOption('form', 'Estimate', [['1', 'Between two whole numbers'], ['2', 'To one decimal place'], ['3', 'Decimals and fractions']], ['1', '2', '3']),
    sizeOption([50, 150, 400], [150, 150, 150], 'Largest number under the root'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    if (difficulty === 3) {
      const n = rng.pick([0.2, 0.3, 0.5, 0.6, 0.7, 0.8, 1.5, 2.5, 3.2]);
      const v = Math.sqrt(n);
      return {
        body: `Estimate ${math(`sqrt(${dec(n)})`)} to one decimal place, using benchmarks.`,
        answer: math(dec(v, 1)),
        distractors: distinct(math(dec(v, 1)), [dec(n / 2, 1), dec(n * n, 2), dec(v + 0.2, 1), dec(v - 0.2, 1)].map(math)),
        solution: `${math(`${dec(Math.floor(v * 10) / 10, 1)}^2 = ${dec((Math.floor(v * 10) / 10) ** 2, 2)}`)} and ${math(`${dec(Math.ceil(v * 10) / 10, 1)}^2 = ${dec((Math.ceil(v * 10) / 10) ** 2, 2)}`)}, so ${math(`sqrt(${dec(n)}) approx ${dec(v, 1)}`)}. Note the root of a number between 0 and 1 is larger than the number.`,
      };
    }
    let n = rng.int(3, optNum(o, 'size', 150));
    while (Number.isInteger(Math.sqrt(n))) n++;
    const v = Math.sqrt(n), lo = Math.floor(v);
    if (difficulty === 1) {
      const pair = (a: number) => `${a} "and" ${a + 1}`;
      return {
        body: `Between which two consecutive whole numbers is ${math(`sqrt(${n})`)}?`,
        answer: math(pair(lo)),
        distractors: distinct(math(pair(lo)), [pair(lo + 1), pair(lo - 1), pair(Math.floor(n / 2))].map(math)),
        solution: `${math(`${lo}^2 = ${lo * lo}`)} and ${math(`${lo + 1}^2 = ${(lo + 1) ** 2}`)}, so ${math(`sqrt(${n})`)} is between ${lo} and ${lo + 1}.`,
      };
    }
    return {
      body: `Estimate ${math(`sqrt(${n})`)} to one decimal place.`,
      answer: math(dec(v, 1)),
      distractors: distinct(math(dec(v, 1)), [dec(v + 0.3, 1), dec(v - 0.3, 1), dec(n / 2, 1), dec(lo + (n - lo * lo) / 10, 1)].map(math)),
      solution: `${math(`sqrt(${n})`)} is between ${lo} and ${lo + 1}, ${n - lo * lo < (lo + 1) ** 2 - n ? `closer to ${lo}` : `closer to ${lo + 1}`}: ${math(`sqrt(${n}) approx ${dec(v, 1)}`)}.`,
    };
  },
});

export const sqrtBetween = mb10f('10f-sqrt-between', {
  points: 1,
  levels: { 1: 'Between two whole numbers', 2: 'Between two decimals', 3: 'Between two decimals less than 1' },
  options: [
    radioOption('form', 'Bounds', [['1', 'Between two whole numbers'], ['2', 'Between two decimals'], ['3', 'Between two decimals less than 1']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const a = difficulty === 1 ? rng.int(3, 12) : difficulty === 2 ? rng.int(11, 39) / 10 : rng.int(1, 8) / 10;
    const b = difficulty === 1 ? a + 1 : Math.round((a + 0.1) * 10) / 10;
    const lo = a * a, hi = b * b;
    const inside = Math.round(((lo + hi) / 2) * 1000) / 1000;
    const places = difficulty === 1 ? 0 : 4;
    return {
      body: `Which number has a square root between ${math(dec(a, 2))} and ${math(dec(b, 2))}?`,
      task: { instruction: 'Which number has a square root between the two numbers in each pair?', item: `${math(dec(a, 2))} and ${math(dec(b, 2))}` },
      answer: math(dec(inside, places)),
      distractors: distinct(math(dec(inside, places)), [dec((a + b) / 2, 3), dec(lo - (hi - lo) / 2, places), dec(hi + (hi - lo) / 2, places)].map(math)),
      solution: `${math(`${dec(a, 2)}^2 = ${dec(lo, 4)}`)} and ${math(`${dec(b, 2)}^2 = ${dec(hi, 4)}`)}, so the number must be between ${dec(lo, 4)} and ${dec(hi, 4)}: ${math(dec(inside, places))}.`,
    };
  },
});

export const NUMBER_10F = [
  powRepeated, powEvaluate, powZero, powSum, powProblem, lawProductQuotient, lawPower, lawEvaluate, lawError,
  ratOrder, ratBetween, ratNumberLine, ratAddSubtract, ratMultiplyDivide, ratProblem,
  oooIntegers, oooRational, oooError,
  sqrtPerfect, sqrtEvaluate, sqrtReverse, sqrtArea, sqrtEstimate, sqrtBetween,
];
