// Algebra 2: logarithms, continuous growth, sequences and series, and
// trigonometry, after Kuta's LogInverses, RewritingLogs, InversesExponential
// Functions, LogEquationsSimple, ExpGrowthDecayContinuous, GeneralSequences,
// SequenceMean / SequenceGeometricMean, GeneralSeries, DegreesMinutesSeconds,
// SectorArea, LawOfSinesArea / HeronsFormula, and DoubleHalfIdentity.
import { Q, Surds } from '../../exact.ts';
import { poly, signed } from '../../format.ts';
import { manyOption, optList, optOne, radioOption } from '../../options.ts';
import { us, math, task, wrong, decimal, fixed, money } from './common.ts';

// ── Logarithms ───────────────────────────────────────────────────────────────

const logOf = (b: number | 'e', arg: string) => (b === 'e' ? `ln ${arg}` : b === 10 ? `log ${arg}` : `log_${b} ${arg}`);

export const a2LogInverseProperties = us('a2-log-inverse-properties', {
  levels: { 1: 'log_b b^x and b^(log_b x) with numbers', 2: 'With variables', 3: 'Bases written as powers' },
  generate(rng, level) {
    const b = rng.pick([2, 3, 4, 5, 10, 'e'] as const);
    const B = b === 'e' ? 'e' : String(b);
    if (level === 3 && b !== 'e' && b !== 10) {
      // log_b (b^k)^x, or log_(b^2) b^x.
      const k = rng.int(2, 4), x = rng.int(1, 9);
      const expr = `log_${b} ${b ** k}^${x}`;
      const ans = String(k * x);
      return task('Simplify each expression.', 'Simplify', expr, { answer: math(ans), distractors: wrong(math(ans), [String(x), String(k + x), String(b ** k * x)].map(math)), solution: `${math(`${b ** k} = ${b}^${k}`)}, so ${math(`${expr} = log_${b} ${b}^${k * x} = ${k * x}`)}.` });
    }
    const v = level === 1 ? String(rng.int(2, 9)) : rng.pick(['x', '3x', 'x + 1', '2x - 5']);
    const inside = rng.next() < 0.5;
    const expr = inside ? logOf(b, `${B}^(${v})`) : `${B}^(${logOf(b, `(${v})`)})`;
    const ans = v;
    return task('Simplify each expression.', 'Simplify', expr.replace(/\^\((\d+)\)/, '^$1').replace(/\((x)\)/, '$1'), {
      answer: math(ans),
      distractors: wrong(math(ans), [`${B}`, `${B}${/^\d+$/.test(v) ? ` dot ${v}` : `(${v})`}`, '1', `${v}^${B}`].map(math)),
      solution: `Logarithms and exponents with the same base undo each other: ${math(`${expr} = ${ans}`)}.`,
    });
  },
});

export const a2LogInTerms = us('a2-log-in-terms', {
  levels: { 1: 'Products and powers', 2: 'Quotients', 3: 'Roots and three logs' },
  generate(rng, level) {
    const b = rng.pick([10, 'e', 7] as const);
    const L = b === 'e' ? 'ln' : b === 10 ? 'log' : `log_${b}`;
    const vars = level === 3 ? ['2', '3', '5'] : ['2', '3'];
    const names = ['a', 'c', 'd'];
    const exps = vars.map(() => rng.int(level === 2 ? -2 : 0, 3));
    if (!exps.some((e) => e !== 0)) exps[0] = 2;
    if (level === 2 && exps.every((e) => e >= 0)) exps[1] = -rng.int(1, 2);
    const half = level === 3 && rng.next() < 0.5;
    const num = vars.map((p, i) => (exps[i] > 0 ? Number(p) ** exps[i] : 1)).reduce((a, x) => a * x, 1);
    const den = vars.map((p, i) => (exps[i] < 0 ? Number(p) ** -exps[i] : 1)).reduce((a, x) => a * x, 1);
    const argBase = den === 1 ? String(num) : `${num}/${den}`;
    const arg = half ? `sqrt(${argBase})` : argBase;
    const coef = (e: number) => (half ? new Q(e, 2) : new Q(e));
    const ans = names.slice(0, vars.length).map((n, i) => ({ c: coef(exps[i]), n })).filter((t) => !t.c.eq(0))
      .map((t, i) => { const mag = t.c.abs(); const body = mag.eq(1) ? t.n : mag.isInt ? `${mag.n}${t.n}` : `${mag.typst()} ${t.n}`; return i === 0 ? (t.c.sign < 0 ? `-${body}` : body) : ` ${t.c.sign < 0 ? '-' : '+'} ${body}`; }).join('');
    const given = vars.map((p, i) => `${L} ${p} = ${names[i]}`).join(', ');
    const naive = names.slice(0, vars.length).map((n, i) => (exps[i] ? (Math.abs(exps[i]) === 1 ? n : `${n}^${Math.abs(exps[i])}`) : '')).filter(Boolean).join(exps.some((e) => e < 0) ? ' - ' : ' + ');
    const flipped = ans.replace(/-/g, '#').replace(/\+/g, '-').replace(/#/g, '+');
    return {
      body: `Given ${math(given)}, write ${math(`${L} ${arg}`)} in terms of ${math(names.slice(0, vars.length).join(', '))}.`,
      answer: math(ans),
      distractors: wrong(math(ans), [naive, flipped.startsWith('+ ') ? flipped.slice(2) : flipped, names.slice(0, vars.length).map((n, i) => (exps[i] ? `${Math.abs(exps[i]) === 1 ? '' : Math.abs(exps[i])}${n}` : '')).filter(Boolean).join(' + ')].map(math)),
      solution: `Factor the argument: ${math(`${argBase} = ${vars.map((p, i) => (exps[i] ? `${p}^${exps[i] < 0 ? `(${exps[i]})` : exps[i]}` : '')).filter(Boolean).join(' dot ')}`.replace(/\^1(?![0-9])/g, ''))}. Use the product, quotient${half ? ', and power' : ' and power'} laws: ${math(`${L} ${arg} = ${ans}`)}.`.replace(/\^\(-1\)/g, '^(-1)'),
    };
  },
});

export const a2ExpLogInverse = us('a2-exp-log-inverse', {
  levels: { 1: 'y = b^x and y = log_b x', 2: 'With a translation', 3: 'With a stretch and translations' },
  generate(rng, level) {
    const b = rng.pick([2, 3, 4, 5, 10]);
    const h = level === 1 ? 0 : rng.nonZero(-5, 5), k = level === 1 ? 0 : rng.nonZero(-5, 5);
    const a = level === 3 ? rng.int(2, 4) : 1;
    const expo = rng.next() < 0.5;
    const bx = (arg: string) => `${b}^(${arg})`.replace(/\^\(x\)/, '^x');
    const lg = (arg: string) => (b === 10 ? `log(${arg})` : `log_${b}(${arg})`).replace(/\(x\)$/, ' x');
    const xh = (sign: number, val: number) => (val === 0 ? 'x' : poly([1, sign * val]));
    let f: string, inv: string, wrongs: string[];
    if (expo) {
      // f(x) = a·b^(x − h) + k  →  f⁻¹(x) = log_b((x − k)/a) + h
      f = `${a === 1 ? '' : `${a} dot `}${bx(xh(-1, h))}${k ? ` ${signed(k)}` : ''}`;
      const arg = a === 1 ? xh(-1, k) : `(${xh(-1, k)})/${a}`;
      inv = `${lg(arg)}${h ? ` ${signed(h)}` : ''}`;
      wrongs = [`${lg(a === 1 ? xh(1, k) : `(${xh(1, k)})/${a}`)}${h ? ` ${signed(-h)}` : ''}`, `${lg(a === 1 ? xh(-1, h) : `(${xh(-1, h)})/${a}`)}${k ? ` ${signed(k)}` : ''}`, `${bx(xh(-1, k))}${h ? ` ${signed(h)}` : ''}`];
    } else {
      // f(x) = a·log_b(x − h) + k  →  f⁻¹(x) = b^((x − k)/a) + h
      f = `${a === 1 ? '' : a}${lg(xh(-1, h))}${k ? ` ${signed(k)}` : ''}`;
      inv = `${bx(a === 1 ? xh(-1, k) : `(${xh(-1, k)})/${a}`)}${h ? ` ${signed(h)}` : ''}`;
      wrongs = [`${bx(a === 1 ? xh(1, k) : `(${xh(1, k)})/${a}`)}${h ? ` ${signed(-h)}` : ''}`, `${bx(a === 1 ? xh(-1, h) : `(${xh(-1, h)})/${a}`)}${k ? ` ${signed(k)}` : ''}`, `${lg(xh(-1, k))}${h ? ` ${signed(h)}` : ''}`];
    }
    return {
      body: `Find the inverse of ${math(`f(x) = ${f}`)}.`,
      task: { instruction: 'Find the inverse of each function.', item: math(`f(x) = ${f}`) },
      answer: math(`f^(-1)(x) = ${inv}`),
      distractors: wrong(math(`f^(-1)(x) = ${inv}`), wrongs.map((w) => math(`f^(-1)(x) = ${w}`))),
      solution: `Swap ${math('x')} and ${math('y')}, then isolate ${math('y')}, ${expo ? 'taking a logarithm' : 'rewriting in exponential form'}: ${math(`f^(-1)(x) = ${inv}`)}.`,
    };
  },
});

export const a2LogEquationsSimple = us('a2-log-equations-simple', {
  levels: { 1: 'log_b x = k', 2: 'log_b (ax + c) = k', 3: 'log_b f(x) = log_b g(x)' },
  generate(rng, level) {
    const b = rng.pick([2, 3, 4, 5, 6, 10]);
    const v = rng.pick(['x', 'n', 'k', 'p', 'r', 'm']);
    const L = (arg: string) => (b === 10 ? `log ${arg}` : `log_${b} ${arg}`);
    if (level === 1) {
      const k = rng.int(-2, b > 5 ? 2 : 4);
      const x = new Q(b).value ** k;
      const ans = k < 0 ? new Q(1, b ** -k).typst() : String(x);
      return task('Solve each equation.', 'Solve', `${L(v)} = ${k}`, { answer: math(`${v} = ${ans}`), distractors: wrong(math(`${v} = ${ans}`), [String(b * k), String(k ** b), k < 0 ? String(-(b ** -k)) : new Q(1, x).typst()].map((t) => math(`${v} = ${t}`))), solution: `Rewrite in exponential form: ${math(`${v} = ${b}^${k < 0 ? `(${k})` : k} = ${ans}`)}.` });
    }
    if (level === 2) {
      const k = rng.int(1, b > 4 ? 2 : 3), a = rng.int(1, 5), c = rng.int(-9, 9);
      const sol = new Q(b ** k - c, a);
      return task('Solve each equation.', 'Solve', `${L(`(${poly([a, c], v)})`)} = ${k}`, { answer: math(`${v} = ${sol.typst()}`), distractors: wrong(math(`${v} = ${sol.typst()}`), [new Q(b * k - c, a), new Q(k ** b - c, a), new Q(b ** k + c, a)].map((q) => math(`${v} = ${q.typst()}`))), solution: `${math(`${poly([a, c], v)} = ${b}^${k} = ${b ** k}`)}, so ${math(`${v} = ${sol.typst()}`)}.` });
    }
    // log_b(a1 v + c1) = log_b(a2 v + c2), with a check that the solution is in the domain.
    const a1 = rng.int(1, 6);
    let a2 = rng.int(1, 6); while (a2 === a1) a2 = rng.int(1, 6);
    const x = rng.int(-6, 9);
    const c1 = rng.int(-9, 9), c2 = (a1 - a2) * x + c1;
    const valid = a1 * x + c1 > 0;
    const ans = valid ? `${v} = ${x}` : '"no solution"';
    return task('Solve each equation. Check for extraneous solutions.', 'Solve', `${L(`(${poly([a1, c1], v)})`)} = ${L(`(${poly([a2, c2], v)})`)}`, {
      answer: math(ans),
      distractors: wrong(math(ans), [valid ? '"no solution"' : `${v} = ${x}`, `${v} = ${-x}`, `${v} = ${new Q(c2 + c1, a1 + a2).typst()}`].map(math)),
      solution: `Set the arguments equal: ${math(`${poly([a1, c1], v)} = ${poly([a2, c2], v)}`)}, so ${math(`${v} = ${x}`)}. ${valid ? `Both arguments are positive there, so ${math(ans)}.` : `Then ${math(`${poly([a1, c1], v)} = ${a1 * x + c1}`)}, which is not positive, so the solution is extraneous: no solution.`}`,
    });
  },
});

export const a2ExpGrowthContinuous = us('a2-exp-growth-continuous', {
  points: 2,
  levels: { 1: 'Find the amount', 2: 'Find the time', 3: 'Find the rate' },
  options: [radioOption('find', 'Find', [['amount', 'The amount'], ['time', 'The time'], ['rate', 'The rate']], ['amount', 'time', 'rate'])],
  generate(rng, level, o) {
    const find = optOne(o, 'find', ['amount', 'time', 'rate'][level - 1]);
    const growth = rng.next() < 0.6;
    const ctx = growth ? rng.pick([{ what: 'An account', unit: 'dollars' }, { what: 'A population of bacteria', unit: 'bacteria' }, { what: 'A town', unit: 'people' }]) : rng.pick([{ what: 'A radioactive sample', unit: 'grams' }, { what: 'The value of a machine', unit: 'dollars' }]);
    const P0 = ctx.unit === 'dollars' ? rng.int(10, 90) * 100 : rng.int(2, 50) * 100;
    const r = rng.pick([1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12]) / 100 * (growth ? 1 : -1);
    const t = rng.int(2, 20);
    const A = P0 * Math.exp(r * t);
    const show = (v: number) => (ctx.unit === 'dollars' ? math(money(v)) : `${math(fixed(v, 1))} ${ctx.unit}`);
    const word = growth ? 'grows' : 'decays';
    if (find === 'amount') {
      const answer = show(A);
      return {
        body: `${ctx.what} starts at ${ctx.unit === 'dollars' ? math(money(P0)) : `${P0} ${ctx.unit}`} and ${word} continuously at ${math(`${decimal(Math.abs(r) * 100)}"%"`)} per year. Find the amount after ${t} years.`,
        answer, distractors: wrong(answer, [P0 * (1 + r) ** t, P0 * Math.exp(-r * t), P0 * (1 + r * t), P0 * Math.exp(r) * t].map(show)),
        solution: `${math(`A = P e^(r t) = ${P0} e^(${decimal(r)} dot ${t}) approx ${fixed(A, 2)}`)}.`,
      };
    }
    if (find === 'time') {
      const target = Math.round(A);
      const time = Math.log(target / P0) / r;
      const answer = `${math(fixed(time, 1))} years`;
      return {
        body: `${ctx.what} starts at ${ctx.unit === 'dollars' ? math(money(P0)) : `${P0} ${ctx.unit}`} and ${word} continuously at ${math(`${decimal(Math.abs(r) * 100)}"%"`)} per year. How long until it reaches ${ctx.unit === 'dollars' ? math(money(target)) : `${target} ${ctx.unit}`}? Round to the nearest tenth of a year.`,
        answer, distractors: wrong(answer, [Math.log10(target / P0) / r, (target / P0) / Math.abs(r), Math.log(target / P0) / Math.abs(r) / 10, time + 1].map((v) => `${math(fixed(Math.abs(v), 1))} years`)),
        solution: `${math(`${target} = ${P0} e^(${decimal(r)} t)`)}, so ${math(`t = ln(${target}/${P0}) / ${decimal(r)} approx ${fixed(time, 1)}`)}.`,
      };
    }
    const target = Math.round(A);
    const rate = Math.log(target / P0) / t;
    const answer = math(`${fixed(rate * 100, 2)}"%"`);
    return {
      body: `${ctx.what} ${word} continuously from ${ctx.unit === 'dollars' ? math(money(P0)) : `${P0} ${ctx.unit}`} to ${ctx.unit === 'dollars' ? math(money(target)) : `${target} ${ctx.unit}`} in ${t} years. Find the continuous rate, as a percent to two decimal places.`,
      answer, distractors: wrong(answer, [Math.log10(target / P0) / t, (target - P0) / P0 / t, ((target / P0) ** (1 / t) - 1), rate * 10].map((v) => math(`${fixed(v * 100, 2)}"%"`))),
      solution: `${math(`${target} = ${P0} e^(${t} r)`)}, so ${math(`r = ln(${target}/${P0}) / ${t} approx ${fixed(rate, 4)}`)}, or ${answer}.`,
    };
  },
});

// ── Sequences and series ─────────────────────────────────────────────────────

export const a2GeneralSequences = us('a2-general-sequences', {
  levels: { 1: 'Explicit formulas', 2: 'Recursive formulas', 3: 'Find a term far out' },
  options: [manyOption('kinds', 'Formulas', [['explicit', 'Explicit'], ['recursive', 'Recursive']], [['explicit'], ['recursive'], ['explicit']])],
  generate(rng, level, o) {
    const kind = rng.pick(optList(o, 'kinds', ['explicit']));
    if (kind === 'recursive') {
      const a1 = rng.int(-5, 6), m = rng.pick([1, 2, 3, -1, -2]), c = rng.int(-5, 5) || 2;
      const terms = [a1];
      for (let i = 1; i < 4; i++) terms.push(m * terms[i - 1] + c);
      const rule = `a_n = ${m === 1 ? '' : m === -1 ? '-' : m}a_(n-1)${c ? ` ${signed(c)}` : ''}`;
      const answer = terms.join(', ');
      const shifted = [a1]; for (let i = 1; i < 4; i++) shifted.push(m * (shifted[i - 1] + c));
      return {
        body: `Find the first four terms of the sequence ${math(`a_1 = ${a1}`)}, ${math(rule)}.`,
        answer: math(answer),
        distractors: wrong(math(answer), [shifted.join(', '), terms.slice(1).concat(m * terms[3] + c).join(', '), terms.map((t, i) => t + (i ? c : 0)).join(', ')].map(math)),
        solution: `Start with ${math(`a_1 = ${a1}`)} and apply the rule to each term to get the next: ${math(answer)}.`,
      };
    }
    const c = rng.nonZero(-5, 5), m = rng.int(2, 5), k = rng.int(1, 9), r = rng.int(2, 4);
    const forms: Array<[string, (n: number) => number]> = [
      [`n^2 ${signed(c)}`, (n) => n * n + c],
      [`${m}n - ${k}`, (n) => m * n - k],
      ['(-1)^n n', (n) => (-1) ** n * n],
      [`${r}^n`, (n) => r ** n],
      ['n(n + 1)', (n) => n * (n + 1)],
    ];
    const [text, f] = rng.pick(forms);
    if (level === 3) {
      const n = rng.int(8, 20);
      const ans = String(f(n));
      return {
        body: `Find ${math(`a_${n}`)} for the sequence ${math(`a_n = ${text}`)}.`,
        answer: math(ans), distractors: wrong(math(ans), [String(f(n - 1)), String(f(n + 1)), String(f(n) + 1)].map(math)),
        solution: `Substitute ${math(`n = ${n}`)}: ${math(`a_${n} = ${ans}`)}.`,
      };
    }
    const terms = [1, 2, 3, 4].map(f);
    const answer = terms.join(', ');
    return {
      body: `Find the first four terms of the sequence ${math(`a_n = ${text}`)}.`,
      task: { instruction: 'Find the first four terms of each sequence.', item: math(`a_n = ${text}`) },
      answer: math(answer),
      distractors: wrong(math(answer), [[0, 1, 2, 3].map(f).join(', '), [2, 3, 4, 5].map(f).join(', '), terms.map((t) => -t).join(', ')].map(math)),
      solution: `Substitute ${math('n = 1, 2, 3, 4')}: ${math(answer)}.`,
    };
  },
});

export const a2SequenceMeans = us('a2-sequence-means', {
  levels: { 1: 'One arithmetic mean', 2: 'Several arithmetic means', 3: 'Geometric means' },
  options: [radioOption('kind', 'Means', [['arith', 'Arithmetic'], ['geo', 'Geometric']], ['arith', 'arith', 'geo'])],
  generate(rng, level, o) {
    const geo = optOne(o, 'kind', level === 3 ? 'geo' : 'arith') === 'geo';
    const count = level === 1 ? 1 : rng.int(2, 3);
    if (geo) {
      const a = rng.int(1, 6) * rng.sign(), r = rng.pick([2, 3, -2, -3, 4]);
      const k = level === 3 ? rng.int(1, 2) : 1;
      const terms = Array.from({ length: k + 2 }, (_, i) => a * r ** i);
      const means = terms.slice(1, -1);
      const answer = means.join(', ');
      return {
        body: `Find ${k === 1 ? 'the geometric mean' : `${k} geometric means`} between ${math(String(terms[0]))} and ${math(String(terms[terms.length - 1]))}.`,
        answer: math(answer),
        distractors: wrong(math(answer), [means.map((m) => -m).join(', '), means.map((m, i) => terms[0] + (i + 1) * (terms[terms.length - 1] - terms[0]) / (k + 1)).join(', '), means.map((m) => m * r).join(', ')].map(math)),
        solution: `${math(`${terms[terms.length - 1]} = ${terms[0]} r^${k + 1}`)}, so ${math(`r = ${r}`)}${k === 1 ? ' (or its opposite)' : ''}: ${math(answer)}.`,
      };
    }
    const a = rng.int(-20, 20), d = rng.nonZero(-9, 9);
    const terms = Array.from({ length: count + 2 }, (_, i) => a + i * d);
    const means = terms.slice(1, -1);
    const answer = means.join(', ');
    return {
      body: `Find ${count === 1 ? 'the arithmetic mean' : `${count} arithmetic means`} between ${math(String(terms[0]))} and ${math(String(terms[terms.length - 1]))}.`,
      answer: math(answer),
      distractors: wrong(math(answer), [means.map((m) => m + d).join(', '), means.map((_, i) => a + (i + 1) * Math.round((terms[terms.length - 1] - a) / count)).join(', '), means.map((m) => m - 1).join(', ')].map(math)),
      solution: `There are ${count + 1} equal steps: ${math(`d = (${terms[terms.length - 1]} - ${p(a)})/${count + 1} = ${d}`)}. ${math(answer)}.`,
    };
  },
});
const p = (v: number) => (v < 0 ? `(${v})` : String(v));

export const a2Sigma = us('a2-sigma', {
  levels: { 1: 'Linear terms, few terms', 2: 'Quadratic terms', 3: 'Geometric terms' },
  generate(rng, level) {
    const lo = rng.int(1, 3), hi = lo + rng.int(3, level === 1 ? 6 : 5);
    let text: string, f: (i: number) => number;
    if (level === 1) { const a = rng.int(2, 6), b = rng.int(-9, 9); text = poly([a, b], 'i'); f = (i) => a * i + b; }
    else if (level === 2) { const b = rng.nonZero(-4, 4); text = `i^2 ${signed(b)}`; f = (i) => i * i + b; }
    else { const a = rng.int(1, 5), r = rng.pick([2, 3]); text = `${a === 1 ? '' : a}(${r})^(i - 1)`; f = (i) => a * r ** (i - 1); }
    const values = Array.from({ length: hi - lo + 1 }, (_, k) => f(lo + k));
    const sum = values.reduce((a, b) => a + b, 0);
    const expr = `sum_(i = ${lo})^${hi} (${text})`;
    return task('Evaluate each series.', 'Evaluate', expr, {
      answer: math(String(sum)),
      distractors: wrong(math(String(sum)), [sum - values[0], sum + f(hi + 1), values[values.length - 1], sum - f(lo) + f(lo - 1)].map((v) => math(String(v)))),
      solution: `Add the terms for ${math(`i = ${lo}`)} to ${math(String(hi))}: ${math(`${values.join(' + ').replace(/\+ -/g, '- ')} = ${sum}`)}.`,
    });
  },
});

// ── Trigonometry ─────────────────────────────────────────────────────────────

export const a2Dms = us('a2-dms', {
  levels: { 1: 'DMS to decimal degrees', 2: 'Decimal degrees to DMS', 3: 'Either, to the nearest second' },
  generate(rng, level) {
    const toDecimal = level === 1 || (level === 3 && rng.next() < 0.5);
    const d = rng.int(0, 359), m = rng.int(0, 59), s = level === 1 ? rng.pick([0, 15, 30, 45, 36, 18, 54]) : rng.int(0, 59);
    const dms = (dd: number, mm: number, ss: number) => `${dd}° ${mm}' ${ss}''`;
    const value = d + m / 60 + s / 3600;
    if (toDecimal) {
      const answer = `${fixed(value, 3)}°`;
      return task('Convert each to decimal degrees. Round to the nearest thousandth.', 'Convert to decimal degrees:', dms(d, m, s), {
        answer: math(answer), distractors: wrong(math(answer), [`${fixed(d + m / 100 + s / 10000, 3)}°`, `${fixed(d + m / 60 + s / 60, 3)}°`, `${fixed(d + (m + s) / 60, 3)}°`].map(math)),
        solution: `${math(`${d} + ${m}/60 + ${s}/3600 approx ${fixed(value, 3)}`)}.`,
      }, '');
    }
    const dec = Number((d + rng.int(1, 9999) / 10000).toFixed(4));
    const D = Math.floor(dec), M = Math.floor((dec - D) * 60), S = Math.round(((dec - D) * 60 - M) * 60);
    const [M2, S2] = S === 60 ? [M + 1, 0] : [M, S];
    const answer = dms(D, M2, S2);
    const frac = String(dec).split('.')[1] ?? '0';
    return task("Convert each to degrees, minutes, and seconds. Round to the nearest second.", 'Convert to degrees, minutes, and seconds:', `${dec}°`, {
      answer: math(answer), distractors: wrong(math(answer), [dms(D, Number(frac.slice(0, 2)), Number(frac.slice(2, 4) || 0)), dms(D, M2, Math.round(S2 / 2)), dms(D, Math.round((dec - D) * 100), 0)].map(math)),
      solution: `Multiply the decimal part by 60 for minutes, then the remaining decimal by 60 for seconds: ${math(answer)}.`,
    }, '');
  },
});

/** A rational multiple of π: `pi`, `3pi`, `pi/4`, `(5pi)/6`. */
export function piText(q: Q): string {
  if (q.n === 0) return '0';
  const sign = q.n < 0 ? '-' : '', n = Math.abs(q.n);
  const top = n === 1 ? 'pi' : `${n}pi`;
  return q.d === 1 ? `${sign}${top}` : `${sign}${n === 1 ? top : `(${top})`}/${q.d}`;
}

export const a2SectorArea = us('a2-sector-area', {
  levels: { 1: 'Angle in radians, exact', 2: 'Angle in degrees, rounded', 3: 'Find the angle or radius from the area' },
  generate(rng, level) {
    const r = rng.int(2, 15);
    const unit = rng.pick(['cm', 'm', 'in', 'ft', 'mi', 'km']);
    if (level === 3) {
      const thetaQ = new Q(rng.pick([1, 2, 3, 5]), rng.pick([2, 3, 4, 6]));
      const areaQ = thetaQ.mul(r * r).div(2);
      const answer = math(`theta = ${piText(thetaQ)}`);
      return {
        body: `A sector of a circle with radius ${r} ${unit} has area ${math(piText(areaQ))} ${unit}#super[2]. Find its central angle in radians.`,
        answer, distractors: wrong(answer, [thetaQ.mul(2), thetaQ.div(2), thetaQ.mul(r)].map((q) => math(`theta = ${piText(q)}`))),
        solution: `${math('A = 1/2 r^2 theta')}, so ${math(`theta = (2A)/r^2 = ${piText(thetaQ)}`)}.`,
      };
    }
    if (level === 1) {
      const thetaQ = new Q(rng.pick([1, 2, 3, 5, 7]), rng.pick([2, 3, 4, 6]));
      const area = thetaQ.mul(r * r).div(2);
      const show = (q: Q) => `${math(piText(q))} ${unit}#super[2]`;
      return {
        body: `Find the area of a sector with radius ${r} ${unit} and central angle ${math(piText(thetaQ))}. Leave your answer in terms of π.`,
        answer: show(area), distractors: wrong(show(area), [thetaQ.mul(r), thetaQ.mul(r * r), area.mul(2)].map(show)),
        solution: `${math(`A = 1/2 r^2 theta = 1/2 (${r})^2 (${piText(thetaQ)}) = ${piText(area)}`)}.`,
      };
    }
    const deg = rng.pick([20, 30, 40, 45, 60, 72, 75, 80, 100, 120, 135, 150, 210, 240, 300]);
    const area = (deg / 360) * Math.PI * r * r;
    const show = (v: number) => `${math(fixed(v, 1))} ${unit}#super[2]`;
    return {
      body: `Find the area of a sector with radius ${r} ${unit} and central angle ${math(`${deg}°`)}. Round to the nearest tenth.`,
      answer: show(area), distractors: wrong(show(area), [(deg / 360) * 2 * Math.PI * r, (deg / 180) * Math.PI * r * r, 0.5 * r * r * deg].map(show)),
      solution: `${math(`A = ${deg}/360 dot pi (${r})^2 approx ${fixed(area, 1)}`)}.`,
    };
  },
});

export const a2TriangleArea = us('a2-triangle-area', {
  levels: { 1: 'Two sides and the included angle', 2: "Three sides (Heron's formula)", 3: 'Either' },
  options: [radioOption('method', 'Given', [['sas', 'Two sides and the included angle'], ['sss', "Three sides (Heron's formula)"], ['either', 'Either']], ['sas', 'sss', 'either'])],
  generate(rng, level, o) {
    const method = optOne(o, 'method', ['sas', 'sss', 'either'][level - 1]);
    const useSas = method === 'sas' || (method === 'either' && rng.next() < 0.5);
    const unit = rng.pick(['cm', 'm', 'in', 'ft', 'yd', 'mi']);
    const show = (v: number) => `${math(fixed(v, 1))} ${unit}#super[2]`;
    if (useSas) {
      const a = rng.int(4, 25), b = rng.int(4, 25), C = rng.int(20, 150);
      const area = 0.5 * a * b * Math.sin((C * Math.PI) / 180);
      return {
        body: `In ${math('triangle A B C')}, ${math(`a = ${a}`)} ${unit}, ${math(`b = ${b}`)} ${unit}, and ${math(`angle C = ${C}°`)}. Find the area. Round to the nearest tenth.`,
        answer: show(area), distractors: wrong(show(area), [a * b * Math.sin((C * Math.PI) / 180), 0.5 * a * b * Math.cos((C * Math.PI) / 180), 0.5 * a * b].map((v) => show(Math.abs(v)))),
        solution: `${math(`"Area" = 1/2 a b sin C = 1/2 (${a})(${b}) sin ${C}° approx ${fixed(area, 1)}`)}.`,
      };
    }
    let a: number, b: number, c: number;
    do { a = rng.int(3, 20); b = rng.int(3, 20); c = rng.int(3, 20); } while (a + b <= c || a + c <= b || b + c <= a);
    const s = (a + b + c) / 2, area = Math.sqrt(s * (s - a) * (s - b) * (s - c));
    return {
      body: `A triangle has sides of ${a} ${unit}, ${b} ${unit}, and ${c} ${unit}. Find its area. Round to the nearest tenth.`,
      answer: show(area), distractors: wrong(show(area), [Math.sqrt((a + b + c) * a * b * c) / 4 * 2, (a * b) / 2, Math.sqrt(s * (s - a) * (s - b))].map(show)),
      solution: `${math(`s = (${a} + ${b} + ${c})/2 = ${decimal(s)}`)} and ${math(`"Area" = sqrt(s(s - a)(s - b)(s - c)) approx ${fixed(area, 1)}`)}.`,
    };
  },
});

export const a2HalfAngle = us('a2-half-angle', {
  levels: { 1: 'sin and cos of 15°, 22.5°, 67.5°, 75°', 2: 'Including obtuse half-angles', 3: 'Including tan' },
  generate(rng, level) {
    // θ/2 where θ has cos θ = ±√r/2 (r = 2 or 3).
    const halves = level === 1 ? [15, 22.5, 67.5, 75] : [15, 22.5, 67.5, 75, 105, 112.5, 157.5, 165];
    const half = rng.pick(halves), theta = half * 2;
    const fn = rng.pick(level === 3 ? ['sin', 'cos', 'tan'] as const : ['sin', 'cos'] as const);
    const rad = (theta * Math.PI) / 180;
    const r = Math.abs(Math.round(Math.cos(rad) ** 2 * 4)) === 3 ? 3 : 2;
    const pc = Math.sign(Math.cos(rad)), ps = Math.sign(Math.sin(rad));
    const cHalf = half < 90 ? 1 : -1;
    // sin(θ/2) = ±√(2 − pc√r)/2, cos(θ/2) = ±√(2 + pc√r)/2, tan(θ/2) = (1 − cos θ)/sin θ.
    const inner = (sign: number) => `sqrt(2 ${sign > 0 ? '+' : '-'} sqrt(${r}))/2`;
    let answer: string;
    if (fn === 'sin') answer = inner(-pc);
    else if (fn === 'cos') answer = `${cHalf < 0 ? '-' : ''}${inner(pc)}`;
    else answer = (r === 3 ? new Surds([[2 * ps, 1], [-pc * ps, 3]]) : new Surds([[ps, 2], [-pc * ps, 1]])).typst();
    const flip = fn === 'tan' ? (r === 3 ? new Surds([[2, 1], [pc, 3]]).typst() : new Surds([[1, 2], [pc, 1]]).typst()) : fn === 'sin' ? inner(pc) : inner(-pc);
    return task('Find the exact value of each using a half-angle identity.', 'Find the exact value of', `${fn} ${half}°`, {
      answer: math(answer),
      distractors: wrong(math(answer), [flip, `-${answer}`.replace('--', ''), `sqrt(${r})/2`, `(sqrt(${r}))/4`].map(math)),
      solution: `${math(`${half}° = 1/2 (${theta}°)`)} and ${math(`cos ${theta}° = ${pc < 0 ? '-' : ''}sqrt(${r})/2`)}. ${fn === 'tan' ? `${math(`tan theta/2 = (1 - cos theta)/(sin theta)`)}` : `${math(`${fn} theta/2 = plus.minus sqrt((1 ${fn === 'sin' ? '-' : '+'} cos theta)/2)`)}, positive or negative by the quadrant of ${math(`${half}°`)}`}: ${math(answer)}.`,
    });
  },
});

export const ALGEBRA_2_ADVANCED = [a2LogInverseProperties, a2LogInTerms, a2ExpLogInverse, a2LogEquationsSimple, a2ExpGrowthContinuous, a2GeneralSequences, a2SequenceMeans, a2Sigma, a2Dms, a2SectorArea, a2TriangleArea, a2HalfAngle];
