<script lang="ts">
  import { syncState } from '../../lib/sync/sync-state.svelte';
  import {
    initializeGoogleDrive,
    signInWithGoogle,
    signOutFromGoogle,
    getGoogleAuthState,
  } from '../../lib/sync/google-drive-api';

  interface Props {
    classId: string;
    className: string;
    onclose: () => void;
    onshared?: (link: string) => void;
  }

  const { classId, className, onclose, onshared }: Props = $props();

  let step = $state<'auth' | 'share' | 'success'>('auth');
  let password = $state('');
  let isInitializing = $state(false);
  let isSigningIn = $state(false);
  let isUploading = $state(false);
  let error = $state<string | null>(null);
  let colleagueEmail = $state('');
  let shareLink = $state<string | null>(null);

  const authState = $derived(getGoogleAuthState());

  async function initGoogleDrive() {
    try {
      isInitializing = true;
      error = null;
      await initializeGoogleDrive();
      step = 'auth';
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to initialize Google Drive';
    } finally {
      isInitializing = false;
    }
  }

  async function handleSignIn() {
    try {
      isSigningIn = true;
      error = null;
      await signInWithGoogle();
      step = 'share';
    } catch (e) {
      error = e instanceof Error ? e.message : 'Sign-in failed';
    } finally {
      isSigningIn = false;
    }
  }

  async function handleShare() {
    if (!colleagueEmail.trim()) {
      error = 'Please enter a colleague email';
      return;
    }
    if (!password.trim()) {
      error = 'Please enter the share password';
      return;
    }

    try {
      isUploading = true;
      error = null;

      const link = await syncState.shareViaGoogleDrive(classId, colleagueEmail, password);
      shareLink = link;
      step = 'success';
      if (onshared) {
        onshared(link);
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'Share failed';
    } finally {
      isUploading = false;
    }
  }

  async function handleSignOut() {
    try {
      await signOutFromGoogle();
      step = 'auth';
      colleagueEmail = '';
    } catch (e) {
      error = e instanceof Error ? e.message : 'Sign out failed';
    }
  }

  // Initialize on mount
  let initialized = $state(false);
  if (!initialized) {
    initialized = true;
    initGoogleDrive();
  }
</script>

<div class="overlay" onclick={onclose}>
  <div class="modal" onclick={(e) => e.stopPropagation()}>
    <header>
      <h2>Share {className}</h2>
      <button class="ghost icon-btn" onclick={onclose}>✕</button>
    </header>

    <div class="body">
      {#if step === 'auth'}
        <div class="step">
          <p class="info">Share your question bank with a colleague via Google Drive.</p>

          {#if isInitializing}
            <p class="loading">Initializing Google Drive...</p>
          {:else if authState.isSignedIn}
            <div class="signed-in">
              <p>Signed in as: <strong>{authState.userEmail}</strong></p>
              <div class="button-group">
                <button
                  class="primary"
                  onclick={() => (step = 'share')}
                  disabled={isUploading}
                >
                  Continue to Share
                </button>
                <button class="ghost" onclick={handleSignOut}>Sign out</button>
              </div>
            </div>
          {:else}
            <button class="primary" onclick={handleSignIn} disabled={isSigningIn}>
              {isSigningIn ? 'Signing in...' : 'Sign in with Google'}
            </button>
          {/if}

          {#if error}
            <p class="error">{error}</p>
          {/if}
        </div>
      {:else if step === 'share'}
        <div class="step">
          <div class="field">
            <label for="email">Colleague's email address</label>
            <input
              id="email"
              type="email"
              bind:value={colleagueEmail}
              placeholder="colleague@school.edu"
              disabled={isUploading}
            />
            <p class="hint">
              They'll receive an email invite and can import the questions into their app using
              this password.
            </p>
          </div>

          <div class="field">
            <label for="share-password">Share password</label>
            <input
              id="share-password"
              type="password"
              bind:value={password}
              placeholder="Choose a password for this share"
              disabled={isUploading}
              autocomplete="new-password"
            />
            <p class="hint">
              The colleague will need this password to decrypt. Share it with them via a separate
              channel (not Drive).
            </p>
          </div>

          {#if error}
            <p class="error">{error}</p>
          {/if}

          <div class="button-group">
            <button
              class="primary"
              onclick={handleShare}
              disabled={isUploading || !colleagueEmail.trim()}
            >
              {isUploading ? 'Uploading...' : 'Share to Google Drive'}
            </button>
            <button class="ghost" onclick={() => (step = 'auth')} disabled={isUploading}>
              Back
            </button>
          </div>
        </div>
      {:else if step === 'success'}
        <div class="step success">
          <p class="success-icon">✓</p>
          <h3>Shared Successfully!</h3>
          <p>Your question bank has been uploaded to Google Drive and shared with:</p>
          <p><strong>{colleagueEmail}</strong></p>

          <div class="link-box">
            <p class="label">Share this link:</p>
            <code>{shareLink}</code>
            <button
              class="ghost"
              onclick={() => {
                if (shareLink) navigator.clipboard.writeText(shareLink);
              }}
            >
              Copy link
            </button>
          </div>

          <p class="reminder">
            <strong>Important:</strong> Share the password with your colleague via a separate
            secure channel (email, Slack, etc.), not in the Drive file.
          </p>

          <button class="primary" onclick={onclose}>Done</button>
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
    role: dialog;
    aria-modal: true;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    width: 540px;
    max-width: calc(100vw - 2rem);
    max-height: calc(100vh - 4rem);
    display: flex;
    flex-direction: column;
  }

  header {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1.5rem;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  header h2 {
    flex: 1;
    font-size: 18px;
    font-weight: 600;
    margin: 0;
  }

  .body {
    overflow-y: auto;
    flex: 1;
    padding: 1.5rem;
  }

  .step {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .step.success {
    align-items: center;
    text-align: center;
  }

  .success-icon {
    font-size: 48px;
    margin: 0;
  }

  .step h3 {
    margin: 0;
    font-size: 20px;
  }

  .info {
    font-size: 14px;
    color: var(--text-2);
    margin: 0;
  }

  .hint {
    font-size: 12px;
    color: var(--text-2);
    margin: 0.5rem 0 0 0;
  }

  .loading {
    color: var(--text-2);
    font-size: 14px;
  }

  .error {
    background: color-mix(in srgb, var(--danger) 10%, transparent);
    color: var(--danger);
    padding: 0.75rem;
    border-radius: var(--radius);
    font-size: 14px;
    margin: 0;
  }

  .signed-in {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .signed-in p {
    margin: 0;
    font-size: 14px;
  }

  .button-group {
    display: flex;
    gap: 0.5rem;
  }

  .button-group button {
    flex: 1;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
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
    padding: 0.5rem 0.75rem;
    outline: none;
    transition: border-color 0.1s;
  }

  input:focus {
    border-color: var(--primary);
  }

  .password-display {
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  code {
    font-family: 'Fira Code', monospace;
    font-size: 13px;
    word-break: break-all;
    padding: 0.5rem;
    background: var(--bg);
    border-radius: 4px;
    border: 1px solid var(--border);
  }

  .link-box {
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .link-box .label {
    font-size: 12px;
    font-weight: 500;
    color: var(--text-2);
    margin: 0;
  }

  .link-box code {
    margin: 0;
  }

  .reminder {
    font-size: 13px;
    color: var(--text-2);
    background: color-mix(in srgb, var(--primary) 5%, transparent);
    padding: 0.75rem;
    border-radius: var(--radius);
    margin: 0;
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
    border: none;
    cursor: pointer;
    transition: background 0.1s;
  }

  .icon-btn:hover {
    background: var(--border);
    color: var(--text);
  }

  button {
    font: inherit;
    cursor: pointer;
    border: none;
    border-radius: var(--radius);
    padding: 0.5rem 1rem;
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
    padding: 0.25rem 0.75rem;
  }

  button.ghost:hover:not(:disabled) {
    background: var(--bg-3);
    color: var(--text);
  }
</style>
