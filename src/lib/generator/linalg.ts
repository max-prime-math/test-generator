// Exact linear algebra for generated problems: rational matrices, row reduction, and
// random systems built backwards from their reduced row-echelon form, so the rank,
// the consistency, and the number of parameters are all known before the system is
// written. Every entry stays an integer or an exact fraction.

import type { Rng } from './rng.ts';
import { Q } from './exact.ts';

export type Mat = Q[][];

export const toQ = (rows: number[][]): Mat => rows.map((r) => r.map((v) => new Q(v)));
export const clone = (m: Mat): Mat => m.map((r) => [...r]);
export const identity = (n: number): Mat => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => new Q(i === j ? 1 : 0)));

export function mul(a: Mat, b: Mat): Mat {
  return a.map((row) => b[0].map((_, j) => row.reduce((s, v, k) => s.add(v.mul(b[k][j])), new Q(0))));
}
export const add = (a: Mat, b: Mat, s = 1): Mat => a.map((r, i) => r.map((v, j) => v.add(b[i][j].mul(s))));
export const scale = (a: Mat, k: number | Q): Mat => a.map((r) => r.map((v) => v.mul(k)));
export const transpose = (a: Mat): Mat => a[0].map((_, j) => a.map((r) => r[j]));

/** Reduced row-echelon form, with the pivot column of each non-zero row. */
export function rref(m: Mat): { R: Mat; pivots: number[] } {
  const R = clone(m);
  const pivots: number[] = [];
  let row = 0;
  for (let col = 0; col < R[0].length && row < R.length; col++) {
    const p = R.findIndex((r, i) => i >= row && r[col].n !== 0);
    if (p < 0) continue;
    [R[row], R[p]] = [R[p], R[row]];
    const lead = R[row][col];
    R[row] = R[row].map((v) => v.div(lead));
    for (let i = 0; i < R.length; i++) {
      if (i === row || R[i][col].n === 0) continue;
      const f = R[i][col];
      R[i] = R[i].map((v, j) => v.sub(f.mul(R[row][j])));
    }
    pivots.push(col);
    row++;
  }
  return { R, pivots };
}
export const rank = (m: Mat): number => rref(m).pivots.length;

export function det(m: Mat): Q {
  const A = clone(m);
  const n = A.length;
  let d = new Q(1);
  for (let c = 0; c < n; c++) {
    const p = A.findIndex((r, i) => i >= c && r[c].n !== 0);
    if (p < 0) return new Q(0);
    if (p !== c) { [A[c], A[p]] = [A[p], A[c]]; d = d.neg(); }
    d = d.mul(A[c][c]);
    for (let i = c + 1; i < n; i++) {
      const f = A[i][c].div(A[c][c]);
      A[i] = A[i].map((v, j) => v.sub(f.mul(A[c][j])));
    }
  }
  return d;
}

export function inverse(m: Mat): Mat | null {
  const n = m.length;
  const { R, pivots } = rref(m.map((r, i) => [...r, ...identity(n)[i]]));
  if (pivots.length < n || pivots[n - 1] >= n) return null;
  return R.map((r) => r.slice(n));
}

export type Solution =
  | { kind: 'unique'; values: Q[] }
  | { kind: 'none' }
  | { kind: 'param'; free: number[]; /** each variable = constant + Σ coef·(free parameter k) */ exprs: Array<{ c: Q; coefs: Q[] }> };

/** Solve A x = b exactly; parametric solutions use the free (non-pivot) variables as parameters. */
export function solve(A: Mat, b: Q[]): Solution {
  const n = A[0].length;
  const { R, pivots } = rref(A.map((r, i) => [...r, b[i]]));
  if (pivots.includes(n)) return { kind: 'none' };
  const free = Array.from({ length: n }, (_, j) => j).filter((j) => !pivots.includes(j));
  const exprs = Array.from({ length: n }, (_, j) => {
    const k = free.indexOf(j);
    if (k >= 0) return { c: new Q(0), coefs: free.map((_, i) => new Q(i === k ? 1 : 0)) };
    const row = R[pivots.indexOf(j)];
    return { c: row[n], coefs: free.map((f) => row[f].neg()) };
  });
  if (!free.length) return { kind: 'unique', values: exprs.map((e) => e.c) };
  return { kind: 'param', free, exprs };
}

/** A random integer matrix with determinant ±1, applied as row operations to `rows` (kept within `bound`). */
function mixRows(rng: Rng, rows: number[][], bound: number, steps: number): number[][] | null {
  let M = rows.map((r) => [...r]);
  const m = M.length;
  if (m === 1) return M.map((r) => r.map((v) => v * rng.pick([1, -1, 2, -2, 3])));
  for (let s = 0; s < steps; s++) {
    const i = rng.int(0, m - 1);
    let j = rng.int(0, m - 1);
    while (j === i) j = rng.int(0, m - 1);
    const k = rng.pick([1, -1, 2, -2, 1, -1, 3]);
    const next = M.map((r) => [...r]);
    next[i] = next[i].map((v, c) => v + k * M[j][c]);
    if (next[i].every((v) => Math.abs(v) <= bound)) M = next;
  }
  M = rng.shuffle(M);
  // A final sign flip per row keeps leading coefficients varied.
  M = M.map((r) => (rng.next() < 0.3 ? r.map((v) => -v) : r));
  return M;
}

export interface SystemSpec {
  vars: number;
  eqs: number;
  rank: number;
  consistent: boolean;
  /** Largest absolute coefficient allowed. */
  bound?: number;
  /** Keep the pivots in the first columns, so the free variables are the last ones. */
  leadingPivots?: boolean;
}
export interface GeneratedSystem { A: number[][]; b: number[]; solution: Solution }

/**
 * A random system with a chosen rank and consistency. It starts from a reduced
 * row-echelon form [R | d] with small integer entries and mixes the rows with
 * determinant ±1 operations, which never change the solution set.
 */
export function randomSystem(rng: Rng, spec: SystemSpec): GeneratedSystem {
  const { vars: n, eqs: m, rank: r } = spec;
  const bound = spec.bound ?? 9;
  if (r > Math.min(n, m) || (!spec.consistent && r >= m)) throw new Error('Impossible system spec');
  for (let attempt = 0; attempt < 400; attempt++) {
    const cols = spec.leadingPivots !== false || rng.next() < 0.5
      ? Array.from({ length: r }, (_, i) => i)
      : rng.shuffle(Array.from({ length: n }, (_, i) => i)).slice(0, r).sort((a, b) => a - b);
    const rows: number[][] = Array.from({ length: m }, () => Array(n + 1).fill(0));
    for (let i = 0; i < r; i++) {
      rows[i][cols[i]] = 1;
      for (let j = cols[i] + 1; j < n; j++) if (!cols.includes(j)) rows[i][j] = rng.int(-3, 3);
      rows[i][n] = rng.int(-6, 6);
    }
    if (!spec.consistent) rows[r][n] = rng.nonZero(-5, 5);
    const mixed = mixRows(rng, rows, bound, 5 * m + 3);
    if (!mixed) continue;
    const A = mixed.map((row) => row.slice(0, n)), b = mixed.map((row) => row[n]);
    // Every equation has at least two variables (or is a visible contradiction), and every variable appears.
    if (A.some((row, i) => row.filter((v) => v !== 0).length < Math.min(2, n) && !(row.every((v) => v === 0) && b[i] !== 0 && m > 2))) continue;
    if (A.some((row) => row.every((v) => v === 0))) continue;
    if (Array.from({ length: n }, (_, j) => j).some((j) => A.every((row) => row[j] === 0))) continue;
    // No repeated equations; beyond rank 1, no equation may be a multiple of another either.
    const aug = mixed.map((row) => row.join());
    if (new Set(aug).size < m) continue;
    if (r > 1 && mixed.some((row, i) => mixed.some((other, j) => j > i && rank(toQ([row, other])) < 2))) continue;
    const solution = solve(toQ(A), b.map((v) => new Q(v)));
    const got = rank(toQ(A));
    if (got !== r || (solution.kind === 'none') === spec.consistent) continue;
    return { A, b, solution };
  }
  throw new Error('Could not build a system');
}

// ── Typst formatting ───────────────────────────────────────────────────────

export const VARS = ['x', 'y', 'z', 'w'];
export const PARAMS = ['t', 's'];

/** `2x - y + 3z = 7`, skipping zero terms; `0 = 5` for an all-zero row. */
export function equation(coefs: Array<number | Q>, rhs: number | Q, names = VARS): string {
  const terms = coefs.map((c, j) => [Q.of(c), names[j]] as const).filter(([c]) => c.n !== 0);
  const left = terms.length ? terms.map(([c, v], i) => {
    const text = c.abs().coef(v);
    return i === 0 ? (c.sign < 0 ? `-${text}` : text) : `${c.sign < 0 ? '-' : '+'} ${text}`;
  }).join(' ') : '0';
  return `${left} = ${Q.of(rhs).typst()}`;
}
/** A system as display math: a brace with one equation per line. */
export const systemText = (A: Array<Array<number | Q>>, b: Array<number | Q>, names = VARS) => `display(cases(${A.map((row, i) => equation(row, b[i], names)).join(', ')}))`;

/** A matrix as Typst math, with an optional augment bar before column `augment`. */
export function matText(M: Array<Array<number | Q>>, augment?: number): string {
  const body = M.map((r) => r.map((v) => Q.of(v).typst()).join(', ')).join('; ');
  return `mat(delim: "[", ${augment !== undefined ? `augment: #${augment}, ` : ''}${body})`;
}

/** `3 - 2t + s`, `t`, `-1/2 t`, `4`. */
export function linearExpr(c: Q, coefs: Q[], params = PARAMS): string {
  const parts: string[] = [];
  if (c.n !== 0) parts.push(c.typst());
  coefs.forEach((k, i) => {
    if (k.n === 0) return;
    const text = k.abs().coef(params[i]);
    parts.push(parts.length ? `${k.sign < 0 ? '-' : '+'} ${text}` : k.sign < 0 ? `-${text}` : text);
  });
  return parts.length ? parts.join(' ') : '0';
}

/** A solution set as text: `(x, y, z) = (1, -2, 3)`, `(x, y, z) = (2 - t, 1 + 3t, t)`, or "no solution". */
export function solutionText(s: Solution, n: number): string {
  const tuple = `(${VARS.slice(0, n).join(', ')})`;
  if (s.kind === 'none') return '"no solution"';
  if (s.kind === 'unique') return `${tuple} = (${s.values.map((v) => v.typst()).join(', ')})`;
  return `${tuple} = (${s.exprs.map((e) => linearExpr(e.c, e.coefs)).join(', ')})`;
}
