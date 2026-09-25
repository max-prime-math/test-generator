<script lang="ts">
  import { imageStore } from '../../lib/image-store.svelte';
  import { compileSvg } from '../../lib/typst/compiler';
  import { autoImports } from '../../lib/typst/auto-imports';
  import { formatBody } from '../../lib/question-format';
  import { narratives } from '../../lib/narratives.svelte';
  import { getThemeColors } from '../../lib/theme-colors';
  import type { EditorDraft } from '../../lib/editor/editor-model';
  let { draft, active = true }: { draft: EditorDraft; active?: boolean } = $props();
  let svg = $state('');
  let error = $state('');
  let busy = $state(false);
  let showSolution = $state(true);
  let theme = $state(document.documentElement.getAttribute('data-theme') ?? 'auto');
  let dark = $state(window.matchMedia('(prefers-color-scheme: dark)').matches);
  $effect(() => {
    const observer = new MutationObserver(() => theme = document.documentElement.getAttribute('data-theme') ?? 'auto');
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => dark = media.matches;
    media.addEventListener('change', update);
    return () => { observer.disconnect(); media.removeEventListener('change', update); };
  });
  let source = $derived.by(() => {
    const f = draft.fields;
    const colors = getThemeColors(theme, dark);
    const narrative = narratives.getById(f.narrativeId ?? '')?.body ?? f.narrative ?? '';
    let content = `${narrative}\n\n${draft.mcq ? formatBody(f.body, f.choices ?? {}) : f.body}`;
    if (f.graphTypst && !(/Recovered graph/i.test(f.graphTypst) && /Recovered graph/i.test(content))) content += `\n\n${f.graphTypst}`;
    if (showSolution) {
      if (draft.mcq && f.answer) content += `\n\n*Correct choice:* ${f.answer}`;
      if (f.solution.trim()) content += `\n\n*Solution:*\n${f.solution}`;
    }
    return `${autoImports(content)}#set page(width: 13cm, height: auto, margin: .75cm, fill: rgb("${colors.bgTypst}"))\n#set text(font: "New Computer Modern", size: 14pt, fill: rgb("${colors.textTypst}"))\n${content}`;
  });
  $effect(() => {
    if (!active) return;
    imageStore.metadata;
    const src = source;
    let cancelled = false;
    busy = true;
    const timer = setTimeout(async () => {
      try {
        const result = await compileSvg(src);
        if (cancelled) return;
        error = result.error ?? '';
        if (result.svg) { svg = result.svg; error = ''; }
      } catch (e) { if (!cancelled) error = String(e); }
      finally { if (!cancelled) busy = false; }
    }, 400);
    return () => { cancelled = true; clearTimeout(timer); };
  });
</script>
<div class="preview">
  <header><strong>Live preview</strong><label><input type="checkbox" bind:checked={showSolution} /> Solution</label></header>
  <p class="status" role="status">{busy ? 'Rendering…' : error ? 'Preview needs attention · draft is kept' : 'Preview up to date'}</p>
  {#if error}<pre role="alert">{error}</pre>{#if svg}<p class="status">Showing the last successful preview.</p>{/if}{/if}
  {#if svg}<div class="svg" class:stale={busy || !!error}>{@html svg}</div>{/if}
</div>
<style>
  .preview { padding: 1rem; }
  header { display: flex; align-items: center; justify-content: space-between; gap: .5rem; }
  label { font-size: 12px; display: flex; align-items: center; gap: .4rem; }
  input[type=checkbox] { width: auto; }
  .status { color: var(--text-2); font-size: 12px; margin: .75rem 0; }
  pre { white-space: pre-wrap; overflow-wrap: anywhere; color: var(--danger); font-size: 12px; }
  .svg :global(svg) { display: block; width: 100%; height: auto; }
  .stale { opacity: .55; }
</style>
