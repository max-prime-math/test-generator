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
    if (window !== window.top || localStorage.getItem('drop-fixture')) return;
    localStorage.setItem('drop-fixture', '1');
    localStorage.setItem('tg-tutorial-done-v1', '1');
    localStorage.setItem('tg-gradebook-experimental-enabled-v1', 'true');
    localStorage.setItem('tg-gradebook-v1', JSON.stringify({
      sections: [{ id: 's', name: 'Period 1', missingGradePolicy: 'zero', categoryWeights: { quiz: 100, test: 0, assignment: 0, exam: 0, formative: 0, worksheet: 0, other: 0 } }],
      students: ['Ada', 'Ben', 'Jo'].map(firstName => ({ id: firstName.toLowerCase(), firstName, lastName: 'Student', active: true })),
      enrollments: ['ada', 'ben', 'jo'].map(id => ({ id: `e-${id}`, sectionId: 's', studentId: id, active: true })),
      assessments: [10, 20, 10].map((totalPoints, i) => ({ id: `q${i + 1}`, sectionId: 's', savedTestId: '', source: 'external', savedTestName: `Quiz ${i + 1}`, testType: 'quiz', totalPoints, gradingMode: 'total', administeredAt: Date.UTC(2026, 8, i + 1) })),
      scores: [
        ...[2, 12, 8].map((points, i) => ({ id: `ada-${i}`, sectionId: 's', assessmentId: `q${i + 1}`, studentId: 'ada', state: 'normal', points })),
        ...[9, 5, null].map((points, i) => ({ id: `ben-${i}`, sectionId: 's', assessmentId: `q${i + 1}`, studentId: 'ben', state: i === 2 ? 'missing' : 'normal', points })),
        { id: 'jo', sectionId: 's', assessmentId: 'q1', studentId: 'jo', state: 'normal', points: 7 },
      ],
    }));
  });
  const base = server.resolvedUrls.local[0];
  await page.goto(`${base}#/gradebook`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.score-grid');
  const click = text => page.evaluate(text => {
    const button = [...document.querySelectorAll('button')].find(button => button.checkVisibility() && button.textContent.trim() === text);
    if (!button) throw new Error(`Missing button: ${text}`);
    button.click();
  }, text);
  const setCount = value => page.$eval('[aria-label="Drop lowest quiz scores"]', (input, value) => { input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); }, value);
  const finals = () => page.$$eval('.score-grid tbody .student-total-link', cells => cells.map(cell => cell.textContent.trim().replace(/\.0%$/, '%')));
  const saved = () => page.evaluate(async () => { const { gradebook } = await import('/src/lib/gradebook.svelte.ts'); return gradebook.snapshot(); });
  const before = await saved();
  assert.deepEqual(await finals(), ['55%', '35%', '70%']);
  await page.click('[data-tool="weights"] > summary');
  await setCount('1');
  await page.waitForSelector('.policy-preview');
  assert.match(await page.$eval('.policy-preview', node => node.textContent), /55% → 66.7%/);
  assert.deepEqual(await finals(), ['55%', '35%', '70%'], 'preview never saves grades');
  // Browser save failure rolls the policy back and retains its input and recovery draft.
  await page.evaluate(() => {
    window.originalStorageSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) { if (key === 'tg-gradebook-v1') throw new DOMException('Storage full', 'QuotaExceededError'); return window.originalStorageSetItem.call(this, key, value); };
  });
  await click('Save drop policy');
  await page.waitForFunction(() => document.querySelector('.drop-policy [role="alert"]')?.textContent.includes('Could not save'));
  assert.deepEqual(await finals(), ['55%', '35%', '70%']);
  assert.deepEqual((await saved()).sections[0].droppedScorePolicy, {});
  assert.equal(await page.$eval('[aria-label="Drop lowest quiz scores"]', input => input.value), '1');
  await page.evaluate(() => Storage.prototype.setItem = window.originalStorageSetItem);
  await click('Save drop policy');
  await page.waitForFunction(() => document.querySelector('.score-grid .student-total-link')?.textContent.trim() === '66.7%');
  assert.deepEqual(await finals(), ['66.7%', '46.7%', '70%']);
  assert.equal(await page.$$eval('.score-grid tbody .dropped-score-label', labels => labels.length), 2);
  assert.deepEqual((await saved()).scores, before.scores);
  assert.deepEqual((await saved()).assessments, before.assessments);
  await page.reload({ waitUntil: 'networkidle0' });
  assert.deepEqual(await finals(), ['66.7%', '46.7%', '70%']);
  await click('Restore previous policy');
  assert.deepEqual(await finals(), ['55%', '35%', '70%']);
  await click('Restore previous policy');
  assert.deepEqual(await finals(), ['66.7%', '46.7%', '70%']);
  await page.select('[aria-label="Overview filter"]', 'risk');
  assert.deepEqual(await page.$$eval('.score-grid .student-table-link', cells => cells.map(cell => cell.textContent.trim())), ['Ben Student'], 'grade filter uses adjusted totals');
  await page.select('[aria-label="Overview filter"]', 'all');
  await page.evaluate(() => {
    const create = URL.createObjectURL.bind(URL);
    URL.createObjectURL = blob => { blob.text().then(text => window.lastExport = text); return create(blob); };
    HTMLAnchorElement.prototype.click = function() {};
  });
  await click('Export Overview CSV');
  await page.waitForFunction(() => window.lastExport?.includes('(Dropped)'));
  assert.match(await page.evaluate(() => window.lastExport), /Ada Student,,2 \(Dropped\),12,8,66.7%/);
  await click('Print student reports');
  await page.waitForSelector('dialog[open] .report-preview');
  assert.match(await page.$eval('.report-preview', frame => frame.srcdoc), /Dropped/);
  assert.match(await page.$eval('.report-preview', frame => frame.srcdoc), /66.7%/);
  await page.keyboard.press('Escape');

  // Dropped marks remain editable in Grading and automatically change inclusion when raised.
  await page.click('.score-grid tbody tr:first-child .score-cell');
  await page.waitForSelector('[data-grade-row="0"][data-grade-col="0"]');
  assert.match(await page.$eval('.grading-grid tbody tr:first-child', row => row.textContent), /Dropped/);
  await page.$eval('[data-grade-row="0"][data-grade-col="0"]', input => {
    input.value = '10'; input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); input.blur();
  });
  await page.waitForFunction(() => !document.querySelector('.grading-grid tbody tr:first-child .dropped-score-label'));
  await page.evaluate(async () => { const { gradebook } = await import('/src/lib/gradebook.svelte.ts'); gradebook.setDroppedScorePolicy('s', { quiz: 2 }, { quiz: 1 }); });
  await click('Undo');
  await page.evaluate(async () => { const { gradebook } = await import('/src/lib/gradebook.svelte.ts'); gradebook.restoreDroppedScorePolicy('s', { quiz: 2 }); });
  await click('Overview');
  await page.click('.score-grid tbody tr:first-child .student-table-link');
  await page.waitForSelector('.student-tools');
  assert.match(await page.$eval('.category-total', total => total.textContent), /20\/30.*1 dropped/s);
  assert.equal(await page.$$eval('.student-assessment-row .dropped-score-label', labels => labels.length), 1);
  await page.click('.student-assessment-row');
  await page.waitForSelector('.student-assessment-detail');
  assert.equal(await page.$('.grading-grid'), null);
  await click('Overview');
  // Unfinished policy edits survive a hidden rail and reload, including invalid input.
  await setCount('1.5');
  assert.equal(await page.$eval('.drop-policy button[type="submit"]', button => button.disabled), true);
  await setCount('2');
  await page.click('[title="Hide section tools"]');
  await page.click('.view-utilities .drawer-open');
  assert.equal(await page.$eval('[aria-label="Drop lowest quiz scores"]', input => input.value), '2');
  await page.reload({ waitUntil: 'networkidle0' });
  assert.match(await page.$eval('.drop-policy', policy => policy.textContent), /Recovered/);
  assert.deepEqual(await finals(), ['66.7%', '46.7%', '70%']);
  // A competing policy is kept; draft input survives until deliberately reloaded.
  await page.evaluate(async () => { const { gradebook } = await import('/src/lib/gradebook.svelte.ts'); gradebook.setDroppedScorePolicy('s', { quiz: 3 }, { quiz: 1 }); });
  await page.waitForFunction(() => document.querySelector('.drop-policy').textContent.includes('changed elsewhere'));
  assert.equal(await page.$eval('[aria-label="Drop lowest quiz scores"]', input => input.value), '2');
  assert.equal(await page.$eval('.drop-policy button[type="submit"]', button => button.disabled), true);
  await click('Discard draft and reload');
  await setCount('1'); await click('Save drop policy');
  await click('Turn off all drops'); await click('Save drop policy');
  assert.deepEqual(await finals(), ['55%', '35%', '70%']);
  assert.equal(await page.$$eval('.score-grid tbody .dropped-score-label', labels => labels.length), 0);
  await click('Restore previous policy');
  assert.deepEqual(await finals(), ['66.7%', '46.7%', '70%']);
  const roundTrip = await page.evaluate(async () => {
    const { gradebook } = await import('/src/lib/gradebook.svelte.ts');
    const { stringifyGradebookBackup, parseGradebookBackup } = await import('/src/lib/gradebook-backup.ts');
    const { toEntries, fromEntries } = await import('/src/lib/gradebook-records.ts');
    return { backup: parseGradebookBackup(stringifyGradebookBackup(gradebook.snapshot())).sections[0], folder: fromEntries(toEntries(gradebook.snapshot())).sections[0] };
  });
  assert.deepEqual(roundTrip.backup.droppedScorePolicy, { quiz: 1 });
  assert.deepEqual(roundTrip.folder.droppedScorePolicy, { quiz: 1 });
  const byId = scores => scores.toSorted((a, b) => a.id.localeCompare(b.id));
  assert.deepEqual(byId((await saved()).scores), byId(before.scores), 'score edit Undo restores original marks despite policy changes');
  await page.screenshot({ path: '/tmp/testgen-dropped-scores-desktop.png' });
  await page.setViewport({ width: 390, height: 950 });
  await page.waitForFunction(() => !document.querySelector('.detail-rail'));
  await click('Review drop policy');
  await page.waitForSelector('.detail-rail.drawer .drop-policy');
  await setCount('2');
  assert.ok(await page.$eval('.detail-rail', rail => rail.scrollWidth <= rail.clientWidth + 1));
  await page.$eval('.drop-policy', panel => panel.scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: '/tmp/testgen-dropped-scores-mobile.png' });
  await page.keyboard.press('Escape');
  assert.equal(await page.$('.detail-rail'), null);
  const diagnostics = await page.evaluate(async () => {
    const { gradebook } = await import('/src/lib/gradebook.svelte.ts');
    const { calculateStudentGrade } = await import('/src/lib/gradebook-calculations.ts');
    const section = { ...gradebook.sections[0], droppedScorePolicy: { quiz: 3, test: 2 } };
    const assessments = Array.from({ length: 40 }, (_, i) => ({ ...gradebook.assessments[0], id: `perf-${i}`, testType: i % 2 ? 'quiz' : 'test' }));
    const start = performance.now();
    let dropped = 0;
    for (let i = 0; i < 120; i++) dropped += calculateStudentGrade(section, assessments, id => ({ points: (i + Number(id.slice(5))) % 11, state: 'normal' })).droppedAssessmentIds.size;
    return { students: 120, assessments: 40, dropped, calculationMs: Math.round(performance.now() - start) };
  });
  assert.equal(diagnostics.dropped, 600);
  console.log(`Dropped-score calculation diagnostics: ${JSON.stringify(diagnostics)}`);
  assert.deepEqual(errors, []);
  console.log('Dropped-score browser checks passed: preview, save failure, policy persistence/restore, grade/filter/export/report agreement, editable marks and Undo, Student details, draft/conflict recovery, backup/sync records, and mobile.');
} finally { await browser?.close(); await server.close(); }
