import type { Question, TestConfig, TestNarrative } from './types.ts';

export type TestContentItem =
  | { kind: 'question'; id: string; question: Question }
  | { kind: 'narrative'; id: string; narrative: TestNarrative };

/** Narratives follow their question when MCQs or questions are reordered. */
export function testContentItems(questions: Question[], config: Pick<TestConfig, 'customNarratives'>): TestContentItem[] {
  const narratives = config.customNarratives ?? [];
  const ids = new Set(questions.map(q => q.id));
  const items: TestContentItem[] = [];
  const append = (after: string | null) => {
    for (const narrative of narratives) {
      if (narrative.afterQuestionId === after) items.push({ kind: 'narrative', id: narrative.id, narrative });
    }
  };
  append(null);
  for (const question of questions) {
    items.push({ kind: 'question', id: question.id, question });
    append(question.id);
  }
  // Keep text visible if its preceding question is removed by another session.
  for (const narrative of narratives) {
    if (narrative.afterQuestionId !== null && !ids.has(narrative.afterQuestionId)) {
      items.push({ kind: 'narrative', id: narrative.id, narrative });
    }
  }
  return items;
}

/** A narrative interrupts a shared, lettered group. */
export function narrativeBreaks(config: Pick<TestConfig, 'customNarratives'>): Set<string> {
  return new Set((config.customNarratives ?? []).flatMap(n => n.afterQuestionId === null ? [] : [n.afterQuestionId]));
}
