// The connected workspace folder: choosing it, permission, the cross-bank catalog, and starting
// the syncs that keep its contents in step with this browser. Banks, saved tests and the
// Gradebook each merge record by record with the folder on their own
// (banks-folder-sync, tests-folder-sync, gradebook-folder-sync); nothing here replaces
// browser data wholesale, and nothing waits for review.
import { bankWorkspaces } from './bank-workspaces.svelte';
import { readBrowserAppData } from '../git/repoDataBridge';
import { importRepoEntriesToAppData, type RepoDataImage } from '../git/repoDataModel';
import { bankOnlyData, workspaceId, WORKSPACE_MODE_KEY } from './workspace-format';
import { childDirectory, directories, readRepoFolder, readText } from './folder-io';
import { imageStore } from './image-store.svelte';
import { workspaceCatalog, type FolderBank } from './workspace-catalog.svelte';
import { yieldWorkspaceProgress, type WorkspaceProgress } from './workspace-progress';
import { readWorkspaceCache, writeWorkspaceCache, type WorkspaceCache } from './workspace-cache';
import { banksFolderSync } from './banks-folder-sync.svelte';

type Status = 'disconnected' | 'permission-needed' | 'paused' | 'loading' | 'review-needed' | 'ready' | 'saving' | 'error';
/** What stopping a load means: keep the folder unloaded, or just abandon this one read. */
type StopMode = 'pause' | 'cancel';
type PermissionHandle = FileSystemDirectoryHandle & { queryPermission(o: { mode: 'readwrite' }): Promise<PermissionState>; requestPermission(o: { mode: 'readwrite' }): Promise<PermissionState> };
type PickerWindow = Window & { showDirectoryPicker?: (o: { id: string; mode: 'readwrite' }) => Promise<FileSystemDirectoryHandle> };
const HANDLE_ID = 'workspace-root';
/** Survives relaunches so a workspace that cannot open never blocks the app again. */
const LOAD_PAUSED_KEY = 'tg-workspace-load-paused-v1';
/** Page reloads a load has requested recently, to catch a load that never settles. */
const REOPEN_LOG_KEY = 'tg-workspace-reopens-v1';
const REOPEN_WINDOW_MS = 120_000;
const REOPEN_LIMIT = 3;

/** Thrown from a progress checkpoint after the person chose to stop loading. */
class LoadStopped extends Error {}

function describeError(error: unknown): string {
  return error instanceof Error && error.message ? error.message : String(error);
}

class LocalWorkspace {
  #status = $state<Status>('disconnected');
  folderName = $state<string | null>(null);
  #error = $state<string | null>(null);
  loadingProgress = $state<WorkspaceProgress | null>(null);
  lastLoadedAt = $state<number | null>(null);
  /** True while the current load is still only reading, so stopping loses nothing. */
  canStop = $state(false);
  backgroundLoading = $state(false);
  /** Kept for the interface: nothing waits for review any more. */
  changedFolders = $state<string[]>([]);
  #stopMode: StopMode | null = null;
  #stopRequested = false;
  #root = $state.raw<FileSystemDirectoryHandle | null>(null);
  #initialized = false;
  #navigationPending = false;
  #createdHere: FileSystemDirectoryHandle | null = null;

  /** While ready, the banks sync's own state shows through (saving, problems). */
  get status(): Status {
    if (this.#status !== 'ready') return this.#status;
    return banksFolderSync.status === 'syncing' ? 'saving' : 'ready';
  }
  set status(value: Status) { this.#status = value; }
  get error(): string | null {
    const messages = [
      ...this.blockedShrinks.map(entry => `${entry.name}: Not saved: this would remove ${entry.before - entry.after} of ${entry.before} questions from its folder. Confirm the removal, or undo it.`),
      ...banksFolderSync.problems,
    ];
    return this.#error ?? (messages.length ? messages.join(' · ') : null);
  }
  set error(value: string | null) { this.#error = value; }
  /** Bank saves refused because they would remove most of the bank's questions at once. */
  get blockedShrinks(): Array<{ bankId: string; name: string; before: number; after: number }> {
    return banksFolderSync.blocked.map(entry => ({ ...entry, name: bankWorkspaces.banks.find(bank => bank.id === entry.bankId)?.name ?? entry.bankId }));
  }
  get lastSavedAt(): number | null { return banksFolderSync.lastWroteAt; }

  get busy(): boolean { return this.loadingProgress !== null; }
  get blocking(): boolean { return this.busy && !this.backgroundLoading; }
  get connected(): boolean { return this.#root !== null; }
  /** The workspace root, for the Gradebook's and saved tests' own folder sync. */
  get root(): FileSystemDirectoryHandle | null { return this.#root; }
  /** Whether `root` is a new workspace created from this browser, which receives its tests and Gradebook. */
  async createdHere(root: FileSystemDirectoryHandle): Promise<boolean> {
    return !!this.#createdHere && await this.#createdHere.isSameEntry(root);
  }
  get supported(): boolean { return typeof window !== 'undefined' && typeof (window as PickerWindow).showDirectoryPicker === 'function'; }
  get activeBankIncluded(): boolean { return workspaceCatalog.banks.some(bank => bank.id === bankWorkspaces.activeBankId); }

  async initialize(): Promise<void> {
    if (this.#initialized || !this.supported) return;
    this.#initialized = true;
    try {
      this.#root = await storedHandle();
      if (!this.#root) return;
      this.folderName = this.#root.name;
      await this.#restoreCache();
      if (await (this.#root as PermissionHandle).queryPermission({ mode: 'readwrite' }) !== 'granted') {
        this.status = 'permission-needed'; return;
      }
      if (loadPaused()) { this.status = 'paused'; return; }
      await this.#open();
    } catch (error) { this.#fail(error); }
  }

  /** Load a workspace whose loading was stopped earlier. */
  async resumeLoading(): Promise<void> {
    if (!this.#root || this.busy) return;
    if (await (this.#root as PermissionHandle).queryPermission({ mode: 'readwrite' }) !== 'granted'
      && await (this.#root as PermissionHandle).requestPermission({ mode: 'readwrite' }) !== 'granted') return;
    setLoadPaused(false);
    this.error = null;
    await this.#open();
  }

  /** Stop a load that is still reading. Browser data is left exactly as it was. */
  stopLoading(): void {
    if (!this.canStop || this.#stopRequested) return;
    this.#stopRequested = true;
    if (this.loadingProgress) this.loadingProgress = { ...this.loadingProgress, phase: 'Stopping…', detail: 'Finishing the current file' };
  }

  /**
   * Open the workspace: the catalog comes from the cache, or is rebuilt from this browser's copies
   * of the folder's banks; then the banks sync merges whatever changed in the folder meanwhile.
   */
  async #open(): Promise<void> {
    this.backgroundLoading = true;
    this.changedFolders = [];
    try {
      await this.#runLoading('Checking workspace in background', async () => {
        const cache = await this.#restoreCache();
        if (!cache) await this.#catalogFromBrowser();
        await this.#loadImages(workspaceCatalog.images);
        // The first check of the folder is part of the (stoppable) background load.
        this.#progress('Checking workspace banks', this.#root!.name);
        await this.#startSync(this.#root!);
        this.#progress('Checking workspace banks', 'Done');
        this.status = 'ready';
        this.error = null;
        this.lastLoadedAt = Date.now();
      }, 'pause');
    } finally { this.backgroundLoading = false; }
  }

  /** The catalog from this browser's copies of the banks in the folder (banks it lacks arrive through the sync). */
  async #catalogFromBrowser(): Promise<void> {
    this.#progress('Checking workspace banks', this.#root!.name);
    const banksDir = await childDirectory(this.#root!, 'banks');
    const ids = new Set((banksDir ? await directories(banksDir) : []).map(dir => dir.name));
    const live = await readBrowserAppData();
    const banks: FolderBank[] = [];
    for (const entry of bankWorkspaces.banks) {
      if (!ids.has(entry.id)) continue;
      const data = entry.id === bankWorkspaces.activeBankId ? bankOnlyData(live) : await bankWorkspaces.readBankSnapshot(entry.id);
      if (data) banks.push({ id: entry.id, name: entry.name, data: bankOnlyData(data) });
    }
    await this.#buildCatalog(banks);
  }

  async #startSync(root: FileSystemDirectoryHandle, options: { adopt?: boolean } = {}): Promise<void> {
    await banksFolderSync.start(root, options);
    await this.#cacheCurrent();
  }

  #cache: WorkspaceCache | null = null;
  async #restoreCache(): Promise<WorkspaceCache | null> {
    if (!this.#root) return null;
    if (this.#cache) return this.#cache;
    try {
      const cache = await readWorkspaceCache(this.#root);
      if (cache) { workspaceCatalog.restore(cache.catalog); this.#cache = cache; }
      return cache;
    } catch { return null; } // disposable cache; fall back to browser bank snapshots
  }

  async #cacheCurrent(): Promise<void> {
    if (!this.#root) return;
    try {
      const cache: WorkspaceCache = { version: 2, root: this.#root, testImages: [], signatures: [], deletedTests: [], catalog: workspaceCatalog.snapshot() };
      await writeWorkspaceCache(cache);
      this.#cache = cache;
    } catch { /* Browser bank data is authoritative; a cache failure only costs a rebuild. */ }
  }

  async chooseFolder(): Promise<void> {
    if (this.busy) return;
    try {
      const picker = (window as PickerWindow).showDirectoryPicker;
      if (!picker) throw new Error('Workspace folders require a browser with directory access.');
      const root = await picker({ id: 'test-generator-workspace', mode: 'readwrite' });
      if (this.#root && await root.isSameEntry(this.#root)) return;
      await this.saveNow();
      await this.#runLoading('Reading selected folder', async () => {
        // A workspace upgraded from the legacy layout can retain the old bank
        // files at its root. The explicit banks/ directory is the stronger
        // signal; root-level bank files are left untouched and ignored.
        const bankRoot = await childDirectory(root, 'banks');
        if (await readText(root, 'manifest.json') && !bankRoot) throw new Error('This is a single-bank folder. Use “Connect legacy bank”, or select a separate workspace root and copy banks into its banks/ folder.');
        // Check every bank folder reads, before anything in this browser changes.
        const bankFolders = bankRoot ? await directories(bankRoot) : [];
        for (const [index, folder] of bankFolders.entries()) {
          workspaceId(folder.name);
          const label = `Checking bank ${index + 1} of ${bankFolders.length}`;
          this.#progress(label, folder.name);
          const entries = await readRepoFolder(folder, (done, total, path) => this.#progress(label, `${folder.name} / ${path}`, done, total, 'files'));
          if (entries && importRepoEntriesToAppData(entries).appData.savedTests.length) {
            throw new Error(`Bank ${folder.name} contains bundled tests. Import it as a legacy bank first; workspace banks must be independent.`);
          }
        }
        // Tests alone (e.g. a class folder shared by a colleague) also make it an existing workspace,
        // so no bank is written into it.
        const tests = await childDirectory(root, 'tests');
        const hasData = bankFolders.length > 0 || (tests !== null && (await directories(tests)).length > 0);
        const message = hasData
          ? `Load workspace “${root.name}”? Its banks replace this browser's copies of banks with the same names (each bank's copy here is kept as a backup). Its saved tests and Gradebook are combined with this browser's.`
          : `Create banks/, tests/, and gradebook/ in “${root.name}”? This saves the ACTIVE bank, saved tests, and private student/grade data there. Only continue if this root is private. Share individual child folders outside TestGen, not the root.`;
        if (!window.confirm(message)) return;
        this.#createdHere = hasData ? null : root;
        this.#beginWrites();
        setLoadPaused(false);
        banksFolderSync.stop();
        this.#root = root;
        this.#cache = null;
        this.folderName = root.name;
        this.error = null;
        await storedHandle(root);
        localStorage.setItem(WORKSPACE_MODE_KEY, '1');
        if (hasData) {
          // Another workspace's banks: take the folder's as they are, then reopen with them.
          await bankWorkspaces.saveActiveSnapshot();
          workspaceCatalog.clear();
          this.#progress('Loading banks', root.name);
          await this.#startSync(root, { adopt: true });
          // Work in one of the workspace's banks, as before.
          const first = bankFolders.map(folder => folder.name).find(id => workspaceCatalog.banks.some(bank => bank.id === id));
          if (first && !this.activeBankIncluded) {
            banksFolderSync.stop();
            await bankWorkspaces.switchBank(first);
          }
          await this.#reopen();
          return;
        }
        const data = await readBrowserAppData();
        await this.#buildCatalog([{ id: bankWorkspaces.activeBankId, name: bankWorkspaces.activeBank.name, data: bankOnlyData(data) }]);
        this.status = 'ready';
        this.#progress('Creating workspace folders', 'Saving the initial bank, tests, and gradebook');
        await this.#startSync(root);
      }, 'cancel');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      this.#fail(error); throw error;
    }
  }

  async grantPermission(): Promise<void> {
    if (!this.#root || this.busy) return;
    if (await (this.#root as PermissionHandle).requestPermission({ mode: 'readwrite' }) !== 'granted') return;
    if (loadPaused()) { this.status = 'paused'; return; }
    await this.#open();
  }

  async addActiveBank(): Promise<void> {
    if (!this.#root || this.activeBankIncluded || this.busy) return;
    if (!window.confirm(`Save “${bankWorkspaces.activeBank.name}” as another bank in this workspace? No tests or gradebook records go into banks/.`)) return;
    await this.#runLoading('Adding bank to workspace', async () => {
      const data = bankOnlyData(await readBrowserAppData());
      await this.#buildCatalog([...workspaceCatalog.banks, { id: bankWorkspaces.activeBankId, name: bankWorkspaces.activeBank.name, data }]);
      this.status = 'ready';
      this.#progress('Saving added bank', bankWorkspaces.activeBank.name);
    });
    await this.saveNow();
  }

  /**
   * Check every bank against the folder now, merging anything that changed. Nothing in this
   * browser is replaced. Banks whose folders were removed leave the bank switcher (their copies
   * stay in this browser's storage).
   */
  async reload(): Promise<void> {
    if (!this.#root || this.busy) return;
    await banksFolderSync.checkAll();
    const banksDir = await childDirectory(this.#root, 'banks');
    const present = new Set((banksDir ? await directories(banksDir) : []).map(dir => dir.name));
    const gone = workspaceCatalog.banks.map(bank => bank.id).filter(id => !present.has(id));
    if (gone.length) {
      bankWorkspaces.forgetBanks(gone);
      await this.#catalogFromBrowser();
    }
    await this.#cacheCurrent();
  }

  async disconnect(): Promise<void> {
    if (this.busy) return;
    await banksFolderSync.now();
    banksFolderSync.stop();
    await storedHandle(null);
    setLoadPaused(false);
    this.#root = null;
    this.#cache = null;
    this.folderName = null;
    this.error = null;
    this.status = 'disconnected';
    // Keep workspace-wide browser data independent until explicitly choosing a legacy bank.
    // Removing the mode flag here would make the next bank switch replace private data.
    workspaceCatalog.clear();
  }

  /** Bring the folder and this browser into step now. */
  async saveNow(): Promise<void> {
    if (this.#status !== 'ready') return;
    await banksFolderSync.now();
    await this.#cacheCurrent();
  }

  /** Remove a bank's questions from the folder although most of the bank goes with them. */
  async confirmShrink(bankId: string): Promise<void> {
    await banksFolderSync.confirmShrink(bankId);
  }

  /** Settles once a folder sync already running has finished. */
  idle(): Promise<void> { return banksFolderSync.now(); }

  #progress(phase: string, detail = '', completed = 0, total: number | null = null, unit = ''): void {
    // Progress reports double as checkpoints: reading a folder reports every
    // file, so a stop request takes effect within one file.
    if (this.#stopRequested && this.canStop) throw new LoadStopped();
    if (this.loadingProgress) this.loadingProgress = { phase, detail, completed, total, unit };
  }

  /** Browser data is about to change, so the load can no longer stop cleanly. */
  #beginWrites(): void {
    if (this.#stopRequested && this.canStop) throw new LoadStopped();
    this.canStop = false;
  }

  async #buildCatalog(banks: FolderBank[]): Promise<void> {
    this.#progress('Indexing questions', 'Building the cross-bank search index');
    await yieldWorkspaceProgress();
    await workspaceCatalog.replace(banks, (done, total, name) => this.#progress('Indexing questions', name, done, total, 'questions'));
  }

  async #loadImages(images: RepoDataImage[]): Promise<void> {
    await imageStore.init();
    const unique = [...new Map(images.map(image => [image.name, image])).values()];
    this.#progress('Loading diagrams and images', '', 0, unique.length, 'images');
    await yieldWorkspaceProgress();
    for (const [index, image] of unique.entries()) {
      if (!image.name.startsWith('testasset-') || !imageStore.has(image.name)) await imageStore.put(image.name, image.bytes, image.ext);
      this.#progress('Loading diagrams and images', `${image.name}.${image.ext}`, index + 1, unique.length, 'images');
    }
  }

  async #runLoading(phase: string, action: () => Promise<void>, stopMode: StopMode | null = null): Promise<void> {
    if (this.busy) return;
    this.loadingProgress = { phase, detail: 'Finishing any pending save', completed: 0, total: null, unit: '' };
    this.#stopMode = stopMode;
    this.#stopRequested = false;
    this.canStop = stopMode !== null;
    await yieldWorkspaceProgress();
    const previousStatus = this.#status;
    this.status = 'loading';
    this.#navigationPending = false;
    try {
      await action();
      if (!this.#navigationPending) clearReopens();
      if (this.#status === 'loading' && !this.#navigationPending) this.status = previousStatus;
    } catch (error) {
      if (!(error instanceof LoadStopped)) { this.#fail(error); throw error; }
      this.#navigationPending = false;
      if (this.#stopMode === 'pause') {
        // Stay connected but unloaded, across relaunches, until asked to load.
        banksFolderSync.stop();
        setLoadPaused(true);
        this.status = 'paused';
        if (error.message) this.error = error.message;
      } else {
        this.status = previousStatus;
      }
    } finally {
      this.canStop = false;
      this.#stopRequested = false;
      this.#stopMode = null;
      if (!this.#navigationPending) {
        this.loadingProgress = null;
        if (this.#status === 'ready') await this.#cacheCurrent();
      }
    }
  }

  async #reopen(): Promise<void> {
    await this.#cacheCurrent();
    // A startup load that asks for a reload every time it opens would
    // otherwise lock the app behind the loading screen for good. Reloads the
    // person asked for, such as choosing another folder, are not counted.
    if (this.#stopMode === 'pause' && !recordReopen()) {
      this.#stopMode = 'pause';
      throw new LoadStopped('Loading the workspace kept reloading the app, so it was stopped and autosave to the folder is paused. Use Load workspace to try again, or Disconnect workspace to work without it.');
    }
    this.#progress('Opening updated workspace', 'Refreshing the app with the loaded bank data');
    await yieldWorkspaceProgress();
    this.#navigationPending = true;
    window.location.reload();
  }

  #fail(error: unknown): void {
    const progress = this.loadingProgress;
    const context = progress ? `${progress.phase}${progress.detail ? ` (${progress.detail})` : ''}: ` : '';
    this.#navigationPending = false;
    this.loadingProgress = null;
    this.error = context + describeError(error);
    this.status = 'error';
  }
}

function loadPaused(): boolean {
  try { return localStorage.getItem(LOAD_PAUSED_KEY) === '1'; } catch { return false; }
}

function setLoadPaused(paused: boolean): void {
  try {
    if (paused) localStorage.setItem(LOAD_PAUSED_KEY, '1');
    else localStorage.removeItem(LOAD_PAUSED_KEY);
  } catch { /* storage unavailable: the pause lasts for this session only */ }
}

/** Log a requested reload; false once reloads repeat too often to be settling. */
function recordReopen(): boolean {
  try {
    const now = Date.now();
    const parsed = JSON.parse(sessionStorage.getItem(REOPEN_LOG_KEY) ?? '[]') as unknown;
    const recent = (Array.isArray(parsed) ? parsed : []).filter((at): at is number => typeof at === 'number' && now - at < REOPEN_WINDOW_MS);
    if (recent.length >= REOPEN_LIMIT) { sessionStorage.removeItem(REOPEN_LOG_KEY); return false; }
    sessionStorage.setItem(REOPEN_LOG_KEY, JSON.stringify([...recent, now]));
  } catch { /* without session storage the guard cannot count */ }
  return true;
}

function clearReopens(): void {
  try { sessionStorage.removeItem(REOPEN_LOG_KEY); } catch { /* nothing to clear */ }
}

async function storedHandle(value?: FileSystemDirectoryHandle | null): Promise<FileSystemDirectoryHandle | null> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('test-generator-workspace-folder', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('handles');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('handles', value === undefined ? 'readonly' : 'readwrite');
      const store = tx.objectStore('handles');
      const request = value === undefined ? store.get(HANDLE_ID) : value === null ? store.delete(HANDLE_ID) : store.put(value, HANDLE_ID);
      tx.oncomplete = () => resolve(value === undefined ? request.result ?? null : value);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}

export const localWorkspace = new LocalWorkspace();
banksFolderSync.onPermissionLost = () => { localWorkspace.status = 'permission-needed'; };
bankWorkspaces.participate({
  // A switch swaps the active bank's storage: finish any folder sync first.
  beforeLeave: async () => { await banksFolderSync.now(); },
  apply: () => {},
  after: () => { void banksFolderSync.now(); },
});
// A connected workspace mounts every bank's images at once (see #loadImages).
bankWorkspaces.imagesShared = () => workspaceCatalog.banks.length > 0;
