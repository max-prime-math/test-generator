<script lang="ts">
  import { portal } from '../../lib/portal';
  import { imageStore, splitFilename } from '../../lib/image-store.svelte';
  import { imageUsage, usageCount, renameImage, replaceImage, deleteImage } from '../../lib/editor/image-library';
  import ImageThumbnail from './ImageThumbnail.svelte';
  let { onclose }: { onclose: () => void } = $props();
  let search = $state('');
  let limit = $state(60);
  let selected = $state('');
  let name = $state('');
  let message = $state('');
  let busy = $state(false);
  let pendingFile = $state<File | null>(null);
  let pendingUrl = $state('');
  let usage = $derived(selected ? imageUsage(selected) : null);
  let names = $derived(imageStore.names.filter(n => n.toLowerCase().includes(search.toLowerCase())));
  $effect(() => {
    if (!pendingFile) { pendingUrl = ''; return; }
    const url = URL.createObjectURL(pendingFile); pendingUrl = url;
    return () => URL.revokeObjectURL(url);
  });
  function select(key: string) { selected = key; name = key; message = ''; pendingFile = null; }
  async function run(action: () => Promise<void>) {
    if (busy) return;
    busy = true; message = '';
    try { await action(); } catch (error) { message = String(error); } finally { busy = false; }
  }
  async function upload(files: FileList | null) {
    if (!files) return;
    await run(async () => {
      for (const file of Array.from(files)) {
        const { stem, ext } = splitFilename(file.name);
        if (!['png', 'jpg', 'jpeg', 'svg', 'webp', 'gif'].includes(ext)) throw new Error('Use PNG, JPEG, SVG, WebP or GIF.');
        const base = stem.replace(/[^a-zA-Z0-9_-]/g, '-') || 'image';
        let key = base, index = 2;
        while (imageStore.has(key)) key = `${base}-${index++}`;
        await imageStore.put(key, new Uint8Array(await file.arrayBuffer()), ext); select(key);
      }
    });
  }
</script>
<svelte:window onkeydown={e => { if (e.key === 'Escape' && !busy) onclose(); }} />
<div class="library-overlay" use:portal>
  <div class="library" role="dialog" aria-modal="true" aria-label="Image library">
    <header><div><h2>Image library</h2><p>Manage the shared image files in this bank.</p></div><button onclick={onclose} disabled={busy}>Close</button></header>
    <div class="library-body">
      <div class="catalog">
        <label class="upload">Upload images<input type="file" multiple accept=".png,.jpg,.jpeg,.svg,.webp,.gif" disabled={busy} onchange={e => { void upload(e.currentTarget.files); e.currentTarget.value = ''; }} /></label>
        <input aria-label="Search image library" type="search" bind:value={search} oninput={() => limit = 60} placeholder="Search images…" />
        <div class="tiles">{#each names.slice(0, limit) as key (key)}<button class="tile" class:active={selected === key} onclick={() => select(key)} disabled={busy}><ImageThumbnail name={key} /><span>{imageStore.displayName(key)}</span></button>{/each}</div>
        {#if names.length > limit}<button onclick={() => limit += 60}>Show more images ({names.length - limit} remaining)</button>{/if}
        {#if !names.length}<p>No matching images. Upload pictures to get started.</p>{/if}
      </div>
      <div class="inspector">
        {#if selected && usage}
          <ImageThumbnail name={selected} />
          <strong>{imageStore.displayName(selected)}</strong>
          <p class="usage">Used by {usage.questions.length} bank questions, {usage.drafts.length} editor drafts, {usage.narratives.length} narratives and {usage.tests.length} saved tests{usage.testDraft ? ', plus the test draft' : ''}{usage.ingest ? ', plus an import draft' : ''}.</p>
          <label>Image name (without extension)<input aria-label="Image name" bind:value={name} disabled={busy} /></label>
          <button onclick={() => run(async () => { select(await renameImage(selected, name)); message = 'Renamed and references updated.'; })} disabled={busy || name === selected}>Rename and update references</button>
          <label class="upload">Choose replacement file<input aria-label="Replacement file" type="file" accept=".png,.jpg,.jpeg,.svg,.webp,.gif" disabled={busy} onchange={e => pendingFile = e.currentTarget.files?.[0] ?? null} /></label>
          {#if pendingFile}
            <img class="replacement-preview" src={pendingUrl} alt="Replacement preview" />
            <p>Replace {imageStore.displayName(selected)} with {pendingFile.name}. This changes every use of this shared file listed above.</p>
            <button class="primary" disabled={busy} onclick={() => run(async () => { await replaceImage(selected, pendingFile!); pendingFile = null; message = 'Image replaced and references updated.'; })}>Replace shared file</button>
            <button onclick={() => pendingFile = null} disabled={busy}>Cancel replacement</button>
          {/if}
          <button class="danger" disabled={busy || usageCount(usage) > 0} onclick={() => { if (confirm(`Delete unused image “${selected}”?`)) void run(async () => { await deleteImage(selected); selected = ''; message = 'Image deleted.'; }); }}>Delete unused file</button>
          {#if usageCount(usage)}<p>To delete, first remove or replace this image in the questions, drafts or tests that use it.</p>{/if}
        {:else}<p>Select an image to rename, replace or delete it.</p>{/if}
        {#if message}<p role="status">{message}</p>{/if}
      </div>
    </div>
  </div>
</div>
<style>
  .library-overlay { position: fixed; inset: 0; z-index: 200; padding: 1rem; background: #0008; display: grid; place-items: center; }
  .library { width: min(1150px, 100%); height: min(850px, 100%); display: flex; flex-direction: column; background: var(--bg); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
  header { display: flex; justify-content: space-between; align-items: center; padding: 1rem; border-bottom: 1px solid var(--border); }
  h2 { font-size: 18px; } p { color: var(--text-2); font-size: 12px; line-height: 1.5; margin: .35rem 0; }
  .library-body { flex: 1; min-height: 0; display: grid; grid-template-columns: 1fr 340px; }
  .catalog, .inspector { overflow-y: auto; padding: 1rem; }
  .inspector { border-left: 1px solid var(--border); display: flex; flex-direction: column; gap: .65rem; }
  .tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(155px, 1fr)); gap: .6rem; margin-top: 1rem; }
  .tile { padding: .4rem; background: var(--bg-2); text-align: left; min-width: 0; } .tile span { display: block; margin-top: .3rem; overflow-wrap: anywhere; font-size: 12px; } .tile.active { outline: 2px solid var(--accent); }
  .upload { display: grid; gap: .4rem; margin-bottom: .7rem; font-size: 12px; } label { font-size: 12px; display: grid; gap: .4rem; }
  input { width: 100%; min-width: 0; } .replacement-preview { width: 100%; max-height: 150px; object-fit: contain; background: white; }
  @media (max-width: 700px) { .library-overlay { padding: 0; } .library-body { grid-template-columns: 1fr; overflow-y: auto; } .catalog, .inspector { overflow: visible; } .catalog { max-height: 45vh; overflow-y: auto; } }
</style>
