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
  const expectedDialogs = [];
  page.on('dialog', (dialog) => {
    const expected = expectedDialogs.shift();
    if (expected && expected.test(dialog.message())) { void dialog.accept(); return; }
    errors.push(`Unexpected dialog: ${dialog.message()}`);
    void dialog.dismiss();
  });
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
  const names = () => page.$$eval('.grading-grid tbody th.grading-name', (cells) => cells.map((c) => c.textContent.trim()));
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
  // Focus the first cell (currently behind frozen columns), then wrap to the last.
  await page.$eval('[data-grade-row="0"][data-grade-col="0"]', input => input.focus({ preventScroll: true }));
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

  // 5b. Total-only entry: one score column, a live percent, and Tab moving down the column.
  // Clicks go through element handles: a click that opens a confirm dialog would block page.evaluate.
  const clickIn = async (selector, label) => {
    const handle = await page.evaluateHandle((selector, label) => [...document.querySelectorAll(selector)].find((b) => b.textContent === label), selector, label);
    await handle.asElement().click();
    await handle.dispose();
  };
  const clickButton = (label) => clickIn('.grading-actions button', label);
  await clickButton('Total only');
  assert.equal(await page.$$eval('.grading-grid thead th', (ths) => ths.length), 4);
  assert.equal(await page.$eval('[data-grade-row="5"][data-grade-col="0"]', (el) => el.value), '10');
  await page.click('[data-grade-row="2"][data-grade-col="0"]');
  await page.keyboard.type('15');
  await page.keyboard.press('Tab');
  assert.deepEqual(await page.evaluate(() => [document.activeElement.dataset.gradeRow, document.activeElement.dataset.gradeCol]), ['3', '0']);
  assert.equal(await page.$eval('.grading-grid tbody tr:nth-child(3) .total-cell', (el) => el.textContent.trim()), '75%');
  if (process.env.SCREENSHOT_DIR) {
    await page.evaluate(() => document.querySelector('.grading-view').scrollIntoView());
    await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/gradebook-total-only.png` });
  }
  // A typed total that disagrees with the question scores replaces them.
  await page.click('[data-grade-row="0"][data-grade-col="0"]');
  await page.keyboard.type('7');
  await page.keyboard.press('Enter');
  const joe = await page.evaluate(async () => {
    const { gradebook } = await import('/src/lib/gradebook.svelte.ts');
    const score = gradebook.scoreFor(gradebook.assessments[0].id, 's0');
    return { points: score.points, questionScores: score.questionScores ?? null, mode: gradebook.assessments[0].gradingMode };
  });
  assert.deepEqual(joe, { points: 7, questionScores: null, mode: 'total' });
  // Back to By question: the teacher is warned that some students only have totals.
  expectedDialogs.push(/students have totals without question scores/);
  await clickButton('By question');
  assert.equal(expectedDialogs.length, 0);
  assert.equal(await page.$$eval('.grading-grid thead th', (ths) => ths.length), 13);
  assert.equal(await page.$eval('.grading-grid tbody tr:nth-child(3) .total-cell', (el) => el.textContent.trim()), '15');

  // 5c. External assessments: one graded as a total, one with question marks.
  await page.evaluate(() => [...document.querySelectorAll('.view-switch button')].find((b) => b.textContent === 'Overview').click());
  await page.click('.external-assessment summary');
  const external = async (name, outOf, marks) => {
    await page.type('.external-form input[aria-label="External assessment name"]', name);
    if (outOf) await page.type('.external-form input[aria-label="Out of"]', outOf);
    if (marks) await page.type('.external-form input[aria-label="Question marks"]', marks);
    await page.click('.external-form button[type="submit"]');
    await page.waitForSelector('.grading-grid');
  };
  await external('Paper Lab', '25');
  assert.equal(await page.$eval('.grading-view h2', (el) => el.textContent), 'Paper Lab');
  assert.equal(await page.$$eval('.grading-grid thead th', (ths) => ths.length), 4);
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('.grading-actions button')].find((b) => b.textContent === 'By question').disabled), true);
  await page.click('[data-grade-row="0"][data-grade-col="0"]');
  await page.keyboard.type('20');
  await page.keyboard.press('Enter');
  assert.equal(await page.$eval('.grading-grid tbody tr:nth-child(1) .total-cell', (el) => el.textContent.trim()), '80%');
  await page.evaluate(() => [...document.querySelectorAll('.view-switch button')].find((b) => b.textContent === 'Overview').click());
  if (!(await page.$eval('.external-assessment', (el) => el.open))) await page.click('.external-assessment summary');
  await external('Paper Quiz', '', '2, 3, 5');
  assert.equal(await page.$$eval('.grading-grid thead th', (ths) => ths.length), 6);
  assert.match(await page.$eval('.grading-view .panel-header span', (el) => el.textContent), /10 pts/);
  await page.evaluate(() => [...document.querySelectorAll('.view-switch button')].find((b) => b.textContent === 'Overview').click());
  const listed = await page.$$eval('.assessment-item small', (els) => els.map((el) => el.textContent));
  assert.equal(listed.filter((text) => text.startsWith('External · ')).length, 2);
  if (process.env.SCREENSHOT_DIR) {
    if (!(await page.$eval('.external-assessment', (el) => el.open))) await page.click('.external-assessment summary');
    await page.evaluate(() => document.querySelector('.external-assessment').scrollIntoView({ block: 'center' }));
    await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/gradebook-external.png` });
  }
  // 5d. Edit and remove assessments from the grading screen.
  const openAssessment = async (name) => {
    await page.evaluate(() => [...document.querySelectorAll('.view-switch button')].find((b) => b.textContent === 'Overview').click());
    await page.evaluate((name) => [...document.querySelectorAll('.assessment-item span')].find((el) => el.textContent === name).click(), name);
    await page.evaluate(() => [...document.querySelectorAll('.view-switch button')].find((b) => b.textContent === 'Grading').click());
    await page.waitForSelector('.grading-grid');
  };
  const editField = async (label, value) => {
    await page.evaluate((label, value) => {
      const field = [...document.querySelectorAll('.assessment-edit label')].find((el) => el.querySelector('span').textContent === label).querySelector('input, select');
      field.value = value;
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
    }, label, value);
  };
  // A mistyped external total is fixed, and the percent follows.
  await openAssessment('Paper Lab');
  await clickButton('Edit');
  await page.waitForSelector('.assessment-edit');
  await editField('Out of', '40');
  await editField('Name', 'Paper Lab A');
  if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/gradebook-edit.png` });
  await page.click('.assessment-edit button[type="submit"]');
  await page.waitForFunction(() => !document.querySelector('.assessment-edit'));
  assert.equal(await page.$eval('.grading-view h2', (el) => el.textContent), 'Paper Lab A');
  assert.equal(await page.$eval('.grading-grid tbody tr:nth-child(1) .total-cell', (el) => el.textContent.trim()), '50%');
  // Removing a question that has a score asks first, then re-tallies.
  await openAssessment('Paper Quiz');
  await page.click('[data-grade-row="0"][data-grade-col="0"]');
  await page.keyboard.type('2');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.type('4');
  await page.keyboard.press('Enter');
  assert.equal(await page.$eval('.grading-grid tbody tr:nth-child(1) .total-cell', (el) => el.textContent.trim()), '6');
  await clickButton('Edit');
  await editField('Question marks (optional)', '2, 3');
  expectedDialogs.push(/1 student has scores on questions this removes/);
  await page.click('.assessment-edit button[type="submit"]');
  await page.waitForFunction(() => !document.querySelector('.assessment-edit'));
  assert.equal(expectedDialogs.length, 0);
  assert.equal(await page.$$eval('.grading-grid thead th', (ths) => ths.length), 5);
  assert.equal(await page.$eval('.grading-grid tbody tr:nth-child(1) .total-cell', (el) => el.textContent.trim()), '2');
  // Remove from Gradebook deletes the assessment and its scores after confirming.
  await clickButton('Edit');
  expectedDialogs.push(/Remove "Paper Quiz".*\n\nThis deletes 1 recorded score/s);
  await clickIn('.assessment-edit button', 'Remove from Gradebook');
  await page.waitForFunction(() => ![...document.querySelectorAll('.assessment-item span')].some((el) => el.textContent === 'Paper Quiz'));
  assert.equal(expectedDialogs.length, 0);
  const leftovers = await page.evaluate(async () => {
    const { gradebook } = await import('/src/lib/gradebook.svelte.ts');
    const names = gradebook.assessments.map((assessment) => assessment.savedTestName);
    return { names, orphanScores: gradebook.scores.filter((score) => !gradebook.assessments.some((assessment) => assessment.id === score.assessmentId)).length };
  });
  assert.deepEqual(leftovers, { names: ['Unit 1 Test 40S', 'Paper Lab A'], orphanScores: 0 });

  await page.evaluate(() => [...document.querySelectorAll('.assessment-item span')].find((el) => el.textContent === 'Unit 1 Test 40S').click());
  await page.evaluate(() => [...document.querySelectorAll('.view-switch button')].find((b) => b.textContent === 'Grading').click());

  // 6. "Last, First" name order from Settings applies to the grid.
  await page.click('button[aria-label="Settings"]');
  const moreTab = await page.evaluateHandle(() => [...document.querySelectorAll('[role="dialog"] button')]
    .find((b) => b.querySelector('span')?.textContent === 'More'));
  await moreTab.asElement().click();
  const nameOrder = await page.evaluateHandle(() => [...document.querySelectorAll('.gradebook-name-order')]
    .find((el) => el.querySelector('span').textContent === 'Student names').querySelector('select'));
  await nameOrder.asElement().select('last-first');
  await page.click('button[title="Close settings"]');
  assert.equal((await names())[1], 'Baker, Janie');

  // 7. Student view edits keep hand-fixed casing and set the known-by name.
  await page.evaluate(() => [...document.querySelectorAll('.view-switch button')].find((b) => b.textContent === 'Overview').click());
  await page.evaluate(() => [...document.querySelectorAll('.student-table-link')].find((el) => el.textContent.trim() === 'Chen, Liam').click());
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
