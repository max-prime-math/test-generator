// Question banks kept in step with the workspace folder's banks/, file by file.
//
// A bank folder keeps the repo layout other readers rely on. Its content files — one per
// question and narrative, the class list, each image, and bank-name.json — are records that
// merge one by one, like the Gradebook's (see gradebook-records.ts). Its index files and
// manifest are derived: rebuilt from the merged content and never merged, so their conflict
// copies do not matter.
//
// Rules:
//  - A record changed on one side only takes that side's version; changed on both, the newer
//    edit is kept and the other is offered for review.
//  - Removed only through deleted.json, written when the app deletes a question or narrative;
//    an edit made elsewhere wins over a deletion. A missing file, a half-synced file, or an
//    emptied browser removes nothing.
//  - Conflict copies made by a sync tool are merged like copies without shared history.
//  - Only the files whose content changed are written.
import { buildDerivedRepoEntries, exportAppDataToRepoEntries, hashRepoDataContent, repoDataContentByteLength, type RepoAppData } from '../git/repoDataModel.ts';
import { absorbEntries, isTombstone, mergeEntries, sameEntry, type Conflict, type Entries, type Entry } from './gradebook-records.ts';
import type { Class, Narrative, Question } from './types.ts';

export const NAME_FILE = 'bank-name.json';
export const TOMBSTONE_FILE = 'deleted.json';
const DERIVED = new Set(['README.md', 'questions/index.json', 'narratives/index.json', 'tests/index.json', 'manifest.json']);
/** A fixed time keeps the manifest a function of the content, so unchanged banks never look dirty. */
const GENERATED_AT = '2000-01-01T00:00:00.000Z';

/** A content file: questions/<id>.json, narratives/<id>.json, curriculum/custom-classes.json, images/<file>, bank-name.json. */
export function isRecordPath(path: string): boolean {
  return (/^questions\/[^/]+\.json$/.test(path) || /^narratives\/[^/]+\.json$/.test(path)) && !DERIVED.has(path)
    || path === 'curriculum/custom-classes.json' || /^images\/[^/]+$/.test(path) || path === NAME_FILE;
}
/** "questions/q1.json.conflict1" or "questions/q1 (1).json" → "questions/q1.json"; null if not a copy of a record. */
export function conflictCopyOf(path: string): string | null {
  const canonical = path.replace(/(\.[A-Za-z0-9]+)[ ._-]*conflict\d*$/i, '$1').replace(/[ ._-]*conflict\d*(?=\.[A-Za-z0-9]+$)/i, '').replace(/ \(\d+\)(?=\.[A-Za-z0-9]+$)/, '');
  return canonical !== path && isRecordPath(canonical) ? canonical : null;
}

type RecordValue = { hash: string; size: number; updatedAt: number; text?: string };
const valueOf = (entry: Entry | undefined): RecordValue | undefined => entry && !isTombstone(entry) ? entry.value as RecordValue : undefined;

function recordValue(path: string, content: string | Uint8Array): RecordValue {
  const value: RecordValue = { hash: hashRepoDataContent(content), size: repoDataContentByteLength(content), updatedAt: 0 };
  if (typeof content === 'string') {
    value.text = content;
    try {
      const parsed = JSON.parse(content) as { question?: Question; narrative?: Narrative };
      value.updatedAt = Number((parsed.question ?? parsed.narrative)?.updatedAt ?? 0) || 0;
    } catch { /* checked by the caller */ }
  }
  return value;
}

export interface LocalBank {
  name: string;
  data: RepoAppData;
  /** Records this app deleted (by path), not yet recorded in the folder. */
  deletions: Map<string, number>;
}

export interface LocalBanks {
  ids(): string[];
  /** Changes whenever this browser's copy of the bank changes. */
  signature(id: string): string;
  read(id: string): Promise<LocalBank | null>;
  /** Replace this browser's copy of a bank with the merged one (`isNew`: register it). */
  apply(id: string, name: string, data: RepoAppData, isNew: boolean): Promise<void>;
  settled(id: string, paths: string[]): void;
}

/** banks/<id>/ in the workspace folder. */
export interface BankIO {
  bankIds(): Promise<string[]>;
  /** A cheap signal that changes whenever the bank's files do (its manifest and name, and their copies). */
  quick(id: string): Promise<string>;
  list(id: string): Promise<Array<{ path: string; stamp: string }>>;
  read(id: string, path: string): Promise<string | Uint8Array | null>;
  write(id: string, path: string, content: string | Uint8Array): Promise<void>;
  remove(id: string, path: string): Promise<void>;
}

export interface BankState {
  base: Array<[string, Entry]>;
  seen: Record<string, { stamp: string; hash: string; size: number }>;
  quick: string;
  local: string;
  /** Conflict copies already merged, as "<path>@<stamp>". */
  absorbed?: string[];
}
export type BanksSyncState = Record<string, BankState>;

export interface BanksSyncResult {
  state: BanksSyncState;
  conflicts: Array<Conflict & { bankId: string }>;
  notices: string[];
  problems: string[];
  /** Banks whose browser copy changed. */
  applied: string[];
  wrote: string[];
}

/** Records of a bank as this browser holds it, in exactly the form the folder holds them. */
export function localRecords(bank: LocalBank): { entries: Entries; images: Map<string, Uint8Array> } {
  // A question can arrive before its image; the image follows on a later pass.
  const exported = exportAppDataToRepoEntries({ ...bank.data, savedTests: [] }, { generatedAt: GENERATED_AT, allowMissingReferences: true });
  const entries: Entries = new Map();
  const images = new Map<string, Uint8Array>();
  for (const entry of exported) {
    if (!isRecordPath(entry.path)) continue;
    entries.set(entry.path, { value: recordValue(entry.path, entry.content), file: entry.path });
    if (typeof entry.content !== 'string') images.set(entry.path, entry.content);
  }
  entries.set(NAME_FILE, { value: recordValue(NAME_FILE, JSON.stringify({ name: bank.name })), file: NAME_FILE });
  return { entries, images };
}

/** The bank's content from merged records; images come from `bytes`. */
export function dataFromRecords(entries: Entries, bytes: (path: string) => Uint8Array | undefined): { name: string; data: RepoAppData } {
  const questions: Question[] = [], narratives: Narrative[] = [];
  let customClasses: Class[] = [], name = '';
  const images: NonNullable<RepoAppData['images']> = [];
  for (const [path, entry] of entries) {
    const value = valueOf(entry);
    if (!value) continue;
    if (path === NAME_FILE) name = String(JSON.parse(value.text!).name ?? '');
    else if (path === 'curriculum/custom-classes.json') customClasses = JSON.parse(value.text!).classes ?? [];
    else if (path.startsWith('questions/')) questions.push(JSON.parse(value.text!).question);
    else if (path.startsWith('narratives/')) narratives.push(JSON.parse(value.text!).narrative);
    else if (path.startsWith('images/')) {
      const content = bytes(path);
      const file = path.slice('images/'.length);
      const dot = file.lastIndexOf('.');
      if (content) images.push({ name: file.slice(0, dot), ext: file.slice(dot + 1), bytes: content });
    }
  }
  return { name, data: { questions, narratives, customClasses, savedTests: [], images } };
}

export async function syncBanks(io: BankIO, local: LocalBanks, previous: BanksSyncState,
  options: { fullScan?: string | null; now?: number } = {}): Promise<BanksSyncResult> {
  const now = options.now ?? Date.now();
  const state: BanksSyncState = { ...previous };
  const result: BanksSyncResult = { state, conflicts: [], notices: [], problems: [], applied: [], wrote: [] };
  const folderIds = new Set(await io.bankIds());
  const localIds = new Set(local.ids());
  for (const id of new Set([...folderIds, ...localIds, ...Object.keys(previous)])) {
    try { await syncBank(id); } catch (error) { result.problems.push(`${id}: ${error instanceof Error ? error.message : String(error)}`); }
  }
  return result;

  async function syncBank(id: string) {
    const known = state[id];
    const inFolder = folderIds.has(id), inBrowser = localIds.has(id);
    if (!inFolder && !inBrowser) { delete state[id]; return; }
    if (!inFolder && known?.base.length && inBrowser) {
      // The folder held this bank and no longer does: never recreated or emptied automatically.
      result.notices.push(`The folder for bank “${id}” is missing from the workspace. This browser still has its questions; nothing was deleted.`);
      return;
    }
    const quick = inFolder ? await io.quick(id) : '';
    const signature = inBrowser ? local.signature(id) : '';
    const mine = inBrowser ? await local.read(id) : null;
    const pending = mine?.deletions.size ?? 0;
    if (known && known.quick === quick && known.local === signature && !pending && options.fullScan !== id) return;

    const base: Entries = new Map(known?.base ?? []);
    const seen: BankState['seen'] = { ...(known?.seen ?? {}) };
    // The folder's records: unchanged files come from what was seen before, changed ones are read.
    const remote: Entries = new Map();
    const unreadable = new Set<string>();
    const sources: Array<{ id: string; entries: Entries }> = [];
    const absorbed = [...(known?.absorbed ?? [])];
    const remoteBytes = new Map<string, Uint8Array>();
    const listing = inFolder ? await io.list(id) : [];
    const read = async (path: string) => {
      const content = await io.read(id, path);
      if (content === null) throw new Error('missing');
      if (typeof content === 'string' && path.endsWith('.json')) JSON.parse(content); // a half-synced file is not a version
      return content;
    };
    for (const { path, stamp } of listing) {
      const copyOf = conflictCopyOf(path);
      if (!isRecordPath(path) && !copyOf) continue;
      try {
        if (copyOf) {
          if (absorbed.includes(`${path}@${stamp}`)) continue;
          const content = await read(path);
          if (typeof content !== 'string') remoteBytes.set(copyOf, content);
          sources.push({ id: `${path}@${stamp}`, entries: new Map([[copyOf, { value: recordValue(copyOf, content), file: copyOf }]]) });
          continue;
        }
        const before = seen[path];
        const agreed = base.get(path);
        if (before && before.stamp === stamp && agreed && !isTombstone(agreed) && valueOf(agreed)!.hash === before.hash) { remote.set(path, agreed); continue; }
        const content = await read(path);
        if (typeof content !== 'string') remoteBytes.set(path, content);
        const value = recordValue(path, content);
        remote.set(path, { value, file: path });
        seen[path] = { stamp, hash: value.hash, size: value.size };
      } catch {
        if (!copyOf) unreadable.add(path);
      }
    }
    // Deletions recorded in the folder (deleted.json and any conflict copies of it). Each names the
    // version it deleted; a different version in the folder was written by a computer that had not
    // seen the deletion — an edit, which wins.
    const tombstones = new Map<string, { at: number; hash?: string }>();
    for (const { path } of listing) {
      if (!path.startsWith('deleted') || !path.includes('.json')) continue;
      try {
        for (const [key, raw] of Object.entries(JSON.parse(String(await io.read(id, path) ?? '{}')) as Record<string, number | { at: number; hash?: string }>)) {
          const record = typeof raw === 'number' ? { at: raw } : { at: Number(raw.at) || 0, hash: raw.hash };
          if (!tombstones.has(key) || record.at > tombstones.get(key)!.at) tombstones.set(key, record);
        }
      } catch { /* half-synced: read again next time */ }
    }
    for (const [path, tombstone] of tombstones) {
      const live = valueOf(remote.get(path));
      const covers = !live || (tombstone.hash ? live.hash === tombstone.hash : live.updatedAt <= tombstone.at);
      if (covers) remote.set(path, { deletedAt: tombstone.at, file: path, ...(tombstone.hash ? { hash: tombstone.hash } : {}) } as Entry);
    }

    const mineRecords = mine ? localRecords(mine) : { entries: new Map() as Entries, images: new Map<string, Uint8Array>() };
    const { merged, conflicts } = mergeEntries(base, mineRecords.entries, remote, new Map([...(mine?.deletions ?? [])].filter(([path]) => isRecordPath(path))));
    for (const conflict of conflicts) result.conflicts.push({ ...conflict, bankId: id });
    for (const source of sources) {
      for (const [path, copy] of source.entries) {
        const current = merged.get(path);
        const replaced = absorbEntries(merged, new Map([[path, copy]]));
        // A copy is the other side of an edit made on two computers at once: offer whichever
        // version lost — unless it is just the version both last agreed on.
        const lost = replaced.length ? replaced[0][1] : copy;
        const differs = current && !sameEntry(merged.get(path), lost) && !sameEntry(base.get(path), lost);
        if (base.size && differs && !isTombstone(lost)) result.conflicts.push({ key: path, kept: merged.get(path)!, other: lost, otherSource: 'a conflicting copy', bankId: id });
      }
      absorbed.push(source.id);
    }
    for (const path of unreadable) { if (base.has(path)) merged.set(path, base.get(path)!); }

    const bytes = (path: string) => {
      const hash = valueOf(merged.get(path))?.hash;
      const fromLocal = mineRecords.images.get(path);
      if (fromLocal && hashRepoDataContent(fromLocal) === hash) return fromLocal;
      const fromFolder = remoteBytes.get(path);
      return fromFolder && hashRepoDataContent(fromFolder) === hash ? fromFolder : undefined;
    };
    // Images that came from the folder unread (unchanged stamps) but are new to this browser.
    for (const [path, entry] of merged) {
      if (path.startsWith('images/') && !isTombstone(entry) && !bytes(path)) {
        const content = await io.read(id, path);
        if (content instanceof Uint8Array) remoteBytes.set(path, content);
      }
    }

    // Into this browser, if anything differs from its copy.
    const changedHere = !mine || [...new Set([...merged.keys(), ...mineRecords.entries.keys()])].some(path => {
      const a = valueOf(merged.get(path)), b = valueOf(mineRecords.entries.get(path));
      return (a?.hash ?? null) !== (b?.hash ?? null);
    });
    const content = dataFromRecords(merged, bytes);
    if (changedHere) {
      await local.apply(id, content.name || mine?.name || id, content.data, !inBrowser);
      result.applied.push(id);
    }

    // Into the folder: content files whose bytes differ, deletions, and the derived files.
    const failed = new Set(unreadable);
    const write = async (path: string, data: string | Uint8Array) => {
      try { await io.write(id, path, data); result.wrote.push(`${id}/${path}`); seen[path] = { stamp: '', hash: hashRepoDataContent(data), size: repoDataContentByteLength(data) }; }
      catch (error) { failed.add(path); result.problems.push(`${id}/${path}: ${error instanceof Error ? error.message : String(error)}`); }
    };
    const onDisk = new Map(listing.map(file => [file.path, file.stamp]));
    for (const [path, entry] of merged) {
      if (unreadable.has(path)) continue;
      const value = valueOf(entry);
      if (!value) {
        if (onDisk.has(path)) { try { await io.remove(id, path); result.wrote.push(`${id}/${path} (deleted)`); delete seen[path]; } catch (error) { failed.add(path); result.problems.push(`${id}/${path}: ${String(error)}`); } }
        continue;
      }
      if (onDisk.has(path) && seen[path]?.hash === value.hash) continue;
      const data = value.text ?? bytes(path);
      if (data === undefined) { failed.add(path); result.problems.push(`${id}/${path}: image content unavailable`); continue; }
      await write(path, data);
    }
    // Each deletion records the version it removed (from what both last agreed on).
    const deletedNow = Object.fromEntries([...merged].filter(([, entry]) => isTombstone(entry)).map(([path, entry]) => {
      const recorded = (candidate: Entry | undefined) => candidate && isTombstone(candidate) ? (candidate as { hash?: string }).hash : valueOf(candidate)?.hash;
      const hash = recorded(entry) ?? tombstones.get(path)?.hash ?? recorded(base.get(path)) ?? recorded(mineRecords.entries.get(path));
      return [path, { at: (entry as { deletedAt: number }).deletedAt, ...(hash ? { hash } : {}) }];
    }).sort(([a], [b]) => String(a).localeCompare(String(b))));
    const deletedText = JSON.stringify(deletedNow, null, 1);
    if (Object.keys(deletedNow).length && (await io.read(id, TOMBSTONE_FILE).catch(() => null)) !== deletedText) await write(TOMBSTONE_FILE, deletedText);
    const files = [...merged].filter(([path, entry]) => path !== NAME_FILE && !isTombstone(entry)).map(([path, entry]) => ({ path, size: valueOf(entry)!.size, hash: valueOf(entry)!.hash }));
    for (const entry of buildDerivedRepoEntries({ questions: content.data.questions, narratives: content.data.narratives ?? [], customClassCount: content.data.customClasses.length }, files, { generatedAt: GENERATED_AT })) {
      const hash = hashRepoDataContent(entry.content);
      if (onDisk.has(entry.path) && seen[entry.path]?.hash === hash) continue;
      if (onDisk.has(entry.path) && !seen[entry.path]) {
        const current = await io.read(id, entry.path).catch(() => null);
        if (current !== null && hashRepoDataContent(current) === hash) { seen[entry.path] = { stamp: onDisk.get(entry.path)!, hash, size: repoDataContentByteLength(current) }; continue; }
      }
      await write(entry.path, entry.content);
    }

    // The folder now holds `merged`, except for files that could not be read or written.
    const nextBase: Entries = new Map();
    for (const [path, entry] of merged) {
      if (!failed.has(path)) nextBase.set(path, entry);
      else if (base.has(path)) nextBase.set(path, base.get(path)!);
    }
    if (mine?.deletions.size) local.settled(id, [...mine.deletions.keys()].filter(path => !failed.has(path)));
    // Restamp what was written, so it is not read again.
    for (const { path, stamp } of await io.list(id)) if (seen[path] && !seen[path].stamp) seen[path] = { ...seen[path], stamp };
    state[id] = { base: [...nextBase], seen, quick: await io.quick(id), local: local.signature(id), absorbed };
    void now;
  }
}
