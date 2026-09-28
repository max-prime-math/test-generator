// Build's ✎ buttons: edit a question from an unsaved test and from a saved one.
// A saved test keeps frozen copies; a question edited through its ✎ flows back into it.
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
  await page.evaluateOnNewDocument(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('tg-tutorial-done-v1', '1');
    localStorage.setItem('math-test-bank-v2', JSON.stringify(['Alpha', 'Bravo'].map((word, i) => (
      { id: `q${i + 1}`, body: `${word} question`, points: 2, tags: [], createdAt: 1 }))));
  });
  const base = server.resolvedUrls.local[0];
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  await page.goto(`${base}#/build`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.picker-edit');

  const selectedEdit = () => page.evaluate(() => {
    const button = [...document.querySelectorAll('.sel-actions button')].find(b => b.textContent.trim() === '✎');
    return button ? { disabled: button.disabled, title: button.title } : null;
  });
  const clickSelectedEdit = () => page.evaluate(() => [...document.querySelectorAll('.sel-actions button')].find(b => b.textContent.trim() === '✎').click());
  const backToBuild = async () => { await page.evaluate(() => { location.hash = '#/build'; }); await pause(800); };
  const frozen = () => page.evaluate(async () => {
    const { testLibrary } = await import('/src/lib/test-library.svelte.ts');
    return testLibrary.tests[0].questionSnapshots.map(q => q.body);
  });
  const editBank = body => page.evaluate(async text => {
    const { bank } = await import('/src/lib/bank.svelte.ts');
    bank.update('q1', { body: text });
  }, body);

  // 1. The picker ✎ and an unsaved test's ✎ open the question in the editor.
  await page.click('.picker-edit');
  await pause(500);
  assert.equal(await page.evaluate(() => location.hash), '#/editor/q1');
  await backToBuild();
  await page.click('input[aria-label="Include question in test"]');
  assert.deepEqual(await selectedEdit(), { disabled: false, title: 'Edit this question' });
  await clickSelectedEdit();
  await pause(500);
  assert.equal(await page.evaluate(() => location.hash), '#/editor/q1');
  await backToBuild();

  // 2. A saved test's ✎ is enabled too.
  await page.evaluate(async () => {
    const { testEditor } = await import('/src/lib/test-editor.svelte.ts');
    await testEditor.saveAs({ name: 'Saved quiz', classId: null, unitId: null, testType: 'quiz' });
  });
  await pause(500);
  assert.deepEqual(await frozen(), ['Alpha question']);
  assert.deepEqual(await selectedEdit(), { disabled: false, title: 'Edit this question in the bank; saving your changes also updates this test' });

  // 3. Opening the editor without changing anything keeps the frozen copy.
  await clickSelectedEdit();
  await pause(500);
  assert.equal(await page.evaluate(() => location.hash), '#/editor/q1');
  await backToBuild();
  assert.deepEqual(await frozen(), ['Alpha question'], 'an unchanged question keeps its frozen copy');

  // 4. Editing it in the bank flows back into the saved test.
  await clickSelectedEdit();
  await pause(500);
  await editBank('Alpha question, edited');
  await backToBuild();
  assert.deepEqual(await frozen(), ['Alpha question, edited'], 'the saved test picks up the edit');
  assert.match(await page.$eval('.sel-body', el => el.textContent), /edited/);

  // 5. Other bank edits, not made through this test's ✎, leave the frozen copy alone.
  await editBank('Changed from the Bank tab');
  await pause(800);
  assert.deepEqual(await frozen(), ['Alpha question, edited'], 'other bank edits do not change a saved test');

  assert.deepEqual(errors, []);
  console.log('Build edit buttons passed: picker and selected ✎ open the editor, saved tests can edit, edits flow back, unchanged and unrelated edits keep the frozen copy.');
} finally {
  await browser?.close();
  await server.close();
}
