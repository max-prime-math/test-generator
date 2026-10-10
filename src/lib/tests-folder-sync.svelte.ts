// Keeps saved tests in step with the workspace folder's tests/, on their own schedule and
// independently of banks. See tests-sync-core.ts for the rules.
import {
  emptyTestsSyncState, syncTests, testHash, TEST_FILE, TEST_FILE_FORMAT,
  type FolderEntry, type LocalTests, type TestFile, type TestsIO, type TestsSyncState, type Tombstone,
} from './tests-sync-core';
import { testLibrary } from './test-library.svelte';
import { testEditor } from './test-editor.svelte';
import { explicitTestDeletions, clearTestDeletions } from './workspace-safety';
import { localWorkspace } from './local-workspace.svelte';
import { workspaceCatalog } from './workspace-catalog.svelte';
import { snapshotTest } from './workspace-format';
import { testFolderPath } from './workspace-tests';
import { readRepoFolder } from './folder-io';
import { importRepoEntriesToAppData, type RepoDataImage } from '../git/repoDataModel';
import { readBrowserAppData } from '../git/repoDataBridge';
import { imageStore } from './image-store.svelte';
import { appState } from './app-state.svelte';
import type { SavedTest } from './types';

const POLL_MS = 5_000;
const WRITE_DELAY_MS = 1_000;
const STATE_DB = 'test-generator-tests-sync';

type PermissionHandle = FileSystemDirectoryHandle & { queryPermission(options: { mode: 'readwrite' }): Promise<PermissionState> };

class TestsFolderSync {
  status = $state<'off' | 'syncing' | 'ready' | 'error'>('off');
  problems = $state<string[]>([]);
  lastSyncedAt = $state<number | null>(null);
  #root: FileSystemDirectoryHandle | null = null;
  #state: TestsSyncState = emptyTestsSyncState();
  #running: Promise<void> | null = null;
  #again = false;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #poll: ReturnType<typeof setInterval> | null = null;
  #adopt = false;
  #syncedRevision = -1;

  async connect(root: FileSystemDirectoryHandle | null): Promise<void> {
    if (root && this.#root && await root.isSameEntry(this.#root)) return;
    if (this.#root) await this.now().catch(() => undefined);
    this.#stop();
    this.#root = root;
    if (!root) { this.status = 'off'; return; }
    const saved = await loadState(root);
    this.#state = saved.state;
    this.#syncedRevision = -1; // the first pass against a folder is never skipped
    // This browser's tests belong to another workspace: show this folder's, and never copy the
    // other workspace's tests in — unless this browser just created this workspace, which receives
    // them. With no record of any folder (the first run after this update, or cleared site data),
    // this browser's tests and the folder's are combined.
    this.#adopt = saved.otherFolder && !await localWorkspace.createdHere(root);
    testLibrary.onChange = () => this.soon();
    this.#poll = setInterval(() => { if (document.visibilityState === 'visible') void this.now(); }, POLL_MS);
    await this.now();
  }

  soon(): void {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = setTimeout(() => { this.#timer = null; void this.now(); }, WRITE_DELAY_MS);
  }

  async now(): Promise<void> {
    if (!this.#root) return;
    if (this.#running) { this.#again = true; return this.#running; }
    this.#running = (async () => {
      do { this.#again = false; await this.#pass(); } while (this.#again && this.#root);
    })().finally(() => { this.#running = null; });
    return this.#running;
  }

  async #pass(): Promise<void> {
    const root = this.#root!;
    if (await (root as PermissionHandle).queryPermission({ mode: 'readwrite' }) !== 'granted') { this.status = 'off'; return; }
    this.status = 'syncing';
    try {
      const adopt = this.#adopt;
      const kept = new Set<string>();
      const local: LocalTests = {
        read: () => {
          this.#syncedRevision = testLibrary.revision;
          if (adopt) return { tests: [], deletions: new Set(), editing: new Set() };
          const editing = testEditor.editingTestId;
          return { tests: testLibrary.tests, deletions: explicitTestDeletions(), editing: new Set(editing ? [editing] : []) };
        },
        put: test => {
          kept.add(test.id);
          testLibrary.replaceWithRemote(test);
          testEditor.followLibrary(test.id);
        },
        remove: id => {
          const open = testEditor.testId === id;
          testLibrary.removeFromFolder(id);
          if (open && testEditor.closeRemoved(id)) appState.showNotice('The test you had open was deleted on another computer.', 10_000);
        },
        saved: test => {
          const current = testLibrary.get(test.id);
          if (current && test.questionSnapshots && testHash(current) === testHash(test)) {
            testLibrary.setContentSnapshot(test.id, test.questionSnapshots, test.narrativeSnapshots ?? [], current.config);
          }
        },
        settled: ids => clearTestDeletions(ids),
      };
      const result = await syncTests(testsIO(root), this.#state, local, { localUnchanged: !adopt && testLibrary.revision === this.#syncedRevision && !testEditor.editingTestId });
      if (this.#root !== root) return;
      if (adopt) {
        // Only this workspace's tests remain; the other workspace keeps its own in its folder.
        testLibrary.replaceAllFromFolder(testLibrary.tests.filter(test => kept.has(test.id)));
        if (testEditor.testId && !kept.has(testEditor.testId)) testEditor.closeRemoved(testEditor.testId);
        this.#adopt = false;
      }
      if (!result.skipped || adopt) {
        this.#state = result.state;
        await saveState(root, this.#state);
      }
      this.#syncedRevision = testLibrary.revision;
      for (const notice of result.notices) appState.showNotice(notice, 15_000);
      if (!result.skipped) this.problems = result.problems;
      this.status = this.problems.length ? 'error' : 'ready';
      this.lastSyncedAt = Date.now();
    } catch (error) {
      this.problems = [error instanceof Error ? error.message : String(error)];
      this.status = 'error';
    }
  }

  #stop(): void {
    if (this.#poll) clearInterval(this.#poll);
    if (this.#timer) clearTimeout(this.#timer);
    this.#poll = this.#timer = null;
    testLibrary.onChange = null;
    this.problems = [];
  }
}

/** tests/ through the File System Access API. */
function testsIO(root: FileSystemDirectoryHandle): TestsIO {
  const folderHandle = async (folder: string, create = false) => {
    let handle = root;
    for (const part of folder.split('/')) handle = await handle.getDirectoryHandle(part, { create });
    return handle;
  };
  const readFile = async (dir: FileSystemDirectoryHandle, name: string) => {
    try { return await (await (await dir.getFileHandle(name)).getFile()).text(); }
    catch (error) { if (error instanceof DOMException && error.name === 'NotFoundError') return null; throw error; }
  };
  const writeFile = async (dir: FileSystemDirectoryHandle, name: string, content: string | Uint8Array) => {
    const writable = await (await dir.getFileHandle(name, { create: true })).createWritable();
    await writable.write(content as FileSystemWriteChunkType);
    await writable.close();
  };
  const stampOf = async (handle: FileSystemFileHandle) => { const file = await handle.getFile(); return `${file.lastModified}:${file.size}`; };
  const entries = (dir: FileSystemDirectoryHandle) => (dir as unknown as AsyncIterable<[string, FileSystemHandle]>);

  /** Parse a test file, and make its images available to the app. */
  const loadTestFile = async (dir: FileSystemDirectoryHandle, text: string | null): Promise<SavedTest> => {
    const file = JSON.parse(text ?? '') as TestFile;
    if (file?.format !== TEST_FILE_FORMAT || file.version !== 1 || !file.test?.id) throw new Error('not a complete test file (still syncing?)');
    if (file.images.length) {
      const images = await dir.getDirectoryHandle('images').catch(() => null);
      for (const fileName of file.images) {
        const dot = fileName.lastIndexOf('.');
        const name = fileName.slice(0, dot), ext = fileName.slice(dot + 1);
        if (imageStore.has(name) || !images) continue;
        const handle = await images.getFileHandle(fileName).catch(() => null);
        if (handle) await imageStore.put(name, new Uint8Array(await (await handle.getFile()).arrayBuffer()), ext);
      }
    }
    return file.test;
  };
  const mount = async (images: RepoDataImage[]) => {
    for (const image of images) if (!imageStore.has(image.name)) await imageStore.put(image.name, image.bytes, image.ext);
  };

  return {
    async scan() {
      const out: FolderEntry[] = [];
      const tests = await root.getDirectoryHandle('tests').catch(() => null);
      if (!tests) return out;
      const describe = async (dir: FileSystemDirectoryHandle, folder: string, id: string) => {
        const entry: FolderEntry = { folder, id, stamp: null, deleted: null, extras: [] };
        for await (const [name, handle] of entries(dir)) {
          if (handle.kind !== 'file') continue;
          const fileHandle = handle as FileSystemFileHandle;
          if (name === TEST_FILE) entry.stamp = await stampOf(fileHandle);
          else if (name === 'deleted.json') { try { entry.deleted = JSON.parse(await (await fileHandle.getFile()).text()) as Tombstone; } catch { entry.deleted = { reason: 'deleted' }; } }
          else if (name === 'manifest.json') entry.extras.push({ source: 'legacy', stamp: await stampOf(fileHandle) });
          else if (/^test\b.*\.json/i.test(name)) entry.extras.push({ source: name, stamp: await stampOf(fileHandle) });
        }
        return entry;
      };
      for await (const [className, classHandle] of entries(tests)) {
        if (classHandle.kind !== 'directory') continue;
        const classDir = classHandle as FileSystemDirectoryHandle;
        // The earliest layout kept a test directly under tests/.
        if (await classDir.getFileHandle('manifest.json').then(() => true, () => false)) {
          out.push(await describe(classDir, `tests/${className}`, className));
          continue;
        }
        for await (const [id, testHandle] of entries(classDir)) {
          if (testHandle.kind === 'directory') out.push(await describe(testHandle as FileSystemDirectoryHandle, `tests/${className}/${id}`, id));
        }
      }
      return out;
    },
    async read(folder) {
      const dir = await folderHandle(folder);
      return loadTestFile(dir, await readFile(dir, TEST_FILE));
    },
    async readExtra(folder, source) {
      const dir = await folderHandle(folder);
      if (source !== 'legacy') return loadTestFile(dir, await readFile(dir, source));
      const repo = await readRepoFolder(dir);
      if (!repo) throw new Error('the old test layout is incomplete');
      const data = importRepoEntriesToAppData(repo).appData;
      const test = data.savedTests[0];
      if (!test) throw new Error('the old test layout has no test');
      await mount(data.images ?? []);
      return { ...test, questionSnapshots: data.questions, narrativeSnapshots: data.narratives ?? [] };
    },
    async write(folder, test) {
      // Freeze the questions, narratives and images the test uses, as it prints now.
      const data = await readBrowserAppData();
      // The test's own questions (generated, or edited for this test) come before the banks'.
      const all = { ...data, questions: [...(test.config.ownQuestions ?? []), ...data.questions, ...workspaceCatalog.questions], images: [...(data.images ?? []), ...workspaceCatalog.images] };
      const captured = snapshotTest($state.snapshot(test) as SavedTest, all);
      const dir = await folderHandle(folder, true);
      if (captured.images.length) {
        const images = await dir.getDirectoryHandle('images', { create: true });
        for (const image of captured.images) {
          const name = `${image.name}.${image.ext}`;
          if (!await images.getFileHandle(name).then(() => true, () => false)) await writeFile(images, name, image.bytes);
        }
        await mount(captured.images);
      }
      const file: TestFile = { format: TEST_FILE_FORMAT, version: 1, test: captured.test, images: captured.images.map(image => `${image.name}.${image.ext}`) };
      await writeFile(dir, TEST_FILE, `${JSON.stringify(file, null, 1)}\n`);
      // Writing a test lifts an earlier deletion or move of this folder.
      await dir.removeEntry('deleted.json').catch(() => undefined);
      return { stamp: await stampOf(await dir.getFileHandle(TEST_FILE)), test: captured.test };
    },
    async tombstone(folder, info) {
      const dir = await folderHandle(folder);
      const current = await readFile(dir, TEST_FILE);
      let hash: string | undefined;
      try { if (current) hash = testHash((JSON.parse(current) as TestFile).test); } catch { /* an unreadable test.json is covered as it stands */ }
      await writeFile(dir, 'deleted.json', JSON.stringify({ ...info, ...(hash ? { hash } : {}) }));
    },
    async readMerged(folder) {
      const dir = await folderHandle(folder);
      const out: string[] = [];
      for await (const [name, handle] of entries(dir)) {
        if (handle.kind !== 'file' || !name.startsWith('merged')) continue;
        try { out.push(...(JSON.parse(await (await (handle as FileSystemFileHandle).getFile()).text()) as string[])); } catch { /* half-synced */ }
      }
      return out;
    },
    async addMerged(folder, key) {
      const dir = await folderHandle(folder);
      let list: string[] = [];
      try { list = JSON.parse(await readFile(dir, 'merged.json') ?? '[]'); } catch { /* rewritten below */ }
      if (!list.includes(key)) await writeFile(dir, 'merged.json', JSON.stringify([...list, key]));
    },
    folderFor: test => testFolderPath(test),
  };
}

async function stateDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(STATE_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('state');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function loadState(root: FileSystemDirectoryHandle): Promise<{ state: TestsSyncState; otherFolder: boolean }> {
  try {
    const db = await stateDb();
    const saved = await new Promise<{ root: FileSystemDirectoryHandle; state: TestsSyncState } | undefined>((resolve, reject) => {
      const request = db.transaction('state').objectStore('state').get('current');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    if (!saved) return { state: emptyTestsSyncState(), otherFolder: false };
    return await saved.root.isSameEntry(root) ? { state: saved.state, otherFolder: false } : { state: emptyTestsSyncState(), otherFolder: true };
  } catch { return { state: emptyTestsSyncState(), otherFolder: false }; }
}
async function saveState(root: FileSystemDirectoryHandle, state: TestsSyncState): Promise<void> {
  const db = await stateDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('state', 'readwrite');
    tx.objectStore('state').put({ root, state }, 'current');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export const testsFolderSync = new TestsFolderSync();

if (typeof window !== 'undefined') {
  $effect.root(() => {
    $effect(() => {
      const root = localWorkspace.root;
      void testsFolderSync.connect(root);
    });
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void testsFolderSync.now(); });
  window.addEventListener('focus', () => void testsFolderSync.now());
  window.addEventListener('pagehide', () => void testsFolderSync.now());
}
