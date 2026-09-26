import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';
const shots = process.env.IMAGE_EDITOR_SHOTS;
const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
let browser;
try {
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.evaluateOnNewDocument(() => { localStorage.setItem('tg-tutorial-done-v1', '1'); window.__confirms = []; window.confirm = message => { window.__confirms.push(message); return true; }; });
  await page.goto(`${server.resolvedUrls.local[0]}#/editor`, { waitUntil: 'networkidle0' });
  async function click(scope, text) {
    assert.ok(await page.evaluate((scope, text) => {
      const button = [...document.querySelectorAll(scope)].find(el => el.textContent.trim() === text || el.getAttribute('aria-label') === text);
      if (!button) return false; button.click(); return true;
    }, scope, text), `Missing button ${text}`);
  }
  const store = fn => page.evaluate(async (source, ...args) => {
    const { imageStore } = await import('/src/lib/image-store.svelte.ts');
    return (0, eval)(source)(imageStore, ...args);
  }, fn.toString());
  // Synthetic fixtures: a 20×10 red PNG, a WebP, a saved-test snapshot, a Math Graph SVG and a plain SVG.
  await page.evaluate(async () => {
    const { imageStore } = await import('/src/lib/image-store.svelte.ts');
    const { bank } = await import('/src/lib/bank.svelte.ts');
    async function encode(color, type, w = 20, h = 10) {
      const canvas = new OffscreenCanvas(w, h), ctx = canvas.getContext('2d');
      ctx.fillStyle = color; ctx.fillRect(0, 0, w, h);
      return new Uint8Array(await (await canvas.convertToBlob({ type })).arrayBuffer());
    }
    const svg = text => new TextEncoder().encode(text);
    await imageStore.put('photo', await encode('#ff0000', 'image/png'), 'png');
    await imageStore.put('wp', await encode('#00ff00', 'image/webp', 12, 12), 'webp');
    await imageStore.put('testasset-fnv1a32-0123abcd-scan', await encode('#0000ff', 'image/png', 16, 16), 'png');
    await imageStore.put('graph-demo', svg('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><metadata id="math-graph-model">{}</metadata><rect width="200" height="100" fill="#eee"/></svg>'), 'svg');
    await imageStore.put('drawing', svg('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><rect width="100" height="50" fill="#ff0"/></svg>'), 'svg');
    bank.add({ body: 'Photo #image("/imgs/photo", width: 50%) and #image("/imgs/wp.webp")', answer: '', points: 1, tags: [], images: ['photo', 'wp'] });
  });
  const beforeRevision = await store(s => s.revisions.photo);
  await click('.editor-workspace .actions button', '+ New Question');
  await click('.editor-workspace .actions button', 'Image library');
  await page.waitForSelector('.library');
  await page.evaluate(() => [...document.querySelectorAll('.library .tile')].find(el => el.textContent.trim() === 'photo.png').focus());
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('.viewer [role=toolbar]') && document.querySelector('.viewer .meta')?.textContent.includes('20 × 10 px'));
  assert.equal(await page.$eval('.viewer', el => el.getAttribute('aria-modal')), 'true');
  assert.equal(await page.$eval('.library .inspector > strong', el => el.textContent), 'photo.png', 'Selection still updates the inspector');
  // Drag in image pixel coordinates; mapping uses the on-screen canvas box so zoom and DPR do not matter.
  async function drag(from, to) {
    const box = await page.$eval('.viewer canvas', el => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, sx: r.width / el.width, sy: r.height / el.height }; });
    const at = ([x, y]) => [box.left + x * box.sx, box.top + y * box.sy];
    await page.mouse.move(...at(from)); await page.mouse.down();
    await page.mouse.move(...at([(from[0] + to[0]) / 2, (from[1] + to[1]) / 2]), { steps: 3 });
    await page.mouse.move(...at(to), { steps: 3 }); await page.mouse.up();
  }
  const pixel = (x, y) => page.$eval('.viewer canvas', (el, x, y) => [...el.getContext('2d').getImageData(x, y, 1, 1).data], x, y);
  const size = () => page.$eval('.viewer canvas', el => [el.width, el.height]);
  await click('.viewer .toolbar button', 'Rectangle');
  await click('.viewer .swatch', 'White');
  await drag([2.2, 2.2], [5.8, 5.8]);
  assert.deepEqual(await pixel(3, 3), [255, 255, 255, 255]); assert.deepEqual(await pixel(7, 7), [255, 0, 0, 255]);
  await click('.viewer .toolbar button', 'Fill');
  await click('.viewer .swatch', 'Blue');
  await drag([15.5, 5.5], [15.5, 5.5]);
  assert.deepEqual(await pixel(15, 5), [37, 99, 235, 255]); assert.deepEqual(await pixel(3, 3), [255, 255, 255, 255]);
  await page.keyboard.down('Control'); await page.keyboard.press('z'); await page.keyboard.up('Control');
  assert.deepEqual(await pixel(15, 5), [255, 0, 0, 255], 'Ctrl+Z undoes the fill');
  await page.keyboard.down('Control'); await page.keyboard.down('Shift'); await page.keyboard.press('Z'); await page.keyboard.up('Shift'); await page.keyboard.up('Control');
  assert.deepEqual(await pixel(15, 5), [37, 99, 235, 255], 'Ctrl+Shift+Z redoes the fill');
  await click('.viewer .toolbar button', 'Crop');
  await drag([1.2, 1.2], [18.8, 8.8]);
  await page.waitForSelector('.viewer .subbar');
  assert.match(await page.$eval('.viewer .subbar span', el => el.textContent), /18 × 8 px/);
  await click('.viewer .subbar button', 'Crop');
  assert.deepEqual(await size(), [18, 8]);
  await click('.viewer .toolbar button', 'Extend…');
  await page.$eval('[aria-label="Extend right"]', el => { el.value = '2'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await click('.viewer .subbar button', 'Apply');
  assert.deepEqual(await size(), [20, 8]);
  await click('.viewer .toolbar button', 'Rotate right');
  assert.deepEqual(await size(), [8, 20]);
  await click('.viewer .toolbar button', 'Undo');
  assert.deepEqual(await size(), [20, 8]);
  await click('.viewer .toolbar button', 'Redo');
  assert.deepEqual(await size(), [8, 20]);
  if (shots) { await click('.viewer .toolbar button', 'Brush'); await page.screenshot({ path: `${shots}/image-editor-wide.png` }); }
  await click('.viewer header button', 'Save');
  await page.waitForFunction(before => document.querySelector('.viewer .note')?.textContent.startsWith('Saved') && before, {}, beforeRevision);
  const saved = await page.evaluate(async () => {
    const { imageStore } = await import('/src/lib/image-store.svelte.ts');
    const image = await imageStore.get('photo');
    const bitmap = await createImageBitmap(new Blob([image.bytes], { type: image.mime }));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), ctx = canvas.getContext('2d'); ctx.drawImage(bitmap, 0, 0);
    const px = (x, y) => [...ctx.getImageData(x, y, 1, 1).data];
    return { ext: image.ext, w: bitmap.width, h: bitmap.height, rect: px(6, 1), fill: px(3, 10), margin: px(7, 19), revision: imageStore.revisions.photo };
  });
  assert.equal(saved.ext, 'png'); assert.deepEqual([saved.w, saved.h], [8, 20]);
  assert.deepEqual(saved.rect, [255, 255, 255, 255]); assert.deepEqual(saved.fill, [37, 99, 235, 255]); assert.deepEqual(saved.margin, [255, 255, 255, 255]);
  assert.notEqual(saved.revision, beforeRevision, 'Store revision changes so previews refresh');
  // Save as copy keeps references and the original bytes untouched.
  await click('.viewer .toolbar button', 'Flip horizontal');
  await click('.viewer header button', 'Save as copy');
  await page.waitForFunction(() => document.querySelector('.viewer .note')?.textContent.includes('Saved a copy'));
  const copy = await page.evaluate(async () => {
    const { imageStore } = await import('/src/lib/image-store.svelte.ts'); const { bank } = await import('/src/lib/bank.svelte.ts');
    return { has: imageStore.has('photo-edited'), ext: imageStore.metadata['photo-edited']?.ext, revision: imageStore.revisions.photo, body: bank.questions.find(q => q.body.startsWith('Photo')).body, title: document.querySelector('#image-viewer-title').textContent };
  });
  assert.equal(copy.has, true); assert.equal(copy.ext, 'png'); assert.equal(copy.revision, saved.revision); assert.equal(copy.title, 'photo-edited.png');
  assert.match(copy.body, /\/imgs\/photo"/); assert.doesNotMatch(copy.body, /photo-edited/);
  // Unsaved changes warn before closing; Escape closes only the viewer and returns focus.
  await click('.viewer .toolbar button', 'Rotate left');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('.viewer'));
  assert.ok(await page.$('.library'), 'Library stays open');
  assert.match((await page.evaluate(() => window.__confirms)).at(-1), /unsaved/);
  assert.equal(await page.evaluate(() => document.activeElement?.textContent.trim()), 'photo.png', 'Focus returns to the tile');
  // Math Graph SVGs are view-only.
  await click('.library .tile', 'graph-demo.svg');
  await page.waitForSelector('.viewer .board img');
  assert.equal(await page.$('.viewer [role=toolbar]'), null);
  assert.match(await page.$eval('.viewer .note', el => el.textContent), /Math Graph/);
  assert.ok(!(await page.evaluate(() => [...document.querySelectorAll('.viewer header button')].some(b => /Save|Edit as PNG/.test(b.textContent)))));
  await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.querySelector('.viewer'));
  // Plain SVGs are rasterised into a PNG copy, never overwritten.
  await click('.library .tile', 'drawing.svg');
  await page.waitForSelector('.viewer .board img');
  await click('.viewer header button', 'Edit as PNG copy');
  await page.waitForSelector('.viewer [role=toolbar]');
  assert.ok(await page.$eval('.viewer header button.primary', el => el.disabled), 'SVG copy cannot overwrite');
  await click('.viewer header button', 'Save as copy');
  await page.waitForFunction(() => document.querySelector('.viewer .note')?.textContent.includes('Saved a copy'));
  assert.deepEqual(await store(s => [s.metadata['drawing-edited']?.ext, s.metadata.drawing.ext]), ['png', 'svg']);
  await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.querySelector('.viewer'));
  // Saved-test snapshots are immutable.
  const snapshotRevision = await store(s => s.revisions['testasset-fnv1a32-0123abcd-scan']);
  await click('.library .tile', 'testasset-fnv1a32-0123abcd-scan.png');
  await page.waitForSelector('.viewer [role=toolbar]');
  assert.match(await page.$eval('.viewer .note', el => el.textContent), /snapshot/);
  await click('.viewer .toolbar button', 'Flip horizontal');
  assert.ok(await page.$eval('.viewer header button.primary', el => el.disabled), 'Snapshot Save disabled');
  await click('.viewer header button', 'Save as copy');
  await page.waitForFunction(() => document.querySelector('.viewer .note')?.textContent.includes('Saved a copy'));
  assert.deepEqual(await store(s => [s.revisions['testasset-fnv1a32-0123abcd-scan'], s.has('scan-edited')]), [snapshotRevision, true]);
  await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.querySelector('.viewer'));
  // WebP is saved as PNG through the replacement path, which updates extension-bearing references.
  await click('.library .tile', 'wp.webp');
  await page.waitForSelector('.viewer [role=toolbar]');
  await click('.viewer .toolbar button', 'Rotate left');
  await click('.viewer header button', 'Save');
  await page.waitForFunction(() => document.querySelector('.viewer .note')?.textContent.startsWith('Saved'));
  const webp = await page.evaluate(async () => {
    const { imageStore } = await import('/src/lib/image-store.svelte.ts'); const { bank } = await import('/src/lib/bank.svelte.ts');
    return { ext: imageStore.metadata.wp.ext, body: bank.questions.find(q => q.body.startsWith('Photo')).body };
  });
  assert.equal(webp.ext, 'png'); assert.match(webp.body, /\/imgs\/wp\.png/); assert.doesNotMatch(webp.body, /wp\.webp/);
  assert.match((await page.evaluate(() => window.__confirms)).at(-1), /PNG/);
  await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.querySelector('.viewer'));
  // Narrow screens: no horizontal page scroll and the toolbar wraps.
  await page.setViewport({ width: 390, height: 844 });
  await click('.library .tile', 'photo.png');
  await page.waitForSelector('.viewer [role=toolbar]');
  await click('.viewer .toolbar button', 'Rectangle');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.ok(await page.$eval('.viewer', el => el.scrollWidth <= el.clientWidth + 1));
  if (shots) await page.screenshot({ path: `${shots}/image-editor-narrow.png` });
  assert.deepEqual(errors, []);
  console.log('Image editor browser checks passed: viewer dialog, rectangle/fill/crop/extend/rotate/flip, undo/redo, save and copy, SVG/graph/snapshot policies, WebP→PNG references, narrow layout.');
} catch (error) {
  console.error(error);
  if (browser) { const pages = await browser.pages(); const page = pages.at(-1); if (page) { await page.screenshot({ path: '/tmp/testgen-image-editor-failure.png' }); console.error((await page.$eval('body', el => el.innerText)).slice(-3000)); } }
  process.exitCode = 1;
} finally { await browser?.close(); await server.close(); }
