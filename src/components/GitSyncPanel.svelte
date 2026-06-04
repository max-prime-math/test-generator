<script lang="ts">
  import { onMount } from 'svelte';
  import { gitPanelState } from '../git/gitPanelState.svelte.ts';
  import type { RepoStatusEntry } from '../git/repoBackend.ts';

  interface Props {
    onclose: () => void;
    ongoogleDrive: () => void;
  }

  const { onclose, ongoogleDrive }: Props = $props();
  const panel = gitPanelState;

  let commitMessage = $state('Update test bank');
  let manualRepoEntry = $state(false);

  const busy = $derived(Boolean(panel.busy));
  const statusSummary = $derived(formatStatusSummary(panel.status?.entries ?? []));
  const progressPercent = $derived(progressPercentage(panel.progress?.current, panel.progress?.total));

  onMount(() => {
    void panel.open();
  });

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && !busy) onclose();
  }

  function handleOverlayClick(e: MouseEvent) {
    if (e.target === e.currentTarget && !busy) onclose();
  }

  function formatDate(value: string | null | undefined): string {
    if (!value) return 'Not available';
    return new Date(value).toLocaleString();
  }

  function shortSha(value: string | null | undefined): string {
    return value ? value.slice(0, 7) : 'None';
  }

  function formatStatusSummary(entries: RepoStatusEntry[]): string {
    if (entries.length === 0) return 'Clean working tree';
    const staged = entries.filter((entry) => entry.staged).length;
    const worktree = entries.filter((entry) => entry.worktree).length;
    return `${entries.length} changed file${entries.length === 1 ? '' : 's'} (${staged} staged, ${worktree} worktree)`;
  }

  function remoteLabel(remoteKind: string): string {
    if (remoteKind === 'github') return 'GitHub';
    if (remoteKind === 'google-drive') return 'Google Drive';
    return remoteKind;
  }

  function progressPercentage(current: number | undefined, total: number | undefined): number | null {
    if (typeof current !== 'number' || typeof total !== 'number' || total <= 0) return null;
    return Math.max(0, Math.min(100, Math.round((current / total) * 100)));
  }

  function progressPhaseLabel(phase: string): string {
    if (phase === 'clone') return 'Clone';
    if (phase === 'checkout') return 'Checkout';
    if (phase === 'import') return 'Import';
    return phase.charAt(0).toUpperCase() + phase.slice(1);
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div
  class="overlay"
  role="dialog"
  aria-modal="true"
  tabindex="-1"
  onclick={handleOverlayClick}
  onkeydown={(e) => e.key === 'Escape' && !busy && onclose()}
>
  <section class="panel" role="document" tabindex="-1" aria-labelledby="git-panel-title">
    <header class="panel-header">
      <div>
        <h2 id="git-panel-title">Git and Remotes</h2>
        <p>Commit local Test Generator data, then fetch, fast-forward pull, or push a configured remote.</p>
      </div>
      <button class="ghost icon-btn" onclick={onclose} disabled={busy} title="Close">x</button>
    </header>

    <div class="panel-body">
      {#if panel.message}
        <div class:message-error={panel.message.tone === 'error'} class:message-success={panel.message.tone === 'success'} class:message-warning={panel.message.tone === 'warning'} class="message">
          {panel.message.text}
        </div>
      {/if}

      {#if panel.progress}
        <div class="progress-row">
          <div class="progress-copy">
            <strong>{progressPhaseLabel(panel.progress.phase)}</strong>
            <span>{panel.progress.message}</span>
          </div>
          <div class="progress-track" aria-label={panel.progress.message}>
            {#if progressPercent !== null}
              <div class="progress-fill" style={`width: ${progressPercent}%`}></div>
            {:else}
              <div class="progress-fill progress-fill-indeterminate"></div>
            {/if}
          </div>
          {#if progressPercent !== null}
            <code>{progressPercent}%</code>
          {/if}
        </div>
      {/if}

      <section class="section">
        <div class="section-header">
          <div>
            <h3>Local Repository</h3>
            <p>{panel.projectedAt ? `App data projected ${formatDate(panel.projectedAt)}` : 'Current app data has not been projected into the git working tree in this panel yet.'}</p>
          </div>
          <button onclick={() => panel.projectAppData()} disabled={busy}>
            {panel.busy === 'project' ? 'Projecting...' : 'Project App Data'}
          </button>
        </div>

        <div class="facts-grid">
          <div class="fact">
            <span>Branch</span>
            <strong>{panel.status?.branch ?? panel.branch}</strong>
          </div>
          <div class="fact">
            <span>Status</span>
            <strong>{statusSummary}</strong>
          </div>
          <div class="fact">
            <span>HEAD</span>
            <strong>{shortSha(panel.status?.headSha)}</strong>
          </div>
          <div class="fact">
            <span>Changed Files</span>
            <strong>{panel.changedFileCount ?? 'Unknown'}</strong>
          </div>
        </div>

        <div class="last-commit">
          <span>Last local commit</span>
          {#if panel.lastCommit}
            <strong>{panel.lastCommit.shortSha}</strong>
            <span>{panel.lastCommit.message}</span>
            <small>{formatDate(panel.lastCommit.authoredAt)}</small>
          {:else}
            <span>No local commits yet.</span>
          {/if}
        </div>

        <form
          class="commit-row"
          onsubmit={(e) => {
            e.preventDefault();
            void panel.commit(commitMessage);
          }}
        >
          <label>
            <span>Commit message</span>
            <input bind:value={commitMessage} placeholder="Update test bank" disabled={busy} autocomplete="off" />
          </label>
          <button class="primary" type="submit" disabled={busy || !commitMessage.trim()}>
            {panel.busy === 'commit' ? 'Committing...' : 'Commit Current App Data'}
          </button>
        </form>

        <div class="compact-list">
          <div class="list-title">Recent commits</div>
          {#if panel.commits.length > 0}
            {#each panel.commits.slice(0, 6) as commit}
              <div class="list-row">
                <code>{commit.shortSha}</code>
                <span>{commit.message}</span>
                <small>{formatDate(commit.authoredAt)}</small>
              </div>
            {/each}
          {:else}
            <p>No commits are recorded yet.</p>
          {/if}
        </div>
      </section>

      <section class="section">
        <div class="section-header">
          <div>
            <h3>Configured Remotes</h3>
            <p>GitHub is the only working repo remote in this phase. Google Drive can remain connected, but it is not repo sync yet.</p>
          </div>
          <div class="section-actions">
            <button class="ghost" onclick={() => panel.startNewRemote()} disabled={busy}>New GitHub Remote</button>
            <button class="ghost" onclick={ongoogleDrive} disabled={busy}>Google Drive Connection Only</button>
          </div>
        </div>

        <div class="remote-switcher">
          <label>
            <span>Active remote</span>
            <select value={panel.remoteName} onchange={(e) => void panel.selectRemote(e.currentTarget.value)} disabled={busy || panel.remotes.length === 0}>
              {#if panel.remotes.length === 0}
                <option value={panel.remoteName}>{panel.remoteName}</option>
              {:else}
                {#each panel.remotes as remote}
                  <option value={remote.name}>{remote.name} · {remoteLabel(remote.kind)} · {remote.branch}</option>
                {/each}
              {/if}
            </select>
          </label>
          <div class="active-remote-note">
            {#if panel.currentRemote}
              Operations below target <strong>{panel.currentRemote.name}</strong>.
            {:else}
              Save this remote config before using fetch, pull, or push.
            {/if}
          </div>
        </div>

        {#if panel.remotes.length > 0}
          <div class="remote-list">
            {#each panel.remotes as remote}
              <div class="remote-row" class:remote-row-active={remote.name === panel.remoteName}>
                <div>
                  <strong>{remote.name}</strong>
                  <span>{remoteLabel(remote.kind)} · {remote.branch}</span>
                </div>
                <code>{remote.kind === 'github' && remote.github ? `${remote.github.owner}/${remote.github.repo}` : remote.kind}</code>
                <button class="ghost compact-button" onclick={() => void panel.selectRemote(remote.name)} disabled={busy || remote.name === panel.remoteName}>
                  {remote.name === panel.remoteName ? 'Active' : 'Use'}
                </button>
              </div>
            {/each}
          </div>
        {:else}
          <p class="muted">No remotes are configured.</p>
        {/if}

        {#if panel.upstream}
          <div class="upstream">
            <span>Ahead {panel.upstream.ahead}</span>
            <span>Behind {panel.upstream.behind}</span>
            <span>Local {shortSha(panel.upstream.localSha)}</span>
            <span>Remote {shortSha(panel.upstream.remoteSha)}</span>
          </div>
        {/if}
      </section>

      <section class="section">
        <div class="section-header">
          <div>
            <h3>GitHub Remote Setup</h3>
            <p>Use an expiring fine-grained token scoped to one repository with Contents read/write. Do not paste account sign-in credentials.</p>
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
          <button onclick={() => panel.connectGitHubToken()} disabled={busy || !panel.tokenInput.trim()}>
            {panel.busy === 'connect-token' ? 'Connecting...' : panel.tokenConnected ? 'Replace Token' : 'Connect Token'}
          </button>
          <button class="ghost danger" onclick={() => panel.disconnectGitHubToken()} disabled={busy || !panel.tokenConnected}>
            Clear Token
          </button>
        </div>

        <p class="muted">
          Token storage is {panel.tokenConnected ? `${panel.tokenPersistence} for ${panel.remoteName}` : 'not connected'}. Persistent storage is optional and readable by JavaScript running on this origin.
        </p>

        <div class="remote-form">
          <label>
            <span>Remote name</span>
            <input bind:value={panel.remoteName} disabled={busy} autocomplete="off" />
          </label>
          <label>
            <span>Owner</span>
            <input bind:value={panel.owner} list="github-owner-list" disabled={busy} autocomplete="off" autocapitalize="none" />
            <datalist id="github-owner-list">
              {#each panel.owners as owner}
                <option value={owner.login}>{owner.type}</option>
              {/each}
            </datalist>
          </label>
          <label>
            <span>Repository</span>
            {#if panel.repositories.length > 0 && !manualRepoEntry}
              <select value={panel.repoName} onchange={(e) => panel.selectRepository(e.currentTarget.value)} disabled={busy}>
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
            {/if}
          </label>
          <label>
            <span>Branch</span>
            {#if panel.branches.length > 0}
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

        <div class="button-row">
          <button onclick={() => panel.loadRepositories()} disabled={busy || !panel.tokenConnected || !panel.owner.trim()}>
            {panel.busy === 'load-repos' ? 'Loading...' : 'Load Repositories'}
          </button>
          <button onclick={() => panel.loadBranches()} disabled={busy || !panel.tokenConnected || !panel.owner.trim() || !panel.repoName.trim()}>
            {panel.busy === 'load-branches' ? 'Loading...' : 'Load Branches'}
          </button>
          <button class="primary" onclick={() => panel.saveRemoteConfig()} disabled={busy || !panel.owner.trim() || !panel.repoName.trim() || !panel.branch.trim()}>
            {panel.busy === 'save-remote' ? 'Saving...' : 'Save Remote Config'}
          </button>
        </div>

        {#if panel.hasPushRisk}
          <div class="risk-box">
            <span>
              Pushed bank content may include proprietary curriculum, unpublished assessments, or student-identifying material. Check repository visibility and collaborators before pushing to a public or broadly shared repo.
            </span>
          </div>
        {/if}
      </section>

      <section class="section">
        <div class="section-header">
          <div>
            <h3>Remote Operations</h3>
            <p>Fetch reads remote commits. Pull is fast-forward only. Push refuses remote histories that local commits do not contain.</p>
          </div>
        </div>

        <div class="button-row remote-actions">
          <button onclick={() => panel.fetch()} disabled={!panel.canRunRemoteOperation}>
            {panel.busy === 'fetch' ? 'Fetching...' : 'Fetch'}
          </button>
          <button onclick={() => panel.pull()} disabled={!panel.canRunRemoteOperation}>
            {panel.busy === 'pull' ? 'Pulling...' : 'Pull Fast-Forward Only'}
          </button>
          <button class="primary" onclick={() => panel.push()} disabled={!panel.canRunRemoteOperation}>
            {panel.busy === 'push' ? 'Pushing...' : 'Push'}
          </button>
        </div>

        <p class="muted">
          Diverged histories stop with local and remote commit ids. This phase does not write conflict markers into questions or open a merge picker.
        </p>

        <div class="import-box">
          <div>
            <strong>New computer or shared bank</strong>
            <p>Fetch the active remote, validate its Test Generator repo snapshot, replace current browser app data, and reload into that bank. This is a clone/import action, not a merge.</p>
          </div>
          <label class="check-row import-confirm">
            <input type="checkbox" bind:checked={panel.acknowledgeImportReplace} disabled={busy} />
            <span>Replace current local app data with the active remote after validation.</span>
          </label>
          <button
            class="primary"
            onclick={() => panel.cloneActiveRemoteIntoApp()}
            disabled={!panel.canRunRemoteOperation || !panel.acknowledgeImportReplace}
          >
            {panel.busy === 'clone-remote' ? 'Importing...' : 'Clone/Import Active Remote'}
          </button>
        </div>
      </section>
    </div>
  </section>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    z-index: 220;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
  }

  .panel {
    width: min(980px, calc(100vw - 2rem));
    max-height: min(900px, calc(100vh - 2rem));
    display: flex;
    flex-direction: column;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: var(--shadow);
    overflow: hidden;
  }

  .panel-header {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
    padding: 1.15rem 1.35rem;
    border-bottom: 1px solid var(--border);
  }

  .panel-header h2 {
    margin: 0;
    font-size: 19px;
    line-height: 1.2;
  }

  .panel-header p,
  .section-header p,
  .muted {
    margin: 0.25rem 0 0;
    color: var(--text-2);
    font-size: 12px;
  }

  .panel-header > div {
    flex: 1;
    min-width: 0;
  }

  .panel-body {
    overflow: auto;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
  }

  .section {
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1rem;
    background: color-mix(in srgb, var(--bg-2) 45%, var(--bg));
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    align-items: flex-start;
  }

  .section-actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .section-header h3 {
    margin: 0;
    font-size: 15px;
  }

  .section-header > div {
    min-width: 0;
  }

  .facts-grid,
  .remote-form {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.6rem;
  }

  .remote-form {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    align-items: end;
  }

  .fact,
  .last-commit,
  .remote-row,
  .list-row,
  .upstream,
  .progress-row {
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
  }

  .fact {
    padding: 0.65rem;
    min-width: 0;
  }

  .fact span,
  .last-commit > span:first-child,
  .list-title {
    display: block;
    color: var(--text-2);
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .fact strong,
  .last-commit strong {
    display: block;
    margin-top: 0.15rem;
    font-size: 13px;
    overflow-wrap: anywhere;
  }

  .last-commit {
    padding: 0.65rem;
    display: grid;
    grid-template-columns: auto auto minmax(0, 1fr) auto;
    gap: 0.5rem;
    align-items: center;
    font-size: 13px;
  }

  .commit-row,
  .token-row,
  .button-row,
  .remote-switcher {
    display: flex;
    gap: 0.6rem;
    align-items: flex-end;
    flex-wrap: wrap;
  }

  .commit-row label,
  .token-row label {
    flex: 1;
    min-width: 220px;
  }

  .check-row,
  .risk-box {
    display: flex !important;
    align-items: center;
    gap: 0.45rem;
    color: var(--text);
    font-size: 12px;
  }

  .check-row input {
    width: auto;
    flex: 0 0 auto;
  }

  .risk-box {
    margin: 0;
    padding: 0.75rem;
    border: 1px solid color-mix(in srgb, var(--danger) 30%, var(--border));
    border-radius: 6px;
    background: color-mix(in srgb, var(--danger) 8%, var(--bg));
  }

  .compact-list,
  .remote-list {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .remote-switcher label {
    flex: 1;
    min-width: 240px;
  }

  .active-remote-note {
    flex: 2;
    min-width: 240px;
    color: var(--text-2);
    font-size: 12px;
    padding: 0.5rem 0;
  }

  .list-row,
  .remote-row,
  .upstream,
  .progress-row {
    padding: 0.55rem 0.65rem;
    display: flex;
    gap: 0.6rem;
    align-items: center;
    min-width: 0;
  }

  .list-row span,
  .remote-row span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .list-row code,
  .remote-row code {
    color: var(--primary);
  }

  .list-row small,
  .last-commit small {
    color: var(--text-2);
    margin-left: auto;
    white-space: nowrap;
  }

  .remote-row {
    justify-content: space-between;
  }

  .remote-row-active {
    border-color: color-mix(in srgb, var(--primary) 40%, var(--border));
    background: color-mix(in srgb, var(--primary) 7%, var(--bg));
  }

  .remote-row > div {
    display: flex;
    gap: 0.5rem;
    align-items: baseline;
    min-width: 0;
  }

  .compact-button {
    flex: 0 0 auto;
    padding: 3px 8px;
  }

  .upstream {
    flex-wrap: wrap;
    color: var(--text-2);
    font-size: 12px;
  }

  .message {
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.7rem 0.8rem;
    font-size: 13px;
    background: var(--bg);
  }

  .message-error {
    color: var(--danger);
    border-color: color-mix(in srgb, var(--danger) 35%, var(--border));
    background: color-mix(in srgb, var(--danger) 8%, var(--bg));
  }

  .message-success {
    color: var(--primary);
    border-color: color-mix(in srgb, var(--primary) 35%, var(--border));
    background: color-mix(in srgb, var(--primary) 8%, var(--bg));
  }

  .message-warning {
    border-color: color-mix(in srgb, #d97706 35%, var(--border));
    background: color-mix(in srgb, #d97706 10%, var(--bg));
  }

  .import-box {
    border: 1px solid color-mix(in srgb, var(--primary) 30%, var(--border));
    border-radius: 6px;
    background: color-mix(in srgb, var(--primary) 7%, var(--bg));
    padding: 0.75rem;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(230px, 0.8fr) auto;
    gap: 0.75rem;
    align-items: center;
  }

  .import-box strong {
    display: block;
    font-size: 13px;
  }

  .import-box p {
    margin: 0.2rem 0 0;
    color: var(--text-2);
    font-size: 12px;
  }

  .import-confirm {
    margin: 0;
  }

  .progress-row {
    justify-content: space-between;
    background: var(--bg);
    border-color: color-mix(in srgb, var(--primary) 30%, var(--border));
    flex-wrap: wrap;
  }

  .progress-copy {
    flex: 1 1 260px;
    min-width: 0;
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
  }

  .progress-copy strong {
    flex: 0 0 auto;
    font-size: 12px;
    color: var(--primary);
  }

  .progress-copy span {
    min-width: 0;
    color: var(--text-2);
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .progress-track {
    flex: 0 0 220px;
    width: 220px;
    height: 8px;
    overflow: hidden;
    border-radius: 999px;
    background: color-mix(in srgb, var(--primary) 14%, var(--border));
  }

  .progress-fill {
    height: 100%;
    border-radius: inherit;
    background: var(--primary);
    transition: width 180ms ease;
  }

  .progress-fill-indeterminate {
    width: 42%;
    animation: progress-slide 1.1s ease-in-out infinite;
  }

  .progress-row code {
    flex: 0 0 auto;
    color: var(--primary);
  }

  @keyframes progress-slide {
    0% {
      transform: translateX(-120%);
    }
    50% {
      transform: translateX(70%);
    }
    100% {
      transform: translateX(260%);
    }
  }

  .inline-action {
    margin-top: 0.35rem;
    width: 100%;
  }

  .icon-btn {
    width: 28px;
    height: 28px;
    padding: 0;
    border-radius: 50%;
    flex: 0 0 auto;
  }

  a {
    color: var(--primary);
    font-size: 12px;
    text-decoration: none;
  }

  a:hover {
    text-decoration: underline;
  }

  button:disabled,
  input:disabled,
  select:disabled {
    opacity: 0.55;
    cursor: default;
  }

  @media (max-width: 820px) {
    .panel {
      width: calc(100vw - 1rem);
      max-height: calc(100vh - 1rem);
    }

    .facts-grid,
    .remote-form {
      grid-template-columns: 1fr;
    }

    .section-header,
    .section-actions,
    .last-commit {
      grid-template-columns: 1fr;
      display: flex;
      flex-direction: column;
      align-items: stretch;
    }

    .list-row,
    .remote-row,
    .import-box {
      align-items: flex-start;
      flex-direction: column;
      display: flex;
    }

    .progress-track {
      flex-basis: 100%;
      width: 100%;
    }

    .list-row small,
    .last-commit small {
      margin-left: 0;
    }
  }
</style>
