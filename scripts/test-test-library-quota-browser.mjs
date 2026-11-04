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
    const entry = testLibrary.saveAs('Quota Test', null, null, 'test', config, { questionSnapshots: [question], narrativeSnapshots: [] });
    await testLibrary.whenStored();
    const raw = localStorage.getItem('tg-test-library-v1') ?? '';
    return {
      id: entry.id,
      marker,
      localLength: raw.length,
      inline: raw.includes(marker),
      memory: testLibrary.get(entry.id)?.questionSnapshots?.[0]?.body.startsWith(marker),
    };
  });
  assert.equal(saved.inline, false, 'frozen content is not written into localStorage');
  assert.ok(saved.localLength < 100_000, `library index stays compact (${saved.localLength} chars)`);
  assert.equal(saved.memory, true, 'the saved test is immediately complete in memory');

  await page.reload({ waitUntil: 'networkidle0' });
  const recovered = await page.evaluate(async (id, marker) => {
    const { testLibrary } = await import('/src/lib/test-library.svelte.ts');
    await testLibrary.ready();
    const test = testLibrary.get(id);
    const revision = testLibrary.revision;
    testLibrary.setContentSnapshot(id, test.questionSnapshots, test.narrativeSnapshots ?? [], test.config);
    return {
      content: test.questionSnapshots?.[0]?.body.startsWith(marker),
      unchangedRevision: testLibrary.revision === revision,
    };
  }, saved.id, saved.marker);
  assert.equal(recovered.content, true, 'reload restores the frozen content from IndexedDB');
  assert.equal(recovered.unchangedRevision, true, 'an identical sync snapshot does not trigger another save');
  assert.deepEqual(errors, []);
  console.log('Test library quota passed: a large frozen test saves beyond localStorage capacity, reloads intact, and identical sync content is a no-op.');
} finally {
  await browser?.close();
  await server.close();
}
