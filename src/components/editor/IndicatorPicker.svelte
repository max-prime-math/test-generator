<script lang="ts">
  import { indicatorLabel, searchIndicators } from '../../lib/achievement-indicators';
  import { indicatorCatalog } from '../../lib/indicator-catalog.svelte';
  let { indicators = $bindable(), classId = '', unitId = '', sectionId = '' }:
    { indicators?: string[]; classId?: string; unitId?: string; sectionId?: string } = $props();
  let query = $state('');
  let chosen = $derived(new Set(indicators ?? []));
  let sectionList = $derived(indicatorCatalog.forSection(classId, unitId, sectionId));
  let others = $derived((indicators ?? []).filter(id => !sectionList.some(entry => entry.id === id)));
  let results = $derived(searchIndicators(indicatorCatalog.index, query, 30).filter(entry => !sectionList.includes(entry)));
  function toggle(id: string) {
    const next = chosen.has(id) ? (indicators ?? []).filter(other => other !== id) : [...(indicators ?? []), id];
    // An empty list is no list, so removing the last one does not count as an edit.
    indicators = next.length ? next : undefined;
  }
</script>
<div class="indicators">
  <span class="label">Achievement indicators</span>
  {#if sectionList.length}
    <ul>
      {#each sectionList as entry (entry.id)}
        <li><label title={entry.text}><input type="checkbox" checked={chosen.has(entry.id)} onchange={() => toggle(entry.id)} /><span class="id">{entry.id}</span><span>{indicatorLabel(entry)}</span></label></li>
      {/each}
    </ul>
  {:else if sectionId}
    <p class="note">This section has no indicators in the bank’s curriculum. Search below to use another section’s.</p>
  {:else}
    <p class="note">Choose a section to see its indicators, or search for one.</p>
  {/if}
  {#if others.length}
    <ul>
      {#each others as id (id)}
        {@const entry = indicatorCatalog.get(id)}
        <li><label title={entry?.text}><input type="checkbox" checked onchange={() => toggle(id)} /><span class="id">{id}</span><span>{entry ? indicatorLabel(entry) : 'Not in any loaded curriculum'}</span></label></li>
      {/each}
    </ul>
  {/if}
  {#if indicatorCatalog.size}
    <input type="search" bind:value={query} placeholder="Find an indicator by code or wording" aria-label="Find an achievement indicator" />
    {#if query.trim()}
      <ul class="results">
        {#each results as entry (entry.id)}
          <li><label title={entry.text}><input type="checkbox" checked={chosen.has(entry.id)} onchange={() => toggle(entry.id)} /><span class="id">{entry.id}</span><span>{indicatorLabel(entry)}</span></label></li>
        {:else}<li class="note">No indicators match.</li>{/each}
      </ul>
    {/if}
  {/if}
</div>
<style>
  .indicators { display: grid; gap: .4rem; font-size: 12px; }
  .label { color: var(--text-2); }
  ul { list-style: none; margin: 0; padding: 0; display: grid; gap: .25rem; }
  .results { max-height: 220px; overflow-y: auto; border: 1px solid var(--border); border-radius: 6px; padding: .35rem; }
  label { display: grid; grid-template-columns: auto auto 1fr; gap: .45rem; align-items: baseline; cursor: pointer; color: var(--text); line-height: 1.35; }
  input[type=checkbox] { width: auto; margin: 0; }
  .id { font-variant-numeric: tabular-nums; color: var(--text-2); white-space: nowrap; }
  .note { margin: 0; color: var(--text-2); }
  input[type=search] { width: 100%; min-width: 0; }
</style>
