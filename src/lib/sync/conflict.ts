import type {
  ConflictSet,
  ConflictItem,
  ConflictResolution,
  SyncSnapshot,
} from './types';
import type { Question } from '../types';

// ── Snapshot building ────────────────────────────────────────────────────────

/** Build a snapshot of questions (ID → last modification time).
 *  Used to detect what changed since the last sync. */
export function buildSyncSnapshot(questions: Question[]): SyncSnapshot {
  const snapshot: SyncSnapshot = {};
  for (const q of questions) {
    snapshot[q.id] = q.updatedAt ?? q.createdAt;
  }
  return snapshot;
}

// ── Conflict detection ───────────────────────────────────────────────────────

/** Detect conflicts between local and remote questions.
 *  Compares current state with last known snapshot to determine what changed.
 *
 *  Rules:
 *  - Local-only, not in snapshot → addedLocally (auto-keep, no conflict)
 *  - Local-only, was in snapshot → deletedRemotely (conflict: user deleted remotely)
 *  - Remote-only → addedRemotely (auto-pull, no conflict)
 *  - Both present, both newer than snapshot → both-edited (conflict: need user choice)
 *  - Both present, only one newer → autoResolved (newer version wins)
 */
export function detectConflicts(
  local: Question[],
  remote: Question[],
  lastSnapshot: SyncSnapshot,
): ConflictSet {
  const conflictSet: ConflictSet = {
    conflicts: [],
    addedLocally: [],
    addedRemotely: [],
    autoResolved: [],
  };

  const localMap = new Map(local.map((q) => [q.id, q]));
  const remoteMap = new Map(remote.map((q) => [q.id, q]));

  // Process all question IDs seen in local, remote, or snapshot
  const allIds = new Set([
    ...localMap.keys(),
    ...remoteMap.keys(),
    ...Object.keys(lastSnapshot),
  ]);

  for (const id of allIds) {
    const localQ = localMap.get(id);
    const remoteQ = remoteMap.get(id);
    const snapshotTime = lastSnapshot[id];

    // Local exists, remote doesn't
    if (localQ && !remoteQ) {
      if (snapshotTime === undefined) {
        // Local-only, never seen before → added locally (auto-keep)
        conflictSet.addedLocally.push(localQ);
      } else {
        // Was in snapshot but deleted remotely → conflict
        const conflict: ConflictItem = {
          type: 'deleted-remotely',
          questionId: id,
          local: localQ,
          remote: null,
        };
        conflictSet.conflicts.push(conflict);
      }
      continue;
    }

    // Remote exists, local doesn't
    if (remoteQ && !localQ) {
      // Must be added remotely (auto-pull)
      conflictSet.addedRemotely.push(remoteQ);
      continue;
    }

    // Both exist
    if (localQ && remoteQ) {
      const localTime = localQ.updatedAt ?? localQ.createdAt;
      const remoteTime = remoteQ.updatedAt ?? remoteQ.createdAt;
      const lastTime = snapshotTime ?? 0;

      const localChanged = localTime > lastTime;
      const remoteChanged = remoteTime > lastTime;

      if (localChanged && remoteChanged) {
        // Both edited since last sync → conflict (user must choose)
        const conflict: ConflictItem = {
          type: 'both-edited',
          questionId: id,
          local: localQ,
          remote: remoteQ,
        };
        conflictSet.conflicts.push(conflict);
      } else if (localChanged) {
        // Only local changed → keep local (auto-resolve)
        conflictSet.autoResolved.push(localQ);
      } else if (remoteChanged) {
        // Only remote changed → use remote (auto-resolve)
        conflictSet.autoResolved.push(remoteQ);
      } else {
        // Neither changed (both older than snapshot) → keep local
        conflictSet.autoResolved.push(localQ);
      }
      continue;
    }
  }

  return conflictSet;
}

// ── Applying resolutions ─────────────────────────────────────────────────────

/** Apply user's conflict resolutions and merge the question banks.
 *  - For each conflict, use the chosen version (local or remote, or delete)
 *  - For auto-resolved, include as-is
 *  - For addedRemotely, include as-is
 *  Returns the final merged question array.
 */
export function applyResolutions(
  local: Question[],
  remote: Question[],
  resolutions: ConflictResolution[],
): Question[] {
  const localMap = new Map(local.map((q) => [q.id, q]));
  const remoteMap = new Map(remote.map((q) => [q.id, q]));

  // Build a resolution map for O(1) lookup
  const resolutionMap = new Map(resolutions.map((r) => [r.questionId, r.choice]));

  const result = new Map<string, Question>();

  // First, add all local questions (default position)
  for (const q of local) {
    result.set(q.id, q);
  }

  // Process remote questions, applying resolutions and additions
  for (const q of remote) {
    const resolution = resolutionMap.get(q.id);

    if (resolution === 'remote') {
      // User explicitly chose remote → replace local
      result.set(q.id, q);
    } else if (resolution === 'delete') {
      // User chose to delete
      result.delete(q.id);
    } else if (resolution === 'local') {
      // User chose local → keep what we have
      // (already in result from the local loop above)
    } else if (!localMap.has(q.id)) {
      // No resolution needed; this was added remotely → include it
      result.set(q.id, q);
    }
  }

  // Return as array in insertion order
  return Array.from(result.values());
}
