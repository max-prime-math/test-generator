// Regression checks for in-place bank switching, per-draft storage and its
// migration, image metadata migration and thumbnails, and preview scheduling.
// Synthetic data in an isolated browser profile only.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';

const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
const origin = server.resolvedUrls.local[0];
let browser;
const svg = fill => `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="${fill}"/></svg>`;

try {
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => { errors.push(`dialog: ${dialog.message()}`); void dialog.dismiss(); });
  // Fault injection, enabled per step through sessionStorage flags.
  await page.evaluateOnNewDocument(() => {
    const flag = name => sessionStorage.getItem(name) === '1';
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (flag('fail-draft-writes') && this.transaction.db.name === 'test-generator-drafts') throw new DOMException('Injected draft write failure', 'UnknownError');
      return put.apply(this, args);
    };
    const getAll = IDBObjectStore.prototype.getAll;
    window.__imagePayloadReads = 0;
    IDBObjectStore.prototype.getAll = function (...args) { if (this.name === 'images') window.__imagePayloadReads++; return getAll.apply(this, args); };
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (flag('fail-bank-swap') && key === 'math-test-bank-v2' && value.includes('Incoming')) throw new DOMException('Injected quota failure', 'QuotaExceededError');
      return setItem.call(this, key, value);
    };
  });

  // ── 1. Seed legacy formats (whole-session drafts, image DB v2) off-app ──
  await page.goto(`${origin}favicon.svg`);
  await page.evaluate(async ({ red }) => {
    localStorage.setItem('tg-tutorial-done-v1', '1');
    const now = Date.now();
    localStorage.setItem('tg-bank-workspaces-v1', JSON.stringify([
      { id: 'out', name: 'Outgoing', gitRepoId: 'r-out', createdAt: now, updatedAt: now },
      { id: 'inc', name: 'Incoming', gitRepoId: 'r-inc', createdAt: now, updatedAt: now },
      { id: 'third', name: 'Third', gitRepoId: 'r-third', createdAt: now, updatedAt: now }]));
    localStorage.setItem('tg-active-bank-id-v1', 'out');
    localStorage.setItem('math-test-bank-v2', JSON.stringify([{ id: 'out-q', body: 'Outgoing question', points: 1, tags: [], createdAt: 1 }]));
    const drafts = Array.from({ length: 500 }, (_, i) => ({ id: `legacy-${i}`, mcq: false,
      fields: { body: `Legacy draft ${i}`, answer: '', solution: '', questionType: 'frq', classId: '', unitId: '', sectionId: '', points: 2, tagInput: '' } }));
    localStorage.setItem('tg-editor-v1:out', JSON.stringify({ version: 1, drafts, defaults: { classId: '', unitId: '', sectionId: '', points: 4, tagInput: '' }, activeId: 'legacy-7' }));
    const open = (name, version, upgrade) => new Promise((resolve, reject) => { const r = indexedDB.open(name, version); r.onupgradeneeded = () => upgrade(r.result); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const done = tx => new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
    const snapshots = await open('test-generator-bank-snapshots', 1, db => db.createObjectStore('snapshots', { keyPath: 'key' }).createIndex('bankId', 'bankId'));
    let tx = snapshots.transaction('snapshots', 'readwrite');
    for (const [bank, body] of [['inc', 'Incoming question'], ['third', 'Third question']]) {
      tx.objectStore('snapshots').put({ key: `tg-bank:${bank}:math-test-bank-v2`, bankId: bank, name: 'math-test-bank-v2', value: JSON.stringify([{ id: `${bank}-q`, body, points: 1, tags: [], createdAt: 1 }]) });
    }
    await done(tx); snapshots.close();
    const images = await open('test-generator', 2, db => { db.createObjectStore('images', { keyPath: 'name' }); db.createObjectStore('bankImages', { keyPath: 'id' }).createIndex('bankId', 'bankId'); });
    tx = images.transaction(['images', 'bankImages'], 'readwrite');
    for (const name of ['alpha', 'beta', 'gamma']) {
      const bytes = new TextEncoder().encode(red);
      tx.objectStore('images').put({ name, ext: 'svg', mime: 'image/svg+xml', size: bytes.length, bytes });
    }
    const incBytes = new TextEncoder().encode(red.replace('red', 'blue'));
    tx.objectStore('bankImages').put({ id: 'inc:incoming-only', bankId: 'inc', image: { name: 'incoming-only', ext: 'svg', mime: 'image/svg+xml', size: incBytes.length, bytes: incBytes } });
    await done(tx); images.close();
  }, { red: svg('red') });

  // ── 2. Interrupted draft migration keeps the legacy copy and retries ──
  await page.evaluate(() => sessionStorage.setItem('fail-draft-writes', '1'));
  await page.goto(`${origin}#/editor`, { waitUntil: 'networkidle0' });
  const interrupted = await page.evaluate(async () => {
    const { editor } = await import('/src/lib/editor/editor-state.svelte.ts');
    while (editor.loading) await new Promise(r => setTimeout(r, 20));
    return { error: editor.storageError, legacy: !!localStorage.getItem('tg-editor-v1:out') };
  });
  assert.ok(interrupted.error && interrupted.legacy, `failed migration reports and keeps legacy data: ${JSON.stringify(interrupted)}`);
  await page.evaluate(() => sessionStorage.removeItem('fail-draft-writes'));
  await page.reload({ waitUntil: 'networkidle0' });
  const migrated = await page.evaluate(async () => {
    const { editor } = await import('/src/lib/editor/editor-state.svelte.ts');
    while (editor.loading) await new Promise(r => setTimeout(r, 20));
    return { count: editor.session.drafts.length, active: editor.session.activeId, points: editor.session.defaults.points,
      order: editor.session.drafts.slice(0, 3).map(d => d.id), legacy: localStorage.getItem('tg-editor-v1:out'), error: editor.storageError };
  });
  assert.deepEqual(migrated, { count: 500, active: 'legacy-7', points: 4, order: ['legacy-0', 'legacy-1', 'legacy-2'], legacy: null, error: '' });

  // ── 3. Image metadata migrated without reading payloads on later starts ──
  const images = await page.evaluate(async () => {
    const { imageStore } = await import('/src/lib/image-store.svelte.ts');
    window.__imagePayloadReads = 0;
    await imageStore.init();
    return { names: [...imageStore.names], reads: window.__imagePayloadReads };
  });
  assert.deepEqual(images, { names: ['alpha', 'beta', 'gamma'], reads: 0 });

  // ── 4. Edits during a failing flush stay in the journal and survive reload ──
  await page.evaluate(() => sessionStorage.setItem('fail-draft-writes', '1'));
  await page.waitForSelector('textarea[aria-label="Question"]');
  await page.type('textarea[aria-label="Question"]', ' journal-kept');
  await new Promise(r => setTimeout(r, 700)); // past the flush delay, while writes fail
  assert.ok(await page.evaluate(() => (localStorage.getItem('tg-editor-journal-v2:out') ?? '').includes('journal-kept')));
  await page.evaluate(() => sessionStorage.removeItem('fail-draft-writes'));
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForFunction(() => document.querySelector('textarea[aria-label="Question"]')?.value.endsWith(' journal-kept'));
  // The journal empties once IndexedDB has the edit; an edit made during a flush stays pending.
  const concurrent = await page.evaluate(async () => {
    const { DraftJournal, journalKey, openDraftDb } = await import('/src/lib/editor/draft-store.ts');
    const database = await openDraftDb();
    const journal = new DraftJournal(localStorage, 'journal-test');
    const draft = { id: 'd1', mcq: false, fields: { body: 'first' } };
    journal.put(draft, 0, JSON.stringify(draft));
    const writing = journal.flush(database); // snapshot taken now; the write is in flight
    draft.fields.body = 'first second';
    journal.put(draft, 0, JSON.stringify(draft));
    await writing;
    const pending = localStorage.getItem(journalKey('journal-test')) ?? '';
    await journal.flush(database);
    database.close();
    return { pendingKeptSecond: pending.includes('first second'), emptied: localStorage.getItem(journalKey('journal-test')) === null };
  });
  assert.deepEqual(concurrent, { pendingKeptSecond: true, emptied: true });

  // ── 5. Preview scheduling: newest per consumer, others untouched, PDFs kept ──
  const queue = await page.evaluate(async () => {
    const { compileSvg, compile, previewConsumer } = await import('/src/lib/typst/compiler.ts');
    const a = previewConsumer('test-a'), b = previewConsumer('test-b');
    const heavy = Array.from({ length: 300 }, (_, i) => `Line ${i}: $sqrt(x^2 + ${i})$\n\n`).join('');
    const running = compileSvg(`${heavy} running`, { consumer: a });
    const other = compileSvg('Other consumer', { consumer: b });
    const pdf = compile('Explicit PDF export');
    const stale = [1, 2, 3].map(i => compileSvg(`Obsolete ${i}`, { consumer: a }));
    const latest = compileSvg('Newest request', { consumer: a });
    const [r, o, p, s, l] = await Promise.all([running, other, pdf, Promise.all(stale), latest]);
    const pdfOk = !!p.pdfUrl && String.fromCharCode(...new Uint8Array(await (await fetch(p.pdfUrl)).arrayBuffer()).slice(0, 5)) === '%PDF-';
    if (p.pdfUrl) URL.revokeObjectURL(p.pdfUrl);
    return { running: !!r.svg, other: !!o.svg, pdfOk, stale: s.map(x => !!x.cancelled), latest: !!l.svg };
  });
  assert.deepEqual(queue, { running: true, other: true, pdfOk: true, stale: [true, true, true], latest: true });

  // ── 6. Image replacement invalidates previews and thumbnail URLs ──
  const replacement = await page.evaluate(async ({ blue }) => {
    const { imageStore } = await import('/src/lib/image-store.svelte.ts');
    const before = imageStore.revisionOf(['alpha']);
    const first = imageStore.acquireThumbnail('alpha');
    const url1 = (await first.url).url;
    await imageStore.put('alpha', new TextEncoder().encode(blue), 'svg');
    first.release();
    const second = imageStore.acquireThumbnail('alpha');
    const url2 = (await second.url).url;
    second.release();
    const text = await (await fetch(url2)).text();
    let revoked = false;
    try { await fetch(url1); } catch { revoked = true; }
    return { revisionChanged: imageStore.revisionOf(['alpha']) !== before, newUrl: url1 !== url2, newBytes: text.includes('blue'), revoked };
  }, { blue: svg('blue') });
  assert.deepEqual(replacement, { revisionChanged: true, newUrl: true, newBytes: true, revoked: true });

  // ── 7. Failed switch keeps the outgoing bank usable ──
  await page.evaluate(() => { window.__sameDocument = true; location.hash = '#/bank'; });
  await page.evaluate(() => sessionStorage.setItem('fail-bank-swap', '1'));
  const failed = await page.evaluate(async () => {
    const { bankWorkspaces } = await import('/src/lib/bank-workspaces.svelte.ts');
    const { bank } = await import('/src/lib/bank.svelte.ts');
    const { imageStore } = await import('/src/lib/image-store.svelte.ts');
    await bankWorkspaces.switchBank('inc');
    await imageStore.init();
    return { active: bankWorkspaces.activeBankId, error: !!bankWorkspaces.switchError, questions: bank.questions.map(q => q.body),
      stored: JSON.parse(localStorage.getItem('math-test-bank-v2')).map(q => q.body), images: [...imageStore.names] };
  });
  assert.deepEqual(failed, { active: 'out', error: true, questions: ['Outgoing question'], stored: ['Outgoing question'], images: ['alpha', 'beta', 'gamma'] });
  await page.waitForSelector('.bank-switch-status.error button');
  await page.evaluate(() => sessionStorage.removeItem('fail-bank-swap'));

  // ── 8. Rapid switching: last request wins, no reload, no leaks ──
  await page.click('.card');
  const rapid = await page.evaluate(async () => {
    const { bankWorkspaces } = await import('/src/lib/bank-workspaces.svelte.ts');
    const { bank } = await import('/src/lib/bank.svelte.ts');
    const { imageStore } = await import('/src/lib/image-store.svelte.ts');
    const { editor } = await import('/src/lib/editor/editor-state.svelte.ts');
    const first = bankWorkspaces.switchBank('third');
    const second = bankWorkspaces.switchBank('inc');
    await Promise.all([first, second]);
    await imageStore.init();
    await new Promise(r => setTimeout(r, 50));
    return { active: bankWorkspaces.activeBankId, error: bankWorkspaces.switchError, questions: bank.questions.map(q => q.body), images: [...imageStore.names],
      drafts: editor.session.drafts.length, selected: document.querySelectorAll('.card.selected').length, sameDocument: window.__sameDocument === true,
      select: document.querySelector('select[aria-label="Current bank"]').value };
  });
  assert.deepEqual(rapid, { active: 'inc', error: null, questions: ['Incoming question'], images: ['incoming-only'], drafts: 0, selected: 0, sameDocument: true, select: 'inc' });

  // ── 9. Switching back restores the outgoing bank, its drafts and images ──
  const back = await page.evaluate(async () => {
    const { bankWorkspaces } = await import('/src/lib/bank-workspaces.svelte.ts');
    const { bank } = await import('/src/lib/bank.svelte.ts');
    const { imageStore } = await import('/src/lib/image-store.svelte.ts');
    const { editor } = await import('/src/lib/editor/editor-state.svelte.ts');
    await bankWorkspaces.switchBank('out');
    await imageStore.init();
    return { questions: bank.questions.map(q => q.body), images: [...imageStore.names], drafts: editor.session.drafts.length,
      kept: editor.session.drafts.some(d => d.fields.body.endsWith(' journal-kept')) };
  });
  assert.deepEqual(back, { questions: ['Outgoing question'], images: ['alpha', 'beta', 'gamma'], drafts: 500, kept: true });
  assert.deepEqual(errors, []);
  console.log('Responsiveness regressions passed: interrupted/verified draft migration, image metadata migration without payload reads, journal durability through write failures and reload, edits during flush, preview replacement per consumer with PDFs preserved, image replacement invalidation and URL revocation, failed-switch rollback, rapid last-wins switching without reload, bank isolation of questions/images/drafts/selection.');
} finally {
  await browser?.close();
  await server.close();
}
