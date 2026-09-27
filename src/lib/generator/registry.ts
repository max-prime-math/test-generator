import type { Question } from '../types.ts';
import { createRng, deriveSeed } from './rng.ts';
import type { Difficulty, GeneratedProblem, Generator, ProblemFormat } from './types.ts';
import { exponentLaws, factorTrinomials, multiplyPolynomials, rationalExponents } from './generators/algebra.ts';
import { lineThroughTwoPoints, slopeFromTwoPoints } from './generators/relations.ts';
import { rightTriangleTrig } from './generators/trigonometry.ts';
import { PC30S_GENERATORS } from './generators/pc30s/index.ts';
import { PC40S_GENERATORS } from './generators/pc40s/index.ts';

export const GENERATORS: Generator[] = [
  rightTriangleTrig,
  rationalExponents,
  exponentLaws,
  multiplyPolynomials,
  factorTrinomials,
  slopeFromTwoPoints,
  lineThroughTwoPoints,
  ...PC30S_GENERATORS,
  ...PC40S_GENERATORS,
];

const byId = new Map(GENERATORS.map((g) => [g.id, g]));
export function findGenerator(id: string): Generator | undefined {
  return byId.get(id);
}

export const GENERATED_TAG = 'generated';
const CHOICE_LETTERS = ['A', 'B', 'C', 'D'] as const;

export interface GeneratedItem {
  generatorId: string;
  difficulty: Difficulty;
  seed: number;
}

export type GeneratedQuestion = Omit<Question, 'id' | 'createdAt'>;

/** Run a generator with a seed. The same generator, difficulty and seed always give the same problem. */
export function generateProblem(item: GeneratedItem): GeneratedProblem {
  const generator = byId.get(item.generatorId);
  if (!generator) throw new Error(`Unknown generator: ${item.generatorId}`);
  return generator.generate(createRng(item.seed), item.difficulty);
}

/** Lay a problem out as a written or multiple-choice bank question, placed under its outcome. */
export function toQuestion(item: GeneratedItem, format: ProblemFormat): GeneratedQuestion {
  const generator = byId.get(item.generatorId)!;
  let problem = generateProblem(item);
  // A few problems (e.g. a difference of squares) have too few plausible wrong
  // answers for four choices; multiple choice then moves to the next variant.
  for (let attempt = 1; format === 'mcq' && generator.mcq !== false && attempt <= 20 && wrongAnswers(problem).length < CHOICE_LETTERS.length - 1; attempt++) {
    problem = generateProblem({ ...item, seed: deriveSeed(item.seed, 'mcq', attempt) });
  }
  const base: GeneratedQuestion = {
    body: problem.body,
    solution: problem.solution,
    points: format === 'mcq' ? 1 : generator.points,
    tags: [GENERATED_TAG, ...(generator.outcomes ?? [generator.outcomeId])],
    classId: generator.classId,
    unitId: generator.unitId,
    sectionId: generator.outcomeId,
    questionType: format === 'mcq' ? 'mcq' : 'frq',
  };
  if (format === 'written' || generator.mcq === false) return { ...base, questionType: 'frq', points: generator.points, solution: `*Answer:* ${problem.answer}\n\n${problem.solution}` };

  const wrong = wrongAnswers(problem).slice(0, CHOICE_LETTERS.length - 1);
  const shuffled = createRng(deriveSeed(item.seed, 'choices')).shuffle([problem.answer, ...wrong]);
  const choices = Object.fromEntries(shuffled.map((choice, i) => [CHOICE_LETTERS[i], choice]));
  return { ...base, choices, answer: CHOICE_LETTERS[shuffled.indexOf(problem.answer)] };
}

function wrongAnswers(problem: GeneratedProblem): string[] {
  return [...new Set(problem.distractors)].filter((d) => d !== problem.answer);
}
