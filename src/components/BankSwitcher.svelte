<script lang="ts">
  import { bankWorkspaces } from '../lib/bank-workspaces.svelte';
  import { bankView } from '../lib/bank-switch-view.svelte';
  import { perf } from '../lib/perf-diagnostics';
  import { appSettings } from '../lib/app-settings.svelte';
  import { localWorkspace } from '../lib/local-workspace.svelte';
  import { workspaceCatalog } from '../lib/workspace-catalog.svelte';
  import { REMOTE_CONFIG_CHANGED_EVENT, remoteConfigStore, type GitRemoteConfig } from '../git/remoteConfig';

  // The active bank always stays listed so the switcher can show it.
  const bankOptions = $derived(bankView.banks.filter(bank =>
    bank.id === bankView.activeBankId || !workspaceCatalog.hiddenBankIds.has(bank.id)));

  const uid = $props.id();
  let gitRemotes = $state<GitRemoteConfig[]>([]);

  function preferredRemote(remotes: GitRemoteConfig[]): GitRemoteConfig | null {
    return remotes.find((remote) => remote.name === 'origin')
      ?? remotes.find((remote) => remote.kind === 'github')
      ?? remotes[0]
      ?? null;
  }

  function bankOptionLabel(workspaceId: string, workspaceName: string): string {
    if (!appSettings.gitFeaturesEnabled || workspaceId !== bankView.activeBankId) return workspaceName;
    const remote = preferredRemote(gitRemotes);
    if (remote?.kind === 'github' && remote.github) return `${remote.github.owner}/${remote.github.repo}`;
    return workspaceName;
  }

  async function refreshGitRemoteLabel() {
    if (!appSettings.gitFeaturesEnabled) { gitRemotes = []; return; }
    gitRemotes = await remoteConfigStore.listRemotes();
  }

  $effect(() => {
    bankView.activeBankId;
    appSettings.gitFeaturesEnabled;
    void refreshGitRemoteLabel();
    const refresh = () => void refreshGitRemoteLabel();
    window.addEventListener(REMOTE_CONFIG_CHANGED_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(REMOTE_CONFIG_CHANGED_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  });

  let failedSwitchTarget = $state<string | null>(null);
  async function switchBank(id: string) {
    // Outgoing edits are flushed by each store as part of the switch itself,
    // so a second request while switching simply becomes the new destination.
    failedSwitchTarget = null;
    perf.begin('bank-switch-visible');
    await bankWorkspaces.switchBank(id);
    if (bankWorkspaces.switchError) failedSwitchTarget = id;
    else perf.end('bank-switch-visible', 'Bank switch: request to loaded');
  }

  function renameBank() {
    const name = window.prompt('Bank name', bankWorkspaces.activeBank.name);
    if (name === null) return;
    bankWorkspaces.renameActiveBank(name);
  }

  async function createBank() {
    const name = window.prompt('New bank name', 'New Test Bank');
    if (name === null) return;
    await bankWorkspaces.createBank(name);
  }
</script>

<div class="bank-switcher">
  <label class="bank-label" for="{uid}-bank">Bank</label>
  <div class="bank-row">
    <select
      id="{uid}-bank"
      value={bankView.activeBankId}
      onchange={(e) => void switchBank(e.currentTarget.value)}
      disabled={localWorkspace.busy}
      aria-busy={bankView.switching}
      aria-label="Current bank"
      title={bankOptionLabel(bankView.activeBankId, bankView.activeBank?.name ?? '')}
    >
      {#each bankOptions as workspace}
        <option value={workspace.id}>{bankOptionLabel(workspace.id, workspace.name)}</option>
      {/each}
    </select>
    <button class="bank-btn" onclick={() => void createBank()} disabled={bankView.switching || localWorkspace.busy} title="Create a new local bank" aria-label="Create a new local bank">+</button>
    <button class="bank-btn" onclick={renameBank} disabled={bankView.switching || localWorkspace.busy} title="Rename this bank" aria-label="Rename this bank">✎</button>
  </div>
  {#if bankView.phase}
    <span class="bank-switch-status" role="status"><span class="spinner" aria-hidden="true"></span>{bankView.phase}…</span>
  {:else if bankView.error}
    <span class="bank-switch-status error" role="alert">
      {bankView.error}
      {#if failedSwitchTarget}<button onclick={() => void switchBank(failedSwitchTarget!)}>Retry</button>{/if}
      <button onclick={() => { bankWorkspaces.switchError = null; failedSwitchTarget = null; }} aria-label="Dismiss">✕</button>
    </span>
  {/if}
</div>

<style>
  .bank-switcher {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    padding: 0.25rem 0.75rem 0.6rem;
    margin-bottom: 0.35rem;
    border-bottom: 1px solid var(--border);
  }
  .bank-label {
    color: var(--text-2);
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .bank-row { display: flex; align-items: center; gap: 0.3rem; min-width: 0; }
  .bank-row select {
    flex: 1;
    min-width: 0;
    height: 32px;
    padding: 3px 24px 3px 8px;
    border: 0;
    border-radius: 6px;
    box-shadow: none;
    background: var(--bg-2);
    font-size: 13px;
    font-weight: 500;
  }
  .bank-row select:hover { background: var(--bg-3); }
  .bank-row select:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
  .bank-btn {
    width: 28px;
    height: 28px;
    padding: 0;
    border: 0;
    border-radius: 6px;
    box-shadow: none;
    background: transparent;
    color: var(--text-2);
    font-size: 15px;
    font-weight: 600;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .bank-btn:hover { background: var(--bg-3); color: var(--text); }
  .bank-switch-status { display: flex; align-items: center; gap: .4rem; font-size: 12px; color: var(--text-2); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bank-switch-status.error { color: var(--danger, #b91c1c); white-space: normal; flex-wrap: wrap; }
  .bank-switch-status button { font-size: 11px; padding: 1px 6px; }
  .bank-switch-status .spinner { width: 10px; height: 10px; border-radius: 50%; border: 2px solid currentColor; border-right-color: transparent; animation: bank-spin .8s linear infinite; flex: none; }
  @keyframes bank-spin { to { transform: rotate(360deg); } }
  @media (max-width: 760px) {
    .bank-row select { height: 44px; font-size: 16px; }
    .bank-btn { width: 44px; height: 44px; border-radius: 8px; }
  }
</style>
