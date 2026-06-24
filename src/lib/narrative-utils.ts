import type { Narrative, Question } from './types';

export interface ResolvedQuestionNarrative {
  id?: string;
  title?: string;
  body: string;
  shared: boolean;
}

export function resolveQuestionNarrative(
  question: Pick<Question, 'narrative' | 'narrativeId'>,
  narrativeList: Narrative[] = [],
): ResolvedQuestionNarrative | null {
  const narrativeId = question.narrativeId?.trim();
  if (narrativeId) {
    const shared = narrativeList.find((narrative) => narrative.id === narrativeId);
    const body = shared?.body.trim() || question.narrative?.trim() || '';
    if (!body) return null;
    return {
      id: narrativeId,
      title: shared?.title,
      body,
      shared: true,
    };
  }

  const body = question.narrative?.trim();
  return body ? { body, shared: false } : null;
}

export function narrativeLabel(
  question: Pick<Question, 'narrative' | 'narrativeId'>,
  narrativeList: Narrative[] = [],
): string {
  const resolved = resolveQuestionNarrative(question, narrativeList);
  if (!resolved) return '';
  return resolved.title || (resolved.shared ? 'Shared instructions' : 'Narrative');
}
