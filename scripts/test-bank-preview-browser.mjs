// Desktop sidebar filtering and the preview header's context, Edit, and Close actions.
// Synthetic questions in an isolated browser profile only.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';

const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
let browser;
try {
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 950 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.evaluateOnNewDocument(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('tg-tutorial-done-v1', '1');
    localStorage.setItem('theme', 'light');
    localStorage.setItem('tg-bank-workspaces-v1', JSON.stringify([
      { id: 'preview-bank', name: 'Algebra question bank', gitRepoId: 'preview-bank', createdAt: 1, updatedAt: 1 },
    ]));
    localStorage.setItem('tg-active-bank-id-v1', 'preview-bank');
    localStorage.setItem('math-test-custom-classes-v1', JSON.stringify([
      { id: 'algebra', name: 'Algebra 2', units: [
        { id: '1', name: 'Linear equations', sections: [
          { id: '1.1', name: 'Solving equations', nickname: 'Equations' },
          { id: '1.2', name: 'Applications' },
        ] },
        { id: '2', name: 'Quadratic functions', sections: [] },
      ] },
    ]));
    localStorage.setItem('math-test-bank-v2', JSON.stringify([
      { id: 'equation', createdAt: 3, checked: true, points: 2, tags: ['practice'], questionType: 'frq',
        classId: 'algebra', unitId: '1', sectionId: '1.1',
        body: 'Solve $3x + 7 = 22$. Show each step of your reasoning.', solution: '$x = 5$' },
      { id: 'quadratic', createdAt: 2, checked: true, points: 3, tags: [], questionType: 'frq',
        classId: 'algebra', unitId: '2',
        body: 'Find the zeros of $f(x) = x^2 - 5x + 6$.', solution: '$x = 2$ or $x = 3$' },
      { id: 'unassigned', createdAt: 1, checked: true, points: 1, tags: [], questionType: 'frq',
        body: 'Explain how you would check your answer.' },
    ]));
  });
  await page.goto(`${server.resolvedUrls.local[0]}#/bank`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-qid="equation"]', { timeout: 60000 });
  await page.click('.tree-node.unit .row-main');
  await page.click('.tree-node.section .row-main');
  assert.deepEqual(await page.$$eval('.card', cards => cards.map(card => card.dataset.qid)), ['equation']);
  assert.equal(await page.$eval('.tree-node.section.active .row-count', el => el.textContent), '1');
  await page.click('[data-qid="equation"]');
  await page.waitForSelector('.preview-svg[data-preview-for="equation"]:not(.stale) svg', { timeout: 60000 });
  assert.equal(await page.$eval('.preview-header h2', el => el.textContent), 'Question preview');
  assert.equal(await page.$eval('.preview-location', el => el.textContent), 'Algebra 2 / Unit 1: Linear equations / 1.1 Equations');
  assert.match(await page.$eval('.preview-meta', el => el.textContent), /Algebra question bank\s*·\s*2 points\s*·\s*Free response/);
  await page.screenshot({ path: '/tmp/bank-sidebar-preview-light.png' });

  // Header metadata follows live question edits; it doesn't depend on reselecting a card.
  await page.evaluate(async () => {
    const { bank } = await import('/src/lib/bank.svelte.ts');
    bank.update('equation', { points: 1, unitId: '2', sectionId: undefined });
  });
  await page.waitForFunction(() => document.querySelector('.preview-meta').textContent.includes('1 point'));
  assert.equal(await page.$eval('.preview-location', el => el.textContent), 'Algebra 2 / Unit 2: Quadratic functions');
  await page.click('.tree-node.all .row-main');
  await page.click('[data-qid="equation"] .select-box');
  await page.click('.preview-close');
  await page.waitForFunction(() => document.activeElement?.getAttribute('data-qid') === 'equation');
  assert.equal(await page.$eval('.preview-panel', el => el.getAttribute('aria-hidden')), 'true');
  assert.equal(await page.$eval('[data-qid="equation"] .select-box', el => el.checked), true);
  await page.click('[data-qid="equation"] .select-box');
  await page.click('[data-qid="unassigned"]');
  assert.equal(await page.$eval('.preview-location', el => el.textContent), 'Unassigned curriculum');

  // A long question scrolls beneath the fixed header and fits a resized desktop pane.
  await page.evaluate(async () => {
    const { bank } = await import('/src/lib/bank.svelte.ts');
    bank.update('equation', { body: Array.from({ length: 30 }, (_, i) => `Part ${i + 1}: solve $x + ${i} = ${i + 5}$.`).join('\n\n') });
  });
  await page.click('[data-qid="equation"]');
  await page.waitForSelector('.preview-svg[data-preview-for="equation"]:not(.stale) svg', { timeout: 60000 });
  const headerTop = await page.$eval('.preview-header', el => el.getBoundingClientRect().top);
  assert.equal(await page.$eval('.preview-body', el => el.scrollHeight > el.clientHeight), true);
  await page.$eval('.preview-body', el => { el.scrollTop = el.scrollHeight; });
  assert.equal(await page.$eval('.preview-header', el => el.getBoundingClientRect().top), headerTop);
  await page.$eval('.preview-body', el => { el.scrollTop = 0; });
  const handle = await page.$('.resize-handle[title="Drag to resize the question preview"]');
  const box = await handle.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + 150);
  await page.mouse.down();
  await page.mouse.move(box.x + 205, box.y + 150, { steps: 10 });
  await page.mouse.up();
  await new Promise(resolve => setTimeout(resolve, 250));
  assert.equal(await page.$eval('.preview-panel', el => el.scrollWidth <= el.clientWidth), true);
  assert.equal(await page.$eval('.preview-body', el => el.scrollWidth <= el.clientWidth), true);
  assert.equal(await page.$eval('.preview-close', el => {
    const rect = el.getBoundingClientRect();
    return rect.width >= 28 && rect.right <= window.innerWidth && rect.left >= 0;
  }), true, 'Close stays reachable when the preview pane is resized');

  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await new Promise(resolve => setTimeout(resolve, 400));
  await page.waitForSelector('.preview-svg:not(.stale) svg');
  await page.screenshot({ path: '/tmp/bank-sidebar-preview-dark.png' });
  await page.click('.preview-edit');
  await page.waitForFunction(() => location.hash.startsWith('#/editor/'));
  assert.match(page.url(), /#\/editor\//);
  assert.deepEqual(errors, []);
  console.log('Desktop preview tests passed: sidebar filters, context, live metadata, Close focus, preserved selection, scrolling, resizing, Edit.');
} finally {
  await browser?.close();
  await server.close();
}
