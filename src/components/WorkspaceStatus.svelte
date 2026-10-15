<script lang="ts">
  import { APP_VERSION, BUILD_NUMBER } from '../lib/version';
  import { localWorkspace } from '../lib/local-workspace.svelte';
  import { testsFolderSync } from '../lib/tests-folder-sync.svelte';
  import { banksFolderSync } from '../lib/banks-folder-sync.svelte';
  let { onreview, showVersion = false }: { onreview: () => void; showVersion?: boolean } = $props();
  const progress = $derived(localWorkspace.loadingProgress);

  // Routine syncing says nothing. The bar appears only when something needs the teacher —
  // or for a startup check slow enough that its temporary sluggishness needs explaining.
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
      <span class="label" role="status">Loading workspace data — TestGen may be briefly unresponsive.</span>
      <span class="detail" title={progress.detail}>{progress.phase}{progress.detail ? ` · ${progress.detail}` : ''}{progress.total ? ` · ${progress.completed.toLocaleString()}/${progress.total.toLocaleString()} ${progress.unit}` : ''}</span>
      {#if localWorkspace.canStop}<button class="ghost small" onclick={() => localWorkspace.stopLoading()}>Stop checking</button>{/if}
      <div
        class="loading-progress"
        role="progressbar"
        aria-label={progress.phase}
        aria-valuemin={progress.total !== null && progress.total > 0 ? 0 : undefined}
        aria-valuemax={progress.total !== null && progress.total > 0 ? progress.total : undefined}
        aria-valuenow={progress.total !== null && progress.total > 0 ? progress.completed : undefined}
      >
        <span
          class:indeterminate={progress.total === null || progress.total <= 0}
          style:width={progress.total !== null && progress.total > 0 ? `${Math.min(100, progress.completed / progress.total * 100)}%` : undefined}
        ></span>
      </div>
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
  .loading-progress { flex: 1 0 100%; width: 100%; height: 3px; margin: -.05rem 0 0; border-radius: 999px; overflow: hidden; background: var(--border); }
  .loading-progress span { display: block; height: 100%; border-radius: inherit; background: var(--primary); transition: width .18s ease; }
  .loading-progress span.indeterminate { width: 35% !important; animation: loading-slide 1.15s ease-in-out infinite; }
  @keyframes loading-slide { from { transform: translateX(-110%); } to { transform: translateX(310%); } }
  @media (max-width: 760px) { .version-badge, .workspace-status.version-only { display: none; } .detail { display: none; } .label { flex: 1; } }
  @media (prefers-reduced-motion: reduce) { .loading-progress span { transition: none; } .loading-progress span.indeterminate { width: 100% !important; opacity: .65; animation: none; } }
</style>
