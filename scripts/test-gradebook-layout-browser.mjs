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
    if (localStorage.getItem('layout-fixture')) return;
    localStorage.setItem('layout-fixture', 'true');
    localStorage.setItem('tg-tutorial-done-v1', '1');
    localStorage.setItem('tg-gradebook-experimental-enabled-v1', 'true');
    localStorage.setItem('tg-gradebook-v1', JSON.stringify({
      sections: [{ id: 'section', name: 'Period 1' }],
      students: [{ id: 'ada', firstName: 'Ada', lastName: 'Lee', knownBy: 'Addie', email: 'ada@example.com', active: true }],
      enrollments: [{ id: 'enrolled', sectionId: 'section', studentId: 'ada', active: true }],
    }));
  });
  await page.goto(`${server.resolvedUrls.local[0]}#/gradebook`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.detail-rail .student-form');
  assert.equal(await page.$('.setup-grid .student-form'), null, 'roster controls live in the right pane');
  await page.evaluate(async () => {
    const { gradebook } = await import('/src/lib/gradebook.svelte.ts');
    gradebook.addExternalAssessment({ sectionId: 'section', name: 'Quiz A', testType: 'quiz', totalPoints: 10, questionPoints: [4, 6] });
    gradebook.addExternalAssessment({ sectionId: 'section', name: 'Quiz B', testType: 'quiz', totalPoints: 12, questionPoints: [3, 9] });
  });
  const click = text => page.evaluate(text => {
    const button = [...document.querySelectorAll('button')].find(button => button.offsetParent !== null && button.textContent.trim() === text);
    if (!button) throw new Error(`Missing button ${text}`);
    button.click();
  }, text);
  const settle = () => new Promise(resolve => setTimeout(resolve, 100));
  const cellStyle = await page.$eval('.score-cell', el => ({ shadow: getComputedStyle(el).boxShadow, radius: getComputedStyle(el).borderRadius }));
  assert.deepEqual(cellStyle, { shadow: 'none', radius: '0px' });
  const beforeHover = await page.$eval('.score-cell', el => getComputedStyle(el.closest('td')).backgroundColor);
  await page.hover('.score-cell');
  await new Promise(resolve => setTimeout(resolve, 200));
  assert.equal(await page.$eval('.score-cell', el => el.matches(':hover')), true, 'score button receives hover');
  assert.notEqual(await page.$eval('.score-cell', el => getComputedStyle(el.closest('td')).backgroundColor), beforeHover);
  assert.ok(await page.$eval('.score-cell', button => Math.abs(button.getBoundingClientRect().width - button.closest('td').clientWidth) <= 1), 'button fills the cell');
  assert.equal(await page.$$eval('.score-grid tbody small', els => els.length), 0, 'cells have one line');

  // CSV imports add IDs to existing names and preserve existing fields and scores.
  await page.evaluate(async () => {
    const { gradebook } = await import('/src/lib/gradebook.svelte.ts');
    const assessment = gradebook.assessments[0];
    gradebook.updateScore({ sectionId: 'section', assessmentId: assessment.id, studentId: 'ada', state: 'normal', points: 8 });
    gradebook.flush();
    const file = new File(['Names,ID\nAda Lee,000123\nGrace Hopper,00456'], 'roster.csv', { type: 'text/csv' });
    const transfer = new DataTransfer(); transfer.items.add(file);
    const input = document.querySelector('.roster-panel input[type="file"]');
    input.files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForFunction(() => document.querySelector('.import-result')?.textContent.includes('1 created'));
  const importResult = await page.evaluate(async () => {
    const { gradebook } = await import('/src/lib/gradebook.svelte.ts');
    const { parseRosterImport } = await import('/src/lib/gradebook-roster-import.ts');
    gradebook.importRoster('section', parseRosterImport('Name,Student #\nAddie Lee,000123\nGrace Hopper,00456').students);
    return { students: gradebook.snapshot().students, score: gradebook.scores[0].points, enrollments: gradebook.enrollments.length };
  });
  assert.equal(importResult.students.length, 2);
  assert.equal(importResult.enrollments, 2);
  const ada = importResult.students.find(student => student.id === 'ada');
  assert.equal(ada.sisId, '000123'); assert.equal(ada.firstName, 'Ada'); assert.equal(ada.knownBy, 'Addie');
  assert.equal(ada.email, 'ada@example.com'); assert.equal(importResult.score, 8);

  // Clicking headings sorts the overview without changing grading-row order.
  await page.evaluate(async () => {
    const { gradebook } = await import('/src/lib/gradebook.svelte.ts');
    const grace = gradebook.students.find(student => student.firstName === 'Grace');
    const quiz = gradebook.assessments.find(assessment => assessment.savedTestName === 'Quiz A');
    gradebook.updateScore({ sectionId: 'section', assessmentId: quiz.id, studentId: grace.id, state: 'normal', points: 5 });
    gradebook.addStudent({ firstName: 'Zoe', lastName: 'Brown', sectionId: 'section' });
  });
  const sortHeading = text => page.evaluate(text => [...document.querySelectorAll('.overview-column')].find(button => button.textContent.startsWith(text)).click(), text);
  const names = () => page.$$eval('.score-grid .student-table-link', buttons => buttons.map(button => button.textContent.trim()));
  await sortHeading('Quiz A');
  assert.deepEqual(await names(), ['Addie Lee', 'Grace Hopper', 'Zoe Brown']);
  await sortHeading('Quiz A');
  assert.deepEqual(await names(), ['Grace Hopper', 'Addie Lee', 'Zoe Brown']);
  await sortHeading('Total');
  assert.deepEqual(await names(), ['Addie Lee', 'Grace Hopper', 'Zoe Brown']);
  await sortHeading('Student');
  assert.deepEqual(await names(), ['Zoe Brown', 'Grace Hopper', 'Addie Lee']);
  await sortHeading('Student');
  assert.deepEqual(await names(), ['Addie Lee', 'Grace Hopper', 'Zoe Brown']);
  await click('Percentage');
  assert.match(await page.$eval('.score-grid tbody tr:first-child', row => row.textContent), /80%/);
  assert.ok(await page.evaluate(() => [...document.querySelectorAll('.score-grid .score-cell')].some(button => button.textContent.trim() === '50%')));
  await click('Points');
  assert.ok(await page.evaluate(() => [...document.querySelectorAll('.score-grid .score-cell')].some(button => button.textContent.trim() === '5')));
  assert.equal(await page.$$eval('.score-grid tbody small', els => els.length), 0);

  await click('Grading');
  await page.waitForSelector('.grading-assessment-list');
  assert.equal(await page.$('.detail-rail .score-entry-list'), null);
  const selectAssessment = name => page.evaluate(name => [...document.querySelectorAll('.grading-assessment-list .assessment-item')].find(button => button.querySelector('span').textContent === name).click(), name);
  await selectAssessment('Quiz B');
  await page.waitForFunction(() => document.querySelector('.grading-view h2').textContent === 'Quiz B');
  await selectAssessment('Quiz A');
  await page.waitForFunction(() => document.querySelector('.grading-view h2').textContent === 'Quiz A');
  assert.equal(await page.$('.grading-assessment-list .question-snapshots'), null);
  await selectAssessment('Quiz A');
  await page.waitForSelector('.grading-assessment-list .question-snapshots');
  assert.equal(await page.$$eval('.grading-assessment-list .snapshot-row', rows => rows.length), 2);
  assert.equal(await page.$eval('.grading-grid thead th:nth-last-child(2)', th => th.textContent), 'Total/10');
  const stateWidth = await page.$eval('.grading-grid select', select => {
    const style = getComputedStyle(select); const ctx = document.createElement('canvas').getContext('2d'); ctx.font = `${style.fontSize} ${style.fontFamily}`;
    return { available: select.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight), needed: Math.max(...[...select.options].map(option => ctx.measureText(option.textContent).width)) };
  });
  assert.ok(stateWidth.available >= stateWidth.needed, 'every state label fits without cropping');
  assert.ok(await page.$eval('.grading-grid select', select => select.getBoundingClientRect().right <= select.closest('.grading-grid-wrap').getBoundingClientRect().right), 'state control stays fully visible in the grid');
  await selectAssessment('Quiz B');
  await page.waitForFunction(() => document.querySelector('.grading-view h2').textContent === 'Quiz B');
  assert.equal(await page.$('.grading-assessment-list .question-snapshots'), null);

  await click('Student');
  await page.waitForSelector('.student-search');
  await page.type('.student-search', '00456');
  await page.waitForFunction(() => document.querySelectorAll('.student-picker-menu button').length === 1);
  assert.match(await page.$eval('.student-picker-menu', el => el.textContent), /Grace Hopper/);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('.student-picker-trigger strong').textContent === 'Grace Hopper');
  await page.$eval('.student-search', input => { input.value = 'addie'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.waitForFunction(() => document.querySelector('.student-picker-menu button')?.textContent.includes('Addie Lee'));
  await page.$eval('.student-picker-menu button', button => button.click());
  await page.waitForFunction(() => document.querySelector('.student-picker-trigger strong').textContent === 'Addie Lee');
  // Matches in another class show that class, and selection changes the section too.
  await page.evaluate(async () => {
    const { gradebook } = await import('/src/lib/gradebook.svelte.ts');
    const { customClasses } = await import('/src/lib/custom-classes.svelte.ts');
    const course = customClasses.add('Biology');
    const section = gradebook.createSection({ name: 'Period 2 Biology', linkedClassId: course.id });
    gradebook.addStudent({ firstName: 'Addie', lastName: 'Lee', sisId: '09009', sectionId: section.id });
    const input = document.querySelector('.student-search'); input.value = 'addie'; input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForFunction(() => document.querySelectorAll('.student-picker-menu button').length === 2);
  assert.match(await page.$eval('.student-picker-menu', menu => menu.textContent), /Addie Lee \(Biology\)/);
  await page.evaluate(() => [...document.querySelectorAll('.student-picker-menu button')].find(button => button.textContent.includes('(Biology)')).click());
  await page.waitForFunction(() => document.querySelector('.section-header h1')?.textContent === 'Period 2 Biology');
  await page.$eval('.student-search', input => { input.value = '000123'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.waitForFunction(() => document.querySelector('.student-picker-menu button')?.textContent.includes('(Period 1)'));
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('.section-header h1')?.textContent === 'Period 1');
  if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/gradebook-student-layout.png` });
  await click('Overview');
  if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/gradebook-overview-layout.png` });
  await click('Grading');
  if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/gradebook-grading-layout.png` });
  await page.setViewport({ width: 900, height: 950 });
  await click('Overview');
  await page.waitForFunction(() => document.querySelectorAll('.student-form').length === 0);
  assert.equal(await page.$$eval('.student-form', forms => forms.length), 0, 'roster controls stay hidden with the right pane');
  assert.deepEqual(errors, []);
  console.log('gradebook layout and roster browser tests passed');
} finally {
  await browser?.close(); await server.close();
}
