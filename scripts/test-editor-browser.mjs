import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';
// Drafts live in IndexedDB (one record per draft) plus a local journal of
// changes not yet written there; either location proves local durability.
const draftsContain = text => new Promise(resolve => {
  if (Object.keys(localStorage).some(key => key.startsWith('tg-editor-journal-v2:') && localStorage[key].includes(text))) return resolve(true);
  const open = indexedDB.open('test-generator-drafts');
  open.onerror = () => resolve(false);
  open.onsuccess = () => {
    const db = open.result;
    if (!db.objectStoreNames.contains('drafts')) { db.close(); return resolve(false); }
    const all = db.transaction('drafts').objectStore('drafts').getAll();
    all.onsuccess = () => { db.close(); resolve(all.result.some(record => JSON.stringify(record.draft).includes(text))); };
    all.onerror = () => { db.close(); resolve(false); };
  };
});
const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
let browser;
try {
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 1000 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('tg-tutorial-done-v1', '1');
    window.confirm = () => true;
    Object.defineProperty(FileSystemDirectoryHandle.prototype, 'queryPermission', { configurable: true, value: async () => 'granted' });
    Object.defineProperty(FileSystemDirectoryHandle.prototype, 'requestPermission', { configurable: true, value: async () => 'granted' });
    window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle(window.__fixtureFolder ?? 'legacy-editor-fixture', { create: true });
  });
  await page.goto(`${server.resolvedUrls.local[0]}#/editor`, { waitUntil: 'networkidle0' });
  const clickText = async (selector, text) => {
    const clicked = await page.evaluate((selector, text) => {
      const button = [...document.querySelectorAll(selector)].find(el => el.textContent.trim() === text);
      if (!button) return false;
      button.click(); return true;
    }, selector, text);
    assert.ok(clicked, `Missing ${text}`);
  };
  await clickText('.editor-workspace .actions button', '+ New Question');
  await page.waitForSelector('textarea[aria-label="Question"]');
  await page.type('textarea[aria-label="Question"]', 'Solve $x + 1 = 4$.');
  await page.type('textarea[aria-label="Solution"]', '$x = 3$');
  await page.waitForFunction(`(${draftsContain})('Solve $x + 1 = 4$.')`);
  await page.waitForSelector('.preview .svg svg', { timeout: 30000 });
  assert.equal(await page.$('.preview pre[role=alert]'), null);
  await clickText('nav button', 'Bank');
  await clickText('nav button', 'Editor');
  assert.equal(await page.$eval('textarea[aria-label="Question"]', el => el.value), 'Solve $x + 1 = 4$.');
  await page.reload({ waitUntil: 'networkidle0' });
  assert.equal(await page.$eval('textarea[aria-label="Solution"]', el => el.value), '$x = 3$');
  await page.keyboard.down('Control'); await page.keyboard.press('Enter'); await page.keyboard.up('Control');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('math-test-bank-v2') ?? '[]').length === 1);
  const first = await page.evaluate(() => JSON.parse(localStorage.getItem('math-test-bank-v2'))[0]);
  assert.equal(first.answer, undefined); assert.equal(first.choices, undefined);
  await page.waitForFunction(() => document.querySelector('textarea[aria-label="Question"]')?.value === '');
  await page.type('textarea[aria-label="Question"]', 'Choose $2$.');
  await page.select('.question-form > label select', 'mcq');
  for (const [letter, value] of Object.entries({ A: '$1$', B: '$2$', C: '$3$', D: '$4$' })) await page.type(`textarea[aria-label="Choice ${letter}"]`, value);
  await page.click('input[aria-label="Mark B correct"]');
  await page.click('button[aria-label="Move B up"]');
  await clickText('.editor-workspace .actions button', 'Save');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('math-test-bank-v2')).length === 2);
  const mcq = await page.evaluate(() => JSON.parse(localStorage.getItem('math-test-bank-v2'))[1]);
  assert.equal(mcq.answer, 'A'); assert.equal(mcq.choices.A, '$2$');
  await page.evaluate(id => location.hash = `#/editor/${id}`, first.id);
  await page.waitForFunction(() => document.querySelector('textarea[aria-label="Question"]')?.value === 'Solve $x + 1 = 4$.');
  await page.type('textarea[aria-label="Question"]', ' Explain.');
  await clickText('.editor-workspace .actions button', 'Save');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('math-test-bank-v2'))[0].body.endsWith(' Explain.'));
  const edited = await page.evaluate(() => JSON.parse(localStorage.getItem('math-test-bank-v2'))[0]);
  assert.equal(edited.id, first.id); assert.equal(edited.createdAt, first.createdAt); assert.ok(edited.updatedAt);
  await clickText('.editor-workspace .actions button', 'Duplicate');
  await clickText('.editor-workspace .actions button', 'Save');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('math-test-bank-v2')).length === 3);
  const copy = await page.evaluate(() => JSON.parse(localStorage.getItem('math-test-bank-v2'))[2]);
  assert.notEqual(copy.id, first.id); assert.ok(copy.createdAt >= first.createdAt);
  await clickText('.editor-workspace .actions button', 'Bulk Entry / Import');
  await page.waitForSelector('.paste-area');
  await page.type('.paste-area', 'Imported first question.\n\nImported second question.');
  await clickText('.stage1-modal footer button', 'Continue →');
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Stage in Editor (2) →'));
  await clickText('button', 'Stage in Editor (2) →');
  await page.waitForFunction(() => !document.querySelector('.stage1-modal') && !document.querySelector('.stage3-modal'));
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('math-test-bank-v2')).length), 3);
  await page.evaluate(() => {
    for (const row of document.querySelectorAll('.draft-row')) if (row.textContent.includes('Imported')) row.querySelector('input').click();
  });
  await clickText('.selection button', 'Shared values');
  await page.evaluate(() => [...document.querySelectorAll('.bulk label')].find(el => el.textContent.includes('Replace points')).querySelector('input').click());
  await page.waitForSelector('[aria-label="Batch points"]');
  await page.$eval('[aria-label="Batch points"]', el => { el.value = '7'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await clickText('.bulk button', 'Apply to drafts');
  await clickText('.selection button', 'Save selected');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('math-test-bank-v2')).length === 5);
  assert.ok((await page.evaluate(() => JSON.parse(localStorage.getItem('math-test-bank-v2')).filter(q => q.body.startsWith('Imported')))).every(q => q.points === 7));
  // Both folder backends must observe Editor commits through the ordinary bank APIs.
  const folderResult = await page.evaluate(async id => {
    const { localFolderBank } = await import('/src/lib/local-folder-bank.svelte.ts');
    const { localWorkspace } = await import('/src/lib/local-workspace.svelte.ts');
    const { bankWorkspaces } = await import('/src/lib/bank-workspaces.svelte.ts');
    const { bank } = await import('/src/lib/bank.svelte.ts');
    const { editor } = await import('/src/lib/editor/editor-state.svelte.ts');
    const { readRepoFolder } = await import('/src/lib/folder-io.ts');
    const { importRepoEntriesToAppData } = await import('/src/git/repoDataModel.ts');
    await localFolderBank.chooseFolder();
    const draft = editor.open(bank.questions.find(q => q.id === id));
    draft.fields.body = 'Editor saved through legacy folder.';
    editor.save(draft);
    await localFolderBank.saveNow();
    const legacy = importRepoEntriesToAppData(await readRepoFolder(await window.showDirectoryPicker())).appData;
    await localFolderBank.disconnect();
    window.__fixtureFolder = 'workspace-editor-fixture';
    await localWorkspace.chooseFolder();
    const next = editor.open(bank.questions.find(q => q.id === id));
    next.fields.body = 'Editor saved through workspace.';
    editor.save(next);
    await localWorkspace.saveNow();
    const root = await window.showDirectoryPicker();
    const folder = await (await root.getDirectoryHandle('banks')).getDirectoryHandle(bankWorkspaces.activeBankId);
    const workspace = importRepoEntriesToAppData(await readRepoFolder(folder)).appData;
    await localWorkspace.disconnect();
    return { legacy: legacy.questions.find(q => q.id === id).body, workspace: workspace.questions.find(q => q.id === id).body };
  }, first.id);
  assert.equal(folderResult.legacy, 'Editor saved through legacy folder.');
  assert.equal(folderResult.workspace, 'Editor saved through workspace.');
  // Invalid source remains editable and autosaved; draft images are protected from cleanup.
  await clickText('.editor-workspace .actions button', '+ New Question');
  await page.type('textarea[aria-label="Question"]', 'Preview should remain visible.');
  await page.waitForSelector('.preview .svg svg', { timeout: 30000 });
  await page.type('textarea[aria-label="Question"]', '#image("/imgs/draft-only.png") $unfinished');
  await page.waitForSelector('.preview pre[role=alert]', { timeout: 30000 });
  assert.ok(await page.$('.preview .svg svg'));
  await page.reload({ waitUntil: 'networkidle0' });
  assert.match(await page.$eval('textarea[aria-label="Question"]', el => el.value), /unfinished/);
  const originalBank = await page.evaluate(() => localStorage.getItem('tg-active-bank-id-v1'));
  // Bank switches happen in place; the page must not reload.
  await page.evaluate(() => { window.__noReload = true; });
  await page.evaluate(async () => { const { bankWorkspaces } = await import('/src/lib/bank-workspaces.svelte.ts'); await bankWorkspaces.createBank('Editor second bank'); });
  assert.equal(await page.evaluate(async () => (await import('/src/lib/editor/editor-state.svelte.ts')).editor.session.drafts.length), 0);
  await clickText('.editor-workspace .actions button', '+ New Question');
  await page.type('textarea[aria-label="Question"]', 'Second bank only draft');
  await page.evaluate(async id => { const { bankWorkspaces } = await import('/src/lib/bank-workspaces.svelte.ts'); await bankWorkspaces.switchBank(id); }, originalBank);
  await page.waitForFunction(() => document.querySelector('textarea[aria-label="Question"]')?.value.includes('unfinished'));
  assert.ok(await page.evaluate(`(${draftsContain})('Second bank only draft')`));
  assert.equal(await page.evaluate(() => window.__noReload), true, 'Bank switching kept the app loaded');
  assert.ok(!(await page.$$eval('.draft-row', rows => rows.map(row => row.textContent).join(' '))).includes('Second bank only draft'), 'Drafts stay in their own bank');
  await page.screenshot({ path: '/tmp/testgen-editor-desktop.png', fullPage: true });
  await page.setViewport({ width: 390, height: 844 });
  await page.screenshot({ path: '/tmp/testgen-editor-mobile.png', fullPage: true });
  assert.ok(await page.$eval('.mobile-panels', el => getComputedStyle(el).display !== 'none'));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.deepEqual(errors, []);
  console.log('Editor browser checks passed: routes, navigation/reload, rapid entry, MCQ reorder, stable edit IDs, duplication, import staging, batch editing, both folder backends, bank isolation and mobile layout.');
} finally { await browser?.close(); await server.close(); }
