import type { Rng } from '../../rng.ts';
import { gcd, poly, sub } from '../../format.ts';
import { Q } from '../../exact.ts';
import { graphTypst, type Pt } from '../../graph.ts';
import { math, mb10i } from '../pc40s/common.ts';
import { dec, distinct, others, pt } from './shared.ts';
import { optNum, optOn, optOne, radioOption, sizeOption, toggleOption } from '../../options.ts';

const grid = (curves: Parameters<typeof graphTypst>[0]['curves'], size = 3.4, extra: Partial<Parameters<typeof graphTypst>[0]> = {}) =>
  graphTypst({ xMin: -8, xMax: 8, yMin: -8, yMax: 8, xLabelStep: 2, yLabelStep: 2, width: size, height: size, curves, ...extra });
const line = (m: number, b: number, size = 3.4) => grid([{ f: (x) => m * x + b }], size);
const vline = (x0: number, size = 3.4) => grid([{ points: [[x0, -8], [x0, 8]] }], size);
/** y = mx + b as Typst math, with fractional slopes: `y = 3/4 x - 2`. */
function yEquals(m: Q, b: Q): string {
  const mx = m.n === 0 ? '' : m.coef('x');
  if (!mx) return `y = ${b.typst()}`;
  return `y = ${mx}${b.n === 0 ? '' : ` ${b.sign < 0 ? '-' : '+'} ${b.abs().typst()}`}`;
}

// ── Graphs and contexts ───────────────────────────────────────────────────

type Seg = 'away' | 'stop' | 'back' | 'fast';
const SEG_TEXT: Record<Seg, string> = { away: 'walks away from home at a steady pace', stop: 'stops for a while', back: 'walks back toward home', fast: 'jogs away from home, faster than before' };
/** A distance–time graph for a sequence of segments, each 3 time units long. */
function storyGraph(segs: Seg[], size: number): string {
  const pts: Pt[] = [[0, 0]];
  let d = 0;
  for (const s of segs) {
    d = s === 'away' ? d + 2 : s === 'fast' ? d + 4 : s === 'back' ? Math.max(0, d - 3) : d;
    pts.push([pts.length * 3, d]);
  }
  const T = segs.length * 3;
  return graphTypst({
    xMin: 0, xMax: T, yMin: 0, yMax: 9, width: size, height: size * 0.75, numbers: false,
    curves: [{ points: pts }],
    labels: [{ x: T - 1.2, y: -1, text: '"time"' }, { x: 1.8, y: 8.2, text: '"distance"' }],
  });
}
function storySegs(rng: Rng, n: number): Seg[] {
  for (;;) {
    const segs: Seg[] = ['away'];
    for (let i = 1; i < n; i++) segs.push(rng.pick(n === 2 ? ['stop', 'back'] as Seg[] : ['stop', 'back', 'fast', 'away'] as Seg[]));
    if (new Set(segs).size === segs.length) return segs;
  }
}
const storyText = (segs: Seg[]) => `A student ${segs.map((s) => SEG_TEXT[s]).join(', then ')}.`;
/** Other people who travel from home, for stories whose answer is a graph (the description stays the same shape). */
const MOVERS: Array<{ who: string; whose: string; text: Record<Seg, string> }> = [
  { who: 'A student', whose: "the student's", text: SEG_TEXT },
  { who: 'A cyclist', whose: "the cyclist's", text: { away: 'rides away from home at a steady pace', stop: 'stops for a while', back: 'rides back toward home', fast: 'rides away from home, faster than before' } },
  { who: 'A dog walker', whose: "the dog walker's", text: { away: 'walks away from home at a steady pace', stop: 'stops at a park for a while', back: 'walks back toward home', fast: 'jogs away from home with the dog, faster than before' } },
  { who: 'A family', whose: "the family's", text: { away: 'drives away from home at a steady speed', stop: 'stops for lunch', back: 'drives back toward home', fast: 'drives away from home on the highway, faster than before' } },
  { who: 'A skier', whose: "the skier's", text: { away: 'skis away from the cabin at a steady pace', stop: 'rests for a while', back: 'skis back toward the cabin', fast: 'skis downhill away from the cabin, faster than before' } },
];
function storyVariants(segs: Seg[]): Seg[][] {
  const swap = (s: Seg): Seg => ({ away: 'back', back: 'stop', stop: 'fast', fast: 'stop' } as const)[s];
  return [segs.map((s, i) => (i === segs.length - 1 ? swap(s) : s)), segs.map((s, i) => (i === 1 ? swap(s) : s)), [...segs].reverse().map((s, i) => (i === 0 ? 'away' : s)), segs.map((s) => (s === 'stop' ? 'away' : s === 'away' ? 'stop' : s))];
}

export const relMatchContext = mb10i('10i-rel-match-context', {
  levels: { 1: 'Two parts', 2: 'Three parts', 3: 'Three parts with changes in speed' },
  options: [
    radioOption('form', 'Story', [['1', 'Two parts'], ['2', 'Three parts'], ['3', 'Three parts with changes in speed']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const segs = difficulty === 3 ? (['away', 'fast', rng.pick(['stop', 'back'])] as Seg[]) : storySegs(rng, difficulty + 1);
    const key = (s: Seg[]) => s.join();
    const variants = storyVariants(segs).filter((v, i, all) => key(v) !== key(segs) && all.findIndex((w) => key(w) === key(v)) === i);
    return {
      body: (({ who, whose, text }) => `${who} ${segs.map((s) => text[s]).join(', then ')}. Which graph shows ${whose} distance from ${who === 'A skier' ? 'the cabin' : 'home'} over time?`)(rng.pick(MOVERS)),
      answer: storyGraph(segs, 3.4),
      distractors: variants.slice(0, 3).map((v) => storyGraph(v, 3.4)),
      solution: `Rising segments show moving away (steeper is faster), flat segments show stopping, and falling segments show returning. Here: ${segs.map((s) => (s === 'stop' ? 'flat' : s === 'back' ? 'falling' : s === 'fast' ? 'rising steeply' : 'rising')).join(', then ')}.`,
    };
  },
});

export const relDescribeGraph = mb10i('10i-rel-describe-graph', {
  levels: { 1: 'Two parts', 2: 'Three parts', 3: 'Three parts with changes in speed' },
  options: [
    radioOption('form', 'Graph', [['1', 'Two parts'], ['2', 'Three parts'], ['3', 'Three parts with changes in speed']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const segs = difficulty === 3 ? (['away', 'fast', rng.pick(['stop', 'back'])] as Seg[]) : storySegs(rng, difficulty + 1);
    const key = (s: Seg[]) => s.join();
    const variants = storyVariants(segs).filter((v, i, all) => key(v) !== key(segs) && all.findIndex((w) => key(w) === key(v)) === i);
    return {
      body: `The graph shows a student's distance from home over time. Which description matches it?\n\n${storyGraph(segs, 4.5)}`,
      answer: storyText(segs),
      distractors: distinct(storyText(segs), variants.map(storyText)),
      solution: `Read each segment: ${segs.map((s) => (s === 'stop' ? 'flat (stopped)' : s === 'back' ? 'falling (returning)' : s === 'fast' ? 'steeper rising (faster)' : 'rising (moving away)')).join(', then ')}.`,
    };
  },
});

const DISCRETE: Array<[string, boolean, string]> = [
  ['the number of concert tickets sold and the money collected', true, 'tickets are counted in whole numbers'],
  ['the number of students on a bus and the number of empty seats', true, 'people are counted in whole numbers'],
  ['the number of pizzas ordered and the total cost', true, 'pizzas are ordered in whole numbers'],
  ['the number of songs downloaded and the storage used', true, 'songs are counted in whole numbers'],
  ['the time a candle burns and its height', false, 'time and height can take any value in an interval'],
  ['the distance driven and the fuel used', false, 'distance and fuel can take any value in an interval'],
  ['the time since a bath started draining and the water left', false, 'time and volume can take any value in an interval'],
  ['the temperature of a cup of tea over time', false, 'time and temperature change continuously'],
];

export const relDiscrete = mb10i('10i-rel-discrete', {
  points: 1,
  levels: { 1: 'Connect the points or not?', 2: 'Choose the reason', 3: 'Choose the domain' },
  options: [
    radioOption('form', 'Question', [['1', 'Connect the points or not?'], ['2', 'Choose the reason'], ['3', 'Choose the domain']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const [ctx, discrete, why] = rng.pick(DISCRETE);
    if (difficulty === 1) {
      const answer = discrete ? 'No: the data are discrete' : 'Yes: the data are continuous';
      return {
        body: `A graph shows ${ctx}. Should the points be connected with a line?`,
        answer,
        distractors: ['No: the data are discrete', 'Yes: the data are continuous', 'Yes: the data are discrete', 'No: the data are continuous'].filter((d) => d !== answer),
        solution: `The points ${discrete ? 'should not' : 'should'} be connected because ${why}.`,
      };
    }
    if (difficulty === 2) {
      const reasons = DISCRETE.filter(([, d]) => d !== discrete).map(([, , w]) => w);
      return {
        body: `A graph shows ${ctx}. Why ${discrete ? 'should the points not be connected' : 'should the points be connected'}?`,
        answer: `Because ${why}.`,
        distractors: [...new Set(reasons)].slice(0, 2).map((r) => `Because ${r}.`).concat(['Because the relation is linear.']),
        solution: `${why[0].toUpperCase()}${why.slice(1)}, so the data are ${discrete ? 'discrete' : 'continuous'}.`,
      };
    }
    const max = rng.int(20, 60);
    const answer = discrete ? `{0, 1, 2, ..., ${max}}` : `{x | 0 <= x <= ${max}, x in RR}`;
    return {
      body: `A relation shows ${ctx}, with the first quantity at most ${max}. Which domain fits?`,
      answer: math(answer),
      distractors: [discrete ? `{x | 0 <= x <= ${max}, x in RR}` : `{0, 1, 2, ..., ${max}}`, `{x | x in RR}`, `{1, 2, 3, ..., ${max - 1}}`].map(math),
      solution: `${why[0].toUpperCase()}${why.slice(1)}, so the domain is ${math(answer)}.`,
    };
  },
});

export const relContextDomain = mb10i('10i-rel-context-domain', {
  levels: { 1: 'Domain of a context', 2: 'Range of a context', 3: 'Discrete domain and range' },
  options: [
    radioOption('form', 'Ask for', [['1', 'Domain of a context'], ['2', 'Range of a context'], ['3', 'Discrete domain and range']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const rate = rng.pick([25, 40, 50, 80]), tank = rate * rng.int(10, 40);
    const tEnd = tank / rate;
    if (difficulty === 1) {
      return {
        body: `A ${tank} L ${rng.pick(['tank', 'hot tub', 'water trough', 'storage tank', 'wading pool'])} drains at ${rate} L/min until empty. The volume is ${math(`V = ${tank} - ${rate}t`)}. What is the domain?`,
        answer: math(`{t | 0 <= t <= ${tEnd}, t in RR}`),
        distractors: [`{t | 0 <= t <= ${tank}, t in RR}`, `{t | t >= 0, t in RR}`, `{t | t in RR}`].map(math),
        solution: `Time starts at 0 and the tank is empty when ${math(`${tank} - ${rate}t = 0`)}, at ${math(`t = ${tEnd}`)} minutes. Domain: ${math(`0 <= t <= ${tEnd}`)}.`,
      };
    }
    if (difficulty === 2) {
      const base = rng.pick([3.5, 4, 5.25]), perKm = rng.pick([1.5, 2, 2.25]), maxKm = rng.int(20, 50);
      const top = base + perKm * maxKm;
      return {
        body: `${rng.pick(['A taxi', 'A ride-share company', 'A courier', 'A shuttle service'])} charges \\$${base.toFixed(2)} plus \\$${perKm.toFixed(2)} per kilometre, for trips up to ${maxKm} km. What is the range of the cost ${math('C')}?`,
        answer: math(`{C | ${dec(base)} <= C <= ${dec(top)}, C in RR}`),
        distractors: [`{C | 0 <= C <= ${dec(top)}, C in RR}`, `{C | 0 <= C <= ${maxKm}, C in RR}`, `{C | C >= ${dec(base)}, C in RR}`].map(math),
        solution: `The smallest cost (0 km) is \\$${base.toFixed(2)} and the largest (${maxKm} km) is ${math(`${dec(base)} + ${dec(perKm)}(${maxKm}) = ${dec(top)}`)}.`,
      };
    }
    const price = rng.pick([3, 4, 5, 12]), seats = rng.int(10, 40);
    return {
      body: `${rng.pick([`Tickets cost \\$${price} each, and a bus holds ${seats} riders.`, `A museum tour costs \\$${price} per person, and a tour group holds up to ${seats} people.`, `A boat tour costs \\$${price} per rider, and the boat holds ${seats} riders.`, `A workshop costs \\$${price} per student, and the room holds ${seats} students.`])} The revenue is ${math(`R = ${price}n`)}. What are the domain and range?`,
      answer: math(`D: {0, 1, 2, ..., ${seats}}; R: {0, ${price}, ${2 * price}, ..., ${price * seats}}`),
      distractors: [`D: {n | 0 <= n <= ${seats}, n in RR}; R: {R | 0 <= R <= ${price * seats}, R in RR}`, `D: {0, 1, 2, ..., ${price * seats}}; R: {0, 1, 2, ..., ${seats}}`, `D: {1, 2, ..., ${seats}}; R: {${price}, ${2 * price}, ..., ${price * (seats + 1)}}`].map(math),
      solution: `Riders are whole numbers from 0 to ${seats}, so the domain and range are discrete: the range lists each multiple of ${price} up to ${price * seats}.`,
    };
  },
});

// ── Relations and functions ───────────────────────────────────────────────

function pairSet(rng: Rng, fn: boolean, n = 4): Array<[number, number]> {
  for (;;) {
    const xs = rng.shuffle([-3, -2, -1, 0, 1, 2, 3, 4, 5]).slice(0, n);
    const pairs: Array<[number, number]> = xs.map((x) => [x, rng.int(-5, 5)]);
    if (!fn) pairs[n - 1] = [pairs[rng.int(0, n - 2)][0], rng.int(-5, 5)];
    if (!fn && pairs.filter(([x]) => x === pairs[n - 1][0]).some(([, y], i, all) => all.findIndex(([, z]) => z === y) !== i)) continue;
    return pairs;
  }
}
const setText = (pairs: Array<[number, number]>) => `{${pairs.map(([x, y]) => pt(x, y)).join(', ')}}`;

export const fnOrderedPairs = mb10i('10i-fn-ordered-pairs', {
  points: 1,
  levels: { 1: 'Is the set a function?', 2: 'Which set is a function?', 3: 'Which set is not a function?' },
  options: [
    radioOption('form', 'Question', [['1', 'Is the set a function?'], ['2', 'Which set is a function?'], ['3', 'Which set is not a function?']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    if (difficulty === 1) {
      const fn = rng.next() < 0.5, pairs = pairSet(rng, fn);
      const repeat = fn ? null : pairs[3][0];
      const answer = fn ? 'Yes: each x-value has exactly one y-value' : `No: ${math(`x = ${repeat}`)} has two y-values`;
      return {
        body: `Is ${math(setText(pairs))} a function?`,
        answer,
        distractors: distinct(answer, ['Yes: each x-value has exactly one y-value', `No: ${math(`x = ${pairs[0][0]}`)} has two y-values`, 'No: two points share a y-value', 'Yes: it has four points']),
        solution: fn ? 'No x-value repeats, so each input has one output: it is a function.' : `The x-value ${repeat} appears with two different y-values, so it is not a function.`,
      };
    }
    const wantFn = difficulty === 2;
    const answer = setText(pairSet(rng, wantFn));
    return {
      body: `Which set of ordered pairs ${wantFn ? 'is' : 'is not'} a function?`,
      answer: math(answer),
      distractors: [0, 1, 2].map(() => math(setText(pairSet(rng, !wantFn)))),
      solution: `A function has no x-value paired with two different y-values. ${math(answer)} ${wantFn ? 'has no repeated x-values' : 'repeats an x-value with a different y-value'}.`,
    };
  },
});

type Shape = 'line' | 'parabola' | 'abs' | 'cubic' | 'circle' | 'sideways' | 'vertical' | 'sidewaysAbs';
function shapeGraph(shape: Shape, size: number): string {
  switch (shape) {
    case 'line': return grid([{ f: (x) => 0.5 * x + 1 }], size);
    case 'parabola': return grid([{ f: (x) => 0.3 * x * x - 4 }], size);
    case 'abs': return grid([{ f: (x) => Math.abs(x) - 3 }], size);
    case 'cubic': return grid([{ f: (x) => 0.05 * x ** 3 - x }], size);
    case 'circle': return grid([{ points: Array.from({ length: 73 }, (_, i) => [5 * Math.cos((i * Math.PI) / 36), 5 * Math.sin((i * Math.PI) / 36)] as Pt) }], size);
    case 'sideways': return grid([{ points: Array.from({ length: 61 }, (_, i) => { const y = -8 + (16 * i) / 60; return [0.3 * y * y - 4, y] as Pt; }) }], size);
    case 'vertical': return vline(3, size);
    case 'sidewaysAbs': return grid([{ points: [[5, 8], [-3, 0], [5, -8]] }], size);
  }
}
const FUNCTIONS: Shape[] = ['line', 'parabola', 'abs', 'cubic'];
const NOT_FUNCTIONS: Shape[] = ['circle', 'sideways', 'vertical', 'sidewaysAbs'];

export const fnVerticalLine = mb10i('10i-fn-vertical-line', {
  points: 1,
  levels: { 1: 'Is the graph a function?', 2: 'Which graph is a function?', 3: 'Which graph is not a function?' },
  options: [
    radioOption('form', 'Question', [['1', 'Is the graph a function?'], ['2', 'Which graph is a function?'], ['3', 'Which graph is not a function?']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    if (difficulty === 1) {
      const fn = rng.next() < 0.5, shape = rng.pick(fn ? FUNCTIONS : NOT_FUNCTIONS);
      const answer = fn ? 'Yes: every vertical line meets the graph at most once' : 'No: a vertical line meets the graph more than once';
      return {
        body: `Does the graph represent a function?\n\n${shapeGraph(shape, 4.2)}`,
        answer,
        distractors: ['Yes: every vertical line meets the graph at most once', 'No: a vertical line meets the graph more than once', 'No: a horizontal line meets the graph more than once', 'Yes: it passes through the origin'].filter((d) => d !== answer),
        solution: `Use the vertical line test. ${fn ? 'No vertical line crosses the graph twice' : 'Some vertical line crosses the graph at two or more points'}, so it ${fn ? 'is' : 'is not'} a function.`,
      };
    }
    const wantFn = difficulty === 2;
    const [a, ...rest] = rng.shuffle(wantFn ? FUNCTIONS : NOT_FUNCTIONS);
    void rest;
    return {
      body: `Which graph ${wantFn ? 'represents' : 'does not represent'} a function?`,
      answer: shapeGraph(a, 3.4),
      distractors: rng.shuffle(wantFn ? NOT_FUNCTIONS : FUNCTIONS).slice(0, 3).map((s) => shapeGraph(s, 3.4)),
      solution: `Use the vertical line test: a graph is a function when no vertical line meets it more than once.`,
    };
  },
});

const listSet = (vals: number[]) => `{${[...new Set(vals)].sort((a, b) => a - b).join(', ')}}`;

export const fnDomainRangeSet = mb10i('10i-fn-domain-range-set', {
  points: 1,
  levels: { 1: 'Domain of a set of pairs', 2: 'Range of a set of pairs', 3: 'Range with repeated values' },
  options: [
    radioOption('form', 'Ask for', [['1', 'Domain of a set of pairs'], ['2', 'Range of a set of pairs'], ['3', 'Range with repeated values']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const pairs = pairSet(rng, true, 5);
    if (difficulty === 3) pairs[4][1] = pairs[0][1];
    const xs = pairs.map(([x]) => x), ys = pairs.map(([, y]) => y);
    const wantDomain = difficulty === 1;
    const answer = listSet(wantDomain ? xs : ys);
    return {
      body: `State the ${wantDomain ? 'domain' : 'range'} of ${math(setText(pairs))}.`,
      answer: math(answer),
      distractors: distinct(math(answer), [listSet(wantDomain ? ys : xs), listSet([...(wantDomain ? xs : ys), (wantDomain ? ys : xs)[0]]), listSet([...xs, ...ys]), listSet((wantDomain ? xs : ys).slice(1))].map(math)),
      solution: `The ${wantDomain ? 'domain is the set of first' : 'range is the set of second'} coordinates, each listed once: ${math(answer)}.`,
    };
  },
});

export const fnDomainRangeGraph = mb10i('10i-fn-domain-range-graph', {
  levels: { 1: 'A segment with closed ends', 2: 'Open and closed ends', 3: 'Rays and parabolas' },
  options: [
    radioOption('form', 'Graph', [['1', 'A segment with closed ends'], ['2', 'Open and closed ends'], ['3', 'Rays and parabolas']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const wantDomain = rng.next() < 0.5;
    if (difficulty === 3 && rng.next() < 0.5) {
      const h = rng.int(-3, 3), k = rng.int(-6, 2), up = rng.next() < 0.5;
      const f = (x: number) => (up ? 1 : -1) * 0.5 * (x - h) ** 2 + k;
      const answer = wantDomain ? '{x | x in RR}' : `{y | y ${up ? '>=' : '<='} ${k}, y in RR}`;
      return {
        body: `State the ${wantDomain ? 'domain' : 'range'} of the parabola.\n\n${grid([{ f }], 4.5, { dots: [{ x: h, y: k }] })}`,
        answer: math(answer),
        distractors: distinct(math(answer), [wantDomain ? `{x | x >= ${h}, x in RR}` : `{y | y ${up ? '<=' : '>='} ${k}, y in RR}`, wantDomain ? `{x | x >= ${k}, x in RR}` : '{y | y in RR}', `{y | y ${up ? '>=' : '<='} ${h}, y in RR}`, wantDomain ? '{y | y in RR}' : `{x | x ${up ? '>=' : '<='} ${k}, x in RR}`].map(math)),
        solution: `The parabola extends forever left and right, so the domain is all real numbers. Its ${up ? 'minimum' : 'maximum'} is at the vertex ${math(pt(h, k))}, so ${math(`y ${up ? '>=' : '<='} ${k}`)}.`,
      };
    }
    const x1 = rng.int(-7, -1), x2 = rng.int(1, 7), y1 = rng.int(-7, 7), y2 = rng.int(-7, 7);
    if (y1 === y2) return fnDomainRangeGraph.generate(rng, difficulty, o);
    const open1 = difficulty >= 2 && rng.next() < 0.5, open2 = difficulty >= 2 && !open1 && rng.next() < 0.6;
    const ray = difficulty === 3;
    const end: Pt = ray ? [8, y2 + ((y2 - y1) / (x2 - x1)) * (8 - x2)] : [x2, y2];
    const graph = grid([{ points: [[x1, y1], end] }], 4.5, { dots: [{ x: x1, y: y1, open: open1 }, ...(ray ? [] : [{ x: x2, y: y2, open: open2 }])] });
    const lo = (open: boolean) => (open ? '<' : '<=');
    const [ya, yb, oa, ob] = y1 < y2 ? [y1, y2, open1, open2] : [y2, y1, open2, open1];
    const answer = wantDomain
      ? ray ? `{x | x ${open1 ? '>' : '>='} ${x1}, x in RR}` : `{x | ${x1} ${lo(open1)} x ${lo(open2)} ${x2}, x in RR}`
      : ray ? `{y | y ${(y2 > y1) ? (open1 ? '>' : '>=') : (open1 ? '<' : '<=')} ${y1}, y in RR}` : `{y | ${ya} ${lo(oa)} y ${lo(ob)} ${yb}, y in RR}`;
    return {
      body: `State the ${wantDomain ? 'domain' : 'range'} of the graph.\n\n${graph}`,
      answer: math(answer),
      distractors: distinct(math(answer), [
        wantDomain ? `{x | ${ya} <= x <= ${yb}, x in RR}` : `{y | ${x1} <= y <= ${x2}, y in RR}`,
        wantDomain ? `{x | ${x1} < x < ${x2}, x in RR}` : `{y | ${ya} < y < ${yb}, y in RR}`,
        wantDomain ? `{x | ${x1} <= x <= ${x2}, x in RR}` : `{y | ${ya} <= y <= ${yb}, y in RR}`,
        wantDomain ? '{x | x in RR}' : '{y | y in RR}',
      ].map(math)),
      solution: `${wantDomain ? 'Read the x-values the graph covers' : 'Read the y-values the graph covers'}; an open dot is not included and an arrow continues forever. ${math(answer)}.`,
    };
  },
});

// ── Slope ─────────────────────────────────────────────────────────────────

function slopeValue(rng: Rng, fractional: boolean): Q {
  if (!fractional) return new Q(rng.nonZero(-4, 4));
  for (;;) { const q = new Q(rng.nonZero(-4, 4), rng.int(2, 4)); if (!q.isInt) return q; }
}
/** A lattice point (x0, y0) so the line through it with slope m stays visible. */
function anchor(rng: Rng, m: Q): Pt {
  for (;;) {
    const x0 = rng.int(-4, 1), y0 = rng.int(-4, 4);
    const x1 = x0 + m.d, y1 = y0 + m.n;
    if (Math.abs(x1) <= 7 && Math.abs(y1) <= 7) return [x0, y0];
  }
}

export const slopeGraph = mb10i('10i-slope-graph', {
  points: 1,
  levels: { 1: 'Integer slopes', 2: 'Fractional slopes', 3: 'Including zero and undefined' },
  options: [
    radioOption('form', 'Slopes', [['1', 'Integer slopes'], ['2', 'Fractional slopes'], ['3', 'Including zero and undefined']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const special = difficulty === 3 ? rng.pick(['zero', 'undefined', 'none', 'none'] as const) : 'none';
    if (special !== 'none') {
      const c = rng.int(-6, 6);
      const graph = special === 'zero' ? grid([{ f: () => c }], 4.2) : vline(c, 4.2);
      const answer = special === 'zero' ? '0' : 'undefined';
      return {
        body: `Find the slope of the line.\n\n${graph}`,
        answer: special === 'zero' ? math('0') : 'undefined',
        distractors: special === 'zero' ? ['undefined', math(String(c || 1)), math('1')] : [math('0'), math(String(c || 1)), math('1')],
        solution: special === 'zero' ? `A horizontal line has a rise of 0, so its slope is 0.` : `A vertical line has a run of 0; division by 0 is undefined, so the slope is ${answer}.`,
      };
    }
    const m = slopeValue(rng, difficulty > 1);
    const [x0, y0] = anchor(rng, m);
    const b = y0 - m.value * x0;
    const graph = grid([{ f: (x) => m.value * x + b }], 4.2, { dots: [{ x: x0, y: y0 }, { x: x0 + m.d, y: y0 + m.n }] });
    return {
      body: `Find the slope of the line.\n\n${graph}`,
      answer: math(m.typst()),
      distractors: distinct(math(m.typst()), [new Q(m.d, m.n).typst(), m.neg().typst(), new Q(-m.d, m.n).typst(), m.add(1).typst()].map(math)),
      solution: `Between the marked points the rise is ${m.n} and the run is ${m.d}: ${math(`m = "rise"/"run" = ${m.n}/${m.d}${m.isInt && m.d !== 1 ? ` = ${m.typst()}` : ''}`).replace(`${m.n}/1`, String(m.n))}.`,
    };
  },
});

export const slopeClassify = mb10i('10i-slope-classify', {
  points: 1,
  levels: { 1: 'Positive, negative, zero, or undefined', 2: 'Which line has a negative slope?', 3: 'Which line is steeper?' },
  options: [
    radioOption('form', 'Question', [['1', 'Positive, negative, zero, or undefined'], ['2', 'Which line has a negative slope?'], ['3', 'Which line is steeper?']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const kinds = ['positive', 'negative', 'zero', 'undefined'] as const;
    const draw = (k: typeof kinds[number], size: number) => (k === 'positive' ? line(rng.pick([0.5, 1, 2, 3]), rng.int(-3, 3), size) : k === 'negative' ? line(-rng.pick([0.5, 1, 2, 3]), rng.int(-3, 3), size) : k === 'zero' ? (() => { const c = rng.int(-5, 5); return grid([{ f: () => c }], size); })() : vline(rng.nonZero(-5, 5), size));
    if (difficulty === 1) {
      const k = rng.pick(kinds);
      return {
        body: `Is the slope of the line positive, negative, zero, or undefined?\n\n${draw(k, 4)}`,
        answer: k[0].toUpperCase() + k.slice(1),
        distractors: kinds.filter((x) => x !== k).map((x) => x[0].toUpperCase() + x.slice(1)),
        solution: `Reading left to right: rising lines have positive slope, falling lines negative, horizontal lines zero, and vertical lines undefined slope. This line's slope is ${k}.`,
      };
    }
    if (difficulty === 2) {
      return {
        body: 'Which line has a negative slope?',
        answer: draw('negative', 3.4),
        distractors: (['positive', 'zero', 'undefined'] as const).map((k) => draw(k, 3.4)),
        solution: 'A line with a negative slope falls from left to right.',
      };
    }
    const m1 = rng.pick([0.5, 1, 2, 3, 4]) * rng.sign();
    let m2 = rng.pick([0.5, 1, 2, 3, 4]) * rng.sign();
    while (Math.abs(m2) === Math.abs(m1)) m2 = rng.pick([0.5, 1, 2, 3, 4]) * rng.sign();
    const graph = grid([{ f: (x) => m1 * x + 1 }, { f: (x) => m2 * x - 1, dashed: true }], 4.5);
    const steeper = Math.abs(m1) > Math.abs(m2) ? 'The solid line' : 'The dashed line';
    return {
      body: `Which line is steeper?\n\n${graph}`,
      answer: steeper,
      distractors: [steeper === 'The solid line' ? 'The dashed line' : 'The solid line', 'They are equally steep', 'The one with the greater y-intercept'],
      solution: `Steepness depends on the size of the slope. The slopes are ${math(dec(m1))} (solid) and ${math(dec(m2))} (dashed); ${math(`abs(${dec(Math.abs(m1) > Math.abs(m2) ? m1 : m2)})`)} is larger.`,
    };
  },
});

export const slopeRate = mb10i('10i-slope-rate', {
  levels: { 1: 'Rate from two data points', 2: 'Meaning of the slope', 3: 'Negative rates' },
  options: [
    radioOption('form', 'Context', [['1', 'Rate from two data points'], ['2', 'Meaning of the slope'], ['3', 'Negative rates']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    if (difficulty === 3) {
      const rate = rng.pick([15, 20, 25, 40, 50]), t1 = rng.int(1, 4), t2 = t1 + rng.int(2, 6), v1 = rate * rng.int(20, 40);
      const v2 = v1 - rate * (t2 - t1);
      return {
        body: `${rng.pick(['A pool', 'A storage tank', 'A hot tub', 'A water tower'])} drains. After ${t1} min it holds ${v1} L, and after ${t2} min it holds ${v2} L. Find the rate of change of the volume.`,
        answer: `${-rate} L/min`,
        distractors: [`${rate} L/min`, `${dec(v2 / t2, 1)} L/min`, `${dec((t2 - t1) / (v1 - v2), 3)} L/min`],
        solution: `${math(`m = (${v2} - ${v1})/(${t2} - ${t1}) = ${v2 - v1}/${t2 - t1} = ${-rate}`)}: the volume drops ${rate} L each minute.`,
      };
    }
    const speed = rng.pick([60, 75, 80, 90, 100]), t1 = rng.int(1, 3), t2 = t1 + rng.int(1, 4), d1 = speed * t1 + rng.int(0, 1) * 20;
    const d2 = d1 + speed * (t2 - t1);
    if (difficulty === 1) {
      return {
        body: `${rng.pick(['A car', 'A bus', 'A train', 'A truck', 'A motorcycle'])} has gone ${d1} km after ${t1} h and ${d2} km after ${t2} h, at a steady speed. Find the slope of the distance–time graph.`,
        answer: `${speed} km/h`,
        distractors: distinct(`${speed} km/h`, [`${dec(d2 / t2, 1)} km/h`, `${dec((t2 - t1) / (d2 - d1), 4)} km/h`, `${d2 - d1} km/h`]),
        solution: `${math(`m = (${d2} - ${d1})/(${t2} - ${t1}) = ${d2 - d1}/${t2 - t1} = ${speed}`)} km/h.`,
      };
    }
    const hourly = rng.pick([12, 15, 16.5, 18]), fee = rng.pick([0, 20, 35]);
    const worker = rng.pick(['plumber', 'electrician', 'tutor', 'mechanic', 'dog groomer']);
    return {
      body: `A graph shows a ${worker}'s charge ${math('C')} (dollars) against hours worked ${math('h')}: ${math(`C = ${dec(hourly)}h${fee ? ` + ${fee}` : ''}`)}. What does the slope represent?`,
      answer: `The charge increases by \\$${dec(hourly, 2)} for each hour worked.`,
      distractors: [`The ${worker} charges \\$${fee || dec(hourly, 2)} before starting work.`, `The ${worker} works ${dec(hourly)} hours per job.`, `Each dollar pays for ${dec(1 / hourly, 3)} hours.`].filter((d) => d !== `The charge increases by \\$${dec(hourly, 2)} for each hour worked.`),
      solution: `The slope is the rate of change of the charge with respect to time: \\$${dec(hourly, 2)} per hour.${fee ? ` The ${fee} is the y-intercept, a starting fee.` : ''}`,
    };
  },
});

export const slopeAnotherPoint = mb10i('10i-slope-another-point', {
  points: 1,
  levels: { 1: 'Integer slope', 2: 'Fractional slope', 3: 'Given the x-coordinate' },
  options: [
    radioOption('form', 'Slope', [['1', 'Integer slope'], ['2', 'Fractional slope'], ['3', 'Given the x-coordinate']], ['1', '2', '3']),
    sizeOption([3, 5, 8], [5, 5, 5], 'Size of the given point'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const N = optNum(o, 'size', 5);
    const m = slopeValue(rng, difficulty > 1), x0 = rng.int(-N, N), y0 = rng.int(-N, N);
    if (difficulty === 3) {
      const k = rng.nonZero(-3, 3), x1 = x0 + k * m.d, y1 = y0 + k * m.n;
      return {
        body: `A line passes through ${math(pt(x0, y0))} with slope ${math(m.typst())}. Find ${math('y')} when ${math(`x = ${x1}`)}.`,
        answer: math(`y = ${y1}`),
        distractors: distinct(math(`y = ${y1}`), [`y = ${y0 - k * m.n}`, `y = ${y0 + k * m.d}`, `y = ${y1 + m.n}`, `y = ${Math.round(y0 + (x1 - x0) / m.value)}`].map(math)),
        solution: `From ${math(`x = ${x0}`)} to ${math(`x = ${x1}`)} the run is ${x1 - x0}, so the rise is ${math(`${m.typst()} dot ${x1 - x0} = ${y1 - y0}`)}: ${math(`y = ${y0} + ${y1 - y0}`).replace('+ -', '- ')} = ${y1}.`,
      };
    }
    const answer = pt(x0 + m.d, y0 + m.n);
    return {
      body: `A line passes through ${math(pt(x0, y0))} and has slope ${math(m.typst())}. Which point is also on the line?`,
      answer: math(answer),
      distractors: distinct(math(answer), [pt(x0 + m.n, y0 + m.d), pt(x0 + m.d, y0 - m.n), pt(x0 - m.d, y0 + m.n), pt(x0 + 1, y0 + m.d)].map(math)),
      solution: `Move ${m.d} right and ${Math.abs(m.n)} ${m.n > 0 ? 'up' : 'down'} from ${math(pt(x0, y0))}: ${math(answer)}.`,
    };
  },
});

export const slopeDraw = mb10i('10i-slope-draw', {
  levels: { 1: 'Integer slope', 2: 'Fractional slope', 3: 'Negative fractions, zero, or undefined' },
  options: [
    radioOption('form', 'Slope', [['1', 'Integer slope'], ['2', 'Fractional slope'], ['3', 'Negative fractions, zero, or undefined']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const special = difficulty === 3 && rng.next() < 0.3;
    const x0 = rng.int(-3, 3), y0 = rng.int(-3, 3);
    const draw = (m: number | null) => grid([m === null ? { points: [[x0, -8], [x0, 8]] as Pt[] } : { f: (x) => m * (x - x0) + y0 }], 3.4, { dots: [{ x: x0, y: y0 }] });
    if (special) {
      const zero = rng.next() < 0.5;
      return {
        body: `Which graph shows the line through ${math(pt(x0, y0))} with slope ${zero ? math('0') : 'undefined'}?`,
        answer: draw(zero ? 0 : null),
        distractors: [draw(zero ? null : 0), draw(1), draw(-1)],
        solution: zero ? 'Slope 0 means a horizontal line.' : 'An undefined slope means a vertical line.',
      };
    }
    const m = difficulty === 1 ? new Q(rng.nonZero(-3, 3)) : difficulty === 2 ? new Q(rng.int(1, 3), rng.int(2, 4)) : new Q(-rng.int(1, 3), rng.int(2, 4));
    if (!m.isInt === false && difficulty > 1) return slopeDraw.generate(rng, difficulty, o);
    return {
      body: `Which graph shows the line through ${math(pt(x0, y0))} with slope ${math(m.typst())}?`,
      answer: draw(m.value),
      distractors: [draw(-m.value), draw(1 / m.value), draw(-1 / m.value)],
      solution: `Start at ${math(pt(x0, y0))} and move ${m.d} right, ${Math.abs(m.n)} ${m.n > 0 ? 'up' : 'down'}. Join the points.`,
    };
  },
});

export const slopeParallelPerpendicular = mb10i('10i-slope-parallel-perpendicular', {
  points: 1,
  levels: { 1: 'From slopes', 2: 'From pairs of points', 3: 'From equations' },
  options: [
    radioOption('form', 'Given', [['1', 'From slopes'], ['2', 'From pairs of points'], ['3', 'From equations']], ['1', '2', '3']),
    radioOption('kind', 'Answer', [['any', 'Any'], ['parallel', 'Parallel'], ['perpendicular', 'Perpendicular'], ['neither', 'Neither']], ['any', 'any', 'any']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const m1 = slopeValue(rng, rng.next() < 0.5);
    const kOpt = optOne(o, 'kind', 'any');
    const kind = kOpt === 'any' ? rng.pick(['parallel', 'perpendicular', 'neither'] as const) : kOpt as 'parallel' | 'perpendicular' | 'neither';
    const m2 = kind === 'parallel' ? m1 : kind === 'perpendicular' ? new Q(-m1.d, m1.n) : (() => { let q = m1.add(rng.nonZero(-2, 2)); if (q.eq(new Q(-m1.d, m1.n)) || q.n === 0) q = m1.mul(-1); return q; })();
    const answer = kind[0].toUpperCase() + kind.slice(1);
    const why = kind === 'parallel' ? 'the slopes are equal' : kind === 'perpendicular' ? `the slopes are negative reciprocals (product ${math('-1')})` : 'the slopes are neither equal nor negative reciprocals';
    let body: string;
    if (difficulty === 1) body = `Two different lines: line 1 has slope ${math(m1.typst())} and line 2 has slope ${math(m2.typst())}. Are the lines parallel, perpendicular, or neither?`;
    else if (difficulty === 2) {
      const [a, b] = anchor(rng, m1), [c, d] = [rng.int(-5, 5), rng.int(-5, 5)];
      body = `Line 1 passes through ${math(pt(a, b))} and ${math(pt(a + m1.d, b + m1.n))}. Line 2 passes through ${math(pt(c, d))} and ${math(pt(c + m2.d, d + m2.n))}. Are the lines parallel, perpendicular, or neither?`;
    } else {
      const general = (m: Q, k: number) => `${poly([m.n, 0]).replace(/x$/, 'x')} ${m.d === 1 ? '-' : `- ${m.d}`}y ${k < 0 ? '-' : '+'} ${Math.abs(k)} = 0`.replace('- 1y', '- y');
      body = `Are ${math(general(m1, rng.nonZero(-9, 9)))} and ${math(general(m2, rng.nonZero(-9, 9)))} parallel, perpendicular, or neither?`;
    }
    return {
      body,
      answer,
      distractors: ['Parallel', 'Perpendicular', 'Neither', 'The same line'].filter((d) => d !== answer),
      solution: `The slopes are ${math(m1.typst())} and ${math(m2.typst())}: ${why}.`,
    };
  },
});

export const slopeUnknown = mb10i('10i-slope-unknown', {
  levels: { 1: 'Given slope, integer slopes, missing y', 2: 'Parallel or perpendicular, fractional slopes', 3: 'Three collinear points' },
  options: [
    sizeOption([5, 9, 12, 20, 50], [9, 9, 12]),
    radioOption('condition', 'The line', [['slope', 'Has a given slope'], ['parallel', 'Is parallel or perpendicular to a given slope'], ['collinear', 'Passes through a third point']], ['slope', 'parallel', 'collinear']),
    radioOption('numbers', 'Slopes are', [['int', 'Integers'], ['frac', 'Fractions'], ['both', 'Either']], ['int', 'both', 'both']),
    radioOption('missing', 'Missing variable', [['x', 'x'], ['y', 'y'], ['either', 'Either']], ['y', 'either', 'either']),
    toggleOption('special', 'Include zero slope and undefined slope', [false, false, true]),
  ],
  generate(rng, difficulty, o) {
    const N = optNum(o, 'size', 9);
    const condition = optOne(o, 'condition', difficulty === 1 ? 'slope' : difficulty === 2 ? 'parallel' : 'collinear');
    const numbers = optOne(o, 'numbers', difficulty === 1 ? 'int' : 'both');
    let missing = optOne(o, 'missing', difficulty === 1 ? 'y' : 'either');
    const special = optOn(o, 'special', difficulty === 3) && condition === 'slope' && rng.next() < 0.3 ? rng.pick(['zero', 'undefined'] as const) : null;
    const frac = numbers === 'frac' || (numbers === 'both' && rng.next() < 0.5);
    // A slope whose rise and run fit inside ±N.
    const m: Q | null = special === 'undefined' ? null : special === 'zero' ? new Q(0) : (() => {
      for (;;) {
        const d = frac ? rng.int(2, Math.max(2, Math.min(6, Math.floor(N / 2)))) : 1;
        const q = new Q(rng.nonZero(-Math.max(1, Math.floor(N / (frac ? 1 : 2))), Math.max(1, Math.floor(N / (frac ? 1 : 2)))), d);
        if (frac === !q.isInt && Math.abs(q.n) <= N && q.d <= N) return q;
      }
    })();
    // Two points within ±N on the line.
    let x1 = 0, y1 = 0, x2 = 0, y2 = 0;
    for (let tries = 0; tries < 500; tries++) {
      x1 = rng.int(-N, N); y1 = rng.int(-N, N);
      if (m === null) { x2 = x1; y2 = rng.int(-N, N); if (y2 !== y1) break; continue; }
      const run = m.d * rng.nonZero(-3, 3);
      x2 = x1 + run; y2 = y1 + m.n * (run / m.d);
      if (Math.abs(x2) <= N && Math.abs(y2) <= N) break;
    }
    // Horizontal lines fix y, vertical lines fix x: the other coordinate cannot be found.
    if (missing === 'either') missing = rng.pick(['x', 'y']);
    if (m?.n === 0) missing = 'y';
    if (m === null) missing = 'x';
    const slopeText = m === null ? 'undefined' : math(m.typst());
    let known: [number, number], hidden: [number, number];
    if (condition === 'collinear' && m !== null) {
      // A third point on the line, further along.
      const x3 = x2 + m.d, y3 = y2 + m.n;
      known = [x1, y1]; hidden = [x3, y3];
      const third = missing === 'x' ? pt('x', y3) : pt(x3, 'y');
      const value = missing === 'x' ? x3 : y3;
      return {
        body: `Find the value of ${math(missing)} so that ${math(pt(x1, y1))}, ${math(pt(x2, y2))}, and ${math(third)} lie on one line.`,
        answer: math(`${missing} = ${value}`),
        distractors: distinct(math(`${missing} = ${value}`), [value + 1, value - 1, -value, missing === 'x' ? x2 - m.d : y2 - m.n].map((v) => math(`${missing} = ${v}`))),
        solution: `The slope through the first two points is ${slopeText}. The third point must give the same slope with ${math(pt(x2, y2))}, so ${math(`${missing} = ${value}`)}.`,
      };
    }
    const flip = rng.next() < 0.5;
    [known, hidden] = flip ? [[x2, y2], [x1, y1]] : [[x1, y1], [x2, y2]];
    const value = missing === 'x' ? hidden[0] : hidden[1];
    const shown = missing === 'x' ? pt('x', hidden[1]) : pt(hidden[0], 'y');
    const pair = flip ? `${math(shown)} and ${math(pt(known[0], known[1]))}` : `${math(pt(known[0], known[1]))} and ${math(shown)}`;
    let stem: string, why = '';
    if (condition === 'parallel' && m !== null && m.n !== 0) {
      const perp = rng.next() < 0.5;
      const given = perp ? new Q(-m.d, m.n) : m;
      stem = `so that the line through ${pair} is ${perp ? 'perpendicular' : 'parallel'} to a line with slope ${math(given.typst())}`;
      why = perp ? `A perpendicular line has the negative reciprocal slope, ${slopeText}. ` : `A parallel line has the same slope, ${slopeText}. `;
    } else {
      stem = m === null ? `so that the line through ${pair} has an undefined slope` : `so that the line through ${pair} has slope ${slopeText}`;
    }
    // Typical slips: the reciprocal slope, the opposite slope, or an off-by-one.
    const wrong = m === null || m.n === 0
      ? [value + 1, -value || 3, value - 2, value + 3, known[missing === 'x' ? 1 : 0]]
      : missing === 'y'
        ? [known[1] + (hidden[0] - known[0]) * (m.d / m.n), known[1] - (hidden[0] - known[0]) * m.value, value + 1, -value]
        : [known[0] + (hidden[1] - known[1]) * m.value, known[0] - (hidden[1] - known[1]) / m.value, value + 1, -value];
    const eq = m === null
      ? `The slope is undefined, so the line is vertical and both points share an x-coordinate: ${math(`x = ${value}`)}.`
      : `${math(`(${missing === 'y' ? 'y' : hidden[1]} - ${sub(known[1])})/(${missing === 'x' ? 'x' : hidden[0]} - ${sub(known[0])}) = ${m.typst()}`)}, so ${math(`${missing} = ${value}`)}.`;
    return {
      body: `Find the value of ${math(missing)} ${stem}.`,
      answer: math(`${missing} = ${value}`),
      distractors: distinct(math(`${missing} = ${value}`), wrong.map((v) => math(`${missing} = ${Number.isInteger(v) ? v : new Q(Math.round(v * 12), 12).typst()}`))),
      solution: `${why}${eq}`,
    };
  },
});

// ── Linear relations ──────────────────────────────────────────────────────

const VARIABLES: Array<[string, string, string]> = [
  ['the cost of a taxi ride depends on the distance travelled', 'distance travelled', 'cost'],
  ['a plant grows taller each week', 'number of weeks', 'height of the plant'],
  ['the amount earned depends on the hours worked', 'hours worked', 'amount earned'],
  ['a candle gets shorter as it burns', 'time burning', 'height of the candle'],
  ['the fuel left in a tank decreases with distance driven', 'distance driven', 'fuel left'],
  ['the total cost of apples depends on their mass', 'mass of apples', 'total cost'],
];

export const linVariables = mb10i('10i-lin-variables', {
  points: 1,
  levels: { 1: 'Independent variable', 2: 'Dependent variable', 3: 'Axis for each variable' },
  options: [
    radioOption('form', 'Ask for', [['1', 'Independent variable'], ['2', 'Dependent variable'], ['3', 'Axis for each variable']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const [ctx, ind, dep] = rng.pick(VARIABLES);
    const others2 = VARIABLES.filter(([c]) => c !== ctx).flatMap(([, i, d]) => [i, d]);
    if (difficulty === 3) {
      const answer = `${ind} on the horizontal axis, ${dep} on the vertical axis`;
      return {
        body: `In a graph showing that ${ctx}, which variable goes on each axis?`,
        answer,
        distractors: [`${dep} on the horizontal axis, ${ind} on the vertical axis`, `${ind} on both axes`, `${dep} on the horizontal axis, time on the vertical axis`],
        solution: `The independent variable (${ind}) goes on the horizontal axis and the dependent variable (${dep}) on the vertical axis.`,
      };
    }
    const answer = difficulty === 1 ? ind : dep;
    return {
      body: `In the situation "${ctx}", what is the ${difficulty === 1 ? 'independent' : 'dependent'} variable?`,
      answer,
      distractors: [difficulty === 1 ? dep : ind, ...others(rng, others2, answer, 2)],
      solution: `The dependent variable (${dep}) depends on the independent variable (${ind}).`,
    };
  },
});

/** A table of values as Typst markup. */
function table(xs: number[], ys: number[]): string {
  return `#table(columns: ${xs.length + 1}, inset: 5pt, align: center, [$x$], ${xs.map((x) => `[$${x}$]`).join(', ')}, [$y$], ${ys.map((y) => `[$${dec(y)}$]`).join(', ')})`;
}

export const linTable = mb10i('10i-lin-table', {
  points: 1,
  levels: { 1: 'Equal steps in x', 2: 'Unequal steps in x', 3: 'Which set of points is linear?' },
  options: [
    radioOption('form', 'Table', [['1', 'Equal steps in x'], ['2', 'Unequal steps in x'], ['3', 'Which set of points is linear?']], ['1', '2', '3']),
    sizeOption([3, 5, 8], [5, 5, 5], 'Size of the rate of change'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const m = rng.nonZero(-optNum(o, 'size', 5), optNum(o, 'size', 5)), b = rng.int(-6, 6);
    if (difficulty === 3) {
      const xs = [0, 1, 2, 3];
      const lin = xs.map((x) => [x, m * x + b] as [number, number]);
      const bent = (k: number) => xs.map((x, i) => [x, m * x + b + (i === k ? rng.pick([1, -1, 2]) : 0)] as [number, number]);
      const quad = xs.map((x) => [x, x * x + b] as [number, number]);
      return {
        body: 'Which set of ordered pairs represents a linear relation?',
        answer: math(setText(lin)),
        distractors: [setText(bent(2)), setText(quad), setText(bent(3))].map(math),
        solution: `In ${math(setText(lin))} the y-values change by ${m} for each increase of 1 in x: a constant rate of change, so it is linear.`,
      };
    }
    const linear = rng.next() < 0.5;
    const xs = difficulty === 1 ? [0, 1, 2, 3, 4] : [0, 1, 3, 4, 7];
    const ys = xs.map((x, i) => m * x + b + (!linear && i === 3 ? rng.pick([1, -1, 2]) : 0));
    const answer = linear ? 'Linear: the rate of change is constant' : 'Not linear: the rate of change is not constant';
    return {
      body: `Does the table represent a linear relation?\n\n${table(xs, ys)}`,
      answer,
      // With equal x-steps, "the y-values go up by the same amount" would be a second correct reason, so
      // level 1 uses a false statement about the direction instead.
      distractors: ['Linear: the rate of change is constant', 'Not linear: the rate of change is not constant', difficulty === 1 ? `Linear: the y-values ${ys[4] > ys[0] ? 'decrease' : 'increase'} from left to right` : 'Linear: the y-values go up by the same amount each column', 'Not linear: it does not start at (0, 0)'].filter((d) => d !== answer),
      solution: `${difficulty === 2 ? 'The x-steps are unequal, so compare rates: the' : 'The'} rates of change are ${xs.slice(1).map((x, i) => dec((ys[i + 1] - ys[i]) / (x - xs[i]), 2)).join(', ')}. ${linear ? 'They are all equal.' : 'They are not all equal.'}`,
    };
  },
});

const EQUATIONS_LIN = ['y = 3x - 2', '2x + 5y = 10', 'y = -1/2 x + 4', 'x = 7', 'y = 5', '4x - y + 3 = 0', '(y - 2) = 3(x + 1)'];
const EQUATIONS_NOT = ['y = x^2 + 1', 'x y = 6', 'y = 2/x', 'y = sqrt(x)', 'y = 2^x', 'x^2 + y^2 = 25', 'y = abs(x)'];

export const linEquation = mb10i('10i-lin-equation', {
  points: 1,
  levels: { 1: 'Which equation is linear?', 2: 'Which equation is not linear?', 3: 'Is this equation linear?' },
  options: [
    radioOption('form', 'Question', [['1', 'Which equation is linear?'], ['2', 'Which equation is not linear?'], ['3', 'Is this equation linear?']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    if (difficulty === 3) {
      const lin = rng.next() < 0.5, eq = rng.pick(lin ? EQUATIONS_LIN : EQUATIONS_NOT);
      const answer = lin ? 'Linear' : 'Not linear';
      return {
        body: `Is ${math(eq)} a linear relation?`,
        answer,
        distractors: [lin ? 'Not linear' : 'Linear', 'Linear only for positive x', 'It is not a relation'],
        solution: lin ? `Both variables appear only to the first power (no products, roots, or variables in denominators or exponents), so it is linear.` : `${math(eq)} has a variable ${eq.includes('^2') ? 'squared' : eq.includes('x y') ? 'product' : eq.includes('/x') ? 'in a denominator' : eq.includes('sqrt') ? 'under a root' : eq.includes('abs') ? 'inside an absolute value' : 'in an exponent'}, so its graph is not a line.`,
      };
    }
    const wantLin = difficulty === 1;
    const answer = rng.pick(wantLin ? EQUATIONS_LIN : EQUATIONS_NOT);
    return {
      body: `Which equation ${wantLin ? 'represents' : 'does not represent'} a linear relation?`,
      answer: math(answer),
      distractors: rng.shuffle(wantLin ? EQUATIONS_NOT : EQUATIONS_LIN).slice(0, 3).map(math),
      solution: `A linear equation has each variable to the first power only, with no products of variables. ${math(answer)} ${wantLin ? 'is' : 'is not'} linear.`,
    };
  },
});

export const linRepresent = mb10i('10i-lin-represent', {
  levels: { 1: 'Complete a table of values', 2: 'Write the equation for a table', 3: 'Write the equation for a context' },
  options: [
    radioOption('form', 'Task', [['1', 'Complete a table of values'], ['2', 'Write the equation for a table'], ['3', 'Write the equation for a context']], ['1', '2', '3']),
    sizeOption([3, 5, 8], [5, 5, 5], 'Size of the slope'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const m = rng.nonZero(-optNum(o, 'size', 5), optNum(o, 'size', 5)), b = rng.int(-8, 8);
    const eq = yEquals(new Q(m), new Q(b));
    if (difficulty === 1) {
      const x = rng.int(-5, 6);
      return {
        body: `For ${math(eq)}, find ${math('y')} when ${math(`x = ${x}`)}.`,
        answer: math(`y = ${m * x + b}`),
        distractors: distinct(math(`y = ${m * x + b}`), [`y = ${m + x + b}`, `y = ${m * x - b}`, `y = ${-(m * x) + b}`, `y = ${m * (x + b)}`].map(math)),
        solution: `${math(`y = ${m}(${x}) ${b < 0 ? '-' : '+'} ${Math.abs(b)} = ${m * x + b}`)}.`,
      };
    }
    if (difficulty === 2) {
      const xs = [0, 1, 2, 3], ys = xs.map((x) => m * x + b);
      return {
        body: `Write an equation for the linear relation in the table.\n\n${table(xs, ys)}`,
        answer: math(eq),
        distractors: distinct(math(eq), [yEquals(new Q(b), new Q(m)), yEquals(new Q(-m), new Q(b)), yEquals(new Q(m), new Q(b + m)), yEquals(new Q(m), new Q(-b))].map(math)),
        solution: `As ${math('x')} increases by 1, ${math('y')} changes by ${m} (the slope). When ${math('x = 0')}, ${math(`y = ${b}`)}. So ${math(eq)}.`,
      };
    }
    const fee = rng.pick([5, 10, 15, 25]), per = rng.pick([2, 3, 4, 6, 8]);
    return {
      body: `${rng.pick(['A climbing gym', 'A swimming pool', 'A trampoline park', 'A fitness centre', 'A bowling alley'])} charges a \\$${fee} membership fee plus \\$${per} per visit. Write an equation for the total cost ${math('C')} for ${math('n')} visits.`,
      answer: math(`C = ${per}n + ${fee}`),
      distractors: [`C = ${fee}n + ${per}`, `C = ${per + fee}n`, `C = ${per}(n + ${fee})`].map(math),
      solution: `The cost per visit is the rate (slope), ${per}, and the fee is the starting value, ${fee}: ${math(`C = ${per}n + ${fee}`)}.`,
    };
  },
});

export const linIntercepts = mb10i('10i-lin-intercepts', {
  levels: { 1: 'From y = mx + b', 2: 'From Ax + By = C', 3: 'In a context' },
  options: [
    radioOption('form', 'Form', [['1', 'From y = mx + b'], ['2', 'From Ax + By = C'], ['3', 'In a context']], ['1', '2', '3']),
    sizeOption([4, 6, 10], [6, 6, 6], 'Size of the intercepts'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    if (difficulty === 3) {
      const V = rng.pick([40, 50, 60]), rate = rng.pick([4, 5, 8, 10]);
      const t = V / rate;
      return {
        body: `${rng.pick(['A car has', 'A boat has', 'A generator has', 'A snowmobile has'])} ${V} L of fuel and uses ${rate} L per hour: ${math(`F = ${V} - ${rate}t`)}. Find the t-intercept and explain what it means.`,
        answer: `${dec(t)} h: the tank is empty after ${dec(t)} hours`,
        distractors: [`${V} h: the tank starts with ${V} L`, `${rate} h: the car uses ${rate} L each hour`, `${dec(t)} L: the tank holds ${dec(t)} L when empty`],
        solution: `Set ${math('F = 0')}: ${math(`${V} - ${rate}t = 0`)}, so ${math(`t = ${dec(t)}`)}. The fuel runs out after ${dec(t)} hours. (The F-intercept, ${V}, is the starting fuel.)`,
      };
    }
    let A: number, B: number, C: number, eq: string;
    if (difficulty === 1) {
      const N = optNum(o, 'size', 6);
      const xi = rng.nonZero(-N, N), m = rng.nonZero(-4, 4), yi = -m * xi;
      A = m; B = -1; C = -yi; eq = yEquals(new Q(m), new Q(yi));
    } else {
      const N = optNum(o, 'size', 6);
      const xi = rng.nonZero(-N, N), yi = rng.nonZero(-N, N);
      const L = Math.abs(xi * yi) / gcd(xi, yi);
      A = L / xi; B = L / yi; C = L;
      const g = gcd(gcd(A, B), C); A /= g; B /= g; C /= g;
      eq = `${poly([A, 0]).replace(/x$/, 'x')} ${B < 0 ? '-' : '+'} ${Math.abs(B) === 1 ? '' : Math.abs(B)}y = ${C}`;
    }
    const xint = new Q(C, A), yint = new Q(C, B);
    const answer = `x"-int" ${xint.typst()}, y"-int" ${yint.typst()}`;
    return {
      body: `Find the x- and y-intercepts of ${math(eq)}.`,
      answer: math(answer),
      distractors: distinct(math(answer), [`x"-int" ${yint.typst()}, y"-int" ${xint.typst()}`, `x"-int" ${xint.neg().typst()}, y"-int" ${yint.typst()}`, `x"-int" ${new Q(A, C).typst()}, y"-int" ${yint.typst()}`, `x"-int" ${xint.typst()}, y"-int" ${yint.neg().typst()}`].map(math)),
      solution: `Set ${math('y = 0')} to find the x-intercept, ${math(xint.typst())}; set ${math('x = 0')} to find the y-intercept, ${math(yint.typst())}. As points: ${math(pt(xint.typst(), 0))} and ${math(pt(0, yint.typst()))}.`,
    };
  },
});

export const linDomainRange = mb10i('10i-lin-domain-range', {
  points: 1,
  levels: { 1: 'Lines, including horizontal and vertical', 2: 'A line segment', 3: 'A context' },
  options: [
    radioOption('form', 'Relation', [['1', 'Lines, including horizontal and vertical'], ['2', 'A line segment'], ['3', 'A context']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    if (difficulty === 1) {
      const kind = rng.pick(['oblique', 'horizontal', 'vertical'] as const), c = rng.int(-6, 6);
      const eq = kind === 'oblique' ? yEquals(new Q(rng.nonZero(-4, 4)), new Q(c)) : kind === 'horizontal' ? `y = ${c}` : `x = ${c}`;
      const answer = kind === 'oblique' ? 'D: {x | x in RR}; R: {y | y in RR}' : kind === 'horizontal' ? `D: {x | x in RR}; R: {${c}}` : `D: {${c}}; R: {y | y in RR}`;
      return {
        body: `State the domain and range of ${math(eq)}.`,
        answer: math(answer),
        distractors: distinct(math(answer), ['D: {x | x in RR}; R: {y | y in RR}', `D: {x | x in RR}; R: {${c}}`, `D: {${c}}; R: {y | y in RR}`, `D: {x | x >= 0, x in RR}; R: {y | y >= ${c}, y in RR}`].map(math)),
        solution: kind === 'oblique' ? 'A slanted line covers every x and every y.' : kind === 'horizontal' ? `A horizontal line covers every x but only ${math(`y = ${c}`)}.` : `A vertical line has only ${math(`x = ${c}`)} but every y.`,
      };
    }
    if (difficulty === 2) {
      const x1 = rng.int(-6, -1), x2 = rng.int(1, 6), y1 = rng.int(-6, 6), y2 = rng.int(-6, 6);
      if (y1 === y2) return linDomainRange.generate(rng, difficulty, o);
      const [lo, hi] = [Math.min(y1, y2), Math.max(y1, y2)];
      const answer = `D: {x | ${x1} <= x <= ${x2}, x in RR}; R: {y | ${lo} <= y <= ${hi}, y in RR}`;
      return {
        body: `A line segment joins ${math(pt(x1, y1))} and ${math(pt(x2, y2))}. State its domain and range.`,
        answer: math(answer),
        distractors: [`D: {x | ${lo} <= x <= ${hi}, x in RR}; R: {y | ${x1} <= y <= ${x2}, y in RR}`, `D: {x | x in RR}; R: {y | y in RR}`, `D: {x | ${x1} < x < ${x2}, x in RR}; R: {y | ${lo} < y < ${hi}, y in RR}`].map(math),
        solution: `The segment covers x from ${x1} to ${x2} and y from ${lo} to ${hi}, endpoints included.`,
      };
    }
    const wage = rng.pick([14, 15, 16, 18]), maxH = rng.pick([20, 25, 30, 40]);
    return {
      body: `${rng.pick(['A student', 'A lifeguard', 'A camp counsellor', 'A cashier', 'A babysitter'])} earns \\$${wage} per hour and may work at most ${maxH} hours a week: ${math(`E = ${wage}h`)}. State the domain and range.`,
      answer: math(`D: {h | 0 <= h <= ${maxH}, h in RR}; R: {E | 0 <= E <= ${wage * maxH}, E in RR}`),
      distractors: [`D: {h | 0 <= h <= ${wage * maxH}, h in RR}; R: {E | 0 <= E <= ${maxH}, E in RR}`, `D: {h | h in RR}; R: {E | E in RR}`, `D: {h | 0 <= h <= ${maxH}, h in RR}; R: {E | E >= 0, E in RR}`].map(math),
      solution: `Hours run from 0 to ${maxH}, so earnings run from \\$0 to ${math(`${wage}(${maxH}) = ${wage * maxH}`)} dollars.`,
    };
  },
});

export const linMatchGraph = mb10i('10i-lin-match-graph', {
  levels: { 1: 'Integer slope and y-intercept', 2: 'Fractional slope', 3: 'Negative fractional slope' },
  options: [
    radioOption('form', 'Slope', [['1', 'Integer slope and y-intercept'], ['2', 'Fractional slope'], ['3', 'Negative fractional slope']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const m = difficulty === 1 ? new Q(rng.nonZero(-3, 3)) : new Q((difficulty === 3 ? -1 : 1) * rng.int(1, 3), rng.int(2, 4));
    if (!m.isInt === false && difficulty > 1) return linMatchGraph.generate(rng, difficulty, o);
    const b = rng.nonZero(-4, 4);
    return {
      body: `Which graph has slope ${math(m.typst())} and y-intercept ${math(String(b))}?`,
      answer: line(m.value, b),
      distractors: [line(-m.value, b), line(m.value, -b), line(1 / m.value, b)],
      solution: `Start at ${math(pt(0, b))} on the y-axis and move ${m.d} right, ${Math.abs(m.n)} ${m.n > 0 ? 'up' : 'down'}.`,
    };
  },
});

export const linContext = mb10i('10i-lin-context', {
  levels: { 1: 'Meaning of the vertical intercept', 2: 'Meaning of the slope', 3: 'Use the relation to answer a question' },
  options: [
    radioOption('form', 'Question', [['1', 'Meaning of the vertical intercept'], ['2', 'Meaning of the slope'], ['3', 'Use the relation to answer a question']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const fee = rng.pick([30, 45, 60, 75]), rate = rng.pick([0.15, 0.2, 0.25, 0.3]);
    const eq = `C = ${dec(rate)}d + ${fee}`;
    const intro = () => `${rng.pick(['A truck rental', 'A moving-van rental', 'A car rental', 'A trailer rental'])} costs ${math(eq)} dollars for ${math('d')} kilometres.`;
    if (difficulty === 1) {
      return {
        body: `${intro()} What does ${fee} represent?`,
        answer: `A flat fee of \\$${fee} charged even for 0 km`,
        distractors: [`The cost per kilometre`, `The maximum distance, ${fee} km`, `The total cost of a ${fee} km trip`],
        solution: `When ${math('d = 0')}, ${math(`C = ${fee}`)}: the C-intercept is the fixed fee.`,
      };
    }
    if (difficulty === 2) {
      return {
        body: `${intro()} What does ${dec(rate)} represent?`,
        answer: `The cost increases by \\$${rate.toFixed(2)} for each kilometre`,
        distractors: [`The flat fee`, `The number of kilometres per dollar`, `The total cost of a 1 km trip`],
        solution: `The slope is the rate of change of cost per kilometre: \\$${rate.toFixed(2)}/km.`,
      };
    }
    const budget = fee + rate * rng.int(2, 8) * 100;
    const d = (budget - fee) / rate;
    return {
      body: `${intro()} How far can you drive for \\$${budget.toFixed(2)}?`,
      answer: `${dec(d)} km`,
      distractors: distinct(`${dec(d)} km`, [`${dec(budget / rate)} km`, `${dec(budget * rate + fee)} km`, `${dec((budget + fee) / rate)} km`]),
      solution: `${math(`${dec(budget)} = ${dec(rate)}d + ${fee}`)}, so ${math(`d = (${dec(budget)} - ${fee})/${dec(rate)} = ${dec(d)}`)} km.`,
    };
  },
});

export const RELATIONS_10I = [
  relMatchContext, relDescribeGraph, relDiscrete, relContextDomain,
  fnOrderedPairs, fnVerticalLine, fnDomainRangeSet, fnDomainRangeGraph,
  slopeGraph, slopeClassify, slopeRate, slopeAnotherPoint, slopeDraw, slopeParallelPerpendicular, slopeUnknown,
  linVariables, linTable, linEquation, linRepresent, linIntercepts, linDomainRange, linMatchGraph, linContext,
];

export { yEquals, grid, line, table };
