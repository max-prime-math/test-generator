import type { AfterQuestionLayout, TestConfig, SavedTest, TestType } from './types';
import { createId } from './id';
import { bankWorkspaces } from './bank-workspaces.svelte';
import { recordTestDeletion } from './workspace-safety';
import { readTestContent, removeTestContent, writeTestContent } from './test-content-store';

const LIBRARY_KEY = 'tg-test-library-v1';
export const DRAFT_KEY = 'tg-test-draft-v1';

export interface TestDraftContext {
  testId: string | null;
  scopeId?: string;
  // The last committed configuration lets recovery distinguish pending edits
  // from a newer test loaded by sync or another workspace session.
  savedConfig: string | null;
  unnamedDraft?: TestConfig;
}
type TestContent = Pick<SavedTest, 'questionSnapshots' | 'narrativeSnapshots'>;

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));

type SnapshotRef = { bankId: string; revision: string; complete: boolean };
type TestIndexEntry = SavedTest & { _snapshot?: SnapshotRef };

const hasContent = (test: TestContent) => test.questionSnapshots !== undefined || test.narrativeSnapshots !== undefined;
const metadata = ({ questionSnapshots: _questions, narrativeSnapshots: _narratives, ...test }: SavedTest) => test;
const complete = (test: SavedTest, content: TestContent) => {
  const available = new Set([...(test.config.ownQuestions ?? []), ...(content.questionSnapshots ?? [])].map(question => question.id));
  return test.config.selectedIds.every(id => available.has(id));
};

/** Legacy repository and folder exports explicitly request complete test records. */
export async function readSavedTestIndex(tests: TestIndexEntry[], bankId: string): Promise<SavedTest[]> {
  const result: SavedTest[] = [];
  for (const { _snapshot, ...test } of tests) {
    const content = hasContent(test) && test.questionSnapshots && test.narrativeSnapshots
      ? undefined : await readTestContent(_snapshot?.bankId ?? bankId, test.id, _snapshot?.revision);
    result.push({ ...test, questionSnapshots: test.questionSnapshots ?? content?.questionSnapshots,
      narrativeSnapshots: test.narrativeSnapshots ?? content?.narrativeSnapshots });
  }
  return result;
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
  if (![1, 2, 3, 4, 5].includes(config.mcqChoiceColumns)) delete config.mcqChoiceColumns;
  config.orientation = config.orientation === 'landscape' ? 'landscape' : 'portrait';
  config.columnRule = config.pageColumns === 2 && config.columnRule === true;
  return config;
}

function loadLibrary(): TestIndexEntry[] {
  try {
    const tests = JSON.parse(localStorage.getItem(LIBRARY_KEY) ?? '[]');
    if (!Array.isArray(tests)) return [];
    return tests.map((test: TestIndexEntry) => ({
      ...test,
      config: migrateConfig(test.config),
      archivedAt: typeof test.archivedAt === 'number' ? test.archivedAt : undefined,
    }));
  } catch {
    // Keep an unreadable legacy value untouched so Back up everything can still recover it.
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
        scopeId: typeof _editor?.scopeId === 'string' ? _editor.scopeId : undefined,
        savedConfig: typeof _editor?.savedConfig === 'string' ? _editor.savedConfig : null,
        unnamedDraft: _editor?.unnamedDraft ? migrateConfig(_editor.unnamedDraft) : undefined,
      } };
    }
  } catch { /* Older drafts remain valid configurations without an edit identity. */ }
  return { config: null, context: { testId: null, savedConfig: null } };
}
const initialDraft = loadDraft();
const initialLibrary = loadLibrary();

class SnapshotOutdated extends Error {}

class TestLibrary {
  tests = $state.raw<SavedTest[]>([]);
  draft = $state<TestConfig | null>(initialDraft.config);
  draftContext = $state<TestDraftContext>(initialDraft.context);
  activeContent = $state.raw<{ id: string; content: TestContent } | null>(null);
  contentScope = $state(0);

  revision = 0;
  onChange: (() => void) | null = null;

  #bankId = bankWorkspaces.activeBankId;
  #refs = new Map<string, SnapshotRef>();
  #checked = new WeakSet<SavedTest>();
  #indexValue: string | null = null;
  #ready: Promise<void> = Promise.resolve();
  #stored: Promise<void> = Promise.resolve();
  #activeRequest = 0;

  constructor() {
    this.#load(initialLibrary);
  }

  ready(): Promise<void> { return this.#ready; }

  /** Wait for writes queued in the current bank, including changes made by folder sync. */
  whenStored(): Promise<void> { return this.#stored; }

  applyBank(bankId: string): void {
    this.#bankId = bankId;
    const draft = loadDraft();
    this.draft = draft.config;
    this.draftContext = draft.context;
    this.activeContent = null;
    this.#activeRequest++;
    this.contentScope++;
    this.#load(loadLibrary());
  }

  #load(entries: TestIndexEntry[]): void {
    this.#indexValue = localStorage.getItem(LIBRARY_KEY);
    this.#refs = new Map();
    this.#checked = new WeakSet();
    this.tests = entries.map(({ _snapshot, ...test }) => {
      if (_snapshot) this.#refs.set(test.id, _snapshot);
      return test;
    });
    const legacy = this.tests.filter(hasContent);
    const legacyIds = new Set(legacy.map(test => test.id));
    this.#stored = Promise.resolve();
    this.#ready = legacy.length ? this.#queue(async () => {
      // The inline copy stays in the index until its replacement is durable.
      const content = await readSavedTestIndex(legacy, this.#bankId);
      await this.#commit(content, () => this.tests.map(test => legacyIds.has(test.id) ? metadata(test) : test));
    }).then(() => undefined, () => undefined) : Promise.resolve();
  }

  #queue<T>(write: () => Promise<T>): Promise<T> {
    const result = this.#stored.then(write);
    // The operation reports its own failure. A rejected write must leave the
    // queue usable for retries and for switching banks after recovery.
    this.#stored = result.then(() => undefined, () => undefined);
    return result;
  }

  #publish(tests: SavedTest[], refs = this.#refs): void {
    if (localStorage.getItem(LIBRARY_KEY) !== this.#indexValue) {
      throw new Error('Saved Tests changed in another tab. Reload TestGen before saving again.');
    }
    const value = JSON.stringify(tests.map(test => {
      const ref = refs.get(test.id);
      return ref ? { ...test, _snapshot: ref } : test;
    }));
    localStorage.setItem(LIBRARY_KEY, value);
    this.#indexValue = value;
    this.#refs = refs;
    this.tests = tests;
    this.revision++;
    this.onChange?.();
  }

  async #commit(entries: SavedTest[], next: () => SavedTest[]): Promise<void> {
    const bankId = this.#bankId;
    const writes = entries.filter(hasContent).map(({ id, questionSnapshots, narrativeSnapshots }) => ({
      id, revision: createId('snapshot'), ...copy({ questionSnapshots, narrativeSnapshots }),
    }));
    if (writes.length) await writeTestContent(bankId, writes);
    const refs = new Map(this.#refs);
    try {
      if (bankId !== this.#bankId) throw new Error('The bank changed before the test could be saved.');
      for (const write of writes) {
        const entry = entries.find(test => test.id === write.id)!;
        refs.set(write.id, { bankId, revision: write.revision, complete: complete(entry, write) });
      }
      const oldRefs = this.#refs;
      this.#publish(next(), refs);
      const active = writes.find(write => write.id === this.activeContent?.id);
      if (active) this.activeContent = { id: active.id, content: { questionSnapshots: active.questionSnapshots, narrativeSnapshots: active.narrativeSnapshots } };
      // Remove old revisions after the index points to their durable replacements.
      for (const write of writes) {
        const old = oldRefs.get(write.id);
        await removeTestContent(old?.bankId ?? bankId, write.id, old?.revision).catch(() => undefined);
      }
    } catch (error) {
      for (const write of writes) await removeTestContent(bankId, write.id, write.revision).catch(() => undefined);
      throw error;
    }
  }

  async read(id: string): Promise<SavedTest | undefined> {
    const scope = this.contentScope;
    await this.#ready;
    while (scope === this.contentScope) {
      const test = this.get(id);
      if (!test) return;
      const ref = this.#refs.get(id);
      if (this.activeContent?.id === id) return { ...test, ...this.activeContent.content };
      try {
        const content = await readTestContent(ref?.bankId ?? this.#bankId, id, ref?.revision);
        if (scope !== this.contentScope) break;
        if (test !== this.get(id) || ref !== this.#refs.get(id)) continue;
        const loaded = { ...test, questionSnapshots: test.questionSnapshots ?? content?.questionSnapshots,
          narrativeSnapshots: test.narrativeSnapshots ?? content?.narrativeSnapshots };
        if (complete(test, loaded)) this.#checked.add(test);
        return loaded;
      } catch (error) {
        if (scope !== this.contentScope || ref === this.#refs.get(id)) throw error;
      }
    }
    throw new Error('The bank changed while reading the saved test.');
  }

  async activate(id: string | null): Promise<void> {
    if (id && this.activeContent?.id === id) return;
    const request = ++this.#activeRequest;
    if (!id) { this.activeContent = null; return; }
    const test = await this.read(id);
    if (request === this.#activeRequest && test) {
      this.activeContent = { id, content: { questionSnapshots: test.questionSnapshots, narrativeSnapshots: test.narrativeSnapshots } };
    }
  }

  hasCompleteContent(id: string): boolean {
    const entry = this.get(id);
    return !!entry && (this.#refs.get(id)?.complete === true || this.#checked.has(entry));
  }

  removeFromFolder(id: string): void {
    if (this.get(id)) this.replaceAllFromFolder(this.tests.filter(test => test.id !== id));
  }

  /** Switching workspaces discards the local index for tests outside the new folder. */
  replaceAllFromFolder(tests: SavedTest[]): void {
    const bankId = this.#bankId;
    const refs = new Map(this.#refs);
    const retained = new Set(tests.map(test => test.id));
    const removed = this.tests.filter(test => !retained.has(test.id))
      .map(test => ({ id: test.id, ref: refs.get(test.id) }));
    for (const test of removed) refs.delete(test.id);
    this.#publish(tests, refs);
    if (removed.length) void this.#queue(async () => {
      for (const { id, ref } of removed) {
        if (ref || this.#bankId !== bankId || !this.get(id)) await removeTestContent(ref?.bankId ?? bankId, id, ref?.revision);
      }
    }).catch(() => undefined);
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

  saveAs(name: string, classId: string | null, unitId: string | null, testType: TestType | null, config: TestConfig): SavedTest {
    const entry = this.#newTest(name, classId, unitId, testType, config);
    this.#publish([...this.tests, entry]);
    return entry;
  }

  #newTest(name: string, classId: string | null, unitId: string | null, testType: TestType | null, config: TestConfig): SavedTest {
    return { id: createId('test'), name: name.trim(), classId, unitId, testType, config: copy(config), createdAt: Date.now(), updatedAt: Date.now() };
  }

  async saveAsWithContent(name: string, classId: string | null, unitId: string | null, testType: TestType | null, config: TestConfig, content: TestContent): Promise<SavedTest> {
    const test = { ...this.#newTest(name, classId, unitId, testType, config), ...copy(content) };
    await this.#queue(() => this.#commit([test], () => [...this.tests, metadata(test)]));
    return test;
  }

  update(id: string, config: TestConfig): void {
    const entry = this.get(id);
    if (!entry) throw new Error('This saved test no longer exists. Use Save As to keep your work.');
    const refs = new Map(this.#refs);
    const ref = refs.get(id);
    if (ref && JSON.stringify(entry.config.selectedIds) !== JSON.stringify(config.selectedIds)) refs.set(id, { ...ref, complete: false });
    this.#publish(this.tests.map(test => test.id === id ? { ...test, config: copy(config), updatedAt: Date.now() } : test), refs);
  }

  async updateWithContent(id: string, config: TestConfig, content: TestContent, expectedConfig: string | null): Promise<void> {
    await this.#queue(async () => {
      const previous = await this.read(id);
      const current = () => {
        const entry = this.get(id);
        if (!entry || JSON.stringify(entry.config) !== expectedConfig) throw new Error('This test changed elsewhere. Use Save As to keep a separate copy.');
        return entry;
      };
      const entry = current();
      if (previous && sameContent(previous, content)) { this.update(id, config); return; }
      const next = { ...entry, ...copy(content), config: copy(config), updatedAt: Date.now() };
      await this.#commit([next], () => {
        const latest = current();
        return this.tests.map(test => test.id === id ? { ...metadata(latest), config: next.config, updatedAt: next.updatedAt } : test);
      });
    });
  }

  async setContentSnapshot(id: string, questions: NonNullable<SavedTest['questionSnapshots']>, narratives: NonNullable<SavedTest['narrativeSnapshots']>, expectedConfig?: TestConfig): Promise<void> {
    const content = { questionSnapshots: questions, narrativeSnapshots: narratives };
    const expected = expectedConfig && JSON.stringify(expectedConfig);
    await this.#queue(async () => {
      const matches = (test: SavedTest | undefined) => test && (!expected || JSON.stringify(test.config) === expected);
      if (!matches(this.get(id))) return;
      const current = await this.read(id);
      if (!current || !matches(current) || sameContent(current, content)) return;
      try {
        await this.#commit([{ ...current, ...content }], () => {
          if (!matches(this.get(id))) throw new SnapshotOutdated();
          return this.tests.map(test => test.id === id ? metadata(test) : test);
        });
      } catch (error) { if (!(error instanceof SnapshotOutdated)) throw error; }
    });
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
    if (updated) this.#publish(tests);
    return updated;
  }

  archive(id: string): void {
    const now = Date.now();
    this.#publish(this.tests.map(test => test.id === id ? { ...test, archivedAt: now, updatedAt: now } : test));
  }

  restore(id: string): void {
    const now = Date.now();
    this.#publish(this.tests.map(test => test.id === id ? { ...test, archivedAt: undefined, updatedAt: now } : test));
  }

  rename(id: string, name: string): void {
    if (!name.trim()) return;
    this.updateMetadata(id, { name });
  }

  delete(id: string): void {
    // Only an explicit delete lets the workspace archive the test's folder.
    recordTestDeletion(id);
    this.removeFromFolder(id);
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

  /** ZIP import publishes all copies together, after their images and snapshots are durable. */
  async addImportedCopies(tests: SavedTest[]): Promise<void> {
    await this.#queue(() => this.#commit(tests, () => {
      const ids = new Set(this.tests.map(test => test.id));
      for (const test of tests) {
        if (ids.has(test.id)) throw new Error('An imported test ID already exists. Retry the import to keep a separate copy.');
        ids.add(test.id);
      }
      return [...this.tests, ...tests.map(metadata)];
    }));
  }

  async mergeRemote(remote: SavedTest): Promise<void> {
    const existing = this.get(remote.id);
    if (!existing || remote.updatedAt > existing.updatedAt) await this.replaceWithRemote(remote);
  }

  async replaceWithRemote(remote: SavedTest): Promise<void> {
    await this.#queue(async () => {
      const coversSnapshots = remote.questionSnapshots !== undefined && remote.narrativeSnapshots !== undefined;
      const previous = hasContent(remote) && !coversSnapshots ? await this.read(remote.id) : undefined;
      const content = previous ? { ...remote, questionSnapshots: remote.questionSnapshots ?? previous.questionSnapshots,
        narrativeSnapshots: remote.narrativeSnapshots ?? previous.narrativeSnapshots } : remote;
      await this.#commit([content], () => {
        const entry = this.get(remote.id);
        const next = hasContent(content) ? metadata(content) : { ...entry, ...remote };
        return entry ? this.tests.map(test => test.id === remote.id ? next : test) : [...this.tests, next];
      });
    });
  }

  async saveRemoteCopyAsConflict(remote: SavedTest, label: string): Promise<SavedTest> {
    const entry = { ...remote, id: createId('test'), name: `${remote.name} (${label})`, createdAt: Date.now(), updatedAt: Date.now() };
    await this.addImportedCopies([entry]);
    return entry;
  }
}

export const testLibrary = new TestLibrary();
bankWorkspaces.participate({
  beforeLeave: () => testLibrary.whenStored(),
  apply: (bankId) => testLibrary.applyBank(bankId),
});
