import type { Question, Class } from '../types';

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
