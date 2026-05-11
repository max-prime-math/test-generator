<script lang="ts">
  import { slide } from 'svelte/transition';
  import { tick } from 'svelte';
  import { bank } from '../lib/bank.svelte';
  import { CLASSES, DEMO_CLASSES, findSection } from '../lib/curriculum';
  import { customClasses } from '../lib/custom-classes.svelte';
  import { defaultTestConfig, type SavedTest, type TestType } from '../lib/types';
  import { generateTypst, generatePreamble, generateAnswerKeyPage } from '../lib/typst/template';
  import { appState } from '../lib/app-state.svelte';
  import { fuzzyScoreMulti } from '../lib/fuzzy';
  import { testLibrary, DRAFT_KEY } from '../lib/test-library.svelte';
  import { saveDialogStore } from '../lib/save-dialog-store.svelte';
  import Preview from './Preview.svelte';

  function initialTestTitle(): string {
    const classes = appState.demoMode ? [...CLASSES, ...DEMO_CLASSES, ...customClasses.classes] : [...CLASSES, ...customClasses.classes];
    return classes.find((c) => c.id === appState.lastClassId)?.name ?? defaultTestConfig().title;
  }

  let config = $state(testLibrary.draft ?? defaultTestConfig(initialTestTitle()));

  // ── Test library state ────────────────────────────────────────────────────
  let activeTestId = $state<string | null>(null);
  let isDirty = $state(false);
  let savedPanelVisible = $state(false);
  let renamingId = $state<string | null>(null);
  let renameValue = $state('');
  let editingToolbarName = $state(false);
  let toolbarNameInput = $state('');
  let toolbarNameInputEl: HTMLInputElement | undefined = $state();

  let allClasses = $derived(appState.demoMode ? [...CLASSES, ...DEMO_CLASSES, ...customClasses.classes] : [...CLASSES, ...customClasses.classes]);

  let expandedTestGroups = $state(new Set<string>());
  function toggleTestGroup(classId: string | null) {
    const key = classId ?? '__null__';
    if (expandedTestGroups.has(key)) {
      expandedTestGroups.delete(key);
    } else {
      expandedTestGroups.add(key);
    }
    expandedTestGroups = new Set(expandedTestGroups);
  }

  // Auto-expand the current class's test group
  $effect(() => {
    const key = (filterClassId || '') ? filterClassId : '__null__';
    if (!expandedTestGroups.has(key)) {
      expandedTestGroups.add(key);
      expandedTestGroups = new Set(expandedTestGroups);
    }
  });

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

  function handleSettingsResize(e: MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = settingsPanelWidth;
    let dragged = false;

    function onMove(ev: MouseEvent) {
      if (!dragged && Math.abs(ev.clientX - startX) > 4) dragged = true;
      if (dragged) {
        const delta = ev.clientX - startX;
        const newWidth = Math.max(240, Math.min(450, startW + delta));
        settingsPanelWidth = newWidth;
        // Auto-hide if dragged far past minimum, but allow dragging back to show
        if (newWidth === 240 && delta < -50) {
          settingsVisible = false;
        } else if (delta >= -50) {
          settingsVisible = true;
        }
      }
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (!dragged) settingsVisible = !settingsVisible;
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function handlePickerResize(e: MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = pickerPanelWidth;
    let dragged = false;

    function onMove(ev: MouseEvent) {
      if (!dragged && Math.abs(ev.clientX - startX) > 4) dragged = true;
      if (dragged) {
        const delta = ev.clientX - startX;
        const newWidth = Math.max(240, Math.min(500, startW - delta));
        pickerPanelWidth = newWidth;
        // Auto-hide if dragged far past minimum, but allow dragging back to show
        if (newWidth === 240 && delta > 50) {
          pickerVisible = false;
        } else if (delta <= 50) {
          pickerVisible = true;
        }
      }
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (!dragged) pickerVisible = !pickerVisible;
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function selectAll() {
    const toAdd = visibleQuestions
      .filter(q => !q.renderError)
      .map((q) => q.id)
      .filter((id) => !config.selectedIds.includes(id));
    config.selectedIds = [...config.selectedIds, ...toAdd];
  }

  function selectRandom(n: number) {
    const pool = visibleQuestions
      .filter(q => !q.renderError)
      .map((q) => q.id)
      .filter((id) => !config.selectedIds.includes(id));
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
  let settingsVisible    = $state(true);
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

  function adjustNumberInput(el: HTMLInputElement, delta: number) {
    const current = parseFloat(el.value) || 0;
    const min = parseFloat(el.min) || 0;
    const max = parseFloat(el.max) || Infinity;
    const step = parseFloat(el.step) || 1;
    const newVal = Math.max(min, Math.min(max, current + delta * step));
    el.value = newVal.toString();
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // Input refs for number controls
  let spaceInput: HTMLInputElement;
  let marginInput: HTMLInputElement;
  let axisWInput: HTMLInputElement;
  let curveWInput: HTMLInputElement;
  let widthInput: HTMLInputElement;
  let heightInput: HTMLInputElement;
  let xStepInput: HTMLInputElement;
  let yStepInput: HTMLInputElement;
  let randomInput: HTMLInputElement;

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

  // ── Auto-save draft ────────────────────────────────────────────────────
  let _draftTimer: ReturnType<typeof setTimeout> | null = null;

  $effect(() => {
    const snapshot = JSON.parse(JSON.stringify(config));
    if (_draftTimer) clearTimeout(_draftTimer);
    _draftTimer = setTimeout(() => {
      testLibrary.saveDraft(snapshot);
      isDirty = activeTestId !== null;
    }, 800);

    return () => {
      if (_draftTimer) clearTimeout(_draftTimer);
    };
  });

  // ── Test library handlers ──────────────────────────────────────────────────
  function markClean() {
    isDirty = false;
  }

  function loadSavedTest(id: string) {
    const cfg = testLibrary.load(id);
    if (!cfg) return;
    config = cfg;
    activeTestId = id;
    isDirty = false;
  }

  function handleSaveAs() {
    saveDialogStore.open(config, allClasses, filterClassId, handleSaveConfirm);
  }

  function handleSaveConfirm(result: {
    name: string;
    classId: string | null;
    unitId: string | null;
    testType: TestType | null;
  }) {
    saveDialogStore.close();
    try {
      const entry = testLibrary.saveAs(result.name, result.classId, result.unitId, result.testType, config);
      activeTestId = entry.id;
      isDirty = false;
      console.log('Saved test:', entry);
    } catch (e) {
      console.error('Save failed:', e);
    }
  }

  function handleSave() {
    if (!activeTestId) {
      handleSaveAs();
      return;
    }
    testLibrary.update(activeTestId, config);
    isDirty = false;
  }

  function handleNewTest() {
    config = defaultTestConfig(initialTestTitle());
    activeTestId = null;
    isDirty = false;
    testLibrary.clearDraft();
  }

  function handleDeleteSaved(id: string) {
    testLibrary.delete(id);
    if (activeTestId === id) {
      activeTestId = null;
      isDirty = false;
    }
  }

  function beginRename(entry: SavedTest) {
    // Open the save dialog to edit the entry
    saveDialogStore.openForEdit(entry, allClasses, (result) => {
      try {
        testLibrary.rename(entry.id, result.name);
        testLibrary.tests = testLibrary.tests.map(t =>
          t.id === entry.id
            ? { ...t, classId: result.classId, unitId: result.unitId, testType: result.testType, updatedAt: Date.now() }
            : t
        );
        // Force update to trigger reactivity
        testLibrary.tests = [...testLibrary.tests];
        localStorage.setItem('tg-test-library-v1', JSON.stringify(testLibrary.tests));
      } catch (e) {
        console.error('Edit failed:', e);
      }
    });
  }

  function commitRename() {
    if (renamingId) testLibrary.rename(renamingId, renameValue);
    renamingId = null;
  }

  function startToolbarRename() {
    if (activeTestId) {
      const entry = testLibrary.get(activeTestId);
      if (entry) {
        toolbarNameInput = entry.name;
        editingToolbarName = true;
        tick().then(() => toolbarNameInputEl?.focus());
      }
    }
  }

  function commitToolbarRename() {
    if (activeTestId && toolbarNameInput.trim()) {
      testLibrary.rename(activeTestId, toolbarNameInput.trim());
    }
    editingToolbarName = false;
    toolbarNameInput = '';
  }
</script>

<div class="build-tab">
  <!-- Toolbar -->
  <div class="test-toolbar">
    <div class="toolbar-left">
      <button class="ghost small" onclick={() => (savedPanelVisible = !savedPanelVisible)}>
        ☰ Saved Tests
      </button>
    </div>
    <div class="toolbar-center">
      {#if activeTestId && editingToolbarName}
        <input
          bind:this={toolbarNameInputEl}
          class="toolbar-name-input"
          type="text"
          bind:value={toolbarNameInput}
          onblur={commitToolbarRename}
          onkeydown={(e) => {
            if (e.key === 'Enter') commitToolbarRename();
            if (e.key === 'Escape') { editingToolbarName = false; toolbarNameInput = ''; }
          }}
        />
      {:else if activeTestId}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <span
          class="test-name"
          role="button"
          tabindex="0"
          ondblclick={startToolbarRename}
          onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') startToolbarRename(); }}
          title="Double-click to rename"
        >
          {testLibrary.get(activeTestId)?.name}
        </span>
        {#if isDirty}<span class="dirty-dot" title="Unsaved changes"></span>{/if}
      {:else}
        <span class="test-name muted">Unsaved test</span>
      {/if}
    </div>
    <div class="toolbar-right">
      {#if activeTestId}
        <button class="ghost small" onclick={handleSave} disabled={!isDirty}>Save</button>
      {/if}
      <button class="ghost small" onclick={handleSaveAs}>Save As…</button>
      <button class="ghost small" onclick={handleNewTest}>New</button>
    </div>
  </div>

  <!-- Saved Tests Panel + Three-Pane Layout -->
  <div class="view-area">
    {#if savedPanelVisible}
      <div class="saved-panel" transition:slide={{ axis: 'x', duration: 200 }}>

        {#if testLibrary.tests.length === 0}
          <div class="saved-empty">No saved tests yet. Use "Save As…" to save the current test.</div>
        {:else}
          {#each [...testLibrary.byClass.entries()] as [classId, entries] (classId ?? '__null__')}
            {@const groupKey = classId ?? '__null__'}
            {@const isExpanded = expandedTestGroups.has(groupKey)}
            {@const className = classId ? (allClasses.find(c => c.id === classId)?.name ?? classId) : 'Uncategorized'}
            <div class="saved-group">
              <div class="saved-group-header">
                <button
                  class="group-toggle"
                  onclick={() => toggleTestGroup(classId)}
                  title={isExpanded ? 'Collapse' : 'Expand'}
                >
                  {isExpanded ? '▾' : '▸'}
                </button>
                <span class="group-name">{className}</span>
                <span class="group-count">{entries.length}</span>
              </div>

              {#if isExpanded}
                {#each entries as entry (entry.id)}
                  <div class="saved-item" class:active={activeTestId === entry.id}>
                    {#if renamingId === entry.id}
                      <input
                        class="rename-input"
                        bind:value={renameValue}
                        onblur={commitRename}
                        onkeydown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') renamingId = null; }}
                      />
                    {:else}
                      <button class="saved-item-name" onclick={() => loadSavedTest(entry.id)}>
                        <span class="item-title">{entry.name}</span>
                        <div class="saved-item-meta">
                          {#if entry.unitId}
                            {@const cls = allClasses.find(c => c.id === entry.classId)}
                            {@const unit = cls?.units.find(u => u.id === entry.unitId)}
                            {#if unit}<span class="saved-item-unit">{unit.name}</span>{/if}
                          {/if}
                          {#if entry.testType}
                            <span class="type-badge type-{entry.testType}">{entry.testType}</span>
                          {/if}
                        </div>
                      </button>
                      <div class="saved-item-actions">
                        <button class="ghost tiny" onclick={() => beginRename(entry)} title="Edit">✎</button>
                        <button class="ghost tiny danger-text" onclick={() => handleDeleteSaved(entry.id)} title="Delete">✕</button>
                      </div>
                    {/if}
                  </div>
                {/each}
              {/if}
            </div>
          {/each}
        {/if}
      </div>
    {/if}

    <div class="view">
      <!-- LEFT PANE: Test Settings (Hideable) -->
  {#if settingsVisible}
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
            <div class="number-input-wrap">
              <input id="t-space" type="number" min="0" max="20" step="0.5" bind:value={config.answerSpace} bind:this={spaceInput} />
              <div class="number-buttons">
                <button class="num-adjust" onclick={() => adjustNumberInput(spaceInput, 1)} title="Increase">+</button>
                <button class="num-adjust" onclick={() => adjustNumberInput(spaceInput, -1)} title="Decrease">−</button>
              </div>
            </div>
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
            <div class="number-input-wrap">
              <input id="t-margin" type="number" min="0.5" max="2" step="0.25" bind:value={config.marginIn} bind:this={marginInput} />
              <div class="number-buttons">
                <button class="num-adjust" onclick={() => adjustNumberInput(marginInput, 1)} title="Increase">+</button>
                <button class="num-adjust" onclick={() => adjustNumberInput(marginInput, -1)} title="Decrease">−</button>
              </div>
            </div>
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
              <div class="number-input-wrap">
                <input id="g-axisw" type="number" min="0.5" max="4" step="0.5" bind:value={config.graphDefaults!.axisWeight} bind:this={axisWInput} />
                <div class="number-buttons">
                  <button class="num-adjust" onclick={() => adjustNumberInput(axisWInput, 1)} title="Increase">+</button>
                  <button class="num-adjust" onclick={() => adjustNumberInput(axisWInput, -1)} title="Decrease">−</button>
                </div>
              </div>
            </div>
            <div class="field">
              <label for="g-curvew">Curve weight <span class="field-hint">(px)</span></label>
              <div class="number-input-wrap">
                <input id="g-curvew" type="number" min="0.5" max="4" step="0.5" bind:value={config.graphDefaults!.curveWeight} bind:this={curveWInput} />
                <div class="number-buttons">
                  <button class="num-adjust" onclick={() => adjustNumberInput(curveWInput, 1)} title="Increase">+</button>
                  <button class="num-adjust" onclick={() => adjustNumberInput(curveWInput, -1)} title="Decrease">−</button>
                </div>
              </div>
            </div>
          </div>
          <div class="field">
            <label for="g-asymc">Asymptote color</label>
            <input id="g-asymc" type="text" placeholder="red" bind:value={config.graphDefaults!.asymptoteColor} />
          </div>
          <div class="field-row">
            <div class="field">
              <label for="g-width">Width <span class="field-hint">(cm)</span></label>
              <div class="number-input-wrap">
                <input id="g-width" type="number" min="2" max="15" step="0.5" bind:value={config.graphDefaults!.defaultWidth} bind:this={widthInput} />
                <div class="number-buttons">
                  <button class="num-adjust" onclick={() => adjustNumberInput(widthInput, 1)} title="Increase">+</button>
                  <button class="num-adjust" onclick={() => adjustNumberInput(widthInput, -1)} title="Decrease">−</button>
                </div>
              </div>
            </div>
            <div class="field">
              <label for="g-height">Height <span class="field-hint">(cm)</span></label>
              <div class="number-input-wrap">
                <input id="g-height" type="number" min="2" max="15" step="0.5" bind:value={config.graphDefaults!.defaultHeight} bind:this={heightInput} />
                <div class="number-buttons">
                  <button class="num-adjust" onclick={() => adjustNumberInput(heightInput, 1)} title="Increase">+</button>
                  <button class="num-adjust" onclick={() => adjustNumberInput(heightInput, -1)} title="Decrease">−</button>
                </div>
              </div>
            </div>
          </div>
          <div class="field-row">
            <div class="field">
              <label for="g-xstep">X tick step</label>
              <div class="number-input-wrap">
                <input id="g-xstep" type="number" min="0.1" step="0.1" bind:value={config.graphDefaults!.xStep} bind:this={xStepInput} />
                <div class="number-buttons">
                  <button class="num-adjust" onclick={() => adjustNumberInput(xStepInput, 1)} title="Increase">+</button>
                  <button class="num-adjust" onclick={() => adjustNumberInput(xStepInput, -1)} title="Decrease">−</button>
                </div>
              </div>
            </div>
            <div class="field">
              <label for="g-ystep">Y tick step</label>
              <div class="number-input-wrap">
                <input id="g-ystep" type="number" min="0.1" step="0.1" bind:value={config.graphDefaults!.yStep} bind:this={yStepInput} />
                <div class="number-buttons">
                  <button class="num-adjust" onclick={() => adjustNumberInput(yStepInput, 1)} title="Increase">+</button>
                  <button class="num-adjust" onclick={() => adjustNumberInput(yStepInput, -1)} title="Decrease">−</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </details>

    </div>
  </div>
  {/if}

  <!-- DIVIDER (Settings) - Click to toggle visibility -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="resize-handle settings-divider" onmousedown={handleSettingsResize}></div>

  <!-- MIDDLE PANE: Preview -->
  <div class="preview-panel">
    <Preview source={typstSource} {testOnlySource} {answerKeySource} {combinedSource} />
  </div>

  <!-- DIVIDER (Picker) - Click to toggle visibility -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="resize-handle picker-divider" onmousedown={handlePickerResize}></div>

  <!-- RIGHT PANE: Question Picker + Selected Questions (Conditionally Visible) -->
  {#if pickerVisible}
    <div class="picker-panel" style="width: {pickerPanelWidth}px">
      <!-- Selected Questions Section -->
      <div class="selected-questions-section">
        <div class="selected-header">
          Selected
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
                  <span class="sel-body">{q.body.slice(0, 40)}{q.body.length > 40 ? '…' : ''}</span>
                </div>
                <div class="sel-space">
                  <div class="sel-space-wrap">
                    <input
                      type="number"
                      min="0"
                      max="20"
                      step="0.5"
                      class:overridden={hasOverride(q.id)}
                      value={getSpace(q.id)}
                      oninput={(e) => {
                        setSpace(q.id, e.currentTarget.value);
                      }}
                      title="Answer space"
                    />
                    <div class="space-buttons">
                      <button
                        class="space-adjust"
                        onclick={() => {
                          const val = parseFloat(getSpace(q.id));
                          setSpace(q.id, Math.min(20, val + 0.5).toString());
                        }}
                        title="Increase"
                      >+</button>
                      <button
                        class="space-adjust"
                        onclick={() => {
                          const val = parseFloat(getSpace(q.id));
                          setSpace(q.id, Math.max(0, val - 0.5).toString());
                        }}
                        title="Decrease"
                      >−</button>
                    </div>
                  </div>
                  <span class="space-unit">cm</span>
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
        <input
          type="search"
          class="picker-search"
          placeholder="Search…"
          bind:value={pickerSearch}
        />
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
            <div class="number-input-wrap">
              <input type="number" min="1" max={visibleQuestions.length || 1} bind:value={randomCount} bind:this={randomInput} title="Count" />
              <div class="number-buttons">
                <button class="num-adjust" onclick={() => adjustNumberInput(randomInput, 1)} title="Increase">+</button>
                <button class="num-adjust" onclick={() => adjustNumberInput(randomInput, -1)} title="Decrease">−</button>
              </div>
            </div>
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
            <label class="picker-item" class:checked class:errored={!!q.renderError}>
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
  {/if}
    </div>
  </div>
</div>

<style>
  /* ── Build Tab Wrapper ───────────────────────────────────────────── */
  .build-tab {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  /* ── Toolbar ────────────────────────────────────────────────────── */
  .test-toolbar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0 0.75rem;
    height: 38px;
    flex-shrink: 0;
    border-bottom: 1px solid var(--border);
    background: var(--bg-2);
  }

  .toolbar-left  { display: flex; gap: 0.35rem; align-items: center; }
  .toolbar-center { flex: 1; display: flex; align-items: center; justify-content: center; gap: 0.4rem; overflow: hidden; }
  .toolbar-right { display: flex; gap: 0.35rem; align-items: center; }

  .test-name {
    font-size: 13px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 300px;
    cursor: pointer;
    padding: 2px 4px;
    border-radius: 2px;
    transition: background 0.15s;
  }

  .test-name:hover {
    background: var(--bg-3);
  }

  .test-name.muted { color: var(--text-2); font-weight: 400; }

  .dirty-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--primary);
    flex-shrink: 0;
  }

  .toolbar-name-input {
    max-width: 300px;
    padding: 4px 8px;
    border: 1px solid var(--primary);
    border-radius: 3px;
    background: var(--bg-input);
    color: var(--text);
    font-size: 13px;
    font-weight: 500;
    font-family: inherit;
  }

  .toolbar-name-input:focus {
    outline: none;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
  }

  /* ── View Area ──────────────────────────────────────────────────── */
  .view-area {
    flex: 1;
    display: flex;
    overflow: hidden;
    height: 100%;
    width: 100%;
  }

  /* ── Saved Tests Panel ──────────────────────────────────────────– */
  .saved-panel {
    width: 220px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    background: var(--bg);
    border-right: 1px solid var(--border);
    overflow-y: auto;
  }

  .saved-group { padding: 0; }

  .saved-group-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0.75rem;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-2);
    background: var(--bg-2);
    border-bottom: 1px solid var(--border);
  }

  .group-toggle {
    width: 18px;
    height: 18px;
    padding: 0;
    background: transparent;
    border: none;
    color: var(--text-2);
    cursor: pointer;
    font-size: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .group-name {
    flex: 1;
  }

  .group-count {
    padding: 2px 6px;
    background: var(--bg-3);
    border-radius: 3px;
    font-size: 10px;
    color: var(--text-2);
    flex-shrink: 0;
  }

  .saved-item {
    display: flex;
    align-items: stretch;
    padding: 0;
    gap: 0;
    border-radius: 0;
    transition: background 0.1s;
    border-bottom: 1px solid var(--bg-2);
  }

  .saved-item:hover, .saved-item.active { background: var(--bg-3); }
  .saved-item.active .saved-item-name { color: var(--primary); font-weight: 500; }

  .saved-item-name {
    flex: 1;
    background: transparent;
    border: none;
    padding: 0.5rem 0.75rem;
    font-size: 13px;
    color: var(--text);
    text-align: left;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    min-width: 0;
  }

  .item-title {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: 500;
  }

  .saved-item-meta {
    display: flex;
    flex-direction: row;
    gap: 0.5rem;
    font-size: 11px;
    overflow: hidden;
    align-items: center;
  }

  .saved-item-unit {
    color: var(--text-2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex-shrink: 0;
  }

  .type-badge {
    display: inline-flex;
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .type-quiz { background: rgba(99, 102, 241, 0.15); color: rgb(99, 102, 241); }
  .type-test { background: rgba(59, 130, 246, 0.15); color: rgb(59, 130, 246); }
  .type-exam { background: rgba(239, 68, 68, 0.15); color: rgb(239, 68, 68); }
  .type-assignment { background: rgba(34, 197, 94, 0.15); color: rgb(34, 197, 94); }
  .type-other { background: rgba(107, 114, 128, 0.15); color: rgb(107, 114, 128); }

  .saved-item-actions {
    display: flex;
    gap: 2px;
    padding: 0.5rem 0.5rem;
    opacity: 0;
    transition: opacity 0.1s;
    flex-shrink: 0;
    align-items: center;
  }

  .saved-item:hover .saved-item-actions { opacity: 1; }

  .rename-input {
    flex: 1;
    font-size: 13px;
    padding: 3px 6px;
  }

  .saved-empty {
    padding: 1.5rem 1rem;
    font-size: 12px;
    color: var(--text-2);
    text-align: center;
    line-height: 1.5;
  }

  .view {
    display: flex;
    flex: 1;
    height: 100%;
    overflow: hidden;
    background: var(--bg);
  }

  /* ── Settings Panel (Left) ────────────────────────────────────── */
  .settings-panel {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
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

  .settings-section.collapsible summary {
    list-style: none;
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
    height: 32px;
    box-sizing: border-box;
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

  .checkbox-row input[type="checkbox"] {
    width: 16px;
    height: 16px;
    min-width: 16px;
    min-height: 16px;
    margin: 0;
    padding: 0;
    cursor: pointer;
    appearance: none;
    -webkit-appearance: none;
    -moz-appearance: none;
    border: 1.5px solid var(--border);
    border-radius: 3px;
    background: var(--bg);
    flex-shrink: 0;
    box-sizing: border-box;
    transition: all 150ms;
  }

  .checkbox-row input[type="checkbox"]:hover {
    border-color: var(--primary);
    background: color-mix(in srgb, var(--primary) 8%, var(--bg));
  }

  .checkbox-row input[type="checkbox"]:checked {
    border-color: var(--primary);
    background: var(--primary);
    background-image: url('data:image/svg+xml;utf8,<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 8l3 3 7-7" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>');
    background-repeat: no-repeat;
    background-position: center;
    background-size: 12px;
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
    border-bottom: 1px solid var(--border);
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    max-height: 180px;
    overflow-y: auto;
  }

  .picker-panel .selected-questions-section {
    padding: 0.75rem 1rem;
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
    color: var(--text-2);
    min-width: 14px;
    text-align: right;
    flex-shrink: 0;
    font-size: 10px;
    font-family: 'Fira Code', monospace;
    line-height: 1;
    display: flex;
    align-items: center;
    margin-left: 4px;
  }

  .sel-info {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
  }

  .sel-body {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: 'Fira Code', monospace;
    font-size: 10px;
    color: var(--text);
    min-width: 0;
  }

  .sel-space {
    display: flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
  }

  .sel-space-wrap {
    display: flex;
    align-items: stretch;
    gap: 0;
    flex-shrink: 0;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg-2);
    height: 22px;
  }

  .sel-space-wrap input {
    width: 29px;
    padding: 2px 3px;
    font-size: 10px;
    text-align: right;
    border: none;
    background: transparent;
    color: var(--text);
    outline: none;
  }

  .sel-space-wrap input::-webkit-outer-spin-button,
  .sel-space-wrap input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  .sel-space-wrap input[type=number] {
    -moz-appearance: textfield;
  }

  .sel-space-wrap input.overridden {
    color: var(--primary);
    font-weight: 600;
  }

  .space-unit {
    font-size: 10px;
    color: var(--text-2);
    white-space: nowrap;
  }

  .space-buttons {
    display: flex;
    flex-direction: column;
    gap: 0;
    margin-left: auto;
    border-left: 1px solid var(--border);
    padding-left: 0;
  }

  .space-adjust {
    width: 16px;
    height: 11px;
    padding: 0;
    font-size: 8px;
    font-weight: 600;
    background: transparent;
    color: var(--text-2);
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: color 150ms;
  }

  .space-adjust:last-of-type {
    margin-top: -3px;
  }

  .space-adjust:hover {
    color: var(--text);
  }

  .space-adjust:active {
    color: white;
    background: var(--primary);
  }

  .number-input-wrap {
    display: flex;
    align-items: stretch;
    gap: 0;
    flex-shrink: 0;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg-2);
    height: 32px;
    width: 100%;
  }

  .number-input-wrap input {
    flex: 1;
    padding: 0.45rem 0.6rem;
    font-size: 13px;
    text-align: left;
    border: none;
    background: transparent;
    color: var(--text);
    outline: none;
  }

  .number-input-wrap input::-webkit-outer-spin-button,
  .number-input-wrap input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  .number-input-wrap input[type=number] {
    -moz-appearance: textfield;
  }

  .number-buttons {
    display: flex;
    flex-direction: column;
    gap: 0;
    border-left: 1px solid var(--border);
  }

  .num-adjust {
    width: 16px;
    height: 15px;
    padding: 0;
    font-size: 9px;
    font-weight: 600;
    background: transparent;
    color: var(--text-2);
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: color 150ms;
  }

  .num-adjust:last-of-type {
    margin-top: -2px;
  }

  .num-adjust:hover {
    color: var(--text);
  }

  .num-adjust:active {
    color: white;
    background: var(--primary);
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
    padding: 0.75rem 1rem 0.75rem;
    border-top: 1px solid var(--border);
    margin-top: 0.5rem;
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
    align-items: stretch;
    gap: 0;
    flex-shrink: 0;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg-2);
    height: 32px;
    overflow: hidden;
  }

  .random-group button {
    padding: 0 8px;
    font-size: 13px;
    background: transparent;
    color: var(--text);
    cursor: pointer;
    border: none;
    border-right: 1px solid var(--border);
    border-radius: 0;
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  .random-group button:hover {
    background: var(--bg-3);
  }

  .random-group button:active {
    background: var(--bg-3);
  }

  .random-group .number-input-wrap {
    flex: 0;
    border: none;
    border-radius: 0;
    background: transparent;
    height: 32px;
    width: auto;
    display: flex;
    align-items: stretch;
    gap: 0;
  }

  .random-group .number-input-wrap input {
    border: none;
    background: transparent;
    text-align: left;
    font-size: 13px;
    padding: 0.45rem 0.6rem;
    height: 32px;
    color: var(--text);
    outline: none;
    width: auto;
    min-width: 40px;
  }

  .random-group .number-input-wrap input::-webkit-outer-spin-button,
  .random-group .number-input-wrap input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  .random-group .number-input-wrap input[type=number] {
    -moz-appearance: textfield;
  }

  .random-group .number-buttons {
    border-left: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .random-group .num-adjust {
    height: 15px;
    width: 16px;
    padding: 0;
    font-size: 9px;
    background: transparent;
    color: var(--text-2);
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: color 150ms;
  }

  .random-group .num-adjust:hover {
    color: var(--text);
  }

  .random-group .num-adjust:active {
    color: white;
    background: var(--primary);
  }

  .random-group .num-adjust:last-of-type {
    margin-top: -2px;
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

  .picker-item.errored {
    background: color-mix(in srgb, #ef4444 12%, var(--bg));
    border-left: 2px solid #ef4444;
  }

  .picker-item.errored:hover {
    background: color-mix(in srgb, #ef4444 20%, var(--bg));
  }

  .picker-item input[type="checkbox"] {
    width: 16px;
    height: 16px;
    min-width: 16px;
    min-height: 16px;
    margin: 0;
    padding: 0;
    cursor: pointer;
    appearance: none;
    -webkit-appearance: none;
    -moz-appearance: none;
    border: 1.5px solid var(--border);
    border-radius: 3px;
    background: var(--bg);
    flex-shrink: 0;
    box-sizing: border-box;
    transition: all 150ms;
  }

  .picker-item input[type="checkbox"]:hover {
    border-color: var(--primary);
    background: color-mix(in srgb, var(--primary) 8%, var(--bg));
  }

  .picker-item input[type="checkbox"]:checked {
    border-color: var(--primary);
    background: var(--primary);
    background-image: url('data:image/svg+xml;utf8,<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 8l3 3 7-7" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>');
    background-repeat: no-repeat;
    background-position: center;
    background-size: 12px;
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
    width: 10px;
    flex-shrink: 0;
    background: var(--bg-2);
    border-left: 1px solid var(--border);
    border-right: 1px solid var(--border);
    cursor: col-resize;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s;
  }

  .resize-handle:hover {
    background: var(--bg-3);
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
