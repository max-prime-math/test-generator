/**
 * An in-memory File System Access API directory, enough of it to exercise the
 * workspace folder code in Node. Browsers only hand out real directory handles
 * after a user gesture, so the folder sync layer is otherwise untestable.
 *
 * Supports the subset the app uses: getDirectoryHandle, getFileHandle, values,
 * removeEntry, createWritable, getFile, isSameEntry, and permission queries.
 */

export interface MemoryFileData {
  contents: Uint8Array;
}

type Node = MemoryDirectory | MemoryFile;

class MemoryFile {
  readonly kind = 'file' as const;
  contents = new Uint8Array();
  name: string;
  constructor(name: string) { this.name = name; }
}

class MemoryDirectory {
  readonly kind = 'directory' as const;
  children = new Map<string, Node>();
  name: string;
  constructor(name: string) { this.name = name; }
}

function notFound(name: string): Error {
  const error = new Error(`${name} not found`);
  error.name = 'NotFoundError';
  // The app detects missing entries with `instanceof DOMException`.
  Object.setPrototypeOf(error, DOMException.prototype);
  return error;
}

class FileHandle {
  readonly kind = 'file' as const;
  private file: MemoryFile;
  private parent: MemoryDirectory;
  constructor(file: MemoryFile, parent: MemoryDirectory) { this.file = file; this.parent = parent; }

  get name(): string { return this.file.name; }

  async getFile(): Promise<{
    text(): Promise<string>;
    arrayBuffer(): Promise<ArrayBuffer>;
    size: number;
    lastModified: number;
  }> {
    const bytes = this.file.contents;
    return {
      size: bytes.byteLength,
      lastModified: 0,
      text: async () => new TextDecoder().decode(bytes),
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    };
  }

  async createWritable(): Promise<{
    write(data: unknown): Promise<void>;
    close(): Promise<void>;
    abort(): Promise<void>;
  }> {
    const file = this.file;
    const parent = this.parent;
    let buffer = new Uint8Array();
    let aborted = false;
    return {
      async write(data: unknown) {
        if (typeof data === 'string') buffer = new TextEncoder().encode(data);
        else if (data instanceof Uint8Array) buffer = new Uint8Array(data);
        else if (data instanceof ArrayBuffer) buffer = new Uint8Array(data);
        else throw new Error(`Unsupported write payload: ${typeof data}`);
      },
      async close() {
        if (aborted) return;
        file.contents = buffer;
        parent.children.set(file.name, file);
      },
      async abort() { aborted = true; },
    };
  }
}

export class MemoryDirectoryHandle {
  readonly kind = 'directory' as const;

  private directory: MemoryDirectory;
  constructor(directory: MemoryDirectory) { this.directory = directory; }

  static create(name = 'workspace'): MemoryDirectoryHandle {
    return new MemoryDirectoryHandle(new MemoryDirectory(name));
  }

  get name(): string { return this.directory.name; }

  async queryPermission(): Promise<'granted'> { return 'granted'; }
  async requestPermission(): Promise<'granted'> { return 'granted'; }
  async isSameEntry(other: MemoryDirectoryHandle): Promise<boolean> { return other.directory === this.directory; }

  async getDirectoryHandle(name: string, options: { create?: boolean } = {}): Promise<MemoryDirectoryHandle> {
    const existing = this.directory.children.get(name);
    if (existing?.kind === 'directory') return new MemoryDirectoryHandle(existing);
    if (existing) throw new Error(`${name} is a file`);
    if (!options.create) throw notFound(name);
    const created = new MemoryDirectory(name);
    this.directory.children.set(name, created);
    return new MemoryDirectoryHandle(created);
  }

  async getFileHandle(name: string, options: { create?: boolean } = {}): Promise<FileHandle> {
    const existing = this.directory.children.get(name);
    if (existing?.kind === 'file') return new FileHandle(existing, this.directory);
    if (existing) throw new Error(`${name} is a directory`);
    if (!options.create) throw notFound(name);
    // Only a closed writable adds the file, matching the browser's behaviour.
    return new FileHandle(new MemoryFile(name), this.directory);
  }

  async removeEntry(name: string, options: { recursive?: boolean } = {}): Promise<void> {
    const existing = this.directory.children.get(name);
    if (!existing) throw notFound(name);
    if (existing.kind === 'directory' && existing.children.size > 0 && !options.recursive) {
      throw new Error(`${name} is not empty`);
    }
    this.directory.children.delete(name);
  }

  async *values(): AsyncIterableIterator<MemoryDirectoryHandle | FileHandle> {
    for (const child of [...this.directory.children.values()]) {
      yield child.kind === 'directory'
        ? new MemoryDirectoryHandle(child)
        : new FileHandle(child, this.directory);
    }
  }

  /** Every file path in the tree, for assertions. */
  paths(prefix = ''): string[] {
    const result: string[] = [];
    for (const child of this.directory.children.values()) {
      const path = prefix ? `${prefix}/${child.name}` : child.name;
      if (child.kind === 'file') result.push(path);
      else result.push(...new MemoryDirectoryHandle(child).paths(path));
    }
    return result.sort();
  }

  /** Read a file as text, or null when it does not exist. */
  readText(path: string): string | null {
    const parts = path.split('/');
    let directory: MemoryDirectory = this.directory;
    for (const part of parts.slice(0, -1)) {
      const next = directory.children.get(part);
      if (next?.kind !== 'directory') return null;
      directory = next;
    }
    const file = directory.children.get(parts.at(-1) as string);
    return file?.kind === 'file' ? new TextDecoder().decode(file.contents) : null;
  }
}
