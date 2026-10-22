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
        id: `toolbar-q-${i}`, body: `Solve $x + ${i} = ${i + 3}$.`, tags: ['toolbar', i % 2 ? 'algebra' : 'graph'], points: 2, createdAt: 1 + i,
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
    // The Questions/Curriculum switch sits in the top row and stays put when the view changes.
    const switchBox = () => page.$eval('.type-tabs > .mode-switch', el => { const r = el.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; });
    const before = await switchBox();
    await page.click('.type-tabs > .mode-switch button:last-child');
    await page.waitForFunction(() => document.querySelector('.type-tabs > .mode-switch button:last-child').classList.contains('active'));
    assert.deepEqual(await switchBox(), before, `${name}: switching to Curriculum keeps the switch at exactly the same position and size`);
    await page.click('.type-tabs > .mode-switch button:first-child');
    await page.waitForSelector('.actions-section');
    assert.deepEqual(await switchBox(), before, `${name}: switching back keeps the switch at exactly the same position and size`);
    assert.equal(await page.$('.sidebar-images'), null, `${name}: sidebar Images section is gone`);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${name}: no horizontal page scroll`);
    assert.equal(await page.$eval('.bank-heading h1', el => el.textContent), 'Questions');
    assert.equal(await page.$eval('.question-count', el => el.textContent), '6');
    assert.ok(await page.evaluate(() => document.querySelector('.search').getBoundingClientRect().width > document.querySelector('.main').getBoundingClientRect().width * 0.6), `${name}: search gets most of the available width`);
    if (shotDir) await page.screenshot({ path: `${shotDir}/bank-toolbar-${name}.png` });

    await page.click('.filter-trigger');
    await page.waitForSelector('#bank-filter-menu');
    assert.ok(await page.$eval('#bank-filter-menu', el => {
      const r = el.getBoundingClientRect();
      return r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
    }), `${name}: the filters fit within the viewport`);
    if (shotDir) await page.screenshot({ path: `${shotDir}/bank-filters-${name}.png` });
    await page.click('.filters-section button[title="Show only multiple-choice questions"]');
    await page.waitForFunction(() => document.querySelector('.question-count')?.textContent === '3');
    await page.evaluate(() => [...document.querySelectorAll('.tag-option')].find(el => el.querySelector('.tag-option-name').textContent === 'graph').querySelector('input').click());
    await page.waitForFunction(() => document.querySelector('.question-count')?.textContent === '0');
    await page.evaluate(() => [...document.querySelectorAll('.tag-option')].find(el => el.querySelector('.tag-option-name').textContent === 'algebra').querySelector('input').click());
    await page.click('.tag-mode button:last-child');
    await page.waitForFunction(() => document.querySelector('.question-count')?.textContent === '3');
    await page.click('.filter-menu-title button');
    await page.waitForFunction(() => document.querySelector('.question-count')?.textContent === '6');
    await page.click('.filters-section button[title="Show only questions tagged as graph"]');
    await page.click('.tag-menu-foot button:last-child');
    await page.waitForFunction(() => !document.querySelector('#bank-filter-menu') && document.querySelector('.question-count')?.textContent === '3');
    assert.equal(await page.$eval('.filter-trigger', el => el.getAttribute('aria-expanded')), 'false');
    await page.click('.active-filters button[aria-label="Remove Graph filter"]');
    await page.waitForFunction(() => document.querySelector('.question-count')?.textContent === '6');
    await page.type('.search', 'algebra');
    await page.waitForFunction(() => document.querySelector('.question-count')?.textContent === '3');
    await page.click('.search', { count: 3 });
    await page.keyboard.press('Backspace');
    await page.waitForFunction(() => document.querySelector('.question-count')?.textContent === '6');
    await page.click('.filter-trigger');
    await page.keyboard.press('Escape');
    assert.equal(await page.$('#bank-filter-menu'), null, `${name}: Escape closes filters`);
    assert.ok(await page.$eval('.filter-trigger', el => el === document.activeElement), `${name}: Escape restores focus`);
    await page.click('.filter-trigger');
    await page.click('.bank-heading h1');
    assert.equal(await page.$('#bank-filter-menu'), null, `${name}: clicking outside closes filters`);
  }

  await page.setViewport({ width: 1440, height: 900 });
  // Previewing a question from a dormant bank marks it render-checked in that bank, but must
  // neither switch banks nor replace the question list with a loading message.
  const bankIds = await page.evaluate(async () => {
    const { bankWorkspaces } = await import('/src/lib/bank-workspaces.svelte.ts');
    const first = bankWorkspaces.activeBankId;
    await bankWorkspaces.createBank('Other Bank');
    return {
      first,
      current: bankWorkspaces.activeBankId,
      firstUpdatedAt: bankWorkspaces.banks.find(bank => bank.id === first).updatedAt,
    };
  });
  await page.waitForFunction(() => document.querySelector('.card[data-qid="toolbar-q-0"]') && !document.querySelector('.list .empty'));
  await page.evaluate(() => {
    window.__bankLoadingFlashed = false;
    new MutationObserver(() => {
      if (document.querySelector('.list')?.textContent.includes('Loading selected banks')) window.__bankLoadingFlashed = true;
    }).observe(document.querySelector('.list'), { childList: true, subtree: true, characterData: true });
  });
  await page.click('.card[data-qid="toolbar-q-0"]');
  await page.waitForFunction(async first => (await (await import('/src/lib/bank-workspaces.svelte.ts')).bankWorkspaces.readBankSnapshot(first))?.questions[0]?.checked === true, {}, bankIds.first);
  assert.equal(await page.evaluate(() => window.__bankLoadingFlashed), false, 'cross-bank preview does not flash a loading screen');
  assert.equal(await page.evaluate(async () => (await import('/src/lib/bank-workspaces.svelte.ts')).bankWorkspaces.activeBankId), bankIds.current, 'cross-bank preview does not switch the current bank');
  const previewWrite = await page.evaluate(async first => {
    const { bankWorkspaces } = await import('/src/lib/bank-workspaces.svelte.ts');
    const snapshot = await bankWorkspaces.readBankSnapshot(first);
    return {
      questionUpdatedAt: snapshot?.questions[0]?.updatedAt ?? null,
      bankUpdatedAt: bankWorkspaces.banks.find(bank => bank.id === first)?.updatedAt ?? null,
    };
  }, bankIds.first);
  assert.equal(previewWrite.questionUpdatedAt, null, 'preview validation does not mark the question as edited');
  assert.equal(previewWrite.bankUpdatedAt, bankIds.firstUpdatedAt, 'preview validation does not mark the bank as edited');
  await page.click('.filter-trigger');
  await page.keyboard.press('Escape');
  assert.ok(await page.$('.card.selected[data-qid="toolbar-q-0"]'), 'closing filters with Escape keeps the selected preview');

  for (const [width, height] of [[1200, 800], [1024, 768], [390, 640], [320, 640]]) {
    await page.setViewport({ width, height });
    await page.click('.filter-trigger');
    assert.ok(await page.$eval('#bank-filter-menu', el => {
      const r = el.getBoundingClientRect();
      const main = el.closest('.main').getBoundingClientRect();
      return r.left >= main.left && r.right <= main.right && r.bottom <= innerHeight;
    }), `${width}×${height}: filters fit in the question pane, including with a preview open`);
    assert.ok(await page.$eval('.main', el => el.scrollWidth <= el.clientWidth), `${width}×${height}: no question pane overflow`);
    await page.keyboard.press('Escape');
  }
  await page.setViewport({ width: 1440, height: 900 });

  await page.evaluate(() => [...document.querySelectorAll('.actions-section button')].find(b => b.textContent.trim() === 'Image library').click());
  await page.waitForSelector('[role="dialog"][aria-label="Image library"]');

  assert.deepEqual(errors, []);
  console.log('Bank toolbar tests passed: responsive heading and search, stable view switch, combined type/tag/Graph filters, counts, reset, removable chips, keyboard/outside dismissal, cross-bank preview, and image library.');
} finally {
  await browser?.close();
  await server.close();
}
