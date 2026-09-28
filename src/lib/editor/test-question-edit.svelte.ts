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
import { draftContent, editDraft, validateDraft, type EditorDraft } from './editor-model';

const KEY = 'tg-test-question-edit-v1';
export const TEST_QUESTION_ROUTE = 'test-question';

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

const sameChoices = (a: Question, b: Question) =>
  JSON.stringify(Object.values(a.choices ?? {}).sort()) === JSON.stringify(Object.values(b.choices ?? {}).sort()) && (a.solution ?? '') === (b.solution ?? '');

function load(): TestQuestionEdit | null {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return stored?.draft?.original && typeof stored.questionId === 'string' ? stored : null;
  } catch { return null; }
}

class TestQuestionEditor {
  session = $state<TestQuestionEdit | null>(load());
  replace = $state<GeneratorReplace | null>(null);
  error = $state('');
  busy = $state(false);

  private testName() {
    return testEditor.testId ? testLibrary.get(testEditor.testId)?.name ?? 'Saved test' : 'Unsaved test';
  }

  /** Open a question from the test open in Build. */
  start(question: Question, number: number) {
    this.session = { testId: testEditor.testId, testName: this.testName(), questionId: question.id, number, draft: editDraft(question), origin: questionOrigin(question.id) };
    this.error = '';
    this.persist();
    window.location.hash = `#/editor/${TEST_QUESTION_ROUTE}`;
  }

  /** Keep the open edit across reloads. */
  persist() {
    try {
      if (this.session) localStorage.setItem(KEY, JSON.stringify(this.session));
      else localStorage.removeItem(KEY);
    } catch { /* The edit still works in this tab. */ }
  }

  get changed() {
    const draft = this.session?.draft;
    return !!draft && draftContent(draft) !== draft.baseline;
  }

  /** Can the edit be saved? Returns the problem, or '' when it can. */
  private problem(session: TestQuestionEdit): string {
    if (!testEditor.holds(session.testId, session.questionId)) {
      return `“${session.testName}” is not open in Build, or no longer has this question. Open it in Build and try again, or Cancel.`;
    }
    return validateDraft(session.draft).join('\n');
  }

  private edited(session: TestQuestionEdit): Question {
    const original = session.draft.original!;
    return { ...original, ...editor.saveData(session.draft), id: session.questionId, createdAt: original.createdAt, updatedAt: Date.now() };
  }

  private finish() {
    this.session = null;
    this.error = '';
    this.persist();
    window.location.hash = '#/build';
  }

  /** Save the change in this test only. */
  saveForTest(): boolean {
    const session = this.session;
    if (!session || this.busy) return false;
    this.error = this.problem(session);
    if (this.error) return false;
    const question = this.edited(session);
    if (!testEditor.setOwnQuestion(question, sameChoices(question, session.draft.original!))) {
      this.error = 'Build is busy saving a test. Try again in a moment.';
      return false;
    }
    this.finish();
    return true;
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
    if (!testEditor.setOwnQuestion(question, sameChoices(question, testCopy))) {
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
