<script lang="ts">
  import type { EditorDraft } from '../../lib/editor/editor-model';
  import { narratives } from '../../lib/narratives.svelte';
  import CurriculumPicker from './CurriculumPicker.svelte';
  import MarkupEditor from './MarkupEditor.svelte';
  import ChoiceEditor from './ChoiceEditor.svelte';
  let { draft }: { draft: EditorDraft } = $props();
  let creatingNarrative = $state(false);
  let narrativeTitle = $state('');
  let narrativeBody = $state('');
  function createNarrative() {
    if (!narrativeBody.trim()) return;
    draft.fields.narrativeId = narratives.add({ title: narrativeTitle.trim() || 'Shared instructions', body: narrativeBody, tags: [],
      classId: draft.fields.classId || undefined, unitId: draft.fields.unitId || undefined, sectionId: draft.fields.sectionId || undefined }).id;
    creatingNarrative = false;
  }
  function changeType(mcq: boolean) {
    draft.mcq = mcq;
    draft.fields.questionType = mcq ? 'mcq' : 'frq';
    if (mcq && !draft.fields.choices) draft.fields.choices = { A: '', B: '', C: '', D: '' };
    // Keep choice text in the draft if toggled accidentally; written-response saves omit it.
  }
</script>
<div class="question-form">
  <label>Question type<select value={draft.mcq ? 'mcq' : 'frq'} onchange={e => changeType(e.currentTarget.value === 'mcq')}><option value="frq">Written response</option><option value="mcq">Multiple choice</option></select></label>
  <MarkupEditor context={`${draft.id}:question`} label="Question" bind:value={draft.fields.body} />
  {#if draft.mcq}<ChoiceEditor context={draft.id} bind:choices={draft.fields.choices} bind:answer={draft.fields.answer} />{/if}
  <MarkupEditor context={`${draft.id}:solution`} label="Solution" bind:value={draft.fields.solution} rows={6} />
  <div class="metadata"><label>Points<input type="number" min="0" step="0.5" bind:value={draft.fields.points} /></label><label>Tags<input bind:value={draft.fields.tagInput} placeholder="calculus, derivatives" /></label></div>
  <details open><summary>Curriculum placement</summary><CurriculumPicker bind:classId={draft.fields.classId} bind:unitId={draft.fields.unitId} bind:sectionId={draft.fields.sectionId} create /></details>
  <details><summary>Shared narrative / instructions</summary>
    <label>Narrative<select bind:value={draft.fields.narrativeId} onchange={() => { draft.fields.narrative = narratives.getById(draft.fields.narrativeId ?? '')?.body; }}>
      <option value="">None</option>{#each narratives.narratives as n}<option value={n.id}>{n.title}</option>{/each}
    </select></label>
    {#if draft.fields.narrative && !draft.fields.narrativeId}<MarkupEditor context={`${draft.id}:inline-narrative`} label="Inline narrative" bind:value={draft.fields.narrative} rows={3} />{/if}
    <button onclick={() => creatingNarrative = !creatingNarrative}>New shared narrative</button>
    {#if creatingNarrative}<input aria-label="Narrative title" bind:value={narrativeTitle} placeholder="Title" /><MarkupEditor context={`${draft.id}:narrative`} label="Narrative" bind:value={narrativeBody} rows={3} /><button onclick={createNarrative}>Create narrative</button>{/if}
  </details>
  {#if draft.fields.graphTypst}<details><summary>Recovered graph source</summary><MarkupEditor context={`${draft.id}:graph-source`} label="Graph source" bind:value={draft.fields.graphTypst} rows={4} /></details>{/if}
  {#if draft.fields.algorithmModel}<p class="note">Algorithm definitions are preserved. Generate algorithmic variants from Bank.</p>{/if}
</div>
<style>
  .question-form { display: grid; gap: 1.25rem; padding: 1.25rem; }
  label { display: grid; gap: .35rem; font-size: 12px; color: var(--text-2); }
  .metadata { display: grid; grid-template-columns: 100px 1fr; gap: .75rem; }
  input, select { width: 100%; min-width: 0; }
  details { display: grid; gap: .5rem; }
  summary { cursor: pointer; margin-bottom: .75rem; font-size: 13px; }
  .note { color: var(--text-2); font-size: 12px; }
</style>
