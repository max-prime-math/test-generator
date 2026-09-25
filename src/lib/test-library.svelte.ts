import type { AfterQuestionLayout, TestConfig, SavedTest, TestType } from './types';
import { createId } from './id';

const LIBRARY_KEY = 'tg-test-library-v1';
export const DRAFT_KEY = 'tg-test-draft-v1';

export interface TestDraftContext {
  testId: string | null;
  // The last committed configuration lets recovery distinguish pending edits
  // from a newer test loaded by sync or another workspace session.
  savedConfig: string | null;
  unnamedDraft?: TestConfig;
}
type TestContent = Pick<SavedTest, 'questionSnapshots' | 'narrativeSnapshots'>;

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
  return config;
}

function loadLibrary(): SavedTest[] {
  try {
    const tests = JSON.parse(localStorage.getItem(LIBRARY_KEY) ?? '[]');
    if (!Array.isArray(tests)) return [];
    return tests.map((test: SavedTest) => ({
      ...test,
      config: migrateConfig(test.config)
    }));
  } catch {
    return [];
  }
}

function loadDraft(): { config: TestConfig | null; context: TestDraftContext } {
  try {
    const stored = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null');
    if (stored) {
      const { _editor, ...config } = stored;
      return { config: migrateConfig(config), context: {
        testId: typeof _editor?.testId === 'string' ? _editor.testId : null,
        savedConfig: typeof _editor?.savedConfig === 'string' ? _editor.savedConfig : null,
        unnamedDraft: _editor?.unnamedDraft ? migrateConfig(_editor.unnamedDraft) : undefined,
      } };
    }
  } catch { /* Older drafts remain valid configurations without an edit identity. */ }
  return { config: null, context: { testId: null, savedConfig: null } };
}
const initialDraft = loadDraft();

class TestLibrary {
  tests = $state<SavedTest[]>(loadLibrary());
  draft = $state<TestConfig | null>(initialDraft.config);
  draftContext = $state<TestDraftContext>(initialDraft.context);

  #saveLibrary(tests: SavedTest[]) {
    // Publish reactive state only after the durable write succeeds.
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(tests));
    this.tests = tests;
  }

  saveDraft(config: TestConfig, context = this.draftContext): void {
    const copy = JSON.parse(JSON.stringify(config));
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...copy, _editor: context }));
    this.draft = copy;
    this.draftContext = JSON.parse(JSON.stringify(context));
  }

  clearDraft(): void {
    localStorage.removeItem(DRAFT_KEY);
    this.draft = null;
    this.draftContext = { testId: null, savedConfig: null };
  }

  saveAs(name: string, classId: string | null, unitId: string | null, testType: TestType | null, config: TestConfig, content: TestContent = {}): SavedTest {
    const entry: SavedTest = {
      ...JSON.parse(JSON.stringify(content)),
      id: createId('test'),
      name: name.trim(),
      classId,
      unitId,
      testType,
      config: JSON.parse(JSON.stringify(config)),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.#saveLibrary([...this.tests, entry]);
    return entry;
  }

  update(id: string, config: TestConfig, content: TestContent = {}): void {
    if (!this.get(id)) throw new Error('This saved test no longer exists. Use Save As to keep your work.');
    this.#saveLibrary(this.tests.map((t) =>
      t.id === id ? { ...t, ...JSON.parse(JSON.stringify(content)), config: JSON.parse(JSON.stringify(config)), updatedAt: Date.now() } : t
    ));
  }

  setContentSnapshot(id: string, questions: NonNullable<SavedTest['questionSnapshots']>, narratives: NonNullable<SavedTest['narrativeSnapshots']>, expectedConfig?: TestConfig): void {
    // Folder writes yield for I/O. Don't attach their older snapshot to a test
    // whose selection changed while that write was in flight.
    if (expectedConfig && JSON.stringify(this.get(id)?.config) !== JSON.stringify(expectedConfig)) return;
    this.#saveLibrary(this.tests.map(test => test.id === id ? { ...test, questionSnapshots: questions, narrativeSnapshots: narratives } : test));
  }

  updateMetadata(
    id: string,
    input: Partial<Pick<SavedTest, 'name' | 'classId' | 'unitId' | 'testType'>>,
  ): SavedTest | null {
    let updated: SavedTest | null = null;
    const now = Date.now();
    const tests = this.tests.map((t) => {
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
    if (updated) this.#saveLibrary(tests);
    return updated;
  }

  rename(id: string, name: string): void {
    if (!name.trim()) return;
    this.updateMetadata(id, { name });
  }

  delete(id: string): void {
    this.#saveLibrary(this.tests.filter((t) => t.id !== id));
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
      this.#saveLibrary(existing
        ? this.tests.map((t) => (t.id === remote.id ? remote : t))
        : [...this.tests, remote]);
    }
  }

  replaceWithRemote(remote: SavedTest): void {
    const existing = this.tests.find((t) => t.id === remote.id);
    this.#saveLibrary(existing
      ? this.tests.map((t) => (t.id === remote.id ? remote : t))
      : [...this.tests, remote]);
  }

  saveRemoteCopyAsConflict(remote: SavedTest, label: string): SavedTest {
    const entry: SavedTest = {
      ...remote,
      id: createId('test'),
      name: `${remote.name} (${label})`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.#saveLibrary([...this.tests, entry]);
    return entry;
  }
}

export const testLibrary = new TestLibrary();
