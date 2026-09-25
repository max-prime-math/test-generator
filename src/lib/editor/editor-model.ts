import type { DraftQuestion, Question } from '../types.ts';
import { referencedImageNames } from './image-references.ts';
import { createId } from '../id.ts';
import { formatParts } from '../question-format.ts';

export type EditorFields = Omit<DraftQuestion, 'points'> & { points: number | undefined };
export type EditorDefaults = Pick<EditorFields, 'classId' | 'unitId' | 'sectionId' | 'points' | 'tagInput'>;
export interface EditorDraft {
  id: string;
  sourceId?: string;
  imageReferences?: string[];
  original?: Question;
  fields: EditorFields;
  mcq: boolean;
}
export const emptyDefaults: EditorDefaults = { classId: '', unitId: '', sectionId: '', points: 5, tagInput: '' };
export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
export function editableBody(q: Pick<Question, 'parts' | 'body' | 'narrative' | 'narrativeId'>): string {
  return q.parts ? formatParts(q.parts, !(q.narrative || q.narrativeId)) : q.body;
}
export function newDraft(defaults: EditorDefaults = emptyDefaults): EditorDraft {
  return { id: createId(), fields: { ...defaults, body: '', answer: '', solution: '', questionType: 'frq' }, mcq: false };
}
export function editDraft(q: Question): EditorDraft {
  return {
    id: createId(), sourceId: q.id, imageReferences: referencedImageNames(q), original: clone(q), mcq: Boolean(q.choices && Object.keys(q.choices).length),
    fields: { ...clone(q), body: editableBody(q), answer: q.answer ?? '', solution: q.solution ?? '',
      tagInput: q.tags.join(', '), classId: q.classId ?? '', unitId: q.unitId ?? '', sectionId: q.sectionId ?? '' },
  };
}
export function importDraft(q: DraftQuestion): EditorDraft {
  return { id: createId(), imageReferences: referencedImageNames(q), fields: { ...clone(q), body: editableBody(q) }, mcq: Boolean(q.choices && Object.keys(q.choices).length) };
}
export function duplicateDraft(draft: EditorDraft): EditorDraft {
  const copy = clone(draft);
  copy.id = createId();
  copy.sourceId = undefined;
  // Keep decoded content, graphs and algorithm definitions. A copy has no validation
  // history or generated-variant identity, even when its starting text is identical.
  if (copy.original) {
    copy.original = { ...copy.original, id: copy.id, createdAt: Date.now(), updatedAt: undefined,
      checked: undefined, renderError: undefined, algorithmSeed: undefined,
      algorithmVariant: undefined, algorithmEvaluation: undefined };
  }
  copy.fields.algorithmEvaluation = undefined;
  return copy;
}
export function validateDraft(draft: EditorDraft): string[] {
  const { fields: f, mcq } = draft;
  const errors: string[] = [];
  if (!f.body.trim()) errors.push('Write a question before saving to the bank.');
  if (typeof f.points !== 'number' || !Number.isFinite(f.points) || f.points < 0) errors.push('Enter a point value of zero or more.');
  if (mcq) {
    const choices = Object.entries(f.choices ?? {});
    if (choices.length < 2 || choices.some(([, text]) => !text.trim())) errors.push('Complete at least two choices, or remove empty choices.');
    if (!f.answer || !f.choices?.[f.answer]?.trim()) errors.push('Select the correct choice.');
  }
  return errors;
}
export function questionData(draft: EditorDraft): Omit<Question, 'id' | 'createdAt'> {
  const f = draft.fields;
  const original = draft.original;
  const parts = f.parts && f.body === editableBody({ ...f, body: original?.body ?? f.parts.stem }) ? f.parts : undefined;
  // Explicit fields keep import-only metadata and draft identity out of bank serialization.
  return {
    narrative: f.narrative, narrativeId: f.narrativeId || undefined,
    body: parts ? original?.body ?? f.parts!.stem : f.body.trim(), parts,
    algorithmModel: f.algorithmModel, algorithmEvaluation: f.algorithmEvaluation,
    algorithmSeed: original?.algorithmSeed, algorithmVariant: original?.algorithmVariant,
    graphModel: f.graphModel, graphTypst: f.graphTypst, decodeDiagnostics: f.decodeDiagnostics,
    questionType: draft.mcq ? 'mcq' : (f.questionType?.toLowerCase() === 'mcq' ? 'frq' : f.questionType || 'frq'),
    choices: draft.mcq ? clone(f.choices ?? {}) : undefined,
    answer: draft.mcq ? f.answer.trim() || undefined : undefined,
    solution: f.solution.trim() || undefined, points: f.points!,
    tags: [...new Set(f.tagInput.split(',').map(t => t.trim().toLowerCase()).filter(Boolean))],
    images: f.images, classId: f.classId || undefined, unitId: f.unitId || undefined,
    sectionId: f.sectionId || undefined, checked: undefined, renderError: undefined,
  };
}

export interface EditorBank {
  questions: Question[];
  add(data: Omit<Question, 'id' | 'createdAt'>): Question;
  update(id: string, data: Partial<Omit<Question, 'id' | 'createdAt'>>): void;
}
export function commitDraft(draft: EditorDraft, bank: EditorBank, data = questionData(draft)): string {
  const errors = validateDraft(draft);
  if (errors.length) throw new Error(errors.join('\n'));
  if (!draft.sourceId) return bank.add(data).id;
  const current = bank.questions.find(q => q.id === draft.sourceId);
  if (!current) throw new Error('The original question is no longer in this bank. Duplicate this draft to save a new question.');
  const content = (q: Question) => {
    const { updatedAt, checked, renderError, ...fields } = q;
    return JSON.stringify(fields, (_key, value) => value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) : value);
  };
  if (draft.original && content(current) !== content(draft.original)) {
    throw new Error('The bank question changed after this draft was opened. Duplicate to keep your work, or discard this draft and reopen the current question.');
  }
  bank.update(draft.sourceId, data);
  return draft.sourceId;
}

/** Reordering/removing choices keeps the answer attached to its content. */
export function rearrangeChoices(choices: Record<string, string>, answer: string, order: string[]) {
  return {
    choices: Object.fromEntries(order.map((key, i) => [String.fromCharCode(65 + i), choices[key]])),
    answer: order.includes(answer) ? String.fromCharCode(65 + order.indexOf(answer)) : '',
  };
}
