import type { Generator } from '../../types.ts';
import { ALGEBRA_30S } from './algebra.ts';
import { RATIONAL_30S } from './rational.ts';
import { TRIG_30S } from './trig.ts';

/** Every Pre-Calculus 30S generator, in catalogue order. */
export const PC30S_GENERATORS: Generator[] = [
  ...ALGEBRA_30S,
  ...RATIONAL_30S,
  ...TRIG_30S,
];
