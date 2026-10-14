// Achievement indicators end to end: the Editor's indicator list, the Bank's Curriculum view
// and its indicator filter, and swapping questions in Build. Synthetic data in an isolated profile.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';

const shots = process.env.SCREENSHOTS;
const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 950 });
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  const classes = [{ id: 'pc30', name: 'Pre-Calculus 30S', units: [{ id: 'an', name: 'Algebra and Number', sections: [
    { id: '11P.A.2', name: 'Solve problems that involve operations on radicals.', indicators: [
      { id: '11P.A.2.1', text: 'Compare and order a set of radical expressions with numerical radicands.' },
      { id: '11P.A.2.2', text: 'Express an entire radical with a numerical radicand as a mixed radical.' },
      { id: '11P.A.2.3', text: 'Express a mixed radical with a numerical radicand as an entire radical.' },
    ] },
  ] }] }];
  const q = (id, indicators, extra = {}) => ({ id, createdAt: 1, checked: true, points: 2, tags: [], classId: 'pc30', unitId: 'an', sectionId: '11P.A.2',
    questionType: 'frq', body: `Question ${id}`, ...(indicators ? { indicators } : {}), ...extra });
  const questions = [q('m1', ['11P.A.2.2']), q('m2', ['11P.A.2.2']), q('m3', ['11P.A.2.2']), q('e1', ['11P.A.2.3']), q('e2', ['11P.A.2.3']), q('n1', null)];
  await page.evaluateOnNewDocument((qs, cls) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    const now = Date.now();
    localStorage.setItem('tg-tutorial-done-v1', '1');
    localStorage.setItem('tg-bank-workspaces-v1', JSON.stringify([{ id: 'b', name: 'B', gitRepoId: 'test-generator-bank-b', createdAt: now, updatedAt: now }]));
    localStorage.setItem('tg-active-bank-id-v1', 'b');
    localStorage.setItem('math-test-bank-v2', JSON.stringify(qs));
    localStorage.setItem('math-test-custom-classes-v1', JSON.stringify(cls));
  }, questions, classes);
  const base = server.resolvedUrls.local[0];
  const settle = (ms = 300) => new Promise((r) => setTimeout(r, ms));
  const clickText = (selector, text) => page.evaluate((selector, text) => {
    const el = [...document.querySelectorAll(selector)].find((b) => b.textContent.trim() === text && b.offsetParent);
    if (!el) throw new Error(`No ${selector} "${text}"`);
    el.click();
  }, selector, text);

  // Bank → Curriculum: counts per indicator, gaps, and untagged questions.
  await page.goto(`${base}#/bank`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-qid="n1"]', { timeout: 15000 }).catch(async (e) => { if (shots) await page.screenshot({ path: `${shots}/fail.png` }); throw e; });
  await clickText('.mode-switch button', 'Curriculum'); await settle();
  const rows = await page.$$eval('.curriculum-view li', (els) => els.map((li) => `${li.querySelector('.id').textContent}=${li.querySelector('.count').textContent.trim()}`));
  assert.deepEqual(rows, ['11P.A.2.1=0', '11P.A.2.2=3', '11P.A.2.3=2']);
  assert.match(await page.$eval('.curriculum-view .summary', (e) => e.textContent), /2 of 3 indicators have questions · 1 placed question without an indicator/);
  if (shots) await page.screenshot({ path: `${shots}/bank-curriculum.png` });
  await page.evaluate(() => [...document.querySelectorAll('.curriculum-view li')].find((li) => li.textContent.includes('11P.A.2.2')).querySelector('button.count').click());
  await settle();
  const ids = () => page.$$eval('[data-qid]', (els) => els.map((e) => e.dataset.qid).sort().join(','));
  assert.equal(await ids(), 'm1,m2,m3', 'an indicator count shows its questions');
  assert.match(await page.$eval('.indicator-chip', (e) => e.textContent), /11P\.A\.2\.2: Express an entire radical/);
  if (shots) await page.screenshot({ path: `${shots}/bank-filtered.png` });
  await page.$eval('.indicator-chip button', (b) => b.click()); await settle();
  await clickText('.mode-switch button', 'Curriculum'); await settle();
  await clickText('.curriculum-view .untagged', '1 without an indicator'); await settle();
  assert.equal(await ids(), 'n1', 'untagged questions of the section');

  // Nicknames, set in the Curriculum view, replace wordy text and are saved with the bank's curriculum.
  await clickText('.mode-switch button', 'Curriculum'); await settle();
  await page.$eval('button[aria-label="Nickname for 11P.A.2.2"]', (b) => b.click()); await settle();
  await page.type('.nickname-field', 'Entire to mixed'); await page.keyboard.press('Enter'); await settle();
  await page.$eval('button[aria-label="Nickname for 11P.A.2"]', (b) => b.click()); await settle();
  await page.type('.nickname-field', 'Radicals'); await page.keyboard.press('Enter'); await settle();
  assert.match(await page.$eval('.section-title', (e) => e.textContent), /11P\.A\.2: Radicals\s*✎?\s*Solve problems that involve operations on radicals\./);
  const row = await page.evaluate(() => [...document.querySelectorAll('.curriculum-view li')].find((li) => li.textContent.includes('11P.A.2.2')).querySelector('.nick')?.textContent);
  assert.equal(row, 'Entire to mixed');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('math-test-custom-classes-v1'))[0].units[0].sections[0]);
  assert.equal(stored.nickname, 'Radicals');
  assert.equal(stored.indicators[1].nickname, 'Entire to mixed');
  assert.equal(stored.indicators[1].text, 'Express an entire radical with a numerical radicand as a mixed radical.', 'the wording is kept');
  if (shots) await page.screenshot({ path: `${shots}/nicknames.png` });

  // Editor: the section's indicators are checkboxes; a checked one is saved with the question.
  await page.goto(`${base}#/editor/n1`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.indicators input[type=checkbox]', { timeout: 60000 });
  const labels = await page.$$eval('.indicators li .id', (els) => els.map((e) => e.textContent));
  assert.deepEqual(labels, ['11P.A.2.1', '11P.A.2.2', '11P.A.2.3']);
  await page.evaluate(() => [...document.querySelectorAll('.indicators li')].find((li) => li.textContent.includes('11P.A.2.1')).querySelector('input').click());
  if (shots) await page.screenshot({ path: `${shots}/editor.png` });
  await clickText('.actions button', 'Save'); await settle(800);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('math-test-bank-v2')).find((q) => q.id === 'n1'));
  assert.deepEqual(saved.indicators, ['11P.A.2.1']);

  // Build: ⇄ lists questions with the same indicator first; New version swaps every question.
  await page.goto(`${base}#/build`, { waitUntil: 'networkidle0' });
  await page.evaluate(async () => (await import('/src/lib/test-editor.svelte.ts')).testEditor.addQuestions(['m1', 'e1']));
  await page.waitForSelector('button[aria-label="Swap question 1"]', { timeout: 60000 });
  await page.$eval('#picker-tab-selected', (b) => b.click()); await settle();
  await page.$eval('button[aria-label="Swap question 1"]', (b) => b.click()); await settle();
  const options = await page.$$eval('.swap-option', (els) => els.map((e) => `${e.querySelector('.swap-body').textContent}|${e.querySelector('.swap-level').textContent}`));
  assert.deepEqual(options.slice(0, 2).sort(), ['Question m2|11P.A.2.2', 'Question m3|11P.A.2.2']);
  assert.ok(options.slice(2).every((o) => o.endsWith('|Same section')), 'then the rest of the section');
  assert.ok(!options.some((o) => o.startsWith('Question e1')), 'never a question the test already has');
  if (shots) await page.screenshot({ path: `${shots}/build-swap.png` });
  await page.evaluate(() => document.querySelector('.swap-option').click()); await settle();
  let selected = await page.evaluate(() => JSON.parse(localStorage.getItem('tg-test-draft-v1')).selectedIds);
  assert.equal(selected.length, 2);
  assert.ok(['m2', 'm3'].includes(selected[0]) && selected[1] === 'e1', `swapped in place: ${selected}`);
  await clickText('.selected-footer button', 'New version'); await settle();
  selected = await page.evaluate(() => JSON.parse(localStorage.getItem('tg-test-draft-v1')).selectedIds);
  assert.ok(['m1', 'm2', 'm3'].includes(selected[0]) && selected[1] === 'e2', `every question swapped for a same-indicator one: ${selected}`);
  assert.match(await page.$eval('.version-note', (e) => e.textContent), /Swapped 2 questions/);
  console.log('Achievement indicators: all browser checks passed');
} finally { await browser.close(); await server.close(); }
