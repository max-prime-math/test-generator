<!--
  Blank-graph builder. Collects domain/range/step/size options, previews the
  generated Typst, and hands the markup back for insertion at the cursor.
-->
<script lang="ts">
  import { compileSvg } from '../lib/typst/compiler';
  import { getThemeColors } from '../lib/theme-colors';
  import {
    defaultBlankGraphOptions,
    generateBlankGraphTypst,
    validateBlankGraphOptions,
    type BlankGraphOptions,
  } from '../lib/typst/blank-graph';

  interface Props {
    oninsert: (typst: string) => void;
    onclose: () => void;
  }

  let { oninsert, onclose }: Props = $props();

  let options = $state<BlankGraphOptions>({ ...defaultBlankGraphOptions });

  let problem = $derived(validateBlankGraphOptions(options));
  let markup = $derived(problem ? '' : generateBlankGraphTypst(options));

  // ── Preview ───────────────────────────────────────────────────────────────
  let currentTheme = $state(document.documentElement.getAttribute('data-theme') ?? 'auto');
  let prefersDark = $state(window.matchMedia('(prefers-color-scheme: dark)').matches);
  let previewSvg = $state<string | null>(null);
  let previewError = $state<string | null>(null);

  $effect(() => {
    const src = markup;
    if (!src) {
      previewSvg = null;
      return;
    }
    const colors = getThemeColors(currentTheme, prefersDark);
    const doc = `#set page(width: auto, height: auto, margin: 0.5cm, fill: rgb("${colors.bgTypst}"))
#set text(font: "New Computer Modern", size: 11pt, fill: rgb("${colors.textTypst}"))

${src}`;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const result = await compileSvg(doc);
      if (cancelled) return;
      if (result.svg) { previewSvg = result.svg; previewError = null; }
      else { previewError = result.error ?? 'Preview failed'; previewSvg = null; }
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  });

  function insert() {
    if (problem) return;
    oninsert(markup);
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.stopPropagation(); onclose(); }
  }
</script>

<svelte:window on:keydown={onkeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="sheet" onclick={(e) => e.stopPropagation()}>
  <div class="card" role="dialog" aria-modal="true" aria-label="Insert blank graph">
    <header>
      <h3>Insert blank graph</h3>
      <button class="ghost" onclick={onclose} title="Close">✕</button>
    </header>

    <div class="content">
      <div class="fields">
        <div class="grid-2">
          <label>X min<input type="number" step="any" bind:value={options.xMin} /></label>
          <label>X max<input type="number" step="any" bind:value={options.xMax} /></label>
          <label>Y min<input type="number" step="any" bind:value={options.yMin} /></label>
          <label>Y max<input type="number" step="any" bind:value={options.yMax} /></label>
          <label>X step<input type="number" step="any" min="0" bind:value={options.xStep} /></label>
          <label>Y step<input type="number" step="any" min="0" bind:value={options.yStep} /></label>
          <label>Width (cm)<input type="number" step="0.5" min="1" bind:value={options.width} /></label>
          <label>Height (cm)<input type="number" step="0.5" min="1" bind:value={options.height} /></label>
          <label>X axis label<input type="text" bind:value={options.xLabel} placeholder="x" /></label>
          <label>Y axis label<input type="text" bind:value={options.yLabel} placeholder="y" /></label>
        </div>

        <div class="toggles">
          <label class="check"><input type="checkbox" bind:checked={options.showGrid} /> Grid lines</label>
          <label class="check"><input type="checkbox" bind:checked={options.showNumbers} /> Axis numbers</label>
          <label class="check"><input type="checkbox" bind:checked={options.showArrows} /> Axis arrows</label>
        </div>

        {#if problem}
          <p class="error">{problem}</p>
        {/if}
      </div>

      <div class="preview">
        {#if previewSvg}
          <div class="preview-svg">{@html previewSvg}</div>
        {:else if previewError}
          <p class="error small">{previewError}</p>
        {:else}
          <span class="muted">Preview…</span>
        {/if}
      </div>
    </div>

    <footer>
      <button onclick={onclose}>Cancel</button>
      <button class="primary" onclick={insert} disabled={!!problem}>Insert graph</button>
    </footer>
  </div>
</div>

<style>
  .sheet {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.35);
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 10px;
    z-index: 2;
  }

  .card {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25);
    width: min(calc(100% - 2rem), 720px);
    max-height: calc(100% - 2rem);
    display: flex;
    flex-direction: column;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.85rem 1rem;
    border-bottom: 1px solid var(--border);
  }

  header h3 { font-size: 14px; font-weight: 600; }

  .content {
    display: flex;
    gap: 1rem;
    padding: 1rem;
    overflow-y: auto;
  }

  .fields { display: flex; flex-direction: column; gap: 0.75rem; width: 300px; flex-shrink: 0; }

  .grid-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
  }

  .grid-2 label {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    font-size: 11px;
    color: var(--text-2);
  }

  .grid-2 input { font-size: 12px; width: 100%; }

  .toggles { display: flex; flex-direction: column; gap: 0.3rem; }

  .check {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 0.4rem;
    font-size: 12px;
    margin-bottom: 0;
  }

  /* The global input rule stretches form controls to full width. */
  .check input[type='checkbox'] {
    width: auto;
    flex: none;
    margin: 0;
  }

  .preview {
    flex: 1;
    min-width: 0;
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.5rem;
    overflow: auto;
  }

  .preview-svg { width: 100%; }
  .preview-svg :global(svg) { display: block; width: 100%; height: auto; }

  .muted { color: var(--text-2); font-size: 12px; }
  .error { color: var(--danger); font-size: 12px; margin: 0; }
  .error.small { font-size: 11px; white-space: pre-wrap; }

  footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    border-top: 1px solid var(--border);
  }
</style>
