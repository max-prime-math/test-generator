// Calculus: limits and derivatives, after Kuta's LimitsBasic, LimitsAtKinksJumps,
// LimitsAtHoles, LimitsAtVerticalAsymptotes, LimitsAtInfinity,
// DifferentiationDefinition, DifferentiationInstROC, DifferentiationPowerRule,
// DifferentiationHigherOrder, Product/Quotient/ChainRule, DifferentiationChainTables,
// DifferentiationChainRuleTrig, DifferentiationChainRuleInvTrig,
// DifferentiationExponential(OtherBase), DifferentiationLog, DifferentiationImplicit,
// and DifferentiationInverse.
import { Q } from '../../exact.ts';
import { poly, sub } from '../../format.ts';
import { optOn, toggleOption } from '../../options.ts';
import { fromRoots, polyEval, polyMul } from '../pc40s/functions.ts';
import { us, math, task, wrong } from './common.ts';
import { dPow, powsText, polyD, type Pow } from './calc-common.ts';

const lin = (a: number, b: number, v = 'x') => poly([a, b], v);
/** `(ax + b)` unless it is a bare variable. */
const par = (s: string) => (/^[a-z]$/.test(s) ? s : `(${s})`);
/** A coefficient in front of a function: `3`, `-`, `` for 1. */
const k = (c: number | Q) => { const q = Q.of(c); return q.eq(1) ? '' : q.eq(-1) ? '-' : q.isInt ? q.typst() : `${q.typst()} `; };

// ── Limits ───────────────────────────────────────────────────────────────────

export const caLimitDirect = us('ca-limit-direct', {
  levels: { 1: 'Polynomials', 2: 'Rational functions', 3: 'Roots and trigonometric functions' },
  generate(rng, level) {
    const a = rng.int(-4, 4);
    let expr: string, value: string, wrongs: string[];
    if (level === 1) {
      const p = [rng.nonZero(-3, 3), rng.int(-6, 6), rng.int(-9, 9)];
      expr = poly(p); value = String(polyEval(p, a));
      wrongs = [String(polyEval(p, -a)), String(polyEval(p, a) + 1), String(p[2])];
    } else if (level === 2) {
      const num = [rng.nonZero(-3, 3), rng.int(-6, 6)], den = [1, rng.int(-6, 6)];
      if (polyEval(den, a) === 0) den[1] += 1;
      const q = new Q(polyEval(num, a), polyEval(den, a));
      expr = `(${poly(num)})/(${poly(den)})`; value = q.typst();
      wrongs = [new Q(polyEval(num, -a), polyEval(den, -a) || 1).typst(), new Q(num[0], den[0]).typst(), q.neg().typst()];
    } else if (rng.next() < 0.5) {
      const sq = rng.int(1, 9), c = sq * sq - a * a;
      expr = `sqrt(x^2 ${c < 0 ? '-' : '+'} ${Math.abs(c)})`;
      if (c === 0) expr = 'sqrt(x^2)';
      value = String(sq); wrongs = [String(sq * sq), String(-sq), String(Math.abs(a) + Math.abs(c))];
    } else {
      const [t, v] = rng.pick([['pi/6', ['1/2', 'sqrt(3)/2']], ['pi/4', ['sqrt(2)/2', 'sqrt(2)/2']], ['pi/3', ['sqrt(3)/2', '1/2']], ['pi/2', ['1', '0']], ['pi', ['0', '-1']]] as const);
      const fn = rng.pick(['sin', 'cos'] as const);
      const val = fn === 'sin' ? v[0] : v[1];
      return task('Evaluate each limit.', 'Evaluate', `lim_(x -> ${t}) ${fn} x`, {
        answer: math(val), distractors: wrong(math(val), [fn === 'sin' ? v[1] : v[0], '"does not exist"', `-${val}`.replace('--', ''), t].map(math)),
        solution: `${math(`${fn} x`)} is continuous, so substitute: ${math(`${fn} ${t} = ${val}`)}.`,
      });
    }
    return task('Evaluate each limit.', 'Evaluate', `lim_(x -> ${a}) ${expr}`, {
      answer: math(value), distractors: wrong(math(value), [...wrongs, '"does not exist"'].map(math)),
      solution: `The function is continuous at ${math(`x = ${a}`)}, so substitute: ${math(value)}.`,
    });
  },
});

export const caLimitPiecewise = us('ca-limit-piecewise', {
  levels: { 1: 'One-sided limits', 2: 'Two-sided limits', 3: 'Absolute value (kinks) and jumps' },
  generate(rng, level) {
    const a = rng.int(-3, 3);
    if (level === 3 && rng.next() < 0.5) {
      // |x − a|/(x − a): one-sided limits ±1, no two-sided limit.
      const side = rng.pick(['^-', '^+', '']);
      const val = side === '^-' ? '-1' : side === '^+' ? '1' : '"does not exist"';
      const f = `|${lin(1, -a)}|/(${lin(1, -a)})`;
      return task('Evaluate each limit.', 'Evaluate', `lim_(x -> ${a}${side}) ${f}`, {
        answer: math(val), distractors: wrong(math(val), ['1', '-1', '0', '"does not exist"'].map(math)),
        solution: `For ${math(`x > ${a}`)} the expression is ${math('1')}; for ${math(`x < ${a}`)} it is ${math('-1')}. ${side ? 'Use the matching side.' : 'The one-sided limits differ, so the limit does not exist.'}`,
      });
    }
    const m1 = rng.nonZero(-3, 3), b1 = rng.int(-5, 5), m2 = rng.nonZero(-3, 3);
    const left = m1 * a + b1;
    const jump = rng.next() < 0.5 ? 0 : rng.nonZero(-4, 4);
    const b2 = left + jump - m2 * a;
    const right = m2 * a + b2;
    const f = `f(x) = cases(${lin(m1, b1)} & "if" x < ${a}, ${lin(m2, b2)} & "if" x >= ${a})`;
    const side = level === 1 ? rng.pick(['^-', '^+']) : '';
    const val = side === '^-' ? String(left) : side === '^+' ? String(right) : jump ? '"does not exist"' : String(left);
    return {
      body: `For ${math(f)}, find ${math(`lim_(x -> ${a}${side}) f(x)`)}.`,
      answer: math(val),
      distractors: wrong(math(val), [String(left), String(right), '"does not exist"', String(left + right), String(m1 * -a + b1)].map(math)).slice(0, 4),
      solution: `${math(`lim_(x -> ${a}^-) f(x) = ${left}`)} and ${math(`lim_(x -> ${a}^+) f(x) = ${right}`)}. ${side ? '' : jump ? 'They differ, so the limit does not exist.' : `They agree, so the limit is ${math(String(left))}.`}`.trim(),
    };
  },
});

export const caLimitRemovable = us('ca-limit-removable', {
  levels: { 1: 'Factor a quadratic', 2: 'Factor cubes and higher', 3: 'Rationalize a root' },
  generate(rng, level) {
    const r = rng.int(-5, 5);
    if (level === 3) {
      // (√(x + c) − s)/(x − r) with s² = r + c  →  1/(2s)
      const s = rng.int(1, 5), c = s * s - r;
      const expr = `(sqrt(x ${c < 0 ? '-' : '+'} ${Math.abs(c)}) - ${s})/(${lin(1, -r)})`.replace('sqrt(x + 0)', 'sqrt(x)').replace('sqrt(x - 0)', 'sqrt(x)');
      const ans = new Q(1, 2 * s);
      return task('Evaluate each limit.', 'Evaluate', `lim_(x -> ${r}) ${expr}`, {
        answer: math(ans.typst()), distractors: wrong(math(ans.typst()), [new Q(1, s), new Q(2 * s), new Q(0)].map((q) => math(q.typst())).concat(math('"does not exist"'))),
        solution: `Multiply by the conjugate ${math(`sqrt(x ${c < 0 ? '-' : '+'} ${Math.abs(c)}) + ${s}`)}: the factor ${math(lin(1, -r))} cancels, leaving ${math(`1/(sqrt(x ${c < 0 ? '-' : '+'} ${Math.abs(c)}) + ${s})`)} ${math(`-> ${ans.typst()}`)}.`,
      });
    }
    let num: number[], den: number[], value: Q, how: string;
    if (level === 1) {
      const s = rng.int(-6, 6), lead = rng.int(1, 2);
      num = fromRoots([r, s], lead); den = [1, -r];
      value = new Q(lead * (r - s)); how = `${math(poly(num))} factors as ${math(`${lead === 1 ? '' : lead}(${lin(1, -r)})(${lin(1, -s)})`)}`;
    } else {
      const cube = rng.next() < 0.5;
      num = cube ? [1, 0, 0, -(r ** 3)] : fromRoots([r, -r, rng.int(-4, 4)]);
      den = cube ? [1, -r] : fromRoots([r, rng.int(-4, 4)]);
      const qn = polyDivide(num, [1, -r]), qd = polyDivide(den, [1, -r]);
      if (polyEval(qd, r) === 0) return caLimitRemovable.generate(rng, 1);
      value = new Q(polyEval(qn, r), polyEval(qd, r)); how = `the factor ${math(lin(1, -r))} divides the numerator and the denominator`;
    }
    const expr = `(${poly(num)})/(${poly(den)})`;
    return task('Evaluate each limit.', 'Evaluate', `lim_(x -> ${r}) ${expr}`, {
      answer: math(value.typst()),
      distractors: wrong(math(value.typst()), [value.neg(), value.add(1), new Q(0)].map((q) => math(q.typst())).concat(math('"does not exist"'))),
      solution: `Substitution gives ${math('0/0')}; ${how}. Cancel it and substitute: ${math(value.typst())}.`,
    });
  },
});
/** Exact division by a monic linear factor (no remainder expected). */
function polyDivide(p: number[], d: number[]): number[] {
  const out: number[] = [];
  let rem = [...p];
  while (rem.length >= d.length) {
    const c = rem[0] / d[0];
    out.push(c);
    rem = rem.map((v, i) => v - (d[i] ?? 0) * c).slice(1);
  }
  return out;
}

export const caLimitInfinite = us('ca-limit-infinite', {
  levels: { 1: 'One-sided limits', 2: 'Two-sided limits', 3: 'Rational functions that factor' },
  generate(rng, level) {
    const a = rng.int(-4, 4), c = rng.nonZero(-5, 5), even = rng.next() < 0.5;
    const n = even ? 2 : 1;
    const f = `${c}/${n === 2 ? `(${lin(1, -a)})^2` : `(${lin(1, -a)})`}`;
    const side = level === 1 ? rng.pick(['^-', '^+']) : '';
    const sgn = (s: string) => (c > 0 ? 1 : -1) * (even ? 1 : s === '^-' ? -1 : 1);
    const inf = (s: number) => (s > 0 ? 'oo' : '-oo');
    const val = side ? inf(sgn(side)) : even ? inf(sgn('^+')) : '"does not exist"';
    return task('Evaluate each limit.', 'Evaluate', `lim_(x -> ${a}${side}) ${f}`, {
      answer: math(val), distractors: wrong(math(val), ['oo', '-oo', '"does not exist"', '0'].map(math)),
      solution: `Near ${math(`x = ${a}`)} the denominator approaches 0 ${even ? 'through positive values' : side === '^-' ? 'through negative values' : side === '^+' ? 'through positive values' : 'with different signs on each side'}, and the numerator is ${math(String(c))}: ${math(val)}.`,
    });
  },
});

export const caLimitInfinity = us('ca-limit-infinity', {
  levels: { 1: 'Equal degrees', 2: 'Different degrees', 3: 'Roots and negative infinity' },
  generate(rng, level) {
    const dn = level === 1 ? rng.int(1, 3) : rng.int(1, 3), dd = level === 1 ? dn : rng.pick([dn - 1, dn + 1].filter((d) => d >= 1)) || dn + 1;
    const num = Array.from({ length: dn + 1 }, (_, i) => (i === 0 ? rng.nonZero(-6, 6) : rng.int(-9, 9)));
    const den = Array.from({ length: dd + 1 }, (_, i) => (i === 0 ? rng.nonZero(-6, 6) : rng.int(-9, 9)));
    const toNeg = level === 3 && rng.next() < 0.6;
    const to = toNeg ? '-oo' : 'oo';
    let val: string;
    if (dn === dd) val = new Q(num[0], den[0]).typst();
    else if (dn < dd) val = '0';
    else { const s = Math.sign(num[0] / den[0]) * (toNeg && (dn - dd) % 2 ? -1 : 1); val = s > 0 ? 'oo' : '-oo'; }
    return task('Evaluate each limit.', 'Evaluate', `lim_(x -> ${to}) (${poly(num)})/(${poly(den)})`, {
      answer: math(val), distractors: wrong(math(val), [new Q(num[0], den[0]).typst(), '0', 'oo', '-oo', new Q(num[num.length - 1], den[den.length - 1] || 1).typst()].map(math)).slice(0, 4),
      solution: dn === dd ? `The degrees are equal, so the limit is the ratio of the leading coefficients: ${math(val)}.` : dn < dd ? 'The denominator has the higher degree, so the fraction approaches 0.' : `The numerator has the higher degree, so the fraction grows without bound: ${math(val)}.`,
    });
  },
});

// ── The derivative ───────────────────────────────────────────────────────────

export const caDerivativeDefinition = us('ca-derivative-definition', {
  points: 3,
  levels: { 1: 'Linear and quadratic', 2: 'Cubic', 3: '1/x and √x' },
  generate(rng, level) {
    if (level === 3) {
      const a = rng.nonZero(-5, 5), sqrtCase = rng.next() < 0.5;
      const f = sqrtCase ? `${k(a)}sqrt(x)` : `${a}/x`;
      const answer = sqrtCase ? `${a < 0 ? '-' : ''}${Math.abs(a)}/(2sqrt(x))` : `${-a}/x^2`;
      return {
        body: `Use the definition of the derivative to find ${math("f'(x)")} for ${math(`f(x) = ${f}`)}.`,
        answer: math(`f'(x) = ${answer}`),
        distractors: wrong(math(`f'(x) = ${answer}`), (sqrtCase ? [`${a}/sqrt(x)`, `(${k(a)}sqrt(x))/2`, `${2 * a}/sqrt(x)`] : [`${a}/x^2`, `${-a}/x`, `${k(a)}ln x`]).map((t) => math(`f'(x) = ${t}`))),
        solution: sqrtCase
          ? `${math(`lim_(h -> 0) (${k(a)}sqrt(x + h) - (${k(a)}sqrt(x)))/h`)}: multiply by the conjugate to get ${math(`lim_(h -> 0) ${a}/(sqrt(x + h) + sqrt(x)) = ${answer}`)}.`
          : `${math(`lim_(h -> 0) (${sub(a)}/(x + h) - ${sub(a)}/x)/h = lim_(h -> 0) ${-a}/(x(x + h)) = ${answer}`)}.`,
      };
    }
    const p = level === 1 ? [rng.nonZero(-5, 5), rng.int(-9, 9), rng.int(-9, 9)] : [rng.nonZero(-3, 3), rng.int(-5, 5), rng.int(-9, 9), rng.int(-9, 9)];
    const d = polyD(p);
    const answer = `f'(x) = ${poly(d)}`;
    return {
      body: `Use the definition of the derivative to find ${math("f'(x)")} for ${math(`f(x) = ${poly(p)}`)}.`,
      answer: math(answer),
      distractors: wrong(math(answer), [poly(d.map((c, i) => (i === d.length - 1 ? c + p[p.length - 1] : c))), poly(p.slice(0, -1)), poly(d.map((c, i) => (i === 0 ? c / (p.length - 1) : c))), poly(d.map((c) => -c))].map((t) => math(`f'(x) = ${t}`))),
      solution: `${math(`f'(x) = lim_(h -> 0) (f(x + h) - f(x))/h`)}. Expand ${math('f(x + h)')}, subtract, divide by ${math('h')}, and let ${math('h -> 0')}: ${math(answer)}.`,
    };
  },
});

export const caInstantaneousRate = us('ca-instantaneous-rate', {
  levels: { 1: 'Quadratic functions', 2: 'Cubic functions', 3: 'Rational functions' },
  generate(rng, level) {
    const a = rng.int(-3, 3);
    if (level === 3) {
      const c = rng.nonZero(-9, 9), b = rng.int(-4, 4);
      if (a + b === 0) return caInstantaneousRate.generate(rng, 2);
      const val = new Q(-c, (a + b) ** 2);
      return {
        body: `Find the instantaneous rate of change of ${math(`f(x) = ${c}/(${lin(1, b)})`)} at ${math(`x = ${a}`)}.`,
        answer: math(val.typst()), distractors: wrong(math(val.typst()), [val.neg(), new Q(c, a + b), new Q(-c, a + b)].map((q) => math(q.typst()))),
        solution: `${math(`f'(x) = ${-c}/(${lin(1, b)})^2`)}, so ${math(`f'(${a}) = ${val.typst()}`)}.`,
      };
    }
    const p = level === 1 ? [rng.nonZero(-4, 4), rng.int(-6, 6), rng.int(-9, 9)] : [rng.nonZero(-2, 2), rng.int(-4, 4), rng.int(-6, 6), rng.int(-9, 9)];
    const d = polyD(p), val = polyEval(d, a);
    return task('Find the instantaneous rate of change of each function at the given value.', 'Find the instantaneous rate of change of', `f(x) = ${poly(p)}`, {
      answer: math(String(val)), distractors: wrong(math(String(val)), [polyEval(p, a), polyEval(d, -a), val + d[d.length - 1], polyEval(p, a + 1) - polyEval(p, a)].map((n) => math(String(n)))),
      solution: `${math(`f'(x) = ${poly(d)}`)}, so ${math(`f'(${a}) = ${val}`)}.`,
    }, ` at ${math(`x = ${a}`)}.`);
  },
});

export const caPowerRule = us('ca-power-rule', {
  levels: { 1: 'Whole-number exponents', 2: 'Negative exponents', 3: 'Fractional exponents and radicals' },
  options: [toggleOption('radicals', 'Write roots and negative powers as radicals and fractions', [false, true, true])],
  generate(rng, level, o) {
    const radical = optOn(o, 'radicals', level > 1);
    const exps = level === 1 ? [rng.int(2, 6), rng.int(1, 4), 0] : level === 2 ? [rng.int(2, 5), -rng.int(1, 3), 0] : [rng.pick([1 / 2, 3 / 2, 1 / 3, 2 / 3, 5 / 2]), rng.int(2, 4), -rng.pick([1, 1 / 2])];
    const terms: Pow[] = [...new Set(exps)].map((n) => ({ c: new Q(rng.nonZero(-7, 7)), n: new Q(Math.round(n * 6), 6) }));
    const f = powsText(terms, 'x', radical);
    const d = terms.map(dPow);
    const answer = `f'(x) = ${powsText(d, 'x', radical)}`;
    const forgotChain = terms.map((t) => ({ c: t.c, n: t.n.sub(1) }));
    const addOne = terms.map((t) => ({ c: t.c.mul(t.n), n: t.n.add(1) }));
    const keptConst = [...d, ...terms.filter((t) => t.n.eq(0))];
    return task('Differentiate each function with respect to x.', 'Differentiate', `f(x) = ${f}`, {
      answer: math(answer),
      distractors: wrong(math(answer), [forgotChain, addOne, keptConst, d.map((t) => ({ ...t, c: t.c.neg() }))].map((ts) => math(`f'(x) = ${powsText(ts, 'x', radical)}`))),
      solution: `Rewrite each term as ${math('c x^n')} and use ${math("(x^n)' = n x^(n - 1)")}: ${math(answer)}.`,
    });
  },
});

export const caHigherOrder = us('ca-higher-order', {
  levels: { 1: 'Second derivative of a polynomial', 2: 'Third derivative', 3: 'Second derivative with negative or fractional powers' },
  generate(rng, level) {
    const order = level === 2 ? 3 : 2;
    const terms: Pow[] = level === 3
      ? [{ c: new Q(rng.nonZero(-6, 6)), n: new Q(rng.int(2, 4)) }, { c: new Q(rng.nonZero(-6, 6)), n: new Q(-rng.int(1, 2)) }]
      : [{ c: new Q(rng.nonZero(-5, 5)), n: new Q(rng.int(3, 6)) }, { c: new Q(rng.nonZero(-6, 6)), n: new Q(rng.int(1, 2)) }, { c: new Q(rng.int(-9, 9)), n: new Q(0) }];
    let d = terms;
    for (let i = 0; i < order; i++) d = d.map(dPow);
    const name = order === 2 ? "f''(x)" : "f'''(x)";
    const first = terms.map(dPow);
    const answer = `${name} = ${powsText(d)}`;
    return task(`Find ${math(name)} for each function.`, 'Find', `${name} "for" f(x) = ${powsText(terms)}`, {
      answer: math(answer),
      distractors: wrong(math(answer), [first, d.map((t) => ({ ...t, c: t.c.div(2) })), first.map(dPow).map(dPow).map(dPow)].map((ts) => math(`${name} = ${powsText(ts)}`))),
      solution: `Differentiate ${order} times: ${math(`f'(x) = ${powsText(first)}`)}${order === 3 ? `, ${math(`f''(x) = ${powsText(first.map(dPow))}`)}` : ''}, so ${math(answer)}.`,
    });
  },
});

// ── Rules ────────────────────────────────────────────────────────────────────

export const caProductRule = us('ca-product-rule', {
  levels: { 1: 'Two polynomials', 2: 'With radicals', 3: 'With exponential and trigonometric factors' },
  generate(rng, level) {
    if (level === 3) {
      const n = rng.int(1, 4), a = rng.nonZero(-3, 3);
      const kind = rng.pick(['e', 'sin', 'cos', 'ln'] as const);
      const xn = n === 1 ? 'x' : `x^${n}`, dxn = n === 1 ? '1' : n === 2 ? '2x' : `${n}x^${n - 1}`;
      const g = kind === 'e' ? `e^(${k(a)}x)`.replace('e^(x)', 'e^x') : kind === 'ln' ? 'ln x' : `${kind} ${k(a)}x`.replace(/ (-?)x$/, ' $1x');
      const dg = kind === 'e' ? `${k(a)}e^(${k(a)}x)`.replace('e^(x)', 'e^x') : kind === 'ln' ? '1/x' : kind === 'sin' ? `${k(a)}cos ${k(a)}x` : `${k(-a)}sin ${k(a)}x`;
      const answer = `f'(x) = ${xn} dot ${par(dg)} + ${g} dot ${dxn}`.replace('dot (1/x)', 'dot 1/x').replace(' dot 1 ', ' ').replace(/ dot 1$/, '');
      return task('Differentiate each function with respect to x.', 'Differentiate', `f(x) = ${xn} ${g}`, {
        answer: math(answer),
        distractors: wrong(math(answer), [`f'(x) = ${dxn} dot ${par(dg)}`, `f'(x) = ${xn} dot ${par(dg)} - ${g} dot ${dxn}`, `f'(x) = ${xn} dot ${g} + ${dxn} dot ${par(dg)}`].map((t) => math(t.replace(/ dot 1$/, '')))),
        solution: `Product rule: ${math("(u v)' = u v' + v u'")} with ${math(`u = ${xn}`)} and ${math(`v = ${g}`)}: ${math(answer)}.`,
      });
    }
    const u = level === 1 ? [rng.nonZero(-4, 4), 0, rng.int(-6, 6)].slice(rng.next() < 0.5 ? 1 : 0) : [rng.nonZero(-4, 4), rng.int(-6, 6)];
    const v = [rng.nonZero(-4, 4), rng.int(-6, 6), rng.int(-6, 6)];
    if (level === 2) {
      // (a√x + b)(cx + d): derivative a(3c/2)√x + ... keep as product-rule form, then simplified.
      const a = rng.nonZero(-4, 4), b = rng.int(-6, 6), c = rng.nonZero(-4, 4), dd = rng.int(-6, 6);
      // f = ac x^(3/2) + ad x^(1/2) + bc x + bd
      const terms: Pow[] = [{ c: new Q(a * c), n: new Q(3, 2) }, { c: new Q(a * dd), n: new Q(1, 2) }, { c: new Q(b * c), n: new Q(1) }, { c: new Q(b * dd), n: new Q(0) }];
      const answer = `f'(x) = ${powsText(terms.map(dPow), 'x', true)}`;
      return task('Differentiate each function with respect to x.', 'Differentiate', `f(x) = (${a === 1 ? '' : a === -1 ? '-' : a}sqrt(x)${b ? ` ${b < 0 ? '-' : '+'} ${Math.abs(b)}` : ''})(${lin(c, dd)})`, {
        answer: math(answer),
        distractors: wrong(math(answer), [[{ c: new Q(a * c, 2), n: new Q(-1, 2) }], terms.map((t) => ({ c: t.c, n: t.n.sub(1) })), terms.map(dPow).map((t, i) => (i === 0 ? { ...t, c: t.c.mul(2) } : t))].map((ts) => math(`f'(x) = ${powsText(ts, 'x', true)}`))),
        solution: `Use the product rule (or expand first): ${math(answer)}.`,
      });
    }
    const product = polyMul(u, v);
    const d = polyD(product);
    const answer = `f'(x) = ${poly(d)}`;
    const wrongProduct = polyMul(polyD(u), polyD(v));
    return task('Differentiate each function with respect to x.', 'Differentiate', `f(x) = (${poly(u)})(${poly(v)})`, {
      answer: math(answer),
      distractors: wrong(math(answer), [poly(wrongProduct), poly(d.map((c, i) => (i === 0 ? c + 1 : c))), poly(polyD(polyMul(u, v.map((c, i) => (i === v.length - 1 ? 0 : c)))))].map((t) => math(`f'(x) = ${t}`))),
      solution: `Product rule: ${math(`f'(x) = (${poly(u)})(${poly(polyD(v))}) + (${poly(v)})(${poly(polyD(u))})`)}, which simplifies to ${math(poly(d))}.`,
    });
  },
});

export const caQuotientRule = us('ca-quotient-rule', {
  levels: { 1: 'Linear over linear', 2: 'Quadratic over linear', 3: 'With trigonometric or exponential functions' },
  generate(rng, level) {
    if (level === 3) {
      const kind = rng.pick(['sin', 'e', 'cos'] as const), n = rng.int(1, 3);
      const xn = n === 1 ? 'x' : `x^${n}`, dxn = n === 1 ? '' : n === 2 ? '2x' : `${n}x^${n - 1}`;
      const top = kind === 'e' ? 'e^x' : `${kind} x`;
      const dtop = kind === 'e' ? 'e^x' : kind === 'sin' ? 'cos x' : '-sin x';
      const answer = `f'(x) = (${xn} ${dtop.startsWith('-') ? `(${dtop})` : dtop} - ${top} ${dxn ? `dot ${dxn}` : ''})/x^${2 * n}`.replace(/ \)/, ')').replace('x^2)', 'x^2)');
      return task('Differentiate each function with respect to x.', 'Differentiate', `f(x) = (${top})/${xn}`, {
        answer: math(answer),
        distractors: wrong(math(answer), [`f'(x) = (${top} ${dxn ? `dot ${dxn}` : ''} - ${xn} ${dtop.startsWith('-') ? `(${dtop})` : dtop})/x^${2 * n}`, dxn ? `f'(x) = (${dtop})/(${dxn})` : `f'(x) = ${dtop}`, `f'(x) = (${xn} ${dtop.startsWith('-') ? `(${dtop})` : dtop} + ${top} ${dxn ? `dot ${dxn}` : ''})/x^${2 * n}`].map((t) => math(t.replace(/ \)/, ')')))),
        solution: `Quotient rule: ${math("(u/v)' = (v u' - u v')/v^2")}: ${math(answer)}.`,
      });
    }
    const a = rng.nonZero(-5, 5), b = rng.int(-6, 6), c = rng.nonZero(-3, 3), d = rng.int(-6, 6);
    if (level === 1) {
      if (a * d - b * c === 0) return caQuotientRule.generate(rng, 1);
      const answer = `f'(x) = ${a * d - b * c}/(${lin(c, d)})^2`;
      return task('Differentiate each function with respect to x.', 'Differentiate', `f(x) = (${lin(a, b)})/(${lin(c, d)})`, {
        answer: math(answer),
        distractors: wrong(math(answer), [`${b * c - a * d}/(${lin(c, d)})^2`, `${new Q(a, c).typst()}`, `${a * d + b * c}/(${lin(c, d)})^2`].map((t) => math(`f'(x) = ${t}`))),
        solution: `${math(`f'(x) = ((${lin(c, d)})(${a}) - (${lin(a, b)})(${c}))/(${lin(c, d)})^2 = ${a * d - b * c}/(${lin(c, d)})^2`)}.`,
      });
    }
    // (a x² + b)/(c x + d): numerator ac x² + 2ad x − bc
    const num = [a * c, 2 * a * d, -b * c];
    const answer = `f'(x) = (${poly(num)})/(${lin(c, d)})^2`;
    return task('Differentiate each function with respect to x.', 'Differentiate', `f(x) = (${poly([a, 0, b])})/(${lin(c, d)})`, {
      answer: math(answer),
      distractors: wrong(math(answer), [`(${poly([-a * c, -2 * a * d, b * c])})/(${lin(c, d)})^2`, `(${poly([3 * a * c, 2 * a * d, -b * c])})/(${lin(c, d)})^2`, `${k(new Q(2 * a, c))}x`].map((t) => math(`f'(x) = ${t}`))),
      solution: `${math(`f'(x) = ((${lin(c, d)})(${2 * a}x) - (${poly([a, 0, b])})(${c}))/(${lin(c, d)})^2`)}, which simplifies to ${math(answer.replace("f'(x) = ", ''))}.`,
    });
  },
});

export const caChainRule = us('ca-chain-rule', {
  levels: { 1: '(ax + b)ⁿ', 2: '(polynomial)ⁿ', 3: 'Roots of polynomials' },
  generate(rng, level) {
    const n = level === 3 ? new Q(1, rng.pick([2, 3])) : new Q(rng.int(2, 6) * (rng.next() < 0.2 ? -1 : 1));
    const inner = level === 1 ? [rng.nonZero(-5, 5), rng.int(-9, 9)] : [rng.nonZero(-4, 4), 0, rng.int(-9, 9)].map((c, i) => (i === 1 && rng.next() < 0.5 ? rng.int(-5, 5) : c));
    const di = polyD(inner);
    const nm1 = n.sub(1);
    const powTxt = (e: Q) => (e.isInt ? (e.n < 0 ? `(${e.n})` : String(e.n)) : `(${e.typst()})`);
    const outer = (e: Q) => `(${poly(inner)})^${powTxt(e)}`;
    const f = level === 3 ? (n.d === 2 ? `sqrt(${poly(inner)})` : `root(3, ${poly(inner)})`) : outer(n);
    const dText = poly(di);
    // n times the inner derivative, simplified: 30, -48x, (12x - 6).
    const scaled = n.isInt ? poly(di.map((c) => c * n.n)) : dText;
    const coefPart = /^-?\d*x?$/.test(scaled) ? scaled : `(${scaled})`;
    const outerPow = (e: Q) => (e.eq(1) ? `(${poly(inner)})` : outer(e));
    const radical = n.d === 2 ? `2sqrt(${poly(inner)})` : `3 root(3, (${poly(inner)})^2)`;
    const answer = level === 3 ? `f'(x) = (${dText})/(${radical})` : `f'(x) = ${coefPart}${outerPow(nm1)}`;
    const noInner = level === 3 ? `f'(x) = 1/(${radical})` : `f'(x) = ${k(n)}${outerPow(nm1)}`;
    const keptPower = level === 3 ? `f'(x) = (${dText}) ${outer(n)}` : `f'(x) = ${coefPart}${outer(n)}`;
    // Multiplying by n − 1 instead of n.
    const innerOnly = level === 3 ? `f'(x) = (${dText})/(${poly(inner)})` : `f'(x) = ${n.isInt && n.n !== 2 ? poly(di.map((c) => c * (n.n - 1))) : k(n.add(1))}${outerPow(nm1)}`;
    return task('Differentiate each function with respect to x.', 'Differentiate', `f(x) = ${f}`, {
      answer: math(answer),
      distractors: wrong(math(answer), [noInner, keptPower, innerOnly].map(math)),
      solution: `Chain rule: the outer power gives ${math(`${n.typst()} ${nm1.eq(1) ? 'u' : `u^${powTxt(nm1)}`}`)}, times the derivative of the inside, ${math(dText)}: ${math(answer)}.`,
    });
  },
});

export const caRulesTable = us('ca-rules-table', {
  points: 2,
  levels: { 1: 'Sums and constant multiples', 2: 'Products and quotients', 3: 'Compositions' },
  generate(rng, level) {
    const xs = [1, 2, 3, 4];
    const f = xs.map(() => rng.int(-5, 6)), fp = xs.map(() => rng.int(-5, 6)), g = xs.map(() => rng.int(1, 4)), gp = xs.map(() => rng.int(-5, 6));
    const table = `#table(columns: 5, align: center, inset: 5pt, [$x$], [$f(x)$], [$f'(x)$], [$g(x)$], [$g'(x)$], ${xs.map((x, i) => `[$${x}$], [$${f[i]}$], [$${fp[i]}$], [$${g[i]}$], [$${gp[i]}$]`).join(', ')})`;
    const i = rng.int(0, 3), a = xs[i];
    let h: string, value: Q, wrongs: Q[], how: string;
    if (level === 1) {
      const p = rng.nonZero(-4, 4), q = rng.nonZero(-4, 4);
      h = `${k(p)}f(x) ${q < 0 ? '-' : '+'} ${k(Math.abs(q))}g(x)`;
      value = new Q(p * fp[i] + q * gp[i]); wrongs = [new Q(p * f[i] + q * g[i]), new Q(fp[i] + gp[i]), new Q(p * fp[i] - q * gp[i])];
      how = `h'(${a}) = ${p} f'(${a}) ${q < 0 ? '-' : '+'} ${Math.abs(q)} g'(${a}) = ${p}(${fp[i]}) ${q < 0 ? '-' : '+'} ${Math.abs(q)}(${gp[i]})`;
    } else if (level === 2) {
      const quotient = rng.next() < 0.5;
      h = quotient ? 'f(x)/g(x)' : 'f(x) g(x)';
      value = quotient ? new Q(g[i] * fp[i] - f[i] * gp[i], g[i] * g[i]) : new Q(f[i] * gp[i] + g[i] * fp[i]);
      wrongs = quotient ? [new Q(fp[i], gp[i] || 1), new Q(f[i] * gp[i] - g[i] * fp[i], g[i] * g[i]), new Q(g[i] * fp[i] - f[i] * gp[i], g[i])] : [new Q(fp[i] * gp[i]), new Q(f[i] * g[i]), new Q(f[i] * gp[i] - g[i] * fp[i])];
      how = quotient ? `h'(${a}) = (g(${a}) f'(${a}) - f(${a}) g'(${a}))/(g(${a}))^2 = ((${g[i]})(${fp[i]}) - (${f[i]})(${gp[i]}))/${g[i] * g[i]}` : `h'(${a}) = f(${a}) g'(${a}) + g(${a}) f'(${a}) = (${f[i]})(${gp[i]}) + (${g[i]})(${fp[i]})`;
    } else {
      // h = f(g(x)), with g(a) one of the table's x values.
      h = 'f(g(x))';
      const j = xs.indexOf(g[i]);
      value = new Q(fp[j] * gp[i]); wrongs = [new Q(fp[i] * gp[i]), new Q(fp[j]), new Q(f[j] * gp[i])];
      how = `h'(${a}) = f'(g(${a})) g'(${a}) = f'(${g[i]}) dot ${sub(gp[i])} = ${sub(fp[j])} dot ${sub(gp[i])}`;
    }
    return {
      body: `Use the table to find ${math(`h'(${a})`)} for ${math(`h(x) = ${h}`)}.\n\n${table}`,
      answer: math(value.typst()),
      distractors: wrong(math(value.typst()), wrongs.map((q) => math(q.typst()))),
      solution: `${math(`${how} = ${value.typst()}`)}.`,
    };
  },
});

// ── Transcendental functions ─────────────────────────────────────────────────

export const caDerivativeTrig = us('ca-derivative-trig', {
  levels: { 1: 'sin, cos, and tan of ax', 2: 'sec, csc, and cot', 3: 'Powers and products of trigonometric functions' },
  generate(rng, level) {
    const a = rng.int(1, 6) * rng.sign(), c = rng.int(1, 5);
    const arg = a === 1 ? 'x' : a === -1 ? '-x' : `${a}x`;
    const ca = new Q(c * a);
    const table: Record<string, [string, string]> = {
      sin: [`${k(c)}sin ${arg}`, `${k(ca)}cos ${arg}`],
      cos: [`${k(c)}cos ${arg}`, `${k(ca.neg())}sin ${arg}`],
      tan: [`${k(c)}tan ${arg}`, `${k(ca)}sec^2 ${arg}`],
      sec: [`${k(c)}sec ${arg}`, `${k(ca)}sec ${arg} tan ${arg}`],
      csc: [`${k(c)}csc ${arg}`, `${k(ca.neg())}csc ${arg} cot ${arg}`],
      cot: [`${k(c)}cot ${arg}`, `${k(ca.neg())}csc^2 ${arg}`],
    };
    if (level === 3) {
      const kind = rng.pick(['sin2', 'xsin', 'sincos'] as const);
      const forms: Record<string, [string, string, string[]]> = {
        sin2: ['sin^2 x', '2sin x cos x', ['2sin x', 'cos^2 x', '-2sin x cos x']],
        xsin: ['x sin x', 'x cos x + sin x', ['cos x', 'x cos x - sin x', '-x sin x + cos x']],
        sincos: ['sin x cos x', 'cos^2 x - sin^2 x', ['-sin x cos x', 'cos^2 x + sin^2 x', '1']],
      };
      const [f, d, wr] = forms[kind];
      return task('Differentiate each function with respect to x.', 'Differentiate', `f(x) = ${f}`, { answer: math(`f'(x) = ${d}`), distractors: wrong(math(`f'(x) = ${d}`), wr.map((t) => math(`f'(x) = ${t}`))), solution: `${kind === 'sin2' ? 'Chain rule' : 'Product rule'}: ${math(`f'(x) = ${d}`)}.` });
    }
    const fn = rng.pick(level === 1 ? ['sin', 'cos', 'tan'] : ['sec', 'csc', 'cot']);
    const [f, d] = table[fn];
    const others = Object.values(table).map(([, dd]) => dd).filter((x) => x !== d);
    const noChain = d.replace(/^-?\d*/, (m) => (m.startsWith('-') ? '-' : '') + (c === 1 ? '' : c));
    return task('Differentiate each function with respect to x.', 'Differentiate', `f(x) = ${f}`, {
      answer: math(`f'(x) = ${d}`),
      distractors: wrong(math(`f'(x) = ${d}`), [noChain, ...rng.shuffle(others).slice(0, 3)].map((t) => math(`f'(x) = ${t}`))),
      solution: `${math(`d/(dif x) ${fn} u = ${{ sin: 'cos u', cos: '-sin u', tan: 'sec^2 u', sec: 'sec u tan u', csc: '-csc u cot u', cot: '-csc^2 u' }[fn]} dot u'`)} with ${math(`u = ${arg}`)}: ${math(`f'(x) = ${d}`)}.`,
    });
  },
});

export const caDerivativeInverseTrig = us('ca-derivative-inverse-trig', {
  levels: { 1: 'arcsin, arccos, arctan of x', 2: 'Of ax', 3: 'Of x² and other inner functions' },
  generate(rng, level) {
    const fn = rng.pick(['arcsin', 'arccos', 'arctan'] as const);
    const a = level === 1 ? 1 : rng.int(2, 5);
    const inner = level === 3 ? 'x^2' : a === 1 ? 'x' : `${a}x`;
    const dInner = level === 3 ? '2x' : String(a);
    const sq = level === 3 ? 'x^4' : a === 1 ? 'x^2' : `${a * a}x^2`;
    const base = { arcsin: `1/sqrt(1 - ${sq})`, arccos: `-1/sqrt(1 - ${sq})`, arctan: `1/(1 + ${sq})` }[fn];
    const answer = dInner === '1' ? base : base.replace(/^(-?)1\//, `$1${dInner}/`);
    const others = ['arcsin', 'arccos', 'arctan'].filter((g) => g !== fn).map((g) => ({ arcsin: `1/sqrt(1 - ${sq})`, arccos: `-1/sqrt(1 - ${sq})`, arctan: `1/(1 + ${sq})` } as Record<string, string>)[g].replace(/^(-?)1\//, `$1${dInner === '1' ? '1' : dInner}/`));
    return task('Differentiate each function with respect to x.', 'Differentiate', `f(x) = ${fn} ${inner === 'x' ? 'x' : `(${inner})`}`, {
      answer: math(`f'(x) = ${answer}`),
      distractors: wrong(math(`f'(x) = ${answer}`), [base.replace(`${sq}`, inner === 'x' ? 'x^2' : inner === 'x^2' ? 'x^2' : `${a}x^2`), ...others].map((t) => math(`f'(x) = ${t}`))),
      solution: `${math(`d/(dif x) ${fn} u = ${{ arcsin: '1/sqrt(1 - u^2)', arccos: '-1/sqrt(1 - u^2)', arctan: '1/(1 + u^2)' }[fn]} dot u'`)} with ${math(`u = ${inner}`)}: ${math(`f'(x) = ${answer}`)}.`,
    });
  },
});

export const caDerivativeExpLn = us('ca-derivative-exp-ln', {
  levels: { 1: 'e^(ax) and ln(ax)', 2: 'e^(polynomial) and ln(polynomial)', 3: 'Products and quotients' },
  generate(rng, level) {
    const e = rng.next() < 0.5;
    if (level === 3) {
      const forms: Array<[string, string, string[]]> = [
        ['x e^x', '(x + 1)e^x', ['e^x', 'x e^x', 'x e^(x - 1)']],
        ['x^2 e^x', '(x^2 + 2x)e^x', ['2x e^x', 'x^2 e^x', '2x e^(x)']],
        ['x ln x', 'ln x + 1', ['1', '1/x', 'ln x']],
        ['(ln x)/x', '(1 - ln x)/x^2', ['1/x^2', '(ln x - 1)/x^2', '1']],
        ['e^x/x', '((x - 1)e^x)/x^2', ['e^x', '((x + 1)e^x)/x^2', 'e^x/x^2']],
      ];
      const [f, d, wr] = rng.pick(forms);
      return task('Differentiate each function with respect to x.', 'Differentiate', `f(x) = ${f}`, { answer: math(`f'(x) = ${d}`), distractors: wrong(math(`f'(x) = ${d}`), wr.map((t) => math(`f'(x) = ${t}`))), solution: `Use the product or quotient rule with ${math("(e^x)' = e^x")} and ${math("(ln x)' = 1/x")}: ${math(`f'(x) = ${d}`)}.` });
    }
    const inner = level === 1 ? [rng.nonZero(-6, 6), 0] : [rng.nonZero(-3, 3), rng.int(-5, 5), rng.int(-9, 9)];
    if (!e && level === 1) inner[1] = rng.int(-9, 9) || 1;
    const p = poly(inner), dp = poly(polyD(inner));
    if (e) {
      const answer = polyD(inner).length === 1 ? `${k(polyD(inner)[0])}e^(${p})` : `(${dp})e^(${p})`;
      return task('Differentiate each function with respect to x.', 'Differentiate', `f(x) = e^(${p})`, {
        answer: math(`f'(x) = ${answer}`),
        distractors: wrong(math(`f'(x) = ${answer}`), [`e^(${p})`, `(${p})e^(${poly(inner.map((c, i) => (i === inner.length - 1 ? c - 1 : c)))})`, `${polyD(inner).length === 1 ? '' : `(${dp})`}e^(${dp})`.replace(/^e/, 'e')].map((t) => math(`f'(x) = ${t}`))),
        solution: `${math("(e^u)' = e^u dot u'")} with ${math(`u = ${p}`)}: ${math(`f'(x) = ${answer}`)}.`,
      });
    }
    const answer = `(${dp})/(${p})`.replace(/^\((-?\d+)\)/, '$1');
    return task('Differentiate each function with respect to x.', 'Differentiate', `f(x) = ln(${p})`, {
      answer: math(`f'(x) = ${answer}`),
      distractors: wrong(math(`f'(x) = ${answer}`), [`1/(${p})`, `(${p})/(${dp})`.replace(/\/\((-?\d+)\)$/, '/$1'), `ln(${dp})`].map((t) => math(`f'(x) = ${t}`))),
      solution: `${math("(ln u)' = u'/u")} with ${math(`u = ${p}`)}: ${math(`f'(x) = ${answer}`)}.`,
    });
  },
});

export const caDerivativeOtherBase = us('ca-derivative-other-base', {
  levels: { 1: 'a^x and log_a x', 2: 'a^(bx) and log_a(bx + c)', 3: 'With polynomial exponents and arguments' },
  generate(rng, level) {
    const base = rng.pick([2, 3, 5, 7, 10]);
    const expo = rng.next() < 0.5;
    const inner = level === 1 ? [1, 0] : level === 2 ? [rng.int(2, 5), expo ? 0 : rng.int(1, 9)] : [1, 0, rng.int(1, 9)];
    const p = poly(inner), dp = poly(polyD(inner));
    if (expo) {
      const answer = `${polyD(inner).length === 1 ? (polyD(inner)[0] === 1 ? '' : `${polyD(inner)[0]} dot `) : `${dp} dot `}${base}^(${p}) ln ${base}`.replace('^(x)', '^x');
      return task('Differentiate each function with respect to x.', 'Differentiate', `f(x) = ${base}^(${p})`.replace('^(x)', '^x'), {
        answer: math(`f'(x) = ${answer}`),
        distractors: wrong(math(`f'(x) = ${answer}`), [`${base}^(${p})`.replace('^(x)', '^x'), `${p === 'x' ? 'x' : `(${p})`} dot ${base}^(${poly(inner.map((c, i) => (i === inner.length - 1 ? c - 1 : c)))})`, `${base}^(${p})/(ln ${base})`.replace('^(x)', '^x')].map((t) => math(`f'(x) = ${t}`))),
        solution: `${math("(a^u)' = a^u ln a dot u'")}: ${math(`f'(x) = ${answer}`)}.`,
      });
    }
    const answer = `(${dp})/((${p}) ln ${base})`.replace('((x) ln', '(x ln').replace(/^\((\d+)\)/, '$1');
    return task('Differentiate each function with respect to x.', 'Differentiate', `f(x) = ${p === 'x' ? `log_${base} x` : `log_${base}(${p})`}`, {
      answer: math(`f'(x) = ${answer}`),
      distractors: wrong(math(`f'(x) = ${answer}`), [`1/(${p})`, `(${dp} ln ${base})/(${p})`.replace(/^\((\d+) /, '($1 '), `1/((${p}) ln ${base})`.replace('((x) ln', '(x ln')].map((t) => math(`f'(x) = ${t}`))),
      solution: `${math("(log_a u)' = u'/(u ln a)")}: ${math(`f'(x) = ${answer}`)}.`,
    });
  },
});

export const caLogDifferentiation = us('ca-log-differentiation', {
  points: 2,
  levels: { 1: 'Variable bases and exponents', 2: 'Products and quotients of powers', 3: 'Either' },
  generate(rng, level) {
    const kind = level === 1 ? 'power' : level === 2 ? 'product' : rng.pick(['power', 'product']);
    if (kind === 'power') {
      const forms: Array<[string, string, string[]]> = [
        ['x^x', 'x^x (ln x + 1)', ['x dot x^(x - 1)', 'x^x ln x', 'x^x']],
        ['x^(sin x)', 'x^(sin x) (cos x ln x + (sin x)/x)', ['sin x dot x^(sin x - 1)', 'x^(sin x) cos x', 'x^(sin x) ln x']],
        ['x^(2x)', '2x^(2x) (ln x + 1)', ['2x dot x^(2x - 1)', 'x^(2x) ln x', '2x^(2x) ln x']],
        ['(ln x)^x', '(ln x)^x (ln(ln x) + 1/(ln x))', ['x (ln x)^(x - 1)', '(ln x)^x ln(ln x)', '(ln x)^x / x']],
      ];
      const [f, d, wr] = rng.pick(forms);
      return task('Use logarithmic differentiation to find dy/dx.', 'Differentiate', `y = ${f}`, { answer: math(`(d y)/(d x) = ${d}`), distractors: wrong(math(`(d y)/(d x) = ${d}`), wr.map((t) => math(`(d y)/(d x) = ${t}`))), solution: `Take ${math('ln')} of both sides, differentiate implicitly, and multiply by ${math('y')}: ${math(`(d y)/(d x) = ${d}`)}.` });
    }
    const a = rng.int(1, 4), b = rng.int(1, 4), c = rng.int(1, 3);
    const r1 = rng.int(-5, 5), r2 = r1 + rng.int(1, 6), r3 = rng.int(1, 6);
    const f1 = lin(1, -r1), f2 = lin(1, -r2), f3 = poly([1, 0, r3]);
    const pw = (base: string, e: number) => (e === 1 ? base : `${par(base)}^${e}`);
    const y = `(${pw(f1, a)} ${pw(f2, b)})/(${f3})${c === 1 ? '' : `^${c}`}`;
    const term = (num: string, den: string) => `${num}/${par(den)}`;
    const inside = `${term(String(a), f1)} + ${term(String(b), f2)} - ${term(`${2 * c}x`, f3)}`;
    const answer = `(d y)/(d x) = ${y} dot (${inside})`;
    return task('Use logarithmic differentiation to find dy/dx.', 'Differentiate', `y = ${y}`, {
      answer: math(answer),
      distractors: wrong(math(answer), [`${y} dot (${term(String(a), f1)} + ${term(String(b), f2)} + ${term(`${2 * c}x`, f3)})`, inside, `${y} dot (${term(String(a), f1)} + ${term(String(b), f2)} - ${term(String(c), f3)})`].map((t) => math(`(d y)/(d x) = ${t}`))),
      solution: `${math(`ln y = ${a === 1 ? '' : `${a} `}ln ${par(f1)} + ${b === 1 ? '' : `${b} `}ln ${par(f2)} - ${c === 1 ? '' : `${c} `}ln(${f3})`)}. Differentiate: ${math(`(y')/y = ${inside}`)}, then multiply by ${math('y')}.`,
    });
  },
});

export const caImplicit = us('ca-implicit', {
  points: 2,
  levels: { 1: 'Circles and ellipses', 2: 'Products of x and y', 3: 'Cubic curves, or the slope at a point' },
  generate(rng, level) {
    const a = rng.int(1, 6), b = rng.int(1, 6), c = rng.int(5, 50);
    /** −(p·u)/(q·w) for the ratio p/q, written without coefficients of 1. */
    const ratio = (q: Q, u: string, w: string) => { const top = q.n === 1 ? u : `${q.n}${u}`, bottom = q.d === 1 ? w : `${q.d}${w}`; return `-${top.length > 1 ? `(${top})` : top}/${bottom.length > 1 ? `(${bottom})` : bottom}`; };
    const forms: Array<[string, string, string[]]> = level === 1
      ? [[`${a === 1 ? '' : a}x^2 + ${b === 1 ? '' : b}y^2 = ${c}`, ratio(new Q(a, b), 'x', 'y'), ['x/y', ratio(new Q(b, a), 'y', 'x'), '-y/x']]]
      : level === 2
        ? [[`x y = ${c}`, '-y/x', ['y/x', '-x/y', `${c}/x`]], [`x^2 y = ${c}`, '-(2y)/x', ['-y/(2x)', '(2y)/x', '-2x y']], [`x y + y^2 = ${c}`, '-y/(x + 2y)', ['y/(x + 2y)', '-x/(2y)', '-(x + 2y)/y']]]
        : [[`x^3 + y^3 = ${c}`, '-x^2/y^2', ['x^2/y^2', '-y^2/x^2', '-x/y']], [`x^2 + x y + y^2 = ${c}`, '-(2x + y)/(x + 2y)', ['(2x + y)/(x + 2y)', '-(x + 2y)/(2x + y)', '-x/y']], [`y^2 = x^3 + ${a === 1 ? '' : a}x`, `(3x^2 + ${a})/(2y)`, [`(3x^2 + ${a})/y`, `2y/(3x^2 + ${a})`, `3x^2/(2y)`]]];
    const [eq, d, wr] = rng.pick(forms);
    return task('For each equation, find dy/dx by implicit differentiation.', 'Find dy/dx by implicit differentiation:', eq, {
      answer: math(`(d y)/(d x) = ${d}`),
      distractors: wrong(math(`(d y)/(d x) = ${d}`), wr.map((t) => math(`(d y)/(d x) = ${t}`))),
      solution: `Differentiate both sides with respect to ${math('x')}, treating ${math('y')} as a function of ${math('x')} (so each ${math('y')} term gains a factor ${math("y'")}), then solve for ${math("y'")}: ${math(`(d y)/(d x) = ${d}`)}.`,
    }, '');
  },
});

export const caDerivativeInverse = us('ca-derivative-inverse', {
  points: 2,
  levels: { 1: 'Linear and quadratic functions', 2: 'Cubic functions', 3: 'From a table of values' },
  generate(rng, level) {
    const a = rng.int(0, 3);
    if (level === 3) {
      const fa = rng.int(-5, 9), fpa = rng.nonZero(-6, 6);
      const ans = new Q(1, fpa);
      return {
        body: `${math('f')} is invertible, with ${math(`f(${a}) = ${fa}`)} and ${math(`f'(${a}) = ${fpa}`)}. Find ${math(`(f^(-1))'(${fa})`)}.`,
        answer: math(ans.typst()), distractors: wrong(math(ans.typst()), [new Q(fpa), new Q(1, fa || 2), new Q(-1, fpa)].map((q) => math(q.typst()))),
        solution: `${math(`(f^(-1))'(${fa}) = 1/(f'(${a})) = ${ans.typst()}`)}.`,
      };
    }
    // f increasing near a: f(x) = x³ + px + q (p ≥ 1) or a linear/quadratic with positive slope at a.
    const p = level === 2 ? [1, 0, rng.int(1, 5), rng.int(-9, 9)] : [1, rng.int(1, 4), rng.int(-5, 5)];
    const b = polyEval(p, a), slope = polyEval(polyD(p), a);
    const ans = new Q(1, slope);
    return {
      body: `Let ${math(`f(x) = ${poly(p)}`)}${level === 1 ? `, with ${math(`x >= ${a}`)}` : ''}. Find ${math(`(f^(-1))'(${b})`)}.`,
      answer: math(ans.typst()), distractors: wrong(math(ans.typst()), [new Q(slope), new Q(1, polyEval(polyD(p), b) || 1), new Q(1, b || 3)].map((q) => math(q.typst()))),
      solution: `${math(`f(${a}) = ${b}`)}, so ${math(`(f^(-1))'(${b}) = 1/(f'(${a})) = ${ans.typst()}`)}.`,
    };
  },
});

export const CALCULUS_DERIVATIVES = [
  caLimitDirect, caLimitPiecewise, caLimitRemovable, caLimitInfinite, caLimitInfinity,
  caDerivativeDefinition, caInstantaneousRate, caPowerRule, caHigherOrder, caProductRule, caQuotientRule, caChainRule, caRulesTable,
  caDerivativeTrig, caDerivativeInverseTrig, caDerivativeExpLn, caDerivativeOtherBase, caLogDifferentiation, caImplicit, caDerivativeInverse,
];
