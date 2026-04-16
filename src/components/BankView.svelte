<script lang="ts">
  import { bank } from '../lib/bank.svelte';
  import type { Question } from '../lib/types';
  import QuestionEditor from './QuestionEditor.svelte';

  let search = $state('');
  let editing = $state<Question | null | 'new'>(null);  // null=closed, 'new'=add, Question=edit

  let filtered = $derived(
    search.trim()
      ? bank.questions.filter(
          (q) =>
            q.body.toLowerCase().includes(search.toLowerCase()) ||
            q.tags.some((t) => t.includes(search.toLowerCase())),
        )
      : bank.questions,
  );

  function downloadJson() {
    const blob = new Blob([bank.exportJson()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'question-bank.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function importJson() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const text = await file.text();
      const result = bank.importJson(text);
      alert(`Imported ${result.imported} question(s). Errors: ${result.errors}`);
    };
    input.click();
  }

  function confirmDelete(q: Question) {
    if (confirm(`Delete question?\n\n"${q.body.slice(0, 80)}..."`)) {
      bank.remove(q.id);
    }
  }

  function truncate(s: string, n = 120): string {
    return s.length > n ? s.slice(0, n) + '…' : s;
  }
</script>

<div class="view">
  <div class="toolbar">
    <input
      class="search"
      type="search"
      placeholder="Search questions or tags…"
      bind:value={search}
    />
    <div class="toolbar-actions">
      <button onclick={importJson}>Import JSON</button>
      <button onclick={downloadJson} disabled={bank.questions.length === 0}>Export JSON</button>
      <button class="primary" onclick={() => (editing = 'new')}>+ Add Question</button>
    </div>
  </div>

  <div class="list">
    {#if bank.questions.length === 0}
      <div class="empty">
        <p>No questions yet.</p>
        <button class="primary" onclick={() => (editing = 'new')}>Add your first question</button>
      </div>
    {:else if filtered.length === 0}
      <div class="empty">
        <p>No questions match "<strong>{search}</strong>".</p>
      </div>
    {:else}
      {#each filtered as q (q.id)}
        <div class="card">
          <div class="card-main">
            <pre class="body">{truncate(q.body)}</pre>
            <div class="meta">
              <span class="pts">{q.points} {q.points === 1 ? 'pt' : 'pts'}</span>
              {#each q.tags as tag}
                <span class="tag">{tag}</span>
              {/each}
            </div>
          </div>
          <div class="card-actions">
            <button class="ghost" onclick={() => (editing = q)}>Edit</button>
            <button class="ghost danger" onclick={() => confirmDelete(q)}>Delete</button>
          </div>
        </div>
      {/each}
    {/if}
  </div>

  <div class="status">
    {bank.questions.length} question{bank.questions.length !== 1 ? 's' : ''} in bank
    {#if search && filtered.length !== bank.questions.length}
      &nbsp;· {filtered.length} shown
    {/if}
  </div>
</div>

{#if editing === 'new'}
  <QuestionEditor onclose={() => (editing = null)} />
{:else if editing !== null}
  <QuestionEditor question={editing} onclose={() => (editing = null)} />
{/if}

<style>
  .view {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .toolbar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .search {
    flex: 1;
    max-width: 320px;
  }

  .toolbar-actions {
    display: flex;
    gap: 0.5rem;
    margin-left: auto;
  }

  .list {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    height: 200px;
    color: var(--text-2);
  }

  .card {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    transition: border-color 0.1s;
  }

  .card:hover {
    border-color: var(--primary);
  }

  .card-main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .body {
    white-space: pre-wrap;
    word-break: break-word;
    font-size: 12px;
    line-height: 1.5;
    color: var(--text);
  }

  .meta {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex-wrap: wrap;
  }

  .pts {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-2);
    background: var(--bg-3);
    border-radius: 4px;
    padding: 1px 6px;
  }

  .tag {
    font-size: 11px;
    color: var(--primary);
    background: color-mix(in srgb, var(--primary) 10%, transparent);
    border-radius: 4px;
    padding: 1px 6px;
  }

  .card-actions {
    display: flex;
    gap: 0.25rem;
    flex-shrink: 0;
  }

  .status {
    padding: 0.4rem 1rem;
    font-size: 11px;
    color: var(--text-2);
    border-top: 1px solid var(--border);
    flex-shrink: 0;
  }
</style>
