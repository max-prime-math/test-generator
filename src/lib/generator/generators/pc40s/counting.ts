import { grouped, poly } from '../../format.ts';
import type { Rng } from '../../rng.ts';
import { math, pc40s } from './common.ts';
import { optNum, optOne, radioOption, sizeOption } from '../../options.ts';

export function factorial(n: number): number {
  let out = 1;
  for (let i = 2; i <= n; i++) out *= i;
  return out;
}
/** n(n − 1)···(n − r + 1), as an exact product (a quotient of factorials loses precision for large n). */
export const nPr = (n: number, r: number) => { let out = 1; for (let i = 0; i < r; i++) out *= n - i; return out; };
export const nCr = (n: number, r: number) => (r < 0 || r > n ? 0 : Math.round(factorial(n) / (factorial(r) * factorial(n - r))));

/** Manitoba's prescript notation: ₙPᵣ, ₙCᵣ. */
export const P = (n: number | string, r: number | string) => `attach(P, bl: ${n}, br: ${r})`;
export const C = (n: number | string, r: number | string) => `attach(C, bl: ${n}, br: ${r})`;

const num = (v: number) => math(grouped(v));

/** Manitoba place names, for letter arrangements. */
const DISTINCT_WORDS = ['STEINBACH', 'DAUPHIN', 'PORTAGE', 'MORDEN', 'CARMAN', 'VIRDEN'].filter((w) => new Set(w).size === w.length);
const REPEATED_WORDS = ['MANITOBA', 'BRANDON', 'SELKIRK', 'GIMLI', 'WINNIPEG', 'CHURCHILL', 'NEEPAWA', 'ASSINIBOINE', 'MINNEDOSA', 'THOMPSON'];

// More words for variety. The first pick still comes from the lists above, so a
// saved seed keeps its numbers; `sameShape` then swaps in a word that counts the same.
const MORE_DISTINCT = ['BLUEPRINT', 'CLIPBOARD', 'PAINTER', 'HOLIDAY', 'GARDEN', 'PLANET', 'SILVER', 'MARKET', 'FOREST'];
const DISTINCT_POOL = [...DISTINCT_WORDS, ...MORE_DISTINCT].filter((w) => new Set(w).size === w.length);
const REPEATED_POOL = [...REPEATED_WORDS, 'PATTERN', 'LETTUCE', 'BALLOON', 'APPLE', 'PIZZA', 'HELLO', 'ELEPHANT', 'UMBRELLA', 'BOOKMARK', 'SHOPPERS', 'BUTTERFLY', 'BLUEBERRY', 'COFFEE', 'BANANA', 'TOMATO'];

function allCounts(word: string): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const ch of word) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  return [...counts];
}
function letterCounts(word: string): Array<[string, number]> {
  return allCounts(word).filter(([, k]) => k > 1);
}
const isVowel = (ch: string) => 'AEIOU'.includes(ch);
const vowelCount = (word: string) => [...word].filter(isVowel).length;
/** Arrangements of a multiset: (k₁ + k₂ + …)!/(k₁! k₂! …). */
const arrangements = (counts: number[]) => counts.reduce((acc, k) => acc / factorial(k), factorial(counts.reduce((a, k) => a + k, 0)));
/** `/(2! 3!)` for the repeated letters, or '' when there are none. */
const overRepeats = (counts: number[]) => {
  const reps = counts.filter((k) => k > 1).map((k) => `${k}!`);
  return !reps.length ? '' : reps.length === 1 ? `/${reps[0]}` : `/(${reps.join(' ')})`;
};

/** Length and repeated-letter counts, which fix every count of a word's arrangements. */
const repeatShape = (w: string) => `${w.length}:${letterCounts(w).map(([, k]) => k).sort().join(',')}`;
/** Length and number of vowels, for vowel conditions on distinct letters. */
const vowelShape = (w: string) => `${w.length}:${vowelCount(w)}`;
/** A word from the pool with the same shape as `word` (drawn last, so the numbers never change). */
function sameShape(rng: Rng, word: string, pool: string[], shape: (w: string) => string): string {
  return rng.pick(pool.filter((w) => shape(w) === shape(word)));
}

/** People for named-person conditions. */
const NAMES = ['Ana', 'Ben', 'Chloe', 'Dev', 'Emma', 'Farid', 'Gia', 'Hugo'];
const plural = (k: number, one: string, many = `${one}s`) => (k === 1 ? one : many);

/** Three independent choices, a, b, c (a ≥ 3, b and c ≥ 2): one setting per problem. */
const CHOICE_SETTINGS: Array<(a: number, b: number, c: number) => string> = [
  (a, b, c) => `A student has ${a} shirts, ${b} pairs of pants, and ${c} pairs of shoes. How many different outfits of one shirt, one pair of pants, and one pair of shoes are possible?`,
  (a, b, c) => `A restaurant's three-course meal comes with a choice of ${a} appetizers, ${b} main courses, and ${c} desserts. How many different meals are possible?`,
  (a, b, c) => `There are ${a} trails from a parking lot to a lookout, ${b} trails from the lookout to a waterfall, and ${c} trails from the waterfall to a campsite. How many different routes lead from the parking lot to the campsite?`,
  (a, b, c) => `A sandwich shop offers ${a} kinds of bread, ${b} fillings, and ${c} sauces. How many sandwiches with one bread, one filling, and one sauce can be made?`,
  (a, b, c) => `A new bike comes in ${a} colours, ${b} frame sizes, and ${c} seat styles. How many different bikes can be ordered?`,
  (a, b, c) => `A student must choose one of ${a} math courses, one of ${b} science courses, and one of ${c} arts courses. How many different three-course timetables are possible?`,
  (a, b, c) => `An ice cream shop sells ${a} flavours, ${b} kinds of cone, and ${c} toppings. How many cones with one flavour, one kind of cone, and one topping are possible?`,
  (a, b, c) => `A summer camp offers ${a} morning activities, ${b} afternoon activities, and ${c} evening activities. A camper chooses one of each. How many different daily schedules are possible?`,
  (a, b, c) => `A video game character can have one of ${a} hairstyles, ${b} outfits, and ${c} pets. How many different characters can be created?`,
  (a, b, c) => `A pizza special includes one of ${a} crusts, one of ${b} sauces, and one of ${c} cheeses. How many different specials are possible?`,
];
const CODE_NAMES = ['code', 'licence plate', 'password', 'product code', 'locker code', 'username'];
const CASE_NAMES = ['numbers', 'PINs', 'passcodes', 'ID numbers'];

export const pcFcp = pc40s('40s-pc-fcp', {
  points: 1,
  levels: { 1: 'Independent choices', 2: 'With restrictions', 3: 'Cases (either/or)' },
  options: [
    radioOption('form', 'Situation', [['1', 'Independent choices'], ['2', 'With restrictions'], ['3', 'Cases (either/or)'], ['4', 'Numbers from 0–9 (no leading zero, odd or even)']], ['1', '2', '3']),
    sizeOption([5, 8, 12], [8, 8, 8], 'Largest number of choices'),
    radioOption('repeat', 'Repetition (codes and numbers)', [['yes', 'Allowed'], ['no', 'Not allowed'], ['either', 'Either']], ['either', 'either', 'either']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3 | 4;
    if (difficulty === 1) {
      const N = optNum(o, 'size', 8);
      const [a, b, c] = [rng.int(3, N), rng.int(2, N - 2), rng.int(2, N - 3)];
      const answer = a * b * c;
      return {
        body: rng.pick(CHOICE_SETTINGS)(a, b, c),
        answer: num(answer),
        distractors: [a + b + c, a * b + c, a * b].filter((v) => v !== answer).map(num),
        solution: `By the fundamental counting principle, multiply the number of choices: ${math(`${a} times ${b} times ${c} = ${answer}`)}.`,
      };
    }
    if (difficulty === 2) {
      const rep = optOne(o, 'repeat', 'either');
      const repeat = rep === 'either' ? rng.next() < 0.5 : rep === 'yes';
      const letters = rng.int(2, 3), digits = rng.int(3, 4);
      const count = repeat ? 26 ** letters * 10 ** digits : nPr(26, letters) * nPr(10, digits);
      const other = repeat ? nPr(26, letters) * nPr(10, digits) : 26 ** letters * 10 ** digits;
      const factors = repeat
        ? [...Array(letters).fill('26'), ...Array(digits).fill('10')]
        : [...Array.from({ length: letters }, (_, i) => String(26 - i)), ...Array.from({ length: digits }, (_, i) => String(10 - i))];
      const thing = rng.pick(CODE_NAMES);
      return {
        body: `A ${thing} has ${letters} letters followed by ${digits} digits. How many ${thing}s are possible if ${repeat ? 'letters and digits may be repeated' : 'no letter or digit may be repeated'}?`,
        answer: num(count),
        distractors: [other, 26 * letters * 10 * digits, nCr(26, letters) * nCr(10, digits)].filter((v) => v !== count).map(num),
        solution: `Fill each position in turn: ${math(`${factors.join(' times ')} = ${grouped(count)}`)}.`,
      };
    }
    if (difficulty === 4) return digitNumbers(rng, optOne(o, 'repeat', 'either'));
    const n = rng.int(5, Math.min(9, Math.max(6, optNum(o, 'size', 8))));
    const [r1, r2] = [rng.int(2, 3), rng.int(4, 5)].map((r) => Math.min(r, n));
    const answer = nPr(n, r1) + nPr(n, r2);
    const things = rng.pick(CASE_NAMES);
    return {
      body: `How many ${r1}-digit or ${r2}-digit ${things} can be made from the digits 1 to ${n} if no digit is repeated?`,
      answer: num(answer),
      distractors: [nPr(n, r1) * nPr(n, r2), n ** r1 + n ** r2, nCr(n, r1) + nCr(n, r2)].filter((v) => v !== answer).map(num),
      solution: `The cases do not overlap, so add them: ${math(`${P(n, r1)} + ${P(n, r2)} = ${nPr(n, r1)} + ${grouped(nPr(n, r2))} = ${grouped(answer)}`)}.`,
    };
  },
});

/** n-digit numbers from the digits 0 to 9: the first digit cannot be 0, and the last decides odd or even. */
function digitNumbers(rng: Rng, rep: string) {
  const len = rng.int(3, 4);
  const repeat = rep === 'either' ? rng.next() < 0.5 : rep === 'yes';
  const kind = rng.pick(['any', 'odd', 'even'] as const);
  const middle = (avail: number, k: number) => (repeat ? 10 ** k : nPr(avail, k));
  const slots = (first: number | string, rest: number[], last?: number | string) => [first, ...rest, ...(last === undefined ? [] : [last])].join(' times ');
  const restDigits = (avail: number, k: number) => Array.from({ length: k }, (_, i) => (repeat ? 10 : avail - i));
  let answer: number, solution: string;
  if (kind === 'any') {
    answer = 9 * middle(9, len - 1);
    solution = `The first digit cannot be 0, so it has 9 choices; fill the others in turn: ${math(`${slots(9, restDigits(9, len - 1))} = ${grouped(answer)}`)}.`;
  } else if (repeat) {
    answer = 9 * 10 ** (len - 2) * 5;
    solution = `Fill the restricted positions first. The last digit must be ${kind} (5 choices), the first cannot be 0 (9 choices), and each middle digit has 10: ${math(`${slots(9, restDigits(0, len - 2), 5)} = ${grouped(answer)}`)}.`;
  } else if (kind === 'odd') {
    answer = 5 * 8 * nPr(8, len - 2);
    solution = `Fill the restricted positions first. The last digit is odd (5 choices); the first cannot be 0 or the last digit (8 choices); then the middle: ${math(`${slots(8, restDigits(8, len - 2), 5)} = ${grouped(answer)}`)}.`;
  } else {
    const zero = nPr(9, len - 1), other = 4 * 8 * nPr(8, len - 2);
    answer = zero + other;
    solution = `Use cases, because 0 cannot be first. Ending in 0: ${math(`${slots(9, restDigits(8, len - 2), 1)} = ${grouped(zero)}`)}. Ending in 2, 4, 6, or 8: the first digit cannot be 0 or the last digit, ${math(`${slots(8, restDigits(8, len - 2), 4)} = ${grouped(other)}`)}. Add: ${math(`${grouped(zero)} + ${grouped(other)} = ${grouped(answer)}`)}.`;
  }
  const naive = kind === 'any' ? (repeat ? 10 ** len : nPr(10, len)) : (repeat ? 10 ** (len - 1) * 5 : 5 * nPr(9, len - 1));
  const candidates = [naive, repeat ? nPr(10, len) : 10 ** len, kind === 'any' ? 9 * nPr(9, len - 1) / 2 : answer * 2, kind === 'even' ? 5 * 8 * nPr(8, len - 2) : 9 * nPr(9, len - 1)];
  return {
    body: `How many ${len}-digit ${kind === 'any' ? '' : `${kind} `}numbers can be made from the digits 0 to 9 if ${repeat ? 'digits may be repeated' : 'no digit may be repeated'}? (A number cannot begin with 0.)`,
    answer: num(answer),
    distractors: [...new Set(candidates)].filter((v) => v !== answer && Number.isInteger(v)).map(num),
    solution,
  };
}

/** `n!`, `(n + 2)!`, `(n - 1)!`. */
const nFact = (k: number) => (k === 0 ? 'n!' : `(n ${k > 0 ? '+' : '-'} ${Math.abs(k)})!`);
/** `n`, `(n + 2)`, `(n - 1)`. */
const nTerm = (k: number) => (k === 0 ? 'n' : `(n ${k > 0 ? '+' : '-'} ${Math.abs(k)})`);

export const pcFactorial = pc40s('40s-pc-factorial', {
  points: 1,
  levels: { 1: 'Evaluate n!/r!', 2: 'Evaluate quotients of three factorials', 3: 'Simplify algebraic factorials' },
  options: [
    radioOption('form', 'Task', [['1', 'Evaluate n!/r!'], ['2', 'Evaluate quotients of three factorials'], ['3', 'Simplify algebraic factorials'], ['4', 'Solve a factorial equation, like (n + 2)!/n! = 56']], ['1', '2', '3']),
    sizeOption([8, 10, 12, 15], [10, 12, 12], 'Largest n (evaluating)'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl);
    if (difficulty === 4) {
      // (n + a)!/(n + b)! = k with a = b + 2: (n + b + 2)(n + b + 1) = k.
      const n = rng.int(3, 12), b = rng.pick([-2, -1, 0, 1]), a = b + 2;
      const k = (n + a) * (n + a - 1);
      const other = -n - 2 * a + 1; // the other root of (n + a)(n + a − 1) = k
      const quad = poly([1, 2 * a - 1, a * (a - 1) - k], 'n');
      return {
        body: `Solve for ${math('n')}: ${math(`${nFact(a)}/${nFact(b)} = ${k}`)}`,
        answer: math(`n = ${n}`),
        distractors: [...new Set([`n = ${n} "or" n = ${other}`, `n = ${n + a - 1}`, `n = ${n + 1}`, `n = ${n - 1}`, `n = ${other}`])].filter((d) => d !== `n = ${n}`).slice(0, 4).map(math),
        solution: `Write ${math(nFact(a))} down to ${math(nFact(b))}: ${math(`${nFact(a)} = ${nTerm(a)}${nTerm(a - 1)} dot ${nFact(b)}`)}. Cancel to get ${math(`${nTerm(a)}${nTerm(a - 1)} = ${k}`)}, so ${math(`${quad} = 0`)} and ${math(`(n - ${n})(n + ${-other}) = 0`)}. `
          + `Reject ${math(`n = ${other}`)}, since ${math(nFact(b))} needs ${math(`${b === 0 ? 'n' : `n ${b > 0 ? '+' : '-'} ${Math.abs(b)}`} >= 0`)}; ${math(`n = ${n}`)}.`,
      };
    }
    if (difficulty < 3) {
      const n = rng.int(6, optNum(o, 'size', difficulty === 1 ? 10 : 12)), r = rng.int(2, n - 2);
      const expr = difficulty === 1 ? `${n}!/${n - r}!` : `${n}!/(${r}! ${n - r}!)`;
      const answer = difficulty === 1 ? nPr(n, r) : nCr(n, r);
      return {
        body: `Evaluate: ${math(expr)}`,
        answer: num(answer),
        distractors: [difficulty === 1 ? nCr(n, r) : nPr(n, r), factorial(r), difficulty === 1 ? n / (n - r) : answer * 2, n * r].filter((v) => v !== answer && Number.isInteger(v)).map(num),
        solution: difficulty === 1
          ? `Cancel ${math(`${n - r}!`)}: ${math(`${n}!/${n - r}! = ${Array.from({ length: r }, (_, i) => n - i).join(' dot ')} = ${grouped(answer)}`)}.`
          : `Cancel the larger factorial in the denominator: ${math(`${n}!/(${r}! ${n - r}!) = (${Array.from({ length: Math.min(r, n - r) }, (_, i) => n - i).join(' dot ')})/${Math.min(r, n - r)}! = ${grouped(answer)}`)}.`,
      };
    }
    const [top, bottom] = rng.pick([[2, 0], [1, -1], [0, -2], [3, 1], [-1, 1]] as const);
    const f = nFact;
    const low = Math.min(top, bottom), high = Math.max(top, bottom);
    const factors = Array.from({ length: high - low }, (_, i) => high - i).map((k) => (k === 0 ? 'n' : `(n ${k > 0 ? '+' : '-'} ${Math.abs(k)})`)).join('');
    const answer = top > bottom ? factors : `1/(${factors})`;
    return {
      body: `Simplify: ${math(`${f(top)}/${f(bottom)}`)}`,
      answer: math(answer),
      distractors: [top > bottom ? `1/(${factors})` : factors, `${f(top - bottom)}`, top > bottom ? String(top - bottom) : `1/${bottom - top}`].map(math),
      solution: `Write the larger factorial down to the smaller one: ${math(`${f(high)} = ${factors} dot ${f(low)}`)}, then cancel ${math(f(low))}. The result is ${math(answer)}.`,
    };
  },
});

export const pcPermutations = pc40s('40s-pc-permutations', {
  levels: { 1: 'Arrange all n objects', 2: 'ₙPᵣ in context', 3: 'Arrangements of letters' },
  options: [radioOption('n', 'Number of objects (levels 1 and 2)', [['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']], ['medium', 'medium', 'medium'], 'Level 1: 4–6, 7–9, or 10–12 objects. Level 2: 6–10, 11–20, or 21–30 members.')],
  generate(rng, difficulty, o) {
    const size = optOne(o, 'n', 'medium');
    if (difficulty === 1) {
      const n = size === 'small' ? rng.int(4, 6) : size === 'medium' ? rng.int(7, 9) : rng.int(10, 12);
      const body = rng.pick([
        `In how many ways can ${n} different books on a shelf be arranged?`,
        `In how many ways can ${n} runners in a line be arranged?`,
        `In how many ways can ${n} students in a row for a photo be arranged?`,
        `In how many different orders can ${n} songs be played on a playlist?`,
        `In how many orders can ${n} students give their presentations?`,
        `In how many ways can ${n} different trophies be lined up in a display case?`,
        `In how many orders can ${n} floats travel in a parade?`,
        `In how many ways can ${n} cars park in a row of ${n} parking spots?`,
        `In how many orders can ${n} bands perform at a music festival?`,
      ]);
      return {
        body,
        answer: num(factorial(n)),
        distractors: [n * n, factorial(n - 1), n ** n > 1e7 ? 2 * factorial(n - 1) : n ** n].filter((v) => v !== factorial(n)).map(num),
        solution: `${n} choices for the first position, ${n - 1} for the next, and so on: ${math(`${n}! = ${grouped(factorial(n))}`)}.`,
      };
    }
    if (difficulty === 2) {
      const n = size === 'small' ? rng.int(6, 10) : size === 'medium' ? rng.int(11, 20) : rng.int(21, 30), r = rng.int(2, 4);
      const list = (items: string[]) => `${items.slice(0, -1).join(', ')}${items.length > 2 ? ',' : ''} and ${items[items.length - 1]}`;
      const answer = nPr(n, r);
      const body = rng.pick([
        `A club of ${n} members elects a ${list(['president', 'vice-president', 'secretary', 'treasurer'].slice(0, r))}. In how many ways can this be done if no one holds two positions?`,
        `${n} students enter an art contest with ${r} different prizes: ${list(['first', 'second', 'third', 'fourth'].slice(0, r))} prize. In how many ways can the prizes be awarded if no student wins more than one?`,
        `${n} horses run in a race. In how many ways can the first ${r} places be filled, if there are no ties?`,
        `A band knows ${n} songs and will play ${r} of them, in order, at a school dance. How many different set lists are possible?`,
        `${r} cars arrive at a parking lot with ${n} empty numbered spots. In how many ways can they park, one car to a spot?`,
        `At a camp, ${r} different jobs (${list(['cooking', 'collecting firewood', 'washing dishes', 'fetching water'].slice(0, r))}) are given to ${r} of the ${n} campers. In how many ways can the jobs be assigned if each camper gets at most one?`,
        `A track team with ${n} runners picks ${r} of them to run the ${list(['first', 'second', 'third', 'fourth'].slice(0, r))} legs of a relay. In how many ways can the legs be filled?`,
      ]);
      return {
        body,
        answer: num(answer),
        distractors: [nCr(n, r), n ** r, factorial(r) * n].filter((v) => v !== answer).map(num),
        solution: `Order matters (each position is different): ${math(`${P(n, r)} = ${n}!/${n - r}! = ${grouped(answer)}`)}.`,
      };
    }
    const first = rng.pick(DISTINCT_WORDS);
    const r = rng.int(3, 5);
    const word = sameShape(rng, first, DISTINCT_POOL, (w) => String(w.length));
    const answer = nPr(word.length, r);
    return {
      body: `How many ${r}-letter arrangements can be made from the letters of ${word}, if each letter is used at most once?`,
      answer: num(answer),
      distractors: [nCr(word.length, r), word.length ** r, factorial(word.length)].filter((v) => v !== answer).map(num),
      solution: `${word} has ${word.length} different letters. Choose and order ${r} of them: ${math(`${P(word.length, r)} = ${grouped(answer)}`)}.`,
    };
  },
});

/** Grid-route settings: the two kinds of step, and how the question is put. */
const ROUTES: Array<{ steps: [string, string]; text: (a: number, b: number) => string }> = [
  { steps: ['R', 'D'], text: (a, b) => `A path on a grid moves only right or down. How many shortest routes lead from the top-left corner to a point ${a} blocks right and ${b} blocks down?` },
  { steps: ['E', 'S'], text: (a, b) => `A taxi drives through a city grid, going only east or south. How many shortest routes lead to a corner ${a} blocks east and ${b} blocks south of where it starts?` },
  { steps: ['R', 'U'], text: (a, b) => `A robot on a grid moves one square right or one square up at a time. How many different paths take it ${a} squares right and ${b} squares up?` },
  { steps: ['E', 'N'], text: (a, b) => `A student walks to school through a grid of streets, always heading east or north. The school is ${a} blocks east and ${b} blocks north of home. How many shortest routes are there?` },
  { steps: ['R', 'D'], text: (a, b) => `A game piece starts in the top-left square of a board and moves only right or down. How many paths take it ${a} squares right and ${b} squares down?` },
];

export const pcIdentical = pc40s('40s-pc-identical', {
  levels: { 1: 'One repeated letter', 2: 'Several repeated letters', 3: 'Grid routes' },
  options: [
    radioOption('form', 'Problem', [['1', 'One repeated letter'], ['2', 'Several repeated letters'], ['3', 'Grid routes'], ['4', 'Repeated letters with a condition (begins with, kept together)']], ['1', '2', '3']),
    sizeOption([5, 7, 10], [7, 7, 7], 'Largest grid side (routes)'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3 | 4;
    if (difficulty === 4) return repeatedWithCondition(rng);
    if (difficulty === 3) {
      const G = optNum(o, 'size', 7);
      const a = rng.int(3, G), b = rng.int(2, G - 2);
      const answer = nCr(a + b, a);
      const route = rng.pick(ROUTES);
      const [s1, s2] = route.steps;
      return {
        body: route.text(a, b),
        answer: num(answer),
        distractors: [factorial(a + b), a * b, 2 ** (a + b)].filter((v) => v !== answer).map(num),
        solution: `Each route is an arrangement of ${a} ${s1}'s and ${b} ${s2}'s: ${math(`(${a + b})!/(${a}! ${b}!) = ${grouped(answer)}`)}.`,
      };
    }
    const words = REPEATED_WORDS.filter((w) => (letterCounts(w).length === 1) === (difficulty === 1));
    const word = sameShape(rng, rng.pick(words), REPEATED_POOL, repeatShape);
    const repeats = letterCounts(word);
    const answer = factorial(word.length) / repeats.reduce((acc, [, k]) => acc * factorial(k), 1);
    const denom = repeats.map(([, k]) => `${k}!`).join(' ');
    return {
      body: `How many different arrangements of all the letters of ${word} are possible?`,
      task: { instruction: 'How many different arrangements of all the letters of each word are possible?', item: word },
      answer: num(answer),
      // Ignoring the repeats, doubling, halving, or dividing by one factorial of all the repeated letters.
      distractors: [factorial(word.length), answer * 2, answer / 2, factorial(word.length) / factorial(repeats.reduce((acc, [, k]) => acc + k, 0)), factorial(word.length - 1), 2 * factorial(word.length - 1)].filter((v) => v !== answer && Number.isInteger(v)).map(num),
      solution: `${word} has ${word.length} letters with ${repeats.map(([ch, k]) => `${k} ${ch}'s`).join(', ')}. Divide by the arrangements of the identical letters: ${math(`${word.length}!/(${denom}) = ${grouped(answer)}`)}.`,
    };
  },
});

/** Arrangements of a word with repeated letters that begin with a letter, begin and end with it, or keep its copies together. */
function repeatedWithCondition(rng: Rng) {
  const word = rng.pick(REPEATED_POOL.filter((w) => w.length <= 10));
  const counts = allCounts(word);
  const repeated = letterCounts(word);
  const kind = rng.pick(['begin', 'ends', 'together'] as const);
  const all = arrangements(counts.map(([, k]) => k));
  const plainAll = factorial(word.length);
  let body: string, answer: number, solution: string, wrong: number;
  if (kind === 'begin') {
    const letter = rng.pick([...word]);
    const rest = counts.map(([ch, k]) => (ch === letter ? k - 1 : k)).filter((k) => k > 0);
    answer = arrangements(rest);
    // Forgetting that one copy of the letter is used up.
    wrong = factorial(word.length - 1) / counts.reduce((acc, [, k]) => acc * factorial(k), 1);
    body = `How many arrangements of all the letters of ${word} begin with ${letter}?`;
    solution = `Place ${letter} first. Arrange the other ${word.length - 1} letters, dividing by the repeated letters that remain: ${math(`${word.length - 1}!${overRepeats(rest)} = ${grouped(answer)}`)}.`;
  } else if (kind === 'ends') {
    const [letter] = rng.pick(repeated);
    const rest = counts.map(([ch, k]) => (ch === letter ? k - 2 : k)).filter((k) => k > 0);
    answer = arrangements(rest);
    wrong = 2 * answer;
    body = `How many arrangements of all the letters of ${word} begin and end with ${letter}?`;
    solution = `Place ${letter} at both ends (the ${letter}'s are identical, so this can be done 1 way). Arrange the middle ${word.length - 2} letters: ${math(`${word.length - 2}!${overRepeats(rest)} = ${grouped(answer)}`)}.`;
  } else {
    const [letter, k] = rng.pick(repeated);
    const rest = [1, ...counts.filter(([ch]) => ch !== letter).map(([, m]) => m)];
    answer = arrangements(rest);
    // Ordering identical letters inside the block.
    wrong = answer * factorial(k);
    body = `How many arrangements of all the letters of ${word} have all ${k} ${letter}'s together?`;
    solution = `Treat the ${k} ${letter}'s as one block; identical letters inside it can be arranged only 1 way. Arrange the block and the other ${word.length - k} letters (${word.length - k + 1} items): ${math(`${word.length - k + 1}!${overRepeats(rest)} = ${grouped(answer)}`)}.`;
  }
  return {
    body,
    answer: num(answer),
    distractors: [...new Set([wrong, all, plainAll / word.length, factorial(word.length - 1), answer * 2, answer / 2])].filter((v) => v !== answer && Number.isInteger(v)).slice(0, 4).map(num),
    solution,
  };
}

/** One person in a fixed place: at an end, or first. */
const FIXED_SETTINGS: Array<(n: number, p: string, ends: boolean) => string> = [
  (n, p, ends) => `${n} people, including ${p}, line up for a photo. In how many ways can they line up if ${p} must stand ${ends ? 'at one of the ends' : 'first in line'}?`,
  (n, p, ends) => `${n} students, including ${p}, line up at the cafeteria. In how many ways can they line up if ${p} must be ${ends ? 'first or last' : 'first'}?`,
  (n, p, ends) => `${n} runners, including ${p}, are each given one of lanes 1 to ${n}. In how many ways can the lanes be assigned if ${p} must run in ${ends ? 'one of the two outside lanes' : 'lane 1'}?`,
  (n, p, ends) => `${n} singers, including ${p}, perform one after another at a concert. How many orders are possible if ${p} must sing ${ends ? 'either first or last' : 'first'}?`,
  (n, p, ends) => `${n} students, including ${p}, give speeches at an assembly. How many speaking orders are possible if ${p} must speak ${ends ? 'first or last' : 'last'}?`,
];

/** Two items that must, or must not, be side by side. */
const PAIR_SETTINGS: Array<(n: number, p1: string, p2: string, apart: boolean) => { body: string; pair: string }> = [
  (n, p1, p2, apart) => ({ pair: `${p1} and ${p2}`, body: `In how many ways can ${n} people, including ${p1} and ${p2}, sit in a row if ${p1} and ${p2} ${apart ? 'must not' : 'must'} sit together?` }),
  (n, p1, p2, apart) => ({ pair: `${p1} and ${p2}`, body: `${n} friends, including ${p1} and ${p2}, stand in a line for a photo. How many arrangements are possible if ${p1} and ${p2} ${apart ? 'refuse to stand' : 'insist on standing'} next to each other?` }),
  (n, _p1, _p2, apart) => ({ pair: 'the dictionary and the atlas', body: `${n} different books, including a dictionary and an atlas, are placed on a shelf. In how many ways can this be done if the dictionary and the atlas ${apart ? 'must not be' : 'must be'} side by side?` }),
  (n, _p1, _p2, apart) => ({ pair: 'the fire truck and the police car', body: `${n} vehicles, including a fire truck and a police car, drive in a parade. How many orders are possible if the fire truck and the police car ${apart ? 'must not be' : 'must be'} next to each other?` }),
  (n, _p1, _p2, apart) => ({ pair: 'the two songs by that artist', body: `A playlist has ${n} different songs, including two by the same artist. How many orders are possible if those two songs ${apart ? 'must not' : 'must'} play back to back?` }),
];

/** Groups kept together: what the items are, and how each group is described. */
const BLOCK_SETTINGS: Array<{ intro: string; kinds: string[]; rule: string }> = [
  { intro: 'are placed on a shelf', kinds: ['math books', 'science books', 'novels'], rule: 'books on the same subject must be together' },
  { intro: 'sit in a row for a photo', kinds: ['grade 10 students', 'grade 11 students', 'grade 12 students'], rule: 'students in the same grade must sit together' },
  { intro: 'are put on a playlist', kinds: ['songs by one band', 'songs by a second band', 'songs by a third band'], rule: 'songs by the same band must play together' },
  { intro: 'are planted in a row', kinds: ['tomato plants', 'pepper plants', 'bean plants'], rule: 'plants of the same kind must be together' },
  { intro: 'are hung in a row on a wall', kinds: ['paintings', 'photographs', 'drawings'], rule: 'artwork of the same kind must hang together' },
];
const ALTERNATING_WORDS = ['PAINTER', 'HOLIDAY', 'POTATO', 'TOMATO', 'BANANA', 'DOMINO', 'AVOCADO', 'PIANO', 'PORTAGE', 'MANITOBA']
  .filter((w) => Math.abs(2 * vowelCount(w) - w.length) <= 1);

export const pcConditions = pc40s('40s-pc-conditions', {
  levels: { 1: 'A fixed position', 2: 'Together or apart', 3: 'Letters with a vowel condition' },
  options: [
    radioOption('form', 'Condition', [['1', 'A fixed position'], ['2', 'Together or apart'], ['3', 'Letters with a vowel condition'], ['4', 'Vowels and consonants alternate'], ['5', 'Groups kept together (answer as an expression)']], ['1', '2', '3']),
    sizeOption([6, 8, 10], [8, 8, 8], 'Largest group of people'),
    radioOption('together', 'Together or apart', [['together', 'Together'], ['apart', 'Apart'], ['either', 'Either']], ['either', 'either', 'either']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3 | 4 | 5;
    const n = rng.int(5, optNum(o, 'size', 8));
    const [p1, p2] = rng.shuffle(NAMES).slice(0, 2);
    if (difficulty === 1) {
      const ends = rng.next() < 0.5;
      const answer = (ends ? 2 : 1) * factorial(n - 1);
      return {
        body: rng.pick(FIXED_SETTINGS)(n, p1, ends),
        answer: num(answer),
        distractors: [factorial(n), (ends ? 1 : 2) * factorial(n - 1), factorial(n - 1) * (n - 1)].filter((v) => v !== answer).map(num),
        solution: `Place ${p1} in the required spot first (${ends ? '2 choices' : '1 choice'}), then arrange the other ${n - 1}: ${math(`${ends ? '2 dot ' : ''}${n - 1}! = ${grouped(answer)}`)}.`,
      };
    }
    if (difficulty === 2) {
      const together = 2 * factorial(n - 1);
      const tg = optOne(o, 'together', 'either');
      const apart = tg === 'either' ? rng.next() < 0.5 : tg === 'apart';
      const answer = apart ? factorial(n) - together : together;
      const { body, pair } = rng.pick(PAIR_SETTINGS)(n, p1, p2, apart);
      return {
        body,
        answer: num(answer),
        distractors: [apart ? together : factorial(n) - together, factorial(n - 1), factorial(n) - factorial(n - 1)].filter((v) => v !== answer).map(num),
        solution: apart
          ? `Count the arrangements with them together (treat ${pair} as one unit that can be ordered 2 ways): ${math(`2 dot ${n - 1}! = ${grouped(together)}`)}. Subtract from all arrangements: ${math(`${n}! - ${grouped(together)} = ${grouped(answer)}`)}.`
          : `Treat ${pair} as one unit, which can be ordered 2 ways: ${math(`2 dot ${n - 1}! = ${grouped(answer)}`)}.`,
      };
    }
    if (difficulty === 4) return alternating(rng);
    if (difficulty === 5) return blocks(rng);
    const first = rng.pick(DISTINCT_WORDS);
    const together = rng.next() < 0.5;
    const word = sameShape(rng, first, DISTINCT_POOL, vowelShape);
    const vowels = vowelCount(word);
    const consonants = word.length - vowels;
    const answer = together ? factorial(consonants + 1) * factorial(vowels) : vowels * factorial(word.length - 1);
    return {
      body: together
        ? `How many arrangements of the letters of ${word} have all the vowels together?`
        : `How many arrangements of the letters of ${word} begin with a vowel?`,
      answer: num(answer),
      distractors: [factorial(word.length), together ? factorial(consonants + 1) : factorial(word.length - 1), together ? factorial(consonants) * factorial(vowels) : consonants * factorial(word.length - 1)].filter((v) => v !== answer).map(num),
      solution: together
        ? `Treat the ${vowels} vowels as one block: arrange ${consonants} consonants and the block in ${math(`${consonants + 1}!`)} ways, and the vowels inside the block in ${math(`${vowels}!`)} ways. ${math(`${consonants + 1}! dot ${vowels}! = ${grouped(answer)}`)}.`
        : `${word} has ${vowels} vowels. Choose the first letter (${vowels} ways), then arrange the other ${word.length - 1}: ${math(`${vowels} dot ${word.length - 1}! = ${grouped(answer)}`)}.`,
    };
  },
});

/** Arrangements in which vowels and consonants alternate (possibly with repeated letters). */
function alternating(rng: Rng) {
  const word = rng.pick(ALTERNATING_WORDS);
  const v = [...word].filter(isVowel), c = [...word].filter((ch) => !isVowel(ch));
  const vCounts = allCounts(v.join('')).map(([, k]) => k), cCounts = allCounts(c.join('')).map(([, k]) => k);
  const vWays = arrangements(vCounts), cWays = arrangements(cCounts);
  const both = v.length === c.length;
  const answer = (both ? 2 : 1) * vWays * cWays;
  const repeats = [...letterCounts(word)];
  const pattern = both ? 'VCVC… or CVCV…' : v.length > c.length ? 'VCV…V' : 'CVC…C';
  return {
    body: `How many arrangements of all the letters of ${word} have vowels and consonants alternating?`,
    answer: num(answer),
    distractors: [...new Set([both ? answer / 2 : answer * 2, factorial(v.length) * factorial(c.length) * (both ? 2 : 1), factorial(word.length), factorial(v.length) * factorial(c.length) * (both ? 1 : 2), vWays + cWays, factorial(word.length - 1)])]
      .filter((x) => x !== answer && Number.isInteger(x)).slice(0, 4).map(num),
    solution: `${word} has ${v.length} vowels and ${c.length} consonants, so the pattern must be ${pattern}${both ? ' (2 patterns)' : ' (1 pattern)'}. `
      + `Arrange the vowels in their places (${math(`${v.length}!${overRepeats(vCounts)} = ${vWays}`)}) and the consonants in theirs (${math(`${c.length}!${overRepeats(cCounts)} = ${cWays}`)})${repeats.length ? `, dividing by the repeated ${repeats.map(([ch]) => ch).join(' and ')}` : ''}: `
      + `${math(`${both ? '2 dot ' : ''}${vWays} dot ${cWays} = ${grouped(answer)}`)}.`,
  };
}

/** Different items in groups, each group kept together: g! orders of the groups times each group's own order. */
function blocks(rng: Rng) {
  const g = rng.int(2, 3);
  const sizes = Array.from({ length: g }, () => rng.int(2, 4));
  const setting = rng.pick(BLOCK_SETTINGS);
  const listed = sizes.map((k, i) => `${k} different ${setting.kinds[i]}`);
  const items = `${listed.slice(0, -1).join(', ')}${g > 2 ? ',' : ''} and ${listed[g - 1]}`;
  const answer = factorial(g) * sizes.reduce((acc, k) => acc * factorial(k), 1);
  const insides = sizes.map((k) => `${k}!`).join(' dot ');
  const total = sizes.reduce((a, k) => a + k, 0);
  const expr = (text: string, value: number) => ({ text, value });
  const choices = [
    expr(`${insides}`, sizes.reduce((acc, k) => acc * factorial(k), 1)),
    expr(`${total}!`, factorial(total)),
    expr(`${g}! dot ${total}!`, factorial(g) * factorial(total)),
    expr(`${g} dot ${insides}`, g * sizes.reduce((acc, k) => acc * factorial(k), 1)),
    expr(`${g}! (${sizes.join(' + ')})`, factorial(g) * total),
  ];
  const seen = new Set([answer]);
  const distractors = choices.filter((ch) => !seen.has(ch.value) && seen.add(ch.value)).slice(0, 4).map((ch) => math(`${ch.text} = ${grouped(ch.value)}`));
  return {
    body: `${items} ${setting.intro}. How many arrangements are possible if ${setting.rule}?`.replace(/^./, (ch) => ch.toUpperCase()),
    answer: math(`${g}! dot ${insides} = ${grouped(answer)}`),
    distractors,
    solution: `Treat each group as one block: the ${g} blocks can be ordered in ${math(`${g}!`)} ways. Inside the blocks, the items can be ordered in ${math(insides)} ways. Multiply: ${math(`${g}! dot ${insides} = ${grouped(answer)}`)}.`,
  };
}

/** Solve a quadratic with integer roots, n² + bn + c = 0, returning the roots. */
function roots(b: number, c: number): number[] {
  const disc = b * b - 4 * c;
  const s = Math.sqrt(disc);
  return [(-b + s) / 2, (-b - s) / 2];
}

export const pcNprEquation = pc40s('40s-pc-npr-equation', {
  levels: { 1: 'ₙP₂ = k', 2: '₍ₙ₊₁₎P₂ = k', 3: 'ₙP₄ = k · ₙP₂' },
  options: [
    radioOption('form', 'Equation', [['1', 'ₙP₂ = k'], ['2', '₍ₙ₊₁₎P₂ = k'], ['3', 'ₙP₄ = k · ₙP₂']], ['1', '2', '3']),
    sizeOption([10, 15, 25], [15, 15, 15], 'Largest n'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    if (difficulty === 3) {
      const n = rng.int(5, Math.max(6, optNum(o, 'size', 15) - 3));
      const k = (n - 2) * (n - 3);
      const [r1, r2] = roots(-5, 6 - k);
      return {
        body: `Solve for ${math('n')}: ${math(`${P('n', 4)} = ${k} dot ${P('n', 2)}`)}`,
        answer: math(`n = ${n}`),
        distractors: [`n = ${n} "or" n = ${Math.min(r1, r2)}`, `n = ${n + 1}`, `n = ${k + 2}`].map(math),
        solution: `${math(`n!/(n - 4)! = ${k} dot n!/(n - 2)!`)} simplifies to ${math(`(n - 2)(n - 3) = ${k}`)}, so ${math(`n^2 - 5n ${6 - k < 0 ? '-' : '+'} ${Math.abs(6 - k)} = 0`)} and ${math(`n = ${Math.max(r1, r2)}`)} or ${math(`n = ${Math.min(r1, r2)}`)}. Since ${math('n >= 4')}, ${math(`n = ${n}`)}.`,
      };
    }
    const shift = difficulty === 2 ? 1 : 0;
    const n = rng.int(4, optNum(o, 'size', 15));
    const m = n + shift; // mP2 = m(m − 1)
    const k = m * (m - 1);
    const other = -(m - 1) - shift;
    const label = shift ? `(n + 1)` : 'n';
    return {
      body: `Solve for ${math('n')}: ${math(`${P(label, 2)} = ${k}`)}`,
      answer: math(`n = ${n}`),
      distractors: [`n = ${n} "or" n = ${other}`, `n = ${other}`, `n = ${n + 1}`].map(math),
      solution: `${math(`${label}!/(${shift ? 'n - 1' : 'n - 2'})! = ${k}`)} gives ${math(`${shift ? '(n + 1)n' : 'n(n - 1)'} = ${k}`)}, so ${math(`n^2 ${shift ? '+' : '-'} n - ${k} = 0`)} and ${math(`(n - ${n})(n + ${-other}) = 0`)}. `
        + `Reject ${math(`n = ${other}`)}; ${math(`n = ${n}`)}.`,
    };
  },
});

/** Two groups to choose from: the whole selection, each group in the singular and plural. */
const TWO_GROUPS: Array<{ unit: string; a: [string, string]; b: [string, string] }> = [
  { unit: 'committee', a: ['teacher', 'teachers'], b: ['student', 'students'] },
  { unit: 'team', a: ['grade 11 student', 'grade 11 students'], b: ['grade 12 student', 'grade 12 students'] },
  { unit: 'lineup', a: ['forward', 'forwards'], b: ['defence player', 'defence players'] },
  { unit: 'panel', a: ['parent', 'parents'], b: ['coach', 'coaches'] },
  { unit: 'playlist', a: ['country song', 'country songs'], b: ['rock song', 'rock songs'] },
  { unit: 'reading list', a: ['novel', 'novels'], b: ['biography', 'biographies'] },
];

/** A selection with one or two particular members: who they are, and the whole set. */
const PARTICULAR: Array<{ text: (n: number, r: number) => string; one: string; two: string; them: string }> = [
  { text: (n, r) => `A committee of ${r} is chosen from ${n} people`, one: 'Ana', two: 'Ben', them: 'people' },
  { text: (n, r) => `A coach chooses ${r} players for a tournament from ${n} players`, one: 'the captain', two: 'the goalie', them: 'players' },
  { text: (n, r) => `A pizza is made with ${r} different toppings from a menu of ${n}`, one: 'pepperoni', two: 'pineapple', them: 'toppings' },
  { text: (n, r) => `A band chooses ${r} of its ${n} songs for a short set`, one: 'its hit single', two: 'its newest song', them: 'songs' },
  { text: (n, r) => `A student chooses ${r} of ${n} elective courses`, one: 'band', two: 'drama', them: 'courses' },
];

export const pcCombinations = pc40s('40s-pc-combinations', {
  levels: { 1: 'ₙCᵣ in context', 2: 'Choosing from two groups', 3: 'Card hands' },
  options: [
    radioOption('form', 'Situation', [['1', 'ₙCᵣ in context'], ['2', 'Choosing from two groups'], ['3', 'Card hands'], ['4', 'A particular member must, or must not, be chosen']], ['1', '2', '3']),
    radioOption('n', 'Group size (ₙCᵣ in context)', [['small', '6 to 10'], ['medium', '6 to 20'], ['large', '20 to 40']], ['medium', 'medium', 'medium']),
    radioOption('r', 'Number chosen (ₙCᵣ in context)', [['small', '2 or 3'], ['medium', '2 to 5'], ['large', '6 to 8']], ['medium', 'medium', 'medium']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl);
    if (difficulty === 1) {
      const ns = optOne(o, 'n', 'medium'), rs = optOne(o, 'r', 'medium');
      const r = rs === 'small' ? rng.int(2, 3) : rs === 'medium' ? rng.int(2, 5) : rng.int(6, 8);
      const n = Math.max(r + 2, ns === 'small' ? rng.int(6, 10) : ns === 'medium' ? rng.int(6, 20) : rng.int(20, 40));
      const setting = rng.pick([
        `a committee of ${r} from ${n} people`, `${r} toppings from a list of ${n}`, `${r} books to read from a list of ${n}`,
        `${r} players for a team from the ${n} who tried out`, `${r} questions to answer from ${n} on an exam`, `${r} shirts to pack from the ${n} in your closet`,
        `${r} board games to bring on a trip from a shelf of ${n}`, `${r} museums to visit on a trip from a list of ${n}`, `${r} flavours for a sampler from ${n} flavours`,
      ]);
      return {
        body: `In how many ways can you choose ${setting}?`,
        answer: num(nCr(n, r)),
        distractors: [nPr(n, r), n ** r, n * r].filter((v) => v !== nCr(n, r)).map(num),
        solution: `Order does not matter: ${math(`${C(n, r)} = ${n}!/(${r}! ${n - r}!) = ${grouped(nCr(n, r))}`)}.`,
      };
    }
    if (difficulty === 2) {
      const g = rng.int(5, 10), b = rng.int(4, 9), rg = rng.int(1, 3), rb = rng.int(1, 3);
      const answer = nCr(g, rg) * nCr(b, rb);
      const set = rng.pick(TWO_GROUPS);
      return {
        body: `A ${set.unit} of ${rg + rb} is chosen from ${g} ${set.a[1]} and ${b} ${set.b[1]}. How many ${set.unit}s have exactly ${rg} ${set.a[rg > 1 ? 1 : 0]} and ${rb} ${set.b[rb > 1 ? 1 : 0]}?`,
        answer: num(answer),
        distractors: [nCr(g, rg) + nCr(b, rb), nCr(g + b, rg + rb), nPr(g, rg) * nPr(b, rb)].filter((v) => v !== answer).map(num),
        solution: `Choose from each group, then multiply: ${math(`${C(g, rg)} dot ${C(b, rb)} = ${nCr(g, rg)} dot ${nCr(b, rb)} = ${grouped(answer)}`)}.`,
      };
    }
    if (difficulty === 4) return particular(rng);
    const k = rng.int(1, 4);
    const suit = rng.pick(['hearts', 'spades', 'diamonds', 'clubs']);
    const answer = nCr(13, k) * nCr(39, 5 - k);
    return {
      body: `How many 5-card hands from a standard 52-card deck contain exactly ${k} ${k === 1 ? suit.slice(0, -1) : suit}?`,
      answer: num(answer),
      distractors: [nCr(13, k), nCr(13, k) + nCr(39, 5 - k), nCr(52, 5) - nCr(39, 5)].filter((v) => v !== answer).map(num),
      solution: `Choose ${k} of the 13 ${suit} and ${5 - k} of the other 39 cards: ${math(`${C(13, k)} dot ${C(39, 5 - k)} = ${grouped(answer)}`)}.`,
    };
  },
});

/** Selections that must include, must exclude, or must include both of, particular members. */
function particular(rng: Rng) {
  const n = rng.int(8, 14), r = rng.int(3, 5);
  const set = rng.pick(PARTICULAR);
  const kind = rng.pick(['in', 'out', 'both', 'notBoth'] as const);
  const cap = (t: string) => t.replace(/^./, (ch) => ch.toUpperCase());
  const cases = {
    in: { answer: nCr(n - 1, r - 1), cond: `${set.one} must be included`, work: `${set.one} is already chosen, so choose the other ${r - 1} from the remaining ${n - 1}: ${math(`${C(n - 1, r - 1)} = ${grouped(nCr(n - 1, r - 1))}`)}.` },
    out: { answer: nCr(n - 1, r), cond: `${set.one} must not be included`, work: `Leave out ${set.one} and choose all ${r} from the other ${n - 1}: ${math(`${C(n - 1, r)} = ${grouped(nCr(n - 1, r))}`)}.` },
    both: { answer: nCr(n - 2, r - 2), cond: `both ${set.one} and ${set.two} must be included`, work: `Both are already chosen, so choose the other ${r - 2} from the remaining ${n - 2}: ${math(`${C(n - 2, r - 2)} = ${grouped(nCr(n - 2, r - 2))}`)}.` },
    notBoth: { answer: nCr(n, r) - nCr(n - 2, r - 2), cond: `${set.one} and ${set.two} cannot both be included`, work: `Subtract the selections containing both from all selections: ${math(`${C(n, r)} - ${C(n - 2, r - 2)} = ${grouped(nCr(n, r))} - ${grouped(nCr(n - 2, r - 2))} = ${grouped(nCr(n, r) - nCr(n - 2, r - 2))}`)}.` },
  }[kind];
  const wrong = [nCr(n, r), nCr(n - 1, r - 1), nCr(n - 1, r), nCr(n - 2, r - 2), nCr(n - 2, r - 1), nCr(n, r) - nCr(n - 1, r - 1), nPr(n - 1, r - 1)];
  return {
    body: `${set.text(n, r)}. In how many ways can this be done if ${cases.cond}?`,
    answer: num(cases.answer),
    distractors: [...new Set(wrong)].filter((v) => v !== cases.answer).slice(0, 4).map(num),
    solution: cap(cases.work),
  };
}

export const pcCombinationCases = pc40s('40s-pc-combination-cases', {
  levels: { 1: 'At least one', 2: 'At least two (cases)', 3: 'At most, with larger groups' },
  options: [
    radioOption('form', 'Condition', [['1', 'At least one'], ['2', 'At least two (cases)'], ['3', 'At most, with larger groups']], ['1', '2', '3']),
    sizeOption([6, 8, 12], [8, 8, 8], 'Largest group'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const N = optNum(o, 'size', 8);
    const a = rng.int(4, N), b = rng.int(4, N);
    const r = difficulty === 3 ? rng.int(4, 6) : rng.int(3, 5);
    const [groupA, groupB, oneA] = rng.pick([
      ['girls', 'boys', 'girl'], ['grade 12 students', 'grade 11 students', 'grade 12 student'], ['women', 'men', 'woman'],
      ['teachers', 'parents', 'teacher'], ['forwards', 'defence players', 'forward'], ['rookies', 'veterans', 'rookie'],
      ['day-shift workers', 'night-shift workers', 'day-shift worker'], ['math students', 'science students', 'math student'],
    ]);
    if (difficulty === 1) {
      const answer = nCr(a + b, r) - nCr(b, r);
      return {
        body: `A team of ${r} is chosen from ${a} ${groupA} and ${b} ${groupB}. How many teams include at least one of the ${groupA}?`,
        answer: num(answer),
        distractors: [nCr(a + b, r), nCr(a, 1) * nCr(a + b - 1, r - 1), nCr(b, r)].filter((v) => v !== answer).map(num),
        solution: `Subtract the teams with none of the ${groupA} from all teams: ${math(`${C(a + b, r)} - ${C(b, r)} = ${grouped(nCr(a + b, r))} - ${nCr(b, r)} = ${grouped(answer)}`)}.`,
      };
    }
    const min = difficulty === 2 ? 2 : 0;
    const max = difficulty === 2 ? r : rng.int(1, 2);
    const cases = [];
    for (let k = min; k <= max; k++) if (k <= a && r - k <= b) cases.push(k);
    const answer = cases.reduce((sum, k) => sum + nCr(a, k) * nCr(b, r - k), 0);
    const phrase = difficulty === 2 ? `at least 2 ${groupA}` : `at most ${max} ${max === 1 ? oneA : groupA}`;
    return {
      body: `A committee of ${r} is chosen from ${a} ${groupA} and ${b} ${groupB}. How many committees have ${phrase}?`,
      answer: num(answer),
      distractors: [nCr(a + b, r) - answer, nCr(a, min || max) * nCr(a + b - (min || max), r - (min || max)), nCr(a + b, r)].filter((v) => v !== answer && v > 0).map(num),
      solution: `${cases.length > 1 ? 'Add the cases' : 'Only one case fits'}: ${math(cases.map((k) => `${C(a, k)} ${C(b, r - k)}`).join(' + '))} ${math(cases.length > 1 ? `= ${cases.map((k) => nCr(a, k) * nCr(b, r - k)).join(' + ')} = ${grouped(answer)}` : `= ${grouped(answer)}`)}.`,
    };
  },
});

export const pcNcrEquation = pc40s('40s-pc-ncr-equation', {
  levels: { 1: 'ₙC₂ = k', 2: '₍ₙ₊₁₎C₂ = k', 3: 'ₙC₃ = k · ₙC₁' },
  options: [
    radioOption('form', 'Equation', [['1', 'ₙC₂ = k'], ['2', '₍ₙ₊₁₎C₂ = k'], ['3', 'ₙC₃ = k · ₙC₁'], ['4', 'Symmetry: ₙCₐ = ₙC_b']], ['1', '2', '3']),
    sizeOption([10, 16, 25], [16, 16, 16], 'Largest n'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3 | 4;
    if (difficulty === 4) {
      if (rng.next() < 0.5) {
        // nCa = nCb with a ≠ b forces a + b = n.
        const a = rng.int(2, 5), b = a + rng.int(1, 4), n = a + b;
        return {
          body: `Solve for ${math('n')}: ${math(`${C('n', a)} = ${C('n', b)}`)}`,
          answer: math(`n = ${n}`),
          distractors: [`n = ${b - a}`, `n = ${a * b}`, `n = ${n + 1}`].map(math),
          solution: `Since ${math(`${C('n', 'r')} = ${C('n', 'n - r')}`)}, two different lower values give equal combinations only when they add to ${math('n')}: ${math(`n = ${a} + ${b} = ${n}`)}. Check: ${math(`${C(n, a)} = ${C(n, b)} = ${grouped(nCr(n, a))}`)}.`,
        };
      }
      // NCr = NC(r + d): r + (r + d) = N.
      const N = rng.int(8, Math.max(10, optNum(o, 'size', 16)));
      const d = rng.pick([1, 2, 3, 4].filter((v) => (N - v) % 2 === 0 && N - v >= 2));
      const r = (N - d) / 2;
      return {
        body: `Solve for ${math('r')}: ${math(`${C(N, 'r')} = ${C(N, `r + ${d}`)}`)}`,
        answer: math(`r = ${r}`),
        distractors: [...new Set([N - d, (N + d) / 2, d, r + 1])].filter((v) => v !== r && Number.isInteger(v)).slice(0, 3).map((v) => math(`r = ${v}`)),
        solution: `The lower values differ, so by symmetry they add to ${math(String(N))}: ${math(`r + (r + ${d}) = ${N}`)}, so ${math(`2r = ${N - d}`)} and ${math(`r = ${r}`)}. Check: ${math(`${C(N, r)} = ${C(N, r + d)} = ${grouped(nCr(N, r))}`)}.`,
      };
    }
    if (difficulty === 3) {
      // (n − 1)(n − 2) must be a multiple of 6 so that k is a whole number.
      const n = rng.pick([7, 8, 10, 11, 13, 14, 16, 17, 19, 20, 22, 23, 25].filter((v) => v <= Math.max(8, optNum(o, 'size', 16) - 2)));
      const k = ((n - 1) * (n - 2)) / 6;
      const [r1, r2] = roots(-3, 2 - 6 * k);
      return {
        body: `Solve for ${math('n')}: ${math(`${C('n', 3)} = ${k} dot ${C('n', 1)}`)}`,
        answer: math(`n = ${n}`),
        distractors: [`n = ${n} "or" n = ${Math.min(r1, r2)}`, `n = ${n + 1}`, `n = ${3 * k}`].map(math),
        solution: `${math(`n(n - 1)(n - 2)/6 = ${k}n`)}. Divide by ${math('n')} (${math('n != 0')}): ${math(`(n - 1)(n - 2) = ${6 * k}`)}, so ${math(`n^2 - 3n ${2 - 6 * k < 0 ? '-' : '+'} ${Math.abs(2 - 6 * k)} = 0`)} and ${math(`n = ${Math.max(r1, r2)}`)} or ${math(`n = ${Math.min(r1, r2)}`)}. Since ${math('n >= 3')}, ${math(`n = ${n}`)}.`,
      };
    }
    const shift = difficulty === 2 ? 1 : 0;
    const n = rng.int(4, optNum(o, 'size', 16));
    const m = n + shift;
    const k = (m * (m - 1)) / 2;
    const other = -(m - 1) - shift;
    const label = shift ? '(n + 1)' : 'n';
    return {
      body: `Solve for ${math('n')}: ${math(`${C(label, 2)} = ${k}`)}`,
      answer: math(`n = ${n}`),
      distractors: [`n = ${n} "or" n = ${other}`, `n = ${other}`, `n = ${2 * k}`].map(math),
      solution: `${math(`${shift ? '(n + 1)n' : 'n(n - 1)'}/2 = ${k}`)}, so ${math(`n^2 ${shift ? '+' : '-'} n - ${2 * k} = 0`)} and ${math(`(n - ${n})(n + ${-other}) = 0`)}. Reject ${math(`n = ${other}`)}; ${math(`n = ${n}`)}.`,
    };
  },
});

interface Scenario { text: (n: number, r: number) => string; ordered: boolean }
const SCENARIOS: Scenario[] = [
  { text: (n) => `awarding gold, silver, and bronze medals among ${n} athletes`, ordered: true },
  { text: (n, r) => `choosing ${r} students from ${n} to attend a conference`, ordered: false },
  { text: (n, r) => `choosing a ${r}-digit lock code from ${n} digits with no repeats`, ordered: true },
  { text: (n, r) => `selecting ${r} pizza toppings from ${n}`, ordered: false },
  { text: (n, r) => `seating ${r} of ${n} guests in the ${r} numbered front-row seats`, ordered: true },
  { text: (n, r) => `forming a ${r}-person committee from ${n} volunteers`, ordered: false },
  { text: (n, r) => `filling the first ${r} spots in a batting order from ${n} players`, ordered: true },
  { text: (n, r) => `picking ${r} songs from ${n} to download`, ordered: false },
];

const MORE_SCENARIOS: Scenario[] = [
  { text: (n, r) => `choosing ${r} of ${n} friends to invite to a movie`, ordered: false },
  { text: (n, r) => `giving ${r} different prizes to ${r} of ${n} raffle winners`, ordered: true },
  { text: (n, r) => `choosing ${r} of ${n} library books to borrow`, ordered: false },
  { text: (n, r) => `arranging ${r} of ${n} photos in a row on a wall`, ordered: true },
  { text: (n, r) => `choosing ${r} of ${n} questions to answer on a quiz`, ordered: false },
  { text: (n, r) => `filling ${r} different shifts with ${r} of ${n} volunteers`, ordered: true },
];

export const pcWhich = pc40s('40s-pc-which', {
  levels: { 1: 'Small numbers', 2: 'Larger numbers', 3: 'Two-step situations' },
  options: [
    radioOption('form', 'Situation', [['1', 'Small numbers'], ['2', 'Larger numbers'], ['3', 'Two-step situations']], ['1', '2', '3']),
    radioOption('kind', 'Situations (first two forms)', [['perm', 'Permutations'], ['comb', 'Combinations'], ['either', 'Either']], ['either', 'either', 'either']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const kind0 = optOne(o, 'kind', 'either');
    const scenario = rng.pick(difficulty === 3 || kind0 === 'either' ? SCENARIOS : SCENARIOS.filter((sc) => sc.ordered === (kind0 === 'perm')));
    const n = difficulty === 1 ? rng.int(5, 8) : rng.int(9, 15);
    const r = scenario.text(n, 3).includes('medals') ? 3 : rng.int(2, 4);
    const value = scenario.ordered ? nPr(n, r) : nCr(n, r);
    const kind = scenario.ordered ? 'Permutation' : 'Combination';
    if (difficulty === 3) {
      const r2 = rng.int(2, 3), n2 = rng.int(5, 9);
      const total = nCr(n, r) * nPr(n2, r2);
      const setting = rng.pick([
        `A school chooses ${r} of ${n} students for a council, then assigns ${r2} different jobs to ${r2} of ${n2} teachers.`,
        `A restaurant chooses ${r} of ${n} dishes for a new menu, then assigns ${r2} of its ${n2} cooks to ${r2} different shifts.`,
        `A hiking club chooses ${r} of ${n} trails for the season, then picks a leader and ${r2 === 2 ? 'an assistant' : 'two assistants with different jobs'} from ${n2} guides.`,
        `A music festival chooses ${r} of ${n} local bands to play, then gives ${r2} different time slots on the main stage to ${r2} of ${n2} headliners.`,
      ]);
      return {
        body: `${setting} How many outcomes are possible? State which parts are permutations and which are combinations.`,
        answer: math(`${C(n, r)} dot ${P(n2, r2)} = ${grouped(total)}`),
        distractors: [`${P(n, r)} dot ${C(n2, r2)} = ${grouped(nPr(n, r) * nCr(n2, r2))}`, `${C(n, r)} + ${P(n2, r2)} = ${grouped(nCr(n, r) + nPr(n2, r2))}`, `${C(n + n2, r + r2)} = ${grouped(nCr(n + n2, r + r2))}`].map(math),
        solution: `Choosing the group of ${r} ignores order (combination); giving ${r2} different roles uses order (permutation). Multiply: ${math(`${C(n, r)} dot ${P(n2, r2)} = ${nCr(n, r)} dot ${nPr(n2, r2)} = ${grouped(total)}`)}.`,
      };
    }
    const text = scenario.text(n, r).includes('medals') ? scenario.text(n, r) : rng.pick(SCENARIOS.concat(MORE_SCENARIOS).filter((sc) => sc.ordered === scenario.ordered && !sc.text(n, 3).includes('medals'))).text(n, r);
    return {
      body: `Is ${text} a permutation or a combination? Find the number of possibilities.`,
      answer: math(`"${kind}:" ${scenario.ordered ? P(n, r) : C(n, r)} = ${grouped(value)}`),
      distractors: [
        `"${scenario.ordered ? 'Combination' : 'Permutation'}:" ${scenario.ordered ? C(n, r) : P(n, r)} = ${grouped(scenario.ordered ? nCr(n, r) : nPr(n, r))}`,
        `"${kind}:" ${n}^${r} = ${grouped(n ** r)}`,
        `"${scenario.ordered ? 'Combination' : 'Permutation'}:" ${n}! = ${grouped(factorial(n))}`,
      ].map(math),
      solution: `${scenario.ordered ? 'The positions are different, so order matters' : 'The selections are a group, so order does not matter'}: ${math(`${scenario.ordered ? P(n, r) : C(n, r)} = ${grouped(value)}`)}.`,
    };
  },
});

export const COUNTING_GENERATORS = [pcFcp, pcFactorial, pcPermutations, pcIdentical, pcConditions, pcNprEquation, pcCombinations, pcCombinationCases, pcNcrEquation, pcWhich];

