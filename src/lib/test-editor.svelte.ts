import { testLibrary } from './test-library.svelte';
import { defaultTestConfig, type Question, type TestConfig, type TestType } from './types';
import { bank } from './bank.svelte';
import { narratives } from './narratives.svelte';
import { bankWorkspaces } from './bank-workspaces.svelte';
import { workspaceCatalog } from './workspace-catalog.svelte';
import { firstById, snapshotTest } from './workspace-format';
import { readBrowserAppData } from '../git/repoDataBridge';
import { imageStore } from './image-store.svelte';

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));

/** One editing session, shared by Build and the workspace's bank-switch actions. */
class TestEditor {
  config = $state<TestConfig>(copy(testLibrary.draft ?? defaultTestConfig()));
  testId = $state<string | null>(testLibrary.draftContext.testId);
  saving = $state(false);
  transitioning = $state(false);
  error = $state('');
  recoveryError = $state('');
  unnamedDraft = $state<TestConfig | undefined>(testLibrary.draftContext.unnamedDraft);
  private baseline = $state<string | null>(testLibrary.draftContext.savedConfig);
  private bankId = bankWorkspaces.activeBankId;
  private initialized = false;
  private lastCheckpoint = '';
  private timer: ReturnType<typeof setTimeout> | undefined;
  private operation: Promise<boolean> | null = null;

  /** Follow a bank switch: the incoming bank's recovery draft replaces this session. testLibrary has already switched. */
  enterBank(bankId: string) {
    clearTimeout(this.timer);
    this.bankId = bankId;
    this.config = copy(testLibrary.draft ?? this.defaults ?? defaultTestConfig());
    this.testId = testLibrary.draftContext.testId;
    this.unnamedDraft = testLibrary.draftContext.unnamedDraft;
    this.baseline = testLibrary.draftContext.savedConfig;
    this.error = '';
    this.recoveryError = '';
    this.lastCheckpoint = '';
    const defaults = this.defaults;
    this.initialized = false;
    if (defaults) this.initialize(copy(defaults));
  }
  private defaults: TestConfig | undefined;

  initialize(defaults: TestConfig) {
    this.defaults ??= copy(defaults);
    if (this.initialized) return;
    this.initialized = true;
    if (!testLibrary.draft) this.config = defaults;
    const entry = this.testId ? testLibrary.get(this.testId) : undefined;
    if (entry) {
      const saved = JSON.stringify(entry.config);
      // A clean recovered session should follow a newer library version. A
      // pending session keeps its own edits and checks for conflicts on save.
      if (JSON.stringify(this.config) === this.baseline) this.config = copy(entry.config);
      if (!this.baseline || JSON.stringify(this.config) === saved) this.baseline = saved;
    } else if (this.testId) {
      this.testId = null;
      this.baseline = null;
      this.error = 'The original test is unavailable. Your draft was recovered; use Save As to keep it.';
    }
  }

  get dirty() { return this.testId !== null && JSON.stringify(this.config) !== this.baseline; }
  get status() {
    if (this.recoveryError || this.error) return 'Not saved';
    if (this.saving || this.dirty) return 'Saving…';
    return this.testId ? 'Saved locally' : 'Draft saved locally';
  }

  private inOriginalBank() {
    return bankWorkspaces.activeBankId === this.bankId;
  }

  /** Synchronous recovery write on every edit, without waiting for image I/O. */
  checkpoint() {
    if (!this.inOriginalBank()) return;
    const context = { testId: this.testId, savedConfig: this.baseline, unnamedDraft: this.unnamedDraft };
    const serialized = JSON.stringify([this.config, context]);
    try {
      if (serialized !== this.lastCheckpoint) {
        testLibrary.saveDraft(this.config, context);
        this.lastCheckpoint = serialized;
      }
      this.recoveryError = '';
    } catch {
      this.recoveryError = 'Your latest changes could not be stored in this browser. Keep this page open and free storage, then retry saving.';
    }
    clearTimeout(this.timer);
    if (this.dirty && !this.error) this.timer = setTimeout(() => void this.flush(), 500);
  }

  private assertUnchanged(id: string, expected: string | null) {
    const entry = testLibrary.get(id);
    if (!entry) throw new Error('This test was deleted. Use Save As to keep your changes in a new test.');
    if (JSON.stringify(entry.config) !== expected) {
      throw new Error('This test changed elsewhere. Your edits are kept in the recovery draft. Use Save As to keep a separate copy.');
    }
  }

  private async capture(config: TestConfig, sourceId: string | null, name: string) {
    const source = sourceId ? testLibrary.get(sourceId) : undefined;
    // Capture the content BEFORE yielding: navigation or bank edits must not
    // change which questions an in-flight save freezes. The test's own copies
    // (generated, or edited for this test) come first.
    const questionPool = firstById([...(config.ownQuestions ?? []), ...(source?.questionSnapshots ?? []), ...workspaceCatalog.questions, ...bank.questions]);
    const questions = copy(config.selectedIds.flatMap(id => questionPool.get(id) ?? []));
    const narrativeIds = new Set(questions.map(question => question.narrativeId));
    const narrativeContent = copy([...firstById([...(source?.narrativeSnapshots ?? []), ...narratives.narratives]).values()]
      .filter(narrative => narrativeIds.has(narrative.id)));
    const data = await readBrowserAppData();
    const captured = snapshotTest({ ...source, id: sourceId ?? 'draft', name, config,
      classId: source?.classId ?? null, unitId: source?.unitId ?? null, testType: source?.testType ?? null,
      createdAt: source?.createdAt ?? Date.now(), updatedAt: Date.now(),
      questionSnapshots: undefined, narrativeSnapshots: undefined,
    }, { ...data, questions, narratives: narrativeContent, images: [...(data.images ?? []), ...workspaceCatalog.images] });
    if (!this.inOriginalBank()) throw new Error('The bank changed before the test finished saving. Reopen the original bank to recover your edits.');
    for (const image of captured.images) {
      // Content-addressed snapshots already in the image store are immutable.
      if (!imageStore.has(image.name)) await imageStore.put(image.name, image.bytes, image.ext);
    }
    return { questionSnapshots: captured.test.questionSnapshots, narrativeSnapshots: captured.test.narrativeSnapshots };
  }

  /** Serialize saves; never let an older image snapshot overwrite newer edits. */
  async flush(): Promise<boolean> {
    this.checkpoint();
    clearTimeout(this.timer);
    if (this.operation) return this.operation;
    if (!this.inOriginalBank()) return false;
    this.operation = this.savePending();
    try { return await this.operation; }
    finally { this.operation = null; }
  }

  private async savePending(): Promise<boolean> {
    this.saving = true;
    try {
      while (this.dirty) {
        const id = this.testId!;
        const expected = this.baseline;
        if (JSON.stringify(testLibrary.get(id)?.config) === JSON.stringify(this.config)) {
          this.baseline = JSON.stringify(this.config);
          this.checkpoint();
          continue;
        }
        this.assertUnchanged(id, expected);
        const config = copy(this.config);
        const content = await this.capture(config, id, testLibrary.get(id)!.name);
        if (!this.inOriginalBank()) return false;
        this.assertUnchanged(id, expected);
        testLibrary.update(id, config, content);
        this.baseline = JSON.stringify(config);
        this.checkpoint();
        clearTimeout(this.timer);
      }
      this.error = '';
      return !this.recoveryError;
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
      return false;
    } finally { this.saving = false; }
  }

  async open(id: string): Promise<boolean> {
    if (this.transitioning) return false;
    this.transitioning = true;
    try {
      if (!await this.flush()) return false;
      const config = testLibrary.load(id);
      if (!config) return false;
      if (!this.testId) this.unnamedDraft = copy(this.config);
      this.config = config;
      this.testId = id;
      this.baseline = JSON.stringify(config);
      this.error = '';
      this.checkpoint();
      return !this.recoveryError;
    } finally { this.transitioning = false; }
  }

  async newTest(defaults: TestConfig, resume = false): Promise<boolean> {
    if (this.transitioning) return false;
    this.transitioning = true;
    try {
      if (!await this.flush()) return false;
      // Keep the unnamed working test while editing named tests. Starting over
      // is the one explicit action that discards it, with a UI confirmation.
      this.config = copy(resume && this.unnamedDraft ? this.unnamedDraft : defaults);
      this.testId = null;
      this.baseline = null;
      this.unnamedDraft = undefined;
      this.error = '';
      this.checkpoint();
      return !this.recoveryError;
    } finally { this.transitioning = false; }
  }

  async saveAs(input: { name: string; classId: string | null; unitId: string | null; testType: TestType | null }): Promise<boolean> {
    if (this.transitioning) return false;
    this.transitioning = true;
    try {
      // Save As is also the escape hatch for a conflicted/deleted original.
      if (this.operation) await this.operation;
      const config = copy(this.config);
      const content = await this.capture(config, this.testId, input.name);
      if (!this.inOriginalBank()) return false;
      const entry = testLibrary.saveAs(input.name, input.classId, input.unitId, input.testType, config, content);
      if (!this.testId) this.unnamedDraft = undefined;
      this.testId = entry.id;
      this.baseline = JSON.stringify(config);
      this.error = '';
      this.checkpoint();
      return !this.recoveryError;
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
      return false;
    } finally { this.transitioning = false; }
  }

  /** Bank question ids as the Test Builder lists them: workspace catalog copies of the active bank when a folder is connected. */
  testIdsFor(questionIds: string[]): string[] {
    const bankId = bankWorkspaces.activeBankId;
    const catalogIds = new Map<string, string>();
    for (const [id, source] of Object.entries(workspaceCatalog.sources)) if (source.bankId === bankId) catalogIds.set(source.questionId, id);
    return questionIds.map(id => catalogIds.get(id) ?? id);
  }

  /**
   * Append bank questions to the current test, skipping ones it already has. `own` are
   * questions that belong to the test alone (from Generate); their ids are in `questionIds`.
   */
  addQuestions(questionIds: string[], own: Question[] = []): { added: number; existing: number } | null {
    if (this.transitioning || !this.inOriginalBank()) return null;
    const bankId = bankWorkspaces.activeBankId;
    const present = new Set(this.config.selectedIds.flatMap(id => {
      const source = workspaceCatalog.sources[id];
      return source?.bankId === bankId ? [id, source.questionId] : [id];
    }));
    const ids = [...new Set(questionIds)];
    const mapped = this.testIdsFor(ids);
    const added = mapped.filter((id, i) => !present.has(id) && !present.has(ids[i]));
    if (added.length) this.config.selectedIds = [...this.config.selectedIds, ...added];
    if (own.length) this.config.ownQuestions = TestEditor.ownFor(this.config.selectedIds, [...(this.config.ownQuestions ?? []), ...own]);
    this.checkpoint();
    return { added: added.length, existing: ids.length - added.length };
  }

  /** The test's own questions still in use, one copy of each. */
  private static ownFor(selectedIds: string[], own: Question[]): Question[] | undefined {
    const used = new Set(selectedIds);
    const kept = [...firstById(copy(own)).values()].filter(q => used.has(q.id));
    return kept.length ? kept : undefined;
  }

  /** Whether an unnamed working test holds anything a fresh default does not. */
  static hasContent(config: TestConfig | undefined, defaults: TestConfig) {
    // A session Build never opened still holds the plain default, without the class title.
    const plain = (c: TestConfig, keepTitle = true) => JSON.stringify({ ...c, date: '', title: keepTitle ? c.title : '' });
    return !!config && plain(config) !== plain(defaults) && plain(config, false) !== plain(defaultTestConfig(), false);
  }

  /**
   * Start an unnamed test holding these bank questions. Nothing is discarded:
   * a named test is flushed first, and an unnamed working test with content
   * (current or stashed) is kept in the library under `keepName`.
   */
  async startNewTestWith(questionIds: string[], defaults: TestConfig, keepName: string, own: Question[] = []): Promise<{ kept: string | null } | null> {
    if (this.transitioning) return null;
    this.transitioning = true;
    try {
      if (!await this.flush()) return null;
      const unnamed = this.testId ? this.unnamedDraft : this.config;
      let kept: string | null = null;
      if (TestEditor.hasContent(unnamed, defaults)) {
        const config = copy(unnamed!);
        const content = await this.capture(config, null, keepName);
        if (!this.inOriginalBank()) throw new Error('The bank changed before the new test was started.');
        kept = testLibrary.saveAs(keepName, null, null, null, config, content).name;
      }
      const selectedIds = [...new Set(this.testIdsFor(questionIds))];
      this.config = { ...copy(defaults), selectedIds, ownQuestions: TestEditor.ownFor(selectedIds, own) };
      this.testId = null;
      this.baseline = null;
      this.unnamedDraft = undefined;
      this.error = '';
      this.checkpoint();
      return this.recoveryError ? null : { kept };
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
      return null;
    } finally { this.transitioning = false; }
  }

  /** Whether `testId` (null for the unsaved test) is open and holds this question. */
  holds(testId: string | null, questionId: string): boolean {
    return this.testId === testId && this.config.selectedIds.includes(questionId);
  }

  /**
   * Give the test its own copy of a question (edited for this test only). The copy keeps the
   * question's id, so it takes the place of the bank's version in this test alone.
   */
  setOwnQuestion(question: Question, keepChoiceOrder = false): boolean {
    if (this.transitioning || !this.config.selectedIds.includes(question.id)) return false;
    // A shuffled order holds the old choice text and solution.
    if (!keepChoiceOrder && this.config.choiceOverrides[question.id]) {
      const { [question.id]: _, ...rest } = this.config.choiceOverrides;
      this.config.choiceOverrides = rest;
    }
    this.config.ownQuestions = TestEditor.ownFor(this.config.selectedIds, [question, ...(this.config.ownQuestions ?? [])]);
    this.checkpoint();
    return true;
  }

  /**
   * Change what one question is worth in a saved test (from the Gradebook). The test gets its
   * own copy of the question, as with Save for this test. Returns the problem, or '' when done.
   */
  setSavedTestQuestionPoints(testId: string, questionId: string, points: number): string {
    const entry = testLibrary.get(testId);
    if (!entry) return 'The saved test no longer exists, so only the Gradebook was changed.';
    const open = this.testId === testId;
    const config = open ? this.config : entry.config;
    const question = [...(config.ownQuestions ?? []), ...(entry.questionSnapshots ?? [])].find(q => q.id === questionId);
    if (!question || !config.selectedIds.includes(questionId)) return 'The saved test no longer has this question, so only the Gradebook was changed.';
    const changed = { ...copy(question), points, updatedAt: Date.now() };
    if (open) return this.setOwnQuestion(changed, true) ? '' : 'Build is busy saving the test, so only the Gradebook was changed.';
    const next = { ...copy(entry.config), ownQuestions: TestEditor.ownFor(entry.config.selectedIds, [changed, ...(entry.config.ownQuestions ?? [])]) };
    testLibrary.update(testId, next, {
      questionSnapshots: entry.questionSnapshots?.map(q => (q.id === questionId ? changed : q)),
      narrativeSnapshots: entry.narrativeSnapshots,
    });
    return '';
  }

  /**
   * Put generated questions in place of one question, keeping its position, bonus mark,
   * answer space and layout. Questions the test already has are not added twice.
   */
  replaceQuestion(questionId: string, questions: Question[]): boolean {
    const index = this.config.selectedIds.indexOf(questionId);
    if (this.transitioning || index === -1 || !questions.length) return false;
    const others = new Set(this.config.selectedIds.filter(id => id !== questionId));
    const ids = [...new Set(questions.map(q => q.id))].filter(id => !others.has(id));
    const c = this.config;
    const selectedIds = [...c.selectedIds.slice(0, index), ...ids, ...c.selectedIds.slice(index + 1)];
    const move = <T>(record: Record<string, T>, to: string | undefined) => {
      const { [questionId]: value, ...rest } = record;
      return value === undefined || !to ? rest : { ...rest, [to]: value };
    };
    c.answerSpaceOverrides = move(c.answerSpaceOverrides, ids[0]);
    c.pageBreakAfter = move(c.pageBreakAfter, ids.at(-1));
    const { [questionId]: _, ...choiceOverrides } = c.choiceOverrides;
    c.choiceOverrides = choiceOverrides;
    c.bonusQuestionIds = c.bonusQuestionIds.flatMap(id => id === questionId ? ids.slice(0, 1) : [id]);
    c.ownQuestions = TestEditor.ownFor(selectedIds, [...questions, ...(c.ownQuestions ?? [])]);
    c.selectedIds = selectedIds;
    this.checkpoint();
    return true;
  }

  renameImageReferences(rewrite: <T>(value: T) => T) {
    this.config = rewrite(this.config);
    if (this.baseline) this.baseline = JSON.stringify(rewrite(JSON.parse(this.baseline)));
    if (this.unnamedDraft) this.unnamedDraft = rewrite(this.unnamedDraft);
    this.checkpoint();
  }

  delete(id: string) {
    testLibrary.delete(id);
    if (id === this.testId) {
      this.testId = null;
      this.baseline = null;
      this.error = '';
      this.checkpoint();
    }
  }
}

export const testEditor = new TestEditor();
bankWorkspaces.participate({
  async beforeLeave() {
    if (!await testEditor.flush()) throw new Error(testEditor.recoveryError || testEditor.error || 'The test could not be saved.');
  },
  apply: (bankId) => testEditor.enterBank(bankId),
});
