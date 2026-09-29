// Gradebook: click a question's heading in the grading grid to change what it is out of.
// From a saved test: Gradebook only, or Gradebook and test. External: just Save.
// Synthetic data in an isolated browser.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';

const QUESTIONS = [2, 3, 5].map((points, i) => ({ id: `q${i + 1}`, body: `Question ${i + 1}`, points, tags: [], createdAt: 1 }));
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
  await page.evaluateOnNewDocument((questions) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('tg-tutorial-done-v1', '1');
    localStorage.setItem('tg-gradebook-experimental-enabled-v1', 'true');
    localStorage.setItem('math-test-custom-classes-v1', JSON.stringify([{ id: 'pc40', name: 'Pre-Calculus 40S', units: [] }]));
    localStorage.setItem('tg-test-library-v1', JSON.stringify([{
      id: 't1', name: 'Unit 1 Test', classId: 'pc40', unitId: null, testType: 'test', createdAt: 1, updatedAt: 1,
      config: { title: 'Pre-Calc', subtitle: 'Unit 1', selectedIds: questions.map((q) => q.id), bonusQuestionIds: [] },
      questionSnapshots: questions,
    }]));
    localStorage.setItem('tg-gradebook-v1', JSON.stringify({
      version: 1,
      sections: [{ id: 'sec', name: 'Period 1', linkedClassId: 'pc40', termLabel: null }],
      students: [{ id: 's0', firstName: 'Ada', lastName: 'Adams' }, { id: 's1', firstName: 'Ben', lastName: 'Baker' }],
      enrollments: [{ id: 'e0', sectionId: 'sec', studentId: 's0' }, { id: 'e1', sectionId: 'sec', studentId: 's1' }],
      assessments: [], scores: [], settings: {},
    }));
  }, QUESTIONS);
  await page.goto(`${server.resolvedUrls.local[0]}#/gradebook`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.assessment-form select');
  await page.click('.assessment-form button[type="submit"]');
  await page.waitForSelector('.grading-grid');

  const settle = () => new Promise((resolve) => setTimeout(resolve, 200));
  const score = async (student, q, value) => {
    await page.$eval(`input[aria-label="Q${q} score for ${student}"]`, (el, v) => {
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, String(value));
  };
  const book = () => page.evaluate(async () => {
    const { gradebook } = await import('/src/lib/gradebook.svelte.ts');
    return gradebook.assessments.map((a) => ({
      source: a.source ?? 'saved-test', points: a.questionSnapshots.map((s) => s.points), total: a.totalPoints,
      scores: gradebook.scores.filter((s) => s.assessmentId === a.id).map((s) => [s.studentId, s.points, (s.questionScores ?? []).map((q) => q.points)]).sort(),
    }));
  });
  const savedTest = () => page.evaluate(async () => {
    const { testLibrary } = await import('/src/lib/test-library.svelte.ts');
    const t = testLibrary.get('t1');
    return { snapshot: t.questionSnapshots.map((q) => q.points), own: (t.config.ownQuestions ?? []).map((q) => [q.id, q.points]) };
  });
  const headings = () => page.$$eval('.grading-grid thead .question-head', (bs) => bs.map((b) => b.textContent.replace(/\s+/g, ' ').trim()));
  const openQuestion = async (n) => { await page.click(`.question-head[aria-label="Change what question ${n} is out of"]`); await page.waitForSelector('.points-dialog'); };
  const dialog = () => page.$eval('.points-dialog', (d) => ({
    title: d.querySelector('h3').textContent,
    value: d.querySelector('.points-field input').value,
    cap: d.querySelector('.points-cap')?.textContent.trim() ?? null,
    buttons: [...d.querySelectorAll('.points-actions button')].map((b) => b.textContent.trim()),
  }));
  const setValue = (v) => page.$eval('.points-field input', (el, value) => { el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); }, v);
  const press = (label) => page.evaluate((l) => [...document.querySelectorAll('.points-actions button')].find((b) => b.textContent.trim() === l).click(), label);
  const toast = () => page.waitForFunction(() => document.querySelector('.folder-toast')?.textContent ?? '').then((h) => h.jsonValue());

  // Scores: Ada 2 + 3 + 4 = 9, Ben 1 + 1 + 5 = 7.
  for (const [student, marks] of [['Ada Adams', [2, 3, 4]], ['Ben Baker', [1, 1, 5]]]) {
    for (const [i, value] of marks.entries()) await score(student, i + 1, value);
  }
  await settle();
  assert.deepEqual(await headings(), ['Q1 / 2', 'Q2 / 3', 'Q3 / 5']);

  // 1. A saved test's question: the dialog offers Gradebook only or Gradebook and test.
  await openQuestion(2);
  assert.deepEqual(await dialog(), { title: 'Question 2', value: '3', cap: null, buttons: ['Cancel', 'Gradebook only', 'Gradebook and test'] });
  // Escape closes without changing anything.
  await page.keyboard.press('Escape');
  await settle();
  assert.equal(await page.$('.points-dialog'), null);
  assert.deepEqual((await book())[0].points, [2, 3, 5]);

  // 2. Skip question 2 in the Gradebook only: out of 0, scores above it lowered to 0.
  await openQuestion(2);
  await setValue('0');
  assert.equal((await dialog()).cap, 'Lower 2 students’ scores above 0 to 0');
  if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/gradebook-points.png` });
  await press('Gradebook only');
  assert.equal(await toast(), 'Question 2 is now out of 0 in the Gradebook.');
  assert.deepEqual((await book())[0], { source: 'saved-test', points: [2, 0, 5], total: 7, scores: [['s0', 6, [2, 0, 4]], ['s1', 6, [1, 0, 5]]] });
  assert.deepEqual(await savedTest(), { snapshot: [2, 3, 5], own: [] }, 'the saved test is unchanged');
  assert.deepEqual(await headings(), ['Q1 / 2', 'Q2 / 0', 'Q3 / 5']);

  // 3. Question 3 out of 4 in the Gradebook and the test, keeping scores above it.
  await openQuestion(3);
  await setValue('4');
  assert.equal((await dialog()).cap, 'Lower 1 student’s score above 4 to 4');
  await page.$eval('.points-cap input', (el) => el.click());
  await press('Gradebook and test');
  assert.equal(await toast(), 'Question 3 is now out of 4 in the Gradebook and in “Unit 1 Test”.');
  assert.deepEqual((await book())[0], { source: 'saved-test', points: [2, 0, 4], total: 6, scores: [['s0', 6, [2, 0, 4]], ['s1', 6, [1, 0, 5]]] });
  assert.deepEqual(await savedTest(), { snapshot: [2, 3, 4], own: [['q3', 4]] });

  // 4. A value that is not 0 or more is refused.
  await openQuestion(1);
  await setValue('-1');
  await press('Gradebook only');
  assert.match(await page.$eval('.points-error', (el) => el.textContent), /0 or more/);
  await press('Cancel');

  // 5. With the test open in Build, the change goes through Build's editor.
  const open = await page.evaluate(async () => {
    const { testEditor } = await import('/src/lib/test-editor.svelte.ts');
    const { testLibrary: library } = await import('/src/lib/test-library.svelte.ts');
    const { defaultTestConfig } = await import('/src/lib/types.ts');
    // The seed holds only the fields the Gradebook reads; Build needs a full test.
    const seeded = library.get('t1');
    library.update('t1', { ...defaultTestConfig(), ...seeded.config }, { questionSnapshots: seeded.questionSnapshots });
    await testEditor.open('t1');
    const problem = testEditor.setSavedTestQuestionPoints('t1', 'q1', 1);
    await testEditor.flush();
    const { testLibrary } = await import('/src/lib/test-library.svelte.ts');
    return { problem, own: testEditor.config.ownQuestions.map((q) => [q.id, q.points]), snapshot: testLibrary.get('t1').questionSnapshots.map((q) => q.points) };
  });
  assert.deepEqual(open, { problem: '', own: [['q1', 1], ['q3', 4]], snapshot: [1, 3, 4] });

  // 6. An external assessment has no test: only Save.
  await page.evaluate(() => [...document.querySelectorAll('.view-switch button')].find((b) => b.textContent.trim() === 'Overview').click());
  await page.waitForSelector('.external-assessment summary');
  await page.click('.external-assessment summary');
  await page.type('.external-form input[aria-label="External assessment name"]', 'Paper quiz');
  await page.type('.external-form input[aria-label="Question marks"]', '4, 6');
  await page.click('.external-form button[type="submit"]');
  await page.waitForFunction(() => document.querySelectorAll('.grading-grid thead .question-head').length === 2);
  await openQuestion(2);
  assert.deepEqual((await dialog()).buttons, ['Cancel', 'Save']);
  await setValue('3');
  await page.keyboard.press('Enter');
  await settle();
  assert.equal(await page.$('.points-dialog'), null, 'Enter saves an external assessment');
  const external = (await book()).find((a) => a.source === 'external');
  assert.deepEqual([external.points, external.total], [[4, 3], 7]);

  assert.deepEqual(errors, []);
  console.log('Gradebook question points passed: heading opens the dialog, Escape, out of 0 with lowered scores (Gradebook only), Gradebook and test (keeping scores), invalid value, test open in Build, external Save and Enter.');
} finally {
  await browser?.close();
  await server.close();
}
