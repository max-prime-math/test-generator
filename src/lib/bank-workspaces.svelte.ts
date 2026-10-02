import type { RepoAppData, RepoDataImage } from '../git/repoDataModel.ts';
import type { Class, Question, SavedTest } from './types.ts';
import { createId } from './id.ts';
import { WORKSPACE_MODE_KEY, WORKSPACE_SHARED_KEYS, contentImages } from './workspace-format.ts';
import { BANK_IMAGE_STORE, IMAGE_META_STORE, IMAGE_STORE, openImageDb, putImage, replaceActiveImages, type ImageMeta, type ImagePayload } from './image-db.ts';
import { browserImageRevision } from './browser-image-changes.ts';
import { perf } from './perf-diagnostics.ts';

const REGISTRY_KEY = 'tg-bank-workspaces-v1';
const ACTIVE_BANK_KEY = 'tg-active-bank-id-v1';
const BANK_KEY_PREFIX = 'tg-bank';

export const DEFAULT_BANK_ID = 'default';
/** Bank-scoped keys whose content a workspace folder stores. */
const FOLDER_CONTENT_KEYS = new Set(['math-test-bank-v2', 'tg-narratives-v1', 'math-test-custom-classes-v1']);
const DEFAULT_GIT_REPO_ID = 'test-generator-bank';

const ACTIVE_LOCAL_STORAGE_KEYS = [
  'math-test-bank-v2',
  'tg-narratives-v1',
  'math-test-custom-classes-v1',
  'tg-bank-class-membership-v1',
  'tg-test-library-v1',
  'tg-test-draft-v1',
  'tg-git-last-repo-manifest-generated-at-v1',
  'tg-git-remotes-v1',
  'tg-sync-manifest-v1',
  'tg-sync-enabled-providers-v1',
  'tg-sync-restore-provider-v1',
  'tg-google-drive-folder-id-v1',
  'tg-google-drive-folder-name-v1',
  'tg-google-drive-folder-url-v1',
  'math-test-last-class-id-v1',
  'ingest-draft',
] as const;

const ACTIVE_LOCAL_STORAGE_PREFIXES = [
  'tg-last-sync-',
] as const;

// Inactive banks' snapshots live in IndexedDB: localStorage's ~5 MB quota cannot
// hold several question banks. Only the active bank stays in localStorage.
const SNAPSHOT_DB_NAME = 'test-generator-bank-snapshots';
const SNAPSHOT_DB_VERSION = 1;
const SNAPSHOT_STORE = 'snapshots';


export interface BankWorkspace {
  id: string;
  name: string;
  gitRepoId: string;
  createdAt: number;
  updatedAt: number;
}

type SnapshotRecord = { key: string; bankId: string; name: string; value: string };

type BankImageRecord = {
  id: string;
  bankId: string;
  image: {
    name: string;
    ext: string;
    mime: string;
    size: number;
    bytes: Uint8Array;
  };
};

/**
 * A store holding the active bank's state in memory. `prepare` may read the
 * incoming bank asynchronously; `apply` must switch synchronously so no edit
 * can land between the storage swap and the in-memory swap.
 */
export interface BankSwitchParticipant<T = unknown> {
  /** Finish or flush outgoing work (for example, pending saves). Throw to keep the current bank. */
  beforeLeave?(bankId: string): Promise<void> | void;
  prepare?(bankId: string): Promise<T>;
  apply(bankId: string, prepared: T): void;
  /** Background follow-up after the switch, such as reloading image metadata. */
  after?(bankId: string): Promise<void> | void;
}

class BankWorkspaceStore {
  // Plain fields plus change notifications keep this module usable outside
  // Svelte (Node tests); `bank-switch-view.svelte.ts` mirrors them for the UI.
  #banks: BankWorkspace[] = [];
  #activeBankId = '';
  #switching = false;
  #switchPhase: string | null = null;
  #switchError: string | null = null;
  #listeners = new Set<() => void>();
  get banks(): BankWorkspace[] { return this.#banks; }
  set banks(value: BankWorkspace[]) { this.#banks = value; this.#notify(); }
  get activeBankId(): string { return this.#activeBankId; }
  set activeBankId(value: string) { this.#activeBankId = value; this.#notify(); }
  get switching(): boolean { return this.#switching; }
  set switching(value: boolean) { this.#switching = value; this.#notify(); }
  /** Visible progress for the current switch, or null. */
  get switchPhase(): string | null { return this.#switchPhase; }
  set switchPhase(value: string | null) { this.#switchPhase = value; this.#notify(); }
  get switchError(): string | null { return this.#switchError; }
  set switchError(value: string | null) { this.#switchError = value; this.#notify(); }
  subscribe(listener: () => void): () => void { this.#listeners.add(listener); return () => this.#listeners.delete(listener); }
  #notify(): void { for (const listener of this.#listeners) listener(); }
  #participants: BankSwitchParticipant<any>[] = [];
  #target: string | null = null;
  #switchRun: Promise<void> | null = null;
  /** Active image payload revision when the active bank's images were last copied or restored. */
  #imagesCleanAt: { bankId: string; revision: string } | null = null;
  /** Settles once legacy localStorage snapshots have moved to IndexedDB. */
  #ready: Promise<void>;
  /** The outgoing bank's image backup, written after a switch rather than during it. */
  #imageBackup: Promise<void> = Promise.resolve();
  /**
   * Which bank's copy of each image is mounted, for images mounted under a bank's
   * own names while sharing. Banks can use the same name for different images.
   */
  #mountedFrom = new Map<string, string>();
  /**
   * True while a workspace keeps every bank's images mounted together. A switch
   * then only adds what the incoming bank lacks instead of replacing them all.
   * Set by the workspace.
   */
  imagesShared: () => boolean = () => false;

  constructor() {
    this.#ready = migrateLocalStorageSnapshots().catch((error) => {
      console.error('Could not move bank snapshots out of localStorage', error);
    });
    this.#ensureInitialized();
  }

  get activeBank(): BankWorkspace {
    return this.banks.find((bank) => bank.id === this.activeBankId) ?? this.banks[0] ?? createDefaultBank();
  }

  /** Register a store that must follow the active bank. */
  participate<T>(participant: BankSwitchParticipant<T>): void {
    this.#participants.push(participant);
  }

  async createBank(name: string): Promise<void> {
    const trimmed = name.trim() || 'Untitled Bank';
    const now = Date.now();
    const id = makeBankId(trimmed, now);
    this.banks = [...this.banks, { id, name: trimmed, gitRepoId: `${DEFAULT_GIT_REPO_ID}-${id}`, createdAt: now, updatedAt: now }];
    this.#saveRegistry();
    await this.switchBank(id);
    if (this.activeBankId !== id) {
      // Keep the registry free of a bank that never became usable.
      this.banks = this.banks.filter(bank => bank.id !== id);
      this.#saveRegistry();
    }
  }

  /**
   * Switch banks without reloading the app. Requests made while a switch runs
   * replace its destination; the last one wins. On failure the outgoing bank
   * stays active and usable, and `switchError` explains why.
   */
  switchBank(id: string): Promise<void> {
    if (!this.banks.some((bank) => bank.id === id)) return Promise.resolve();
    this.#target = id;
    if (this.#switchRun) return this.#switchRun;
    if (id === this.activeBankId) { this.#target = null; return Promise.resolve(); }
    const run = (async () => {
      this.switching = true;
      this.switchError = null;
      try {
        while (this.#target && this.#target !== this.activeBankId) {
          const target = this.#target;
          try { await this.#transition(target); }
          catch (error) {
            this.switchError = error instanceof Error ? error.message : String(error);
            if (this.#target === target) break;
          }
        }
      } finally {
        this.#target = null;
        this.switching = false;
        this.switchPhase = null;
        this.#switchRun = null;
      }
    })();
    this.#switchRun = run;
    return run;
  }

  async #transition(targetId: string): Promise<void> {
    const outgoing = this.activeBank;
    const next = this.banks.find((bank) => bank.id === targetId);
    if (!next) return;
    const total = perf.start('Bank switch: total');
    await this.#ready;
    this.switchPhase = `Saving ${outgoing.name}`;
    let phase = perf.start('Bank switch: flush outgoing');
    for (const participant of this.#participants) await participant.beforeLeave?.(outgoing.id);
    phase();

    // Read everything the incoming bank needs before touching live state.
    this.switchPhase = `Loading ${next.name}`;
    phase = perf.start('Bank switch: read incoming');
    await this.#imageBackup;
    const imagesChanged = !this.#imagesClean(outgoing.id);
    const [snapshot, stored, prepared] = await Promise.all([
      this.#readSnapshot(next.id),
      this.#readSnapshot(outgoing.id),
      Promise.all(this.#participants.map((participant) => participant.prepare?.(next.id))),
    ]);
    phase();
    phase = perf.start('Bank switch: images');
    await this.#swapImages(outgoing.id, next.id);
    phase();

    // Synchronous swap: capture the outgoing bank's latest values, install the
    // incoming bank's, and move every store over in one task.
    phase = perf.start('Bank switch: swap');
    const storage = getLocalStorage();
    const keys = new Set(bankStorageKeys());
    for (const key of snapshot.keys()) if (ACTIVE_LOCAL_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))) keys.add(key);
    const outgoingValues: Array<[string, string | null]> = bankStorageKeys().map((key) => [key, storage?.getItem(key) ?? null]);
    try {
      for (const key of keys) storage?.removeItem(key);
      for (const key of keys) { const value = snapshot.get(key); if (value !== undefined) storage?.setItem(key, value); }
    } catch (error) {
      // Quota or storage failure: put the outgoing bank back exactly.
      for (const key of keys) storage?.removeItem(key);
      for (const [key, value] of outgoingValues) if (value !== null) storage?.setItem(key, value);
      await this.#swapImages(next.id, outgoing.id).catch(() => undefined);
      throw new Error(`Could not load ${next.name} into this browser: ${error instanceof Error ? error.message : String(error)}`);
    }
    const differing = outgoingValues.filter(([key, value]) => (stored.get(key) ?? null) !== value);
    if (differing.length) this.#pendingOutgoing.set(outgoing.id, outgoingValues);
    // The timestamp tells the workspace folder to export the bank again, so only
    // content it exports moves it; view preferences alone do not.
    const changed = imagesChanged || differing.some(([key]) => FOLDER_CONTENT_KEYS.has(key));
    this.activeBankId = next.id;
    setLocalStorageItem(ACTIVE_BANK_KEY, next.id);
    for (const [index, participant] of this.#participants.entries()) participant.apply(next.id, prepared[index]);
    phase();

    // Store the outgoing bank's latest values. They stay in memory (and are
    // used if the bank is reopened) until the write succeeds.
    this.switchPhase = `Saving ${outgoing.name}`;
    await this.#flushPendingOutgoing();
    if (changed) {
      const now = Date.now();
      this.banks = this.banks.map((bank) => bank.id === outgoing.id ? { ...bank, updatedAt: now } : bank);
      this.#saveRegistry();
    }
    this.switchPhase = null;
    total();
    for (const participant of this.#participants) void Promise.resolve(participant.after?.(next.id)).catch((error) => console.error(error));
  }

  #pendingOutgoing = new Map<string, Array<[string, string | null]>>();
  /** A bank's stored values, overlaid with any not yet written from this tab. */
  async #readSnapshot(bankId: string): Promise<Map<string, string>> {
    const snapshot = await readSnapshotValues(bankId);
    for (const [key, value] of this.#pendingOutgoing.get(bankId) ?? []) { if (value === null) snapshot.delete(key); else snapshot.set(key, value); }
    return snapshot;
  }
  async #flushPendingOutgoing(): Promise<void> {
    for (const [bankId, values] of [...this.#pendingOutgoing]) {
      try {
        await writeSnapshotValues(bankId, values);
        if (this.#pendingOutgoing.get(bankId) === values) this.#pendingOutgoing.delete(bankId);
      } catch (error) {
        throw new Error(`The previous bank's latest changes are kept in this tab but could not be stored yet (${error instanceof Error ? error.message : String(error)}). Keep this tab open and try switching again.`);
      }
    }
  }

  #imagesClean(bankId: string): boolean {
    return this.#imagesCleanAt?.bankId === bankId && this.#imagesCleanAt.revision === browserImageRevision();
  }

  /** Swap the active image store, copying outgoing images only when they changed. */
  async #swapImages(outgoingId: string, incomingId: string): Promise<void> {
    if (this.imagesShared()) return this.#addSharedImages(outgoingId, incomingId);
    const database = await openImageDb().catch(() => null);
    if (!database) return;
    try {
      const clean = this.#imagesClean(outgoingId);
      if (!clean) {
        const images = await request<Array<BankImageRecord['image']>>(database.transaction(IMAGE_STORE, 'readonly').objectStore(IMAGE_STORE).getAll());
        const tx = database.transaction(BANK_IMAGE_STORE, 'readwrite');
        const store = tx.objectStore(BANK_IMAGE_STORE);
        await deleteBankImages(store, outgoingId);
        for (const image of images) store.put({ id: bankImageId(outgoingId, image.name), bankId: outgoingId, image } satisfies BankImageRecord);
        await transactionDone(tx);
        perf.count('Bank switch: outgoing image sets copied');
      } else perf.count('Bank switch: outgoing image copies skipped (unchanged)');
      const incoming = await readBankImages(database, incomingId);
      await replaceActiveImages(database, incoming.map((record) => record.image));
      this.#imagesCleanAt = { bankId: incomingId, revision: browserImageRevision() };
    } finally {
      database.close();
    }
  }

  /**
   * Workspace switch: every bank's images are already mounted, so add only what
   * the incoming bank lacks. The outgoing bank's own images stay mounted and are
   * backed up after the switch.
   */
  async #addSharedImages(outgoingId: string, incomingId: string): Promise<void> {
    const database = await openImageDb().catch(() => null);
    if (!database) return;
    try {
      if (!this.#imagesClean(outgoingId)) {
        const storage = getLocalStorage();
        const parse = <T>(key: string): T[] => { try { return JSON.parse(storage?.getItem(key) ?? '[]') ?? []; } catch { return []; } };
        const questions = parse<Question>('math-test-bank-v2');
        const narratives = parse<NonNullable<RepoAppData['narratives']>[number]>('tg-narratives-v1');
        this.#imageBackup = this.#backUpImages(outgoingId, questions, narratives)
          .catch((error) => console.error('Could not back up the previous bank\'s images', error));
      } else perf.count('Bank switch: outgoing image copies skipped (unchanged)');
      const tx = database.transaction([IMAGE_META_STORE, BANK_IMAGE_STORE], 'readonly');
      const index = tx.objectStore(BANK_IMAGE_STORE).index('bankId');
      const [active, outgoing, incoming] = await Promise.all([
        request<IDBValidKey[]>(tx.objectStore(IMAGE_META_STORE).getAllKeys()),
        request<IDBValidKey[]>(index.getAllKeys(outgoingId)),
        request<IDBValidKey[]>(index.getAllKeys(incomingId)),
      ]);
      const mounted = new Set(active.map(String));
      const nameOf = (bankId: string, id: IDBValidKey) => String(id).slice(bankId.length + 1);
      // The outgoing bank's images are mounted as it last saw them.
      for (const id of outgoing) if (mounted.has(nameOf(outgoingId, id))) this.#mountedFrom.set(nameOf(outgoingId, id), outgoingId);
      const missing = incoming.filter((id) => this.#mountedFrom.get(nameOf(incomingId, id)) !== incomingId || !mounted.has(nameOf(incomingId, id)));
      for (const id of incoming) this.#mountedFrom.set(nameOf(incomingId, id), incomingId);
      if (missing.length) {
        const store = database.transaction(BANK_IMAGE_STORE, 'readonly').objectStore(BANK_IMAGE_STORE);
        const records = await Promise.all(missing.map((id) => request<BankImageRecord | undefined>(store.get(id))));
        const write = database.transaction([IMAGE_STORE, IMAGE_META_STORE], 'readwrite');
        for (const record of records) if (record) putImage(write, record.image);
        await transactionDone(write);
      }
      perf.count('Bank switch: shared images added', missing.length);
      this.#imagesCleanAt = { bankId: incomingId, revision: browserImageRevision() };
    } finally {
      database.close();
    }
  }

  /** Replace a bank's image backup with the mounted images its own content uses. */
  async #backUpImages(bankId: string, questions: Question[], narratives: NonNullable<RepoAppData['narratives']>): Promise<void> {
    const database = await openImageDb();
    try {
      const meta = await request<ImageMeta[]>(database.transaction(IMAGE_META_STORE, 'readonly').objectStore(IMAGE_META_STORE).getAll());
      const own = contentImages(questions, narratives, meta as unknown as RepoDataImage[]);
      const read = database.transaction(IMAGE_STORE, 'readonly').objectStore(IMAGE_STORE);
      const images = await Promise.all(own.map((image) => request<BankImageRecord['image']>(read.get(image.name))));
      const tx = database.transaction(BANK_IMAGE_STORE, 'readwrite');
      const store = tx.objectStore(BANK_IMAGE_STORE);
      await deleteBankImages(store, bankId);
      for (const image of images) if (image) store.put({ id: bankImageId(bankId, image.name), bankId, image } satisfies BankImageRecord);
      await transactionDone(tx);
      perf.count('Bank switch: outgoing image sets copied');
    } finally {
      database.close();
    }
  }

  /** Persist the live browser data into the active bank's scoped snapshot. */
  async saveActiveSnapshot(): Promise<void> {
    await this.#saveActiveSnapshot();
  }

  /** Keep the active bank's pre-migration data alongside untouched inactive copies. */
  async preserveLegacyValue(key: string, value: string): Promise<void> {
    await this.#ready;
    await writeSnapshotValues(this.activeBankId, [[key, value]]);
  }

  /** Legacy bank values remain available for migration and cross-bank test selection. */
  async readOtherBankValues(key: string): Promise<string[]> {
    await this.#ready;
    const values: string[] = [];
    for (const bank of this.banks) {
      if (bank.id === this.activeBankId) continue;
      const value = (await this.#readSnapshot(bank.id)).get(key);
      if (value) values.push(value);
    }
    return values;
  }

  /** Gradebook can administer a saved test from any bank, using its source questions. */
  async readOtherBankTests(): Promise<SavedTest[]> {
    await this.#ready;
    // Workspace tests are already shared; legacy bank copies may include deleted tests.
    if (getLocalStorageItem(WORKSPACE_MODE_KEY)) return [];
    const tests: SavedTest[] = [];
    for (const bank of this.banks) {
      if (bank.id === this.activeBankId) continue;
      const snapshot = await this.#readSnapshot(bank.id);
      const saved = JSON.parse(snapshot.get('tg-test-library-v1') ?? '[]') as SavedTest[];
      const questions = JSON.parse(snapshot.get('math-test-bank-v2') ?? '[]') as Question[];
      for (const test of saved) tests.push({
        ...test,
        questionSnapshots: test.questionSnapshots ?? questions.filter(question => test.config.selectedIds.includes(question.id)),
      });
    }
    return tests;
  }

  /**
   * Read a bank's stored snapshot without switching to it, so every bank can be
   * kept current in the workspace folder rather than only the active one.
   * Returns null when the bank has no snapshot yet.
   */
  async readBankSnapshot(bankId: string): Promise<RepoAppData | null> {
    if (bankId === this.activeBankId) return null; // callers use live browser data instead
    await this.#ready;
    await this.#imageBackup;
    const snapshot = await this.#readSnapshot(bankId);
    const read = <T>(key: string, fallback: T): T => {
      const raw = snapshot.get(key) ?? null;
      if (raw === null) return fallback;
      try {
        return (JSON.parse(raw) as T) ?? fallback;
      } catch {
        return fallback;
      }
    };

    const questions = read<RepoAppData['questions']>('math-test-bank-v2', []);
    const narratives = read<RepoAppData['narratives']>('tg-narratives-v1', []);
    const customClasses = read<RepoAppData['customClasses']>('math-test-custom-classes-v1', []);
    if (!snapshot.has('math-test-bank-v2')) return null;

    const database = await openImageDb().catch(() => null);
    let images: RepoAppData['images'] = [];
    if (database) {
      try {
        const records = await readBankImages(database, bankId).catch(() => []);
        images = records.map((record) => ({ ...record.image, bytes: new Uint8Array(record.image.bytes) }));
      } finally {
        database.close();
      }
    }

    return { questions, narratives, customClasses, savedTests: [], images };
  }

  /**
   * Overwrite one question in a bank that is not active, without switching to it. The bank's
   * snapshot timestamp moves forward so the workspace folder saves it on its next pass.
   */
  async updateDormantQuestion(bankId: string, questionId: string, update: (current: Question) => Partial<Omit<Question, 'id' | 'createdAt'>>): Promise<void> {
    if (bankId === this.activeBankId) throw new Error('Use the live bank for the active bank.');
    await this.#ready;
    await this.#flushPendingOutgoing();
    const snapshot = await this.#readSnapshot(bankId);
    const raw = snapshot.get('math-test-bank-v2');
    if (raw === undefined) throw new Error('That bank has no stored questions.');
    const questions = JSON.parse(raw) as Question[];
    const index = questions.findIndex((question) => question.id === questionId);
    if (index === -1) throw new Error('The original question is no longer in its bank.');
    questions[index] = { ...questions[index], ...update(questions[index]), id: questionId, createdAt: questions[index].createdAt, updatedAt: Date.now() };
    await writeSnapshotValues(bankId, [['math-test-bank-v2', JSON.stringify(questions)]]);
    const now = Date.now();
    this.banks = this.banks.map((bank) => (bank.id === bankId ? { ...bank, updatedAt: now } : bank));
    this.#saveRegistry();
  }

  /**
   * Add a new question to a bank that is not active, without switching to it.
   * The pictures it uses and any class it needs that the bank lacks go with it.
   * The bank's timestamp moves forward so the workspace folder saves it.
   */
  async addDormantQuestion(bankId: string, data: Omit<Question, 'id' | 'createdAt'>, extras: { images: ImagePayload[]; customClasses: Class[] }): Promise<Question> {
    if (bankId === this.activeBankId) throw new Error('Use the live bank for the active bank.');
    if (!this.banks.some((bank) => bank.id === bankId)) throw new Error('That bank no longer exists.');
    await this.#ready;
    await this.#flushPendingOutgoing();
    const snapshot = await this.#readSnapshot(bankId);
    const parse = <T>(key: string): T[] => { try { return JSON.parse(snapshot.get(key) ?? '[]') ?? []; } catch { return []; } };
    const question: Question = { ...data, id: createId('question'), createdAt: Date.now() };
    const questions = [...parse<Question>('math-test-bank-v2'), question];
    const classes = parse<Class>('math-test-custom-classes-v1');
    const missing = extras.customClasses.filter((cls) => !classes.some((existing) => existing.id === cls.id));
    const values: Array<[string, string | null]> = [['math-test-bank-v2', JSON.stringify(questions)]];
    if (missing.length) values.push(['math-test-custom-classes-v1', JSON.stringify([...classes, ...missing])]);
    if (extras.images.length) {
      const database = await openImageDb();
      try {
        const read = database.transaction(BANK_IMAGE_STORE, 'readonly').objectStore(BANK_IMAGE_STORE);
        const existing = await Promise.all(extras.images.map((image) => request<BankImageRecord | undefined>(read.get(bankImageId(bankId, image.name)))));
        const same = (a: Uint8Array, b: Uint8Array) => a.byteLength === b.byteLength && a.every((byte, index) => byte === b[index]);
        const clash = extras.images.find((image, index) => existing[index] && !same(new Uint8Array(existing[index]!.image.bytes), new Uint8Array(image.bytes)));
        if (clash) throw new Error(`That bank already has a different picture named “${clash.name}”. Rename the picture in the Image library, then save again.`);
        const tx = database.transaction(BANK_IMAGE_STORE, 'readwrite');
        const store = tx.objectStore(BANK_IMAGE_STORE);
        extras.images.forEach((image, index) => { if (!existing[index]) store.put({ id: bankImageId(bankId, image.name), bankId, image } satisfies BankImageRecord); });
        await transactionDone(tx);
      } finally { database.close(); }
    }
    await writeSnapshotValues(bankId, values);
    const now = Date.now();
    this.banks = this.banks.map((bank) => (bank.id === bankId ? { ...bank, updatedAt: now } : bank));
    this.#saveRegistry();
    return question;
  }

  /** Register folder banks without deleting unrelated browser banks or their backups. */
  async installFolderBanks(entries: Array<{ id: string; name: string; data: RepoAppData }>, onProgress?: (completed: number, total: number, name: string) => void): Promise<void> {
    onProgress?.(0, entries.length, 'Saving the current browser snapshot');
    await this.#ready;
    await this.#saveActiveSnapshot();
    let completed = 0;
    for (const entry of entries) {
      const now = Date.now();
      const existing = this.banks.find(bank => bank.id === entry.id);
      if (!existing) this.banks.push({ id: entry.id, name: entry.name, gitRepoId: `${DEFAULT_GIT_REPO_ID}-${entry.id}`, createdAt: now, updatedAt: now });
      // The folder is the source being installed, so its bank-name.json names the bank.
      else if (existing.name !== entry.name) this.banks = this.banks.map(bank => bank.id === entry.id ? { ...bank, name: entry.name } : bank);
      const values = {
        'math-test-bank-v2': entry.data.questions,
        'tg-narratives-v1': entry.data.narratives ?? [],
        'math-test-custom-classes-v1': entry.data.customClasses,
      };
      await writeSnapshotValues(entry.id, Object.entries(values).map(([key, value]) => [key, JSON.stringify(value)]));
      const db = await openImageDb();
      try {
        const tx = db.transaction(BANK_IMAGE_STORE, 'readwrite');
        const store = tx.objectStore(BANK_IMAGE_STORE);
        await deleteBankImages(store, entry.id);
        for (const image of entry.data.images ?? []) store.put({ id: bankImageId(entry.id, image.name), bankId: entry.id, image });
        await transactionDone(tx);
      } finally { db.close(); }
      onProgress?.(++completed, entries.length, entry.name);
    }
    if (entries.length) {
      const selected = entries.find(entry => entry.id === this.activeBankId) ?? entries[0];
      const bank = this.banks.find(bank => bank.id === selected.id)!;
      await this.#restoreSnapshot(bank);
      this.activeBankId = bank.id;
      setLocalStorageItem(ACTIVE_BANK_KEY, bank.id);
    }
    this.#saveRegistry();
  }

  /** Register newly discovered folders without restoring or reloading the active bank. */
  async registerNewFolderBanks(entries: Array<{ id: string; name: string; data: RepoAppData }>): Promise<void> {
    await this.#ready;
    for (const entry of entries) {
      if (this.banks.some(bank => bank.id === entry.id)) throw new Error(`Bank ${entry.id} already exists in this browser. Review the workspace before replacing it.`);
      const values = {
        'math-test-bank-v2': entry.data.questions,
        'tg-narratives-v1': entry.data.narratives ?? [],
        'math-test-custom-classes-v1': entry.data.customClasses,
      };
      await writeSnapshotValues(entry.id, Object.entries(values).map(([key, value]) => [key, JSON.stringify(value)]));
      const db = await openImageDb();
      try {
        const tx = db.transaction(BANK_IMAGE_STORE, 'readwrite');
        const store = tx.objectStore(BANK_IMAGE_STORE);
        for (const image of entry.data.images ?? []) store.put({ id: bankImageId(entry.id, image.name), bankId: entry.id, image });
        await transactionDone(tx);
      } finally { db.close(); }
      const now = Date.now();
      this.banks = [...this.banks, { id: entry.id, name: entry.name, gitRepoId: `${DEFAULT_GIT_REPO_ID}-${entry.id}`, createdAt: now, updatedAt: now }];
      this.#saveRegistry();
    }
  }

  renameActiveBank(name: string): void {
    const trimmed = name.trim();
    if (!trimmed) return;
    const now = Date.now();
    this.banks = this.banks.map((bank) =>
      bank.id === this.activeBankId ? { ...bank, name: trimmed, updatedAt: now } : bank,
    );
    this.#saveRegistry();
  }

  /** Drop banks whose workspace folders were removed. Their browser backups stay in storage. */
  forgetBanks(ids: string[]): void {
    const gone = new Set(ids.filter(id => id !== this.activeBankId));
    if (!gone.size) return;
    this.banks = this.banks.filter(bank => !gone.has(bank.id));
    this.#saveRegistry();
  }

  #ensureInitialized(): void {
    if (!hasBrowserStorage()) {
      const bank = createDefaultBank();
      this.banks = [bank];
      this.activeBankId = bank.id;
      return;
    }

    const registry = readRegistry();
    if (registry.length === 0) {
      const bank = createDefaultBank();
      this.banks = [bank];
      this.activeBankId = bank.id;
      writeRegistry(this.banks);
      setLocalStorageItem(ACTIVE_BANK_KEY, bank.id);
      void this.#ready.then(() => this.#copyActiveLocalStorageToBank(bank.id)).catch((error) => {
        console.error('Could not save the first bank snapshot', error);
      });
      void this.#saveActiveImages(bank.id);
      return;
    }

    this.banks = registry;
    const storedActive = getLocalStorageItem(ACTIVE_BANK_KEY);
    this.activeBankId = registry.some((bank) => bank.id === storedActive)
      ? storedActive as string
      : registry[0].id;
    setLocalStorageItem(ACTIVE_BANK_KEY, this.activeBankId);
  }

  async #saveActiveSnapshot(): Promise<void> {
    await this.#ready;
    const active = this.activeBank;
    await this.#copyActiveLocalStorageToBank(active.id);
    await this.#saveActiveImages(active.id);
    const now = Date.now();
    this.banks = this.banks.map((bank) =>
      bank.id === active.id ? { ...bank, updatedAt: now } : bank,
    );
    this.#saveRegistry();
  }

  async #restoreSnapshot(bank: BankWorkspace): Promise<void> {
    await this.#ready;
    await this.#copyBankLocalStorageToActive(bank.id);
    await this.#restoreActiveImages(bank.id);
  }

  async #copyActiveLocalStorageToBank(bankId: string): Promise<void> {
    const storage = getLocalStorage();
    if (!storage) return;
    await writeSnapshotValues(bankId, bankStorageKeys().map((key) => [key, storage.getItem(key)]));
  }

  async #copyBankLocalStorageToActive(bankId: string): Promise<void> {
    const storage = getLocalStorage();
    if (!storage) return;
    const snapshot = await readSnapshotValues(bankId);
    const keys = new Set(bankStorageKeys());
    // The bank's own sync markers, which the previous bank may not have had.
    for (const key of snapshot.keys()) {
      if (ACTIVE_LOCAL_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))) keys.add(key);
    }
    // Clear the outgoing bank (already saved by #saveActiveSnapshot) first, so
    // the incoming one never needs room for both in the localStorage quota.
    for (const key of keys) storage.removeItem(key);
    for (const key of keys) {
      const value = snapshot.get(key);
      if (value !== undefined) storage.setItem(key, value);
    }
  }

  async #saveActiveImages(bankId: string): Promise<void> {
    const revision = browserImageRevision();
    if (this.#imagesCleanAt?.bankId === bankId && this.#imagesCleanAt.revision === revision) return;
    const database = await openImageDb().catch(() => null);
    if (!database) return;
    try {
      const images = await request<Array<BankImageRecord['image']>>(
        database.transaction(IMAGE_STORE, 'readonly').objectStore(IMAGE_STORE).getAll(),
      ).catch(() => []);
      const tx = database.transaction(BANK_IMAGE_STORE, 'readwrite');
      const store = tx.objectStore(BANK_IMAGE_STORE);
      await deleteBankImages(store, bankId);
      for (const image of images) {
        store.put({
          id: bankImageId(bankId, image.name),
          bankId,
          image: { ...image, bytes: new Uint8Array(image.bytes) },
        } satisfies BankImageRecord);
      }
      await transactionDone(tx);
      this.#imagesCleanAt = { bankId, revision };
    } finally {
      database.close();
    }
  }

  async #restoreActiveImages(bankId: string): Promise<void> {
    const database = await openImageDb().catch(() => null);
    if (!database) return;
    try {
      await replaceActiveImages(database, (await readBankImages(database, bankId)).map((record) => record.image));
      this.#imagesCleanAt = { bankId, revision: browserImageRevision() };
    } finally {
      database.close();
    }
  }

  #saveRegistry(): void {
    writeRegistry(this.banks);
  }

}

export const bankWorkspaces = new BankWorkspaceStore();

export function getActiveBankGitRepoId(): string {
  return bankWorkspaces.activeBank.gitRepoId || DEFAULT_GIT_REPO_ID;
}

export function getActiveBankName(): string {
  return bankWorkspaces.activeBank.name || 'Local Bank';
}

function createDefaultBank(): BankWorkspace {
  const now = Date.now();
  return {
    id: DEFAULT_BANK_ID,
    name: 'Local Bank',
    gitRepoId: DEFAULT_GIT_REPO_ID,
    createdAt: now,
    updatedAt: now,
  };
}

function readRegistry(): BankWorkspace[] {
  try {
    const parsed = JSON.parse(getLocalStorageItem(REGISTRY_KEY) ?? '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is Partial<BankWorkspace> => Boolean(entry) && typeof entry === 'object')
      .map((entry) => ({
        id: sanitizeBankId(String(entry.id ?? '')),
        name: typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim() : 'Untitled Bank',
        gitRepoId: sanitizeRepoId(String(entry.gitRepoId ?? '')) || DEFAULT_GIT_REPO_ID,
        createdAt: typeof entry.createdAt === 'number' ? entry.createdAt : Date.now(),
        updatedAt: typeof entry.updatedAt === 'number' ? entry.updatedAt : Date.now(),
      }))
      .filter((entry) => entry.id);
  } catch {
    return [];
  }
}

function writeRegistry(banks: BankWorkspace[]): void {
  setLocalStorageItem(REGISTRY_KEY, JSON.stringify(banks));
}

function bankStorageKeys(): string[] {
  const keys = new Set<string>(ACTIVE_LOCAL_STORAGE_KEYS);
  const storage = getLocalStorage();
  if (!storage) return [...keys];
  // While a root workspace is connected, these belong to the workspace, not a bank.
  // Legacy scoped copies remain intact for recovery; never silently merge student data.
  if (storage.getItem(WORKSPACE_MODE_KEY)) for (const key of WORKSPACE_SHARED_KEYS) keys.delete(key);
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key) continue;
    if (ACTIVE_LOCAL_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
      keys.add(key);
    }
  }
  return [...keys];
}

function scopedBankKey(bankId: string, key: string): string {
  return `${BANK_KEY_PREFIX}:${bankId}:${key}`;
}

/**
 * One bank's scoped values (tests, remotes, sync markers, …) by unscoped key.
 * Falls back to legacy localStorage copies where IndexedDB is unavailable.
 */
async function readSnapshotValues(bankId: string): Promise<Map<string, string>> {
  const values = new Map<string, string>();
  const database = await openSnapshotDatabase().catch(() => null);
  if (database) {
    try {
      const index = database.transaction(SNAPSHOT_STORE, 'readonly').objectStore(SNAPSHOT_STORE).index('bankId');
      for (const record of await request<SnapshotRecord[]>(index.getAll(bankId))) values.set(record.name, record.value);
    } finally {
      database.close();
    }
  }
  const storage = getLocalStorage();
  const prefix = scopedBankKey(bankId, '');
  for (let index = 0; storage && index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith(prefix) && !values.has(key.slice(prefix.length))) {
      values.set(key.slice(prefix.length), storage.getItem(key) ?? '');
    }
  }
  return values;
}

/** Store (or, for null, delete) scoped values for one bank in a single transaction. */
async function writeSnapshotValues(bankId: string, entries: Array<[string, string | null]>): Promise<void> {
  const database = await openSnapshotDatabase().catch(() => null);
  if (!database) {
    for (const [name, value] of entries) {
      if (value === null) getLocalStorage()?.removeItem(scopedBankKey(bankId, name));
      else setLocalStorageItem(scopedBankKey(bankId, name), value);
    }
    return;
  }
  try {
    const tx = database.transaction(SNAPSHOT_STORE, 'readwrite');
    const store = tx.objectStore(SNAPSHOT_STORE);
    for (const [name, value] of entries) {
      const key = scopedBankKey(bankId, name);
      if (value === null) store.delete(key);
      else store.put({ key, bankId, name, value } satisfies SnapshotRecord);
    }
    await transactionDone(tx);
  } finally {
    database.close();
  }
  // Any legacy copy is now superseded.
  for (const [name] of entries) getLocalStorage()?.removeItem(scopedBankKey(bankId, name));
}

/**
 * Move every legacy `tg-bank:<id>:<key>` localStorage value into IndexedDB.
 * localStorage copies are removed only after the IndexedDB transaction commits.
 */
async function migrateLocalStorageSnapshots(): Promise<void> {
  const storage = getLocalStorage();
  if (!storage) return;
  const legacy: SnapshotRecord[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    const match = key?.match(/^tg-bank:([^:]+):(.+)$/);
    if (key && match) legacy.push({ key, bankId: match[1], name: match[2], value: storage.getItem(key) ?? '' });
  }
  if (!legacy.length) return;
  const database = await openSnapshotDatabase();
  try {
    const tx = database.transaction(SNAPSHOT_STORE, 'readwrite');
    const store = tx.objectStore(SNAPSHOT_STORE);
    for (const record of legacy) store.put(record);
    await transactionDone(tx);
  } finally {
    database.close();
  }
  for (const record of legacy) storage.removeItem(record.key);
}

function openSnapshotDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB is unavailable.'));
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(SNAPSHOT_DB_NAME, SNAPSHOT_DB_VERSION);
    open.onupgradeneeded = () => {
      const store = open.result.createObjectStore(SNAPSHOT_STORE, { keyPath: 'key' });
      store.createIndex('bankId', 'bankId');
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
}

function makeBankId(name: string, now: number): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 36) || 'bank';
  return sanitizeBankId(`${slug}-${now.toString(36)}`);
}

function sanitizeBankId(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

function sanitizeRepoId(value: string): string {
  return value.trim().replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

function bankImageId(bankId: string, imageName: string): string {
  return `${bankId}:${imageName}`;
}

function hasBrowserStorage(): boolean {
  return Boolean(getLocalStorage());
}

function getLocalStorage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function getLocalStorageItem(key: string): string | null {
  return getLocalStorage()?.getItem(key) ?? null;
}

function setLocalStorageItem(key: string, value: string): void {
  getLocalStorage()?.setItem(key, value);
}

function readBankImages(database: IDBDatabase, bankId: string): Promise<BankImageRecord[]> {
  const store = database.transaction(BANK_IMAGE_STORE, 'readonly').objectStore(BANK_IMAGE_STORE);
  const index = store.index('bankId');
  return request<BankImageRecord[]>(index.getAll(bankId));
}

function deleteBankImages(store: IDBObjectStore, bankId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const index = store.index('bankId');
    const cursorRequest = index.openKeyCursor(IDBKeyRange.only(bankId));
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) {
        resolve();
        return;
      }
      store.delete(cursor.primaryKey);
      cursor.continue();
    };
    cursorRequest.onerror = () => reject(cursorRequest.error);
  });
}

function request<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted.'));
  });
}
