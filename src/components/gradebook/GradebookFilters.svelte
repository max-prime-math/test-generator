<script lang="ts">
  import { tick } from 'svelte';
  import { gradebook } from '../../lib/gradebook.svelte';
  import { gradebookViews } from '../../lib/gradebook-view-prefs.svelte';
  import { DEFAULT_GRADEBOOK_FILTER, describeGradebookFilter } from '../../lib/gradebook-filter-rules';
  import { GRADEBOOK_CATEGORIES } from '../../lib/gradebook-model';
  import type { GradebookFilterRules } from '../../lib/types';
  let { sectionId, shown, total }: { sectionId: string; shown: number; total: number } = $props();
  const current = $derived(gradebookViews.forSection(sectionId));
  const saved = $derived(gradebook.savedFilters.filter(filter => filter.sectionId === sectionId && !filter.trashedAt));
  const trash = $derived(gradebook.savedFilters.filter(filter => filter.sectionId === sectionId && filter.trashedAt));
  const selected = $derived(saved.find(filter => filter.id === current.savedId));
  const modified = $derived(!!selected && JSON.stringify(selected.rules) !== JSON.stringify(current.rules));
  const presets: Record<string, GradebookFilterRules> = {
    all: { ...DEFAULT_GRADEBOOK_FILTER }, missing: { ...DEFAULT_GRADEBOOK_FILTER, workState: 'missing' },
    risk: { ...DEFAULT_GRADEBOOK_FILTER, belowPercent: 50 }, ungraded: { ...DEFAULT_GRADEBOOK_FILTER, workState: 'ungraded' },
  };
  const value = $derived(selected ? selected.id : Object.keys(presets).find(key => JSON.stringify(presets[key]) === JSON.stringify(current.rules)) ?? 'custom');
  let name = $state('');
  let error = $state('');
  let status = $state('');
  let viewSelect: HTMLSelectElement;
  function choose(id: string) {
    const filter = saved.find(item => item.id === id);
    gradebookViews.set(sectionId, { rules: filter ? { ...filter.rules } : { ...(presets[id] ?? DEFAULT_GRADEBOOK_FILTER) }, savedId: filter?.id ?? '', savedAt: filter?.updatedAt });
    name = filter?.name ?? ''; error = status = '';
  }
  function change(rules: Partial<GradebookFilterRules>) {
    gradebookViews.set(sectionId, { ...current, rules: { ...current.rules, ...rules } }); error = status = '';
  }
  function save(update = false) {
    try {
      const filter = gradebook.saveFilter({ sectionId, name: name || (update ? selected?.name ?? '' : ''), rules: { ...current.rules }, id: update ? selected?.id : undefined, expectedUpdatedAt: update ? current.savedAt : undefined });
      gradebookViews.set(sectionId, { rules: { ...filter.rules }, savedId: filter.id, savedAt: filter.updatedAt });
      name = filter.name; error = ''; status = `Saved “${filter.name}” in this section.`;
    } catch (cause) { error = cause instanceof Error ? cause.message : String(cause); }
  }
  function action(work: () => void, message: string) {
    const trigger = document.activeElement;
    try {
      work(); status = message; error = '';
      void tick().then(() => { if (trigger && !trigger.isConnected) viewSelect?.focus(); });
    } catch (cause) { error = String(cause); }
  }
</script>

<section class="overview-filters" aria-label="Overview filters">
  <div class="filter-heading"><label>Overview filter<select bind:this={viewSelect} aria-label="Overview filter" {value} onchange={event => choose(event.currentTarget.value)}>
    <option value="all">All students and assessments</option><option value="missing">Students with missing work</option><option value="risk">Course grade below 50%</option><option value="ungraded">Students with ungraded work</option>
    {#if value === 'custom'}<option value="custom">Custom filter</option>{/if}
    {#each saved as filter (filter.id)}<option value={filter.id}>{filter.name}{selected?.id === filter.id && modified ? ' (modified)' : ''}</option>{/each}
  </select></label><span role="status">Showing {shown} of {total} students</span><button type="button" onclick={() => choose('all')}>Clear filters</button></div>
  {#if value !== 'all'}<p class="hint">{describeGradebookFilter(current.rules)}</p>{/if}
  <details><summary>Adjust and save filters</summary>
    <div class="rules">
      <label>Student name or ID<input aria-label="Filter student name or ID" value={current.rules.studentQuery} oninput={event => change({ studentQuery: event.currentTarget.value })} /></label>
      <label>Assessment category<select aria-label="Filter assessment category" value={current.rules.category} onchange={event => change({ category: event.currentTarget.value as GradebookFilterRules['category'] })}><option value="all">All categories</option>{#each GRADEBOOK_CATEGORIES as category}<option value={category}>{category[0].toUpperCase() + category.slice(1)}</option>{/each}</select></label>
      <label>Has work marked<select aria-label="Filter work state" value={current.rules.workState} onchange={event => change({ workState: event.currentTarget.value as GradebookFilterRules['workState'] })}><option value="all">Any state</option><option value="missing">Missing</option><option value="incomplete">Incomplete</option><option value="ungraded">Ungraded</option></select></label>
      <label>Course grade below (%)<input aria-label="Filter course grade below" type="number" min="0" max="100" step="any" value={current.rules.belowPercent ?? ''} placeholder="Any grade" oninput={event => {
        if (!event.currentTarget.validity.valid) { error = 'Enter a course-grade cutoff from 0 to 100.'; return; }
        change({ belowPercent: event.currentTarget.value === '' ? null : Number(event.currentTarget.value) });
      }} /></label>
    </div>
    <p class="hint">Conditions combine. Work state applies to the chosen category; course grade uses all assessments and the section's grading policy. Ungraded work is separate from Missing. Grading keeps the full roster.</p>
    <div class="save-controls"><label>Filter name<input aria-label="Saved filter name" bind:value={name} placeholder={selected?.name ?? 'Example: Missing quizzes'} /></label><button type="button" onclick={() => save()}>Save as new filter</button>
      {#if selected}<button type="button" onclick={() => save(true)}>Update saved filter</button>
        {#if selected.previous}<button type="button" onclick={() => action(() => { const id = selected!.id; gradebook.undoFilterEdit(id); choose(id); }, 'Previous filter version restored.')}>Undo filter update</button>{/if}
        <button type="button" onclick={() => action(() => { const id = selected!.id; gradebook.setFilterTrashed(id, true); gradebookViews.set(sectionId, { ...current, savedId: '' }); }, 'Filter moved to Trash. The current view is kept.')}>Move filter to Trash</button>
      {/if}
    </div>
  </details>
  {#if error}<p class="error" role="alert">{error}</p>{/if}{#if status}<p class="hint" role="status">{status}</p>{/if}
  {#if trash.length}<details><summary>Filters in Trash ({trash.length})</summary>{#each trash as filter}<div class="trashed"><span>{filter.name}</span><button type="button" onclick={() => action(() => gradebook.setFilterTrashed(filter.id, false), 'Saved filter restored.')}>Restore filter</button></div>{/each}</details>{/if}
</section>

<style>
  .overview-filters { border: 1px solid var(--border); border-radius: 8px; padding: .8rem; margin: .8rem 0; background: var(--bg-2); }
  .filter-heading, .save-controls, .trashed { display: flex; flex-wrap: wrap; gap: .6rem; align-items: end; }
  .filter-heading > span { margin: auto 0; font-size: 12px; color: var(--text-2); } .filter-heading > button { margin-left: auto; }
  label { display: grid; gap: .3rem; font-size: 12px; min-width: 0; } select, input { min-width: 0; max-width: 100%; }
  .rules { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: .6rem; margin-top: .7rem; }
  summary { cursor: pointer; font-size: 12px; margin-top: .65rem; } button { font-size: 12px; }
  .hint, .error { font-size: 12px; line-height: 1.5; } .hint { color: var(--text-2); } .error { color: var(--danger); }
  .trashed { align-items: center; margin-top: .5rem; }
  @media(max-width: 600px) { .filter-heading > label { width: 100%; } .save-controls > label { width: 100%; } }
</style>
