<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { portal } from '../../lib/portal';
  import { imageStore } from '../../lib/image-store.svelte';
  import { createId } from '../../lib/id';
  import { bankWorkspaces } from '../../lib/bank-workspaces.svelte';
  import { graphFromSvg, graphSvg } from '../../lib/math-graph/svg';
  import type { Graph } from '../../lib/math-graph/vendor/model';
  let { imageName, context, oninsert, onclose }: { imageName?: string; context: string; oninsert: (name: string) => void; onclose: () => void } = $props();
  let frame: HTMLIFrameElement;
  let error = $state('');
  let saving = $state(false);
  let graph = $state<Graph | null>(null);
  let recovered = $state(false);
  const key = untrack(() => `tg-math-graph-draft:${bankWorkspaces.activeBankId}:${context}:${imageName ?? 'new'}`);
  let savedDraft: unknown = null;
  let ready = false;
  let loaded = false;
  let mounted = true;
  function open() {
    if (!ready || !loaded || !mounted) return;
    const style = getComputedStyle(document.documentElement);
    const theme = Object.fromEntries(Object.entries({ '--vscode-foreground': '--text', '--vscode-editor-background': '--bg', '--vscode-input-background': '--bg-2', '--vscode-input-foreground': '--text', '--vscode-panel-border': '--border', '--vscode-input-border': '--border', '--vscode-focusBorder': '--accent', '--vscode-button-background': '--accent' }).map(([key, value]) => [key, style.getPropertyValue(value).trim()]));
    frame.contentWindow?.postMessage({ channel: 'testgen-math-graph', type: 'open', graph: graph ? $state.snapshot(graph) : undefined, draft: savedDraft, theme }, location.origin);
  }
  onMount(() => {
    const listener = async (event: MessageEvent) => {
      if (event.source !== frame.contentWindow || event.origin !== location.origin || event.data?.channel !== 'testgen-math-graph') return;
      const message = event.data;
      if (message.type === 'ready') { ready = true; open(); }
      else if (message.type === 'close') onclose();
      else if (message.type === 'error') error = message.message;
      else if (message.type === 'draft') {
        try { localStorage.setItem(key, JSON.stringify(message.state)); }
        catch { error = 'Graph draft could not be saved locally. Keep this dialog open until you use the graph.'; }
      } else if (message.type === 'use' && !saving) {
        saving = true;
        try {
          // Each edit creates a new asset. Other questions and frozen tests that
          // share the original picture keep their original graph.
          const name = `graph-${createId()}`;
          await imageStore.put(name, new TextEncoder().encode(graphSvg(message.graph)), 'svg');
          if (!mounted) return;
          oninsert(name);
          localStorage.removeItem(key);
        } catch (cause) { error = String(cause); }
        finally { saving = false; }
      }
    };
    window.addEventListener('message', listener);
    void (async () => {
      try {
        if (imageName) {
          const image = await imageStore.get(imageName);
          if (!image) throw new Error('This graph image is missing from the bank.');
          graph = graphFromSvg(new TextDecoder().decode(image.bytes));
          if (!graph) throw new Error('This image does not contain editable Math Graph data.');
        }
        const raw = localStorage.getItem(key);
        if (raw) { savedDraft = JSON.parse(raw); recovered = true; }
        loaded = true; open();
      } catch (cause) { error = String(cause); }
    })();
    return () => { mounted = false; window.removeEventListener('message', listener); };
  });
</script>
<svelte:window onkeydown={event => { if (event.key === 'Escape' && !saving) onclose(); }} />
<div class="graph-overlay" use:portal>
  <div class="graph-dialog" role="dialog" aria-modal="true" aria-label="Math Graph editor">
    <header><div><strong>{imageName ? 'Edit graph' : 'Add graph'}</strong><span>{recovered ? 'Recovered local graph draft' : 'Functions, points, lines, segments and blank grids'}</span></div><button onclick={onclose} disabled={saving}>Close</button></header>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    {#if saving}<p role="status">Saving graph image…</p>{/if}
    <iframe bind:this={frame} src={`${import.meta.env.BASE_URL}math-graph.html`} title="Interactive Math Graph editor"></iframe>
    <footer>Graph drafts stay in this browser. Use graph adds a vector image to the question; save the question to keep it in the bank.</footer>
  </div>
</div>
<style>
  .graph-overlay { position: fixed; inset: 0; z-index: 210; padding: 1rem; background: #0008; display: grid; place-items: center; }
  .graph-dialog { width: min(1440px, 100%); height: min(960px, 100%); min-height: 0; display: flex; flex-direction: column; background: var(--bg); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; box-shadow: 0 16px 60px #0006; }
  header { padding: .7rem 1rem; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border); }
  header span { margin-left: 1rem; font-size: 12px; color: var(--text-2); }
  iframe { width: 100%; flex: 1; min-height: 0; border: 0; }
  footer { padding: .6rem 1rem; color: var(--text-2); font-size: 12px; border-top: 1px solid var(--border); }
  .error { padding: .5rem 1rem; color: var(--danger); }
  @media (max-width: 650px) { .graph-overlay { padding: 0; } .graph-dialog { border-radius: 0; height: 100%; } header span { display: none; } }
</style>
