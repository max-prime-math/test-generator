<!--
  Modal for adding or editing a question.
  Pass `question` prop to enter edit mode; omit for add mode.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { bank } from '../lib/bank.svelte';
  import type { Question } from '../lib/types';

  interface Props {
    question?: Question;  // undefined = add mode
    onclose: () => void;
  }

  let { question, onclose }: Props = $props();

  // Form state — seeded from the question prop on open, then independent.
  // untrack() silences the Svelte 5 warning about using a prop in $state().
  let body = $state(untrack(() => question?.body ?? ''));
  let solution = $state(untrack(() => question?.solution ?? ''));
  let points = $state(untrack(() => question?.points ?? 1));
  let tagInput = $state(untrack(() => question?.tags.join(', ') ?? ''));

  let error = $state('');

  function parseTags(s: string): string[] {
    return s
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
  }

  function save() {
    if (!body.trim()) {
      error = 'Question body is required.';
      return;
    }
    const data = {
      body: body.trim(),
      solution: solution.trim() || undefined,
      points,
      tags: parseTags(tagInput),
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
      <div class="field">
        <label for="q-body">Question <span class="hint">(Typst markup — use $...$ for math)</span></label>
        <textarea
          id="q-body"
          rows={5}
          placeholder="e.g. Find the derivative of $f(x) = x^2 + 3x - 1$."
          bind:value={body}
        ></textarea>
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

      <div class="field">
        <label for="q-sol">Solution <span class="hint">(optional — Typst markup)</span></label>
        <textarea
          id="q-sol"
          rows={3}
          placeholder="e.g. $f'(x) = 2x + 3$"
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
    width: 560px;
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

  footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    padding: 0.75rem 1.25rem;
    border-top: 1px solid var(--border);
  }

  .hint {
    font-weight: 400;
    color: var(--text-2);
  }

  .error {
    color: var(--danger);
    font-size: 12px;
  }
</style>
