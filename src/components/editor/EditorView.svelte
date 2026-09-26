<script lang="ts">
  import { untrack } from 'svelte';
  import { bank } from '../../lib/bank.svelte';
  import { editor } from '../../lib/editor/editor-state.svelte';
  import { bankView } from '../../lib/bank-switch-view.svelte';
  import type { EditorDraft } from '../../lib/editor/editor-model';
  import type { Question } from '../../lib/types';
  import QuestionNavigator from './QuestionNavigator.svelte';
  import QuestionForm from './QuestionForm.svelte';
  import QuestionPreview from './QuestionPreview.svelte';
  import CurriculumPicker from './CurriculumPicker.svelte';
  import BulkQuestionEditor from './BulkQuestionEditor.svelte';
  import ImageLibraryModal from '../media/ImageLibraryModal.svelte';
  import IngestModal from '../IngestModal.svelte';
  import AddToTestMenu from '../AddToTestMenu.svelte';
  let { active, routeId = '' }: { active: boolean; routeId?: string } = $props();
  let error = $state('');
  let selected = $state<string[]>([]);
  let selectedQuestions = $state<string[]>([]);
  let addResult = $state<{ message: string; ok: boolean } | null>(null);
  $effect(() => { selected; selectedQuestions; untrack(() => addResult = null); });
  // Drafts can join a test only through the bank question they edit; new drafts must be saved first.
  let addTarget = $derived.by(() => {
    const inBank = new Set(bank.questions.map(q => q.id));
    const drafts = editor.session.drafts.filter(d => selected.includes(d.id));
    const fromDrafts = drafts.flatMap(d => d.sourceId && inBank.has(d.sourceId) ? [d.sourceId] : []);
    const skipped = drafts.length - fromDrafts.length;
    const picked = new Set(selectedQuestions);
    return { ids: [...new Set([...fromDrafts, ...bank.questions.filter(q => picked.has(q.id)).map(q => q.id)])],
      note: skipped ? `${skipped} new draft${skipped === 1 ? '' : 's'} must be saved to the bank first` : '' };
  });
  let selectionBank = bankView.activeBankId;
  $effect(() => {
    const bankId = bankView.activeBankId;
    if (bankId === selectionBank) return;
    selectionBank = bankId;
    untrack(() => { selected = []; selectedQuestions = []; error = ''; });
  });
  let batchOpen = $state(false);
  let importOpen = $state(false);
  let libraryOpen = $state(false);
  let panel = $state<'navigator' | 'form' | 'preview'>('form');
  let lastRoute = '';
  let current = $derived(editor.current);
  $effect(() => {
    // Persist every edit to the open draft, including incomplete values. The
    // synchronous journal write covers only this draft, so its cost does not
    // grow with the number of drafts; other drafts change through editor methods.
    const draft = editor.current;
    const json = draft ? JSON.stringify(draft) : '';
    untrack(() => editor.persistDraft(draft, json));
  });
  $effect(() => {
    JSON.stringify(editor.session.defaults);
    untrack(() => editor.persistMeta());
  });
  $effect(() => {
    if (!active) { lastRoute = ''; return; }
    if (editor.loading) return;
    const route = routeId;
    untrack(() => {
      if (route === lastRoute) return;
      lastRoute = route;
      if (route === 'import') { importOpen = true; return; }
      if (!route) return;
      const draft = editor.session.drafts.find(d => d.id === route || d.sourceId === route);
      const question = bank.questions.find(q => q.id === route);
      if (draft) editor.select(draft);
      else if (question) editor.open(question);
      else error = 'Question not found in this bank. Select a question or draft from the navigator.';
    });
  });
  function route(draft: EditorDraft) {
    editor.select(draft); error = ''; panel = 'form';
    window.location.hash = `#/editor/${encodeURIComponent(draft.sourceId ?? draft.id)}`;
  }
  function create() { route(editor.create()); }
  function open(q: Question) { route(editor.open(q)); }
  function save(andNew = false) {
    if (!current) return;
    try {
      const id = editor.save(current); error = ''; selected = selected.filter(id => editor.session.drafts.some(d => d.id === id));
      if (andNew) create();
      else {
        const question = bank.questions.find(q => q.id === id);
        if (question) route(editor.open(question));
        editor.status = 'Saved to bank';
      }
    } catch (e) { error = e instanceof Error ? e.message : String(e); }
  }
  function saveSelected() {
    const errors: string[] = [];
    let count = 0;
    for (const draft of [...editor.session.drafts].filter(d => selected.includes(d.id))) {
      try { editor.save(draft); count++; } catch (e) { errors.push(`${draft.fields.body.slice(0, 45) || 'Untitled'}: ${String(e)}`); }
    }
    selected = selected.filter(id => editor.session.drafts.some(d => d.id === id));
    error = errors.join('\n'); editor.status = `Saved ${count} questions to bank`;
    window.location.hash = '#/editor';
  }
  /** Delete moves a draft to the Recycle bin (undoable); an unedited bank question just closes. */
  function remove(id = current?.id) {
    if (!id) return;
    selected = selected.filter(other => other !== id);
    editor.trashDraft(id); error = '';
    if (!editor.current) window.location.hash = '#/editor';
  }
  function removeSelected() {
    const ids = [...selected];
    for (const id of ids) editor.trashDraft(id);
    selected = [];
    editor.status = `${ids.length} draft${ids.length === 1 ? '' : 's'} moved to Recycle bin`;
    if (!editor.current) window.location.hash = '#/editor';
  }
  function undoDelete() {
    const draft = editor.lastTrashed ? editor.restore(editor.lastTrashed) : undefined;
    if (draft) route(draft);
  }
  function keydown(event: KeyboardEvent) {
    if (!active || importOpen || document.querySelector('[aria-modal="true"]')) return;
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); save(true); }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); save(); }
  }
</script>
<svelte:window onkeydown={keydown} onpagehide={() => void editor.flush()} />
<div class="editor-workspace">
  <header class="toolbar">
    <div><strong>Editor</strong><span class="status" role="status">{editor.status}{#if editor.lastTrashed && editor.status === 'Draft moved to Recycle bin'} <button class="link" onclick={undoDelete}>Undo</button>{/if}</span></div>
    <div class="actions"><button onclick={create}>+ New Question</button><button onclick={() => importOpen = true}>Bulk Entry / Import</button><button onclick={() => libraryOpen = true}>Image library</button><button onclick={() => current && route(editor.duplicate(current))} disabled={!current}>Duplicate</button><button onclick={() => remove()} disabled={!current} title={current && editor.isUnchanged(current.id) ? 'Close this question; it has no unsaved edits' : 'Move this draft to the Recycle bin'}>{current && editor.isUnchanged(current.id) ? 'Close' : 'Delete draft'}</button><button onclick={() => save()} disabled={!current}>Save</button><button class="primary" onclick={() => save(true)} disabled={!current} title="Ctrl/Cmd + Enter">Save & New</button></div>
  </header>
  {#if editor.storageError || error}<pre class="error" role="alert">{editor.storageError || error}</pre>{/if}
  <div class="mobile-panels">{#each ['navigator', 'form', 'preview'] as name}<button class:primary={panel === name} onclick={() => panel = name as typeof panel}>{name === 'navigator' ? 'Questions' : name === 'form' ? 'Write' : 'Preview'}</button>{/each}</div>
  <div class="columns">
    <aside class:hidden-mobile={panel !== 'navigator'}>
      <details class="defaults"><summary>New-question defaults</summary><p>Used for new questions until changed.</p><CurriculumPicker bind:classId={editor.session.defaults.classId} bind:unitId={editor.session.defaults.unitId} bind:sectionId={editor.session.defaults.sectionId} /><label>Points<input type="number" min="0" step="0.5" bind:value={editor.session.defaults.points} /></label><label>Tags<input bind:value={editor.session.defaults.tagInput} /></label></details>
      <QuestionNavigator onquestion={open} ondraft={route} ondelete={remove} onrestore={id => { const draft = editor.restore(id); if (draft) route(draft); }} bind:selected bind:selectedQuestions />
    </aside>
    <section class="form-pane" class:hidden-mobile={panel !== 'form'} aria-label="Question editor">
      {#if selected.length || selectedQuestions.length}<div class="selection"><span>{[selected.length && `${selected.length} draft${selected.length === 1 ? '' : 's'}`, selectedQuestions.length && `${selectedQuestions.length} bank question${selectedQuestions.length === 1 ? '' : 's'}`].filter(Boolean).join(' · ')} selected</span><AddToTestMenu ids={addTarget.ids} note={addTarget.note} ondone={(message, ok) => addResult = { message, ok }} />{#if selected.length}<button onclick={() => batchOpen = !batchOpen}>Shared values</button><button onclick={saveSelected}>Save selected</button><button onclick={removeSelected}>Delete selected</button>{/if}<button onclick={() => { selected = []; selectedQuestions = []; }}>Clear</button>{#if addResult}<span class="add-result" class:failed={!addResult.ok} role="status">{addResult.message}{#if addResult.ok}{' · '}<a href="#/build">Open in Build</a>{/if}</span>{/if}</div>{/if}
      {#if batchOpen && selected.length}<BulkQuestionEditor {selected} onclose={() => batchOpen = false} />{/if}
      {#if current}
        <div class="draft-heading"><span>{current.sourceId ? (editor.isUnchanged(current.id) ? 'Bank question · changes you make become a draft' : 'Editing bank question · unsaved draft') : 'New question draft'}</span></div>
        {#key current.id}<QuestionForm draft={current} />{/key}
      {:else}<div class="empty"><h2>A workspace for your next question</h2><p>Create a question, open one from the bank, or import a batch to review. Drafts save automatically in this browser.</p><button class="primary" onclick={create}>New Question</button><p>Ctrl/Cmd + Enter saves to the bank and starts the next question.</p></div>{/if}
    </section>
    <section class="preview-pane" class:hidden-mobile={panel !== 'preview'} aria-label="Question preview">
      {#if current}{#key current.id}<QuestionPreview draft={current} {active} />{/key}{:else}<p class="preview-hint">Open a question to see its live preview.</p>{/if}
    </section>
  </div>
</div>
{#if importOpen && active}<IngestModal actionLabel="Stage in Editor" staging onclose={() => { importOpen = false; editor.pendingImport = null; window.location.hash = '#/editor'; }} onimport={questions => { editor.stage(questions); if (editor.current) route(editor.current); }} initialDrafts={editor.pendingImport?.questions} initialImportKind={editor.pendingImport?.kind} />{/if}
{#if libraryOpen && active}<ImageLibraryModal onclose={() => libraryOpen = false} />{/if}
<style>
  .editor-workspace { display: flex; flex-direction: column; height: 100%; min-height: 0; background: var(--bg); }
  .toolbar { padding: .75rem 1rem; border-bottom: 1px solid var(--border); display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .75rem; }
  .status { margin-left: 1rem; color: var(--text-2); font-size: 12px; }
  .link { background: none; border: none; padding: 0 .2rem; color: var(--primary); text-decoration: underline; font-size: 12px; cursor: pointer; }
  .actions { display: flex; flex-wrap: wrap; gap: .4rem; }
  .actions button { font-size: 12px; }
  .columns { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(220px, 21%) minmax(340px, 1fr) minmax(260px, 32%); }
  aside, .form-pane, .preview-pane { overflow-y: auto; min-width: 0; }
  aside, .form-pane { border-right: 1px solid var(--border); }
  .preview-pane { background: var(--bg-2); }
  .defaults { padding: 1rem; border-bottom: 1px solid var(--border); font-size: 12px; }
  .defaults p { color: var(--text-2); margin: .5rem 0; }
  .defaults label { display: grid; gap: .3rem; margin-top: .5rem; }
  summary { cursor: pointer; font-weight: 600; }
  .selection, .draft-heading { padding: .6rem 1rem; display: flex; align-items: center; flex-wrap: wrap; gap: .5rem; font-size: 12px; border-bottom: 1px solid var(--border); }
  .draft-heading { justify-content: space-between; color: var(--text-2); }
  .add-result { flex-basis: 100%; color: var(--text-2); } .add-result.failed { color: var(--danger); } .add-result a { color: var(--primary); }
  .empty { padding: 2rem; max-width: 600px; } .empty h2 { font-size: 21px; } .empty p { margin: 1rem 0; color: var(--text-2); line-height: 1.6; overflow-wrap: anywhere; } .empty button { margin-right: .5rem; }
  .preview-hint { padding: 1rem; color: var(--text-2); font-size: 13px; }
  .error { margin: 0; padding: .75rem 1rem; color: var(--danger); white-space: pre-wrap; max-height: 160px; overflow: auto; font-size: 12px; }
  .mobile-panels { display: none; }
  @media (max-width: 1050px) { .columns { display: block; overflow: hidden; } .columns > * { height: 100%; } .hidden-mobile { display: none; } .mobile-panels { display: flex; gap: .5rem; padding: .5rem 1rem; border-bottom: 1px solid var(--border); } }
</style>
