import { createId } from './id';
import { appSettings } from './app-settings.svelte';
import { testEditor, type TestEditorSession } from './test-editor.svelte';
import { testLibrary } from './test-library.svelte';
import type { TestConfig } from './types';

const STORAGE_KEY = 'tg-test-tabs-v1';
const MAX_CLOSED_TABS = 10;
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));

export interface TestTab {
  id: string;
  session: TestEditorSession;
}

interface StoredTabs {
  version: 1;
  tabs: TestTab[];
  activeTabId: string;
  closedTabs: TestTab[];
}

function validSession(value: unknown): value is TestEditorSession {
  if (!value || typeof value !== 'object') return false;
  const session = value as Partial<TestEditorSession>;
  return !!session.config && typeof session.config === 'object'
    && (typeof session.testId === 'string' || session.testId === null)
    && (typeof session.savedConfig === 'string' || session.savedConfig === null);
}

function validTab(value: unknown): value is TestTab {
  return !!value && typeof value === 'object'
    && typeof (value as TestTab).id === 'string'
    && validSession((value as TestTab).session);
}

class TestTabs {
  tabs = $state<TestTab[]>([]);
  activeTabId = $state('');
  closedTabs = $state<TestTab[]>([]);
  switching = $state(false);

  constructor() {
    this.loadOrCreate();
    testEditor.onSessionCheckpoint = session => this.captureActive(session);
    testEditor.onSessionReset = () => this.loadOrCreate();
  }

  get activeTab(): TestTab | undefined {
    return this.tabs.find(tab => tab.id === this.activeTabId);
  }

  title(tab: TestTab): string {
    if (tab.session.testId) return testLibrary.get(tab.session.testId)?.name ?? 'Recovered test';
    return tab.session.config.subtitle.trim() || tab.session.config.title.trim() || 'Untitled test';
  }

  dirty(tab: TestTab): boolean {
    if (!tab.session.testId) return false;
    return JSON.stringify(tab.session.config) !== tab.session.savedConfig;
  }

  private fresh(session: TestEditorSession): TestTab {
    return { id: createId('test-tab'), session: copy(session) };
  }

  private load(): StoredTabs | null {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<StoredTabs> | null;
      const tabs = value?.tabs?.filter(validTab) ?? [];
      if (value?.version !== 1 || tabs.length === 0) return null;
      return {
        version: 1,
        tabs: copy(tabs),
        activeTabId: tabs.some(tab => tab.id === value.activeTabId) ? value.activeTabId! : tabs[0].id,
        closedTabs: copy((value.closedTabs ?? []).filter(validTab).slice(0, MAX_CLOSED_TABS)),
      };
    } catch {
      return null;
    }
  }

  private loadOrCreate(): void {
    const stored = this.load();
    if (stored) {
      this.tabs = stored.tabs;
      this.activeTabId = stored.activeTabId;
      this.closedTabs = stored.closedTabs;
      const active = this.activeTab;
      if (active && appSettings.testTabsEnabled) testEditor.restoreSession(active.session);
      else if (active) {
        active.session = testEditor.exportSession();
        this.tabs = [...this.tabs];
        this.save();
      }
    } else {
      const tab = this.fresh(testEditor.exportSession());
      this.tabs = [tab];
      this.activeTabId = tab.id;
      this.closedTabs = [];
      this.save();
    }
  }

  private save(): void {
    try {
      const value: StoredTabs = { version: 1, tabs: copy(this.tabs), activeTabId: this.activeTabId, closedTabs: copy(this.closedTabs) };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    } catch {
      // The editor's ordinary recovery draft remains the authoritative fallback.
    }
  }

  private captureActive(session: TestEditorSession): void {
    const index = this.tabs.findIndex(tab => tab.id === this.activeTabId);
    if (index === -1) return;
    this.tabs[index] = { ...this.tabs[index], session: copy(session) };
    this.tabs = [...this.tabs];
    this.save();
  }

  private async replaceActive(target: TestTab, add = false): Promise<boolean> {
    if (this.switching || target.id === this.activeTabId) return target.id === this.activeTabId;
    this.switching = true;
    try {
      const outgoing = await testEditor.swapSession(target.session);
      if (!outgoing) return false;
      this.captureActive(outgoing);
      if (add) this.tabs = [...this.tabs, target];
      this.activeTabId = target.id;
      testEditor.checkpoint();
      this.save();
      return true;
    } finally { this.switching = false; }
  }

  async activate(id: string): Promise<boolean> {
    const target = this.tabs.find(tab => tab.id === id);
    return target ? this.replaceActive(target) : false;
  }

  async openSaved(testId: string): Promise<boolean> {
    const existing = this.tabs.find(tab => tab.session.testId === testId);
    if (existing) return this.activate(existing.id);
    const entry = testLibrary.get(testId);
    if (!entry) return false;
    return this.replaceActive(this.fresh({
      config: copy(entry.config),
      testId: entry.id,
      savedConfig: JSON.stringify(entry.config),
    }), true);
  }

  async newBlank(config: TestConfig): Promise<boolean> {
    return this.replaceActive(this.fresh({ config: copy(config), testId: null, savedConfig: null }), true);
  }

  private rememberClosed(tab: TestTab): void {
    this.closedTabs = [copy(tab), ...this.closedTabs.filter(item => item.id !== tab.id)].slice(0, MAX_CLOSED_TABS);
  }

  async close(id = this.activeTabId, blank?: TestConfig): Promise<boolean> {
    const closing = this.tabs.find(tab => tab.id === id);
    if (!closing || this.switching) return false;
    if (id !== this.activeTabId) {
      this.tabs = this.tabs.filter(tab => tab.id !== id);
      this.rememberClosed(closing);
      this.save();
      return true;
    }

    const index = this.tabs.findIndex(tab => tab.id === id);
    const remaining = this.tabs.filter(tab => tab.id !== id);
    const target = remaining[Math.min(index, remaining.length - 1)] ?? this.fresh({
      config: copy(blank ?? closing.session.config),
      testId: null,
      savedConfig: null,
    });
    this.switching = true;
    try {
      const outgoing = await testEditor.swapSession(target.session);
      if (!outgoing) return false;
      const closed = { ...closing, session: outgoing };
      this.tabs = remaining.length ? remaining : [target];
      this.activeTabId = target.id;
      this.rememberClosed(closed);
      testEditor.checkpoint();
      this.save();
      return true;
    } finally { this.switching = false; }
  }

  async reopenClosed(): Promise<boolean> {
    const reopening = this.closedTabs[0];
    if (!reopening) return false;
    const duplicate = reopening.session.testId
      ? this.tabs.find(tab => tab.session.testId === reopening.session.testId)
      : undefined;
    const success = duplicate ? await this.activate(duplicate.id) : await this.replaceActive(reopening, true);
    if (success) {
      this.closedTabs = this.closedTabs.filter(tab => tab.id !== reopening.id);
      this.save();
    }
    return success;
  }

  /** Bring edits made while tabs were disabled back into the visible tab set. */
  reconcileCurrent(): void {
    const session = testEditor.exportSession();
    this.captureActive(session);
    if (session.testId) {
      this.tabs = this.tabs.filter(tab => tab.id === this.activeTabId || tab.session.testId !== session.testId);
    }
    this.save();
  }
}

export const testTabs = new TestTabs();
