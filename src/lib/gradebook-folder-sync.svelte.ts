// Keeps the Gradebook in step with the workspace folder's gradebook/records/, on its own
// schedule and independently of banks and tests. See gradebook-records.ts for the rules.
import { emptySyncState, syncOnce, type FolderIO, type SyncState } from './gradebook-sync-core';
import { describeKey, isTombstone, sameEntry, type Conflict, type Entries } from './gradebook-records';
import { gradebook } from './gradebook.svelte';
import { localWorkspace } from './local-workspace.svelte';

/** How often an open, visible Gradebook checks the folder for the other computer's changes. */
const POLL_MS = 5_000;
/** How soon after an edit it is written to the folder. */
const WRITE_DELAY_MS = 800;
const STATE_DB = 'test-generator-gradebook-sync';

export interface ReviewItem {
  key: string;
  description: string;
  kept: string;
  other: string;
  keptEntry: Conflict['kept'];
  /** The other version, to put back if the teacher prefers it. */
  restore: () => void;
}

type PermissionHandle = FileSystemDirectoryHandle & { queryPermission(options: { mode: 'readwrite' }): Promise<PermissionState> };

class GradebookFolderSync {
  status = $state<'off' | 'syncing' | 'ready' | 'error'>('off');
  lastSyncedAt = $state<number | null>(null);
  problems = $state<string[]>([]);
  review = $state<ReviewItem[]>([]);
  #root: FileSystemDirectoryHandle | null = null;
  #state: SyncState = emptySyncState();
  #running: Promise<void> | null = null;
  #again = false;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #poll: ReturnType<typeof setInterval> | null = null;
  #adopt = false;

  /** Follow the workspace: start when a folder is connected, stop when it is not. */
  async connect(root: FileSystemDirectoryHandle | null): Promise<void> {
    if (root && this.#root && await root.isSameEntry(this.#root)) return;
    // Finish writing edits to the folder being left.
    if (this.#root) await this.now().catch(() => undefined);
    this.#stop();
    this.#root = root;
    if (!root) { this.status = 'off'; return; }
    const saved = await loadState(root);
    this.#state = saved.state;
    // This browser's Gradebook belongs to another workspace: show this folder's, and never copy
    // the other one in. With no record of any folder (first run after the move from
    // gradebook.json, or cleared site data), the browser's copy and the folder's are combined.
    this.#adopt = saved.otherFolder;
    gradebook.onChange = () => this.soon();
    this.#poll = setInterval(() => { if (document.visibilityState === 'visible') void this.now(); }, POLL_MS);
    await this.now();
  }

  /** Sync shortly, coalescing a burst of edits. */
  soon(): void {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = setTimeout(() => { this.#timer = null; void this.now(); }, WRITE_DELAY_MS);
  }

  /** Sync now; a request during a pass runs one more pass after it. */
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
      const io = folderIO(await root.getDirectoryHandle('gradebook', { create: true }));
      const before = JSON.stringify([this.#state.base.length, this.#state.absorbed.length, Object.keys(this.#state.seen).length]);
      const result = await syncOnce(io, this.#state, {
        read: () => gradebook.forSync(),
        apply: data => gradebook.applyFromFolder(data),
        settled: keys => gradebook.settleDeletions(keys),
      }, Date.now(), { adoptFolder: this.#adopt, localUnchanged: !gradebook.changedSinceSync });
      if (result.skipped) { this.status = this.problems.length ? 'error' : 'ready'; this.lastSyncedAt = Date.now(); return; }
      if (this.#root !== root) return; // the workspace changed during the pass
      if (this.#adopt) { this.#adopt = false; await saveState(root, result.state); }
      const changed = result.changedLocal || result.wrote.length > 0 || result.conflicts.length > 0
        || before !== JSON.stringify([result.state.base.length, result.state.absorbed.length, Object.keys(result.state.seen).length])
        || Object.entries(result.state.seen).some(([path, file]) => this.#state.seen[path]?.stamp !== file.stamp);
      this.#state = result.state;
      if (changed) await saveState(root, this.#state);
      const base = new Map(result.state.base);
      // One item per record; an item whose kept version has since changed (e.g. chosen on the
      // other computer) is no longer a choice to make.
      const items = [...this.review.filter(item => !result.conflicts.some(conflict => conflict.key === item.key)),
        ...result.conflicts.map(conflict => reviewItem(conflict, base))];
      this.review = items.filter(item => { const now = base.get(item.key); return !!now && sameEntry(now, item.keptEntry); });
      this.problems = result.problems;
      this.status = result.problems.length ? 'error' : 'ready';
      this.lastSyncedAt = Date.now();
    } catch (error) {
      this.problems = [error instanceof Error ? error.message : String(error)];
      this.status = 'error';
    }
  }

  dismiss(key: string): void { this.review = this.review.filter(item => item.key !== key); }

  #stop(): void {
    if (this.#poll) clearInterval(this.#poll);
    if (this.#timer) clearTimeout(this.#timer);
    this.#poll = this.#timer = null;
    gradebook.onChange = null;
    this.review = [];
    this.problems = [];
  }
}

function reviewItem(conflict: Conflict, entries: Entries): ReviewItem {
  const show = (entry: Conflict['kept']) => isTombstone(entry) ? 'deleted' : summarize(conflict.key, entry.value);
  return {
    key: conflict.key,
    description: describeKey(conflict.key, entries),
    kept: show(conflict.kept),
    other: show(conflict.other),
    keptEntry: conflict.kept,
    restore: () => {
      if (isTombstone(conflict.other)) return;
      const value: Record<string, unknown> = { ...conflict.other.value, updatedAt: Date.now() };
      const data = gradebook.forSync().data;
      const [kind] = conflict.key.split('/');
      const list = ({ score: 'scores', student: 'students', enrollment: 'enrollments', assessment: 'assessments', section: 'sections' } as const)[kind as 'score'];
      if (!list) return;
      const items = data[list] as unknown as Array<Record<string, unknown>>;
      const at = items.findIndex(item => kind === 'score' ? item.assessmentId === value.assessmentId && item.studentId === value.studentId
        : kind === 'enrollment' ? item.sectionId === value.sectionId && item.studentId === value.studentId : item.id === value.id);
      if (at >= 0) items[at] = value; else items.push(value);
      gradebook.useVersion(data);
    },
  };
}

/** "8 / 10", "Missing", or the changed record's name. */
function summarize(key: string, value: Record<string, unknown>): string {
  if (key.startsWith('score/')) {
    const state = String(value.state ?? 'normal');
    if (state === 'normal' || state === 'alternative') return value.points === null || value.points === undefined ? 'blank' : String(value.points);
    return state[0].toUpperCase() + state.slice(1);
  }
  return String(value.savedTestName ?? value.name ?? (value.firstName ? `${value.firstName} ${value.lastName}` : 'changed'));
}

/** The gradebook/ folder through the File System Access API. */
function folderIO(dir: FileSystemDirectoryHandle): FolderIO {
  const at = async (path: string, create: boolean) => {
    const parts = path.split('/');
    let current = dir;
    for (const part of parts.slice(0, -1)) current = await current.getDirectoryHandle(part, { create });
    return { parent: current, name: parts.at(-1)! };
  };
  return {
    async list() {
      const out: Array<{ path: string; stamp: string }> = [];
      const walk = async (folder: FileSystemDirectoryHandle, prefix: string) => {
        for await (const [name, handle] of (folder as unknown as AsyncIterable<[string, FileSystemHandle]>)) {
          const path = `${prefix}${name}`;
          if (handle.kind === 'directory') {
            if (path === 'records/superseded' || path === 'history') continue;
            if (prefix || name === 'records') await walk(handle as FileSystemDirectoryHandle, `${path}/`);
          } else if (prefix || name === 'gradebook.json') {
            const file = await (handle as FileSystemFileHandle).getFile();
            out.push({ path, stamp: `${file.lastModified}:${file.size}` });
          }
        }
      };
      await walk(dir, '');
      return out;
    },
    async read(path) {
      try { const { parent, name } = await at(path, false); return await (await (await parent.getFileHandle(name)).getFile()).text(); }
      catch (error) { if (error instanceof DOMException && error.name === 'NotFoundError') return null; throw error; }
    },
    async write(path, text) {
      const { parent, name } = await at(path, true);
      const writable = await (await parent.getFileHandle(name, { create: true })).createWritable();
      await writable.write(text);
      await writable.close();
    },
  };
}

// What this computer and the folder last agreed on, kept per workspace folder.
async function stateDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(STATE_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('state');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
/** The state saved for `root`; `otherFolder` when what is saved belongs to a different folder. */
async function loadState(root: FileSystemDirectoryHandle): Promise<{ state: SyncState; otherFolder: boolean }> {
  try {
    const db = await stateDb();
    const saved = await new Promise<{ root: FileSystemDirectoryHandle; state: SyncState } | undefined>((resolve, reject) => {
      const request = db.transaction('state').objectStore('state').get('current');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    if (!saved) return { state: emptySyncState(), otherFolder: false };
    return await saved.root.isSameEntry(root) ? { state: saved.state, otherFolder: false } : { state: emptySyncState(), otherFolder: true };
  } catch { return { state: emptySyncState(), otherFolder: false }; }
}
async function saveState(root: FileSystemDirectoryHandle, state: SyncState): Promise<void> {
  const db = await stateDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('state', 'readwrite');
    tx.objectStore('state').put({ root, state }, 'current');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export const gradebookFolderSync = new GradebookFolderSync();

// Follow the workspace connection, and catch up as soon as the tab is looked at again.
if (typeof window !== 'undefined') {
  $effect.root(() => {
    $effect(() => {
      const root = localWorkspace.root;
      void gradebookFolderSync.connect(root);
    });
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void gradebookFolderSync.now(); });
  window.addEventListener('focus', () => void gradebookFolderSync.now());
  window.addEventListener('pagehide', () => void gradebookFolderSync.now());
}
