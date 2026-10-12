// Grade 12 Advanced Mathematics (45S): the outcomes no other problem type covers.
// Binomial distributions (AM.2.2), the normal distribution (AM.2.3), properties of
// integers (AM.3.2), and number bases (AM.3.3).
import type { Generator } from '../../types.ts';
import type { Rng } from '../../rng.ts';
import { gcd } from '../../format.ts';
import { optOne, radioOption } from '../../options.ts';
import { am45s, math } from '../pc40s/common.ts';
import { C, nCr } from '../pc40s/counting.ts';

/** Exactly `places` decimals, without a negative zero. */
const fixed = (v: number, places: number) => (Object.is(Number(v.toFixed(places)), -0) ? 0 : Number(v.toFixed(places))).toFixed(places);
/** Distinct wrong answers, without the answer. */
const wrong = (answer: string, list: string[]) => [...new Set(list.filter((x) => x && x !== answer))];

// ── Binomial distributions ───────────────────────────────────────────────────

const CONTEXTS: Array<{ trial: string; success: string; p: number[] }> = [
  { trial: 'A basketball player takes {n} free throws', success: 'makes', p: [0.6, 0.7, 0.75, 0.8] },
  { trial: 'A quality inspector checks {n} light bulbs from a line', success: 'finds defective', p: [0.05, 0.1, 0.15, 0.2] },
  { trial: 'A student guesses on {n} multiple-choice questions with four choices each', success: 'answers correctly', p: [0.25] },
  { trial: 'A seed company plants {n} seeds', success: 'sees sprout', p: [0.7, 0.8, 0.85, 0.9] },
  { trial: 'A survey asks {n} randomly chosen people whether they cycle to work', success: 'hears yes from', p: [0.2, 0.3, 0.4] },
];

const binomialP = (n: number, k: number, p: number) => nCr(n, k) * p ** k * (1 - p) ** (n - k);

const binomial = am45s('45a-binomial', {
  levels: { 1: 'P(X = k)', 2: 'At most or at least k', 3: 'Mean and standard deviation' },
  options: [radioOption('task', 'Find', [['exact', 'P(X = k)'], ['cumulative', 'At most or at least k'], ['mean', 'Mean and standard deviation'], ['mixed', 'Mixed']], ['exact', 'cumulative', 'mean'])],
  generate(rng, difficulty, o) {
    let task = optOne(o, 'task', ['exact', 'cumulative', 'mean'][difficulty - 1]);
    if (task === 'mixed') task = rng.pick(['exact', 'cumulative', 'mean']);
    const ctx = rng.pick(CONTEXTS);
    const p = rng.pick(ctx.p);
    const n = task === 'mean' ? rng.int(12, 60) : rng.int(4, 8);
    const q = Number((1 - p).toFixed(2));
    const setup = `${ctx.trial.replace('{n}', String(n))}. Each time, the probability of a success is ${math(String(p))}, independently of the others. Let ${math('X')} be the number of successes.`;
    if (task === 'mean') {
      const mean = n * p, sd = Math.sqrt(n * p * q);
      const show = (m: number, s: number) => math(`mu = ${fixed(m, 2)}, sigma = ${fixed(s, 2)}`);
      const answer = show(mean, sd);
      return {
        body: `${setup} Find the mean and the standard deviation of ${math('X')}, to two decimal places.`,
        answer,
        distractors: wrong(answer, [show(mean, n * p * q), show(mean, Math.sqrt(n * p)), show(n * q, sd), show(mean, Math.sqrt(p * q))]),
        solution: `For a binomial distribution, ${math(`mu = n p = ${n}(${p}) = ${fixed(mean, 2)}`)} and ${math(`sigma = sqrt(n p q) = sqrt(${n}(${p})(${q})) approx ${fixed(sd, 2)}`)}.`,
      };
    }
    if (task === 'exact') {
      const k = rng.int(1, n - 1);
      const value = binomialP(n, k, p);
      const answer = math(fixed(value, 4));
      return {
        body: `${setup} Find ${math(`P(X = ${k})`)}, to four decimal places.`,
        answer,
        distractors: wrong(answer, [p ** k * q ** (n - k), binomialP(n, k, q), nCr(n, k) * p ** k, binomialP(n, k + 1, p), binomialP(n, k - 1, p)].map((v) => math(fixed(v, 4)))),
        solution: `${math(`P(X = ${k}) = ${C(n, k)} (${p})^${k} (${q})^${n - k} = ${nCr(n, k)} (${p})^${k} (${q})^${n - k} approx ${fixed(value, 4)}`)}.`,
      };
    }
    const k = rng.int(1, Math.min(2, n - 2));
    const atLeast = rng.next() < 0.5;
    const below = Array.from({ length: k + 1 }, (_, i) => binomialP(n, i, p));
    const atMost = below.reduce((a, b) => a + b, 0);
    // "At least k + 1" is the complement of "at most k".
    const value = atLeast ? 1 - atMost : atMost;
    const answer = math(fixed(value, 4));
    const terms = below.map((_, i) => `P(X = ${i})`).join(' + ');
    return {
      body: `${setup} Find the probability of ${atLeast ? `at least ${k + 1}` : `at most ${k}`} successes, to four decimal places.`,
      answer,
      distractors: wrong(answer, [atLeast ? atMost : 1 - atMost, binomialP(n, k, p), atLeast ? 1 - atMost + below[k] : atMost - below[k], atLeast ? 1 - below[0] : below[k]].map((v) => math(fixed(v, 4)))),
      solution: atLeast
        ? `${math(`P(X >= ${k + 1}) = 1 - P(X <= ${k}) = 1 - (${terms})`)}, where ${math(`P(X = i) = ${C(n, 'i')} (${p})^i (${q})^(${n} - i)`)}. So the probability is ${math(`1 - ${fixed(atMost, 4)} = ${fixed(value, 4)}`)}.`
        : `${math(`P(X <= ${k}) = ${terms}`)}, where ${math(`P(X = i) = ${C(n, 'i')} (${p})^i (${q})^(${n} - i)`)}. So the probability is ${math(fixed(value, 4))}.`,
    };
  },
});

// ── The normal distribution ──────────────────────────────────────────────────

/** erf by its Maclaurin series; accurate to about 1e-13 for |x| ≤ 3. */
function erf(x: number): number {
  let sum = 0, term = x;
  for (let n = 0; n < 80; n++) {
    sum += term / (2 * n + 1);
    term *= -x * x / (n + 1);
  }
  return (2 / Math.sqrt(Math.PI)) * sum;
}
/** The standard normal cumulative probability, as a z-table gives it (four decimals). */
const phi = (z: number) => Number((0.5 * (1 + erf(z / Math.SQRT2))).toFixed(4));

const MEASURES: Array<{ what: string; unit: string; mu: number[]; sigma: number[] }> = [
  { what: 'The heights of adult women in a city', unit: 'cm', mu: [160, 162, 164], sigma: [5, 6, 8] },
  { what: 'Scores on a provincial exam', unit: 'points', mu: [65, 70, 72], sigma: [8, 10, 12] },
  { what: 'The masses of apples from an orchard', unit: 'g', mu: [150, 180, 200], sigma: [10, 15, 20] },
  { what: 'The lifetimes of a brand of battery', unit: 'h', mu: [40, 50, 60], sigma: [4, 5, 6] },
];

/** Percent of a normal distribution between two whole numbers of standard deviations from the mean (−3 … 3), by the 68-95-99.7 rule. */
function rulePercent(a: number, b: number): number {
  const band = [34, 13.5, 2.35]; // 0–1, 1–2, 2–3 standard deviations, on one side
  const tail = 0.15; // beyond 3 standard deviations, on one side
  let total = 0;
  for (let i = -4; i < 4; i++) {
    const lo = i, hi = i + 1;
    if (lo >= a && hi <= b) total += lo >= 3 || hi <= -3 ? tail : band[lo >= 0 ? lo : -hi];
  }
  return Number(total.toFixed(2));
}

const normal = am45s('45a-normal', {
  levels: { 1: 'z-scores', 2: 'The 68-95-99.7 rule', 3: 'Probabilities from z-scores' },
  options: [radioOption('task', 'Find', [['z', 'A z-score'], ['rule', 'A percent by the 68-95-99.7 rule'], ['probability', 'A probability from z-scores'], ['mixed', 'Mixed']], ['z', 'rule', 'probability'])],
  generate(rng, difficulty, o) {
    let task = optOne(o, 'task', ['z', 'rule', 'probability'][difficulty - 1]);
    if (task === 'mixed') task = rng.pick(['z', 'rule', 'probability']);
    const m = rng.pick(MEASURES);
    const mu = rng.pick(m.mu), sigma = rng.pick(m.sigma);
    const setup = `${m.what} are normally distributed with mean ${math(`${mu}`)} ${m.unit} and standard deviation ${math(`${sigma}`)} ${m.unit}.`;
    if (task === 'z') {
      const z = rng.nonZero(-10, 10) / 4;
      const x = mu + z * sigma;
      const answer = math(fixed(z, 2));
      return {
        body: `${setup} Find the z-score of ${math(String(x))} ${m.unit}.`,
        answer,
        distractors: wrong(answer, [fixed(-z, 2), fixed((x - mu) / sigma ** 2, 2), fixed(x / sigma, 2), fixed(z * 2, 2)].map(math)),
        solution: `${math(`z = (x - mu)/sigma = (${x} - ${mu})/${sigma} = ${fixed(z, 2)}`)}.`,
      };
    }
    if (task === 'rule') {
      let a = rng.int(-3, 2), b = rng.int(a + 1, 3);
      // Sometimes one side is open: "less than" or "more than".
      const open = rng.pick(['between', 'between', 'below', 'above'] as const);
      if (open === 'below') a = -4;
      if (open === 'above') b = 4;
      const value = rulePercent(a, b);
      const at = (k: number) => String(mu + k * sigma);
      const range = open === 'below' ? `less than ${math(at(b))}` : open === 'above' ? `more than ${math(at(a))}` : `between ${math(at(a))} and ${math(at(b))}`;
      const answer = math(`${value} %`);
      // Off by one band at either end, or the complement.
      const near = [rulePercent(a + 1, b), rulePercent(a, b - 1), rulePercent(a - 1, b), rulePercent(a, b + 1), 100 - value].map((v) => Number(v.toFixed(2))).filter((v) => v > 0 && v < 100);
      return {
        body: `${setup} Use the 68-95-99.7 rule to find the percent of values ${range} ${m.unit}.`,
        answer,
        distractors: wrong(answer, near.map((v) => math(`${v} %`))),
        solution: `${open === 'below' ? math(`${at(b)}`) + ` is ${math(`${b}`)} standard deviations from the mean` : open === 'above' ? math(`${at(a)}`) + ` is ${math(`${a}`)} standard deviations from the mean` : `The values are ${math(`${a}`)} and ${math(`${b}`)} standard deviations from the mean`}. By the rule, each side of the mean has ${math('34 %')} within one standard deviation, ${math('13.5 %')} between one and two, ${math('2.35 %')} between two and three, and ${math('0.15 %')} beyond three. Adding the pieces gives ${answer}.`,
      };
    }
    const z1 = rng.int(-250, 250) / 100;
    const kind = rng.pick(['less', 'more', 'between'] as const);
    const z2 = Math.min(3, Number((z1 + rng.int(50, 200) / 100).toFixed(2)));
    const x = (z: number) => Number((mu + z * sigma).toFixed(2));
    const value = kind === 'less' ? phi(z1) : kind === 'more' ? Number((1 - phi(z1)).toFixed(4)) : Number((phi(z2) - phi(z1)).toFixed(4));
    const answer = math(fixed(value, 4));
    const zText = (z: number, xv: number) => `z = (${xv} - ${mu})/${sigma} = ${fixed(z, 2)}`;
    const event = kind === 'less' ? `less than ${math(String(x(z1)))}` : kind === 'more' ? `more than ${math(String(x(z1)))}` : `between ${math(String(x(z1)))} and ${math(String(x(z2)))}`;
    return {
      body: `${setup} Find the probability that a randomly chosen value is ${event} ${m.unit}, to four decimal places.`,
      answer,
      // The complement, and a row of the table one step off (z ± 0.1).
      distractors: wrong(answer, [1 - value, ...[0.1, -0.1].map((d) => kind === 'less' ? phi(z1 + d) : kind === 'more' ? 1 - phi(z1 + d) : phi(z2 + d) - phi(z1)), kind === 'between' ? phi(z2) + phi(z1) - 1 : phi(z1) / 2].map((v) => math(fixed(Math.min(1, Math.max(0, v)), 4)))),
      solution: kind === 'between'
        ? `${math(zText(z1, x(z1)))} and ${math(zText(z2, x(z2)))}. From the standard normal table, ${math(`P = ${fixed(phi(z2), 4)} - ${fixed(phi(z1), 4)} = ${fixed(value, 4)}`)}.`
        : `${math(zText(z1, x(z1)))}. From the standard normal table, ${math(`P(Z < ${fixed(z1, 2)}) = ${fixed(phi(z1), 4)}`)}${kind === 'more' ? `, so ${math(`P(Z > ${fixed(z1, 2)}) = 1 - ${fixed(phi(z1), 4)} = ${fixed(value, 4)}`)}` : ''}.`,
    };
  },
});

// ── Properties of integers ───────────────────────────────────────────────────

/** The steps of the Euclidean algorithm for a > b > 0: [a, b, quotient, remainder]. */
function euclidSteps(a: number, b: number): Array<[number, number, number, number]> {
  const steps: Array<[number, number, number, number]> = [];
  while (b > 0) {
    steps.push([a, b, Math.floor(a / b), a % b]);
    [a, b] = [b, a % b];
  }
  return steps;
}

/** Integers x, y with a x + b y = gcd(a, b), from the extended Euclidean algorithm. */
function bezout(a: number, b: number): [number, number] {
  if (b === 0) return [1, 0];
  const [x, y] = bezout(b, a % b);
  return [y, x - Math.floor(a / b) * y];
}

/** Two numbers with a gcd above 1 that takes at least three steps to find. */
function gcdPair(rng: Rng, big: boolean): [number, number] {
  for (;;) {
    const g = rng.int(2, big ? 24 : 12);
    const m = rng.int(big ? 8 : 4, big ? 60 : 20), n = rng.int(big ? 5 : 3, m - 1);
    if (gcd(m, n) !== 1) continue;
    const a = g * m, b = g * n;
    if (euclidSteps(a, b).length >= 3) return [a, b];
  }
}

const integers = am45s('45a-integers', {
  levels: { 1: 'GCD by the Euclidean algorithm', 2: 'Modular arithmetic', 3: 'The GCD as a linear combination' },
  options: [radioOption('task', 'Find', [['gcd', 'A GCD by the Euclidean algorithm'], ['mod', 'A remainder (modular arithmetic)'], ['combination', 'Integers x and y with ax + by = gcd(a, b)'], ['mixed', 'Mixed']], ['gcd', 'mod', 'combination'])],
  generate(rng, difficulty, o) {
    let task = optOne(o, 'task', ['gcd', 'mod', 'combination'][difficulty - 1]);
    if (task === 'mixed') task = rng.pick(['gcd', 'mod', 'combination']);
    if (task === 'mod') {
      const n = rng.int(5, 13);
      const a = rng.int(40, 400), b = rng.int(20, 200);
      const form = rng.pick(['sum', 'product', 'power'] as const);
      const k = rng.int(5, 12);
      let value = 0, expr = '', work = '';
      if (form === 'sum') { value = (a + b) % n; expr = `(${a} + ${b}) mod ${n}`; work = `${a} mod ${n} = ${a % n}" and "${b} mod ${n} = ${b % n}`; }
      if (form === 'product') { value = (a * b) % n; expr = `(${a} dot ${b}) mod ${n}`; work = `${a} mod ${n} = ${a % n}" and "${b} mod ${n} = ${b % n}`; }
      const base = rng.int(2, 7);
      if (form === 'power') {
        value = 1;
        for (let i = 0; i < k; i++) value = (value * base) % n;
        expr = `${base}^${k} mod ${n}`;
      }
      const reduced = form === 'sum' ? `(${a % n} + ${b % n}) mod ${n}` : form === 'product' ? `(${a % n} dot ${b % n}) mod ${n}` : '';
      const answer = math(String(value));
      return {
        body: `Evaluate ${math(expr)}.`,
        answer,
        distractors: wrong(answer, [(value + 1) % n, (value + n - 1) % n, (value + 2) % n, form === 'power' ? (base * k) % n : (a % n) + (b % n), n - value].map((v) => math(String(v)))),
        solution: form === 'power'
          ? `Reduce after each multiplication: the powers of ${math(String(base))} modulo ${math(String(n))} are ${math(Array.from({ length: k }, (_, i) => { let v = 1; for (let j = 0; j <= i; j++) v = (v * base) % n; return v; }).join(', '))}. So ${math(`${expr} = ${value}`)}.`
          : `Reduce first: ${math(work)}. Then ${math(`${reduced} = ${value}`)}.`,
      };
    }
    const [a, b] = gcdPair(rng, task === 'combination' ? false : difficulty > 1);
    const steps = euclidSteps(a, b);
    const g = gcd(a, b);
    const lines = steps.map(([x, y, q, r]) => `${x} = ${q} dot ${y} + ${r}`).join(', ');
    if (task === 'gcd') {
      const answer = math(String(g));
      return {
        body: `Use the Euclidean algorithm to find ${math(`gcd(${a}, ${b})`)}.`,
        answer,
        distractors: wrong(answer, [steps[0][3], g * 2, steps[steps.length - 1][0], b, a * b / g].map((v) => math(String(v)))),
        solution: `${math(lines)}. The last non-zero remainder is the GCD: ${math(`gcd(${a}, ${b}) = ${g}`)}.`,
      };
    }
    const [x, y] = bezout(a, b);
    const pair = (u: number, v: number) => math(`x = ${u}, y = ${v}`);
    const answer = pair(x, y);
    return {
      body: `Use the Euclidean algorithm to find ${math(`gcd(${a}, ${b})`)} and integers ${math('x')} and ${math('y')} with ${math(`${a} x + ${b} y = gcd(${a}, ${b})`)}.`,
      answer,
      // Each wrong pair fails the equation (other correct pairs exist: x + kb/g, y - ka/g).
      distractors: wrong(answer, [[-x, -y], [y, x], [x, -y], [-x, y]].filter(([u, v]) => a * u + b * v !== g).map(([u, v]) => pair(u, v))),
      solution: `${math(lines)}, so ${math(`gcd(${a}, ${b}) = ${g}`)}. Working back through the steps gives ${math(`${a}(${x}) + ${b}(${y}) = ${g}`)}. (Other pairs work too: add ${math(String(b / g))} to ${math('x')} and subtract ${math(String(a / g))} from ${math('y')}.)`,
    };
  },
});

// ── Number bases ─────────────────────────────────────────────────────────────

/** A numeral in a base, as Typst math: `"1011"_2`. */
const numeral = (digits: string, base: number) => `"${digits}"_(${base})`;
const toBase = (n: number, base: number) => n.toString(base).toUpperCase();
/** The place-value expansion of a numeral: 1·2³ + 0·2² + … */
const expansion = (digits: string, base: number) =>
  [...digits].map((d, i) => `${parseInt(d, base)} dot ${base}^${digits.length - 1 - i}`).join(' + ');

const bases = am45s('45a-bases', {
  levels: { 1: 'Binary and decimal', 2: 'Other bases, and hexadecimal', 3: 'Base to base, and binary to hexadecimal' },
  options: [radioOption('task', 'Convert', [['binary', 'Between binary and base 10'], ['other', 'Between base 10 and bases 3 to 9 or 16'], ['cross', 'Between two bases other than 10'], ['mixed', 'Mixed']], ['binary', 'other', 'cross'])],
  generate(rng, difficulty, o) {
    let task = optOne(o, 'task', ['binary', 'other', 'cross'][difficulty - 1]);
    if (task === 'mixed') task = rng.pick(['binary', 'other', 'cross']);
    if (task === 'cross') {
      const pairs: Array<[number, number]> = [[2, 16], [16, 2], [2, 8], [8, 2], [3, 5], [5, 3], [4, 7], [6, 4]];
      const [from, to] = rng.pick(pairs);
      const n = rng.int(40, from === 16 || to === 16 ? 1000 : 400);
      const src = toBase(n, from), dst = toBase(n, to);
      const answer = math(numeral(dst, to));
      return {
        body: `Write ${math(numeral(src, from))} in base ${math(String(to))}.`,
        answer,
        distractors: wrong(answer, [toBase(n + 1, to), [...dst].reverse().join(''), dst.length > 1 ? dst[1] + dst[0] + dst.slice(2) : '', toBase(n - 1, to)].map((d) => math(numeral(d, to)))),
        solution: `In base 10, ${math(`${numeral(src, from)} = ${expansion(src, from)} = ${n}`)}. Dividing ${math(String(n))} by ${math(String(to))} repeatedly and reading the remainders from last to first gives ${math(numeral(dst, to))}.`,
      };
    }
    const base = task === 'binary' ? 2 : rng.pick([3, 4, 5, 6, 7, 8, 16]);
    const n = rng.int(base === 2 ? 10 : 30, base === 2 ? (difficulty === 1 ? 63 : 255) : base === 16 ? 3000 : 600);
    const digits = toBase(n, base);
    if (rng.next() < 0.5) {
      const answer = math(numeral(digits, base));
      return {
        body: `Write ${math(String(n))} in base ${math(String(base))}.`,
        answer,
        distractors: wrong(answer, [[...digits].reverse().join(''), toBase(n + 1, base), toBase(n - 1, base), toBase(n, base === 2 ? 3 : base - 1)].map((d) => math(numeral(d, base)))),
        solution: `Divide by ${math(String(base))} repeatedly; the remainders, read from last to first, are the digits: ${math(`${n} = ${expansion(digits, base)}`)}, so ${math(`${n} = ${numeral(digits, base)}`)}.`,
      };
    }
    const answer = math(String(n));
    const reversed = parseInt([...digits].reverse().join(''), base);
    return {
      body: `Write ${math(numeral(digits, base))} in base 10.`,
      answer,
      distractors: wrong(answer, [reversed, n + base, [...digits].reduce((s, d) => s + parseInt(d, base), 0) * base, n - 1].filter((v) => v > 0).map((v) => math(String(v)))),
      solution: `${math(`${numeral(digits, base)} = ${expansion(digits, base)} = ${n}`)}.`,
    };
  },
});

export const AM45S_GENERATORS: Generator[] = [binomial, normal, integers, bases];
