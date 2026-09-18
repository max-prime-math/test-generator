/**
 * Moves an element to <body> so it escapes transformed ancestors.
 *
 * The view track in App.svelte animates tab changes with `transform`, which
 * makes it the containing block for any `position: fixed` descendant. Overlays
 * rendered inside a view would otherwise be laid out against the multi-screen
 * track instead of the viewport, sliding off to the left in Test Builder.
 */
export function portal(node: HTMLElement) {
  document.body.appendChild(node);
  return {
    destroy() {
      node.remove();
    },
  };
}
