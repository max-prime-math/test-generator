import type { GradebookFilterRules, TestType } from './types.ts';

export const DEFAULT_GRADEBOOK_FILTER: GradebookFilterRules = { studentQuery: '', category: 'all', workState: 'all', belowPercent: null };
export function normalizeGradebookFilter(value: unknown): GradebookFilterRules {
  const input = value && typeof value === 'object' ? value as Partial<GradebookFilterRules> : {};
  const categories: TestType[] = ['quiz', 'test', 'assignment', 'exam', 'formative', 'worksheet', 'other'];
  return {
    studentQuery: typeof input.studentQuery === 'string' ? input.studentQuery : '',
    category: categories.includes(input.category as TestType) ? input.category! : 'all',
    workState: ['missing', 'incomplete', 'ungraded'].includes(input.workState ?? '') ? input.workState! : 'all',
    belowPercent: typeof input.belowPercent === 'number' && Number.isFinite(input.belowPercent) ? Math.max(0, Math.min(100, input.belowPercent)) : null,
  };
}

/** A visible explanation of a custom view and of competing versions during sync review. */
export function describeGradebookFilter(value: unknown): string {
  const rules = normalizeGradebookFilter(value);
  const parts: string[] = [];
  if (rules.studentQuery.trim()) parts.push(`student “${rules.studentQuery.trim()}”`);
  if (rules.category !== 'all') parts.push(`${rules.category} assessments`);
  if (rules.workState !== 'all') parts.push(`has ${rules.workState} work`);
  if (rules.belowPercent !== null) parts.push(`course grade below ${rules.belowPercent}%`);
  return parts.length ? parts.join(' · ') : 'All students and assessments';
}
