<script lang="ts">
  import type { ImageOccurrence } from '../../lib/editor/image-references';
  import { imageOccurrences, imageMarkup, replaceOccurrence, replaceOccurrenceImage } from '../../lib/editor/image-references';
  import PictureCard from './PictureCard.svelte';
  import MathGraphModal from './MathGraphModal.svelte';
  import InsertImageModal from '../InsertImageModal.svelte';
  let { value = $bindable(''), context }: { value?: string; context: string } = $props();
  let images = $derived(imageOccurrences(value));
  let replacing = $state<ImageOccurrence | null>(null);
  let graph = $state<ImageOccurrence | null>(null);
  let error = $state('');
  function change(action: () => string) { try { value = action(); error = ''; } catch (cause) { error = String(cause); } }
</script>
{#if images.length}
  <details class="picture-section">
    <summary>Pictures in this text · {images.length}</summary>
    <div class="picture-strip">
    {#each images as occurrence, index (`${index}:${occurrence.name}`)}
      <PictureCard {occurrence}
        onplace={(width, align) => change(() => replaceOccurrence(value, occurrence, imageMarkup(occurrence.name, width, align)))}
        onreplace={() => replacing = occurrence}
        onremove={() => change(() => replaceOccurrence(value, occurrence, ''))}
        ongraph={() => graph = occurrence} />
    {/each}
    {#if error}<p role="alert">{error}</p>{/if}
    </div>
  </details>
{/if}
{#if replacing}<InsertImageModal initialName={replacing.name} actionLabel="Replace this picture" oninsert={markup => {
  const next = imageOccurrences(markup)[0];
  if (next && replacing) change(() => replaceOccurrenceImage(value, replacing!, next.name));
  replacing = null;
}} onclose={() => replacing = null} />{/if}
{#if graph}<MathGraphModal imageName={graph.name} {context} oninsert={name => {
  if (graph) change(() => replaceOccurrenceImage(value, graph!, name));
  graph = null;
}} onclose={() => graph = null} />{/if}
<style>
  .picture-strip { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr)); gap: .7rem; margin-top: .65rem; }
  summary { font-size: 12px; color: var(--text-2); cursor: pointer; padding: .4rem 0; }
  p { font-size: 12px; color: var(--danger); }
</style>
