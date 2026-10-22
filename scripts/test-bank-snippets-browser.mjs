import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';

// Synthetic questions in an isolated browser; never reads host banks or student data.
const shotDir = process.env.BANK_SNIPPET_SHOTS;
const desktopOnly = process.argv.includes('--desktop-only');
const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
let browser;
try {
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewport({ width: 1440, height: 900 });
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('tg-tutorial-done-v1', '1');
    window.__snippetRequests = [];
    const postMessage = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function(message, ...args) {
      if (message?.kind === 'svg' && message.document?.source?.includes('#set page(width: auto')) window.__snippetRequests.push(message.document.source);
      return postMessage.call(this, message, ...args);
    };
    const bodies = [
      'Solve the equation $2x^2 - 5x + 3 = 0$.',
      'Simplify $frac(1, 2) + sqrt(9)$.',
      'Inspect #image("/imgs/diagram", width: 4cm), then find $x + 7$.',
      'Broken $sqrt(x$.',
      '#text(fill: rgb("red"))[*Find* the value of] $x^2$ when $x = 3$.',
      'This body is superseded by the structured stem.',
      `Explain why $x^2 >= 0$. ${'Include a reason for each step in your argument. '.repeat(10)}`,
      'Solve the equation $2x^2 - 5x + 3 = 0$.',
      '#context[Wrapped context: solve $z + 4 = 9$.]',
      '#context { set text(size: 12pt); [Wrapped code: solve $z + 4 = 9$.] }',
      '#text(font: "New Computer Modern", [Argument content: solve $z + 4 = 9$.])',
      '#text("Quoted content: find the value of z.")',
      '#set text(size: 12pt); Inline setup: solve $z + 4 = 9$.',
      '#let question(body) = block(body)\n#question[Custom wrapper: solve $z + 4 = 9$.]',
    ];
    localStorage.setItem('math-test-bank-v2', JSON.stringify(Array.from({ length: 100 }, (_, i) => ({
      id: `snippet-${i}`, body: bodies[i] ?? `Question ${i}: solve $x + ${i} = ${i + 3}$.`,
      tags: i < 8 ? ['algebra'] : ['lazy'], points: 3, createdAt: i + 1,
      ...(i === 0 ? { solution: '$x = 1$ or $x = 3/2$.' } : {}),
      ...(i === 5 ? { parts: { stem: 'Solve $y + 2 = 5$.', items: [{ body: 'Explain your answer.' }] } } : {}),
    }))));
  });
  await page.goto(`${server.resolvedUrls.local[0]}#/bank`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-qid="snippet-0"] .math.rendered svg', { timeout: 60000 });
  await page.waitForSelector('[data-qid="snippet-1"] .math.rendered svg');
  assert.equal(await page.$eval('.snippet', el => getComputedStyle(el).fontSize), '15px');
  assert.ok(!await page.$('.card .body pre'), 'question prose uses proportional text');
  assert.ok(!await page.$('.snippet svg script, .snippet svg style, .snippet svg foreignObject'), 'inline math has no document scripts, global CSS or selection overlays');
  assert.ok(!(await page.$eval('[data-qid="snippet-0"] .snippet', el => el.textContent)).includes('$'), 'math delimiters are hidden');
  assert.match(await page.$eval('[data-qid="snippet-2"] .snippet', el => el.textContent), /Inspect \[Image\], then find/);
  assert.match(await page.$eval('[data-qid="snippet-3"] .snippet', el => el.textContent), /Broken sqrt\(x/);
  assert.ok(!(await page.$eval('[data-qid="snippet-4"] .snippet', el => el.textContent)).includes('#text'), 'formatting code stays out of excerpts');
  assert.ok(!(await page.$eval('[data-qid="snippet-5"] .snippet', el => el.textContent)).includes('superseded'), 'structured questions use their stem');
  for (const [id, wording] of [[8, 'Wrapped context:'], [9, 'Wrapped code:'], [10, 'Argument content:'], [11, 'Quoted content:'], [12, 'Inline setup:'], [13, 'Custom wrapper:']]) {
    const excerpt = await page.$eval(`[data-qid="snippet-${id}"] .snippet`, el => el.textContent);
    assert.ok(excerpt.includes(wording), `${wording} appears on the card`);
    assert.ok(!excerpt.includes('Formatted question') && !excerpt.includes('#'), 'formatting wrappers do not hide the question or leak code');
  }
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('math-test-bank-v2'))[0]);
  assert.equal(before.checked, undefined, 'snippets do not validate questions or write to the bank');
  assert.equal(before.updatedAt, undefined);
  await page.click('[data-qid="snippet-9"]');
  await page.waitForSelector('.preview-svg[data-preview-for="snippet-9"]:not(.stale) svg', { timeout: 30000 });
  assert.equal(await page.$('.preview-empty.error'), null, 'the wrapped question still renders in full');
  assert.ok(await page.evaluate(() => window.__snippetRequests.length < 20), 'only nearby equations are compiled');
  assert.equal(await page.$('[data-qid="snippet-99"] .math.rendered'), null, 'offscreen cards wait until needed');

  const originalSvg = await page.$eval('[data-qid="snippet-0"] .math', el => el.innerHTML);
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => document.documentElement.setAttribute('data-theme', theme), theme);
    assert.ok(await page.$eval('[data-qid="snippet-0"] .math', el => {
      const ink = el.querySelector('[fill="currentColor"]');
      return ink && getComputedStyle(ink).fill === getComputedStyle(el).color;
    }), `${theme}: equation ink follows the text colour`);
    assert.equal(await page.$eval('[data-qid="snippet-0"] .math', el => el.innerHTML), originalSvg, 'theme changes reuse the same math SVG');
  }
  await page.click('[data-qid="snippet-0"]');
  await page.waitForSelector('.preview-svg[data-preview-for="snippet-0"] svg', { timeout: 30000 });
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => document.documentElement.setAttribute('data-theme', theme), theme);
    await page.waitForFunction(() => !document.querySelector('.preview-svg')?.classList.contains('stale'));
    if (shotDir) await page.screenshot({ path: `${shotDir}/bank-snippets-desktop-${theme}.png` });
  }

  await page.$eval('.list', el => el.scrollTop = el.scrollHeight);
  await page.waitForSelector('[data-qid="snippet-99"] .math.rendered svg', { timeout: 30000 });
  await page.$eval('.list', el => el.scrollTop = 0);
  await page.waitForSelector('[data-qid="snippet-0"] .math.rendered svg');
  assert.equal(await page.evaluate(() => window.__snippetRequests.filter(source => source.endsWith('$2x^2 - 5x + 3 = 0$')).length), 1, 'repeated equations and revisited cards share the cache');

  if (!desktopOnly) {
    await page.setViewport({ width: 390, height: 844 });
    assert.ok(await page.$eval('[data-qid="snippet-0"] .snippet', el => {
      const r = el.getBoundingClientRect();
      return [...el.querySelectorAll('svg')].every(svg => svg.getBoundingClientRect().right <= r.right + 1);
    }), 'equations fit narrow cards');
    if (shotDir) await page.screenshot({ path: `${shotDir}/bank-snippets-mobile.png` });
  }
  await page.evaluate(async () => {
    const { bank } = await import('/src/lib/bank.svelte.ts');
    bank.update('snippet-0', { body: 'Updated problem $x + 42 = 51$.' });
  });
  await page.waitForSelector('[data-qid="snippet-0"] .math.rendered[aria-label="x + 42 = 51"] svg');
  assert.equal(await page.$('[data-qid="snippet-0"] .math[aria-label="2x^2 - 5x + 3 = 0"]'), null, 'edits replace the old equation');
  assert.deepEqual(errors, []);
  console.log(`Bank snippets browser checks passed: readable prose and math, formatting wrappers, safe excerpts and fallback, lazy rendering, shared cache, themes, edits${desktopOnly ? '' : ', narrow cards'} and full preview.`);
} finally {
  await browser?.close();
  await server.close();
}
