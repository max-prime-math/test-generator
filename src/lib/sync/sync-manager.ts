import type {
  FanOutBackupResult,
  LocalFile,
  ProviderState,
  RemoteFile,
  StorageLike,
  SyncConflict,
  SyncManifest,
  SyncManifestEntry,
  SyncProvider,
} from './types';

const MANIFEST_KEY = 'tg-sync-manifest-v1';
const ENABLED_KEY = 'tg-sync-enabled-providers-v1';
const SELECTED_RESTORE_PROVIDER_KEY = 'tg-sync-restore-provider-v1';

type SyncDecision =
  | { kind: 'upload' }
  | { kind: 'skip'; remoteFile: RemoteFile | null }
  | { kind: 'conflict'; conflict: SyncConflict };

function defaultManifest(): SyncManifest {
  return { version: 1, entries: [] };
}

function basename(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 1] || path;
}

export async function hashContent(content: string): Promise<string> {
  if (globalThis.crypto?.subtle) {
    const bytes = new TextEncoder().encode(content);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  let hash = 2166136261;
  for (let i = 0; i < content.length; i++) {
    hash ^= content.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export async function buildLocalFile(
  path: string,
  content: string,
  modifiedTime: number,
): Promise<LocalFile> {
  return {
    path,
    name: basename(path),
    content,
    modifiedTime,
    hash: await hashContent(content),
  };
}

export class SyncManager {
  #providers: Record<string, SyncProvider>;
  #storage: StorageLike;
  #providerStates = new Map<string, ProviderState>();
  #manifest: SyncManifest;
  #queue: Promise<unknown> = Promise.resolve();

  constructor(providers: Record<string, SyncProvider>, storage: StorageLike) {
    this.#providers = providers;
    this.#storage = storage;
    this.#manifest = this.#loadManifest();
    this.#ensureEnabledProviders();
    this.#seedProviderStates();
  }

  get providers(): Record<string, SyncProvider> {
    return this.#providers;
  }

  get manifest(): SyncManifest {
    return this.#manifest;
  }

  get providerStates(): ProviderState[] {
    return Array.from(this.#providerStates.values());
  }

  get selectedRestoreProviderId(): string | null {
    return this.#storage.getItem(SELECTED_RESTORE_PROVIDER_KEY);
  }

  setSelectedRestoreProvider(providerId: string): void {
    this.#storage.setItem(SELECTED_RESTORE_PROVIDER_KEY, providerId);
  }

  async refreshProviderStates(): Promise<ProviderState[]> {
    for (const provider of Object.values(this.#providers)) {
      const current = this.#providerStates.get(provider.id) || this.#defaultProviderState(provider.id, provider.displayName);
      const configured = await provider.isConfigured();
      const authenticated = await provider.isAuthenticated();
      const configurable = !provider.isStub;
      const info = provider.getConnectionInfo ? await provider.getConnectionInfo() : {};
      const nextStatus = authenticated
        ? (current.status === 'syncing' ? 'syncing' : current.status === 'error' ? 'error' : current.status === 'conflict-detected' ? 'conflict-detected' : current.status === 'success' ? 'success' : 'ready')
        : !configured
          ? 'not-configured'
          : provider.isStub
          ? 'not-configured'
          : 'needs-authentication';

      this.#providerStates.set(provider.id, {
        ...current,
        displayName: provider.displayName,
        configured,
        authenticated,
        configurable,
        supportsShare: typeof provider.share === 'function',
        isStub: Boolean(provider.isStub),
        status: nextStatus,
        accountLabel: info.accountLabel ?? null,
        remoteLabel: info.remoteLabel ?? null,
        remoteUrl: info.remoteUrl ?? null,
      });
    }

    return this.providerStates;
  }

  async connectProvider(providerId: string, input?: Record<string, unknown>): Promise<void> {
    const provider = this.#requireProvider(providerId);
    this.#setProviderState(providerId, { status: 'syncing', lastError: null, conflicts: [] });
    try {
      await provider.authenticate(input);
      this.setProviderEnabled(providerId, true);
      await this.refreshProviderStates();
      this.#setProviderState(providerId, { status: 'ready', lastError: null, conflicts: [] });
      if (!this.selectedRestoreProviderId) this.setSelectedRestoreProvider(providerId);
    } catch (error) {
      this.#setProviderState(providerId, {
        status: 'error',
        lastError: error instanceof Error ? error.message : 'Provider connection failed',
      });
      throw error;
    }
  }

  async disconnectProvider(providerId: string): Promise<void> {
    const provider = this.#requireProvider(providerId);
    if (provider.disconnect) await provider.disconnect();
    this.setProviderEnabled(providerId, false);
    this.#setProviderState(providerId, {
      status: provider.isStub ? 'not-configured' : 'needs-authentication',
      lastError: null,
      conflicts: [],
      lastSyncAt: null,
      accountLabel: null,
      remoteLabel: null,
      remoteUrl: null,
      authenticated: false,
    });
  }

  setProviderEnabled(providerId: string, enabled: boolean): void {
    const enabledIds = new Set(this.#getEnabledProviderIds());
    if (enabled) enabledIds.add(providerId);
    else enabledIds.delete(providerId);
    this.#storage.setItem(ENABLED_KEY, JSON.stringify(Array.from(enabledIds)));
    this.#setProviderState(providerId, { enabled });
  }

  isProviderEnabled(providerId: string): boolean {
    return this.#getEnabledProviderIds().includes(providerId);
  }

  async listRemoteFiles(providerId: string): Promise<RemoteFile[]> {
    const provider = this.#requireProvider(providerId);
    return provider.listFiles();
  }

  async downloadRemoteFile(providerId: string, remoteId: string): Promise<LocalFile> {
    const provider = this.#requireProvider(providerId);
    return provider.downloadFile(remoteId);
  }

  async shareWithProvider(providerId: string, username: string): Promise<void> {
    const provider = this.#requireProvider(providerId);
    if (!provider.share) throw new Error(`${provider.displayName} does not support sharing`);
    await provider.share(username);
  }

  getManifestEntry(providerId: string, localFilePath: string): SyncManifestEntry | undefined {
    return this.#findManifestEntry(providerId, localFilePath);
  }

  reportConflict(conflict: SyncConflict): void {
    this.#upsertProviderConflict(conflict);
  }

  clearConflict(providerId: string, localFilePath: string): void {
    const current = this.#providerStates.get(providerId);
    if (!current) return;
    this.#providerStates.set(providerId, {
      ...current,
      conflicts: current.conflicts.filter((conflict) => conflict.localFilePath !== localFilePath),
    });
  }

  queueBackup(localFile: LocalFile, providerIds?: string[]): Promise<FanOutBackupResult> {
    const task = this.#queue.then(() => this.backupNow(localFile, providerIds));
    this.#queue = task.catch(() => undefined);
    return task;
  }

  async backupNow(localFile: LocalFile, providerIds?: string[]): Promise<FanOutBackupResult> {
    const targetIds = (providerIds ?? this.#getEnabledProviderIds()).filter((providerId) => {
      const state = this.#providerStates.get(providerId);
      return state?.enabled;
    });

    const results: FanOutBackupResult = {
      attemptedProviders: targetIds,
      uploadedProviders: [],
      skippedProviders: [],
      failedProviders: [],
      conflicts: [],
      results: [],
    };

    for (const providerId of targetIds) {
      const provider = this.#requireProvider(providerId);
      this.#clearProviderConflict(providerId, localFile.path);
      this.#setProviderState(providerId, { status: 'syncing', lastError: null });

      try {
        const remoteFiles = await provider.listFiles();
        const listedRemoteFile = remoteFiles.find((file) => file.path === localFile.path) ?? null;
        const manifestEntry = this.#findManifestEntry(providerId, localFile.path);
        const remoteFile = await this.#hydrateRemoteFile(provider, listedRemoteFile);
        const decision = this.#decideBackup(localFile, remoteFile, manifestEntry, providerId);

        if (decision.kind === 'skip') {
          if (remoteFile) {
            this.#upsertManifestEntry({
              localFilePath: localFile.path,
              providerId,
              remoteId: remoteFile.id,
              lastSyncedHash: remoteFile.hash ?? localFile.hash,
              lastSyncedModifiedTime: remoteFile.modifiedTime,
              lastSuccessfulSyncTime: Date.now(),
            });
          }
          this.#setProviderState(providerId, {
            status: 'success',
            lastSyncAt: Date.now(),
            lastError: null,
          });
          results.skippedProviders.push(providerId);
          results.results.push({ providerId, uploaded: false, skipped: true, remoteFile: decision.remoteFile ?? undefined });
          continue;
        }

        if (decision.kind === 'conflict') {
          this.#setProviderState(providerId, {
            status: 'conflict-detected',
            lastError: decision.conflict.message,
          });
          this.#upsertProviderConflict(decision.conflict);
          results.conflicts.push(decision.conflict);
          results.results.push({ providerId, uploaded: false, skipped: true, conflict: decision.conflict });
          continue;
        }

        const uploaded = await provider.uploadFile(localFile);
        this.#upsertManifestEntry({
          localFilePath: localFile.path,
          providerId,
          remoteId: uploaded.id,
          lastSyncedHash: localFile.hash,
          lastSyncedModifiedTime: uploaded.modifiedTime,
          lastSuccessfulSyncTime: Date.now(),
        });
        this.#setProviderState(providerId, {
          status: 'success',
          lastSyncAt: Date.now(),
          lastError: null,
        });
        results.uploadedProviders.push(providerId);
        results.results.push({ providerId, uploaded: true, skipped: false, remoteFile: uploaded });
      } catch (error) {
        const normalized = error instanceof Error ? error : new Error('Sync failed');
        this.#setProviderState(providerId, {
          status: 'error',
          lastError: normalized.message,
        });
        results.failedProviders.push({ providerId, error: normalized });
        results.results.push({ providerId, uploaded: false, skipped: false, error: normalized });
      }
    }

    return results;
  }

  async #hydrateRemoteFile(
    provider: SyncProvider,
    remoteFile: RemoteFile | null,
  ): Promise<RemoteFile | null> {
    if (!remoteFile) return null;
    if (remoteFile.hash && remoteFile.modifiedTime !== null) return remoteFile;

    const downloaded = await provider.downloadFile(remoteFile.id);
    return {
      ...remoteFile,
      modifiedTime: remoteFile.modifiedTime ?? downloaded.modifiedTime,
      hash: remoteFile.hash ?? await hashContent(downloaded.content),
    };
  }

  #decideBackup(
    localFile: LocalFile,
    remoteFile: RemoteFile | null,
    manifestEntry: SyncManifestEntry | undefined,
    providerId: string,
  ): SyncDecision {
    if (!manifestEntry) {
      if (!remoteFile) return { kind: 'upload' };
      if (remoteFile.hash === localFile.hash) return { kind: 'skip', remoteFile };
      return {
        kind: 'conflict',
        conflict: {
          providerId,
          localFilePath: localFile.path,
          remoteId: remoteFile.id,
          localHash: localFile.hash,
          lastSyncedHash: null,
          remoteHash: remoteFile.hash,
          lastSyncedModifiedTime: null,
          remoteModifiedTime: remoteFile.modifiedTime,
          detectedAt: Date.now(),
          message: `${this.#providers[providerId].displayName} already has an untracked copy of ${localFile.path}`,
        },
      };
    }

    const localChanged = manifestEntry.lastSyncedHash !== localFile.hash;
    const remoteDeleted = remoteFile === null;
    const remoteChanged = remoteDeleted
      || remoteFile.hash !== manifestEntry.lastSyncedHash
      || remoteFile.modifiedTime !== manifestEntry.lastSyncedModifiedTime;

    if (!localChanged && !remoteChanged) {
      return { kind: 'skip', remoteFile };
    }

    if (!localChanged && remoteChanged) {
      return {
        kind: 'conflict',
        conflict: this.#buildConflict(
          providerId,
          localFile,
          remoteFile,
          manifestEntry,
          remoteDeleted
            ? `${this.#providers[providerId].displayName} copy of ${localFile.path} was deleted or moved remotely`
            : `${this.#providers[providerId].displayName} has a newer remote version of ${localFile.path}`,
        ),
      };
    }

    if (localChanged && remoteChanged) {
      return {
        kind: 'conflict',
        conflict: this.#buildConflict(
          providerId,
          localFile,
          remoteFile,
          manifestEntry,
          remoteDeleted
            ? `${this.#providers[providerId].displayName} copy of ${localFile.path} was deleted or moved while local changed`
            : `${this.#providers[providerId].displayName} has a newer conflicting copy of ${localFile.path}`,
        ),
      };
    }

    return { kind: 'upload' };
  }

  #buildConflict(
    providerId: string,
    localFile: LocalFile,
    remoteFile: RemoteFile | null,
    manifestEntry: SyncManifestEntry,
    message: string,
  ): SyncConflict {
    return {
      providerId,
      localFilePath: localFile.path,
      remoteId: remoteFile?.id ?? null,
      localHash: localFile.hash,
      lastSyncedHash: manifestEntry.lastSyncedHash,
      remoteHash: remoteFile?.hash ?? null,
      lastSyncedModifiedTime: manifestEntry.lastSyncedModifiedTime,
      remoteModifiedTime: remoteFile?.modifiedTime ?? null,
      detectedAt: Date.now(),
      message,
    };
  }

  #loadManifest(): SyncManifest {
    const raw = this.#storage.getItem(MANIFEST_KEY);
    if (!raw) return defaultManifest();
    try {
      const parsed = JSON.parse(raw) as SyncManifest;
      if (parsed.version !== 1 || !Array.isArray(parsed.entries)) return defaultManifest();
      return parsed;
    } catch {
      return defaultManifest();
    }
  }

  #saveManifest(): void {
    this.#storage.setItem(MANIFEST_KEY, JSON.stringify(this.#manifest));
  }

  #findManifestEntry(providerId: string, localFilePath: string): SyncManifestEntry | undefined {
    return this.#manifest.entries.find((entry) =>
      entry.providerId === providerId && entry.localFilePath === localFilePath
    );
  }

  #upsertManifestEntry(entry: SyncManifestEntry): void {
    const next = this.#manifest.entries.filter((existing) =>
      !(existing.providerId === entry.providerId && existing.localFilePath === entry.localFilePath)
    );
    next.push(entry);
    this.#manifest = { version: 1, entries: next };
    this.#saveManifest();
  }

  #requireProvider(providerId: string): SyncProvider {
    const provider = this.#providers[providerId];
    if (!provider) throw new Error(`Unknown sync provider: ${providerId}`);
    return provider;
  }

  #ensureEnabledProviders(): void {
    const raw = this.#storage.getItem(ENABLED_KEY);
    if (raw) return;

    const configuredDefaults = Object.values(this.#providers)
      .filter((provider) => provider.isConfigured())
      .map((provider) => provider.id);
    this.#storage.setItem(ENABLED_KEY, JSON.stringify(configuredDefaults));
  }

  #getEnabledProviderIds(): string[] {
    const raw = this.#storage.getItem(ENABLED_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
    } catch {
      return [];
    }
  }

  #seedProviderStates(): void {
    for (const provider of Object.values(this.#providers)) {
      this.#providerStates.set(
        provider.id,
        this.#defaultProviderState(provider.id, provider.displayName),
      );
    }
  }

  #defaultProviderState(id: string, displayName: string): ProviderState {
    return {
      id,
      displayName,
      enabled: this.#getEnabledProviderIds().includes(id),
      configured: false,
      authenticated: false,
      configurable: true,
      supportsShare: false,
      isStub: false,
      status: 'not-configured',
      lastSyncAt: null,
      lastError: null,
      conflicts: [],
      accountLabel: null,
      remoteLabel: null,
      remoteUrl: null,
    };
  }

  #setProviderState(providerId: string, patch: Partial<ProviderState>): void {
    const current = this.#providerStates.get(providerId);
    if (!current) return;
    this.#providerStates.set(providerId, { ...current, ...patch });
  }

  #upsertProviderConflict(conflict: SyncConflict): void {
    const current = this.#providerStates.get(conflict.providerId);
    if (!current) return;
    const next = current.conflicts.filter((item) => item.localFilePath !== conflict.localFilePath);
    next.push(conflict);
    this.#providerStates.set(conflict.providerId, {
      ...current,
      conflicts: next.sort((a, b) => a.localFilePath.localeCompare(b.localFilePath)),
      status: 'conflict-detected',
    });
  }

  #clearProviderConflict(providerId: string, localFilePath: string): void {
    const current = this.#providerStates.get(providerId);
    if (!current) return;
    this.#providerStates.set(providerId, {
      ...current,
      conflicts: current.conflicts.filter((conflict) => conflict.localFilePath !== localFilePath),
    });
  }
}
