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
  assert.equal(await page.$('.work-area .assessment-form, .work-area .weights-grid, .work-area .student-form'), null, 'setup lives in the right pane, leaving grades central');
  assert.deepEqual(await page.$$eval('.tool-panel', panels => panels.map(panel => panel.open)), [false, false, false, false], 'setup starts collapsed');
  assert.ok(await page.$eval('.score-section', section => section.getBoundingClientRect().top < 500), 'grade overview starts in the first viewport');
  const openPanel = async key => {
    if (!await page.$eval(`[data-tool="${key}"]`, panel => panel.open)) await page.click(`[data-tool="${key}"] > summary`);
  };
  // Native disclosure keyboard behavior, retained form input, remembered layout, and restoring a hidden rail.
  const beforeLayout = await page.evaluate(() => localStorage.getItem('tg-gradebook-v1'));
  await page.focus('[data-tool="roster"] > summary');
  await page.keyboard.press('Enter');
  await page.type('.roster-panel [aria-label="First name"]', 'Draft');
  await page.click('[data-tool="roster"] > summary');
  await openPanel('roster');
  assert.equal(await page.$eval('.roster-panel [aria-label="First name"]', input => input.value), 'Draft');
  await page.click('[title="Hide section tools"]');
  assert.equal(await page.$('.detail-rail'), null);
  await page.click('.view-utilities .drawer-open');
  await page.waitForSelector('.detail-rail');
  assert.equal(await page.$eval('.roster-panel [aria-label="First name"]', input => input.value), 'Draft');
  await openPanel('weights');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('tg-gradebook-layout-v1')).overviewPanels.weights);
  assert.equal(await page.evaluate(() => localStorage.getItem('tg-gradebook-v1')), beforeLayout, 'layout changes never write Gradebook records');
  await page.reload({ waitUntil: 'networkidle0' });
  assert.deepEqual(await page.$$eval('.tool-panel', panels => panels.map(panel => panel.open)), [false, true, true, false], 'panel choices survive reload');
  await page.click('[data-tool="weights"] > summary');
  await page.click('[data-tool="roster"] > summary');
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
  assert.equal(await page.$('.overview-get-started'), null, 'setup prompt disappears once students and assessments exist');
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
  await openPanel('roster');
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
  await page.waitForSelector('.roster-preview-dialog[open]');
  await click('Import 2 students');
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
    const zoe = gradebook.addStudent({ firstName: 'Zoe', lastName: 'Brown', sectionId: 'section' });
    const otherQuiz = gradebook.assessments.find(assessment => assessment.savedTestName === 'Quiz B');
    gradebook.updateScore({ sectionId: 'section', assessmentId: otherQuiz.id, studentId: zoe.id, state: 'missing', points: null });
    gradebook.flush();
  });
  const savedGrades = await page.evaluate(() => localStorage.getItem('tg-gradebook-v1'));
  assert.equal(await page.$eval('.follow-up-actions button:first-child strong', el => el.textContent), '1');
  await page.click('.follow-up-actions button:first-child');
  await page.waitForFunction(() => document.querySelectorAll('.score-grid .student-table-link').length === 1);
  assert.match(await page.$eval('.score-grid .student-table-link', el => el.textContent), /Zoe Brown/);
  assert.equal(await page.$eval('[aria-label="Overview filter"]', select => select.value), 'missing');
  await page.click('.follow-up-actions button:last-child');
  await page.waitForFunction(() => document.querySelectorAll('.score-grid .student-table-link').length === 3);
  assert.equal(await page.$eval('[aria-label="Overview filter"]', select => select.value), 'ungraded');
  await page.select('[aria-label="Overview filter"]', 'all');
  assert.equal(await page.evaluate(() => localStorage.getItem('tg-gradebook-v1')), savedGrades, 'follow-up shortcuts only change the view');
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
  assert.equal(await page.$eval('.grading-grid thead .frozen-total', th => th.textContent), 'TotalPoints · Percent');
  const stateWidth = await page.$eval('.grading-grid select', select => {
    const style = getComputedStyle(select); const ctx = document.createElement('canvas').getContext('2d'); ctx.font = `${style.fontSize} ${style.fontFamily}`;
    return { available: select.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight), needed: Math.max(...[...select.options].map(option => ctx.measureText(option.textContent).width)) };
  });
  assert.ok(stateWidth.available >= stateWidth.needed, 'every state label fits without cropping');
  assert.ok(await page.$eval('.grading-grid select', select => select.getBoundingClientRect().right <= select.closest('.grading-grid-wrap').getBoundingClientRect().right), 'state control stays fully visible in the grid');
  await page.setViewport({ width: 2800, height: 950 });
  const ultrawide = await page.evaluate(() => {
    const gradebook = document.querySelector('.gradebook').getBoundingClientRect();
    const parent = document.querySelector('.gradebook').parentElement.getBoundingClientRect();
    const work = document.querySelector('.work-area').getBoundingClientRect();
    const content = document.querySelector('.work-content').getBoundingClientRect();
    const leftRail = document.querySelector('.section-rail').getBoundingClientRect();
    const rightRail = document.querySelector('.detail-rail').getBoundingClientRect();
    const state = document.querySelector('.grading-grid .score-state').getBoundingClientRect();
    const select = document.querySelector('.grading-grid .score-state select').getBoundingClientRect();
    return {
      gradebook: { left: gradebook.left, right: gradebook.right, width: gradebook.width },
      parent: { left: parent.left, right: parent.right },
      work: { left: work.left, right: work.right },
      content: { left: content.left, right: content.right, width: content.width },
      leftRail: { left: leftRail.left }, rightRail: { right: rightRail.right },
      stateWidth: state.width, selectWidth: select.width,
    };
  });
  assert.ok(Math.abs(ultrawide.gradebook.left - ultrawide.parent.left) <= 1 && Math.abs(ultrawide.gradebook.right - ultrawide.parent.right) <= 1, JSON.stringify(ultrawide));
  assert.ok(Math.abs(ultrawide.leftRail.left - ultrawide.parent.left) <= 1 && Math.abs(ultrawide.rightRail.right - ultrawide.parent.right) <= 1, JSON.stringify(ultrawide));
  assert.ok(ultrawide.content.width <= 1301, JSON.stringify(ultrawide));
  assert.ok(Math.abs((ultrawide.content.left + ultrawide.content.right) / 2 - (ultrawide.work.left + ultrawide.work.right) / 2) <= 1, JSON.stringify(ultrawide));
  assert.ok(ultrawide.stateWidth <= 125 && ultrawide.selectWidth <= 113, JSON.stringify(ultrawide));
  await page.setViewport({ width: 1440, height: 950 });
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
  // A compact drawer exposes the same tools at tablet and phone sizes, with predictable keyboard focus.
  for (const width of [900, 390]) {
    await page.setViewport({ width, height: 950 });
    await page.click('.view-utilities .drawer-open');
    await page.waitForSelector('.detail-rail.drawer');
    await openPanel('assessments');
    await openPanel('weights');
    assert.ok(await page.$eval('[aria-label="Saved test"]', select => select.checkVisibility()), 'saved-test controls remain available');
    assert.ok(await page.$eval('[aria-label="Missing grades"]', select => select.checkVisibility()), 'grading policy remains available');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no horizontal page overflow');
    assert.ok(await page.$eval('.detail-rail', rail => rail.scrollWidth <= rail.clientWidth + 1), 'tools fit inside the drawer');
    await page.focus('.drawer-close');
    await page.keyboard.down('Shift'); await page.keyboard.press('Tab'); await page.keyboard.up('Shift');
    assert.ok(await page.evaluate(() => document.querySelector('.detail-rail').contains(document.activeElement) && document.activeElement.checkVisibility()), 'reverse Tab stays on visible drawer controls');
    await page.focus('.drawer-close');
    for (let i = 0; i < 35; i++) {
      await page.keyboard.press('Tab');
      assert.ok(await page.evaluate(() => document.querySelector('.detail-rail').contains(document.activeElement) && document.activeElement.checkVisibility()), 'Tab stays on visible drawer controls');
    }
    if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/gradebook-tools-${width}.png` });
    await page.keyboard.press('Escape');
    assert.equal(await page.$('.detail-rail'), null);
    assert.equal(await page.$eval('.view-utilities .drawer-open', button => button === document.activeElement), true);
  }
  // On a phone, invalid input stays in the drawer; a successful add reveals score entry.
  await page.click('.view-utilities .drawer-open');
  await page.click('.external-assessment summary');
  await page.type('[aria-label="External assessment name"]', 'Exit ticket');
  await page.click('.external-form button[type="submit"]');
  await page.waitForSelector('.external-error');
  assert.equal(await page.$eval('[aria-label="External assessment name"]', input => input.value), 'Exit ticket');
  assert.ok(await page.$('.detail-rail.drawer'));
  await page.type('[aria-label="Out of"]', '10');
  await page.click('.external-form button[type="submit"]');
  await page.waitForFunction(() => !document.querySelector('.detail-rail') && document.querySelector('.grading-view h2')?.textContent === 'Exit ticket');
  assert.ok(await page.evaluate(() => document.activeElement.closest('.mobile-score-entry-list')), 'adding focuses the mobile score input');
  await click('Overview');

  // A realistic class still opens directly on grades with a long assessment list collapsed.
  await page.evaluate(async () => {
    const { gradebook } = await import('/src/lib/gradebook.svelte.ts');
    const data = gradebook.snapshot();
    const names = ['Alex Chen', 'Amir Hassan', 'Avery Clark', 'Blair Campbell', 'Cameron Diaz', 'Casey Evans', 'Charlie Fox', 'Dakota Green', 'Devon Hall', 'Drew Jackson', 'Eden King', 'Elliot Martin', 'Emery Moore', 'Finley Murphy', 'Harper Nguyen', 'Hayden Park', 'Jamie Patel', 'Jordan Reed', 'Jules Rivera', 'Kai Robinson', 'Kendall Ross', 'Lane Scott', 'Morgan Smith', 'Noel Taylor', 'Parker Thompson', 'Quinn Turner', 'Reese Walker', 'Riley White', 'Robin Young'];
    const students = names.map((name, i) => { const [firstName, lastName] = name.split(' '); return { ...data.students[0], id: `layout-${i}`, firstName, lastName, knownBy: '', sisId: `100${i}` }; });
    const assessments = Array.from({ length: 12 }, (_, i) => ({ ...data.assessments[0], id: `layout-quiz-${i}`, savedTestName: `Unit ${i + 1} check-in`, administeredAt: Date.UTC(2026, 8, i + 1) }));
    const roster = [...data.students, ...students];
    gradebook.applyFromFolder({ ...data, students: roster, enrollments: [...data.enrollments, ...students.map(student => ({ id: `enroll-${student.id}`, sectionId: 'section', studentId: student.id, active: true, createdAt: 1, updatedAt: 1 }))], assessments,
      scores: assessments.flatMap((assessment, i) => roster.filter((_, j) => (i + j) % 5).map((student, j) => ({ id: `${assessment.id}:${student.id}`, sectionId: 'section', assessmentId: assessment.id, studentId: student.id, points: (j + i) % 11, state: 'normal', createdAt: 1, updatedAt: 1 }))) });
  });
  await page.setViewport({ width: 1440, height: 950 });
  await page.waitForSelector('.overview-tools');
  for (const key of ['assessments', 'weights', 'roster', 'section']) {
    if (await page.$eval(`[data-tool="${key}"]`, panel => panel.open)) await page.click(`[data-tool="${key}"] > summary`);
  }
  await page.$eval('.work-area', area => area.scrollTop = 0);
  assert.equal(await page.$$eval('.score-grid .student-table-link', rows => rows.length), 32);
  assert.ok(await page.$eval('.score-grid tbody tr', row => row.getBoundingClientRect().top < 500), 'a full class starts in the first viewport');
  if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/gradebook-overview-class.png` });
  await page.setViewport({ width: 390, height: 950 });
  await page.waitForFunction(() => !document.querySelector('.detail-rail'));
  await page.$eval('.gradebook', area => area.scrollTop = 0);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  assert.ok(await page.$eval('.mobile-score-card', card => card.getBoundingClientRect().top < innerHeight), 'phone layout shows the first student without scrolling past setup');
  if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/gradebook-overview-phone.png` });
  assert.deepEqual(errors, []);
  console.log('gradebook layout and roster browser tests passed');
} finally {
  await browser?.close(); await server.close();
}
