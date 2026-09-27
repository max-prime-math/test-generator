import type { Generator } from '../../types.ts';
import { ABSOLUTE_30S } from './absolute.ts';
import { ALGEBRA_30S } from './algebra.ts';
import { FACTORING_30S } from './factoring.ts';
import { QUADRATIC_30S } from './quadratics.ts';
import { RATIONAL_30S } from './rational.ts';
import { SEQUENCE_30S } from './sequences.ts';
import { SYSTEM_30S } from './systems.ts';
import { TRIG_30S } from './trig.ts';

/** Every Pre-Calculus 30S generator, in catalogue order. */
export const PC30S_GENERATORS: Generator[] = [
  ...ALGEBRA_30S,
  ...RATIONAL_30S,
  ...TRIG_30S,
  ...FACTORING_30S,
  ...ABSOLUTE_30S,
  ...QUADRATIC_30S,
  ...SEQUENCE_30S, ...SYSTEM_30S,
];
