import type { Class } from '../types.ts';

// Manitoba specific learning outcomes. Section names are shortened for the
// picker; MB_OUTCOME_STATEMENTS holds the official wording where it has been
// checked against the framework document. Source: Grades 9 to 12 Mathematics:
// Manitoba Curriculum Framework of Outcomes (2014),
// https://www.edu.gov.mb.ca/k12/framework/publications/math/framework_9-12/

export const MB_10I: Class = {
  id: 'mb-10i',
  name: 'Grade 10 Introduction to Applied and Pre-Calculus Mathematics (20S)',
  units: [
    {
      id: 'M', name: 'Measurement',
      sections: [
        { id: '10I.M.1', name: 'Linear measurement using SI and imperial units' },
        { id: '10I.M.2', name: 'Conversions between SI and imperial units' },
        { id: '10I.M.3', name: 'Surface area and volume of 3-D objects' },
        { id: '10I.M.4', name: 'Primary trigonometric ratios in right triangles' },
      ],
    },
    {
      id: 'A', name: 'Algebra and Number',
      sections: [
        { id: '10I.A.1', name: 'Factors, GCF, LCM, square and cube roots' },
        { id: '10I.A.2', name: 'Irrational numbers and radicals' },
        { id: '10I.A.3', name: 'Powers with integral and rational exponents' },
        { id: '10I.A.4', name: 'Multiplication of polynomial expressions' },
        { id: '10I.A.5', name: 'Common factors and trinomial factoring' },
      ],
    },
    {
      id: 'R', name: 'Relations and Functions',
      sections: [
        { id: '10I.R.1', name: 'Relationships among data, graphs, and contexts' },
        { id: '10I.R.2', name: 'Relations and functions' },
        { id: '10I.R.3', name: 'Slope, rate of change, parallel and perpendicular lines' },
        { id: '10I.R.4', name: 'Representing linear relations' },
        { id: '10I.R.5', name: 'Intercepts, slope, domain, and range of linear relations' },
        { id: '10I.R.6', name: 'Slope-intercept, general, and slope-point forms' },
        { id: '10I.R.7', name: 'Determining the equation of a linear relation' },
        { id: '10I.R.8', name: 'Function notation' },
        { id: '10I.R.9', name: 'Systems of linear equations' },
      ],
    },
  ],
};

export const MB_40S: Class = {
  id: 'mb-40s',
  name: 'Grade 12 Pre-Calculus Mathematics (40S)',
  units: [
    {
      id: 'T', name: 'Trigonometry',
      sections: [
        { id: '12P.T.1', name: 'Angles in standard position, degrees and radians' },
        { id: '12P.T.2', name: 'The unit circle' },
        { id: '12P.T.3', name: 'The six trigonometric ratios' },
        { id: '12P.T.4', name: 'Graphs of sine, cosine, and tangent' },
        { id: '12P.T.5', name: 'First- and second-degree trigonometric equations' },
        { id: '12P.T.6', name: 'Trigonometric identities' },
      ],
    },
    {
      id: 'R', name: 'Relations and Functions',
      sections: [
        { id: '12P.R.1', name: 'Operations on and compositions of functions' },
        { id: '12P.R.2', name: 'Horizontal and vertical translations' },
        { id: '12P.R.3', name: 'Horizontal and vertical stretches and compressions' },
        { id: '12P.R.4', name: 'Combined translations, stretches, and compressions' },
        { id: '12P.R.5', name: 'Reflections through the axes and y = x' },
        { id: '12P.R.6', name: 'Inverses of relations' },
        { id: '12P.R.7', name: 'Logarithms' },
        { id: '12P.R.8', name: 'Laws of logarithms' },
        { id: '12P.R.9', name: 'Graphs of exponential and logarithmic functions' },
        { id: '12P.R.10', name: 'Exponential and logarithmic equations' },
        { id: '12P.R.11', name: 'Factoring polynomials of degree greater than 2' },
        { id: '12P.R.12', name: 'Graphs of polynomial functions' },
        { id: '12P.R.13', name: 'Radical functions' },
        { id: '12P.R.14', name: 'Rational functions' },
      ],
    },
    {
      id: 'P', name: 'Permutations, Combinations, and Binomial Theorem',
      sections: [
        { id: '12P.P.1', name: 'Fundamental counting principle' },
        { id: '12P.P.2', name: 'Permutations' },
        { id: '12P.P.3', name: 'Combinations' },
        { id: '12P.P.4', name: 'Binomial theorem' },
      ],
    },
  ],
};

export const MB_30S: Class = {
  id: 'mb-30s',
  name: 'Grade 11 Pre-Calculus Mathematics (30S)',
  units: [
    {
      id: 'A', name: 'Algebra and Number',
      sections: [
        { id: '11P.A.1', name: 'Absolute value of real numbers' },
        { id: '11P.A.2', name: 'Operations on radicals' },
        { id: '11P.A.3', name: 'Radical equations' },
        { id: '11P.A.4', name: 'Equivalent rational expressions' },
        { id: '11P.A.5', name: 'Operations on rational expressions' },
        { id: '11P.A.6', name: 'Rational equations' },
      ],
    },
    {
      id: 'T', name: 'Trigonometry',
      sections: [
        { id: '11P.T.1', name: 'Angles in standard position (0° to 360°)' },
        { id: '11P.T.2', name: 'Primary trigonometric ratios from 0° to 360°' },
        { id: '11P.T.3', name: 'Sine law and cosine law, including the ambiguous case' },
      ],
    },
    {
      id: 'R', name: 'Relations and Functions',
      sections: [
        { id: '11P.R.1', name: 'Factoring polynomial expressions' },
        { id: '11P.R.2', name: 'Absolute value functions' },
        { id: '11P.R.3', name: 'Quadratic functions in vertex form' },
        { id: '11P.R.4', name: 'Quadratic functions in standard form' },
        { id: '11P.R.5', name: 'Quadratic equations' },
        { id: '11P.R.6', name: 'Systems of linear-quadratic and quadratic-quadratic equations' },
        { id: '11P.R.7', name: 'Linear and quadratic inequalities in two variables' },
        { id: '11P.R.8', name: 'Quadratic inequalities in one variable' },
        { id: '11P.R.9', name: 'Arithmetic sequences and series' },
        { id: '11P.R.10', name: 'Geometric sequences and series' },
        { id: '11P.R.11', name: 'Reciprocal functions' },
      ],
    },
  ],
};

/** Official outcome statements, verbatim from the framework document. */
export const MB_OUTCOME_STATEMENTS: Record<string, string> = {
  '11P.A.1': 'Demonstrate an understanding of the absolute value of real numbers.',
  '11P.A.2': 'Solve problems that involve operations on radicals and radical expressions with numerical and variable radicands.',
  '11P.A.3': 'Solve problems that involve radical equations (limited to square roots).',
  '11P.A.4': 'Determine equivalent forms of rational expressions (limited to numerators and denominators that are monomials, binomials, or trinomials).',
  '11P.A.5': 'Perform operations on rational expressions (limited to numerators and denominators that are monomials, binomials, or trinomials).',
  '11P.A.6': 'Solve problems that involve rational equations (limited to numerators and denominators that are monomials, binomials, or trinomials).',
  '11P.T.1': 'Demonstrate an understanding of angles in standard position [0° to 360°].',
  '11P.T.2': 'Solve problems, using the three primary trigonometric ratios (sine, cosine, and tangent) for angles from 0° to 360° in standard position.',
  '11P.T.3': 'Solve problems, using the cosine law and sine law, including the ambiguous case.',
  '11P.R.1': 'Factor polynomial expressions of the form ax² + bx + c, a ≠ 0; a²x² − b²y², a ≠ 0, b ≠ 0; a(f(x))² + b(f(x)) + c, a ≠ 0; a²(f(x))² − b²(g(y))², a ≠ 0, b ≠ 0; where a, b, and c are rational numbers.',
  '11P.R.2': 'Graph and analyze absolute value functions (limited to linear and quadratic functions) to solve problems.',
  '11P.R.3': 'Analyze quadratic functions of the form y = a(x − p)² + q and determine the vertex; domain and range; direction of opening; axis of symmetry; x- and y-intercepts.',
  '11P.R.4': 'Analyze quadratic functions of the form y = ax² + bx + c to identify characteristics of the corresponding graph, including vertex; domain and range; direction of opening; axis of symmetry; x- and y-intercepts.',
  '11P.R.5': 'Solve problems that involve quadratic equations.',
  '11P.R.6': 'Solve, algebraically and graphically, problems that involve systems of linear-quadratic and quadratic-quadratic equations in two variables.',
  '11P.R.7': 'Solve problems that involve linear and quadratic inequalities in two variables.',
  '11P.R.8': 'Solve problems that involve quadratic inequalities in one variable.',
  '11P.R.9': 'Analyze arithmetic sequences and series to solve problems.',
  '11P.R.10': 'Analyze geometric sequences and series to solve problems.',
  '11P.R.11': 'Graph and analyze reciprocal functions (limited to the reciprocal of linear and quadratic functions).',
  '12P.T.1': 'Demonstrate an understanding of angles in standard position, expressed in degrees and radians.',
  '12P.T.2': 'Develop and apply the equation of the unit circle.',
  '12P.T.3': 'Solve problems, using the six trigonometric ratios for angles expressed in radians and degrees.',
  '12P.T.4': 'Graph and analyze the trigonometric functions sine, cosine, and tangent to solve problems.',
  '12P.T.5': 'Solve, algebraically and graphically, first- and second-degree trigonometric equations with the domain expressed in degrees and radians.',
  '12P.T.6': 'Prove trigonometric identities, using reciprocal identities; quotient identities; Pythagorean identities; sum or difference identities (restricted to sine, cosine, and tangent); double-angle identities (restricted to sine, cosine, and tangent).',
  '12P.R.1': 'Demonstrate an understanding of operations on, and compositions of, functions.',
  '12P.R.2': 'Demonstrate an understanding of the effects of horizontal and vertical translations on the graphs of functions and their related equations.',
  '12P.R.3': 'Demonstrate an understanding of the effects of horizontal and vertical compressions and stretches on the graphs of functions and their related equations.',
  '12P.R.4': 'Apply translations, compressions, and stretches to the graphs and equations of functions.',
  '12P.R.5': 'Demonstrate an understanding of the effects of reflections on the graphs of functions and their related equations, including reflections through the x-axis; y-axis; line y = x.',
  '12P.R.6': 'Demonstrate an understanding of inverses of relations.',
  '12P.R.7': 'Demonstrate an understanding of logarithms.',
  '12P.R.8': 'Demonstrate an understanding of the product, quotient, and power laws of logarithms.',
  '12P.R.9': 'Graph and analyze exponential and logarithmic functions.',
  '12P.R.10': 'Solve problems that involve exponential and logarithmic equations.',
  '12P.R.11': 'Demonstrate an understanding of factoring polynomials of degree greater than 2 (limited to polynomials of degree ≤ 5 with integral coefficients).',
  '12P.R.12': 'Graph and analyze polynomial functions (limited to polynomial functions of degree ≤ 5).',
  '12P.R.13': 'Graph and analyze radical functions (limited to functions involving one radical).',
  '12P.R.14': 'Graph and analyze rational functions (limited to numerators and denominators that are monomials, binomials, or trinomials).',
  '12P.P.1': 'Apply the fundamental counting principle to solve problems.',
  '12P.P.2': 'Determine the number of permutations of n elements taken r at a time to solve problems.',
  '12P.P.3': 'Determine the number of combinations of n different elements taken r at a time to solve problems.',
  '12P.P.4': 'Expand powers of a binomial in a variety of ways, including using the binomial theorem (restricted to exponents that are natural numbers).',
};

export const GENERATOR_COURSES: Class[] = [MB_10I, MB_30S, MB_40S];
