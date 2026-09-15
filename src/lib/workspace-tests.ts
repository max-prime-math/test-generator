import { importRepoEntriesToAppData, normalizeRepoPath, type RepoDataEntry, type RepoDataImage } from '../git/repoDataModel.ts';
import type { SavedTest } from './types.ts';
import { workspaceId } from './workspace-format.ts';
import { directories, folderSignature, readRepoFolder, readText, writeRepoFolder, writeText } from './folder-io.ts';

export function testClassFolder(classId: string | null): string {
  const name = classId ? workspaceId(classId) : '_unclassified';
  normalizeRepoPath(`tests/${name}/manifest.json`); // reject Windows reserved names too
  return name;
}

export function testFolderPath(test: Pick<SavedTest, 'id' | 'classId'>): string {
  return `tests/${testClassFolder(test.classId)}/${workspaceId(test.id)}`;
}

export interface WorkspaceTests {
  tests: SavedTest[];
  images: RepoDataImage[];
  signatures: Map<string, string>;
  deletedTests: Set<string>; // full paths, not IDs: class moves retain archived copies
}

export async function readWorkspaceTests(root: FileSystemDirectoryHandle, onProgress?: (folder: string, completed: number, total: number, path: string) => void): Promise<WorkspaceTests> {
  const result: WorkspaceTests = { tests: [], images: [], signatures: new Map(), deletedTests: new Set() };
  for await (const child of (root as FileSystemDirectoryHandle & { values(): AsyncIterable<FileSystemHandle> }).values()) {
    if (child.kind === 'file' && child.name.toLowerCase().endsWith('.lnk')) {
      throw new Error(`Found Windows shortcut ${child.name} in tests/. TestGen needs actual class directories and does not follow .lnk files. The shared-folder shortcut connection is not configured.`);
    }
  }
  const seen = new Map<string, string>();
  async function readTest(folder: FileSystemDirectoryHandle, entries: RepoDataEntry[], key: string, classFolder?: string) {
    result.signatures.set(key, folderSignature(entries));
    if (await readText(folder, 'deleted.json')) { result.deletedTests.add(key); return; }
    const data = importRepoEntriesToAppData(entries).appData;
    if (data.savedTests.length !== 1 || data.savedTests[0].id !== folder.name) throw new Error(`Invalid independent test folder ${key}.`);
    const test = data.savedTests[0];
    if (classFolder !== undefined && testClassFolder(test.classId) !== classFolder) {
      throw new Error(`Test “${test.name}” belongs in tests/${testClassFolder(test.classId)}/, not tests/${classFolder}/. Restore its folder location or change its class in TestGen.`);
    }
    if (seen.has(test.id)) throw new Error(`Duplicate active test ${test.id} in ${seen.get(test.id)} and ${key}. Resolve the duplicate before loading; neither copy was changed.`);
    if (test.config.selectedIds.some(id => !data.questions.some(q => q.id === id))) throw new Error(`Incomplete test snapshot ${key}.`);
    seen.set(test.id, key);
    result.tests.push({ ...test, questionSnapshots: data.questions, narrativeSnapshots: data.narratives ?? [] });
    result.images.push(...(data.images ?? []));
  }
  for (const parent of await directories(root)) {
    const flat = await readRepoFolder(parent, (done, total, path) => onProgress?.(`tests/${parent.name}`, done, total, path));
    if (flat) {
      workspaceId(parent.name);
      await readTest(parent, flat, `tests/${parent.name}`); // previous flat layout
      continue;
    }
    if (parent.name !== '_unclassified') workspaceId(parent.name);
    for (const folder of await directories(parent)) {
      workspaceId(folder.name);
      const entries = await readRepoFolder(folder, (done, total, path) => onProgress?.(`tests/${parent.name}/${folder.name}`, done, total, path));
      if (entries) await readTest(folder, entries, `tests/${parent.name}/${folder.name}`, parent.name);
    }
  }
  return result;
}

async function testDirectory(root: FileSystemDirectoryHandle, key: string, create = false): Promise<FileSystemDirectoryHandle> {
  const parts = normalizeRepoPath(key).split('/');
  if (parts[0] !== 'tests' || (parts.length !== 2 && parts.length !== 3)) throw new Error(`Invalid test directory ${key}.`);
  let folder = root;
  for (const part of parts.slice(1)) folder = await folder.getDirectoryHandle(part, { create });
  return folder;
}

async function checkUnchanged(root: FileSystemDirectoryHandle, key: string, expected: string): Promise<FileSystemDirectoryHandle> {
  const folder = await testDirectory(root, key);
  if (await readText(folder, 'deleted.json') || folderSignature(await readRepoFolder(folder)) !== expected) {
    throw new Error(`Test ${key} changed outside this tab. Reload before moving or deleting it.`);
  }
  return folder;
}

/** Copy-and-archive migration: never delete the only good copy or erase untracked files. */
export async function saveWorkspaceTest(
  root: FileSystemDirectoryHandle, test: SavedTest, entries: RepoDataEntry[], state: Pick<WorkspaceTests, 'signatures' | 'deletedTests'>,
): Promise<boolean> {
  const key = testFolderPath(test);
  const sources = [...state.signatures.keys()].filter(path => path.startsWith('tests/') && path.split('/').at(-1) === test.id && !state.deletedTests.has(path));
  if (sources.length > 1) throw new Error(`Duplicate active test ${test.id}; reload to resolve its locations.`);
  const source = sources[0];
  const moved = source !== undefined && source !== key;
  if (!moved && folderSignature(entries) === state.signatures.get(key) && !state.deletedTests.has(key)) return false;
  // Check the original BEFORE writing any replacement, including a class change.
  const oldFolder = moved ? await checkUnchanged(root, source, state.signatures.get(source)!) : null;
  const folder = await testDirectory(root, key, true);
  const tombstone = await readText(folder, 'deleted.json');
  if (tombstone && (!moved || !state.deletedTests.has(key) || JSON.parse(tombstone).reason !== 'moved')) {
    throw new Error(`Test ${key} is archived or was deleted outside this tab. Reload before saving.`);
  }
  state.signatures.set(key, await writeRepoFolder(folder, entries, state.signatures.get(key) ?? 'absent'));
  if (tombstone) await folder.removeEntry('deleted.json'); // revive only a known previous class-move copy
  state.deletedTests.delete(key);
  if (oldFolder) {
    // Recheck after copying, so external edits during the copy are not archived silently.
    await checkUnchanged(root, source!, state.signatures.get(source!)!);
    await writeText(oldFolder, 'deleted.json', JSON.stringify({ reason: 'moved', movedTo: key, deletedAt: new Date().toISOString() }));
    state.deletedTests.add(source!);
  }
  return true;
}

export async function archiveRemovedWorkspaceTests(
  root: FileSystemDirectoryHandle, tests: SavedTest[], state: Pick<WorkspaceTests, 'signatures' | 'deletedTests'>,
): Promise<void> {
  const active = new Set(tests.map(test => test.id));
  for (const key of state.signatures.keys()) {
    if (!key.startsWith('tests/') || state.deletedTests.has(key) || active.has(key.split('/').at(-1)!)) continue;
    const folder = await checkUnchanged(root, key, state.signatures.get(key)!);
    await writeText(folder, 'deleted.json', JSON.stringify({ reason: 'deleted', deletedAt: new Date().toISOString() }));
    state.deletedTests.add(key);
  }
}
