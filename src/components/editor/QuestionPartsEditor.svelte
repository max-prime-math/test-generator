<script lang="ts">
  import type { QuestionParts } from '../../lib/types';
  import { questionPartsPointTotal } from '../../lib/question-format';
  import MarkupEditor from './MarkupEditor.svelte';

  let { parts = $bindable(), context = 'parts', imageBankId }: {
    parts: QuestionParts;
    context?: string;
    imageBankId?: string;
  } = $props();

  let total = $derived(questionPartsPointTotal(parts));

  function setMode(value: string) {
    const pointsMode = value === 'parts' ? 'parts' : 'question';
    parts = {
      ...parts,
      pointsMode,
      items: parts.items.map((item) => pointsMode === 'parts' && item.points === undefined ? { ...item, points: 1 } : item),
    };
  }

  function setTasks(enabled: boolean) {
    parts = enabled
      ? { ...parts, layout: 'tasks', columns: parts.columns ?? 2 }
      : { ...parts, layout: undefined, columns: undefined };
  }

  function setColumns(value: string) {
    const columns = Math.max(1, Math.min(4, Number.parseInt(value, 10) || 2));
    parts = { ...parts, layout: 'tasks', columns };
  }

  function addPart() {
    parts = { ...parts, items: [...parts.items, { body: '', ...(parts.pointsMode === 'parts' ? { points: 1 } : {}) }] };
  }

  function move(index: number, delta: number) {
    const items = [...parts.items];
    [items[index], items[index + delta]] = [items[index + delta], items[index]];
    parts = { ...parts, items };
  }

  function remove(index: number) {
    parts = { ...parts, items: parts.items.filter((_item, candidate) => candidate !== index) };
  }
</script>

<fieldset>
  <legend>Question parts</legend>
  <MarkupEditor context={`${context}:stem`} label="Question stem / shared directions" bind:value={parts.stem} {imageBankId} />

  <div class="scoring">
    <label>Scoring
      <select value={parts.pointsMode === 'parts' ? 'parts' : 'question'} onchange={(event) => setMode(event.currentTarget.value)}>
        <option value="question">One score for the whole question</option>
        <option value="parts">A score for each part</option>
      </select>
    </label>
    {#if parts.pointsMode === 'parts'}<output>{total} total point{total === 1 ? '' : 's'}</output>{/if}
  </div>

  <div class="layout-options">
    <label class="visible"><input type="checkbox" checked={parts.layout === 'tasks'} onchange={(event) => setTasks(event.currentTarget.checked)} /> Tasks layout</label>
    {#if parts.layout === 'tasks'}
      <label class="columns">Columns
        <select value={String(parts.columns ?? 2)} onchange={(event) => setColumns(event.currentTarget.value)}>
          <option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option>
        </select>
      </label>
      <small>Parts fill each row from left to right.</small>
    {/if}
  </div>

  {#each parts.items as part, index}
    <section class:hidden={part.hidden}>
      <header>
        <strong>Part {String.fromCharCode(97 + index)})</strong>
        <label class="visible"><input type="checkbox" checked={!part.hidden} onchange={(event) => part.hidden = !event.currentTarget.checked} /> Include</label>
        {#if parts.pointsMode === 'parts'}
          <label class="points">Points<input type="number" min="0" step="0.5" bind:value={part.points} disabled={part.hidden} /></label>
        {/if}
        <div class="tools">
          <button type="button" onclick={() => move(index, -1)} disabled={index === 0} aria-label="Move part {index + 1} up">↑</button>
          <button type="button" onclick={() => move(index, 1)} disabled={index === parts.items.length - 1} aria-label="Move part {index + 1} down">↓</button>
          <button type="button" onclick={() => remove(index)} disabled={parts.items.length <= 2} aria-label="Remove part {index + 1}">×</button>
        </div>
      </header>
      <MarkupEditor context={`${context}:item:${index}`} label={`Part ${String.fromCharCode(97 + index)}`} bind:value={part.body} rows={4} {imageBankId} />
    </section>
  {/each}

  <button type="button" onclick={addPart}>+ Add part</button>
  <small>Hidden parts stay in the bank but do not print or count toward the total.</small>
</fieldset>

<style>
  fieldset { border: 1px solid var(--border); border-radius: 8px; padding: .8rem; min-width: 0; display: grid; gap: .85rem; }
  legend, small, output { font-size: 12px; color: var(--text-2); }
  section { border: 1px solid var(--border); border-radius: 7px; padding: .65rem; display: grid; gap: .5rem; }
  section.hidden { opacity: .58; }
  header, .scoring, .layout-options { display: flex; align-items: center; gap: .6rem; flex-wrap: wrap; }
  header strong { margin-right: auto; }
  label { display: grid; gap: .3rem; font-size: 12px; color: var(--text-2); }
  .visible { display: flex; align-items: center; flex-direction: row; }
  .visible input { width: auto; }
  .points { grid-template-columns: auto 5rem; align-items: center; }
  .columns { grid-template-columns: auto 4rem; align-items: center; }
  .tools { display: flex; }
  .tools button { padding: .3rem .5rem; }
  select { min-width: 15rem; }
</style>
