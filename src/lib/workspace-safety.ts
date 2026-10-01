/**
 * Rules that keep the workspace folder from ever losing data.
 *
 * The workspace usually lives in a shared, cloud-synced folder, so the browser
 * copy can be empty, stale or truncated (cleared site data, another browser
 * profile, a failed load) while every "changed outside this tab" check still
 * passes. Autosave must therefore never treat "missing from the browser" as
 * "deleted by the user":
 *
 *  - Saves never remove files. A manifest stops listing a file instead, and
 *    readers only follow the manifest, so the old file stays on disk.
 *  - A test folder is archived only after the user deleted that test in
 *    TestGen. Tests missing from the browser are reported, never archived.
 *  - An empty gradebook never replaces one with records, and any gradebook
 *    save that removes records first keeps a dated copy of the previous file.
 */

import type { GradebookData } from './types.ts';

const DELETED_TESTS_KEY = 'tg-workspace-deleted-tests-v1';

function readDeletedTests(): Set<string> {
  try {
    const parsed = JSON.parse(localStorage.getItem(DELETED_TESTS_KEY) ?? '[]');
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

function writeDeletedTests(ids: Set<string>): void {
  try { localStorage.setItem(DELETED_TESTS_KEY, JSON.stringify([...ids])); } catch { /* the folder copy stays active */ }
}

/** Records that the user deleted a test, so the next save may archive its folder. */
export function recordTestDeletion(id: string): void {
  const ids = readDeletedTests();
  ids.add(id);
  writeDeletedTests(ids);
}

/** Test IDs the user deleted in TestGen whose folders have not been archived yet. */
export function explicitTestDeletions(): Set<string> {
  return readDeletedTests();
}

export function clearTestDeletions(ids: Iterable<string>): void {
  const current = readDeletedTests();
  let changed = false;
  for (const id of ids) changed = current.delete(id) || changed;
  if (changed) writeDeletedTests(current);
}

/** Thrown instead of writing a gradebook that would lose every record. */
export class UnsafeGradebookError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeGradebookError';
  }
}

export function gradebookRecordCount(data: GradebookData): number {
  return data.sections.length + data.students.length + data.enrollments.length + data.assessments.length + data.scores.length;
}

/** Records in `previous` whose IDs are gone from `next`. */
export function removedGradebookRecords(previous: GradebookData, next: GradebookData): number {
  const lists = ['sections', 'students', 'enrollments', 'assessments', 'scores'] as const;
  let removed = 0;
  for (const list of lists) {
    const kept = new Set(next[list].map((record) => record.id));
    removed += previous[list].filter((record) => !kept.has(record.id)).length;
  }
  return removed;
}

/**
 * Decide whether a gradebook save may replace the folder copy. Returns true
 * when the previous file should be kept as a dated copy first.
 */
export function checkGradebookSave(previous: GradebookData | null, next: GradebookData): boolean {
  if (!previous) return false;
  const before = gradebookRecordCount(previous);
  if (before > 0 && gradebookRecordCount(next) === 0) {
    throw new UnsafeGradebookError(`Not saved: the browser gradebook is empty but the workspace gradebook has ${previous.students.length} students. `
      + 'Choose Reload workspace to load it.');
  }
  return removedGradebookRecords(previous, next) > 0;
}

/** File name for a dated copy of the gradebook, safe on every file system. */
export function gradebookHistoryName(date = new Date()): string {
  return `gradebook-${date.toISOString().replace(/[:.]/g, '-')}.json`;
}
