<script lang="ts">
  import { CLASSES } from '../lib/curriculum';
  import { customClasses } from '../lib/custom-classes.svelte';
  import type { BnkBank, BnkQuestion } from '../lib/bnk-parser';
  import { evaluateQuestion } from '../lib/bnk-evaluator';

  interface Props {
    bnk: BnkBank;
    oncancel: () => void;
    onimport: (questions: BnkQuestion[], classId: string, unitId: string, sectionMap: Map<string, string>) => void;
  }

  let { bnk, oncancel, onimport }: Props = $props();

  let allClasses = $derived([...CLASSES, ...customClasses.classes]);

  // ── Class ────────────────────────────────────────────────────────────────────
  let classMode       = $state<'new' | 'existing'>('new');
  let newClassName    = $state(bnk.subject);
  let existingClassId = $state(allClasses[0]?.id ?? '');

  let activeClassId = $derived(
    classMode === 'existing' ? existingClassId : ''
  );
  let existingUnits = $derived(
    classMode === 'existing'
      ? (allClasses.find(c => c.id === existingClassId)?.units ?? [])
      : []
  );

  // ── Unit ─────────────────────────────────────────────────────────────────────
  let unitMode       = $state<'new' | 'existing'>('new');
  let newUnitName    = $state(bnk.title);
  let existingUnitId = $state('');

  // Reset unit mode/selection when class changes
  $effect(() => {
    existingClassId; // track
    existingUnitId = existingUnits[0]?.id ?? '';
    unitMode = existingUnits.length > 0 ? unitMode : 'new';
  });

  // ── Section name overrides ───────────────────────────────────────────────────
  let sectionNames = $state<Map<string, string>>(
    new Map(bnk.sections.map(s => [s.id, `${s.id}: ${s.name}`]))
  );
  let sectionInclude = $state<Map<string, boolean>>(
    new Map(bnk.sections.map(s => [s.id, true]))
  );

  function setSectionName(id: string, name: string) {
    const m = new Map(sectionNames); m.set(id, name); sectionNames = m;
  }
  function toggleSection(id: string, v: boolean) {
    const m = new Map(sectionInclude); m.set(id, v); sectionInclude = m;
  }

  let includedSections = $derived(bnk.sections.filter(s => sectionInclude.get(s.id)));
  let algorithmicCount = $derived(bnk.questions.filter(q => q.variables.length > 0).length);
  let variants = $state(1);
  let totalQ = $derived(
    bnk.questions.filter(q => sectionInclude.get(q.section)).reduce((sum, q) => {
      return sum + (q.variables.length > 0 ? variants : 1);
    }, 0)
  );

  let canImport = $derived(
    totalQ > 0 &&
    (classMode === 'new' ? !!newClassName.trim() : !!existingClassId) &&
    (unitMode  === 'new' ? !!newUnitName.trim()  : !!existingUnitId)
  );

  function qCount(sectionId: string) {
    return bnk.questions.filter(q => q.section === sectionId).length;
  }

  // ── Import ───────────────────────────────────────────────────────────────────
  function doImport() {
    // Resolve class
    let classId: string;
    if (classMode === 'new') {
      classId = customClasses.add(newClassName.trim()).id;
    } else {
      classId = existingClassId;
    }

    // Resolve unit
    let unitId: string;
    if (unitMode === 'new') {
      unitId = customClasses.addUnit(classId, newUnitName.trim()).id;
    } else {
      unitId = existingUnitId;
    }

    // Create sections within the unit
    const sectionMap = new Map<string, string>(); // bnk section id → custom section id
    for (const sec of includedSections) {
      const name = sectionNames.get(sec.id) ?? sec.id;
      const created = customClasses.addSection(classId, unitId, name);
      sectionMap.set(sec.id, created.id);
    }

    const expandedQuestions: BnkQuestion[] = [];
    for (const q of bnk.questions.filter(q => sectionInclude.get(q.section))) {
      const n = q.variables.length > 0 ? variants : 1;
      for (let i = 0; i < n; i++) {
        expandedQuestions.push(q.variables.length > 0 ? evaluateQuestion(q) : q);
      }
    }

    onimport(expandedQuestions, classId, unitId, sectionMap);
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') oncancel();
  }
</script>

<svelte:window on:keydown={onkeydown} />

<!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
<div class="overlay" onclick={oncancel}>
  <div class="modal" onclick={(e) => e.stopPropagation()}>

    <header>
      <div class="header-text">
        <h2>Import ExamView Bank</h2>
        <p class="subtitle">"{bnk.title}" — {bnk.questions.length} questions across {bnk.sections.length} section{bnk.sections.length !== 1 ? 's' : ''}</p>
      </div>
      <button class="ghost icon-btn" onclick={oncancel}>✕</button>
    </header>

    <div class="body">

      <!-- Class -->
      <div class="form-block">
        <div class="form-label">Class</div>
        <div class="mode-row">
          <label class="radio-label">
            <input type="radio" bind:group={classMode} value="new" />
            Create new
          </label>
          <label class="radio-label">
            <input type="radio" bind:group={classMode} value="existing" />
            Use existing
          </label>
        </div>
        {#if classMode === 'new'}
          <input type="text" bind:value={newClassName} placeholder="Class name…" />
        {:else}
          <select bind:value={existingClassId}>
            {#each allClasses as cls}
              <option value={cls.id}>{cls.name}</option>
            {/each}
          </select>
        {/if}
      </div>

      <!-- Unit -->
      <div class="form-block">
        <div class="form-label">Unit</div>
        <div class="mode-row">
          <label class="radio-label">
            <input type="radio" bind:group={unitMode} value="new" />
            Create new
          </label>
          <label class="radio-label" class:disabled={existingUnits.length === 0}>
            <input type="radio" bind:group={unitMode} value="existing" disabled={existingUnits.length === 0} />
            Use existing
          </label>
        </div>
        {#if unitMode === 'new'}
          <input type="text" bind:value={newUnitName} placeholder="Unit name…" />
        {:else}
          <select bind:value={existingUnitId}>
            {#each existingUnits as u}
              <option value={u.id}>{u.name}</option>
            {/each}
          </select>
        {/if}
      </div>

      <!-- Sections -->
      <div class="form-block">
        <div class="form-label">Sections <span class="muted">(each becomes a section within the unit)</span></div>
        <div class="section-list">
          {#each bnk.sections as sec}
            {@const name = sectionNames.get(sec.id) ?? ''}
            {@const included = sectionInclude.get(sec.id) ?? true}
            <div class="sec-row" class:excluded={!included}>
              <input
                type="checkbox"
                checked={included}
                onchange={(e) => toggleSection(sec.id, (e.currentTarget as HTMLInputElement).checked)}
              />
              <span class="sec-id">{sec.id}</span>
              <input
                class="sec-name"
                type="text"
                value={name}
                disabled={!included}
                oninput={(e) => setSectionName(sec.id, (e.currentTarget as HTMLInputElement).value)}
              />
              <span class="sec-count">{qCount(sec.id)}q</span>
            </div>
          {/each}
        </div>
      </div>

      {#if algorithmicCount > 0}
        <div class="form-block">
          <div class="form-label">Algorithmic Variants</div>
          <div class="variants-row">
            <input type="number" bind:value={variants} min="1" max="20" class="variants-input" />
            <span class="muted-text">variant{variants !== 1 ? 's' : ''} per question · {algorithmicCount} of {bnk.questions.length} questions are algorithmic</span>
          </div>
        </div>
      {/if}

    </div>

    <footer>
      <span class="total-label">{totalQ} question{totalQ !== 1 ? 's' : ''} will be imported</span>
      <button class="ghost" onclick={oncancel}>Cancel</button>
      <button class="primary" onclick={doImport} disabled={!canImport}>
        Import {totalQ} Question{totalQ !== 1 ? 's' : ''}
      </button>
    </footer>

  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 200;
  }

  .modal {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: 0 8px 40px rgba(0,0,0,0.25);
    width: 520px;
    max-width: calc(100vw - 2rem);
    max-height: calc(100vh - 4rem);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  header {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .header-text { flex: 1; }

  h2 {
    font-size: 15px;
    font-weight: 600;
    margin: 0 0 0.2rem;
    color: var(--text);
  }

  .subtitle {
    font-size: 12px;
    color: var(--text-2);
    margin: 0;
  }

  .icon-btn {
    width: 24px;
    height: 24px;
    padding: 0;
    flex-shrink: 0;
    font-size: 13px;
  }

  .body {
    flex: 1;
    overflow-y: auto;
    padding: 1rem 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 1.1rem;
  }

  .form-block {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }

  .form-label {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--text-2);
  }

  .form-label .muted {
    text-transform: none;
    letter-spacing: 0;
    font-weight: 400;
    font-size: 11px;
  }

  .mode-row {
    display: flex;
    gap: 1.25rem;
  }

  .radio-label {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 13px;
    color: var(--text);
    font-weight: 400;
    margin: 0;
    cursor: pointer;
  }

  .radio-label.disabled { opacity: 0.4; cursor: default; }

  input[type="text"], select {
    font-size: 13px;
    width: 100%;
  }

  .section-list {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .sec-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.3rem 0.6rem;
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    transition: opacity 0.15s;
  }

  .sec-row.excluded { opacity: 0.4; }

  .sec-id {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-2);
    flex-shrink: 0;
    width: 4rem;
  }

  .sec-name {
    flex: 1;
    font-size: 12px;
    padding: 2px 6px;
    min-width: 0;
  }

  .sec-count {
    font-size: 11px;
    color: var(--text-2);
    flex-shrink: 0;
  }

  footer {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1.25rem;
    border-top: 1px solid var(--border);
    flex-shrink: 0;
  }

  .total-label {
    flex: 1;
    font-size: 12px;
    color: var(--text-2);
  }

  footer button { font-size: 13px; }

  .variants-row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  .variants-input {
    width: 64px;
    font-size: 13px;
  }

  .muted-text {
    font-size: 12px;
    color: var(--text-2);
  }
</style>
