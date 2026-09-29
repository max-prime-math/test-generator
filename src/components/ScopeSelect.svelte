<script lang="ts">
  import { tick } from 'svelte';

  /**
   * A compact multi-select: the button names what is checked, and the menu
   * checks several options or picks just one with "only". Nothing checked
   * means every option, like an unchecked filter group.
   */
  interface Option { id: string; label: string; count: number; pinned?: boolean }

  let {
    label,
    allLabel,
    options,
    selected = $bindable([]),
  }: { label: string; allLabel: string; options: Option[]; selected?: string[] } = $props();

  let open = $state(false);
  let query = $state('');
  let root: HTMLDivElement | undefined = $state();
  let button: HTMLButtonElement | undefined = $state();
  let menu: HTMLDivElement | undefined = $state();

  const menuId = `scope-${Math.random().toString(36).slice(2, 9)}`;

  let selectedLabels = $derived(selected.map(id => options.find(o => o.id === id)?.label ?? id));
  let summary = $derived(
    selectedLabels.length === 0 ? allLabel
      : selectedLabels.length === 1 ? selectedLabels[0]
      : `${selectedLabels[0]} +${selectedLabels.length - 1}`,
  );
  let pinned = $derived(options.filter(o => o.pinned));
  let listed = $derived(options.filter(o => !o.pinned &&
    (!query.trim() || o.label.toLowerCase().includes(query.trim().toLowerCase()))));

  function toggle(id: string) {
    selected = selected.includes(id) ? selected.filter(v => v !== id) : [...selected, id];
  }

  function only(id: string) {
    selected = [id];
    close();
  }

  function all() {
    selected = [];
    close();
  }

  function close() {
    open = false;
    query = '';
    tick().then(() => button?.focus());
  }

  $effect(() => {
    if (!open) return;
    tick().then(() => menu?.querySelector<HTMLElement>('input')?.focus());
    const onPointer = (e: PointerEvent) => {
      if (root && !root.contains(e.target as Node)) { open = false; query = ''; }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey, true);
    };
  });
</script>

{#snippet row(option: Option)}
  {@const checked = selected.includes(option.id)}
  <div class="scope-option" class:empty={option.count === 0 && !checked} data-id={option.id}>
    <label>
      <input type="checkbox" {checked} onchange={() => toggle(option.id)} />
      <span class="scope-option-name" title={option.label}>{option.label}</span>
      <span class="scope-option-count">{option.count}</span>
    </label>
    <button class="scope-only" aria-label={`Only ${option.label}`} onclick={() => only(option.id)}>only</button>
  </div>
{/snippet}

<div class="scope-select" bind:this={root}>
  <button bind:this={button} class="scope-trigger" class:active={selected.length > 0}
    aria-haspopup="true" aria-expanded={open} aria-controls={menuId} aria-label={`${label}: ${summary}`}
    title={selectedLabels.length > 1 ? selectedLabels.join(', ') : undefined}
    onclick={() => open ? close() : (open = true)}>
    <span class="scope-summary">{summary}</span><span class="scope-caret" aria-hidden="true">▾</span>
  </button>
  {#if open}
    <div class="scope-menu" id={menuId} role="group" aria-label={label} bind:this={menu}>
      {#if options.length > 7}
        <input class="scope-search" type="search" placeholder={`Find ${label.toLowerCase()}…`}
          aria-label={`Find ${label.toLowerCase()}`} bind:value={query} />
      {/if}
      <div class="scope-list">
        {#each pinned as option (option.id)}{@render row(option)}{/each}
        {#if pinned.length && listed.length}<hr />{/if}
        {#each listed as option (option.id)}{@render row(option)}{/each}
        {#if !pinned.length && !listed.length}<p class="scope-empty">No matches.</p>{/if}
      </div>
      <div class="scope-foot">
        <button class="ghost small" onclick={all}>{allLabel}</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .scope-select { position: relative; min-width: 0; }
  .scope-trigger {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 12px;
    text-align: left;
  }
  .scope-trigger.active { border-color: var(--primary); }
  .scope-summary { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .scope-caret { flex: none; color: var(--text-2); font-size: 10px; }
  .scope-menu {
    position: absolute;
    top: calc(100% + 0.25rem);
    left: 0;
    right: 0;
    min-width: min(240px, 100%);
    z-index: 20;
    display: flex;
    flex-direction: column;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  }
  .scope-search { margin: 0.5rem 0.5rem 0; font-size: 12px; padding: 0.25rem 0.4rem; }
  .scope-list { max-height: 260px; overflow-y: auto; padding: 0.25rem; }
  .scope-list hr { border: none; border-top: 1px solid var(--border); margin: 0.25rem 0; }
  .scope-option { display: flex; align-items: center; border-radius: 5px; }
  .scope-option:hover, .scope-option:focus-within { background: var(--bg-2); }
  .scope-option label {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.25rem 0.35rem;
    font-size: 12px;
    cursor: pointer;
  }
  .scope-option input { width: auto; flex: none; margin: 0; }
  .scope-option.empty label { color: var(--text-2); }
  .scope-option-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .scope-option-count { flex: none; font-size: 10px; color: var(--text-2); }
  .scope-only {
    flex: none;
    border: none;
    background: transparent;
    color: var(--primary);
    font-size: 11px;
    padding: 0.2rem 0.4rem;
    opacity: 0;
  }
  .scope-option:hover .scope-only, .scope-only:focus-visible { opacity: 1; }
  @media (hover: none) { .scope-only { opacity: 1; } }
  .scope-empty { font-size: 11px; color: var(--text-2); margin: 0; padding: 0.5rem; }
  .scope-foot { display: flex; padding: 0.4rem 0.5rem; border-top: 1px solid var(--border); }
  .scope-foot button { flex: 1; font-size: 11px; }
</style>
