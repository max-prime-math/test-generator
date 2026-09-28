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
  assert.deepEqual(await tabs(), ['Bank', 'Editor', 'Build', 'Generate']);
  await page.waitForSelector('.generator .empty');

  // A fixed seed reproduces the same set.
  await page.type('.generator .seed input', '42');
  await page.click('.generator .toolbar button.primary');
  await page.waitForFunction(() => document.querySelectorAll('.generator .card .svg svg').length === 3, { timeout: 60_000 });
  const firstRun = await page.$$eval('.generator .card .meta', els => els.map(e => e.textContent));
  assert.equal(firstRun.length, 3);
  const firstSvg = await page.$eval('.generator .card .svg', el => el.innerHTML);
  await page.click('.generator .toolbar button.primary');
  await page.waitForFunction(() => document.querySelectorAll('.generator .card .svg svg').length === 3);
  assert.equal(await page.$eval('.generator .card .svg', el => el.innerHTML), firstSvg, 'same seed renders the same first problem');
  if (shotDir) await page.screenshot({ path: `${shotDir}/generator-wide.png` });

  // Multiple choice, with answers shown.
  await page.evaluate(() => [...document.querySelectorAll('.generator .segment button')].find(b => b.textContent.includes('Multiple')).click());
  await page.evaluate(() => document.querySelector('.generator .toolbar .check input').click());
  await page.waitForFunction(() => document.querySelectorAll('.generator .card .svg svg').length === 3 && !document.querySelector('.generator .card pre'));
  await new Promise(resolve => setTimeout(resolve, 500));
  if (shotDir) await page.screenshot({ path: `${shotDir}/generator-mcq.png` });

  // Regenerating one problem marks the set as edited.
  await page.click('.generator .card button[aria-label^="Regenerate"]');
  assert.match(await page.$eval('.generator .actions .summary', el => el.textContent), /seed 42 \(edited\)/);

  // Save to bank files the questions under the Manitoba course.
  await page.evaluate(() => [...document.querySelectorAll('.generator .actions button')].find(b => b.textContent.trim() === 'Save to bank').click());
  await page.waitForSelector('.generator .actions .add-to-trigger');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('math-test-bank-v2')));
  assert.equal(saved.length, 3);
  assert.ok(saved.every(q => q.classId === 'mb-10i' && q.tags.includes('generated') && q.questionType === 'mcq' && q.choices && q.answer));
  const classes = await page.evaluate(() => JSON.parse(localStorage.getItem('math-test-custom-classes-v1') ?? '[]'));
  assert.ok(classes.some(c => c.id === 'mb-10i'), 'Manitoba course added to classes');

  // …and can start a new test.
  await page.click('.generator .actions .add-to-trigger');
  await page.evaluate(() => [...document.querySelectorAll('.generator .actions [role="menuitem"]')].find(b => b.textContent.includes('New test')).click());
  await page.waitForFunction(() => /Started a new test with 3 questions/.test(document.querySelector('.generator .notice')?.textContent ?? ''));

  // Pre-Calculus 40S: pick the course, search, and generate a graph problem and a text problem.
  await page.select('.generator .rail-controls select', 'mb-40s');
  await page.waitForFunction(() => document.querySelectorAll('.generator details.group').length === 14);
  await page.type('.generator .rail-controls input[type="search"]', 'logarithm');
  await page.waitForFunction(() => /match/.test(document.querySelector('.generator .rail-controls .hint')?.textContent ?? ''));
  const matched = await page.$$eval('.generator details.group .gen-title', els => els.map(e => e.textContent));
  assert.ok(matched.length > 0 && matched.length < 20, `search narrows the list (${matched.length})`);
  await page.evaluate(() => {
    const set = (title, value) => {
      const row = [...document.querySelectorAll('.generator .row')].find(r => r.querySelector('.gen-title').textContent.startsWith(title));
      const input = row.querySelector('input[type="number"]');
      input.value = String(value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    set('Sketch a transformed logarithmic function', 1);
    set('Expand a logarithm', 2);
  });
  await page.click('.generator .toolbar button.primary');
  await page.waitForFunction(() => document.querySelectorAll('.generator .card .svg svg').length === 3 && !document.querySelector('.generator .card pre'), { timeout: 60_000 });
  const metas = await page.$$eval('.generator .card .meta', els => els.map(e => e.textContent));
  assert.ok(metas.every(m => m.includes('12P.R')), `40S problems carry their outcomes: ${metas.join(' | ')}`);
  if (shotDir) await page.screenshot({ path: `${shotDir}/generator-40s.png` });

  // Phone width: stacked, no horizontal page scroll.
  await page.setViewport({ width: 390, height: 844 });
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'narrow: no horizontal page scroll');
  if (shotDir) await page.screenshot({ path: `${shotDir}/generator-narrow.png` });

  // Turning the feature off leaves Generate.
  await page.setViewport({ width: 1440, height: 900 });
  await page.evaluate(() => { localStorage.setItem('tg-generator-experimental-enabled-v1', 'false'); window.location.hash = '#/generate'; });
  await page.reload({ waitUntil: 'networkidle0' });
  assert.deepEqual(await tabs(), ['Bank', 'Editor', 'Build']);

  assert.deepEqual(errors, []);
  console.log('Generator browser tests passed: toggle, seeded generation, MCQ, save to bank, new test, narrow layout.');
} finally {
  await browser?.close();
  await server.close();
}
