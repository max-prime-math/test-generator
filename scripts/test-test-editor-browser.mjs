import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';

const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
let browser;
try {
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  let page = await browser.newPage();
  const errors = [];
  const setup = async page => {
    await page.setViewport({ width: 1500, height: 1000 });
    page.on('pageerror', e => errors.push(e.message));
    await page.evaluateOnNewDocument(() => {
      localStorage.setItem('tg-tutorial-done-v1', '1');
      window.confirm = () => true;
      Object.defineProperty(FileSystemDirectoryHandle.prototype, 'queryPermission', { configurable: true, value: async () => 'granted' });
      Object.defineProperty(FileSystemDirectoryHandle.prototype, 'requestPermission', { configurable: true, value: async () => 'granted' });
      window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle(window.__fixtureFolder ?? 'test-editor-legacy', { create: true });
    });
  };
  await setup(page);
  const url = `${server.resolvedUrls.local[0]}#/build`;
  await page.goto(url, { waitUntil: 'networkidle0' });
  const clickText = async (selector, text) => {
    assert.ok(await page.evaluate((selector, text) => {
      const button = [...document.querySelectorAll(selector)].find(el => el.textContent.trim() === text);
      if (!button) return false;
      button.click(); return true;
    }, selector, text), `Missing ${text}`);
  };
  const fill = async (selector, value) => page.$eval(selector, (el, value) => {
    el.value = value; el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
  const saved = id => page.evaluate(id => JSON.parse(localStorage.getItem('tg-test-library-v1')).find(t => t.id === id), id);
  const waitSaved = async (id, subtitle) => page.waitForFunction((id, subtitle) => JSON.parse(localStorage.getItem('tg-test-library-v1') ?? '[]').find(t => t.id === id)?.config.subtitle === subtitle, {}, id, subtitle);

  const ids = await page.evaluate(async () => {
    const { testLibrary } = await import('/src/lib/test-library.svelte.ts');
    const { testEditor } = await import('/src/lib/test-editor.svelte.ts');
    const { defaultTestConfig } = await import('/src/lib/types.ts');
    const { bank } = await import('/src/lib/bank.svelte.ts');
    bank.importJson(JSON.stringify([{ id: 'reliable-q', body: 'Solve $x+1=3$.', solution: '$x=2$', points: 4, classId: '', unitId: '', sectionId: '', tags: [], createdAt: 100 }]));
    const first = testLibrary.saveAs('First test', null, null, 'test', { ...defaultTestConfig('Custom title'), selectedIds: ['reliable-q'] });
    const second = testLibrary.saveAs('Second test', null, null, 'quiz', defaultTestConfig('Second title'));
    await testEditor.open(first.id);
    return { first: first.id, second: second.id, createdAt: first.createdAt };
  });
  await page.waitForFunction(() => document.querySelector('#t-title')?.value === 'Custom title');
  await clickText('.test-toolbar button', '☰ Saved Tests');
  // Use the real saved-test controls after expanding the unclassified group.
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('.saved-group-header')) if (el.textContent.includes('Uncategorized') && el.querySelector('button').title === 'Expand') el.querySelector('button').click();
  });
  // Nested configuration edits are saved to the same named test without Save.
  await fill('#t-subtitle', 'Autosaved first');
  await page.evaluate(async () => {
    const { testEditor } = await import('/src/lib/test-editor.svelte.ts');
    testEditor.config.answerSpaceOverrides['reliable-q'] = 7;
    testEditor.config.pageBreakAfter['reliable-q'] = { pagebreak: true };
    testEditor.config.bonusQuestionIds = ['reliable-q'];
  });
  await waitSaved(ids.first, 'Autosaved first');
  await page.waitForFunction(() => document.querySelector('.save-status')?.textContent === 'Saved locally');
  let first = await saved(ids.first);
  assert.equal(first.createdAt, ids.createdAt);
  assert.ok(first.updatedAt >= first.createdAt);
  assert.equal(first.config.answerSpaceOverrides['reliable-q'], 7);
  assert.deepEqual(first.config.pageBreakAfter['reliable-q'], { pagebreak: true });
  assert.equal(first.questionSnapshots[0].id, 'reliable-q');
  assert.equal(first.config.title, 'Custom title');

  // Flush before loading another test, even before the debounce expires.
  await fill('#t-subtitle', 'Before opening second');
  await page.click('button[title="Load Second test"]');
  await page.waitForFunction(() => document.querySelector('#t-title')?.value === 'Second title');
  assert.equal((await saved(ids.first)).config.subtitle, 'Before opening second');
  await fill('#t-subtitle', 'Second edit');
  await page.click('button[title="Load First test"]');
  await page.waitForFunction(() => document.querySelector('#t-title')?.value === 'Custom title');
  assert.equal((await saved(ids.second)).config.subtitle, 'Second edit');

  // Navigation flushes; the Bank class picker must never rewrite a custom title.
  await fill('#t-subtitle', 'Mode switch');
  await clickText('nav button', 'Bank');
  await page.evaluate(async () => {
    const { appState } = await import('/src/lib/app-state.svelte.ts');
    const { customClasses } = await import('/src/lib/custom-classes.svelte.ts');
    const cls = customClasses.add('Different class');
    appState.setLastClassId(cls.id);
  });
  await clickText('nav button', 'Build');
  await waitSaved(ids.first, 'Mode switch');
  assert.equal(await page.$eval('#t-title', el => el.value), 'Custom title');

  // A synchronous recovery write survives reload before the 500ms save timer.
  await fill('#t-subtitle', 'Immediate reload');
  await page.reload({ waitUntil: 'networkidle0' });
  assert.equal(await page.$eval('#t-subtitle', el => el.value), 'Immediate reload');
  assert.equal(await page.$eval('.test-name', el => el.textContent.trim()), 'First test');
  await waitSaved(ids.first, 'Immediate reload');

  // Closing and reopening the tab also preserves the edit identity.
  await fill('#t-subtitle', 'Closed tab');
  await page.close();
  page = await browser.newPage(); await setup(page);
  await page.goto(url, { waitUntil: 'networkidle0' });
  assert.equal(await page.$eval('#t-subtitle', el => el.value), 'Closed tab');
  assert.equal(await page.$eval('.test-name', el => el.textContent.trim()), 'First test');
  await waitSaved(ids.first, 'Closed tab');

  // Delay asset capture and edit during the first save. The final save must
  // contain the newest config and selected content, never the older snapshot.
  const race = await page.evaluate(async () => {
    const { testEditor } = await import('/src/lib/test-editor.svelte.ts');
    const { imageStore } = await import('/src/lib/image-store.svelte.ts');
    const { bank } = await import('/src/lib/bank.svelte.ts');
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><circle cx="5" cy="5" r="3"/></svg>');
    await imageStore.put('slow-fixture', svg, 'svg');
    bank.importJson(JSON.stringify([{ id: 'image-q', body: '#image("/imgs/slow-fixture.svg")', solution: '', images: ['slow-fixture'], points: 1, classId: '', unitId: '', sectionId: '', tags: [], createdAt: 100 }]));
    const put = imageStore.put.bind(imageStore);
    let release; let entered;
    const gate = new Promise(resolve => release = resolve);
    const waiting = new Promise(resolve => entered = resolve);
    imageStore.put = async (...args) => { entered(); await gate; return put(...args); };
    testEditor.config.selectedIds.push('image-q');
    testEditor.config.subtitle = 'Older save';
    const saving = testEditor.flush();
    await waiting;
    testEditor.config.subtitle = 'Newest save';
    testEditor.config.answerSpaceOverrides['image-q'] = 9;
    release();
    const success = await saving;
    imageStore.put = put;
    return { success, error: testEditor.error };
  });
  assert.deepEqual(race, { success: true, error: '' });
  first = await saved(ids.first);
  assert.equal(first.config.subtitle, 'Newest save');
  assert.equal(first.config.answerSpaceOverrides['image-q'], 9);
  assert.equal(first.questionSnapshots.length, 2);
  assert.match(first.questionSnapshots[1].body, /testasset-/);

  // Quota errors are visible, don't publish an in-memory false success, and
  // don't allow loading a different test over the unsaved work.
  const failure = await page.evaluate(async id => {
    const { testEditor } = await import('/src/lib/test-editor.svelte.ts');
    const { testLibrary } = await import('/src/lib/test-library.svelte.ts');
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === 'tg-test-library-v1') throw new DOMException('Fixture full', 'QuotaExceededError');
      return setItem.call(this, key, value);
    };
    testEditor.config.subtitle = 'Recover from quota';
    const success = await testEditor.flush();
    const opened = await testEditor.open(id);
    const result = { success, opened, error: testEditor.error, current: testLibrary.get(testEditor.testId).config.subtitle,
      recovery: JSON.parse(localStorage.getItem('tg-test-draft-v1')).subtitle };
    Storage.prototype.setItem = setItem;
    return result;
  }, ids.second);
  assert.equal(failure.success, false); assert.equal(failure.opened, false);
  assert.equal(failure.current, 'Newest save'); assert.equal(failure.recovery, 'Recover from quota');
  assert.ok(failure.error);
  await page.waitForSelector('.save-error');
  await clickText('.save-error button', 'Retry save');
  await waitSaved(ids.first, 'Recover from quota');

  // Freeze both config and content in ordinary library storage, then verify
  // the legacy folder and independent workspace observe these exact edits.
  const folder = await page.evaluate(async id => {
    const { localFolderBank } = await import('/src/lib/local-folder-bank.svelte.ts');
    const { localWorkspace } = await import('/src/lib/local-workspace.svelte.ts');
    const { testEditor } = await import('/src/lib/test-editor.svelte.ts');
    const { readRepoFolder } = await import('/src/lib/folder-io.ts');
    const { importRepoEntriesToAppData } = await import('/src/git/repoDataModel.ts');
    await localFolderBank.chooseFolder();
    testEditor.config.subtitle = 'Legacy folder edit'; await testEditor.flush();
    await localFolderBank.saveNow();
    const legacy = importRepoEntriesToAppData(await readRepoFolder(await window.showDirectoryPicker())).appData.savedTests.find(t => t.id === id);
    await localFolderBank.disconnect();
    window.__fixtureFolder = 'test-editor-workspace';
    await localWorkspace.chooseFolder();
    testEditor.config.subtitle = 'Workspace edit'; await testEditor.flush();
    await localWorkspace.saveNow();
    const root = await window.showDirectoryPicker();
    const directory = await (await (await root.getDirectoryHandle('tests')).getDirectoryHandle('_unclassified')).getDirectoryHandle(id);
    const data = importRepoEntriesToAppData(await readRepoFolder(directory)).appData;
    await localWorkspace.disconnect();
    return { legacy: legacy.config.subtitle, workspace: data.savedTests[0].config.subtitle, questions: data.questions.length, images: data.images.length };
  }, ids.first);
  assert.deepEqual(folder, { legacy: 'Legacy folder edit', workspace: 'Workspace edit', questions: 2, images: 1 });

  // A delayed workspace save must not attach an older selection's snapshots.
  assert.equal(await page.evaluate(async id => {
    const { testLibrary } = await import('/src/lib/test-library.svelte.ts');
    const current = testLibrary.get(id);
    const before = JSON.stringify(current.questionSnapshots);
    testLibrary.setContentSnapshot(id, [], [], { ...current.config, selectedIds: [] });
    return JSON.stringify(testLibrary.get(id).questionSnapshots) === before;
  }, ids.first), true);

  // A newer external edit is not silently overwritten; Save As recovers the
  // local changes under a different ID while preserving the original.
  const conflict = await page.evaluate(async () => {
    const { testEditor } = await import('/src/lib/test-editor.svelte.ts');
    const { testLibrary } = await import('/src/lib/test-library.svelte.ts');
    const id = testEditor.testId;
    testLibrary.update(id, { ...testLibrary.get(id).config, subtitle: 'External edit' });
    testEditor.config.subtitle = 'Local conflict copy';
    const saved = await testEditor.flush();
    const error = testEditor.error;
    const copied = await testEditor.saveAs({ name: 'Recovered copy', classId: null, unitId: null, testType: 'test' });
    return { saved, error, copied, newId: testEditor.testId, oldSubtitle: testLibrary.get(id).config.subtitle,
      newSubtitle: testLibrary.get(testEditor.testId).config.subtitle };
  });
  assert.equal(conflict.saved, false); assert.match(conflict.error, /changed elsewhere/);
  assert.equal(conflict.copied, true); assert.notEqual(conflict.newId, ids.first);
  assert.equal(conflict.oldSubtitle, 'External edit'); assert.equal(conflict.newSubtitle, 'Local conflict copy');

  // Unnamed drafts are retained while visiting named tests, including reload.
  await page.evaluate(async id => {
    const { testEditor } = await import('/src/lib/test-editor.svelte.ts');
    const { defaultTestConfig } = await import('/src/lib/types.ts');
    await testEditor.newTest(defaultTestConfig('Unnamed'));
    testEditor.config.subtitle = 'Keep my unnamed draft';
    await testEditor.open(id);
  }, ids.second);
  await page.reload({ waitUntil: 'networkidle0' });
  await clickText('.test-toolbar button', 'Resume draft');
  await page.waitForFunction(() => document.querySelector('#t-subtitle')?.value === 'Keep my unnamed draft');
  assert.equal(await page.$eval('.save-status', el => el.textContent), 'Draft saved locally');

  // A recovery storage failure is reported immediately, before any debounce.
  const recoveryFailure = await page.evaluate(async () => {
    const { testEditor } = await import('/src/lib/test-editor.svelte.ts');
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === 'tg-test-draft-v1') throw new DOMException('Fixture full', 'QuotaExceededError');
      return setItem.call(this, key, value);
    };
    testEditor.config.subtitle = 'Recovery write failed';
    testEditor.checkpoint();
    const error = testEditor.recoveryError;
    Storage.prototype.setItem = setItem;
    testEditor.checkpoint();
    return { error, recovered: !testEditor.recoveryError };
  });
  assert.ok(recoveryFailure.error); assert.equal(recoveryFailure.recovered, true);

  // Legacy flat drafts have no reliable source ID. Preserve their work as an
  // unnamed draft and never guess a saved test to overwrite.
  await page.evaluate(async () => {
    const { defaultTestConfig } = await import('/src/lib/types.ts');
    localStorage.setItem('tg-test-draft-v1', JSON.stringify({ ...defaultTestConfig('Legacy draft'), subtitle: 'Before autosave upgrade' }));
  });
  await page.reload({ waitUntil: 'networkidle0' });
  assert.equal(await page.$eval('#t-title', el => el.value), 'Legacy draft');
  assert.equal(await page.$eval('#t-subtitle', el => el.value), 'Before autosave upgrade');
  assert.equal(await page.evaluate(async () => (await import('/src/lib/test-editor.svelte.ts')).testEditor.testId), null);
  assert.equal((await saved(ids.first)).config.subtitle, 'External edit');

  await page.screenshot({ path: '/tmp/test-edit-desktop.png' });
  await page.setViewport({ width: 420, height: 900 });
  await page.screenshot({ path: '/tmp/test-edit-mobile.png' });
  assert.deepEqual(errors, []);
  console.log('Test editing browser regressions passed: autosave; stable ID; frozen content; mode changes; immediate reload; tab close/reopen; overlapping saves; quota recovery; folder/workspace persistence; conflicts; unnamed draft recovery.');
} finally {
  await browser?.close();
  await server.close();
}
