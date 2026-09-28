// Helpers shared by the Grade 9 and Grade 10 generators.
import type { Rng } from '../../rng.ts';
import { graphTypst, type Pt } from '../../graph.ts';

/** A decimal with at most `places` places and no trailing zeros: 3.5, 12, 0.042. */
export function dec(value: number, places = 2): string {
  const r = Math.round(value * 10 ** places) / 10 ** places;
  const text = String(Object.is(r, -0) ? 0 : r);
  return text.includes('e') ? r.toFixed(places).replace(/\.?0+$/, '') : text;
}

/** `an` before whole numbers read with a vowel sound (8, 11, 18, 80–89, 800–899), otherwise `a`. */
export const article = (n: number) => (/^8/.test(String(n)) || n === 11 || n === 18 ? 'an' : 'a');

/** A decimal with thin-space digit grouping for math, e.g. 12 500.5 → `12 thin 500.5`. */
export function decGrouped(value: number, places = 2): string {
  const [whole, frac] = dec(value, places).split('.');
  const sign = whole.startsWith('-') ? '-' : '';
  const digits = whole.replace('-', '');
  const body = digits.length > 4 ? digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' thin ') : digits;
  return `${sign}${body}${frac ? `.${frac}` : ''}`;
}

/** Up to `k` items from a pool, other than the answer, in random order. */
export function others<T>(rng: Rng, pool: readonly T[], answer: T, k = 3): T[] {
  return rng.shuffle(pool.filter((p) => p !== answer)).slice(0, k);
}

/** Drop repeats and anything equal to the answer. */
export function distinct(answer: string, list: string[]): string[] {
  return list.filter((d, i) => d !== answer && list.indexOf(d) === i);
}

/**
 * A right triangle with the right angle at C, drawn without axes. Legs a (BC, vertical) and b (AC,
 * horizontal); labels are Typst math, empty to leave a part unlabelled.
 */
export function rightTriangle(a: number, b: number, labels: Partial<Record<'a' | 'b' | 'c' | 'A' | 'B' | 'C' | 'angleA' | 'angleB', string>>, flip = false, size = 4.5): string {
  const scale = 8 / Math.max(a, b);
  const W = b * scale, H = a * scale;
  const sx = (x: number) => (flip ? W / 2 - x : x - W / 2), sy = (y: number) => y - H / 2;
  const A: Pt = [sx(0), sy(0)], C: Pt = [sx(W), sy(0)], B: Pt = [sx(W), sy(H)];
  const dir = flip ? -1 : 1, box = 0.6;
  const out = (p: Pt, dx: number, dy: number): Pt => [p[0] + dx, p[1] + dy];
  const L = labels;
  const text = [
    L.A !== undefined ? { at: out(A, -0.7 * dir, -0.5), text: L.A } : null,
    L.B !== undefined ? { at: out(B, 0.7 * dir, 0.4), text: L.B } : null,
    L.C !== undefined ? { at: out(C, 0.7 * dir, -0.5), text: L.C } : null,
    L.a ? { at: [C[0] + 1.3 * dir, (B[1] + C[1]) / 2] as Pt, text: L.a } : null,
    L.b ? { at: [(A[0] + C[0]) / 2, A[1] - 0.8] as Pt, text: L.b } : null,
    L.c ? { at: [(A[0] + B[0]) / 2 - 0.9 * dir, (A[1] + B[1]) / 2 + 0.6] as Pt, text: L.c } : null,
    L.angleA ? { at: [A[0] + 2.2 * dir, A[1] + 0.55] as Pt, text: L.angleA } : null,
    L.angleB ? { at: [B[0] - 0.75 * dir, B[1] - 2] as Pt, text: L.angleB } : null,
  ].filter((l): l is { at: Pt; text: string } => l !== null);
  return graphTypst({
    xMin: -6, xMax: 6, yMin: -6, yMax: 6, width: size, height: size, grid: false, numbers: false, axes: false,
    curves: [
      { points: [A, C, B, A] },
      { points: [[C[0] - box * dir, C[1]], [C[0] - box * dir, C[1] + box], [C[0], C[1] + box]] },
    ],
    labels: text.map((l) => ({ x: l.at[0], y: l.at[1], text: l.text })),
  });
}

/** Ordered pair text: `(3, -2)`. */
export const pt = (x: number | string, y: number | string) => `(${x}, ${y})`;

/**
 * A horizontal number line from `from` to `to`, with ticks every `step` and numbers every `labelEvery`
 * ticks. Points are dots with a label above; `ray` draws an inequality ray with an open or closed end.
 */
export function numberLine(opts: {
  from: number; to: number; step?: number; labelEvery?: number; width?: number;
  points?: Array<{ x: number; label: string }>;
  ray?: { at: number; dir: 'left' | 'right'; open: boolean };
  segment?: { from: number; to: number; openFrom: boolean; openTo: boolean };
  tickLabel?: (x: number) => string;
}): string {
  const step = opts.step ?? 1, every = opts.labelEvery ?? 1;
  const pad = step * 0.8;
  const curves: Array<{ points: Pt[]; arrow?: boolean }> = [
    { points: [[opts.from - pad * 0.3, 0], [opts.to + pad, 0]], arrow: true },
    { points: [[opts.to + pad * 0.3, 0], [opts.from - pad, 0]], arrow: true },
  ];
  const labels: Array<{ x: number; y: number; text: string }> = [];
  const span = opts.to - opts.from + 2 * pad;
  const tick = span * 0.018;
  const n = Math.round((opts.to - opts.from) / step);
  for (let i = 0; i <= n; i++) {
    const x = opts.from + i * step;
    curves.push({ points: [[x, -tick], [x, tick]] });
    if (i % every === 0) labels.push({ x, y: -tick * 3.4, text: opts.tickLabel ? opts.tickLabel(x) : fmtNum(x) });
  }
  const dots: Array<{ x: number; y: number; open?: boolean }> = [];
  for (const p of opts.points ?? []) { dots.push({ x: p.x, y: 0 }); labels.push({ x: p.x, y: tick * 3.2, text: p.label }); }
  const thick = (a: number, b: number): Pt[] => [[a, 0], [b, 0]];
  if (opts.ray) {
    const end = opts.ray.dir === 'right' ? opts.to + pad : opts.from - pad;
    curves.push({ points: thick(opts.ray.at, end), arrow: true }, { points: [[opts.ray.at, tick * 0.35], [end, tick * 0.35]] }, { points: [[opts.ray.at, -tick * 0.35], [end, -tick * 0.35]] });
    dots.push({ x: opts.ray.at, y: 0, open: opts.ray.open });
  }
  if (opts.segment) {
    const s = opts.segment;
    curves.push({ points: thick(s.from, s.to) }, { points: [[s.from, tick * 0.35], [s.to, tick * 0.35]] }, { points: [[s.from, -tick * 0.35], [s.to, -tick * 0.35]] });
    dots.push({ x: s.from, y: 0, open: s.openFrom }, { x: s.to, y: 0, open: s.openTo });
  }
  const width = opts.width ?? 9;
  return graphTypst({
    xMin: opts.from - pad, xMax: opts.to + pad, yMin: -tick * 6, yMax: tick * 6, width, height: 1.3,
    grid: false, numbers: false, axes: false, curves, labels, dots,
  });
}

function fmtNum(x: number): string {
  const r = Math.round(x * 1000) / 1000;
  return r < 0 ? `-${-r}` : String(r);
}
