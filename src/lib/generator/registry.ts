import type { Question } from '../types.ts';
import { createRng, deriveSeed } from './rng.ts';
import type { Difficulty, GeneratedProblem, GenOptions, Generator, ProblemFormat } from './types.ts';
import { exponentLaws, factorTrinomials, multiplyPolynomials, rationalExponents } from './generators/algebra.ts';
import { lineThroughTwoPoints, slopeFromTwoPoints } from './generators/relations.ts';
import { rightTriangleTrig } from './generators/trigonometry.ts';
import { GRADE9_GENERATORS } from './generators/grade9/index.ts';
import { GRADE10_GENERATORS } from './generators/grade10/index.ts';
import { PC30S_GENERATORS } from './generators/pc30s/index.ts';
import { PC40S_GENERATORS } from './generators/pc40s/index.ts';

export const GENERATORS: Generator[] = [
  ...GRADE9_GENERATORS,
  rightTriangleTrig,
  rationalExponents,
  exponentLaws,
  multiplyPolynomials,
  factorTrinomials,
  slopeFromTwoPoints,
  lineThroughTwoPoints,
  ...GRADE10_GENERATORS,
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
  /** Fine-tuning choices; missing or '' values follow the level. */
  options?: GenOptions;
}

export type GeneratedQuestion = Omit<Question, 'id' | 'createdAt'>;

/**
 * Every declared option of a generator with its effective value: an explicit valid
 * choice, or else the value the level uses. Generators always receive complete options.
 */
export function resolveOptions(generator: Generator, given: GenOptions = {}, difficulty: Difficulty = 1): GenOptions {
  const out: GenOptions = {};
  for (const spec of generator.options ?? []) {
    const allowed = new Set(spec.kind === 'toggle' ? ['yes', 'no'] : spec.choices.map((c) => c.value));
    const raw = given[spec.id] ?? '';
    const valid = spec.kind === 'many'
      ? raw.split(',').filter((v) => allowed.has(v)).join(',')
      : allowed.has(raw) ? raw : '';
    out[spec.id] = valid || spec.levels[difficulty];
  }
  return out;
}

/** The options that differ from the level's values, e.g. "Size of numbers: ±20 · Numbers are: Fractions". */
export function describeOptions(generator: Generator, given: GenOptions = {}, difficulty: Difficulty = 1): string {
  const chosen = resolveOptions(generator, given, difficulty);
  return (generator.options ?? []).filter((o) => chosen[o.id] !== o.levels[difficulty]).map((o) => {
    if (o.kind === 'toggle') return `${chosen[o.id] === 'yes' ? '' : 'No '}${o.label.toLowerCase()}`.replace(/^./, (c) => c.toUpperCase());
    const labels = chosen[o.id].split(',').filter(Boolean).map((v) => o.choices.find((c) => c.value === v)?.label ?? v);
    return `${o.label}: ${labels.join(', ')}`;
  }).join(' · ');
}

/** Run a generator with a seed. The same generator, difficulty and seed always give the same problem. */
export function generateProblem(item: GeneratedItem): GeneratedProblem {
  const generator = byId.get(item.generatorId);
  if (!generator) throw new Error(`Unknown generator: ${item.generatorId}`);
  return generator.generate(createRng(item.seed), item.difficulty, resolveOptions(generator, item.options, item.difficulty));
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
