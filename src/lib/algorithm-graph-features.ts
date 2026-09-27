// Keep a redrawn graph's key features in view: when new algorithm values move a curve's roots
// or asymptotes outside the authored window, widen the window to include them, and mark the
// features (dashed asymptotes labelled "x = 5" / "y = -7", roots labelled "(2, 0)") when that
// helps a reader. Works on a concrete Math Graph document (numbers already substituted).
import { evaluate, parse, type Expr } from './math-graph/vendor/expression.ts';
import { niceTick, type Graph, type GraphObject } from './math-graph/vendor/model.ts';

type FunctionObject = Extract<GraphObject, { type: 'function' }>;

export interface GraphFeatures {
  roots: number[];
  verticalAsymptotes: number[];
  horizontalAsymptotes: number[];
  /** More roots or asymptotes than a reader could use (periodic curves): left as authored. */
  periodic: boolean;
}

const SAMPLES = 4000;
const MAX_LABELLED_ROOTS = 4;
const MAX_FITTED_ROOTS = 6;

export function findFeatures(
  expression: string,
  low: number,
  high: number,
  { degrees = false, unboundedLeft = true, unboundedRight = true } = {},
): GraphFeatures {
  const tree: Expr = parse(expression);
  const f = (x: number) => evaluate(tree, x, degrees);
  const xs = Array.from({ length: SAMPLES + 1 }, (_, i) => low + ((high - low) * i) / SAMPLES);
  const ys = xs.map(f);
  const finite = ys.filter(Number.isFinite).map(Math.abs).sort((a, b) => a - b);
  const typical = finite.length ? Math.max(1e-9, finite[Math.floor(finite.length / 2)]) : 1;
  const roots: number[] = [];
  const asymptotes: number[] = [];
  const add = (list: number[], x: number) => {
    const step = (high - low) / SAMPLES;
    if (!list.some((existing) => Math.abs(existing - x) < 2 * step)) list.push(x);
  };

  const big = 1e6 * Math.max(1, typical);
  for (let i = 1; i < xs.length; i++) {
    const [a, b] = [xs[i - 1], xs[i]];
    const [fa, fb] = [ys[i - 1], ys[i]];
    if (fa === 0) { add(roots, a); continue; }
    if (fb === Infinity || fb === -Infinity) { add(asymptotes, b); continue; }
    if (Number.isFinite(fa) !== Number.isFinite(fb)) {
      // The edge of the domain, as in ln(x + 3) or sqrt(x - 4): an asymptote if f blows up there.
      const edge = domainEdge(f, a, b);
      const value = Math.abs(f(edge));
      if (value > big) add(asymptotes, edge);
      else if (value < 1e-6 * Math.max(1, typical)) add(roots, edge);
      continue;
    }
    if (Number.isFinite(fa) && Number.isFinite(fb) && fa * fb < 0) {
      // Bisect the sign change: a root if f shrinks to zero, an asymptote if it blows up.
      let [lo, hi, flo] = [a, b, fa];
      for (let k = 0; k < 60; k++) {
        const mid = (lo + hi) / 2;
        const fm = f(mid);
        if (!Number.isFinite(fm)) { lo = hi = mid; break; }
        if (fm === 0) { lo = hi = mid; break; }
        if (flo * fm < 0) hi = mid;
        else { lo = mid; flo = fm; }
      }
      const x = (lo + hi) / 2;
      const size = Math.max(Math.abs(f(lo)), Math.abs(f(hi)));
      if (size < 1e-6 * Math.max(1, typical)) add(roots, x);
      else if (!Number.isFinite(size) || size > big) add(asymptotes, x);
    } else if (i + 1 < xs.length && [fa, fb, ys[i + 1]].every(Number.isFinite)) {
      const [ga, gb, gc] = [Math.abs(fa), Math.abs(fb), Math.abs(ys[i + 1])];
      // A dip in |f| that touches zero without a sign change: a double root such as (x + 1)^2.
      if (gb <= ga && gb <= gc && gb < 0.05 * typical) {
        const x = minimize((x) => Math.abs(f(x)), a, xs[i + 1]);
        if (Math.abs(f(x)) < 1e-7 * Math.max(1, typical)) add(roots, x);
      }
      // A spike in |f| that grows without bound: an asymptote such as 1/(x - 5)^2.
      if (gb >= ga && gb >= gc && gb > 20 * typical) {
        const x = minimize((x) => -Math.abs(f(x)), a, xs[i + 1]);
        if (!Number.isFinite(f(x)) || Math.abs(f(x)) > big) add(asymptotes, x);
      }
    }
  }

  // Horizontal asymptotes: a finite limit far out on a side where the domain is unbounded,
  // for a curve that isn't simply that constant.
  const horizontal: number[] = [];
  for (const [sign, open] of [[-1, unboundedLeft], [1, unboundedRight]] as const) {
    if (!open) continue;
    const far = [1e6, 1e7, 1e8].map((d) => f(sign * d));
    if (!far.every(Number.isFinite)) continue;
    const [, near, limit] = far;
    if (Math.abs(limit) > 1e6 || Math.abs(near - limit) > 1e-4 * (1 + Math.abs(limit))) continue;
    const value = Number(limit.toFixed(4));
    const departs = ys.some((y) => Number.isFinite(y) && Math.abs(y - value) > 1e-6 * (1 + Math.abs(value)));
    if (departs && !horizontal.some((existing) => Math.abs(existing - value) < 1e-6)) horizontal.push(value);
  }

  return {
    roots: roots.sort((p, q) => p - q),
    verticalAsymptotes: asymptotes.sort((p, q) => p - q),
    horizontalAsymptotes: horizontal,
    periodic: roots.length > MAX_FITTED_ROOTS || asymptotes.length > MAX_FITTED_ROOTS,
  };
}

// Bisect between a defined and an undefined sample to find where the domain ends.
function domainEdge(f: (x: number) => number, a: number, b: number): number {
  let [inside, outside] = Number.isFinite(f(a)) ? [a, b] : [b, a];
  for (let k = 0; k < 60; k++) {
    const mid = (inside + outside) / 2;
    if (Number.isFinite(f(mid))) inside = mid;
    else outside = mid;
  }
  return inside;
}

// Golden-section search for the minimum of g on [a, b].
function minimize(g: (x: number) => number, a: number, b: number): number {
  const ratio = (Math.sqrt(5) - 1) / 2;
  let [lo, hi] = [a, b];
  for (let k = 0; k < 80; k++) {
    const c = hi - ratio * (hi - lo);
    const d = lo + ratio * (hi - lo);
    if (g(c) < g(d)) hi = d;
    else lo = c;
  }
  return (lo + hi) / 2;
}

/** Widen the window to show roots, asymptotes and points; label what's worth labelling. */
export function showGraphFeatures(graph: Graph): Graph {
  const s = { ...graph.settings };
  const degrees = s.angles === 'degrees';
  const halfX = (s.xmax - s.xmin) / 2;
  const centreX = (s.xmax + s.xmin) / 2;
  const reach = Math.max(4 * halfX, 30);
  const xs: number[] = [];
  const ys: number[] = [];
  const extra: GraphObject[] = [];
  const rootLabels: number[] = [];
  const verticals = new Set<number>();
  const horizontals = new Set<number>();

  for (const object of graph.objects) {
    if (!object.visible) continue;
    if (object.type === 'point') {
      xs.push(object.x);
      ys.push(object.y);
      continue;
    }
    if (object.type !== 'function') continue;
    const fn = object as FunctionObject;
    const low = Math.max(fn.min ?? -Infinity, centreX - reach);
    const high = Math.min(fn.max ?? Infinity, centreX + reach);
    if (!(high > low)) continue;
    let features: GraphFeatures;
    try {
      features = findFeatures(fn.expression, low, high, {
        degrees,
        unboundedLeft: fn.min === null,
        unboundedRight: fn.max === null,
      });
    } catch {
      continue;
    }
    if (features.periodic) continue;
    for (const x of features.verticalAsymptotes) { xs.push(x); verticals.add(round(x)); }
    for (const y of features.horizontalAsymptotes) {
      if (y === 0) continue; // the x-axis already shows it
      ys.push(y);
      horizontals.add(round(y));
    }
    for (const x of features.roots) { xs.push(x); ys.push(0); }
    if (features.roots.length <= MAX_LABELLED_ROOTS && features.roots.every(isClean)) rootLabels.push(...features.roots.map(round));
  }

  // Widen (never shrink) the authored window, keeping a tick of margin around features.
  const fit = (min: number, max: number, values: number[], tick: number) => {
    const inside = values.filter(Number.isFinite);
    if (!inside.length) return [min, max];
    const margin = Math.max(tick, (max - min) * 0.05);
    return [Math.min(min, Math.min(...inside) - margin), Math.max(max, Math.max(...inside) + margin)];
  };
  const [xmin, xmax] = fit(s.xmin, s.xmax, xs, s.xtick);
  const [ymin, ymax] = fit(s.ymin, s.ymax, ys, s.ytick);
  const retick = (min: number, max: number, tick: number, every: number | undefined) => {
    // Keep labels readable when the window grows a lot.
    if ((max - min) / (tick * (every ?? 1)) <= 16) return { tick, every };
    return { tick: niceTick(max - min), every: 1 };
  };
  if (xmin !== s.xmin || xmax !== s.xmax) {
    const { tick, every } = retick(xmin, xmax, s.xtick, s.xlabelEvery);
    Object.assign(s, { xmin, xmax, xtick: tick, xlabelEvery: every });
  }
  if (ymin !== s.ymin || ymax !== s.ymax) {
    const { tick, every } = retick(ymin, ymax, s.ytick, s.ylabelEvery);
    Object.assign(s, { ymin, ymax, ytick: tick, ylabelEvery: every });
  }

  // Labels go on the side of a feature away from the axes, where the tick labels aren't,
  // unless that side runs out of room.
  const width = s.xmax - s.xmin;
  const height = s.ymax - s.ymin;
  const east = (x: number) => (x >= 0 ? s.xmax - x > 0.2 * width : x - s.xmin < 0.2 * width);
  const north = (y: number) => (y >= 0 ? s.ymax - y > 0.1 * height : y - s.ymin < 0.1 * height);
  const corner = (x: number, y: number) => `${north(y) ? 'n' : 's'}${east(x) ? 'e' : 'w'}` as const;
  const ink = { color: '#555555', width: 0.8, dashed: true, visible: true };
  const caption = (id: string, x: number, y: number, text: string, labelAt: string): GraphObject => ({
    id, type: 'point', name: id, x, y, label: { text, math: false }, open: false, marker: false, labelAt,
    color: '#555555', width: 0.8, dashed: false, visible: true,
  } as GraphObject);
  // Vertical asymptote captions sit near the top, between two y tick labels.
  const labelStep = s.ytick * (s.ylabelEvery ?? 1);
  const topLabel = Math.floor(s.ymax / labelStep) * labelStep;
  // A caption's baseline is 4pt above its point and its text about 7pt tall, so drop the point
  // 7.5pt below the midpoint to centre the text there (height is in cm; the plot is ~85% of it).
  const unitsPerPoint = height / ((s.height / 2.54) * 72 * 0.85);
  const middle = topLabel - labelStep / 2 > s.ymin ? topLabel - labelStep / 2 : s.ymax - 0.1 * height;
  const captionY = middle - 7.5 * unitsPerPoint;
  let n = 0;
  for (const x of verticals) {
    n += 1;
    extra.push({ id: `asymptote-x${n}`, type: 'line', vertical: true, m: 0, b: x, ...ink } as GraphObject);
    extra.push(caption(`asymptote-x${n}-label`, x, captionY, `x = ${format(x)}`, `n${east(x) ? 'e' : 'w'}`));
  }
  for (const y of horizontals) {
    n += 1;
    extra.push({ id: `asymptote-y${n}`, type: 'line', vertical: false, m: 0, b: y, ...ink } as GraphObject);
    extra.push(caption(`asymptote-y${n}-label`, s.xmin, y, `y = ${format(y)}`, `${north(y) ? 'n' : 's'}e`));
  }
  const pointAt = (x: number, y: number) => graph.objects.some((object) => object.type === 'point'
    && Math.abs(object.x - x) < 1e-6 && Math.abs(object.y - y) < 1e-6);
  // Root labels left to right, each on its preferred side or the other side if that would
  // overlap the previous label. If any root can't be labelled cleanly, none are, so the choices
  // of a question look alike. Width is estimated at 2.4% of the window per character.
  const placed: { x: number; text: string; at: string }[] = [];
  let taken = -Infinity;
  for (const x of [...new Set(rootLabels)].sort((p, q) => p - q)) {
    if (x === 0 || pointAt(x, 0)) continue; // the origin needs no caption
    const text = `(${format(x)}, 0)`;
    const span = (text.length * 0.024 + 0.03) * width;
    const preferred = corner(x, 0);
    const at = [preferred, `n${preferred.endsWith('e') ? 'w' : 'e'}`]
      .find((side) => (side.endsWith('e') ? x : x - span) > taken);
    if (!at) { placed.length = 0; break; }
    placed.push({ x, text, at });
    taken = at.endsWith('e') ? x + span : x;
  }
  for (const { x, text, at } of placed) {
    n += 1;
    extra.push({
      id: `root${n}`, type: 'point', name: `root${n}`, x, y: 0, label: { text, math: false },
      labelAt: at, open: false, color: '#000000', width: 0.8, dashed: false, visible: true,
    } as GraphObject);
  }
  return { ...graph, settings: s, objects: [...graph.objects, ...extra] };
}

const round = (value: number) => Number(value.toFixed(6));
// A root is worth labelling when it is a whole number or has at most two decimals.
const isClean = (value: number) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;
const format = (value: number) => {
  const text = String(Number(value.toFixed(2)));
  return text === '-0' ? '0' : text;
};
