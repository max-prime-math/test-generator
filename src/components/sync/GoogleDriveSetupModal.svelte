<script lang="ts">
  import { syncState } from '../../lib/sync/sync-state.svelte';

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
  let isLoading = $state(false);
  let error = $state<string | null>(null);

  const appConfigured = $derived(Boolean(clientId.trim() && apiKey.trim() && projectNumber.trim()));

  async function completeSetup() {
    if (!appConfigured) {
      error = 'Google Drive sync needs a client ID, Picker API key, and Cloud project number';
      return;
    }

    try {
      isLoading = true;
      error = null;
      await syncState.connectProvider('googleDrive', {
        clientId: clientId.trim(),
        apiKey: apiKey.trim(),
        projectNumber: projectNumber.trim(),
      });
      onclose();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Setup failed';
    } finally {
      isLoading = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && !isLoading) onclose();
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<div
  class="overlay"
  role="dialog"
  aria-modal="true"
  tabindex="-1"
  onclick={() => !isLoading && onclose()}
  onkeydown={(e) => e.key === 'Escape' && !isLoading && onclose()}
>
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions a11y_no_static_element_interactions -->
  <div
    class="modal"
    role="document"
    tabindex="-1"
    onclick={(e) => e.stopPropagation()}
  >
    <header>
      <h2>Set Up Google Drive Sync</h2>
      <button class="ghost icon-btn" onclick={onclose} disabled={isLoading}>✕</button>
    </header>

    <div class="body">
      <p class="info">
        This stores backup files in a visible Google Drive folder that you choose during setup. The app will only manage files it creates there.
      </p>

      <details class="how-to">
        <summary>Google Cloud setup</summary>
        <ol>
          <li>Open <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener">Google Cloud Credentials</a>.</li>
          <li>Create or select a project and enable both the <strong>Google Drive API</strong> and the <strong>Google Picker API</strong>.</li>
          <li>Create an <strong>OAuth client ID</strong> for a <strong>Web application</strong>.</li>
          <li>Create a public <strong>API key</strong> and restrict it to the Google Picker API and your app origins.</li>
          <li>Copy your Google Cloud <strong>project number</strong>.</li>
          <li>Add this app's origin to <strong>Authorized JavaScript origins</strong>.</li>
          <li>Set these values in <code>.env.local</code> or GitHub Actions repo variables so normal users never have to enter them.</li>
        </ol>
      </details>

      {#if !envClientId || !envApiKey || !envProjectNumber}
        <div class="field">
          <label for="google-client-id">OAuth client ID</label>
          <input
            id="google-client-id"
            type="text"
            bind:value={clientId}
            placeholder="1234567890-abc123def456.apps.googleusercontent.com"
            disabled={isLoading}
            autocomplete="off"
            onkeydown={(e) => e.key === 'Enter' && completeSetup()}
          />
        </div>

        <div class="field">
          <label for="google-api-key">Picker API key</label>
          <input
            id="google-api-key"
            type="text"
            bind:value={apiKey}
            placeholder="AIza..."
            disabled={isLoading}
            autocomplete="off"
            onkeydown={(e) => e.key === 'Enter' && completeSetup()}
          />
        </div>

        <div class="field">
          <label for="google-project-number">Cloud project number</label>
          <input
            id="google-project-number"
            type="text"
            bind:value={projectNumber}
            placeholder="123456789012"
            disabled={isLoading}
            autocomplete="off"
            onkeydown={(e) => e.key === 'Enter' && completeSetup()}
          />
        </div>
      {:else}
        <p class="info">
          App-level Google Drive configuration was detected. Continuing will open Google sign-in and then a folder picker so you can choose where backups live in Drive.
        </p>
      {/if}

      {#if error}
        <p class="error">{error}</p>
      {/if}

      <div class="button-row">
        <button class="ghost" onclick={onclose} disabled={isLoading}>Cancel</button>
        <button class="primary" onclick={completeSetup} disabled={isLoading || !appConfigured}>
          {isLoading ? 'Connecting…' : 'Choose Folder'}
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

  .info {
    font-size: 13px;
    color: var(--text-2);
    margin: 0;
    line-height: 1.6;
  }

  .how-to {
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.75rem 1rem;
    font-size: 13px;
  }

  .how-to summary {
    cursor: pointer;
    font-weight: 500;
    color: var(--text);
    user-select: none;
  }

  .how-to ol {
    margin: 0.75rem 0 0 1.25rem;
    color: var(--text-2);
    line-height: 1.7;
  }

  .how-to a { color: var(--primary); }

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

  .button-row {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
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
