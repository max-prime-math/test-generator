<script lang="ts">
  import type { ProviderConflictPreview } from '../../lib/sync/types';

  interface Props {
    preview: ProviderConflictPreview;
    onclose: () => void;
  }

  const { preview, onclose }: Props = $props();

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose();
  }

  const localLines = $derived(preview.localText.split('\n'));
  const remoteLines = $derived(preview.remoteText.split('\n'));
  const maxLines = $derived(Math.max(localLines.length, remoteLines.length));
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="overlay" onclick={onclose}>
  <div class="modal" role="dialog" aria-modal="true" onclick={(e) => e.stopPropagation()}>
    <header>
      <div>
        <h2>Conflict JSON Preview</h2>
        <p>{preview.conflict.localFilePath}</p>
      </div>
      <button class="ghost icon-btn" onclick={onclose}>✕</button>
    </header>

    <div class="diff-grid">
      <section>
        <h3>{preview.localLabel}</h3>
        <pre>{preview.localText}</pre>
      </section>
      <section>
        <h3>{preview.remoteLabel}</h3>
        <pre>{preview.remoteText}</pre>
      </section>
    </div>

    <div class="line-count">Showing {maxLines} line{maxLines === 1 ? '' : 's'} of raw JSON for comparison.</div>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    z-index: 210;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .modal {
    width: min(1100px, calc(100vw - 2rem));
    height: min(760px, calc(100vh - 2rem));
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 12px;
    box-shadow: var(--shadow);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  header {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid var(--border);
  }

  h2, h3, p {
    margin: 0;
  }

  header p {
    margin-top: 0.25rem;
    font-size: 12px;
    color: var(--text-2);
  }

  .diff-grid {
    flex: 1;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0;
    min-height: 0;
  }

  section {
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  section + section {
    border-left: 1px solid var(--border);
  }

  section h3 {
    padding: 0.75rem 1rem;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-2);
    border-bottom: 1px solid var(--border);
  }

  pre {
    margin: 0;
    padding: 1rem;
    flex: 1;
    overflow: auto;
    font-size: 12px;
    line-height: 1.5;
    background: var(--bg-2);
  }

  .line-count {
    padding: 0.75rem 1rem;
    border-top: 1px solid var(--border);
    font-size: 12px;
    color: var(--text-2);
  }
</style>
