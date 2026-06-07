<script lang="ts">
  import { onMount } from 'svelte';
  import { gitPanelState } from '../git/gitPanelState.svelte.ts';
  import type { RepoStatusEntry } from '../git/repoBackend.ts';

  interface Props {
    onclose: () => void;
    onsettings: () => void;
  }

  const { onclose, onsettings }: Props = $props();
  const panel = gitPanelState;

  let commitMessage = $state('Update test bank');

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
        <p>Refresh the local working tree, then commit, fetch, pull, or push a configured remote.</p>
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

      <section class="section workflow-section">
        <div class="section-header compact-header">
          <div>
            <h3>Git Workflow</h3>
            <p>Refresh the working tree from app data, commit it, then fetch, pull, or push the active remote.</p>
          </div>
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

        <div class="remote-switcher primary-remote">
          <label>
            <span>Active remote</span>
            <select value={panel.remoteName} onchange={(e) => void panel.selectRemote(e.currentTarget.value)} disabled={busy || panel.remotes.length === 0}>
              {#if panel.remotes.length === 0}
                <option value={panel.remoteName}>{panel.remoteName}</option>
              {:else}
                {#each panel.remotes as remote}
                  <option value={remote.name}>{remote.name} - {remoteLabel(remote.kind)} - {remote.branch}</option>
                {/each}
              {/if}
            </select>
          </label>
          <div class="active-remote-note">
            {#if panel.currentRemote}
              Operations target <strong>{panel.currentRemote.name}</strong>.
            {:else}
              Save a GitHub remote in Settings before using fetch, pull, or push.
            {/if}
          </div>
          <button class="ghost" onclick={onsettings} disabled={busy}>GitHub Settings</button>
        </div>

        <form
          class="commit-row"
          onsubmit={(e) => {
            e.preventDefault();
            void panel.commit(commitMessage);
          }}
        >
          <button
            onclick={() => panel.projectAppData()}
            disabled={busy}
            type="button"
            title="Refreshes the local Git working tree from current app data"
          >
            {panel.busy === 'project' ? 'Refreshing...' : 'Refresh Working Tree'}
          </button>
          <label>
            <span>Commit message</span>
            <input bind:value={commitMessage} placeholder="Update test bank" disabled={busy} autocomplete="off" />
          </label>
          <button class="primary" type="submit" disabled={busy || !commitMessage.trim()} title="git commit">
            {panel.busy === 'commit' ? 'Committing...' : 'Commit'}
          </button>
        </form>

        <div class="button-row remote-actions">
          <button onclick={() => panel.fetch()} disabled={!panel.canRunRemoteOperation} title="git fetch">
            {panel.busy === 'fetch' ? 'Fetching...' : 'Fetch'}
          </button>
          <button onclick={() => panel.pull()} disabled={!panel.canRunRemoteOperation} title="git pull --ff-only">
            {panel.busy === 'pull' ? 'Pulling...' : 'Pull'}
          </button>
          <button class="primary" onclick={() => panel.push()} disabled={!panel.canRunRemoteOperation} title="git push">
            {panel.busy === 'push' ? 'Pushing...' : 'Push'}
          </button>
        </div>

        <p class="muted">
          Diverged histories stop with local and remote commit ids. This phase does not write conflict markers into questions or open a merge picker.
        </p>
      </section>

      <div class="details-grid">
        <section class="section detail-section">
          <div class="section-header compact-header">
            <div>
              <h3>Local Details</h3>
              <p>{panel.projectedAt ? `Working tree refreshed ${formatDate(panel.projectedAt)}` : 'Refresh the working tree before committing.'}</p>
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

          <div class="compact-list">
            <div class="list-title">Recent commits</div>
            {#if panel.commits.length > 0}
              {#each panel.commits.slice(0, 3) as commit}
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

        <section class="section detail-section">
          <div class="section-header compact-header">
            <div>
              <h3>Configured Remotes</h3>
              <p>Configure GitHub credentials and repositories in Settings.</p>
            </div>
            <button class="ghost" onclick={onsettings} disabled={busy}>Manage remotes, tokens, or clone/import in Settings</button>
          </div>

          {#if panel.upstream}
            <div class="upstream">
              <span>Ahead {panel.upstream.ahead}</span>
              <span>Behind {panel.upstream.behind}</span>
              <span>Local {shortSha(panel.upstream.localSha)}</span>
              <span>Remote {shortSha(panel.upstream.remoteSha)}</span>
            </div>
          {/if}

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
            <div class="empty-remote">
              <p class="muted">No GitHub remotes are configured yet.</p>
              <button class="primary" onclick={onsettings} disabled={busy}>Configure GitHub Sync</button>
            </div>
          {/if}
        </section>
      </div>
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
    width: min(1080px, calc(100vw - 2rem));
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
    padding: 0.8rem 1rem;
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
    padding: 0.85rem;
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
  }

  .section {
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.75rem;
    background: color-mix(in srgb, var(--bg-2) 45%, var(--bg));
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
  }

  .workflow-section {
    border-color: color-mix(in srgb, var(--primary) 24%, var(--border));
    background: color-mix(in srgb, var(--primary) 5%, var(--bg));
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    align-items: flex-start;
  }

  .compact-header {
    align-items: center;
  }

  .section-header h3 {
    margin: 0;
    font-size: 15px;
  }

  .section-header > div {
    min-width: 0;
  }

  .facts-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.5rem;
  }

  .details-grid {
    display: grid;
    grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.25fr);
    gap: 0.65rem;
    align-items: start;
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
    padding: 0.5rem 0.6rem;
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
    padding: 0.55rem 0.6rem;
    display: grid;
    grid-template-columns: auto auto minmax(0, 1fr) auto;
    gap: 0.5rem;
    align-items: center;
    font-size: 13px;
  }

  .commit-row,
  .button-row,
  .remote-switcher,
  .empty-remote {
    display: flex;
    gap: 0.6rem;
    align-items: flex-end;
    flex-wrap: wrap;
  }

  .empty-remote {
    align-items: center;
    justify-content: space-between;
  }

  .commit-row label {
    flex: 1;
    min-width: 260px;
  }

  .commit-row > button {
    flex: 0 0 auto;
  }

  .primary-remote {
    align-items: center;
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
    padding: 0.25rem 0;
  }

  .list-row,
  .remote-row,
  .upstream,
  .progress-row {
    padding: 0.45rem 0.55rem;
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

  .remote-actions {
    align-items: stretch;
  }

  .remote-actions button {
    min-width: 140px;
  }

  .upstream {
    flex-wrap: wrap;
    color: var(--text-2);
    font-size: 12px;
  }

  .message {
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.55rem 0.65rem;
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

  .icon-btn {
    width: 28px;
    height: 28px;
    padding: 0;
    border-radius: 50%;
    flex: 0 0 auto;
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

    .facts-grid {
      grid-template-columns: 1fr;
    }

    .details-grid {
      grid-template-columns: 1fr;
    }

    .section-header,
    .last-commit {
      grid-template-columns: 1fr;
      display: flex;
      flex-direction: column;
      align-items: stretch;
    }

    .list-row,
    .remote-row,
    .empty-remote {
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
