<script lang="ts">
  import { onMount } from 'svelte';
  import { syncState } from '../lib/sync/sync-state.svelte';

  interface Props {
    onclose: () => void;
  }

  const { onclose }: Props = $props();

  const envClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() || '';
  const envApiKey = import.meta.env.VITE_GOOGLE_API_KEY?.trim() || '';
  const envProjectNumber = import.meta.env.VITE_GOOGLE_CLOUD_PROJECT_NUMBER?.trim() || '';

  let clientId = $state(envClientId);
  let apiKey = $state(envApiKey);
  let projectNumber = $state(envProjectNumber);
  let folderName = $state('');
  let createMode = $state(false);
  let isLoading = $state(false);
  let driveAction = $state<'backup' | 'restore-tests' | 'refresh' | null>(null);
  let error = $state<string | null>(null);
  let success = $state<string | null>(null);

  const googleDrive = $derived(syncState.providers.find((provider) => provider.id === 'googleDrive') ?? null);
  const appConfigured = $derived(Boolean(clientId.trim() && apiKey.trim() && projectNumber.trim()));
  const connected = $derived(Boolean(googleDrive?.authenticated));

  onMount(() => {
    void syncState.refreshProviders();
  });

  async function connect(changeFolder = false) {
    if (!appConfigured) {
      error = 'Google Drive needs a client ID, Picker API key, and Cloud project number.';
      return;
    }

    try {
      isLoading = true;
      error = null;
      success = null;
      await syncState.connectGoogleDrive({
        clientId: clientId.trim(),
        apiKey: apiKey.trim(),
        projectNumber: projectNumber.trim(),
        createFolderName: createMode ? folderName.trim() : '',
        changeFolder,
      });
      onclose();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Google Drive connection failed';
    } finally {
      isLoading = false;
    }
  }

  async function disconnect() {
    try {
      isLoading = true;
      error = null;
      success = null;
      await syncState.disconnectProvider('googleDrive');
    } catch (e) {
      error = e instanceof Error ? e.message : 'Google Drive disconnect failed';
    } finally {
      isLoading = false;
    }
  }

  async function backupToDrive() {
    await runDriveAction('backup', async () => {
      await syncState.backupEverything('googleDrive');
      await syncState.loadLinkedClasses('googleDrive');
      success = 'Uploaded this bank to Google Drive.';
    });
  }

  async function restoreTestsFromDrive() {
    await runDriveAction('restore-tests', async () => {
      const count = await syncState.restoreTests('googleDrive');
      success = count === 1 ? 'Restored 1 saved test from Google Drive.' : `Restored ${count} saved tests from Google Drive.`;
    });
  }

  async function refreshDriveIndex() {
    await runDriveAction('refresh', async () => {
      await syncState.loadLinkedClasses('googleDrive');
      success = 'Refreshed the Google Drive class index.';
    });
  }

  async function runDriveAction(action: 'backup' | 'restore-tests' | 'refresh', callback: () => Promise<void>) {
    try {
      driveAction = action;
      error = null;
      success = null;
      await callback();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Google Drive sync failed';
    } finally {
      driveAction = null;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && !isLoading && !driveAction) onclose();
  }

  function handleOverlayClick(e: MouseEvent) {
    if (e.target === e.currentTarget && !isLoading && !driveAction) onclose();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div
  class="overlay"
  role="dialog"
  aria-modal="true"
  tabindex="-1"
  onclick={handleOverlayClick}
  onkeydown={(e) => e.key === 'Escape' && !isLoading && !driveAction && onclose()}
>
  <div
    class="modal"
    role="document"
    tabindex="-1"
  >
    <header>
      <h2>Google Drive</h2>
      <button class="ghost icon-btn" onclick={onclose} disabled={isLoading || Boolean(driveAction)} title="Close">x</button>
    </header>

    <div class="body">
      {#if connected}
        <div class="status-card">
          <div>
            <div class="status-title">Connected</div>
            <div class="status-meta">
              {googleDrive?.remoteLabel ?? 'Google Drive folder'}
            </div>
          </div>
          {#if googleDrive?.remoteUrl}
            <a href={googleDrive.remoteUrl} target="_blank" rel="noopener">Open folder</a>
          {/if}
        </div>
        <div class="sync-card">
          <div>
            <div class="status-title">Drive sync</div>
            <p class="status-meta">
              Upload this bank's class-backed questions and saved tests to the selected folder. Test restore can pull saved tests back into this bank.
            </p>
            <p class="status-meta">{syncState.linkedClasses.length} remote classes indexed</p>
          </div>
          <div class="sync-actions">
            <button class="ghost" onclick={refreshDriveIndex} disabled={Boolean(driveAction)} title="Reload the Google Drive class index">
              {driveAction === 'refresh' ? 'Refreshing...' : 'Refresh'}
            </button>
            <button class="ghost" onclick={restoreTestsFromDrive} disabled={Boolean(driveAction)} title="Restore saved tests from Google Drive into this bank">
              {driveAction === 'restore-tests' ? 'Restoring...' : 'Restore Tests'}
            </button>
            <button class="primary" onclick={backupToDrive} disabled={Boolean(driveAction)} title="Upload this bank's class-backed questions and saved tests to Google Drive">
              {driveAction === 'backup' ? 'Uploading...' : 'Upload Bank'}
            </button>
          </div>
        </div>
      {:else}
        <p class="info">
          Connect Google Drive and choose a folder for the active bank. The folder selection and Drive sync metadata are stored per bank.
        </p>
      {/if}

      {#if !envClientId || !envApiKey || !envProjectNumber}
        <div class="field">
          <label for="google-client-id">OAuth client ID</label>
          <input
            id="google-client-id"
            type="text"
            bind:value={clientId}
            placeholder="1234567890-abc123def456.apps.googleusercontent.com"
            disabled={isLoading || Boolean(driveAction)}
            autocomplete="off"
            onkeydown={(e) => e.key === 'Enter' && connect(true)}
          />
        </div>

        <div class="field">
          <label for="google-api-key">Picker API key</label>
          <input
            id="google-api-key"
            type="text"
            bind:value={apiKey}
            placeholder="AIza..."
            disabled={isLoading || Boolean(driveAction)}
            autocomplete="off"
            onkeydown={(e) => e.key === 'Enter' && connect(true)}
          />
        </div>

        <div class="field">
          <label for="google-project-number">Cloud project number</label>
          <input
            id="google-project-number"
            type="text"
            bind:value={projectNumber}
            placeholder="123456789012"
            disabled={isLoading || Boolean(driveAction)}
            autocomplete="off"
            onkeydown={(e) => e.key === 'Enter' && connect(true)}
          />
        </div>
      {:else if !connected}
        <p class="info">
          App-level Google Drive configuration was detected. Continuing will open Google sign-in and a Drive folder picker.
        </p>
      {/if}

      {#if createMode}
        <div class="field">
          <label for="google-folder-name">New folder name</label>
          <input
            id="google-folder-name"
            type="text"
            bind:value={folderName}
            placeholder="Test Generator backups"
            disabled={isLoading || Boolean(driveAction)}
            autocomplete="off"
            onkeydown={(e) => e.key === 'Enter' && connect(true)}
          />
        </div>
      {/if}

      {#if success}
        <p class="success">{success}</p>
      {/if}

      {#if error || syncState.syncError}
        <p class="error">{error ?? syncState.syncError}</p>
      {/if}

      <div class="button-row">
        <button class="ghost" onclick={onclose} disabled={isLoading || Boolean(driveAction)}>Close</button>
        {#if connected}
          <button class="ghost danger" onclick={disconnect} disabled={isLoading || Boolean(driveAction)}>
            {isLoading ? 'Disconnecting...' : 'Disconnect'}
          </button>
        {/if}
        <button class="ghost" onclick={() => (createMode = !createMode)} disabled={isLoading || Boolean(driveAction) || !appConfigured}>
          {createMode ? 'Use picker' : 'Create folder'}
        </button>
        <button
          class="primary"
          onclick={() => connect(connected)}
          disabled={isLoading || Boolean(driveAction) || !appConfigured || (createMode && !folderName.trim())}
        >
          {isLoading ? 'Connecting...' : connected ? 'Change folder' : createMode ? 'Create & connect' : 'Choose folder'}
        </button>
      </div>
    </div>
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
    width: 520px;
    max-width: calc(100vw - 2rem);
  }

  header {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1.25rem 1.5rem;
    border-bottom: 1px solid var(--border);
  }

  header h2 {
    flex: 1;
    font-size: 18px;
    font-weight: 600;
    margin: 0;
  }

  .body {
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .info,
  .status-meta {
    font-size: 13px;
    color: var(--text-2);
    margin: 0;
    line-height: 1.6;
  }

  .status-card,
  .sync-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.85rem 1rem;
  }

  .sync-card {
    align-items: flex-start;
    flex-direction: column;
  }

  .sync-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.5rem;
    width: 100%;
  }

  .status-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
  }

  a {
    color: var(--primary);
    font-size: 13px;
    white-space: nowrap;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  label {
    font-size: 12px;
    font-weight: 500;
    color: var(--text-2);
  }

  input {
    font: inherit;
    background: var(--bg-2);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 8px 12px;
    outline: none;
    transition: border-color 0.1s;
  }

  input:focus { border-color: var(--primary); }

  .error {
    background: color-mix(in srgb, var(--danger) 10%, transparent);
    color: var(--danger);
    padding: 0.625rem 0.875rem;
    border-radius: var(--radius);
    font-size: 13px;
    margin: 0;
  }

  .success {
    background: color-mix(in srgb, #047857 10%, transparent);
    color: #047857;
    padding: 0.625rem 0.875rem;
    border-radius: var(--radius);
    font-size: 13px;
    margin: 0;
  }

  .button-row {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
    flex-wrap: wrap;
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

  button:hover:not(:disabled) { background: var(--border); }
  button:disabled { opacity: 0.5; cursor: not-allowed; }

  button.primary { background: var(--primary); color: white; }
  button.primary:hover:not(:disabled) { background: var(--primary-hover); }

  button.ghost { background: transparent; color: var(--text-2); }
  button.ghost:hover:not(:disabled) { background: var(--bg-3); color: var(--text); }
  button.danger { color: var(--danger); }

  .icon-btn {
    width: 28px;
    height: 28px;
    padding: 0;
    border-radius: 50%;
    font-size: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
</style>
