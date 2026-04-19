<script lang="ts">
  import { slide } from 'svelte/transition';
  import { bank } from '../lib/bank.svelte';
  import { CLASSES, findSection } from '../lib/curriculum';
  import { customClasses } from '../lib/custom-classes.svelte';
  import { defaultTestConfig } from '../lib/types';
  import { generateTypst, generatePreamble, generateIndividual, generateAnswerKeyPage } from '../lib/typst/template';
  import { appState } from '../lib/app-state.svelte';
  import Preview from './Preview.svelte';

  let config = $state(defaultTestConfig());

  // ── Picker filters ────────────────────────────────────────────────────
  let filterClassId    = $state(appState.lastClassId || (CLASSES[0]?.id ?? ''));
  let filterUnitId     = $state('');
  let filterSectionId  = $state('');
  let filterType       = $state<'' | 'mcq' | 'frq'>();

  function isMCQ(q: { choices?: Record<string, string>; solution?: string }): boolean {
    return (q.choices != null && Object.keys(q.choices).length >= 2) ||
      /^[A-Ea-e]$/.test(q.solution ?? '');
  }

  let allClasses     = $derived([...CLASSES, ...customClasses.classes]);
  let filterClass    = $derived(allClasses.find((c) => c.id === filterClassId));
  let filterUnits    = $derived(filterClass?.units ?? []);
  let filterUnit     = $derived(filterUnits.find((u) => u.id === filterUnitId));
  let filterSections = $derived(filterUnit?.sections ?? []);

  $effect(() => { if (!filterUnits.some((u) => u.id === filterUnitId)) filterUnitId = ''; });
  $effect(() => { if (!filterSections.some((s) => s.id === filterSectionId)) filterSectionId = ''; });

  // Sync the class title field and shared state when the picker class changes.
  $effect(() => {
    const cls = allClasses.find(c => c.id === filterClassId);
    if (cls) { config.title = cls.name; appState.lastClassId = filterClassId; }
  });

  let visibleQuestions = $derived(
    (() => {
      let qs = bank.questions;
      if (filterClassId)   qs = qs.filter((q) => q.classId   === filterClassId);
      if (filterUnitId)    qs = qs.filter((q) => q.unitId    === filterUnitId);
      if (filterSectionId) qs = qs.filter((q) => q.sectionId === filterSectionId);
      if (filterType === 'mcq') qs = qs.filter(isMCQ);
      if (filterType === 'frq') qs = qs.filter((q) => !isMCQ(q));
      return qs;
    })(),
  );

  // ── Question label helper ─────────────────────────────────────────────
  function unitLabel(unit: { id: string; name: string }): string {
    return /^\d+$/.test(unit.id) ? `Unit ${unit.id}: ${unit.name}` : unit.name;
  }

  function questionLabel(q: (typeof bank.questions)[0]): string {
    if (q.sectionId && q.unitId && q.classId) {
      const sec = findSection(q.classId, q.unitId, q.sectionId);
      if (sec) return `${q.sectionId} — ${sec.name}`;
    }
    if (q.unitId) return `Unit ${q.unitId}`;
    return '';
  }

  // ── Selected questions (ordered) ──────────────────────────────────────
  let selectedQuestions = $derived(
    config.selectedIds
      .map((id) => bank.questions.find((q) => q.id === id))
      .filter(Boolean) as typeof bank.questions,
  );

  let typstSource      = $derived(generateTypst(config, selectedQuestions));
  let testOnlySource   = $derived(generateTypst({ ...config, showAnswerKey: false }, selectedQuestions));
  let answerKeySource  = $derived(generateAnswerKeyPage(config, selectedQuestions));
  let questionSources  = $derived(generateIndividual(config, selectedQuestions));

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

  function selectAll() {
    const toAdd = visibleQuestions.map((q) => q.id).filter((id) => !config.selectedIds.includes(id));
    config.selectedIds = [...config.selectedIds, ...toAdd];
  }

  function selectRandom(n: number) {
    const pool = visibleQuestions.map((q) => q.id).filter((id) => !config.selectedIds.includes(id));
    config.selectedIds = [...config.selectedIds, ...pool.sort(() => Math.random() - 0.5).slice(0, n)];
  }

  function clearSelection() { config.selectedIds = []; }

  function shuffleChoices(q: (typeof bank.questions)[0]) {
    if (!q.choices) return;
    const origLetters = Object.keys(q.choices);
    for (let i = origLetters.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [origLetters[i], origLetters[j]] = [origLetters[j], origLetters[i]];
    }
    const newChoices: Record<string, string> = {};
    let newSolution = '';
    const correctOrig = (config.choiceOverrides[q.id]?.solution ?? q.solution ?? '').toUpperCase();
    origLetters.forEach((origLetter, idx) => {
      const newLetter = String.fromCharCode(65 + idx);
      newChoices[newLetter] = q.choices![origLetter];
      if (origLetter === correctOrig) newSolution = newLetter;
    });
    config.choiceOverrides = { ...config.choiceOverrides, [q.id]: { choices: newChoices, solution: newSolution } };
  }

  function resetChoiceOrder(qId: string) {
    const { [qId]: _, ...rest } = config.choiceOverrides;
    config.choiceOverrides = rest;
  }

  let randomCount = $state(5);

  // ── Per-question answer-space overrides ───────────────────────────────
  function getSpace(id: string): number {
    return config.answerSpaceOverrides[id] ?? config.answerSpace;
  }

  function setSpace(id: string, raw: string) {
    const val = parseFloat(raw);
    if (isNaN(val) || val < 0) return;
    if (val === config.answerSpace) {
      // Same as the default — remove the override
      const next = { ...config.answerSpaceOverrides };
      delete next[id];
      config.answerSpaceOverrides = next;
    } else {
      config.answerSpaceOverrides = { ...config.answerSpaceOverrides, [id]: val };
    }
  }

  function hasOverride(id: string): boolean {
    return id in config.answerSpaceOverrides;
  }

  // ── Custom preamble ───────────────────────────────────────────────────
  const customPreambleActive = $derived(config.customPreamble !== undefined);

  function enableCustomPreamble() {
    config.customPreamble = generatePreamble(config);
  }

  function disableCustomPreamble() {
    config.customPreamble = undefined;
  }
</script>

<div class="view">
  <!-- Left panel: config + question picker -->
  <div class="panel config-panel">

    <!-- ── Test Settings (hidden when custom preamble active) ───────── -->
    {#if !customPreambleActive}
      <section transition:slide={{ duration: 220 }}>
        <h3>Test Settings</h3>
        <div class="fields">
          <div class="field">
            <label for="t-title">Class</label>
            <input id="t-title" type="text" placeholder="Grade 10 Advanced Math" bind:value={config.title} />
          </div>
          <div class="field">
            <label for="t-subtitle">Test name <span class="field-hint">(optional)</span></label>
            <input id="t-subtitle" type="text" placeholder="Test 2" bind:value={config.subtitle} />
          </div>
          <div class="row">
            <div class="field" style="flex:1">
              <label for="t-space">Answer space (cm)</label>
              <input id="t-space" type="number" min="0" max="20" step="0.5" bind:value={config.answerSpace} />
            </div>
          </div>
          <label class="checkbox-row">
            <input type="checkbox" bind:checked={config.showDate} />
            Include date line
          </label>
          {#if config.showDate}
            <div class="field">
              <label for="t-date">Date</label>
              <input id="t-date" type="text" bind:value={config.date} />
            </div>
          {/if}
          <div class="field">
            <label for="t-instr">Instructions</label>
            <input id="t-instr" type="text" bind:value={config.instructions} />
          </div>
          <label class="checkbox-row">
            <input type="checkbox" bind:checked={config.showAnswerKey} />
            Include answer key
          </label>
          <label class="checkbox-row">
            <input type="checkbox" bind:checked={config.showPoints} />
            Show point values
          </label>
          {#if config.showPoints}
            <label class="checkbox-row" style="padding-left: 1.25rem">
              <input type="checkbox" bind:checked={config.pointsBold} />
              Bold point values
            </label>
          {/if}
        </div>
      </section>
    {/if}

    <!-- ── Formatting ────────────────────────────────────────────── -->
    <section>
      <h3>Formatting</h3>

      {#if !customPreambleActive}
        <div class="fields" transition:slide={{ duration: 220 }}>
          <div class="row">
            <div class="field" style="flex:1">
              <label for="t-fontsize">Font size</label>
              <select id="t-fontsize" bind:value={config.fontSize}>
                <option value={10}>10 pt</option>
                <option value={11}>11 pt</option>
                <option value={12}>12 pt</option>
              </select>
            </div>
            <div class="field" style="flex:1">
              <label for="t-paper">Paper</label>
              <select id="t-paper" bind:value={config.paper}>
                <option value="us-letter">US Letter</option>
                <option value="a4">A4</option>
              </select>
            </div>
          </div>
          <div class="field">
            <label for="t-margin">Margin (inches)</label>
            <input id="t-margin" type="number" min="0.5" max="2" step="0.25" bind:value={config.marginIn} />
          </div>
        </div>
      {/if}

      <div class="preamble-toggle">
        {#if !customPreambleActive}
          <button class="ghost" onclick={enableCustomPreamble}>Edit preamble manually…</button>
        {:else}
          <div class="preamble-header">
            <span class="preamble-label">Custom preamble</span>
            <button class="ghost danger-ghost" onclick={disableCustomPreamble}>Reset to automatic</button>
          </div>
          <textarea
            class="preamble-editor"
            spellcheck={false}
            value={config.customPreamble}
            oninput={(e) => (config.customPreamble = e.currentTarget.value)}
          ></textarea>
        {/if}
      </div>
    </section>

    <!-- ── Questions ─────────────────────────────────────────────── -->
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
              <div class="sel-info">
                <span class="sel-body">{q.body.slice(0, 55)}{q.body.length > 55 ? '…' : ''}</span>
                {#if questionLabel(q)}
                  <span class="sel-loc">{questionLabel(q)}</span>
                {/if}
              </div>
              <!-- Per-question answer space -->
              <div class="sel-space" title="Answer space for this question (cm)">
                <input
                  type="number"
                  min="0"
                  max="20"
                  step="0.5"
                  class:overridden={hasOverride(q.id)}
                  value={getSpace(q.id)}
                  oninput={(e) => setSpace(q.id, e.currentTarget.value)}
                />
                <span>cm</span>
              </div>
              <div class="sel-actions">
                {#if q.choices && Object.keys(q.choices).length >= 2}
                  <button
                    class="ghost"
                    class:shuffled={!!config.choiceOverrides[q.id]}
                    onclick={() => shuffleChoices(q)}
                    title="Shuffle choices"
                  >⇄</button>
                  {#if config.choiceOverrides[q.id]}
                    <button class="ghost" onclick={() => resetChoiceOrder(q.id)} title="Reset choice order">↺</button>
                  {/if}
                {/if}
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

      <!-- Curriculum filter -->
      <div class="filter-group">
        <select bind:value={filterClassId} title="Filter by class">
          <option value="">All classes</option>
          {#each allClasses as cls}
            <option value={cls.id}>{cls.name}</option>
          {/each}
        </select>
        <select bind:value={filterUnitId} disabled={filterUnits.length === 0} title="Filter by unit">
          <option value="">All units</option>
          {#each filterUnits as unit}
            <option value={unit.id}>{unitLabel(unit)}</option>
          {/each}
        </select>
        <select bind:value={filterSectionId} disabled={filterSections.length === 0} title="Filter by section">
          <option value="">All sections</option>
          {#each filterSections as sec}
            <option value={sec.id}>{sec.id} {sec.name}</option>
          {/each}
        </select>
        <select bind:value={filterType} title="Filter by question type">
          <option value="">All types</option>
          <option value="mcq">Multiple choice only</option>
          <option value="frq">Free response only</option>
        </select>
      </div>

      <div class="picker-toolbar">
        <span class="muted">{visibleQuestions.length} question{visibleQuestions.length !== 1 ? 's' : ''}</span>
        <div class="random-row">
          <button class="ghost" onclick={selectAll} disabled={visibleQuestions.length === 0} style="font-size:12px">
            Select all
          </button>
          <input type="number" min="1" max={visibleQuestions.length || 1} bind:value={randomCount} style="width:52px" />
          <button onclick={() => selectRandom(randomCount)} disabled={visibleQuestions.length === 0}>
            + Random
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
              <div class="picker-info">
                <span class="picker-body">{q.body.slice(0, 70)}{q.body.length > 70 ? '…' : ''}</span>
                {#if questionLabel(q)}
                  <span class="picker-loc">{questionLabel(q)}</span>
                {/if}
              </div>
              <span class="picker-pts">{q.points}pt</span>
            </label>
          {/each}
        </div>
      {/if}
    </section>
  </div>

  <!-- Right panel: live preview -->
  <div class="panel preview-panel">
    <Preview source={typstSource} {testOnlySource} {answerKeySource} {questionSources} />
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
    width: 400px;
    flex-shrink: 0;
    overflow-y: auto;
    padding: 1rem;
    gap: 1.5rem;
    border-right: 1px solid var(--border);
  }

  .preview-panel { flex: 1; }

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

  .checkbox-row input { width: auto; }

  .field-hint {
    font-weight: 400;
    font-size: 10px;
    color: var(--text-2);
    text-transform: none;
    letter-spacing: 0;
  }

  /* ── Custom preamble ───────────────────────────────────────────── */
  .preamble-toggle {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    opacity: 1 !important; /* always full opacity even inside muted-section */
    position: relative;
    z-index: 1;
  }

  .preamble-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .preamble-label {
    font-size: 12px;
    font-weight: 500;
    color: var(--text);
  }

  .preamble-editor {
    font-family: monospace;
    font-size: 11px;
    line-height: 1.55;
    resize: vertical;
    min-height: 200px;
    width: 100%;
    box-sizing: border-box;
  }

  .danger-ghost {
    color: var(--danger);
  }

  .danger-ghost:hover {
    background: color-mix(in srgb, var(--danger) 10%, transparent);
  }

  /* ── Selected question list ────────────────────────────────────── */
  .selected-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 200px;
    overflow-y: auto;
  }

  .sel-item {
    display: flex;
    align-items: center;
    gap: 0.4rem;
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
    flex-shrink: 0;
  }

  .sel-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .sel-body {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: monospace;
    font-size: 11px;
  }

  .sel-loc {
    font-size: 10px;
    color: var(--text-2);
    font-style: italic;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Per-question space control */
  .sel-space {
    display: flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
    font-size: 11px;
    color: var(--text-2);
  }

  .sel-space input {
    width: 38px;
    padding: 1px 4px;
    font-size: 11px;
    text-align: right;
  }

  .sel-space input.overridden {
    color: var(--primary);
    font-weight: 600;
  }

  .sel-actions {
    display: flex;
    gap: 2px;
    flex-shrink: 0;
  }

  .sel-actions button {
    padding: 2px 4px;
    font-size: 11px;
  }

  .sel-actions button.shuffled {
    color: var(--primary);
  }

  /* ── Curriculum filter ─────────────────────────────────────────── */
  .filter-group {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .filter-group select {
    font-size: 12px;
    width: 100%;
  }

  /* ── Question picker ───────────────────────────────────────────── */
  .picker-toolbar {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    justify-content: space-between;
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
    max-height: 320px;
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

  .picker-item:hover { background: var(--bg-2); }

  .picker-item.checked {
    background: color-mix(in srgb, var(--primary) 8%, transparent);
    border-color: color-mix(in srgb, var(--primary) 30%, transparent);
  }

  .picker-item input {
    width: auto;
    flex-shrink: 0;
  }

  .picker-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .picker-body {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: monospace;
    font-size: 11px;
  }

  .picker-loc {
    font-size: 10px;
    color: var(--text-2);
    font-style: italic;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
