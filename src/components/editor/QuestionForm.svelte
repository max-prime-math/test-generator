<script lang="ts">
  import { tick } from 'svelte';
  import type { EditorDraft } from '../../lib/editor/editor-model';
  import { narratives } from '../../lib/narratives.svelte';
  import CurriculumPicker from './CurriculumPicker.svelte';
  import IndicatorPicker from './IndicatorPicker.svelte';
  import MarkupEditor from './MarkupEditor.svelte';
  import ChoiceEditor from './ChoiceEditor.svelte';
  import { editor } from '../../lib/editor/editor-state.svelte';
  import { bankView } from '../../lib/bank-switch-view.svelte';
  import BankPicker from './BankPicker.svelte';
  import QuestionPartsEditor from './QuestionPartsEditor.svelte';
  import { formatParts, questionPartsPointTotal } from '../../lib/question-format';
  let { draft, selectBank = false }: { draft: EditorDraft; selectBank?: boolean } = $props();
  let creatingNarrative = $state(false);
  let narrativeTitle = $state('');
  let narrativeBody = $state('');
  let form: HTMLDivElement;
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
  async function useParts() {
    draft.fields.parts = { stem: draft.fields.body, items: [{ body: '' }, { body: '' }], pointsMode: 'question' };
    await tick();
    form.querySelector<HTMLTextAreaElement>('fieldset textarea')?.focus();
  }
  function flattenParts() {
    if (!draft.fields.parts) return;
    draft.fields.body = formatParts(draft.fields.parts, true, { showPoints: false });
    draft.fields.points = draft.fields.parts.pointsMode === 'parts' ? questionPartsPointTotal(draft.fields.parts) : draft.fields.points;
    draft.fields.parts = undefined;
  }
</script>
<div class="question-form" bind:this={form}>
  <div class="question-type">
    <label>Question type<select value={draft.mcq ? 'mcq' : 'frq'} onchange={e => changeType(e.currentTarget.value === 'mcq')}><option value="frq">Written response</option><option value="mcq">Multiple choice</option></select></label>
    {#if !draft.mcq && !draft.fields.parts}
      <button type="button" onclick={useParts}>+ Add question parts</button>
    {/if}
  </div>
  {#if draft.fields.parts && !draft.mcq}
    <QuestionPartsEditor context={`${draft.id}:question-parts`} bind:parts={draft.fields.parts} imageBankId={draft.sourceBankId} />
    <button class="structure" type="button" onclick={flattenParts}>Convert parts back to question text</button>
  {:else}
    <MarkupEditor context={`${draft.id}:question`} label="Question" bind:value={draft.fields.body} imageBankId={draft.sourceBankId} />
  {/if}
  {#if draft.mcq}<ChoiceEditor context={draft.id} bind:choices={draft.fields.choices} bind:answer={draft.fields.answer} imageBankId={draft.sourceBankId} />{/if}
  <MarkupEditor context={`${draft.id}:solution`} label="Solution" bind:value={draft.fields.solution} rows={6} imageBankId={draft.sourceBankId} />
  <div class="metadata">{#if draft.fields.parts?.pointsMode === 'parts' && !draft.mcq}<label>Total points<output>{questionPartsPointTotal(draft.fields.parts)}</output></label>{:else}<label>Points<input type="number" min="0" step="0.5" bind:value={draft.fields.points} /></label>{/if}<label>Tags<input bind:value={draft.fields.tagInput} placeholder="calculus, derivatives" /></label></div>
  <details open><summary>Curriculum placement</summary>{#if selectBank}
    <BankPicker label="Question bank" value={draft.bankId ?? draft.sourceBankId ?? bankView.activeBankId} onchange={id => editor.setTarget(draft, id)} />
    {#if draft.sourceId && draft.bankId}<p class="note">Saving to another bank creates an edited copy and keeps the original question.</p>{/if}
  {/if}<CurriculumPicker bind:classId={draft.fields.classId} bind:unitId={draft.fields.unitId} bind:sectionId={draft.fields.sectionId} create />
    <IndicatorPicker bind:indicators={draft.fields.indicators} classId={draft.fields.classId} unitId={draft.fields.unitId} sectionId={draft.fields.sectionId} /></details>
  <details><summary>Shared narrative / instructions</summary>
    <label>Narrative<select bind:value={draft.fields.narrativeId} onchange={() => { draft.fields.narrative = narratives.getById(draft.fields.narrativeId ?? '')?.body; }}>
      <option value="">None</option>{#each narratives.narratives as n}<option value={n.id}>{n.title}</option>{/each}
    </select></label>
    {#if draft.fields.narrative && !draft.fields.narrativeId}<MarkupEditor context={`${draft.id}:inline-narrative`} label="Inline narrative" bind:value={draft.fields.narrative} rows={3} imageBankId={draft.sourceBankId} />{/if}
    <button onclick={() => creatingNarrative = !creatingNarrative}>New shared narrative</button>
    {#if creatingNarrative}<input aria-label="Narrative title" bind:value={narrativeTitle} placeholder="Title" /><MarkupEditor context={`${draft.id}:narrative`} label="Narrative" bind:value={narrativeBody} rows={3} /><button onclick={createNarrative}>Create narrative</button>{/if}
  </details>
  {#if draft.fields.graphTypst}<details><summary>Recovered graph source</summary><MarkupEditor context={`${draft.id}:graph-source`} label="Graph source" bind:value={draft.fields.graphTypst} rows={4} imageBankId={draft.sourceBankId} /></details>{/if}
  {#if draft.fields.algorithmModel}<p class="note">Algorithm definitions are preserved. Generate algorithmic variants from Bank.</p>{/if}
</div>
<style>
  .question-form { display: grid; gap: 1.25rem; padding: 1.25rem; }
  .question-type { display: flex; align-items: end; flex-wrap: wrap; gap: .5rem .75rem; }
  .question-type label { flex: 1 1 10rem; }
  label { display: grid; gap: .35rem; font-size: 12px; color: var(--text-2); }
  .metadata { display: grid; grid-template-columns: 100px 1fr; gap: .75rem; }
  input, select { width: 100%; min-width: 0; }
  details { display: grid; gap: .5rem; }
  summary { cursor: pointer; margin-bottom: .75rem; font-size: 13px; }
  .note { color: var(--text-2); font-size: 12px; }
  .structure { justify-self: start; }
  output { min-height: 2rem; display: flex; align-items: center; font-weight: 600; color: var(--text-1); }
</style>
