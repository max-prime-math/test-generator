<!--
  Modal for adding or editing a question.
  Pass `question` prop to enter edit mode; omit for add mode.
  Pass `initialClassId` / `initialUnitId` / `initialSectionId` to pre-fill curriculum when adding.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { compileSvg, findDelimiterIssues } from '../lib/typst/compiler';
  import { formatBody } from '../lib/question-format';
  import { getThemeColors } from '../lib/theme-colors';
  import { bank } from '../lib/bank.svelte';
  import { CLASSES, DEMO_CLASSES } from '../lib/curriculum';
  import { customClasses } from '../lib/custom-classes.svelte';
  import { appState } from '../lib/app-state.svelte';
  import { scanImageRefs } from '../lib/typst/image-shadow';
  import type { Question } from '../lib/types';

  interface Props {
    question?: Question;          // undefined = add mode
    initialClassId?: string;
    initialUnitId?: string;
    initialSectionId?: string;
    onclose: () => void;
  }

  let { question, initialClassId, initialUnitId, initialSectionId, onclose }: Props = $props();

  const CHOICE_LETTERS = ['A', 'B', 'C', 'D', 'E'] as const;

  // Form state — seeded from question prop (edit) or initial* props (new).
  let body     = $state(untrack(() => question?.body ?? ''));
  let answer   = $state(untrack(() => question?.answer ?? ''));
  let solution = $state(untrack(() => question?.solution ?? ''));
  let points   = $state(untrack(() => question?.points ?? 5));
  let tagInput = $state(untrack(() => question?.tags.join(', ') ?? ''));

  // MCQ choices: keyed by letter, value is choice text (empty = not set)
  let choices  = $state<Record<string, string>>(
    untrack(() => ({ A: '', B: '', C: '', D: '', E: '', ...question?.choices }))
  );

  let filledLetters = $derived(CHOICE_LETTERS.filter(l => choices[l]?.trim()));
  let isMCQ = $derived(filledLetters.length >= 2);

  // All classes including custom classes
  let allClasses = $derived(
    appState.demoMode
      ? [...CLASSES, ...DEMO_CLASSES, ...customClasses.classes]
      : [...CLASSES, ...customClasses.classes]
  );

  // Curriculum — init with proper class list
  const _initClasses = appState.demoMode
    ? [...CLASSES, ...DEMO_CLASSES, ...customClasses.classes]
    : [...CLASSES, ...customClasses.classes];
  let classId   = $state(untrack(() => question?.classId ?? initialClassId ?? _initClasses[0]?.id ?? ''));
  let unitId    = $state(untrack(() => question?.unitId ?? initialUnitId ?? ''));
  let sectionId = $state(untrack(() => question?.sectionId ?? initialSectionId ?? ''));

  // New unit/section creation
  let creatingUnit = $state(false);
  let newUnitInput = $state('');
  let creatingSection = $state(false);
  let newSectionInput = $state('');

  function addNewUnit() {
    if (!classId || !newUnitInput.trim()) return;
    const unit = customClasses.addUnit(classId, newUnitInput.trim());
    unitId = unit.id;
    creatingUnit = false;
    newUnitInput = '';
  }

  function addNewSection() {
    if (!classId || !unitId || !newSectionInput.trim()) return;
    const sec = customClasses.addSection(classId, unitId, newSectionInput.trim());
    sectionId = sec.id;
    creatingSection = false;
    newSectionInput = '';
  }

  let error = $state('');

  // Live delimiter scan — checks body, solution, and every choice field.
  // Only active when the question has a stored render error.
  // Returns { field, pos } or null if nothing found.
  let liveHit = $derived.by((): { field: string; pos: string } | null => {
    if (!question?.renderError) return null;
    const bp = findDelimiterIssues(body);
    if (bp) return { field: 'body', pos: bp };
    const sp = findDelimiterIssues(solution);
    if (sp) return { field: 'solution / explanation', pos: sp };
    for (const letter of ['A', 'B', 'C', 'D', 'E'] as const) {
      const text = choices[letter]?.trim();
      if (!text) continue;
      const cp = findDelimiterIssues(text);
      if (cp) return { field: `choice ${letter}`, pos: cp };
    }
    return null;
  });

  // True when the stored error already includes a line/col position from the bulk check.
  let storedHasPosition = $derived(!!question?.renderError?.includes('\nLine '));

  // ── Live preview ──────────────────────────────────────────────────────────
  let currentTheme = $state(document.documentElement.getAttribute('data-theme') ?? 'auto');
  let prefersDark  = $state(window.matchMedia('(prefers-color-scheme: dark)').matches);

  $effect(() => {
    const obs = new MutationObserver(() => {
      currentTheme = document.documentElement.getAttribute('data-theme') ?? 'auto';
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  });

  let previewSvg   = $state<string | null>(null);
  let previewError = $state<string | null>(null);
  let previewBusy  = $state(false);
  let previewMs    = $state<number | null>(null);

  let previewSource = $derived.by(() => {
    const colors = getThemeColors(currentTheme, prefersDark);
    const filled = Object.fromEntries(
      CHOICE_LETTERS.filter(l => choices[l]?.trim()).map(l => [l, choices[l].trim()])
    );
    const bodyContent = Object.keys(filled).length >= 2 ? formatBody(body, filled) : body;
    const narrative = question?.narrative?.trim();
    const bodyWithNarrative = narrative ? `${narrative}\n\n${bodyContent}` : bodyContent;
    const graphTypst = question?.graphTypst?.trim();
    const withGraph = graphTypst && !(/Recovered graph/i.test(graphTypst) && /Recovered graph/i.test(bodyWithNarrative))
      ? `${bodyWithNarrative}\n\n${graphTypst}`
      : bodyWithNarrative;
    const plotImport = (withGraph + solution).includes('plot(') ? '#import "@preview/simple-plot:0.8.0": plot, line-plot\n' : '';
    let src = `${plotImport}#set page(width: 13cm, height: auto, margin: 0.75cm, fill: rgb("${colors.bgTypst}"))
#set text(font: "New Computer Modern", size: 14pt, fill: rgb("${colors.textTypst}"))
#set par(justify: false)

${withGraph}`;
    if (answer) src += `\n\n*Answer:* ${answer}`;
    if (solution.trim()) src += `\n\n*Solution:*\n${solution}`;
    return src;
  });

  $effect(() => {
    const src = previewSource;
    let cancelled = false;
    previewBusy = true;
    const timer = setTimeout(async () => {
      if (cancelled) return;
      const t0 = performance.now();
      const result = await compileSvg(src);
      if (cancelled) return;
      previewBusy = false;
      previewMs = Math.round(performance.now() - t0);
      if (result.svg) { previewSvg = result.svg; previewError = null; }
      else { previewError = result.error ?? 'Error'; previewSvg = null; }
    }, 400);
    return () => { cancelled = true; clearTimeout(timer); };
  });

  // Derived lists
  let selectedClass = $derived(allClasses.find((c) => c.id === classId));
  let units         = $derived(selectedClass?.units ?? []);
  let selectedUnit  = $derived(units.find((u) => u.id === unitId));
  let sections      = $derived(selectedUnit?.sections ?? []);

  // Reset downstream selections when parent changes
  $effect(() => {
    if (!units.some((u) => u.id === unitId)) unitId = '';
  });
  $effect(() => {
    if (!sections.some((s) => s.id === sectionId)) sectionId = '';
  });

  function parseTags(s: string): string[] {
    return s.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
  }

  function questionData() {
    if (!body.trim()) { error = 'Question body is required.'; return; }
    const filledChoices = Object.fromEntries(
      CHOICE_LETTERS.filter(l => choices[l]?.trim()).map(l => [l, choices[l].trim()])
    );
    const imageRefs = scanImageRefs([
      body,
      solution,
      ...Object.values(filledChoices),
    ].join('\n'));

    return {
      body: body.trim(),
      answer: answer.trim() || undefined,
      solution: solution.trim() || undefined,
      choices: Object.keys(filledChoices).length >= 2 ? filledChoices : undefined,
      points,
      tags: parseTags(tagInput),
      images: imageRefs.length > 0 ? imageRefs : undefined,
      classId:   classId   || undefined,
      unitId:    unitId    || undefined,
      sectionId: sectionId || undefined,
    };
  }

  function save() {
    const data = questionData();
    if (!data) return;
    if (question) {
      bank.update(question.id, data);
    } else {
      bank.add(data);
    }
    onclose();
  }

  function duplicate() {
    if (!question) return;
    const data = questionData();
    if (!data) return;
    bank.update(question.id, data);
    const newId = bank.duplicate(question.id);
    if (newId) {
      const copy = bank.questions.find(x => x.id === newId);
      if (copy) {
        question = copy;
        body = copy.body;
        answer = copy.answer ?? '';
        solution = copy.solution ?? '';
        points = copy.points;
        tagInput = copy.tags.join(', ');
        choices = { A: '', B: '', C: '', D: '', E: '', ...copy.choices };
        classId = copy.classId ?? '';
        unitId = copy.unitId ?? '';
        sectionId = copy.sectionId ?? '';
        error = '';
      }
    }
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose();
  }
</script>

<svelte:window on:keydown={onkeydown} />

<div
  class="overlay"
  role="dialog"
  aria-modal="true"
  aria-label={question ? 'Edit Question' : 'Add Question'}
  onclick={onclose}
  onkeydown={(e) => e.key === 'Escape' && onclose()}
>
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="modal" onclick={(e) => e.stopPropagation()}>
    <header>
      <h2>{question ? 'Edit Question' : 'Add Question'}</h2>
      <button class="ghost" onclick={onclose} title="Close without saving">✕</button>
    </header>

    <div class="modal-content">
    <div class="body">
      {#if question?.renderError}
        <div class="render-error-banner">
          <span class="render-error-icon">❌</span>
          <div class="render-error-content">
            <strong>Render error</strong>
            <pre class="render-error-msg">{question.renderError}</pre>

            {#if liveHit}
              <div class="render-error-divider"></div>
              <p class="render-error-live-label">In {liveHit.field}</p>
              <pre class="render-error-msg">{liveHit.pos}</pre>
            {:else if storedHasPosition}
              <p class="render-error-fixed">No delimiter issues found — save and re-run Check to confirm.</p>
            {:else}
              <p class="render-error-hint">Could not locate automatically. Look for an unclosed <code>"</code> in a function argument, or an issue in the choices or solution.</p>
            {/if}
          </div>
        </div>
      {/if}

      <!-- Curriculum placement -->
      <div class="field">
        <span class="label">Curriculum placement <span class="hint">(optional)</span></span>
        <div class="curriculum-row">
          <select bind:value={classId} title="Class">
            <option value="">— Class —</option>
            {#each allClasses as cls}
              <option value={cls.id}>{cls.name}</option>
            {/each}
          </select>

          {#if creatingUnit}
            <div class="create-control">
              <input
                bind:value={newUnitInput}
                placeholder="Unit name"
                onkeydown={(e) => { if (e.key === 'Enter') addNewUnit(); }}
                autofocus
              />
              <button onclick={addNewUnit} disabled={!newUnitInput.trim()}>Add</button>
              <button onclick={() => { creatingUnit = false; newUnitInput = ''; }}>Cancel</button>
            </div>
          {:else}
            <div class="unit-group">
              <select bind:value={unitId} disabled={units.length === 0} title="Unit">
                <option value="">— Unit —</option>
                {#each units as unit}
                  <option value={unit.id}>Unit {unit.id}: {unit.name}</option>
                {/each}
              </select>
              {#if classId}
                <button class="icon-btn" onclick={() => creatingUnit = true} title="Create new unit">＋</button>
              {/if}
            </div>
          {/if}

          {#if creatingSection}
            <div class="create-control">
              <input
                bind:value={newSectionInput}
                placeholder="Section name"
                onkeydown={(e) => { if (e.key === 'Enter') addNewSection(); }}
                autofocus
              />
              <button onclick={addNewSection} disabled={!newSectionInput.trim()}>Add</button>
              <button onclick={() => { creatingSection = false; newSectionInput = ''; }}>Cancel</button>
            </div>
          {:else if !creatingUnit}
            <div class="section-group">
              <select bind:value={sectionId} disabled={sections.length === 0} title="Section">
                <option value="">— Section —</option>
                {#each sections as sec}
                  <option value={sec.id}>{sec.id} {sec.name}</option>
                {/each}
              </select>
              {#if classId && unitId}
                <button class="icon-btn" onclick={() => creatingSection = true} title="Create new section">＋</button>
              {/if}
            </div>
          {/if}
        </div>
      </div>

      <!-- Question body -->
      <div class="field">
        <label for="q-body">Question <span class="hint">(Typst markup — use $...$ for math)</span></label>
        {#if question?.narrative}
          <div class="narrative-note">
            <strong>Narrative</strong>
            <span>{question.narrative}</span>
          </div>
        {/if}
        <textarea
          id="q-body"
          rows={5}
          placeholder="e.g. Find the derivative of $f(x) = x^2 + 3x - 1$."
          bind:value={body}
        ></textarea>
      </div>

      <!-- MCQ Choices -->
      <div class="field">
        <span class="label">Choices <span class="hint">(fill in A–E for multiple choice)</span></span>
        <div class="choices-grid">
          {#each CHOICE_LETTERS as letter}
            <label class="choice-row">
              <span class="choice-letter">{letter}</span>
              <input
                type="text"
                bind:value={choices[letter]}
                placeholder="Choice {letter} text (Typst markup)"
              />
            </label>
          {/each}
        </div>
      </div>

      <div class="row">
        <div class="field" style="flex:1">
          <label for="q-pts">Points</label>
          <input id="q-pts" type="number" min="0" step="0.5" bind:value={points} />
        </div>
        <div class="field" style="flex:3">
          <label for="q-tags">Tags <span class="hint">(comma-separated)</span></label>
          <input id="q-tags" type="text" placeholder="calculus, derivatives" bind:value={tagInput} />
        </div>
      </div>

      {#if isMCQ}
        <div class="field">
          <div class="sol-row">
            <label for="q-ans" class="label">Correct answer</label>
            <select id="q-ans" bind:value={answer} class="ans-select">
              <option value="">— none —</option>
              {#each filledLetters as l}
                <option value={l}>{l}</option>
              {/each}
            </select>
          </div>
        </div>
      {/if}

      <div class="field">
        <label for="q-sol" class="label">
          {isMCQ ? 'Explanation' : 'Solution'}
          <span class="hint">(optional — Typst markup)</span>
        </label>
        <textarea
          id="q-sol"
          rows={3}
          placeholder={isMCQ ? 'Written explanation (optional)' : 'e.g. $f\'(x) = 2x + 3$'}
          bind:value={solution}
        ></textarea>
      </div>

      {#if error}
        <p class="error">{error}</p>
      {/if}
    </div>

    <!-- Live preview pane -->
    <div class="preview-pane">
      {#if previewSvg}
        <div class="preview-svg" class:stale={previewBusy}>
          {@html previewSvg}
        </div>
        {#if previewMs !== null}
          <span class="render-time">{previewMs} ms</span>
        {/if}
      {:else if previewError}
        <div class="preview-placeholder error-text">
          <p>{previewError}</p>
        </div>
      {:else if previewBusy}
        <div class="preview-placeholder">
          <div class="spinner"></div>
        </div>
      {:else}
        <div class="preview-placeholder muted">
          <span>Start typing to preview</span>
        </div>
      {/if}
    </div>
    </div><!-- end .modal-content -->

    <footer>
      <button onclick={onclose} title="Discard changes and close">Cancel</button>
      {#if question}
        <button onclick={duplicate} title="Save and duplicate this question for variation">Duplicate</button>
      {/if}
      <button class="primary" onclick={save} title={question ? 'Save changes to this question' : 'Add this question to the bank'}>
        {question ? 'Save Changes' : 'Add Question'}
      </button>
    </footer>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }

  .modal {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
    width: min(calc(100vw - 2rem), 980px);
    max-height: calc(100vh - 4rem);
    display: flex;
    flex-direction: column;
  }

  .modal-content {
    display: flex;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem 0.75rem;
    border-bottom: 1px solid var(--border);
  }

  header h2 {
    font-size: 15px;
    font-weight: 600;
  }

  .body {
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    overflow-y: auto;
    width: 480px;
    flex-shrink: 0;
    border-right: 1px solid var(--border);
  }

  .preview-pane {
    flex: 1;
    min-width: 0;
    overflow-y: auto;
    background: var(--bg-2);
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 1.25rem 1rem;
  }

  .preview-svg {
    width: 100%;
    transition: opacity 0.15s;
  }
  .preview-svg.stale { opacity: 0.45; }
  .preview-svg :global(svg) { display: block; width: 100%; height: auto; }

  .render-time {
    margin-top: 0.5rem;
    font-size: 10px;
    color: var(--text-2);
    opacity: 0.6;
    align-self: flex-end;
  }

  .preview-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    width: 100%;
    font-size: 12px;
    gap: 0.5rem;
  }
  .preview-placeholder.muted { color: var(--text-2); }
  .preview-placeholder.error-text { color: var(--danger); font-size: 11px; white-space: pre-wrap; align-items: flex-start; padding: 0.5rem; }

  .narrative-note {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.75rem 0.875rem;
    border-radius: 8px;
    background: color-mix(in srgb, var(--accent) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--accent) 22%, var(--border));
    font-size: 0.92rem;
  }

  .narrative-note strong {
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--accent);
  }

  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid var(--border);
    border-top-color: var(--primary);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .row {
    display: flex;
    gap: 0.75rem;
    align-items: flex-start;
  }

  .curriculum-row {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .curriculum-row select {
    width: 100%;
    font-size: 12px;
  }

  .unit-group, .section-group {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .unit-group select, .section-group select {
    flex: 1;
  }

  .unit-group .icon-btn, .section-group .icon-btn {
    padding: 0.35rem 0.5rem;
    font-size: 16px;
    height: fit-content;
  }

  .create-control {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .create-control input {
    flex: 1;
    font-size: 12px;
    padding: 0.35rem 0.5rem;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg-secondary);
    color: var(--text);
  }

  .create-control button {
    padding: 0.35rem 0.75rem;
    font-size: 12px;
    height: fit-content;
  }

  footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    padding: 0.75rem 1.25rem;
    border-top: 1px solid var(--border);
  }

  .label {
    display: block;
    font-size: 12px;
    font-weight: 500;
    color: var(--text);
    margin-bottom: 0.25rem;
  }

  .hint {
    font-weight: 400;
    color: var(--text-2);
  }

  .error {
    color: var(--danger);
    font-size: 12px;
  }

  .render-error-banner {
    display: flex;
    gap: 0.6rem;
    align-items: flex-start;
    background: color-mix(in srgb, var(--danger) 10%, var(--bg));
    border: 1px solid color-mix(in srgb, var(--danger) 40%, transparent);
    border-radius: var(--radius);
    padding: 0.65rem 0.85rem;
  }

  .render-error-icon { flex-shrink: 0; font-size: 13px; margin-top: 1px; }

  .render-error-content {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .render-error-content strong {
    font-size: 12px;
    font-weight: 600;
    color: var(--danger);
  }

  .render-error-msg {
    font-size: 11px;
    line-height: 1.55;
    white-space: pre-wrap;
    word-break: break-word;
    color: var(--text);
    margin: 0;
    font-family: ui-monospace, 'Cascadia Code', 'Source Code Pro', monospace;
  }

  .render-error-divider {
    height: 1px;
    background: color-mix(in srgb, var(--danger) 25%, transparent);
    margin: 0.4rem 0;
  }

  .render-error-live-label {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--danger);
    margin: 0 0 0.2rem;
    opacity: 0.7;
  }

  .render-error-fixed {
    font-size: 11px;
    color: #16a34a;
    margin: 0.3rem 0 0;
    font-style: italic;
  }

  .render-error-hint {
    font-size: 11px;
    color: var(--text-2);
    margin: 0.3rem 0 0;
    font-style: italic;
    line-height: 1.5;
  }

  .render-error-hint code {
    font-family: ui-monospace, 'Cascadia Code', 'Source Code Pro', monospace;
    background: var(--bg-3);
    padding: 0 3px;
    border-radius: 3px;
    font-style: normal;
  }

  .choices-grid {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .choice-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .choice-letter {
    font-weight: 600;
    font-size: 12px;
    width: 1rem;
    flex-shrink: 0;
    color: var(--text-2);
  }

  .choice-row input {
    flex: 1;
    font-size: 12px;
  }

  .sol-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .sol-row .label { margin-bottom: 0; }

  .ans-select {
    width: 6rem;
    font-size: 13px;
  }
</style>
