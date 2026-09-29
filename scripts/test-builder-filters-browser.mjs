import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';

const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
let browser;
try {
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 950 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('tg-tutorial-done-v1', '1');
    localStorage.setItem('math-test-custom-classes-v1', JSON.stringify(['c1', 'c2'].map(id => ({ id, name: id,
      units: ['1', '2'].map(id => ({ id, name: `Topic ${id}`, sections: ['a', 'b'].map(id => ({ id, name: `Section ${id}` })) })),
    }))));
    localStorage.setItem('math-test-last-class-id-v1', 'c1');
    localStorage.setItem('math-test-bank-v2', JSON.stringify(Array.from({ length: 5 }, (_, i) => ({
      id: `q${i + 1}`, body: `Question ${i + 1}`, points: 2, createdAt: 1,
      classId: i === 4 ? 'c2' : 'c1', unitId: i < 2 || i === 4 ? '1' : '2', sectionId: i % 2 ? 'b' : 'a',
      tags: i % 2 ? ['algebra'] : ['graph'], ...(i === 0 || i === 3 ? { choices: { A: '1', B: '2' }, answer: 'A' } : {}),
    }))));
  });
  await page.goto(`${server.resolvedUrls.local[0]}#/build`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.picker-item');
  const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const rows = () => page.$$eval('.picker-body', els => els.map(el => el.textContent.trim()));
  const expectRows = async expected => { await settle(); assert.deepEqual(await rows(), expected.map(n => `Question ${n}`)); };
  const click = async selector => { await page.click(selector); await settle(); };
  const textButton = async text => {
    const handle = await page.evaluateHandle(t => [...document.querySelectorAll('.build-tab button')].find(el => el.textContent.trim() === t && el.getClientRects().length && !el.closest('[inert]')), text);
    await handle.asElement().click(); await handle.dispose(); await settle();
  };
  const check = async (group, label) => {
    const input = await page.evaluateHandle((g, l) => [...[...document.querySelectorAll('.filter-panel fieldset')]
      .find(el => el.querySelector('legend').textContent === g).querySelectorAll('label')]
      .find(el => el.textContent.trim().startsWith(l)).querySelector('input'), group, label);
    await input.asElement().click(); await input.dispose(); await settle();
  };
  const scopeOnly = async (label, id) => { await click(`.scope-trigger[aria-label^="${label}:"]`); await click(`.scope-option[data-id="${id}"] .scope-only`); };
  const scopeCheck = async (label, ids) => {
    await click(`.scope-trigger[aria-label^="${label}:"]`);
    for (const id of ids) await click(`.scope-option[data-id="${id}"] input`);
    await page.keyboard.press('Escape'); await settle();
  };
  await expectRows([1, 2, 3, 4]);
  assert.equal(await page.$('.filter-panel'), null);
  await click('#picker-filter-toggle');
  await check('Sections', 'Unit 1: Topic 1 · a');
  await expectRows([1]);
  await check('Sections', 'Unit 1: Topic 1 · b');
  await expectRows([1, 2]);
  await check('Sections', 'Unit 2: Topic 2 · a');
  await expectRows([1, 2, 3]);
  await check('Question type', 'Multiple choice');
  await expectRows([1]);
  await check('Question type', 'Free response');
  await expectRows([1, 2, 3]);
  await check('Tags', 'graph');
  await expectRows([1, 3]);
  await check('Tags', 'algebra');
  await expectRows([]);
  await textButton('Match any tag');
  await expectRows([1, 2, 3]);
  await click('#picker-filters-done');
  assert.equal(await page.$eval('#picker-filter-toggle', el => el.textContent), 'Filters (7)');
  await click('.filter-chip[aria-label="Remove Tag: algebra filter"]');
  await expectRows([1, 3]);
  await textButton('Clear filters');
  await expectRows([1, 2, 3, 4, 5]);
  await scopeOnly('Classes', 'c1');
  assert.equal(await page.$eval('.scope-trigger[aria-label^="Classes:"]', el => el.textContent.trim()), 'c1▾');
  await click('#picker-filter-toggle');
  await check('Units', 'Unit 1: Topic 1');
  await expectRows([1, 2]);
  await check('Units', 'Unit 2: Topic 2');
  await expectRows([1, 2, 3, 4]);
  await check('Sections', 'Unit 2: Topic 2 · a');
  await expectRows([3]);
  await check('Units', 'Unit 2: Topic 2');
  await expectRows([1, 2]);
  assert.equal(await page.$$eval('.filter-panel fieldset:nth-child(2) input:checked', els => els.length), 0);
  await page.keyboard.press('Escape');
  await settle();
  assert.equal(await page.evaluate(() => document.activeElement.id), 'picker-filter-toggle');
  await textButton('All');
  assert.match(await page.$eval('.picker-summary', el => el.textContent), /2 questions/);
  await scopeOnly('Classes', 'c2');
  await expectRows([5]);
  // Several classes: counts per class, unit labels name their class, and Bank view's class replaces the set.
  await click('.scope-trigger[aria-label^="Classes:"]');
  assert.deepEqual(await page.$$eval('.scope-option', els => els.map(el => [el.dataset.id, el.querySelector('.scope-option-count').textContent])), [['c1', '4'], ['c2', '1']]);
  await page.keyboard.press('Escape'); await settle();
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Classes: c2');
  await scopeCheck('Classes', ['c1']);
  await expectRows([1, 2, 3, 4, 5]);
  assert.equal(await page.$eval('.scope-trigger[aria-label^="Classes:"]', el => el.getAttribute('aria-label')), 'Classes: c2 +1');
  await click('#picker-filter-toggle');
  await check('Units', 'c1 · Unit 1: Topic 1');
  await check('Units', 'c2 · Unit 1: Topic 1');
  await expectRows([1, 2, 5]);
  await click('#picker-filters-done');
  await scopeCheck('Classes', ['c2']);
  await expectRows([1, 2]);
  assert.equal(await page.evaluate(() => localStorage.getItem('math-test-last-class-id-v1')), 'c1');
  await textButton('Clear filters');
  await expectRows([1, 2, 3, 4, 5]);
  await scopeOnly('Classes', 'c2');
  assert.equal(await page.$eval('#picker-filter-toggle', el => el.textContent), 'Filters');
  await click('.picker-expand');
  await click('#picker-filter-toggle');
  await page.screenshot({ path: '/tmp/test-generator-filters.png' });
  await click('#picker-filters-done');
  await click('.picker-expand');
  await page.setViewport({ width: 390, height: 844 });
  await textButton('Hide questions'); // In narrow view the toolbar opens the full-space picker.
  await click('#picker-filter-toggle');
  assert.ok(await page.$eval('.filter-panel', el => el.getBoundingClientRect().width) <= 390);
  await click('#picker-filters-done');
  assert.deepEqual(errors, []);
  console.log('Build filters passed: multi-section/unit/type matching, tag modes, chips, multi-class scope, reset, dependent cleanup, bulk selection, keyboard and mobile.');
} finally {
  await browser?.close();
  await server.close();
}
