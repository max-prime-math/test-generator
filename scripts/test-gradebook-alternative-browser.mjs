import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';

const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
let browser;
try {
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 950 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => { errors.push(`Unexpected dialog: ${dialog.message()}`); void dialog.dismiss(); });
  await page.evaluateOnNewDocument(() => {
    if (sessionStorage.getItem('alternative-fixture')) return;
    sessionStorage.setItem('alternative-fixture', '1');
    localStorage.setItem('tg-tutorial-done-v1', '1');
    localStorage.setItem('tg-gradebook-experimental-enabled-v1', 'true');
    localStorage.setItem('tg-gradebook-v1', JSON.stringify({
      sections: [{ id: 'section', name: 'Alternative and scrolling' }],
      students: Array.from({ length: 50 }, (_, i) => ({ id: `s${i}`, firstName: `Student${i}`, lastName: `Name${String(i).padStart(2, '0')}` })),
      enrollments: Array.from({ length: 50 }, (_, i) => ({ id: `e${i}`, sectionId: 'section', studentId: `s${i}` })),
    }));
  });
  await page.goto(`${server.resolvedUrls.local[0]}#/gradebook`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.score-grid');
  const assessmentId = await page.evaluate(async () => {
    const { gradebook } = await import('/src/lib/gradebook.svelte.ts');
    const assessment = gradebook.addExternalAssessment({ sectionId: 'section', name: 'Wide test', testType: 'test', questionPoints: Array(30).fill(2), totalPoints: 60 });
    gradebook.updateQuestionScore({ sectionId: 'section', assessmentId: assessment.id, studentId: 's0', questionId: 'external-q1', points: 2 });
    for (let i = 0; i < 15; i++) gradebook.addExternalAssessment({ sectionId: 'section', name: `Other assessment ${i}`, testType: 'quiz', totalPoints: 20 });
    gradebook.flush();
    return assessment.id;
  });
  const click = text => page.evaluate(text => {
    const button = [...document.querySelectorAll('button')].find(button => button.getClientRects().length && button.textContent.trim() === text);
    if (!button) throw new Error(`Missing button ${text}`);
    button.click();
  }, text);
  await page.evaluate(() => [...document.querySelectorAll('.assessment-list .assessment-item')].find(button => button.textContent.includes('Wide test')).click());
  await click('Grading');
  const state = '.grading-grid [aria-label="Score state for Student0 Name00"]';
  await page.select(state, 'alternative');
  const altScore = '.grading-grid [aria-label="Alternative score for Student0 Name00"]';
  const denominator = '.grading-grid [aria-label="Alternative denominator for Student0 Name00"]';
  await page.waitForSelector(altScore);
  assert.equal(await page.$$eval('.grading-grid tbody tr:first-child .grade-cell input', inputs => inputs.every(input => input.disabled)), true);
  const enter = async (selector, value) => {
    await page.$eval(selector, input => { input.focus({ preventScroll: true }); input.select(); });
    await page.keyboard.type(value);
    await page.keyboard.press('Tab');
  };
  await enter(altScore, '23');
  await enter(denominator, '25');
  const score = () => page.evaluate(async id => {
    const { gradebook } = await import('/src/lib/gradebook.svelte.ts');
    return gradebook.snapshot().scores.find(score => score.assessmentId === id && score.studentId === 's0');
  }, assessmentId);
  assert.equal((await score()).points, 23);
  assert.equal((await score()).alternativeTotalPoints, 25);
  assert.equal((await score()).questionScores[0].points, 2, 'original detail is preserved but excluded');
  await click('Undo');
  assert.equal((await score()).alternativeTotalPoints, 60, 'denominator edit can be undone');
  await click('Redo');
  assert.equal((await score()).alternativeTotalPoints, 25);
  await page.$eval(denominator, input => { input.value = '0'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  assert.equal(await page.evaluate(async id => {
    const { gradebook } = await import('/src/lib/gradebook.svelte.ts');
    const { sectionFinalPercent } = await import('/src/lib/gradebook-calculations.ts');
    return sectionFinalPercent(gradebook.snapshot(), gradebook.sections[0], 's0');
  }, assessmentId), null, 'invalid denominator is excluded');
  await enter(denominator, '25');
  await click('Overview');
  assert.match(await page.$eval('.score-grid tbody tr:first-child', row => row.textContent), /92%/);
  assert.match(await page.$eval('.score-grid tbody tr:first-child', row => row.textContent), /23 \/ 25 \(Alternative\)/);
  await page.evaluate(async () => { const { gradebook } = await import('/src/lib/gradebook.svelte.ts'); gradebook.flush(); });
  await page.reload({ waitUntil: 'networkidle0' });
  assert.equal((await score()).alternativeTotalPoints, 25, 'reload preserves denominator');
  assert.equal((await score()).state, 'alternative');
  await page.evaluate(() => [...document.querySelectorAll('.assessment-list .assessment-item')].find(button => button.textContent.includes('Wide test')).click());
  await click('Grading');
  await page.evaluate(async id => {
    const { gradebook } = await import('/src/lib/gradebook.svelte.ts');
    gradebook.updateScore({ sectionId: 'section', assessmentId: id, studentId: 's49', state: 'alternative', points: 8, alternativeTotalPoints: 10 });
  }, assessmentId);
  await click('Total only');
  await page.waitForSelector(altScore);
  assert.match(await page.$eval('.grading-grid tbody tr:first-child .total-cell', cell => cell.textContent), /92%/);
  await click('By question');
  await page.waitForSelector('.question-head');
  await page.select('.grading-grid [aria-label="Score state for Student49 Name49"]', 'normal');
  // A block crossing an alternative row must not silently replace its direct score.
  await page.$eval('[data-grade-row="0"][data-grade-col="0"]:disabled', input => {
    const transfer = new DataTransfer(); transfer.setData('text/plain', '1\t2');
    input.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }));
  });
  assert.equal((await score()).state, 'alternative');
  assert.match(await page.$eval('.paste-message', element => element.textContent), /Alternative assessments use a direct score/);

  const focus = (row, col) => page.$eval(`.grading-grid [data-grade-row="${row}"][data-grade-col="${col}"]:not(:disabled)`, input => input.focus({ preventScroll: true }));
  const visible = () => page.evaluate(() => {
    const input = document.activeElement;
    const cell = input.closest('td'), wrap = input.closest('.grading-grid-wrap');
    const r = cell.getBoundingClientRect(), w = wrap.getBoundingClientRect();
    const name = cell.parentElement.querySelector('.grading-name').getBoundingClientRect();
    const total = cell.parentElement.querySelector('.frozen-total').getBoundingClientRect();
    const state = cell.parentElement.querySelector('.score-state').getBoundingClientRect();
    const head = wrap.querySelector(`thead th:nth-child(${cell.cellIndex + 1})`).getBoundingClientRect();
    const next = cell.nextElementSibling.getBoundingClientRect();
    return { row: input.dataset.gradeRow, col: input.dataset.gradeCol,
      full: r.left >= total.right - 1 && r.right <= state.left + 1 && r.top >= head.bottom - 1 && r.bottom <= w.top + wrap.clientHeight + 1,
      nameVisible: name.left >= w.left - 1 && name.right <= w.right,
      headerVisible: head.top >= w.top - 1 && head.bottom <= w.bottom,
      nextVisible: next.right <= state.left + 1,
      roomForNext: next.right - r.left <= state.left - total.right - 4,
      highlighted: cell.classList.contains('active-column') && cell.parentElement.classList.contains('active-row') && wrap.querySelector(`thead th:nth-child(${cell.cellIndex + 1})`).classList.contains('active-column'),
      scrollLeft: wrap.scrollLeft, scrollTop: wrap.scrollTop,
      rects: { cell: [r.left, r.right, r.top, r.bottom], total: [total.left, total.right], state: state.left, head: [head.top, head.bottom], wrap: [w.left, w.right, w.top, w.bottom] } };
  });
  for (const width of [1440, 1180, 900]) {
    await page.setViewport({ width, height: 800 });
    await focus(1, 0);
    for (let col = 0; col < 29; col++) {
      const result = await visible();
      assert.ok(result.full && result.headerVisible && result.nameVisible && result.highlighted, JSON.stringify({ width, ...result }));
      if (result.roomForNext) assert.ok(result.nextVisible, `Next question visible: ${JSON.stringify(result)}`);
      await page.keyboard.press('Tab');
    }
    for (let row = 2; row < 50; row++) {
      await page.keyboard.press('ArrowDown');
      const result = await visible();
      assert.ok(result.full && result.headerVisible && result.nameVisible, JSON.stringify({ width, ...result }));
    }
    await page.keyboard.down('Shift'); await page.keyboard.press('Tab'); await page.keyboard.up('Shift');
    assert.ok((await visible()).full, 'reverse navigation reveals full cell');
  }
  await page.setViewport({ width: 1440, height: 950 });
  await focus(3, 7);
  if (process.env.SCREENSHOT_PATH) await page.screenshot({ path: process.env.SCREENSHOT_PATH });
  await click('Overview');
  const overview = await page.$eval('.score-grid-wrap', wrap => {
    const pane = wrap.closest('.work-area');
    pane.scrollTo({ left: 1500, top: wrap.offsetTop + 700, behavior: 'instant' });
    const row = wrap.querySelectorAll('tbody tr')[25];
    const name = row.children[0].getBoundingClientRect(), total = row.children[1].getBoundingClientRect();
    const head = wrap.querySelector('thead th').getBoundingClientRect(), bounds = pane.getBoundingClientRect();
    const style = getComputedStyle(pane);
    return { name: name.left, total: total.left, head: head.top, left: bounds.left + parseFloat(style.paddingLeft), top: bounds.top + parseFloat(style.paddingTop) };
  });
  assert.ok(Math.abs(overview.name - overview.left) <= 2 && Math.abs(overview.total - overview.left - 180) <= 2 && Math.abs(overview.head - overview.top) <= 2, JSON.stringify(overview));
  await page.setViewport({ width: 390, height: 844 });
  await click('Grading');
  const mobileScore = '.mobile-score-entry-list [aria-label="Alternative score for Student0 Name00"]';
  await enter(mobileScore, '20');
  assert.equal((await score()).points, 20);
  assert.equal((await score()).alternativeTotalPoints, 25);
  assert.deepEqual(errors, []);
  console.log('Alternative direct grades, denominator undo/redo and persistence, frozen headers/columns, and instant keyboard scrolling passed.');
} finally { await browser?.close(); await server.close(); }
