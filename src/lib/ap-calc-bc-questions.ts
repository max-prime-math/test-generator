import type { Question } from './types';

type SeedQuestion = Omit<Question, 'id' | 'createdAt'>;

export const AP_CALC_BC_QUESTIONS: SeedQuestion[] = [
  // ── Unit 1: Limits and Continuity ─────────────────────────────────────────
  {
    classId: 'ap-calc-bc', unitId: '1', sectionId: '1.1', tags: ['graph'],
    points: 4,
    body: `The graph of $f(x)$ is shown. Based on the graph, which of the following best describes the behavior of $f(x)$ as $x$ approaches 2?

_Graph: upward-opening parabola $f(x) = (x - 2)^2 + 1$, vertex at $(2, 1)$, passing through $(0, 5)$ and $(4, 5)$. The function is continuous everywhere._
`,
    choices: {
      A: '$lim_(x->2) f(x) = 1$ and the function is continuous at $x=2$.',
      B: '$lim_(x->2) f(x) = 2$ but $f(2) = 1$, so the function is discontinuous.',
      C: '$lim_(x->2) f(x)$ does not exist because of a jump discontinuity.',
      D: '$f(2)$ is undefined, making the limit impossible to evaluate.',
      E: '$lim_(x->2) f(x) = infinity$'
    },
    answer: 'A',
  },
  {
    classId: 'ap-calc-bc', unitId: '1', sectionId: '1.1', tags: [],
    points: 5,
    body: `A car travels along a straight road. Its position (in miles) at time $t$ hours is given by $s(t) = t^2 + 1$. Using this model, explain in your own words what it would mean for the car's speed to exist "at an instant." Can the car truly have a speed at a single moment in time? Justify your answer.`,
    solution: `At an instant $t = a$, the instantaneous speed is defined as $lim_(h -> 0) (s(a+h) - s(a)) / h$. For $s(t) = t^2 + 1$, this limit equals $2a$, so yes, a well-defined speed exists at every instant.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '1', sectionId: '1.2', tags: [],
    points: 5,
    body: `Let $f(x) = (x^2 - 4) / (x - 2)$. \n(a) State $lim_(x -> 2) f(x)$ using limit notation and evaluate it. \n(b) Is $f$ defined at $x = 2$? Does this affect the limit? Explain.`,
    solution: `(a) $lim_(x -> 2) (x^2 - 4)/(x - 2) = lim_(x -> 2) (x+2) = 4$. \n(b) $f(2)$ is undefined (division by zero), but the limit depends only on values near $x=2$, not at $x=2$. So the limit is still 4.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '1', sectionId: '1.3', tags: [],
    points: 5,
    body: `The graph of $g(x)$ is given. Using the graph, estimate: \n(a) $lim_(x -> 1^-) g(x)$ \n(b) $lim_(x -> 1^+) g(x)$ \n(c) $lim_(x -> 1) g(x)$ \n(d) $g(1)$ \n\nFrom the graph: as $x -> 1^-$, $g(x) -> 3$; as $x -> 1^+$, $g(x) -> 3$; $g(1) = 5$.`,
    solution: `(a) 3 (b) 3 (c) 3, since left and right limits agree (d) $g(1) = 5$, which differs from the limit — so $g$ is discontinuous at $x=1$.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '1', sectionId: '1.4', tags: [],
    points: 5,
    body: `The table below gives values of $h(x)$ near $x = 0$:

$ mat(x, -0.1, -0.01, 0.01, 0.1; h(x), 1.9950, 1.9999, 2.0001, 2.0050) $

Based on the table, estimate $lim_(x -> 0) h(x)$ and explain your reasoning.`,
    solution: `As $x$ approaches 0 from both sides, $h(x)$ approaches 2. Therefore $lim_(x -> 0) h(x) = 2$.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '1', sectionId: '1.5', tags: [],
    points: 5,
    body: `Evaluate the following limits using algebraic properties. Show each step. \n(a) $lim_(x -> 3) (x^2 - 9)/(x - 3)$ \n(b) $lim_(x -> -2) (x^3 + 8)/(x + 2)$`,
    solution: `(a) Factor: $(x^2-9)/(x-3) = (x+3)$, so the limit is $3+3 = 6$. \n(b) Factor: $(x^3+8)/(x+2) = x^2 - 2x + 4$, so the limit is $4+4+4 = 12$.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '1', sectionId: '1.6', tags: [],
    points: 5,
    body: `Evaluate $lim_(x -> 0) (sqrt(x+4) - 2)/x$ by rationalizing the numerator. Show all algebraic steps.`,
    solution: `Multiply numerator and denominator by $sqrt(x+4)+2$: \n$(sqrt(x+4)-2)/x dot (sqrt(x+4)+2)/(sqrt(x+4)+2) = x/(x(sqrt(x+4)+2)) = 1/(sqrt(x+4)+2)$. \nAs $x->0$: $1/(sqrt(4)+2) = 1/4$.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '1', sectionId: '1.7', tags: [],
    points: 6,
    body: `For each limit, identify the most efficient technique (direct substitution, factoring, conjugate, or L'Hôpital's rule) and evaluate. \n(a) $lim_(x -> 5) (x^2 - 25)/(x^2 - 10x + 25)$ \n(b) $lim_(x -> 0) (sin x)/x$ \n(c) $lim_(x -> 4) sqrt(x) - 2$`,
    solution: `(a) Factor: $(x-5)(x+5)/(x-5)^2 = (x+5)/(x-5)$; as $x->5$ this $-> infinity$ (DNE). \n(b) Standard limit: $lim_(x->0) sin(x)/x = 1$. \n(c) Direct substitution: $sqrt(4)-2 = 0$.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '1', sectionId: '1.8', tags: [],
    points: 6,
    body: `Use the Squeeze Theorem to show that $lim_(x -> 0) x^2 sin(1/x) = 0$.`,
    solution: `Since $-1 <= sin(1/x) <= 1$ for all $x != 0$, we have $-x^2 <= x^2 sin(1/x) <= x^2$. Because $lim_(x->0) (-x^2) = 0$ and $lim_(x->0) x^2 = 0$, by the Squeeze Theorem $lim_(x->0) x^2 sin(1/x) = 0$.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '1', sectionId: '1.9', tags: [],
    points: 5,
    body: `A function $f$ has the following representations: \n- Algebraically: $f(x) = (x^2 - 1)/(x - 1)$ for $x != 1$ \n- Graphically: a line with a hole at $(1, 2)$ \n- Numerically: values approach 2 as $x -> 1$ \n\nExplain how all three representations confirm that $lim_(x -> 1) f(x) = 2$.`,
    solution: `Algebraically: $(x^2-1)/(x-1) = x+1 -> 2$ as $x->1$. Graphically: the hole at $(1,2)$ shows the function approaches but does not reach 2. Numerically: the table values approach 2. All three confirm the limit is 2.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '1', sectionId: '1.10', tags: [],
    points: 6,
    body: `Classify each discontinuity of $f(x) = (x^2 - x - 6)/(x^2 - 4)$ as removable, jump, or infinite. Justify each classification.`,
    solution: `Factor: $f(x) = ((x-3)(x+2))/((x-2)(x+2))$. At $x = -2$: factor cancels, giving a removable discontinuity (hole at $(-2, 5/(-4)) = (-2, -5/4)$). At $x = 2$: factor does not cancel, $f -> plus.minus infinity$, so it is an infinite discontinuity (vertical asymptote).`,
  },
  {
    classId: 'ap-calc-bc', unitId: '1', sectionId: '1.11', tags: [],
    points: 5,
    body: `Is $g(x) = cases(x^2 + 1 & x < 2, 5 & x = 2, 3x - 1 & x > 2)$ continuous at $x = 2$? Use the three-part definition of continuity to justify your answer.`,
    solution: `(1) $g(2) = 5$ ✓ \n(2) $lim_(x->2^-) g(x) = 4+1 = 5$ and $lim_(x->2^+) g(x) = 6-1 = 5$, so $lim_(x->2) g(x) = 5$ ✓ \n(3) $g(2) = lim_(x->2) g(x) = 5$ ✓ \nAll three conditions hold, so $g$ is continuous at $x=2$.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '1', sectionId: '1.12', tags: [],
    points: 5,
    body: `Determine the largest interval on which $h(x) = sqrt(9 - x^2)$ is continuous. Justify your answer using the definition of continuity on an interval.`,
    solution: `$h(x)$ requires $9 - x^2 >= 0$, i.e., $-3 <= x <= 3$. At the endpoints $x = plus.minus 3$, one-sided limits match the function values ($h(plus.minus 3) = 0$). So $h$ is continuous on the closed interval $[-3, 3]$.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '1', sectionId: '1.13', tags: [],
    points: 5,
    body: `Define $f(x) = (x^2 - 16)/(x - 4)$ for $x != 4$. Assign a value to $f(4)$ so that $f$ is continuous at $x = 4$. Explain how this removes the discontinuity.`,
    solution: `$lim_(x->4) (x^2-16)/(x-4) = lim_(x->4)(x+4) = 8$. Setting $f(4) = 8$ makes the function continuous because then $f(4) = lim_(x->4) f(x)$, removing the removable discontinuity.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '1', sectionId: '1.14', tags: [],
    points: 5,
    body: `Find all vertical asymptotes of $f(x) = (x + 3)/((x-1)(x+3))$ and determine the behavior of $f$ on each side of those asymptotes. Compute the relevant one-sided limits.`,
    solution: `Factor: $(x+3)$ cancels, leaving $1/(x-1)$ with a hole at $x=-3$. The only vertical asymptote is $x=1$. $lim_(x->1^-) 1/(x-1) = -infinity$ and $lim_(x->1^+) 1/(x-1) = +infinity$.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '1', sectionId: '1.15', tags: [],
    points: 5,
    body: `Find all horizontal asymptotes of $f(x) = (3x^2 - 5)/(2x^2 + 7)$ by evaluating $lim_(x -> +infinity) f(x)$ and $lim_(x -> -infinity) f(x)$. What does this tell you about the end behavior?`,
    solution: `Divide numerator and denominator by $x^2$: $(3 - 5/x^2)/(2 + 7/x^2) -> 3/2$ as $|x| -> infinity$. So there is one horizontal asymptote $y = 3/2$ in both directions; the function approaches $3/2$ as $x -> plus.minus infinity$.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '1', sectionId: '1.16', tags: [],
    points: 6,
    body: `Let $f(x) = x^3 - 4x + 1$. Use the Intermediate Value Theorem to show that $f$ has a root in the interval $(1, 2)$.`,
    solution: `$f$ is a polynomial, so it is continuous everywhere. $f(1) = 1 - 4 + 1 = -2 < 0$ and $f(2) = 8 - 8 + 1 = 1 > 0$. Since $f(1) < 0 < f(2)$ and $f$ is continuous on $[1,2]$, by the IVT there exists $c in (1,2)$ such that $f(c) = 0$.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '1', sectionId: '1.9', tags: ['graph'],
    points: 4,
    body: `The graph shows a function that has a removable discontinuity. At which point is the discontinuity located, and what value would need to be assigned to make the function continuous?

_Graph: line $f(x) = x + 1$ with an open circle (hole) at $(1, 2)$, indicating a removable discontinuity at $x = 1$._
`,
    choices: {
      A: 'At $x = -1$; assign $f(-1) = 0$',
      B: 'At $x = 0$; assign $f(0) = 1$',
      C: 'At $x = 1$; assign $f(1) = 2$',
      D: 'At $x = 2$; assign $f(2) = 3$',
      E: 'There is no discontinuity in this graph'
    },
    answer: 'C',
  },

  // ── Unit 2: Differentiation: Definition and Fundamental Properties ─────────
  {
    classId: 'ap-calc-bc', unitId: '2', sectionId: '2.1', tags: [],
    points: 5,
    body: `Let $f(x) = x^2$. \n(a) Find the average rate of change of $f$ on $[1, 3]$. \n(b) Find the instantaneous rate of change of $f$ at $x = 1$ using the limit definition.`,
    solution: `(a) $(f(3)-f(1))/(3-1) = (9-1)/2 = 4$. \n(b) $lim_(h->0) ((1+h)^2 - 1)/h = lim_(h->0) (2h + h^2)/h = lim_(h->0)(2+h) = 2$.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '2', sectionId: '2.2', tags: [],
    points: 5,
    body: `Using the limit definition of the derivative, find $f'(x)$ for $f(x) = 3x^2 - x$. Show all steps.`,
    solution: `$f'(x) = lim_(h->0) (f(x+h) - f(x))/h = lim_(h->0) (3(x+h)^2 - (x+h) - 3x^2 + x)/h = lim_(h->0) (6xh + 3h^2 - h)/h = lim_(h->0)(6x + 3h - 1) = 6x - 1$.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '2', sectionId: '2.3', tags: [],
    points: 5,
    body: `The table gives values of $g(x)$ near $x = 2$:

$ mat(x, 1.9, 1.99, 2.01, 2.1; g(x), 3.61, 3.9601, 4.0401, 4.41) $

Estimate $g'(2)$ using a symmetric difference quotient. Show your calculation.`,
    solution: `Using the symmetric difference: $g'(2) approx (g(2.1) - g(1.9))/(2.1 - 1.9) = (4.41 - 3.61)/0.2 = 0.8/0.2 = 4$. So $g'(2) approx 4$.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '2', sectionId: '2.4', tags: [],
    points: 5,
    body: `Consider $f(x) = |x|$. \n(a) Is $f$ continuous at $x = 0$? \n(b) Is $f$ differentiable at $x = 0$? \n(c) What does this example illustrate about the relationship between continuity and differentiability?`,
    solution: `(a) Yes: $lim_(x->0)|x| = 0 = f(0)$. \n(b) No: $lim_(h->0^+) h/h = 1$ but $lim_(h->0^-) (-h)/h = -1$; the one-sided derivatives differ. \n(c) Continuity does not imply differentiability; differentiability does imply continuity.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '2', sectionId: '2.5', tags: [],
    points: 4,
    body: `Differentiate each function using the Power Rule. \n(a) $f(x) = x^7$ \n(b) $g(x) = 4x^(-3)$ \n(c) $h(x) = sqrt(x)$ \n(d) $k(x) = x^(2/3)$`,
    solution: `(a) $7x^6$ \n(b) $-12x^(-4)$ \n(c) $1/(2sqrt(x))$ \n(d) $(2/3)x^(-1/3)$`,
  },
  {
    classId: 'ap-calc-bc', unitId: '2', sectionId: '2.6', tags: [],
    points: 4,
    body: `Find the derivative of $f(x) = 5x^4 - 3x^2 + 7x - 2$. State which derivative rules you used.`,
    solution: `$f'(x) = 20x^3 - 6x + 7$. Used: Constant Multiple Rule, Sum/Difference Rule, Power Rule, and the fact that the derivative of a constant is 0.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '2', sectionId: '2.7', tags: [],
    points: 4,
    body: `Find the derivative of each function. \n(a) $f(x) = sin x + e^x$ \n(b) $g(x) = 3cos x - 2ln x$ \n(c) $h(x) = e^x + cos x - x^3$`,
    solution: `(a) $cos x + e^x$ \n(b) $-3sin x - 2/x$ \n(c) $e^x - sin x - 3x^2$`,
  },
  {
    classId: 'ap-calc-bc', unitId: '2', sectionId: '2.8', tags: [],
    points: 5,
    body: `Differentiate $f(x) = x^3 sin x$ using the Product Rule. Then find the equation of the tangent line at $x = 0$.`,
    solution: `$f'(x) = 3x^2 sin x + x^3 cos x$. At $x=0$: $f(0) = 0$, $f'(0) = 0$. Tangent line: $y = 0$.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '2', sectionId: '2.9', tags: [],
    points: 5,
    body: `Differentiate $f(x) = (x^2 + 1)/(x - 3)$ using the Quotient Rule. Simplify your answer.`,
    solution: `$f'(x) = (2x(x-3) - (x^2+1)(1))/(x-3)^2 = (2x^2 - 6x - x^2 - 1)/(x-3)^2 = (x^2 - 6x - 1)/(x-3)^2$.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '2', sectionId: '2.10', tags: [],
    points: 5,
    body: `Find the derivative of $f(x) = tan x$ from scratch using the derivatives of $sin x$ and $cos x$ and the Quotient Rule. Then state the derivatives of $cot x$, $sec x$, and $csc x$.`,
    solution: `$tan x = sin x / cos x$, so $d/(d x) tan x = (cos x dot.op cos x - sin x dot.op (-sin x))/cos^2 x = (cos^2 x + sin^2 x)/cos^2 x = 1/cos^2 x = sec^2 x$. \n$d/(d x) cot x = -csc^2 x$; $d/(d x) sec x = sec x tan x$; $d/(d x) csc x = -csc x cot x$.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '2', sectionId: '2.3', tags: ['graph'],
    points: 4,
    body: `The graph of function $f(x)$ is shown. Based on the graph, what is the approximate slope of the tangent line to the curve at $x = 1$?

_Graph: parabola $f(x) = x^2 - 2x$, vertex at $(1, -1)$, opening upward. The curve passes through $(0, 0)$ and $(2, 0)$._
`,
    choices: {
      A: '$-2$',
      B: '$-1$',
      C: '$0$',
      D: '$1$',
      E: '$2$'
    },
    answer: 'B',
  },
  {
    classId: 'ap-calc-bc', unitId: '2', sectionId: '2.11', tags: ['graph'],
    points: 5,
    body: `Which of the following could be the graph of the derivative of $f(x) = x^3 - 3x$?

_Graph: upward-opening parabola $f'(x) = 3x^2 - 3$, with zeros at $x = -1$ and $x = 1$, minimum at $(0, -3)$._
`,
    choices: {
      A: 'A cubic function with a local maximum at $x = -1$',
      B: 'A parabola opening upward with vertex at $(0, -3)$',
      C: 'A decreasing linear function',
      D: 'A parabola opening downward with vertex at $(1, 0)$',
      E: 'An exponential function'
    },
    answer: 'B',
  },

  // ── Unit 3: Differentiation: Composite, Implicit, and Inverse Functions ────
  {
    classId: 'ap-calc-bc', unitId: '3', sectionId: '3.1', tags: [],
    points: 5,
    body: `Differentiate using the Chain Rule: \n(a) $f(x) = sin(3x^2)$ \n(b) $g(x) = (x^2 + 5)^7$ \n(c) $h(x) = e^(cos x)$`,
    solution: `(a) $6x cos(3x^2)$ \n(b) $7(x^2+5)^6 dot.op 2x = 14x(x^2+5)^6$ \n(c) $-sin(x) e^(cos x)$`,
  },
  {
    classId: 'ap-calc-bc', unitId: '3', sectionId: '3.2', tags: [],
    points: 5,
    body: `Given $x^2 + y^2 = 25$, use implicit differentiation to find $(d y)/(d x)$. Then find the slope of the tangent line at the point $(3, 4)$.`,
    solution: `Differentiate both sides: $2x + 2y (d y)/(d x) = 0$, so $(d y)/(d x) = -x/y$. At $(3,4)$: $(d y)/(d x) = -3/4$.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '3', sectionId: '3.3', tags: [],
    points: 5,
    body: `Let $f(x) = x^3 + x$. \n(a) Verify that $f$ is one-to-one. \n(b) Without finding $f^(-1)$, find $(f^(-1))'(2)$ given that $f(1) = 2$.`,
    solution: `(a) $f'(x) = 3x^2 + 1 > 0$ for all $x$, so $f$ is strictly increasing and one-to-one. \n(b) $(f^(-1))'(2) = 1/f'(f^(-1)(2)) = 1/f'(1) = 1/(3+1) = 1/4$.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '3', sectionId: '3.4', tags: [],
    points: 5,
    body: `Find the derivative of each function. \n(a) $f(x) = arcsin(2x)$ \n(b) $g(x) = arctan(x^2)$ \n(c) $h(x) = op("arcsec")(e^x)$`,
    solution: `(a) $2/sqrt(1-4x^2)$ \n(b) $2x/(1+x^4)$ \n(c) $e^x/(e^x sqrt(e^(2x)-1)) = 1/sqrt(e^(2x)-1)$`,
  },
  {
    classId: 'ap-calc-bc', unitId: '3', sectionId: '3.5', tags: [],
    points: 6,
    body: `Differentiate each function, choosing the appropriate technique: \n(a) $f(x) = ln(sin x)$ \n(b) $g(x) = x^2 e^(3x)$ \n(c) $h(x) = (cos x)/(1 + sin x)$ \n(d) $k(x) = arctan(sqrt(x))$`,
    solution: `(a) $cos(x)/sin(x) = cot x$ (chain rule + ln derivative) \n(b) $2x e^(3x) + 3x^2 e^(3x) = x e^(3x)(2+3x)$ (product rule) \n(c) $(-sin x(1+sin x) - cos^2 x)/(1+sin x)^2 = (-sin x - 1)/(1+sin x)^2 = -1/(1+sin x)$ (quotient rule) \n(d) $1/(1+x) dot.op 1/(2sqrt(x)) = 1/(2sqrt(x)(1+x))$ (chain rule)`,
  },
  {
    classId: 'ap-calc-bc', unitId: '3', sectionId: '3.6', tags: [],
    points: 5,
    body: `Let $f(x) = x^4 - 2x^2$. Find $f''(x)$ and $f'''(x)$. Then identify the values of $x$ where $f''(x) = 0$.`,
    solution: `$f'(x) = 4x^3 - 4x$ \n$f''(x) = 12x^2 - 4$ \n$f'''(x) = 24x$ \n$f''(x)=0$: $12x^2 = 4 => x = plus.minus 1/sqrt(3) = plus.minus sqrt(3)/3$.`,
  },

  // ── Unit 4: Contextual Applications of Differentiation ────────────────────
  {
    classId: 'ap-calc-bc', unitId: '4', sectionId: '4.1', tags: [],
    points: 5,
    body: `The temperature of a cup of coffee (in °F) at time $t$ minutes is $T(t) = 70 + 110 e^(-0.05t)$. \n(a) Find $T'(t)$ and interpret its meaning. \n(b) Find $T'(10)$ and interpret in context.`,
    solution: `(a) $T'(t) = -5.5 e^(-0.05t)$ °F per minute. This represents the rate at which the coffee is cooling. \n(b) $T'(10) = -5.5 e^(-0.5) approx -3.33$ °F/min. The coffee is cooling at about 3.33°F per minute after 10 minutes.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '4', sectionId: '4.2', tags: [],
    points: 6,
    body: `A particle moves along the $x$-axis with position $s(t) = t^3 - 6t^2 + 9t$ for $t >= 0$. \n(a) Find the velocity and acceleration functions. \n(b) When is the particle at rest? \n(c) When is the particle moving in the negative direction?`,
    solution: `(a) $v(t) = 3t^2 - 12t + 9$; $a(t) = 6t - 12$. \n(b) $v(t) = 0$: $3(t-1)(t-3)=0$, so $t=1$ and $t=3$. \n(c) $v(t) < 0$ when $1 < t < 3$ (since the parabola opens up with roots at 1 and 3).`,
  },
  {
    classId: 'ap-calc-bc', unitId: '4', sectionId: '4.3', tags: [],
    points: 5,
    body: `Water is draining from a conical tank. The volume of water in the tank at time $t$ (in minutes) is $V(t) = 500 - 2t^2$ liters. \n(a) Find the rate at which water is leaving at $t = 5$ min. \n(b) At what time is the tank draining the fastest?`,
    solution: `(a) $V'(t) = -4t$. At $t=5$: $V'(5) = -20$ L/min. Water is leaving at 20 L/min. \n(b) The magnitude $|V'(t)| = 4t$ increases with $t$, so the tank drains fastest as $t$ increases (assuming the model holds).`,
  },
  {
    classId: 'ap-calc-bc', unitId: '4', sectionId: '4.4', tags: [],
    points: 5,
    body: `A ladder 10 feet long leans against a vertical wall. The bottom of the ladder slides away from the wall at $2$ ft/sec. Write an equation relating the distance $x$ of the bottom from the wall and the height $y$ of the top. Use implicit differentiation to find $(d y)/(d t)$ in terms of $x$, $y$, and $(d x)/(d t)$.`,
    solution: `$x^2 + y^2 = 100$. Differentiating: $2x ((d x)/(d t)) + 2y ((d y)/(d t)) = 0$, so $(d y)/(d t) = -(x/y)((d x)/(d t))$.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '4', sectionId: '4.5', tags: [],
    points: 6,
    body: `A spherical balloon is being inflated so its radius increases at $0.5$ cm/sec. How fast is the volume increasing when the radius is $4$ cm? (Volume of a sphere: $V = (4/3)pi r^3$.)`,
    solution: `$(d V)/(d t) = 4pi r^2 ((d r)/(d t))$. At $r=4$: $(d V)/(d t) = 4pi(16)(0.5) = 32pi approx 100.5$ cm³/sec.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '4', sectionId: '4.6', tags: [],
    points: 5,
    body: `Use linear approximation (linearization) of $f(x) = sqrt(x)$ at $a = 25$ to estimate $sqrt(26)$. How accurate is your estimate?`,
    solution: `$L(x) = f(25) + f'(25)(x-25) = 5 + (1/10)(x-25)$. $L(26) = 5 + 0.1 = 5.1$. Actual: $sqrt(26) approx 5.0990$. Error $approx 0.001$.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '4', sectionId: '4.7', tags: [],
    points: 5,
    body: `Evaluate using L'Hôpital's Rule. Verify that the indeterminate form applies before applying the rule. \n(a) $lim_(x -> 0) (e^x - 1)/x$ \n(b) $lim_(x -> infinity) x/e^x$`,
    solution: `(a) $0/0$ form: $lim_(x->0) e^x/1 = 1$. \n(b) $infinity/infinity$ form: $lim_(x->infinity) 1/e^x = 0$.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '4', sectionId: '4.8', tags: ['graph'],
    points: 5,
    body: `The graph shows the population $P(t)$ of bacteria over time $t$ (hours). Based on the graph, which function best models this population?

_Graph: exponential growth curve starting at $P(0) = 100$, doubling every 2 hours. Key values: $P(2) approx 200$, $P(4) approx 400$, $P(6) approx 800$._
`,
    choices: {
      A: '$P(t) = 100 + 2t$',
      B: '$P(t) = 100 dot.op 2^(t/2)$',
      C: '$P(t) = 100 dot.op e^(0.693t)$',
      D: '$P(t) = 100 dot.op (1.5)^t$',
      E: '$P(t) = 1000 - 100t$'
    },
    answer: 'B',
  },

  // ── Unit 5: Analytical Applications of Differentiation ────────────────────
  {
    classId: 'ap-calc-bc', unitId: '5', sectionId: '5.1', tags: [],
    points: 5,
    body: `Let $f(x) = x^3$ on $[0, 2]$. The Mean Value Theorem guarantees a $c in (0,2)$ where $f'(c)$ equals the average rate of change. Find all such values of $c$.`,
    solution: `Average rate of change: $(f(2)-f(0))/(2-0) = 8/2 = 4$. Set $f'(c) = 3c^2 = 4$: $c = sqrt(4/3) = 2/sqrt(3) = 2sqrt(3)/3 approx 1.155$, which is in $(0,2)$.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '5', sectionId: '5.2', tags: [],
    points: 5,
    body: `Let $f(x) = x^3 - 3x$ on $[-2, 2]$. \n(a) Find all critical points. \n(b) Identify global maximum and minimum values on the interval.`,
    solution: `(a) $f'(x) = 3x^2 - 3 = 3(x-1)(x+1) = 0$; critical points at $x = plus.minus 1$. \n(b) Evaluate: $f(-2) = -2$, $f(-1) = 2$, $f(1) = -2$, $f(2) = 2$. Global max: $2$ (at $x = -1$ and $x = 2$). Global min: $-2$ (at $x = 1$ and $x = -2$).`,
  },
  {
    classId: 'ap-calc-bc', unitId: '5', sectionId: '5.3', tags: [],
    points: 5,
    body: `Determine the intervals on which $f(x) = 2x^3 - 9x^2 + 12x - 4$ is increasing or decreasing. Justify using the sign of $f'$.`,
    solution: `$f'(x) = 6x^2 - 18x + 12 = 6(x-1)(x-2)$. Sign chart: $f' > 0$ on $(-infinity,1)$ (increasing), $f' < 0$ on $(1,2)$ (decreasing), $f' > 0$ on $(2,infinity)$ (increasing).`,
  },
  {
    classId: 'ap-calc-bc', unitId: '5', sectionId: '5.4', tags: [],
    points: 5,
    body: `Using the First Derivative Test, classify all local extrema of $f(x) = x^4 - 4x^3$.`,
    solution: `$f'(x) = 4x^3 - 12x^2 = 4x^2(x-3)$. Critical points: $x=0$ and $x=3$. At $x=0$: $f'$ does not change sign (negative on both sides of 0) — no local extremum. At $x=3$: $f'$ changes from $-$ to $+$ — local minimum $f(3) = 81 - 108 = -27$.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '5', sectionId: '5.5', tags: [],
    points: 5,
    body: `Find the absolute maximum and minimum values of $f(x) = sin x + cos x$ on $[0, pi]$ using the Candidates Test.`,
    solution: `$f'(x) = cos x - sin x = 0$ when $tan x = 1$, i.e. $x = pi/4$ in $[0,pi]$. Candidates: $f(0) = 1$, $f(pi/4) = sqrt(2)$, $f(pi) = -1$. Absolute max: $sqrt(2)$ at $x=pi/4$. Absolute min: $-1$ at $x=pi$.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '5', sectionId: '5.6', tags: [],
    points: 5,
    body: `Find the intervals of concavity and inflection points of $f(x) = x^4 - 6x^2$.`,
    solution: `$f'(x) = 4x^3 - 12x$; $f''(x) = 12x^2 - 12 = 12(x-1)(x+1)$. $f'' > 0$ on $(-infinity,-1) union (1,infinity)$ (concave up); $f'' < 0$ on $(-1,1)$ (concave down). Inflection points at $x = plus.minus 1$: $f(plus.minus 1) = 1 - 6 = -5$.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '5', sectionId: '5.7', tags: [],
    points: 5,
    body: `Use the Second Derivative Test to classify all local extrema of $g(x) = x^3 - 6x^2 + 9x$.`,
    solution: `$g'(x) = 3x^2 - 12x + 9 = 3(x-1)(x-3)$; critical points $x=1, 3$. $g''(x) = 6x - 12$. At $x=1$: $g''(1) = -6 < 0$ — local max $g(1) = 4$. At $x=3$: $g''(3) = 6 > 0$ — local min $g(3) = 0$.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '5', sectionId: '5.8', tags: [],
    points: 6,
    body: `Given $f'(x) = (x-1)^2(x+2)$, sketch a sign chart for $f'$ and $f''$, identify intervals of increase/decrease, concavity, and any local extrema. You do not need to find $f(x)$.`,
    solution: `$f'(x) = (x-1)^2(x+2)$: zeros at $x=-2$ and $x=1$. $f' < 0$ for $x < -2$; $f' > 0$ for $x > -2$ (except $x=1$). Local min at $x=-2$ (sign change $- to +$); no extremum at $x=1$ (no sign change). $f''(x) = 2(x-1)(x+2)+(x-1)^2 = (x-1)(3x+3) = 3(x-1)(x+1)$. Concave down on $(-1,1)$, concave up elsewhere. Inflection points at $x=plus.minus 1$.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '5', sectionId: '5.9', tags: [],
    points: 5,
    body: `A function $f$ has $f'(x) = x^2 - 4$ and $f''(x) = 2x$. \n(a) Where is $f$ increasing? \n(b) Where is $f$ concave up? \n(c) What does the relationship between $f'$ and $f''$ tell you about $f$?`,
    solution: `(a) $f'(x) > 0$ when $x < -2$ or $x > 2$. \n(b) $f''(x) > 0$ when $x > 0$. \n(c) $f''$ shows where $f'$ is increasing. Where $f'' > 0$, $f'$ is increasing (slope of $f$ becoming less negative or more positive) — so $f$ is concave up.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '5', sectionId: '5.10', tags: [],
    points: 5,
    body: `A rectangular area is to be enclosed using 120 meters of fencing. Set up the optimization problem: define the objective function and constraint. Do not yet solve for the maximum.`,
    solution: `Let $x$ and $y$ be the side lengths. Constraint: $2x + 2y = 120$, i.e. $y = 60 - x$. Objective: maximize $A = x y = x(60-x) = 60x - x^2$. Domain: $0 < x < 60$.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '5', sectionId: '5.11', tags: [],
    points: 6,
    body: `A rectangular area is to be enclosed using 120 meters of fencing. Find the dimensions that maximize the area. Justify that your answer is indeed a maximum.`,
    solution: `$A(x) = 60x - x^2$. $A'(x) = 60 - 2x = 0 => x = 30$. $A''(x) = -2 < 0$ confirms a maximum. Dimensions: $30 m times 30 m$ (a square). Maximum area: $900$ m².`,
  },
  {
    classId: 'ap-calc-bc', unitId: '5', sectionId: '5.12', tags: [],
    points: 6,
    body: `Consider the curve defined implicitly by $x^2 + x y + y^2 = 7$. Find $(d y)/(d x)$ and $(d^2 y)/(d x^2)$ at the point $(1, 2)$.`,
    solution: `Differentiate: $2x + y + x (d y)/(d x) + 2y (d y)/(d x) = 0 => (d y)/(d x) = -(2x+y)/(x+2y)$. At $(1,2)$: $(d y)/(d x) = -(4)/(5) = -4/5$. For $(d^2 y)/(d x^2)$: differentiate $(d y)/(d x)$ implicitly (quotient rule + chain rule), substituting $(d y)/(d x) = -4/5$ at $(1,2)$ gives $(d^2 y)/(d x^2) = -2/25$ (details vary by method).`,
  },
  {
    classId: 'ap-calc-bc', unitId: '5', sectionId: '5.4', tags: ['graph'],
    points: 4,
    body: `The graph of $f'(x)$ (the derivative of $f$) is shown. At which point does $f(x)$ have a local maximum?

_Graph of $f'(x)$: upward-opening parabola $f'(x) = (x-1)(x-3)$. The derivative is positive on $(0, 1)$, negative on $(1, 3)$, and positive again on $(3, 4)$. Zeros at $x = 1$ and $x = 3$._
`,
    choices: {
      A: '$x = 0$',
      B: '$x = 1$',
      C: '$x = 2$',
      D: '$x = 3$',
      E: '$x = 4$'
    },
    answer: 'B',
  },

  // ── Unit 6: Integration and Accumulation of Change ─────────────────────────
  {
    classId: 'ap-calc-bc', unitId: '6', sectionId: '6.1', tags: [],
    points: 5,
    body: `A factory emits pollutants at a rate of $r(t) = 3t^2$ kg/hr where $t$ is time in hours. Interpret what $integral_0^4 r(t) d t$ represents in context, and explain why integration represents accumulation.`,
    solution: `$integral_0^4 3t^2 d t = [t^3]_0^4 = 64$ kg. This represents the total mass of pollutants emitted over the first 4 hours. Integration accumulates the rate over time, giving total change.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '6', sectionId: '6.2', tags: [],
    points: 6,
    body: `Approximate $integral_1^3 x^2 d x$ using a left Riemann sum with $n = 4$ subintervals. Then compare to the exact value.`,
    solution: `$Delta x = 0.5$. Left endpoints: $1, 1.5, 2, 2.5$. Sum $= 0.5(1 + 2.25 + 4 + 6.25) = 0.5(13.5) = 6.75$. Exact: $[x^3/3]_1^3 = 9 - 1/3 = 26/3 approx 8.667$. The left sum underestimates since $x^2$ is increasing.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '6', sectionId: '6.3', tags: [],
    points: 5,
    body: `Express the limit $lim_(n -> infinity) sum_(i=1)^n (3 + i dot.op 2/n)^2 dot.op (2/n)$ as a definite integral and evaluate it.`,
    solution: `This is a Riemann sum for $integral_3^5 x^2 d x$ (width $2/n$, $x_i = 3 + i dot.op 2/n$). $integral_3^5 x^2 d x = [x^3/3]_3^5 = 125/3 - 9 = 98/3$.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '6', sectionId: '6.4', tags: [],
    points: 5,
    body: `Let $F(x) = integral_0^x cos(t^2) d t$. \n(a) Find $F'(x)$. \n(b) Find $F'(sqrt(pi/2))$. \n(c) On what intervals is $F$ increasing?`,
    solution: `(a) By FTC Part 1: $F'(x) = cos(x^2)$. \n(b) $F'(sqrt(pi/2)) = cos(pi/2) = 0$. \n(c) $F$ is increasing where $cos(x^2) > 0$.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '6', sectionId: '6.5', tags: [],
    points: 5,
    body: `Let $g(x) = integral_0^x f(t) d t$ where $f(t)$ is given by the graph (positive for $0 < t < 2$, negative for $2 < t < 4$, with equal areas). Describe the behavior of $g$: where is it increasing, decreasing, and what is the maximum value?`,
    solution: `$g'(x) = f(x)$. $g$ increases on $(0,2)$ (where $f > 0$) and decreases on $(2,4)$ (where $f < 0$). The maximum of $g$ occurs at $x=2$. Since the areas are equal, $g(4) = 0 = g(0)$.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '6', sectionId: '6.6', tags: [],
    points: 5,
    body: `Given $integral_0^3 f(x) d x = 7$ and $integral_0^3 g(x) d x = 4$, find: \n(a) $integral_0^3 [2f(x) - 3g(x)] d x$ \n(b) $integral_3^0 f(x) d x$ \n(c) $integral_1^3 f(x) d x$ if $integral_0^1 f(x) d x = 2$`,
    solution: `(a) $2(7) - 3(4) = 14 - 12 = 2$. \n(b) $-7$. \n(c) $integral_0^3 f - integral_0^1 f = 7 - 2 = 5$.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '6', sectionId: '6.7', tags: [],
    points: 5,
    body: `Evaluate $integral_1^e (3/x + x) d x$ using the Fundamental Theorem of Calculus.`,
    solution: `$integral_1^e (3/x + x) d x = [3 ln x + x^2/2]_1^e = (3 + e^2/2) - (0 + 1/2) = 3 + (e^2-1)/2$.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '6', sectionId: '6.4', tags: [],
    points: 4,
    body: `Consider the function $f(x) = sqrt(x)$ on the interval $[0, 4]$. Which of the following is the best estimate for the area under the curve?`,
    choices: {
      A: '$integral_0^4 sqrt(x) d x = 8$',
      B: '$integral_0^4 sqrt(x) d x approx 5.33$',
      C: '$integral_0^4 sqrt(x) d x = 4$',
      D: '$integral_0^4 sqrt(x) d x = 2$',
      E: 'Cannot be determined'
    },
    answer: 'B',
  },
  {
    classId: 'ap-calc-bc', unitId: '6', sectionId: '6.8', tags: [],
    points: 5,
    body: `Find the following indefinite integrals: \n(a) $integral (5x^3 - 2x + 7) d x$ \n(b) $integral (cos x + e^x) d x$ \n(c) $integral x^(-4) d x$`,
    solution: `(a) $(5/4)x^4 - x^2 + 7x + C$ \n(b) $sin x + e^x + C$ \n(c) $-1/(3x^3) + C$`,
  },
  {
    classId: 'ap-calc-bc', unitId: '6', sectionId: '6.9', tags: [],
    points: 5,
    body: `Evaluate using substitution: \n(a) $integral x cos(x^2) d x$ \n(b) $integral_0^1 2x e^(x^2) d x$`,
    solution: `(a) Let $u = x^2$, $d u = 2x d x$: $(1/2) integral cos u d u = (1/2) sin(x^2) + C$. \n(b) Let $u = x^2$: $integral_0^1 e^u d u = [e^u]_0^1 = e - 1$.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '6', sectionId: '6.10', tags: [],
    points: 5,
    body: `Evaluate: \n(a) $integral (x^2 + 3)/(x+1) d x$ using polynomial long division \n(b) $integral 1/(x^2 + 4x + 5) d x$ by completing the square`,
    solution: `(a) Long divide: $x^2+3 = (x+1)(x-1) + 4$, so $(x-1) + 4/(x+1)$. Integral: $x^2/2 - x + 4 ln|x+1| + C$. \n(b) $x^2+4x+5 = (x+2)^2+1$. $integral 1/((x+2)^2+1) d x = arctan(x+2) + C$.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '6', sectionId: '6.11', tags: [],
    points: 6,
    body: `Evaluate $integral x e^x d x$ using integration by parts. Show all steps including your choice of $u$ and $d v$.`,
    solution: `Let $u = x$, $d v = e^x d x$; then $d u = d x$, $v = e^x$. \n$integral x e^x d x = x e^x - integral e^x d x = x e^x - e^x + C = e^x(x-1) + C$.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '6', sectionId: '6.12', tags: [],
    points: 6,
    body: `Decompose and integrate $integral (3x + 1)/((x-1)(x+2)) d x$ using linear partial fractions.`,
    solution: `$(3x+1)/((x-1)(x+2)) = A/(x-1) + B/(x+2)$. Multiply through: $3x+1 = A(x+2)+B(x-1)$. At $x=1$: $4=3A$, $A=4/3$. At $x=-2$: $-5=-3B$, $B=5/3$. Integral: $(4/3)ln|x-1| + (5/3)ln|x+2| + C$.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '6', sectionId: '6.13', tags: [],
    points: 6,
    body: `Evaluate the improper integral $integral_1^infinity 1/x^2 d x$. Determine whether it converges or diverges, and if it converges, find its value.`,
    solution: `$integral_1^infinity x^(-2) d x = lim_(b->infinity) [-1/x]_1^b = lim_(b->infinity) (-1/b + 1) = 0 + 1 = 1$. The integral converges to $1$.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '6', sectionId: '6.14', tags: [],
    points: 6,
    body: `For each integral, identify the best technique and evaluate. \n(a) $integral sin^2 x cos x d x$ \n(b) $integral x^2 ln x d x$ \n(c) $integral 1/(x^2 - 1) d x$`,
    solution: `(a) Substitution $u = sin x$: $u^3/3 + C = (sin^3 x)/3 + C$. \n(b) IBP with $u = ln x$, $d v = x^2 d x$: $(x^3/3)ln x - x^3/9 + C$. \n(c) Partial fractions: $(1/2)ln|x-1| - (1/2)ln|x+1| + C$.`,
  },

  // ── Unit 7: Differential Equations ────────────────────────────────────────
  {
    classId: 'ap-calc-bc', unitId: '7', sectionId: '7.1', tags: [],
    points: 5,
    body: `A population $P$ grows at a rate proportional to its current size. Write a differential equation modeling this situation. What does each symbol in your equation represent?`,
    solution: `$(d P)/(d t) = k P$, where $P$ is the population at time $t$, $k > 0$ is the proportionality constant (growth rate), and $(d P)/(d t)$ is the rate of change of population. This is the exponential growth model.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '7', sectionId: '7.2', tags: [],
    points: 5,
    body: `Verify that $y = C e^(-2x)$ is a solution to the differential equation $(d y)/(d x) + 2y = 0$ for any constant $C$.`,
    solution: `$(d y)/(d x) = -2C e^(-2x)$. Substituting: $-2C e^(-2x) + 2(C e^(-2x)) = 0$ ✓. So $y = C e^(-2x)$ satisfies the equation for all $C$.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '7', sectionId: '7.3', tags: [],
    points: 5,
    body: `For the differential equation $(d y)/(d x) = x - y$, sketch the slope field at the points: $(0,0), (1,0), (0,1), (1,1), (-1,0)$. For each point, compute and draw the slope.`,
    solution: `At $(0,0)$: slope $=0$. At $(1,0)$: slope $=1$. At $(0,1)$: slope $=-1$. At $(1,1)$: slope $=0$. At $(-1,0)$: slope $=-1$. Draw short line segments with these slopes at the given points.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '7', sectionId: '7.4', tags: [],
    points: 5,
    body: `Using the slope field for $(d y)/(d x) = y - x$ (described verbally: slopes are positive above the line $y=x$ and negative below it), sketch and describe the behavior of the solution curve passing through $(0, 0)$.`,
    solution: `At $(0,0)$: $(d y)/(d x) = 0$. Since the slope field has positive slopes above $y=x$, the curve will initially follow $y=x$, then curve upward. The particular solution grows without bound as $x$ increases.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '7', sectionId: '7.5', tags: [],
    points: 6,
    body: `Use Euler's method with step size $h = 0.5$ to approximate $y(1)$ for $(d y)/(d x) = x + y$, $y(0) = 1$.`,
    solution: `Step 1 ($x=0$): $y_1 = 1 + 0.5(0+1) = 1.5$. Step 2 ($x=0.5$): $y_2 = 1.5 + 0.5(0.5+1.5) = 1.5 + 1 = 2.5$. Approximation: $y(1) approx 2.5$. (Exact solution is $y = 2e^x - x - 1$; $y(1) = 2e - 2 approx 3.436$.)`,
  },
  {
    classId: 'ap-calc-bc', unitId: '7', sectionId: '7.6', tags: [],
    points: 5,
    body: `Solve the separable differential equation $(d y)/(d x) = x y^2$ by separating variables and integrating. Find the general solution.`,
    solution: `Separate: $y^(-2) d y = x d x$. Integrate: $-1/y = x^2/2 + C$. Solve for $y$: $y = -1/(x^2/2 + C) = -2/(x^2 + K)$ where $K = 2C$.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '7', sectionId: '7.7', tags: [],
    points: 5,
    body: `Solve the IVP: $(d y)/(d x) = 3y$, $y(0) = 5$.`,
    solution: `Separate: $d y/y = 3 d x$. Integrate: $ln|y| = 3x + C_0$. So $y = A e^(3x)$. Apply IC: $5 = A e^0 = A$. Particular solution: $y = 5e^(3x)$.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '7', sectionId: '7.8', tags: [],
    points: 5,
    body: `A bacteria culture starts with 500 bacteria and doubles every 3 hours. \n(a) Write an exponential model $P(t)$. \n(b) How many bacteria are present after 9 hours? \n(c) Write the differential equation this model satisfies.`,
    solution: `(a) $P(t) = 500 dot.op 2^(t/3)$. Equivalently, $P(t) = 500 e^(k t)$ where $k = (ln 2)/3$. \n(b) $P(9) = 500 dot.op 2^3 = 4000$. \n(c) $(d P)/(d t) = k P = (ln 2)/3 dot.op P$.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '7', sectionId: '7.9', tags: [],
    points: 6,
    body: `A population is modeled by the logistic equation $(d P)/(d t) = 0.2P(1 - P/1000)$. \n(a) What is the carrying capacity? \n(b) What is the population's growth rate when $P = 500$? \n(c) For what value of $P$ is growth maximized?`,
    solution: `(a) Carrying capacity: $K = 1000$. \n(b) $(d P)/(d t)|_(P=500) = 0.2(500)(1-0.5) = 50$ individuals/unit time. \n(c) Growth is maximized at $P = K/2 = 500$.`,
  },

  // ── Unit 8: Applications of Integration ───────────────────────────────────
  {
    classId: 'ap-calc-bc', unitId: '8', sectionId: '8.1', tags: [],
    points: 5,
    body: `Find the average value of $f(x) = x^2$ on $[1, 4]$. Interpret this value in context.`,
    solution: `$f_"avg" = 1/(4-1) integral_1^4 x^2 d x = (1/3)[x^3/3]_1^4 = (1/3)(64/3 - 1/3) = (1/3)(63/3) = 7$. The average value of $x^2$ on $[1,4]$ is $7$.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '8', sectionId: '8.2', tags: [],
    points: 5,
    body: `A particle has velocity $v(t) = t^2 - 4t + 3$ for $0 <= t <= 4$. \n(a) Find the total displacement. \n(b) Find the total distance traveled.`,
    solution: `(a) $integral_0^4 (t^2-4t+3)d t = [t^3/3 - 2t^2 + 3t]_0^4 = (64/3 - 32 + 12) = 4/3$. \n(b) $v(t) = (t-1)(t-3)$; zeros at $t=1,3$. Total distance $= integral_0^1 v d t - integral_1^3 v d t + integral_3^4 v d t = 4/3 + 8/3 + 4/3 = 16/3$ (split into sub-intervals at zeros of $v$).`,
  },
  {
    classId: 'ap-calc-bc', unitId: '8', sectionId: '8.3', tags: [],
    points: 5,
    body: `Oil spills from a tanker at a rate of $r(t) = 50e^(-0.1t)$ barrels per hour. How much oil spills in the first 10 hours?`,
    solution: `$integral_0^(10) 50 e^(-0.1t) d t = 50[-10 e^(-0.1t)]_0^(10) = -500(e^(-1) - 1) = 500(1 - e^(-1)) approx 500(0.6321) approx 316$ barrels.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '8', sectionId: '8.4', tags: [],
    points: 5,
    body: `Find the area between $f(x) = x^2$ and $g(x) = x + 2$ on their overlapping region.`,
    solution: `Intersect: $x^2 = x+2 => x^2-x-2=0 => (x-2)(x+1)=0$; $x=-1, 2$. Area $= integral_(-1)^(2)(x+2-x^2)d x = [x^2/2 + 2x - x^3/3]_(-1)^2 = (2+4-8/3)-(1/2-2+1/3) = 9/2`,
  },
  {
    classId: 'ap-calc-bc', unitId: '8', sectionId: '8.5', tags: [],
    points: 5,
    body: `Find the area of the region bounded by $y^2 = x$ and $x = y + 2$, integrating with respect to $y$.`,
    solution: `Express: $x = y^2$ and $x = y+2$. Intersect: $y^2 = y+2 => y=2, -1$. Area $= integral_(-1)^(2)(y+2-y^2)d y = [y^2/2 + 2y - y^3/3]_(-1)^(2) = 9/2$`,
  },
  {
    classId: 'ap-calc-bc', unitId: '8', sectionId: '8.6', tags: [],
    points: 6,
    body: `Find the total area of all regions enclosed between $f(x) = sin x$ and $g(x) = cos x$ on $[0, 2pi]$.`,
    solution: `$sin x = cos x$ at $x = pi/4, 5pi/4$ on $[0,2pi]$. Total area $= integral_0^(pi/4)(cos x - sin x)d x + integral_(pi/4)^(5pi/4)(sin x - cos x)d x + integral_(5pi/4)^(2pi)(cos x - sin x)d x = 2 + 2sqrt(2) + 2 = 4 + 2sqrt(2)$.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '8', sectionId: '8.7', tags: [],
    points: 5,
    body: `A solid has square cross sections perpendicular to the $x$-axis. The base is the region between $y = sqrt(x)$ and $y = 0$ for $0 <= x <= 4$. Find the volume.`,
    solution: `Side length of each square: $s(x) = sqrt(x)$. Area $= x$. $V = integral_0^4 x d x = [x^2/2]_0^4 = 8$.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '8', sectionId: '8.8', tags: [],
    points: 5,
    body: `A solid has semicircular cross sections perpendicular to the $x$-axis. The diameter of each cross section lies on the region between $y = 0$ and $y = 2sqrt(1-x^2)$ for $-1 <= x <= 1$. Find the volume.`,
    solution: `Diameter $= 2sqrt(1-x^2)$, radius $= sqrt(1-x^2)$. Area of semicircle $= pi/2 (1-x^2)$. $V = integral_(-1)^(1) pi/2(1-x^2)d x = pi/2[x - x^3/3]_(-1)^(1) = pi/2 dot.op 4/3 = 2pi/3$.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '8', sectionId: '8.9', tags: [],
    points: 5,
    body: `Find the volume of the solid obtained by revolving $y = x^2$ on $[0, 2]$ around the $x$-axis using the disk method.`,
    solution: `$V = pi integral_0^2 (x^2)^2 d x = pi integral_0^2 x^4 d x = pi [x^5/5]_0^2 = pi dot.op 32/5 = 32pi/5$.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '8', sectionId: '8.10', tags: [],
    points: 5,
    body: `Find the volume of the solid formed by revolving $y = sqrt(x)$, $y = 0$, $x = 4$ around the line $y = -1$.`,
    solution: `Outer radius: $R(x) = sqrt(x) + 1$; inner radius: $r(x) = 0 + 1 = 1$ (not needed since it's a disk). Actually revolving $y=sqrt(x)$ about $y=-1$: each disk has radius $sqrt(x)-(-1) = sqrt(x)+1$ and a hole of radius $0-(-1)=1$. Washer: $V = pi integral_0^4 [(sqrt(x)+1)^2 - 1^2]d x = pi integral_0^4 (x + 2sqrt(x))d x = pi[x^2/2 + (4/3)x^(3/2)]_0^4 = pi(8 + 32/3) = 56pi/3$.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '8', sectionId: '8.11', tags: [],
    points: 5,
    body: `Find the volume of the solid obtained by revolving the region between $y = sqrt(x)$ and $y = x$ around the $x$-axis using the washer method.`,
    solution: `Curves intersect at $x=0, 1$. For $0<=x<=1$: $sqrt(x) >= x$. Washers: $V = pi integral_0^1 [(sqrt(x))^2 - x^2] d x = pi integral_0^1 (x - x^2) d x = pi[x^2/2 - x^3/3]_0^1 = pi(1/2 - 1/3) = pi/6$.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '8', sectionId: '8.12', tags: [],
    points: 6,
    body: `Find the volume of the solid obtained by revolving the region bounded by $y = x^2$ and $y = 4$ around the line $y = 5$.`,
    solution: `Express in terms of $y$: $x = plus.minus sqrt(y)$. Revolving about $y=5$: outer radius $= 5 - y$, inner radius $= 5 - 4 = 1$ when at $y=4$... Use washers in $x$: limits $x=-2$ to $2$, $y=x^2$ to $4$. $R = 5-x^2$, $r = 5-4 = 1$. $V = pi integral_(-2)^(2)[(5-x^2)^2 - 1^2]d x = 2pi integral_0^2 (24 - 10x^2 + x^4)d x = 2pi[24x - 10x^3/3 + x^5/5]_0^2 = 2pi(48 - 80/3 + 32/5) = 2pi dot.op 472/15 = 944pi/15$.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '8', sectionId: '8.13', tags: [],
    points: 6,
    body: `Find the arc length of $y = (1/3)x^(3/2)$ from $x = 0$ to $x = 4$.`,
    solution: `$(d y)/(d x) = (1/2)x^(1/2)$. Arc length $= integral_0^4 sqrt(1 + x/4) d x$. Let $u = 1 + x/4$, $d u = 1/4 d x$: $4 integral_1^2 sqrt(u) d u = 4 [2u^(3/2)/3]_1^2 = (8/3)(2sqrt(2)-1)$.`,
  },

  // ── Unit 9: Parametric Equations, Polar Coordinates, Vector-Valued Functions
  {
    classId: 'ap-calc-bc', unitId: '9', sectionId: '9.1', tags: [],
    points: 5,
    body: `A curve is defined parametrically by $x(t) = t^2 - 1$, $y(t) = 2t$. \n(a) Find $(d y)/(d x)$ in terms of $t$. \n(b) Find the slope of the tangent line at $t = 2$.`,
    solution: `(a) $(d y)/(d x) = ((d y)/(d t))/((d x)/(d t)) = 2/(2t) = 1/t$. \n(b) At $t=2$: slope $= 1/2$.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '9', sectionId: '9.2', tags: [],
    points: 5,
    body: `For the parametric curve $x(t) = t^2$, $y(t) = t^3$, find $(d^2 y)/(d x^2)$.`,
    solution: `$(d y)/(d x) = 3t^2/(2t) = 3t/2$. $(d^2 y)/(d x^2) = (d/(d t)((d y)/(d x)))/((d x)/(d t)) = (3/2)/(2t) = 3/(4t)$.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '9', sectionId: '9.3', tags: [],
    points: 5,
    body: `Find the length of the parametric curve $x = 3cos t$, $y = 3sin t$ for $0 <= t <= 2pi$.`,
    solution: `$(d x)/(d t) = -3sin t$, $(d y)/(d t) = 3cos t$. $((d x)/(d t))^2 + ((d y)/(d t))^2 = 9sin^2 t + 9cos^2 t = 9$. Arc length $= integral_0^(2pi) 3 d t = 6pi$.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '9', sectionId: '9.4', tags: [],
    points: 5,
    body: `Let $arrow(r)(t) = chevron.l t^2, e^t chevron.r$. \n(a) Find $arrow(r)'(t)$ (the velocity vector). \n(b) Find $arrow(r)''(t)$ (the acceleration vector). \n(c) Find the speed at $t = 0$.`,
    solution: `(a) $arrow(v)(t) = chevron.l 2t, e^t chevron.r$. \n(b) $arrow(a)(t) = chevron.l 2, e^t chevron.r$. \n(c) Speed $= |arrow(v)(0)| = |chevron.l 0, 1 chevron.r| = 1$.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '9', sectionId: '9.5', tags: [],
    points: 5,
    body: `Given $arrow(v)(t) = chevron.l 2t, cos t chevron.r$ and $arrow(r)(0) = chevron.l 1, 0 chevron.r$, find $arrow(r)(t)$.`,
    solution: `Integrate: $arrow(r)(t) = chevron.l t^2 + C_1, sin t + C_2 chevron.r$. Apply IC: $C_1 = 1$, $C_2 = 0$. So $arrow(r)(t) = chevron.l t^2 + 1, sin t chevron.r$.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '9', sectionId: '9.6', tags: [],
    points: 6,
    body: `A particle moves along a curve with position $arrow(r)(t) = chevron.l t^2 - t, t^3 - 3t chevron.r$. \n(a) Find the velocity and speed at $t = 2$. \n(b) Find the total distance traveled on $[0, 2]$ (set up the integral, do not evaluate).`,
    solution: `(a) $arrow(v)(t) = chevron.l 2t-1, 3t^2-3 chevron.r$. At $t=2$: $arrow(v)(2) = chevron.l 3, 9 chevron.r$. Speed $= sqrt(9+81) = sqrt(90) = 3sqrt(10)$. \n(b) Distance $= integral_0^2 sqrt((2t-1)^2 + (3t^2-3)^2) d t$.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '9', sectionId: '9.7', tags: [],
    points: 5,
    body: `Convert $r = 4cos theta$ to rectangular form, and identify the curve. Then find $(d y)/(d x)$ for this polar curve using $(d y)/(d x) = (r' sin theta + r cos theta)/(r' cos theta - r sin theta)$.`,
    solution: `Multiply: $r^2 = 4r cos theta => x^2+y^2 = 4x => (x-2)^2+y^2=4$. This is a circle centered at $(2,0)$ with radius 2. For $(d y)/(d x)$: $r' = -4sin theta$. At $theta=pi/4$: $r=2sqrt(2)$, numerator $= -4sin^2(pi/4)+2sqrt(2)cos(pi/4) = -2+2 = 0$, so tangent is horizontal.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '9', sectionId: '9.8', tags: [],
    points: 5,
    body: `Find the area enclosed by the polar curve $r = 2cos theta$.`,
    solution: `$r = 2cos theta$ is a circle; it traces once for $theta in [-pi/2, pi/2]$. Area $= (1/2)integral_(-pi/2)^(pi/2)(2cos theta)^2 d theta = 2 integral_(-pi/2)^(pi/2) cos^2 theta d theta = 2 dot.op pi/2 = pi$.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '9', sectionId: '9.9', tags: [],
    points: 6,
    body: `Find the area of the region inside $r = 3$ and outside $r = 2 + cos theta$.`,
    solution: `Find intersections: $3 = 2 + cos theta => cos theta = 1 => theta = 0$. Hmm — they intersect only at $theta = 0$ (touching). Reconsider: $r=3$ and $r=2+cos theta$ share no bounded region between them unless we check: at $theta=pi$, $r=2+(-1)=1 < 3$. Region inside $r=3$ and outside $r=2+cos theta$: Area $= (1/2)integral_0^(2pi)[9 - (2+cos theta)^2]d theta = (1/2)integral_0^(2pi)(9 - 4 - 4cos theta - cos^2 theta)d theta = (1/2)integral_0^(2pi)(5 - 4cos theta - cos^2 theta)d theta = (1/2)(10pi - 0 - pi) = 9pi/2$.`,
  },

  // ── Unit 10: Infinite Sequences and Series ────────────────────────────────
  {
    classId: 'ap-calc-bc', unitId: '10', sectionId: '10.1', tags: [],
    points: 5,
    body: `Determine whether each series converges or diverges by analyzing its sequence of partial sums. \n(a) $sum_(n=1)^infinity 1$ \n(b) $sum_(n=1)^infinity (1/2)^n$`,
    solution: `(a) Partial sums $S_N = N -> infinity$. Diverges. \n(b) Partial sums $S_N = 1 - (1/2)^N -> 1$ as $N -> infinity$. Converges to 1.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '10', sectionId: '10.2', tags: [],
    points: 5,
    body: `Find the sum of the geometric series $sum_(n=0)^infinity 3 (2/5)^n$. State the condition for convergence that is satisfied.`,
    solution: `$|r| = 2/5 < 1$, so the series converges. Sum $= a/(1-r) = 3/(1-2/5) = 3/(3/5) = 5$.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '10', sectionId: '10.3', tags: [],
    points: 5,
    body: `Apply the $n$th Term Test to each series. State the conclusion and why. \n(a) $sum_(n=1)^infinity n/(n+1)$ \n(b) $sum_(n=1)^infinity 1/n^2$`,
    solution: `(a) $lim_(n->infinity) n/(n+1) = 1 != 0$. Diverges by $n$th Term Test. \n(b) $lim_(n->infinity) 1/n^2 = 0$. Test is inconclusive (series actually converges by $p$-series with $p=2$).`,
  },
  {
    classId: 'ap-calc-bc', unitId: '10', sectionId: '10.4', tags: [],
    points: 5,
    body: `Use the Integral Test to determine whether $sum_(n=1)^infinity 1/(n^2 + 1)$ converges. Verify that all conditions of the test are met.`,
    solution: `$f(x) = 1/(x^2+1)$ is positive, continuous, and decreasing for $x >= 1$. $integral_1^infinity 1/(x^2+1)d x = [arctan x]_1^infinity = pi/2 - pi/4 = pi/4$, which converges. Therefore the series converges.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '10', sectionId: '10.5', tags: [],
    points: 5,
    body: `Determine convergence or divergence: \n(a) The harmonic series $sum_(n=1)^infinity 1/n$ \n(b) $sum_(n=1)^infinity 1/n^3$ \n(c) $sum_(n=1)^infinity 1/sqrt(n)$ \n\nState the $p$-series rule and apply it.`,
    solution: `$p$-series $sum 1/n^p$ converges iff $p > 1$. \n(a) $p=1$: diverges. \n(b) $p=3 > 1$: converges. \n(c) $p=1/2 < 1$: diverges.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '10', sectionId: '10.6', tags: [],
    points: 5,
    body: `Use a comparison test to determine if $sum_(n=1)^infinity 1/(n^2 + n)$ converges or diverges.`,
    solution: `Note $n^2 + n > n^2$, so $1/(n^2+n) < 1/n^2$. Since $sum 1/n^2$ converges ($p$-series, $p=2$), by the Direct Comparison Test $sum 1/(n^2+n)$ also converges.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '10', sectionId: '10.7', tags: [],
    points: 5,
    body: `Apply the Alternating Series Test to $sum_(n=1)^infinity (-1)^(n+1)/n$. Does it converge? If so, what is the maximum error if we use the first 4 terms as an approximation?`,
    solution: `AST: $b_n = 1/n$ is decreasing and $lim b_n = 0$. Converges. Error $<= b_5 = 1/5$.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '10', sectionId: '10.8', tags: [],
    points: 5,
    body: `Use the Ratio Test to determine convergence of $sum_(n=1)^infinity n!/3^n$.`,
    solution: `$L = lim_(n->infinity) |a_(n+1)/a_n| = lim_(n->infinity) ((n+1)!/3^(n+1)) / (n!/3^n) = lim_(n->infinity) (n+1)/3 = infinity > 1$. Diverges.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '10', sectionId: '10.9', tags: [],
    points: 6,
    body: `Determine whether $sum_(n=1)^infinity (-1)^n/(n^2)$ converges absolutely, conditionally, or diverges.`,
    solution: `$sum |(-1)^n/n^2| = sum 1/n^2$ converges ($p=2$). So the series converges absolutely. (Absolute convergence implies convergence.)`,
  },
  {
    classId: 'ap-calc-bc', unitId: '10', sectionId: '10.10', tags: [],
    points: 5,
    body: `The series $sum_(n=1)^infinity (-1)^(n+1)/n^2$ converges. How many terms are needed to estimate the sum to within $0.01$?`,
    solution: `By the Alternating Series Estimation Theorem, the error $<= b_(n+1) = 1/(n+1)^2$. Set $1/(n+1)^2 < 0.01$: $(n+1)^2 > 100$, $n+1 > 10$, $n > 9$. So at least 10 terms are needed.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '10', sectionId: '10.11', tags: [],
    points: 5,
    body: `Find the 3rd degree Taylor polynomial for $f(x) = cos x$ centered at $x = 0$. Use it to approximate $cos(0.1)$.`,
    solution: `$P_3(x) = 1 - x^2/2! + x^4/4!$... wait, degree 3: $P_3(x) = 1 - x^2/2$ (since odd terms are 0 for cos). $cos(0.1) approx 1 - 0.01/2 = 0.995$. (Actual $approx 0.9950$.)`,
  },
  {
    classId: 'ap-calc-bc', unitId: '10', sectionId: '10.12', tags: [],
    points: 6,
    body: `The 4th degree Maclaurin polynomial for $cos x$ is $P_4(x) = 1 - x^2/2 + x^4/24$. Use the Lagrange Error Bound to estimate the maximum error of $P_4(0.5)$ as an approximation of $cos(0.5)$.`,
    solution: `Error $<= |f^((5))(c)|/(5!) |x|^5$ for some $c in (0, 0.5)$. The 5th derivative of $cos x$ is $-sin x$, so $|f^((5))(c)| <= 1$. Error $<= (0.5)^5/120 = 1/(120 dot.op 32) = 1/3840 approx 0.00026$.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '10', sectionId: '10.13', tags: [],
    points: 6,
    body: `Find the interval of convergence (including endpoint testing) for the power series $sum_(n=0)^infinity (x-2)^n / (n dot.op 3^n)$.`,
    solution: `Ratio Test: $L = |x-2|/3$. Converges when $|x-2| < 3$, i.e. $-1 < x < 5$. \nAt $x=5$: $sum 1/n$ (harmonic, diverges). \nAt $x=-1$: $sum (-1)^n/n$ (alternating harmonic, converges). \nInterval of convergence: $[-1, 5)$.`,
  },
  {
    classId: 'ap-calc-bc', unitId: '10', sectionId: '10.14', tags: [],
    points: 6,
    body: `Find the Maclaurin series for $f(x) = e^x$ and use it to write the Maclaurin series for $g(x) = e^(-x^2)$.`,
    solution: `$e^x = sum_(n=0)^infinity x^n/(n!) = 1 + x + x^2/2! + x^3/3! + ...$, convergent for all $x$. Substitute $-x^2$ for $x$: $e^(-x^2) = sum_(n=0)^infinity (-x^2)^n/(n!) = sum_(n=0)^infinity (-1)^n x^(2n)/(n!) = 1 - x^2 + x^4/2! - x^6/3! + ...$`,
  },
  {
    classId: 'ap-calc-bc', unitId: '10', sectionId: '10.15', tags: [],
    points: 6,
    body: `Starting from the geometric series $1/(1-x) = sum_(n=0)^infinity x^n$ for $|x| < 1$, find a power series representation for $ln(1+x)$ and state its interval of convergence.`,
    solution: `$1/(1+x) = sum_(n=0)^infinity (-x)^n = sum_(n=0)^infinity (-1)^n x^n$. Integrate: $ln(1+x) = sum_(n=0)^infinity (-1)^n x^(n+1)/(n+1) = x - x^2/2 + x^3/3 - ...$. Convergence: $|x| < 1$; at $x=1$: converges (alternating harmonic); at $x=-1$: diverges (harmonic). Interval: $(-1, 1]$.`,
  },
];
