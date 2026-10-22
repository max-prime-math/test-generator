import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';

// Synthetic questions in an isolated browser; never reads host banks or student data.
const shotDir = process.env.BANK_CARD_ACTION_SHOTS;
const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
let browser;
try {
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  const dialogs = [];
  let acceptDelete = false;
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => {
    dialogs.push(dialog.message());
    void (acceptDelete ? dialog.accept() : dialog.dismiss());
  });
  await page.setViewport({ width: 1440, height: 900 });
  await page.evaluateOnNewDocument(() => {
    if (sessionStorage.getItem('card-actions-seeded')) return;
    sessionStorage.setItem('card-actions-seeded', '1');
    localStorage.setItem('tg-tutorial-done-v1', '1');
    localStorage.setItem('math-test-bank-v2', JSON.stringify(Array.from({ length: 30 }, (_, i) => ({
      id: `actions-${i}`, body: `Question ${i}: solve $x + ${i} = ${i + 3}$.`, points: 3, tags: ['algebra'], createdAt: i + 1,
      ...(i === 2 ? { algorithmModel: { scope: { kind: 'question' }, sequence: [], source: 'test', definitions: [{ id: 'a', name: 'a', kind: 'variable', rawExpression: 'range(1, 9)', sampleValue: '2', dependencies: [], source: 'test' }] } } : {}),
    }))));
  });
  const trigger = id => `[data-qid="actions-${id}"] .more-actions`;
  const menu = '#bank-question-actions-menu';
  const open = async id => { await page.click(trigger(id)); await page.waitForSelector(menu); };
  const focusLabel = () => page.evaluate(() => document.activeElement?.textContent.trim());
  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('math-test-bank-v2') ?? '[]'));
  const boundsFit = () => page.$eval(menu, el => {
    const r = el.getBoundingClientRect();
    return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
  });

  await page.goto(`${server.resolvedUrls.local[0]}#/bank`, { waitUntil: 'networkidle0' });
  await page.waitForSelector(trigger(0));
  assert.deepEqual(await page.$$eval('[data-qid="actions-0"] .card-actions button', els => els.map(el => el.textContent.trim())), ['Edit', '']);
  assert.deepEqual(await page.$$eval('[data-qid="actions-2"] .card-actions button', els => els.map(el => el.textContent.trim())), ['New variant', 'Edit', '']);
  await page.click('[data-qid="actions-0"] .card-main');
  await page.waitForSelector('.preview-svg[data-preview-for="actions-0"] svg', { timeout: 60000 });
  assert.ok(await page.$eval(`${trigger(0)} circle`, el => getComputedStyle(el).fill !== 'none'), 'preview document styles leave the menu icon visible');
  await open(1);
  assert.deepEqual(await page.$$eval(`${menu} button`, els => els.map(el => el.textContent.trim())), ['Duplicate', 'Delete']);
  assert.ok(await page.$eval(menu, el => el.parentElement === document.body), 'menu escapes the clipped question list');
  assert.ok(await boundsFit());
  assert.equal(await focusLabel(), 'Duplicate');
  await page.keyboard.press('ArrowDown'); assert.equal(await focusLabel(), 'Delete');
  await page.keyboard.press('ArrowDown'); assert.equal(await focusLabel(), 'Duplicate');
  await page.keyboard.press('ArrowUp'); assert.equal(await focusLabel(), 'Delete');
  await page.keyboard.press('Home'); assert.equal(await focusLabel(), 'Duplicate');
  await page.keyboard.press('End'); assert.equal(await focusLabel(), 'Delete');
  await page.keyboard.press('Escape');
  assert.equal(await page.$(menu), null);
  assert.ok(await page.$eval(trigger(1), el => el === document.activeElement));
  assert.ok(await page.$('[data-qid="actions-0"].selected'), 'menu keys do not change the preview');
  await page.keyboard.press('ArrowUp');
  assert.equal(await focusLabel(), 'Delete', 'ArrowUp opens on the last action');
  await page.keyboard.press('Tab');
  assert.equal(await page.$(menu), null);
  assert.equal(await page.evaluate(() => document.activeElement?.closest('[data-qid]')?.getAttribute('data-qid')), 'actions-2', 'Tab resumes the card tab order');
  await page.focus(trigger(1));
  await page.keyboard.press('ArrowDown');
  await page.keyboard.down('Shift'); await page.keyboard.press('Tab'); await page.keyboard.up('Shift');
  assert.equal(await focusLabel(), 'Edit', 'Shift+Tab returns to the visible Edit action');
  await open(1);
  await page.click(trigger(0));
  assert.equal(await page.$$eval(menu, els => els.length), 1, 'only one question menu opens at a time');
  assert.equal(await page.$eval(trigger(0), el => el.getAttribute('aria-expanded')), 'true');
  await page.click('.bank-heading h1');
  assert.equal(await page.$(menu), null, 'outside clicks dismiss');

  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => document.documentElement.setAttribute('data-theme', theme), theme);
    await new Promise(resolve => setTimeout(resolve, 200));
    await open(1);
    if (shotDir) await page.screenshot({ path: `${shotDir}/bank-card-actions-${theme}.png` });
    await page.keyboard.press('Escape');
  }
  await open(1);
  await page.$eval('.list', el => el.scrollTop += 150);
  await page.waitForFunction(() => !document.querySelector('#bank-question-actions-menu'));
  await page.$eval('.list', el => el.scrollTop = 0);
  for (const [width, height] of [[1024, 768], [390, 844], [320, 640]]) {
    await page.setViewport({ width, height });
    await open(0);
    assert.ok(await boundsFit(), `${width}×${height}: menu fits the viewport`);
    if (width === 390 && shotDir) await page.screenshot({ path: `${shotDir}/bank-card-actions-mobile.png` });
    await page.keyboard.press('Escape');
  }
  await open(29);
  assert.ok(await boundsFit(), 'last question menu stays visible at the end of the phone list');
  assert.ok(await page.$eval(menu, el => el.getBoundingClientRect().bottom <= document.querySelector('[data-qid="actions-29"] .more-actions').getBoundingClientRect().top), 'menu opens upwards when needed');
  await page.setViewport({ width: 1440, height: 900 });
  await page.waitForFunction(() => !document.querySelector('#bank-question-actions-menu'));
  await page.$eval('.view', el => el.scrollTop = 0);
  await page.$eval('.list', el => el.scrollTop = 0);

  await open(1);
  await page.click(`${menu} .danger`);
  assert.equal(dialogs.length, 1);
  assert.match(dialogs[0], /Question 1:/);
  assert.equal((await stored()).length, 30, 'cancelling Delete keeps the question');
  assert.ok(await page.$eval(trigger(1), el => el === document.activeElement));
  acceptDelete = true;
  await open(1);
  await page.click(`${menu} .danger`);
  await page.waitForFunction(() => !document.querySelector('[data-qid="actions-1"]'));
  assert.equal((await stored()).length, 29);
  assert.ok(await page.$('[data-qid="actions-0"].selected'), 'deleting another card preserves the current preview');
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-qid')), 'actions-2', 'focus moves to the next question after deletion');
  await open(0);
  await page.click(`${menu} .danger`);
  await page.waitForFunction(() => !document.querySelector('[data-qid="actions-0"]'));
  assert.ok(await page.$eval('#tut-preview-pane', el => el.classList.contains('hidden')), 'deleting the previewed question closes its preview');

  await open(3);
  await page.click(`${menu} button:first-child`);
  await page.waitForFunction(() => location.hash.startsWith('#/editor/'));
  await page.waitForFunction(() => document.querySelector('textarea[aria-label="Question"]')?.value === 'Question 3: solve $x + 3 = 6$.');
  const copy = await page.evaluate(async () => {
    const { editor } = await import('/src/lib/editor/editor-state.svelte.ts');
    return editor.session.drafts.find(draft => draft.id === editor.session.activeId);
  });
  assert.equal(copy.sourceId, undefined, 'Duplicate opens a new draft');
  assert.equal((await stored()).length, 28, 'Duplicate preserves the original bank');
  assert.equal(await page.$(menu), null);

  await page.evaluate(() => location.hash = '#/bank');
  const bankIds = await page.evaluate(async () => {
    const { bankWorkspaces } = await import('/src/lib/bank-workspaces.svelte.ts');
    const first = bankWorkspaces.activeBankId;
    await bankWorkspaces.createBank('Other bank');
    return { first, active: bankWorkspaces.activeBankId };
  });
  await page.waitForSelector(trigger(4));
  await open(4);
  await page.click(`${menu} .danger`);
  await page.waitForFunction(() => !document.querySelector('[data-qid="actions-4"]'));
  const dormant = await page.evaluate(async id => {
    const { bankWorkspaces } = await import('/src/lib/bank-workspaces.svelte.ts');
    return { active: bankWorkspaces.activeBankId, questions: (await bankWorkspaces.readBankSnapshot(id)).questions };
  }, bankIds.first);
  assert.equal(dormant.active, bankIds.active, 'a menu action does not switch banks');
  assert.ok(!dormant.questions.some(q => q.id === 'actions-4'), 'Delete targets the question’s source bank');
  assert.equal((await stored()).length, 0, 'the active bank is unchanged');
  assert.deepEqual(errors, []);
  console.log('Card action menus passed: visible Edit/variant, keyboard and tab order, dismissal, viewport placement, confirmations, focus, duplicate draft, and source-bank deletion.');
} finally {
  await browser?.close();
  await server.close();
}
