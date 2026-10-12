// Statistics (Pre-Algebra and Algebra 1), after Kuta's ReadingBarGraph,
// ReadingLineGraph, ReadingDotPlot, ReadingFrequencyTable, StemLeafPlot,
// ReadingStemAndLeafPlot, CenterAndSpread (mean … population standard
// deviation, given a list, table, dot plot, or stem-and-leaf plot),
// Correlation, and ApplyingStatModels.
import { graphTypst, type Pt } from '../../graph.ts';
import { manyOption, optList, optOn, optOne, radioOption, toggleOption } from '../../options.ts';
import { us, math, wrong, decimal, fixed, NAMES, money } from './common.ts';

// ── Displays ─────────────────────────────────────────────────────────────────

const CATEGORY_SETS: Array<{ title: string; unit: string; names: string[] }> = [
  { title: 'Favourite fruit', unit: 'students', names: ['Apple', 'Banana', 'Grape', 'Orange', 'Pear'] },
  { title: 'Books read', unit: 'books', names: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] },
  { title: 'Pets owned', unit: 'students', names: ['Dog', 'Cat', 'Fish', 'Bird', 'None'] },
  { title: 'Cars sold', unit: 'cars', names: ['Jan', 'Feb', 'Mar', 'Apr', 'May'] },
];

/** A bar graph (or a line graph) of category values, with the categories under the bars. */
function barGraph(names: string[], values: number[], line: boolean): string {
  const max = Math.ceil(Math.max(...values) / 5) * 5 + 5;
  const step = max > 30 ? 5 : max > 15 ? 2 : 1;
  const curves: Array<{ points: Pt[] }> = line
    ? [{ points: values.map((v, i) => [i + 1, v] as Pt) }]
    : values.map((v, i) => ({ points: [[i + 0.65, 0], [i + 0.65, v], [i + 1.35, v], [i + 1.35, 0]] as Pt[] }));
  return graphTypst({
    xMin: 0, xMax: names.length + 1, yMin: 0, yMax: max, width: 7, height: 4.5, yStep: step, xStep: 1,
    xTicks: names.map((n, i) => [i + 1, `"${n}"`] as [number, string]),
    curves, ...(line ? { dots: values.map((v, i) => ({ x: i + 1, y: v })) } : {}),
  });
}

function frequencyTable(header: [string, string], names: string[], values: number[]): string {
  return `#table(columns: 2, align: center, inset: 5pt, [*${header[0]}*], [*${header[1]}*], ${names.map((n, i) => `[${n}], [${values[i]}]`).join(', ')})`;
}

/** A dot plot: a stack of dots above each value. */
function dotPlot(data: number[]): string {
  const lo = Math.min(...data), hi = Math.max(...data);
  const counts = new Map<number, number>();
  for (const d of data) counts.set(d, (counts.get(d) ?? 0) + 1);
  const top = Math.max(...counts.values());
  return graphTypst({
    xMin: lo - 1, xMax: hi + 1, yMin: -0.2, yMax: top + 0.8, width: Math.min(9, (hi - lo + 2) * 0.6 + 1), height: (top + 1) * 0.45 + 0.4,
    grid: false, yLabelStep: 1000, xLabelStep: 1,
    dots: [...counts].flatMap(([x, n]) => Array.from({ length: n }, (_, k) => ({ x, y: k + 0.5 }))),
  });
}

export const stReadDisplay = us('st-read-display', {
  levels: { 1: 'Read one value', 2: 'Compare two values', 3: 'Totals and fractions of the whole' },
  options: [manyOption('displays', 'Displays', [['bar', 'Bar graphs'], ['line', 'Line graphs'], ['table', 'Frequency tables']], [['bar', 'table'], ['bar', 'line', 'table'], ['bar', 'line', 'table']])],
  generate(rng, level, o) {
    const set = rng.pick(CATEGORY_SETS);
    const display = rng.pick(optList(o, 'displays', ['bar']));
    const values = set.names.map(() => rng.int(2, display === 'table' ? 40 : 20));
    const shown = display === 'table' ? frequencyTable(['Category', 'Frequency'], set.names, values) : barGraph(set.names, values, display === 'line');
    const i = rng.int(0, 4);
    let j = rng.int(0, 4); while (j === i || values[j] === values[i]) j = (j + 1) % 5;
    const total = values.reduce((a, b) => a + b, 0);
    let q: string, ans: number, wrongs: number[];
    if (level === 1) { q = `How many ${set.unit} are shown for ${set.names[i]}?`; ans = values[i]; wrongs = [values[j], values[i] + 1, values[i] - 1]; }
    else if (level === 2) { q = `How many more ${set.unit} are shown for ${values[i] > values[j] ? set.names[i] : set.names[j]} than for ${values[i] > values[j] ? set.names[j] : set.names[i]}?`; ans = Math.abs(values[i] - values[j]); wrongs = [values[i] + values[j], Math.max(values[i], values[j]), ans + 1]; }
    else { q = `How many ${set.unit} are shown in total?`; ans = total; wrongs = [total - values[i], total + values[j], Math.max(...values) * 5]; }
    return {
      body: `${set.title}\n\n${shown}\n\n${q}`,
      answer: math(String(ans)),
      distractors: wrong(math(String(ans)), wrongs.map((w) => math(String(w)))),
      solution: level === 1 ? `Read the value for ${set.names[i]}: ${ans}.` : level === 2 ? `Subtract the two values: ${math(`${Math.max(values[i], values[j])} - ${Math.min(values[i], values[j])} = ${ans}`)}.` : `Add every value: ${math(`${values.join(' + ')} = ${total}`)}.`,
    };
  },
});

/** A stem-and-leaf plot as a table: stems with their sorted leaves, and a key. */
function stemLeaf(data: number[]): string {
  const sorted = [...data].sort((a, b) => a - b);
  const stems = new Map<number, number[]>();
  for (let s = Math.floor(sorted[0] / 10); s <= Math.floor(sorted[sorted.length - 1] / 10); s++) stems.set(s, []);
  for (const d of sorted) stems.get(Math.floor(d / 10))!.push(d % 10);
  const s0 = sorted[0];
  return `#table(columns: 2, stroke: (x, y) => if x == 0 { (right: 0.6pt) } else { none }, inset: (x: 6pt, y: 3pt), align: (right, left), [*Stem*], [*Leaf*], ${[...stems].map(([s, ls]) => `[${s}], [${ls.join(' ')}]`).join(', ')})\nKey: ${Math.floor(s0 / 10)}#h(0.3em)|#h(0.3em)${s0 % 10} = ${s0}`;
}

function median(sorted: number[]): number {
  const n = sorted.length;
  return n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
}
function quartiles(sorted: number[]): [number, number] {
  const n = sorted.length, half = Math.floor(n / 2);
  return [median(sorted.slice(0, half)), median(sorted.slice(n % 2 ? half + 1 : half))];
}
function modes(data: number[]): number[] {
  const counts = new Map<number, number>();
  for (const d of data) counts.set(d, (counts.get(d) ?? 0) + 1);
  const top = Math.max(...counts.values());
  return top === 1 ? [] : [...counts].filter(([, c]) => c === top).map(([v]) => v).sort((a, b) => a - b);
}

export const stStemLeaf = us('st-stem-leaf', {
  levels: { 1: 'Read values from a plot', 2: 'Median and range from a plot', 3: 'Make a plot from data' },
  options: [radioOption('form', 'Questions', [['read', 'Read a stem-and-leaf plot'], ['make', 'Make a stem-and-leaf plot']], ['read', 'read', 'make'])],
  generate(rng, level, o) {
    const n = rng.int(9, 14), base = rng.int(1, 6) * 10;
    const data = Array.from({ length: n }, () => base + rng.int(0, 39));
    const sorted = [...data].sort((a, b) => a - b);
    if (optOne(o, 'form', 'read') === 'make') {
      const answer = stemLeaf(data);
      const wrongPlot = stemLeaf(data.map((d) => (d % 10 === 0 ? d + 1 : d - 1)));
      return {
        body: `Make a stem-and-leaf plot of the data: ${math(data.join(', '))}`,
        answer, distractors: wrong(answer, [wrongPlot]),
        solution: `Use the tens digits as stems and the ones digits as leaves, listed in order.`,
      };
    }
    const ask = level === 1 ? rng.pick(['min', 'max', 'count'] as const) : rng.pick(['median', 'range'] as const);
    const values = { min: sorted[0], max: sorted[n - 1], count: n, median: median(sorted), range: sorted[n - 1] - sorted[0] };
    const words = { min: 'the least value', max: 'the greatest value', count: 'the number of data values', median: 'the median', range: 'the range' };
    const ans = values[ask];
    return {
      body: `${stemLeaf(data)}\n\nFind ${words[ask]}.`,
      answer: math(decimal(ans)),
      distractors: wrong(math(decimal(ans)), ({
        min: [sorted[1], sorted[0] % 10, sorted[0] + 10],
        max: [sorted[n - 2], sorted[n - 1] % 10, sorted[n - 1] - 10],
        count: [n - 1, n + 1, new Set(sorted.map((d) => Math.floor(d / 10))).size],
        median: [data[Math.floor(n / 2)], (sorted[0] + sorted[n - 1]) / 2, sorted[Math.floor(n / 2) + 1]],
        range: [sorted[n - 1], sorted[n - 1] % 10 - sorted[0] % 10, sorted[n - 2] - sorted[1]],
      })[ask].map((v) => math(decimal(v)))),
      solution: `The data in order: ${math(sorted.join(', '))}. ${ask === 'median' ? `The middle value${n % 2 ? ' is' : 's average to'} ${math(decimal(ans))}.` : ask === 'range' ? `${math(`${sorted[n - 1]} - ${sorted[0]} = ${ans}`)}.` : `So ${words[ask]} is ${math(decimal(ans))}.`}`,
    };
  },
});

// ── Center and spread ────────────────────────────────────────────────────────

const STATS = [
  ['mean', 'Mean'], ['median', 'Median'], ['mode', 'Mode'], ['range', 'Range'],
  ['q1', 'Lower quartile'], ['q3', 'Upper quartile'], ['iqr', 'Interquartile range'],
  ['sd-sample', 'Sample standard deviation'], ['sd-pop', 'Population standard deviation'],
] as const;
type Stat = (typeof STATS)[number][0];

function statistic(stat: Stat, data: number[]): number[] {
  const s = [...data].sort((a, b) => a - b), n = s.length, mean = s.reduce((a, b) => a + b, 0) / n;
  const [q1, q3] = quartiles(s);
  const ss = s.reduce((a, b) => a + (b - mean) ** 2, 0);
  switch (stat) {
    case 'mean': return [mean];
    case 'median': return [median(s)];
    case 'mode': return modes(s);
    case 'range': return [s[n - 1] - s[0]];
    case 'q1': return [q1];
    case 'q3': return [q3];
    case 'iqr': return [q3 - q1];
    case 'sd-sample': return [Math.sqrt(ss / (n - 1))];
    case 'sd-pop': return [Math.sqrt(ss / n)];
  }
}

export const stCenterSpread = us('st-center-spread', {
  levels: { 1: 'Mean, median, mode, and range', 2: 'Quartiles and interquartile range', 3: 'Standard deviation' },
  options: [
    manyOption('find', 'Find', STATS.map(([v, l]) => [v, l]), [['mean', 'median', 'mode', 'range'], ['q1', 'q3', 'iqr', 'median'], ['sd-sample', 'sd-pop', 'mean']]),
    radioOption('size', 'Size of data set', [['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']], ['small', 'medium', 'medium']),
    radioOption('given', 'Given as', [['list', 'A list of numbers'], ['dot', 'A dot plot'], ['stem', 'A stem-and-leaf plot'], ['table', 'A frequency table']], ['list', 'list', 'list']),
    toggleOption('sorted', 'Sort the data', [true, false, false]),
  ],
  generate(rng, _level, o) {
    const stat = rng.pick(optList(o, 'find', ['mean'])) as Stat;
    const size = optOne(o, 'size', 'small'), given = optOne(o, 'given', 'list');
    const n = size === 'small' ? rng.int(5, 7) : size === 'medium' ? rng.int(8, 11) : rng.int(12, 16);
    const narrow = given === 'dot' || given === 'table';
    const lo = narrow ? rng.int(1, 6) : rng.int(10, 40), hi = lo + (narrow ? rng.int(5, 8) : rng.int(15, 45));
    let data = Array.from({ length: n }, () => rng.int(lo, hi));
    if (stat === 'mode' && !modes(data).length) data[1] = data[0];
    if (optOn(o, 'sorted', false)) data = [...data].sort((a, b) => a - b);
    const value = statistic(stat, data);
    const precise = stat.startsWith('sd') || (stat === 'mean' && !Number.isInteger(value[0]));
    const fmtAs = (st: Stat, vs: number[]) => (vs.length ? vs.map((v) => (st.startsWith('sd') || (st === 'mean' && !Number.isInteger(v)) ? fixed(v, 1) : decimal(v, 2))).join(', ') : '"none"');
    const fmt = (vs: number[]) => fmtAs(stat, vs);
    const answer = math(fmt(value));
    const counts = new Map<number, number>(); for (const d of data) counts.set(d, (counts.get(d) ?? 0) + 1);
    const shown = given === 'dot' ? dotPlot(data) : given === 'stem' ? stemLeaf(data) : given === 'table'
      ? frequencyTable(['Value', 'Frequency'], [...counts.keys()].sort((a, b) => a - b).map(String), [...counts.keys()].sort((a, b) => a - b).map((k) => counts.get(k)!))
      : math(data.join(', '));
    const label = STATS.find(([v]) => v === stat)![1].toLowerCase();
    const others = (STATS.map(([v]) => v) as Stat[]).filter((s) => s !== stat).map((s) => fmtAs(s, statistic(s, data))).filter((t) => t !== '"none"');
    const unsortedMedian = stat === 'median' ? [fmt([data[Math.floor(n / 2)]])] : [];
    return {
      body: `Find the ${label} of the data${stat.startsWith('sd') || precise ? ', to the nearest tenth' : ''}.\n\n${shown}`,
      answer,
      distractors: wrong(answer, [...unsortedMedian, ...others].map(math)).slice(0, 4),
      solution: {
        mean: `Add the values and divide by ${n}: ${math(`${data.reduce((a, b) => a + b, 0)} / ${n} ${precise ? 'approx' : '='} ${fmt(value)}`)}.`,
        median: `In order, the middle value${n % 2 ? ' is' : 's average to'} ${answer}.`,
        mode: value.length ? `The most frequent value${value.length > 1 ? 's are' : ' is'} ${answer}.` : 'No value occurs more than once, so there is no mode.',
        range: `Greatest minus least: ${answer}.`,
        q1: `The lower quartile is the median of the lower half of the data: ${answer}.`,
        q3: `The upper quartile is the median of the upper half of the data: ${answer}.`,
        iqr: `Upper quartile minus lower quartile: ${answer}.`,
        'sd-sample': `${math('s = sqrt((sum (x - macron(x))^2)/(n - 1))')} ${math(`approx ${fmt(value)}`)}.`,
        'sd-pop': `${math('sigma = sqrt((sum (x - mu)^2)/n)')} ${math(`approx ${fmt(value)}`)}.`,
      }[stat],
    };
  },
});

// ── Scatter plots and models ─────────────────────────────────────────────────

const CORRELATIONS = ['strong positive correlation', 'weak positive correlation', 'no correlation', 'weak negative correlation', 'strong negative correlation'] as const;

export const stCorrelation = us('st-correlation', {
  levels: { 1: 'Positive, negative, or none', 2: 'Strong or weak', 3: 'Strong or weak' },
  generate(rng, level) {
    const kind = rng.pick(level === 1 ? [0, 2, 4] : [0, 1, 2, 3, 4]);
    const slope = kind < 2 ? rng.int(5, 9) / 10 : kind > 2 ? -rng.int(5, 9) / 10 : 0;
    const noise = kind === 0 || kind === 4 ? 0.6 : kind === 2 ? 4 : 2;
    const pts: Pt[] = Array.from({ length: 14 }, () => {
      const x = rng.int(1, 9) + rng.int(0, 9) / 10;
      const y = kind === 2 ? rng.int(1, 9) + rng.int(0, 9) / 10 : 5 + slope * (x - 5) + (rng.next() - 0.5) * noise;
      return [x, Math.max(0.3, Math.min(9.7, y))];
    });
    const graph = graphTypst({ xMin: 0, xMax: 10, yMin: 0, yMax: 10, width: 4.5, height: 4.5, numbers: false, dots: pts.map(([x, y]) => ({ x, y })) });
    const answer = level === 1 ? CORRELATIONS[kind].replace(/^(strong|weak) /, '') : CORRELATIONS[kind];
    const options = level === 1 ? ['positive correlation', 'negative correlation', 'no correlation'] : [...CORRELATIONS];
    return {
      body: `Describe the correlation shown by the scatter plot.\n\n${graph}`,
      answer,
      distractors: wrong(answer, options),
      solution: kind === 2 ? 'The points show no clear upward or downward trend.' : `The points ${slope > 0 ? 'rise' : 'fall'} from left to right${level > 1 ? ` and lie ${Math.abs(noise) < 1 ? 'close to' : 'loosely around'} a line` : ''}.`,
    };
  },
});

interface Context { setup: (m: number, b: number) => string; x: string; y: string; xUnit: string; yUnit: string; slope: string; intercept: string; money?: boolean }
const MODELS: Context[] = [
  { setup: (m, b) => `The cost ${math('C')}, in dollars, of a taxi ride of ${math('d')} kilometres is modelled by ${math(`C = ${m}d + ${b}`)}.`, x: 'd', y: 'C', xUnit: 'km', yUnit: 'dollars', slope: 'the cost per kilometre', intercept: 'the starting fee before any distance is driven', money: true },
  { setup: (m, b) => `The height ${math('h')}, in centimetres, of a plant ${math('t')} weeks after planting is modelled by ${math(`h = ${m}t + ${b}`)}.`, x: 't', y: 'h', xUnit: 'weeks', yUnit: 'cm', slope: 'the growth in height per week', intercept: 'the height when it was planted' },
  { setup: (m, b) => `The total savings ${math('S')}, in dollars, after ${math('w')} weeks is modelled by ${math(`S = ${m}w + ${b}`)}.`, x: 'w', y: 'S', xUnit: 'weeks', yUnit: 'dollars', slope: 'the amount saved each week', intercept: 'the amount saved at the start', money: true },
];

export const stModels = us('st-models', {
  levels: { 1: 'Interpolate and extrapolate', 2: 'Find x for a given y', 3: 'Interpret slope and intercept' },
  options: [manyOption('ask', 'Ask', [['predict', 'Predict a value'], ['solve', 'Approximate x for a given y'], ['slope', 'Explain the slope'], ['intercept', 'Explain the y-intercept']], [['predict'], ['predict', 'solve'], ['slope', 'intercept']])],
  generate(rng, _level, o) {
    const ctx = rng.pick(MODELS);
    const m = rng.int(3, 18) / 2, b = rng.int(2, 20);
    const ask = rng.pick(optList(o, 'ask', ['predict']));
    const name = rng.pick(NAMES);
    const show = (v: number) => (ctx.money ? math(money(v)) : `${math(decimal(v, 2))} ${ctx.yUnit}`);
    if (ask === 'predict') {
      const x = rng.int(3, 30), y = m * x + b;
      const answer = show(y);
      return {
        body: `${ctx.setup(m, b)} Predict ${math(ctx.y)} when ${math(`${ctx.x} = ${x}`)}.`,
        answer, distractors: wrong(answer, [m * x, (m + b) * x, m + b * x, y + m].map(show)),
        solution: `Substitute: ${math(`${ctx.y} = ${m}(${x}) + ${b} = ${decimal(y, 2)}`)}.`,
      };
    }
    if (ask === 'solve') {
      const x = rng.int(3, 30), y = m * x + b;
      const answer = `${math(decimal(x))} ${ctx.xUnit}`;
      return {
        body: `${ctx.setup(m, b)} ${name} wants to know ${math(ctx.x)} when ${math(`${ctx.y} = ${decimal(y, 2)}`)}. Find it.`,
        answer, distractors: wrong(answer, [y / m, (y + b) / m, y * m - b, x + 1].map((v) => `${math(fixed(v, 1).replace(/\.0$/, ''))} ${ctx.xUnit}`)),
        solution: `Solve ${math(`${decimal(y, 2)} = ${m}${ctx.x} + ${b}`)}: ${math(`${ctx.x} = (${decimal(y, 2)} - ${b}) / ${m} = ${x}`)}.`,
      };
    }
    const answer = ask === 'slope' ? `It is ${ctx.slope}: ${show(m)} per ${ctx.xUnit.replace(/s$/, '')}.` : `It is ${ctx.intercept}: ${show(b)}.`;
    return {
      body: `${ctx.setup(m, b)} What does the ${ask === 'slope' ? 'slope' : 'y-intercept'} represent?`,
      answer,
      distractors: wrong(answer, [
        ask === 'slope' ? `It is ${ctx.intercept}: ${show(m)}.` : `It is ${ctx.slope}: ${show(b)} per ${ctx.xUnit.replace(/s$/, '')}.`,
        `It is the total after one ${ctx.xUnit.replace(/s$/, '')}: ${show(m + b)}.`,
        `It is the value of ${math(ctx.x)} when ${math(`${ctx.y} = 0`)}.`,
      ]),
      solution: ask === 'slope' ? `The slope is the change in ${math(ctx.y)} for each increase of 1 in ${math(ctx.x)}.` : `The y-intercept is the value of ${math(ctx.y)} when ${math(`${ctx.x} = 0`)}.`,
    };
  },
});

export const STATISTICS = [stReadDisplay, stStemLeaf, stCenterSpread, stCorrelation, stModels];
