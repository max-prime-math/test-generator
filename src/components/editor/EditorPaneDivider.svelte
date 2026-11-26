<script lang="ts">
  let { label, controls, width, minimum, maximum, direction, onresize, onreset }: {
    label: string;
    controls: string;
    width: number;
    minimum: number;
    maximum: number;
    direction: 1 | -1;
    onresize: (width: number | undefined, commit: boolean) => void;
    onreset: () => void;
  } = $props();

  let drag = $state<{ pointer: number; start: number; width: number } | null>(null);
  function limit(value: number) {
    return Math.round(Math.min(Math.max(value, minimum), maximum));
  }
  function begin(event: PointerEvent) {
    if (drag || event.button !== 0) return;
    event.preventDefault();
    const divider = event.currentTarget as HTMLDivElement;
    divider.focus();
    divider.setPointerCapture(event.pointerId);
    drag = { pointer: event.pointerId, start: event.clientX, width };
  }
  function move(event: PointerEvent, commit = false) {
    if (!drag || event.pointerId !== drag.pointer) return;
    const next = limit(drag.width + direction * (event.clientX - drag.start));
    if (commit) drag = null;
    onresize(next, commit);
  }
  function cancel(event: PointerEvent) {
    if (event.pointerId !== drag?.pointer) return;
    drag = null;
    onresize(undefined, false);
  }
  function keydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      onreset();
      return;
    }
    const step = event.shiftKey ? 40 : 12;
    const widths: Partial<Record<string, number>> = { ArrowLeft: width - direction * step, ArrowRight: width + direction * step, Home: minimum, End: maximum };
    const next = widths[event.key];
    if (next === undefined) return;
    event.preventDefault();
    onresize(limit(next), true);
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions (A focusable separator is the keyboard control for pane width.) -->
<div
  class="divider"
  class:dragging={drag !== null}
  role="separator"
  aria-label={label}
  aria-orientation="vertical"
  aria-controls={controls}
  aria-valuemin={Math.round(minimum)}
  aria-valuemax={Math.round(maximum)}
  aria-valuenow={Math.round(width)}
  aria-valuetext={`${Math.round(width)} pixels`}
  tabindex="0"
  title="Drag or use Left and Right arrows to resize. Double-click or press Enter to reset."
  onpointerdown={begin}
  onpointermove={move}
  onpointerup={(event) => move(event, true)}
  onlostpointercapture={cancel}
  onpointercancel={cancel}
  ondblclick={onreset}
  onkeydown={keydown}
></div>

<style>
  .divider { position: relative; cursor: col-resize; touch-action: none; user-select: none; }
  .divider::before { content: ''; position: absolute; inset: 0 calc(50% - 1px); background: var(--border); }
  .divider::after { content: ''; position: absolute; top: .8rem; left: 3px; right: 3px; height: 1.6rem; border-radius: 4px; background: var(--text-2); }
  .divider:hover::before, .divider.dragging::before, .divider:focus-visible::before { background: var(--primary); }
  .divider:hover::after, .divider.dragging::after, .divider:focus-visible::after { background: var(--primary); }
  .divider:focus-visible { outline: 2px solid var(--primary); outline-offset: -2px; }
</style>
