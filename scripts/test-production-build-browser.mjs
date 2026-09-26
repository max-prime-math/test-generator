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
    const server = await preview({ base, build: { outDir }, preview: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
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
      assert.deepEqual(errors, []);
      results.push(`${base}: worker ${workers.find(path => path.includes('compiler.worker'))}`);
      await page.close();
    } finally {
      await new Promise(resolve => server.httpServer.close(resolve));
      rmSync(outDir, { recursive: true, force: true });
    }
  }
  console.log(`Production worker/WASM loading passed: ${results.join('; ')}`);
} finally {
  await browser?.close();
}
