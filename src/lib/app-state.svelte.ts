const DEMO_MODE_KEY = 'math-test-demo-mode-v1';
const LAST_CLASS_KEY = 'math-test-last-class-id-v1';

class AppState {
  lastClassId = $state(localStorage.getItem(LAST_CLASS_KEY) ?? '');
  demoMode = $state(localStorage.getItem(DEMO_MODE_KEY) === 'true');

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
