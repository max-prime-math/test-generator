import type { ChoiceOverride, Question, TestConfig } from './types';

export const MCQ_CHOICE_LABELS = ['A', 'B', 'C', 'D', 'E'] as const;

export type McqChoiceLabel = typeof MCQ_CHOICE_LABELS[number];

function isChoiceLabel(value: string): value is McqChoiceLabel {
  return (MCQ_CHOICE_LABELS as readonly string[]).includes(value);
}

/** Parse choices out of old-format bodies where the choice grid is embedded as Typst markup. */
export function extractChoicesFromBody(body: string): Record<string, string> | null {
  const gridIdx = body.lastIndexOf('\n\n#grid(');
  if (gridIdx === -1) return null;
  const gridPart = body.slice(gridIdx);
  const choices: Record<string, string> = {};
  for (const match of gridPart.matchAll(/\[\*\(([A-E])\)\*\s*(.*?)\]/g)) {
    choices[match[1]] = match[2].trim();
  }
  return Object.keys(choices).length >= 2 ? choices : null;
}

export function choiceOverrideForQuestion(q: Question, config?: Pick<TestConfig, 'choiceOverrides'>): ChoiceOverride | undefined {
  return config?.choiceOverrides?.[q.id];
}

export function choicesForQuestion(q: Question, config?: Pick<TestConfig, 'choiceOverrides'>): Record<string, string> | null {
  const override = choiceOverrideForQuestion(q, config);
  if (override?.choices && Object.keys(override.choices).length >= 2) return override.choices;
  if (q.choices && Object.keys(q.choices).length >= 2) return q.choices;
  return extractChoicesFromBody(q.body);
}

/**
 * The correct answer letter for a question, respecting choice scrambling.
 * Falls back to legacy behaviour where q.solution held a bare letter.
 */
export function effectiveAnswer(q: Question, config?: Pick<TestConfig, 'choiceOverrides'>): string {
  const override = choiceOverrideForQuestion(q, config);
  if (override?.solution) return override.solution.trim().toUpperCase();
  if (q.answer) return q.answer.trim().toUpperCase();
  if (q.solution && /^[A-Ea-e]$/.test(q.solution.trim())) return q.solution.trim().toUpperCase();
  return '';
}

export function isMCQ(q: Question, config?: Pick<TestConfig, 'choiceOverrides'>): boolean {
  return choicesForQuestion(q, config) !== null || isChoiceLabel(effectiveAnswer(q, config));
}

/**
 * Stable-sort: MCQs first, then FRQs, preserving relative order within each group.
 * Only applied when config.mcqFirst is true.
 */
export function sortQuestions(qs: Question[], config: Pick<TestConfig, 'mcqFirst' | 'choiceOverrides'>): Question[] {
  if (!config.mcqFirst) return qs;
  const mcq = qs.filter((q) => isMCQ(q, config));
  const frq = qs.filter((q) => !isMCQ(q, config));
  return [...mcq, ...frq];
}

export function mcqChoiceLabelsForQuestion(q: Question, config?: Pick<TestConfig, 'choiceOverrides'>): McqChoiceLabel[] {
  const choices = choicesForQuestion(q, config);
  const labels = choices
    ? Object.keys(choices).filter(isChoiceLabel)
    : [...MCQ_CHOICE_LABELS];
  return labels.length >= 2 ? labels : [...MCQ_CHOICE_LABELS];
}
