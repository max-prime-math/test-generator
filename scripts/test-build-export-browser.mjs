// Build exports: page numbers at the bottom (inside/centre/outside) and file names made
// from the title and test name, e.g. "AP Calculus - Test 1.pdf". Synthetic data.
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';

const downloads = mkdtempSync(join(tmpdir(), 'tg-export-'));
const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
let browser;
try {
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 950 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const cdp = await page.createCDPSession();
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
  await page.evaluateOnNewDocument(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('tg-tutorial-done-v1', '1');
    localStorage.setItem('math-test-bank-v2', JSON.stringify(Array.from({ length: 3 }, (_, i) => (
      { id: `q${i + 1}`, body: `Question ${i + 1}`, points: 2, tags: [], createdAt: 1 }))));
  });
  await page.goto(`${server.resolvedUrls.local[0]}#/build`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('input[aria-label="Include question in test"]');
  await page.click('input[aria-label="Include question in test"]');

  const type = async (selector, text) => {
    await page.$eval(selector, (el, value) => { el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); }, text);
  };
  await type('#t-title', 'AP Calculus');
  await type('#t-subtitle', 'Test 1');
  const source = () => page.evaluate(async () => {
    const { testEditor } = await import('/src/lib/test-editor.svelte.ts');
    const { generatePreamble } = await import('/src/lib/typst/template.ts');
    return { setting: testEditor.config.pageNumbers ?? 'none', preamble: generatePreamble(testEditor.config) };
  });

  // 1. Page numbers: off by default, then each placement.
  assert.equal(await page.$eval('#t-page-numbers', (el) => el.value), 'none');
  assert.doesNotMatch((await source()).preamble, /footer/);
  for (const [value, pattern] of [
    ['centre', /footer: context align\(center, counter\(page\)\.display\("1"\)\)/],
    ['outside', /calc\.odd\(here\(\)\.page\(\)\) \{ right \} else \{ left \}/],
    ['inside', /calc\.odd\(here\(\)\.page\(\)\) \{ left \} else \{ right \}/],
  ]) {
    await page.select('#t-page-numbers', value);
    const { setting, preamble } = await source();
    assert.equal(setting, value);
    assert.match(preamble, pattern, value);
  }

  // 2. The downloaded PDF is named from the title and test name.
  await page.waitForFunction(() => !document.querySelector('.dropdown-trigger')?.disabled, { timeout: 60_000 });
  await page.click('.dropdown-trigger');
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Test PDF').click());
  const deadline = Date.now() + 60_000;
  while (!readdirSync(downloads).some((f) => f.endsWith('.pdf')) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 250));
  assert.deepEqual(readdirSync(downloads).filter((f) => !f.endsWith('.crdownload')), ['AP Calculus - Test 1.pdf']);

  assert.deepEqual(errors, []);
  console.log('Build export tests passed: page numbers (none, centre, outside, inside), download named "AP Calculus - Test 1.pdf".');
} finally {
  await browser?.close();
  await server.close();
  rmSync(downloads, { recursive: true, force: true });
}
