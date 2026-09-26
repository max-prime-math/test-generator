<script lang="ts">
  import { imageStore } from '../../lib/image-store.svelte';
  import { compileSvg, cancelPreview, previewConsumer } from '../../lib/typst/compiler';
  import { scanImageRefs } from '../../lib/typst/image-shadow';
  import { perf } from '../../lib/perf-diagnostics';
  import { autoImports } from '../../lib/typst/auto-imports';
  import { formatBody } from '../../lib/question-format';
  import { narratives } from '../../lib/narratives.svelte';
  import { getThemeColors } from '../../lib/theme-colors';
  import type { EditorDraft } from '../../lib/editor/editor-model';
  let { draft, active = true }: { draft: EditorDraft; active?: boolean } = $props();
  let svg = $state('');
  /** The draft the displayed SVG was rendered for; another draft's preview is never presented as current. */
  let svgFor = $state('');
  const consumer = previewConsumer('editor');
  $effect(() => () => cancelPreview(consumer));
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
    const src = source;
    // Re-render only when an image this preview uses changes.
    imageStore.revisionOf(scanImageRefs(src));
    const draftId = draft.id;
    let cancelled = false;
    busy = true;
    // A newly selected draft renders promptly; typing within a draft is debounced.
    const delay = draftId === svgFor ? 400 : 60;
    const timer = setTimeout(async () => {
      const done = perf.start('Editor preview: request to render');
      try {
        const result = await compileSvg(src, { consumer });
        if (cancelled || result.cancelled) return;
        done();
        error = result.error ?? '';
        if (result.svg) { svg = result.svg; svgFor = draftId; error = ''; }
      } catch (e) { if (!cancelled) error = String(e); }
      finally { if (!cancelled) busy = false; }
    }, delay);
    return () => { cancelled = true; clearTimeout(timer); };
  });
</script>
<div class="preview">
  <header><strong>Live preview</strong><label><input type="checkbox" bind:checked={showSolution} /> Solution</label></header>
  <p class="status" role="status">{busy ? (svg && svgFor !== draft.id ? 'Rendering this question…' : 'Updating preview…') : error ? 'Preview needs attention · draft is kept' : 'Preview up to date'}</p>
  {#if error}<pre role="alert">{error}</pre>{#if svg && svgFor === draft.id}<p class="status">Showing the last successful preview.</p>{/if}{/if}
  {#if svg && svgFor === draft.id}<div class="svg" class:stale={busy || !!error} aria-busy={busy}>{@html svg}</div>
  {:else if svg}<div class="svg other" aria-hidden="true">{@html svg}</div>{/if}
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
  /* Previous draft's preview keeps the layout steady but is clearly not this draft's. */
  .other { opacity: .2; filter: grayscale(1); pointer-events: none; }
</style>
