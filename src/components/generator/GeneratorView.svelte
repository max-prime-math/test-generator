<script lang="ts">
  import { untrack } from 'svelte';
  import AddToTestMenu from '../AddToTestMenu.svelte';
  import { testQuestionEditor } from '../../lib/editor/test-question-edit.svelte';
  import GeneratedProblemCard from './GeneratedProblemCard.svelte';
  import ProblemTypeCard from './ProblemTypeCard.svelte';
  import { GENERATOR_COURSES } from '../../lib/generator/outcomes';
  import { CATALOGS } from '../../lib/generator/catalog';
  import { GENERATORS, describeOptions, findGenerator, toQuestion } from '../../lib/generator/registry';
  import { randomSeed } from '../../lib/generator/rng';
  import { PLAN_KEY, loadPlan, newSeeds, planItems, sectionId, testQuestions, type Plan, type Section, type SectionDraft } from '../../lib/generator/worksheet';
  import type { Generator, ProblemFormat } from '../../lib/generator/types';

  const LEVEL_NAMES = { 1: 'Easy', 2: 'Medium', 3: 'Hard' } as const;

  /** Courses that have at least one generator. */
  const courses = GENERATOR_COURSES.filter((c) => GENERATORS.some((g) => g.classId === c.id));

  let plan = $state<Plan>(loadPlan(courses.map((c) => c.id)));
  $effect(() => {
    const snapshot = JSON.stringify(plan);
    try { localStorage.setItem(PLAN_KEY, snapshot); } catch { /* The worksheet is a convenience; it still works this session. */ }
  });

  let showAnswers = $state(false);
  let notice = $state<{ text: string; ok: boolean } | null>(null);
  let query = $state('');
  /** New cards start with the count and question type used last. */
  let lastCount = $state(5);
  let lastFormat = $state<ProblemFormat>('written');

  let items = $derived(planItems(plan.sections));
  let questions = $derived(items.map((p) => toQuestion(p.item, p.format)));
  /** The first question number of each section. */
  let starts = $derived.by(() => {
    const out: Record<string, number> = {};
    let n = 1;
    for (const s of plan.sections) { out[s.id] = n; n += s.seeds.length; }
    return out;
  });

  type Group = { key: string; title: string; generators: Generator[] };
  /** The chosen course's generators in groups: by catalogue unit when the course has a catalogue, otherwise by outcome. */
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
  const matches = (g: Generator, group: Group, q: string) =>
    !q || [g.title, group.title, ...(g.outcomes ?? [g.outcomeId])].some((text) => text.toLowerCase().includes(q));
  let visibleGroups = $derived.by(() => {
    const q = query.trim().toLowerCase();
    return groups.map((group) => ({ ...group, generators: group.generators.filter((g) => matches(g, group, q)) })).filter((g) => g.generators.length);
  });
  let visibleCount = $derived(visibleGroups.reduce((sum, g) => sum + g.generators.length, 0));
  const onSheet = (g: Generator) => plan.sections.filter((s) => s.generatorId === g.id).reduce((n, s) => n + s.seeds.length, 0);
  let opened = $state<Record<string, boolean>>({});
  const isOpen = (group: Group) => opened[group.key] ?? (query.trim() !== '' || group.generators.some((g) => onSheet(g) > 0));
  const selectedIn = (group: Group) => group.generators.reduce((sum, g) => sum + onSheet(g), 0);

  // ── The settings card ──
  /** `replacing`: the card was opened from a generated question in a test, and its questions take that question's place. */
  let editor = $state<{ generator: Generator; sectionId: string | null; initial: SectionDraft; replacing?: boolean } | null>(null);
  let replaceError = $state('');
  $effect(() => {
    const replace = testQuestionEditor.replace;
    if (!replace) return;
    untrack(() => {
      const g = findGenerator(replace.item.generatorId);
      if (!g) { testQuestionEditor.replace = null; notice = { text: 'That problem type is no longer available in Generate.', ok: false }; return; }
      if (courses.some((c) => c.id === g.classId)) plan.course = g.classId;
      replaceError = '';
      editor = { generator: g, sectionId: null, replacing: true,
        initial: { seeds: [replace.item.seed], difficulty: replace.item.difficulty, format: replace.item.format, options: { ...replace.item.options } } };
    });
  });
  function closeCard() {
    if (editor?.replacing) testQuestionEditor.cancelReplace();
    editor = null;
  }
  function openType(g: Generator) {
    editor = { generator: g, sectionId: null, initial: { seeds: newSeeds(lastCount), difficulty: 1, format: lastFormat, options: {} } };
  }
  function editSection(s: Section) {
    const g = findGenerator(s.generatorId);
    if (g) editor = { generator: g, sectionId: s.id, initial: { seeds: [...s.seeds], difficulty: s.difficulty, format: s.format, options: { ...s.options } } };
  }
  function changed() { notice = null; }
  function onsave(draft: SectionDraft, keepOpen: boolean) {
    if (!editor) return;
    if (editor.replacing) {
      const planned = draft.seeds.map((seed, index) => ({ item: { generatorId: editor!.generator.id, difficulty: draft.difficulty, seed, options: { ...draft.options } }, format: draft.format, sectionId: '', index }));
      replaceError = testQuestionEditor.finishReplace(testQuestions(planned, planned.map((p) => toQuestion(p.item, p.format))));
      if (!replaceError) editor = null;
      return;
    }
    lastCount = draft.seeds.length;
    lastFormat = draft.format;
    const id = editor.sectionId;
    if (id) plan.sections = plan.sections.map((s) => (s.id === id ? { ...s, ...draft } : s));
    else plan.sections = [...plan.sections, { id: sectionId(), generatorId: editor.generator.id, ...draft }];
    changed();
    if (!keepOpen) editor = null;
  }

  // ── The worksheet ──
  /** "5 questions · Medium · Multiple choice · Size of numbers: ±20". */
  function sectionMeta(section: Section, g: Generator | undefined): string {
    const parts = [`${section.seeds.length} question${section.seeds.length === 1 ? '' : 's'}`, LEVEL_NAMES[section.difficulty], section.format === 'mcq' ? 'Multiple choice' : 'Free response'];
    const opts = g ? describeOptions(g, section.options, section.difficulty) : '';
    return [...parts, ...(opts ? [opts] : [])].join(' · ');
  }
  function moveSection(i: number, by: number) {
    const j = i + by;
    if (j < 0 || j >= plan.sections.length) return;
    const next = [...plan.sections];
    [next[i], next[j]] = [next[j], next[i]];
    plan.sections = next;
    changed();
  }
  function removeSection(id: string) { plan.sections = plan.sections.filter((s) => s.id !== id); changed(); }
  function regenerate(sectionKey: string, index: number) {
    plan.sections = plan.sections.map((s) => (s.id === sectionKey ? { ...s, seeds: s.seeds.map((v, i) => (i === index ? randomSeed() : v)) } : s));
    changed();
  }
  function removeQuestion(sectionKey: string, index: number) {
    plan.sections = plan.sections.map((s) => (s.id === sectionKey ? { ...s, seeds: s.seeds.filter((_, i) => i !== index) } : s)).filter((s) => s.seeds.length);
    changed();
  }
  function newNumbers() { plan.sections = plan.sections.map((s) => ({ ...s, seeds: newSeeds(s.seeds.length) })); changed(); }
  function setAllFormats(format: ProblemFormat) {
    plan.sections = plan.sections.map((s) => ({ ...s, format: format === 'mcq' && findGenerator(s.generatorId)?.mcq === false ? 'written' : format }));
    lastFormat = format;
    changed();
  }
  let allFormat = $derived(plan.sections.length && plan.sections.every((s) => s.format === 'mcq' || findGenerator(s.generatorId)?.mcq === false) && plan.sections.some((s) => s.format === 'mcq') ? 'mcq' : plan.sections.every((s) => s.format === 'written') ? 'written' : 'mixed');
  function clearSheet() { plan.sections = []; changed(); }


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
  <aside class="plan" aria-label="Problem types">
    <div class="plan-head">
      <h2>Generate <span class="badge">Experimental</span></h2>
      <p>Choose a problem type to set how many questions, the level, and its options. The preview shows the exact questions; add the ones you like to the worksheet.</p>
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
          <span class="group-count">{selectedIn(group) ? `${selectedIn(group)} on sheet` : group.generators.length}</span>
        </summary>
        <div class="types">
          {#each group.generators as g (g.id)}
            <button class="type" class:active={onSheet(g) > 0} onclick={() => openType(g)} title="Open settings and preview">
              <span class="gen-title">{g.title}</span>
              <span class="type-meta">
                {#each g.outcomes ?? [g.outcomeId] as o}<span class="tag">{o}</span>{/each}
                {#if g.options?.length}<span class="tag opts" title="Has fine-tuning options">options</span>{/if}
                {#if g.mcq === false}<span class="tag" title="Stays written in a multiple-choice set">written</span>{/if}
                {#if onSheet(g)}<span class="count-badge">{onSheet(g)}</span>{/if}
              </span>
            </button>
          {/each}
        </div>
      </details>
    {:else}
      <p class="hint">No problem types match “{query}”.</p>
    {/each}
  </aside>

  <section class="work">
    <div class="toolbar">
      <div class="segment" role="radiogroup" aria-label="Question type for every section">
        <button role="radio" aria-checked={allFormat === 'written'} class:active={allFormat === 'written'} onclick={() => setAllFormats('written')} disabled={!plan.sections.length}>Written</button>
        <button role="radio" aria-checked={allFormat === 'mcq'} class:active={allFormat === 'mcq'} onclick={() => setAllFormats('mcq')} disabled={!plan.sections.length}>Multiple choice</button>
      </div>
      <button onclick={newNumbers} disabled={!items.length} title="New random questions for the whole worksheet, keeping every setting">↻ New numbers</button>
      <button class="ghost" onclick={clearSheet} disabled={!items.length}>Clear worksheet</button>
      <label class="check"><input type="checkbox" bind:checked={showAnswers} /> Answers</label>
    </div>

    {#if items.length}
      <div class="actions">
        <span class="summary">{items.length} question{items.length === 1 ? '' : 's'} in {plan.sections.length} section{plan.sections.length === 1 ? '' : 's'}</span>
        <AddToTestMenu own={() => testQuestions(items, questions)} subtitle="Worksheet" label="Add the worksheet's questions to a test" ondone={(text, ok) => (notice = { text, ok })} />
      </div>
      {#if notice}<p class="notice" class:error={!notice.ok} role="status">{notice.text}{#if notice.ok}{' · '}<a href="#/build">Open in Build</a>{/if}</p>{/if}
      <div class="sheet">
        {#each plan.sections as section, si (section.id)}
          {@const g = findGenerator(section.generatorId)}
          <div class="section-head">
            <div class="section-title">
              <strong>{g?.title ?? section.generatorId}</strong>
              <span class="section-meta">{sectionMeta(section, g)}</span>
            </div>
            <button onclick={() => editSection(section)} aria-label="Edit {g?.title}">Edit</button>
            <button class="icon" onclick={() => moveSection(si, -1)} disabled={si === 0} aria-label="Move up" title="Move up">↑</button>
            <button class="icon" onclick={() => moveSection(si, 1)} disabled={si === plan.sections.length - 1} aria-label="Move down" title="Move down">↓</button>
            <button class="icon" onclick={() => removeSection(section.id)} aria-label="Remove section {g?.title}" title="Remove this section">✕</button>
          </div>
          <div class="cards">
            {#each section.seeds as seed, qi (`${section.id}:${seed}:${qi}`)}
              {@const index = starts[section.id] - 1 + qi}
              {#if questions[index]}
                <GeneratedProblemCard
                  question={questions[index]}
                  number={index + 1}
                  title={g?.title ?? section.generatorId}
                  level={section.difficulty}
                  showAnswer={showAnswers}
                  {theme}
                  {dark}
                  onregenerate={() => regenerate(section.id, qi)}
                  onremove={() => removeQuestion(section.id, qi)}
                />
              {/if}
            {/each}
          </div>
        {/each}
      </div>
    {:else}
      <div class="empty">
        <p><strong>The worksheet is empty.</strong></p>
        <p>Choose a problem type on the left. Its card lets you set the number of questions, the level, and options, and shows the questions before you add them. Then use Add to… to put the questions in your current test or a new one; they stay with that test and are not added to a bank.</p>
      </div>
    {/if}
  </section>

  {#if editor}
    {@const replace = editor.replacing ? testQuestionEditor.replace : null}
    <ProblemTypeCard generator={editor.generator} initial={editor.initial} editing={editor.sectionId !== null || !!replace} saveLabel={replace ? 'Replace in test' : ''}
      note={replace ? `These questions replace the question in “${replace.testName}”. Change the settings or numbers, then choose Replace in test.` : ''} error={replaceError}
      {theme} {dark} {onsave} onclose={closeCard} />
  {/if}
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
  .tag { font-size: 10px; font-family: ui-monospace, monospace; padding: 0 4px; border-radius: 3px; background: var(--bg-2); color: var(--text-2); margin-left: .3rem; }
  .types { display: flex; flex-direction: column; padding: .3rem 0; gap: .15rem; }
  .type { display: flex; flex-direction: column; align-items: flex-start; gap: .2rem; text-align: left; background: none; border: 1px solid transparent; border-radius: 6px; padding: .4rem .45rem; color: var(--text); width: 100%; }
  .type:hover { background: var(--bg-2); border-color: var(--border); }
  .type.active .gen-title { font-weight: 600; }
  .type-meta { display: flex; flex-wrap: wrap; gap: .2rem; align-items: center; }
  .type-meta .tag { margin-left: 0; }
  .tag.opts { color: var(--primary); }
  .count-badge { font-size: 10px; font-weight: 700; padding: 0 6px; border-radius: 999px; background: var(--primary); color: #fff; }
  .sheet { display: grid; gap: .6rem; max-width: 16cm; }
  .section-head { display: flex; align-items: center; gap: .4rem; padding: .45rem .6rem; border: 1px solid var(--border); border-radius: 8px; background: var(--bg-2); }
  .section-title { flex: 1; min-width: 0; display: grid; gap: .1rem; font-size: 13px; }
  .section-meta { font-size: 11px; color: var(--text-2); }
  .icon { width: 28px; padding: 0; }
  .gen-title { font-size: 12px; min-width: 0; }
  .work { overflow: auto; padding: 14px; min-width: 0; }
  .toolbar, .actions { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; margin-bottom: .75rem; }
  .segment { display: inline-flex; border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
  .segment button { border: none; border-radius: 0; background: var(--bg-2); color: var(--text-2); }
  .segment button.active { background: var(--primary); color: #fff; }
  .check { display: inline-flex; align-items: center; gap: .35rem; font-size: 12px; }
  .check input { width: auto; }
  .summary { color: var(--text-2); font-size: 12px; margin-right: auto; }
  .notice { font-size: 12px; margin: -.25rem 0 .75rem; color: var(--text-2); }
  .notice.error { color: var(--danger); }
  .notice a { color: var(--primary); }
  .cards { display: grid; gap: .6rem; max-width: 16cm; }
  .empty { color: var(--text-2); font-size: 13px; max-width: 34rem; }
  @media (max-width: 760px) {
    .generator { grid-template-columns: 1fr; grid-template-rows: auto 1fr; overflow: auto; }
    .plan { border-right: none; border-bottom: 1px solid var(--border); overflow: visible; }
    .work { overflow: visible; }
  }
</style>
