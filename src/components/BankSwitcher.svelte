<script lang="ts">
  import { bankWorkspaces } from '../lib/bank-workspaces.svelte';
  import { bankView } from '../lib/bank-switch-view.svelte';
  import { localWorkspace } from '../lib/local-workspace.svelte';
  import { workspaceCatalog } from '../lib/workspace-catalog.svelte';
  import ShareZipModal from './ShareZipModal.svelte';

  let { selected = $bindable<string[]>([]) }: { selected?: string[] } = $props();
  let open = $state(false);
  let sharing = $state<'import' | 'export' | null>(null);
  let root = $state<HTMLDivElement | null>(null);
  let trigger = $state<HTMLButtonElement | null>(null);
  let selectionAnchor = $state<string | null>(null);

  const options = $derived(bankView.banks.filter(entry =>
    selected.includes(entry.id) || !workspaceCatalog.hiddenBankIds.has(entry.id)));
  const selectedNames = $derived(options.filter(entry => selected.includes(entry.id)).map(entry => entry.name));
  const allSelected = $derived(options.length > 0 && options.every(entry => selected.includes(entry.id)));
  const label = $derived(selectedNames.length === 0
    ? 'Choose banks…'
    : allSelected && options.length > 1 ? 'All banks'
    : selectedNames.length === 1 ? selectedNames[0] : `${selectedNames.length} banks`);

  $effect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (root && !root.contains(event.target as Node)) open = false; };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      open = false;
      trigger?.focus();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  });

  function togglePicker() {
    if (!open && (!selectionAnchor || !options.some(entry => entry.id === selectionAnchor))) {
      selectionAnchor = selected.find(id => options.some(entry => entry.id === id)) ?? null;
    }
    open = !open;
  }

  function selectBank(id: string, event: MouseEvent) {
    const additive = event.ctrlKey || event.metaKey;
    if (event.shiftKey && selectionAnchor) {
      const anchorIndex = options.findIndex(entry => entry.id === selectionAnchor);
      const targetIndex = options.findIndex(entry => entry.id === id);
      if (anchorIndex !== -1 && targetIndex !== -1) {
        const from = Math.min(anchorIndex, targetIndex);
        const to = Math.max(anchorIndex, targetIndex);
        const range = options.slice(from, to + 1).map(entry => entry.id);
        selected = [...new Set([...selected, ...range])];
        selectionAnchor = id;
        return;
      }
    }
    selectionAnchor = id;
    if (additive) {
      selected = selected.includes(id) ? selected.filter(value => value !== id) : [...selected, id];
      return;
    }
    selected = [id];
    open = false;
    trigger?.focus();
  }

  function toggleAll() {
    if (allSelected) {
      selected = [];
      selectionAnchor = null;
      return;
    }
    selected = options.map(entry => entry.id);
    selectionAnchor = options[0]?.id ?? null;
    open = false;
    trigger?.focus();
  }

  async function createBank() {
    const name = window.prompt('New bank name', 'New Test Bank');
    if (name === null) return;
    await bankWorkspaces.createBank(name);
    selected = [bankWorkspaces.activeBankId];
    open = false;
  }

  function renameBank() {
    const id = selected.length === 1 ? selected[0] : null;
    const current = bankView.banks.find(entry => entry.id === id);
    if (!current) return;
    const name = window.prompt('Bank name', current.name);
    if (name !== null) bankWorkspaces.renameBank(current.id, name);
  }
</script>

<div class="bank-switcher" bind:this={root}>
  <span class="bank-label">Question banks</span>
  <div class="bank-row">
    <div class="picker">
      <button class="picker-trigger" bind:this={trigger} onclick={togglePicker} aria-expanded={open} aria-haspopup="dialog" disabled={localWorkspace.busy}>
        <span>{label}</span><span aria-hidden="true">▾</span>
      </button>
      {#if open}
        <div class="bank-menu" role="dialog" aria-label="Choose question banks">
          <div class="menu-heading">
            <strong>Choose question banks</strong>
            <span>{selected.length} selected</span>
          </div>
          <p class="menu-hint">Click to show one · Ctrl/Cmd-click to add or remove · Shift-click for a range</p>
          {#if options.length > 1}
            <button class="all-banks" class:active={allSelected} onclick={toggleAll}>
              <span>
                <strong>{allSelected ? 'Clear selection' : 'All banks'}</strong>
                <small>{allSelected ? 'Choose a new set of banks' : 'Then filter the combined questions by class'}</small>
              </span>
            </button>
          {/if}
          <div class="bank-options">
            {#each options as option (option.id)}
              {@const included = selected.includes(option.id)}
              <button
                class="bank-option"
                class:included
                aria-pressed={included}
                onclick={(event) => selectBank(option.id, event)}
                title={`Show only ${option.name}; hold Ctrl, Command, or Shift to select multiple banks`}
              >
                <span class="bank-option-text">
                  <span>{option.name}</span>
                  {#if bankView.activeBankId === option.id}<small>Open for editing</small>{/if}
                </span>
              </button>
            {/each}
          </div>
          {#if options.length === 0}<p>No banks available.</p>{/if}
        </div>
      {/if}
    </div>
    <button class="bank-btn" onclick={() => void createBank()} disabled={bankView.switching || localWorkspace.busy} title="Create a new local bank" aria-label="Create a new local bank">+</button>
    <button class="bank-btn" onclick={renameBank} disabled={selected.length !== 1 || bankView.switching || localWorkspace.busy} title={selected.length === 1 ? 'Rename the selected bank' : 'Select one bank to rename it'} aria-label="Rename selected bank">✎</button>
  </div>
  <div class="share-actions">
    <button onclick={() => sharing = 'import'} disabled={bankView.switching || localWorkspace.busy}>Import bank ZIP</button>
    <button onclick={() => sharing = 'export'} disabled={bankView.switching || localWorkspace.busy}>Export bank ZIP</button>
  </div>
  {#if bankView.phase}
    <span class="bank-switch-status" role="status"><span class="spinner" aria-hidden="true"></span>{bankView.phase}…</span>
  {:else if bankView.error}
    <span class="bank-switch-status error" role="alert">{bankView.error}<button onclick={() => bankWorkspaces.switchError = null} aria-label="Dismiss">✕</button></span>
  {/if}
</div>

{#if sharing}<ShareZipModal kind="bank" importing={sharing === 'import'} initialBankId={selected.length === 1 ? selected[0] : bankView.activeBankId} onclose={() => sharing = null} onbankimport={id => selected = [id]} />{/if}

<style>
  .bank-switcher { display: flex; flex-direction: column; gap: .3rem; padding: .25rem .75rem .6rem; margin-bottom: .35rem; border-bottom: 1px solid var(--border); }
  .bank-label { color: var(--text-2); font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
  .share-actions { display: flex; flex-wrap: wrap; gap: .3rem; }
  .share-actions button { font-size: 11px; padding: .3rem .45rem; }
  .bank-row { display: flex; align-items: center; gap: .3rem; min-width: 0; }
  .picker { position: relative; flex: 1; min-width: 0; }
  .picker-trigger { width: 100%; height: 32px; padding: 3px 8px; border: 0; border-radius: 6px; box-shadow: none; background: var(--bg-2); color: var(--text); font-size: 13px; font-weight: 500; display: flex; justify-content: space-between; align-items: center; gap: .5rem; }
  .picker-trigger span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .picker-trigger:hover { background: var(--bg-3); }
  .bank-menu { position: absolute; top: calc(100% + .25rem); left: 0; z-index: 40; width: max(100%, 300px); max-height: min(65vh, 520px); overflow: auto; padding: .45rem; border: 1px solid var(--border); border-radius: 10px; background: var(--bg); box-shadow: 0 8px 24px #0002; }
  .menu-heading { display: flex; align-items: baseline; justify-content: space-between; gap: .75rem; padding: .25rem .35rem 0; font-size: 13px; }
  .menu-heading span { color: var(--text-2); font-size: 11px; white-space: nowrap; }
  .bank-menu .menu-hint { margin: .25rem .35rem .45rem; line-height: 1.35; }
  .bank-menu p { margin: .4rem; color: var(--text-2); font-size: 12px; }
  .all-banks { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: .75rem; padding: .55rem .6rem; border: 1px solid var(--border); border-radius: 7px; background: var(--bg-2); color: var(--text); box-shadow: none; text-align: left; }
  .all-banks:hover, .all-banks.active { background: var(--bg-3); }
  .all-banks > span:first-child { display: grid; gap: .12rem; min-width: 0; }
  .all-banks small, .bank-option small { color: var(--text-2); font-size: 10px; font-weight: 400; }
  .bank-options { display: grid; gap: 2px; margin-top: .35rem; }
  .bank-option { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: .75rem; min-width: 0; padding: .5rem .55rem .5rem .65rem; border: 0; border-radius: 6px; background: transparent; color: var(--text); box-shadow: none; font-size: 13px; text-align: left; }
  .bank-option:hover, .bank-option:focus-visible { background: var(--bg-2); }
  .bank-option.included { background: color-mix(in srgb, var(--primary) 10%, var(--bg)); box-shadow: inset 3px 0 0 var(--primary); color: var(--primary); }
  .bank-option-text { min-width: 0; display: grid; gap: .1rem; }
  .bank-option-text > span { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bank-btn { width: 28px; height: 28px; padding: 0; border: 0; border-radius: 6px; box-shadow: none; background: transparent; color: var(--text-2); font-size: 15px; font-weight: 600; line-height: 1; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .bank-btn:hover:not(:disabled) { background: var(--bg-3); color: var(--text); }
  .bank-switch-status { display: flex; align-items: center; gap: .4rem; font-size: 12px; color: var(--text-2); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bank-switch-status.error { color: var(--danger, #b91c1c); white-space: normal; flex-wrap: wrap; }
  .bank-switch-status button { font-size: 11px; padding: 1px 6px; }
  .spinner { width: 10px; height: 10px; border-radius: 50%; border: 2px solid currentColor; border-right-color: transparent; animation: bank-spin .8s linear infinite; flex: none; }
  @keyframes bank-spin { to { transform: rotate(360deg); } }
  @media (max-width: 760px) { .picker-trigger { height: 44px; font-size: 16px; } .bank-menu { width: min(360px, calc(100vw - 1.5rem)); } .bank-option { min-height: 44px; } .bank-btn { width: 44px; height: 44px; border-radius: 8px; } }
</style>
