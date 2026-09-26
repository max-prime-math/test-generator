/**
 * The browser image database. `images` holds payloads (bytes); `imageMeta`
 * holds a small record per image so listing the library never reads bytes.
 * Every write to `images` goes through this module and updates both stores in
 * one transaction. Version 3 adds `imageMeta`; the upgrade builds it from the
 * existing images inside the versionchange transaction, so an interrupted
 * migration rolls back to version 2 intact and simply runs again.
 */
export const IMAGE_DB_NAME = 'test-generator';
export const IMAGE_DB_VERSION = 3;
export const IMAGE_STORE = 'images';
export const IMAGE_META_STORE = 'imageMeta';
export const BANK_IMAGE_STORE = 'bankImages';

export interface ImagePayload { name: string; ext: string; mime: string; size: number; bytes: Uint8Array }
/** Repository images may omit derived fields. */
export type ImageInput = Omit<ImagePayload, 'mime' | 'size'> & Partial<Pick<ImagePayload, 'mime' | 'size'>>;
export interface ImageMeta { name: string; ext: string; mime: string; size: number; revision: string }

export function upgradeImageDb(database: IDBDatabase, transaction: IDBTransaction | null): void {
  if (!database.objectStoreNames.contains(IMAGE_STORE)) database.createObjectStore(IMAGE_STORE, { keyPath: 'name' });
  if (!database.objectStoreNames.contains(BANK_IMAGE_STORE)) {
    database.createObjectStore(BANK_IMAGE_STORE, { keyPath: 'id' }).createIndex('bankId', 'bankId');
  }
  if (!database.objectStoreNames.contains(IMAGE_META_STORE)) {
    const meta = database.createObjectStore(IMAGE_META_STORE, { keyPath: 'name' });
    if (!transaction) return;
    const cursor = transaction.objectStore(IMAGE_STORE).openCursor();
    cursor.onsuccess = () => {
      const current = cursor.result;
      if (!current) return;
      meta.put(metaFor(current.value as ImagePayload));
      current.continue();
    };
  }
}

export function openImageDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB is unavailable.'));
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(IMAGE_DB_NAME, IMAGE_DB_VERSION);
    open.onupgradeneeded = () => upgradeImageDb(open.result, open.transaction);
    open.onsuccess = () => {
      // Let a newer tab upgrade instead of blocking behind this connection.
      open.result.onversionchange = () => open.result.close();
      resolve(open.result);
    };
    open.onerror = () => reject(open.error);
    open.onblocked = () => reject(new Error('Image storage is being upgraded in another tab. Close other Test Generator tabs and retry.'));
  });
}

export function metaFor(image: Pick<ImagePayload, 'name' | 'ext' | 'mime' | 'size'>, revision = newRevision()): ImageMeta {
  return { name: image.name, ext: image.ext, mime: image.mime, size: image.size, revision };
}

export function newRevision(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

/** Stage a put of one image's payload and metadata in an open transaction over both stores. */
export function putImage(transaction: IDBTransaction, input: ImageInput, revision?: string): ImageMeta {
  const image: ImagePayload = { name: input.name, ext: input.ext, mime: input.mime ?? 'application/octet-stream',
    size: input.size ?? input.bytes.byteLength, bytes: new Uint8Array(input.bytes) };
  const meta = metaFor(image, revision);
  transaction.objectStore(IMAGE_STORE).put(image);
  transaction.objectStore(IMAGE_META_STORE).put(meta);
  return meta;
}

/** Replace every active image (bank switch, folder import) atomically. */
export async function replaceActiveImages(database: IDBDatabase, images: Iterable<ImageInput>): Promise<void> {
  const transaction = database.transaction([IMAGE_STORE, IMAGE_META_STORE], 'readwrite');
  transaction.objectStore(IMAGE_STORE).clear();
  transaction.objectStore(IMAGE_META_STORE).clear();
  for (const image of images) putImage(transaction, image);
  await transactionDone(transaction);
}

/** Metadata for every active image, repaired from payloads if the two stores disagree. */
export async function readImageMeta(database: IDBDatabase): Promise<ImageMeta[]> {
  const transaction = database.transaction([IMAGE_STORE, IMAGE_META_STORE], 'readonly');
  const [meta, keys] = await Promise.all([
    request<ImageMeta[]>(transaction.objectStore(IMAGE_META_STORE).getAll()),
    request<IDBValidKey[]>(transaction.objectStore(IMAGE_STORE).getAllKeys()),
  ]);
  const names = new Set(meta.map(entry => entry.name));
  if (keys.length === meta.length && keys.every(key => names.has(String(key)))) return meta;
  // Written by a path that bypassed this module; rebuild once from payloads.
  const repair = database.transaction([IMAGE_STORE, IMAGE_META_STORE], 'readwrite');
  const payloads = await request<ImagePayload[]>(repair.objectStore(IMAGE_STORE).getAll());
  repair.objectStore(IMAGE_META_STORE).clear();
  const rebuilt = payloads.map(image => { const entry = metaFor(image); repair.objectStore(IMAGE_META_STORE).put(entry); return entry; });
  await transactionDone(repair);
  return rebuilt;
}

export function request<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted.'));
  });
}
