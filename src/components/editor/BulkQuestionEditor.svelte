<script lang="ts">
  import CurriculumPicker from './CurriculumPicker.svelte';
  import { editor } from '../../lib/editor/editor-state.svelte';
  import { clone, type EditorDefaults } from '../../lib/editor/editor-model';
  let { selected, onclose }: { selected: string[]; onclose: () => void } = $props();
  let values = $state<EditorDefaults>(clone(editor.session.defaults));
  let placement = $state(false);
  let points = $state(false);
  let tags = $state(false);
  function apply() {
    for (const draft of editor.session.drafts.filter(d => selected.includes(d.id))) {
      if (placement) Object.assign(draft.fields, { classId: values.classId, unitId: values.unitId, sectionId: values.sectionId });
      if (points) draft.fields.points = values.points;
      if (tags) draft.fields.tagInput = values.tagInput;
    }
    editor.persist(); onclose();
  }
</script>
<div class="bulk">
  <strong>Apply shared values to {selected.length} selected drafts</strong>
  <label><input type="checkbox" bind:checked={placement} /> Replace curriculum placement</label>
  {#if placement}<CurriculumPicker bind:classId={values.classId} bind:unitId={values.unitId} bind:sectionId={values.sectionId} />{/if}
  <label><input type="checkbox" bind:checked={points} /> Replace points</label>
  {#if points}<input aria-label="Batch points" type="number" min="0" step="0.5" bind:value={values.points} />{/if}
  <label><input type="checkbox" bind:checked={tags} /> Replace tags</label>
  {#if tags}<input aria-label="Batch tags" bind:value={values.tagInput} placeholder="Comma-separated tags" />{/if}
  <div><button class="primary" onclick={apply} disabled={!placement && !points && !tags}>Apply to drafts</button> <button onclick={onclose}>Close</button></div>
</div>
<style>input[type=checkbox] { width: auto; } label { display: flex; align-items: center; gap: .4rem; } .bulk { padding: 1rem; display: grid; gap: .6rem; background: var(--bg-2); border-bottom: 1px solid var(--border); font-size: 13px; }</style>
