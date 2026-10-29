import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';

const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
let browser;
try {
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('tg-tutorial-done-v1', '1');
    localStorage.setItem('tg-gradebook-experimental-enabled-v1', 'true');
  });
  await page.goto(`${server.resolvedUrls.local[0]}#/editor`, { waitUntil: 'networkidle0' });

  const controls = label => `.history-controls[aria-label="${label} history"]`;
  const waitMode = label => page.waitForSelector(controls(label));
  const enabled = (label, action) => page.$eval(`${controls(label)} [aria-label="${action}"]`, button => !button.disabled);
  const clickHistory = (label, action) => page.click(`${controls(label)} [aria-label="${action}"]`);

  await waitMode('Editor');
  assert.equal(await page.$(controls('Build')), null, 'Only the active mode exposes its controls');
  await page.evaluate(() => [...document.querySelectorAll('.editor-workspace .actions button')].find(button => button.textContent.trim() === '+ New Question').click());
  await page.waitForSelector('textarea[aria-label="Question"]');
  await page.type('textarea[aria-label="Question"]', 'alpha');
  await page.click('.draft-heading');
  await page.waitForFunction(selector => !document.querySelector(selector).disabled, {}, `${controls('Editor')} [aria-label="Undo"]`);
  await clickHistory('Editor', 'Undo');
  assert.equal(await page.$eval('textarea[aria-label="Question"]', input => input.value), '', 'Toolbar Undo reverses one typing burst');
  await clickHistory('Editor', 'Redo');
  assert.equal(await page.$eval('textarea[aria-label="Question"]', input => input.value), 'alpha');

  // Native character-level history remains in charge while a text field has focus.
  await page.focus('textarea[aria-label="Question"]');
  await page.type('textarea[aria-label="Question"]', ' beta');
  await page.keyboard.down('Control'); await page.keyboard.press('z'); await page.keyboard.up('Control');
  assert.equal(await page.$eval('textarea[aria-label="Question"]', input => input.value), 'alpha');

  // Build has an independent stack.
  await page.evaluate(() => { location.hash = '#/build'; });
  await waitMode('Build');
  const originalSubtitle = await page.evaluate(async () => (await import('/src/lib/test-editor.svelte.ts')).testEditor.config.subtitle);
  await page.evaluate(async () => {
    const { testEditor } = await import('/src/lib/test-editor.svelte.ts');
    testEditor.config.subtitle = 'Build history change';
    testEditor.checkpoint();
  });
  await page.waitForFunction(selector => !document.querySelector(selector).disabled, {}, `${controls('Build')} [aria-label="Undo"]`);

  // Make another Editor change, then prove undo there does not touch Build.
  await page.evaluate(() => { location.hash = '#/editor'; });
  await waitMode('Editor');
  await page.$eval('input[type="number"][min="0"]', input => { input.value = '7'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.click('.draft-heading');
  await page.keyboard.down('Control'); await page.keyboard.press('z'); await page.keyboard.up('Control');
  assert.equal(await page.$eval('textarea[aria-label="Question"]', input => input.value), 'alpha');
  assert.equal(await page.evaluate(async () => (await import('/src/lib/test-editor.svelte.ts')).testEditor.config.subtitle), 'Build history change');

  await page.evaluate(() => { location.hash = '#/build'; });
  await waitMode('Build');
  await page.keyboard.down('Control'); await page.keyboard.press('z'); await page.keyboard.up('Control');
  assert.equal(await page.evaluate(async () => (await import('/src/lib/test-editor.svelte.ts')).testEditor.config.subtitle), originalSubtitle);
  await page.keyboard.down('Control'); await page.keyboard.down('Shift'); await page.keyboard.press('z'); await page.keyboard.up('Shift'); await page.keyboard.up('Control');
  assert.equal(await page.evaluate(async () => (await import('/src/lib/test-editor.svelte.ts')).testEditor.config.subtitle), 'Build history change');

  // Gradebook structure and score history share its own mode-local stack.
  await page.evaluate(() => { location.hash = '#/gradebook'; });
  await waitMode('Gradebook');
  const sectionId = await page.evaluate(async () => {
    const { gradebook } = await import('/src/lib/gradebook.svelte.ts');
    return gradebook.createSection({ name: 'Undo section' }).id;
  });
  await page.waitForFunction(selector => !document.querySelector(selector).disabled, {}, `${controls('Gradebook')} [aria-label="Undo"]`);
  await clickHistory('Gradebook', 'Undo');
  assert.equal(await page.evaluate(async id => (await import('/src/lib/gradebook.svelte.ts')).gradebook.sections.some(section => section.id === id), sectionId), false);
  await clickHistory('Gradebook', 'Redo');
  assert.equal(await page.evaluate(async id => (await import('/src/lib/gradebook.svelte.ts')).gradebook.sections.some(section => section.id === id), sectionId), true);
  assert.equal(await page.evaluate(async () => (await import('/src/lib/test-editor.svelte.ts')).testEditor.config.subtitle), 'Build history change', 'Gradebook history never changes Build');

  // Bank intentionally has no document history controls.
  await page.evaluate(() => { location.hash = '#/bank'; });
  await page.waitForFunction(() => location.hash === '#/bank');
  assert.equal(await page.$('.history-controls'), null);
  assert.deepEqual(errors, []);
  console.log('Undo/redo browser checks passed: visible controls, native text undo, Editor/Build/Gradebook history, keyboard redo, and strict mode isolation.');
} catch (error) {
  console.error(error);
  if (browser) {
    const pages = await browser.pages(), page = pages.at(-1);
    if (page) { await page.screenshot({ path: '/tmp/testgen-undo-redo-failure.png' }); console.error((await page.$eval('body', body => body.innerText)).slice(-4000)); }
  }
  process.exitCode = 1;
} finally {
  await browser?.close();
  await server.close();
}
