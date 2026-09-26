// "Add to…" from Bank and Editor: current test, new test, and nothing lost on the way.
// Synthetic data in an isolated browser. SCREENSHOT_DIR=<dir> also saves the open menu at 1440px and 390px.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';

const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
let browser;
try {
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 950 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => { errors.push(`Unexpected dialog: ${dialog.message()}`); void dialog.dismiss(); });
  await page.evaluateOnNewDocument(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('tg-tutorial-done-v1', '1');
    localStorage.setItem('math-test-bank-v2', JSON.stringify(['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'].map((word, i) => (
      { id: `q${i + 1}`, body: `${word} question: solve x + ${i} = ${i + 2}`, points: 2, tags: [], createdAt: 1 }))));
  });
  const base = server.resolvedUrls.local[0];
  await page.goto(`${base}#/bank`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.list .card');

  const state = () => page.evaluate(async () => {
    const { testEditor } = await import('/src/lib/test-editor.svelte.ts');
    const { testLibrary } = await import('/src/lib/test-library.svelte.ts');
    return { testId: testEditor.testId, ids: [...testEditor.config.selectedIds], unnamed: testEditor.unnamedDraft ? [...testEditor.unnamedDraft.selectedIds] : null,
      library: testLibrary.tests.map(t => ({ id: t.id, name: t.name, ids: [...t.config.selectedIds], snapshots: (t.questionSnapshots ?? []).map(q => q.id) })) };
  });
  const go = async hash => { await page.evaluate(hash => { window.location.hash = hash; }, hash); await new Promise(r => setTimeout(r, 50)); };
  const selectCards = async ids => {
    await page.evaluate(() => document.querySelectorAll('.bulk-actions button').forEach(b => b.textContent.trim() === 'Clear' && b.click()));
    for (const id of ids) await page.click(`.card[data-qid="${id}"] .select-box`);
  };
  const choose = async (scope, label) => {
    await page.click(`${scope} .add-to-trigger`);
    await page.waitForSelector(`${scope} [role="menu"]`);
    await page.evaluate((scope, label) => [...document.querySelectorAll(`${scope} [role="menuitem"]`)].find(item => item.textContent.startsWith(label)).click(), scope, label);
    await page.waitForFunction(scope => !document.querySelector(`${scope} [role="menu"]`), {}, scope);
  };
  const bankResult = () => page.waitForSelector('.bulk-editor .add-result').then(el => el.evaluate(el => el.textContent.trim()));
  const buildList = async () => {
    await go('#/build');
    return page.$$eval('.selected-list .sel-body', els => els.map(el => el.textContent.slice(0, 7)));
  };

  // 1. Bank: two checked questions join the current test in bank display order.
  await selectCards(['q3', 'q1']);
  assert.equal(await page.$eval('.bulk-editor .add-to-trigger', el => el.textContent), 'Add to…');
  await choose('.bulk-editor', 'Current test');
  assert.match(await bankResult(), /^Added 2 questions to Unsaved test · Open in Build$/);
  assert.deepEqual((await state()).ids, ['q1', 'q3']);
  assert.deepEqual(await buildList(), ['Alpha q', 'Charlie']);
  await go('#/bank');

  // 2. The selection stays; re-adding skips what the test already has.
  assert.equal(await page.$$eval('.card .select-box:checked', els => els.length), 2, 'selection is kept after adding');
  await page.click('.card[data-qid="q2"] .select-box');
  await choose('.bulk-editor', 'Current test');
  assert.match(await bankResult(), /Added 1 question to Unsaved test · 2 already in test/);
  assert.deepEqual((await state()).ids, ['q1', 'q3', 'q2']);

  // 3. Keyboard: Enter opens with focus on the first item, arrows wrap, Escape closes back to the trigger; outside clicks close.
  await page.focus('.bulk-editor .add-to-trigger');
  await page.keyboard.press('Enter');
  await page.waitForSelector('[role="menu"]');
  const focused = () => page.evaluate(() => document.activeElement.textContent.trim().slice(0, 12));
  assert.equal(await page.$eval('.add-to-trigger', el => el.getAttribute('aria-expanded')), 'true');
  assert.equal(await focused(), 'Current test');
  await page.keyboard.press('ArrowDown'); assert.equal(await focused(), 'New testYour');
  await page.keyboard.press('ArrowDown'); assert.equal(await focused(), 'Current test');
  await page.keyboard.press('ArrowUp'); assert.equal(await focused(), 'New testYour');
  await page.keyboard.press('Escape');
  assert.equal(await page.$('[role="menu"]'), null);
  assert.equal(await focused(), 'Add to…');
  assert.equal(await page.$$eval('.card .select-box:checked', els => els.length), 3, 'Escape in the menu does not clear the bank selection');
  await page.keyboard.press('Enter');
  await page.waitForSelector('[role="menu"]');
  await page.keyboard.press('ArrowDown');
  const before = (await state()).ids;
  await page.mouse.click(700, 900);
  await page.waitForFunction(() => !document.querySelector('[role="menu"]'));
  assert.deepEqual((await state()).ids, before, 'closing the menu changes nothing');
  // Choosing with the keyboard (Enter on "Current test").
  await page.focus('.bulk-editor .add-to-trigger');
  await page.keyboard.press('Enter');
  await page.waitForSelector('[role="menu"]');
  await page.keyboard.press('Enter');
  assert.match(await bankResult(), /Nothing added to Unsaved test · 3 already in test/);

  // 4. New test from an unnamed working test with content: it is kept as a named test.
  await selectCards(['q4']);
  await choose('.bulk-editor', 'New test');
  const kept = await bankResult();
  assert.match(kept, /^Started a new test with 1 question · Your previous unsaved test was kept as “Unsaved test – .+” · Open in Build$/);
  let s = await state();
  assert.equal(s.testId, null);
  assert.deepEqual(s.ids, ['q4']);
  assert.equal(s.library.length, 1);
  assert.deepEqual(s.library[0].ids, ['q1', 'q3', 'q2']);
  assert.deepEqual(s.library[0].snapshots, ['q1', 'q3', 'q2'], 'the kept test froze its questions like Save As');
  assert.ok(kept.includes(s.library[0].name));
  assert.deepEqual(await buildList(), ['Delta q']);
  await page.evaluate(() => [...document.querySelectorAll('.test-toolbar button')].find(b => b.textContent.includes('Saved Tests')).click());
  await page.evaluate(() => { for (const el of document.querySelectorAll('.saved-group-header')) if (el.querySelector('button')?.title === 'Expand') el.querySelector('button').click(); });
  await page.waitForFunction(name => [...document.querySelectorAll('.saved-item-name')].some(el => el.textContent.includes(name)), {}, s.library[0].name);
  await go('#/bank');

  // 5. New test from a NAMED test: its latest edit (still in the autosave debounce) is flushed, nothing else is created.
  const namedId = await page.evaluate(async () => {
    const { testEditor } = await import('/src/lib/test-editor.svelte.ts');
    await testEditor.saveAs({ name: 'Named A', classId: null, unitId: null, testType: 'quiz' });
    return testEditor.testId;
  });
  await selectCards(['q5']);
  await page.waitForFunction(() => document.querySelector('.add-to-trigger') && !document.querySelector('.add-to-trigger').disabled);
  await page.click('.bulk-editor .add-to-trigger');
  await page.waitForFunction(() => document.querySelector('[role="menuitem"] small')?.textContent === 'Named A · 1 question');
  await page.keyboard.press('Escape');
  await choose('.bulk-editor', 'Current test');
  await selectCards(['q2']);
  await choose('.bulk-editor', 'New test');
  assert.match(await bankResult(), /^Started a new test with 1 question · Open in Build$/);
  s = await state();
  const named = s.library.find(t => t.id === namedId);
  assert.deepEqual(named.ids, ['q4', 'q5'], 'the named test kept the edit made just before New test');
  assert.deepEqual(named.snapshots, ['q4', 'q5']);
  assert.equal(s.library.length, 2);
  assert.deepEqual([s.testId, s.ids], [null, ['q2']]);

  // 6. A named test is open AND an unnamed working test is stashed: both are kept.
  await page.evaluate(async id => (await import('/src/lib/test-editor.svelte.ts')).testEditor.open(id), namedId);
  s = await state();
  assert.deepEqual([s.testId, s.unnamed], [namedId, ['q2']]);
  await selectCards(['q1']);
  await choose('.bulk-editor', 'New test');
  assert.match(await bankResult(), /kept as “Unsaved test – /);
  s = await state();
  assert.equal(s.library.length, 3);
  assert.deepEqual(s.library.find(t => t.id === namedId).ids, ['q4', 'q5']);
  const stashed = s.library.find(t => t.id !== namedId && t.ids.join() === 'q2');
  assert.ok(stashed, 'the stashed unnamed test was saved');
  assert.notEqual(stashed.name, s.library[0].name, 'kept names never collide');
  assert.deepEqual([s.testId, s.ids, s.unnamed], [null, ['q1'], null]);

  // 7. Reload keeps everything.
  await page.reload({ waitUntil: 'networkidle0' });
  s = await state();
  assert.deepEqual([s.testId, s.ids, s.library.length], [null, ['q1'], 3]);
  assert.deepEqual(await buildList(), ['Alpha q']);

  // 8. Editor: edited bank questions add their bank question; new drafts are skipped and named; bank rows can be checked too.
  await go('#/editor');
  await page.waitForSelector('.bank-item');
  const clickText = (selector, text) => page.evaluate((selector, text) => [...document.querySelectorAll(selector)].find(el => el.textContent.trim().startsWith(text)).click(), selector, text);
  await clickText('.bank-item', 'Bravo');
  await page.waitForSelector('textarea[aria-label="Question"]');
  await page.focus('textarea[aria-label="Question"]'); await page.keyboard.type(' (edited)');
  await clickText('.actions button', '+ New Question');
  await page.focus('textarea[aria-label="Question"]'); await page.keyboard.type('Brand new draft');
  await page.waitForFunction(() => document.querySelectorAll('.draft-row').length === 2);
  for (const box of await page.$$('.draft-row input[type="checkbox"]')) await box.click();
  await page.evaluate(() => [...document.querySelectorAll('.bank-row')].find(row => row.textContent.includes('Echo')).querySelector('input').click());
  assert.equal(await page.$eval('.selection > span', el => el.textContent), '2 drafts · 1 bank question selected');
  await choose('.selection', 'Current test');
  const editorResult = await page.$eval('.selection .add-result', el => el.textContent.trim());
  assert.equal(editorResult, 'Added 2 questions to Unsaved test · 1 new draft must be saved to the bank first · Open in Build');
  assert.deepEqual((await state()).ids, ['q1', 'q2', 'q5']);
  const bankBody = await page.evaluate(async () => (await import('/src/lib/bank.svelte.ts')).bank.questions.find(q => q.id === 'q2').body);
  assert.ok(!bankBody.includes('(edited)'), 'drafts are never saved silently');
  // Only bank questions checked: draft actions are hidden.
  await clickText('.selection button', 'Clear');
  await page.evaluate(() => [...document.querySelectorAll('.bank-row')].find(row => row.textContent.includes('Delta')).querySelector('input').click());
  assert.deepEqual(await page.$$eval('.selection button', els => els.map(el => el.textContent.trim())), ['Add to…', 'Clear']);
  await choose('.selection', 'Current test');
  assert.deepEqual((await state()).ids, ['q1', 'q2', 'q5', 'q4']);
  await clickText('.selection .add-result a', 'Open in Build');
  await page.waitForFunction(() => window.location.hash === '#/build');
  assert.deepEqual(await page.$$eval('.selected-list .sel-body', els => els.map(el => el.textContent.slice(0, 7))), ['Alpha q', 'Bravo q', 'Echo qu', 'Delta q']);

  // 9. Workspace mode: the active bank's questions join as the catalog ids Build lists, and are recognized as duplicates.
  const catalogIds = await page.evaluate(async () => {
    const { workspaceCatalog } = await import('/src/lib/workspace-catalog.svelte.ts');
    const { bankWorkspaces } = await import('/src/lib/bank-workspaces.svelte.ts');
    const { bank } = await import('/src/lib/bank.svelte.ts');
    await workspaceCatalog.replace([{ id: bankWorkspaces.activeBankId, name: 'Active bank', data: { questions: JSON.parse(JSON.stringify(bank.questions)), customClasses: [], narratives: [], savedTests: [], images: [] } },
      { id: 'other-bank', name: 'Other bank', data: { questions: [{ id: 'q3', body: 'Other bank Charlie', points: 1, tags: [], createdAt: 1 }], customClasses: [], narratives: [], savedTests: [], images: [] } }]);
    return Object.fromEntries(Object.entries(workspaceCatalog.sources).filter(([, s]) => s.bankId === bankWorkspaces.activeBankId).map(([id, s]) => [s.questionId, id]));
  });
  await go('#/bank');
  await selectCards(['q1', 'q3']);
  await choose('.bulk-editor', 'Current test');
  assert.match(await bankResult(), /Added 1 question to Unsaved test · 1 already in test/);
  s = await state();
  assert.deepEqual(s.ids, ['q1', 'q2', 'q5', 'q4', catalogIds.q3]);
  await go('#/build');
  const pickerChecked = await page.$$eval('.picker-list .picker-item', items => items.filter(i => i.getAttribute('aria-checked') === 'true').map(i => i.querySelector('.picker-body').textContent.slice(0, 7)));
  assert.ok(pickerChecked.includes('Charlie'), 'the catalog row is checked in the picker');
  assert.ok(!pickerChecked.includes('Other b'), "another bank's question with the same id is not");
  assert.deepEqual((await page.$$eval('.selected-list .sel-body', els => els.map(el => el.textContent.slice(0, 7)))).at(-1), 'Charlie');
  const exported = await page.evaluate(async () => {
    const { testEditor } = await import('/src/lib/test-editor.svelte.ts');
    await testEditor.saveAs({ name: 'Workspace export', classId: null, unitId: null, testType: null });
    const { testLibrary } = await import('/src/lib/test-library.svelte.ts');
    return testLibrary.get(testEditor.testId).questionSnapshots.map(q => q.body.slice(0, 7));
  });
  assert.deepEqual(exported, ['Alpha q', 'Bravo q', 'Echo qu', 'Delta q', 'Charlie'], 'the saved test freezes the right questions');

  if (process.env.SCREENSHOT_DIR) {
    await go('#/bank');
    await selectCards(['q1', 'q2']);
    for (const [name, width, height] of [['wide', 1440, 900], ['narrow', 390, 844]]) {
      await page.setViewport({ width, height });
      await page.click('.bulk-editor .add-to-trigger');
      await page.waitForSelector('[role="menu"]');
      await page.$eval('.bulk-editor', el => el.scrollIntoView({ block: 'start' }));
      await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/add-to-${name}.png` });
      await page.keyboard.press('Escape');
    }
    await page.setViewport({ width: 1440, height: 900 });
    await choose('.bulk-editor', 'Current test');
    await bankResult();
    await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/add-to-result.png` });
  }

  // 10. A named test that cannot be saved (changed elsewhere) blocks New test with a visible error; nothing changes.
  await go('#/bank');
  const conflict = await page.evaluate(async () => {
    const { testEditor } = await import('/src/lib/test-editor.svelte.ts');
    const { testLibrary } = await import('/src/lib/test-library.svelte.ts');
    const id = testEditor.testId;
    testLibrary.update(id, { ...testLibrary.load(id), subtitle: 'Changed elsewhere' });
    testEditor.config.subtitle = 'My pending edit';
    return { id, ids: [...testEditor.config.selectedIds], tests: testLibrary.tests.length };
  });
  await selectCards(['q2']);
  await choose('.bulk-editor', 'New test');
  assert.match(await page.$eval('.bulk-editor .add-result.error', el => el.textContent), /changed elsewhere/);
  s = await state();
  assert.deepEqual([s.testId, s.ids, s.library.length], [conflict.id, conflict.ids, conflict.tests]);
  assert.equal(await page.evaluate(async () => (await import('/src/lib/test-editor.svelte.ts')).testEditor.config.subtitle), 'My pending edit');

  assert.deepEqual(errors, []);
  console.log('Add to… passed: Bank and Editor, current/new test, nothing lost (named, unnamed, stashed), keyboard menu, reload, workspace ids, failed save blocks New test.');
} finally {
  await browser?.close();
  await server.close();
}
