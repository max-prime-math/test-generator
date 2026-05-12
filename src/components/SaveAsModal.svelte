<script lang="ts">
  import { tick } from 'svelte';
  import type { Class, TestType, SavedTest } from '../lib/types';
  import { customClasses } from '../lib/custom-classes.svelte';

  let {
    initialName,
    initialClassId,
    allClasses,
    editingEntry,
    onsave,
    oncancel,
  }: {
    initialName: string;
    initialClassId: string | null;
    allClasses: Class[];
    editingEntry?: SavedTest | null;
    onsave: (r: { name: string; classId: string | null; unitId: string | null; testType: TestType | null }) => void;
    oncancel: () => void;
  } = $props();

  function autoDetectTestType(testName: string): TestType | null {
    const lower = testName.toLowerCase();
    if (lower.includes('exam')) return 'exam';
    if (lower.includes('assignment')) return 'assignment';
    if (lower.includes('quiz')) return 'quiz';
    if (lower.includes('test')) return 'test';
    return null;
  }

  let name = $state(initialName);
  let selectedClassId = $state<string | null>(editingEntry?.classId ?? initialClassId);
  let selectedUnitId = $state<string | null>(editingEntry?.unitId ?? null);
  let selectedTestType = $state<TestType | null | 'custom'>(editingEntry?.testType ?? autoDetectTestType(initialName) ?? 'test');
  let customTestType = $state<string>('');
  let showNewClassInput = $state(false);
  let newClassName = $state('');
  let showNewUnitInput = $state(false);
  let newUnitName = $state('');
  let tempClassSelect = $state<string | null>(selectedClassId);
  let tempUnitSelect = $state<string | null>(selectedUnitId);

  let nameInputEl: HTMLInputElement | undefined = $state();
  let newClassInputEl: HTMLInputElement | undefined = $state();
  let newUnitInputEl: HTMLInputElement | undefined = $state();

  let units = $derived(
    allClasses.find(c => c.id === selectedClassId)?.units ?? []
  );

  const isEditMode = !!editingEntry;
  const dialogTitle = isEditMode ? 'Edit Test' : 'Save Test';

  // Reset unitId when class changes
  $effect(() => {
    if (selectedClassId) {
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

  function handleAddNewClass() {
    if (!newClassName.trim()) return;
    const newClass = customClasses.add(newClassName.trim());
    selectedClassId = newClass.id;
    showNewClassInput = false;
    newClassName = '';
  }

  function handleAddNewUnit() {
    if (!newUnitName.trim() || !selectedClassId) return;
    const existingUnits = allClasses.find(c => c.id === selectedClassId)?.units ?? [];
    const maxUnitId = Math.max(0, ...existingUnits.map((u: Class['units'][number]) => parseInt(u.id) || 0));
    const explicitId = String(maxUnitId + 1);
    const newUnit = customClasses.addUnit(selectedClassId, newUnitName.trim(), explicitId);
    selectedUnitId = newUnit.id;
    showNewUnitInput = false;
    newUnitName = '';
  }

  function handleSave() {
    if (!name.trim()) return;
    const finalTestType = selectedTestType === 'custom' ? (customTestType as TestType | null) : (selectedTestType as TestType | null);
    onsave({
      name: name.trim(),
      classId: selectedClassId,
      unitId: selectedUnitId,
      testType: finalTestType,
    });
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && name.trim() && !showNewClassInput && !showNewUnitInput) {
      handleSave();
    } else if (e.key === 'Escape') {
      if (showNewClassInput) {
        showNewClassInput = false;
        newClassName = '';
      } else if (showNewUnitInput) {
        showNewUnitInput = false;
        newUnitName = '';
      } else {
        oncancel();
      }
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
      <h2>{dialogTitle}</h2>
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
        {#if showNewClassInput}
          <div class="new-input-group">
            <input
              bind:this={newClassInputEl}
              type="text"
              bind:value={newClassName}
              placeholder="Class name"
              onkeydown={(e) => {
                if (e.key === 'Enter') handleAddNewClass();
                if (e.key === 'Escape') { showNewClassInput = false; newClassName = ''; selectedClassId = tempClassSelect; }
              }}
              autofocus
            />
            <button class="small ghost" onclick={handleAddNewClass}>Create</button>
            <button class="small ghost secondary" onclick={() => { showNewClassInput = false; newClassName = ''; selectedClassId = tempClassSelect; }}>Cancel</button>
          </div>
        {:else}
          <select id="class"
            value={showNewClassInput ? '__new__' : (selectedClassId ?? '')}
            onchange={(e) => {
              const val = (e.target as HTMLSelectElement).value;
              if (val === '__new__') {
                tempClassSelect = selectedClassId;
                showNewClassInput = true;
                tick().then(() => newClassInputEl?.focus());
              } else {
                selectedClassId = val === '' ? null : val;
              }
            }}
          >
            <option value="">— none —</option>
            {#each allClasses as cls}
              <option value={cls.id}>{cls.name}</option>
            {/each}
            <option value="__new__">New…</option>
          </select>
        {/if}
      </div>

      {#if units.length > 0}
        <div class="form-group">
          <label for="unit">Unit</label>
          {#if showNewUnitInput}
            <div class="new-input-group">
              <input
                bind:this={newUnitInputEl}
                type="text"
                bind:value={newUnitName}
                placeholder="Unit name"
                onkeydown={(e) => {
                  if (e.key === 'Enter') handleAddNewUnit();
                  if (e.key === 'Escape') { showNewUnitInput = false; newUnitName = ''; selectedUnitId = tempUnitSelect; }
                }}
                autofocus
              />
              <button class="small ghost" onclick={handleAddNewUnit}>Create</button>
              <button class="small ghost secondary" onclick={() => { showNewUnitInput = false; newUnitName = ''; selectedUnitId = tempUnitSelect; }}>Cancel</button>
            </div>
          {:else}
            <select id="unit"
              value={showNewUnitInput ? '__new__' : (selectedUnitId ?? '')}
              onchange={(e) => {
                const val = (e.target as HTMLSelectElement).value;
                if (val === '__new__') {
                  tempUnitSelect = selectedUnitId;
                  showNewUnitInput = true;
                  tick().then(() => newUnitInputEl?.focus());
                } else {
                  selectedUnitId = val === '' ? null : val;
                }
              }}
            >
              <option value="">— none —</option>
              {#each units as unit}
                <option value={unit.id}>{unit.name}</option>
              {/each}
              <option value="__new__">New…</option>
            </select>
          {/if}
        </div>
      {/if}

      <div class="form-group">
        <label for="type">Type</label>
        {#if selectedTestType === 'custom' && !showNewClassInput && !showNewUnitInput}
          <div class="new-input-group">
            <input
              type="text"
              bind:value={customTestType}
              placeholder="Custom type name"
              onkeydown={(e) => {
                if (e.key === 'Escape') selectedTestType = 'test';
              }}
              autofocus
            />
          </div>
        {:else}
          <select id="type" bind:value={selectedTestType}>
            <option value="quiz">Quiz</option>
            <option value="test">Test</option>
            <option value="exam">Exam</option>
            <option value="assignment">Assignment</option>
            <option value="custom">Other…</option>
          </select>
        {/if}
      </div>
    </div>

    <footer class="modal-footer">
      <button class="secondary" onclick={oncancel}>Cancel</button>
      <button disabled={!name.trim()} onclick={handleSave}>
        {isEditMode ? 'Update' : 'Save'}
      </button>
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
    box-sizing: border-box;
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

  .new-input-group {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .new-input-group input {
    flex: 1;
  }

  .new-input-group button {
    flex-shrink: 0;
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

  button.small {
    padding: 0.4rem 0.8rem;
    font-size: 0.9rem;
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
