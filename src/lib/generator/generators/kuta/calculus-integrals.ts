// Calculus: integration and differential equations, after Kuta's
// IntegrationIndefinite (power, exponential/log, trig, inverse trig, each with
// substitution), IntegrationByParts, IntegrationRiemann, IntegrationAreaByLimits,
// IntegrationRiemannTable, IntegrationFirstTheorem, IntegrationDefiniteSubs,
// IntegrationMVT, IntegrationSecondTheorem, IntegrationAreaUnderCurve,
// IntegrationAreaBetweenCurves, IntegrationVolumeWashers/Cylinders/
// KnownCrossSections, IntegrationMotionLine, DiffEqSlopeField,
// DiffEqIntroduction, DiffEqSeparation, and DiffEqExpGrowthDecay.
import type { Rng } from '../../rng.ts';
import { Q } from '../../exact.ts';
import { poly } from '../../format.ts';
import { graphTypst } from '../../graph.ts';
import { optOne, radioOption } from '../../options.ts';
import { fromRoots, polyEval, polyMul } from '../pc40s/functions.ts';
import { us, math, task, wrong, decimal, fixed } from './common.ts';
import { iPow, polyD, polyI, polyQ, polyQText, powsText, type Pow } from './calc-common.ts';

const C = ' + C';
/** A coefficient in front of a function: `3`, `-`, `` for 1, `1/2 ` for fractions. */
const k = (c: number | Q) => { const q = Q.of(c); return q.eq(1) ? '' : q.eq(-1) ? '-' : q.isInt ? q.typst() : `${q.typst()} `; };
/** q·π as Typst: `pi`, `3pi`, `(5pi)/2`. */
const piTimes = (q: Q) => (q.eq(0) ? '0' : q.d === 1 ? `${k(q)}pi` : `${q.n < 0 ? '-' : ''}(${Math.abs(q.n) === 1 ? '' : Math.abs(q.n)}pi)/${q.d}`);
const integrand = (f: string, v = 'x') => `integral ${f} dif ${v}`;

// ── Indefinite integrals ─────────────────────────────────────────────────────

export const caIntegralPower = us('ca-integral-power', {
  levels: { 1: 'Polynomials', 2: 'Negative exponents', 3: 'Roots and fractional exponents' },
  generate(rng, level) {
    const exps = level === 1 ? [rng.int(2, 5), rng.int(0, 1)] : level === 2 ? [rng.int(1, 3), -rng.int(2, 4)] : [rng.pick([1 / 2, 3 / 2, 1 / 3]), -rng.pick([1 / 2, 2])];
    const terms: Pow[] = [...new Set(exps)].map((n) => ({ c: new Q(rng.nonZero(-8, 8) * (n > 1 ? Math.round(n + 1) : 1)), n: new Q(Math.round(n * 6), 6) }));
    const radical = level > 1;
    const f = powsText(terms, 'x', radical);
    const F = powsText(terms.map(iPow), 'x', radical);
    const noDivide = terms.map((t) => ({ c: t.c, n: t.n.add(1) }));
    const derivative = terms.map((t) => ({ c: t.c.mul(t.n), n: t.n.sub(1) }));
    return task('Evaluate each indefinite integral.', 'Evaluate', integrand(`(${f})`), {
      answer: math(F + C),
      distractors: wrong(math(F + C), [noDivide, derivative, terms.map((t) => ({ c: t.c.div(t.n.eq(0) ? 1 : t.n), n: t.n.add(1) }))].map((ts) => math(powsText(ts, 'x', radical) + C))),
      solution: `Rewrite each term as ${math('c x^n')} and use ${math('integral x^n dif x = x^(n + 1)/(n + 1) + C')}: ${math(F + C)}.`,
    });
  },
});

export const caIntegralExpLog = us('ca-integral-exp-log', {
  levels: { 1: 'e^x and 1/x', 2: 'e^(ax) and a/x', 3: 'Other bases' },
  generate(rng, level) {
    const a = level === 1 ? 1 : rng.int(2, 6), c = rng.int(1, 9);
    const form = rng.pick(level === 3 ? ['base', 'base'] : ['exp', 'recip']);
    if (form === 'exp') {
      const ans = `${k(new Q(c, a))}e^(${a === 1 ? '' : a}x)`.replace('e^(x)', 'e^x') + C;
      return task('Evaluate each indefinite integral.', 'Evaluate', integrand(`${k(c)}e^(${a === 1 ? '' : a}x)`.replace('e^(x)', 'e^x')), {
        answer: math(ans), distractors: wrong(math(ans), [`${k(c * a)}e^(${a === 1 ? '' : a}x)`.replace('e^(x)', 'e^x') + C, `${k(c)}e^(${a === 1 ? '' : a}x)`.replace('e^(x)', 'e^x') + C, `${k(new Q(c, a + 1))}e^(${a + 1}x)` + C].map(math)),
        solution: `${math('integral e^(a x) dif x = 1/a e^(a x) + C')}: ${math(ans)}.`,
      });
    }
    if (form === 'recip') {
      const ans = `${k(c)}ln |x|` + C;
      return task('Evaluate each indefinite integral.', 'Evaluate', integrand(`${c}/x`), {
        answer: math(ans), distractors: wrong(math(ans), [`${k(c)}ln x^2` + C, `-${c}/x^2` + C, `${k(c)}x ln x` + C].map(math)),
        solution: `${math('integral 1/x dif x = ln |x| + C')}: ${math(ans)}.`,
      });
    }
    const b = rng.pick([2, 3, 5, 10]);
    const ans = `${b}^x/(ln ${b})` + C;
    return task('Evaluate each indefinite integral.', 'Evaluate', integrand(`${b}^x`), {
      answer: math(ans), distractors: wrong(math(ans), [`${b}^x ln ${b}` + C, `${b}^(x + 1)/(x + 1)` + C, `${b}^x` + C].map(math)),
      solution: `${math('integral a^x dif x = a^x/(ln a) + C')}: ${math(ans)}.`,
    });
  },
});

export const caIntegralTrig = us('ca-integral-trig', {
  levels: { 1: 'sin and cos', 2: 'sec², csc², sec tan, csc cot', 3: 'With a coefficient inside, ax' },
  generate(rng, level) {
    const a = level === 3 ? rng.int(2, 5) : 1, c = rng.int(1, 6) * rng.sign();
    const arg = a === 1 ? 'x' : `${a}x`;
    const q = new Q(c, a);
    // integrand → [antiderivative function, its sign]
    const table: Record<string, [string, string, number]> = {
      sin: [`sin ${arg}`, `cos ${arg}`, -1],
      cos: [`cos ${arg}`, `sin ${arg}`, 1],
      sec2: [`sec^2 ${arg}`, `tan ${arg}`, 1],
      csc2: [`csc^2 ${arg}`, `cot ${arg}`, -1],
      sectan: [`sec ${arg} tan ${arg}`, `sec ${arg}`, 1],
      csccot: [`csc ${arg} cot ${arg}`, `csc ${arg}`, -1],
    };
    const key = rng.pick(level === 1 ? ['sin', 'cos'] : level === 2 ? ['sec2', 'csc2', 'sectan', 'csccot'] : Object.keys(table));
    const [fx, G, sign] = table[key];
    const F = `${k(q.mul(sign))}${G}`;
    const signSlip = `${k(q.mul(-sign))}${G}`, noDivide = `${k(c * sign)}${G}`;
    const [, otherG, otherSign] = table[rng.pick(Object.keys(table).filter((x) => x !== key))];
    return task('Evaluate each indefinite integral.', 'Evaluate', integrand(`${k(c)}${fx}`), {
      answer: math(F + C), distractors: wrong(math(F + C), [signSlip, noDivide, `${k(q.mul(otherSign))}${otherG}`, `${k(q.mul(-otherSign))}${otherG}`].map((t) => math(t + C))),
      solution: `Reverse the derivative rule for ${math(G)}${a === 1 ? '' : `, dividing by ${a} for the inner ${math(arg)}`}: ${math(F + C)}.`,
    });
  },
});

export const caIntegralInverseTrig = us('ca-integral-inverse-trig', {
  levels: { 1: '1/(1 + x²) and 1/√(1 − x²)', 2: '1/(a² + x²) and 1/√(a² − x²)', 3: 'With a coefficient in the numerator' },
  generate(rng, level) {
    const a = level === 1 ? 1 : rng.int(2, 6), c = level === 3 ? rng.int(2, 9) : 1;
    const tan = rng.next() < 0.5;
    const f = tan ? `${c}/(${a === 1 ? '1' : a * a} + x^2)` : `${c}/sqrt(${a === 1 ? '1' : a * a} - x^2)`;
    const inside = a === 1 ? 'x' : `x/${a}`;
    const ans = (tan ? `${k(new Q(c, a))}arctan ${a === 1 ? 'x' : `(${inside})`}` : `${k(c)}arcsin ${a === 1 ? 'x' : `(${inside})`}`) + C;
    return task('Evaluate each indefinite integral.', 'Evaluate', integrand(f), {
      answer: math(ans),
      distractors: wrong(math(ans), [(tan ? `${k(c)}arctan ${a === 1 ? 'x' : `(${inside})`}` : `${k(new Q(c, a))}arcsin ${a === 1 ? 'x' : `(${inside})`}`) + C, (tan ? `${k(new Q(c, a))}arcsin ${a === 1 ? 'x' : `(${inside})`}` : `${k(c)}arctan ${a === 1 ? 'x' : `(${inside})`}`) + C, `${k(c)}ln(${a === 1 ? '1' : a * a} ${tan ? '+' : '-'} x^2)` + C].map(math)),
      solution: tan ? `${math('integral 1/(a^2 + x^2) dif x = 1/a arctan(x/a) + C')}: ${math(ans)}.` : `${math('integral 1/sqrt(a^2 - x^2) dif x = arcsin(x/a) + C')}: ${math(ans)}.`,
    });
  },
});

export const caIntegralSubstitution = us('ca-integral-substitution', {
  levels: { 1: '(ax + b)ⁿ', 2: 'x(ax² + b)ⁿ', 3: 'x²(ax³ + b)ⁿ and roots' },
  generate(rng, level) {
    const n = level === 3 && rng.next() < 0.4 ? new Q(1, 2) : new Q(rng.int(2, 6));
    const a = rng.int(1, 4) * rng.sign(), b = rng.nonZero(-9, 9);
    const deg = level;
    const inner = poly(deg === 1 ? [a, b] : deg === 2 ? [a, 0, b] : [a, 0, 0, b]);
    const outside = deg === 1 ? '' : deg === 2 ? 'x' : 'x^2';
    const du = a * deg; // du = deg·a·x^(deg−1) dx
    const coef = new Q(1, du).div(n.add(1));
    const powText = (e: Q) => (e.isInt ? String(e.n) : `(${e.typst()})`);
    const f = n.isInt ? `${outside}(${inner})^${n.n}` : `${outside} sqrt(${inner})`;
    const ans = `${k(coef)}(${inner})^${powText(n.add(1))}` + C;
    return task('Evaluate each indefinite integral.', 'Evaluate', integrand(f.trim()), {
      answer: math(ans),
      distractors: wrong(math(ans), [`${k(new Q(1).div(n.add(1)))}(${inner})^${powText(n.add(1))}` + C, `${k(new Q(du).div(n.add(1)))}(${inner})^${powText(n.add(1))}` + C, `${k(coef)}(${inner})^${powText(n)}` + C].map(math)),
      solution: `Let ${math(`u = ${inner}`)}, so ${math(`dif u = ${deg === 1 ? a : `${du}${deg === 2 ? 'x' : 'x^2'}`} dif x`)}. Then the integral is ${math(`${k(new Q(1, du))}integral u^${powText(n)} dif u = ${ans}`)}.`,
    });
  },
});

export const caIntegralExpLogSubstitution = us('ca-integral-exp-log-substitution', {
  levels: { 1: 'e^(ax + b)', 2: 'x e^(ax²) and x/(x² + a)', 3: "f'(x)/f(x) in general" },
  generate(rng, level) {
    const a = rng.int(2, 5) * rng.sign(), b = rng.int(-6, 6);
    if (level === 1) {
      const p = poly([a, b]);
      const ans = `${k(new Q(1, a))}e^(${p})` + C;
      return task('Evaluate each indefinite integral.', 'Evaluate', integrand(`e^(${p})`), { answer: math(ans), distractors: wrong(math(ans), [`${a}e^(${p})` + C, `e^(${p})` + C, `${k(new Q(-1, a))}e^(${p})` + C].map(math)), solution: `Let ${math(`u = ${p}`)}, ${math(`dif u = ${a} dif x`)}: ${math(ans)}.` });
    }
    if (level === 2) {
      if (rng.next() < 0.5) {
        const ans = `${k(new Q(1, 2 * a))}e^(${a}x^2)` + C;
        return task('Evaluate each indefinite integral.', 'Evaluate', integrand(`x e^(${a}x^2)`), { answer: math(ans), distractors: wrong(math(ans), [`${2 * a}e^(${a}x^2)` + C, `1/2 x^2 e^(${a}x^2)` + C, `e^(${a}x^2)` + C].map(math)), solution: `Let ${math(`u = ${a}x^2`)}, ${math(`dif u = ${2 * a}x dif x`)}: ${math(ans)}.` });
      }
      const m = Math.abs(a);
      const ans = `1/2 ln(x^2 + ${m})` + C;
      return task('Evaluate each indefinite integral.', 'Evaluate', integrand(`x/(x^2 + ${m})`), { answer: math(ans), distractors: wrong(math(ans), [`ln(x^2 + ${m})` + C, `2 ln(x^2 + ${m})` + C, `${k(new Q(1, m))}arctan x` + C].map(math)), solution: `Let ${math(`u = x^2 + ${m}`)}, ${math('dif u = 2x dif x')}: ${math(`1/2 integral (dif u)/u = ${ans}`)}.` });
    }
    const g = [1, 0, rng.int(1, 5), rng.int(1, 9)];
    const gp = polyD(g);
    const ans = `ln |${poly(g)}|` + C;
    return task('Evaluate each indefinite integral.', 'Evaluate', integrand(`(${poly(gp)})/(${poly(g)})`), { answer: math(ans), distractors: wrong(math(ans), [`ln |${poly(gp)}|` + C, `1/(${poly(g)})^2` + C, `(${poly(g)}) ln |x|` + C].map(math)), solution: `The numerator is the derivative of the denominator, so ${math(`integral (f'(x))/(f(x)) dif x = ln |f(x)| + C`)}: ${math(ans)}.` });
  },
});

export const caIntegralTrigSubstitution = us('ca-integral-trig-substitution', {
  levels: { 1: 'sin(ax + b) and cos(ax + b)', 2: 'x cos(x²) and x sin(x²)', 3: 'sinⁿx cos x and tan x' },
  generate(rng, level) {
    if (level === 3) {
      const n = rng.int(2, 5);
      const forms: Array<[string, string, string[]]> = [
        [`sin^${n} x cos x`, `1/${n + 1} sin^${n + 1} x`, [`1/${n} sin^${n} x`, `-1/${n + 1} cos^${n + 1} x`, `sin^${n + 1} x cos x`]],
        [`cos^${n} x sin x`, `-1/${n + 1} cos^${n + 1} x`, [`1/${n + 1} cos^${n + 1} x`, `1/${n + 1} sin^${n + 1} x`, `-cos^${n + 1} x`]],
        ['tan x', '-ln |cos x|', ['ln |cos x|', 'sec^2 x', 'ln |sin x|']],
      ];
      const [f, F, wr] = rng.pick(forms);
      return task('Evaluate each indefinite integral.', 'Evaluate', integrand(f), { answer: math(F + C), distractors: wrong(math(F + C), wr.map((t) => math(t + C))), solution: `Substitute ${math(f.startsWith('tan') ? 'u = cos x' : f.startsWith('sin') ? 'u = sin x' : 'u = cos x')}: ${math(F + C)}.` });
    }
    const a = rng.int(2, 6), b = rng.int(-5, 5);
    const sin = rng.next() < 0.5;
    if (level === 2) {
      const ans = sin ? '-1/2 cos(x^2)' : '1/2 sin(x^2)';
      return task('Evaluate each indefinite integral.', 'Evaluate', integrand(`x ${sin ? 'sin' : 'cos'}(x^2)`), { answer: math(ans + C), distractors: wrong(math(ans + C), [sin ? '1/2 cos(x^2)' : '-1/2 sin(x^2)', sin ? '-2cos(x^2)' : '2sin(x^2)', sin ? '-cos(x^2)' : 'sin(x^2)'].map((t) => math(t + C))), solution: `Let ${math('u = x^2')}, ${math('dif u = 2x dif x')}: ${math(ans + C)}.` });
    }
    const p = poly([a, b]);
    const ans = sin ? `-1/${a} cos(${p})` : `1/${a} sin(${p})`;
    return task('Evaluate each indefinite integral.', 'Evaluate', integrand(`${sin ? 'sin' : 'cos'}(${p})`), { answer: math(ans + C), distractors: wrong(math(ans + C), [sin ? `1/${a} cos(${p})` : `-1/${a} sin(${p})`, sin ? `-${a}cos(${p})` : `${a}sin(${p})`, sin ? `-cos(${p})` : `sin(${p})`].map((t) => math(t + C))), solution: `Let ${math(`u = ${p}`)}, ${math(`dif u = ${a} dif x`)}: ${math(ans + C)}.` });
  },
});

export const caIntegralInverseTrigSubstitution = us('ca-integral-inverse-trig-substitution', {
  levels: { 1: 'Linear inside: 1/(1 + (ax)²)', 2: 'x/(1 + x⁴) and eˣ/(1 + e²ˣ)', 3: 'Complete the square' },
  generate(rng, level) {
    if (level === 1) {
      const a = rng.int(2, 6);
      const ans = `${k(new Q(1, a))}arctan(${a}x)`;
      return task('Evaluate each indefinite integral.', 'Evaluate', integrand(`1/(1 + ${a * a}x^2)`), { answer: math(ans + C), distractors: wrong(math(ans + C), [`arctan(${a}x)`, `${a}arctan(${a}x)`, `${k(new Q(1, a * a))}arctan x`].map((t) => math(t + C))), solution: `Let ${math(`u = ${a}x`)}, ${math(`dif u = ${a} dif x`)}: ${math(ans + C)}.` });
    }
    if (level === 2) {
      const forms: Array<[string, string, string[]]> = [
        ['x/(1 + x^4)', '1/2 arctan(x^2)', ['arctan(x^2)', '2arctan(x^2)', '1/4 ln(1 + x^4)']],
        ['e^x/(1 + e^(2x))', 'arctan(e^x)', ['ln(1 + e^(2x))', '1/2 arctan(e^x)', 'arcsin(e^x)']],
        ['x/sqrt(1 - x^4)', '1/2 arcsin(x^2)', ['arcsin(x^2)', '2arcsin(x^2)', '-sqrt(1 - x^4)']],
      ];
      const [f, F, wr] = rng.pick(forms);
      return task('Evaluate each indefinite integral.', 'Evaluate', integrand(f), { answer: math(F + C), distractors: wrong(math(F + C), wr.map((t) => math(t + C))), solution: `Substitute for the inner function so the integral becomes a standard inverse trigonometric form: ${math(F + C)}.` });
    }
    const h = rng.int(-4, 4), a = rng.int(1, 4);
    // x² − 2hx + h² + a²  →  (x − h)² + a²
    const den = poly([1, -2 * h, h * h + a * a]);
    const inside = h === 0 ? 'x' : poly([1, -h]);
    const ans = `${k(new Q(1, a))}arctan(${a === 1 ? inside : `(${inside})/${a}`})`;
    return task('Evaluate each indefinite integral.', 'Evaluate', integrand(`1/(${den})`), { answer: math(ans + C), distractors: wrong(math(ans + C), [`arctan(${a === 1 ? inside : `(${inside})/${a}`})`, `${k(new Q(1, a))}arctan(${a === 1 ? poly([1, h]) : `(${poly([1, h])})/${a}`})`, `ln |${den}|`].map((t) => math(t + C))), solution: `Complete the square: ${math(`${den} = (${inside})^2 + ${a * a}`)}. Then ${math('integral 1/(u^2 + a^2) dif u = 1/a arctan(u/a)')}: ${math(ans + C)}.` });
  },
});

export const caIntegrationByParts = us('ca-integration-by-parts', {
  points: 2,
  levels: { 1: 'x e^(ax)', 2: 'x sin(ax) and x cos(ax)', 3: 'ln x and xⁿ ln x' },
  generate(rng, level) {
    const a = rng.int(1, 4);
    const ax = a === 1 ? 'x' : `${a}x`;
    const forms: Array<[string, string, string[]]> = level === 1
      ? [[`x e^(${ax})`.replace('e^(x)', 'e^x'), `${k(new Q(1, a))}x e^(${ax}) - ${k(new Q(1, a * a))}e^(${ax})`.replace(/e\^\(x\)/g, 'e^x'), [`x e^(${ax}) - e^(${ax})`.replace(/e\^\(x\)/g, 'e^x'), `1/2 x^2 e^(${ax})`.replace('e^(x)', 'e^x'), `${k(new Q(1, a))}x e^(${ax}) + ${k(new Q(1, a * a))}e^(${ax})`.replace(/e\^\(x\)/g, 'e^x')]]]
      : level === 2
        ? [[`x cos ${ax}`, `${k(new Q(1, a))}x sin ${ax} + ${k(new Q(1, a * a))}cos ${ax}`, [`${k(new Q(1, a))}x sin ${ax} - ${k(new Q(1, a * a))}cos ${ax}`, `x sin ${ax} + cos ${ax}`, `1/2 x^2 sin ${ax}`]],
           [`x sin ${ax}`, `-${k(new Q(1, a))}x cos ${ax} + ${k(new Q(1, a * a))}sin ${ax}`, [`${k(new Q(1, a))}x cos ${ax} - ${k(new Q(1, a * a))}sin ${ax}`, `-x cos ${ax} + sin ${ax}`, `-1/2 x^2 cos ${ax}`]]]
        : [['ln x', 'x ln x - x', ['x ln x + x', '1/x', 'x ln x']],
           ['x ln x', '1/2 x^2 ln x - 1/4 x^2', ['1/2 x^2 ln x + 1/4 x^2', 'x ln x - x', '1/2 x^2 ln x']],
           ['x^2 ln x', '1/3 x^3 ln x - 1/9 x^3', ['1/3 x^3 ln x + 1/9 x^3', '1/3 x^3 ln x - 1/3 x^3', 'x^2 ln x - x^2']]];
    const [f, F, wr] = rng.pick(forms);
    return task('Evaluate each indefinite integral using integration by parts.', 'Evaluate', integrand(f), {
      answer: math(F.replace(/--/g, '') + C), distractors: wrong(math(F + C), wr.map((t) => math(t + C))),
      solution: `${math('integral u dif v = u v - integral v dif u')} with ${math(level === 3 ? 'u = ln x' : 'u = x')}: ${math(F + C)}.`,
    });
  },
});

// ── Riemann sums and definite integrals ──────────────────────────────────────

export const caRiemann = us('ca-riemann', {
  points: 2,
  levels: { 1: 'Left and right endpoints', 2: 'Midpoints', 3: 'Trapezoidal rule' },
  options: [radioOption('method', 'Method', [['left', 'Left endpoints'], ['right', 'Right endpoints'], ['mid', 'Midpoints'], ['trap', 'Trapezoids']], ['left', 'mid', 'trap'])],
  generate(rng, level, o) {
    const method = optOne(o, 'method', ['left', 'mid', 'trap'][level - 1]);
    const m = level === 1 && method === 'left' && rng.next() < 0.5 ? 'right' : method;
    const f = [rng.int(1, 2) * (rng.next() < 0.3 ? -1 : 1), rng.int(-3, 3), rng.int(5, 15)];
    const a = rng.int(-2, 1), n = rng.pick([2, 3, 4]), dx = rng.int(1, 2), b = a + n * dx;
    const xs = Array.from({ length: n + 1 }, (_, i) => a + i * dx);
    const val = m === 'left' ? xs.slice(0, -1).reduce((s, x) => s + polyEval(f, x) * dx, 0)
      : m === 'right' ? xs.slice(1).reduce((s, x) => s + polyEval(f, x) * dx, 0)
        : m === 'mid' ? xs.slice(0, -1).reduce((s, x) => s + polyEval(f, x + dx / 2) * dx, 0)
          : xs.slice(0, -1).reduce((s, x) => s + ((polyEval(f, x) + polyEval(f, x + dx)) / 2) * dx, 0);
    const exact = polyI(f), I = polyQ(exact, b).sub(polyQ(exact, a)).value;
    const words = { left: 'a left Riemann sum', right: 'a right Riemann sum', mid: 'a midpoint Riemann sum', trap: 'the trapezoidal rule' }[m];
    const others = ['left', 'right', 'mid', 'trap'].filter((x) => x !== m).map((x) => (x === 'left' ? xs.slice(0, -1).reduce((s, t) => s + polyEval(f, t) * dx, 0) : x === 'right' ? xs.slice(1).reduce((s, t) => s + polyEval(f, t) * dx, 0) : x === 'mid' ? xs.slice(0, -1).reduce((s, t) => s + polyEval(f, t + dx / 2) * dx, 0) : xs.slice(0, -1).reduce((s, t) => s + ((polyEval(f, t) + polyEval(f, t + dx)) / 2) * dx, 0)));
    return {
      body: `Use ${words} with ${n} equal subintervals to approximate ${math(`integral_(${a})^(${b}) (${poly(f)}) dif x`)}.`,
      answer: math(decimal(val, 3)),
      distractors: wrong(math(decimal(val, 3)), [...others, I].map((v) => math(decimal(v, 3)))).slice(0, 4),
      solution: `${math(`Delta x = ${dx}`)}; evaluate ${math('f')} at the ${m === 'mid' ? 'midpoints' : m === 'trap' ? 'endpoints (inner ones counted twice, then halved)' : `${m} endpoints`} and add: ${math(decimal(val, 3))}.`,
    };
  },
});

export const caAreaLimit = us('ca-area-limit', {
  points: 3,
  levels: { 1: 'Linear functions', 2: 'Quadratic functions', 3: 'Any interval' },
  generate(rng, level) {
    const f = level === 1 ? [rng.int(1, 5), rng.int(0, 6)] : [rng.int(1, 3), 0, rng.int(0, 6)];
    const a = level === 3 ? rng.int(1, 2) : 0, b = a + rng.int(1, 4);
    const F = polyI(f);
    const area = polyQ(F, b).sub(polyQ(F, a));
    const dx = `${b - a}/n`;
    return {
      body: `Find the area under ${math(`f(x) = ${poly(f)}`)} on ${math(`[${a}, ${b}]`)} as the limit of a Riemann sum with ${math('n')} rectangles (right endpoints).`,
      answer: math(area.typst()),
      distractors: wrong(math(area.typst()), [area.add(polyEval(f, b) - polyEval(f, a)), new Q(polyEval(f, b) * (b - a)), area.mul(2)].map((q) => math(q.typst()))),
      solution: `${math(`Delta x = ${dx}`)} and ${math(`x_i = ${a === 0 ? '' : `${a} + `}(${b - a === 1 ? '' : b - a}i)/n`)}. Expand ${math('sum_(i = 1)^n f(x_i) Delta x')} using ${math('sum i = (n(n + 1))/2')}${level > 1 ? ` and ${math('sum i^2 = (n(n + 1)(2n + 1))/6')}` : ''}, then let ${math('n -> oo')}: ${math(area.typst())}.`,
    };
  },
});

export const caRiemannTable = us('ca-riemann-table', {
  points: 2,
  levels: { 1: 'Left and right sums', 2: 'Unequal widths', 3: 'Trapezoids, unequal widths' },
  generate(rng, level) {
    const n = 4;
    const xs = [0];
    for (let i = 0; i < n; i++) xs.push(xs[i] + (level === 1 ? 2 : rng.int(1, 4)));
    const ys = xs.map(() => rng.int(2, 30));
    const m = level === 3 ? 'trap' : rng.pick(['left', 'right']);
    const w = xs.slice(1).map((x, i) => x - xs[i]);
    const val = m === 'left' ? w.reduce((s, d, i) => s + d * ys[i], 0) : m === 'right' ? w.reduce((s, d, i) => s + d * ys[i + 1], 0) : w.reduce((s, d, i) => s + (d * (ys[i] + ys[i + 1])) / 2, 0);
    const table = `#table(columns: ${xs.length + 1}, align: center, inset: 5pt, [$t$ (min)], ${xs.map((x) => `[$${x}$]`).join(', ')}, [$r(t)$ (L/min)], ${ys.map((y) => `[$${y}$]`).join(', ')})`;
    const words = { left: 'a left Riemann sum', right: 'a right Riemann sum', trap: 'the trapezoidal rule' }[m];
    return {
      body: `Water flows into a tank at rate ${math('r(t)')} litres per minute, given in the table. Use ${words} with the intervals in the table to estimate the total water that flows in from ${math(`t = 0`)} to ${math(`t = ${xs[n]}`)}.\n\n${table}`,
      answer: `${math(decimal(val))} L`,
      distractors: wrong(`${math(decimal(val))} L`, [w.reduce((s, d, i) => s + d * ys[i], 0), w.reduce((s, d, i) => s + d * ys[i + 1], 0), w.reduce((s, d, i) => s + (d * (ys[i] + ys[i + 1])) / 2, 0), ys.reduce((s, y) => s + y, 0)].map((v) => `${math(decimal(v))} L`)).slice(0, 4),
      solution: `Multiply each ${m === 'trap' ? 'average of the two endpoint rates' : `${m}-endpoint rate`} by the width of its interval and add: ${math(decimal(val))} L.`,
    };
  },
});

export const caDefiniteIntegral = us('ca-definite-integral', {
  levels: { 1: 'Polynomials', 2: 'Negative exponents and roots', 3: 'Trigonometric and exponential functions' },
  generate(rng, level) {
    if (level === 3) {
      const forms: Array<[string, string, string[], string]> = [
        ['integral_0^(pi/2) cos x dif x', '1', ['0', '-1', 'pi/2'], '[sin x]_0^(pi/2) = 1 - 0'],
        ['integral_0^pi sin x dif x', '2', ['0', '-2', '1'], '[-cos x]_0^pi = 1 - (-1)'],
        ['integral_0^1 e^x dif x', 'e - 1', ['e', '1', 'e + 1'], '[e^x]_0^1 = e - 1'],
        ['integral_1^e 1/x dif x', '1', ['e', '0', 'e - 1'], '[ln x]_1^e = 1 - 0'],
        ['integral_0^(pi/4) sec^2 x dif x', '1', ['sqrt(2)', '0', 'pi/4'], '[tan x]_0^(pi/4) = 1 - 0'],
      ];
      const [e, v, wr, s] = rng.pick(forms);
      return task('Evaluate each definite integral.', 'Evaluate', e, { answer: math(v), distractors: wrong(math(v), wr.map(math)), solution: `${math(s)} ${math(`= ${v}`)}.` });
    }
    const a = level === 2 ? rng.int(1, 2) : rng.int(-2, 1), b = a + rng.int(1, 3);
    const terms: Pow[] = level === 1 ? [{ c: new Q(rng.nonZero(-4, 4) * 3), n: new Q(2) }, { c: new Q(rng.int(-6, 6) * 2), n: new Q(1) }, { c: new Q(rng.int(-5, 5)), n: new Q(0) }] : [{ c: new Q(rng.nonZero(-4, 4)), n: new Q(-2) }, { c: new Q(rng.int(1, 6) * 2), n: new Q(1) }];
    const F = terms.map(iPow);
    const val = (x: number) => F.reduce((s, t) => s.add(t.c.mul(new Q(x).value ** t.n.value)), new Q(0));
    const exact = level === 2 ? F.reduce((s, t) => s.add(t.c.mul(t.n.n < 0 ? new Q(1, b) : new Q(b ** t.n.n)).sub(t.c.mul(t.n.n < 0 ? new Q(1, a) : new Q(a ** t.n.n)))), new Q(0)) : val(b).sub(val(a));
    return task('Evaluate each definite integral.', 'Evaluate', `integral_(${a})^(${b}) (${powsText(terms, 'x', level === 2)}) dif x`, {
      answer: math(exact.typst()),
      distractors: wrong(math(exact.typst()), [exact.neg(), level === 2 ? exact.add(1) : val(b).add(val(a)), level === 2 ? exact.mul(2) : val(b)].map((q) => math(q.typst()))),
      solution: `An antiderivative is ${math(`F(x) = ${powsText(F, 'x', level === 2)}`)}; ${math(`F(${b}) - F(${a}) = ${exact.typst()}`)}.`,
    });
  },
});

export const caDefiniteSubstitution = us('ca-definite-substitution', {
  points: 2,
  levels: { 1: 'x(x² + a)ⁿ', 2: 'Linear inside a power', 3: 'Exponential and trigonometric' },
  generate(rng, level) {
    if (level === 3) {
      const forms: Array<[string, string, string[], string]> = [
        ['integral_0^1 x e^(x^2) dif x', '(e - 1)/2', ['e - 1', '(e + 1)/2', 'e/2'], 'u = x^2", " dif u = 2x dif x", from 0 to 1"'],
        ['integral_0^(pi/2) sin x cos x dif x', '1/2', ['1', '0', '-1/2'], 'u = sin x", from 0 to 1"'],
        ['integral_0^(sqrt(pi)) x cos(x^2) dif x', '0', ['1', '1/2', '-1'], 'u = x^2", from 0 to" pi'],
      ];
      const [e, v, wr, s] = rng.pick(forms);
      return task('Evaluate each definite integral.', 'Evaluate', e, { answer: math(v), distractors: wrong(math(v), wr.map(math)), solution: `Substitute ${math(s)} and change the limits: ${math(v)}.` });
    }
    const n = rng.int(1, 3);
    if (level === 1) {
      const c = rng.int(0, 3), b = rng.int(1, 2);
      // ∫₀ᵇ x(x² + c)ⁿ dx = [(x² + c)^(n+1) / (2(n + 1))]₀ᵇ
      const val = new Q((b * b + c) ** (n + 1) - c ** (n + 1), 2 * (n + 1));
      return task('Evaluate each definite integral.', 'Evaluate', `integral_0^${b} x(${c ? poly([1, 0, c]) : 'x^2'})^${n} dif x`, {
        answer: math(val.typst()), distractors: wrong(math(val.typst()), [val.mul(2), new Q((b * b + c) ** (n + 1), 2 * (n + 1)), val.mul(n + 1)].map((q) => math(q.typst()))),
        solution: `Let ${math(`u = x^2 + ${c}`)}, ${math('dif u = 2x dif x')}; the limits become ${math(String(c))} and ${math(String(b * b + c))}: ${math(`1/2 integral_${c}^${b * b + c} ${n === 1 ? 'u' : `u^${n}`} dif u = ${val.typst()}`)}.`,
      });
    }
    const a = rng.int(1, 3), c = rng.int(-2, 2), b = rng.int(1, 2);
    const lo = c, hi = a * b + c;
    const val = new Q(hi ** (n + 1) - lo ** (n + 1), a * (n + 1));
    return task('Evaluate each definite integral.', 'Evaluate', `integral_0^${b} (${poly([a, c])})^${n} dif x`.replace(/\)\^1 /, ') '), {
      answer: math(val.typst()), distractors: wrong(math(val.typst()), [val.mul(a), new Q(hi ** (n + 1), a * (n + 1)), val.neg()].map((q) => math(q.typst()))),
      solution: `Let ${math(`u = ${poly([a, c])}`)}, ${math(`dif u = ${a} dif x`)}; the limits become ${math(String(lo))} and ${math(String(hi))}: ${math(`${k(new Q(1, a))}integral_(${lo})^(${hi}) u^${n} dif u = ${val.typst()}`.replace(/\^1 /, ' '))}.`,
    });
  },
});

export const caAverageValue = us('ca-average-value', {
  levels: { 1: 'Linear and quadratic', 2: 'Cubic', 3: 'Find c with f(c) equal to the average' },
  generate(rng, level) {
    const f = level === 2 ? [rng.nonZero(-2, 2), 0, rng.int(-4, 4), rng.int(-6, 6)] : [rng.nonZero(-3, 3), rng.int(-4, 4), rng.int(-6, 6)];
    const a = rng.int(-2, 1), b = a + rng.int(1, 4);
    const F = polyI(f);
    const avg = polyQ(F, b).sub(polyQ(F, a)).div(b - a);
    if (level === 3) {
      // Quadratic with b = 0 term so f(c) = avg is solvable: use f = p x² + q.
      const p = rng.nonZero(-3, 3), q = rng.int(-5, 5), L = rng.int(1, 3);
      const g = [p, 0, q];
      const av = polyQ(polyI(g), L).sub(polyQ(polyI(g), -L)).div(2 * L); // = p L²/3 + q
      const cText = `plus.minus ${L}/sqrt(3)`;
      return {
        body: `Find the values of ${math('c')} that satisfy the Mean Value Theorem for integrals for ${math(`f(x) = ${poly(g)}`)} on ${math(`[${-L}, ${L}]`)}.`,
        answer: math(`c = ${cText}`), distractors: wrong(math(`c = ${cText}`), [`c = 0`, `c = plus.minus ${L}/2`, `c = plus.minus ${L}`].map(math)),
        solution: `The average value is ${math(av.typst())}. Solve ${math(`${poly(g)} = ${av.typst()}`)}: ${math(`x^2 = ${new Q(L * L, 3).typst()}`)}, so ${math(`c = ${cText}`)}.`,
      };
    }
    return {
      body: `Find the average value of ${math(`f(x) = ${poly(f)}`)} on ${math(`[${a}, ${b}]`)}.`,
      answer: math(avg.typst()),
      distractors: wrong(math(avg.typst()), [avg.mul(b - a), new Q(polyEval(f, a) + polyEval(f, b), 2), new Q(polyEval(f, (a + b) / 2) * 2, 2)].map((q) => math(q.typst()))),
      solution: `${math(`1/(${b} - ${a < 0 ? `(${a})` : a}) integral_(${a})^(${b}) f(x) dif x = ${avg.typst()}`)}.`,
    };
  },
});

export const caFtcDerivative = us('ca-ftc-derivative', {
  levels: { 1: 'Upper limit x', 2: 'Upper limit a function of x', 3: 'Both limits functions of x' },
  generate(rng, level) {
    const kind = rng.pick(['poly', 'sqrt', 'cos', 'exp'] as const);
    const c0 = rng.int(1, 9);
    // The integrand with its variable replaced: a bare variable stays bare, anything else is bracketed.
    const ftOf = (u: string) => {
      const v = /^[a-z]$/.test(u) ? u : `(${u})`;
      return { poly: `${v}^2 + ${c0}`, sqrt: `sqrt(1 + ${v}^3)`, cos: `cos(${v}^2)`, exp: `e^(-${v}^2)` }[kind];
    };
    const ft = ftOf('t');
    if (level === 1) {
      const a = rng.int(0, 3);
      const ans = ftOf('x');
      return task('Find each derivative.', 'Find', `d/(dif x) integral_${a}^x ${ft} dif t`, { answer: math(ans), distractors: wrong(math(ans), [ft, ftOf(String(a)), `${ans} - ${ftOf(String(a))}`].map(math)), solution: `By the second Fundamental Theorem of Calculus, the derivative is the integrand evaluated at ${math('x')}: ${math(ans)}.` });
    }
    const g = rng.pick(['x^2', '3x', 'x^3', 'sin x']), gp = { 'x^2': '2x', '3x': '3', 'x^3': '3x^2', 'sin x': 'cos x' }[g];
    if (level === 2) {
      const ans = `${ftOf(g)} dot ${gp}`;
      return task('Find each derivative.', 'Find', `d/(dif x) integral_1^(${g}) ${ft} dif t`, { answer: math(ans), distractors: wrong(math(ans), [ftOf(g), ftOf('x'), `${ftOf('x')} dot ${gp}`].map(math)), solution: `Chain rule with the second Fundamental Theorem: ${math(`f(g(x)) g'(x) = ${ans}`)}.` });
    }
    const ans = `${ftOf(g)} dot ${gp} - ${ftOf('x')}`;
    return task('Find each derivative.', 'Find', `d/(dif x) integral_x^(${g}) ${ft} dif t`, { answer: math(ans), distractors: wrong(math(ans), [`${ftOf(g)} dot ${gp} + ${ftOf('x')}`, `${ftOf(g)} - ${ftOf('x')}`, `${ftOf(g)} dot ${gp}`].map(math)), solution: `Split at a constant: the upper limit contributes ${math(`${ftOf(g)} dot ${gp}`)} and the lower limit ${math(`-${ftOf('x')}`)}.` });
  },
});

// ── Area, volume, and motion ─────────────────────────────────────────────────

/** Two zeros of a parabola opening down, so the region above the axis is bounded. */
function capParabola(rng: Rng): { f: number[]; r: number; s: number } {
  const r = rng.int(-3, 1), s = r + rng.int(2, 5);
  return { f: fromRoots([r, s], -1), r, s };
}
const areaBetween = (top: number[], bottom: number[], a: number, b: number) => {
  const diff = top.map((c, i) => c - (bottom[i - (top.length - bottom.length)] ?? 0));
  const F = polyI(diff);
  return polyQ(F, b).sub(polyQ(F, a));
};

export const caAreaUnder = us('ca-area-under', {
  points: 2,
  levels: { 1: 'Over a given interval', 2: 'Between the x-intercepts', 3: 'A region below the x-axis' },
  generate(rng, level) {
    if (level === 1) {
      const f = [rng.int(1, 3), rng.int(0, 4), rng.int(1, 6)];
      const a = rng.int(0, 2), b = a + rng.int(1, 3);
      const A = areaBetween(f, [0], a, b);
      return { body: `Find the area of the region under ${math(`y = ${poly(f)}`)} and above the x-axis from ${math(`x = ${a}`)} to ${math(`x = ${b}`)}.`, answer: math(A.typst()), distractors: wrong(math(A.typst()), [A.mul(2), new Q(polyEval(f, b) * (b - a)), A.add(polyEval(f, a))].map((q) => math(q.typst()))), solution: `${math(`integral_${a}^${b} (${poly(f)}) dif x = ${A.typst()}`)}.` };
    }
    const { f, r, s } = capParabola(rng);
    const sign = level === 3 ? -1 : 1;
    const g = f.map((c) => c * sign);
    const A = areaBetween(f, [0], r, s);
    return {
      body: `Find the area of the region bounded by ${math(`y = ${poly(g)}`)} and the x-axis.`,
      answer: math(A.typst()), distractors: wrong(math(A.typst()), [A.neg(), A.mul(2), new Q(Math.abs(polyEval(g, (r + s) / 2)) * (s - r))].map((q) => math(q.typst()))),
      solution: `The curve meets the x-axis at ${math(`x = ${r}`)} and ${math(`x = ${s}`)}. ${level === 3 ? 'The region is below the axis, so the area is the negative of the integral: ' : ''}${math(`${level === 3 ? '-' : ''}integral_(${r})^(${s}) (${poly(g)}) dif x = ${A.typst()}`)}.`,
    };
  },
});

export const caAreaBetween = us('ca-area-between', {
  points: 3,
  levels: { 1: 'A parabola and a horizontal line', 2: 'A parabola and a line', 3: 'Two parabolas' },
  generate(rng, level) {
    const r = rng.int(-3, 1), s = r + rng.int(1, 4);
    // top − bottom = −(x − r)(x − s) (times k): positive between r and s.
    const kk = level === 3 ? rng.int(1, 2) : 1;
    const diff = fromRoots([r, s], -kk);
    const bottom = level === 1 ? [0, 0, rng.int(-4, 4)] : level === 2 ? [0, rng.int(-3, 3), rng.int(-4, 4)] : [rng.int(1, 2), rng.int(-3, 3), rng.int(-4, 4)];
    const top = diff.map((c, i) => c + bottom[i]);
    const A = areaBetween(diff, [0], r, s);
    const show = (p: number[]) => poly(p.slice(p.findIndex((c) => c !== 0)));
    return {
      body: `Find the area of the region bounded by ${math(`y = ${show(top)}`)} and ${math(`y = ${show(bottom)}`)}.`,
      answer: math(A.typst()), distractors: wrong(math(A.typst()), [A.mul(2), areaBetween(top, [0], r, s).abs(), A.add(1)].map((q) => math(q.typst()))),
      solution: `The curves meet where ${math(`${show(top)} = ${show(bottom)}`)}: ${math(`x = ${r}`)} and ${math(`x = ${s}`)}. ${math(`integral_(${r})^(${s}) [(${show(top)}) - (${show(bottom)})] dif x = ${A.typst()}`)}.`,
    };
  },
});

export const caVolumeWashers = us('ca-volume-washers', {
  points: 3,
  levels: { 1: 'Disks about the x-axis', 2: 'Washers about the x-axis', 3: 'Disks about the y-axis' },
  generate(rng, level) {
    if (level === 1) {
      const f = [rng.int(1, 3), rng.int(0, 3)], b = rng.int(1, 3);
      const sq = polyMul(f, f), F = polyI(sq);
      const V = polyQ(F, b).sub(polyQ(F, 0));
      return { body: `The region under ${math(`y = ${poly(f)}`)} from ${math('x = 0')} to ${math(`x = ${b}`)} is revolved about the x-axis. Find the volume.`, answer: math(piTimes(V)), distractors: wrong(math(piTimes(V)), [piTimes(V.mul(2)), piTimes(polyQ(polyI(f), b)), V.typst()].map(math)), solution: `${math(`V = pi integral_0^${b} (${poly(f)})^2 dif x = ${piTimes(V)}`)}.` };
    }
    if (level === 2) {
      // Between y = x (outer) and y = x²/b on [0, b]: π∫(x² − x⁴/b²) dx = π(b³/3 − b³/5).
      const b = rng.int(1, 3);
      const V = new Q(b ** 3, 3).sub(new Q(b ** 3, 5));
      return { body: `The region between ${math('y = x')} and ${math(`y = ${b === 1 ? 'x^2' : `x^2/${b}`}`)} is revolved about the x-axis. Find the volume.`, answer: math(piTimes(V)), distractors: wrong(math(piTimes(V)), [piTimes(new Q(b * b, 2).sub(new Q(b * b, 3))), piTimes(new Q(b ** 3, 3).add(new Q(b ** 3, 5))), piTimes(V.mul(2))].map(math)), solution: `The curves meet at ${math('x = 0')} and ${math(`x = ${b}`)}; outer radius ${math('x')}, inner radius ${math(b === 1 ? 'x^2' : `x^2/${b}`)}: ${math(`pi integral_0^${b} (x^2 - x^4/${b * b}) dif x = ${piTimes(V)}`.replace('/1)', ')'))}.` };
    }
    // y = x² from 0 to h about the y-axis: x = √y, V = π∫₀ʰ y dy = πh²/2.
    const h = rng.int(1, 9);
    const V = new Q(h * h, 2);
    return { body: `The region bounded by ${math('y = x^2')}, ${math(`y = ${h}`)}, and the y-axis is revolved about the y-axis. Find the volume.`, answer: math(piTimes(V)), distractors: wrong(math(piTimes(V)), [piTimes(new Q(h ** 3, 3)), piTimes(new Q(h * h)), piTimes(new Q(h ** 5, 5))].map(math)), solution: `Disks of radius ${math('x = sqrt(y)')}: ${math(`V = pi integral_0^${h} y dif y = ${piTimes(V)}`)}.` };
  },
});

export const caVolumeShells = us('ca-volume-shells', {
  points: 3,
  levels: { 1: 'Under a line, about the y-axis', 2: 'Under a parabola, about the y-axis', 3: 'Between curves, about the y-axis' },
  generate(rng, level) {
    let f: number[], a = 0, b: number;
    if (level === 1) { f = [rng.int(1, 4), rng.int(0, 3)]; b = rng.int(1, 3); }
    else if (level === 2) { const c = capParabola(rng); f = c.f; a = Math.max(0, c.r); b = c.s; if (b <= a) return caVolumeShells.generate(rng, 1); }
    else { b = rng.int(1, 3); f = [-1, b, 0]; } // x(b − x) is the gap between y = bx and y = x²
    const xf = polyMul([1, 0], f), F = polyI(xf);
    const V = polyQ(F, b).sub(polyQ(F, a)).mul(2);
    const label = level === 3 ? `between ${math(`y = ${b === 1 ? '' : b}x`)} and ${math('y = x^2')}` : `under ${math(`y = ${poly(f)}`)} from ${math(`x = ${a}`)} to ${math(`x = ${b}`)}`;
    return {
      body: `The region ${label} is revolved about the y-axis. Use cylindrical shells to find the volume.`,
      answer: math(piTimes(V)), distractors: wrong(math(piTimes(V)), [piTimes(V.div(2)), piTimes(polyQ(polyI(f), b).sub(polyQ(polyI(f), a)).mul(2)), piTimes(V.mul(2))].map(math)),
      solution: `${math(`V = 2pi integral_(${a})^(${b}) x (${poly(f)}) dif x = ${piTimes(V)}`)}.`,
    };
  },
});

export const caVolumeCrossSections = us('ca-volume-cross-sections', {
  points: 3,
  levels: { 1: 'Square cross sections', 2: 'Semicircle cross sections', 3: 'Equilateral triangle cross sections' },
  generate(rng, level) {
    // Base: the region under y = mx from 0 to b; cross sections perpendicular to the x-axis with side (or diameter) mx.
    const m = rng.int(1, 3), b = rng.int(1, 4);
    const s2 = new Q(m * m * b ** 3, 3); // ∫ (mx)² dx
    const V = level === 1 ? s2.typst() : level === 2 ? piTimes(s2.div(8)) : `${s2.div(4).typst()} sqrt(3)`.replace(/^1 /, '');
    const shape = ['squares', 'semicircles', 'equilateral triangles'][level - 1];
    return {
      body: `The base of a solid is the region between ${math(`y = ${m === 1 ? '' : m}x`)}, the x-axis, and ${math(`x = ${b}`)}. Cross sections perpendicular to the x-axis are ${shape} with one side (or diameter) in the base. Find the volume.`,
      answer: math(V), distractors: wrong(math(V), [s2.mul(2).typst(), piTimes(s2.div(2)), `${s2.typst()} sqrt(3)`, s2.div(2).typst()].map(math)).slice(0, 4),
      solution: `The side at ${math('x')} is ${math(`${m === 1 ? '' : m}x`)}, and the area is ${math(level === 1 ? 's^2' : level === 2 ? '1/8 pi s^2' : 'sqrt(3)/4 s^2')}. ${math(`V = integral_0^${b} ${level === 1 ? '' : level === 2 ? 'pi/8 ' : 'sqrt(3)/4 '}(${m === 1 ? '' : m}x)^2 dif x = ${V}`)}.`,
    };
  },
});

export const caMotionIntegral = us('ca-motion-integral', {
  points: 2,
  levels: { 1: 'Displacement', 2: 'Total distance', 3: 'Position from velocity and an initial position' },
  generate(rng, level) {
    const p = rng.int(1, 3), q = p + rng.int(1, 3);
    const v = fromRoots([p, q]); // velocity changes sign at p and q
    const T = q + rng.int(1, 2);
    const V = polyI(v);
    const disp = polyQ(V, T).sub(polyQ(V, 0));
    if (level === 3) {
      const s0 = rng.int(-5, 5);
      const pos = polyQText([...V.slice(0, -1), new Q(s0)], 't');
      return { body: `A particle has velocity ${math(`v(t) = ${poly(v, 't')}`)} and position ${math(`s(0) = ${s0}`)}. Find ${math('s(t)')}.`, answer: math(`s(t) = ${pos}`), distractors: wrong(math(`s(t) = ${pos}`), [`s(t) = ${poly(polyD(v), 't')}`, `s(t) = ${polyQText(V, 't')}`, `s(t) = ${polyQText([...V.slice(0, -1), new Q(-s0)], 't')}`].map(math)), solution: `Integrate and use ${math(`s(0) = ${s0}`)} to find the constant: ${math(`s(t) = ${pos}`)}.` };
    }
    if (level === 1) {
      return { body: `A particle moves with velocity ${math(`v(t) = ${poly(v, 't')}`)} m/s. Find its displacement from ${math('t = 0')} to ${math(`t = ${T}`)}.`, answer: `${math(disp.typst())} m`, distractors: wrong(`${math(disp.typst())} m`, [disp.neg(), new Q(polyEval(v, T)), new Q(polyEval(v, T) - polyEval(v, 0))].map((qq) => `${math(qq.typst())} m`)), solution: `${math(`integral_0^${T} (${poly(v, 't')}) dif t = ${disp.typst()}`)}.` };
    }
    const seg = (a: number, b: number) => polyQ(V, b).sub(polyQ(V, a)).abs();
    const dist = seg(0, p).add(seg(p, q)).add(seg(q, T));
    return { body: `A particle moves with velocity ${math(`v(t) = ${poly(v, 't')}`)} m/s. Find the total distance travelled from ${math('t = 0')} to ${math(`t = ${T}`)}.`, answer: `${math(dist.typst())} m`, distractors: wrong(`${math(dist.typst())} m`, [disp, disp.abs().add(1), seg(0, T)].map((qq) => `${math(qq.typst())} m`)), solution: `The velocity changes sign at ${math(`t = ${p}`)} and ${math(`t = ${q}`)}, so integrate ${math('|v(t)|')} piece by piece: ${math(dist.typst())} m.` };
  },
});

// ── Differential equations ───────────────────────────────────────────────────

const SLOPE_FIELDS: Array<[string, (x: number, y: number) => number]> = [
  ['x', (x) => x], ['y', (_, y) => y], ['x + y', (x, y) => x + y], ['x - y', (x, y) => x - y], ['x y', (x, y) => x * y], ['-x/y', (x, y) => (y === 0 ? NaN : -x / y)], ['y - x', (x, y) => y - x], ['2x', (x) => 2 * x],
];
function slopeField(fn: (x: number, y: number) => number): string {
  const curves: Array<{ points: Array<[number, number]> }> = [];
  for (let x = -3; x <= 3; x++) for (let y = -3; y <= 3; y++) {
    const m = fn(x, y);
    if (!Number.isFinite(m)) continue;
    const len = 0.35, dx = len / Math.sqrt(1 + m * m), dy = m * dx;
    curves.push({ points: [[x - dx, y - dy], [x + dx, y + dy]] });
  }
  return graphTypst({ xMin: -3.6, xMax: 3.6, yMin: -3.6, yMax: 3.6, width: 4, height: 4, xLabelStep: 1, yLabelStep: 1, grid: false, curves });
}

export const caSlopeField = us('ca-slope-field', {
  levels: { 1: 'Fields that depend on x or y only', 2: 'Fields that depend on x and y', 3: 'Any' },
  generate(rng, level) {
    const pool = level === 1 ? SLOPE_FIELDS.filter(([t]) => t.length <= 2) : level === 2 ? SLOPE_FIELDS.filter(([t]) => t.length > 2) : SLOPE_FIELDS;
    const [text, fn] = rng.pick(pool);
    const answer = math(`(d y)/(d x) = ${text}`);
    return {
      body: `Which differential equation matches the slope field?\n\n${slopeField(fn)}`,
      answer, distractors: wrong(answer, rng.shuffle(SLOPE_FIELDS.filter(([t]) => t !== text)).slice(0, 3).map(([t]) => math(`(d y)/(d x) = ${t}`))),
      solution: `Check a few points: the segments have the slope ${math(text)} at each grid point (for example, horizontal where ${math(`${text} = 0`)}).`,
    };
  },
});

export const caDeIntro = us('ca-de-intro', {
  levels: { 1: 'General solution of dy/dx = f(x)', 2: 'Particular solution with an initial condition', 3: 'Verify a solution' },
  generate(rng, level) {
    const f = [rng.nonZero(-4, 4) * 3, rng.int(-4, 4) * 2, rng.int(-5, 5)];
    const F = polyI(f);
    if (level === 3) {
      const kk = rng.int(2, 5);
      const pairs: Array<[string, string, boolean]> = [[`y = e^(${kk}x)`, `y' = ${kk}y`, true], [`y = e^(${kk}x)`, `y' = ${kk + 1}y`, false], [`y = sin ${kk}x`, `y'' = -${kk * kk}y`, true], [`y = cos ${kk}x`, `y'' = ${kk * kk}y`, false], [`y = x^${kk}`, `x y' = ${kk}y`, true]];
      const [sol, de, ok] = rng.pick(pairs);
      return { body: `Is ${math(sol)} a solution of ${math(de)}?`, answer: ok ? 'Yes' : 'No', distractors: [ok ? 'No' : 'Yes'], solution: `Substitute ${math(sol)} and its derivatives into ${math(de)}: both sides ${ok ? 'agree' : 'do not agree'}.` };
    }
    if (level === 1) {
      const ans = `y = ${polyQText(F)}${C}`;
      return task('Find the general solution of each differential equation.', 'Solve', `(d y)/(d x) = ${poly(f)}`, { answer: math(ans), distractors: wrong(math(ans), [`y = ${poly(polyD(f))}${C}`, `y = ${polyQText(F)}`, `y = ${poly([...f, 0])}${C}`].map(math)), solution: `Integrate: ${math(ans)}.` });
    }
    const x0 = rng.int(-2, 2), y0 = rng.int(-9, 9);
    const c = new Q(y0).sub(polyQ(F, x0));
    const ans = `y = ${polyQText([...F.slice(0, -1), c])}`;
    return task('Find the particular solution of each differential equation.', 'Solve', `(d y)/(d x) = ${poly(f)}", " y(${x0}) = ${y0}`, { answer: math(ans), distractors: wrong(math(ans), [`y = ${polyQText([...F.slice(0, -1), new Q(y0)])}`, `y = ${polyQText([...F.slice(0, -1), c.neg()])}`, `y = ${polyQText(F)}`].map(math)), solution: `Integrate and use ${math(`y(${x0}) = ${y0}`)} to find ${math(`C = ${c.typst()}`)}: ${math(ans)}.` });
  },
});

export const caDeSeparable = us('ca-de-separable', {
  points: 2,
  levels: { 1: 'dy/dx = ky', 2: 'dy/dx = x/y and xy', 3: 'With an initial condition' },
  generate(rng, level) {
    const kk = rng.nonZero(-4, 4);
    const kx = `${k(kk)}x`, ky = `${k(kk)}y`;
    const ex = (e: string) => (e === 'x' ? 'e^x' : `e^(${e})`);
    if (level === 1) {
      const ans = `y = C ${ex(kx)}`;
      return task('Find the general solution of each differential equation.', 'Solve', `(d y)/(d x) = ${ky}`, { answer: math(ans), distractors: wrong(math(ans), [`y = ${ex(kx)} + C`, `y = ${kx} + C`, `y = C x^${Math.abs(kk) + 1}`].map(math)), solution: `Separate: ${math(`(dif y)/y = ${kk} dif x`)}, so ${math(`ln |y| = ${kx} + C`)} and ${math(ans)}.` });
    }
    if (level === 2) {
      const forms: Array<[string, string, string[]]> = [
        ['x/y', 'y^2 = x^2 + C', ['y = x + C', 'y^2 = -x^2 + C', 'y = x^2/2 + C']],
        ['-x/y', 'x^2 + y^2 = C', ['y^2 = x^2 + C', 'y = -x + C', 'y = C e^(-x)']],
        ['x y', 'y = C e^(x^2/2)', ['y = C e^x', 'y = x^2/2 + C', 'y = C e^(x^2)']],
        ['y/x', 'y = C x', ['y = C e^x', 'y = x + C', 'y = ln |x| + C']],
      ];
      const [rhs, ans, wr] = rng.pick(forms);
      return task('Find the general solution of each differential equation.', 'Solve', `(d y)/(d x) = ${rhs}`, { answer: math(ans), distractors: wrong(math(ans), wr.map(math)), solution: `Separate the variables and integrate both sides: ${math(ans)}.` });
    }
    const y0 = rng.int(1, 9);
    const ans = `y = ${k(y0)}${ex(kx)}`;
    return task('Solve each initial value problem.', 'Solve', `(d y)/(d x) = ${ky}", " y(0) = ${y0}`, { answer: math(ans), distractors: wrong(math(ans), [`y = ${ex(kx)}${y0 > 1 ? ` + ${y0 - 1}` : ''}`, `y = ${k(y0)}${ex(`${k(-kk)}x`)}`, `y = ${k(kk)}${ex(`${k(y0)}x`)}`].map(math)), solution: `${math(`y = C ${ex(kx)}`)}; ${math(`y(0) = C = ${y0}`)}, so ${math(ans)}.` });
  },
});

export const caDeGrowth = us('ca-de-growth', {
  points: 2,
  levels: { 1: 'Find the amount', 2: 'Find the growth constant from data', 3: 'Half-life' },
  generate(rng, level) {
    if (level === 3) {
      const half = rng.int(2, 30), A0 = rng.int(1, 20) * 10, t = rng.int(1, 60);
      const A = A0 * 0.5 ** (t / half);
      return { body: `A substance decays according to ${math('(d A)/(d t) = k A')} and has a half-life of ${half} years. Starting with ${A0} g, how much remains after ${t} years? Round to the nearest tenth.`, answer: `${math(fixed(A, 1))} g`, distractors: wrong(`${math(fixed(A, 1))} g`, [A0 * Math.exp(-t / half), A0 - (A0 / 2) * (t / half), A0 * 0.5 ** (half / t)].map((v) => `${math(fixed(Math.max(0, v), 1))} g`)), solution: `${math(`k = ln(1/2)/${half}`)}, so ${math(`A = ${A0} e^(k t) = ${A0}(1/2)^(t/${half}) approx ${fixed(A, 1)}`)}.` };
    }
    const P0 = rng.int(1, 20) * 100;
    if (level === 2) {
      const t1 = rng.int(2, 6), P1 = Math.round(P0 * rng.pick([1.5, 2, 2.5, 3]));
      const kk = Math.log(P1 / P0) / t1;
      return { body: `A population grows according to ${math('(d P)/(d t) = k P')}. It starts at ${P0} and is ${P1} after ${t1} years. Find ${math('k')} to four decimal places.`, answer: math(`k approx ${fixed(kk, 4)}`), distractors: wrong(math(`k approx ${fixed(kk, 4)}`), [Math.log10(P1 / P0) / t1, (P1 / P0 - 1) / t1, Math.log(P1 / P0) * t1].map((v) => math(`k approx ${fixed(v, 4)}`))), solution: `${math(`P = ${P0} e^(k t)`)}: ${math(`${P1} = ${P0} e^(${t1}k)`)}, so ${math(`k = ln(${P1}/${P0})/${t1} approx ${fixed(kk, 4)}`)}.` };
    }
    const kk = rng.pick([0.02, 0.03, 0.05, 0.08, -0.04, -0.06]), t = rng.int(2, 20);
    const P = P0 * Math.exp(kk * t);
    return { body: `A quantity satisfies ${math(`(d y)/(d t) = ${kk} y`)} with ${math(`y(0) = ${P0}`)}. Find ${math(`y(${t})`)}, rounded to the nearest tenth.`, answer: math(fixed(P, 1)), distractors: wrong(math(fixed(P, 1)), [P0 * (1 + kk) ** t, P0 + kk * t, P0 * Math.exp(-kk * t)].map((v) => math(fixed(v, 1)))), solution: `${math(`y = ${P0} e^(${kk} t)`)}, so ${math(`y(${t}) approx ${fixed(P, 1)}`)}.` };
  },
});

export const CALCULUS_INTEGRALS = [
  caIntegralPower, caIntegralExpLog, caIntegralTrig, caIntegralInverseTrig, caIntegralSubstitution, caIntegralExpLogSubstitution,
  caIntegralTrigSubstitution, caIntegralInverseTrigSubstitution, caIntegrationByParts, caRiemann, caAreaLimit, caRiemannTable,
  caDefiniteIntegral, caDefiniteSubstitution, caAverageValue, caFtcDerivative, caAreaUnder, caAreaBetween,
  caVolumeWashers, caVolumeShells, caVolumeCrossSections, caMotionIntegral, caSlopeField, caDeIntro, caDeSeparable, caDeGrowth,
];
