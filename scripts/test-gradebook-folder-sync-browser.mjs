// The Gradebook kept in a workspace folder shared by two computers, end to end in the app.
// Two separate browser profiles stand for "work" and "home", each with its own folder; this
// script plays Drive, copying changed files across and making conflict copies like rclone.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';

const T = 1_700_000_000_000;
const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
const url = server.resolvedUrls.local[0];
let browser;
try {
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const errors = [];

  async function computer(name, seed) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ width: 1400, height: 900 });
    page.on('pageerror', error => errors.push(`${name}: ${error.message}`));
    page.on('dialog', dialog => void dialog.accept());
    await page.evaluateOnNewDocument((seed) => {
      Object.defineProperty(FileSystemDirectoryHandle.prototype, 'queryPermission', { configurable: true, value: async () => 'granted' });
      Object.defineProperty(FileSystemDirectoryHandle.prototype, 'requestPermission', { configurable: true, value: async () => 'granted' });
      window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('TestGen', { create: true });
      if (localStorage.getItem('seeded')) return;
      localStorage.setItem('seeded', '1');
      localStorage.setItem('tg-tutorial-done-v1', '1');
      localStorage.setItem('tg-gradebook-experimental-enabled-v1', 'true');
      if (seed) localStorage.setItem('tg-gradebook-v1', JSON.stringify(seed));
    }, seed);
    await page.goto(`${url}#/gradebook`, { waitUntil: 'networkidle0' });
    return page;
  }

  const assessment = (id, sectionId, name) => ({ id, sectionId, savedTestId: '', savedTestName: name, title: '', subtitle: '', testType: 'test', source: 'external', gradingMode: 'total', selectedQuestionIds: [], questionSnapshots: [], totalPoints: 10, bonusPoints: 0, administeredAt: T, createdAt: T, updatedAt: T });
  const score = (assessmentId, sectionId, studentId, points, at = T) => ({ id: `${assessmentId}-${studentId}`, sectionId, assessmentId, studentId, state: 'normal', points, createdAt: at, updatedAt: at });
  const gradebookData = (scores) => ({
    version: 1,
    sections: [{ id: 'p1', name: 'Period 1', categoryWeights: {}, createdAt: T, updatedAt: T }, { id: 'p3', name: 'Period 3', categoryWeights: {}, createdAt: T + 1, updatedAt: T }],
    students: [['ada', 'Ada', 'Lee'], ['bo', 'Bo', 'Chan'], ['cy', 'Cy', 'Diaz']].map(([id, firstName, lastName]) => ({ id, firstName, lastName, active: true, createdAt: T, updatedAt: T })),
    enrollments: [['p1', 'ada'], ['p1', 'bo'], ['p3', 'cy']].map(([sectionId, studentId]) => ({ id: `${sectionId}-${studentId}`, sectionId, studentId, active: true, startedAt: T, createdAt: T, updatedAt: T })),
    assessments: [assessment('u1', 'p1', 'Unit 1 Test'), assessment('q2', 'p3', 'Quiz 2')],
    scores,
    settings: { defaultScoreState: 'normal' },
  });

  // Work: the browser holds grades that never reached the folder; the folder has an older gradebook.json.
  const work = await computer('work', gradebookData([score('u1', 'p1', 'ada', 8), score('u1', 'p1', 'bo', 6, T + 5), score('q2', 'p3', 'cy', 4, T + 5)]));
  const legacy = await work.evaluate(async (old) => {
    const { stringifyGradebookBackup } = await import('/src/lib/gradebook-backup.ts');
    const { writeText } = await import('/src/lib/folder-io.ts');
    const text = stringifyGradebookBackup(old, 1);
    await writeText(await (await window.showDirectoryPicker()).getDirectoryHandle('gradebook', { create: true }), 'gradebook.json', text);
    return text;
  }, gradebookData([score('u1', 'p1', 'ada', 7, T - 5)]));

  const connect = (page) => page.evaluate(async () => {
    const { localWorkspace } = await import('/src/lib/local-workspace.svelte.ts');
    await localWorkspace.chooseFolder();
    const { gradebookFolderSync } = await import('/src/lib/gradebook-folder-sync.svelte.ts');
    const deadline = Date.now() + 15000;
    while (gradebookFolderSync.status !== 'ready' && Date.now() < deadline) { await gradebookFolderSync.now(); await new Promise(r => setTimeout(r, 100)); }
    return gradebookFolderSync.status;
  });
  assert.equal(await connect(work), 'ready');
  const points = (page) => page.evaluate(async () => {
    const { gradebook } = await import('/src/lib/gradebook.svelte.ts');
    return Object.fromEntries(gradebook.scores.map(s => [`${s.assessmentId}/${s.studentId}`, s.points]).sort());
  });
  assert.deepEqual(await points(work), { 'q2/cy': 4, 'u1/ada': 8, 'u1/bo': 6 }, 'every grade in the browser is kept; the older gradebook.json mark does not replace a newer one');
  await work.waitForFunction(() => /Saved to folder/.test(document.querySelector('.sync-status')?.textContent ?? ''));

  // Drive: changed files copy across; changed on both sides → a conflict copy, like rclone bisync.
  const gradebookFiles = (page) => page.evaluate(async () => {
    const out = {};
    const walk = async (dir, prefix) => {
      for await (const [name, handle] of dir.entries()) {
        if (handle.kind === 'directory') await walk(handle, `${prefix}${name}/`);
        else out[`${prefix}${name}`] = await (await handle.getFile()).text();
      }
    };
    await walk(await (await window.showDirectoryPicker()).getDirectoryHandle('gradebook', { create: true }), '');
    return out;
  });
  const putFiles = (page, files) => page.evaluate(async (files) => {
    const { writeText } = await import('/src/lib/folder-io.ts');
    for (const [path, text] of Object.entries(files)) {
      let dir = await (await window.showDirectoryPicker()).getDirectoryHandle('gradebook', { create: true });
      const parts = path.split('/');
      for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part, { create: true });
      await writeText(dir, parts.at(-1), text);
    }
  }, files);
  const synced = new Map();
  async function drive() {
    const a = await gradebookFiles(work), b = await gradebookFiles(home);
    const toWork = {}, toHome = {};
    for (const path of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const x = a[path], y = b[path], last = synced.get(path);
      if (x === y) { synced.set(path, x); continue; }
      const aChanged = x !== last, bChanged = y !== last;
      if (aChanged && bChanged && x !== undefined && y !== undefined) {
        toWork[`${path}.conflict1`] = y; toHome[path] = x; toHome[`${path}.conflict1`] = y; synced.set(path, x);
      } else if (aChanged && x !== undefined) { toHome[path] = x; synced.set(path, x); }
      else if (bChanged && y !== undefined) { toWork[path] = y; synced.set(path, y); }
    }
    await putFiles(work, toWork);
    await putFiles(home, toHome);
  }

  const writeThrough = (page) => page.evaluate(async () => { await new Promise(r => setTimeout(r, 1200)); await (await import('/src/lib/gradebook-folder-sync.svelte.ts')).gradebookFolderSync.now(); });
  // Home: a browser holding an older copy of the Gradebook, connected before Drive has brought
  // work's files across. Both computers write their first files; Drive makes conflict copies.
  // Records that differ only in when they were saved are not offered for review.
  const stale = gradebookData([score('u1', 'p1', 'ada', 8)]);
  stale.students = stale.students.map(s => ({ ...s, updatedAt: T + 99 }));
  const home = await computer('home', stale);
  assert.equal(await connect(home), 'ready');
  await drive();
  await writeThrough(work); await writeThrough(home);
  await drive();
  await writeThrough(work); await writeThrough(home);
  assert.ok(Object.keys(await gradebookFiles(work)).some(path => path.includes('.conflict')), 'the scenario made Drive conflict copies');
  assert.equal(await work.$('.sync-review'), null, 'nothing to review on work');
  assert.equal(await home.$('.sync-review'), null, 'nothing to review on home');
  assert.deepEqual(await points(home), { 'q2/cy': 4, 'u1/ada': 8, 'u1/bo': 6 }, 'home gets every grade from the folder');
  assert.equal((await gradebookFiles(work))['gradebook.json'], legacy, 'gradebook.json is never rewritten');

  // Marks entered on each computer, for different classes, reach the other without anyone doing anything.
  const setScore = (page, assessmentId, sectionId, studentId, value) => page.evaluate(async (a) => {
    const { gradebook } = await import('/src/lib/gradebook.svelte.ts');
    gradebook.updateScore({ sectionId: a.sectionId, assessmentId: a.assessmentId, studentId: a.studentId, points: a.value, state: 'normal' });
    gradebook.flush();
  }, { assessmentId, sectionId, studentId, value });
  await setScore(work, 'u1', 'p1', 'ada', 9);
  await setScore(home, 'q2', 'p3', 'cy', 5);
  await writeThrough(work); await writeThrough(home);
  await drive();
  const waitFor = (page, expected) => page.waitForFunction(async (expected) => {
    const { gradebook } = await import('/src/lib/gradebook.svelte.ts');
    return Object.entries(expected).every(([key, value]) => gradebook.scores.find(s => `${s.assessmentId}/${s.studentId}` === key)?.points === value);
  }, { timeout: 15000, polling: 250 }, expected);
  await waitFor(work, { 'u1/ada': 9, 'q2/cy': 5 });
  await waitFor(home, { 'u1/ada': 9, 'q2/cy': 5 });
  // And the open grid shows it.
  await home.waitForFunction(() => document.body.textContent.includes('Period 1'));

  // The same mark changed on both computers before Drive caught up: the newer one is kept, and
  // the other is offered for review; choosing it puts it everywhere.
  await setScore(work, 'u1', 'p1', 'bo', 3);
  await new Promise(r => setTimeout(r, 30));
  await setScore(home, 'u1', 'p1', 'bo', 10);
  await writeThrough(work); await writeThrough(home);
  await drive();
  await writeThrough(work); await writeThrough(home);
  await drive();
  await waitFor(work, { 'u1/bo': 10 });
  await waitFor(home, { 'u1/bo': 10 });
  await work.waitForSelector('.sync-review');
  const reviewText = await work.$eval('.sync-review', el => el.textContent);
  assert.match(reviewText, /Bo Chan's score on Unit 1 Test/);
  assert.match(reviewText, /kept 10; the other edit was 3/);
  await work.evaluate(() => [...document.querySelectorAll('.sync-review button')].find(b => b.textContent.trim() === 'Use 3').click());
  assert.equal(await work.$('.sync-review'), null, 'the review closes once chosen');
  await writeThrough(work);
  await drive();
  await waitFor(home, { 'u1/bo': 3 });
  await waitFor(work, { 'u1/bo': 3 });

  // A test renamed differently on both computers: the review says what differs.
  const rename = (page, name) => page.evaluate(async (name) => {
    const { gradebook } = await import('/src/lib/gradebook.svelte.ts');
    gradebook.updateAssessment('u1', { name });
  }, name);
  await rename(work, 'Unit 1 Exam');
  await new Promise(r => setTimeout(r, 30));
  await rename(home, 'Unit One Test');
  await writeThrough(work); await writeThrough(home);
  await drive();
  await writeThrough(work); await writeThrough(home);
  await drive();
  await work.waitForSelector('.sync-review');
  assert.match(await work.$eval('.sync-review', el => el.textContent), /kept name “Unit One Test”; the other edit was name “Unit 1 Exam”/);
  await work.evaluate(() => [...document.querySelectorAll('.sync-review button')].find(b => b.textContent.trim() === 'Keep this').click());

  // Deleting an assessment on one computer removes it on the other.
  await work.evaluate(async () => { const { gradebook } = await import('/src/lib/gradebook.svelte.ts'); gradebook.deleteAssessment('q2'); });
  await writeThrough(work);
  await drive();
  await home.waitForFunction(async () => !(await import('/src/lib/gradebook.svelte.ts')).gradebook.assessments.some(a => a.id === 'q2'), { timeout: 15000, polling: 250 });
  // But wiping a browser's storage removes nothing from the folder, and it refills.
  await home.evaluate(() => { localStorage.setItem('tg-gradebook-v1', 'null'); });
  await home.reload({ waitUntil: 'networkidle0' });
  await waitFor(home, { 'u1/ada': 9, 'u1/bo': 3 });
  assert.deepEqual(await points(home), await points(work));

  // Reloading the workspace (which checks the banks) leaves the Gradebook as it is.
  const before = await points(home);
  await home.evaluate(async () => { await (await import('/src/lib/local-workspace.svelte.ts')).localWorkspace.reload(); });
  await waitFor(home, before);
  assert.deepEqual(await points(home), before);

  assert.deepEqual(errors, []);
  console.log('Gradebook folder sync passed: browser-only grades kept when moving from gradebook.json, which is never rewritten; a new computer gets everything; marks entered on each computer appear on the other on their own; a mark changed on both is offered for review and the choice spreads; deletions spread; a wiped browser refills; reloading the workspace leaves the Gradebook alone.');
} finally {
  await browser?.close();
  await server.close();
}
