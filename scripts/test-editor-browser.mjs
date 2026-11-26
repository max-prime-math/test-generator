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
  const questionsDivider = '[role="separator"][aria-label="Resize Questions pane"]';
  const previewDivider = '[role="separator"][aria-label="Resize Preview pane"]';
  const width = selector => page.$eval(selector, el => Math.round(el.getBoundingClientRect().width));
  const dragDivider = async (selector, distance) => {
    const grip = await (await page.$(selector)).boundingBox();
    const x = grip.x + grip.width / 2;
    const y = grip.y + 24;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + distance, y, { steps: 4 });
    await page.mouse.up();
  };
  const headings = () => page.$$eval('.editor-pane-heading h2', items => items.map(item => item.textContent));
  assert.deepEqual(await headings(), ['Questions', 'Write', 'Preview'], 'browsing has the same named panes as authoring');
  assert.match(await page.$eval('.editor-workspace .preview-empty', el => el.textContent), /Open or create a question/);
  const initialQuestionsWidth = await width('.editor-workspace aside');
  const initialPreviewWidth = await width('.editor-workspace .preview-pane');
  await dragDivider(questionsDivider, 48);
  assert.equal(await width('.editor-workspace aside'), initialQuestionsWidth + 48);
  await page.focus(previewDivider);
  await page.keyboard.press('ArrowLeft');
  assert.equal(await width('.editor-workspace .preview-pane'), initialPreviewWidth + 12);
  await page.select('[aria-label="Editor text size"]', '18');
  await clickText('.editor-workspace .actions button', '+ New Question');
  await page.waitForSelector('textarea[aria-label="Question"]');
  assert.deepEqual(await headings(), ['Questions', 'Write', 'Preview']);
  assert.match(await page.$eval('.editor-workspace .preview-empty', el => el.textContent), /Write your question/);
  assert.equal(await page.$('.preview .svg'), null, 'an empty draft shows guidance instead of an empty Typst page');
  const questionSource = 'textarea[aria-label="Question"]';
  assert.equal(await page.$eval(questionSource, el => getComputedStyle(el).fontSize), '18px');
  assert.equal(await page.$eval(questionSource, el => getComputedStyle(el).resize), 'vertical');
  const height = () => page.$eval(questionSource, el => el.getBoundingClientRect().height);
  const initialHeight = await height();
  const textBox = await (await page.$(questionSource)).boundingBox();
  await page.mouse.move(textBox.x + textBox.width - 3, textBox.y + textBox.height - 3);
  await page.mouse.down();
  await page.mouse.move(textBox.x + textBox.width - 3, textBox.y + textBox.height + 33, { steps: 4 });
  await page.mouse.up();
  assert.ok(await height() > initialHeight + 25, 'the native text box grip can be dragged');
  await page.type('textarea[aria-label="Question"]', 'Solve $x + 1 = 4$.');
  await page.type('textarea[aria-label="Solution"]', '$x = 3$');
  await page.waitForFunction(`(${draftsContain})('Solve $x + 1 = 4$.')`);
  await page.waitForSelector('.preview .svg svg', { timeout: 30000 });
  assert.equal(await page.$('.editor-workspace .preview-empty'), null, 'the preview replaces the prompt once text is entered');
  assert.equal(await page.$('.preview pre[role=alert]'), null);
  await clickText('nav button', 'Bank');
  await clickText('nav button', 'Editor');
  assert.equal(await page.$eval('textarea[aria-label="Question"]', el => el.value), 'Solve $x + 1 = 4$.');
  await page.reload({ waitUntil: 'networkidle0' });
  assert.equal(await page.$eval('textarea[aria-label="Solution"]', el => el.value), '$x = 3$');
  assert.equal(await page.$eval('[aria-label="Editor text size"]', el => el.value), '18');
  await page.waitForFunction((questions, preview) => {
    const size = selector => Math.round(document.querySelector(selector).getBoundingClientRect().width);
    return size('.editor-workspace aside') === questions && size('.editor-workspace .preview-pane') === preview;
  }, {}, initialQuestionsWidth + 48, initialPreviewWidth + 12);
  await page.click(questionsDivider, { clickCount: 2 });
  assert.equal(await width('.editor-workspace aside'), initialQuestionsWidth, 'double-click restores the default pane width');
  await page.keyboard.down('Control'); await page.keyboard.press('Enter'); await page.keyboard.up('Control');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('math-test-bank-v2') ?? '[]').length === 1);
  const first = await page.evaluate(() => JSON.parse(localStorage.getItem('math-test-bank-v2'))[0]);
  assert.equal(first.answer, undefined); assert.equal(first.choices, undefined);
  await page.waitForFunction(() => document.querySelector('textarea[aria-label="Question"]')?.value === '');
  await page.type('textarea[aria-label="Question"]', 'Choose $2$.');
  await page.select('.question-type select', 'mcq');
  assert.equal(await page.$('.question-type button'), null, 'Multiple choice uses choice fields');
  assert.equal(await page.$eval('textarea[aria-label="Choice A"]', el => getComputedStyle(el).fontSize), '18px');
  for (const [letter, value] of Object.entries({ A: '$1$', B: '$2$', C: '$3$', D: '$4$' })) await page.type(`textarea[aria-label="Choice ${letter}"]`, value);
  await page.click('input[aria-label="Mark B correct"]');
  await page.click('button[aria-label="Move B up"]');
  await clickText('.editor-workspace .actions button', 'Save');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('math-test-bank-v2')).length === 2);
  const mcq = await page.evaluate(() => JSON.parse(localStorage.getItem('math-test-bank-v2'))[1]);
  assert.equal(mcq.answer, 'A'); assert.equal(mcq.choices.A, '$2$');
  await page.evaluate(id => location.hash = `#/editor/${id}`, first.id);
  await page.waitForFunction(() => document.querySelector('textarea[aria-label="Question"]')?.value === 'Solve $x + 1 = 4$.');
  assert.deepEqual(await headings(), ['Questions', 'Write', 'Preview']);
  assert.equal(await page.$eval(questionSource, el => getComputedStyle(el).fontSize), '18px');
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
    await editor.save(draft);
    await localFolderBank.saveNow();
    const legacy = importRepoEntriesToAppData(await readRepoFolder(await window.showDirectoryPicker())).appData;
    await localFolderBank.disconnect();
    window.__fixtureFolder = 'workspace-editor-fixture';
    await localWorkspace.chooseFolder();
    const next = editor.open(bank.questions.find(q => q.id === id));
    next.fields.body = 'Editor saved through workspace.';
    await editor.save(next);
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
  await page.click('.defaults summary');
  await page.waitForSelector('[aria-label="Default question bank"]');
  const secondBankBeforeBrowse = await page.$eval('[aria-label="Question bank"]', el => el.value);
  await page.select('[aria-label="Default question bank"]', originalBank);
  assert.equal(await page.$eval('[aria-label="Question bank"]', el => el.value), secondBankBeforeBrowse, 'Defaults do not retarget the open draft');
  assert.ok(await page.$('.defaults .curriculum option[value="__new_class__"]'), 'Defaults offer class creation');
  assert.ok(await page.evaluate(() => {
    const bank = document.querySelector('[aria-label="Default question bank"]');
    const cls = document.querySelector('.defaults .curriculum select');
    return Boolean(bank.compareDocumentPosition(cls) & Node.DOCUMENT_POSITION_FOLLOWING);
  }), 'Default bank is above Class');
  await clickText('.editor-workspace .actions button', '+ New Question');
  assert.equal(await page.$eval('[aria-label="Question bank"]', el => el.value), originalBank, 'New questions use the sidebar bank default');
  await page.type('textarea[aria-label="Question"]', 'Default bank selection draft');
  await page.select('[aria-label="Default question bank"]', secondBankBeforeBrowse);
  await page.click('.browse-curriculum summary');
  assert.ok(await page.evaluate(() => {
    const bank = document.querySelector('[aria-label="Browse question bank"]');
    const cls = document.querySelector('.browse-curriculum .curriculum select');
    return Boolean(bank.compareDocumentPosition(cls) & Node.DOCUMENT_POSITION_FOLLOWING);
  }), 'Browse bank is above Class');
  await page.select('[aria-label="Browse question bank"]', originalBank);
  await page.waitForFunction(() => document.querySelector('textarea[aria-label="Question"]')?.value.includes('unfinished'));
  assert.ok(await page.evaluate(`(${draftsContain})('Second bank only draft')`));
  assert.equal(await page.evaluate(() => window.__noReload), true, 'Bank switching kept the app loaded');
  assert.ok(!(await page.$$eval('.draft-row', rows => rows.map(row => row.textContent).join(' '))).includes('Second bank only draft'), 'Drafts stay in their own bank');
  // Placement controls work for new drafts and existing bank questions.
  const secondBank = await page.evaluate(async () => {
    const { bankWorkspaces } = await import('/src/lib/bank-workspaces.svelte.ts');
    return bankWorkspaces.banks.find(bank => bank.name === 'Editor second bank').id;
  });
  const sharedClass = await page.evaluate(async () => {
    const { customClasses } = await import('/src/lib/custom-classes.svelte.ts');
    customClasses.importMany([{ id: 'other-bank-class', name: 'Other bank class', units: [{ id: 'other-unit', name: 'Other unit', sections: [{ id: 'other-section', name: 'Other section' }] }] }]);
    return 'other-bank-class';
  });
  await page.evaluate(async id => {
    const { bankWorkspaces } = await import('/src/lib/bank-workspaces.svelte.ts');
    await bankWorkspaces.switchBank(id);
  }, secondBank);
  await page.waitForFunction(() => [...document.querySelectorAll('.draft-row .item span')].some(el => el.textContent === 'Second bank only draft'));
  await page.evaluate(() => [...document.querySelectorAll('.draft-row .item')].find(el => el.querySelector('span')?.textContent === 'Second bank only draft').click());
  await page.waitForFunction(() => [...document.querySelectorAll('.question-form .curriculum select option')].some(o => o.value === 'other-bank-class'));
  await page.select('.question-form .curriculum label:nth-child(1) select', sharedClass);
  await page.select('.question-form .curriculum label:nth-child(2) select', 'other-unit');
  await page.select('.question-form .curriculum label:nth-child(3) select', 'other-section');
  assert.equal(await page.$eval('.question-form .curriculum optgroup option', el => el.textContent), 'Other bank class');
  await clickText('.editor-workspace .actions button', 'Save');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('math-test-bank-v2') ?? '[]').some(q => q.classId === 'other-bank-class'));
  assert.ok(await page.evaluate(() => JSON.parse(localStorage.getItem('math-test-custom-classes-v1')).some(c => c.id === 'other-bank-class' && c.units[0].sections[0].id === 'other-section')));
  // Creating a class leaves the prior selection intact if the prompt is cancelled.
  page.once('dialog', dialog => dialog.dismiss());
  await page.select('.question-form .curriculum label:nth-child(1) select', '__new_class__');
  assert.equal(await page.$eval('.question-form .curriculum label:nth-child(1) select', el => el.value), sharedClass);
  page.once('dialog', dialog => dialog.accept('New editor class'));
  await page.select('.question-form .curriculum label:nth-child(1) select', '__new_class__');
  await page.waitForFunction(() => document.querySelector('.question-form .curriculum select')?.selectedOptions[0]?.textContent === 'New editor class');
  const newClass = await page.$eval('.question-form .curriculum select', el => el.value);
  await page.select('[aria-label="Question bank"]', originalBank);
  await page.type('textarea[aria-label="Question"]', ' copied to the selected bank');
  await clickText('.editor-workspace .actions button', 'Save');
  await page.waitForFunction(() => !document.querySelector('textarea[aria-label="Question"]') && document.querySelector('.editor-workspace .status')?.textContent.includes('Saved to'));
  const destination = await page.evaluate(async id => {
    const { bankWorkspaces } = await import('/src/lib/bank-workspaces.svelte.ts');
    return bankWorkspaces.readBankSnapshot(id);
  }, originalBank);
  assert.ok(destination.questions.some(q => q.body.includes('copied to the selected bank') && q.classId === newClass));
  assert.ok(destination.customClasses.some(c => c.id === newClass));
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('math-test-bank-v2'))[0].body), 'Second bank only draft', 'Original survives saving an edited copy to another bank');
  await clickText('.editor-workspace .actions button', '+ New Question');
  assert.equal(await page.$eval('[aria-label="Question bank"]', el => el.value), originalBank, 'New drafts remember the chosen bank');
  assert.ok(await page.evaluate(() => {
    const bank = document.querySelector('[aria-label="Question bank"]');
    const cls = document.querySelector('.question-form .curriculum select');
    return Boolean(bank.compareDocumentPosition(cls) & Node.DOCUMENT_POSITION_FOLLOWING);
  }), 'Bank appears above Class');
  await page.type('textarea[aria-label="Question"]', 'New question for the selected bank');
  await page.reload({ waitUntil: 'networkidle0' });
  assert.equal(await page.$eval('[aria-label="Question bank"]', el => el.value), originalBank, 'Destination persists across reload');
  await clickText('.editor-workspace .actions button', 'Save');
  await page.waitForFunction(() => !document.querySelector('textarea[aria-label="Question"]') && document.querySelector('.editor-workspace .status')?.textContent.includes('Saved to'));
  assert.ok(await page.evaluate(async id => {
    const { bankWorkspaces } = await import('/src/lib/bank-workspaces.svelte.ts');
    return (await bankWorkspaces.readBankSnapshot(id)).questions.some(q => q.body === 'New question for the selected bank');
  }, originalBank));
  await page.screenshot({ path: '/tmp/testgen-editor-desktop.png', fullPage: true });
  const legacyMultipartId = await page.evaluate(async () => {
    const { bank } = await import('/src/lib/bank.svelte.ts');
    return bank.add({ body: 'Use the equation $x + y = 4$.', points: 3, tags: [], parts: {
      stem: '', items: [{ body: 'Find the intercepts.' }, { body: 'Draw the graph.' }],
    } }).id;
  });
  await page.evaluate(id => { location.hash = `#/editor/${id}`; }, legacyMultipartId);
  const stem = 'textarea[aria-label="Question stem / shared directions"]';
  await page.waitForSelector(stem, { visible: true });
  assert.equal(await page.$eval(stem, el => el.value), 'Use the equation $x + y = 4$.');
  await clickText('fieldset button', '+ Add part');
  await page.type('textarea[aria-label="Part c"]', 'Explain your reasoning.');
  await page.waitForFunction(`(${draftsContain})('Explain your reasoning.')`);
  await page.reload({ waitUntil: 'networkidle0' });
  assert.equal(await page.$eval('textarea[aria-label="Part c"]', el => el.value), 'Explain your reasoning.');
  await clickText('.editor-workspace .actions button', 'Save');
  await page.waitForFunction(id => {
    const question = JSON.parse(localStorage.getItem('math-test-bank-v2')).find(q => q.id === id);
    return question?.parts.items.length === 3 && question.parts.stem === 'Use the equation $x + y = 4$.';
  }, {}, legacyMultipartId);
  await page.setViewport({ width: 960, height: 800 });
  await page.waitForFunction(selector => {
    const divider = document.querySelector(selector);
    return getComputedStyle(divider).display !== 'none' && Number(divider.getAttribute('aria-valuemax')) < 450;
  }, {}, previewDivider);
  const narrowPreviewWidth = await width('.editor-workspace .preview-pane');
  const narrowQuestionsWidth = await width('.editor-workspace aside');
  await dragDivider(previewDivider, 40);
  assert.equal(await width('.editor-workspace .preview-pane'), narrowPreviewWidth - 40, 'Preview resizes at 960px');
  await dragDivider(questionsDivider, 24);
  assert.equal(await width('.editor-workspace aside'), narrowQuestionsWidth + 24, 'Questions resizes at 960px');
  await page.focus(questionsDivider);
  await page.keyboard.press('Enter');
  assert.equal(await width('.editor-workspace aside'), narrowQuestionsWidth, 'Enter restores the default width');
  await page.setViewport({ width: 390, height: 844 });
  await page.waitForSelector('.mobile-panels', { visible: true });
  await page.screenshot({ path: '/tmp/testgen-editor-mobile.png', fullPage: true });
  assert.ok(await page.$eval('.mobile-panels', el => getComputedStyle(el).display !== 'none'));
  assert.equal(await page.$eval(questionsDivider, el => getComputedStyle(el).display), 'none');
  await clickText('.mobile-panels button', 'Questions');
  await page.waitForSelector('.editor-workspace aside', { visible: true });
  await clickText('.mobile-panels button', 'Preview');
  await page.waitForSelector('.editor-workspace .preview-pane', { visible: true });
  await clickText('.mobile-panels button', 'Write');
  assert.equal(await page.$eval('textarea[aria-label="Part c"]', el => el.value), 'Explain your reasoning.');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.deepEqual(errors, []);
  console.log('Editor browser checks passed: routes, navigation/reload, rapid entry, MCQ reorder, stable edit IDs, duplication, import staging, batch editing, both folder backends, bank isolation, bank destinations, sidebar bank defaults and browsing, class creation, cross-bank curriculum and mobile layout.');
} finally { await browser?.close(); await server.close(); }
