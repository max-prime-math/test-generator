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
    if (localStorage.getItem('improvements-fixture')) return;
    localStorage.setItem('improvements-fixture', '1');
    localStorage.setItem('tg-tutorial-done-v1', '1');
    localStorage.setItem('tg-gradebook-experimental-enabled-v1', 'true');
    localStorage.setItem('tg-gradebook-v1', JSON.stringify({ sections: [{ id: 'section', name: 'Period 1' }],
      students: [{ id: 'ada', firstName: 'Ada', lastName: 'Lee', sisId: '001', active: true }, { id: 'grace', firstName: 'Grace', lastName: 'Hopper', active: true }],
      enrollments: ['ada', 'grace'].map(id => ({ id: `enroll-${id}`, sectionId: 'section', studentId: id, active: true })),
    }));
  });
  await page.goto(`${server.resolvedUrls.local[0]}#/gradebook`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.score-grid');
  const click = text => page.evaluate(text => {
    const button = [...document.querySelectorAll('button')].find(button => button.getClientRects().length && button.textContent.trim() === text);
    if (!button) throw new Error(`Missing button ${text}`);
    button.click();
  }, text);
  await page.evaluate(async () => {
    const { gradebook } = await import('/src/lib/gradebook.svelte.ts');
    const a = gradebook.addExternalAssessment({ sectionId: 'section', name: 'Test A', testType: 'test', totalPoints: 10, questionPoints: [4, 6] });
    const b = gradebook.addExternalAssessment({ sectionId: 'section', name: 'Test B', testType: 'test', totalPoints: 20 });
    gradebook.updateScore({ sectionId: 'section', assessmentId: a.id, studentId: 'ada', points: 8, state: 'normal' });
    gradebook.updateScore({ sectionId: 'section', assessmentId: b.id, studentId: 'ada', points: null, state: 'missing' });
    gradebook.flush();
  });
  const adaFinal = () => page.evaluate(() => [...document.querySelectorAll('.score-grid tbody tr')].find(row => row.textContent.includes('Ada Lee')).querySelector('.total-cell').textContent.trim());
  assert.equal(await adaFinal(), '80%');
  await page.select('[aria-label="Missing grades"]', 'zero');
  assert.equal(await adaFinal(), '26.7%');
  await page.reload({ waitUntil: 'networkidle0' });
  assert.equal(await page.$eval('[aria-label="Missing grades"]', select => select.value), 'zero');
  assert.equal(await adaFinal(), '26.7%');
  await page.select('[aria-label="Missing grades"]', 'exclude');

  // Preview flags collisions within the file and against the existing roster.
  const importFile = () => page.evaluate(() => {
    const file = new File(['Name,Student ID,Email\nAda Lee,001,ada@example.com\nWrong Person,001,\nGrace Hopper,002,\nSam New,003,\nSam New,004,'], 'roster.csv', { type: 'text/csv' });
    const transfer = new DataTransfer(); transfer.items.add(file);
    const input = document.querySelector('.roster-panel input[type="file"]');
    input.files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await importFile(); await page.waitForSelector('.roster-preview-dialog[open]');
  assert.match(await page.$eval('.roster-preview-dialog', dialog => dialog.textContent), /2 conflicts/);
  if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/roster-preview.png` });
  await click('Cancel');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('tg-gradebook-v1')).students.length), 2);
  await importFile(); await page.waitForSelector('.roster-preview-dialog[open]');
  await click('Import 3 students');
  await page.waitForFunction(() => document.querySelector('.import-result')?.textContent.includes('1 created'));
  const imported = await page.evaluate(() => JSON.parse(localStorage.getItem('tg-gradebook-v1')));
  assert.equal(imported.students.length, 3);
  assert.equal(imported.students.find(student => student.id === 'ada').sisId, '001');
  assert.equal(imported.students.find(student => student.id === 'ada').email, 'ada@example.com');
  assert.equal(imported.students.find(student => student.id === 'grace').sisId, '002');

  await page.evaluate(() => [...document.querySelectorAll('.assessment-list .assessment-item')].find(button => button.querySelector('span').textContent === 'Test A').click());
  await click('Grading');
  await page.waitForSelector('[data-grade-row="0"][data-grade-col="0"]');
  const paste = text => page.$eval('[data-grade-row="0"][data-grade-col="0"]', (input, text) => {
    input.focus(); const transfer = new DataTransfer(); transfer.setData('text/plain', text);
    input.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }));
  }, text);
  const scores = () => page.evaluate(async () => {
    const { gradebook } = await import('/src/lib/gradebook.svelte.ts');
    return gradebook.snapshot().scores.filter(score => score.assessmentId === gradebook.assessments.find(item => item.savedTestName === 'Test A').id).map(score => ({ studentId: score.studentId, points: score.points, questions: score.questionScores })).sort((a, b) => a.studentId.localeCompare(b.studentId));
  });
  const before = await scores();
  await paste('1\t2\n3\t4\n');
  assert.equal((await scores()).find(score => score.studentId === 'grace').points, 3);
  assert.equal((await scores()).find(score => score.studentId === 'ada').points, 7);
  await click('Undo'); assert.deepEqual(await scores(), before);
  await click('Redo');
  const after = await scores();
  await paste('5\tbad'); assert.deepEqual(await scores(), after, 'invalid blocks do not partially write');
  assert.match(await page.$eval('.paste-message', el => el.textContent), /Invalid score/);
  await paste('1\t2\t3'); assert.deepEqual(await scores(), after, 'overflow is rejected');
  await page.click('[data-grade-row="0"][data-grade-col="0"]');
  await page.keyboard.type('12');
  await page.keyboard.down('Control'); await page.keyboard.press('z'); await page.keyboard.up('Control');
  assert.deepEqual(await scores(), after, 'typing is undone as one edit');
  await page.keyboard.down('Control'); await page.keyboard.down('Shift'); await page.keyboard.press('z'); await page.keyboard.up('Shift'); await page.keyboard.up('Control');
  assert.equal((await scores()).find(score => score.studentId === 'grace').questions[0].points, 12);
  await click('Undo');
  await page.evaluate(() => [...document.querySelectorAll('.grading-assessment-list .assessment-item')].find(button => button.querySelector('span').textContent === 'Test B').click());
  await page.waitForFunction(() => document.querySelector('.grading-grid').classList.contains('total-only'));
  const totalBefore = await page.evaluate(async () => { const { gradebook } = await import('/src/lib/gradebook.svelte.ts'); return gradebook.snapshot().scores.filter(score => score.assessmentId === gradebook.assessments[1].id); });
  await paste('5\nMissing');
  await page.select('[aria-label="Score state for Grace Hopper"]', 'excused');
  await click('Undo');
  assert.equal(await page.$eval('[aria-label="Score state for Grace Hopper"]', select => select.value), 'normal');
  await click('Undo');
  assert.deepEqual(await page.evaluate(async () => { const { gradebook } = await import('/src/lib/gradebook.svelte.ts'); return gradebook.snapshot().scores.filter(score => score.assessmentId === gradebook.assessments[1].id); }), totalBefore);
  await click('Overview');
  // Compare the exported grid's final grade with the live calculation.
  const csv = await page.evaluate(async () => {
    const { gradebook } = await import('/src/lib/gradebook.svelte.ts');
    const { gradebookOverviewCsv } = await import('/src/lib/gradebook-backup.ts');
    return gradebookOverviewCsv(gradebook.snapshot(), 'section', { studentIds: ['grace', 'ada', 'unused'], assessmentIds: gradebook.assessments.map(item => item.id), display: 'points' });
  });
  assert.match(csv, /Student,Student ID/);
  assert.match(csv, /Ada Lee,001,7,Missing,70%/);
  assert.equal(csv.split('\n').length, 3);
  await page.evaluate(() => {
    const create = URL.createObjectURL.bind(URL);
    URL.createObjectURL = blob => { blob.text().then(text => { window.exportedOverviewCsv = text; }); return create(blob); };
    HTMLAnchorElement.prototype.click = function () {};
  });
  await click('Export Overview CSV');
  await page.waitForFunction(() => window.exportedOverviewCsv?.includes('Final grade (%)'));
  assert.match(await page.evaluate(() => window.exportedOverviewCsv), /Ada Lee,001,/);
  assert.match(await page.evaluate(() => window.exportedOverviewCsv), /70%/);

  if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/overview.png` });
  for (const width of [900, 390]) {
    await page.setViewport({ width, height: 950 });
    await page.waitForSelector('.drawer-open');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no horizontal page overflow on small screens');
    assert.equal(await page.$('.detail-rail'), null);
    await page.click('.drawer-open');
    await page.waitForSelector('.detail-rail.drawer');
    assert.ok(await page.$('.detail-rail .student-form'));
    assert.ok(await page.$('.detail-rail .section-removal'));
    if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/drawer-${width}.png` });
    await page.keyboard.down('Shift'); await page.keyboard.press('Tab'); await page.keyboard.up('Shift');
    assert.equal(await page.evaluate(() => document.querySelector('.detail-rail').contains(document.activeElement)), true, 'drawer traps keyboard focus');
    await page.keyboard.press('Escape');
    assert.equal(await page.$('.detail-rail'), null);
    assert.equal(await page.$eval('.drawer-open', element => element === document.activeElement), true, 'closing restores focus');
  }
  assert.deepEqual(errors, []);
  console.log('Gradebook improvements passed: Missing policy, roster preview/conflicts, grouped paste and undo/redo, export, and mobile drawer.');
} finally { await browser?.close(); await server.close(); }
