import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';

const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
let browser;
try {
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 950 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.evaluateOnNewDocument(() => {
    if (localStorage.getItem('assessment-edit-fixture')) return;
    localStorage.setItem('assessment-edit-fixture', '1');
    localStorage.setItem('tg-tutorial-done-v1', '1');
    localStorage.setItem('tg-gradebook-experimental-enabled-v1', 'true');
    const date = value => new Date(`${value}T00:00:00`).getTime();
    localStorage.setItem('tg-gradebook-v1', JSON.stringify({
      sections: [{ id: 'section', name: 'Period 1', categoryWeights: { test: 80, quiz: 20 } }],
      students: [{ id: 'ada', firstName: 'Ada', lastName: 'Lee', active: true }],
      enrollments: [{ id: 'enroll', sectionId: 'section', studentId: 'ada', active: true }],
      assessments: [
        { id: 'test', savedTestName: 'Unit Test', testType: 'test', administeredAt: date('2026-10-03'), createdAt: 1 },
        { id: 'quiz', savedTestName: 'Quick Quiz', testType: 'quiz', administeredAt: date('2026-10-01'), createdAt: 2 },
        { id: 'assignment', savedTestName: 'Homework', testType: 'assignment', administeredAt: date('2026-10-02'), createdAt: 3 },
        { id: 'tie', savedTestName: 'Second Homework', testType: 'assignment', administeredAt: date('2026-10-02'), createdAt: 4 },
      ].map(item => ({ ...item, sectionId: 'section', savedTestId: '', source: 'external', totalPoints: 10, questionSnapshots: [] })),
      scores: [
        { id: 'test-score', assessmentId: 'test', points: 10 },
        { id: 'quiz-score', assessmentId: 'quiz', points: 0 },
      ].map(item => ({ ...item, sectionId: 'section', studentId: 'ada', state: 'normal' })),
    }));
  });
  await page.goto(`${server.resolvedUrls.local[0]}#/gradebook`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.score-grid');
  const order = selector => page.$$eval(selector, elements => elements.map(element => element.textContent.trim()));
  const overviewOrder = () => order('.assessment-list .assessment-item > span');
  const click = text => page.evaluate(text => {
    const button = [...document.querySelectorAll('button')].find(button => button.getClientRects().length && button.textContent.trim() === text);
    if (!button) throw new Error(`Missing button: ${text}`);
    button.click();
  }, text);
  const changeDate = (name, value) => page.$eval(`[aria-label="Assessment date for ${name}"]`, (input, value) => {
    input.value = value;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
  const finalGrade = () => page.$eval('.score-grid tbody tr .total-cell', cell => cell.textContent.trim());
  assert.deepEqual(await overviewOrder(), ['Quick Quiz', 'Homework', 'Second Homework', 'Unit Test']);
  assert.equal(await finalGrade(), '80%');
  await page.select('[aria-label="Assessment type for Unit Test"]', 'quiz');
  assert.equal(await finalGrade(), '50%', 'changing type immediately recalculates weighted grades');
  await changeDate('Unit Test', '2026-09-30');
  assert.deepEqual(await overviewOrder(), ['Unit Test', 'Quick Quiz', 'Homework', 'Second Homework']);
  await changeDate('Unit Test', '');
  assert.equal(await page.$eval('[aria-label="Assessment date for Unit Test"]', input => input.value), '2026-09-30', 'clearing the date preserves the previous date');
  await page.evaluate(() => [...document.querySelectorAll('.assessment-list .assessment-item')].find(button => button.querySelector('span').textContent === 'Unit Test').click());
  await click('Grading');
  await page.waitForSelector('.grading-view');
  assert.equal(await page.$eval('[aria-label="Assessment type for Unit Test"]', select => select.value), 'quiz');
  await page.select('[aria-label="Assessment type for Unit Test"]', 'test');
  await changeDate('Unit Test', '2026-10-04');
  assert.equal(await page.$eval('.grading-view h2', heading => heading.textContent), 'Unit Test', 'date reordering keeps the selected assessment');
  assert.deepEqual(await order('.grading-assessment-list .assessment-item > span'), ['Quick Quiz', 'Homework', 'Second Homework', 'Unit Test']);
  // An open edit form stays consistent with immediate changes in the header.
  await click('Edit');
  await page.select('[aria-label="Assessment type for Unit Test"]', 'quiz');
  await changeDate('Unit Test', '2026-10-05');
  assert.equal(await page.$eval('.assessment-edit select', select => select.value), 'quiz');
  assert.equal(await page.$eval('.assessment-edit input[type="date"]', input => input.value), '2026-10-05');
  await click('Save');
  const beforeReload = await page.evaluate(async () => {
    const { gradebook } = await import('/src/lib/gradebook.svelte.ts');
    return gradebook.snapshot().scores;
  });
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('.score-grid');
  assert.equal(await page.$eval('[aria-label="Assessment type for Unit Test"]', select => select.value), 'quiz');
  assert.equal(await page.$eval('[aria-label="Assessment date for Unit Test"]', input => input.value), '2026-10-05');
  assert.deepEqual(await overviewOrder(), ['Quick Quiz', 'Homework', 'Second Homework', 'Unit Test']);
  assert.equal(await finalGrade(), '50%');
  assert.deepEqual(await page.evaluate(async () => {
    const { gradebook } = await import('/src/lib/gradebook.svelte.ts');
    return gradebook.snapshot().scores;
  }), beforeReload, 'metadata edits preserve scores');
  assert.deepEqual(errors, []);
  console.log('Assessment date/type editing, chronological order, category calculations, and persistence passed.');
} finally {
  await browser?.close();
  await server.close();
}
