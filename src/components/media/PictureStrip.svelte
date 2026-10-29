<script lang="ts">
  import type { ImageOccurrence } from '../../lib/editor/image-references';
  import type { RepoDataImage } from '../../git/repoDataModel';
  import { imageOccurrences, imageMarkup, replaceOccurrence, replaceOccurrenceImage } from '../../lib/editor/image-references';
  import { bankWorkspaces } from '../../lib/bank-workspaces.svelte';
  import { bankView } from '../../lib/bank-switch-view.svelte';
  import { imageStore } from '../../lib/image-store.svelte';
  import PictureCard from './PictureCard.svelte';
  import ImageEditorModal from './ImageEditorModal.svelte';
  import MathGraphModal from './MathGraphModal.svelte';
  import InsertImageModal from '../InsertImageModal.svelte';
  let { value = $bindable(''), context, imageBankId }: { value?: string; context: string; imageBankId?: string } = $props();
  let images = $derived(imageOccurrences(value));
  let sourceMode = $derived(Boolean(imageBankId && imageBankId !== bankView.activeBankId));
  let sourceImages = $state<Record<string, RepoDataImage>>({});
  let sourceLoading = $state(false);
  $effect(() => {
    const bankId = imageBankId;
    const names = [...new Set(images.map(image => image.name))];
    const dormant = Boolean(bankId && bankId !== bankView.activeBankId);
    if (!dormant || !bankId || !names.length) { sourceImages = {}; sourceLoading = false; return; }
    let cancelled = false;
    sourceLoading = true;
    void bankWorkspaces.readDormantImages(bankId, names).then(found => {
      if (!cancelled) sourceImages = Object.fromEntries(found.map(image => [image.name.toLowerCase(), image]));
    }).catch(() => { if (!cancelled) sourceImages = {}; }).finally(() => { if (!cancelled) sourceLoading = false; });
    return () => { cancelled = true; };
  });
  let replacing = $state<ImageOccurrence | null>(null);
  let editing = $state<ImageOccurrence | null>(null);
  let graph = $state<ImageOccurrence | null>(null);
  let error = $state('');
  function change(action: () => string) { try { value = action(); error = ''; } catch (cause) { error = String(cause); } }
</script>
{#if images.length}
  <details class="picture-section">
    <summary>Pictures in this text · {images.length}</summary>
    <div class="picture-strip">
    {#each images as occurrence, index (`${index}:${occurrence.name}`)}
      <PictureCard {occurrence} sourceImage={sourceImages[occurrence.name.toLowerCase()]}
        sourceMode={sourceMode && (sourceLoading || Boolean(sourceImages[occurrence.name.toLowerCase()]) || !imageStore.has(occurrence.name))} {sourceLoading}
        onplace={(width, align) => change(() => replaceOccurrence(value, occurrence, imageMarkup(occurrence.name, width, align)))}
        onedit={() => editing = occurrence}
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
{#if editing}<ImageEditorModal name={editing.name} sourceBankId={sourceMode ? imageBankId : undefined} questionCopy onclose={() => editing = null} onsaved={name => {
  if (editing) change(() => replaceOccurrenceImage(value, editing!, name));
  editing = null;
}} />{/if}
{#if graph}<MathGraphModal imageName={graph.name} {context} sourceBankId={sourceMode ? imageBankId : undefined} oninsert={name => {
  if (graph) change(() => replaceOccurrenceImage(value, graph!, name));
  graph = null;
}} onclose={() => graph = null} />{/if}
<style>
  .picture-strip { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr)); gap: .7rem; margin-top: .65rem; }
  summary { font-size: 12px; color: var(--text-2); cursor: pointer; padding: .4rem 0; }
  p { font-size: 12px; color: var(--danger); }
</style>
