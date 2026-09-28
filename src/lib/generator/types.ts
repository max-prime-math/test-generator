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

/**
 * A fine-tuning control for one problem type, shown in its settings card (like
 * Kuta's options). The level acts as a preset: `levels` gives the value each level
 * uses, and a stored value of '' means "whatever the level uses".
 */
export interface OptionSpec {
  id: string;
  label: string;
  /**
   * - 'one': a single choice, shown as radio buttons (or a slider with `slider: true`).
   * - 'many': any subset, shown as checkboxes; the value is a comma-separated list.
   * - 'toggle': a checkbox; the value is 'yes' or 'no'.
   */
  kind: 'one' | 'many' | 'toggle';
  choices: Array<{ value: string; label: string }>;
  /** The value each level uses when the teacher has not changed this option. */
  levels: Record<Difficulty, string>;
  /** Show a 'one' option as a slider over its choices, in order (e.g. size of numbers). */
  slider?: boolean;
  help?: string;
}

/** Chosen option values by option id; '' means the level's value. */
export type GenOptions = Record<string, string>;

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
  /** Fine-tuning controls, beyond the level. */
  options?: OptionSpec[];
  /** Generate one problem. `options` holds every declared option, '' where the level decides. */
  generate(rng: Rng, difficulty: Difficulty, options?: GenOptions): GeneratedProblem;
}
