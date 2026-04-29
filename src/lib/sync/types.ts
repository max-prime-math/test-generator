import type { Question, Class } from '../types';

// ── Gist wire format ────────────────────────────────────────────────────────

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

export interface ClassGistMeta {
  classId: string;
  className: string;
  ownerId: string;
  lastModified: number;         // unix ms timestamp
}

export interface ClassGistFile {
  version: 1;
  meta: ClassGistMeta;
  accessKeys: AccessKeyEntry[];
  dataIv: string;               // base64 — IV used to encrypt the data blob
  encryptedData: string;        // base64 — AES-GCM ciphertext
}

export interface GistPlaintext {
  questions: Question[];
  images: Record<string, string>;          // basename → base64 bytes
  customClass?: Class;  // only for custom classes
}

export interface LinkedGistMeta {
  gistId: string;
  classId: string;
  className: string;
  role: 'owner' | 'collaborator';
  ownerId: string;
  lastSyncedAt: number;         // unix ms, 0 if never synced
}

export interface MasterConfigFile {
  version: 1;
  userId: string;
  linkedGists: LinkedGistMeta[];
}

// ── Local sync state ─────────────────────────────────────────────────────────

export type SessionStatus = 'unauthenticated' | 'active' | 'locked';

/** Stored in localStorage under 'tg-github-token-v1' */
export interface StoredTokenRecord {
  iv: string;         // base64
  ciphertext: string; // base64
  salt: string;       // base64 — the PBKDF2 salt (same as accessKeys entry for this user)
}

/** Snapshot stored per gistId for conflict detection */
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

/** Raw GitHub gist response (minimal, only fields we use) */
export interface GistResponse {
  id: string;
  files: Record<string, { filename: string; content: string; truncated?: boolean; raw_url?: string } | null>;
  owner: { login: string };
}

export interface GitHubUser {
  login: string;
  name: string | null;
  avatar_url: string;
}
