<script lang="ts">
  import { onMount } from 'svelte';
  import { appSettings, DEFAULT_TEST_BUILDER_DEFAULTS, type TestBuilderDefaults } from '../lib/app-settings.svelte';
  import { gitPanelState } from '../git/gitPanelState.svelte.ts';

  interface ThemeOption {
    id: string;
    label: string;
    bg: string;
    accent: string;
    group: string;
  }

  type SettingsTab = 'github' | 'theme' | 'builder' | 'more';

  interface Props {
    themes: ThemeOption[];
    activeTheme: string;
    initialTab?: SettingsTab;
    onclose: () => void;
    onselectTheme: (theme: string) => void;
    onsync: () => void;
    ongoogleDrive: () => void;
    onhelp: () => void;
    ontutorial: () => void;
  }

  const {
    themes,
    activeTheme,
    initialTab = 'github',
    onclose,
    onselectTheme,
    onsync,
    ongoogleDrive,
    onhelp,
    ontutorial,
  }: Props = $props();

  const panel = gitPanelState;

  let activeTab = $state<SettingsTab>('github');
  let manualRepoEntry = $state(false);
  let builderDefaults = $state<TestBuilderDefaults>(cloneDefaults(appSettings.testBuilderDefaults));

  const busy = $derived(Boolean(panel.busy));
  const themeGroups = $derived(groupThemes(themes));
  const activeThemeLabel = $derived(themes.find((theme) => theme.id === activeTheme)?.label ?? 'System');
  const builderDefaultsDirty = $derived(JSON.stringify(builderDefaults) !== JSON.stringify(appSettings.testBuilderDefaults));

  onMount(() => {
    void panel.open();
  });

  $effect(() => {
    activeTab = initialTab;
  });

  function cloneDefaults(defaults: TestBuilderDefaults): TestBuilderDefaults {
    return JSON.parse(JSON.stringify(defaults));
  }

  function saveBuilderDefaults() {
    appSettings.setTestBuilderDefaults(builderDefaults);
    builderDefaults = cloneDefaults(appSettings.testBuilderDefaults);
  }

  function resetBuilderDefaults() {
    builderDefaults = cloneDefaults(DEFAULT_TEST_BUILDER_DEFAULTS);
    appSettings.resetTestBuilderDefaults();
  }

  function groupThemes(options: ThemeOption[]): Array<{ label: string; themes: ThemeOption[] }> {
    const groups = new Map<string, ThemeOption[]>();
    for (const theme of options) {
      groups.set(theme.group, [...(groups.get(theme.group) ?? []), theme]);
    }
    return [...groups.entries()].map(([label, groupThemes]) => ({ label, themes: groupThemes }));
  }

  function handleOverlayClick(e: MouseEvent) {
    if (e.target === e.currentTarget) onclose();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose();
  }

  function remoteLabel(remoteKind: string): string {
    if (remoteKind === 'github') return 'GitHub';
    if (remoteKind === 'google-drive') return 'Google Drive';
    return remoteKind;
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div
  class="settings-overlay"
  role="dialog"
  aria-modal="true"
  aria-labelledby="settings-title"
  tabindex="-1"
  onclick={handleOverlayClick}
  onkeydown={handleKeydown}
>
  <section class="settings-card" role="document" tabindex="-1">
    <header>
      <div>
        <h2 id="settings-title">Settings</h2>
        <p>Manage app preferences, GitHub setup, and defaults for new tests.</p>
      </div>
      <button class="ghost icon-close" onclick={onclose} title="Close settings">x</button>
    </header>

    <div class="settings-body">
      <nav class="settings-tabs" aria-label="Settings sections">
        <button class:active={activeTab === 'github'} onclick={() => (activeTab = 'github')}>
          <span>GitHub Credentials</span>
          <small>Tokens and repos</small>
        </button>
        <button class:active={activeTab === 'theme'} onclick={() => (activeTab = 'theme')}>
          <span>Theme</span>
          <small>{activeThemeLabel}</small>
        </button>
        <button class:active={activeTab === 'builder'} onclick={() => (activeTab = 'builder')}>
          <span>Test Builder</span>
          <small>New-test defaults</small>
        </button>
        <button class:active={activeTab === 'more'} onclick={() => (activeTab = 'more')}>
          <span>More</span>
          <small>Help and future settings</small>
        </button>
      </nav>

      <div class="settings-pane">
        {#if activeTab === 'github'}
          <section class="pane-section">
            <div class="pane-heading">
              <h3>GitHub Credentials and Remotes</h3>
              <p>Connect a token, choose the token owner, configure repositories and branches, or create a remote repository from the current bank.</p>
            </div>

            {#if panel.message}
              <div class:message-error={panel.message.tone === 'error'} class:message-success={panel.message.tone === 'success'} class:message-warning={panel.message.tone === 'warning'} class="message">
                {panel.message.text}
              </div>
            {/if}

            <section class="settings-section">
              <div class="section-heading">
                <div>
                  <h4>Token</h4>
                  <p>Use an expiring fine-grained token scoped to a repository with Contents read/write permission.</p>
                </div>
                <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">Open GitHub tokens</a>
              </div>

              <div class="token-row">
                <label>
                  <span>GitHub token</span>
                  <input
                    bind:value={panel.tokenInput}
                    type="password"
                    placeholder={panel.tokenConnected ? 'Connected token is hidden' : 'Paste fine-grained token'}
                    autocomplete="off"
                    autocapitalize="none"
                    spellcheck="false"
                    disabled={busy}
                  />
                </label>
                <label class="check-row">
                  <input type="checkbox" bind:checked={panel.persistToken} disabled={busy} />
                  <span>Persist token in browser storage</span>
                </label>
                <div class="button-row">
                  <button onclick={() => panel.connectGitHubToken()} disabled={busy || !panel.tokenInput.trim()}>
                    {panel.busy === 'connect-token' ? 'Connecting...' : panel.tokenConnected ? 'Replace Token' : 'Connect Token'}
                  </button>
                  <button class="ghost danger" onclick={() => panel.disconnectGitHubToken()} disabled={busy || !panel.tokenConnected}>
                    Clear Token
                  </button>
                </div>
              </div>

              <p class="muted">
                Token storage is {panel.tokenConnected ? `${panel.tokenPersistence} for ${panel.remoteName}` : 'not connected'}. Persistent storage is optional and readable by JavaScript running on this origin.
              </p>
            </section>

            <section class="settings-section">
              <div class="section-heading">
                <div>
                  <h4>Repository</h4>
                  <p>Select an existing repository or create a new one directly from the current browser bank.</p>
                </div>
                <button class="ghost" onclick={() => panel.startNewRemote()} disabled={busy}>New Remote</button>
              </div>

              <div class="remote-form">
                <label>
                  <span>Remote name</span>
                  <input bind:value={panel.remoteName} disabled={busy} autocomplete="off" />
                </label>
                <label>
                  <span>Owner</span>
                  {#if panel.owners.length > 0}
                    <select value={panel.owner} onchange={(e) => void panel.selectOwner(e.currentTarget.value)} disabled={busy}>
                      {#each panel.owners as owner}
                        <option value={owner.login}>{owner.login} - {owner.type}</option>
                      {/each}
                    </select>
                  {:else}
                    <input bind:value={panel.owner} disabled={busy} autocomplete="off" autocapitalize="none" />
                  {/if}
                </label>
                <label>
                  <span>Repository</span>
                  {#if panel.repositoryMode === 'new'}
                    <input value="New repository" disabled autocomplete="off" />
                    {#if panel.repositories.length > 0}
                      <button class="ghost inline-action" onclick={() => (panel.repositoryMode = 'existing')} disabled={busy}>Choose from list</button>
                    {/if}
                  {:else if panel.repositories.length > 0 && !manualRepoEntry}
                    <select value={panel.repoName} onchange={(e) => void panel.selectRepository(e.currentTarget.value)} disabled={busy}>
                      <option value="__new__">New repo...</option>
                      <option value="">Choose repository</option>
                      {#each panel.repositories as repo}
                        <option value={repo.name}>{repo.name}{repo.private ? ' (private)' : ' (public)'}</option>
                      {/each}
                    </select>
                    <button class="ghost inline-action" onclick={() => (manualRepoEntry = true)} disabled={busy}>Enter manually</button>
                  {:else}
                    <input bind:value={panel.repoName} disabled={busy} autocomplete="off" autocapitalize="none" placeholder="repository-name" />
                    {#if panel.repositories.length > 0}
                      <button class="ghost inline-action" onclick={() => (manualRepoEntry = false)} disabled={busy}>Choose from list</button>
                    {/if}
                    {#if panel.tokenConnected}
                      <button class="ghost inline-action" onclick={() => void panel.selectRepository('__new__')} disabled={busy}>New repo...</button>
                    {/if}
                  {/if}
                </label>
                {#if panel.repositoryMode === 'new'}
                  <label>
                    <span>New repo name</span>
                    <input bind:value={panel.newRepoName} disabled={busy} autocomplete="off" autocapitalize="none" placeholder="test-generator-bank" />
                  </label>
                {/if}
                <label>
                  <span>Branch</span>
                  {#if panel.repositoryMode === 'new'}
                    <input value={panel.defaultBranch || 'main'} disabled autocomplete="off" autocapitalize="none" />
                  {:else if panel.branches.length > 0}
                    <select bind:value={panel.branch} disabled={busy}>
                      {#each panel.branches as branch}
                        <option value={branch.name}>{branch.name}</option>
                      {/each}
                    </select>
                  {:else}
                    <input bind:value={panel.branch} disabled={busy} autocomplete="off" autocapitalize="none" placeholder="main" />
                  {/if}
                </label>
                <label>
                  <span>Default branch</span>
                  <input bind:value={panel.defaultBranch} disabled={busy} autocomplete="off" autocapitalize="none" placeholder="main" />
                </label>
                <label>
                  <span>Repository visibility</span>
                  <select bind:value={panel.repoVisibility} disabled={busy}>
                    <option value="unknown">Unknown or broadly shared</option>
                    <option value="private">Private and narrowly shared</option>
                    <option value="public-or-shared">Public or broadly shared</option>
                  </select>
                </label>
              </div>

              <div class="button-row wrap">
                <button onclick={() => panel.loadRepositories()} disabled={busy || !panel.tokenConnected || !panel.owner.trim()}>
                  {panel.busy === 'load-repos' ? 'Loading...' : 'Load Repositories'}
                </button>
                <button onclick={() => panel.loadBranches()} disabled={busy || !panel.tokenConnected || panel.repositoryMode !== 'existing' || !panel.owner.trim() || !panel.repoName.trim()}>
                  {panel.busy === 'load-branches' ? 'Loading...' : 'Load Branches'}
                </button>
                <button class="primary" onclick={() => panel.saveRemoteConfig()} disabled={busy || panel.repositoryMode !== 'existing' || !panel.owner.trim() || !panel.repoName.trim() || !panel.branch.trim()}>
                  {panel.busy === 'save-remote' ? 'Saving...' : 'Save Remote Config'}
                </button>
                <button class="primary" onclick={() => panel.createRemoteFromCurrentBank()} disabled={!panel.canCreateRemoteFromCurrentBank}>
                  {panel.busy === 'create-remote' ? 'Creating...' : 'Create Repo From Current Bank'}
                </button>
              </div>

              {#if panel.hasPushRisk}
                <div class="risk-box">
                  Pushed bank content may include proprietary curriculum, unpublished assessments, or student-identifying material. Check repository visibility and collaborators before pushing.
                </div>
              {/if}
            </section>

            <section class="settings-section">
              <div class="section-heading">
                <div>
                  <h4>Configured Remotes</h4>
                  <p>Choose which remote the header Sync panel will use for daily fetch, pull, and push operations.</p>
                </div>
                <button onclick={onsync}>Open Sync Panel</button>
              </div>

              {#if panel.remotes.length > 0}
                <div class="remote-list">
                  {#each panel.remotes as remote}
                    <div class="remote-row" class:remote-row-active={remote.name === panel.remoteName}>
                      <div>
                        <strong>{remote.name}</strong>
                        <span>{remoteLabel(remote.kind)} - {remote.branch}</span>
                      </div>
                      <code>{remote.kind === 'github' && remote.github ? `${remote.github.owner}/${remote.github.repo}` : remote.kind}</code>
                      <button class="ghost compact-button" onclick={() => void panel.selectRemote(remote.name)} disabled={busy || remote.name === panel.remoteName}>
                        {remote.name === panel.remoteName ? 'Active' : 'Use'}
                      </button>
                    </div>
                  {/each}
                </div>
              {:else}
                <p class="muted">No GitHub remotes are configured yet.</p>
              {/if}
            </section>

            <section class="settings-section">
              <div class="section-heading">
                <div>
                  <h4>Clone Existing Repository</h4>
                  <p>Importing a repo replaces the current browser bank after the remote snapshot is validated.</p>
                </div>
              </div>

              <label class="check-row import-confirm">
                <input type="checkbox" bind:checked={panel.acknowledgeImportReplace} disabled={busy} />
                <span>Delete the current local bank in this browser and replace it with the selected remote after validation.</span>
              </label>
              <button class="primary" onclick={() => panel.cloneSelectedRepositoryIntoApp()} disabled={!panel.canCloneSelectedRepository}>
                {panel.busy === 'clone-remote' ? 'Importing...' : 'Clone Selected Repo'}
              </button>
            </section>

            <section class="settings-section">
              <div class="section-heading">
                <div>
                  <h4>Google Drive</h4>
                  <p>Choose a Drive folder for this bank, then upload class-backed questions and saved tests there.</p>
                </div>
                <button onclick={ongoogleDrive}>Open Drive Setup</button>
              </div>
            </section>
          </section>
        {:else if activeTab === 'theme'}
          <section class="pane-section">
            <div class="pane-heading">
              <h3>Theme</h3>
              <p>Choose the app color theme. The choice is stored in this browser.</p>
            </div>

            <div class="theme-groups">
              {#each themeGroups as group}
                <div class="theme-group">
                  <div class="theme-group-label">{group.label}</div>
                  <div class="theme-grid">
                    {#each group.themes as theme}
                      <button
                        class="theme-tile"
                        class:active={activeTheme === theme.id}
                        onclick={() => onselectTheme(theme.id)}
                        style="--bg: {theme.bg}; --accent: {theme.accent};"
                        title="Switch to {theme.label} theme"
                      >
                        <span class="theme-preview"></span>
                        <span>{theme.label}</span>
                        {#if activeTheme === theme.id}<strong>Selected</strong>{/if}
                      </button>
                    {/each}
                  </div>
                </div>
              {/each}
            </div>
          </section>
        {:else if activeTab === 'builder'}
          <section class="pane-section">
            <div class="pane-heading">
              <h3>Test Builder Defaults</h3>
              <p>These values are applied when you start a new unsaved test. Existing drafts and saved tests keep their own settings.</p>
            </div>

            <section class="settings-section">
              <h4>Output</h4>
              <div class="builder-grid">
                <label>
                  <span>Default instructions</span>
                  <input bind:value={builderDefaults.instructions} />
                </label>
                <label>
                  <span>Answer space (cm)</span>
                  <input type="number" min="0" max="20" step="0.5" bind:value={builderDefaults.answerSpace} />
                </label>
                <label>
                  <span>Font size</span>
                  <select bind:value={builderDefaults.fontSize}>
                    <option value={10}>10 pt</option>
                    <option value={11}>11 pt</option>
                    <option value={12}>12 pt</option>
                  </select>
                </label>
                <label>
                  <span>Paper</span>
                  <select bind:value={builderDefaults.paper}>
                    <option value="us-letter">US Letter</option>
                    <option value="us-legal">US Legal</option>
                    <option value="us-ledger">US Ledger / Tabloid</option>
                    <option value="a3">A3</option>
                    <option value="a4">A4</option>
                    <option value="a5">A5</option>
                    <option value="b4">B4</option>
                    <option value="b5">B5</option>
                  </select>
                </label>
                <label>
                  <span>Margin (inches)</span>
                  <input type="number" min="0.5" max="2" step="0.25" bind:value={builderDefaults.marginIn} />
                </label>
              </div>

              <div class="check-grid">
                <label class="check-row">
                  <input type="checkbox" bind:checked={builderDefaults.mcqFirst} />
                  <span>Put MCQs first</span>
                </label>
                <label class="check-row">
                  <input type="checkbox" bind:checked={builderDefaults.showPoints} />
                  <span>Show point values</span>
                </label>
                <label class="check-row">
                  <input type="checkbox" bind:checked={builderDefaults.pointsBold} disabled={!builderDefaults.showPoints} />
                  <span>Bold point values</span>
                </label>
                <label class="check-row">
                  <input type="checkbox" bind:checked={builderDefaults.showAnswerKey} />
                  <span>Include answer key</span>
                </label>
                <label class="check-row">
                  <input type="checkbox" bind:checked={builderDefaults.mcqFullSolutions} disabled={!builderDefaults.showAnswerKey} />
                  <span>Include full MCQ solutions</span>
                </label>
              </div>
            </section>

            <section class="settings-section">
              <h4>Graph Defaults</h4>
              <div class="builder-grid">
                <label class="check-row">
                  <input type="checkbox" bind:checked={builderDefaults.graphDefaults.showGrid} />
                  <span>Show grid</span>
                </label>
                <label>
                  <span>Grid color</span>
                  <input bind:value={builderDefaults.graphDefaults.gridColor} placeholder="silver" />
                </label>
                <label>
                  <span>Axis weight (px)</span>
                  <input type="number" min="0.5" max="4" step="0.5" bind:value={builderDefaults.graphDefaults.axisWeight} />
                </label>
                <label>
                  <span>Curve weight (px)</span>
                  <input type="number" min="0.5" max="4" step="0.5" bind:value={builderDefaults.graphDefaults.curveWeight} />
                </label>
                <label>
                  <span>Asymptote color</span>
                  <input bind:value={builderDefaults.graphDefaults.asymptoteColor} placeholder="red" />
                </label>
                <label>
                  <span>Width (cm)</span>
                  <input type="number" min="2" max="15" step="0.5" bind:value={builderDefaults.graphDefaults.defaultWidth} />
                </label>
                <label>
                  <span>Height (cm)</span>
                  <input type="number" min="2" max="15" step="0.5" bind:value={builderDefaults.graphDefaults.defaultHeight} />
                </label>
                <label>
                  <span>X tick step</span>
                  <input type="number" min="0.1" step="0.1" bind:value={builderDefaults.graphDefaults.xStep} />
                </label>
                <label>
                  <span>Y tick step</span>
                  <input type="number" min="0.1" step="0.1" bind:value={builderDefaults.graphDefaults.yStep} />
                </label>
              </div>
            </section>

            <div class="button-row">
              <button class="primary" onclick={saveBuilderDefaults} disabled={!builderDefaultsDirty}>Save Defaults</button>
              <button class="ghost" onclick={resetBuilderDefaults}>Reset Defaults</button>
            </div>
          </section>
        {:else}
          <section class="pane-section">
            <div class="pane-heading">
              <h3>More Settings</h3>
              <p>This area is ready for future app settings.</p>
            </div>

            <div class="action-card">
              <div>
                <strong>Help</strong>
                <span>Open the README and app help.</span>
              </div>
              <button onclick={onhelp}>Open Help</button>
            </div>

            <div class="action-card secondary-card">
              <div>
                <strong>Tutorial</strong>
                <span>Restart the guided walkthrough.</span>
              </div>
              <button onclick={ontutorial}>Restart Tutorial</button>
            </div>
          </section>
        {/if}
      </div>
    </div>

    <footer>
      <span>Settings are saved in this browser. GitHub tokens are stored separately from repo data.</span>
      <button onclick={onclose}>Done</button>
    </footer>
  </section>
</div>

<style>
  .settings-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 250;
    padding: 1rem;
  }

  .settings-card {
    width: 960px;
    max-width: 100%;
    min-height: 560px;
    max-height: calc(100vh - 2rem);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: 0 8px 40px rgba(0, 0, 0, 0.25);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.85rem 1.25rem;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  header > div {
    flex: 1;
    min-width: 0;
  }

  h2,
  h3,
  h4,
  p {
    margin: 0;
  }

  h2 {
    font-size: 15px;
    font-weight: 600;
  }

  h3,
  h4 {
    font-size: 14px;
    font-weight: 600;
  }

  header p,
  .pane-heading p,
  .section-heading p,
  footer,
  .action-card span,
  .settings-tabs small,
  .muted {
    color: var(--text-2);
  }

  header p,
  .section-heading p {
    margin-top: 0.2rem;
    font-size: 12px;
    line-height: 1.4;
  }

  .icon-close {
    width: 28px;
    height: 28px;
    padding: 0;
    border-radius: 50%;
  }

  .settings-body {
    display: grid;
    grid-template-columns: 230px minmax(0, 1fr);
    flex: 1;
    min-height: 0;
  }

  .settings-tabs {
    background: var(--bg-2);
    border-right: 1px solid var(--border);
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .settings-tabs button {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.15rem;
    width: 100%;
    padding: 0.65rem 0.7rem;
    border-radius: 6px;
    border: 1px solid transparent;
    background: transparent;
    color: var(--text);
    text-align: left;
    cursor: pointer;
  }

  .settings-tabs button:hover {
    background: var(--bg-3);
  }

  .settings-tabs button.active {
    background: var(--bg);
    border-color: var(--border);
    box-shadow: 0 1px 3px rgba(0,0,0,0.08);
  }

  .settings-tabs span {
    font-size: 13px;
    font-weight: 600;
  }

  .settings-tabs small {
    font-size: 11px;
  }

  .settings-pane {
    min-width: 0;
    overflow: auto;
  }

  .pane-section {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1.1rem 1.25rem 1.25rem;
  }

  .pane-heading,
  .section-heading {
    display: flex;
    gap: 1rem;
  }

  .pane-heading {
    flex-direction: column;
    gap: 0.25rem;
  }

  .section-heading {
    align-items: flex-start;
    justify-content: space-between;
  }

  .section-heading > div {
    min-width: 0;
  }

  .pane-heading p {
    font-size: 13px;
    line-height: 1.45;
  }

  .settings-section,
  .action-card {
    border: 1px solid var(--border);
    border-radius: 8px;
    background: color-mix(in srgb, var(--bg-2) 42%, var(--bg));
  }

  .settings-section {
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
    padding: 0.9rem;
  }

  .action-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.85rem 0.95rem;
  }

  .secondary-card {
    background: var(--bg-2);
  }

  .action-card > div {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    min-width: 0;
  }

  .action-card strong {
    font-size: 13px;
    color: var(--text);
  }

  .action-card span,
  .muted {
    font-size: 12px;
    line-height: 1.4;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    min-width: 0;
    font-size: 12px;
    color: var(--text-2);
  }

  input,
  select {
    width: 100%;
    min-width: 0;
  }

  .token-row,
  .remote-form,
  .builder-grid,
  .check-grid {
    display: grid;
    gap: 0.7rem;
  }

  .remote-form,
  .builder-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .check-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .check-row {
    flex-direction: row;
    align-items: center;
    gap: 0.45rem;
    color: var(--text);
  }

  .check-row input {
    width: auto;
    flex-shrink: 0;
  }

  .button-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .button-row.wrap {
    flex-wrap: wrap;
  }

  .inline-action {
    margin-top: 0.3rem;
    width: fit-content;
  }

  .message,
  .risk-box {
    border: 1px solid var(--border);
    border-radius: 7px;
    padding: 0.65rem 0.75rem;
    font-size: 12px;
    line-height: 1.45;
    background: var(--bg-2);
  }

  .message-error {
    border-color: color-mix(in srgb, var(--danger) 55%, var(--border));
    color: var(--danger);
  }

  .message-success {
    border-color: color-mix(in srgb, var(--success) 55%, var(--border));
    color: var(--success);
  }

  .message-warning,
  .risk-box {
    border-color: color-mix(in srgb, #d97706 55%, var(--border));
    color: #b45309;
  }

  .remote-list {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }

  .remote-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(120px, auto) auto;
    align-items: center;
    gap: 0.7rem;
    border: 1px solid var(--border);
    border-radius: 7px;
    background: var(--bg);
    padding: 0.6rem 0.7rem;
  }

  .remote-row-active {
    border-color: color-mix(in srgb, var(--primary) 45%, var(--border));
  }

  .remote-row > div {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 0;
  }

  .remote-row strong {
    font-size: 13px;
  }

  .remote-row span,
  .remote-row code {
    color: var(--text-2);
    font-size: 11px;
  }

  .compact-button {
    padding: 0.25rem 0.5rem;
  }

  .theme-groups {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .theme-group {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }

  .theme-group-label {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-2);
  }

  .theme-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    gap: 0.5rem;
  }

  .theme-tile {
    min-height: 78px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.4rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg);
    color: var(--text);
    padding: 0.65rem;
    text-align: left;
    cursor: pointer;
  }

  .theme-tile:hover {
    background: var(--bg-2);
  }

  .theme-tile.active {
    border-color: color-mix(in srgb, var(--primary) 55%, var(--border));
    background: color-mix(in srgb, var(--primary) 9%, var(--bg));
  }

  .theme-tile span:not(.theme-preview) {
    font-size: 12px;
    font-weight: 600;
  }

  .theme-tile strong {
    color: var(--primary);
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .theme-preview {
    width: 100%;
    height: 24px;
    border-radius: 5px;
    background:
      linear-gradient(90deg, var(--bg) 0 58%, var(--accent) 58% 100%);
    border: 1px solid color-mix(in srgb, var(--accent) 60%, var(--border));
    box-shadow: inset 0 0 0 3px color-mix(in srgb, var(--bg) 65%, transparent);
  }

  footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.75rem 1.25rem;
    border-top: 1px solid var(--border);
    flex-shrink: 0;
    font-size: 12px;
  }

  @media (max-width: 720px) {
    .settings-card {
      min-height: min(660px, calc(100vh - 2rem));
    }

    .settings-body {
      grid-template-columns: 1fr;
    }

    .settings-tabs {
      border-right: 0;
      border-bottom: 1px solid var(--border);
      flex-direction: row;
      overflow-x: auto;
    }

    .settings-tabs button {
      min-width: 150px;
    }

    .remote-form,
    .builder-grid,
    .check-grid,
    .remote-row {
      grid-template-columns: 1fr;
    }

    .action-card,
    footer,
    .section-heading {
      align-items: stretch;
      flex-direction: column;
    }
  }
</style>
