import {
  exportAppDataToRepoEntries,
  importRepoEntriesToAppData,
  normalizeRepoPath,
  repoDataContentByteLength,
  hashRepoDataContent,
  REPO_MANIFEST_PATH,
  type ImportRepoEntriesResult,
  type RepoAppData,
  type RepoDataEntry,
  type RepoDataImage,
} from './repoDataModel.ts';
import {
  createEmptyRepository,
  type RepoFileEntry,
  type RepoStatus,
  type RepoStatusEntry,
  type RepoTrackedFile,
  type TestGeneratorRepository,
} from './repoBackend.ts';
import type { Narrative, Question, SavedTest } from '../lib/types.ts';
import type { Class } from '../lib/types.ts';
import { getActiveBankGitRepoId, getActiveBankName } from '../lib/bank-workspaces.svelte.ts';

export const TEST_GENERATOR_REPO_ID = 'test-generator-bank';
export const TEST_GENERATOR_REPO_DISPLAY_NAME = 'Test Generator Bank';

const QUESTION_BANK_KEY = 'math-test-bank-v2';
const NARRATIVES_KEY = 'tg-narratives-v1';
const CUSTOM_CLASSES_KEY = 'math-test-custom-classes-v1';
const TEST_LIBRARY_KEY = 'tg-test-library-v1';
const TEST_DRAFT_KEY = 'tg-test-draft-v1';
const LAST_REPO_MANIFEST_GENERATED_AT_KEY = 'tg-git-last-repo-manifest-generated-at-v1';
const IMAGE_DB_NAME = 'test-generator';
const IMAGE_STORE_NAME = 'images';

export interface RepoProjectionChange {
  path: string;
  change: 'added' | 'modified' | 'deleted';
}

export interface RepoProjectionResult {
  repo: TestGeneratorRepository;
  entries: RepoDataEntry[];
  changes: RepoProjectionChange[];
}

export function createTestGeneratorRepository(): TestGeneratorRepository {
  return createEmptyRepository({
    id: getActiveBankGitRepoId(),
    displayName: getActiveBankName(),
  });
}

export function projectAppDataToRepository(
  repo: TestGeneratorRepository,
  appData: RepoAppData,
  options: { generatedAt?: string } = {},
): RepoProjectionResult {
  const previousEntries = repositoryToRepoEntries(repo);
  const generatedAt = options.generatedAt ?? chooseProjectionGeneratedAt(appData, previousEntries);
  const entries = exportAppDataToRepoEntries(appData, { generatedAt });
  const changes = diffRepoEntries(previousEntries, entries);
  const now = new Date().toISOString();

  return {
    entries,
    changes,
    repo: {
      ...repo,
      filesystem: {
        entries: Object.fromEntries(entries.map((entry) => [entry.path, repoDataEntryToFile(entry)])),
        updatedAt: changes.length > 0 ? now : repo.filesystem.updatedAt,
      },
      updatedAt: changes.length > 0 ? now : repo.updatedAt,
    },
  };
}

export function repositoryToRepoEntries(repo: TestGeneratorRepository): RepoDataEntry[] {
  return Object.values(repo.filesystem.entries)
    .map((entry) => ({
      path: normalizeRepoPath(entry.path),
      kind: 'file' as const,
      content: cloneContent(entry.content),
    }))
    .sort(compareEntryPaths);
}

export function trackedFilesToRepoEntries(files: RepoTrackedFile[]): RepoDataEntry[] {
  return files
    .map((file) => ({
      path: normalizeRepoPath(file.path),
      kind: 'file' as const,
      content: cloneContent(file.content),
    }))
    .sort(compareEntryPaths);
}

export function prepareRepoEntriesForAppRestore(entries: RepoDataEntry[]): ImportRepoEntriesResult {
  return importRepoEntriesToAppData(entries);
}

export function detectLocalAppChangesSinceProjection(repo: TestGeneratorRepository, appData: RepoAppData): RepoProjectionChange[] {
  const previousEntries = repositoryToRepoEntries(repo);
  const generatedAt = chooseProjectionGeneratedAt(appData, previousEntries);
  const currentEntries = exportAppDataToRepoEntries(appData, { generatedAt });
  return diffRepoEntries(previousEntries, currentEntries);
}

export function suggestRepoCommitMessageFromStatus(
  status: RepoStatus | null | undefined,
  bankName = TEST_GENERATOR_REPO_DISPLAY_NAME,
): string {
  const counts = summarizeQuestionStatusChanges(status?.entries ?? []);
  const bank = bankName.trim() || TEST_GENERATOR_REPO_DISPLAY_NAME;
  const segments = [
    counts.added > 0 ? { action: 'added', count: counts.added } : null,
    counts.edited > 0 ? { action: 'edited', count: counts.edited } : null,
    counts.deleted > 0 ? { action: 'deleted', count: counts.deleted } : null,
  ].filter((segment): segment is { action: 'added' | 'edited' | 'deleted'; count: number } => Boolean(segment));

  if (segments.length === 0) return `Update ${bank}`;
  if (segments.length === 1) {
    const [{ action, count }] = segments;
    const verb = action.charAt(0).toUpperCase() + action.slice(1);
    const preposition = action === 'added' ? 'to' : action === 'deleted' ? 'from' : 'in';
    return `${verb} ${count} ${pluralize('question', count)} ${preposition} ${bank}`;
  }

  return `Updated ${bank}: ${segments
    .map(({ action, count }) => `${action} ${count} ${pluralize('question', count)}`)
    .join(', ')}`;
}

export async function readBrowserAppData(): Promise<RepoAppData> {
  return {
    questions: readJson<Question[]>(QUESTION_BANK_KEY, []),
    narratives: readJson<Narrative[]>(NARRATIVES_KEY, []),
    customClasses: readJson<Class[]>(CUSTOM_CLASSES_KEY, []),
    savedTests: readJson<SavedTest[]>(TEST_LIBRARY_KEY, []),
    images: await readBrowserImages(),
  };
}

export async function writeBrowserAppData(
  appData: RepoAppData,
  options: { clearDraft?: boolean; manifestGeneratedAt?: string | null } = {},
): Promise<void> {
  localStorage.setItem(QUESTION_BANK_KEY, JSON.stringify(appData.questions));
  localStorage.setItem(NARRATIVES_KEY, JSON.stringify(appData.narratives ?? []));
  localStorage.setItem(CUSTOM_CLASSES_KEY, JSON.stringify(appData.customClasses));
  localStorage.setItem(TEST_LIBRARY_KEY, JSON.stringify(appData.savedTests));
  if (options.clearDraft ?? true) localStorage.removeItem(TEST_DRAFT_KEY);
  if (options.manifestGeneratedAt) {
    localStorage.setItem(LAST_REPO_MANIFEST_GENERATED_AT_KEY, options.manifestGeneratedAt);
  } else {
    localStorage.removeItem(LAST_REPO_MANIFEST_GENERATED_AT_KEY);
  }
  await writeBrowserImages(appData.images ?? []);
}

export function diffRepoEntries(previousEntries: RepoDataEntry[], nextEntries: RepoDataEntry[]): RepoProjectionChange[] {
  const previous = new Map(previousEntries.map((entry) => [entry.path, hashEntry(entry)]));
  const next = new Map(nextEntries.map((entry) => [entry.path, hashEntry(entry)]));
  const paths = new Set([...previous.keys(), ...next.keys()]);
  const changes: RepoProjectionChange[] = [];

  for (const path of [...paths].sort((left, right) => left.localeCompare(right))) {
    if (!previous.has(path) && next.has(path)) {
      changes.push({ path, change: 'added' });
    } else if (previous.has(path) && !next.has(path)) {
      changes.push({ path, change: 'deleted' });
    } else if (previous.get(path) !== next.get(path)) {
      changes.push({ path, change: 'modified' });
    }
  }

  return changes;
}

function compareEntryPaths(left: { path: string }, right: { path: string }): number {
  return left.path < right.path ? -1 : left.path > right.path ? 1 : 0;
}

function summarizeQuestionStatusChanges(entries: RepoStatusEntry[]): { added: number; edited: number; deleted: number } {
  const counts = { added: 0, edited: 0, deleted: 0 };

  for (const entry of entries) {
    if (!isQuestionDataPath(entry.path)) continue;
    const action = effectiveQuestionChange(entry);
    if (action) counts[action] += 1;
  }

  return counts;
}

function effectiveQuestionChange(entry: RepoStatusEntry): 'added' | 'edited' | 'deleted' | null {
  if (entry.worktree === 'untracked' || entry.staged === 'added') return 'added';
  if (entry.worktree === 'deleted' || entry.staged === 'deleted') return 'deleted';
  if (entry.worktree === 'modified' || entry.staged === 'modified') return 'edited';
  return null;
}

function isQuestionDataPath(path: string): boolean {
  return path !== 'questions/index.json' && /^questions\/[^/]+\.json$/.test(path);
}

function pluralize(word: string, count: number): string {
  return count === 1 ? word : `${word}s`;
}

function chooseProjectionGeneratedAt(appData: RepoAppData, previousEntries: RepoDataEntry[]): string {
  const previousManifestGeneratedAt = readManifestGeneratedAt(previousEntries) ?? readStoredManifestGeneratedAt();
  if (!previousManifestGeneratedAt) return new Date().toISOString();

  const candidate = exportAppDataToRepoEntries(appData, { generatedAt: previousManifestGeneratedAt });
  const previousWithoutManifest = previousEntries.filter((entry) => entry.path !== REPO_MANIFEST_PATH);
  const candidateWithoutManifest = candidate.filter((entry) => entry.path !== REPO_MANIFEST_PATH);
  return diffRepoEntries(previousWithoutManifest, candidateWithoutManifest).length === 0
    ? previousManifestGeneratedAt
    : new Date().toISOString();
}

function readStoredManifestGeneratedAt(): string | null {
  try {
    const value = localStorage.getItem(LAST_REPO_MANIFEST_GENERATED_AT_KEY);
    return value && !Number.isNaN(Date.parse(value)) ? value : null;
  } catch {
    return null;
  }
}

function readManifestGeneratedAt(entries: RepoDataEntry[]): string | null {
  const manifest = entries.find((entry) => entry.path === REPO_MANIFEST_PATH);
  if (!manifest || typeof manifest.content !== 'string') return null;
  try {
    const parsed = JSON.parse(manifest.content) as { generatedAt?: unknown };
    return typeof parsed.generatedAt === 'string' ? parsed.generatedAt : null;
  } catch {
    return null;
  }
}

function repoDataEntryToFile(entry: RepoDataEntry): RepoFileEntry {
  return {
    path: normalizeRepoPath(entry.path),
    kind: 'file',
    content: cloneContent(entry.content),
  };
}

function cloneContent(content: string | Uint8Array): string | Uint8Array {
  return typeof content === 'string' ? content : new Uint8Array(content);
}

function hashEntry(entry: RepoDataEntry): string {
  return `${repoDataContentByteLength(entry.content)}:${hashRepoDataContent(entry.content)}`;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback;
  } catch {
    return fallback;
  }
}

async function readBrowserImages(): Promise<RepoDataImage[]> {
  if (typeof indexedDB === 'undefined') return [];
  let database: IDBDatabase | null = null;
  try {
    database = await openExistingImageDatabase();
    if (!database.objectStoreNames.contains(IMAGE_STORE_NAME)) return [];
    const images = await request<RepoDataImage[]>(
      database.transaction(IMAGE_STORE_NAME, 'readonly').objectStore(IMAGE_STORE_NAME).getAll(),
    );
    return images
      .filter((image) => image?.name && image?.ext && image?.bytes instanceof Uint8Array)
      .map((image) => ({ ...image, bytes: new Uint8Array(image.bytes) }))
      .sort((left, right) => `${left.name}.${left.ext}`.localeCompare(`${right.name}.${right.ext}`));
  } catch {
    return [];
  } finally {
    database?.close();
  }
}

function openExistingImageDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(IMAGE_DB_NAME);
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
}

async function writeBrowserImages(images: RepoDataImage[]): Promise<void> {
  if (typeof indexedDB === 'undefined') {
    if (images.length === 0) return;
    throw new Error('Cannot import repo images because IndexedDB is unavailable.');
  }

  const database = await openWritableImageDatabase();
  try {
    const transaction = database.transaction(IMAGE_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(IMAGE_STORE_NAME);
    store.clear();
    for (const image of images) {
      store.put({ ...image, bytes: new Uint8Array(image.bytes) });
    }
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

function openWritableImageDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
  const open = indexedDB.open(IMAGE_DB_NAME, 2);
  open.onupgradeneeded = () => {
    if (!open.result.objectStoreNames.contains(IMAGE_STORE_NAME)) {
      open.result.createObjectStore(IMAGE_STORE_NAME, { keyPath: 'name' });
    }
    if (!open.result.objectStoreNames.contains('bankImages')) {
      const store = open.result.createObjectStore('bankImages', { keyPath: 'id' });
      store.createIndex('bankId', 'bankId');
    }
  };
    open.onsuccess = () => {
      const database = open.result;
      if (!database.objectStoreNames.contains(IMAGE_STORE_NAME)) {
        database.close();
        reject(new Error('Image storage is missing its images store.'));
        return;
      }
      resolve(database);
    };
    open.onerror = () => reject(open.error);
  });
}

function request<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted.'));
  });
}
