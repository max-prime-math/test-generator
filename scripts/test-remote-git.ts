import assert from 'node:assert/strict';
import {
  createMemoryGitFileStorage,
  createRepoBackend,
  type RepoBackend,
  type RepoCommitDetails,
  type TestGeneratorRepository,
} from '../src/git/repoBackend.ts';
import {
  createTestGeneratorRepository,
  projectAppDataToRepository,
} from '../src/git/repoDataBridge.ts';
import { createGitCredentialStore, GITHUB_TOKEN_GUIDANCE, redactGitSecrets, type KeyValueStorage } from '../src/git/credentials.ts';
import { createRemoteConfigStore, type GitRemoteConfig } from '../src/git/remoteConfig.ts';
import { createRemoteGitService } from '../src/git/remoteService.ts';
import { exportAppDataToRepoEntries, type RepoAppData, type RepoDataEntry } from '../src/git/repoDataModel.ts';
import { defaultTestConfig, type Question, type SavedTest } from '../src/lib/types.ts';

const token = 'github_pat_11AAABBBcccDDD_very-secret-token';
const config: GitRemoteConfig = {
  name: 'origin',
  kind: 'github',
  branch: 'main',
  upstream: 'main',
  defaultBranch: 'main',
  github: { owner: 'max-prime-math', repo: 'remote-test-bank' },
};

const question: Question = {
  id: 'q-1',
  body: 'Find the derivative of x^2.',
  questionType: 'short-answer',
  answer: '2x',
  solution: 'Use the power rule.',
  points: 1,
  tags: ['derivatives'],
  images: [],
  classId: 'custom-calc',
  unitId: 'u-1',
  sectionId: 's-1',
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_001_000,
};

const savedTest: SavedTest = {
  id: 't-1',
  name: 'Derivative Check',
  classId: 'custom-calc',
  unitId: 'u-1',
  testType: 'quiz',
  config: {
    ...defaultTestConfig('Calculus'),
    selectedIds: ['q-1'],
  },
  createdAt: 1_700_000_002_000,
  updatedAt: 1_700_000_003_000,
};

const baseAppData: RepoAppData = {
  questions: [question],
  customClasses: [
    {
      id: 'custom-calc',
      name: 'Custom Calculus',
      units: [{ id: 'u-1', name: 'Derivatives', sections: [{ id: 's-1', name: 'Power Rule' }] }],
    },
  ],
  savedTests: [savedTest],
  images: [],
};

function editedAppData(body: string, answer: string): RepoAppData {
  return {
    ...baseAppData,
    questions: [{ ...question, body, answer, updatedAt: Date.now() }],
  };
}

function assertOk<T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  assert.equal(result.ok, true, result.ok ? '' : JSON.stringify(result.error));
  return result.value;
}

function assertRemoteOk<T extends { ok: boolean; message: string }>(result: T): T {
  assert.equal(result.ok, true, result.message);
  return result;
}

function memoryStorage(): KeyValueStorage & { dump(): Record<string, string> } {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, value),
    removeItem: (key) => map.delete(key),
    dump: () => Object.fromEntries(map),
  };
}

async function createCommittedRepo(appData: RepoAppData, message: string): Promise<{
  backend: RepoBackend;
  repo: TestGeneratorRepository;
  head: string;
}> {
  const backend = createRepoBackend(createMemoryGitFileStorage());
  let repo = createTestGeneratorRepository();
  repo = projectAppDataToRepository(repo, appData, { generatedAt: '2026-06-03T00:00:00.000Z' }).repo;
  repo = assertOk(await backend.initRepository(repo));
  assertOk(await backend.stageAll(repo));
  const commit = assertOk(await backend.commit(repo, { message }));
  return { backend, repo, head: commit.sha };
}

async function appendCommit(
  backend: RepoBackend,
  repo: TestGeneratorRepository,
  appData: RepoAppData,
  message: string,
): Promise<{ repo: TestGeneratorRepository; sha: string }> {
  const nextRepo = projectAppDataToRepository(repo, appData).repo;
  assertOk(await backend.stageAll(nextRepo));
  return { repo: nextRepo, sha: assertOk(await backend.commit(nextRepo, { message })).sha };
}

async function testCredentialsAndRemoteConfig(): Promise<void> {
  const session = memoryStorage();
  const persistent = memoryStorage();
  const credentials = createGitCredentialStore({ sessionStorage: session, persistentStorage: persistent, now: () => new Date('2026-06-03T00:00:00.000Z') });
  await credentials.saveGitHubToken({ repoId: 'test-generator-bank', remoteName: 'origin' }, token);
  assert.equal((await credentials.loadGitHubToken({ repoId: 'test-generator-bank', remoteName: 'origin' }))?.persistence, 'session');
  assert.ok(JSON.stringify(session.dump()).includes(token));
  assert.equal(JSON.stringify(persistent.dump()).includes(token), false);

  await credentials.saveGitHubToken(
    { repoId: 'test-generator-bank', remoteName: 'origin' },
    token,
    { persistence: 'persistent' },
  );
  assert.equal((await credentials.loadGitHubToken({ repoId: 'test-generator-bank', remoteName: 'origin' }))?.persistence, 'persistent');
  assert.equal(JSON.stringify(session.dump()).includes(token), false);
  assert.ok(JSON.stringify(persistent.dump()).includes(token));
  assert.ok(GITHUB_TOKEN_GUIDANCE.includes('fine-grained'));
  assert.ok(GITHUB_TOKEN_GUIDANCE.includes('session storage by default'));

  const redacted = redactGitSecrets(
    `Authorization: Bearer ${token} ya29.a0AfH6SMB-secret ghp_oldsecret x-test-secret?access_token=${token}`,
    [token, 'x-test-secret'],
  );
  assert.equal(redacted.includes(token), false);
  assert.equal(redacted.includes('ya29.'), false);
  assert.equal(redacted.includes('ghp_oldsecret'), false);
  assert.equal(redacted.includes('x-test-secret'), false);

  const remoteStorage = memoryStorage();
  const remotes = createRemoteConfigStore({ storage: remoteStorage });
  await remotes.saveRemote(config);
  assert.equal(JSON.stringify(remoteStorage.dump()).includes(token), false);
  await assert.rejects(() => remotes.saveRemote({ ...config, name: '../bad' }));
  await assert.rejects(() => remotes.saveRemote({ ...config, branch: 'refs/heads/main' }));
  await assert.rejects(() => remotes.saveRemote({ ...config, github: { owner: 'max-prime-math', repo: 'https://bad.example/repo' } }));
}

async function testPushFetchAndPull(): Promise<void> {
  const local = await createCommittedRepo(baseAppData, 'Initial bank commit');
  const seedSha = local.head;
  const github = await MockGitHub.fromBackend(local.backend, local.repo, seedSha);
  const service = createRemoteGitService({ repoBackend: local.backend, fetchImpl: github.fetch });
  const nextCommit = await appendCommit(local.backend, local.repo, editedAppData('Find the derivative of x^3.', '3x^2'), 'Edit derivative question');
  local.repo = nextCommit.repo;
  const nextSha = nextCommit.sha;

  const pushResult = assertRemoteOk(await service.push(local.repo, config, async () => token));
  assert.ok(pushResult.message.includes('Pushed 1 commit'));
  assert.ok(github.refSha);
  assert.equal(assertOk(await local.backend.getRef(local.repo, 'refs/heads/main')), github.refSha);
  assert.equal(assertOk(await local.backend.getRef(local.repo, 'refs/remotes/origin/main')), github.refSha);
  assert.ok(github.operations.includes('PATCH /repos/max-prime-math/remote-test-bank/git/refs/heads/main'));
  assert.equal(github.requests.every((request) => request.url.startsWith('https://api.github.com/')), true);
  assert.equal(github.requests.some((request) => request.url.includes(token)), false);
  assert.equal(github.requests.every((request) => request.authorization === `Bearer ${token}`), true);

  const freshBackend = createRepoBackend(createMemoryGitFileStorage());
  let freshRepo = assertOk(await freshBackend.initRepository(createTestGeneratorRepository()));
  const freshService = createRemoteGitService({ repoBackend: freshBackend, fetchImpl: github.fetch });
  assertRemoteOk(await freshService.fetch(freshRepo, config, async () => token));
  assert.equal(assertOk(await freshBackend.getRef(freshRepo, 'refs/remotes/origin/main')), github.refSha);
  assert.equal(assertOk(await freshBackend.hasObject(freshRepo, github.refSha ?? '')), true);

  const pullBackend = createRepoBackend(createMemoryGitFileStorage());
  let pullRepo = assertOk(await pullBackend.initRepository(createTestGeneratorRepository()));
  const pullGithub = await MockGitHub.fromBackend(local.backend, local.repo, seedSha);
  const pullService = createRemoteGitService({ repoBackend: pullBackend, fetchImpl: pullGithub.fetch });
  assertRemoteOk(await pullService.fetch(pullRepo, config, async () => token));
  pullRepo = assertOk(await pullBackend.fastForwardBranch(pullRepo, 'main', seedSha)).repo;
  pullGithub.replaceWith(github);
  const pullResult = assertRemoteOk(await pullService.pull(pullRepo, config, async () => token));
  assert.equal(pullResult.status?.headSha, github.refSha);
  assert.equal(pullResult.repo?.filesystem.entries['questions/q-1.json']?.kind, 'file');

  const upstream = assertOk(await service.inspectUpstream(local.repo, config));
  assert.equal(upstream.localSha, github.refSha);
  assert.equal(upstream.remoteSha, github.refSha);
  assert.equal(upstream.ahead, 0);
  assert.equal(upstream.behind, 0);
  assert.equal(service.getVerboseSummaries([config])[0].fetch, 'https://github.com/max-prime-math/remote-test-bank.git');
}

async function testPushCreatesMissingBranchInInitializedRepo(): Promise<void> {
  const local = await createCommittedRepo(baseAppData, 'Initial bank commit');
  const branchConfig = { ...config, branch: 'test-generator', upstream: 'test-generator' };
  const github = await MockGitHub.initializedWithoutBranch();
  const service = createRemoteGitService({ repoBackend: local.backend, fetchImpl: github.fetch });

  const pushResult = assertRemoteOk(await service.push(local.repo, branchConfig, async () => token));
  assert.ok(pushResult.message.includes('Pushed 1 commit'));
  assert.ok(github.refSha);
  const localBranchRef = assertOk(await local.backend.getRef(local.repo, 'refs/heads/test-generator'));
  assert.ok(localBranchRef === null || localBranchRef === github.refSha);
  assert.equal(assertOk(await local.backend.getRef(local.repo, 'refs/remotes/origin/test-generator')), github.refSha);
  assert.ok(github.operations.includes('POST /repos/max-prime-math/remote-test-bank/git/refs'));
}

async function testCreateGitHubRepository(): Promise<void> {
  const backend = createRepoBackend(createMemoryGitFileStorage());
  let repo = assertOk(await backend.initRepository(createTestGeneratorRepository()));
  const github = await MockGitHub.emptyRepo();
  const service = createRemoteGitService({ repoBackend: backend, fetchImpl: github.fetch });
  const created = assertRemoteOk(await service.createRepository(
    { owner: 'max-prime-math', name: 'remote-test-bank', private: true, description: 'Test Generator bank' },
    () => token,
  ));
  assert.equal(created.value.name, 'remote-test-bank');
  assert.equal(created.value.fullName, 'max-prime-math/remote-test-bank');
  assert.equal(created.value.private, true);
  assert.ok(github.operations.includes('POST /user/repos'));
  const initialized = assertRemoteOk(await service.fetchInitializedBranch(repo, config, () => token));
  assert.ok(initialized.message.includes('Fetched initialized'));
  assert.equal(assertOk(await backend.getRef(repo, 'refs/remotes/origin/main')), github.refSha);
  assert.equal(github.requests.some((request) => request.url.includes(token)), false);
}

async function testPushReplaysLocalCommitOnEquivalentRemoteTree(): Promise<void> {
  const local = await createCommittedRepo(baseAppData, 'Initial bank commit');
  const equivalentRemote = await MockGitHub.schemaInvalidRemote(exportAppDataToRepoEntries(baseAppData, {
    generatedAt: '2026-06-03T00:00:00.000Z',
  }));
  assert.notEqual(equivalentRemote.refSha, local.head);
  const localCommit = await appendCommit(local.backend, local.repo, editedAppData('Local browser edit.', 'local'), 'Local browser edit');
  local.repo = localCommit.repo;
  const service = createRemoteGitService({ repoBackend: local.backend, fetchImpl: equivalentRemote.fetch });

  const pushResult = assertRemoteOk(await service.push(local.repo, config, async () => token));
  assert.ok(pushResult.message.includes('Pushed 1 commit'));
  assert.equal(assertOk(await local.backend.getRef(local.repo, 'refs/remotes/origin/main')), equivalentRemote.refSha);
  assert.notEqual(equivalentRemote.refSha, localCommit.sha);
  assert.equal(equivalentRemote.requests.some((request) => request.url.includes(token)), false);
}

async function testFetchRejectsMaliciousRemoteBeforeRefUpdate(): Promise<void> {
  const local = await createCommittedRepo(baseAppData, 'Initial bank commit');
  const github = await MockGitHub.fromBackend(local.backend, local.repo, local.head);
  const service = createRemoteGitService({ repoBackend: local.backend, fetchImpl: github.fetch });
  assertRemoteOk(await service.fetch(local.repo, config, async () => token));
  const previousRef = assertOk(await local.backend.getRef(local.repo, 'refs/remotes/origin/main'));

  const cases = [
    MockGitHub.maliciousTree({ path: '../evil.json' }),
    MockGitHub.maliciousTree({ path: 'README.md', mode: '120000' }),
    MockGitHub.maliciousTree({ path: 'README.md', truncated: true }),
    await MockGitHub.schemaInvalidRemote([{ path: 'README.md', kind: 'file', content: 'not enough repo data' }]),
    await MockGitHub.schemaInvalidRemote([{ path: 'README.md', kind: 'file', content: 'x'.repeat(1_048_577) }]),
  ];

  for (const badRemote of cases) {
    github.replaceWith(badRemote);
    const result = await service.fetch(local.repo, config, async () => token);
    assert.equal(result.ok, false, 'malicious fetch should fail');
    assert.equal(result.message.includes(token), false);
    assert.equal(assertOk(await local.backend.getRef(local.repo, 'refs/remotes/origin/main')), previousRef);
  }

  const oldJsonExport = await MockGitHub.schemaInvalidRemote([
    {
      path: 'custom-ap-calculus-1777525408203.json',
      kind: 'file',
      content: JSON.stringify({ questions: [{ id: 'q-1', body: 'legacy export' }] }).padEnd(1_048_577, ' '),
    },
  ]);
  github.replaceWith(oldJsonExport);
  const oldExportResult = await service.fetch(local.repo, config, async () => token);
  assert.equal(oldExportResult.ok, false);
  assert.ok(oldExportResult.message.includes('missing manifest.json'));
  assert.ok(oldExportResult.message.includes('older JSON export'));
  assert.equal(oldExportResult.message.includes('Remote object exceeds size limit'), false);
  assert.equal(assertOk(await local.backend.getRef(local.repo, 'refs/remotes/origin/main')), previousRef);
}

async function testPushFailureAndDivergedPullAreNonDestructive(): Promise<void> {
  const local = await createCommittedRepo(baseAppData, 'Initial bank commit');
  const seedSha = local.head;
  const github = await MockGitHub.fromBackend(local.backend, local.repo, seedSha);
  const service = createRemoteGitService({ repoBackend: local.backend, fetchImpl: github.fetch });
  const localCommit = await appendCommit(local.backend, local.repo, editedAppData('Local edit.', 'local'), 'Local edit');
  local.repo = localCommit.repo;
  const localSha = localCommit.sha;

  github.rejectRefUpdates = true;
  const pushResult = await service.push(local.repo, config, async () => token);
  assert.equal(pushResult.ok, false);
  assert.equal(pushResult.message.includes(token), false);
  assert.equal(github.refSha, seedSha);
  assert.equal(assertOk(await local.backend.getRef(local.repo, 'refs/heads/main')), localSha);
  assert.equal(assertOk(await local.backend.getRef(local.repo, 'refs/remotes/origin/main')), null);

  github.rejectRefUpdates = false;
  const remoteSource = await createCommittedRepo(baseAppData, 'Initial bank commit');
  const remoteCommit = await appendCommit(remoteSource.backend, remoteSource.repo, editedAppData('Remote edit.', 'remote'), 'Remote edit');
  remoteSource.repo = remoteCommit.repo;
  const remoteNextSha = remoteCommit.sha;
  github.replaceWith(await MockGitHub.fromBackend(remoteSource.backend, remoteSource.repo, remoteNextSha));
  const pullResult = await service.pull(local.repo, config, async () => token);
  assert.equal(pullResult.ok, false);
  assert.ok(pullResult.message.includes('diverged'));
  assert.equal(assertOk(await local.backend.getRef(local.repo, 'refs/heads/main')), localSha);

  const dirty = projectAppDataToRepository(local.repo, editedAppData('Dirty app edit.', 'dirty')).repo;
  const dirtyPull = await service.pull(dirty, config, async () => token);
  assert.equal(dirtyPull.ok, false);
  assert.ok(dirtyPull.message.includes('commit local app changes'));

  const emptyRemote = await MockGitHub.emptyRepo();
  const emptyService = createRemoteGitService({ repoBackend: local.backend, fetchImpl: emptyRemote.fetch });
  const emptyFetch = await emptyService.fetch(local.repo, config, async () => token);
  assert.equal(emptyFetch.ok, false);
  assert.ok(emptyFetch.message.includes('empty') || emptyFetch.message.includes('Initialize'));
}

class MockGitHub {
  refSha: string | null;
  requests: Array<{ method: string; url: string; authorization: string | null }> = [];
  operations: string[] = [];
  rejectRefUpdates = false;

  #commits = new Map<string, GitHubCommitPayload>();
  #trees = new Map<string, GitHubTreePayload>();
  #blobs = new Map<string, Uint8Array>();
  #empty = false;

  constructor(refSha: string | null) {
    this.refSha = refSha;
    this.fetch = this.fetch.bind(this);
  }

  static async emptyRepo(): Promise<MockGitHub> {
    const github = new MockGitHub(null);
    github.#empty = true;
    return github;
  }

  static async initializedWithoutBranch(): Promise<MockGitHub> {
    return new MockGitHub(null);
  }

  static async fromBackend(backend: RepoBackend, repo: TestGeneratorRepository, headSha: string): Promise<MockGitHub> {
    const github = new MockGitHub(headSha);
    await github.addCommitGraphFromBackend(backend, repo, headSha);
    return github;
  }

  static maliciousTree(options: { path: string; mode?: string; truncated?: boolean }): MockGitHub {
    const commitSha = '1111111111111111111111111111111111111111';
    const treeSha = '2222222222222222222222222222222222222222';
    const blobSha = '3333333333333333333333333333333333333333';
    const github = new MockGitHub(commitSha);
    github.#commits.set(commitSha, {
      sha: commitSha,
      message: 'bad',
      tree: { sha: treeSha },
      parents: [],
      author: { name: 'Bad', email: 'bad@example.invalid', date: '2026-06-03T00:00:00+00:00' },
      committer: { name: 'Bad', email: 'bad@example.invalid', date: '2026-06-03T00:00:00+00:00' },
    });
    github.#trees.set(treeSha, {
      sha: treeSha,
      truncated: options.truncated,
      tree: [{ path: options.path, mode: options.mode ?? '100644', type: 'blob', sha: blobSha, size: 1 }],
    });
    github.#blobs.set(blobSha, new Uint8Array([120]));
    return github;
  }

  static async schemaInvalidRemote(entries: RepoDataEntry[]): Promise<MockGitHub> {
    const remote = await buildRemoteObjectsFromEntries(entries, 'Schema invalid');
    const github = new MockGitHub(remote.commit.sha);
    github.#commits.set(remote.commit.sha, remote.commit);
    github.#trees.set(remote.tree.sha, remote.tree);
    for (const [sha, bytes] of remote.blobs) github.#blobs.set(sha, bytes);
    return github;
  }

  replaceWith(other: MockGitHub): void {
    this.refSha = other.refSha;
    this.#commits = other.#commits;
    this.#trees = other.#trees;
    this.#blobs = other.#blobs;
    this.#empty = other.#empty;
  }

  async addCommitGraphFromBackend(backend: RepoBackend, repo: TestGeneratorRepository, sha: string): Promise<void> {
    if (this.#commits.has(sha)) return;
    const commit = assertOk(await backend.readCommitDetails(repo, sha));
    for (const parent of commit.parentShas) await this.addCommitGraphFromBackend(backend, repo, parent);
    const entries = assertOk(await backend.listCommitTree(repo, sha));
    const treePayload = {
      sha: commit.treeSha,
      truncated: false,
      tree: entries.map((entry) => ({ path: entry.path, mode: '100644', type: 'blob' as const, sha: entry.oid, size: entry.size })),
    };
    this.#trees.set(commit.treeSha, treePayload);
    for (const entry of entries) {
      const object = assertOk(await backend.readObject(repo, entry.oid));
      this.#blobs.set(entry.oid, object.content);
    }
    this.#commits.set(sha, commitDetailsToGitHubCommit(commit));
  }

  async fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = input instanceof Request ? input.url : String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    const parsed = new URL(url);
    const authorization = new Headers(init?.headers).get('Authorization');
    this.requests.push({ method, url, authorization });
    this.operations.push(`${method} ${parsed.pathname}`);
    assert.equal(parsed.origin, 'https://api.github.com');

    if (parsed.pathname === '/user') return json({ login: 'max-prime-math' });
    if (parsed.pathname === '/user/orgs') return json([]);
    if (parsed.pathname === '/user/repos' && method === 'POST') {
      const body = JSON.parse(String(init?.body ?? '{}')) as { name: string; private: boolean; description?: string; auto_init?: boolean };
      this.#empty = !body.auto_init;
      if (body.auto_init) {
        const remote = await buildRemoteObjectsFromEntries(
          [{ path: 'README.md', kind: 'file', content: `# ${body.name}\n` }],
          'Initial commit',
        );
        this.refSha = remote.commit.sha;
        this.#commits.set(remote.commit.sha, remote.commit);
        this.#trees.set(remote.tree.sha, remote.tree);
        for (const [sha, bytes] of remote.blobs) this.#blobs.set(sha, bytes);
      }
      return json({
        name: body.name,
        full_name: `max-prime-math/${body.name}`,
        private: body.private,
        default_branch: 'main',
        owner: { login: 'max-prime-math' },
      }, 201);
    }
    if (parsed.pathname === '/user/repos') {
      return json([{ name: 'remote-test-bank', full_name: 'max-prime-math/remote-test-bank', private: true, default_branch: 'main', owner: { login: 'max-prime-math' } }]);
    }
    if (parsed.pathname === '/repos/max-prime-math/remote-test-bank/branches') {
      return json(this.refSha ? [{ name: 'main', commit: { sha: this.refSha } }] : []);
    }
    if (parsed.pathname === '/repos/max-prime-math/remote-test-bank') return json({ default_branch: 'main' });
    if (parsed.pathname === '/repos/max-prime-math/remote-test-bank/git/ref/heads/main') {
      if (this.#empty) return json({ message: 'Git Repository is empty.' }, 409);
      return this.refSha ? json({ object: { sha: this.refSha } }) : json({ message: 'Not Found' }, 404);
    }
    if (parsed.pathname === '/repos/max-prime-math/remote-test-bank/git/ref/heads/test-generator') {
      if (this.#empty) return json({ message: 'Git Repository is empty.' }, 409);
      return this.refSha ? json({ object: { sha: this.refSha } }) : json({ message: 'Not Found' }, 404);
    }
    if (parsed.pathname.startsWith('/repos/max-prime-math/remote-test-bank/git/commits/')) {
      const sha = parsed.pathname.split('/').at(-1) ?? '';
      const commit = this.#commits.get(sha);
      return commit ? json(commit) : json({ message: 'Commit not found' }, 404);
    }
    if (parsed.pathname.startsWith('/repos/max-prime-math/remote-test-bank/git/trees/')) {
      const sha = parsed.pathname.split('/').at(-1) ?? '';
      const tree = this.#trees.get(sha);
      return tree ? json(tree) : json({ message: 'Tree not found' }, 404);
    }
    if (parsed.pathname.startsWith('/repos/max-prime-math/remote-test-bank/git/blobs/') && method === 'GET') {
      const sha = parsed.pathname.split('/').at(-1) ?? '';
      const bytes = this.#blobs.get(sha);
      return bytes ? json({ sha, content: bytesToBase64(bytes), encoding: 'base64' }) : json({ message: 'Blob not found' }, 404);
    }
    if (parsed.pathname === '/repos/max-prime-math/remote-test-bank/git/blobs' && method === 'POST') {
      const body = JSON.parse(String(init?.body ?? '{}')) as { content: string };
      const bytes = base64ToBytes(body.content);
      const sha = await gitSha('blob', bytes);
      this.#blobs.set(sha, bytes);
      return json({ sha }, 201);
    }
    if (parsed.pathname === '/repos/max-prime-math/remote-test-bank/git/trees' && method === 'POST') {
      const body = JSON.parse(String(init?.body ?? '{}')) as { tree: Array<{ path: string; sha: string; mode: string }> };
      const sha = await treeSha(body.tree.map((entry) => ({ path: entry.path, oid: entry.sha, mode: '100644', size: this.#blobs.get(entry.sha)?.byteLength ?? 0 })));
      this.#trees.set(sha, {
        sha,
        truncated: false,
        tree: body.tree.map((entry) => ({ path: entry.path, mode: entry.mode, type: 'blob' as const, sha: entry.sha, size: this.#blobs.get(entry.sha)?.byteLength ?? 0 })),
      });
      return json({ sha }, 201);
    }
    if (parsed.pathname === '/repos/max-prime-math/remote-test-bank/git/commits' && method === 'POST') {
      const body = JSON.parse(String(init?.body ?? '{}')) as CreateCommitBody;
      const commitText = buildGitHubCreatedCommitText(body);
      const sha = await gitSha('commit', new TextEncoder().encode(commitText));
      this.#commits.set(sha, {
        sha,
        message: body.message,
        tree: { sha: body.tree },
        parents: body.parents.map((parent) => ({ sha: parent })),
        author: body.author,
        committer: body.committer,
      });
      return json({ sha }, 201);
    }
    if (parsed.pathname === '/repos/max-prime-math/remote-test-bank/git/refs/heads/main' && method === 'PATCH') {
      const body = JSON.parse(String(init?.body ?? '{}')) as { sha: string; force: boolean };
      if (this.rejectRefUpdates) return json({ message: `Rejected ${token}` }, 422);
      if (body.force) return json({ message: 'Force updates are disabled' }, 422);
      if (this.refSha && !(await isAncestorInMock(this.#commits, this.refSha, body.sha))) {
        return json({ message: 'Update is not a fast forward' }, 422);
      }
      this.refSha = body.sha;
      return json({ object: { sha: body.sha } });
    }
    if (parsed.pathname === '/repos/max-prime-math/remote-test-bank/git/refs' && method === 'POST') {
      const body = JSON.parse(String(init?.body ?? '{}')) as { ref: string; sha: string };
      if (this.#empty) return json({ message: 'Git Repository is empty.' }, 409);
      if (body.ref !== 'refs/heads/test-generator') return json({ message: 'Unexpected ref' }, 422);
      this.refSha = body.sha;
      return json({ ref: body.ref, object: { sha: body.sha } }, 201);
    }
    return json({ message: `Unhandled ${method} ${parsed.pathname}` }, 404);
  }
}

interface GitHubCommitPayload {
  sha: string;
  message: string;
  tree: { sha: string };
  parents: Array<{ sha: string }>;
  author: { name?: string; email?: string; date?: string } | null;
  committer: { name?: string; email?: string; date?: string } | null;
}

interface GitHubTreePayload {
  sha: string;
  truncated?: boolean;
  tree: Array<{ path: string; mode: string; type: 'blob'; sha: string; size: number }>;
}

interface CreateCommitBody {
  message: string;
  tree: string;
  parents: string[];
  author: { name: string; email: string; date: string };
  committer: { name: string; email: string; date: string };
}

async function buildRemoteObjectsFromEntries(entries: RepoDataEntry[], message: string): Promise<{
  commit: GitHubCommitPayload;
  tree: GitHubTreePayload;
  blobs: Map<string, Uint8Array>;
}> {
  const blobs = new Map<string, Uint8Array>();
  const treeEntries = [];
  for (const entry of entries) {
    const bytes = typeof entry.content === 'string' ? new TextEncoder().encode(entry.content) : entry.content;
    const sha = await gitSha('blob', bytes);
    blobs.set(sha, bytes);
    treeEntries.push({ path: entry.path, oid: sha, mode: '100644', size: bytes.byteLength });
  }
  const sha = await treeSha(treeEntries);
  const commitBody: CreateCommitBody = {
    message,
    tree: sha,
    parents: [],
    author: { name: 'Remote', email: 'remote@example.invalid', date: '2026-06-03T00:00:00+00:00' },
    committer: { name: 'Remote', email: 'remote@example.invalid', date: '2026-06-03T00:00:00+00:00' },
  };
  const commitSha = await gitSha('commit', new TextEncoder().encode(buildCommitText(commitBody)));
  return {
    commit: {
      sha: commitSha,
      message,
      tree: { sha },
      parents: [],
      author: commitBody.author,
      committer: commitBody.committer,
    },
    tree: {
      sha,
      truncated: false,
      tree: treeEntries.map((entry) => ({ path: entry.path, mode: '100644', type: 'blob', sha: entry.oid, size: entry.size })),
    },
    blobs,
  };
}

function commitDetailsToGitHubCommit(commit: RepoCommitDetails): GitHubCommitPayload {
  return {
    sha: commit.sha,
    message: commit.message,
    tree: { sha: commit.treeSha },
    parents: commit.parentShas.map((sha) => ({ sha })),
    author: { name: commit.authorName, email: commit.authorEmail, date: formatGitHubDate(commit.authoredAt, commit.authorTimezone) },
    committer: { name: commit.committerName, email: commit.committerEmail, date: formatGitHubDate(commit.committedAt, commit.committerTimezone) },
  };
}

async function isAncestorInMock(commits: Map<string, GitHubCommitPayload>, ancestor: string, descendant: string): Promise<boolean> {
  const seen = new Set<string>();
  const stack = [descendant];
  while (stack.length) {
    const sha = stack.pop();
    if (!sha || seen.has(sha)) continue;
    if (sha === ancestor) return true;
    seen.add(sha);
    stack.push(...(commits.get(sha)?.parents.map((parent) => parent.sha) ?? []));
  }
  return false;
}

function buildCommitText(body: CreateCommitBody): string {
  const headers = [
    `tree ${body.tree}`,
    ...body.parents.map((parent) => `parent ${parent}`),
    `author ${body.author.name} <${body.author.email}> ${parseGitDate(body.author.date).timestamp} ${parseGitDate(body.author.date).timezone}`,
    `committer ${body.committer.name} <${body.committer.email}> ${parseGitDate(body.committer.date).timestamp} ${parseGitDate(body.committer.date).timezone}`,
    '',
  ];
  return `${headers.join('\n')}\n${body.message.endsWith('\n') ? body.message : `${body.message}\n`}`;
}

function buildGitHubCreatedCommitText(body: CreateCommitBody): string {
  const headers = [
    `tree ${body.tree}`,
    ...body.parents.map((parent) => `parent ${parent}`),
    `author ${body.author.name} <${body.author.email}> ${parseGitDate(body.author.date).timestamp} ${parseGitDate(body.author.date).timezone}`,
    `committer ${body.committer.name} <${body.committer.email}> ${parseGitDate(body.committer.date).timestamp} ${parseGitDate(body.committer.date).timezone}`,
    '',
  ];
  return `${headers.join('\n')}\n${body.message.trimEnd()}`;
}

function formatGitHubDate(isoDate: string, timezone: string): string {
  const date = new Date(isoDate);
  const offsetMinutes = parseTimezoneOffset(timezone);
  const local = new Date(date.getTime() + offsetMinutes * 60_000);
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, '0')}-${String(local.getUTCDate()).padStart(2, '0')}T${String(local.getUTCHours()).padStart(2, '0')}:${String(local.getUTCMinutes()).padStart(2, '0')}:${String(local.getUTCSeconds()).padStart(2, '0')}${timezone.slice(0, 3)}:${timezone.slice(3)}`;
}

function parseGitDate(dateText: string): { timestamp: number; timezone: string } {
  const offsetMatch = /([+-]\d{2}):?(\d{2})$/.exec(dateText);
  return {
    timestamp: Math.floor(new Date(dateText).getTime() / 1000),
    timezone: offsetMatch ? `${offsetMatch[1]}${offsetMatch[2]}` : '+0000',
  };
}

function parseTimezoneOffset(timezone: string): number {
  const match = /^([+-])(\d{2})(\d{2})$/.exec(timezone);
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === '-' ? -minutes : minutes;
}

async function treeSha(entries: Array<{ path: string; oid: string; mode: '100644'; size: number }>): Promise<string> {
  return treeNodeSha(buildTreeNode(entries));
}

async function treeNodeSha(node: TreeNode): Promise<string> {
  const chunks: Uint8Array[] = [];
  const children = [...node.children.entries()].sort(([left], [right]) => compareStrings(left, right));
  for (const [name, child] of children) {
    if (child.kind === 'file') chunks.push(new TextEncoder().encode(`${child.entry.mode} ${name}\0`), hexToBytes(child.entry.oid));
    else chunks.push(new TextEncoder().encode(`40000 ${name}\0`), hexToBytes(await treeNodeSha(child.node)));
  }
  return gitSha('tree', concatBytes(chunks));
}

function buildTreeNode(entries: Array<{ path: string; oid: string; mode: '100644'; size: number }>): TreeNode {
  const root: TreeNode = { children: new Map() };
  for (const entry of entries.sort((left, right) => compareStrings(left.path, right.path))) {
    const segments = entry.path.split('/');
    const fileName = segments.pop();
    if (!fileName) continue;
    let node = root;
    for (const segment of segments) {
      const existing = node.children.get(segment);
      if (existing?.kind === 'tree') {
        node = existing.node;
        continue;
      }
      const child: TreeNode = { children: new Map() };
      node.children.set(segment, { kind: 'tree', node: child });
      node = child;
    }
    node.children.set(fileName, { kind: 'file', entry });
  }
  return root;
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

interface TreeNode {
  children: Map<string, { kind: 'file'; entry: { path: string; oid: string; mode: '100644'; size: number } } | { kind: 'tree'; node: TreeNode }>;
}

async function gitSha(type: 'blob' | 'tree' | 'commit', content: Uint8Array): Promise<string> {
  const header = new TextEncoder().encode(`${type} ${content.byteLength}\0`);
  const payload = concatBytes([header, content]);
  const digest = await crypto.subtle.digest('SHA-1', payload);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function base64ToBytes(value: string): Uint8Array {
  const decoded = atob(value);
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) bytes[index] = decoded.charCodeAt(index);
  return bytes;
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

await testCredentialsAndRemoteConfig();
await testPushFetchAndPull();
await testPushCreatesMissingBranchInInitializedRepo();
await testCreateGitHubRepository();
await testPushReplaysLocalCommitOnEquivalentRemoteTree();
await testFetchRejectsMaliciousRemoteBeforeRefUpdate();
await testPushFailureAndDivergedPullAreNonDestructive();

console.log('remote git service tests passed');
