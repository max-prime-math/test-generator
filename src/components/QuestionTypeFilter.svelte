<script module lang="ts">
  export type QuestionTypeSelection = '' | 'mcq' | 'frq';
</script>

<script lang="ts">
  let { selection = $bindable() }: { selection: QuestionTypeSelection } = $props();

  const options = [
    { value: '', label: 'All types', title: 'Show all question types' },
    { value: 'mcq', label: 'MCQ', title: 'Show only multiple-choice questions' },
    { value: 'frq', label: 'FRQ', title: 'Show only free-response questions' },
  ] as const;
</script>

<div class="question-type-filter" role="group" aria-label="Question type">
  {#each options as option (option.value)}
    <button type="button" aria-pressed={selection === option.value} title={option.title}
      onclick={() => selection = option.value}>{option.label}</button>
  {/each}
</div>

<style>
  .question-type-filter {
    display: flex;
    gap: 0.25rem;
  }
  button {
    min-height: 36px;
    padding: 0.3rem 0.55rem;
    border: 1px solid var(--border);
    box-shadow: none;
    background: var(--bg);
    color: var(--text-2);
    font-size: 12px;
    white-space: nowrap;
  }
  button[aria-pressed="true"] {
    background: color-mix(in srgb, var(--primary) 12%, var(--bg));
    border-color: var(--primary);
    color: var(--primary);
    font-weight: 700;
  }
  @media (max-width: 760px) {
    button { min-height: 44px; }
  }
</style>
