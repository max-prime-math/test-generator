<script lang="ts">
  import BankView from './components/BankView.svelte';
  import TestView from './components/TestView.svelte';
  import HelpModal from './components/HelpModal.svelte';
  import GistSyncPanel from './components/sync/GistSyncPanel.svelte';
  import SetupModal from './components/sync/SetupModal.svelte';
  import AuthModal from './components/sync/AuthModal.svelte';
  import ConflictModal from './components/sync/ConflictModal.svelte';
  import ShareViaGoogleDriveModal from './components/sync/ShareViaGoogleDriveModal.svelte';
  import { syncState } from './lib/sync/sync-state.svelte';
  import type { ConflictSet } from './lib/sync/types';

  type Tab = 'bank' | 'build';
  let activeTab = $state<Tab>('bank');
  let helpOpen = $state(false);

  // Sync UI state
  let syncPanelOpen = $state(false);
  let setupOpen = $state(false);
  let authOpen = $state(false);
  let shareTarget = $state<{ classId: string; className: string } | null>(null);
  let conflictData = $state<{
    classId: string;
    conflicts: ConflictSet;
    remote: { questions: any[] };
  } | null>(null);

  type Theme = 'auto' | 'light' | 'dark';
  let theme = $state<Theme>((localStorage.getItem('theme') as Theme) ?? 'auto');

  function isDark(): boolean {
    if (theme === 'dark') return true;
    if (theme === 'light') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function toggleTheme() {
    theme = isDark() ? 'light' : 'dark';
    localStorage.setItem('theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
  }

  $effect(() => {
    if (theme === 'auto') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
  });

  // Wire up inactivity listeners on window — these persist regardless of which
  // panels/modals are open, so the lock timer keeps running.
  $effect(() => {
    const reset = () => syncState.resetInactivityTimer();
    window.addEventListener('mousemove', reset, { passive: true });
    window.addEventListener('keydown', reset);
    window.addEventListener('click', reset);
    return () => {
      window.removeEventListener('mousemove', reset);
      window.removeEventListener('keydown', reset);
      window.removeEventListener('click', reset);
    };
  });

  function openSyncPanel() {
    syncPanelOpen = true;
  }

  function handleSyncSetup() {
    syncPanelOpen = false;
    setupOpen = true;
  }

  function handleSyncUnlock() {
    authOpen = true;
  }

  function handleConflicts(
    classId: string,
    conflicts: ConflictSet,
    remote: { questions: any[] },
  ) {
    conflictData = { classId, conflicts, remote };
  }

  async function handleConflictResolve(resolutions: any) {
    if (!conflictData) return;
    try {
      await syncState.applyRestore(
        conflictData.classId,
        resolutions,
        conflictData.remote,
      );
    } finally {
      conflictData = null;
    }
  }

  function handleShare(classId: string, className: string) {
    shareTarget = { classId, className };
  }

  // Sync icon style: shows different state per session status
  const syncBadge = $derived.by(() => {
    if (syncState.sessionStatus === 'locked') return 'amber';
    if (syncState.sessionStatus === 'active') return 'green';
    return null;
  });
</script>

<div class="app">
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
        onclick={openSyncPanel}
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
      <button class="icon-btn" onclick={toggleTheme} title="Toggle dark/light mode">
        {isDark() ? '☀' : '☾'}
      </button>
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
    onsetup={handleSyncSetup}
    onunlock={handleSyncUnlock}
    onconflicts={handleConflicts}
    onshare={handleShare}
  />
{/if}

{#if setupOpen}
  <SetupModal onclose={() => (setupOpen = false)} />
{/if}

{#if authOpen}
  <AuthModal
    onclose={() => (authOpen = false)}
    onunlocked={() => {
      authOpen = false;
      syncState.loadLinkedGists();
    }}
  />
{/if}

{#if conflictData}
  <ConflictModal
    conflicts={conflictData.conflicts}
    onresolve={handleConflictResolve}
    onclose={() => (conflictData = null)}
  />
{/if}

{#if shareTarget}
  <ShareViaGoogleDriveModal
    classId={shareTarget.classId}
    className={shareTarget.className}
    onclose={() => (shareTarget = null)}
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
