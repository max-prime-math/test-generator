<script lang="ts">
  import { tick } from 'svelte';
  import { testEditor } from '../lib/test-editor.svelte';
  import { testLibrary } from '../lib/test-library.svelte';
  import { appSettings } from '../lib/app-settings.svelte';
  import { appState } from '../lib/app-state.svelte';
  import { CLASSES, DEMO_CLASSES } from '../lib/curriculum';
  import { customClasses } from '../lib/custom-classes.svelte';

  /** `ids` are bank question ids in display order; `note` explains anything the caller left out. */
  let { ids, note = '', ondone }: { ids: string[]; note?: string; ondone: (message: string, ok: boolean) => void } = $props();
  let open = $state(false);
  let alignRight = $state(false);
  let root = $state<HTMLDivElement>();
  let trigger = $state<HTMLButtonElement>();
  let currentName = $derived(testEditor.testId ? testLibrary.get(testEditor.testId)?.name ?? 'Saved test' : 'Unsaved test');
  let count = $derived(testEditor.config.selectedIds.length);
  const items = () => Array.from(root?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);

  async function toggle() {
    open = !open;
    if (!open) return;
    alignRight = !!trigger && trigger.getBoundingClientRect().left + 260 > window.innerWidth - 16;
    await tick();
    items()[0]?.focus();
  }
  function close(focus = true) { open = false; if (focus) trigger?.focus(); }
  function keydown(event: KeyboardEvent) {
    const list = items();
    const index = list.indexOf(document.activeElement as HTMLButtonElement);
    const move = { ArrowDown: index + 1, ArrowUp: index - 1, Home: 0, End: list.length - 1 }[event.key];
    // Stop here: Bank's list shortcuts also listen for arrows and Escape.
    if (move !== undefined) { event.preventDefault(); event.stopPropagation(); list[(move + list.length) % list.length]?.focus(); }
    else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
    else if (event.key === 'Tab') close(false);
  }
  function pointerdown(event: PointerEvent) { if (open && !root?.contains(event.target as Node)) close(false); }
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const withNote = (message: string) => [message, note].filter(Boolean).join(' · ');
  function defaults() {
    const classes = appState.demoMode ? [...CLASSES, ...DEMO_CLASSES, ...customClasses.classes] : [...CLASSES, ...customClasses.classes];
    return appSettings.createDefaultTestConfig(classes.find(c => c.id === appState.lastClassId)?.name ?? 'Test');
  }
  const failure = (busy: boolean) => testEditor.error || testEditor.recoveryError
    || (busy ? 'Build is busy saving a test. Try again in a moment.' : 'The current test could not be saved, so nothing was changed.');

  function addToCurrent() {
    close();
    if (!ids.length) { ondone(withNote('Nothing added'), false); return; }
    const name = currentName;
    const result = testEditor.addQuestions(ids);
    if (!result) { ondone(failure(testEditor.transitioning), false); return; }
    const message = result.added ? `Added ${plural(result.added, 'question')} to ${name}` : `Nothing added to ${name}`;
    const problem = testEditor.recoveryError || testEditor.error;
    ondone(withNote([message, result.existing && `${result.existing} already in test`, problem].filter(Boolean).join(' · ')), !problem);
  }
  async function addToNew() {
    close();
    if (!ids.length) { ondone(withNote('No new test started'), false); return; }
    const base = `Unsaved test – ${new Date().toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`;
    let keepName = base;
    for (let n = 2; testLibrary.tests.some(t => t.name === keepName); n++) keepName = `${base} (${n})`;
    const busy = testEditor.transitioning;
    const result = await testEditor.startNewTestWith(ids, defaults(), keepName);
    if (!result) { ondone(failure(busy), false); return; }
    ondone(withNote([`Started a new test with ${plural(ids.length, 'question')}`, result.kept && `Your previous unsaved test was kept as “${result.kept}”`].filter(Boolean).join(' · ')), true);
  }
</script>
<svelte:window onpointerdown={pointerdown} />
<div class="add-to" bind:this={root}>
  <button bind:this={trigger} class="add-to-trigger" aria-haspopup="menu" aria-expanded={open} onclick={toggle} disabled={testEditor.transitioning} title="Add the selected questions to a test">Add to…</button>
  {#if open}
    <div class="menu" class:right={alignRight} role="menu" aria-label="Add selected questions to" tabindex="-1" onkeydown={keydown}>
      <button role="menuitem" tabindex="-1" onclick={addToCurrent}><span>Current test</span><small>{currentName} · {plural(count, 'question')}</small></button>
      <button role="menuitem" tabindex="-1" onclick={addToNew}><span>New test</span><small>{testEditor.testId || count ? 'Your current test is kept' : 'Starts with just these questions'}</small></button>
    </div>
  {/if}
</div>
<style>
  .add-to { position: relative; display: inline-flex; }
  .menu { position: absolute; top: calc(100% + 4px); left: 0; z-index: 40; width: max-content; min-width: 13rem; max-width: min(18rem, calc(100vw - 32px)); padding: .25rem; display: grid; gap: 2px; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; box-shadow: 0 8px 24px rgba(0, 0, 0, .16); }
  .menu.right { left: auto; right: 0; }
  .menu button { display: grid; gap: .1rem; width: 100%; height: auto; padding: .45rem .6rem; text-align: left; background: none; border: none; border-radius: 5px; font-size: 12px; font-weight: 600; white-space: normal; color: var(--text); }
  .menu button:hover, .menu button:focus-visible { background: color-mix(in srgb, var(--primary) 12%, var(--bg)); outline: none; }
  .menu small { font-weight: 400; color: var(--text-2); font-size: 11px; overflow-wrap: anywhere; }
</style>
