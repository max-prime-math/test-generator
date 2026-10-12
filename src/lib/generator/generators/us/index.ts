import { PREALGEBRA_NUMBER } from './prealgebra-number.ts';
import { PREALGEBRA_ALGEBRA } from './prealgebra-algebra.ts';
import { PREALGEBRA_GEOMETRY } from './prealgebra-geometry.ts';
import { STATISTICS } from './statistics.ts';
import { ALGEBRA_1 } from './algebra1.ts';
import { ALGEBRA_2_MATRICES } from './algebra2-matrices.ts';
import { ALGEBRA_2_POLYNOMIALS } from './algebra2-polynomials.ts';
import { CONICS } from './conics.ts';
import { ALGEBRA_2_ADVANCED } from './algebra2-advanced.ts';
import { PROBABILITY } from './probability.ts';
import { PRECALC_FUNCTIONS } from './precalc-functions.ts';
import { PRECALC_POLAR_VECTORS } from './precalc-polar-vectors.ts';
import { CALCULUS_DERIVATIVES } from './calculus-derivatives.ts';
import { CALCULUS_APPLICATIONS } from './calculus-applications.ts';
import { CALCULUS_INTEGRALS } from './calculus-integrals.ts';

/** Generators for the U.S.-style courses (Pre-Algebra to Calculus), in catalogue order of their first course. */
export const US_GENERATORS = [
  ...PREALGEBRA_NUMBER, ...PREALGEBRA_ALGEBRA, ...PREALGEBRA_GEOMETRY, ...STATISTICS, ...ALGEBRA_1,
  ...ALGEBRA_2_MATRICES, ...ALGEBRA_2_POLYNOMIALS, ...CONICS, ...ALGEBRA_2_ADVANCED, ...PROBABILITY,
  ...PRECALC_FUNCTIONS, ...PRECALC_POLAR_VECTORS,
  ...CALCULUS_DERIVATIVES, ...CALCULUS_APPLICATIONS, ...CALCULUS_INTEGRALS,
];
