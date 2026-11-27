import { normalizeRepoPath, hashRepoDataContent, importRepoEntriesToAppData, type RepoDataEntry } from '../git/repoDataModel.ts';
import type { FileReadProgress } from './workspace-progress.ts';
import { waitForWorkspaceRead } from './workspace-read.ts';

export async function readText(root: FileSystemDirectoryHandle, path: string): Promise<string | null> {
  try { return await (await fileHandle(root, path, false)).getFile().then(file => file.text()); }
  catch (error) { if (isMissing(error)) return null; throw error; }
}

export async function writeText(root: FileSystemDirectoryHandle, path: string, text: string): Promise<void> {
  await writeFile(root, { path, kind: 'file', content: text });
}

export async function childDirectory(root: FileSystemDirectoryHandle, name: string): Promise<FileSystemDirectoryHandle | null> {
  try { return await waitForWorkspaceRead(`opening “${name}” in “${root.name}”`, () => root.getDirectoryHandle(name)); }
  catch (error) { if (isMissing(error)) return null; throw error; }
}

/** Filesystem enumeration can stall when a synced folder is unavailable. Time each advance. */
async function* readDirectory<T>(root: FileSystemDirectoryHandle, entries: AsyncIterator<T>): AsyncGenerator<T> {
  const operation = `listing “${root.name}”`;
  try {
    while (true) {
      const result = await waitForWorkspaceRead(operation, () => entries.next());
      if (result.done) return;
      yield result.value;
    }
  } finally {
    // An iterator can be blocked on the same native read we just timed out.
    void entries.return?.().catch(() => undefined);
  }
}

export function directoryEntries(root: FileSystemDirectoryHandle): AsyncGenerator<[string, FileSystemHandle]> {
  return readDirectory(root, (root as unknown as AsyncIterable<[string, FileSystemHandle]>)[Symbol.asyncIterator]());
}

function directoryValues(root: FileSystemDirectoryHandle): AsyncGenerator<FileSystemHandle> {
  return readDirectory(root, (root as FileSystemDirectoryHandle & { values(): AsyncIterator<FileSystemHandle> }).values());
}

export async function directories(root: FileSystemDirectoryHandle): Promise<FileSystemDirectoryHandle[]> {
  const children: FileSystemDirectoryHandle[] = [];
  for await (const entry of directoryValues(root)) {
    if (entry.kind === 'directory') children.push(entry as FileSystemDirectoryHandle);
  }
  return children.sort((a, b) => a.name.localeCompare(b.name));
}

/** Bank folders under banks/. One with no files left (Drive keeps the empty folders of a removed bank) is not a bank. */
export async function bankDirectories(banksDir: FileSystemDirectoryHandle): Promise<FileSystemDirectoryHandle[]> {
  const hasFile = async (dir: FileSystemDirectoryHandle): Promise<boolean> => {
    const children: FileSystemDirectoryHandle[] = [];
    for await (const entry of directoryValues(dir)) {
      if (entry.kind === 'file') return true;
      children.push(entry as FileSystemDirectoryHandle);
    }
    for (const child of children) if (await hasFile(child)) return true;
    return false;
  };
  const children = await directories(banksDir);
  const populated = await Promise.all(children.map(async child => {
    // Most banks have a top-level manifest. Finding it avoids opening a bank's
    // potentially very large questions or images directory during discovery.
    try {
      await waitForWorkspaceRead(`finding the manifest for “${child.name}”`, () => child.getFileHandle('manifest.json'));
      return true;
    }
    catch (error) {
      if (isMissing(error) || error instanceof DOMException && error.name === 'TypeMismatchError') return hasFile(child);
      throw error;
    }
  }));
  return children.filter((_, index) => populated[index]);
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
  // Files the new manifest drops stay on disk; a save never deletes from the folder.
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
