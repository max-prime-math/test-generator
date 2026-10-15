import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';

// Synthetic data in an isolated browser. A question whose image lives in a bank that is not
// active must preview in both the Bank tab and the editor, without switching banks.
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
    if (!localStorage.getItem('math-test-bank-v2')) localStorage.setItem('math-test-bank-v2', JSON.stringify([
      { id: 'img-q', body: 'Look:\n#image("/imgs/dot", width: 2cm)', tags: [], points: 1, createdAt: 1 },
    ]));
  });
  await page.goto(`${server.resolvedUrls.local[0]}#/bank`, { waitUntil: 'networkidle0' });
  await page.evaluate(async () => {
    const { imageStore } = await import('/src/lib/image-store.svelte.ts');
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><circle cx="5" cy="5" r="4"/></svg>';
    await imageStore.put('dot', new TextEncoder().encode(svg), 'svg');
    const { bankWorkspaces } = await import('/src/lib/bank-workspaces.svelte.ts');
    await bankWorkspaces.createBank('Other Bank');
  });
  await page.reload({ waitUntil: 'networkidle0' });

  const denied = () => page.evaluate(() => /access denied|outside of project root/i.test(document.body.innerText));
  await page.waitForSelector('.card[data-qid="img-q"]');
  await page.click('.card[data-qid="img-q"]');
  await page.waitForFunction(() => document.querySelector('.preview-panel svg image'), { timeout: 30000 });
  assert.equal(await denied(), false, 'bank preview finds the image in its own bank');

  await page.evaluate(() => [...document.querySelectorAll('.card[data-qid="img-q"] button')].find(b => b.textContent.trim() === 'Edit').click());
  await page.waitForFunction(() => document.querySelector('.preview .svg svg image') || document.querySelector('.preview pre[role=alert]'), { timeout: 30000 });
  assert.equal(await page.$eval('.preview pre[role=alert]', el => el.textContent).catch(() => null), null, 'editor preview finds the image in the source bank');
  assert.equal(await denied(), false);
  assert.deepEqual(errors, []);
  console.log('Bank image tests passed: dormant-bank images preview in the Bank tab and the editor.');
} finally {
  await browser?.close();
  await server.close();
}
