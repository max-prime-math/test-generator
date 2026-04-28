<script lang="ts">
  import { slide } from 'svelte/transition';
  import { bank } from '../lib/bank.svelte';
  import { CLASSES, findSection } from '../lib/curriculum';
  import { customClasses } from '../lib/custom-classes.svelte';
  import { defaultTestConfig } from '../lib/types';
  import { generateTypst, generatePreamble, generateAnswerKeyPage } from '../lib/typst/template';
  import { appState } from '../lib/app-state.svelte';
  import Preview from './Preview.svelte';

  let config = $state(defaultTestConfig());

  // ── Picker filters ────────────────────────────────────────────────────
  let filterClassId    = $state(appState.lastClassId || (CLASSES[0]?.id ?? ''));
  let filterUnitId     = $state('');
  let filterSectionId  = $state('');
  let filterType       = $state<'' | 'mcq' | 'frq'>();

  function isMCQ(q: { choices?: Record<string, string>; answer?: string; solution?: string }): boolean {
    return (q.choices != null && Object.keys(q.choices).length >= 2) ||
      /^[A-Ea-e]$/.test(q.answer ?? '') ||
      /^[A-Ea-e]$/.test(q.solution ?? '');  // backward compat: old data stored letter in solution
  }

  let allClasses     = $derived([...CLASSES, ...customClasses.classes]);
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

  function startPanelResize(e: MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = panelWidth;
    function onMove(ev: MouseEvent) {
      panelWidth = Math.max(240, Math.min(600, startW + (ev.clientX - startX)));
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

  let settingsOpen = $state(false);
  let advancedOpen = $state(false);
  let identityOpen = $state(true);
  let outputOpen   = $state(true);
  let keyOpen      = $state(false);
  let fmtOpen      = $state(false);
  let panelWidth   = $state(320);
  let dragFromIdx  = $state<number | null>(null);
  let dragOverIdx  = $state<number | null>(null);

  let settingsPills = $derived([
    `${config.fontSize}pt`,
    config.paper === 'us-letter' ? 'US Letter' : 'A4',
    `${config.answerSpace}cm space`,
    config.showAnswerKey ? '✓ Key' : '',
    config.mcqFirst ? 'MCQ first' : '',
  ].filter(Boolean));

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
  <div class="panel config-panel" style="width: {panelWidth}px">

    <!-- ── Settings section (collapsible) ────────────────────────── -->
    <div class="settings-section">
      <button class="settings-trigger" onclick={() => settingsOpen = !settingsOpen}>
        <span>Test Settings</span>
        {#if !settingsOpen && settingsPills.length > 0}
          <div class="settings-pills">
            {#each settingsPills as pill}
              <span class="pill">{pill}</span>
            {/each}
          </div>
        {/if}
        <span class="chevron">{settingsOpen ? '▾' : '▸'}</span>
      </button>

      {#if settingsOpen}
        <div class="settings-body" transition:slide={{ duration: 220 }}>

          <!-- ═══ IDENTITY ═══ -->
          <button class="subsection-trigger" onclick={() => identityOpen = !identityOpen}>
            <span class="subsec-label">Identity</span>
            {#if !identityOpen}
              <span class="subsec-pills">{config.subtitle || '—'}</span>
            {/if}
            <span class="chevron">{identityOpen ? '▾' : '▸'}</span>
          </button>
          {#if identityOpen}
            <div class="subsec-body" transition:slide={{ duration: 180 }}>
              <div class="fields">
                <div class="field">
                  <label for="t-title">Class</label>
                  <select id="t-title" bind:value={filterClassId}>
                    {#each allClasses as cls}
                      <option value={cls.id}>{cls.name}</option>
                    {/each}
                  </select>
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
            </div>
          {/if}

          <!-- ═══ OUTPUT ═══ -->
          <button class="subsection-trigger" onclick={() => outputOpen = !outputOpen}>
            <span class="subsec-label">Output</span>
            {#if !outputOpen}
              <span class="subsec-pills">
                {#if config.mcqFirst}
                  <span class="pill-mini">MCQ first</span>
                {/if}
                {#if config.showPoints}
                  <span class="pill-mini">Points</span>
                {/if}
              </span>
            {/if}
            <span class="chevron">{outputOpen ? '▾' : '▸'}</span>
          </button>
          {#if outputOpen}
            <div class="subsec-body" transition:slide={{ duration: 180 }}>
              <div class="fields">
                <div class="field">
                  <label for="t-space">Answer space (cm)</label>
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
                  <label class="checkbox-row" style="padding-left: 1.25rem">
                    <input type="checkbox" bind:checked={config.pointsBold} />
                    Bold point values
                  </label>
                {/if}
              </div>
            </div>
          {/if}

          <!-- ═══ ANSWER KEY ═══ -->
          <button class="subsection-trigger" onclick={() => keyOpen = !keyOpen}>
            <span class="subsec-label">Answer Key</span>
            {#if !keyOpen && config.showAnswerKey}
              <span class="subsec-pills"><span class="pill-mini">✓ Enabled</span></span>
            {/if}
            <span class="chevron">{keyOpen ? '▾' : '▸'}</span>
          </button>
          {#if keyOpen}
            <div class="subsec-body" transition:slide={{ duration: 180 }}>
              <div class="fields">
                <label class="checkbox-row">
                  <input type="checkbox" bind:checked={config.showAnswerKey} />
                  Include answer key
                </label>
                {#if config.showAnswerKey}
                  <label class="checkbox-row" style="padding-left: 1.25rem">
                    <input type="checkbox" bind:checked={config.mcqFullSolutions} />
                    Include full MCQ solutions in solutions section
                  </label>
                {/if}
              </div>
            </div>
          {/if}

          <!-- ═══ FORMATTING ═══ -->
          <button class="subsection-trigger" onclick={() => fmtOpen = !fmtOpen}>
            <span class="subsec-label">Formatting</span>
            {#if !fmtOpen}
              <span class="subsec-pills">
                <span class="pill-mini">{config.fontSize}pt</span>
                <span class="pill-mini">{config.paper === 'us-letter' ? 'Letter' : 'A4'}</span>
              </span>
            {/if}
            <span class="chevron">{fmtOpen ? '▾' : '▸'}</span>
          </button>
          {#if fmtOpen}
            <div class="subsec-body" transition:slide={{ duration: 180 }}>
              <div class="fields">
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
              </div>
            </div>
          {/if}

          <!-- ═══ GRAPH DEFAULTS ═══ -->
          <button class="subsection-trigger" onclick={() => advancedOpen = !advancedOpen}>
            <span class="subsec-label">Graph Defaults</span>
            {#if !advancedOpen && config.graphDefaults?.showGrid}
              <span class="subsec-pills"><span class="pill-mini">Grid</span></span>
            {/if}
            <span class="chevron">{advancedOpen ? '▾' : '▸'}</span>
          </button>
          {#if advancedOpen}
            <div class="subsec-body" transition:slide={{ duration: 180 }}>
              <div class="fields">
                <label class="checkbox-row">
                  <input type="checkbox" bind:checked={config.graphDefaults!.showGrid} />
                  Show grid
                </label>
                <div class="field">
                  <label for="g-gridcolor">Grid color</label>
                  <input id="g-gridcolor" type="text" placeholder="silver" bind:value={config.graphDefaults!.gridColor} />
                </div>
                <div class="field">
                  <label for="g-axisw">Axis weight (px)</label>
                  <input id="g-axisw" type="number" min="0.5" max="4" step="0.5" bind:value={config.graphDefaults!.axisWeight} />
                </div>
                <div class="field">
                  <label for="g-curvew">Curve weight (px)</label>
                  <input id="g-curvew" type="number" min="0.5" max="4" step="0.5" bind:value={config.graphDefaults!.curveWeight} />
                </div>
                <div class="field">
                  <label for="g-asymc">Asymptote color</label>
                  <input id="g-asymc" type="text" placeholder="red" bind:value={config.graphDefaults!.asymptoteColor} />
                </div>
                <div class="row">
                  <div class="field" style="flex:1">
                    <label for="g-width">Width (cm)</label>
                    <input id="g-width" type="number" min="2" max="15" step="0.5" bind:value={config.graphDefaults!.defaultWidth} />
                  </div>
                  <div class="field" style="flex:1">
                    <label for="g-height">Height (cm)</label>
                    <input id="g-height" type="number" min="2" max="15" step="0.5" bind:value={config.graphDefaults!.defaultHeight} />
                  </div>
                </div>
                <div class="row">
                  <div class="field" style="flex:1">
                    <label for="g-xstep">X tick step</label>
                    <input id="g-xstep" type="number" min="0.1" step="0.1" bind:value={config.graphDefaults!.xStep} />
                  </div>
                  <div class="field" style="flex:1">
                    <label for="g-ystep">Y tick step</label>
                    <input id="g-ystep" type="number" min="0.1" step="0.1" bind:value={config.graphDefaults!.yStep} />
                  </div>
                </div>
              </div>
            </div>
          {/if}

        </div>
      {/if}
    </div>

    <!-- ── Questions section (always visible) ─────────────────────── -->
    <div class="questions-section">
      <div class="questions-header">
        Questions
        {#if config.selectedIds.length > 0}
          <span class="count">{config.selectedIds.length} selected</span>
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
                    {#if getChoices(q)}
                      <button
                        class="ghost"
                        class:shuffled={!!config.choiceOverrides[q.id]}
                        onclick={() => shuffleChoices(q)}
                        title="Shuffle choices"
                      >Shuffle</button>
                      {#if config.choiceOverrides[q.id]}
                        <button class="ghost" onclick={() => resetChoiceOrder(q.id)} title="Reset choice order">Reset</button>
                      {/if}
                    {/if}
                    <button class="ghost" onclick={() => toggleQuestion(q.id)} title="Remove">✕</button>
                  </div>
                </div>
              {/each}
            </div>
            <div class="sel-footer">
              <button class="ghost" onclick={clearSelection} style="font-size:12px;">Clear all</button>
              {#if selectedQuestions.some(q => !!getChoices(q))}
                <button class="ghost" onclick={shuffleAllMCQ} style="font-size:12px;">Shuffle all MCQ</button>
              {/if}
            </div>
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
            <span class="q-count">{visibleQuestions.length} question{visibleQuestions.length !== 1 ? 's' : ''}</span>
            <div class="toolbar-right">
              <button class="ghost" onclick={selectAll} disabled={visibleQuestions.length === 0}>
                Select all
              </button>
              <div class="random-group">
                <button onclick={() => selectRandom(randomCount)} disabled={visibleQuestions.length === 0}>
                  + Random
                </button>
                <input type="number" min="1" max={visibleQuestions.length || 1} bind:value={randomCount} />
              </div>
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

    </div>

  </div>

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="resize-handle" onmousedown={startPanelResize}></div>

  <!-- Right panel: live preview -->
  <div class="panel preview-panel">
    <Preview source={typstSource} {testOnlySource} {answerKeySource} {combinedSource} />
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
    flex-shrink: 0;
    padding: 1rem;
    gap: 0;
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    overflow-y: auto;
  }

  .resize-handle {
    width: 5px;
    flex-shrink: 0;
    cursor: col-resize;
    background: transparent;
    transition: background 0.15s;
    z-index: 1;
  }

  .resize-handle:hover,
  .resize-handle:active {
    background: var(--primary);
    opacity: 0.4;
  }

  /* ── Settings section ──────────────────────────────────────────── */
  .settings-section {
    flex-shrink: 0;
  }

  .settings-trigger {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    background: none;
    border: none;
    border-bottom: 1px solid var(--border);
    padding: 0.6rem 0;
    margin-bottom: 0.75rem;
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-2);
    text-align: left;
    gap: 0.5rem;
  }

  .settings-trigger:hover { color: var(--text); }

  .settings-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    align-items: center;
  }

  .pill {
    background: color-mix(in srgb, var(--primary) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--primary) 25%, transparent);
    border-radius: 12px;
    padding: 2px 8px;
    font-size: 11px;
    color: var(--primary);
    font-weight: 500;
    white-space: nowrap;
  }

  .chevron { font-size: 10px; flex-shrink: 0; }

  .settings-body {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.75rem 0 1rem;
  }

  /* ── Subsection triggers ───────────────────────────────────────── */
  .subsection-trigger {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    background: none;
    border: none;
    border-bottom: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
    padding: 0.5rem 0;
    cursor: pointer;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-2);
    text-align: left;
    transition: color 0.15s;
  }

  .subsection-trigger:hover { color: var(--text); }

  .subsec-label { flex: 1; }

  .subsec-pills {
    display: flex;
    gap: 0.35rem;
    align-items: center;
    flex-wrap: wrap;
  }

  .pill-mini {
    background: color-mix(in srgb, var(--text-2) 8%, transparent);
    color: var(--text-2);
    border-radius: 10px;
    padding: 1px 6px;
    font-size: 10px;
    font-weight: 500;
    white-space: nowrap;
  }

  .subsec-body {
    padding: 0.5rem 0.5rem 0.75rem;
    border-left: 2px solid color-mix(in srgb, var(--primary) 20%, transparent);
    margin-left: 0;
  }

  /* ── Questions section ─────────────────────────────────────────– */
  .questions-section {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .questions-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 0.6rem 0;
    border-bottom: 1px solid var(--border);
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-2);
    gap: 0.5rem;
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
  }

  .sel-item {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 4px 6px;
    background: var(--bg-2);
    border: 1px solid transparent;
    border-radius: 4px;
    font-size: 13px;
    transition: border-color 0.1s, background 0.1s;
  }

  .drag-handle {
    cursor: grab;
    opacity: 0.3;
    font-size: 14px;
    flex-shrink: 0;
    transition: opacity 0.15s;
    user-select: none;
  }

  .sel-item:hover .drag-handle {
    opacity: 0.7;
  }

  .sel-item.drag-over {
    border-color: var(--primary);
    background: color-mix(in srgb, var(--primary) 8%, var(--bg-2));
  }

  .sel-item.dragging {
    opacity: 0.4;
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
    font-size: 12px;
  }

  .sel-loc {
    font-size: 11px;
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
    font-size: 12px;
    color: var(--text-2);
  }

  .sel-space input {
    width: 38px;
    padding: 1px 4px;
    font-size: 12px;
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
    font-size: 12px;
  }

  .sel-actions button.shuffled {
    color: var(--primary);
  }

  .sel-footer {
    display: flex;
    gap: 0.5rem;
    margin-top: 4px;
  }

  /* ── Curriculum filter ─────────────────────────────────────────── */
  .filter-group {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .filter-group select {
    font-size: 13px;
    width: 100%;
  }

  /* ── Question picker ───────────────────────────────────────────── */
  .picker-toolbar {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    justify-content: space-between;
  }

  .q-count {
    font-size: 13px;
    color: var(--text-2);
    font-weight: 500;
  }

  .toolbar-right {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .toolbar-right > button.ghost {
    font-size: 13px;
    padding: 4px 12px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: none;
    color: var(--text);
    cursor: pointer;
    transition: background 0.1s;
  }

  .toolbar-right > button.ghost:hover {
    background: var(--bg-2);
  }

  .toolbar-right > button.ghost:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .random-group {
    display: flex;
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
  }

  .random-group button {
    flex: 1;
    border-right: 1px solid var(--border);
    padding: 4px 8px;
    font-size: 13px;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text);
    transition: background 0.1s;
  }

  .random-group button:hover {
    background: var(--bg-2);
  }

  .random-group button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .random-group input {
    border: none;
    background: transparent;
    width: 50px;
    text-align: center;
    font-size: 13px;
    padding: 4px 6px;
  }

  .random-group input:focus {
    outline: none;
  }

  .picker-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .picker-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 6px 8px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
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
    font-size: 12px;
  }

  .picker-loc {
    font-size: 11px;
    color: var(--text-2);
    font-style: italic;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .picker-pts {
    font-size: 12px;
    color: var(--text-2);
    flex-shrink: 0;
  }

  .muted {
    font-size: 13px;
    color: var(--text-2);
  }
</style>
