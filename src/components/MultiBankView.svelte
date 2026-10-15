<script lang="ts">
  import { bank } from '../lib/bank.svelte';
  import { narratives } from '../lib/narratives.svelte';
  import { bankWorkspaces } from '../lib/bank-workspaces.svelte';
  import { bankView } from '../lib/bank-switch-view.svelte';
  import { workspaceCatalog } from '../lib/workspace-catalog.svelte';
  import { openInEditor } from '../lib/editor/editor-state.svelte';
  import type { Narrative, Question } from '../lib/types';

  type SourceQuestions = { bankId: string; bankName: string; questions: Question[]; narratives: Narrative[] };
  type SourcedQuestion = { bankId: string; bankName: string; question: Question; narrativeText?: string };

  function rememberedSources(): string[] {
    try {
      const saved = JSON.parse(localStorage.getItem('tg-bank-corpus-selection-v1') ?? 'null');
      if (Array.isArray(saved)) return saved.filter((id): id is string => typeof id === 'string');
    } catch { /* use the active bank as the initial source */ }
    return bankView.activeBankId ? [bankView.activeBankId] : [];
  }
  let selectedBankIds = $state<string[]>(rememberedSources());
  let sources = $state<SourceQuestions[]>([]);
  let loading = $state(false);
  let error = $state('');
  let search = $state('');
  let sortBy = $state<'edited' | 'source' | 'newest'>('edited');
  let pickerOpen = $state(false);
  let picker = $state<HTMLDivElement | null>(null);
  let loadVersion = 0;

  const options = $derived(bankView.banks.filter(entry =>
    entry.id === bankView.activeBankId || !workspaceCatalog.hiddenBankIds.has(entry.id)));

  $effect(() => {
    try { localStorage.setItem('tg-bank-corpus-selection-v1', JSON.stringify(selectedBankIds)); } catch { /* selection remains usable for this visit */ }
  });

  $effect(() => {
    const ids = [...selectedBankIds];
    const activeId = bankView.activeBankId;
    const allBanks = bankView.banks;
    void allBanks;
    const version = ++loadVersion;
    loading = true;
    error = '';
    void Promise.all(ids.map(async bankId => {
      const info = bankView.banks.find(entry => entry.id === bankId);
      if (!info) return null;
      if (bankId === activeId) return { bankId, bankName: info.name, questions: bank.questions, narratives: narratives.narratives } satisfies SourceQuestions;
      const snapshot = await bankWorkspaces.readBankSnapshot(bankId);
      return { bankId, bankName: info.name, questions: snapshot?.questions ?? [], narratives: snapshot?.narratives ?? [] } satisfies SourceQuestions;
    })).then(result => {
      if (version !== loadVersion) return;
      sources = result.filter((source): source is SourceQuestions => source !== null);
      loading = false;
    }).catch(reason => {
      if (version !== loadVersion) return;
      error = reason instanceof Error ? reason.message : String(reason);
      sources = [];
      loading = false;
    });
  });

  const questions = $derived.by(() => {
    const query = search.trim().toLocaleLowerCase();
    const all: SourcedQuestion[] = sources.flatMap(source => source.questions.map(question => ({
      bankId: source.bankId, bankName: source.bankName, question,
      narrativeText: question.narrative ?? source.narratives.find(narrative => narrative.id === question.narrativeId)?.body,
    })));
    const filtered = query ? all.filter(({ question, bankName }) =>
      `${bankName} ${question.body} ${question.solution ?? ''} ${question.answer ?? ''} ${(question.tags ?? []).join(' ')}`
        .toLocaleLowerCase().includes(query)) : all;
    return filtered.sort((a, b) => {
      if (sortBy === 'source') return a.bankName.localeCompare(b.bankName) || a.question.body.localeCompare(b.question.body);
      if (sortBy === 'newest') return b.question.createdAt - a.question.createdAt;
      return (b.question.updatedAt ?? b.question.createdAt) - (a.question.updatedAt ?? a.question.createdAt);
    });
  });

  function toggleBank(id: string, checked: boolean) {
    selectedBankIds = checked ? [...new Set([...selectedBankIds, id])] : selectedBankIds.filter(value => value !== id);
  }

  async function removeQuestion(row: SourcedQuestion) {
    if (!window.confirm(`Delete this question from “${row.bankName}”?\n\nThis cannot be undone.`)) return;
    try {
      if (row.bankId === bankView.activeBankId) bank.remove(row.question.id);
      else await bankWorkspaces.deleteDormantQuestion(row.bankId, row.question.id);
      // Refresh dormant snapshots; the active bank list is reactive.
      selectedBankIds = [...selectedBankIds];
    } catch (reason) {
      error = reason instanceof Error ? reason.message : String(reason);
    }
  }
</script>

<section class="multi-bank-view">
  <header>
    <div>
      <h2>Browse question sources</h2>
      <p>Choose one or more banks to search and edit questions across sources.</p>
    </div>
    <div class="controls">
      <div class="source-picker" bind:this={picker}>
        <button class="source-trigger" aria-expanded={pickerOpen} onclick={() => pickerOpen = !pickerOpen}>
          Sources · {selectedBankIds.length} ▾
        </button>
        {#if pickerOpen}
          <div class="source-menu" role="group" aria-label="Select banks to browse">
            {#each options as option (option.id)}
              <label><input type="checkbox" checked={selectedBankIds.includes(option.id)} onchange={event => toggleBank(option.id, event.currentTarget.checked)} />{option.name}</label>
            {/each}
          </div>
        {/if}
      </div>
      <input type="search" bind:value={search} placeholder="Search selected banks…" aria-label="Search selected banks" />
      <label class="sort">Sort
        <select bind:value={sortBy}>
          <option value="edited">Last edited</option>
          <option value="newest">Newest</option>
          <option value="source">Source</option>
        </select>
      </label>
    </div>
  </header>

  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#if loading}<p class="muted" role="status">Loading selected banks…</p>
  {:else if selectedBankIds.length === 0}<p class="muted">Select at least one bank to browse.</p>
  {:else if questions.length === 0}<p class="muted">No matching questions in the selected banks.</p>
  {:else}
    <div class="result-count">{questions.length} question{questions.length === 1 ? '' : 's'} across {sources.length} source{sources.length === 1 ? '' : 's'}</div>
    <div class="question-list">
      {#each questions as row (`${row.bankId}/${row.question.id}`)}
        <article class="question-card">
          <div class="meta"><span class="source">{row.bankName}</span><span>{row.question.points} pt{row.question.points === 1 ? '' : 's'}</span>
            {#if row.question.tags?.length}<span>{row.question.tags.join(' · ')}</span>{/if}
          </div>
          <pre>{row.question.body}</pre>
          {#if row.question.choices}<div class="choices">{#each Object.entries(row.question.choices) as [letter, choice]}<p><b>{letter}.</b> {choice}</p>{/each}</div>{/if}
          <div class="actions">
            <button onclick={() => openInEditor(row.question, row.bankId, row.narrativeText)}>Edit question</button>
            <button class="delete" onclick={() => void removeQuestion(row)}>Delete</button>
          </div>
        </article>
      {/each}
    </div>
  {/if}
</section>

<style>
  .multi-bank-view { flex: 1; min-width: 0; overflow: auto; padding: 1rem 1.25rem 2rem; display: flex; flex-direction: column; gap: .75rem; }
  header { display: flex; align-items: end; justify-content: space-between; flex-wrap: wrap; gap: .75rem 1rem; }
  h2 { margin: 0; font-size: 18px; }
  header p, .muted { margin: .2rem 0 0; color: var(--text-2); font-size: 12px; }
  .controls { display: flex; align-items: center; flex-wrap: wrap; gap: .45rem; }
  .source-picker { position: relative; }
  .source-trigger, .controls input, .controls select { min-height: 34px; font-size: 12px; }
  .source-menu { position: absolute; top: calc(100% + .25rem); right: 0; z-index: 20; min-width: 220px; max-height: 50vh; overflow: auto; padding: .4rem; border: 1px solid var(--border); border-radius: 8px; background: var(--bg); box-shadow: 0 8px 24px #0002; }
  .source-menu label { display: flex; align-items: center; gap: .5rem; padding: .4rem; font-size: 13px; cursor: pointer; }
  .source-menu input { margin: 0; }
  .sort { display: flex; align-items: center; gap: .35rem; color: var(--text-2); font-size: 12px; }
  .result-count { color: var(--text-2); font-size: 12px; }
  .question-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 420px), 1fr)); gap: .75rem; align-content: start; }
  .question-card { min-width: 0; border: 1px solid var(--border); border-radius: 9px; padding: .75rem; background: var(--bg); }
  .meta { display: flex; flex-wrap: wrap; gap: .3rem .6rem; color: var(--text-2); font-size: 11px; }
  .source { font-weight: 700; color: var(--primary); }
  pre { margin: .6rem 0; font: inherit; font-size: 13px; white-space: pre-wrap; overflow-wrap: anywhere; }
  .choices { font-size: 12px; color: var(--text-2); }
  .choices p { margin: .2rem 0; }
  .actions { display: flex; justify-content: flex-end; gap: .4rem; margin-top: .6rem; }
  .actions button { font-size: 12px; padding: .3rem .65rem; }
  .delete { color: var(--danger, #b91c1c); }
  .error { color: var(--danger, #b91c1c); }
  @media (max-width: 760px) { .multi-bank-view { padding: .75rem; } .controls { width: 100%; } .controls input[type='search'] { flex: 1; min-width: 8rem; } }
</style>
