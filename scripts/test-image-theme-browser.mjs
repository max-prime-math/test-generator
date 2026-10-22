import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';

const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
server.middlewares.use('/image-theme-test.html', (_request, response) => {
  response.setHeader('Content-Type', 'text/html');
  response.end('<!doctype html><title>Image theme regression</title>');
});
await server.listen();
let browser;
try {
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.goto(`${server.resolvedUrls.local[0]}image-theme-test.html`);
  const result = await page.evaluate(async () => {
    const { imageStore } = await import('/src/lib/image-store.svelte.ts');
    const { compileSvg, compile } = await import('/src/lib/typst/compiler.ts');
    await imageStore.init();
    const swatches = ['#000000', '#ffffff', '#808080', '#ff0000', '#00ff00', '#0000ff', '#ff8800', '#aa00ff'];
    const canvas = document.createElement('canvas');
    canvas.width = 180; canvas.height = 40;
    const ctx = canvas.getContext('2d');
    swatches.forEach((colour, i) => { ctx.fillStyle = colour; ctx.fillRect(i * 20, 0, 20, 40); });
    // The final swatch is transparent, to check that the filter preserves alpha.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'; ctx.fillRect(170, 0, 10, 40);
    const png = await new Promise(resolve => canvas.toBlob(resolve));
    const originalPng = new Uint8Array(await png.arrayBuffer());
    await imageStore.put('swatches-png', originalPng, 'png');
    const originalSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="40">${swatches.map((colour, i) => `<rect x="${i * 20}" width="20" height="40" fill="${colour}"/>`).join('')}<rect x="170" width="10" height="40" fill="black" opacity="0.5"/></svg>`;
    await imageStore.put('swatches-svg', new TextEncoder().encode(originalSvg), 'svg');
    const samples = [];
    for (const [background, foreground] of [['1c1c1e', 'f5f5f7'], ['282828', 'ebdbb2'], ['ffffff', '000000']]) {
      for (const ext of ['png', 'svg']) {
        const source = `#set page(width: 180pt, height: 40pt, margin: 0pt, fill: rgb("${background}"))\n#set text(fill: rgb("${foreground}"))\n#image("/imgs/swatches-${ext}", width: 180pt)`;
        const rendered = await compileSvg(source);
        if (!rendered.svg) throw new Error(rendered.error ?? 'No SVG');
        // The renderer emits HTML-compatible SVG (including a script with &&).
        // Match the app's HTML insertion, then serialize valid XML for canvas.
        const parsed = new DOMParser().parseFromString(rendered.svg, 'text/html');
        const svg = new XMLSerializer().serializeToString(parsed.querySelector('svg'));
        const preview = new Image();
        preview.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
        await preview.decode();
        ctx.clearRect(0, 0, 180, 40);
        ctx.drawImage(preview, 0, 0, 180, 40);
        const pixels = Array.from({ length: 9 }, (_, i) => [...ctx.getImageData(i * 20 + (i === 8 ? 5 : 10), 20, 1, 1).data]);
        pixels.push([...ctx.getImageData(175, 20, 1, 1).data]);
        samples.push({ background, foreground, ext, pixels, themed: rendered.svg.includes('tg-image-tone-') });
      }
    }
    const stored = await imageStore.get('swatches-png');
    const pdf = await compile('#set page(width: 180pt, height: 40pt, margin: 0pt)\n#image("/imgs/swatches-png", width: 180pt)');
    const pdfBytes = pdf.pdfUrl ? (await (await fetch(pdf.pdfUrl)).arrayBuffer()).byteLength : 0;
    if (pdf.pdfUrl) URL.revokeObjectURL(pdf.pdfUrl);
    return { samples, swatches, unchanged: stored.bytes.length === originalPng.length && stored.bytes.every((byte, i) => byte === originalPng[i]), pdfError: pdf.error, pdfBytes };
  });
  const rgb = hex => [0, 2, 4].map(at => parseInt(hex.replace('#', '').slice(at, at + 2), 16));
  const close = (actual, expected, label) => {
    assert.ok(expected.every((channel, i) => Math.abs(actual[i] - channel) <= 2), `${label}: expected ${expected}, got ${actual}`);
    assert.equal(actual[3], 255, `${label}: remains opaque`);
  };
  for (const { background, foreground, ext, pixels, themed } of result.samples) {
    const light = background === 'ffffff';
    assert.equal(themed, !light);
    close(pixels[0], rgb(light ? '000000' : foreground), `${ext} ${background}: black follows theme text`);
    close(pixels[1], rgb(background), `${ext} ${background}: white follows page background`);
    close(pixels[2], light ? [128, 128, 128] : rgb(foreground).map((value, i) => value + (rgb(background)[i] - value) * 128 / 255), `${ext} ${background}: grey interpolates within the theme`);
    for (let i = 3; i < result.swatches.length; i++) close(pixels[i], rgb(result.swatches[i]), `${ext} ${background}: colour ${result.swatches[i]} is preserved`);
    close(pixels[8], rgb(background), `${ext} ${background}: transparency reveals the page`);
    close(pixels[9], rgb(foreground).map((value, i) => (value + rgb(background)[i]) / 2), `${ext} ${background}: translucent lines keep their opacity`);
  }
  assert.equal(result.unchanged, true, 'preview must not modify stored originals');
  assert.equal(result.pdfError, undefined);
  assert.ok(result.pdfBytes > 1000, 'original image still exports as a PDF');
  console.log('Image themes passed: raster/SVG neutral pixels match dark palettes, colour pixels retain original RGB, transparency/light preview/originals/PDF remain intact.');
} finally {
  await browser?.close();
  await server.close();
}
