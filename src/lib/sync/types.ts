import type { Question, Class, SavedTest } from '../types';

// ── Class file format (one per class, plaintext JSON in the private repo) ───

export interface ClassFileMeta {
  classId: string;
  className: string;
  ownerId: string;
  lastModified: number;         // unix ms timestamp
}

/** The on-disk format of a class file in the repo. Plaintext — privacy comes
 *  from the repo being private on GitHub. */
export interface ClassSyncFile {
  version: 2;
  meta: ClassFileMeta;
  questions: Question[];
  images: Record<string, string>;          // basename → base64 bytes
  customClass?: Class;                     // only for custom classes
}

// ── Index file (at the root of the repo) ───────────────────────────────────

export interface LinkedClassMeta {
  classId: string;
  className: string;
  filename: string;             // e.g. "ap-calc-bc.json"
  role: 'owner' | 'collaborator';
  ownerId: string;
  lastSyncedAt: number;         // unix ms, 0 if never synced
}

export interface IndexFile {
  version: 1;
  userId: string;
  classes: LinkedClassMeta[];
}

// ── Repo metadata (cached locally) ─────────────────────────────────────────

export interface RepoInfo {
  owner: string;
  name: string;
  defaultBranch: string;
}

/** A single file fetched from a repo, with its SHA for subsequent updates. */
export interface RepoFile {
  path: string;
  sha: string;
  content: string;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

// ── Local sync state ─────────────────────────────────────────────────────────

export type SessionStatus = 'unauthenticated' | 'active';

/** Snapshot stored per classId for conflict detection */
export type SyncSnapshot = Record<string, number>; // questionId → updatedAt (or createdAt)

// ── Conflict detection ───────────────────────────────────────────────────────

export type ConflictType = 'both-edited' | 'deleted-remotely';

export interface ConflictItem {
  type: ConflictType;
  questionId: string;
  local: Question;
  remote: Question | null; // null for deleted-remotely
}

export interface ConflictSet {
  conflicts: ConflictItem[];
  addedLocally: Question[];    // auto-kept
  addedRemotely: Question[];   // auto-pulled
  autoResolved: Question[];    // local or remote clearly newer
}

export type ResolutionChoice = 'local' | 'remote' | 'delete';

export interface ConflictResolution {
  questionId: string;
  choice: ResolutionChoice;
}

// ── API types ────────────────────────────────────────────────────────────────

export class GistApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'GistApiError';
  }
}

export interface GitHubUser {
  login: string;
  name: string | null;
  avatar_url: string;
}

// ── Provider-based sync architecture ─────────────────────────────────────────

export type ProviderStatus =
  | 'not-configured'
  | 'needs-authentication'
  | 'ready'
  | 'syncing'
  | 'success'
  | 'error'
  | 'conflict-detected';

export interface RemoteFile {
  id: string;
  path: string;
  name: string;
  modifiedTime: number | null;
  hash: string | null;
  providerId: string;
  raw?: unknown;
}

export interface LocalFile {
  path: string;
  name: string;
  content: string;
  modifiedTime: number;
  hash: string;
  raw?: unknown;
}

export interface SyncManifestEntry {
  localFilePath: string;
  providerId: string;
  remoteId: string;
  lastSyncedHash: string;
  lastSyncedModifiedTime: number | null;
  lastSuccessfulSyncTime: number;
}

export interface SyncManifest {
  version: 1;
  entries: SyncManifestEntry[];
}

export interface SyncConflict {
  providerId: string;
  localFilePath: string;
  remoteId: string | null;
  localHash: string;
  lastSyncedHash: string | null;
  remoteHash: string | null;
  lastSyncedModifiedTime: number | null;
  remoteModifiedTime: number | null;
  detectedAt: number;
  message: string;
}

export type ConflictTarget =
  | { kind: 'class'; classId: string }
  | { kind: 'test'; testId: string }
  | { kind: 'other' };

export type TestConflictResolutionChoice = 'local' | 'remote' | 'save-both';

export interface ProviderConflictPreview {
  conflict: SyncConflict;
  target: ConflictTarget;
  localLabel: string;
  remoteLabel: string;
  localText: string;
  remoteText: string;
}

export interface ProviderConnectionInfo {
  accountLabel?: string | null;
  remoteLabel?: string | null;
  remoteUrl?: string | null;
}

export interface SyncProviderAuthInput {
  token?: string;
  [key: string]: unknown;
}

export interface SyncProvider {
  id: string;
  displayName: string;
  isStub?: boolean;
  isConfigured(): boolean | Promise<boolean>;
  isAuthenticated(): Promise<boolean>;
  authenticate(input?: SyncProviderAuthInput): Promise<void>;
  disconnect?(): Promise<void>;
  listFiles(): Promise<RemoteFile[]>;
  uploadFile(file: LocalFile): Promise<RemoteFile>;
  downloadFile(remoteId: string): Promise<LocalFile>;
  deleteFile(remoteId: string): Promise<void>;
  getConnectionInfo?(): Promise<ProviderConnectionInfo>;
  share?(username: string): Promise<void>;
}

export interface ProviderState {
  id: string;
  displayName: string;
  enabled: boolean;
  configured: boolean;
  authenticated: boolean;
  configurable: boolean;
  supportsShare: boolean;
  isStub: boolean;
  status: ProviderStatus;
  lastSyncAt: number | null;
  lastError: string | null;
  conflicts: SyncConflict[];
  accountLabel: string | null;
  remoteLabel: string | null;
  remoteUrl: string | null;
}

export interface ProviderBackupResult {
  providerId: string;
  uploaded: boolean;
  skipped: boolean;
  remoteFile?: RemoteFile;
  error?: Error;
  conflict?: SyncConflict;
}

export interface FanOutBackupResult {
  attemptedProviders: string[];
  uploadedProviders: string[];
  skippedProviders: string[];
  failedProviders: Array<{ providerId: string; error: Error }>;
  conflicts: SyncConflict[];
  results: ProviderBackupResult[];
}

// ── Saved Tests sync format ──────────────────────────────────────────────────

export interface TestSyncFile {
  version: 1;
  test: SavedTest;
}

export interface TestsIndexFile {
  version: 1;
  tests: Array<{
    id: string;
    name: string;
    classId: string | null;
    unitId: string | null;
    testType: string | null;
    updatedAt: number;
    filename: string;
  }>;
}
