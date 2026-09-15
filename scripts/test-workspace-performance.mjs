import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';

// Synthetic data in an isolated browser; never reads host banks or student data.
const baseline = process.argv.includes('--baseline');
const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
let browser;
try {
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewport({ width: 1400, height: 1000 });
  await page.evaluateOnNewDocument(() => localStorage.setItem('tg-tutorial-done-v1', '1'));
  await page.goto(server.resolvedUrls.local[0], { waitUntil: 'networkidle0' });
  const elapsed = await page.evaluate(async () => {
    const { workspaceCatalog } = await import('/src/lib/workspace-catalog.svelte.ts');
    const { tick } = await import('/node_modules/svelte/src/index-client.js');
    const banks = Array.from({ length: 6 }, (_, b) => ({
      id: `stress-${b}`, name: `Stress bank ${b}`, data: {
        questions: Array.from({ length: 500 }, (_, q) => ({
          id: `q-${q}`, body: `Stress question ${b}-${q}: solve x + 2 = 4`,
          classId: 'stress-class', tags: [], points: 2, createdAt: 1,
        })), customClasses: [{ id: 'stress-class', name: 'Stress class', units: [] }],
        narratives: [], savedTests: [], images: [],
      },
    }));
    const start = performance.now();
    await workspaceCatalog.replace(banks);
    await tick();
    return performance.now() - start;
  });
  await page.evaluate(() => { window.location.hash = '/build'; });
  await page.select('select[title="Filter by class"]', 'stress-class');
  await page.waitForFunction(() => document.querySelector('.q-count')?.textContent.includes('3000'));
  const rows = await page.$$eval('.picker-list .picker-item', items => items.length);
  console.log(`6 banks / 3,000 questions: catalog + reactive update ${elapsed.toFixed(0)} ms; rendered picker rows ${rows}.`);
  if (!baseline) {
    assert.equal(rows, 100, 'Only one page is mounted, while the full pool remains searchable');
    await page.waitForFunction(() => Math.abs(document.querySelector('.build-tab').getBoundingClientRect().left) < 1);
    await page.screenshot({ path: '/tmp/testgen-workspace-performance.png' });
    await page.click('[aria-label="Next question page"]');
    await page.waitForFunction(() => document.querySelector('.picker-pagination')?.textContent.includes('101–200'));
    assert.equal(await page.$$eval('.picker-item', items => items.length), 100);
    await page.click('.picker-item input[type="checkbox"]');
    await page.click('[aria-label="Previous question page"]');
    await page.click('[aria-label="Next question page"]');
    assert.equal(await page.$eval('.picker-item input[type="checkbox"]', input => input.checked), true);
    await page.type('.picker-search', 'Stress question 5-499', { delay: 5 });
    await page.waitForFunction(() => document.querySelector('.picker-item')?.textContent.includes('5-499'));
    assert.ok(await page.$$eval('.picker-item', items => items.length) <= 100);
    assert.deepEqual(errors, []);
    console.log('Large-workspace UI tests passed: bounded rows, page navigation, retained selection, full-pool search.');
  }
} finally {
  await browser?.close();
  await server.close();
}
