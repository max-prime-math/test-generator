<script lang="ts">
  import { tick } from 'svelte';
  import { appLock } from '../lib/app-lock.svelte';
  import { localWorkspace } from '../lib/local-workspace.svelte';

  let password = $state('');
  let error = $state('');
  let busy = $state(false);
  let passwordInput = $state<HTMLInputElement>();
  let prepared = $state<Awaited<ReturnType<typeof appLock.prepareUnlock>>>(null);
  let prepareSequence = 0;

  $effect(() => {
    if (!appLock.locked) return;
    void tick().then(() => passwordInput?.focus());
  });

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (busy) return;
    busy = true;
    error = '';
    if (await appLock.unlock(password, prepared)) {
      password = '';
      prepared = null;
    } else {
      error = 'That password is not correct.';
      password = '';
      await tick();
      passwordInput?.focus();
    }
    busy = false;
  }

  function updatePassword(event: Event) {
    password = (event.currentTarget as HTMLInputElement).value;
    prepared = null;
    const candidate = password;
    const sequence = ++prepareSequence;
    if (!candidate) return;
    // Hash while the teacher types so Unlock only needs a local comparison.
    void appLock.prepareUnlock(candidate).then(result => {
      if (sequence === prepareSequence && candidate === password) prepared = result;
    });
  }

  async function allowWorkspace() {
    if (busy) return;
    busy = true;
    error = '';
    try {
      await localWorkspace.grantPermission();
      await appLock.syncFromWorkspace(localWorkspace.root);
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Workspace access could not be restored.';
    } finally { busy = false; }
  }

  function keepKeysInLock(event: KeyboardEvent) {
    // The app underneath has global shortcuts; none should run while locked.
    event.stopPropagation();
  }
</script>

<div class="lock-screen" role="dialog" aria-modal="true"
  aria-labelledby={!appLock.ready && !appLock.locked || appLock.permissionNeeded ? 'app-lock-title' : undefined}
  aria-label={(appLock.ready || appLock.locked) && !appLock.permissionNeeded ? 'Unlock Test Generator' : undefined}
  tabindex="-1" onkeydown={keepKeysInLock}>
  <form class="lock-card" autocomplete="off" onsubmit={submit} data-lpignore="true" data-1p-ignore="true" data-bwignore="true">
    {#if (!appLock.ready && !appLock.locked) || appLock.permissionNeeded}
      <div class="lock-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="4" y="10" width="16" height="11" rx="2" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3" />
        </svg>
      </div>
    {/if}
    {#if !appLock.ready && !appLock.locked}
      <div class="lock-copy">
        <h1 id="app-lock-title">Opening Test Generator</h1>
        <p>Checking workspace protection…</p>
      </div>
    {:else if appLock.permissionNeeded}
      <div class="lock-copy">
        <h1 id="app-lock-title">Workspace access required</h1>
        <p>Test Generator must check the connected workspace before it can determine whether the app is locked.</p>
      </div>
      {#if error}<p class="lock-error" role="alert">{error}</p>{/if}
      <button class="unlock-button" type="button" onclick={allowWorkspace} disabled={busy}>{busy ? 'Opening…' : 'Allow Workspace Access'}</button>
    {:else}
      <input
        bind:this={passwordInput}
        class="lock-secret"
        type="text"
        name="workspace-entry"
        autocomplete="off"
        autocapitalize="none"
        spellcheck="false"
        required
        value={password}
        oninput={updatePassword}
        aria-label="Unlock"
        aria-invalid={error ? 'true' : undefined}
      />
      {#if error}<p class="lock-error" role="alert">{error}</p>{/if}
      <button class="unlock-button" type="submit" disabled={!appLock.ready || busy || !password}>{busy ? 'Checking…' : 'Unlock'}</button>
    {/if}
  </form>
</div>

<style>
  .lock-screen {
    position: fixed;
    inset: 0;
    z-index: 10000;
    display: grid;
    place-items: center;
    padding: 1rem;
    background: color-mix(in srgb, var(--bg) 48%, transparent);
    -webkit-backdrop-filter: blur(20px) brightness(0.72) saturate(0.65);
    backdrop-filter: blur(20px) brightness(0.72) saturate(0.65);
    color: var(--text);
  }

  .lock-card {
    width: min(100%, 24rem);
    display: grid;
    gap: 1rem;
    padding: 2rem;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--bg);
    box-shadow: 0 18px 60px rgba(0, 0, 0, 0.2);
  }

  .lock-mark {
    display: grid;
    place-items: center;
    width: 3rem;
    height: 3rem;
    border-radius: 12px;
    background: color-mix(in srgb, var(--accent) 14%, var(--bg));
    color: var(--accent);
  }

  .lock-mark svg { width: 1.5rem; height: 1.5rem; }
  .lock-copy { display: grid; gap: .35rem; }
  h1 { margin: 0; color: var(--text); font-size: 1.25rem; }
  p { margin: 0; }
  .lock-copy p { color: var(--text-2); line-height: 1.45; }
  input { width: 100%; min-height: 2.75rem; box-sizing: border-box; font-size: 1rem; }
  .lock-secret { -webkit-text-security: disc; }
  .unlock-button { min-height: 2.75rem; background: var(--accent); color: white; font-weight: 600; }
  .lock-error { color: var(--danger, #c33); font-size: .85rem; }

  @media (max-width: 480px) {
    .lock-card { padding: 1.4rem; }
  }
</style>
