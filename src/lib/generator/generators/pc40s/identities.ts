import type { Rng } from '../../rng.ts';
import { gcd } from '../../format.ts';
import { angle, exactTrig, exactTypst, Q, simplifySqrt, type Exact, type TrigFn } from '../../exact.ts';
import { block, math, pc40s } from './common.ts';
import { optNum, optOn, optOne, radioOption, sizeOption, toggleOption } from '../../options.ts';
import type { Unit } from './angles.ts';
import type { GenOptions } from '../../types.ts';

/** A random variable name: x or θ. */
const variable = (rng: Rng, o?: GenOptions) => {
  const v = optOne(o, 'var', 'either');
  return v === 'either' ? rng.pick(['x', 'theta']) : v;
};
const VARIABLE_OPTION = radioOption('var', 'Variable', [['x', 'x'], ['theta', 'θ'], ['either', 'Either']], ['either', 'either', 'either']);
/** Substitute the variable into a template written with `@`. */
const sub = (template: string, v: string) => template.replace(/@/g, v);

// ── Simplifying ────────────────────────────────────────────────────────────

/** [expression, simplified, working] with @ for the variable. */
const SIMPLIFY: Record<1 | 2 | 3, Array<[string, string, string]>> = {
  1: [
    ['sin @ cot @', 'cos @', 'sin @ dot (cos @)/(sin @) = cos @'],
    ['cos @ tan @', 'sin @', 'cos @ dot (sin @)/(cos @) = sin @'],
    ['sec @ cos @', '1', '1/(cos @) dot cos @ = 1'],
    ['csc @ tan @', 'sec @', '1/(sin @) dot (sin @)/(cos @) = 1/(cos @) = sec @'],
    ['cot @ sec @', 'csc @', '(cos @)/(sin @) dot 1/(cos @) = 1/(sin @) = csc @'],
    ['(tan @)/(sin @)', 'sec @', '(sin @)/(cos @) dot 1/(sin @) = 1/(cos @) = sec @'],
    ['(cot @)/(cos @)', 'csc @', '(cos @)/(sin @) dot 1/(cos @) = 1/(sin @) = csc @'],
  ],
  2: [
    ['(1 - cos^2 @)/(sin @)', 'sin @', '(sin^2 @)/(sin @) = sin @'],
    ['(1 - sin^2 @)/(cos @)', 'cos @', '(cos^2 @)/(cos @) = cos @'],
    ['(sec^2 @ - 1)/(tan @)', 'tan @', '(tan^2 @)/(tan @) = tan @'],
    ['csc^2 @ - cot^2 @', '1', '(1 + cot^2 @) - cot^2 @ = 1'],
    ['(1 - sin^2 @) sec^2 @', '1', 'cos^2 @ dot 1/(cos^2 @) = 1'],
    ['sin^2 @ + cos^2 @ + tan^2 @', 'sec^2 @', '1 + tan^2 @ = sec^2 @'],
    ['(csc^2 @ - 1) sin^2 @', 'cos^2 @', 'cot^2 @ sin^2 @ = (cos^2 @)/(sin^2 @) dot sin^2 @ = cos^2 @'],
  ],
  3: [
    ['(sin^2 @)/(1 - cos @)', '1 + cos @', '(1 - cos^2 @)/(1 - cos @) = ((1 - cos @)(1 + cos @))/(1 - cos @) = 1 + cos @'],
    ['(cos^2 @)/(1 + sin @)', '1 - sin @', '(1 - sin^2 @)/(1 + sin @) = ((1 - sin @)(1 + sin @))/(1 + sin @) = 1 - sin @'],
    ['(tan @ + cot @) sin @ cos @', '1', '((sin^2 @ + cos^2 @)/(sin @ cos @)) sin @ cos @ = 1'],
    ['sec @ - cos @', 'sin @ tan @', '1/(cos @) - cos @ = (1 - cos^2 @)/(cos @) = (sin^2 @)/(cos @) = sin @ tan @'],
    ['csc @ - sin @', 'cos @ cot @', '1/(sin @) - sin @ = (1 - sin^2 @)/(sin @) = (cos^2 @)/(sin @) = cos @ cot @'],
    ['(sin 2@)/(2 sin @)', 'cos @', '(2 sin @ cos @)/(2 sin @) = cos @'],
    ['(1 - cos 2@)/(2 sin @)', 'sin @', '(2 sin^2 @)/(2 sin @) = sin @'],
    ['cos 2@ + 2 sin^2 @', '1', '(1 - 2 sin^2 @) + 2 sin^2 @ = 1'],
  ],
};

export const idSimplify = pc40s('40s-id-simplify', {
  levels: { 1: 'Reciprocal and quotient identities', 2: 'Pythagorean identities', 3: 'Factoring and double angles' },
  options: [
    radioOption('form', 'Identities', [['1', 'Reciprocal and quotient identities'], ['2', 'Pythagorean identities'], ['3', 'Factoring and double angles']], ['1', '2', '3']),
    VARIABLE_OPTION,
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const v = variable(rng, o);
    const [expr, result, working] = rng.pick(SIMPLIFY[difficulty]);
    const others = [...new Set([...SIMPLIFY[1], ...SIMPLIFY[2], ...SIMPLIFY[3]].map(([, r]) => r))].filter((r) => r !== result);
    return {
      body: `Simplify: ${math(sub(expr, v))}`,
      answer: math(sub(result, v)),
      distractors: rng.shuffle(others).slice(0, 4).map((r) => math(sub(r, v))),
      solution: math(`${sub(expr, v)} = ${sub(working, v)}`),
    };
  },
});

// ── Non-permissible values ─────────────────────────────────────────────────

/** Restrictions in radians, as general forms. */
const NPV = {
  sin0: 'pi n', cos0: 'pi/2 + pi n', both: '(pi n)/2', cos1: '2pi n', sinNeg1: '(3pi)/2 + 2pi n', cosNeg1: 'pi + 2pi n',
} as const;

/** [identity, restriction, reason as markup with inline math], with @ for the variable. */
const NPV_TEMPLATES: Record<1 | 2 | 3, Array<[identity: string, npv: keyof typeof NPV, reason: string]>> = {
  1: [
    ['tan @ cos @ = sin @', 'cos0', '$tan @ = (sin @)/(cos @)$, so $cos @ != 0$'],
    ['cot @ sin @ = cos @', 'sin0', '$cot @ = (cos @)/(sin @)$, so $sin @ != 0$'],
    ['sec @ cos @ = 1', 'cos0', '$sec @ = 1/(cos @)$, so $cos @ != 0$'],
    ['csc @ sin @ = 1', 'sin0', '$csc @ = 1/(sin @)$, so $sin @ != 0$'],
  ],
  2: [
    ['(1 - cos^2 @)/(sin @) = sin @', 'sin0', 'the denominator needs $sin @ != 0$'],
    ['sec^2 @ - tan^2 @ = 1', 'cos0', '$sec @$ and $tan @$ need $cos @ != 0$'],
    ['(sin @)/(1 + cos @) = (1 - cos @)/(sin @)', 'sin0', '$sin @ != 0$ and $cos @ != -1$, and $cos @ = -1$ only where $sin @ = 0$ already'],
    ['(cos @)/(1 - sin @) = (1 + sin @)/(cos @)', 'cos0', '$cos @ != 0$ and $sin @ != 1$, and $sin @ = 1$ only where $cos @ = 0$ already'],
  ],
  3: [
    ['tan @ + cot @ = sec @ csc @', 'both', '$tan @$ and $sec @$ need $cos @ != 0$, while $cot @$ and $csc @$ need $sin @ != 0$'],
    ['(1 + tan @)/(sin @) = csc @ + sec @', 'both', 'we need $sin @ != 0$ and $cos @ != 0$'],
    ['(sin @)/(1 - cos @) = csc @ + cot @', 'sin0', 'we need $cos @ != 1$ and $sin @ != 0$, and $cos @ = 1$ only where $sin @ = 0$ already'],
    ['csc @ - sin @ = cot @ cos @', 'sin0', '$csc @$ and $cot @$ need $sin @ != 0$'],
  ],
};

export const idNpv = pc40s('40s-id-npv', {
  points: 1,
  levels: { 1: 'One restriction', 2: 'Denominators on both sides', 3: 'Restrictions from sin and cos together' },
  options: [
    radioOption('form', 'Restrictions', [['1', 'One restriction'], ['2', 'Denominators on both sides'], ['3', 'Restrictions from sin and cos together']], ['1', '2', '3']),
    VARIABLE_OPTION,
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const v = variable(rng, o);
    const [identity, key, reason] = rng.pick(NPV_TEMPLATES[difficulty]);
    const answer = `${v} != ${NPV[key]}, n in ZZ`;
    return {
      body: `State the non-permissible values, in radians, for the identity ${math(sub(identity, v))}.`,
      answer: math(answer),
      distractors: (Object.keys(NPV) as Array<keyof typeof NPV>).filter((k) => k !== key).slice(0, 5).map((k) => math(`${v} != ${NPV[k]}, n in ZZ`)),
      solution: `Every expression must be defined: ${sub(reason, v)}. So ${math(answer)}.`,
    };
  },
});

// ── Verifying numerically ─────────────────────────────────────────────────

/** [identity text, angles that give tidy values, left side, right side], each side as a function of the angle in degrees. */
interface Verify { identity: string; angles: number[]; left: (d: number) => string; right: (d: number) => string; value: (d: number) => string }

const tv = (fn: TrigFn, d: number) => exactTypst(exactTrig(fn, d));
/** The square of an exact trig value, which is always rational (one term squared). */
const sq = (fn: TrigFn, d: number) => {
  const e = exactTrig(fn, d)!;
  return new Q(e.a * e.a + e.b * e.b * e.r, e.d * e.d);
};

const VERIFY: Verify[] = [
  { identity: '1 + tan^2 x = sec^2 x', angles: [30, 45, 60, 120, 135, 150], left: (d) => `1 + (${tv('tan', d)})^2`, right: (d) => `(${tv('sec', d)})^2`, value: (d) => new Q(1).add(sq('tan', d)).typst() },
  { identity: '1 + cot^2 x = csc^2 x', angles: [30, 45, 60, 120, 135, 150], left: (d) => `1 + (${tv('cot', d)})^2`, right: (d) => `(${tv('csc', d)})^2`, value: (d) => new Q(1).add(sq('cot', d)).typst() },
  { identity: 'sin 2x = 2 sin x cos x', angles: [30, 60, 120, 150, 210], left: (d) => `sin ${angle(2 * d, 'rad')}`.replace(/sin (.*\/.*)/, 'sin($1)'), right: (d) => `2(${tv('sin', d)})(${tv('cos', d)})`, value: (d) => tv('sin', 2 * d) },
  { identity: 'cos 2x = 1 - 2 sin^2 x', angles: [30, 45, 60, 120, 135, 150], left: (d) => `cos ${angle(2 * d, 'rad')}`.replace(/cos (.*\/.*)/, 'cos($1)'), right: (d) => `1 - 2(${tv('sin', d)})^2`, value: (d) => tv('cos', 2 * d) },
  { identity: 'tan x = (sin x)/(cos x)', angles: [30, 60, 120, 135, 210, 300], left: (d) => tv('tan', d), right: (d) => `(${tv('sin', d)})/(${tv('cos', d)})`, value: (d) => tv('tan', d) },
];

export const idVerifyNumeric = pc40s('40s-id-verify-numeric', {
  levels: { 1: 'Quotient identity', 2: 'Pythagorean identities', 3: 'Double-angle identities' },
  options: [
    radioOption('identity', 'Identity', [['1', 'Quotient'], ['2', 'Pythagorean'], ['3', 'Double-angle']], ['1', '2', '3']),
    radioOption('unit', 'Angle in', [['deg', 'Degrees'], ['rad', 'Radians']], ['rad', 'rad', 'rad']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'identity', gl);
    const pool = difficulty === 1 ? [VERIFY[4]] : difficulty === 2 ? VERIFY.slice(0, 2) : VERIFY.slice(2, 4);
    const t = rng.pick(pool);
    const d = rng.pick(t.angles);
    const value = t.value(d);
    const x = angle(d, optOne(o, 'unit', 'rad') === 'deg' ? 'deg' : 'rad');
    return {
      body: `Verify the identity ${math(t.identity)} for ${math(`x = ${x}`)}. What value does each side equal?`,
      answer: math(value),
      distractors: [...new Set(t.angles.map((a) => t.value(a)).concat(['1', '2', '0', '-1']))].filter((w) => w !== value).slice(0, 5).map(math),
      solution: `Left side: ${math(`${t.left(d)} = ${value}`)}. Right side: ${math(`${t.right(d)} = ${value}`)}. Both sides are equal, so the identity holds for ${math(`x = ${x}`)} (one value alone does not prove it).`,
    };
  },
});

// ── Exact values with sum, difference, and double-angle identities ─────────

const R6 = { up: '(sqrt(6) + sqrt(2))/4', down: '(sqrt(6) - sqrt(2))/4' };
/** Exact sin, cos, or tan of an odd multiple of 15°. */
function exact15(fn: 'sin' | 'cos' | 'tan', d: number): string {
  const r = (d * Math.PI) / 180;
  const value = fn === 'sin' ? Math.sin(r) : fn === 'cos' ? Math.cos(r) : Math.tan(r);
  const m = ((d % 360) + 360) % 360;
  const ref = m % 180 < 90 ? m % 90 : 90 - (m % 90);
  if (fn === 'tan') {
    const big = ref === 75;
    if (value > 0) return big ? '2 + sqrt(3)' : '2 - sqrt(3)';
    return big ? '-2 - sqrt(3)' : 'sqrt(3) - 2';
  }
  const large = (fn === 'sin') === (ref === 75); // sin 75° = cos 15° = (√6 + √2)/4
  if (value > 0) return large ? R6.up : R6.down;
  return large ? `-${R6.up}` : '(sqrt(2) - sqrt(6))/4';
}

const DECOMPOSE: Record<number, [number, number, '+' | '-']> = {
  15: [45, 30, '-'], 75: [45, 30, '+'], 105: [60, 45, '+'], 165: [120, 45, '+'],
  195: [150, 45, '+'], 255: [210, 45, '+'], 285: [240, 45, '+'], 345: [300, 45, '+'],
};

/** e1·e2 for exact values with a single term each, as `sqrt(6)/4`, `1/4`, `-sqrt(3)/4`. */
function product(e1: Exact, e2: Exact): string {
  const c1 = e1.b === 0 ? e1.a : e1.b, r1 = e1.b === 0 ? 1 : e1.r;
  const c2 = e2.b === 0 ? e2.a : e2.b, r2 = e2.b === 0 ? 1 : e2.r;
  const { coef, radicand } = simplifySqrt(r1 * r2);
  let n = c1 * c2 * coef, d = e1.d * e2.d;
  const g = gcd(n, d) || 1; n /= g; d /= g;
  return exactTypst({ a: radicand === 1 ? n : 0, b: radicand === 1 ? 0 : n, r: radicand, d });
}

export const idExactSumDiff = pc40s('40s-id-exact-sum-diff', {
  levels: { 1: 'sin and cos in degrees', 2: 'sin and cos in radians', 3: 'tan, or recognizing an expanded identity' },
  options: [
    radioOption('unit', 'Angles in', [['deg', 'Degrees'], ['rad', 'Radians']], ['deg', 'rad', 'rad']),
    radioOption('fns', 'Functions', [['sincos', 'sin and cos'], ['tan', 'tan'], ['all', 'sin, cos, and tan']], ['sincos', 'sincos', 'tan']),
    toggleOption('recognize', 'Include recognizing an expanded identity', [false, false, true]),
  ],
  generate(rng, difficulty, o) {
    const unit: Unit = optOne(o, 'unit', difficulty === 1 ? 'deg' : 'rad') === 'deg' ? 'deg' : 'rad';
    if (optOn(o, 'recognize', difficulty === 3) && rng.next() < 0.5) {
      // cos A cos B − sin A sin B = cos(A + B) with A + B special.
      const fn = rng.pick(['sin', 'cos'] as const);
      const total = rng.pick([30, 45, 60, 90, 120, 135, 150]);
      const b = rng.pick([10, 15, 20, 25, 35].filter((x) => x < total));
      const a = total - b;
      const expanded = fn === 'sin' ? `sin ${a}° cos ${b}° + cos ${a}° sin ${b}°` : `cos ${a}° cos ${b}° - sin ${a}° sin ${b}°`;
      const value = tv(fn, total);
      return {
        body: `Find the exact value: ${math(expanded)}`,
        answer: math(value),
        // The other function, the wrong sign, the supplement's value, or a common value.
        distractors: [tv(fn === 'sin' ? 'cos' : 'sin', total), tv(fn, total + 180), tv(fn, 180 - total), '1/2', 'sqrt(3)/2'].filter((w, i, all) => w !== value && all.indexOf(w) === i).map(math),
        solution: `This is the ${fn === 'sin' ? 'sum identity for sine' : 'sum identity for cosine'}: ${math(`${expanded} = ${fn}(${a}° + ${b}°) = ${fn} ${total}° = ${value}`)}.`,
      };
    }
    const d = rng.pick(Object.keys(DECOMPOSE).map(Number));
    const [A, B, op] = DECOMPOSE[d];
    const fns = optOne(o, 'fns', difficulty === 3 ? 'tan' : 'sincos');
    const fn: 'sin' | 'cos' | 'tan' = fns === 'tan' ? 'tan' : fns === 'all' ? rng.pick(['sin', 'cos', 'tan'] as const) : rng.pick(['sin', 'cos'] as const);
    const value = exact15(fn, d);
    const a = (x: number) => angle(x, unit);
    const wrap = (x: number) => (unit === 'deg' ? a(x) : `(${a(x)})`);
    // Each step on its own aligned line: expand, substitute, multiply, simplify.
    const flip = op === '+' ? '-' : '+';
    const steps: string[] = fn === 'sin'
      ? [`sin ${wrap(A)} cos ${wrap(B)} ${op} cos ${wrap(A)} sin ${wrap(B)}`,
        `(${tv('sin', A)})(${tv('cos', B)}) ${op} (${tv('cos', A)})(${tv('sin', B)})`,
        `${product(exactTrig('sin', A)!, exactTrig('cos', B)!)} ${op} (${product(exactTrig('cos', A)!, exactTrig('sin', B)!)})`]
      : fn === 'cos'
        ? [`cos ${wrap(A)} cos ${wrap(B)} ${flip} sin ${wrap(A)} sin ${wrap(B)}`,
          `(${tv('cos', A)})(${tv('cos', B)}) ${flip} (${tv('sin', A)})(${tv('sin', B)})`,
          `${product(exactTrig('cos', A)!, exactTrig('cos', B)!)} ${flip} (${product(exactTrig('sin', A)!, exactTrig('sin', B)!)})`]
        : [`(tan ${wrap(A)} ${op} tan ${wrap(B)})/(1 ${flip} tan ${wrap(A)} tan ${wrap(B)})`,
          `(${tv('tan', A)} ${op} ${tv('tan', B)})/(1 ${flip} (${tv('tan', A)})(${tv('tan', B)}))`];
    const working = [`${fn} ${wrap(d)} &= ${fn}(${a(A)} ${op} ${a(B)})`, ...steps.map((step) => `&= ${step}`), `&= ${value}`].join(' \\ ');
    const other = fn === 'tan' ? ['2 + sqrt(3)', '2 - sqrt(3)', 'sqrt(3) - 2', '-2 - sqrt(3)', 'sqrt(3)'] : [R6.up, R6.down, '(sqrt(2) - sqrt(6))/4', `-${R6.up}`, '(sqrt(3) + 1)/2'];
    return {
      body: `Use a sum or difference identity to find the exact value of ${math(`${fn} ${wrap(d)}`)}.`,
      answer: math(value),
      distractors: other.filter((w) => w !== value).map(math),
      solution: block(working) + (fn === 'tan' ? '\n\nThe last step rationalizes the denominator.' : ''),
    };
  },
});

const TRIPLES: Array<[number, number, number]> = [[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25]];

export const idExactDouble = pc40s('40s-id-exact-double', {
  levels: { 1: 'Recognize a double-angle expression', 2: 'sin 2θ or cos 2θ from one ratio', 3: 'tan 2θ from one ratio' },
  options: [
    radioOption('form', 'Problem', [['1', 'Recognize a double-angle expression'], ['2', 'sin 2θ or cos 2θ from one ratio'], ['3', 'tan 2θ from one ratio']], ['1', '2', '3']),
    radioOption('quadrant', 'Quadrant of θ (last two forms)', [['any', 'Any quadrant'], ['1', 'Quadrant I only']], ['any', 'any', 'any']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    if (difficulty === 1) {
      const templates: Array<[string, (t: string) => string, TrigFn, string]> = [
        ['2 sin @ cos @', (t) => `2 sin ${t} cos ${t}`, 'sin', 'sin 2@'],
        ['cos^2 @ - sin^2 @', (t) => `cos^2 ${t} - sin^2 ${t}`, 'cos', 'cos 2@'],
        ['1 - 2 sin^2 @', (t) => `1 - 2 sin^2 ${t}`, 'cos', 'cos 2@'],
        ['2 cos^2 @ - 1', (t) => `2 cos^2 ${t} - 1`, 'cos', 'cos 2@'],
      ];
      const [, form, fn] = rng.pick(templates);
      const half = rng.pick([15, 75, 105, 165, 22.5, 67.5]);
      const t = Number.isInteger(half) ? `${half}°` : half === 22.5 ? '(pi/8)' : '((3pi)/8)';
      const value = tv(fn, half * 2);
      return {
        body: `Find the exact value: ${math(form(t))}`,
        answer: math(value),
        // The other function, the wrong sign, the value at the original angle's complement, or common values.
        distractors: [tv(fn === 'sin' ? 'cos' : 'sin', half * 2), tv(fn, half * 2 + 180), tv(fn, 90 - half * 2), '1/2', 'sqrt(3)/2', 'sqrt(2)/2']
          .filter((w, i, all) => w !== value && all.indexOf(w) === i).map(math),
        solution: `This is a double-angle identity: ${math(`${form(t)} = ${fn} (2 dot ${t}) = ${fn} ${Number.isInteger(half) ? `${half * 2}°` : angle(half * 2, 'rad')} = ${value}`)}.`,
      };
    }
    const [p, q, r] = rng.pick(TRIPLES);
    const quadrant = optOne(o, 'quadrant', 'any') === '1' ? 1 : rng.int(1, 4);
    const sx = quadrant === 1 || quadrant === 4 ? 1 : -1, sy = quadrant <= 2 ? 1 : -1;
    const [x, y] = rng.next() < 0.5 ? [sx * p, sy * q] : [sx * q, sy * p];
    const given = rng.pick(['sin', 'cos'] as const);
    const givenValue = new Q(given === 'sin' ? y : x, r).typst();
    const ask = difficulty === 3 ? 'tan' : rng.pick(['sin', 'cos'] as const);
    const value = ask === 'sin' ? new Q(2 * x * y, r * r) : ask === 'cos' ? new Q(x * x - y * y, r * r) : new Q(2 * x * y, x * x - y * y);
    const formula = ask === 'sin' ? `2 sin theta cos theta = 2(${new Q(y, r).typst()})(${new Q(x, r).typst()})` : ask === 'cos' ? `cos^2 theta - sin^2 theta = (${new Q(x, r).typst()})^2 - (${new Q(y, r).typst()})^2` : `(2 tan theta)/(1 - tan^2 theta) = (2(${new Q(y, x).typst()}))/(1 - (${new Q(y, x).typst()})^2)`;
    return {
      body: `Given ${math(`${given} theta = ${givenValue}`)} and ${math('theta')} in quadrant ${['', 'I', 'II', 'III', 'IV'][quadrant]}, find the exact value of ${math(`${ask} 2theta`)}.`,
      answer: math(value.typst()),
      distractors: [value.neg(), ask === 'sin' ? new Q(2 * y, r) : ask === 'cos' ? new Q(y * y - x * x, r * r) : new Q(2 * y, x), ask === 'tan' ? new Q(2 * y * x, x * x + y * y) : new Q(x * y, r * r), new Q(2 * x * y + 1, r * r)].filter((w) => !w.eq(value)).map((w) => math(w.typst())),
      solution: `In quadrant ${['', 'I', 'II', 'III', 'IV'][quadrant]}: ${math(`x = ${x}`)}, ${math(`y = ${y}`)}, ${math(`r = ${r}`)}. ${math(`${ask} 2theta = ${formula} = ${value.typst()}`)}.`,
    };
  },
});

export const idSingleFunction = pc40s('40s-id-single-function', {
  levels: { 1: 'Double-angle forms', 2: 'Sum and difference forms', 3: 'tan forms and coefficients' },
  options: [
    radioOption('form', 'Identities', [['1', 'Double-angle forms'], ['2', 'Sum and difference forms'], ['3', 'tan forms and coefficients']], ['1', '2', '3']),
    sizeOption([3, 6, 9], [6, 6, 6], 'Largest multiple of x'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const M = optNum(o, 'size', 6);
    const m = rng.int(2, M), n = rng.int(1, m - 1);
    const vx = (k: number) => (k === 1 ? 'x' : `${k}x`);
    let expr: string, answer: string, wrong: string[], identity: string;
    if (difficulty === 1) {
      const k = rng.int(1, M - 1);
      const pick = rng.int(0, 3);
      expr = [`2 sin ${vx(k)} cos ${vx(k)}`, `cos^2 ${vx(k)} - sin^2 ${vx(k)}`, `1 - 2 sin^2 ${vx(k)}`, `2 cos^2 ${vx(k)} - 1`][pick];
      answer = pick === 0 ? `sin ${vx(2 * k)}` : `cos ${vx(2 * k)}`;
      wrong = [pick === 0 ? `cos ${vx(2 * k)}` : `sin ${vx(2 * k)}`, pick === 0 ? `sin ${vx(k)}` : `cos ${vx(k)}`, pick === 0 ? `2 sin ${vx(2 * k)}` : `-cos ${vx(2 * k)}`, pick === 0 ? `sin ${vx(k * k)}` : `cos ${vx(k + 2)}`];
      identity = pick === 0 ? 'sin 2A = 2 sin A cos A' : pick === 1 ? 'cos 2A = cos^2 A - sin^2 A' : pick === 2 ? 'cos 2A = 1 - 2 sin^2 A' : 'cos 2A = 2 cos^2 A - 1';
    } else if (difficulty === 2) {
      const sine = rng.next() < 0.5, plus = rng.next() < 0.5;
      expr = sine
        ? `sin ${vx(m)} cos ${vx(n)} ${plus ? '+' : '-'} cos ${vx(m)} sin ${vx(n)}`
        : `cos ${vx(m)} cos ${vx(n)} ${plus ? '-' : '+'} sin ${vx(m)} sin ${vx(n)}`;
      const total = plus ? m + n : m - n;
      answer = `${sine ? 'sin' : 'cos'} ${vx(total)}`;
      wrong = [`${sine ? 'sin' : 'cos'} ${vx(plus ? m - n : m + n)}`, `${sine ? 'cos' : 'sin'} ${vx(total)}`, `${sine ? 'sin' : 'cos'} ${vx(m * n)}`];
      identity = sine ? `sin(A ${plus ? '+' : '-'} B) = sin A cos B ${plus ? '+' : '-'} cos A sin B` : `cos(A ${plus ? '+' : '-'} B) = cos A cos B ${plus ? '-' : '+'} sin A sin B`;
    } else {
      const kind = rng.int(0, 2);
      if (kind === 0) {
        expr = `(tan ${vx(m)} + tan ${vx(n)})/(1 - tan ${vx(m)} tan ${vx(n)})`;
        answer = `tan ${vx(m + n)}`;
        wrong = [`tan ${vx(m - n)}`, `tan ${vx(m * n)}`, `sin ${vx(m + n)}`];
        identity = 'tan(A + B) = (tan A + tan B)/(1 - tan A tan B)';
      } else if (kind === 1) {
        expr = `(2 tan ${vx(n)})/(1 - tan^2 ${vx(n)})`;
        answer = `tan ${vx(2 * n)}`;
        wrong = [`2 tan ${vx(n)}`, `tan ${vx(n * n)}`, `sin ${vx(2 * n)}`];
        identity = 'tan 2A = (2 tan A)/(1 - tan^2 A)';
      } else {
        const c = rng.pick([4, 6, 10]);
        expr = `${c} sin ${vx(n)} cos ${vx(n)}`;
        answer = `${c / 2} sin ${vx(2 * n)}`;
        wrong = [`${c} sin ${vx(2 * n)}`, `${c / 2} sin ${vx(n)}`, `${c / 2} cos ${vx(2 * n)}`];
        identity = 'sin 2A = 2 sin A cos A';
      }
    }
    return {
      body: `Write as a single trigonometric function: ${math(expr)}`,
      answer: math(answer),
      distractors: wrong.filter((w) => w !== answer).map(math),
      solution: `Use ${math(identity)}: ${math(`${expr} = ${answer}`)}.`,
    };
  },
});

// ── Proofs ────────────────────────────────────────────────────────────────

/** [identity, steps from the left side to the right side], with @ for the variable. */
const PROOFS: Record<1 | 2 | 3, Array<[string, string[]]>> = {
  1: [
    ['tan @ cos @ = sin @', ['(sin @)/(cos @) dot cos @', 'sin @']],
    ['sec @ cot @ = csc @', ['1/(cos @) dot (cos @)/(sin @)', '1/(sin @)', 'csc @']],
    ['sin @ sec @ = tan @', ['sin @ dot 1/(cos @)', '(sin @)/(cos @)', 'tan @']],
    ['csc @ tan @ = sec @', ['1/(sin @) dot (sin @)/(cos @)', '1/(cos @)', 'sec @']],
    ['cot @ sin @ sec @ = 1', ['(cos @)/(sin @) dot sin @ dot 1/(cos @)', '1']],
  ],
  2: [
    ['(1 - cos^2 @) csc @ = sin @', ['sin^2 @ dot 1/(sin @)', 'sin @']],
    ['sec^2 @ - tan^2 @ = 1', ['1/(cos^2 @) - (sin^2 @)/(cos^2 @)', '(1 - sin^2 @)/(cos^2 @)', '(cos^2 @)/(cos^2 @)', '1']],
    ['cos @ + sin @ tan @ = sec @', ['cos @ + (sin^2 @)/(cos @)', '(cos^2 @ + sin^2 @)/(cos @)', '1/(cos @)', 'sec @']],
    ['csc @ - sin @ = cos @ cot @', ['1/(sin @) - sin @', '(1 - sin^2 @)/(sin @)', '(cos^2 @)/(sin @)', 'cos @ dot (cos @)/(sin @)', 'cos @ cot @']],
    ['(sin @)/(1 - cos @) = (1 + cos @)/(sin @)', ['(sin @)/(1 - cos @) dot (1 + cos @)/(1 + cos @)', '(sin @ (1 + cos @))/(1 - cos^2 @)', '(sin @ (1 + cos @))/(sin^2 @)', '(1 + cos @)/(sin @)']],
  ],
  3: [
    ['(sin 2@)/(1 + cos 2@) = tan @', ['(2 sin @ cos @)/(1 + 2 cos^2 @ - 1)', '(2 sin @ cos @)/(2 cos^2 @)', '(sin @)/(cos @)', 'tan @']],
    ['(1 - cos 2@)/(sin 2@) = tan @', ['(1 - (1 - 2 sin^2 @))/(2 sin @ cos @)', '(2 sin^2 @)/(2 sin @ cos @)', '(sin @)/(cos @)', 'tan @']],
    ['(sin @ + cos @)^2 = 1 + sin 2@', ['sin^2 @ + 2 sin @ cos @ + cos^2 @', '1 + 2 sin @ cos @', '1 + sin 2@']],
    ['sin(@ + pi/2) = cos @', ['sin @ cos pi/2 + cos @ sin pi/2', 'sin @ dot 0 + cos @ dot 1', 'cos @']],
    ['cos(pi - @) = -cos @', ['cos pi cos @ + sin pi sin @', '(-1) cos @ + 0 dot sin @', '-cos @']],
  ],
};

export const idProve = pc40s('40s-id-prove', {
  mcq: false,
  points: 3,
  levels: { 1: 'Reciprocal and quotient identities', 2: 'Pythagorean identities', 3: 'Sum, difference, and double-angle identities' },
  options: [
    radioOption('form', 'Identities', [['1', 'Reciprocal and quotient identities'], ['2', 'Pythagorean identities'], ['3', 'Sum, difference, and double-angle identities']], ['1', '2', '3']),
    VARIABLE_OPTION,
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const v = variable(rng, o);
    const [identity, steps] = rng.pick(PROOFS[difficulty]);
    const [left] = identity.split(' = ');
    const chain = [left, ...steps].map((step) => sub(step, v));
    return {
      body: `Prove the identity algebraically: ${math(sub(identity, v))}`,
      answer: 'Proof below.',
      distractors: [],
      solution: `Work with the left side until it matches the right side:\n\n${block(chain.map((step, i) => (i === 0 ? `"LHS" &= ${step}` : `&= ${step}`)).join(' \\ '))}\n\n${math('"LHS" = "RHS"')} ∎`,
    };
  },
});

export const IDENTITY_GENERATORS = [idSimplify, idNpv, idVerifyNumeric, idExactSumDiff, idExactDouble, idSingleFunction, idProve];
