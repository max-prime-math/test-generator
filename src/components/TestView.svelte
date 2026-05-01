<script lang="ts">
  import { slide } from 'svelte/transition';
  import { bank } from '../lib/bank.svelte';
  import { CLASSES, DEMO_CLASSES, findSection } from '../lib/curriculum';
  import { customClasses } from '../lib/custom-classes.svelte';
  import { defaultTestConfig } from '../lib/types';
  import { generateTypst, generatePreamble, generateAnswerKeyPage } from '../lib/typst/template';
  import { appState } from '../lib/app-state.svelte';
  import { fuzzyScoreMulti } from '../lib/fuzzy';
  import Preview from './Preview.svelte';

  function initialTestTitle(): string {
    const classes = appState.demoMode ? [...CLASSES, ...DEMO_CLASSES, ...customClasses.classes] : [...CLASSES, ...customClasses.classes];
    return classes.find((c) => c.id === appState.lastClassId)?.name ?? defaultTestConfig().title;
  }

  let config = $state(defaultTestConfig(initialTestTitle()));

  let allClasses = $derived(appState.demoMode ? [...CLASSES, ...DEMO_CLASSES, ...customClasses.classes] : [...CLASSES, ...customClasses.classes]);

  // ── Picker filters ────────────────────────────────────────────────────
  let filterClassId    = $state(appState.lastClassId || ((appState.demoMode ? [...CLASSES, ...DEMO_CLASSES] : CLASSES)[0]?.id ?? ''));
  let filterUnitId     = $state('');
  let filterSectionId  = $state('');
  let filterType       = $state<'' | 'mcq' | 'frq'>();

  function isMCQ(q: { choices?: Record<string, string>; answer?: string; solution?: string }): boolean {
    return (q.choices != null && Object.keys(q.choices).length >= 2) ||
      /^[A-Ea-e]$/.test(q.answer ?? '') ||
      /^[A-Ea-e]$/.test(q.solution ?? '');  // backward compat: old data stored letter in solution
  }

  let filterClass    = $derived(allClasses.find((c) => c.id === filterClassId));
  let filterUnits    = $derived(filterClass?.units ?? []);
  let filterUnit     = $derived(filterUnits.find((u) => u.id === filterUnitId));
  let filterSections = $derived(filterUnit?.sections ?? []);

  $effect(() => { if (!filterUnits.some((u) => u.id === filterUnitId)) filterUnitId = ''; });
  $effect(() => { if (!filterSections.some((s) => s.id === filterSectionId)) filterSectionId = ''; });

  // Sync from bank when lastClassId changes (one-directional: BankView writes, TestView reads)
  $effect(() => {
    const bankId = appState.lastClassId;
    if (bankId && allClasses.some(c => c.id === bankId)) filterClassId = bankId;
  });

  // Keep config.title in sync with the active class
  $effect(() => {
    const cls = allClasses.find(c => c.id === filterClassId);
    if (cls) config.title = cls.name;
  });

  // Persist the active class so the next test session starts from the same class.
  $effect(() => {
    if (filterClassId && appState.lastClassId !== filterClassId) {
      appState.setLastClassId(filterClassId);
    }
  });

  let pickerSearch = $state('');

  let visibleQuestions = $derived(
    (() => {
      let qs = bank.questions;
      if (filterClassId)   qs = qs.filter((q) => q.classId   === filterClassId);
      if (filterUnitId)    qs = qs.filter((q) => q.unitId    === filterUnitId);
      if (filterSectionId) qs = qs.filter((q) => q.sectionId === filterSectionId);
      if (filterType === 'mcq') qs = qs.filter(isMCQ);
      if (filterType === 'frq') qs = qs.filter((q) => !isMCQ(q));

      // Apply fuzzy search if query is present
      if (pickerSearch.trim()) {
        const scored = qs.map((q) => ({
          q,
          score: fuzzyScoreMulti(pickerSearch.trim(), [
            { text: q.body, weight: 2 },
            { text: q.tags.join(' '), weight: 1.5 },
            { text: q.solution ?? '', weight: 1 },
            { text: q.answer ?? '', weight: 1 },
          ]),
        }));
        qs = scored
          .filter((s) => s.score > 0)
          .sort((a, b) => b.score - a.score)
          .map((s) => s.q);
      }

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
  let combinedSource   = $derived(generateTypst({ ...config, showAnswerKey: true }, selectedQuestions));

  function toggleQuestion(id: string) {
    if (config.selectedIds.includes(id)) {
      config.selectedIds = config.selectedIds.filter((x) => x !== id);
    } else {
      config.selectedIds = [...config.selectedIds, id];
    }
  }

  function handleDrop(toIdx: number) {
    if (dragFromIdx === null || dragFromIdx === toIdx) {
      dragFromIdx = null;
      dragOverIdx = null;
      return;
    }
    const ids = [...config.selectedIds];
    const [moved] = ids.splice(dragFromIdx, 1);
    ids.splice(toIdx, 0, moved);

    if (config.mcqFirst) {
      const qs = ids.map((id) => bank.questions.find((q) => q.id === id)!);
      let lastMCQIdx = -1;
      let firstFRQIdx = qs.length;
      qs.forEach((q, i) => {
        if (isMCQ(q)) lastMCQIdx = i;
        else if (i < firstFRQIdx) firstFRQIdx = i;
      });
      if (firstFRQIdx < lastMCQIdx) {
        dragFromIdx = null;
        dragOverIdx = null;
        return;
      }
    }

    config.selectedIds = ids;
    dragFromIdx = null;
    dragOverIdx = null;
  }

  function startSettingsPanelResize(e: MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = settingsPanelWidth;
    function onMove(ev: MouseEvent) {
      settingsPanelWidth = Math.max(240, Math.min(450, startW + (ev.clientX - startX)));
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function startPickerPanelResize(e: MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = pickerPanelWidth;
    function onMove(ev: MouseEvent) {
      pickerPanelWidth = Math.max(240, Math.min(500, startW + (ev.clientX - startX)));
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
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

  // Parse choices out of old-format bodies where grid is embedded as Typst markup.
  function extractChoicesFromBody(body: string): Record<string, string> | null {
    const gridIdx = body.lastIndexOf('\n\n#grid(');
    if (gridIdx === -1) return null;
    const gridPart = body.slice(gridIdx);
    const choices: Record<string, string> = {};
    for (const m of gridPart.matchAll(/\[\*\(([A-E])\)\*\s*(.*?)\]/g)) {
      choices[m[1]] = m[2].trim();
    }
    return Object.keys(choices).length >= 2 ? choices : null;
  }

  function getChoices(q: (typeof bank.questions)[0]): Record<string, string> | null {
    return q.choices && Object.keys(q.choices).length >= 2
      ? q.choices
      : extractChoicesFromBody(q.body);
  }

  function shuffleChoices(q: (typeof bank.questions)[0]) {
    const srcChoices = getChoices(q);
    if (!srcChoices) return;
    // Start from original question choices (not current override) so re-shuffling is fair
    const origLetters = Object.keys(srcChoices);
    for (let i = origLetters.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [origLetters[i], origLetters[j]] = [origLetters[j], origLetters[i]];
    }
    const newChoices: Record<string, string> = {};
    let newSolution = '';
    const correctOrig = (q.answer ?? q.solution ?? '').toUpperCase(); // q.answer preferred; q.solution for legacy
    origLetters.forEach((origLetter, idx) => {
      const newLetter = String.fromCharCode(65 + idx);
      newChoices[newLetter] = srcChoices[origLetter];
      if (origLetter === correctOrig) newSolution = newLetter;
    });
    config.choiceOverrides = { ...config.choiceOverrides, [q.id]: { choices: newChoices, solution: newSolution } };
  }

  function resetChoiceOrder(qId: string) {
    const { [qId]: _, ...rest } = config.choiceOverrides;
    config.choiceOverrides = rest;
  }

  function shuffleAllMCQ() {
    for (const q of selectedQuestions) {
      if (getChoices(q)) shuffleChoices(q);
    }
  }

  let settingsPanelWidth = $state(300);
  let pickerPanelWidth   = $state(320);
  let pickerVisible      = $state(true);
  let dragFromIdx        = $state<number | null>(null);
  let dragOverIdx        = $state<number | null>(null);

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
  <!-- LEFT PANE: Test Settings -->
  <div class="settings-panel" style="width: {settingsPanelWidth}px">
    <div class="settings-content">

      <!-- Test Info Section -->
      <section class="settings-section">
        <h2 class="section-header">Test Info</h2>
        <div class="section-body">
          <div class="field">
            <label for="t-title">Title</label>
            <input id="t-title" type="text" bind:value={config.title} />
          </div>
          <div class="field">
            <label for="t-subtitle">Test name <span class="field-hint">(optional)</span></label>
            <input id="t-subtitle" type="text" placeholder="Test 2" bind:value={config.subtitle} />
          </div>
          <div class="field">
            <label for="t-instr">Instructions</label>
            <input id="t-instr" type="text" bind:value={config.instructions} />
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
        </div>
      </section>

      <!-- Output Section -->
      <section class="settings-section">
        <h2 class="section-header">Output</h2>
        <div class="section-body">
          <div class="field">
            <label for="t-space">Answer space <span class="field-hint">(cm)</span></label>
            <input id="t-space" type="number" min="0" max="20" step="0.5" bind:value={config.answerSpace} />
          </div>
          <label class="checkbox-row">
            <input type="checkbox" bind:checked={config.mcqFirst} />
            MCQs first
          </label>
          <label class="checkbox-row">
            <input type="checkbox" bind:checked={config.showPoints} />
            Show point values
          </label>
          {#if config.showPoints}
            <label class="checkbox-row indented">
              <input type="checkbox" bind:checked={config.pointsBold} />
              Bold point values
            </label>
          {/if}
        </div>
      </section>

      <!-- Answer Key Section -->
      <section class="settings-section">
        <h2 class="section-header">Answer Key</h2>
        <div class="section-body">
          <label class="checkbox-row">
            <input type="checkbox" bind:checked={config.showAnswerKey} />
            Include answer key
          </label>
          {#if config.showAnswerKey}
            <label class="checkbox-row indented">
              <input type="checkbox" bind:checked={config.mcqFullSolutions} />
              Include full MCQ solutions
            </label>
          {/if}
        </div>
      </section>

      <!-- Formatting Section -->
      <section class="settings-section">
        <h2 class="section-header">Formatting</h2>
        <div class="section-body">
          <div class="field-row">
            <div class="field">
              <label for="t-fontsize">Font size</label>
              <select id="t-fontsize" bind:value={config.fontSize}>
                <option value={10}>10 pt</option>
                <option value={11}>11 pt</option>
                <option value={12}>12 pt</option>
              </select>
            </div>
            <div class="field">
              <label for="t-paper">Paper</label>
              <select id="t-paper" bind:value={config.paper}>
                <option value="us-letter">US Letter</option>
                <option value="a4">A4</option>
              </select>
            </div>
          </div>
          <div class="field">
            <label for="t-margin">Margin <span class="field-hint">(inches)</span></label>
            <input id="t-margin" type="number" min="0.5" max="2" step="0.25" bind:value={config.marginIn} />
          </div>
          <div class="preamble-section">
            {#if !customPreambleActive}
              <button class="ghost small" onclick={enableCustomPreamble}>Edit preamble manually…</button>
            {:else}
              <div class="preamble-header">
                <span class="preamble-label">Custom preamble</span>
                <button class="ghost small danger-text" onclick={disableCustomPreamble}>Reset</button>
              </div>
              <textarea
                class="preamble-editor"
                spellcheck={false}
                value={config.customPreamble}
                oninput={(e) => (config.customPreamble = e.currentTarget.value)}
              ></textarea>
            {/if}
          </div>
        </div>
      </section>

      <!-- Graph Defaults (Collapsible) -->
      <details class="settings-section collapsible">
        <summary class="section-header">Graph Defaults</summary>
        <div class="section-body">
          <label class="checkbox-row">
            <input type="checkbox" bind:checked={config.graphDefaults!.showGrid} />
            Show grid
          </label>
          <div class="field">
            <label for="g-gridcolor">Grid color</label>
            <input id="g-gridcolor" type="text" placeholder="silver" bind:value={config.graphDefaults!.gridColor} />
          </div>
          <div class="field-row">
            <div class="field">
              <label for="g-axisw">Axis weight <span class="field-hint">(px)</span></label>
              <input id="g-axisw" type="number" min="0.5" max="4" step="0.5" bind:value={config.graphDefaults!.axisWeight} />
            </div>
            <div class="field">
              <label for="g-curvew">Curve weight <span class="field-hint">(px)</span></label>
              <input id="g-curvew" type="number" min="0.5" max="4" step="0.5" bind:value={config.graphDefaults!.curveWeight} />
            </div>
          </div>
          <div class="field">
            <label for="g-asymc">Asymptote color</label>
            <input id="g-asymc" type="text" placeholder="red" bind:value={config.graphDefaults!.asymptoteColor} />
          </div>
          <div class="field-row">
            <div class="field">
              <label for="g-width">Width <span class="field-hint">(cm)</span></label>
              <input id="g-width" type="number" min="2" max="15" step="0.5" bind:value={config.graphDefaults!.defaultWidth} />
            </div>
            <div class="field">
              <label for="g-height">Height <span class="field-hint">(cm)</span></label>
              <input id="g-height" type="number" min="2" max="15" step="0.5" bind:value={config.graphDefaults!.defaultHeight} />
            </div>
          </div>
          <div class="field-row">
            <div class="field">
              <label for="g-xstep">X tick step</label>
              <input id="g-xstep" type="number" min="0.1" step="0.1" bind:value={config.graphDefaults!.xStep} />
            </div>
            <div class="field">
              <label for="g-ystep">Y tick step</label>
              <input id="g-ystep" type="number" min="0.1" step="0.1" bind:value={config.graphDefaults!.yStep} />
            </div>
          </div>
        </div>
      </details>

    </div>

    <!-- Selected Questions Section -->
    <div class="selected-questions-section">
      <div class="selected-header">
        Selected Questions
        {#if config.selectedIds.length > 0}
          <span class="selected-count">{config.selectedIds.length}</span>
        {/if}
      </div>

      {#if config.selectedIds.length > 0}
        <div class="selected-list">
          {#each selectedQuestions as q, i (q.id)}
            <div
              class="sel-item"
              class:drag-over={dragOverIdx === i}
              class:dragging={dragFromIdx === i}
              draggable={true}
              ondragstart={() => (dragFromIdx = i)}
              ondragover={(e) => {
                e.preventDefault();
                dragOverIdx = i;
              }}
              ondragleave={() => (dragOverIdx = null)}
              ondrop={() => handleDrop(i)}
              ondragend={() => {
                dragFromIdx = null;
                dragOverIdx = null;
              }}
            >
              <span class="drag-handle">⠿</span>
              <span class="sel-num">{i + 1}</span>
              <div class="sel-info">
                <span class="sel-body">{q.body.slice(0, 50)}{q.body.length > 50 ? '…' : ''}</span>
              </div>
              <div class="sel-space">
                <input
                  type="number"
                  min="0"
                  max="20"
                  step="0.5"
                  class:overridden={hasOverride(q.id)}
                  value={getSpace(q.id)}
                  oninput={(e) => setSpace(q.id, e.currentTarget.value)}
                  title="Answer space"
                />
                <span>cm</span>
              </div>
              <div class="sel-actions">
                {#if getChoices(q)}
                  <button
                    class="ghost tiny"
                    class:shuffled={!!config.choiceOverrides[q.id]}
                    onclick={() => shuffleChoices(q)}
                    title="Shuffle"
                  >⟳</button>
                  {#if config.choiceOverrides[q.id]}
                    <button class="ghost tiny" onclick={() => resetChoiceOrder(q.id)} title="Reset">↻</button>
                  {/if}
                {/if}
                <button class="ghost tiny" onclick={() => toggleQuestion(q.id)} title="Remove">✕</button>
              </div>
            </div>
          {/each}
        </div>
        <div class="selected-footer">
          <button class="ghost small" onclick={clearSelection}>Clear all</button>
          {#if selectedQuestions.some(q => !!getChoices(q))}
            <button class="ghost small" onclick={shuffleAllMCQ}>Shuffle MCQ</button>
          {/if}
        </div>
      {/if}
    </div>

  </div>

  <!-- DIVIDER -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="resize-handle" onmousedown={startSettingsPanelResize}></div>

  <!-- MIDDLE PANE: Question Picker (Conditionally Visible) -->
  {#if pickerVisible}
    <div class="picker-panel" style="width: {pickerPanelWidth}px">
      <div class="picker-header">
        <input
          type="search"
          class="picker-search"
          placeholder="Search…"
          bind:value={pickerSearch}
        />
        <button
          class="ghost icon-btn picker-toggle"
          onclick={() => (pickerVisible = false)}
          title="Hide picker"
        >
          ✕
        </button>
      </div>

      <div class="picker-filters">
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
        <select bind:value={filterType} title="Filter by type">
          <option value="">All types</option>
          <option value="mcq">Multiple choice</option>
          <option value="frq">Free response</option>
        </select>
      </div>

      <div class="picker-toolbar">
        <span class="q-count">{visibleQuestions.length} q</span>
        <div class="picker-actions">
          <button class="ghost small" onclick={selectAll} disabled={visibleQuestions.length === 0}>
            All
          </button>
          <div class="random-group">
            <button class="ghost small" onclick={() => selectRandom(randomCount)} disabled={visibleQuestions.length === 0}>
              Random
            </button>
            <input type="number" min="1" max={visibleQuestions.length || 1} bind:value={randomCount} title="Count" />
          </div>
        </div>
      </div>

      {#if bank.questions.length === 0}
        <div class="picker-empty">Add questions to the bank first</div>
      {:else if visibleQuestions.length === 0}
        <div class="picker-empty">No questions match</div>
      {:else}
        <div class="picker-list">
          {#each visibleQuestions as q (q.id)}
            {@const checked = config.selectedIds.includes(q.id)}
            <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
            <label class="picker-item" class:checked>
              <input type="checkbox" {checked} onchange={() => toggleQuestion(q.id)} />
              <div class="picker-info">
                <span class="picker-body">{q.body.slice(0, 60)}{q.body.length > 60 ? '…' : ''}</span>
              </div>
              <span class="picker-pts">{q.points}pt</span>
            </label>
          {/each}
        </div>
      {/if}
    </div>

    <!-- DIVIDER -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="resize-handle" onmousedown={startPickerPanelResize}></div>
  {/if}

  <!-- SHOW PICKER BUTTON (when hidden) -->
  {#if !pickerVisible}
    <button class="show-picker-btn" onclick={() => (pickerVisible = true)} title="Show question picker">
      ≡ Questions
    </button>
  {/if}

  <!-- RIGHT PANE: Preview -->
  <div class="preview-panel">
    <Preview source={typstSource} {testOnlySource} {answerKeySource} {combinedSource} />
  </div>
</div>

<style>
  .view {
    display: flex;
    height: 100%;
    overflow: hidden;
    background: var(--bg);
  }

  /* ── Settings Panel (Left) ────────────────────────────────────── */
  .settings-panel {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    border-right: 1px solid var(--border);
    background: var(--bg);
    overflow: hidden;
  }

  .settings-content {
    flex: 1;
    overflow-y: auto;
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .settings-section {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .settings-section.collapsible {
    border: none;
    padding: 0;
    gap: 0;
  }

  .settings-section.collapsible summary {
    cursor: pointer;
  }

  .settings-section.collapsible summary::-webkit-details-marker {
    display: none;
  }

  .settings-section.collapsible summary::before {
    content: '▸ ';
    font-size: 10px;
    margin-right: 0.25rem;
    color: var(--text-2);
  }

  .settings-section.collapsible[open] summary::before {
    content: '▾ ';
  }

  .section-header {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-2);
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--border);
    margin: 0;
  }

  .section-body {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .field-row {
    display: flex;
    gap: 0.5rem;
  }

  .field-row .field {
    flex: 1;
  }

  .field label {
    font-size: 12px;
    font-weight: 500;
    color: var(--text);
  }

  .field-hint {
    font-size: 11px;
    font-weight: 400;
    color: var(--text-2);
    text-transform: none;
  }

  .field input,
  .field select {
    font-size: 13px;
    padding: 0.45rem 0.6rem;
  }

  .checkbox-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 13px;
    color: var(--text);
    cursor: pointer;
    margin: 0;
  }

  .checkbox-row input {
    width: auto;
    margin: 0;
  }

  .checkbox-row.indented {
    padding-left: 1.5rem;
  }

  .preamble-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }

  .preamble-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .preamble-label {
    font-size: 12px;
    font-weight: 500;
    color: var(--text);
  }

  .preamble-editor {
    font-family: 'Fira Code', monospace;
    font-size: 11px;
    line-height: 1.4;
    min-height: 120px;
    resize: vertical;
  }

  /* ── Selected Questions Section ────────────────────────────────── */
  .selected-questions-section {
    flex-shrink: 0;
    border-top: 1px solid var(--border);
    padding: 1rem 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    max-height: 240px;
    overflow-y: auto;
  }

  .selected-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-2);
  }

  .selected-count {
    font-weight: 500;
    background: color-mix(in srgb, var(--primary) 12%, transparent);
    color: var(--primary);
    border-radius: 8px;
    padding: 2px 6px;
    font-size: 10px;
  }

  .selected-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .sel-item {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    padding: 4px 6px;
    background: var(--bg-2);
    border: 1px solid transparent;
    border-radius: 4px;
    font-size: 11px;
    transition: border-color 0.1s, background 0.1s;
  }

  .sel-item:hover {
    background: var(--bg-3);
  }

  .sel-item.drag-over {
    border-color: var(--primary);
    background: color-mix(in srgb, var(--primary) 8%, var(--bg-2));
  }

  .sel-item.dragging {
    opacity: 0.5;
  }

  .drag-handle {
    cursor: grab;
    opacity: 0.3;
    flex-shrink: 0;
    font-size: 12px;
    user-select: none;
  }

  .sel-num {
    font-weight: 600;
    color: var(--text-2);
    min-width: 14px;
    text-align: right;
    flex-shrink: 0;
    font-size: 11px;
  }

  .sel-info {
    flex: 1;
    min-width: 0;
  }

  .sel-body {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: 'Fira Code', monospace;
    font-size: 10px;
    color: var(--text);
  }

  .sel-space {
    display: flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
  }

  .sel-space input {
    width: 32px;
    padding: 2px 4px;
    font-size: 10px;
    text-align: right;
  }

  .sel-space input.overridden {
    color: var(--primary);
    font-weight: 600;
  }

  .sel-space span {
    font-size: 10px;
    color: var(--text-2);
  }

  .sel-actions {
    display: flex;
    gap: 2px;
    flex-shrink: 0;
  }

  .selected-footer {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }

  /* ── Picker Panel (Middle) ────────────────────────────────────── */
  .picker-panel {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    border-right: 1px solid var(--border);
    background: var(--bg);
    overflow: hidden;
  }

  .picker-header {
    flex-shrink: 0;
    display: flex;
    gap: 0.5rem;
    padding: 1rem;
    border-bottom: 1px solid var(--border);
    align-items: center;
  }

  .picker-search {
    flex: 1;
    font-size: 13px;
  }

  .picker-toggle {
    flex-shrink: 0;
    font-size: 14px;
  }

  .picker-filters {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    padding: 0 1rem 0.75rem;
  }

  .picker-filters select {
    font-size: 12px;
  }

  .picker-toolbar {
    flex-shrink: 0;
    display: flex;
    gap: 0.5rem;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--border);
  }

  .q-count {
    font-size: 12px;
    color: var(--text-2);
    font-weight: 500;
  }

  .picker-actions {
    display: flex;
    gap: 0.35rem;
    align-items: center;
  }

  .random-group {
    display: flex;
    border: 1px solid var(--border);
    border-radius: 4px;
    overflow: hidden;
  }

  .random-group button {
    padding: 4px 6px;
    border-right: 1px solid var(--border);
    font-size: 12px;
    background: var(--bg-2);
    cursor: pointer;
    transition: background 0.1s;
    border: none;
  }

  .random-group button:hover {
    background: var(--bg-3);
  }

  .random-group input {
    border: none;
    background: transparent;
    width: 35px;
    text-align: center;
    font-size: 12px;
    padding: 2px;
  }

  .picker-list {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 0.5rem;
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
    transition: background 0.1s, border-color 0.1s;
  }

  .picker-item:hover {
    background: var(--bg-2);
  }

  .picker-item.checked {
    background: color-mix(in srgb, var(--primary) 10%, var(--bg-2));
    border-color: var(--primary);
  }

  .picker-item input {
    width: auto;
    flex-shrink: 0;
  }

  .picker-info {
    flex: 1;
    min-width: 0;
  }

  .picker-body {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: 'Fira Code', monospace;
    font-size: 11px;
    color: var(--text);
  }

  .picker-pts {
    font-size: 11px;
    color: var(--text-2);
    font-weight: 500;
    flex-shrink: 0;
  }

  .picker-empty {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    color: var(--text-2);
    text-align: center;
    padding: 1rem;
  }

  /* ── Show Picker Button ───────────────────────────────────────── */
  .show-picker-btn {
    flex-shrink: 0;
    width: 40px;
    padding: 0;
    background: transparent;
    border: none;
    color: var(--text-2);
    font-size: 12px;
    writing-mode: vertical-rl;
    text-orientation: mixed;
    border-right: 1px solid var(--border);
    cursor: pointer;
    transition: color 0.1s, background 0.1s;
  }

  .show-picker-btn:hover {
    color: var(--text);
    background: var(--bg-2);
  }

  /* ── Resize Handles ──────────────────────────────────────────── */
  .resize-handle {
    width: 1px;
    flex-shrink: 0;
    background: var(--border);
    cursor: col-resize;
    transition: background 0.15s;
  }

  .resize-handle:hover,
  .resize-handle:active {
    background: var(--primary);
    box-shadow: inset 0 0 0 1px var(--primary);
  }

  /* ── Preview Panel (Right) ────────────────────────────────────– */
  .preview-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--bg);
  }

  /* ── Utility Buttons ──────────────────────────────────────────– */
  button.ghost.small {
    padding: 4px 8px;
    font-size: 12px;
  }

  button.ghost.tiny {
    padding: 2px 4px;
    font-size: 11px;
  }

  button.icon-btn {
    width: 28px;
    height: 28px;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .danger-text {
    color: var(--danger);
  }
</style>
