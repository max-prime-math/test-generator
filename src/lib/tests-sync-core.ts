// Saved tests kept in step with the workspace folder, one test at a time.
//
// Each test lives in tests/<class>/<test-id>/ as one file, test.json (the test with its frozen
// questions and narratives), beside images/ whose files are named by their content and never
// change. One file per test means a clash between two computers is always between two complete
// versions of a test, never a mix of files from each.
//
// Rules:
//  - A test changed on one side only takes that side's version.
//  - Changed on both: the newer version keeps the test, and the other is kept as a separate test,
//    "<name> (other version)", so nothing is lost. A test open here with unsaved edits always
//    keeps its place. The copy's ID is derived from its content, so both computers make the
//    same copy rather than one each.
//  - Removed only by deleted.json, written when a test is deleted in the app; an edit on the
//    other side wins over a deletion. A missing folder or an emptied browser removes nothing.
//  - Other complete versions found in a folder — a sync tool's conflict copy of test.json, or
//    the old multi-file layout written by an older version of the app — are merged the same way.
import { stableJson } from './gradebook-records.ts';
import type { SavedTest } from './types.ts';

export const TEST_FILE = 'test.json';
export const TEST_FILE_FORMAT = 'test-generator-test';

export interface TestFile {
  format: typeof TEST_FILE_FORMAT;
  version: 1;
  test: SavedTest;
  /** Files in images/ the test's content uses. */
  images: string[];
}

/**
 * deleted.json. `hash` is the version of test.json it retired (filled in by `TestsIO.tombstone`);
 * a different test.json in the folder was written afterwards, elsewhere, and is still live.
 */
export interface Tombstone { reason: 'deleted' | 'moved'; movedTo?: string; deletedAt?: string; hash?: string }

/** One test folder as the folder holds it. */
export interface FolderEntry {
  /** "tests/<class>/<id>". */
  folder: string;
  id: string;
  /** Changes whenever test.json does; null when the folder has no test.json (old layout only). */
  stamp: string | null;
  deleted: Tombstone | null;
  /** Other complete versions in the folder: conflict copies of test.json, or the old layout. */
  extras: Array<{ source: string; stamp: string }>;
}

export interface TestsIO {
  scan(): Promise<FolderEntry[]>;
  read(folder: string): Promise<SavedTest>;
  readExtra(folder: string, source: string): Promise<SavedTest>;
  /** Freeze the test's content, write its images and test.json (lifting any tombstone). */
  write(folder: string, test: SavedTest): Promise<{ stamp: string; test: SavedTest }>;
  /** Write deleted.json, recording the hash of the test.json it retires. */
  tombstone(folder: string, info: Tombstone): Promise<void>;
  folderFor(test: Pick<SavedTest, 'id' | 'classId'>): string;
  /** Extra versions already merged by any computer, by content (kept in the folder, in merged.json). */
  readMerged(folder: string): Promise<string[]>;
  addMerged(folder: string, key: string): Promise<void>;
}

/** An extra version's identity across computers: its content and when it was saved. */
const mergedKey = (test: SavedTest) => `${testHash(test)}@${test.updatedAt}`;

export interface LocalTests {
  read(): { tests: SavedTest[]; deletions: Set<string>; editing: Set<string> };
  /** A version from the folder, new or replacing this browser's. */
  put(test: SavedTest): void;
  /** Deleted on the other computer. */
  remove(id: string): void;
  /** The version now in the folder, with its content frozen. */
  saved(test: SavedTest): void;
  settled(ids: string[]): void;
}

export interface TestsSyncState {
  /** What this browser and the folder last agreed on, per test. */
  base: Record<string, { folder: string; stamp: string; hash: string }>;
  /** Extra versions already merged, as "<folder>/<source>@<stamp>". */
  absorbed: string[];
}
export const emptyTestsSyncState = (): TestsSyncState => ({ base: {}, absorbed: [] });

export interface TestsSyncResult {
  state: TestsSyncState;
  /** Things the teacher should know, e.g. a test kept in two versions. */
  notices: string[];
  problems: string[];
  wrote: string[];
  changedLocal: boolean;
  skipped?: boolean;
}

/** What a teacher would see change; not when it was saved or its frozen copies of questions. */
export function testHash(test: Pick<SavedTest, 'name' | 'classId' | 'unitId' | 'testType' | 'config'>): string {
  const text = stableJson({ name: test.name, classId: test.classId, unitId: test.unitId, testType: test.testType, config: test.config });
  let a = 0x811c9dc5, b = 0x01000193 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x5bd1e995) >>> 0;
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

/** The other version of a test, kept as its own test. Same content → same copy on every computer. */
export function otherVersion(test: SavedTest): SavedTest {
  const name = test.name.replace(/ \(other version\)$/, '');
  return { ...JSON.parse(JSON.stringify(test)) as SavedTest, id: `${test.id.slice(0, 60)}-v-${testHash(test).slice(0, 10)}`, name: `${name} (other version)` };
}

export async function syncTests(io: TestsIO, previous: TestsSyncState, local: LocalTests,
  options: { localUnchanged?: boolean } = {}): Promise<TestsSyncResult> {
  const state: TestsSyncState = { base: { ...previous.base }, absorbed: [...previous.absorbed] };
  const notices: string[] = [];
  const problems: string[] = [];
  const wrote: string[] = [];
  let changedLocal = false;
  const scan = await io.scan();
  const { tests, deletions, editing } = local.read();

  const isAbsorbed = (folder: string, extra: { source: string; stamp: string }) => state.absorbed.includes(`${folder}/${extra.source}@${extra.stamp}`);
  // Nothing new anywhere: skip reading and comparing every test.
  const idle = options.localUnchanged && deletions.size === 0 && editing.size === 0
    && scan.every(entry => entry.deleted || (entry.stamp !== null && state.base[entry.id]?.folder === entry.folder && state.base[entry.id]?.stamp === entry.stamp && entry.extras.every(extra => isAbsorbed(entry.folder, extra))))
    && Object.entries(state.base).every(([id, base]) => scan.some(entry => entry.id === id && entry.folder === base.folder && !entry.deleted));
  if (idle) return { state, notices, problems, wrote, changedLocal, skipped: true };

  const localById = new Map(tests.map(test => [test.id, test]));
  const liveById = new Map<string, FolderEntry[]>();
  for (const entry of scan) {
    // A retired folder whose test.json is not the version it retired was written to afterwards,
    // on another computer (an edit racing a move or a deletion): that version is still live.
    if (entry.deleted && entry.stamp && entry.deleted.hash) {
      const checked = `${entry.folder}/${TEST_FILE}@${entry.stamp}`;
      if (!state.absorbed.includes(checked)) {
        try {
          if (testHash(await io.read(entry.folder)) !== entry.deleted.hash) { liveById.set(entry.id, [...(liveById.get(entry.id) ?? []), { ...entry, deleted: null }]); continue; }
          state.absorbed.push(checked);
        } catch (error) { problems.push(`${entry.folder}: ${error instanceof Error ? error.message : String(error)}`); }
      }
    }
    if (!entry.deleted) liveById.set(entry.id, [...(liveById.get(entry.id) ?? []), entry]);
  }
  const deletedIds = new Set(scan.filter(entry => entry.deleted?.reason === 'deleted').map(entry => entry.id));
  const settled: string[] = [];
  const writes: SavedTest[] = [];
  /** Retire a folder. The retired test.json is the version the tombstone records, so it needs no check later. */
  const retire = async (folder: string, info: Tombstone) => {
    await io.tombstone(folder, info);
    const stamp = scan.find(entry => entry.folder === folder)?.stamp;
    if (stamp) state.absorbed.push(`${folder}/${TEST_FILE}@${stamp}`);
  };
  const tombstones: Array<{ folder: string; info: Tombstone; id: string }> = [];
  /** Take a version from the folder into this browser. */
  const put = (test: SavedTest) => { local.put(test); localById.set(test.id, test); changedLocal = true; };

  /** Two different versions met: the newer (or the one being edited here) keeps the test. */
  const keepBoth = (mine: SavedTest, theirs: SavedTest, mineEditing: boolean): SavedTest => {
    const mineWins = mineEditing || mine.updatedAt >= theirs.updatedAt;
    const [keep, other] = mineWins ? [mine, theirs] : [theirs, mine];
    const copy = otherVersion(other);
    if (!localById.has(copy.id) && !liveById.has(copy.id)) {
      put(copy);
      writes.push(copy);
      notices.push(`“${keep.name}” was changed on both computers. The newer version was kept, and the other is saved as “${copy.name}”.`);
    }
    return keep;
  };

  const ids = new Set([...Object.keys(state.base), ...localById.keys(), ...liveById.keys(), ...deletions]);
  for (const id of ids) {
    try {
      const b = state.base[id];
      const folders = liveById.get(id) ?? [];
      // Normally one live folder; two after a class move on each computer. Prefer the agreed one.
      const primary = folders.find(entry => entry.folder === b?.folder) ?? folders[0];
      let remote: SavedTest | undefined;
      let rHash: string | undefined;
      if (primary) {
        if (primary.stamp === null) {
          // Only the old layout: that is the folder's version.
          const legacy = primary.extras.find(extra => extra.source === 'legacy');
          if (legacy) { remote = await io.readExtra(primary.folder, 'legacy'); rHash = testHash(remote); }
        } else if (b && b.folder === primary.folder && b.stamp === primary.stamp) rHash = b.hash;
        else { remote = await io.read(primary.folder); rHash = testHash(remote); }
      }
      const readRemote = async () => remote ??= await io.read(primary!.folder);
      const rDeleted = !primary && deletedIds.has(id);
      let mine = localById.get(id);
      const lHash = mine ? testHash(mine) : undefined;
      const lDeleted = !mine && deletions.has(id);
      const isEditing = editing.has(id);
      const lChanged = mine ? (!b || lHash !== b.hash || isEditing) : lDeleted;
      const rChanged = rHash !== undefined ? (!b || rHash !== b.hash) : rDeleted ? !!b : false;
      let agreed: SavedTest | undefined; // the version both sides hold after this test

      if (mine && rHash !== undefined && lHash === rHash) {
        agreed = mine;
      } else if (!lChanged && !rChanged) {
        if (!mine && rHash !== undefined) { put(await readRemote()); agreed = remote; } // refill an emptied browser
        else if (mine && rHash === undefined && !rDeleted) writes.push(mine);                               // restore a missing folder
        else agreed = mine;
      } else if (lChanged && !rChanged) {
        if (mine) writes.push(mine);
        else if (lDeleted) {
          for (const entry of folders) tombstones.push({ folder: entry.folder, info: { reason: 'deleted', deletedAt: new Date().toISOString() }, id });
          if (!folders.length) { settled.push(id); delete state.base[id]; }
        }
      } else if (!lChanged && rChanged) {
        if (rHash !== undefined) { put(await readRemote()); agreed = remote; }
        else if (rDeleted) { if (mine) { local.remove(id); localById.delete(id); changedLocal = true; } delete state.base[id]; }
      } else if (mine && rHash !== undefined) {
        const keep = keepBoth(mine, await readRemote(), isEditing);
        if (keep === mine) writes.push(mine);
        else { put(keep); agreed = keep; mine = keep; }
      } else if (mine && rDeleted) {
        writes.push(mine);
        notices.push(`“${mine.name}” was deleted on the other computer but changed on this one, so it was kept.`);
      } else if (lDeleted && rHash !== undefined) {
        const kept = await readRemote();
        put(kept); agreed = kept; settled.push(id);
        notices.push(`“${kept.name}” was deleted here but changed on the other computer, so it was kept.`);
      } else if (lDeleted && rDeleted) {
        settled.push(id); delete state.base[id]; // deleted on both
      }

      if (agreed && primary?.stamp) state.base[id] = { folder: primary.folder, stamp: primary.stamp, hash: testHash(agreed) };
      // A folder with only the old layout gets test.json as soon as its version is known, and the
      // old layout's version is recorded as merged.
      else if (agreed && primary && primary.stamp === null) {
        writes.push(agreed);
        if (remote) await io.addMerged(primary.folder, mergedKey(remote));
      }

      // Other complete versions in the folder(s): conflict copies, the old layout, a second live folder.
      // Each is merged once by whichever computer sees it first, and recorded in the folder so
      // no computer (or a browser that was emptied) brings it back again.
      const current = () => localById.get(id) ?? mine;
      for (const entry of folders) {
        let merged: string[] | null = null;
        for (const extra of entry.extras) {
          if (isAbsorbed(entry.folder, extra) || (entry === primary && primary.stamp === null && extra.source === 'legacy')) continue;
          const theirs = await io.readExtra(entry.folder, extra.source);
          merged ??= await io.readMerged(entry.folder);
          if (merged.includes(mergedKey(theirs))) { state.absorbed.push(`${entry.folder}/${extra.source}@${extra.stamp}`); continue; }
          const now = current();
          if (now && testHash(theirs) !== testHash(now)) {
            const keep = keepBoth(now, theirs, isEditing);
            if (keep !== now) { put(keep); writes.push(keep); }
          } else if (!now && !lDeleted) { put(theirs); writes.push(theirs); }
          await io.addMerged(entry.folder, mergedKey(theirs));
          merged.push(mergedKey(theirs));
          state.absorbed.push(`${entry.folder}/${extra.source}@${extra.stamp}`);
        }
        if (entry !== primary) {
          const theirs = await io.read(entry.folder);
          const now = current();
          if (now && testHash(theirs) !== testHash(now)) {
            const keep = keepBoth(now, theirs, isEditing);
            if (keep !== now) { put(keep); writes.push(keep); }
          } else if (!now && !lDeleted) { put(theirs); writes.push(theirs); }
          tombstones.push({ folder: entry.folder, info: { reason: 'moved', movedTo: io.folderFor(now ?? theirs), deletedAt: new Date().toISOString() }, id });
        }
      }
    } catch (error) {
      problems.push(`${id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Write: each test to the folder its class gives it; a class change leaves a "moved" tombstone.
  const written = new Set<string>();
  for (const test of writes) {
    if (written.has(test.id)) continue;
    written.add(test.id);
    try {
      const folder = io.folderFor(test);
      const result = await io.write(folder, localById.get(test.id) ?? test);
      local.saved(result.test);
      wrote.push(folder);
      const previousFolder = state.base[test.id]?.folder;
      state.base[test.id] = { folder, stamp: result.stamp, hash: testHash(result.test) };
      const stale = (liveById.get(test.id) ?? []).filter(entry => entry.folder !== folder).map(entry => entry.folder);
      if (previousFolder && previousFolder !== folder && !stale.includes(previousFolder)) stale.push(previousFolder);
      for (const old of stale) await retire(old, { reason: 'moved', movedTo: folder, deletedAt: new Date().toISOString() });
    } catch (error) {
      problems.push(`${test.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  for (const { folder, info, id } of tombstones) {
    if (written.has(id) && info.reason === 'deleted') continue;
    try {
      await retire(folder, info);
      if (info.reason === 'deleted') { settled.push(id); delete state.base[id]; }
    } catch (error) {
      problems.push(`${folder}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (settled.length) local.settled([...new Set(settled)]);
  return { state, notices, problems, wrote, changedLocal };
}
