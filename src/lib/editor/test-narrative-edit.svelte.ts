import { testEditor } from '../test-editor.svelte';
import { testLibrary } from '../test-library.svelte';
import type { TestNarrative } from '../types';
import { activeHistoryGroup, JsonHistory } from '../document-history.svelte';

export const TEST_NARRATIVE_ROUTE = 'test-narrative';
const KEY = 'tg-test-narrative-edit-v1';
interface NarrativeEdit {
  testId: string | null;
  testName: string;
  narrativeId: string;
  body: string;
  baseline: string;
  newlyAdded: boolean;
}
function load(): NarrativeEdit | null {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return value && typeof value.narrativeId === 'string' && typeof value.body === 'string' ? value : null;
  } catch { return null; }
}

class TestNarrativeEditor {
  session = $state<NarrativeEdit | null>(load());
  error = $state('');
  private history = new JsonHistory();

  constructor() { this.history.reset(JSON.stringify(this.session?.body ?? null)); }

  start(narrative: TestNarrative, newlyAdded = false) {
    this.session = {
      testId: testEditor.testId,
      testName: testEditor.testId ? testLibrary.get(testEditor.testId)?.name ?? 'Saved test' : 'Unsaved test',
      narrativeId: narrative.id, body: narrative.body, baseline: narrative.body, newlyAdded,
    };
    this.error = '';
    this.history.reset(JSON.stringify(this.session.body));
    testEditor.checkpoint();
    this.persist();
    window.location.hash = `#/editor/${TEST_NARRATIVE_ROUTE}`;
  }

  persist() {
    try {
      if (this.session) {
        this.history.observe(JSON.stringify(this.session.body), activeHistoryGroup());
        localStorage.setItem(KEY, JSON.stringify(this.session));
      }
      else localStorage.removeItem(KEY);
    } catch { /* The editor retains the in-memory draft. */ }
  }

  get changed() { return !!this.session && this.session.body !== this.session.baseline; }
  get canUndo(): boolean { return this.history.canUndo; }
  get canRedo(): boolean { return this.history.canRedo; }
  private stepHistory(direction: 'undo' | 'redo'): boolean {
    if (!this.session) return false;
    const restored = this.history[direction](JSON.stringify(this.session.body));
    if (!restored) return false;
    this.session.body = JSON.parse(restored) as string;
    this.persist();
    return true;
  }
  undo(): boolean { return this.stepHistory('undo'); }
  redo(): boolean { return this.stepHistory('redo'); }

  save(): boolean {
    const session = this.session;
    if (!session) return false;
    if (testEditor.transitioning || testEditor.testId !== session.testId ||
      !testEditor.config.customNarratives?.some(n => n.id === session.narrativeId)) {
      this.error = `“${session.testName}” is not open in Build, or no longer has this narrative. Open it in Build and try again.`;
      return false;
    }
    if (!session.body.trim()) { this.error = 'Write some narrative text before saving.'; return false; }
    testEditor.config.customNarratives = testEditor.config.customNarratives.map(n =>
      n.id === session.narrativeId ? { ...n, body: session.body } : n);
    testEditor.checkpoint();
    this.finish();
    return true;
  }

  cancel() {
    const session = this.session;
    if (session?.newlyAdded && testEditor.testId === session.testId) {
      testEditor.config.customNarratives = testEditor.config.customNarratives?.filter(n => n.id !== session.narrativeId);
      testEditor.checkpoint();
    }
    this.finish();
  }

  private finish() {
    this.session = null;
    this.error = '';
    this.history.reset('null');
    this.persist();
    window.location.hash = '#/build';
  }
}

export const testNarrativeEditor = new TestNarrativeEditor();
