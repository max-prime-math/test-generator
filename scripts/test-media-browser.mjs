import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';
const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
let browser;
try {
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 1000 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.evaluateOnNewDocument(() => { localStorage.setItem('tg-tutorial-done-v1', '1'); window.confirm = () => true; });
  await page.goto(`${server.resolvedUrls.local[0]}#/editor`, { waitUntil: 'networkidle0' });
  async function click(scope, text, target = page) {
    assert.ok(await target.evaluate((scope, text) => {
      const button = [...document.querySelectorAll(scope)].find(el => el.textContent.trim() === text);
      if (!button) return false; button.click(); return true;
    }, scope, text), `Missing button ${text}`);
  }
  const input = async (selector, value, target = page) => target.$eval(selector, (el, value) => { el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); }, value);
  await click('.editor-workspace .actions button', '+ New Question');
  await page.waitForSelector('textarea[aria-label="Question"]');
  await page.type('textarea[aria-label="Question"]', 'Use the graph to answer the question.');
  await click('.question-form .markup:first-of-type button', '▦ Add graph').catch(() => click('.question-form .markup button', '▦ Add graph'));
  await page.waitForSelector('iframe[title="Interactive Math Graph editor"]');
  let frame = await (await page.$('iframe[title="Interactive Math Graph editor"]')).contentFrame();
  await frame.waitForSelector('#add-function');
  await frame.click('#add-function');
  await input('input[aria-label="y ="]', 'sin(', frame);
  await frame.waitForSelector('#status.error');
  await page.waitForFunction(() => Object.keys(localStorage).some(key => key.startsWith('tg-math-graph-draft:') && localStorage[key].includes('sin(')));
  await click('.graph-dialog header button', 'Close');
  await click('.question-form .markup button', '▦ Add graph');
  frame = await (await page.$('iframe[title="Interactive Math Graph editor"]')).contentFrame();
  await frame.waitForSelector('input[aria-label="y ="]');
  assert.equal(await frame.$eval('input[aria-label="y ="]', el => el.value), 'sin(');
  await input('input[aria-label="y ="]', 'x^2', frame);
  await frame.click('#save');
  await page.waitForFunction(() => !document.querySelector('.graph-overlay'));
  await page.waitForSelector('.picture-section');
  assert.equal(await page.$eval('.picture-section', el => el.open), false, 'Pictures start collapsed');
  await page.click('.picture-section > summary');
  await page.waitForFunction(() => [...document.querySelectorAll('.picture-card button')].some(el => el.textContent.trim() === 'Edit graph'));
  await page.waitForSelector('.preview .svg svg', { timeout: 30000 });
  assert.equal(await page.$('.preview pre[role=alert]'), null);
  const graphName = await page.evaluate(() => document.querySelector('textarea[aria-label="Question"]').value.match(/\/imgs\/(graph-[^"\n]+)/)[1]);
  await click('.editor-workspace .actions button', 'Save');
  const first = await page.evaluate(() => JSON.parse(localStorage.getItem('math-test-bank-v2'))[0]);
  await page.reload({ waitUntil: 'networkidle0' });
  await page.click('.picture-section > summary');
  await click('.picture-card button', 'Edit graph');
  frame = await (await page.$('iframe[title="Interactive Math Graph editor"]')).contentFrame();
  await frame.waitForSelector('input[aria-label="y ="]');
  assert.equal(await frame.$eval('input[aria-label="y ="]', el => el.value), 'x^2');
  await input('input[aria-label="y ="]', 'sin(x)', frame);
  await frame.click('#save');
  await page.waitForFunction(() => !document.querySelector('.graph-overlay'));
  const editedName = await page.evaluate(() => document.querySelector('textarea[aria-label="Question"]').value.match(/\/imgs\/(graph-[^"\n]+)/)[1]);
  assert.notEqual(editedName, graphName);
  await click('.editor-workspace .actions button', 'Save');
  const edited = await page.evaluate(() => JSON.parse(localStorage.getItem('math-test-bank-v2'))[0]);
  assert.equal(edited.id, first.id); assert.deepEqual(edited.images, [editedName]);
  // Seed realistic references in solutions, choices, narratives, multipart content and a saved test.
  await page.evaluate(async name => {
    const { bank } = await import('/src/lib/bank.svelte.ts');
    const { narratives } = await import('/src/lib/narratives.svelte.ts');
    const { testLibrary } = await import('/src/lib/test-library.svelte.ts');
    const { defaultTestConfig } = await import('/src/lib/types.ts');
    const q = bank.add({ body: 'Image fixture', solution: `#image("/imgs/${name}.svg")`, choices: { A: `#image("/imgs/${name}")`, B: 'No' }, answer: 'A', points: 1, tags: [], images: [name], parts: { stem: 'Part stem', items: [{ body: `#image("/imgs/${name}")` }, { body: 'Explain' }] } });
    const n = narratives.add({ title: 'Image narrative', body: `#image("/imgs/${name}")`, tags: [] });
    const test = testLibrary.saveAs('Image test', null, null, null, defaultTestConfig());
    testLibrary.setContentSnapshot(test.id, [q], [n]);
  }, editedName);
  await click('.editor-workspace .actions button', 'Image library');
  await page.waitForSelector('.library');
  await click('.library .tile', `${editedName}.svg`);
  assert.ok(await page.$eval('.library .danger', el => el.disabled));
  await input('[aria-label="Image name"]', 'renamed-graph');
  await click('.library button', 'Rename and update references');
  await page.waitForFunction(() => document.querySelector('.library .inspector > strong')?.textContent === 'renamed-graph.svg');
  const references = await page.evaluate(async old => {
    const { bank } = await import('/src/lib/bank.svelte.ts'); const { editor } = await import('/src/lib/editor/editor-state.svelte.ts');
    const { narratives } = await import('/src/lib/narratives.svelte.ts'); const { testLibrary } = await import('/src/lib/test-library.svelte.ts');
    const { imageStore } = await import('/src/lib/image-store.svelte.ts');
    return { data: JSON.stringify([bank.questions, editor.session.drafts, narratives.narratives, testLibrary.tests]), oldExists: imageStore.has(old), newExists: imageStore.has('renamed-graph') };
  }, editedName);
  assert.equal(references.oldExists, false); assert.equal(references.newExists, true);
  assert.ok(!references.data.includes(editedName)); assert.match(references.data, /renamed-graph/);
  await click('.library header button', 'Close');
  await click('.editor-workspace .actions button', 'Save'); // rename did not introduce a draft conflict
  assert.equal(await page.$('.editor-workspace > pre.error'), null);
  await page.click('.picture-section > summary');
  await page.click('.picture-card details summary');
  await input('input[aria-label="Picture width"]', '35');
  await page.select('select[aria-label="Picture alignment"]', 'right');
  await click('.picture-card button', 'Apply');
  assert.match(await page.$eval('textarea[aria-label="Question"]', el => el.value), /#align\(right, image\("\/imgs\/renamed-graph", width: 35%\)\)/);
  await page.screenshot({ path: '/tmp/testgen-media-cards.png' });
  // Replacing a shared file changes bytes under the same name and refreshes SVG previews.
  await page.evaluate(async () => {
    const { replaceImage } = await import('/src/lib/editor/image-library.ts');
    await replaceImage('renamed-graph', new File(['<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><circle cx="20" cy="20" r="15" fill="red"/></svg>'], 'replacement.svg', { type: 'image/svg+xml' }));
  });
  await page.waitForFunction(() => ![...document.querySelectorAll('.picture-card button')].some(el => el.textContent.trim() === 'Edit graph'));
  // A local occurrence can be replaced without renaming the shared image.
  await click('.picture-card button', 'Replace picture');
  await page.waitForSelector('[aria-label="Insert picture"]');
  await click('.sheet .item', `${graphName}.svg`);
  await click('.sheet footer button', 'Replace this picture');
  assert.match(await page.$eval('textarea[aria-label="Question"]', el => el.value), new RegExp(graphName));
  await click('.picture-card button', 'Remove from text');
  assert.equal(await page.$('.picture-section'), null);
  await click('.editor-workspace .actions button', 'Save');
  const noPicture = await page.evaluate(() => JSON.parse(localStorage.getItem('math-test-bank-v2'))[0]);
  assert.deepEqual(noPicture.images, []);
  // Delete a truly unused image, keep images referenced by questions/tests protected.
  const deleted = await page.evaluate(async name => {
    const { deleteImage } = await import('/src/lib/editor/image-library.ts');
    const { imageStore } = await import('/src/lib/image-store.svelte.ts');
    await deleteImage(name);
    let protectedMessage = ''; try { await deleteImage('renamed-graph'); } catch (e) { protectedMessage = String(e); }
    return { exists: imageStore.has(name), protectedMessage };
  }, graphName);
  assert.equal(deleted.exists, false); assert.match(deleted.protectedMessage, /still used/);
  await page.setViewport({ width: 390, height: 844 });
  await click('.editor-workspace .actions button', 'Image library');
  await page.screenshot({ path: '/tmp/testgen-media-mobile.png' });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.deepEqual(errors, []);
  console.log('Media browser checks passed: graph creation/render/reopen and invalid-draft recovery, immutable graph edits, collapsed cards, placement, rename references, shared and per-occurrence replacement, removal and protected deletion.');
} catch (error) {
  console.error(error);
  if (browser) { const pages = await browser.pages(); const page = pages.at(-1); if (page) { await page.screenshot({ path: '/tmp/testgen-media-failure.png' }); console.error((await page.$eval('body', el => el.innerText)).slice(-4000)); } }
  process.exitCode = 1;
} finally { await browser?.close(); await server.close(); }
