<script lang="ts">
  import BankView from './components/BankView.svelte';
  import TestView from './components/TestView.svelte';
  import HelpModal from './components/HelpModal.svelte';

  type Tab = 'bank' | 'build';
  let activeTab = $state<Tab>('bank');
  let helpOpen = $state(false);
</script>

<div class="app">
  <header>
    <span class="logo">
      <svg class="logo-icon" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <rect width="32" height="32" rx="7" fill="#2563eb"/>
        <text x="16" y="22" font-family="Georgia,'Times New Roman',serif" font-size="22" font-weight="400" fill="white" text-anchor="middle">∫</text>
      </svg>
      Test Generator
    </span>
    <nav>
      <button
        class:active={activeTab === 'bank'}
        onclick={() => (activeTab = 'bank')}
      >
        Question Bank
      </button>
      <button
        class:active={activeTab === 'build'}
        onclick={() => (activeTab = 'build')}
      >
        Build Test
      </button>
    </nav>
    <button class="help-btn" onclick={() => (helpOpen = true)} title="Help / README">?</button>
  </header>

  <main>
    {#if activeTab === 'bank'}
      <BankView />
    {:else}
      <TestView />
    {/if}
  </main>
</div>

{#if helpOpen}
  <HelpModal onclose={() => (helpOpen = false)} />
{/if}

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  header {
    display: flex;
    align-items: center;
    gap: 1.5rem;
    padding: 0 1rem;
    height: 48px;
    border-bottom: 1px solid var(--border);
    background: var(--bg);
    flex-shrink: 0;
  }

  .logo {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    font-weight: 600;
    font-size: 15px;
    color: var(--text);
  }

  .logo-icon {
    width: 22px;
    height: 22px;
    flex-shrink: 0;
    border-radius: 5px;
  }

  nav {
    display: flex;
    gap: 4px;
  }

  nav button {
    background: transparent;
    color: var(--text-2);
    font-size: 13px;
    font-weight: 500;
    padding: 4px 10px;
    border-radius: var(--radius);
  }

  nav button:hover {
    background: var(--bg-2);
    color: var(--text);
  }

  nav button.active {
    background: var(--bg-3);
    color: var(--text);
  }

  .help-btn {
    margin-left: auto;
    width: 26px;
    height: 26px;
    padding: 0;
    border-radius: 50%;
    background: var(--bg-3);
    color: var(--text-2);
    font-size: 13px;
    font-weight: 600;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .help-btn:hover {
    background: var(--border);
    color: var(--text);
  }

  main {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
</style>
