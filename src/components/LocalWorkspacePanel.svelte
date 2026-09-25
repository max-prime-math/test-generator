<script lang="ts">
  import { localWorkspace } from '../lib/local-workspace.svelte';
  import { localFolderBank } from '../lib/local-folder-bank.svelte';
  import { workspaceCatalog } from '../lib/workspace-catalog.svelte';
  let error = $state('');
  let pending = $state(false);
  const busy = $derived(pending || localWorkspace.busy || localWorkspace.status === 'loading' || localWorkspace.status === 'saving');
  async function run(action: () => Promise<void>) {
    pending = true; error = '';
    try { await action(); } catch (cause) { error = cause instanceof Error ? cause.message : String(cause); }
    finally { pending = false; }
  }
  async function choose() {
    if (localFolderBank.linkedToActiveBank) {
      if (!confirm('Disconnect the legacy bank folder before choosing a root workspace? Existing files remain unchanged.')) return;
      await localFolderBank.saveNow();
      await localFolderBank.disconnect();
    }
    await localWorkspace.chooseFolder();
  }
</script>

<section class="workspace-panel" aria-label="Independent workspace folders">
  <h3>Workspace folder</h3>
  <p>Choose one root with independent <code>banks/</code>, <code>tests/</code>, and <code>gradebook/</code>.</p>
  <p><code>banks/</code> can contain several banks. Build a test using questions from all workspace banks with the same class tag. Each test keeps its own question and image snapshots.</p>
  <p>Saved tests are organized as <code>tests/&lt;class-id&gt;/&lt;test-id&gt;/</code>. Share a class folder to share only that class’s tests. Tests without a class use <code>tests/_unclassified/</code>.</p>
  <p>Student names, rosters, and scores are saved only in <code>gradebook/</code>. Choose a private root, then share only the children you intend to share using your sync service. TestGen does not configure sharing permissions.</p>
  <p>Edits in TestGen autosave while the app is open. For banks or tests added or changed outside the app, wait for copying/sync to finish, then choose <strong>Reload workspace</strong>. Changes are not live-merged; reload replaces unsaved browser changes. Conflicts pause autosave and show a warning.</p>
  <p>On startup the cached browser copy stays editable while folders are checked in the background. Edits remain local until the check finishes. Existing folders changed outside the app require review before they replace browser data.</p>
  {#if localWorkspace.status === 'review-needed'}
    <div class="changes" role="status">
      <strong>Folder changes need review</strong>
      <ul>{#each localWorkspace.changedFolders as folder}<li>{folder}</li>{/each}</ul>
      <p>Your current work remains in this browser. Reload workspace replaces browser bank, test and gradebook data with the folder copies. Export any local changes you want to keep before reloading.</p>
    </div>
  {/if}
  {#if localWorkspace.connected}
    <p><strong>{localWorkspace.folderName}</strong> — {localWorkspace.status} · {workspaceCatalog.banks.length} banks</p>
    {#if localWorkspace.lastSavedAt}<p>Last saved: {new Date(localWorkspace.lastSavedAt).toLocaleTimeString()}</p>{/if}
    {#if localWorkspace.lastLoadedAt}<p>Last loaded: {new Date(localWorkspace.lastLoadedAt).toLocaleTimeString()}</p>{/if}
    <div class="buttons">
      {#if localWorkspace.status === 'permission-needed'}
        <button disabled={busy} onclick={() => run(() => localWorkspace.grantPermission())}>Allow workspace access</button>
      {:else if localWorkspace.status === 'paused'}
        <button disabled={busy} onclick={() => run(() => localWorkspace.resumeLoading())}>Load workspace</button>
      {:else if localWorkspace.status === 'review-needed'}
        <button disabled={busy} onclick={() => run(() => localWorkspace.resumeLoading())}>Check again</button>
        <button disabled={busy} onclick={() => run(() => localWorkspace.reload())}>Reload workspace…</button>
      {:else}
        {#if localWorkspace.status === 'error'}<button disabled={busy} onclick={() => run(() => localWorkspace.resumeLoading())}>Check again</button>{/if}
        <button disabled={busy || localWorkspace.status === 'error'} onclick={() => run(() => localWorkspace.saveNow())}>Save workspace</button>
        <button disabled={busy} onclick={() => run(() => localWorkspace.reload())}>Reload workspace</button>
        {#if !localWorkspace.activeBankIncluded}
          <button disabled={busy || localWorkspace.status === 'error'} onclick={() => run(() => localWorkspace.addActiveBank())}>Add active bank to workspace</button>
        {/if}
      {/if}
      <button disabled={busy} onclick={() => run(choose)}>Change workspace</button>
      <button disabled={busy} onclick={() => run(async () => {
        if (confirm('Disconnect the workspace? Folder files and browser data will be kept.')) await localWorkspace.disconnect();
      })}>Disconnect workspace</button>
    </div>
  {:else}
    <button class="primary" disabled={busy || !localWorkspace.supported} onclick={() => run(choose)}>Open workspace root</button>
  {/if}
  {#if error || localWorkspace.error}<p role="alert">{error || localWorkspace.error}</p>{/if}
</section>

<style>
  .workspace-panel { margin: 1rem; padding: 1rem; border: 1px solid var(--border); border-radius: 8px; }
  h3 { margin: 0 0 .6rem; }
  p { line-height: 1.5; font-size: .9rem; }
  .buttons { display: flex; gap: .5rem; flex-wrap: wrap; }
  button.primary { background: var(--accent, #2563eb); color: white; }
  [role="alert"] { color: var(--danger, #b91c1c); }
</style>
