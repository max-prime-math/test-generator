const REGISTRY_KEY = 'tg-bank-workspaces-v1';
const ACTIVE_BANK_KEY = 'tg-active-bank-id-v1';
const BANK_KEY_PREFIX = 'tg-bank';

const DEFAULT_BANK_ID = 'default';
const DEFAULT_GIT_REPO_ID = 'test-generator-bank';

const ACTIVE_LOCAL_STORAGE_KEYS = [
  'math-test-bank-v2',
  'math-test-custom-classes-v1',
  'tg-test-library-v1',
  'tg-test-draft-v1',
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

  constructor() {
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
      this.#copyActiveLocalStorageToBank(bank.id);
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
    const active = this.activeBank;
    this.#copyActiveLocalStorageToBank(active.id);
    await this.#saveActiveImages(active.id);
    const now = Date.now();
    this.banks = this.banks.map((bank) =>
      bank.id === active.id ? { ...bank, updatedAt: now } : bank,
    );
    this.#saveRegistry();
  }

  async #restoreSnapshot(bank: BankWorkspace): Promise<void> {
    this.#copyBankLocalStorageToActive(bank.id);
    await this.#restoreActiveImages(bank.id);
  }

  #copyActiveLocalStorageToBank(bankId: string): void {
    const storage = getLocalStorage();
    if (!storage) return;
    for (const key of bankStorageKeys()) {
      const value = storage.getItem(key);
      const bankKey = scopedBankKey(bankId, key);
      if (value === null) storage.removeItem(bankKey);
      else storage.setItem(bankKey, value);
    }
  }

  #copyBankLocalStorageToActive(bankId: string): void {
    const storage = getLocalStorage();
    if (!storage) return;
    for (const key of bankStorageKeys()) {
      const bankKey = scopedBankKey(bankId, key);
      const value = storage.getItem(bankKey);
      if (value === null) storage.removeItem(key);
      else storage.setItem(key, value);
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
