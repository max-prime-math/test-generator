import type { Rng } from './rng.ts';

export type Difficulty = 1 | 2 | 3;
export type ProblemFormat = 'written' | 'mcq';

/** One generated problem, before it is laid out as a written or multiple-choice question. Fields are Typst markup. */
export interface GeneratedProblem {
  /** The question stem, including any graph the question shows. */
  body: string;
  /** The correct answer, shown in the answer key and used as the correct MCQ choice. */
  answer: string;
  /** Wrong answers built from common mistakes. Needed for multiple choice; duplicates of the answer are ignored. */
  distractors: string[];
  /** A short worked solution. */
  solution: string;
}

export interface Generator {
  /** Stable id; saved worksheets and tests refer to it. */
  id: string;
  title: string;
  /** Curriculum placement: a class, unit and section (outcome) from `outcomes.ts`. */
  classId: string;
  unitId: string;
  outcomeId: string;
  /** Every outcome the problem assesses, used as tags; defaults to `[outcomeId]`. */
  outcomes?: string[];
  /** The problem type in `catalog.ts` this generator produces. */
  catalogId?: string;
  /** False for open-ended problems (e.g. proofs) that have no sensible wrong answers; they stay written in a multiple-choice set. */
  mcq?: boolean;
  /** What each difficulty level produces, shown in the picker. */
  levels: Record<Difficulty, string>;
  points: number;
  generate(rng: Rng, difficulty: Difficulty): GeneratedProblem;
}
