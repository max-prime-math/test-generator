<!--
  Modal for adding or editing a question.
  Pass `question` prop to enter edit mode; omit for add mode.
  Pass `initialClassId` / `initialUnitId` / `initialSectionId` to pre-fill curriculum when adding.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { bank } from '../lib/bank.svelte';
  import { CLASSES, DEMO_CLASSES } from '../lib/curriculum';
  import { appState } from '../lib/app-state.svelte';
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

  // Curriculum
  let classId   = $state(untrack(() => question?.classId   ?? initialClassId   ?? (appState.demoMode ? [...CLASSES, ...DEMO_CLASSES] : CLASSES)[0]?.id ?? ''));
  let unitId    = $state(untrack(() => question?.unitId    ?? initialUnitId    ?? ''));
  let sectionId = $state(untrack(() => question?.sectionId ?? initialSectionId ?? ''));

  let error = $state('');

  // Derived lists
  let selectedClass = $derived((appState.demoMode ? [...CLASSES, ...DEMO_CLASSES] : CLASSES).find((c) => c.id === classId));
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

  function save() {
    if (!body.trim()) { error = 'Question body is required.'; return; }
    const filledChoices = Object.fromEntries(
      CHOICE_LETTERS.filter(l => choices[l]?.trim()).map(l => [l, choices[l].trim()])
    );
    const data = {
      body: body.trim(),
      answer: answer.trim() || undefined,
      solution: solution.trim() || undefined,
      choices: Object.keys(filledChoices).length >= 2 ? filledChoices : undefined,
      points,
      tags: parseTags(tagInput),
      classId:   classId   || undefined,
      unitId:    unitId    || undefined,
      sectionId: sectionId || undefined,
    };
    if (question) {
      bank.update(question.id, data);
    } else {
      bank.add(data);
    }
    onclose();
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
      <button class="ghost" onclick={onclose}>✕</button>
    </header>

    <div class="body">
      <!-- Curriculum placement -->
      <div class="field">
        <span class="label">Curriculum placement <span class="hint">(optional)</span></span>
        <div class="curriculum-row">
          <select bind:value={classId} title="Class">
            <option value="">— Class —</option>
            {#each (appState.demoMode ? [...CLASSES, ...DEMO_CLASSES] : CLASSES) as cls}
              <option value={cls.id}>{cls.name}</option>
            {/each}
          </select>

          <select bind:value={unitId} disabled={units.length === 0} title="Unit">
            <option value="">— Unit —</option>
            {#each units as unit}
              <option value={unit.id}>Unit {unit.id}: {unit.name}</option>
            {/each}
          </select>

          <select bind:value={sectionId} disabled={sections.length === 0} title="Section">
            <option value="">— Section —</option>
            {#each sections as sec}
              <option value={sec.id}>{sec.id} {sec.name}</option>
            {/each}
          </select>
        </div>
      </div>

      <!-- Question body -->
      <div class="field">
        <label for="q-body">Question <span class="hint">(Typst markup — use $...$ for math)</span></label>
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

    <footer>
      <button onclick={onclose}>Cancel</button>
      <button class="primary" onclick={save}>
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
    width: 620px;
    max-width: calc(100vw - 2rem);
    max-height: calc(100vh - 4rem);
    display: flex;
    flex-direction: column;
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
  }

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
