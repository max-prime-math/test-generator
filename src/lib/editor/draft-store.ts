/**
 * Editor drafts, one IndexedDB record per (bank, draft).
 *
 * Durability: every change is first written synchronously to a small
 * per-bank localStorage journal holding only changes not yet in IndexedDB,
 * so navigation and refresh never lose an edit. The journal is folded into
 * IndexedDB shortly after, and each entry is removed only if it was not
 * changed again while that write ran.
 *
 * Migration (schema 2): the legacy whole-session blob `tg-editor-v1:<bank>` is
 * copied in a single transaction, verified by reading it back, and only then
 * removed. An interrupted migration leaves the blob in place and reruns.
 */
import { emptyDefaults, type EditorDefaults, type EditorDraft } from './editor-model.ts';
import { draftKey, loadSession, type EditorSession } from './editor-drafts.ts';

const DB_NAME = 'test-generator-drafts';
const DB_VERSION = 1;
const DRAFTS = 'drafts';
const SESSIONS = 'sessions';
export const SCHEMA_VERSION = 2;
export function journalKey(bankId: string): string { return `tg-editor-journal-v2:${bankId}`; }

interface DraftRecord { bankId: string; id: string; order: number; draft: EditorDraft; /** Set while in the Recycle bin. */ deletedAt?: number }
interface SessionRecord { bankId: string; schema: number; defaults: EditorDefaults; activeId: string | null; migratedFrom?: string }
interface Meta { defaults: EditorDefaults; activeId: string | null }
interface Journal { v: 2; meta?: Meta; put: Record<string, { order: number; draft: EditorDraft; deletedAt?: number }>; del: string[] }

/** Deleted drafts stay restorable this long, then are removed on the next load. */
export const RECYCLE_BIN_DAYS = 30;
export interface TrashedDraft { draft: EditorDraft; deletedAt: number; order: number }

export interface LoadedDrafts { session: EditorSession; orders: Map<string, number>; migrated: boolean; trash: TrashedDraft[] }

export function openDraftDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB is unavailable.'));
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, DB_VERSION);
    open.onupgradeneeded = () => {
      open.result.createObjectStore(DRAFTS, { keyPath: ['bankId', 'id'] }).createIndex('bankId', 'bankId');
      open.result.createObjectStore(SESSIONS, { keyPath: 'bankId' });
    };
    open.onsuccess = () => { open.result.onversionchange = () => open.result.close(); resolve(open.result); };
    open.onerror = () => reject(open.error);
  });
}

function done(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error('Draft storage transaction aborted.'));
  });
}
function read<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
}

function readJournal(storage: Storage, bankId: string): Journal | null {
  const raw = storage.getItem(journalKey(bankId));
  if (!raw) return null;
  const parsed = JSON.parse(raw) as Journal;
  if (parsed?.v !== 2 || typeof parsed.put !== 'object' || !Array.isArray(parsed.del)) throw new Error('Unsaved Editor changes could not be read. The stored copy has been left intact.');
  return parsed;
}

/** Load a bank's drafts: migrate the legacy blob if needed, then apply unsaved journal entries. */
export async function loadDrafts(database: IDBDatabase, storage: Storage, bankId: string): Promise<LoadedDrafts> {
  let migrated = false;
  let session = await read<SessionRecord | undefined>(database.transaction(SESSIONS, 'readonly').objectStore(SESSIONS).get(bankId));
  const legacyKey = draftKey(bankId);
  if (!session) {
    // Throws on a corrupt legacy blob, leaving it untouched for recovery.
    const legacy = loadSession(storage, bankId);
    session = { bankId, schema: SCHEMA_VERSION, defaults: legacy.defaults, activeId: legacy.activeId, migratedFrom: storage.getItem(legacyKey) ? legacyKey : undefined };
    const tx = database.transaction([DRAFTS, SESSIONS], 'readwrite');
    legacy.drafts.forEach((draft, order) => tx.objectStore(DRAFTS).put({ bankId, id: draft.id, order, draft } satisfies DraftRecord));
    tx.objectStore(SESSIONS).put(session);
    await done(tx);
    const count = await read(database.transaction(DRAFTS, 'readonly').objectStore(DRAFTS).index('bankId').count(bankId));
    if (count < legacy.drafts.length) throw new Error(`Draft migration could not be verified (${count} of ${legacy.drafts.length}). Your drafts are kept in their original location.`);
    migrated = Boolean(session.migratedFrom);
  }
  // Verified copies exist in IndexedDB; the legacy blob only uses quota now.
  if (session.migratedFrom) storage.removeItem(session.migratedFrom);

  const records = await read<DraftRecord[]>(database.transaction(DRAFTS, 'readonly').objectStore(DRAFTS).index('bankId').getAll(bankId));
  const byId = new Map(records.map(record => [record.id, record]));
  let meta: Meta = { defaults: { ...emptyDefaults, ...session.defaults }, activeId: session.activeId };
  const journal = readJournal(storage, bankId);
  if (journal) {
    for (const id of journal.del) byId.delete(id);
    for (const [id, entry] of Object.entries(journal.put)) byId.set(id, { bankId, id, order: entry.order, draft: entry.draft, deletedAt: entry.deletedAt });
    if (journal.meta) meta = { defaults: { ...emptyDefaults, ...journal.meta.defaults }, activeId: journal.meta.activeId };
  }
  // Empty the Recycle bin of drafts deleted more than RECYCLE_BIN_DAYS ago.
  const cutoff = Date.now() - RECYCLE_BIN_DAYS * 86_400_000;
  const expired = [...byId.values()].filter(record => record.deletedAt !== undefined && record.deletedAt < cutoff);
  if (expired.length) {
    const tx = database.transaction(DRAFTS, 'readwrite');
    for (const record of expired) { tx.objectStore(DRAFTS).delete([bankId, record.id]); byId.delete(record.id); }
    await done(tx);
  }
  const sorted = [...byId.values()].sort((a, b) => a.order - b.order);
  const live = sorted.filter(record => record.deletedAt === undefined);
  return {
    session: { version: 1, drafts: live.map(record => record.draft), defaults: meta.defaults, activeId: live.some(record => record.id === meta.activeId) ? meta.activeId : null },
    orders: new Map(sorted.map(record => [record.id, record.order])),
    migrated,
    trash: sorted.filter(record => record.deletedAt !== undefined).map(record => ({ draft: record.draft, deletedAt: record.deletedAt!, order: record.order }))
      .sort((a, b) => b.deletedAt - a.deletedAt),
  };
}

/**
 * Pending changes for one bank. `record*` calls write the journal synchronously;
 * `flush` folds them into IndexedDB.
 */
export class DraftJournal {
  #put = new Map<string, { order: number; draft: EditorDraft; json: string; deletedAt?: number }>();
  #del = new Set<string>();
  #meta: Meta | null = null;
  constructor(private storage: Storage, readonly bankId: string, existing?: Journal | null) {
    for (const [id, entry] of Object.entries(existing?.put ?? {})) this.#put.set(id, { ...entry, json: JSON.stringify(entry.draft) });
    for (const id of existing?.del ?? []) this.#del.add(id);
    this.#meta = existing?.meta ?? null;
  }
  static resume(storage: Storage, bankId: string): DraftJournal { return new DraftJournal(storage, bankId, readJournal(storage, bankId)); }

  get size(): number { return this.#put.size + this.#del.size + (this.#meta ? 1 : 0); }

  /** `json` is the draft's serialized form, already computed by the caller for change detection. */
  put(draft: EditorDraft, order: number, json: string, deletedAt?: number): void {
    this.#del.delete(draft.id);
    this.#put.set(draft.id, { order, draft: JSON.parse(json), json, deletedAt });
    this.#write();
  }
  delete(id: string): void { this.#put.delete(id); this.#del.add(id); this.#write(); }
  meta(meta: Meta): void { this.#meta = JSON.parse(JSON.stringify(meta)); this.#write(); }

  #write(): void {
    if (!this.size) { this.storage.removeItem(journalKey(this.bankId)); return; }
    const put: Journal['put'] = {};
    for (const [id, entry] of this.#put) put[id] = { order: entry.order, draft: entry.draft, deletedAt: entry.deletedAt };
    this.storage.setItem(journalKey(this.bankId), JSON.stringify({ v: 2, meta: this.#meta ?? undefined, put, del: [...this.#del] } satisfies Journal));
  }

  /** Write pending changes to IndexedDB; entries changed during the write stay pending. */
  async flush(database: IDBDatabase): Promise<void> {
    if (!this.size) return;
    const puts = new Map(this.#put);
    const dels = new Set(this.#del);
    const meta = this.#meta;
    const tx = database.transaction([DRAFTS, SESSIONS], 'readwrite');
    for (const [id, entry] of puts) tx.objectStore(DRAFTS).put({ bankId: this.bankId, id, order: entry.order, draft: entry.draft, deletedAt: entry.deletedAt } satisfies DraftRecord);
    for (const id of dels) tx.objectStore(DRAFTS).delete([this.bankId, id]);
    if (meta) tx.objectStore(SESSIONS).put({ bankId: this.bankId, schema: SCHEMA_VERSION, defaults: meta.defaults, activeId: meta.activeId } satisfies SessionRecord);
    await done(tx);
    for (const [id, entry] of puts) if (this.#put.get(id) === entry) this.#put.delete(id);
    for (const id of dels) if (!this.#put.has(id)) this.#del.delete(id);
    if (this.#meta === meta) this.#meta = null;
    this.#write();
  }
}
