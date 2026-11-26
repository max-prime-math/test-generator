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
  import EditorPanes, { type EditorPanel } from './EditorPanes.svelte';
  import CurriculumPicker from './CurriculumPicker.svelte';
  import BankPicker from './BankPicker.svelte';
  import BulkQuestionEditor from './BulkQuestionEditor.svelte';
  import ImageLibraryModal from '../media/ImageLibraryModal.svelte';
  import IngestModal from '../IngestModal.svelte';
  import AddToTestMenu from '../AddToTestMenu.svelte';
  import { appSettings } from '../../lib/app-settings.svelte';
  import { narratives } from '../../lib/narratives.svelte';
  import { resolveQuestionNarrative } from '../../lib/narrative-utils';
  import { displayMode, type DisplayModeQuestion } from '../../lib/display-mode.svelte';
  import { displayQuestionFromDraft } from '../../lib/display-question';
  import { bankWorkspaces } from '../../lib/bank-workspaces.svelte';
  import { revealLocatedQuestion } from '../../lib/question-locator';
  import { HOMEMADE_BANK, TEST_QUESTION_ROUTE, testQuestionEditor } from '../../lib/editor/test-question-edit.svelte';
  import { TEST_NARRATIVE_ROUTE } from '../../lib/editor/test-narrative-edit.svelte';
  import TestNarrativeEditor from './TestNarrativeEditor.svelte';
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
  let panel = $state<EditorPanel>('navigator');
  let lastRoute = '';
  let current = $derived(editor.current);
  /** A question opened from a test in Build: its own toolbar and no navigator. */
  let testEdit = $derived(routeId === TEST_QUESTION_ROUTE ? testQuestionEditor.session : null);
  let homemadeBank = $derived(bankView.banks.find(entry => entry.name.trim().toLowerCase() === HOMEMADE_BANK.toLowerCase()));
  $effect(() => {
    JSON.stringify(testQuestionEditor.session);
    untrack(() => testQuestionEditor.persist());
  });
  function leaveTestEdit(action: () => void) {
    if (testQuestionEditor.changed && !window.confirm('Leave without saving your changes to this question?')) return;
    action();
  }
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
      if (route === TEST_NARRATIVE_ROUTE) return;
      if (route === TEST_QUESTION_ROUTE) {
        panel = 'form';
        if (!testQuestionEditor.session) error = 'No test question is open. Use ✎ on a question in Build to edit it.';
        return;
      }
      const draft = editor.session.drafts.find(d => d.id === route || d.sourceId === route);
      const question = bank.questions.find(q => q.id === route);
      if (draft) { editor.select(draft); panel = 'form'; }
      else if (question) { editor.open(question); panel = 'form'; }
      else error = 'Question not found in this bank. Select a question or draft from the navigator.';
    });
  });
  function route(draft: EditorDraft) {
    editor.select(draft); error = ''; panel = 'form';
    window.location.hash = `#/editor/${encodeURIComponent(draft.sourceId ?? draft.id)}`;
  }
  function create() { route(editor.create()); }
  function open(q: Question) { route(editor.open(q)); }
  function openEditorDisplay(draft: EditorDraft) {
    const openingBankId = bankView.activeBankId;
    const fromTest = testEdit?.draft.id === draft.id;
    const sourceBankId = draft.sourceBankId ?? openingBankId;
    const currentItem = displayQuestionFromDraft(draft, sourceBankId === openingBankId ? narratives.narratives : []);
    const bankItems: DisplayModeQuestion[] = bank.questions
      .filter(question => question.id !== draft.sourceId)
      .map(question => ({ ...question, narrative: resolveQuestionNarrative(question, narratives.narratives)?.body }));
    const sourceIndex = draft.sourceId ? bank.questions.findIndex(question => question.id === draft.sourceId) : -1;
    const questions = sourceIndex >= 0
      ? [...bankItems.slice(0, sourceIndex), currentItem, ...bankItems.slice(sourceIndex)]
      : [currentItem, ...bankItems];
    displayMode.open({
      title: 'Editor · Question display',
      questions,
      initialId: currentItem.id,
      questionFor: item => {
        if (bankView.activeBankId !== openingBankId) return;
        const current = item.id === currentItem.id;
        const sourceId = current ? draft.sourceId : item.id;
        const sessionDraft = testQuestionEditor.session?.draft;
        const liveDraft = current && fromTest
          ? (sessionDraft?.id === draft.id ? sessionDraft : undefined)
          : (current ? editor.session.drafts.find(entry => entry.id === draft.id) : undefined)
            ?? (sourceId ? editor.findBankDraft(sourceId, current ? sourceBankId : openingBankId) : undefined);
        if (liveDraft) return displayQuestionFromDraft(liveDraft, current && sourceBankId !== openingBankId ? [] : narratives.narratives, item.id);
        if (current && (fromTest || sourceBankId !== openingBankId)) return;
        const question = bank.questions.find(entry => entry.id === sourceId);
        if (question) return { ...question, id: item.id, narrative: resolveQuestionNarrative(question, narratives.narratives)?.body };
      },
      imagesFor: (item, names) => item.id === currentItem.id && sourceBankId !== bankView.activeBankId
        ? bankWorkspaces.readDormantImages(sourceBankId, names)
        : [],
      onLocate: async item => {
        let locatedId = item.id;
        if (item.id === currentItem.id) {
          if (fromTest && testQuestionEditor.session?.draft.id === draft.id) {
            panel = 'form';
            window.location.hash = `#/editor/${TEST_QUESTION_ROUTE}`;
          } else {
            const live = editor.session.drafts.find(entry => entry.id === draft.id)
              ?? (draft.sourceId ? editor.findBankDraft(draft.sourceId, sourceBankId) : undefined);
            if (live) route(live);
            else if (sourceBankId === bankView.activeBankId) {
              const question = bank.questions.find(entry => entry.id === draft.sourceId);
              if (question) locatedId = routeBankQuestion(question);
            }
          }
        } else {
          const question = bank.questions.find(candidate => candidate.id === item.id);
          if (!question) return;
          locatedId = routeBankQuestion(question);
        }
        await revealLocatedQuestion(() => document.querySelector<HTMLElement>(`[data-display-question-id="${CSS.escape(locatedId)}"]`));
      },
    });
  }
  function routeBankQuestion(question: Question): string {
    const draft = editor.open(question);
    route(draft);
    return draft.id;
  }
  let saving = $state(false);
  async function save(andNew = false) {
    if (!current || saving) return;
    saving = true;
    try {
      const { id, bankId } = await editor.save(current); error = ''; selected = selected.filter(id => editor.session.drafts.some(d => d.id === id));
      const status = editor.status;
      if (andNew) create();
      else if (bankId === bankView.activeBankId) {
        const question = bank.questions.find(q => q.id === id);
        if (question) route(editor.open(question));
      } else window.location.hash = '#/editor';
      editor.status = status;
    } catch (e) { error = e instanceof Error ? e.message : String(e); }
    finally { saving = false; }
  }
  async function saveSelected() {
    const errors: string[] = [];
    let count = 0;
    for (const draft of [...editor.session.drafts].filter(d => selected.includes(d.id))) {
      try { await editor.save(draft); count++; } catch (e) { errors.push(`${draft.fields.body.slice(0, 45) || 'Untitled'}: ${String(e)}`); }
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
    if (routeId === TEST_NARRATIVE_ROUTE) return;
    if (testEdit) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); testQuestionEditor.saveForTest(); }
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); void save(true); }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); void save(); }
  }
</script>
<svelte:window onkeydown={keydown} onpagehide={() => void editor.flush()} />

{#snippet questions()}
  <details class="defaults">
    <summary>New-question defaults</summary><p>Used for new questions until changed.</p>
    <div class="default-placement">
      <BankPicker label="Default question bank" value={editor.targetBankId ?? bankView.activeBankId} onchange={id => editor.setDefaultTarget(id)} />
      <CurriculumPicker bind:classId={editor.session.defaults.classId} bind:unitId={editor.session.defaults.unitId} bind:sectionId={editor.session.defaults.sectionId} create />
    </div>
    <label>Points<input type="number" min="0" step="0.5" bind:value={editor.session.defaults.points} /></label><label>Tags<input bind:value={editor.session.defaults.tagInput} /></label>
  </details>
  <QuestionNavigator onquestion={open} ondraft={route} ondelete={remove} onrestore={id => { const draft = editor.restore(id); if (draft) route(draft); }} bind:selected bind:selectedQuestions />
{/snippet}

{#snippet write()}
  {#if !testEdit}
    {#if selected.length || selectedQuestions.length}<div class="selection"><span>{[selected.length && `${selected.length} draft${selected.length === 1 ? '' : 's'}`, selectedQuestions.length && `${selectedQuestions.length} bank question${selectedQuestions.length === 1 ? '' : 's'}`].filter(Boolean).join(' · ')} selected</span><AddToTestMenu ids={addTarget.ids} note={addTarget.note} ondone={(message, ok) => addResult = { message, ok }} />{#if selected.length}<button onclick={() => batchOpen = !batchOpen}>Shared values</button><button onclick={() => void saveSelected()}>Save selected</button><button onclick={removeSelected}>Delete selected</button>{/if}<button onclick={() => { selected = []; selectedQuestions = []; }}>Clear</button>{#if addResult}<span class="add-result" class:failed={!addResult.ok} role="status">{addResult.message}{#if addResult.ok}{' · '}<a href="#/build">Open in Build</a>{/if}</span>{/if}</div>{/if}
    {#if batchOpen && selected.length}<BulkQuestionEditor {selected} onclose={() => batchOpen = false} />{/if}
    {#if current}
      <div class="draft-heading" data-display-question-id={current.id}>{current.sourceId ? (editor.isUnchanged(current.id) ? 'Bank question · changes you make become a draft' : 'Editing bank question · unsaved draft') : 'New question draft'}</div>
    {/if}
  {/if}
  {@const draft = testEdit?.draft ?? current}
  {#if draft}
    {#key draft.id}<QuestionForm {draft} selectBank={!testEdit} newForTest={Boolean(testEdit?.newQuestion)} />{/key}
  {:else}
    <div class="empty">
      <h3>Open or create a question</h3>
      <p>Choose a question or draft in <strong>Questions</strong>, or start with <strong>New Question</strong>.</p>
    </div>
  {/if}
{/snippet}

{#snippet preview()}
  {@const draft = testEdit?.draft ?? current}
  {#key draft?.id}
    <QuestionPreview {draft} {active} ondisplay={draft ? () => openEditorDisplay(draft) : undefined} />
  {/key}
{/snippet}

{#if routeId === TEST_NARRATIVE_ROUTE}
  <TestNarrativeEditor {active} />
{:else}
<div class="editor-workspace">
  {#if testEdit}
  <header class="toolbar test-edit" data-display-question-id={testEdit.draft.id}>
    <div class="test-edit-title">
      <strong>{testEdit.newQuestion ? 'New question' : `Question ${testEdit.number}`} in “{testEdit.testName}”</strong>
      <span class="status">{testEdit.newQuestion ? 'Adds a question to this test' : testEdit.origin ? `From bank “${testEdit.origin.bankName}”` : testEdit.draft.original?.generatorItem ? 'Generated for this test' : 'This test’s own copy; its bank original is not available'}{testQuestionEditor.changed ? ' · unsaved changes' : ''}</span>
    </div>
    <div class="actions">
      <button onclick={() => leaveTestEdit(() => testQuestionEditor.cancel())} disabled={testQuestionEditor.busy}>Cancel</button>
      {#if testEdit.origin}
        <button onclick={() => void testQuestionEditor.saveToBank()} disabled={testQuestionEditor.busy} title="Overwrite the question in “{testEdit.origin.bankName}” with these changes, and use them in this test">Save in original bank</button>
      {:else if testEdit.draft.original?.generatorItem}
        <button onclick={() => leaveTestEdit(() => testQuestionEditor.editInGenerator())} disabled={!appSettings.generatorExperimentalEnabled} title={appSettings.generatorExperimentalEnabled ? 'Open this question’s settings in Generate; the questions you make there replace it in the test' : 'Turn on Generate in Settings to use it'}>Edit in Generator</button>
      {/if}
      <button class="primary" onclick={() => testQuestionEditor.saveForTest()} disabled={testQuestionEditor.busy} title="Keep these changes in this test only (Ctrl/Cmd + S)">Save for this test</button>
    </div>
  </header>
  {#if testEdit.newQuestion}
    {@const pending = testEdit.newQuestion}
    <div class="test-bank-option">
      {#if pending.savedBankName}
        <span role="status">Copy saved to “{pending.savedBankName}”. Use Save for this test to finish adding it.</span>
      {:else}
        <BankPicker label="Bank for a reusable copy" value={pending.bankTargetId || homemadeBank?.id || ''}
          emptyOption={homemadeBank ? undefined : `${HOMEMADE_BANK} (create if needed)`}
          disabled={testQuestionEditor.busy} onchange={id => pending.bankTargetId = id} />
        <button onclick={() => void testQuestionEditor.saveNewToTestAndBank()} disabled={testQuestionEditor.busy}>
          {testQuestionEditor.busy ? 'Saving…' : 'Save to test and bank'}
        </button>
      {/if}
    </div>
  {/if}
  {#if testQuestionEditor.error || testQuestionEditor.storageError}<pre class="error" role="alert">{testQuestionEditor.error || testQuestionEditor.storageError}</pre>{/if}
  {:else}
  <header class="toolbar">
    <div><strong>Editor</strong>{#if current || editor.status !== 'Draft saved locally'}<span class="status" role="status">{editor.status}{#if editor.lastTrashed && editor.status === 'Draft moved to Recycle bin'} <button class="link" onclick={undoDelete}>Undo</button>{/if}</span>{/if}</div>
    <div class="actions"><button onclick={create}>+ New Question</button><button onclick={() => importOpen = true}>Bulk Entry / Import</button><button onclick={() => libraryOpen = true}>Image library</button><button onclick={() => current && route(editor.duplicate(current))} disabled={!current}>Duplicate</button><button onclick={() => remove()} disabled={!current} title={current && editor.isUnchanged(current.id) ? 'Close this question; it has no unsaved edits' : 'Move this draft to the Recycle bin'}>{current && editor.isUnchanged(current.id) ? 'Close' : 'Delete draft'}</button><button onclick={() => void save()} disabled={!current || saving}>Save</button><button class="primary" onclick={() => void save(true)} disabled={!current || saving} title="Ctrl/Cmd + Enter">Save & New</button></div>
  </header>
  {#if editor.storageError || error}<pre class="error" role="alert">{editor.storageError || error}</pre>{/if}
  {/if}
  <EditorPanes questions={testEdit ? undefined : questions} {write} {preview} bind:panel
    formInert={Boolean(testEdit?.newQuestion && testQuestionEditor.busy)} />
</div>
{/if}
{#if importOpen && active}<IngestModal actionLabel="Stage in Editor" staging onclose={() => { importOpen = false; editor.pendingImport = null; window.location.hash = '#/editor'; }} onimport={questions => { editor.stage(questions); if (editor.current) route(editor.current); }} initialDrafts={editor.pendingImport?.questions} initialImportKind={editor.pendingImport?.kind} />{/if}
{#if libraryOpen && active}<ImageLibraryModal onclose={() => libraryOpen = false} />{/if}
<style>
  .editor-workspace { display: flex; flex-direction: column; height: 100%; min-height: 0; background: var(--bg); }
  .toolbar { padding: .75rem 1rem; border-bottom: 1px solid var(--border); display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .75rem; }
  .test-edit { background: color-mix(in srgb, var(--primary) 8%, var(--bg)); }
  .test-edit-title { display: grid; gap: .15rem; }
  .test-edit-title .status { margin-left: 0; }
  .test-bank-option { padding: .5rem 1rem; display: flex; flex-wrap: wrap; align-items: end; gap: .5rem .75rem; border-bottom: 1px solid var(--border); font-size: 12px; }
  .status { margin-left: 1rem; color: var(--text-2); font-size: 12px; }
  .link { background: none; border: none; padding: 0 .2rem; color: var(--primary); text-decoration: underline; font-size: 12px; cursor: pointer; }
  .actions { display: flex; flex-wrap: wrap; gap: .4rem; }
  .actions button { font-size: 12px; }
  .defaults { padding: 1rem; border-bottom: 1px solid var(--border); font-size: 12px; }
  .default-placement { display: grid; gap: .5rem; }
  .defaults p { color: var(--text-2); margin: .5rem 0; }
  .defaults label { display: grid; gap: .3rem; margin-top: .5rem; }
  summary { cursor: pointer; font-weight: 600; }
  .selection, .draft-heading { padding: .6rem 1rem; display: flex; align-items: center; flex-wrap: wrap; gap: .5rem; font-size: 12px; border-bottom: 1px solid var(--border); }
  .draft-heading { justify-content: space-between; color: var(--text-2); }
  .add-result { flex-basis: 100%; color: var(--text-2); } .add-result.failed { color: var(--danger); } .add-result a { color: var(--primary); }
  .empty { margin: 1.25rem; padding: 1.25rem; max-width: 35rem; border: 1px solid var(--border); border-radius: 8px; }
  .empty h3 { margin-bottom: .5rem; font-size: 16px; }
  .empty p { margin: 0; color: var(--text-2); line-height: 1.6; }
  .error { margin: 0; padding: .75rem 1rem; color: var(--danger); white-space: pre-wrap; max-height: 160px; overflow: auto; font-size: 12px; }
</style>
