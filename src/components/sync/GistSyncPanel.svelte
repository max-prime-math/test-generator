<script lang="ts">
  import { syncState } from '../../lib/sync/sync-state.svelte';
  import { CLASSES } from '../../lib/curriculum';
  import { customClasses } from '../../lib/custom-classes.svelte';
  import { bank } from '../../lib/bank.svelte';
  import type { ConflictSet, LinkedGistMeta } from '../../lib/sync/types';

  interface Props {
    onclose: () => void;
    onsetup: () => void;
    onunlock: () => void;
    onconflicts: (classId: string, conflicts: ConflictSet, remote: { questions: any[] }) => void;
  }

  const { onclose, onsetup, onunlock, onconflicts }: Props = $props();

  let busyClassId = $state<string | null>(null);
  let actionMessage = $state<string | null>(null);

  const allClasses = $derived([...CLASSES, ...customClasses.classes]);

  // Classes the user has at least one question in
  const classesWithQuestions = $derived(
    allClasses.filter((c) => bank.questions.some((q) => q.classId === c.id)),
  );

  function gistMetaFor(classId: string): LinkedGistMeta | undefined {
    return syncState.linkedGists.find((g) => g.classId === classId);
  }

  function formatRelative(ts: number): string {
    if (!ts) return 'Never';
    const diff = Date.now() - ts;
    const min = Math.floor(diff / 60000);
    if (min < 1) return 'Just now';
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const days = Math.floor(hr / 24);
    return `${days}d ago`;
  }

  async function backupClass(classId: string) {
    if (syncState.sessionStatus === 'locked') {
      onunlock();
      return;
    }
    try {
      busyClassId = classId;
      actionMessage = null;
      await syncState.backup(classId);
      actionMessage = 'Backup successful';
      setTimeout(() => (actionMessage = null), 2500);
    } catch (e) {
      actionMessage = e instanceof Error ? e.message : 'Backup failed';
    } finally {
      busyClassId = null;
    }
  }

  async function restoreClass(classId: string) {
    if (syncState.sessionStatus === 'locked') {
      onunlock();
      return;
    }
    try {
      busyClassId = classId;
      actionMessage = null;
      const conflicts = await syncState.restore(classId);

      // If no conflicts, apply directly with empty resolutions
      if (
        conflicts.conflicts.length === 0 &&
        conflicts.addedRemotely.length === 0
      ) {
        actionMessage = 'No remote changes';
        setTimeout(() => (actionMessage = null), 2500);
        return;
      }

      // Get the remote payload from the conflict set
      const remoteQuestions = [
        ...conflicts.conflicts
          .filter((c) => c.remote)
          .map((c) => c.remote!),
        ...conflicts.addedRemotely,
        ...conflicts.autoResolved,
      ];

      if (conflicts.conflicts.length > 0) {
        // Hand off to ConflictModal
        onconflicts(classId, conflicts, { questions: remoteQuestions });
      } else {
        // Auto-apply
        await syncState.applyRestore(classId, [], { questions: remoteQuestions });
        actionMessage = `Applied ${conflicts.addedRemotely.length} remote changes`;
        setTimeout(() => (actionMessage = null), 2500);
      }
    } catch (e) {
      actionMessage = e instanceof Error ? e.message : 'Restore failed';
    } finally {
      busyClassId = null;
    }
  }

  async function backupAll() {
    if (syncState.sessionStatus === 'locked') {
      onunlock();
      return;
    }
    try {
      busyClassId = 'all';
      actionMessage = null;
      await syncState.backupAll();
      actionMessage = 'All classes backed up';
      setTimeout(() => (actionMessage = null), 2500);
    } catch (e) {
      actionMessage = e instanceof Error ? e.message : 'Backup all failed';
    } finally {
      busyClassId = null;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose();
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="backdrop" onclick={onclose}></div>

<aside class="panel" role="complementary" aria-label="Sync panel" onclick={(e) => e.stopPropagation()}>
  <header>
    <h2>Sync</h2>
    <button class="ghost icon-btn" onclick={onclose} title="Close">✕</button>
  </header>

  <!-- Status section -->
  <div class="status-section">
    {#if syncState.sessionStatus === 'unauthenticated'}
      <div class="status-card unauth">
        <div class="status-row">
          <span class="status-dot grey"></span>
          <span class="status-label">Not set up</span>
        </div>
        <p class="status-info">
          Set up GitHub sync to back up your question bank to a private encrypted gist.
        </p>
        <button class="primary full" onclick={onsetup}>Set up sync</button>
      </div>
    {:else if syncState.sessionStatus === 'locked'}
      <div class="status-card locked">
        <div class="status-row">
          <span class="status-dot amber"></span>
          <span class="status-label">Locked</span>
          <span class="status-meta">{syncState.userId ?? ''}</span>
        </div>
        <p class="status-info">Enter your password to access sync.</p>
        <button class="primary full" onclick={onunlock}>Unlock</button>
      </div>
    {:else}
      <div class="status-card active">
        <div class="status-row">
          <span class="status-dot green"></span>
          <span class="status-label">Active</span>
          <span class="status-meta">{syncState.userId ?? ''}</span>
        </div>
        <p class="status-info">Auto-locks after 30 min of inactivity.</p>
        <div class="action-row">
          <button class="ghost-pill" onclick={backupAll} disabled={busyClassId === 'all'}>
            {busyClassId === 'all' ? 'Backing up all…' : 'Sync all'}
          </button>
          <button class="ghost-pill" onclick={() => syncState.lock()}>Lock now</button>
        </div>
      </div>
    {/if}
  </div>

  {#if actionMessage}
    <div class="action-message" class:error={syncState.syncError}>
      {actionMessage}
    </div>
  {/if}

  <!-- Linked / known classes list -->
  {#if syncState.sessionStatus === 'active' || syncState.sessionStatus === 'locked'}
    <div class="section-header">
      <span>Classes</span>
    </div>

    <div class="class-list">
      {#each classesWithQuestions as cls (cls.id)}
        {@const meta = gistMetaFor(cls.id)}
        {@const questionCount = bank.questions.filter((q) => q.classId === cls.id).length}
        <div class="class-row">
          <div class="class-info">
            <div class="class-name">{cls.name}</div>
            <div class="class-meta">
              {questionCount}
              {questionCount === 1 ? 'question' : 'questions'}
              {#if meta}
                · synced {formatRelative(meta.lastSyncedAt)}
              {:else}
                · never synced
              {/if}
            </div>
          </div>
          <div class="class-actions">
            <button
              class="ghost-pill"
              onclick={() => backupClass(cls.id)}
              disabled={busyClassId === cls.id || syncState.sessionStatus !== 'active'}
              title="Push to GitHub"
            >
              {busyClassId === cls.id ? '…' : '↑'}
            </button>
            <button
              class="ghost-pill"
              onclick={() => restoreClass(cls.id)}
              disabled={busyClassId === cls.id || !meta || syncState.sessionStatus !== 'active'}
              title="Pull from GitHub"
            >
              {busyClassId === cls.id ? '…' : '↓'}
            </button>
          </div>
        </div>
      {/each}

      {#if classesWithQuestions.length === 0}
        <p class="empty">No classes with questions yet. Add some questions first.</p>
      {/if}
    </div>
  {/if}

  <footer class="panel-footer">
    <p class="footer-note">Encrypted backup to a private GitHub Gist.</p>
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

  @keyframes fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .panel {
    position: fixed;
    top: 52px;
    right: 0;
    bottom: 0;
    width: 360px;
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

  @keyframes slide-in {
    from { transform: translateX(100%); }
    to { transform: translateX(0); }
  }

  header {
    display: flex;
    align-items: center;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  header h2 {
    flex: 1;
    font-size: 16px;
    font-weight: 600;
    margin: 0;
  }

  .status-section {
    padding: 1rem 1.25rem;
  }

  .status-card {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 1rem;
    background: var(--bg-2);
  }

  .status-card.active {
    border-color: color-mix(in srgb, #16a34a 30%, var(--border));
    background: color-mix(in srgb, #16a34a 5%, var(--bg-2));
  }

  .status-card.locked {
    border-color: color-mix(in srgb, #f59e0b 35%, var(--border));
    background: color-mix(in srgb, #f59e0b 5%, var(--bg-2));
  }

  .status-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .status-dot.green { background: #16a34a; }
  .status-dot.amber { background: #f59e0b; }
  .status-dot.grey  { background: var(--text-2); }

  .status-label {
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
  }

  .status-meta {
    font-size: 12px;
    color: var(--text-2);
    margin-left: auto;
    font-family: 'Fira Code', monospace;
  }

  .status-info {
    font-size: 12px;
    color: var(--text-2);
    margin: 0 0 0.75rem 0;
    line-height: 1.5;
  }

  .action-row {
    display: flex;
    gap: 0.375rem;
  }

  .action-message {
    margin: 0 1.25rem 0.75rem 1.25rem;
    padding: 0.5rem 0.75rem;
    border-radius: var(--radius);
    background: color-mix(in srgb, var(--primary) 8%, var(--bg-2));
    color: var(--text);
    font-size: 12px;
    border: 1px solid color-mix(in srgb, var(--primary) 20%, var(--border));
  }

  .action-message.error {
    background: color-mix(in srgb, var(--danger) 10%, transparent);
    color: var(--danger);
    border-color: color-mix(in srgb, var(--danger) 25%, var(--border));
  }

  .section-header {
    display: flex;
    align-items: center;
    padding: 0.75rem 1.25rem 0.5rem 1.25rem;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-2);
  }

  .class-list {
    display: flex;
    flex-direction: column;
    padding: 0 0.5rem;
  }

  .class-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.625rem 0.75rem;
    border-radius: var(--radius);
    transition: background 0.1s;
  }

  .class-row:hover {
    background: var(--bg-2);
  }

  .class-info {
    flex: 1;
    min-width: 0;
  }

  .class-name {
    font-size: 13px;
    font-weight: 500;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .class-meta {
    font-size: 11px;
    color: var(--text-2);
    margin-top: 2px;
  }

  .class-actions {
    display: flex;
    gap: 0.25rem;
    flex-shrink: 0;
  }

  .empty {
    text-align: center;
    color: var(--text-2);
    font-size: 13px;
    padding: 1.5rem 1rem;
    margin: 0;
  }

  .panel-footer {
    margin-top: auto;
    padding: 0.75rem 1.25rem;
    border-top: 1px solid var(--border);
    flex-shrink: 0;
  }

  .footer-note {
    font-size: 11px;
    color: var(--text-2);
    margin: 0;
    text-align: center;
  }

  /* Buttons */
  button {
    font: inherit;
    cursor: pointer;
    border: none;
    border-radius: var(--radius);
    padding: 6px 12px;
    background: var(--bg-3);
    color: var(--text);
    transition: all 0.1s;
  }

  button:hover:not(:disabled) {
    background: var(--border);
  }

  button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  button.primary {
    background: var(--primary);
    color: white;
  }

  button.primary:hover:not(:disabled) {
    background: var(--primary-hover);
  }

  button.full {
    width: 100%;
    padding: 8px 12px;
    font-size: 13px;
    font-weight: 500;
  }

  .ghost-pill {
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 100px;
    padding: 3px 10px;
    font-size: 12px;
    color: var(--text-2);
    cursor: pointer;
    transition: all 0.1s;
    min-width: 28px;
  }

  .ghost-pill:hover:not(:disabled) {
    background: var(--bg-2);
    border-color: var(--primary);
    color: var(--primary);
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

  .icon-btn:hover {
    background: var(--bg-3);
    color: var(--text);
  }
</style>
