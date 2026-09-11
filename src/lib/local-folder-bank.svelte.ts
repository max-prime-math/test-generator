import { bankWorkspaces } from './bank-workspaces.svelte';
import {
  readBrowserAppData,
  writeBrowserAppData,
} from '../git/repoDataBridge';
import {
  exportAppDataToRepoEntries,
  hashRepoDataContent,
  importRepoEntriesToAppData,
  normalizeRepoPath,
  REPO_MANIFEST_PATH,
  type RepoDataEntry,
} from '../git/repoDataModel';

const HANDLE_DB_NAME = 'test-generator-folder-bank';
const HANDLE_DB_VERSION = 1;
const HANDLE_STORE = 'handles';
const ACTIVE_HANDLE_KEY = 'active-bank-folder';
const AUTOSAVE_INTERVAL_MS = 1_500;

type FolderStatus = 'unavailable' | 'disconnected' | 'permission-needed' | 'ready' | 'saving' | 'loading' | 'error';

interface StoredFolderHandle {
  id: typeof ACTIVE_HANDLE_KEY;
  bankId: string;
  handle: FileSystemDirectoryHandle;
}

type PermissionDirectoryHandle = FileSystemDirectoryHandle & {
  queryPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>;
  requestPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>;
};

type FolderPickerWindow = Window & typeof globalThis & {
  showDirectoryPicker?: (options?: {
    id?: string;
    mode?: 'read' | 'readwrite';
    startIn?: 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos';
  }) => Promise<FileSystemDirectoryHandle>;
};

interface FolderManifestShape {
  files?: Array<{ path?: unknown }>;
}

class LocalFolderBankStore {
  status = $state<FolderStatus>('disconnected');
  folderName = $state<string | null>(null);
  linkedBankId = $state<string | null>(null);
  lastSavedAt = $state<number | null>(null);
  error = $state<string | null>(null);

  #handle: FileSystemDirectoryHandle | null = null;
  #lastDataSignature: string | null = null;
  #initialized = false;
  #autosaveTimer: ReturnType<typeof setInterval> | null = null;
  #operation: Promise<void> = Promise.resolve();

  get supported(): boolean {
    return typeof window !== 'undefined'
      && typeof (window as FolderPickerWindow).showDirectoryPicker === 'function';
  }

  get linkedToActiveBank(): boolean {
    return Boolean(this.#handle && this.linkedBankId === bankWorkspaces.activeBankId);
  }

  async initialize(): Promise<void> {
    if (this.#initialized) return;
    this.#initialized = true;

    if (!this.supported) {
      this.status = 'unavailable';
      return;
    }

    try {
      const stored = await loadStoredFolderHandle();
      if (!stored) {
        this.status = 'disconnected';
        return;
      }

      this.#handle = stored.handle;
      this.linkedBankId = stored.bankId;
      this.folderName = stored.handle.name;
      if (stored.bankId !== bankWorkspaces.activeBankId) {
        this.status = 'disconnected';
        return;
      }

      const permission = await queryFolderPermission(stored.handle);
      if (permission !== 'granted') {
        this.status = 'permission-needed';
        return;
      }

      await this.#loadLinkedFolderOnStartup();
    } catch (cause) {
      this.#fail(errorMessage(cause, 'Could not restore the local folder connection.'));
    }
  }

  async chooseFolder(): Promise<void> {
    if (!this.supported) {
      this.#fail('Local folder storage requires a Chromium-based browser.');
      return;
    }

    try {
      this.error = null;
      const picker = (window as FolderPickerWindow).showDirectoryPicker;
      if (!picker) throw new Error('Local folder storage is unavailable.');
      const handle = await picker({
        id: 'test-generator-bank-folder',
        mode: 'readwrite',
        startIn: 'documents',
      });
      if (!(await requestFolderPermission(handle))) {
        throw new Error('Read and write access to the folder was not granted.');
      }

      const existingEntries = await readBankEntries(handle);
      if (existingEntries) {
        const folderData = importRepoEntriesToAppData(existingEntries);
        const currentSignature = await browserDataSignature();
        const folderSignature = dataSignature(existingEntries);
        if (folderSignature !== currentSignature) {
          const shouldLoad = window.confirm(
            `“${handle.name}” already contains a Test Generator bank. Load it into the active bank? This replaces the active bank's questions, classes, saved tests, narratives, and images.`,
          );
          if (!shouldLoad) return;
          this.status = 'loading';
          await writeBrowserAppData(folderData.appData, {
            clearDraft: false,
            manifestGeneratedAt: folderData.manifest.generatedAt,
          });
          await bankWorkspaces.saveActiveSnapshot();
          await this.#link(handle);
          sessionStorage.setItem(reloadNoticeKey(), 'loaded');
          window.location.reload();
          return;
        }
      }

      await this.#link(handle);
      if (!existingEntries) await this.saveNow(true);
      else {
        this.#lastDataSignature = dataSignature(existingEntries);
        this.status = 'ready';
        this.#startAutosave();
      }
    } catch (cause) {
      if (isPickerCancellation(cause)) return;
      this.#fail(errorMessage(cause, 'Could not use that folder.'));
      throw cause;
    }
  }

  async grantPermission(): Promise<void> {
    if (!this.#handle || this.linkedBankId !== bankWorkspaces.activeBankId) {
      await this.chooseFolder();
      return;
    }
    try {
      this.error = null;
      if (!(await requestFolderPermission(this.#handle))) {
        this.status = 'permission-needed';
        return;
      }
      await this.reloadFromFolder(false);
    } catch (cause) {
      this.#fail(errorMessage(cause, 'Could not access the folder.'));
      throw cause;
    }
  }

  async saveNow(force = false): Promise<void> {
    return this.#enqueue(async () => {
      if (!this.linkedToActiveBank || !this.#handle) return;
      if (!(await hasFolderPermission(this.#handle))) {
        this.status = 'permission-needed';
        this.#stopAutosave();
        return;
      }

      const appData = await readBrowserAppData();
      const comparisonEntries = exportAppDataToRepoEntries(appData, {
        generatedAt: '2000-01-01T00:00:00.000Z',
      });
      const signature = dataSignature(comparisonEntries);
      if (!force && signature === this.#lastDataSignature) return;

      this.status = 'saving';
      this.error = null;
      const entries = exportAppDataToRepoEntries(appData);
      await writeBankEntries(this.#handle, entries);
      this.#lastDataSignature = signature;
      this.lastSavedAt = Date.now();
      this.status = 'ready';
      this.#startAutosave();
    }).catch((cause) => {
      this.#fail(errorMessage(cause, 'Could not save the bank to its folder.'));
      throw cause;
    });
  }

  async reloadFromFolder(confirmReplacement = true): Promise<void> {
    if (!this.linkedToActiveBank || !this.#handle) return;
    if (confirmReplacement && !window.confirm('Reload the active bank from its folder? Unsaved browser changes will be replaced.')) return;

    try {
      this.#stopAutosave();
      this.status = 'loading';
      this.error = null;
      const entries = await readBankEntries(this.#handle);
      if (!entries) throw new Error('The linked folder does not contain a Test Generator bank.');
      const imported = importRepoEntriesToAppData(entries);
      await writeBrowserAppData(imported.appData, {
        clearDraft: false,
        manifestGeneratedAt: imported.manifest.generatedAt,
      });
      await bankWorkspaces.saveActiveSnapshot();
      sessionStorage.setItem(reloadNoticeKey(), 'loaded');
      window.location.reload();
    } catch (cause) {
      this.#fail(errorMessage(cause, 'Could not reload the bank from its folder.'));
      throw cause;
    }
  }

  async disconnect(): Promise<void> {
    this.#stopAutosave();
    await clearStoredFolderHandle();
    this.#handle = null;
    this.linkedBankId = null;
    this.folderName = null;
    this.#lastDataSignature = null;
    this.lastSavedAt = null;
    this.error = null;
    this.status = this.supported ? 'disconnected' : 'unavailable';
  }

  consumeReloadNotice(): boolean {
    const key = reloadNoticeKey();
    const found = sessionStorage.getItem(key) === 'loaded';
    if (found) sessionStorage.removeItem(key);
    return found;
  }

  async #link(handle: FileSystemDirectoryHandle): Promise<void> {
    this.#handle = handle;
    this.linkedBankId = bankWorkspaces.activeBankId;
    this.folderName = handle.name;
    await saveStoredFolderHandle({
      id: ACTIVE_HANDLE_KEY,
      bankId: bankWorkspaces.activeBankId,
      handle,
    });
  }

  async #loadLinkedFolderOnStartup(): Promise<void> {
    if (!this.#handle) return;
    try {
      this.status = 'loading';
      const entries = await readBankEntries(this.#handle);
      if (!entries) throw new Error('The linked folder no longer contains a Test Generator bank.');
      const folderSignature = dataSignature(entries);
      const localSignature = await browserDataSignature();
      if (folderSignature !== localSignature) {
        const imported = importRepoEntriesToAppData(entries);
        await writeBrowserAppData(imported.appData, {
          clearDraft: false,
          manifestGeneratedAt: imported.manifest.generatedAt,
        });
        await bankWorkspaces.saveActiveSnapshot();
        sessionStorage.setItem(reloadNoticeKey(), 'loaded');
        window.location.reload();
        return;
      }
      this.#lastDataSignature = localSignature;
      this.status = 'ready';
      this.#startAutosave();
    } catch (cause) {
      this.#fail(errorMessage(cause, 'Could not load the linked folder.'));
    }
  }

  #startAutosave(): void {
    if (this.#autosaveTimer || this.status !== 'ready') return;
    this.#autosaveTimer = setInterval(() => {
      void this.saveNow().catch(() => undefined);
    }, AUTOSAVE_INTERVAL_MS);
  }

  #stopAutosave(): void {
    if (this.#autosaveTimer) clearInterval(this.#autosaveTimer);
    this.#autosaveTimer = null;
  }

  #enqueue(operation: () => Promise<void>): Promise<void> {
    const next = this.#operation.then(operation, operation);
    this.#operation = next.catch(() => undefined);
    return next;
  }

  #fail(message: string): void {
    this.#stopAutosave();
    this.error = message;
    this.status = 'error';
  }
}

export const localFolderBank = new LocalFolderBankStore();

export async function readBankEntries(root: FileSystemDirectoryHandle): Promise<RepoDataEntry[] | null> {
  let manifestFile: File;
  try {
    manifestFile = await (await root.getFileHandle(REPO_MANIFEST_PATH)).getFile();
  } catch (cause) {
    if (isNotFound(cause)) return null;
    throw cause;
  }

  const manifestText = await manifestFile.text();
  const manifest = JSON.parse(manifestText) as FolderManifestShape;
  if (!Array.isArray(manifest.files)) throw new Error('The folder has an invalid Test Generator manifest.');

  const paths = manifest.files.map((entry) => normalizeRepoPath(String(entry.path ?? '')));
  const entries: RepoDataEntry[] = [];
  for (const path of paths) {
    const file = await (await getFileHandle(root, path, false)).getFile();
    entries.push({
      path,
      kind: 'file',
      content: path.startsWith('images/')
        ? new Uint8Array(await file.arrayBuffer())
        : await file.text(),
    });
  }
  entries.push({ path: REPO_MANIFEST_PATH, kind: 'file', content: manifestText });
  return entries;
}

export async function writeBankEntries(root: FileSystemDirectoryHandle, entries: RepoDataEntry[]): Promise<void> {
  const previousPaths = await readManagedPaths(root);
  const nextPaths = new Set(entries.map((entry) => normalizeRepoPath(entry.path)));
  const manifest = entries.find((entry) => entry.path === REPO_MANIFEST_PATH);
  if (!manifest) throw new Error('Cannot save a bank without a manifest.');

  for (const entry of entries) {
    if (entry.path === REPO_MANIFEST_PATH) continue;
    await writeEntry(root, entry);
  }
  for (const path of previousPaths) {
    if (!nextPaths.has(path) && path !== REPO_MANIFEST_PATH) await removeFile(root, path);
  }
  await writeEntry(root, manifest);
}

function dataSignature(entries: RepoDataEntry[]): string {
  return entries
    .filter((entry) => entry.path !== REPO_MANIFEST_PATH && entry.path !== 'README.md')
    .sort((left, right) => left.path.localeCompare(right.path))
    .map((entry) => `${entry.path}:${hashRepoDataContent(entry.content)}`)
    .join('|');
}

async function browserDataSignature(): Promise<string> {
  const appData = await readBrowserAppData();
  return dataSignature(exportAppDataToRepoEntries(appData, {
    generatedAt: '2000-01-01T00:00:00.000Z',
  }));
}

async function readManagedPaths(root: FileSystemDirectoryHandle): Promise<string[]> {
  try {
    const file = await (await root.getFileHandle(REPO_MANIFEST_PATH)).getFile();
    const parsed = JSON.parse(await file.text()) as FolderManifestShape;
    if (!Array.isArray(parsed.files)) return [];
    return [
      ...parsed.files.map((entry) => normalizeRepoPath(String(entry.path ?? ''))),
      REPO_MANIFEST_PATH,
    ];
  } catch {
    return [];
  }
}

async function writeEntry(root: FileSystemDirectoryHandle, entry: RepoDataEntry): Promise<void> {
  const handle = await getFileHandle(root, normalizeRepoPath(entry.path), true);
  const writable = await handle.createWritable();
  try {
    if (typeof entry.content === 'string') {
      await writable.write(entry.content);
    } else {
      const bytes = new Uint8Array(entry.content.byteLength);
      bytes.set(entry.content);
      await writable.write(bytes.buffer);
    }
    await writable.close();
  } catch (cause) {
    await writable.abort().catch(() => undefined);
    throw cause;
  }
}

async function getFileHandle(
  root: FileSystemDirectoryHandle,
  path: string,
  create: boolean,
): Promise<FileSystemFileHandle> {
  const parts = normalizeRepoPath(path).split('/');
  let directory = root;
  for (const part of parts.slice(0, -1)) {
    directory = await directory.getDirectoryHandle(part, { create });
  }
  return directory.getFileHandle(parts.at(-1) as string, { create });
}

async function removeFile(root: FileSystemDirectoryHandle, path: string): Promise<void> {
  const parts = normalizeRepoPath(path).split('/');
  let directory = root;
  try {
    for (const part of parts.slice(0, -1)) directory = await directory.getDirectoryHandle(part);
    await directory.removeEntry(parts.at(-1) as string);
  } catch (cause) {
    if (!isNotFound(cause)) throw cause;
  }
}

async function queryFolderPermission(handle: FileSystemDirectoryHandle): Promise<PermissionState> {
  const permissionHandle = handle as PermissionDirectoryHandle;
  if (!permissionHandle.queryPermission) return 'prompt';
  return permissionHandle.queryPermission({ mode: 'readwrite' });
}

async function hasFolderPermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  return (await queryFolderPermission(handle)) === 'granted';
}

async function requestFolderPermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const permissionHandle = handle as PermissionDirectoryHandle;
  if ((await queryFolderPermission(handle)) === 'granted') return true;
  if (!permissionHandle.requestPermission) return false;
  return (await permissionHandle.requestPermission({ mode: 'readwrite' })) === 'granted';
}

function openHandleDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(HANDLE_DB_NAME, HANDLE_DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(HANDLE_STORE)) {
        request.result.createObjectStore(HANDLE_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function loadStoredFolderHandle(): Promise<StoredFolderHandle | null> {
  try {
    const database = await openHandleDatabase();
    try {
      return (await idbRequest<StoredFolderHandle | undefined>(
        database.transaction(HANDLE_STORE, 'readonly').objectStore(HANDLE_STORE).get(ACTIVE_HANDLE_KEY),
      )) ?? null;
    } finally {
      database.close();
    }
  } catch {
    return null;
  }
}

async function saveStoredFolderHandle(record: StoredFolderHandle): Promise<void> {
  const database = await openHandleDatabase();
  try {
    await idbRequest(database.transaction(HANDLE_STORE, 'readwrite').objectStore(HANDLE_STORE).put(record));
  } finally {
    database.close();
  }
}

async function clearStoredFolderHandle(): Promise<void> {
  const database = await openHandleDatabase();
  try {
    await idbRequest(database.transaction(HANDLE_STORE, 'readwrite').objectStore(HANDLE_STORE).delete(ACTIVE_HANDLE_KEY));
  } finally {
    database.close();
  }
}

function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function reloadNoticeKey(): string {
  return `tg-folder-bank-loaded:${bankWorkspaces.activeBankId}`;
}

function isNotFound(cause: unknown): boolean {
  return cause instanceof DOMException && cause.name === 'NotFoundError';
}

function isPickerCancellation(cause: unknown): boolean {
  return cause instanceof DOMException && cause.name === 'AbortError';
}

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}
