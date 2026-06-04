export type GitCredentialPersistence = 'session' | 'persistent';

export interface GitHubCredentialKey {
  repoId: string;
  remoteName: string;
}

export interface StoredGitHubCredential {
  provider: 'github';
  repoId: string;
  remoteName: string;
  token: string;
  persistence: GitCredentialPersistence;
  updatedAt: string;
}

export interface GitCredentialStore {
  saveGitHubToken(
    key: GitHubCredentialKey,
    token: string,
    options?: { persistence?: GitCredentialPersistence },
  ): Promise<StoredGitHubCredential>;
  loadGitHubToken(key: GitHubCredentialKey): Promise<StoredGitHubCredential | null>;
  clearGitHubToken(key: GitHubCredentialKey): Promise<void>;
  clearAllGitHubTokens(): Promise<void>;
}

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const SESSION_CREDENTIAL_KEY = 'tg-git-credentials-session-v1';
const PERSISTENT_CREDENTIAL_KEY = 'tg-git-credentials-persistent-v1';

export const GITHUB_TOKEN_GUIDANCE = [
  'Use a fine-grained GitHub personal access token scoped to the selected repository.',
  'Set an expiration date.',
  'Grant Contents read/write permission so the Git Database blob, tree, commit, and ref endpoints can read and update the selected repo.',
  'Classic PATs, broad account or organization scopes, and Administration permission are not required unless a future flow explicitly creates repositories or manages collaborators.',
  'Tokens are kept in session storage by default. Persistent storage is an explicit opt-in and can be read by JavaScript running on this origin.',
].join(' ');

const GITHUB_TOKEN_PATTERNS = [
  /github_pat_[A-Za-z0-9_]+/g,
  /gh[pousr]_[A-Za-z0-9_]+/g,
];
const GOOGLE_ACCESS_TOKEN_PATTERN = /ya29\.[A-Za-z0-9._-]+/g;
const AUTHORIZATION_HEADER_PATTERN = /(authorization\s*[:=]\s*)(?:bearer|token|basic)\s+[^,\s;\n\r]+/gi;
const TOKEN_QUERY_PATTERN = /([?&](?:access_token|token|auth|authorization)=)[^&\s#]+/gi;

const memorySessionStorage = createMemoryStorage();
const memoryPersistentStorage = createMemoryStorage();

export function createGitCredentialStore(options: {
  sessionStorage?: KeyValueStorage;
  persistentStorage?: KeyValueStorage;
  now?: () => Date;
} = {}): GitCredentialStore {
  const sessionStore = options.sessionStorage ?? getBrowserStorage('sessionStorage') ?? memorySessionStorage;
  const persistentStore = options.persistentStorage ?? getBrowserStorage('localStorage') ?? memoryPersistentStorage;
  const now = options.now ?? (() => new Date());

  return {
    async saveGitHubToken(key, token, saveOptions = {}) {
      const normalizedKey = normalizeCredentialKey(key);
      const trimmedToken = token.trim();
      if (!trimmedToken) throw new Error('GitHub token is required.');
      const persistence = saveOptions.persistence ?? 'session';
      const record: StoredGitHubCredential = {
        provider: 'github',
        repoId: normalizedKey.repoId,
        remoteName: normalizedKey.remoteName,
        token: trimmedToken,
        persistence,
        updatedAt: now().toISOString(),
      };
      const target = persistence === 'persistent' ? persistentStore : sessionStore;
      const other = persistence === 'persistent' ? sessionStore : persistentStore;
      const storageKey = credentialMapKey(normalizedKey);
      const targetMapKey = persistence === 'persistent' ? PERSISTENT_CREDENTIAL_KEY : SESSION_CREDENTIAL_KEY;
      const otherMapKey = persistence === 'persistent' ? SESSION_CREDENTIAL_KEY : PERSISTENT_CREDENTIAL_KEY;
      writeCredentialMap(target, targetMapKey, {
        ...readCredentialMap(target, targetMapKey),
        [storageKey]: record,
      });
      const otherMap = readCredentialMap(other, otherMapKey);
      delete otherMap[storageKey];
      writeCredentialMap(other, otherMapKey, otherMap);
      return { ...record };
    },

    async loadGitHubToken(key) {
      const normalizedKey = normalizeCredentialKey(key);
      const storageKey = credentialMapKey(normalizedKey);
      const sessionRecord = readCredentialMap(sessionStore, SESSION_CREDENTIAL_KEY)[storageKey];
      if (sessionRecord?.token) return { ...sessionRecord, persistence: 'session' };
      const persistentRecord = readCredentialMap(persistentStore, PERSISTENT_CREDENTIAL_KEY)[storageKey];
      return persistentRecord?.token ? { ...persistentRecord, persistence: 'persistent' } : null;
    },

    async clearGitHubToken(key) {
      const normalizedKey = normalizeCredentialKey(key);
      const storageKey = credentialMapKey(normalizedKey);
      for (const [store, mapKey] of [[sessionStore, SESSION_CREDENTIAL_KEY], [persistentStore, PERSISTENT_CREDENTIAL_KEY]] as const) {
        const map = readCredentialMap(store, mapKey);
        delete map[storageKey];
        writeCredentialMap(store, mapKey, map);
      }
    },

    async clearAllGitHubTokens() {
      sessionStore.removeItem(SESSION_CREDENTIAL_KEY);
      persistentStore.removeItem(PERSISTENT_CREDENTIAL_KEY);
    },
  };
}

export const gitCredentialStore = createGitCredentialStore();

export function redactGitSecrets(value: string, knownSecrets: string[] = []): string {
  let redacted = String(value);
  for (const secret of knownSecrets) {
    const token = secret.trim();
    if (token) redacted = redacted.split(token).join('[redacted]');
  }
  for (const pattern of GITHUB_TOKEN_PATTERNS) {
    redacted = redacted.replace(pattern, '[redacted]');
  }
  return redacted
    .replace(GOOGLE_ACCESS_TOKEN_PATTERN, '[redacted]')
    .replace(AUTHORIZATION_HEADER_PATTERN, '$1[redacted]')
    .replace(TOKEN_QUERY_PATTERN, '$1[redacted]');
}

function normalizeCredentialKey(key: GitHubCredentialKey): GitHubCredentialKey {
  const repoId = key.repoId.trim();
  const remoteName = key.remoteName.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/.test(repoId)) {
    throw new Error('Unsafe repository credential key.');
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(remoteName)) {
    throw new Error('Unsafe remote credential key.');
  }
  return { repoId, remoteName };
}

function credentialMapKey(key: GitHubCredentialKey): string {
  return `${key.repoId}:${key.remoteName}`;
}

function readCredentialMap(storage: KeyValueStorage, storageKey: string): Record<string, StoredGitHubCredential> {
  try {
    const parsed = JSON.parse(storage.getItem(storageKey) ?? '{}') as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed)
        .filter(([, value]) => isStoredGitHubCredential(value))
        .map(([key, value]) => [key, value as StoredGitHubCredential]),
    );
  } catch {
    return {};
  }
}

function writeCredentialMap(storage: KeyValueStorage, storageKey: string, map: Record<string, StoredGitHubCredential>): void {
  const cleaned = Object.fromEntries(
    Object.entries(map).filter(([, record]) => record.provider === 'github' && record.token.trim()),
  );
  if (Object.keys(cleaned).length === 0) {
    storage.removeItem(storageKey);
    return;
  }
  storage.setItem(storageKey, JSON.stringify(cleaned));
}

function isStoredGitHubCredential(value: unknown): value is StoredGitHubCredential {
  return Boolean(
    value
      && typeof value === 'object'
      && (value as StoredGitHubCredential).provider === 'github'
      && typeof (value as StoredGitHubCredential).repoId === 'string'
      && typeof (value as StoredGitHubCredential).remoteName === 'string'
      && typeof (value as StoredGitHubCredential).token === 'string',
  );
}

function getBrowserStorage(name: 'sessionStorage' | 'localStorage'): KeyValueStorage | null {
  try {
    return typeof globalThis[name] !== 'undefined' ? globalThis[name] : null;
  } catch {
    return null;
  }
}

function createMemoryStorage(): KeyValueStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, value),
    removeItem: (key) => map.delete(key),
  };
}
