import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';

// Synthetic data in an isolated browser; never reads host banks or student data.
const baseline = process.argv.includes('--baseline');
const COUNT = 10000;
const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
let browser;
try {
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewport({ width: 1400, height: 1000 });
  await page.evaluateOnNewDocument(count => {
    window.__keyLatency = [];
    window.addEventListener('keydown', event => {
      const start = event.timeStamp;
      requestAnimationFrame(() => setTimeout(() => window.__keyLatency.push(performance.now() - start), 0));
    }, true);
    if (sessionStorage.getItem('large-list-seeded')) return;
    sessionStorage.setItem('large-list-seeded', '1');
    localStorage.setItem('tg-tutorial-done-v1', '1');
    const questions = Array.from({ length: count }, (_, i) => ({
      id: `q-${String(i).padStart(5, '0')}`,
      body: i === 7777 ? 'Marker xyzzy: evaluate the integral' : `Large list question ${i}: solve x + ${i % 97} = ${i % 89}`,
      points: 1 + (i % 5), tags: [], createdAt: 1, classId: 'large-class',
    }));
    localStorage.setItem('math-test-bank-v2', JSON.stringify(questions));
  }, COUNT);
  await page.goto(`${server.resolvedUrls.local[0]}#/bank`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.list .card');
  const cardCount = () => page.$$eval('.list .card', cards => cards.length);
  const status = () => page.$eval('.status', el => el.textContent.replace(/\s+/g, ' ').trim());
  const mounted = await cardCount();
  console.log(`${COUNT.toLocaleString()} questions: mounted cards ${mounted}; status "${await status()}".`);
  if (!baseline) assert.ok(mounted <= 120, `Bank list mounts a bounded window (${mounted})`);

  const clickTiming = async index => page.evaluate(async index => {
    const card = document.querySelectorAll('.list .card')[index];
    const start = performance.now();
    const selected = new Promise(resolve => {
      const observer = new MutationObserver(() => { if (card.classList.contains('selected')) { observer.disconnect(); resolve(performance.now() - start); } });
      observer.observe(card, { attributes: true, attributeFilter: ['class'] });
    });
    card.click();
    const toClass = await selected;
    await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
    return { toClass, toFrame: performance.now() - start };
  }, index);
  const clicks = [await clickTiming(3), await clickTiming(10), await clickTiming(40)];
  console.log(`Click → .card.selected: ${clicks.map(c => c.toClass.toFixed(1)).join(', ')} ms; → next frame: ${clicks.map(c => c.toFrame.toFixed(1)).join(', ')} ms.`);
  if (!baseline) assert.ok(Math.max(...clicks.map(c => c.toClass)) < 100, 'Card selection is fast');

  if (!baseline) {
    await page.click('.list .card:nth-child(100) .card-main');
    await page.waitForSelector('.list .card.selected[data-qid="q-00099"]');
    await page.keyboard.press('ArrowDown');
    await page.waitForSelector('.list .card.selected[data-qid="q-00100"]');
    assert.match(await page.$eval('.bank-pagination', el => el.textContent), /101–200/);
    assert.equal(await cardCount(), 100);
    assert.ok(await page.$eval('.card.selected', el => { const r = el.getBoundingClientRect(), l = el.closest('.list').getBoundingClientRect(); return r.bottom > l.top && r.top < l.bottom; }), 'Selected card is scrolled into view');
    await page.keyboard.press('ArrowUp');
    await page.waitForSelector('.list .card.selected[data-qid="q-00099"]');
    assert.match(await page.$eval('.bank-pagination', el => el.textContent), /1–100/);
    await page.click('[aria-label="Next question page"]');
    await page.waitForFunction(() => document.querySelector('.bank-pagination')?.textContent.includes('101–200'));
    await page.click('.list .card:nth-child(2) .card-main');
    await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control');
    await page.waitForFunction(count => document.querySelector('.bulk-summary strong')?.textContent.includes(`${count} selected`), {}, COUNT);
    await page.keyboard.press('Escape');
  }

  await page.evaluate(() => { window.__keyLatency = []; });
  const typeStart = Date.now();
  await page.type('.sort-bar .search', 'xyzzy', { delay: 40 });
  await page.waitForFunction(() => document.querySelectorAll('.list .card').length === 1 && document.querySelector('.list .card')?.dataset.qid === 'q-07777', { timeout: 30000 });
  const settled = Date.now() - typeStart;
  const keyLatency = await page.evaluate(() => window.__keyLatency);
  console.log(`Typing "xyzzy": keydown → next frame ${keyLatency.map(n => n.toFixed(0)).join(', ')} ms (max ${Math.max(...keyLatency).toFixed(0)}); results settled ${settled} ms after first key (includes 5×40 ms typing delay).`);
  if (!baseline) assert.ok(Math.max(...keyLatency) < 100, 'Typing stays responsive');

  await page.click('.sort-bar .search', { count: 3 });
  await page.keyboard.press('Backspace');
  await page.evaluate(() => { window.__keyLatency = []; });
  await page.type('.sort-bar .search', '7', { delay: 40 });
  await page.waitForFunction(() => document.querySelector('.status')?.textContent.includes('shown'), { timeout: 30000 });
  const shown = Number((await status()).match(/([\d,]+) shown/)[1].replace(/,/g, ''));
  console.log(`Search "7": ${shown} shown, mounted ${await cardCount()}, keydown → next frame ${(await page.evaluate(() => window.__keyLatency)).map(n => n.toFixed(0)).join(', ')} ms.`);
  if (!baseline) {
    assert.ok(shown > 100 && shown < COUNT);
    assert.ok(await cardCount() <= 100);
    await page.click('.select-visible-btn');
    await page.waitForFunction(count => document.querySelector('.bulk-summary strong')?.textContent.trim() === `${count} selected`, {}, shown);
    assert.equal(await page.$('.bulk-summary span'), null, 'Every selected question is in the filtered set');
    assert.deepEqual(errors, []);
    console.log('Large-list UI tests passed: bounded bank window, page-crossing keyboard navigation, full-set bulk selection, search beyond page 1.');
  }
} finally {
  await browser?.close();
  await server.close();
}
