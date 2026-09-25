import type { RepoAppData } from '../git/repoDataModel.ts';
import { WORKSPACE_MODE_KEY, WORKSPACE_SHARED_KEYS } from './workspace-format.ts';

const REGISTRY_KEY = 'tg-bank-workspaces-v1';
const ACTIVE_BANK_KEY = 'tg-active-bank-id-v1';
const BANK_KEY_PREFIX = 'tg-bank';

const DEFAULT_BANK_ID = 'default';
const DEFAULT_GIT_REPO_ID = 'test-generator-bank';

const ACTIVE_LOCAL_STORAGE_KEYS = [
  'math-test-bank-v2',
  'tg-narratives-v1',
  'math-test-custom-classes-v1',
  'tg-test-library-v1',
  'tg-test-draft-v1',
  'tg-gradebook-v1',
  'tg-git-last-repo-manifest-generated-at-v1',
  'tg-git-remotes-v1',
  'tg-sync-manifest-v1',
  'tg-sync-enabled-providers-v1',
  'tg-sync-restore-provider-v1',
  'tg-google-drive-folder-id-v1',
  'tg-google-drive-folder-name-v1',
  'tg-google-drive-folder-url-v1',
  'math-test-last-class-id-v1',
  'ingest-draft',
] as const;

const ACTIVE_LOCAL_STORAGE_PREFIXES = [
  'tg-last-sync-',
] as const;

// Inactive banks' snapshots live in IndexedDB: localStorage's ~5 MB quota cannot
// hold several question banks. Only the active bank stays in localStorage.
const SNAPSHOT_DB_NAME = 'test-generator-bank-snapshots';
const SNAPSHOT_DB_VERSION = 1;
const SNAPSHOT_STORE = 'snapshots';

const IMAGE_DB_NAME = 'test-generator';
const IMAGE_DB_VERSION = 2;
const IMAGE_STORE = 'images';
const BANK_IMAGE_STORE = 'bankImages';

export interface BankWorkspace {
  id: string;
  name: string;
  gitRepoId: string;
  createdAt: number;
  updatedAt: number;
}

type SnapshotRecord = { key: string; bankId: string; name: string; value: string };

type BankImageRecord = {
  id: string;
  bankId: string;
  image: {
    name: string;
    ext: string;
    mime: string;
    size: number;
    bytes: Uint8Array;
  };
};

class BankWorkspaceStore {
  banks: BankWorkspace[] = [];
  activeBankId = '';
  switching = false;
  /** Settles once legacy localStorage snapshots have moved to IndexedDB. */
  #ready: Promise<void>;

  constructor() {
    this.#ready = migrateLocalStorageSnapshots().catch((error) => {
      console.error('Could not move bank snapshots out of localStorage', error);
    });
    this.#ensureInitialized();
  }

  get activeBank(): BankWorkspace {
    return this.banks.find((bank) => bank.id === this.activeBankId) ?? this.banks[0] ?? createDefaultBank();
  }

  async createBank(name: string): Promise<void> {
    const trimmed = name.trim() || 'Untitled Bank';
    await this.#saveActiveSnapshot();

    const now = Date.now();
    const id = makeBankId(trimmed, now);
    const bank: BankWorkspace = {
      id,
      name: trimmed,
      gitRepoId: `${DEFAULT_GIT_REPO_ID}-${id}`,
      createdAt: now,
      updatedAt: now,
    };
    this.banks = [...this.banks, bank];
    this.#saveRegistry();
    await this.#restoreSnapshot(bank);
    this.activeBankId = bank.id;
    setLocalStorageItem(ACTIVE_BANK_KEY, bank.id);
    this.#reload();
  }

  async switchBank(id: string): Promise<void> {
    const next = this.banks.find((bank) => bank.id === id);
    if (!next || next.id === this.activeBankId || this.switching) return;
    this.switching = true;
    try {
      await this.#saveActiveSnapshot();
      await this.#restoreSnapshot(next);
      this.activeBankId = next.id;
      setLocalStorageItem(ACTIVE_BANK_KEY, next.id);
      this.#reload();
    } finally {
      this.switching = false;
    }
  }

  /** Persist the live browser data into the active bank's scoped snapshot. */
  async saveActiveSnapshot(): Promise<void> {
    await this.#saveActiveSnapshot();
  }

  /**
   * Read a bank's stored snapshot without switching to it, so every bank can be
   * kept current in the workspace folder rather than only the active one.
   * Returns null when the bank has no snapshot yet.
   */
  async readBankSnapshot(bankId: string): Promise<RepoAppData | null> {
    if (bankId === this.activeBankId) return null; // callers use live browser data instead
    await this.#ready;
    const snapshot = await readSnapshotValues(bankId);
    const read = <T>(key: string, fallback: T): T => {
      const raw = snapshot.get(key) ?? null;
      if (raw === null) return fallback;
      try {
        return (JSON.parse(raw) as T) ?? fallback;
      } catch {
        return fallback;
      }
    };

    const questions = read<RepoAppData['questions']>('math-test-bank-v2', []);
    const narratives = read<RepoAppData['narratives']>('tg-narratives-v1', []);
    const customClasses = read<RepoAppData['customClasses']>('math-test-custom-classes-v1', []);
    if (!snapshot.has('math-test-bank-v2')) return null;

    const database = await openImageDatabase().catch(() => null);
    let images: RepoAppData['images'] = [];
    if (database) {
      try {
        const records = await readBankImages(database, bankId).catch(() => []);
        images = records.map((record) => ({ ...record.image, bytes: new Uint8Array(record.image.bytes) }));
      } finally {
        database.close();
      }
    }

    return { questions, narratives, customClasses, savedTests: [], images };
  }

  /** Register folder banks without deleting unrelated browser banks or their backups. */
  async installFolderBanks(entries: Array<{ id: string; name: string; data: RepoAppData }>, onProgress?: (completed: number, total: number, name: string) => void): Promise<void> {
    onProgress?.(0, entries.length, 'Saving the current browser snapshot');
    await this.#ready;
    await this.#saveActiveSnapshot();
    let completed = 0;
    for (const entry of entries) {
      const now = Date.now();
      const existing = this.banks.find(bank => bank.id === entry.id);
      if (!existing) this.banks.push({ id: entry.id, name: entry.name, gitRepoId: `${DEFAULT_GIT_REPO_ID}-${entry.id}`, createdAt: now, updatedAt: now });
      const values = {
        'math-test-bank-v2': entry.data.questions,
        'tg-narratives-v1': entry.data.narratives ?? [],
        'math-test-custom-classes-v1': entry.data.customClasses,
      };
      await writeSnapshotValues(entry.id, Object.entries(values).map(([key, value]) => [key, JSON.stringify(value)]));
      const db = await openImageDatabase();
      try {
        const tx = db.transaction(BANK_IMAGE_STORE, 'readwrite');
        const store = tx.objectStore(BANK_IMAGE_STORE);
        await deleteBankImages(store, entry.id);
        for (const image of entry.data.images ?? []) store.put({ id: bankImageId(entry.id, image.name), bankId: entry.id, image });
        await transactionDone(tx);
      } finally { db.close(); }
      onProgress?.(++completed, entries.length, entry.name);
    }
    if (entries.length) {
      const selected = entries.find(entry => entry.id === this.activeBankId) ?? entries[0];
      const bank = this.banks.find(bank => bank.id === selected.id)!;
      await this.#restoreSnapshot(bank);
      this.activeBankId = bank.id;
      setLocalStorageItem(ACTIVE_BANK_KEY, bank.id);
    }
    this.#saveRegistry();
  }

  /** Register newly discovered folders without restoring or reloading the active bank. */
  async registerNewFolderBanks(entries: Array<{ id: string; name: string; data: RepoAppData }>): Promise<void> {
    await this.#ready;
    for (const entry of entries) {
      if (this.banks.some(bank => bank.id === entry.id)) throw new Error(`Bank ${entry.id} already exists in this browser. Review the workspace before replacing it.`);
      const values = {
        'math-test-bank-v2': entry.data.questions,
        'tg-narratives-v1': entry.data.narratives ?? [],
        'math-test-custom-classes-v1': entry.data.customClasses,
      };
      await writeSnapshotValues(entry.id, Object.entries(values).map(([key, value]) => [key, JSON.stringify(value)]));
      const db = await openImageDatabase();
      try {
        const tx = db.transaction(BANK_IMAGE_STORE, 'readwrite');
        const store = tx.objectStore(BANK_IMAGE_STORE);
        for (const image of entry.data.images ?? []) store.put({ id: bankImageId(entry.id, image.name), bankId: entry.id, image });
        await transactionDone(tx);
      } finally { db.close(); }
      const now = Date.now();
      this.banks = [...this.banks, { id: entry.id, name: entry.name, gitRepoId: `${DEFAULT_GIT_REPO_ID}-${entry.id}`, createdAt: now, updatedAt: now }];
      this.#saveRegistry();
    }
  }

  renameActiveBank(name: string): void {
    const trimmed = name.trim();
    if (!trimmed) return;
    const now = Date.now();
    this.banks = this.banks.map((bank) =>
      bank.id === this.activeBankId ? { ...bank, name: trimmed, updatedAt: now } : bank,
    );
    this.#saveRegistry();
  }

  #ensureInitialized(): void {
    if (!hasBrowserStorage()) {
      const bank = createDefaultBank();
      this.banks = [bank];
      this.activeBankId = bank.id;
      return;
    }

    const registry = readRegistry();
    if (registry.length === 0) {
      const bank = createDefaultBank();
      this.banks = [bank];
      this.activeBankId = bank.id;
      writeRegistry(this.banks);
      setLocalStorageItem(ACTIVE_BANK_KEY, bank.id);
      void this.#ready.then(() => this.#copyActiveLocalStorageToBank(bank.id)).catch((error) => {
        console.error('Could not save the first bank snapshot', error);
      });
      void this.#saveActiveImages(bank.id);
      return;
    }

    this.banks = registry;
    const storedActive = getLocalStorageItem(ACTIVE_BANK_KEY);
    this.activeBankId = registry.some((bank) => bank.id === storedActive)
      ? storedActive as string
      : registry[0].id;
    setLocalStorageItem(ACTIVE_BANK_KEY, this.activeBankId);
  }

  async #saveActiveSnapshot(): Promise<void> {
    await this.#ready;
    const active = this.activeBank;
    await this.#copyActiveLocalStorageToBank(active.id);
    await this.#saveActiveImages(active.id);
    const now = Date.now();
    this.banks = this.banks.map((bank) =>
      bank.id === active.id ? { ...bank, updatedAt: now } : bank,
    );
    this.#saveRegistry();
  }

  async #restoreSnapshot(bank: BankWorkspace): Promise<void> {
    await this.#ready;
    await this.#copyBankLocalStorageToActive(bank.id);
    await this.#restoreActiveImages(bank.id);
  }

  async #copyActiveLocalStorageToBank(bankId: string): Promise<void> {
    const storage = getLocalStorage();
    if (!storage) return;
    await writeSnapshotValues(bankId, bankStorageKeys().map((key) => [key, storage.getItem(key)]));
  }

  async #copyBankLocalStorageToActive(bankId: string): Promise<void> {
    const storage = getLocalStorage();
    if (!storage) return;
    const snapshot = await readSnapshotValues(bankId);
    const keys = new Set(bankStorageKeys());
    // The bank's own sync markers, which the previous bank may not have had.
    for (const key of snapshot.keys()) {
      if (ACTIVE_LOCAL_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))) keys.add(key);
    }
    // Clear the outgoing bank (already saved by #saveActiveSnapshot) first, so
    // the incoming one never needs room for both in the localStorage quota.
    for (const key of keys) storage.removeItem(key);
    for (const key of keys) {
      const value = snapshot.get(key);
      if (value !== undefined) storage.setItem(key, value);
    }
  }

  async #saveActiveImages(bankId: string): Promise<void> {
    const database = await openImageDatabase().catch(() => null);
    if (!database) return;
    try {
      const images = await request<Array<BankImageRecord['image']>>(
        database.transaction(IMAGE_STORE, 'readonly').objectStore(IMAGE_STORE).getAll(),
      ).catch(() => []);
      const tx = database.transaction(BANK_IMAGE_STORE, 'readwrite');
      const store = tx.objectStore(BANK_IMAGE_STORE);
      await deleteBankImages(store, bankId);
      for (const image of images) {
        store.put({
          id: bankImageId(bankId, image.name),
          bankId,
          image: { ...image, bytes: new Uint8Array(image.bytes) },
        } satisfies BankImageRecord);
      }
      await transactionDone(tx);
    } finally {
      database.close();
    }
  }

  async #restoreActiveImages(bankId: string): Promise<void> {
    const database = await openImageDatabase().catch(() => null);
    if (!database) return;
    try {
      const images = await readBankImages(database, bankId);
      const tx = database.transaction(IMAGE_STORE, 'readwrite');
      const store = tx.objectStore(IMAGE_STORE);
      store.clear();
      for (const record of images) {
        store.put({ ...record.image, bytes: new Uint8Array(record.image.bytes) });
      }
      await transactionDone(tx);
    } finally {
      database.close();
    }
  }

  #saveRegistry(): void {
    writeRegistry(this.banks);
  }

  #reload(): void {
    if (typeof window !== 'undefined') window.location.reload();
  }
}

export const bankWorkspaces = new BankWorkspaceStore();

export function getActiveBankGitRepoId(): string {
  return bankWorkspaces.activeBank.gitRepoId || DEFAULT_GIT_REPO_ID;
}

export function getActiveBankName(): string {
  return bankWorkspaces.activeBank.name || 'Local Bank';
}

function createDefaultBank(): BankWorkspace {
  const now = Date.now();
  return {
    id: DEFAULT_BANK_ID,
    name: 'Local Bank',
    gitRepoId: DEFAULT_GIT_REPO_ID,
    createdAt: now,
    updatedAt: now,
  };
}

function readRegistry(): BankWorkspace[] {
  try {
    const parsed = JSON.parse(getLocalStorageItem(REGISTRY_KEY) ?? '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is Partial<BankWorkspace> => Boolean(entry) && typeof entry === 'object')
      .map((entry) => ({
        id: sanitizeBankId(String(entry.id ?? '')),
        name: typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim() : 'Untitled Bank',
        gitRepoId: sanitizeRepoId(String(entry.gitRepoId ?? '')) || DEFAULT_GIT_REPO_ID,
        createdAt: typeof entry.createdAt === 'number' ? entry.createdAt : Date.now(),
        updatedAt: typeof entry.updatedAt === 'number' ? entry.updatedAt : Date.now(),
      }))
      .filter((entry) => entry.id);
  } catch {
    return [];
  }
}

function writeRegistry(banks: BankWorkspace[]): void {
  setLocalStorageItem(REGISTRY_KEY, JSON.stringify(banks));
}

function bankStorageKeys(): string[] {
  const keys = new Set<string>(ACTIVE_LOCAL_STORAGE_KEYS);
  const storage = getLocalStorage();
  if (!storage) return [...keys];
  // While a root workspace is connected, these belong to the workspace, not a bank.
  // Legacy scoped copies remain intact for recovery; never silently merge student data.
  if (storage.getItem(WORKSPACE_MODE_KEY)) for (const key of WORKSPACE_SHARED_KEYS) keys.delete(key);
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key) continue;
    if (ACTIVE_LOCAL_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
      keys.add(key);
    }
  }
  return [...keys];
}

function scopedBankKey(bankId: string, key: string): string {
  return `${BANK_KEY_PREFIX}:${bankId}:${key}`;
}

/**
 * One bank's scoped values (tests, remotes, sync markers, …) by unscoped key.
 * Falls back to legacy localStorage copies where IndexedDB is unavailable.
 */
async function readSnapshotValues(bankId: string): Promise<Map<string, string>> {
  const values = new Map<string, string>();
  const database = await openSnapshotDatabase().catch(() => null);
  if (database) {
    try {
      const index = database.transaction(SNAPSHOT_STORE, 'readonly').objectStore(SNAPSHOT_STORE).index('bankId');
      for (const record of await request<SnapshotRecord[]>(index.getAll(bankId))) values.set(record.name, record.value);
    } finally {
      database.close();
    }
  }
  const storage = getLocalStorage();
  const prefix = scopedBankKey(bankId, '');
  for (let index = 0; storage && index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith(prefix) && !values.has(key.slice(prefix.length))) {
      values.set(key.slice(prefix.length), storage.getItem(key) ?? '');
    }
  }
  return values;
}

/** Store (or, for null, delete) scoped values for one bank in a single transaction. */
async function writeSnapshotValues(bankId: string, entries: Array<[string, string | null]>): Promise<void> {
  const database = await openSnapshotDatabase().catch(() => null);
  if (!database) {
    for (const [name, value] of entries) {
      if (value === null) getLocalStorage()?.removeItem(scopedBankKey(bankId, name));
      else setLocalStorageItem(scopedBankKey(bankId, name), value);
    }
    return;
  }
  try {
    const tx = database.transaction(SNAPSHOT_STORE, 'readwrite');
    const store = tx.objectStore(SNAPSHOT_STORE);
    for (const [name, value] of entries) {
      const key = scopedBankKey(bankId, name);
      if (value === null) store.delete(key);
      else store.put({ key, bankId, name, value } satisfies SnapshotRecord);
    }
    await transactionDone(tx);
  } finally {
    database.close();
  }
  // Any legacy copy is now superseded.
  for (const [name] of entries) getLocalStorage()?.removeItem(scopedBankKey(bankId, name));
}

/**
 * Move every legacy `tg-bank:<id>:<key>` localStorage value into IndexedDB.
 * localStorage copies are removed only after the IndexedDB transaction commits.
 */
async function migrateLocalStorageSnapshots(): Promise<void> {
  const storage = getLocalStorage();
  if (!storage) return;
  const legacy: SnapshotRecord[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    const match = key?.match(/^tg-bank:([^:]+):(.+)$/);
    if (key && match) legacy.push({ key, bankId: match[1], name: match[2], value: storage.getItem(key) ?? '' });
  }
  if (!legacy.length) return;
  const database = await openSnapshotDatabase();
  try {
    const tx = database.transaction(SNAPSHOT_STORE, 'readwrite');
    const store = tx.objectStore(SNAPSHOT_STORE);
    for (const record of legacy) store.put(record);
    await transactionDone(tx);
  } finally {
    database.close();
  }
  for (const record of legacy) storage.removeItem(record.key);
}

function openSnapshotDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB is unavailable.'));
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(SNAPSHOT_DB_NAME, SNAPSHOT_DB_VERSION);
    open.onupgradeneeded = () => {
      const store = open.result.createObjectStore(SNAPSHOT_STORE, { keyPath: 'key' });
      store.createIndex('bankId', 'bankId');
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
}

function makeBankId(name: string, now: number): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 36) || 'bank';
  return sanitizeBankId(`${slug}-${now.toString(36)}`);
}

function sanitizeBankId(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

function sanitizeRepoId(value: string): string {
  return value.trim().replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

function bankImageId(bankId: string, imageName: string): string {
  return `${bankId}:${imageName}`;
}

function openImageDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB is unavailable.'));
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(IMAGE_DB_NAME, IMAGE_DB_VERSION);
    open.onupgradeneeded = () => {
      const database = open.result;
      if (!database.objectStoreNames.contains(IMAGE_STORE)) {
        database.createObjectStore(IMAGE_STORE, { keyPath: 'name' });
      }
      if (!database.objectStoreNames.contains(BANK_IMAGE_STORE)) {
        const store = database.createObjectStore(BANK_IMAGE_STORE, { keyPath: 'id' });
        store.createIndex('bankId', 'bankId');
      }
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
}

function hasBrowserStorage(): boolean {
  return Boolean(getLocalStorage());
}

function getLocalStorage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function getLocalStorageItem(key: string): string | null {
  return getLocalStorage()?.getItem(key) ?? null;
}

function setLocalStorageItem(key: string, value: string): void {
  getLocalStorage()?.setItem(key, value);
}

function readBankImages(database: IDBDatabase, bankId: string): Promise<BankImageRecord[]> {
  const store = database.transaction(BANK_IMAGE_STORE, 'readonly').objectStore(BANK_IMAGE_STORE);
  const index = store.index('bankId');
  return request<BankImageRecord[]>(index.getAll(bankId));
}

function deleteBankImages(store: IDBObjectStore, bankId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const index = store.index('bankId');
    const cursorRequest = index.openKeyCursor(IDBKeyRange.only(bankId));
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) {
        resolve();
        return;
      }
      store.delete(cursor.primaryKey);
      cursor.continue();
    };
    cursorRequest.onerror = () => reject(cursorRequest.error);
  });
}

function request<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted.'));
  });
}
