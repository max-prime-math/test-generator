// Typst math formatting for generated problems. Everything here returns Typst
// math source (without the surrounding `$`), written so that generated output
// never shows `+ -3`, `1x`, `x^1`, or `0x^2`.

export function gcd(a: number, b: number): number {
  a = Math.abs(a); b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

export function lcm(a: number, b: number): number {
  return Math.abs(a * b) / gcd(a, b);
}

export interface Fraction { n: number; d: number }

/** Reduce a fraction and keep the sign on the numerator. */
export function reduce(n: number, d: number): Fraction {
  if (d === 0) throw new Error('Zero denominator');
  const g = gcd(n, d) || 1;
  const sign = d < 0 ? -1 : 1;
  return { n: (sign * n) / g, d: (sign * d) / g };
}

/** A number or fraction as Typst math: `3`, `-3/4`. */
export function frac(n: number, d = 1): string {
  const f = reduce(n, d);
  if (f.d === 1) return String(f.n);
  return f.n < 0 ? `-${-f.n}/${f.d}` : `${f.n}/${f.d}`;
}

/** Variables with powers, e.g. [['x', 2], ['y', 1]] → `x^2 y`. Zero powers are dropped. */
export type Powers = Array<[name: string, power: number]>;

export function variables(powers: Powers): string {
  return powers
    .filter(([, p]) => p !== 0)
    .map(([name, p]) => (p === 1 ? name : p < 0 ? `${name}^(${p})` : `${name}^${p}`))
    .join(' ');
}

/** A single term such as `-3x^2 y`, `x`, `-y`, or `7`. */
export function monomial(coef: number, powers: Powers = []): string {
  const vars = variables(powers);
  if (coef === 0) return '0';
  if (!vars) return String(coef);
  if (coef === 1) return vars;
  if (coef === -1) return `-${vars}`;
  return `${coef}${vars}`;
}

export interface Term { coef: number; powers?: Powers }

/** Join terms with correct signs, skipping zero terms: `2x^2 - 5x + 3`. */
export function polynomial(terms: Term[]): string {
  const kept = terms.filter((t) => t.coef !== 0);
  if (!kept.length) return '0';
  return kept
    .map((t, i) => {
      const text = monomial(Math.abs(t.coef), t.powers);
      if (i === 0) return t.coef < 0 ? `-${text}` : text;
      return t.coef < 0 ? ` - ${text}` : ` + ${text}`;
    })
    .join('');
}

/** A single-variable polynomial from coefficients, highest power first: [2, -5, 3] → `2x^2 - 5x + 3`. */
export function poly(coefs: number[], name = 'x'): string {
  const degree = coefs.length - 1;
  return polynomial(coefs.map((coef, i) => ({ coef, powers: [[name, degree - i]] as Powers })));
}

/** `(ax + b)`: a binomial in parentheses, ready to multiply. */
export function paren(text: string): string {
  return `(${text})`;
}

/**
 * A monomial with a fractional coefficient and only positive exponents,
 * e.g. coefficient 3/4 and powers x^2 y^-3 → `(3x^2)/(4y^3)`.
 */
export function monomialQuotient(n: number, d: number, powers: Powers): string {
  const f = reduce(n, d);
  const top = powers.filter(([, p]) => p > 0);
  const bottom = powers.filter(([, p]) => p < 0).map(([name, p]) => [name, -p] as [string, number]);
  const sign = f.n < 0 ? '-' : '';
  const numerator = monomial(Math.abs(f.n), top);
  if (f.d === 1 && !bottom.length) return sign + numerator;
  const denominator = monomial(f.d, bottom);
  const wrap = (text: string) => (/^([0-9]+|[a-z])$/i.test(text) ? text : `(${text})`);
  return `${sign}${wrap(numerator)}/${wrap(denominator)}`;
}

/** A signed number to follow an operator: `+ 3` / `- 3`. */
export function signed(value: number): string {
  return value < 0 ? `- ${-value}` : `+ ${value}`;
}

/** Wrap a negative number in parentheses for substitution: `(-3)`. */
export function sub(value: number | string): string {
  const text = String(value);
  return text.startsWith('-') ? `(${text})` : text;
}

/** Round to a fixed number of decimal places: `12.0`, `7.3`. */
export function round(value: number, places = 1): string {
  const factor = 10 ** places;
  const rounded = Math.round(value * factor) / factor;
  return rounded.toFixed(places);
}

/** A whole number for Typst math, grouped in threes with thin spaces from 10 000 up (SI style): `6 760 000`. */
export function grouped(value: number): string {
  const text = String(Math.abs(value));
  const body = Math.abs(value) < 10000 ? text : text.replace(/\B(?=(\d{3})+(?!\d))/g, ' thin ');
  return value < 0 ? `-${body}` : body;
}
