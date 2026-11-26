<script lang="ts" module>
  export type EditorPanel = 'navigator' | 'form' | 'preview';
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import EditorPaneDivider from './EditorPaneDivider.svelte';
  import { editorLayout, editorTextSizes, setEditorPaneWidth, setEditorTextSize } from '../../lib/editor/editor-layout.svelte';

  let { panel = $bindable(), questions, write, preview, formInert = false, formLabel = 'Question editor', previewLabel = 'Question preview' }: {
    panel: EditorPanel;
    questions?: Snippet;
    write: Snippet;
    preview: Snippet;
    formInert?: boolean;
    formLabel?: string;
    previewLabel?: string;
  } = $props();
  const id = $props.id();
  const questionId = `${id}-questions`;
  const writeId = `${id}-write`;
  const previewId = `${id}-preview`;
  const minimumQuestions = 180;
  const minimumWrite = 320;
  const minimumPreview = 200;
  const dividerWidth = 14;
  let containerWidth = $state(0);
  let dragQuestions = $state<number>();
  let dragPreview = $state<number>();
  let visiblePanel = $derived(!questions && panel === 'navigator' ? 'form' : panel);
  let singlePane = $derived(containerWidth < (questions ? 820 : 620));
  const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));
  let available = $derived(containerWidth - (questions ? 2 : 1) * dividerWidth - minimumWrite);
  let questionsWidth = $derived(questions
    ? clamp(dragQuestions ?? editorLayout.questions ?? Math.round(containerWidth * .21), minimumQuestions, available - minimumPreview)
    : 0);
  let previewWidth = $derived(clamp(dragPreview ?? editorLayout.preview ?? Math.round(containerWidth * (questions ? .32 : .4)), minimumPreview, available - questionsWidth));

  function resize(pane: 'questions' | 'preview', width: number | undefined, commit: boolean) {
    if (commit) setEditorPaneWidth(pane, width);
    if (pane === 'questions') dragQuestions = commit ? undefined : width;
    else dragPreview = commit ? undefined : width;
  }
</script>

<div class="editor-layout" class:single-pane={singlePane} style:--editor-text-size={`${editorLayout.fontSize}px`}>
  <div class="mobile-panels" role="group" aria-label="Editor panels">
    {#if questions}<button class:primary={visiblePanel === 'navigator'} aria-pressed={visiblePanel === 'navigator'} aria-controls={questionId} onclick={() => panel = 'navigator'}>Questions</button>{/if}
    <button class:primary={visiblePanel === 'form'} aria-pressed={visiblePanel === 'form'} aria-controls={writeId} onclick={() => panel = 'form'}>Write</button>
    <button class:primary={visiblePanel === 'preview'} aria-pressed={visiblePanel === 'preview'} aria-controls={previewId} onclick={() => panel = 'preview'}>Preview</button>
  </div>
  <div class="columns" class:with-questions={Boolean(questions)} bind:clientWidth={containerWidth}
    style:--questions-width={`${questionsWidth}px`} style:--preview-width={`${previewWidth}px`} style:--divider-width={`${dividerWidth}px`}>
    {#if questions}
      <aside id={questionId} class:hidden-mobile={visiblePanel !== 'navigator'} aria-label="Questions">
        <header class="editor-pane-heading"><h2>Questions</h2></header>
        {@render questions()}
      </aside>
      <EditorPaneDivider label="Resize Questions pane" controls={questionId}
        width={questionsWidth} minimum={minimumQuestions} maximum={Math.max(minimumQuestions, available - previewWidth)} direction={1}
        onresize={(width, commit) => resize('questions', width, commit)} onreset={() => resize('questions', undefined, true)} />
    {/if}
    <section id={writeId} class="form-pane" class:hidden-mobile={visiblePanel !== 'form'} inert={formInert} aria-label={formLabel}>
      <header class="editor-pane-heading">
        <h2>Write</h2>
        <label class="text-size">Text size
          <select aria-label="Editor text size" value={editorLayout.fontSize} onchange={(event) => setEditorTextSize(Number(event.currentTarget.value))}>
            {#each editorTextSizes as size}<option value={size}>{size} px</option>{/each}
          </select>
        </label>
      </header>
      {@render write()}
    </section>
    <EditorPaneDivider label="Resize Preview pane" controls={previewId}
      width={previewWidth} minimum={minimumPreview} maximum={Math.max(minimumPreview, available - questionsWidth)} direction={-1}
      onresize={(width, commit) => resize('preview', width, commit)} onreset={() => resize('preview', undefined, true)} />
    <section id={previewId} class="preview-pane" class:hidden-mobile={visiblePanel !== 'preview'} aria-label={previewLabel}>
      {@render preview()}
    </section>
  </div>
</div>

<style>
  .editor-layout { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .columns { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) var(--divider-width) var(--preview-width); }
  .columns.with-questions { grid-template-columns: var(--questions-width) var(--divider-width) minmax(0, 1fr) var(--divider-width) var(--preview-width); }
  aside, .form-pane, .preview-pane { min-width: 0; overflow: auto; }
  aside, .preview-pane { background: var(--bg-2); }
  .editor-layout :global(.editor-pane-heading) {
    position: sticky; top: 0; z-index: 1; min-height: 3.15rem; padding: .45rem 1rem;
    display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: .35rem .75rem;
    background: var(--bg); border-bottom: 1px solid var(--border);
  }
  .editor-layout :global(.editor-pane-heading h2) { margin: 0; font-size: 14px; font-weight: 650; }
  .text-size { display: flex; align-items: center; gap: .4rem; color: var(--text-2); font-size: 12px; }
  .text-size select { width: auto; padding: .3rem .4rem; }
  .mobile-panels { display: none; }
  .single-pane .columns { display: block; overflow: hidden; }
  .single-pane .columns > :global([role="separator"]), .single-pane .hidden-mobile { display: none; }
  .single-pane aside, .single-pane .form-pane, .single-pane .preview-pane { height: 100%; }
  .single-pane .mobile-panels { display: flex; gap: .5rem; padding: .5rem 1rem; border-bottom: 1px solid var(--border); }
</style>
