<script lang="ts">
  import BankView from './components/BankView.svelte';
  import TestView from './components/TestView.svelte';
  import HelpModal from './components/HelpModal.svelte';
  import SaveAsModal from './components/SaveAsModal.svelte';
  import Tutorial from './components/Tutorial.svelte';
  import GoogleDriveConnectModal from './components/GoogleDriveConnectModal.svelte';
  import GitSyncPanel from './components/GitSyncPanel.svelte';
  import SettingsModal from './components/SettingsModal.svelte';
  import { saveDialogStore } from './lib/save-dialog-store.svelte';
  import { APP_VERSION, BUILD_NUMBER } from './lib/version';

  const TUTORIAL_DONE_KEY = 'tg-tutorial-done-v1';

  type Tab = 'bank' | 'build';
  type SettingsTab = 'github' | 'theme' | 'builder' | 'more';

  function getTabFromHash(): Tab {
    const hash = window.location.hash.slice(1).toLowerCase();
    if (hash === '/build' || hash === 'build') return 'build';
    return 'bank';
  }

  let activeTab = $state<Tab>(getTabFromHash());
  let helpOpen = $state(false);
  let tutorialOpen = $state(!localStorage.getItem(TUTORIAL_DONE_KEY));
  let gitSyncOpen = $state(false);
  let googleDriveOpen = $state(false);
  let settingsOpen = $state(false);
  let settingsInitialTab = $state<SettingsTab>('github');

  $effect(() => {
    window.location.hash = activeTab === 'build' ? '/build' : '';
  });

  function handleHashChange() {
    activeTab = getTabFromHash();
  }

  $effect(() => {
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  });

  type Theme = 'auto' | 'light' | 'dark'
    | 'catppuccin-latte' | 'catppuccin-frappe' | 'catppuccin-macchiato' | 'catppuccin-mocha'
    | 'gruvbox-dark' | 'gruvbox-light'
    | 'nord' | 'dracula' | 'one-dark'
    | 'solarized-light' | 'solarized-dark';

  interface ThemeOption {
    id: Theme;
    label: string;
    bg: string;
    accent: string;
    group: 'Built-in' | 'Catppuccin' | 'Gruvbox' | 'Community';
  }

  const THEMES: ThemeOption[] = [
    { id: 'auto', label: 'System', bg: '#f5f5f7', accent: '#2563eb', group: 'Built-in' },
    { id: 'light', label: 'Light', bg: '#ffffff', accent: '#2563eb', group: 'Built-in' },
    { id: 'dark', label: 'Dark', bg: '#1c1c1e', accent: '#3b82f6', group: 'Built-in' },
    { id: 'catppuccin-latte', label: 'Latte', bg: '#eff1f5', accent: '#1e66f5', group: 'Catppuccin' },
    { id: 'catppuccin-frappe', label: 'Frappé', bg: '#303446', accent: '#8caaee', group: 'Catppuccin' },
    { id: 'catppuccin-macchiato', label: 'Macchiato', bg: '#24273a', accent: '#8aadf4', group: 'Catppuccin' },
    { id: 'catppuccin-mocha', label: 'Mocha', bg: '#1e1e2e', accent: '#89b4fa', group: 'Catppuccin' },
    { id: 'gruvbox-dark', label: 'Gruvbox Dark', bg: '#282828', accent: '#83a598', group: 'Gruvbox' },
    { id: 'gruvbox-light', label: 'Gruvbox Light', bg: '#fbf1c7', accent: '#076678', group: 'Gruvbox' },
    { id: 'nord', label: 'Nord', bg: '#2e3440', accent: '#88c0d0', group: 'Community' },
    { id: 'dracula', label: 'Dracula', bg: '#282a36', accent: '#bd93f9', group: 'Community' },
    { id: 'one-dark', label: 'One Dark', bg: '#282c34', accent: '#61afef', group: 'Community' },
    { id: 'solarized-light', label: 'Sol. Light', bg: '#fdf6e3', accent: '#268bd2', group: 'Community' },
    { id: 'solarized-dark', label: 'Sol. Dark', bg: '#002b36', accent: '#268bd2', group: 'Community' },
  ];

  let theme = $state<Theme>((localStorage.getItem('theme') as Theme) ?? 'auto');

  $effect(() => {
    if (theme === 'auto') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
  });

  function restartTutorial() {
    settingsOpen = false;
    helpOpen = false;
    tutorialOpen = true;
  }

  function selectTheme(nextTheme: Theme) {
    theme = nextTheme;
    localStorage.setItem('theme', nextTheme);
  }

  function openGitSync() {
    settingsOpen = false;
    gitSyncOpen = true;
  }

  function openGoogleDrive() {
    settingsOpen = false;
    googleDriveOpen = true;
  }

  function openHelp() {
    settingsOpen = false;
    helpOpen = true;
  }

  function openSettings(tab: SettingsTab = 'github') {
    settingsInitialTab = tab;
    settingsOpen = true;
  }
</script>

<div class="app">
  {#if activeTab === 'bank'}
    <div class="version-badge">v{APP_VERSION} {BUILD_NUMBER}</div>
  {/if}
  <header>
    <span class="logo">
      <svg class="logo-icon" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <rect width="32" height="32" rx="7" fill="#2563eb"/>
        <text x="16" y="22" font-family="Georgia,'Times New Roman',serif" font-size="22" font-weight="400" fill="white" text-anchor="middle">∫</text>
      </svg>
      Test Generator
    </span>
    <nav>
      <div class="nav-segment" id="tut-nav">
        <div class="nav-pill" class:right={activeTab === 'build'}></div>
        <button
          id="tut-tab-bank"
          class:active={activeTab === 'bank'}
          onclick={() => (activeTab = 'bank')}
          title="Browse and manage your question bank"
        >
          Question Bank
        </button>
        <button
          id="tut-tab-build"
          class:active={activeTab === 'build'}
          onclick={() => (activeTab = 'build')}
          title="Build, preview, and export a test"
        >
          Build Test
        </button>
      </div>
    </nav>
    <div class="header-actions">
      <button
        id="tut-sync-btn"
        class="icon-btn sync-btn"
        onclick={openGitSync}
        title="Git and remote sync"
      >
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M21 12a9 9 0 0 0-15-6.7L3 8"/>
          <path d="M3 4v4h4"/>
          <path d="M3 12a9 9 0 0 0 15 6.7l3-2.7"/>
          <path d="M21 20v-4h-4"/>
        </svg>
      </button>
      <button
        id="tut-settings-btn"
        class="icon-btn"
        onclick={() => openSettings()}
        title="Settings"
      >
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.22.6.78 1 1.42 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1z"/>
        </svg>
      </button>
      <button id="tut-help-btn" class="help-btn" onclick={() => (helpOpen = true)} title="Help / README">?</button>
    </div>
  </header>

  <main>
    <div class="views-track" class:show-build={activeTab === 'build'}>
      <div class="view-slot"><BankView /></div>
      <div class="view-slot"><TestView /></div>
    </div>
  </main>
</div>

{#if tutorialOpen}
  <Tutorial onclose={() => (tutorialOpen = false)} />
{/if}

{#if helpOpen}
  <HelpModal onclose={() => (helpOpen = false)} onrestart={restartTutorial} />
{/if}

{#if googleDriveOpen}
  <GoogleDriveConnectModal onclose={() => (googleDriveOpen = false)} />
{/if}

{#if gitSyncOpen}
  <GitSyncPanel
    onclose={() => (gitSyncOpen = false)}
    onsettings={() => {
      gitSyncOpen = false;
      openSettings('github');
    }}
  />
{/if}

{#if settingsOpen}
  <SettingsModal
    themes={THEMES}
    activeTheme={theme}
    initialTab={settingsInitialTab}
    onclose={() => (settingsOpen = false)}
    onselectTheme={(nextTheme) => selectTheme(nextTheme as Theme)}
    onsync={openGitSync}
    ongoogleDrive={openGoogleDrive}
    onhelp={openHelp}
    ontutorial={restartTutorial}
  />
{/if}

{#if saveDialogStore.isOpen && saveDialogStore.modalData}
  {@const data = saveDialogStore.modalData}
  <SaveAsModal
    initialName={data.config?.subtitle || data.config?.title || 'Unsaved test'}
    initialClassId={data.filterClassId ?? null}
    allClasses={data.allClasses ?? []}
    editingEntry={data.editingEntry}
    onsave={(result) => saveDialogStore.handleSave(result)}
    oncancel={() => saveDialogStore.close()}
  />
{/if}

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  header {
    display: flex;
    align-items: center;
    gap: 1.5rem;
    padding: 0 1rem;
    height: 52px;
    border-bottom: 1px solid var(--border);
    background: var(--bg);
    flex-shrink: 0;
  }

  .logo {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    font-weight: 600;
    font-size: 17px;
    color: var(--text);
  }

  .logo-icon {
    width: 28px;
    height: 28px;
    flex-shrink: 0;
    border-radius: 5px;
  }

  .version-badge {
    position: fixed;
    bottom: 12px;
    left: 12px;
    font-size: 11px;
    color: var(--text-2);
    font-weight: 500;
    letter-spacing: 0.5px;
    pointer-events: none;
    z-index: 1;
  }

  nav {
    flex: 1;
    display: flex;
    justify-content: center;
  }

  .nav-segment {
    position: relative;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2px;
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 3px;
  }

  .nav-pill {
    position: absolute;
    top: 3px;
    bottom: 3px;
    left: 3px;
    width: calc(50% - 4px);
    background: var(--bg);
    border-radius: 5px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.12), 0 0 0 1px var(--border);
    transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    pointer-events: none;
  }

  .nav-pill.right {
    transform: translateX(calc(100% + 2px));
  }

  .nav-segment button {
    position: relative;
    background: transparent;
    color: var(--text-2);
    font-size: 15px;
    font-weight: 500;
    padding: 5px 18px;
    border-radius: 5px;
    transition: color 0.15s;
    border: none;
    cursor: pointer;
  }

  .nav-segment button:hover {
    color: var(--text);
  }

  .nav-segment button.active {
    color: var(--text);
    font-weight: 600;
  }

  .header-actions {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .icon-btn {
    width: 28px;
    height: 28px;
    padding: 0;
    border-radius: 50%;
    background: var(--bg-3);
    color: var(--text-2);
    font-size: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    position: relative;
  }

  .icon-btn:hover {
    background: var(--border);
    color: var(--text);
  }

  .sync-btn {
    color: var(--text-2);
  }

  .help-btn {
    width: 28px;
    height: 28px;
    padding: 0;
    border-radius: 50%;
    background: var(--bg-3);
    color: var(--text-2);
    font-size: 13px;
    font-weight: 600;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .help-btn:hover {
    background: var(--border);
    color: var(--text);
  }

  main {
    flex: 1;
    overflow: hidden;
    position: relative;
  }

  .views-track {
    display: flex;
    width: 200%;
    height: 100%;
    transition: margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .views-track.show-build {
    margin-left: -100%;
  }

  .view-slot {
    width: 50%;
    height: 100%;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
</style>
