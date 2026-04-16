<script lang="ts">
  import { bank } from '../lib/bank.svelte';
  import { defaultTestConfig } from '../lib/types';
  import { generateTypst } from '../lib/typst/template';
  import Preview from './Preview.svelte';

  let config = $state(defaultTestConfig());

  // All available tags across the bank
  let allTags = $derived([...new Set(bank.questions.flatMap((q) => q.tags))].sort());

  // For filtering the question picker
  let tagFilter = $state('');

  let visibleQuestions = $derived(
    tagFilter
      ? bank.questions.filter((q) => q.tags.includes(tagFilter))
      : bank.questions,
  );

  // The ordered list of selected questions
  let selectedQuestions = $derived(
    config.selectedIds
      .map((id) => bank.questions.find((q) => q.id === id))
      .filter(Boolean) as typeof bank.questions,
  );

  let typstSource = $derived(generateTypst(config, selectedQuestions));

  function toggleQuestion(id: string) {
    if (config.selectedIds.includes(id)) {
      config.selectedIds = config.selectedIds.filter((x) => x !== id);
    } else {
      config.selectedIds = [...config.selectedIds, id];
    }
  }

  function moveUp(i: number) {
    if (i === 0) return;
    const ids = [...config.selectedIds];
    [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]];
    config.selectedIds = ids;
  }

  function moveDown(i: number) {
    if (i === config.selectedIds.length - 1) return;
    const ids = [...config.selectedIds];
    [ids[i], ids[i + 1]] = [ids[i + 1], ids[i]];
    config.selectedIds = ids;
  }

  function selectRandom(n: number) {
    const pool = visibleQuestions.map((q) => q.id);
    const shuffled = pool.sort(() => Math.random() - 0.5);
    config.selectedIds = shuffled.slice(0, n);
  }

  function clearSelection() {
    config.selectedIds = [];
  }

  let randomCount = $state(5);
</script>

<div class="view">
  <!-- Left panel: config + question picker -->
  <div class="panel config-panel">
    <section>
      <h3>Test Settings</h3>
      <div class="fields">
        <div class="field">
          <label for="t-title">Title</label>
          <input id="t-title" type="text" placeholder="Math Test" bind:value={config.title} />
        </div>
        <div class="field">
          <label for="t-subtitle">Subtitle</label>
          <input id="t-subtitle" type="text" placeholder="Chapter 3 Review" bind:value={config.subtitle} />
        </div>
        <div class="row">
          <div class="field" style="flex:1">
            <label for="t-date">Date</label>
            <input id="t-date" type="text" bind:value={config.date} />
          </div>
          <div class="field" style="flex:1">
            <label for="t-space">Answer space (cm)</label>
            <input id="t-space" type="number" min="1" max="20" step="0.5" bind:value={config.answerSpace} />
          </div>
        </div>
        <div class="field">
          <label for="t-instr">Instructions</label>
          <input id="t-instr" type="text" bind:value={config.instructions} />
        </div>
        <label class="checkbox-row">
          <input type="checkbox" bind:checked={config.showPoints} />
          Show point values
        </label>
      </div>
    </section>

    <section>
      <h3>
        Questions
        <span class="count">{config.selectedIds.length} selected</span>
      </h3>

      {#if config.selectedIds.length > 0}
        <div class="selected-list">
          {#each selectedQuestions as q, i (q.id)}
            <div class="sel-item">
              <span class="sel-num">{i + 1}</span>
              <span class="sel-body">{q.body.slice(0, 60)}{q.body.length > 60 ? '…' : ''}</span>
              <div class="sel-actions">
                <button class="ghost" onclick={() => moveUp(i)} disabled={i === 0} title="Move up">↑</button>
                <button class="ghost" onclick={() => moveDown(i)} disabled={i === config.selectedIds.length - 1} title="Move down">↓</button>
                <button class="ghost" onclick={() => toggleQuestion(q.id)} title="Remove">✕</button>
              </div>
            </div>
          {/each}
        </div>
        <button class="ghost" onclick={clearSelection} style="font-size:12px; margin-top: 4px;">
          Clear all
        </button>
      {/if}

      <div class="picker-toolbar">
        <select bind:value={tagFilter}>
          <option value="">All tags</option>
          {#each allTags as tag}
            <option value={tag}>{tag}</option>
          {/each}
        </select>
        <div class="random-row">
          <input type="number" min="1" max={visibleQuestions.length || 1} bind:value={randomCount} style="width:60px" />
          <button onclick={() => selectRandom(randomCount)} disabled={visibleQuestions.length === 0}>
            Pick random
          </button>
        </div>
      </div>

      {#if bank.questions.length === 0}
        <p class="muted">Add questions to the bank first.</p>
      {:else}
        <div class="picker-list">
          {#each visibleQuestions as q (q.id)}
            {@const checked = config.selectedIds.includes(q.id)}
            <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
            <label class="picker-item" class:checked>
              <input type="checkbox" {checked} onchange={() => toggleQuestion(q.id)} />
              <span class="picker-body">{q.body.slice(0, 80)}{q.body.length > 80 ? '…' : ''}</span>
              <span class="picker-pts">{q.points}pt</span>
            </label>
          {/each}
        </div>
      {/if}
    </section>
  </div>

  <!-- Right panel: live preview -->
  <div class="panel preview-panel">
    <Preview source={typstSource} />
  </div>
</div>

<style>
  .view {
    display: flex;
    height: 100%;
    overflow: hidden;
  }

  .panel {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .config-panel {
    width: 360px;
    flex-shrink: 0;
    overflow-y: auto;
    padding: 1rem;
    gap: 1.5rem;
    border-right: 1px solid var(--border);
  }

  .preview-panel {
    flex: 1;
  }

  section {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  h3 {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-2);
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .count {
    font-weight: 500;
    text-transform: none;
    letter-spacing: 0;
    color: var(--primary);
    background: color-mix(in srgb, var(--primary) 10%, transparent);
    border-radius: 10px;
    padding: 1px 8px;
    font-size: 11px;
  }

  .fields {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .row {
    display: flex;
    gap: 0.5rem;
  }

  .checkbox-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    font-size: 13px;
    color: var(--text);
    font-weight: 400;
    margin-bottom: 0;
  }

  .checkbox-row input {
    width: auto;
  }

  /* Selected question list */
  .selected-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 180px;
    overflow-y: auto;
  }

  .sel-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 4px 6px;
    background: var(--bg-2);
    border-radius: 4px;
    font-size: 12px;
  }

  .sel-num {
    font-weight: 600;
    color: var(--text-2);
    min-width: 16px;
    text-align: right;
  }

  .sel-body {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: monospace;
    font-size: 11px;
  }

  .sel-actions {
    display: flex;
    gap: 2px;
  }

  .sel-actions button {
    padding: 2px 4px;
    font-size: 11px;
  }

  /* Question picker */
  .picker-toolbar {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .picker-toolbar select {
    flex: 1;
  }

  .random-row {
    display: flex;
    gap: 0.25rem;
    align-items: center;
  }

  .picker-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 300px;
    overflow-y: auto;
  }

  .picker-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 6px 8px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    border: 1px solid transparent;
    transition: background 0.1s;
  }

  .picker-item:hover {
    background: var(--bg-2);
  }

  .picker-item.checked {
    background: color-mix(in srgb, var(--primary) 8%, transparent);
    border-color: color-mix(in srgb, var(--primary) 30%, transparent);
  }

  .picker-item input {
    width: auto;
    flex-shrink: 0;
  }

  .picker-body {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: monospace;
    font-size: 11px;
  }

  .picker-pts {
    font-size: 11px;
    color: var(--text-2);
    flex-shrink: 0;
  }

  .muted {
    font-size: 12px;
    color: var(--text-2);
  }
</style>
