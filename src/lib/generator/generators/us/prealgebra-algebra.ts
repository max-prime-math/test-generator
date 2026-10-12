// Pre-Algebra: expressions, equations, inequalities, and proportions, after
// Kuta's VerbalExpression, DistributiveProp, SimplifyVariableExpressions,
// EvaluatingExpressions, One/Two/MultiStepEquations (and word problems),
// One/Two/MultiStepInequalities, CheckProportion, Proportions, and
// ProportionWordProblems.
import type { Rng } from '../../rng.ts';
import { Q } from '../../exact.ts';
import { poly, polynomial, signed, sub, type Term } from '../../format.ts';
import { optNum, optOn, optOne, radioOption, sizeOption, toggleOption } from '../../options.ts';
import { numberLine } from '../grade10/shared.ts';
import { us, math, task, wrong, decimal, money, NAMES } from './common.ts';

const LETTERS = ['x', 'n', 'k', 'p', 'r', 'v', 'a', 'b', 'm', 'w'];
const letter = (rng: Rng) => rng.pick(LETTERS);

// ── Verbal expressions ───────────────────────────────────────────────────────

interface Verbal { words: string; expr: string; wrong: string[] }
function verbal(rng: Rng, v: string, level: number): Verbal {
  const a = rng.int(2, 12), b = rng.int(2, 12);
  const simple: Verbal[] = [
    { words: `the sum of ${v} and ${a}`, expr: `${v} + ${a}`, wrong: [`${a}${v}`, `${v} - ${a}`] },
    { words: `${a} less than ${v}`, expr: `${v} - ${a}`, wrong: [`${a} - ${v}`, `${v} + ${a}`] },
    { words: `${v} decreased by ${a}`, expr: `${v} - ${a}`, wrong: [`${a} - ${v}`, `${v}/${a}`] },
    { words: `the product of ${a} and ${v}`, expr: `${a}${v}`, wrong: [`${a} + ${v}`, `${v}/${a}`] },
    { words: `the quotient of ${v} and ${a}`, expr: `${v}/${a}`, wrong: [`${a}/${v}`, `${a}${v}`] },
    { words: `${v} squared`, expr: `${v}^2`, wrong: [`2${v}`, `${v} + 2`] },
    { words: `${v} increased by ${a}`, expr: `${v} + ${a}`, wrong: [`${a}${v}`, `${v} - ${a}`] },
    { words: `half of ${v}`, expr: `${v}/2`, wrong: [`2${v}`, `${v} - 2`] },
  ];
  const harder: Verbal[] = [
    { words: `twice ${v}, decreased by ${a}`, expr: `2${v} - ${a}`, wrong: [`2(${v} - ${a})`, `${a} - 2${v}`] },
    { words: `${a} times the sum of ${v} and ${b}`, expr: `${a}(${v} + ${b})`, wrong: [`${a}${v} + ${b}`, `${a} + ${v} + ${b}`] },
    { words: `the sum of ${a} times ${v} and ${b}`, expr: `${a}${v} + ${b}`, wrong: [`${a}(${v} + ${b})`, `${a} + ${v}${b}`] },
    { words: `${b} more than the quotient of ${v} and ${a}`, expr: `${v}/${a} + ${b}`, wrong: [`(${v} + ${b})/${a}`, `${a}/${v} + ${b}`] },
    { words: `the square of ${v}, increased by ${a}`, expr: `${v}^2 + ${a}`, wrong: [`(${v} + ${a})^2`, `2${v} + ${a}`] },
    { words: `${a} less than ${b} times ${v}`, expr: `${b}${v} - ${a}`, wrong: [`${a} - ${b}${v}`, `${b}(${v} - ${a})`] },
    { words: `the difference of ${v} and ${a}, divided by ${b}`, expr: `(${v} - ${a})/${b}`, wrong: [`${v} - ${a}/${b}`, `(${a} - ${v})/${b}`] },
  ];
  return rng.pick(level === 1 ? simple : level === 2 ? [...simple, ...harder] : harder);
}

export const paVerbal = us('pa-verbal', {
  levels: { 1: 'One operation', 2: 'One or two operations', 3: 'Two operations' },
  options: [radioOption('direction', 'Write', [['algebra', 'Words as an expression'], ['words', 'An expression in words'], ['both', 'Either']], ['algebra', 'both', 'both'])],
  generate(rng, level, o) {
    const v = letter(rng);
    const item = verbal(rng, v, level);
    const others = Array.from({ length: 6 }, () => verbal(rng, v, level)).filter((x) => x.expr !== item.expr);
    const direction = optOne(o, 'direction', 'algebra') === 'both' ? rng.pick(['algebra', 'words'] as const) : optOne(o, 'direction', 'algebra');
    if (direction === 'algebra') {
      return {
        body: `Write an expression for: ${item.words}.`,
        task: { instruction: 'Write each as an algebraic expression.', item: item.words },
        answer: math(item.expr),
        distractors: wrong(math(item.expr), [...item.wrong, ...others.map((x) => x.expr)].map(math)),
        solution: `Translate each phrase into an operation, in order: ${math(item.expr)}.`,
      };
    }
    return task('Write each as a verbal expression.', 'Write in words:', item.expr, {
      answer: item.words,
      distractors: wrong(item.words, others.map((x) => x.words)),
      solution: `${math(item.expr)} reads as "${item.words}".`,
    }, '');
  },
});

// ── Simplifying ──────────────────────────────────────────────────────────────

export const paDistributive = us('pa-distributive', {
  levels: { 1: 'a(bx + c)', 2: 'a(bx + c) + dx', 3: 'a(bx + c) ± d(ex + f)' },
  options: [radioOption('form', 'Form', [['1', 'a(bx + c)'], ['2', 'a(bx + c) + dx + e'], ['3', 'a(bx + c) ± d(ex + f)']], ['1', '2', '3']), sizeOption([5, 9, 12], [5, 9, 9])],
  generate(rng, level, o) {
    const form = optNum(o, 'form', level), N = optNum(o, 'size', 8);
    const v = letter(rng);
    const a = rng.int(2, N) * (form > 1 || rng.next() < 0.7 ? rng.sign() : 1), b = rng.nonZero(-N, N), c = rng.nonZero(-N, N);
    // Kuta also writes the constant first, as in 6(1 + 6n).
    const inner = (p: number, q: number) => (rng.next() < 0.3 ? polynomial([{ coef: q }, { coef: p, powers: [[v, 1]] }]) : poly([p, q], v));
    const first = `${a === -1 ? '-' : a === 1 ? '' : a}(${inner(b, c)})`;
    let expr = first, coefs = [a * b, a * c], wrongCoefs = [[a * b, c], [b + a, a * c], [a * b, -a * c]];
    if (form === 2) {
      const d = rng.nonZero(-N, N), e = rng.int(-N, N);
      expr = `${first} ${signed(d)}${v}${e ? ` ${signed(e)}` : ''}`.replace(/([+-]) 1([a-z])/, '$1 $2');
      coefs = [a * b + d, a * c + e];
      wrongCoefs = [[a * b + d, c + e], [b + d, a * c + e], [a * b - d, a * c + e]];
    } else if (form === 3) {
      const d = rng.int(2, N) * rng.sign(), e = rng.nonZero(-N, N), f = rng.nonZero(-N, N);
      expr = `${first} ${d < 0 ? '-' : '+'} ${Math.abs(d)}(${poly([e, f], v)})`;
      coefs = [a * b + d * e, a * c + d * f];
      wrongCoefs = [[a * b - d * e, a * c - d * f], [a * b + d * e, a * c + f * Math.abs(d)], [a * b + Math.abs(d) * e, a * c + Math.abs(d) * f], [a * b + d * e, a * c - d * f]];
    }
    const answer = poly(coefs, v);
    return task('Simplify each expression.', 'Simplify', expr, {
      answer: math(answer),
      distractors: wrong(math(answer), wrongCoefs.map((w) => math(poly(w, v)))),
      solution: `Multiply each term inside the brackets by the factor in front, then combine like terms: ${math(`${expr} = ${answer}`)}.`,
    });
  },
});

export const paLikeTerms = us('pa-like-terms', {
  levels: { 1: 'One variable', 2: 'Two variables and constants', 3: 'Two variables with powers' },
  options: [radioOption('vars', 'Variables', [['1', 'One'], ['2', 'Two'], ['3', 'Two, with squares']], ['1', '2', '3']), sizeOption([5, 9, 12], [9, 9, 9])],
  generate(rng, level, o) {
    const kind = optNum(o, 'vars', level), N = optNum(o, 'size', 9);
    const [v, w] = rng.shuffle(LETTERS).slice(0, 2);
    const kinds: Array<Term['powers']> = kind === 1 ? [[[v, 1]], [[v, 1]], []] : kind === 2 ? [[[v, 1]], [[w, 1]], [[v, 1]], [[w, 1]], []] : [[[v, 2]], [[v, 1]], [[v, 2]], [[v, 1]], [[w, 1]]];
    const terms: Term[] = rng.shuffle(kinds).map((powers) => ({ coef: rng.nonZero(-N, N), powers }));
    const expr = polynomial(terms);
    const key = (t: Term) => (t.powers ?? []).map(([x, e]) => `${x}${e}`).join('');
    const combined = new Map<string, Term>();
    for (const t of terms) { const k = key(t); const c = combined.get(k); combined.set(k, { coef: (c?.coef ?? 0) + t.coef, powers: t.powers }); }
    const order = (ts: Term[]) => ts.sort((x, y) => (y.powers?.reduce((s, [, e]) => s + e, 0) ?? 0) - (x.powers?.reduce((s, [, e]) => s + e, 0) ?? 0) || key(x).localeCompare(key(y)));
    const result = order([...combined.values()]);
    const answer = polynomial(result);
    const allOne = polynomial([{ coef: terms.reduce((s, t) => s + (t.powers?.length ? t.coef : 0), 0), powers: [[v, 1]] }, { coef: terms.filter((t) => !t.powers?.length).reduce((s, t) => s + t.coef, 0) }]);
    const signSlip = polynomial(result.map((t, i) => (i === result.length - 1 ? { ...t, coef: -t.coef } : t)));
    const absSlip = polynomial(order([...terms.reduce((m, t) => { const k = key(t); m.set(k, { coef: (m.get(k)?.coef ?? 0) + Math.abs(t.coef), powers: t.powers }); return m; }, new Map<string, Term>()).values()]));
    return task('Simplify each expression.', 'Simplify', expr, {
      answer: math(answer),
      distractors: wrong(math(answer), [allOne, signSlip, absSlip, polynomial(result.map((t) => ({ ...t, coef: t.powers?.length ? t.coef + 1 : t.coef })))].map(math)),
      solution: `Add the coefficients of like terms (the same variables with the same powers): ${math(`${expr} = ${answer}`)}.`,
    });
  },
});

type Vals = { x: number; y: number; z: number };
const EVAL_FORMS: Record<1 | 2 | 3, Array<{ expr: (k: number) => string; f: (v: Vals, k: number) => number }>> = {
  1: [
    { expr: (k) => `x + ${k}`, f: ({ x }, k) => x + k },
    { expr: (k) => `${k}x - 3`, f: ({ x }, k) => k * x - 3 },
    { expr: (k) => `x^2 + ${k}`, f: ({ x }, k) => x * x + k },
    { expr: (k) => `${k * 5} - x`, f: ({ x }, k) => k * 5 - x },
  ],
  2: [
    { expr: () => 'x y + x', f: ({ x, y }) => x * y + x },
    { expr: () => 'x + y^2', f: ({ x, y }) => x + y * y },
    { expr: (k) => `${k}x - y`, f: ({ x, y }, k) => k * x - y },
    { expr: () => 'x^2 - y', f: ({ x, y }) => x * x - y },
    { expr: (k) => `y - ${k}x`, f: ({ x, y }, k) => y - k * x },
  ],
  3: [
    { expr: () => 'x^2 + y z', f: ({ x, y, z }) => x * x + y * z },
    { expr: () => 'x(y - z)', f: ({ x, y, z }) => x * (y - z) },
    { expr: () => 'x y^2 - z', f: ({ x, y, z }) => x * y * y - z },
    { expr: () => '(x + y)z', f: ({ x, y, z }) => (x + y) * z },
    { expr: () => 'z^2 - x y', f: ({ x, y, z }) => z * z - x * y },
  ],
};

export const paEvaluate = us('pa-evaluate', {
  levels: { 1: 'One variable', 2: 'Two variables', 3: 'Three variables with powers' },
  options: [toggleOption('negatives', 'Use negative values', [false, true, true])],
  generate(rng, level, o) {
    const neg = optOn(o, 'negatives', level > 1);
    const val = () => (neg ? rng.nonZero(-6, 6) : rng.int(1, 6));
    const vals: Vals = { x: val(), y: val(), z: val() };
    const k = rng.int(2, 6);
    const form = rng.pick(EVAL_FORMS[level as 1 | 2 | 3]);
    const expr = form.expr(k), value = form.f(vals, k);
    const names = (['x', 'y', 'z'] as const).slice(0, level);
    const given = names.map((n) => `${n} = ${vals[n]}`).join(', ');
    const swapped = form.f({ x: vals.y, y: vals.x, z: vals.z }, k), positive = form.f({ x: Math.abs(vals.x), y: Math.abs(vals.y), z: Math.abs(vals.z) }, k);
    const substituted = expr.replace(/[xyz]/g, (n) => `(${vals[n as 'x']})`).replace(/(\d|\))\s*\(/g, '$1 dot (').replace(/\((\d+)\)/g, '$1');
    return {
      body: `Evaluate ${math(expr)} when ${math(given)}.`,
      task: { instruction: 'Evaluate each using the values given.', item: math(expr) },
      answer: math(String(value)),
      distractors: wrong(math(String(value)), [swapped, positive, -value, value + 1].map((n) => math(String(n)))),
      solution: `Substitute and follow the order of operations: ${math(`${substituted} = ${value}`)}.`,
    };
  },
});

// ── Equations ────────────────────────────────────────────────────────────────

type Num = 'int' | 'frac' | 'dec';
const NUM_OPTION = radioOption('numbers', 'Numbers', [['int', 'Integers'], ['dec', 'Decimals'], ['frac', 'Fractions']], ['int', 'int', 'int']);
const showQ = (q: Q, kind: Num) => (kind === 'dec' ? decimal(q.value) : q.typst());

export const paEqOneStep = us('pa-eq-one-step', {
  levels: { 1: 'Addition and subtraction', 2: 'Multiplication and division', 3: 'All four operations' },
  options: [radioOption('ops', 'Operations', [['addsub', 'Addition and subtraction'], ['muldiv', 'Multiplication and division'], ['all', 'All four']], ['addsub', 'muldiv', 'all']), NUM_OPTION, sizeOption([10, 20, 50], [20, 20, 20])],
  generate(rng, level, o) {
    const ops = optOne(o, 'ops', 'all'), kind = optOne(o, 'numbers', 'int') as Num, N = optNum(o, 'size', 20);
    const v = letter(rng);
    const rnd = () => kind === 'int' ? new Q(rng.nonZero(-N, N)) : kind === 'dec' ? new Q(rng.nonZero(-N * 10, N * 10), 10) : new Q(rng.nonZero(-9, 9), rng.int(2, 9));
    const pool = ops === 'addsub' ? ['add', 'sub'] : ops === 'muldiv' ? ['mul', 'div'] : ['add', 'sub', 'mul', 'div'];
    const form = rng.pick(pool);
    const x = rnd();
    let a = rnd(), lhs: string, rhs: Q, wrongs: Q[];
    if (form === 'add' || form === 'sub') {
      // x + a = b or x − a = b with a positive; "a + x" also appears.
      a = a.abs();
      const plus = form === 'add';
      lhs = plus && rng.next() < 0.4 ? `${showQ(a, kind)} + ${v}` : `${v} ${plus ? '+' : '-'} ${showQ(a, kind)}`;
      rhs = plus ? x.add(a) : x.sub(a);
      wrongs = plus ? [rhs.add(a), a.sub(rhs), x.neg()] : [rhs.sub(a), x.neg(), a.sub(rhs)];
    }
    else if (form === 'mul') {
      if (kind === 'int') a = new Q(rng.nonZero(-12, 12) || 2);
      if (a.eq(1) || a.eq(-1)) a = new Q(a.n * 3);
      lhs = kind === 'frac' ? `${a.typst()} ${v}`.replace(/^(-?\d+)\/(\d+) /, '$1/$2 ') : `${showQ(a, kind)}${v}`;
      rhs = x.mul(a); wrongs = [rhs.mul(a), rhs.sub(a), x.neg()];
    } else {
      a = new Q(kind === 'frac' ? rng.int(2, 9) : rng.nonZero(-12, 12)); if (a.eq(1) || a.eq(-1)) a = new Q(a.n * 4);
      lhs = `${v}/${a.n < 0 ? `(${a.n})` : a.n}`; rhs = x.div(a); wrongs = [rhs.div(a), rhs.add(a), x.neg()];
    }
    const eq = `${lhs} = ${showQ(rhs, kind)}`;
    const ans = `${v} = ${showQ(x, kind)}`;
    return task('Solve each equation.', 'Solve', eq, {
      answer: math(ans),
      distractors: wrong(math(ans), wrongs.map((w) => math(`${v} = ${showQ(w, kind)}`))),
      solution: `${{ add: 'Subtract', sub: 'Add', mul: 'Divide both sides by', div: 'Multiply both sides by' }[form]} ${math(showQ(a, kind))}${{ add: ' from both sides', sub: ' to both sides', mul: '', div: '' }[form]}: ${math(ans)}.`,
    });
  },
});

export const paEqTwoStep = us('pa-eq-two-step', {
  levels: { 1: 'ax + b = c', 2: 'x/a + b = c and (x + b)/a = c', 3: 'All forms, including b − ax = c' },
  options: [radioOption('forms', 'Forms', [['1', 'ax + b = c'], ['2', 'With division'], ['3', 'All forms']], ['1', '2', '3']), sizeOption([10, 20, 30], [10, 20, 20])],
  generate(rng, level, o) {
    const forms = optNum(o, 'forms', level), N = optNum(o, 'size', 15);
    const v = letter(rng);
    const x = rng.int(-N, N);
    const A = rng.int(2, 9) * rng.sign(), P = Math.abs(A), b = rng.nonZero(-N, N);
    const form = rng.pick(forms === 1 ? ['ax+b'] : forms === 2 ? ['x/a+b', '(x+b)/a'] : ['ax+b', 'x/a+b', '(x+b)/a', 'b-ax']);
    /** "subtract 5 from" or "add 5 to" both sides, to undo + b. */
    const undo = (c: number) => (c > 0 ? `subtract ${c} from` : `add ${-c} to`);
    if (form === 'ax+b') {
      const c = A * x + b;
      return solved(v, `${poly([A, b], v)} = ${c}`, x, [new Q(c + b, A), new Q(c, A).sub(b), new Q(c - b, -A)], `Undo the addition first: ${undo(b)} both sides, then divide by ${A}.`);
    }
    if (form === 'b-ax') {
      const c = b - P * x;
      return solved(v, `${b} - ${P}${v} = ${c}`, x, [new Q(c - b, P), new Q(c + b, -P), new Q(c, -P).sub(b)], `${undo(b).replace(/^./, (s) => s.toUpperCase())} both sides, then divide by ${-P}.`);
    }
    if (form === 'x/a+b') {
      const k = rng.int(-6, 6), xx = P * k;
      return solved(v, `${v}/${P} ${signed(b)} = ${k + b}`, xx, [new Q((k + 2 * b) * P), new Q(k + b, P).sub(b), new Q(k * P + b)], `${undo(b).replace(/^./, (s) => s.toUpperCase())} both sides, then multiply by ${P}.`);
    }
    const k = rng.int(-6, 6), xx = P * k - b;
    return solved(v, `(${poly([1, b], v)})/${P} = ${k}`, xx, [new Q(P * k + b), new Q(k - b), new Q(k, P).sub(b)], `Multiply both sides by ${P}, then ${undo(b)} both sides.`);
  },
});

/** A solved linear equation with an integer (or fractional) answer and wrong answers from slips. */
function solved(v: string, eq: string, x: number | Q, wrongs: Array<number | Q>, how: string) {
  const s = (n: number | Q) => `${v} = ${Q.of(typeof n === 'number' && !Number.isInteger(n) ? new Q(Math.round(n * 100), 100) : n).typst()}`;
  const ans = s(x);
  return task('Solve each equation.', 'Solve', eq, {
    answer: math(ans),
    distractors: wrong(math(ans), [...wrongs, Q.of(x).add(1), Q.of(x).neg()].map((w) => math(s(w)))),
    solution: `${how} ${math(ans)}.`,
  });
}

export const paEqMultiStep = us('pa-eq-multi-step', {
  levels: { 1: 'Combine like terms', 2: 'Distributive property', 3: 'Variables on both sides' },
  options: [
    toggleOption('distribute', 'Use the distributive property', [false, true, true]),
    toggleOption('bothSides', 'Variables on both sides', [false, false, true]),
    sizeOption([10, 20], [10, 10, 10], 'Size of the solution'),
  ],
  generate(rng, level, o) {
    const dist = optOn(o, 'distribute', level >= 2), both = optOn(o, 'bothSides', level >= 3), N = optNum(o, 'size', 10);
    const v = letter(rng), x = rng.int(-N, N);
    const n = () => rng.nonZero(-8, 8);
    let left: string, lc: number, l0: number;
    if (dist) { const a = rng.int(2, 6) * rng.sign(), b = n(); left = `${a === -1 ? '-' : a}(${poly([1, b], v)})`; lc = a; l0 = a * b; if (!both) { const c = n(); left += ` ${signed(c)}${v}`; lc += c; } }
    else { const a = n(), b = n(), c = n(); left = polynomial([{ coef: a, powers: [[v, 1]] }, { coef: b }, { coef: c, powers: [[v, 1]] }]); lc = a + c; l0 = b; }
    let rc = 0;
    if (both) { rc = n(); while (rc === lc) rc = n(); }
    if (!both && lc === 0) return paEqMultiStep.generate(rng, level, o);
    const r0 = lc * x + l0 - rc * x;
    const right = both ? poly([rc, r0], v) : String(r0);
    const eq = `${left} = ${right}`.replace(/([+-]) 1([a-z])/g, '$1 $2');
    const sol = `Simplify each side, collect the ${v}-terms on one side and the constants on the other, then divide.`;
    return solved(v, eq, x, [new Q(r0 + l0, lc - rc || 1), new Q(r0 - l0, lc + rc || 1), new Q(r0, lc - rc || 1)], sol);
  },
});

interface WordProblem { text: string; eq: string; answer: string; wrong: string[] }
function oneStepWords(rng: Rng): WordProblem {
  const name = rng.pick(NAMES);
  const a = rng.int(3, 30), x = rng.int(2, 25), k = rng.int(2, 9);
  return rng.pick<WordProblem>([
    { text: `${name} had some stickers and was given ${a} more. Now ${name} has ${x + a}. How many stickers did ${name} have to start with?`, eq: `s + ${a} = ${x + a}`, answer: `${x}`, wrong: [`${2 * x + a}`, `${x + 2 * a}`] },
    { text: `After spending ${math(money(a))}, ${name} has ${math(money(x))} left. How much money did ${name} start with?`, eq: `m - ${a} = ${x}`, answer: money(x + a), wrong: [money(x - a > 0 ? x - a : a - x), money(x)] },
    { text: `${k} friends share a bill equally. Each pays ${math(money(x))}. What was the total bill?`, eq: `b/${k} = ${x}`, answer: money(k * x), wrong: [money(x + k), money(x / k)] },
    { text: `${name} bought ${k} identical notebooks for ${math(money(k * x))}. How much did each notebook cost?`, eq: `${k}c = ${k * x}`, answer: money(x), wrong: [money(k * x * k), money(k * x - k)] },
    { text: `The temperature rose ${a} degrees to ${x + a}°. What was the temperature before?`, eq: `t + ${a} = ${x + a}`, answer: `${x}°`, wrong: [`${x + 2 * a}°`, `${a}°`] },
  ]);
}
function twoStepWords(rng: Rng): WordProblem {
  const name = rng.pick(NAMES);
  const a = rng.int(2, 9), b = rng.int(5, 40), x = rng.int(2, 20);
  return rng.pick<WordProblem>([
    { text: `A gym charges a ${math(money(b))} sign-up fee plus ${math(money(a * 5))} per month. ${name} paid ${math(money(b + a * 5 * x))} in total. For how many months?`, eq: `${a * 5}m + ${b} = ${b + a * 5 * x}`, answer: `${x}`, wrong: [`${x + 1}`, `${(b + a * 5 * x) / (a * 5)}`.slice(0, 5)] },
    { text: `${name} has ${math(money(b))} and saves ${math(money(a))} each week. After how many weeks will ${name} have ${math(money(b + a * x))}?`, eq: `${a}w + ${b} = ${b + a * x}`, answer: `${x}`, wrong: [`${x + b}`, `${(b + a * x) / a}`.slice(0, 5)] },
    { text: `A taxi charges ${math(money(a))} plus ${math(money(2))} per kilometre. A ride cost ${math(money(a + 2 * x))}. How far was the ride, in kilometres?`, eq: `2d + ${a} = ${a + 2 * x}`, answer: `${x}`, wrong: [`${x + a}`, `${(a + 2 * x) / 2}`] },
    { text: `Three times a number, increased by ${b}, is ${3 * x + b}. Find the number.`, eq: `3n + ${b} = ${3 * x + b}`, answer: `${x}`, wrong: [`${(3 * x + 2 * b) / 3}`.slice(0, 5), `${3 * x}`] },
    { text: `${name} sold ${a} more than twice as many tickets as Jo. ${name} sold ${2 * x + a}. How many did Jo sell?`, eq: `2j + ${a} = ${2 * x + a}`, answer: `${x}`, wrong: [`${2 * x}`, `${x + a}`] },
  ]);
}
function wordGen(id: 'pa-eq-one-step-words' | 'pa-eq-two-step-words', make: (rng: Rng) => WordProblem) {
  return us(id, {
    points: 2,
    levels: { 1: 'Whole numbers', 2: 'Whole numbers', 3: 'Whole numbers' },
    generate(rng) {
      const w = make(rng);
      const ans = w.answer.startsWith('\\$') ? math(w.answer) : w.answer.includes('°') ? w.answer : math(w.answer);
      const fmt = (s: string) => (s.startsWith('\\$') ? math(s) : s.includes('°') ? s : math(s));
      // Neighbouring values in the answer's own form (money, degrees, or a count).
      const value = Number(w.answer.replace(/[^\d.-]/g, ''));
      const like = (n: number) => (w.answer.startsWith('\\$') ? money(n) : w.answer.endsWith('°') ? `${n}°` : String(n));
      return { body: w.text, answer: ans, distractors: wrong(ans, [...w.wrong, like(value + 1), like(value * 2)].map(fmt)), solution: `Write and solve an equation: ${math(w.eq)}, so the answer is ${ans}.` };
    },
  });
}
export const paEqOneStepWords = wordGen('pa-eq-one-step-words', oneStepWords);
export const paEqTwoStepWords = wordGen('pa-eq-two-step-words', twoStepWords);

// ── Inequalities ─────────────────────────────────────────────────────────────

const REL = ['<', '>', '<=', '>='] as const;
type Rel = (typeof REL)[number];
const flip = (r: Rel): Rel => ({ '<': '>', '>': '<', '<=': '>=', '>=': '<=' } as const)[r];

/** The solution of v rel value, with a number line. */
function inequalityAnswer(v: string, rel: Rel, value: number) {
  const from = Math.floor(value) - 5, to = Math.floor(value) + 5;
  const line = numberLine({ from, to, ray: { at: value, dir: rel.startsWith('>') ? 'right' : 'left', open: rel.length === 1 }, width: 7 });
  return { text: `${v} ${rel} ${value}`, line };
}

function inequalityGen(id: 'pa-ineq-one-step' | 'pa-ineq-two-step' | 'pa-ineq-multi-step', steps: 1 | 2 | 3) {
  return us(id, {
    levels: steps === 1 ? { 1: 'Addition and subtraction', 2: 'Multiplication and division', 3: 'Negative coefficients' } : steps === 2 ? { 1: 'Positive coefficients', 2: 'Negative coefficients', 3: 'With division' } : { 1: 'Combine like terms', 2: 'Distributive property', 3: 'Variables on both sides' },
    options: [toggleOption('negative', 'Include dividing or multiplying by a negative', [steps === 1 ? false : false, true, true]), toggleOption('graph', 'Graph the solution', [true, true, true])],
    generate(rng, level, o) {
      const v = letter(rng), x = rng.int(-9, 9);
      const neg = optOn(o, 'negative', level >= 2);
      let rel: Rel = rng.pick(REL), lhs: string, rhs: number, reversed = false;
      const a = (neg && rng.next() < 0.6 ? -1 : 1) * rng.int(2, 8);
      if (steps === 1) {
        if (level === 1 && !neg) { const b = rng.nonZero(-12, 12); lhs = poly([1, b], v); rhs = x + b; }
        else if (rng.next() < 0.5) { lhs = `${a}${v}`; rhs = a * x; reversed = a < 0; }
        else { lhs = `${v}/${a < 0 ? `(${a})` : a}`; const xx = a * rng.int(-4, 4); const r = xx / a; return finish(v, `${lhs} ${rel} ${r}`, rel, a < 0, xx); }
      } else if (steps === 2) {
        const b = rng.nonZero(-15, 15);
        if (level === 3 && rng.next() < 0.5) { const xx = a * rng.int(-3, 3); return finish(v, `${v}/${a < 0 ? `(${a})` : a} ${signed(b)} ${rel} ${xx / a + b}`, rel, a < 0, xx); }
        lhs = poly([a, b], v); rhs = a * x + b; reversed = a < 0;
      } else {
        const b = rng.nonZero(-9, 9), c = rng.nonZero(-6, 6);
        if (level === 1) { lhs = polynomial([{ coef: a - c, powers: [[v, 1]] }, { coef: b }, { coef: c, powers: [[v, 1]] }]); rhs = a * x + b; reversed = a < 0; }
        else if (level === 2) { const k = rng.int(2, 5) * (neg && rng.next() < 0.5 ? -1 : 1); lhs = `${k}(${poly([1, b], v)})`; rhs = k * x + k * b; reversed = k < 0; }
        else {
          let d = rng.nonZero(-6, 6); while (d === a) d = rng.nonZero(-6, 6);
          lhs = poly([a, b], v); const r0 = (a - d) * x + b; rhs = 0;
          return finish(v, `${lhs} ${rel} ${poly([d, r0], v)}`, rel, a - d < 0, x);
        }
      }
      return finish(v, `${lhs} ${rel} ${rhs}`, rel, reversed, x);
      function finish(vv: string, ineq: string, r: Rel, rev: boolean, value: number) {
        const final = rev ? flip(r) : r;
        const ans = inequalityAnswer(vv, final, value);
        const graph = optOn(o, 'graph', true);
        return task(graph ? 'Solve each inequality and graph its solution.' : 'Solve each inequality.', 'Solve', ineq, {
          answer: math(ans.text),
          distractors: wrong(math(ans.text), [`${vv} ${r === final ? flip(r) : r} ${value}`, `${vv} ${final} ${-value}`, `${vv} ${final.length === 1 ? final + '=' : final[0]} ${value}`, `${vv} ${flip(final)} ${-value}`].map(math)),
          solution: `${rev ? 'Dividing or multiplying both sides by a negative number reverses the inequality sign. ' : 'Solve as you would an equation. '}${math(ans.text)}${graph ? `\n\n${ans.line}` : '.'}`,
        });
      }
    },
  });
}
export const paIneqOneStep = inequalityGen('pa-ineq-one-step', 1);
export const paIneqTwoStep = inequalityGen('pa-ineq-two-step', 2);
export const paIneqMultiStep = inequalityGen('pa-ineq-multi-step', 3);

// ── Proportions ──────────────────────────────────────────────────────────────

export const paPropCheck = us('pa-prop-check', {
  levels: { 1: 'Whole numbers', 2: 'Larger whole numbers', 3: 'Decimals' },
  generate(rng, level) {
    const scale = level === 3 ? 10 : 1;
    const a = rng.int(1, 9 * level), b = rng.int(a + 1, 12 * level), k = rng.int(2, 6);
    const yes = rng.next() < 0.5;
    const c = a * k, d = b * k + (yes ? 0 : rng.pick([-1, 1, k]));
    const s = (n: number) => decimal(n / scale);
    const left = `${s(a)}/${s(b)}`, right = `${s(c)}/${s(d)}`;
    const p1 = (a * d) / scale ** 2, p2 = (b * c) / scale ** 2;
    const answer = yes ? 'Yes' : 'No';
    return {
      body: `Do ${math(left)} and ${math(right)} form a proportion?`,
      task: { instruction: 'State whether each pair of ratios forms a proportion.', item: `${math(left)} and ${math(right)}` },
      answer, distractors: [yes ? 'No' : 'Yes'],
      solution: `Compare the cross products: ${math(`${s(a)} dot ${s(d)} = ${decimal(p1)}`)} and ${math(`${s(b)} dot ${s(c)} = ${decimal(p2)}`)}. They are ${yes ? 'equal, so the ratios form a proportion' : 'not equal, so the ratios do not form a proportion'}.`,
    };
  },
});

export const paPropSolve = us('pa-prop-solve', {
  levels: { 1: 'x/a = b/c', 2: 'Variable in any position', 3: 'Binomial numerators, (x + a)/b = c/d' },
  options: [radioOption('form', 'Form', [['1', 'x/a = b/c'], ['2', 'Variable in any position'], ['3', 'Binomial numerator']], ['1', '2', '3']), toggleOption('fractions', 'Allow fractional answers', [false, false, true])],
  generate(rng, level, o) {
    const form = optNum(o, 'form', level), allowFrac = optOn(o, 'fractions', false);
    const v = letter(rng);
    const b = rng.int(2, 12), k = rng.int(2, 8);
    let a = rng.int(1, 12);
    if (a % b === 0 || b % a === 0) a = b + rng.int(1, 5);
    if (form === 3) {
      // (v + c)/f = g/h, with g a multiple of h so the answer is usually whole.
      const c = rng.nonZero(-8, 8), f = rng.int(2, 9), h = rng.int(2, 9), g = h * rng.int(1, 6);
      const sol = new Q(g * f, h).sub(c);
      return solved(v, `(${poly([1, c], v)})/${f} = ${g}/${h}`, sol, [new Q(g * f, h).add(c), new Q(g * h, f).sub(c), new Q(g, h * f).sub(c)], 'Cross multiply, then solve the linear equation.');
    }
    const pos = form === 1 ? 0 : rng.int(0, 3);
    // Proportion v/b = a/(... ) arranged so v is at `pos` and the answer is a·k.
    const n1 = a * k, d1 = b * k, n2 = a, d2 = b;
    const nums = [n1, d1, n2, d2];
    const shown = nums.map((n, i) => (i === pos ? v : String(n)));
    const value = nums[pos];
    const eq = `${shown[0]}/${shown[1]} = ${shown[2]}/${shown[3]}`;
    const others = nums.filter((_, i) => i !== pos);
    return solved(v, eq, new Q(value), [new Q(others[0] * others[1], others[2]), new Q(others[0] * others[2], others[1]), new Q(others[1] * others[2], others[0]).add(1)].filter((q) => !q.eq(value)), `Cross multiply: ${math(`${shown[pos === 0 || pos === 3 ? 1 : 0]} dot ${shown[pos === 0 || pos === 3 ? 2 : 3]} = ${shown[pos === 0 || pos === 3 ? 0 : 1]} dot ${shown[pos === 0 || pos === 3 ? 3 : 2]}`)}, then divide.`);
  },
});

export const paPropWords = us('pa-prop-words', {
  points: 2,
  levels: { 1: 'Rates and recipes', 2: 'Maps and shadows', 3: 'Any context' },
  generate(rng, level) {
    const name = rng.pick(NAMES);
    const k = rng.int(2, 6), a = rng.int(2, 9);
    let b = rng.int(2, 9);
    if (b === a) b = a + 1;
    const all = [
      { t: `A recipe uses ${a} cups of flour for every ${b} cups of sugar. How many cups of flour are needed for ${b * k} cups of sugar?`, ans: a * k, unit: 'cups' },
      { t: `${name} can read ${a * 10} pages in ${b} hours. At that rate, how many pages can ${name} read in ${b * k} hours?`, ans: a * 10 * k, unit: 'pages' },
      { t: `On a map, ${a} cm represents ${b * 10} km. How many kilometres does ${a * k} cm represent?`, ans: b * 10 * k, unit: 'km' },
      { t: `A ${a} m pole casts a ${b} m shadow. At the same time, a tree casts a ${b * k} m shadow. How tall is the tree?`, ans: a * k, unit: 'm' },
      { t: `${b} kg of apples cost ${math(money(a * 2))}. How much do ${b * k} kg cost?`, ans: a * 2 * k, unit: '$' },
    ];
    const ctx = rng.pick(level === 1 ? [all[0], all[1], all[4]] : level === 2 ? [all[2], all[3]] : all);
    const fmt = (v: number) => (ctx.unit === '$' ? math(money(v)) : `${math(decimal(v, 2))} ${ctx.unit}`);
    const answer = fmt(ctx.ans);
    return { body: ctx.t, answer, distractors: wrong(answer, [fmt(ctx.ans / k / k), fmt(ctx.ans + k), fmt(ctx.ans / k + b * k), fmt(ctx.ans * 2)]), solution: `Set up equal ratios and cross multiply: the answer is ${answer}.` };
  },
});

export const PREALGEBRA_ALGEBRA = [
  paVerbal, paDistributive, paLikeTerms, paEvaluate, paEqOneStep, paEqOneStepWords, paEqTwoStep, paEqTwoStepWords, paEqMultiStep,
  paIneqOneStep, paIneqTwoStep, paIneqMultiStep, paPropCheck, paPropSolve, paPropWords,
];
