<script lang="ts">
  import type { Class } from '../lib/types';
  import type { TestUsageRecord, TestUsageSelection } from '../lib/test-usage-filter';
  import { emptyTestUsageSelection } from '../lib/test-usage-filter';

  let {
    classes,
    records,
    selection = $bindable(),
  }: {
    classes: Class[];
    records: TestUsageRecord[];
    selection: TestUsageSelection;
  } = $props();

  let query = $state('');
  const normalizedQuery = $derived(query.trim().toLocaleLowerCase());
  const matches = (values: Array<string | null>) => !normalizedQuery
    || values.some((value) => value?.toLocaleLowerCase().includes(normalizedQuery));
  const uniqueQuestionCount = (items: TestUsageRecord[]) => new Set(items.flatMap((item) => item.questionIds)).size;
  const formatDate = (timestamp: number) => new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(timestamp);

  let classGroups = $derived(classes
    .map((course) => ({ course, records: records.filter((record) => record.classId === course.id) }))
    .filter(({ course, records: items }) => items.length > 0 && matches([course.name, ...items.flatMap((item) => [item.name, item.gradebookSectionName])])));
  let unclassifiedTests = $derived(records.filter((record) => record.kind === 'saved-test' && !record.classId && matches([record.name])));
  let sectionGroups = $derived.by(() => {
    const sections = new Map<string, { id: string; name: string; records: TestUsageRecord[] }>();
    for (const record of records) {
      if (!record.gradebookSectionId || !record.gradebookSectionName) continue;
      const group = sections.get(record.gradebookSectionId) ?? {
        id: record.gradebookSectionId,
        name: record.gradebookSectionName,
        records: [],
      };
      group.records.push(record);
      sections.set(group.id, group);
    }
    return [...sections.values()]
      .filter((group) => matches([group.name, ...group.records.map((record) => record.name)]))
      .sort((left, right) => left.name.localeCompare(right.name));
  });

  function setMode(mode: TestUsageSelection['mode']) {
    selection = { ...emptyTestUsageSelection(), mode };
    if (mode !== 'specific') query = '';
  }

  function toggle(key: 'classIds' | 'gradebookSectionIds' | 'savedTestIds' | 'assessmentIds', id: string) {
    const values = selection[key];
    selection = {
      ...selection,
      mode: 'specific',
      [key]: values.includes(id) ? values.filter((value) => value !== id) : [...values, id],
    };
  }

  const recordKey = (record: TestUsageRecord) => record.kind === 'saved-test' ? 'savedTestIds' : 'assessmentIds';
  const recordSelected = (record: TestUsageRecord) => selection[recordKey(record)].includes(record.id);
  const recordCovered = (record: TestUsageRecord) =>
    (record.classId != null && selection.classIds.includes(record.classId))
    || (record.gradebookSectionId != null && selection.gradebookSectionIds.includes(record.gradebookSectionId));
</script>

<fieldset class="usage-filter">
  <legend>Used on tests</legend>
  <div class="usage-modes" role="radiogroup" aria-label="Exclude questions used on tests">
    <label><input type="radio" name="test-usage-mode" checked={selection.mode === 'none'} onchange={() => setMode('none')} />Don't exclude</label>
    <label><input type="radio" name="test-usage-mode" checked={selection.mode === 'any'} onchange={() => setMode('any')} />Any other active test</label>
    <label><input type="radio" name="test-usage-mode" checked={selection.mode === 'specific'} onchange={() => setMode('specific')} />Specific tests or groups</label>
  </div>

  {#if selection.mode === 'specific'}
    <input class="usage-search" type="search" placeholder="Find a class, section, or test…" aria-label="Find tests to exclude" bind:value={query} />
    <div class="usage-tree">
      {#if classGroups.length || unclassifiedTests.length}
        <h4>Classes and saved tests</h4>
        {#each classGroups as group (group.course.id)}
          <div class="usage-group">
            <label class="usage-option usage-parent">
              <input type="checkbox" checked={selection.classIds.includes(group.course.id)} onchange={() => toggle('classIds', group.course.id)} />
              <span>{group.course.name}</span><small>{uniqueQuestionCount(group.records)}</small>
            </label>
            {#each group.records as record (`${record.kind}:${record.id}`)}
              <label class="usage-option usage-child">
                <input type="checkbox" checked={recordSelected(record) || recordCovered(record)} disabled={recordCovered(record)} onchange={() => toggle(recordKey(record), record.id)} />
                <span>{record.name}<small>{record.kind === 'assessment' ? `Gradebook · ${record.gradebookSectionName} · ` : ''}{formatDate(record.date)}</small></span>
                <small>{record.questionIds.length}</small>
              </label>
            {/each}
          </div>
        {/each}
        {#if unclassifiedTests.length}
          <div class="usage-group">
            <div class="usage-option usage-parent"><span>Unclassified</span></div>
            {#each unclassifiedTests as record (record.id)}
              <label class="usage-option usage-child">
                <input type="checkbox" checked={recordSelected(record)} onchange={() => toggle('savedTestIds', record.id)} />
                <span>{record.name}<small>{formatDate(record.date)}</small></span><small>{record.questionIds.length}</small>
              </label>
            {/each}
          </div>
        {/if}
      {/if}

      {#if sectionGroups.length}
        <h4>Gradebook sections</h4>
        {#each sectionGroups as group (group.id)}
          <div class="usage-group">
            <label class="usage-option usage-parent">
              <input type="checkbox" checked={selection.gradebookSectionIds.includes(group.id)} onchange={() => toggle('gradebookSectionIds', group.id)} />
              <span>{group.name}</span><small>{uniqueQuestionCount(group.records)}</small>
            </label>
            {#each group.records as record (record.id)}
              <label class="usage-option usage-child">
                <input type="checkbox" checked={recordSelected(record) || recordCovered(record)} disabled={recordCovered(record)} onchange={() => toggle('assessmentIds', record.id)} />
                <span>{record.name}<small>{formatDate(record.date)}</small></span><small>{record.questionIds.length}</small>
              </label>
            {/each}
          </div>
        {/each}
      {/if}

      {#if !classGroups.length && !unclassifiedTests.length && !sectionGroups.length}
        <p class="usage-empty">{records.length ? 'No classes, sections, or tests match.' : 'No other active tests yet.'}</p>
      {/if}
    </div>
    <p class="usage-note">Counts show unique questions. Selected groups and tests combine.</p>
  {/if}
</fieldset>

<style>
  .usage-filter {
    grid-column: 1 / -1;
    min-width: 0;
    margin: 0;
    padding: 8px;
    border: 1px solid var(--border);
    border-radius: 6px;
  }
  .usage-filter legend { font-size: 12px; font-weight: 600; }
  .usage-modes { display: flex; flex-wrap: wrap; gap: 0.35rem 0.8rem; }
  .usage-modes label, .usage-option { font-size: 12px; cursor: pointer; }
  .usage-modes input, .usage-option input { width: auto; margin: 0; flex: none; }
  .usage-modes label { display: flex; align-items: center; gap: 0.35rem; }
  .usage-search { width: 100%; margin-top: 0.6rem; padding: 0.3rem 0.45rem; font-size: 12px; }
  .usage-tree { max-height: 310px; overflow-y: auto; margin-top: 0.35rem; }
  .usage-tree h4 { margin: 0.65rem 0 0.2rem; color: var(--text-2); font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
  .usage-group { border-top: 1px solid var(--border); }
  .usage-option { display: flex; align-items: center; gap: 0.45rem; padding: 0.3rem 0.35rem; border-radius: 5px; }
  .usage-option:hover { background: var(--bg-2); }
  .usage-option > span { flex: 1; min-width: 0; }
  .usage-option small { display: block; color: var(--text-2); font-size: 10px; font-weight: 400; }
  .usage-option > small { flex: none; }
  .usage-parent { font-weight: 600; }
  .usage-child { padding-left: 1.25rem; }
  .usage-note, .usage-empty { margin: 0.5rem 0 0; color: var(--text-2); font-size: 11px; }
</style>
