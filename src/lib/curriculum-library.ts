import type { AchievementIndicator, Class, CurriculumIndicatorRef, Section } from './types.ts';
import { mergeWorkspaceClasses } from './workspace-format.ts';

export const CURRICULUM_CATALOG_SCHEMA = 1;
export const CURRICULUM_LANGUAGE_SCHEMA = 3;

export interface CurriculumCatalogFile {
  schemaVersion: 1;
  updatedAt: number;
  courses: Class[];
}

export interface CurriculumLanguageEntry {
  nickname?: string;
  nicknameUpdatedAt?: number;
  nextStep?: string;
  nextStepUpdatedAt?: number;
  nextStepIndicator?: CurriculumIndicatorRef;
  nextStepIndicatorUpdatedAt?: number;
  updatedAt: number;
}

export interface CurriculumLanguageFile {
  schemaVersion: 3;
  updatedAt: number;
  outcomes: Record<string, CurriculumLanguageEntry>;
}

/** Stable identity for report language. JSON encoding avoids delimiter collisions in custom ids. */
export function curriculumOutcomeKey(classId: string, unitId: string, sectionId: string, indicatorId: string | null): string {
  return JSON.stringify([classId, unitId, sectionId, indicatorId]);
}

export function curriculumDefinitions(classes: Class[]): Class[] {
  return classes.map(cls => ({
    ...cls,
    units: cls.units.map(unit => ({
      ...unit,
      sections: unit.sections.map(section => ({
        ...withoutCommentLanguage(section),
        ...(section.indicators?.length
          ? { indicators: section.indicators.map(indicator => withoutCommentLanguage(indicator)) }
          : {}),
      })),
    })),
  }));
}

function withoutCommentLanguage<T extends Section | AchievementIndicator>(value: T): T {
  const copy = { ...value };
  delete copy.nickname;
  delete copy.nextStep;
  delete copy.nextStepIndicator;
  return copy;
}

/** Harvest legacy bank metadata. Existing shared entries win unless `replace` is requested. */
export function languageFromClasses(classes: Class[], now = Date.now()): CurriculumLanguageFile {
  const outcomes: Record<string, CurriculumLanguageEntry> = {};
  for (const cls of classes) for (const unit of cls.units) for (const section of unit.sections) {
    const sectionEntry = commentEntry(section, now);
    if (sectionEntry) outcomes[curriculumOutcomeKey(cls.id, unit.id, section.id, null)] = sectionEntry;
    for (const indicator of section.indicators ?? []) {
      const indicatorEntry = commentEntry(indicator, now);
      if (indicatorEntry) outcomes[curriculumOutcomeKey(cls.id, unit.id, section.id, indicator.id)] = indicatorEntry;
    }
  }
  return { schemaVersion: CURRICULUM_LANGUAGE_SCHEMA, updatedAt: now, outcomes };
}

/**
 * Equivalent copies of an official outcome can appear under several local course/unit ids.
 * Report language is shared across those copies, while question evidence still resolves by
 * its exact class, unit, section, and indicator placement.
 */
export function equivalentCurriculumOutcomeKeys(
  classes: Class[], shown: Class, unitId: string, sectionId: string, indicatorId: string | null,
): string[] {
  const sourceSection = shown.units.find(unit => unit.id === unitId)?.sections.find(section => section.id === sectionId);
  if (!sourceSection) return [curriculumOutcomeKey(shown.id, unitId, sectionId, indicatorId)];
  const sourceIndicator = indicatorId === null ? null : sourceSection.indicators?.find(indicator => indicator.id === indicatorId);
  if (indicatorId !== null && !sourceIndicator) return [curriculumOutcomeKey(shown.id, unitId, sectionId, indicatorId)];
  const keys: string[] = [];
  for (const cls of classes) for (const unit of cls.units) for (const section of unit.sections) {
    if (section.id !== sourceSection.id || section.name.trim() !== sourceSection.name.trim()) continue;
    if (indicatorId === null) keys.push(curriculumOutcomeKey(cls.id, unit.id, section.id, null));
    else for (const indicator of section.indicators ?? []) {
      if (indicator.id === sourceIndicator!.id && indicator.text.trim() === sourceIndicator!.text.trim()) {
        keys.push(curriculumOutcomeKey(cls.id, unit.id, section.id, indicator.id));
      }
    }
  }
  return [...new Set(keys.length ? keys : [curriculumOutcomeKey(shown.id, unitId, sectionId, indicatorId)])];
}

type LanguageField = 'nickname' | 'nextStep' | 'nextStepIndicator';
const fieldClock = (field: LanguageField): 'nicknameUpdatedAt' | 'nextStepUpdatedAt' | 'nextStepIndicatorUpdatedAt' => `${field}UpdatedAt`;
function normalizedLanguageEntry(entry: CurriculumLanguageEntry): CurriculumLanguageEntry {
  return {
    ...entry,
    nicknameUpdatedAt: finiteTimestamp(entry.nicknameUpdatedAt ?? entry.updatedAt),
    nextStepUpdatedAt: finiteTimestamp(entry.nextStepUpdatedAt ?? entry.updatedAt),
    nextStepIndicatorUpdatedAt: finiteTimestamp(entry.nextStepIndicatorUpdatedAt ?? entry.updatedAt),
  };
}

function mergeLanguageEntry(a: CurriculumLanguageEntry, b: CurriculumLanguageEntry): CurriculumLanguageEntry {
  const entry: CurriculumLanguageEntry = { updatedAt: Math.max(a.updatedAt, b.updatedAt) };
  for (const field of ['nickname', 'nextStep', 'nextStepIndicator'] as const) {
    const clock = fieldClock(field);
    const aTime = finiteTimestamp(a[clock] ?? a.updatedAt);
    const bTime = finiteTimestamp(b[clock] ?? b.updatedAt);
    const chosen = bTime >= aTime ? b : a;
    const value = chosen[field];
    if (value !== undefined) (entry as unknown as Record<string, unknown>)[field] = typeof value === 'object' ? { ...value } : value;
    entry[clock] = Math.max(aTime, bTime);
  }
  return entry;
}

function commentEntry(value: { nickname?: string; nextStep?: string; nextStepIndicator?: CurriculumIndicatorRef }, updatedAt: number): CurriculumLanguageEntry | null {
  const nickname = value.nickname?.trim();
  const nextStep = value.nextStep?.trim();
  const nextStepIndicator = curriculumIndicatorRef(value.nextStepIndicator);
  return nickname || nextStep || nextStepIndicator
    ? { ...(nickname ? { nickname } : {}), ...(nextStep ? { nextStep } : {}), ...(nextStepIndicator ? { nextStepIndicator } : {}),
        nicknameUpdatedAt: updatedAt, nextStepUpdatedAt: updatedAt, nextStepIndicatorUpdatedAt: updatedAt, updatedAt }
    : null;
}

export function applyCurriculumLanguage(classes: Class[], language: CurriculumLanguageFile): Class[] {
  const equivalent = new Map<string, CurriculumLanguageEntry>();
  const identity = (section: Section, indicator?: AchievementIndicator) => JSON.stringify(indicator
    ? [section.id, section.name.trim(), indicator.id, indicator.text.trim()]
    : [section.id, section.name.trim(), null]);
  for (const cls of classes) for (const unit of cls.units) for (const section of unit.sections) {
    const sectionEntry = language.outcomes[curriculumOutcomeKey(cls.id, unit.id, section.id, null)];
    if (sectionEntry) {
      const key = identity(section), previous = equivalent.get(key);
      equivalent.set(key, previous ? mergeLanguageEntry(previous, sectionEntry) : normalizedLanguageEntry(sectionEntry));
    }
    for (const indicator of section.indicators ?? []) {
      const indicatorEntry = language.outcomes[curriculumOutcomeKey(cls.id, unit.id, section.id, indicator.id)];
      if (!indicatorEntry) continue;
      const key = identity(section, indicator), previous = equivalent.get(key);
      equivalent.set(key, previous ? mergeLanguageEntry(previous, indicatorEntry) : normalizedLanguageEntry(indicatorEntry));
    }
  }
  return classes.map(cls => ({
    ...cls,
    units: cls.units.map(unit => ({
      ...unit,
      sections: unit.sections.map(section => {
        const sectionLanguage = equivalent.get(identity(section));
        return {
          ...section,
          ...shownLanguage(sectionLanguage),
          ...(section.indicators?.length ? { indicators: section.indicators.map(indicator => ({
            ...indicator,
            ...shownLanguage(equivalent.get(identity(section, indicator))),
          })) } : {}),
        };
      }),
    })),
  }));
}

function shownLanguage(entry: CurriculumLanguageEntry | undefined): Pick<CurriculumLanguageEntry, 'nickname' | 'nextStep' | 'nextStepIndicator'> {
  return entry ? {
    ...(entry.nickname ? { nickname: entry.nickname } : {}),
    ...(entry.nextStep ? { nextStep: entry.nextStep } : {}),
    ...(entry.nextStepIndicator ? { nextStepIndicator: { ...entry.nextStepIndicator } } : {}),
  } : {};
}

/** Course definitions are mostly immutable. Newer files choose conflicting labels; missing hierarchy is always combined. */
export function mergeCurriculumCatalog(left: CurriculumCatalogFile, right: CurriculumCatalogFile): CurriculumCatalogFile {
  const newer = right.updatedAt > left.updatedAt ? right : left;
  const older = newer === right ? left : right;
  const courses = curriculumDefinitions(mergeWorkspaceClasses([...newer.courses, ...older.courses]));
  for (const course of courses) if (!course.curriculumSource) {
    const source = [...newer.courses, ...older.courses]
      .find(candidate => candidate.id === course.id && candidate.curriculumSource)?.curriculumSource;
    if (source) course.curriculumSource = { ...source };
  }
  return {
    schemaVersion: CURRICULUM_CATALOG_SCHEMA,
    updatedAt: Math.max(left.updatedAt, right.updatedAt),
    courses,
  };
}

export interface CurriculumLanguagePendingEdit { key: string; field: LanguageField }

/** The newest edit to each individual field wins, so editing a nickname cannot erase a newer link. */
export function mergeCurriculumLanguage(left: CurriculumLanguageFile, right: CurriculumLanguageFile): CurriculumLanguageFile {
  const outcomes: Record<string, CurriculumLanguageEntry> = {};
  for (const key of new Set([...Object.keys(left.outcomes), ...Object.keys(right.outcomes)])) {
    const a = left.outcomes[key], b = right.outcomes[key];
    if (!a) outcomes[key] = normalizedLanguageEntry(b);
    else if (!b) outcomes[key] = normalizedLanguageEntry(a);
    else outcomes[key] = mergeLanguageEntry(a, b);
  }
  return { schemaVersion: CURRICULUM_LANGUAGE_SCHEMA, updatedAt: Math.max(left.updatedAt, right.updatedAt), outcomes };
}

/** Workspace data is authoritative except for explicit browser edits not yet written to it. */
export function overlayPendingCurriculumLanguage(
  external: CurriculumLanguageFile,
  local: CurriculumLanguageFile,
  pending: CurriculumLanguagePendingEdit[],
): CurriculumLanguageFile {
  const result: CurriculumLanguageFile = JSON.parse(JSON.stringify(external));
  for (const { key, field } of pending) {
    const source = local.outcomes[key];
    if (!source) continue;
    const entry = { ...(result.outcomes[key] ?? { updatedAt: 0 }) };
    const value = source[field];
    if (value === undefined) delete entry[field];
    else (entry as unknown as Record<string, unknown>)[field] = typeof value === 'object' ? { ...value } : value;
    const clock = fieldClock(field);
    entry[clock] = source[clock] ?? source.updatedAt;
    entry.updatedAt = Math.max(entry.updatedAt, source.updatedAt);
    result.outcomes[key] = entry;
  }
  result.updatedAt = Math.max(result.updatedAt, pending.length ? local.updatedAt : 0);
  return result;
}

export function parseCurriculumCatalog(value: string): CurriculumCatalogFile {
  const parsed = JSON.parse(value) as Partial<CurriculumCatalogFile>;
  if (parsed.schemaVersion !== CURRICULUM_CATALOG_SCHEMA || !Array.isArray(parsed.courses)) throw new Error('Unsupported curriculum catalog file.');
  return { schemaVersion: CURRICULUM_CATALOG_SCHEMA, updatedAt: finiteTimestamp(parsed.updatedAt), courses: curriculumDefinitions(parsed.courses) };
}

export function parseCurriculumLanguage(value: string): CurriculumLanguageFile {
  const parsed = JSON.parse(value) as Partial<CurriculumLanguageFile> & { schemaVersion?: number };
  // Older versions are accepted only as input migrations. Writing version 3 makes clients
  // that do not understand linked indicators and per-field clocks reject rather than strip them.
  if (![1, 2, CURRICULUM_LANGUAGE_SCHEMA].includes(parsed.schemaVersion ?? -1)
      || !parsed.outcomes || typeof parsed.outcomes !== 'object' || Array.isArray(parsed.outcomes)) {
    throw new Error('Unsupported curriculum comment-language file.');
  }
  const outcomes: Record<string, CurriculumLanguageEntry> = {};
  for (const [key, raw] of Object.entries(parsed.outcomes)) {
    if (!raw || typeof raw !== 'object') continue;
    const entry = raw as Partial<CurriculumLanguageEntry>;
    const nickname = typeof entry.nickname === 'string' ? entry.nickname.trim() : '';
    const nextStep = typeof entry.nextStep === 'string' ? entry.nextStep.trim() : '';
    const nextStepIndicator = curriculumIndicatorRef(entry.nextStepIndicator);
    const updatedAt = finiteTimestamp(entry.updatedAt);
    outcomes[key] = {
      ...(nickname ? { nickname } : {}),
      ...(nextStep ? { nextStep } : {}),
      ...(nextStepIndicator ? { nextStepIndicator } : {}),
      nicknameUpdatedAt: finiteTimestamp(entry.nicknameUpdatedAt ?? updatedAt),
      nextStepUpdatedAt: finiteTimestamp(entry.nextStepUpdatedAt ?? updatedAt),
      nextStepIndicatorUpdatedAt: finiteTimestamp(entry.nextStepIndicatorUpdatedAt ?? updatedAt),
      updatedAt,
    };
  }
  return { schemaVersion: CURRICULUM_LANGUAGE_SCHEMA, updatedAt: finiteTimestamp(parsed.updatedAt), outcomes };
}

function finiteTimestamp(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

function curriculumIndicatorRef(value: unknown): CurriculumIndicatorRef | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const candidate = value as Partial<CurriculumIndicatorRef>;
  const fields = [candidate.classId, candidate.unitId, candidate.sectionId, candidate.indicatorId];
  if (!fields.every(field => typeof field === 'string' && field.trim())) return undefined;
  return {
    classId: candidate.classId!.trim(),
    unitId: candidate.unitId!.trim(),
    sectionId: candidate.sectionId!.trim(),
    indicatorId: candidate.indicatorId!.trim(),
  };
}

export function stableCurriculumJson(value: CurriculumCatalogFile | CurriculumLanguageFile): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
