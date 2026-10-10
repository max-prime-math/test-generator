<script lang="ts">
  import { APP_VERSION, BUILD_NUMBER } from '../lib/version';
  import { localWorkspace } from '../lib/local-workspace.svelte';
  import { testsFolderSync } from '../lib/tests-folder-sync.svelte';
  import { banksFolderSync } from '../lib/banks-folder-sync.svelte';
  let { onreview, showVersion = false }: { onreview: () => void; showVersion?: boolean } = $props();
  const progress = $derived(localWorkspace.loadingProgress);
</script>

{#if showVersion || (localWorkspace.connected && !localWorkspace.blocking)}
  <footer class="workspace-status" class:version-only={!localWorkspace.connected || localWorkspace.blocking} aria-label="Application status">
    {#if showVersion}<span class="version-badge">v{APP_VERSION} {BUILD_NUMBER}</span>{/if}
    {#if localWorkspace.connected && !localWorkspace.blocking}
    {#if localWorkspace.backgroundLoading && progress}
      <span class="activity" aria-hidden="true"></span>
      <span class="label" role="status">{progress.phase}{progress.total ? ` · ${progress.completed.toLocaleString()}/${progress.total.toLocaleString()}` : ''}</span>
      <span class="detail" title={progress.detail}>You can keep editing — changes are saved in this browser.</span>
      {#if localWorkspace.canStop}<button class="ghost small" onclick={() => localWorkspace.stopLoading()}>Stop checking</button>{/if}
    {:else if localWorkspace.status === 'review-needed'}
      <span class="label" role="status">Workspace changes found</span>
      <span class="detail">Your work is saved in this browser. Folder saving waits for review.</span>
      <button class="ghost small" onclick={onreview}>Review changes</button>
    {:else}
      <span class="label" role="status">
        {#if localWorkspace.status === 'saving'}Saved locally · Syncing to folder…
        {:else if localWorkspace.blockedShrinks.length}Save blocked · a bank would lose most of its questions
        {:else if localWorkspace.status === 'ready' && !localWorkspace.error}Saved locally · {localWorkspace.lastSavedAt ? `synced to folder ${new Date(localWorkspace.lastSavedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'workspace connected'}
        {:else if localWorkspace.status === 'ready'}Saved locally · some folder items need attention
        {:else}Saved locally · folder sync paused{/if}
      </span>
      {#if localWorkspace.error && localWorkspace.status === 'ready'}<button class="ghost small" onclick={() => void localWorkspace.saveNow().catch(() => undefined)}>Retry sync</button>{/if}
      {#if banksFolderSync.review.length}
        <span class="detail" role="status">{banksFolderSync.review.length} bank {banksFolderSync.review.length === 1 ? 'edit was' : 'edits were'} made on both computers.</span>
        <button class="ghost small" onclick={onreview}>Review</button>
      {/if}
      {#if testsFolderSync.problems.length}
        <span class="detail tests-problem" role="alert" title={testsFolderSync.problems.join('\n')}>Some saved tests are not in the folder yet: {testsFolderSync.problems.join(' · ')}. Retrying automatically.</span>
      {/if}
      <button class="ghost small" onclick={onreview}>Workspace</button>
    {/if}
    {/if}
  </footer>
{/if}

<style>
  .workspace-status { display: flex; flex-wrap: wrap; align-items: center; gap: .65rem; flex-shrink: 0; min-height: 30px; padding: .2rem .8rem; border-top: 1px solid var(--border); background: var(--bg-2); color: var(--text-2); font-size: .75rem; }
  .version-badge { flex-shrink: 0; white-space: nowrap; font-size: 11px; font-weight: 500; letter-spacing: .5px; }
  .label { min-width: 0; color: var(--text); overflow-wrap: anywhere; }
  .detail { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  button { margin-left: auto; flex-shrink: 0; }
  .activity { width: .65rem; height: .65rem; border-radius: 50%; border: 2px solid var(--border); border-top-color: var(--primary); animation: spin 1s linear infinite; flex-shrink: 0; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (max-width: 760px) { .version-badge, .workspace-status.version-only { display: none; } .detail { display: none; } .label { flex: 1; } }
  @media (prefers-reduced-motion: reduce) { .activity { animation: none; } }
</style>
