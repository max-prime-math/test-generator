<script lang="ts">
  import { APP_VERSION, BUILD_NUMBER } from '../lib/version';
  import { localWorkspace } from '../lib/local-workspace.svelte';
  import { testsFolderSync } from '../lib/tests-folder-sync.svelte';
  import { banksFolderSync } from '../lib/banks-folder-sync.svelte';
  let { onreview, showVersion = false }: { onreview: () => void; showVersion?: boolean } = $props();
  const progress = $derived(localWorkspace.loadingProgress);

  // Routine syncing says nothing. The bar appears only when something needs the teacher —
  // or for a startup check slow enough that "Stop checking" might be wanted.
  let slowStartup = $state(false);
  $effect(() => {
    if (!(localWorkspace.backgroundLoading && progress)) { slowStartup = false; return; }
    const timer = setTimeout(() => (slowStartup = true), 1000);
    return () => clearTimeout(timer);
  });
  const attention = $derived.by((): { text: string; detail?: string; action?: { label: string; run: () => void } } | null => {
    if (!localWorkspace.connected || localWorkspace.blocking) return null;
    if (localWorkspace.status === 'permission-needed') return { text: 'The workspace folder needs permission again', action: { label: 'Allow access', run: () => void localWorkspace.grantPermission() } };
    if (localWorkspace.status === 'paused') return { text: 'Syncing with the workspace folder is paused', action: { label: 'Resume', run: () => void localWorkspace.resumeLoading() } };
    if (localWorkspace.blockedShrinks.length) return { text: 'A bank would lose most of its questions — confirm or keep them', action: { label: 'Review', run: onreview } };
    if (banksFolderSync.review.length) return { text: `${banksFolderSync.review.length} bank ${banksFolderSync.review.length === 1 ? 'edit was' : 'edits were'} made on both computers`, action: { label: 'Review', run: onreview } };
    if (localWorkspace.status === 'error' || localWorkspace.error) return { text: 'Some changes are not in the workspace folder yet', detail: localWorkspace.error ?? '', action: { label: 'Details', run: onreview } };
    if (testsFolderSync.problems.length) return { text: 'Some saved tests are not in the folder yet', detail: testsFolderSync.problems.join(' · '), action: { label: 'Details', run: onreview } };
    return null;
  });
  const visible = $derived(showVersion || !!attention || slowStartup);
</script>

{#if visible}
  <footer class="workspace-status" class:version-only={!attention && !slowStartup} class:alert={!!attention} aria-label="Application status">
    {#if showVersion}<span class="version-badge">v{APP_VERSION} {BUILD_NUMBER}</span>{/if}
    {#if slowStartup && progress && !attention}
      <span class="activity" aria-hidden="true"></span>
      <span class="label" role="status">{progress.phase}{progress.total ? ` · ${progress.completed.toLocaleString()}/${progress.total.toLocaleString()}` : ''}</span>
      <span class="detail" title={progress.detail}>You can keep working.</span>
      {#if localWorkspace.canStop}<button class="ghost small" onclick={() => localWorkspace.stopLoading()}>Stop checking</button>{/if}
    {:else if attention}
      <span class="dot" aria-hidden="true"></span>
      <span class="label" role="alert">{attention.text}</span>
      {#if attention.detail}<span class="detail" title={attention.detail}>{attention.detail}</span>{/if}
      {#if attention.action}<button class="ghost small" onclick={attention.action.run}>{attention.action.label}</button>{/if}
    {/if}
  </footer>
{/if}

<style>
  .workspace-status { display: flex; flex-wrap: wrap; align-items: center; gap: .65rem; flex-shrink: 0; min-height: 30px; padding: .2rem .8rem; border-top: 1px solid var(--border); background: var(--bg-2); color: var(--text-2); font-size: .75rem; }
  .version-badge { flex-shrink: 0; white-space: nowrap; font-size: 11px; font-weight: 500; letter-spacing: .5px; }
  .label { min-width: 0; color: var(--text); overflow-wrap: anywhere; }
  .detail { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  button { margin-left: auto; flex-shrink: 0; }
  .dot { width: .55rem; height: .55rem; border-radius: 50%; background: var(--danger); flex-shrink: 0; }
  .activity { width: .65rem; height: .65rem; border-radius: 50%; border: 2px solid var(--border); border-top-color: var(--primary); animation: spin 1s linear infinite; flex-shrink: 0; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (max-width: 760px) { .version-badge, .workspace-status.version-only { display: none; } .detail { display: none; } .label { flex: 1; } }
  @media (prefers-reduced-motion: reduce) { .activity { animation: none; } }
</style>
