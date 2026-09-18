/**
 * Tests for the manifest-driven workspace folder sync.
 *
 * Run: npm run test:workspace-sync
 */

import { MemoryDirectoryHandle } from './memory-directory.ts';
import {
  appDataToEntries,
  changedPaths,
  entriesToAppData,
  readFingerprint,
  readFolderEntries,
  sameFingerprint,
  scanWorkspace,
  signatureFromFingerprint,
  testFolderKey,
  writeFolder,
  type FolderFingerprint,
} from '../src/lib/workspace-sync.ts';
import { folderSignature, readRepoFolder } from '../src/lib/folder-io.ts';
import type { RepoAppData } from '../src/git/repoDataModel.ts';
import { defaultTestConfig, type Question, type SavedTest } from '../src/lib/types.ts';

let failures = 0;
let checks = 0;

function check(label: string, condition: boolean, detail = ''): void {
  checks += 1;
  if (condition) return;
  failures += 1;
  console.error(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
}

function question(id: string, body = `Body of ${id}`): Question {
  return { id, body, points: 5, tags: [], createdAt: 0 };
}

function bankData(questions: Question[]): RepoAppData {
  return { questions, narratives: [], customClasses: [], savedTests: [], images: [] };
}

function savedTest(id: string, classId: string | null, selectedIds: string[]): SavedTest {
  return {
    id,
    name: `Test ${id}`,
    classId,
    unitId: null,
    testType: null,
    config: { ...defaultTestConfig(`Test ${id}`), selectedIds },
    createdAt: 0,
    updatedAt: 0,
  };
}

/** Count how many files a scan or load actually opened. */
function countingRoot(root: MemoryDirectoryHandle): { handle: MemoryDirectoryHandle; reads: string[] } {
  const reads: string[] = [];
  const wrap = (handle: MemoryDirectoryHandle, prefix: string): MemoryDirectoryHandle => {
    const proxy = Object.create(handle) as MemoryDirectoryHandle;
    proxy.getDirectoryHandle = async (name: string, options?: { create?: boolean }) =>
      wrap(await handle.getDirectoryHandle(name, options), prefix ? `${prefix}/${name}` : name);
    proxy.getFileHandle = async (name: string, options?: { create?: boolean }) => {
      const file = await handle.getFileHandle(name, options);
      const path = prefix ? `${prefix}/${name}` : name;
      const originalGetFile = file.getFile.bind(file);
      file.getFile = async () => { reads.push(path); return originalGetFile(); };
      return file;
    };
    proxy.values = async function* () {
      for await (const child of handle.values()) {
        yield child.kind === 'directory'
          ? wrap(child as MemoryDirectoryHandle, prefix ? `${prefix}/${child.name}` : child.name)
          : child;
      }
    };
    return proxy;
  };
  return { handle: wrap(root, ''), reads };
}

async function main(): Promise<void> {
  // ── A workspace with two banks, one of them large ────────────────────────
  const root = MemoryDirectoryHandle.create('workspace');
  const banksRoot = await root.getDirectoryHandle('banks', { create: true });
  const bigBank = await banksRoot.getDirectoryHandle('ap-calculus', { create: true });
  const smallBank = await banksRoot.getDirectoryHandle('default', { create: true });

  const manyQuestions = Array.from({ length: 400 }, (_, index) => question(`q-${String(index).padStart(3, '0')}`));
  const bigFingerprint = await writeFolder(bigBank, appDataToEntries(bankData(manyQuestions)), undefined);
  const smallFingerprint = await writeFolder(smallBank, appDataToEntries(bankData([question('only-one')])), undefined);

  check('big bank wrote a file per question', root.paths().filter((p) => p.startsWith('banks/ap-calculus/questions/')).length === 401,
    `${root.paths().filter((p) => p.startsWith('banks/ap-calculus/questions/')).length} files`);

  // ── Startup scan reads manifests only ────────────────────────────────────
  const counted = countingRoot(root);
  const scan = await scanWorkspace(counted.handle);
  check('scan found both banks', scan.banks.length === 2, `${scan.banks.length}`);
  check('scan reported no problems', scan.problems.length === 0, JSON.stringify(scan.problems));
  const questionReads = counted.reads.filter((path) => path.includes('/questions/'));
  check('startup scan opened no question files', questionReads.length === 0, `${questionReads.length} question reads`);
  check('startup scan stayed proportional to folders', counted.reads.length <= 6,
    `${counted.reads.length} reads: ${counted.reads.join(', ')}`);

  // ── An unchanged folder needs no further reads ───────────────────────────
  const stored: Record<string, FolderFingerprint> = {
    'banks/ap-calculus': bigFingerprint,
    'banks/default': smallFingerprint,
  };
  for (const bank of scan.banks) {
    check(`${bank.key} recognised as unchanged`, sameFingerprint(stored[bank.key], bank.fingerprint));
  }

  // ── One edited question is the only file re-read ─────────────────────────
  const edited = [...manyQuestions];
  edited[7] = question('q-007', 'Edited body');
  const afterEdit = await writeFolder(bigBank, appDataToEntries(bankData(edited)), bigFingerprint);
  const changed = changedPaths(bigFingerprint, afterEdit);
  // The index carries only metadata, so editing a body touches one file.
  check('only the edited question path changed', changed.length === 1 && changed[0] === 'questions/q-007.json',
    JSON.stringify(changed));

  const incremental = countingRoot(root);
  const incrementalScan = await scanWorkspace(incremental.handle);
  const bigSummary = incrementalScan.banks.find((bank) => bank.key === 'banks/ap-calculus')!;
  check('edited bank now differs', !sameFingerprint(bigFingerprint, bigSummary.fingerprint));
  const before = incremental.reads.length;
  const partial = await readFolderEntries(bigSummary.handle, bigSummary.fingerprint, new Set(changed));
  check('incremental load read only changed files', incremental.reads.length - before <= changed.length + 1,
    `${incremental.reads.length - before} reads for ${changed.length} changed paths`);
  check('incremental load returned the edited question',
    partial.some((entry) => entry.path === 'questions/q-007.json' && String(entry.content).includes('Edited body')));

  // ── A full load still round-trips ────────────────────────────────────────
  const full = entriesToAppData(await readFolderEntries(bigSummary.handle, bigSummary.fingerprint));
  check('full load returns every question', full.questions.length === 400, `${full.questions.length}`);
  check('full load preserves the edit', full.questions.find((q) => q.id === 'q-007')?.body === 'Edited body');

  // ── Saved tests land in the folder ───────────────────────────────────────
  const testsRoot = await root.getDirectoryHandle('tests', { create: true });
  const test = savedTest('unit-3-quiz', 'ap-calc-bc', ['q-001']);
  const key = testFolderKey(test);
  check('test key includes its class', key === 'tests/ap-calc-bc/unit-3-quiz', key);
  const testFolder = await (await testsRoot.getDirectoryHandle('ap-calc-bc', { create: true }))
    .getDirectoryHandle('unit-3-quiz', { create: true });
  await writeFolder(testFolder, appDataToEntries({
    questions: [question('q-001')], narratives: [], customClasses: [], savedTests: [test], images: [],
  }), undefined);

  const withTests = await scanWorkspace(root);
  check('scan found the saved test', withTests.tests.length === 1 && withTests.tests[0].key === key,
    JSON.stringify(withTests.tests.map((t) => t.key)));
  const loadedTest = entriesToAppData(await readFolderEntries(withTests.tests[0].handle, withTests.tests[0].fingerprint));
  check('saved test round-trips', loadedTest.savedTests.length === 1 && loadedTest.savedTests[0].id === 'unit-3-quiz');

  // ── A broken folder is reported, not fatal ───────────────────────────────
  const brokenRoot = await (await root.getDirectoryHandle('banks')).getDirectoryHandle('broken', { create: true });
  const brokenWritable = await (await brokenRoot.getFileHandle('manifest.json', { create: true })).createWritable();
  await brokenWritable.write('{ not json');
  await brokenWritable.close();

  const withBroken = await scanWorkspace(root);
  check('healthy banks still scanned alongside a broken one', withBroken.banks.length === 2, `${withBroken.banks.length}`);
  check('broken folder reported as a problem', withBroken.problems.some((problem) => problem.key === 'banks/broken'),
    JSON.stringify(withBroken.problems));

  // ── Deleting a question removes its file ─────────────────────────────────
  const trimmed = edited.slice(0, 399);
  const afterDelete = await writeFolder(bigBank, appDataToEntries(bankData(trimmed)), afterEdit);
  const remaining = root.paths().filter((path) => path.startsWith('banks/ap-calculus/questions/'));
  check('removed question file deleted from disk', remaining.length === 400, `${remaining.length} files`);
  check('fingerprint dropped the removed path', afterDelete.files[`questions/${edited[399].id}.json`] === undefined);

  // ── Manifest hashes reproduce the content signature exactly ──────────────
  const liveEntries = await readRepoFolder(smallBank as unknown as FileSystemDirectoryHandle);
  const fromFiles = folderSignature(liveEntries);
  const fromManifest = signatureFromFingerprint((await readFingerprint(smallBank))!);
  check('signature from manifest matches signature from file contents', fromFiles === fromManifest,
    `${fromManifest} vs ${fromFiles}`);

  const bigFromFiles = folderSignature(await readRepoFolder(bigBank as unknown as FileSystemDirectoryHandle));
  const bigFromManifest = signatureFromFingerprint((await readFingerprint(bigBank))!);
  check('signature matches for a 400-question bank', bigFromFiles === bigFromManifest);

  console.log(`${checks - failures}/${checks} checks passed`);
  if (failures > 0) process.exit(1);
}

await main();
