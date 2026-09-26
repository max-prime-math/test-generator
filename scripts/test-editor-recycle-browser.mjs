// Editor drafts: unedited bank questions are views, not drafts; deleting a
// draft moves it to a per-bank Recycle bin that empties after 30 days.
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
  page.on('dialog', dialog => void dialog.accept());
  await page.evaluateOnNewDocument(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('tg-tutorial-done-v1', '1');
    localStorage.setItem('math-test-bank-v2', JSON.stringify([
      { id: 'bank-q1', body: 'Bank question one', points: 2, tags: [], createdAt: 1 },
      { id: 'bank-q2', body: 'Bank question two', points: 3, tags: [], createdAt: 1 }]));
  });
  await page.evaluateOnNewDocument(() => {
    if (sessionStorage.getItem('legacy')) return;
    sessionStorage.setItem('legacy', '1');
    // Drafts saved by older versions have no baseline: one untouched view left by saving, one real edit.
    const original = { id: 'bank-q2', body: 'Bank question two', points: 3, tags: [], createdAt: 1 };
    const fields = { ...original, body: 'Bank question two', answer: '', solution: '', tagInput: '', classId: '', unitId: '', sectionId: '' };
    localStorage.setItem('tg-editor-v1:default', JSON.stringify({ version: 1, activeId: null, defaults: {},
      drafts: [{ id: 'legacy-view', sourceId: 'bank-q2', original, mcq: false, fields },
        { id: 'legacy-edit', sourceId: 'bank-q2', original, mcq: false, fields: { ...fields, body: 'Bank question two, legacy edit' } }] }));
  });
  await page.goto(`${server.resolvedUrls.local[0]}#/editor`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.draft-row');
  assert.deepEqual(await page.$$eval('.draft-row .item span', spans => spans.map(span => span.textContent)), ['Bank question two, legacy edit'], 'legacy untouched views are cleaned up; edits are kept');
  await page.evaluate(() => document.querySelector('.draft-row .row-delete').click());
  await page.evaluate(async () => { const { editor } = await import('/src/lib/editor/editor-state.svelte.ts'); editor.deleteForever('legacy-edit'); });
  const rows = () => page.$$eval('.draft-row .item span', spans => spans.map(span => span.textContent));
  const clickText = (selector, text) => page.evaluate((selector, text) => [...document.querySelectorAll(selector)].find(el => el.textContent.trim().startsWith(text)).click(), selector, text);
  const typeInQuestion = async text => { await page.focus('textarea[aria-label="Question"]'); await page.keyboard.type(text); };

  // 1. Opening a bank question, or saving an edit, never leaves a draft behind.
  await clickText('.bank-item', 'Bank question one');
  await page.waitForSelector('textarea[aria-label="Question"]');
  assert.deepEqual(await rows(), [], 'an unedited bank question is not a draft');
  assert.ok((await page.$eval('.draft-heading', el => el.textContent)).includes('changes you make become a draft'));
  await typeInQuestion(' edited');
  await page.waitForFunction(() => document.querySelectorAll('.draft-row').length === 1);
  await clickText('.actions button', 'Save');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('math-test-bank-v2'))[0].body === 'Bank question one edited');
  await page.waitForFunction(() => document.querySelector('textarea[aria-label="Question"]')?.value === 'Bank question one edited');
  assert.deepEqual(await rows(), [], 'after saving, the reopened question is not a draft');
  // Moving to another question closes the unedited view without a trace.
  await clickText('.bank-item', 'Bank question two');
  await page.waitForFunction(() => document.querySelector('textarea[aria-label="Question"]')?.value === 'Bank question two');
  assert.equal(await page.evaluate(async () => (await import('/src/lib/editor/editor-state.svelte.ts')).editor.session.drafts.length), 1, 'only the open view exists');

  // 2. Delete from the toolbar moves a draft to the Recycle bin, with Undo.
  await clickText('.actions button', '+ New Question');
  await typeInQuestion('Draft to recycle');
  await page.waitForFunction(() => [...document.querySelectorAll('.draft-row')].some(row => row.textContent.includes('Draft to recycle')));
  await clickText('.actions button', 'Delete draft');
  await page.waitForSelector('.recycle-bin');
  assert.ok(!(await rows()).some(text => text.includes('Draft to recycle')));
  await clickText('.status .link', 'Undo');
  await page.waitForFunction(() => document.querySelector('textarea[aria-label="Question"]')?.value === 'Draft to recycle');
  assert.ok((await rows()).includes('Draft to recycle'), 'Undo restores the draft');
  assert.equal(await page.$('.recycle-bin'), null);

  // 3. Row delete button; the bin survives reload; Restore and Delete forever.
  await clickText('.actions button', '+ New Question');
  await typeInQuestion('Second draft');
  await page.waitForFunction(() => [...document.querySelectorAll('.draft-row')].some(row => row.textContent.includes('Second draft')));
  for (const text of ['Draft to recycle', 'Second draft']) {
    await page.evaluate(text => [...document.querySelectorAll('.draft-row')].find(row => row.textContent.includes(text)).querySelector('.row-delete').click(), text);
  }
  await page.evaluate(async () => (await import('/src/lib/editor/editor-state.svelte.ts')).editor.flush());
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('.recycle-bin');
  const trash = await page.$$eval('.trash-row .trash-text', rows => rows.map(row => row.textContent));
  assert.equal(trash.length, 2);
  assert.ok(trash[0].startsWith('Second draft') && trash[0].includes('30 days left'), `newest first with days left: ${trash}`);
  await page.evaluate(() => document.querySelector('.recycle-bin').open = true);
  await page.evaluate(() => [...document.querySelectorAll('.trash-row')].find(row => row.textContent.includes('Draft to recycle')).querySelector('button').click());
  await page.waitForFunction(() => document.querySelector('textarea[aria-label="Question"]')?.value === 'Draft to recycle');
  await page.evaluate(() => [...document.querySelectorAll('.trash-row')].find(row => row.textContent.includes('Second draft')).querySelector('.danger').click());
  await page.waitForFunction(() => !document.querySelector('.recycle-bin'));

  // 4. Drafts deleted more than 30 days ago are removed on the next load.
  await page.evaluate(() => [...document.querySelectorAll('.draft-row')].find(row => row.textContent.includes('Draft to recycle')).querySelector('.row-delete').click());
  await page.evaluate(async () => {
    const { editor } = await import('/src/lib/editor/editor-state.svelte.ts');
    await editor.flush();
    const { openDraftDb } = await import('/src/lib/editor/draft-store.ts');
    const db = await openDraftDb();
    await new Promise((resolve, reject) => {
      const store = db.transaction('drafts', 'readwrite').objectStore('drafts');
      const all = store.getAll();
      all.onsuccess = () => {
        for (const record of all.result) if (record.deletedAt) store.put({ ...record, deletedAt: Date.now() - 31 * 86_400_000 });
        store.transaction.oncomplete = resolve;
      };
      all.onerror = () => reject(all.error);
    });
    db.close();
  });
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForFunction(async () => !(await import('/src/lib/editor/editor-state.svelte.ts')).editor.loading);
  assert.equal(await page.$('.recycle-bin'), null, 'expired drafts are emptied');
  const stored = await page.evaluate(async () => {
    const { openDraftDb } = await import('/src/lib/editor/draft-store.ts');
    const db = await openDraftDb();
    const records = await new Promise(resolve => { const all = db.transaction('drafts').objectStore('drafts').getAll(); all.onsuccess = () => resolve(all.result); });
    db.close();
    return records.filter(record => record.deletedAt).length;
  });
  assert.equal(stored, 0, 'expired drafts are deleted from storage');
  assert.deepEqual(errors, []);
  console.log('Editor drafts and Recycle bin passed: unedited/saved questions are not drafts, toolbar and row delete, Undo, restore, delete forever, persistence across reload, 30-day expiry.');
} finally {
  await browser?.close();
  await server.close();
}
