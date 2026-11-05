<script lang="ts">
  let { onopen, label = 'Open question in display window', compact = false, disabled = false }: {
    onopen: () => void;
    label?: string;
    compact?: boolean;
    disabled?: boolean;
  } = $props();
</script>

<button
  type="button"
  class="display-button"
  class:compact
  {disabled}
  title={label}
  aria-label={label}
  onclick={(event) => { event.stopPropagation(); onopen(); }}
>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <rect x="3" y="4" width="18" height="13" rx="2" />
    <path d="M8 21h8M12 17v4M8 8H6v2M16 8h2v2M8 14H6v-2M16 14h2v-2" />
  </svg>
</button>

<style>
  .display-button {
    width: 32px;
    height: 32px;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    background: transparent;
    color: var(--text-2);
    border: 1px solid var(--border);
    border-radius: 6px;
  }
  .display-button:hover:not(:disabled) { color: var(--text); background: var(--bg-2); }
  .display-button:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
  .display-button.compact { width: 27px; height: 27px; border-color: transparent; }
  svg { width: 18px; height: 18px; }
</style>
