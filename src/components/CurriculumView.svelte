<script lang="ts" module>
  export type CurriculumPick =
    | { type: 'section'; classId: string; unitId: string; sectionId: string; untagged?: boolean }
    | { type: 'indicator'; classId: string; indicatorId: string };
</script>

<script lang="ts">
  import type { Class, Question } from '../lib/types';
  import { indicatorCatalog } from '../lib/indicator-catalog.svelte';
  import { compareUnits, sectionLabel, unitLabel } from '../lib/curriculum-labels';
  import { customClasses } from '../lib/custom-classes.svelte';
  import { tick } from 'svelte';

  let { classes, questions, classId = $bindable(''), onshow }:
    { classes: Class[]; questions: Question[]; classId?: string; onshow: (pick: CurriculumPick) => void } = $props();

  let cls = $derived(classes.find((c) => c.id === classId) ?? classes[0]);
  /** Question counts for the chosen class: per section, untagged per section, and per indicator. */
  let counts = $derived.by(() => {
    const sections = new Map<string, number>();
    const untagged = new Map<string, number>();
    const indicators = new Map<string, number>();
    for (const q of questions) {
      for (const id of q.indicators ?? []) indicators.set(id, (indicators.get(id) ?? 0) + 1);
      if (q.classId !== cls?.id || !q.sectionId) continue;
      const key = `${q.unitId}/${q.sectionId}`;
      sections.set(key, (sections.get(key) ?? 0) + 1);
      if (!q.indicators?.length) untagged.set(key, (untagged.get(key) ?? 0) + 1);
    }
    return { sections, untagged, indicators };
  });
  let units = $derived(cls ? [...cls.units].sort(compareUnits) : []);
  let summary = $derived.by(() => {
    let total = 0, covered = 0, untagged = 0;
    for (const unit of units) for (const section of unit.sections) {
      untagged += counts.untagged.get(`${unit.id}/${section.id}`) ?? 0;
      for (const entry of indicatorCatalog.forSection(cls?.id, unit.id, section.id)) {
        total++;
        if (counts.indicators.get(entry.id)) covered++;
      }
    }
    return { total, covered, untagged };
  });
  let showGapsOnly = $state(false);

  // ── Nicknames: a short name shown in place of wordy section or indicator text ──
  let editing = $state<{ unitId: string; sectionId: string; indicatorId: string | null; value: string } | null>(null);
  async function startNickname(unitId: string, sectionId: string, indicatorId: string | null, current: string | undefined) {
    editing = { unitId, sectionId, indicatorId, value: current ?? '' };
    await tick();
    document.querySelector<HTMLInputElement>('.curriculum-view .nickname-field')?.focus();
  }
  function saveNickname() {
    if (!editing || !cls) return;
    // The fullest copy of the class: indicators may come from another bank in the workspace.
    const shown = indicatorCatalog.classes.find((c) => c.id === cls.id) ?? cls;
    customClasses.setNickname(shown, editing.unitId, editing.sectionId, editing.indicatorId, editing.value);
    editing = null;
  }
  const isEditing = (unitId: string, sectionId: string, indicatorId: string | null) =>
    editing?.unitId === unitId && editing.sectionId === sectionId && editing.indicatorId === indicatorId;
</script>

{#snippet nicknameField(label: string, full: string)}
  <span class="nickname-editor">
    <input class="nickname-field" bind:value={editing!.value} placeholder={full} aria-label={label} title={full}
      onkeydown={(e) => { if (e.key === 'Enter') saveNickname(); else if (e.key === 'Escape') editing = null; }}
      onblur={saveNickname} />
    <span class="original-wording">Original: {full}</span>
  </span>
{/snippet}

<div class="curriculum-view">
  {#if !cls}
    <p class="empty">This bank has no classes yet. Create one, or place questions in a class, to see its curriculum here.</p>
  {:else}
    <header>
      <label class="class-pick">Class
        <select value={cls.id} onchange={(e) => classId = e.currentTarget.value}>
          {#each classes as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
        </select>
      </label>
      <p class="summary">
        {#if summary.total}{summary.covered} of {summary.total} indicators have questions{:else}No achievement indicators in this class’s curriculum{/if}{#if summary.untagged}{' · '}{summary.untagged} placed question{summary.untagged === 1 ? '' : 's'} without an indicator{/if}
      </p>
      {#if summary.total}<label class="gaps"><input type="checkbox" bind:checked={showGapsOnly} /> Only indicators without questions</label>{/if}
    </header>

    {#each units as unit (unit.id)}
      <section class="unit">
        <h3>{unitLabel(unit)}</h3>
        {#each unit.sections as section (section.id)}
          {@const key = `${unit.id}/${section.id}`}
          {@const indicators = indicatorCatalog.forSection(cls.id, unit.id, section.id)}
          {@const shown = showGapsOnly ? indicators.filter((entry) => !counts.indicators.get(entry.id)) : indicators}
          {#if !showGapsOnly || shown.length}
            <div class="section">
              <div class="section-head">
                {#if isEditing(unit.id, section.id, null)}
                  <span class="section-id">{section.id}</span>{@render nicknameField(`Nickname for ${section.id}`, section.name)}
                {:else}
                  <span class="section-title">
                    <span class="title-line">
                      <button class="link" onclick={() => onshow({ type: 'section', classId: cls.id, unitId: unit.id, sectionId: section.id })}
                        title="Show this outcome’s questions">{sectionLabel(section, ': ')}</button>
                      <button class="rename" onclick={() => startNickname(unit.id, section.id, null, section.nickname)}
                        title={section.nickname ? 'Change or clear this outcome’s nickname' : 'Give this outcome a short nickname'} aria-label="Nickname for {section.id}">✎</button>
                    </span>
                    {#if section.nickname}<span class="full">{section.name}</span>{/if}
                  </span>
                {/if}
                <span class="count">{counts.sections.get(key) ?? 0}</span>
                {#if indicators.length && counts.untagged.get(key)}
                  <button class="untagged" onclick={() => onshow({ type: 'section', classId: cls.id, unitId: unit.id, sectionId: section.id, untagged: true })}
                    title="Show this section’s questions that have no achievement indicator">{counts.untagged.get(key)} without an indicator</button>
                {/if}
              </div>
              {#if shown.length}
                <ul>
                  {#each shown as entry (entry.id)}
                    {@const n = counts.indicators.get(entry.id) ?? 0}
                    <li class:gap={!n}>
                      <span class="id">{entry.id}</span>
                      {#if isEditing(unit.id, section.id, entry.id)}
                        {@render nicknameField(`Nickname for ${entry.id}`, entry.text)}
                      {:else}
                        <span class="text">
                          {#if entry.nickname}<span class="nick">{entry.nickname}</span> <span class="full">{entry.text}</span>{:else}{entry.text}{/if}
                          <button class="rename" onclick={() => startNickname(unit.id, section.id, entry.id, entry.nickname)}
                            title={entry.nickname ? 'Change or clear the nickname' : 'Give this indicator a short nickname'} aria-label="Nickname for {entry.id}">✎</button>
                        </span>
                      {/if}
                      {#if n}<button class="count link" onclick={() => onshow({ type: 'indicator', classId: cls.id, indicatorId: entry.id })} title="Show questions with this indicator">{n}</button>
                      {:else}<span class="count none" title="No question in this bank has this indicator">0</span>{/if}
                    </li>
                  {/each}
                </ul>
              {/if}
            </div>
          {/if}
        {/each}
      </section>
    {/each}
  {/if}
</div>

<style>
  .curriculum-view { flex: 1; overflow-y: auto; padding: .75rem 1rem 2rem; display: grid; gap: 1rem; align-content: start; }
  header { display: flex; flex-wrap: wrap; align-items: end; gap: .5rem 1rem; }
  .class-pick { display: grid; gap: .25rem; font-size: 12px; color: var(--text-2); }
  .summary { margin: 0; font-size: 12px; color: var(--text-2); flex: 1; min-width: 200px; }
  .gaps { display: flex; gap: .35rem; align-items: center; font-size: 12px; color: var(--text-2); }
  .gaps input { width: auto; margin: 0; }
  .unit h3 { font-size: 14px; margin: 0 0 .4rem; }
  .section { border: 1px solid var(--border); border-radius: 8px; padding: .55rem .7rem; margin-bottom: .5rem; background: var(--bg); }
  .section-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: .5rem; }
  .section-title { flex: 1; min-width: 0; display: grid; gap: .1rem; }
  .section-title .link { font-weight: 600; text-align: left; }
  .title-line { display: flex; align-items: baseline; gap: .3rem; min-width: 0; }
  .section-id { font-weight: 600; font-size: 13px; }
  .full { color: var(--text-2); font-size: 11px; }
  .nick { font-weight: 500; }
  .nickname-editor { flex: 1; min-width: 0; display: grid; gap: .15rem; }
  .original-wording { color: var(--text-2); font-size: 11px; line-height: 1.3; }
  .nickname-field { width: 100%; min-width: 0; font-size: 12px; padding: .2rem .4rem; }
  .rename { background: none; border: none; box-shadow: none; padding: 0 .2rem; color: var(--text-2); font-size: 12px; cursor: pointer; opacity: .55; }
  .rename:hover:not(:disabled), .rename:focus-visible { background: none; opacity: 1; color: var(--primary); }
  .link { background: none; border: none; box-shadow: none; padding: 0; color: inherit; cursor: pointer; font: inherit; font-size: 13px; }
  .link:hover:not(:disabled) { background: none; color: var(--primary); text-decoration: underline; }
  .untagged { font-size: 11px; padding: .05rem .5rem; border-radius: 999px; background: var(--bg-2); color: var(--text-2); }
  ul { list-style: none; margin: .45rem 0 0; padding: 0; display: grid; gap: .25rem; }
  li { display: grid; grid-template-columns: auto 1fr auto; gap: .6rem; align-items: baseline; font-size: 12px; line-height: 1.35; }
  .id { color: var(--text-2); font-variant-numeric: tabular-nums; white-space: nowrap; }
  li.gap .text { color: var(--text-2); }
  .count { font-size: 12px; font-variant-numeric: tabular-nums; color: var(--text-2); min-width: 1.5rem; text-align: right; }
  .count.link { color: var(--primary); font-size: 12px; }
  .count.none { opacity: .6; }
  .empty { color: var(--text-2); font-size: 13px; }
</style>
