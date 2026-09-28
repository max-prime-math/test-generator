// Variant history of an algorithmic question: the seeds of the variants calculated for it,
// oldest first. A seed recalculates its variant exactly, so only seeds are kept; the
// question itself always holds the variant it currently shows (`algorithmSeed`, or none for
// the imported original).
import type { Question } from './types.ts';

/** Seeds in the question's history, including the one it shows (older questions may lack a history). */
export function variantSeeds(question: Pick<Question, 'algorithmHistory' | 'algorithmSeed'>): number[] {
  const seeds = [...(question.algorithmHistory ?? [])];
  if (question.algorithmSeed !== undefined && !seeds.includes(question.algorithmSeed)) seeds.push(question.algorithmSeed);
  return seeds;
}

/** The history with a newly calculated seed added at the end (a seed already there keeps its place). */
export function withVariant(question: Pick<Question, 'algorithmHistory' | 'algorithmSeed'>, seed: number): number[] {
  const seeds = variantSeeds(question);
  return seeds.includes(seed) ? seeds : [...seeds, seed];
}

/** The history without one seed. The variant being shown can't be removed. */
export function withoutVariant(question: Pick<Question, 'algorithmHistory' | 'algorithmSeed'>, seed: number): number[] | undefined {
  if (seed === question.algorithmSeed) return question.algorithmHistory;
  const seeds = variantSeeds(question).filter((item) => item !== seed);
  return seeds.length ? seeds : undefined;
}

/** The history with only the variant being shown (none when the original is shown). */
export function withoutOldVariants(question: Pick<Question, 'algorithmHistory' | 'algorithmSeed'>): number[] | undefined {
  return question.algorithmSeed === undefined ? undefined : [question.algorithmSeed];
}

/** 1-based position of a seed in the history, for "Variant n". */
export function variantNumber(question: Pick<Question, 'algorithmHistory' | 'algorithmSeed'>, seed: number): number {
  return variantSeeds(question).indexOf(seed) + 1;
}
