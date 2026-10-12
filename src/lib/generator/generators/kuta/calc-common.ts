// Shared helpers for the Calculus generators: sums of power terms c·xⁿ with
// rational exponents (for the power rule and its reverse), and polynomial
// calculus on coefficient lists.
import type { Rng } from '../../rng.ts';
import { Q } from '../../exact.ts';
import { poly } from '../../format.ts';

/** c·xⁿ with rational c and n. */
export interface Pow { c: Q; n: Q }

/**
 * One power term as Typst: `3x^2`, `-x`, `5`, `4x^(1/2)` or `4sqrt(x)`, `2x^(-3)` or `2/x^3`.
 * `radical` writes roots and denominators the way a student would; otherwise exponents stay.
 */
export function powText(t: Pow, v = 'x', radical = false): string {
  const { c, n } = t;
  if (c.eq(0)) return '0';
  if (n.eq(0)) return c.typst();
  const neg = c.sign < 0, mag = c.abs();
  let body: string;
  if (radical && n.sign < 0) {
    // c/xᵏ, keeping a fractional coefficient's denominator below.
    const k = n.neg();
    const base = k.eq(1) ? v : k.isInt ? `${v}^${k.n}` : radicalOf(k, v);
    const top = mag.n === 1 ? '1' : String(mag.n);
    const bottom = mag.d === 1 ? base : `${mag.d}${base}`;
    body = `${top}/${/^([a-z]|\d+)(\^\d+)?$|^sqrt\([a-z](\^\d+)?\)$/.test(bottom) ? bottom : `(${bottom})`}`;
    return neg ? `-${body}` : body;
  }
  const varPart = n.eq(1) ? v : radical && !n.isInt ? radicalOf(n, v) : `${v}^${n.isInt ? (n.n < 0 ? `(${n.n})` : n.n) : `(${n.typst()})`}`;
  const coef = mag.eq(1) ? '' : mag.isInt ? String(mag.n) : `${mag.typst()} `;
  body = `${coef}${varPart}`;
  return neg ? `-${body}` : body;
}

/** x^(p/q) as a radical: √x, ∛(x²), x√x is left as x^(3/2) → `(sqrt(x))^3`. */
function radicalOf(n: Q, v: string): string {
  const p = n.n, q = n.d;
  const inner = p === 1 ? v : `${v}^${p}`;
  return q === 2 ? `sqrt(${inner})` : `root(${q}, ${inner})`;
}

/** A sum of power terms, highest exponent first, with correct signs. */
export function powsText(terms: Pow[], v = 'x', radical = false): string {
  const kept = [...terms].filter((t) => !t.c.eq(0)).sort((a, b) => b.n.value - a.n.value);
  if (!kept.length) return '0';
  return kept.map((t, i) => {
    const text = powText(t, v, radical);
    if (i === 0) return text;
    return text.startsWith('-') ? ` - ${text.slice(1)}` : ` + ${text}`;
  }).join('');
}

export const dPow = (t: Pow): Pow => ({ c: t.c.mul(t.n), n: t.n.sub(1) });
/** Antiderivative of c·xⁿ (n ≠ −1). */
export const iPow = (t: Pow): Pow => ({ c: t.c.div(t.n.add(1)), n: t.n.add(1) });
export const evalPow = (terms: Pow[], x: number) => terms.reduce((s, t) => s + t.c.value * x ** t.n.value, 0);

/** Polynomial derivative, highest power first. */
export function polyD(p: number[]): number[] {
  const n = p.length - 1;
  return n === 0 ? [0] : p.slice(0, -1).map((c, i) => c * (n - i));
}
/** Exact antiderivative coefficients (constant 0), highest power first. */
export function polyI(p: number[]): Q[] {
  const n = p.length - 1;
  return [...p.map((c, i) => new Q(c, n - i + 1)), new Q(0)];
}
/** Exact value of a polynomial with rational coefficients. */
export function polyQ(p: Q[], x: number | Q): Q {
  return p.reduce((acc, c) => acc.mul(x).add(c), new Q(0));
}
/** A polynomial with rational coefficients as Typst. */
export function polyQText(p: Q[], v = 'x'): string {
  const n = p.length - 1;
  const parts = p.map((c, i) => ({ c, k: n - i })).filter((t) => !t.c.eq(0));
  if (!parts.length) return '0';
  return parts.map(({ c, k }, i) => {
    const mag = c.abs();
    const varPart = k === 0 ? '' : k === 1 ? v : `${v}^${k}`;
    const coef = k === 0 ? mag.typst() : mag.eq(1) ? '' : mag.isInt ? mag.typst() : `${mag.typst()} `;
    const text = `${coef}${varPart}`;
    return i === 0 ? (c.sign < 0 ? `-${text}` : text) : ` ${c.sign < 0 ? '-' : '+'} ${text}`;
  }).join('');
}

/** A random polynomial of the given degree with a non-zero leading coefficient. */
export function randomPoly(rng: Rng, degree: number, N = 6): number[] {
  return Array.from({ length: degree + 1 }, (_, i) => (i === 0 ? rng.nonZero(-N, N) : rng.int(-N, N)));
}

export { poly };
/** "dy/dx", "f'(x)" and friends. */
export const prime = (name = 'f', v = 'x') => `${name}'(${v})`;
