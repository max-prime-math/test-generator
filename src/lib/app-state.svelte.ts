import { bankWorkspaces } from './bank-workspaces.svelte';
const DEMO_MODE_KEY = 'math-test-demo-mode-v1';
const LAST_CLASS_KEY = 'math-test-last-class-id-v1';

class AppState {
  lastClassId = $state(localStorage.getItem(LAST_CLASS_KEY) ?? '');
  demoMode = $state(localStorage.getItem(DEMO_MODE_KEY) === 'true');
  /** A short message shown app-wide, e.g. after switching tabs so the result of an action isn't lost. */
  notice = $state('');
  #noticeTimer: ReturnType<typeof setTimeout> | undefined;

  showNotice(text: string, ms = 5000) {
    clearTimeout(this.#noticeTimer);
    this.notice = text;
    this.#noticeTimer = setTimeout(() => (this.notice = ''), ms);
  }

  setLastClassId(id: string) {
    this.lastClassId = id;
    localStorage.setItem(LAST_CLASS_KEY, id);
  }

  setDemoMode(enabled: boolean) {
    this.demoMode = enabled;
    localStorage.setItem(DEMO_MODE_KEY, String(enabled));
  }
}

export const appState = new AppState();
bankWorkspaces.participate({ apply: () => { appState.lastClassId = localStorage.getItem(LAST_CLASS_KEY) ?? ''; } });
