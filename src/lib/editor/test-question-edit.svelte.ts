// Editing a question that is in a test. Build's ✎ opens the question in the Editor with
// three ways out: keep the change in this test only, also overwrite the question in the
// bank it came from, or leave without saving. Generated questions have no bank; they can
// instead go back to Generate with their settings, and the new questions take their place.
import { bank } from '../bank.svelte';
import { bankWorkspaces } from '../bank-workspaces.svelte';
import { localWorkspace } from '../local-workspace.svelte';
import { testEditor } from '../test-editor.svelte';
import { testLibrary } from '../test-library.svelte';
import { workspaceCatalog } from '../workspace-catalog.svelte';
import type { GeneratorItem, Question } from '../types';
import { editor } from './editor-state.svelte';
import { draftContent, editDraft, newDraft, validateDraft, type EditorDraft } from './editor-model';
import { activeHistoryGroup, JsonHistory } from '../document-history.svelte';

const KEY = 'tg-test-question-edit-v1';
export const TEST_QUESTION_ROUTE = 'test-question';
export const HOMEMADE_BANK = 'Homemade';
const homemadeBank = () => bankWorkspaces.banks.find(entry => entry.name.trim().toLowerCase() === HOMEMADE_BANK.toLowerCase());

/** The bank question a test question was taken from. */
export interface QuestionOrigin { bankId: string; bankName: string; questionId: string }

export interface TestQuestionEdit {
  /** The saved test, or null for the unsaved test in Build. */
  testId: string | null;
  testName: string;
  questionId: string;
  /** The question's number in the test, for the heading. */
  number: number;
  /** `draft.original` is the test's copy as it was when editing began. */
  draft: EditorDraft;
  origin: QuestionOrigin | null;
  newQuestion?: {
    bankId: string;
    scopeId?: string;
    bankTargetId: string;
    savedBankName?: string;
  };
}

/** Generate is replacing one generated question in a test. */
export interface GeneratorReplace { testId: string | null; testName: string; questionId: string; item: GeneratorItem }

/** Where a test question came from: a workspace bank (open or not) or the open bank. */
export function questionOrigin(testQuestionId: string): QuestionOrigin | null {
  const source = workspaceCatalog.sources[testQuestionId];
  if (source) return { bankId: source.bankId, bankName: source.bankName, questionId: source.questionId };
  if (bank.questions.some(q => q.id === testQuestionId)) {
    return { bankId: bankWorkspaces.activeBankId, bankName: bankWorkspaces.activeBank.name, questionId: testQuestionId };
  }
  return null;
}

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * A test's frozen copy renames its pictures `testasset-<hash>-<end of the name>`. Put the bank
 * question's own picture names back, so saving to the bank does not repoint its pictures.
 */
export function restorePictureNames<T>(value: T, names: string[]): T {
  let json = JSON.stringify(value);
  for (const name of names) {
    json = json.replace(new RegExp(`testasset-[A-Za-z0-9-]*?-${escapeRegex(name.slice(-35))}(?![A-Za-z0-9_-])`, 'g'), name);
  }
  return JSON.parse(json);
}

/** The fields to write over the bank original. Unchanged narratives keep the original's link. */
export function bankFields(edited: Question, testCopy: Question, current: Question): Partial<Omit<Question, 'id' | 'createdAt'>> {
  const { id: _id, createdAt: _created, updatedAt: _updated, generatorItem: _item, ...fields } = edited;
  const restored = restorePictureNames(fields, current.images ?? []);
  if ((edited.narrative ?? '') === (testCopy.narrative ?? '')) {
    restored.narrative = current.narrative;
    restored.narrativeId = current.narrativeId;
  }
  return restored;
}

export const sameTestChoices = (a: Pick<Question, 'choices' | 'solution'>, b: Pick<Question, 'choices' | 'solution'>) =>
  JSON.stringify(Object.values(a.choices ?? {}).sort()) === JSON.stringify(Object.values(b.choices ?? {}).sort()) && (a.solution ?? '') === (b.solution ?? '');

function load(): TestQuestionEdit | null {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return (stored?.draft?.original || (stored?.draft?.fields && stored?.newQuestion))
      && typeof stored.questionId === 'string' ? stored : null;
  } catch { return null; }
}

class TestQuestionEditor {
  session = $state<TestQuestionEdit | null>(load());
  replace = $state<GeneratorReplace | null>(null);
  error = $state('');
  storageError = $state('');
  busy = $state(false);
  addedQuestion = $state<{ id: string; bankName?: string } | null>(null);
  private history = new JsonHistory();

  constructor() {
    this.history.reset(this.session ? JSON.stringify(this.session.draft) : 'null');
  }

  private testName() {
    return testEditor.testId ? testLibrary.get(testEditor.testId)?.name ?? 'Saved test' : 'Unsaved test';
  }

  /** Open a question from the test open in Build. */
  start(question: Question, number: number) {
    if (!this.canStart()) return;
    this.open({ testId: testEditor.testId, testName: this.testName(), questionId: question.id, number, draft: editDraft(question), origin: questionOrigin(question.id) });
  }

  startNew(): boolean {
    if (this.busy || bankWorkspaces.switching || testEditor.transitioning) return false;
    const current = this.session;
    if (current?.newQuestion && this.inTargetTest(current)) {
      window.location.hash = `#/editor/${TEST_QUESTION_ROUTE}`;
      return true;
    }
    if (!this.canStart()) return false;
    const draft = newDraft(editor.session.defaults);
    draft.baseline = draftContent(draft);
    this.open({
      testId: testEditor.testId,
      testName: testEditor.testId ? this.testName() : testEditor.config.subtitle.trim() || testEditor.config.title.trim() || 'Unsaved test',
      questionId: draft.id, number: testEditor.config.selectedIds.length + 1, draft, origin: null,
      newQuestion: {
        bankId: bankWorkspaces.activeBankId,
        scopeId: testEditor.testId === null ? testEditor.identifyScope() : undefined,
        bankTargetId: homemadeBank()?.id ?? '',
      },
    });
    return true;
  }

  private canStart(): boolean {
    return !this.busy && (!this.session?.newQuestion || !this.changed
      || window.confirm('Discard the unfinished new test question and open another question?'));
  }

  private open(session: TestQuestionEdit) {
    this.session = session;
    this.error = '';
    this.history.reset(JSON.stringify(this.session.draft));
    this.persist();
    window.location.hash = `#/editor/${TEST_QUESTION_ROUTE}`;
  }

  /** Keep the open edit across reloads. */
  persist() {
    try {
      if (this.session) {
        this.history.observe(JSON.stringify(this.session.draft), activeHistoryGroup());
        localStorage.setItem(KEY, JSON.stringify(this.session));
      }
      else localStorage.removeItem(KEY);
      this.storageError = '';
    } catch {
      this.storageError = this.session?.newQuestion ? 'This question draft could not be saved in this browser. Keep this page open until you can save.' : '';
    }
  }

  get changed() {
    const draft = this.session?.draft;
    return !!draft && draftContent(draft) !== draft.baseline;
  }
  get activeNewDraft() {
    const session = this.session;
    return session?.newQuestion?.bankId === bankWorkspaces.activeBankId ? session.draft : undefined;
  }
  get canUndo(): boolean { return this.history.canUndo; }
  get canRedo(): boolean { return this.history.canRedo; }
  private stepHistory(direction: 'undo' | 'redo'): boolean {
    if (!this.session) return false;
    const restored = this.history[direction](JSON.stringify(this.session.draft));
    if (!restored) return false;
    this.session.draft = JSON.parse(restored) as EditorDraft;
    this.persist();
    return true;
  }
  undo(): boolean { return this.stepHistory('undo'); }
  redo(): boolean { return this.stepHistory('redo'); }

  /** Can the edit be saved? Returns the problem, or '' when it can. */
  private problem(session: TestQuestionEdit): string {
    if (!this.inTargetTest(session)) {
      if (session.newQuestion) return `Open “${session.testName}” in its original Build tab and bank, then return to this question to save it.`;
      return `“${session.testName}” is not open in Build, or no longer has this question. Open it in Build and try again, or Cancel.`;
    }
    return validateDraft(session.draft).join('\n');
  }

  private inTargetTest(session: TestQuestionEdit): boolean {
    const pending = session.newQuestion;
    if (!pending) return testEditor.holds(session.testId, session.questionId);
    return !bankWorkspaces.switching && !testEditor.transitioning && pending.bankId === bankWorkspaces.activeBankId
      && testEditor.testId === session.testId
      && (session.testId !== null || (pending.scopeId !== undefined && pending.scopeId === testEditor.scopeId));
  }

  private edited(session: TestQuestionEdit): Question {
    const original = session.draft.original;
    const data = editor.saveData(session.draft);
    if (session.newQuestion) delete data.narrativeId;
    return { ...original, ...data, id: session.questionId, createdAt: original?.createdAt ?? Date.now(), updatedAt: original ? Date.now() : undefined };
  }

  private finish() {
    this.session = null;
    this.error = '';
    this.history.reset('null');
    this.persist();
    window.location.hash = '#/build';
  }

  /** Save the change in this test only. */
  saveForTest(): boolean {
    const session = this.session;
    if (!session || this.busy) return false;
    this.error = this.problem(session);
    if (this.error) return false;
    if (session.newQuestion) return this.appendNewQuestion(session);
    const question = this.edited(session);
    if (!testEditor.setOwnQuestion(question, sameTestChoices(question, session.draft.original!))) {
      this.error = 'Build is busy saving a test. Try again in a moment.';
      return false;
    }
    this.finish();
    return true;
  }

  private appendNewQuestion(session: TestQuestionEdit): boolean {
    if (!this.inTargetTest(session)) {
      this.error = this.problem(session);
      return false;
    }
    const question = this.edited(session);
    // A retry after a recovery write failed updates the same test copy.
    const added = testEditor.holds(session.testId, question.id)
      ? testEditor.setOwnQuestion(question)
      : Boolean(testEditor.addQuestions([question.id], [question])?.added);
    if (!added || testEditor.recoveryError) {
      this.error = testEditor.recoveryError || 'Build is busy saving a test. Try again in a moment.';
      return false;
    }
    this.addedQuestion = { id: question.id, bankName: session.newQuestion?.savedBankName };
    this.finish();
    return true;
  }

  async saveNewToTestAndBank(): Promise<boolean> {
    const session = this.session;
    const pending = session?.newQuestion;
    if (!session || !pending || this.busy) return false;
    this.error = this.problem(session);
    if (this.error) return false;
    if (pending.savedBankName) return this.appendNewQuestion(session);
    this.busy = true;
    try {
      const destination = pending.bankTargetId
        ? bankWorkspaces.banks.find(entry => entry.id === pending.bankTargetId)
        : homemadeBank() ?? bankWorkspaces.registerBank(HOMEMADE_BANK);
      if (!destination) throw new Error('That bank is no longer available. Choose another bank or save for this test.');
      pending.bankTargetId = destination.id;
      await editor.saveCopyToBank(session.draft, destination.id);
      pending.savedBankName = destination.name;
      this.persist();
      if (destination.id !== bankWorkspaces.activeBankId) {
        void localWorkspace.saveNow().catch(() => { /* Workspace sync reports its own status. */ });
      }
      return this.appendNewQuestion(session);
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
      return false;
    } finally { this.busy = false; }
  }

  /** Overwrite the bank original with the change, wherever it lives, and update this test too. */
  async saveToBank(): Promise<boolean> {
    const session = this.session;
    const origin = session?.origin;
    if (!session || !origin || this.busy) return false;
    this.error = this.problem(session);
    if (this.error) return false;
    const question = this.edited(session);
    const testCopy = session.draft.original!;
    this.busy = true;
    try {
      if (origin.bankId === bankWorkspaces.activeBankId) {
        const current = bank.questions.find(q => q.id === origin.questionId);
        if (!current) throw new Error(`The original question is no longer in “${origin.bankName}”. Save for this test instead.`);
        bank.update(origin.questionId, bankFields(question, testCopy, current));
      } else {
        await bankWorkspaces.updateDormantQuestion(origin.bankId, origin.questionId, current => bankFields(question, testCopy, current));
        void localWorkspace.saveNow().catch(() => { /* The workspace shows its own save problems and retries. */ });
      }
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
      return false;
    } finally { this.busy = false; }
    // The test keeps the edited copy, so it changes now even while the bank's folder copy catches up.
    if (!testEditor.setOwnQuestion(question, sameTestChoices(question, testCopy))) {
      this.error = `Saved in “${origin.bankName}”, but this test could not be updated because Build is busy. Try Save for this test.`;
      return false;
    }
    this.finish();
    return true;
  }

  /** Leave without saving. */
  cancel() { this.finish(); }

  /** Reopen a generated question in Generate with its settings. */
  editInGenerator(): boolean {
    const session = this.session;
    const item = session?.draft.original?.generatorItem;
    if (!session || !item) return false;
    this.replace = { testId: session.testId, testName: session.testName, questionId: session.questionId, item };
    this.session = null;
    this.error = '';
    this.persist();
    window.location.hash = '#/generate';
    return true;
  }

  /** Put the questions made in Generate in place of the generated question. Returns the problem, or ''. */
  finishReplace(questions: Question[]): string {
    const replace = this.replace;
    if (!replace) return '';
    if (!testEditor.holds(replace.testId, replace.questionId)) {
      return `“${replace.testName}” is not open in Build, or no longer has this question. Open it in Build and try again, or Cancel.`;
    }
    if (!testEditor.replaceQuestion(replace.questionId, questions)) return 'Build is busy saving a test. Try again in a moment.';
    this.replace = null;
    window.location.hash = '#/build';
    return '';
  }

  cancelReplace() {
    this.replace = null;
    window.location.hash = '#/build';
  }
}

export const testQuestionEditor = new TestQuestionEditor();
