import { exactTrig, Q, Surds, type TrigFn } from '../../exact.ts';

/** Exact arithmetic for these families; every divisor has at most two radical terms. */
export function divideSurds(top: Surds, bottom: Surds): Surds {
  if (!bottom.terms.size) throw new Error('Division by zero in an exact trig expression.');
  if (bottom.isRational) return top.div(bottom.rational);
  if (bottom.terms.size > 2) throw new Error('Expected a divisor with at most two radical terms.');
  const conjugate = bottom.conjugate();
  const norm = bottom.mul(conjugate);
  if (!norm.isRational || norm.rational.eq(0)) throw new Error('Cannot rationalize this exact trig divisor.');
  return top.mul(conjugate).div(norm.rational);
}

export function sameSurds(a: Surds, b: Surds): boolean {
  return a.terms.size === b.terms.size && [...a.terms].every(([r, c]) => c.eq(b.terms.get(r) ?? new Q(0)));
}

export interface TrigTerm { fn: TrigFn; degrees: number; power: number }
export interface CompoundTrig { terms: TrigTerm[]; task: 'product' | 'sum' | 'sum-product'; sign: 1 | -1 }
export function termValue(term: TrigTerm): Surds {
  const e = exactTrig(term.fn, term.degrees);
  if (!e) throw new Error('The selected trig ratio is undefined.');
  if (!Number.isInteger(term.power) || term.power < 1 || term.power > 3) throw new Error('Expected a power from 1 to 3.');
  const value = new Surds([[new Q(e.a, e.d), 1], [new Q(e.b, e.d), e.r]]);
  let result = Surds.of(1);
  for (let n = 0; n < term.power; n++) result = result.mul(value);
  return result;
}
export function compoundValue(model: CompoundTrig): Surds {
  const expected = model.task === 'sum-product' ? 3 : 2;
  if (model.terms.length !== expected) throw new Error(`This task needs ${expected} terms.`);
  const [a, b, c] = model.terms.map(termValue);
  return model.task === 'product' ? a.mul(b) : a.add((model.task === 'sum' ? b : b.mul(c)).scale(model.sign));
}

export type Quadrant = 1 | 2 | 3 | 4;
export interface RatioGiven { fn: TrigFn; value: Q; quadrant: Quadrant }
export interface AngleRatios { sin: Surds; cos: Surds }
export interface TwoAngleTrig {
  alpha: RatioGiven; beta: RatioGiven;
  operation: '+' | '-'; fn: TrigFn; paired: boolean; inferQuadrant: boolean;
}
export const SIN_SIGN = [0, 1, 1, -1, -1];
export const COS_SIGN = [0, 1, -1, -1, 1];
export const quadrantName = (q: Quadrant) => ['I', 'II', 'III', 'IV'][q - 1];
export function ratioSign(fn: TrigFn, quadrant: Quadrant): number {
  return fn === 'sin' || fn === 'csc' ? SIN_SIGN[quadrant]
    : fn === 'cos' || fn === 'sec' ? COS_SIGN[quadrant] : SIN_SIGN[quadrant] * COS_SIGN[quadrant];
}

/** Recover both primary ratios, retaining the signs fixed by the quadrant. */
export function recoverRatios(given: RatioGiven): AngleRatios {
  const { fn, quadrant } = given;
  const q = given.value;
  if (!q.n || q.sign !== ratioSign(fn, quadrant)) throw new Error('The given ratio and quadrant are inconsistent.');
  if (fn === 'sin' || fn === 'cos' || fn === 'csc' || fn === 'sec') {
    const known = fn === 'csc' || fn === 'sec' ? new Q(1).div(q) : q;
    if (Math.abs(known.value) >= 1) throw new Error('An angle inside a quadrant must have sine/cosine magnitude less than 1.');
    const isSin = fn === 'sin' || fn === 'csc';
    const missing = Surds.of(new Q(isSin ? COS_SIGN[quadrant] : SIN_SIGN[quadrant], known.d), known.d ** 2 - known.n ** 2);
    return isSin ? { sin: Surds.of(known), cos: missing } : { sin: missing, cos: Surds.of(known) };
  }
  // Rationalize b / sqrt(a²+b²), rather than storing a decimal square root.
  const norm = q.n ** 2 + q.d ** 2;
  const primary = Surds.of(new Q((fn === 'tan' ? COS_SIGN[quadrant] : SIN_SIGN[quadrant]) * q.d, norm), norm);
  return fn === 'tan' ? { cos: primary, sin: primary.scale(q) } : { sin: primary, cos: primary.scale(q) };
}

export function combinedRatios(model: TwoAngleTrig): AngleRatios {
  const a = recoverRatios(model.alpha), b = recoverRatios(model.beta);
  const sign = model.operation === '+' ? 1 : -1;
  return {
    sin: a.sin.mul(b.cos).add(a.cos.mul(b.sin).scale(sign)),
    cos: a.cos.mul(b.cos).sub(a.sin.mul(b.sin).scale(sign)),
  };
}
export function ratioValue(fn: TrigFn, ratios: AngleRatios): Surds {
  switch (fn) {
    case 'sin': return ratios.sin;
    case 'cos': return ratios.cos;
    case 'tan': return divideSurds(ratios.sin, ratios.cos);
    case 'csc': return divideSurds(Surds.of(1), ratios.sin);
    case 'sec': return divideSurds(Surds.of(1), ratios.cos);
    case 'cot': return divideSurds(ratios.cos, ratios.sin);
  }
}

/** Fixed mathematical reference cases; practice generation uses the same models. */
export const COMPOUND_EXAMPLES: Record<string, CompoundTrig> = {
  '2026-jun-q25': { task: 'sum-product', sign: 1, terms: [{ fn: 'tan', degrees: 135, power: 3 }, { fn: 'csc', degrees: -240, power: 1 }, { fn: 'cos', degrees: 390, power: 1 }] },
  '2026-jan-q37': { task: 'sum-product', sign: 1, terms: [{ fn: 'cos', degrees: 660, power: 1 }, { fn: 'csc', degrees: -60, power: 1 }, { fn: 'cot', degrees: 330, power: 1 }] },
  '2025-jun-q28': { task: 'product', sign: 1, terms: [{ fn: 'sec', degrees: 225, power: 2 }, { fn: 'tan', degrees: -120, power: 2 }] },
};
export const TWO_ANGLE_EXAMPLES: Record<string, TwoAngleTrig> = {
  '2026-jun-q31': { alpha: { fn: 'cos', value: new Q(-1, 3), quadrant: 3 }, beta: { fn: 'sin', value: new Q(-2, 3), quadrant: 3 }, operation: '-', fn: 'sin', paired: false, inferQuadrant: true },
  '2025-jun-q35': { alpha: { fn: 'cos', value: new Q(-4, 7), quadrant: 3 }, beta: { fn: 'sin', value: new Q(5, 13), quadrant: 2 }, operation: '+', fn: 'cos', paired: true, inferQuadrant: false },
  '2025-jan-q31': { alpha: { fn: 'sin', value: new Q(-4, 5), quadrant: 3 }, beta: { fn: 'cos', value: new Q(12, 13), quadrant: 4 }, operation: '-', fn: 'cos', paired: false, inferQuadrant: false },
};
