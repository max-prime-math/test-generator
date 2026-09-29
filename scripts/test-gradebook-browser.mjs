// Gradebook: course-scoped assessments, known-by names, name order and sort,
// type-to-find in the grading grid, and score entry that saves after a pause.
// Synthetic data in an isolated browser. SCREENSHOT_DIR=<dir> saves the grading grid.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';

const STUDENTS = [
  ['Joe', 'Adams'], ['Jane', 'Baker', 'Janie'], ['Liam', 'Chen'], ['Ava', 'Diaz'], ['Noah', 'Evans'],
  ['Mia', 'Fox'], ['Ethan', 'Gray'], ['Zoe', 'Hill'], ['Owen', 'Ito'], ['Ruby', 'James'],
  ...Array.from({ length: 20 }, (_, i) => [`Kid${String.fromCharCode(97 + i)}`, `Last${String.fromCharCode(97 + i)}`]),
];
const QUESTIONS = Array.from({ length: 10 }, (_, i) => ({ id: `q${i + 1}`, body: `Question ${i + 1}`, points: 2, tags: [], createdAt: 1 }));

function savedTest(id, name, classId) {
  return {
    id, name, classId, unitId: null, testType: 'test', createdAt: 1, updatedAt: 1,
    config: { title: name, subtitle: '', selectedIds: QUESTIONS.map((q) => q.id), bonusQuestionIds: [] },
    questionSnapshots: QUESTIONS,
  };
}

const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
let browser;
try {
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 950 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('dialog', (dialog) => { errors.push(`Unexpected dialog: ${dialog.message()}`); void dialog.dismiss(); });
  await page.evaluateOnNewDocument((students, tests) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('tg-tutorial-done-v1', '1');
    localStorage.setItem('tg-gradebook-experimental-enabled-v1', 'true');
    localStorage.setItem('math-test-custom-classes-v1', JSON.stringify([
      { id: 'pc40', name: 'Pre-Calculus 40S', units: [] },
      { id: 'pc30', name: 'Pre-Calculus 30S', units: [] },
    ]));
    localStorage.setItem('tg-test-library-v1', JSON.stringify(tests));
    localStorage.setItem('tg-gradebook-v1', JSON.stringify({
      version: 1,
      sections: [{ id: 'sec', name: 'Period 1', linkedClassId: 'pc40', termLabel: 'S1' }],
      students: students.map(([firstName, lastName, knownBy], i) => ({ id: `s${i}`, firstName, lastName, knownBy })),
      enrollments: students.map((_, i) => ({ id: `e${i}`, sectionId: 'sec', studentId: `s${i}` })),
      assessments: [], scores: [], settings: {},
    }));
  }, STUDENTS, [savedTest('t40', 'Unit 1 Test 40S', 'pc40'), savedTest('t30', 'Unit 1 Test 30S', 'pc30')]);

  const base = server.resolvedUrls.local[0];
  await page.goto(`${base}#/gradebook`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.assessment-form select');

  // 1. A 40S section only offers 40S saved tests.
  const offered = await page.$$eval('.assessment-form select option', (options) => options.map((o) => o.textContent.trim()));
  assert.deepEqual(offered, ['Unit 1 Test 40S']);
  await page.click('.assessment-form button[type="submit"]');
  await page.waitForSelector('.grading-grid');

  // 2. Grading shows one-line known-by names, sorted by last name by default.
  const names = () => page.$$eval('.grading-grid th.grading-name', (cells) => cells.map((c) => c.textContent.trim()));
  assert.deepEqual((await names()).slice(0, 3), ['Joe Adams', 'Janie Baker', 'Liam Chen']);
  await page.evaluate(() => [...document.querySelectorAll('.sort-toggle button')].find((b) => b.textContent === 'First').click());
  assert.deepEqual((await names()).slice(0, 2), ['Ava Diaz', 'Ethan Gray']);
  await page.evaluate(() => [...document.querySelectorAll('.sort-toggle button')].find((b) => b.textContent === 'Last').click());

  // 3. Typing letters jumps to and highlights the matching student.
  await page.click('[data-grade-row="0"][data-grade-col="0"]');
  await page.keyboard.type('4');
  await page.keyboard.type('ja');
  const focused = () => page.evaluate(() => {
    const el = document.activeElement;
    return { row: el?.dataset.gradeRow, col: el?.dataset.gradeCol, found: document.querySelector('tr.found-row th')?.textContent.trim() };
  });
  assert.deepEqual(await focused(), { row: '1', col: '0', found: 'Janie Baker' });
  assert.match(await page.$eval('.name-search', (el) => el.textContent), /Find: ja/);
  await page.keyboard.type('3');
  assert.equal(await page.$eval('[data-grade-row="1"][data-grade-col="0"]', (el) => el.value), '3');
  assert.equal(await page.$eval('[data-grade-row="0"][data-grade-col="0"]', (el) => el.value), '4');
  // Entering a grade ended that search, so the next letters start a new one.
  await page.keyboard.type('ru');
  assert.equal((await focused()).found, 'Ruby James');

  // 4. Scores stay in memory while typing, then save after a pause.
  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('tg-gradebook-v1')).scores.length);
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('tg-gradebook-v1')).scores.length === 2, { timeout: 2000 });
  assert.equal(await stored(), 2);

  // 5. Typing a full row stays fast: time 10 keystrokes with Tab between cells.
  await page.click('[data-grade-row="5"][data-grade-col="0"]');
  const started = Date.now();
  for (let col = 0; col < 10; col += 1) {
    await page.keyboard.type('1');
    await page.keyboard.press('Tab');
  }
  const perKey = (Date.now() - started) / 20;
  console.log(`score entry: ${perKey.toFixed(1)} ms per keystroke`);
  // Tab from the last question wrapped to the next student's first question.
  assert.deepEqual(await page.evaluate(() => [document.activeElement.dataset.gradeRow, document.activeElement.dataset.gradeCol]), ['6', '0']);
  await page.keyboard.down('Shift');
  await page.keyboard.press('Tab');
  await page.keyboard.up('Shift');
  assert.deepEqual(await page.evaluate(() => [document.activeElement.dataset.gradeRow, document.activeElement.dataset.gradeCol]), ['5', '9']);
  // Shift+Tab from the very first cell wraps to the last cell.
  await page.click('[data-grade-row="0"][data-grade-col="0"]');
  await page.keyboard.down('Shift');
  await page.keyboard.press('Tab');
  await page.keyboard.up('Shift');
  assert.deepEqual(await page.evaluate(() => [document.activeElement.dataset.gradeRow, document.activeElement.dataset.gradeCol]), ['29', '9']);
  const rowTotal = await page.$eval('.grading-grid tbody tr:nth-child(6) .total-cell', (el) => el.textContent.trim());
  assert.equal(rowTotal, '10');

  if (process.env.SCREENSHOT_DIR) {
    await page.keyboard.type('ja');
    await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/gradebook-grading.png` });
  }

  // 6. "Last, First" name order from Settings applies to the grid.
  await page.evaluate(async () => {
    const { appSettings } = await import('/src/lib/app-settings.svelte.ts');
    appSettings.setGradebookNameOrder('last-first');
  });
  assert.equal((await names())[1], 'Baker, Janie');

  // 7. Student view edits keep hand-fixed casing and set the known-by name.
  await page.evaluate(() => [...document.querySelectorAll('.view-switch button')].find((b) => b.textContent === 'Overview').click());
  await page.evaluate(() => [...document.querySelectorAll('.student-link strong')].find((el) => el.textContent === 'Chen, Liam').click());
  await page.waitForSelector('.student-edit-grid');
  const field = async (label, value) => {
    const handle = await page.evaluateHandle((label) => [...document.querySelectorAll('.student-edit-grid label')]
      .find((el) => el.querySelector('span')?.textContent === label).querySelector('input'), label);
    await handle.evaluate((input, value) => {
      input.value = value;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, value);
  };
  await field('Last', 'McChen');
  await field('Known by', 'Li');
  assert.equal(await page.$eval('.student-picker-trigger strong', (el) => el.textContent), 'McChen, Li');
  if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/gradebook-student.png` });

  assert.deepEqual(errors, []);
  console.log('gradebook browser tests passed');
} finally {
  await browser?.close();
  await server.close();
}
