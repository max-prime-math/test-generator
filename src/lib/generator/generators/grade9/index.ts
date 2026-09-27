import type { Generator } from '../../types.ts';
import { DATA_10F } from './data.ts';
import { GEOMETRY_10F } from './geometry.ts';
import { NUMBER_10F } from './number.ts';
import { PATTERNS_10F } from './patterns.ts';
import { POLYNOMIALS_10F } from './polynomials.ts';

export const GRADE9_GENERATORS: Generator[] = [
  ...NUMBER_10F,
  ...PATTERNS_10F,
  ...POLYNOMIALS_10F,
  ...GEOMETRY_10F,
  ...DATA_10F,
];
