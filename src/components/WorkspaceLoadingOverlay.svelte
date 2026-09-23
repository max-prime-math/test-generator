<script lang="ts">
  import { onMount } from 'svelte';
  import { localWorkspace } from '../lib/local-workspace.svelte';
  let panel = $state<HTMLElement>();
  const progress = $derived(localWorkspace.loadingProgress);
  onMount(() => {
    const previousFocus = document.activeElement;
    panel?.focus();
    // Prevent app-wide shortcuts and focus from reaching partially loaded data.
    // The overlay's own Stop button stays usable from the keyboard.
    const blockKeys = (event: KeyboardEvent) => {
      if (event.target instanceof Node && panel?.contains(event.target)) return;
      event.preventDefault(); event.stopImmediatePropagation();
    };
    document.addEventListener('keydown', blockKeys, true);
    return () => {
      document.removeEventListener('keydown', blockKeys, true);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  });
</script>

{#if progress}
  <div class="workspace-loading-overlay">
    <div class="progress-card" bind:this={panel} tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="workspace-loading-title" aria-describedby="workspace-loading-explanation">
      <h2 id="workspace-loading-title">Loading workspace</h2>
      <p class="phase" role="status" aria-live="polite">{progress.phase}</p>
      <p class="detail">{progress.detail || 'Preparing the next step…'}</p>
      {#if progress.total !== null && progress.total > 0}
        <progress aria-label={progress.phase} value={progress.completed} max={progress.total}></progress>
        <p class="count">{progress.completed.toLocaleString()} of {progress.total.toLocaleString()} {progress.unit}</p>
      {:else}
        <progress aria-label={progress.phase}></progress>
      {/if}
      <p id="workspace-loading-explanation">Please keep this tab open. Editing is paused while files are validated and loaded. Counts show progress for the current step.</p>
      {#if localWorkspace.canStop}
        <div class="actions">
          <button onclick={() => localWorkspace.stopLoading()}>Stop loading</button>
          <span>Nothing in the browser has changed yet. A stopped workspace stays unloaded until you choose Load workspace.</span>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .workspace-loading-overlay { position: fixed; inset: 0; z-index: 10000; display: grid; place-items: center; padding: 1.2rem; background: color-mix(in srgb, var(--bg) 85%, transparent); }
  .progress-card { width: min(540px, 100%); box-sizing: border-box; padding: 1.6rem; border: 1px solid var(--border); border-radius: 12px; background: var(--bg); color: var(--text); box-shadow: 0 12px 50px #0002; }
  h2 { font-size: 1.25rem; margin: 0 0 1rem; }
  .phase { font-weight: 600; margin-bottom: .5rem; }
  .detail { overflow-wrap: anywhere; min-height: 2.5rem; font-size: .9rem; }
  progress { display: block; width: 100%; height: .7rem; accent-color: var(--accent, #2563eb); }
  .count { font-variant-numeric: tabular-nums; text-align: right; font-size: .85rem; }
  .actions { display: flex; align-items: center; gap: .8rem; margin-top: 1rem; }
  .actions span { color: var(--text-muted, #666); font-size: .8rem; line-height: 1.4; }
  .actions button { flex: none; }
  #workspace-loading-explanation { color: var(--text-muted, #666); font-size: .85rem; line-height: 1.5; margin-bottom: 0; }
</style>
