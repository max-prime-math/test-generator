<script lang="ts">
  import { syncState } from '../../lib/sync/sync-state.svelte';

  interface Props {
    classId: string;
    className: string;
    ownerId: string;
    onclose: () => void;
    onclaimed?: () => void;
  }

  const { classId, className, ownerId, onclose, onclaimed }: Props = $props();

  let sharePassword = $state('');
  let isLoading = $state(false);
  let error = $state<string | null>(null);

  async function doClaim() {
    if (!sharePassword.trim()) {
      error = 'Please enter the share password';
      return;
    }

    try {
      isLoading = true;
      error = null;
      await syncState.claim(classId, sharePassword.trim());
      if (onclaimed) onclaimed();
      onclose();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Claim failed';
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
      <h2>Claim {className}</h2>
      <button class="ghost icon-btn" onclick={onclose} disabled={isLoading}>✕</button>
    </header>

    <div class="body">
      <p class="info">
        <strong>{ownerId}</strong> shared this class with you. Enter the share password
        they sent you to claim it. After this, your own password will unlock it — the
        share password becomes invalid.
      </p>

      <div class="field">
        <label for="share-pw">Share password</label>
        <input
          id="share-pw"
          type="password"
          bind:value={sharePassword}
          placeholder="Paste the password from your colleague"
          disabled={isLoading}
          autocomplete="off"
          onkeydown={(e) => e.key === 'Enter' && doClaim()}
        />
      </div>

      {#if error}
        <p class="error">{error}</p>
      {/if}

      <div class="button-row">
        <button class="ghost" onclick={onclose} disabled={isLoading}>Cancel</button>
        <button class="primary" onclick={doClaim} disabled={isLoading || !sharePassword.trim()}>
          {isLoading ? 'Claiming…' : 'Claim'}
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
    width: 460px;
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
  }

  .info {
    font-size: 13px;
    color: var(--text-2);
    margin: 0 0 1.25rem 0;
    line-height: 1.6;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 1rem;
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
  }

  input:focus {
    border-color: var(--primary);
  }

  .error {
    background: color-mix(in srgb, var(--danger) 10%, transparent);
    color: var(--danger);
    padding: 0.625rem 0.875rem;
    border-radius: var(--radius);
    font-size: 13px;
    margin: 0 0 1rem 0;
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
  }

  button:hover:not(:disabled) {
    background: var(--border);
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
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

  .icon-btn:hover:not(:disabled) {
    background: var(--border);
    color: var(--text);
  }
</style>
