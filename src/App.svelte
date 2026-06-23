<script lang="ts">
  import BankView from './components/BankView.svelte';
  import TestView from './components/TestView.svelte';
  import GradebookView from './components/GradebookView.svelte';
  import HelpModal from './components/HelpModal.svelte';
  import SaveAsModal from './components/SaveAsModal.svelte';
  import Tutorial from './components/Tutorial.svelte';
  import GoogleDriveConnectModal from './components/GoogleDriveConnectModal.svelte';
  import GoogleClassroomModal from './components/GoogleClassroomModal.svelte';
  import GitSyncPanel from './components/GitSyncPanel.svelte';
  import SettingsModal from './components/SettingsModal.svelte';
  import { saveDialogStore } from './lib/save-dialog-store.svelte';
  import { APP_VERSION, BUILD_NUMBER } from './lib/version';
  import { bankWorkspaces } from './lib/bank-workspaces.svelte';
  import { appSettings } from './lib/app-settings.svelte';

  const TUTORIAL_DONE_KEY = 'tg-tutorial-done-v1';
  const MOBILE_QUERY = '(max-width: 760px)';

  type Tab = 'bank' | 'build' | 'gradebook';
  type SettingsTab = 'github' | 'theme' | 'builder' | 'more';

  function isMobileViewport(): boolean {
    return window.matchMedia(MOBILE_QUERY).matches;
  }

  function getTabFromHash(): Tab {
    const queryTab = new URLSearchParams(window.location.search).get('tab');
    const route = (queryTab ?? window.location.hash.slice(1)).replace(/^\/+/, '').toLowerCase();
    if (route === 'bank') return 'bank';
    if (route === 'build') return 'build';
    if (route === 'gradebook' && appSettings.gradebookExperimentalEnabled) return 'gradebook';
    if (!route && isMobileViewport() && appSettings.gradebookExperimentalEnabled) return 'gradebook';
    return 'bank';
  }

  let activeTab = $state<Tab>(getTabFromHash());
  let helpOpen = $state(false);
  let tutorialOpen = $state(!localStorage.getItem(TUTORIAL_DONE_KEY));
  let gitSyncOpen = $state(false);
  let googleDriveOpen = $state(false);
  let googleClassroomOpen = $state(false);
  let googleClassroomAssessmentId = $state('');
  let settingsOpen = $state(false);
  let settingsInitialTab = $state<SettingsTab>('github');

  $effect(() => {
    const nextHash = activeTab === 'build' ? '#/build' : activeTab === 'gradebook' ? '#/gradebook' : '#/bank';
    if (window.location.hash !== nextHash) window.location.hash = nextHash;
  });

  $effect(() => {
    if (!appSettings.gradebookExperimentalEnabled && activeTab === 'gradebook') {
      activeTab = 'bank';
    }
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

  function openGoogleClassroom(assessmentId = '') {
    settingsOpen = false;
    googleClassroomAssessmentId = assessmentId;
    googleClassroomOpen = true;
  }

  function openHelp() {
    settingsOpen = false;
    helpOpen = true;
  }

  function openSettings(tab: SettingsTab = 'github') {
    settingsInitialTab = tab;
    settingsOpen = true;
  }

  async function switchBank(id: string) {
    await bankWorkspaces.switchBank(id);
  }

  async function createBank() {
    const name = window.prompt('New bank name', 'New Test Bank');
    if (name === null) return;
    await bankWorkspaces.createBank(name);
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
    <div class="bank-switcher" title="Current bank">
      <span>Bank</span>
      <select
        value={bankWorkspaces.activeBankId}
        onchange={(e) => void switchBank(e.currentTarget.value)}
        disabled={bankWorkspaces.switching}
        aria-label="Current bank"
      >
        {#each bankWorkspaces.banks as workspace}
          <option value={workspace.id}>{workspace.name}</option>
        {/each}
      </select>
      <button class="bank-add-btn" onclick={() => void createBank()} disabled={bankWorkspaces.switching} title="Create a new local bank">+</button>
    </div>
    <nav>
      <div class="nav-segment" class:gradebook-enabled={appSettings.gradebookExperimentalEnabled} id="tut-nav">
        <div class="nav-pill" class:build={activeTab === 'build'} class:gradebook={activeTab === 'gradebook'}></div>
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
        {#if appSettings.gradebookExperimentalEnabled}
          <button
            class:active={activeTab === 'gradebook'}
            onclick={() => (activeTab = 'gradebook')}
            title="Manage local rosters and scores"
          >
            Gradebook
          </button>
        {/if}
      </div>
    </nav>
    <div class="header-actions">
      <button
        id="tut-sync-btn"
        class="icon-btn sync-btn"
        onclick={openGitSync}
        title="Git and remote sync"
        aria-label="Git and remote sync"
      >
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M21 12a9 9 0 0 0-15-6.7L3 8"/>
          <path d="M3 4v4h4"/>
          <path d="M3 12a9 9 0 0 0 15 6.7l3-2.7"/>
          <path d="M21 20v-4h-4"/>
        </svg>
        <span class="header-action-label">Sync</span>
      </button>
      <button
        id="tut-settings-btn"
        class="icon-btn"
        onclick={() => openSettings()}
        title="Settings"
        aria-label="Settings"
      >
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.22.6.78 1 1.42 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1z"/>
        </svg>
        <span class="header-action-label">Settings</span>
      </button>
      <button id="tut-help-btn" class="help-btn" onclick={() => (helpOpen = true)} title="Help / README" aria-label="Help">
        ?
        <span class="header-action-label">Help</span>
      </button>
    </div>
  </header>

  <main>
    <div
      class="views-track"
      class:gradebook-enabled={appSettings.gradebookExperimentalEnabled}
      class:show-build={activeTab === 'build'}
      class:show-gradebook={activeTab === 'gradebook'}
    >
      <div class="view-slot"><BankView /></div>
      <div class="view-slot"><TestView /></div>
      {#if appSettings.gradebookExperimentalEnabled}
        <div class="view-slot"><GradebookView ongoogleClassroom={openGoogleClassroom} /></div>
      {/if}
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

{#if googleClassroomOpen}
  <GoogleClassroomModal
    assessmentId={googleClassroomAssessmentId}
    onclose={() => (googleClassroomOpen = false)}
  />
{/if}

{#if gitSyncOpen}
  <GitSyncPanel
    onclose={() => (gitSyncOpen = false)}
    onsettings={() => {
      gitSyncOpen = false;
      openSettings('github');
    }}
    ongoogleDrive={() => {
      gitSyncOpen = false;
      openGoogleDrive();
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
    ongoogleClassroom={() => openGoogleClassroom()}
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

  .bank-switcher {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    min-width: 0;
    color: var(--text-2);
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .bank-switcher select {
    min-width: 150px;
    max-width: 230px;
    height: 30px;
    padding: 3px 24px 3px 8px;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: var(--bg-2);
    color: var(--text);
    font-size: 13px;
    font-weight: 500;
    text-transform: none;
    letter-spacing: 0;
  }

  .bank-add-btn {
    width: 28px;
    height: 28px;
    padding: 0;
    border-radius: 50%;
    background: var(--bg-3);
    color: var(--text-2);
    font-size: 16px;
    font-weight: 600;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .bank-add-btn:hover {
    background: var(--border);
    color: var(--text);
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

  .nav-pill.build {
    transform: translateX(calc(100% + 2px));
  }

  .nav-segment.gradebook-enabled {
    grid-template-columns: 1fr 1fr 1fr;
  }

  .nav-segment.gradebook-enabled .nav-pill {
    width: calc(33.333% - 4px);
  }

  .nav-pill.gradebook {
    transform: translateX(calc(200% + 4px));
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

  .header-action-label {
    display: none;
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
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .views-track.show-build {
    transform: translateX(-50%);
  }

  .views-track.gradebook-enabled {
    width: 300%;
  }

  .views-track.gradebook-enabled.show-build {
    transform: translateX(-33.333333%);
  }

  .views-track.gradebook-enabled.show-gradebook {
    transform: translateX(-66.666667%);
  }

  .view-slot {
    width: 50%;
    height: 100%;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .views-track.gradebook-enabled .view-slot {
    width: 33.333333%;
  }

  @media (max-width: 760px) {
    .app {
      min-height: 100%;
    }

    header {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-areas:
        "brand actions"
        "bank bank"
        "nav nav";
      height: auto;
      gap: 0.55rem;
      padding: calc(0.55rem + env(safe-area-inset-top)) 0.75rem 0.65rem;
    }

    .logo {
      grid-area: brand;
      min-width: 0;
      font-size: 16px;
    }

    .logo-icon {
      width: 30px;
      height: 30px;
    }

    .bank-switcher {
      grid-area: bank;
      display: grid;
      grid-template-columns: minmax(0, 1fr) 44px;
      gap: 0.45rem;
      width: 100%;
      align-items: center;
    }

    .bank-switcher > span {
      display: none;
    }

    .bank-switcher select {
      max-width: none;
      min-width: 0;
      height: 44px;
      font-size: 16px;
      padding-left: 10px;
    }

    .bank-add-btn {
      width: 44px;
      height: 44px;
      border-radius: 8px;
    }

    nav {
      grid-area: nav;
      width: 100%;
      justify-content: stretch;
    }

    .nav-segment {
      width: 100%;
      border-radius: 10px;
      padding: 4px;
    }

    .nav-pill {
      top: 4px;
      bottom: 4px;
      left: 4px;
      border-radius: 7px;
    }

    .nav-segment button {
      min-height: 44px;
      padding: 0 0.35rem;
      font-size: 14px;
      white-space: normal;
      line-height: 1.1;
    }

    .header-actions {
      grid-area: actions;
      align-self: start;
      gap: 0.35rem;
    }

    .icon-btn,
    .help-btn {
      width: auto;
      min-width: 44px;
      height: 44px;
      border-radius: 8px;
      gap: 0.35rem;
      padding: 0 0.65rem;
    }

    .header-action-label {
      display: inline;
      font-size: 12px;
      font-weight: 600;
      color: currentColor;
    }

    .version-badge {
      display: none;
    }
  }

  @media (max-width: 430px) {
    .header-action-label {
      display: none;
    }

    .icon-btn,
    .help-btn {
      padding: 0;
    }
  }
</style>
