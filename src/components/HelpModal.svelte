<script lang="ts">
  interface Props {
    onclose: () => void;
    onrestart: () => void;
  }

  let { onclose, onrestart }: Props = $props();

  const docsUrl = `${import.meta.env.BASE_URL.replace(/\/?$/, '/')}docs/`;

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose();
  }
</script>

<svelte:window on:keydown={onkeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="overlay" role="presentation" onclick={onclose}>
  <div
    class="modal"
    role="dialog"
    aria-modal="true"
    aria-label="Help"
    tabindex="-1"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => e.stopPropagation()}
  >
    <header>
      <h2>Help</h2>
      <button class="ghost" onclick={onclose} title="Close">✕</button>
    </header>
    <div class="body">
      <div class="docs-toolbar">
        <button class="tut-restart-btn" onclick={onrestart} title="Launch the step-by-step onboarding tutorial">↺ Restart Tutorial</button>
        <a class="docs-link" href={docsUrl} target="_blank" rel="noreferrer" title="Open documentation in a new tab">Open in New Tab</a>
      </div>
      <iframe class="docs-frame" src={docsUrl} title="Test Generator documentation"></iframe>
    </div>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 200;
  }

  .modal {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 8px 40px rgba(0, 0, 0, 0.25);
    width: min(1180px, calc(100vw - 2rem));
    max-width: calc(100vw - 2rem);
    height: calc(100vh - 3rem);
    max-height: calc(100vh - 3rem);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem 0.75rem;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  header h2 {
    font-size: 15px;
    font-weight: 600;
  }

  .body {
    min-height: 0;
    padding: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  .docs-toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--border);
    background: var(--bg);
    flex-shrink: 0;
  }

  .tut-restart-btn {
    font-size: 13px;
    font-weight: 600;
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: 7px;
    padding: 0.4rem 0.9rem;
    cursor: pointer;
    color: var(--text);
    transition: background 0.12s, border-color 0.12s;
  }
  .tut-restart-btn:hover {
    background: var(--bg-3);
    border-color: var(--text-2);
  }

  .docs-link {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 32px;
    font-size: 13px;
    font-weight: 600;
    background: var(--primary);
    border: 1px solid var(--primary);
    border-radius: 7px;
    padding: 0.45rem 1rem;
    color: white;
    text-decoration: none;
  }

  .docs-link:hover {
    filter: brightness(0.95);
  }

  .docs-frame {
    width: 100%;
    min-height: 0;
    flex: 1;
    border: 0;
    background: var(--bg);
  }

  @media (max-width: 560px) {
    .modal {
      width: 100vw;
      max-width: 100vw;
      height: 100vh;
      max-height: 100vh;
      border-radius: 0;
      border-left: 0;
      border-right: 0;
    }

    .docs-toolbar {
      align-items: stretch;
      flex-direction: column-reverse;
    }

    .tut-restart-btn,
    .docs-link {
      width: 100%;
      min-height: 36px;
    }
  }
</style>
