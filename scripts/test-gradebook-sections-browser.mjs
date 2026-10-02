// Gradebook sections: no delete control beside a section's name. The bottom of Overview
// archives a section or moves it to the Trash; both restore, and the Trash deletes for good.
// Synthetic data in an isolated browser.
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
  page.on('pageerror', (error) => errors.push(error.message));
  // Each confirm is answered by the next entry: [pattern, accept].
  const dialogs = [];
  page.on('dialog', (dialog) => {
    const next = dialogs.shift();
    if (!next || !next[0].test(dialog.message())) { errors.push(`Unexpected dialog: ${dialog.message()}`); void dialog.dismiss(); return; }
    void (next[1] ? dialog.accept() : dialog.dismiss());
  });
  await page.evaluateOnNewDocument(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('tg-tutorial-done-v1', '1');
    localStorage.setItem('tg-gradebook-experimental-enabled-v1', 'true');
    localStorage.setItem('tg-gradebook-v1', JSON.stringify({
      version: 1,
      sections: ['Period 1', 'Period 2', 'Period 3'].map((name, i) => ({ id: `p${i + 1}`, name, linkedClassId: null, termLabel: null })),
      // s0 is only in Period 1; s1 is in Periods 1 and 2.
      students: [{ id: 's0', firstName: 'Ada', lastName: 'Only' }, { id: 's1', firstName: 'Ben', lastName: 'Both' }],
      enrollments: [{ id: 'e0', sectionId: 'p1', studentId: 's0' }, { id: 'e1', sectionId: 'p1', studentId: 's1' }, { id: 'e2', sectionId: 'p2', studentId: 's1' }],
      assessments: [
        { id: 'a1', sectionId: 'p1', savedTestId: 'x', savedTestName: 'Quiz', title: 'Quiz', subtitle: '', testType: 'quiz', selectedQuestionIds: [], questionSnapshots: [], totalPoints: 10, bonusPoints: 0, administeredAt: 1 },
        { id: 'a2', sectionId: 'p2', savedTestId: 'y', savedTestName: 'Test', title: 'Test', subtitle: '', testType: 'test', selectedQuestionIds: [], questionSnapshots: [], totalPoints: 10, bonusPoints: 0, administeredAt: 1 },
      ],
      scores: [{ id: 'c1', sectionId: 'p1', assessmentId: 'a1', studentId: 's1', points: 8 }, { id: 'c2', sectionId: 'p2', assessmentId: 'a2', studentId: 's1', points: 9 }],
      settings: {},
    }));
  });
  await page.goto(`${server.resolvedUrls.local[0]}#/gradebook`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.section-rail .section-item');

  const rail = () => page.evaluate(() => ({
    header: document.querySelector('.rail-header span').textContent.replace(/\s+/g, ' ').trim(),
    active: [...document.querySelectorAll('.section-list > .section-item span')].map((el) => el.textContent),
    selected: document.querySelector('.section-item.active span')?.textContent ?? null,
    lists: [...document.querySelectorAll('.section-trash')].map((d) => [d.querySelector('summary').textContent, [...d.querySelectorAll('.archived-section-item span')].map((el) => el.textContent)]),
  }));
  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('tg-gradebook-v1')));
  const click = (selector, text) => page.evaluate((s, t) => {
    const el = [...document.querySelectorAll(s)].find((e) => e.textContent.trim() === t);
    if (!el) throw new Error(`No ${s} “${t}”`);
    el.click();
  }, selector, text);
  const select = (name) => page.evaluate((n) => [...document.querySelectorAll('.section-list > .section-item')].find((b) => b.querySelector('span').textContent === n).click(), name);
  const inList = (list, name, button) => page.evaluate((l, n, b) => {
    const details = [...document.querySelectorAll('.section-trash')].find((d) => d.querySelector('summary').textContent.startsWith(l));
    details.open = true;
    const row = [...details.querySelectorAll('.archived-section-item')].find((r) => r.querySelector('span').textContent === n);
    [...row.querySelectorAll('button')].find((x) => x.textContent.trim() === b).click();
  }, list, name, button);
  const settle = () => new Promise((resolve) => setTimeout(resolve, 200));

  // 1. Section management belongs in Overview's right pane.
  assert.equal(await page.$$eval('.section-rail button', (bs) => bs.filter((b) => /🗑|trash/i.test(b.textContent + b.title + (b.getAttribute('aria-label') ?? ''))).length), 0);
  assert.ok(await page.$('.detail-rail .section-removal'), 'section options appear in the right pane');
  assert.equal(await page.$('.overview-stack .section-removal'), null);
  assert.deepEqual(await page.$$eval('.section-removal-actions button', (bs) => bs.map((b) => b.textContent.trim())), ['Archive section', 'Move to Trash']);

  // 2. Cancelling the confirmation changes nothing.
  await select('Period 3');
  dialogs.push([/^Archive "Period 3"\?/, false]);
  await click('.section-removal-actions button', 'Archive section');
  await settle();
  assert.deepEqual((await rail()).active, ['Period 1', 'Period 2', 'Period 3']);

  // 3. Archive, then restore from Archived.
  dialogs.push([/^Archive "Period 3"\?/, true]);
  await click('.section-removal-actions button', 'Archive section');
  await settle();
  assert.deepEqual(await rail(), { header: '2 active · 1 archived', active: ['Period 1', 'Period 2'], selected: 'Period 1', lists: [['Archived (1)', ['Period 3']]] });
  assert.equal(typeof (await stored()).sections.find((s) => s.id === 'p3').archivedAt, 'number');
  await inList('Archived', 'Period 3', 'Restore');
  await settle();
  assert.deepEqual((await rail()).active, ['Period 1', 'Period 2', 'Period 3']);
  assert.equal((await rail()).selected, 'Period 3');

  // 4. Move to Trash (kept across a reload), then restore.
  await select('Period 1');
  dialogs.push([/^Move "Period 1" to the Trash\?/, true]);
  await click('.section-removal-actions button', 'Move to Trash');
  await settle();
  assert.deepEqual(await rail(), { header: '2 active · 1 in Trash', active: ['Period 2', 'Period 3'], selected: 'Period 2', lists: [['Trash (1)', ['Period 1']]] });
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('.section-rail .section-item');
  assert.deepEqual((await rail()).lists, [['Trash (1)', ['Period 1']]]);
  await inList('Trash', 'Period 1', 'Restore');
  await settle();
  assert.deepEqual((await rail()).active, ['Period 1', 'Period 2', 'Period 3']);
  assert.equal((await stored()).assessments.length, 2, 'the Trash keeps everything');

  // 5. Delete for good from the Trash: its roster, assessments and scores go; shared students stay.
  await select('Period 1');
  dialogs.push([/^Move "Period 1" to the Trash\?/, true]);
  await click('.section-removal-actions button', 'Move to Trash');
  await settle();
  dialogs.push([/^Delete "Period 1" for good\?/, false]);
  await inList('Trash', 'Period 1', 'Delete');
  await settle();
  assert.equal((await stored()).sections.length, 3, 'cancelling the delete keeps the section');
  dialogs.push([/^Delete "Period 1" for good\?/, true]);
  await inList('Trash', 'Period 1', 'Delete');
  await settle();
  const data = await stored();
  assert.deepEqual(data.sections.map((s) => s.id), ['p2', 'p3']);
  assert.deepEqual(data.students.map((s) => s.id), ['s1'], 'a student only in the deleted section goes; one in another section stays');
  assert.deepEqual(data.enrollments.map((e) => e.id), ['e2']);
  assert.deepEqual(data.assessments.map((a) => a.id), ['a2']);
  assert.deepEqual(data.scores.map((c) => c.id), ['c2']);
  assert.deepEqual(await rail(), { header: '2 active', active: ['Period 2', 'Period 3'], selected: 'Period 2', lists: [] });

  assert.deepEqual(dialogs, [], 'every expected confirmation appeared');
  assert.deepEqual(errors, []);
  console.log('Gradebook section tests passed: no delete beside names, section options in right pane, cancel, archive/restore, trash/reload/restore, delete for good (shared students kept).');
} finally {
  await browser?.close();
  await server.close();
}
