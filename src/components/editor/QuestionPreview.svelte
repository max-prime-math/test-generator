<script lang="ts">
  import { imageStore } from '../../lib/image-store.svelte';
  import { bankWorkspaces } from '../../lib/bank-workspaces.svelte';
  import { compileSvg, cancelPreview, previewConsumer } from '../../lib/typst/compiler';
  import { scanImageRefs } from '../../lib/typst/image-shadow';
  import { perf } from '../../lib/perf-diagnostics';
  import { autoImports } from '../../lib/typst/auto-imports';
  import { formatBody, formatParts } from '../../lib/question-format';
  import { narratives } from '../../lib/narratives.svelte';
  import { getThemeColors } from '../../lib/theme-colors';
  import type { EditorDraft } from '../../lib/editor/editor-model';
  import { repairFrozenImageReferences } from '../../lib/frozen-image-references';
  import DisplayModeButton from '../DisplayModeButton.svelte';
  let { draft, active = true, narrativeOnly = false, ondisplay }: { draft?: EditorDraft; active?: boolean; narrativeOnly?: boolean; ondisplay?: () => void } = $props();
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
    if (!draft) return '';
    const f = repairFrozenImageReferences(draft.fields);
    const colors = getThemeColors(theme, dark);
    const narrative = narratives.getById(f.narrativeId ?? '')?.body ?? f.narrative ?? '';
    const questionBody = draft.mcq
      ? formatBody(f.body, f.choices ?? {})
      : f.parts ? formatParts(f.parts, !narrative) : f.body;
    let content = `${narrative}\n\n${questionBody}`;
    if (f.graphTypst && !(/Recovered graph/i.test(f.graphTypst) && /Recovered graph/i.test(content))) content += `\n\n${f.graphTypst}`;
    if (showSolution && !narrativeOnly) {
      if (draft.mcq && f.answer) content += `\n\n*Correct choice:* ${f.answer}`;
      if (f.solution.trim()) content += `\n\n*Solution:*\n${f.solution}`;
    }
    if (!content.trim()) return '';
    return `${autoImports(content)}#set page(width: 13cm, height: auto, margin: .75cm, fill: rgb("${colors.bgTypst}"))\n#set text(font: "New Computer Modern", size: 14pt, fill: rgb("${colors.textTypst}"))\n${content}`;
  });
  $effect(() => {
    if (!active || !draft) return;
    const src = source;
    if (!src) {
      svg = '';
      svgFor = '';
      error = '';
      busy = false;
      return;
    }
    // Re-render only when an image this preview uses changes.
    imageStore.revisionOf(scanImageRefs(src));
    const draftId = draft.id;
    // Existing questions opened from another bank keep using their source pictures.
    // A new question headed to another bank still uses pictures just added to the active store.
    const imageBankId = draft.sourceBankId;
    let cancelled = false;
    busy = true;
    // A newly selected draft renders promptly; typing within a draft is debounced.
    const delay = draftId === svgFor ? 400 : 60;
    const timer = setTimeout(async () => {
      const done = perf.start('Editor preview: request to render');
      try {
        const images = imageBankId ? await bankWorkspaces.readDormantImages(imageBankId, scanImageRefs(src)) : [];
        if (cancelled) return;
        const result = await compileSvg(src, { consumer, images });
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
  <header class="editor-pane-heading">
    <h2>Preview</h2>
    {#if draft}
    <div class="preview-controls">
      {#if ondisplay}<DisplayModeButton onopen={ondisplay} label="Open this question in the display window" />{/if}
      {#if !narrativeOnly}<label><input type="checkbox" bind:checked={showSolution} /> Solution</label>{/if}
    </div>
    {/if}
  </header>
  <div class="preview-content">
    {#if draft && source}
      <p class="status" role="status">{busy ? (svgFor !== draft.id ? 'Rendering this question…' : 'Updating preview…') : error ? 'Preview needs attention · draft is kept' : svgFor === draft.id ? 'Preview up to date' : 'Preparing preview…'}</p>
      {#if error}<pre role="alert">{error}</pre>{#if svg && svgFor === draft.id}<p class="status">Showing the last successful preview.</p>{/if}{/if}
      {#if svg && svgFor === draft.id}<div class="svg" class:stale={busy || !!error} aria-busy={busy}>{@html svg}</div>{/if}
    {:else}
      <p class="preview-empty" role="status">{draft ? (narrativeOnly ? 'Write your narrative to see it here.' : 'Write your question to see it here.') : 'Open or create a question to see it here.'}</p>
    {/if}
  </div>
</div>
<style>
  .preview-content { padding: .85rem 1rem; }
  .preview-controls { display: flex; align-items: center; flex-wrap: wrap; gap: .65rem; }
  label { font-size: 12px; display: flex; align-items: center; gap: .4rem; }
  input[type=checkbox] { width: auto; }
  .status { color: var(--text-2); font-size: 12px; margin: 0 0 .75rem; }
  .preview-empty { margin: 0; padding: 1rem; border: 1px solid var(--border); border-radius: 8px; color: var(--text-2); font-size: 13px; line-height: 1.5; }
  pre { white-space: pre-wrap; overflow-wrap: anywhere; color: var(--danger); font-size: 12px; }
  .svg :global(svg) { display: block; width: 100%; height: auto; }
  .stale { opacity: .55; }
</style>
