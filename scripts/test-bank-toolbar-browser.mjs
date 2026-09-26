import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';

// Synthetic data in an isolated browser; never reads host banks or student data.
// Optional: BANK_TOOLBAR_SHOTS=<dir> saves bank-toolbar-{wide,narrow}.png there.
const shotDir = process.env.BANK_TOOLBAR_SHOTS;
const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
let browser;
try {
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('tg-tutorial-done-v1', '1');
    if (!localStorage.getItem('math-test-bank-v2')) {
      localStorage.setItem('math-test-bank-v2', JSON.stringify(Array.from({ length: 6 }, (_, i) => ({
        id: `toolbar-q-${i}`, body: `Solve $x + ${i} = ${i + 3}$.`, tags: ['toolbar'], points: 2, createdAt: 1 + i,
        ...(i % 2 ? { choices: { A: '$3$', B: '$4$' }, answer: 'A' } : {}),
      }))));
    }
  });

  for (const [name, width, height] of [['wide', 1440, 900], ['narrow', 390, 844]]) {
    await page.setViewport({ width, height });
    await page.goto(`${server.resolvedUrls.local[0]}#/bank`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('.actions-section');
    const labels = await page.$$eval('.actions-section button', buttons => buttons.map(b => b.textContent.trim()));
    assert.deepEqual(labels, ['Image library', 'Check'], `${name}: bank toolbar only offers Image library and Check`);
    assert.equal(await page.$('.sidebar-images'), null, `${name}: sidebar Images section is gone`);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${name}: no horizontal page scroll`);
    if (shotDir) await page.screenshot({ path: `${shotDir}/bank-toolbar-${name}.png` });
  }

  await page.setViewport({ width: 1440, height: 900 });
  await page.evaluate(() => [...document.querySelectorAll('.actions-section button')].find(b => b.textContent.trim() === 'Image library').click());
  await page.waitForSelector('[role="dialog"][aria-label="Image library"]');

  assert.deepEqual(errors, []);
  console.log('Bank toolbar tests passed: only Image library and Check, no sidebar Images section, library opens.');
} finally {
  await browser?.close();
  await server.close();
}
