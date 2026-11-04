import type { AfterQuestionLayout, TestConfig, SavedTest, TestType } from './types';
import { createId } from './id';
import { bankWorkspaces } from './bank-workspaces.svelte';
import { recordTestDeletion } from './workspace-safety';
import { loadTestContent, saveTestContent, type StoredTestContent } from './test-content-store';

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

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));

/** localStorage stays a small, synchronous index; frozen question copies live in IndexedDB. */
function libraryIndex(tests: SavedTest[]): SavedTest[] {
  return tests.map(({ questionSnapshots: _questions, narrativeSnapshots: _narratives, ...test }) => test);
}

function attachContent(tests: SavedTest[], stored: Map<string, StoredTestContent>): SavedTest[] {
  return tests.map(test => {
    const content = stored.get(test.id);
    if (!content) return test;
    return {
      ...test,
      questionSnapshots: test.questionSnapshots ?? content.questionSnapshots,
      narrativeSnapshots: test.narrativeSnapshots ?? content.narrativeSnapshots,
    };
  });
}

function sameContent(a: TestContent, b: TestContent): boolean {
  return JSON.stringify(a.questionSnapshots) === JSON.stringify(b.questionSnapshots)
    && JSON.stringify(a.narrativeSnapshots) === JSON.stringify(b.narrativeSnapshots);
}

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
  config.pageColumns = config.pageColumns === 2 ? 2 : 1;
  config.orientation = config.orientation === 'landscape' ? 'landscape' : 'portrait';
  config.columnRule = config.pageColumns === 2 && config.columnRule === true;
  return config;
}

function loadLibrary(): { tests: SavedTest[]; safeToRewrite: boolean } {
  try {
    const tests = JSON.parse(localStorage.getItem(LIBRARY_KEY) ?? '[]');
    if (!Array.isArray(tests)) return { tests: [], safeToRewrite: false };
    return { tests: tests.map((test: SavedTest) => ({
      ...test,
      config: migrateConfig(test.config),
      archivedAt: typeof test.archivedAt === 'number' ? test.archivedAt : undefined,
    })), safeToRewrite: true };
  } catch {
    // Keep an unreadable legacy value untouched so Back up everything can still recover it.
    return { tests: [], safeToRewrite: false };
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
const initialLibrary = loadLibrary();

class TestLibrary {
  tests = $state<SavedTest[]>(initialLibrary.tests);
  draft = $state<TestConfig | null>(initialDraft.config);
  draftContext = $state<TestDraftContext>(initialDraft.context);

  /** Counts changes, so the folder sync can tell when there are none. */
  revision = 0;
  /** Called after every change, so the folder sync can follow. */
  onChange: (() => void) | null = null;

  #bankId = bankWorkspaces.activeBankId;
  #version = 0;
  #ready: Promise<void>;
  #stored: Promise<void>;

  constructor() {
    this.#ready = initialLibrary.safeToRewrite
      ? this.#hydrate(this.#bankId, this.tests, this.#version, true)
      : Promise.resolve();
    this.#stored = this.#ready;
  }

  /** Full frozen content is available before operations that depend on it. */
  ready(): Promise<void> { return this.#ready; }

  /** Settle the latest IndexedDB write so a visible “Saved” state is truthful. */
  whenStored(): Promise<void> { return this.#stored; }

  prepareBank(bankId: string): Promise<Map<string, StoredTestContent>> {
    return loadTestContent(bankId);
  }

  applyBank(bankId: string, content: Map<string, StoredTestContent>): void {
    this.#bankId = bankId;
    const draft = loadDraft();
    const loaded = loadLibrary();
    const tests = attachContent(loaded.tests, content);
    this.tests = tests;
    this.draft = draft.config;
    this.draftContext = draft.context;
    this.#ready = Promise.resolve();
    if (!loaded.safeToRewrite) return;
    this.#queueContent(tests, bankId);
    void this.whenStored().then(() => {
      if (bankWorkspaces.activeBankId === bankId) localStorage.setItem(LIBRARY_KEY, JSON.stringify(libraryIndex(this.tests)));
    });
  }

  async #hydrate(bankId: string, tests: SavedTest[], version: number, compactAfter: boolean): Promise<void> {
    const stored = await loadTestContent(bankId);
    const hydrated = attachContent(tests, stored);
    // Legacy libraries contain their frozen copies inline. Move those copies only after the
    // IndexedDB transaction succeeds, then reclaim localStorage without risking the sole copy.
    await saveTestContent(bankId, copy(hydrated));
    if (this.#bankId !== bankId || this.#version !== version) return;
    this.tests = hydrated;
    if (compactAfter) localStorage.setItem(LIBRARY_KEY, JSON.stringify(libraryIndex(hydrated)));
  }

  #queueContent(tests: SavedTest[], bankId = this.#bankId): void {
    const snapshot = copy(tests);
    this.#stored = this.#stored.catch(() => undefined).then(async () => {
      // A very early action can happen while compact startup data is still hydrating. Preserve
      // content already in IndexedDB for tests whose metadata changed before hydration settled.
      const complete = attachContent(snapshot, await loadTestContent(bankId));
      await saveTestContent(bankId, complete);
    });
  }

  #saveLibrary(tests: SavedTest[]) {
    // Metadata/configuration remain synchronously recoverable while the much larger frozen
    // content is queued in IndexedDB. Callers that show “Saved” await whenStored().
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(libraryIndex(tests)));
    this.tests = tests;
    this.#version++;
    this.#queueContent(tests);
    this.revision++;
    this.onChange?.();
  }

  /** Deleted on another computer: remove without recording a deletion of our own. */
  removeFromFolder(id: string): void {
    if (this.get(id)) this.#saveLibrary(this.tests.filter(test => test.id !== id));
  }

  /** Switching to a different workspace: show its tests only. Nothing is recorded as deleted. */
  replaceAllFromFolder(tests: SavedTest[]): void {
    this.#saveLibrary(JSON.parse(JSON.stringify(tests)));
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
    const current = this.get(id);
    if (!current || sameContent(current, { questionSnapshots: questions, narrativeSnapshots: narratives })) return;
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

  archive(id: string): void {
    const now = Date.now();
    this.#saveLibrary(this.tests.map(test => test.id === id ? { ...test, archivedAt: now, updatedAt: now } : test));
  }

  restore(id: string): void {
    const now = Date.now();
    this.#saveLibrary(this.tests.map(test => test.id === id ? { ...test, archivedAt: undefined, updatedAt: now } : test));
  }

  rename(id: string, name: string): void {
    if (!name.trim()) return;
    this.updateMetadata(id, { name });
  }

  delete(id: string): void {
    // Only an explicit delete lets the workspace archive the test's folder.
    recordTestDeletion(id);
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

  /** ZIP import publishes all copies together, after their images are durable. */
  addImportedCopies(tests: SavedTest[]): void {
    const ids = new Set(this.tests.map(test => test.id));
    for (const test of tests) {
      if (ids.has(test.id)) throw new Error('An imported test ID already exists. Retry the import to make a new copy.');
      ids.add(test.id);
    }
    this.#saveLibrary([...this.tests, ...tests]);
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
bankWorkspaces.participate({
  beforeLeave: () => testLibrary.whenStored(),
  prepare: (bankId) => testLibrary.prepareBank(bankId),
  apply: (bankId, content) => testLibrary.applyBank(bankId, content),
});
