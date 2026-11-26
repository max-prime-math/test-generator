import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';

// Synthetic data in an isolated browser. Missing transferred images need useful recovery
// guidance; restoring them must refresh previews, including those from an inactive bank.
const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
let browser;
try {
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('tg-tutorial-done-v1', '1');
    if (!localStorage.getItem('math-test-bank-v2')) localStorage.setItem('math-test-bank-v2', JSON.stringify([
      { id: 'img-q', body: 'Look:\n#image("/imgs/dot", width: 2cm)', tags: [], points: 1, createdAt: 1 },
    ]));
  });
  await page.goto(`${server.resolvedUrls.local[0]}#/bank`, { waitUntil: 'networkidle0' });
  const denied = () => page.evaluate(() => /access denied|outside of project root|--root/i.test(document.body.innerText));
  await page.waitForSelector('.card[data-qid="img-q"]');
  await page.click('.card[data-qid="img-q"]');
  await page.waitForSelector('.preview-panel .preview-empty.error');
  const missing = await page.$eval('.preview-panel .preview-empty.error', element => element.textContent);
  assert.match(missing, /missing image/i, 'missing files have recovery guidance instead of the unrelated root hint');
  assert.match(missing, /dot/);
  assert.match(missing, /Image library/);
  assert.equal(await denied(), false);

  const exportError = await page.evaluate(async () => {
    const { compile } = await import('/src/lib/typst/compiler.ts');
    return (await compile('#image("/imgs/dot")')).error;
  });
  assert.match(exportError, /missing image/i, 'PDF export explains the same missing file');
  assert.match(exportError, /dot/);

  await page.evaluate(async () => {
    const { imageStore } = await import('/src/lib/image-store.svelte.ts');
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><circle cx="5" cy="5" r="4"/></svg>';
    await imageStore.put('dot', new TextEncoder().encode(svg), 'svg');
  });
  await page.waitForFunction(() => document.querySelector('.preview-panel svg image'), { timeout: 30000 });
  assert.equal(await page.$('.preview-panel .preview-empty.error'), null, 'restoring the picture refreshes the preview without reimporting questions');
  const exportRecovered = await page.evaluate(async () => {
    const { compile } = await import('/src/lib/typst/compiler.ts');
    const result = await compile('#image("/imgs/dot")');
    if (result.pdfUrl) URL.revokeObjectURL(result.pdfUrl);
    return { error: result.error ?? null, pdf: Boolean(result.pdfUrl) };
  });
  assert.deepEqual(exportRecovered, { error: null, pdf: true });

  const diagnostics = await page.evaluate(async () => {
    const { compileSvg } = await import('/src/lib/typst/compiler.ts');
    const unused = await compileSvg('Question without a diagram.\n#if false { image("/imgs/unused") }');
    const mixed = await compileSvg('#image("/imgs/dot")\n#image("/imgs/absent-one.svg")\n#image("/imgs/absent-two")');
    const syntax = await compileSvg('#let =\n#image("/imgs/unused")');
    return { unused: { rendered: Boolean(unused.svg), error: unused.error ?? null }, mixed: mixed.error, syntax: syntax.error };
  });
  assert.deepEqual(diagnostics.unused, { rendered: true, error: null }, 'unused conditional images do not block valid questions');
  assert.match(diagnostics.mixed, /missing images/i);
  assert.match(diagnostics.mixed, /absent-one/);
  assert.match(diagnostics.mixed, /absent-two/);
  assert.doesNotMatch(diagnostics.mixed, /“dot”|access denied|outside of project root|--root/i);
  assert.ok(diagnostics.syntax);
  assert.doesNotMatch(diagnostics.syntax, /missing image/i, 'unrelated syntax errors keep their real diagnostic');

  const importedImage = await page.evaluate(async () => {
    const { imageStore } = await import('/src/lib/image-store.svelte.ts');
    const { compileSvg, compile } = await import('/src/lib/typst/compiler.ts');
    const name = 'f08bae873f8036580cef';
    const picture = await imageStore.get('dot');
    await imageStore.put(name, picture.bytes, picture.ext);
    const results = [];
    for (const path of [name, `images/${name}`, `/imgs/${name}`, `/imgs/${name}.svg`]) {
      const source = `#image(${JSON.stringify(path)}, width: 2cm)`;
      const preview = await compileSvg(source);
      const pdf = await compile(source);
      if (pdf.pdfUrl) URL.revokeObjectURL(pdf.pdfUrl);
      results.push({ path, preview: Boolean(preview.svg), pdf: Boolean(pdf.pdfUrl), error: preview.error ?? pdf.error ?? null });
    }
    return results;
  });
  for (const result of importedImage) {
    assert.equal(result.error, null, `an available imported picture resolves from ${result.path}`);
    assert.ok(result.preview && result.pdf);
  }

  await page.evaluate(async () => {
    const { bankWorkspaces } = await import('/src/lib/bank-workspaces.svelte.ts');
    await bankWorkspaces.createBank('Other Bank');
  });
  await page.reload({ waitUntil: 'networkidle0' });

  await page.waitForSelector('.card[data-qid="img-q"]');
  await page.click('.card[data-qid="img-q"]');
  await page.waitForFunction(() => document.querySelector('.preview-panel svg image'), { timeout: 30000 });
  assert.equal(await denied(), false, 'bank preview finds the image in its own bank');

  await page.evaluate(() => [...document.querySelectorAll('.card[data-qid="img-q"] button')].find(b => b.textContent.trim() === 'Edit').click());
  await page.waitForFunction(() => document.querySelector('.preview .svg svg image') || document.querySelector('.preview pre[role=alert]'), { timeout: 30000 });
  assert.equal(await page.$eval('.preview pre[role=alert]', el => el.textContent).catch(() => null), null, 'editor preview finds the image in the source bank');
  assert.equal(await denied(), false);

  // Reproduce receiving a complete bank folder on a colleague's fresh browser.
  // Use only the isolated origin-private filesystem, never real workspace files.
  const receivingContext = await browser.createBrowserContext();
  const receiving = await receivingContext.newPage();
  receiving.on('pageerror', error => errors.push(error.message));
  await receiving.evaluateOnNewDocument(() => {
    localStorage.setItem('tg-tutorial-done-v1', '1');
    window.confirm = () => true;
    Object.defineProperty(FileSystemDirectoryHandle.prototype, 'queryPermission', { configurable: true, value: async () => 'granted' });
    Object.defineProperty(FileSystemDirectoryHandle.prototype, 'requestPermission', { configurable: true, value: async () => 'granted' });
    window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('received-workspace', { create: true });
  });
  await receiving.goto(`${server.resolvedUrls.local[0]}#/bank`, { waitUntil: 'networkidle0' });
  await receiving.evaluate(async () => {
    const { writeRepoFolder, writeText } = await import('/src/lib/folder-io.ts');
    const { exportAppDataToRepoEntries } = await import('/src/git/repoDataModel.ts');
    const root = await window.showDirectoryPicker();
    const banks = await root.getDirectoryHandle('banks', { create: true });
    const folder = await banks.getDirectoryHandle('colleague-bank', { create: true });
    const name = 'f08bae873f8036580cef';
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><circle cx="5" cy="5" r="4"/></svg>');
    const data = {
      questions: [{ id: 'received-image', body: `Imported diagram: #image("${name}", width: 2cm)`, images: [name], tags: [], points: 1, createdAt: 1 }],
      narratives: [], customClasses: [], savedTests: [], images: [{ name, ext: 'svg', bytes: svg }],
    };
    await writeRepoFolder(folder, exportAppDataToRepoEntries(data), 'absent');
    await writeText(folder, 'bank-name.json', JSON.stringify({ name: 'Colleague Bank' }));
  });
  await Promise.all([
    receiving.waitForNavigation({ waitUntil: 'networkidle0' }),
    receiving.evaluate(async () => {
      const { localWorkspace } = await import('/src/lib/local-workspace.svelte.ts');
      await localWorkspace.chooseFolder();
    }),
  ]);
  await receiving.waitForFunction(async () => {
    const { bankWorkspaces } = await import('/src/lib/bank-workspaces.svelte.ts');
    return bankWorkspaces.banks.some(bank => bank.id === 'colleague-bank');
  });
  await receiving.click('.bank-switcher .picker-trigger');
  await receiving.waitForFunction(() => {
    const option = [...document.querySelectorAll('.bank-menu .bank-option')]
      .find(button => button.querySelector('.bank-option-text > span')?.textContent === 'Colleague Bank');
    if (!option) return false;
    option.click();
    return true;
  });
  await receiving.waitForSelector('.card[data-qid="received-image"]');
  await receiving.click('.card[data-qid="received-image"]');
  await receiving.waitForFunction(() => document.querySelector('.preview-panel svg image'), { timeout: 30000 });
  assert.equal(await receiving.evaluate(() => /access denied|outside of project root|Missing image/i.test(document.querySelector('.preview-panel').textContent)), false);
  await receiving.evaluate(() => [...document.querySelectorAll('.card[data-qid="received-image"] button')].find(button => button.textContent.trim() === 'Edit').click());
  await receiving.waitForFunction(() => document.querySelector('.preview .svg svg image'), { timeout: 30000 });
  await receivingContext.close();

  assert.deepEqual(errors, []);
  console.log('Bank image tests passed: missing-image recovery, bare/relative filenames in preview/PDF, dormant-bank previews, and a copied bank folder on a fresh browser.');
} finally {
  await browser?.close();
  await server.close();
}
