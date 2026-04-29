import { bank } from '../bank.svelte';
import { imageStore } from '../image-store.svelte';
import { customClasses } from '../custom-classes.svelte';
import type {
  SessionStatus,
  LinkedGistMeta,
  StoredTokenRecord,
  ConflictSet,
  ConflictResolution,
} from './types';
import {
  deriveKEK,
  verifyPassword,
  generateSalt,
  generateDEK,
  wrapDEK,
  unwrapDEK,
  encryptToken,
  decryptToken,
} from './crypto';
import {
  getCurrentUser,
  getGist,
  findGistByFilename,
  createGist,
  updateGist,
  getGistFileContent,
} from './github-api';
import { buildEncryptedGist, parseEncryptedGist, buildMasterConfig, parseMasterConfig } from './gist-format';
import { detectConflicts, applyResolutions, buildSyncSnapshot } from './conflict';

// ─────────────────────────────────────────────────────────────────────────────

// Reactive state (via $state)
let sessionStatus = $state<SessionStatus>('unauthenticated');
let userId = $state<string | null>(null);
let linkedGists = $state<LinkedGistMeta[]>([]);
let syncInProgress = $state(false);
let syncError = $state<string | null>(null);

// Non-reactive state (closed over, never serialized)
let _dek: CryptoKey | null = null;
let _token: string | null = null;
let _inactivityTimer: ReturnType<typeof setTimeout> | null = null;
let _masterGistId: string | null = null;
let _passwordSalt: Uint8Array | null = null;

// ─────────────────────────────────────────────────────────────────────────────
// Initialization
// ─────────────────────────────────────────────────────────────────────────────

/** Check if token is stored on module load. If so, mark as locked. */
function initSessionStatus() {
  const tokenRecord = localStorage.getItem('tg-github-token-v1');
  if (tokenRecord) {
    sessionStatus = 'locked';
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
 *  - Creates master config gist
 *  - Stores encrypted token + master gist ID in localStorage
 *  - Starts inactivity timer
 */
async function setup(pat: string, password: string): Promise<void> {
  try {
    syncError = null;
    syncInProgress = true;

    // Validate PAT
    const user = await getCurrentUser(pat);
    const newUserId = user.login;

    // Generate keys
    const salt = generateSalt();
    const kek = await deriveKEK(password, salt);
    const dek = await generateDEK();
    const { encryptedDEK, dekIv } = await wrapDEK(dek, kek);

    // Build password hash for this user
    const { derivePasswordHash } = await import('./crypto');
    const passwordHash = await derivePasswordHash(password, salt);

    // Create master config gist (unencrypted, contains just metadata)
    const masterConfigData = buildMasterConfig(newUserId, []);
    const masterGist = await createGist(
      pat,
      'Test Generator Master Config',
      { 'test-gen-master.json': JSON.stringify(masterConfigData) },
      false, // secret
    );
    _masterGistId = masterGist.id;
    localStorage.setItem('tg-master-gist-id', masterGist.id);

    // Store encrypted token in localStorage
    const { iv, ciphertext } = await encryptToken(pat, kek);
    const tokenRecord: StoredTokenRecord = {
      iv,
      ciphertext,
      salt: (await import('./crypto')).toBase64(salt),
    };
    localStorage.setItem('tg-github-token-v1', JSON.stringify(tokenRecord));

    // Set in-memory state
    _dek = dek;
    _token = pat;
    _passwordSalt = salt;
    userId = newUserId;
    sessionStatus = 'active';

    // Start inactivity timer
    resetInactivityTimer();

    // Load linked gists
    await loadLinkedGists();
  } catch (error) {
    syncError = error instanceof Error ? error.message : 'Setup failed';
    throw error;
  } finally {
    syncInProgress = false;
  }
}

/** Re-authenticate after timeout.
 *  - Reads encrypted token + password hash from localStorage
 *  - Derives KEK from password
 *  - Verifies password hash
 *  - Decrypts token and DEK
 *  - Returns true on success, false on wrong password
 */
async function unlock(password: string): Promise<boolean> {
  try {
    syncError = null;

    // Read token record from localStorage
    const tokenRecordStr = localStorage.getItem('tg-github-token-v1');
    if (!tokenRecordStr) {
      syncError = 'No saved session';
      return false;
    }

    const tokenRecord = JSON.parse(tokenRecordStr) as StoredTokenRecord;
    const salt = (await import('./crypto')).fromBase64(tokenRecord.salt);

    // Derive KEK from password
    const kek = await deriveKEK(password, salt);

    // Try to fetch a gist to verify password works
    // (The user's password is only verified by attempting to decrypt and use the DEK)
    try {
      const decryptedToken = await decryptToken(tokenRecord.ciphertext, tokenRecord.iv, kek);

      // Try to fetch user to verify token works
      await getCurrentUser(decryptedToken);

      // Success: set in-memory state
      _dek = null; // Will be loaded on first sync
      _token = decryptedToken;
      _passwordSalt = salt;
      sessionStatus = 'active';
      resetInactivityTimer();
      return true;
    } catch {
      // Token decrypt failed or token is invalid
      syncError = 'Incorrect password or invalid session';
      return false;
    }
  } catch (error) {
    syncError = error instanceof Error ? error.message : 'Unlock failed';
    return false;
  }
}

/** Lock the session: clear DEK and token from memory. */
function lock() {
  _dek = null;
  _token = null;
  if (_inactivityTimer) {
    clearTimeout(_inactivityTimer);
    _inactivityTimer = null;
  }
  sessionStatus = 'locked';
}

/** Reset the inactivity timer (called on mousemove/keydown/click).
 *  Clears the existing timer and starts a new one. */
function resetInactivityTimer() {
  if (_inactivityTimer) {
    clearTimeout(_inactivityTimer);
  }

  const timeoutMs = 30 * 60 * 1000; // 30 minutes
  _inactivityTimer = setTimeout(() => {
    lock();
  }, timeoutMs);
}

/** Load the master config gist to populate linkedGists. */
async function loadLinkedGists(): Promise<void> {
  if (!_token) {
    throw new Error('Not authenticated');
  }

  try {
    // Try to load cached master gist ID
    let masterGistId = localStorage.getItem('tg-master-gist-id') || _masterGistId;

    // If no cached ID, search for it
    if (!masterGistId) {
      const found = await findGistByFilename(_token, 'test-gen-master.json');
      if (!found) {
        // No master config found; start fresh
        linkedGists = [];
        return;
      }
      masterGistId = found.id;
      _masterGistId = masterGistId;
      localStorage.setItem('tg-master-gist-id', masterGistId);
    }

    // Fetch and parse master config
    const gist = await getGist(_token, masterGistId);
    const content = await getGistFileContent(_token, gist, 'test-gen-master.json');
    if (!content) {
      linkedGists = [];
      return;
    }

    const config = parseMasterConfig(JSON.parse(content));
    linkedGists = config.linkedGists;
  } catch (error) {
    console.error('Failed to load linked gists:', error);
    linkedGists = [];
  }
}

/** Backup a class: upload current state to gist.
 *  - Requires active session (throws SessionLockedError if locked)
 *  - Creates gist if not exists, updates if exists
 *  - Updates master config lastSyncedAt
 */
async function backup(classId: string): Promise<void> {
  if (sessionStatus !== 'active' || !_dek || !_token) {
    throw new Error('Session not active');
  }

  try {
    syncError = null;
    syncInProgress = true;

    // Gather data to sync
    const questions = bank.questions.filter(
      (q) => q.classId === classId,
    );
    const customClass = customClasses.classes.find(
      (c) => c.id === classId,
    );

    // Load images (convert Uint8Array to Record)
    const images: Record<string, Uint8Array> = {};
    for (const basename of imageStore.names) {
      try {
        const stored = await imageStore.get(basename);
        if (stored) {
          images[basename] = stored.bytes;
        }
      } catch {
        // Skip missing images
      }
    }

    // Find or create the class gist
    const gistFilename = `test-gen-${classId}.json`;
    let gist = await findGistByFilename(_token, gistFilename);

    // Build encrypted gist
    const dek = _dek;
    const accessKeys = [{
      userId: userId!,
      role: 'owner' as const,
    }];

    const encryptedGist = await buildEncryptedGist(
      classId,
      customClass?.name || classId,
      userId!,
      dek,
      accessKeys,
      questions,
      images,
      customClass,
    );

    // Create or update gist
    const content = JSON.stringify(encryptedGist, null, 2);
    if (gist) {
      gist = await updateGist(_token, gist.id, {
        [gistFilename]: content,
      });
    } else {
      gist = await createGist(
        _token,
        `Test Generator - ${customClass?.name || classId}`,
        { [gistFilename]: content },
        false,
      );
    }

    // Update master config
    const existingMeta = linkedGists.find((g) => g.classId === classId);
    if (existingMeta) {
      existingMeta.lastSyncedAt = Date.now();
    } else {
      linkedGists.push({
        gistId: gist.id,
        classId,
        className: customClass?.name || classId,
        role: 'owner',
        ownerId: userId!,
        lastSyncedAt: Date.now(),
      });
    }
    await _saveMasterConfig();

    // Update snapshot
    localStorage.setItem(
      `tg-last-sync-${gist.id}`,
      JSON.stringify(buildSyncSnapshot(questions)),
    );
  } catch (error) {
    syncError = error instanceof Error ? error.message : 'Backup failed';
    throw error;
  } finally {
    syncInProgress = false;
  }
}

/** Restore a class: fetch gist and detect conflicts.
 *  - Requires active session (throws SessionLockedError if locked)
 *  - Returns ConflictSet; caller shows ConflictModal if conflicts exist
 */
async function restore(classId: string): Promise<ConflictSet> {
  if (sessionStatus !== 'active' || !_dek || !_token) {
    throw new Error('Session not active');
  }

  try {
    syncError = null;
    syncInProgress = true;

    // Find the gist
    const gistFilename = `test-gen-${classId}.json`;
    const gist = await findGistByFilename(_token, gistFilename);
    if (!gist) {
      syncError = 'Gist not found';
      throw new Error('Gist not found');
    }

    // Fetch and decrypt content
    const content = await getGistFileContent(_token, gist, gistFilename);
    if (!content) {
      syncError = 'Gist file not found';
      throw new Error('Gist file not found');
    }

    const encryptedGist = JSON.parse(content);
    const dek = _dek;
    const plaintext = await parseEncryptedGist(encryptedGist, dek);

    // Load local questions for this class
    const local = bank.questions.filter((q) => q.classId === classId);

    // Load last snapshot
    const snapshotStr = localStorage.getItem(`tg-last-sync-${gist.id}`);
    const lastSnapshot = snapshotStr ? JSON.parse(snapshotStr) : {};

    // Detect conflicts
    const conflicts = detectConflicts(local, plaintext.questions, lastSnapshot);

    return conflicts;
  } finally {
    syncInProgress = false;
  }
}

/** Apply conflict resolutions and update local state.
 *  - Merges questions, updates bank, updates snapshot
 */
async function applyRestore(
  classId: string,
  resolutions: ConflictResolution[],
  remote: { questions: any[] },
): Promise<void> {
  try {
    syncError = null;

    // Load local questions
    const local = bank.questions.filter((q) => q.classId === classId);

    // Apply resolutions
    const merged = applyResolutions(local, remote.questions, resolutions);

    // Remove old local questions for this class
    const updated = bank.questions.filter((q) => q.classId !== classId);
    // Add merged questions
    updated.push(...merged);
    // Update bank (direct manipulation + localStorage)
    bank.questions = updated;
    localStorage.setItem('math-test-bank-v2', JSON.stringify(updated));

    // Update snapshot
    const gistFilename = `test-gen-${classId}.json`;
    const gist = await findGistByFilename(_token!, gistFilename);
    if (gist) {
      localStorage.setItem(
        `tg-last-sync-${gist.id}`,
        JSON.stringify(buildSyncSnapshot(merged)),
      );
    }
  } catch (error) {
    syncError = error instanceof Error ? error.message : 'Apply restore failed';
    throw error;
  }
}

/** Backup all linked gists. */
async function backupAll(): Promise<void> {
  for (const meta of linkedGists) {
    await backup(meta.classId);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Private helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Save the master config gist. */
async function _saveMasterConfig(): Promise<void> {
  if (!_token) return;

  let masterGistId = _masterGistId || localStorage.getItem('tg-master-gist-id');

  if (!masterGistId) {
    const found = await findGistByFilename(_token, 'test-gen-master.json');
    if (found) {
      masterGistId = found.id;
      _masterGistId = masterGistId;
      localStorage.setItem('tg-master-gist-id', masterGistId);
    }
  }

  if (masterGistId) {
    const config = buildMasterConfig(userId!, linkedGists);
    await updateGist(_token, masterGistId, {
      'test-gen-master.json': JSON.stringify(config, null, 2),
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Export singleton
// ─────────────────────────────────────────────────────────────────────────────

export const syncState = {
  get sessionStatus() { return sessionStatus; },
  get userId() { return userId; },
  get linkedGists() { return linkedGists; },
  get syncInProgress() { return syncInProgress; },
  get syncError() { return syncError; },

  setup,
  unlock,
  lock,
  resetInactivityTimer,
  loadLinkedGists,
  backup,
  restore,
  applyRestore,
  backupAll,
};
