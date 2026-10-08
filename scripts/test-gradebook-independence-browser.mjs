// Synthetic legacy banks exercise migration and teacher workflows in an isolated browser.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';

const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
let browser;
try {
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 950 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.evaluateOnNewDocument(() => {
    if (localStorage.getItem('fixture-ready')) return;
    localStorage.setItem('fixture-ready', 'true');
    const section = (id, name) => ({ id, name, linkedClassId: 'biology', createdAt: 1, updatedAt: 1 });
    const student = { id: 'student', firstName: 'Ada', lastName: 'Lee', active: true, createdAt: 1, updatedAt: 1 };
    const grades = id => ({ sections: [section(id, id === 'a' ? 'Period A' : 'Period B')], students: [student],
      enrollments: [{ id: `enrollment-${id}`, sectionId: id, studentId: 'student', active: true, createdAt: 1, updatedAt: 1 }] });
    localStorage.setItem('tg-bank-workspaces-v1', JSON.stringify(['default', 'other'].map(id => ({ id, name: id, gitRepoId: id, createdAt: 1, updatedAt: 1 }))));
    localStorage.setItem('tg-active-bank-id-v1', 'default');
    localStorage.setItem('tg-tutorial-done-v1', '1');
    localStorage.setItem('tg-gradebook-experimental-enabled-v1', 'true');
    localStorage.setItem('tg-gradebook-v1', JSON.stringify(grades('a')));
    localStorage.setItem('tg-bank:other:tg-gradebook-v1', JSON.stringify(grades('b')));
    localStorage.setItem('math-test-bank-v2', '[]');
    localStorage.setItem('tg-test-library-v1', '[]');
    // Reproduce the old bug: the global catalog was copied into both banks.
    const copiedClasses = [{ id: 'biology', name: 'Biology', units: [] }, { id: 'physics', name: 'Physics', units: [] }];
    localStorage.setItem('tg-class-catalog-v1', JSON.stringify(copiedClasses));
    localStorage.setItem('math-test-custom-classes-v1', JSON.stringify(copiedClasses));
    localStorage.setItem('tg-bank:other:math-test-custom-classes-v1', JSON.stringify(copiedClasses));
    localStorage.setItem('tg-bank:other:math-test-bank-v2', JSON.stringify([{ id: 'source-q', classId: 'biology', body: 'Cell question', points: 9, tags: [], createdAt: 1 }]));
    localStorage.setItem('tg-bank:other:tg-test-library-v1', JSON.stringify([{ id: 'other-test', name: 'Other bank test', classId: 'chemistry', createdAt: 1, updatedAt: 1,
      config: { title: 'Chemistry', selectedIds: ['source-q'], bonusQuestionIds: [] } }]));
  });
  await page.goto(`${server.resolvedUrls.local[0]}#/gradebook`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => localStorage.getItem('tg-gradebook-independent-v1') && document.querySelectorAll('.section-item').length === 2);
  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('tg-gradebook-v1')));
  const click = async text => {
    await page.evaluate(text => {
      const button = [...document.querySelectorAll('button')].find(button => button.offsetParent !== null && button.textContent.trim() === text);
      if (!button) throw new Error(`Missing button ${text}`);
      button.click();
    }, text);
  };
  const dialog = answer => page.once('dialog', dialog => answer === null ? dialog.dismiss() : dialog.accept(answer));
  const settle = () => new Promise(resolve => setTimeout(resolve, 100));
  assert.equal((await stored()).sections.length, 2);
  assert.equal(await page.$eval('[aria-label="Course"] option[value="biology"]', option => option.textContent), 'Biology');

  // A class can be created in Gradebook before any test or question exists.
  dialog('Astronomy');
  await click('＋ New class');
  await page.waitForFunction(() => [...document.querySelectorAll('[aria-label="Course"] option')].some(option => option.textContent === 'Astronomy'));
  const courseId = await page.$eval('[aria-label="Course"]', select => select.value);
  await page.type('[aria-label="Section name"]', 'Period C');
  await click('Add Section');
  await page.waitForFunction(() => document.querySelector('.section-header h1')?.textContent === 'Period C');
  assert.equal((await stored()).sections.find(section => section.name === 'Period C').linkedClassId, courseId);

  // Section metadata is editable, and the course filter can be overridden.
  const fill = (label, value) => page.$eval(`[aria-label="${label}"]`, (input, value) => { input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); }, value);
  await click('Edit section');
  await fill('Edit section name', 'Evening Astronomy');
  await fill('Edit section term', 'Fall');
  await click('Save section');
  await page.waitForFunction(() => document.querySelector('.section-header h1')?.textContent === 'Evening Astronomy');
  assert.equal((await stored()).sections.find(section => section.name === 'Evening Astronomy').termLabel, 'Fall');
  await page.evaluate(() => {
    const input = [...document.querySelectorAll('label')].find(label => label.textContent.includes('Show tests from all courses')).querySelector('input');
    input.click();
  });
  await page.waitForFunction(() => document.querySelector('[aria-label="Saved test"] option')?.textContent === 'Other bank test');
  await click('Add to Gradebook');
  await page.waitForSelector('.grading-grid');
  assert.equal((await stored()).assessments[0].totalPoints, 9, 'cross-bank tests use source-bank questions');

  // Bank switches and reloads retain the same gradebook and class names.
  const beforeSwitch = await stored();
  await page.evaluate(async () => {
    const { bankWorkspaces } = await import('/src/lib/bank-workspaces.svelte.ts');
    await bankWorkspaces.switchBank('other');
  });
  assert.deepEqual(await stored(), beforeSwitch);
  assert.equal(await page.$eval('[aria-label="Course"] option[value="biology"]', option => option.textContent), 'Biology');
  await page.reload({ waitUntil: 'networkidle0' });
  assert.deepEqual(await stored(), beforeSwitch, 'reload does not re-import legacy records');

  // Weighted finals use the same mark totals as category summaries: 10/10 + 0/90 = 10%.
  await page.evaluate(async () => {
    const { gradebook } = await import('/src/lib/gradebook.svelte.ts');
    const assessment = totalPoints => gradebook.addExternalAssessment({ sectionId: 'a', name: `Test /${totalPoints}`, testType: 'test', totalPoints });
    for (const [total, points] of [[10, 10], [90, 0]]) {
      const test = assessment(total);
      gradebook.updateScore({ sectionId: 'a', assessmentId: test.id, studentId: 'student', points, state: 'normal' });
    }
    gradebook.flush();
    [...document.querySelectorAll('.section-item')].find(button => button.querySelector('span').textContent === 'Period A').click();
  });
  await page.waitForFunction(() => document.querySelector('.score-grid tbody tr')?.textContent.includes('10%'));
  assert.match(await page.$eval('.score-grid tbody tr', row => row.textContent), /10%/);
  await page.$eval('.score-grid tbody tr .student-table-link', button => button.click());
  await page.waitForSelector('.student-view');
  assert.match(await page.$eval('.student-view', el => el.textContent), /10%/);
  assert.ok(await page.evaluate(() => [...document.querySelectorAll('label')].some(label => label.textContent.includes('Active across all sections'))));
  dialog();
  await click('Remove from this section');
  await settle();
  const remaining = await stored();
  assert.equal(remaining.students.length, 1);
  assert.equal(remaining.enrollments.length, 1);
  assert.equal(remaining.enrollments[0].sectionId, 'b');
  assert.equal(remaining.scores.length, 0);
  await page.reload({ waitUntil: 'networkidle0' });
  assert.equal((await stored()).enrollments.length, 1, 'removed enrollment is not resurrected');

  // Bank curriculum stays local while Gradebook retains the shared catalog.
  await page.evaluate(() => { window.location.hash = '/bank'; });
  await page.waitForSelector('.class-name-btn');
  const bankClassNames = () => page.$$eval('.class-name-btn', buttons => buttons.map(button => button.textContent.trim()));
  assert.deepEqual(await bankClassNames(), ['Biology'], 'other bank does not show Gradebook-only Astronomy');
  dialog('Geology');
  await click('＋ New class');
  await page.waitForFunction(() => [...document.querySelectorAll('.class-name-btn')].some(button => button.textContent.trim() === 'Geology'));
  await page.evaluate(async () => {
    const { bankWorkspaces } = await import('/src/lib/bank-workspaces.svelte.ts');
    await bankWorkspaces.switchBank('default');
  });
  await page.waitForFunction(() => document.querySelectorAll('.class-name-btn').length === 0);
  assert.deepEqual(await bankClassNames(), [], 'default bank does not inherit other bank classes');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('math-test-custom-classes-v1')).length), 2, 'legacy definitions are preserved while unrelated sidebar rows are hidden');
  // Explicitly adding an existing global course links it to this bank without duplicating it.
  dialog('Astronomy');
  await click('＋ New class');
  await page.waitForFunction(() => document.querySelector('.class-name-btn')?.textContent.trim() === 'Astronomy');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('math-test-custom-classes-v1')).find(cls => cls.name === 'Astronomy').id), courseId);
  await page.reload({ waitUntil: 'networkidle0' });
  assert.deepEqual(await bankClassNames(), ['Astronomy']);
  await page.evaluate(async () => {
    const { bankWorkspaces } = await import('/src/lib/bank-workspaces.svelte.ts');
    await bankWorkspaces.switchBank('other');
  });
  await page.waitForFunction(() => document.querySelectorAll('.class-name-btn').length === 2);
  assert.deepEqual(await bankClassNames(), ['Biology', 'Geology']);
  await page.reload({ waitUntil: 'networkidle0' });
  assert.deepEqual(await bankClassNames(), ['Biology', 'Geology']);
  await page.evaluate(() => { window.location.hash = '/gradebook'; });
  await page.waitForSelector('[aria-label="Course"]');
  const sharedCourses = await page.$$eval('[aria-label="Course"] option', options => options.map(option => option.textContent));
  for (const name of ['Biology', 'Physics', 'Astronomy', 'Geology']) assert.ok(sharedCourses.includes(name), `Gradebook retains ${name}`);
  assert.deepEqual(errors, []);
  console.log('gradebook independence browser tests passed');
} finally {
  await browser?.close();
  await server.close();
}
