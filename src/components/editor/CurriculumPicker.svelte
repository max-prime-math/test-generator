<script lang="ts">
  import { CLASSES, DEMO_CLASSES } from '../../lib/curriculum';
  import { customClasses } from '../../lib/custom-classes.svelte';
  import { appState } from '../../lib/app-state.svelte';
  let { classId = $bindable(''), unitId = $bindable(''), sectionId = $bindable(''), create = false }:
    { classId?: string; unitId?: string; sectionId?: string; create?: boolean } = $props();
  let classes = $derived([...CLASSES, ...(appState.demoMode ? DEMO_CLASSES : []), ...customClasses.classes]);
  let units = $derived(classes.find(c => c.id === classId)?.units ?? []);
  let sections = $derived(units.find(u => u.id === unitId)?.sections ?? []);
  function addUnit() {
    const name = prompt('New unit name');
    if (name?.trim()) { unitId = customClasses.addUnit(classId, name.trim()).id; sectionId = ''; }
  }
  function addSection() {
    const name = prompt('New section name');
    if (name?.trim()) sectionId = customClasses.addSection(classId, unitId, name.trim()).id;
  }
</script>
<div class="curriculum">
  <label>Class<select bind:value={classId} onchange={() => { unitId = ''; sectionId = ''; }}>
    <option value="">Uncategorized</option>
    {#if classId && !classes.some(c => c.id === classId)}<option value={classId}>{classId}</option>{/if}
    {#each classes as c}<option value={c.id}>{c.name}</option>{/each}
  </select></label>
  <label>Unit<select bind:value={unitId} disabled={!classId} onchange={() => sectionId = ''}>
    <option value="">No unit</option>
    {#if unitId && !units.some(u => u.id === unitId)}<option value={unitId}>{unitId}</option>{/if}
    {#each units as u}<option value={u.id}>{u.id}: {u.name}</option>{/each}
  </select></label>
  <label>Section<select bind:value={sectionId} disabled={!unitId}>
    <option value="">No section</option>
    {#if sectionId && !sections.some(s => s.id === sectionId)}<option value={sectionId}>{sectionId}</option>{/if}
    {#each sections as s}<option value={s.id}>{s.id}: {s.name}</option>{/each}
  </select></label>
  {#if create && classId}<div><button onclick={addUnit}>+ Unit</button> <button onclick={addSection} disabled={!unitId}>+ Section</button></div>{/if}
</div>
<style>
  .curriculum { display: grid; gap: .5rem; }
  label { display: grid; gap: .25rem; font-size: 12px; color: var(--text-2); }
  select { width: 100%; min-width: 0; }
</style>
