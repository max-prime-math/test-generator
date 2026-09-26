import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';

const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
server.middlewares.use('/worker-test.html', (_request, response) => {
  response.setHeader('Content-Type', 'text/html');
  response.end('<!doctype html><title>Typst worker regression</title>');
});
await server.listen();
let browser;
try {
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  const workers = [];
  page.on('workercreated', worker => workers.push(worker.url()));
  await page.goto(`${server.resolvedUrls.local[0]}worker-test.html`);
  const result = await page.evaluate(async () => {
    const { compileSvg, compile, compileMultiple } = await import('/src/lib/typst/compiler.ts');
    const { imageStore } = await import('/src/lib/image-store.svelte.ts');
    await imageStore.init();
    const image = fill => new TextEncoder().encode(`<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30"><rect width="30" height="30" fill="${fill}"/></svg>`);
    await imageStore.put('worker-fixture', image('red'), 'svg');
    const source = '#set page(width: 100pt, height: auto)\n#image("/imgs/worker-fixture", width: 20pt)';
    const [first, pdf] = await Promise.all([compileSvg(source), compile(source)]);
    const pdfBytes = pdf.pdfUrl ? new Uint8Array(await (await fetch(pdf.pdfUrl)).arrayBuffer()) : [];
    if (pdf.pdfUrl) URL.revokeObjectURL(pdf.pdfUrl);
    await imageStore.put('worker-fixture', image('blue'), 'svg');
    const replacement = await compileSvg(source);
    const invalid = await compileSvg('#this-function-does-not-exist()');
    const recovered = await compileSvg('Recovered $x^2 + 1$');
    const cached = await compileSvg('Recovered $x^2 + 1$');
    const bulk = await compileMultiple(['First', '#invalid-function()', 'Third']);
    let ticks = 0;
    let maxGap = 0;
    let previous = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      maxGap = Math.max(maxGap, now - previous);
      previous = now;
      ticks++;
    }, 10);
    const started = performance.now();
    const heavy = await compileSvg(Array.from({ length: 2000 }, (_, i) => `Question ${i}: $sqrt(x^2 + ${i})$\n\n`).join(''));
    const elapsed = performance.now() - started;
    clearInterval(timer);
    return { first: !!first.svg, firstError: first.error, imageChanged: replacement.svg !== first.svg,
      pdfHeader: String.fromCharCode(...pdfBytes.slice(0, 5)), invalid: !!invalid.error,
      recovered: !!recovered.svg, cached: cached.svg === recovered.svg,
      bulk: bulk.map(entry => entry.name), heavy: !!heavy.svg, ticks, maxGap, elapsed };
  });
  assert.ok(workers.some(url => url.includes('compiler.worker')), 'Compilation uses a dedicated worker');
  assert.ok(result.first, result.firstError);
  assert.equal(result.pdfHeader, '%PDF-');
  assert.ok(result.imageChanged, 'Replacing image bytes invalidates preview');
  assert.ok(result.invalid && result.recovered && result.cached, 'Invalid source does not poison subsequent jobs');
  assert.deepEqual(result.bulk, ['question-01.pdf', 'question-03.pdf']);
  assert.ok(result.heavy && result.ticks > 5, 'UI timers continue while a large document compiles');
  assert.ok(result.maxGap < 500, `Main-thread timer stalled for ${result.maxGap}ms`);
  console.log('Typst worker regression passed:', JSON.stringify(result));
} finally {
  await browser?.close();
  await server.close();
}
