// The Gradebook as small record files in the workspace folder, and how two copies of it merge.
//
// Layout, under gradebook/records/:
//   settings.json                                   settings and the order of sections
//   students.json                                   every student
//   sections/<sectionId>/section.json               the section and its roster (enrollments)
//   sections/<sectionId>/assessments/<id>.json      one assessment and all of its scores
//
// Entering marks on different machines for different assessments touches different files.
// Within a file every record merges on its own, so even the same file edited on two machines
// loses nothing unless the same record changed on both.
//
// The rules that keep data safe:
//  - A record is only ever removed by a tombstone ("deleted at …"), written when the app itself
//    deleted it. A record that is merely missing — a file not synced yet, a wiped browser —
//    is never taken as a deletion.
//  - When both sides changed the same record, the newer edit wins and the other is kept as a
//    conflict for review (and in superseded/), never discarded.
//  - Copies with no shared history (the old gradebook.json, sync tools' conflict copies)
//    only add records or replace older ones; they never delete.
import { normalizeGradebookData } from './gradebook-model.ts';
import type { GradebookData } from './types.ts';

export const RECORDS_DIR = 'records';
export const RECORD_FILE_FORMAT = 'test-generator-gradebook-records';

export type RecordKind = 'section' | 'student' | 'enrollment' | 'assessment' | 'score' | 'settings' | 'order';

/** A record's current value, or a tombstone. `file` is where it lives, relative to records/. */
export type Entry =
  | { value: Record<string, unknown>; file: string }
  | { deletedAt: number; file: string };
export type Entries = Map<string, Entry>;

export interface RecordFile {
  format: typeof RECORD_FILE_FORMAT;
  version: 1;
  records: Record<string, Record<string, unknown>>;
  deleted: Record<string, number>;
}

export interface Conflict {
  key: string;
  /** The version now in the Gradebook. */
  kept: Entry;
  /** The version it replaced, from the other copy. */
  other: Entry;
  /** Which copy `other` came from. */
  otherSource: 'this browser' | 'the folder' | string;
}

const isDeleted = (entry: Entry | undefined): entry is { deletedAt: number; file: string } => !!entry && 'deletedAt' in entry;
const updatedAt = (entry: Entry): number => isDeleted(entry) ? entry.deletedAt : Number(entry.value.updatedAt ?? 0) || 0;
/** Same content, wherever it is stored. */
export const sameEntry = (a: Entry | undefined, b: Entry | undefined): boolean =>
  (!a && !b) || (!!a && !!b && (isDeleted(a) ? isDeleted(b) && a.deletedAt === b.deletedAt : !isDeleted(b) && stableJson(a.value) === stableJson(b.value)));

/** JSON with sorted keys and without undefined, so equal records compare equal. */
export function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, val) => (val && typeof val === 'object' && !Array.isArray(val)
    ? Object.fromEntries(Object.keys(val).sort().filter(k => val[k] !== undefined).map(k => [k, val[k]]))
    : val));
}

// ── GradebookData ⇄ records ──

/** Scores and roster entries are identified by what they connect, so two machines never duplicate one. */
export function recordKey(kind: RecordKind, value: Record<string, unknown>): string {
  if (kind === 'score') return `score/${value.assessmentId}/${value.studentId}`;
  if (kind === 'enrollment') return `enrollment/${value.sectionId}/${value.studentId}`;
  if (kind === 'settings') return 'settings/main';
  if (kind === 'order') return 'order/sections';
  return `${kind}/${value.id}`;
}

/** Every record key in a Gradebook, cheaply (no copies). */
export function recordKeys(data: GradebookData): Set<string> {
  const keys = new Set<string>(['settings/main', 'order/sections']);
  const add = (kind: RecordKind, list: object[]) => { for (const value of list) keys.add(recordKey(kind, value as Record<string, unknown>)); };
  add('section', data.sections); add('student', data.students); add('enrollment', data.enrollments);
  add('assessment', data.assessments); add('score', data.scores);
  return keys;
}

const safe = (id: unknown) => String(id).replace(/[^A-Za-z0-9._-]/g, '_');

export function toEntries(data: GradebookData): Entries {
  const entries: Entries = new Map();
  const put = (kind: RecordKind, value: object, file: string) => {
    const record = JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
    entries.set(recordKey(kind, record), { value: record, file });
  };
  const sectionOf = new Map(data.assessments.map(a => [a.id, a.sectionId]));
  put('settings', data.settings, 'settings.json');
  put('order', { ids: data.sections.map(s => s.id) }, 'settings.json');
  for (const student of data.students) put('student', student, 'students.json');
  for (const section of data.sections) put('section', section, `sections/${safe(section.id)}/section.json`);
  for (const enrollment of data.enrollments) put('enrollment', enrollment, `sections/${safe(enrollment.sectionId)}/section.json`);
  for (const assessment of data.assessments) put('assessment', assessment, assessmentFile(assessment.sectionId, assessment.id));
  for (const score of data.scores) put('score', score, assessmentFile(sectionOf.get(score.assessmentId) ?? score.sectionId, score.assessmentId));
  return entries;
}

const assessmentFile = (sectionId: string, assessmentId: string) => `sections/${safe(sectionId)}/assessments/${safe(assessmentId)}.json`;

/** The Gradebook the live entries describe, sections in their saved order. */
export function fromEntries(entries: Entries): GradebookData {
  // Lists come back oldest first; only sections have a meaningful order of their own.
  const live = (prefix: string) => [...entries].filter(([key, e]) => key.startsWith(prefix) && !isDeleted(e))
    .map(([, e]) => (e as { value: Record<string, unknown> }).value)
    .sort((a, b) => Number(a.createdAt ?? 0) - Number(b.createdAt ?? 0) || String(a.id).localeCompare(String(b.id)));
  const order = entries.get('order/sections');
  const ids = order && !isDeleted(order) && Array.isArray(order.value.ids) ? order.value.ids as string[] : [];
  const position = (id: unknown) => { const i = ids.indexOf(String(id)); return i < 0 ? Number.MAX_SAFE_INTEGER : i; };
  const sections = live('section/').sort((a, b) => position(a.id) - position(b.id) || Number(a.createdAt ?? 0) - Number(b.createdAt ?? 0));
  const settings = entries.get('settings/main');
  return normalizeGradebookData({
    version: 1,
    sections,
    students: live('student/'),
    enrollments: live('enrollment/'),
    assessments: live('assessment/'),
    scores: live('score/'),
    settings: settings && !isDeleted(settings) ? settings.value : undefined,
  });
}

// ── Files ──

export function emptyRecordFile(): RecordFile {
  return { format: RECORD_FILE_FORMAT, version: 1, records: {}, deleted: {} };
}

/** Group entries by file. */
export function toFiles(entries: Entries): Map<string, RecordFile> {
  const files = new Map<string, RecordFile>();
  for (const key of [...entries.keys()].sort()) {
    const entry = entries.get(key)!;
    const file = files.get(entry.file) ?? emptyRecordFile();
    if (isDeleted(entry)) file.deleted[key] = entry.deletedAt; else file.records[key] = entry.value;
    files.set(entry.file, file);
  }
  return files;
}

export function stringifyRecordFile(file: RecordFile): string {
  return `${JSON.stringify(file, null, 1)}\n`;
}

/** Parse one file; throws on anything that is not a complete record file (e.g. half-synced). */
export function parseRecordFile(text: string): RecordFile {
  const file = JSON.parse(text) as RecordFile;
  if (file?.format !== RECORD_FILE_FORMAT || file.version !== 1 || typeof file.records !== 'object' || typeof file.deleted !== 'object') {
    throw new Error('not a Gradebook record file');
  }
  return file;
}

/** Entries from files read from the folder. A record in two files (e.g. after a move) keeps its newest copy. */
export function entriesFromFiles(files: Map<string, RecordFile>): Entries {
  const entries: Entries = new Map();
  const offer = (key: string, entry: Entry) => {
    const current = entries.get(key);
    if (!current || updatedAt(entry) > updatedAt(current) || (isDeleted(entry) && !isDeleted(current) && updatedAt(entry) === updatedAt(current))) entries.set(key, entry);
  };
  for (const [path, file] of files) {
    for (const [key, value] of Object.entries(file.records)) offer(key, { value, file: path });
    for (const [key, deletedAt] of Object.entries(file.deleted)) offer(key, { deletedAt: Number(deletedAt) || 0, file: path });
  }
  return entries;
}

// ── Merging ──

export interface MergeResult { merged: Entries; conflicts: Conflict[] }

/**
 * Three-way merge of this browser's copy (`local`) with the folder's (`remote`), against the
 * copy both last agreed on (`base`). `deletions` are records this app deleted, by key and time.
 */
export function mergeEntries(base: Entries, local: Entries, remote: Entries, deletions: Map<string, number> = new Map()): MergeResult {
  const merged: Entries = new Map();
  const conflicts: Conflict[] = [];
  const keys = new Set([...base.keys(), ...local.keys(), ...remote.keys(), ...deletions.keys()]);
  for (const key of keys) {
    const b = base.get(key);
    // Missing is never deleted: a record absent from one side is unchanged there.
    const deletedHere = deletions.get(key);
    // Deleted before it ever reached the folder: nothing anywhere to remove.
    if (deletedHere !== undefined && !local.has(key) && !b && !remote.has(key)) continue;
    const fileOf = local.get(key)?.file ?? b?.file ?? remote.get(key)?.file ?? '';
    const l = deletedHere !== undefined && !local.has(key) ? { deletedAt: deletedHere, file: fileOf } : local.get(key) ?? b;
    const r = remote.get(key) ?? b;
    let result: Entry | undefined;
    if (sameEntry(l, r)) result = l ?? r;
    else if (!l) result = r;
    else if (!r) result = l;
    else if (b && sameEntry(l, b)) result = r;
    else if (b && sameEntry(r, b)) result = l;
    else {
      // Both changed it. A deletion never beats an edit; otherwise the newer edit wins.
      const localWins = isDeleted(l) !== isDeleted(r) ? !isDeleted(l) : updatedAt(l) >= updatedAt(r);
      result = localWins ? l : r;
      // Deleted on both: one deletion, at the later time, and nothing to review.
      if (isDeleted(l) && isDeleted(r)) { merged.set(key, result); continue; }
      // On a first sync there is no shared history, and an older copy losing to a newer one is
      // ordinary catching up. Otherwise both sides edited it (or both created it) since.
      if (base.size > 0) conflicts.push({ key, kept: result, other: localWins ? r : l, otherSource: localWins ? 'the folder' : 'this browser' });
    }
    if (result) merged.set(key, result);
  }
  return { merged, conflicts };
}

/**
 * Fold in a copy with no shared history (the old gradebook.json, a sync tool's conflict copy).
 * It adds records and replaces older versions with newer ones. A record it lacks is left alone,
 * and its tombstones only remove records not edited since. Returns what it replaced, for safekeeping.
 */
export function absorbEntries(target: Entries, source: Entries): Array<[string, Entry]> {
  const replaced: Array<[string, Entry]> = [];
  for (const [key, entry] of source) {
    const current = target.get(key);
    if (!current) { if (!isDeleted(entry)) target.set(key, entry); continue; }
    // Only a newer version replaces; a tombstone too, so a deletion made after the last edit holds.
    if (sameEntry(current, entry) || updatedAt(entry) <= updatedAt(current)) continue;
    replaced.push([key, current]);
    target.set(key, { ...entry, file: current.file });
  }
  return replaced;
}

/** Where each record should live now (a score follows its assessment's section). */
export function placeEntries(entries: Entries): Entries {
  const sectionOf = new Map<string, string>();
  for (const [key, entry] of entries) if (key.startsWith('assessment/') && !isDeleted(entry)) sectionOf.set(String(entry.value.id), String(entry.value.sectionId));
  const placed: Entries = new Map();
  for (const [key, entry] of entries) {
    let file = entry.file;
    if (!isDeleted(entry)) {
      const kind = key.split('/')[0] as RecordKind;
      const v = entry.value;
      if (kind === 'score') file = assessmentFile(sectionOf.get(String(v.assessmentId)) ?? String(v.sectionId), String(v.assessmentId));
      else if (kind === 'assessment') file = assessmentFile(String(v.sectionId), String(v.id));
      else if (kind === 'enrollment' || kind === 'section') file = `sections/${safe(kind === 'section' ? v.id : v.sectionId)}/section.json`;
      else if (kind === 'student') file = 'students.json';
      else file = 'settings.json';
    }
    placed.set(key, file === entry.file ? entry : { ...entry, file });
  }
  return placed;
}

/** Describe a record for people: "Ada Lee's score on Unit 1 Test". */
export function describeKey(key: string, entries: Entries): string {
  const value = (k: string) => { const e = entries.get(k); return e && !isDeleted(e) ? e.value : undefined; };
  const [kind, a, b] = key.split('/');
  const student = (id: string) => { const s = value(`student/${id}`); return s ? `${s.knownBy ?? s.firstName} ${s.lastName}`.trim() : 'a student'; };
  const assessment = (id: string) => String(value(`assessment/${id}`)?.savedTestName ?? 'an assessment');
  const section = (id: string) => String(value(`section/${id}`)?.name ?? 'a section');
  if (kind === 'score') return `${student(b)}'s score on ${assessment(a)}`;
  if (kind === 'enrollment') return `${student(b)} in ${section(a)}`;
  if (kind === 'student') return student(a);
  if (kind === 'assessment') return assessment(a);
  if (kind === 'section') return section(a);
  if (kind === 'order') return 'the order of sections';
  return 'Gradebook settings';
}

export { isDeleted as isTombstone };
