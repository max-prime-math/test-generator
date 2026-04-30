import type { Class } from './types';
import { appState } from './app-state.svelte';

export const AP_CALC_BC: Class = {
  id: 'ap-calc-bc',
  name: 'AP Calculus BC',
  units: [
    {
      id: '1', name: 'Limits and Continuity',
      sections: [
        { id: '1.1',  name: 'Introducing Calculus: Can Change Occur at an Instant?' },
        { id: '1.2',  name: 'Defining Limits and Using Limit Notation' },
        { id: '1.3',  name: 'Estimating Limit Values from Graphs' },
        { id: '1.4',  name: 'Estimating Limit Values from Tables' },
        { id: '1.5',  name: 'Determining Limits Using Algebraic Properties' },
        { id: '1.6',  name: 'Determining Limits Using Algebraic Manipulation' },
        { id: '1.7',  name: 'Selecting Procedures for Determining Limits' },
        { id: '1.8',  name: 'Determining Limits Using the Squeeze Theorem' },
        { id: '1.9',  name: 'Connecting Multiple Representations of Limits' },
        { id: '1.10', name: 'Exploring Types of Discontinuities' },
        { id: '1.11', name: 'Defining Continuity at a Point' },
        { id: '1.12', name: 'Confirming Continuity over an Interval' },
        { id: '1.13', name: 'Removing Discontinuities' },
        { id: '1.14', name: 'Connecting Infinite Limits and Vertical Asymptotes' },
        { id: '1.15', name: 'Connecting Limits at Infinity and Horizontal Asymptotes' },
        { id: '1.16', name: 'Working with the Intermediate Value Theorem' },
      ],
    },
    {
      id: '2', name: 'Differentiation: Definition and Fundamental Properties',
      sections: [
        { id: '2.1',  name: 'Defining Average and Instantaneous Rates of Change at a Point' },
        { id: '2.2',  name: 'Defining the Derivative of a Function and Using Derivative Notation' },
        { id: '2.3',  name: 'Estimating Derivatives of a Function at a Point' },
        { id: '2.4',  name: 'Connecting Differentiability and Continuity' },
        { id: '2.5',  name: 'Applying the Power Rule' },
        { id: '2.6',  name: 'Derivative Rules: Constant, Sum, Difference, and Constant Multiple' },
        { id: '2.7',  name: 'Derivatives of cos(x), sin(x), eˣ, and ln(x)' },
        { id: '2.8',  name: 'The Product Rule' },
        { id: '2.9',  name: 'The Quotient Rule' },
        { id: '2.10', name: 'Derivatives of Tangent, Cotangent, Secant, and Cosecant' },
      ],
    },
    {
      id: '3', name: 'Differentiation: Composite, Implicit, and Inverse Functions',
      sections: [
        { id: '3.1', name: 'The Chain Rule' },
        { id: '3.2', name: 'Implicit Differentiation' },
        { id: '3.3', name: 'Differentiating Inverse Functions' },
        { id: '3.4', name: 'Differentiating Inverse Trigonometric Functions' },
        { id: '3.5', name: 'Selecting Procedures for Calculating Derivatives' },
        { id: '3.6', name: 'Calculating Higher-Order Derivatives' },
      ],
    },
    {
      id: '4', name: 'Contextual Applications of Differentiation',
      sections: [
        { id: '4.1', name: 'Interpreting the Meaning of the Derivative in Context' },
        { id: '4.2', name: 'Straight-Line Motion: Connecting Position, Velocity, and Acceleration' },
        { id: '4.3', name: 'Rates of Change in Applied Contexts Other Than Motion' },
        { id: '4.4', name: 'Introduction to Related Rates' },
        { id: '4.5', name: 'Solving Related Rates Problems' },
        { id: '4.6', name: 'Approximating Values Using Local Linearity and Linearization' },
        { id: '4.7', name: "Using L'Hôpital's Rule" },
      ],
    },
    {
      id: '5', name: 'Analytical Applications of Differentiation',
      sections: [
        { id: '5.1',  name: 'Using the Mean Value Theorem' },
        { id: '5.2',  name: 'Extreme Value Theorem, Global vs Local Extrema, and Critical Points' },
        { id: '5.3',  name: 'Determining Intervals on Which a Function Is Increasing or Decreasing' },
        { id: '5.4',  name: 'Using the First Derivative Test' },
        { id: '5.5',  name: 'Using the Candidates Test for Absolute Extrema' },
        { id: '5.6',  name: 'Determining Concavity of Functions' },
        { id: '5.7',  name: 'Using the Second Derivative Test' },
        { id: '5.8',  name: 'Sketching Graphs of Functions and Their Derivatives' },
        { id: '5.9',  name: 'Connecting a Function, Its First Derivative, and Its Second Derivative' },
        { id: '5.10', name: 'Introduction to Optimization Problems' },
        { id: '5.11', name: 'Solving Optimization Problems' },
        { id: '5.12', name: 'Exploring Behaviors of Implicit Relations' },
      ],
    },
    {
      id: '6', name: 'Integration and Accumulation of Change',
      sections: [
        { id: '6.1',  name: 'Exploring Accumulations of Change' },
        { id: '6.2',  name: 'Approximating Areas with Riemann Sums' },
        { id: '6.3',  name: 'Riemann Sums, Summation Notation, and Definite Integral Notation' },
        { id: '6.4',  name: 'The Fundamental Theorem of Calculus and Accumulation Functions' },
        { id: '6.5',  name: 'Interpreting the Behavior of Accumulation Functions Involving Area' },
        { id: '6.6',  name: 'Applying Properties of Definite Integrals' },
        { id: '6.7',  name: 'The Fundamental Theorem of Calculus and Definite Integrals' },
        { id: '6.8',  name: 'Finding Antiderivatives and Indefinite Integrals: Basic Rules' },
        { id: '6.9',  name: 'Integrating Using Substitution' },
        { id: '6.10', name: 'Integrating Using Long Division and Completing the Square' },
        { id: '6.11', name: 'Integrating Using Integration by Parts (BC)' },
        { id: '6.12', name: 'Using Linear Partial Fractions (BC)' },
        { id: '6.13', name: 'Evaluating Improper Integrals (BC)' },
        { id: '6.14', name: 'Selecting Techniques for Antidifferentiation' },
      ],
    },
    {
      id: '7', name: 'Differential Equations',
      sections: [
        { id: '7.1', name: 'Modeling Situations with Differential Equations' },
        { id: '7.2', name: 'Verifying Solutions for Differential Equations' },
        { id: '7.3', name: 'Sketching Slope Fields' },
        { id: '7.4', name: 'Reasoning Using Slope Fields' },
        { id: '7.5', name: "Approximating Solutions Using Euler's Method (BC)" },
        { id: '7.6', name: 'Finding General Solutions Using Separation of Variables' },
        { id: '7.7', name: 'Finding Particular Solutions Using Initial Conditions' },
        { id: '7.8', name: 'Exponential Models with Differential Equations' },
        { id: '7.9', name: 'Logistic Models with Differential Equations (BC)' },
      ],
    },
    {
      id: '8', name: 'Applications of Integration',
      sections: [
        { id: '8.1',  name: 'Finding the Average Value of a Function on an Interval' },
        { id: '8.2',  name: 'Connecting Position, Velocity, and Acceleration Using Integrals' },
        { id: '8.3',  name: 'Using Accumulation Functions and Definite Integrals in Applied Contexts' },
        { id: '8.4',  name: 'Finding the Area Between Curves Expressed as Functions of x' },
        { id: '8.5',  name: 'Finding the Area Between Curves Expressed as Functions of y' },
        { id: '8.6',  name: 'Finding the Area Between Curves That Intersect at More Than Two Points' },
        { id: '8.7',  name: 'Volumes with Cross Sections: Squares and Rectangles' },
        { id: '8.8',  name: 'Volumes with Cross Sections: Triangles and Semicircles' },
        { id: '8.9',  name: 'Volume with Disc Method: Revolving Around the x- or y-Axis' },
        { id: '8.10', name: 'Volume with Disc Method: Revolving Around Other Axes' },
        { id: '8.11', name: 'Volume with Washer Method: Revolving Around the x- or y-Axis' },
        { id: '8.12', name: 'Volume with Washer Method: Revolving Around Other Axes' },
        { id: '8.13', name: 'Arc Length of a Smooth Planar Curve and Distance Traveled (BC)' },
      ],
    },
    {
      id: '9', name: 'Parametric Equations, Polar Coordinates, and Vector-Valued Functions',
      sections: [
        { id: '9.1', name: 'Defining and Differentiating Parametric Equations' },
        { id: '9.2', name: 'Second Derivatives of Parametric Equations' },
        { id: '9.3', name: 'Finding Arc Lengths of Curves Given by Parametric Equations' },
        { id: '9.4', name: 'Defining and Differentiating Vector-Valued Functions' },
        { id: '9.5', name: 'Integrating Vector-Valued Functions' },
        { id: '9.6', name: 'Solving Motion Problems Using Parametric and Vector-Valued Functions' },
        { id: '9.7', name: 'Defining Polar Coordinates and Differentiating in Polar Form' },
        { id: '9.8', name: 'Finding the Area of a Polar Region' },
        { id: '9.9', name: 'Finding the Area of the Region Bounded by Two Polar Curves' },
      ],
    },
    {
      id: '10', name: 'Infinite Sequences and Series',
      sections: [
        { id: '10.1',  name: 'Defining Convergent and Divergent Infinite Series' },
        { id: '10.2',  name: 'Working with Geometric Series' },
        { id: '10.3',  name: 'The nth Term Test for Divergence' },
        { id: '10.4',  name: 'Integral Test for Convergence' },
        { id: '10.5',  name: 'Harmonic Series and p-Series' },
        { id: '10.6',  name: 'Comparison Tests for Convergence' },
        { id: '10.7',  name: 'Alternating Series Test for Convergence' },
        { id: '10.8',  name: 'Ratio Test for Convergence' },
        { id: '10.9',  name: 'Determining Absolute or Conditional Convergence' },
        { id: '10.10', name: 'Alternating Series Error Bound' },
        { id: '10.11', name: 'Finding Taylor Polynomial Approximations of Functions' },
        { id: '10.12', name: 'Lagrange Error Bound' },
        { id: '10.13', name: 'Radius and Interval of Convergence of Power Series' },
        { id: '10.14', name: 'Finding Taylor or Maclaurin Series for a Function' },
        { id: '10.15', name: 'Representing Functions as Power Series' },
      ],
    },
  ],
};

export const CLASSES: Class[] = [];
export const DEMO_CLASSES: Class[] = [AP_CALC_BC];
export const DEMO_CLASS_IDS = new Set(DEMO_CLASSES.map((c) => c.id));

export function visibleClasses(): Class[] {
  return appState.demoMode ? [...CLASSES, ...DEMO_CLASSES] : CLASSES;
}

// ── Lookup helpers ──────────────────────────────────────────────────────────

export function findClass(classId: string) {
  return visibleClasses().find((c) => c.id === classId);
}

export function findUnit(classId: string, unitId: string) {
  return findClass(classId)?.units.find((u) => u.id === unitId);
}

export function findSection(classId: string, unitId: string, sectionId: string) {
  return findUnit(classId, unitId)?.sections.find((s) => s.id === sectionId);
}
