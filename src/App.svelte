<script lang="ts">
  import { TYPR_THEMES, applyTyprTheme } from './lib/typr-themes';
  import { tick } from 'svelte';
  import { appState } from './lib/app-state.svelte';
  import EditorView from './components/editor/EditorView.svelte';
  import BankView from './components/BankView.svelte';
  import TestView from './components/TestView.svelte';
  import GradebookView from './components/GradebookView.svelte';
  import GeneratorView from './components/generator/GeneratorView.svelte';
  import HelpModal from './components/HelpModal.svelte';
  import SaveAsModal from './components/SaveAsModal.svelte';
  import Tutorial from './components/Tutorial.svelte';
  import GoogleDriveConnectModal from './components/GoogleDriveConnectModal.svelte';
  import GitSyncPanel from './components/GitSyncPanel.svelte';
  import SettingsModal from './components/SettingsModal.svelte';
  import LocalFolderBankModal from './components/LocalFolderBankModal.svelte';
  import { testEditor } from './lib/test-editor.svelte';
  import { saveDialogStore } from './lib/save-dialog-store.svelte';
  import { APP_VERSION, BUILD_NUMBER } from './lib/version';
  import { bankView } from './lib/bank-switch-view.svelte';
  import { appSettings } from './lib/app-settings.svelte';
  import { localFolderBank } from './lib/local-folder-bank.svelte';
  import { localWorkspace } from './lib/local-workspace.svelte';
  import WorkspaceStatus from './components/WorkspaceStatus.svelte';
  import WorkspaceLoadingOverlay from './components/WorkspaceLoadingOverlay.svelte';


  const TUTORIAL_DONE_KEY = 'tg-tutorial-done-v1';
  const MOBILE_QUERY = '(max-width: 760px)';

  type Tab = 'bank' | 'editor' | 'build' | 'generate' | 'gradebook';
  type SettingsTab = 'github' | 'theme' | 'builder' | 'more';

  function isMobileViewport(): boolean {
    return window.matchMedia(MOBILE_QUERY).matches;
  }

  function getTabFromHash(): Tab {
    const queryTab = new URLSearchParams(window.location.search).get('tab');
    const route = (window.location.hash.slice(1) || queryTab || '').replace(/^\/+/, '').toLowerCase();
    if (route === 'editor' || route.startsWith('editor/')) return 'editor';
    if (route === 'bank') return 'bank';
    if (route === 'build') return 'build';
    if (route === 'generate' && appSettings.generatorExperimentalEnabled) return 'generate';
    if (route === 'gradebook' && appSettings.gradebookExperimentalEnabled) return 'gradebook';
    if (!route && isMobileViewport() && appSettings.gradebookExperimentalEnabled) return 'gradebook';
    return 'bank';
  }

  let editorRoute = $state(readEditorRoute());
  function readEditorRoute() {
    if (!window.location.hash.startsWith('#/editor')) return '';
    try { return decodeURIComponent(window.location.hash.replace(/^#\/editor\/?/, '')); } catch { return ''; }
  }
  let activeTab = $state<Tab>(getTabFromHash());
  /** Tabs in nav order; the sliding pill is sized and placed from this list. */
  const navTabs = $derived<Tab[]>([
    'bank',
    ...(appSettings.generatorExperimentalEnabled ? ['generate' as const] : []),
    'editor', 'build',
    ...(appSettings.gradebookExperimentalEnabled ? ['gradebook' as const] : []),
  ]);
  const TAB_INFO: Record<Tab, { label: string; title: string; tutorialId?: string }> = {
    bank: { label: 'Bank', title: 'Browse and manage your question bank', tutorialId: 'tut-tab-bank' },
    generate: { label: 'Generate', title: 'Generate practice problems from curricular outcomes' },
    editor: { label: 'Editor', title: 'Create and edit questions' },
    build: { label: 'Build', title: 'Build, preview, and export a test', tutorialId: 'tut-tab-build' },
    gradebook: { label: 'Gradebook', title: 'Manage local rosters and scores' },
  };
  // When the tabs don't fit the header they collapse into one button with a menu.
  // A hidden copy of the tab strip keeps its natural width measurable in either mode.
  let navEl = $state<HTMLElement>();
  let navMeasureEl = $state<HTMLElement>();
  let navCollapsed = $state(false);
  let navMenuOpen = $state(false);
  let navTriggerEl = $state<HTMLButtonElement>();

  $effect(() => {
    if (!navEl || !navMeasureEl) return;
    void navTabs.length;
    const nav = navEl;
    const measure = navMeasureEl;
    const update = () => { navCollapsed = measure.offsetWidth > nav.clientWidth + 1; };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(nav);
    observer.observe(measure);
    return () => observer.disconnect();
  });

  $effect(() => {
    if (!navCollapsed) navMenuOpen = false;
  });

  function chooseTab(tab: Tab) {
    activeTab = tab;
    if (navMenuOpen) {
      navMenuOpen = false;
      navTriggerEl?.focus();
    }
  }

  function navMenuItems(): HTMLButtonElement[] {
    return Array.from(navEl?.querySelectorAll<HTMLButtonElement>('.nav-menu [role="menuitem"]') ?? []);
  }

  async function toggleNavMenu() {
    navMenuOpen = !navMenuOpen;
    if (!navMenuOpen) return;
    await tick();
    const items = navMenuItems();
    (items.find((item) => item.getAttribute('aria-current') === 'page') ?? items[0])?.focus();
  }

  function navMenuKeydown(event: KeyboardEvent) {
    const items = navMenuItems();
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const move = ({ ArrowDown: index + 1, ArrowUp: index - 1, Home: 0, End: items.length - 1 } as Record<string, number>)[event.key];
    if (move !== undefined) {
      event.preventDefault();
      items[(move + items.length) % items.length]?.focus();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      navMenuOpen = false;
      navTriggerEl?.focus();
    } else if (event.key === 'Tab') {
      navMenuOpen = false;
    }
  }

  function closeNavMenuOutside(event: PointerEvent) {
    if (navMenuOpen && !navEl?.querySelector('.nav-dropdown')?.contains(event.target as Node)) navMenuOpen = false;
  }
  let helpOpen = $state(false);
  let tutorialOpen = $state(!localStorage.getItem(TUTORIAL_DONE_KEY));
  let gitSyncOpen = $state(false);
  let googleDriveOpen = $state(false);
  let settingsOpen = $state(false);
  let localFolderOpen = $state(false);
  let folderLoadedNotice = $state(false);
  let settingsInitialTab = $state<SettingsTab>('theme');

  $effect(() => {
    void localWorkspace.initialize().then(async () => {
      if (!localWorkspace.connected) await localFolderBank.initialize();
      folderLoadedNotice = localFolderBank.consumeReloadNotice();
      if (folderLoadedNotice) window.setTimeout(() => (folderLoadedNotice = false), 4_000);
    });
  });

  $effect(() => {
    const saveBeforeLeaving = () => { void localFolderBank.saveNow().catch(() => undefined); void localWorkspace.saveNow().catch(() => undefined); };
    const saveWhenHidden = () => {
      if (document.visibilityState === 'hidden') saveBeforeLeaving();
    };
    window.addEventListener('pagehide', saveBeforeLeaving);
    document.addEventListener('visibilitychange', saveWhenHidden);
    return () => {
      window.removeEventListener('pagehide', saveBeforeLeaving);
      document.removeEventListener('visibilitychange', saveWhenHidden);
    };
  });


  $effect(() => {
    if (activeTab === 'editor' && window.location.hash.startsWith('#/editor')) return;
    const nextHash = activeTab === 'bank' ? '#/bank' : `#/${activeTab}`;
    if (window.location.hash !== nextHash) window.location.hash = nextHash;
  });

  $effect(() => {
    if ((!appSettings.gradebookExperimentalEnabled && activeTab === 'gradebook')
      || (!appSettings.generatorExperimentalEnabled && activeTab === 'generate')) {
      activeTab = 'bank';
    }
  });

  function handleHashChange() {
    editorRoute = window.location.hash.startsWith('#/editor') ? readEditorRoute() : '';
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
    | 'solarized-light' | 'solarized-dark' | typeof TYPR_THEMES[number]['id'];

  interface ThemeOption {
    id: Theme;
    label: string;
    bg: string;
    accent: string;
    group: string;
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
    ...TYPR_THEMES,
  ];

  let theme = $state<Theme>((localStorage.getItem('theme') as Theme) ?? 'auto');

  $effect(() => {
    applyTyprTheme(theme);
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

  function openSettings(tab?: SettingsTab) {
    settingsInitialTab = tab ?? (appSettings.gitFeaturesEnabled ? 'github' : 'theme');
    settingsOpen = true;
  }

</script>

<svelte:window onpointerdown={closeNavMenuOutside} />
<div class="workspace-app-shell" inert={localWorkspace.blocking} aria-busy={localWorkspace.blocking}>
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
    <div class="folder-control">
      <button
        class="bank-folder-btn"
        class:active={localFolderBank.linkedToActiveBank || localWorkspace.connected}
        class:attention={localFolderBank.status === 'permission-needed' || localFolderBank.status === 'error' || localWorkspace.status === 'error' || localWorkspace.status === 'permission-needed' || localWorkspace.status === 'paused'}
        onclick={() => (localFolderOpen = true)}
        disabled={bankView.switching || localWorkspace.busy}
        title={localWorkspace.connected ? `Workspace: ${localWorkspace.folderName}` : localFolderBank.linkedToActiveBank ? `Local folder: ${localFolderBank.folderName}` : 'Connect a local workspace or bank folder'}
        aria-label="Local folder storage"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M3 6.5h6l2 2h10v9.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          <path d="M3 9h18"/>
        </svg>
      </button>
    </div>
    <nav id="tut-nav" bind:this={navEl} class:collapsed={navCollapsed}>
      <div class="nav-segment nav-measure" style:--tabs={navTabs.length} bind:this={navMeasureEl} aria-hidden="true" inert>
        {#each navTabs as tab (tab)}<span class="nav-measure-item">{TAB_INFO[tab].label}</span>{/each}
      </div>
      {#if !navCollapsed}
        <div class="nav-segment" style:--tabs={navTabs.length}>
          <div class="nav-pill" style:--tab-index={Math.max(0, navTabs.indexOf(activeTab))}></div>
          {#each navTabs as tab (tab)}
            <button
              id={TAB_INFO[tab].tutorialId}
              class:active={activeTab === tab}
              aria-current={activeTab === tab ? 'page' : undefined}
              onclick={() => chooseTab(tab)}
              title={TAB_INFO[tab].title}
            >{TAB_INFO[tab].label}</button>
          {/each}
        </div>
      {:else}
        <div class="nav-dropdown">
          <button
            bind:this={navTriggerEl}
            class="nav-dropdown-trigger"
            aria-haspopup="menu"
            aria-expanded={navMenuOpen}
            title="Switch view"
            onclick={toggleNavMenu}
          >
            <span>{TAB_INFO[activeTab].label}</span>
            <span class="nav-chevron" aria-hidden="true">▾</span>
          </button>
          {#if navMenuOpen}
            <div class="nav-menu" role="menu" aria-label="Views" tabindex="-1" onkeydown={navMenuKeydown}>
              {#each navTabs as tab (tab)}
                <button
                  role="menuitem"
                  tabindex="-1"
                  class:active={activeTab === tab}
                  aria-current={activeTab === tab ? 'page' : undefined}
                  onclick={() => chooseTab(tab)}
                >
                  <span>{TAB_INFO[tab].label}</span>
                  <small>{TAB_INFO[tab].title}</small>
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
    </nav>
    <div class="header-actions">
      {#if appSettings.gitFeaturesEnabled}
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
      {/if}
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
    {#if localWorkspace.error && !localWorkspace.busy}
      <div class="workspace-notice" role="alert">
        <strong>{localWorkspace.status === 'ready' ? 'Some workspace items need attention.' : 'Workspace needs attention — folder saving is paused.'}</strong>
        <span>{localWorkspace.error}</span>
        <button onclick={() => (localFolderOpen = true)}>Review workspace</button>
      </div>
    {:else if localWorkspace.status === 'paused'}
      <div class="workspace-notice" role="status">
        Workspace loading was stopped. You are working with the browser copy; autosave to the folder is paused.
        <button onclick={() => void localWorkspace.resumeLoading()}>Load workspace</button>
        <button onclick={() => (localFolderOpen = true)}>Review workspace</button>
      </div>
    {:else if localWorkspace.status === 'permission-needed'}
      <div class="workspace-notice" role="status">
        Workspace folder access is required. Autosave is paused.
        <button onclick={() => (localFolderOpen = true)}>Allow access</button>
      </div>
    {/if}
    <div class="views-track">
      <div class="view-slot" class:hidden={activeTab !== 'bank'} inert={activeTab !== 'bank'}><BankView /></div>
      <div class="view-slot" class:hidden={activeTab !== 'editor'} inert={activeTab !== 'editor'}><EditorView active={activeTab === 'editor'} routeId={editorRoute} /></div>
      <div class="view-slot" class:hidden={activeTab !== 'build'} inert={activeTab !== 'build'}><TestView active={activeTab === 'build'} /></div>
      {#if appSettings.generatorExperimentalEnabled}
        <div class="view-slot" class:hidden={activeTab !== 'generate'} inert={activeTab !== 'generate'}><GeneratorView /></div>
      {/if}
      {#if appSettings.gradebookExperimentalEnabled}
        <div class="view-slot" class:hidden={activeTab !== 'gradebook'} inert={activeTab !== 'gradebook'}><GradebookView /></div>
      {/if}
    </div>
  </main>
  <WorkspaceStatus onreview={() => (localFolderOpen = true)} />
</div>

{#if appState.notice}
  <div class="folder-toast" role="status">{appState.notice}</div>
{/if}
{#if folderLoadedNotice}
  <div class="folder-toast" role="status">Bank loaded from local folder</div>
{/if}

{#if tutorialOpen}
  <Tutorial onclose={() => (tutorialOpen = false)} />
{/if}

{#if helpOpen}
  <HelpModal onclose={() => (helpOpen = false)} onrestart={restartTutorial} />
{/if}

{#if googleDriveOpen && appSettings.gitFeaturesEnabled}
  <GoogleDriveConnectModal onclose={() => (googleDriveOpen = false)} />
{/if}

{#if gitSyncOpen && appSettings.gitFeaturesEnabled}
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
    onhelp={openHelp}
    ontutorial={restartTutorial}
  />
{/if}

{#if localFolderOpen}
  <LocalFolderBankModal onclose={() => (localFolderOpen = false)} />
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

</div>

{#if localWorkspace.blocking}
  <WorkspaceLoadingOverlay />
{/if}

<style>
  .workspace-app-shell { height: 100%; }
  .workspace-notice { flex-shrink: 0; display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; padding: .7rem 1rem; border-bottom: 1px solid var(--border); background: var(--bg); font-size: .85rem; }
  .workspace-notice span { flex: 1 1 20rem; }
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
    position: relative;
    flex: 1;
    min-width: 0;
    display: flex;
    justify-content: center;
  }

  nav > .nav-segment:not(.nav-measure) {
    flex-shrink: 0;
  }

  /* Invisible copy of the tab strip at its natural width, used to decide when to collapse. */
  nav .nav-segment.nav-measure {
    position: absolute;
    top: 0;
    left: 0;
    width: max-content;
    visibility: hidden;
    pointer-events: none;
  }

  nav .nav-segment.nav-measure .nav-measure-item {
    white-space: nowrap;
    /* Measure at the bold active weight so the fit check is never optimistic. */
    font-weight: 600;
  }

  .nav-dropdown {
    position: relative;
  }

  .nav-dropdown-trigger {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 5px 14px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg-2);
    color: var(--text);
    font-size: 15px;
    font-weight: 600;
  }

  .nav-chevron {
    color: var(--text-2);
    font-size: 12px;
  }

  .nav-menu {
    position: absolute;
    top: calc(100% + 4px);
    left: 50%;
    z-index: 60;
    transform: translateX(-50%);
    display: grid;
    gap: 2px;
    width: max-content;
    min-width: 14rem;
    max-width: min(20rem, calc(100vw - 24px));
    padding: 0.25rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
  }

  .nav-menu button {
    display: grid;
    gap: 0.1rem;
    width: 100%;
    padding: 0.45rem 0.65rem;
    border: none;
    border-radius: 5px;
    background: none;
    color: var(--text);
    font-size: 14px;
    font-weight: 600;
    text-align: left;
  }

  .nav-menu button small {
    color: var(--text-2);
    font-size: 11px;
    font-weight: 400;
  }

  .nav-menu button:hover,
  .nav-menu button:focus-visible {
    background: color-mix(in srgb, var(--primary) 12%, var(--bg));
    outline: none;
  }

  .nav-menu button.active {
    background: color-mix(in srgb, var(--primary) 18%, var(--bg));
  }

  .folder-control { display: flex; align-items: center; }
  .bank-folder-btn {
    position: relative;
    width: 30px;
    height: 28px;
    padding: 5px;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: var(--bg-2);
    color: var(--text-2);
    flex-shrink: 0;
  }

  .bank-folder-btn svg {
    width: 17px;
    height: 17px;
  }

  .bank-folder-btn.active {
    color: var(--accent);
    border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
  }

  .bank-folder-btn.active::after,
  .bank-folder-btn.attention::after {
    content: '';
    position: absolute;
    top: 3px;
    right: 3px;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #2aa876;
    box-shadow: 0 0 0 1px var(--bg-2);
  }

  .bank-folder-btn.attention::after {
    background: #d98b20;
  }

  .folder-toast {
    position: fixed;
    left: 50%;
    bottom: 1.25rem;
    z-index: 1100;
    transform: translateX(-50%);
    padding: 0.65rem 0.9rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg);
    color: var(--text);
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.2);
    font-size: 0.85rem;
  }

  .nav-segment {
    --pad: 3px;
    position: relative;
    display: grid;
    grid-template-columns: repeat(var(--tabs, 3), 1fr);
    gap: 2px;
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: var(--pad);
  }

  .nav-pill {
    position: absolute;
    top: var(--pad);
    bottom: var(--pad);
    left: var(--pad);
    width: calc((100% - 2 * var(--pad) - (var(--tabs, 3) - 1) * 2px) / var(--tabs, 3));
    background: var(--bg);
    border-radius: 5px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.12), 0 0 0 1px var(--border);
    transform: translateX(calc(var(--tab-index, 0) * (100% + 2px)));
    transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    pointer-events: none;
  }

  .nav-segment button,
  .nav-segment .nav-measure-item {
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
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
    position: relative;
  }

  .views-track { flex: 1; min-height: 0; height: 100%; }
  .view-slot { width: 100%; height: 100%; overflow: hidden; display: flex; flex-direction: column; }
  .view-slot.hidden { display: none; }

  @media (max-width: 760px) {
    .app {
      min-height: 100%;
    }

    header {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto auto;
      grid-template-areas:
        "brand bank actions"
        "nav nav nav";
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

    .folder-control { grid-area: bank; }

    .bank-folder-btn {
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
      --pad: 4px;
      width: 100%;
      border-radius: 10px;
    }

    .nav-dropdown,
    .nav-dropdown-trigger {
      width: 100%;
    }

    .nav-dropdown-trigger {
      justify-content: space-between;
      min-height: 44px;
      border-radius: 10px;
    }

    .nav-pill {
      border-radius: 7px;
    }

    .nav-segment button,
    .nav-segment .nav-measure-item {
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
