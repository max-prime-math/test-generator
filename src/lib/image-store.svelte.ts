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

export { imageKeyFromReference, splitFilename } from './image-keys.ts';

const DB_NAME    = 'test-generator';
const DB_VERSION = 2;
const STORE      = 'images';

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
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'name' });
      }
      if (!db.objectStoreNames.contains('bankImages')) {
        const store = db.createObjectStore('bankImages', { keyPath: 'id' });
        store.createIndex('bankId', 'bankId');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const store       = transaction.objectStore(STORE);
        const req         = fn(store);
        req.onsuccess = () => resolve(req.result);
        req.onerror   = () => reject(req.error);
      }),
  );
}

// ── Reactive public API ─────────────────────────────────────────────────────

/**
 * Reactive image bag. Exposes a Svelte 5 $state list of known image names that
 * components can read to update UI when images are added/removed.
 */
class ImageStore {
  /** Sorted list of image basenames currently in the store. */
  names = $state<string[]>([]);

  /** Kick off initial load. */
  async init(): Promise<void> {
    try {
      const keys = await tx<IDBValidKey[]>('readonly', (s) => s.getAllKeys());
      this.names = keys.map((k) => String(k)).sort();
    } catch {
      // IndexedDB unavailable (private browsing on some platforms, etc.)
      this.names = [];
    }
  }

  async put(name: string, bytes: Uint8Array, ext: string): Promise<void> {
    const key = imageKeyFromReference(name) || name.trim();
    const record: StoredImage = {
      name: key,
      ext:   ext.toLowerCase(),
      mime:  mimeFor(ext),
      size:  bytes.byteLength,
      bytes,
    };
    await tx('readwrite', (s) => s.put(record));
    if (!this.names.includes(key)) {
      this.names = [...this.names, key].sort();
    }
  }

  async get(name: string): Promise<StoredImage | undefined> {
    const key = this.resolveName(name);
    const r = await tx<StoredImage | undefined>('readonly', (s) => s.get(key));
    return r;
  }

  async remove(name: string): Promise<void> {
    const key = this.resolveName(name);
    await tx('readwrite', (s) => s.delete(key));
    this.names = this.names.filter((n) => n !== key);
  }

  has(name: string): boolean {
    return this.names.includes(this.resolveName(name));
  }

  private resolveName(name: string): string {
    const key = imageKeyFromReference(name) || name.trim();
    const lower = key.toLowerCase();
    return this.names.find((n) => imageKeyFromReference(n).toLowerCase() === lower) ?? key;
  }
}

export const imageStore = new ImageStore();
imageStore.init();
