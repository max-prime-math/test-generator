<script lang="ts">
  import BankView from './components/BankView.svelte';
  import TestView from './components/TestView.svelte';
  import HelpModal from './components/HelpModal.svelte';

  type Tab = 'bank' | 'build';
  let activeTab = $state<Tab>('bank');
  let helpOpen = $state(false);

  type Theme = 'auto' | 'light' | 'dark';
  let theme = $state<Theme>((localStorage.getItem('theme') as Theme) ?? 'auto');

  function isDark(): boolean {
    if (theme === 'dark') return true;
    if (theme === 'light') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function toggleTheme() {
    theme = isDark() ? 'light' : 'dark';
    localStorage.setItem('theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
  }

  $effect(() => {
    if (theme === 'auto') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
  });
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
      <div class="nav-segment">
        <div class="nav-pill" class:right={activeTab === 'build'}></div>
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
      </div>
    </nav>
    <div class="header-actions">
      <button class="icon-btn" onclick={toggleTheme} title="Toggle dark/light mode">
        {isDark() ? '☀' : '☾'}
      </button>
      <button class="help-btn" onclick={() => (helpOpen = true)} title="Help / README">?</button>
    </div>
  </header>

  <main>
    <div class="views-track" class:show-build={activeTab === 'build'}>
      <div class="view-slot"><BankView /></div>
      <div class="view-slot"><TestView /></div>
    </div>
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
    height: 52px;
    border-bottom: 1px solid var(--border);
    background: var(--bg);
    flex-shrink: 0;
  }

  .logo {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    font-weight: 600;
    font-size: 17px;
    color: var(--text);
  }

  .logo-icon {
    width: 28px;
    height: 28px;
    flex-shrink: 0;
    border-radius: 5px;
  }

  nav {
    flex: 1;
    display: flex;
    justify-content: center;
  }

  .nav-segment {
    position: relative;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2px;
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 3px;
  }

  .nav-pill {
    position: absolute;
    top: 3px;
    bottom: 3px;
    left: 3px;
    width: calc(50% - 4px);
    background: var(--bg);
    border-radius: 5px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.12), 0 0 0 1px var(--border);
    transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    pointer-events: none;
  }

  .nav-pill.right {
    transform: translateX(calc(100% + 2px));
  }

  .nav-segment button {
    position: relative;
    background: transparent;
    color: var(--text-2);
    font-size: 15px;
    font-weight: 500;
    padding: 5px 18px;
    border-radius: 5px;
    transition: color 0.15s;
    border: none;
    cursor: pointer;
  }

  .nav-segment button:hover {
    color: var(--text);
  }

  .nav-segment button.active {
    color: var(--text);
    font-weight: 600;
  }

  .header-actions {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 6px;
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

  .icon-btn:hover {
    background: var(--border);
    color: var(--text);
  }

  .help-btn {
    width: 28px;
    height: 28px;
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
    position: relative;
  }

  .views-track {
    display: flex;
    width: 200%;
    height: 100%;
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .views-track.show-build {
    transform: translateX(-50%);
  }

  .view-slot {
    width: 50%;
    height: 100%;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
</style>
