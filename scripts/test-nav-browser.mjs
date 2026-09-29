// Header navigation: tab order, and collapsing to a single menu button when the
// tabs don't fit. SCREENSHOT_DIR=<dir> saves the header at each width.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';

const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
let browser;
try {
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('tg-tutorial-done-v1', '1');
    localStorage.setItem('tg-generator-experimental-enabled-v1', 'true');
    localStorage.setItem('tg-gradebook-experimental-enabled-v1', 'true');
    if (!localStorage.getItem('tg-bank-workspaces-v1')) {
      localStorage.setItem('tg-bank-workspaces-v1', JSON.stringify(['default', 'second'].map((id) => ({ id, name: id === 'default' ? 'Local Bank' : 'Second bank', gitRepoId: `repo-${id}`, createdAt: 1, updatedAt: 1 }))));
      localStorage.setItem('tg-active-bank-id-v1', 'default');
    }
  });
  await page.goto(`${server.resolvedUrls.local[0]}#/bank`, { waitUntil: 'networkidle0' });

  // The bank switcher lives at the top of the Bank view's sidebar, not in the header.
  const switcher = await page.evaluate(() => ({
    inHeader: Boolean(document.querySelector('header select[aria-label="Current bank"]')),
    inSidebar: Boolean(document.querySelector('#tut-bank-sidebar > .bank-switcher select[aria-label="Current bank"]')?.getClientRects().length),
    folderInHeader: Boolean(document.querySelector('header [aria-label="Local folder storage"]')),
  }));
  assert.deepEqual(switcher, { inHeader: false, inSidebar: true, folderInHeader: true });
  // Opening another bank shows all of its questions: filters from the last bank are cleared.
  await page.evaluate(() => [...document.querySelectorAll('#tut-type-tabs button')].find((b) => b.textContent.trim() === 'MCQ').click());
  await page.type('.search-input, input[placeholder^="Search questions"]', 'derivative');
  await page.select('#tut-bank-sidebar select[aria-label="Current bank"]', 'second');
  await page.waitForFunction(() => document.querySelector('#tut-bank-sidebar select[aria-label="Current bank"]').value === 'second'
    && [...document.querySelectorAll('#tut-type-tabs button')].find((b) => b.textContent.trim() === 'All Types').classList.contains('active'));
  const reset = await page.evaluate(() => ({
    all: document.querySelector('.tree-node.all').classList.contains('active'),
    search: document.querySelector('input[placeholder^="Search questions"]').value,
  }));
  assert.deepEqual(reset, { all: true, search: '' });
  // A new question in the Editor can choose the bank it is saved to.
  await page.evaluate(() => { location.hash = '#/editor'; });
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === '+ New Question' && b.getClientRects().length));
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '+ New Question' && b.getClientRects().length).click());
  await page.waitForSelector('.target-bank select');
  assert.deepEqual(await page.$$eval('.target-bank select option', (options) => options.map((o) => o.value)), ['default', 'second']);
  await page.evaluate(() => { location.hash = '#/bank'; });

  const shot = async (name) => {
    if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/nav-${name}.png`, clip: { x: 0, y: 0, width: page.viewport().width, height: 360 } });
  };
  const state = () => page.evaluate(() => ({
    tabs: [...document.querySelectorAll('#tut-nav button')].map((b) => b.textContent.trim()),
    collapsed: document.querySelector('#tut-nav').classList.contains('collapsed'),
    trigger: document.querySelector('.nav-dropdown-trigger span')?.textContent ?? null,
    hash: window.location.hash,
  }));

  // Wide: every tab shows, in Bank, Generate, Editor, Build, Gradebook order.
  let now = await state();
  assert.equal(now.collapsed, false);
  assert.deepEqual(now.tabs, ['Bank', 'Generate', 'Editor', 'Build', 'Gradebook']);
  await shot('wide');

  // Narrow desktop: the tabs no longer fit, so one button opens a menu.
  await page.setViewport({ width: 900, height: 900 });
  await page.waitForFunction(() => document.querySelector('#tut-nav').classList.contains('collapsed'));
  now = await state();
  assert.equal(now.trigger, 'Bank');
  await page.click('.nav-dropdown-trigger');
  await page.waitForSelector('.nav-menu');
  assert.deepEqual(await page.$$eval('.nav-menu [role="menuitem"] span', (els) => els.map((el) => el.textContent)), ['Bank', 'Generate', 'Editor', 'Build', 'Gradebook']);
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-current')), 'page');
  await shot('menu');
  // Keyboard: Down, Down picks Editor; the menu closes and focus returns to the button.
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !document.querySelector('.nav-menu'));
  now = await state();
  assert.equal(now.hash, '#/editor');
  assert.equal(now.trigger, 'Editor');
  assert.equal(await page.evaluate(() => document.activeElement.classList.contains('nav-dropdown-trigger')), true);
  // Escape and clicking elsewhere both close the menu.
  await page.click('.nav-dropdown-trigger');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('.nav-menu'));
  await page.click('.nav-dropdown-trigger');
  await page.mouse.click(700, 600);
  await page.waitForFunction(() => !document.querySelector('.nav-menu'));

  // Widening again restores the full tab strip.
  await page.setViewport({ width: 1440, height: 900 });
  await page.waitForFunction(() => !document.querySelector('#tut-nav').classList.contains('collapsed'));

  // Phone: the tabs get their own row; a menu only if they still don't fit.
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await new Promise((resolve) => setTimeout(resolve, 200));
  await shot('phone');
  const phone = await page.evaluate(() => {
    const nav = document.querySelector('#tut-nav');
    const shown = nav.querySelector('.nav-segment:not(.nav-measure), .nav-dropdown-trigger');
    const clipped = [...nav.querySelectorAll('.nav-segment:not(.nav-measure) button')].filter((b) => b.scrollWidth > b.clientWidth + 1).length;
    return { fits: shown.getBoundingClientRect().right <= window.innerWidth, clipped, pageOverflow: document.documentElement.scrollWidth > window.innerWidth };
  });
  assert.deepEqual(phone, { fits: true, clipped: 0, pageOverflow: false });
  // Phones hide the sidebar, so the Bank view shows the switcher above its list.
  await page.evaluate(() => { location.hash = '#/bank'; });
  await page.waitForFunction(() => document.querySelector('.mobile-bank-switcher select[aria-label="Current bank"]')?.getClientRects().length > 0);
  await shot('phone-bank');

  assert.deepEqual(errors, []);
  console.log('Nav browser tests passed: tab order, collapse to menu, keyboard and outside-click closing, restore, phone width, bank switcher in the Bank view, new bank opens on all questions, Editor save-to bank.');
} finally {
  await browser?.close();
  await server.close();
}
