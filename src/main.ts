import './app.css';
import { applyPendingRestore, describeBackup } from './lib/browser-backup';

// A restore is written before the app is imported: its stores read browser storage as they load.
void (async () => {
  const restored = await applyPendingRestore().catch((error) => {
    alert(`The backup could not be restored: ${error instanceof Error ? error.message : String(error)}\nPart of it may have been written. Choose Restore again with the same file, or with the backup of this browser that was downloaded before restoring.`);
    return null;
  });
  const [{ mount }, { default: App }] = await Promise.all([import('svelte'), import('./App.svelte')]);

  mount(App, { target: document.getElementById('app')! });

  if (restored) {
    const { appState } = await import('./lib/app-state.svelte');
    const from = new Date(restored.exportedAt).toLocaleString();
    appState.showNotice(`Restored the backup from ${from}: ${describeBackup(restored.summary)}.${restored.skipped.length ? ` Not restored: ${restored.skipped.join(', ')}.` : ''}`, 20_000);
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const splash = document.getElementById('testgen-splash');
      if (!splash) return;
      splash.classList.add('testgen-splash-hiding');
      window.setTimeout(() => splash.remove(), 220);
    });
  });
})();
