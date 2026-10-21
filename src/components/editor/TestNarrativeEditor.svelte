<script lang="ts">
  import { untrack } from 'svelte';
  import { testNarrativeEditor } from '../../lib/editor/test-narrative-edit.svelte';
  import { newDraft } from '../../lib/editor/editor-model';
  import MarkupEditor from './MarkupEditor.svelte';
  import QuestionPreview from './QuestionPreview.svelte';

  let { active }: { active: boolean } = $props();
  const defaults = newDraft();
  let session = $derived(testNarrativeEditor.session);
  let panel = $state<'write' | 'preview'>('write');
  let previewDraft = $derived({ ...defaults, id: session?.narrativeId ?? defaults.id,
    fields: { ...defaults.fields, body: session?.body ?? '' } });
  $effect(() => {
    JSON.stringify(testNarrativeEditor.session);
    untrack(() => testNarrativeEditor.persist());
  });
  function cancel() {
    if (testNarrativeEditor.changed && !window.confirm('Leave without saving your changes to this narrative?')) return;
    testNarrativeEditor.cancel();
  }
  function keydown(event: KeyboardEvent) {
    if (active && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's' && !document.querySelector('[aria-modal="true"]')) {
      event.preventDefault();
      testNarrativeEditor.save();
    }
  }
</script>

<svelte:window onkeydown={keydown} />
<div class="narrative-workspace">
  {#if session}
    <header>
      <div><strong>Narrative in “{session.testName}”</strong><p>Unnumbered text for this test{testNarrativeEditor.changed ? ' · unsaved changes' : ''}</p></div>
      <div class="actions"><button onclick={cancel}>Cancel</button><button class="primary" onclick={() => testNarrativeEditor.save()} title="Ctrl/Cmd + S">Save for this test</button></div>
    </header>
    {#if testNarrativeEditor.error}<p class="error" role="alert">{testNarrativeEditor.error}</p>{/if}
    <nav aria-label="Narrative editor panels"><button class:primary={panel === 'write'} onclick={() => panel = 'write'}>Write</button><button class:primary={panel === 'preview'} onclick={() => panel = 'preview'}>Preview</button></nav>
    <div class="panes">
      <section class:hidden-mobile={panel !== 'write'} aria-label="Narrative editor">
        <MarkupEditor label="Narrative" context="Test narrative" rows={18} bind:value={session.body} />
        <p class="hint">Use Typst for headings, paragraphs, equations, tables, and other typesetting. Place and reorder this block in Build’s Selected list.</p>
      </section>
      <section class="preview-pane" class:hidden-mobile={panel !== 'preview'} aria-label="Narrative preview">
        <QuestionPreview draft={previewDraft} {active} narrativeOnly />
      </section>
    </div>
  {:else}
    <p>No narrative is open. <a href="#/build">Return to Build</a> to add or edit one.</p>
  {/if}
</div>

<style>
  .narrative-workspace { height: 100%; min-height: 0; display: flex; flex-direction: column; }
  header { display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap; padding: .75rem 1rem; border-bottom: 1px solid var(--border); background: color-mix(in srgb, var(--primary) 8%, var(--bg)); }
  header p, .hint { color: var(--text-2); font-size: 12px; margin-top: .4rem; line-height: 1.5; }
  .actions { display: flex; gap: .5rem; }
  .panes { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 40%); flex: 1; min-height: 0; }
  section { padding: 1rem; overflow-y: auto; min-width: 0; }
  .preview-pane { padding: 0; border-left: 1px solid var(--border); background: var(--bg-2); }
  .error { padding: .75rem 1rem; color: var(--danger); }
  nav { display: none; }
  @media (max-width: 900px) {
    nav { display: flex; gap: .5rem; padding: .5rem 1rem; border-bottom: 1px solid var(--border); }
    .panes { display: block; overflow: hidden; }
    section { height: 100%; }
    .hidden-mobile { display: none; }
  }
</style>
