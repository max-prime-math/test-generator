<script lang="ts">
  import AddToTestMenu from '../AddToTestMenu.svelte';
  import GeneratedProblemCard from './GeneratedProblemCard.svelte';
  import { bank } from '../../lib/bank.svelte';
  import { customClasses } from '../../lib/custom-classes.svelte';
  import { GENERATOR_COURSES } from '../../lib/generator/outcomes';
  import { CATALOGS } from '../../lib/generator/catalog';
  import { GENERATORS, findGenerator, toQuestion, type GeneratedItem } from '../../lib/generator/registry';
  import { deriveSeed, MAX_SEED, randomSeed } from '../../lib/generator/rng';
  import type { Difficulty, Generator, ProblemFormat } from '../../lib/generator/types';

  const PLAN_KEY = 'tg-generator-plan-v1';
  const MAX_PER_GENERATOR = 30;

  type Plan = { format: ProblemFormat; course: string; rows: Record<string, { count: number; difficulty: Difficulty }> };

  /** Courses that have at least one generator. */
  const courses = GENERATOR_COURSES.filter((c) => GENERATORS.some((g) => g.classId === c.id));

  function loadPlan(): Plan {
    const blankRows = () => Object.fromEntries(GENERATORS.map((g) => [g.id, { count: 0, difficulty: 1 as Difficulty }]));
    const fallback: Plan = { format: 'written', course: courses[0]?.id ?? '', rows: blankRows() };
    try {
      const saved = JSON.parse(localStorage.getItem(PLAN_KEY) ?? 'null') as Partial<Plan> | null;
      const course = courses.some((c) => c.id === saved?.course) ? saved!.course! : fallback.course;
      const plan: Plan = { format: saved?.format === 'mcq' ? 'mcq' : 'written', course, rows: {} };
      for (const g of GENERATORS) {
        const row = saved?.rows?.[g.id];
        const count = Math.max(0, Math.min(MAX_PER_GENERATOR, Math.floor(Number(row?.count) || 0)));
        const difficulty = ([1, 2, 3] as const).find((d) => d === row?.difficulty) ?? 1;
        plan.rows[g.id] = { count, difficulty };
      }
      return plan;
    } catch {
      return fallback;
    }
  }

  let plan = $state<Plan>(loadPlan());
  $effect(() => {
    const snapshot = JSON.stringify(plan);
    try { localStorage.setItem(PLAN_KEY, snapshot); } catch { /* The plan is a convenience; generating still works. */ }
  });

  let seedInput = $state('');
  let seedUsed = $state<number | null>(null);
  let edited = $state(false);
  let items = $state<GeneratedItem[]>([]);
  let showAnswers = $state(false);
  let savedIds = $state<string[]>([]);
  let notice = $state<{ text: string; ok: boolean } | null>(null);

  /** A count input can hold anything while typing; generation uses a whole number in range. */
  const countOf = (id: string) => Math.max(0, Math.min(MAX_PER_GENERATOR, Math.floor(Number(plan.rows[id]?.count) || 0)));
  let questions = $derived(items.map((item) => toQuestion(item, plan.format)));
  let query = $state('');

  type Group = { key: string; title: string; generators: Generator[] };
  /**
   * The chosen course's generators in groups: by catalogue unit when the course has a
   * catalogue (in catalogue order), otherwise by outcome.
   */
  let groups = $derived.by((): Group[] => {
    const course = courses.find((c) => c.id === plan.course);
    if (!course) return [];
    const catalog = CATALOGS.find((c) => c.classId === course.id);
    if (catalog) {
      return catalog.units.map((u) => ({
        key: u.name,
        title: u.name,
        generators: u.types.map((t) => GENERATORS.find((g) => g.catalogId === t.id)).filter((g): g is Generator => !!g),
      })).filter((g) => g.generators.length);
    }
    return course.units.flatMap((unit) => unit.sections.map((section) => ({
      key: section.id,
      title: `${section.id} ${section.name}`,
      generators: GENERATORS.filter((g) => g.classId === course.id && g.outcomeId === section.id),
    }))).filter((g) => g.generators.length);
  });
  /** Generators in display order, which is also the order problems are generated in. */
  let courseGenerators = $derived(groups.flatMap((g) => g.generators));
  let total = $derived(courseGenerators.reduce((sum, g) => sum + countOf(g.id), 0));

  const matches = (g: Generator, group: Group, q: string) =>
    !q || [g.title, group.title, ...(g.outcomes ?? [g.outcomeId])].some((text) => text.toLowerCase().includes(q));
  let visibleGroups = $derived.by(() => {
    const q = query.trim().toLowerCase();
    return groups.map((group) => ({ ...group, generators: group.generators.filter((g) => matches(g, group, q)) })).filter((g) => g.generators.length);
  });
  let visibleCount = $derived(visibleGroups.reduce((sum, g) => sum + g.generators.length, 0));

  /** Groups the user opened; groups with problems selected, and every group while searching, show open too. */
  let opened = $state<Record<string, boolean>>({});
  const isOpen = (group: Group) => opened[group.key] ?? (query.trim() !== '' || group.generators.some((g) => countOf(g.id) > 0));
  const selectedIn = (group: Group) => group.generators.reduce((sum, g) => sum + countOf(g.id), 0);

  function generate() {
    const typed = Number(seedInput.trim());
    const seed = seedInput.trim() && Number.isInteger(typed) && typed >= 0 && typed <= MAX_SEED ? typed : randomSeed();
    seedInput = String(seed);
    seedUsed = seed;
    edited = false;
    savedIds = [];
    notice = null;
    items = courseGenerators.flatMap((g) => {
      const row = plan.rows[g.id];
      return Array.from({ length: countOf(g.id) }, (_, n) => ({ generatorId: g.id, difficulty: row.difficulty, seed: deriveSeed(seed, g.id, row.difficulty, n) }));
    });
  }

  function newSeed() {
    seedInput = '';
    generate();
  }

  function regenerate(index: number) {
    items[index] = { ...items[index], seed: randomSeed() };
    edited = true;
    savedIds = [];
  }

  function remove(index: number) {
    items = items.filter((_, i) => i !== index);
    edited = true;
    savedIds = [];
  }

  function clearPlan() {
    for (const g of courseGenerators) plan.rows[g.id].count = 0;
  }

  function saveToBank() {
    // File generated questions under their course, adding the course to the user's classes the first time.
    const needed = GENERATOR_COURSES.filter((c) => questions.some((q) => q.classId === c.id) && !customClasses.classes.some((own) => own.id === c.id));
    if (needed.length) customClasses.importMany(needed);
    savedIds = questions.map((q) => bank.add(q).id);
    const added = needed.length ? ` · Added ${needed.map((c) => c.name).join(', ')} to your classes` : '';
    notice = { text: `Saved ${savedIds.length} question${savedIds.length === 1 ? '' : 's'} to the bank${added}`, ok: true };
  }

  let theme = $state(document.documentElement.getAttribute('data-theme') ?? 'auto');
  let dark = $state(window.matchMedia('(prefers-color-scheme: dark)').matches);
  $effect(() => {
    const observer = new MutationObserver(() => theme = document.documentElement.getAttribute('data-theme') ?? 'auto');
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => dark = media.matches;
    media.addEventListener('change', update);
    return () => { observer.disconnect(); media.removeEventListener('change', update); };
  });
</script>

<div class="generator">
  <aside class="plan" aria-label="Choose problems">
    <div class="plan-head">
      <h2>Generate <span class="badge">Experimental</span></h2>
      <p>Pick how many problems to make of each type, then generate. The same seed always gives the same set.</p>
    </div>
    <div class="rail-controls">
      {#if courses.length > 1}
        <label class="field">Course
          <select bind:value={plan.course} aria-label="Course">
            {#each courses as course (course.id)}<option value={course.id}>{course.name}</option>{/each}
          </select>
        </label>
      {/if}
      <input type="search" placeholder="Search problem types or outcomes" bind:value={query} aria-label="Search problem types" />
      {#if query.trim()}<p class="hint" role="status">{visibleCount} match{visibleCount === 1 ? '' : 'es'}</p>{/if}
    </div>
    {#each visibleGroups as group (group.key)}
      <details class="group" open={isOpen(group)} ontoggle={(e) => (opened[group.key] = e.currentTarget.open)}>
        <summary>
          <span class="group-title">{group.title}</span>
          <span class="group-count">{selectedIn(group) ? `${selectedIn(group)} selected` : group.generators.length}</span>
        </summary>
        {#each group.generators as g (g.id)}
          <div class="row" class:active={countOf(g.id) > 0}>
            <span class="gen-title">{g.title}{#if g.mcq === false}<span class="tag" title="Stays written in a multiple-choice set">written</span>{/if}</span>
            <span class="tags">{#each g.outcomes ?? [g.outcomeId] as o}<span class="tag">{o}</span>{/each}</span>
            <select bind:value={plan.rows[g.id].difficulty} aria-label="{g.title} level" title={g.levels[plan.rows[g.id].difficulty]}>
              {#each [1, 2, 3] as const as level}
                <option value={level}>L{level}: {g.levels[level]}</option>
              {/each}
            </select>
            <input type="number" min="0" max={MAX_PER_GENERATOR} bind:value={plan.rows[g.id].count} aria-label="Number of {g.title} problems" />
          </div>
        {/each}
      </details>
    {:else}
      <p class="hint">No problem types match “{query}”.</p>
    {/each}
  </aside>

  <section class="work">
    <div class="toolbar">
      <div class="segment" role="radiogroup" aria-label="Question format">
        <button role="radio" aria-checked={plan.format === 'written'} class:active={plan.format === 'written'} onclick={() => (plan.format = 'written')}>Written</button>
        <button role="radio" aria-checked={plan.format === 'mcq'} class:active={plan.format === 'mcq'} onclick={() => (plan.format = 'mcq')}>Multiple choice</button>
      </div>
      <label class="seed">Seed
        <input type="text" inputmode="numeric" placeholder="Random" bind:value={seedInput} onkeydown={(e) => { if (e.key === 'Enter') generate(); }} />
      </label>
      <button class="primary" onclick={generate} disabled={!total}>Generate {total || ''}</button>
      <button onclick={newSeed} disabled={!total} title="Generate with a new random seed">New seed</button>
      <button class="ghost" onclick={clearPlan} disabled={!total}>Clear counts</button>
      <label class="check"><input type="checkbox" bind:checked={showAnswers} /> Answers</label>
    </div>

    {#if items.length}
      <div class="actions">
        <span class="summary">{items.length} problem{items.length === 1 ? '' : 's'} · seed {seedUsed}{edited ? ' (edited)' : ''}</span>
        <button class="primary" onclick={saveToBank} disabled={savedIds.length > 0}>{savedIds.length ? 'Saved to bank' : 'Save to bank'}</button>
        {#if savedIds.length}
          <AddToTestMenu ids={savedIds} ondone={(text, ok) => (notice = { text, ok })} />
        {/if}
      </div>
      {#if notice}<p class="notice" class:error={!notice.ok} role="status">{notice.text}</p>{/if}
      <div class="cards">
        {#each questions as question, i (`${items[i].generatorId}:${items[i].seed}:${i}`)}
          {@const g = findGenerator(items[i].generatorId)}
          <GeneratedProblemCard
            {question}
            number={i + 1}
            title={g?.title ?? items[i].generatorId}
            level={items[i].difficulty}
            showAnswer={showAnswers}
            {theme}
            {dark}
            onregenerate={() => regenerate(i)}
            onremove={() => remove(i)}
          />
        {/each}
      </div>
    {:else}
      <div class="empty">
        <p><strong>No problems yet.</strong></p>
        <p>Set a count next to one or more problem types, then choose <em>Generate</em>. Save the set to your bank to add it to a test in Build.</p>
      </div>
    {/if}
  </section>
</div>

<style>
  .generator { display: grid; grid-template-columns: minmax(300px, 380px) minmax(0, 1fr); height: 100%; min-height: 0; background: var(--bg); color: var(--text); }
  .plan { overflow: auto; background: var(--bg-2); border-right: 1px solid var(--border); padding: 12px; }
  .plan-head h2 { margin: 0 0 .25rem; font-size: 1.05rem; display: flex; align-items: center; gap: .5rem; }
  .plan-head p { margin: 0 0 .75rem; color: var(--text-2); font-size: 12px; }
  .badge { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; padding: 2px 6px; border-radius: 999px; background: color-mix(in srgb, var(--primary) 16%, var(--bg)); color: var(--primary); }
  .rail-controls { display: grid; gap: .4rem; margin-bottom: .75rem; }
  .field { display: grid; gap: .2rem; font-size: 11px; color: var(--text-2); }
  .field select, .rail-controls input { font-size: 12px; padding: 5px 6px; }
  .hint { margin: 0; font-size: 12px; color: var(--text-2); }
  .group { background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 0 .5rem; margin-bottom: .45rem; }
  .group summary { display: flex; align-items: center; gap: .5rem; padding: .45rem 0; cursor: pointer; font-size: 12px; font-weight: 600; list-style-position: inside; }
  .group[open] summary { border-bottom: 1px solid var(--border); }
  .group-title { flex: 1; min-width: 0; }
  .group-count { font-weight: 400; color: var(--text-2); font-size: 11px; font-variant-numeric: tabular-nums; }
  .tags { grid-area: tags; display: flex; flex-wrap: wrap; gap: .2rem; }
  .tag { font-size: 10px; font-family: ui-monospace, monospace; padding: 0 4px; border-radius: 3px; background: var(--bg-2); color: var(--text-2); margin-left: .3rem; }
  .tags .tag { margin-left: 0; }
  .row { display: grid; grid-template-columns: minmax(0, 1fr) 3.5rem; grid-template-areas: "title title" "tags tags" "level count"; gap: .25rem .35rem; align-items: center; padding: .4rem 0; }
  .row + .row { border-top: 1px solid var(--border); }
  .row .gen-title { grid-area: title; }
  .row select { grid-area: level; }
  .row input { grid-area: count; }
  .row.active .gen-title { font-weight: 600; }
  .gen-title { font-size: 12px; min-width: 0; }
  .row select, .row input { font-size: 12px; padding: 3px 4px; min-width: 0; }
  .work { overflow: auto; padding: 14px; min-width: 0; }
  .toolbar, .actions { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; margin-bottom: .75rem; }
  .segment { display: inline-flex; border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
  .segment button { border: none; border-radius: 0; background: var(--bg-2); color: var(--text-2); }
  .segment button.active { background: var(--primary); color: #fff; }
  .seed { display: inline-flex; align-items: center; gap: .35rem; font-size: 12px; color: var(--text-2); }
  .seed input { width: 8rem; }
  .check { display: inline-flex; align-items: center; gap: .35rem; font-size: 12px; }
  .check input { width: auto; }
  .summary { color: var(--text-2); font-size: 12px; margin-right: auto; }
  .notice { font-size: 12px; margin: -.25rem 0 .75rem; color: var(--text-2); }
  .notice.error { color: var(--danger); }
  .cards { display: grid; gap: .6rem; max-width: 16cm; }
  .empty { color: var(--text-2); font-size: 13px; max-width: 34rem; }
  @media (max-width: 760px) {
    .generator { grid-template-columns: 1fr; grid-template-rows: auto 1fr; overflow: auto; }
    .plan { border-right: none; border-bottom: 1px solid var(--border); overflow: visible; }
    .work { overflow: visible; }
  }
</style>
