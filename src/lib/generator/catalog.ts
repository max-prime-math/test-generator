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

/** An entry maker for one course: ids get the course prefix and outcomes the course's outcome prefix. */
const entries = (idPrefix: string, outcomePrefix: string) =>
  (id: string, title: string, outcomes: string[], kind: ProblemKind = 'text'): ProblemType =>
    ({ id: `${idPrefix}-${id}`, title, outcomes: outcomes.map((o) => `${outcomePrefix}.${o}`), kind });

const t = entries('40s', '12P');
const u = entries('30s', '11P');
const v = entries('10i', '10I');
const w = entries('10f', '9');

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

export const MB_30S_CATALOG: CourseCatalog = {
  classId: 'mb-30s',
  units: [
    {
      name: 'Absolute Value',
      types: [
        u('abs-evaluate', 'Evaluate absolute value expressions', ['A.1']),
        u('abs-distance', 'Distance between two numbers on a number line', ['A.1']),
        u('abs-order', 'Compare and order absolute values', ['A.1']),
      ],
    },
    {
      name: 'Radicals',
      types: [
        u('rad-entire-to-mixed', 'Write an entire radical as a mixed radical', ['A.2']),
        u('rad-mixed-to-entire', 'Write a mixed radical as an entire radical', ['A.2']),
        u('rad-order', 'Compare and order radicals', ['A.2']),
        u('rad-add-subtract', 'Add and subtract radicals', ['A.2']),
        u('rad-multiply', 'Multiply radicals, including binomials', ['A.2']),
        u('rad-divide', 'Divide radicals', ['A.2']),
        u('rad-rationalize-monomial', 'Rationalize a monomial denominator', ['A.2']),
        u('rad-rationalize-binomial', 'Rationalize a binomial denominator (conjugates)', ['A.2']),
        u('rad-restrictions', 'Values of the variable for which a radical is defined', ['A.2']),
        u('rad-variable', 'Simplify radicals with variable radicands', ['A.2']),
        u('rad-problem', 'Solve a problem involving radical expressions', ['A.2']),
      ],
    },
    {
      name: 'Radical Equations',
      types: [
        u('radeq-restrictions', 'Restrictions on the variable in a radical equation', ['A.3']),
        u('radeq-one-radical', 'Solve an equation with one radical', ['A.3']),
        u('radeq-extraneous', 'Solve and reject extraneous roots', ['A.3']),
        u('radeq-two-radicals', 'Solve an equation with two radicals', ['A.3']),
        u('radeq-problem', 'Model a situation with a radical equation', ['A.3']),
      ],
    },
    {
      name: 'Rational Expressions',
      types: [
        u('rexp-npv', 'Non-permissible values of a rational expression', ['A.4']),
        u('rexp-simplify', 'Simplify a rational expression', ['A.4']),
        u('rexp-equivalent', 'Write an equivalent rational expression', ['A.4']),
        u('rexp-find-error', 'Find and correct the error in a simplification', ['A.4']),
        u('rexp-multiply-divide', 'Multiply and divide rational expressions', ['A.5']),
        u('rexp-same-denominator', 'Add and subtract with the same denominator', ['A.5']),
        u('rexp-different-denominator', 'Add and subtract with different denominators', ['A.5']),
        u('rexp-mixed', 'Simplify expressions with two or more operations', ['A.5']),
      ],
    },
    {
      name: 'Rational Equations',
      types: [
        u('req-npv', 'Non-permissible values of a rational equation', ['A.6']),
        u('req-linear', 'Solve rational equations that simplify to linear equations', ['A.6']),
        u('req-quadratic', 'Solve rational equations that simplify to quadratics, rejecting extraneous roots', ['A.6']),
        u('req-problem', 'Model a situation with a rational equation (work, rate, numbers)', ['A.6']),
      ],
    },
    {
      name: 'Angles in Standard Position',
      types: [
        u('ang-reference', 'Find the reference angle', ['T.1']),
        u('ang-quadrant', 'Determine the quadrant of an angle', ['T.1']),
        u('ang-same-reference', 'Angles from 0° to 360° with the same reference angle', ['T.1']),
        u('ang-reflected-points', 'Angles for P(x, y), P(−x, y), P(−x, −y), and P(x, −y)', ['T.1']),
        u('ang-sketch', 'Sketch an angle in standard position', ['T.1'], 'graph'),
        u('ang-point-sketch', 'Draw the angle whose terminal arm passes through a point', ['T.1'], 'graph'),
      ],
    },
    {
      name: 'Trigonometric Ratios from 0° to 360°',
      types: [
        u('trig-distance', 'Distance from the origin to a point on the terminal arm', ['T.2']),
        u('trig-ratio-from-point', 'sin θ, cos θ, or tan θ from a point on the terminal arm', ['T.2']),
        u('trig-quadrantal', 'Ratios for 0°, 90°, 180°, 270°, and 360°', ['T.2']),
        u('trig-sign', 'The sign of a ratio in each quadrant', ['T.2']),
        u('trig-exact', 'Exact values for reference angles of 30°, 45°, and 60°', ['T.2']),
        u('trig-given-one', 'Other ratios, given one ratio and the quadrant', ['T.2']),
        u('trig-solve', 'Solve sin θ = a, cos θ = a, or tan θ = a from 0° to 360°', ['T.2']),
        u('trig-problem', 'Solve a contextual problem using trigonometric ratios', ['T.2']),
      ],
    },
    {
      name: 'Sine Law and Cosine Law',
      types: [
        u('law-sine-side', 'Find a side with the sine law', ['T.3']),
        u('law-sine-angle', 'Find an angle with the sine law', ['T.3']),
        u('law-cosine-side', 'Find a side with the cosine law', ['T.3']),
        u('law-cosine-angle', 'Find an angle with the cosine law', ['T.3']),
        u('law-which', 'Decide which law to use', ['T.3']),
        u('law-ambiguous-count', 'The ambiguous case: zero, one, or two triangles?', ['T.3']),
        u('law-ambiguous-solve', 'Solve both triangles in the ambiguous case', ['T.3']),
        u('law-problem', 'Contextual problems with the sine and cosine laws', ['T.3']),
        u('law-diagram', 'Solve a labelled triangle diagram', ['T.3'], 'graph'),
      ],
    },
    {
      name: 'Factoring',
      types: [
        u('fac-common', 'Factor out a greatest common factor', ['R.1']),
        u('fac-simple-trinomial', 'Factor x² + bx + c', ['R.1']),
        u('fac-trinomial', 'Factor ax² + bx + c', ['R.1']),
        u('fac-difference-squares', 'Factor a difference of squares a²x² − b²y²', ['R.1']),
        u('fac-pattern-trinomial', 'Factor a(f(x))² + b(f(x)) + c', ['R.1']),
        u('fac-pattern-squares', 'Factor a²(f(x))² − b²(g(y))²', ['R.1']),
        u('fac-rational', 'Factor with rational coefficients', ['R.1']),
        u('fac-is-factor', 'Decide whether a binomial is a factor', ['R.1']),
      ],
    },
    {
      name: 'Absolute Value Functions',
      types: [
        u('absf-table', 'Table of values for y = |f(x)| from a table for y = f(x)', ['R.2']),
        u('absf-piecewise', 'Write an absolute value function in piecewise notation', ['R.2']),
        u('absf-features', 'Intercepts, domain, and range of y = |f(x)|', ['R.2']),
        u('absf-solve', 'Solve an absolute value equation algebraically', ['R.2']),
        u('absf-no-solution', 'Recognize absolute value equations with no solution', ['R.2']),
        u('absf-find-error', 'Find and correct the error in an absolute value solution', ['R.2']),
        u('absf-sketch', 'Sketch y = |f(x)| for a linear or quadratic f', ['R.2'], 'graph'),
        u('absf-solve-graph', 'Solve an absolute value equation graphically', ['R.2'], 'graph'),
      ],
    },
    {
      name: 'Quadratic Functions: Vertex Form',
      types: [
        u('qv-vertex', 'The vertex of y = a(x − p)² + q', ['R.3']),
        u('qv-characteristics', 'Domain, range, opening, axis, and intercepts', ['R.3']),
        u('qv-effects', 'The effect of a, p, and q on the graph of y = x²', ['R.3']),
        u('qv-intercept-count', 'Number of x-intercepts from a and q', ['R.3']),
        u('qv-equation', 'Write the equation from the vertex and a point', ['R.3']),
        u('qv-sketch', 'Sketch y = a(x − p)² + q', ['R.3'], 'graph'),
        u('qv-from-graph', 'Write y = a(x − p)² + q from a graph', ['R.3'], 'graph'),
      ],
    },
    {
      name: 'Quadratic Functions: Standard Form',
      types: [
        u('qs-complete-square', 'Complete the square to write vertex form', ['R.4']),
        u('qs-find-error', 'Find and correct the error in completing the square', ['R.4']),
        u('qs-characteristics', 'Characteristics of y = ax² + bx + c', ['R.4']),
        u('qs-model', 'Model and optimize with a quadratic function', ['R.4']),
        u('qs-sketch', 'Sketch y = ax² + bx + c', ['R.4'], 'graph'),
      ],
    },
    {
      name: 'Quadratic Equations',
      types: [
        u('qe-square-roots', 'Solve by taking square roots', ['R.5']),
        u('qe-factoring', 'Solve by factoring', ['R.5']),
        u('qe-complete-square', 'Solve by completing the square', ['R.5']),
        u('qe-formula', 'Solve with the quadratic formula', ['R.5']),
        u('qe-discriminant', 'Number of real roots from the discriminant', ['R.5']),
        u('qe-discriminant-k', 'Find k for a given number of roots', ['R.5']),
        u('qe-find-error', 'Find and correct the error in a solution', ['R.5']),
        u('qe-problem', 'Solve a problem with a quadratic equation', ['R.5']),
        u('qe-roots-graph', 'Roots from the graph of the related function', ['R.5'], 'graph'),
      ],
    },
    {
      name: 'Systems of Equations',
      types: [
        u('sys-linear-quadratic', 'Solve a linear-quadratic system algebraically', ['R.6']),
        u('sys-quadratic-quadratic', 'Solve a quadratic-quadratic system algebraically', ['R.6']),
        u('sys-count', 'Zero, one, or two solutions?', ['R.6']),
        u('sys-problem', 'Model and solve a problem with a system', ['R.6']),
        u('sys-graphical', 'Solve a system from its graph', ['R.6'], 'graph'),
      ],
    },
    {
      name: 'Inequalities',
      types: [
        u('ineq-test-point', 'Is a point in the solution region?', ['R.7']),
        u('ineq-quadratic-one-var', 'Solve a quadratic inequality in one variable', ['R.8']),
        u('ineq-quadratic-problem', 'Solve a problem with a quadratic inequality', ['R.8']),
        u('ineq-linear-graph', 'Graph a linear inequality in two variables', ['R.7'], 'graph'),
        u('ineq-quadratic-graph', 'Graph a quadratic inequality in two variables', ['R.7'], 'graph'),
        u('ineq-from-graph', 'Write the inequality for a graphed region', ['R.7'], 'graph'),
      ],
    },
    {
      name: 'Arithmetic Sequences and Series',
      types: [
        u('arith-general-term', 'Write the general term of an arithmetic sequence', ['R.9']),
        u('arith-term', 'Find a specific term', ['R.9']),
        u('arith-parameter', 'Find the first term, common difference, or number of terms', ['R.9']),
        u('arith-sum', 'Find the sum of an arithmetic series', ['R.9']),
        u('arith-sum-parameter', 'Find a missing value from the sum of a series', ['R.9']),
        u('arith-problem', 'Solve a problem with an arithmetic sequence or series', ['R.9']),
      ],
    },
    {
      name: 'Geometric Sequences and Series',
      types: [
        u('geo-general-term', 'Write the general term of a geometric sequence', ['R.10']),
        u('geo-term', 'Find a specific term', ['R.10']),
        u('geo-parameter', 'Find the first term, common ratio, or number of terms', ['R.10']),
        u('geo-sum', 'Find the sum of a geometric series', ['R.10']),
        u('geo-infinite', 'Infinite geometric series: convergent or divergent, and the sum', ['R.10']),
        u('geo-problem', 'Solve a problem with a geometric sequence or series', ['R.10']),
      ],
    },
    {
      name: 'Reciprocal Functions',
      types: [
        u('recip-asymptotes', 'Vertical asymptotes of y = 1/f(x)', ['R.11']),
        u('recip-invariant', 'Invariant points of y = 1/f(x)', ['R.11']),
        u('recip-features', 'Domain, range, and asymptotes of a reciprocal function', ['R.11']),
        u('recip-sketch', 'Sketch y = 1/f(x) from y = f(x)', ['R.11'], 'graph'),
        u('recip-from-reciprocal', 'Sketch y = f(x) from the graph of y = 1/f(x)', ['R.11'], 'graph'),
      ],
    },
  ],
};

export const MB_10I_CATALOG: CourseCatalog = {
  classId: 'mb-10i',
  units: [
    {
      name: 'Linear Measurement',
      types: [
        v('meas-referent', 'Choose a referent or an appropriate unit for a length', ['M.1']),
        v('meas-feet-inches', 'Add, subtract, and scale lengths in feet and inches', ['M.1']),
        v('meas-read-ruler', 'Read a length from an imperial or metric ruler', ['M.1'], 'graph'),
        v('meas-perimeter', 'Perimeter and circumference problems in SI or imperial units', ['M.1']),
        v('meas-convert-si', 'Convert between SI units of length', ['M.2']),
        v('meas-convert-imperial', 'Convert between imperial units of length', ['M.2']),
        v('meas-convert-between', 'Convert between SI and imperial units', ['M.2']),
        v('meas-convert-problem', 'Solve a problem that involves unit conversions', ['M.2']),
      ],
    },
    {
      name: 'Surface Area and Volume',
      types: [
        v('sav-prism-pyramid-area', 'Surface area of a right prism or pyramid', ['M.3']),
        v('sav-cylinder-cone-area', 'Surface area of a right cylinder or cone', ['M.3']),
        v('sav-volume', 'Volume of a right prism, pyramid, cylinder, or cone', ['M.3']),
        v('sav-sphere', 'Surface area and volume of a sphere or hemisphere', ['M.3']),
        v('sav-unknown-dimension', 'Find an unknown dimension from a surface area or volume', ['M.3']),
        v('sav-composite', 'Surface area or volume of a composite object', ['M.3']),
        v('sav-relationship', 'Relate the volumes of cones and cylinders, pyramids and prisms', ['M.3']),
        v('sav-imperial', 'Surface area and volume problems in imperial units', ['M.3', 'M.2']),
      ],
    },
    {
      name: 'Trigonometry',
      types: [
        v('trig-label-sides', 'Name the opposite, adjacent, and hypotenuse for an angle', ['M.4'], 'graph'),
        v('trig-ratio', 'Write sin, cos, or tan of an angle as a ratio of sides', ['M.4']),
        v('trig-pythagorean', 'Find a side with the Pythagorean theorem', ['M.4']),
        v('right-triangle-trig', 'Find a side or an angle in a right triangle', ['M.4']),
        v('trig-solve-triangle', 'Solve a right triangle (all sides and angles)', ['M.4'], 'graph'),
        v('trig-elevation', 'Angle of elevation and depression problems', ['M.4']),
        v('trig-two-triangles', 'Problems with two right triangles', ['M.4']),
      ],
    },
    {
      name: 'Factors of Whole Numbers',
      types: [
        v('num-prime-factors', 'Write the prime factorization of a whole number', ['A.1']),
        v('num-gcf', 'Greatest common factor of two or three numbers', ['A.1']),
        v('num-lcm', 'Least common multiple of two or three numbers', ['A.1']),
        v('num-square-cube', 'Decide whether a number is a perfect square, perfect cube, both, or neither', ['A.1']),
        v('num-roots', 'Square and cube roots using prime factorization', ['A.1']),
        v('num-problem', 'Solve a problem with GCF, LCM, square roots, or cube roots', ['A.1']),
      ],
    },
    {
      name: 'Irrational Numbers and Radicals',
      types: [
        v('irr-classify', 'Sort numbers as rational or irrational', ['A.2']),
        v('irr-number-sets', 'Name the number sets a number belongs to', ['A.2']),
        v('irr-approximate', 'Estimate a radical between consecutive whole numbers', ['A.2']),
        v('irr-order', 'Order a set of irrational numbers', ['A.2']),
        v('irr-number-line', 'Place radicals on a number line', ['A.2'], 'graph'),
        v('irr-entire-to-mixed', 'Write an entire radical as a mixed radical', ['A.2']),
        v('irr-mixed-to-entire', 'Write a mixed radical as an entire radical', ['A.2']),
        v('irr-index', 'Radicals with index 3 or more', ['A.2']),
      ],
    },
    {
      name: 'Powers and Exponents',
      types: [
        v('pow-integral', 'Evaluate powers with zero and negative exponents', ['A.3']),
        v('exponent-laws', 'Simplify using exponent laws', ['A.3']),
        v('pow-radical-form', 'Rewrite powers with rational exponents as radicals and vice versa', ['A.3']),
        v('rational-exponents', 'Evaluate powers with rational exponents', ['A.3']),
        v('pow-rational-simplify', 'Simplify expressions with rational exponents', ['A.3']),
        v('pow-error', 'Find and correct the error in a simplification with powers', ['A.3']),
        v('pow-problem', 'Solve a problem with exponent laws or radicals', ['A.3']),
      ],
    },
    {
      name: 'Polynomial Multiplication and Factoring',
      types: [
        v('multiply-polynomials', 'Multiply polynomials', ['A.4']),
        v('mult-special', 'Square a binomial or multiply conjugates', ['A.4']),
        v('mult-area-model', 'Multiply binomials with an area model', ['A.4'], 'graph'),
        v('mult-simplify', 'Expand and simplify expressions with several products', ['A.4']),
        v('mult-verify', 'Verify a product by substitution; find the error', ['A.4']),
        v('fac-gcf', 'Factor out the greatest common factor', ['A.5']),
        v('factor-trinomials', 'Factor trinomials', ['A.5']),
        v('fac-difference-squares', 'Factor a difference of squares', ['A.5']),
        v('fac-completely', 'Factor completely (common factor first, then a pattern)', ['A.5']),
        v('fac-area', 'Find dimensions from a factored area expression', ['A.5', 'A.4']),
        v('fac-error', 'Find the error in a factorization', ['A.5']),
      ],
    },
    {
      name: 'Graphs and Relations',
      types: [
        v('rel-match-context', 'Match a context to its graph', ['R.1'], 'graph'),
        v('rel-describe-graph', 'Describe the situation shown by a distance–time graph', ['R.1'], 'graph'),
        v('rel-discrete', 'Decide whether to connect the points for a context', ['R.1']),
        v('rel-context-domain', 'Domain and range restrictions for a context', ['R.1']),
        v('fn-ordered-pairs', 'Decide whether a set of ordered pairs is a function', ['R.2']),
        v('fn-vertical-line', 'Decide whether a graph is a function', ['R.2'], 'graph'),
        v('fn-domain-range-set', 'Domain and range of a set of ordered pairs or a mapping', ['R.2']),
        v('fn-domain-range-graph', 'Domain and range of a graph', ['R.2'], 'graph'),
      ],
    },
    {
      name: 'Slope',
      types: [
        v('slope-two-points', 'Slope from two points', ['R.3']),
        v('slope-graph', 'Slope of a line from its graph', ['R.3'], 'graph'),
        v('slope-classify', 'Positive, negative, zero, or undefined slope', ['R.3'], 'graph'),
        v('slope-rate', 'Slope as a rate of change in a context', ['R.3']),
        v('slope-another-point', 'Find another point on a line, given a point and the slope', ['R.3']),
        v('slope-draw', 'Draw a line, given a point and the slope', ['R.3'], 'graph'),
        v('slope-parallel-perpendicular', 'Decide whether lines are parallel, perpendicular, or neither', ['R.3']),
        v('slope-unknown', 'Find an unknown coordinate from a slope condition', ['R.3']),
      ],
    },
    {
      name: 'Linear Relations',
      types: [
        v('lin-variables', 'Identify the independent and dependent variables', ['R.4']),
        v('lin-table', 'Decide whether a table of values is linear', ['R.4']),
        v('lin-equation', 'Decide whether an equation is linear', ['R.4']),
        v('lin-represent', 'Complete a table of values or write the equation of a linear relation', ['R.4']),
        v('lin-intercepts', 'Find the x- and y-intercepts', ['R.5']),
        v('lin-domain-range', 'Domain and range of a linear relation', ['R.5']),
        v('lin-match-graph', 'Match a graph to its slope and y-intercept', ['R.5'], 'graph'),
        v('lin-context', 'Interpret the slope and intercepts in a context', ['R.5']),
      ],
    },
    {
      name: 'Forms of Linear Equations',
      types: [
        v('form-slope-intercept', 'Rewrite an equation in slope–intercept form', ['R.6']),
        v('form-general', 'Rewrite an equation in general form', ['R.6']),
        v('form-slope-point', 'Read the slope and a point from slope–point form', ['R.6']),
        v('form-features', 'Slope and intercepts from general form', ['R.6', 'R.5']),
        v('form-equivalent', 'Identify equivalent linear equations', ['R.6']),
        v('form-graph', 'Graph a line in slope–intercept, general, or slope–point form', ['R.6'], 'graph'),
        v('form-match-graph', 'Match an equation to its graph', ['R.6'], 'graph'),
      ],
    },
    {
      name: 'Equations of Lines',
      types: [
        v('eq-from-graph', 'Write the equation of a line from its graph', ['R.7'], 'graph'),
        v('eq-point-slope', 'Write the equation of a line from a point and the slope', ['R.7']),
        v('line-two-points', 'Equation of a line through two points', ['R.7']),
        v('eq-parallel-perpendicular', 'Line through a point, parallel or perpendicular to a given line', ['R.7']),
        v('eq-context', 'Write and use a linear model for a context', ['R.7']),
        v('eq-scatterplot', 'Estimate a line of best fit from a scatterplot', ['R.7'], 'graph'),
      ],
    },
    {
      name: 'Function Notation',
      types: [
        v('fnot-evaluate', 'Evaluate f(a) for a linear function', ['R.8']),
        v('fnot-solve', 'Find x, given f(x)', ['R.8']),
        v('fnot-convert', 'Convert between function notation and an equation in x and y', ['R.8']),
        v('fnot-graph', 'Read values of a function from its graph', ['R.8'], 'graph'),
        v('fnot-context', 'Use function notation in a context', ['R.8']),
      ],
    },
    {
      name: 'Systems of Linear Equations',
      types: [
        v('sys-verify', 'Decide whether an ordered pair solves a system', ['R.9']),
        v('sys-graphical', 'Solve a system from its graph', ['R.9'], 'graph'),
        v('sys-substitution', 'Solve a system by substitution', ['R.9']),
        v('sys-elimination', 'Solve a system by elimination', ['R.9']),
        v('sys-count', 'Number of solutions of a linear system', ['R.9']),
        v('sys-model', 'Write a system of equations for a context', ['R.9']),
        v('sys-problem', 'Solve a problem with a linear system', ['R.9']),
      ],
    },
    {
      name: 'Distance and Midpoint',
      types: [
        v('dist-distance', 'Distance between two points', ['R.10']),
        v('dist-midpoint', 'Midpoint of a line segment', ['R.10']),
        v('dist-endpoint', 'Find an endpoint, given the midpoint and the other endpoint', ['R.10']),
        v('dist-problem', 'Solve a problem with distance or midpoint', ['R.10']),
      ],
    },
  ],
};

export const MB_10F_CATALOG: CourseCatalog = {
  classId: 'mb-10f',
  units: [
    {
      name: 'Powers',
      types: [
        w('pow-repeated', 'Write a power as repeated multiplication, and the reverse', ['N.1']),
        w('pow-evaluate', 'Evaluate powers, including the role of brackets', ['N.1']),
        w('pow-zero', 'Powers with an exponent of zero', ['N.1']),
        w('pow-sum', 'Sums and differences of powers', ['N.1', 'N.4']),
        w('pow-problem', 'Solve a problem involving powers', ['N.1']),
        w('law-product-quotient', 'Product and quotient laws', ['N.2']),
        w('law-power', 'Power of a power, a product, or a quotient', ['N.2']),
        w('law-evaluate', 'Simplify with exponent laws, then evaluate', ['N.2']),
        w('law-error', 'Find the error in a simplification of powers', ['N.2']),
      ],
    },
    {
      name: 'Rational Numbers',
      types: [
        w('rat-order', 'Compare and order rational numbers', ['N.3']),
        w('rat-between', 'Find a rational number between two others', ['N.3']),
        w('rat-number-line', 'Place rational numbers on a number line', ['N.3'], 'graph'),
        w('rat-add-subtract', 'Add and subtract rational numbers', ['N.3']),
        w('rat-multiply-divide', 'Multiply and divide rational numbers', ['N.3']),
        w('rat-problem', 'Solve a problem with operations on rational numbers', ['N.3']),
      ],
    },
    {
      name: 'Order of Operations',
      types: [
        w('ooo-integers', 'Order of operations with integers and powers', ['N.4']),
        w('ooo-rational', 'Order of operations with fractions and decimals', ['N.4', 'N.3']),
        w('ooo-error', 'Find the error in an order-of-operations solution', ['N.4']),
      ],
    },
    {
      name: 'Square Roots',
      types: [
        w('sqrt-perfect', 'Decide whether a rational number is a perfect square', ['N.5']),
        w('sqrt-evaluate', 'Square roots of perfect-square fractions and decimals', ['N.5']),
        w('sqrt-reverse', 'Find a number from its square root', ['N.5']),
        w('sqrt-area', 'Side length of a square from its area', ['N.5', 'N.6']),
        w('sqrt-estimate', 'Estimate a square root using benchmarks', ['N.6']),
        w('sqrt-between', 'Find a number whose square root is between two numbers', ['N.6']),
      ],
    },
    {
      name: 'Patterns and Linear Relations',
      types: [
        w('pat-figures', 'Write an expression for a pattern of figures', ['PR.1'], 'graph'),
        w('pat-table', 'Write a linear equation for a table of values', ['PR.1']),
        w('pat-context', 'Write a linear equation for a context', ['PR.1']),
        w('pat-solve', 'Use a pattern equation to find a term or a term number', ['PR.1']),
        w('lin-graph-table', 'Graph a linear relation from a table of values', ['PR.2'], 'graph'),
        w('lin-interpolate', 'Interpolate or extrapolate from a graph', ['PR.2'], 'graph'),
        w('lin-match', 'Match a context to its graph', ['PR.2'], 'graph'),
        w('lin-describe', 'Describe the pattern in a graph', ['PR.2'], 'graph'),
      ],
    },
    {
      name: 'Linear Equations',
      types: [
        w('eq-one-two-step', 'Solve ax = b and ax + b = c', ['PR.3']),
        w('eq-both-sides', 'Solve ax = b + cx and ax + b = cx + d', ['PR.3']),
        w('eq-brackets', 'Solve a(x + b) = c and a(bx + c) = d(ex + f)', ['PR.3']),
        w('eq-rational', 'Solve equations with fractions and decimals', ['PR.3']),
        w('eq-variable-denominator', 'Solve a/x = b', ['PR.3']),
        w('eq-verify', 'Decide by substitution whether a number is a solution', ['PR.3']),
        w('eq-error', 'Find the error in a solution', ['PR.3']),
        w('eq-problem', 'Model and solve a problem with a linear equation', ['PR.3']),
      ],
    },
    {
      name: 'Linear Inequalities',
      types: [
        w('ineq-translate', 'Write an inequality for a statement', ['PR.4']),
        w('ineq-check', 'Decide whether a number is a solution of an inequality', ['PR.4']),
        w('ineq-solve', 'Solve a linear inequality', ['PR.4']),
        w('ineq-reverse', 'Solve inequalities that require reversing the sign', ['PR.4']),
        w('ineq-graph', 'Graph the solution on a number line', ['PR.4'], 'graph'),
        w('ineq-from-graph', 'Write the inequality shown on a number line', ['PR.4'], 'graph'),
        w('ineq-problem', 'Solve a problem with a linear inequality', ['PR.4']),
      ],
    },
    {
      name: 'Polynomials',
      types: [
        w('poly-parts', 'Variables, degree, coefficients, and constant term', ['PR.5']),
        w('poly-classify', 'Classify polynomials by number of terms and degree', ['PR.5']),
        w('poly-tiles', 'Write the polynomial modelled by algebra tiles', ['PR.5'], 'graph'),
        w('poly-equivalent', 'Identify equivalent polynomial expressions', ['PR.5', 'PR.6']),
        w('poly-add', 'Add polynomials', ['PR.6']),
        w('poly-subtract', 'Subtract polynomials', ['PR.6']),
        w('poly-perimeter', 'Perimeter expressions and add/subtract problems', ['PR.6']),
        w('poly-multiply', 'Multiply a polynomial by a monomial', ['PR.7']),
        w('poly-divide', 'Divide a polynomial by a monomial', ['PR.7']),
        w('poly-area', 'Area and side-length expressions for rectangles', ['PR.7']),
        w('poly-error', 'Find the error in a polynomial simplification', ['PR.6', 'PR.7']),
      ],
    },
    {
      name: 'Circle Geometry',
      types: [
        w('circ-chord', 'Perpendicular from the centre to a chord', ['SS.1'], 'graph'),
        w('circ-central-inscribed', 'Central and inscribed angles on the same arc', ['SS.1'], 'graph'),
        w('circ-same-arc', 'Inscribed angles on the same arc', ['SS.1'], 'graph'),
        w('circ-semicircle', 'Inscribed angle in a semicircle', ['SS.1'], 'graph'),
        w('circ-tangent', 'Tangent perpendicular to the radius', ['SS.1'], 'graph'),
        w('circ-property', 'Name the circle property that justifies a step', ['SS.1']),
      ],
    },
    {
      name: 'Surface Area, Similarity, and Scale',
      types: [
        w('sa-composite', 'Surface area of a composite object', ['SS.2']),
        w('sa-overlap', 'Area of overlap in a composite object', ['SS.2']),
        w('sa-problem', 'Solve a surface area problem (paint, wrapping)', ['SS.2']),
        w('sim-check', 'Decide whether two polygons are similar', ['SS.3']),
        w('sim-missing-side', 'Find a missing side in similar polygons', ['SS.3'], 'graph'),
        w('sim-problem', 'Solve a problem with similar figures', ['SS.3']),
        w('scale-factor', 'Find the scale factor of a scale diagram', ['SS.4']),
        w('scale-actual', 'Find an actual or a diagram length from a scale', ['SS.4']),
        w('scale-draw', 'Draw an enlargement or reduction on a grid', ['SS.4'], 'graph'),
      ],
    },
    {
      name: 'Symmetry',
      types: [
        w('sym-lines', 'Count lines of symmetry', ['SS.5'], 'graph'),
        w('sym-rotation', 'Order and angle of rotation symmetry', ['SS.5'], 'graph'),
        w('sym-complete', 'Complete a shape, given half and a line of symmetry', ['SS.5'], 'graph'),
        w('sym-rotate', 'Rotate a shape about a vertex', ['SS.5'], 'graph'),
      ],
    },
    {
      name: 'Data and Probability in Society',
      types: [
        w('data-factor', 'Identify the factor affecting a data collection', ['SP.1']),
        w('data-question', 'Identify a biased or neutral survey question', ['SP.1']),
        w('data-sample-population', 'Decide whether a situation uses a sample or a population', ['SP.2']),
        w('data-choose', 'Choose a sample or a population, and justify the choice', ['SP.2']),
        w('data-generalize', 'Decide whether a generalization from a sample is valid', ['SP.2']),
        w('data-plan', 'Choose a data collection method or a display for a project', ['SP.3']),
        w('data-conclusion', 'Draw a conclusion from collected data', ['SP.3']),
        w('prob-type', 'Theoretical, experimental, or subjective probability', ['SP.4']),
        w('prob-assumption', 'Identify the assumption behind a probability', ['SP.4']),
        w('prob-opposing', 'Use one probability to support opposing positions', ['SP.4']),
        w('prob-compute', 'Compare theoretical and experimental probability', ['SP.4']),
      ],
    },
  ],
};

export const CATALOGS: CourseCatalog[] = [MB_10F_CATALOG, MB_10I_CATALOG, MB_30S_CATALOG, MB_40S_CATALOG];
