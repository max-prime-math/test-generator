// Regression test: clearing browser storage must not erase a workspace bank,
// archive its saved tests, or empty its gradebook.
//
// The active bank's questions live in localStorage while the workspace folder
// handle and save baseline live in IndexedDB. Clearing localStorage alone left
// TestGen connected with an empty active bank, and autosave mirrored that empty
// bank into the folder (every conflict check passed, since the folder itself had
// not changed). This reproduces that sequence and checks the folder survives.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';

const QUESTIONS = 60;
const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
let browser;
try {
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('tg-tutorial-done-v1', '1');
    window.confirm = () => true;
    Object.defineProperty(FileSystemDirectoryHandle.prototype, 'queryPermission', { configurable: true, value: async () => 'granted' });
    Object.defineProperty(FileSystemDirectoryHandle.prototype, 'requestPermission', { configurable: true, value: async () => 'granted' });
    window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('data-loss-fixture', { create: true });
  });
  await page.goto(server.resolvedUrls.local[0], { waitUntil: 'networkidle0' });
  await page.evaluate(async (count) => {
    const { writeRepoFolder, writeText } = await import('/src/lib/folder-io.ts');
    const { exportAppDataToRepoEntries } = await import('/src/git/repoDataModel.ts');
    const banks = await (await window.showDirectoryPicker()).getDirectoryHandle('banks', { create: true });
    for (const [id, size] of [['guarded', count], ['other', 5]]) {
      const data = { questions: Array.from({ length: size }, (_, i) => ({ id: `${id}-${i}`, body: `Question ${i}`, points: 1, tags: [], createdAt: 1 })),
        narratives: [], customClasses: [], savedTests: [], images: [] };
      const folder = await banks.getDirectoryHandle(id, { create: true });
      await writeRepoFolder(folder, exportAppDataToRepoEntries(data), 'absent');
      await writeText(folder, 'bank-name.json', JSON.stringify({ name: id }));
    }
    // A saved test and a gradebook with records, as a shared workspace holds them.
    const { defaultTestConfig } = await import('/src/lib/types.ts');
    const { stringifyGradebookBackup } = await import('/src/lib/gradebook-backup.ts');
    const { normalizeGradebookData } = await import('/src/lib/gradebook-model.ts');
    const root = await window.showDirectoryPicker();
    const question = { id: 'kept-q', body: 'Kept question', points: 1, tags: [], createdAt: 1 };
    const test = { id: 'kept-test', name: 'Kept test', classId: null, unitId: null, testType: 'quiz', createdAt: 1, updatedAt: 1,
      config: { ...defaultTestConfig('Kept test'), selectedIds: ['kept-q'] } };
    const testFolder = await (await (await root.getDirectoryHandle('tests', { create: true })).getDirectoryHandle('_unclassified', { create: true }))
      .getDirectoryHandle('kept-test', { create: true });
    await writeRepoFolder(testFolder, exportAppDataToRepoEntries({ questions: [question], narratives: [], customClasses: [], savedTests: [test], images: [] }), 'absent');
    const book = normalizeGradebookData({ sections: [{ id: 'sec-1', name: 'Period 1' }],
      students: [1, 2, 3].map(n => ({ id: `stu-${n}`, firstName: 'Student', lastName: String(n) })) });
    await writeText(await root.getDirectoryHandle('gradebook', { create: true }), 'gradebook.json', stringifyGradebookBackup(book, 0));
  }, QUESTIONS);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0' }),
    page.evaluate(async () => (await import('/src/lib/local-workspace.svelte.ts')).localWorkspace.chooseFolder()),
  ]);
  const settled = () => page.waitForFunction(async () => {
    const { localWorkspace } = await import('/src/lib/local-workspace.svelte.ts');
    return ['ready', 'review-needed', 'error', 'paused'].includes(localWorkspace.status) && !localWorkspace.busy;
  }, { timeout: 30000 });
  await settled();
  await page.evaluate(async () => {
    const { bankWorkspaces } = await import('/src/lib/bank-workspaces.svelte.ts');
    const { localWorkspace } = await import('/src/lib/local-workspace.svelte.ts');
    await bankWorkspaces.switchBank('guarded');
    await localWorkspace.saveNow();
  });
  const folderQuestions = () => page.evaluate(async () => {
    const banks = await (await window.showDirectoryPicker()).getDirectoryHandle('banks');
    const manifest = JSON.parse(await (await (await (await banks.getDirectoryHandle('guarded')).getFileHandle('manifest.json')).getFile()).text());
    return manifest.files.filter(file => /^questions\/[^/]+\.json$/.test(file.path) && file.path !== 'questions/index.json').length;
  });
  const folderState = () => page.evaluate(async () => {
    const root = await window.showDirectoryPicker();
    const testFolder = await (await (await root.getDirectoryHandle('tests')).getDirectoryHandle('_unclassified')).getDirectoryHandle('kept-test');
    let archived = true;
    try { await testFolder.getFileHandle('deleted.json'); } catch { archived = false; }
    // Saved tests keep themselves in step with the folder too.
    const { testsFolderSync } = await import('/src/lib/tests-folder-sync.svelte.ts');
    await testsFolderSync.now();
    const { testLibrary } = await import('/src/lib/test-library.svelte.ts');
    const tests = testLibrary.tests.map(test => test.id).join(',');
    // The Gradebook lives in gradebook/records/; the old gradebook.json is never written again.
    const { gradebookFolderSync } = await import('/src/lib/gradebook-folder-sync.svelte.ts');
    await gradebookFolderSync.now();
    const gradeRoot = await root.getDirectoryHandle('gradebook');
    const legacy = JSON.parse(await (await (await gradeRoot.getFileHandle('gradebook.json')).getFile()).text());
    const students = JSON.parse(await (await (await (await gradeRoot.getDirectoryHandle('records')).getFileHandle('students.json')).getFile()).text());
    const { gradebook } = await import('/src/lib/gradebook.svelte.ts');
    return { archived, tests, students: Object.keys(students.records).length, deleted: Object.keys(students.deleted).length,
      legacy: legacy.data.students.length, browser: gradebook.students.length };
  });
  assert.equal(await folderQuestions(), QUESTIONS, 'fixture folder starts complete');
  assert.deepEqual(await folderState(), { archived: false, tests: 'kept-test', students: 3, deleted: 0, legacy: 3, browser: 3 }, 'fixture test and gradebook start complete, moved into records');
  const active = await page.evaluate(async () => (await import('/src/lib/bank-workspaces.svelte.ts')).bankWorkspaces.activeBankId);
  assert.equal(active, 'guarded', 'the guarded bank is active');

  // Clear site storage the browser way that keeps IndexedDB: localStorage only.
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('tg-tutorial-done-v1', '1'); });
  await page.reload({ waitUntil: 'networkidle0' });
  await settled();
  const after = await page.evaluate(async () => {
    const { localWorkspace } = await import('/src/lib/local-workspace.svelte.ts');
    await localWorkspace.saveNow().catch(() => undefined);
    await localWorkspace.idle();
    return { status: localWorkspace.status, blocked: (localWorkspace.blockedShrinks ?? []).map(entry => ({ ...entry })) };
  });
  const remaining = await folderQuestions();
  console.log(JSON.stringify({ remaining, ...after }));
  assert.equal(remaining, QUESTIONS, `folder kept all ${QUESTIONS} questions after browser storage was cleared`);
  const stateAfter = await folderState();
  console.log(JSON.stringify(stateAfter));
  assert.equal(stateAfter.archived, false, 'clearing browser storage did not archive the saved test');
  assert.equal(stateAfter.students, 3, 'clearing browser storage did not empty the gradebook');
  assert.equal(stateAfter.browser, 3, 'the browser Gradebook refilled itself from the folder');
  assert.equal(stateAfter.tests, 'kept-test', 'the saved test refilled itself from the folder');
  assert.equal(after.status, 'ready', 'nothing is waiting for review');

  // Full "clear site data": localStorage and every IndexedDB database (which
  // also holds the folder handle), then reconnect the same workspace root.
  await page.evaluate(async () => {
    localStorage.clear(); localStorage.setItem('tg-tutorial-done-v1', '1');
    for (const db of await indexedDB.databases()) {
      await new Promise(resolve => { const request = indexedDB.deleteDatabase(db.name); request.onsuccess = request.onerror = request.onblocked = resolve; });
    }
  });
  await page.reload({ waitUntil: 'networkidle0' });
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0' }),
    page.evaluate(async () => (await import('/src/lib/local-workspace.svelte.ts')).localWorkspace.chooseFolder()),
  ]);
  await settled();
  const afterFull = await page.evaluate(async () => {
    const { localWorkspace } = await import('/src/lib/local-workspace.svelte.ts');
    const { bankWorkspaces } = await import('/src/lib/bank-workspaces.svelte.ts');
    await localWorkspace.saveNow().catch(() => undefined);
    await localWorkspace.idle();
    return { status: localWorkspace.status, active: bankWorkspaces.activeBankId, blocked: (localWorkspace.blockedShrinks ?? []).map(entry => ({ ...entry })) };
  });
  const remainingFull = await folderQuestions();
  console.log(JSON.stringify({ remainingFull, ...afterFull }));
  assert.equal(remainingFull, QUESTIONS, `folder kept all ${QUESTIONS} questions after all site data was cleared`);
  assert.deepEqual(await folderState(), { archived: false, tests: 'kept-test', students: 3, deleted: 0, legacy: 3, browser: 3 }, 'reconnecting kept the saved test and gradebook');

  // Emptying the browser test library or gradebook directly never reaches the
  // folder; removing one student keeps a dated copy of the previous file.
  const emptied = await page.evaluate(async () => {
    const { localWorkspace } = await import('/src/lib/local-workspace.svelte.ts');
    const { GRADEBOOK_STORAGE_KEY } = await import('/src/lib/gradebook-model.ts');
    const { gradebook } = await import('/src/lib/gradebook.svelte.ts');
    const { testLibrary } = await import('/src/lib/test-library.svelte.ts');
    testLibrary.replaceAllFromFolder([]);
    localStorage.setItem(GRADEBOOK_STORAGE_KEY, 'null');
    gradebook.reload();
    await localWorkspace.saveNow().catch(() => undefined);
    await localWorkspace.idle();
    return localWorkspace.error;
  });
  assert.deepEqual(await folderState(), { archived: false, tests: 'kept-test', students: 3, deleted: 0, legacy: 3, browser: 3 }, 'an emptied browser library and gradebook changed nothing; both refilled');
  assert.equal(emptied, null);
  // Deleting a student in the app is explicit, and reaches the folder as a deletion.
  await page.evaluate(async () => {
    const { gradebook } = await import('/src/lib/gradebook.svelte.ts');
    gradebook.deleteStudent(gradebook.students[0].id);
  });
  assert.deepEqual(await folderState(), { archived: false, tests: 'kept-test', students: 2, deleted: 1, legacy: 3, browser: 2 }, 'a deleted student is recorded as deleted; gradebook.json is untouched');

  // Force the failure itself: the active bank's browser copy loses every
  // question. Autosave must refuse, and only an explicit confirmation removes.
  const forced = await page.evaluate(async () => {
    const { bank } = await import('/src/lib/bank.svelte.ts');
    const { localWorkspace } = await import('/src/lib/local-workspace.svelte.ts');
    for (const question of [...bank.questions]) bank.remove(question.id);
    await localWorkspace.saveNow().catch(() => undefined);
    await localWorkspace.idle();
    return { blocked: (localWorkspace.blockedShrinks ?? []).map(entry => ({ ...entry })), error: localWorkspace.error };
  });
  assert.equal(await folderQuestions(), QUESTIONS, 'an emptied browser bank did not empty its folder');
  assert.deepEqual(forced.blocked.map(entry => [entry.bankId, entry.before, entry.after]), [['guarded', QUESTIONS, 0]], JSON.stringify(forced));
  assert.match(forced.error ?? '', /Not saved: this would remove 60 of 60 questions/);
  await page.evaluate(async () => (await import('/src/lib/local-workspace.svelte.ts')).localWorkspace.confirmShrink('guarded'));
  assert.equal(await folderQuestions(), 0, 'confirmed removal reaches the folder');
  assert.deepEqual(await page.evaluate(async () => (await import('/src/lib/local-workspace.svelte.ts')).localWorkspace.blockedShrinks.length), 0);
  assert.deepEqual(errors, []);
  console.log('Workspace data-loss test passed: clearing localStorage, or all site data and reconnecting, left banks, tests and the gradebook intact; emptied browser data is blocked; saved tests and the Gradebook refill from the folder and only explicit deletions reach it.');
} finally {
  await browser?.close();
  await server.close();
}
