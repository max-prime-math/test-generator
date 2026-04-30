const DEMO_MODE_KEY = 'math-test-demo-mode-v1';

class AppState {
  lastClassId = $state('');
  demoMode = $state(localStorage.getItem(DEMO_MODE_KEY) === 'true');

  setDemoMode(enabled: boolean) {
    this.demoMode = enabled;
    localStorage.setItem(DEMO_MODE_KEY, String(enabled));
  }
}

export const appState = new AppState();
