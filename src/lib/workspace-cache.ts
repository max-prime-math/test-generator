import type { RepoDataImage } from '../git/repoDataModel';
import type { CatalogSnapshot } from './workspace-catalog.svelte';
import { matchesWorkspaceFolder } from './workspace-read';

export interface WorkspaceCache {
  version: 2;
  testImages: RepoDataImage[];
  root: FileSystemDirectoryHandle;
  connectionId?: string;
  signatures: Array<[string, string]>;
  deletedTests: string[];
  catalog: CatalogSnapshot;
}

// Separate from authoritative bank snapshots. Losing this cache costs one
// background index rebuild; it must never lose questions or edits.
const DB = 'test-generator-workspace-cache';
const KEY = 'current';
async function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('cache');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function readWorkspaceCache(root: FileSystemDirectoryHandle, connectionId?: string): Promise<WorkspaceCache | null> {
  const db = await open();
  try {
    const cache = await new Promise<WorkspaceCache | undefined>((resolve, reject) => {
      const tx = db.transaction('cache', 'readonly');
      const request = tx.objectStore('cache').get(KEY);
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    if (!cache || cache.version !== 2) return null;
    if (connectionId && cache.connectionId === connectionId) return cache;
    return await matchesWorkspaceFolder(root, cache.root) ? cache : null;
  } finally { db.close(); }
}

export async function writeWorkspaceCache(cache: WorkspaceCache): Promise<void> {
  const db = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('cache', 'readwrite');
      tx.objectStore('cache').put(cache, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}
