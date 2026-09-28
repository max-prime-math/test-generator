import type { Rng } from '../../rng.ts';
import { frac, gcd, lcm } from '../../format.ts';
import { Q, simplifyCbrt, simplifySqrt } from '../../exact.ts';
import { math, mb10i } from '../pc40s/common.ts';
import { optNum, optOne, radioOption, sizeOption } from '../../options.ts';
import { dec, distinct, numberLine, others } from './shared.ts';

// ── Factors of whole numbers ──────────────────────────────────────────────

const PRIMES = [2, 3, 5, 7, 11, 13];

/** Prime factorization as [prime, power] pairs. */
function factorize(n: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let p = 2; p * p <= n; p++) {
    let k = 0;
    while (n % p === 0) { n /= p; k++; }
    if (k) out.push([p, k]);
  }
  if (n > 1) out.push([n, 1]);
  return out;
}
const powerForm = (f: Array<[number, number]>) => f.map(([p, k]) => (k === 1 ? String(p) : `${p}^${k}`)).join(' dot ');
const product = (f: Array<[number, number]>) => f.reduce((acc, [p, k]) => acc * p ** k, 1);

export const numPrimeFactors = mb10i('10i-num-prime-factors', {
  points: 1,
  levels: { 1: 'Two or three primes', 2: 'Repeated primes', 3: 'Larger numbers' },
  options: [
    radioOption('form', 'Numbers', [['1', 'Two or three primes'], ['2', 'Repeated primes'], ['3', 'Larger numbers']], ['1', '2', '3']),
    radioOption('count', 'Distinct prime factors', [['any', 'Any'], ['2', 'Two'], ['3', 'Three']], ['any', 'any', 'any']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    let f: Array<[number, number]>;
    for (;;) {
      const cOpt = optOne(o, 'count', 'any');
      const count = cOpt !== 'any' ? Number(cOpt) : difficulty === 1 ? rng.int(2, 3) : rng.int(2, 4);
      const primes = rng.shuffle(PRIMES.slice(0, difficulty === 3 ? 6 : 4)).slice(0, count).sort((a, b) => a - b);
      f = primes.map((p) => [p, difficulty === 1 ? rng.int(1, 2) : rng.int(1, p <= 3 ? 5 : 2)] as [number, number]);
      const n = product(f);
      if (n >= 12 && n <= (difficulty === 3 ? 20000 : 2000)) break;
    }
    const n = product(f);
    const answer = powerForm(f);
    const bump = f.map(([p, k], i) => [p, i === 0 ? k + 1 : k] as [number, number]);
    const drop = f.length > 1 ? f.slice(1) : [[f[0][0], f[0][1] + 1]] as Array<[number, number]>;
    // A composite factor left in: e.g. 4 · 3 instead of 2² · 3.
    const composite = f[0][1] >= 2 ? [[f[0][0] ** 2, 1], ...(f[0][1] > 2 ? [[f[0][0], f[0][1] - 2]] : []), ...f.slice(1)] as Array<[number, number]> : [[f[0][0] * (f[1]?.[0] ?? 2), 1], ...f.slice(2)] as Array<[number, number]>;
    return {
      body: `Write the prime factorization of ${n} using exponents.`,
      answer: math(answer),
      distractors: distinct(math(answer), [powerForm(bump), powerForm(drop), powerForm(composite), f.map(([p]) => String(p)).join(' dot ')].map(math)),
      solution: `Divide by primes repeatedly: ${math(`${n} = ${f.flatMap(([p, k]) => Array(k).fill(p)).join(' dot ')}${f.some(([, k]) => k > 1) ? ` = ${answer}` : ''}`)}.`,
    };
  },
});

function threeCoprime(rng: Rng, k: number): number[] {
  for (;;) {
    const ms = Array.from({ length: k }, () => rng.int(2, 15));
    const g = ms.reduce((a, b) => gcd(a, b));
    if (g === 1 && new Set(ms).size === k) return ms;
  }
}

export const numGcf = mb10i('10i-num-gcf', {
  points: 1,
  levels: { 1: 'Two numbers', 2: 'Three numbers', 3: 'Larger numbers' },
  options: [
    radioOption('form', 'Numbers', [['1', 'Two numbers'], ['2', 'Three numbers'], ['3', 'Larger numbers']], ['1', '2', '3']),
    sizeOption([12, 24, 40], [12, 12, 40], 'Largest GCF'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const G = optNum(o, 'size', difficulty === 3 ? 40 : 12);
    const g = difficulty === 3 ? rng.int(Math.min(6, G - 2), G) : rng.int(2, G);
    const ms = threeCoprime(rng, difficulty === 2 ? 3 : 2);
    const nums = ms.map((m) => m * g);
    const L = nums.reduce((a, b) => lcm(a, b));
    const smaller = [...factorize(g)].length ? g / factorize(g)[0][0] : 1;
    return {
      body: `Find the greatest common factor of ${nums.join(', ')}.`,
      answer: String(g),
      distractors: distinct(String(g), [String(L), String(smaller), String(Math.min(...nums)), String(g * 2)]),
      solution: `${nums.map((n) => math(`${n} = ${powerForm(factorize(n))}`)).join(', ')}. Multiply the primes common to all, with their lowest powers: GCF = ${g}.`,
    };
  },
});

export const numLcm = mb10i('10i-num-lcm', {
  points: 1,
  levels: { 1: 'Two numbers', 2: 'Three numbers', 3: 'Larger numbers' },
  options: [
    radioOption('form', 'Numbers', [['1', 'Two numbers'], ['2', 'Three numbers'], ['3', 'Larger numbers']], ['1', '2', '3']),
    sizeOption([6, 10, 15], [6, 6, 15], 'Largest common factor of the numbers'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const top = optNum(o, 'size', difficulty === 3 ? 15 : 6);
    const g = difficulty === 3 ? rng.int(Math.min(4, top - 2), top) : rng.int(1, top);
    const ms = threeCoprime(rng, difficulty === 2 ? 3 : 2).map((m) => (difficulty === 3 ? m + 3 : m));
    const nums = [...new Set(ms.map((m) => m * g))];
    const L = nums.reduce((a, b) => lcm(a, b)), G = nums.reduce((a, b) => gcd(a, b));
    const prod = nums.reduce((a, b) => a * b);
    return {
      body: `Find the least common multiple of ${nums.join(', ')}.`,
      answer: String(L),
      distractors: distinct(String(L), [String(prod), String(G), String(L * 2), String(Math.max(...nums))]),
      solution: `${nums.map((n) => math(`${n} = ${powerForm(factorize(n))}`)).join(', ')}. Take every prime with its highest power: LCM = ${L}.`,
    };
  },
});

const isSquare = (n: number) => Number.isInteger(Math.round(Math.sqrt(n))) && Math.round(Math.sqrt(n)) ** 2 === n;
const isCube = (n: number) => Math.round(Math.cbrt(n)) ** 3 === n;

export const numSquareCube = mb10i('10i-num-square-cube', {
  points: 1,
  levels: { 1: 'Numbers up to 1000', 2: 'Numbers up to 100 000', 3: 'From a prime factorization' },
  options: [
    radioOption('form', 'Numbers', [['1', 'Numbers up to 1000'], ['2', 'Numbers up to 100 000'], ['3', 'From a prime factorization']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const kind = rng.pick(['square', 'cube', 'both', 'neither'] as const);
    const max = difficulty === 1 ? 1000 : 100000;
    let n = 0;
    for (;;) {
      if (kind === 'square') n = rng.int(4, Math.floor(Math.sqrt(max))) ** 2;
      else if (kind === 'cube') n = rng.int(2, Math.floor(Math.cbrt(max))) ** 3;
      else if (kind === 'both') n = rng.int(2, difficulty === 1 ? 3 : 6) ** 6;
      else { const r = rng.int(4, Math.floor(Math.sqrt(max))); n = r * r + rng.pick([r, -r, 2, -2]); }
      const s = isSquare(n), c = isCube(n);
      if ((kind === 'square' && s && !c) || (kind === 'cube' && c && !s) || (kind === 'both' && s && c) || (kind === 'neither' && !s && !c)) break;
    }
    const label = { square: 'A perfect square only', cube: 'A perfect cube only', both: 'Both a perfect square and a perfect cube', neither: 'Neither' };
    const f = factorize(n);
    return {
      body: `Is ${difficulty === 3 ? math(`${powerForm(f)}`) : n} a perfect square, a perfect cube, both, or neither?`,
      answer: label[kind],
      distractors: Object.values(label).filter((l) => l !== label[kind]),
      solution: `${math(`${n} = ${powerForm(f)}`)}. A perfect square has every exponent even; a perfect cube has every exponent a multiple of 3. ${kind === 'neither' ? 'Neither holds.' : kind === 'both' ? `Both hold: ${math(`${n} = ${Math.round(Math.sqrt(n))}^2 = ${Math.round(Math.cbrt(n))}^3`)}.` : kind === 'square' ? `Only the first holds: ${math(`${n} = ${Math.round(Math.sqrt(n))}^2`)}.` : `Only the second holds: ${math(`${n} = ${Math.round(Math.cbrt(n))}^3`)}.`}`,
    };
  },
});

export const numRoots = mb10i('10i-num-roots', {
  points: 1,
  levels: { 1: 'Square roots', 2: 'Cube roots', 3: 'Roots from prime factorizations' },
  options: [
    radioOption('form', 'Roots', [['1', 'Square roots'], ['2', 'Cube roots'], ['3', 'Roots from prime factorizations']], ['1', '2', '3']),
    sizeOption([30, 60, 99], [99, 99, 99], 'Largest root'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const cube = difficulty === 2 || (difficulty === 3 && rng.next() < 0.5);
    const top = optNum(o, 'size', 99);
    const r = cube ? rng.int(4, Math.max(8, Math.round(top * 0.3))) : rng.int(12, top);
    const n = cube ? r ** 3 : r * r;
    const f = factorize(n);
    const sym = cube ? `root(3, ${n})` : `sqrt(${n})`;
    return {
      body: difficulty === 3 ? `Use the prime factorization ${math(`${n} = ${powerForm(f)}`)} to find ${math(sym)}.` : `Find ${math(sym)} using prime factorization.`,
      answer: math(String(r)),
      distractors: distinct(math(String(r)), [String(cube ? Math.round(n / 3) : n / 2), String(r + 1), String(r - 1), String(cube ? Math.round(Math.sqrt(n)) : r * 2)].map(math)),
      solution: `${math(`${n} = ${powerForm(f)}`)}. ${cube ? 'Divide each exponent by 3' : 'Halve each exponent'}: ${math(`${sym} = ${powerForm(f.map(([p, k]) => [p, k / (cube ? 3 : 2)]))}${powerForm(f.map(([p, k]) => [p, k / (cube ? 3 : 2)])) === String(r) ? '' : ` = ${r}`}`)}.`,
    };
  },
});

export const numProblem = mb10i('10i-num-problem', {
  levels: { 1: 'Greatest common factor', 2: 'Least common multiple', 3: 'Square and cube roots' },
  options: [
    radioOption('form', 'Problem', [['1', 'Greatest common factor'], ['2', 'Least common multiple'], ['3', 'Square and cube roots']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    if (difficulty === 1) {
      const g = rng.int(4, 30), [a, b] = threeCoprime(rng, 2);
      return {
        body: `A floor measures ${a * g} cm by ${b * g} cm. What is the largest square tile that covers it exactly, with no cutting?`,
        answer: `${g} cm by ${g} cm`,
        distractors: distinct(`${g} cm by ${g} cm`, [`${lcm(a * g, b * g)} cm by ${lcm(a * g, b * g)} cm`, `${g / (factorize(g)[0]?.[0] ?? 1)} cm by ${g / (factorize(g)[0]?.[0] ?? 1)} cm`, `${a * g} cm by ${b * g} cm`, `${2 * g} cm by ${2 * g} cm`]),
        solution: `The tile side must divide both ${a * g} and ${b * g}; the largest such number is their GCF, ${g}.`,
      };
    }
    if (difficulty === 2) {
      const [a, b] = rng.shuffle([6, 8, 9, 10, 12, 15, 18, 20]).slice(0, 2);
      const L = lcm(a, b);
      return {
        body: `One bus leaves the terminal every ${a} minutes and another every ${b} minutes. They both leave at 8:00. When do they next leave together?`,
        answer: `${L} minutes later`,
        distractors: distinct(`${L} minutes later`, [`${a * b} minutes later`, `${gcd(a, b)} minutes later`, `${a + b} minutes later`]),
        solution: `The next shared departure is the least common multiple of ${a} and ${b}: ${L} minutes.`,
      };
    }
    const cube = rng.next() < 0.5;
    const r = rng.int(5, 25), n = cube ? r ** 3 : r * r;
    return cube
      ? {
        body: `A cube-shaped box has a volume of ${n} cm³. What is its surface area?`,
        answer: `${6 * r * r} cm²`,
        distractors: [`${r * r} cm²`, `${4 * r * r} cm²`, `${6 * r} cm²`],
        solution: `Edge: ${math(`root(3, ${n}) = ${r}`)} cm. Surface area: ${math(`6(${r})^2 = ${6 * r * r}`)} cm².`,
      }
      : {
        body: `A square field has an area of ${n} m². What is its perimeter?`,
        answer: `${4 * r} m`,
        distractors: [`${r} m`, `${n / 4} m`, `${2 * r} m`],
        solution: `Side: ${math(`sqrt(${n}) = ${r}`)} m. Perimeter: ${math(`4(${r}) = ${4 * r}`)} m.`,
      };
  },
});

// ── Irrational numbers ────────────────────────────────────────────────────

const nonSquare = (rng: Rng, lo = 2, hi = 99) => { for (;;) { const n = rng.int(lo, hi); if (!isSquare(n)) return n; } };
const nonCube = (rng: Rng, lo = 2, hi = 99) => { for (;;) { const n = rng.int(lo, hi); if (!isCube(n)) return n; } };

function rationalExamples(rng: Rng): string[] {
  const s = rng.int(2, 12), c = rng.int(2, 5), [p, q] = [rng.int(1, 8), rng.int(2, 9)];
  return rng.shuffle([`sqrt(${s * s})`, `root(3, ${c ** 3})`, `${p}/${q}`, `0.${rng.int(1, 9)}${rng.int(0, 9)}`, `0.overline(${rng.int(1, 9)}${rng.int(0, 9)})`, `sqrt(${p * p}/${q * q})`, `-${rng.int(2, 9)}.${rng.int(1, 9)}`, `root(3, -${c ** 3})`]);
}
function irrationalExamples(rng: Rng): string[] {
  return rng.shuffle([`sqrt(${nonSquare(rng)})`, 'pi', `root(3, ${nonCube(rng)})`, `0.1010010001...`, `${rng.int(2, 5)}sqrt(${nonSquare(rng, 2, 12)})`, `sqrt(${nonSquare(rng, 2, 20)})/2`]);
}

export const irrClassify = mb10i('10i-irr-classify', {
  points: 1,
  levels: { 1: 'Which is irrational?', 2: 'Which is rational?', 3: 'Radicals of fractions and cube roots' },
  options: [
    radioOption('form', 'Question', [['1', 'Which is irrational?'], ['2', 'Which is rational?'], ['3', 'Radicals of fractions and cube roots']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const wantIrrational = difficulty !== 2;
    const rat = rationalExamples(rng).filter((r) => difficulty === 3 || !r.includes('root(3') && !r.includes('/'));
    const irr = irrationalExamples(rng).filter((r) => difficulty === 3 || !r.includes('root(3'));
    const answer = wantIrrational ? irr[0] : rat[0];
    const pool = wantIrrational ? rat : irr;
    return {
      body: `Which number is ${wantIrrational ? 'irrational' : 'rational'}?`,
      answer: math(answer),
      distractors: pool.slice(0, 3).map(math),
      solution: `A rational number can be written as a quotient of integers; its decimal ends or repeats. ${math(answer)} ${wantIrrational ? 'has a decimal that never ends or repeats' : 'can be written as a fraction'}, so it is ${wantIrrational ? 'irrational' : 'rational'}.`,
    };
  },
});

export const irrNumberSets = mb10i('10i-irr-number-sets', {
  points: 1,
  levels: { 1: 'Integers and whole numbers', 2: 'Rational numbers', 3: 'Irrational numbers and radicals' },
  options: [
    radioOption('form', 'Numbers', [['1', 'Integers and whole numbers'], ['2', 'Rational numbers'], ['3', 'Irrational numbers and radicals']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const n = rng.int(2, 20), c = rng.int(2, 9);
    const choices: Array<[string, string]> = difficulty === 1
      ? [[String(n), 'natural, whole, integer, rational, real'], ['0', 'whole, integer, rational, real'], [`-${n}`, 'integer, rational, real']]
      : difficulty === 2
        ? [[`${c}/${c + rng.int(1, 5)}`, 'rational, real'], [`-${c}.${rng.int(1, 9)}`, 'rational, real'], [`sqrt(${c * c})`, 'natural, whole, integer, rational, real'], [`-sqrt(${c * c})`, 'integer, rational, real']]
        : [[`sqrt(${nonSquare(rng)})`, 'irrational, real'], ['pi', 'irrational, real'], [`root(3, -${c ** 3})`, 'integer, rational, real'], [`sqrt(${c * c}/${(c + 1) ** 2})`, 'rational, real']];
    const [num, sets] = rng.pick(choices);
    const all = ['natural, whole, integer, rational, real', 'whole, integer, rational, real', 'integer, rational, real', 'rational, real', 'irrational, real', 'rational, irrational, real'];
    return {
      body: `Which number sets does ${math(num)} belong to?`,
      answer: sets,
      distractors: others(rng, all, sets),
      solution: `${math(num)}${num.includes('sqrt') || num.includes('root') ? (sets.startsWith('irr') ? ' is not a perfect root, so it' : ' simplifies to a rational number, so it') : ''} belongs to: ${sets}. Every rational and every irrational number is real.`,
    };
  },
});

export const irrApproximate = mb10i('10i-irr-approximate', {
  points: 1,
  levels: { 1: 'Square roots between whole numbers', 2: 'Square roots to one decimal place', 3: 'Cube roots between whole numbers' },
  options: [
    radioOption('form', 'Estimate', [['1', 'Square roots between whole numbers'], ['2', 'Square roots to one decimal place'], ['3', 'Cube roots between whole numbers']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    if (difficulty === 2) {
      const n = nonSquare(rng, 5, 150), v = Math.sqrt(n);
      return {
        body: `Estimate ${math(`sqrt(${n})`)} to one decimal place without a calculator, then check.`,
        answer: math(dec(v, 1)),
        distractors: distinct(math(dec(v, 1)), [dec(v + 0.3, 1), dec(v - 0.3, 1), dec(n / 2, 1), dec(Math.floor(v) + (n - Math.floor(v) ** 2) / 10, 1)].map(math)),
        solution: `${math(`${Math.floor(v)}^2 = ${Math.floor(v) ** 2}`)} and ${math(`${Math.ceil(v)}^2 = ${Math.ceil(v) ** 2}`)}, so ${math(`sqrt(${n})`)} is between ${Math.floor(v)} and ${Math.ceil(v)}. ${math(`sqrt(${n}) approx ${dec(v, 1)}`)}.`,
      };
    }
    const cube = difficulty === 3;
    const n = cube ? nonCube(rng, 3, 900) : nonSquare(rng, 3, 400);
    const v = cube ? Math.cbrt(n) : Math.sqrt(n);
    const lo = Math.floor(v), sym = cube ? `root(3, ${n})` : `sqrt(${n})`;
    const pair = (a: number) => `${a} "and" ${a + 1}`;
    return {
      body: `Between which two consecutive whole numbers is ${math(sym)}?`,
      answer: math(pair(lo)),
      distractors: distinct(math(pair(lo)), [pair(lo - 1), pair(lo + 1), pair(Math.floor(n / (cube ? 3 : 2)))].map(math)),
      solution: `${math(`${lo}^${cube ? 3 : 2} = ${lo ** (cube ? 3 : 2)}`)} and ${math(`${lo + 1}^${cube ? 3 : 2} = ${(lo + 1) ** (cube ? 3 : 2)}`)}, so ${math(sym)} is between ${lo} and ${lo + 1}.`,
    };
  },
});

/** A radical as math and its value: entire, mixed, or cube root. */
function radicalItem(rng: Rng, difficulty: number): [string, number] {
  const kind = difficulty === 1 ? 'sqrt' : difficulty === 2 ? rng.pick(['sqrt', 'mixed']) : rng.pick(['sqrt', 'mixed', 'cbrt', 'dec']);
  if (kind === 'sqrt') { const n = nonSquare(rng, 2, 80); return [`sqrt(${n})`, Math.sqrt(n)]; }
  if (kind === 'mixed') { const a = rng.int(2, 5), n = nonSquare(rng, 2, 11); return [`${a}sqrt(${n})`, a * Math.sqrt(n)]; }
  if (kind === 'cbrt') { const n = nonCube(rng, 10, 700); return [`root(3, ${n})`, Math.cbrt(n)]; }
  const v = rng.int(15, 90) / 10; return [dec(v, 1), v];
}

export const irrOrder = mb10i('10i-irr-order', {
  levels: { 1: 'Square roots', 2: 'Square roots and mixed radicals', 3: 'With cube roots and decimals' },
  options: [
    radioOption('form', 'Numbers', [['1', 'Square roots'], ['2', 'Square roots and mixed radicals'], ['3', 'With cube roots and decimals']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    let items: Array<[string, number]>;
    for (;;) {
      items = Array.from({ length: 4 }, () => radicalItem(rng, difficulty));
      const vals = items.map(([, v]) => v).sort((a, b) => a - b);
      if (new Set(items.map(([t]) => t)).size === 4 && vals.every((v, i) => i === 0 || v - vals[i - 1] > 0.15)) break;
    }
    const asc = [...items].sort((a, b) => a[1] - b[1]).map(([t]) => t);
    const show = (list: string[]) => math(list.join(', '));
    const byRadicand = [...items].sort((a, b) => Number(a[0].replace(/\D+/g, '')) - Number(b[0].replace(/\D+/g, ''))).map(([t]) => t);
    const swapped = [asc[1], asc[0], asc[2], asc[3]];
    return {
      body: `Order from least to greatest: ${math(rng.shuffle(items.map(([t]) => t)).join(', '))}`,
      answer: show(asc),
      distractors: distinct(show(asc), [show([...asc].reverse()), show(byRadicand), show(swapped), show([asc[0], asc[2], asc[1], asc[3]])]),
      solution: `Approximate each: ${items.filter(([t]) => !/^[0-9.]+$/.test(t)).map(([t, v]) => math(`${t} approx ${dec(v, 2)}`)).join(', ')}. In order: ${show(asc)}.`,
    };
  },
});

export const irrNumberLine = mb10i('10i-irr-number-line', {
  points: 1,
  levels: { 1: 'Which point is the square root?', 2: 'Negative radicals too', 3: 'Cube roots and mixed radicals' },
  options: [
    radioOption('form', 'Numbers', [['1', 'Which point is the square root?'], ['2', 'Negative radicals too'], ['3', 'Cube roots and mixed radicals']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const letters = ['A', 'B', 'C', 'D'];
    let items: Array<[string, number]>;
    for (;;) {
      items = Array.from({ length: 4 }, () => {
        const [t, v] = difficulty === 3 ? radicalItem(rng, 3) : (() => { const n = nonSquare(rng, 2, 60); return [`sqrt(${n})`, Math.sqrt(n)] as [string, number]; })();
        return difficulty >= 2 && rng.next() < 0.4 && !t.includes('.') ? [`-${t}`, -v] as [string, number] : [t, v] as [string, number];
      });
      const vals = items.map(([, v]) => v).sort((a, b) => a - b);
      if (vals.every((v, i) => i === 0 || v - vals[i - 1] > 0.6) && vals[0] > -9 && vals[3] < 9) break;
    }
    const sorted = [...items].sort((a, b) => a[1] - b[1]);
    const lo = Math.floor(sorted[0][1]) - 1, hi = Math.ceil(sorted[3][1]) + 1;
    const target = rng.pick(sorted);
    const idx = sorted.indexOf(target);
    const line = numberLine({ from: lo, to: hi, width: 10, points: sorted.map(([, v], i) => ({ x: v, label: letters[i] })) });
    return {
      body: `Which point on the number line best represents ${math(target[0])}?\n\n${line}`,
      answer: `Point ${letters[idx]}`,
      distractors: letters.filter((_, i) => i !== idx).map((l) => `Point ${l}`),
      solution: `${math(`${target[0]} approx ${dec(target[1], 1)}`)}, which is point ${letters[idx]}.`,
    };
  },
});

const mixedText = (coef: number, r: number, index = 2) => {
  const root = index === 2 ? `sqrt(${r})` : `root(${index}, ${r})`;
  return r === 1 ? String(coef) : coef === 1 ? root : coef === -1 ? `-${root}` : `${coef}${root}`;
};

export const irrEntireToMixed = mb10i('10i-irr-entire-to-mixed', {
  points: 1,
  levels: { 1: 'Small square factors', 2: 'Larger square factors', 3: 'Cube roots' },
  options: [
    radioOption('form', 'Radicals', [['1', 'Small square factors'], ['2', 'Larger square factors'], ['3', 'Cube roots']], ['1', '2', '3']),
    sizeOption([5, 8, 12], [5, 12, 5], 'Largest coefficient'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    if (difficulty === 3) {
      const c = rng.int(2, Math.min(5, optNum(o, 'size', 5))), r = rng.pick([2, 3, 4, 5, 6, 7, 9, 10]), sign = rng.next() < 0.3 ? -1 : 1;
      const n = sign * c ** 3 * r;
      const s = simplifyCbrt(n);
      const answer = mixedText(s.coef, s.radicand, 3);
      return {
        body: `Write ${math(`root(3, ${n})`)} as a mixed radical in simplest form.`,
        answer: math(answer),
        distractors: distinct(math(answer), [mixedText(s.coef * s.coef, s.radicand, 3), mixedText(sign * c, r * c, 3), mixedText(-s.coef, s.radicand, 3), mixedText(s.coef, s.radicand)].map(math)),
        solution: `${math(`${n} = ${sign * c ** 3} dot ${r}`)}, and ${math(`root(3, ${sign * c ** 3}) = ${sign * c}`)}. So ${math(`root(3, ${n}) = ${answer}`)}.`,
      };
    }
    const N = optNum(o, 'size', difficulty === 1 ? 5 : 12);
    const c = difficulty === 1 ? rng.int(2, N) : rng.int(Math.min(4, N - 1), N), r = rng.pick([2, 3, 5, 6, 7, 10, 11]);
    const n = c * c * r;
    const s = simplifySqrt(n);
    const answer = mixedText(s.coef, s.radicand);
    // A partial simplification: take out only one prime.
    const p = factorize(s.coef)[0][0];
    const partial = mixedText(p, n / (p * p));
    return {
      body: `Write ${math(`sqrt(${n})`)} as a mixed radical in simplest form.`,
      answer: math(answer),
      distractors: distinct(math(answer), [partial, mixedText(s.coef * s.coef, s.radicand), mixedText(s.radicand, s.coef * s.coef), mixedText(s.coef, s.radicand * 2)].map(math)),
      solution: `The largest perfect-square factor of ${n} is ${s.coef ** 2}: ${math(`sqrt(${n}) = sqrt(${s.coef ** 2}) dot sqrt(${s.radicand}) = ${answer}`)}.`,
    };
  },
});

export const irrMixedToEntire = mb10i('10i-irr-mixed-to-entire', {
  points: 1,
  levels: { 1: 'Square roots', 2: 'Larger coefficients', 3: 'Cube roots, including negatives' },
  options: [
    radioOption('form', 'Radicals', [['1', 'Square roots'], ['2', 'Larger coefficients'], ['3', 'Cube roots, including negatives']], ['1', '2', '3']),
    sizeOption([5, 9, 12], [5, 9, 5], 'Largest coefficient'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const index = difficulty === 3 ? 3 : 2;
    const N = optNum(o, 'size', difficulty === 1 ? 5 : 9);
    const c = (difficulty === 1 ? rng.int(2, N) : rng.int(3, N)) * (index === 3 && rng.next() < 0.3 ? -1 : 1);
    const r = rng.pick([2, 3, 5, 6, 7, 10]);
    const n = c ** index * r;
    const sym = (v: number) => (index === 2 ? `sqrt(${v})` : `root(3, ${v})`);
    return {
      body: `Write ${math(mixedText(c, r, index))} as an entire radical.`,
      answer: math(sym(n)),
      distractors: distinct(math(sym(n)), [sym(c * r), sym(c * c * r * (index === 3 ? 1 : 2)), sym(Math.abs(c) ** index * r * (index === 3 ? -Math.sign(c) : 1)), sym(c + r)].map(math)),
      solution: `${math(`${c} = ${sym(c ** index)}`)}, so ${math(`${mixedText(c, r, index)} = ${sym(`${c ** index} dot ${r}` as unknown as number)} = ${sym(n)}`)}.`,
    };
  },
});

export const irrIndex = mb10i('10i-irr-index', {
  points: 1,
  levels: { 1: 'Evaluate roots with index 3 to 5', 2: 'Even and odd roots of negatives', 3: 'Simplify roots with index 3 or 4' },
  options: [
    radioOption('form', 'Roots', [['1', 'Evaluate roots with index 3 to 5'], ['2', 'Even and odd roots of negatives'], ['3', 'Simplify roots with index 3 or 4']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    if (difficulty === 1) {
      const index = rng.pick([3, 4, 5]), base = rng.int(2, index === 3 ? 10 : index === 4 ? 5 : 3);
      const n = base ** index;
      return {
        body: `Evaluate ${math(`root(${index}, ${n})`)}.`,
        answer: math(String(base)),
        distractors: distinct(math(String(base)), [String(n / index), String(base + 1), String(base * index), String(Math.round(Math.sqrt(n)))].map(math)),
        solution: `${math(`${base}^${index} = ${n}`)}, so ${math(`root(${index}, ${n}) = ${base}`)}. The index ${index} says how many equal factors multiply to the radicand.`,
      };
    }
    if (difficulty === 2) {
      const index = rng.pick([2, 3, 4, 5]), base = rng.int(2, index <= 3 ? 6 : 3), n = base ** index;
      const even = index % 2 === 0;
      const sym = index === 2 ? `sqrt(-${n})` : `root(${index}, -${n})`;
      const answer = even ? 'Not a real number' : math(String(-base));
      return {
        body: `Evaluate ${math(sym)}, if it is a real number.`,
        answer,
        distractors: distinct(answer, even ? [math(String(-base)), math(String(base)), math(`-${n / index}`)] : ['Not a real number', math(String(base)), math(`-${n / index}`)]),
        solution: even
          ? `An even index needs a non-negative radicand: no real number to an even power is negative.`
          : `${math(`(${-base})^${index} = -${n}`)}, so ${math(`${sym} = ${-base}`)}. An odd root of a negative number is negative.`,
      };
    }
    const index = rng.pick([3, 4]), c = rng.int(2, 3), r = rng.pick(index === 3 ? [2, 3, 4, 5] : [2, 3, 5]);
    const n = c ** index * r;
    const answer = mixedText(c, r, index);
    return {
      body: `Simplify ${math(`root(${index}, ${n})`)}.`,
      answer: math(answer),
      distractors: distinct(math(answer), [mixedText(c ** 2, r, index), mixedText(c, r * c, index), mixedText(r, c, index), mixedText(c, r)].map(math)),
      solution: `${math(`${n} = ${c ** index} dot ${r} = ${c}^${index} dot ${r}`)}, so ${math(`root(${index}, ${n}) = ${answer}`)}.`,
    };
  },
});

// ── Powers ────────────────────────────────────────────────────────────────

const qPow = (q: Q, n: number): Q => (n >= 0 ? new Q(q.n ** n, q.d ** n) : new Q(q.d ** -n, q.n ** -n));

export const powIntegral = mb10i('10i-pow-integral', {
  points: 1,
  levels: { 1: 'Zero and negative exponents', 2: 'Fraction bases', 3: 'Sums and differences' },
  options: [
    radioOption('form', 'Powers', [['1', 'Zero and negative exponents'], ['2', 'Fraction bases'], ['3', 'Sums and differences']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    if (difficulty === 3) {
      const [a, b] = rng.shuffle([2, 3, 4, 5]).slice(0, 2), op = rng.pick(['+', '-']);
      const v = op === '+' ? new Q(1, a).add(new Q(1, b)) : new Q(1, a).sub(new Q(1, b));
      return {
        body: `Evaluate ${math(`${a}^(-1) ${op} ${b}^(-1)`)}.`,
        answer: math(v.typst()),
        distractors: distinct(math(v.typst()), [frac(1, op === '+' ? a + b : a - b || 7), frac(-(op === '+' ? a + b : a - b) || 5), new Q(1, a).mul(new Q(1, b)).typst(), frac(op === '+' ? 2 : 0, a + b) === '0' ? frac(b - a, a * b + 1) : frac(2, a + b)].map(math)),
        solution: `${math(`${a}^(-1) = 1/${a}`)} and ${math(`${b}^(-1) = 1/${b}`)}, so ${math(`1/${a} ${op} 1/${b} = ${v.typst()}`)}.`,
      };
    }
    const base = difficulty === 1 ? new Q(rng.nonZero(-5, 5) || 2) : new Q(rng.int(1, 5) * rng.sign(), rng.int(2, 5));
    if (base.eq(1) || base.eq(-1)) return powIntegral.generate(rng, difficulty, o);
    const e = rng.pick([0, -1, -2, -3].filter((k) => k > -3 || Math.abs(base.n) <= 3));
    const v = qPow(base, e);
    const baseText = base.isInt && base.n > 0 ? base.typst() : `(${base.typst()})`;
    const neg = !base.isInt || base.n > 0 ? null : `-${Math.abs(base.n)}^(${e})`;
    const showNegNoBracket = difficulty === 1 && neg && e === 0 && rng.next() < 0.5;
    const expr = showNegNoBracket ? `-${Math.abs(base.n)}^0` : `${baseText}^(${e})`;
    const value = showNegNoBracket ? new Q(-1) : v;
    return {
      body: `Evaluate ${math(expr)}.`,
      answer: math(value.typst()),
      distractors: distinct(math(value.typst()), [qPow(base, -e).typst(), (e === 0 ? new Q(0) : base.mul(e)).typst(), value.neg().typst(), e === 0 ? base.typst() : qPow(base, -e).neg().typst()].map(math)),
      solution: e === 0
        ? `${showNegNoBracket ? `The exponent applies to ${Math.abs(base.n)} only: ${math(`-(${Math.abs(base.n)}^0) = -1`)}.` : `Any non-zero base to the exponent 0 is 1.`}`
        : `A negative exponent means the reciprocal: ${math(base.isInt ? `${baseText}^(${e}) = 1/${baseText}^${-e} = ${v.typst()}` : `${baseText}^(${e}) = (${new Q(base.d, base.n).typst()})^${-e} = ${v.typst()}`)}.`,
    };
  },
});

/** x^(m/n) as a radical: `root(n, x^m)` or `sqrt(x)`. */
function radical(base: string, m: number, n: number): string {
  const inner = m === 1 ? base : `${base}^${m}`;
  return n === 2 ? `sqrt(${inner})` : `root(${n}, ${inner})`;
}

export const powRadicalForm = mb10i('10i-pow-radical-form', {
  points: 1,
  levels: { 1: 'Power to radical', 2: 'Radical to power', 3: 'Negative rational exponents and variables' },
  options: [
    radioOption('form', 'Convert', [['1', 'Power to radical'], ['2', 'Radical to power'], ['3', 'Negative rational exponents and variables']], ['1', '2', '3']),
    radioOption('base', 'Base (first two forms)', [['number', 'Numbers'], ['variable', 'Variables']], ['number', 'number', 'number']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    let n = rng.int(2, 5), m = rng.int(1, 4);
    while (gcd(m, n) !== 1) m = rng.int(1, 4);
    const base = difficulty === 3 || optOne(o, 'base', 'number') === 'variable' ? rng.pick(['x', 'a', 'y']) : String(rng.pick([3, 5, 6, 7, 10, 11]));
    const exp = `${m}/${n}`;
    if (difficulty === 2) {
      return {
        body: `Write ${math(radical(base, m, n))} as a power with a rational exponent.`,
        answer: math(`${base}^(${exp})`),
        distractors: distinct(math(`${base}^(${exp})`), [`${base}^(${n}/${m})`, `${base}^(${m * n})`, `${base}^(${m}/${n + 1})`, `${base}^(1/${n})`].map(math)),
        solution: `The index is the denominator and the power is the numerator: ${math(`${radical(base, m, n)} = ${base}^(${exp})`)}.`,
      };
    }
    const negative = difficulty === 3;
    const answer = negative ? `1/${radical(base, m, n)}` : radical(base, m, n);
    return {
      body: `Write ${math(`${base}^(${negative ? '-' : ''}${exp})`)} in radical form.`,
      answer: math(answer),
      // Index and power swapped (x^n itself when m = 1, never a meaningless index of 1).
      distractors: distinct(math(answer), [negative ? `-${radical(base, m, n)}` : m === 1 ? `${base}^${n}` : radical(base, n, m), negative ? `1/${m === 1 ? `${base}^${n}` : radical(base, n, m)}` : `${m}${radical(base, 1, n)}`.replace(/^1(?=[a-z(])/, ''), negative ? radical(base, m, n) : radical(base, m * n, 2), negative ? `1/${radical(base, 1, n)}^${m + 1}` : radical(base, 1, m * n)].map(math)),
      solution: `${negative ? `A negative exponent gives the reciprocal. ` : ''}${math(`${base}^(${exp}) = ${radical(base, m, n)}`)}: the denominator ${n} is the index.`,
    };
  },
});

export const powRationalSimplify = mb10i('10i-pow-rational-simplify', {
  levels: { 1: 'Product and quotient of powers', 2: 'Power of a power', 3: 'Coefficients and several variables' },
  options: [
    radioOption('form', 'Expression', [['1', 'Product and quotient of powers'], ['2', 'Power of a power'], ['3', 'Coefficients and several variables']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const f = (): Q => { for (;;) { const q = new Q(rng.int(1, 5), rng.int(2, 4)); if (!q.isInt) return q; } };
    if (difficulty === 1) {
      const p = f(), q = f(), mul = rng.next() < 0.5;
      const r = mul ? p.add(q) : p.sub(q);
      if (r.n === 0) return powRationalSimplify.generate(rng, difficulty, o);
      const e = (x: Q) => (x.n === 0 ? '1' : x.eq(1) ? 'x' : `x^(${x.typst()})`);
      return {
        body: `Simplify ${math(mul ? `x^(${p.typst()}) dot x^(${q.typst()})` : `(x^(${p.typst()}))/(x^(${q.typst()}))`)}. Write the answer with a positive exponent.`,
        answer: math(r.n < 0 ? `1/${e(r.neg())}` : e(r)),
        distractors: distinct(math(r.n < 0 ? `1/${e(r.neg())}` : e(r)), [e(mul ? p.mul(q) : p.div(q)), e(mul ? p.sub(q).abs() : p.add(q)), `x^(${p.n + q.n}/${p.d + q.d})`, r.n < 0 ? e(r.neg()) : `1/${e(r)}`].map(math)),
        solution: `${mul ? 'Add' : 'Subtract'} the exponents: ${math(`${p.typst()} ${mul ? '+' : '-'} ${q.typst()} = ${r.typst()}`)}.`,
      };
    }
    if (difficulty === 2) {
      const n = rng.pick([2, 3]), k = rng.int(2, 4), coef = rng.int(2, 3) ** n * (n === 3 ? 1 : 1);
      const root = Math.round(coef ** (1 / n));
      const xp = n * rng.int(1, 3);
      let m = rng.int(1, 3);
      while (gcd(m, n) !== 1) m = rng.int(1, 3);
      const newX = new Q(xp * m, n);
      return {
        body: `Simplify ${math(`(${coef}x^${xp})^(${m}/${n})`)}.`,
        answer: math(`${root ** m}${newX.isInt ? (newX.eq(1) ? 'x' : `x^${newX.n}`) : `x^(${newX.typst()})`}`),
        distractors: [`${coef ** m}x^${xp * m}`, `${root * m}x^${newX.n}`, `${root ** m}x^${xp + m}`, `${Math.round((coef * m) / n)}x^${newX.n}`].map((d) => math(d.replace(/x\^1(?!\d)/, 'x'))),
        solution: `${math(`${coef}^(${m}/${n}) = ${m === 1 ? `root(${n}, ${coef})` : `(root(${n}, ${coef}))^${m}`} = ${root ** m}`)} and ${math(`(x^${xp})^(${m}/${n}) = x^(${xp * m}/${n})`)}.${k ? '' : ''}`,
      };
    }
    const a = new Q(1, 2), b = new Q(rng.int(1, 3), 3);
    const c = rng.int(2, 9) ** 2;
    const answer = `${Math.sqrt(c)}x^(${a.add(1).typst()}) y^(${b.mul(2).typst()})`;
    return {
      body: `Simplify ${math(`sqrt(${c} x^3 y^(${b.mul(4).typst()}))`)}, writing it with rational exponents. Assume ${math('x, y > 0')}.`,
      answer: math(answer),
      distractors: [`${c / 2}x^(3/2) y^(${b.mul(2).typst()})`, `${Math.sqrt(c)}x^(3/2) y^(${b.mul(4).typst()})`, `${Math.sqrt(c)}x^(1/2) y^(${b.mul(2).typst()})`, `${Math.sqrt(c)}x^6 y^(${b.mul(8).typst()})`].map(math),
      solution: `A square root is the power ${math('1/2')}: ${math(`${c}^(1/2) = ${Math.sqrt(c)}`)}, ${math('(x^3)^(1/2) = x^(3/2)')}, and ${math(`(y^(${b.mul(4).typst()}))^(1/2) = y^(${b.mul(2).typst()})`)}.`,
    };
  },
});

export const powError = mb10i('10i-pow-error', {
  levels: { 1: 'Power of a product', 2: 'Negative exponents', 3: 'Rational exponents' },
  options: [
    radioOption('form', 'Error', [['1', 'Power of a product'], ['2', 'Negative exponents'], ['3', 'Rational exponents']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const a = rng.int(2, 5), m = rng.int(2, 5), n = rng.int(2, 4);
    let expr: string, wrong: string, right: string, why: string, others: string[];
    if (difficulty === 1) {
      expr = `(${a}x^${m})^${n}`; wrong = `${a}x^${m * n}`; right = `${a ** n}x^${m * n}`;
      why = `The exponent ${n} applies to the coefficient too: ${math(`${a}^${n} = ${a ** n}`)}.`;
      others = [`${a * n}x^${m * n}`, `${a ** n}x^${m + n}`, `${a ** n}x^${m ** n}`];
    } else if (difficulty === 2) {
      expr = `${a}x^(-${m})`; wrong = `1/(${a}x^${m})`; right = `${a}/x^${m}`;
      why = `Only ${math('x')} has the negative exponent, so only ${math(`x^${m}`)} moves to the denominator.`;
      others = [`-${a}x^${m}`, `1/(${a}x^(-${m}))`, `${a}x^${m}`];
    } else {
      const c = rng.pick([8, 27, 64]), r = Math.round(Math.cbrt(c));
      expr = `${c}^(2/3)`; wrong = String(Math.round((c * 2) / 3)); right = String(r * r);
      why = `${math(`${c}^(2/3) = (root(3, ${c}))^2 = ${r}^2`)}; the exponent is not a multiplier.`;
      others = [String(r), String(Math.round(Math.sqrt(c ** 3))), String(c * c)];
    }
    return {
      body: `A student simplified ${math(expr)} and got ${math(wrong)}. What is the correct simplification?`,
      answer: math(right),
      distractors: distinct(math(right), [wrong, ...others].map(math)),
      solution: `${why} The correct result is ${math(right)}.`,
    };
  },
});

export const powProblem = mb10i('10i-pow-problem', {
  levels: { 1: 'Side length from an area or a volume', 2: 'Halving with negative exponents', 3: 'Formulas with rational exponents' },
  options: [
    radioOption('form', 'Problem', [['1', 'Side length from an area or a volume'], ['2', 'Halving with negative exponents'], ['3', 'Formulas with rational exponents']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    if (difficulty === 1) {
      const b = rng.pick([2, 3, 5]), k = rng.int(2, 4), cube = rng.next() < 0.5;
      const e = cube ? 3 * k : 2 * k;
      return {
        body: `A ${cube ? 'cube' : 'square'} has ${cube ? 'volume' : 'area'} ${math(`${b}^${e}`)} ${cube ? 'cm³' : 'cm²'}. Find its side length as a power of ${b}, and evaluate it.`,
        answer: math(`${b}^${k} = ${b ** k} "cm"`),
        // Subtracting instead of dividing the exponent, a square root for a cube root (or the reverse), or one power off.
        distractors: [...new Set([e - (cube ? 3 : 2), cube ? e / 2 : e / 3, k + 1, k - 1].filter((x) => Number.isInteger(x) && x >= 1 && x !== k))]
          .slice(0, 3).map((x) => math(`${b}^${x} = ${b ** x} "cm"`)),
        solution: `The side is the ${cube ? 'cube' : 'square'} root: ${math(`(${b}^${e})^(1/${cube ? 3 : 2}) = ${b}^${k} = ${b ** k}`)} cm.`,
      };
    }
    if (difficulty === 2) {
      const m0 = rng.pick([40, 64, 80, 96, 120]), h = rng.pick([3, 5, 8, 10]), n = rng.int(2, 4);
      const t = h * n, m = m0 * 2 ** -n;
      return {
        body: `The mass of a sample is ${math(`m = ${m0}(2)^(-t/${h})`)} grams after ${math('t')} days. Find the mass after ${t} days.`,
        answer: `${dec(m, 2)} g`,
        distractors: distinct(`${dec(m, 2)} g`, [`${dec(m0 * 2 ** n, 2)} g`, `${dec(m0 / (2 * n), 2)} g`, `${dec(m0 - 2 * n, 2)} g`]),
        solution: `${math(`${m0}(2)^(-${t}/${h}) = ${m0}(2)^(-${n}) = ${m0}/${2 ** n} = ${dec(m, 2)}`)} g.`,
      };
    }
    const d = rng.pick([4, 9, 16, 25]);
    const T = Math.round(Math.sqrt(d) ** 3);
    return {
      body: `A planet's orbital period ${math('T')} (years) and distance ${math('d')} from its star (astronomical units) are related by ${math('T = d^(3/2)')}. Find ${math('T')} when ${math(`d = ${d}`)}.`,
      answer: `${T} years`,
      distractors: distinct(`${T} years`, [`${(d * 3) / 2} years`, `${d * d} years`, `${Math.round(Math.sqrt(d))} years`, `${Math.round(Math.cbrt(d * d))} years`]),
      solution: `${math(`${d}^(3/2) = (sqrt(${d}))^3 = ${Math.sqrt(d)}^3 = ${T}`)}.`,
    };
  },
});

export const NUMBER_10I = [
  numPrimeFactors, numGcf, numLcm, numSquareCube, numRoots, numProblem,
  irrClassify, irrNumberSets, irrApproximate, irrOrder, irrNumberLine, irrEntireToMixed, irrMixedToEntire, irrIndex,
  powIntegral, powRadicalForm, powRationalSimplify, powError, powProblem,
];
