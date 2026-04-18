<script lang="ts">
  import { slide } from 'svelte/transition';
  import { bank } from '../lib/bank.svelte';
  import { CLASSES, findUnit, findSection } from '../lib/curriculum';
  import { customClasses } from '../lib/custom-classes.svelte';
  import type { Question } from '../lib/types';
  import QuestionEditor from './QuestionEditor.svelte';
  import IngestModal from './IngestModal.svelte';
  import type { DraftQuestion } from '../lib/types';

  let allClasses = $derived([...CLASSES, ...customClasses.classes]);

  // ── Tree selection ───────────────────────────────────────────────────────
  type Selection =
    | { type: 'all' }
    | { type: 'unit'; classId: string; unitId: string }
    | { type: 'section'; classId: string; unitId: string; sectionId: string };

  let selection = $state<Selection>({ type: 'all' });
  let expandedUnits = $state(new Set<string>());

  function toggleUnit(unitId: string) {
    const next = new Set(expandedUnits);
    if (next.has(unitId)) next.delete(unitId);
    else next.add(unitId);
    expandedUnits = next;
  }

  function select(sel: Selection) {
    selection = sel;
    search = '';
  }

  // ── Filtering ────────────────────────────────────────────────────────────
  let search = $state('');

  let filtered = $derived(
    (() => {
      let base = bank.questions;
      if (selection.type === 'unit') {
        base = base.filter((q) => q.classId === selection.classId && q.unitId === selection.unitId);
      } else if (selection.type === 'section') {
        base = base.filter(
          (q) =>
            q.classId === selection.classId &&
            q.unitId === selection.unitId &&
            q.sectionId === selection.sectionId,
        );
      }
      if (search.trim()) {
        const s = search.toLowerCase();
        base = base.filter(
          (q) =>
            q.body.toLowerCase().includes(s) ||
            q.tags.some((t) => t.toLowerCase().includes(s)),
        );
      }
      return base;
    })(),
  );

  // ── Class tab filter ─────────────────────────────────────────────────────
  let classFilter = $state<string | null>(null);

  function setClassFilter(id: string | null) {
    classFilter = id;
    if (id !== null) select({ type: 'all' });
  }

  // When classFilter is active it overrides the sidebar tree; only search still applies.
  let displayQuestions = $derived(
    classFilter === null
      ? filtered
      : bank.questions.filter((q) => {
          if (q.classId !== classFilter) return false;
          if (!search.trim()) return true;
          const s = search.toLowerCase();
          return q.body.toLowerCase().includes(s) || q.tags.some((t) => t.toLowerCase().includes(s));
        }),
  );

  // Question counts for tree badges
  function unitCount(classId: string, unitId: string) {
    return bank.questions.filter((q) => q.classId === classId && q.unitId === unitId).length;
  }
  function sectionCount(classId: string, unitId: string, sectionId: string) {
    return bank.questions.filter(
      (q) => q.classId === classId && q.unitId === unitId && q.sectionId === sectionId,
    ).length;
  }

  // ── Bulk ingest ──────────────────────────────────────────────────────────
  let ingestOpen = $state(false);
  let importToast = $state('');
  let toastTimer: ReturnType<typeof setTimeout> | null = null;

  function handleIngest(drafts: DraftQuestion[]) {
    let count = 0;
    for (const d of drafts) {
      if (!d.body.trim()) continue;
      bank.add({
        body:      d.body.trim(),
        solution:  d.solution.trim() || undefined,
        points:    d.points,
        tags:      d.tagInput.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean),
        classId:   d.classId   || undefined,
        unitId:    d.unitId    || undefined,
        sectionId: d.sectionId || undefined,
      });
      count++;
    }
    ingestOpen = false;
    if (toastTimer) clearTimeout(toastTimer);
    importToast = `Imported ${count} question${count !== 1 ? 's' : ''}`;
    toastTimer = setTimeout(() => (importToast = ''), 3500);
  }

  // ── Editor ───────────────────────────────────────────────────────────────
  let editing = $state<Question | null | 'new'>(null);
  let newInitial = $state<{ classId?: string; unitId?: string; sectionId?: string }>({});

  function openNew() {
    newInitial =
      selection.type === 'section'
        ? { classId: selection.classId, unitId: selection.unitId, sectionId: selection.sectionId }
        : selection.type === 'unit'
          ? { classId: selection.classId, unitId: selection.unitId }
          : {};
    editing = 'new';
  }

  function confirmDelete(q: Question) {
    if (confirm(`Delete question?\n\n"${q.body.slice(0, 80)}..."`)) bank.remove(q.id);
  }

  function truncate(s: string, n = 120): string {
    return s.length > n ? s.slice(0, n) + '…' : s;
  }

  // ── Label helpers ────────────────────────────────────────────────────────
  function sectionLabel(q: Question): string {
    if (!q.classId || !q.unitId) return '';
    const unit = findUnit(q.classId, q.unitId);
    if (!unit) return '';
    if (!q.sectionId) return `Unit ${q.unitId}: ${unit.name}`;
    const sec = findSection(q.classId, q.unitId, q.sectionId);
    return sec ? `${q.sectionId} — ${sec.name}` : q.sectionId;
  }

  // ── Import / Export ──────────────────────────────────────────────────────
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
</script>

<div class="view">
  <!-- ── Sidebar: curriculum tree ────────────────────────────────────── -->
  <nav class="sidebar">
    <div class="tree">
      <!-- "All Questions" root node -->
      <button
        class="tree-node all"
        class:active={selection.type === 'all'}
        onclick={() => select({ type: 'all' })}
      >
        <span class="node-label">All Questions</span>
        <span class="badge">{bank.questions.length}</span>
      </button>

      {#each allClasses as cls}
        <div class="class-group">
          <div class="class-header">{cls.name}</div>

          {#each cls.units as unit}
            {@const expanded = expandedUnits.has(unit.id)}
            {@const uCount = unitCount(cls.id, unit.id)}
            <div class="unit-row">
              <button
                class="tree-node unit"
                class:active={selection.type === 'unit' &&
                  selection.classId === cls.id &&
                  selection.unitId === unit.id}
                onclick={() => select({ type: 'unit', classId: cls.id, unitId: unit.id })}
              >
                <span class="node-label">Unit {unit.id}: {unit.name}</span>
                {#if uCount > 0}<span class="badge">{uCount}</span>{/if}
              </button>
              <button
                class="expand-btn"
                title={expanded ? 'Collapse' : 'Expand sections'}
                onclick={() => toggleUnit(unit.id)}
              >
                {expanded ? '▾' : '▸'}
              </button>
            </div>

            {#if expanded}
              <div class="sections">
                {#each unit.sections as sec}
                  {@const sCount = sectionCount(cls.id, unit.id, sec.id)}
                  <button
                    class="tree-node section"
                    class:active={selection.type === 'section' &&
                      selection.classId === cls.id &&
                      selection.unitId === unit.id &&
                      selection.sectionId === sec.id}
                    onclick={() =>
                      select({
                        type: 'section',
                        classId: cls.id,
                        unitId: unit.id,
                        sectionId: sec.id,
                      })}
                  >
                    <span class="node-label">{sec.id} {sec.name}</span>
                    {#if sCount > 0}<span class="badge dim">{sCount}</span>{/if}
                  </button>
                {/each}
              </div>
            {/if}
          {/each}
        </div>
      {/each}
    </div>
  </nav>

  <!-- ── Main area ───────────────────────────────────────────────────── -->
  <div class="main">
    <div class="toolbar">
      <input
        class="search"
        type="search"
        placeholder="Search questions or tags…"
        bind:value={search}
      />
      <div class="toolbar-actions">
        <button onclick={() => (ingestOpen = true)}>Bulk Import</button>
        <button onclick={importJson}>Import JSON</button>
        <button onclick={downloadJson} disabled={bank.questions.length === 0}>Export JSON</button>
        <button class="primary" onclick={openNew}>+ Add Question</button>
      </div>
    </div>

    {#if allClasses.length > 1}
      <div class="class-tabs">
        <button class:active={classFilter === null} onclick={() => setClassFilter(null)}>All</button>
        {#each allClasses as cls}
          <button class:active={classFilter === cls.id} onclick={() => setClassFilter(cls.id)}>
            {cls.name}
          </button>
        {/each}
      </div>
    {/if}

    <div class="list">
      {#if bank.questions.length === 0}
        <div class="empty">
          <p>No questions yet.</p>
          <button class="primary" onclick={openNew}>Add your first question</button>
        </div>
      {:else if displayQuestions.length === 0}
        <div class="empty">
          <p>No questions match this filter.</p>
        </div>
      {:else}
        {#each displayQuestions as q (q.id)}
          <div class="card" transition:slide={{ duration: 180 }}>
            <div class="card-main">
              <pre class="body">{truncate(q.body)}</pre>
              <div class="meta">
                <span class="pts">{q.points} {q.points === 1 ? 'pt' : 'pts'}</span>
                {#if sectionLabel(q)}
                  <span class="loc">{sectionLabel(q)}</span>
                {/if}
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
      {#if displayQuestions.length !== bank.questions.length}
        &nbsp;· {displayQuestions.length} shown
      {/if}
    </div>
  </div>
</div>

{#if ingestOpen}
  <IngestModal onclose={() => (ingestOpen = false)} onimport={handleIngest} />
{/if}

{#if importToast}
  <div class="toast">{importToast}</div>
{/if}

{#if editing === 'new'}
  <QuestionEditor
    initialClassId={newInitial.classId}
    initialUnitId={newInitial.unitId}
    initialSectionId={newInitial.sectionId}
    onclose={() => (editing = null)}
  />
{:else if editing !== null}
  <QuestionEditor question={editing} onclose={() => (editing = null)} />
{/if}

<style>
  .view {
    display: flex;
    height: 100%;
    overflow: hidden;
  }

  /* ── Sidebar ─────────────────────────────────────────────────────────── */
  .sidebar {
    width: 260px;
    flex-shrink: 0;
    border-right: 1px solid var(--border);
    overflow-y: auto;
    padding: 0.5rem 0;
  }

  .tree {
    display: flex;
    flex-direction: column;
  }

  .class-group {
    margin-bottom: 0.5rem;
  }

  .class-header {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-2);
    padding: 0.5rem 0.75rem 0.25rem;
  }

  .tree-node {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    width: 100%;
    padding: 4px 0.75rem;
    background: none;
    border: none;
    border-radius: 0;
    text-align: left;
    cursor: pointer;
    font-size: 12px;
    color: var(--text);
    transition: background 0.1s;
  }

  .tree-node:hover {
    background: var(--bg-2);
  }

  .tree-node.active {
    background: color-mix(in srgb, var(--primary) 12%, transparent);
    color: var(--primary);
    font-weight: 500;
  }

  .tree-node.all {
    font-weight: 600;
    margin-bottom: 0.25rem;
  }

  .tree-node.unit {
    font-size: 11.5px;
    padding-right: 0.25rem;
  }

  .tree-node.section {
    font-size: 11px;
    color: var(--text-2);
    padding-left: 1.5rem;
  }

  .tree-node.section.active {
    color: var(--primary);
  }

  .node-label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .badge {
    font-size: 10px;
    background: var(--bg-3);
    color: var(--text-2);
    border-radius: 8px;
    padding: 0 5px;
    flex-shrink: 0;
  }

  .badge.dim {
    opacity: 0.6;
  }

  .unit-row {
    display: flex;
    align-items: center;
  }

  .unit-row .tree-node {
    flex: 1;
    min-width: 0;
  }

  .expand-btn {
    flex-shrink: 0;
    padding: 4px 6px;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-2);
    font-size: 10px;
    line-height: 1;
    border-radius: 4px;
  }

  .expand-btn:hover {
    background: var(--bg-2);
    color: var(--text);
  }

  .sections {
    display: flex;
    flex-direction: column;
  }

  /* ── Main area ───────────────────────────────────────────────────────── */
  .main {
    flex: 1;
    display: flex;
    flex-direction: column;
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

  .loc {
    font-size: 11px;
    color: var(--text-2);
    font-style: italic;
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

  .toast {
    position: fixed;
    bottom: 1.5rem;
    left: 50%;
    transform: translateX(-50%);
    background: var(--text);
    color: var(--bg);
    font-size: 13px;
    font-weight: 500;
    padding: 0.5rem 1.1rem;
    border-radius: 20px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
    pointer-events: none;
    z-index: 200;
    animation: toast-in 0.2s ease;
  }

  @keyframes toast-in {
    from { opacity: 0; transform: translateX(-50%) translateY(8px); }
    to   { opacity: 1; transform: translateX(-50%) translateY(0); }
  }

  .class-tabs {
    display: flex;
    gap: 0.35rem;
    padding: 0.5rem 1rem;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    flex-wrap: wrap;
  }
  .class-tabs button {
    padding: 0.2rem 0.65rem;
    border-radius: 100px;
    border: 1px solid var(--border);
    background: none;
    font-size: 12px;
    cursor: pointer;
    color: var(--text-2);
    transition: all 0.15s;
  }
  .class-tabs button.active {
    background: var(--primary);
    border-color: var(--primary);
    color: white;
    font-weight: 500;
  }
</style>
