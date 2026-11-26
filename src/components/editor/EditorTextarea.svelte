<script lang="ts">
  let { value = $bindable(), element = $bindable(), label, placeholder, rows }: {
    value: string;
    element?: HTMLTextAreaElement;
    label: string;
    placeholder: string;
    rows: number;
  } = $props();
</script>

<textarea bind:this={element} bind:value {rows} aria-label={label} {placeholder}></textarea>

<style>
  textarea {
    display: block; width: 100%; resize: vertical; min-height: 3.8em;
    font-family: ui-monospace, monospace; font-size: var(--editor-text-size, 14px); line-height: 1.5;
  }
</style>
