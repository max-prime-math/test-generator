import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';

// Synthetic data in an isolated browser; never reads host banks or student data.
// Optional: GENERATOR_SHOTS=<dir> saves generator-{wide,mcq,narrow}.png there.
const shotDir = process.env.GENERATOR_SHOTS;
const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
const url = server.resolvedUrls.local[0];
let browser;
try {
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('tg-tutorial-done-v1', '1');
    if (!sessionStorage.getItem('seeded')) {
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('math-test-bank-v2', '[]');
      localStorage.setItem('tg-generator-plan-v1', JSON.stringify({
        format: 'written',
        course: 'mb-10i',
        rows: { 'mb-10i-factor-trinomials': { count: 2, difficulty: 2 }, 'mb-10i-right-triangle-trig': { count: 1, difficulty: 1 } },
      }));
    }
  });
  await page.setViewport({ width: 1440, height: 900 });
  const tabs = () => page.$$eval('#tut-nav button', buttons => buttons.map(b => b.textContent.trim()));

  // Off by default: no tab, and the route falls back to Bank.
  await page.goto(`${url}#/generate`, { waitUntil: 'networkidle0' });
  assert.deepEqual(await tabs(), ['Bank', 'Editor', 'Build']);
  assert.equal(await page.$('.generator'), null);

  await page.evaluate(() => localStorage.setItem('tg-generator-experimental-enabled-v1', 'true'));
  await page.evaluate(() => { window.location.hash = '#/generate'; });
  await page.reload({ waitUntil: 'networkidle0' });
  assert.deepEqual(await tabs(), ['Bank', 'Generate', 'Editor', 'Build']);
  // The old plan (a count per problem type) becomes a worksheet with those questions.
  const cardCount = () => page.$$eval('.generator .sheet .card', els => els.length);
  const rendered = (sel, n) => page.waitForFunction((s, k) => document.querySelectorAll(`${s} .svg svg`).length === k && !document.querySelector(`${s} pre`), { timeout: 60_000 }, sel, n);
  await rendered('.generator .sheet .card', 3);
  assert.equal(await page.$$eval('.generator .section-head', els => els.length), 2, 'two sections migrated');
  if (shotDir) await page.screenshot({ path: `${shotDir}/generator-wide.png` });

  // A problem type opens its card: count, preset, question type, options, and a live preview.
  const openType = async (title) => {
    await page.evaluate(t => [...document.querySelectorAll('.generator .type')].find(b => b.querySelector('.gen-title').textContent.startsWith(t)).click(), title);
    await page.waitForSelector('.type-card');
  };
  const cardButton = (label) => page.evaluate(l => [...document.querySelectorAll('.type-card button')].find(b => b.textContent.trim().startsWith(l)).click(), label);
  await openType('Factor trinomials');
  await rendered('.type-card .samples .card', 5);
  await page.$eval('.type-card .count input', el => { el.value = '2'; el.dispatchEvent(new Event('change', { bubbles: true })); });
  await rendered('.type-card .samples .card', 2);
  // Options change the previewed questions; Refresh all draws new ones.
  const previewSvg = () => page.$eval('.type-card .samples .card .svg', el => el.innerHTML);
  await page.evaluate(() => [...document.querySelectorAll('.type-card .group label')].find(l => l.textContent.trim() === 'Greater than 1').querySelector('input').click());
  await rendered('.type-card .samples .card', 2);
  const before = await previewSvg();
  await cardButton('↻ Refresh all');
  await page.waitForFunction(b => document.querySelector('.type-card .samples .card .svg')?.innerHTML !== b, { timeout: 60_000 }, before);
  await rendered('.type-card .samples .card', 2);
  const previewed = await page.$$eval('.type-card .sample', els => els.map(e => Number(e.dataset.seed)));
  if (shotDir) await page.screenshot({ path: `${shotDir}/generator-card.png` });
  // Add puts exactly the previewed questions on the worksheet.
  await cardButton('Add 2');
  await page.waitForFunction(() => !document.querySelector('.type-card'));
  await rendered('.generator .sheet .card', 5);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('tg-generator-plan-v2')));
  const last = stored.sections[stored.sections.length - 1];
  assert.deepEqual(last.seeds, previewed, 'the added questions are exactly the previewed ones');
  assert.equal(last.options.leading, 'any');
  const metas0 = await page.$$eval('.generator .section-meta', els => els.map(e => e.textContent));
  assert.match(metas0[metas0.length - 1], /2 questions · Easy · Free response · Leading coefficient: Greater than 1/);

  // Add & Continue keeps the card open for another set.
  await page.select('.generator .rail-controls select', 'mb-10i');
  await openType('Find an unknown coordinate');
  await rendered('.type-card .samples .card', 2);
  await cardButton('Add & Continue');
  await page.waitForFunction(() => /Added 2 questions/.test(document.querySelector('.type-card .added')?.textContent ?? ''));
  await cardButton('Cancel');
  await rendered('.generator .sheet .card', 7);

  // Edit a section: a new preset changes its level.
  await page.evaluate(() => document.querySelector('.generator .section-head button').click());
  await page.waitForSelector('.type-card');
  await cardButton('Hard');
  await cardButton('Save');
  await page.waitForFunction(() => /Hard/.test(document.querySelector('.generator .section-meta')?.textContent ?? ''));

  // Every section to multiple choice, with answers shown.
  await page.evaluate(() => [...document.querySelectorAll('.generator .segment button')].find(b => b.textContent.includes('Multiple')).click());
  await page.evaluate(() => document.querySelector('.generator .bar .check input').click());
  await rendered('.generator .sheet .card', 7);
  if (shotDir) await page.screenshot({ path: `${shotDir}/generator-mcq.png` });

  // One question gets new numbers; another is removed.
  const firstBefore = await page.$eval('.generator .sheet .card .svg', el => el.innerHTML);
  await page.click('.generator .sheet .card button[aria-label^="Regenerate"]');
  await page.waitForFunction(b => document.querySelector('.generator .sheet .card .svg')?.innerHTML !== b, { timeout: 60_000 }, firstBefore);
  await page.click('.generator .sheet .card button[aria-label^="Remove problem"]');
  await rendered('.generator .sheet .card', 6);
  assert.equal(await cardCount(), 6);

  // The worksheet survives a reload.
  await page.reload({ waitUntil: 'networkidle0' });
  await rendered('.generator .sheet .card', 6);

  // Add to… → New test: the questions belong to the test and never reach a bank.
  const addTo = async (item) => {
    await page.click('.generator .bar .add-to-trigger');
    await page.evaluate(i => [...document.querySelectorAll('.generator .bar [role="menuitem"]')].find(b => b.textContent.includes(i)).click(), item);
  };
  assert.equal(await page.$$eval('.generator .bar button', bs => bs.filter(b => /bank/i.test(b.textContent)).length), 0, 'no Save to bank button');
  // Adding opens Build so the new questions are in view, with the result in a notice.
  await addTo('New test');
  await page.waitForFunction(() => window.location.hash === '#/build');
  await page.waitForFunction(() => /^Started a new test with 6 questions$/.test(document.querySelector('.folder-toast')?.textContent ?? ''));
  await page.waitForFunction(() => document.querySelectorAll('.selected-list .sel-item').length === 6, { timeout: 60_000 });
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('math-test-bank-v2'))), [], 'bank untouched');
  const draft = await page.evaluate(() => JSON.parse(localStorage.getItem('tg-test-draft-v1')));
  assert.equal(draft.subtitle, 'Worksheet');
  assert.equal(draft.selectedIds.length, 6);
  assert.deepEqual(draft.ownQuestions.map(q => q.id), draft.selectedIds);
  assert.ok(draft.ownQuestions.every(q => q.classId === 'mb-10i' && q.tags.includes('generated') && q.questionType === 'mcq' && q.choices && q.answer));

  // Adding the same worksheet again adds nothing, so Generate stays open and says so.
  await page.evaluate(() => { window.location.hash = '#/generate'; });
  await page.waitForSelector('.generator .bar .add-to-trigger');
  await addTo('Current test');
  await page.waitForFunction(() => /^Nothing added to Unsaved test · 6 already in test/.test(document.querySelector('.generator .notice')?.textContent ?? ''));

  // Build lists and renders them, and Save As offers Worksheet as the type.
  await page.click('.generator .notice a');
  await page.waitForFunction(() => document.querySelectorAll('.selected-list .sel-item').length === 6, { timeout: 60_000 });
  assert.equal(await page.$eval('.selected-list', el => el.textContent.includes('Missing')), false);
  await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Save As…').click());
  await page.waitForSelector('select#type');
  assert.equal(await page.$eval('select#type', el => el.value), 'worksheet');
  await page.evaluate(() => [...document.querySelectorAll('.modal button, [role="dialog"] button')].find(b => b.textContent.trim() === 'Save').click());
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('tg-test-library-v1') ?? '[]').length === 1);
  const [savedTest] = await page.evaluate(() => JSON.parse(localStorage.getItem('tg-test-library-v1')));
  assert.equal(savedTest.testType, 'worksheet');
  assert.equal(savedTest.questionSnapshots.length, 6);
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('math-test-bank-v2'))), [], 'bank still untouched');
  await page.evaluate(() => { window.location.hash = '#/generate'; });
  await page.waitForSelector('.generator .bar .add-to-trigger');

  // Pre-Calculus 40S: pick the course, search, and add a problem type.
  await page.evaluate(() => [...document.querySelectorAll('.generator .bar button')].find(b => b.textContent.includes('Clear worksheet')).click());
  await page.select('.generator .rail-controls select', 'mb-40s');
  await page.waitForFunction(() => document.querySelectorAll('.generator details.group').length === 14);
  await page.type('.generator .rail-controls input[type="search"]', 'logarithm');
  await page.waitForFunction(() => /match/.test(document.querySelector('.generator .rail-controls .hint')?.textContent ?? ''));
  const matched = await page.$$eval('.generator details.group .gen-title', els => els.map(e => e.textContent));
  assert.ok(matched.length > 0 && matched.length < 20, `search narrows the list (${matched.length})`);
  await openType('Sketch a transformed logarithmic function');
  await page.$eval('.type-card .count input', el => { el.value = '1'; el.dispatchEvent(new Event('change', { bubbles: true })); });
  await rendered('.type-card .samples .card', 1);
  await cardButton('Add 1');
  await rendered('.generator .sheet .card', 1);
  const metas = await page.$$eval('.generator .sheet .card .meta', els => els.map(e => e.textContent));
  assert.ok(metas.every(m => m.includes('12P.R')), `40S problems carry their outcomes: ${metas.join(' | ')}`);
  if (shotDir) await page.screenshot({ path: `${shotDir}/generator-40s.png` });

  // Phone width: stacked, no horizontal page scroll.
  await page.setViewport({ width: 390, height: 844 });
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'narrow: no horizontal page scroll');
  if (shotDir) await page.screenshot({ path: `${shotDir}/generator-narrow.png` });
  await openType('Expand a logarithm');
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'narrow card: no horizontal page scroll');
  await cardButton('Cancel');

  // Turning the feature off leaves Generate.
  await page.setViewport({ width: 1440, height: 900 });
  await page.evaluate(() => { localStorage.setItem('tg-generator-experimental-enabled-v1', 'false'); window.location.hash = '#/generate'; });
  await page.reload({ waitUntil: 'networkidle0' });
  assert.deepEqual(await tabs(), ['Bank', 'Editor', 'Build']);

  assert.deepEqual(errors, []);
  console.log('Generator browser tests passed: toggle, migration, settings card (preview, options, refresh, add, add & continue, edit), MCQ, regenerate, remove, reload, Add to… new and current test (no bank), narrow layout.');
} finally {
  await browser?.close();
  await server.close();
}
