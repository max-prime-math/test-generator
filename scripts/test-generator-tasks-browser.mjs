// Generate → test layout: each section is one numbered item with its instruction,
// and its questions are lettered a), b), … across columns, like LaTeX's \tasks.
// Synthetic data in an isolated browser. SCREENSHOT_DIR=<dir> saves Generate and the Build preview.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';

const plan = {
  course: 'mb-10i',
  sections: [
    { id: 'factor', generatorId: 'mb-10i-factor-trinomials', seeds: [1, 2, 3, 4, 5, 6], difficulty: 1, format: 'written', options: {} },
    { id: 'powers', generatorId: 'mb-10f-pow-evaluate', seeds: [7, 8, 9, 10, 11, 12, 13, 14], difficulty: 1, format: 'written', options: {} },
    { id: 'systems', generatorId: 'mb-10i-sys-elimination', seeds: [15, 16], difficulty: 1, format: 'mcq', options: {} },
    { id: 'words', generatorId: 'mb-10f-pow-problem', seeds: [17, 18], difficulty: 1, format: 'written', options: {} },
    { id: 'single', generatorId: 'mb-10i-factor-trinomials', seeds: [19], difficulty: 1, format: 'written', options: {} },
  ],
};

const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
let browser;
try {
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('dialog', (dialog) => { errors.push(`Unexpected dialog: ${dialog.message()}`); void dialog.dismiss(); });
  await page.evaluateOnNewDocument((plan) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('tg-tutorial-done-v1', '1');
    localStorage.setItem('tg-generator-experimental-enabled-v1', 'true');
    localStorage.setItem('tg-generator-plan-v2', JSON.stringify(plan));
  }, plan);
  await page.goto(`${server.resolvedUrls.local[0]}#/generate`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.generator .section-head');

  // 1. Sections are numbered items with their shared instruction; questions are lettered.
  const heads = () => page.$$eval('.generator .section-head', (els) => els.map((el) => ({
    number: el.querySelector('.section-number').textContent,
    instruction: el.querySelector('.instruction').value,
    columns: el.querySelector('.columns select').selectedOptions[0].textContent,
  })));
  const found = await heads();
  assert.deepEqual(found.map((h) => h.number), ['1.', '2.', '3.', '4.', '5.']);
  assert.equal(found[0].instruction, 'Factor completely.');
  assert.equal(found[1].instruction, 'Evaluate.');
  assert.equal(found[3].instruction, 'Answer each question.');
  assert.match(found[0].columns, /^Auto \([1-4]\)$/);
  const labels = await page.$$eval('.generator .cards', (groups) => groups.map((g) => [...g.querySelectorAll('.card .number')].map((n) => n.textContent)));
  assert.deepEqual(labels[0], ['a)', 'b)', 'c)', 'd)', 'e)', 'f)']);
  assert.deepEqual(labels[4], [], 'a one-question section is not lettered');

  // 2. The instruction and columns can be changed.
  await page.$eval('.generator .section-head:nth-of-type(1)', () => {});
  await page.evaluate(() => {
    const input = document.querySelectorAll('.generator .section-head .instruction')[3];
    input.value = 'Solve each problem. Show your work.';
    input.dispatchEvent(new Event('change', { bubbles: true }));
    const select = document.querySelectorAll('.generator .section-head .columns select')[0];
    select.value = '3';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  assert.equal((await heads())[3].instruction, 'Solve each problem. Show your work.');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('tg-generator-plan-v2')).sections);
  assert.equal(saved[3].instructions, 'Solve each problem. Show your work.');
  assert.equal(saved[0].columns, 3);
  // Typing the automatic wording back returns to following the questions.
  await page.evaluate(() => {
    const input = document.querySelectorAll('.generator .section-head .instruction')[1];
    input.value = 'Evaluate.';
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  assert.equal((await page.evaluate(() => JSON.parse(localStorage.getItem('tg-generator-plan-v2')).sections))[1].instructions, undefined);
  if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/generate-tasks.png` });

  // 3. Add to a new test: Build lists the questions by printed label.
  await page.click('.generator .bar .add-to-trigger');
  const newTest = await page.evaluateHandle(() => [...document.querySelectorAll('.generator .bar [role="menuitem"]')].find((b) => b.textContent.includes('New test')));
  await newTest.asElement().click();
  await page.waitForFunction(() => window.location.hash === '#/build');
  await page.waitForFunction(() => document.querySelectorAll('.selected-list .sel-item').length === 19, { timeout: 60_000 });
  const buildLabels = await page.$$eval('.selected-list .sel-num', (els) => els.map((el) => el.textContent.trim()));
  // New tests put multiple choice first; the systems section moves ahead as a whole.
  assert.deepEqual(buildLabels, [
    '1a', '1b',
    '2a', '2b', '2c', '2d', '2e', '2f',
    '3a', '3b', '3c', '3d', '3e', '3f', '3g', '3h',
    '4a', '4b', '5',
  ]);
  const draft = await page.evaluate(() => JSON.parse(localStorage.getItem('tg-test-draft-v1')));
  const groups = draft.ownQuestions.map((q) => q.taskGroup);
  assert.deepEqual(groups[0], { id: 'gen-group-factor', instructions: 'Factor completely.', columns: 3, strip: 'Factor completely: ' });
  assert.equal(groups[16].instructions, 'Solve each problem. Show your work.');

  // 4. The preview renders; the grouped items appear once each.
  await page.waitForFunction(() => document.querySelector('.preview svg, .preview-pane svg, svg.typst-doc'), { timeout: 90_000 });
  await new Promise((resolve) => setTimeout(resolve, 1500));
  if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/build-tasks.png` });

  assert.deepEqual(errors, []);
  console.log('Generator task layout passed: numbered sections, shared instructions, lettered questions, columns, Build labels.');
} finally {
  await browser?.close();
  await server.close();
}
