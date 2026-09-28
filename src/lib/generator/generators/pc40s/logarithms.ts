import type { Rng } from '../../rng.ts';
import { frac, round } from '../../format.ts';
const fmtRound = round;
import { Q } from '../../exact.ts';
import { graphTypst } from '../../graph.ts';
import { math, pc40s } from './common.ts';
import { optNum, optOn, optOne, radioOption, sizeOption, toggleOption } from '../../options.ts';
import type { GenOptions } from '../../types.ts';

/** `log_(b) x`, `log x` for base 10, `ln x` for base e. Compound arguments get parentheses. */
export function log(base: number | string, arg: string): string {
  const a = /^[0-9a-z.]+$/i.test(arg) ? arg : `(${arg})`;
  if (base === 10) return `log ${a}`;
  if (base === 'e') return `ln ${a}`;
  return `log_(${base}) ${a}`;
}

/** c^q written without negative or fractional exponents: 8, 1/8, root(3, 4), 1/sqrt(3). */
function powerValue(c: number, q: Q): string {
  const m = Math.abs(q.n), n = q.d;
  const inner = c ** m;
  const body = n === 1 ? String(inner) : n === 2 ? `sqrt(${inner})` : `root(${n}, ${inner})`;
  return q.n < 0 ? `1/${body}` : body;
}

const BASES: Array<[base: number, prime: number, power: number]> = [
  [2, 2, 1], [3, 3, 1], [4, 2, 2], [5, 5, 1], [8, 2, 3], [9, 3, 2], [16, 2, 4], [25, 5, 2], [27, 3, 3], [10, 10, 1],
];

export const logConvert = pc40s('40s-log-convert', {
  points: 1,
  levels: { 1: 'Whole-number exponents', 2: 'Negative and fractional exponents', 3: 'Variables and expressions' },
  options: [
    radioOption('direction', 'Convert', [['toLog', 'Exponential to logarithmic'], ['toExp', 'Logarithmic to exponential'], ['either', 'Either way']], ['either', 'either', 'either']),
    radioOption('exponents', 'Exponents', [['1', 'Whole numbers'], ['2', 'Negative and fractional'], ['3', 'Variables and expressions']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'exponents', gl);
    const direction = optOne(o, 'direction', 'either');
    let b: string, e: string, v: string;
    if (difficulty === 1) {
      const [base] = rng.pick(BASES.filter(([x]) => x <= 10));
      const k = rng.int(2, base <= 3 ? 5 : 3);
      b = String(base); e = String(k); v = String(base ** k);
    } else if (difficulty === 2) {
      const [base, prime, power] = rng.pick(BASES.filter(([x]) => x > 2 && x !== 10));
      const q = rng.pick([new Q(-rng.int(1, 3)), new Q(rng.pick([1, 2, 3, 4, 5]), power)].filter((x) => !x.isInt || x.n < 0));
      b = String(base); e = q.typst(); v = powerValue(prime, q.mul(power));
    } else {
      const form = rng.pick(['letters', 'e', 'expression'] as const);
      const letter = rng.pick(['x', 'y', 'a', 'm']);
      if (form === 'letters') { b = String(rng.pick([2, 3, 5, 7])); e = letter; v = String(rng.int(10, 60)); }
      else if (form === 'e') { b = 'e'; e = String(rng.int(2, 6)); v = letter; }
      else { b = String(rng.pick([2, 3, 4])); e = String(rng.int(2, 4)); v = `${letter} + ${rng.int(1, 9)}`; }
    }
    const expForm = `${b}^(${e}) = ${v}`;
    const logForm = `${log(b === '10' ? 10 : b === 'e' ? 'e' : b, v)} = ${e}`;
    const toLog = direction === 'either' ? rng.next() < 0.5 : direction === 'toLog';
    const [given, answer] = toLog ? [expForm, logForm] : [logForm, expForm];
    const wrong = toLog
      ? [`${log(e, v)} = ${b}`, `${log(b, e)} = ${v}`, `${log(v, b)} = ${e}`]
      : [`${e.startsWith('-') ? `(${e})` : e}^(${b}) = ${v}`, `${b}^(${v}) = ${e}`, `${/^[0-9a-z]+$/i.test(v) ? v : `(${v})`}^(${e}) = ${b}`];
    return {
      body: `Write ${math(given)} in ${toLog ? 'logarithmic' : 'exponential'} form.`,
      answer: math(answer),
      distractors: wrong.map(math),
      solution: `${math('log_b x = y')} means ${math('b^y = x')}: the base stays the base and the logarithm is the exponent. So ${math(answer)}.`,
    };
  },
});

export const logEvaluate = pc40s('40s-log-evaluate', {
  points: 1,
  levels: { 1: 'Whole-number values', 2: 'Negative and fractional values', 3: 'Radicals and natural logs' },
  options: [
    radioOption('values', 'Values', [['1', 'Whole numbers'], ['2', 'Negative and fractional'], ['3', 'Radicals']], ['1', '2', '3']),
    radioOption('bases', 'Bases', [['simple', '2, 3, 5, and 10'], ['powers', 'Powers such as 4, 8, 9, 25'], ['all', 'All']], ['all', 'all', 'all']),
    toggleOption('ln', 'Include natural logarithms', [false, false, true]),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'values', gl);
    const bases = optOne(o, 'bases', 'all');
    if (optOn(o, 'ln', gl === 3) && rng.next() < 0.3) {
      const q = rng.pick([new Q(rng.int(2, 6)), new Q(-1, 2), new Q(1, 3), new Q(-2, rng.pick([3, 5])), new Q(3, 2)]);
      const ePow = (m: number) => (m === 1 ? 'e' : `e^${m}`);
      const rooted = q.d === 2 ? `sqrt(${ePow(Math.abs(q.n))})` : `root(${q.d}, ${ePow(Math.abs(q.n))})`;
      const arg = q.isInt ? ePow(q.n) : q.n < 0 ? `1/${rooted}` : rooted;
      return {
        body: `Evaluate without technology: ${math(log('e', arg))}`,
        answer: math(q.typst()),
        distractors: [q.neg().typst(), new Q(q.d, q.n).typst(), q.mul(2).typst()].map(math),
        solution: `${math('ln x')} is ${math('log_e x')}, so ${math(`${log('e', arg)} = ${log('e', `e^(${q.typst()})`)} = ${q.typst()}`)}.`,
      };
    }
    // Fractional values need a base that is a power of a prime.
    const pool = BASES.filter(([b, , pw]) => (bases === 'simple' ? pw === 1 : bases === 'powers' ? pw > 1 : true));
    const [base, prime, power] = rng.pick(pool);
    // The answer is `value`; the argument is prime^q with q = value · power.
    let value: Q;
    if (difficulty === 1) value = new Q(rng.int(0, base <= 3 ? 5 : 3));
    else if (difficulty === 2) {
      const fractional = power > 1 && rng.next() < 0.6;
      value = fractional ? new Q(rng.pick([1, 3, 5].filter((m) => m % power !== 0)) * rng.sign(), power) : new Q(-rng.int(1, 3));
    } else value = new Q(rng.pick([1, 2, -1, -2]), rng.pick([2, 3])).div(1);
    const q = value.mul(power);
    const arg = powerValue(prime, q);
    const exponent = (x: Q) => (x.isInt && x.n >= 0 ? String(x.n) : `(${x.typst()})`);
    return {
      body: `Evaluate without technology: ${math(log(base, arg))}`,
      answer: math(value.typst()),
      distractors: [value.neg(), value.eq(0) ? new Q(1) : new Q(value.d, value.n), value.mul(power), value.add(1)].map((x) => math(x.typst())),
      solution: `${base === prime ? `Write the argument as a power of ${prime}: ${math(`${arg} = ${prime}^${exponent(q)}`)}` : `Write both as powers of ${prime}: ${math(`${base} = ${prime}^${power}`)} and ${math(`${arg} = ${prime}^${exponent(q)}`)}`}. `
        + `If ${math(`${log(base, arg)} = x`)}, then ${math(`${base}^x = ${arg}`)}, so ${math(`${prime}^(${power === 1 ? '' : power}x) = ${prime}^${exponent(q)}`)} and ${math(`x = ${value.typst()}`)}.`,
    };
  },
});

export const logEstimate = pc40s('40s-log-estimate', {
  points: 1,
  levels: { 1: 'Bases 2, 3, and 10', 2: 'Any base', 3: 'Arguments less than 1' },
  options: [
    radioOption('bases', 'Bases', [['simple', '2, 3, and 10'], ['any', 'Any from 2 to 9']], ['simple', 'any', 'any']),
    toggleOption('small', 'Arguments less than 1', [false, false, true]),
  ],
  generate(rng, gl, o) {
    const base = optOne(o, 'bases', gl === 1 ? 'simple' : 'any') === 'simple' ? rng.pick([2, 3, 10]) : rng.int(2, 9);
    const difficulty = optOn(o, 'small', gl === 3) ? 3 : 1;
    let x: number;
    let n: number;
    for (;;) {
      if (difficulty === 3) {
        n = -rng.int(1, 3);
        x = Number((base ** n * (1 + rng.int(1, 8) * (base - 1) / 10)).toPrecision(2));
      } else {
        n = rng.int(1, base >= 5 ? 3 : 5);
        x = Math.round(base ** n * (1 + rng.int(1, 9) * (base - 1) / 10));
      }
      const l = Math.log(x) / Math.log(base);
      if (Math.floor(l) === n && Math.abs(l - Math.round(l)) > 0.02) break;
    }
    const answer = `${n} < ${log(base, String(x))} < ${n + 1}`;
    const pow = (k: number) => (k < 0 ? `1/${base ** -k}` : String(base ** k));
    return {
      body: `Between which two consecutive integers does ${math(log(base, String(x)))} lie? Explain using powers of ${base}.`,
      answer: math(answer),
      distractors: [`${n - 1} < ${log(base, String(x))} < ${n}`, `${n + 1} < ${log(base, String(x))} < ${n + 2}`, `${-n - 1} < ${log(base, String(x))} < ${-n}`].map(math),
      solution: `${math(`${base}^(${n}) = ${pow(n)}`)} and ${math(`${base}^(${n + 1}) = ${pow(n + 1)}`)}. Since ${math(String(x))} is between them, ${math(answer)}. (With technology, ${math(`${log(base, String(x))} approx ${round(Math.log(x) / Math.log(base), 3)}`)}.)`,
    };
  },
});

type Factor = { v: string; p: Q };
const FACTOR_LETTERS = ['x', 'y', 'z'];

const EXPAND_OPTIONS = [
  radioOption('terms', 'Factors', [['2', 'Two'], ['3', 'Three']], ['2', '3', '3']),
  toggleOption('powers', 'Include powers', [true, true, true]),
  toggleOption('radicals', 'Include a radical (fractional power)', [false, false, true]),
  radioOption('base', 'Base', [['2', '2'], ['3', '3'], ['5', '5'], ['10', '10 (log)'], ['e', 'e (ln)'], ['mixed', '2, 3, 5, or 10']], ['mixed', 'mixed', 'mixed']),
];
const expandBase = (rng: Rng, o?: GenOptions): number | string => {
  const b = optOne(o, 'base', 'mixed');
  return b === 'mixed' ? rng.pick([2, 3, 5, 10]) : b === 'e' ? 'e' : Number(b);
};

function factorsFor(rng: Rng, difficulty: number, o?: GenOptions): { top: Factor[]; bottom: Factor[] } {
  const count = optNum(o, 'terms', difficulty === 1 ? 2 : 3);
  const powers = optOn(o, 'powers', true), radicals = optOn(o, 'radicals', difficulty === 3);
  const letters = FACTOR_LETTERS.slice(0, count);
  const top: Factor[] = [], bottom: Factor[] = [];
  letters.forEach((v, i) => {
    const p = radicals && i === 0 ? new Q(1, rng.pick([2, 3])) : new Q(powers ? rng.int(1, difficulty === 1 ? 3 : 4) : 1);
    (i === count - 1 && rng.next() < 0.75 ? bottom : top).push({ v, p });
  });
  if (!top.length) top.push(bottom.pop()!);
  return { top, bottom };
}

function factorText(f: Factor): string {
  if (f.p.eq(1)) return f.v;
  if (f.p.isInt) return `${f.v}^${f.p.n}`;
  return f.p.d === 2 ? `sqrt(${f.v}${f.p.n === 1 ? '' : `^${f.p.n}`})` : `root(${f.p.d}, ${f.v}${f.p.n === 1 ? '' : `^${f.p.n}`})`;
}

function quotientText(top: Factor[], bottom: Factor[]): string {
  const t = top.map(factorText).join(' ');
  if (!bottom.length) return t;
  const b = bottom.map(factorText).join(' ');
  const wrap = (s: string) => (s.includes(' ') ? `(${s})` : s);
  return `${wrap(t)}/${wrap(b)}`;
}

function termText(base: number | string, f: Factor, sign: string, first: boolean): string {
  const coef = f.p.eq(1) ? '' : f.p.isInt ? String(f.p.n) : `${f.p.typst()} `;
  const text = `${coef}${log(base, f.v)}`;
  return first ? (sign === '-' ? `-${text}` : text) : ` ${sign} ${text}`;
}

function expanded(base: number | string, top: Factor[], bottom: Factor[]): string {
  return [...top.map((f) => ['+', f] as const), ...bottom.map((f) => ['-', f] as const)]
    .map(([sign, f], i) => termText(base, f, sign, i === 0)).join('');
}

export const logExpand = pc40s('40s-log-expand', {
  levels: { 1: 'Products and quotients', 2: 'With powers', 3: 'With radicals' },
  options: EXPAND_OPTIONS,
  generate(rng, difficulty, o) {
    const base = expandBase(rng, o);
    const { top, bottom } = factorsFor(rng, difficulty, o);
    const expr = quotientText(top, bottom);
    const answer = expanded(base, top, bottom);
    const noPowers = (fs: Factor[]) => fs.map((f) => ({ ...f, p: new Q(1) }));
    return {
      body: `Expand using the laws of logarithms: ${math(log(base, expr))}`,
      answer: math(answer),
      distractors: [
        expanded(base, [...top, ...bottom], []),
        expanded(base, noPowers(top), noPowers(bottom)),
        expanded(base, bottom.length ? bottom : top.slice(1), bottom.length ? top : top.slice(0, 1)),
        `${log(base, top.map(factorText).join(' '))} / ${bottom.length ? log(base, bottom.map(factorText).join(' ')) : '1'}`,
      ].filter((d) => d !== answer).map(math),
      solution: `Use the product law ${math('log_b (M N) = log_b M + log_b N')}, the quotient law ${math('log_b (M/N) = log_b M - log_b N')}, and the power law ${math('log_b M^p = p log_b M')}${top.some((f) => !f.p.isInt) ? ' (a root is a fractional power)' : ''}: ${math(`${log(base, expr)} = ${answer}`)}.`,
    };
  },
});

export const logCondense = pc40s('40s-log-condense', {
  levels: { 1: 'Two terms', 2: 'Three terms with coefficients', 3: 'Fractional coefficients' },
  options: EXPAND_OPTIONS.map((spec) => (spec.id === 'terms' ? { ...spec, label: 'Terms' } : spec.id === 'powers' ? { ...spec, label: 'Include coefficients' } : spec.id === 'radicals' ? { ...spec, label: 'Include a fractional coefficient' } : spec)),
  generate(rng, difficulty, o) {
    const base = expandBase(rng, o);
    const { top, bottom } = factorsFor(rng, difficulty, o);
    const given = expanded(base, top, bottom);
    const answer = log(base, quotientText(top, bottom));
    return {
      body: `Write as a single logarithm: ${math(given)}`,
      answer: math(answer),
      distractors: [
        log(base, quotientText([...top, ...bottom], [])),
        log(base, quotientText(bottom.length ? bottom : top, bottom.length ? top : [])),
        log(base, [...top, ...bottom].map((f) => (f.p.eq(1) ? f.v : `${f.p.typst()} ${f.v}`)).join(' + ')),
        log(base, quotientText(top.map((f) => ({ ...f, p: new Q(1) })), bottom.map((f) => ({ ...f, p: new Q(1) })))),
      ].filter((d) => d !== answer).map(math),
      solution: `Move each coefficient in as an exponent (power law), then combine sums as products and differences as quotients: ${math(`${given} = ${answer}`)}.`,
    };
  },
});

export const logEvaluateLaws = pc40s('40s-log-evaluate-laws', {
  levels: { 1: 'Sum or difference of two logs', 2: 'With a coefficient', 3: 'In terms of given logs' },
  options: [
    radioOption('form', 'Expression', [['1', 'Sum or difference of two logs'], ['2', 'With a coefficient'], ['3', 'In terms of given logs']], ['1', '2', '3']),
    radioOption('base', 'Base (first two forms)', [['small', '2 or 3'], ['any', '2 to 6'], ['ten', '10']], ['any', 'any', 'any']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    if (difficulty === 3) {
      const b = rng.pick(['b', 'a']);
      const i = rng.int(1, 4), j = rng.int(1, 3), k = rng.int(0, 1);
      const value = 2 ** i * 3 ** j * 5 ** k;
      const withFive = k === 1;
      // Terms like 3p, p^3, or 3 log_b 2, skipping zero powers.
      const terms = (pairs: Array<[number, string]>, show: (k: number, v: string) => string) => pairs.filter(([n]) => n).map(([n, v]) => show(n, v));
      const coef = (n: number, v: string) => (n === 1 ? v : `${n}${v}`);
      const pow = (n: number, v: string) => (n === 1 ? v : `${v}^${n}`);
      const pairs: Array<[number, string]> = [[i, 'p'], [j, 'q'], [k, 'r']];
      const answer = terms(pairs, coef).join(' + ');
      return {
        body: `Given ${math(`log_${b} 2 = p`)}, ${math(`log_${b} 3 = q`)}${withFive ? `, and ${math(`log_${b} 5 = r`)}` : ''}, write ${math(`log_${b} ${value}`)} in terms of ${withFive ? `${math('p')}, ${math('q')}, and ${math('r')}` : `${math('p')} and ${math('q')}`}.`,
        answer: math(answer),
        distractors: [
          // Swapping the roles of 2 and 3 (only a different answer when their powers differ).
          i !== j ? terms([[i, 'q'], [j, 'p'], [k, 'r']], coef).join(' + ') : terms([[i + 1, 'p'], [j, 'q'], [k, 'r']], coef).join(' + '),
          terms(pairs, pow).join(' + '),
          `${i + j + k}(p + q)`,
          terms(pairs, coef).join(' dot '),
        ].filter((d) => d !== answer).map(math),
        solution: `${math(`${value} = ${[i ? (i === 1 ? '2' : `2^${i}`) : '', j ? (j === 1 ? '3' : `3^${j}`) : '', withFive ? '5' : ''].filter(Boolean).join(' dot ')}`)}, so ${math(`log_${b} ${value} = ${[i ? `${i === 1 ? '' : i} log_${b} 2` : '', j ? `${j === 1 ? '' : j} log_${b} 3` : '', withFive ? `log_${b} 5` : ''].filter(Boolean).join(' + ')} = ${answer}`)}.`,
      };
    }
    const baseOpt = optOne(o, 'base', 'any');
    const base = baseOpt === 'ten' ? 10 : rng.pick(baseOpt === 'small' ? [2, 3] : [2, 3, 4, 5, 6]);
    const target = rng.int(difficulty === 1 ? 1 : 2, 3);
    const total = base ** target;
    let expr: string, steps: string;
    if (difficulty === 1) {
      const divisors = [2, 3, 4, 5, 6, 8, 9, 10, 12].filter((d) => total % d === 0 && d !== total && d !== 1);
      const m = rng.pick(divisors.length ? divisors : [1]);
      if (rng.next() < 0.5 || m === 1) {
        const k = rng.int(2, 7);
        expr = `${log(base, String(total * k))} - ${log(base, String(k))}`;
        steps = `${log(base, `${total * k}/${k}`)} = ${log(base, String(total))}`;
      } else {
        const other = total / m;
        const split = rng.pick([2, 4, 5]);
        const a = new Q(m * split), c = new Q(other, split);
        expr = `${log(base, a.typst())} + ${log(base, c.isInt ? c.typst() : String(c.value))}`;
        steps = `${log(base, `${a.typst()} dot ${c.isInt ? c.typst() : String(c.value)}`)} = ${log(base, String(total))}`;
      }
    } else {
      const k = rng.int(2, 5);
      const extra = rng.int(2, 6);
      // 2 log_b k + log_b (total·extra/k²)... choose k² dividing total·m.
      const m = k * k;
      expr = `2${log(base, String(k))} + ${log(base, String(total * extra))} - ${log(base, String(m * extra))}`;
      steps = `${log(base, String(m))} + ${log(base, String(total * extra))} - ${log(base, String(m * extra))} = ${log(base, `(${m} dot ${total * extra})/${m * extra}`)} = ${log(base, String(total))}`;
    }
    return {
      body: `Evaluate without technology: ${math(expr)}`,
      answer: math(String(target)),
      distractors: [String(target + 1), String(total), String(target - 1 || target + 2), target % 2 ? `${target}/2` : String(target * 2)].map(math),
      solution: math(`${expr} = ${steps} = ${target}`),
    };
  },
});

export const logApprox = pc40s('40s-log-approx', {
  points: 1,
  levels: { 1: 'Evaluate log_b x', 2: 'Using the change of base', 3: 'Expressions with several logs' },
  options: [radioOption('places', 'Round to', [['2', '2 decimal places'], ['3', '3 decimal places'], ['4', '4 decimal places']], ['3', '3', '3'])],
  generate(rng, difficulty, o) {
    const places = optNum(o, 'places', 3);
    const word = ['', '', 'two', 'three', 'four'][places];
    const round = (v: number, _p: number) => fmtRound(v, places);
    const lg = (b: number, x: number) => Math.log(x) / Math.log(b);
    if (difficulty === 3) {
      const b1 = rng.pick([2, 3, 5]), x1 = rng.int(6, 40), b2 = rng.pick([4, 6, 7]), x2 = rng.int(5, 50), k = rng.int(2, 4);
      const value = k * lg(b1, x1) - lg(b2, x2);
      const expr = `${k}${log(b1, String(x1))} - ${log(b2, String(x2))}`;
      return {
        body: `Evaluate to ${word} decimal places: ${math(expr)}`,
        answer: math(round(value, 3)),
        distractors: [round(k * lg(b1, x1) + lg(b2, x2), 3), round(lg(b1, x1 ** k / x2), 3), round(k * Math.log10(x1 / b1) - Math.log10(x2 / b2), 3)].map(math),
        solution: math(`${expr} = ${k} dot (log ${x1})/(log ${b1}) - (log ${x2})/(log ${b2}) approx ${round(value, 3)}`),
      };
    }
    const b = rng.pick([3, 4, 5, 6, 7, 8, 9, 11, 12]);
    const x = difficulty === 1 ? rng.int(10, 200) : Number((rng.int(11, 99) / 10).toFixed(1));
    const value = lg(b, x);
    return {
      body: difficulty === 1
        ? `Use technology to evaluate ${math(log(b, String(x)))} to ${word} decimal places.`
        : `Use the change of base formula to evaluate ${math(log(b, String(x)))} to ${word} decimal places.`,
      answer: math(round(value, 3)),
      // Common slips: the reciprocal, log(x/b), and forgetting the base (log x or ln x).
      distractors: [round(Math.log10(b) / Math.log10(x), 3), round(Math.log10(x / b), 3), round(Math.log10(x), 3), round(Math.log(x), 3)].filter((d) => d !== round(value, 3)).map(math),
      solution: math(`${log(b, String(x))} = (log ${x})/(log ${b}) approx ${round(value, 3)}`),
    };
  },
});

export const logCharacteristics = pc40s('40s-log-characteristics', {
  levels: { 1: 'Translations of y = log_b x', 2: 'With a vertical stretch or reflection', 3: 'With a horizontal stretch' },
  options: [
    toggleOption('vertical', 'Include a vertical stretch or reflection', [false, true, true]),
    toggleOption('horizontal', 'Include a horizontal stretch or reflection', [false, false, true]),
    radioOption('ask', 'Ask for', [['domain', 'The domain'], ['asymptote', 'The asymptote'], ['intercept', 'The x-intercept'], ['mixed', 'Any of these']], ['mixed', 'mixed', 'mixed']),
  ],
  generate(rng, difficulty, o) {
    const b = rng.pick([2, 3, 5, 10]);
    const h = rng.nonZero(-6, 6);
    const a = optOn(o, 'vertical', difficulty > 1) ? rng.pick([-3, -2, -1, 2, 3]) : 1;
    const c = optOn(o, 'horizontal', difficulty === 3) ? rng.pick([2, 3, -1]) : 1; // y = a log_b (c(x − h)) + k
    const n = rng.int(-2, 2); // choose k so the x-intercept is exact: a·log_b(c(x−h)) = −k with log value n
    const k = -a * n;
    const inside = c === 1 ? (h === 0 ? 'x' : `x ${h < 0 ? '+' : '-'} ${Math.abs(h)}`) : `${c === -1 ? '-' : c}(x ${h < 0 ? '+' : '-'} ${Math.abs(h)})`;
    const lead = a === 1 ? '' : a === -1 ? '-' : String(a);
    const tail = k === 0 ? '' : ` ${k < 0 ? '-' : '+'} ${Math.abs(k)}`;
    const equation = `y = ${lead}${log(b, inside)}${tail}`;
    // x-intercept: c(x − h) = b^n  →  x = h + b^n / c
    const xInt = new Q(h).add(new Q(b ** Math.max(n, 0), b ** Math.max(-n, 0)).div(c));
    const askOpt = optOne(o, 'ask', 'mixed');
    const ask = askOpt === 'mixed' ? rng.pick(['domain', 'asymptote', 'intercept'] as const) : askOpt as 'domain' | 'asymptote' | 'intercept';
    const domain = c > 0 ? `x > ${h}` : `x < ${h}`;
    const answers = { domain: `{x | ${domain}, x in RR}`, asymptote: `x = ${h}`, intercept: `(${xInt.typst()}, 0)` };
    const wrong = {
      domain: [`{x | ${c > 0 ? `x < ${h}` : `x > ${h}`}, x in RR}`, `{x | x > ${-h}, x in RR}`, `{x | x in RR}`],
      asymptote: [`x = ${-h}`, `y = ${k}`, `x = 0`],
      intercept: [`(${new Q(h).add(1).typst()}, 0)`, `(${xInt.neg().typst()}, 0)`, `(${new Q(h).add(b ** Math.abs(n)).typst()}, 0)`, `(0, ${k})`],
    };
    const noun = { domain: 'the domain', asymptote: 'the equation of the vertical asymptote', intercept: 'the x-intercept' }[ask];
    return {
      body: `State ${noun} of ${math(equation)}.`,
      answer: math(answers[ask]),
      distractors: wrong[ask].filter((d) => d !== answers[ask]).map(math),
      solution: ask === 'intercept'
        ? `Set ${math('y = 0')}: ${math(`${lead}${log(b, inside)} = ${-k}`)}, so ${math(`${log(b, inside)} = ${n}`)}, ${math(`${inside} = ${b}^(${n})`)}, and ${math(`x = ${xInt.typst()}`)}.`
        : `The argument must be positive: ${math(`${inside} > 0`)} gives ${math(domain)}. The vertical asymptote is where the argument is zero, ${math(`x = ${h}`)}.`,
    };
  },
});

export const logSolve = pc40s('40s-log-solve', {
  levels: { 1: 'log_b (ax + c) = n', 2: 'Sum of logs, reject extraneous roots', 3: 'Difference of logs' },
  options: [
    radioOption('form', 'Equation', [['1', 'log_b (ax + c) = n'], ['2', 'Sum of logs, reject extraneous roots'], ['3', 'Difference of logs']], ['1', '2', '3']),
    sizeOption([5, 12, 20], [12, 12, 12], 'Size of the solution (first form)'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    if (difficulty === 1) {
      const b = rng.pick([2, 3, 4, 5, 10]);
      const n = rng.int(1, b >= 5 ? 2 : 4);
      const a = rng.int(1, 5);
      const x = rng.int(-5, optNum(o, 'size', 12));
      const c = b ** n - a * x;
      const inside = `${a === 1 ? '' : a}x ${c < 0 ? '-' : '+'} ${Math.abs(c)}`;
      return {
        body: `Solve: ${math(`${log(b, inside)} = ${n}`)}`,
        answer: math(`x = ${x}`),
        distractors: [`x = ${frac(n - c, a)}`, `x = ${frac(b * n - c, a)}`, `x = ${frac(n ** b - c, a)}`].map(math),
        solution: math(`${inside} = ${b}^${n} = ${b ** n}`) + `, so ${math(`${a === 1 ? '' : a}x = ${b ** n - c}`)} and ${math(`x = ${x}`)}. Check: ${math(`${a * x + c} > 0`)}.`,
      };
    }
    if (difficulty === 2) {
      for (;;) {
        const [b, n] = rng.pick([[2, 3], [2, 4], [2, 5], [2, 6], [3, 2], [3, 3], [6, 2], [10, 2], [4, 2]] as const);
        const total = b ** n;
        const roots = [];
        for (let r = Math.ceil(Math.sqrt(total)) + 1; r <= total; r++) if (total % r === 0) roots.push(r);
        if (!roots.length) continue;
        const r = rng.pick(roots);
        const d = r - total / r;
        if (d <= 0) continue;
        const other = -total / r;
        return {
          body: `Solve: ${math(`${log(b, 'x')} + ${log(b, `x - ${d}`)} = ${n}`)}`,
          answer: math(`x = ${r}`),
          distractors: [`x = ${r} "or" x = ${other}`, `x = ${other}`, `x = ${total}`].map(math),
          solution: `${math(`${log(b, `x(x - ${d})`)} = ${n}`)}, so ${math(`x^2 - ${d === 1 ? '' : d}x = ${total}`)}, ${math(`(x - ${r})(x + ${-other}) = 0`)}, and ${math(`x = ${r}`)} or ${math(`x = ${other}`)}. `
            + `${math(`x = ${other}`)} is extraneous because ${math(log(b, String(other)))} is undefined. The solution is ${math(`x = ${r}`)}.`,
        };
      }
    }
    for (;;) {
      const b = rng.pick([2, 3, 5]);
      const n = rng.int(1, 2);
      const B = b ** n;
      const q = rng.int(1, 6), p = rng.int(1, 9);
      const num = p + B * q, den = B - 1;
      if (num % den !== 0) continue;
      const x = num / den;
      if (x - q <= 0) continue;
      return {
        body: `Solve: ${math(`${log(b, `x + ${p}`)} - ${log(b, `x - ${q}`)} = ${n}`)}`,
        answer: math(`x = ${x}`),
        distractors: [`x = ${frac(B * q - p, B + 1)}`, `x = ${B + q - p}`, `x = ${frac(p + q, B)}`].filter((d) => d !== `x = ${x}`).map(math),
        solution: `${math(`${log(b, `(x + ${p})/(x - ${q})`)} = ${n}`)}, so ${math(`x + ${p} = ${B}(x - ${q})`)}. Then ${den === 1 ? '' : `${math(`${den}x = ${num}`)} and `}${math(`x = ${x}`)}. Check: both arguments are positive at ${math(`x = ${x}`)}.`,
      };
    }
  },
});

/** `an` before numbers read with a vowel sound (8, 11, 18, 80–89), otherwise `a`. */
const article = (n: number) => (/^8/.test(String(n)) || n === 11 || n === 18 ? 'an' : 'a');

export const logScales = pc40s('40s-log-scales', {
  levels: { 1: 'Compare whole-number differences', 2: 'Compare decimal differences', 3: 'Find a value on the scale' },
  options: [radioOption('scale', 'Scale', [['richter', 'Richter (earthquakes)'], ['ph', 'pH'], ['decibel', 'Decibels'], ['mixed', 'Mixed']], ['mixed', 'mixed', 'mixed'])],
  generate(rng, difficulty, o) {
    const scaleOpt = optOne(o, 'scale', 'mixed');
    const scale = scaleOpt === 'mixed' ? rng.pick(['richter', 'ph', 'decibel'] as const) : scaleOpt as 'richter' | 'ph' | 'decibel';
    if (difficulty < 3) {
      // Compare two readings: the ratio is 10^(difference), with decibels in tenths.
      const [low, high] = scale === 'decibel'
        ? (() => { const l = rng.int(4, 8) * 10; return [l, l + (difficulty === 1 ? rng.int(1, 4) * 10 : rng.int(5, 35))]; })()
        : scale === 'richter'
          ? (() => { const l = rng.int(30, 60) / 10; return [l, Number((l + (difficulty === 1 ? rng.int(1, 3) : rng.int(3, 25) / 10)).toFixed(1))]; })()
          : (() => { const l = rng.int(2, 6); return [l, Number((l + (difficulty === 1 ? rng.int(1, 3) : rng.int(3, 25) / 10)).toFixed(1))]; })();
      const diff = Number((high - low).toFixed(1));
      const exponent = scale === 'decibel' ? diff / 10 : diff;
      const shown = (v: number) => (difficulty === 1 ? String(Math.round(v)) : round(v, 1));
      const text = shown(10 ** exponent);
      const question = {
        decibel: `Sound level is ${math('beta = 10 log (I/I_0)')}. How many times more intense is ${article(high)} ${high} dB sound than ${article(low)} ${low} dB sound?`,
        richter: `How many times more intense is an earthquake of magnitude ${high} than one of magnitude ${low}?`,
        ph: `How many times more acidic is a solution with pH ${low} than one with pH ${high}?`,
      }[scale];
      return {
        body: `${question}${difficulty === 2 ? ' Round to one decimal place.' : ''}`,
        answer: math(text),
        distractors: [shown(diff), shown(exponent * 10), shown(10 ** exponent * 10), shown(2 ** exponent)].filter((d) => d !== text).map(math),
        solution: `Each step of 1 on a base-10 logarithmic scale${scale === 'decibel' ? ' (10 dB)' : ''} is a factor of 10. The difference is ${math(String(diff))}${scale === 'decibel' ? ' dB' : ''}, so the ratio is ${math(`10^(${Number(exponent.toFixed(2))}) ${difficulty === 1 ? '=' : 'approx'} ${text}`)}.`,
      };
    }
    if (scale === 'ph') {
      const m = rng.int(11, 99) / 10, e = rng.int(2, 11);
      const ph = -Math.log10(m * 10 ** -e);
      return {
        body: `${math('"pH" = -log [H^+]')}. Find the pH of a solution with ${math(`[H^+] = ${m} times 10^(-${e})`)} mol/L, to two decimal places.`,
        answer: math(round(ph, 2)),
        distractors: [round(-ph, 2), round(e + Math.log10(m), 2), round(e, 2), round(Math.log10(m) - e + 2 * e, 2)].filter((d) => d !== round(ph, 2)).map(math),
        solution: math(`"pH" = -log (${m} times 10^(-${e})) approx ${round(ph, 2)}`),
      };
    }
    const ratio = rng.int(12, 950) * 10 ** rng.int(0, 3);
    const factor = scale === 'decibel' ? 10 : 1;
    const value = factor * Math.log10(ratio);
    return {
      body: scale === 'decibel'
        ? `${math('beta = 10 log (I/I_0)')}. A sound is ${math(String(ratio))} times as intense as the threshold of hearing ${math('I_0')}. Find its level in decibels, to one decimal place.`
        : `${math('M = log (I/I_0)')}. An earthquake is ${math(String(ratio))} times as intense as a reference earthquake ${math('I_0')}. Find its magnitude, to one decimal place.`,
      answer: math(round(value, 1)),
      distractors: [round(scale === 'decibel' ? value / 10 : value * 10, 1), round(Math.log(ratio) * factor, 1), round(value + factor, 1)].filter((d) => d !== round(value, 1)).map(math),
      solution: math(`${scale === 'decibel' ? 'beta = 10' : 'M ='} log ${ratio} approx ${round(value, 1)}`),
    };
  },
});

function logGraphSpec(b: number, a: number, h: number, k: number, size: number) {
  return {
    xMin: -8, xMax: 8, yMin: -8, yMax: 8, xLabelStep: 4, yLabelStep: 4, width: size, height: size,
    curves: [{ f: (x: number) => a * Math.log(x - h) / Math.log(b) + k, domain: [h + 1e-4, 8] as [number, number] }],
    vertical: [h],
  };
}

export const logSketch = pc40s('40s-log-sketch', {
  levels: { 1: 'Translations', 2: 'With a vertical stretch', 3: 'With a reflection' },
  options: [
    toggleOption('stretch', 'Include a vertical stretch', [false, true, false]),
    toggleOption('reflect', 'Include a reflection in the x-axis', [false, false, true]),
  ],
  generate(rng, difficulty, o) {
    const b = rng.pick([2, 3]);
    const h = rng.int(-5, 3), k = rng.int(-4, 4);
    const a = (optOn(o, 'reflect', difficulty === 3) ? -1 : 1) * (optOn(o, 'stretch', difficulty === 2) ? rng.pick([2, 3]) : 1);
    const lead = a === 1 ? '' : a === -1 ? '-' : String(a);
    const inside = h === 0 ? 'x' : `x ${h < 0 ? '+' : '-'} ${Math.abs(h)}`;
    const equation = `y = ${lead}${log(b, inside)}${k === 0 ? '' : ` ${k < 0 ? '-' : '+'} ${Math.abs(k)}`}`;
    const graph = (A: number, H: number, K: number) => graphTypst(logGraphSpec(b, A, H, K, 3.4));
    const answer = graph(a, h, k);
    return {
      body: `Graph ${math(equation)}.`,
      answer,
      distractors: [graph(a, -h, k), graph(-a, h, k), graph(a, h, -k)],
      solution: `Start from ${math(`y = ${log(b, 'x')}`)} (through ${math('(1, 0)')} and ${math(`(${b}, 1)`)})${a !== 1 ? `, ${a < 0 ? 'reflect in the x-axis' : ''}${Math.abs(a) > 1 ? `${a < 0 ? ' and ' : ''}stretch vertically by ${Math.abs(a)}` : ''}` : ''}, then translate ${h === 0 ? '' : `${Math.abs(h)} ${h > 0 ? 'right' : 'left'}`}${h !== 0 && k !== 0 ? ' and ' : ''}${k === 0 ? '' : `${Math.abs(k)} ${k > 0 ? 'up' : 'down'}`}. `
        + `The point ${math('(1, 0)')} moves to ${math(`(${1 + h}, ${k})`)}. Domain ${math(`{x | x > ${h}}`)}, range ${math('{y | y in RR}')}, asymptote ${math(`x = ${h}`)}.`,
    };
  },
});

export const logProveLaw = pc40s('40s-log-prove-law', {
  mcq: false,
  points: 3,
  levels: { 1: 'Product law', 2: 'Quotient law', 3: 'Power law' },
  options: [
    radioOption('form', 'Law', [['1', 'Product law'], ['2', 'Quotient law'], ['3', 'Power law']], ['1', '2', '3']),
    radioOption('letters', 'Letters', [['MN', 'M and N'], ['xy', 'x and y'], ['AB', 'A and B'], ['any', 'Any']], ['any', 'any', 'any']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const letters = optOne(o, 'letters', 'any');
    const [M, N] = letters === 'any' ? rng.pick([['M', 'N'], ['x', 'y'], ['A', 'B']]) : [letters[0], letters[1]];
    const law = (['product', 'quotient', 'power'] as const)[difficulty - 1];
    const statement = { product: `log_b (${M} ${N}) = log_b ${M} + log_b ${N}`, quotient: `log_b (${M}/${N}) = log_b ${M} - log_b ${N}`, power: `log_b ${M}^p = p log_b ${M}` }[law];
    const proof = {
      product: `Let ${math(`log_b ${M} = u`)} and ${math(`log_b ${N} = v`)}, so ${math(`${M} = b^u`)} and ${math(`${N} = b^v`)}. Then ${math(`${M} ${N} = b^u b^v = b^(u + v)`)}. Writing this in logarithmic form, ${math(`log_b (${M} ${N}) = u + v = log_b ${M} + log_b ${N}`)}.`,
      quotient: `Let ${math(`log_b ${M} = u`)} and ${math(`log_b ${N} = v`)}, so ${math(`${M} = b^u`)} and ${math(`${N} = b^v`)}. Then ${math(`${M}/${N} = b^u / b^v = b^(u - v)`)}. Writing this in logarithmic form, ${math(`log_b (${M}/${N}) = u - v = log_b ${M} - log_b ${N}`)}.`,
      power: `Let ${math(`log_b ${M} = u`)}, so ${math(`${M} = b^u`)}. Then ${math(`${M}^p = (b^u)^p = b^(u p)`)}. Writing this in logarithmic form, ${math(`log_b ${M}^p = u p = p log_b ${M}`)}.`,
    }[law];
    return {
      body: `Prove the ${law} law of logarithms: ${math(statement)}, where ${math(`b > 0`)}, ${math('b != 1')}, and ${law === 'power' ? math(`${M} > 0`) : math(`${M}, ${N} > 0`)}.`,
      answer: `Proof below.`,
      distractors: [],
      solution: proof + ' ∎',
    };
  },
});

export const LOGARITHM_GENERATORS = [logConvert, logEvaluate, logEstimate, logExpand, logCondense, logEvaluateLaws, logApprox, logCharacteristics, logSolve, logScales, logSketch, logProveLaw];

