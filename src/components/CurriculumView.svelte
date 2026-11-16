<script lang="ts" module>
  export type CurriculumPick =
    | { type: 'section'; classId: string; unitId: string; sectionId: string; untagged?: boolean }
    | { type: 'indicator'; classId: string; indicatorId: string };
</script>

<script lang="ts">
  import type { Class, CurriculumIndicatorRef, Question } from '../lib/types';
  import { indicatorLabel, type IndicatorEntry } from '../lib/achievement-indicators';
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

  type OutcomeTarget = { unitId: string; sectionId: string; indicatorId: string | null };
  let choosingNextStep = $state<OutcomeTarget | null>(null);
  let nextStepQuery = $state('');
  let allIndicators = $derived.by(() => {
    const entries: IndicatorEntry[] = [];
    for (const course of indicatorCatalog.classes) for (const unit of course.units) for (const section of unit.sections) {
      (section.indicators ?? []).forEach((indicator, number) => entries.push({ ...indicator, cls: course, unit, section, number: number + 1 }));
    }
    return entries;
  });
  let nextStepMatches = $derived.by(() => {
    const words = nextStepQuery.toLocaleLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return allIndicators.filter((entry) => {
      const searchable = `${entry.id} ${entry.text} ${entry.nickname ?? ''} ${entry.cls.name} ${entry.unit.name} ${entry.section.id} ${entry.section.name}`.toLocaleLowerCase();
      return words.every(word => searchable.includes(word));
    }).slice(0, 30);
  });

  // Parent-readable report wording belongs to the shared outcome, never to one bank copy.
  type CommentField = 'nickname' | 'nextStep';
  let editing = $state<{ unitId: string; sectionId: string; indicatorId: string | null; field: CommentField; value: string } | null>(null);
  async function startCommentField(unitId: string, sectionId: string, indicatorId: string | null, field: CommentField, current: string | undefined) {
    choosingNextStep = null;
    editing = { unitId, sectionId, indicatorId, field, value: current ?? '' };
    await tick();
    document.querySelector<HTMLInputElement>('.curriculum-view .comment-field')?.focus();
  }
  function saveCommentField() {
    if (!editing || !cls) return;
    // The fullest copy of the class: indicators may come from another bank in the workspace.
    const shown = indicatorCatalog.classes.find((c) => c.id === cls.id) ?? cls;
    if (editing.field === 'nickname') customClasses.setNickname(shown, editing.unitId, editing.sectionId, editing.indicatorId, editing.value);
    else customClasses.setNextStep(shown, editing.unitId, editing.sectionId, editing.indicatorId, editing.value);
    editing = null;
  }
  const isEditing = (unitId: string, sectionId: string, indicatorId: string | null, field: CommentField) =>
    editing?.unitId === unitId && editing.sectionId === sectionId && editing.indicatorId === indicatorId && editing.field === field;
  const isChoosingNextStep = (unitId: string, sectionId: string, indicatorId: string | null) =>
    choosingNextStep?.unitId === unitId && choosingNextStep.sectionId === sectionId && choosingNextStep.indicatorId === indicatorId;
  async function startNextStepPicker(unitId: string, sectionId: string, indicatorId: string | null) {
    editing = null;
    choosingNextStep = { unitId, sectionId, indicatorId };
    nextStepQuery = '';
    await tick();
    document.querySelector<HTMLInputElement>('.curriculum-view .next-step-search')?.focus();
  }
  function saveNextStepIndicator(entry: IndicatorEntry) {
    if (!choosingNextStep || !cls) return;
    const shown = indicatorCatalog.classes.find((candidate) => candidate.id === cls.id) ?? cls;
    customClasses.setNextStepIndicator(shown, choosingNextStep.unitId, choosingNextStep.sectionId, choosingNextStep.indicatorId, {
      classId: entry.cls.id, unitId: entry.unit.id, sectionId: entry.section.id, indicatorId: entry.id,
    });
    choosingNextStep = null;
  }
  function clearNextStepIndicator() {
    if (!choosingNextStep || !cls) return;
    const shown = indicatorCatalog.classes.find((candidate) => candidate.id === cls.id) ?? cls;
    customClasses.setNextStepIndicator(shown, choosingNextStep.unitId, choosingNextStep.sectionId, choosingNextStep.indicatorId, null);
    choosingNextStep = null;
  }
  function useWrittenNextStep(current: string | undefined) {
    if (!choosingNextStep) return;
    const target = choosingNextStep;
    void startCommentField(target.unitId, target.sectionId, target.indicatorId, 'nextStep', current);
  }
  function nextStepEntry(reference: CurriculumIndicatorRef | undefined): IndicatorEntry | undefined {
    if (!reference) return undefined;
    return indicatorCatalog.forSection(reference.classId, reference.unitId, reference.sectionId)
      .find(entry => entry.id === reference.indicatorId);
  }
</script>

{#snippet commentField(label: string, full: string, hint: string)}
  <span class="nickname-editor">
    <input class="comment-field" bind:value={editing!.value} placeholder={hint} aria-label={label} title={full}
      onkeydown={(e) => { if (e.key === 'Enter') saveCommentField(); else if (e.key === 'Escape') editing = null; }}
      onblur={saveCommentField} />
    <span class="original-wording">{hint} · Official curriculum: {full}</span>
  </span>
{/snippet}

{#snippet nextStepPicker(full: string, reference: CurriculumIndicatorRef | undefined, written: string | undefined)}
  {@const linked = nextStepEntry(reference)}
  <span class="next-step-editor">
    <span class="picker-title">Choose any achievement indicator as the next step</span>
    {#if reference}
      <span class="current-next-step"><strong>Current linked indicator:</strong> {reference.indicatorId}{#if linked} — {indicatorLabel(linked)} <small>{linked.cls.name} · {linked.unit.name}</small>{/if}</span>
    {:else if written}
      <span class="current-next-step"><strong>Current written next step:</strong> {written}</span>
    {/if}
    <input class="next-step-search" type="search" bind:value={nextStepQuery} placeholder="Search every curriculum by code or wording"
      aria-label="Find an achievement indicator for the next step" title={full} />
    {#if nextStepQuery.trim()}
      <ul class="next-step-results">
        {#each nextStepMatches as entry (`${entry.cls.id}/${entry.unit.id}/${entry.section.id}/${entry.id}`)}
          <li><button onclick={() => saveNextStepIndicator(entry)}><span class="id">{entry.id}</span><span>{indicatorLabel(entry)} <small>{entry.cls.name} · {entry.unit.name}</small></span></button></li>
        {:else}<li class="empty-result">No achievement indicators match.</li>{/each}
      </ul>
    {/if}
    <span class="picker-actions">
      <button class="metadata-action" onclick={() => useWrittenNextStep(written)}>Write a custom next step</button>
      {#if reference}<button class="metadata-action" onclick={clearNextStepIndicator}>Clear linked indicator</button>{/if}
      <button class="metadata-action" onclick={() => choosingNextStep = null}>Cancel</button>
    </span>
  </span>
{/snippet}

{#snippet shownNextStep(reference: CurriculumIndicatorRef | undefined, written: string | undefined)}
  {@const linked = nextStepEntry(reference)}
  {#if reference}
    <span class="next-step"><strong>Linked next step:</strong> {reference.indicatorId}{#if linked} — {indicatorLabel(linked)} <small>{linked.cls.name} · {linked.unit.name}</small>{/if}</span>
  {:else if written}
    <span class="next-step"><strong>Written next step:</strong> {written}</span>
  {/if}
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
        {#if summary.total}{summary.covered} of {summary.total} granular outcomes have questions{:else}No granular outcomes in this class’s curriculum{/if}{#if summary.untagged}{' · '}{summary.untagged} placed question{summary.untagged === 1 ? '' : 's'} without a granular outcome{/if}
      </p>
      {#if summary.total}<label class="gaps"><input type="checkbox" bind:checked={showGapsOnly} /> Only granular outcomes without questions</label>{/if}
      <p class="comment-help"><strong>Shared curriculum language:</strong> report nicknames and next steps saved here apply in every bank. A next step can link to any achievement indicator in the curriculum library, so its current nickname or official wording flows into reports automatically. Written next steps remain available.</p>
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
                {#if isEditing(unit.id, section.id, null, 'nickname')}
                  <span class="section-id">{section.id}</span>{@render commentField(`Parent-readable nickname for ${section.id}`, section.name, 'Verb phrase, e.g. multiply polynomials')}
                {:else if isEditing(unit.id, section.id, null, 'nextStep')}
                  <span class="section-id">{section.id}</span>{@render commentField(`Next step for ${section.id}`, section.name, 'Action phrase, e.g. practice the distributive property')}
                {:else if isChoosingNextStep(unit.id, section.id, null)}
                  <span class="section-id">{section.id}</span>{@render nextStepPicker(section.name, section.nextStepIndicator, section.nextStep)}
                {:else}
                  <span class="section-title">
                    <span class="title-line">
                      <button class="link" onclick={() => onshow({ type: 'section', classId: cls.id, unitId: unit.id, sectionId: section.id })}
                        title="Show this outcome’s questions">{sectionLabel({ id: section.id, name: section.name }, ': ')}</button>
                      <button class="metadata-action" onclick={() => startCommentField(unit.id, section.id, null, 'nickname', section.nickname)}
                        title="Write a faithful, parent-readable phrase for report comments" aria-label="Nickname for {section.id}">Nickname</button>
                      <button class="metadata-action" onclick={() => startNextStepPicker(unit.id, section.id, null)}
                        title="Link any achievement indicator or write a next step" aria-label="Next step for {section.id}">Next step</button>
                    </span>
                    {#if section.nickname}<span class="report-nickname"><strong>Report nickname:</strong> {section.nickname}</span><span class="full"><strong>Official wording:</strong> {section.name}</span>{/if}
                    {@render shownNextStep(section.nextStepIndicator, section.nextStep)}
                  </span>
                {/if}
                <span class="count">{counts.sections.get(key) ?? 0}</span>
                {#if indicators.length && counts.untagged.get(key)}
                  <button class="untagged" onclick={() => onshow({ type: 'section', classId: cls.id, unitId: unit.id, sectionId: section.id, untagged: true })}
                    title="Show this section’s questions that have no granular curricular outcome">{counts.untagged.get(key)} without an outcome</button>
                {/if}
              </div>
              {#if shown.length}
                <ul>
                  {#each shown as entry (entry.id)}
                    {@const n = counts.indicators.get(entry.id) ?? 0}
                    <li class:gap={!n}>
                      <span class="id">{entry.id}</span>
                      {#if isEditing(unit.id, section.id, entry.id, 'nickname')}
                        {@render commentField(`Parent-readable nickname for ${entry.id}`, entry.text, 'Verb phrase, e.g. multiply polynomials')}
                      {:else if isEditing(unit.id, section.id, entry.id, 'nextStep')}
                        {@render commentField(`Next step for ${entry.id}`, entry.text, 'Action phrase, e.g. practice the distributive property')}
                      {:else if isChoosingNextStep(unit.id, section.id, entry.id)}
                        {@render nextStepPicker(entry.text, entry.nextStepIndicator, entry.nextStep)}
                      {:else}
                        <span class="text">
                          <span>{#if entry.nickname}<span class="nick"><strong>Report nickname:</strong> {entry.nickname}</span> <span class="full"><strong>Official wording:</strong> {entry.text}</span>{:else}{entry.text}{/if}</span>
                          <span class="metadata-actions"><button class="metadata-action" onclick={() => startCommentField(unit.id, section.id, entry.id, 'nickname', entry.nickname)}
                            title="Write a faithful, parent-readable phrase for report comments" aria-label="Nickname for {entry.id}">Nickname</button>
                          <button class="metadata-action" onclick={() => startNextStepPicker(unit.id, section.id, entry.id)}
                            title="Link any achievement indicator or write a next step" aria-label="Next step for {entry.id}">Next step</button></span>
                          {@render shownNextStep(entry.nextStepIndicator, entry.nextStep)}
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
  .comment-help { flex-basis: 100%; margin: .15rem 0 0; padding: .5rem .65rem; border: 1px solid var(--border); border-radius: 5px; background: var(--bg-2); color: var(--text-2); font-size: 11px; line-height: 1.4; }
  .gaps { display: flex; gap: .35rem; align-items: center; font-size: 12px; color: var(--text-2); }
  .gaps input { width: auto; margin: 0; }
  .unit h3 { font-size: 14px; margin: 0 0 .4rem; }
  .section { padding: .55rem .7rem; margin-bottom: .5rem; background: var(--bg); }
  .section-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: .5rem; }
  .section-title { flex: 1; min-width: 0; display: grid; gap: .1rem; }
  .section-title .link { font-weight: 600; text-align: left; }
  .title-line { display: flex; align-items: baseline; gap: .3rem; min-width: 0; }
  .section-id { font-weight: 600; font-size: 13px; }
  .full { color: var(--text-2); font-size: 11px; }
  .report-nickname { color: var(--text); font-size: 11px; }
  .next-step { color: var(--text-2); font-size: 11px; font-style: italic; }
  .next-step small, .current-next-step small, .next-step-results small { display: block; color: var(--text-2); font-size: 10px; font-style: normal; }
  .nick { font-weight: 500; }
  .nickname-editor { flex: 1; min-width: 0; display: grid; gap: .15rem; }
  .original-wording { color: var(--text-2); font-size: 11px; line-height: 1.3; }
  .comment-field { width: 100%; min-width: 0; font-size: 12px; padding: .2rem .4rem; }
  .next-step-editor { flex: 1; min-width: 260px; display: grid; gap: .35rem; padding: .45rem; border: 1px solid var(--border); border-radius: 5px; background: var(--bg-2); }
  .picker-title { font-size: 12px; font-weight: 600; }
  .current-next-step { font-size: 11px; color: var(--text-2); }
  .next-step-search { width: 100%; min-width: 0; font-size: 12px; padding: .3rem .45rem; }
  .next-step-results { max-height: 15rem; overflow-y: auto; margin: 0; padding: 0; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; }
  .next-step-results li { display: block; }
  .next-step-results button { width: 100%; display: grid; grid-template-columns: auto 1fr; gap: .55rem; text-align: left; padding: .35rem .45rem; border: 0; border-radius: 0; background: none; color: var(--text); }
  .next-step-results button:hover, .next-step-results button:focus-visible { background: var(--bg-3); }
  .empty-result { padding: .4rem .5rem; color: var(--text-2); font-size: 11px; }
  .picker-actions { display: flex; flex-wrap: wrap; gap: .55rem; }
  .text { display: grid; gap: .12rem; }
  .metadata-actions { display: flex; flex-wrap: wrap; gap: .25rem; }
  .metadata-action { background: none; border: none; box-shadow: none; padding: 0; color: var(--primary); font-size: 10px; cursor: pointer; text-decoration: underline; }
  .metadata-action:hover:not(:disabled), .metadata-action:focus-visible { background: none; color: var(--text); }
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
