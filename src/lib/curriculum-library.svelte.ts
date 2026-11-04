import type { Class } from './types.ts';
import {
  applyCurriculumLanguage,
  curriculumDefinitions,
  curriculumOutcomeKey,
  languageFromClasses,
  mergeCurriculumCatalog,
  mergeCurriculumLanguage,
  parseCurriculumCatalog,
  parseCurriculumLanguage,
  type CurriculumCatalogFile,
  type CurriculumLanguageFile,
} from './curriculum-library.ts';

export const CURRICULUM_CATALOG_KEY = 'tg-curriculum-catalog-v1';
export const CURRICULUM_LANGUAGE_KEY = 'tg-curriculum-comment-language-v1';

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
  } catch { /* recover by adopting legacy bank metadata */ }
  return { schemaVersion: 1, updatedAt: 0, outcomes: {} };
}

class CurriculumLibrary {
  #catalog = $state<CurriculumCatalogFile>(loadCatalog());
  #language = $state<CurriculumLanguageFile>(loadLanguage());
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
      schemaVersion: 1,
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
    const key = curriculumOutcomeKey(shown.id, unitId, sectionId, indicatorId);
    const previous = this.#language.outcomes[key] ?? { updatedAt: 0 };
    const entry = { ...previous, updatedAt: now };
    const value = text.trim();
    if (value) entry[field] = value;
    else delete entry[field];
    this.#replace(this.#catalog, {
      schemaVersion: 1,
      updatedAt: now,
      outcomes: { ...this.#language.outcomes, [key]: entry },
    }, true);
  }

  /** Combine another computer's shared files record-by-record, then persist the result. */
  mergeExternal(catalog: CurriculumCatalogFile | null, language: CurriculumLanguageFile | null): boolean {
    const nextCatalog = catalog ? mergeCurriculumCatalog(this.#catalog, catalog) : this.#catalog;
    const nextLanguage = language ? mergeCurriculumLanguage(this.#language, language) : this.#language;
    return this.#replace(nextCatalog, nextLanguage, false);
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
