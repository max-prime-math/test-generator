/**
 * Browser-local image storage for question graphics.
 *
 * IndexedDB is used instead of localStorage because:
 *   - localStorage is ~5 MB per origin and strings-only (base64 adds 33%).
 *   - IndexedDB stores Uint8Array/Blob natively with much larger quotas.
 *
 * Images are keyed by basename (without extension) — this is the canonical
 * identifier used in LaTeX `\includegraphics{…}` commands. The extension is
 * stored as metadata so the Typst compile pipeline can mount the bytes at
 * the correct virtual path.
 */

import { imageKeyFromReference } from './image-keys.ts';
import { noteBrowserImageChange } from './browser-image-changes.ts';
import { bankWorkspaces } from './bank-workspaces.svelte.ts';
import { IMAGE_META_STORE, IMAGE_STORE, openImageDb, putImage, readImageMeta, request, transactionDone, type ImageMeta } from './image-db.ts';

export { imageKeyFromReference, splitFilename } from './image-keys.ts';


export interface StoredImage {
  name: string;     // basename without extension (key)
  ext:  string;     // lower-case, no dot: 'png' | 'jpg' | …
  mime: string;     // 'image/png' | 'image/jpeg' | …
  size: number;     // bytes
  bytes: Uint8Array;
}

const KNOWN_EXT_MIME: Record<string, string> = {
  png:  'image/png',
  jpg:  'image/jpeg',
  jpeg: 'image/jpeg',
  svg:  'image/svg+xml',
  webp: 'image/webp',
  gif:  'image/gif',
  bmp:  'image/bmp',
  pdf:  'application/pdf',
};

export function isSupportedExt(ext: string): boolean {
  return ext.toLowerCase() in KNOWN_EXT_MIME;
}

export function mimeFor(ext: string): string {
  return KNOWN_EXT_MIME[ext.toLowerCase()] ?? 'application/octet-stream';
}

// ── Low-level IndexedDB helpers ─────────────────────────────────────────────

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  const opening = openImageDb().then((db) => {
    // Another module or tab closing/upgrading the database invalidates our handle.
    db.addEventListener('close', () => { if (dbPromise === opening) dbPromise = null; });
    const upgrade = db.onversionchange;
    db.onversionchange = (event) => { if (dbPromise === opening) dbPromise = null; upgrade?.call(db, event); };
    return db;
  });
  dbPromise = opening;
  opening.catch(() => { if (dbPromise === opening) dbPromise = null; });
  return opening;
}

// ── Thumbnails ──────────────────────────────────────────────────────────────
// Object URLs are shared per image revision and reference counted. Unused ones
// stay in a small LRU for quick back-and-forth scrolling, then are revoked.
const MAX_IDLE_THUMBNAILS = 48;
const MAX_CONCURRENT_LOADS = 4;
interface Thumbnail { name: string; revision: string; url: Promise<{ url: string; graph: boolean } | undefined>; refs: number; revoked: boolean }
const thumbnails = new Map<string, Thumbnail>();
let activeLoads = 0;
const waitingLoads: (() => void)[] = [];

async function limited<T>(work: () => Promise<T>): Promise<T> {
  if (activeLoads >= MAX_CONCURRENT_LOADS) await new Promise<void>((resolve) => waitingLoads.push(resolve));
  activeLoads++;
  try { return await work(); }
  finally { activeLoads--; waitingLoads.shift()?.(); }
}

function revokeThumbnail(key: string, entry: Thumbnail): void {
  if (entry.revoked) return;
  entry.revoked = true;
  thumbnails.delete(key);
  void entry.url.then((loaded) => { if (loaded) URL.revokeObjectURL(loaded.url); });
}

function trimThumbnails(): void {
  const idle = [...thumbnails].filter(([, entry]) => entry.refs === 0);
  for (const [key, entry] of idle.slice(0, Math.max(0, idle.length - MAX_IDLE_THUMBNAILS))) revokeThumbnail(key, entry);
}

// ── Reactive public API ─────────────────────────────────────────────────────

/**
 * Reactive image bag. Exposes a Svelte 5 $state list of known image names that
 * components can read to update UI when images are added/removed.
 */
class ImageStore {
  /** Sorted list of image basenames currently in the store. */
  names = $state<string[]>([]);
  /** Metadata keyed by basename, used for display without loading bytes. */
  metadata = $state<Record<string, Pick<StoredImage, 'ext' | 'mime' | 'size'>>>({});
  /** Content revision per basename. Previews depend only on the images they use. */
  revisions = $state<Record<string, string>>({});

  /** Load lightweight metadata only; image bytes are read when displayed or compiled. */
  async init(): Promise<void> {
    try {
      const records = await readImageMeta(await openDb());
      this.#apply(records);
    } catch {
      // IndexedDB unavailable (private browsing on some platforms, etc.)
      this.#apply([]);
    }
  }

  #apply(records: ImageMeta[]): void {
    this.names = records.map((record) => record.name).sort();
    this.metadata = Object.fromEntries(records.map((record) => [record.name, { ext: record.ext, mime: record.mime, size: record.size }]));
    this.revisions = Object.fromEntries(records.map((record) => [record.name, record.revision]));
    for (const [key, entry] of [...thumbnails]) if (entry.refs === 0) revokeThumbnail(key, entry);
  }

  /** A dependency token for previews: changes only when a referenced image changes. */
  revisionOf(names: string[]): string {
    return names.map((name) => `${name}:${this.revisions[this.resolveName(name)] ?? '-'}`).join('|');
  }

  async put(name: string, bytes: Uint8Array, ext: string): Promise<void> {
    // The active image store is being swapped; a write now could land in the other bank.
    if (bankWorkspaces.switching) throw new Error('Wait for the bank switch to finish, then add the image again.');
    const key = imageKeyFromReference(name) || name.trim();
    const record: StoredImage = {
      name: key,
      ext:   ext.toLowerCase(),
      mime:  mimeFor(ext),
      size:  bytes.byteLength,
      bytes,
    };
    const transaction = (await openDb()).transaction([IMAGE_STORE, IMAGE_META_STORE], 'readwrite');
    const meta = putImage(transaction, record);
    await transactionDone(transaction);
    noteBrowserImageChange();
    if (!this.names.includes(key)) {
      this.names = [...this.names, key].sort();
    }
    this.metadata = {
      ...this.metadata,
      [key]: { ext: record.ext, mime: record.mime, size: record.size },
    };
    this.revisions = { ...this.revisions, [key]: meta.revision };
  }

  async get(name: string): Promise<StoredImage | undefined> {
    const key = this.resolveName(name);
    const db = await openDb();
    return request<StoredImage | undefined>(db.transaction(IMAGE_STORE, 'readonly').objectStore(IMAGE_STORE).get(key));
  }

  /**
   * A shared object URL for displaying one image. Call `release` when the image
   * is no longer shown; URLs are revoked once unused and evicted.
   */
  acquireThumbnail(name: string): { url: Promise<{ url: string; graph: boolean } | undefined>; release: () => void } {
    const resolved = this.resolveName(name);
    const revision = this.revisions[resolved] ?? '';
    const key = `${resolved}@${revision}`;
    let entry = thumbnails.get(key);
    if (!entry) {
      entry = { name: resolved, revision, refs: 0, revoked: false, url: limited(() => this.get(name)).then((image) => image && {
        url: URL.createObjectURL(new Blob([image.bytes as BlobPart], { type: image.mime })),
        graph: image.ext === 'svg' && new TextDecoder().decode(image.bytes).includes('<metadata id="math-graph-model">'),
      }) };
      entry.url.catch(() => thumbnails.delete(key));
      thumbnails.set(key, entry);
    } else {
      // Most recently used entries are evicted last.
      thumbnails.delete(key);
      thumbnails.set(key, entry);
    }
    entry.refs++;
    const held = entry;
    let released = false;
    return { url: held.url, release: () => {
      if (released) return;
      released = true;
      held.refs--;
      // A replaced or removed image's URL is never reused, so free it now.
      if (held.refs === 0 && this.revisions[held.name] !== held.revision) revokeThumbnail(key, held);
      trimThumbnails();
    } };
  }

  async remove(name: string): Promise<void> {
    const key = this.resolveName(name);
    const transaction = (await openDb()).transaction([IMAGE_STORE, IMAGE_META_STORE], 'readwrite');
    transaction.objectStore(IMAGE_STORE).delete(key);
    transaction.objectStore(IMAGE_META_STORE).delete(key);
    await transactionDone(transaction);
    noteBrowserImageChange();
    this.names = this.names.filter((n) => n !== key);
    const { [key]: _removed, ...metadata } = this.metadata;
    this.metadata = metadata;
    const { [key]: _revision, ...revisions } = this.revisions;
    this.revisions = revisions;
  }

  has(name: string): boolean {
    return this.names.includes(this.resolveName(name));
  }

  displayName(name: string): string {
    const key = this.resolveName(name);
    const ext = this.metadata[key]?.ext;
    return ext ? `${key}.${ext}` : key;
  }

  private resolveName(name: string): string {
    const key = imageKeyFromReference(name) || name.trim();
    if (key in this.revisions) return key;
    const lower = key.toLowerCase();
    return this.names.find((n) => imageKeyFromReference(n).toLowerCase() === lower) ?? key;
  }
}

export const imageStore = new ImageStore();
imageStore.init();
bankWorkspaces.participate({ apply: () => {}, after: () => imageStore.init() });
