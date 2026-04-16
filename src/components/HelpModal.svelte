<script lang="ts">
  import { marked } from 'marked';
  // Vite ?raw import — inlines the file as a string at build time
  import readmeSource from '../../README.md?raw';

  interface Props {
    onclose: () => void;
  }

  let { onclose }: Props = $props();

  const html = marked.parse(readmeSource) as string;

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose();
  }
</script>

<svelte:window on:keydown={onkeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="overlay" onclick={onclose}>
  <div
    class="modal"
    role="dialog"
    aria-modal="true"
    aria-label="Help"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => e.stopPropagation()}
  >
    <header>
      <h2>Help</h2>
      <button class="ghost" onclick={onclose}>✕</button>
    </header>
    <div class="body prose">
      <!-- README is our own static content — no XSS risk -->
      <!-- eslint-disable-next-line svelte/no-at-html-tags -->
      {@html html}
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
    border-radius: 10px;
    box-shadow: 0 8px 40px rgba(0, 0, 0, 0.25);
    width: 740px;
    max-width: calc(100vw - 2rem);
    max-height: calc(100vh - 4rem);
    display: flex;
    flex-direction: column;
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
    overflow-y: auto;
    padding: 1.5rem 1.75rem;
    flex: 1;
  }

  /* Markdown prose styles */
  .prose :global(h1) {
    font-size: 20px;
    font-weight: 700;
    margin-bottom: 0.5rem;
  }

  .prose :global(h2) {
    font-size: 15px;
    font-weight: 700;
    margin-top: 1.75rem;
    margin-bottom: 0.5rem;
    padding-bottom: 0.3rem;
    border-bottom: 1px solid var(--border);
  }

  .prose :global(h3) {
    font-size: 13px;
    font-weight: 600;
    margin-top: 1.25rem;
    margin-bottom: 0.4rem;
    color: var(--text);
  }

  .prose :global(p) {
    line-height: 1.65;
    margin-bottom: 0.75rem;
    color: var(--text);
  }

  .prose :global(hr) {
    border: none;
    border-top: 1px solid var(--border);
    margin: 1.5rem 0;
  }

  .prose :global(ul),
  .prose :global(ol) {
    padding-left: 1.5rem;
    margin-bottom: 0.75rem;
  }

  .prose :global(li) {
    margin-bottom: 0.25rem;
    line-height: 1.6;
  }

  .prose :global(code) {
    background: var(--bg-3);
    border-radius: 3px;
    padding: 1px 5px;
    font-size: 12px;
    color: var(--text);
  }

  .prose :global(pre) {
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.75rem 1rem;
    overflow-x: auto;
    margin-bottom: 0.75rem;
  }

  .prose :global(pre code) {
    background: none;
    padding: 0;
    font-size: 12px;
    line-height: 1.6;
  }

  .prose :global(table) {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 1rem;
    font-size: 13px;
  }

  .prose :global(th) {
    text-align: left;
    font-weight: 600;
    padding: 6px 10px;
    background: var(--bg-2);
    border: 1px solid var(--border);
    color: var(--text-2);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .prose :global(td) {
    padding: 6px 10px;
    border: 1px solid var(--border);
    vertical-align: top;
  }

  .prose :global(tr:nth-child(even) td) {
    background: var(--bg-2);
  }

  .prose :global(strong) {
    font-weight: 600;
  }

  .prose :global(a) {
    color: var(--primary);
    text-decoration: none;
  }

  .prose :global(a:hover) {
    text-decoration: underline;
  }
</style>
