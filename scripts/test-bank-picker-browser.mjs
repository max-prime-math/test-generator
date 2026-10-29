import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';

// Synthetic browser-only banks. This never reads the teacher's host files or bank data.
const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
let browser;
try {
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('tg-tutorial-done-v1', '1');
    localStorage.setItem('math-test-custom-classes-v1', JSON.stringify([
      { id: 'shared-math', name: 'Shared Math', units: [] },
      { id: 'other-math', name: 'Other Math', units: [] },
    ]));
    localStorage.setItem('math-test-bank-v2', JSON.stringify(Array.from({ length: 6 }, (_, i) => ({
      id: `picker-q-${i}`,
      body: `First bank question ${i + 1}`,
      classId: 'shared-math',
      points: 2,
      tags: ['picker'],
      createdAt: i + 1,
    }))));
  });
  await page.goto(`${server.resolvedUrls.local[0]}#/bank`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => document.querySelector('.question-count')?.textContent === '6');

  await page.evaluate(async () => {
    const { bankWorkspaces } = await import('/src/lib/bank-workspaces.svelte.ts');
    await bankWorkspaces.createBank('Second Bank');
    const { bank } = await import('/src/lib/bank.svelte.ts');
    bank.add({ body: 'Second bank question', classId: 'shared-math', points: 1, tags: ['picker'] });
    await bankWorkspaces.createBank('Third Bank');
    bank.add({ body: 'Third bank question', classId: 'shared-math', points: 1, tags: ['picker'] });
  });
  await page.waitForFunction(() => document.querySelector('.card[data-qid="picker-q-0"]'));
  await page.evaluate(() => {
    window.__bankPickerLoadingFlashed = false;
    new MutationObserver(() => {
      if (document.querySelector('.list')?.textContent.includes('Loading selected banks')) window.__bankPickerLoadingFlashed = true;
    }).observe(document.querySelector('.list'), { childList: true, subtree: true, characterData: true });
  });

  const openPicker = async () => {
    await page.click('.sidebar .picker-trigger');
    await page.waitForSelector('.sidebar .bank-menu');
  };
  const clickBank = async (name, modifiers = {}) => page.evaluate((bankName, keys) => {
    const button = [...document.querySelectorAll('.sidebar .bank-option')]
      .find(element => element.querySelector('.bank-option-text > span')?.textContent === bankName);
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true, ...keys }));
  }, name, modifiers);

  await openPicker();
  assert.equal(await page.$('.sidebar .bank-menu input[type="checkbox"]'), null, 'bank selection does not require checkboxes');
  assert.equal(await page.$('.sidebar .selection-mark'), null, 'selected banks use row highlighting without checkmarks');
  assert.match(await page.$eval('.sidebar .menu-hint', el => el.textContent), /Ctrl\/Cmd-click.*Shift-click/i);
  assert.match(await page.$eval('.sidebar .all-banks', el => el.textContent), /filter.*by class/i);
  assert.ok(await page.evaluate(() => {
    const sidebar = document.querySelector('.sidebar').getBoundingClientRect();
    const menu = document.querySelector('.sidebar .bank-menu').getBoundingClientRect();
    if (menu.right <= sidebar.right) return false;
    const x = (Math.max(sidebar.right + 1, menu.left) + menu.right) / 2;
    const y = menu.top + Math.min(24, menu.height / 2);
    return Boolean(document.elementFromPoint(x, y)?.closest('.bank-menu'));
  }), 'the bank menu paints above the middle pane where it extends beyond the sidebar');
  const rowGeometry = async () => page.$$eval('.sidebar .bank-option', rows => rows.map(row => {
    const rect = row.getBoundingClientRect();
    return { name: row.querySelector('.bank-option-text > span').textContent, top: rect.top, height: rect.height };
  }));
  const beforeSelection = await rowGeometry();

  await clickBank('Second Bank', { ctrlKey: true });
  await page.waitForFunction(() => document.querySelector('.question-count')?.textContent === '7');
  assert.ok(await page.$('.sidebar .bank-menu'), 'Ctrl-click keeps the menu open to build a multi-bank selection');
  assert.equal(await page.$eval('.sidebar .picker-trigger span', el => el.textContent), '2 banks');
  assert.equal(await page.$eval('.sidebar .bank-option[aria-pressed="true"] .bank-option-text > span', el => el.textContent), 'Local Bank');
  assert.deepEqual(await rowGeometry(), beforeSelection, 'selection styling does not resize a row or shift later banks');

  await clickBank('Third Bank', { shiftKey: true });
  await page.waitForFunction(() => document.querySelector('.question-count')?.textContent === '8');
  assert.equal(await page.$$eval('.sidebar .bank-option[aria-pressed="true"]', rows => rows.map(row => row.querySelector('.bank-option-text > span').textContent).join(',')), 'Local Bank,Second Bank,Third Bank', 'Shift-click adds the contiguous range without clearing banks outside it');
  assert.match(await page.$eval('.sidebar .all-banks', el => el.textContent), /Clear selection/i);
  await page.click('.sidebar .all-banks');
  await page.waitForFunction(() => document.querySelector('.question-count')?.textContent === '0');
  assert.ok(await page.$('.sidebar .bank-menu'), 'clearing all banks keeps the menu open for the next selection');
  assert.equal(await page.$$eval('.sidebar .bank-option[aria-pressed="true"]', rows => rows.length), 0);
  assert.equal(await page.$('.list .empty .primary'), null, 'the zero-bank state does not offer to add a question without a target bank');
  assert.match(await page.$eval('.sidebar .all-banks', el => el.textContent), /All banks/i);
  await page.click('.sidebar .all-banks');
  await page.waitForFunction(() => !document.querySelector('.sidebar .bank-menu') && document.querySelector('.question-count')?.textContent === '8');

  await page.click('.class-tabs button[title="Show only Shared Math"]');
  await page.waitForFunction(() => document.querySelector('.question-count')?.textContent === '8');
  assert.ok(await page.$eval('.class-tabs button[title="Show only Shared Math"]', el => el.classList.contains('active')), 'All banks can be filtered by class');

  await openPicker();
  await clickBank('Second Bank');
  await page.waitForFunction(() => !document.querySelector('.sidebar .bank-menu') && document.querySelector('.question-count')?.textContent === '1');
  assert.equal(await page.$eval('.sidebar .picker-trigger span', el => el.textContent), 'Second Bank', 'a bank-name click switches in one action');
  await openPicker();
  await clickBank('Local Bank');
  await page.waitForFunction(() => document.querySelector('.question-count')?.textContent === '6');
  assert.equal(await page.evaluate(() => window.__bankPickerLoadingFlashed), false, 'a warm bank never blanks the question list while switching');

  await openPicker();
  await page.keyboard.press('Escape');
  assert.equal(await page.$('.sidebar .bank-menu'), null);
  assert.ok(await page.$eval('.sidebar .picker-trigger', el => el === document.activeElement), 'Escape returns focus to the picker');
  assert.deepEqual(errors, []);
  console.log('Bank picker tests passed: plain, Ctrl/Cmd, and Shift selection; all-banks class filtering; warm loading; and keyboard focus.');
} finally {
  await browser?.close();
  await server.close();
}
