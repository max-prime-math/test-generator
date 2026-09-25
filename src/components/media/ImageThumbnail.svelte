<script lang="ts">
  import { imageStore } from '../../lib/image-store.svelte';
  let { name, ongraph, height = 135 }: { name: string; height?: number; ongraph?: (editable: boolean) => void } = $props();
  let url = $state('');
  let missing = $state(false);
  $effect(() => {
    const key = name;
    imageStore.metadata;
    let cancelled = false;
    let objectUrl = '';
    url = ''; missing = false;
    void imageStore.get(key).then(image => {
      if (cancelled) return;
      if (!image) { missing = true; ongraph?.(false); return; }
      objectUrl = URL.createObjectURL(new Blob([image.bytes as BlobPart], { type: image.mime }));
      url = objectUrl;
      ongraph?.(image.ext === 'svg' && new TextDecoder().decode(image.bytes).includes('<metadata id="math-graph-model">'));
    }).catch(() => { if (!cancelled) missing = true; });
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  });
</script>
<div class="thumbnail" style:height={`${height}px`}>
  {#if url}<img src={url} alt={name} loading="lazy" />{:else}<span>{missing ? 'Image missing' : 'Loading…'}</span>{/if}
</div>
<style>
  .thumbnail { width: 100%; display: grid; place-items: center; overflow: hidden; background: white; border: 1px solid var(--border); border-radius: 6px; }
  img { width: 100%; height: 100%; object-fit: contain; }
  span { color: #555; font-size: 12px; }
</style>
