<script lang="ts">
  import { CLASSES } from '../lib/curriculum';
  import { customClasses } from '../lib/custom-classes.svelte';
  import type { BnkBank, BnkQuestion } from '../lib/bnk-parser';

  interface Props {
    bnk: BnkBank;
    oncancel: () => void;
    onimport: (questions: BnkQuestion[], classId: string, unitMap: Map<string, string>) => void;
  }

  let { bnk, oncancel, onimport }: Props = $props();

  // ── Class assignment ────────────────────────────────────────────────────────
  let allClasses = $derived([...CLASSES, ...customClasses.classes]);

  // 'new' = create new class, otherwise an existing class id
  let classMode   = $state<'new' | 'existing'>('new');
  let newClassName  = $state(bnk.title);
  let existingClassId = $state(allClasses[0]?.id ?? '');

  let resolvedClassId = $derived(
    classMode === 'existing' ? existingClassId : ''
  );
  let resolvedClass = $derived(
    classMode === 'existing' ? allClasses.find(c => c.id === existingClassId) : null
  );

  // ── Per-section unit names (user can rename before importing) ───────────────
  // Each BNK section becomes one unit under the chosen class.
  type SectionAssign = { unitName: string; include: boolean };
  let sectionAssignments = $state<Map<string, SectionAssign>>(
    new Map(bnk.sections.map(s => [s.id, { unitName: `${s.id}: ${s.name}`, include: true }]))
  );

  function setSectionName(sectionId: string, name: string) {
    const m = new Map(sectionAssignments);
    const cur = m.get(sectionId)!;
    m.set(sectionId, { ...cur, unitName: name });
    sectionAssignments = m;
  }

  function setSectionInclude(sectionId: string, include: boolean) {
    const m = new Map(sectionAssignments);
    const cur = m.get(sectionId)!;
    m.set(sectionId, { ...cur, include });
    sectionAssignments = m;
  }

  let includedSections = $derived(
    bnk.sections.filter(s => sectionAssignments.get(s.id)?.include)
  );

  let totalQuestions = $derived(
    bnk.questions.filter(q => sectionAssignments.get(q.section)?.include).length
  );

  let canImport = $derived(
    totalQuestions > 0 &&
    (classMode === 'existing' ? !!existingClassId : !!newClassName.trim())
  );

  // ── Question counts per section ─────────────────────────────────────────────
  function qCount(sectionId: string): number {
    return bnk.questions.filter(q => q.section === sectionId).length;
  }

  // ── Import ──────────────────────────────────────────────────────────────────
  function doImport() {
    let classId: string;

    if (classMode === 'new') {
      const cls = customClasses.add(newClassName.trim());
      classId = cls.id;
    } else {
      classId = existingClassId;
    }

    // Build unit map: sectionId → unitId
    const unitMap = new Map<string, string>();
    for (const sec of includedSections) {
      const assign = sectionAssignments.get(sec.id)!;
      // Check if the class already has a unit with this name
      const cls = customClasses.classes.find(c => c.id === classId);
      const existing = cls?.units.find(u => u.name === assign.unitName);
      if (existing) {
        unitMap.set(sec.id, existing.id);
      } else {
        const unit = customClasses.addUnit(classId, assign.unitName);
        unitMap.set(sec.id, unit.id);
      }
    }

    const includedQuestions = bnk.questions.filter(
      q => sectionAssignments.get(q.section)?.include
    );

    onimport(includedQuestions, classId, unitMap);
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
        <p class="subtitle">"{bnk.title}" — {bnk.questions.length} questions in {bnk.sections.length} section{bnk.sections.length !== 1 ? 's' : ''}</p>
      </div>
      <button class="ghost icon" onclick={oncancel}>✕</button>
    </header>

    <div class="body">

      <!-- Class assignment -->
      <section class="form-section">
        <h3>Assign to class</h3>
        <div class="mode-toggle">
          <label>
            <input type="radio" bind:group={classMode} value="new" />
            Create new class
          </label>
          <label>
            <input type="radio" bind:group={classMode} value="existing" />
            Add to existing class
          </label>
        </div>

        {#if classMode === 'new'}
          <input
            class="text-input"
            type="text"
            bind:value={newClassName}
            placeholder="Class name…"
          />
        {:else}
          <select bind:value={existingClassId}>
            {#each allClasses as cls}
              <option value={cls.id}>{cls.name}</option>
            {/each}
          </select>
          {#if resolvedClass && resolvedClass.units.length > 0}
            <p class="hint">New units will be added to this class. Existing units with the same name will be reused.</p>
          {/if}
        {/if}
      </section>

      <!-- Section → unit mapping -->
      <section class="form-section">
        <h3>Sections → Units</h3>
        <p class="hint">Each section becomes a unit. Uncheck to skip a section.</p>
        <div class="section-list">
          {#each bnk.sections as sec}
            {@const assign = sectionAssignments.get(sec.id)!}
            <div class="section-row" class:excluded={!assign.include}>
              <input
                type="checkbox"
                checked={assign.include}
                onchange={(e) => setSectionInclude(sec.id, (e.currentTarget as HTMLInputElement).checked)}
              />
              <div class="section-info">
                <span class="section-id">{sec.id}</span>
                <input
                  class="unit-name-input"
                  type="text"
                  value={assign.unitName}
                  disabled={!assign.include}
                  oninput={(e) => setSectionName(sec.id, (e.currentTarget as HTMLInputElement).value)}
                />
              </div>
              <span class="q-count">{qCount(sec.id)}q</span>
            </div>
          {/each}
        </div>
      </section>

    </div>

    <footer>
      <span class="total">{totalQuestions} question{totalQuestions !== 1 ? 's' : ''} will be imported</span>
      <button class="ghost" onclick={oncancel}>Cancel</button>
      <button class="primary" onclick={doImport} disabled={!canImport}>
        Import {totalQuestions} Question{totalQuestions !== 1 ? 's' : ''}
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
    width: 560px;
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

  button.icon {
    padding: 0;
    width: 24px;
    height: 24px;
    flex-shrink: 0;
    font-size: 13px;
  }

  .body {
    flex: 1;
    overflow-y: auto;
    padding: 1rem 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .form-section h3 {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-2);
    margin: 0 0 0.6rem;
  }

  .mode-toggle {
    display: flex;
    gap: 1.25rem;
    margin-bottom: 0.6rem;
    font-size: 13px;
  }

  .mode-toggle label {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    cursor: pointer;
    color: var(--text);
    font-size: 13px;
    font-weight: 400;
    margin: 0;
  }

  .text-input {
    width: 100%;
    font-size: 13px;
  }

  select {
    width: 100%;
    font-size: 13px;
  }

  .hint {
    font-size: 12px;
    color: var(--text-2);
    margin: 0.4rem 0 0;
  }

  .section-list {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    margin-top: 0.5rem;
  }

  .section-row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.35rem 0.6rem;
    background: var(--bg-2);
    border-radius: var(--radius);
    border: 1px solid var(--border);
    transition: opacity 0.15s;
  }

  .section-row.excluded { opacity: 0.4; }

  .section-info {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }

  .section-id {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-2);
    flex-shrink: 0;
    min-width: 4rem;
  }

  .unit-name-input {
    flex: 1;
    font-size: 12px;
    padding: 2px 6px;
    min-width: 0;
  }

  .q-count {
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

  .total {
    flex: 1;
    font-size: 12px;
    color: var(--text-2);
  }

  footer button { font-size: 13px; }
</style>
