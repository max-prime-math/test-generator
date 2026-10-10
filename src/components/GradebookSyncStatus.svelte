<script lang="ts">
  import { gradebookFolderSync as sync } from '../lib/gradebook-folder-sync.svelte';

  const time = (at: number) => new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
</script>

{#if sync.status !== 'off'}
  <div class="sync-status" class:error={sync.status === 'error'} role="status" aria-live="polite">
    {#if sync.status === 'error'}
      <strong>Not fully saved to the folder</strong>
      <small>{sync.problems.join(' · ')} Retrying automatically.</small>
    {:else if sync.lastSyncedAt}
      <small title="Changes save to the workspace folder as you work, and changes from your other computer appear here within a few seconds.">
        {sync.status === 'syncing' ? 'Saving to folder…' : `Saved to folder · checked ${time(sync.lastSyncedAt)}`}
      </small>
    {:else}
      <small>Connecting to folder…</small>
    {/if}
  </div>
{/if}

{#if sync.review.length}
  <div class="sync-review" role="region" aria-label="Edits made on both computers">
    <strong>Changed on both computers</strong>
    <small>The newer edit was kept. Choose the other one if it was right.</small>
    <ul>
      {#each sync.review as item (item.key)}
        <li>
          <span>{item.description}: kept <b>{item.kept}</b>; the other edit was <b>{item.other}</b></span>
          <span class="choices">
            <button class="ghost small" type="button" onclick={() => sync.dismiss(item.key)}>{item.short ? `Keep ${item.kept}` : 'Keep this'}</button>
            {#if item.other !== 'deleted'}
              <button class="ghost small" type="button" onclick={() => { item.restore(); sync.dismiss(item.key); }}>{item.short ? `Use ${item.other}` : 'Use the other'}</button>
            {/if}
          </span>
        </li>
      {/each}
    </ul>
  </div>
{/if}

<style>
  .sync-status, .sync-review {
    display: grid;
    gap: 3px;
    margin: 0 0 10px;
    padding: 6px 8px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg-2);
  }
  .sync-status small, .sync-review small { color: var(--text-2); }
  .sync-status.error, .sync-review { border-color: var(--danger); }
  .sync-review ul { display: grid; gap: 6px; margin: 4px 0 0; padding: 0; list-style: none; }
  .sync-review li { display: grid; gap: 4px; font-size: 12px; }
  .choices { display: flex; flex-wrap: wrap; gap: 4px; }
</style>
