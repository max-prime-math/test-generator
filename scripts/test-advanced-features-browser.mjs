// Git/GitHub sync is an advanced feature: hidden and inactive by default,
// shown by a Settings toggle, and hiding it never deletes saved configuration.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';

const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
let browser;
const REMOTES = JSON.stringify([{ name: 'origin', kind: 'github', branch: 'main', upstream: 'origin/main', defaultBranch: 'main', github: { owner: 'someone', repo: 'bank-repo' } }]);
try {
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.evaluateOnNewDocument(remotes => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('tg-tutorial-done-v1', '1');
    localStorage.setItem('tg-git-remotes-v1', remotes);
    const open = indexedDB.open;
    window.__gitDbOpened = false;
    indexedDB.open = function (name, ...rest) { if (name === 'test-generator-git') window.__gitDbOpened = true; return open.call(this, name, ...rest); };
  }, REMOTES);
  await page.goto(`${server.resolvedUrls.local[0]}#/bank`, { waitUntil: 'networkidle0' });
  const state = async () => page.evaluate(() => ({
    syncButton: !!document.querySelector('#tut-sync-btn'),
    tabs: [...document.querySelectorAll('.settings-tabs button span')].map(span => span.textContent.trim()),
    activeTab: document.querySelector('.settings-tabs button.active span')?.textContent.trim() ?? null,
    bankLabel: document.querySelector('select[aria-label="Current bank"] option:checked')?.textContent.trim(),
    remotes: localStorage.getItem('tg-git-remotes-v1'),
  }));

  // Off by default: no Sync button, no GitHub tab, Settings opens on Theme, Git storage untouched.
  await page.click('#tut-settings-btn');
  await page.waitForSelector('.settings-tabs');
  const off = await state();
  assert.equal(off.syncButton, false);
  assert.ok(!off.tabs.includes('GitHub Credentials'), `tabs: ${off.tabs}`);
  assert.equal(off.activeTab, 'Theme');
  assert.equal(off.bankLabel, 'Local Bank', 'bank selector shows the bank name, not the GitHub repo');
  assert.equal(await page.evaluate(() => window.__gitDbOpened), false, 'Git repository storage is not opened');

  // Enable in Settings → More.
  await page.evaluate(() => [...document.querySelectorAll('.settings-tabs button')].find(b => b.textContent.includes('More')).click());
  const toggle = () => page.evaluate(() => [...document.querySelectorAll('label.check-row')].find(l => l.textContent.includes('Git and GitHub sync')).querySelector('input').click());
  await toggle();
  await page.waitForSelector('#tut-sync-btn');
  const on = await state();
  assert.ok(on.tabs.includes('GitHub Credentials'));
  assert.equal(on.bankLabel, 'someone/bank-repo');
  assert.equal(on.remotes, REMOTES);

  // The setting persists across reloads.
  await page.reload({ waitUntil: 'networkidle0' });
  assert.equal((await state()).syncButton, true);

  // Disable again: hidden, but saved remotes remain.
  await page.click('#tut-settings-btn');
  await page.waitForSelector('.settings-tabs');
  await page.evaluate(() => [...document.querySelectorAll('.settings-tabs button')].find(b => b.textContent.includes('More')).click());
  await toggle();
  await page.waitForFunction(() => !document.querySelector('#tut-sync-btn'));
  const offAgain = await state();
  assert.ok(!offAgain.tabs.includes('GitHub Credentials'));
  assert.equal(offAgain.remotes, REMOTES, 'hiding Git features keeps saved remotes');
  assert.deepEqual(errors, []);
  console.log('Advanced Git features passed: hidden and inactive by default, toggle shows/hides UI, setting persists, saved remotes kept.');
} finally {
  await browser?.close();
  await server.close();
}
