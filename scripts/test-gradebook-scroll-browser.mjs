import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';

const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
let browser;
try {
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewport({ width: 1440, height: 950 });
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('tg-tutorial-done-v1', '1');
    localStorage.setItem('tg-gradebook-experimental-enabled-v1', 'true');
    localStorage.setItem('tg-gradebook-v1', JSON.stringify({
      sections: [{ id: 'section', name: 'Long Overview' }],
      students: Array.from({ length: 60 }, (_, i) => ({ id: `s${i}`, firstName: 'Student', lastName: String(i).padStart(2, '0') })),
      enrollments: Array.from({ length: 60 }, (_, i) => ({ id: `e${i}`, sectionId: 'section', studentId: `s${i}` })),
      assessments: Array.from({ length: 30 }, (_, i) => ({ id: `a${i}`, sectionId: 'section', savedTestId: '', source: 'external', savedTestName: `Assessment ${i}`, totalPoints: 10, testType: 'test' })),
    }));
  });
  await page.goto(`${server.resolvedUrls.local[0]}#/gradebook`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.score-grid tbody tr');
  const frames = () => page.evaluate(async () => { for (let i = 0; i < 4; i++) await new Promise(requestAnimationFrame); });
  const dimensions = () => page.$eval('.work-area', pane => {
    const grid = pane.querySelector('.score-grid-wrap');
    return { height: pane.scrollHeight, viewport: pane.clientHeight, top: pane.scrollTop, gridHeight: grid.clientHeight, rows: grid.querySelectorAll('tbody tr').length };
  });
  for (const width of [1440, 900]) {
    await page.setViewport({ width, height: 800 });
    await page.$eval('.work-area', pane => pane.scrollTo({ top: 0, behavior: 'instant' }));
    await frames();
    const before = await dimensions();
    assert.ok(before.height > before.viewport, 'fixture must exercise the main page scrollbar');
    assert.equal(before.rows, 60, 'all rows exist before scrolling');
    await page.$eval('.work-area', pane => pane.scrollTo({ top: pane.scrollHeight, behavior: 'instant' }));
    await frames();
    const after = await dimensions();
    assert.equal(after.height, before.height, `Scrolling must not grow the page: ${JSON.stringify({ width, before, after })}`);
    assert.equal(after.gridHeight, before.gridHeight, 'scrolling does not resize the nested grid');
    assert.ok(Math.abs(after.top + after.viewport - after.height) <= 1, 'the main scrollbar reaches the real bottom in one move');
    // A wheel over the main pane also reaches a stable bottom without creating more content.
    await page.$eval('.work-area', pane => pane.scrollTo({ top: 0, behavior: 'instant' }));
    const target = await page.$eval('.work-area', pane => { const r = pane.getBoundingClientRect(); return { x: r.left + 4, y: r.top + 100 }; });
    await page.mouse.move(target.x, target.y);
    await page.mouse.wheel({ deltaY: 10000 });
    await page.waitForFunction(() => { const pane = document.querySelector('.work-area'); return Math.abs(pane.scrollTop + pane.clientHeight - pane.scrollHeight) <= 1; });
    await frames();
    assert.equal((await dimensions()).height, before.height);
    const grid = await page.$eval('.score-grid-wrap', wrap => {
      wrap.scrollTo({ top: wrap.scrollHeight, left: 1000, behavior: 'instant' });
      const header = wrap.querySelector('thead th').getBoundingClientRect();
      const last = wrap.querySelector('tbody tr:last-child').getBoundingClientRect();
      const summary = wrap.querySelector('tfoot').getBoundingClientRect();
      const bounds = wrap.getBoundingClientRect();
      return { atBottom: Math.abs(wrap.scrollTop + wrap.clientHeight - wrap.scrollHeight) <= 1,
        headerVisible: Math.abs(header.top - bounds.top) <= 2,
        lastVisible: last.top >= header.bottom && last.bottom <= bounds.bottom,
        summaryVisible: summary.bottom <= bounds.bottom };
    });
    assert.deepEqual(grid, { atBottom: true, headerVisible: true, lastVisible: true, summaryVisible: true });
  }
  assert.deepEqual(errors, []);
  console.log('Overview scrolling passed: stable page height, wheel and scrollbar reach the bottom, last student and summary visible, frozen headers retained.');
} finally { await browser?.close(); await server.close(); }
