<script lang="ts">
  import { onMount } from 'svelte';
  import MathGraphModal from '../media/MathGraphModal.svelte';
  import PictureStrip from '../media/PictureStrip.svelte';
  import { imageMarkup } from '../../lib/editor/image-references';
  import InsertImageModal from '../InsertImageModal.svelte';
  let { value = $bindable(''), label, rows = 7, context = label }: { value?: string; label: string; rows?: number; context?: string } = $props();
  let textarea: HTMLTextAreaElement;
  onMount(() => { if (label === 'Question') textarea.focus(); });
  let graphOpen = $state(false);
  let imageOpen = $state(false);
  function insert(markup: string) {
    const start = textarea.selectionStart ?? value.length;
    const end = textarea.selectionEnd ?? start;
    value = `${value.slice(0, start)}\n\n${markup}\n\n${value.slice(end)}`;
    graphOpen = imageOpen = false;
    queueMicrotask(() => { textarea.focus(); textarea.setSelectionRange(start + markup.length + 4, start + markup.length + 4); });
  }
</script>
<div class="markup">
  <div class="heading"><strong>{label}</strong><div><button onclick={() => graphOpen = true}>▦ Add graph</button> <button onclick={() => imageOpen = true}>▣ Add picture</button></div></div>
  <textarea bind:this={textarea} bind:value {rows} aria-label={label} placeholder="Write {label.toLowerCase()} in Typst. Use $...$ for math."></textarea>
  <PictureStrip bind:value {context} />
</div>
{#if graphOpen}<MathGraphModal {context} oninsert={name => insert(imageMarkup(name))} onclose={() => graphOpen = false} />{/if}
{#if imageOpen}<InsertImageModal oninsert={insert} onclose={() => imageOpen = false} />{/if}
<style>
  .markup { display: grid; gap: .5rem; }
  .heading { display: flex; align-items: center; justify-content: space-between; gap: .5rem; }
  .heading button { font-size: 12px; }
  textarea { width: 100%; resize: vertical; min-height: 120px; font-family: ui-monospace, monospace; line-height: 1.5; }
</style>
