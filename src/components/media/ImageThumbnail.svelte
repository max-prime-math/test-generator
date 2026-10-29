<script lang="ts">
  import { imageStore, mimeFor } from '../../lib/image-store.svelte';
  import type { RepoDataImage } from '../../git/repoDataModel';
  let { name, sourceImage, sourceMode = false, sourceLoading = false, ongraph, height = 135 }: {
    name: string; sourceImage?: RepoDataImage; sourceMode?: boolean; sourceLoading?: boolean;
    height?: number; ongraph?: (editable: boolean) => void;
  } = $props();
  let url = $state('');
  let missing = $state(false);
  $effect(() => {
    const key = name;
    const supplied = sourceImage;
    const remote = sourceMode;
    const loading = sourceLoading;
    if (remote) {
      if (loading) { url = ''; missing = false; ongraph?.(false); return; }
      if (!supplied) { url = ''; missing = true; ongraph?.(false); return; }
      const next = URL.createObjectURL(new Blob([supplied.bytes as BlobPart], { type: supplied.mime ?? mimeFor(supplied.ext) }));
      url = next; missing = false;
      ongraph?.(supplied.ext === 'svg' && new TextDecoder().decode(supplied.bytes).includes('<metadata id="math-graph-model">'));
      return () => URL.revokeObjectURL(next);
    }
    imageStore.revisionOf([key]);
    let cancelled = false;
    const thumbnail = imageStore.acquireThumbnail(key);
    missing = false;
    void thumbnail.url.then(image => {
      if (cancelled) return;
      if (!image) { url = ''; missing = true; ongraph?.(false); return; }
      url = image.url;
      ongraph?.(image.graph);
    }).catch(() => { if (!cancelled) { url = ''; missing = true; } });
    return () => { cancelled = true; thumbnail.release(); };
  });
</script>
<div class="thumbnail" style:height={`${height}px`}>
  {#if url}<img src={url} alt={name} loading="lazy" />{:else}<span>{missing ? 'Picture not found in its bank' : 'Loading…'}</span>{/if}
</div>
<style>
  .thumbnail { width: 100%; display: grid; place-items: center; overflow: hidden; background: white; border: 1px solid var(--border); border-radius: 6px; }
  img { width: 100%; height: 100%; object-fit: contain; }
  span { color: #555; font-size: 12px; }
</style>
