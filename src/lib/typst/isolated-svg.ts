/**
 * Keep a compiled SVG's styles and glyph IDs local to its preview. Inserting a
 * second Typst SVG into the document otherwise invalidates references throughout
 * an existing test preview, even when the new SVG came straight from the cache.
 */
export function isolatedSvg(node: HTMLElement, svg: string) {
  const root = node.attachShadow({ mode: 'open' });
  let current = '';
  function update(value: string) {
    if (value === current) return;
    current = value;
    root.innerHTML = `<style>:host { display: block; } svg { display: block; width: 100%; height: auto; }</style>${value}`;
  }
  update(svg);
  return { update };
}
