import type {
  LocalFile,
  ProviderConnectionInfo,
  RemoteFile,
  SyncProvider,
  SyncProviderAuthInput,
} from '../types';

const DB_NAME = 'test-generator-sync';
const DB_VERSION = 1;
const STORE = 'sync-provider-handles';
const HANDLE_KEY = 'local-folder-root';

type ProviderHandleRecord = {
  id: string;
  handle: FileSystemDirectoryHandle;
};

type PickerWindow = Window & typeof globalThis & {
  showDirectoryPicker?: (options?: {
    id?: string;
    mode?: 'read' | 'readwrite';
    startIn?: 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos';
  }) => Promise<FileSystemDirectoryHandle>;
};

type PermissionCapableHandle = FileSystemHandle & {
  queryPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>;
  requestPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>;
};

type IterableDirectoryHandle = FileSystemDirectoryHandle & {
  entries: () => AsyncIterableIterator<[string, FileSystemHandle]>;
};

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then((db) =>
    new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE, mode);
      const store = transaction.objectStore(STORE);
      const req = fn(store);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }),
  );
}

async function loadStoredHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const record = await tx<ProviderHandleRecord | undefined>('readonly', (store) =>
      store.get(HANDLE_KEY),
    );
    return record?.handle ?? null;
  } catch {
    return null;
  }
}

async function saveHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  await tx('readwrite', (store) => store.put({ id: HANDLE_KEY, handle }));
}

async function clearHandle(): Promise<void> {
  await tx('readwrite', (store) => store.delete(HANDLE_KEY));
}

function basename(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 1] || path;
}

async function ensurePermission(handle: PermissionCapableHandle, readwrite = true): Promise<boolean> {
  const mode = readwrite ? 'readwrite' : 'read';
  if (handle.queryPermission && (await handle.queryPermission({ mode })) === 'granted') return true;
  if (!handle.requestPermission) return false;
  return (await handle.requestPermission({ mode })) === 'granted';
}

async function walkDirectory(
  dir: FileSystemDirectoryHandle,
  prefix = '',
): Promise<RemoteFile[]> {
  const files: RemoteFile[] = [];

  const iterableDir = dir as IterableDirectoryHandle;
  for await (const [name, handle] of iterableDir.entries()) {
    const path = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === 'directory') {
      files.push(...await walkDirectory(handle as FileSystemDirectoryHandle, path));
      continue;
    }

    const file = await (handle as FileSystemFileHandle).getFile();
    files.push({
      id: path,
      path,
      name,
      modifiedTime: file.lastModified,
      hash: null,
      providerId: 'localFolder',
      raw: { size: file.size, type: file.type },
    });
  }

  return files;
}

async function getFileHandleForPath(
  root: FileSystemDirectoryHandle,
  path: string,
  create = false,
): Promise<FileSystemFileHandle> {
  const parts = path.split('/').filter(Boolean);
  if (parts.length === 0) throw new Error('Path is required');

  let current = root;
  for (const segment of parts.slice(0, -1)) {
    current = await current.getDirectoryHandle(segment, { create });
  }

  return current.getFileHandle(parts[parts.length - 1], { create });
}

export class LocalFolderSyncProvider implements SyncProvider {
  readonly id = 'localFolder';
  readonly displayName = 'Local Folder';
  readonly isStub = false;

  #rootHandle: FileSystemDirectoryHandle | null = null;
  #loadingHandle: Promise<FileSystemDirectoryHandle | null> | null = null;

  isConfigured(): boolean {
    return this.#rootHandle !== null || this.#loadingHandle !== null;
  }

  async isAuthenticated(): Promise<boolean> {
    const handle = await this.#getHandle();
    if (!handle) return false;
    return await ensurePermission(handle as PermissionCapableHandle, false);
  }

  async authenticate(_input?: SyncProviderAuthInput): Promise<void> {
    const pickerWindow = window as PickerWindow;
    if (!pickerWindow.showDirectoryPicker) {
      throw new Error('This browser does not support folder-based backup');
    }

    const handle = await pickerWindow.showDirectoryPicker({
      id: 'test-generator-backups',
      mode: 'readwrite',
      startIn: 'documents',
    });

    const granted = await ensurePermission(handle, true);
    if (!granted) throw new Error('Folder permission was not granted');

    this.#rootHandle = handle;
    await saveHandle(handle);
  }

  async disconnect(): Promise<void> {
    this.#rootHandle = null;
    this.#loadingHandle = null;
    await clearHandle();
  }

  async listFiles(): Promise<RemoteFile[]> {
    const root = await this.#requireHandle();
    return walkDirectory(root);
  }

  async uploadFile(file: LocalFile): Promise<RemoteFile> {
    const root = await this.#requireHandle();
    const fileHandle = await getFileHandleForPath(root, file.path, true);
    const writable = await fileHandle.createWritable();
    await writable.write(file.content);
    await writable.close();
    const written = await fileHandle.getFile();

    return {
      id: file.path,
      path: file.path,
      name: basename(file.path),
      modifiedTime: written.lastModified,
      hash: file.hash,
      providerId: this.id,
      raw: { size: written.size, type: written.type },
    };
  }

  async downloadFile(remoteId: string): Promise<LocalFile> {
    const root = await this.#requireHandle();
    const fileHandle = await getFileHandleForPath(root, remoteId, false);
    const file = await fileHandle.getFile();
    return {
      path: remoteId,
      name: basename(remoteId),
      content: await file.text(),
      modifiedTime: file.lastModified,
      hash: '',
      raw: { size: file.size, type: file.type },
    };
  }

  async deleteFile(remoteId: string): Promise<void> {
    const root = await this.#requireHandle();
    const parts = remoteId.split('/').filter(Boolean);
    if (parts.length === 0) throw new Error('Path is required');

    let current = root;
    for (const segment of parts.slice(0, -1)) {
      current = await current.getDirectoryHandle(segment);
    }
    await current.removeEntry(parts[parts.length - 1]);
  }

  async getConnectionInfo(): Promise<ProviderConnectionInfo> {
    const handle = await this.#getHandle();
    return handle ? { remoteLabel: handle.name } : {};
  }

  async #getHandle(): Promise<FileSystemDirectoryHandle | null> {
    if (this.#rootHandle) return this.#rootHandle;
    if (!this.#loadingHandle) {
      this.#loadingHandle = loadStoredHandle().then((handle) => {
        this.#rootHandle = handle;
        this.#loadingHandle = null;
        return handle;
      });
    }
    return this.#loadingHandle;
  }

  async #requireHandle(): Promise<FileSystemDirectoryHandle> {
    const handle = await this.#getHandle();
    if (!handle) throw new Error('Local Folder is not connected');
    const granted = await ensurePermission(handle, true);
    if (!granted) throw new Error('Folder permission is required to continue');
    return handle;
  }
}
