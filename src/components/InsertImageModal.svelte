<!--
  Picture picker for the question editor: upload a new PNG/JPEG/SVG or reuse
  one already in the browser image store, then insert a Typst image call.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { portal } from '../lib/portal';
  import ImageThumbnail from './media/ImageThumbnail.svelte';
  import { imageMarkup } from '../lib/editor/image-references';
  import { imageStore, isSupportedExt, splitFilename } from '../lib/image-store.svelte';

  interface Props {
    initialName?: string;
    actionLabel?: string;
    oninsert: (typst: string) => void;
    onclose: () => void;
  }

  let { oninsert, onclose, initialName = '', actionLabel = 'Insert picture' }: Props = $props();

  const UPLOAD_EXTS = ['png', 'jpg', 'jpeg', 'svg', 'webp', 'gif'];

  let selected = $state(untrack(() => initialName));
  let search = $state('');
  let limit = $state(60);
  let widthPercent = $state(60);
  let centered = $state(true);
  let message = $state('');
  let uploading = $state(false);
  let previewUrl = $state<string | null>(null);

  let names = $derived(imageStore.names.filter(name => name.toLowerCase().includes(search.toLowerCase())));

  // Object URL for the selected image, revoked whenever the selection changes.
  $effect(() => {
    const name = selected;
    imageStore.metadata;
    if (!name) {
      previewUrl = null;
      return;
    }
    let url: string | null = null;
    let cancelled = false;
    void imageStore.get(name).then((image) => {
      if (cancelled || !image) return;
      url = URL.createObjectURL(new Blob([image.bytes as BlobPart], { type: image.mime }));
      previewUrl = url;
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
      previewUrl = null;
    };
  });

  /** Keep uploads from silently overwriting a picture another question uses. */
  function uniqueName(stem: string): string {
    if (!imageStore.has(stem)) return stem;
    for (let i = 2; i < 1000; i += 1) {
      const candidate = `${stem}-${i}`;
      if (!imageStore.has(candidate)) return candidate;
    }
    return `${stem}-${Date.now()}`;
  }

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    uploading = true;
    message = '';
    let saved = 0;
    let lastName = '';
    let skipped = 0;

    try {
    for (const file of Array.from(files)) {
      const { stem, ext } = splitFilename(file.name);
      if (!stem || !UPLOAD_EXTS.includes(ext) || !isSupportedExt(ext)) { skipped += 1; continue; }
      const name = uniqueName(stem);
      const bytes = new Uint8Array(await file.arrayBuffer());
      await imageStore.put(name, bytes, ext);
      saved += 1;
      lastName = name;
      if (name !== stem) message = `Saved as "${name}" — "${stem}" was already in use.`;
    }

    if (lastName) selected = lastName;
    if (skipped) {
      message = `${message ? `${message} ` : ''}${skipped} file${skipped !== 1 ? 's' : ''} skipped — use PNG, JPEG, SVG, WebP or GIF.`;
    } else if (!message && saved) {
      message = `${saved} image${saved !== 1 ? 's' : ''} uploaded.`;
    }
    } catch (error) { message = String(error); }
    finally { uploading = false; }
  }

  function insert() {
    if (!selected) return;
    const width = Number.isFinite(widthPercent) ? Math.min(100, Math.max(5, Math.round(widthPercent))) : 60;
    oninsert(imageMarkup(selected, width, centered ? 'center' : 'left'));
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.stopPropagation(); onclose(); }
  }
</script>

<svelte:window on:keydown={onkeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="sheet" use:portal onclick={(e) => e.stopPropagation()}>
  <div class="card" role="dialog" aria-modal="true" aria-label="Insert picture">
    <header>
      <h3>{actionLabel}</h3>
      <button class="ghost" onclick={onclose} title="Close">✕</button>
    </header>

    <div class="content">
      <div class="left">
        <label class="upload">
          <input
            type="file"
            multiple
            accept=".png,.jpg,.jpeg,.svg,.webp,.gif,image/*"
            onchange={(e) => { void upload(e.currentTarget.files); e.currentTarget.value = ''; }}
          />
          <span>{uploading ? 'Uploading…' : 'Upload pictures'}</span>
        </label>

        <p class="label">Already uploaded <span class="hint">({names.length})</span></p>
        <input type="search" aria-label="Search pictures" bind:value={search} oninput={() => limit = 60} placeholder="Search pictures…" />
        <div class="list">
          {#each names.slice(0, limit) as name}
            <button
              class="item"
              class:active={name === selected}
              onclick={() => (selected = name)}
              title={imageStore.displayName(name)}
            >
              <ImageThumbnail {name} />
              <span>{imageStore.displayName(name)}</span>
            </button>
          {:else}
            <p class="muted">No pictures yet — upload one above.</p>
          {/each}
        </div>

        {#if names.length > limit}<button onclick={() => limit += 60}>Show more pictures</button>{/if}
        {#if message}
          <p class="note">{message}</p>
        {/if}
      </div>

      <div class="right">
        <div class="preview">
          {#if previewUrl}
            <img src={previewUrl} alt={selected} />
          {:else}
            <span class="muted">Select a picture to preview</span>
          {/if}
        </div>

        <div class="options">
          <label class="opt">
            Width
            <input type="number" min="5" max="100" step="5" bind:value={widthPercent} />
            <span class="hint">% of the column</span>
          </label>
          <label class="check"><input type="checkbox" bind:checked={centered} /> Center on the page</label>
        </div>
      </div>
    </div>

    <footer>
      <button onclick={onclose}>Cancel</button>
      <button class="primary" onclick={insert} disabled={!selected || uploading}>{actionLabel}</button>
    </footer>
  </div>
</div>

<style>
  .sheet {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.35);
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 10px;
    z-index: 205;
  }

  .card {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25);
    width: min(calc(100% - 2rem), 900px);
    max-height: calc(100% - 2rem);
    display: flex;
    flex-direction: column;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.85rem 1rem;
    border-bottom: 1px solid var(--border);
  }

  header h3 { font-size: 14px; font-weight: 600; }

  .content {
    display: flex;
    gap: 1rem;
    padding: 1rem;
    overflow: hidden;
  }

  .left { width: 260px; flex-shrink: 0; display: flex; flex-direction: column; gap: 0.5rem; min-height: 0; }
  .right { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.75rem; }

  .upload {
    display: block;
    border: 1px dashed var(--border);
    border-radius: 8px;
    padding: 0.6rem;
    text-align: center;
    font-size: 12px;
    cursor: pointer;
    color: var(--text-2);
  }
  .upload:hover { border-color: var(--primary); color: var(--text); }
  .upload input { display: none; }

  .list {
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow-y: auto;
    max-height: 420px;
    min-height: 120px;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: .4rem;
  }

  .item {
    text-align: left;
    background: none;
    border: none;
    border-bottom: 1px solid var(--border);
    padding: 0.4rem 0.6rem;
    font-size: 12px;
    color: var(--text);
    cursor: pointer;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .item span { display: block; margin-top: .35rem; overflow: hidden; text-overflow: ellipsis; }
  .item:last-child { border-bottom: none; }
  .item:hover { background: var(--bg-2); }
  .item.active { background: color-mix(in srgb, var(--accent) 18%, transparent); font-weight: 600; }

  .preview {
    flex: 1;
    min-height: 160px;
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.5rem;
    overflow: hidden;
  }
  .preview img { max-width: 100%; max-height: 240px; object-fit: contain; }

  .options { display: flex; flex-direction: column; gap: 0.4rem; }

  .opt { display: flex; align-items: center; justify-content: flex-start; gap: 0.4rem; font-size: 12px; }
  .opt input { width: 5rem; font-size: 12px; }

  .check { display: flex; align-items: center; justify-content: flex-start; gap: 0.4rem; font-size: 12px; margin-bottom: 0; }

  .check input[type='checkbox'] { width: auto; flex: none; margin: 0; }

  .label { font-size: 12px; font-weight: 500; margin: 0; }
  .hint { font-weight: 400; color: var(--text-2); }
  .muted { color: var(--text-2); font-size: 12px; padding: 0.5rem; margin: 0; }
  .note { font-size: 11px; color: var(--text-2); margin: 0; }

  footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    border-top: 1px solid var(--border);
  }
  @media (max-width: 650px) { .content { flex-direction: column; overflow-y: auto; } .left { width: 100%; } .list { max-height: 220px; } .preview { min-height: 100px; } .preview img { max-height: 140px; } }
</style>
