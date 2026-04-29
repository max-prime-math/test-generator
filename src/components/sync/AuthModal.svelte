<script lang="ts">
  import { syncState } from '../../lib/sync/sync-state.svelte';

  interface Props {
    onclose: () => void;
    onunlocked?: () => void;
  }

  const { onclose, onunlocked }: Props = $props();

  let password = $state('');
  let isLoading = $state(false);
  let error = $state<string | null>(null);

  async function unlock() {
    if (!password) return;

    try {
      isLoading = true;
      error = null;
      const success = await syncState.unlock(password);
      if (success) {
        password = '';
        if (onunlocked) onunlocked();
        onclose();
      } else {
        error = 'Incorrect password';
        password = '';
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'Unlock failed';
    } finally {
      isLoading = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !isLoading) unlock();
  }
</script>

<div class="backdrop">
  <div class="lock-card" role="dialog" aria-modal="true">
    <div class="lock-icon">
      <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor" aria-hidden="true">
        <path d="M12 1a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V11a2 2 0 0 0-2-2h-1V6a5 5 0 0 0-5-5zm-3 8V6a3 3 0 1 1 6 0v3H9zm3 5a2 2 0 0 1 1 3.732V20h-2v-2.268A2 2 0 0 1 12 14z"/>
      </svg>
    </div>
    <h2>Session Locked</h2>
    <p class="info">Enter your password to continue syncing.</p>

    <div class="field">
      <input
        type="password"
        bind:value={password}
        placeholder="Password"
        disabled={isLoading}
        autocomplete="current-password"
        autofocus
        onkeydown={handleKeydown}
      />
    </div>

    {#if error}
      <p class="error">{error}</p>
    {/if}

    <div class="button-row">
      <button class="ghost" onclick={onclose} disabled={isLoading}>Cancel</button>
      <button class="primary" onclick={unlock} disabled={isLoading || !password}>
        {isLoading ? 'Unlocking...' : 'Unlock'}
      </button>
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    z-index: 300;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: fade-in 0.2s ease-out;
  }

  @keyframes fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .lock-card {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 12px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
    padding: 2rem;
    width: 380px;
    max-width: calc(100vw - 2rem);
    text-align: center;
    animation: scale-in 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  }

  @keyframes scale-in {
    from { transform: scale(0.92); opacity: 0; }
    to { transform: scale(1); opacity: 1; }
  }

  .lock-icon {
    width: 56px;
    height: 56px;
    margin: 0 auto 1.25rem auto;
    border-radius: 50%;
    background: color-mix(in srgb, var(--primary) 12%, transparent);
    color: var(--primary);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  h2 {
    font-size: 18px;
    font-weight: 600;
    margin: 0 0 0.5rem 0;
  }

  .info {
    font-size: 13px;
    color: var(--text-2);
    margin: 0 0 1.5rem 0;
  }

  .field {
    margin-bottom: 1rem;
  }

  input {
    font: inherit;
    background: var(--bg-2);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 10px 14px;
    outline: none;
    width: 100%;
    text-align: center;
    transition: border-color 0.1s;
  }

  input:focus {
    border-color: var(--primary);
  }

  .error {
    background: color-mix(in srgb, var(--danger) 10%, transparent);
    color: var(--danger);
    padding: 0.5rem 0.875rem;
    border-radius: var(--radius);
    font-size: 13px;
    margin: 0 0 1rem 0;
  }

  .button-row {
    display: flex;
    gap: 0.5rem;
  }

  .button-row button {
    flex: 1;
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
</style>
