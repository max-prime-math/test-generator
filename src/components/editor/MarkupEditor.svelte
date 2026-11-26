<script lang="ts">
  import { onMount } from 'svelte';
  import MathGraphModal from '../media/MathGraphModal.svelte';
  import PictureStrip from '../media/PictureStrip.svelte';
  import { imageMarkup } from '../../lib/editor/image-references';
  import InsertImageModal from '../InsertImageModal.svelte';
  import EditorTextarea from './EditorTextarea.svelte';
  let { value = $bindable(''), label, rows = 7, context = label, imageBankId }: { value?: string; label: string; rows?: number; context?: string; imageBankId?: string } = $props();
  let textarea = $state<HTMLTextAreaElement>();
  onMount(() => { if (label === 'Question' || label === 'Narrative') textarea?.focus(); });
  let graphOpen = $state(false);
  let imageOpen = $state(false);
  function insert(markup: string) {
    const field = textarea;
    if (!field) return;
    const start = field.selectionStart ?? value.length;
    const end = field.selectionEnd ?? start;
    value = `${value.slice(0, start)}\n\n${markup}\n\n${value.slice(end)}`;
    graphOpen = imageOpen = false;
    queueMicrotask(() => { field.focus(); field.setSelectionRange(start + markup.length + 4, start + markup.length + 4); });
  }
</script>
<div class="markup">
  <div class="heading"><strong>{label}</strong><div><button onclick={() => graphOpen = true}>▦ Add graph</button> <button onclick={() => imageOpen = true}>▣ Add picture</button></div></div>
  <EditorTextarea bind:element={textarea} bind:value {rows} {label} placeholder="Write {label.toLowerCase()} in Typst. Use $...$ for math." />
  <PictureStrip bind:value {context} {imageBankId} />
</div>
{#if graphOpen}<MathGraphModal {context} oninsert={name => insert(imageMarkup(name))} onclose={() => graphOpen = false} />{/if}
{#if imageOpen}<InsertImageModal oninsert={insert} onclose={() => imageOpen = false} />{/if}
<style>
  .markup { display: grid; gap: .5rem; }
  .heading { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: .5rem; }
  .heading button { font-size: 12px; }
</style>
