<script lang="ts">
  import { editor } from '../lib/editor/editor-state.svelte';
  import { testEditor } from '../lib/test-editor.svelte';
  import { gradebook } from '../lib/gradebook.svelte';
  import { testQuestionEditor, TEST_QUESTION_ROUTE } from '../lib/editor/test-question-edit.svelte';
  import { testNarrativeEditor, TEST_NARRATIVE_ROUTE } from '../lib/editor/test-narrative-edit.svelte';
  import { isTextEditingTarget, undoDirection } from '../lib/document-history.svelte';

  let { mode, editorRoute = '' }: { mode: string; editorRoute?: string } = $props();

  let supported = $derived(mode === 'editor' || mode === 'build' || mode === 'gradebook');
  let canUndo = $derived.by(() => {
    if (mode === 'build') return testEditor.canUndo;
    if (mode === 'gradebook') return gradebook.canUndo;
    if (mode === 'editor' && editorRoute === TEST_QUESTION_ROUTE) return testQuestionEditor.canUndo;
    if (mode === 'editor' && editorRoute === TEST_NARRATIVE_ROUTE) return testNarrativeEditor.canUndo;
    return mode === 'editor' && editor.canUndo;
  });
  let canRedo = $derived.by(() => {
    if (mode === 'build') return testEditor.canRedo;
    if (mode === 'gradebook') return gradebook.canRedo;
    if (mode === 'editor' && editorRoute === TEST_QUESTION_ROUTE) return testQuestionEditor.canRedo;
    if (mode === 'editor' && editorRoute === TEST_NARRATIVE_ROUTE) return testNarrativeEditor.canRedo;
    return mode === 'editor' && editor.canRedo;
  });

  function step(direction: 'undo' | 'redo') {
    if (mode === 'build') testEditor[direction]();
    else if (mode === 'gradebook') gradebook[direction]();
    else if (mode === 'editor' && editorRoute === TEST_QUESTION_ROUTE) testQuestionEditor[direction]();
    else if (mode === 'editor' && editorRoute === TEST_NARRATIVE_ROUTE) testNarrativeEditor[direction]();
    else if (mode === 'editor') editor[direction]();
  }

  function keydown(event: KeyboardEvent) {
    const direction = undoDirection(event);
    if (!supported || !direction || event.defaultPrevented || document.querySelector('[aria-modal="true"]')) return;
    const inGradeCell = mode === 'gradebook' && (event.target as Element | null)?.matches?.('[data-grade-row]');
    // Text fields keep their platform-native, character-level history. Grade cells are the
    // exception: their grouped score transaction is safer than changing only the visible text.
    if (!inGradeCell && isTextEditingTarget(event.target)) return;
    event.preventDefault();
    step(direction);
  }
</script>

<svelte:window onkeydown={keydown} />
{#if supported}
  <div class="history-controls" role="group" aria-label={`${mode === 'build' ? 'Build' : mode === 'gradebook' ? 'Gradebook' : 'Editor'} history`}>
    <button onclick={() => step('undo')} disabled={!canUndo} aria-label="Undo" title="Undo (Ctrl/Cmd+Z)">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7 4 12l5 5"/><path d="M5 12h8a6 6 0 0 1 6 6"/></svg>
    </button>
    <button onclick={() => step('redo')} disabled={!canRedo} aria-label="Redo" title="Redo (Ctrl/Cmd+Shift+Z)">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 7 5 5-5 5"/><path d="M19 12h-8a6 6 0 0 0-6 6"/></svg>
    </button>
  </div>
{/if}

<style>
  .history-controls { display: flex; align-items: center; gap: 2px; flex-shrink: 0; }
  button { width: 28px; height: 28px; padding: 5px; display: grid; place-items: center; border: 1px solid transparent; border-radius: 5px; background: transparent; color: var(--text-2); }
  button:not(:disabled):hover, button:not(:disabled):focus-visible { color: var(--text); background: var(--bg-2); border-color: var(--border); }
  button:disabled { opacity: .3; }
  svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  @media (max-width: 760px) { button { width: 26px; height: 26px; } }
</style>
