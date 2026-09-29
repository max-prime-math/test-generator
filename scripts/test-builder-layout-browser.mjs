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
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('tg-tutorial-done-v1', '1');
    localStorage.setItem('math-test-bank-v2', JSON.stringify(Array.from({ length: 40 }, (_, i) => ({
      id: `q${i}`, body: `Alpha question ${i}`, points: 2, tags: [], createdAt: 1,
    }))));
  });
  await page.goto(`${server.resolvedUrls.local[0]}#/build`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.picker-panel');
  const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const drag = async (selector, dx, dy) => {
    const box = await (await page.$(selector)).boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 8 });
    await page.mouse.up();
    await settle();
  };
  const button = async name => {
    const target = await page.evaluateHandle(text => [...document.querySelectorAll('button')].find(el => el.textContent.trim() === text || el.getAttribute('aria-label') === text), name);
    await target.asElement().click();
    await target.dispose();
    await settle();
    await page.evaluate(() => Promise.all(document.querySelector('.build-tab').getAnimations({ subtree: true }).filter(a => a.animationName?.endsWith('picker-pop')).map(a => a.finished)));
  };
  const activeTab = () => page.$eval('.picker-tabs [aria-selected="true"]', el => el.id);
  const scroll = selector => page.$eval(selector, el => el.scrollTop);
  const setScroll = async (selector, top) => {
    await page.$eval(selector, (el, value) => { el.scrollTop = value; }, top);
    await settle();
  };
  assert.equal(await activeTab(), 'picker-tab-browse');
  await button('Selected (0)');
  assert.equal(await page.$eval('.selected-section', el => el.hidden), false);
  assert.match(await page.$eval('.selected-section', el => el.textContent), /No questions selected yet/);
  await button('Browse questions');
  await page.type('.picker-search', 'Alpha');
  await button('All');
  assert.equal(await activeTab(), 'picker-tab-browse', 'adding questions keeps Browse active');
  assert.match(await page.$eval('.picker-summary', el => el.textContent), /40 questions · 80 points/);
  await setScroll('.picker-list', 250);
  const browseScroll = await scroll('.picker-list');
  assert.ok(browseScroll > 0);
  await button('Selected (40)');
  await setScroll('.selected-list', 200);
  const selectedScroll = await scroll('.selected-list');
  assert.ok(selectedScroll > 0);
  await button('Browse');
  assert.equal(await scroll('.picker-list'), browseScroll);
  assert.equal(await page.$eval('.picker-search', el => el.value), 'Alpha');
  await button('Selected (40)');
  assert.equal(await scroll('.selected-list'), selectedScroll);
  await page.focus('#picker-tab-selected');
  await page.keyboard.press('ArrowLeft');
  assert.equal(await activeTab(), 'picker-tab-browse');
  await page.keyboard.press('End');
  assert.equal(await activeTab(), 'picker-tab-selected');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'picker-tab-selected');
  assert.equal(await page.$eval('.selector-section', el => getComputedStyle(el).display), 'none');
  const fillsPanel = await page.evaluate(() => {
    const panel = document.querySelector('.picker-panel').getBoundingClientRect();
    const selected = document.querySelector('.selected-section').getBoundingClientRect();
    return Math.abs(panel.bottom - selected.bottom) < 2 && selected.height > panel.height * 0.8;
  });
  assert.ok(fillsPanel, 'selected list uses the remaining panel height');
  await page.setViewport({ width: 1440, height: 650 });
  await settle();
  assert.equal(await activeTab(), 'picker-tab-selected');
  await page.setViewport({ width: 1440, height: 950 });
  const originalWidth = await page.$eval('.picker-panel', el => el.getBoundingClientRect().width);
  await button('Expand question picker');
  assert.equal(await activeTab(), 'picker-tab-selected');
  assert.notEqual(await page.$eval('.build-tab .preview-panel', el => getComputedStyle(el).display), 'none');
  assert.equal(await page.$eval('.build-tab .preview-panel', el => getComputedStyle(el).filter), 'blur(5px)');
  assert.equal(await page.$eval('.build-tab .preview-panel', el => el.inert), true);
  assert.equal(await page.$eval('.settings-panel', el => getComputedStyle(el).display), 'none');
  assert.ok(await page.$eval('.picker-panel', el => el.getBoundingClientRect().width) > 1000);
  assert.equal(await page.$eval('.picker-panel', el => getComputedStyle(el).borderRadius), '14px');
  assert.ok(await page.$('.picker-heading .picker-expand'), 'expand control belongs to the picker header');
  await page.screenshot({ path: '/tmp/test-generator-selected-controls.png' });
  await button('Browse');
  assert.equal(await page.$eval('.picker-search', el => el.value), 'Alpha');
  await page.screenshot({ path: '/tmp/test-generator-expanded-picker.png' });
  await button('Return to preview');
  assert.equal(await page.$eval('.picker-panel', el => el.getBoundingClientRect().width), originalWidth);
  assert.notEqual(await page.$eval('.build-tab .preview-panel', el => getComputedStyle(el).display), 'none');
  assert.notEqual(await page.$eval('.settings-panel', el => getComputedStyle(el).display), 'none');
  assert.equal(await page.$eval('.build-tab .preview-panel', el => el.inert), false);
  assert.equal(await page.$eval('.build-tab .preview-panel', el => getComputedStyle(el).filter), 'none');
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await button('Expand question picker');
  assert.equal(await page.$eval('.picker-panel', el => getComputedStyle(el).animationName), 'none');
  await button('Return to preview');
  await page.emulateMediaFeatures([]);
  await button('Selected (40)');
  await button('Hide questions');
  assert.equal(await page.$('.picker-panel'), null);
  await button('Show questions');
  assert.equal(await activeTab(), 'picker-tab-selected');
  for (const panel of ['settings', 'picker']) {
    await page.click(`.${panel}-divider`);
    assert.ok(await page.$(`.${panel}-panel`), 'clicking a divider does not hide the panel');
    await drag(`.${panel}-divider`, panel === 'picker' ? 600 : -600, 0);
    assert.ok(await page.$(`.${panel}-panel`), 'dragging to the minimum does not hide the panel');
  }
  await button('Hide settings');
  assert.equal(await page.$('.settings-panel'), null);
  await button('Show settings');
  assert.equal(await page.$eval('.settings-panel', el => el.getBoundingClientRect().width), 240);
  // Expansion also works from a hidden picker and on a narrow screen.
  await button('Hide settings');
  await button('Hide questions');
  await page.setViewport({ width: 390, height: 844 });
  await button('Show questions');
  assert.equal(await page.$eval('.picker-panel', el => getComputedStyle(el).display), 'flex');
  assert.equal(await page.$eval('.picker-panel', el => getComputedStyle(el).borderRadius), '0px');
  assert.ok(await page.$eval('.picker-panel', el => el.getBoundingClientRect().width) <= 390);
  await button('Return to preview');
  assert.equal(await page.$('.picker-panel'), null);
  await page.setViewport({ width: 1440, height: 950 });
  assert.equal(await page.$('.settings-panel'), null, 'return preserves hidden settings');
  console.log('Build layout interactions passed.');
} finally {
  await browser?.close();
  await server.close();
}
