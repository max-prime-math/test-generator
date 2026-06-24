import assert from 'node:assert/strict';
import {
  createMemoryGitFileStorage,
  createRepoBackend,
  type TestGeneratorRepository,
} from '../src/git/repoBackend.ts';
import {
  createTestGeneratorRepository,
  projectAppDataToRepository,
  suggestRepoCommitMessageFromStatus,
  trackedFilesToRepoEntries,
} from '../src/git/repoDataBridge.ts';
import { withRepoOperationLock, createTestGeneratorRepoService } from '../src/git/repoStore.ts';
import { importRepoEntriesToAppData, type RepoAppData } from '../src/git/repoDataModel.ts';
import { defaultTestConfig, type Question, type SavedTest } from '../src/lib/types.ts';

const question: Question = {
  id: 'q-1',
  body: 'Find the derivative of x^2.',
  questionType: 'short-answer',
  answer: '2x',
  solution: 'Use the power rule.',
  points: 1,
  tags: ['derivatives'],
  images: ['diagram'],
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

let appData: RepoAppData = {
  questions: [question],
  customClasses: [
    {
      id: 'custom-calc',
      name: 'Custom Calculus',
      units: [{ id: 'u-1', name: 'Derivatives', sections: [{ id: 's-1', name: 'Power Rule' }] }],
    },
  ],
  savedTests: [savedTest],
  images: [
    {
      name: 'diagram',
      ext: 'png',
      mime: 'image/png',
      size: 4,
      bytes: new Uint8Array([137, 80, 78, 71]),
    },
  ],
};

function assertOk<T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  assert.equal(result.ok, true, result.ok ? '' : JSON.stringify(result.error));
  return result.value;
}

async function assertReject(label: string, result: Promise<{ ok: boolean; error?: { code: string } }>, code?: string): Promise<void> {
  const resolved = await result;
  assert.equal(resolved.ok, false, `${label} should fail`);
  if (code) assert.equal(resolved.error?.code, code);
}

async function testRepoService(): Promise<void> {
  const storage = createMemoryGitFileStorage();
  const backend = createRepoBackend(storage);
  const repo = createTestGeneratorRepository();
  const service = createTestGeneratorRepoService({
    backend,
    repo,
    readAppData: async () => appData,
  });

  const firstInit = assertOk(await service.initRepository());
  const secondInit = assertOk(await service.initRepository());
  assert.equal(firstInit.status.branch, 'main');
  assert.equal(secondInit.status.branch, 'main');
  assert.equal(suggestRepoCommitMessageFromStatus(firstInit.status, 'Custom Calculus'), 'Added 1 question to Custom Calculus');
  assert.equal(
    suggestRepoCommitMessageFromStatus({
      ...firstInit.status,
      entries: [
        { path: 'questions/q-2.json', staged: null, worktree: 'untracked' },
        { path: 'questions/q-3.json', staged: null, worktree: 'untracked' },
        { path: 'questions/q-1.json', staged: null, worktree: 'modified' },
        { path: 'questions/index.json', staged: null, worktree: 'modified' },
      ],
    }, 'Custom Calculus'),
    'Updated Custom Calculus: added 2 questions, edited 1 question',
  );

  const firstCommit = assertOk(await service.commit({ message: 'Initial bank commit' }));
  assert.equal(firstCommit.status.entries.length, 0);

  const tracked = assertOk(await backend.readTrackedFiles(service.getRepository()));
  const trackedEntries = trackedFilesToRepoEntries(tracked);
  assert.deepEqual(trackedEntries.map((entry) => entry.path), [
    'README.md',
    'curriculum/custom-classes.json',
    'images/diagram.png',
    'manifest.json',
    'narratives/index.json',
    'questions/index.json',
    'questions/q-1.json',
    'tests/index.json',
    'tests/t-1.json',
  ]);
  const imported = importRepoEntriesToAppData(trackedEntries).appData;
  assert.deepEqual(Array.from(imported.images?.[0].bytes ?? []), [137, 80, 78, 71]);

  appData = {
    ...appData,
    questions: [{ ...question, body: 'Find the derivative of x^3.', answer: '3x^2', updatedAt: 1_700_000_004_000 }],
  };
  const dirtyStatus = assertOk(await service.status());
  assert.ok(dirtyStatus.entries.some((entry) => entry.path === 'questions/q-1.json' && entry.worktree === 'modified'));
  assert.equal(suggestRepoCommitMessageFromStatus(dirtyStatus, 'Custom Calculus'), 'Edited 1 question in Custom Calculus');

  const secondCommit = assertOk(await service.commit({ message: 'Edit derivative question' }));
  assert.equal(secondCommit.commit.parentShas.length, 1);
  assert.equal(secondCommit.status.entries.length, 0);
  const log = assertOk(await service.log());
  assert.deepEqual(log.map((commit) => commit.message), ['Edit derivative question', 'Initial bank commit']);

  const persistedService = createTestGeneratorRepoService({
    backend: createRepoBackend(storage),
    repo: createTestGeneratorRepository(),
    readAppData: async () => appData,
  });
  assert.deepEqual(assertOk(await persistedService.log()).map((commit) => commit.message), [
    'Edit derivative question',
    'Initial bank commit',
  ]);

  await assertReject(
    '.git worktree path',
    backend.status({
      ...service.getRepository(),
      filesystem: {
        entries: {
          '.git/config': { path: '.git/config', kind: 'file', content: 'bad' },
        },
        updatedAt: new Date().toISOString(),
      },
    }),
    'invalid-path',
  );

  await assertReject(
    'missing ref object',
    backend.setRef(service.getRepository(), 'refs/heads/missing', '0000000000000000000000000000000000000000'),
    'corrupt-repository',
  );
  assert.equal(assertOk(await backend.getRef(service.getRepository(), 'refs/heads/missing')), null);

  const blobSha = assertOk(await backend.writeObject(service.getRepository(), 'blob', new TextEncoder().encode('target')));
  await assertReject(
    'unsupported symlink mode',
    backend.writeTree(service.getRepository(), [{ path: 'link', oid: blobSha, mode: '120000' as '100644', size: 6 }]),
    'unsupported',
  );
}

async function testBackendDirectCommits(): Promise<void> {
  const backend = createRepoBackend(createMemoryGitFileStorage());
  let repo: TestGeneratorRepository = createTestGeneratorRepository();
  repo = projectAppDataToRepository(repo, appData, { generatedAt: '2026-06-03T00:00:00.000Z' }).repo;
  repo = assertOk(await backend.initRepository(repo));
  assertOk(await backend.stageAll(repo));
  const commit = assertOk(await backend.commit(repo, { message: 'Direct backend commit' }));
  assert.ok(assertOk(await backend.hasObject(repo, commit.sha)));
  assert.equal(assertOk(await backend.listCommitTree(repo, commit.sha)).some((entry) => entry.path === 'images/diagram.png'), true);
}

async function testOperationLock(): Promise<void> {
  const events: string[] = [];
  await Promise.all([
    withRepoOperationLock('lock-test', async () => {
      events.push('start-1');
      await new Promise((resolve) => setTimeout(resolve, 25));
      events.push('end-1');
      return { ok: true, value: undefined };
    }),
    withRepoOperationLock('lock-test', async () => {
      events.push('start-2');
      events.push('end-2');
      return { ok: true, value: undefined };
    }),
  ]);
  assert.deepEqual(events, ['start-1', 'end-1', 'start-2', 'end-2']);
}

await testRepoService();
await testBackendDirectCommits();
await testOperationLock();

console.log('local git backend tests passed');
