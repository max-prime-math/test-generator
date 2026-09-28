import { grouped } from '../../format.ts';
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

function letterCounts(word: string): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const ch of word) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  return [...counts].filter(([, k]) => k > 1);
}

export const pcFcp = pc40s('40s-pc-fcp', {
  points: 1,
  levels: { 1: 'Independent choices', 2: 'With restrictions', 3: 'Cases (either/or)' },
  generate(rng, difficulty) {
    if (difficulty === 1) {
      const [a, b, c] = [rng.int(3, 8), rng.int(2, 6), rng.int(2, 5)];
      const answer = a * b * c;
      return {
        body: `A student has ${a} shirts, ${b} pairs of pants, and ${c} pairs of shoes. How many different outfits of one shirt, one pair of pants, and one pair of shoes are possible?`,
        answer: num(answer),
        distractors: [a + b + c, a * b + c, a * b].filter((v) => v !== answer).map(num),
        solution: `By the fundamental counting principle, multiply the number of choices: ${math(`${a} times ${b} times ${c} = ${answer}`)}.`,
      };
    }
    if (difficulty === 2) {
      const repeat = rng.next() < 0.5;
      const letters = rng.int(2, 3), digits = rng.int(3, 4);
      const count = repeat ? 26 ** letters * 10 ** digits : nPr(26, letters) * nPr(10, digits);
      const other = repeat ? nPr(26, letters) * nPr(10, digits) : 26 ** letters * 10 ** digits;
      const factors = repeat
        ? [...Array(letters).fill('26'), ...Array(digits).fill('10')]
        : [...Array.from({ length: letters }, (_, i) => String(26 - i)), ...Array.from({ length: digits }, (_, i) => String(10 - i))];
      return {
        body: `A code has ${letters} letters followed by ${digits} digits. How many codes are possible if ${repeat ? 'letters and digits may be repeated' : 'no letter or digit may be repeated'}?`,
        answer: num(count),
        distractors: [other, 26 * letters * 10 * digits, nCr(26, letters) * nCr(10, digits)].filter((v) => v !== count).map(num),
        solution: `Fill each position in turn: ${math(`${factors.join(' times ')} = ${grouped(count)}`)}.`,
      };
    }
    const n = rng.int(5, 8);
    const [r1, r2] = [rng.int(2, 3), rng.int(4, 5)].map((r) => Math.min(r, n));
    const answer = nPr(n, r1) + nPr(n, r2);
    return {
      body: `How many ${r1}-digit or ${r2}-digit numbers can be made from the digits 1 to ${n} if no digit is repeated?`,
      answer: num(answer),
      distractors: [nPr(n, r1) * nPr(n, r2), n ** r1 + n ** r2, nCr(n, r1) + nCr(n, r2)].filter((v) => v !== answer).map(num),
      solution: `The cases do not overlap, so add them: ${math(`${P(n, r1)} + ${P(n, r2)} = ${nPr(n, r1)} + ${grouped(nPr(n, r2))} = ${grouped(answer)}`)}.`,
    };
  },
});

export const pcFactorial = pc40s('40s-pc-factorial', {
  points: 1,
  levels: { 1: 'Evaluate n!/r!', 2: 'Evaluate quotients of three factorials', 3: 'Simplify algebraic factorials' },
  options: [sizeOption([8, 10, 12, 15], [10, 12, 12], 'Largest n (levels 1 and 2)')],
  generate(rng, difficulty, o) {
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
    const f = (k: number) => (k === 0 ? 'n!' : `(n ${k > 0 ? '+' : '-'} ${Math.abs(k)})!`);
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
      const thing = rng.pick([`${n} different books on a shelf`, `${n} runners in a line`, `${n} students in a row for a photo`]);
      return {
        body: `In how many ways can ${thing} be arranged?`,
        answer: num(factorial(n)),
        distractors: [n * n, factorial(n - 1), n ** n > 1e7 ? 2 * factorial(n - 1) : n ** n].filter((v) => v !== factorial(n)).map(num),
        solution: `${n} choices for the first position, ${n - 1} for the next, and so on: ${math(`${n}! = ${grouped(factorial(n))}`)}.`,
      };
    }
    if (difficulty === 2) {
      const n = size === 'small' ? rng.int(6, 10) : size === 'medium' ? rng.int(11, 20) : rng.int(21, 30), r = rng.int(2, 4);
      const roles = ['president', 'vice-president', 'secretary', 'treasurer'].slice(0, r);
      const answer = nPr(n, r);
      return {
        body: `A club of ${n} members elects a ${roles.slice(0, -1).join(', ')}${r > 2 ? ',' : ''} and ${roles[r - 1]}. In how many ways can this be done if no one holds two positions?`,
        answer: num(answer),
        distractors: [nCr(n, r), n ** r, factorial(r) * n].filter((v) => v !== answer).map(num),
        solution: `Order matters (the positions are different): ${math(`${P(n, r)} = ${n}!/${n - r}! = ${grouped(answer)}`)}.`,
      };
    }
    const word = rng.pick(DISTINCT_WORDS);
    const r = rng.int(3, 5);
    const answer = nPr(word.length, r);
    return {
      body: `How many ${r}-letter arrangements can be made from the letters of ${word}, if each letter is used at most once?`,
      answer: num(answer),
      distractors: [nCr(word.length, r), word.length ** r, factorial(word.length)].filter((v) => v !== answer).map(num),
      solution: `${word} has ${word.length} different letters. Choose and order ${r} of them: ${math(`${P(word.length, r)} = ${grouped(answer)}`)}.`,
    };
  },
});

export const pcIdentical = pc40s('40s-pc-identical', {
  levels: { 1: 'One repeated letter', 2: 'Several repeated letters', 3: 'Grid routes' },
  generate(rng, difficulty) {
    if (difficulty === 3) {
      const a = rng.int(3, 7), b = rng.int(2, 5);
      const answer = nCr(a + b, a);
      return {
        body: `A path on a grid moves only right or down. How many shortest routes lead from the top-left corner to a point ${a} blocks right and ${b} blocks down?`,
        answer: num(answer),
        distractors: [factorial(a + b), a * b, 2 ** (a + b)].filter((v) => v !== answer).map(num),
        solution: `Each route is an arrangement of ${a} R's and ${b} D's: ${math(`(${a + b})!/(${a}! ${b}!) = ${grouped(answer)}`)}.`,
      };
    }
    const words = REPEATED_WORDS.filter((w) => (letterCounts(w).length === 1) === (difficulty === 1));
    const word = rng.pick(words);
    const repeats = letterCounts(word);
    const answer = factorial(word.length) / repeats.reduce((acc, [, k]) => acc * factorial(k), 1);
    const denom = repeats.map(([, k]) => `${k}!`).join(' ');
    return {
      body: `How many different arrangements of all the letters of ${word} are possible?`,
      answer: num(answer),
      // Ignoring the repeats, doubling, halving, or dividing by one factorial of all the repeated letters.
      distractors: [factorial(word.length), answer * 2, answer / 2, factorial(word.length) / factorial(repeats.reduce((acc, [, k]) => acc + k, 0)), factorial(word.length - 1), 2 * factorial(word.length - 1)].filter((v) => v !== answer && Number.isInteger(v)).map(num),
      solution: `${word} has ${word.length} letters with ${repeats.map(([ch, k]) => `${k} ${ch}'s`).join(', ')}. Divide by the arrangements of the identical letters: ${math(`${word.length}!/(${denom}) = ${grouped(answer)}`)}.`,
    };
  },
});

export const pcConditions = pc40s('40s-pc-conditions', {
  levels: { 1: 'A fixed position', 2: 'Together or apart', 3: 'Letters with a vowel condition' },
  generate(rng, difficulty) {
    const n = rng.int(5, 8);
    const [p1, p2] = rng.shuffle(['Ana', 'Ben', 'Chloe', 'Dev', 'Emma', 'Farid', 'Gia', 'Hugo']).slice(0, 2);
    if (difficulty === 1) {
      const ends = rng.next() < 0.5;
      const answer = (ends ? 2 : 1) * factorial(n - 1);
      return {
        body: `${n} people, including ${p1}, line up for a photo. In how many ways can they line up if ${p1} must stand ${ends ? 'at one of the ends' : 'first in line'}?`,
        answer: num(answer),
        distractors: [factorial(n), (ends ? 1 : 2) * factorial(n - 1), factorial(n - 1) * (n - 1)].filter((v) => v !== answer).map(num),
        solution: `Place ${p1} first (${ends ? '2 choices' : '1 choice'}), then arrange the other ${n - 1} people: ${math(`${ends ? '2 dot ' : ''}${n - 1}! = ${grouped(answer)}`)}.`,
      };
    }
    if (difficulty === 2) {
      const together = 2 * factorial(n - 1);
      const apart = rng.next() < 0.5;
      const answer = apart ? factorial(n) - together : together;
      return {
        body: `In how many ways can ${n} people, including ${p1} and ${p2}, sit in a row if ${p1} and ${p2} ${apart ? 'must not' : 'must'} sit together?`,
        answer: num(answer),
        distractors: [apart ? together : factorial(n) - together, factorial(n - 1), factorial(n) - factorial(n - 1)].filter((v) => v !== answer).map(num),
        solution: apart
          ? `Count the arrangements with them together (treat the pair as one unit that can be ordered 2 ways): ${math(`2 dot ${n - 1}! = ${grouped(together)}`)}. Subtract from all arrangements: ${math(`${n}! - ${grouped(together)} = ${grouped(answer)}`)}.`
          : `Treat ${p1} and ${p2} as one unit, which can be ordered 2 ways: ${math(`2 dot ${n - 1}! = ${grouped(answer)}`)}.`,
      };
    }
    const word = rng.pick(DISTINCT_WORDS);
    const vowels = [...word].filter((ch) => 'AEIOU'.includes(ch)).length;
    const consonants = word.length - vowels;
    const together = rng.next() < 0.5;
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

/** Solve a quadratic with integer roots, n² + bn + c = 0, returning the roots. */
function roots(b: number, c: number): number[] {
  const disc = b * b - 4 * c;
  const s = Math.sqrt(disc);
  return [(-b + s) / 2, (-b - s) / 2];
}

export const pcNprEquation = pc40s('40s-pc-npr-equation', {
  levels: { 1: 'ₙP₂ = k', 2: '₍ₙ₊₁₎P₂ = k', 3: 'ₙP₄ = k · ₙP₂' },
  generate(rng, difficulty) {
    if (difficulty === 3) {
      const n = rng.int(5, 12);
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
    const n = rng.int(4, 15);
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

export const pcCombinations = pc40s('40s-pc-combinations', {
  levels: { 1: 'ₙCᵣ in context', 2: 'Choosing from two groups', 3: 'Card hands' },
  options: [
    radioOption('n', 'Group size (level 1)', [['small', '6 to 10'], ['medium', '6 to 20'], ['large', '20 to 40']], ['medium', 'medium', 'medium']),
    radioOption('r', 'Number chosen (level 1)', [['small', '2 or 3'], ['medium', '2 to 5'], ['large', '6 to 8']], ['medium', 'medium', 'medium']),
  ],
  generate(rng, difficulty, o) {
    if (difficulty === 1) {
      const ns = optOne(o, 'n', 'medium'), rs = optOne(o, 'r', 'medium');
      const r = rs === 'small' ? rng.int(2, 3) : rs === 'medium' ? rng.int(2, 5) : rng.int(6, 8);
      const n = Math.max(r + 2, ns === 'small' ? rng.int(6, 10) : ns === 'medium' ? rng.int(6, 20) : rng.int(20, 40));
      const setting = rng.pick([`a committee of ${r} from ${n} people`, `${r} toppings from a list of ${n}`, `${r} books to read from a list of ${n}`]);
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
      return {
        body: `A committee of ${rg + rb} is chosen from ${g} teachers and ${b} students. How many committees have exactly ${rg} teacher${rg > 1 ? 's' : ''} and ${rb} student${rb > 1 ? 's' : ''}?`,
        answer: num(answer),
        distractors: [nCr(g, rg) + nCr(b, rb), nCr(g + b, rg + rb), nPr(g, rg) * nPr(b, rb)].filter((v) => v !== answer).map(num),
        solution: `Choose the teachers and the students, then multiply: ${math(`${C(g, rg)} dot ${C(b, rb)} = ${nCr(g, rg)} dot ${nCr(b, rb)} = ${grouped(answer)}`)}.`,
      };
    }
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

export const pcCombinationCases = pc40s('40s-pc-combination-cases', {
  levels: { 1: 'At least one', 2: 'At least two (cases)', 3: 'At most, with larger groups' },
  generate(rng, difficulty) {
    const a = rng.int(4, 8), b = rng.int(4, 8);
    const r = difficulty === 3 ? rng.int(4, 6) : rng.int(3, 5);
    const [groupA, groupB] = rng.pick([['girls', 'boys'], ['grade 12 students', 'grade 11 students'], ['women', 'men']]);
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
    const phrase = difficulty === 2 ? `at least 2 ${groupA}` : `at most ${max} ${max === 1 ? groupA.replace(/s$/, '') : groupA}`;
    return {
      body: `A committee of ${r} is chosen from ${a} ${groupA} and ${b} ${groupB}. How many committees have ${phrase}?`,
      answer: num(answer),
      distractors: [nCr(a + b, r) - answer, nCr(a, min || max) * nCr(a + b - (min || max), r - (min || max)), nCr(a + b, r)].filter((v) => v !== answer && v > 0).map(num),
      solution: `Add the cases: ${math(cases.map((k) => `${C(a, k)} ${C(b, r - k)}`).join(' + '))} ${math(`= ${cases.map((k) => nCr(a, k) * nCr(b, r - k)).join(' + ')} = ${grouped(answer)}`)}.`,
    };
  },
});

export const pcNcrEquation = pc40s('40s-pc-ncr-equation', {
  levels: { 1: 'ₙC₂ = k', 2: '₍ₙ₊₁₎C₂ = k', 3: 'ₙC₃ = k · ₙC₁' },
  generate(rng, difficulty) {
    if (difficulty === 3) {
      // (n − 1)(n − 2) must be a multiple of 6 so that k is a whole number.
      const n = rng.pick([7, 8, 10, 11, 13, 14]);
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
    const n = rng.int(4, 16);
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
  { text: (n, r) => `choosing a starting lineup of ${r} batting positions from ${n} players`, ordered: true },
  { text: (n, r) => `picking ${r} songs from ${n} to put on a playlist, where the order does not matter`, ordered: false },
];

export const pcWhich = pc40s('40s-pc-which', {
  levels: { 1: 'Small numbers', 2: 'Larger numbers', 3: 'Two-step situations' },
  generate(rng, difficulty) {
    const scenario = rng.pick(SCENARIOS);
    const n = difficulty === 1 ? rng.int(5, 8) : rng.int(9, 15);
    const r = scenario.text(n, 3).includes('medals') ? 3 : rng.int(2, 4);
    const value = scenario.ordered ? nPr(n, r) : nCr(n, r);
    const kind = scenario.ordered ? 'Permutation' : 'Combination';
    if (difficulty === 3) {
      const r2 = rng.int(2, 3), n2 = rng.int(5, 9);
      const total = nCr(n, r) * nPr(n2, r2);
      return {
        body: `A school chooses ${r} of ${n} students for a council, then assigns ${r2} different jobs to ${r2} of ${n2} teachers. How many outcomes are possible? State which parts are permutations and which are combinations.`,
        answer: math(`${C(n, r)} dot ${P(n2, r2)} = ${grouped(total)}`),
        distractors: [`${P(n, r)} dot ${C(n2, r2)} = ${grouped(nPr(n, r) * nCr(n2, r2))}`, `${C(n, r)} + ${P(n2, r2)} = ${grouped(nCr(n, r) + nPr(n2, r2))}`, `${C(n + n2, r + r2)} = ${grouped(nCr(n + n2, r + r2))}`].map(math),
        solution: `Choosing the council ignores order (combination); assigning different jobs uses order (permutation). Multiply: ${math(`${C(n, r)} dot ${P(n2, r2)} = ${nCr(n, r)} dot ${nPr(n2, r2)} = ${grouped(total)}`)}.`,
      };
    }
    const text = scenario.text(n, r);
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

