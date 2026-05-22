import {
  getCurrentUser,
  getRepo,
  createRepo,
  getFile,
  putFile,
  addCollaborator,
  getUser,
  listDirectory,
} from '../github-api';
import type {
  LocalFile,
  ProviderConnectionInfo,
  RemoteFile,
  RepoInfo,
  StorageLike,
  SyncProvider,
  SyncProviderAuthInput,
} from '../types';
import { DEFAULT_REPO_NAME } from '../sync-format';

const TOKEN_KEY = 'tg-github-token-v2';
const REPO_KEY = 'tg-repo-v1';
const USER_KEY = 'tg-user-id';

function basename(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 1] || path;
}

export class GitHubSyncProvider implements SyncProvider {
  readonly id = 'github';
  readonly displayName = 'GitHub';

  #storage: StorageLike;
  #token: string | null = null;
  #repo: RepoInfo | null = null;
  #userId: string | null = null;
  #shaCache = new Map<string, string>();

  constructor(storage: StorageLike) {
    this.#storage = storage;
    this.#token = storage.getItem(TOKEN_KEY);
    this.#userId = storage.getItem(USER_KEY);

    const repoRaw = storage.getItem(REPO_KEY);
    if (repoRaw) {
      try {
        this.#repo = JSON.parse(repoRaw) as RepoInfo;
      } catch {
        this.#repo = null;
      }
    }
  }

  get repoInfo(): RepoInfo | null {
    return this.#repo;
  }

  get userId(): string | null {
    return this.#userId;
  }

  isConfigured(): boolean {
    return Boolean(this.#token && this.#repo);
  }

  async isAuthenticated(): Promise<boolean> {
    return this.isConfigured();
  }

  async authenticate(input?: SyncProviderAuthInput): Promise<void> {
    const token = typeof input?.token === 'string' ? input.token.trim() : '';
    if (!token) throw new Error('GitHub token required');

    const user = await getCurrentUser(token);
    let repo = await getRepo(token, user.login, DEFAULT_REPO_NAME);
    if (!repo) {
      repo = await createRepo(
        token,
        DEFAULT_REPO_NAME,
        'Backup of my Test Generator question bank.',
      );
    }

    this.#token = token;
    this.#repo = repo;
    this.#userId = user.login;
    this.#shaCache.clear();

    this.#storage.setItem(TOKEN_KEY, token);
    this.#storage.setItem(REPO_KEY, JSON.stringify(repo));
    this.#storage.setItem(USER_KEY, user.login);
  }

  async disconnect(): Promise<void> {
    this.#token = null;
    this.#repo = null;
    this.#userId = null;
    this.#shaCache.clear();
    this.#storage.removeItem(TOKEN_KEY);
    this.#storage.removeItem(REPO_KEY);
    this.#storage.removeItem(USER_KEY);
  }

  async listFiles(): Promise<RemoteFile[]> {
    const token = this.#requireToken();
    const repo = this.#requireRepo();

    const rootItems = await listDirectory(token, repo, '');
    const testItems = await listDirectory(token, repo, 'tests');
    const files = [...rootItems, ...testItems].filter((item) => item.type === 'file');

    return files.map((item) => ({
      id: item.path,
      path: item.path,
      name: item.name,
      modifiedTime: null,
      hash: item.sha,
      providerId: this.id,
      raw: item,
    }));
  }

  async uploadFile(file: LocalFile): Promise<RemoteFile> {
    const token = this.#requireToken();
    const repo = this.#requireRepo();
    const prevSha = this.#shaCache.get(file.path) || (await getFile(token, repo, file.path))?.sha;
    const sha = await putFile(
      token,
      repo,
      file.path,
      file.content,
      `Sync ${file.path}`,
      prevSha,
    );
    this.#shaCache.set(file.path, sha);

    return {
      id: file.path,
      path: file.path,
      name: basename(file.path),
      modifiedTime: file.modifiedTime,
      hash: sha,
      providerId: this.id,
      raw: { sha },
    };
  }

  async downloadFile(remoteId: string): Promise<LocalFile> {
    const token = this.#requireToken();
    const repo = this.#requireRepo();
    const file = await getFile(token, repo, remoteId);
    if (!file) throw new Error(`GitHub file not found: ${remoteId}`);
    this.#shaCache.set(file.path, file.sha);

    return {
      path: file.path,
      name: basename(file.path),
      content: file.content,
      modifiedTime: Date.now(),
      hash: file.sha,
      raw: { sha: file.sha },
    };
  }

  async deleteFile(): Promise<void> {
    throw new Error('Remote deletes are intentionally disabled for GitHub');
  }

  async getConnectionInfo(): Promise<ProviderConnectionInfo> {
    if (!this.#repo) return {};
    return {
      accountLabel: this.#userId,
      remoteLabel: `${this.#repo.owner}/${this.#repo.name}`,
      remoteUrl: `https://github.com/${this.#repo.owner}/${this.#repo.name}`,
    };
  }

  async share(username: string): Promise<void> {
    const token = this.#requireToken();
    const repo = this.#requireRepo();
    await getUser(token, username);
    await addCollaborator(token, repo, username, 'push');
  }

  #requireToken(): string {
    if (!this.#token) throw new Error('GitHub is not connected');
    return this.#token;
  }

  #requireRepo(): RepoInfo {
    if (!this.#repo) throw new Error('GitHub repo is not configured');
    return this.#repo;
  }
}
