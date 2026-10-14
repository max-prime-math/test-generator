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
  await page.evaluateOnNewDocument(() => localStorage.setItem('tg-tutorial-done-v1', '1'));
  await page.goto(`${server.resolvedUrls.local[0]}#/build`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.test-tab');

  const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const tabNames = () => page.$$eval('.test-tab-label > span:last-child', els => els.map(el => el.textContent.trim()));
  const activeName = () => page.$eval('.test-tab.active .test-tab-label > span:last-child', el => el.textContent.trim());
  const clickText = async (selector, text) => {
    assert.ok(await page.evaluate((selector, text) => {
      const button = [...document.querySelectorAll(selector)].find(el => el.textContent.trim() === text);
      if (!button) return false;
      button.click(); return true;
    }, selector, text), `Missing ${text}`);
    await settle();
  };
  const openFromLibrary = async name => {
    await page.evaluate(() => [...document.querySelectorAll('.test-toolbar button')].find(el => el.textContent.includes('Saved Tests'))?.click());
    await settle();
    await clickText('.test-card-title', name);
  };
  const fill = async (selector, value) => page.$eval(selector, (el, value) => {
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);

  await page.evaluate(async () => {
    const { testLibrary } = await import('/src/lib/test-library.svelte.ts');
    const { defaultTestConfig } = await import('/src/lib/types.ts');
    testLibrary.saveAs('Algebra Test', null, null, 'test', { ...defaultTestConfig('Algebra'), subtitle: 'Version A' });
    testLibrary.saveAs('Geometry Quiz', null, null, 'quiz', { ...defaultTestConfig('Geometry'), subtitle: 'Version B' });
  });

  assert.equal((await tabNames()).length, 1, 'Build starts with one tab');
  await openFromLibrary('Algebra Test');
  assert.equal(await activeName(), 'Algebra Test');
  assert.equal((await tabNames()).length, 2);
  await openFromLibrary('Algebra Test');
  assert.equal((await tabNames()).length, 2, 'opening an already-open saved test selects its tab');
  await openFromLibrary('Geometry Quiz');
  assert.equal((await tabNames()).length, 3);

  await clickText('.test-tab-label', 'Algebra Test');
  await fill('#t-subtitle', 'Algebra tab edit');
  await clickText('.test-tab-label', 'Geometry Quiz');
  await fill('#t-subtitle', 'Geometry tab edit');
  await clickText('.test-tab-label', 'Algebra Test');
  assert.equal(await page.$eval('#t-subtitle', el => el.value), 'Algebra tab edit', 'tabs preserve independent editor state');

  await page.keyboard.down('Alt'); await page.keyboard.press('t'); await page.keyboard.up('Alt'); await settle();
  assert.equal((await tabNames()).length, 4);
  await fill('#t-subtitle', 'Independent draft');
  await page.keyboard.down('Alt'); await page.keyboard.press('w'); await page.keyboard.up('Alt'); await settle();
  assert.equal((await tabNames()).length, 3, 'Alt+W closes the active tab');
  await page.keyboard.down('Alt'); await page.keyboard.down('Shift'); await page.keyboard.press('t'); await page.keyboard.up('Shift'); await page.keyboard.up('Alt'); await settle();
  assert.equal((await tabNames()).length, 4, 'Alt+Shift+T restores the closed tab');
  assert.equal(await page.$eval('#t-subtitle', el => el.value), 'Independent draft');

  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('.test-tab');
  assert.equal((await tabNames()).length, 4, 'open tabs survive reload');
  assert.equal(await page.$eval('#t-subtitle', el => el.value), 'Independent draft');
  await page.screenshot({ path: '/tmp/test-generator-tabs.png' });

  await page.evaluate(async () => (await import('/src/lib/app-settings.svelte.ts')).appSettings.setTestTabsEnabled(false));
  await page.waitForFunction(() => !document.querySelector('.test-tab-strip'));
  await openFromLibrary('Algebra Test');
  assert.equal(await page.$eval('#t-title', el => el.value), 'Algebra');
  await page.evaluate(async () => (await import('/src/lib/app-settings.svelte.ts')).appSettings.setTestTabsEnabled(true));
  await page.waitForSelector('.test-tab-strip');
  assert.equal((await tabNames()).filter(name => name === 'Algebra Test').length, 1, 're-enabling tabs reconciles the single editor without duplicates');

  assert.deepEqual(errors, []);
  console.log('Test tabs passed: saved-test deduplication, independent drafts, switching, shortcuts, closed-tab restore, reload persistence, and the settings toggle.');
} finally {
  await browser?.close();
  await server.close();
}
