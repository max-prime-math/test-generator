<script lang="ts">
  import { bankWorkspaces } from '../lib/bank-workspaces.svelte';
  import { bankView } from '../lib/bank-switch-view.svelte';
  import { localWorkspace } from '../lib/local-workspace.svelte';
  import { workspaceCatalog } from '../lib/workspace-catalog.svelte';

  let { selected = $bindable<string[]>([]) }: { selected?: string[] } = $props();
  let open = $state(false);
  let root = $state<HTMLDivElement | null>(null);

  const options = $derived(bankView.banks.filter(entry =>
    selected.includes(entry.id) || !workspaceCatalog.hiddenBankIds.has(entry.id)));
  const selectedNames = $derived(options.filter(entry => selected.includes(entry.id)).map(entry => entry.name));
  const label = $derived(selectedNames.length === 0
    ? 'Choose banks…'
    : selectedNames.length === 1 ? selectedNames[0] : `${selectedNames.length} banks selected`);

  $effect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (root && !root.contains(event.target as Node)) open = false; };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') open = false; };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  });

  function toggle(id: string, checked: boolean) {
    selected = checked ? [...new Set([...selected, id])] : selected.filter(value => value !== id);
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
      <button class="picker-trigger" onclick={() => open = !open} aria-expanded={open} aria-haspopup="true" disabled={localWorkspace.busy}>
        <span>{label}</span><span aria-hidden="true">▾</span>
      </button>
      {#if open}
        <div class="bank-menu" role="group" aria-label="Question banks to display">
          {#each options as option (option.id)}
            <label>
              <input type="checkbox" checked={selected.includes(option.id)} onchange={event => toggle(option.id, event.currentTarget.checked)} />
              <span>{option.name}</span>
            </label>
          {/each}
          {#if options.length === 0}<p>No banks available.</p>{/if}
        </div>
      {/if}
    </div>
    <button class="bank-btn" onclick={() => void createBank()} disabled={bankView.switching || localWorkspace.busy} title="Create a new local bank" aria-label="Create a new local bank">+</button>
    <button class="bank-btn" onclick={renameBank} disabled={selected.length !== 1 || bankView.switching || localWorkspace.busy} title={selected.length === 1 ? 'Rename the selected bank' : 'Select one bank to rename it'} aria-label="Rename selected bank">✎</button>
  </div>
  {#if bankView.phase}
    <span class="bank-switch-status" role="status"><span class="spinner" aria-hidden="true"></span>{bankView.phase}…</span>
  {:else if bankView.error}
    <span class="bank-switch-status error" role="alert">{bankView.error}<button onclick={() => bankWorkspaces.switchError = null} aria-label="Dismiss">✕</button></span>
  {/if}
</div>

<style>
  .bank-switcher { display: flex; flex-direction: column; gap: .3rem; padding: .25rem .75rem .6rem; margin-bottom: .35rem; border-bottom: 1px solid var(--border); }
  .bank-label { color: var(--text-2); font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
  .bank-row { display: flex; align-items: center; gap: .3rem; min-width: 0; }
  .picker { position: relative; flex: 1; min-width: 0; }
  .picker-trigger { width: 100%; height: 32px; padding: 3px 8px; border: 0; border-radius: 6px; box-shadow: none; background: var(--bg-2); color: var(--text); font-size: 13px; font-weight: 500; display: flex; justify-content: space-between; align-items: center; gap: .5rem; }
  .picker-trigger span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .picker-trigger:hover { background: var(--bg-3); }
  .bank-menu { position: absolute; top: calc(100% + .25rem); left: 0; z-index: 40; width: max(100%, 220px); max-height: min(55vh, 420px); overflow: auto; padding: .35rem; border: 1px solid var(--border); border-radius: 8px; background: var(--bg); box-shadow: 0 8px 24px #0002; }
  .bank-menu label { display: flex; align-items: center; gap: .5rem; padding: .4rem .45rem; border-radius: 5px; font-size: 13px; cursor: pointer; }
  .bank-menu label:hover { background: var(--bg-2); }
  .bank-menu input { width: auto; margin: 0; }
  .bank-menu p { margin: .4rem; color: var(--text-2); font-size: 12px; }
  .bank-btn { width: 28px; height: 28px; padding: 0; border: 0; border-radius: 6px; box-shadow: none; background: transparent; color: var(--text-2); font-size: 15px; font-weight: 600; line-height: 1; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .bank-btn:hover:not(:disabled) { background: var(--bg-3); color: var(--text); }
  .bank-switch-status { display: flex; align-items: center; gap: .4rem; font-size: 12px; color: var(--text-2); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bank-switch-status.error { color: var(--danger, #b91c1c); white-space: normal; flex-wrap: wrap; }
  .bank-switch-status button { font-size: 11px; padding: 1px 6px; }
  .spinner { width: 10px; height: 10px; border-radius: 50%; border: 2px solid currentColor; border-right-color: transparent; animation: bank-spin .8s linear infinite; flex: none; }
  @keyframes bank-spin { to { transform: rotate(360deg); } }
  @media (max-width: 760px) { .picker-trigger { height: 44px; font-size: 16px; } .bank-btn { width: 44px; height: 44px; border-radius: 8px; } }
</style>
