<!--
  Compiles Typst source to PDF in-browser and shows it in an iframe.
  Manages blob URL lifecycle (revokes old URLs on each new compile).
-->
<script lang="ts">
  import { compile } from '../lib/typst/compiler';

  interface Props {
    source: string;
  }

  let { source }: Props = $props();

  type State =
    | { kind: 'idle' }
    | { kind: 'loading' }
    | { kind: 'ok'; pdfUrl: string }
    | { kind: 'error'; message: string };

  let state = $state<State>({ kind: 'idle' });
  let showSource = $state(false);
  let lastSource = '';
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  $effect(() => {
    const src = source;

    if (debounceTimer) clearTimeout(debounceTimer);
    state = { kind: 'loading' };

    debounceTimer = setTimeout(async () => {
      // Revoke the previous blob URL to free memory
      if (state.kind === 'ok') URL.revokeObjectURL(state.pdfUrl);

      lastSource = src;
      const result = await compile(src);

      if (src !== lastSource) {
        // A newer compile is in flight — discard this result
        if (result.pdfUrl) URL.revokeObjectURL(result.pdfUrl);
        return;
      }

      if (result.pdfUrl) {
        state = { kind: 'ok', pdfUrl: result.pdfUrl };
      } else {
        state = { kind: 'error', message: result.error ?? 'Unknown error' };
      }
    }, 800);
  });

  // Revoke blob URL when the component is destroyed
  $effect(() => {
    return () => {
      if (state.kind === 'ok') URL.revokeObjectURL(state.pdfUrl);
    };
  });

  function downloadSource() {
    const blob = new Blob([source], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'test.typ';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  let statusLabel = $derived(
    state.kind === 'loading'
      ? 'Compiling…'
      : state.kind === 'error'
        ? 'Error'
        : 'Preview',
  );
</script>

<div class="preview">
  <div class="toolbar">
    <span class="label">{statusLabel}</span>
    <div class="actions">
      <button class="ghost" onclick={() => (showSource = !showSource)}>
        {showSource ? 'Hide source' : 'Show source'}
      </button>
      <button class="ghost" onclick={downloadSource}>Download .typ</button>
    </div>
  </div>

  <div class="content">
    {#if showSource}
      <pre class="source">{source}</pre>
    {:else if state.kind === 'idle'}
      <div class="status">
        <span class="muted">Build a test to see a preview.</span>
      </div>
    {:else if state.kind === 'loading'}
      <div class="status">
        <div class="spinner"></div>
        <span>Compiling…</span>
      </div>
    {:else if state.kind === 'error'}
      <div class="status column">
        <p class="error-title">Compilation error</p>
        <pre class="error-msg">{state.message}</pre>
        <button class="ghost" onclick={() => (showSource = true)}>Show Typst source</button>
      </div>
    {:else if state.kind === 'ok'}
      <iframe
        src={state.pdfUrl}
        title="Test Preview"
        class="pdf-frame"
      ></iframe>
    {/if}
  </div>
</div>

<style>
  .preview {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    border-left: 1px solid var(--border);
  }

  .toolbar {
    display: flex;
    align-items: center;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--border);
    gap: 0.5rem;
    flex-shrink: 0;
  }

  .label {
    font-size: 12px;
    font-weight: 500;
    color: var(--text-2);
    flex: 1;
  }

  .actions {
    display: flex;
    gap: 0.25rem;
  }

  .content {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .pdf-frame {
    flex: 1;
    width: 100%;
    height: 100%;
    border: none;
    background: var(--bg-2);
  }

  .status {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    flex: 1;
    color: var(--text-2);
  }

  .status.column {
    flex-direction: column;
    gap: 0.75rem;
    padding: 2rem;
    align-items: flex-start;
    justify-content: flex-start;
  }

  .muted {
    font-size: 13px;
  }

  .error-title {
    font-weight: 600;
    color: var(--danger);
  }

  .error-msg {
    font-size: 11px;
    max-width: 100%;
    white-space: pre-wrap;
    word-break: break-all;
    color: var(--text-2);
  }

  .source {
    padding: 1rem;
    font-size: 11px;
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-word;
    color: var(--text);
    overflow-y: auto;
    flex: 1;
  }

  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid var(--border);
    border-top-color: var(--primary);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
