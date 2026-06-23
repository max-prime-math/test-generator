import { normalizeBubbleSheetMetadata } from './bubble-sheet.ts';
import type { AfterQuestionLayout, BubbleSheetMetadata, TestConfig, SavedTest, TestType } from './types';
import { createId } from './id';

const LIBRARY_KEY = 'tg-test-library-v1';
export const DRAFT_KEY = 'tg-test-draft-v1';

// Migrate old config objects to have missing fields
function migrateConfig(config: any): TestConfig {
  if (!config.pageBreakAfter) {
    config.pageBreakAfter = {};
  } else {
    const migrated: Record<string, AfterQuestionLayout> = {};
    for (const [questionId, value] of Object.entries(config.pageBreakAfter as Record<string, unknown>)) {
      if (value === 'pagebreak') {
        migrated[questionId] = { pagebreak: true };
      } else if (value === 'vfill') {
        migrated[questionId] = { vfill: true };
      } else if (value && typeof value === 'object') {
        const layout = value as { vfill?: unknown; pagebreak?: unknown };
        migrated[questionId] = {
          vfill: layout.vfill === true ? true : undefined,
          pagebreak: layout.pagebreak === true ? true : undefined,
        };
      }
    }
    config.pageBreakAfter = migrated;
  }
  if (!Array.isArray(config.bonusQuestionIds)) {
    config.bonusQuestionIds = [];
  }
  if (typeof config.appendBubbleSheet !== 'boolean') {
    config.appendBubbleSheet = false;
  }
  if (typeof config.bubbleSheetStudentId !== 'boolean') {
    config.bubbleSheetStudentId = false;
  }
  return config;
}

function loadLibrary(): SavedTest[] {
  try {
    const tests = JSON.parse(localStorage.getItem(LIBRARY_KEY) ?? '[]');
    if (!Array.isArray(tests)) return [];
    return tests.map((test: SavedTest) => ({
      ...test,
      config: migrateConfig(test.config),
      bubbleSheet: normalizeBubbleSheetMetadata(test.bubbleSheet),
    }));
  } catch {
    return [];
  }
}

function loadDraft(): TestConfig | null {
  try {
    const config = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null');
    return config ? migrateConfig(config) : null;
  } catch {
    return null;
  }
}

class TestLibrary {
  tests = $state<SavedTest[]>(loadLibrary());
  draft = $state<TestConfig | null>(loadDraft());

  #saveLibrary() {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(this.tests));
  }

  saveDraft(config: TestConfig): void {
    this.draft = config;
    localStorage.setItem(DRAFT_KEY, JSON.stringify(config));
  }

  clearDraft(): void {
    this.draft = null;
    localStorage.removeItem(DRAFT_KEY);
  }

  saveAs(
    name: string,
    classId: string | null,
    unitId: string | null,
    testType: TestType | null,
    config: TestConfig,
    bubbleSheet?: BubbleSheetMetadata | null,
  ): SavedTest {
    const entry: SavedTest = {
      id: createId('test'),
      name: name.trim(),
      classId,
      unitId,
      testType,
      config: JSON.parse(JSON.stringify(config)),
      bubbleSheet: bubbleSheet ?? undefined,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.tests = [...this.tests, entry];
    this.#saveLibrary();
    return entry;
  }

  update(id: string, config: TestConfig, bubbleSheet?: BubbleSheetMetadata | null): void {
    this.tests = this.tests.map((t) =>
      t.id === id
        ? {
            ...t,
            config: JSON.parse(JSON.stringify(config)),
            bubbleSheet: bubbleSheet ?? undefined,
            updatedAt: Date.now(),
          }
        : t
    );
    this.#saveLibrary();
  }

  setBubbleSheetMetadata(id: string, bubbleSheet: BubbleSheetMetadata | null): SavedTest | null {
    let updated: SavedTest | null = null;
    const now = Date.now();
    this.tests = this.tests.map((t) => {
      if (t.id !== id) return t;
      updated = {
        ...t,
        bubbleSheet: bubbleSheet ?? undefined,
        updatedAt: now,
      };
      return updated;
    });
    if (updated) this.#saveLibrary();
    return updated;
  }

  updateMetadata(
    id: string,
    input: Partial<Pick<SavedTest, 'name' | 'classId' | 'unitId' | 'testType'>>,
  ): SavedTest | null {
    let updated: SavedTest | null = null;
    const now = Date.now();
    this.tests = this.tests.map((t) => {
      if (t.id !== id) return t;
      updated = {
        ...t,
        name: input.name !== undefined ? input.name.trim() || t.name : t.name,
        classId: input.classId !== undefined ? input.classId : t.classId,
        unitId: input.unitId !== undefined ? input.unitId : t.unitId,
        testType: input.testType !== undefined ? input.testType : t.testType,
        updatedAt: now,
      };
      return updated;
    });
    if (updated) this.#saveLibrary();
    return updated;
  }

  rename(id: string, name: string): void {
    if (!name.trim()) return;
    this.updateMetadata(id, { name });
  }

  delete(id: string): void {
    this.tests = this.tests.filter((t) => t.id !== id);
    this.#saveLibrary();
  }

  load(id: string): TestConfig | null {
    const entry = this.tests.find((t) => t.id === id);
    return entry ? JSON.parse(JSON.stringify(entry.config)) : null;
  }

  get(id: string): SavedTest | undefined {
    return this.tests.find((t) => t.id === id);
  }

  get byClass(): Map<string | null, SavedTest[]> {
    const map = new Map<string | null, SavedTest[]>();
    const sorted = [...this.tests].sort((a, b) => b.updatedAt - a.updatedAt);
    for (const t of sorted) {
      const bucket = map.get(t.classId) ?? [];
      bucket.push(t);
      map.set(t.classId, bucket);
    }
    return map;
  }

  exportJson(): string {
    return JSON.stringify(this.tests, null, 2);
  }

  mergeRemote(remote: SavedTest): void {
    const existing = this.tests.find((t) => t.id === remote.id);
    if (!existing || remote.updatedAt > existing.updatedAt) {
      this.tests = existing
        ? this.tests.map((t) => (t.id === remote.id ? remote : t))
        : [...this.tests, remote];
      this.#saveLibrary();
    }
  }

  replaceWithRemote(remote: SavedTest): void {
    const existing = this.tests.find((t) => t.id === remote.id);
    this.tests = existing
      ? this.tests.map((t) => (t.id === remote.id ? remote : t))
      : [...this.tests, remote];
    this.#saveLibrary();
  }

  saveRemoteCopyAsConflict(remote: SavedTest, label: string): SavedTest {
    const entry: SavedTest = {
      ...remote,
      id: createId('test'),
      name: `${remote.name} (${label})`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.tests = [...this.tests, entry];
    this.#saveLibrary();
    return entry;
  }
}

export const testLibrary = new TestLibrary();
