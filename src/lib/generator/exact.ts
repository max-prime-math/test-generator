// Exact values for generated problems: rational arithmetic, simplified
// radicals, special-angle trigonometry, and radian measures. Every `typst`
// result is Typst math source without the surrounding `$`.

import { gcd, reduce, type Fraction } from './format.ts';

/** An exact rational number. */
export class Q {
  readonly n: number;
  readonly d: number;
  constructor(n: number, d = 1) {
    const f = reduce(n, d);
    this.n = f.n === 0 ? 0 : f.n;
    this.d = f.d;
  }
  static of(value: number | Q | Fraction): Q {
    return value instanceof Q ? value : typeof value === 'number' ? new Q(value) : new Q(value.n, value.d);
  }
  add(o: number | Q): Q { const b = Q.of(o); return new Q(this.n * b.d + b.n * this.d, this.d * b.d); }
  sub(o: number | Q): Q { const b = Q.of(o); return new Q(this.n * b.d - b.n * this.d, this.d * b.d); }
  mul(o: number | Q): Q { const b = Q.of(o); return new Q(this.n * b.n, this.d * b.d); }
  div(o: number | Q): Q { const b = Q.of(o); return new Q(this.n * b.d, this.d * b.n); }
  neg(): Q { return new Q(-this.n, this.d); }
  abs(): Q { return new Q(Math.abs(this.n), this.d); }
  eq(o: number | Q): boolean { const b = Q.of(o); return this.n === b.n && this.d === b.d; }
  get isInt(): boolean { return this.d === 1; }
  get value(): number { return this.n / this.d; }
  get sign(): number { return Math.sign(this.n); }
  /** `3`, `-3/4`. */
  typst(): string {
    if (this.d === 1) return String(this.n);
    return this.n < 0 ? `-${-this.n}/${this.d}` : `${this.n}/${this.d}`;
  }
  /** As a coefficient of a variable: `x`, `-x`, `3x`, `3/4 x`. */
  coef(variable: string): string {
    if (this.eq(1)) return variable;
    if (this.eq(-1)) return `-${variable}`;
    return this.isInt ? `${this.n}${variable}` : `${this.typst()} ${variable}`;
  }
  /** Parenthesised when negative or fractional, for substitution: `(-3)`, `(3/4)`. */
  paren(): string {
    return this.n < 0 || this.d !== 1 ? `(${this.typst()})` : this.typst();
  }
}

/** n = coef² · radicand, with the radicand square-free. */
export function simplifySqrt(n: number): { coef: number; radicand: number } {
  let coef = 1, radicand = n;
  for (let f = 2; f * f <= radicand; f++) {
    while (radicand % (f * f) === 0) { radicand /= f * f; coef *= f; }
  }
  return { coef, radicand };
}

/** (a + b√r) / d as Typst math, reduced; r = 1 means rational. */
export function surd(a: number, b: number, r: number, d = 1): string {
  if (r !== 1) {
    const s = simplifySqrt(r);
    b *= s.coef; r = s.radicand;
  }
  if (r === 1) { a += b; b = 0; }
  if (d < 0) { a = -a; b = -b; d = -d; }
  const g = gcd(gcd(a, b), d) || 1;
  a /= g; b /= g; d /= g;
  const root = (k: number) => (k === 1 ? `sqrt(${r})` : k === -1 ? `-sqrt(${r})` : `${k}sqrt(${r})`);
  // A fraction whose numerator is all negative shows the minus in front: -1/2, -sqrt(3)/2.
  let sign = '';
  if (d !== 1 && a <= 0 && b <= 0 && (a !== 0 || b !== 0)) { sign = '-'; a = -a; b = -b; }
  let top: string;
  if (b === 0) top = String(a);
  else if (a === 0) top = root(b);
  else top = `${a} ${b < 0 ? '-' : '+'} ${root(Math.abs(b))}`;
  if (d === 1) return top;
  const wrapped = /^[0-9]+$|^sqrt\([0-9]+\)$/.test(top) ? top : `(${top})`;
  return `${sign}${wrapped}/${d}`;
}

// ── Special angles ─────────────────────────────────────────────────────────

export type TrigFn = 'sin' | 'cos' | 'tan' | 'csc' | 'sec' | 'cot';
export const TRIG_FNS: TrigFn[] = ['sin', 'cos', 'tan', 'csc', 'sec', 'cot'];
const RECIPROCAL: Record<TrigFn, TrigFn> = { sin: 'csc', cos: 'sec', tan: 'cot', csc: 'sin', sec: 'cos', cot: 'tan' };

/** An exact value a + b√r over d, or undefined. */
export interface Exact { a: number; b: number; r: number; d: number }
const E = (a: number, b = 0, r = 1, d = 1): Exact => ({ a, b, r, d });

/** Exact magnitudes of each function at the reference angles; null = undefined. */
const MAGNITUDE: Record<number, Record<TrigFn, Exact | null>> = {
  0: { sin: E(0), cos: E(1), tan: E(0), csc: null, sec: E(1), cot: null },
  30: { sin: E(1, 0, 1, 2), cos: E(0, 1, 3, 2), tan: E(0, 1, 3, 3), csc: E(2), sec: E(0, 2, 3, 3), cot: E(0, 1, 3) },
  45: { sin: E(0, 1, 2, 2), cos: E(0, 1, 2, 2), tan: E(1), csc: E(0, 1, 2), sec: E(0, 1, 2), cot: E(1) },
  60: { sin: E(0, 1, 3, 2), cos: E(1, 0, 1, 2), tan: E(0, 1, 3), csc: E(0, 2, 3, 3), sec: E(2), cot: E(0, 1, 3, 3) },
  90: { sin: E(1), cos: E(0), tan: null, csc: E(1), sec: null, cot: E(0) },
};

function exactNumber(e: Exact): number { return (e.a + e.b * Math.sqrt(e.r)) / e.d; }

/** Exact value of a trig function at a multiple of 30° or 45°, or null when undefined. */
export function exactTrig(fn: TrigFn, degrees: number): Exact | null {
  const angle = ((degrees % 360) + 360) % 360;
  const ref = angle <= 90 ? angle : angle <= 180 ? 180 - angle : angle <= 270 ? angle - 180 : 360 - angle;
  const table = MAGNITUDE[ref];
  if (!table) throw new Error(`${degrees}° is not a special angle`);
  const magnitude = table[fn];
  if (!magnitude) return null;
  // The quadrant decides the sign; zero values need none.
  const r = (angle * Math.PI) / 180;
  const s = Math.round(Math.sin(r) * 1e9), c = Math.round(Math.cos(r) * 1e9);
  const sign = fn === 'sin' || fn === 'csc' ? Math.sign(s) : fn === 'cos' || fn === 'sec' ? Math.sign(c) : Math.sign(s) * Math.sign(c);
  const k = sign < 0 ? -1 : 1;
  return E(magnitude.a * k, magnitude.b * k, magnitude.r, magnitude.d);
}

export function exactTypst(e: Exact | null): string {
  return e ? surd(e.a, e.b, e.r, e.d) : '"undefined"';
}

export function exactValue(e: Exact | null): number {
  return e ? exactNumber(e) : NaN;
}

export function reciprocalFn(fn: TrigFn): TrigFn { return RECIPROCAL[fn]; }

/** Special angles in [0°, 360°): multiples of 30° and 45°. */
export const SPECIAL_ANGLES = [0, 30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330];

// ── Radians ────────────────────────────────────────────────────────────────

/** Degrees as an exact multiple of π: 150 → `(5pi)/6`, -90 → `-pi/2`, 0 → `0`. */
export function radians(degrees: number): string {
  const f = new Q(degrees, 180);
  if (f.n === 0) return '0';
  const sign = f.n < 0 ? '-' : '';
  const k = Math.abs(f.n);
  const top = k === 1 ? 'pi' : `${k}pi`;
  if (f.d === 1) return `${sign}${top}`;
  return `${sign}${k === 1 ? top : `(${top})`}/${f.d}`;
}

/** Degrees with a degree sign: `150°`. */
export function deg(degrees: number): string {
  return `${degrees}°`;
}

/** An angle in the requested unit. */
export function angle(degrees: number, unit: 'deg' | 'rad'): string {
  return unit === 'deg' ? deg(degrees) : radians(degrees);
}

// ── Sums of square roots ───────────────────────────────────────────────────

/** An exact sum of rational multiples of square roots: 3√2 − √6 + 1/2. */
export class Surds {
  /** radicand (square-free) → coefficient; radicand 1 is the rational part. */
  readonly terms: Map<number, Q>;
  constructor(terms: Array<[coef: number | Q, radicand: number]> = []) {
    this.terms = new Map();
    for (const [c, r] of terms) this.addTerm(Q.of(c), r);
  }
  private addTerm(c: Q, r: number) {
    const { coef, radicand } = simplifySqrt(r);
    const value = c.mul(coef);
    const next = (this.terms.get(radicand) ?? new Q(0)).add(value);
    if (next.eq(0)) this.terms.delete(radicand); else this.terms.set(radicand, next);
  }
  static of(c: number | Q, r = 1): Surds { return new Surds([[c, r]]); }
  add(o: Surds): Surds { const out = this.clone(); for (const [r, c] of o.terms) out.addTerm(c, r); return out; }
  sub(o: Surds): Surds { return this.add(o.scale(-1)); }
  scale(k: number | Q): Surds { return new Surds([...this.terms].map(([r, c]) => [c.mul(k), r])); }
  mul(o: Surds): Surds {
    const out = new Surds();
    for (const [r1, c1] of this.terms) for (const [r2, c2] of o.terms) out.addTerm(c1.mul(c2), r1 * r2);
    return out;
  }
  /** Divide by a rational number. */
  div(k: number | Q): Surds { return this.scale(new Q(1).div(k)); }
  /**
   * The conjugate of a two-term sum: a + b√r → a − b√r, and a√p + b√q → a√p − b√q
   * (the term with the smaller radicand changes sign).
   */
  conjugate(): Surds {
    // Keep the term that is written first and change the sign of the other, so √2 − 1 → √2 + 1.
    const [lead] = this.displayOrder();
    return new Surds([...this.terms].map(([r, c]) => [r === lead?.[0] ? c : c.neg(), r]));
  }
  /** Terms in the order they are written: rational part first, then larger radicands, led by a positive term. */
  private displayOrder(): Array<[number, Q]> {
    const entries = [...this.terms].sort((a, b) => (a[0] === 1 ? -1 : b[0] === 1 ? 1 : b[0] - a[0]));
    const firstPositive = entries.findIndex(([, c]) => c.sign > 0);
    if (firstPositive > 0) entries.unshift(...entries.splice(firstPositive, 1));
    return entries;
  }
  clone(): Surds { return new Surds([...this.terms].map(([r, c]) => [c, r])); }
  get value(): number { return [...this.terms].reduce((s, [r, c]) => s + c.value * Math.sqrt(r), 0); }
  get isRational(): boolean { return [...this.terms.keys()].every((r) => r === 1); }
  /** The rational part, when the sum has no roots left. */
  get rational(): Q { return this.terms.get(1) ?? new Q(0); }
  /** Typst over one common denominator: (3sqrt(2) - sqrt(6))/2. */
  typst(): string {
    // The rational part first, then larger radicands, led by a positive term: 3 - sqrt(5), 3sqrt(2) - sqrt(6).
    const entries = this.displayOrder();
    if (!entries.length) return '0';
    const den = entries.reduce((d, [, c]) => (d * c.d) / gcdInt(d, c.d), 1);
    const parts = entries.map(([r, c]) => [r, (c.n * den) / c.d] as const);
    // Pull an overall minus sign out front when every term is negative.
    const allNegative = parts.every(([, n]) => n < 0);
    const sign = allNegative && den !== 1 ? '-' : '';
    const numer = parts.map(([r, n], i) => {
      const m = allNegative && den !== 1 ? -n : n;
      const mag = Math.abs(m);
      const body = r === 1 ? String(mag) : `${mag === 1 ? '' : mag}sqrt(${r})`;
      return i === 0 ? (m < 0 ? `-${body}` : body) : ` ${m < 0 ? '-' : '+'} ${body}`;
    }).join('');
    if (den === 1) return numer;
    // Only a bare number or a bare root can sit over a fraction bar unbracketed: 3sqrt(10)/10 would read as 3·(√10/10).
    const single = /^[0-9]+$|^sqrt\([0-9]+\)$/.test(numer);
    return `${sign}${single ? numer : `(${numer})`}/${den}`;
  }
}

function gcdInt(a: number, b: number): number {
  a = Math.abs(a); b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a || 1;
}

/** n = coef³ · radicand, with no cube factor left in the radicand (sign kept on coef). */
export function simplifyCbrt(n: number): { coef: number; radicand: number } {
  let coef = n < 0 ? -1 : 1, radicand = Math.abs(n);
  for (let f = 2; f * f * f <= radicand; f++) {
    while (radicand % (f * f * f) === 0) { radicand /= f * f * f; coef *= f; }
  }
  return { coef, radicand };
}
