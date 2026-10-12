// Algebra 1, after Kuta's Mixture, DistanceRateTime, Work, LiteralEquations,
// CompoundInequalities, AbsValueInequalities, FunctionsEval, GraphAbs,
// DirectInverseVariation, InequalitySystems, ExpGrowthDecayDiscrete,
// FactorSpecial, FactorByGrouping, and CompleteSquare.
import { Q } from '../../exact.ts';
import { gcd, poly, polynomial, signed, sub } from '../../format.ts';
import { graphTypst, type GraphSpec } from '../../graph.ts';
import { manyOption, optList, optOn, optOne, radioOption, toggleOption } from '../../options.ts';
import { numberLine } from '../grade10/shared.ts';
import { us, math, task, wrong, decimal, fixed, money, NAMES } from './common.ts';

/** A small graph on the standard −8…8 window, as used for answer choices. */
export const smallGraph = (spec: Partial<GraphSpec>) => graphTypst({ xMin: -8, xMax: 8, yMin: -8, yMax: 8, xLabelStep: 2, yLabelStep: 2, width: 3.4, height: 3.4, ...spec });

// ── Word problems ────────────────────────────────────────────────────────────

export const a1Mixture = us('a1-mixture', {
  points: 3,
  levels: { 1: 'Mixing two items with prices', 2: 'Mixing two solutions', 3: 'Adding pure solution or water' },
  options: [radioOption('kind', 'Problems', [['price', 'Items with prices'], ['solution', 'Two solutions'], ['pure', 'Adding pure substance or water']], ['price', 'solution', 'pure'])],
  generate(rng, level, o) {
    const kind = optOne(o, 'kind', ['price', 'solution', 'pure'][level - 1]);
    if (kind === 'price') {
      const [item, unit] = rng.pick([['peanuts', 'kg'], ['coffee beans', 'kg'], ['tea leaves', 'kg'], ['granola', 'kg']]);
      for (;;) {
        const p1 = rng.int(4, 9), p2 = rng.int(p1 + 3, 18), a = rng.int(2, 20), b = rng.int(2, 20);
        const total = a + b, value = p1 * a + p2 * b;
        if ((value * 100) % total) continue;
        const mixPrice = value / total;
        const answer = `${math(String(a))} ${unit} at ${math(money(p1))} and ${math(String(b))} ${unit} at ${math(money(p2))}`;
        return {
          body: `A shop mixes ${item} that cost ${math(money(p1))} per ${unit} with ${item} that cost ${math(money(p2))} per ${unit} to make ${math(String(total))} ${unit} of a mix worth ${math(money(mixPrice))} per ${unit}. How much of each should it use?`,
          answer,
          distractors: wrong(answer, [`${math(String(b))} ${unit} at ${math(money(p1))} and ${math(String(a))} ${unit} at ${math(money(p2))}`, `${math(String(total / 2))} ${unit} at ${math(money(p1))} and ${math(String(total / 2))} ${unit} at ${math(money(p2))}`, `${math(String(a + 1))} ${unit} at ${math(money(p1))} and ${math(String(b - 1))} ${unit} at ${math(money(p2))}`]),
          solution: `Let ${math('x')} be the ${unit} at ${math(money(p1))}. Then ${math(`${p1}x + ${p2}(${total} - x) = ${decimal(mixPrice, 2)}(${total})`)}, so ${math(`x = ${a}`)} and ${math(`${total} - x = ${b}`)}.`,
        };
      }
    }
    if (kind === 'solution') {
      for (;;) {
        const c1 = rng.pick([5, 10, 15, 20, 25, 30]), c2 = rng.pick([40, 45, 50, 60, 70, 80]);
        const a = rng.int(2, 15), b = rng.int(2, 15);
        const total = a + b, target = (c1 * a + c2 * b) / total;
        if (!Number.isInteger(target)) continue;
        const answer = `${math(String(a))} L of ${c1}% and ${math(String(b))} L of ${c2}%`;
        return {
          body: `How many litres of a ${c1}% acid solution and a ${c2}% acid solution must be mixed to make ${math(String(total))} L of a ${target}% acid solution?`,
          answer,
          distractors: wrong(answer, [`${math(String(b))} L of ${c1}% and ${math(String(a))} L of ${c2}%`, `${math(String(total / 2))} L of ${c1}% and ${math(String(total / 2))} L of ${c2}%`, `${math(String(a + 2))} L of ${c1}% and ${math(String(b - 2))} L of ${c2}%`]),
          solution: `Let ${math('x')} be the litres of ${c1}%. The acid adds up: ${math(`${c1 / 100}x + ${c2 / 100}(${total} - x) = ${target / 100}(${total})`)}, so ${math(`x = ${a}`)} L, and ${math(String(b))} L of the ${c2}% solution.`,
        };
      }
    }
    for (;;) {
      const v = rng.int(4, 20) * 5, c = rng.pick([10, 20, 25, 30, 40]);
      const water = rng.next() < 0.5;
      const target = water ? rng.pick([5, 8, 10, 12, 15, 20].filter((t) => t < c)) : rng.pick([50, 60, 40, 45].filter((t) => t > c));
      const x = water ? (v * c) / target - v : (v * (target - c)) / (100 - target);
      if (!Number.isInteger(x) || x <= 0 || x > 200) continue;
      const answer = `${math(String(x))} L`;
      return {
        body: `How much ${water ? 'water' : 'pure acid'} must be added to ${math(String(v))} L of a ${c}% acid solution to make a ${target}% acid solution?`,
        answer,
        distractors: wrong(answer, [x * 2, Math.round(x / 2), v, Math.abs(target - c)].filter((t) => t > 0).map((t) => `${math(String(t))} L`)),
        solution: water
          ? `The acid stays the same: ${math(`${c / 100}(${v}) = ${target / 100}(${v} + x)`)}, so ${math(`x = ${x}`)}.`
          : `${math(`${c / 100}(${v}) + x = ${target / 100}(${v} + x)`)}, so ${math(`x = ${x}`)}.`,
      };
    }
  },
});

export const a1DistanceRateTime = us('a1-distance-rate-time', {
  points: 3,
  levels: { 1: 'Opposite directions', 2: 'Catching up', 3: 'Round trips with a current or wind' },
  options: [radioOption('kind', 'Problems', [['apart', 'Opposite directions'], ['catch', 'Catching up'], ['current', 'With and against a current']], ['apart', 'catch', 'current'])],
  generate(rng, level, o) {
    const kind = optOne(o, 'kind', ['apart', 'catch', 'current'][level - 1]);
    const [a, b] = rng.shuffle(NAMES).slice(0, 2);
    if (kind === 'apart') {
      const r1 = rng.int(4, 12) * 5, r2 = rng.int(4, 12) * 5, t = rng.int(2, 6);
      const d = (r1 + r2) * t;
      const answer = `${math(String(t))} hours`;
      return {
        body: `${a} and ${b} leave the same town at the same time, driving in opposite directions. ${a} drives at ${r1} km/h and ${b} at ${r2} km/h. After how many hours will they be ${d} km apart?`,
        answer,
        distractors: wrong(answer, [d / Math.abs(r1 - r2 || 1), t + 1, d / Math.max(r1, r2)].map((v) => `${math(fixed(v, 1).replace(/\.0$/, ''))} hours`)),
        solution: `They separate at ${math(`${r1} + ${r2} = ${r1 + r2}`)} km/h, so ${math(`t = ${d} / ${r1 + r2} = ${t}`)} hours.`,
      };
    }
    if (kind === 'catch') {
      const r1 = rng.int(6, 12) * 5, head = rng.int(1, 3), r2 = r1 + rng.int(2, 6) * 5;
      const t = (r1 * head) / (r2 - r1);
      if (!Number.isInteger(t * 2)) return a1DistanceRateTime.generate(rng, 2, { kind: 'catch' });
      const answer = `${math(decimal(t))} hours`;
      return {
        body: `A truck leaves a depot travelling at ${r1} km/h. ${head} hour${head > 1 ? 's' : ''} later, a car leaves the same depot on the same road at ${r2} km/h. How long after the car leaves will it catch up to the truck?`,
        answer,
        distractors: wrong(answer, [t + head, (r1 * head) / r2, head * 2, (r2 * head) / (r2 - r1)].map((v) => `${math(fixed(v, 1).replace(/\.0$/, ''))} hours`)),
        solution: `When the car catches up, both have gone the same distance: ${math(`${r2}t = ${r1}(t + ${head})`)}, so ${math(`t = ${decimal(t)}`)} hours.`,
      };
    }
    for (;;) {
      const r = rng.int(8, 30), c = rng.int(2, 6);
      const up = r - c, down = r + c;
      const d = up * down * rng.int(1, 2) / gcd(up, down);
      const total = d / up + d / down;
      if (!Number.isInteger(total * 4)) continue;
      const answer = `${math(String(r))} km/h`;
      return {
        body: `A boat travels ${math(String(d))} km upstream and ${math(String(d))} km back downstream in a total of ${math(decimal(total))} hours. The current flows at ${c} km/h. Find the speed of the boat in still water.`,
        answer,
        distractors: wrong(answer, [r + c, r - c, Math.round((2 * d) / total)].map((v) => `${math(String(v))} km/h`)),
        solution: `Upstream speed is ${math('r - ' + c)}, downstream is ${math('r + ' + c)}: ${math(`${d}/(r - ${c}) + ${d}/(r + ${c}) = ${decimal(total)}`)}, which gives ${math(`r = ${r}`)}.`,
      };
    }
  },
});

export const a1Work = us('a1-work', {
  points: 3,
  levels: { 1: 'Two people together', 2: 'Find one rate from the combined time', 3: 'One starts first' },
  options: [radioOption('kind', 'Problems', [['together', 'Time working together'], ['alone', 'Time for one alone'], ['start', 'One starts first']], ['together', 'alone', 'start'])],
  generate(rng, level, o) {
    const kind = optOne(o, 'kind', ['together', 'alone', 'start'][level - 1]);
    const [a, b] = rng.shuffle(NAMES).slice(0, 2);
    const job = rng.pick(['paint a fence', 'mow a lawn', 'clean the gym', 'stack the chairs', 'sort the mail']);
    const ta = rng.int(2, 12);
    let tb = rng.int(2, 12); while (tb === ta) tb = rng.int(2, 12);
    const together = new Q(ta * tb, ta + tb);
    const hours = (q: Q) => (q.isInt ? `${math(q.typst())} hour${q.eq(1) ? '' : 's'}` : `${math(q.typst())} hours (about ${math(fixed(q.value, 1))} hours)`);
    if (kind === 'together') {
      const answer = hours(together);
      return {
        body: `${a} can ${job} in ${ta} hours. ${b} can do it in ${tb} hours. How long will it take them working together?`,
        answer,
        distractors: wrong(answer, [new Q(ta + tb, 2), new Q(ta + tb), new Q(Math.abs(ta - tb)), new Q(ta * tb, Math.abs(ta - tb) || 1)].map(hours)),
        solution: `Rates add: ${math(`1/${ta} + 1/${tb} = 1/t`)}, so ${math(`t = (${ta} dot ${tb})/(${ta} + ${tb}) = ${together.typst()}`)} hours.`,
      };
    }
    if (kind === 'alone') {
      const answer = hours(new Q(tb));
      return {
        body: `Working together, ${a} and ${b} can ${job} in ${together.isInt ? together.typst() : math(together.typst())} hours. Alone, ${a} takes ${ta} hours. How long would ${b} take alone?`,
        answer,
        distractors: wrong(answer, [together.sub(ta).abs(), new Q(ta).sub(together), new Q(ta).add(together), new Q(ta * 2)].filter((q) => q.value > 0).map(hours)),
        solution: `${math(`1/${ta} + 1/t = 1/(${together.typst()})`)}, so ${math(`1/t = ${new Q(1).div(together).sub(new Q(1, ta)).typst()}`)} and ${math(`t = ${tb}`)} hours.`,
      };
    }
    const first = rng.int(1, Math.max(1, ta - 1));
    const rest = new Q(1).sub(new Q(first, ta)).div(new Q(1, ta).add(new Q(1, tb)));
    const answer = hours(rest);
    return {
      body: `${a} can ${job} in ${ta} hours and ${b} can do it in ${tb} hours. ${a} works alone for ${first} hour${first > 1 ? 's' : ''}, then ${b} joins. How much longer will it take to finish?`,
      answer,
      distractors: wrong(answer, [together, together.sub(first).abs(), new Q(ta - first), rest.add(first)].filter((q) => q.value > 0).map(hours)),
      solution: `${a} finishes ${math(`${first}/${ta}`)} of the job alone. Together they work at ${math(`1/${ta} + 1/${tb}`)} per hour, so the rest takes ${math(`(1 - ${first}/${ta}) div (1/${ta} + 1/${tb}) = ${rest.typst()}`)} hours.`,
    };
  },
});

// ── Literal equations ────────────────────────────────────────────────────────

const LITERAL: Array<{ eq: string; v: string; answer: string; wrong: string[] }> = [
  { eq: 'A = l w', v: 'w', answer: 'w = A/l', wrong: ['w = A l', 'w = l/A', 'w = A - l'] },
  { eq: 'P = 2l + 2w', v: 'l', answer: 'l = (P - 2w)/2', wrong: ['l = P/2 - 2w', 'l = P - w', 'l = (P + 2w)/2'] },
  { eq: 'd = r t', v: 't', answer: 't = d/r', wrong: ['t = d r', 't = r/d', 't = d - r'] },
  { eq: 'y = m x + b', v: 'x', answer: 'x = (y - b)/m', wrong: ['x = y/m - b', 'x = (y + b)/m', 'x = m(y - b)'] },
  { eq: 'a x + b y = c', v: 'y', answer: 'y = (c - a x)/b', wrong: ['y = (c + a x)/b', 'y = c/b - a x', 'y = b(c - a x)'] },
  { eq: 'V = 1/3 B h', v: 'h', answer: 'h = (3V)/B', wrong: ['h = V/(3B)', 'h = (3B)/V', 'h = 3V B'] },
  { eq: 'F = 9/5 C + 32', v: 'C', answer: 'C = 5/9 (F - 32)', wrong: ['C = 9/5 (F - 32)', 'C = 5/9 F - 32', 'C = (F + 32)5/9'] },
  { eq: 'I = P r t', v: 'r', answer: 'r = I/(P t)', wrong: ['r = (I P)/t', 'r = I P t', 'r = (P t)/I'] },
  { eq: 'A = 1/2 b h', v: 'b', answer: 'b = (2A)/h', wrong: ['b = A/(2h)', 'b = 2A h', 'b = (2h)/A'] },
  { eq: 'v = u + a t', v: 'a', answer: 'a = (v - u)/t', wrong: ['a = v/t - u', 'a = (v + u)/t', 'a = t(v - u)'] },
  { eq: 'S = 2pi r h', v: 'h', answer: 'h = S/(2pi r)', wrong: ['h = 2pi r S', 'h = (2pi r)/S', 'h = S - 2pi r'] },
  { eq: 'm = (a + b)/2', v: 'b', answer: 'b = 2m - a', wrong: ['b = m/2 - a', 'b = 2m + a', 'b = 2(m - a)'] },
  { eq: 'x/a + c = d', v: 'x', answer: 'x = a(d - c)', wrong: ['x = a d - c', 'x = (d - c)/a', 'x = a(d + c)'] },
  { eq: 'a(x - b) = c', v: 'x', answer: 'x = c/a + b', wrong: ['x = c/a - b', 'x = (c - b)/a', 'x = a c + b'] },
];

export const a1Literal = us('a1-literal', {
  levels: { 1: 'One step', 2: 'Two steps', 3: 'Any formula' },
  generate(rng, level) {
    const pool = level === 1 ? LITERAL.filter((l) => !/[+-]/.test(l.eq)) : level === 2 ? LITERAL.filter((l) => /[+-]/.test(l.eq)) : LITERAL;
    const l = rng.pick(pool);
    return {
      body: `Solve ${math(l.eq)} for ${math(l.v)}.`,
      task: { instruction: 'Solve each equation for the indicated variable.', item: `${math(l.eq)}, for ${math(l.v)}` },
      answer: math(l.answer),
      distractors: l.wrong.map(math),
      solution: `Undo the operations on ${math(l.v)} in reverse order, doing the same to both sides: ${math(l.answer)}.`,
    };
  },
});

// ── Inequalities ─────────────────────────────────────────────────────────────

type Interval = { lo?: number; hi?: number; loIn?: boolean; hiIn?: boolean };
const intervalText = (v: string, i: Interval) =>
  i.lo !== undefined && i.hi !== undefined ? `${i.lo} ${i.loIn ? '<=' : '<'} ${v} ${i.hiIn ? '<=' : '<'} ${i.hi}`
    : i.lo !== undefined ? `${v} ${i.loIn ? '>=' : '>'} ${i.lo}` : `${v} ${i.hiIn ? '<=' : '<'} ${i.hi}`;

/** The number line for a solution: one segment or ray, or two rays. */
function solutionLine(parts: Interval[]): string {
  const ends = parts.flatMap((p) => [p.lo, p.hi]).filter((v): v is number => v !== undefined);
  const from = Math.min(...ends) - 3, to = Math.max(...ends) + 3;
  if (parts.length === 1 && parts[0].lo !== undefined && parts[0].hi !== undefined) {
    return numberLine({ from, to, segment: { from: parts[0].lo, to: parts[0].hi, openFrom: !parts[0].loIn, openTo: !parts[0].hiIn }, width: 7 });
  }
  if (parts.length === 1) return numberLine({ from, to, ray: { at: (parts[0].lo ?? parts[0].hi)!, dir: parts[0].lo !== undefined ? 'right' : 'left', open: !(parts[0].loIn ?? parts[0].hiIn) }, width: 7 });
  // Two rays: draw the left one, then overlay the right one on the same window.
  const left = numberLine({ from, to, ray: { at: parts[0].hi!, dir: 'left', open: !parts[0].hiIn }, width: 7 });
  const right = numberLine({ from, to, ray: { at: parts[1].lo!, dir: 'right', open: !parts[1].loIn }, width: 7 });
  return `#box(width: 7.9cm, height: 1.8cm, { place(${left.slice(1)}); place(${right.slice(1)}) })`;
}

export const a1CompoundIneq = us('a1-compound-ineq', {
  levels: { 1: '"And" inequalities, one step', 2: '"Or" inequalities', 3: 'Two steps, either kind' },
  options: [manyOption('kinds', 'Kinds', [['and', 'And (between)'], ['or', 'Or']], [['and'], ['or'], ['and', 'or']]), toggleOption('graph', 'Graph the solution', [true, true, true])],
  generate(rng, level, o) {
    const kind = rng.pick(optList(o, 'kinds', ['and']));
    const v = rng.pick(['x', 'n', 'k', 'p', 'r', 'm']);
    const a = level === 3 ? rng.int(2, 5) : 1, b = rng.nonZero(-9, 9);
    const lo = rng.int(-8, 2), hi = lo + rng.int(2, 9);
    const loIn = rng.next() < 0.5, hiIn = rng.next() < 0.5;
    const expr = poly([a, b], v);
    let ineq: string, parts: Interval[];
    if (kind === 'and') {
      ineq = `${a * lo + b} ${loIn ? '<=' : '<'} ${expr} ${hiIn ? '<=' : '<'} ${a * hi + b}`;
      parts = [{ lo, hi, loIn, hiIn }];
    } else {
      const c = rng.nonZero(-9, 9), e = rng.int(1, 3);
      ineq = `${expr} ${hiIn ? '<=' : '<'} ${a * lo + b} "or" ${poly([e, c], v)} ${loIn ? '>=' : '>'} ${e * hi + c}`;
      parts = [{ hi: lo, hiIn }, { lo: hi, loIn }];
    }
    const answer = kind === 'and' ? intervalText(v, parts[0]) : `${intervalText(v, parts[0])} "or" ${intervalText(v, parts[1])}`;
    const flipped = kind === 'and' ? `${v} < ${lo} "or" ${v} > ${hi}` : `${lo} < ${v} < ${hi}`;
    const graph = optOn(o, 'graph', true);
    return task(graph ? 'Solve each compound inequality and graph its solution.' : 'Solve each compound inequality.', 'Solve', ineq, {
      answer: math(answer),
      distractors: wrong(math(answer), [flipped, kind === 'and' ? intervalText(v, { lo: lo - 1, hi: hi + 1, loIn, hiIn }) : `${intervalText(v, { hi: lo + 1, hiIn })} "or" ${intervalText(v, { lo: hi - 1, loIn })}`, kind === 'and' ? intervalText(v, { lo: -hi, hi: -lo, loIn: hiIn, hiIn: loIn }) : `${intervalText(v, { hi: -hi, hiIn })} "or" ${intervalText(v, { lo: -lo, loIn })}`].map(math)),
      solution: `${kind === 'and' ? 'Do the same to all three parts' : 'Solve each inequality separately'}: ${math(answer)}.${graph ? `\n\n${solutionLine(parts)}` : ''}`,
    });
  },
});

export const a1AbsIneq = us('a1-abs-ineq', {
  levels: { 1: '|x + b| < c and |x + b| > c', 2: '|ax + b| with a ≠ 1', 3: 'Including no solution and all real numbers' },
  options: [toggleOption('special', 'Include special cases (no solution, all real numbers)', [false, false, true]), toggleOption('outside', 'Include operations outside the bars', [false, true, true]), toggleOption('graph', 'Graph the solution', [true, true, true])],
  generate(rng, level, o) {
    const v = rng.pick(['x', 'n', 'k', 'p', 'r', 'm']);
    const special = optOn(o, 'special', false) && rng.next() < 0.3;
    const a = level === 1 ? 1 : rng.int(1, 4), x0 = rng.int(-6, 6), half = rng.int(1, 6);
    const b = -a * x0;
    const less = rng.next() < 0.5, incl = rng.next() < 0.5;
    const rel = less ? (incl ? '<=' : '<') : incl ? '>=' : '>';
    const outside = optOn(o, 'outside', false) ? { k: rng.int(2, 4), m: rng.int(-6, 6) } : { k: 1, m: 0 };
    const abs = `|${poly([a, b], v)}|`;
    const left = `${outside.k === 1 ? '' : outside.k}${abs}${outside.m ? ` ${signed(outside.m)}` : ''}`;
    if (special) {
      const c = -rng.int(1, 6);
      const ineq = `${left} ${rel} ${outside.k * c + outside.m}`;
      const answer = less ? '"no solution"' : '"all real numbers"';
      return task('Solve each inequality.', 'Solve', ineq, {
        answer: math(answer),
        distractors: wrong(math(answer), ['"no solution"', '"all real numbers"', `${v} ${rel} ${c}`, `${v} ${less ? '>' : '<'} ${-c}`].map(math)),
        solution: `An absolute value is never negative, so ${math(`${abs} ${rel} ${c}`)} is ${less ? 'never true' : 'always true'}: ${math(answer)}.`,
      });
    }
    const c = a * half;
    const ineq = `${left} ${rel} ${outside.k * c + outside.m}`;
    const [lo, hi] = [new Q(-c - b, a), new Q(c - b, a)];
    const answer = less ? `${lo.typst()} ${incl ? '<=' : '<'} ${v} ${incl ? '<=' : '<'} ${hi.typst()}` : `${v} ${incl ? '<=' : '<'} ${lo.typst()} "or" ${v} ${incl ? '>=' : '>'} ${hi.typst()}`;
    const opposite = !less ? `${lo.typst()} ${incl ? '<=' : '<'} ${v} ${incl ? '<=' : '<'} ${hi.typst()}` : `${v} ${incl ? '<=' : '<'} ${lo.typst()} "or" ${v} ${incl ? '>=' : '>'} ${hi.typst()}`;
    const noNeg = `${v} ${rel} ${hi.typst()}`;
    const shifted = less ? `${new Q(-c + b, a).typst()} ${incl ? '<=' : '<'} ${v} ${incl ? '<=' : '<'} ${new Q(c + b, a).typst()}` : `${v} ${incl ? '<=' : '<'} ${new Q(-c + b, a).typst()} "or" ${v} ${incl ? '>=' : '>'} ${new Q(c + b, a).typst()}`;
    const graph = optOn(o, 'graph', true) && lo.isInt && hi.isInt;
    const parts: Interval[] = less ? [{ lo: lo.value, hi: hi.value, loIn: incl, hiIn: incl }] : [{ hi: lo.value, hiIn: incl }, { lo: hi.value, loIn: incl }];
    return task(optOn(o, 'graph', true) ? 'Solve each inequality and graph its solution.' : 'Solve each inequality.', 'Solve', ineq, {
      answer: math(answer),
      distractors: wrong(math(answer), [opposite, noNeg, shifted].map(math)),
      solution: `${outside.k !== 1 || outside.m ? `Isolate the absolute value: ${math(`${abs} ${rel} ${c}`)}. ` : ''}${less ? `${math(`|u| ${rel} ${c}`)} means ${math(`-${c} ${rel} u ${rel} ${c}`)}` : `${math(`|u| ${rel} ${c}`)} means ${math(`u ${less ? rel : rel.replace('>', '<')} -${c}`)} or ${math(`u ${rel} ${c}`)}`}: ${math(answer)}.${graph ? `\n\n${solutionLine(parts)}` : ''}`,
    });
  },
});

// ── Functions ────────────────────────────────────────────────────────────────

export const a1EvaluateFunctions = us('a1-evaluate-functions', {
  levels: { 1: 'f(a) for a number', 2: 'f(x + a) and f(−x)', 3: 'f(g(a)) and expressions with two functions' },
  options: [manyOption('ask', 'Evaluate', [['number', 'f(a)'], ['expr', 'f(x + a) or f(2x)'], ['compose', 'f(g(a))'], ['combine', 'f(a) + g(b)']], [['number'], ['expr'], ['compose', 'combine']])],
  generate(rng, _level, o) {
    const ask = rng.pick(optList(o, 'ask', ['number']));
    const kind = rng.pick(['linear', 'quadratic', 'abs'] as const);
    const p = rng.nonZero(-5, 5), q = rng.int(-9, 9), r = rng.nonZero(-3, 3);
    const f = (x: number) => (kind === 'linear' ? p * x + q : kind === 'quadratic' ? r * x * x + p * x + q : Math.abs(p * x + q));
    const fText = kind === 'linear' ? poly([p, q]) : kind === 'quadratic' ? poly([r, p, q]) : `|${poly([p, q])}|`;
    const g = (x: number) => 2 * x - 1;
    if (ask === 'number') {
      const a = rng.int(-5, 5);
      const ans = f(a);
      return {
        body: `If ${math(`f(x) = ${fText}`)}, find ${math(`f(${a})`)}.`, task: { instruction: 'Evaluate each function.', item: math(`f(x) = ${fText}`) },
        answer: math(String(ans)),
        distractors: wrong(math(String(ans)), [f(-a), ans + 1, kind === 'quadratic' ? -r * a * a + p * a + q : ans - 2 * q, kind === 'abs' ? p * a + q : -ans].map((n) => math(String(n)))),
        solution: `Substitute ${math(`x = ${a}`)}: ${math(`f(${a}) = ${fText.replace(/x/g, sub(a))} = ${ans}`)}.`,
      };
    }
    if (ask === 'expr') {
      const twice = rng.next() < 0.3;
      const a = twice ? rng.int(2, 4) * rng.sign() : rng.nonZero(-4, 4);
      const arg = twice ? `${a}x` : poly([1, a]);
      if (kind === 'abs') {
        const ans = twice ? `|${poly([p * a, q])}|` : `|${poly([p, p * a + q])}|`;
        return { body: `If ${math(`f(x) = ${fText}`)}, find ${math(`f(${arg})`)}.`, answer: math(ans), distractors: wrong(math(ans), [`|${poly([p, q])}| ${signed(a)}`, `|${poly([p, a + q])}|`, `${a}|${poly([p, q])}|`].map(math)), solution: `Replace each ${math('x')} with ${math(`(${arg})`)} and simplify: ${math(ans)}.` };
      }
      const coefs = kind === 'linear' ? (twice ? [p * a, q] : [p, p * a + q]) : twice ? [r * a * a, p * a, q] : [r, 2 * r * a + p, r * a * a + p * a + q];
      const ans = poly(coefs);
      const slip = kind === 'linear' ? poly([p, q + a]) : poly([r, p, r * a * a + q]);
      return {
        body: `If ${math(`f(x) = ${fText}`)}, find ${math(`f(${arg})`)}.`,
        answer: math(ans),
        distractors: wrong(math(ans), [slip, `${fText} ${signed(a)}`, poly(kind === 'linear' ? [p * a, q] : [r, p * a, q])].map(math)),
        solution: `Replace each ${math('x')} with ${math(`(${arg})`)} and simplify: ${math(`f(${arg}) = ${ans}`)}.`,
      };
    }
    const a = rng.int(-3, 4), bb = rng.int(-3, 4);
    if (ask === 'compose') {
      const ans = f(g(a));
      return {
        body: `If ${math(`f(x) = ${fText}`)} and ${math('g(x) = 2x - 1')}, find ${math(`f(g(${a}))`)}.`,
        answer: math(String(ans)),
        distractors: wrong(math(String(ans)), [g(f(a)), f(a) * g(a), f(a) + g(a), ans + 1].map((n) => math(String(n)))),
        solution: `${math(`g(${a}) = ${g(a)}`)}, then ${math(`f(${g(a)}) = ${ans}`)}.`,
      };
    }
    const ans = f(a) + g(bb);
    return {
      body: `If ${math(`f(x) = ${fText}`)} and ${math('g(x) = 2x - 1')}, find ${math(`f(${a}) + g(${bb})`)}.`,
      answer: math(String(ans)),
      distractors: wrong(math(String(ans)), [f(bb) + g(a), f(a) - g(bb), f(a + bb), ans - 1].map((n) => math(String(n)))),
      solution: `${math(`f(${a}) = ${f(a)}`)} and ${math(`g(${bb}) = ${g(bb)}`)}, so the sum is ${math(String(ans))}.`,
    };
  },
});

// ── Graphs ───────────────────────────────────────────────────────────────────

export const a1GraphAbs = us('a1-graph-abs', {
  levels: { 1: 'y = |x − h| + k', 2: 'y = a|x − h| + k, a > 0', 3: 'Negative and fractional a' },
  generate(rng, level) {
    const h = rng.int(-4, 4), k = rng.int(-4, 4);
    const a = level === 1 ? 1 : level === 2 ? rng.int(2, 3) : rng.pick([-1, -2, 1 / 2, -1 / 2, 2]);
    const f = (aa: number, hh: number, kk: number) => (x: number) => aa * Math.abs(x - hh) + kk;
    const aText = a === 1 ? '' : a === -1 ? '-' : a === 0.5 ? '1/2' : a === -0.5 ? '-1/2' : String(a);
    const inner = h === 0 ? 'x' : poly([1, -h]);
    const eq = `y = ${aText}|${inner}|${k ? ` ${signed(k)}` : ''}`;
    const draw = (fn: (x: number) => number) => smallGraph({ curves: [{ f: fn }] });
    return {
      body: `Graph ${math(eq)}.`,
      task: { instruction: 'Graph each equation.', item: math(eq) },
      answer: draw(f(a, h, k)),
      distractors: [draw(f(a, -h, k)), draw(f(-a, h, k)), draw(f(a, h, -k)), draw(f(a === 1 ? 2 : 1, h, k))],
      solution: `The vertex is ${math(`(${h}, ${k})`)}. ${a < 0 ? 'The graph opens down. ' : ''}From the vertex, the graph ${a < 0 ? 'falls' : 'rises'} ${math(String(Math.abs(a)))} for each step of 1 to the left or right.`,
    };
  },
});

export const a1Variation = us('a1-variation', {
  levels: { 1: 'Direct variation', 2: 'Inverse variation', 3: 'Either, or decide from a table' },
  options: [radioOption('kind', 'Variation', [['direct', 'Direct'], ['inverse', 'Inverse'], ['either', 'Either'], ['table', 'Decide from a table']], ['direct', 'inverse', 'either'])],
  generate(rng, level, o) {
    let kind = optOne(o, 'kind', ['direct', 'inverse', 'either'][level - 1]);
    if (kind === 'either') kind = rng.pick(['direct', 'inverse', 'table']);
    const k = rng.int(2, 12);
    if (kind === 'table') {
      const which = rng.pick(['direct', 'inverse', 'neither'] as const);
      const xs = rng.shuffle([1, 2, 3, 4, 6, 12]).slice(0, 4).sort((a, b) => a - b);
      const ys = xs.map((x) => (which === 'direct' ? k * x : which === 'inverse' ? (k * 12) / x : k * x + rng.int(1, 3)));
      const table = `#table(columns: ${xs.length + 1}, align: center, inset: 5pt, [$x$], ${xs.map((x) => `[$${x}$]`).join(', ')}, [$y$], ${ys.map((y) => `[$${decimal(y)}$]`).join(', ')})`;
      const answer = which === 'neither' ? 'neither' : `${which} variation`;
      return {
        body: `Does the table show direct variation, inverse variation, or neither?\n\n${table}`,
        answer, distractors: wrong(answer, ['direct variation', 'inverse variation', 'neither']),
        solution: which === 'direct' ? `${math('y/x')} is always ${k}, so ${math(`y = ${k}x`)}: direct variation.` : which === 'inverse' ? `${math('x y')} is always ${k * 12}, so ${math(`y = ${k * 12}/x`)}: inverse variation.` : 'Neither the ratio y/x nor the product xy is constant.',
      };
    }
    const x1 = rng.int(2, 8);
    let x2 = rng.int(2, 12);
    if (x2 === x1) x2 = x1 + 1;
    if (kind === 'direct') {
      const y1 = k * x1, y2 = k * x2;
      return {
        body: `${math('y')} varies directly with ${math('x')}, and ${math(`y = ${y1}`)} when ${math(`x = ${x1}`)}. Find ${math('y')} when ${math(`x = ${x2}`)}.`,
        answer: math(`y = ${y2}`),
        distractors: wrong(math(`y = ${y2}`), [new Q(y1 * x1, x2).typst(), String(y1 + x2 - x1), new Q(x2, k).typst()].map((t) => math(`y = ${t}`))),
        solution: `${math(`k = y/x = ${y1}/${x1} = ${k}`)}, so ${math(`y = ${k}x`)} and ${math(`y = ${k}(${x2}) = ${y2}`)}.`,
      };
    }
    const kk = k * x1 * rng.int(1, 3), y1 = new Q(kk, x1), y2 = new Q(kk, x2);
    return {
      body: `${math('y')} varies inversely with ${math('x')}, and ${math(`y = ${y1.typst()}`)} when ${math(`x = ${x1}`)}. Find ${math('y')} when ${math(`x = ${x2}`)}.`,
      answer: math(`y = ${y2.typst()}`),
      distractors: wrong(math(`y = ${y2.typst()}`), [y1.div(x1).mul(x2), y1.add(x1 - x2), new Q(x2, kk)].map((t) => math(`y = ${t.typst()}`))),
      solution: `${math(`k = x y = ${x1} dot ${y1.typst()} = ${kk}`)}, so ${math(`y = ${kk}/x`)} and ${math(`y = ${kk}/${x2} = ${y2.typst()}`)}.`,
    };
  },
});

export const a1InequalitySystems = us('a1-inequality-systems', {
  levels: { 1: 'Slope-intercept form', 2: 'Slope-intercept form, one vertical or horizontal line', 3: 'Standard form' },
  generate(rng, level) {
    const line = () => ({ m: rng.pick([-3, -2, -1, -1 / 2, 1 / 2, 1, 2, 3]), b: rng.int(-4, 4), above: rng.next() < 0.5, strict: rng.next() < 0.5 });
    const l1 = line();
    let l2 = line(); while (l2.m === l1.m) l2 = line();
    const special = level === 2 ? 'y' : null;
    const c = rng.int(-4, 4);
    const mText = (m: number) => (m === 1 ? '' : m === -1 ? '-' : Number.isInteger(m) ? String(m) : m > 0 ? '1/2 ' : '-1/2 ');
    const txt = (l: typeof l1) => `y ${l.above ? (l.strict ? '>' : '>=') : l.strict ? '<' : '<='} ${mText(l.m)}x${l.b ? ` ${signed(l.b)}` : ''}`;
    const second = special ? `y ${l2.above ? '>' : '<'} ${c}` : txt(l2);
    const shadeFor = (l: typeof l1, flipIt = false) => ({ f: (x: number) => l.m * x + l.b, side: (l.above !== flipIt ? 'above' : 'below') as 'above' | 'below' });
    const draw = (flip1: boolean, flip2: boolean) => {
      const curves = [{ f: (x: number) => l1.m * x + l1.b, dashed: l1.strict }];
      const shade = [shadeFor(l1, flip1)];
      if (special === 'y') { curves.push({ f: () => c, dashed: true }); shade.push({ f: () => c, side: (l2.above !== flip2 ? 'above' : 'below') }); }
      else { curves.push({ f: (x: number) => l2.m * x + l2.b, dashed: l2.strict }); shade.push(shadeFor(l2, flip2)); }
      return smallGraph({ curves, shade });
    };
    const sys = `cases(${txt(l1)}, ${second})`;
    return {
      body: `Sketch the solution to the system of inequalities ${math(sys)}.`,
      answer: draw(false, false),
      distractors: [draw(true, false), draw(false, true), draw(true, true)],
      solution: `Graph each boundary line (dashed for ${math('<')} or ${math('>')}, solid for ${math('<=')} or ${math('>=')}) and shade the side that satisfies each inequality. The solution is where the shadings overlap.`,
    };
  },
});

// ── Exponential growth and decay ─────────────────────────────────────────────

export const a1ExpGrowthDiscrete = us('a1-exp-growth-discrete', {
  points: 2,
  levels: { 1: 'Find the amount after t years', 2: 'Write the model', 3: 'Growth or decay, any question' },
  options: [radioOption('kind', 'Kind', [['growth', 'Growth'], ['decay', 'Decay'], ['either', 'Either']], ['growth', 'either', 'either'])],
  generate(rng, level, o) {
    const kindOpt = optOne(o, 'kind', 'either');
    const growth = kindOpt === 'either' ? rng.next() < 0.5 : kindOpt === 'growth';
    const ctx = growth
      ? rng.pick([{ what: 'The population of a town', start: rng.int(20, 90) * 100, unit: 'people', per: 'year' }, { what: 'An investment', start: rng.int(5, 50) * 100, unit: 'dollars', per: 'year' }, { what: 'A colony of bacteria', start: rng.int(2, 20) * 100, unit: 'bacteria', per: 'hour' }])
      : rng.pick([{ what: 'A car', start: rng.int(15, 45) * 1000, unit: 'dollars', per: 'year' }, { what: 'The number of fish in a lake', start: rng.int(5, 40) * 100, unit: 'fish', per: 'year' }, { what: 'A sample of a medicine in the body', start: rng.int(2, 10) * 100, unit: 'mg', per: 'hour' }]);
    const r = rng.pick(growth ? [2, 3, 4, 5, 6, 8, 10, 12] : [5, 8, 10, 12, 15, 20, 25]);
    const t = rng.int(3, 12);
    const factor = growth ? 1 + r / 100 : 1 - r / 100;
    const model = `y = ${ctx.start}(${decimal(factor)})^t`;
    if (level === 2) {
      return {
        body: `${ctx.what} starts at ${ctx.start} ${ctx.unit} and ${growth ? 'grows' : 'decreases'} by ${r}% each ${ctx.per}. Write a model for the amount ${math('y')} after ${math('t')} ${ctx.per}s.`,
        answer: math(model),
        distractors: wrong(math(model), [`y = ${ctx.start}(${decimal(growth ? 1 - r / 100 : 1 + r / 100)})^t`, `y = ${ctx.start}(${r})^t`, `y = ${ctx.start}(${decimal(r / 100)})^t`, `y = ${ctx.start} + ${r}t`].map(math)),
        solution: `Each ${ctx.per} the amount is multiplied by ${math(`1 ${growth ? '+' : '-'} ${decimal(r / 100)} = ${decimal(factor)}`)}: ${math(model)}.`,
      };
    }
    const value = ctx.start * factor ** t;
    const fmt = (v: number) => (ctx.unit === 'dollars' ? math(money(v)) : `${math(Number.isInteger(Math.round(v)) && ctx.unit !== 'mg' ? String(Math.round(v)) : fixed(v, 1))} ${ctx.unit}`);
    const answer = fmt(value);
    return {
      body: `${ctx.what} starts at ${ctx.start} ${ctx.unit} and ${growth ? 'grows' : 'decreases'} by ${r}% each ${ctx.per}. Find the amount after ${t} ${ctx.per}s.${ctx.unit === 'dollars' ? ' Round to the nearest cent.' : ' Round to the nearest whole number.'}`,
      answer,
      distractors: wrong(answer, [ctx.start * (growth ? 1 - r / 100 : 1 + r / 100) ** t, ctx.start * (1 + (growth ? 1 : -1) * (r / 100) * t), ctx.start * factor ** (t - 1), ctx.start * factor * t].map(fmt)),
      solution: `${math(`y = ${ctx.start}(${decimal(factor)})^${t} approx ${fixed(value, 2)}`)}.`,
    };
  },
});

// ── Factoring ────────────────────────────────────────────────────────────────

export const a1FactorSpecial = us('a1-factor-special', {
  levels: { 1: 'x² − b² and x² ± 2bx + b²', 2: 'a²x² − b² and (ax ± b)²', 3: 'Two variables, and a common factor first' },
  options: [manyOption('kinds', 'Cases', [['dos', 'Difference of squares'], ['pst', 'Perfect-square trinomials']], [['dos', 'pst'], ['dos', 'pst'], ['dos', 'pst']]), toggleOption('gcf', 'Include a common factor', [false, false, true])],
  generate(rng, level, o) {
    const kind = rng.pick(optList(o, 'kinds', ['dos', 'pst']));
    const v = rng.pick(['x', 'n', 'k', 'p', 'r', 'm', 'a', 'b']);
    const a = level === 1 ? 1 : rng.int(2, 7), b = rng.int(1, 9);
    const twoVars = level === 3 && rng.next() < 0.5;
    const g = optOn(o, 'gcf', false) ? rng.int(2, 5) : 1;
    const w = twoVars ? (v === 'y' ? 'x' : 'y') : '';
    const lin = (s: number) => `${a === 1 ? '' : a}${v} ${s > 0 ? '+' : '-'} ${b === 1 && w ? '' : b}${w}`;
    const gT = g === 1 ? '' : String(g);
    const sq = (c: number, name: string, pw = 2) => `${c === 1 ? '' : c}${name}^${pw}`;
    if (kind === 'dos') {
      const expr = `${sq(g * a * a, v)} - ${w ? sq(g * b * b, w) : g * b * b}`;
      const answer = `${gT}(${lin(1)})(${lin(-1)})`;
      return task('Factor each completely.', 'Factor completely:', expr, {
        answer: math(answer),
        distractors: wrong(math(answer), [`${gT}(${lin(-1)})^2`, `${gT}(${lin(1)})^2`, `${gT}(${a === 1 ? '' : a}${v} - ${b * b === 1 && w ? '' : b * b}${w})(${a === 1 ? '' : a}${v} + 1)`].map(math)),
        solution: `${g > 1 ? `Factor out ${g}, then use` : 'Use'} ${math('A^2 - B^2 = (A + B)(A - B)')} with ${math(`A = ${a === 1 ? '' : a}${v}`)} and ${math(`B = ${b === 1 && w ? '' : b}${w}`)}: ${math(answer)}.`,
      }, '');
    }
    const s = rng.sign();
    const mid = 2 * a * b * g;
    const expr = polynomial([{ coef: g * a * a, powers: [[v, 2]] }, { coef: s * mid, powers: w ? [[v, 1], [w, 1]] : [[v, 1]] }, { coef: g * b * b, powers: w ? [[w, 2]] : [] }]);
    const answer = `${gT}(${lin(s)})^2`;
    return task('Factor each completely.', 'Factor completely:', expr, {
      answer: math(answer),
      distractors: wrong(math(answer), [`${gT}(${lin(-s)})^2`, `${gT}(${lin(1)})(${lin(-1)})`, `${gT}(${a === 1 ? '' : a}${v} ${s > 0 ? '+' : '-'} ${b * b === 1 && w ? '' : b * b}${w})^2`].map(math)),
      solution: `${g > 1 ? `Factor out ${g}. ` : ''}The first and last terms are squares and the middle term is ${math(`2 dot ${a === 1 ? '' : a}${v} dot ${b === 1 && w ? '' : b}${w}`)}, so it is a perfect square: ${math(answer)}.`,
    }, '');
  },
});

export const a1FactorGrouping = us('a1-factor-grouping', {
  levels: { 1: 'Cubic polynomials', 2: 'Two variables', 3: 'Trinomials with the ac method' },
  options: [manyOption('kinds', 'Kinds', [['cubic', 'ax³ + bx² + cx + d'], ['two', 'Two variables'], ['ac', 'Trinomials by grouping (ac method)']], [['cubic'], ['two'], ['ac']])],
  generate(rng, _level, o) {
    const kind = rng.pick(optList(o, 'kinds', ['cubic']));
    const v = rng.pick(['x', 'n', 'k', 'p', 'r', 'm']);
    if (kind === 'cubic') {
      // (a v + b)(c v² + d)
      const a = rng.int(1, 5), b = rng.nonZero(-8, 8), c = rng.int(1, 6), d = rng.nonZero(-8, 8);
      if (gcd(a, b) > 1 || gcd(c, d) > 1) return a1FactorGrouping.generate(rng, 1, { kinds: 'cubic' });
      const expr = poly([a * c, b * c, a * d, b * d], v);
      const answer = `(${poly([c, 0, d], v)})(${poly([a, b], v)})`;
      return task('Factor each completely.', 'Factor completely:', expr, {
        answer: math(answer),
        distractors: wrong(math(answer), [`(${poly([c, 0, -d], v)})(${poly([a, b], v)})`, `(${poly([c, 0, d], v)})(${poly([a, -b], v)})`, `(${poly([c, d], v)})(${poly([a, 0, b], v)})`].map(math)),
        solution: `Group the first two terms and the last two: ${math(`${poly([a * c, b * c, 0, 0], v).replace(/ \+ 0$/, '')}`)} has the factor ${math(`${c === 1 ? '' : c}${v}^2`)} and the rest has the factor ${math(String(d))}. The common binomial is ${math(`(${poly([a, b], v)})`)}: ${math(answer)}.`,
      }, '');
    }
    if (kind === 'two') {
      const w = v === 'm' ? 'n' : 'm';
      const a = rng.int(1, 6), b = rng.nonZero(-7, 7), c = rng.int(1, 6), d = rng.nonZero(-7, 7);
      if (gcd(a, b) > 1 || gcd(c, d) > 1) return a1FactorGrouping.generate(rng, 2, { kinds: 'two' });
      const expr = polynomial([{ coef: a * c, powers: [[v, 1], [w, 1]] }, { coef: a * d, powers: [[v, 1]] }, { coef: b * c, powers: [[w, 1]] }, { coef: b * d }]);
      const answer = `(${poly([a, b], v)})(${poly([c, d], w)})`;
      return task('Factor each completely.', 'Factor completely:', expr, {
        answer: math(answer),
        distractors: wrong(math(answer), [`(${poly([a, -b], v)})(${poly([c, d], w)})`, `(${poly([a, d], v)})(${poly([c, b], w)})`, `(${poly([a, b], v)})(${poly([c, -d], w)})`].map(math)),
        solution: `Group in pairs and factor each pair; the common binomial factor gives ${math(answer)}.`,
      }, '');
    }
    const p = rng.int(1, 5), q = rng.nonZero(-7, 7), r = rng.int(2, 5), s = rng.nonZero(-7, 7);
    if (gcd(p, q) > 1 || gcd(r, s) > 1 || p * s + q * r === 0) return a1FactorGrouping.generate(rng, 3, { kinds: 'ac' });
    const A = p * r, B = p * s + q * r, C = q * s;
    const answer = `(${poly([p, q], v)})(${poly([r, s], v)})`;
    return task('Factor each completely.', 'Factor completely:', poly([A, B, C], v), {
      answer: math(answer),
      distractors: wrong(math(answer), [`(${poly([p, -q], v)})(${poly([r, -s], v)})`, `(${poly([p, s], v)})(${poly([r, q], v)})`, `(${poly([r, q], v)})(${poly([p, -s], v)})`].map(math)),
      solution: `Find two numbers with product ${math(`a c = ${A * C}`)} and sum ${math(String(B))}: ${math(String(p * s))} and ${math(String(q * r))}. Split the middle term and group: ${math(answer)}.`,
    }, '');
  },
});

export const a1CompleteSquareConstant = us('a1-complete-square-constant', {
  levels: { 1: 'Even b', 2: 'Odd b (fractions)', 3: 'Fractional b' },
  options: [radioOption('b', 'Coefficient of x', [['even', 'Even'], ['odd', 'Odd'], ['fraction', 'Fraction']], ['even', 'odd', 'fraction']), toggleOption('factor', 'Also write the factored form', [true, true, true])],
  generate(rng, level, o) {
    const kind = optOne(o, 'b', ['even', 'odd', 'fraction'][level - 1]);
    const v = rng.pick(['x', 'n', 'k', 'p', 'r', 'm', 'a', 'b']);
    const b = kind === 'even' ? new Q(2 * rng.nonZero(-9, 9)) : kind === 'odd' ? new Q(2 * rng.int(-9, 9) + 1) : new Q(2 * rng.nonZero(-9, 9), rng.pick([3, 5, 7]));
    const half = b.div(2), c = half.mul(half);
    const expr = `${v}^2 ${b.sign < 0 ? '-' : '+'} ${b.isInt ? (b.abs().eq(1) ? '' : b.abs().typst()) : b.abs().typst() + ' '}${v} + c`;
    const factored = `(${v} ${half.sign < 0 ? '-' : '+'} ${half.abs().typst()})^2`;
    const both = optOn(o, 'factor', true);
    const answer = both ? `c = ${c.typst()}; ${factored}` : `c = ${c.typst()}`;
    const alt = (cc: Q, f: string) => (both ? `c = ${cc.typst()}; ${f}` : `c = ${cc.typst()}`);
    return task('Find the value of c that completes the square.', 'Find c so that this is a perfect square:', expr, {
      answer: math(answer),
      distractors: wrong(math(answer), [alt(half, factored), alt(b.mul(b), `(${v} ${b.sign < 0 ? '-' : '+'} ${b.abs().typst()})^2`), alt(c.mul(2), factored), alt(c, `(${v} ${half.sign < 0 ? '+' : '-'} ${half.abs().typst()})^2`)].map(math)),
      solution: `Take half of ${math(b.typst())} and square it: ${math(`(${b.paren()}/2)^2 = ${c.typst()}`)}${both ? `, so the trinomial is ${math(factored)}` : ''}.`,
    }, '');
  },
});

export const ALGEBRA_1 = [
  a1Mixture, a1DistanceRateTime, a1Work, a1Literal, a1CompoundIneq, a1AbsIneq, a1EvaluateFunctions, a1GraphAbs,
  a1Variation, a1InequalitySystems, a1ExpGrowthDiscrete, a1FactorSpecial, a1FactorGrouping, a1CompleteSquareConstant,
];
