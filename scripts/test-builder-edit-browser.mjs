// Build's ✎ buttons. A picker row edits the bank question. A question in the test always
// opens in the Editor's test mode: Save for this test, Save in original bank (found wherever
// the question came from), Cancel; a generated question offers Edit in Generator instead.
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
  page.on('dialog', dialog => void dialog.accept());
  await page.evaluateOnNewDocument(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('tg-tutorial-done-v1', '1');
    localStorage.setItem('tg-generator-experimental-enabled-v1', 'true');
    localStorage.setItem('math-test-bank-v2', JSON.stringify(['Alpha', 'Bravo'].map((word, i) => (
      { id: `q${i + 1}`, body: `${word} question`, points: 2, tags: [], createdAt: 1 }))));
  });
  const base = server.resolvedUrls.local[0];
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  await page.goto(`${base}#/build`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.picker-edit');

  const hash = () => page.evaluate(() => location.hash);
  const clickText = (selector, text) => page.evaluate((s, t) => {
    const el = [...document.querySelectorAll(s)].find(e => e.textContent.trim() === t && !e.disabled);
    if (!el) throw new Error(`No enabled ${s} “${t}”`);
    el.click();
  }, selector, text);
  // Open Selected before editing a question in the test.
  const editInTest = async n => {
    await page.click('#picker-tab-selected');
    await page.$eval(`.sel-actions button[aria-label="Edit question ${n}"]`, button => button.click());
    await page.waitForSelector('.toolbar.test-edit');
  };

  const toolbar = () => page.evaluate(() => ({
    title: document.querySelector('.test-edit-title strong').textContent,
    status: document.querySelector('.test-edit-title .status').textContent,
    buttons: [...document.querySelectorAll('.test-edit .actions button')].map(b => b.textContent.trim()),
    navigator: !!document.querySelector('.editor-workspace aside'),
  }));
  const typeBody = text => page.evaluate(t => {
    const area = document.querySelector('.form-pane textarea');
    area.value = t;
    area.dispatchEvent(new Event('input', { bubbles: true }));
  }, text);
  const bankBodies = () => page.evaluate(async () => (await import('/src/lib/bank.svelte.ts')).bank.questions.map(q => q.body));
  const selectedBodies = () => page.$$eval('.selected-list .sel-body', els => els.map(el => el.textContent.trim()));
  const state = () => page.evaluate(async () => {
    const { testEditor } = await import('/src/lib/test-editor.svelte.ts');
    const { testLibrary } = await import('/src/lib/test-library.svelte.ts');
    const saved = testEditor.testId ? testLibrary.get(testEditor.testId) : null;
    return { ids: [...testEditor.config.selectedIds], own: (testEditor.config.ownQuestions ?? []).map(q => [q.id, q.body]),
      frozen: saved?.questionSnapshots?.map(q => q.body) ?? null, dirty: testEditor.dirty };
  });
  const backInBuild = async () => { await page.waitForFunction(() => location.hash === '#/build'); await page.waitForSelector('.selected-list .sel-body'); await pause(300); };

  // 1. A picker row's ✎ edits the bank question in the ordinary Editor.
  await page.click('.picker-edit');
  await page.waitForFunction(() => location.hash === '#/editor/q1');
  assert.equal(await page.$('.toolbar.test-edit'), null);
  await page.evaluate(() => { location.hash = '#/build'; });
  await pause(500);

  // 2. A question in the test opens in test mode: its own toolbar, no navigator.
  await page.click('input[aria-label="Include question in test"]');
  await editInTest(1);
  assert.equal(await hash(), '#/editor/test-question');
  assert.deepEqual(await toolbar(), { title: 'Question 1 in “Unsaved test”', status: 'From bank “Local Bank”', buttons: ['Cancel', 'Save in original bank', 'Save for this test'], navigator: false });

  // 3. Cancel leaves without saving anything, and the edit survives a reload until then.
  await typeBody('Alpha, cancelled');
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('.toolbar.test-edit');
  assert.equal(await page.$eval('.form-pane textarea', el => el.value), 'Alpha, cancelled', 'the edit survives a reload');
  await clickText('.test-edit .actions button', 'Cancel');
  await backInBuild();
  assert.deepEqual(await bankBodies(), ['Alpha question', 'Bravo question']);
  assert.deepEqual(await selectedBodies(), ['Alpha question']);

  // 4. Save for this test: the test changes, the bank does not.
  await editInTest(1);
  await typeBody('Alpha, for this test');
  await clickText('.test-edit .actions button', 'Save for this test');
  await backInBuild();
  assert.deepEqual(await selectedBodies(), ['Alpha, for this test']);
  assert.deepEqual(await bankBodies(), ['Alpha question', 'Bravo question'], 'the bank is untouched');
  assert.deepEqual((await state()).own, [['q1', 'Alpha, for this test']]);

  // 5. In a saved test, Save in original bank overwrites the bank question and updates the test.
  await page.evaluate(async () => {
    const { testEditor } = await import('/src/lib/test-editor.svelte.ts');
    testEditor.addQuestions(['q2']);
    await testEditor.saveAs({ name: 'Saved quiz', classId: null, unitId: null, testType: 'quiz' });
  });
  await pause(500);
  assert.deepEqual((await state()).frozen, ['Alpha, for this test', 'Bravo question']);
  await editInTest(2);
  assert.equal((await toolbar()).title, 'Question 2 in “Saved quiz”');
  await typeBody('Bravo, saved in the bank');
  await clickText('.test-edit .actions button', 'Save in original bank');
  await backInBuild();
  assert.deepEqual(await bankBodies(), ['Alpha question', 'Bravo, saved in the bank']);
  assert.deepEqual(await selectedBodies(), ['Alpha, for this test', 'Bravo, saved in the bank']);
  await page.waitForFunction(async () => {
    const { testEditor } = await import('/src/lib/test-editor.svelte.ts');
    return !testEditor.dirty && !testEditor.saving;
  });
  assert.deepEqual((await state()).frozen, ['Alpha, for this test', 'Bravo, saved in the bank'], 'the saved test keeps the edit');

  // 6. With the original deleted, a question can still be edited for this test.
  await page.evaluate(async () => (await import('/src/lib/bank.svelte.ts')).bank.remove('q2'));
  await pause(300);
  await editInTest(2);
  assert.deepEqual((await toolbar()).buttons, ['Cancel', 'Save for this test']);
  assert.match((await toolbar()).status, /bank original is not available/);
  await typeBody('Bravo, orphan edit');
  await clickText('.test-edit .actions button', 'Save for this test');
  await backInBuild();
  assert.deepEqual(await selectedBodies(), ['Alpha, for this test', 'Bravo, orphan edit']);

  // 7. A generated question offers Edit in Generator; its new questions take its place.
  await page.evaluate(async () => {
    const { testEditor } = await import('/src/lib/test-editor.svelte.ts');
    const { toQuestion } = await import('/src/lib/generator/registry.ts');
    const { testQuestions } = await import('/src/lib/generator/worksheet.ts');
    const planned = [{ item: { generatorId: 'mb-10i-factor-trinomials', difficulty: 2, seed: 12345, options: {} }, format: 'written', sectionId: '', index: 0 }];
    const own = testQuestions(planned, planned.map(p => toQuestion(p.item, p.format)));
    testEditor.addQuestions(own.map(q => q.id), own);
  });
  const before = await state();
  const generatedId = before.ids[2];
  assert.match(generatedId, /^gen-/);
  await editInTest(3);
  assert.deepEqual((await toolbar()).buttons, ['Cancel', 'Edit in Generator', 'Save for this test']);
  assert.equal((await toolbar()).status, 'Generated for this test');
  await clickText('.test-edit .actions button', 'Edit in Generator');
  await page.waitForFunction(() => location.hash === '#/generate');
  await page.waitForSelector('.type-card');
  assert.match(await page.$eval('.type-card .note', el => el.textContent), /replace the question in “Saved quiz”/);
  assert.equal(await page.$eval('.type-card .count input', el => el.value), '1');
  await page.$eval('.type-card .count input', el => { el.value = '2'; el.dispatchEvent(new Event('change', { bubbles: true })); });
  await clickText('.type-card button', 'Replace in test');
  await backInBuild();
  const after = await state();
  assert.equal(after.ids.length, 4);
  assert.deepEqual(after.ids.slice(0, 2), before.ids.slice(0, 2));
  assert.equal(after.ids[2], generatedId, 'the same seed and settings keep the same question');
  assert.match(after.ids[3], /^gen-/);
  assert.notEqual(after.ids[3], generatedId);

  // 8. Cancel from Generate returns to Build without changes.
  await editInTest(3);
  await clickText('.test-edit .actions button', 'Edit in Generator');
  await page.waitForSelector('.type-card');
  await clickText('.type-card button', 'Cancel');
  await backInBuild();
  assert.deepEqual((await state()).ids, after.ids);

  // 9. Pictures in a test's frozen copy are renamed; saving to the bank restores the bank's names.
  assert.deepEqual(await page.evaluate(async () => {
    const { bankFields } = await import('/src/lib/editor/test-question-edit.svelte.ts');
    const current = { id: 'b', body: 'x', points: 1, tags: [], createdAt: 1, images: ['diagram_x'], narrativeId: 'n1', narrative: 'Shared' };
    const testCopy = { ...current, id: 't', images: ['testasset-ab-12-diagram_x'], narrativeId: undefined, narrative: 'Shared' };
    const edited = { ...testCopy, body: 'See #image("/imgs/testasset-ab-12-diagram_x.png")' };
    const fields = bankFields(edited, testCopy, current);
    return [fields.body, fields.images, fields.narrativeId];
  }), ['See #image("/imgs/diagram_x.png")', ['diagram_x'], 'n1']);

  // 10. Workspace mode: a question from a bank that is not open is saved straight into that bank.
  const firstBank = await page.evaluate(async () => (await import('/src/lib/bank-workspaces.svelte.ts')).bankWorkspaces.activeBankId);
  await page.evaluate(async () => (await import('/src/lib/bank-workspaces.svelte.ts')).bankWorkspaces.createBank('Second'));
  await page.waitForFunction(async first => (await import('/src/lib/bank-workspaces.svelte.ts')).bankWorkspaces.activeBankId !== first, {}, firstBank);
  await page.evaluate(async first => {
    const { workspaceCatalog } = await import('/src/lib/workspace-catalog.svelte.ts');
    const { testEditor } = await import('/src/lib/test-editor.svelte.ts');
    workspaceCatalog.questions = [{ id: 'ws-alpha', body: 'Alpha question', points: 2, tags: [], createdAt: 1 }];
    workspaceCatalog.sources = { 'ws-alpha': { bankId: first, bankName: 'Local Bank', questionId: 'q1' } };
    testEditor.addQuestions(['ws-alpha']);
  }, firstBank);
  await page.evaluate(() => { location.hash = '#/build'; });
  await page.waitForSelector('.selected-list .sel-body');
  await editInTest(1);
  assert.equal((await toolbar()).status, 'From bank “Local Bank”');
  await typeBody('Alpha, saved from another bank');
  await clickText('.test-edit .actions button', 'Save in original bank');
  await backInBuild();
  assert.deepEqual(await selectedBodies(), ['Alpha, saved from another bank']);
  const stored = await page.evaluate(async first => (await (await import('/src/lib/bank-workspaces.svelte.ts')).bankWorkspaces.readBankSnapshot(first)).questions.map(q => q.body), firstBank);
  assert.deepEqual(stored, ['Alpha, saved from another bank'], 'the dormant bank holds the edit');
  await page.evaluate(async first => (await import('/src/lib/bank-workspaces.svelte.ts')).bankWorkspaces.switchBank(first), firstBank);
  await page.waitForFunction(async () => (await import('/src/lib/bank.svelte.ts')).bank.questions[0]?.body === 'Alpha, saved from another bank');

  assert.deepEqual(errors, []);
  console.log('Build edit buttons passed: picker ✎ edits the bank; test ✎ always opens test mode; cancel (after reload); save for this test; save in original bank (saved test updates); deleted original; Edit in Generator replace and cancel; picture names restored; another workspace bank saved without switching.');
} finally {
  await browser?.close();
  await server.close();
}
