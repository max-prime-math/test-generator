import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';

const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
let browser;
try {
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('tg-tutorial-done-v1', '1');
    window.confirm = () => true;
    Object.defineProperty(FileSystemDirectoryHandle.prototype, 'queryPermission', { configurable: true, value: async () => 'granted' });
    Object.defineProperty(FileSystemDirectoryHandle.prototype, 'requestPermission', { configurable: true, value: async () => 'granted' });
    window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('app-lock-fixture', { create: true });
  });
  await page.goto(`${server.resolvedUrls.local[0]}#/bank`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => !document.querySelector('.lock-screen'));

  await page.evaluate(async () => {
    const { localWorkspace } = await import('/src/lib/local-workspace.svelte.ts');
    await localWorkspace.chooseFolder();
    localStorage.setItem('app-lock-data-sentinel', JSON.stringify({ banks: true, tests: true, gradebooks: true }));
  });
  await page.waitForFunction(async () => (await import('/src/lib/local-workspace.svelte.ts')).localWorkspace.connected);

  const openLockSettings = async () => {
    await page.click('#tut-settings-btn');
    await page.waitForSelector('.settings-tabs');
    await page.evaluate(() => [...document.querySelectorAll('.settings-tabs button')].find(button => button.textContent.includes('More')).click());
    await page.waitForSelector('.app-lock-settings');
  };
  const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

  await openLockSettings();
  await page.click('.app-lock-settings input[type="checkbox"]');
  assert.deepEqual(await page.$$eval('.app-lock-settings select option', options => options.map(option => Number(option.value))), [1, 5, 15, 30, 60, 120]);
  const newPasswordInputs = await page.$$('.app-lock-settings .app-lock-secret');
  await newPasswordInputs[0].type('teacher-pass');
  await newPasswordInputs[1].type('teacher-pass');
  await page.select('.app-lock-settings select', '30');
  await page.evaluate(() => [...document.querySelectorAll('.app-lock-settings button')].find(button => button.textContent.includes('Enable App Lock')).click());
  await page.waitForFunction(() => document.querySelector('.app-lock-settings')?.textContent.includes('App lock enabled'));
  await page.screenshot({ path: '/tmp/test-generator-app-lock-settings.png' });

  const stored = await page.evaluate(async () => {
    const root = await window.showDirectoryPicker();
    const text = await (await root.getFileHandle('.workspace-view')).getFile().then(file => file.text());
    return { text, sentinel: localStorage.getItem('app-lock-data-sentinel') };
  });
  const lockFile = JSON.parse(stored.text);
  assert.equal(lockFile.version, 1);
  assert.equal(typeof lockFile.salt, 'string');
  assert.equal(typeof lockFile.verifier, 'string');
  assert.ok(!stored.text.includes('teacher-pass'), 'workspace lock file never stores the plaintext password');
  assert.equal(stored.sentinel, JSON.stringify({ banks: true, tests: true, gradebooks: true }), 'app data is untouched');

  await page.evaluate(() => [...document.querySelectorAll('.app-lock-settings button')].find(button => button.textContent.trim() === 'Lock Now').click());
  await page.waitForSelector('.lock-screen');
  await settle();
  assert.notEqual(await page.$eval('.lock-screen', element => getComputedStyle(element).backdropFilter), 'none', 'locked background is blurred');
  await page.screenshot({ path: '/tmp/test-generator-app-lock.png' });
  await page.type('.lock-screen .lock-secret', 'wrong');
  await page.click('.unlock-button');
  await page.waitForSelector('.lock-error');
  await page.type('.lock-screen .lock-secret', 'teacher-pass');
  await page.click('.unlock-button');
  await page.waitForFunction(() => !document.querySelector('.lock-screen'));

  // A configured workspace starts locked after reload.
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('.lock-screen .lock-secret');
  assert.equal(await page.evaluate(async () => (await import('/src/lib/local-workspace.svelte.ts')).localWorkspace.connected), false,
    'the full workspace stays unopened while the startup lock is shown');
  assert.equal(await page.$('.workspace-app-shell'), null, 'the main views stay unmounted while the startup lock is shown');
  await page.type('.lock-screen .lock-secret', 'teacher-pass');
  await page.click('.unlock-button');
  await page.waitForFunction(() => !document.querySelector('.lock-screen'));

  // Password changes are made in Settings and replace the salted verifier.
  await openLockSettings();
  const changeInputs = await page.$$('.app-lock-settings .app-lock-secret');
  await changeInputs[0].type('new-teacher-pass');
  await changeInputs[1].type('new-teacher-pass');
  await page.evaluate(() => [...document.querySelectorAll('.app-lock-settings button')].find(button => button.textContent.includes('Change Password')).click());
  await page.waitForFunction(() => document.querySelector('.app-lock-settings')?.textContent.includes('Password changed'));
  await page.evaluate(() => [...document.querySelectorAll('.app-lock-settings button')].find(button => button.textContent.trim() === 'Lock Now').click());
  await page.type('.lock-screen .lock-secret', 'teacher-pass');
  await page.click('.unlock-button');
  await page.waitForSelector('.lock-error');
  await page.type('.lock-screen .lock-secret', 'new-teacher-pass');
  await page.click('.unlock-button');
  await page.waitForFunction(() => !document.querySelector('.lock-screen'));

  // The Settings toggle removes the verifier without touching app data.
  await openLockSettings();
  await page.click('.app-lock-settings input[type="checkbox"]');
  await page.waitForFunction(() => !document.querySelector('[aria-label="Lock the app"]'));
  assert.equal(await page.evaluate(async () => {
    try { await (await window.showDirectoryPicker()).getFileHandle('.workspace-view'); return true; }
    catch (error) { return !(error instanceof DOMException && error.name === 'NotFoundError'); }
  }), false, 'turning the setting off removes the verifier file');
  await page.click('.app-lock-settings input[type="checkbox"]');
  const recoveryInputs = await page.$$('.app-lock-settings .app-lock-secret');
  await recoveryInputs[0].type('recovery-pass');
  await recoveryInputs[1].type('recovery-pass');
  await page.evaluate(() => [...document.querySelectorAll('.app-lock-settings button')].find(button => button.textContent.includes('Enable App Lock')).click());
  await page.waitForFunction(() => document.querySelector('[aria-label="Lock the app"]'));

  // Deleting the inconspicuous workspace file is the forgotten-password recovery path.
  await page.evaluate(async () => {
    const { appLock } = await import('/src/lib/app-lock.svelte.ts');
    appLock.lock();
    const root = await window.showDirectoryPicker();
    await root.removeEntry('.workspace-view');
  });
  await page.waitForSelector('.lock-screen');
  await page.waitForFunction(() => !document.querySelector('.lock-screen'), { timeout: 6_000 });
  assert.equal(await page.$('[aria-label="Lock the app"]'), null);
  assert.equal(await page.evaluate(() => localStorage.getItem('app-lock-data-sentinel')), JSON.stringify({ banks: true, tests: true, gradebooks: true }));

  await settle();
  assert.deepEqual(errors, []);
  console.log('App lock passed: workspace verifier, settings and timeout, blur, startup lock, password change, unlock, and delete-file recovery.');
} finally {
  await browser?.close();
  await server.close();
}
