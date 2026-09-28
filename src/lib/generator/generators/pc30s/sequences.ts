import { grouped, poly, round, sub } from '../../format.ts';
import { Q } from '../../exact.ts';
import { math, pc30s } from '../pc40s/common.ts';
import { optNum, optOne, radioOption, sizeOption } from '../../options.ts';

/** t_n = t1 + (n − 1)d simplified: `3n + 2`, `-4n + 11`, `n`. */
function arithmeticRule(t1: number, d: number): string {
  const c = t1 - d;
  const lead = d === 1 ? 'n' : d === -1 ? '-n' : `${d}n`;
  return c === 0 ? lead : `${lead} ${c < 0 ? '-' : '+'} ${Math.abs(c)}`;
}

const listText = (xs: Array<number | string>) => `${xs.join(', ')}, ...`;
/** r^k as an exact fraction. */
const pow = (r: Q, k: number) => new Q(r.n ** k, r.d ** k);

export const arithGeneralTerm = pc30s('30s-arith-general-term', {
  points: 1,
  levels: { 1: 'Positive difference', 2: 'Negative difference', 3: 'From two non-consecutive terms' },
  options: [
    radioOption('form', 'Given', [['1', 'Positive difference'], ['2', 'Negative difference'], ['3', 'From two non-consecutive terms']], ['1', '2', '3']),
    sizeOption([3, 6, 9], [9, 9, 9], 'Largest common difference'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const t1 = rng.int(-10, 15);
    const M = optNum(o, 'size', 9);
    const D = difficulty === 1 ? rng.int(1, M) : difficulty === 2 ? -rng.int(1, M) : rng.nonZero(-M, M);
    const answer = `t_n = ${arithmeticRule(t1, D)}`;
    const given = difficulty === 3
      ? (() => { const k = rng.int(4, 8); return `the arithmetic sequence with ${math(`t_1 = ${t1}`)} and ${math(`t_${k} = ${t1 + (k - 1) * D}`)}`; })()
      : `the arithmetic sequence ${math(listText([t1, t1 + D, t1 + 2 * D, t1 + 3 * D]))}`;
    return {
      body: `Write the general term of ${given}.`,
      answer: math(answer),
      // Using t1 as the constant, swapping t1 and d, or the wrong sign of d.
      distractors: [`t_n = ${poly([D, t1], 'n')}`, ...(t1 === 0 ? [] : [`t_n = ${arithmeticRule(D, t1)}`]), `t_n = ${arithmeticRule(t1, -D)}`, `t_n = ${arithmeticRule(t1 + D, D)}`].filter((x, i, all) => x !== answer && all.indexOf(x) === i).map(math),
      solution: `${difficulty === 3 ? `${math(`d = (t_k - t_1)/(k - 1)`)} gives ${math(`d = ${D}`)}. ` : `The common difference is ${math(`d = ${D}`)}. `}${math(`t_n = t_1 + (n - 1)d = ${t1} + (n - 1)(${D}) = ${arithmeticRule(t1, D)}`)}.`,
    };
  },
});

export const arithTerm = pc30s('30s-arith-term', {
  points: 1,
  levels: { 1: 'From t₁ and d', 2: 'From the first terms', 3: 'Decimal or fractional differences' },
  options: [
    radioOption('form', 'Given', [['1', 'From t₁ and d'], ['2', 'From the first terms'], ['3', 'Decimal or fractional differences']], ['1', '2', '3']),
    sizeOption([20, 60, 100], [60, 60, 60], 'Largest term number'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const n = rng.int(10, optNum(o, 'size', 60));
    if (difficulty === 3) {
      const t1 = rng.int(-20, 20) / 2, d = rng.nonZero(-9, 9) / 4;
      const value = t1 + (n - 1) * d;
      const fmt = (v: number) => (Number.isInteger(v) ? String(v) : String(v));
      return {
        body: `Find ${math(`t_${n}`)} for the arithmetic sequence ${math(listText([t1, t1 + d, t1 + 2 * d].map(fmt)))}`,
        answer: math(fmt(value)),
        distractors: [t1 + n * d, t1 * (n - 1) + d, (n - 1) * d].map((v) => math(fmt(v))).filter((x, i, all) => x !== math(fmt(value)) && all.indexOf(x) === i),
        solution: math(`t_${n} = ${fmt(t1)} + (${n} - 1)(${fmt(d)}) = ${fmt(value)}`),
      };
    }
    const t1 = rng.int(-20, 30), d = rng.nonZero(-9, 9);
    const value = t1 + (n - 1) * d;
    return {
      body: difficulty === 1 ? `An arithmetic sequence has ${math(`t_1 = ${t1}`)} and ${math(`d = ${d}`)}. Find ${math(`t_${n}`)}.` : `Find ${math(`t_${n}`)} for the arithmetic sequence ${math(listText([t1, t1 + d, t1 + 2 * d]))}`,
      answer: math(String(value)),
      distractors: [t1 + n * d, t1 * n + d, (n - 1) * d].filter((v) => v !== value).map((v) => math(String(v))),
      solution: math(`t_${n} = t_1 + (n - 1)d = ${t1} + (${n - 1})(${d}) = ${value}`),
    };
  },
});

export const arithParameter = pc30s('30s-arith-parameter', {
  levels: { 1: 'Number of terms', 2: 'Common difference', 3: 'First term from two terms' },
  options: [
    radioOption('form', 'Find', [['1', 'Number of terms'], ['2', 'Common difference'], ['3', 'First term from two terms']], ['1', '2', '3']),
    sizeOption([4, 8, 12], [8, 8, 8], 'Largest common difference'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const M = optNum(o, 'size', 8);
    const t1 = rng.int(-20, 30), d = rng.nonZero(-M, M), n = rng.int(8, 60);
    const tn = t1 + (n - 1) * d;
    if (difficulty === 1) {
      return {
        body: `How many terms are in the arithmetic sequence ${math(`${t1}, ${t1 + d}, ${t1 + 2 * d}, ..., ${tn}`)}?`,
        answer: math(String(n)),
        // Forgetting to add 1, adding 2, or dividing the last term by d.
        distractors: [n - 1, n + 1, n + 2, Math.round(Math.abs(tn / d))].filter((v, i, all) => v !== n && v > 0 && all.indexOf(v) === i).map((v) => math(String(v))),
        solution: `${math(`${tn} = ${t1} + (n - 1)(${d})`)}, so ${math(`n - 1 = ${(tn - t1) / d}`)} and ${math(`n = ${n}`)}.`,
      };
    }
    if (difficulty === 2) {
      const k = rng.int(5, 20), tk = t1 + (k - 1) * d;
      return {
        body: `An arithmetic sequence has ${math(`t_1 = ${t1}`)} and ${math(`t_${k} = ${tk}`)}. Find the common difference.`,
        answer: math(`d = ${d}`),
        distractors: [new Q(tk - t1, k), new Q(tk + t1, k - 1), new Q(tk, k - 1)].filter((v) => !v.eq(d)).map((v) => math(`d = ${v.typst()}`)).filter((x, i, all) => all.indexOf(x) === i),
        solution: `${math(`${tk} = ${t1} + (${k} - 1)d`)}, so ${math(`d = (${tk} - ${sub(t1)})/${k - 1} = ${d}`)}.`,
      };
    }
    const j = rng.int(3, 8), k = j + rng.int(3, 10);
    const tj = t1 + (j - 1) * d, tk = t1 + (k - 1) * d;
    return {
      body: `In an arithmetic sequence, ${math(`t_${j} = ${tj}`)} and ${math(`t_${k} = ${tk}`)}. Find ${math('t_1')}.`,
      answer: math(`t_1 = ${t1}`),
      distractors: [t1 + d, tj - j * d, tj - (j - 1) * (tk - tj)].filter((v, i, all) => v !== t1 && all.indexOf(v) === i).map((v) => math(`t_1 = ${v}`)),
      solution: `${math(`d = (${tk} - ${sub(tj)})/(${k} - ${j}) = ${d}`)}. Then ${math(`t_1 = ${tj} - (${j} - 1)(${d}) = ${t1}`)}.`,
    };
  },
});

export const arithSum = pc30s('30s-arith-sum', {
  levels: { 1: 'From t₁, d, and n', 2: 'From the first and last terms', 3: 'A series written out' },
  options: [
    radioOption('form', 'Given', [['1', 'From t₁, d, and n'], ['2', 'From the first and last terms'], ['3', 'A series written out']], ['1', '2', '3']),
    sizeOption([20, 40, 80], [40, 40, 40], 'Largest number of terms'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const t1 = rng.int(-15, 25), d = rng.nonZero(-6, 8), n = rng.int(10, optNum(o, 'size', 40));
    const tn = t1 + (n - 1) * d, S = (n * (t1 + tn)) / 2;
    const body = difficulty === 1
      ? `Find the sum of the first ${n} terms of the arithmetic series with ${math(`t_1 = ${t1}`)} and ${math(`d = ${d}`)}.`
      : difficulty === 2
        ? `An arithmetic series has ${n} terms, with first term ${t1} and last term ${tn}. Find the sum.`
        : `Find the sum: ${math(`${t1} + ${t1 + d} + ${t1 + 2 * d} + dots + ${tn}`.replace(/\+ -/g, '- '))}`;
    return {
      body,
      answer: math(grouped(S)),
      distractors: [n * (t1 + tn), ((n - 1) * (t1 + tn)) / 2, (n * (2 * t1 + n * d)) / 2].filter((v) => v !== S).map((v) => math(grouped(v))),
      solution: `${difficulty === 3 ? `The common difference is ${d}, and ${math(`${tn} = ${t1} + (n - 1)(${d})`)} gives ${math(`n = ${n}`)}. ` : ''}${math(`S_n = n/2 (t_1 + t_n) = ${n}/2 (${t1} + ${tn < 0 ? `(${tn})` : tn}) = ${grouped(S)}`)}.`,
    };
  },
});

export const arithSumParameter = pc30s('30s-arith-sum-parameter', {
  levels: { 1: 'First term from the sum', 2: 'Last term from the sum', 3: 'Number of terms (quadratic)' },
  options: [
    radioOption('form', 'Find', [['1', 'First term from the sum'], ['2', 'Last term from the sum'], ['3', 'Number of terms (quadratic)']], ['1', '2', '3']),
    sizeOption([10, 25, 40], [25, 25, 25], 'Largest number of terms'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const t1 = rng.int(1, 20), d = rng.int(1, 6), n = rng.int(6, optNum(o, 'size', 25));
    const tn = t1 + (n - 1) * d, S = (n * (t1 + tn)) / 2;
    if (difficulty === 3) {
      return {
        body: `How many terms of the arithmetic series ${math(`${t1} + ${t1 + d} + ${t1 + 2 * d} + dots`)} must be added to get ${math(String(S))}?`,
        answer: math(`n = ${n}`),
        distractors: [n - 1, n + 1, Math.round(S / t1)].filter((v, i, all) => v !== n && all.indexOf(v) === i && v > 0).map((v) => math(`n = ${v}`)),
        solution: `${math(`${S} = n/2 (2(${t1}) + (n - 1)(${d}))`)} gives ${math(`${poly([d, 2 * t1 - d, -2 * S], 'n')} = 0`)}. The positive root is ${math(`n = ${n}`)}.`,
      };
    }
    if (difficulty === 1) {
      return {
        body: `An arithmetic series of ${n} terms has a sum of ${S} and a common difference of ${d}. Find the first term.`,
        answer: math(`t_1 = ${t1}`),
        distractors: [tn, t1 + d, Math.round(S / n)].filter((v, i, all) => v !== t1 && all.indexOf(v) === i).map((v) => math(`t_1 = ${v}`)),
        solution: `${math(`${S} = ${n}/2 (2t_1 + (${n} - 1)(${d}))`)}, so ${math(`2t_1 + ${(n - 1) * d} = ${(2 * S) / n}`)} and ${math(`t_1 = ${t1}`)}.`,
      };
    }
    return {
      body: `An arithmetic series of ${n} terms has first term ${t1} and sum ${S}. Find the last term.`,
      answer: math(`t_${n} = ${tn}`),
      distractors: [(2 * S) / n, S / n, tn + d].filter((v, i, all) => v !== tn && all.indexOf(v) === i).map((v) => math(`t_${n} = ${Number.isInteger(v) ? v : round(v, 2)}`)),
      solution: `${math(`${S} = ${n}/2 (${t1} + t_${n})`)}, so ${math(`t_${n} = ${(2 * S) / n} - ${sub(t1)} = ${tn}`)}.`,
    };
  },
});

export const arithProblem = pc30s('30s-arith-problem', {
  levels: { 1: 'Seats in a theatre', 2: 'A savings plan', 3: 'A stack of logs' },
  options: [
    radioOption('form', 'Context', [['1', 'Seats in a theatre'], ['2', 'A savings plan'], ['3', 'A stack of logs']], ['1', '2', '3']),
    sizeOption([20, 30, 50], [30, 30, 30], 'Largest number of rows or weeks'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const a = rng.int(10, 30), d = rng.int(2, 5), n = rng.int(10, optNum(o, 'size', 30));
    const last = a + (n - 1) * d, total = (n * (a + last)) / 2;
    if (difficulty === 1) {
      return {
        body: `A theatre has ${a} seats in the first row, and each row has ${d} more seats than the row in front. How many seats are in row ${n}?`,
        answer: math(String(last)),
        distractors: [a + n * d, a * n, total].filter((v) => v !== last).map((v) => math(String(v))),
        solution: math(`t_${n} = ${a} + (${n} - 1)(${d}) = ${last}`),
      };
    }
    if (difficulty === 2) {
      return {
        body: `Maya saves \\$${a} in the first week and \\$${d} more each week than the week before. How much has she saved in total after ${n} weeks?`,
        answer: `\\$${total.toLocaleString('en-CA')}`,
        distractors: [last, n * a, (n * (a + last))].map((v) => `\\$${v.toLocaleString('en-CA')}`),
        solution: `This is an arithmetic series: ${math(`S_${n} = ${n}/2 (${a} + ${last}) = ${total}`)}, so she has saved \\$${total.toLocaleString('en-CA')}.`,
      };
    }
    const top = rng.int(1, 5), rows = rng.int(6, 15);
    const bottom = top + rows - 1, logs = (rows * (top + bottom)) / 2;
    return {
      body: `Logs are stacked with ${bottom} in the bottom row, one fewer in each row above, and ${top} in the top row. How many logs are in the stack?`,
      answer: math(String(logs)),
      distractors: [rows * bottom, (rows * bottom) / 2, logs + bottom].map((v) => math(String(v))),
      solution: `There are ${math(`${bottom} - ${top} + 1 = ${rows}`)} rows. ${math(`S = ${rows}/2 (${bottom} + ${top}) = ${logs}`)}.`,
    };
  },
});

// ── Geometric ─────────────────────────────────────────────────────────────

function randomRatio(rng: { pick<T>(xs: readonly T[]): T }, difficulty: number): Q {
  return difficulty === 1 ? new Q(rng.pick([2, 3, 4, 5])) : difficulty === 2 ? new Q(rng.pick([-2, -3, 2, 3])) : rng.pick([new Q(1, 2), new Q(-1, 2), new Q(1, 3), new Q(2, 3), new Q(3, 2)]);
}

export const geoGeneralTerm = pc30s('30s-geo-general-term', {
  points: 1,
  levels: { 1: 'Whole-number ratio', 2: 'Negative ratio', 3: 'Fractional ratio' },
  options: [
    radioOption('form', 'Ratio', [['1', 'Whole-number ratio'], ['2', 'Negative ratio'], ['3', 'Fractional ratio']], ['1', '2', '3']),
    sizeOption([3, 6, 9], [9, 9, 9], 'Size of the first term'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const t1 = new Q(rng.nonZero(-optNum(o, 'size', 9), optNum(o, 'size', 9)) * (difficulty === 3 ? 8 : 1)), r = randomRatio(rng, difficulty);
    const terms = Array.from({ length: 4 }, (_, i) => t1.mul(pow(r, i)).typst());
    // Always bracket the ratio, so 2·2^(n−1) never reads as 22^(n−1).
    const rText = `(${r.typst()})`;
    const lead = t1.eq(1) ? '' : t1.eq(-1) ? '-' : t1.typst();
    const answer = `t_n = ${lead}${rText}^(n - 1)`;
    return {
      body: `Write the general term of the geometric sequence ${math(listText(terms))}`,
      answer: math(answer),
      distractors: [`t_n = ${lead}${rText}^n`, `t_n = ${r.typst()}(${t1.typst()})^(n - 1)`, `t_n = ${t1.typst()} + ${rText}(n - 1)`].map(math),
      solution: `The common ratio is ${math(`r = ${terms[1]}/(${terms[0]}) = ${r.typst()}`)}. ${math(`t_n = t_1 r^(n - 1)`)}, so ${math(answer)}.`,
    };
  },
});

export const geoTerm = pc30s('30s-geo-term', {
  points: 1,
  levels: { 1: 'Whole-number ratio', 2: 'Negative ratio', 3: 'Fractional ratio' },
  options: [
    radioOption('form', 'Ratio', [['1', 'Whole-number ratio'], ['2', 'Negative ratio'], ['3', 'Fractional ratio']], ['1', '2', '3']),
    sizeOption([6, 8, 10], [8, 8, 8], 'Largest term number'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const t1 = new Q(rng.nonZero(-6, 6) * (difficulty === 3 ? 64 : 1)), r = randomRatio(rng, difficulty);
    const n = rng.int(5, optNum(o, 'size', difficulty === 1 ? 9 : 8));
    const value = t1.mul(pow(r, n - 1));
    return {
      body: `Find ${math(`t_${n}`)} for the geometric sequence ${math(listText([0, 1, 2].map((i) => t1.mul(pow(r, i)).typst())))}`,
      answer: math(value.isInt ? grouped(value.n) : value.typst()),
      distractors: [t1.mul(pow(r, n)), t1.mul(pow(r, n - 2)), t1.mul(r).mul(n - 1)].filter((v) => !v.eq(value)).map((v) => math(v.isInt ? grouped(v.n) : v.typst())),
      solution: math(`t_${n} = t_1 r^(n - 1) = ${t1.typst()}(${r.typst()})^${n - 1} = ${value.typst()}`),
    };
  },
});

export const geoParameter = pc30s('30s-geo-parameter', {
  levels: { 1: 'Common ratio from two terms', 2: 'Number of terms', 3: 'First term from two terms' },
  options: [
    radioOption('form', 'Find', [['1', 'Common ratio from two terms'], ['2', 'Number of terms'], ['3', 'First term from two terms']], ['1', '2', '3']),
    radioOption('sign', 'Sign of the ratio', [['positive', 'Positive'], ['negative', 'Negative'], ['either', 'Either']], ['either', 'either', 'either']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const sign = optOne(o, 'sign', 'either');
    const t1 = rng.nonZero(-5, 5), r = rng.pick(sign === 'positive' ? [2, 3] : sign === 'negative' ? [-2, -3] : [2, 3, -2, -3]);
    if (difficulty === 1) {
      const k = rng.int(3, 5), tk = t1 * r ** (k - 1);
      const opts = [2, 3, -2, -3].filter((x) => x ** (k - 1) === r ** (k - 1));
      const answer = opts.length > 1 ? `r = ± ${Math.abs(r)}` : `r = ${r}`;
      return {
        body: `A geometric sequence has ${math(`t_1 = ${t1}`)} and ${math(`t_${k} = ${tk}`)}. Find the common ratio.`,
        answer: math(answer),
        distractors: [`r = ${new Q(tk, t1 * (k - 1)).typst()}`, `r = ${-r}`, `r = ${r * r}`, `r = ${r}`].filter((x, i, all) => x !== answer && all.indexOf(x) === i).map(math),
        solution: `${math(`${tk} = ${t1} r^${k - 1}`)}, so ${math(`r^${k - 1} = ${tk / t1}`)} and ${math(answer)}${opts.length > 1 ? ' (an even power has two real roots)' : ''}.`,
      };
    }
    if (difficulty === 2) {
      const n = rng.int(5, 10), tn = t1 * r ** (n - 1);
      return {
        body: `How many terms are in the geometric sequence ${math(`${t1}, ${t1 * r}, ${t1 * r * r}, ..., ${grouped(tn)}`)}?`,
        answer: math(String(n)),
        distractors: [n - 1, n + 1, Math.round(Math.abs(tn / t1) / Math.abs(r))].filter((v, i, all) => v !== n && all.indexOf(v) === i && v > 0).map((v) => math(String(v))),
        solution: `${math(`${grouped(tn)} = ${t1}(${r})^(n - 1)`)}, so ${math(`(${r})^(n - 1) = ${grouped(tn / t1)}`)}, ${math(`n - 1 = ${n - 1}`)}, and ${math(`n = ${n}`)}.`,
      };
    }
    const j = 2, k = rng.int(4, 5);
    const tj = t1 * r ** (j - 1), tk = t1 * r ** (k - 1);
    const signAmbiguous = (k - j) % 2 === 0;
    const answer = signAmbiguous ? `t_1 = ${t1} "or" t_1 = ${-t1}` : `t_1 = ${t1}`;
    return {
      body: `In a geometric sequence, ${math(`t_${j} = ${tj}`)} and ${math(`t_${k} = ${tk}`)}. Find ${math('t_1')}.`,
      answer: math(answer),
      distractors: [`t_1 = ${tj * r}`, `t_1 = ${tj - r}`, signAmbiguous ? `t_1 = ${t1}` : `t_1 = ${-t1}`].filter((x) => x !== answer).map(math),
      solution: `${math(`r^${k - j} = ${tk}/${tj < 0 ? `(${tj})` : tj} = ${tk / tj}`)}, so ${math(`r = ${signAmbiguous ? `± ${Math.abs(r)}` : r}`)}. Then ${math(`t_1 = t_2 / r = ${signAmbiguous ? `± ${Math.abs(t1)}` : t1}`)}.`,
    };
  },
});

export const geoSum = pc30s('30s-geo-sum', {
  levels: { 1: 'Whole-number ratio', 2: 'Negative ratio', 3: 'Fractional ratio' },
  options: [
    radioOption('form', 'Ratio', [['1', 'Whole-number ratio'], ['2', 'Negative ratio'], ['3', 'Fractional ratio']], ['1', '2', '3']),
    sizeOption([6, 9, 12], [9, 9, 9], 'Largest number of terms'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const r = randomRatio(rng, difficulty);
    const n = rng.int(5, optNum(o, 'size', 9));
    const t1 = new Q(rng.int(1, 6) * (difficulty === 3 ? r.d ** (n - 1) : 1));
    const S = t1.mul(pow(r, n).sub(1)).div(r.sub(1));
    return {
      body: `Find the sum of the first ${n} terms of the geometric series ${math(`${[0, 1, 2].map((i) => t1.mul(pow(r, i)).typst()).join(' + ')} + dots`.replace(/\+ -/g, '- '))}`,
      answer: math(S.isInt ? grouped(S.n) : S.typst()),
      distractors: [t1.mul(pow(r, n - 1).sub(1)).div(r.sub(1)), t1.mul(pow(r, n)), t1.mul(pow(r, n).sub(1)).div(r)].filter((v) => !v.eq(S)).map((v) => math(v.isInt ? grouped(v.n) : v.typst())),
      solution: math(`S_n = (t_1 (r^n - 1))/(r - 1) = (${t1.typst()}((${r.typst()})^${n} - 1))/(${r.typst()} - 1) = ${S.typst()}`),
    };
  },
});

export const geoInfinite = pc30s('30s-geo-infinite', {
  levels: { 1: 'Sum of a convergent series', 2: 'Convergent or divergent?', 3: 'Find the first term or ratio' },
  options: [
    radioOption('form', 'Task', [['1', 'Sum of a convergent series'], ['2', 'Convergent or divergent?'], ['3', 'Find the first term or ratio']], ['1', '2', '3']),
    radioOption('sign', 'Sign of the ratio', [['positive', 'Positive'], ['negative', 'Negative'], ['either', 'Either']], ['either', 'either', 'either']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const sign = optOne(o, 'sign', 'either');
    const r = rng.pick([new Q(1, 2), new Q(1, 3), new Q(-1, 2), new Q(2, 3), new Q(3, 4), new Q(-1, 3), new Q(-3, 4)].filter((q) => sign === 'either' || (q.value > 0) === (sign === 'positive')));
    const t1 = new Q(rng.int(2, 12) * r.d);
    const S = t1.div(new Q(1).sub(r));
    const series = (a: Q, ratio: Q) => `${[0, 1, 2].map((i) => a.mul(pow(ratio, i)).typst()).join(' + ')} + dots`.replace(/\+ -/g, '- ');
    if (difficulty === 2) {
      const diverge = rng.next() < 0.5;
      const ratio = diverge ? rng.pick([new Q(3, 2), new Q(-2), new Q(5, 4), new Q(-3, 2)].filter((q) => sign === 'either' || (q.value > 0) === (sign === 'positive'))) : r;
      const a = diverge ? new Q(rng.int(2, 8) * ratio.d) : t1;
      // Words stay outside math so a fraction after them renders cleanly.
      const convergent = (v: Q) => `Convergent, with sum ${math(v.typst())}`;
      const answer = diverge ? 'Divergent: there is no sum' : convergent(a.div(new Q(1).sub(ratio)));
      return {
        body: `Is the infinite geometric series ${math(series(a, ratio))} convergent or divergent? If convergent, find its sum.`,
        answer,
        distractors: (diverge
          ? [convergent(a.div(new Q(1).sub(ratio))), convergent(a.div(ratio.sub(1))), convergent(new Q(0))]
          : ['Divergent: there is no sum', convergent(a.div(new Q(1).add(ratio))), convergent(a.mul(2))]).filter((d, i, all) => d !== answer && all.indexOf(d) === i),
        solution: `${math(`r = ${ratio.typst()}`)}. ${diverge ? `${math(`|r| >= 1`)}, so the terms do not shrink and the series diverges.` : `${math('|r| < 1')}, so it converges: ${math(`S = t_1/(1 - r) = ${a.typst()}/(1 - (${ratio.typst()})) = ${a.div(new Q(1).sub(ratio)).typst()}`)}.`}`,
      };
    }
    if (difficulty === 3) {
      return {
        body: `An infinite geometric series has a sum of ${math(S.typst())} and a common ratio of ${math(r.typst())}. Find the first term.`,
        answer: math(`t_1 = ${t1.typst()}`),
        distractors: [S.mul(new Q(1).add(r)), S.mul(r), S.div(new Q(1).sub(r))].filter((v) => !v.eq(t1)).map((v) => math(`t_1 = ${v.typst()}`)),
        solution: `${math(`S = t_1/(1 - r)`)}, so ${math(`t_1 = S(1 - r) = ${S.typst()}(1 - (${r.typst()})) = ${t1.typst()}`)}.`,
      };
    }
    return {
      body: `Find the sum of the infinite geometric series ${math(series(t1, r))}`,
      answer: math(S.typst()),
      distractors: [t1.div(new Q(1).add(r)), t1.div(r), t1.mul(new Q(1).sub(r))].filter((v) => !v.eq(S)).map((v) => math(v.typst())),
      solution: `${math(`r = ${r.typst()}`)} and ${math('|r| < 1')}, so ${math(`S = t_1/(1 - r) = ${t1.typst()}/(1 - (${r.typst()})) = ${S.typst()}`)}.`,
    };
  },
});

export const geoProblem = pc30s('30s-geo-problem', {
  levels: { 1: 'Growth after n periods', 2: 'A bouncing ball’s height', 3: 'A bouncing ball’s total distance' },
  options: [
    radioOption('form', 'Context', [['1', 'Growth after n periods'], ['2', 'A bouncing ball’s height'], ['3', 'A bouncing ball’s total distance']], ['1', '2', '3']),
    radioOption('rate', 'Growth (first form)', [['2', 'Doubles'], ['3', 'Triples'], ['either', 'Either']], ['either', 'either', 'either']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    if (difficulty === 1) {
      const start = rng.pick([100, 200, 500, 1000]), rate = optOne(o, 'rate', 'either') === 'either' ? rng.pick([2, 3]) : optNum(o, 'rate', 2), n = rng.int(4, 8);
      const value = start * rate ** n;
      return {
        body: `A bacteria culture starts with ${start} cells and ${rate === 2 ? 'doubles' : 'triples'} every hour. How many cells are there after ${n} hours?`,
        answer: math(grouped(value)),
        distractors: [start * rate ** (n - 1), start * rate * n, start + rate ** n].map((v) => math(grouped(v))),
        solution: `After ${n} hours the count has been multiplied by ${math(`${rate}^${n}`)}: ${math(`${start}(${rate})^${n} = ${grouped(value)}`)}. (As a sequence, this is ${math(`t_${n + 1}`)} with ${math(`t_1 = ${start}`)}.)`,
      };
    }
    const h = rng.pick([2, 4, 5, 8, 10, 16]), r = rng.pick([new Q(1, 2), new Q(3, 4), new Q(2, 3), new Q(3, 5)]);
    if (difficulty === 2) {
      const bounce = rng.int(3, 6);
      const height = new Q(h).mul(pow(r, bounce));
      return {
        body: `A ball is dropped from ${h} m and bounces back to ${math(r.typst())} of its previous height each time. How high does it rise after the ${['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth'][bounce]} bounce? Round to the nearest hundredth of a metre.`,
        answer: math(`${round(height.value, 2)} "m"`),
        distractors: [new Q(h).mul(pow(r, bounce - 1)).value, new Q(h).mul(r).mul(bounce).value, h - new Q(h).mul(pow(r, bounce)).value].map((v) => math(`${round(v, 2)} "m"`)),
        solution: math(`h = ${h}(${r.typst()})^${bounce} approx ${round(height.value, 2)}`) + ' m.',
      };
    }
    // Total vertical distance: down h, then up and down each bounce: h + 2·h·r/(1 − r)
    const total = new Q(h).add(new Q(h).mul(r).mul(2).div(new Q(1).sub(r)));
    return {
      body: `A ball is dropped from ${h} m and bounces back to ${math(r.typst())} of its previous height each time, forever. What total vertical distance does it travel?`,
      answer: math(`${total.typst()} "m"`),
      distractors: [new Q(h).div(new Q(1).sub(r)), new Q(h).mul(2).div(new Q(1).sub(r)), new Q(h).mul(r).div(new Q(1).sub(r))].filter((v) => !v.eq(total)).map((v) => math(`${v.typst()} "m"`)),
      solution: `The first drop is ${h} m. Each bounce goes up and down, so the rest is ${math(`2(${new Q(h).mul(r).typst()} + ${new Q(h).mul(pow(r, 2)).typst()} + dots) = 2 dot (${new Q(h).mul(r).typst()})/(1 - ${r.typst()})`)}. Total: ${math(`${total.typst()}`)} m.`,
    };
  },
});

export const SEQUENCE_30S = [arithGeneralTerm, arithTerm, arithParameter, arithSum, arithSumParameter, arithProblem, geoGeneralTerm, geoTerm, geoParameter, geoSum, geoInfinite, geoProblem];

