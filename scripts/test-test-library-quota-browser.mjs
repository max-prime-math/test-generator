import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';

// Frozen test questions must not share localStorage's small quota with the active bank.
// This leaves too little room for the old inline library representation, saves a large test,
// and reloads to prove IndexedDB recovery has the complete frozen content.
const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
let browser;
try {
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.evaluateOnNewDocument(() => {
    window.contentOps = [];
    window.imageReads = [];
    for (const [prototype, methods] of [
      [IDBObjectStore.prototype, ['get', 'getAll', 'put', 'delete']],
      [IDBIndex.prototype, ['getAll', 'getAllKeys']],
    ]) for (const method of methods) {
      const original = prototype[method];
      prototype[method] = function (...args) {
        const store = this.objectStore ?? this;
        if (store.transaction.db.name === 'test-generator-test-content') window.contentOps.push(method);
        if (store.transaction.db.name === 'test-generator' && store.name === 'images' && method.startsWith('get')) {
          window.imageReads.push(method === 'get' ? args[0] : method);
        }
        return original.apply(this, args);
      };
    }
    if (localStorage.getItem('quota-seeded')) return;
    localStorage.setItem('quota-seeded', '1');
    localStorage.setItem('tg-tutorial-done-v1', '1');
    localStorage.setItem('quota-filler', 'f'.repeat(3_500_000));
  });
  await page.goto(`${server.resolvedUrls.local[0]}#/build`, { waitUntil: 'networkidle0' });

  const saved = await page.evaluate(async () => {
    const [{ testLibrary }, { defaultTestConfig }] = await Promise.all([
      import('/src/lib/test-library.svelte.ts'), import('/src/lib/types.ts'),
    ]);
    await testLibrary.ready();
    const marker = `frozen-${crypto.randomUUID()}`;
    const question = { id: 'large-q', body: `${marker}:${'q'.repeat(2_200_000)}`, points: 2, tags: [], createdAt: 1 };
    const config = { ...defaultTestConfig('Quota Test'), selectedIds: [question.id] };
    const entry = await testLibrary.saveAsWithContent('Quota Test', null, null, 'test', config, { questionSnapshots: [question], narrativeSnapshots: [] });
    await testLibrary.addImportedCopies(Array.from({ length: 40 }, (_, index) => ({
      id: `other-${index}`, name: `Other test ${index}`, classId: null, unitId: null, testType: 'test',
      config: defaultTestConfig(), createdAt: 1, updatedAt: 1, questionSnapshots: [], narrativeSnapshots: [],
    })));
    await testLibrary.whenStored();
    const raw = localStorage.getItem('tg-test-library-v1') ?? '';
    return {
      id: entry.id,
      marker,
      localLength: raw.length,
      inline: raw.includes(marker),
      memory: (await testLibrary.read(entry.id))?.questionSnapshots?.[0]?.body.startsWith(marker),
    };
  });
  assert.equal(saved.inline, false, 'frozen content is not written into localStorage');
  assert.ok(saved.localLength < 100_000, `library index stays compact (${saved.localLength} chars)`);
  assert.equal(saved.memory, true, 'the saved test is immediately complete in memory');

  await page.reload({ waitUntil: 'networkidle0' });
  const recovered = await page.evaluate(async (id, marker) => {
    const { testLibrary } = await import('/src/lib/test-library.svelte.ts');
    await testLibrary.ready();
    const startup = [...window.contentOps];
    testLibrary.rename(id, 'Renamed');
    const rename = window.contentOps.splice(0);
    const test = await testLibrary.read(id);
    const open = window.contentOps.splice(0);
    const revision = testLibrary.revision;
    await testLibrary.setContentSnapshot(id, test.questionSnapshots, test.narrativeSnapshots ?? [], test.config);
    const unchangedRevision = testLibrary.revision === revision;
    window.contentOps.length = 0;
    const expected = JSON.stringify(test.config);
    const changed = { questionSnapshots: [{ ...test.questionSnapshots[0], body: 'Changed only this snapshot' }], narrativeSnapshots: [] };
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'tg-test-library-v1') throw new DOMException('Index full', 'QuotaExceededError');
      return setItem.call(this, key, value);
    };
    let failed = false;
    try { await testLibrary.updateWithContent(id, { ...test.config, subtitle: 'Failed commit' }, changed, expected); }
    catch { failed = true; }
    finally { Storage.prototype.setItem = setItem; }
    const retained = (await testLibrary.read(id)).questionSnapshots[0].body.startsWith(marker);
    window.contentOps.length = 0;
    await testLibrary.updateWithContent(id, { ...test.config, subtitle: 'Saved edit' }, changed, expected);
    const edit = [...window.contentOps];
    const { imageStore } = await import('/src/lib/image-store.svelte.ts');
    const { readTestAssets } = await import('/src/lib/test-assets.ts');
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');
    await imageStore.put('selected-diagram', svg, 'svg');
    await imageStore.put('unrelated-diagram', svg, 'svg');
    window.imageReads.length = 0;
    await readTestAssets([{ ...changed.questionSnapshots[0], body: '#image("/imgs/selected-diagram.svg")' }], [], test.config);
    return {
      content: test.questionSnapshots?.[0]?.body.startsWith(marker),
      unchangedRevision, startup, rename, open, edit, failed, retained, imageReads: window.imageReads,
      updated: (await testLibrary.read(id)).questionSnapshots[0].body,
      unaffected: (await testLibrary.read('other-39')).questionSnapshots,
    };
  }, saved.id, saved.marker);
  assert.equal(recovered.content, true, 'reload restores the frozen content from IndexedDB');
  assert.equal(recovered.unchangedRevision, true, 'an identical sync snapshot does not trigger another save');
  assert.deepEqual(recovered.startup, [], 'a compact library opens without reading or writing snapshots');
  assert.deepEqual(recovered.rename, [], 'renaming a test touches only the index');
  assert.deepEqual(recovered.open, ['get'], 'reading one test fetches one record');
  assert.deepEqual(recovered.edit, ['get', 'put', 'delete'], 'an edit writes one snapshot revision and retires its previous revision');
  assert.ok(recovered.failed && recovered.retained, 'a failed index commit keeps the previous durable snapshot');
  assert.equal(recovered.updated, 'Changed only this snapshot');
  assert.deepEqual(recovered.unaffected, []);
  assert.deepEqual(recovered.imageReads, ['selected-diagram'], 'test asset reads skip unrelated image payloads');
  assert.deepEqual(errors, []);
  console.log('Test library quota passed: a large frozen test saves beyond localStorage capacity, reloads intact, and identical sync content is a no-op.');
} finally {
  await browser?.close();
  await server.close();
}
