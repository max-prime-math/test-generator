<script lang="ts">
  import BankView from './components/BankView.svelte';
  import TestView from './components/TestView.svelte';
  import HelpModal from './components/HelpModal.svelte';
  import SaveAsModal from './components/SaveAsModal.svelte';
  import GistSyncPanel from './components/sync/GistSyncPanel.svelte';
  import SetupModal from './components/sync/SetupModal.svelte';
  import ConflictModal from './components/sync/ConflictModal.svelte';
  import ShareModal from './components/sync/ShareModal.svelte';
  import { syncState } from './lib/sync/sync-state.svelte';
  import { saveDialogStore } from './lib/save-dialog-store.svelte';
  import { APP_VERSION, BUILD_NUMBER } from './lib/version';
  import type { ConflictSet, ClassSyncFile } from './lib/sync/types';

  type Tab = 'bank' | 'build';
  let activeTab = $state<Tab>('bank');
  let helpOpen = $state(false);

  // Sync UI state
  let syncPanelOpen = $state(false);
  let setupOpen = $state(false);
  let shareOpen = $state(false);
  let conflictData = $state<{
    classId: string;
    conflicts: ConflictSet;
    remoteFile: ClassSyncFile;
  } | null>(null);

  type Theme = 'auto' | 'light' | 'dark'
    | 'catppuccin-latte' | 'catppuccin-frappe' | 'catppuccin-macchiato' | 'catppuccin-mocha'
    | 'gruvbox-dark' | 'gruvbox-light'
    | 'nord' | 'dracula' | 'one-dark'
    | 'solarized-light' | 'solarized-dark';

  const THEMES: { id: Theme; label: string }[] = [
    { id: 'auto', label: 'System' },
    { id: 'light', label: 'Light' },
    { id: 'dark', label: 'Dark' },
    { id: 'catppuccin-latte', label: 'Catppuccin Latte' },
    { id: 'catppuccin-frappe', label: 'Catppuccin Frappé' },
    { id: 'catppuccin-macchiato', label: 'Catppuccin Macchiato' },
    { id: 'catppuccin-mocha', label: 'Catppuccin Mocha' },
    { id: 'gruvbox-dark', label: 'Gruvbox Dark' },
    { id: 'gruvbox-light', label: 'Gruvbox Light' },
    { id: 'nord', label: 'Nord' },
    { id: 'dracula', label: 'Dracula' },
    { id: 'one-dark', label: 'One Dark' },
    { id: 'solarized-light', label: 'Solarized Light' },
    { id: 'solarized-dark', label: 'Solarized Dark' },
  ];

  let theme = $state<Theme>((localStorage.getItem('theme') as Theme) ?? 'auto');

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

  function handleConflicts(classId: string, conflicts: ConflictSet, remoteFile: ClassSyncFile) {
    conflictData = { classId, conflicts, remoteFile };
  }

  async function handleConflictResolve(resolutions: any) {
    if (!conflictData) return;
    try {
      await syncState.applyRestore(conflictData.classId, resolutions, conflictData.remoteFile);
    } finally {
      conflictData = null;
    }
  }

  const syncBadge = $derived(syncState.sessionStatus === 'active' ? 'green' : null);
</script>

<div class="app">
  <div class="version-badge">v{APP_VERSION} {BUILD_NUMBER}</div>
  <header>
    <span class="logo">
      <svg class="logo-icon" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <rect width="32" height="32" rx="7" fill="#2563eb"/>
        <text x="16" y="22" font-family="Georgia,'Times New Roman',serif" font-size="22" font-weight="400" fill="white" text-anchor="middle">∫</text>
      </svg>
      Test Generator
    </span>
    <nav>
      <div class="nav-segment">
        <div class="nav-pill" class:right={activeTab === 'build'}></div>
        <button
          class:active={activeTab === 'bank'}
          onclick={() => (activeTab = 'bank')}
        >
          Question Bank
        </button>
        <button
          class:active={activeTab === 'build'}
          onclick={() => (activeTab = 'build')}
        >
          Build Test
        </button>
      </div>
    </nav>
    <div class="header-actions">
      <button
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
      <select
        class="theme-select"
        bind:value={theme}
        onchange={(e) => {
          const newTheme = (e.target as HTMLSelectElement).value as Theme;
          theme = newTheme;
          localStorage.setItem('theme', newTheme);
        }}
        title="Change theme"
      >
        {#each THEMES as t}
          <option value={t.id}>{t.label}</option>
        {/each}
      </select>
      <button class="help-btn" onclick={() => (helpOpen = true)} title="Help / README">?</button>
    </div>
  </header>

  <main>
    <div class="views-track" class:show-build={activeTab === 'build'}>
      <div class="view-slot"><BankView /></div>
      <div class="view-slot"><TestView /></div>
    </div>
  </main>
</div>

{#if helpOpen}
  <HelpModal onclose={() => (helpOpen = false)} />
{/if}

{#if syncPanelOpen}
  <GistSyncPanel
    onclose={() => (syncPanelOpen = false)}
    onsetup={() => { syncPanelOpen = false; setupOpen = true; }}
    onconflicts={handleConflicts}
    onshare={() => (shareOpen = true)}
  />
{/if}

{#if setupOpen}
  <SetupModal onclose={() => (setupOpen = false)} />
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

  .theme-select {
    padding: 4px 8px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg-input);
    color: var(--text);
    font-size: 13px;
    cursor: pointer;
    height: 28px;
    flex-shrink: 0;
  }

  .theme-select:hover {
    border-color: var(--text-2);
  }

  .theme-select:focus {
    outline: none;
    border-color: var(--primary);
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
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

  .view-slot {
    width: 50%;
    height: 100%;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
</style>
