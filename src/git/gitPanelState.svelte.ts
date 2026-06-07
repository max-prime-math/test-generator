import {
  formatRepoError,
  createRepoBackend,
  type RepoBackend,
  type RepoCommit,
  type RepoResult,
  type RepoStatus,
  type TestGeneratorRepository,
} from './repoBackend.ts';
import {
  TEST_GENERATOR_REPO_ID,
  prepareRepoEntriesForAppRestore,
  trackedFilesToRepoEntries,
  writeBrowserAppData,
} from './repoDataBridge.ts';
import {
  localRepoStore,
  withRepoOperationLock,
  type TestGeneratorRepoService,
} from './repoStore.ts';
import {
  GITHUB_TOKEN_GUIDANCE,
  gitCredentialStore,
  redactGitSecrets,
  type GitCredentialPersistence,
  type GitCredentialStore,
} from './credentials.ts';
import {
  remoteConfigStore,
  remoteTrackingRef,
  type GitRemoteConfig,
  type RemoteConfigStore,
} from './remoteConfig.ts';
import {
  createRemoteGitService,
  type RemoteGitAccount,
  type RemoteGitBranchSummary,
  type RemoteGitProgress,
  type RemoteGitRepositorySummary,
  type RemoteGitResult,
  type UpstreamTracking,
} from './remoteService.ts';

type BusyState =
  | 'project'
  | 'commit'
  | 'connect-token'
  | 'disconnect-token'
  | 'save-remote'
  | 'create-remote'
  | 'load-repos'
  | 'load-branches'
  | 'fetch'
  | 'pull'
  | 'push'
  | 'clone-remote';

type MessageTone = 'neutral' | 'success' | 'warning' | 'error';
type RepoVisibility = 'unknown' | 'private' | 'public-or-shared';
type RepositoryMode = 'existing' | 'new';

export interface GitPanelMessage {
  tone: MessageTone;
  text: string;
}

export interface CreateGitPanelStateOptions {
  repoService?: TestGeneratorRepoService;
  repoBackend?: RepoBackend;
  credentialStore?: GitCredentialStore;
  remoteStore?: RemoteConfigStore;
  remoteService?: ReturnType<typeof createRemoteGitService>;
}

const DEFAULT_REMOTE: GitRemoteConfig = {
  name: 'origin',
  kind: 'github',
  branch: 'main',
  upstream: 'main',
  defaultBranch: 'main',
  github: { owner: '', repo: '' },
  lastFetched: null,
};

export const GIT_PANEL_TOKEN_GUIDANCE = GITHUB_TOKEN_GUIDANCE;

export class GitPanelState {
  status = $state<RepoStatus | null>(null);
  commits = $state<RepoCommit[]>([]);
  remotes = $state<GitRemoteConfig[]>([]);
  upstream = $state<UpstreamTracking | null>(null);
  projectedAt = $state<string | null>(null);
  changedFileCount = $state<number | null>(null);
  message = $state<GitPanelMessage | null>(null);
  progress = $state<RemoteGitProgress | null>(null);
  busy = $state<BusyState | null>(null);

  tokenInput = $state('');
  persistToken = $state(false);
  tokenConnected = $state(false);
  tokenPersistence = $state<GitCredentialPersistence | null>(null);

  remoteName = $state('origin');
  owner = $state('');
  repoName = $state('');
  newRepoName = $state('');
  repositoryMode = $state<RepositoryMode>('existing');
  branch = $state('main');
  defaultBranch = $state('main');
  repoVisibility = $state<RepoVisibility>('unknown');
  acknowledgeImportReplace = $state(false);

  githubUser = $state<RemoteGitAccount | null>(null);
  owners = $state<RemoteGitAccount[]>([]);
  repositories = $state<RemoteGitRepositorySummary[]>([]);
  branches = $state<RemoteGitBranchSummary[]>([]);

  readonly repoService: TestGeneratorRepoService;
  readonly repoBackend: RepoBackend;
  readonly credentialStore: GitCredentialStore;
  readonly remoteStore: RemoteConfigStore;
  readonly remoteService: ReturnType<typeof createRemoteGitService>;

  #knownSecrets = new Set<string>();

  constructor(options: CreateGitPanelStateOptions = {}) {
    this.repoService = options.repoService ?? localRepoStore;
    this.repoBackend = options.repoBackend ?? createRepoBackend();
    this.credentialStore = options.credentialStore ?? gitCredentialStore;
    this.remoteStore = options.remoteStore ?? remoteConfigStore;
    this.remoteService = options.remoteService ?? createRemoteGitService({ repoBackend: this.repoBackend });
  }

  get currentRemote(): GitRemoteConfig | null {
    return this.remotes.find((remote) => remote.name === this.remoteName) ?? null;
  }

  get currentBranch(): string {
    return this.status?.branch ?? (this.branch.trim() || 'main');
  }

  get lastCommit(): RepoCommit | null {
    return this.commits[0] ?? null;
  }

  get hasPushRisk(): boolean {
    return this.repoVisibility !== 'private';
  }

  get canRunRemoteOperation(): boolean {
    return Boolean(this.currentRemote?.kind === 'github' && this.tokenConnected && !this.busy);
  }

  get selectedRepositoryName(): string {
    return this.repositoryMode === 'new' ? this.newRepoName.trim() : this.repoName.trim();
  }

  get canCloneSelectedRepository(): boolean {
    return Boolean(
      this.tokenConnected
      && !this.busy
      && this.repositoryMode === 'existing'
      && this.owner.trim()
      && this.repoName.trim()
      && this.branch.trim()
      && this.acknowledgeImportReplace,
    );
  }

  get canCreateRemoteFromCurrentBank(): boolean {
    return Boolean(
      this.tokenConnected
      && !this.busy
      && this.repositoryMode === 'new'
      && this.owner.trim()
      && this.newRepoName.trim(),
    );
  }

  async open(): Promise<void> {
    await this.loadRemoteState();
    await this.projectAppData();
  }

  async loadRemoteState(): Promise<void> {
    await this.run('project', async () => {
      this.remotes = await this.remoteStore.listRemotes();
      const remote =
        this.remotes.find((candidate) => candidate.name === this.remoteName)
        ?? this.remotes.find((candidate) => candidate.name === 'origin')
        ?? this.remotes.find((candidate) => candidate.kind === 'github')
        ?? this.remotes[0]
        ?? DEFAULT_REMOTE;
      this.applyRemoteToForm(remote);
      await this.loadTokenState();
      await this.refreshTokenDiscovery();
      await this.refreshMetadata(false);
    });
  }

  async selectRemote(name: string): Promise<void> {
    await this.run('project', async () => {
      this.remotes = await this.remoteStore.listRemotes();
      const remote = this.remotes.find((candidate) => candidate.name === name);
      if (!remote) throw new Error(`Remote '${name}' is not configured.`);
      this.applyRemoteToForm(remote);
      this.tokenInput = '';
      this.repositories = [];
      this.branches = [];
      await this.loadTokenState();
      await this.refreshTokenDiscovery();
      await this.refreshMetadata(false);
      this.message = { tone: 'success', text: `Selected ${remote.name} (${remote.kind}).` };
    });
  }

  startNewRemote(): void {
    if (this.busy) {
      this.message = { tone: 'neutral', text: 'A git operation is already running.' };
      return;
    }
    this.applyRemoteToForm({ ...DEFAULT_REMOTE, name: this.nextRemoteName() });
    this.tokenInput = '';
    this.tokenConnected = false;
    this.tokenPersistence = null;
    this.repositoryMode = 'existing';
    this.newRepoName = '';
    this.repositories = [];
    this.branches = [];
    this.upstream = null;
    this.repoVisibility = 'unknown';
    this.acknowledgeImportReplace = false;
    this.message = { tone: 'neutral', text: 'Started a new GitHub remote config. Save it before fetch, pull, or push.' };
  }

  async projectAppData(): Promise<void> {
    await this.run('project', async () => {
      const init = await this.repoService.initRepository();
      if (!init.ok) throw new Error(formatRepoError(init.error));
      this.status = init.value.status;
      this.changedFileCount = init.value.status.entries.length;
      this.projectedAt = new Date().toISOString();
      await this.refreshMetadata(false);
      this.message = {
        tone: 'success',
        text: `Refreshed the local git working tree from current app data. ${this.changedFileCount} changed file${this.changedFileCount === 1 ? '' : 's'}.`,
      };
    });
  }

  async refreshStatus(): Promise<void> {
    await this.projectAppData();
  }

  async commit(message: string): Promise<void> {
    await this.run('commit', async () => {
      const result = await this.repoService.commit({ message });
      if (!result.ok) throw new Error(formatRepoError(result.error));
      this.status = result.value.status;
      this.changedFileCount = result.value.status.entries.length;
      this.projectedAt = new Date().toISOString();
      await this.refreshMetadata(false);
      this.message = {
        tone: 'success',
        text: `Committed ${result.value.commit.shortSha}: ${result.value.commit.message}`,
      };
    });
  }

  async connectGitHubToken(): Promise<void> {
    const token = this.tokenInput.trim();
    if (!token) {
      this.message = { tone: 'error', text: 'Add a GitHub token before connecting.' };
      return;
    }
    this.#knownSecrets.add(token);
    await this.run('connect-token', async () => {
      try {
        const inspected = await this.remoteService.inspectToken(() => token);
        if (!inspected.ok) throw new Error(inspected.message);
        await this.credentialStore.saveGitHubToken(
          this.credentialKey(),
          token,
          { persistence: this.persistToken ? 'persistent' : 'session' },
        );
        this.githubUser = inspected.value.user;
        this.owners = inspected.value.owners;
        this.owner = this.chooseOwnerAfterTokenConnect(inspected.value.owners, inspected.value.user.login);
        this.tokenConnected = true;
        this.tokenPersistence = this.persistToken ? 'persistent' : 'session';
        await this.loadRepositoriesForOwner(this.owner, token, false);
        this.message = {
          tone: 'success',
          text: `${inspected.message} Loaded repository access for ${this.owner}.`,
        };
      } finally {
        this.tokenInput = '';
      }
    });
  }

  async disconnectGitHubToken(): Promise<void> {
    await this.run('disconnect-token', async () => {
      await this.credentialStore.clearGitHubToken(this.credentialKey());
      this.tokenInput = '';
      this.tokenConnected = false;
      this.tokenPersistence = null;
      this.githubUser = null;
      this.owners = [];
      this.repositories = [];
      this.branches = [];
      this.repositoryMode = 'existing';
      this.newRepoName = '';
      this.message = { tone: 'success', text: 'Cleared the GitHub token for this remote. The repository config was not deleted.' };
    });
  }

  async saveRemoteConfig(): Promise<void> {
    await this.run('save-remote', async () => {
      const saved = await this.remoteStore.saveRemote(this.formRemote());
      this.remotes = await this.remoteStore.listRemotes();
      this.applyRemoteToForm(saved);
      await this.loadTokenState();
      await this.refreshMetadata(false);
      this.message = { tone: 'success', text: `Saved ${saved.name} as a GitHub remote. Tokens are stored separately.` };
    });
  }

  async loadRepositories(): Promise<void> {
    await this.run('load-repos', async () => {
      const token = await this.getStoredToken();
      if (!token) throw new Error('Add a GitHub token before loading repositories.');
      const message = await this.loadRepositoriesForOwner(this.owner, token, true);
      this.message = { tone: 'success', text: message };
    });
  }

  async loadBranches(): Promise<void> {
    await this.run('load-branches', async () => {
      const token = await this.getStoredToken();
      if (!token) throw new Error('Add a GitHub token before loading branches.');
      const result = await this.remoteService.listBranches({ owner: this.owner, repo: this.repoName }, () => token);
      if (!result.ok) throw new Error(result.message);
      this.branches = result.value;
      this.message = { tone: 'success', text: result.message };
    });
  }

  async selectOwner(owner: string): Promise<void> {
    this.owner = owner;
    this.repoName = '';
    this.newRepoName = '';
    this.repositoryMode = 'existing';
    this.branches = [];
    if (!owner || !this.tokenConnected || this.busy) return;
    await this.loadRepositories();
  }

  async selectRepository(repoName: string): Promise<void> {
    if (repoName === '__new__') {
      this.repositoryMode = 'new';
      this.repoName = '';
      this.newRepoName = '';
      this.branches = [];
      this.branch = this.defaultBranch || 'main';
      this.message = { tone: 'neutral', text: 'Enter a new repository name, then create it from the current bank.' };
      return;
    }

    const repo = this.repositories.find((candidate) => candidate.name === repoName);
    this.repositoryMode = 'existing';
    this.repoName = repoName;
    if (!repo) return;
    this.owner = repo.owner;
    this.defaultBranch = repo.defaultBranch;
    this.branch = repo.defaultBranch;
    this.repoVisibility = repo.private ? 'private' : 'public-or-shared';
    await this.loadBranches();
  }

  async fetch(): Promise<void> {
    await this.runRemoteOperation('fetch');
  }

  async pull(): Promise<void> {
    await this.runRemoteOperation('pull');
  }

  async push(): Promise<void> {
    await this.runRemoteOperation('push');
  }

  async cloneActiveRemoteIntoApp(): Promise<void> {
    if (!this.acknowledgeImportReplace) {
      this.message = {
        tone: 'warning',
        text: 'Acknowledge that the active remote will replace the current local app data before importing it.',
      };
      return;
    }

    await this.run('clone-remote', async () => {
      const remote = this.currentRemote ?? this.formRemote();
      if (remote.kind !== 'github') throw new Error('Only GitHub remotes are implemented in this phase.');
      const token = await this.getStoredToken();
      if (!token) throw new Error('Add a GitHub token before importing a remote bank.');

      const locked = await withRepoOperationLock<{ repo: TestGeneratorRepository; status: RepoStatus; remoteSha: string }>(
        this.repoService.getRepository().id,
        async (): Promise<RepoResult<{ repo: TestGeneratorRepository; status: RepoStatus; remoteSha: string }>> => {
          const repo = this.repoService.getRepository();
          this.setProgress('clone', `Fetching ${remote.name}/${remote.branch}.`, 1, 5);
          const fetched = await this.remoteService.fetch(repo, remote, () => token, {
            onProgress: (progress) => {
              this.progress = { ...progress, message: this.safeText(progress.message) };
            },
          });
          if (!fetched.ok) {
            return {
              ok: false,
              error: {
                code: 'storage-error',
                message: this.safeText(fetched.message),
                recoverable: true,
              },
            };
          }

          this.setProgress('checkout', 'Reading fetched remote ref.', 2, 5);
          const remoteSha = await this.repoBackend.getRef(repo, remoteTrackingRef(remote));
          if (!remoteSha.ok) return remoteSha;
          if (!remoteSha.value) {
            return {
              ok: false,
              error: {
                code: 'not-found',
                message: `No fetched ref exists for ${remote.name}/${remote.branch}.`,
                recoverable: true,
              },
            };
          }

          this.setProgress('checkout', 'Checking out the fetched remote snapshot.', 3, 5);
          const currentBranch = await this.repoBackend.getCurrentBranch(repo);
          if (!currentBranch.ok) return currentBranch;
          const checkout = await this.repoBackend.fastForwardBranch(repo, currentBranch.value, remoteSha.value);
          if (!checkout.ok) return checkout;
          return { ok: true, value: { repo: checkout.value.repo, status: checkout.value.status, remoteSha: remoteSha.value } };
        },
      );

      if (!locked.ok) throw new Error(formatRepoError(locked.error));
      this.repoService.replaceRepository(locked.value.repo);
      this.status = locked.value.status;
      this.changedFileCount = locked.value.status.entries.length;

      this.setProgress('import', 'Validating fetched Test Generator data.', 4, 5);
      const tracked = await this.repoService.readTrackedFiles();
      if (!tracked.ok) throw new Error(formatRepoError(tracked.error));
      const imported = prepareRepoEntriesForAppRestore(trackedFilesToRepoEntries(tracked.value));
      this.setProgress('import', 'Writing imported bank into browser storage.', 5, 5);
      await writeBrowserAppData(imported.appData, { clearDraft: true, manifestGeneratedAt: imported.manifest.generatedAt });
      await this.refreshMetadata(true);

      const questionCount = imported.appData.questions.length;
      const testCount = imported.appData.savedTests.length;
      const imageCount = imported.appData.images?.length ?? 0;
      this.message = {
        tone: 'success',
        text:
          `Imported ${remote.name}/${remote.branch} at ${locked.value.remoteSha.slice(0, 7)} into the app: ` +
          `${questionCount} question${questionCount === 1 ? '' : 's'}, ` +
          `${testCount} test${testCount === 1 ? '' : 's'}, ` +
          `${imageCount} image${imageCount === 1 ? '' : 's'}. Reloading to apply the imported bank.`,
      };
      this.reloadAfterImport();
    });
  }

  async cloneSelectedRepositoryIntoApp(): Promise<void> {
    if (!this.acknowledgeImportReplace) {
      this.message = {
        tone: 'warning',
        text: 'Acknowledge that cloning an existing repo will replace the current local app data first.',
      };
      return;
    }
    await this.saveRemoteConfig();
    if (this.message?.tone === 'error') return;
    this.acknowledgeImportReplace = true;
    await this.cloneActiveRemoteIntoApp();
    const cloneMessage: GitPanelMessage | null = this.message;
    if (cloneMessage?.tone === 'error' && isMissingRepoManifestMessage(cloneMessage.text)) {
      await this.initializeCurrentBankIntoExistingRemote();
    }
  }

  async createRemoteFromCurrentBank(): Promise<void> {
    await this.run('create-remote', async () => {
      if (this.repositoryMode !== 'new') throw new Error('Choose New repo before creating a repository.');
      const token = await this.getStoredToken();
      if (!token) throw new Error('Add a GitHub token before creating a repository.');

      const created = await this.remoteService.createRepository(
        {
          owner: this.owner,
          name: this.newRepoName,
          private: this.repoVisibility !== 'public-or-shared',
          description: 'Test Generator bank',
        },
        () => token,
        {
          onProgress: (progress) => {
            this.progress = { ...progress, message: this.safeText(progress.message) };
          },
        },
      );
      if (!created.ok) throw new Error(created.message);

      this.repositoryMode = 'existing';
      this.owner = created.value.owner;
      this.repoName = created.value.name;
      this.newRepoName = '';
      this.defaultBranch = created.value.defaultBranch || 'main';
      this.branch = this.defaultBranch;
      this.repoVisibility = created.value.private ? 'private' : 'public-or-shared';
      const saved = await this.remoteStore.saveRemote(this.formRemote());
      this.remotes = await this.remoteStore.listRemotes();
      this.applyRemoteToForm(saved);
      this.repoVisibility = created.value.private ? 'private' : 'public-or-shared';
      const pushed = await this.initializeCurrentBankIntoRemote(saved, token, 'new repo');
      this.repositories = mergeRepositorySummary(this.repositories, created.value);
      this.branches = [{ name: saved.branch, sha: pushed.status?.headSha ?? this.status?.headSha ?? '' }];
      await this.refreshMetadata(false);
      this.message = {
        tone: 'success',
        text: `Created ${created.value.fullName}, committed the current bank, and pushed it to ${saved.branch}.`,
      };
    });
  }

  async initializeCurrentBankIntoExistingRemote(): Promise<void> {
    await this.run('create-remote', async () => {
      const remote = this.currentRemote ?? this.formRemote();
      if (remote.kind !== 'github') throw new Error('Only GitHub remotes are implemented in this phase.');
      const token = await this.getStoredToken();
      if (!token) throw new Error('Add a GitHub token before initializing this remote.');
      const pushed = await this.initializeCurrentBankIntoRemote(remote, token, 'existing blank repo');
      this.branches = [{ name: remote.branch, sha: pushed.status?.headSha ?? this.status?.headSha ?? '' }];
      await this.refreshMetadata(false);
      this.message = {
        tone: 'success',
        text: `Initialized ${remote.name}/${remote.branch} from the current bank and pushed it to GitHub.`,
      };
    });
  }

  async getStoredToken(): Promise<string> {
    const record = await this.credentialStore.loadGitHubToken(this.credentialKey());
    if (record?.token) {
      this.#knownSecrets.add(record.token);
      this.tokenConnected = true;
      this.tokenPersistence = record.persistence;
      return record.token;
    }
    this.tokenConnected = false;
    this.tokenPersistence = null;
    return '';
  }

  safeText(value: string): string {
    return redactGitSecrets(value, [...this.#knownSecrets]);
  }

  private setProgress(phase: RemoteGitProgress['phase'], message: string, current?: number, total?: number): void {
    this.progress = { phase, message: this.safeText(message), current, total };
  }

  private async run(busy: BusyState, action: () => Promise<void>): Promise<void> {
    if (this.busy) {
      this.message = { tone: 'neutral', text: 'A git operation is already running.' };
      return;
    }

    this.busy = busy;
    this.progress = null;
    try {
      await action();
      if (this.message) this.message = { ...this.message, text: this.safeText(this.message.text) };
    } catch (error) {
      this.message = {
        tone: 'error',
        text: this.safeText(error instanceof Error ? error.message : 'Git operation failed.'),
      };
    } finally {
      this.busy = null;
      this.progress = null;
    }
  }

  private async runRemoteOperation(kind: 'fetch' | 'pull' | 'push'): Promise<void> {
    await this.run(kind, async () => {
      const remote = this.currentRemote ?? this.formRemote();
      if (remote.kind !== 'github') throw new Error('Only GitHub remotes are implemented in this phase.');
      const token = await this.getStoredToken();
      if (!token) throw new Error('Add a GitHub token before using remotes.');

      const locked = await withRepoOperationLock<RemoteGitResult>(
        this.repoService.getRepository().id,
        async (): Promise<RepoResult<RemoteGitResult>> => {
          const repo = this.repoService.getRepository();
          const result = await this.remoteService[kind](repo, remote, () => token, {
            onProgress: (progress) => {
              this.progress = { ...progress, message: this.safeText(progress.message) };
            },
          });
          if (result.ok) return { ok: true, value: result };
          return {
            ok: false,
            error: {
              code: 'storage-error',
              message: this.safeText(result.message),
              recoverable: true,
            },
          };
        },
      );

      const result = locked.ok ? locked.value : { ok: false as const, message: formatRepoError(locked.error) };
      if (!result.ok) throw new Error(result.message);
      if (result.repo) this.repoService.replaceRepository(result.repo);
      if (result.status) {
        this.status = result.status;
        this.changedFileCount = result.status.entries.length;
      }
      if (kind !== 'pull') {
        const status = await this.repoService.status();
        if (status.ok) {
          this.status = status.value;
          this.changedFileCount = status.value.entries.length;
        }
      }
      await this.refreshMetadata(kind === 'pull');
      this.message = { tone: 'success', text: result.message };
    });
  }

  private async initializeCurrentBankIntoRemote(
    remote: GitRemoteConfig,
    token: string,
    label: string,
  ): Promise<RemoteGitResult> {
    const locked = await withRepoOperationLock<RemoteGitResult>(
      this.repoService.getRepository().id,
      async (): Promise<RepoResult<RemoteGitResult>> => {
        const repo = this.repoService.getRepository();
        this.setProgress('fetch', `Reading ${label} ${remote.name}/${remote.branch}.`, 1, 4);
        const fetched = await this.remoteService.fetchInitializedBranch(repo, remote, () => token, {
          onProgress: (progress) => {
            this.progress = { ...progress, message: this.safeText(progress.message) };
          },
        });
        if (!fetched.ok) {
          return {
            ok: false,
            error: { code: 'storage-error', message: this.safeText(fetched.message), recoverable: true },
          };
        }
        const remoteSha = await this.repoBackend.getRef(repo, remoteTrackingRef(remote));
        if (!remoteSha.ok) return remoteSha;
        if (!remoteSha.value) {
          return {
            ok: false,
            error: { code: 'not-found', message: `No fetched ref exists for ${remote.name}/${remote.branch}.`, recoverable: true },
          };
        }
        const currentBranch = await this.repoBackend.getCurrentBranch(repo);
        if (!currentBranch.ok) return currentBranch;
        const resetRef = await this.repoBackend.setRef(repo, `refs/heads/${currentBranch.value}`, remoteSha.value);
        if (!resetRef.ok) return resetRef;
        this.setProgress('checkout', 'Checking out the remote baseline.', 2, 4);
        const checkout = await this.repoBackend.fastForwardBranch(repo, currentBranch.value, remoteSha.value);
        if (!checkout.ok) return checkout;
        return { ok: true, value: { ...fetched, repo: checkout.value.repo, status: checkout.value.status } };
      },
    );
    if (!locked.ok) throw new Error(formatRepoError(locked.error));
    if (locked.value.repo) this.repoService.replaceRepository(locked.value.repo);

    this.setProgress('import', 'Committing the current browser bank into the remote baseline.', 3, 4);
    const committed = await this.repoService.commit({ message: 'Initialize test bank' });
    if (!committed.ok) throw new Error(formatRepoError(committed.error));
    this.status = committed.value.status;
    this.changedFileCount = committed.value.status.entries.length;

    this.setProgress('push', `Pushing initialized bank to ${remote.name}/${remote.branch}.`, 4, 4);
    const pushed = await this.remoteService.push(this.repoService.getRepository(), remote, () => token, {
      onProgress: (progress) => {
        this.progress = { ...progress, message: this.safeText(progress.message) };
      },
    });
    if (!pushed.ok) throw new Error(pushed.message);
    if (pushed.status) {
      this.status = pushed.status;
      this.changedFileCount = pushed.status.entries.length;
    }
    return pushed;
  }

  private async refreshMetadata(preserveStatus: boolean): Promise<void> {
    const [commits, remotes] = await Promise.all([
      this.repoService.log(12),
      this.remoteStore.listRemotes(),
    ]);
    if (commits.ok) this.commits = commits.value;
    this.remotes = remotes;
    if (!preserveStatus && this.status) this.changedFileCount = this.status.entries.length;

    const remote = this.currentRemote;
    if (remote) {
      const upstream = await this.remoteService.inspectUpstream(this.repoService.getRepository(), remote);
      this.upstream = upstream.ok ? upstream.value : null;
    } else {
      this.upstream = null;
    }
  }

  private async loadTokenState(): Promise<void> {
    const record = await this.credentialStore.loadGitHubToken(this.credentialKey());
    this.tokenConnected = Boolean(record?.token);
    this.tokenPersistence = record?.persistence ?? null;
    if (record?.token) this.#knownSecrets.add(record.token);
  }

  private async refreshTokenDiscovery(): Promise<void> {
    const token = await this.getStoredToken();
    if (!token) return;
    const inspected = await this.remoteService.inspectToken(() => token);
    if (!inspected.ok) return;
    this.githubUser = inspected.value.user;
    this.owners = inspected.value.owners;
    this.owner = this.chooseOwnerAfterTokenConnect(inspected.value.owners, inspected.value.user.login);
    await this.loadRepositoriesForOwner(this.owner, token, false);
    if (this.repoName) {
      const branches = await this.remoteService.listBranches({ owner: this.owner, repo: this.repoName }, () => token);
      if (branches.ok) this.branches = branches.value;
    }
  }

  private applyRemoteToForm(remote: GitRemoteConfig): void {
    this.remoteName = remote.name || 'origin';
    this.branch = remote.branch || 'main';
    this.defaultBranch = remote.defaultBranch || remote.branch || 'main';
    this.repositoryMode = 'existing';
    this.newRepoName = '';
    this.repoVisibility = 'unknown';
    this.acknowledgeImportReplace = false;
    if (remote.kind === 'github' && remote.github) {
      this.owner = remote.github.owner;
      this.repoName = remote.github.repo;
    } else {
      this.owner = '';
      this.repoName = '';
    }
  }

  private nextRemoteName(): string {
    const names = new Set(this.remotes.map((remote) => remote.name));
    if (!names.has('origin')) return 'origin';
    for (let index = 2; index < 100; index += 1) {
      const candidate = `origin-${index}`;
      if (!names.has(candidate)) return candidate;
    }
    return `origin-${Date.now()}`;
  }

  private formRemote(): GitRemoteConfig {
    return {
      name: this.remoteName,
      kind: 'github',
      branch: this.branch,
      upstream: this.branch,
      defaultBranch: this.defaultBranch || this.branch,
      github: {
        owner: this.owner,
        repo: this.selectedRepositoryName,
      },
      lastFetched: null,
    };
  }

  private chooseOwnerAfterTokenConnect(owners: RemoteGitAccount[], userLogin: string): string {
    const current = this.owner.trim();
    if (current && owners.some((owner) => owner.login.toLowerCase() === current.toLowerCase())) return current;
    return owners.find((owner) => owner.login === userLogin)?.login ?? owners[0]?.login ?? userLogin;
  }

  private async loadRepositoriesForOwner(owner: string, token: string, resetSelection: boolean): Promise<string> {
    if (!owner.trim()) return 'Choose an owner to load repositories.';
    const result = await this.remoteService.listRepositories(owner, () => token);
    if (!result.ok) throw new Error(result.message);
    this.repositories = result.value;
    if (resetSelection) {
      this.repoName = '';
      this.newRepoName = '';
      this.repositoryMode = 'existing';
      this.branches = [];
    } else if (this.repoName) {
      const selected = result.value.find((repo) => repo.name === this.repoName);
      if (selected) {
        this.defaultBranch = selected.defaultBranch;
        this.repoVisibility = selected.private ? 'private' : 'public-or-shared';
      }
    }
    return result.message;
  }

  private credentialKey() {
    return {
      repoId: this.repoService.getRepository().id || TEST_GENERATOR_REPO_ID,
      remoteName: this.remoteName || 'origin',
    };
  }

  private reloadAfterImport(): void {
    if (typeof window === 'undefined') return;
    window.setTimeout(() => window.location.reload(), 200);
  }
}

function mergeRepositorySummary(
  repositories: RemoteGitRepositorySummary[],
  repository: RemoteGitRepositorySummary,
): RemoteGitRepositorySummary[] {
  return [
    repository,
    ...repositories.filter((candidate) => candidate.fullName.toLowerCase() !== repository.fullName.toLowerCase()),
  ].sort((left, right) => left.name.localeCompare(right.name));
}

function isMissingRepoManifestMessage(message: string): boolean {
  return message.includes('missing manifest.json') && message.includes('repo-backed Test Generator bank');
}

export const gitPanelState = new GitPanelState();
