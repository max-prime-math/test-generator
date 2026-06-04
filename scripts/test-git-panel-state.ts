import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGitCredentialStore, type KeyValueStorage } from '../src/git/credentials.ts';
import { createRemoteConfigStore, type GitRemoteConfig } from '../src/git/remoteConfig.ts';
import { createTestGeneratorRepository } from '../src/git/repoDataBridge.ts';
import type { RepoCommit, RepoResult, RepoStatus, TestGeneratorRepository } from '../src/git/repoBackend.ts';
import type { TestGeneratorRepoService } from '../src/git/repoStore.ts';
import type { RemoteGitResult } from '../src/git/remoteService.ts';

(globalThis as unknown as { $state: <T>(value: T) => T }).$state = <T>(value: T) => value;

const { GitPanelState } = await import('../src/git/gitPanelState.svelte.ts');

const token = 'github_pat_11AAABBBcccDDD_panel-secret-token';
const googleToken = 'ya29.a0AfH6SMB-panel-secret';
const config: GitRemoteConfig = {
  name: 'origin',
  kind: 'github',
  branch: 'main',
  upstream: 'main',
  defaultBranch: 'main',
  github: { owner: 'max-prime-math', repo: 'test-generator-bank' },
  lastFetched: null,
};

const backupConfig: GitRemoteConfig = {
  name: 'backup',
  kind: 'github',
  branch: 'bank',
  upstream: 'bank',
  defaultBranch: 'bank',
  github: { owner: 'school-org', repo: 'shared-bank' },
  lastFetched: null,
};

const cleanStatus: RepoStatus = {
  branch: 'main',
  headSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  entries: [],
};

const dirtyStatus: RepoStatus = {
  branch: 'main',
  headSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  entries: [{ path: 'questions/q-1.json', staged: null, worktree: 'modified' }],
};

const commit: RepoCommit = {
  sha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  shortSha: 'bbbbbbb',
  message: 'Panel commit',
  authorName: 'Test Generator Local',
  authorEmail: 'test-generator-local@example.invalid',
  authoredAt: '2026-06-03T00:00:00.000Z',
  parentShas: ['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
};

function memoryStorage(): KeyValueStorage & { dump(): Record<string, string> } {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, value),
    removeItem: (key) => map.delete(key),
    dump: () => Object.fromEntries(map),
  };
}

function ok<T>(value: T): RepoResult<T> {
  return { ok: true, value };
}

function createRepoServiceMock(): TestGeneratorRepoService & {
  calls: Record<string, number>;
  replacedRepo: TestGeneratorRepository | null;
} {
  let repo = createTestGeneratorRepository();
  const calls: Record<string, number> = {};
  const count = (name: string) => {
    calls[name] = (calls[name] ?? 0) + 1;
  };

  return {
    calls,
    replacedRepo: null,
    async initRepository() {
      count('initRepository');
      return ok({ repo, status: dirtyStatus });
    },
    async status() {
      count('status');
      return ok(cleanStatus);
    },
    async stageAll() {
      count('stageAll');
      return ok(cleanStatus);
    },
    async stagePaths() {
      count('stagePaths');
      return ok(cleanStatus);
    },
    async commit(options) {
      count('commit');
      assert.equal(options.message, 'Panel commit');
      return ok({ commit, status: cleanStatus });
    },
    async log() {
      count('log');
      return ok([commit]);
    },
    async getCurrentBranch() {
      count('getCurrentBranch');
      return ok('main');
    },
    async listBranches() {
      count('listBranches');
      return ok([{ name: 'main', sha: cleanStatus.headSha, current: true }]);
    },
    async createBranch(name) {
      count('createBranch');
      return ok({ name, sha: cleanStatus.headSha, current: false });
    },
    async switchBranch(name) {
      count('switchBranch');
      return ok({ repo, branch: { name, sha: cleanStatus.headSha, current: true } });
    },
    async readTrackedFiles() {
      count('readTrackedFiles');
      return ok([]);
    },
    replaceRepository(nextRepo) {
      count('replaceRepository');
      repo = nextRepo;
      this.replacedRepo = nextRepo;
    },
    getRepository() {
      return repo;
    },
  };
}

function createRemoteServiceMock(overrides: Partial<Record<'fetch' | 'pull' | 'push', RemoteGitResult>> = {}) {
  const calls: Record<string, number> = {};
  const count = (name: string) => {
    calls[name] = (calls[name] ?? 0) + 1;
  };

  return {
    calls,
    async fetch() {
      count('fetch');
      return overrides.fetch ?? { ok: true, message: 'Fetched origin/main at ccccccc.' };
    },
    async pull() {
      count('pull');
      return overrides.pull ?? { ok: true, message: 'Fast-forwarded main to ccccccc.', status: cleanStatus };
    },
    async push() {
      count('push');
      return overrides.push ?? { ok: true, message: 'Pushed 1 commit to origin/main.', status: cleanStatus };
    },
    async inspectToken() {
      count('inspectToken');
      return {
        ok: true as const,
        value: {
          user: { login: 'max-prime-math', type: 'user' as const },
          owners: [{ login: 'max-prime-math', type: 'user' as const }],
        },
        message: `Connected as max-prime-math with ${token}`,
      };
    },
    async listRepositories() {
      count('listRepositories');
      return {
        ok: true as const,
        value: [{ name: 'test-generator-bank', fullName: 'max-prime-math/test-generator-bank', owner: 'max-prime-math', private: false, defaultBranch: 'main' }],
        message: 'Loaded 1 repositories for max-prime-math.',
      };
    },
    async listBranches() {
      count('listBranches');
      return { ok: true as const, value: [{ name: 'main', sha: cleanStatus.headSha ?? '' }], message: 'Loaded 1 branches.' };
    },
    async inspectUpstream() {
      count('inspectUpstream');
      return ok({
        branch: 'main',
        remoteName: 'origin',
        remoteRef: 'refs/remotes/origin/main',
        localSha: cleanStatus.headSha,
        remoteSha: cleanStatus.headSha,
        ahead: 0,
        behind: 0,
      });
    },
    getRemoteUrl() {
      return 'https://github.com/max-prime-math/test-generator-bank.git';
    },
    getVerboseSummaries() {
      return [];
    },
  };
}

async function createPanel(remoteOverrides: Partial<Record<'fetch' | 'pull' | 'push', RemoteGitResult>> = {}) {
  const session = memoryStorage();
  const persistent = memoryStorage();
  const remoteStorage = memoryStorage();
  const credentials = createGitCredentialStore({ sessionStorage: session, persistentStorage: persistent });
  const remotes = createRemoteConfigStore({ storage: remoteStorage });
  await remotes.saveRemote(config);
  await credentials.saveGitHubToken({ repoId: 'test-generator-bank', remoteName: 'origin' }, token);
  const repoService = createRepoServiceMock();
  const remoteService = createRemoteServiceMock(remoteOverrides);
  const panel = new GitPanelState({
    repoService,
    credentialStore: credentials,
    remoteStore: remotes,
    remoteService: remoteService as never,
  });
  await panel.loadRemoteState();
  return { panel, repoService, remoteService, session, persistent };
}

async function testLocalCommitDelegatesToRepoService(): Promise<void> {
  const { panel, repoService } = await createPanel();
  await panel.projectAppData();
  assert.equal(panel.changedFileCount, 1);
  await panel.commit('Panel commit');
  assert.equal(repoService.calls.commit, 1);
  assert.equal(panel.message?.tone, 'success');
  assert.equal(panel.message?.text.includes('bbbbbbb'), true);
  assert.equal(panel.changedFileCount, 0);
}

async function testRemoteButtonsDelegateWithoutRiskGate(): Promise<void> {
  const { panel, remoteService } = await createPanel();
  panel.repoVisibility = 'unknown';
  await panel.fetch();
  await panel.pull();
  await panel.push();
  assert.equal(remoteService.calls.fetch, 1);
  assert.equal(remoteService.calls.pull, 1);
  assert.equal(remoteService.calls.push, 1);
}

async function testMultipleRemoteSelectionKeepsSeparateTokenState(): Promise<void> {
  const session = memoryStorage();
  const credentials = createGitCredentialStore({ sessionStorage: session, persistentStorage: memoryStorage() });
  const remotes = createRemoteConfigStore({ storage: memoryStorage() });
  await remotes.saveRemote(config);
  await remotes.saveRemote(backupConfig);
  await credentials.saveGitHubToken({ repoId: 'test-generator-bank', remoteName: 'origin' }, token);
  const panel = new GitPanelState({
    repoService: createRepoServiceMock(),
    credentialStore: credentials,
    remoteStore: remotes,
    remoteService: createRemoteServiceMock() as never,
  });

  await panel.loadRemoteState();
  assert.equal(panel.remoteName, 'origin');
  assert.equal(panel.owner, 'max-prime-math');
  assert.equal(panel.repoName, 'test-generator-bank');
  assert.equal(panel.tokenConnected, true);

  await panel.selectRemote('backup');
  assert.equal(panel.remoteName, 'backup');
  assert.equal(panel.owner, 'school-org');
  assert.equal(panel.repoName, 'shared-bank');
  assert.equal(panel.tokenConnected, false);

  panel.startNewRemote();
  assert.equal(panel.currentRemote, null);
  assert.equal(panel.tokenConnected, false);
  assert.equal(panel.owner, '');
  assert.equal(panel.repoName, '');
}

async function testTokenConnectClearsInputAndPersistenceIsOptIn(): Promise<void> {
  const session = memoryStorage();
  const persistent = memoryStorage();
  const credentials = createGitCredentialStore({ sessionStorage: session, persistentStorage: persistent });
  const remotes = createRemoteConfigStore({ storage: memoryStorage() });
  await remotes.saveRemote(config);
  const panel = new GitPanelState({
    repoService: createRepoServiceMock(),
    credentialStore: credentials,
    remoteStore: remotes,
    remoteService: createRemoteServiceMock() as never,
  });
  panel.tokenInput = token;
  panel.persistToken = false;
  await panel.connectGitHubToken();
  assert.equal(panel.tokenInput, '');
  assert.equal(JSON.stringify(session.dump()).includes(token), true);
  assert.equal(JSON.stringify(persistent.dump()).includes(token), false);
  assert.equal(panel.message?.text.includes(token), false);

  panel.tokenInput = token;
  panel.persistToken = true;
  await panel.connectGitHubToken();
  assert.equal(JSON.stringify(session.dump()).includes(token), false);
  assert.equal(JSON.stringify(persistent.dump()).includes(token), true);
}

async function testRenderedErrorsRedactSecrets(): Promise<void> {
  const { panel } = await createPanel({
    push: {
      ok: false,
      message: `Bad credentials ${token} ${googleToken} Authorization: Bearer ${token}`,
    },
  });
  panel.repoVisibility = 'private';
  await panel.push();
  assert.equal(panel.message?.tone, 'error');
  assert.equal(panel.message?.text.includes(token), false);
  assert.equal(panel.message?.text.includes('ya29.'), false);
  assert.equal(panel.message?.text.includes('Authorization: [redacted]'), true);
  assert.equal(panel.message?.text.includes('[redacted]'), true);
}

async function testDivergenceDoesNotReplaceRepo(): Promise<void> {
  const { panel, repoService } = await createPanel({
    pull: {
      ok: false,
      message: 'git pull: stopped because local aaaaaaa and origin/main ccccccc diverged. Fast-forward-only pull left local refs and app data unchanged.',
    },
  });
  await panel.pull();
  assert.equal(panel.message?.tone, 'error');
  assert.equal(panel.message?.text.includes('diverged'), true);
  assert.equal(repoService.calls.replaceRepository ?? 0, 0);
}

function testSourceSurface(): void {
  const app = readFileSync('src/App.svelte', 'utf8');
  const panel = readFileSync('src/components/GitSyncPanel.svelte', 'utf8');
  assert.match(app, /onclick=\{\(\) => \(gitSyncOpen = true\)\}/);
  assert.match(app, /<GitSyncPanel/);
  assert.match(panel, /type="password"/);
  assert.match(panel, /Active remote/);
  assert.match(panel, /New GitHub Remote/);
  assert.doesNotMatch(panel, /GitHub password|Google password|Google account password/i);
  assert.match(panel, /Google Drive Connection Only/);
  assert.doesNotMatch(panel, /acknowledgePushRisk/);
  assert.doesNotMatch(panel, /I understand pushed bank content/);
  assert.match(panel, /Diverged histories stop/);
  assert.match(panel, /Clone\/Import Active Remote/);
  assert.match(panel, /Replace current local app data/);
  assert.match(panel, /progress-fill-indeterminate/);
  assert.match(panel, /progressPercentage/);
}

await testLocalCommitDelegatesToRepoService();
await testRemoteButtonsDelegateWithoutRiskGate();
await testMultipleRemoteSelectionKeepsSeparateTokenState();
await testTokenConnectClearsInputAndPersistenceIsOptIn();
await testRenderedErrorsRedactSecrets();
await testDivergenceDoesNotReplaceRepo();
testSourceSurface();

console.log('git panel state tests passed');
