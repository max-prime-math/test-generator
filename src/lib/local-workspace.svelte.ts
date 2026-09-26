import { bankWorkspaces } from './bank-workspaces.svelte';
import { exportAppDataInWorker } from '../git/repo-export-client';
import { readBrowserAppData } from '../git/repoDataBridge';
import { importRepoEntriesToAppData, type RepoDataImage } from '../git/repoDataModel';
import { contentImages, bankOnlyData, snapshotTest, standaloneTestData, workspaceId, WORKSPACE_MODE_KEY } from './workspace-format';
import { childDirectory, directories, folderSignature, readRepoFolder, readText, writeRepoFolder, writeText } from './folder-io';
import { scanWorkspace, signatureFromFingerprint, writeFolderChecked } from './workspace-sync';
import { stringifyGradebookBackup, parseGradebookBackup } from './gradebook-backup';
import { normalizeGradebookData, GRADEBOOK_STORAGE_KEY } from './gradebook-model';
import { imageStore } from './image-store.svelte';
import { testLibrary } from './test-library.svelte';
import { workspaceCatalog, type FolderBank } from './workspace-catalog.svelte';
import type { SavedTest } from './types';
import { readWorkspaceTests, saveWorkspaceTest, archiveRemovedWorkspaceTests } from './workspace-tests';
import { yieldWorkspaceProgress, type WorkspaceProgress } from './workspace-progress';
import { browserImageRevision } from './browser-image-changes';
import { readWorkspaceCache, writeWorkspaceCache, type WorkspaceCache } from './workspace-cache';

type Status = 'disconnected' | 'permission-needed' | 'paused' | 'loading' | 'review-needed' | 'ready' | 'saving' | 'error';
/** What stopping a load means: keep the folder unloaded, or just abandon this one read. */
type StopMode = 'pause' | 'cancel';
type PermissionHandle = FileSystemDirectoryHandle & { queryPermission(o: { mode: 'readwrite' }): Promise<PermissionState>; requestPermission(o: { mode: 'readwrite' }): Promise<PermissionState> };
type PickerWindow = Window & { showDirectoryPicker?: (o: { id: string; mode: 'readwrite' }) => Promise<FileSystemDirectoryHandle> };
interface WorkspaceRead { banks: FolderBank[]; tests: SavedTest[]; images: RepoDataImage[]; gradebook: string | null; signatures: Map<string, string>; deletedTests: Set<string> }
const HANDLE_ID = 'workspace-root';
/** A constant export timestamp keeps a folder's signature purely content-based. */
const FIXED_GENERATED_AT = '2000-01-01T00:00:00.000Z';
const RETRY_BASE_MS = 5_000;
const RETRY_CEILING_MS = 60_000;
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
  status = $state<Status>('disconnected');
  folderName = $state<string | null>(null);
  error = $state<string | null>(null);
  lastSavedAt = $state<number | null>(null);
  loadingProgress = $state<WorkspaceProgress | null>(null);
  lastLoadedAt = $state<number | null>(null);
  /** True while the current load is still only reading, so stopping loses nothing. */
  canStop = $state(false);
  backgroundLoading = $state(false);
  changedFolders = $state<string[]>([]);
  #writesReady = false;
  #stopMode: StopMode | null = null;
  #stopRequested = false;
  #root = $state.raw<FileSystemDirectoryHandle | null>(null);
  #signatures = new Map<string, string>();
  #deletedTests = new Set<string>();
  #timer: ReturnType<typeof setInterval> | null = null;
  #initialized = false;
  #operation: Promise<void> = Promise.resolve();
  #navigationPending = false;
  #lastSaveInputs: (string | null)[] | null = null;
  #autosavePending = false;
  #failures = 0;
  /** Snapshot timestamp of each non-active bank the last time it was written. */
  #bankSavedAt = new Map<string, number>();
  #retryTimer: ReturnType<typeof setTimeout> | null = null;
  get busy(): boolean { return this.loadingProgress !== null; }
  get blocking(): boolean { return this.busy && !this.backgroundLoading; }
  get connected(): boolean { return this.#root !== null; }
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

  async #open(): Promise<void> {
    this.backgroundLoading = true;
    this.changedFolders = [];
    try {
      await this.#runLoading('Checking workspace in background', async () => {
        const cache = await this.#restoreCache();
        if (cache) {
          if (await this.#resumeCached(cache)) return;
        } else if (await this.#resumeFromManifests()) return;
        // Never install folder data or reload underneath an editable page.
        // Explicit Reload workspace remains the reviewed replacement path.
        this.status = 'review-needed';
        if (!this.changedFolders.length) this.changedFolders = ['The folder and browser copies differ'];
      }, 'pause');
    } finally { this.backgroundLoading = false; }
  }

  #cache: WorkspaceCache | null = null;
  #testImages: RepoDataImage[] = [];
  async #restoreCache(): Promise<WorkspaceCache | null> {
    if (!this.#root) return null;
    if (this.#cache) return this.#cache;
    try {
      const cache = await readWorkspaceCache(this.#root);
      if (cache) { workspaceCatalog.restore(cache.catalog); this.#testImages = cache.testImages; this.#cache = cache; }
      return cache;
    } catch { return null; } // disposable cache; fall back to browser bank snapshots
  }

  async #cacheCurrent(): Promise<void> {
    if (!this.#root || !this.#writesReady) return;
    try {
      const cache: WorkspaceCache = { version: 2, root: this.#root, testImages: this.#testImages, signatures: [...this.#signatures],
        deletedTests: [...this.#deletedTests], catalog: workspaceCatalog.snapshot() };
      await writeWorkspaceCache(cache);
      this.#cache = cache;
    } catch { /* Browser bank data is authoritative; a cache failure only costs a rebuild. */ }
  }

  async #resumeCached(cache: WorkspaceCache): Promise<boolean> {
    this.#progress('Checking workspace manifests', this.#root!.name);
    const scan = await scanWorkspace(this.#root!, key => this.#progress('Checking workspace manifests', key));
    const previous = new Map(cache.signatures);
    const current = new Map([...scan.banks, ...scan.tests].map(summary => [summary.key, signatureFromFingerprint(summary.fingerprint)]));
    if (scan.gradebook) current.set('gradebook', scan.gradebook.text);
    const deleted = new Set(scan.tests.filter(summary => summary.deleted).map(summary => summary.key));
    const oldDeleted = new Set(cache.deletedTests);
    const addedBanks = scan.banks.filter(summary => !previous.has(summary.key));
    const newKeys = new Set(addedBanks.filter(summary => !bankWorkspaces.banks.some(bank => `banks/${bank.id}` === summary.key)).map(summary => summary.key));
    this.changedFolders = [...new Set([
      ...scan.problems.map(problem => `${problem.key}: ${problem.message}`),
      ...[...new Set([...previous.keys(), ...current.keys()])].filter(key =>
        !newKeys.has(key) && (previous.get(key) !== current.get(key) || deleted.has(key) !== oldDeleted.has(key))),
    ])];
    if (this.changedFolders.length) return false;

    // New banks can be added independently. Existing banks/tests/gradebook are
    // never replaced by this background path, including during a slow read.
    const additions: FolderBank[] = [];
    for (const summary of addedBanks) {
      const id = workspaceId(summary.key.slice('banks/'.length));
      this.#progress('Loading a new bank in background', id);
      const entries = await readRepoFolder(summary.handle, (done, total, path) => this.#progress('Loading a new bank in background', `${id} / ${path}`, done, total, 'files'));
      if (!entries) throw new Error(`Bank ${id} disappeared while reading.`);
      if (folderSignature(entries) !== current.get(summary.key)) throw new Error(`Bank ${id} changed while reading. Check again after copying finishes.`);
      const data = importRepoEntriesToAppData(entries).appData;
      if (data.savedTests.length) throw new Error(`Bank ${id} contains bundled tests; import it as a legacy bank.`);
      const name = await readText(summary.handle, 'bank-name.json');
      additions.push({ id, name: name ? String(JSON.parse(name).name) : id, data });
    }
    if (additions.length) {
      this.#beginWrites();
      await bankWorkspaces.registerNewFolderBanks(additions);
      await this.#buildCatalog([...workspaceCatalog.banks, ...additions]);
    }
    // A cached test removed from the browser is a local deletion, so retain the
    // folder baseline for the normal guarded save/archive operation.
    this.#signatures = current;
    this.#deletedTests = deleted;
    await this.#loadImages([...this.#testImages, ...workspaceCatalog.images]);
    this.#writesReady = true;
    this.status = 'ready';
    this.error = null;
    this.lastLoadedAt = Date.now();
    return true;
  }

  /**
   * Fast open: compare each folder's manifest against the browser's own copy of
   * that bank. When they agree there is nothing to load, so the catalog is
   * rebuilt from browser data and the folder is never read past its manifests.
   * On an older installation this establishes the first cache. Divergence is
   * reported for review, without replacing anything in the browser.
   */
  async #resumeFromManifests(): Promise<boolean> {
    if (!this.#root) return false;
    this.#progress('Checking workspace manifests', this.#root.name);
    const scan = await scanWorkspace(this.#root, key => this.#progress('Checking workspace manifests', key));
    this.changedFolders = scan.problems.map(problem => `${problem.key}: ${problem.message}`);

    const signatures = new Map<string, string>();
    const banks: FolderBank[] = [];
    const live = await readBrowserAppData();

    for (const summary of scan.banks) {
      const id = summary.key.slice('banks/'.length);
      const browserData = id === bankWorkspaces.activeBankId
        ? bankOnlyData(live)
        : await bankWorkspaces.readBankSnapshot(id);
      // A folder bank the browser has never seen needs a real load.
      if (!browserData) { this.changedFolders.push(summary.key); continue; }
      const expected = signatureFromFingerprint(summary.fingerprint);
      if (folderSignature(await exportAppDataInWorker(bankOnlyData(browserData))) !== expected) this.changedFolders.push(summary.key);
      signatures.set(summary.key, expected);
      const name = await readText(summary.handle, 'bank-name.json');
      banks.push({
        id,
        name: name ? String(JSON.parse(name).name) : (bankWorkspaces.banks.find(bank => bank.id === id)?.name ?? id),
        data: browserData,
      });
    }

    await this.#buildCatalog(banks);
    this.#testImages = contentImages(live.savedTests.flatMap(test => test.questionSnapshots ?? []), live.savedTests.flatMap(test => test.narrativeSnapshots ?? []), live.images ?? []);
    const allData = { ...live, questions: [...live.questions, ...workspaceCatalog.questions], images: [...(live.images ?? []), ...workspaceCatalog.images] };
    const activeTestIds = new Set(scan.tests.filter(test => !test.deleted).map(test => test.key.split('/').at(-1)));
    for (const summary of scan.tests) {
      const id = summary.key.split('/').at(-1)!;
      const test = live.savedTests.find(test => test.id === id);
      const expected = signatureFromFingerprint(summary.fingerprint);
      if (summary.deleted) {
        if (test && !activeTestIds.has(id)) this.changedFolders.push(summary.key);
      } else if (!test) {
        this.changedFolders.push(summary.key);
      } else {
        try {
          const captured = snapshotTest(test, allData);
          const actual = folderSignature(await exportAppDataInWorker(standaloneTestData(captured.test, captured.images,
            $state.snapshot([...live.customClasses, ...workspaceCatalog.classes].filter((cls, index, all) => all.findIndex(other => other.id === cls.id) === index)))));
          if (actual !== expected) this.changedFolders.push(summary.key);
        } catch { this.changedFolders.push(summary.key); }
      }
      signatures.set(summary.key, expected);
    }
    if (scan.gradebook) {
      signatures.set('gradebook', scan.gradebook.text);
      if (JSON.stringify(parseGradebookBackup(scan.gradebook.text)) !== JSON.stringify(normalizeGradebookData(JSON.parse(localStorage.getItem(GRADEBOOK_STORAGE_KEY) ?? 'null')))) this.changedFolders.push('gradebook');
    }
    await this.#loadImages([...this.#testImages, ...workspaceCatalog.images]);
    if (this.changedFolders.length) return false;

    this.#signatures = signatures;
    this.#deletedTests = new Set(scan.tests.filter(summary => summary.deleted).map(summary => summary.key));
    this.#beginWrites();
    this.error = null;
    this.#writesReady = true;
    this.status = 'ready';
    this.lastLoadedAt = Date.now();
    return true;
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
        const existing = await this.#read(root);
        const hasData = existing.banks.length || existing.tests.length || existing.gradebook !== null;
        const message = hasData
          ? `Load workspace “${root.name}”? Its banks will be registered separately. Its tests and gradebook replace the current browser copies; missing sections load empty. Existing bank-scoped backups are retained.`
          : `Create banks/, tests/, and gradebook/ in “${root.name}”? This saves the ACTIVE bank, saved tests, and private student/grade data there. Only continue if this root is private. Share individual child folders outside TestGen, not the root.`;
        if (!window.confirm(message)) return;
        this.#beginWrites();
        setLoadPaused(false);
        // The foreground load has drained pending writes and paused autosave.
        this.#root = root;
        this.#cache = null;
        this.folderName = root.name;
        this.error = null;
        this.#signatures = existing.signatures;
        this.#deletedTests = existing.deletedTests;
        await storedHandle(root);
        localStorage.setItem(WORKSPACE_MODE_KEY, '1');
        if (hasData) { await this.#install(existing); await this.#reopen(); return; }
        const data = await readBrowserAppData();
        await this.#buildCatalog([{ id: bankWorkspaces.activeBankId, name: bankWorkspaces.activeBank.name, data: bankOnlyData(data) }]);
        this.#writesReady = true;
        this.status = 'ready';
        this.#progress('Creating workspace folders', 'Saving the initial bank, tests, and gradebook');
        await this.saveNow();
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
      this.#writesReady = true;
      this.status = 'ready';
      this.#progress('Saving added bank', bankWorkspaces.activeBank.name);
      await this.saveNow();
    });
  }

  async reload(): Promise<void> {
    if (!this.#root || this.busy || !window.confirm('Reload banks, tests, and gradebook from the workspace? Unsaved browser changes will be replaced. Wait for any file copying or cloud sync to finish first.')) return;
    await this.#runLoading('Reloading workspace', async () => {
      const data = await this.#read(this.#root!);
      setLoadPaused(false);
      await this.#install(data);
      await this.#reopen();
    }, this.status === 'paused' ? 'pause' : 'cancel');
  }

  async disconnect(): Promise<void> {
    if (this.busy) return;
    this.#stop();
    await this.#operation;
    await storedHandle(null);
    setLoadPaused(false);
    this.#root = null;
    this.#cache = null;
    this.#testImages = [];
    this.#writesReady = false;
    this.folderName = null;
    this.error = null;
    this.status = 'disconnected';
    // Keep workspace-wide browser data independent until explicitly choosing a legacy bank.
    // Removing the mode flag here would make the next bank switch replace private data.
    workspaceCatalog.clear();
  }

  async saveNow(): Promise<void> {
    return this.#queueSave(true);
  }

  async #queueSave(onlyIfChanged: boolean): Promise<void> {
    const next = this.#operation.then(() => this.#save(onlyIfChanged));
    this.#operation = next.catch(() => undefined);
    return next.catch(error => { this.#fail(error); throw error; });
  }

  #saveInputs(): (string | null)[] {
    return [bankWorkspaces.activeBankId, bankWorkspaces.activeBank.name, browserImageRevision(),
      JSON.stringify(bankWorkspaces.banks.map(bank => [bank.id, bank.name, bank.updatedAt])),
      ...['math-test-bank-v2', 'tg-narratives-v1', 'math-test-custom-classes-v1',
        'tg-test-library-v1', GRADEBOOK_STORAGE_KEY].map(key => localStorage.getItem(key))];
  }

  async #save(onlyIfChanged: boolean): Promise<void> {
    // A paused workspace was never read, so the folder's state is unknown.
    if (!this.#writesReady || !this.#root || this.status === 'permission-needed' || this.status === 'paused' || this.status === 'loading') return;
    if (await (this.#root as PermissionHandle).queryPermission({ mode: 'readwrite' }) !== 'granted') {
      this.status = 'permission-needed'; this.#stop(); return;
    }
    const inputs = this.#saveInputs();
    if (onlyIfChanged && this.#lastSaveInputs?.every((value, index) => value === inputs[index])) return;
    const root = this.#root;
    this.status = 'saving';
    const data = await readBrowserAppData();
    const bankRoot = await root.getDirectoryHandle('banks', { create: true });
    const testsRoot = await root.getDirectoryHandle('tests', { create: true });
    const gradeRoot = await root.getDirectoryHandle('gradebook', { create: true });
    // Each item reports its own problem. One unwritable bank or one test with a
    // missing question must never stop the rest of the workspace from saving.
    const problems: string[] = [];
    const attempt = async (label: string, action: () => Promise<void>) => {
      try { await action(); } catch (error) { problems.push(`${label}: ${describeError(error)}`); }
    };

    for (const bank of this.#banksToSave()) {
      await attempt(bank.name, async () => {
        const id = workspaceId(bank.id);
        const isActive = bank.id === bankWorkspaces.activeBankId;
        // A dormant bank only changes when it is switched away from or
        // installed, so its snapshot timestamp decides whether it is worth
        // parsing megabytes of stored questions on every pass.
        const updatedAt = bankWorkspaces.banks.find(entry => entry.id === bank.id)?.updatedAt ?? 0;
        if (!isActive && this.#bankSavedAt.get(bank.id) === updatedAt) return;
        const bankData = isActive ? bankOnlyData(data) : await bankWorkspaces.readBankSnapshot(bank.id);
        if (!bankData) return;
        const entries = await exportAppDataInWorker(bankData, { generatedAt: FIXED_GENERATED_AT });
        const key = `banks/${id}`;
        if (folderSignature(entries) === this.#signatures.get(key)) {
          if (!isActive) this.#bankSavedAt.set(bank.id, updatedAt);
          return;
        }
        const folder = await bankRoot.getDirectoryHandle(id, { create: true });
        // Checked against the manifest rather than by re-reading every file,
        // and only changed files are written: saving one edited question must
        // not cost a full read and rewrite of the whole bank.
        const written = await writeFolderChecked(folder, entries, this.#signatures.get(key) ?? 'absent');
        this.#signatures.set(key, signatureFromFingerprint(written));
        await writeText(folder, 'bank-name.json', JSON.stringify({ name: bank.name }));
        const images = await workspaceCatalog.updateBank({ id, name: bank.name, data: bankData });
        await mountImages(images);
        // Failed writes must remain retryable even when the dormant bank's
        // browser snapshot timestamp has not changed.
        if (!isActive) this.#bankSavedAt.set(bank.id, updatedAt);
      });
    }

    const allData = { ...data, questions: [...data.questions, ...workspaceCatalog.questions], images: [...(data.images ?? []), ...workspaceCatalog.images] };
    for (const original of data.savedTests) {
      await attempt(`Saved test “${original.name}”`, async () => {
        const captured = snapshotTest(original, allData);
        const test = captured.test;
        this.#testImages = [...new Map([...this.#testImages, ...captured.images].map(image => [image.name, image])).values()];
        const entries = await exportAppDataInWorker(standaloneTestData(test, captured.images, $state.snapshot([...data.customClasses, ...workspaceCatalog.classes]
          .filter((cls, index, all) => all.findIndex(other => other.id === cls.id) === index))), { generatedAt: FIXED_GENERATED_AT });
        if (!await saveWorkspaceTest(testsRoot, test, entries, { signatures: this.#signatures, deletedTests: this.#deletedTests })) return;
        await mountImages(captured.images);
        testLibrary.setContentSnapshot(test.id, test.questionSnapshots!, test.narrativeSnapshots!, original.config);
      });
    }
    await attempt('Archiving removed tests', () =>
      archiveRemovedWorkspaceTests(testsRoot, data.savedTests, { signatures: this.#signatures, deletedTests: this.#deletedTests }));

    await attempt('Gradebook', async () => {
      const gradebook = stringifyGradebookBackup(normalizeGradebookData(JSON.parse(localStorage.getItem(GRADEBOOK_STORAGE_KEY) ?? 'null')), 0);
      if (gradebook === this.#signatures.get('gradebook')) return;
      const previous = await readText(gradeRoot, 'gradebook.json');
      if ((previous ?? 'absent') !== (this.#signatures.get('gradebook') ?? 'absent')) {
        throw new Error('changed outside this tab. Reload the workspace before saving.');
      }
      await writeText(gradeRoot, 'gradebook.json', gradebook);
      this.#signatures.set('gradebook', gradebook);
    });

    this.#testImages = contentImages(testLibrary.tests.flatMap(test => test.questionSnapshots ?? []), testLibrary.tests.flatMap(test => test.narrativeSnapshots ?? []), [...(data.images ?? []), ...this.#testImages, ...workspaceCatalog.images]);
    this.lastSavedAt = Date.now();
    if (problems.length === 0) this.#failures = 0;
    // Capture the inputs from BEFORE asynchronous work. Edits arriving during
    // a save must remain dirty, even if that costs one additional save pass.
    this.#lastSaveInputs = problems.length > 0 ? null : inputs;
    this.error = problems.length > 0 ? problems.join(' · ') : null;
    // A partial failure stays visible but keeps saving: the next pass retries
    // the failed items, so a transient problem heals itself.
    this.status = 'ready';
    await this.#cacheCurrent();
    this.#start();
  }

  /** Every bank the workspace owns, so the folder mirrors all of them. */
  #banksToSave(): Array<{ id: string; name: string }> {
    const banks = workspaceCatalog.banks.map(bank => ({
      id: bank.id,
      name: bankWorkspaces.banks.find(entry => entry.id === bank.id)?.name ?? bank.name,
    }));
    if (this.activeBankIncluded) {
      return banks.map(bank => bank.id === bankWorkspaces.activeBankId
        ? { id: bank.id, name: bankWorkspaces.activeBank.name }
        : bank);
    }
    return banks;
  }

  async #read(root: FileSystemDirectoryHandle): Promise<WorkspaceRead> {
    this.#progress('Scanning workspace folders', root.name);
    const result: WorkspaceRead = { banks: [], tests: [], images: [], gradebook: null, signatures: new Map(), deletedTests: new Set() };
    const banks = await childDirectory(root, 'banks');
    const bankFolders = banks ? await directories(banks) : [];
    for (const [index, folder] of bankFolders.entries()) {
      workspaceId(folder.name);
      const label = `Reading bank ${index + 1} of ${bankFolders.length}`;
      this.#progress(label, folder.name);
      const entries = await readRepoFolder(folder, (done, total, path) => this.#progress(label, `${folder.name} / ${path}`, done, total, 'files'));
      if (!entries) continue;
      const data = importRepoEntriesToAppData(entries).appData;
      if (data.savedTests.length) throw new Error(`Bank ${folder.name} contains bundled tests. Import it as a legacy bank first; workspace banks must be independent.`);
      const name = await readText(folder, 'bank-name.json');
      result.banks.push({ id: folder.name, name: name ? String(JSON.parse(name).name) : folder.name, data });
      result.signatures.set(`banks/${folder.name}`, folderSignature(entries));
    }
    this.#progress('Reading saved tests', 'Scanning class folders');
    const tests = await childDirectory(root, 'tests');
    if (tests) {
      const loaded = await readWorkspaceTests(tests, (folder, done, total, path) => this.#progress('Reading saved tests', `${folder} / ${path}`, done, total, 'files'));
      result.tests = loaded.tests;
      result.images = loaded.images;
      result.deletedTests = loaded.deletedTests;
      for (const [path, signature] of loaded.signatures) result.signatures.set(path, signature);
    }
    this.#progress('Reading gradebook', 'Validating the private gradebook backup');
    const gradebook = await childDirectory(root, 'gradebook');
    if (gradebook) result.gradebook = await readText(gradebook, 'gradebook.json');
    if (result.gradebook !== null) {
      const backup = JSON.parse(result.gradebook);
      if (backup.kind !== 'test-generator-gradebook-backup' || backup.version !== 1 || backup.data?.version !== 1
        || !['sections', 'students', 'enrollments', 'assessments', 'scores'].every(key => Array.isArray(backup.data[key]))) {
        throw new Error('Invalid workspace gradebook backup. Existing browser data has not been replaced.');
      }
      parseGradebookBackup(result.gradebook);
      result.signatures.set('gradebook', result.gradebook);
    }
    return result;
  }

  async #install(data: WorkspaceRead): Promise<void> {
    this.#beginWrites();
    this.status = 'loading';
    localStorage.setItem(WORKSPACE_MODE_KEY, '1');
    this.#progress('Updating browser banks', 'Preserving the current snapshot');
    await yieldWorkspaceProgress();
    await bankWorkspaces.installFolderBanks(data.banks, (done, total, name) => this.#progress('Updating browser banks', name, done, total, 'banks'));
    this.#progress('Updating tests and gradebook', `${data.tests.length} saved tests`);
    localStorage.setItem('tg-test-library-v1', JSON.stringify(data.tests));
    localStorage.removeItem('tg-test-draft-v1');
    localStorage.setItem(GRADEBOOK_STORAGE_KEY, JSON.stringify(data.gradebook ? parseGradebookBackup(data.gradebook) : normalizeGradebookData(null)));
    await this.#buildCatalog(data.banks);
    this.#testImages = data.images;
    await this.#loadImages([...data.images, ...workspaceCatalog.images]);
    this.#signatures = data.signatures;
    this.#deletedTests = data.deletedTests;
    this.#writesReady = true;
  }

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
    await mountImages(unique, (done, total, name) => this.#progress('Loading diagrams and images', name, done, total, 'images'));
  }

  async #runLoading(phase: string, action: () => Promise<void>, stopMode: StopMode | null = null): Promise<void> {
    if (this.busy) return;
    this.#stop();
    this.loadingProgress = { phase, detail: 'Finishing any pending save', completed: 0, total: null, unit: '' };
    this.#stopMode = stopMode;
    this.#stopRequested = false;
    this.canStop = stopMode !== null;
    await yieldWorkspaceProgress();
    await this.#operation;
    const previousStatus = this.status;
    const previousWritesReady = this.#writesReady;
    this.#writesReady = false;
    this.status = 'loading';
    this.#navigationPending = false;
    try {
      await action();
      if (!this.#navigationPending) clearReopens();
      if (this.status === 'loading' && !this.#navigationPending) { this.status = previousStatus; this.#writesReady = previousWritesReady; }
    } catch (error) {
      if (!(error instanceof LoadStopped)) { this.#fail(error); throw error; }
      this.#navigationPending = false;
      if (this.#stopMode === 'pause') {
        // Stay connected but unloaded, across relaunches, until asked to load.
        setLoadPaused(true);
        this.status = 'paused';
        if (error.message) this.error = error.message;
      } else {
        this.status = previousStatus;
        this.#writesReady = previousWritesReady;
      }
    } finally {
      this.canStop = false;
      this.#stopRequested = false;
      this.#stopMode = null;
      if (!this.#navigationPending) {
        this.loadingProgress = null;
        if (this.status === 'ready') { await this.#cacheCurrent(); this.#start(); }
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

  #start(): void {
    if (!this.#timer) this.#timer = setInterval(() => {
      if (this.#autosavePending || this.busy) return;
      this.#autosavePending = true;
      void this.#queueSave(true).catch(() => undefined).finally(() => { this.#autosavePending = false; });
    }, 2500);
  }
  #stop(): void {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
    if (this.#retryTimer) clearTimeout(this.#retryTimer);
    this.#retryTimer = null;
  }
  #fail(error: unknown): void {
    const progress = this.loadingProgress;
    const context = progress ? `${progress.phase}${progress.detail ? ` (${progress.detail})` : ''}: ` : '';
    this.#stop();
    this.#navigationPending = false;
    this.loadingProgress = null;
    this.error = context + describeError(error);
    this.status = 'error';
    this.#scheduleRetry();
  }

  /**
   * A failed pass used to stop autosave for the rest of the session, so one
   * transient problem silently stranded every later edit in the browser.
   * Saving now resumes on a backoff instead, and a success clears the error.
   */
  #scheduleRetry(): void {
    if (this.#retryTimer || !this.#root || !this.#writesReady) return;
    this.#failures += 1;
    const delay = Math.min(RETRY_CEILING_MS, RETRY_BASE_MS * 2 ** (this.#failures - 1));
    this.#retryTimer = setTimeout(() => {
      this.#retryTimer = null;
      if (!this.#root || this.status === 'permission-needed' || this.busy) return;
      void this.#queueSave(false).catch(() => undefined);
    }, delay);
  }
}

async function mountImages(images: RepoDataImage[], onProgress?: (done: number, total: number, name: string) => void): Promise<void> {
  for (const [index, image] of images.entries()) {
    if (!image.name.startsWith('testasset-') || !imageStore.has(image.name)) await imageStore.put(image.name, image.bytes, image.ext);
    onProgress?.(index + 1, images.length, `${image.name}.${image.ext}`);
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
