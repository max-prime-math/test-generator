import type { TestType } from './types.ts';

export const GRADEBOOK_CATEGORIES: TestType[] = ['quiz', 'test', 'assignment', 'exam', 'formative', 'worksheet', 'other'];
export type DroppedScorePolicy = Partial<Record<TestType, number>>;

/** Invalid backup fields never enable dropping; absent/zero categories mean keep every score. */
export function normalizeDroppedScorePolicy(raw: unknown): DroppedScorePolicy {
  const result: DroppedScorePolicy = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return result;
  for (const category of GRADEBOOK_CATEGORIES) {
    const count = (raw as Record<string, unknown>)[category];
    if (typeof count === 'number' && Number.isSafeInteger(count) && count > 0) result[category] = count;
  }
  return result;
}

export function describeDroppedScorePolicy(raw: unknown): string {
  const policy = normalizeDroppedScorePolicy(raw);
  const rules = GRADEBOOK_CATEGORIES.filter(category => policy[category]).map(category => `${category[0].toUpperCase() + category.slice(1)}: ${policy[category]}`);
  return rules.length ? `Drop lowest percentages — ${rules.join('; ')}` : 'No dropped scores';
}
