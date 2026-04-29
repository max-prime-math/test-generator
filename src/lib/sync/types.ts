import type { Question, Class } from '../types';

// ── Encrypted file format (one per class, stored as a file in the repo) ─────

export interface AccessKeyEntry {
  userId: string;
  role: 'owner' | 'collaborator';
  // Fields below are absent for 'pending' entries
  passwordSalt?: string;        // base64 — PBKDF2 salt
  passwordHash?: string;        // base64 — derived verification bytes
  encryptedDEK?: string;        // base64 — DEK wrapped with user's KEK
  dekIv?: string;               // base64 — IV used to wrap the DEK
  status?: 'pending' | 'active'; // omitted = 'active' for backwards compat
}

export interface ClassFileMeta {
  classId: string;
  className: string;
  ownerId: string;
  lastModified: number;         // unix ms timestamp
}

/** The on-disk format of a class file in the repo. AES-GCM ciphertext lives in `encryptedData`. */
export interface ClassSyncFile {
  version: 1;
  meta: ClassFileMeta;
  accessKeys: AccessKeyEntry[];
  dataIv: string;               // base64 — IV used to encrypt the data blob
  encryptedData: string;        // base64 — AES-GCM ciphertext
}

export interface SyncPlaintext {
  questions: Question[];
  images: Record<string, string>;          // basename → base64 bytes
  customClass?: Class;  // only for custom classes
}

// ── Index file (unencrypted, at the root of the repo) ──────────────────────

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

// ── Local sync state ─────────────────────────────────────────────────────────

export type SessionStatus = 'unauthenticated' | 'active' | 'locked';

/** Stored in localStorage under 'tg-github-token-v1' */
export interface StoredTokenRecord {
  iv: string;         // base64
  ciphertext: string; // base64
  salt: string;       // base64 — the PBKDF2 salt (same as accessKeys entry for this user)
}

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

export class SessionLockedError extends Error {
  constructor() {
    super('Session is locked — password required');
    this.name = 'SessionLockedError';
  }
}

export interface GitHubUser {
  login: string;
  name: string | null;
  avatar_url: string;
}
