import { bank } from '../bank.svelte';
import { imageStore } from '../image-store.svelte';
import { customClasses } from '../custom-classes.svelte';
import type {
  SessionStatus,
  LinkedClassMeta,
  StoredTokenRecord,
  ConflictSet,
  ConflictResolution,
  RepoInfo,
  ClassSyncFile,
} from './types';
import {
  deriveKEK,
  derivePasswordHash,
  generateSalt,
  generateDEK,
  wrapDEK,
  unwrapDEK,
  encryptToken,
  decryptToken,
  toBase64,
  fromBase64,
} from './crypto';
import {
  getCurrentUser,
  getRepo,
  createRepo,
  getFile,
  putFile,
  addCollaborator,
  getUser,
} from './github-api';
import {
  buildEncryptedClass,
  parseEncryptedClass,
  buildIndex,
  parseIndex,
  classFilename,
  INDEX_FILENAME,
  DEFAULT_REPO_NAME,
} from './sync-format';
import { detectConflicts, applyResolutions, buildSyncSnapshot } from './conflict';

// ─────────────────────────────────────────────────────────────────────────────
// Reactive state ($state)
// ─────────────────────────────────────────────────────────────────────────────

let sessionStatus = $state<SessionStatus>('unauthenticated');
let userId = $state<string | null>(null);
let linkedClasses = $state<LinkedClassMeta[]>([]);
let syncInProgress = $state(false);
let syncError = $state<string | null>(null);

// Non-reactive state (closed over, never serialized)
let _dek: CryptoKey | null = null;
let _token: string | null = null;
let _inactivityTimer: ReturnType<typeof setTimeout> | null = null;
let _repo: RepoInfo | null = null;
// SHA cache: classId/index → blob SHA. Required for PUTs that update existing files.
let _shaCache = new Map<string, string>();

// localStorage keys
const TOKEN_KEY = 'tg-github-token-v1';
const REPO_KEY = 'tg-repo-v1';
const SETTINGS_KEY = 'tg-sync-settings-v1';

// ─────────────────────────────────────────────────────────────────────────────
// Initialization
// ─────────────────────────────────────────────────────────────────────────────

function initSessionStatus() {
  const tokenRecord = localStorage.getItem(TOKEN_KEY);
  if (tokenRecord) {
    sessionStatus = 'locked';
    // Try to load cached repo info (no auth needed, just info)
    const repoRaw = localStorage.getItem(REPO_KEY);
    if (repoRaw) {
      try {
        _repo = JSON.parse(repoRaw) as RepoInfo;
      } catch {
        // Ignore corrupt cache; will be re-discovered after unlock
      }
    }
  } else {
    sessionStatus = 'unauthenticated';
  }
}

initSessionStatus();

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/** First-time setup: PAT + password creation.
 *  - Validates PAT by fetching user
 *  - Generates DEK + derives KEK
 *  - Finds or creates the user's sync repo
 *  - Stores encrypted token + repo info in localStorage
 *  - Initializes index file in the repo
 */
async function setup(pat: string, password: string): Promise<void> {
  try {
    syncError = null;
    syncInProgress = true;

    // Validate PAT
    const user = await getCurrentUser(pat);
    const newUserId = user.login;

    // Find or create the sync repo
    let repo = await getRepo(pat, newUserId, DEFAULT_REPO_NAME);
    if (!repo) {
      repo = await createRepo(
        pat,
        DEFAULT_REPO_NAME,
        'Encrypted backup of my Test Generator question bank.',
      );
    }
    _repo = repo;
    localStorage.setItem(REPO_KEY, JSON.stringify(repo));

    // Generate keys
    const salt = generateSalt();
    const kek = await deriveKEK(password, salt);
    const dek = await generateDEK();
    const wrapped = await wrapDEK(dek, kek);
    void wrapped; // wrapped DEK gets attached to each class file's accessKeys on backup

    // Derive password hash (kept in memory — used in accessKeys per class)
    const passwordHash = await derivePasswordHash(password, salt);
    void passwordHash;

    // Store encrypted token in localStorage
    const { iv, ciphertext } = await encryptToken(pat, kek);
    const tokenRecord: StoredTokenRecord = {
      iv,
      ciphertext,
      salt: toBase64(salt),
    };
    localStorage.setItem(TOKEN_KEY, JSON.stringify(tokenRecord));

    // Initialize index file if not present
    const existingIndex = await getFile(pat, repo, INDEX_FILENAME);
    if (!existingIndex) {
      const index = buildIndex(newUserId, []);
      const sha = await putFile(
        pat,
        repo,
        INDEX_FILENAME,
        JSON.stringify(index, null, 2),
        'Initialize Test Generator index',
      );
      _shaCache.set(INDEX_FILENAME, sha);
      linkedClasses = [];
    } else {
      _shaCache.set(INDEX_FILENAME, existingIndex.sha);
      linkedClasses = parseIndex(JSON.parse(existingIndex.content)).classes;
    }

    // Set in-memory state
    _dek = dek;
    _token = pat;
    userId = newUserId;
    sessionStatus = 'active';

    resetInactivityTimer();
  } catch (error) {
    syncError = error instanceof Error ? error.message : 'Setup failed';
    throw error;
  } finally {
    syncInProgress = false;
  }
}

/** Re-authenticate after timeout.
 *  - Reads encrypted token + salt from localStorage
 *  - Derives KEK from password
 *  - Decrypts token
 *  - Returns true on success, false on wrong password
 */
async function unlock(password: string): Promise<boolean> {
  try {
    syncError = null;

    const tokenRecordStr = localStorage.getItem(TOKEN_KEY);
    if (!tokenRecordStr) {
      syncError = 'No saved session';
      return false;
    }

    const tokenRecord = JSON.parse(tokenRecordStr) as StoredTokenRecord;
    const salt = fromBase64(tokenRecord.salt);
    const kek = await deriveKEK(password, salt);

    try {
      const decryptedToken = await decryptToken(tokenRecord.ciphertext, tokenRecord.iv, kek);
      // Validate token still works
      const user = await getCurrentUser(decryptedToken);

      _token = decryptedToken;
      userId = user.login;
      sessionStatus = 'active';

      // Restore repo info
      const repoRaw = localStorage.getItem(REPO_KEY);
      if (repoRaw) {
        _repo = JSON.parse(repoRaw) as RepoInfo;
      } else {
        _repo = await getRepo(decryptedToken, user.login, DEFAULT_REPO_NAME);
        if (_repo) localStorage.setItem(REPO_KEY, JSON.stringify(_repo));
      }

      // _dek is unwrapped lazily on first backup/restore from a class file's accessKeys.
      // We don't have a stable per-user DEK across all classes — each class has its own.
      // For now, sync-state derives a fresh DEK per backup operation when needed.
      // Hold the KEK so we can unwrap any class's DEK as needed.
      _kek = kek;
      _passwordSalt = salt;

      resetInactivityTimer();
      await loadLinkedClasses();
      return true;
    } catch {
      syncError = 'Incorrect password or invalid session';
      return false;
    }
  } catch (error) {
    syncError = error instanceof Error ? error.message : 'Unlock failed';
    return false;
  }
}

let _kek: CryptoKey | null = null;
let _passwordSalt: Uint8Array | null = null;

/** Lock the session: clear DEK, KEK, and token from memory. */
function lock() {
  _dek = null;
  _kek = null;
  _token = null;
  _passwordSalt = null;
  if (_inactivityTimer) {
    clearTimeout(_inactivityTimer);
    _inactivityTimer = null;
  }
  sessionStatus = 'locked';
}

/** Reset the inactivity timer. Called on user input. */
function resetInactivityTimer() {
  if (_inactivityTimer) clearTimeout(_inactivityTimer);
  if (sessionStatus !== 'active') return;

  // Read configurable timeout from settings, default 30 min
  const settingsRaw = localStorage.getItem(SETTINGS_KEY);
  let timeoutMs = 30 * 60 * 1000;
  if (settingsRaw) {
    try {
      const s = JSON.parse(settingsRaw);
      if (typeof s.timeoutMs === 'number' && s.timeoutMs > 0) timeoutMs = s.timeoutMs;
    } catch {
      // ignore bad settings
    }
  }

  _inactivityTimer = setTimeout(() => lock(), timeoutMs);
}

/** Reload the index file from the repo. */
async function loadLinkedClasses(): Promise<void> {
  if (!_token || !_repo) return;
  try {
    const indexFile = await getFile(_token, _repo, INDEX_FILENAME);
    if (!indexFile) {
      linkedClasses = [];
      return;
    }
    _shaCache.set(INDEX_FILENAME, indexFile.sha);
    const parsed = parseIndex(JSON.parse(indexFile.content));
    linkedClasses = parsed.classes;
  } catch (error) {
    console.error('Failed to load index:', error);
    linkedClasses = [];
  }
}

/** Backup a class: encrypt and push to its file in the repo.
 *  - Requires active session
 *  - Creates the file if not present, updates if present
 *  - Updates the index with lastSyncedAt
 */
async function backup(classId: string): Promise<void> {
  if (sessionStatus !== 'active' || !_token || !_repo || !_kek || !_passwordSalt) {
    throw new Error('Session not active');
  }

  try {
    syncError = null;
    syncInProgress = true;

    // Gather data to sync
    const questions = bank.questions.filter((q) => q.classId === classId);
    const customClass = customClasses.classes.find((c) => c.id === classId);

    // Load images referenced by these questions
    const imageNames = new Set<string>();
    for (const q of questions) {
      if (q.images) for (const img of q.images) imageNames.add(img);
    }
    const images: Record<string, Uint8Array> = {};
    for (const basename of imageNames) {
      try {
        const stored = await imageStore.get(basename);
        if (stored) images[basename] = stored.bytes;
      } catch {
        // skip missing
      }
    }

    const filename = classFilename(classId);

    // Determine DEK: either reuse the one in the existing file's accessKeys, or generate fresh
    let dek: CryptoKey;
    let accessKeys = [];
    let prevSha: string | undefined = _shaCache.get(filename);

    const existingFile = await getFile(_token, _repo, filename);
    if (existingFile) {
      prevSha = existingFile.sha;
      _shaCache.set(filename, existingFile.sha);
      const existing = JSON.parse(existingFile.content) as ClassSyncFile;
      // Find this user's accessKey to unwrap the existing DEK
      const myEntry = existing.accessKeys.find((k) => k.userId === userId);
      if (myEntry?.encryptedDEK && myEntry.dekIv) {
        dek = await unwrapDEK(myEntry.encryptedDEK, myEntry.dekIv, _kek);
        accessKeys = existing.accessKeys;
      } else {
        // Owner key missing — regenerate DEK and replace accessKeys
        dek = await generateDEK();
        const wrapped = await wrapDEK(dek, _kek);
        const passwordHash = await derivePasswordHash('', _passwordSalt); // unused; placeholder
        void passwordHash;
        accessKeys = [{
          userId: userId!,
          role: 'owner' as const,
          passwordSalt: toBase64(_passwordSalt),
          passwordHash: '', // not used in current flow; kept for shape
          encryptedDEK: wrapped.encryptedDEK,
          dekIv: wrapped.dekIv,
          status: 'active' as const,
        }];
      }
    } else {
      // New file — generate fresh DEK and wrap with current user's KEK
      dek = await generateDEK();
      const wrapped = await wrapDEK(dek, _kek);
      accessKeys = [{
        userId: userId!,
        role: 'owner' as const,
        passwordSalt: toBase64(_passwordSalt),
        passwordHash: '',
        encryptedDEK: wrapped.encryptedDEK,
        dekIv: wrapped.dekIv,
        status: 'active' as const,
      }];
    }

    const encryptedFile = await buildEncryptedClass(
      classId,
      customClass?.name || classId,
      userId!,
      dek,
      accessKeys,
      questions,
      images,
      customClass,
    );

    const content = JSON.stringify(encryptedFile, null, 2);
    const newSha = await putFile(
      _token,
      _repo,
      filename,
      content,
      `Sync ${customClass?.name || classId}`,
      prevSha,
    );
    _shaCache.set(filename, newSha);

    // Update index
    const existingMeta = linkedClasses.find((c) => c.classId === classId);
    if (existingMeta) {
      existingMeta.lastSyncedAt = Date.now();
      existingMeta.className = customClass?.name || classId;
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

    // Update snapshot
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

/** Restore a class: fetch and decrypt the file, detect conflicts. */
async function restore(classId: string): Promise<ConflictSet> {
  if (sessionStatus !== 'active' || !_token || !_repo || !_kek) {
    throw new Error('Session not active');
  }

  try {
    syncError = null;
    syncInProgress = true;

    const filename = classFilename(classId);
    const file = await getFile(_token, _repo, filename);
    if (!file) {
      syncError = 'Class file not found in repo';
      throw new Error('Class file not found');
    }
    _shaCache.set(filename, file.sha);

    const encrypted = JSON.parse(file.content) as ClassSyncFile;
    // Find this user's accessKey
    const myEntry = encrypted.accessKeys.find((k) => k.userId === userId);
    if (!myEntry?.encryptedDEK || !myEntry.dekIv) {
      throw new Error(`No access key found for user ${userId}`);
    }
    const dek = await unwrapDEK(myEntry.encryptedDEK, myEntry.dekIv, _kek);
    const plaintext = await parseEncryptedClass(encrypted, dek);

    const local = bank.questions.filter((q) => q.classId === classId);
    const snapshotStr = localStorage.getItem(`tg-last-sync-${classId}`);
    const lastSnapshot = snapshotStr ? JSON.parse(snapshotStr) : {};

    return detectConflicts(local, plaintext.questions, lastSnapshot);
  } finally {
    syncInProgress = false;
  }
}

/** Apply conflict resolutions and update local state. */
async function applyRestore(
  classId: string,
  resolutions: ConflictResolution[],
  remote: { questions: any[] },
): Promise<void> {
  try {
    syncError = null;

    const local = bank.questions.filter((q) => q.classId === classId);
    const merged = applyResolutions(local, remote.questions, resolutions);

    const updated = bank.questions.filter((q) => q.classId !== classId);
    updated.push(...merged);
    bank.questions = updated;
    localStorage.setItem('math-test-bank-v2', JSON.stringify(updated));

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
  for (const meta of linkedClasses) {
    await backup(meta.classId);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sharing
// ─────────────────────────────────────────────────────────────────────────────

/** Generate a random URL-safe share password (base64, ~22 chars). */
function generateSharePassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return toBase64(bytes).replace(/[+/=]/g, '').slice(0, 22);
}

/** Share a class with a colleague.
 *  - Verifies colleague's GitHub username exists
 *  - Adds them as a collaborator on the repo (GitHub sends email invite)
 *  - Generates a one-time share password
 *  - Adds a pending accessKey entry to the class file using the share password
 *  - Pushes the file
 *  - Returns the share password — caller must show it to the user to send to colleague
 */
async function share(classId: string, githubUsername: string): Promise<string> {
  if (sessionStatus !== 'active' || !_token || !_repo || !_kek) {
    throw new Error('Session not active');
  }

  try {
    syncError = null;
    syncInProgress = true;

    // Verify the GitHub user exists
    const colleague = await getUser(_token, githubUsername);
    const colleagueLogin = colleague.login;

    // Add as repo collaborator (GitHub sends them an email invite)
    await addCollaborator(_token, _repo, colleagueLogin, 'push');

    // Generate share password and derive its KEK
    const sharePassword = generateSharePassword();
    const shareSalt = generateSalt();
    const shareKek = await deriveKEK(sharePassword, shareSalt);
    const shareHash = await derivePasswordHash(sharePassword, shareSalt);

    // Fetch the existing class file
    const filename = classFilename(classId);
    const file = await getFile(_token, _repo, filename);
    if (!file) {
      throw new Error(`Class file not found in repo. Back up the class before sharing.`);
    }
    _shaCache.set(filename, file.sha);
    const existing = JSON.parse(file.content) as ClassSyncFile;

    // Unwrap the DEK using the owner's KEK
    const myEntry = existing.accessKeys.find((k) => k.userId === userId);
    if (!myEntry?.encryptedDEK || !myEntry.dekIv) {
      throw new Error('Cannot unwrap DEK — your access key is missing');
    }
    const dek = await unwrapDEK(myEntry.encryptedDEK, myEntry.dekIv, _kek);

    // Wrap the DEK with the share password's KEK
    const wrapped = await wrapDEK(dek, shareKek);

    // Add a pending accessKey entry for the colleague
    const pendingEntry = {
      userId: colleagueLogin,
      role: 'collaborator' as const,
      passwordSalt: toBase64(shareSalt),
      passwordHash: shareHash,
      encryptedDEK: wrapped.encryptedDEK,
      dekIv: wrapped.dekIv,
      status: 'pending' as const,
    };

    // Replace any prior pending entry for the same user
    const otherEntries = existing.accessKeys.filter((k) => k.userId !== colleagueLogin);
    const newAccessKeys = [...otherEntries, pendingEntry];

    // Build a fresh encrypted file (re-encrypts the data with a fresh IV but same DEK)
    const questions = bank.questions.filter((q) => q.classId === classId);
    const customClass = customClasses.classes.find((c) => c.id === classId);
    const imageNames = new Set<string>();
    for (const q of questions) {
      if (q.images) for (const img of q.images) imageNames.add(img);
    }
    const images: Record<string, Uint8Array> = {};
    for (const basename of imageNames) {
      try {
        const stored = await imageStore.get(basename);
        if (stored) images[basename] = stored.bytes;
      } catch {
        // skip missing
      }
    }

    const updated = await buildEncryptedClass(
      classId,
      existing.meta.className,
      existing.meta.ownerId,
      dek,
      newAccessKeys,
      questions,
      images,
      customClass,
    );

    const newSha = await putFile(
      _token,
      _repo,
      filename,
      JSON.stringify(updated, null, 2),
      `Share ${existing.meta.className} with ${colleagueLogin}`,
      file.sha,
    );
    _shaCache.set(filename, newSha);

    return sharePassword;
  } catch (error) {
    syncError = error instanceof Error ? error.message : 'Share failed';
    throw error;
  } finally {
    syncInProgress = false;
  }
}

/** Claim a class that was shared with you.
 *  - Fetches the class file from the repo
 *  - Finds your pending accessKey entry
 *  - Decrypts the DEK using the share password
 *  - Re-wraps the DEK using your own KEK
 *  - Replaces the pending entry with your permanent accessKey
 *  - Pushes the file
 *  - Updates your local index
 */
async function claim(classId: string, sharePassword: string): Promise<void> {
  if (sessionStatus !== 'active' || !_token || !_repo || !_kek || !_passwordSalt) {
    throw new Error('Session not active');
  }

  try {
    syncError = null;
    syncInProgress = true;

    const filename = classFilename(classId);
    const file = await getFile(_token, _repo, filename);
    if (!file) throw new Error('Shared class file not found');
    _shaCache.set(filename, file.sha);

    const encrypted = JSON.parse(file.content) as ClassSyncFile;
    const pendingEntry = encrypted.accessKeys.find(
      (k) => k.userId === userId && k.status === 'pending',
    );
    if (!pendingEntry?.encryptedDEK || !pendingEntry.dekIv || !pendingEntry.passwordSalt) {
      throw new Error('No pending share found for you');
    }

    // Derive the share KEK and unwrap the DEK
    const shareSalt = fromBase64(pendingEntry.passwordSalt);
    const shareKek = await deriveKEK(sharePassword, shareSalt);
    let dek: CryptoKey;
    try {
      dek = await unwrapDEK(pendingEntry.encryptedDEK, pendingEntry.dekIv, shareKek);
    } catch {
      throw new Error('Incorrect share password');
    }

    // Re-wrap the DEK with my own KEK
    const myWrapped = await wrapDEK(dek, _kek);
    const myHash = await derivePasswordHash('', _passwordSalt); // placeholder
    void myHash;

    // Replace the pending entry with my permanent entry
    const myActiveEntry = {
      userId: userId!,
      role: 'collaborator' as const,
      passwordSalt: toBase64(_passwordSalt),
      passwordHash: '', // not used in current flow
      encryptedDEK: myWrapped.encryptedDEK,
      dekIv: myWrapped.dekIv,
      status: 'active' as const,
    };

    const otherEntries = encrypted.accessKeys.filter((k) => k.userId !== userId);
    const newAccessKeys = [...otherEntries, myActiveEntry];

    // Re-build the file (preserving the existing data, just updating accessKeys)
    // We need to decrypt the data to re-build, but we already have the DEK
    const plaintext = await parseEncryptedClass(encrypted, dek);

    // Materialize images locally
    for (const [basename, b64] of Object.entries(plaintext.images)) {
      try {
        const bytes = fromBase64(b64);
        const dot = basename.lastIndexOf('.');
        const stem = dot >= 0 ? basename.slice(0, dot) : basename;
        const ext = dot >= 0 ? basename.slice(dot + 1) : 'png';
        await imageStore.put(stem, bytes, ext);
      } catch {
        // skip
      }
    }

    // Materialize the custom class locally if provided. customClasses doesn't
    // expose an "import full class with preserved IDs" method, so write directly
    // to localStorage (the same key the singleton reads from).
    if (plaintext.customClass) {
      const existsLocally = customClasses.classes.find((c) => c.id === plaintext.customClass!.id);
      if (!existsLocally) {
        const allClasses = [...customClasses.classes, plaintext.customClass];
        localStorage.setItem('math-test-custom-classes-v1', JSON.stringify(allClasses));
        // Force the singleton to reload by triggering a page state refresh on next access
        // (its $state is module-level, so ideally we'd expose a reload method —
        // but a page refresh is the safe fallback for now)
      }
    }

    // Materialize the questions locally
    const updated = bank.questions.filter((q) => q.classId !== classId);
    updated.push(...plaintext.questions);
    bank.questions = updated;
    localStorage.setItem('math-test-bank-v2', JSON.stringify(updated));

    // Re-encrypt with the same DEK (fresh IV) and updated accessKeys
    const questions = plaintext.questions;
    const imagesAsBytes: Record<string, Uint8Array> = {};
    for (const [basename, b64] of Object.entries(plaintext.images)) {
      try {
        imagesAsBytes[basename] = fromBase64(b64);
      } catch {
        // skip
      }
    }

    const rebuilt = await buildEncryptedClass(
      classId,
      encrypted.meta.className,
      encrypted.meta.ownerId,
      dek,
      newAccessKeys,
      questions,
      imagesAsBytes,
      plaintext.customClass,
    );

    const newSha = await putFile(
      _token,
      _repo,
      filename,
      JSON.stringify(rebuilt, null, 2),
      `Claim ${encrypted.meta.className} as ${userId}`,
      file.sha,
    );
    _shaCache.set(filename, newSha);

    // Update local index to register this class as claimed
    const existingMeta = linkedClasses.find((c) => c.classId === classId);
    if (!existingMeta) {
      linkedClasses.push({
        classId,
        className: encrypted.meta.className,
        filename,
        role: 'collaborator',
        ownerId: encrypted.meta.ownerId,
        lastSyncedAt: Date.now(),
      });
      await _saveIndex();
    }

    // Set snapshot for future conflict detection
    localStorage.setItem(
      `tg-last-sync-${classId}`,
      JSON.stringify(buildSyncSnapshot(questions)),
    );
  } catch (error) {
    syncError = error instanceof Error ? error.message : 'Claim failed';
    throw error;
  } finally {
    syncInProgress = false;
  }
}

/** Discover class files in the repo that have a pending invite for this user.
 *  Returns the list of (classId, className) pairs awaiting claim.
 */
async function discoverPendingShares(): Promise<Array<{ classId: string; className: string; ownerId: string }>> {
  if (!_token || !_repo || !userId) return [];

  try {
    // List all .json files at the repo root
    const items = await (await import('./github-api')).listDirectory(_token, _repo);
    const classFiles = items.filter(
      (i) => i.type === 'file' && i.name.endsWith('.json') && i.name !== INDEX_FILENAME,
    );

    const pending: Array<{ classId: string; className: string; ownerId: string }> = [];
    for (const item of classFiles) {
      try {
        const file = await getFile(_token, _repo, item.path);
        if (!file) continue;
        const parsed = JSON.parse(file.content) as ClassSyncFile;
        const myPending = parsed.accessKeys.find(
          (k) => k.userId === userId && k.status === 'pending',
        );
        if (myPending) {
          pending.push({
            classId: parsed.meta.classId,
            className: parsed.meta.className,
            ownerId: parsed.meta.ownerId,
          });
        }
      } catch {
        // skip malformed files
      }
    }
    return pending;
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Private helpers
// ─────────────────────────────────────────────────────────────────────────────

async function _saveIndex(): Promise<void> {
  if (!_token || !_repo) return;
  const index = buildIndex(userId!, linkedClasses);
  const newSha = await putFile(
    _token,
    _repo,
    INDEX_FILENAME,
    JSON.stringify(index, null, 2),
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
  /** @deprecated alias for linkedClasses, kept for transitional UI */
  get linkedGists() { return linkedClasses; },
  get syncInProgress() { return syncInProgress; },
  get syncError() { return syncError; },
  get repoInfo() { return _repo; },

  setup,
  unlock,
  lock,
  resetInactivityTimer,
  loadLinkedClasses,
  /** @deprecated alias for loadLinkedClasses */
  loadLinkedGists: loadLinkedClasses,
  backup,
  restore,
  applyRestore,
  backupAll,
  share,
  claim,
  discoverPendingShares,
};
