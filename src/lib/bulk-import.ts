import type { DraftQuestion } from './types';

type RawDraftQuestion = Record<string, unknown>;

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function normalizeTags(raw: RawDraftQuestion): string {
  const tagInput = asString(raw.tagInput);
  if (tagInput) return tagInput;

  const tags = raw.tags;
  if (!Array.isArray(tags)) return '';

  return tags
    .filter((tag): tag is string => typeof tag === 'string')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .join(', ');
}

function normalizeChoices(rawChoices: unknown): Record<string, string> | undefined {
  if (!rawChoices || typeof rawChoices !== 'object' || Array.isArray(rawChoices)) return undefined;

  const entries = Object.entries(rawChoices)
    .map(([letter, value]) => [letter, asString(value)] as const)
    .filter(([, text]) => text);

  if (entries.length < 2) return undefined;

  return Object.fromEntries(entries);
}

function normalizeDraftQuestion(raw: unknown): DraftQuestion | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const item = raw as RawDraftQuestion;
  const body = asString(item.body);
  if (!body) return null;

  const images = Array.isArray(item.images)
    ? item.images.filter((img): img is string => typeof img === 'string').map((img) => img.trim()).filter(Boolean)
    : [];

  const draft: DraftQuestion = {
    body,
    questionType: asString(item.questionType) || undefined,
    answer: asString(item.answer),
    solution: asString(item.solution),
    choices: normalizeChoices(item.choices),
    points: asNumber(item.points),
    tagInput: normalizeTags(item),
    classId: asString(item.classId),
    unitId: asString(item.unitId),
    sectionId: asString(item.sectionId),
    unitName: asString(item.unitName) || undefined,
    sectionName: asString(item.sectionName) || undefined,
    images: images.length > 0 ? images : undefined,
  };

  return draft;
}

export interface ParsedBulkImportJson {
  questions: DraftQuestion[];
  error: string | null;
}

/**
 * Parse bulk-import JSON exported by the OCR pipeline or a plain DraftQuestion array.
 * Returns `null` when the input does not look like a supported JSON import file.
 */
export function parseBulkImportJson(rawText: string): ParsedBulkImportJson | null {
  const trimmed = rawText.trim();
  if (!trimmed) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }

  const items = Array.isArray(parsed)
    ? parsed
    : (parsed && typeof parsed === 'object' && Array.isArray((parsed as { questions?: unknown }).questions)
      ? (parsed as { questions: unknown[] }).questions
      : null);

  if (!items) {
    return {
      questions: [],
      error: 'Unsupported JSON format. Expected a DraftQuestion array or an object with a questions array.',
    };
  }

  const questions = items
    .map((item) => normalizeDraftQuestion(item))
    .filter((q): q is DraftQuestion => q !== null);

  if (questions.length === 0) {
    return {
      questions: [],
      error: 'JSON import did not contain any valid draft questions.',
    };
  }

  return { questions, error: null };
}
