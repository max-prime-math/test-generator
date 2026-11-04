// Keeps the workspace-wide curriculum source in step with curriculum/ at the workspace root.
// Bank curriculum files remain readable compatibility snapshots during migration, but edits to
// report language are written here once and immediately apply across every bank.
import { readText, writeText } from './folder-io.ts';
import { localWorkspace, registerWorkspaceSaver } from './local-workspace.svelte.ts';
import { curriculumLibrary } from './curriculum-library.svelte.ts';
import { parseCurriculumCatalog, parseCurriculumLanguage, stableCurriculumJson } from './curriculum-library.ts';

const CATALOG_PATH = 'curriculum/catalog.json';
const LANGUAGE_PATH = 'curriculum/comment-language.json';
const POLL_MS = 5_000;
const WRITE_DELAY_MS = 500;

type PermissionHandle = FileSystemDirectoryHandle & { queryPermission(options: { mode: 'readwrite' }): Promise<PermissionState> };

class CurriculumFolderSync {
  status = $state<'off' | 'syncing' | 'ready' | 'error'>('off');
  problems = $state<string[]>([]);
  lastSyncedAt = $state<number | null>(null);
  #root: FileSystemDirectoryHandle | null = null;
  #running: Promise<void> | null = null;
  #again = false;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #poll: ReturnType<typeof setInterval> | null = null;

  async connect(root: FileSystemDirectoryHandle | null): Promise<void> {
    if (root && this.#root && await root.isSameEntry(this.#root)) return;
    if (this.#root) await this.now().catch(() => undefined);
    this.#stop();
    this.#root = root;
    if (!root) { this.status = 'off'; return; }
    curriculumLibrary.onChange = () => this.soon();
    this.#poll = setInterval(() => { if (document.visibilityState === 'visible') void this.now(); }, POLL_MS);
    await this.now();
  }

  soon(): void {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = setTimeout(() => { this.#timer = null; void this.now(); }, WRITE_DELAY_MS);
  }

  async now(): Promise<void> {
    if (!this.#root) return;
    if (this.#running) { this.#again = true; return this.#running; }
    this.#running = (async () => {
      do { this.#again = false; await this.#pass(); } while (this.#again && this.#root);
    })().finally(() => { this.#running = null; });
    return this.#running;
  }

  async #pass(): Promise<void> {
    const root = this.#root!;
    if (await (root as PermissionHandle).queryPermission({ mode: 'readwrite' }) !== 'granted') { this.status = 'off'; return; }
    this.status = 'syncing';
    try {
      const [catalogText, languageText] = await Promise.all([readText(root, CATALOG_PATH), readText(root, LANGUAGE_PATH)]);
      const externalCatalog = catalogText === null ? null : parseCurriculumCatalog(catalogText);
      const externalLanguage = languageText === null ? null : parseCurriculumLanguage(languageText);
      curriculumLibrary.mergeExternal(externalCatalog, externalLanguage);
      const nextCatalog = stableCurriculumJson(curriculumLibrary.catalogFile);
      const nextLanguage = stableCurriculumJson(curriculumLibrary.languageFile);
      if (catalogText !== nextCatalog) await writeText(root, CATALOG_PATH, nextCatalog);
      if (languageText !== nextLanguage) await writeText(root, LANGUAGE_PATH, nextLanguage);
      if (this.#root !== root) return;
      this.problems = [];
      this.status = 'ready';
      this.lastSyncedAt = Date.now();
    } catch (error) {
      this.problems = [error instanceof Error ? error.message : String(error)];
      this.status = 'error';
    }
  }

  #stop(): void {
    if (this.#poll) clearInterval(this.#poll);
    if (this.#timer) clearTimeout(this.#timer);
    this.#poll = this.#timer = null;
    curriculumLibrary.onChange = null;
    this.problems = [];
  }
}

export const curriculumFolderSync = new CurriculumFolderSync();
registerWorkspaceSaver(() => curriculumFolderSync.now());

if (typeof window !== 'undefined') {
  $effect.root(() => {
    $effect(() => { void curriculumFolderSync.connect(localWorkspace.root); });
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void curriculumFolderSync.now(); });
  window.addEventListener('focus', () => void curriculumFolderSync.now());
  window.addEventListener('pagehide', () => void curriculumFolderSync.now());
}
