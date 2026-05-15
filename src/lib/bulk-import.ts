import type { DraftQuestion } from './types';

type RawDraftQuestion = Record<string, unknown>;
type RawPackageQuestion = Record<string, unknown>;

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

function normalizePqpChoices(rawChoices: unknown): Record<string, string> | undefined {
  if (!Array.isArray(rawChoices)) return undefined;

  const entries = rawChoices
    .map((choice) => {
      if (!choice || typeof choice !== 'object' || Array.isArray(choice)) return null;
      const item = choice as Record<string, unknown>;
      const id = asString(item.id).toUpperCase();
      const body = item.body;
      const text = body && typeof body === 'object' && !Array.isArray(body)
        ? asString((body as Record<string, unknown>).text)
        : '';
      return id && text ? [id, text] as const : null;
    })
    .filter((entry): entry is readonly [string, string] => entry !== null);

  if (entries.length < 2) return undefined;
  return Object.fromEntries(entries);
}

function normalizePqpTags(raw: unknown): string {
  if (!Array.isArray(raw)) return '';
  return raw
    .filter((tag): tag is string => typeof tag === 'string')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .join(', ');
}

function normalizePqpImages(question: RawPackageQuestion, packageAssets: Map<string, string>): string[] | undefined {
  const assetIds = Array.isArray(question.assets)
    ? question.assets.filter((assetId): assetId is string => typeof assetId === 'string')
    : [];
  if (assetIds.length === 0) return undefined;

  const filenames = assetIds
    .map((assetId) => packageAssets.get(assetId) ?? assetId)
    .map((filename) => filename.trim())
    .filter(Boolean);

  return filenames.length > 0 ? filenames : undefined;
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

function normalizePqpQuestion(raw: unknown, packageAssets: Map<string, string>): DraftQuestion | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const question = raw as RawPackageQuestion;
  const content = question.content;
  if (!content || typeof content !== 'object' || Array.isArray(content)) return null;

  const stem = (content as Record<string, unknown>).stem;
  const body = stem && typeof stem === 'object' && !Array.isArray(stem)
    ? asString((stem as Record<string, unknown>).text)
    : '';
  if (!body) return null;

  const solutionRaw = (content as Record<string, unknown>).solution;
  const solution = solutionRaw && typeof solutionRaw === 'object' && !Array.isArray(solutionRaw)
    ? asString((solutionRaw as Record<string, unknown>).text)
    : '';

  const answerRaw = question.answer;
  let answer = '';
  if (answerRaw && typeof answerRaw === 'object' && !Array.isArray(answerRaw)) {
    const item = answerRaw as Record<string, unknown>;
    if (asString(item.type) === 'choice') answer = asString(item.value).toUpperCase();
  }

  const scoring = question.scoring;
  const points = scoring && typeof scoring === 'object' && !Array.isArray(scoring)
    ? asNumber((scoring as Record<string, unknown>).points)
    : 0;

  const classification = question.classification && typeof question.classification === 'object' && !Array.isArray(question.classification)
    ? question.classification as Record<string, unknown>
    : null;

  return {
    body,
    questionType: classification ? asString(classification.questionType) || asString(question.kind) || undefined : asString(question.kind) || undefined,
    answer,
    solution,
    choices: normalizePqpChoices((content as Record<string, unknown>).choices),
    points,
    tagInput: classification ? normalizePqpTags(classification.tags) : '',
    classId: classification ? asString(classification.classId) : '',
    unitId: classification ? asString(classification.unitId) : '',
    sectionId: classification ? asString(classification.sectionId) : '',
    images: normalizePqpImages(question, packageAssets),
  };
}

function packageAssetNameMap(rawAssets: unknown): Map<string, string> {
  const map = new Map<string, string>();
  if (!Array.isArray(rawAssets)) return map;
  for (const asset of rawAssets) {
    if (!asset || typeof asset !== 'object' || Array.isArray(asset)) continue;
    const item = asset as Record<string, unknown>;
    const id = asString(item.id);
    if (!id) continue;
    const filename = asString(item.filename);
    const storage = item.storage && typeof item.storage === 'object' && !Array.isArray(item.storage)
      ? item.storage as Record<string, unknown>
      : null;
    const path = storage ? asString(storage.path) : '';
    map.set(id, filename || path || id);
  }
  return map;
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

  const packageAssets = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? packageAssetNameMap((parsed as { assets?: unknown }).assets)
    : new Map<string, string>();

  const isPqp = Boolean(
    parsed &&
    typeof parsed === 'object' &&
    !Array.isArray(parsed) &&
    (parsed as { format?: unknown }).format === 'portable-question-package' &&
    Array.isArray((parsed as { questions?: unknown }).questions),
  );

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
    .map((item) => isPqp ? normalizePqpQuestion(item, packageAssets) : normalizeDraftQuestion(item))
    .filter((q): q is DraftQuestion => q !== null);

  if (questions.length === 0) {
    return {
      questions: [],
      error: 'JSON import did not contain any valid draft questions.',
    };
  }

  return { questions, error: null };
}
