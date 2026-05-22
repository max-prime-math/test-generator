<script lang="ts">
  import { syncState } from '../../lib/sync/sync-state.svelte';
  import { CLASSES, DEMO_CLASSES } from '../../lib/curriculum';
  import { customClasses } from '../../lib/custom-classes.svelte';
  import { bank } from '../../lib/bank.svelte';
  import { testLibrary } from '../../lib/test-library.svelte';
  import type { ConflictSet, ClassSyncFile, ProviderConflictPreview, ProviderState, SyncConflict } from '../../lib/sync/types';

  interface Props {
    onclose: () => void;
    onsetup: (providerId: string) => void;
    onconflicts: (classId: string, conflicts: ConflictSet, remoteFile: ClassSyncFile, sourceConflict?: SyncConflict | null) => void;
    ontestconflict: (preview: ProviderConflictPreview) => void;
    onpreviewconflict: (preview: ProviderConflictPreview) => void;
    onshare: () => void;
  }

  const { onclose, onsetup, onconflicts, ontestconflict, onpreviewconflict, onshare }: Props = $props();

  let busyClassId = $state<string | null>(null);
  let busyTestId = $state<string | null>(null);
  let busyProviderId = $state<string | null>(null);
  let actionMessage = $state<string | null>(null);
  let isError = $state(false);

  const classesWithQuestions = $derived(
    customClasses.classes.filter((cls) => bank.questions.some((q) => q.classId === cls.id)),
  );

  const allClasses = $derived([...CLASSES, ...DEMO_CLASSES, ...customClasses.classes]);

  const localClassIds = $derived(new Set([
    ...CLASSES.map((c) => c.id),
    ...DEMO_CLASSES.map((c) => c.id),
    ...customClasses.classes.map((c) => c.id),
  ]));

  const missingRepoClasses = $derived(
    syncState.linkedClasses.filter((meta) => !localClassIds.has(meta.classId)),
  );

  const restoreProviders = $derived(
    syncState.providers.filter((provider) => provider.authenticated && !provider.isStub),
  );

  function metaFor(classId: string) {
    return syncState.linkedClasses.find((c) => c.classId === classId);
  }

  function formatRelative(ts: number | null): string {
    if (!ts) return 'Never';
    const diff = Date.now() - ts;
    const min = Math.floor(diff / 60000);
    if (min < 1) return 'Just now';
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    return `${Math.floor(hr / 24)}d ago`;
  }

  function toast(msg: string, error = false) {
    actionMessage = msg;
    isError = error;
    setTimeout(() => (actionMessage = null), 2500);
  }

  function providerStatusLabel(provider: ProviderState): string {
    switch (provider.status) {
      case 'not-configured': return provider.isStub ? 'Planned' : 'Not configured';
      case 'needs-authentication': return 'Needs authentication';
      case 'ready': return 'Ready';
      case 'syncing': return 'Syncing';
      case 'success': return 'Success';
      case 'error': return 'Error';
      case 'conflict-detected': return 'Conflict detected';
    }
  }

  function conflictLabel(conflict: SyncConflict): string {
    const target = syncState.classifyConflict(conflict);
    if (target.kind === 'class') return `Class backup: ${target.classId}`;
    if (target.kind === 'test') return `Saved test: ${target.testId}`;
    return conflict.localFilePath;
  }

  async function backupClass(classId: string) {
    try {
      busyClassId = classId;
      await syncState.backup(classId);
      toast('Backup successful');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Backup failed', true);
    } finally {
      busyClassId = null;
    }
  }

  async function restoreClass(classId: string) {
    try {
      busyClassId = classId;
      const localCount = bank.questions.filter((q) => q.classId === classId).length;
      const { conflicts, file } = await syncState.restore(classId);

      if (localCount === 0 || (conflicts.conflicts.length === 0 && conflicts.addedRemotely.length === 0)) {
        await syncState.applyRestore(classId, [], file);
        const n = conflicts.addedRemotely.length + conflicts.autoResolved.length;
        toast(
          localCount === 0
            ? `Pulled ${file.meta.className || classId}`
            : (n > 0 ? `Applied ${n} remote change${n !== 1 ? 's' : ''}` : 'Already up to date'),
        );
        return;
      }

      onconflicts(classId, conflicts, file);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Restore failed', true);
    } finally {
      busyClassId = null;
    }
  }

  async function backupAllClasses() {
    try {
      busyClassId = 'all';
      await syncState.backupAll();
      toast('All classes backed up');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Backup all failed', true);
    } finally {
      busyClassId = null;
    }
  }

  async function restoreAllMissing() {
    try {
      busyClassId = 'missing-all';
      for (const meta of missingRepoClasses) {
        const { file } = await syncState.restore(meta.classId);
        await syncState.applyRestore(meta.classId, [], file);
      }
      toast(`Pulled ${missingRepoClasses.length} class${missingRepoClasses.length !== 1 ? 'es' : ''}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Restore failed', true);
    } finally {
      busyClassId = null;
    }
  }

  async function backupTest(testId: string) {
    try {
      busyTestId = testId;
      await syncState.backupTest(testId);
      toast('Test backed up');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Test backup failed', true);
    } finally {
      busyTestId = null;
    }
  }

  async function handleRestoreTests() {
    try {
      busyTestId = 'restore-all';
      const count = await syncState.restoreTests();
      toast(count > 0 ? `Pulled ${count} test${count !== 1 ? 's' : ''}` : 'Already up to date');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Test restore failed', true);
    } finally {
      busyTestId = null;
    }
  }

  async function backupProviderNow(providerId: string) {
    try {
      busyProviderId = providerId;
      await syncState.backupEverything(providerId);
      toast('Provider backup complete');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Provider backup failed', true);
    } finally {
      busyProviderId = null;
    }
  }

  async function toggleProvider(providerId: string, enabled: boolean) {
    try {
      await syncState.setProviderEnabled(providerId, enabled);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Provider update failed', true);
    }
  }

  async function disconnectProvider(providerId: string) {
    try {
      busyProviderId = providerId;
      await syncState.disconnectProvider(providerId);
      toast('Provider disconnected');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Disconnect failed', true);
    } finally {
      busyProviderId = null;
    }
  }

  async function selectRestoreProvider(providerId: string) {
    try {
      busyProviderId = providerId;
      await syncState.setRestoreProvider(providerId);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Restore source update failed', true);
    } finally {
      busyProviderId = null;
    }
  }

  async function connectProvider(provider: ProviderState) {
    try {
      busyProviderId = provider.id;
      if (provider.id === 'github' || (provider.id === 'googleDrive' && !provider.configured)) {
        onsetup(provider.id);
        return;
      }
      await syncState.connectProvider(provider.id);
      toast(`${provider.displayName} connected`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Provider connection failed', true);
    } finally {
      busyProviderId = null;
    }
  }

  async function reviewProviderConflict(conflict: SyncConflict) {
    try {
      const reviewed = await syncState.reviewConflict(conflict);
      if (!reviewed) {
        toast('This conflict type cannot be reviewed inline yet', true);
        return;
      }

      const localCount = bank.questions.filter((q) => q.classId === reviewed.classId).length;
      if (localCount === 0 || (reviewed.conflicts.conflicts.length === 0 && reviewed.conflicts.addedRemotely.length === 0)) {
        await syncState.applyRestore(reviewed.classId, [], reviewed.remoteFile);
        syncState.dismissConflict(conflict);
        toast(`Pulled ${reviewed.remoteFile.meta.className || reviewed.classId}`);
        return;
      }

      onconflicts(reviewed.classId, reviewed.conflicts, reviewed.remoteFile, conflict);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Conflict review failed', true);
    }
  }

  async function saveRemoteConflictCopy(conflict: SyncConflict) {
    try {
      await syncState.downloadConflictCopy(conflict);
      toast('Remote conflict copy downloaded');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Download failed', true);
    }
  }

  async function importRemoteTestConflict(conflict: SyncConflict) {
    try {
      const preview = await syncState.getConflictPreview(conflict);
      ontestconflict(preview);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Conflict preview failed', true);
    }
  }

  async function previewConflictJson(conflict: SyncConflict) {
    try {
      const preview = await syncState.getConflictPreview(conflict);
      onpreviewconflict(preview);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'JSON preview failed', true);
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose();
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="backdrop" onclick={onclose}></div>

<aside class="panel" aria-label="Sync panel">
  <header>
    <h2>Backup & Sync</h2>
    <button class="icon-btn" onclick={onclose} title="Close">✕</button>
  </header>

  <div class="status-section">
    <div class="status-card">
      <div class="status-row">
        <span class="dot" class:green={syncState.sessionStatus === 'active'} class:grey={syncState.sessionStatus !== 'active'}></span>
        <span class="status-label">{syncState.sessionStatus === 'active' ? 'Providers connected' : 'No provider connected'}</span>
      </div>
      <p class="status-info">
        Local browser data remains the source of truth. Enabled providers receive fan-out backups; restore uses the selected provider below.
      </p>
      <div class="action-row">
        <button class="ghost-pill" onclick={backupAllClasses} disabled={busyClassId === 'all' || syncState.sessionStatus !== 'active'}>
          {busyClassId === 'all' ? 'Backing up…' : 'Backup all classes'}
        </button>
      </div>
    </div>
  </div>

  {#if actionMessage}
    <div class="action-message" class:error={isError}>{actionMessage}</div>
  {/if}

  <div class="section-header">Providers</div>
  <div class="provider-list">
    {#each syncState.providers as provider (provider.id)}
      <div class="provider-card" class:stub={provider.isStub}>
        <div class="provider-top">
          <div>
            <div class="provider-name">{provider.displayName}</div>
            <div class="provider-meta">
              {providerStatusLabel(provider)}
              {#if provider.lastSyncAt}
                · last sync {formatRelative(provider.lastSyncAt)}
              {/if}
            </div>
          </div>
          <label class="toggle">
            <input
              type="checkbox"
              checked={provider.enabled}
              disabled={!provider.authenticated || provider.isStub}
              onchange={(e) => toggleProvider(provider.id, (e.currentTarget as HTMLInputElement).checked)}
            />
            <span>Enabled</span>
          </label>
        </div>

        {#if provider.accountLabel || provider.remoteLabel}
          <p class="status-info">
            {#if provider.accountLabel}<span>{provider.accountLabel}</span>{/if}
            {#if provider.remoteLabel}
              <span> · </span>
              {#if provider.remoteUrl}
                <a href={provider.remoteUrl} target="_blank" rel="noopener" class="repo-link">{provider.remoteLabel}</a>
              {:else}
                <span>{provider.remoteLabel}</span>
              {/if}
            {/if}
          </p>
        {:else if provider.isStub}
          <p class="status-info">TODO: add OAuth or provider-specific filesystem setup and a real file adapter.</p>
        {/if}

        {#if provider.lastError}
          <div class="provider-warning" class:conflict={provider.status === 'conflict-detected'}>
            {provider.lastError}
          </div>
        {/if}

        <div class="action-row">
          {#if !provider.authenticated && !provider.isStub}
            <button class="ghost-pill" onclick={() => connectProvider(provider)} disabled={busyProviderId === provider.id}>
              {busyProviderId === provider.id ? 'Connecting…' : 'Connect'}
            </button>
          {/if}

          {#if provider.authenticated}
            <button
              class="ghost-pill"
              onclick={() => backupProviderNow(provider.id)}
              disabled={busyProviderId === provider.id}
            >
              {busyProviderId === provider.id ? 'Backing up…' : 'Backup now'}
            </button>
            <button
              class="ghost-pill"
              onclick={() => selectRestoreProvider(provider.id)}
              disabled={busyProviderId === provider.id || syncState.selectedRestoreProviderId === provider.id}
            >
              {syncState.selectedRestoreProviderId === provider.id ? 'Restore source' : 'Use for restore'}
            </button>
            {#if provider.id === 'github'}
              <button class="ghost-pill" onclick={onshare}>Share repo</button>
            {/if}
            <button class="ghost-pill danger" onclick={() => disconnectProvider(provider.id)} disabled={busyProviderId === provider.id}>
              Disconnect
            </button>
          {/if}

          {#if provider.isStub}
            <button class="ghost-pill" disabled>Not implemented</button>
          {/if}
        </div>
      </div>
    {/each}
  </div>

  {#if syncState.providerConflicts.length > 0}
    <div class="section-header">Conflicts</div>
    <div class="provider-list">
      {#each syncState.providerConflicts as conflict (`${conflict.providerId}:${conflict.localFilePath}`)}
        {@const target = syncState.classifyConflict(conflict)}
        <div class="provider-card">
          <div class="provider-name">{conflictLabel(conflict)}</div>
          <div class="provider-meta">{conflict.providerId} · detected {formatRelative(conflict.detectedAt)}</div>
          <p class="status-info">{conflict.message}</p>
          <div class="action-row">
            {#if target.kind === 'class'}
              <button class="ghost-pill" onclick={() => reviewProviderConflict(conflict)}>Review remote</button>
            {/if}
            {#if target.kind === 'test'}
              <button class="ghost-pill" onclick={() => importRemoteTestConflict(conflict)}>Resolve test conflict</button>
            {/if}
            <button class="ghost-pill" onclick={() => previewConflictJson(conflict)}>Preview JSON</button>
            <button class="ghost-pill" onclick={() => saveRemoteConflictCopy(conflict)}>Download remote JSON</button>
            <button class="ghost-pill danger" onclick={() => syncState.dismissConflict(conflict)}>Dismiss</button>
          </div>
        </div>
      {/each}
    </div>
  {/if}

  {#if restoreProviders.length > 0}
    <div class="section-header">Restore Source</div>
    <div class="restore-source">
      {#each restoreProviders as provider (provider.id)}
        <button
          class="restore-pill"
          class:active={syncState.selectedRestoreProviderId === provider.id}
          onclick={() => selectRestoreProvider(provider.id)}
          disabled={busyProviderId === provider.id}
        >
          {provider.displayName}
        </button>
      {/each}
    </div>
  {/if}

  {#if syncState.selectedRestoreProviderId}
    <div class="section-header">Classes</div>

    <div class="class-list">
      {#each classesWithQuestions as cls (cls.id)}
        {@const meta = metaFor(cls.id)}
        {@const busy = busyClassId === cls.id}
        <div class="class-row">
          <div class="class-info">
            <div class="class-name">{cls.name}</div>
            <div class="class-meta">
              {bank.questions.filter((q) => q.classId === cls.id).length} questions
              · {meta ? `remote index updated ${formatRelative(meta.lastSyncedAt)}` : 'not listed in restore source'}
            </div>
          </div>
          <div class="class-actions">
            <button class="ghost-pill" onclick={() => backupClass(cls.id)} disabled={busy} title="Back up to enabled providers">{busy ? '…' : '↑'}</button>
            <button class="ghost-pill" onclick={() => restoreClass(cls.id)} disabled={busy || !meta} title="Restore from selected provider">{busy ? '…' : '↓'}</button>
          </div>
        </div>
      {/each}

      {#if classesWithQuestions.length === 0}
        <p class="empty">No classes with questions yet.</p>
      {/if}
    </div>

    {#if missingRepoClasses.length > 0}
      <div class="section-header">Missing from local</div>

      <div class="class-list">
        {#each missingRepoClasses as cls (cls.classId)}
          {@const busy = busyClassId === cls.classId}
          <div class="class-row">
            <div class="class-info">
              <div class="class-name">{cls.className}</div>
              <div class="class-meta">Present in selected restore source, not in local state</div>
            </div>
            <div class="class-actions">
              <button class="ghost-pill" onclick={() => restoreClass(cls.classId)} disabled={busy} title="Pull from selected provider">{busy ? '…' : '↓'}</button>
            </div>
          </div>
        {/each}
      </div>

      <div class="action-row" style="padding: 0 1.25rem 1rem;">
        <button class="ghost-pill" onclick={restoreAllMissing} disabled={busyClassId === 'missing-all'}>
          {busyClassId === 'missing-all' ? 'Pulling…' : 'Pull all missing'}
        </button>
      </div>
    {/if}

    <div class="section-header">Saved Tests</div>
    <div class="class-list">
      {#each testLibrary.tests as entry (entry.id)}
        {@const busy = busyTestId === entry.id}
        <div class="class-row">
          <div class="class-info">
            <div class="class-name">{entry.name}</div>
            <div class="class-meta">
              {entry.classId ? (allClasses.find((c) => c.id === entry.classId)?.name ?? entry.classId) : 'Uncategorized'}
              · updated {formatRelative(entry.updatedAt)}
            </div>
          </div>
          <div class="class-actions">
            <button class="ghost-pill" onclick={() => backupTest(entry.id)} disabled={busy} title="Back up to enabled providers">{busy ? '…' : '↑'}</button>
          </div>
        </div>
      {/each}

      {#if testLibrary.tests.length === 0}
        <p class="empty">No saved tests yet.</p>
      {/if}
    </div>

    <div class="action-row" style="padding: 0 1.25rem 1rem;">
      <button class="ghost-pill" onclick={handleRestoreTests} disabled={busyTestId === 'restore-all'}>
        {busyTestId === 'restore-all' ? 'Pulling…' : 'Pull all tests'}
      </button>
    </div>
  {/if}

  <footer>
    <p class="footer-note">Remote deletes remain disabled. Conflicts are surfaced instead of overwritten silently.</p>
  </footer>
</aside>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.15);
    z-index: 99;
    animation: fade-in 0.2s ease-out;
  }

  @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }

  .panel {
    position: fixed;
    top: 52px;
    right: 0;
    bottom: 0;
    width: 380px;
    max-width: 100vw;
    background: var(--bg);
    border-left: 1px solid var(--border);
    box-shadow: -4px 0 16px rgba(0, 0, 0, 0.08);
    z-index: 100;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    animation: slide-in 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  }

  @keyframes slide-in { from { transform: translateX(100%); } to { transform: translateX(0); } }

  header {
    display: flex;
    align-items: center;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  header h2 { flex: 1; font-size: 16px; font-weight: 600; margin: 0; }

  .status-section { padding: 1rem 1.25rem; }

  .status-card,
  .provider-card {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 1rem;
    background: var(--bg-2);
  }

  .provider-card.stub {
    opacity: 0.82;
  }

  .status-row,
  .provider-top {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
  }

  .provider-top {
    justify-content: space-between;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
    margin-top: 0.3rem;
  }

  .dot.green { background: #16a34a; }
  .dot.grey { background: var(--text-2); }

  .status-label { font-size: 13px; font-weight: 600; }
  .status-info { font-size: 12px; color: var(--text-2); margin: 0.45rem 0 0.75rem 0; line-height: 1.5; }
  .provider-name { font-size: 13px; font-weight: 600; }
  .provider-meta { font-size: 11px; color: var(--text-2); margin-top: 2px; }
  .repo-link { color: var(--primary); text-decoration: none; }
  .repo-link:hover { text-decoration: underline; }

  .provider-list,
  .class-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0 0.75rem 0.75rem;
  }

  .provider-warning {
    margin-bottom: 0.75rem;
    padding: 0.5rem 0.625rem;
    border-radius: var(--radius);
    background: color-mix(in srgb, var(--danger) 10%, transparent);
    color: var(--danger);
    font-size: 12px;
    line-height: 1.4;
  }

  .provider-warning.conflict {
    background: color-mix(in srgb, #d97706 14%, transparent);
    color: #b45309;
  }

  .toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 11px;
    color: var(--text-2);
  }

  .restore-source {
    display: flex;
    gap: 0.5rem;
    padding: 0 1.25rem 0.75rem;
    flex-wrap: wrap;
  }

  .restore-pill {
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 100px;
    padding: 4px 10px;
    font-size: 12px;
    color: var(--text-2);
  }

  .restore-pill.active {
    border-color: var(--primary);
    color: var(--primary);
    background: color-mix(in srgb, var(--primary) 8%, transparent);
  }

  .action-row {
    display: flex;
    gap: 0.375rem;
    flex-wrap: wrap;
  }

  .action-message {
    margin: 0 1.25rem 0.75rem 1.25rem;
    padding: 0.5rem 0.75rem;
    border-radius: var(--radius);
    font-size: 12px;
    background: color-mix(in srgb, var(--primary) 8%, var(--bg-2));
    color: var(--text);
    border: 1px solid color-mix(in srgb, var(--primary) 20%, var(--border));
  }

  .action-message.error {
    background: color-mix(in srgb, var(--danger) 10%, transparent);
    color: var(--danger);
    border-color: color-mix(in srgb, var(--danger) 25%, var(--border));
  }

  .section-header {
    padding: 0.75rem 1.25rem 0.4rem;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-2);
  }

  .class-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.625rem 0.75rem;
    border-radius: var(--radius);
    transition: background 0.1s;
  }

  .class-row:hover { background: var(--bg-2); }
  .class-info { flex: 1; min-width: 0; }
  .class-name { font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .class-meta { font-size: 11px; color: var(--text-2); margin-top: 2px; }
  .class-actions { display: flex; gap: 0.25rem; flex-shrink: 0; }
  .empty { text-align: center; color: var(--text-2); font-size: 13px; padding: 1.5rem 1rem; margin: 0; }

  footer {
    margin-top: auto;
    padding: 0.75rem 1.25rem;
    border-top: 1px solid var(--border);
    flex-shrink: 0;
  }

  .footer-note { font-size: 11px; color: var(--text-2); margin: 0; text-align: center; }

  button {
    font: inherit;
    cursor: pointer;
    border: none;
    border-radius: var(--radius);
    background: var(--bg-3);
    color: var(--text);
    transition: all 0.1s;
  }

  button:hover:not(:disabled) { background: var(--border); }
  button:disabled { opacity: 0.45; cursor: not-allowed; }

  .ghost-pill {
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 100px;
    padding: 3px 10px;
    font-size: 12px;
    color: var(--text-2);
    cursor: pointer;
  }

  .ghost-pill:hover:not(:disabled) {
    background: var(--bg-2);
    border-color: var(--primary);
    color: var(--primary);
  }

  .ghost-pill.danger:hover:not(:disabled) {
    border-color: var(--danger);
    color: var(--danger);
    background: color-mix(in srgb, var(--danger) 6%, transparent);
  }

  .icon-btn {
    width: 26px;
    height: 26px;
    padding: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--text-2);
    font-size: 13px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .icon-btn:hover { background: var(--bg-3); color: var(--text); }
</style>
