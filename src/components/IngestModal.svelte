<!--
  Two-stage bulk import modal.
  Stage 1: paste / drag-drop text, choose format + split strategy.
  Stage 2: review/edit each parsed question, bulk-assign curriculum, then import.
-->
<script lang="ts">
  import { CLASSES } from '../lib/curriculum';
  import { latexToTypst, detectFormat } from '../lib/latex-to-typst';
  import type { DraftQuestion } from '../lib/types';

  interface Props {
    onclose: () => void;
    onimport: (questions: DraftQuestion[]) => void;
  }

  let { onclose, onimport }: Props = $props();

  const DRAFT_KEY = 'ingest-draft';

  // ── Stage routing ─────────────────────────────────────────────────────────
  let stage = $state<1 | 2>(1);

  // ── Stage 1 state ─────────────────────────────────────────────────────────
  let rawText      = $state('');
  let format       = $state<'auto' | 'typst' | 'latex'>('auto');
  let splitBy      = $state<'numbered' | 'delimiter' | 'blank'>('numbered');
  let customDelim  = $state('---');
  let isDragOver   = $state(false);
  let hasDraft     = $state(!!sessionStorage.getItem(DRAFT_KEY));

  // ── Stage 2 state ─────────────────────────────────────────────────────────
  let questions    = $state<DraftQuestion[]>([]);
  let selected     = $state(new Set<number>());
  let focusedIdx   = $state(0);

  // Bulk-assign sidebar
  let bulkClassId   = $state(CLASSES[0]?.id ?? '');
  let bulkUnitId    = $state('');
  let bulkSectionId = $state('');
  let bulkPoints    = $state(5);

  let bulkClass    = $derived(CLASSES.find((c) => c.id === bulkClassId));
  let bulkUnits    = $derived(bulkClass?.units ?? []);
  let bulkUnit     = $derived(bulkUnits.find((u) => u.id === bulkUnitId));
  let bulkSections = $derived(bulkUnit?.sections ?? []);

  $effect(() => { if (!bulkUnits.some((u) => u.id === bulkUnitId))    bulkUnitId    = ''; });
  $effect(() => { if (!bulkSections.some((s) => s.id === bulkSectionId)) bulkSectionId = ''; });

  // ── Parsing (stage 1 → stage 2) ──────────────────────────────────────────

  function splitChunks(text: string): string[] {
    if (splitBy === 'numbered') {
      const re = /^(\d+)[.)]\s+/gm;
      const matches = [...text.matchAll(re)];
      if (matches.length === 0) return text.trim() ? [text.trim()] : [];
      return matches.map((m, i) => {
        const start = m.index! + m[0].length;
        const end   = i + 1 < matches.length ? matches[i + 1].index! : text.length;
        return text.slice(start, end).trim();
      }).filter(Boolean);
    }
    if (splitBy === 'delimiter') {
      return text.split(customDelim).map((c) => c.trim()).filter(Boolean);
    }
    // blank lines
    return text.split(/\n{2,}/).map((c) => c.trim()).filter(Boolean);
  }

  let detectedFormat = $derived<'latex' | 'typst'>(
    format === 'auto' ? detectFormat(rawText) : format,
  );

  let parsedPreview = $derived(splitChunks(rawText));

  function buildDraftQuestions(chunks: string[], fmt: 'latex' | 'typst'): DraftQuestion[] {
    return chunks.map((body) => ({
      body:      fmt === 'latex' ? latexToTypst(body) : body,
      points:    bulkPoints,
      tagInput:  '',
      classId:   '',
      unitId:    '',
      sectionId: '',
    }));
  }

  // ── Draft persistence ─────────────────────────────────────────────────────

  function saveDraft(qs: DraftQuestion[]) {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(qs));
  }

  function restoreDraft() {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return;
    try {
      questions  = JSON.parse(raw);
      selected   = new Set();
      focusedIdx = 0;
      stage      = 2;
      hasDraft   = false;
    } catch {
      sessionStorage.removeItem(DRAFT_KEY);
      hasDraft = false;
    }
  }

  function discardDraft() {
    sessionStorage.removeItem(DRAFT_KEY);
    hasDraft = false;
  }

  // Auto-save draft whenever questions change in stage 2
  $effect(() => {
    if (stage === 2 && questions.length > 0) saveDraft(questions);
  });

  // ── Navigation ────────────────────────────────────────────────────────────

  function goToStage2() {
    questions  = buildDraftQuestions(parsedPreview, detectedFormat);
    selected   = new Set();
    focusedIdx = 0;
    stage      = 2;
    hasDraft   = false;
    sessionStorage.removeItem(DRAFT_KEY);
  }

  function goBack() { stage = 1; }

  function doImport() {
    const valid = questions.filter((q) => q.body.trim());
    onimport(valid);
    sessionStorage.removeItem(DRAFT_KEY);
  }

  // ── Stage 2 selection ─────────────────────────────────────────────────────

  function toggleSelect(i: number) {
    const s = new Set(selected);
    s.has(i) ? s.delete(i) : s.add(i);
    selected = s;
  }

  function selectAll()   { selected = new Set(questions.map((_, i) => i)); }
  function deselectAll() { selected = new Set(); }

  function removeSelected() {
    questions  = questions.filter((_, i) => !selected.has(i));
    selected   = new Set();
    focusedIdx = Math.min(focusedIdx, questions.length - 1);
  }

  function removeQuestion(i: number) {
    questions = questions.filter((_, j) => j !== i);
    const s   = new Set<number>();
    for (const idx of selected) { if (idx < i) s.add(idx); else if (idx > i) s.add(idx - 1); }
    selected   = s;
    focusedIdx = Math.min(focusedIdx, questions.length - 1);
  }

  function applyBulkCurriculum() {
    const s = new Set(selected);
    questions = questions.map((q, i) =>
      s.has(i)
        ? { ...q, classId: bulkClassId, unitId: bulkUnitId, sectionId: bulkSectionId }
        : q,
    );
  }

  // ── Keyboard shortcuts (stage 2) ─────────────────────────────────────────

  let cardRefs: HTMLDivElement[] = [];

  function isInputFocused(e: KeyboardEvent): boolean {
    const t = e.target as HTMLElement;
    return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT';
  }

  function handleKeydown(e: KeyboardEvent) {
    if (stage === 1 && e.key === 'Escape') { onclose(); return; }
    if (stage !== 2) return;

    if (e.key === 'Escape') { onclose(); return; }

    if (isInputFocused(e)) return; // let inputs handle their own keys

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusedIdx = Math.min(focusedIdx + 1, questions.length - 1);
      cardRefs[focusedIdx]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusedIdx = Math.max(focusedIdx - 1, 0);
      cardRefs[focusedIdx]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === ' ') {
      e.preventDefault();
      toggleSelect(focusedIdx);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      removeQuestion(focusedIdx);
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
      e.preventDefault();
      selected.size === questions.length ? deselectAll() : selectAll();
    }
  }

  // ── File drag-and-drop ────────────────────────────────────────────────────

  function onDragOver(e: DragEvent)  { e.preventDefault(); isDragOver = true; }
  function onDragLeave()             { isDragOver = false; }
  function onDrop(e: DragEvent) {
    e.preventDefault();
    isDragOver = false;
    const file = e.dataTransfer?.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => { rawText = (ev.target?.result as string) ?? ''; };
    reader.readAsText(file);
  }

  // ── Textarea auto-resize action ───────────────────────────────────────────

  function autoresize(node: HTMLTextAreaElement) {
    function resize() {
      node.style.height = 'auto';
      node.style.height = node.scrollHeight + 'px';
    }
    node.addEventListener('input', resize);
    resize();
    return { destroy() { node.removeEventListener('input', resize); } };
  }

  // ── Derived counts ────────────────────────────────────────────────────────

  let selectedCount = $derived(selected.size);
  let validCount    = $derived(questions.filter((q) => q.body.trim()).length);
</script>

<svelte:window on:keydown={handleKeydown} />

<!-- ── Stage 1 ─────────────────────────────────────────────────────────── -->
{#if stage === 1}
<div class="overlay" role="dialog" aria-modal="true" aria-label="Bulk Import Step 1">
  <div class="modal stage1-modal">

    <header>
      <div class="header-left">
        <span class="step-badge">Step 1 of 2</span>
        <h2>Bulk Import</h2>
      </div>
      <button class="ghost" onclick={onclose} title="Close">✕</button>
    </header>

    <div class="stage1-body">

      {#if hasDraft}
        <div class="draft-banner">
          <span>You have an unsaved import draft.</span>
          <button class="ghost small" onclick={restoreDraft}>Restore</button>
          <button class="ghost small" onclick={discardDraft}>Discard</button>
        </div>
      {/if}

      <!-- Controls row -->
      <div class="controls-row">
        <label class="control-group">
          <span class="control-label">Format</span>
          <select bind:value={format}>
            <option value="auto">Auto-detect</option>
            <option value="typst">Typst</option>
            <option value="latex">LaTeX</option>
          </select>
        </label>

        <label class="control-group">
          <span class="control-label">Split by</span>
          <select bind:value={splitBy}>
            <option value="numbered">Question numbers (1. 2. 3.)</option>
            <option value="delimiter">Custom delimiter</option>
            <option value="blank">Blank lines</option>
          </select>
        </label>

        {#if splitBy === 'delimiter'}
          <label class="control-group">
            <span class="control-label">Delimiter</span>
            <input type="text" bind:value={customDelim} style="width: 8rem;" />
          </label>
        {/if}

        <label class="control-group">
          <span class="control-label">Default pts</span>
          <input type="number" bind:value={bulkPoints} min="0" step="0.5" style="width: 5rem;" />
        </label>
      </div>

      <!-- Paste area -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="drop-zone"
        class:drag-over={isDragOver}
        ondragover={onDragOver}
        ondragleave={onDragLeave}
        ondrop={onDrop}
      >
        <textarea
          class="paste-area"
          placeholder="Paste questions here, or drag and drop a .tex / .txt / .typ file…"
          bind:value={rawText}
          spellcheck="false"
        ></textarea>
        {#if isDragOver}
          <div class="drag-message">Drop file to load</div>
        {/if}
      </div>

      <!-- Status bar -->
      <div class="status-bar">
        {#if rawText.trim() === ''}
          <span class="muted">No content yet</span>
        {:else if parsedPreview.length === 0}
          <span class="warn">No questions detected — try a different split strategy</span>
        {:else}
          <span class="ok">
            {parsedPreview.length} question{parsedPreview.length !== 1 ? 's' : ''} detected
            · format: <strong>{detectedFormat === 'latex' ? 'LaTeX → Typst' : 'Typst'}</strong>
          </span>
        {/if}
      </div>
    </div>

    <footer>
      <button onclick={onclose}>Cancel</button>
      <button
        class="primary"
        disabled={parsedPreview.length === 0}
        onclick={goToStage2}
      >Continue →</button>
    </footer>

  </div>
</div>

<!-- ── Stage 2 ─────────────────────────────────────────────────────────── -->
{:else}
<div class="overlay" role="dialog" aria-modal="true" aria-label="Bulk Import Step 2">
  <div class="modal stage2-modal">

    <header>
      <div class="header-left">
        <span class="step-badge">Step 2 of 2</span>
        <h2>Review & Assign <span class="count-badge">{questions.length}</span></h2>
      </div>
      <div class="header-hint">↑↓ navigate · Space select · Del remove · Ctrl+A all</div>
      <button class="ghost" onclick={onclose} title="Close">✕</button>
    </header>

    <div class="stage2-body">

      <!-- Left sidebar: bulk assign -->
      <aside class="sidebar">
        <p class="sidebar-heading">Bulk Assign</p>

        <div class="sidebar-field">
          <span class="label">Class</span>
          <select bind:value={bulkClassId}>
            <option value="">— none —</option>
            {#each CLASSES as cls}
              <option value={cls.id}>{cls.name}</option>
            {/each}
          </select>
        </div>

        <div class="sidebar-field">
          <span class="label">Unit</span>
          <select bind:value={bulkUnitId} disabled={bulkUnits.length === 0}>
            <option value="">— none —</option>
            {#each bulkUnits as u}
              <option value={u.id}>Unit {u.id}: {u.name}</option>
            {/each}
          </select>
        </div>

        <div class="sidebar-field">
          <span class="label">Section</span>
          <select bind:value={bulkSectionId} disabled={bulkSections.length === 0}>
            <option value="">— none —</option>
            {#each bulkSections as s}
              <option value={s.id}>{s.id} {s.name}</option>
            {/each}
          </select>
        </div>

        <button
          class="primary full-width"
          disabled={selectedCount === 0}
          onclick={applyBulkCurriculum}
        >
          Apply to {selectedCount || 'selected'}
        </button>

        <div class="select-links">
          <button class="link" onclick={selectAll}>Select all</button>
          <span>·</span>
          <button class="link" onclick={deselectAll}>None</button>
        </div>
      </aside>

      <!-- Right: question list -->
      <div class="question-list">
        {#each questions as q, i (i)}
          <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
          <div
            class="q-card"
            class:focused={focusedIdx === i}
            class:checked={selected.has(i)}
            bind:this={cardRefs[i]}
            onclick={() => focusedIdx = i}
          >
            <label class="q-check" onclick={(e) => e.stopPropagation()}>
              <input
                type="checkbox"
                checked={selected.has(i)}
                onchange={() => toggleSelect(i)}
              />
            </label>

            <span class="q-num">{i + 1}</span>

            <div class="q-fields">
              <textarea
                class="q-body"
                bind:value={q.body}
                use:autoresize
                rows={2}
                spellcheck="false"
                placeholder="Question body (Typst markup)"
              ></textarea>

              <div class="q-meta-row">
                <label class="q-meta-field">
                  <span class="label">pts</span>
                  <input type="number" bind:value={q.points} min="0" step="0.5" class="pts-input" />
                </label>
                <label class="q-meta-field" style="flex: 1">
                  <span class="label">tags</span>
                  <input
                    type="text"
                    bind:value={q.tagInput}
                    placeholder="comma-separated"
                    class="tags-input"
                  />
                </label>
              </div>
            </div>

            <button class="ghost remove-btn" onclick={() => removeQuestion(i)} title="Remove">✕</button>
          </div>
        {/each}

        {#if questions.length === 0}
          <div class="empty-list">All questions removed.</div>
        {/if}
      </div>

    </div>

    <footer>
      <button onclick={goBack}>← Back</button>
      <button
        class="danger-ghost"
        disabled={selectedCount === 0}
        onclick={removeSelected}
      >
        Remove {selectedCount > 0 ? `(${selectedCount})` : 'selected'}
      </button>
      <span class="spacer"></span>
      <button
        class="primary"
        disabled={validCount === 0}
        onclick={doImport}
      >
        Import {validCount} question{validCount !== 1 ? 's' : ''} →
      </button>
    </footer>

  </div>
</div>
{/if}

<style>
  /* ── Shared overlay ─────────────────────────────────────────────────── */
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    padding: 1rem;
  }

  .modal {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: 0 8px 40px rgba(0, 0, 0, 0.25);
    display: flex;
    flex-direction: column;
    max-height: calc(100vh - 2rem);
    overflow: hidden;
  }

  header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.85rem 1.25rem;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex: 1;
  }

  header h2 {
    font-size: 15px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .step-badge {
    font-size: 11px;
    font-weight: 500;
    color: var(--primary);
    background: color-mix(in srgb, var(--primary) 12%, transparent);
    border-radius: 4px;
    padding: 0.1rem 0.45rem;
  }

  .count-badge {
    font-size: 12px;
    font-weight: 500;
    color: var(--text-2);
    background: var(--bg-3);
    border-radius: 4px;
    padding: 0.1rem 0.4rem;
  }

  .header-hint {
    font-size: 11px;
    color: var(--text-2);
    white-space: nowrap;
  }

  footer {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1.25rem;
    border-top: 1px solid var(--border);
    flex-shrink: 0;
  }

  .spacer { flex: 1; }

  /* ── Stage 1 ────────────────────────────────────────────────────────── */
  .stage1-modal {
    width: 860px;
    max-width: 100%;
  }

  .stage1-body {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 1rem 1.25rem;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .draft-banner {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: color-mix(in srgb, var(--primary) 8%, transparent);
    border: 1px solid color-mix(in srgb, var(--primary) 25%, transparent);
    border-radius: var(--radius);
    padding: 0.5rem 0.75rem;
    font-size: 13px;
    flex-shrink: 0;
  }

  .draft-banner span { flex: 1; }

  .controls-row {
    display: flex;
    align-items: flex-end;
    gap: 1rem;
    flex-wrap: wrap;
    flex-shrink: 0;
  }

  .control-group {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .control-label {
    font-size: 11px;
    font-weight: 500;
    color: var(--text-2);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .drop-zone {
    flex: 1;
    min-height: 0;
    position: relative;
    border: 1.5px dashed var(--border);
    border-radius: var(--radius);
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .drop-zone.drag-over {
    border-color: var(--primary);
    background: color-mix(in srgb, var(--primary) 6%, transparent);
  }

  .paste-area {
    flex: 1;
    min-height: 320px;
    resize: none;
    border: none;
    background: var(--bg-2);
    font-family: ui-monospace, 'SFMono-Regular', Consolas, monospace;
    font-size: 12.5px;
    line-height: 1.6;
    padding: 0.75rem 1rem;
    color: var(--text);
    outline: none;
    width: 100%;
    box-sizing: border-box;
  }

  .drag-message {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, var(--primary) 8%, transparent);
    font-size: 15px;
    font-weight: 500;
    color: var(--primary);
    pointer-events: none;
  }

  .status-bar {
    font-size: 12.5px;
    flex-shrink: 0;
    padding: 0.1rem 0;
  }

  .muted  { color: var(--text-2); }
  .warn   { color: var(--danger); }
  .ok     { color: var(--text-2); }
  .ok strong { color: var(--text); }

  /* ── Stage 2 ────────────────────────────────────────────────────────── */
  .stage2-modal {
    width: min(1100px, 100%);
    height: calc(100vh - 2rem);
  }

  .stage2-body {
    display: flex;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  /* Sidebar */
  .sidebar {
    width: 230px;
    flex-shrink: 0;
    border-right: 1px solid var(--border);
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
    overflow-y: auto;
  }

  .sidebar-heading {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-2);
    margin: 0;
  }

  .sidebar-field {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .sidebar-field select {
    font-size: 12px;
    width: 100%;
  }

  .full-width { width: 100%; }

  .select-links {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 12px;
    color: var(--text-2);
  }

  /* Question list */
  .question-list {
    flex: 1;
    min-width: 0;
    overflow-y: auto;
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .q-card {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    padding: 0.6rem 0.75rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg);
    cursor: pointer;
    transition: border-color 0.1s;
  }

  .q-card.focused {
    border-color: var(--primary);
    outline: 2px solid color-mix(in srgb, var(--primary) 25%, transparent);
    outline-offset: -1px;
  }

  .q-card.checked {
    background: color-mix(in srgb, var(--primary) 5%, var(--bg));
  }

  .q-check {
    padding-top: 0.2rem;
    flex-shrink: 0;
  }

  .q-num {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-2);
    min-width: 1.5rem;
    padding-top: 0.25rem;
    flex-shrink: 0;
    text-align: right;
  }

  .q-fields {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .q-body {
    width: 100%;
    box-sizing: border-box;
    font-family: ui-monospace, 'SFMono-Regular', Consolas, monospace;
    font-size: 12px;
    line-height: 1.55;
    resize: none;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg-2);
    padding: 0.35rem 0.5rem;
    color: var(--text);
  }

  .q-meta-row {
    display: flex;
    gap: 0.5rem;
    align-items: flex-end;
  }

  .q-meta-field {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .pts-input  { width: 4.5rem; }
  .tags-input { width: 100%; }

  .remove-btn {
    flex-shrink: 0;
    font-size: 11px;
    padding: 0.2rem 0.4rem;
    color: var(--text-2);
    align-self: flex-start;
    margin-top: 0.1rem;
  }

  .empty-list {
    padding: 3rem;
    text-align: center;
    color: var(--text-2);
    font-size: 13px;
  }

  /* ── Misc shared ────────────────────────────────────────────────────── */
  .label {
    display: block;
    font-size: 11px;
    font-weight: 500;
    color: var(--text-2);
  }

  .link {
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    color: var(--primary);
    font-size: 12px;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .link:hover { color: var(--primary-hover); }

  button.small { font-size: 11px; padding: 0.15rem 0.4rem; }

  .danger-ghost {
    background: none;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.3rem 0.75rem;
    font-size: 13px;
    cursor: pointer;
    color: var(--danger);
  }

  .danger-ghost:hover:not(:disabled) { background: color-mix(in srgb, var(--danger) 8%, transparent); }
  .danger-ghost:disabled { opacity: 0.4; cursor: default; }
</style>
