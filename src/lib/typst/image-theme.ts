const LUMA = [0.2126, 0.7152, 0.0722];
const channels = (hex: string) => [0, 2, 4].map(at => parseInt(hex.slice(at, at + 2), 16) / 255);
const luminance = (rgb: number[]) => rgb.reduce((sum, channel, i) => sum + channel * LUMA[i], 0);

/**
 * Recolour only neutral image pixels in themed previews. Chromatic pixels
 * retain their original RGB values, unlike invert/hue-rotate filters. Neutral
 * white becomes transparent so the actual themed page shows through; neutral
 * ink follows the theme text colour. The embedded image bytes and the PDF
 * compiler's output are never changed.
 */
export function themePreviewImages(svg: string, source: string): string {
  if (!svg.includes('<image ')) return svg;
  // Every themed preview supplies these page/text colours before its content.
  // Read the preview source, not the live UI theme: a queued render or print
  // preview can intentionally use a different palette from the current page.
  const background = source.match(/#set page\([^\n]*fill:\s*rgb\("#?([a-f\d]{6})"\)/i)?.[1];
  const foreground = source.match(/#set text\([^\n]*fill:\s*rgb\("#?([a-f\d]{6})"\)/i)?.[1];
  if (!background || !foreground) return svg;
  const bg = channels(background), fg = channels(foreground);
  if (Math.abs(luminance(bg) - luminance(fg)) < 0.01) return svg;

  const id = `tg-image-tone-${background.toLowerCase()}-${foreground.toLowerCase()}`;
  const extract = (channel: number) => Array.from({ length: 3 }, () =>
    [...LUMA.map((_, i) => i === channel ? 1 : 0), 0, 0].join(' ')).join(' ') + ' 0 0 0 0 1';
  const recolour = fg.flatMap(value => [0, 0, 0, 0, value])
    .concat([0, 0, 0, 1, 0]).join(' ');
  // max(R,G,B) - min(R,G,B) measures colourfulness. Preserve coloured pixels;
  // spreads up to 8/255 are neutral JPEG noise, fading out by 32/255.
  // Neutral ink gets opacity (1 - luminance), making white paper transparent
  // so it always inherits the actual page/background colour beneath the image.
  const filter = `<defs><filter id="${id}" color-interpolation-filters="sRGB" x="0" y="0" width="100%" height="100%">
<feColorMatrix in="SourceGraphic" values="${extract(0)}" result="red"/>
<feColorMatrix in="SourceGraphic" values="${extract(1)}" result="green"/>
<feColorMatrix in="SourceGraphic" values="${extract(2)}" result="blue"/>
<feBlend in="red" in2="green" mode="lighten" result="max-rg"/>
<feBlend in="max-rg" in2="blue" mode="lighten" result="maximum"/>
<feBlend in="red" in2="green" mode="darken" result="min-rg"/>
<feBlend in="min-rg" in2="blue" mode="darken" result="minimum"/>
<feBlend in="maximum" in2="minimum" mode="difference" result="chroma"/>
<feComponentTransfer in="chroma" result="neutral"><feFuncR type="linear" slope="-10.625" intercept="1.3333333333333333"/></feComponentTransfer>
<feColorMatrix in="neutral" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 1 0 0 0 0" result="neutral-mask"/>
<feColorMatrix in="SourceGraphic" values="${recolour}" result="themed"/>
<feColorMatrix in="SourceGraphic" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 ${LUMA.map(weight => -weight).join(' ')} 0 1" result="ink-mask"/>
<feComposite in="themed" in2="ink-mask" operator="in" result="ink"/>
<feComposite in="ink" in2="neutral-mask" operator="in" result="neutral-pixels"/>
<feComposite in="SourceGraphic" in2="neutral-mask" operator="out" result="colour-pixels"/>
<feComposite in="neutral-pixels" in2="colour-pixels" operator="arithmetic" k2="1" k3="1"/>
</filter></defs>`;
  return svg.replace(/(<svg\b[^>]*>)/, `$1${filter}`)
    .replace(/<image\b/g, `<image filter="url(#${id})"`);
}
