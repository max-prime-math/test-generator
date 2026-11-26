/**
 * Bridges the IndexedDB image store to the Typst compiler's virtual filesystem.
 *
 * Question bodies reference images as `#image("/imgs/NAME", …)` where NAME is
 * the LaTeX basename (no extension). At compile time this module:
 *   1. Scans the source for `/imgs/NAME` references.
 *   2. Looks each NAME up in the image store.
 *   3. Mounts the bytes via compiler.mapShadow() at `/imgs/NAME.EXT` using the
 *      stored extension, and rewrites the source to reference that full path.
 *
 * Unresolved references remain untouched so unused conditional images do not
 * fail compilation. Their names accompany the document so a real file-load
 * failure can explain which images are missing instead of suggesting --root.
 */

import { imageKeyFromReference, imageStore, splitFilename } from '../image-store.svelte';

export interface PreviewImage {
  name: string;
  ext: string;
  bytes: Uint8Array;
}

/** Matches a quoted `/imgs/NAME` path in Typst source, with optional extension. */
const VIRTUAL_IMG_REF_RE = /"\/imgs\/([^"]+)"/g;
/** Matches the string path in a Typst `image("...")` call. */
const IMAGE_CALL_REF_RE = /(#?image\s*\(\s*)"([^"]+)"/g;

function imageKeyFromPath(path: string): string | null {
  if (/^[a-z]+:\/\//i.test(path)) return null;

  if (path.startsWith('/imgs/')) {
    return imageKeyFromReference(path) || null;
  }

  // Imported questions can use a bare basename (often an ExamView hash), or
  // a relative images/ path, without an extension. Resolve those too; the
  // stored image supplies the real extension before Typst sees the source.
  const { stem } = splitFilename(path);
  return stem || null;
}

/** Extract the set of image basenames referenced by a Typst source string. */
export function scanImageRefs(source: string): string[] {
  const names = new Set<string>();
  for (const m of source.matchAll(VIRTUAL_IMG_REF_RE)) {
    const name = imageKeyFromReference(`/imgs/${m[1]}`);
    if (name) names.add(name);
  }
  for (const m of source.matchAll(IMAGE_CALL_REF_RE)) {
    const name = imageKeyFromPath(m[2]);
    if (name) names.add(name);
  }
  return [...names];
}

interface ShadowTarget {
  mapShadow(path: string, content: Uint8Array): void | Promise<void>;
  resetShadow(): void | Promise<void>;
}

/**
 * Resolve referenced images, mount them into the compiler shadow FS, and
 * return rewritten source with full-extension paths and unresolved image names.
 *
 * Callers should invoke `resetShadow()` on the compiler before compiling the
 * next unrelated document so stale images don't leak across compilations.
 */
export async function prepareImages(
  compiler: ShadowTarget,
  source: string,
  suppliedImages: readonly PreviewImage[] = [],
): Promise<{ source: string; missingImages: string[] }> {
  const refs = scanImageRefs(source);
  if (refs.length === 0) return { source, missingImages: [] };

  const supplied = new Map(suppliedImages.map(image => [imageKeyFromReference(image.name).toLowerCase(), image]));

  // Load all referenced images in parallel.
  const resolved = await Promise.all(
    refs.map(async (name) => {
      const local = supplied.get(imageKeyFromReference(name).toLowerCase());
      // Supplied arrays belong to the bank snapshot. Clone them because the compiler worker
      // receives image buffers by transfer and would otherwise detach the stored snapshot.
      const img = local ? { ...local, bytes: new Uint8Array(local.bytes) } : await imageStore.get(name);
      return { name, img };
    }),
  );
  const missingImages = resolved.filter(({ img }) => !img).map(({ name }) => name);

  const extByName = new Map<string, string>();
  for (const { name, img } of resolved) {
    if (!img) continue;
    extByName.set(name, img.ext);
    const path = `/imgs/${name}.${img.ext}`;
    await compiler.mapShadow(path, img.bytes);
  }

  if (extByName.size === 0) return { source, missingImages };

  // Rewrite each reference to include the real extension so Typst's image
  // loader picks the correct format.
  const withVirtualRefs = source.replace(VIRTUAL_IMG_REF_RE, (full, path: string) => {
    const name = imageKeyFromReference(`/imgs/${path}`);
    const ext = extByName.get(name);
    return ext ? `"/imgs/${name}.${ext}"` : full;
  });

  const prepared = withVirtualRefs.replace(IMAGE_CALL_REF_RE, (full, prefix: string, path: string) => {
    const name = imageKeyFromPath(path);
    if (!name) return full;
    const ext = extByName.get(name);
    return ext ? `${prefix}"/imgs/${name}.${ext}"` : full;
  });
  return { source: prepared, missingImages };
}
