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
 * References to names not in the store are left untouched — Typst will emit
 * its own "file not found" diagnostic, which is the most informative error to
 * show the user.
 */

import { imageStore } from '../image-store.svelte';

/** Matches a quoted `/imgs/NAME` path in Typst source, with optional extension. */
const IMG_REF_RE = /"\/imgs\/([A-Za-z0-9_\-]+)(?:\.[A-Za-z0-9]+)?"/g;

/** Extract the set of image basenames referenced by a Typst source string. */
export function scanImageRefs(source: string): string[] {
  const names = new Set<string>();
  for (const m of source.matchAll(IMG_REF_RE)) names.add(m[1]);
  return [...names];
}

interface ShadowTarget {
  mapShadow(path: string, content: Uint8Array): void | Promise<void>;
  resetShadow(): void | Promise<void>;
}

/**
 * Resolve referenced images, mount them into the compiler shadow FS, and
 * return a rewritten source with full-extension paths.
 *
 * Callers should invoke `resetShadow()` on the compiler before compiling the
 * next unrelated document so stale images don't leak across compilations.
 */
export async function prepareImages(
  compiler: ShadowTarget,
  source: string,
): Promise<string> {
  const refs = scanImageRefs(source);
  if (refs.length === 0) return source;

  // Load all referenced images in parallel.
  const resolved = await Promise.all(
    refs.map(async (name) => ({ name, img: await imageStore.get(name) })),
  );

  const extByName = new Map<string, string>();
  for (const { name, img } of resolved) {
    if (!img) continue;
    extByName.set(name, img.ext);
    const path = `/imgs/${name}.${img.ext}`;
    await compiler.mapShadow(path, img.bytes);
  }

  if (extByName.size === 0) return source;

  // Rewrite each reference to include the real extension so Typst's image
  // loader picks the correct format.
  return source.replace(IMG_REF_RE, (full, name: string) => {
    const ext = extByName.get(name);
    return ext ? `"/imgs/${name}.${ext}"` : full;
  });
}
