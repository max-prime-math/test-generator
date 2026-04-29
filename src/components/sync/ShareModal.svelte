<script lang="ts">
  import { syncState } from '../../lib/sync/sync-state.svelte';

  interface Props {
    classId: string;
    className: string;
    onclose: () => void;
  }

  const { classId, className, onclose }: Props = $props();

  let step = $state<'input' | 'success'>('input');
  let username = $state('');
  let isLoading = $state(false);
  let error = $state<string | null>(null);
  let sharePassword = $state<string | null>(null);
  let copied = $state(false);

  async function doShare() {
    if (!username.trim()) {
      error = 'Please enter a GitHub username';
      return;
    }

    try {
      isLoading = true;
      error = null;
      const password = await syncState.share(classId, username.trim());
      sharePassword = password;
      step = 'success';
    } catch (e) {
      error = e instanceof Error ? e.message : 'Share failed';
    } finally {
      isLoading = false;
    }
  }

  async function copyPassword() {
    if (!sharePassword) return;
    try {
      await navigator.clipboard.writeText(sharePassword);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {
      // ignore
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
      <h2>Share {className}</h2>
      <button class="ghost icon-btn" onclick={onclose} disabled={isLoading}>✕</button>
    </header>

    <div class="body">
      {#if step === 'input'}
        <p class="info">
          Enter your colleague's GitHub username. They'll be added as a collaborator on
          the private repo and receive an email invite from GitHub.
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
            {isLoading ? 'Sharing…' : 'Share'}
          </button>
        </div>
      {:else if step === 'success'}
        <div class="success">
          <p class="success-icon">✓</p>
          <h3>Shared with {username}</h3>
          <p class="info">
            They'll receive an email from GitHub to accept the repo invite.
            Send them this <strong>share password</strong> via a separate channel
            (Signal, Slack, in person — not email).
          </p>

          <div class="password-box">
            <code>{sharePassword}</code>
            <button class="ghost-pill" onclick={copyPassword}>
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>

          <p class="reminder">
            <strong>What happens next:</strong> after they accept the GitHub invite and log
            into Test Generator with their own PAT and password, they'll see {className}
            as a "pending share" in their sync panel. They enter this share password once
            to claim it — then it's tied to their own password.
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
    width: 520px;
    max-width: calc(100vw - 2rem);
    display: flex;
    flex-direction: column;
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
    transition: border-color 0.1s;
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

  .success {
    text-align: center;
  }

  .success-icon {
    font-size: 40px;
    margin: 0 0 0.5rem 0;
    color: #16a34a;
  }

  .success h3 {
    margin: 0 0 0.75rem 0;
    font-size: 18px;
  }

  .password-box {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.75rem;
    margin-bottom: 1.25rem;
  }

  .password-box code {
    flex: 1;
    font-family: 'Fira Code', 'Cascadia Code', monospace;
    font-size: 14px;
    text-align: left;
    word-break: break-all;
    color: var(--text);
    user-select: all;
  }

  .reminder {
    font-size: 12px;
    color: var(--text-2);
    background: color-mix(in srgb, var(--primary) 5%, transparent);
    border: 1px solid color-mix(in srgb, var(--primary) 15%, var(--border));
    padding: 0.75rem 1rem;
    border-radius: var(--radius);
    text-align: left;
    line-height: 1.6;
    margin: 0 0 1.25rem 0;
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

  button.full {
    width: 100%;
  }

  .ghost-pill {
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 100px;
    padding: 4px 12px;
    font-size: 12px;
    color: var(--text-2);
  }

  .ghost-pill:hover:not(:disabled) {
    border-color: var(--primary);
    color: var(--primary);
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
