const DATABASE_NAME = 'test-generator-git';
const DATABASE_VERSION = 1;
const GIT_FILE_STORE_NAME = 'git-files';

export interface GitFileStorage {
  readFile(repoId: string, path: string): Promise<Uint8Array | null>;
  writeFile(repoId: string, path: string, content: Uint8Array): Promise<void>;
  deleteFile(repoId: string, path: string): Promise<void>;
  listFiles(repoId: string, prefix?: string): Promise<string[]>;
}

export function createMemoryGitFileStorage(): GitFileStorage {
  const files = new Map<string, Uint8Array>();
  const key = (repoId: string, path: string) => `${repoId}/${normalizeGitStoragePath(path)}`;

  return {
    async readFile(repoId, path) {
      const content = files.get(key(repoId, path));
      return content ? new Uint8Array(content) : null;
    },
    async writeFile(repoId, path, content) {
      files.set(key(repoId, path), new Uint8Array(content));
    },
    async deleteFile(repoId, path) {
      files.delete(key(repoId, path));
    },
    async listFiles(repoId, prefix = '') {
      const keyPrefix = key(repoId, prefix);
      const repoPrefix = key(repoId, '');
      return [...files.keys()]
        .filter((fileKey) => fileKey.startsWith(keyPrefix))
        .map((fileKey) => fileKey.slice(repoPrefix.length))
        .sort((left, right) => left.localeCompare(right));
    },
  };
}

export function createIndexedDbGitFileStorage(): GitFileStorage {
  return {
    async readFile(repoId, path) {
      const database = await getDatabase();
      return (await request<Uint8Array | undefined>(
        database.transaction(GIT_FILE_STORE_NAME, 'readonly').objectStore(GIT_FILE_STORE_NAME).get(getRepoGitFileKey(repoId, path)),
      )) ?? null;
    },
    async writeFile(repoId, path, content) {
      const database = await getDatabase();
      await request(
        database.transaction(GIT_FILE_STORE_NAME, 'readwrite').objectStore(GIT_FILE_STORE_NAME).put(
          new Uint8Array(content),
          getRepoGitFileKey(repoId, path),
        ),
      );
    },
    async deleteFile(repoId, path) {
      const database = await getDatabase();
      await request(
        database.transaction(GIT_FILE_STORE_NAME, 'readwrite').objectStore(GIT_FILE_STORE_NAME).delete(getRepoGitFileKey(repoId, path)),
      );
    },
    async listFiles(repoId, prefix = '') {
      const database = await getDatabase();
      const keys = await request<IDBValidKey[]>(
        database.transaction(GIT_FILE_STORE_NAME, 'readonly').objectStore(GIT_FILE_STORE_NAME).getAllKeys(),
      );
      const keyPrefix = getRepoGitFileKey(repoId, prefix);
      const repoPrefix = getRepoGitFileKey(repoId, '');
      return keys
        .filter((key): key is string => typeof key === 'string' && key.startsWith(keyPrefix))
        .map((key) => key.slice(repoPrefix.length))
        .sort((left, right) => left.localeCompare(right));
    },
  };
}

function getRepoGitFileKey(repoId: string, path: string): string {
  return `${repoId}/${normalizeGitStoragePath(path)}`;
}

function normalizeGitStoragePath(path: string): string {
  return path
    .replace(/\\/g, '/')
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join('/');
}

let databasePromise: Promise<IDBDatabase> | null = null;

function getDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    const open = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    open.onupgradeneeded = () => {
      const database = open.result;
      if (!database.objectStoreNames.contains(GIT_FILE_STORE_NAME)) {
        database.createObjectStore(GIT_FILE_STORE_NAME);
      }
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });

  return databasePromise;
}

function request<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
