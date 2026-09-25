<script lang="ts">
  import { untrack } from 'svelte';
  import ImageThumbnail from './ImageThumbnail.svelte';
  import type { ImageOccurrence } from '../../lib/editor/image-references';
  let { occurrence, onplace, onreplace, onremove, ongraph }: {
    occurrence: ImageOccurrence;
    onplace: (width: number, alignment: ImageOccurrence['alignment']) => void;
    onreplace: () => void; onremove: () => void; ongraph: () => void;
  } = $props();
  let editableGraph = $state(false);
  let width = $state(untrack(() => occurrence.width));
  let alignment = $state(untrack(() => occurrence.alignment));
  $effect(() => { width = occurrence.width; alignment = occurrence.alignment; });
</script>
<div class="picture-card">
  <div class="preview-row">
    <ImageThumbnail name={occurrence.name} height={80} ongraph={value => editableGraph = value} />
    <div class="info"><strong>{occurrence.name}</strong><span>{editableGraph ? 'Editable Math Graph' : 'Picture'}</span></div>
  </div>
  {#if occurrence.simple}
    <details><summary>Size & alignment</summary><div class="placement"><label>Width (%)<input aria-label="Picture width" type="number" min="5" max="100" step="5" bind:value={width} /></label><label>Alignment<select aria-label="Picture alignment" bind:value={alignment}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label><button onclick={() => onplace(width, alignment)} disabled={!Number.isFinite(width) || width < 5 || width > 100}>Apply</button></div></details>
  {:else}<p>Custom Typst layout—adjust placement in the source.</p>{/if}
  <div class="actions">{#if editableGraph}<button class="primary" onclick={ongraph}>Edit graph</button>{/if}<button onclick={onreplace}>Replace picture</button>{#if occurrence.simple}<button onclick={onremove}>Remove from text</button>{/if}</div>
</div>
<style>
  .picture-card { border: 1px solid var(--border); border-radius: 8px; background: var(--bg-2); padding: .75rem; display: grid; gap: .65rem; }
  .preview-row { display: grid; grid-template-columns: 90px minmax(0, 1fr); gap: .65rem; align-items: center; }
  summary { cursor: pointer; font-size: 12px; color: var(--text-2); margin-bottom: .5rem; }
  .info { display: flex; flex-direction: column; flex-wrap: wrap; justify-content: space-between; gap: .3rem; font-size: 12px; overflow-wrap: anywhere; }
  .info span, p { color: var(--text-2); font-size: 11px; }
  .placement { display: flex; align-items: end; gap: .5rem; flex-wrap: wrap; }
  label { font-size: 11px; color: var(--text-2); display: grid; gap: .3rem; }
  input { width: 80px; } select { width: 110px; }
  .actions { display: flex; gap: .4rem; flex-wrap: wrap; }
  button { font-size: 12px; }
</style>
