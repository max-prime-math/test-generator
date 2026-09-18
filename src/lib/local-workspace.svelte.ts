import { bankWorkspaces } from './bank-workspaces.svelte';
import { readBrowserAppData } from '../git/repoDataBridge';
import { exportAppDataToRepoEntries, importRepoEntriesToAppData, type RepoDataImage } from '../git/repoDataModel';
import { bankOnlyData, snapshotTest, standaloneTestData, workspaceId, WORKSPACE_MODE_KEY } from './workspace-format';
import { childDirectory, directories, folderSignature, readRepoFolder, readText, writeRepoFolder, writeText } from './folder-io';
import { scanWorkspace, signatureFromFingerprint } from './workspace-sync';
import { stringifyGradebookBackup, parseGradebookBackup } from './gradebook-backup';
import { normalizeGradebookData, GRADEBOOK_STORAGE_KEY } from './gradebook-model';
import { imageStore } from './image-store.svelte';
import { testLibrary } from './test-library.svelte';
import { workspaceCatalog, type FolderBank } from './workspace-catalog.svelte';
import type { SavedTest } from './types';
import { readWorkspaceTests, saveWorkspaceTest, archiveRemovedWorkspaceTests } from './workspace-tests';
import { yieldWorkspaceProgress, type WorkspaceProgress } from './workspace-progress';
import { browserImageRevision } from './browser-image-changes';

type Status = 'disconnected' | 'permission-needed' | 'loading' | 'ready' | 'saving' | 'error';
type PermissionHandle = FileSystemDirectoryHandle & { queryPermission(o: { mode: 'readwrite' }): Promise<PermissionState>; requestPermission(o: { mode: 'readwrite' }): Promise<PermissionState> };
type PickerWindow = Window & { showDirectoryPicker?: (o: { id: string; mode: 'readwrite' }) => Promise<FileSystemDirectoryHandle> };
interface WorkspaceRead { banks: FolderBank[]; tests: SavedTest[]; images: RepoDataImage[]; gradebook: string | null; signatures: Map<string, string>; deletedTests: Set<string> }
const HANDLE_ID = 'workspace-root';
/** A constant export timestamp keeps a folder's signature purely content-based. */
const FIXED_GENERATED_AT = '2000-01-01T00:00:00.000Z';
const RETRY_BASE_MS = 5_000;
const RETRY_CEILING_MS = 60_000;

function readSavedTests(): SavedTest[] {
  try {
    const parsed = JSON.parse(localStorage.getItem('tg-test-library-v1') ?? '[]');
    return Array.isArray(parsed) ? parsed as SavedTest[] : [];
  } catch {
    return [];
  }
}

function isEmptyGradebook(data: unknown): boolean {
  const record = data as Record<string, unknown[]> | null;
  if (!record) return true;
  return ['sections', 'students', 'enrollments', 'assessments', 'scores']
    .every(key => !Array.isArray(record[key]) || record[key].length === 0);
}

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
  #root: FileSystemDirectoryHandle | null = null;
  #signatures = new Map<string, string>();
  #deletedTests = new Set<string>();
  #timer: ReturnType<typeof setInterval> | null = null;
  #initialized = false;
  #operation: Promise<void> = Promise.resolve();
  #navigationPending = false;
  #lastSaveInputs: (string | null)[] | null = null;
  #autosavePending = false;
  #failures = 0;
  #retryTimer: ReturnType<typeof setTimeout> | null = null;
  get busy(): boolean { return this.loadingProgress !== null; }
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
      if (await (this.#root as PermissionHandle).queryPermission({ mode: 'readwrite' }) !== 'granted') {
        this.status = 'permission-needed'; return;
      }
      await this.#runLoading('Opening workspace', async () => {
        // Manifests alone decide whether anything changed, so an unchanged
        // workspace opens without reading a single question file.
        if (await this.#resumeFromManifests()) return;
        await this.#connectRead(false);
      });
    } catch (error) { this.#fail(error); }
  }

  /**
   * Fast open: compare each folder's manifest against the browser's own copy of
   * that bank. When they agree there is nothing to load, so the catalog is
   * rebuilt from browser data and the folder is never read past its manifests.
   * Anything unexpected returns false and the thorough path takes over.
   */
  async #resumeFromManifests(): Promise<boolean> {
    if (!this.#root) return false;
    this.#progress('Checking workspace manifests', this.#root.name);
    const scan = await scanWorkspace(this.#root);
    if (scan.problems.length > 0) return false;
    if (scan.banks.length === 0) return false;

    const signatures = new Map<string, string>();
    const banks: FolderBank[] = [];
    const live = await readBrowserAppData();

    for (const summary of scan.banks) {
      const id = summary.key.slice('banks/'.length);
      const browserData = id === bankWorkspaces.activeBankId
        ? bankOnlyData(live)
        : await bankWorkspaces.readBankSnapshot(id);
      // A folder bank the browser has never seen needs a real load.
      if (!browserData) return false;
      const expected = signatureFromFingerprint(summary.fingerprint);
      if (folderSignature(exportAppDataToRepoEntries(bankOnlyData(browserData))) !== expected) return false;
      signatures.set(summary.key, expected);
      const name = await readText(summary.handle, 'bank-name.json');
      banks.push({
        id,
        name: name ? String(JSON.parse(name).name) : (bankWorkspaces.banks.find(bank => bank.id === id)?.name ?? id),
        data: browserData,
      });
    }

    const browserTestIds = new Set(live.savedTests.map(test => test.id));
    for (const summary of scan.tests) {
      const id = summary.key.split('/').at(-1)!;
      // A folder test missing from the browser has to be loaded, not archived.
      if (!summary.deleted && !browserTestIds.has(id)) return false;
      signatures.set(summary.key, signatureFromFingerprint(summary.fingerprint));
    }
    if (scan.gradebook) signatures.set('gradebook', scan.gradebook.text);

    this.#signatures = signatures;
    this.#deletedTests = new Set(scan.tests.filter(summary => summary.deleted).map(summary => summary.key));
    await this.#buildCatalog(banks);
    await this.#loadImages(workspaceCatalog.images);
    this.error = null;
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
        // The foreground load has drained pending writes and paused autosave.
        this.#root = root;
        this.folderName = root.name;
        this.error = null;
        this.#signatures = existing.signatures;
        this.#deletedTests = existing.deletedTests;
        await storedHandle(root);
        localStorage.setItem(WORKSPACE_MODE_KEY, '1');
        if (hasData) { await this.#install(existing); await this.#reopen(); return; }
        const data = await readBrowserAppData();
        await this.#buildCatalog([{ id: bankWorkspaces.activeBankId, name: bankWorkspaces.activeBank.name, data: bankOnlyData(data) }]);
        this.status = 'ready';
        this.#progress('Creating workspace folders', 'Saving the initial bank, tests, and gradebook');
        await this.saveNow();
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      this.#fail(error); throw error;
    }
  }

  async grantPermission(): Promise<void> {
    if (!this.#root || this.busy) return;
    if (await (this.#root as PermissionHandle).requestPermission({ mode: 'readwrite' }) !== 'granted') return;
    await this.#runLoading('Reconnecting workspace', () => this.#connectRead(false));
  }

  async addActiveBank(): Promise<void> {
    if (!this.#root || this.activeBankIncluded || this.busy) return;
    if (!window.confirm(`Save “${bankWorkspaces.activeBank.name}” as another bank in this workspace? No tests or gradebook records go into banks/.`)) return;
    await this.#runLoading('Adding bank to workspace', async () => {
      const data = bankOnlyData(await readBrowserAppData());
      await this.#buildCatalog([...workspaceCatalog.banks, { id: bankWorkspaces.activeBankId, name: bankWorkspaces.activeBank.name, data }]);
      this.status = 'ready';
      this.#progress('Saving added bank', bankWorkspaces.activeBank.name);
      await this.saveNow();
    });
  }

  async reload(): Promise<void> {
    if (!this.#root || this.busy || !window.confirm('Reload banks, tests, and gradebook from the workspace? Unsaved browser changes will be replaced. Wait for any file copying or cloud sync to finish first.')) return;
    await this.#runLoading('Reloading workspace', async () => {
      await this.#install(await this.#read(this.#root!));
      await this.#reopen();
    });
  }

  async disconnect(): Promise<void> {
    if (this.busy) return;
    this.#stop();
    await this.#operation;
    await storedHandle(null);
    this.#root = null;
    this.folderName = null;
    this.error = null;
    this.status = 'disconnected';
    // Keep workspace-wide browser data independent until explicitly choosing a legacy bank.
    // Removing the mode flag here would make the next bank switch replace private data.
    workspaceCatalog.clear();
  }

  async saveNow(): Promise<void> {
    return this.#queueSave(false);
  }

  async #queueSave(onlyIfChanged: boolean): Promise<void> {
    const next = this.#operation.then(() => this.#save(onlyIfChanged));
    this.#operation = next.catch(() => undefined);
    return next.catch(error => { this.#fail(error); throw error; });
  }

  #saveInputs(): (string | null)[] {
    return [bankWorkspaces.activeBankId, bankWorkspaces.activeBank.name, browserImageRevision(),
      ...['math-test-bank-v2', 'tg-narratives-v1', 'math-test-custom-classes-v1',
        'tg-test-library-v1', GRADEBOOK_STORAGE_KEY].map(key => localStorage.getItem(key))];
  }

  async #save(onlyIfChanged: boolean): Promise<void> {
    if (!this.#root || this.status === 'permission-needed' || this.status === 'loading') return;
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
        const bankData = bank.id === bankWorkspaces.activeBankId
          ? bankOnlyData(data)
          : await bankWorkspaces.readBankSnapshot(bank.id);
        if (!bankData) return;
        const entries = exportAppDataToRepoEntries(bankData, { generatedAt: FIXED_GENERATED_AT });
        const key = `banks/${id}`;
        if (folderSignature(entries) === this.#signatures.get(key)) return;
        const folder = await bankRoot.getDirectoryHandle(id, { create: true });
        this.#signatures.set(key, await writeRepoFolder(folder, entries, this.#signatures.get(key) ?? 'absent'));
        await writeText(folder, 'bank-name.json', JSON.stringify({ name: bank.name }));
        await workspaceCatalog.replace(workspaceCatalog.banks.map(entry => entry.id === id ? { ...entry, data: bankData } : entry));
        await mountImages(workspaceCatalog.images);
      });
    }

    const allData = { ...data, questions: [...data.questions, ...workspaceCatalog.questions], images: [...(data.images ?? []), ...workspaceCatalog.images] };
    for (const original of data.savedTests) {
      await attempt(`Saved test “${original.name}”`, async () => {
        const captured = snapshotTest(original, allData);
        const test = captured.test;
        const entries = exportAppDataToRepoEntries(standaloneTestData(test, captured.images, [...data.customClasses, ...workspaceCatalog.classes]
          .filter((cls, index, all) => all.findIndex(other => other.id === cls.id) === index)), { generatedAt: FIXED_GENERATED_AT });
        if (!await saveWorkspaceTest(testsRoot, test, entries, { signatures: this.#signatures, deletedTests: this.#deletedTests })) return;
        await mountImages(captured.images);
        testLibrary.setContentSnapshot(test.id, test.questionSnapshots!, test.narrativeSnapshots!);
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

    this.lastSavedAt = Date.now();
    if (problems.length === 0) this.#failures = 0;
    // Capture the inputs from BEFORE asynchronous work. Edits arriving during
    // a save must remain dirty, even if that costs one additional save pass.
    this.#lastSaveInputs = problems.length > 0 ? null : inputs;
    this.error = problems.length > 0 ? problems.join(' · ') : null;
    // A partial failure stays visible but keeps saving: the next pass retries
    // the failed items, so a transient problem heals itself.
    this.status = 'ready';
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
    await this.#loadImages([...data.images, ...workspaceCatalog.images]);
    this.#signatures = data.signatures;
    this.#deletedTests = data.deletedTests;
  }

  /**
   * Adopt the folder without discarding browser-only work.
   *
   * The folder wins wherever both sides hold the same item, because it is the
   * source of truth. Items the folder has never seen — a test written while
   * saving was broken, for instance — stay in the browser and reach the folder
   * on the next save. A gradebook is only replaced by one that actually holds
   * records, and the browser's copy is backed up beside it first.
   */
  async #merge(data: WorkspaceRead, bankDataReplaced: boolean): Promise<boolean> {
    this.status = 'loading';
    localStorage.setItem(WORKSPACE_MODE_KEY, '1');
    this.#progress('Updating browser banks', 'Preserving the current snapshot');
    await yieldWorkspaceProgress();
    await bankWorkspaces.installFolderBanks(data.banks, (done, total, name) => this.#progress('Updating browser banks', name, done, total, 'banks'));

    this.#progress('Merging saved tests', `${data.tests.length} in the folder`);
    const browserTests = readSavedTests();
    const before = new Map(browserTests.map(test => [test.id, JSON.stringify(test)]));
    const fromFolder = new Set(data.tests.map(test => test.id));
    const keptFromBrowser = browserTests.filter(test => !fromFolder.has(test.id));
    // Only a folder copy that actually differs counts as replacing browser data.
    const testsReplaced = data.tests.some(test => before.get(test.id) !== JSON.stringify(test));
    localStorage.setItem('tg-test-library-v1', JSON.stringify([...data.tests, ...keptFromBrowser]));
    localStorage.removeItem('tg-test-draft-v1');

    this.#progress('Merging gradebook', 'Checking for records to preserve');
    const gradebookReplaced = await this.#mergeGradebook(data.gradebook);

    await this.#buildCatalog(data.banks);
    await this.#loadImages([...data.images, ...workspaceCatalog.images]);
    this.#signatures = data.signatures;
    this.#deletedTests = data.deletedTests;
    this.error = keptFromBrowser.length > 0
      ? `${keptFromBrowser.length} saved test${keptFromBrowser.length === 1 ? '' : 's'} were only in this browser and will be written to the workspace.`
      : null;
    // Reload only when browser data was actually replaced; browser-only extras
    // simply wait for the next save. Reloading for those would repeat the same
    // comparison on every startup and never settle.
    return bankDataReplaced || testsReplaced || gradebookReplaced;
  }

  /** Replace the browser gradebook only when the folder holds real records. */
  async #mergeGradebook(folderGradebook: string | null): Promise<boolean> {
    const current = normalizeGradebookData(JSON.parse(localStorage.getItem(GRADEBOOK_STORAGE_KEY) ?? 'null'));
    if (folderGradebook === null) return false; // nothing on disk yet: the save pass writes this one out
    const incoming = parseGradebookBackup(folderGradebook);
    if (isEmptyGradebook(incoming) && !isEmptyGradebook(current)) return false;
    if (JSON.stringify(incoming) === JSON.stringify(current)) return false;
    if (!isEmptyGradebook(current)) await this.#backupGradebook(current);
    localStorage.setItem(GRADEBOOK_STORAGE_KEY, JSON.stringify(incoming));
    return true;
  }

  /** Keep the replaced browser gradebook beside the workspace copy. */
  async #backupGradebook(data: unknown): Promise<void> {
    if (!this.#root) return;
    try {
      const folder = await (await this.#root.getDirectoryHandle('gradebook', { create: true }))
        .getDirectoryHandle('replaced-browser-copies', { create: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      await writeText(folder, `gradebook-${stamp}.json`, stringifyGradebookBackup(normalizeGradebookData(data), 0));
    } catch {
      // A failed backup must not block adopting the workspace copy.
    }
  }

  async #connectRead(replace: boolean): Promise<void> {
    if (!this.#root) return;
    const data = await this.#read(this.#root);
    if (replace) { await this.#install(data); return; }
    this.#progress('Checking for changes', 'Comparing folder contents with the browser copy');
    await yieldWorkspaceProgress();
    const local = await readBrowserAppData();
    const active = data.banks.find(bank => bank.id === bankWorkspaces.activeBankId);
    const localBankSignature = folderSignature(exportAppDataToRepoEntries(bankOnlyData(local)));
    const sameBank = !active || localBankSignature === data.signatures.get(`banks/${active.id}`);
    const testSignature = (savedTests: SavedTest[]) => folderSignature(exportAppDataToRepoEntries({ questions: [], customClasses: [], savedTests }));
    const sameTests = testSignature(local.savedTests) === testSignature(data.tests);
    const sameGradebook = JSON.stringify(normalizeGradebookData(JSON.parse(localStorage.getItem(GRADEBOOK_STORAGE_KEY) ?? 'null')))
      === JSON.stringify(data.gradebook ? parseGradebookBackup(data.gradebook) : normalizeGradebookData(null));
    // Divergence used to stop autosave for the whole session, which stranded
    // every later edit in the browser and left the folder further behind.
    // The folder is the source of truth, so its copies win, while anything the
    // folder has never seen is kept and written out by the next save.
    if (!sameBank || !sameTests || !sameGradebook) {
      if (await this.#merge(data, !sameBank)) {
        await this.#reopen();
        return;
      }
      this.status = 'ready';
      this.lastLoadedAt = Date.now();
      this.#start();
      return;
    }
    // Newly copied banks also need browser registry entries, not just search results.
    if (data.banks.some(bank => !bankWorkspaces.banks.some(existing => existing.id === bank.id))) {
      await this.#install(data);
      await this.#reopen();
      return;
    }
    await this.#buildCatalog(data.banks);
    await this.#loadImages([...data.images, ...workspaceCatalog.images]);
    this.#signatures = data.signatures;
    this.#deletedTests = data.deletedTests;
    this.error = null;
    this.status = 'ready';
    this.lastLoadedAt = Date.now();
  }

  #progress(phase: string, detail = '', completed = 0, total: number | null = null, unit = ''): void {
    if (this.loadingProgress) this.loadingProgress = { phase, detail, completed, total, unit };
  }

  async #buildCatalog(banks: FolderBank[]): Promise<void> {
    this.#progress('Indexing questions', 'Building the cross-bank search index');
    await yieldWorkspaceProgress();
    await workspaceCatalog.replace(banks, (done, total, name) => this.#progress('Indexing questions', name, done, total, 'questions'));
  }

  async #loadImages(images: RepoDataImage[]): Promise<void> {
    const unique = [...new Map(images.map(image => [image.name, image])).values()];
    this.#progress('Loading diagrams and images', '', 0, unique.length, 'images');
    await yieldWorkspaceProgress();
    await mountImages(unique, (done, total, name) => this.#progress('Loading diagrams and images', name, done, total, 'images'));
  }

  async #runLoading(phase: string, action: () => Promise<void>): Promise<void> {
    if (this.busy) return;
    this.#stop();
    this.loadingProgress = { phase, detail: 'Finishing any pending save', completed: 0, total: null, unit: '' };
    await yieldWorkspaceProgress();
    await this.#operation;
    const previousStatus = this.status;
    this.status = 'loading';
    this.#navigationPending = false;
    try {
      await action();
      if (this.status === 'loading' && !this.#navigationPending) this.status = previousStatus;
    } catch (error) { this.#fail(error); throw error; }
    finally {
      if (!this.#navigationPending) {
        this.loadingProgress = null;
        if (this.status === 'ready') this.#start();
      }
    }
  }

  async #reopen(): Promise<void> {
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
    if (this.#retryTimer || !this.#root) return;
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
    await imageStore.put(image.name, image.bytes, image.ext);
    onProgress?.(index + 1, images.length, `${image.name}.${image.ext}`);
  }
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
