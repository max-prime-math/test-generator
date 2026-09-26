import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';

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
    Object.defineProperty(FileSystemDirectoryHandle.prototype, 'queryPermission', { value: async () => 'granted' });
    Object.defineProperty(FileSystemDirectoryHandle.prototype, 'requestPermission', { value: async () => 'granted' });
    window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('export-fixture', { create: true });
  });
  await page.goto(server.resolvedUrls.local[0], { waitUntil: 'networkidle0' });
  const result = await page.evaluate(async () => {
    const { exportAppDataInWorker } = await import('/src/git/repo-export-client.ts');
    const { exportAppDataToRepoEntries, importRepoEntriesToAppData } = await import('/src/git/repoDataModel.ts');
    const options = { generatedAt: '2026-01-01T00:00:00Z' };
    const data = { questions: Array.from({ length: 10_000 }, (_, i) => ({
      id: `q-${i}`, body: `Solve $x + ${i} = 10000$.`, tags: [], points: 2, createdAt: 1,
    })), customClasses: [], savedTests: [] };
    // Warm the worker before measuring, so the heartbeat checks computation
    // rather than just waiting for a script download.
    await exportAppDataInWorker({ ...data, questions: [] }, options);
    let ticks = 0;
    let maxGap = 0;
    let previous = performance.now();
    const timer = setInterval(() => {
      const now = performance.now(); maxGap = Math.max(maxGap, now - previous); previous = now; ticks++;
    }, 5);
    const start = performance.now();
    const entries = await exportAppDataInWorker(data, options);
    const elapsed = performance.now() - start;
    clearInterval(timer);
    const exact = JSON.stringify(entries) === JSON.stringify(exportAppDataToRepoEntries(data, options));
    const count = importRepoEntriesToAppData(entries).appData.questions.length;
    let rejected = false;
    try { await exportAppDataInWorker({ ...data, questions: [{ ...data.questions[0], id: '../unsafe' }] }, options); }
    catch { rejected = true; }
    const recovered = (await exportAppDataInWorker({ ...data, questions: [] }, options)).length > 0;

    const { localFolderBank } = await import('/src/lib/local-folder-bank.svelte.ts');
    const { bank } = await import('/src/lib/bank.svelte.ts');
    const { imageStore } = await import('/src/lib/image-store.svelte.ts');
    const { readRepoFolder } = await import('/src/lib/folder-io.ts');
    const q = bank.add({ body: 'Initial question', tags: [], points: 1 });
    await localFolderBank.chooseFolder();
    const originalGetAll = IDBObjectStore.prototype.getAll;
    let imageReads = 0;
    IDBObjectStore.prototype.getAll = function (...args) {
      if (this.name === 'images') imageReads++;
      return originalGetAll.apply(this, args);
    };
    await localFolderBank.saveNow();
    await localFolderBank.saveNow();
    const idleImageReads = imageReads;
    bank.update(q.id, { body: 'Saved after idle' });
    await localFolderBank.saveNow();
    const root = await window.showDirectoryPicker();
    const edited = importRepoEntriesToAppData(await readRepoFolder(root)).appData.questions.find(entry => entry.id === q.id).body;
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><circle cx="5" cy="5" r="4"/></svg>');
    await imageStore.put('fixture', svg, 'svg');
    await localFolderBank.saveNow();
    const imageSaved = importRepoEntriesToAppData(await readRepoFolder(root)).appData.images.some(image => image.name === 'fixture');
    await localFolderBank.disconnect();
    IDBObjectStore.prototype.getAll = originalGetAll;
    return { elapsed, ticks, maxGap, exact, count, rejected, recovered, idleImageReads, edited, imageSaved };
  });
  assert.equal(result.exact, true, 'Worker export preserves exact existing format');
  assert.equal(result.count, 10_000);
  assert.ok(result.ticks > 0, 'UI event loop runs during large bank export');
  assert.ok(result.rejected && result.recovered, 'Invalid export rejects without breaking subsequent saves');
  assert.equal(result.idleImageReads, 0, 'Unchanged folder saves must not read every image');
  assert.equal(result.edited, 'Saved after idle');
  assert.equal(result.imageSaved, true, 'Image-only changes still trigger folder saving');
  assert.deepEqual(errors, []);
  console.log(`10,000-question worker export: ${result.elapsed.toFixed(0)} ms; ${result.ticks} UI ticks; longest timer gap ${result.maxGap.toFixed(1)} ms.`);
  console.log('Worker compatibility, failure recovery and idle folder saving passed.');
} finally {
  await browser?.close();
  await server.close();
}
