import type { Rng } from '../../rng.ts';
import { monomial, polynomial } from '../../format.ts';
import { Q } from '../../exact.ts';
import { graphTypst, type Pt } from '../../graph.ts';
import { math, mb10f } from '../pc40s/common.ts';
import { dec, distinct, numberLine } from '../grade10/shared.ts';
import { optNum, optOne, radioOption, sizeOption } from '../../options.ts';

/** A quotient for a distractor, never dividing by zero. */
const safeQ = (n: number, d: number) => (d === 0 ? new Q(n + 1) : new Q(n, d));
const lin = (a: number, b: number, v = 'n') => polynomial([{ coef: a, powers: [[v, 1]] }, { coef: b }]);
/** `2x`, `-x`, `x` with Q coefficients: `1/2 x`. */
const qx = (q: Q, v = 'x') => q.coef(v);
/** A table of values as Typst markup. */
function table(head: [string, string], xs: Array<number | string>, ys: Array<number | string>): string {
  return `#table(columns: ${xs.length + 1}, inset: 5pt, align: center, [${head[0]}], ${xs.map((x) => `[$${x}$]`).join(', ')}, [${head[1]}], ${ys.map((y) => `[$${y}$]`).join(', ')})`;
}

// ── Patterns ──────────────────────────────────────────────────────────────

/** Figures 1 to 3 of a tile pattern with a·n + b tiles: a rows of n tiles, plus b tiles in a column on the left. */
function tileFigures(a: number, b: number): string {
  const curves: Array<{ points: Pt[] }> = [];
  const labels: Array<{ x: number; y: number; text: string }> = [];
  const square = (x: number, y: number) => curves.push({ points: [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1], [x, y]] });
  let x0 = 0;
  for (let n = 1; n <= 3; n++) {
    for (let i = 0; i < b; i++) square(x0, i);
    for (let r = 0; r < a; r++) for (let c = 0; c < n; c++) square(x0 + (b ? 1 : 0) + c, r);
    const width = (b ? 1 : 0) + n;
    labels.push({ x: x0 + width / 2, y: -0.8, text: `"Figure ${n}"` });
    x0 += width + 1.5;
  }
  const H = Math.max(a, b);
  const W = x0 - 1.5;
  return graphTypst({ xMin: -0.5, xMax: W + 0.5, yMin: -1.5, yMax: H + 0.5, width: Math.min(12, (W + 1) * 0.55), height: (H + 2) * 0.55, grid: false, numbers: false, axes: false, curves, labels });
}

export const patFigures = mb10f('10f-pat-figures', {
  levels: { 1: 'One row that grows', 2: 'Two or three rows', 3: 'Find the number in figure 20' },
  options: [
    radioOption('form', 'Pattern', [['1', 'One row that grows'], ['2', 'Two or three rows'], ['3', 'Find the number in figure 20']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const a = difficulty === 1 ? 1 : rng.int(2, 3), b = rng.int(difficulty === 1 ? 1 : 0, 3);
    const pic = tileFigures(a, b);
    if (difficulty === 3) {
      const n = rng.pick([10, 20, 25, 50]);
      return {
        body: `How many tiles are in figure ${n}?\n\n${pic}`,
        answer: String(a * n + b),
        distractors: distinct(String(a * n + b), [String(a * n), String((a + b) * n), String(a * n + b + a), String(n + b)]),
        solution: `Each figure adds ${a} tile${a > 1 ? 's' : ''}; figure ${math('n')} has ${math(lin(a, b))} tiles. Figure ${n}: ${math(`${a}(${n}) + ${b} = ${a * n + b}`).replace(' + 0 ', ' ')}.`,
      };
    }
    const answer = lin(a, b);
    return {
      body: `Write an expression for the number of tiles in figure ${math('n')}.\n\n${pic}`,
      answer: math(answer),
      distractors: distinct(math(answer), [lin(a + b, 0), lin(b || 1, a), lin(a, b + a), lin(a + 1, b)].map(math)),
      solution: `The figures have ${[1, 2, 3].map((n) => a * n + b).join(', ')} tiles: ${a} more each time, starting from ${b} extra. So ${math(answer)}. Check: figure 2 has ${math(`${a}(2) + ${b} = ${2 * a + b}`).replace(' + 0 ', ' ')}.`,
    };
  },
});

export const patTable = mb10f('10f-pat-table', {
  levels: { 1: 'Consecutive terms', 2: 'Terms with gaps', 3: 'Decreasing patterns' },
  options: [
    radioOption('form', 'Table', [['1', 'Consecutive terms'], ['2', 'Terms with gaps'], ['3', 'Decreasing patterns']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const a = difficulty === 3 ? -rng.int(2, 6) : rng.int(2, 7), b = difficulty === 3 ? rng.int(30, 60) : rng.int(-5, 9);
    const ns = difficulty === 1 ? [1, 2, 3, 4, 5] : [1, 2, 4, 5, 8];
    const ts = ns.map((n) => a * n + b);
    const answer = `t = ${lin(a, b)}`;
    return {
      body: `Write an equation for the term value ${math('t')} in terms of the term number ${math('n')}.\n\n${table(['$n$', '$t$'], ns, ts)}`,
      answer: math(answer),
      distractors: distinct(math(answer), [`t = ${lin(a, ts[0])}`, `t = ${lin(b, a)}`, `t = ${lin(-a, b)}`, `t = ${lin(a, -b)}`].map(math)),
      solution: `${difficulty === 2 ? 'Compare the change in t to the change in n: ' : 'Each time n increases by 1, '}t changes by ${a}. Then ${math(`t = ${a}n + b`)} with ${math(`${ts[0]} = ${a}(1) + b`)}, so ${math(`b = ${b}`)}. Check with ${math(`n = ${ns[3]}`)}: ${math(`${a}(${ns[3]})${b ? ` ${b < 0 ? '-' : '+'} ${Math.abs(b)}` : ''} = ${ts[3]}`)}.`,
    };
  },
});

const CONTEXTS: Array<(rng: Rng) => { text: string; eq: string; wrong: string[]; why: string }> = [
  (rng) => { const f = rng.pick([15, 20, 25]), r = rng.pick([2, 3, 5]); return { text: `A skating rink charges a \\$${f} group fee plus \\$${r} per skater. Write an equation for the cost ${math('C')} for ${math('n')} skaters.`, eq: `C = ${r}n + ${f}`, wrong: [`C = ${f}n + ${r}`, `C = ${r + f}n`, `C = ${r}(n + ${f})`], why: `The cost per skater, ${r}, multiplies ${math('n')}; the fee ${f} is added once.` }; },
  (rng) => { const s = rng.pick([2, 4]); return { text: `Square tables are placed end to end. Each table seats ${s / 2} on each of its two long sides, and one person sits at each end of the row. Write an equation for the number of seats ${math('S')} for ${math('n')} tables.`, eq: `S = ${s}n + 2`, wrong: [`S = ${s + 2}n`, `S = 2n + ${s}`, `S = ${s}n`], why: `Each table adds ${s} seats along the sides, and the two ends add 2.` }; },
  (rng) => { const start = rng.pick([30, 40, 50]), r = rng.pick([2, 3, 4]); return { text: `A candle is ${start} cm tall and burns ${r} cm each hour. Write an equation for its height ${math('h')} after ${math('t')} hours.`, eq: `h = ${start} - ${r}t`, wrong: [`h = ${r}t - ${start}`, `h = ${start}t - ${r}`, `h = ${start} + ${r}t`], why: `The height starts at ${start} and decreases by ${r} each hour.` }; },
];

export const patContext = mb10f('10f-pat-context', {
  levels: { 1: 'Fee plus a rate', 2: 'A seating pattern', 3: 'A decreasing pattern' },
  options: [
    radioOption('form', 'Context', [['1', 'Fee plus a rate'], ['2', 'A seating pattern'], ['3', 'A decreasing pattern']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const c = CONTEXTS[difficulty - 1](rng);
    return {
      body: c.text,
      answer: math(c.eq),
      distractors: c.wrong.map(math),
      solution: `${c.why} ${math(c.eq)}.`,
    };
  },
});

export const patSolve = mb10f('10f-pat-solve', {
  levels: { 1: 'Find a term value', 2: 'Find the term number', 3: 'Is a value in the pattern?' },
  options: [
    radioOption('form', 'Task', [['1', 'Find a term value'], ['2', 'Find the term number'], ['3', 'Is a value in the pattern?']], ['1', '2', '3']),
    sizeOption([30, 60, 100], [60, 60, 60], 'Largest term number'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const a = rng.int(2, 9), b = rng.int(-5, 12);
    const eq = `t = ${lin(a, b)}`;
    if (difficulty === 1) {
      const n = rng.int(12, optNum(o, 'size', 60));
      return {
        body: `A pattern follows ${math(eq)}. Find the value of term ${n}.`,
        answer: math(String(a * n + b)),
        distractors: distinct(math(String(a * n + b)), [String(a * n), String(a * (n + b)), String((a + b) * n), String(a * n - b)].map(math)),
        solution: `${math(`t = ${a}(${n}) ${b < 0 ? '-' : '+'} ${Math.abs(b)} = ${a * n + b}`)}.`,
      };
    }
    if (difficulty === 2) {
      const n = rng.int(12, optNum(o, 'size', 60)), t = a * n + b;
      return {
        body: `A pattern follows ${math(eq)}. Which term has a value of ${t}?`,
        answer: `Term ${n}`,
        distractors: distinct(`Term ${n}`, [`Term ${Math.round((t + b) / a)}`, `Term ${a * t + b}`, `Term ${Math.round(t / a)}`, `Term ${n + 1}`]),
        solution: `Solve ${math(`${t} = ${lin(a, b)}`)}: ${math(`${a}n = ${t - b}`)}, so ${math(`n = ${n}`)}. Check by substitution: ${math(`${a}(${n}) ${b < 0 ? '-' : '+'} ${Math.abs(b)} = ${t}`)}.`,
      };
    }
    const n = rng.int(12, optNum(o, 'size', 60)), inPattern = rng.next() < 0.5;
    const t = a * n + b + (inPattern ? 0 : rng.int(1, a - 1));
    const answer = inPattern ? `Yes: it is term ${n}` : `No: ${math(`n = ${dec((t - b) / a, 2)}`)} is not a whole number`;
    return {
      body: `A pattern follows ${math(eq)}. Is ${t} a term of the pattern?`,
      answer,
      distractors: distinct(answer, [inPattern ? `No: ${math(`n = ${dec(t / a, 2)}`)} is not a whole number` : `Yes: it is term ${Math.round((t - b) / a)}`, `Yes: every number is a term`, `No: ${t} is not a multiple of ${a}`]),
      solution: `Solve ${math(`${t} = ${lin(a, b)}`)}: ${math(`n = ${new Q(t - b, a).typst()}`)}. ${inPattern ? 'It is a whole number, so it is a term.' : 'Term numbers are whole numbers, so it is not a term.'}`,
    };
  },
});

// ── Linear relations ──────────────────────────────────────────────────────

function linGraph(m: number, b: number, xMax: number, yMax: number, size: number, opts: { dots?: boolean; dashedFrom?: number; xLabel?: string; yLabel?: string } = {}) {
  const step = (v: number) => (v <= 12 ? 2 : v <= 30 ? 5 : v <= 60 ? 10 : 20);
  const curves = opts.dashedFrom !== undefined
    ? [{ f: (x: number) => m * x + b, domain: [0, opts.dashedFrom] as [number, number] }, { f: (x: number) => m * x + b, domain: [opts.dashedFrom, xMax] as [number, number], dashed: true }]
    : [{ f: (x: number) => m * x + b, domain: [0, xMax] as [number, number] }];
  return graphTypst({
    xMin: 0, xMax, yMin: 0, yMax, xStep: step(xMax) / 2, yStep: step(yMax) / 2, xLabelStep: step(xMax), yLabelStep: step(yMax), width: size, height: size * 0.8,
    curves,
    dots: opts.dots ? Array.from({ length: 5 }, (_, i) => ({ x: i * step(xMax) / 2, y: m * i * step(xMax) / 2 + b })).filter((d) => d.y >= 0 && d.y <= yMax) : undefined,
    labels: [...(opts.xLabel ? [{ x: xMax * 0.8, y: yMax * 0.08, text: `"${opts.xLabel}"` }] : []), ...(opts.yLabel ? [{ x: xMax * 0.2, y: yMax * 0.94, text: `"${opts.yLabel}"` }] : [])],
  });
}

export const linGraphTable = mb10f('10f-lin-graph-table', {
  levels: { 1: 'Increasing', 2: 'Decreasing', 3: 'Fractional rate' },
  options: [
    radioOption('form', 'Relation', [['1', 'Increasing'], ['2', 'Decreasing'], ['3', 'Fractional rate']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const m = difficulty === 1 ? rng.int(1, 3) : difficulty === 2 ? -rng.int(1, 2) : rng.pick([0.5, 1.5]);
    const b = difficulty === 2 ? rng.int(8, 10) : rng.int(0, 3);
    const xs = [0, 1, 2, 3, 4], ys = xs.map((x) => m * x + b);
    const g = (mm: number, bb: number) => linGraph(mm, bb, 6, 12, 3.4, { dots: true });
    return {
      body: `Which graph shows the relation in the table?\n\n${table(['$x$', '$y$'], xs, ys.map((y) => dec(y)))}`,
      answer: g(m, b),
      distractors: [g(m * 2, b), g(m, b + 2), g(-m, b + (difficulty === 2 ? 0 : 8))],
      solution: `Plot the points ${xs.map((x, i) => math(`(${x}, ${dec(ys[i])})`)).join(', ')}. They start at ${dec(b)} and change by ${dec(m)} for each step of 1.`,
    };
  },
});

export const linInterpolate = mb10f('10f-lin-interpolate', {
  levels: { 1: 'Interpolate a value', 2: 'Extrapolate a value', 3: 'Find the input for a value' },
  options: [
    radioOption('form', 'Estimate', [['1', 'Interpolate a value'], ['2', 'Extrapolate a value'], ['3', 'Find the input for a value']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const rate = rng.pick([2, 3, 4, 5]), start = rng.pick([0, 5, 10]);
    const drawn = 8, xMax = 12, yMax = Math.ceil((rate * xMax + start) / 10) * 10;
    const graph = linGraph(rate, start, xMax, yMax, 5.5, { dashedFrom: difficulty === 2 ? drawn : undefined, xLabel: 'hours', yLabel: 'earnings' });
    const f = (x: number) => rate * x + start;
    if (difficulty === 3) {
      const x = rng.pick([2, 4, 6, 8, 10]);
      return {
        body: `The graph shows a student's earnings (dollars) against hours worked. How many hours give \\$${f(x)}?\n\n${graph}`,
        answer: `${x} hours`,
        distractors: distinct(`${x} hours`, [`${f(x) / 10} hours`, `${x + 2} hours`, `${Math.round(f(x) / rate)} hours`, `${x - 1} hours`]),
        solution: `Find \\$${f(x)} on the vertical axis, go across to the line, then down: ${x} hours.`,
      };
    }
    const x = difficulty === 1 ? rng.pick([3, 5, 7]) : rng.pick([10, 11, 12]);
    return {
      body: `The graph shows a student's earnings (dollars) against hours worked${difficulty === 2 ? '; the dashed part extends the pattern' : ''}. Estimate the earnings for ${x} hours.\n\n${graph}`,
      answer: `\\$${f(x)}`,
      distractors: distinct(`\\$${f(x)}`, [`\\$${f(x) - rate}`, `\\$${rate * x}`, `\\$${f(x) + 2 * rate}`, `\\$${f(x - 2)}`]),
      solution: `${difficulty === 2 ? 'Extend the line (extrapolate). ' : 'Read between the data (interpolate). '}At ${x} hours the line is at \\$${f(x)}: ${math(`${rate}(${x}) + ${start} = ${f(x)}`).replace(' + 0 ', ' ')}.`,
    };
  },
});

export const linMatch = mb10f('10f-lin-match', {
  levels: { 1: 'Increasing from zero', 2: 'Starting value and a rate', 3: 'Decreasing' },
  options: [
    radioOption('form', 'Graph', [['1', 'Increasing from zero'], ['2', 'Starting value and a rate'], ['3', 'Decreasing']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const rate = rng.pick([1, 2, 3]), start = difficulty === 1 ? 0 : difficulty === 2 ? rng.int(2, 5) : rng.int(9, 11);
    const m = difficulty === 3 ? -rate / 2 : rate;
    const text = difficulty === 1 ? `A hose fills a pool at ${rate} cm of depth per hour, starting empty.`
      : difficulty === 2 ? `A plant is ${start} cm tall and grows ${rate} cm per week.`
        : `A phone battery is at ${start * 10}% and drops ${rate * 5}% per hour.`;
    const g = (mm: number, bb: number) => linGraph(mm, bb, 10, 12, 3.4);
    return {
      body: `${text} Which graph shows the relation?`,
      answer: g(m, start),
      distractors: [g(-m, difficulty === 3 ? 0 : 10), g(m * 2, start), g(m, start === 0 ? 4 : 0)],
      solution: `The graph starts at ${difficulty === 3 ? `${start * 10}% (${start} on the scale)` : start} and ${m > 0 ? 'rises' : 'falls'} at a constant rate.`,
    };
  },
});

export const linDescribe = mb10f('10f-lin-describe', {
  points: 1,
  levels: { 1: 'Increasing from zero', 2: 'Increasing with a start value', 3: 'Decreasing' },
  options: [
    radioOption('form', 'Graph', [['1', 'Increasing from zero'], ['2', 'Increasing with a start value'], ['3', 'Decreasing']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const rate = rng.int(1, 3), start = difficulty === 1 ? 0 : difficulty === 2 ? rng.int(1, 4) : rng.int(8, 11);
    const m = difficulty === 3 ? -rate / 2 : rate;
    const describe = (mm: number, bb: number) => `It starts at ${dec(bb)} and ${mm > 0 ? 'increases' : 'decreases'} by ${dec(Math.abs(mm))} for each increase of 1 in ${math('x')}.`;
    const answer = describe(m, start);
    return {
      body: `Describe the pattern in the graph.\n\n${linGraph(m, start, 10, 12, 4.5, { dots: true })}`,
      answer,
      distractors: distinct(answer, [describe(-m, start), describe(m, start + 1), describe(m * 2, start), describe(1 / m, start)]),
      solution: `The line meets the vertical axis at ${start}. From one grid point to the next, ${math('y')} changes by ${dec(m)} for each 1 in ${math('x')}.`,
    };
  },
});

// ── Linear equations ──────────────────────────────────────────────────────

/** Solve and explain: an equation with integer coefficients built from its solution. */
function eqText(a: number, b: number, c: number, d = 0, rhsX = 0): string {
  const left = polynomial([{ coef: a, powers: [['x', 1]] }, { coef: b }]);
  const right = rhsX ? polynomial([{ coef: rhsX, powers: [['x', 1]] }, { coef: d }]) : String(c);
  return `${left} = ${right}`;
}

export const eqOneTwoStep = mb10f('10f-eq-one-two-step', {
  points: 1,
  levels: { 1: 'ax = b', 2: 'ax + b = c', 3: 'Rational solutions' },
  options: [
    sizeOption([5, 9, 12, 20, 50], [9, 9, 9]),
    radioOption('form', 'Steps', [['one', 'One step (ax = b)'], ['two', 'Two steps (ax + b = c)']], ['one', 'two', 'two']),
    radioOption('solutions', 'Solutions are', [['int', 'Integers'], ['frac', 'Fractions']], ['int', 'int', 'frac']),
  ],
  generate(rng, difficulty, o) {
    const N = optNum(o, 'size', 9);
    const two = optOne(o, 'form', difficulty === 1 ? 'one' : 'two') === 'two';
    const fracSol = optOne(o, 'solutions', difficulty === 3 ? 'frac' : 'int') === 'frac';
    let a = rng.nonZero(-N, N);
    if (fracSol && Math.abs(a) < 2) a = 2 * Math.sign(a);
    let x = new Q(rng.int(-N, N));
    while (fracSol && x.isInt) x = new Q(rng.nonZero(-N, N), Math.abs(a));
    const b = two ? rng.nonZero(-N, N) : 0;
    const c = x.mul(a).add(b);
    const eq = `${polynomial([{ coef: a, powers: [['x', 1]] }, { coef: b }])} = ${c.typst()}`;
    return {
      body: `Solve: ${math(eq)}`,
      answer: math(`x = ${x.typst()}`),
      distractors: distinct(math(`x = ${x.typst()}`), [c.add(b).div(a).typst(), c.sub(b).mul(a).typst(), c.sub(b).div(-a).typst(), c.div(a).typst(), c.sub(a).typst(), new Q(a).div(c.n === 0 ? 1 : c).typst()].map((v) => math(`x = ${v}`))),
      solution: `${b ? `${b > 0 ? 'Subtract' : 'Add'} ${Math.abs(b)}: ${math(`${monomial(a, [['x', 1]])} = ${c.sub(b).typst()}`)}. ` : ''}Divide by ${a}: ${math(`x = ${x.typst()}`)}.`,
    };
  },
});

export const eqBothSides = mb10f('10f-eq-both-sides', {
  levels: { 1: 'ax = b + cx', 2: 'ax + b = cx + d', 3: 'Rational solutions' },
  options: [
    sizeOption([5, 9, 12, 20, 50], [9, 9, 9]),
    radioOption('form', 'Form', [['one', 'ax = b + cx'], ['two', 'ax + b = cx + d']], ['one', 'two', 'two']),
    radioOption('solutions', 'Solutions are', [['int', 'Integers'], ['frac', 'Fractions']], ['int', 'int', 'frac']),
  ],
  generate(rng, difficulty, o) {
    const N = optNum(o, 'size', 9);
    const two = optOne(o, 'form', difficulty === 1 ? 'one' : 'two') === 'two';
    const fracSol = optOne(o, 'solutions', difficulty === 3 ? 'frac' : 'int') === 'frac';
    const a = rng.nonZero(-N, N);
    let c = rng.nonZero(-N, N);
    while (c === a || (fracSol && Math.abs(a - c) < 2)) c = rng.nonZero(-N, N);
    let x = new Q(rng.int(-N, N));
    while (fracSol && x.isInt) x = new Q(rng.nonZero(-N, N), Math.abs(a - c));
    const b = two ? rng.int(-N, N) : 0;
    const oneForm = !two;
    const d = x.mul(a - c).add(b);
    const eq = oneForm
      ? `${monomial(a, [['x', 1]])} = ${d.n === 0 ? monomial(c, [['x', 1]]) : `${d.typst()} ${c < 0 ? '-' : '+'} ${monomial(Math.abs(c), [['x', 1]])}`}`
      : `${polynomial([{ coef: a, powers: [['x', 1]] }, { coef: b }])} = ${d.n === 0 ? monomial(c, [['x', 1]]) : `${monomial(c, [['x', 1]])} ${d.sign < 0 ? '-' : '+'} ${d.abs().typst()}`}`;
    return {
      body: `Solve: ${math(eq)}`,
      answer: math(`x = ${x.typst()}`),
      distractors: distinct(math(`x = ${x.typst()}`), [d.sub(b).div(a + c || 1).typst(), d.add(b).div(a - c).typst(), d.sub(b).div(c - a).typst(), x.add(1).typst()].map((v) => math(`x = ${v}`))),
      solution: `Collect the ${math('x')}-terms on one side: ${math(`${monomial(a - c, [['x', 1]])} = ${d.sub(b).typst()}`)}. Then ${math(`x = ${x.typst()}`)}.`,
    };
  },
});

export const eqBrackets = mb10f('10f-eq-brackets', {
  levels: { 1: 'a(x + b) = c', 2: 'a(bx + c) = d(ex + f)', 3: 'Rational solutions' },
  options: [
    sizeOption([5, 9, 12, 20], [9, 9, 9]),
    radioOption('form', 'Form', [['one', 'a(x + b) = c'], ['two', 'a(bx + c) = d(ex + f)']], ['one', 'two', 'two']),
    radioOption('solutions', 'Solutions are', [['int', 'Integers'], ['frac', 'Fractions']], ['int', 'int', 'frac'], 'Fractions apply to the a(bx + c) = d(ex + f) form.'),
  ],
  generate(rng, difficulty, o) {
    const N = optNum(o, 'size', 9);
    const simple = optOne(o, 'form', difficulty === 1 ? 'one' : 'two') === 'one';
    const fracSol = optOne(o, 'solutions', difficulty === 3 ? 'frac' : 'int') === 'frac';
    if (simple) {
      const a = rng.nonZero(-Math.min(N, 6), Math.min(N, 6)), b = rng.nonZero(-N, N), x = rng.int(-N, N);
      const c = a * (x + b);
      return {
        body: `Solve: ${math(`${a === -1 ? '-' : a}(${polynomial([{ coef: 1, powers: [['x', 1]] }, { coef: b }])}) = ${c}`)}`,
        answer: math(`x = ${x}`),
        distractors: distinct(math(`x = ${x}`), [String(c / a + b), String(c - a * b), String((c - b) / a), String(-x)].map((v) => math(`x = ${dec(Number(v), 2)}`))),
        solution: `Divide by ${a}: ${math(`${polynomial([{ coef: 1, powers: [['x', 1]] }, { coef: b }])} = ${c / a}`)}. So ${math(`x = ${x}`)}. (Or distribute first.)`,
      };
    }
    for (;;) {
      const M = Math.min(N, 5);
      const a = rng.nonZero(-M, M), p = rng.nonZero(-4, 4), q = rng.nonZero(-N, N), d = rng.nonZero(-M, M), r = rng.nonZero(-4, 4);
      const k = a * p - d * r;
      if (k === 0) continue;
      const x = fracSol ? new Q(rng.nonZero(-N, N), Math.abs(k) > 1 ? Math.abs(k) : 2) : new Q(rng.int(-N, N));
      // a(px + q) = d(rx + s): s from the solution.
      const sd = x.mul(k).add(a * q); // d·s
      if (!sd.div(d).isInt) continue;
      const s = sd.div(d).n;
      const side = (m: number, u: number, v: number) => `${m === -1 ? '-' : m === 1 ? '' : m}(${polynomial([{ coef: u, powers: [['x', 1]] }, { coef: v }])})`;
      return {
        body: `Solve: ${math(`${side(a, p, q)} = ${side(d, r, s)}`)}`,
        answer: math(`x = ${x.typst()}`),
        distractors: distinct(math(`x = ${x.typst()}`), [safeQ(d * s - q, a * p - r).typst(), safeQ(d * s - a * q, a * p + d * r).typst(), x.neg().typst(), safeQ(s - q, p - r).typst()].map((v) => math(`x = ${v}`))),
        solution: `Distribute: ${math(`${polynomial([{ coef: a * p, powers: [['x', 1]] }, { coef: a * q }])} = ${polynomial([{ coef: d * r, powers: [['x', 1]] }, { coef: d * s }])}`)}. Collect terms: ${math(`${monomial(k, [['x', 1]])} = ${d * s - a * q}`)}, so ${math(`x = ${x.typst()}`)}.`,
      };
    }
  },
});

export const eqRational = mb10f('10f-eq-rational', {
  levels: { 1: 'Decimal coefficients', 2: 'Fraction coefficients', 3: 'Fractions on both sides' },
  options: [
    radioOption('form', 'Numbers', [['1', 'Decimal coefficients'], ['2', 'Fraction coefficients'], ['3', 'Fractions on both sides']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    if (difficulty === 1) {
      const a = rng.nonZero(-9, 9) / 10 || 0.5, b = rng.nonZero(-50, 50) / 10, x = rng.int(-10, 10);
      const c = Math.round((a * x + b) * 100) / 100;
      return {
        body: `Solve: ${math(`${dec(a)}x ${b < 0 ? '-' : '+'} ${dec(Math.abs(b))} = ${dec(c)}`)}`,
        answer: math(`x = ${x}`),
        distractors: distinct(math(`x = ${x}`), [dec((c + b) / a, 2), dec((c - b) * a, 2), dec(-x, 2), dec((c - b) / a / 10, 2)].map((v) => math(`x = ${v}`))),
        solution: `${b < 0 ? 'Add' : 'Subtract'} ${dec(Math.abs(b))}: ${math(`${dec(a)}x = ${dec(c - b, 2)}`)}. Divide by ${dec(a)}: ${math(`x = ${x}`)}.`,
      };
    }
    const a = new Q(rng.nonZero(-5, 5), rng.int(2, 5)), b = new Q(rng.nonZero(-5, 5), rng.int(2, 6)), x = new Q(rng.int(-9, 9) || 3);
    if (difficulty === 2) {
      const c = a.mul(x).add(b);
      return {
        body: `Solve: ${math(`${qx(a)} ${b.sign < 0 ? '-' : '+'} ${b.abs().typst()} = ${c.typst()}`)}`,
        answer: math(`x = ${x.typst()}`),
        distractors: distinct(math(`x = ${x.typst()}`), [c.add(b).div(a).typst(), c.sub(b).mul(a).typst(), c.sub(b).div(a.neg()).typst(), x.add(1).typst()].map((v) => math(`x = ${v}`))),
        solution: `Multiply every term by the lowest common denominator to clear the fractions, or isolate directly: ${math(`${qx(a)} = ${c.sub(b).typst()}`)}, so ${math(`x = ${c.sub(b).typst()} div ${a.paren()} = ${x.typst()}`)}.`,
      };
    }
    let cq = new Q(rng.nonZero(-5, 5), rng.int(2, 4));
    while (cq.eq(a) || cq.n === 0) cq = cq.add(1);
    const d = a.sub(cq).mul(x).add(b);
    return {
      body: `Solve: ${math(`${qx(a)} ${b.sign < 0 ? '-' : '+'} ${b.abs().typst()} = ${qx(cq)} ${d.sign < 0 ? '-' : '+'} ${d.abs().typst()}`)}`,
      answer: math(`x = ${x.typst()}`),
      distractors: distinct(math(`x = ${x.typst()}`), [(a.add(cq).n === 0 ? d.sub(b).add(1) : d.sub(b).div(a.add(cq))).typst(), d.add(b).div(a.sub(cq)).typst(), x.neg().typst(), d.sub(b).typst()].map((v) => math(`x = ${v}`))),
      solution: `Collect terms: ${math(`${qx(a.sub(cq))} = ${d.sub(b).typst()}`)}. Divide: ${math(`x = ${x.typst()}`)}.`,
    };
  },
});

export const eqVariableDenominator = mb10f('10f-eq-variable-denominator', {
  points: 1,
  levels: { 1: 'a/x = b, whole-number answers', 2: 'Fractional answers', 3: 'a/x + c = d' },
  options: [
    radioOption('form', 'Equation', [['1', 'a/x = b, whole-number answers'], ['2', 'Fractional answers'], ['3', 'a/x + c = d']], ['1', '2', '3']),
    sizeOption([5, 9, 12], [9, 9, 9], 'Size of numbers'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const b = rng.nonZero(-optNum(o, 'size', 9), optNum(o, 'size', 9));
    const x = difficulty === 1 ? new Q(rng.nonZero(-optNum(o, 'size', 9), optNum(o, 'size', 9))) : new Q(rng.nonZero(-optNum(o, 'size', 9), optNum(o, 'size', 9)), rng.int(2, 5));
    const a = x.mul(b);
    const c = difficulty === 3 ? rng.nonZero(-optNum(o, 'size', 9), optNum(o, 'size', 9)) : 0;
    const eq = `${a.isInt ? a.n : `(${a.typst()})`}/x${c ? ` ${c < 0 ? '-' : '+'} ${Math.abs(c)}` : ''} = ${b + c}`;
    return {
      body: `Solve: ${math(eq)}, ${math('x != 0')}`,
      answer: math(`x = ${x.typst()}`),
      distractors: distinct(math(`x = ${x.typst()}`), [a.mul(b).typst(), new Q(b).div(a).typst(), x.neg().typst(), a.div(b + c || 1).typst()].map((v) => math(`x = ${v}`))),
      solution: `${c ? `${c < 0 ? 'Add' : 'Subtract'} ${Math.abs(c)}: ${math(`${a.typst()}/x = ${b}`)}. ` : ''}Multiply both sides by ${math('x')}: ${math(`${a.typst()} = ${monomial(b, [['x', 1]])}`)}, so ${math(`x = ${x.typst()}`)}.`,
    };
  },
});

export const eqVerify = mb10f('10f-eq-verify', {
  points: 1,
  levels: { 1: 'Two-step equations', 2: 'Variables on both sides', 3: 'Fractional values' },
  options: [
    radioOption('form', 'Equation', [['1', 'Two-step equations'], ['2', 'Variables on both sides'], ['3', 'Fractional values']], ['1', '2', '3']),
    sizeOption([4, 6, 9], [6, 6, 6], 'Size of numbers'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const N = optNum(o, 'size', 6);
    const a = rng.nonZero(-N, N), b = rng.int(-9, 9), c = difficulty > 1 ? rng.nonZero(-N, N) : 0;
    if (a === c) return eqVerify.generate(rng, difficulty, o);
    const x = difficulty === 3 ? new Q(rng.nonZero(-N - 1, N + 1), 2) : new Q(rng.int(-N, N));
    const d = x.mul(a - c).add(b);
    const test = rng.next() < 0.5 ? x : x.add(difficulty === 3 ? new Q(1, 2) : 1);
    const L = test.mul(a).add(b), R = test.mul(c).add(d);
    const eq = `${polynomial([{ coef: a, powers: [['x', 1]] }, { coef: b }])} = ${c ? `${monomial(c, [['x', 1]])} ${d.sign < 0 ? '-' : '+'} ${d.abs().typst()}` : d.typst()}`;
    const ok = L.eq(R);
    const answer = ok ? `Yes: both sides equal ${math(L.typst())}` : `No: the left side is ${math(L.typst())} and the right side is ${math(R.typst())}`;
    return {
      body: `Is ${math(`x = ${test.typst()}`)} a solution of ${math(eq)}?`,
      answer,
      distractors: distinct(answer, [ok ? `No: the left side is ${math(L.typst())} and the right side is ${math(L.add(1).typst())}` : `Yes: both sides equal ${math(L.typst())}`, `Yes: both sides equal ${math(R.add(2).typst())}`, `No: the left side is ${math(R.typst())} and the right side is ${math(L.typst())}`.replace(/^No: the left side is (.*) and the right side is \1$/, 'No: a solution must be a whole number')]),
      solution: `Substitute ${math(`x = ${test.typst()}`)}: the left side is ${math(L.typst())} and the right side is ${math(R.typst())}. ${ok ? 'They are equal, so it is a solution.' : 'They differ, so it is not a solution.'}`,
    };
  },
});

export const eqError = mb10f('10f-eq-error', {
  levels: { 1: 'Sign error when moving a term', 2: 'Dividing only part of a side', 3: 'Distributing a negative' },
  options: [
    radioOption('form', 'Error', [['1', 'Sign error when moving a term'], ['2', 'Dividing only part of a side'], ['3', 'Distributing a negative']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const a = rng.int(2, 6), b = rng.int(2, 9), x = rng.int(-5, 8);
    let eq: string, steps: string[], right: string;
    if (difficulty === 1) {
      const c = a * x + b;
      eq = `${a}x + ${b} = ${c}`; steps = [`${a}x = ${c + b}`, `x = ${dec((c + b) / a, 2)}`]; right = String(x);
    } else if (difficulty === 2) {
      const c = a * x + b;
      eq = `${a}x + ${b} = ${c}`; steps = [`x + ${b} = ${dec(c / a, 2)}`, `x = ${dec(c / a - b, 2)}`]; right = String(x);
    } else {
      const c = rng.int(2, 5), d = -a * (x - c);
      eq = `-${a}(x - ${c}) = ${d}`; steps = [`-${a}x - ${a * c} = ${d}`, `-${a}x = ${d + a * c}`, `x = ${dec((d + a * c) / -a, 2)}`]; right = String(x);
    }
    const wrong = steps[steps.length - 1].replace('x = ', '');
    return {
      body: `A student solved ${math(eq)} like this: ${steps.map((s) => math(s)).join(', then ')}. What is the correct solution?`,
      answer: math(`x = ${right}`),
      distractors: distinct(math(`x = ${right}`), [`x = ${wrong}`, `x = ${-Number(right)}`, `x = ${Number(right) + 1}`, `x = ${Number(right) - 2}`].map(math)),
      solution: difficulty === 1 ? `Subtract ${b} from both sides (not add): ${math(`${a}x = ${a * x}`)}, so ${math(`x = ${x}`)}.` : difficulty === 2 ? `Dividing by ${a} must divide every term, including ${b}. Subtract ${b} first: ${math(`${a}x = ${a * x}`)}, so ${math(`x = ${x}`)}.` : `Distributing a negative changes both signs: the first step should be ${math(steps[0].replace(/- (\d+) =/, '+ $1 ='))}. Solving from there gives ${math(`x = ${x}`)}.`,
    };
  },
});

export const eqProblem = mb10f('10f-eq-problem', {
  levels: { 1: 'Cost problems', 2: 'Perimeter problems', 3: 'Consecutive numbers' },
  options: [
    radioOption('form', 'Context', [['1', 'Cost problems'], ['2', 'Perimeter problems'], ['3', 'Consecutive numbers']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    if (difficulty === 1) {
      const fee = rng.pick([12, 15, 20]), per = rng.pick([3, 4, 6, 8]), n = rng.int(4, 20);
      const total = fee + per * n;
      return {
        body: `A bowling alley charges \\$${fee} for shoes plus \\$${per} per game. Sam paid \\$${total}. Write and solve an equation to find how many games Sam played.`,
        answer: `${math(`${per}g + ${fee} = ${total}`)}, so ${n} games`,
        distractors: [`${math(`${fee}g + ${per} = ${total}`)}, so ${dec((total - per) / fee, 2)} games`, `${math(`${per}g - ${fee} = ${total}`)}, so ${(total + fee) / per} games`, `${math(`${per}g + ${fee} = ${total}`)}, so ${n + 1} games`],
        solution: `${math(`${per}g + ${fee} = ${total}`)} gives ${math(`${per}g = ${total - fee}`)}, so ${math(`g = ${n}`)}.`,
      };
    }
    if (difficulty === 2) {
      const w = rng.int(3, 20), k = rng.int(2, 9), P = 2 * (w + w + k);
      return {
        body: `A rectangle's length is ${k} cm more than its width, and its perimeter is ${P} cm. Find the width.`,
        answer: `${w} cm`,
        distractors: distinct(`${w} cm`, [`${w + k} cm`, `${(P - k) / 2} cm`, `${P / 4} cm`]),
        solution: `${math(`2w + 2(w + ${k}) = ${P}`)}, so ${math(`4w + ${2 * k} = ${P}`)} and ${math(`w = ${w}`)}. The length is ${w + k} cm.`,
      };
    }
    const n = rng.int(-10, 40), count = rng.pick([2, 3]);
    const sum = count === 2 ? 2 * n + 1 : 3 * n + 3;
    const list = Array.from({ length: count }, (_, i) => n + i).join(', ');
    return {
      body: `The sum of ${count} consecutive integers is ${sum}. What are they?`,
      answer: list,
      distractors: distinct(list, [Array.from({ length: count }, (_, i) => n + 1 + i).join(', '), Array.from({ length: count }, (_, i) => n - 1 + i).join(', '), Array.from({ length: count }, (_, i) => n + 2 * i).join(', ')]),
      solution: `${math(count === 2 ? `n + (n + 1) = ${sum}` : `n + (n + 1) + (n + 2) = ${sum}`)}, so ${math(`${count}n + ${count === 2 ? 1 : 3} = ${sum}`)} and ${math(`n = ${n}`)}: ${list}.`,
    };
  },
});

// ── Linear inequalities ───────────────────────────────────────────────────

const TRANSLATE: Array<[string, string]> = [['at least', '>='], ['no less than', '>='], ['at most', '<='], ['no more than', '<='], ['more than', '>'], ['greater than', '>'], ['less than', '<'], ['fewer than', '<']];
const flip = (op: string) => ({ '<': '>', '>': '<', '<=': '>=', '>=': '<=' } as Record<string, string>)[op];
const strict = (op: string) => ({ '<': '<=', '<=': '<', '>': '>=', '>=': '>' } as Record<string, string>)[op];
const holds = (l: number, op: string, r: number) => (op === '<' ? l < r : op === '<=' ? l <= r : op === '>' ? l > r : l >= r);

export const ineqTranslate = mb10f('10f-ineq-translate', {
  points: 1,
  levels: { 1: 'Direct phrases', 2: 'Phrases like "no more than"', 3: 'In a context' },
  options: [
    radioOption('form', 'Statement', [['1', 'Direct phrases'], ['2', 'Phrases like "no more than"'], ['3', 'In a context']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const pool = difficulty === 1 ? TRANSLATE.filter(([p]) => !p.startsWith('no')) : TRANSLATE;
    const [phrase, op] = rng.pick(pool);
    const k = rng.int(5, 80);
    if (difficulty === 3) {
      const ctx = rng.pick([['You must be', 'years old to drive', 'a'], ['A ride holds', 'people', 'p'], ['A bag can hold', 'kg', 'm']]);
      return {
        body: `Write an inequality: "${ctx[0]} ${phrase} ${k} ${ctx[1]}."`,
        answer: math(`${ctx[2]} ${op} ${k}`),
        distractors: [flip(op), strict(op), flip(strict(op))].map((o) => math(`${ctx[2]} ${o} ${k}`)),
        solution: `"${phrase[0].toUpperCase()}${phrase.slice(1)}" means ${math(op)}: ${math(`${ctx[2]} ${op} ${k}`)}.`,
      };
    }
    return {
      body: `Write an inequality for "a number ${math('x')} is ${phrase} ${k}".`,
      answer: math(`x ${op} ${k}`),
      distractors: [flip(op), strict(op), flip(strict(op))].map((o) => math(`x ${o} ${k}`)),
      solution: `"${phrase}" means ${math(op)}, so ${math(`x ${op} ${k}`)}.`,
    };
  },
});

export const ineqCheck = mb10f('10f-ineq-check', {
  points: 1,
  levels: { 1: 'Integers', 2: 'A value on the boundary', 3: 'Fractions and decimals' },
  options: [
    radioOption('form', 'Value', [['1', 'Integers'], ['2', 'A value on the boundary'], ['3', 'Fractions and decimals']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const a = rng.nonZero(-5, 5), b = rng.int(-9, 9), op = rng.pick(['<', '<=', '>', '>=']);
    const boundary = new Q(rng.int(-6, 6));
    const c = boundary.mul(a).add(b);
    const x = difficulty === 2 ? boundary : difficulty === 3 ? new Q(rng.nonZero(-13, 13), 2) : new Q(rng.int(-8, 8));
    const L = x.mul(a).add(b);
    const ok = holds(L.value, op, c.value);
    const answer = ok ? 'Yes' : 'No';
    return {
      body: `Is ${math(`x = ${difficulty === 3 && rng.next() < 0.5 ? dec(x.value, 2) : x.typst()}`)} a solution of ${math(`${polynomial([{ coef: a, powers: [['x', 1]] }, { coef: b }])} ${op} ${c.typst()}`)}?`,
      answer: `${answer}: ${math(`${L.typst()} ${op} ${c.typst()}`)} is ${ok ? 'true' : 'false'}`,
      distractors: [`${ok ? 'No' : 'Yes'}: ${math(`${L.typst()} ${op} ${c.typst()}`)} is ${ok ? 'false' : 'true'}`, `${ok ? 'No' : 'Yes'}: a boundary value is ${op.includes('=') ? 'never' : 'always'} included`, `${ok ? 'No' : 'Yes'}: ${math(`${x.typst()} ${op} ${c.typst()}`)}`],
      solution: `Substitute: the left side is ${math(L.typst())}. ${math(`${L.typst()} ${op} ${c.typst()}`)} is ${ok ? 'true' : 'false'}.`,
    };
  },
});

function solveIneq(rng: Rng, negative: boolean, rational: boolean, N = 8) {
  const a = negative ? -rng.int(2, 6) : rng.int(2, 6);
  const k = rational ? new Q(rng.nonZero(-N - 1, N + 1), rng.int(2, 3)) : new Q(rng.int(-N, N));
  const b = rng.int(-10, 10);
  const op = rng.pick(['<', '<=', '>', '>=']);
  const c = k.mul(a).add(b);
  const result = negative ? flip(op) : op;
  return { a, b, c, op, k, result, text: `${polynomial([{ coef: a, powers: [['x', 1]] }, { coef: b }])} ${op} ${c.typst()}` };
}

export const ineqSolve = mb10f('10f-ineq-solve', {
  points: 1,
  levels: { 1: 'One step', 2: 'Two steps', 3: 'Fractional boundaries' },
  options: [
    radioOption('form', 'Steps', [['1', 'One step'], ['2', 'Two steps'], ['3', 'Fractional boundaries']], ['1', '2', '3']),
    sizeOption([4, 8, 12], [8, 8, 8], 'Size of the boundary'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const s = solveIneq(rng, false, difficulty === 3, optNum(o, 'size', 8));
    const b = difficulty === 1 ? 0 : s.b;
    const c = s.k.mul(s.a).add(b);
    const text = `${polynomial([{ coef: s.a, powers: [['x', 1]] }, { coef: b }])} ${s.op} ${c.typst()}`;
    const answer = `x ${s.op} ${s.k.typst()}`;
    return {
      body: `Solve: ${math(text)}`,
      answer: math(answer),
      distractors: distinct(math(answer), [`x ${flip(s.op)} ${s.k.typst()}`, `x ${s.op} ${c.add(b).div(s.a).typst()}`, `x ${strict(s.op)} ${s.k.typst()}`, `x ${s.op} ${c.sub(b).typst()}`].map(math)),
      solution: `${b ? `${b > 0 ? 'Subtract' : 'Add'} ${Math.abs(b)}: ${math(`${s.a}x ${s.op} ${c.sub(b).typst()}`)}. ` : ''}Divide by ${s.a} (positive, so the sign stays): ${math(answer)}.`,
    };
  },
});

export const ineqReverse = mb10f('10f-ineq-reverse', {
  points: 1,
  levels: { 1: 'Divide by a negative', 2: 'Two steps with a negative coefficient', 3: 'Variables on both sides' },
  options: [
    radioOption('form', 'Inequality', [['1', 'Divide by a negative'], ['2', 'Two steps with a negative coefficient'], ['3', 'Variables on both sides']], ['1', '2', '3']),
    sizeOption([4, 8, 12], [8, 8, 8], 'Size of the boundary'),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const s = solveIneq(rng, true, false, optNum(o, 'size', 8));
    if (difficulty === 3) {
      const c2 = rng.int(1, 4), a2 = s.a - c2 === 0 ? s.a - 1 : s.a;
      const k = s.k, rhsConst = k.mul(a2 - c2).add(s.b);
      const result = a2 - c2 < 0 ? flip(s.op) : s.op;
      const text = `${polynomial([{ coef: a2, powers: [['x', 1]] }, { coef: s.b }])} ${s.op} ${monomial(c2, [['x', 1]])} ${rhsConst.sign < 0 ? '-' : '+'} ${rhsConst.abs().typst()}`;
      return {
        body: `Solve: ${math(text)}`,
        answer: math(`x ${result} ${k.typst()}`),
        distractors: distinct(math(`x ${result} ${k.typst()}`), [`x ${flip(result)} ${k.typst()}`, `x ${result} ${k.neg().typst()}`, `x ${strict(result)} ${k.typst()}`].map(math)),
        solution: `Collect terms: ${math(`${monomial(a2 - c2, [['x', 1]])} ${s.op} ${rhsConst.sub(s.b).typst()}`)}. Divide by ${a2 - c2}${a2 - c2 < 0 ? ' and reverse the sign' : ''}: ${math(`x ${result} ${k.typst()}`)}.`,
      };
    }
    const b = difficulty === 1 ? 0 : s.b;
    const c = s.k.mul(s.a).add(b);
    const text = `${polynomial([{ coef: s.a, powers: [['x', 1]] }, { coef: b }])} ${s.op} ${c.typst()}`;
    const answer = `x ${s.result} ${s.k.typst()}`;
    return {
      body: `Solve: ${math(text)}`,
      answer: math(answer),
      distractors: distinct(math(answer), [`x ${s.op} ${s.k.typst()}`, `x ${s.result} ${s.k.neg().typst()}`, `x ${strict(s.result)} ${s.k.typst()}`, `x ${s.op} ${s.k.neg().typst()}`].map(math)),
      solution: `${b ? `${b > 0 ? 'Subtract' : 'Add'} ${Math.abs(b)}: ${math(`${s.a}x ${s.op} ${c.sub(b).typst()}`)}. ` : ''}Dividing by ${s.a}, a negative number, reverses the inequality: ${math(answer)}.`,
    };
  },
});

const rayLine = (k: number, op: string, from: number, to: number) => numberLine({ from, to, width: 6.5, ray: { at: k, dir: op.startsWith('>') ? 'right' : 'left', open: !op.includes('=') } });

export const ineqGraph = mb10f('10f-ineq-graph', {
  levels: { 1: 'x > a or x < a', 2: 'Inclusive inequalities', 3: 'Solve first, then graph' },
  options: [
    radioOption('form', 'Inequality', [['1', 'x > a or x < a'], ['2', 'Inclusive inequalities'], ['3', 'Solve first, then graph']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const k = rng.int(-4, 4), op = difficulty === 1 ? rng.pick(['<', '>']) : rng.pick(['<', '<=', '>', '>=']);
    const from = k - 5, to = k + 5;
    let text = `x ${op} ${k}`;
    if (difficulty === 3) {
      const a = rng.nonZero(-4, 4), b = rng.int(-6, 6);
      const opIn = a < 0 ? flip(op) : op;
      text = `${polynomial([{ coef: a, powers: [['x', 1]] }, { coef: b }])} ${opIn} ${a * k + b}`;
    }
    return {
      body: `Which number line shows the solution of ${math(text)}?`,
      answer: rayLine(k, op, from, to),
      distractors: [rayLine(k, flip(op), from, to), rayLine(k, strict(op), from, to), rayLine(k + (k < 0 ? 2 : -2), op, from, to)],
      solution: `${difficulty === 3 ? `Solve: ${math(`x ${op} ${k}`)}. ` : ''}Use ${op.includes('=') ? 'a closed (filled) dot, since ' + k + ' is included' : 'an open dot, since ' + k + ' is not included'}, and shade to the ${op.startsWith('>') ? 'right' : 'left'}.`,
    };
  },
});

export const ineqFromGraph = mb10f('10f-ineq-from-graph', {
  points: 1,
  levels: { 1: 'Open dots', 2: 'Open or closed dots', 3: 'Fractional boundary' },
  options: [
    radioOption('form', 'Boundary', [['1', 'Open dots'], ['2', 'Open or closed dots'], ['3', 'Fractional boundary']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    const k = difficulty === 3 ? rng.nonZero(-7, 7) / 2 : rng.int(-5, 5);
    const op = difficulty === 1 ? rng.pick(['<', '>']) : rng.pick(['<', '<=', '>', '>=']);
    const kt = difficulty === 3 ? new Q(Math.round(k * 2), 2).typst() : String(k);
    const line = numberLine({ from: Math.floor(k) - 4, to: Math.floor(k) + 5, step: difficulty === 3 ? 0.5 : 1, labelEvery: difficulty === 3 ? 2 : 1, width: 9, ray: { at: k, dir: op.startsWith('>') ? 'right' : 'left', open: !op.includes('=') } });
    return {
      body: `Write the inequality shown.\n\n${line}`,
      answer: math(`x ${op} ${kt}`),
      distractors: [flip(op), strict(op), flip(strict(op))].map((o) => math(`x ${o} ${kt}`)),
      solution: `The dot at ${math(kt)} is ${op.includes('=') ? 'closed, so it is included' : 'open, so it is not included'}, and the ray points ${op.startsWith('>') ? 'right (greater)' : 'left (less)'}: ${math(`x ${op} ${kt}`)}.`,
    };
  },
});

export const ineqProblem = mb10f('10f-ineq-problem', {
  levels: { 1: 'A budget', 2: 'A minimum score', 3: 'Comparing two plans' },
  options: [
    radioOption('form', 'Context', [['1', 'A budget'], ['2', 'A minimum score'], ['3', 'Comparing two plans']], ['1', '2', '3']),
  ],
  generate(rng, gl, o) {
    const difficulty = optNum(o, 'form', gl) as 1 | 2 | 3;
    if (difficulty === 1) {
      const price = rng.pick([6, 8, 12, 15]), budget = price * rng.int(4, 12) + rng.int(1, price - 1);
      const n = Math.floor(budget / price);
      return {
        body: `Movie tickets cost \\$${price}. You have \\$${budget}. Write and solve an inequality for the number of tickets ${math('t')} you can buy.`,
        answer: `${math(`${price}t <= ${budget}`)}, so at most ${n} tickets`,
        distractors: [`${math(`${price}t >= ${budget}`)}, so at least ${n + 1} tickets`, `${math(`${price}t <= ${budget}`)}, so at most ${n + 1} tickets`, `${math(`t + ${price} <= ${budget}`)}, so at most ${budget - price} tickets`],
        solution: `${math(`${price}t <= ${budget}`)} gives ${math(`t <= ${dec(budget / price, 2)}`)}. Tickets are whole, so at most ${n}.`,
      };
    }
    if (difficulty === 2) {
      const tests = rng.int(3, 4), scores = Array.from({ length: tests }, () => rng.int(60, 90)), target = rng.pick([75, 80]);
      const need = target * (tests + 1) - scores.reduce((x, y) => x + y, 0);
      const answer = need <= 0 ? 'Any score keeps the average at or above ' + target : `At least ${need}%`;
      return {
        body: `Your test scores are ${scores.join(', ')}. What score on the next test gives an average of at least ${target}%?`,
        answer,
        distractors: distinct(answer, [`At least ${target}%`, `At most ${need}%`, `At least ${need + tests}%`, `At least ${Math.max(0, need - 5)}%`]),
        solution: `${math(`(${scores.join(' + ')} + s)/${tests + 1} >= ${target}`)}, so ${math(`s >= ${target * (tests + 1)} - ${scores.reduce((x, y) => x + y, 0)} = ${need}`)}.`,
      };
    }
    const f1 = rng.pick([20, 25, 30]), r1 = rng.pick([0.1, 0.15]), f2 = f1 + rng.pick([10, 15, 20]), r2 = r1 / 2;
    const m = (f2 - f1) / (r1 - r2);
    return {
      body: `Plan A costs \\$${f1} plus \\$${r1.toFixed(2)} per minute. Plan B costs \\$${f2} plus \\$${r2.toFixed(3).replace(/0$/, '')} per minute. For how many minutes is Plan B cheaper?`,
      answer: `More than ${dec(m)} minutes`,
      distractors: distinct(`More than ${dec(m)} minutes`, [`Fewer than ${dec(m)} minutes`, `More than ${dec((f2 + f1) / (r1 + r2))} minutes`, `More than ${dec(f2 / r2)} minutes`]),
      solution: `${math(`${f2} + ${dec(r2, 3)}m < ${f1} + ${dec(r1)}m`)} gives ${math(`${f2 - f1} < ${dec(r1 - r2, 3)}m`)}, so ${math(`m > ${dec(m)}`)}.`,
    };
  },
});

export const PATTERNS_10F = [
  patFigures, patTable, patContext, patSolve, linGraphTable, linInterpolate, linMatch, linDescribe,
  eqOneTwoStep, eqBothSides, eqBrackets, eqRational, eqVariableDenominator, eqVerify, eqError, eqProblem,
  ineqTranslate, ineqCheck, ineqSolve, ineqReverse, ineqGraph, ineqFromGraph, ineqProblem,
];
