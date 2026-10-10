// Saved tests kept in a workspace folder shared by two computers, end to end in the app.
// Two browser profiles stand for "work" and "home"; this script plays Drive between their folders.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';

const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
const url = server.resolvedUrls.local[0];
let browser;
try {
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const errors = [];

  async function computer(name, library) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ width: 1400, height: 900 });
    page.on('pageerror', error => errors.push(`${name}: ${error.message}`));
    page.on('dialog', dialog => void dialog.accept());
    await page.evaluateOnNewDocument((library) => {
      Object.defineProperty(FileSystemDirectoryHandle.prototype, 'queryPermission', { configurable: true, value: async () => 'granted' });
      Object.defineProperty(FileSystemDirectoryHandle.prototype, 'requestPermission', { configurable: true, value: async () => 'granted' });
      window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('TestGen', { create: true });
      if (localStorage.getItem('seeded')) return;
      localStorage.setItem('seeded', '1');
      localStorage.setItem('tg-tutorial-done-v1', '1');
      if (library) localStorage.setItem('tg-test-library-v1', JSON.stringify(library));
    }, library);
    await page.goto(`${url}#/build`, { waitUntil: 'networkidle0' });
    // Complete each test's settings from the app's defaults, as a real saved test has them.
    if (library) await page.evaluate(async () => {
      const { defaultTestConfig } = await import('/src/lib/types.ts');
      const tests = JSON.parse(localStorage.getItem('tg-test-library-v1')).map(t => ({ ...t, config: { ...defaultTestConfig(t.name), ...t.config } }));
      localStorage.setItem('tg-test-library-v1', JSON.stringify(tests));
    });
    if (library) await page.reload({ waitUntil: 'networkidle0' });
    return page;
  }

  const T = 1_700_000_000_000;
  const savedTest = (id, name, selected, updatedAt, classId = 'pc40s') => ({
    id, name, classId, unitId: null, testType: 'test', createdAt: T, updatedAt,
    config: { title: name, subtitle: '', selectedIds: selected, ownQuestions: selected.map(qid => ({ id: qid, body: `Question ${qid}`, points: 2, tags: [], createdAt: T })) },
  });
  // Work: a browser whose "Unit 1" was edited after the folder's old-layout copy was written,
  // and a "Quiz 2" the folder never received.
  const work = await computer('work', [savedTest('unit-1', 'Unit 1', ['a', 'b', 'c'], T + 50), savedTest('quiz-2', 'Quiz 2', ['d'], T + 10, null)]);
  await work.evaluate(async () => {
    const { writeRepoFolder } = await import('/src/lib/folder-io.ts');
    const { exportAppDataToRepoEntries } = await import('/src/git/repoDataModel.ts');
    const { defaultTestConfig } = await import('/src/lib/types.ts');
    const questions = ['a', 'b'].map(id => ({ id, body: `Question ${id}`, points: 2, tags: [], createdAt: 1 }));
    const old = { id: 'unit-1', name: 'Unit 1', classId: 'pc40s', unitId: null, testType: 'test', createdAt: 1, updatedAt: 2,
      config: { ...defaultTestConfig('Unit 1'), selectedIds: ['a', 'b'] }, questionSnapshots: questions };
    let dir = await window.showDirectoryPicker();
    for (const part of ['tests', 'pc40s', 'unit-1']) dir = await dir.getDirectoryHandle(part, { create: true });
    await writeRepoFolder(dir, exportAppDataToRepoEntries({ questions, narratives: [], customClasses: [], savedTests: [old], images: [] }), 'absent');
  });

  // A folder that already holds tests is an existing workspace: connecting it reloads the page.
  const connect = async (page) => {
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0' }),
      page.evaluate(async () => { await (await import('/src/lib/local-workspace.svelte.ts')).localWorkspace.chooseFolder(); }),
    ]);
    return ready(page);
  };
  const ready = (page) => page.evaluate(async () => {
    const { testsFolderSync } = await import('/src/lib/tests-folder-sync.svelte.ts');
    const deadline = Date.now() + 15000;
    while (testsFolderSync.status !== 'ready' && Date.now() < deadline) { await testsFolderSync.now(); await new Promise(r => setTimeout(r, 100)); }
    if (testsFolderSync.status !== 'ready') return `${testsFolderSync.status}: ${testsFolderSync.problems.join(' · ')}`;
    return testsFolderSync.status;
  });
  const library = (page) => page.evaluate(async () => {
    const { testLibrary } = await import('/src/lib/test-library.svelte.ts');
    return testLibrary.tests.map(t => `${t.name}: ${t.config.selectedIds.join(',')}`).sort();
  });
  const syncNow = (page) => page.evaluate(async () => { await new Promise(r => setTimeout(r, 1300)); await (await import('/src/lib/tests-folder-sync.svelte.ts')).testsFolderSync.now(); });

  // Connecting work's browser to a folder with only the old layout combines the two: the browser's
  // newer "Unit 1" keeps its place, the folder's older copy is kept beside it, nothing is lost.
  assert.equal(await connect(work), 'ready');
  assert.deepEqual(await library(work), ['Quiz 2: d', 'Unit 1 (other version): a,b', 'Unit 1: a,b,c']);
  const workFiles = await work.evaluate(async () => {
    const out = [];
    const walk = async (dir, prefix) => { for await (const [name, handle] of dir.entries()) { if (handle.kind === 'directory') await walk(handle, `${prefix}${name}/`); else out.push(`${prefix}${name}`); } };
    await walk(await (await window.showDirectoryPicker()).getDirectoryHandle('tests'), '');
    return out.sort();
  });
  assert.ok(workFiles.includes('pc40s/unit-1/test.json'), 'test.json written');
  assert.ok(workFiles.includes('pc40s/unit-1/manifest.json'), 'the old layout is left alone');
  assert.ok(workFiles.includes('_unclassified/quiz-2/test.json'));

  // Drive: changed files and deletions copy across; changed on both → a conflict copy.
  const files = (page) => page.evaluate(async () => {
    const out = {};
    const walk = async (dir, prefix) => {
      for await (const [name, handle] of dir.entries()) {
        if (handle.kind === 'directory') await walk(handle, `${prefix}${name}/`);
        else out[`${prefix}${name}`] = Array.from(new Uint8Array(await (await handle.getFile()).arrayBuffer())).join(',');
      }
    };
    await walk(await (await window.showDirectoryPicker()).getDirectoryHandle('tests', { create: true }), '');
    return out;
  });
  const apply = (page, changes) => page.evaluate(async (changes) => {
    for (const [path, bytes] of Object.entries(changes)) {
      let dir = await (await window.showDirectoryPicker()).getDirectoryHandle('tests', { create: true });
      const parts = path.split('/');
      for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part, { create: true });
      if (bytes === null) { await dir.removeEntry(parts.at(-1)).catch(() => undefined); continue; }
      const writable = await (await dir.getFileHandle(parts.at(-1), { create: true })).createWritable();
      await writable.write(new Uint8Array(bytes ? bytes.split(',').map(Number) : []));
      await writable.close();
    }
  }, changes);
  const synced = new Map();
  async function drive() {
    const a = await files(work), b = await files(home);
    const toWork = {}, toHome = {};
    for (const path of new Set([...Object.keys(a), ...Object.keys(b), ...synced.keys()])) {
      const x = a[path], y = b[path], last = synced.get(path);
      if (x === y) { if (x === undefined) synced.delete(path); else synced.set(path, x); continue; }
      const aChanged = x !== last, bChanged = y !== last;
      if (aChanged && bChanged && x !== undefined && y !== undefined) {
        toHome[path] = x; toWork[`${path}.conflict1`] = y; toHome[`${path}.conflict1`] = y; synced.set(path, x);
      } else if (aChanged) { if (x === undefined) { toHome[path] = null; synced.delete(path); } else { toHome[path] = x; synced.set(path, x); } }
      else if (bChanged) { if (y === undefined) { toWork[path] = null; synced.delete(path); } else { toWork[path] = y; synced.set(path, y); } }
    }
    await apply(work, toWork);
    await apply(home, toHome);
  }

  // Home: a browser with no saved tests. Connecting brings in every test.
  const home = await computer('home', null);
  await drive();
  assert.equal(await connect(home), 'ready');
  assert.deepEqual(await library(home), await library(work), 'home gets every test');

  // A test open in Build at home, not edited there, follows an edit made at work.
  await home.evaluate(async () => { const { testEditor } = await import('/src/lib/test-editor.svelte.ts'); await testEditor.open('quiz-2'); });
  await work.evaluate(async () => {
    const { testLibrary } = await import('/src/lib/test-library.svelte.ts');
    const test = testLibrary.get('quiz-2');
    testLibrary.update('quiz-2', { ...test.config, subtitle: 'Edited at work' });
  });
  await syncNow(work); await drive();
  await home.waitForFunction(async () => (await import('/src/lib/test-editor.svelte.ts')).testEditor.config.subtitle === 'Edited at work', { timeout: 15000, polling: 250 });

  // The same test edited on both: home has it open with its edit; it keeps its place there, and
  // work's edit is kept as "(other version)". Both computers end with both versions.
  await home.evaluate(async () => {
    const { testEditor } = await import('/src/lib/test-editor.svelte.ts');
    testEditor.config.subtitle = 'Edited at home';
    testEditor.checkpoint();
  });
  await work.evaluate(async () => {
    const { testLibrary } = await import('/src/lib/test-library.svelte.ts');
    const test = testLibrary.get('quiz-2');
    testLibrary.update('quiz-2', { ...test.config, subtitle: 'Edited at work again' });
  });
  await syncNow(work); await syncNow(home); await drive(); await syncNow(work); await syncNow(home); await drive(); await syncNow(work); await syncNow(home); await drive(); await syncNow(work); await syncNow(home);
  const subtitles = (page) => page.evaluate(async () => (await import('/src/lib/test-library.svelte.ts')).testLibrary.tests.filter(t => t.id.startsWith('quiz-2')).map(t => `${t.name}: ${t.config.subtitle}`).sort());
  assert.deepEqual(await subtitles(home), ['Quiz 2 (other version): Edited at work again', 'Quiz 2: Edited at home']);
  assert.deepEqual(await subtitles(work), await subtitles(home), 'both computers hold both versions');
  assert.equal(await home.evaluate(async () => (await import('/src/lib/test-editor.svelte.ts')).testEditor.config.subtitle), 'Edited at home', 'the open test kept the edit made here');

  // Deleting a test on one computer removes it on the other; its open editor closes with a note.
  await home.evaluate(async () => { const { testEditor } = await import('/src/lib/test-editor.svelte.ts'); await testEditor.flush(); await testEditor.open('unit-1'); });
  await work.evaluate(async () => { const { testLibrary } = await import('/src/lib/test-library.svelte.ts'); testLibrary.delete('unit-1'); });
  await syncNow(work); await drive();
  await home.waitForFunction(async () => !(await import('/src/lib/test-library.svelte.ts')).testLibrary.get('unit-1'), { timeout: 15000, polling: 250 });
  assert.equal(await home.evaluate(async () => (await import('/src/lib/test-editor.svelte.ts')).testEditor.testId), null);
  assert.match(await home.evaluate(() => document.body.textContent), /deleted on another computer/);

  // An emptied browser library removes nothing from the folder, and refills.
  const before = await library(home);
  await home.evaluate(() => localStorage.setItem('tg-test-library-v1', '[]'));
  await home.reload({ waitUntil: 'networkidle0' });
  await home.waitForFunction(async (count) => (await import('/src/lib/test-library.svelte.ts')).testLibrary.tests.length === count, { timeout: 15000, polling: 250 }, before.length);
  assert.deepEqual(await library(home), before);

  assert.deepEqual(errors, []);
  console.log('Saved tests folder sync passed: the old layout and a newer browser copy are both kept, old files left alone; a new computer gets every test; an open unedited test follows edits from the other computer; a test edited on both keeps the open one in place and the other as "(other version)" on both computers; deletions spread and close the open test with a note; an emptied browser refills.');
} finally {
  await browser?.close();
  await server.close();
}
