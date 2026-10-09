// One pass of keeping this browser's Gradebook and the workspace folder's in step.
// Independent of the browser: `FolderIO` is the folder, `LocalSide` is the app's copy.
import { GRADEBOOK_BACKUP_KIND, parseGradebookBackup } from './gradebook-backup.ts';
import {
  absorbEntries, entriesFromFiles, fromEntries, isTombstone, mergeEntries, parseRecordFile, placeEntries,
  RECORDS_DIR, sameEntry, stringifyRecordFile, toEntries, toFiles,
  type Conflict, type Entries, type Entry, type RecordFile,
} from './gradebook-records.ts';
import type { GradebookData } from './types.ts';

/** The workspace's gradebook/ folder. Paths are relative to it and use "/". */
export interface FolderIO {
  /** Every file, recursively, with something that changes whenever the file does. */
  list(): Promise<Array<{ path: string; stamp: string }>>;
  read(path: string): Promise<string | null>;
  /** Creates folders as needed. */
  write(path: string, text: string): Promise<void>;
}

export interface LocalSide {
  read(): { data: GradebookData; deletions: Map<string, number> };
  /** Replace the app's Gradebook with the merged one. */
  apply(data: GradebookData): void;
  /** These deletions are now recorded in the folder. */
  settled(keys: string[]): void;
}

export interface SyncState {
  /** What this browser and the folder last agreed on, by record key. */
  base: Array<[string, Entry]>;
  /** Files as last read or written, so unchanged files are not read again. */
  seen: Record<string, { stamp: string; text: string }>;
  /** Copies already folded in (old gradebook.json, conflict copies), by path and stamp. */
  absorbed: string[];
}

export const emptySyncState = (): SyncState => ({ base: [], seen: {}, absorbed: [] });

export interface SyncResult {
  state: SyncState;
  conflicts: Conflict[];
  /** Whether the app's Gradebook changed. */
  changedLocal: boolean;
  wrote: string[];
  /** Files that could not be read or written this time; they are retried next time. */
  problems: string[];
  /** Nothing had changed on either side, so nothing was done (earlier problems still stand). */
  skipped?: boolean;
}

const LEGACY_FILE = 'gradebook.json';
const recordPath = /^records\/(settings\.json|students\.json|sections\/[^/]+\/section\.json|sections\/[^/]+\/assessments\/[^/]+\.json)$/;

/**
 * `adoptFolder`: take the folder's Gradebook as it is, ignoring this browser's copy — used when
 * switching to a different workspace, whose folder must never receive another workspace's students.
 */
export async function syncOnce(io: FolderIO, previous: SyncState, local: LocalSide, now = Date.now(),
  options: { adoptFolder?: boolean; localUnchanged?: boolean } = {}): Promise<SyncResult> {
  const state: SyncState = { base: previous.base, seen: { ...previous.seen }, absorbed: [...previous.absorbed] };
  const problems: string[] = [];
  const listing = await io.list();
  // The common case while a Gradebook sits open: no file has changed since last time, and
  // neither has the app's copy. Skip the merge, which reads every record.
  const folderUnchanged = listing.every(({ path, stamp }) => state.seen[path]?.stamp === stamp || state.absorbed.includes(`${path}@${stamp}`))
    && Object.keys(state.seen).every(path => listing.some(file => file.path === path));
  if (options.localUnchanged && !options.adoptFolder && folderUnchanged) return { state, conflicts: [], changedLocal: false, wrote: [], problems: [], skipped: true };
  const readFile = async (path: string, stamp: string): Promise<string | null> => {
    const cached = state.seen[path];
    if (cached && cached.stamp === stamp) return cached.text;
    const text = await io.read(path);
    if (text !== null) state.seen[path] = { stamp, text };
    return text;
  };

  // The folder's records. A file that cannot be parsed (still syncing, damaged) is left
  // alone this time: its records count as unchanged, and it is not overwritten.
  const files = new Map<string, RecordFile>();
  const unreadable = new Set<string>();
  const sources: Array<{ id: string; entries: Entries; conflictCopy?: boolean }> = [];
  for (const { path, stamp } of listing) {
    if (!path.startsWith(`${RECORDS_DIR}/`) || path.startsWith(`${RECORDS_DIR}/superseded/`)) continue;
    const canonical = recordPath.test(path);
    const id = `${path}@${stamp}`;
    if (!canonical && state.absorbed.includes(id)) continue;
    const text = await readFile(path, stamp);
    try {
      const file = parseRecordFile(text ?? '');
      if (canonical) files.set(path.slice(RECORDS_DIR.length + 1), file);
      // Anything else under records/ is a sync tool's conflict copy ("students.json.conflict1",
      // "students (1).json"): its records are folded in like any copy without shared history.
      else sources.push({ id, entries: entriesFromFiles(new Map([[canonicalFor(path), file]])), conflictCopy: true });
    } catch (error) {
      if (canonical) { unreadable.add(path.slice(RECORDS_DIR.length + 1)); problems.push(`${path}: ${describe(error)}`); }
      else state.absorbed.push(id); // not a record file; ignore it from now on
    }
  }
  // The old single-file Gradebook, as a tab still running the previous version may keep writing it.
  const legacy = listing.find(file => file.path === LEGACY_FILE);
  if (legacy && !state.absorbed.includes(`${legacy.path}@${legacy.stamp}`)) {
    const text = await readFile(legacy.path, legacy.stamp);
    const id = `${legacy.path}@${legacy.stamp}`;
    // Only a complete Gradebook backup is folded in. Anything else (half-synced, damaged) is
    // skipped until the file changes again; it is no longer the live Gradebook, so it is not an error.
    let parsed: unknown = null;
    try { parsed = JSON.parse(text ?? ''); } catch { /* skipped */ }
    if ((parsed as { kind?: unknown } | null)?.kind === GRADEBOOK_BACKUP_KIND) sources.push({ id, entries: toEntries(parseGradebookBackup(text!)) });
    else state.absorbed.push(id);
  }

  // Merge, synchronously with reading the app's copy so no edit slips between the two.
  const base: Entries = new Map(state.base);
  const remote = entriesFromFiles(files);
  const read = local.read();
  const deletions = options.adoptFolder ? new Map<string, number>() : read.deletions;
  const localEntries = options.adoptFolder ? new Map() as Entries : toEntries(read.data);
  const { merged, conflicts } = mergeEntries(base, localEntries, remote, deletions);
  const superseded: Array<{ key: string; entry: Entry; reason: string }> =
    conflicts.map(conflict => ({ key: conflict.key, entry: conflict.other, reason: `edited on both; kept the newer version from ${conflict.otherSource === 'the folder' ? 'this browser' : 'the folder'}` }));
  for (const source of sources) {
    for (const [key, entry] of absorbEntries(merged, source.entries)) {
      superseded.push({ key, entry, reason: `replaced by a newer version in ${source.id.split('@')[0]}` });
      // A sync tool's conflict copy means the record was edited in two places at once.
      if (source.conflictCopy && base.size > 0 && !isTombstone(entry)) conflicts.push({ key, kept: merged.get(key)!, other: entry, otherSource: 'a conflicting copy' });
    }
  }
  const placed = placeEntries(merged);

  const changedLocal = [...new Set([...placed.keys(), ...localEntries.keys()])].some(key => {
    const entry = placed.get(key);
    const mine = localEntries.get(key);
    return entry && isTombstone(entry) ? !!mine : !sameEntry(entry, mine);
  });
  if (changedLocal || options.adoptFolder) local.apply(fromEntries(placed));

  // Write each file whose content differs from the folder's.
  const wrote: string[] = [];
  const failed = new Set<string>(unreadable);
  for (const [path, file] of toFiles(placed)) {
    if (unreadable.has(path)) continue;
    const text = stringifyRecordFile(file);
    const full = `${RECORDS_DIR}/${path}`;
    if (files.has(path) && state.seen[full]?.text === text) continue;
    try {
      await io.write(full, text);
      state.seen[full] = { stamp: '', text }; // re-read once to learn its stamp
      wrote.push(full);
    } catch (error) {
      failed.add(path);
      problems.push(`${full}: ${describe(error)}`);
    }
  }
  if (superseded.length) {
    const name = `${RECORDS_DIR}/superseded/${new Date(now).toISOString().replace(/[:.]/g, '-')}-${Math.random().toString(36).slice(2, 8)}.json`;
    try { await io.write(name, `${JSON.stringify({ savedAt: now, entries: superseded }, null, 1)}\n`); }
    catch (error) { problems.push(`${name}: ${describe(error)}`); }
  }

  // The folder now holds `placed`, except where a file could not be written or read.
  const nextBase: Entries = new Map();
  for (const [key, entry] of placed) {
    if (!failed.has(entry.file)) nextBase.set(key, entry);
    else if (base.has(key)) nextBase.set(key, base.get(key)!);
  }
  state.base = [...nextBase];
  for (const source of sources) if (!state.absorbed.includes(source.id)) state.absorbed.push(source.id);
  // A deletion is settled once the merge's decision about it is in the folder — including when
  // an edit made elsewhere won over it.
  if (options.adoptFolder) local.settled([...read.deletions.keys()]);
  local.settled([...deletions.keys()].filter(key => { const entry = placed.get(key); return !entry || !failed.has(entry.file); }));
  // Old cache entries for files that are gone.
  const present = new Set(listing.map(file => file.path));
  for (const path of Object.keys(state.seen)) if (!present.has(path) && !wrote.includes(path)) delete state.seen[path];
  return { state, conflicts, changedLocal, wrote, problems };
}

/** "records/students.json.conflict1" → "students.json"; "records/sections/x/section (1).json" → "sections/x/section.json". */
function canonicalFor(path: string): string {
  const relative = path.slice(RECORDS_DIR.length + 1);
  return relative.replace(/\.json[^/]*$/, '.json').replace(/ \(\d+\)(?=\.json$)/, '').replace(/[ ._-]*conflict[^/]*?(?=\.json$)/i, '');
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
