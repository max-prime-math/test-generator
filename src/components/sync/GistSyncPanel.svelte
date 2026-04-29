<script lang="ts">
  import { syncState } from '../../lib/sync/sync-state.svelte';
  import { CLASSES } from '../../lib/curriculum';
  import { customClasses } from '../../lib/custom-classes.svelte';
  import { bank } from '../../lib/bank.svelte';
  import type { ConflictSet } from '../../lib/sync/types';
  import type { ClassSyncFile } from '../../lib/sync/types';

  interface Props {
    onclose: () => void;
    onsetup: () => void;
    onconflicts: (classId: string, conflicts: ConflictSet, remoteFile: ClassSyncFile) => void;
    onshare: () => void;
  }

  const { onclose, onsetup, onconflicts, onshare }: Props = $props();

  let busyClassId = $state<string | null>(null);
  let actionMessage = $state<string | null>(null);
  let isError = $state(false);

  const allClasses = $derived([...CLASSES, ...customClasses.classes]);
  const classesWithQuestions = $derived(
    allClasses.filter((c) => bank.questions.some((q) => q.classId === c.id)),
  );

  function metaFor(classId: string) {
    return syncState.linkedClasses.find((c) => c.classId === classId);
  }

  function formatRelative(ts: number): string {
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
      const { conflicts, file } = await syncState.restore(classId);

      if (conflicts.conflicts.length === 0 && conflicts.addedRemotely.length === 0) {
        // Auto-apply: no manual conflicts
        await syncState.applyRestore(classId, [], file);
        const n = conflicts.addedRemotely.length + conflicts.autoResolved.length;
        toast(n > 0 ? `Applied ${n} remote change${n !== 1 ? 's' : ''}` : 'Already up to date');
        return;
      }

      onconflicts(classId, conflicts, file);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Restore failed', true);
    } finally {
      busyClassId = null;
    }
  }

  async function backupAll() {
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

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose();
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="backdrop" onclick={onclose}></div>

<aside class="panel" aria-label="Sync panel">
  <header>
    <h2>Sync</h2>
    <button class="icon-btn" onclick={onclose} title="Close">✕</button>
  </header>

  <!-- Status -->
  <div class="status-section">
    {#if syncState.sessionStatus === 'unauthenticated'}
      <div class="status-card unauth">
        <div class="status-row">
          <span class="dot grey"></span>
          <span class="status-label">Not connected</span>
        </div>
        <p class="status-info">Back up your question bank to a private GitHub repo.</p>
        <button class="primary full" onclick={onsetup}>Connect to GitHub</button>
      </div>
    {:else}
      <div class="status-card active">
        <div class="status-row">
          <span class="dot green"></span>
          <span class="status-label">Connected</span>
          <span class="status-meta">{syncState.userId}</span>
        </div>
        {#if syncState.repoInfo}
          <p class="status-info">
            <a
              href="https://github.com/{syncState.repoInfo.owner}/{syncState.repoInfo.name}"
              target="_blank"
              rel="noopener"
              class="repo-link"
            >
              github.com/{syncState.repoInfo.owner}/{syncState.repoInfo.name}
            </a>
          </p>
        {/if}
        <div class="action-row">
          <button class="ghost-pill" onclick={backupAll} disabled={busyClassId === 'all'}>
            {busyClassId === 'all' ? 'Backing up…' : '↑ Sync all'}
          </button>
          <button class="ghost-pill" onclick={onshare}>Share repo</button>
          <button class="ghost-pill danger" onclick={syncState.signOut}>Disconnect</button>
        </div>
      </div>
    {/if}
  </div>

  {#if actionMessage}
    <div class="action-message" class:error={isError}>{actionMessage}</div>
  {/if}

  <!-- Classes list -->
  {#if syncState.sessionStatus === 'active'}
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
              · {meta ? `synced ${formatRelative(meta.lastSyncedAt)}` : 'never synced'}
            </div>
          </div>
          <div class="class-actions">
            <button
              class="ghost-pill"
              onclick={() => backupClass(cls.id)}
              disabled={busy}
              title="Push to GitHub"
            >{busy ? '…' : '↑'}</button>
            <button
              class="ghost-pill"
              onclick={() => restoreClass(cls.id)}
              disabled={busy || !meta}
              title="Pull from GitHub"
            >{busy ? '…' : '↓'}</button>
          </div>
        </div>
      {/each}

      {#if classesWithQuestions.length === 0}
        <p class="empty">No classes with questions yet.</p>
      {/if}
    </div>
  {/if}

  <footer>
    <p class="footer-note">
      Backed up as plain JSON in a private GitHub repo.
      {#if syncState.repoInfo}
        <a
          href="https://github.com/{syncState.repoInfo.owner}/{syncState.repoInfo.name}"
          target="_blank"
          rel="noopener"
          class="repo-link"
        >View repo ↗</a>
      {/if}
    </p>
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

  .status-card {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 1rem;
    background: var(--bg-2);
  }

  .status-card.active {
    border-color: color-mix(in srgb, #16a34a 30%, var(--border));
    background: color-mix(in srgb, #16a34a 4%, var(--bg-2));
  }

  .status-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.4rem;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .dot.green { background: #16a34a; }
  .dot.grey  { background: var(--text-2); }

  .status-label { font-size: 13px; font-weight: 600; }
  .status-meta  { font-size: 12px; color: var(--text-2); margin-left: auto; font-family: monospace; }

  .status-info { font-size: 12px; color: var(--text-2); margin: 0 0 0.75rem 0; line-height: 1.5; }

  .repo-link { color: var(--primary); text-decoration: none; }
  .repo-link:hover { text-decoration: underline; }

  .action-row { display: flex; gap: 0.375rem; flex-wrap: wrap; }

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

  .class-list { display: flex; flex-direction: column; padding: 0 0.5rem; }

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

  /* Buttons */
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

  button.primary { background: var(--primary); color: white; padding: 8px 12px; }
  button.primary:hover:not(:disabled) { background: var(--primary-hover); }

  button.full { width: 100%; font-size: 13px; font-weight: 500; }

  .ghost-pill {
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 100px;
    padding: 3px 10px;
    font-size: 12px;
    color: var(--text-2);
    cursor: pointer;
  }
  .ghost-pill:hover:not(:disabled) { background: var(--bg-2); border-color: var(--primary); color: var(--primary); }
  .ghost-pill.danger:hover:not(:disabled) { border-color: var(--danger); color: var(--danger); background: color-mix(in srgb, var(--danger) 6%, transparent); }

  .icon-btn {
    width: 26px; height: 26px; padding: 0; border-radius: 50%;
    background: transparent; color: var(--text-2); font-size: 13px;
    display: flex; align-items: center; justify-content: center;
  }
  .icon-btn:hover { background: var(--bg-3); color: var(--text); }
</style>
