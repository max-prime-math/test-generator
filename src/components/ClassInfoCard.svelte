<script lang="ts">
  import { bank } from '../lib/bank.svelte';
  import { CLASSES } from '../lib/curriculum';
  import { customClasses } from '../lib/custom-classes.svelte';
  import type { Class, Unit, Section } from '../lib/types';

  interface Props {
    classId: string;
    onclose: () => void;
  }

  let { classId, onclose }: Props = $props();

  let allClasses = $derived([...CLASSES, ...customClasses.classes]);
  let cls        = $derived(allClasses.find((c) => c.id === classId));
  let isCustom   = $derived(customClasses.classes.some((c) => c.id === classId));

  // Question counts
  let totalQ   = $derived(bank.questions.filter((q) => q.classId === classId).length);
  let unitStats = $derived(
    (cls?.units ?? []).map((unit) => {
      const uQs = bank.questions.filter((q) => q.classId === classId && q.unitId === unit.id);
      return {
        unit,
        count: uQs.length,
        sections: unit.sections.map((sec) => ({
          sec,
          count: bank.questions.filter(
            (q) => q.classId === classId && q.unitId === unit.id && q.sectionId === sec.id,
          ).length,
        })),
      };
    }),
  );

  // ── Rename state ───────────────────────────────────────────────────────────
  let renamingClass      = $state(false);
  let className          = $state('');
  let renamingUnitId     = $state<string | null>(null);
  let unitName           = $state('');
  let renamingSectionKey = $state<string | null>(null); // "unitId/sectionId"
  let sectionName        = $state('');
  let expandedUnits      = $state(new Set<string>());

  function startRenameClass() {
    className     = cls?.name ?? '';
    renamingClass = true;
  }
  function commitRenameClass() {
    if (className.trim()) customClasses.renameClass(classId, className);
    renamingClass = false;
  }

  function startRenameUnit(unitId: string, current: string) {
    renamingUnitId = unitId;
    unitName       = current;
  }
  function commitRenameUnit() {
    if (renamingUnitId && unitName.trim()) customClasses.renameUnit(classId, renamingUnitId, unitName);
    renamingUnitId = null;
  }

  function startRenameSection(unitId: string, secId: string, current: string) {
    renamingSectionKey = `${unitId}/${secId}`;
    sectionName        = current;
  }
  function commitRenameSection() {
    if (!renamingSectionKey) return;
    const [unitId, secId] = renamingSectionKey.split('/');
    if (sectionName.trim()) customClasses.renameSection(classId, unitId, secId, sectionName);
    renamingSectionKey = null;
  }

  function toggleUnit(unitId: string) {
    const next = new Set(expandedUnits);
    next.has(unitId) ? next.delete(unitId) : next.add(unitId);
    expandedUnits = next;
  }

  function keydown(e: KeyboardEvent, commit: () => void, cancel: () => void) {
    if (e.key === 'Enter')  { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { e.preventDefault(); cancel(); }
  }

  function focus(el: HTMLElement) {
    el.focus();
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
<div class="overlay" onclick={onclose}>
  <div class="card" onclick={(e) => e.stopPropagation()}>

    <!-- Header -->
    <div class="card-header">
      {#if renamingClass}
        <input
          class="rename-input"
          bind:value={className}
          onblur={commitRenameClass}
          onkeydown={(e) => keydown(e, commitRenameClass, () => (renamingClass = false))}
          use:focus
        />
      {:else}
        <h3 class="card-title">{cls?.name ?? classId}</h3>
        {#if isCustom}
          <button class="icon-btn" onclick={startRenameClass} title="Rename class">✎</button>
        {/if}
      {/if}
      <button class="icon-btn close-btn" onclick={onclose} title="Close">✕</button>
    </div>

    <!-- Stats row -->
    <div class="stats-row">
      <span>{totalQ} question{totalQ !== 1 ? 's' : ''}</span>
      {#if cls && cls.units.length > 0}
        <span>·</span>
        <span>{cls.units.length} unit{cls.units.length !== 1 ? 's' : ''}</span>
      {/if}
      {#if !isCustom}
        <span class="built-in-badge">built-in</span>
      {/if}
    </div>

    <!-- Units list -->
    {#if cls && unitStats.length > 0}
      <div class="units-list">
        {#each unitStats as { unit, count, sections }}
          <div class="unit-row">
            <button
              class="unit-toggle"
              onclick={() => toggleUnit(unit.id)}
              title={expandedUnits.has(unit.id) ? 'Collapse' : 'Expand sections'}
            >
              {expandedUnits.has(unit.id) ? '▾' : '▸'}
            </button>

            {#if renamingUnitId === unit.id}
              <input
                class="rename-input flex1"
                bind:value={unitName}
                onblur={commitRenameUnit}
                onkeydown={(e) => keydown(e, commitRenameUnit, () => (renamingUnitId = null))}
                use:focus
              />
            {:else}
              <span class="unit-name">{unit.name}</span>
              {#if isCustom}
                <button class="icon-btn dim" onclick={() => startRenameUnit(unit.id, unit.name)} title="Rename unit">✎</button>
              {/if}
            {/if}

            <span class="q-badge">{count}q</span>
          </div>

          {#if expandedUnits.has(unit.id) && sections.length > 0}
            <div class="sections-list">
              {#each sections as { sec, count: sCount }}
                <div class="section-row">
                  {#if renamingSectionKey === `${unit.id}/${sec.id}`}
                    <input
                      class="rename-input flex1"
                      bind:value={sectionName}
                      onblur={commitRenameSection}
                      onkeydown={(e) => keydown(e, commitRenameSection, () => (renamingSectionKey = null))}
                      use:focus
                    />
                  {:else}
                    <span class="section-id">{sec.id}</span>
                    <span class="section-name">{sec.name}</span>
                    {#if isCustom}
                      <button
                        class="icon-btn dim"
                        onclick={() => startRenameSection(unit.id, sec.id, sec.name)}
                        title="Rename section"
                      >✎</button>
                    {/if}
                  {/if}
                  <span class="q-badge dim">{sCount}q</span>
                </div>
              {/each}
            </div>
          {/if}
        {/each}
      </div>
    {:else if cls && cls.units.length === 0}
      <p class="no-units">No units yet.</p>
    {/if}

  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 200;
    background: transparent;
  }

  .card {
    position: fixed;
    top: 56px;
    left: 50%;
    transform: translateX(-50%);
    width: 360px;
    max-width: calc(100vw - 2rem);
    max-height: calc(100vh - 80px);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.18);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .card-header {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .card-title {
    flex: 1;
    font-size: 15px;
    font-weight: 600;
    margin: 0;
    color: var(--text);
  }

  .close-btn { margin-left: auto; }

  .stats-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.5rem 1rem;
    font-size: 12px;
    color: var(--text-2);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .built-in-badge {
    margin-left: auto;
    padding: 0.1rem 0.45rem;
    background: var(--bg-3);
    border-radius: 100px;
    font-size: 10px;
    color: var(--text-2);
  }

  .units-list {
    overflow-y: auto;
    flex: 1;
    padding: 0.4rem 0;
  }

  .unit-row {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.3rem 1rem;
    font-size: 13px;
  }

  .unit-toggle {
    width: 16px;
    height: 16px;
    padding: 0;
    background: none;
    border: none;
    color: var(--text-2);
    font-size: 10px;
    cursor: pointer;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .unit-name {
    flex: 1;
    color: var(--text);
    font-weight: 500;
  }

  .sections-list {
    padding-left: 2.1rem;
    padding-bottom: 0.2rem;
  }

  .section-row {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.2rem 1rem 0.2rem 0;
    font-size: 12px;
    color: var(--text-2);
  }

  .section-id {
    font-weight: 600;
    font-size: 11px;
    color: var(--text-2);
    min-width: 2rem;
  }

  .section-name { flex: 1; }

  .q-badge {
    font-size: 11px;
    color: var(--text-2);
    flex-shrink: 0;
  }
  .q-badge.dim { opacity: 0.6; }

  .icon-btn {
    width: 22px;
    height: 22px;
    padding: 0;
    background: none;
    border: none;
    border-radius: 4px;
    color: var(--text-2);
    font-size: 12px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    opacity: 0.5;
  }
  .icon-btn:hover { background: var(--bg-2); opacity: 1; }
  .icon-btn.dim { opacity: 0.3; }
  .icon-btn.dim:hover { opacity: 1; }

  .rename-input {
    padding: 0.15rem 0.35rem;
    font-size: 13px;
    border: 1px solid var(--primary);
    border-radius: 4px;
    background: var(--bg);
    color: var(--text);
    outline: none;
    min-width: 0;
  }
  .rename-input.flex1 { flex: 1; }

  .no-units {
    padding: 1rem;
    font-size: 13px;
    color: var(--text-2);
    margin: 0;
  }
</style>
