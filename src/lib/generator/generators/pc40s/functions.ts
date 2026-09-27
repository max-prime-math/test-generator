// Shared helpers for the function units: piecewise-linear "mystery" functions
// shown only by their graph (as Manitoba textbooks do), transformations of
// them, and polynomial arithmetic on coefficient lists.

import type { Rng } from '../../rng.ts';
import { poly } from '../../format.ts';
import { Q } from '../../exact.ts';
import { graphTypst, type Curve, type Dot, type Pt } from '../../graph.ts';

// ── Piecewise-linear functions ─────────────────────────────────────────────

/** Key points of a piecewise-linear function, sorted by x. */
export type PL = Pt[];

/** A random piecewise-linear function with integer key points, a function of x (distinct x values). */
export function randomPL(rng: Rng, opts: { count?: number; xMin?: number; xMax?: number; yMin?: number; yMax?: number } = {}): PL {
  const { count = rng.int(3, 5), xMin = -4, xMax = 4, yMin = -3, yMax = 3 } = opts;
  for (;;) {
    const xs = new Set<number>();
    while (xs.size < count) xs.add(rng.int(xMin, xMax));
    const sorted = [...xs].sort((a, b) => a - b);
    const pts: PL = sorted.map((x) => [x, rng.int(yMin, yMax)]);
    // Avoid flat or nearly flat shapes: at least two different slopes and a spread of y values.
    const ys = pts.map(([, y]) => y);
    if (Math.max(...ys) - Math.min(...ys) < 2) continue;
    const slopes = new Set(pts.slice(1).map(([x, y], i) => (y - pts[i][1]) / (x - pts[i][0])));
    if (slopes.size < 2) continue;
    return pts;
  }
}

/** f(x) by linear interpolation, or NaN outside the domain. */
export function plEval(f: PL, x: number): number {
  if (x < f[0][0] - 1e-9 || x > f[f.length - 1][0] + 1e-9) return NaN;
  for (let i = 1; i < f.length; i++) {
    const [x0, y0] = f[i - 1], [x1, y1] = f[i];
    if (x <= x1 + 1e-9) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return f[f.length - 1][1];
}

export interface Transform { a: Q; b: Q; h: number; k: number }
export const IDENTITY: Transform = { a: new Q(1), b: new Q(1), h: 0, k: 0 };

/** Image of a point under y − k = a f(b(x − h)): (x, y) → (x/b + h, a y + k). */
export function mapPoint([x, y]: Pt, t: Transform): Pt {
  return [x / t.b.value + t.h, t.a.value * y + t.k];
}

export function transformPL(f: PL, t: Transform): PL {
  return f.map((p) => mapPoint(p, t)).sort((p, q) => p[0] - q[0]);
}

/** A point with exact coordinates: `(3, -1)`, `(1/2, 4)`. */
export function pointText([x, y]: Pt): string {
  return `(${exactNumber(x)}, ${exactNumber(y)})`;
}

/** A number that is a simple fraction, written exactly. */
export function exactNumber(v: number): string {
  for (const d of [1, 2, 3, 4, 5, 6, 8, 9, 10, 12]) {
    const n = Math.round(v * d);
    if (Math.abs(n / d - v) < 1e-9) return new Q(n, d).typst();
  }
  return String(Math.round(v * 100) / 100);
}

/** The equation of a transformation of f in Manitoba's form: y − k = a f(b(x − h)). */
export function transformText(t: Transform, name = 'f'): string {
  const left = t.k === 0 ? 'y' : `y ${t.k > 0 ? '-' : '+'} ${Math.abs(t.k)}`;
  const a = t.a.eq(1) ? '' : t.a.eq(-1) ? '-' : t.a.isInt ? String(t.a.n) : `${t.a.typst()} `;
  const shift = t.h === 0 ? 'x' : `x ${t.h > 0 ? '-' : '+'} ${Math.abs(t.h)}`;
  let inner: string;
  if (t.b.eq(1)) inner = shift;
  else if (t.h === 0) inner = t.b.eq(-1) ? '-x' : t.b.isInt ? `${t.b.n}x` : `${t.b.typst()} x`;
  else inner = t.b.eq(-1) ? `-(${shift})` : `${t.b.isInt ? t.b.n : `${t.b.typst()} `}(${shift})`;
  return `${left} = ${a}${name}(${inner})`;
}

/** Words for each part of a transformation, in the usual order. */
export function describeTransform(t: Transform): string[] {
  const parts: string[] = [];
  const A = t.a.abs(), B = t.b.abs();
  if (!A.eq(1)) parts.push(`a vertical ${A.value > 1 ? 'stretch' : 'compression'} by a factor of ${A.typst()}`);
  if (!B.eq(1)) parts.push(`a horizontal ${B.value > 1 ? 'compression' : 'stretch'} by a factor of ${new Q(B.d, B.n).typst()}`);
  if (t.a.sign < 0) parts.push('a reflection in the x-axis');
  if (t.b.sign < 0) parts.push('a reflection in the y-axis');
  if (t.h !== 0) parts.push(`a horizontal translation of ${Math.abs(t.h)} ${t.h > 0 ? 'right' : 'left'}`);
  if (t.k !== 0) parts.push(`a vertical translation of ${Math.abs(t.k)} ${t.k > 0 ? 'up' : 'down'}`);
  return parts;
}

/** Join phrases: "a, b, and c". */
export function listText(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? 'no change';
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
}

/** The mapping rule (x, y) → (x/b + h, ay + k). */
export function mappingRule(t: Transform): string {
  const invB = new Q(t.b.d, t.b.n);
  const xPart = `${invB.eq(1) ? 'x' : invB.eq(-1) ? '-x' : invB.isInt ? `${invB.n}x` : `${invB.typst()} x`}${t.h === 0 ? '' : ` ${t.h > 0 ? '+' : '-'} ${Math.abs(t.h)}`}`;
  const yPart = `${t.a.eq(1) ? 'y' : t.a.eq(-1) ? '-y' : t.a.isInt ? `${t.a.n}y` : `${t.a.typst()} y`}${t.k === 0 ? '' : ` ${t.k > 0 ? '+' : '-'} ${Math.abs(t.k)}`}`;
  return `(x, y) -> (${xPart}, ${yPart})`;
}

export interface Window { xMin: number; xMax: number; yMin: number; yMax: number }

/** A window that shows every point with a margin, snapped to whole numbers. */
export function fitWindow(sets: Pt[][], pad = 1, min = 5): Window {
  const all = sets.flat();
  const xs = all.map(([x]) => x), ys = all.map(([, y]) => y);
  const half = (lo: number, hi: number) => Math.max(min, Math.ceil(Math.max(Math.abs(lo), Math.abs(hi)) + pad));
  const X = half(Math.min(...xs), Math.max(...xs)), Y = half(Math.min(...ys), Math.max(...ys));
  const S = Math.max(X, Y);
  return { xMin: -S, xMax: S, yMin: -S, yMax: S };
}

/** Graph piecewise-linear functions: the last one solid with dots at its key points, earlier ones faint. */
export function plGraph(sets: PL[], size: number, window?: Window): string {
  const w = window ?? fitWindow(sets);
  const curves: Curve[] = sets.map((points, i) => ({ points, faint: i < sets.length - 1 }));
  const dots: Dot[] = sets[sets.length - 1].map(([x, y]) => ({ x, y }));
  const step = w.xMax - w.xMin > 16 ? 2 : 1;
  return graphTypst({ ...w, xStep: step, yStep: step, width: size, height: size, curves, dots });
}

// ── Polynomials as coefficient lists, highest power first ─────────────────

export function polyMul(p: number[], q: number[]): number[] {
  const out = new Array(p.length + q.length - 1).fill(0);
  p.forEach((a, i) => q.forEach((b, j) => { out[i + j] += a * b; }));
  return out;
}

export function polyAdd(p: number[], q: number[], sign = 1): number[] {
  const n = Math.max(p.length, q.length);
  const pp = [...new Array(n - p.length).fill(0), ...p], qq = [...new Array(n - q.length).fill(0), ...q];
  const out = pp.map((a, i) => a + sign * qq[i]);
  while (out.length > 1 && out[0] === 0) out.shift();
  return out;
}

export function polyEval(p: number[], x: number): number {
  return p.reduce((acc, c) => acc * x + c, 0);
}

/** From integer roots (with multiplicity) and a leading coefficient. */
export function fromRoots(roots: number[], lead = 1): number[] {
  return roots.reduce((acc, r) => polyMul(acc, [1, -r]), [lead]);
}

/** Synthetic division by (x − a): quotient coefficients and remainder. */
export function synthetic(p: number[], a: number): { quotient: number[]; remainder: number } {
  const out: number[] = [];
  let carry = 0;
  for (const c of p) { carry = carry * a + c; out.push(carry); }
  const remainder = out.pop()!;
  return { quotient: out, remainder };
}

export { poly };

/** `(x - 3)`, `(x + 2)`, `x` for a root at 0, with an optional power. */
export function factorText(root: number, power = 1): string {
  const base = root === 0 ? 'x' : `(x ${root > 0 ? '-' : '+'} ${Math.abs(root)})`;
  return power === 1 ? base : `${base}^${power}`;
}

/** Factored form from roots, grouping repeated roots: 2(x - 1)^2 (x + 3). */
export function factoredText(roots: number[], lead = 1): string {
  const counts = new Map<number, number>();
  for (const r of roots) counts.set(r, (counts.get(r) ?? 0) + 1);
  const factors = [...counts].sort((a, b) => b[0] - a[0]).map(([r, m]) => factorText(r, m));
  const leadText = lead === 1 ? '' : lead === -1 ? '-' : String(lead);
  return `${leadText}${factors.join('')}`;
}
