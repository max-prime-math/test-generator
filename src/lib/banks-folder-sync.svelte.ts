// Keeps question banks in step with the workspace folder's banks/, record by record. Started and
// stopped by the workspace (local-workspace.svelte.ts) once its catalog is ready. See
// banks-sync-core.ts for the rules.
import { syncBanks, NAME_FILE, type BankIO, type BanksSyncState, type LocalBanks } from './banks-sync-core';
import { isTombstone, type Conflict } from './gradebook-records';
import { bankWorkspaces } from './bank-workspaces.svelte';
import { bankDeletions } from './bank-deletions';
import { bank } from './bank.svelte';
import { narratives } from './narratives.svelte';
import { customClasses } from './custom-classes.svelte';
import { imageStore } from './image-store.svelte';
import { workspaceCatalog } from './workspace-catalog.svelte';
import { bankOnlyData } from './workspace-format';
import { readBrowserAppData } from '../git/repoDataBridge';
import { browserImageRevision } from './browser-image-changes';
import { appState } from './app-state.svelte';
import type { RepoAppData, RepoDataImage } from '../git/repoDataModel';
import type { Question } from './types';

const STATE_DB = 'test-generator-banks-sync';
const POLL_MS = 3_000;
/** Every this many background checks, one bank is scanned in full (catching files that arrived without their manifest). */
const ROTATE_EVERY = 4;

export interface BankReviewItem {
  key: string;
  bankId: string;
  description: string;
  kept: string;
  other: string;
  /** Put the other version back, as an edit made here. Absent when there is nothing to restore. */
  restore?: () => Promise<void>;
}

type PermissionHandle = FileSystemDirectoryHandle & { queryPermission(options: { mode: 'readwrite' }): Promise<PermissionState> };

class BanksFolderSync {
  status = $state<'off' | 'syncing' | 'ready' | 'error'>('off');
  problems = $state<string[]>([]);
  review = $state<BankReviewItem[]>([]);
  blocked = $state<Array<{ bankId: string; before: number; after: number }>>([]);
  lastSyncedAt = $state<number | null>(null);
  /** When the folder last received changes from this browser. */
  lastWroteAt = $state<number | null>(null);
  #root: FileSystemDirectoryHandle | null = null;
  #state: BanksSyncState = {};
  #running: Promise<void> | null = null;
  #again = false;
  #poll: ReturnType<typeof setInterval> | null = null;
  #rotation = 0;
  #polls = 0;
  #rotate = false;
  #allowShrink = new Set<string>();
  #shownNotices = new Set<string>();
  #adopt = false;
  /** Called when the folder's permission is gone, so the workspace can ask for it again. */
  onPermissionLost: (() => void) | null = null;
  /** Banks to check in full on the next pass (a rotation covers every bank in turn). */
  #fullScan: string | null = null;

  /** Begin with the workspace. `adopt`: banks in the folder replace this browser's copies (another workspace's). */
  async start(root: FileSystemDirectoryHandle, options: { adopt?: boolean } = {}): Promise<void> {
    if (this.#root && await root.isSameEntry(this.#root)) return;
    this.stop();
    this.#root = root;
    const saved = await loadState(root);
    this.#state = saved.state;
    this.#adopt = options.adopt ?? false;
    this.#poll = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      this.#polls++;
      void this.now(this.#polls % ROTATE_EVERY === 0);
    }, POLL_MS);
    await this.now();
  }

  stop(): void {
    if (this.#poll) clearInterval(this.#poll);
    this.#poll = null;
    this.#root = null;
    this.status = 'off';
    this.review = [];
    this.blocked = [];
    this.problems = [];
  }

  /** Check every bank in full on the next pass. */
  async checkAll(): Promise<void> {
    if (!this.#root) return;
    for (const id of [...new Set([...Object.keys(this.#state), ...workspaceCatalog.banks.map(b => b.id)])]) {
      this.#fullScan = id;
      await this.now();
    }
  }

  /** Undo the removals that were blocked: the questions come back from the folder. */
  async keepQuestions(bankId: string): Promise<void> {
    bankDeletions.settle(bankId, [...bankDeletions.list(bankId).keys()]);
    await this.now();
  }

  async confirmShrink(bankId: string): Promise<void> {
    this.#allowShrink.add(bankId);
    try { await this.now(); } finally { this.#allowShrink.delete(bankId); }
  }

  /** Sync now. `rotate`: also scan the next bank in full (background checks only). */
  async now(rotate = false): Promise<void> {
    if (!this.#root) return;
    if (rotate) this.#rotate = true;
    if (this.#running) { this.#again = true; return this.#running; }
    this.#running = (async () => {
      do { this.#again = false; await this.#pass(); } while (this.#again && this.#root);
    })().finally(() => { this.#running = null; });
    return this.#running;
  }

  async #pass(): Promise<void> {
    const root = this.#root!;
    // A switch swaps the active bank's storage underneath; wait for it.
    if (bankWorkspaces.switching) return;
    if (await (root as PermissionHandle).queryPermission({ mode: 'readwrite' }) !== 'granted') { this.stop(); this.onPermissionLost?.(); return; }
    this.status = 'syncing';
    try {
      const ids = [...new Set([...Object.keys(this.#state), ...workspaceCatalog.banks.map(b => b.id)])];
      const fullScan = this.#fullScan ?? (this.#rotate && ids.length ? ids[this.#rotation++ % ids.length] : null);
      this.#fullScan = null;
      this.#rotate = false;
      const adopt = this.#adopt;
      const result = await syncBanks(bankIO(root), localBanks(adopt), this.#state, { fullScan, allowShrink: this.#allowShrink });
      if (this.#root !== root) return;
      this.#adopt = false;
      this.#state = result.state;
      await saveState(root, this.#state);
      // Edits made here that just reached the folder also update the cross-bank catalog (search, Build).
      const wroteBanks = new Set(result.wrote.map(path => path.split('/')[0]).filter(id => !result.applied.includes(id)));
      for (const id of wroteBanks) {
        const mine = await localBanks(false).read(id).catch(() => null);
        if (mine) await mountImages(await workspaceCatalog.updateBank({ id, name: mine.name, data: mine.data }));
      }
      for (const notice of result.notices) {
        if (this.#shownNotices.has(notice)) continue;
        this.#shownNotices.add(notice);
        appState.showNotice(notice, 15_000);
      }
      if (result.conflicts.length) {
        const fresh = await Promise.all(result.conflicts.map(conflict => reviewItem(conflict)));
        this.review = [...this.review.filter(item => !fresh.some(f => f.key === item.key && f.bankId === item.bankId)), ...fresh];
      }
      this.blocked = result.blocked;
      this.problems = result.problems;
      this.status = result.problems.length ? 'error' : 'ready';
      this.lastSyncedAt = Date.now();
      if (result.wrote.length) this.lastWroteAt = this.lastSyncedAt;
    } catch (error) {
      this.problems = [error instanceof Error ? error.message : String(error)];
      this.status = 'error';
    }
  }

  dismiss(item: BankReviewItem): void { this.review = this.review.filter(other => other !== item); }
}

/** This browser's banks, as the sync core sees them. */
function localBanks(adopt: boolean): LocalBanks {
  return {
    ids: () => adopt ? [] : workspaceCatalog.banks.map(b => b.id),
    hasDeletions: id => bankDeletions.list(id).size > 0,
    signature: id => {
      const entry = bankWorkspaces.banks.find(b => b.id === id);
      if (id !== bankWorkspaces.activeBankId) return `${entry?.updatedAt ?? 0}|${entry?.name ?? ''}`;
      const raw = ['math-test-bank-v2', 'tg-narratives-v1', 'math-test-custom-classes-v1'].map(key => localStorage.getItem(key) ?? '').join('\u0000');
      return `${fnv(raw)}|${raw.length}|${browserImageRevision()}|${entry?.name ?? ''}`;
    },
    read: async id => {
      const entry = bankWorkspaces.banks.find(b => b.id === id);
      if (!entry) return null;
      const data = id === bankWorkspaces.activeBankId ? await activeBankData() : await bankWorkspaces.readBankSnapshot(id);
      if (!data) return null;
      return { name: entry.name, data: bankOnlyData(data), deletions: bankDeletions.list(id) };
    },
    apply: async (id, name, data) => {
      if (!bankWorkspaces.banks.some(b => b.id === id)) await bankWorkspaces.registerNewFolderBanks([{ id, name, data }]);
      else if (id === bankWorkspaces.activeBankId) await applyActiveBank(name, data);
      else await bankWorkspaces.applyDormantBank(id, name, data);
      await mountImages(await workspaceCatalog.updateBank({ id, name, data }));
    },
    settled: (id, paths) => bankDeletions.settle(id, paths),
  };
}

/** The active bank's data, reusing its images while they are unchanged (so they are not re-read and re-hashed). */
let imageCache: { revision: string; images: RepoDataImage[] } | null = null;
async function activeBankData(): Promise<RepoAppData> {
  const revision = String(browserImageRevision());
  const data = await readBrowserAppData({ images: imageCache?.revision !== revision });
  if (imageCache?.revision !== revision) imageCache = { revision, images: data.images ?? [] };
  return { ...data, images: imageCache.images };
}

async function applyActiveBank(name: string, data: RepoAppData): Promise<void> {
  localStorage.setItem('math-test-bank-v2', JSON.stringify(data.questions));
  localStorage.setItem('tg-narratives-v1', JSON.stringify(data.narratives ?? []));
  localStorage.setItem('math-test-custom-classes-v1', JSON.stringify(data.customClasses));
  await mountImages(data.images ?? []);
  bank.reloadFromStorage();
  narratives.reloadFromStorage();
  customClasses.reloadFromStorage();
  bankWorkspaces.setActiveBankNameFromFolder(name);
}

async function mountImages(images: RepoDataImage[]): Promise<void> {
  for (const image of images) if (!imageStore.has(image.name)) await imageStore.put(image.name, image.bytes, image.ext);
}

async function reviewItem(conflict: Conflict & { bankId: string }): Promise<BankReviewItem> {
  const parse = (entry: Conflict['kept']) => {
    if (isTombstone(entry)) return null;
    try { return JSON.parse((entry.value as { text?: string }).text ?? 'null') as { question?: Question; narrative?: { title?: string } } | null; } catch { return null; }
  };
  const kept = parse(conflict.kept), other = parse(conflict.other);
  const bankName = bankWorkspaces.banks.find(b => b.id === conflict.bankId)?.name ?? conflict.bankId;
  const preview = (text: string | undefined) => (text ?? '').replace(/\s+/g, ' ').trim().slice(0, 60) || '(empty)';
  if (conflict.key.startsWith('questions/') && other?.question) {
    const question = other.question;
    return {
      key: conflict.key, bankId: conflict.bankId,
      description: `A question in “${bankName}”`,
      kept: preview(kept?.question?.body), other: preview(question.body),
      restore: async () => {
        const { id, createdAt: _created, ...rest } = question;
        void _created;
        if (conflict.bankId === bankWorkspaces.activeBankId) bank.update(id, rest);
        else await bankWorkspaces.updateDormantQuestion(conflict.bankId, id, () => rest);
      },
    };
  }
  const what = conflict.key === NAME_FILE ? 'The bank name' : conflict.key.startsWith('narratives/') ? 'A narrative' : conflict.key.startsWith('images/') ? `The image ${conflict.key.slice(7)}` : 'The class list';
  return { key: conflict.key, bankId: conflict.bankId, description: `${what} in “${bankName}”`, kept: 'the newer edit', other: 'an older edit' };
}

/** banks/ through the File System Access API. */
function bankIO(root: FileSystemDirectoryHandle): BankIO {
  const entries = (dir: FileSystemDirectoryHandle) => (dir as unknown as AsyncIterable<[string, FileSystemHandle]>);
  const banksDir = (create = false) => root.getDirectoryHandle('banks', { create });
  const bankDir = async (id: string, create = false) => (await banksDir(create)).getDirectoryHandle(id, { create });
  const at = async (id: string, path: string, create: boolean) => {
    let dir = await bankDir(id, create);
    const parts = path.split('/');
    for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part, { create });
    return { dir, name: parts.at(-1)! };
  };
  const stamp = async (handle: FileSystemFileHandle) => { const file = await handle.getFile(); return `${file.lastModified}:${file.size}`; };
  return {
    async bankIds() {
      const dir = await banksDir().catch(() => null);
      const out: string[] = [];
      if (dir) for await (const [name, handle] of entries(dir)) if (handle.kind === 'directory') out.push(name);
      return out;
    },
    async quick(id) {
      const dir = await bankDir(id).catch(() => null);
      if (!dir) return '';
      const parts: string[] = [];
      for await (const [name, handle] of entries(dir)) {
        if (handle.kind === 'file' && /^(manifest|bank-name|deleted)/.test(name)) parts.push(`${name}@${await stamp(handle as FileSystemFileHandle)}`);
      }
      return parts.sort().join('|');
    },
    async list(id) {
      const out: Array<{ path: string; stamp: string }> = [];
      const walk = async (dir: FileSystemDirectoryHandle, prefix: string) => {
        for await (const [name, handle] of entries(dir)) {
          if (handle.kind === 'directory') await walk(handle as FileSystemDirectoryHandle, `${prefix}${name}/`);
          else out.push({ path: `${prefix}${name}`, stamp: await stamp(handle as FileSystemFileHandle) });
        }
      };
      const dir = await bankDir(id).catch(() => null);
      if (dir) await walk(dir, '');
      return out;
    },
    async stamp(id, path) {
      try { const { dir, name } = await at(id, path, false); return await stamp(await dir.getFileHandle(name)); }
      catch (error) { if (error instanceof DOMException && error.name === 'NotFoundError') return null; throw error; }
    },
    async read(id, path) {
      try {
        const { dir, name } = await at(id, path, false);
        const file = await (await dir.getFileHandle(name)).getFile();
        return /\.(json|md)$/.test(name) || /\.json/.test(name) ? await file.text() : new Uint8Array(await file.arrayBuffer());
      } catch (error) {
        if (error instanceof DOMException && error.name === 'NotFoundError') return null;
        throw error;
      }
    },
    async write(id, path, content) {
      const { dir, name } = await at(id, path, true);
      const writable = await (await dir.getFileHandle(name, { create: true })).createWritable();
      await writable.write(content as FileSystemWriteChunkType);
      await writable.close();
    },
    async remove(id, path) {
      const { dir, name } = await at(id, path, false);
      await dir.removeEntry(name);
    },
  };
}

function fnv(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return hash.toString(16);
}

async function stateDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(STATE_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('state');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function loadState(root: FileSystemDirectoryHandle): Promise<{ state: BanksSyncState; otherFolder: boolean }> {
  try {
    const db = await stateDb();
    const saved = await new Promise<{ root: FileSystemDirectoryHandle; state: BanksSyncState } | undefined>((resolve, reject) => {
      const request = db.transaction('state').objectStore('state').get('current');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    if (!saved) return { state: {}, otherFolder: false };
    return await saved.root.isSameEntry(root) ? { state: saved.state, otherFolder: false } : { state: {}, otherFolder: true };
  } catch { return { state: {}, otherFolder: false }; }
}
async function saveState(root: FileSystemDirectoryHandle, state: BanksSyncState): Promise<void> {
  const db = await stateDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('state', 'readwrite');
    tx.objectStore('state').put({ root, state }, 'current');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

/** Whether a sync history exists for another folder (switching workspaces). */
export async function syncedWithOtherFolder(root: FileSystemDirectoryHandle): Promise<boolean> {
  return (await loadState(root)).otherFolder;
}

export const banksFolderSync = new BanksFolderSync();
