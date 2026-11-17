import type { Class, CurriculumIndicatorRef } from './types.ts';
import {
  applyCurriculumLanguage,
  curriculumDefinitions,
  equivalentCurriculumOutcomeKeys,
  curriculumOutcomeKey,
  languageFromClasses,
  mergeCurriculumCatalog,
  mergeCurriculumLanguage,
  overlayPendingCurriculumLanguage,
  parseCurriculumCatalog,
  parseCurriculumLanguage,
  type CurriculumCatalogFile,
  type CurriculumLanguageFile,
} from './curriculum-library.ts';

export const CURRICULUM_CATALOG_KEY = 'tg-curriculum-catalog-v1';
export const CURRICULUM_LANGUAGE_KEY = 'tg-curriculum-comment-language-v3';
const LEGACY_CURRICULUM_LANGUAGE_KEYS = ['tg-curriculum-comment-language-v2', 'tg-curriculum-comment-language-v1'];
const CURRICULUM_LANGUAGE_PENDING_KEY = 'tg-curriculum-comment-language-pending-v1';
type PendingField = 'nickname' | 'nextStep' | 'nextStepIndicator';

function storage(): Storage | null { return typeof localStorage === 'undefined' ? null : localStorage; }
function copy<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }

function loadCatalog(): CurriculumCatalogFile {
  try {
    const value = storage()?.getItem(CURRICULUM_CATALOG_KEY);
    if (value) return parseCurriculumCatalog(value);
  } catch { /* recover by adopting legacy bank metadata */ }
  return { schemaVersion: 1, updatedAt: 0, courses: [] };
}

function loadLanguage(): CurriculumLanguageFile {
  try {
    const value = storage()?.getItem(CURRICULUM_LANGUAGE_KEY);
    if (value) return parseCurriculumLanguage(value);
    for (const key of LEGACY_CURRICULUM_LANGUAGE_KEYS) {
      const legacy = storage()?.getItem(key);
      if (legacy) return parseCurriculumLanguage(legacy);
    }
  } catch { /* recover by adopting legacy bank metadata */ }
  return { schemaVersion: 3, updatedAt: 0, outcomes: {} };
}

function loadPending(): { key: string; field: PendingField }[] {
  try {
    const value = JSON.parse(storage()?.getItem(CURRICULUM_LANGUAGE_PENDING_KEY) ?? '[]');
    return Array.isArray(value) ? value.filter(item => item && typeof item.key === 'string'
      && ['nickname', 'nextStep', 'nextStepIndicator'].includes(item.field)) : [];
  } catch { return []; }
}

class CurriculumLibrary {
  #catalog = $state<CurriculumCatalogFile>(loadCatalog());
  #language = $state<CurriculumLanguageFile>(loadLanguage());
  #pending = $state<{ key: string; field: PendingField }[]>(loadPending());
  onChange: (() => void) | null = null;

  get definitions(): Class[] { return this.#catalog.courses; }
  get classes(): Class[] { return applyCurriculumLanguage(this.#catalog.courses, this.#language); }
  apply(classes: Class[]): Class[] { return applyCurriculumLanguage(curriculumDefinitions(classes), this.#language); }
  get catalogFile(): CurriculumCatalogFile { return copy(this.#catalog); }
  get languageFile(): CurriculumLanguageFile { return copy(this.#language); }

  /** Fill the shared source from legacy bank snapshots without replacing newer shared values. */
  adopt(classes: Class[]): void {
    if (!classes.length) return;
    const legacyCatalog: CurriculumCatalogFile = { schemaVersion: 1, updatedAt: 0, courses: curriculumDefinitions(classes) };
    const harvested = languageFromClasses(classes, 0);
    const catalog = mergeCurriculumCatalog(this.#catalog, legacyCatalog);
    // Legacy bank copies only fill missing entries; an explicit shared edit is authoritative.
    const language: CurriculumLanguageFile = {
      schemaVersion: 3,
      updatedAt: Math.max(harvested.updatedAt, this.#language.updatedAt),
      outcomes: { ...harvested.outcomes, ...this.#language.outcomes },
    };
    this.#replace(catalog, language, false);
  }

  /** Replace one canonical course after an explicit teacher edit. */
  setClass(cls: Class, now = Date.now()): void {
    const definitions = curriculumDefinitions([cls])[0];
    const courses = this.#catalog.courses.some(course => course.id === cls.id)
      ? this.#catalog.courses.map(course => course.id === cls.id ? definitions : course)
      : [...this.#catalog.courses, definitions];
    const language = mergeCurriculumLanguage(this.#language, languageFromClasses([cls], now));
    this.#replace({ schemaVersion: 1, updatedAt: now, courses }, language, true);
  }

  setCommentMetadata(shown: Class, unitId: string, sectionId: string, indicatorId: string | null,
    field: 'nickname' | 'nextStep', text: string, now = Date.now()): void {
    const outcomes = { ...this.#language.outcomes };
    for (const key of equivalentCurriculumOutcomeKeys(this.#catalog.courses, shown, unitId, sectionId, indicatorId)) {
      const entry = { ...(outcomes[key] ?? { updatedAt: 0 }), updatedAt: now };
      const value = text.trim();
      if (value) entry[field] = value;
      else delete entry[field];
      entry[`${field}UpdatedAt` as 'nicknameUpdatedAt' | 'nextStepUpdatedAt'] = now;
      this.#markPending(key, field);
      if (field === 'nextStep') {
        delete entry.nextStepIndicator;
        entry.nextStepIndicatorUpdatedAt = now;
        this.#markPending(key, 'nextStepIndicator');
      }
      outcomes[key] = entry;
    }
    this.#replace(this.#catalog, {
      schemaVersion: 3,
      updatedAt: now,
      outcomes,
    }, true);
  }

  setNextStepIndicator(shown: Class, unitId: string, sectionId: string, indicatorId: string | null,
    reference: CurriculumIndicatorRef | null, now = Date.now()): void {
    const outcomes = { ...this.#language.outcomes };
    for (const key of equivalentCurriculumOutcomeKeys(this.#catalog.courses, shown, unitId, sectionId, indicatorId)) {
      const entry = { ...(outcomes[key] ?? { updatedAt: 0 }), updatedAt: now };
      entry.nextStepIndicatorUpdatedAt = now;
      this.#markPending(key, 'nextStepIndicator');
      if (reference) {
        entry.nextStepIndicator = { ...reference };
        delete entry.nextStep;
        entry.nextStepUpdatedAt = now;
        this.#markPending(key, 'nextStep');
      } else delete entry.nextStepIndicator;
      outcomes[key] = entry;
    }
    this.#replace(this.#catalog, {
      schemaVersion: 3,
      updatedAt: now,
      outcomes,
    }, true);
  }

  /** Adopt the workspace file, overlaying only browser edits that have not reached the folder yet. */
  mergeExternal(catalog: CurriculumCatalogFile | null, language: CurriculumLanguageFile | null): boolean {
    const nextCatalog = catalog ? mergeCurriculumCatalog(this.#catalog, catalog) : this.#catalog;
    const nextLanguage = language
      ? overlayPendingCurriculumLanguage(language, this.#language, this.#pending)
      : this.#language;
    return this.#replace(nextCatalog, nextLanguage, false);
  }

  /** Called only after both shared files were written successfully. */
  markSynced(): void {
    this.#pending = [];
    storage()?.removeItem(CURRICULUM_LANGUAGE_PENDING_KEY);
  }

  #markPending(key: string, field: PendingField): void {
    this.#pending = [...this.#pending.filter(item => item.key !== key || item.field !== field), { key, field }];
    storage()?.setItem(CURRICULUM_LANGUAGE_PENDING_KEY, JSON.stringify(this.#pending));
  }

  #replace(catalog: CurriculumCatalogFile, language: CurriculumLanguageFile, notify: boolean): boolean {
    const previous = JSON.stringify([this.#catalog, this.#language]);
    const next = JSON.stringify([catalog, language]);
    if (previous === next) return false;
    this.#catalog = copy(catalog);
    this.#language = copy(language);
    storage()?.setItem(CURRICULUM_CATALOG_KEY, JSON.stringify(this.#catalog));
    storage()?.setItem(CURRICULUM_LANGUAGE_KEY, JSON.stringify(this.#language));
    if (notify) this.onChange?.();
    return true;
  }
}

export const curriculumLibrary = new CurriculumLibrary();
