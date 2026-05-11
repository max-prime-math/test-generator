<script lang="ts">
  import { tick } from 'svelte';
  import type { Class, TestType } from '$lib/types';

  let {
    initialName,
    initialClassId,
    allClasses,
    onsave,
    oncancel,
  }: {
    initialName: string;
    initialClassId: string | null;
    allClasses: Class[];
    onsave: (r: { name: string; classId: string | null; unitId: string | null; testType: TestType | null }) => void;
    oncancel: () => void;
  } = $props();

  let name = $state(initialName);
  let selectedClassId = $state<string | null>(initialClassId);
  let selectedUnitId = $state<string | null>(null);
  let selectedTestType = $state<TestType | null>('test');

  let nameInputEl: HTMLInputElement | undefined = $state();

  let units = $derived(
    allClasses.find(c => c.id === selectedClassId)?.units ?? []
  );

  // Reset unitId when class changes
  $effect(() => {
    if (selectedClassId) {
      // If selected class changes, only reset unit if it's not in the new class
      const newUnits = allClasses.find(c => c.id === selectedClassId)?.units ?? [];
      if (selectedUnitId && !newUnits.find(u => u.id === selectedUnitId)) {
        selectedUnitId = null;
      }
    } else {
      selectedUnitId = null;
    }
  });

  // Focus the input on mount
  $effect(() => {
    tick().then(() => {
      nameInputEl?.focus();
      nameInputEl?.select();
    });
  });

  function handleSave() {
    if (!name.trim()) return;
    onsave({
      name: name.trim(),
      classId: selectedClassId,
      unitId: selectedUnitId,
      testType: selectedTestType,
    });
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && name.trim()) {
      handleSave();
    } else if (e.key === 'Escape') {
      oncancel();
    }
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      oncancel();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="overlay" onclick={handleBackdropClick}>
  <div class="modal" role="dialog" aria-modal="true" onclick={(e) => e.stopPropagation()}>
    <header>
      <h2>Save Test</h2>
      <button class="ghost" onclick={oncancel}>✕</button>
    </header>
    <div class="body">
      <div class="form-group">
        <label for="name">Test name</label>
        <input
          id="name"
          bind:this={nameInputEl}
          type="text"
          bind:value={name}
          placeholder="e.g. Unit 1 Quiz, Final Exam"
        />
      </div>

      <div class="form-group">
        <label for="class">Class</label>
        <select id="class" bind:value={selectedClassId}>
          <option value={null}>— none —</option>
          {#each allClasses as cls}
            <option value={cls.id}>{cls.name}</option>
          {/each}
        </select>
      </div>

      {#if units.length > 0}
        <div class="form-group">
          <label for="unit">Unit</label>
          <select id="unit" bind:value={selectedUnitId}>
            <option value={null}>— none —</option>
            {#each units as unit}
              <option value={unit.id}>{unit.name}</option>
            {/each}
          </select>
        </div>
      {/if}

      <div class="form-group">
        <label for="type">Type</label>
        <select id="type" bind:value={selectedTestType}>
          <option value="quiz">Quiz</option>
          <option value="test">Test</option>
          <option value="exam">Exam</option>
          <option value="assignment">Assignment</option>
          <option value="other">Other</option>
        </select>
      </div>
    </div>

    <footer class="modal-footer">
      <button class="secondary" onclick={oncancel}>Cancel</button>
      <button disabled={!name.trim()} onclick={handleSave}>Save</button>
    </footer>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 200;
  }

  .modal {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: 0 8px 40px rgba(0, 0, 0, 0.25);
    width: 480px;
    max-width: calc(100vw - 2rem);
    display: flex;
    flex-direction: column;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  h2 {
    margin: 0;
    font-size: 1.2rem;
    font-weight: 600;
  }

  .body {
    padding: 1rem;
    flex: 1;
    overflow-y: auto;
  }

  .form-group {
    margin-bottom: 1rem;
  }

  .form-group:last-child {
    margin-bottom: 0;
  }

  label {
    display: block;
    margin-bottom: 0.4rem;
    font-size: 0.9rem;
    font-weight: 500;
    color: var(--text-secondary);
  }

  input,
  select {
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg-input);
    color: var(--text);
    font-size: 0.95rem;
    font-family: inherit;
  }

  input::placeholder {
    color: var(--text-muted);
  }

  input:focus,
  select:focus {
    outline: none;
    border-color: var(--focus);
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
  }

  .modal-footer {
    display: flex;
    gap: 0.75rem;
    padding: 1rem;
    border-top: 1px solid var(--border);
    flex-shrink: 0;
    justify-content: flex-end;
  }

  button {
    padding: 0.5rem 1rem;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--btn-bg);
    color: var(--text);
    font-size: 0.95rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 150ms ease;
  }

  button:hover:not(:disabled) {
    background: var(--btn-bg-hover);
    border-color: var(--border-hover);
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  button.secondary {
    background: transparent;
    border-color: var(--border);
    color: var(--text-secondary);
  }

  button.secondary:hover:not(:disabled) {
    background: var(--bg-2);
  }
</style>
