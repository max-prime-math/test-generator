<script lang="ts">
  import { syncState } from '../../lib/sync/sync-state.svelte';

  interface Props {
    onclose: () => void;
  }

  const { onclose }: Props = $props();

  let pat = $state('');
  let isLoading = $state(false);
  let error = $state<string | null>(null);

  async function completeSetup() {
    if (!pat.trim()) {
      error = 'Please enter a Personal Access Token';
      return;
    }
    try {
      isLoading = true;
      error = null;
      await syncState.setup(pat.trim());
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

<div class="overlay" onclick={() => !isLoading && onclose()}>
  <div class="modal" role="dialog" aria-modal="true" onclick={(e) => e.stopPropagation()}>
    <header>
      <h2>Set Up GitHub Sync</h2>
      <button class="ghost icon-btn" onclick={onclose} disabled={isLoading}>✕</button>
    </header>

    <div class="body">
      <p class="info">
        Your question bank will be backed up to a private repo named
        <code>test-generator-bank</code> in your GitHub account.
        Questions are stored as plain JSON — the repo being private keeps them secure.
      </p>

      <details class="how-to">
        <summary>How to create a token</summary>
        <ol>
          <li>Go to <a href="https://github.com/settings/tokens/new" target="_blank" rel="noopener">github.com/settings/tokens/new</a> (classic tokens)</li>
          <li>Set a note like "Test Generator"</li>
          <li>Set expiration as you prefer (or "No expiration")</li>
          <li>Check the full <strong>repo</strong> scope</li>
          <li>Click "Generate token" and copy it</li>
        </ol>
      </details>

      <div class="field">
        <label for="pat">Personal Access Token</label>
        <input
          id="pat"
          type="password"
          bind:value={pat}
          placeholder="ghp_..."
          disabled={isLoading}
          autocomplete="off"
          onkeydown={(e) => e.key === 'Enter' && completeSetup()}
        />
      </div>

      {#if error}
        <p class="error">{error}</p>
      {/if}

      <div class="button-row">
        <button class="ghost" onclick={onclose} disabled={isLoading}>Cancel</button>
        <button class="primary" onclick={completeSetup} disabled={isLoading || !pat.trim()}>
          {isLoading ? 'Connecting…' : 'Connect'}
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
    width: 480px;
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

  .info code {
    background: var(--bg-2);
    padding: 1px 6px;
    border-radius: 3px;
    font-size: 12px;
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
