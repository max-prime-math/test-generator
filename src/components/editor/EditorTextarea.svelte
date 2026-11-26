<script lang="ts">
  let { value = $bindable(), element = $bindable(), label, placeholder, rows }: {
    value: string;
    element?: HTMLTextAreaElement;
    label: string;
    placeholder: string;
    rows: number;
  } = $props();

  function resize(direction: number) {
    if (!element) return;
    const style = getComputedStyle(element);
    const height = element.getBoundingClientRect().height + direction * 3 * parseFloat(style.lineHeight);
    element.style.height = `${Math.max(parseFloat(style.minHeight), Math.round(height))}px`;
  }
</script>

<div class="text-box">
  <textarea bind:this={element} bind:value {rows} aria-label={label} {placeholder}></textarea>
  <div class="size-controls" role="group" aria-label={`${label} text box height`}>
    <button type="button" class="ghost" aria-label={`Make ${label} text box shorter`} onclick={() => resize(-1)}>Shorter</button>
    <button type="button" class="ghost" aria-label={`Make ${label} text box taller`} onclick={() => resize(1)}>Taller</button>
  </div>
</div>

<style>
  .text-box { width: 100%; min-width: 0; }
  textarea {
    display: block; width: 100%; resize: vertical; min-height: 3.8em;
    font-family: ui-monospace, monospace; font-size: var(--editor-text-size, 14px); line-height: 1.5;
  }
  .size-controls { display: flex; justify-content: flex-end; gap: .25rem; margin-top: .2rem; }
  .size-controls button { padding: .2rem .4rem; font-size: 11px; color: var(--text-2); }
</style>
