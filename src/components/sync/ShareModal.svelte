<script lang="ts">
  import { syncState } from '../../lib/sync/sync-state.svelte';

  interface Props {
    onclose: () => void;
  }

  const { onclose }: Props = $props();

  let username = $state('');
  let isLoading = $state(false);
  let error = $state<string | null>(null);
  let done = $state(false);

  async function doShare() {
    if (!username.trim()) { error = 'Please enter a GitHub username'; return; }
    try {
      isLoading = true;
      error = null;
      await syncState.share(username.trim());
      done = true;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Share failed';
    } finally {
      isLoading = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && !isLoading) onclose();
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="overlay" onclick={() => !isLoading && onclose()}>
  <div class="modal" role="dialog" aria-modal="true" onclick={(e) => e.stopPropagation()}>
    <header>
      <h2>Share Repo Access</h2>
      <button class="ghost icon-btn" onclick={onclose} disabled={isLoading}>✕</button>
    </header>

    <div class="body">
      {#if !done}
        <p class="info">
          Enter your colleague's GitHub username. They'll receive a GitHub email
          invite and gain read/write access to the whole <code>test-generator-bank</code>
          repo once they accept.
        </p>

        <div class="field">
          <label for="username">GitHub username</label>
          <input
            id="username"
            type="text"
            bind:value={username}
            placeholder="e.g., janedoe"
            disabled={isLoading}
            autocomplete="off"
            onkeydown={(e) => e.key === 'Enter' && doShare()}
          />
        </div>

        {#if error}
          <p class="error">{error}</p>
        {/if}

        <div class="button-row">
          <button class="ghost" onclick={onclose} disabled={isLoading}>Cancel</button>
          <button class="primary" onclick={doShare} disabled={isLoading || !username.trim()}>
            {isLoading ? 'Sending invite…' : 'Send invite'}
          </button>
        </div>
      {:else}
        <div class="success">
          <p class="success-icon">✓</p>
          <h3>Invite sent to {username}</h3>
          <p class="info">
            They'll get an email from GitHub. Once they accept and open Test Generator
            with their own PAT, the repo and all its classes will be available to them.
          </p>
          <button class="primary full" onclick={onclose}>Done</button>
        </div>
      {/if}
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
    width: 440px;
    max-width: calc(100vw - 2rem);
  }

  header {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1.25rem 1.5rem;
    border-bottom: 1px solid var(--border);
  }

  header h2 { flex: 1; font-size: 18px; font-weight: 600; margin: 0; }

  .body { padding: 1.5rem; }

  .info {
    font-size: 13px;
    color: var(--text-2);
    margin: 0 0 1.25rem 0;
    line-height: 1.6;
  }

  .info code {
    background: var(--bg-2);
    padding: 1px 5px;
    border-radius: 3px;
    font-size: 12px;
  }

  .field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 1rem; }

  label { font-size: 12px; font-weight: 500; color: var(--text-2); }

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
    margin: 0 0 1rem 0;
  }

  .success { text-align: center; }
  .success-icon { font-size: 36px; margin: 0 0 0.5rem 0; color: #16a34a; }
  .success h3 { margin: 0 0 0.75rem 0; font-size: 17px; }

  .button-row { display: flex; gap: 0.5rem; justify-content: flex-end; }

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
  button.full { width: 100%; }

  .icon-btn {
    width: 28px; height: 28px; padding: 0; border-radius: 50%;
    font-size: 14px; display: flex; align-items: center; justify-content: center;
  }
</style>
