// Desktop Build responsiveness: only requested previews, latest layout wins,
// image freshness, hidden views, and PDF exports during a pending render.
// Synthetic data in an isolated browser; no host banks or teacher records.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';

const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
server.middlewares.use('/build-preview-test.html', (_request, response) => {
  response.setHeader('Content-Type', 'text/html');
  response.end('<!doctype html><title>Build preview regression</title>');
});
await server.listen();
let browser;
try {
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 950 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.evaluateOnNewDocument(() => {
    window.__jobs = [];
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (data, ...rest) {
      if (data?.kind) window.__jobs.push({ kind: data.kind, source: data.document?.source ?? '' });
      if (data?.kind === 'svg' && window.__holdNextSvg) {
        window.__holdNextSvg = false;
        window.__releaseSvg = () => { post.call(this, data, ...rest); window.__releaseSvg = null; };
        return;
      }
      return post.call(this, data, ...rest);
    };
  });
  const base = server.resolvedUrls.local[0];
  await page.goto(`${base}build-preview-test.html`);
  await page.evaluate(async () => {
    localStorage.setItem('tg-tutorial-done-v1', '1');
    localStorage.setItem('tg-perf-diagnostics-v1', '1');
    localStorage.setItem('theme', 'dark');
    const questions = Array.from({ length: 1500 }, (_, i) => ({
      id: `q${i}`, body: `Preview fixture ${i}: solve $x + ${i} = ${i + 3}$.` + (i % 2 ? '' : '\n#image("/imgs/diagram", width: 3cm)'),
      points: 2, tags: [], checked: true, createdAt: 1,
    }));
    localStorage.setItem('math-test-bank-v2', JSON.stringify(questions));
    const { defaultTestConfig } = await import('/src/lib/types.ts');
    localStorage.setItem('tg-test-draft-v1', JSON.stringify({
      ...defaultTestConfig('Preview regression'), answerSpace: 0,
      selectedIds: questions.slice(0, 40).map(q => q.id), ownQuestions: questions.slice(0, 40),
    }));
    const { imageStore } = await import('/src/lib/image-store.svelte.ts');
    await imageStore.init();
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="60" height="40"><path d="M5 35L30 5L55 35Z" fill="none" stroke="red" stroke-width="2"/></svg>';
    await imageStore.put('diagram', new TextEncoder().encode(svg), 'svg');
  });
  await page.goto(`${base}#/build`, { waitUntil: 'networkidle0' });
  const ready = () => page.waitForSelector('.preview .svg-scroll:not(.stale) svg', { timeout: 60000 });
  await ready();
  assert.ok(await page.evaluate(() => window.__jobs.filter(job => job.kind === 'svg').length <= 2), 'opening Build does not compile dozens of unrequested question previews');
  await page.click('#picker-tab-selected');
  await page.hover('.selected-list .sel-item');
  await page.waitForSelector('.hover-svg svg image', { timeout: 30000 });
  const originalHover = await page.$eval('.hover-svg', el => el.innerHTML);
  await page.evaluate(async () => {
    const { imageStore } = await import('/src/lib/image-store.svelte.ts');
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="60" height="40"><circle cx="30" cy="20" r="15" fill="blue"/></svg>';
    await imageStore.put('diagram', new TextEncoder().encode(svg), 'svg');
  });
  await page.waitForFunction(before => document.querySelector('.hover-svg')?.innerHTML && document.querySelector('.hover-svg').innerHTML !== before, {}, originalHover);
  await ready();
  await page.mouse.move(5, 5);
  await page.waitForFunction(() => !document.querySelector('.hover-preview'));

  // Moving across selected questions replaces queued hover work, too.
  const enterQuestion = index => page.evaluate(index => {
    document.querySelectorAll('.selected-list .sel-item')[index].dispatchEvent(new MouseEvent('mouseenter'));
  }, index);
  await page.evaluate(() => { window.__holdNextSvg = true; });
  await enterQuestion(20);
  await page.waitForFunction(() => !!window.__releaseSvg);
  await enterQuestion(21);
  await new Promise(resolve => setTimeout(resolve, 160));
  await enterQuestion(22);
  await new Promise(resolve => setTimeout(resolve, 160));
  await page.evaluate(() => window.__releaseSvg());
  await page.waitForSelector('.hover-preview[data-preview-for="q22"] .hover-svg svg');
  assert.equal(await page.evaluate(() => window.__jobs.some(job => job.source.includes('#set page(width: 13cm,') && job.source.includes('Preview fixture 21:'))), false, 'passing over another question does not leave its obsolete preview queued');
  await page.evaluate(() => document.querySelector('.picker-panel').dispatchEvent(new MouseEvent('mouseleave')));
  await page.waitForFunction(() => !document.querySelector('.hover-preview'));

  // Updating an unused image should leave both compiler and document alone.
  const beforeUnusedImage = await page.evaluate(() => window.__jobs.length);
  await page.evaluate(async () => {
    const { imageStore } = await import('/src/lib/image-store.svelte.ts');
    await imageStore.put('unrelated', new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'), 'svg');
  });
  await new Promise(resolve => setTimeout(resolve, 400));
  assert.equal(await page.evaluate(() => window.__jobs.length), beforeUnusedImage, 'an unused image does not recompile the test');

  const setTitle = title => page.$eval('#t-title', (input, value) => {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, title);
  await page.evaluate(() => { window.__holdNextSvg = true; });
  await setTitle('First pending layout');
  await page.waitForFunction(() => !!window.__releaseSvg);
  await setTitle('Obsolete queued layout');
  await new Promise(resolve => setTimeout(resolve, 220));
  await setTitle('Latest queued layout');
  await new Promise(resolve => setTimeout(resolve, 220));
  assert.ok(await page.$('.preview .svg-scroll.stale svg'), 'the previous document stays visible while its replacement waits');
  const queue = await page.evaluate(async () => (await import('/src/lib/typst/compiler.ts')).previewQueueState());
  assert.equal(queue.queued, 1, 'intermediate layout edits leave only the latest request queued');
  await page.evaluate(async () => {
    const { compile } = await import('/src/lib/typst/compiler.ts');
    window.__pdf = compile('Export while preview is queued').then(async result => {
      const bytes = new Uint8Array(await (await fetch(result.pdfUrl)).arrayBuffer());
      URL.revokeObjectURL(result.pdfUrl);
      return String.fromCharCode(...bytes.slice(0, 5));
    });
    window.__releaseSvg();
  });
  await ready();
  assert.equal(await page.evaluate(() => window.__pdf), '%PDF-', 'preview replacement preserves explicit exports');
  assert.equal(await page.evaluate(() => window.__jobs.some(job => job.source.includes('Obsolete queued layout'))), false, 'obsolete layouts never reach the worker');
  assert.equal(await page.evaluate(() => window.__jobs.some(job => job.source.includes('Latest queued layout'))), true);

  // Invalid source keeps a clearly marked last good document and can recover.
  await page.evaluate(async () => {
    const { testEditor } = await import('/src/lib/test-editor.svelte.ts');
    window.__validBody = testEditor.config.ownQuestions[0].body;
    testEditor.config.ownQuestions[0].body = '#not-a-valid-function()';
  });
  await page.waitForSelector('.preview-error[role="alert"]', { timeout: 30000 });
  assert.ok(await page.$('.preview .svg-scroll.stale svg'));
  await page.evaluate(async () => {
    const { testEditor } = await import('/src/lib/test-editor.svelte.ts');
    testEditor.config.ownQuestions[0].body = window.__validBody;
  });
  await ready();
  assert.equal(await page.$('.preview-error'), null);

  // A hidden Build view stops rendering and catches up when reopened.
  await page.evaluate(() => { location.hash = '#/editor'; });
  await page.waitForFunction(() => document.querySelector('.build-tab').closest('.view-slot').classList.contains('hidden'));
  const beforeHiddenEdit = await page.evaluate(() => window.__jobs.length);
  await page.evaluate(async () => {
    const { testEditor } = await import('/src/lib/test-editor.svelte.ts');
    testEditor.config.title = 'Updated while Build was hidden';
  });
  await new Promise(resolve => setTimeout(resolve, 400));
  assert.equal(await page.evaluate(() => window.__jobs.length), beforeHiddenEdit, 'hidden Build does no preview work');
  await page.evaluate(() => { location.hash = '#/build'; });
  await ready();
  assert.equal(await page.evaluate(() => window.__jobs.some(job => job.source.includes('Updated while Build was hidden'))), true);
  assert.deepEqual(errors, []);
  console.log('Desktop Build preview regressions passed: bounded work, current images, latest layout only, preserved PDF export, clear stale/error state, hidden-view suspension.');
} finally {
  await browser?.close();
  await server.close();
}
