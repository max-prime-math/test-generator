import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';

// Isolated browser profile and origin-private filesystem only. Never opens host folders.
// A fresh Vite graph avoids loading duplicate store modules via stale HMR URLs.
// Passing TESTGEN_TEST_URL requires a freshly started external dev server.
const server = process.env.TESTGEN_TEST_URL ? null : await createServer({
  server: { host: '127.0.0.1', port: 0, strictPort: false }, logLevel: 'error',
});
await server?.listen();
const url = process.env.TESTGEN_TEST_URL ?? server.resolvedUrls.local[0];
let browser;
try {
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 1000 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('tg-tutorial-done-v1', '1');
    window.confirm = () => true;
    Object.defineProperty(FileSystemDirectoryHandle.prototype, 'queryPermission', { configurable: true, value: async () => 'granted' });
    Object.defineProperty(FileSystemDirectoryHandle.prototype, 'requestPermission', { configurable: true, value: async () => 'granted' });
    window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('workspace-fixture', { create: true });
    const getFile = FileSystemFileHandle.prototype.getFile;
    window.__openedFiles = [];
    FileSystemFileHandle.prototype.getFile = async function (...args) {
      window.__openedFiles.push(this.name);
      if (window.__slowWorkspaceReads) await new Promise(resolve => setTimeout(resolve, 40));
      return getFile.apply(this, args);
    };
    document.addEventListener('DOMContentLoaded', () => {
      new MutationObserver(() => {
        const phase = document.querySelector('.workspace-loading-overlay .phase')?.textContent;
        if (!phase) return;
        const phases = new Set(JSON.parse(sessionStorage.getItem('loading-test-phases') ?? '[]'));
        phases.add(phase);
        sessionStorage.setItem('loading-test-phases', JSON.stringify([...phases]));
      }).observe(document.body, { childList: true, subtree: true, characterData: true });
    });
  });
  await page.goto(url, { waitUntil: 'networkidle0' });
  await page.evaluate(async () => {
    const { writeRepoFolder, writeText } = await import('/src/lib/folder-io.ts');
    const { exportAppDataToRepoEntries } = await import('/src/git/repoDataModel.ts');
    const { stringifyGradebookBackup } = await import('/src/lib/gradebook-backup.ts');
    const { normalizeGradebookData } = await import('/src/lib/gradebook-model.ts');
    const root = await window.showDirectoryPicker();
    // A migrated workspace may retain a complete legacy bank at the root.
    // banks/ must take precedence without deleting or rewriting those files.
    await writeRepoFolder(root, exportAppDataToRepoEntries({ questions: [], narratives: [], customClasses: [], savedTests: [], images: [] }), 'absent');
    const banks = await root.getDirectoryHandle('banks', { create: true });
    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aK2UAAAAASUVORK5CYII='), c => c.charCodeAt(0));
    for (const [id, name] of [['bank-a', 'Precalc Bank A'], ['bank-b', 'Precalc Bank B']]) {
      const data = { questions: [{ id: 'same-question-id', body: `${name}: solve $x^2 = 4$. #image("/imgs/graph.png")`, images: ['graph'], classId: 'shared-precalc', points: 3, tags: ['algebra'], createdAt: 1 }],
        narratives: [], customClasses: [{ id: 'shared-precalc', name: 'Pre-Calculus 40S', units: [] }], savedTests: [], images: [{ name: 'graph', ext: 'png', bytes: id === 'bank-b' ? new Uint8Array([...png, 0]) : png }] };
      const folder = await banks.getDirectoryHandle(id, { create: true });
      await writeRepoFolder(folder, exportAppDataToRepoEntries(data), 'absent');
      await writeText(folder, 'bank-name.json', JSON.stringify({ name }));
    }
    const gradebook = normalizeGradebookData({ version: 1, students: [{ id: 'private-student', firstName: 'Private', lastName: 'PRIVATE_STUDENT_SENTINEL', createdAt: 1, updatedAt: 1 }] });
    const grades = await root.getDirectoryHandle('gradebook', { create: true });
    await writeText(grades, 'gradebook.json', stringifyGradebookBackup(gradebook, 0));
  });
  const wrongModeError = await page.evaluate(async () => {
    const { localFolderBank } = await import('/src/lib/local-folder-bank.svelte.ts');
    try { await localFolderBank.chooseFolder(); return ''; }
    catch (error) { return error instanceof Error ? error.message : String(error); }
  });
  assert.match(wrongModeError, /contains banks\/ and is a workspace root/);
  await page.evaluate(() => { window.__slowWorkspaceReads = true; });
  const initialLoad = Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0' }),
    page.evaluate(async () => { const { localWorkspace } = await import('/src/lib/local-workspace.svelte.ts'); await localWorkspace.chooseFolder(); }),
  ]);
  await page.waitForFunction(() => {
    const progress = document.querySelector('.workspace-loading-overlay progress');
    return progress && progress.hasAttribute('value') && progress.value > 0;
  });
  assert.equal(await page.$eval('.workspace-app-shell', element => element.inert), true);
  await page.screenshot({ path: '/tmp/testgen-workspace-loading.png' });
  await initialLoad;
  async function ready() {
    try {
      await page.waitForFunction(async () => {
        const { localWorkspace } = await import('/src/lib/local-workspace.svelte.ts');
        return localWorkspace.status === 'ready' || localWorkspace.status === 'error';
      }, { timeout: 15000 });
      const state = await page.evaluate(async () => {
        const { localWorkspace } = await import('/src/lib/local-workspace.svelte.ts');
        return { status: localWorkspace.status, error: localWorkspace.error };
      });
      assert.equal(state.status, 'ready', JSON.stringify(state));
    } catch (cause) {
      console.error('Workspace browser diagnostics:', await page.evaluate(async () => {
        const { localWorkspace } = await import('/src/lib/local-workspace.svelte.ts');
        return { status: localWorkspace.status, error: localWorkspace.error, connected: localWorkspace.connected };
      }), errors);
      throw cause;
    }
  }
  await ready();
  assert.equal(await page.$('.workspace-loading-overlay'), null);
  assert.equal(await page.$eval('.workspace-app-shell', element => element.inert), false);
  const loadingPhases = await page.evaluate(() => JSON.parse(sessionStorage.getItem('loading-test-phases') ?? '[]'));
  assert.ok(loadingPhases.some(phase => phase.startsWith('Reading bank')));
  assert.ok(loadingPhases.includes('Indexing questions'));
  assert.ok(loadingPhases.includes('Loading diagrams and images'));
  const catalog = await page.evaluate(async () => {
    const { workspaceCatalog } = await import('/src/lib/workspace-catalog.svelte.ts');
    return { banks: workspaceCatalog.banks.length, questions: workspaceCatalog.questions.map(q => ({ id: q.id, classId: q.classId })), classes: workspaceCatalog.classes.length };
  });
  assert.equal(catalog.banks, 2);
  assert.equal(catalog.questions.length, 2);
  assert.equal(new Set(catalog.questions.map(q => q.id)).size, 2);
  assert.ok(catalog.questions.every(q => q.classId === 'shared-precalc'));
  assert.equal(catalog.classes, 1);
  assert.equal(await page.$('.workspace-search'), null, 'Removed cross-bank dropdown must not return');
  // The browser's empty starter bank is left out of bank menus once the folder brings other banks.
  const hidden = await page.evaluate(async () => {
    const { WorkspaceCatalog } = await import('/src/lib/workspace-catalog.svelte.ts');
    const empty = { questions: [], narratives: [], customClasses: [], savedTests: [] };
    const other = { id: 'bank-a', name: 'A', data: { ...empty, questions: [{ id: 'q', body: 'Q', points: 1, tags: [], createdAt: 1 }] } };
    const hiddenIds = async banks => { const catalog = new WorkspaceCatalog(); await catalog.replace(banks); return [...catalog.hiddenBankIds]; };
    return {
      withOthers: await hiddenIds([{ id: 'default', name: 'Local Bank', data: empty }, other]),
      alone: await hiddenIds([{ id: 'default', name: 'Local Bank', data: empty }]),
      withContent: await hiddenIds([{ id: 'default', name: 'Local Bank', data: other.data }, other]),
    };
  });
  assert.deepEqual(hidden, { withOthers: ['default'], alone: [], withContent: [] });
  await page.evaluate(() => { window.location.hash = '/build'; });
  const scopeClick = async (label, selector) => {
    await page.click(`.scope-trigger[aria-label^="${label}:"]`);
    await page.waitForSelector('.scope-menu');
    await page.click(`.scope-menu ${selector}`);
  };
  await scopeClick('Classes', '.scope-option[data-id="shared-precalc"] .scope-only');
  await page.waitForFunction(() => document.querySelectorAll('.picker-list .picker-item').length === 2);
  await scopeClick('Banks', '.scope-option[data-id="bank-a"] .scope-only');
  await page.waitForFunction(() => document.querySelectorAll('.picker-list .picker-item').length === 1);
  await scopeClick('Banks', '.scope-option[data-id="bank-b"] input');
  await page.waitForFunction(() => document.querySelectorAll('.picker-list .picker-item').length === 2);
  await page.keyboard.press('Escape');
  await scopeClick('Banks', '.scope-foot button');
  await page.waitForFunction(() => document.querySelectorAll('.picker-list .picker-item').length === 2);
  await page.waitForFunction(() => Math.abs(document.querySelector('.build-tab').getBoundingClientRect().left) < 1);
  await page.screenshot({ path: '/tmp/testgen-workspace-multibank.png' });
  await page.evaluate(() => { window.location.hash = '/bank'; });
  const testId = await page.evaluate(async () => {
    const { workspaceCatalog } = await import('/src/lib/workspace-catalog.svelte.ts');
    const { testLibrary } = await import('/src/lib/test-library.svelte.ts');
    const { defaultTestConfig } = await import('/src/lib/types.ts');
    const { localWorkspace } = await import('/src/lib/local-workspace.svelte.ts');
    const test = testLibrary.saveAs('Mixed-bank exam', 'shared-precalc', null, 'exam', { ...defaultTestConfig(), selectedIds: workspaceCatalog.questions.map(q => q.id) });
    await localWorkspace.saveNow();
    return test.id;
  });
  const disk = await page.evaluate(async testId => {
    const { readRepoFolder, readText } = await import('/src/lib/folder-io.ts');
    const { importRepoEntriesToAppData } = await import('/src/git/repoDataModel.ts');
    const root = await window.showDirectoryPicker();
    const banks = await root.getDirectoryHandle('banks');
    const bankA = await readRepoFolder(await banks.getDirectoryHandle('bank-a'));
    const tests = await root.getDirectoryHandle('tests');
    const testEntries = await readRepoFolder(await (await tests.getDirectoryHandle('shared-precalc')).getDirectoryHandle(testId));
    const test = importRepoEntriesToAppData(testEntries).appData;
    const serializedShared = JSON.stringify([...bankA, ...testEntries]);
    return { bankTests: importRepoEntriesToAppData(bankA).appData.savedTests.length, questionCount: test.questions.length,
      snapshots: test.savedTests[0].questionSnapshots.length, images: test.images.length,
      leakedStudent: serializedShared.includes('PRIVATE_STUDENT_SENTINEL'), gradebook: await (async () => {
        const { gradebookFolderSync } = await import('/src/lib/gradebook-folder-sync.svelte.ts');
        await gradebookFolderSync.now();
        return readText(await (await root.getDirectoryHandle('gradebook')).getDirectoryHandle('records'), 'students.json');
      })() };
  }, testId);
  assert.equal(disk.bankTests, 0);
  assert.equal(disk.questionCount, 2);
  assert.equal(disk.snapshots, 2);
  assert.equal(disk.images, 2);
  assert.equal(disk.leakedStudent, false);
  assert.ok(disk.gradebook.includes('PRIVATE_STUDENT_SENTINEL'));
  const classMove = await page.evaluate(async testId => {
    const { localWorkspace } = await import('/src/lib/local-workspace.svelte.ts');
    const { testLibrary } = await import('/src/lib/test-library.svelte.ts');
    const { readWorkspaceTests } = await import('/src/lib/workspace-tests.ts');
    const { readText } = await import('/src/lib/folder-io.ts');
    const tests = await (await window.showDirectoryPicker()).getDirectoryHandle('tests');
    testLibrary.updateMetadata(testId, { classId: 'calculus' });
    await localWorkspace.saveNow();
    const old = await (await tests.getDirectoryHandle('shared-precalc')).getDirectoryHandle(testId);
    const archived = Boolean(await readText(old, 'deleted.json'));
    const moved = await readWorkspaceTests(tests);
    testLibrary.updateMetadata(testId, { classId: 'shared-precalc' });
    await localWorkspace.saveNow();
    const restored = await readWorkspaceTests(tests);
    return { archived, movedClass: moved.tests[0].classId, restoredClass: restored.tests[0].classId, count: restored.tests.length };
  }, testId);
  assert.deepEqual(classMove, { archived: true, movedClass: 'calculus', restoredClass: 'shared-precalc', count: 1 });
  // Idle autosave must not reload the entire image database. Actual edits,
  // including image-only changes, still trigger a save on the next tick.
  const idle = await page.evaluate(async () => {
    const { localWorkspace } = await import('/src/lib/local-workspace.svelte.ts');
    await localWorkspace.saveNow();
    await localWorkspace.saveNow(); // settle any snapshots written by the first pass
    window.__imageReads = 0;
    const getAll = IDBObjectStore.prototype.getAll;
    IDBObjectStore.prototype.getAll = function (...args) {
      if (this.name === 'images') window.__imageReads += 1;
      return getAll.apply(this, args);
    };
    const before = localWorkspace.lastSavedAt;
    await new Promise(resolve => setTimeout(resolve, 5500));
    return { unchanged: localWorkspace.lastSavedAt === before, reads: window.__imageReads };
  });
  assert.deepEqual(idle, { unchanged: true, reads: 0 });
  // A Gradebook edit reaches the folder on its own, without a workspace save.
  const editSaved = await page.evaluate(async () => {
    const { gradebook } = await import('/src/lib/gradebook.svelte.ts');
    const { readText } = await import('/src/lib/folder-io.ts');
    const records = async () => readText(await (await (await window.showDirectoryPicker()).getDirectoryHandle('gradebook')).getDirectoryHandle('records'), 'students.json');
    const id = gradebook.students[0].id;
    gradebook.updateStudent(id, { lastName: 'AUTOSAVED_PRIVATE_STUDENT' });
    const deadline = Date.now() + 10000;
    while (!(await records())?.includes('AUTOSAVED_PRIVATE_STUDENT') && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100));
    const saved = (await records()).includes('AUTOSAVED_PRIVATE_STUDENT');
    // Restore the sentinel for subsequent isolation checks.
    gradebook.updateStudent(id, { lastName: 'PRIVATE_STUDENT_SENTINEL' });
    while (!(await records())?.includes('PRIVATE_STUDENT_SENTINEL') && Date.now() < deadline + 10000) await new Promise(resolve => setTimeout(resolve, 100));
    return saved;
  });
  assert.equal(editSaved, true);
  const imageSaved = await page.evaluate(async () => {
    const { localWorkspace } = await import('/src/lib/local-workspace.svelte.ts');
    const { imageStore } = await import('/src/lib/image-store.svelte.ts');
    const before = localWorkspace.lastSavedAt;
    const image = await imageStore.get('graph');
    await imageStore.put(image.name, image.bytes, image.ext);
    const deadline = Date.now() + 10000;
    while (localWorkspace.lastSavedAt === before && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
    return localWorkspace.lastSavedAt !== before;
  });
  assert.equal(imageSaved, true, 'Image-only edits invalidate the idle autosave cache');
  // Bank switches run in place; the app must stay loaded and report no error.
  await page.evaluate(() => { window.__sameDocument = true; });
  assert.equal(await page.evaluate(async () => { const { bankWorkspaces } = await import('/src/lib/bank-workspaces.svelte.ts'); await bankWorkspaces.switchBank('bank-b'); if (bankWorkspaces.switchError) throw new Error(bankWorkspaces.switchError); return window.__sameDocument; }), true);
  await ready();
  const afterSwitch = await page.evaluate(async () => {
    const { testLibrary } = await import('/src/lib/test-library.svelte.ts');
    const { bankWorkspaces } = await import('/src/lib/bank-workspaces.svelte.ts');
    return { active: bankWorkspaces.activeBankId, tests: testLibrary.tests.length, gradebook: localStorage.getItem('tg-gradebook-v1') };
  });
  assert.equal(afterSwitch.active, 'bank-b');
  assert.equal(afterSwitch.tests, 1);
  assert.ok(afterSwitch.gradebook.includes('PRIVATE_STUDENT_SENTINEL'));
  // Switching keeps every bank's images mounted, and mounts each bank's own copy
  // of an image name the banks share (bank-b's "graph" is one byte longer).
  // A bank left without changes keeps its timestamp, so it is not exported again.
  const sharedImages = await page.evaluate(async () => {
    const { bankWorkspaces } = await import('/src/lib/bank-workspaces.svelte.ts');
    const { imageStore } = await import('/src/lib/image-store.svelte.ts');
    const { workspaceCatalog } = await import('/src/lib/workspace-catalog.svelte.ts');
    const size = async () => (await imageStore.get('graph')).bytes.byteLength;
    const updatedAt = id => bankWorkspaces.banks.find(bank => bank.id === id).updatedAt;
    const b = await size();
    const bankBAt = updatedAt('bank-b');
    await bankWorkspaces.switchBank('bank-a');
    const a = await size();
    const catalogMounted = workspaceCatalog.images.every(image => imageStore.has(image.name));
    await bankWorkspaces.switchBank('bank-b');
    return { grew: b - a, catalogMounted, bankBUnchanged: updatedAt('bank-b') === bankBAt, backOnB: await size() === b };
  });
  assert.deepEqual(sharedImages, { grew: 1, catalogMounted: true, bankBUnchanged: true, backOnB: true });
  await ready();
  // A new question can be saved from the Editor to a bank that is not open,
  // taking its picture along; a picture name the other bank uses differently is refused.
  const savedElsewhere = await page.evaluate(async () => {
    const { editor } = await import('/src/lib/editor/editor-state.svelte.ts');
    const { bank } = await import('/src/lib/bank.svelte.ts');
    const { bankWorkspaces } = await import('/src/lib/bank-workspaces.svelte.ts');
    const { imageStore } = await import('/src/lib/image-store.svelte.ts');
    const { localWorkspace } = await import('/src/lib/local-workspace.svelte.ts');
    const { readRepoFolder } = await import('/src/lib/folder-io.ts');
    const { importRepoEntriesToAppData } = await import('/src/git/repoDataModel.ts');
    await imageStore.put('fresh-pic', new Uint8Array([1, 2, 3, 4]), 'png');
    const draft = editor.create();
    Object.assign(draft.fields, { body: 'Saved to the other bank #image("/imgs/fresh-pic.png")', classId: 'shared-precalc', points: 2 });
    editor.setTarget(draft, 'bank-a');
    const result = await editor.save(draft);
    const clash = editor.create();
    Object.assign(clash.fields, { body: 'Uses a shared picture name #image("/imgs/graph.png")', points: 1 });
    editor.setTarget(clash, 'bank-a');
    let clashError = '';
    try { await editor.save(clash); } catch (error) { clashError = error.message; }
    editor.setTarget(clash, bankWorkspaces.activeBankId);
    editor.discard(clash.id);
    const snapshot = await bankWorkspaces.readBankSnapshot('bank-a');
    await localWorkspace.saveNow();
    const folder = await (await (await window.showDirectoryPicker()).getDirectoryHandle('banks')).getDirectoryHandle('bank-a');
    const saved = importRepoEntriesToAppData(await readRepoFolder(folder)).appData;
    return {
      bankId: result.bankId,
      notInOpenBank: !bank.questions.some(q => q.body.startsWith('Saved to the other bank')),
      inSnapshot: snapshot.questions.some(q => q.id === result.id),
      pictureWent: snapshot.images.some(image => image.name === 'fresh-pic'),
      inFolder: saved.questions.some(q => q.id === result.id) && saved.images.some(image => image.name === 'fresh-pic'),
      clashRefused: /different picture named “graph”/.test(clashError),
    };
  });
  assert.deepEqual(savedElsewhere, { bankId: 'bank-a', notInOpenBank: true, inSnapshot: true, pictureWent: true, inFolder: true, clashRefused: true });
  // An inactive bank's snapshot can hold images mounted from every workspace
  // bank (here ~54 MB, beyond the 50 MB repo limit). Only images its own
  // content uses may be exported, and the save must not fail on the rest.
  const inactiveExport = await page.evaluate(async () => {
    const { bankWorkspaces } = await import('/src/lib/bank-workspaces.svelte.ts');
    const { localWorkspace } = await import('/src/lib/local-workspace.svelte.ts');
    const { openImageDb, BANK_IMAGE_STORE, transactionDone } = await import('/src/lib/image-db.ts');
    const database = await openImageDb();
    const tx = database.transaction(BANK_IMAGE_STORE, 'readwrite');
    for (let i = 0; i < 6; i++) {
      const bytes = new Uint8Array(9_000_000).fill(65 + i);
      tx.objectStore(BANK_IMAGE_STORE).put({ id: `bank-a:unused-${i}`, bankId: 'bank-a', image: { name: `unused-${i}`, ext: 'png', mime: 'image/png', size: bytes.length, bytes } });
    }
    await transactionDone(tx);
    database.close();
    bankWorkspaces.banks = bankWorkspaces.banks.map(bank => bank.id === 'bank-a' ? { ...bank, updatedAt: Date.now() + 1 } : bank);
    await localWorkspace.saveNow();
    const root = await window.showDirectoryPicker();
    const images = [];
    try { for await (const name of (await (await (await root.getDirectoryHandle('banks')).getDirectoryHandle('bank-a')).getDirectoryHandle('images')).keys()) images.push(name); } catch {}
    return { error: localWorkspace.error, unusedExported: images.filter(name => name.startsWith('unused-')) };
  });
  assert.deepEqual(inactiveExport, { error: null, unusedExported: [] });
  // A newly copied bank is discovered on restart and registered in the bank selector.
  await page.evaluate(async () => {
    const { readRepoFolder, writeRepoFolder, writeText } = await import('/src/lib/folder-io.ts');
    const { workspaceCatalog } = await import('/src/lib/workspace-catalog.svelte.ts');
    const root = await window.showDirectoryPicker();
    const banks = await root.getDirectoryHandle('banks');
    const entries = await readRepoFolder(await banks.getDirectoryHandle('bank-a'));
    const added = await banks.getDirectoryHandle('bank-c', { create: true });
    await writeRepoFolder(added, entries, 'absent');
    await writeText(added, 'bank-name.json', JSON.stringify({ name: 'Newly copied bank' }));
    if (workspaceCatalog.banks.length !== 2) throw new Error('Unexpected live merge before reload');
  });
  await page.reload({ waitUntil: 'networkidle0' });
  await ready();
  const discovered = await page.evaluate(async () => {
    const { workspaceCatalog } = await import('/src/lib/workspace-catalog.svelte.ts');
    const { bankWorkspaces } = await import('/src/lib/bank-workspaces.svelte.ts');
    return { count: workspaceCatalog.banks.length, registered: bankWorkspaces.banks.some(bank => bank.id === 'bank-c'),
      option: Boolean(document.querySelector('[aria-label="Current bank"] option[value="bank-c"]')) };
  });
  assert.deepEqual(discovered, { count: 3, registered: true, option: true });
  // Renaming a bank reaches its folder even though no question changed.
  const renamed = await page.evaluate(async () => {
    const { localWorkspace } = await import('/src/lib/local-workspace.svelte.ts');
    const { bankWorkspaces } = await import('/src/lib/bank-workspaces.svelte.ts');
    const { workspaceCatalog } = await import('/src/lib/workspace-catalog.svelte.ts');
    const id = bankWorkspaces.activeBankId;
    window.prompt = () => 'Renamed bank';
    document.querySelector('[aria-label="Rename this bank"]').click();
    await localWorkspace.saveNow();
    const folder = await (await (await window.showDirectoryPicker()).getDirectoryHandle('banks')).getDirectoryHandle(id);
    return { file: JSON.parse(await (await folder.getFileHandle('bank-name.json')).getFile().then(f => f.text())).name,
      catalog: workspaceCatalog.banks.find(bank => bank.id === id)?.name,
      sources: Object.values(workspaceCatalog.sources).filter(source => source.bankId === id).every(source => source.bankName === 'Renamed bank') };
  });
  assert.deepEqual(renamed, { file: 'Renamed bank', catalog: 'Renamed bank', sources: true });
  // A bank folder removed from the workspace leaves the bank switcher on Reload workspace.
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.evaluate(async () => {
    const { localWorkspace } = await import('/src/lib/local-workspace.svelte.ts');
    const { writeText } = await import('/src/lib/folder-io.ts');
    const banks = await (await window.showDirectoryPicker()).getDirectoryHandle('banks');
    await banks.removeEntry('bank-c', { recursive: true });
    const { bankWorkspaces } = await import('/src/lib/bank-workspaces.svelte.ts');
    const other = ['bank-a', 'bank-b'].find(id => id !== bankWorkspaces.activeBankId);
    await writeText(await banks.getDirectoryHandle(other), 'bank-name.json', JSON.stringify({ name: 'Named in folder' }));
    void localWorkspace.reload();
  })]);
  await ready();
  const removed = await page.evaluate(async () => {
    const { bankWorkspaces } = await import('/src/lib/bank-workspaces.svelte.ts');
    const { workspaceCatalog } = await import('/src/lib/workspace-catalog.svelte.ts');
    return { registered: bankWorkspaces.banks.some(bank => bank.id === 'bank-c'), catalog: workspaceCatalog.banks.length,
      name: workspaceCatalog.banks.find(bank => bank.id === bankWorkspaces.activeBankId)?.name,
      folderName: bankWorkspaces.banks.find(bank => ['bank-a', 'bank-b'].includes(bank.id) && bank.id !== bankWorkspaces.activeBankId)?.name };
  });
  assert.deepEqual(removed, { registered: false, catalog: 2, name: 'Renamed bank', folderName: 'Named in folder' });
  // Simulate receiving only one shared CLASS folder, without source banks or gradebook.
  await page.evaluate(async testId => {
    const { readRepoFolder, writeRepoFolder } = await import('/src/lib/folder-io.ts');
    const privateRoot = await navigator.storage.getDirectory();
    const sourceRoot = await window.showDirectoryPicker();
    const sourceTests = await sourceRoot.getDirectoryHandle('tests');
    const entries = await readRepoFolder(await (await sourceTests.getDirectoryHandle('shared-precalc')).getDirectoryHandle(testId));
    const sharedRoot = await privateRoot.getDirectoryHandle('tests-only-fixture', { create: true });
    const tests = await sharedRoot.getDirectoryHandle('tests', { create: true });
    const sharedClass = await tests.getDirectoryHandle('shared-precalc', { create: true });
    await writeRepoFolder(await sharedClass.getDirectoryHandle(testId, { create: true }), entries, 'absent');
    window.showDirectoryPicker = async () => sharedRoot;
  }, testId);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0' }),
    page.evaluate(async () => { const { localWorkspace } = await import('/src/lib/local-workspace.svelte.ts'); await localWorkspace.chooseFolder(); }),
  ]);
  await ready();
  const standalone = await page.evaluate(async () => {
    const { workspaceCatalog } = await import('/src/lib/workspace-catalog.svelte.ts');
    const { testLibrary } = await import('/src/lib/test-library.svelte.ts');
    const { createAssessmentSnapshot } = await import('/src/lib/gradebook-model.ts');
    const test = testLibrary.tests[0];
    const assessment = createAssessmentSnapshot(test, test.questionSnapshots, 'standalone-section');
    return { bankCount: workspaceCatalog.banks.length, questions: test.questionSnapshots.length, points: assessment.totalPoints,
      studentCount: JSON.parse(localStorage.getItem('tg-gradebook-v1')).students.length };
  });
  assert.deepEqual(standalone, { bankCount: 0, questions: 2, points: 6, studentCount: 0 });
  // Reconnect to the original workspace before testing external conflicts.
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0' }),
    page.evaluate(async () => { const { localWorkspace } = await import('/src/lib/local-workspace.svelte.ts'); await localWorkspace.chooseFolder(); }),
  ]);
  await ready();
  const before = await page.evaluate(() => ({ gradebook: localStorage.getItem('tg-gradebook-v1') }));
  // A damaged gradebook.json (e.g. half-synced, or written by something else) stops nothing:
  // the workspace saves and reloads normally, the Gradebook sync reports it and changes nothing,
  // and the file itself is left alone.
  const damaged = await page.evaluate(async () => {
    const { localWorkspace } = await import('/src/lib/local-workspace.svelte.ts');
    const { gradebookFolderSync } = await import('/src/lib/gradebook-folder-sync.svelte.ts');
    const { writeText } = await import('/src/lib/folder-io.ts');
    const root = await window.showDirectoryPicker();
    const grades = await root.getDirectoryHandle('gradebook');
    await writeText(grades, 'gradebook.json', '{"external-change":true}');
    await gradebookFolderSync.now();
    const problems = [...gradebookFolderSync.problems];
    try { await localWorkspace.saveNow(); } catch {}
    return { status: localWorkspace.status, error: localWorkspace.error, problems, gradebook: localStorage.getItem('tg-gradebook-v1') };
  });
  assert.equal(damaged.status, 'ready', damaged.error);
  assert.equal(damaged.error, null);
  assert.deepEqual(damaged.problems, [], 'it is not the live Gradebook any more, so it is skipped, not an error');
  assert.equal(damaged.gradebook, before.gradebook, 'and nothing was read from it');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0' }),
    page.evaluate(async () => { try { await (await import('/src/lib/local-workspace.svelte.ts')).localWorkspace.reload(); } catch {} }),
  ]);
  await ready();
  const reloaded = await page.evaluate(async () => {
    const { localWorkspace } = await import('/src/lib/local-workspace.svelte.ts');
    const { gradebookFolderSync } = await import('/src/lib/gradebook-folder-sync.svelte.ts');
    await gradebookFolderSync.now();
    const grades = await (await window.showDirectoryPicker()).getDirectoryHandle('gradebook');
    return { status: localWorkspace.status, busy: localWorkspace.busy, gradebook: localStorage.getItem('tg-gradebook-v1'),
      text: await (await grades.getFileHandle('gradebook.json')).getFile().then(f => f.text()) };
  });
  assert.equal(reloaded.status, 'ready');
  assert.equal(reloaded.busy, false);
  assert.equal(reloaded.gradebook, damaged.gradebook, 'reloading the workspace leaves the Gradebook alone');
  assert.equal(reloaded.text, '{"external-change":true}');
  assert.equal(await page.$('.workspace-loading-overlay'), null);
  assert.equal(await page.$eval('.workspace-app-shell', element => element.inert), false);
  // Create a NEW root from browser data; do not carry unrelated browser banks.
  const initialized = await page.evaluate(async () => {
    const { localWorkspace } = await import('/src/lib/local-workspace.svelte.ts');
    const { workspaceCatalog } = await import('/src/lib/workspace-catalog.svelte.ts');
    const root = await (await navigator.storage.getDirectory()).getDirectoryHandle('new-workspace-fixture', { create: true });
    window.showDirectoryPicker = async () => root;
    await localWorkspace.chooseFolder();
    await (await import('/src/lib/gradebook-folder-sync.svelte.ts')).gradebookFolderSync.now();
    const names = [];
    for await (const child of root.values()) names.push(child.name);
    return { names: names.sort(), status: localWorkspace.status, banks: workspaceCatalog.banks.length };
  });
  assert.deepEqual(initialized, { names: ['banks', 'gradebook', 'tests'], status: 'ready', banks: 1 });
  // Bank switches run in place; the app must stay loaded and report no error.
  await page.evaluate(() => { window.__sameDocument = true; });
  assert.equal(await page.evaluate(async () => { const { bankWorkspaces } = await import('/src/lib/bank-workspaces.svelte.ts'); await bankWorkspaces.createBank('Another Precalc Bank'); if (bankWorkspaces.switchError) throw new Error(bankWorkspaces.switchError); return window.__sameDocument; }), true);
  await ready();
  const added = await page.evaluate(async () => {
    const { localWorkspace } = await import('/src/lib/local-workspace.svelte.ts');
    const { workspaceCatalog } = await import('/src/lib/workspace-catalog.svelte.ts');
    const before = localWorkspace.activeBankIncluded;
    await localWorkspace.addActiveBank();
    return { before, after: localWorkspace.activeBankIncluded, count: workspaceCatalog.banks.length };
  });
  assert.deepEqual(added, { before: false, after: true, count: 2 });
  const permission = await page.evaluate(async () => {
    const { localWorkspace } = await import('/src/lib/local-workspace.svelte.ts');
    Object.defineProperty(FileSystemDirectoryHandle.prototype, 'queryPermission', { configurable: true, value: async () => 'prompt' });
    await localWorkspace.saveNow();
    const paused = localWorkspace.status;
    Object.defineProperty(FileSystemDirectoryHandle.prototype, 'queryPermission', { configurable: true, value: async () => 'granted' });
    await localWorkspace.grantPermission();
    return { paused, resumed: localWorkspace.status };
  });
  assert.deepEqual(permission, { paused: 'permission-needed', resumed: 'ready' });

  // The connected root, not whatever showDirectoryPicker currently stubs: a
  // page reload re-stubs the picker to the original fixture.
  const connectedRoot = `async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('test-generator-workspace-folder', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('handles');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction('handles', 'readonly');
        const get = tx.objectStore('handles').get('workspace-root');
        tx.oncomplete = () => resolve(get.result);
        tx.onerror = () => reject(tx.error);
      });
    } finally { db.close(); }
  }`;

  // A saved test must reach the folder, and a second bank must be written even
  // while it is not the active one: the folder mirrors the whole workspace.
  const savedToFolder = await page.evaluate(async (connectedRootSource) => {
    const { localWorkspace } = await import('/src/lib/local-workspace.svelte.ts');
    const { bankWorkspaces } = await import('/src/lib/bank-workspaces.svelte.ts');
    const { testLibrary } = await import('/src/lib/test-library.svelte.ts');
    const { defaultTestConfig } = await import('/src/lib/types.ts');
    const created = testLibrary.saveAs('Folder round trip', null, null, null,
      { ...defaultTestConfig('Folder round trip'), selectedIds: [] });
    await localWorkspace.saveNow();

    const root = await (0, eval)(connectedRootSource)();
    const walk = async (directory, prefix = '') => {
      const found = [];
      for await (const child of directory.values()) {
        const path = prefix ? `${prefix}/${child.name}` : child.name;
        if (child.kind === 'directory') found.push(...await walk(child, path));
        else found.push(path);
      }
      return found;
    };
    const paths = await walk(root);
    return {
      testFiles: paths.filter(path => path.startsWith('tests/')).sort(),
      bankIds: [...new Set(paths.filter(path => path.startsWith('banks/')).map(path => path.split('/')[1]))].sort(),
      activeBankId: bankWorkspaces.activeBankId,
      error: localWorkspace.error,
      createdId: created.id,
      status: localWorkspace.status,
    };
  }, connectedRoot);
  assert.equal(savedToFolder.error, null);
  assert.ok(savedToFolder.testFiles.some(path => path.includes(savedToFolder.createdId)),
    `saved test never reached the folder: ${JSON.stringify(savedToFolder.testFiles)}`);
  assert.equal(savedToFolder.bankIds.length, 2, `expected both banks on disk, got ${JSON.stringify(savedToFolder.bankIds)}`);

  // One unsaveable test must not stop the others or the gradebook.
  const isolated = await page.evaluate(async (connectedRootSource) => {
    const { localWorkspace } = await import('/src/lib/local-workspace.svelte.ts');
    const { testLibrary } = await import('/src/lib/test-library.svelte.ts');
    const { defaultTestConfig } = await import('/src/lib/types.ts');
    const broken = testLibrary.saveAs('Broken test', null, null, null,
      { ...defaultTestConfig('Broken test'), selectedIds: ['question-that-does-not-exist'] });
    const healthy = testLibrary.saveAs('Healthy test', null, null, null,
      { ...defaultTestConfig('Healthy test'), selectedIds: [] });
    await localWorkspace.saveNow();
    const root = await (0, eval)(connectedRootSource)();
    const tests = await root.getDirectoryHandle('tests');
    const unclassified = await tests.getDirectoryHandle('_unclassified');
    const names = [];
    for await (const child of unclassified.values()) names.push(child.name);
    return { names: names.sort(), status: localWorkspace.status, error: localWorkspace.error,
      brokenId: broken.id, healthyId: healthy.id };
  }, connectedRoot);
  assert.ok(isolated.names.includes(isolated.healthyId),
    `a broken test blocked a healthy one: ${JSON.stringify(isolated.names)}`);
  assert.equal(isolated.status, 'ready');
  assert.match(isolated.error, /Broken test/);

  // Saving one edited question must not re-read or rewrite the whole bank:
  // that cost a full folder scan per keystroke-sized change and froze the UI.
  const incrementalSave = await page.evaluate(async () => {
    const { localWorkspace } = await import('/src/lib/local-workspace.svelte.ts');
    const { bank } = await import('/src/lib/bank.svelte.ts');
    const questions = Array.from({ length: 120 }, (_, i) => ({
      id: `cost-q-${i}`, body: `Question ${i}`, points: 3, tags: [], createdAt: 1,
    }));
    localStorage.setItem('math-test-bank-v2', JSON.stringify(questions));
    bank.questions = questions;
    await localWorkspace.saveNow();

    questions.push({ id: 'cost-added', body: 'One more question', points: 3, tags: [], createdAt: 2 });
    localStorage.setItem('math-test-bank-v2', JSON.stringify(questions));
    bank.questions = [...questions];
    const before = window.__openedFiles.length;
    await localWorkspace.saveNow();
    return { reads: window.__openedFiles.length - before, error: localWorkspace.error };
  });
  assert.ok(incrementalSave.reads <= 8,
    `saving one added question opened ${incrementalSave.reads} files; it should check manifests, not whole banks`);

  // Reopening a workspace that matches the browser must not read question
  // files at all: the manifests already say nothing changed.
  await page.evaluate(async () => {
    const { localWorkspace } = await import('/src/lib/local-workspace.svelte.ts');
    const root = await (await navigator.storage.getDirectory()).getDirectoryHandle('fast-open-fixture', { create: true });
    window.showDirectoryPicker = async () => root;
    await localWorkspace.chooseFolder();
    await localWorkspace.saveNow();
  });
  await ready();
  await page.reload({ waitUntil: 'networkidle0' });
  await ready();
  const reopened = await page.evaluate(async () => {
    const { localWorkspace } = await import('/src/lib/local-workspace.svelte.ts');
    return { opened: window.__openedFiles ?? [], status: localWorkspace.status, error: localWorkspace.error };
  });
  const bookkeeping = ['manifest.json', 'bank-name.json', 'gradebook.json', 'deleted.json', 'settings.json', 'students.json', 'section.json'];
  const contentReads = reopened.opened.filter(name => !bookkeeping.includes(name));
  assert.equal(reopened.status, 'ready', `reopen failed: ${reopened.error}`);
  assert.deepEqual(contentReads, [],
    `reopen opened ${contentReads.length} content files instead of manifests alone`);

  assert.deepEqual(errors, []);
  console.log('Browser workspace tests passed: shared-class/duplicate-ID banks; aggregate search; portable tests; no gradebook leakage; bank-switch independence; external-change protection; new-root creation; explicit bank addition; rename and folder removal; shared images across switches; Editor saves to another bank; permission pause/resume; saved tests and every bank reaching the folder; per-item failure isolation; manifest-only reopen; incremental saves.');
} finally { await browser?.close(); await server?.close(); }
