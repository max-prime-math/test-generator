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
  const outcomeKey = JSON.stringify(['math', 'algebra', 'A.1', null]);
  await page.evaluateOnNewDocument((outcomeKey) => {
    localStorage.setItem('tg-tutorial-done-v1', '1');
    window.confirm = () => true;
    Object.defineProperty(FileSystemDirectoryHandle.prototype, 'queryPermission', { configurable: true, value: async () => 'granted' });
    Object.defineProperty(FileSystemDirectoryHandle.prototype, 'requestPermission', { configurable: true, value: async () => 'granted' });
    window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('curriculum-sync-fixture', { create: true });
    const stale = { schemaVersion: 3, updatedAt: 999, outcomes: {
      [outcomeKey]: { nickname: 'stale browser wording', nicknameUpdatedAt: 999, nextStepUpdatedAt: 999, nextStepIndicatorUpdatedAt: 999, updatedAt: 999 },
    } };
    localStorage.setItem('tg-curriculum-comment-language-v3', JSON.stringify(stale));
  }, outcomeKey);
  await page.goto(server.resolvedUrls.local[0], { waitUntil: 'networkidle0' });

  await page.evaluate(async (outcomeKey) => {
    const { writeText } = await import('/src/lib/folder-io.ts');
    const root = await window.showDirectoryPicker();
    const catalog = { schemaVersion: 1, updatedAt: 50, courses: [{ id: 'math', name: 'Mathematics', units: [{ id: 'algebra', name: 'Algebra', sections: [{
      id: 'A.1', name: 'Solve linear equations', indicators: [{ id: 'A.1.1', text: 'Check a solution by substitution.' }],
    }] }] }] };
    const language = { schemaVersion: 3, updatedAt: 50, outcomes: {
      [outcomeKey]: { nickname: 'shared workspace wording', nicknameUpdatedAt: 50, nextStepUpdatedAt: 50, nextStepIndicatorUpdatedAt: 50, updatedAt: 50 },
      [JSON.stringify(['math', 'algebra', 'A.1', 'A.1.1'])]: { nickname: 'check a solution by substitution', nicknameUpdatedAt: 50, nextStepUpdatedAt: 50, nextStepIndicatorUpdatedAt: 50, updatedAt: 50 },
    } };
    await writeText(root, 'curriculum/catalog.json', `${JSON.stringify(catalog, null, 2)}\n`);
    await writeText(root, 'curriculum/comment-language.json', `${JSON.stringify(language, null, 2)}\n`);
    await (await import('/src/lib/local-workspace.svelte.ts')).localWorkspace.chooseFolder();
  }, outcomeKey);
  await page.waitForFunction(async () => (await import('/src/lib/curriculum-folder-sync.svelte.ts')).curriculumFolderSync.status === 'ready');

  const adopted = await page.evaluate((outcomeKey) => ({
    nickname: JSON.parse(localStorage.getItem('tg-curriculum-comment-language-v3')).outcomes[outcomeKey].nickname,
    pending: localStorage.getItem('tg-curriculum-comment-language-pending-v1'),
  }), outcomeKey);
  assert.deepEqual(adopted, { nickname: 'shared workspace wording', pending: null }, 'the connected workspace replaces a stale unedited cache');

  const saved = await page.evaluate(async (outcomeKey) => {
    const { curriculumLibrary } = await import('/src/lib/curriculum-library.svelte.ts');
    const shown = curriculumLibrary.classes.find(course => course.id === 'math');
    curriculumLibrary.setCommentMetadata(shown, 'algebra', 'A.1', null, 'nickname', 'new browser edit', 1000);
    const pendingBefore = localStorage.getItem('tg-curriculum-comment-language-pending-v1');
    await (await import('/src/lib/curriculum-folder-sync.svelte.ts')).curriculumFolderSync.now();
    const root = await window.showDirectoryPicker();
    const { readText } = await import('/src/lib/folder-io.ts');
    const file = JSON.parse(await readText(root, 'curriculum/comment-language.json'));
    return { pendingBefore: Boolean(pendingBefore), pendingAfter: localStorage.getItem('tg-curriculum-comment-language-pending-v1'), nickname: file.outcomes[outcomeKey].nickname };
  }, outcomeKey);
  assert.deepEqual(saved, { pendingBefore: true, pendingAfter: null, nickname: 'new browser edit' }, 'an explicit local edit is written before its pending marker clears');

  const refreshed = await page.evaluate(async (outcomeKey) => {
    const root = await window.showDirectoryPicker();
    const { readText, writeText } = await import('/src/lib/folder-io.ts');
    const file = JSON.parse(await readText(root, 'curriculum/comment-language.json'));
    file.outcomes[outcomeKey].nickname = 'newer shared edit';
    file.outcomes[outcomeKey].nicknameUpdatedAt = 60;
    file.outcomes[outcomeKey].updatedAt = 60;
    file.updatedAt = 60;
    await writeText(root, 'curriculum/comment-language.json', `${JSON.stringify(file, null, 2)}\n`);
    await (await import('/src/lib/curriculum-folder-sync.svelte.ts')).curriculumFolderSync.now();
    return JSON.parse(localStorage.getItem('tg-curriculum-comment-language-v3')).outcomes[outcomeKey].nickname;
  }, outcomeKey);
  assert.equal(refreshed, 'newer shared edit', 'a later shared-file edit reaches the running app even with a lower wall-clock timestamp');

  // Copying a standalone bank into banks/ should recover its missing course,
  // while the shared workspace keeps its existing course definitions.
  const copied = await page.evaluate(async () => {
    const { readText, writeRepoFolder } = await import('/src/lib/folder-io.ts');
    const { exportAppDataToRepoEntries } = await import('/src/git/repoDataModel.ts');
    const { localWorkspace } = await import('/src/lib/local-workspace.svelte.ts');
    const { curriculumFolderSync } = await import('/src/lib/curriculum-folder-sync.svelte.ts');
    const root = await window.showDirectoryPicker();
    const banks = await root.getDirectoryHandle('banks');
    const bank = await banks.getDirectoryHandle('copied-portable', { create: true });
    const questions = [{ id: 'copied-q', body: 'Solve $x + 1 = 3$.', classId: 'portable', points: 2, tags: [], createdAt: 1 }];
    const courses = [{ id: 'portable', name: 'Portable course', units: [] }, { id: 'math', name: 'Old mathematics name', units: [] }];
    await writeRepoFolder(bank, exportAppDataToRepoEntries({
      questions, customClasses: courses, narratives: [], savedTests: [], images: [],
    }), 'absent');
    const snapshot = await readText(bank, 'curriculum/snapshot.json');
    await localWorkspace.reload();
    await curriculumFolderSync.now();
    const catalog = JSON.parse(await readText(root, 'curriculum/catalog.json'));
    const manifest = JSON.parse(await readText(bank, 'manifest.json'));
    return {
      portableName: catalog.courses.find(course => course.id === 'portable')?.name,
      sharedName: catalog.courses.find(course => course.id === 'math')?.name,
      snapshotPreserved: snapshot === await readText(bank, 'curriculum/snapshot.json'),
      manifestListsSnapshot: manifest.files.some(file => file.path === 'curriculum/snapshot.json'),
    };
  });
  assert.deepEqual(copied, { portableName: 'Portable course', sharedName: 'Mathematics', snapshotPreserved: true, manifestListsSnapshot: true });
  await page.evaluate(() => { location.hash = '#/build'; });
  await page.waitForSelector('.scope-trigger[aria-label^="Classes:"]', { visible: true });
  await page.click('.scope-trigger[aria-label^="Classes:"]');
  await page.click('[aria-label="Only Portable course"]');
  await page.waitForFunction(() => document.querySelector('.picker-item')?.textContent.includes('Solve'));
  assert.deepEqual(errors, []);
  console.log('Curriculum folder sync passed: stale cache replacement, pending edit acknowledgement, shared-file refresh, and course recovery from a copied bank.');
} finally {
  await browser?.close();
  await server.close();
}
