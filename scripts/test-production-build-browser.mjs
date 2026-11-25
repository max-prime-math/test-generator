// Production bundles load the Typst worker, its WASM and the export worker
// under both the root base and a GitHub Pages project subpath.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer';
import { build, preview } from 'vite';

const results = [];
let browser;
try {
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  for (const base of ['/', '/test-generator/']) {
    const outDir = mkdtempSync(join(tmpdir(), 'tg-prod-'));
    process.env.VITE_BASE_PATH = base;
    await build({ logLevel: 'error', build: { outDir, emptyOutDir: true } });
    const shims = [];
    let unavailable = 0, failedWasmFetches = 0;
    const server = await preview({
      base, build: { outDir }, preview: { host: '127.0.0.1', port: 0 }, logLevel: 'error',
      plugins: [{
        name: 'compiler-load-fixture',
        configurePreviewServer(server) {
          server.middlewares.use((req, res, next) => {
            if (req.url?.includes('/assets/wasm-pack-shim-')) shims.push(req.url);
            if (unavailable > 0 && req.url?.includes('/assets/typst_ts_web_compiler_bg-')) {
              unavailable--;
              failedWasmFetches++;
              res.writeHead(503, { 'Cache-Control': 'no-store' });
              res.end('Compiler file temporarily unavailable');
              return;
            }
            next();
          });
        },
      }],
    });
    try {
      const page = await browser.newPage();
      const failures = [], workers = [], errors = [];
      page.on('requestfailed', request => failures.push(request.url()));
      page.on('response', response => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
      page.on('workercreated', worker => workers.push(new URL(worker.url()).pathname));
      page.on('pageerror', error => errors.push(error.message));
      await page.evaluateOnNewDocument(() => {
        localStorage.setItem('tg-tutorial-done-v1', '1');
        localStorage.setItem('math-test-bank-v2', JSON.stringify([{ id: 'prod-q', body: 'Production preview $x^2$', points: 1, tags: [], createdAt: 1 }]));
      });
      await page.goto(`${server.resolvedUrls.local[0]}#/bank`, { waitUntil: 'networkidle0' });
      await page.click('.card[data-qid="prod-q"]');
      await page.waitForSelector('.preview-svg:not(.stale) svg', { timeout: 120_000 });
      assert.ok(workers.some(path => path.startsWith(base) && path.includes('compiler.worker')), `Typst worker under ${base}: ${workers}`);
      assert.deepEqual(failures, [], `No failed requests under ${base}`);
      assert.deepEqual(shims, [], `Test preview loads without fetching a separate shim under ${base}`);
      assert.deepEqual(errors, []);
      results.push(`${base}: worker ${workers.find(path => path.includes('compiler.worker'))}`);
      await page.close();

      if (base === '/') {
        const context = await browser.createBrowserContext();
        const recovery = await context.newPage();
        await recovery.setViewport({ width: 1440, height: 900 });
        await recovery.setCacheEnabled(false);
        await recovery.evaluateOnNewDocument(() => {
          localStorage.setItem('tg-tutorial-done-v1', '1');
          localStorage.setItem('math-test-bank-v2', JSON.stringify([{
            id: 'recovery-q', body: 'Recovery preview $x^2$', points: 1, tags: [], createdAt: 1,
          }]));
        });
        unavailable = 1;
        await recovery.goto(`${server.resolvedUrls.local[0]}#/bank`, { waitUntil: 'networkidle0' });
        await recovery.waitForSelector('.card[data-qid="recovery-q"]');
        await recovery.click('.card[data-qid="recovery-q"]');
        await recovery.waitForSelector('.preview-svg:not(.stale) svg', { timeout: 60000 });
        assert.equal(failedWasmFetches, 1, 'a fresh worker recovers from a transient file failure');
        await context.close();

        const blockedContext = await browser.createBrowserContext();
        const blocked = await blockedContext.newPage();
        await blocked.setViewport({ width: 1440, height: 900 });
        await blocked.evaluateOnNewDocument(() => localStorage.setItem('tg-tutorial-done-v1', '1'));
        unavailable = Infinity;
        await blocked.goto(`${server.resolvedUrls.local[0]}#/build`, { waitUntil: 'networkidle0' });
        await blocked.waitForSelector('.preview-error button', { timeout: 60000 });
        assert.match(await blocked.$eval('.preview-error', el => el.textContent), /couldn’t load the preview compiler/);
        const beforeEdit = failedWasmFetches;
        await blocked.$eval('#t-subtitle', el => {
          el.value = 'Draft kept during compiler recovery';
          el.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await blocked.waitForFunction(() => !document.querySelector('.content .spinner'));
        assert.ok(beforeEdit >= 3, 'a persistent failure uses one extra worker attempt');
        unavailable = 0;
        await Promise.all([
          blocked.waitForNavigation({ waitUntil: 'networkidle0' }),
          blocked.click('.preview-error button'),
        ]);
        await blocked.waitForSelector('.svg-scroll:not(.stale) svg', { timeout: 60000 });
        assert.equal(await blocked.$eval('#t-subtitle', el => el.value), 'Draft kept during compiler recovery');
        await blockedContext.close();
      }
    } finally {
      await new Promise(resolve => server.httpServer.close(resolve));
      rmSync(outDir, { recursive: true, force: true });
    }
  }
  console.log(`Production worker/WASM loading passed: ${results.join('; ')}`);
} finally {
  await browser?.close();
}
