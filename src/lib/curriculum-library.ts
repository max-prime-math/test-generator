import type { AchievementIndicator, Class, Section } from './types.ts';
import { mergeWorkspaceClasses } from './workspace-format.ts';

export const CURRICULUM_CATALOG_SCHEMA = 1;
export const CURRICULUM_LANGUAGE_SCHEMA = 1;

export interface CurriculumCatalogFile {
  schemaVersion: 1;
  updatedAt: number;
  courses: Class[];
}

export interface CurriculumLanguageEntry {
  nickname?: string;
  nextStep?: string;
  updatedAt: number;
}

export interface CurriculumLanguageFile {
  schemaVersion: 1;
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

function commentEntry(value: { nickname?: string; nextStep?: string }, updatedAt: number): CurriculumLanguageEntry | null {
  const nickname = value.nickname?.trim();
  const nextStep = value.nextStep?.trim();
  return nickname || nextStep ? { ...(nickname ? { nickname } : {}), ...(nextStep ? { nextStep } : {}), updatedAt } : null;
}

export function applyCurriculumLanguage(classes: Class[], language: CurriculumLanguageFile): Class[] {
  return classes.map(cls => ({
    ...cls,
    units: cls.units.map(unit => ({
      ...unit,
      sections: unit.sections.map(section => {
        const sectionLanguage = language.outcomes[curriculumOutcomeKey(cls.id, unit.id, section.id, null)];
        return {
          ...section,
          ...shownLanguage(sectionLanguage),
          ...(section.indicators?.length ? { indicators: section.indicators.map(indicator => ({
            ...indicator,
            ...shownLanguage(language.outcomes[curriculumOutcomeKey(cls.id, unit.id, section.id, indicator.id)]),
          })) } : {}),
        };
      }),
    })),
  }));
}

function shownLanguage(entry: CurriculumLanguageEntry | undefined): Pick<CurriculumLanguageEntry, 'nickname' | 'nextStep'> {
  return entry ? { ...(entry.nickname ? { nickname: entry.nickname } : {}), ...(entry.nextStep ? { nextStep: entry.nextStep } : {}) } : {};
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

/** The newest edit to each outcome's report language wins across computers. */
export function mergeCurriculumLanguage(left: CurriculumLanguageFile, right: CurriculumLanguageFile): CurriculumLanguageFile {
  const outcomes: Record<string, CurriculumLanguageEntry> = {};
  for (const key of new Set([...Object.keys(left.outcomes), ...Object.keys(right.outcomes)])) {
    const a = left.outcomes[key], b = right.outcomes[key];
    if (!a) outcomes[key] = { ...b };
    else if (!b) outcomes[key] = { ...a };
    else outcomes[key] = b.updatedAt > a.updatedAt ? { ...b } : { ...a };
  }
  return { schemaVersion: CURRICULUM_LANGUAGE_SCHEMA, updatedAt: Math.max(left.updatedAt, right.updatedAt), outcomes };
}

export function parseCurriculumCatalog(value: string): CurriculumCatalogFile {
  const parsed = JSON.parse(value) as Partial<CurriculumCatalogFile>;
  if (parsed.schemaVersion !== CURRICULUM_CATALOG_SCHEMA || !Array.isArray(parsed.courses)) throw new Error('Unsupported curriculum catalog file.');
  return { schemaVersion: CURRICULUM_CATALOG_SCHEMA, updatedAt: finiteTimestamp(parsed.updatedAt), courses: curriculumDefinitions(parsed.courses) };
}

export function parseCurriculumLanguage(value: string): CurriculumLanguageFile {
  const parsed = JSON.parse(value) as Partial<CurriculumLanguageFile>;
  if (parsed.schemaVersion !== CURRICULUM_LANGUAGE_SCHEMA || !parsed.outcomes || typeof parsed.outcomes !== 'object' || Array.isArray(parsed.outcomes)) {
    throw new Error('Unsupported curriculum comment-language file.');
  }
  const outcomes: Record<string, CurriculumLanguageEntry> = {};
  for (const [key, raw] of Object.entries(parsed.outcomes)) {
    if (!raw || typeof raw !== 'object') continue;
    const entry = raw as Partial<CurriculumLanguageEntry>;
    const nickname = typeof entry.nickname === 'string' ? entry.nickname.trim() : '';
    const nextStep = typeof entry.nextStep === 'string' ? entry.nextStep.trim() : '';
    outcomes[key] = { ...(nickname ? { nickname } : {}), ...(nextStep ? { nextStep } : {}), updatedAt: finiteTimestamp(entry.updatedAt) };
  }
  return { schemaVersion: CURRICULUM_LANGUAGE_SCHEMA, updatedAt: finiteTimestamp(parsed.updatedAt), outcomes };
}

function finiteTimestamp(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

export function stableCurriculumJson(value: CurriculumCatalogFile | CurriculumLanguageFile): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
