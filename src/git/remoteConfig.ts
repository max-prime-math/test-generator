import type { KeyValueStorage } from './credentials.ts';

export type RemoteProviderKind = 'github' | 'google-drive';

export interface GitHubRemoteLocation {
  owner: string;
  repo: string;
}

export interface RemoteTrackingSummary {
  remoteSha: string | null;
  fetchedAt: string | null;
  defaultBranch: string | null;
}

export interface GitRemoteConfig {
  name: string;
  kind: RemoteProviderKind;
  branch: string;
  upstream: string;
  defaultBranch: string;
  github?: GitHubRemoteLocation;
  lastFetched?: RemoteTrackingSummary | null;
}

export interface RemoteConfigStore {
  listRemotes(): Promise<GitRemoteConfig[]>;
  getRemote(name: string): Promise<GitRemoteConfig | null>;
  saveRemote(config: GitRemoteConfig): Promise<GitRemoteConfig>;
  removeRemote(name: string): Promise<void>;
}

const REMOTE_CONFIG_KEY = 'tg-git-remotes-v1';
export const REMOTE_CONFIG_CHANGED_EVENT = 'tg-git-remotes-changed';

const memoryConfigStorage = createMemoryStorage();

export function createRemoteConfigStore(options: { storage?: KeyValueStorage } = {}): RemoteConfigStore {
  const storage = options.storage ?? getBrowserStorage('localStorage') ?? memoryConfigStorage;

  return {
    async listRemotes() {
      return readRemoteConfigs(storage);
    },

    async getRemote(name) {
      const remoteName = validateRemoteName(name);
      return readRemoteConfigs(storage).find((remote) => remote.name === remoteName) ?? null;
    },

    async saveRemote(config) {
      const normalized = normalizeRemoteConfig(config);
      const remotes = readRemoteConfigs(storage).filter((remote) => remote.name !== normalized.name);
      remotes.push(normalized);
      writeRemoteConfigs(storage, remotes.sort((left, right) => left.name.localeCompare(right.name)));
      return normalized;
    },

    async removeRemote(name) {
      const remoteName = validateRemoteName(name);
      writeRemoteConfigs(storage, readRemoteConfigs(storage).filter((remote) => remote.name !== remoteName));
    },
  };
}

export const remoteConfigStore = createRemoteConfigStore();

export function normalizeRemoteConfig(config: GitRemoteConfig): GitRemoteConfig {
  const name = validateRemoteName(config.name);
  const branch = validateBranchName(config.branch);
  const upstream = config.upstream ? validateBranchName(config.upstream) : branch;
  const defaultBranch = validateBranchName(config.defaultBranch || branch);
  const kind = validateRemoteKind(config.kind);
  const normalized: GitRemoteConfig = {
    name,
    kind,
    branch,
    upstream,
    defaultBranch,
    lastFetched: normalizeLastFetched(config.lastFetched ?? null),
  };

  if (kind === 'github') {
    if (!config.github) throw new Error('GitHub remote config needs an owner and repo.');
    normalized.github = {
      owner: validateGitHubOwner(config.github.owner),
      repo: validateGitHubRepo(config.github.repo),
    };
  }

  return normalized;
}

export function validateRemoteName(name: string): string {
  const value = name.trim();
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(value)
    || value.includes('..')
    || value.toLowerCase() === 'head'
    || value.toLowerCase() === '.git'
  ) {
    throw new Error(`Unsafe remote name '${name}'.`);
  }
  return value;
}

export function validateGitHubOwner(owner: string): string {
  const value = owner.trim();
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(value)) {
    throw new Error(`Unsafe GitHub owner '${owner}'.`);
  }
  return value;
}

export function validateGitHubRepo(repo: string): string {
  const value = repo.trim();
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(value)
    || value.includes('..')
    || value.endsWith('.git')
    || /(?:https?:|git@|[/?#&<>"'`\s])/.test(value)
  ) {
    throw new Error(`Unsafe GitHub repository name '${repo}'.`);
  }
  return value;
}

export function validateBranchName(branch: string): string {
  const value = branch.trim();
  if (
    !value
    || value.length > 160
    || value.startsWith('/')
    || value.endsWith('/')
    || value.startsWith('refs/')
    || value.includes('..')
    || value.includes('//')
    || value.includes('@{')
    || value.endsWith('.lock')
    || /[\s~^:?*[\\\]\0<>"'`#&]/.test(value)
    || value.split('/').some((segment) => !segment || segment.startsWith('.') || segment.endsWith('.'))
  ) {
    throw new Error(`Unsafe branch name '${branch}'.`);
  }
  return value;
}

export function remoteTrackingRef(config: Pick<GitRemoteConfig, 'name' | 'branch'>): string {
  return `refs/remotes/${validateRemoteName(config.name)}/${validateBranchName(config.branch)}`;
}

function validateRemoteKind(kind: RemoteProviderKind): RemoteProviderKind {
  if (kind !== 'github' && kind !== 'google-drive') {
    throw new Error(`Unsupported remote provider '${String(kind)}'.`);
  }
  return kind;
}

function normalizeLastFetched(summary: RemoteTrackingSummary | null): RemoteTrackingSummary | null {
  if (!summary) return null;
  const remoteSha = summary.remoteSha?.trim() || null;
  if (remoteSha && !/^[a-f0-9]{40}$/i.test(remoteSha)) {
    throw new Error('Invalid fetched remote object id.');
  }
  return {
    remoteSha: remoteSha?.toLowerCase() ?? null,
    fetchedAt: typeof summary.fetchedAt === 'string' ? summary.fetchedAt : null,
    defaultBranch: summary.defaultBranch ? validateBranchName(summary.defaultBranch) : null,
  };
}

function readRemoteConfigs(storage: KeyValueStorage): GitRemoteConfig[] {
  try {
    const parsed = JSON.parse(storage.getItem(REMOTE_CONFIG_KEY) ?? '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((remote) => normalizeRemoteConfig(remote as GitRemoteConfig));
  } catch {
    return [];
  }
}

function writeRemoteConfigs(storage: KeyValueStorage, remotes: GitRemoteConfig[]): void {
  if (remotes.length === 0) {
    storage.removeItem(REMOTE_CONFIG_KEY);
    notifyRemoteConfigChanged();
    return;
  }
  storage.setItem(REMOTE_CONFIG_KEY, JSON.stringify(remotes.map(normalizeRemoteConfig)));
  notifyRemoteConfigChanged();
}

function notifyRemoteConfigChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(REMOTE_CONFIG_CHANGED_EVENT));
}

function getBrowserStorage(name: 'localStorage'): KeyValueStorage | null {
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
