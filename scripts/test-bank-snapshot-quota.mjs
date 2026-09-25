import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';

// Inactive bank snapshots must live in IndexedDB, not localStorage: several
// large banks together exceed localStorage's ~5 MB quota. Isolated browser profile only.
const server = await createServer({ server: { host: '127.0.0.1', port: 0, strictPort: false }, logLevel: 'error' });
await server.listen();
const url = server.resolvedUrls.local[0];
let browser;
try {
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.evaluateOnNewDocument(() => localStorage.setItem('tg-tutorial-done-v1', '1'));
  await page.goto(url, { waitUntil: 'networkidle0' });

  // 1. A legacy bank snapshot stored the old way moves to IndexedDB on startup.
  await page.evaluate(() => {
    const registry = JSON.parse(localStorage.getItem('tg-bank-workspaces-v1'));
    registry.push({ id: 'legacy-bank', name: 'Legacy', gitRepoId: 'test-generator-bank-legacy-bank', createdAt: 1, updatedAt: 1 });
    localStorage.setItem('tg-bank-workspaces-v1', JSON.stringify(registry));
    localStorage.setItem('tg-bank:legacy-bank:math-test-bank-v2', JSON.stringify([{ id: 'legacy-q', body: 'Legacy question', createdAt: 1 }]));
    localStorage.setItem('tg-bank:legacy-bank:tg-last-sync-github', 'marker');
  });
  await page.reload({ waitUntil: 'networkidle0' });
  const migrated = await page.evaluate(async () => {
    const { bankWorkspaces } = await import('/src/lib/bank-workspaces.svelte.ts');
    const snapshot = await bankWorkspaces.readBankSnapshot('legacy-bank');
    const leftover = Object.keys(localStorage).filter(key => key.startsWith('tg-bank:'));
    return { questions: snapshot?.questions.map(q => q.id), leftover };
  });
  assert.deepEqual(migrated.questions, ['legacy-q'], 'legacy snapshot readable after migration');
  assert.deepEqual(migrated.leftover, [], 'legacy localStorage copies removed after migration');

  // 2. Registering ~9 MB of banks succeeds (it overflowed localStorage before).
  const registered = await page.evaluate(async () => {
    const { bankWorkspaces } = await import('/src/lib/bank-workspaces.svelte.ts');
    const filler = 'x'.repeat(3000);
    const bank = (id) => ({
      id, name: `Big ${id}`,
      data: { questions: Array.from({ length: 250 }, (_, i) => ({ id: `${id}-q${i}`, body: `${id} ${i} ${filler}`, createdAt: 1 })),
        narratives: [], customClasses: [], savedTests: [], images: [] },
    });
    await bankWorkspaces.registerNewFolderBanks(Array.from({ length: 12 }, (_, i) => bank(`big-${i}`)));
    const sizes = await Promise.all(Array.from({ length: 12 }, async (_, i) => (await bankWorkspaces.readBankSnapshot(`big-${i}`))?.questions.length));
    const localBytes = Object.keys(localStorage).reduce((sum, key) => sum + key.length + (localStorage.getItem(key)?.length ?? 0), 0);
    return { sizes, localBytes };
  });
  assert.deepEqual(registered.sizes, Array(12).fill(250), 'every large bank stored');
  assert.ok(registered.localBytes < 1_000_000, `localStorage stays small (${registered.localBytes} chars)`);

  // 3. Switching into a large bank and back restores each bank's own data.
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0' }),
    page.evaluate(async () => { const { bankWorkspaces } = await import('/src/lib/bank-workspaces.svelte.ts'); await bankWorkspaces.switchBank('big-3'); }),
  ]);
  const active = await page.evaluate(() => JSON.parse(localStorage.getItem('math-test-bank-v2')).map(q => q.id));
  assert.equal(active.length, 250);
  assert.equal(active[0], 'big-3-q0');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0' }),
    page.evaluate(async () => { const { bankWorkspaces } = await import('/src/lib/bank-workspaces.svelte.ts'); await bankWorkspaces.switchBank('legacy-bank'); }),
  ]);
  const legacy = await page.evaluate(() => ({
    questions: JSON.parse(localStorage.getItem('math-test-bank-v2')).map(q => q.id),
    marker: localStorage.getItem('tg-last-sync-github'),
  }));
  assert.deepEqual(legacy, { questions: ['legacy-q'], marker: 'marker' }, 'legacy bank and its sync marker restored');
  const big3 = await page.evaluate(async () => {
    const { bankWorkspaces } = await import('/src/lib/bank-workspaces.svelte.ts');
    return (await bankWorkspaces.readBankSnapshot('big-3'))?.questions.length;
  });
  assert.equal(big3, 250, 'the bank switched away from was saved');
  assert.deepEqual(errors, []);
  console.log('Bank snapshot quota tests passed: legacy migration, 12 large banks beyond the localStorage quota, switching and restore.');
} finally {
  await browser?.close();
  await server.close();
}
