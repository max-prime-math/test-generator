import { normalizeRepoPath, hashRepoDataContent, importRepoEntriesToAppData, type RepoDataEntry } from '../git/repoDataModel.ts';
import type { FileReadProgress } from './workspace-progress.ts';

export async function readText(root: FileSystemDirectoryHandle, path: string): Promise<string | null> {
  try { return await (await fileHandle(root, path, false)).getFile().then(file => file.text()); }
  catch (error) { if (isMissing(error)) return null; throw error; }
}

export async function writeText(root: FileSystemDirectoryHandle, path: string, text: string): Promise<void> {
  await writeFile(root, { path, kind: 'file', content: text });
}

export async function childDirectory(root: FileSystemDirectoryHandle, name: string): Promise<FileSystemDirectoryHandle | null> {
  try { return await root.getDirectoryHandle(name); }
  catch (error) { if (isMissing(error)) return null; throw error; }
}

export async function directories(root: FileSystemDirectoryHandle): Promise<FileSystemDirectoryHandle[]> {
  const children: FileSystemDirectoryHandle[] = [];
  for await (const entry of (root as FileSystemDirectoryHandle & { values(): AsyncIterable<FileSystemHandle> }).values()) {
    if (entry.kind === 'directory') children.push(entry as FileSystemDirectoryHandle);
  }
  return children.sort((a, b) => a.name.localeCompare(b.name));
}

export async function readRepoFolder(root: FileSystemDirectoryHandle, onProgress?: FileReadProgress): Promise<RepoDataEntry[] | null> {
  const manifestText = await readText(root, 'manifest.json');
  if (manifestText === null) return null;
  const manifest = JSON.parse(manifestText);
  if (!Array.isArray(manifest.files)) throw new Error(`Invalid manifest in ${root.name}.`);
  const entries: RepoDataEntry[] = [];
  onProgress?.(0, manifest.files.length, 'manifest.json');
  for (const entry of manifest.files) {
    const path = normalizeRepoPath(entry.path);
    const file = await (await fileHandle(root, path, false)).getFile();
    entries.push({ path, kind: 'file', content: path.startsWith('images/') ? new Uint8Array(await file.arrayBuffer()) : await file.text() });
    onProgress?.(entries.length, manifest.files.length, path);
  }
  entries.push({ path: 'manifest.json', kind: 'file', content: manifestText });
  importRepoEntriesToAppData(entries); // includes hashes, sizes, paths and schema checks
  return entries;
}

export function folderSignature(entries: RepoDataEntry[] | null): string {
  if (!entries) return 'absent';
  return entries.filter(e => !['manifest.json', 'README.md'].includes(e.path))
    .sort((a, b) => a.path.localeCompare(b.path)).map(e => `${e.path}:${hashRepoDataContent(e.content)}`).join('|');
}

/** Optimistic conflict check. A changed folder is never silently overwritten. */
export async function writeRepoFolder(root: FileSystemDirectoryHandle, entries: RepoDataEntry[], expected: string): Promise<string> {
  const previous = await readRepoFolder(root);
  if (folderSignature(previous) !== expected) throw new Error(`${root.name} changed outside this tab. Reload the workspace before saving; browser changes are still available.`);
  importRepoEntriesToAppData(entries);
  const manifest = entries.find(entry => entry.path === 'manifest.json')!;
  if (!previous) {
    // Refuse to adopt arbitrary populated directories, even if names happen to match.
    for await (const entry of (root as FileSystemDirectoryHandle & { values(): AsyncIterable<FileSystemHandle> }).values()) {
      throw new Error(`Cannot initialize nonempty folder ${root.name} (${entry.name}). Choose an empty workspace or a recognized bank.`);
    }
  }
  for (const entry of entries) if (entry !== manifest) await writeFile(root, entry);
  // Only remove previously validated managed files, never untracked files or directories.
  const next = new Set(entries.map(entry => entry.path));
  for (const entry of previous ?? []) {
    if (next.has(entry.path)) continue;
    const parts = normalizeRepoPath(entry.path).split('/');
    let directory = root;
    for (const part of parts.slice(0, -1)) directory = await directory.getDirectoryHandle(part);
    await directory.removeEntry(parts.at(-1)!);
  }
  await writeFile(root, manifest);
  return folderSignature(entries);
}

async function fileHandle(root: FileSystemDirectoryHandle, path: string, create: boolean): Promise<FileSystemFileHandle> {
  const parts = normalizeRepoPath(path).split('/');
  let directory = root;
  for (const part of parts.slice(0, -1)) directory = await directory.getDirectoryHandle(part, { create });
  return directory.getFileHandle(parts.at(-1)!, { create });
}

async function writeFile(root: FileSystemDirectoryHandle, entry: RepoDataEntry): Promise<void> {
  const handle = await fileHandle(root, entry.path, true);
  const stream = await handle.createWritable();
  try {
    await stream.write(typeof entry.content === 'string' ? entry.content : new Uint8Array(entry.content).buffer);
    await stream.close();
  } catch (error) { await stream.abort().catch(() => undefined); throw error; }
}

function isMissing(error: unknown): boolean { return error instanceof DOMException && error.name === 'NotFoundError'; }
