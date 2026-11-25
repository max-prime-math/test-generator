<script module lang="ts">
  export const UNTAGGED = '__untagged__';
</script>

<script lang="ts">
  import type { Question } from '../lib/types';
  import { indicatorLabel } from '../lib/achievement-indicators';
  import { indicatorCatalog } from '../lib/indicator-catalog.svelte';

  let {
    id, questions, selection = $bindable(), search = $bindable(),
  }: {
    id: string;
    questions: Question[];
    selection: string | null;
    search: string;
  } = $props();

  const untaggedLabel = 'Without a granular outcome';
  let outcomeCounts = $derived.by(() => {
    const counts = new Map<string, number>();
    for (const question of questions) {
      const ids = question.indicators?.length ? question.indicators : [UNTAGGED];
      for (const id of new Set(ids)) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  });

  let options = $derived.by(() => {
    const ids = new Set(outcomeCounts.keys());
    if (selection) ids.add(selection);
    ids.delete(UNTAGGED);
    return [...ids].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .map(id => ({ id, entry: indicatorCatalog.get(id), count: outcomeCounts.get(id) ?? 0 }));
  });

  let words = $derived(search.toLowerCase().split(/\s+/).filter(Boolean));
  let showUntagged = $derived(words.every(word => untaggedLabel.toLowerCase().includes(word)));
  let visibleOptions = $derived(options.filter(({ id, entry }) => {
    const wording = `${id} ${entry?.text ?? ''} ${entry?.nickname ?? ''} ${entry?.section.name ?? ''} ${entry?.section.nickname ?? ''}`.toLowerCase();
    return words.every(word => wording.includes(word));
  }));
</script>

<input id={id + '-search'} type="search" placeholder="Find an outcome code or wording…"
  aria-label="Search curricular outcomes" bind:value={search} />
<div class="outcome-options" role="group" aria-label="Curricular outcomes">
  {#if showUntagged}
    <label class:active={selection === UNTAGGED}>
      <input type="radio" name={id} checked={selection === UNTAGGED} onchange={() => selection = UNTAGGED} />
      <span>{untaggedLabel}</span><span class="count">{outcomeCounts.get(UNTAGGED) ?? 0}</span>
    </label>
  {/if}
  {#each visibleOptions as option (option.id)}
    <label class:active={selection === option.id} title={option.entry?.text ?? option.id}>
      <input type="radio" name={id} checked={selection === option.id} onchange={() => selection = option.id} />
      <span class="outcome-name"><strong>{option.id}</strong>{#if option.entry}<small>{indicatorLabel(option.entry)}</small>{/if}</span>
      <span class="count">{option.count}</span>
    </label>
  {/each}
  {#if !showUntagged && visibleOptions.length === 0}
    <p>No curricular outcomes match.</p>
  {/if}
</div>
<button class="ghost clear-outcome" type="button" onclick={() => selection = null} disabled={!selection}>Clear outcome</button>

<style>
  input[type="search"] { width: 100%; font-size: 12px; padding: 0.25rem 0.4rem; }
  .outcome-options { max-height: 150px; overflow-y: auto; margin-top: 0.35rem; }
  label {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: start;
    gap: 0.45rem;
    padding: 0.35rem;
    border-radius: 6px;
    font-size: 12px;
    cursor: pointer;
  }
  label:hover, label.active { background: var(--bg-2); }
  label input { width: auto; margin: 0.1rem 0 0; }
  .outcome-name { display: grid; gap: 0.1rem; overflow-wrap: anywhere; }
  small, .count, p { color: var(--text-2); }
  .count { font-size: 10px; }
  p { font-size: 11px; margin: 0; padding: 0.5rem; }
  .clear-outcome { margin-top: 0.25rem; font-size: 11px; }
</style>
