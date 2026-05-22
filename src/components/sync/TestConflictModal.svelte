<script lang="ts">
  import type { ProviderConflictPreview, TestConflictResolutionChoice } from '../../lib/sync/types';

  interface Props {
    preview: ProviderConflictPreview;
    onresolve: (choice: TestConflictResolutionChoice) => void;
    onclose: () => void;
  }

  const { preview, onresolve, onclose }: Props = $props();

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose();
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="overlay" onclick={onclose}>
  <div class="modal" role="dialog" aria-modal="true" onclick={(e) => e.stopPropagation()}>
    <header>
      <div>
        <h2>Resolve Saved Test Conflict</h2>
        <p>{preview.conflict.localFilePath}</p>
      </div>
      <button class="ghost icon-btn" onclick={onclose}>✕</button>
    </header>

    <div class="body">
      <p class="intro">{preview.conflict.message}</p>
      <div class="columns">
        <section>
          <h3>Local</h3>
          <pre>{preview.localText}</pre>
        </section>
        <section>
          <h3>Remote</h3>
          <pre>{preview.remoteText}</pre>
        </section>
      </div>
    </div>

    <footer>
      <button class="ghost" onclick={onclose}>Cancel</button>
      <button class="ghost" onclick={() => onresolve('local')}>Keep local</button>
      <button class="ghost" onclick={() => onresolve('save-both')}>Save both</button>
      <button class="primary" onclick={() => onresolve('remote')}>Use remote</button>
    </footer>
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

  header, footer {
    padding: 1rem 1.25rem;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }

  footer {
    border-top: 1px solid var(--border);
    border-bottom: none;
    justify-content: flex-end;
  }

  h2, h3, p {
    margin: 0;
  }

  header p {
    margin-top: 0.25rem;
    font-size: 12px;
    color: var(--text-2);
  }

  .body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    padding: 1rem 1.25rem;
    gap: 1rem;
  }

  .intro {
    font-size: 13px;
    color: var(--text-2);
  }

  .columns {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: 1fr 1fr;
    border: 1px solid var(--border);
    border-radius: 10px;
    overflow: hidden;
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
    background: var(--bg-2);
    font-size: 12px;
    line-height: 1.5;
  }

  button {
    font: inherit;
    cursor: pointer;
    border: none;
    border-radius: var(--radius);
    padding: 8px 14px;
    background: var(--bg-3);
    color: var(--text);
  }

  button.primary {
    background: var(--primary);
    color: white;
  }
</style>
