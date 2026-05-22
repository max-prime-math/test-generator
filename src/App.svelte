<script lang="ts">
  import BankView from './components/BankView.svelte';
  import TestView from './components/TestView.svelte';
  import HelpModal from './components/HelpModal.svelte';
  import SaveAsModal from './components/SaveAsModal.svelte';
  import Tutorial from './components/Tutorial.svelte';
  import GistSyncPanel from './components/sync/GistSyncPanel.svelte';
  import SetupModal from './components/sync/SetupModal.svelte';
  import GoogleDriveSetupModal from './components/sync/GoogleDriveSetupModal.svelte';
  import ConflictModal from './components/sync/ConflictModal.svelte';
  import TestConflictModal from './components/sync/TestConflictModal.svelte';
  import ProviderConflictPreviewModal from './components/sync/ProviderConflictPreviewModal.svelte';
  import ShareModal from './components/sync/ShareModal.svelte';
  import { syncState } from './lib/sync/sync-state.svelte';
  import { saveDialogStore } from './lib/save-dialog-store.svelte';
  import { APP_VERSION, BUILD_NUMBER } from './lib/version';
  import type { ConflictSet, ClassSyncFile, ProviderConflictPreview, SyncConflict, TestConflictResolutionChoice } from './lib/sync/types';

  const TUTORIAL_DONE_KEY = 'tg-tutorial-done-v1';

  type Tab = 'bank' | 'build';

  function getTabFromHash(): Tab {
    const hash = window.location.hash.slice(1).toLowerCase();
    if (hash === '/build' || hash === 'build') return 'build';
    return 'bank';
  }

  let activeTab = $state<Tab>(getTabFromHash());
  let helpOpen = $state(false);
  let tutorialOpen = $state(!localStorage.getItem(TUTORIAL_DONE_KEY));

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

  // Sync UI state
  let syncPanelOpen = $state(false);
  let setupProviderId = $state<string | null>(null);
  let shareOpen = $state(false);
  let conflictData = $state<{
    classId: string;
    conflicts: ConflictSet;
    remoteFile: ClassSyncFile;
    sourceConflict?: SyncConflict | null;
  } | null>(null);
  let testConflictPreview = $state<ProviderConflictPreview | null>(null);
  let jsonPreview = $state<ProviderConflictPreview | null>(null);

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

  const themeGroups = [
    { label: 'Built-in', themes: THEMES.filter(t => t.group === 'Built-in') },
    { label: 'Catppuccin', themes: THEMES.filter(t => t.group === 'Catppuccin') },
    { label: 'Gruvbox', themes: THEMES.filter(t => t.group === 'Gruvbox') },
    { label: 'Community', themes: THEMES.filter(t => t.group === 'Community') },
  ];

  let theme = $state<Theme>((localStorage.getItem('theme') as Theme) ?? 'auto');
  let themeMenuOpen = $state(false);

  function isDark(): boolean {
    const t = THEMES.find(x => x.id === theme);
    if (t && t.id !== 'auto') {
      return t.id.includes('dark') || t.id.includes('mocha') || t.id.includes('frappe') || t.id.includes('macchiato') || t.id === 'dracula' || t.id === 'nord' || t.id === 'one-dark' || t.id === 'solarized-dark';
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  $effect(() => {
    if (theme === 'auto') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
  });

  function handleConflicts(classId: string, conflicts: ConflictSet, remoteFile: ClassSyncFile, sourceConflict?: SyncConflict | null) {
    conflictData = { classId, conflicts, remoteFile, sourceConflict };
  }

  async function handleConflictResolve(resolutions: any) {
    if (!conflictData) return;
    try {
      await syncState.applyRestore(conflictData.classId, resolutions, conflictData.remoteFile);
      if (conflictData.sourceConflict) {
        syncState.dismissConflict(conflictData.sourceConflict);
      }
    } finally {
      conflictData = null;
    }
  }

  function openTestConflict(preview: ProviderConflictPreview) {
    testConflictPreview = preview;
  }

  function openJsonPreview(preview: ProviderConflictPreview) {
    jsonPreview = preview;
  }

  async function handleTestConflictResolve(choice: TestConflictResolutionChoice) {
    if (!testConflictPreview) return;
    try {
      await syncState.resolveTestConflict(testConflictPreview.conflict, choice);
    } finally {
      testConflictPreview = null;
    }
  }

  const syncBadge = $derived(syncState.sessionStatus === 'active' ? 'green' : null);

  function restartTutorial() {
    helpOpen = false;
    tutorialOpen = true;
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
        onclick={() => (syncPanelOpen = true)}
        title="Sync / backup"
      >
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M21 12a9 9 0 0 0-15-6.7L3 8"/>
          <path d="M3 4v4h4"/>
          <path d="M3 12a9 9 0 0 0 15 6.7l3-2.7"/>
          <path d="M21 20v-4h-4"/>
        </svg>
        {#if syncBadge}
          <span class="status-badge {syncBadge}"></span>
        {/if}
      </button>
      <div class="theme-picker">
        <button
          id="tut-theme-btn"
          class="icon-btn"
          onclick={() => (themeMenuOpen = !themeMenuOpen)}
          title="Change theme"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>
            <circle cx="12" cy="19" r="1"/><circle cx="12" cy="5" r="1"/>
            <circle cx="16.5" cy="16.5" r="1"/><circle cx="7.5" cy="7.5" r="1"/>
            <circle cx="16.5" cy="7.5" r="1"/><circle cx="7.5" cy="16.5" r="1"/>
          </svg>
        </button>
        {#if themeMenuOpen}
          <div class="theme-backdrop" onclick={() => (themeMenuOpen = false)}></div>
          <div class="theme-menu" role="menu">
            {#each themeGroups as group}
              <div class="theme-group-label">{group.label}</div>
              {#each group.themes as t}
                <button
                  class="theme-entry"
                  class:active={theme === t.id}
                  onclick={() => {
                    theme = t.id;
                    localStorage.setItem('theme', t.id);
                    themeMenuOpen = false;
                  }}
                  style="--bg: {t.bg}; --accent: {t.accent};"
                  title="Switch to {t.label} theme"
                >
                  <div class="theme-preview"></div>
                  <span class="theme-label">{t.label}</span>
                  {#if theme === t.id}<span class="check">✓</span>{/if}
                </button>
              {/each}
            {/each}
          </div>
        {/if}
      </div>
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

{#if syncPanelOpen}
  <GistSyncPanel
    onclose={() => (syncPanelOpen = false)}
    onsetup={(providerId) => { syncPanelOpen = false; setupProviderId = providerId; }}
    onconflicts={handleConflicts}
    ontestconflict={openTestConflict}
    onpreviewconflict={openJsonPreview}
    onshare={() => (shareOpen = true)}
  />
{/if}

{#if setupProviderId === 'github'}
  <SetupModal onclose={() => (setupProviderId = null)} />
{/if}

{#if setupProviderId === 'googleDrive'}
  <GoogleDriveSetupModal onclose={() => (setupProviderId = null)} />
{/if}

{#if shareOpen}
  <ShareModal onclose={() => (shareOpen = false)} />
{/if}

{#if conflictData}
  <ConflictModal
    conflicts={conflictData.conflicts}
    onresolve={handleConflictResolve}
    onclose={() => (conflictData = null)}
  />
{/if}

{#if testConflictPreview}
  <TestConflictModal
    preview={testConflictPreview}
    onresolve={handleTestConflictResolve}
    onclose={() => (testConflictPreview = null)}
  />
{/if}

{#if jsonPreview}
  <ProviderConflictPreviewModal
    preview={jsonPreview}
    onclose={() => (jsonPreview = null)}
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

  .status-badge {
    position: absolute;
    top: 2px;
    right: 2px;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    border: 1.5px solid var(--bg);
  }

  .status-badge.green { background: #16a34a; }
  .status-badge.amber { background: #f59e0b; }

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

  .theme-picker {
    position: relative;
  }

  .theme-backdrop {
    position: fixed;
    inset: 0;
    z-index: 299;
  }

  .theme-menu {
    position: absolute;
    right: 0;
    top: calc(100% + 6px);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 4px;
    min-width: 200px;
    z-index: 300;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.18);
    display: flex;
    flex-direction: column;
    gap: 1px;
    max-height: 70vh;
    overflow-y: auto;
  }

  .theme-group-label {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-2);
    padding: 6px 8px 2px;
    margin-top: 2px;
  }

  .theme-entry {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border-radius: 4px;
    background: transparent;
    border: none;
    color: var(--text);
    font-size: 13px;
    text-align: left;
    width: 100%;
    cursor: pointer;
    transition: background 150ms;
  }

  .theme-entry:hover {
    background: var(--bg-3);
  }

  .theme-entry.active {
    background: color-mix(in srgb, var(--primary) 12%, transparent);
  }

  .theme-preview {
    width: 20px;
    height: 20px;
    border-radius: 4px;
    background: var(--bg);
    border: 2px solid var(--accent);
    flex-shrink: 0;
    position: relative;
  }

  .theme-preview::after {
    content: '';
    position: absolute;
    inset: 3px;
    border-radius: 2px;
    background: var(--accent);
    opacity: 0.6;
  }

  .theme-label {
    flex: 1;
    min-width: 0;
  }

  .check {
    margin-left: auto;
    color: var(--primary);
    font-size: 12px;
    font-weight: 600;
    flex-shrink: 0;
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
