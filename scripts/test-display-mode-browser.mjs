import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';

const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
let browser;
try {
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('tg-tutorial-done-v1', '1');
    localStorage.setItem('theme', 'light');
    localStorage.setItem('tg-generator-experimental-enabled-v1', 'true');
    localStorage.setItem('tg-generator-plan-v2', JSON.stringify({ course: 'mb-10i', sections: [
      { id: 'display-generated', generatorId: 'mb-10i-factor-trinomials', seeds: [12345], difficulty: 1, format: 'written', options: {} },
    ] }));
    localStorage.setItem('math-test-bank-v2', JSON.stringify([
      { id: 'display-one', createdAt: 1, checked: true, points: 2, tags: [], questionType: 'mcq',
        narrativeId: 'display-story', narrative: 'Fallback narrative', body: 'What is $2 + 3$?',
        choices: { A: '4', B: '5', C: '6' }, answer: 'B', solution: '$2 + 3 = 5$.' },
      { id: 'display-two', createdAt: 2, checked: true, points: 1, tags: [], questionType: 'frq', body: 'Sketch $y = x$.' },
    ]));
    localStorage.setItem('tg-narratives-v1', JSON.stringify([
      { id: 'display-story', title: 'Bus trip', body: 'A class is travelling by bus.', tags: [], createdAt: 1 },
    ]));
  });
  await page.goto(`${server.resolvedUrls.local[0]}#/bank`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-qid="display-one"]');

  const popupTarget = browser.waitForTarget(target => target.opener() === page.target());
  await page.click('[data-qid="display-one"] button[aria-label="Open this question in the display window"]');
  const target = await popupTarget;
  const popup = await target.page();
  await popup.setViewport({ width: 1200, height: 900 });
  popup.on('pageerror', error => errors.push(`popup: ${error.message}`));
  await popup.waitForSelector('.question svg', { timeout: 60_000 });
  assert.equal(await popup.$eval('.counter', element => element.textContent), '1 / 2');
  assert.equal(await popup.$eval('[data-action="previous"]', button => button.disabled), true);
  assert.equal(await popup.$eval('[data-action="answer"]', button => button.getAttribute('aria-pressed')), 'false');
  assert.equal(await popup.$eval('[data-action="answer"]', button => button.disabled), false);
  assert.ok(await popup.$('[data-action="fullscreen"]'), 'fullscreen control is present');
  assert.equal(await popup.$eval('[data-action="theme"]', button => button.getAttribute('aria-pressed')), 'false');
  assert.equal(await popup.$eval('body', element => getComputedStyle(element).backgroundColor), 'rgb(255, 255, 255)');
  for (const selector of ['.question svg', '.counter', '[data-action="origin"]']) {
    assert.equal(await popup.$eval(selector, element => getComputedStyle(element).userSelect), 'none');
  }
  assert.equal(await popup.$eval('[data-action="origin"]', button => button.textContent), 'Local Bank · Question display');
  await popup.click('[data-action="origin"]');
  await page.waitForFunction(() => document.querySelector('[data-qid="display-one"]')?.classList.contains('question-origin-flash'));
  assert.equal(await page.$eval('[data-qid="display-one"]', element => element.classList.contains('selected')), true, 'origin selects the bank question');
  assert.deepEqual(await popup.$eval('main', element => {
    const style = getComputedStyle(element);
    const question = element.querySelector('.question-wrap').getBoundingClientRect();
    return {
      padding: [style.paddingTop, style.paddingRight, style.paddingLeft],
      availableWidth: Math.round(element.clientWidth - question.width),
      maxWidth: getComputedStyle(element.querySelector('.question-wrap')).maxWidth,
    };
  }), { padding: ['100px', '100px', '100px'], availableWidth: 200, maxWidth: 'none' });

  const studentSvg = await popup.$eval('.question', element => element.innerHTML);
  await popup.click('main', { button: 'right' });
  await popup.waitForFunction(previous => document.querySelector('.question')?.innerHTML !== previous && document.querySelector('[data-action="answer"]')?.getAttribute('aria-pressed') === 'true', { timeout: 60_000 }, studentSvg);
  await popup.click('main', { button: 'right' });
  await popup.waitForFunction(student => document.querySelector('.question')?.innerHTML === student && document.querySelector('[data-action="answer"]')?.getAttribute('aria-pressed') === 'false', { timeout: 60_000 }, studentSvg);
  await popup.click('main', { button: 'right' });
  await popup.waitForFunction(() => document.querySelector('[data-action="answer"]')?.getAttribute('aria-pressed') === 'true', { timeout: 60_000 });

  const answerSvg = await popup.$eval('.question', element => element.innerHTML);
  await popup.hover('main');
  const ctrlScroll = async deltaY => {
    await popup.keyboard.down('Control');
    try { await popup.mouse.wheel({ deltaY }); }
    finally { await popup.keyboard.up('Control'); }
  };
  await ctrlScroll(-120);
  await popup.waitForFunction(previous => document.querySelector('.zoom')?.textContent === '115%' && document.querySelector('.question')?.innerHTML !== previous, { timeout: 60_000 }, answerSvg);
  await ctrlScroll(120);
  await popup.waitForFunction(() => document.querySelector('.zoom')?.textContent === '100%');
  await ctrlScroll(-120);
  await popup.waitForFunction(() => document.querySelector('.zoom')?.textContent === '115%');

  const answerVisible = () => popup.$eval('[data-action="answer"]', button => button.getAttribute('aria-pressed'));
  const rightScroll = async (deltaY, expectedZoom) => {
    await popup.mouse.down({ button: 'right' });
    try {
      assert.equal(await answerVisible(), 'true', 'pressing the right button waits until release to toggle answers');
      await popup.mouse.wheel({ deltaY });
      await popup.waitForFunction(zoom => document.querySelector('.zoom')?.textContent === zoom, {}, expectedZoom);
    } finally { await popup.mouse.up({ button: 'right' }); }
    assert.equal(await answerVisible(), 'true', 'right-button scrolling leaves the answer visible');
  };
  await rightScroll(120, '100%');
  await rightScroll(-120, '115%');
  await popup.click('main', { button: 'right' });
  await popup.waitForFunction(() => document.querySelector('[data-action="answer"]')?.getAttribute('aria-pressed') === 'false');
  await popup.click('main', { button: 'right' });
  await popup.waitForFunction(() => document.querySelector('[data-action="answer"]')?.getAttribute('aria-pressed') === 'true');

  const mediumSvg = await popup.$eval('.question', element => element.innerHTML);
  await popup.evaluate(() => { for (let count = 0; count < 7; count++) document.querySelector('[data-action="zoom-in"]').click(); });
  await popup.waitForFunction(previous => document.querySelector('.zoom')?.textContent === '500%' && document.querySelector('[data-action="zoom-in"]')?.disabled && document.querySelector('.question')?.innerHTML !== previous, { timeout: 60_000 }, mediumSvg);
  assert.equal(await popup.$eval('main', element => element.scrollHeight > element.clientHeight), true, '500% creates a pannable canvas');
  await popup.mouse.wheel({ deltaY: 140 });
  await popup.waitForFunction(() => document.querySelector('main').scrollTop > 0);
  const scrolled = await popup.$eval('main', element => element.scrollTop);
  await popup.mouse.wheel({ deltaY: -140 });
  await popup.waitForFunction(previous => document.querySelector('main').scrollTop < previous, {}, scrolled);
  assert.equal(await popup.$eval('.zoom', element => element.textContent), '500%', 'plain scrolling does not change zoom');
  const scrollTopBeforeDrag = await popup.$eval('main', element => element.scrollTop);
  await popup.mouse.move(600, 650);
  await popup.mouse.down();
  await popup.mouse.move(600, 350, { steps: 8 });
  await popup.mouse.up();
  await popup.waitForFunction(before => document.querySelector('main').scrollTop > before, {}, scrollTopBeforeDrag);
  await new Promise(resolve => setTimeout(resolve, 320));
  assert.equal(await popup.$eval('.counter', element => element.textContent), '1 / 2', 'dragging pans without advancing');
  assert.equal(await popup.evaluate(() => window.getSelection()?.toString()), '', 'dragging does not select text');
  await popup.evaluate(() => { for (let count = 0; count < 7; count++) document.querySelector('[data-action="zoom-out"]').click(); });
  await popup.waitForFunction(() => document.querySelector('.zoom')?.textContent === '115%' && !document.querySelector('[data-action="zoom-in"]')?.disabled, { timeout: 60_000 });
  await popup.evaluate(() => { for (let count = 0; count < 6; count++) document.querySelector('[data-action="zoom-out"]').click(); });
  await popup.waitForFunction(() => document.querySelector('.zoom')?.textContent === '25%' && document.querySelector('[data-action="zoom-out"]')?.disabled, { timeout: 60_000 });
  await popup.evaluate(() => { for (let count = 0; count < 6; count++) document.querySelector('[data-action="zoom-in"]').click(); });
  await popup.waitForFunction(() => document.querySelector('.zoom')?.textContent === '115%', { timeout: 60_000 });

  const zoomedSvg = await popup.$eval('.question', element => element.innerHTML);
  await popup.click('[data-action="theme"]');
  await popup.waitForFunction(previous => document.querySelector('[data-action="theme"]')?.getAttribute('aria-pressed') === 'true' && document.querySelector('.question')?.innerHTML !== previous, { timeout: 60_000 }, zoomedSvg);
  assert.equal(await popup.$eval('body', element => getComputedStyle(element).backgroundColor), 'rgb(17, 17, 17)');
  assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'light', 'display theme does not change the app theme');
  await popup.click('[data-action="theme"]');
  await popup.waitForFunction(() => document.querySelector('[data-action="theme"]')?.getAttribute('aria-pressed') === 'false' && getComputedStyle(document.body).backgroundColor === 'rgb(255, 255, 255)', { timeout: 60_000 });

  await popup.click('main');
  await popup.waitForFunction(() => document.querySelector('.counter')?.textContent === '2 / 2' && document.querySelector('.question svg'));
  assert.equal(await popup.$eval('[data-action="next"]', button => button.disabled), true);
  assert.equal(await popup.$eval('[data-action="previous"]', button => button.disabled), false);
  assert.equal(await popup.$eval('[data-action="answer"]', button => button.disabled), true);
  assert.equal(await popup.$eval('[data-action="answer"]', button => button.getAttribute('aria-pressed')), 'false');

  await popup.click('main', { clickCount: 2, delay: 50 });
  await popup.waitForFunction(() => document.querySelector('.counter')?.textContent === '1 / 2');
  assert.equal(await popup.evaluate(() => window.getSelection()?.toString()), '', 'double-click does not select text');
  await popup.keyboard.press('ArrowRight');
  await popup.waitForFunction(() => document.querySelector('.counter')?.textContent === '2 / 2');
  await popup.keyboard.press('ArrowLeft');
  await popup.waitForFunction(() => document.querySelector('.counter')?.textContent === '1 / 2');

  // The Bank presentation follows the Editor draft and keeps the last good render.
  await page.evaluate(() => { window.location.hash = '#/editor/display-one'; });
  const questionText = '.editor-workspace textarea[aria-label="Question"]';
  await page.waitForSelector(questionText, { visible: true });
  const setQuestionText = text => page.$eval(questionText, (field, value) => {
    field.value = value;
    field.dispatchEvent(new Event('input', { bubbles: true }));
  }, text);
  const displayedSvg = window => window.$eval('.question', el => el.innerHTML);
  const closeDisplay = async window => {
    const closed = new Promise(resolve => window.once('close', resolve));
    await window.$eval('[data-action="close"]', button => { setTimeout(() => button.click(), 0); });
    await closed;
  };
  const waitForNewFrame = (window, old) => window.waitForFunction(previous => {
    const question = document.querySelector('.question');
    return question.querySelector('svg') && question.innerHTML !== previous;
  }, { timeout: 60_000 }, old);
  const original = await page.$eval(questionText, field => field.value);
  const beforeEdit = await displayedSvg(popup);
  await setQuestionText('What is $6 + 7$?');
  await waitForNewFrame(popup, beforeEdit);
  const validEdit = await displayedSvg(popup);
  await setQuestionText('What is $6 + 7?');
  await page.waitForSelector('.editor-workspace .preview [role="alert"]', { timeout: 30_000 });
  assert.equal(await displayedSvg(popup), validEdit, 'an unclosed Typst delimiter keeps the last good slide');
  assert.equal(await popup.$eval('.status', el => el.hidden), true, 'presentation errors stay hidden');
  assert.equal(await popup.$('.status.error'), null);
  await setQuestionText('What is $6 + 8$?');
  await waitForNewFrame(popup, validEdit);
  assert.equal(await popup.$eval('.counter', el => el.textContent), '1 / 2');
  assert.equal(await popup.$eval('.zoom', el => el.textContent), '115%', 'live edits retain the presentation zoom');

  // Fullscreen is last because headless Chromium closes a popup target when it leaves fullscreen.
  await popup.click('[data-action="fullscreen"]');
  await popup.mouse.move(600, 700);
  await popup.waitForFunction(() => document.fullscreenElement && document.querySelector('.toolbar').getBoundingClientRect().bottom <= 1, { timeout: 10_000 });
  const questionTop = await popup.$eval('.question-wrap', element => element.getBoundingClientRect().top);
  await popup.mouse.move(2, 2);
  await popup.waitForFunction(() => document.querySelector('.toolbar').getBoundingClientRect().top >= -1, { timeout: 10_000 });
  assert.ok(Math.abs(await popup.$eval('.question-wrap', element => element.getBoundingClientRect().top) - questionTop) < 1, 'revealing fullscreen controls does not move the question');
  await popup.mouse.move(600, 700);
  await popup.waitForFunction(() => document.querySelector('.toolbar').getBoundingClientRect().bottom <= 1, { timeout: 10_000 });
  await popup.evaluate(() => window.close()).catch(() => undefined);

  // The same explicit display action is present in the editing and test-copy scopes.
  await page.evaluate(() => { window.location.hash = '#/editor/display-one'; });
  const editorDisplay = '.preview-pane button[aria-label="Open this question in the display window"]';
  await page.waitForSelector(editorDisplay);
  const editorPopupTarget = browser.waitForTarget(candidate => candidate.opener() === page.target());
  await page.click(editorDisplay);
  const editorPopup = await (await editorPopupTarget).page();
  await editorPopup.waitForSelector('.question svg', { timeout: 60_000 });
  const editorBefore = await displayedSvg(editorPopup);
  await setQuestionText(original);
  await waitForNewFrame(editorPopup, editorBefore);
  await closeDisplay(editorPopup);
  await page.evaluate(() => { window.location.hash = '#/build'; });
  await page.waitForFunction(() => window.location.hash === '#/build');
  await page.evaluate(async () => {
    const { testEditor } = await import('/src/lib/test-editor.svelte.ts');
    testEditor.config.selectedIds = ['display-one'];
  });
  await page.waitForSelector('.selected-list button[aria-label="Open question 1 in the display window"]');
  await page.click('#picker-tab-selected');
  const buildPopupTarget = browser.waitForTarget(candidate => candidate.opener() === page.target());
  await page.click('.selected-list button[aria-label="Open question 1 in the display window"]');
  const buildPopup = await (await buildPopupTarget).page();
  await buildPopup.waitForSelector('.question svg', { timeout: 60_000 });
  const buildBefore = await displayedSvg(buildPopup);
  await page.click('.selected-list button[aria-label="Edit question 1"]');
  await page.waitForSelector('.test-edit');
  await setQuestionText('What is $21 + 7$?');
  await waitForNewFrame(buildPopup, buildBefore);
  page.once('dialog', dialog => dialog.accept());
  await page.click('.test-edit button::-p-text(Cancel)');
  await page.waitForFunction(() => window.location.hash === '#/build');
  await page.evaluate(() => { window.location.hash = '#/bank'; });
  await page.waitForFunction(() => window.location.hash === '#/bank');
  await buildPopup.click('[data-action="origin"]');
  await page.waitForFunction(() => window.location.hash === '#/build' && document.querySelector('.selected-list [data-display-question-id="display-one"]')?.classList.contains('question-origin-flash'));
  await closeDisplay(buildPopup);
  await page.evaluate(() => { window.location.hash = '#/generate'; });
  await page.waitForSelector('.generator .sheet button[aria-label="Open this question in the display window"]', { timeout: 60_000 });

  assert.deepEqual(errors, []);
  console.log('Display mode browser tests passed: click/double-click/right-click/wheel/drag gestures, 25–500% zoom, source return, independent theme, fullscreen overlay, keyboard controls, and all entry points.');
} finally {
  await browser?.close();
  await server.close();
}
