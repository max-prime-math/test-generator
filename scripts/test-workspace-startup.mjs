import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';

const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
let browser;
try {
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewport({ width: 1450, height: 1000 });
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('tg-tutorial-done-v1', '1');
    window.confirm = () => true;
    Object.defineProperty(FileSystemDirectoryHandle.prototype, 'queryPermission', { configurable: true, value: async () => localStorage.getItem('fixture-deny') ? 'prompt' : 'granted' });
    Object.defineProperty(FileSystemDirectoryHandle.prototype, 'requestPermission', { configurable: true, value: async () => 'granted' });
    window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('startup-fixture', { create: true });
    window.__reads = [];
    window.__indexHashes = 0;
    window.__imageWrites = 0;
    window.__gateHit = false;
    let release;
    const gate = new Promise(resolve => release = resolve);
    window.__release = release;
    const getFile = FileSystemFileHandle.prototype.getFile;
    FileSystemFileHandle.prototype.getFile = async function (...args) {
      window.__reads.push(this.name);
      if (this.name === 'manifest.json' && localStorage.getItem('fixture-gate')) { window.__gateHit = true; await gate; }
      if (this.name === 'manifest.json' && localStorage.getItem('fixture-fail')) throw new DOMException('Fixture unavailable', 'NotReadableError');
      return getFile.apply(this, args);
    };
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    crypto.subtle.digest = async (...args) => {
      if (new TextDecoder().decode(args[1]).startsWith('["startup-')) window.__indexHashes++;
      return digest(...args);
    };
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'images') window.__imageWrites++;
      return put.apply(this, args);
    };
  });
  await page.goto(server.resolvedUrls.local[0], { waitUntil: 'networkidle0' });
  await page.evaluate(async () => {
    const { writeRepoFolder, writeText } = await import('/src/lib/folder-io.ts');
    const { exportAppDataToRepoEntries } = await import('/src/git/repoDataModel.ts');
    const root = await window.showDirectoryPicker();
    const banks = await root.getDirectoryHandle('banks', { create: true });
    for (let b = 0; b < 4; b++) {
      const id = `startup-${b}`;
      const data = { questions: Array.from({ length: 500 }, (_, i) => ({ id: `q-${i}`, body: `Question ${b}-${i}: solve $x+1=3$.${i === 0 ? ' #image("/imgs/diagram.svg")' : ''}`, images: i === 0 ? ['diagram'] : [], points: 2, tags: [], createdAt: 1 })),
        narratives: [], customClasses: [], savedTests: [], images: [{ name: 'diagram', ext: 'svg', bytes: new TextEncoder().encode(`<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><text x="2" y="15">${b}</text></svg>`) }] };
      const folder = await banks.getDirectoryHandle(id, { create: true });
      await writeRepoFolder(folder, exportAppDataToRepoEntries(data), 'absent');
      await writeText(folder, 'bank-name.json', JSON.stringify({ name: `Startup bank ${b}` }));
    }
  });
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0' }),
    page.evaluate(async () => (await import('/src/lib/local-workspace.svelte.ts')).localWorkspace.chooseFolder()),
  ]);
  const waitStatus = status => page.waitForFunction(async status => {
    const { localWorkspace } = await import('/src/lib/local-workspace.svelte.ts');
    return localWorkspace.status === status && !localWorkspace.busy;
  }, { timeout: 30000 }, status);
  await waitStatus('ready');
  const testId = await page.evaluate(async () => {
    const { testLibrary } = await import('/src/lib/test-library.svelte.ts');
    const { testEditor } = await import('/src/lib/test-editor.svelte.ts');
    const { defaultTestConfig } = await import('/src/lib/types.ts');
    const { localWorkspace } = await import('/src/lib/local-workspace.svelte.ts');
    const test = testLibrary.saveAs('Startup test', null, null, 'test', { ...defaultTestConfig('Startup test'), selectedIds: ['q-0'] });
    await testEditor.open(test.id);
    await localWorkspace.saveNow();
    localStorage.setItem('fixture-gate', '1');
    return test.id;
  });

  // Hold the filesystem check open. The cached catalog must already be usable
  // and the user must be able to edit without an overlay or inert app shell.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__gateHit);
  await page.waitForFunction(async () => (await import('/src/lib/workspace-catalog.svelte.ts')).workspaceCatalog.questions.length === 2000);
  assert.equal(await page.$eval('.workspace-app-shell', el => el.inert), false);
  assert.equal(await page.$('.workspace-loading-overlay'), null);
  assert.ok(await page.$('.workspace-status'));
  assert.equal(await page.evaluate(() => window.__indexHashes), 0, 'warm startup restores prepared IDs instead of hashing all 2,000 questions');

  await page.evaluate(() => location.hash = '/build');
  await page.waitForSelector('#t-subtitle');
  await page.$eval('#t-subtitle', el => { el.value = 'Edited during startup'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.waitForFunction(id => JSON.parse(localStorage.getItem('tg-test-library-v1')).find(t => t.id === id)?.config.subtitle === 'Edited during startup', {}, testId);
  const questionId = await page.evaluate(async () => {
    const { bank } = await import('/src/lib/bank.svelte.ts');
    return bank.add({ body: 'Created while folder check is pending.', points: 3, tags: [] }).id;
  });
  await page.screenshot({ path: '/tmp/testgen-background-startup.png' });
  const warm = await page.evaluate(() => ({ hashes: window.__indexHashes, imageWrites: window.__imageWrites }));
  assert.deepEqual(warm, { hashes: 0, imageWrites: 0 });
  await page.evaluate(() => { localStorage.removeItem('fixture-gate'); window.__release(); });
  await waitStatus('ready');
  const contentReads = await page.evaluate(() => window.__reads.filter(name => !['manifest.json', 'bank-name.json', 'deleted.json', 'gradebook.json'].includes(name)));
  assert.deepEqual(contentReads, [], 'warm startup reads no question files');
  const preserved = await page.evaluate(async ({ testId, questionId }) => {
    const { localWorkspace } = await import('/src/lib/local-workspace.svelte.ts');
    const { readRepoFolder } = await import('/src/lib/folder-io.ts');
    const { importRepoEntriesToAppData } = await import('/src/git/repoDataModel.ts');
    await localWorkspace.saveNow();
    const root = await window.showDirectoryPicker();
    const bank = importRepoEntriesToAppData(await readRepoFolder(await (await root.getDirectoryHandle('banks')).getDirectoryHandle('startup-0'))).appData;
    const test = importRepoEntriesToAppData(await readRepoFolder(await (await (await root.getDirectoryHandle('tests')).getDirectoryHandle('_unclassified')).getDirectoryHandle(testId))).appData;
    return { question: bank.questions.find(q => q.id === questionId)?.body, subtitle: test.savedTests[0].config.subtitle };
  }, { testId, questionId });
  assert.deepEqual(preserved, { question: 'Created while folder check is pending.', subtitle: 'Edited during startup' });

  // Permission loss still gives access to the complete browser catalog.
  await page.evaluate(() => localStorage.setItem('fixture-deny', '1'));
  await page.reload({ waitUntil: 'networkidle0' });
  await waitStatus('permission-needed');
  assert.equal(await page.evaluate(async () => (await import('/src/lib/workspace-catalog.svelte.ts')).workspaceCatalog.questions.length), 2001);
  assert.equal(await page.$eval('.workspace-app-shell', el => el.inert), false);
  await page.evaluate(async () => {
    localStorage.removeItem('fixture-deny');
    await (await import('/src/lib/local-workspace.svelte.ts')).localWorkspace.grantPermission();
  });
  await waitStatus('ready');

  // Stop and resume are non-destructive and keep the app editable.
  await page.evaluate(() => localStorage.setItem('fixture-gate', '1'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__gateHit);
  await page.click('.workspace-status button');
  await page.evaluate(() => { localStorage.removeItem('fixture-gate'); window.__release(); });
  await waitStatus('paused');
  assert.equal(await page.$eval('.workspace-app-shell', el => el.inert), false);
  await page.evaluate(async () => (await import('/src/lib/local-workspace.svelte.ts')).localWorkspace.resumeLoading());
  await waitStatus('ready');

  // Cache loss is recoverable from browser snapshots without rereading files.
  await page.evaluate(async () => {
    await new Promise((resolve, reject) => { const request = indexedDB.deleteDatabase('test-generator-workspace-cache'); request.onsuccess = resolve; request.onerror = () => reject(request.error); });
  });
  await page.reload({ waitUntil: 'networkidle0' });
  await waitStatus('ready');
  assert.equal(await page.evaluate(() => window.__indexHashes), 2001);
  assert.deepEqual(await page.evaluate(() => window.__reads.filter(name => !['manifest.json', 'bank-name.json', 'deleted.json', 'gradebook.json'].includes(name))), []);

  // A folder-side change is held for review. User edits made while the check
  // is running are never replaced, nor written over the external copy.
  await page.evaluate(async () => {
    const { readRepoFolder, writeRepoFolder, folderSignature } = await import('/src/lib/folder-io.ts');
    const { importRepoEntriesToAppData, exportAppDataToRepoEntries } = await import('/src/git/repoDataModel.ts');
    const root = await window.showDirectoryPicker();
    const folder = await (await root.getDirectoryHandle('banks')).getDirectoryHandle('startup-0');
    const entries = await readRepoFolder(folder);
    const data = importRepoEntriesToAppData(entries).appData;
    data.questions.find(question => question.id === 'q-0').body = 'External folder revision';
    await writeRepoFolder(folder, exportAppDataToRepoEntries(data), folderSignature(entries));
    localStorage.setItem('fixture-gate', '1');
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__gateHit);
  await page.evaluate(async () => {
    const { bank } = await import('/src/lib/bank.svelte.ts');
    bank.update('q-0', { body: 'Local revision during external check' });
    localStorage.removeItem('fixture-gate'); window.__release();
  });
  await waitStatus('review-needed');
  assert.ok(await page.$('.workspace-status'));
  assert.equal(await page.$('.workspace-loading-overlay'), null);
  assert.equal(await page.evaluate(async () => (await import('/src/lib/bank.svelte.ts')).bank.questions.find(q => q.id === 'q-0').body), 'Local revision during external check');
  const conflict = await page.evaluate(async () => {
    const { localWorkspace } = await import('/src/lib/local-workspace.svelte.ts');
    const { readRepoFolder } = await import('/src/lib/folder-io.ts');
    const { importRepoEntriesToAppData } = await import('/src/git/repoDataModel.ts');
    await localWorkspace.saveNow(); // must stay read-only until reviewed
    const root = await window.showDirectoryPicker();
    const data = importRepoEntriesToAppData(await readRepoFolder(await (await root.getDirectoryHandle('banks')).getDirectoryHandle('startup-0'))).appData;
    return { folders: [...localWorkspace.changedFolders], body: data.questions.find(q => q.id === 'q-0').body };
  });
  assert.ok(conflict.folders.includes('banks/startup-0'));
  assert.equal(conflict.body, 'External folder revision');

  // Cache identity is the actual handle, never just its display name.
  assert.equal(await page.evaluate(async () => {
    const { readWorkspaceCache } = await import('/src/lib/workspace-cache.ts');
    const parent = await (await navigator.storage.getDirectory()).getDirectoryHandle('other-parent', { create: true });
    const root = await parent.getDirectoryHandle('startup-fixture', { create: true });
    return await readWorkspaceCache(root);
  }), null);

  // Read failures also stay read-only, even after the normal retry delay.
  await page.evaluate(() => localStorage.setItem('fixture-fail', '1'));
  await page.reload({ waitUntil: 'networkidle0' });
  await waitStatus('review-needed');
  await page.evaluate(async () => {
    const { localWorkspace } = await import('/src/lib/local-workspace.svelte.ts');
    await new Promise(resolve => setTimeout(resolve, 5500));
    await localWorkspace.saveNow();
    if (localWorkspace.status !== 'review-needed') throw new Error('Unverified workspace started saving');
  });
  assert.deepEqual(errors, []);
  console.log('Workspace startup tests passed: 4 banks / 2,000 questions; cached IDs; zero warm question reads and image rewrites; editing during a held scan; persistence after the scan; permission loss; stop/resume; cache loss; conflict preservation; handle identity; read failures.');
} finally { await browser?.close(); await server.close(); }
