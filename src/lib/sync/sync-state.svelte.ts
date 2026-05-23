import { bank } from '../bank.svelte';
import { imageStore } from '../image-store.svelte';
import { customClasses } from '../custom-classes.svelte';
import { testLibrary } from '../test-library.svelte';
import { createSyncProviders } from './providers';
import { buildLocalFile, SyncManager } from './sync-manager';
import {
  buildClassFile,
  parseClassFile,
  buildIndex,
  parseIndex,
  classFilename,
  buildTestFile,
  parseTestFile,
  buildTestsIndex,
  parseTestsIndex,
  testFilename,
  TESTS_INDEX_FILENAME,
  INDEX_FILENAME,
} from './sync-format';
import { detectConflicts, applyResolutions, buildSyncSnapshot } from './conflict';
import type {
  ConflictTarget,
  ProviderConflictPreview,
  SessionStatus,
  LinkedClassMeta,
  ConflictSet,
  ConflictResolution,
  ClassSyncFile,
  LocalFile,
  ProviderState,
  SyncConflict,
  TestConflictResolutionChoice,
} from './types';

let sessionStatus = $state<SessionStatus>('unauthenticated');
let userId = $state<string | null>(null);
let linkedClasses = $state<LinkedClassMeta[]>([]);
let syncInProgress = $state(false);
let syncError = $state<string | null>(null);
let selectedRestoreProviderId = $state<string | null>(null);

const manager = new SyncManager(createSyncProviders(localStorage), localStorage);
let providers = $state<ProviderState[]>(manager.providerStates);

void init();

async function init(): Promise<void> {
  try {
    await refreshProviders();
    if (!selectedRestoreProviderId) return;
    await loadLinkedClasses(selectedRestoreProviderId);
  } catch (error) {
    console.error('Failed to initialize sync providers:', error);
    syncError = error instanceof Error ? error.message : 'Failed to initialize sync providers';
  }
}

async function refreshProviders(): Promise<void> {
  providers = await manager.refreshProviderStates();
  selectedRestoreProviderId = manager.selectedRestoreProviderId;

  const authenticated = providers.filter((provider) => provider.authenticated);
  sessionStatus = authenticated.length > 0 ? 'active' : 'unauthenticated';
  userId = providers.find((provider) => provider.id === 'github')?.accountLabel ?? authenticated[0]?.accountLabel ?? null;

  if (!selectedRestoreProviderId) {
    const firstReady = authenticated[0];
    if (firstReady) {
      manager.setSelectedRestoreProvider(firstReady.id);
      selectedRestoreProviderId = firstReady.id;
    }
  }
}

async function setup(pat: string): Promise<void> {
  await connectProvider('github', { token: pat });
}

async function connectProvider(providerId: string, input?: Record<string, unknown>): Promise<void> {
  try {
    syncError = null;
    syncInProgress = true;
    await manager.connectProvider(providerId, input);
    await refreshProviders();
    await ensureIndexFiles(providerId);
    await loadLinkedClasses(providerId);
  } catch (error) {
    syncError = error instanceof Error ? error.message : 'Provider setup failed';
    throw error;
  } finally {
    syncInProgress = false;
  }
}

async function disconnectProvider(providerId: string): Promise<void> {
  try {
    syncError = null;
    syncInProgress = true;
    await manager.disconnectProvider(providerId);
    if (selectedRestoreProviderId === providerId) {
      const next = manager.providerStates.find((provider) => provider.authenticated)?.id ?? null;
      if (next) manager.setSelectedRestoreProvider(next);
    }
    await refreshProviders();
    if (sessionStatus === 'unauthenticated') linkedClasses = [];
    else if (selectedRestoreProviderId) await loadLinkedClasses(selectedRestoreProviderId);
  } catch (error) {
    syncError = error instanceof Error ? error.message : 'Disconnect failed';
    throw error;
  } finally {
    syncInProgress = false;
  }
}

function signOut() {
  void disconnectProvider('github');
}

async function setProviderEnabled(providerId: string, enabled: boolean): Promise<void> {
  manager.setProviderEnabled(providerId, enabled);
  await refreshProviders();
}

async function setRestoreProvider(providerId: string): Promise<void> {
  manager.setSelectedRestoreProvider(providerId);
  selectedRestoreProviderId = providerId;
  await loadLinkedClasses(providerId);
}

async function loadLinkedClasses(providerId = selectedRestoreProviderId): Promise<void> {
  if (!providerId) {
    linkedClasses = [];
    return;
  }

  try {
    const indexFile = await readRemoteJson(providerId, INDEX_FILENAME);
    linkedClasses = indexFile ? parseIndex(indexFile).classes : [];
  } catch (error) {
    console.error('Failed to load sync index:', error);
    linkedClasses = [];
  }
}

async function backup(classId: string, providerIds?: string[]): Promise<void> {
  try {
    syncError = null;
    syncInProgress = true;

    const file = await buildClassLocalFile(classId);
    const result = await manager.queueBackup(file, providerIds);
    const successfulProviders = result.results
      .filter((entry) => !entry.error && !entry.conflict)
      .map((entry) => entry.providerId);

    if (successfulProviders.length > 0) {
      const now = Date.now();
      const customClass = customClasses.classes.find((cls) => cls.id === classId);
      const className = customClass?.name || classId;
      const filename = classFilename(classId);
      const nextLinkedClasses = upsertLinkedClassMeta({
        classId,
        className,
        filename,
        role: 'owner',
        ownerId: userId || 'local-user',
        lastSyncedAt: now,
      });

      await saveIndexToProviders(successfulProviders, nextLinkedClasses);
      linkedClasses = nextLinkedClasses;
      localStorage.setItem(
        `tg-last-sync-${classId}`,
        JSON.stringify(buildSyncSnapshot(bank.questions.filter((q) => q.classId === classId))),
      );
    }

    if (selectedRestoreProviderId) await loadLinkedClasses(selectedRestoreProviderId);
    throwIfNoProviderSucceeded(result, 'Backup failed');
  } catch (error) {
    syncError = error instanceof Error ? error.message : 'Backup failed';
    throw error;
  } finally {
    syncInProgress = false;
  }
}

async function restore(
  classId: string,
  providerId = selectedRestoreProviderId,
): Promise<{ conflicts: ConflictSet; file: ClassSyncFile }> {
  if (!providerId) throw new Error('No restore provider selected');

  try {
    syncError = null;
    syncInProgress = true;

    const filename = classFilename(classId);
    const remoteJson = await readRemoteJson(providerId, filename);
    if (!remoteJson) throw new Error('Class file not found in remote backup');

    const remoteFile = parseClassFile(remoteJson);
    const local = bank.questions.filter((q) => q.classId === classId);
    const snapshotStr = localStorage.getItem(`tg-last-sync-${classId}`);
    const lastSnapshot = snapshotStr ? JSON.parse(snapshotStr) : {};

    return { conflicts: detectConflicts(local, remoteFile.questions, lastSnapshot), file: remoteFile };
  } finally {
    syncInProgress = false;
  }
}

async function applyRestore(
  classId: string,
  resolutions: ConflictResolution[],
  remoteFile: ClassSyncFile,
): Promise<void> {
  try {
    syncError = null;

    const local = bank.questions.filter((q) => q.classId === classId);
    const merged = applyResolutions(local, remoteFile.questions, resolutions);

    const updated = bank.questions.filter((q) => q.classId !== classId);
    updated.push(...merged);
    bank.questions = updated;

    for (const [basename, b64] of Object.entries(remoteFile.images)) {
      try {
        const binary = atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const dot = basename.lastIndexOf('.');
        const stem = dot >= 0 ? basename.slice(0, dot) : basename;
        const ext = dot >= 0 ? basename.slice(dot + 1) : 'png';
        await imageStore.put(stem, bytes, ext);
      } catch {
        // Keep restoring questions even if one image payload is malformed.
      }
    }

    if (remoteFile.customClass) {
      const exists = customClasses.classes.find((cls) => cls.id === remoteFile.customClass!.id);
      if (!exists) {
        localStorage.setItem(
          'math-test-custom-classes-v1',
          JSON.stringify([...customClasses.classes, remoteFile.customClass]),
        );
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

async function backupAll(providerIds?: string[]): Promise<void> {
  const classIds = customClasses.classes
    .filter((cls) => bank.questions.some((q) => q.classId === cls.id))
    .map((cls) => cls.id);

  for (const classId of classIds) {
    await backup(classId, providerIds);
  }
}

async function backupEverything(providerId?: string): Promise<void> {
  const scopedProviders = providerId ? [providerId] : undefined;
  await backupAll(scopedProviders);
  for (const entry of testLibrary.tests) {
    await backupTest(entry.id, scopedProviders);
  }
}

async function share(githubUsername: string): Promise<void> {
  try {
    syncError = null;
    await manager.shareWithProvider('github', githubUsername);
  } catch (error) {
    syncError = error instanceof Error ? error.message : 'Share failed';
    throw error;
  }
}

async function backupTest(testId: string, providerIds?: string[]): Promise<void> {
  const entry = testLibrary.get(testId);
  if (!entry) throw new Error('Test not found locally');

  try {
    syncError = null;
    syncInProgress = true;

    const file = await buildTestLocalFile(testId);
    const result = await manager.queueBackup(file, providerIds);
    const successfulProviders = result.results
      .filter((syncResult) => !syncResult.error && !syncResult.conflict)
      .map((syncResult) => syncResult.providerId);

    if (successfulProviders.length > 0) {
      await saveTestsIndexToProviders(successfulProviders);
    }

    throwIfNoProviderSucceeded(result, 'Test backup failed');
  } catch (error) {
    syncError = error instanceof Error ? error.message : 'Test backup failed';
    throw error;
  } finally {
    syncInProgress = false;
  }
}

async function restoreTests(providerId = selectedRestoreProviderId): Promise<number> {
  if (!providerId) throw new Error('No restore provider selected');

  try {
    syncError = null;
    syncInProgress = true;

    const indexJson = await readRemoteJson(providerId, TESTS_INDEX_FILENAME);
    if (!indexJson) return 0;

    const remoteIndex = parseTestsIndex(indexJson);
    let pulled = 0;

    for (const entry of remoteIndex.tests) {
      const remoteFile = await manager.downloadRemoteFile(providerId, entry.filename).catch((error) => {
        if (error instanceof Error && error.message.includes('not found')) return null;
        throw error;
      });
      if (!remoteFile) continue;

      const parsed = parseTestFile(JSON.parse(remoteFile.content));
      const local = testLibrary.get(entry.id);

      if (local) {
        const localFile = await buildTestLocalFile(entry.id);
        const remoteHash = await buildLocalFile(entry.filename, remoteFile.content, remoteFile.modifiedTime).then((file) => file.hash);
        const manifestEntry = manager.getManifestEntry(providerId, entry.filename);
        const localChanged = manifestEntry ? localFile.hash !== manifestEntry.lastSyncedHash : true;
        const remoteChanged = manifestEntry
          ? remoteHash !== manifestEntry.lastSyncedHash || remoteFile.modifiedTime !== manifestEntry.lastSyncedModifiedTime
          : true;

        if (localChanged && remoteChanged && localFile.hash !== remoteHash) {
          manager.reportConflict({
            providerId,
            localFilePath: entry.filename,
            remoteId: entry.filename,
            localHash: localFile.hash,
            lastSyncedHash: manifestEntry?.lastSyncedHash ?? null,
            remoteHash,
            lastSyncedModifiedTime: manifestEntry?.lastSyncedModifiedTime ?? null,
            remoteModifiedTime: remoteFile.modifiedTime,
            detectedAt: Date.now(),
            message: `${providerId} has a conflicting saved test for ${local.name}`,
          });
          await refreshProviders();
          continue;
        }

        if (local.updatedAt >= parsed.test.updatedAt) continue;
      }

      testLibrary.mergeRemote(parsed.test);
      pulled++;
    }

    return pulled;
  } catch (error) {
    syncError = error instanceof Error ? error.message : 'Test restore failed';
    throw error;
  } finally {
    syncInProgress = false;
  }
}

async function ensureIndexFiles(providerId: string): Promise<void> {
  const providerState = providers.find((provider) => provider.id === providerId);
  const ownerId = providerState?.accountLabel ?? userId ?? 'local-user';

  const indexJson = await readRemoteJson(providerId, INDEX_FILENAME);
  if (!indexJson) {
    const emptyIndex = await buildLocalFile(
      INDEX_FILENAME,
      JSON.stringify(buildIndex(ownerId, []), null, 2),
      Date.now(),
    );
    await manager.backupNow(emptyIndex, [providerId]);
  }

  const testsIndexJson = await readRemoteJson(providerId, TESTS_INDEX_FILENAME);
  if (!testsIndexJson) {
    const emptyTestsIndex = await buildLocalFile(
      TESTS_INDEX_FILENAME,
      JSON.stringify(buildTestsIndex([]), null, 2),
      Date.now(),
    );
    await manager.backupNow(emptyTestsIndex, [providerId]);
  }
}

async function buildClassLocalFile(classId: string): Promise<LocalFile> {
  const questions = bank.questions.filter((q) => q.classId === classId);
  const customClass = customClasses.classes.find((cls) => cls.id === classId);

  const imageNames = new Set<string>();
  for (const question of questions) {
    if (question.images) {
      for (const image of question.images) imageNames.add(image);
    }
  }

  const images: Record<string, string> = {};
  for (const basename of imageNames) {
    try {
      const stored = await imageStore.get(basename);
      if (!stored) continue;
      let binary = '';
      const chunk = 8192;
      for (let i = 0; i < stored.bytes.length; i += chunk) {
        const slice = stored.bytes.subarray(i, Math.min(i + chunk, stored.bytes.length));
        binary += String.fromCharCode(...Array.from(slice));
      }
      images[basename] = btoa(binary);
    } catch {
      // Missing images should not block backing up the rest of the class.
    }
  }

  const file = buildClassFile(
    classId,
    customClass?.name || classId,
    userId || 'local-user',
    questions,
    images,
    customClass,
  );

  return buildLocalFile(
    classFilename(classId),
    JSON.stringify(file, null, 2),
    file.meta.lastModified,
  );
}

async function buildTestLocalFile(testId: string): Promise<LocalFile> {
  const entry = testLibrary.get(testId);
  if (!entry) throw new Error('Test not found locally');

  return buildLocalFile(
    testFilename(testId),
    JSON.stringify(buildTestFile(entry), null, 2),
    entry.updatedAt,
  );
}

async function saveIndexToProviders(providerIds: string[], nextLinkedClasses: LinkedClassMeta[]): Promise<void> {
  const ownerId = userId || 'local-user';
  const indexFile = await buildLocalFile(
    INDEX_FILENAME,
    JSON.stringify(buildIndex(ownerId, nextLinkedClasses), null, 2),
    Date.now(),
  );

  for (const providerId of providerIds) {
    await manager.backupNow(indexFile, [providerId]);
  }
}

async function saveTestsIndexToProviders(providerIds: string[]): Promise<void> {
  const indexFile = await buildLocalFile(
    TESTS_INDEX_FILENAME,
    JSON.stringify(buildTestsIndex(testLibrary.tests), null, 2),
    Date.now(),
  );

  for (const providerId of providerIds) {
    await manager.backupNow(indexFile, [providerId]);
  }
}

async function readRemoteJson(providerId: string, remotePath: string): Promise<unknown | null> {
  const remoteFile = await manager.listRemoteFiles(providerId)
    .then((files) => files.find((file) => file.path === remotePath) ?? null)
    .then((file) => (file ? manager.downloadRemoteFile(providerId, file.id) : null))
    .catch((error) => {
      if (error instanceof Error && error.message.includes('not found')) return null;
      throw error;
    });
  if (!remoteFile) return null;
  return JSON.parse(remoteFile.content);
}

function upsertLinkedClassMeta(meta: LinkedClassMeta): LinkedClassMeta[] {
  const next = linkedClasses.filter((existing) => existing.classId !== meta.classId);
  next.push(meta);
  return next.sort((a, b) => a.className.localeCompare(b.className));
}

function throwIfNoProviderSucceeded(
  result: { results: Array<{ providerId: string; error?: Error; conflict?: unknown }> },
  fallbackMessage: string,
): void {
  const succeeded = result.results.some((entry) => !entry.error && !entry.conflict);
  if (succeeded) return;

  const conflict = result.results.find((entry) => entry.conflict);
  if (conflict) throw new Error(`Conflict detected while syncing to ${conflict.providerId}`);

  const failure = result.results.find((entry) => entry.error);
  if (failure?.error) throw failure.error;

  throw new Error(fallbackMessage);
}

function classifyConflict(conflict: SyncConflict): ConflictTarget {
  if (conflict.localFilePath.startsWith('tests/') && conflict.localFilePath.endsWith('.json')) {
    return {
      kind: 'test',
      testId: conflict.localFilePath.slice('tests/'.length, -'.json'.length),
    };
  }

  if (!conflict.localFilePath.includes('/') && conflict.localFilePath.endsWith('.json') && conflict.localFilePath !== INDEX_FILENAME) {
    return {
      kind: 'class',
      classId: conflict.localFilePath.slice(0, -'.json'.length),
    };
  }

  return { kind: 'other' };
}

async function reviewConflict(conflict: SyncConflict): Promise<{ classId: string; conflicts: ConflictSet; remoteFile: ClassSyncFile } | null> {
  const target = classifyConflict(conflict);
  if (target.kind !== 'class') return null;
  const { conflicts, file } = await restore(target.classId, conflict.providerId);
  return { classId: target.classId, conflicts, remoteFile: file };
}

async function downloadConflictCopy(conflict: SyncConflict): Promise<void> {
  if (!conflict.remoteId) throw new Error('Remote conflict copy is not available');
  const remoteFile = await manager.downloadRemoteFile(conflict.providerId, conflict.remoteId);
  const stamp = new Date(conflict.detectedAt).toISOString().slice(0, 10);
  const dot = remoteFile.name.lastIndexOf('.');
  const stem = dot >= 0 ? remoteFile.name.slice(0, dot) : remoteFile.name;
  const ext = dot >= 0 ? remoteFile.name.slice(dot) : '.json';
  const filename = `${stem} (conflict from ${conflict.providerId} ${stamp})${ext}`;
  const blob = new Blob([remoteFile.content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function importRemoteTestConflict(conflict: SyncConflict): Promise<void> {
  const target = classifyConflict(conflict);
  if (target.kind !== 'test' || !conflict.remoteId) throw new Error('Conflict is not a saved test');
  const remoteFile = await manager.downloadRemoteFile(conflict.providerId, conflict.remoteId);
  const parsed = parseTestFile(JSON.parse(remoteFile.content));
  const stamp = new Date(conflict.detectedAt).toISOString().slice(0, 10);
  testLibrary.saveRemoteCopyAsConflict(parsed.test, `conflict ${conflict.providerId} ${stamp}`);
}

async function resolveTestConflict(
  conflict: SyncConflict,
  choice: TestConflictResolutionChoice,
): Promise<void> {
  const target = classifyConflict(conflict);
  if (target.kind !== 'test' || !conflict.remoteId) throw new Error('Conflict is not a saved test');
  const remoteFile = await manager.downloadRemoteFile(conflict.providerId, conflict.remoteId);
  const parsed = parseTestFile(JSON.parse(remoteFile.content));
  const stamp = new Date(conflict.detectedAt).toISOString().slice(0, 10);

  if (choice === 'remote') {
    testLibrary.replaceWithRemote(parsed.test);
  } else if (choice === 'save-both') {
    testLibrary.saveRemoteCopyAsConflict(parsed.test, `conflict ${conflict.providerId} ${stamp}`);
  }

  dismissConflict(conflict);
}

async function getConflictPreview(conflict: SyncConflict): Promise<ProviderConflictPreview> {
  const target = classifyConflict(conflict);
  const remoteText = conflict.remoteId
    ? (await manager.downloadRemoteFile(conflict.providerId, conflict.remoteId)).content
    : '// Remote file missing';
  const localText = await buildConflictLocalText(conflict, target);

  return {
    conflict,
    target,
    localLabel: 'Local',
    remoteLabel: `${conflict.providerId} remote`,
    localText,
    remoteText: formatJsonText(remoteText),
  };
}

async function buildConflictLocalText(
  conflict: SyncConflict,
  target: ConflictTarget,
): Promise<string> {
  if (target.kind === 'class') {
    const localFile = await buildClassLocalFile(target.classId);
    return formatJsonText(localFile.content);
  }

  if (target.kind === 'test') {
    const existing = testLibrary.get(target.testId);
    if (!existing) return '// Local saved test missing';
    const localFile = await buildTestLocalFile(target.testId);
    return formatJsonText(localFile.content);
  }

  const manifestEntry = manager.getManifestEntry(conflict.providerId, conflict.localFilePath);
  return formatJsonText(JSON.stringify({
    localFilePath: conflict.localFilePath,
    manifestEntry,
    note: 'No local JSON preview available for this file type yet.',
  }, null, 2));
}

function formatJsonText(content: string): string {
  try {
    return JSON.stringify(JSON.parse(content), null, 2);
  } catch {
    return content;
  }
}

function dismissConflict(conflict: SyncConflict): void {
  manager.clearConflict(conflict.providerId, conflict.localFilePath);
  providers = manager.providerStates;
}

export const syncState = {
  get sessionStatus() { return sessionStatus; },
  get userId() { return userId; },
  get linkedClasses() { return linkedClasses; },
  get syncInProgress() { return syncInProgress; },
  get syncError() { return syncError; },
  get providers() { return providers; },
  get selectedRestoreProviderId() { return selectedRestoreProviderId; },
  get providerConflicts() { return providers.flatMap((provider) => provider.conflicts); },
  get repoInfo() {
    const github = providers.find((provider) => provider.id === 'github');
    if (!github?.remoteLabel) return null;
    const [owner, name] = github.remoteLabel.split('/');
    return { owner, name, defaultBranch: 'main' };
  },

  refreshProviders,
  setup,
  connectProvider,
  signOut,
  disconnectProvider,
  setProviderEnabled,
  setRestoreProvider,
  loadLinkedClasses,
  backup,
  backupAll,
  backupEverything,
  restore,
  applyRestore,
  reviewConflict,
  downloadConflictCopy,
  importRemoteTestConflict,
  resolveTestConflict,
  getConflictPreview,
  dismissConflict,
  classifyConflict,
  share,
  backupTest,
  restoreTests,
};
