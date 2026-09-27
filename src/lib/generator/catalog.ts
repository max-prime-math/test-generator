// Problem types for each Manitoba course, tagged with the outcomes they assess.
// This is the roadmap for generators, the Manitoba counterpart of Kuta's topic
// lists: each entry comes from the course's achievement indicators. A
// generator names the entry it produces with `catalogId`.

/**
 * - text: a text generator can produce the question and answer.
 * - graph: the question or the answer is a graph (needs graph drawing).
 * - proof: an open proof or explanation; better kept as hand-written bank questions.
 */
export type ProblemKind = 'text' | 'graph' | 'proof';

export interface ProblemType {
  /** Stable id, e.g. `40s-log-expand`. */
  id: string;
  title: string;
  outcomes: string[];
  kind: ProblemKind;
}

export interface CatalogUnit {
  name: string;
  types: ProblemType[];
}

export interface CourseCatalog {
  classId: string;
  units: CatalogUnit[];
}

const t = (id: string, title: string, outcomes: string[], kind: ProblemKind = 'text'): ProblemType => ({ id: `40s-${id}`, title, outcomes: outcomes.map((o) => `12P.${o}`), kind });

export const MB_40S_CATALOG: CourseCatalog = {
  classId: 'mb-40s',
  units: [
    {
      name: 'Transformations of Functions',
      types: [
        t('tr-describe', 'Describe the transformations in y − k = af(b(x − h))', ['R.2', 'R.3', 'R.4']),
        t('tr-write-equation', 'Write the equation of a transformed function from a description', ['R.2', 'R.3', 'R.4']),
        t('tr-map-point', 'Find the image of a point under a transformation', ['R.2', 'R.3', 'R.4']),
        t('tr-mapping-rule', 'Write the mapping rule (x, y) → (…, …) for a transformation', ['R.4']),
        t('tr-domain-range', 'Domain and range of a transformed function', ['R.4']),
        t('tr-sketch-translation', 'Sketch a translation of y = f(x), given its graph', ['R.2'], 'graph'),
        t('tr-sketch-stretch', 'Sketch a stretch or compression of y = f(x), given its graph', ['R.3'], 'graph'),
        t('tr-sketch-combined', 'Sketch y − k = af(b(x − h)), given the graph of y = f(x)', ['R.4'], 'graph'),
        t('tr-equation-from-graph', 'Write the equation of a transformed function from its graph', ['R.2', 'R.3', 'R.4'], 'graph'),
        t('tr-reflect-point', 'Reflect a point through the x-axis, the y-axis, or y = x', ['R.5']),
        t('tr-reflect-equation', 'Write the equation of a reflection of a function', ['R.5']),
        t('tr-reflect-sketch', 'Sketch y = −f(x), y = f(−x), and y = f⁻¹(x), given the graph of y = f(x)', ['R.5'], 'graph'),
      ],
    },
    {
      name: 'Operations on and Compositions of Functions',
      types: [
        t('op-equation', 'Write f + g, f − g, fg, or f/g, given f and g', ['R.1']),
        t('op-domain', 'Domain and range of a sum, difference, product, or quotient', ['R.1']),
        t('op-evaluate', 'Evaluate (f + g)(a), (fg)(a), or (f/g)(a)', ['R.1']),
        t('op-compose-evaluate', 'Evaluate f(g(a)), g(f(a)), or f(f(a))', ['R.1']),
        t('op-compose-equation', 'Find f(g(x)) or g(f(x)) and state any restrictions', ['R.1']),
        t('op-decompose', 'Write a function as a composition of two functions', ['R.1']),
        t('op-from-graphs', 'Evaluate combinations and compositions from graphs or tables', ['R.1'], 'graph'),
        t('op-sketch', 'Sketch the sum, difference, product, or quotient of two graphs', ['R.1'], 'graph'),
        t('op-abs-reciprocal', 'Sketch y = |f(x)| or y = 1/f(x), given the graph of y = f(x)', ['R.1'], 'graph'),
      ],
    },
    {
      name: 'Inverses',
      types: [
        t('inv-linear', 'Find the inverse of a linear function', ['R.6']),
        t('inv-quadratic', 'Find the inverse of a quadratic and restrict the domain', ['R.6']),
        t('inv-verify', 'Decide whether two functions are inverses by composition', ['R.6']),
        t('inv-domain-range', 'Domain and range of a relation and its inverse', ['R.6']),
        t('inv-is-function', 'Decide whether a relation and its inverse are functions', ['R.6'], 'graph'),
        t('inv-sketch', 'Sketch the inverse of a relation, given its graph', ['R.6'], 'graph'),
      ],
    },
    {
      name: 'Polynomial Functions',
      types: [
        t('poly-divide', 'Divide a polynomial by x − a (long or synthetic division)', ['R.11']),
        t('poly-remainder', 'Find the remainder with the remainder theorem', ['R.11']),
        t('poly-remainder-unknown', 'Find an unknown coefficient, given a remainder or factor', ['R.11']),
        t('poly-factor-theorem', 'Decide whether x − a is a factor (factor theorem)', ['R.11']),
        t('poly-factor', 'Factor a polynomial of degree 3 to 5 completely', ['R.11']),
        t('poly-solve', 'Solve a polynomial equation by factoring', ['R.11', 'R.12']),
        t('poly-zeros-multiplicity', 'Zeros, multiplicities, and intercepts from factored form', ['R.12']),
        t('poly-end-behaviour', 'End behaviour from the degree and leading coefficient', ['R.12']),
        t('poly-identify', 'Identify polynomial functions in a set of functions', ['R.12']),
        t('poly-write', 'Write a polynomial function from its zeros and a point', ['R.12']),
        t('poly-model', 'Model a context with a polynomial function (e.g. volume of a box)', ['R.12']),
        t('poly-sketch', 'Sketch a polynomial function from factored form', ['R.12'], 'graph'),
        t('poly-match', 'Match polynomial functions to their graphs', ['R.12'], 'graph'),
        t('poly-from-graph', 'Write a polynomial function from its graph', ['R.12'], 'graph'),
      ],
    },
    {
      name: 'Radical Functions',
      types: [
        t('rad-domain-range', 'Domain and range of y − k = a√(b(x − h))', ['R.13']),
        t('rad-describe', 'Describe the transformations of y = √x', ['R.13']),
        t('rad-sqrt-f-domain', 'Domain and range of y = √f(x) for a linear or quadratic f', ['R.13']),
        t('rad-sketch-table', 'Sketch y = √x from a table of values', ['R.13'], 'graph'),
        t('rad-sketch-transform', 'Sketch y − k = a√(b(x − h)) using transformations', ['R.13'], 'graph'),
        t('rad-sketch-sqrt-f', 'Sketch y = √f(x), given the graph of y = f(x)', ['R.13'], 'graph'),
        t('rad-solve-graphically', 'Solve a radical equation graphically (roots as x-intercepts)', ['R.13'], 'graph'),
      ],
    },
    {
      name: 'Rational Functions',
      types: [
        t('rat-npv', 'Non-permissible values: vertical asymptote or hole?', ['R.14']),
        t('rat-features', 'Asymptotes, holes, and intercepts of a rational function', ['R.14']),
        t('rat-hole', 'Coordinates of a point of discontinuity (hole)', ['R.14']),
        t('rat-behaviour', 'Behaviour of the graph near a non-permissible value', ['R.14']),
        t('rat-sketch', 'Sketch a rational function', ['R.14'], 'graph'),
        t('rat-match', 'Match rational functions to their graphs', ['R.14'], 'graph'),
        t('rat-solve-graphically', 'Solve a rational equation graphically (roots as x-intercepts)', ['R.14'], 'graph'),
      ],
    },
    {
      name: 'Angles and the Unit Circle',
      types: [
        t('ang-deg-to-rad', 'Convert degrees to radians (exact and approximate)', ['T.1']),
        t('ang-rad-to-deg', 'Convert radians to degrees', ['T.1']),
        t('ang-coterminal', 'Coterminal angles in a given domain', ['T.1']),
        t('ang-coterminal-general', 'General form of all coterminal angles', ['T.1']),
        t('ang-arc-length', 'Arc length, radius, or central angle (a = rθ)', ['T.1']),
        t('ang-sketch', 'Sketch an angle in standard position', ['T.1'], 'graph'),
        t('uc-point', 'Find a missing coordinate of a point on the unit circle', ['T.2']),
        t('uc-circle-equation', 'Equation of a circle with centre (0, 0) and radius r', ['T.2']),
        t('ratio-exact', 'Exact values of the six ratios for special angles', ['T.3']),
        t('ratio-approx', 'Approximate values of trigonometric ratios with technology', ['T.3']),
        t('ratio-terminal-point', 'Six ratios from a point on the terminal arm', ['T.3']),
        t('ratio-terminal-angle', 'Angles in a domain from a point on the terminal arm', ['T.3']),
        t('ratio-given-one', 'Other ratios, given one ratio and the quadrant', ['T.3']),
        t('ratio-find-angles', 'Angles in a domain, given the value of a ratio', ['T.3']),
        t('ratio-problem', 'Solve a problem using trigonometric ratios', ['T.3']),
      ],
    },
    {
      name: 'Trigonometric Functions',
      types: [
        t('tf-characteristics-basic', 'Amplitude, period, domain, range, zeros, and asymptotes of y = sin x, cos x, tan x', ['T.4']),
        t('tf-characteristics', 'Amplitude, period, phase shift, and vertical displacement of y = a sin b(x − c) + d', ['T.4']),
        t('tf-max-min', 'Maximum, minimum, and range of a sinusoidal function', ['T.4']),
        t('tf-equation-from-features', 'Write a sinusoidal equation from its characteristics', ['T.4']),
        t('tf-model', 'Sinusoidal modelling problems (Ferris wheels, tides, daylight)', ['T.4']),
        t('tf-sketch', 'Sketch y = a sin b(x − c) + d or y = a cos b(x − c) + d', ['T.4'], 'graph'),
        t('tf-equation-from-graph', 'Write a sinusoidal equation from its graph', ['T.4'], 'graph'),
      ],
    },
    {
      name: 'Trigonometric Equations',
      types: [
        t('te-verify', 'Verify that a value is a solution of a trigonometric equation', ['T.5']),
        t('te-first-degree', 'Solve first-degree equations, exact values', ['T.5']),
        t('te-first-degree-approx', 'Solve first-degree equations, approximate values', ['T.5']),
        t('te-double-angle', 'Solve first-degree equations with a double angle (e.g. sin 2x = ½)', ['T.5']),
        t('te-second-degree', 'Solve second-degree equations by factoring', ['T.5']),
        t('te-identities', 'Solve equations using identities', ['T.5', 'T.6']),
        t('te-general', 'Write the general solution of a trigonometric equation', ['T.5']),
        t('te-find-error', 'Find and correct the error in a solution', ['T.5']),
        t('te-graphical', 'Solve a trigonometric equation graphically', ['T.5'], 'graph'),
      ],
    },
    {
      name: 'Trigonometric Identities',
      types: [
        t('id-simplify', 'Simplify using reciprocal, quotient, and Pythagorean identities', ['T.6']),
        t('id-npv', 'Non-permissible values of an identity', ['T.6']),
        t('id-verify-numeric', 'Verify an identity numerically for a given angle', ['T.6']),
        t('id-exact-sum-diff', 'Exact values using sum and difference identities (e.g. cos 15°)', ['T.6']),
        t('id-exact-double', 'Exact values using double-angle identities', ['T.6']),
        t('id-single-function', 'Write an expression as a single trigonometric function', ['T.6']),
        t('id-prove', 'Prove an identity algebraically', ['T.6'], 'proof'),
      ],
    },
    {
      name: 'Exponential Functions',
      types: [
        t('exp-characteristics', 'Domain, range, asymptote, and intercepts of y = aˣ', ['R.9']),
        t('exp-transformed', 'Characteristics of a transformed exponential function', ['R.9']),
        t('exp-common-base', 'Solve exponential equations with a common base', ['R.10']),
        t('exp-logs', 'Solve exponential equations using logarithms', ['R.10']),
        t('exp-growth-decay', 'Exponential growth and decay problems (half-life, doubling)', ['R.10']),
        t('exp-finance', 'Loans, mortgages, and investments', ['R.10']),
        t('exp-sketch', 'Sketch a transformed exponential function', ['R.9'], 'graph'),
      ],
    },
    {
      name: 'Logarithms',
      types: [
        t('log-convert', 'Convert between exponential and logarithmic form', ['R.7']),
        t('log-evaluate', 'Evaluate logarithms exactly, without technology', ['R.7']),
        t('log-estimate', 'Estimate a logarithm between benchmarks', ['R.7']),
        t('log-expand', 'Expand a logarithm using the laws of logarithms', ['R.8']),
        t('log-condense', 'Write an expression as a single logarithm', ['R.8']),
        t('log-evaluate-laws', 'Evaluate expressions using the laws of logarithms', ['R.8']),
        t('log-approx', 'Approximate logarithms of any base with technology (change of base)', ['R.8']),
        t('log-characteristics', 'Characteristics of y = log_b x and its transformations', ['R.9']),
        t('log-solve', 'Solve logarithmic equations and reject extraneous roots', ['R.10']),
        t('log-scales', 'Logarithmic scales (Richter, pH, decibels)', ['R.10']),
        t('log-sketch', 'Sketch a transformed logarithmic function', ['R.9'], 'graph'),
        t('log-prove-law', 'Prove a law of logarithms', ['R.8'], 'proof'),
      ],
    },
    {
      name: 'Permutations and Combinations',
      types: [
        t('pc-fcp', 'Fundamental counting principle problems', ['P.1']),
        t('pc-factorial', 'Evaluate and simplify factorial expressions', ['P.2']),
        t('pc-permutations', 'Permutations of n elements taken r at a time', ['P.2']),
        t('pc-identical', 'Permutations with identical elements', ['P.2']),
        t('pc-conditions', 'Permutations with conditions (cases, objects kept together)', ['P.2']),
        t('pc-npr-equation', 'Solve equations involving nPr', ['P.2']),
        t('pc-combinations', 'Combinations of n elements taken r at a time', ['P.3']),
        t('pc-combination-cases', 'Combinations with cases ("at least", "at most")', ['P.3']),
        t('pc-ncr-equation', 'Solve equations involving nCr', ['P.3']),
        t('pc-which', 'Permutation or combination? Decide and solve', ['P.2', 'P.3']),
      ],
    },
    {
      name: 'Binomial Theorem',
      types: [
        t('bin-pascal', 'Rows of Pascal’s triangle', ['P.4']),
        t('bin-expand', 'Expand (x + y)ⁿ with the binomial theorem', ['P.4']),
        t('bin-term', 'Find a specific term in an expansion', ['P.4']),
        t('bin-term-power', 'Find the term containing xᵏ, or the constant term', ['P.4']),
        t('bin-coefficient', 'Coefficients of an expansion as combinations', ['P.4']),
      ],
    },
  ],
};

export const CATALOGS: CourseCatalog[] = [MB_40S_CATALOG];
