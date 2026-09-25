<script lang="ts">
  import { localWorkspace } from '../lib/local-workspace.svelte';
  let { onreview }: { onreview: () => void } = $props();
  const progress = $derived(localWorkspace.loadingProgress);
</script>

{#if localWorkspace.connected && !localWorkspace.blocking}
  <footer class="workspace-status" aria-label="Workspace status">
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
        {#if localWorkspace.status === 'saving'}Saving workspace…
        {:else if localWorkspace.status === 'ready' && !localWorkspace.error}Workspace connected{localWorkspace.lastSavedAt ? ` · saved ${new Date(localWorkspace.lastSavedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}
        {:else if localWorkspace.status === 'ready'}Some workspace items need attention
        {:else}Working from browser copy · folder saving paused{/if}
      </span>
      <button class="ghost small" onclick={onreview}>Workspace</button>
    {/if}
  </footer>
{/if}

<style>
  .workspace-status { display: flex; align-items: center; gap: .65rem; flex-shrink: 0; min-height: 30px; padding: .2rem .8rem; border-top: 1px solid var(--border); background: var(--bg-2); color: var(--text-2); font-size: .75rem; }
  .label { color: var(--text); }
  .detail { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  button { margin-left: auto; flex-shrink: 0; }
  .activity { width: .65rem; height: .65rem; border-radius: 50%; border: 2px solid var(--border); border-top-color: var(--primary); animation: spin 1s linear infinite; flex-shrink: 0; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (max-width: 760px) { .detail { display: none; } .label { flex: 1; } }
  @media (prefers-reduced-motion: reduce) { .activity { animation: none; } }
</style>
