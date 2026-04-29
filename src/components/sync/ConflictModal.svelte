<script lang="ts">
  import type { ConflictSet, ConflictResolution, ResolutionChoice } from '../../lib/sync/types';

  interface Props {
    conflicts: ConflictSet;
    onresolve: (resolutions: ConflictResolution[]) => void;
    onclose: () => void;
  }

  const { conflicts, onresolve, onclose }: Props = $props();

  // Track resolution choice per conflict (default: 'local' to preserve local state by default)
  let choices = $state<Record<string, ResolutionChoice>>(
    Object.fromEntries(
      conflicts.conflicts.map((c) => [c.questionId, 'local' as ResolutionChoice]),
    ),
  );

  function setChoice(questionId: string, choice: ResolutionChoice) {
    choices = { ...choices, [questionId]: choice };
  }

  function setAllChoices(choice: ResolutionChoice) {
    const next: Record<string, ResolutionChoice> = {};
    for (const c of conflicts.conflicts) next[c.questionId] = choice;
    choices = next;
  }

  function applyAndClose() {
    const resolutions: ConflictResolution[] = conflicts.conflicts.map((c) => ({
      questionId: c.questionId,
      choice: choices[c.questionId],
    }));
    onresolve(resolutions);
  }

  function preview(text: string, max: number = 140): string {
    const cleaned = text.replace(/\s+/g, ' ').trim();
    return cleaned.length > max ? cleaned.slice(0, max) + '…' : cleaned;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose();
  }

  const totalAutomatic = $derived(
    conflicts.addedLocally.length +
      conflicts.addedRemotely.length +
      conflicts.autoResolved.length,
  );
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="overlay" onclick={onclose}>
  <div class="modal" role="dialog" aria-modal="true" onclick={(e) => e.stopPropagation()}>
    <header>
      <div class="header-text">
        <h2>Resolve Conflicts</h2>
        <p class="subtitle">
          {conflicts.conflicts.length}
          {conflicts.conflicts.length === 1 ? 'question' : 'questions'} need your input.
          {totalAutomatic > 0 ? `${totalAutomatic} auto-resolved.` : ''}
        </p>
      </div>
      <button class="ghost icon-btn" onclick={onclose}>✕</button>
    </header>

    <div class="body">
      {#if conflicts.conflicts.length === 0}
        <p class="empty">No conflicts to resolve.</p>
      {:else}
        <div class="bulk-actions">
          <span class="bulk-label">Select all:</span>
          <button class="ghost-pill" onclick={() => setAllChoices('local')}>Keep mine</button>
          <button class="ghost-pill" onclick={() => setAllChoices('remote')}>Use remote</button>
        </div>

        <div class="conflict-list">
          {#each conflicts.conflicts as conflict (conflict.questionId)}
            <div class="conflict-card">
              <div class="conflict-header">
                <span class="conflict-type" class:deleted={conflict.type === 'deleted-remotely'}>
                  {conflict.type === 'both-edited' ? 'Both edited' : 'Deleted remotely'}
                </span>
                <span class="conflict-id">ID: {conflict.questionId.slice(0, 8)}…</span>
              </div>

              <div class="versions">
                <label
                  class="version"
                  class:selected={choices[conflict.questionId] === 'local'}
                >
                  <input
                    type="radio"
                    name={conflict.questionId}
                    value="local"
                    checked={choices[conflict.questionId] === 'local'}
                    onchange={() => setChoice(conflict.questionId, 'local')}
                  />
                  <div class="version-content">
                    <div class="version-label">Keep mine</div>
                    <div class="version-body">{preview(conflict.local.body)}</div>
                    <div class="version-meta">
                      {conflict.local.points}
                      {conflict.local.points === 1 ? 'pt' : 'pts'}
                      {#if conflict.local.tags?.length}
                        · {conflict.local.tags.join(', ')}
                      {/if}
                    </div>
                  </div>
                </label>

                <label
                  class="version"
                  class:selected={choices[conflict.questionId] === 'remote'}
                  class:disabled={conflict.type === 'deleted-remotely'}
                >
                  <input
                    type="radio"
                    name={conflict.questionId}
                    value="remote"
                    checked={choices[conflict.questionId] === 'remote'}
                    onchange={() =>
                      setChoice(
                        conflict.questionId,
                        conflict.type === 'deleted-remotely' ? 'delete' : 'remote',
                      )}
                  />
                  <div class="version-content">
                    <div class="version-label">
                      {conflict.type === 'deleted-remotely' ? 'Accept deletion' : 'Use remote'}
                    </div>
                    {#if conflict.remote}
                      <div class="version-body">{preview(conflict.remote.body)}</div>
                      <div class="version-meta">
                        {conflict.remote.points}
                        {conflict.remote.points === 1 ? 'pt' : 'pts'}
                        {#if conflict.remote.tags?.length}
                          · {conflict.remote.tags.join(', ')}
                        {/if}
                      </div>
                    {:else}
                      <div class="version-body deleted-note">
                        This question will be removed from your local bank.
                      </div>
                    {/if}
                  </div>
                </label>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <footer>
      <button class="ghost" onclick={onclose}>Cancel</button>
      <button class="primary" onclick={applyAndClose}>
        Apply {conflicts.conflicts.length}
        {conflicts.conflicts.length === 1 ? 'resolution' : 'resolutions'}
      </button>
    </footer>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    z-index: 200;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .modal {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: var(--shadow);
    width: 720px;
    max-width: calc(100vw - 2rem);
    height: calc(100vh - 4rem);
    max-height: 720px;
    display: flex;
    flex-direction: column;
  }

  header {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
    padding: 1.25rem 1.5rem;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .header-text {
    flex: 1;
  }

  header h2 {
    font-size: 18px;
    font-weight: 600;
    margin: 0 0 4px 0;
  }

  .subtitle {
    font-size: 13px;
    color: var(--text-2);
    margin: 0;
  }

  .body {
    overflow-y: auto;
    flex: 1;
    padding: 1.25rem 1.5rem;
  }

  .empty {
    text-align: center;
    color: var(--text-2);
    padding: 2rem;
  }

  .bulk-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 1rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid var(--border);
  }

  .bulk-label {
    font-size: 12px;
    color: var(--text-2);
    margin-right: 0.25rem;
  }

  .ghost-pill {
    background: var(--bg-2);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 100px;
    padding: 4px 12px;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.1s;
  }

  .ghost-pill:hover {
    border-color: var(--primary);
    color: var(--primary);
  }

  .conflict-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .conflict-card {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
  }

  .conflict-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 1rem;
    background: var(--bg-2);
    border-bottom: 1px solid var(--border);
  }

  .conflict-type {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--primary);
    padding: 2px 8px;
    border-radius: 4px;
    background: color-mix(in srgb, var(--primary) 12%, transparent);
  }

  .conflict-type.deleted {
    color: var(--danger);
    background: color-mix(in srgb, var(--danger) 12%, transparent);
  }

  .conflict-id {
    font-size: 11px;
    color: var(--text-2);
    font-family: 'Fira Code', monospace;
  }

  .versions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1px;
    background: var(--border);
  }

  .version {
    background: var(--bg);
    padding: 1rem;
    cursor: pointer;
    display: flex;
    gap: 0.75rem;
    align-items: flex-start;
    transition: background 0.1s;
  }

  .version:hover:not(.disabled) {
    background: var(--bg-2);
  }

  .version.selected {
    background: color-mix(in srgb, var(--primary) 8%, var(--bg));
  }

  .version.selected:hover {
    background: color-mix(in srgb, var(--primary) 10%, var(--bg));
  }

  .version input[type='radio'] {
    margin-top: 2px;
    accent-color: var(--primary);
    flex-shrink: 0;
  }

  .version-content {
    flex: 1;
    min-width: 0;
  }

  .version-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--text);
    margin-bottom: 6px;
  }

  .version-body {
    font-size: 13px;
    color: var(--text);
    line-height: 1.5;
    margin-bottom: 6px;
    word-break: break-word;
  }

  .deleted-note {
    color: var(--text-2);
    font-style: italic;
  }

  .version-meta {
    font-size: 11px;
    color: var(--text-2);
  }

  footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    padding: 1rem 1.5rem;
    border-top: 1px solid var(--border);
    flex-shrink: 0;
  }

  button {
    font: inherit;
    cursor: pointer;
    border: none;
    border-radius: var(--radius);
    padding: 8px 16px;
    background: var(--bg-3);
    color: var(--text);
    transition: background 0.1s;
  }

  button:hover:not(:disabled) {
    background: var(--border);
  }

  button.primary {
    background: var(--primary);
    color: white;
  }

  button.primary:hover:not(:disabled) {
    background: var(--primary-hover);
  }

  button.ghost {
    background: transparent;
    color: var(--text-2);
  }

  button.ghost:hover:not(:disabled) {
    background: var(--bg-3);
    color: var(--text);
  }

  .icon-btn {
    width: 28px;
    height: 28px;
    padding: 0;
    border-radius: 50%;
    background: var(--bg-3);
    color: var(--text-2);
    font-size: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .icon-btn:hover {
    background: var(--border);
    color: var(--text);
  }
</style>
