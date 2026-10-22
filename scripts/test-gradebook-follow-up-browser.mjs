import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';

const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
let browser;
try {
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 1050 });
  const errors = [];
  page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
  await page.evaluateOnNewDocument(() => {
    if (window !== window.top) return;
    localStorage.setItem('tg-tutorial-done-v1', '1');
    localStorage.setItem('tg-gradebook-experimental-enabled-v1', 'true');
    if (!localStorage.getItem('tg-gradebook-v1')) {
      const now = Date.now();
      localStorage.setItem('tg-gradebook-v1', JSON.stringify({
        sections: [{ id: 'p1', name: 'Period 1', termLabel: 'Fall', categoryWeights: { test: 60, assignment: 40, quiz: 0 }, missingGradePolicy: 'exclude' }, { id: 'p2', name: 'Period 2' }],
        students: ['Ada', 'Ben', 'Jo', 'Inactive'].map(name => ({ id: name.toLowerCase(), firstName: name, lastName: 'Student', sisId: name === 'Ada' ? '001' : undefined, active: name !== 'Inactive' })),
        enrollments: ['ada', 'ben', 'jo', 'inactive'].map(id => ({ id: `e-${id}`, sectionId: 'p1', studentId: id, active: true })),
        assessments: [
          { id: 'test', sectionId: 'p1', savedTestId: '', savedTestName: 'Unit test', testType: 'test', totalPoints: 10, administeredAt: now },
          { id: 'hw', sectionId: 'p1', savedTestId: '', savedTestName: 'Practice assignment', testType: 'assignment', totalPoints: 20, administeredAt: now + 1 },
          { id: 'quiz', sectionId: 'p1', savedTestId: '', savedTestName: 'Quick quiz', testType: 'quiz', totalPoints: 5, administeredAt: now + 2 },
        ],
        scores: [
          { id: 'at', sectionId: 'p1', assessmentId: 'test', studentId: 'ada', state: 'normal', points: 8 },
          { id: 'ah', sectionId: 'p1', assessmentId: 'hw', studentId: 'ada', state: 'missing', points: null },
          { id: 'aq', sectionId: 'p1', assessmentId: 'quiz', studentId: 'ada', state: 'normal', points: 5 },
          { id: 'bt', sectionId: 'p1', assessmentId: 'test', studentId: 'ben', state: 'alternative', points: 4, alternativeTotalPoints: 5 },
          { id: 'bh', sectionId: 'p1', assessmentId: 'hw', studentId: 'ben', state: 'normal', points: 10 },
          { id: 'jh', sectionId: 'p1', assessmentId: 'hw', studentId: 'jo', state: 'incomplete', points: null },
        ],
      }));
    }
    // Exercise the real print button without opening an operating-system dialog.
    const descriptor = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow');
    Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', { configurable: true, get() {
      const target = descriptor.get.call(this);
      if (target && this.title === 'Printable gradebook reports') target.print = () => {
        window.__printedHtml = target.document.documentElement.outerHTML;
        target.dispatchEvent(new Event('afterprint'));
      };
      return target;
    } });
  });
  await page.goto(`${server.resolvedUrls.local[0]}#/gradebook`, { waitUntil: 'networkidle0' });
  const click = async (text, selector = 'button') => {
    const found = await page.evaluate((text, selector) => {
      const button = [...document.querySelectorAll(selector)].find(button => button.textContent.trim() === text && button.getClientRects().length);
      button?.click(); return !!button;
    }, text, selector);
    assert.ok(found, `Missing ${text}`);
  };
  const fill = async (selector, value) => page.$eval(selector, (element, value) => { element.value = value; element.dispatchEvent(new Event('input', { bubbles: true })); }, value);
  const rows = () => page.$$eval('.score-grid tbody .student-table-link', buttons => buttons.map(button => button.textContent.trim()));
  const data = () => page.evaluate(async () => (await import('/src/lib/gradebook.svelte.ts')).gradebook.snapshot());
  const student = async () => { await page.waitForSelector('.student-table-link'); await click('Ada Student', '.student-table-link'); await page.waitForSelector('.student-notes'); };
  const notes = async () => (await data()).studentNotes ?? [];
  const noteButton = async (id, text) => click(text, `.note[data-note-id="${id}"] button`);
  const previewText = async () => {
    const frame = await (await page.$('.report-preview')).contentFrame();
    await frame.waitForSelector('.student-report');
    return frame.$eval('body', body => body.innerText);
  };
  await page.waitForSelector('.score-grid');
  assert.equal((await rows()).length, 4);
  const originalScores = JSON.stringify((await data()).scores);
  await page.select('[aria-label="Overview filter"]', 'missing');
  assert.deepEqual(await rows(), ['Ada Student']);
  await page.click('.overview-filters summary');
  await page.select('[aria-label="Filter assessment category"]', 'assignment');
  assert.equal(await page.$$eval('.score-grid thead th', elements => elements.length), 3);
  await fill('[aria-label="Filter course grade below"]', '50');
  assert.deepEqual(await rows(), [], 'Ungraded is not treated as zero and missing follows the section policy');
  await fill('[aria-label="Filter course grade below"]', '');
  await fill('[aria-label="Saved filter name"]', 'Missing assignments');
  await click('Save as new filter');
  const savedId = (await data()).savedFilters[0].id;
  await page.reload({ waitUntil: 'networkidle0' });
  assert.deepEqual(await rows(), ['Ada Student']);
  assert.equal(await page.$eval('[aria-label="Overview filter"]', element => element.value), savedId);
  await student();
  await fill('[aria-label="Student note"]', 'Teacher-only: call home about a private concern.');
  await click('Save note');
  const privateNote = (await notes())[0];
  await fill('[aria-label="Student note"]', 'Please complete the practice assignment.');
  await page.click('.student-notes input[type="checkbox"]');
  await click('Save note');
  const sharedNote = (await notes()).find(note => note.includeInReports);
  await noteButton(sharedNote.id, 'Edit note');
  await fill('[aria-label="Student note"]', 'Good progress. Please complete the practice assignment.');
  await click('Save note changes');
  assert.equal((await notes()).find(note => note.id === sharedNote.id).previous.text, sharedNote.text);
  await noteButton(sharedNote.id, 'Undo last edit');
  assert.equal((await notes()).find(note => note.id === sharedNote.id).text, sharedNote.text);
  await noteButton(sharedNote.id, 'Undo last edit');
  await noteButton(sharedNote.id, 'Move note to Trash');
  await page.reload({ waitUntil: 'networkidle0' }); await student();
  await page.click('.student-notes details summary');
  await click('Restore note');
  assert.equal((await notes()).find(note => note.id === sharedNote.id).trashedAt, undefined);
  await page.click('[aria-label="Student note"]');
  await page.keyboard.type('A note draft to finish tomorrow.');
  await page.reload({ waitUntil: 'networkidle0' }); await student();
  assert.equal(await page.$eval('[aria-label="Student note"]', element => element.value), 'A note draft to finish tomorrow.');
  await fill('[aria-label="Student note"]', '');
  // A failed browser save keeps the editor input and leaves saved notes intact.
  await fill('[aria-label="Student note"]', 'Keep this input when browser storage is full.');
  await page.evaluate(() => {
    window.__originalStorageWrite = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === 'tg-gradebook-v1') throw new DOMException('Test quota reached', 'QuotaExceededError');
      return window.__originalStorageWrite.call(this, key, value);
    };
  });
  await click('Save note');
  assert.match(await page.$eval('.student-notes [role="alert"]', element => element.textContent), /Could not save/);
  assert.equal((await notes()).length, 2, 'A failed note save is rolled back');
  assert.equal(await page.$eval('[aria-label="Student note"]', element => element.value), 'Keep this input when browser storage is full.');
  await page.evaluate(() => Storage.prototype.setItem = window.__originalStorageWrite);
  await fill('[aria-label="Student note"]', '');
  assert.equal(JSON.stringify((await data()).scores), originalScores, 'Notes and filters leave assessment scores unchanged');
  await click("Print this student's report");
  await page.waitForSelector('dialog[aria-label="Gradebook reports"][open]');
  let text = await previewText();
  assert.match(text, /Ada Student/); assert.match(text, /80%/); assert.match(text, /Good progress/);
  assert.ok(!text.includes(privateNote.text) && !text.includes('Ben Student'));
  await page.select('[aria-label="Report type"]', 'missing');
  text = await previewText();
  assert.match(text, /Practice assignment/); assert.ok(!text.includes('Unit test') && !text.includes('Quick quiz'));
  await page.click('[aria-label="Gradebook reports"] button.primary');
  await page.waitForFunction(() => !!window.__printedHtml);
  assert.ok(!(await page.evaluate(() => window.__printedHtml)).includes(privateNote.text));
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('dialog[aria-label="Gradebook reports"]'));
  await click('Overview', '.view-switch button');
  await click('Print student reports');
  await page.waitForSelector('.report-preview');
  assert.equal(await page.$$eval('[aria-label="Preview report student"] option', options => options.length), 1, 'Batch reports follow the filtered roster');
  assert.ok(!(await previewText()).includes('Unit test'), 'Batch reports follow the selected assessment category');
  await click('Close', '[aria-label="Gradebook reports"] button');
  await page.select('[aria-label="Overview filter"]', 'all');
  await click('Print student reports');
  await page.waitForSelector('.report-preview');
  assert.equal(await page.$$eval('[aria-label="Preview report student"] option', options => options.length), 3, 'Inactive students are omitted from batch reports');
  await page.select('[aria-label="Report type"]', 'missing');
  assert.equal(await page.$$eval('[aria-label="Preview report student"] option', options => options.length), 1);
  await page.evaluate(() => [...document.querySelectorAll('.report-controls label')].find(label => label.textContent.includes('Include Incomplete')).querySelector('input').click());
  assert.equal(await page.$$eval('[aria-label="Preview report student"] option', options => options.length), 2);
  await page.evaluate(() => [...document.querySelectorAll('.report-controls label')].find(label => label.textContent.includes('Include Ungraded')).querySelector('input').click());
  assert.equal(await page.$$eval('[aria-label="Preview report student"] option', options => options.length), 3);
  await page.screenshot({ path: '/tmp/testgen-gradebook-report-desktop.png', fullPage: true });
  await page.setViewport({ width: 390, height: 844 });
  await page.screenshot({ path: '/tmp/testgen-gradebook-report-mobile.png', fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await click('Close', '[aria-label="Gradebook reports"] button');
  await page.setViewport({ width: 1500, height: 1050 });
  await page.select('[aria-label="Overview filter"]', savedId);
  await page.click('.overview-filters summary');
  await fill('[aria-label="Saved filter name"]', 'Follow-up assignments');
  await click('Update saved filter');
  assert.equal((await data()).savedFilters[0].name, 'Follow-up assignments');
  await click('Undo filter update');
  assert.equal((await data()).savedFilters[0].name, 'Missing assignments');
  await click('Move filter to Trash');
  await page.reload({ waitUntil: 'networkidle0' });
  await page.evaluate(() => [...document.querySelectorAll('.overview-filters details')].find(details => details.textContent.includes('Restore filter')).open = true);
  await click('Restore filter');
  await page.select('[aria-label="Overview filter"]', savedId);
  assert.deepEqual(await rows(), ['Ada Student']);
  const durable = await page.evaluate(async () => {
    const { gradebook } = await import('/src/lib/gradebook.svelte.ts');
    const { parseGradebookBackup, stringifyGradebookBackup } = await import('/src/lib/gradebook-backup.ts');
    const { fromEntries, toEntries } = await import('/src/lib/gradebook-records.ts');
    const snapshot = gradebook.snapshot();
    return { backup: parseGradebookBackup(stringifyGradebookBackup(snapshot)), folder: fromEntries(toEntries(snapshot)) };
  });
  assert.equal(durable.backup.studentNotes.length, 2); assert.equal(durable.folder.studentNotes.length, 2);
  assert.equal(durable.backup.savedFilters[0].trashedAt, undefined);
  assert.equal(JSON.stringify((await data()).scores), originalScores);
  await page.screenshot({ path: '/tmp/testgen-gradebook-filters.png', fullPage: true });
  const printDocument = await page.evaluate(async () => {
    const { gradebook } = await import('/src/lib/gradebook.svelte.ts');
    const { buildGradebookReports, gradebookReportsHtml } = await import('/src/lib/gradebook-reports.ts');
    return gradebookReportsHtml(buildGradebookReports(gradebook.snapshot(), { sectionId: 'p1', studentIds: ['ada', 'ben', 'jo'], kind: 'progress', includeIncomplete: false, includeUngraded: false, includeNotes: true, includeInactive: false, generatedAt: Date.now() }));
  });
  const paper = await browser.newPage();
  await paper.setContent(printDocument, { waitUntil: 'load' });
  const pdf = await paper.pdf({ path: '/tmp/testgen-gradebook-progress.pdf', format: 'Letter', printBackground: true });
  assert.equal((Buffer.from(pdf).toString('latin1').match(/\/Type\s*\/Page\b/g) ?? []).length, 3, 'Each short student report prints on its own page');
  await paper.close();
  await student();
  await noteButton(privateNote.id, 'Edit note');
  await fill('[aria-label="Student note"]', 'My pending edit');
  await page.evaluate(async id => {
    const { gradebook } = await import('/src/lib/gradebook.svelte.ts');
    const remote = gradebook.snapshot();
    remote.studentNotes = remote.studentNotes.map(note => note.id === id ? { ...note, text: 'Newer note from the other computer', updatedAt: note.updatedAt + 100 } : note);
    gradebook.applyFromFolder(remote);
  }, privateNote.id);
  await click('Save note changes');
  assert.match(await page.$eval('.student-notes [role="alert"]', element => element.textContent), /changed elsewhere/);
  assert.equal(await page.$eval('[aria-label="Student note"]', element => element.value), 'My pending edit');
  await click('Save as new note');
  assert.equal((await notes()).length, 3, 'A conflicting note can be recovered as a new note');
  assert.equal((await notes()).find(note => note.id === privateNote.id).text, 'Newer note from the other computer');
  const timings = await page.evaluate(async () => {
    const { normalizeGradebookData } = await import('/src/lib/gradebook-model.ts');
    const { buildGradebookReports } = await import('/src/lib/gradebook-reports.ts');
    const { filterGradebookStudents, DEFAULT_GRADEBOOK_FILTER } = await import('/src/lib/gradebook-filters.ts');
    const now = Date.now();
    const students = Array.from({ length: 120 }, (_, i) => ({ id: `s${i}`, firstName: `Student${i}`, lastName: 'Example', active: true }));
    const assessments = Array.from({ length: 40 }, (_, i) => ({ id: `a${i}`, sectionId: 'large', savedTestId: '', savedTestName: `Assessment ${i}`, testType: 'test', totalPoints: 10, administeredAt: now + i }));
    const realistic = normalizeGradebookData({ sections: [{ id: 'large', name: 'Combined math sections' }], students, assessments,
      enrollments: students.map(student => ({ id: `e${student.id}`, sectionId: 'large', studentId: student.id })),
      scores: students.flatMap((student, i) => assessments.map((assessment, j) => ({ id: `${student.id}-${assessment.id}`, sectionId: 'large', studentId: student.id, assessmentId: assessment.id, points: (i + j) % 11, state: (i + j) % 13 === 0 ? 'missing' : 'normal' }))),
    });
    let started = performance.now();
    const reports = buildGradebookReports(realistic, { sectionId: 'large', studentIds: students.map(student => student.id), kind: 'progress', includeNotes: true, includeIncomplete: false, includeUngraded: false, includeInactive: false, generatedAt: now });
    const reportsMs = performance.now() - started;
    started = performance.now();
    filterGradebookStudents(realistic, realistic.sections[0], realistic.students, { ...DEFAULT_GRADEBOOK_FILTER, workState: 'missing', belowPercent: 60 });
    return { reports: reports.length, assessments: assessments.length, reportsMs: Math.round(reportsMs), filterMs: Math.round(performance.now() - started) };
  });
  assert.equal(timings.reports, 120);
  console.log('Realistic report/filter diagnostics:', JSON.stringify(timings));
  assert.deepEqual(errors, []);
  console.log('Gradebook follow-up browser checks passed: filtered rows/columns, saved views/reload, private/shared notes, durable draft/edit/undo/Trash recovery, single and filtered batch reports, missing/incomplete/ungraded distinctions, print path, mobile layout, backups and unchanged grades.');
} finally { await browser?.close(); await server.close(); }
