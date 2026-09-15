import assert from 'node:assert/strict';
import { bankOnlyData, snapshotTest, standaloneTestData, workspaceId, mergeWorkspaceClasses, firstById } from '../src/lib/workspace-format.ts';
import { exportAppDataToRepoEntries, importRepoEntriesToAppData, type RepoAppData } from '../src/git/repoDataModel.ts';
import { defaultTestConfig, type SavedTest } from '../src/lib/types.ts';
import { folderSignature, readRepoFolder, writeRepoFolder } from '../src/lib/folder-io.ts';
import { readWorkspaceTests, saveWorkspaceTest, archiveRemovedWorkspaceTests, testClassFolder, testFolderPath } from '../src/lib/workspace-tests.ts';

const data: RepoAppData = {
  questions: [{ id: 'same-id', body: 'Bank A question #image("/imgs/graph.png")', points: 4, tags: [], classId: 'precalc-40s', createdAt: 1, images: ['graph'] }],
  narratives: [], customClasses: [{ id: 'precalc-40s', name: 'Pre-Calculus 40S', units: [] }],
  savedTests: [], images: [
    { name: 'graph', ext: 'png', bytes: new Uint8Array([1, 2, 3]) },
    { name: 'private-unused-asset', ext: 'png', bytes: new Uint8Array([4]) },
  ],
};
assert.deepEqual([...firstById([{ id: 'a', body: 'frozen' }, { id: 'b', body: 'second' }, { id: 'a', body: 'editable' }]).values()],
  [{ id: 'a', body: 'frozen' }, { id: 'b', body: 'second' }]);
const test: SavedTest = { id: 'test-1', name: 'Private exam', config: { ...defaultTestConfig(), selectedIds: ['same-id'] }, classId: 'precalc-40s', unitId: null, testType: 'exam', createdAt: 1, updatedAt: 1 };
data.savedTests = [test];
const bankEntries = exportAppDataToRepoEntries(bankOnlyData(data));
assert.equal(importRepoEntriesToAppData(bankEntries).appData.savedTests.length, 0);
assert.equal(bankEntries.some(entry => String(entry.content).includes('Private exam')), false);
assert.equal(bankEntries.some(entry => entry.path.includes('private-unused')), false);
const snapshot = snapshotTest(test, data);
assert.notEqual(snapshot.images[0].name, 'graph');
assert.ok(snapshot.test.questionSnapshots![0].body.includes(snapshot.images[0].name));
data.questions[0].body = 'Original changed';
assert.ok(snapshot.test.questionSnapshots![0].body.includes('Bank A question'));
const independent = standaloneTestData(snapshot.test, snapshot.images, data.customClasses);
const restored = importRepoEntriesToAppData(exportAppDataToRepoEntries(independent)).appData;
assert.equal(restored.questions.length, 1);
assert.deepEqual(restored.savedTests[0].questionSnapshots, restored.questions);
assert.equal(restored.images!.length, 1);
assert.deepEqual(snapshotTest(snapshot.test, { ...data, images: snapshot.images }).test, snapshot.test);
assert.throws(() => snapshotTest({ ...test, config: { ...test.config, selectedIds: ['missing'] } }, data), /missing question/);
assert.throws(() => workspaceId('../gradebook'), /Unsafe/);
assert.throws(() => workspaceId('..'), /Unsafe/);
assert.deepEqual(mergeWorkspaceClasses([
  { id: 'precalc', name: 'Precalculus', units: [{ id: '1', name: 'Functions', sections: [{ id: '1.1', name: 'A' }] }] },
  { id: 'precalc', name: 'Precalculus', units: [{ id: '1', name: 'Functions', sections: [{ id: '1.2', name: 'B' }] }, { id: '2', name: 'Trig', sections: [] }] },
])[0].units.map(unit => [unit.id, unit.sections.length]), [['1', 2], ['2', 0]]);

// In-memory File System Access handles: no host files or user directories touched.
class Directory {
  kind = 'directory';
  children = new Map<string, Directory | MemoryFile>();
  name: string;
  constructor(name: string) { this.name = name; }
  async getDirectoryHandle(name: string, options: { create?: boolean } = {}) {
    let child = this.children.get(name);
    if (!child && options.create) { child = new Directory(name); this.children.set(name, child); }
    if (!child) throw new DOMException('Missing', 'NotFoundError');
    if (!(child instanceof Directory)) throw new DOMException('File', 'TypeMismatchError');
    return child;
  }
  async getFileHandle(name: string, options: { create?: boolean } = {}) {
    let child = this.children.get(name);
    if (!child && options.create) { child = new MemoryFile(name); this.children.set(name, child); }
    if (!child) throw new DOMException('Missing', 'NotFoundError');
    if (!(child instanceof MemoryFile)) throw new DOMException('Directory', 'TypeMismatchError');
    return child;
  }
  async removeEntry(name: string) { this.children.delete(name); }
  async *values() { yield* this.children.values(); }
}
class MemoryFile {
  kind = 'file';
  data: string | ArrayBuffer = '';
  name: string;
  constructor(name: string) { this.name = name; }
  async getFile() { return new File([this.data], this.name); }
  async createWritable() {
    return { write: async (data: string | ArrayBuffer) => { this.data = data; }, close: async () => {}, abort: async () => {} };
  }
}
const root = new Directory('bank-a');
const handle = root as unknown as FileSystemDirectoryHandle;
const first = await writeRepoFolder(handle, bankEntries, 'absent');
assert.equal(first, folderSignature(await readRepoFolder(handle)));
const progressEvents: Array<{ done: number; total: number; path: string }> = [];
await readRepoFolder(handle, (done, total, path) => progressEvents.push({ done, total, path }));
assert.equal(progressEvents[0].done, 0);
assert.equal(progressEvents.at(-1)!.done, bankEntries.length - 1);
assert.equal(progressEvents.at(-1)!.total, bankEntries.length - 1);
assert.ok(progressEvents.every((event, index) => event.done === index));
const note = await root.getFileHandle('teacher-notes.txt', { create: true });
note.data = 'Do not delete untracked files';
const external = exportAppDataToRepoEntries(bankOnlyData({ ...data, questions: [] }));
await writeRepoFolder(handle, external, first);
assert.equal((await root.getFileHandle('teacher-notes.txt')).data, 'Do not delete untracked files');
await assert.rejects(() => writeRepoFolder(handle, bankEntries, first), /changed outside/);
assert.equal(importRepoEntriesToAppData((await readRepoFolder(handle))!).appData.questions.length, 0);
const occupied = new Directory('occupied');
await occupied.getFileHandle('unrelated.txt', { create: true });
await assert.rejects(() => writeRepoFolder(occupied as unknown as FileSystemDirectoryHandle, bankEntries, 'absent'), /nonempty/);
assert.equal(testFolderPath(test), 'tests/precalc-40s/test-1');
assert.equal(testClassFolder(null), '_unclassified');
assert.throws(() => testClassFolder('../private'), /Unsafe/);
assert.throws(() => testClassFolder('CON'), /reserved/i);
const testsRoot = new Directory('tests');
const testsHandle = testsRoot as unknown as FileSystemDirectoryHandle;
const legacy = await testsRoot.getDirectoryHandle(test.id, { create: true });
const testEntries = exportAppDataToRepoEntries(independent);
await writeRepoFolder(legacy as unknown as FileSystemDirectoryHandle, testEntries, 'absent');
let saved = await readWorkspaceTests(testsHandle);
assert.equal(saved.tests.length, 1);
// Reading old layouts is non-mutating; saving copies into the class folder and archives the old location.
assert.equal(testsRoot.children.has('precalc-40s'), false);
assert.equal(await saveWorkspaceTest(testsHandle, snapshot.test, testEntries, saved), true);
assert.ok(legacy.children.has('deleted.json'));
saved = await readWorkspaceTests(testsHandle);
assert.equal(saved.tests.length, 1);
assert.ok(saved.deletedTests.has('tests/test-1'));
assert.ok(saved.signatures.has('tests/precalc-40s/test-1'));
assert.equal(await saveWorkspaceTest(testsHandle, snapshot.test, testEntries, saved), false);
// Class changes and moving back retain one active test and keep recoverable old copies.
const changed = { ...snapshot.test, classId: 'calculus', updatedAt: 2 };
const changedEntries = exportAppDataToRepoEntries(standaloneTestData(changed, snapshot.images, data.customClasses));
await saveWorkspaceTest(testsHandle, changed, changedEntries, saved);
saved = await readWorkspaceTests(testsHandle);
assert.equal(saved.tests[0].classId, 'calculus');
assert.ok(saved.deletedTests.has('tests/precalc-40s/test-1'));
await saveWorkspaceTest(testsHandle, snapshot.test, testEntries, saved);
saved = await readWorkspaceTests(testsHandle);
assert.equal(saved.tests.length, 1);
assert.equal(saved.tests[0].classId, 'precalc-40s');
assert.ok(saved.deletedTests.has('tests/calculus/test-1'));
// No-class tests have a dedicated folder, independent of every class's sharing.
const unclassified = { ...snapshot.test, id: 'test-no-class', classId: null };
await saveWorkspaceTest(testsHandle, unclassified, exportAppDataToRepoEntries(standaloneTestData(unclassified, snapshot.images, [])), saved);
assert.ok((await testsRoot.getDirectoryHandle('_unclassified')).children.has('test-no-class'));
saved = await readWorkspaceTests(testsHandle);
await archiveRemovedWorkspaceTests(testsHandle, [unclassified], saved);
assert.deepEqual((await readWorkspaceTests(testsHandle)).tests.map(test => test.id), ['test-no-class']);
// An external edit to the source must stop a class move before the destination is written.
const edited = { ...unclassified, name: 'Colleague edit' };
const noClassFolder = await (await testsRoot.getDirectoryHandle('_unclassified')).getDirectoryHandle(unclassified.id);
const externalEntries = exportAppDataToRepoEntries(standaloneTestData(edited, snapshot.images, []));
await writeRepoFolder(noClassFolder as unknown as FileSystemDirectoryHandle, externalEntries, saved.signatures.get(testFolderPath(unclassified))!);
const moved = { ...unclassified, classId: 'algebra' };
await assert.rejects(() => saveWorkspaceTest(testsHandle, moved, exportAppDataToRepoEntries(standaloneTestData(moved, snapshot.images, [])), saved), /changed outside/);
assert.equal(testsRoot.children.has('algebra'), false);
// A copied class folder is portable without any sibling folders.
const portableRoot = new Directory('tests');
const classFolder = await portableRoot.getDirectoryHandle('precalc-40s', { create: true });
await writeRepoFolder(await classFolder.getDirectoryHandle(test.id, { create: true }) as unknown as FileSystemDirectoryHandle, testEntries, 'absent');
assert.equal((await readWorkspaceTests(portableRoot as unknown as FileSystemDirectoryHandle)).tests[0].id, test.id);
// Duplicate IDs and misplaced class folders must be reported rather than silently merged.
await writeRepoFolder(await portableRoot.getDirectoryHandle(test.id, { create: true }) as unknown as FileSystemDirectoryHandle, testEntries, 'absent');
await assert.rejects(() => readWorkspaceTests(portableRoot as unknown as FileSystemDirectoryHandle), /Duplicate active test/);
const misplaced = new Directory('tests');
const wrongClass = await misplaced.getDirectoryHandle('wrong-class', { create: true });
await writeRepoFolder(await wrongClass.getDirectoryHandle(test.id, { create: true }) as unknown as FileSystemDirectoryHandle, testEntries, 'absent');
await assert.rejects(() => readWorkspaceTests(misplaced as unknown as FileSystemDirectoryHandle), /belongs in tests\/precalc-40s/);
const shortcuts = new Directory('tests');
await shortcuts.getFileHandle('precalc-40s.lnk', { create: true });
await assert.rejects(() => readWorkspaceTests(shortcuts as unknown as FileSystemDirectoryHandle), /does not follow .lnk/);
console.log('Workspace tests passed: data isolation, portable snapshots, class folders, flat-layout migration, class moves/back, deletion, unclassified tests, copied class folders, duplicate/misplaced tests, path safety, external conflicts, untracked files.');
