import type { Generator } from '../../types.ts';
import { LINES_10I } from './lines.ts';
import { MEASUREMENT_10I } from './measurement.ts';
import { NUMBER_10I } from './number.ts';
import { POLYNOMIAL_10I } from './polynomials.ts';
import { RELATIONS_10I } from './relations.ts';
import { TRIG_10I } from './trig.ts';

export const GRADE10_GENERATORS: Generator[] = [
  ...MEASUREMENT_10I,
  ...TRIG_10I,
  ...NUMBER_10I,
  ...POLYNOMIAL_10I,
  ...RELATIONS_10I,
  ...LINES_10I,
];
