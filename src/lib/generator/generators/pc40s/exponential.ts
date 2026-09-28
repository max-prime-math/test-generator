import { round } from '../../format.ts';
import { Q } from '../../exact.ts';
import { graphTypst } from '../../graph.ts';
import { math, pc40s } from './common.ts';
import { optNum, optOn, optOne, radioOption, toggleOption } from '../../options.ts';

/** `3`, `(1/2)`: a base ready to take an exponent. */
const baseText = (b: Q) => (b.isInt ? String(b.n) : `(${b.typst()})`);
/** a·b^(exponent): `2^x`, `-2^x`, `3(2)^x`, `3(1/2)^x` (the base is bracketed after a number so 3·10ˣ never reads as 310ˣ). */
const scaled = (a: number, base: string, exponent: string) => {
  const e = /^[0-9a-z]$/.test(exponent) ? exponent : `(${exponent})`;
  if (a === 1) return `${base}^${e}`;
  if (a === -1) return `-${base}^${e}`;
  return `${a}(${base.replace(/^\((.*)\)$/, '$1')})^${e}`;
};
/** `+ 3` / `- 3`, or nothing for zero. */
const plus = (k: number) => (k === 0 ? '' : ` ${k < 0 ? '-' : '+'} ${Math.abs(k)}`);
/** `x - 2`, `x + 3`, or `x`. */
const shifted = (h: number) => (h === 0 ? 'x' : `x ${h < 0 ? '+' : '-'} ${Math.abs(h)}`);

export const expCharacteristics = pc40s('40s-exp-characteristics', {
  points: 1,
  levels: { 1: 'y = bˣ with b > 1', 2: 'y = bˣ with 0 < b < 1', 3: 'y = a·bˣ' },
  options: [
    radioOption('base', 'Base', [['growth', 'b > 1 (growth)'], ['decay', '0 < b < 1 (decay)'], ['either', 'Either']], ['growth', 'decay', 'either']),
    toggleOption('coef', 'Include a coefficient (y = a·bˣ)', [false, false, true]),
  ],
  generate(rng, difficulty, o) {
    const base = optOne(o, 'base', difficulty === 1 ? 'growth' : difficulty === 2 ? 'decay' : 'either');
    const b = base === 'decay' || (base === 'either' && rng.next() < 0.5) ? new Q(1, rng.pick([2, 3, 4, 5])) : new Q(rng.pick([2, 3, 4, 5, 10]));
    const a = optOn(o, 'coef', difficulty === 3) ? rng.pick([-3, -2, 2, 3, 4]) : 1;
    const equation = `y = ${scaled(a, baseText(b), 'x')}`;
    const ask = rng.pick(['range', 'intercept', 'behaviour', 'asymptote'] as const);
    const growing = (b.value > 1) === (a > 0);
    const answers = {
      range: a > 0 ? '{y | y > 0, y in RR}' : '{y | y < 0, y in RR}',
      intercept: `(0, ${a})`,
      behaviour: `"${growing ? 'increasing' : 'decreasing'}"`,
      asymptote: 'y = 0',
    };
    const wrong = {
      range: [a > 0 ? '{y | y < 0, y in RR}' : '{y | y > 0, y in RR}', '{y | y in RR}', `{y | y > ${a}, y in RR}`],
      intercept: [`(${a}, 0)`, '(0, 0)', `(0, ${new Q(a).mul(b).typst()})`, `(1, ${a})`],
      behaviour: [`"${growing ? 'decreasing' : 'increasing'}"`, '"constant"', '"increasing, then decreasing"'],
      asymptote: ['x = 0', `y = ${a}`, '"none"'],
    };
    const noun = { range: 'the range', intercept: 'the y-intercept', behaviour: 'whether the function is increasing or decreasing', asymptote: 'the equation of the horizontal asymptote' }[ask];
    return {
      body: ask === 'behaviour' ? `State whether ${math(equation)} is increasing or decreasing.` : `State ${noun} of ${math(equation)}.`,
      answer: math(answers[ask]),
      distractors: wrong[ask].filter((d) => d !== answers[ask]).map(math),
      solution: `${math(`${baseText(b)}^x > 0`)} for every ${math('x')}, so the graph approaches the asymptote ${math('y = 0')} and never reaches it. `
        + `At ${math('x = 0')}, ${math(`y = ${a}`)}. The base is ${b.value > 1 ? 'greater than 1' : 'between 0 and 1'}${a < 0 ? ' and the graph is reflected in the x-axis' : ''}, so the function is ${growing ? 'increasing' : 'decreasing'}; `
        + `the range is ${math(answers.range)}.`,
    };
  },
});

export const expTransformed = pc40s('40s-exp-transformed', {
  levels: { 1: 'Translations', 2: 'With a vertical stretch or reflection', 3: 'With a horizontal stretch' },
  options: [
    toggleOption('vertical', 'Include a vertical stretch or reflection', [false, true, true]),
    toggleOption('horizontal', 'Include a horizontal stretch', [false, false, true]),
    radioOption('ask', 'Ask for', [['asymptote', 'The asymptote'], ['range', 'The range'], ['intercept', 'The y-intercept'], ['mixed', 'Any of these']], ['mixed', 'mixed', 'mixed']),
  ],
  generate(rng, difficulty, o) {
    const b = rng.pick([2, 3, 4]);
    const h = rng.int(-4, 4), k = rng.nonZero(-6, 6);
    const a = optOn(o, 'vertical', difficulty > 1) ? rng.pick([-3, -2, -1, 2, 3]) : 1;
    const c = optOn(o, 'horizontal', difficulty === 3) ? rng.pick([2, 3]) : 1;
    const exponent = c === 1 ? shifted(h) : `${c}(${shifted(h)})`;
    const equation = `y = ${scaled(a, String(b), exponent)}${plus(k)}`;
    const askOpt = optOne(o, 'ask', 'mixed');
    const ask = askOpt === 'mixed' ? rng.pick(['asymptote', 'range', 'intercept'] as const) : askOpt as 'asymptote' | 'range' | 'intercept';
    // y-intercept: a·b^(c(0 − h)) + k = a·b^(−ch) + k
    const power = -c * h;
    const yInt = new Q(a).mul(power >= 0 ? new Q(b ** power) : new Q(1, b ** -power)).add(k);
    const range = a > 0 ? `{y | y > ${k}, y in RR}` : `{y | y < ${k}, y in RR}`;
    const answers = { asymptote: `y = ${k}`, range, intercept: `(0, ${yInt.typst()})` };
    const wrong = {
      asymptote: [`y = ${-k}`, `x = ${h}`, 'y = 0'],
      range: [a > 0 ? `{y | y < ${k}, y in RR}` : `{y | y > ${k}, y in RR}`, `{y | y > ${-k}, y in RR}`, '{y | y > 0, y in RR}'],
      intercept: [`(0, ${new Q(a).add(k).typst()})`, `(0, ${new Q(a).mul(power <= 0 ? new Q(b ** -power) : new Q(1, b ** power)).add(k).typst()})`, `(0, ${yInt.neg().typst()})`, `(0, ${k})`],
    };
    const noun = { asymptote: 'the equation of the horizontal asymptote', range: 'the range', intercept: 'the y-intercept' }[ask];
    return {
      body: `State ${noun} of ${math(equation)}.`,
      answer: math(answers[ask]),
      distractors: wrong[ask].filter((d) => d !== answers[ask]).map(math),
      solution: `The vertical translation of ${math(String(k))} moves the asymptote to ${math(`y = ${k}`)}; ${a > 0 ? 'the graph stays above it' : 'the reflection puts the graph below it'}, so the range is ${math(range)}. `
        + `At ${math('x = 0')}: ${math(`y = ${scaled(a, String(b), String(power))} ${k < 0 ? '-' : '+'} ${Math.abs(k)} = ${yInt.typst()}`)}.`,
    };
  },
});

const linear = (a: number, c: number) => `${a === 1 ? '' : a === -1 ? '-' : a}x${c === 0 ? '' : ` ${c < 0 ? '-' : '+'} ${Math.abs(c)}`}`;

export const expCommonBase = pc40s('40s-exp-common-base', {
  levels: { 1: 'b^(ax + c) = bⁿ', 2: 'Different powers of one base', 3: 'Reciprocals and radicals' },
  options: [
    radioOption('form', 'Equation', [['1', 'b^(ax + c) = a number'], ['2', 'Different powers of one base'], ['3', 'With reciprocals and radicals']], ['1', '2', '3']),
    radioOption('base', 'Common base', [['2', '2'], ['3', '3'], ['5', '5'], ['mixed', 'Mixed']], ['mixed', 'mixed', 'mixed']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl);
    const baseOpt = optOne(o, 'base', 'mixed');
    for (;;) {
      const p = baseOpt === 'mixed' ? rng.pick([2, 3, 5]) : Number(baseOpt);
      const maxPower = p === 2 ? 4 : p === 3 ? 3 : 2;
      const a = rng.int(1, 3), c = rng.int(-4, 4);
      // Each side is p raised to (multiplier × exponent): 8 = 2^3, 1/9 = 3^-2, sqrt(5) = 5^(1/2).
      let lhs: string, rhs: string, mL: Q, mR: Q, d = 0, e: number;
      if (difficulty === 1) {
        const N = rng.nonZero(-3, maxPower + 2);
        lhs = `${p}^(${linear(a, c)})`; mL = new Q(1);
        rhs = N > 0 ? String(p ** N) : `1/${p ** -N}`; mR = new Q(N); e = 1;
      } else {
        const m = rng.int(1, maxPower), n = rng.int(1, maxPower);
        if (m === n) continue;
        d = rng.int(0, 2); e = rng.int(-3, 3);
        if (d === 0 && e === 0) continue;
        const rExp = d === 0 ? String(e) : linear(d, e);
        if (difficulty === 2) {
          lhs = `${p ** m}^(${linear(a, c)})`; mL = new Q(m);
          rhs = `${p ** n}^(${rExp})`; mR = new Q(n);
        } else {
          lhs = `(1/${p ** m})^(${linear(a, c)})`; mL = new Q(-m);
          const root = rng.next() < 0.5;
          rhs = root ? `(sqrt(${p ** n}))^(${rExp})` : `${p ** n}^(${rExp})`; mR = root ? new Q(n, 2) : new Q(n);
        }
      }
      // mL(ax + c) = mR(dx + e)  →  x = (mR e − mL c) / (mL a − mR d)
      const denom = mL.mul(a).sub(mR.mul(d));
      if (denom.eq(0)) continue;
      const x = mR.mul(e).sub(mL.mul(c)).div(denom);
      if (x.d > 6 || Math.abs(x.value) > 20) continue;
      const answer = `x = ${x.typst()}`;
      const naive = a - d === 0 ? null : new Q(e - c, a - d);
      const exponent = (m: Q, text: string) => (m.eq(1) ? `(${text})` : `${m.isInt ? m.n : m.paren()}(${text})`);
      const rightText = difficulty === 1 ? String(mR.n) : exponent(mR, d === 0 ? String(e) : linear(d, e));
      return {
        body: `Solve: ${math(`${lhs} = ${rhs}`)}`,
        answer: math(answer),
        distractors: [x.neg(), naive, mR.mul(e).add(mL.mul(c)).div(denom), x.add(1)]
          .filter((v): v is Q => v !== null && !v.eq(x)).map((v) => math(`x = ${v.typst()}`)),
        solution: `Write both sides as powers of ${p}: ${math(`${p}^(${exponent(mL, linear(a, c))}) = ${p}^(${rightText})`)}. `
          + `Equate the exponents: ${math(`${exponent(mL, linear(a, c))} = ${rightText}`)}, so ${math(answer)}.`,
      };
    }
  },
});

/** c₁ log b₁ + c₂ log b₂ without zero terms or coefficients of 1: `3 log 2 - log 5`, `0`. */
function logTerms(terms: Array<[number, number]>): string {
  const parts = terms.filter(([c]) => c !== 0).map(([c, b], i) => {
    const mag = Math.abs(c) === 1 ? '' : `${Math.abs(c)} `;
    return i === 0 ? `${c < 0 ? '-' : ''}${mag}log ${b}` : ` ${c < 0 ? '-' : '+'} ${mag}log ${b}`;
  });
  return parts.length ? parts.join('') : '0';
}

export const expLogs = pc40s('40s-exp-logs', {
  levels: { 1: 'bˣ = c', 2: 'a·b^(kx + c) = d', 3: 'Different bases on each side' },
  options: [
    radioOption('form', 'Equation', [['1', 'bˣ = c'], ['2', 'a·b^(kx + c) = d'], ['3', 'Different bases on each side']], ['1', '2', '3']),
    radioOption('places', 'Round to', [['2', '2 decimal places'], ['3', '3 decimal places'], ['4', '4 decimal places']], ['3', '3', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl);
    const places = optNum(o, 'places', 3);
    const placeWord = ['', '', 'two', 'three', 'four'][places];
    const round3 = (v: number, _p?: number) => round(v, places);
    const lg = Math.log10;
    if (difficulty === 1) {
      const b = rng.pick([2, 3, 5, 6, 7, 1.05, 1.08]);
      const c = b < 2 ? rng.int(2, 4) : rng.int(10, 200);
      const x = lg(c) / lg(b);
      return {
        body: `Solve to ${placeWord} decimal places: ${math(`${b}^x = ${c}`)}`,
        answer: math(`x approx ${round3(x, 3)}`),
        distractors: [round3(c / b, 3), round3(lg(c / b), 3), round3(lg(b) / lg(c), 3)].map((v) => math(`x approx ${v}`)),
        solution: `Take the log of both sides: ${math(`x log ${b} = log ${c}`)}, so ${math(`x = (log ${c})/(log ${b}) approx ${round3(x, 3)}`)}.`,
      };
    }
    if (difficulty === 2) {
      const a = rng.int(2, 6), b = rng.pick([2, 3, 5]), k = rng.int(1, 3), c = rng.int(-3, 3);
      const d = a * rng.int(3, 40);
      const x = (lg(d / a) / lg(b) - c) / k;
      const exp = `${k === 1 ? '' : k}x${c === 0 ? '' : ` ${c < 0 ? '-' : '+'} ${Math.abs(c)}`}`;
      return {
        body: `Solve to ${placeWord} decimal places: ${math(`${a}(${b})^(${exp}) = ${d}`)}`,
        answer: math(`x approx ${round3(x, 3)}`),
        distractors: [round3((lg(d) / lg(a * b) - c) / k, 3), round3((lg(d / a) / lg(b) + c) / k, 3), round3(lg(d / a) / lg(b) / k - c, 3)].map((v) => math(`x approx ${v}`)),
        solution: `Divide by ${a}: ${math(`${b}^(${exp}) = ${d / a}`)}. Then ${math(`${exp} = (log ${d / a})/(log ${b})`)}, so ${math(`x approx ${round3(x, 3)}`)}.`,
      };
    }
    const [b1, b2] = rng.shuffle([2, 3, 5, 7]).slice(0, 2);
    const p = rng.int(-3, 3), q = rng.nonZero(-3, 3);
    // b1^(x + p) = b2^(x + q)  →  x(log b1 − log b2) = q log b2 − p log b1
    const x = (q * lg(b2) - p * lg(b1)) / (lg(b1) - lg(b2));
    const exp = (s: number) => (s === 0 ? 'x' : `x ${s < 0 ? '-' : '+'} ${Math.abs(s)}`);
    return {
      body: `Solve to ${placeWord} decimal places: ${math(`${b1}^(${exp(p)}) = ${b2}^(${exp(q)})`)}`,
      answer: math(`x approx ${round3(x, 3)}`),
      distractors: [round3(-x, 3), round3((q - p) * lg(b2 / b1), 3), round3((q * lg(b2) + p * lg(b1)) / (lg(b1) - lg(b2)), 3)].filter((v) => v !== round3(x, 3)).map((v) => math(`x approx ${v}`)),
      solution: `Take logs: ${math(`${p === 0 ? 'x' : `(${exp(p)})`} log ${b1} = ${q === 0 ? 'x' : `(${exp(q)})`} log ${b2}`)}. Collect the x-terms: ${math(`x(log ${b1} - log ${b2}) = ${logTerms([[q, b2], [-p, b1]])}`)}, so ${math(`x approx ${round3(x, 3)}`)}.`,
    };
  },
});

export const expGrowthDecay = pc40s('40s-exp-growth-decay', {
  levels: { 1: 'Whole numbers of periods', 2: 'Any time', 3: 'Solve for time' },
  options: [
    radioOption('model', 'Situation', [['half-life', 'Half-life'], ['doubling', 'Doubling'], ['percent', 'Percent growth or decay'], ['mixed', 'Mixed']], ['mixed', 'mixed', 'mixed']),
    radioOption('find', 'Find', [['amount', 'The amount after a time'], ['time', 'The time to reach an amount']], ['amount', 'amount', 'time']),
    toggleOption('whole', 'Times are whole numbers of periods (when finding the amount)', [true, false, false]),
  ],
  generate(rng, gl, o) {
    const findTime = optOne(o, 'find', gl === 3 ? 'time' : 'amount') === 'time';
    const difficulty = findTime ? 3 : optOn(o, 'whole', gl === 1) ? 1 : 2;
    const modelOpt = optOne(o, 'model', 'mixed');
    const kind = modelOpt === 'mixed' ? rng.pick(['half-life', 'doubling', 'percent'] as const) : modelOpt as 'half-life' | 'doubling' | 'percent';
    const setup = {
      'half-life': () => {
        const name = rng.pick(['iodine-131', 'a radioactive isotope', 'a medication in the bloodstream', 'caffeine in the body']);
        const period = rng.pick([4, 5, 6, 8, 10, 12]);
        const unit = name.includes('medication') || name.includes('caffeine') ? 'hours' : 'days';
        const start = rng.pick([50, 80, 100, 200, 400, 640]);
        return { factor: 0.5, period, unit, start, text: `${name} has a half-life of ${period} ${unit}. A sample starts at ${start} mg.`, qty: 'mg', model: `A = ${start}(1/2)^(t/${period})` };
      },
      doubling: () => {
        const period = rng.pick([15, 20, 30, 45]);
        const start = rng.pick([100, 250, 500, 1200]);
        return { factor: 2, period, unit: 'minutes', start, text: `A bacteria culture doubles every ${period} minutes and starts with ${start} bacteria.`, qty: 'bacteria', model: `A = ${start}(2)^(t/${period})` };
      },
      percent: () => {
        const rate = rng.pick([3, 4, 5, 6, 8, 12]);
        const grow = rng.next() < 0.5;
        const start = rng.pick([2000, 5000, 12000, 25000]);
        const what = grow ? 'A town' : 'The value of a car';
        return { factor: grow ? 1 + rate / 100 : 1 - rate / 100, period: 1, unit: 'years', start, text: `${what} ${grow ? `has a population of ${start} and grows` : `is \\$${start} and decreases`} by ${rate}% per year.`, qty: grow ? 'people' : 'dollars', model: `A = ${start}(${grow ? 1 + rate / 100 : 1 - rate / 100})^t` };
      },
    }[kind]();
    const { factor, period, unit, start, model } = setup;
    const text = setup.text.charAt(0).toUpperCase() + setup.text.slice(1);
    const amount = (t: number) => start * factor ** (t / period);
    if (difficulty < 3) {
      const t = difficulty === 1 ? period * rng.int(2, 5) : Math.round(period * (rng.int(12, 45) / 10));
      const value = amount(t);
      const places = kind === 'doubling' || setup.qty === 'people' ? 0 : 1;
      const show = (v: number) => (places === 0 ? String(Math.round(v)) : round(v, 1));
      const linearModel = start * (1 + (factor - 1) * (t / period));
      return {
        body: `${text} Find the amount after ${t} ${t === 1 ? unit.replace(/s$/, '') : unit}${places ? ', to one decimal place' : ', to the nearest whole number'}.`,
        answer: math(show(value)),
        // Multiplying instead of raising to a power, an inverted exponent, a linear model, one period too many.
        distractors: [show(start * factor * (t / period)), show(start * factor ** (period / t)), ...(linearModel > 0 ? [show(linearModel)] : []), show(amount(t + period))].filter((d) => d !== show(value)).map(math),
        solution: `Model: ${math(model)}. At ${math(`t = ${t}`)}: ${math(`A ${Number.isInteger(value) ? '=' : 'approx'} ${show(value)}`)}.`,
      };
    }
    const target = kind === 'half-life' ? start * rng.pick([0.1, 0.2, 0.3, 0.05]) : start * rng.pick([3, 5, 10, 1.5]);
    const targetText = round(target, 0);
    const t = (period * Math.log(target / start)) / Math.log(factor);
    return {
      body: `${text} How long until the amount reaches ${targetText}? Round to one decimal place.`,
      answer: math(`${round(t, 1)} "${unit}"`),
      // Forgetting the period, a linear model, treating the ratio as a number of periods, one period off.
      distractors: [
        ...(period > 1 ? [Math.log(target / start) / Math.log(factor)] : []),
        (period * Math.abs(target - start)) / Math.abs(start * (factor - 1)),
        period * Math.max(target / start, start / target),
        t + period,
        Math.max(t - period, period / 2),
      ].map((v) => round(v, 1)).filter((d) => d !== round(t, 1) && Number(d) > 0).map((d) => math(`${d} "${unit}"`)),
      solution: `Set ${math(`${targetText} = ${model.slice(4)}`)}. Divide by ${start} and take logs: ${math(`t = (${period === 1 ? '' : `${period} `}log (${targetText}/${start}))/(log ${factor}) approx ${round(t, 1)}`)} ${unit}.`,
    };
  },
});

export const expFinance = pc40s('40s-exp-finance', {
  levels: { 1: 'Compounded annually', 2: 'Compounded monthly or quarterly', 3: 'Solve for time' },
  options: [
    radioOption('compounding', 'Compounded', [['1', 'Annually'], ['2', 'Semi-annually'], ['4', 'Quarterly'], ['12', 'Monthly'], ['365', 'Daily'], ['mixed', 'Quarterly or monthly']], ['1', 'mixed', 'mixed']),
    radioOption('find', 'Find', [['value', 'The future value'], ['time', 'The time to reach a goal']], ['value', 'value', 'time']),
  ],
  generate(rng, gl, o) {
    const difficulty = optOne(o, 'find', gl === 3 ? 'time' : 'value') === 'time' ? 3 : 2;
    const P = rng.pick([500, 1000, 2500, 5000, 10000, 15000]);
    const rate = rng.pick([2, 2.5, 3, 3.5, 4, 4.5, 5, 6, 7.5]);
    const comp = optOne(o, 'compounding', gl === 1 ? '1' : 'mixed');
    const n = comp === 'mixed' ? rng.pick([4, 12]) : Number(comp);
    const nText = ({ 1: 'annually', 2: 'semi-annually', 4: 'quarterly', 12: 'monthly', 365: 'daily' } as Record<number, string>)[n];
    const r = rate / 100;
    // `$` opens math in Typst, so money is escaped markup, never math.
    const money = (v: number) => `\\$${v.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (difficulty < 3) {
      const t = rng.int(3, 20);
      const A = P * (1 + r / n) ** (n * t);
      return {
        body: `${money(P)} is invested at ${rate}% per year, compounded ${nText}. Find the value after ${t} years.`,
        answer: money(A),
        // Simple interest, the interest alone, one year short or too many, and (when compounding
        // more than once a year) the annual rate used every period or too few periods.
        distractors: [P * (1 + r * t), A - P, P * (1 + r / n) ** (n * (t - 1)), P * (1 + r / n) ** (n * (t + 1)), ...(n > 1 ? [P * (1 + r) ** (t * n), P * (1 + r / n) ** t] : [])].filter((v) => v < A * 5).map(money),
        solution: `${math(`A = P(1 + r/n)^(n t) = ${P}${n === 1 ? `(1 + ${r})^${t}` : `(1 + ${r}/${n})^(${n} dot ${t})`} approx`)} ${money(A)}.`,
      };
    }
    const goal = rng.pick([2, 1.5, 3]);
    const t = Math.log(goal) / (n * Math.log(1 + r / n));
    return {
      body: `${money(P)} is invested at ${rate}% per year, compounded ${nText}. How long until it grows to ${money(P * goal)}? Round to one decimal place.`,
      answer: math(`${round(t, 1)} "years"`),
      // Simple interest, forgetting n, the annual rate per period, the rate as a whole number, one year off.
      distractors: [round((goal - 1) / r, 1), round(Math.log(goal) / Math.log(1 + r / n), 1), round(Math.log(goal) / (n * Math.log(1 + r)), 1), round(Math.log(goal) / Math.log(1 + rate), 1), round(t + 1, 1)]
        .filter((d, i, all) => d !== round(t, 1) && all.indexOf(d) === i).map((d) => math(`${d} "years"`)),
      solution: n === 1
        ? `${math(`${P * goal} = ${P}(1 + ${r})^t`)}, so ${math(`${goal} = ${1 + r}^t`)} and ${math(`t = (log ${goal})/(log ${1 + r}) approx ${round(t, 1)}`)} years.`
        : `${math(`${P * goal} = ${P}(1 + ${r}/${n})^(${n}t)`)}, so ${math(`${goal} = (1 + ${r}/${n})^(${n}t)`)} and ${math(`t = (log ${goal})/(${n} log (1 + ${r}/${n})) approx ${round(t, 1)}`)} years.`,
    };
  },
});

function expGraph(b: number, a: number, h: number, k: number, size: number) {
  return graphTypst({
    xMin: -8, xMax: 8, yMin: -8, yMax: 8, xLabelStep: 4, yLabelStep: 4, width: size, height: size,
    curves: [{ f: (x: number) => a * b ** (x - h) + k }],
    horizontal: [k],
  });
}

export const expSketch = pc40s('40s-exp-sketch', {
  levels: { 1: 'Translations', 2: 'With a vertical stretch', 3: 'With a reflection' },
  options: [
    toggleOption('stretch', 'Include a vertical stretch', [false, true, false]),
    toggleOption('reflect', 'Include a reflection in the x-axis', [false, false, true]),
  ],
  generate(rng, difficulty, o) {
    const b = rng.pick([2, 3]);
    const h = rng.int(-3, 3), k = rng.nonZero(-4, 4);
    const stretch = optOn(o, 'stretch', difficulty === 2), reflect = optOn(o, 'reflect', difficulty === 3);
    const a = (reflect ? -1 : 1) * (stretch ? rng.pick([2, 3]) : 1);
    const equation = `y = ${scaled(a, String(b), shifted(h))}${plus(k)}`;
    return {
      body: `Graph ${math(equation)}.`,
      answer: expGraph(b, a, h, k, 3.4),
      distractors: [expGraph(b, a, -h, k, 3.4), expGraph(b, -a, h, k, 3.4), expGraph(b, a, h, -k, 3.4)],
      solution: `Start from ${math(`y = ${b}^x`)} (through ${math('(0, 1)')} and ${math(`(1, ${b})`)}, asymptote ${math('y = 0')})`
        + `${a !== 1 ? `, ${a < 0 ? 'reflect in the x-axis' : ''}${Math.abs(a) > 1 ? `${a < 0 ? ' and ' : ''}stretch vertically by ${Math.abs(a)}` : ''}` : ''}, then translate${h ? ` ${Math.abs(h)} ${h > 0 ? 'right' : 'left'}` : ''}${h && k ? ' and' : ''} ${Math.abs(k)} ${k > 0 ? 'up' : 'down'}. `
        + `The asymptote is ${math(`y = ${k}`)}; the range is ${math(a > 0 ? `{y | y > ${k}}` : `{y | y < ${k}}`)}.`,
    };
  },
});

export const EXPONENTIAL_GENERATORS = [expCharacteristics, expTransformed, expCommonBase, expLogs, expGrowthDecay, expFinance, expSketch];

