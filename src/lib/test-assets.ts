import { imageStore, imageStoreReady } from './image-store.svelte';
import type { Narrative, Question } from './types';
import type { RepoDataImage } from '../git/repoDataModel';
import { contentImages } from './workspace-format';
import { workspaceCatalog } from './workspace-catalog.svelte';

/** Match legacy image names using metadata before opening any browser image payload. */
export async function readTestAssets(questions: Question[], narratives: Narrative[], config: unknown): Promise<RepoDataImage[]> {
  await imageStoreReady;
  const empty = new Uint8Array();
  const local = imageStore.names.map(name => ({ name, ext: imageStore.metadata[name].ext, bytes: empty }));
  const candidates = contentImages(questions, narratives, [...local, ...workspaceCatalog.images], config);
  const images: RepoDataImage[] = [];
  for (const image of candidates) {
    if (image.bytes !== empty) images.push(image);
    else {
      const stored = await imageStore.get(image.name);
      if (stored) images.push(stored);
    }
  }
  return images;
}
