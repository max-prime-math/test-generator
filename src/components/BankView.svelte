<script lang="ts">
  import { bank } from '../lib/bank.svelte';
  import { CLASSES, DEMO_CLASSES, findUnit, findSection } from '../lib/curriculum';
  import { customClasses } from '../lib/custom-classes.svelte';
  import type { Question } from '../lib/types';
  import QuestionEditor from './QuestionEditor.svelte';
  import IngestModal from './IngestModal.svelte';
  import ClassInfoCard from './ClassInfoCard.svelte';
  import type { DraftQuestion } from '../lib/types';
  import { appState } from '../lib/app-state.svelte';
  import { compileSvg } from '../lib/typst/compiler';
  import { formatBody } from '../lib/question-format';
  import { imageStore, splitFilename } from '../lib/image-store.svelte';

  let allClasses = $derived(appState.demoMode ? [...CLASSES, ...DEMO_CLASSES, ...customClasses.classes] : [...CLASSES, ...customClasses.classes]);

  // ── Sidebar accordion ────────────────────────────────────────────────────
  let openClassId = $state<string | null>(null);

  $effect(() => {
    if (openClassId !== null) return;
    openClassId = allClasses[0]?.id ?? null;
  });

  function toggleClass(id: string) {
    openClassId = openClassId === id ? null : id;
  }

  function selectClass(id: string) {
    if (!openClassId || openClassId !== id) toggleClass(id);
    select({ type: 'class', classId: id });
    appState.lastClassId = id;
  }

  // ── Tree selection ───────────────────────────────────────────────────────
  type Selection =
    | { type: 'all' }
    | { type: 'class'; classId: string }
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
  let typeFilter = $state<'' | 'mcq' | 'frq'>('');
  let graphFilter = $state(false);

  let filtered = $derived(
    (() => {
      const sel = selection;
      let base = bank.questions;
      if (sel.type === 'class') {
        base = base.filter((q) => q.classId === sel.classId);
      } else if (sel.type === 'unit') {
        base = base.filter((q) => q.classId === sel.classId && q.unitId === sel.unitId);
      } else if (sel.type === 'section') {
        base = base.filter(
          (q) =>
            q.classId === sel.classId &&
            q.unitId === sel.unitId &&
            q.sectionId === sel.sectionId,
        );
      }
      if (typeFilter === 'mcq') {
        base = base.filter(isMCQQuestion);
      } else if (typeFilter === 'frq') {
        base = base.filter((q) => !isMCQQuestion(q));
      }
      if (graphFilter) {
        base = base.filter((q) => q.tags.includes('graph'));
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
  let classFilter  = $state<string | null>(null);
  let infoClassId  = $state<string | null>(null);
  let confirmClearClassId = $state<string | null>(null);

  function clearBuiltInClass(classId: string) {
    bank.questions = bank.questions.filter((q) => q.classId !== classId);
    localStorage.setItem('math-test-bank-v2', JSON.stringify(bank.questions));
    confirmClearClassId = null;
    if (classFilter === classId) classFilter = null;
  }

  function isMCQQuestion(q: Question): boolean {
    return (q.choices != null && Object.keys(q.choices).length >= 2) ||
      /^[A-Ea-e]$/.test(q.answer ?? '') ||
      /^[A-Ea-e]$/.test(q.solution ?? '');
  }

  function setClassFilter(id: string | null) {
    classFilter = id;
    if (id !== null) { select({ type: 'all' }); appState.lastClassId = id; }
  }

  // When classFilter is active it overrides the sidebar tree; search and type filter still apply.
  let displayQuestions = $derived(
    classFilter === null
      ? filtered
      : bank.questions.filter((q) => {
          if (q.classId !== classFilter) return false;
          if (typeFilter === 'mcq' && !isMCQQuestion(q)) return false;
          if (typeFilter === 'frq' && isMCQQuestion(q)) return false;
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
  let ingestOpen  = $state(false);
  let importToast = $state('');
  let toastTimer: ReturnType<typeof setTimeout> | null = null;

  function handleIngest(drafts: DraftQuestion[]) {
    let count = 0;
    for (const d of drafts) {
      if (!d.body.trim()) continue;
      bank.add({
        body:      d.body.trim(),
        answer:    d.answer?.trim() || undefined,
        solution:  d.solution.trim() || undefined,
        choices:   d.choices && Object.keys(d.choices).length >= 2 ? d.choices : undefined,
        points:    d.points,
        tags:      d.tagInput.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean),
        images:    d.images && d.images.length > 0 ? d.images : undefined,
        questionType: d.questionType,
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

  // ── Question preview ─────────────────────────────────────────────────────
  let selectedQ        = $state<Question | null>(null);
  let previewSvg       = $state<string | null>(null);
  let previewError     = $state<string | null>(null);
  let previewBusy      = $state(false);
  let sidebarCollapsed = $state(false);
  let sidebarWidth     = $state(260);
  let previewWidth     = $state(480);

  function startResize(which: 'sidebar' | 'preview', e: MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = which === 'sidebar' ? sidebarWidth : previewWidth;
    function onMove(ev: MouseEvent) {
      const dx = ev.clientX - startX;
      if (which === 'sidebar') sidebarWidth = Math.max(140, Math.min(520, startW + dx));
      else previewWidth = Math.max(280, Math.min(900, startW - dx));
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function checkDark(): boolean {
    const t = document.documentElement.getAttribute('data-theme');
    return t === 'dark' || (t !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }
  let isDark = $state(checkDark());

  $effect(() => {
    const obs = new MutationObserver(() => { isDark = checkDark(); });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  });

  function previewSource(q: Question): string {
    const bg   = isDark ? '#1c1c1e' : '#ffffff';
    const fg   = isDark ? '#f5f5f7' : '#000000';
    const body = q.choices && Object.keys(q.choices).length >= 2
      ? formatBody(q.body, q.choices)
      : q.body;

    let preview = `#import "@preview/simple-plot:0.3.0": plot
#set page(width: 14cm, height: auto, margin: 0.75cm, fill: rgb("${bg}"))
#set text(font: "New Computer Modern", size: 15pt, fill: rgb("${fg}"))
#set par(justify: false)

${body}`;

    // Add answer if present
    if (q.answer) {
      preview += `\n\n*Answer:* ${q.answer}`;
    }

    // Add solution if present
    if (q.solution) {
      preview += `\n\n*Solution:*\n${q.solution}`;
    }

    return preview;
  }

  $effect(() => {
    const q = selectedQ;
    const dark = isDark;
    if (!q) { previewSvg = null; previewError = null; previewBusy = false; return; }
    previewBusy = true;
    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled) return;
      const src = previewSource(q);
      compileSvg(src).then(result => {
        if (cancelled) return;
        previewBusy = false;
        if (result.svg) previewSvg = result.svg;
        else previewError = result.error ?? 'Error';
      });
    }, 120);
    return () => { cancelled = true; clearTimeout(timer); };
  });

  function selectQ(q: Question) {
    selectedQ = selectedQ?.id === q.id ? null : q;
  }

  function navigate(delta: number) {
    if (!displayQuestions.length) return;
    const idx = selectedQ ? displayQuestions.findIndex(q => q.id === selectedQ!.id) : -1;
    const next = idx === -1
      ? (delta > 0 ? 0 : displayQuestions.length - 1)
      : Math.max(0, Math.min(displayQuestions.length - 1, idx + delta));
    const q = displayQuestions[next];
    if (!q) return;
    selectedQ = q;
    setTimeout(() => {
      document.querySelector(`[data-qid="${q.id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, 0);
  }

  function onkeydown(e: KeyboardEvent) {
    if (editing || ingestOpen || infoClassId) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key === 'j' || e.key === 'ArrowDown') { e.preventDefault(); navigate(1); }
    else if (e.key === 'k' || e.key === 'ArrowUp') { e.preventDefault(); navigate(-1); }
    else if (e.key === 'Escape') { selectedQ = null; }
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

  function unitLabel(unit: { id: string; name: string }): string {
    return /^\d+$/.test(unit.id) ? `Unit ${unit.id}: ${unit.name}` : unit.name;
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

<svelte:window onkeydown={onkeydown} />

<div class="view">
  <!-- ── Sidebar: curriculum tree ────────────────────────────────────── -->
  <nav class="sidebar" class:collapsed={sidebarCollapsed} style="width: {sidebarCollapsed ? 0 : sidebarWidth}px">
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
        {@const clsOpen = openClassId === cls.id}
        <div class="class-group">
          <div class="class-header">
            <button class="expand-btn" onclick={() => toggleClass(cls.id)} title={clsOpen ? 'Collapse' : 'Expand'}>
              {clsOpen ? '▾' : '▸'}
            </button>
            <button
              class="class-name-btn"
              class:active={selection.type === 'class' && selection.classId === cls.id}
              onclick={() => { if (!clsOpen) toggleClass(cls.id); selectClass(cls.id); }}
            >
              {cls.name}
            </button>
            <button class="class-info-btn" onclick={(e) => { e.stopPropagation(); infoClassId = cls.id; }} title="Class info / rename">ⓘ</button>
          </div>

          {#if clsOpen}
          <div>
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
                <span class="node-label">{unitLabel(unit)}</span>
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
          {/if}
        </div>
      {/each}
    </div>
  </nav>

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="resize-handle" onmousedown={(e) => startResize('sidebar', e)}></div>

  <!-- ── Main area ───────────────────────────────────────────────────── -->
  <div class="main">
    <div class="toolbar">
      <button class="ghost icon-btn" title="Toggle sidebar" onclick={() => sidebarCollapsed = !sidebarCollapsed}>
        {sidebarCollapsed ? '▶' : '◀'}
      </button>
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

    {#if confirmClearClassId}
      {@const cls = allClasses.find(c => c.id === confirmClearClassId)}
      <div class="clear-confirm">
        <span>Remove all {cls?.name} questions? This cannot be undone.</span>
        <div class="confirm-actions">
          <button class="ghost" onclick={() => confirmClearClassId = null}>Cancel</button>
          <button class="danger" onclick={() => clearBuiltInClass(confirmClearClassId!)}>Remove all</button>
        </div>
      </div>
    {:else if classFilter && CLASSES.find(c => c.id === classFilter)}
      <div class="clear-bar">
        <span class="clear-hint">These are bundled starter questions — they are not synced to GitHub.</span>
        <button class="danger ghost" onclick={() => confirmClearClassId = classFilter}>Remove all questions…</button>
      </div>
    {/if}

    <div class="type-tabs">
      <button class:active={typeFilter === ''} onclick={() => typeFilter = ''}>All Types</button>
      <button class:active={typeFilter === 'mcq'} onclick={() => typeFilter = 'mcq'}>MCQ</button>
      <button class:active={typeFilter === 'frq'} onclick={() => typeFilter = 'frq'}>FRQ</button>
      <button class:active={graphFilter} onclick={() => graphFilter = !graphFilter}>Graph</button>
    </div>

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
          <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
          <div
            class="card"
            class:selected={selectedQ?.id === q.id}
            data-qid={q.id}
            onclick={() => selectQ(q)}
          >
            <div class="card-main">
              <pre class="body">{truncate(q.body)}</pre>
              <div class="meta">
                <span class="pts">{q.points} {q.points === 1 ? 'pt' : 'pts'}</span>
                {#if q.choices && Object.keys(q.choices).length >= 2}
                  <span class="badge-mc">MC</span>
                {:else if q.solution && /^[A-Ea-e]$/.test(q.solution)}
                  <span class="badge-mc">MC</span>
                {/if}
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

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="resize-handle" onmousedown={(e) => startResize('preview', e)} class:hidden={!selectedQ}></div>

  <!-- ── Preview panel ──────────────────────────────────────────────── -->
  <div class="preview-panel" class:hidden={!selectedQ} style="flex-basis: {previewWidth}px">
    {#if !selectedQ}
      <div class="preview-empty">Click a question to preview</div>
    {:else if previewBusy && !previewSvg}
      <div class="preview-empty">
        <div class="spinner"></div>
      </div>
    {:else if previewSvg}
      <div class="preview-svg" class:stale={previewBusy}>
        {@html previewSvg}
      </div>
    {:else if previewError}
      <div class="preview-empty error">{previewError}</div>
    {/if}
  </div>
</div>

{#if ingestOpen}
  <IngestModal onclose={() => (ingestOpen = false)} onimport={handleIngest} />
{/if}

{#if infoClassId}
  <ClassInfoCard classId={infoClassId} onclose={() => infoClassId = null} />
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
    flex-shrink: 0;
    border-right: 1px solid var(--border);
    overflow-y: auto;
    overflow-x: hidden;
    padding: 0.5rem 0;
    transition: width 0.2s ease, border-color 0.2s ease, padding 0.2s ease;
  }

  .sidebar.collapsed {
    width: 0 !important;
    padding: 0;
    border-right-color: transparent;
  }

  .resize-handle {
    width: 5px;
    flex-shrink: 0;
    cursor: col-resize;
    background: transparent;
    transition: background 0.15s;
    z-index: 1;
  }

  .resize-handle:hover, .resize-handle:active {
    background: var(--primary);
    opacity: 0.4;
  }

  .resize-handle.hidden {
    display: none;
  }

  .tree {
    display: flex;
    flex-direction: column;
  }

  .class-group {
    margin-bottom: 0.5rem;
  }

  .class-header {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-2);
    padding: 0.5rem 0.75rem 0.25rem;
    user-select: none;
  }
  .class-header > .expand-btn {
    flex-shrink: 0;
    padding: 4px 2px;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-2);
    font-size: 9px;
    line-height: 1;
    border-radius: 4px;
  }
  .class-header > .expand-btn:hover {
    background: var(--bg-2);
    color: var(--text);
  }
  .class-name-btn {
    flex: 1;
    background: none;
    border: none;
    padding: 4px 0;
    cursor: pointer;
    color: var(--text-2);
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    text-align: left;
    border-radius: 4px;
    transition: background 0.1s, color 0.1s;
  }
  .class-name-btn:hover {
    background: var(--bg-2);
    color: var(--text);
  }
  .class-name-btn.active {
    color: var(--primary);
  }

  .class-info-btn {
    width: 16px;
    height: 16px;
    padding: 0;
    background: none;
    border: none;
    border-radius: 50%;
    color: var(--text-2);
    font-size: 12px;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.15s;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .class-group:hover .class-info-btn { opacity: 0.5; }
  .class-info-btn:hover { opacity: 1 !important; background: var(--bg-2); }

  .tree-node {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    width: 100%;
    padding: 5px 0.75rem;
    background: none;
    border: none;
    border-radius: 0;
    text-align: left;
    cursor: pointer;
    font-size: 13px;
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
    font-size: 13px;
    padding-right: 0.25rem;
  }

  .tree-node.section {
    font-size: 12px;
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
    font-size: 11px;
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

  .icon-btn {
    width: 28px;
    height: 28px;
    padding: 0;
    flex-shrink: 0;
    font-size: 11px;
    color: var(--text-2);
  }

  .search {
    flex: 1;
    max-width: 320px;
  }

  .toolbar-actions {
    display: flex;
    gap: 0.5rem;
    margin-left: auto;
    font-size: 13px;
  }

  .toolbar-actions button { font-size: 13px; }

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

  .card.selected {
    border-color: var(--primary);
    background: color-mix(in srgb, var(--primary) 5%, var(--bg-2));
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
    font-size: 13px;
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
    font-size: 12px;
    font-weight: 600;
    color: var(--text-2);
    background: var(--bg-3);
    border-radius: 4px;
    padding: 1px 6px;
  }

  .loc {
    font-size: 12px;
    color: var(--text-2);
    font-style: italic;
  }

  .badge-mc {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--primary);
    background: color-mix(in srgb, var(--primary) 12%, transparent);
    border-radius: 3px;
    padding: 1px 5px;
  }

  .tag {
    font-size: 12px;
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

  /* ── Preview panel ───────────────────────────────────────────────────── */
  .preview-panel {
    flex: 0 0 480px;
    min-width: 0;
    border-left: 1px solid var(--border);
    overflow-y: auto;
    background: var(--bg);
    display: flex;
    flex-direction: column;
    transition: flex-basis 0.2s ease, border-color 0.2s ease;
  }

  .preview-panel.hidden {
    flex-basis: 0 !important;
    border-left-color: transparent;
    overflow: hidden;
  }

  .preview-empty {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    color: var(--text-2);
    padding: 2rem;
    text-align: center;
    gap: 0.5rem;
  }

  .preview-empty.error {
    color: var(--danger);
    font-size: 11px;
    align-items: flex-start;
    white-space: pre-wrap;
    word-break: break-all;
  }

  .preview-svg {
    padding: 0.75rem;
    transition: opacity 0.15s;
  }

  .preview-svg.stale { opacity: 0.45; }

  .preview-svg :global(svg) {
    display: block;
    width: 100%;
    height: auto;
    box-shadow: 0 1px 8px rgba(0, 0, 0, 0.3);
    border-radius: 4px;
  }

  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid var(--border);
    border-top-color: var(--primary);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
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

  .type-tabs {
    display: flex;
    gap: 0.35rem;
    padding: 0.5rem 1rem;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  .type-tabs button {
    padding: 0.2rem 0.65rem;
    border-radius: 100px;
    border: 1px solid var(--border);
    background: none;
    font-size: 12px;
    cursor: pointer;
    color: var(--text-2);
    transition: all 0.15s;
  }
  .type-tabs button:hover {
    border-color: var(--primary);
    color: var(--primary);
  }
  .type-tabs button.active {
    background: var(--primary);
    border-color: var(--primary);
    color: white;
    font-weight: 500;
  }

  .clear-bar {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.375rem 1rem;
    background: color-mix(in srgb, var(--bg-2) 50%, transparent);
    border-bottom: 1px solid var(--border);
    font-size: 12px;
  }

  .clear-hint {
    flex: 1;
    color: var(--text-2);
  }

  .clear-confirm {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem 1rem;
    background: color-mix(in srgb, var(--danger) 6%, var(--bg-2));
    border-bottom: 1px solid color-mix(in srgb, var(--danger) 20%, var(--border));
    font-size: 13px;
    color: var(--text);
  }

  .confirm-actions {
    display: flex;
    gap: 0.375rem;
    margin-left: auto;
    flex-shrink: 0;
  }

</style>
