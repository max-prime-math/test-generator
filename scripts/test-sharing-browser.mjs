import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';

const directory = await mkdtemp(path.join(tmpdir(), 'testgen-sharing-'));
const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
let browser;
try {
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const sender = await browser.newPage();
  const errors = [];
  sender.on('pageerror', error => errors.push(error.message));
  await sender.setViewport({ width: 1440, height: 950 });
  await sender.evaluateOnNewDocument(() => {
    localStorage.setItem('tg-tutorial-done-v1', '1');
    if (localStorage.getItem('sharing-fixture')) return;
    localStorage.setItem('sharing-fixture', '1');
    localStorage.setItem('math-test-bank-v2', JSON.stringify([
      { id: 'q1', body: 'Read the graph. #image("/imgs/graph.svg")', points: 3, tags: [], images: ['graph'], classId: 'algebra', createdAt: 1 },
      { id: 'q2', body: 'Solve $x^2=4$.', solution: '$x=plus.minus 2$', points: 5, tags: [], classId: 'algebra', createdAt: 1 },
    ]));
    localStorage.setItem('math-test-custom-classes-v1', JSON.stringify([{ id: 'algebra', name: 'Algebra', units: [] }, { id: 'geometry', name: 'Geometry', units: [] }]));
  });
  await sender.goto(`${server.resolvedUrls.local[0]}#/bank`, { waitUntil: 'networkidle0' });
  await sender.evaluate(async () => {
    const { defaultTestConfig } = await import('/src/lib/types.ts');
    const { imageStore } = await import('/src/lib/image-store.svelte.ts');
    const { testLibrary } = await import('/src/lib/test-library.svelte.ts');
    await imageStore.put('graph', new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><metadata id="math-graph-model">{"expression":"x^2"}</metadata><circle cx="30" cy="30" r="20"/></svg>'), 'svg');
    for (const [name, classId] of [['Quiz one', 'algebra'], ['Quiz two', 'algebra'], ['Other course', 'geometry']]) {
      testLibrary.saveAs(name, classId, null, 'quiz', { ...defaultTestConfig('Math'), selectedIds: ['q2', 'q1'], pageColumns: 2, answerSpaceOverrides: { q1: 6 }, pageBreakAfter: { q2: { pagebreak: true } }, bonusQuestionIds: ['q2'] });
    }
  });
  const cdp = await sender.createCDPSession();
  await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: directory });
  const click = async (page, name, scope = '') => {
    await page.evaluate(() => Promise.all(document.getAnimations().filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {}))));
    const button = await page.evaluateHandle(({ name, scope }) => [...document.querySelectorAll(`${scope ? scope + ' ' : ''}button`)].find(el => el.getClientRects().length && (el.textContent.trim() === name || el.getAttribute('aria-label') === name)), { name, scope });
    assert.ok(button.asElement(), `Button exists: ${name}`);
    await button.asElement().click(); await button.dispose();
  };
  const waitStatus = (page, text) => page.waitForFunction(text => document.querySelector('dialog[open] [role="status"]')?.textContent.includes(text), {}, text);
  const findDownload = async name => {
    for (let i = 0; i < 100; i++) {
      if ((await readdir(directory)).includes(name)) return path.join(directory, name);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`Download missing: ${name}`);
  };

  await click(sender, 'Export bank ZIP');
  await sender.waitForSelector('dialog[open]');
  await click(sender, 'Export bank ZIP', 'dialog');
  await waitStatus(sender, 'Download started');
  const bankFile = await findDownload('Local-Bank.zip');
  await sender.keyboard.press('Escape');
  assert.equal(await sender.evaluate(() => document.activeElement.textContent.trim()), 'Export bank ZIP', 'Escape restores focus to the initiating control');

  await sender.evaluate(() => location.hash = '#/build');
  await sender.waitForSelector('.test-toolbar');
  await click(sender, '▦ Saved Tests');
  await sender.waitForSelector('.saved-library');
  await click(sender, 'Export tests ZIP');
  await sender.waitForSelector('dialog[open] select');
  await sender.select('dialog select', 'algebra');
  await click(sender, 'Select all shown (2)', 'dialog');
  await click(sender, 'Export 2 tests ZIP', 'dialog');
  await waitStatus(sender, 'Download started');
  const testsFile = await findDownload('Algebra-tests.zip');
  await sender.keyboard.press('Escape');
  await click(sender, 'Export ZIP');
  await sender.waitForSelector('dialog[open]');
  assert.equal(await sender.$$eval('dialog input[type="checkbox"]:checked', inputs => inputs.length), 1, 'a card exports just that test');
  await sender.keyboard.press('Escape');

  const context = await browser.createBrowserContext();
  const recipient = await context.newPage();
  recipient.on('pageerror', error => errors.push(error.message));
  await recipient.setViewport({ width: 1440, height: 950 });
  await recipient.evaluateOnNewDocument(() => localStorage.setItem('tg-tutorial-done-v1', '1'));
  await recipient.goto(`${server.resolvedUrls.local[0]}#/bank`, { waitUntil: 'networkidle0' });
  const preserved = await recipient.evaluate(async () => {
    const { bank } = await import('/src/lib/bank.svelte.ts');
    const { imageStore } = await import('/src/lib/image-store.svelte.ts');
    bank.add({ body: 'Recipient original', points: 1, tags: [] });
    await imageStore.put('graph', new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'svg');
    localStorage.setItem('tg-gradebook-v1', JSON.stringify({ private: 'Recipient records' }));
    return { bank: localStorage.getItem('math-test-bank-v2'), gradebook: localStorage.getItem('tg-gradebook-v1') };
  });
  await click(recipient, 'Import bank ZIP');
  await recipient.waitForSelector('dialog input[type="file"]');
  await (await recipient.$('dialog input[type="file"]')).uploadFile(bankFile);
  await waitStatus(recipient, 'ZIP checked');
  assert.match(await recipient.$eval('dialog', el => el.textContent), /2 questions/);
  assert.equal(await recipient.$eval('dialog input[maxlength]', el => el.value), 'Local Bank (2)');
  await click(recipient, 'Import as new bank', 'dialog');
  await waitStatus(recipient, 'separate bank');
  await click(recipient, 'Done', 'dialog');
  assert.equal(await recipient.$eval('.picker-trigger span', el => el.textContent), 'Local Bank (2)');
  const imported = await recipient.evaluate(async () => {
    const { bankWorkspaces } = await import('/src/lib/bank-workspaces.svelte.ts');
    const entry = bankWorkspaces.banks.find(bank => bank.name === 'Local Bank (2)');
    const data = await bankWorkspaces.readBankSnapshot(entry.id);
    return { count: data.questions.length, graph: new TextDecoder().decode(data.images[0].bytes), active: localStorage.getItem('math-test-bank-v2') };
  });
  assert.equal(imported.count, 2);
  assert.match(imported.graph, /math-graph-model/);
  assert.equal(imported.active, preserved.bank);

  await recipient.evaluate(() => location.hash = '#/build');
  await recipient.waitForSelector('.test-toolbar');
  await click(recipient, '▦ Saved Tests');
  await recipient.waitForSelector('.saved-library');
  await click(recipient, 'Import tests ZIP');
  await recipient.waitForSelector('dialog input[type="file"]');
  const invalidFile = path.join(directory, 'invalid.zip');
  await writeFile(invalidFile, 'invalid ZIP');
  await (await recipient.$('dialog input[type="file"]')).uploadFile(invalidFile);
  await recipient.waitForSelector('dialog [role="alert"]');
  assert.equal(await recipient.$eval('dialog footer .primary', el => el.disabled), true);
  await (await recipient.$('dialog input[type="file"]')).uploadFile(testsFile);
  await waitStatus(recipient, 'ZIP checked');
  assert.equal(await recipient.$$eval('dialog input[type="checkbox"]:checked', inputs => inputs.length), 2);
  await click(recipient, 'Import 2 tests as copies', 'dialog');
  await waitStatus(recipient, 'Added 2 test copies');
  await click(recipient, 'Done', 'dialog');
  assert.equal(await recipient.$$('.test-card').then(cards => cards.length), 2);

  const result = await recipient.evaluate(async bytes => {
    const { testLibrary } = await import('/src/lib/test-library.svelte.ts');
    const { imageStore } = await import('/src/lib/image-store.svelte.ts');
    const { testEditor } = await import('/src/lib/test-editor.svelte.ts');
    const { generateTypst } = await import('/src/lib/typst/template.ts');
    const { compile } = await import('/src/lib/typst/compiler.ts');
    const { readShareZip } = await import('/src/lib/share-package-client.ts');
    const { importTestsZip } = await import('/src/lib/sharing.ts');
    const pack = await readShareZip(new Uint8Array(bytes));
    const originalTests = localStorage.getItem('tg-test-library-v1');
    const originalNames = [...imageStore.names];
    const originalSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === 'tg-test-library-v1') throw new DOMException('Full', 'QuotaExceededError');
      return originalSet.call(this, key, value);
    };
    let failed = false;
    try { await importTestsZip(pack); } catch { failed = true; }
    finally { Storage.prototype.setItem = originalSet; }
    const noPartial = originalTests === localStorage.getItem('tg-test-library-v1') && JSON.stringify(originalNames) === JSON.stringify(imageStore.names);
    await importTestsZip({ kind: 'tests', items: [pack.items[0]] });
    const t = testLibrary.tests[0];
    const source = generateTypst({ ...t.config, showAnswerKey: true }, t.questionSnapshots, t.narrativeSnapshots);
    const pdf = await compile(source);
    const pdfBytes = pdf.pdfUrl ? (await (await fetch(pdf.pdfUrl)).arrayBuffer()).byteLength : 0;
    if (pdf.pdfUrl) URL.revokeObjectURL(pdf.pdfUrl);
    return { failed, noPartial, names: testLibrary.tests.map(t => t.name), test: JSON.parse(JSON.stringify(t)), pdfBytes, error: pdf.error,
      graph: new TextDecoder().decode((await imageStore.get(t.questionSnapshots.find(q => q.id === 'q1').images[0])).bytes),
      bank: localStorage.getItem('math-test-bank-v2'), gradebook: localStorage.getItem('tg-gradebook-v1'), draftId: testEditor.testId };
  }, [...await readFile(testsFile)]);
  assert.ok(result.failed && result.noPartial, 'quota errors preserve the existing tests and clean up images for the failed import');
  assert.deepEqual(result.names.sort(), ['Quiz one', 'Quiz one (2)', 'Quiz two']);
  assert.deepEqual(result.test.config.selectedIds, ['q2', 'q1']);
  assert.equal(result.test.config.answerSpaceOverrides.q1, 6);
  assert.equal(result.test.config.pageBreakAfter.q2.pagebreak, true);
  assert.match(result.graph, /math-graph-model/);
  assert.equal(result.error, undefined);
  assert.ok(result.pdfBytes > 1000, 'tests compile on a colleague’s computer with only the ZIP’s images');
  assert.equal(result.bank, preserved.bank);
  assert.equal(result.gradebook, preserved.gradebook);
  assert.equal(result.draftId, null, 'import does not replace the open test draft');
  await recipient.reload({ waitUntil: 'networkidle0' });
  assert.equal(await recipient.evaluate(() => JSON.parse(localStorage.getItem('tg-test-library-v1')).length), 3, 'test copies survive reload');
  await click(recipient, '▦ Saved Tests');
  await click(recipient, 'Export tests ZIP');
  await recipient.setViewport({ width: 390, height: 844 });
  await recipient.waitForSelector('dialog[open]');
  const fits = await recipient.$eval('dialog', el => el.getBoundingClientRect().width <= innerWidth && el.scrollWidth <= el.clientWidth);
  assert.ok(fits, 'sharing dialog fits a phone screen');
  await recipient.screenshot({ path: '/tmp/testgen-sharing-mobile.png' });

  const performance = await sender.evaluate(async () => {
    const { exportBankZip } = await import('/src/lib/sharing.ts');
    const { bankWorkspaces } = await import('/src/lib/bank-workspaces.svelte.ts');
    const original = localStorage.getItem('math-test-bank-v2');
    try {
      localStorage.setItem('math-test-bank-v2', JSON.stringify(Array.from({ length: 10000 }, (_, i) => ({ id: `large-${i}`, body: `Solve $x+${i}=10000$.`, points: 2, tags: [], createdAt: 1 }))));
      let ticks = 0;
      const timer = setInterval(() => ticks++, 5);
      const start = window.performance.now();
      const bytes = await exportBankZip(bankWorkspaces.activeBankId);
      clearInterval(timer);
      return { ticks, ms: window.performance.now() - start, bytes: bytes.byteLength };
    } finally { localStorage.setItem('math-test-bank-v2', original); }
  });
  assert.ok(performance.ticks > 0 && performance.bytes > 1000, 'large ZIP compression leaves the UI event loop available');

  const workspaceContext = await browser.createBrowserContext();
  const workspace = await workspaceContext.newPage();
  workspace.on('pageerror', error => errors.push(error.message));
  workspace.on('dialog', dialog => void dialog.accept());
  await workspace.evaluateOnNewDocument(() => {
    localStorage.setItem('tg-tutorial-done-v1', '1');
    Object.defineProperty(FileSystemDirectoryHandle.prototype, 'queryPermission', { configurable: true, value: async () => 'granted' });
    Object.defineProperty(FileSystemDirectoryHandle.prototype, 'requestPermission', { configurable: true, value: async () => 'granted' });
    window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('Shared-fixture', { create: true });
  });
  await workspace.goto(server.resolvedUrls.local[0], { waitUntil: 'networkidle0' });
  const synced = await workspace.evaluate(async ({ bankBytes, testBytes }) => {
    const { localWorkspace } = await import('/src/lib/local-workspace.svelte.ts');
    const { testsFolderSync } = await import('/src/lib/tests-folder-sync.svelte.ts');
    const { bankWorkspaces } = await import('/src/lib/bank-workspaces.svelte.ts');
    const { workspaceCatalog } = await import('/src/lib/workspace-catalog.svelte.ts');
    const { readShareZip } = await import('/src/lib/share-package-client.ts');
    const { importBankZip, importTestsZip, exportBankZip } = await import('/src/lib/sharing.ts');
    const { readRepoFolder } = await import('/src/lib/folder-io.ts');
    const { importRepoEntriesToAppData } = await import('/src/git/repoDataModel.ts');
    await localWorkspace.chooseFolder();
    const originalId = bankWorkspaces.activeBankId;
    const bank = await importBankZip(await readShareZip(new Uint8Array(bankBytes)), 'Imported Algebra');
    const tests = await importTestsZip(await readShareZip(new Uint8Array(testBytes)));
    await localWorkspace.saveNow();
    await testsFolderSync.connect(localWorkspace.root);
    await new Promise(resolve => setTimeout(resolve, 1300));
    await testsFolderSync.now();
    const banks = await localWorkspace.root.getDirectoryHandle('banks');
    const stored = importRepoEntriesToAppData(await readRepoFolder(await banks.getDirectoryHandle(bank.id))).appData;
    const testsDir = await (await localWorkspace.root.getDirectoryHandle('tests')).getDirectoryHandle('algebra');
    const file = await (await (await testsDir.getDirectoryHandle(tests[0].id)).getFileHandle('test.json')).getFile();
    const testFile = JSON.parse(await file.text());
    const reexport = await readShareZip(await exportBankZip(bank.id));
    return { questions: stored.questions.length, bankTests: stored.savedTests.length, catalogQuestions: workspaceCatalog.questions.filter(q => workspaceCatalog.sources[q.id]?.bankId === bank.id).length,
      bankUnchanged: bankWorkspaces.activeBankId === originalId, savedTest: testFile.test.name, reexportCount: reexport.items[0].data.questions.length,
      problems: [...testsFolderSync.problems], status: localWorkspace.status };
  }, { bankBytes: [...await readFile(bankFile)], testBytes: [...await readFile(testsFile)] });
  assert.equal(synced.questions, 2);
  assert.equal(synced.bankTests, 0);
  assert.equal(synced.catalogQuestions, 2);
  assert.equal(synced.bankUnchanged, true);
  assert.equal(synced.savedTest, 'Quiz one');
  assert.equal(synced.reexportCount, 2, 'an imported dormant bank can be exported again');
  assert.deepEqual(synced.problems, []);
  assert.deepEqual(errors, []);
  console.log(`Sharing UI, fresh-browser import, images/graph metadata, PDF rendering, duplicate names, quota recovery, persistence, keyboard focus, mobile, and connected-workspace checks passed. 10,000-question ZIP: ${performance.ms.toFixed(0)} ms, ${performance.ticks} UI ticks.`);
} finally {
  await browser?.close();
  await server.close();
  await rm(directory, { recursive: true, force: true });
}
