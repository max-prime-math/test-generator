<script lang="ts">
  import { syncState } from '../../lib/sync/sync-state.svelte';
  import { getCurrentUser } from '../../lib/sync/github-api';

  interface Props {
    onclose: () => void;
  }

  const { onclose }: Props = $props();

  let step = $state<'pat' | 'password'>('pat');
  let pat = $state('');
  let password = $state('');
  let confirmPassword = $state('');
  let isLoading = $state(false);
  let error = $state<string | null>(null);
  let githubUsername = $state<string | null>(null);

  async function validatePat() {
    if (!pat.trim()) {
      error = 'Please enter a Personal Access Token';
      return;
    }

    try {
      isLoading = true;
      error = null;
      const user = await getCurrentUser(pat.trim());
      githubUsername = user.login;
      step = 'password';
    } catch (e) {
      error = e instanceof Error
        ? `Invalid token: ${e.message}`
        : 'Failed to validate token';
    } finally {
      isLoading = false;
    }
  }

  async function completeSetup() {
    if (password.length < 8) {
      error = 'Password must be at least 8 characters';
      return;
    }
    if (password !== confirmPassword) {
      error = 'Passwords do not match';
      return;
    }

    try {
      isLoading = true;
      error = null;
      await syncState.setup(pat.trim(), password);
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
      <div class="steps-indicator">
        <div class="step-dot" class:active={step === 'pat'} class:done={step === 'password'}>1</div>
        <div class="step-line" class:done={step === 'password'}></div>
        <div class="step-dot" class:active={step === 'password'}>2</div>
      </div>

      {#if step === 'pat'}
        <div class="step-content">
          <h3>Step 1: GitHub Personal Access Token</h3>
          <p class="info">
            We need a token with <code>repo</code> scope so we can create a private repo
            to back up your encrypted question bank. Your data stays in your GitHub account.
          </p>

          <details class="how-to">
            <summary>How to create a token</summary>
            <ol>
              <li>Go to <a href="https://github.com/settings/tokens/new" target="_blank" rel="noopener">github.com/settings/tokens/new</a> (classic tokens)</li>
              <li>Set a note like "Test Generator Sync"</li>
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
            />
          </div>

          {#if error}
            <p class="error">{error}</p>
          {/if}

          <div class="button-row">
            <button class="ghost" onclick={onclose} disabled={isLoading}>Cancel</button>
            <button class="primary" onclick={validatePat} disabled={isLoading || !pat.trim()}>
              {isLoading ? 'Validating...' : 'Continue'}
            </button>
          </div>
        </div>
      {:else if step === 'password'}
        <div class="step-content">
          <h3>Step 2: Create Password</h3>
          <p class="info">
            Authenticated as <strong>{githubUsername}</strong>.
            This password encrypts your question bank and locks the sync UI.
            <strong>It cannot be recovered if forgotten</strong> — write it down somewhere safe.
          </p>

          <div class="field">
            <label for="password">Password (min 8 characters)</label>
            <input
              id="password"
              type="password"
              bind:value={password}
              disabled={isLoading}
              autocomplete="new-password"
            />
          </div>

          <div class="field">
            <label for="confirm">Confirm password</label>
            <input
              id="confirm"
              type="password"
              bind:value={confirmPassword}
              disabled={isLoading}
              autocomplete="new-password"
              onkeydown={(e) => e.key === 'Enter' && completeSetup()}
            />
          </div>

          {#if error}
            <p class="error">{error}</p>
          {/if}

          <div class="button-row">
            <button class="ghost" onclick={() => (step = 'pat')} disabled={isLoading}>Back</button>
            <button
              class="primary"
              onclick={completeSetup}
              disabled={isLoading || password.length < 8 || password !== confirmPassword}
            >
              {isLoading ? 'Setting up...' : 'Complete Setup'}
            </button>
          </div>
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
    max-height: calc(100vh - 4rem);
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
    overflow-y: auto;
    padding: 1.5rem;
  }

  .steps-indicator {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    margin-bottom: 2rem;
  }

  .step-dot {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--bg-3);
    color: var(--text-2);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: 600;
    transition: all 0.2s;
  }

  .step-dot.active {
    background: var(--primary);
    color: white;
  }

  .step-dot.done {
    background: color-mix(in srgb, var(--primary) 20%, transparent);
    color: var(--primary);
  }

  .step-line {
    width: 60px;
    height: 2px;
    background: var(--border);
    transition: background 0.2s;
  }

  .step-line.done {
    background: var(--primary);
  }

  .step-content h3 {
    font-size: 16px;
    font-weight: 600;
    margin: 0 0 0.5rem 0;
  }

  .info {
    font-size: 13px;
    color: var(--text-2);
    margin: 0 0 1.25rem 0;
    line-height: 1.5;
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
    margin-bottom: 1.25rem;
    font-size: 13px;
  }

  .how-to summary {
    cursor: pointer;
    font-weight: 500;
    color: var(--text);
  }

  .how-to ol {
    margin: 0.75rem 0 0 1.25rem;
    color: var(--text-2);
    line-height: 1.6;
  }

  .how-to a {
    color: var(--primary);
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

  .button-row {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
    margin-top: 1.5rem;
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
