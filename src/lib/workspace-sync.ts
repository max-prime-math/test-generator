/**
 * Manifest-driven synchronisation between the workspace folder and the browser.
 *
 * Two properties drive the design:
 *
 *  - **Startup must not read every question.** Each bank and test folder ships a
 *    manifest listing every file with its content hash, so comparing one small
 *    file per folder decides whether anything changed. Only files whose hash
 *    actually moved are opened, which keeps opening a workspace proportional to
 *    the number of folders rather than the number of questions.
 *  - **A failure must not stop the world.** Every bank, test and the gradebook
 *    is synced independently and reports its own problem, so one unreadable
 *    folder can never silently pause saving for everything else.
 */

import {
  exportAppDataToRepoEntries,
  hashRepoDataContent,
  importRepoEntriesToAppData,
  normalizeRepoPath,
  type RepoAppData,
  type RepoDataEntry,
} from '../git/repoDataModel.ts';
import { childDirectory, directories, readText, writeText } from './folder-io.ts';
import type { SavedTest } from './types.ts';

export const MANIFEST_PATH = 'manifest.json';
/** Files the manifest never lists but the folder still owns. */
const UNMANAGED = new Set([MANIFEST_PATH, 'README.md']);

export interface FolderFingerprint {
  /** Hash of the manifest itself: the cheap "did anything change" check. */
  manifest: string;
  /** Content hash per repo-relative path, taken from the manifest. */
  files: Record<string, string>;
}

/** Everything the app remembers about a folder between sessions. */
export interface WorkspaceSyncState {
  banks: Record<string, FolderFingerprint>;
  tests: Record<string, FolderFingerprint>;
  gradebook: string | null;
}

export function emptySyncState(): WorkspaceSyncState {
  return { banks: {}, tests: {}, gradebook: null };
}

export interface ManifestFileRecord {
  path: string;
  hash: string;
}

export interface FolderSummary {
  /** Folder key: `banks/<id>` or `tests/<class>/<id>`. */
  key: string;
  handle: FileSystemDirectoryHandle;
  fingerprint: FolderFingerprint;
  /** True when the folder carries a deletion tombstone. */
  deleted: boolean;
}

export interface WorkspaceScan {
  banks: FolderSummary[];
  tests: FolderSummary[];
  gradebook: { text: string; hash: string } | null;
  /** Folders that could not be read, by key. */
  problems: Array<{ key: string; message: string }>;
}

function hashText(text: string): string {
  return hashRepoDataContent(text);
}

/**
 * Read one folder's manifest and turn it into a fingerprint. Returns null when
 * the folder holds no manifest, which marks it as "not a managed folder".
 */
export async function readFingerprint(folder: FileSystemDirectoryHandle): Promise<FolderFingerprint | null> {
  const manifestText = await readText(folder, MANIFEST_PATH);
  if (manifestText === null) return null;

  const parsed = JSON.parse(manifestText) as { files?: Array<{ path?: unknown; hash?: unknown }> };
  if (!Array.isArray(parsed.files)) throw new Error(`Invalid manifest in ${folder.name}.`);

  const files: Record<string, string> = {};
  for (const record of parsed.files) {
    const path = normalizeRepoPath(String(record.path ?? ''));
    if (!path) continue;
    files[path] = String(record.hash ?? '');
  }
  return { manifest: hashText(manifestText), files };
}

/** Paths whose content differs between two fingerprints. */
export function changedPaths(previous: FolderFingerprint | undefined, next: FolderFingerprint): string[] {
  const before = previous?.files ?? {};
  const paths = new Set([...Object.keys(before), ...Object.keys(next.files)]);
  return [...paths].filter((path) => before[path] !== next.files[path]).sort();
}

export function sameFingerprint(previous: FolderFingerprint | undefined, next: FolderFingerprint): boolean {
  return previous !== undefined
    && previous.manifest === next.manifest
    && changedPaths(previous, next).length === 0;
}

/**
 * Walk the workspace reading only manifests. This is the startup path: it never
 * opens a question, narrative or image file.
 */
export async function scanWorkspace(root: FileSystemDirectoryHandle, onProgress?: (key: string) => void): Promise<WorkspaceScan> {
  const scan: WorkspaceScan = { banks: [], tests: [], gradebook: null, problems: [] };

  const banksRoot = await childDirectory(root, 'banks');
  for (const folder of banksRoot ? await directories(banksRoot) : []) {
    const key = `banks/${folder.name}`;
    onProgress?.(key);
    try {
      const fingerprint = await readFingerprint(folder);
      if (fingerprint) scan.banks.push({ key, handle: folder, fingerprint, deleted: false });
    } catch (cause) {
      scan.problems.push({ key, message: describe(cause) });
    }
  }

  const testsRoot = await childDirectory(root, 'tests');
  for (const classFolder of testsRoot ? await directories(testsRoot) : []) {
    for (const folder of await directories(classFolder)) {
      const key = `tests/${classFolder.name}/${folder.name}`;
      onProgress?.(key);
      try {
        const fingerprint = await readFingerprint(folder);
        if (!fingerprint) continue;
        const deleted = (await readText(folder, 'deleted.json')) !== null;
        scan.tests.push({ key, handle: folder, fingerprint, deleted });
      } catch (cause) {
        scan.problems.push({ key, message: describe(cause) });
      }
    }
  }

  onProgress?.('gradebook');
  const gradebookRoot = await childDirectory(root, 'gradebook');
  const gradebookText = gradebookRoot ? await readText(gradebookRoot, 'gradebook.json') : null;
  if (gradebookText !== null) scan.gradebook = { text: gradebookText, hash: hashText(gradebookText) };

  return scan;
}

/**
 * Read a managed folder's entries. `only` restricts the read to specific paths,
 * which is how an incremental load avoids touching unchanged questions.
 */
export async function readFolderEntries(
  folder: FileSystemDirectoryHandle,
  fingerprint: FolderFingerprint,
  only?: Set<string>,
): Promise<RepoDataEntry[]> {
  const entries: RepoDataEntry[] = [];
  for (const path of Object.keys(fingerprint.files)) {
    if (only && !only.has(path)) continue;
    const file = await (await fileHandleFor(folder, path)).getFile();
    entries.push({
      path,
      kind: 'file',
      content: path.startsWith('images/') ? new Uint8Array(await file.arrayBuffer()) : await file.text(),
    });
  }
  const manifestText = await readText(folder, MANIFEST_PATH);
  if (manifestText !== null) entries.push({ path: MANIFEST_PATH, kind: 'file', content: manifestText });
  return entries;
}

async function fileHandleFor(root: FileSystemDirectoryHandle, path: string): Promise<FileSystemFileHandle> {
  const parts = normalizeRepoPath(path).split('/');
  let directory = root;
  for (const part of parts.slice(0, -1)) directory = await directory.getDirectoryHandle(part);
  return directory.getFileHandle(parts.at(-1) as string);
}

/**
 * Write a folder after checking it has not changed underneath us.
 *
 * The check reads the manifest alone rather than every file, which keeps
 * saving a one-question edit proportional to the edit instead of to the size
 * of the bank. `expected` is the signature last written, or 'absent' for a
 * folder that should not exist yet.
 */
export async function writeFolderChecked(
  folder: FileSystemDirectoryHandle,
  entries: RepoDataEntry[],
  expected: string,
): Promise<FolderFingerprint> {
  const current = await readFingerprint(folder);
  if (folderSignatureOf(current) !== expected) {
    throw new Error(`${folder.name} changed outside this tab. Reload the workspace before saving; browser changes are still available.`);
  }
  if (!current) {
    // Refuse to adopt an unmanaged directory, even if the name happens to match.
    for await (const _ of (folder as FileSystemDirectoryHandle & { values(): AsyncIterable<FileSystemHandle> }).values()) {
      throw new Error(`Cannot initialize nonempty folder ${folder.name}. Choose an empty workspace or a recognized bank.`);
    }
  }
  return writeFolder(folder, entries, current ?? undefined);
}

function folderSignatureOf(fingerprint: FolderFingerprint | null): string {
  return fingerprint ? signatureFromFingerprint(fingerprint) : 'absent';
}

/**
 * Write a folder so it matches `entries`, touching only files whose content
 * changed and removing managed files that are no longer present.
 */
export async function writeFolder(
  folder: FileSystemDirectoryHandle,
  entries: RepoDataEntry[],
  previous: FolderFingerprint | undefined,
): Promise<FolderFingerprint> {
  const manifest = entries.find((entry) => entry.path === MANIFEST_PATH);
  if (!manifest || typeof manifest.content !== 'string') throw new Error('Cannot write a folder without a manifest.');

  const next: FolderFingerprint = { manifest: hashText(manifest.content), files: {} };
  for (const entry of entries) {
    if (entry.path === MANIFEST_PATH) continue;
    next.files[entry.path] = hashRepoDataContent(entry.content);
  }

  for (const entry of entries) {
    if (entry.path === MANIFEST_PATH) continue;
    if (previous?.files[entry.path] === next.files[entry.path]) continue;
    await writeEntry(folder, entry);
  }

  for (const path of Object.keys(previous?.files ?? {})) {
    if (next.files[path] !== undefined || UNMANAGED.has(path)) continue;
    await removeEntry(folder, path);
  }

  await writeText(folder, MANIFEST_PATH, manifest.content);
  return next;
}

async function writeEntry(root: FileSystemDirectoryHandle, entry: RepoDataEntry): Promise<void> {
  const parts = normalizeRepoPath(entry.path).split('/');
  let directory = root;
  for (const part of parts.slice(0, -1)) directory = await directory.getDirectoryHandle(part, { create: true });
  const handle = await directory.getFileHandle(parts.at(-1) as string, { create: true });
  const stream = await handle.createWritable();
  try {
    await stream.write(typeof entry.content === 'string' ? entry.content : bufferOf(entry.content));
    await stream.close();
  } catch (cause) {
    await stream.abort().catch(() => undefined);
    throw cause;
  }
}

function bufferOf(content: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(content.byteLength);
  copy.set(content);
  return copy.buffer;
}

async function removeEntry(root: FileSystemDirectoryHandle, path: string): Promise<void> {
  const parts = normalizeRepoPath(path).split('/');
  let directory = root;
  try {
    for (const part of parts.slice(0, -1)) directory = await directory.getDirectoryHandle(part);
    await directory.removeEntry(parts.at(-1) as string);
  } catch (cause) {
    if (!isMissing(cause)) throw cause;
  }
}

/**
 * Rebuild the content signature `folder-io` compares against, using only the
 * hashes recorded in the manifest. This is what lets a startup scan populate
 * the conflict-detection state without opening any question file: the manifest
 * hashes come from the same `hashRepoDataContent`, so the result is identical
 * to reading every file and hashing it.
 */
export function signatureFromFingerprint(fingerprint: FolderFingerprint): string {
  return Object.entries(fingerprint.files)
    .filter(([path]) => !UNMANAGED.has(path))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, hash]) => `${path}:${hash}`)
    .join('|');
}

export function entriesToAppData(entries: RepoDataEntry[]): RepoAppData {
  return importRepoEntriesToAppData(entries).appData;
}

export function appDataToEntries(data: RepoAppData): RepoDataEntry[] {
  // A fixed timestamp keeps the manifest hash a pure function of the content,
  // so an unchanged bank never looks dirty just because it was re-exported.
  return exportAppDataToRepoEntries(data, { generatedAt: '2000-01-01T00:00:00.000Z' });
}

export function testFolderKey(test: Pick<SavedTest, 'id' | 'classId'>): string {
  return `tests/${test.classId ? safeName(test.classId) : '_unclassified'}/${safeName(test.id)}`;
}

export function safeName(value: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(value) || value === '.' || value === '..') {
    throw new Error(`Unsafe workspace name: ${value}`);
  }
  return value;
}

function isMissing(cause: unknown): boolean {
  return cause instanceof DOMException && cause.name === 'NotFoundError';
}

export function describe(cause: unknown): string {
  return cause instanceof Error && cause.message ? cause.message : String(cause);
}
