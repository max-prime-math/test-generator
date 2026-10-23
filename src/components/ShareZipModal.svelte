<script lang="ts">
  import { onMount } from 'svelte';
  import { portal } from '../lib/portal';
  import { bankView } from '../lib/bank-switch-view.svelte';
  import { testLibrary } from '../lib/test-library.svelte';
  import { customClasses } from '../lib/custom-classes.svelte';
  import { workspaceCatalog } from '../lib/workspace-catalog.svelte';
  import { CLASSES, DEMO_CLASSES } from '../lib/curriculum';
  import { mergeWorkspaceClasses } from '../lib/workspace-format';
  import { readShareZip } from '../lib/share-package-client';
  import { SHARE_MAX_BYTES, type ShareKind, type SharePackage } from '../lib/share-package';
  import { exportBankZip, exportTestsZip, importBankZip, importTestsZip, downloadShareZip } from '../lib/sharing';

  let { kind, importing = false, initialBankId = '', initialTestIds = [], initialClass = 'all', onclose, onbankimport }:
    { kind: ShareKind; importing?: boolean; initialBankId?: string; initialTestIds?: string[]; initialClass?: string; onclose: () => void; onbankimport?: (id: string) => void } = $props();
  let dialog: HTMLDialogElement;
  let bankId = $state(initialBankId || bankView.activeBankId);
  let course = $state(initialClass);
  let selected = $state<string[]>([...initialTestIds]);
  let incoming = $state.raw<SharePackage | null>(null);
  let incomingSelection = $state<number[]>([]);
  let bankName = $state('');
  let busy = $state(false);
  let error = $state('');
  let status = $state('');
  let completed = $state(false);
  let download = $state.raw<{ bytes: Uint8Array; name: string } | null>(null);
  const title = $derived(`${importing ? 'Import' : 'Export'} ${kind === 'bank' ? 'bank' : 'tests'} ZIP`);
  const classes = $derived(mergeWorkspaceClasses([...customClasses.catalog, ...workspaceCatalog.classes, ...CLASSES, ...DEMO_CLASSES]));
  const courses = $derived([...new Set(testLibrary.tests.map(test => test.classId))]);
  const visible = $derived(testLibrary.tests.filter(test => course === 'all' || (course === '__none__' ? !test.classId : test.classId === course)).toSorted((a, b) => a.name.localeCompare(b.name)));
  const chosen = $derived(testLibrary.tests.filter(test => selected.includes(test.id)));
  const count = $derived(importing ? incomingSelection.length : chosen.length);

  onMount(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.showModal();
    return () => { dialog.close(); previous?.focus(); };
  });

  async function run(message: string, action: () => Promise<void>) {
    if (busy) return;
    busy = true; error = ''; status = message;
    try { await action(); }
    catch (cause) { error = cause instanceof Error ? cause.message : String(cause); status = ''; }
    finally { busy = false; }
  }

  async function read(file?: File) {
    if (!file) return;
    incoming = null; completed = false; incomingSelection = [];
    await run('Reading and checking ZIP…', async () => {
      if (file.size > SHARE_MAX_BYTES) throw new Error('Choose a ZIP smaller than 200 MB.');
      const pack = await readShareZip(new Uint8Array(await file.arrayBuffer()));
      if (pack.kind !== kind) throw new Error(`This ZIP contains ${pack.kind === 'bank' ? 'a bank' : 'tests'}. Open Import ${pack.kind === 'bank' ? 'bank' : 'tests'} ZIP to add it.`);
      incoming = pack;
      incomingSelection = pack.items.map((_, index) => index);
      const base = pack.items[0].name;
      bankName = base;
      for (let n = 2; bankView.banks.some(bank => bank.name === bankName); n++) bankName = `${base} (${n})`;
      status = 'ZIP checked. Review the contents below, then import.';
    });
  }

  async function exportZip() {
    await run('Preparing ZIP with questions and pictures…', async () => {
      const name = kind === 'bank' ? bankView.banks.find(bank => bank.id === bankId)?.name ?? 'Bank' : chosen.length === 1 ? chosen[0].name : course === 'all' ? 'TestGen-tests' : `${classes.find(cls => cls.id === course)?.name ?? 'Class'}-tests`;
      const bytes = kind === 'bank' ? await exportBankZip(bankId) : await exportTestsZip(chosen);
      download = { bytes, name };
      downloadShareZip(bytes, name);
      status = `ZIP prepared. Download started with ${kind === 'bank' ? 'the bank' : `${chosen.length} ${chosen.length === 1 ? 'test' : 'tests'}`} and its pictures.`;
    });
  }

  async function importZip() {
    if (!incoming) return;
    await run('Saving imported copies in this browser…', async () => {
      if (kind === 'bank') {
        const bank = await importBankZip(incoming!, bankName);
        onbankimport?.(bank.id);
        status = `Added “${bank.name}” as a separate bank in this browser.`;
      } else {
        const tests = await importTestsZip({ kind: 'tests', items: incoming!.items.filter((_, index) => incomingSelection.includes(index)) });
        status = `Added ${tests.length} ${tests.length === 1 ? 'test copy' : 'test copies'} to Saved Tests in this browser.`;
      }
      completed = true;
    });
  }
</script>

<dialog bind:this={dialog} use:portal aria-labelledby="share-zip-title" oncancel={event => { event.preventDefault(); if (!busy) onclose(); }}>
  <header><h2 id="share-zip-title">{title}</h2><button onclick={onclose} disabled={busy} aria-label="Close ZIP sharing">Close</button></header>
  <div class="content" aria-busy={busy}>
    <p>{kind === 'bank' ? 'Share reusable bank questions, narratives, curriculum, pictures, and editable graphs.' : 'Share saved tests with their question copies, answers, pictures, graphs, points, order, and page layout.'}</p>
    <p class="hint">{importing ? 'Imports add separate copies. Your existing work is preserved.' : kind === 'tests' ? 'Only saved content is included. Save current edits before exporting.' : 'Editor drafts and saved tests are separate from the bank.'} Student records and scores are excluded.</p>
    {#if importing}
      {#if !completed}
        <label class="file-label">Choose a TestGen ZIP<input type="file" accept=".zip,application/zip" disabled={busy} onchange={event => { void read(event.currentTarget.files?.[0]); event.currentTarget.value = ''; }} /></label>
        {#if incoming}
          {#if kind === 'bank'}
            <label>New bank name<input bind:value={bankName} maxlength="500" disabled={busy} /></label>
            <p>{incoming.items[0].data.questions.length} questions · {incoming.items[0].data.narratives?.length ?? 0} narratives · {incoming.items[0].data.images?.length ?? 0} pictures</p>
          {:else}
            <div class="selection-actions"><button disabled={busy} onclick={() => incomingSelection = incoming!.items.map((_, index) => index)}>Select all tests</button><button disabled={busy} onclick={() => incomingSelection = []}>Clear selection</button><span>{count} selected</span></div>
            <div class="items">{#each incoming.items as item, index}<label class="item"><input type="checkbox" checked={incomingSelection.includes(index)} disabled={busy} onchange={event => incomingSelection = event.currentTarget.checked ? [...incomingSelection, index] : incomingSelection.filter(value => value !== index)} /><span><strong>{item.name}</strong><small>{item.data.savedTests[0].config.selectedIds.length} questions · {item.data.images?.length ?? 0} pictures</small></span></label>{/each}</div>
          {/if}
        {/if}
      {/if}
    {:else if kind === 'bank'}
      <label>Bank to export<select bind:value={bankId} disabled={busy}>{#each bankView.banks as bank}<option value={bank.id}>{bank.name}</option>{/each}</select></label>
    {:else}
      <label>Class<select bind:value={course} disabled={busy} onchange={() => selected = []}><option value="all">All classes</option>{#each courses as id}<option value={id ?? '__none__'}>{classes.find(cls => cls.id === id)?.name ?? id ?? 'No class'}</option>{/each}</select></label>
      <div class="selection-actions"><button disabled={busy || !visible.length} onclick={() => selected = visible.map(test => test.id)}>Select all shown ({visible.length})</button><button disabled={busy} onclick={() => selected = []}>Clear selection</button><span>{count} selected</span></div>
      <div class="items">{#each visible as test (test.id)}<label class="item"><input type="checkbox" checked={selected.includes(test.id)} disabled={busy} onchange={event => selected = event.currentTarget.checked ? [...selected, test.id] : selected.filter(id => id !== test.id)} /><span><strong>{test.name}</strong><small>{classes.find(cls => cls.id === test.classId)?.name ?? test.classId ?? 'No class'} · {test.config.selectedIds.length} questions{test.archivedAt ? ' · Archived' : ''}</small></span></label>{/each}{#if !visible.length}<p>No saved tests in this class. Save a test in Build to share it.</p>{/if}</div>
    {/if}
    {#if status}<p class="status" role="status">{status}</p>{/if}
    {#if error}<p class="error" role="alert">{error}</p>{/if}
  </div>
  <footer>
    {#if download}<button disabled={busy} onclick={() => downloadShareZip(download!.bytes, download!.name)}>Download ZIP again</button>{/if}
    {#if completed}<button class="primary" onclick={onclose}>Done</button>
    {:else if importing}<button class="primary" disabled={busy || !incoming || (kind === 'bank' ? !bankName.trim() : !count)} onclick={importZip}>{busy ? 'Importing…' : kind === 'bank' ? 'Import as new bank' : `Import ${count} ${count === 1 ? 'test' : 'tests'} as copies`}</button>
    {:else}<button class="primary" disabled={busy || (kind === 'bank' ? !bankId : !count)} onclick={exportZip}>{busy ? 'Preparing…' : kind === 'bank' ? 'Export bank ZIP' : `Export ${count} ${count === 1 ? 'test' : 'tests'} ZIP`}</button>{/if}
  </footer>
</dialog>

<style>
  dialog { width: min(640px, calc(100vw - 2rem)); max-height: calc(100dvh - 2rem); margin: auto; box-sizing: border-box; padding: 0; border: 1px solid var(--border); border-radius: 12px; color: var(--text); background: var(--bg); box-shadow: 0 16px 60px #0005; }
  dialog::backdrop { background: #0007; }
  header, footer { display: flex; gap: .6rem; align-items: center; padding: 1rem 1.25rem; }
  header { justify-content: space-between; border-bottom: 1px solid var(--border); }
  h2 { font-size: 1.2rem; margin: 0; }
  footer { justify-content: flex-end; border-top: 1px solid var(--border); flex-wrap: wrap; }
  .content { padding: .25rem 1.25rem 1rem; }
  p { line-height: 1.5; }
  .hint, small { color: var(--text-2); font-size: .85rem; }
  label { display: flex; flex-direction: column; gap: .4rem; margin-top: .8rem; font-weight: 600; }
  input:not([type="checkbox"]), select { width: 100%; box-sizing: border-box; min-height: 38px; }
  .items { max-height: 34vh; overflow: auto; margin-top: .7rem; border: 1px solid var(--border); border-radius: 6px; }
  .items > p { padding: 0 .7rem; }
  .item { flex-direction: row; align-items: center; gap: .65rem; padding: .7rem; margin: 0; cursor: pointer; font-weight: 400; border-bottom: 1px solid var(--border); }
  .item:last-child { border-bottom: 0; }
  .item:has(input:checked) { background: var(--bg-2); }
  .item input { flex: none; width: auto; margin: 0; }
  .item span { display: flex; flex-direction: column; gap: .25rem; overflow-wrap: anywhere; min-width: 0; }
  .selection-actions { display: flex; align-items: center; gap: .5rem; flex-wrap: wrap; margin-top: .8rem; font-size: .85rem; }
  .status { background: var(--bg-2); padding: .6rem; border-radius: 6px; }
  .error { color: var(--danger); }
  button:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  @media (max-width: 640px) { button { min-height: 44px; } }
</style>
