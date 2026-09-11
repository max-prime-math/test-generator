<script lang="ts">
  import { localFolderBank } from '../lib/local-folder-bank.svelte';

  interface Props {
    onclose: () => void;
  }

  const { onclose }: Props = $props();
  let actionError = $state<string | null>(null);

  const busy = $derived(localFolderBank.status === 'saving' || localFolderBank.status === 'loading');
  const connected = $derived(localFolderBank.linkedToActiveBank);

  function handleOverlayClick(event: MouseEvent) {
    if (event.target === event.currentTarget && !busy) onclose();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && !busy) onclose();
  }

  async function run(operation: () => Promise<void>) {
    actionError = null;
    try {
      await operation();
    } catch (error) {
      actionError = error instanceof Error ? error.message : 'The folder operation failed.';
    }
  }

  async function stopUsingFolder() {
    if (!confirm('Stop using this folder for the active bank? The browser copy and the files already in the folder will be kept.')) return;
    await run(() => localFolderBank.disconnect());
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div
  class="overlay"
  role="dialog"
  aria-modal="true"
  aria-labelledby="folder-bank-title"
  tabindex="-1"
  onclick={handleOverlayClick}
  onkeydown={handleKeydown}
>
  <section class="card" role="document">
    <header>
      <div>
        <h2 id="folder-bank-title">Local folder storage</h2>
        <p>Keep the active bank as readable files in one folder on this computer.</p>
      </div>
      <button class="ghost close" onclick={onclose} disabled={busy} aria-label="Close">×</button>
    </header>

    {#if !localFolderBank.supported}
      <div class="notice warning">
        Folder storage uses the File System Access API and requires a Chromium-based browser such as Chrome, Edge, Brave, or Chromium.
      </div>
    {:else}
      <div class="folder-status" class:connected>
        <div class="folder-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 6.5h6l2 2h10v9.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            <path d="M3 9h18"/>
          </svg>
        </div>
        <div>
          <strong>{connected ? localFolderBank.folderName : 'Browser storage'}</strong>
          {#if connected}
            <span>
              {#if localFolderBank.status === 'saving'}Saving changes…
              {:else if localFolderBank.status === 'loading'}Loading bank…
              {:else if localFolderBank.status === 'permission-needed'}Permission required
              {:else if localFolderBank.status === 'error'}Folder needs attention
              {:else if localFolderBank.lastSavedAt}Saved {new Date(localFolderBank.lastSavedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              {:else}Autosave is on{/if}
            </span>
          {:else if localFolderBank.linkedBankId}
            <span>A folder is linked to another bank. Choosing one here moves the single folder connection to this bank.</span>
          {:else}
            <span>The active bank currently lives only in this browser.</span>
          {/if}
        </div>
      </div>

      {#if localFolderBank.status === 'permission-needed' && connected}
        <div class="notice warning">
          Chromium needs permission again before it can read or save this bank.
          <button onclick={() => run(() => localFolderBank.grantPermission())} disabled={busy}>Allow access</button>
        </div>
      {/if}

      {#if actionError || localFolderBank.error}
        <div class="notice error">{actionError ?? localFolderBank.error}</div>
      {/if}

      <div class="explanation">
        <h3>What is stored</h3>
        <p>Questions, custom classes, narratives, saved tests, and bank images are written as the same plain-file layout used by Git sync. Browser-only drafts, credentials, sync settings, and Gradebook records stay in the browser.</p>
        <p>Only the active bank uses the selected folder. Changes are saved automatically while this app is open.</p>
      </div>

      <div class="actions">
        {#if connected}
          <button class="primary" onclick={() => run(() => localFolderBank.saveNow(true))} disabled={busy || localFolderBank.status === 'permission-needed'}>
            {localFolderBank.status === 'saving' ? 'Saving…' : 'Save now'}
          </button>
          <button onclick={() => run(() => localFolderBank.reloadFromFolder())} disabled={busy || localFolderBank.status === 'permission-needed'}>Reload from folder</button>
          <button onclick={() => run(() => localFolderBank.chooseFolder())} disabled={busy}>Change folder</button>
          <button class="ghost danger" onclick={stopUsingFolder} disabled={busy}>Stop using folder</button>
        {:else}
          <button class="primary" onclick={() => run(() => localFolderBank.chooseFolder())} disabled={busy}>
            {busy ? 'Opening…' : 'Choose folder'}
          </button>
        {/if}
      </div>
    {/if}
  </section>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: grid;
    place-items: center;
    padding: 1rem;
    background: color-mix(in srgb, #000 45%, transparent);
  }

  .card {
    width: min(620px, 100%);
    max-height: min(760px, calc(100vh - 2rem));
    overflow: auto;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--bg);
    box-shadow: 0 24px 70px rgba(0, 0, 0, 0.28);
  }

  header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
    padding: 1.25rem 1.35rem;
    border-bottom: 1px solid var(--border);
  }

  h2,
  h3,
  p {
    margin: 0;
  }

  h2 {
    font-size: 1.2rem;
  }

  header p,
  .explanation p {
    margin-top: 0.35rem;
    color: var(--text-2);
    font-size: 0.88rem;
    line-height: 1.5;
  }

  .close {
    min-width: 32px;
    padding: 0.25rem 0.5rem;
    font-size: 1.25rem;
  }

  .folder-status {
    display: flex;
    gap: 0.9rem;
    align-items: center;
    margin: 1.25rem 1.35rem 0;
    padding: 1rem;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--bg-2);
  }

  .folder-status.connected {
    border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
  }

  .folder-icon {
    width: 42px;
    height: 42px;
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    border-radius: 9px;
    background: var(--bg-3);
    color: var(--accent);
  }

  .folder-icon svg {
    width: 25px;
  }

  .folder-status strong,
  .folder-status span {
    display: block;
  }

  .folder-status span {
    margin-top: 0.2rem;
    color: var(--text-2);
    font-size: 0.82rem;
    line-height: 1.4;
  }

  .notice {
    margin: 1rem 1.35rem 0;
    padding: 0.8rem 0.9rem;
    border-radius: 8px;
    font-size: 0.85rem;
    line-height: 1.45;
  }

  .notice.warning {
    color: var(--warning-text, #8a5700);
    background: color-mix(in srgb, #e8a317 14%, var(--bg));
    border: 1px solid color-mix(in srgb, #e8a317 35%, var(--border));
  }

  .notice.error {
    color: var(--danger, #c33);
    background: color-mix(in srgb, #d33 9%, var(--bg));
    border: 1px solid color-mix(in srgb, #d33 28%, var(--border));
  }

  .notice button {
    margin-left: 0.6rem;
  }

  .explanation {
    padding: 1.2rem 1.35rem 0;
  }

  .explanation h3 {
    font-size: 0.92rem;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.55rem;
    padding: 1.25rem 1.35rem 1.35rem;
  }

  button.danger {
    color: var(--danger, #c33);
  }

  @media (max-width: 600px) {
    .actions button {
      flex: 1 1 calc(50% - 0.3rem);
    }
  }
</style>
