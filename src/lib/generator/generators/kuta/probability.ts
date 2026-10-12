// Probability (Algebra 2 and Precalculus), after Kuta's
// ProbabilityIndependentDependent (+ word problems),
// ProbabilityMutuallyExclusive (+ word problems), and
// CombinatoricsProbability.
import type { Rng } from '../../rng.ts';
import { Q } from '../../exact.ts';
import { optOne, radioOption } from '../../options.ts';
import { C as nCrText, P as nPrText } from '../pc40s/counting.ts';
import { us, math, wrong, NAMES } from './common.ts';

const ans = (q: Q) => math(q.typst());
const C = (n: number, r: number): number => (r < 0 || r > n ? 0 : r === 0 ? 1 : (C(n - 1, r - 1) * n) / r);

/** A bag of coloured marbles, as counts by colour. */
function bag(rng: Rng): Array<[string, number]> {
  return rng.shuffle(['red', 'blue', 'green', 'yellow', 'white']).slice(0, 3).map((c) => [c, rng.int(2, 9)] as [string, number]);
}
const list = (b: Array<[string, number]>) => b.map(([c, n]) => `${n} ${c}`).join(', ').replace(/, ([^,]*)$/, ', and $1');

export const prIndependent = us('pr-independent', {
  levels: { 1: 'Independent events (with replacement)', 2: 'Dependent events (without replacement)', 3: 'Either' },
  options: [radioOption('kind', 'Events', [['independent', 'Independent'], ['dependent', 'Dependent'], ['either', 'Either']], ['independent', 'dependent', 'either'])],
  generate(rng, level, o) {
    const kindOpt = optOne(o, 'kind', ['independent', 'dependent', 'either'][level - 1]);
    const dependent = kindOpt === 'either' ? rng.next() < 0.5 : kindOpt === 'dependent';
    if (!dependent && rng.next() < 0.4) {
      // A die and a coin, or two dice.
      const even = rng.next() < 0.5;
      const dieP = new Q(even ? 3 : rng.int(1, 4), 6), coin = new Q(1, 2);
      const event = even ? 'an even number' : `a number less than ${dieP.mul(6).n + 1}`;
      const p = dieP.mul(coin);
      return {
        body: `A number cube is rolled and a coin is tossed. Find the probability of rolling ${event} and tossing heads.`,
        answer: ans(p), distractors: wrong(ans(p), [dieP.add(coin), dieP, new Q(1, 12), dieP.mul(coin).mul(2)].map(ans)),
        solution: `The events are independent: ${math(`P = ${dieP.typst()} dot 1/2 = ${p.typst()}`)}.`,
      };
    }
    const b = bag(rng);
    const total = b.reduce((s, [, n]) => s + n, 0);
    const [c1, n1] = rng.pick(b), [c2, n2] = rng.pick(b);
    const same = c1 === c2;
    const p1 = new Q(n1, total);
    const p2 = dependent ? new Q(same ? n2 - 1 : n2, total - 1) : new Q(n2, total);
    const p = p1.mul(p2);
    const other = dependent ? p1.mul(new Q(n2, total)) : p1.mul(new Q(same ? n2 - 1 : n2, total - 1));
    return {
      body: `A bag contains ${list(b)} marbles. A marble is drawn${dependent ? ' and not replaced' : ', replaced'}, then a second marble is drawn. Find ${math(`P("${c1}" "then" "${c2}")`)}.`,
      answer: ans(p), distractors: wrong(ans(p), [other, p1.add(p2), new Q(n1 + n2, total * 2), p2].map(ans)),
      solution: `${math(`P = ${n1}/${total} dot ${dependent && same ? n2 - 1 : n2}/${dependent ? total - 1 : total} = ${p.typst()}`)}${dependent ? ', since the first marble is not put back' : ''}.`,
    };
  },
});

export const prIndependentWords = us('pr-independent-words', {
  points: 2,
  levels: { 1: 'Independent events', 2: 'Dependent events', 3: 'Three events' },
  generate(rng, level) {
    const name = rng.pick(NAMES);
    if (level === 1) {
      const pa = new Q(rng.int(1, 9), 10), pb = new Q(rng.int(1, 9), 10);
      const p = pa.mul(pb);
      const pct = (q: Q) => `${Math.round(q.value * 100)}%`;
      return {
        body: `The probability of rain on Saturday is ${pct(pa)}, and the probability that ${name}'s bus is late on Monday is ${pct(pb)}. These events are independent. What is the probability of both?`,
        answer: ans(p), distractors: wrong(ans(p), [pa.add(pb).value <= 1 ? pa.add(pb) : new Q(1), pa.mul(new Q(1).sub(pb)), new Q(1).sub(p)].map(ans)),
        solution: `For independent events, multiply: ${math(`${pa.typst()} dot ${pb.typst()} = ${p.typst()}`)}.`,
      };
    }
    const total = rng.int(15, 32), girls = rng.int(5, total - 5);
    const k = level === 3 ? 3 : 2;
    let p = new Q(1);
    for (let i = 0; i < k; i++) p = p.mul(new Q(girls - i, total - i));
    const withRep = new Q(girls ** k, total ** k);
    return {
      body: `A class has ${total} students, ${girls} of whom are girls. ${k === 2 ? 'Two' : 'Three'} different students are chosen at random to give speeches. What is the probability that ${k === 2 ? 'both' : 'all three'} are girls?`,
      answer: ans(p), distractors: wrong(ans(p), [withRep, new Q(girls * k, total), new Q(girls - k + 1, total - k + 1)].filter((q) => q.value < 1).map(ans)),
      solution: `The choices are dependent, since a student cannot be chosen twice: ${math(`${Array.from({ length: k }, (_, i) => `${girls - i}/${total - i}`).join(' dot ')} = ${p.typst()}`)}.`,
    };
  },
});

export const prExclusive = us('pr-exclusive', {
  levels: { 1: 'Mutually exclusive events', 2: 'Inclusive events', 3: 'Either' },
  generate(rng, level) {
    const inclusive = level === 2 || (level === 3 && rng.next() < 0.5);
    if (rng.next() < 0.5) {
      // A standard deck of cards.
      const pairs: Array<[string, number, string, number, number]> = inclusive
        ? [['a heart', 13, 'a face card', 12, 3], ['a red card', 26, 'a king', 4, 2], ['a spade', 13, 'an ace', 4, 1], ['a club', 13, 'a number less than 4', 12, 3]]
        : [['a king', 4, 'a queen', 4, 0], ['a heart', 13, 'a black card', 26, 0], ['an ace', 4, 'a face card', 12, 0], ['a diamond', 13, 'a club', 13, 0]];
      const [a, na, b, nb, both] = rng.pick(pairs);
      const p = new Q(na + nb - both, 52);
      return {
        body: `A card is drawn from a standard deck of 52 cards. Find the probability that it is ${a} or ${b}.`,
        answer: ans(p), distractors: wrong(ans(p), [new Q(na + nb, 52), new Q(na * nb, 52 * 52), new Q(both || 1, 52), new Q(na + nb + both, 52)].map(ans)),
        solution: `${inclusive ? `The events overlap in ${both} card${both === 1 ? '' : 's'}: ` : 'The events cannot both happen: '}${math(`P = ${na}/52 + ${nb}/52${inclusive ? ` - ${both}/52` : ''} = ${p.typst()}`)}.`,
      };
    }
    // Two number cubes: a sum, or a sum and doubles.
    const s = rng.int(4, 10);
    const sumCount = 6 - Math.abs(7 - s);
    if (inclusive) {
      const evenSum = s % 2 === 0;
      const overlap = evenSum ? 1 : 0;
      const p = new Q(sumCount + 6 - overlap, 36);
      return {
        body: `Two number cubes are rolled. Find the probability of rolling doubles or a sum of ${s}.`,
        answer: ans(p), distractors: wrong(ans(p), [new Q(sumCount + 6, 36), new Q(sumCount * 6, 36 * 36), new Q(sumCount, 36)].map(ans)),
        solution: `${sumCount} outcomes give a sum of ${s} and 6 are doubles${overlap ? `, with 1 outcome in both (${s / 2}, ${s / 2})` : ''}: ${math(`P = (${sumCount} + 6${overlap ? ' - 1' : ''})/36 = ${p.typst()}`)}.`,
      };
    }
    const t = s === 10 ? 3 : 11;
    const tCount = 6 - Math.abs(7 - t);
    const p = new Q(sumCount + tCount, 36);
    return {
      body: `Two number cubes are rolled. Find the probability of a sum of ${s} or a sum of ${t}.`,
      answer: ans(p), distractors: wrong(ans(p), [new Q(sumCount * tCount, 36 * 36), new Q(sumCount + tCount, 12), new Q(sumCount, 36)].map(ans)),
      solution: `The sums cannot both happen, so add: ${math(`${sumCount}/36 + ${tCount}/36 = ${p.typst()}`)}.`,
    };
  },
});

export const prExclusiveWords = us('pr-exclusive-words', {
  points: 2,
  levels: { 1: 'Mutually exclusive', 2: 'Inclusive, from counts', 3: 'Inclusive, from a two-way table' },
  generate(rng, level) {
    if (level === 1) {
      const counts = [rng.int(3, 12), rng.int(3, 12), rng.int(3, 12)];
      const total = counts.reduce((a, b) => a + b, 0);
      const [x, y] = rng.shuffle([0, 1, 2]).slice(0, 2);
      const flavours = ['vanilla', 'chocolate', 'strawberry'];
      const p = new Q(counts[x] + counts[y], total);
      return {
        body: `A cooler has ${counts[0]} vanilla, ${counts[1]} chocolate, and ${counts[2]} strawberry yogurts. One is chosen at random. What is the probability that it is ${flavours[x]} or ${flavours[y]}?`,
        answer: ans(p), distractors: wrong(ans(p), [new Q(counts[x] * counts[y], total * total), new Q(counts[x], total), new Q(counts[x] + counts[y], total + 1)].map(ans)),
        solution: `The flavours cannot overlap, so add: ${math(`${counts[x]}/${total} + ${counts[y]}/${total} = ${p.typst()}`)}.`,
      };
    }
    const total = rng.int(25, 40), a = rng.int(8, 18), b = rng.int(6, 15), both = rng.int(2, Math.min(a, b) - 1);
    if (a + b - both > total) return prExclusiveWords.generate(rng, level);
    const p = new Q(a + b - both, total);
    const intro = level === 2
      ? `In a class of ${total} students, ${a} play soccer, ${b} play basketball, and ${both} play both.`
      : `In a class of ${total} students, the table shows who plays soccer and basketball.\n\n#table(columns: 3, align: center, inset: 5pt, [], [*Basketball*], [*No basketball*], [*Soccer*], [${both}], [${a - both}], [*No soccer*], [${b - both}], [${total - a - b + both}])`;
    return {
      body: `${intro} A student is chosen at random. What is the probability that the student plays soccer or basketball?`,
      answer: ans(p), distractors: wrong(ans(p), [new Q(a + b, total), new Q(both, total), new Q(a + b - 2 * both, total)].map(ans)),
      solution: `${math(`P(S "or" B) = P(S) + P(B) - P(S "and" B) = ${a}/${total} + ${b}/${total} - ${both}/${total} = ${p.typst()}`)}.`,
    };
  },
});

export const prCounting = us('pr-counting', {
  points: 2,
  levels: { 1: 'Combinations, one group', 2: 'Combinations from two groups', 3: 'Permutations' },
  generate(rng, level) {
    if (level === 3) {
      const n = rng.int(5, 9), name = rng.pick(NAMES);
      const k = rng.int(2, 3);
      const p = new Q(1, Array.from({ length: k }, (_, i) => n - i).reduce((a, b) => a * b, 1));
      return {
        body: `${n} runners, including ${name}${k === 3 ? ' and two friends' : ' and a friend'}, are in a race. If every finishing order is equally likely, what is the probability that ${k === 3 ? `${name} wins, the first friend is second, and the second friend is third` : `${name} wins and the friend is second`}?`,
        answer: ans(p), distractors: wrong(ans(p), [new Q(1, C(n, k)), new Q(k, n), new Q(1, n ** k)].map(ans)),
        solution: `There are ${math(`${nPrText(n, k)} = ${p.d}`)} ordered results for the top ${k} places, and one of them is the one we want: ${math(p.typst())}.`,
      };
    }
    const g = rng.int(4, 10), bb = rng.int(4, 10), k = rng.int(2, 4);
    if (level === 1) {
      const p = new Q(C(g, k), C(g + bb, k));
      return {
        body: `A committee of ${k} is chosen at random from ${g} teachers and ${bb} parents. What is the probability that the committee is all teachers?`,
        answer: ans(p), distractors: wrong(ans(p), [new Q(g ** k, (g + bb) ** k), new Q(k, g + bb), new Q(C(bb, k), C(g + bb, k)), new Q(g, g + bb)].map(ans)),
        solution: `${math(`P = (${nCrText(g, k)})/(${nCrText(g + bb, k)}) = ${C(g, k)}/${C(g + bb, k)} = ${p.typst()}`)}.`,
      };
    }
    const j = rng.int(1, k - 1);
    const p = new Q(C(g, j) * C(bb, k - j), C(g + bb, k));
    return {
      body: `A committee of ${k} is chosen at random from ${g} teachers and ${bb} parents. What is the probability that it has exactly ${j} teacher${j === 1 ? '' : 's'} and ${k - j} parent${k - j === 1 ? '' : 's'}?`,
      answer: ans(p), distractors: wrong(ans(p), [new Q(C(g, j) + C(bb, k - j), C(g + bb, k)), new Q(C(g, j), C(g + bb, k)), new Q(j, k)].map(ans)),
      solution: `${math(`P = (${nCrText(g, j)} dot ${nCrText(bb, k - j)})/(${nCrText(g + bb, k)}) = ${C(g, j) * C(bb, k - j)}/${C(g + bb, k)} = ${p.typst()}`)}.`,
    };
  },
});

export const PROBABILITY = [prIndependent, prIndependentWords, prExclusive, prExclusiveWords, prCounting];
