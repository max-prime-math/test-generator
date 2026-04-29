import { bank } from '../bank.svelte';
import { imageStore } from '../image-store.svelte';
import { customClasses } from '../custom-classes.svelte';
import type {
  SessionStatus,
  LinkedClassMeta,
  ConflictSet,
  ConflictResolution,
  RepoInfo,
  ClassSyncFile,
} from './types';
import {
  getCurrentUser,
  getRepo,
  createRepo,
  getFile,
  putFile,
  addCollaborator,
  getUser,
  listDirectory,
} from './github-api';
import {
  buildClassFile,
  parseClassFile,
  buildIndex,
  parseIndex,
  classFilename,
  INDEX_FILENAME,
  DEFAULT_REPO_NAME,
} from './sync-format';
import { detectConflicts, applyResolutions, buildSyncSnapshot } from './conflict';

// ─────────────────────────────────────────────────────────────────────────────
// Reactive state
// ─────────────────────────────────────────────────────────────────────────────

let sessionStatus = $state<SessionStatus>('unauthenticated');
let userId = $state<string | null>(null);
let linkedClasses = $state<LinkedClassMeta[]>([]);
let syncInProgress = $state(false);
let syncError = $state<string | null>(null);

let _token: string | null = null;
let _repo: RepoInfo | null = null;
let _shaCache = new Map<string, string>();

const TOKEN_KEY = 'tg-github-token-v2';
const REPO_KEY = 'tg-repo-v1';

// ─────────────────────────────────────────────────────────────────────────────
// Initialization — restore session from localStorage on page load
// ─────────────────────────────────────────────────────────────────────────────

function init() {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return;
  _token = token;

  const repoRaw = localStorage.getItem(REPO_KEY);
  if (repoRaw) {
    try { _repo = JSON.parse(repoRaw) as RepoInfo; } catch { /* ignore */ }
  }

  const userRaw = localStorage.getItem('tg-user-id');
  if (userRaw) userId = userRaw;

  sessionStatus = 'active';
  // Load linked classes in background (non-blocking — UI can render first)
  loadLinkedClasses();
}

init();

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/** First-time setup: validate PAT, find or create the sync repo, store token. */
async function setup(pat: string): Promise<void> {
  try {
    syncError = null;
    syncInProgress = true;

    const user = await getCurrentUser(pat);
    const newUserId = user.login;

    let repo = await getRepo(pat, newUserId, DEFAULT_REPO_NAME);
    if (!repo) {
      repo = await createRepo(
        pat,
        DEFAULT_REPO_NAME,
        'Encrypted backup of my Test Generator question bank.',
      );
    }

    // Initialise index if not present
    const existingIndex = await getFile(pat, repo, INDEX_FILENAME);
    if (!existingIndex) {
      const sha = await putFile(
        pat, repo, INDEX_FILENAME,
        JSON.stringify(buildIndex(newUserId, []), null, 2),
        'Initialize Test Generator index',
      );
      _shaCache.set(INDEX_FILENAME, sha);
      linkedClasses = [];
    } else {
      _shaCache.set(INDEX_FILENAME, existingIndex.sha);
      linkedClasses = parseIndex(JSON.parse(existingIndex.content)).classes;
    }

    localStorage.setItem(TOKEN_KEY, pat);
    localStorage.setItem(REPO_KEY, JSON.stringify(repo));
    localStorage.setItem('tg-user-id', newUserId);

    _token = pat;
    _repo = repo;
    userId = newUserId;
    sessionStatus = 'active';
  } catch (error) {
    syncError = error instanceof Error ? error.message : 'Setup failed';
    throw error;
  } finally {
    syncInProgress = false;
  }
}

/** Sign out: clear stored token and reset state. */
function signOut() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REPO_KEY);
  localStorage.removeItem('tg-user-id');
  _token = null;
  _repo = null;
  _shaCache.clear();
  userId = null;
  linkedClasses = [];
  sessionStatus = 'unauthenticated';
}

/** Reload the index file from the repo. */
async function loadLinkedClasses(): Promise<void> {
  if (!_token || !_repo) return;
  try {
    const file = await getFile(_token, _repo, INDEX_FILENAME);
    if (!file) { linkedClasses = []; return; }
    _shaCache.set(INDEX_FILENAME, file.sha);
    linkedClasses = parseIndex(JSON.parse(file.content)).classes;
  } catch (error) {
    console.error('Failed to load index:', error);
  }
}

/** Push the current local state for a class to the repo. */
async function backup(classId: string): Promise<void> {
  if (!_token || !_repo) throw new Error('Not connected');
  try {
    syncError = null;
    syncInProgress = true;

    const questions = bank.questions.filter((q) => q.classId === classId);
    const customClass = customClasses.classes.find((c) => c.id === classId);

    // Gather referenced images as base64
    const imageNames = new Set<string>();
    for (const q of questions) {
      if (q.images) for (const img of q.images) imageNames.add(img);
    }
    const images: Record<string, string> = {};
    for (const basename of imageNames) {
      try {
        const stored = await imageStore.get(basename);
        if (stored) {
          let binary = '';
          const chunk = 8192;
          for (let i = 0; i < stored.bytes.length; i += chunk) {
            const slice = stored.bytes.subarray(i, Math.min(i + chunk, stored.bytes.length));
            binary += String.fromCharCode(...Array.from(slice));
          }
          images[basename] = btoa(binary);
        }
      } catch { /* skip missing */ }
    }

    const filename = classFilename(classId);
    const prevSha = _shaCache.get(filename)
      || (await getFile(_token, _repo, filename))?.sha;

    const file = buildClassFile(
      classId, customClass?.name || classId, userId!,
      questions, images, customClass,
    );

    const newSha = await putFile(
      _token, _repo, filename,
      JSON.stringify(file, null, 2),
      `Sync ${customClass?.name || classId}`,
      prevSha,
    );
    _shaCache.set(filename, newSha);

    // Update index
    const existing = linkedClasses.find((c) => c.classId === classId);
    if (existing) {
      existing.lastSyncedAt = Date.now();
      existing.className = customClass?.name || classId;
    } else {
      linkedClasses.push({
        classId,
        className: customClass?.name || classId,
        filename,
        role: 'owner',
        ownerId: userId!,
        lastSyncedAt: Date.now(),
      });
    }
    await _saveIndex();

    localStorage.setItem(
      `tg-last-sync-${classId}`,
      JSON.stringify(buildSyncSnapshot(questions)),
    );
  } catch (error) {
    syncError = error instanceof Error ? error.message : 'Backup failed';
    throw error;
  } finally {
    syncInProgress = false;
  }
}

/** Pull the remote class file and detect conflicts against local state. */
async function restore(classId: string): Promise<{ conflicts: ConflictSet; file: ClassSyncFile }> {
  if (!_token || !_repo) throw new Error('Not connected');
  try {
    syncError = null;
    syncInProgress = true;

    const filename = classFilename(classId);
    const repoFile = await getFile(_token, _repo, filename);
    if (!repoFile) throw new Error('Class file not found in repo');
    _shaCache.set(filename, repoFile.sha);

    const remoteFile = parseClassFile(JSON.parse(repoFile.content));
    const local = bank.questions.filter((q) => q.classId === classId);
    const snapshotStr = localStorage.getItem(`tg-last-sync-${classId}`);
    const lastSnapshot = snapshotStr ? JSON.parse(snapshotStr) : {};

    return { conflicts: detectConflicts(local, remoteFile.questions, lastSnapshot), file: remoteFile };
  } finally {
    syncInProgress = false;
  }
}

/** Apply conflict resolutions and materialize the remote state locally. */
async function applyRestore(
  classId: string,
  resolutions: ConflictResolution[],
  remoteFile: ClassSyncFile,
): Promise<void> {
  try {
    syncError = null;

    const local = bank.questions.filter((q) => q.classId === classId);
    const merged = applyResolutions(local, remoteFile.questions, resolutions);

    // Materialise questions
    const updated = bank.questions.filter((q) => q.classId !== classId);
    updated.push(...merged);
    bank.questions = updated;
    localStorage.setItem('math-test-bank-v2', JSON.stringify(updated));

    // Materialise images
    for (const [basename, b64] of Object.entries(remoteFile.images)) {
      try {
        const binary = atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const dot = basename.lastIndexOf('.');
        const stem = dot >= 0 ? basename.slice(0, dot) : basename;
        const ext = dot >= 0 ? basename.slice(dot + 1) : 'png';
        await imageStore.put(stem, bytes, ext);
      } catch { /* skip */ }
    }

    // Materialise custom class
    if (remoteFile.customClass) {
      const exists = customClasses.classes.find((c) => c.id === remoteFile.customClass!.id);
      if (!exists) {
        const all = [...customClasses.classes, remoteFile.customClass];
        localStorage.setItem('math-test-custom-classes-v1', JSON.stringify(all));
      }
    }

    localStorage.setItem(
      `tg-last-sync-${classId}`,
      JSON.stringify(buildSyncSnapshot(merged)),
    );
  } catch (error) {
    syncError = error instanceof Error ? error.message : 'Apply restore failed';
    throw error;
  }
}

/** Backup all linked classes. */
async function backupAll(): Promise<void> {
  for (const meta of linkedClasses) await backup(meta.classId);
}

/** Add a GitHub collaborator to the repo. GitHub emails them an invite. */
async function share(githubUsername: string): Promise<void> {
  if (!_token || !_repo) throw new Error('Not connected');
  try {
    syncError = null;
    await getUser(_token, githubUsername); // verify username exists
    await addCollaborator(_token, _repo, githubUsername, 'push');
  } catch (error) {
    syncError = error instanceof Error ? error.message : 'Share failed';
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Private helpers
// ─────────────────────────────────────────────────────────────────────────────

async function _saveIndex(): Promise<void> {
  if (!_token || !_repo) return;
  const newSha = await putFile(
    _token, _repo, INDEX_FILENAME,
    JSON.stringify(buildIndex(userId!, linkedClasses), null, 2),
    'Update index',
    _shaCache.get(INDEX_FILENAME),
  );
  _shaCache.set(INDEX_FILENAME, newSha);
}

// ─────────────────────────────────────────────────────────────────────────────
// Export singleton
// ─────────────────────────────────────────────────────────────────────────────

export const syncState = {
  get sessionStatus() { return sessionStatus; },
  get userId() { return userId; },
  get linkedClasses() { return linkedClasses; },
  get syncInProgress() { return syncInProgress; },
  get syncError() { return syncError; },
  get repoInfo() { return _repo; },

  setup,
  signOut,
  loadLinkedClasses,
  backup,
  restore,
  applyRestore,
  backupAll,
  share,
};
