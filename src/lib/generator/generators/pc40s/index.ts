import type { Generator } from '../../types.ts';
import { EXACT_TRIG_GENERATORS } from './exact-trig.ts';
import { ANGLE_GENERATORS } from './angles.ts';
import { BINOMIAL_GENERATORS } from './binomial.ts';
import { COUNTING_GENERATORS } from './counting.ts';
import { EXPONENTIAL_GENERATORS } from './exponential.ts';
import { IDENTITY_GENERATORS } from './identities.ts';
import { INVERSE_GENERATORS } from './inverses.ts';
import { LOGARITHM_GENERATORS } from './logarithms.ts';
import { OPERATION_GENERATORS } from './operations.ts';
import { POLYNOMIAL_GENERATORS } from './polynomials.ts';
import { RADICAL_GENERATORS } from './radicals.ts';
import { RATIONAL_GENERATORS } from './rationals.ts';
import { TRANSFORMATION_GENERATORS } from './transformations.ts';
import { TRIG_EQUATION_GENERATORS } from './trig-equations.ts';
import { TRIG_FUNCTION_GENERATORS } from './trig-functions.ts';

/** Every Pre-Calculus 40S generator. */
export const PC40S_GENERATORS: Generator[] = [
  ...TRANSFORMATION_GENERATORS,
  ...OPERATION_GENERATORS,
  ...INVERSE_GENERATORS,
  ...POLYNOMIAL_GENERATORS,
  ...RADICAL_GENERATORS,
  ...RATIONAL_GENERATORS,
  ...ANGLE_GENERATORS,
  ...EXACT_TRIG_GENERATORS,
  ...TRIG_FUNCTION_GENERATORS,
  ...TRIG_EQUATION_GENERATORS,
  ...IDENTITY_GENERATORS,
  ...EXPONENTIAL_GENERATORS,
  ...LOGARITHM_GENERATORS,
  ...COUNTING_GENERATORS,
  ...BINOMIAL_GENERATORS,
];
