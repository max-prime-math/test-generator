import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';

// "Back up everything" copies every test, Gradebook record, bank snapshot and image in this
// browser into one file, exactly as stored, and changes nothing in the browser.
const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
let browser;
try {
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 950 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.evaluateOnNewDocument(() => {
    if (localStorage.getItem('seeded')) return;
    localStorage.setItem('seeded', '1');
    localStorage.setItem('tg-tutorial-done-v1', '1');
    localStorage.setItem('tg-gradebook-experimental-enabled-v1', 'true');
    localStorage.setItem('tg-test-library-v1', JSON.stringify([
      { id: 'unit-1', name: 'Unit 1 Test', selectedIds: [], createdAt: 1, updatedAt: 1 },
      { id: 'quiz-2', name: 'Quiz 2', selectedIds: [], createdAt: 2, updatedAt: 2 },
    ]));
    localStorage.setItem('tg-gradebook-v1', JSON.stringify({
      version: 1,
      sections: [{ id: 'p1', name: 'Period 1' }],
      students: [{ id: 'ada', firstName: 'Ada', lastName: 'Lee', active: true }],
      enrollments: [{ id: 'e1', sectionId: 'p1', studentId: 'ada', active: true }],
      assessments: [],
      scores: [],
    }));
    localStorage.setItem('tg-git-credentials-persistent-v1', 'secret-token');
    // Record downloads instead of saving them.
    window.__downloads = [];
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (!this.download) return click.call(this);
      window.__downloads.push(fetch(this.href).then(response => response.text()).then(text => ({ name: this.download, text })));
    };
  });
  await page.goto(`${server.resolvedUrls.local[0]}#/gradebook`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.gradebook-backup-panel');

  // An image, in the same database and store the app uses.
  await page.evaluate(async () => {
    const { openImageDb, IMAGE_STORE } = await import('/src/lib/image-db.ts');
    const db = await openImageDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(IMAGE_STORE, 'readwrite');
      tx.objectStore(IMAGE_STORE).put({ name: 'graph.png', ext: 'png', mime: 'image/png', size: 3, bytes: new Uint8Array([1, 2, 255]) });
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    });
    db.close();
  });

  const state = () => page.evaluate(async () => ({
    local: Object.fromEntries(Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)])),
    databases: (await indexedDB.databases()).map(db => `${db.name}@${db.version}`).sort(),
  }));
  const before = await state();

  await page.evaluate(() => [...document.querySelectorAll('.gradebook-backup-panel button')].find(button => button.textContent.trim() === 'Back up everything').click());
  await page.waitForFunction(() => /^Downloaded: /.test(document.querySelector('.gradebook-backup-panel')?.parentElement?.textContent.match(/Downloaded: [^\n]*/)?.[0] ?? ''));
  const [file] = await page.evaluate(() => Promise.all(window.__downloads));
  assert.match(file.name, /^test-generator-browser-backup-\d{4}-\d\d-\d\dT\d{6}\.json$/);
  const backup = JSON.parse(file.text);

  assert.equal(backup.format, 'test-generator-browser-backup');
  assert.deepEqual(backup.summary, { tests: 2, gradebookSections: 1, gradebookStudents: 1, gradebookAssessments: 0, gradebookScores: 0, databases: backup.summary.databases });
  // Tests and the Gradebook are copied character for character.
  assert.equal(backup.localStorage['tg-test-library-v1'], before.local['tg-test-library-v1']);
  assert.equal(backup.localStorage['tg-gradebook-v1'], before.local['tg-gradebook-v1']);
  assert.equal(backup.localStorage['tg-git-credentials-persistent-v1'], undefined, 'sign-in secrets are left out');
  for (const [key, value] of Object.entries(before.local)) {
    if (!key.startsWith('tg-git-credentials-')) assert.equal(backup.localStorage[key], value, `${key} is copied exactly`);
  }
  const image = backup.indexedDB['test-generator'].images.find(([key]) => key === 'graph.png')[1];
  assert.equal(Buffer.from(image.bytes.$bytes, 'base64').toString('hex'), '0102ff', 'image bytes survive');

  // Nothing in the browser changed, and no database was created or upgraded.
  assert.deepEqual(await state(), before);
  const status = await page.evaluate(() => document.querySelector('.gradebook-backup-panel').parentElement.textContent);
  assert.match(status, /Downloaded: 2 tests; Gradebook: 1 section, 1 student, 0 assessments, 0 scores\./);

  // The same backup is offered in Settings → More.
  await page.goto(`${server.resolvedUrls.local[0]}#/bank`, { waitUntil: 'networkidle0' });
  await page.click('button[aria-label="Settings"]');
  await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] button')].find(button => button.querySelector('span')?.textContent === 'More').click());
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent.trim() === 'Back Up Everything'));

  assert.deepEqual(errors, []);
  console.log('Browser backup passed: every test, Gradebook record and image copied exactly, secrets left out, browser storage unchanged.');
} finally {
  await browser?.close();
  await server.close();
}
