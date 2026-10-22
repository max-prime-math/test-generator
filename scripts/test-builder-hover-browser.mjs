// Cached popups must stay responsive beside a complex full-test SVG, without
// sharing its glyph IDs/styles. Synthetic questions in an isolated browser only.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';

const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
server.middlewares.use('/hover-test.html', (_request, response) => {
  response.setHeader('Content-Type', 'text/html');
  response.end('<!doctype html><title>Cached hover regression</title>');
});
await server.listen();
let browser;
try {
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 950 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.evaluateOnNewDocument(() => {
    window.__compileRequests = 0;
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (data, ...rest) {
      if (data?.kind === 'svg') window.__compileRequests++;
      return post.call(this, data, ...rest);
    };
  });
  const base = server.resolvedUrls.local[0];
  await page.goto(`${base}hover-test.html`);
  await page.evaluate(async () => {
    localStorage.setItem('tg-tutorial-done-v1', '1');
    localStorage.setItem('theme', 'dark');
    const questions = Array.from({ length: 240 }, (_, i) => ({
      id: `q${i}`, body: `Fixture ${i}: Solve $frac(x^2 + ${i}, sqrt(x + 1)) = 2$ and explain each step.\n\nEvaluate $integral_0^1 (x^2 + 3x + ${i}) dif x$.` + (i === 1 ? '\n#image("/imgs/triangle", width: 3cm)' : ''),
      points: 2, tags: [], checked: true, createdAt: 1,
    }));
    localStorage.setItem('math-test-bank-v2', JSON.stringify(questions));
    const { defaultTestConfig } = await import('/src/lib/types.ts');
    localStorage.setItem('tg-test-draft-v1', JSON.stringify({
      ...defaultTestConfig('Complex test'), selectedIds: questions.map(q => q.id), answerSpace: 1,
      showAnswerKey: true, mcqFullSolutions: true,
    }));
    const { imageStore } = await import('/src/lib/image-store.svelte.ts');
    await imageStore.init();
    await imageStore.put('triangle', new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="60" height="40"><path d="M5 35L30 5L55 35Z" fill="none" stroke="red" stroke-width="2"/></svg>'), 'svg');
  });
  await page.goto(`${base}#/build`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.preview .svg-scroll:not(.stale) svg', { timeout: 60000 });
  await page.click('#picker-tab-selected');
  const enter = index => page.evaluate(index => document.querySelectorAll('.sel-item')[index].dispatchEvent(new MouseEvent('mouseenter')), index);
  const leave = async () => {
    await page.evaluate(() => document.querySelector('.picker-panel').dispatchEvent(new MouseEvent('mouseleave')));
    await page.waitForFunction(() => !document.querySelector('.hover-preview'));
  };
  for (const index of [0, 1]) {
    await enter(index);
    await page.waitForSelector('.hover-svg >>> svg', { timeout: 30000 });
    await leave();
  }
  const documentBefore = await page.$eval('.preview .svg-scroll svg', svg => svg.outerHTML);
  const requestsBefore = await page.evaluate(() => window.__compileRequests);
  const times = await page.evaluate(async () => {
    const result = [];
    for (let i = 0; i < 8; i++) {
      const start = performance.now();
      document.querySelectorAll('.sel-item')[i % 2].dispatchEvent(new MouseEvent('mouseenter'));
      await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
      result.push(performance.now() - start);
      document.querySelector('.picker-panel').dispatchEvent(new MouseEvent('mouseleave'));
      await new Promise(resolve => setTimeout(resolve, 120));
    }
    return result;
  });
  assert.equal(await page.evaluate(() => window.__compileRequests), requestsBefore, 'repeated popups use cached output');
  const median = [...times].sort((a, b) => a - b)[Math.floor(times.length / 2)];
  assert.ok(median < 120, `cached popups took ${median.toFixed(0)} ms beside the complex test (expected below 120 ms)`);
  assert.equal(await page.$eval('.preview .svg-scroll svg', svg => svg.outerHTML), documentBefore, 'popup rendering leaves the test document intact');

  await enter(1);
  await page.waitForSelector('.hover-svg >>> svg image');
  const popup = await page.$eval('.hover-svg', host => {
    const svg = host.shadowRoot.querySelector('svg');
    const image = svg.querySelector('image');
    const filter = image.getAttribute('filter')?.match(/#([^)]*)/)?.[1];
    return {
      visible: svg.getBoundingClientRect().width > 300 && svg.getBoundingClientRect().height > 50,
      localDrawing: [...svg.querySelectorAll('use')].some(use => {
        const id = use.getAttribute('href') ?? use.getAttribute('xlink:href');
        return id?.startsWith('#') && host.shadowRoot.getElementById(id.slice(1));
      }),
      themedImage: !!filter && !!host.shadowRoot.getElementById(filter),
      noLeakedSvg: host.querySelector('svg') === null,
    };
  });
  assert.deepEqual(popup, { visible: true, localDrawing: true, themedImage: true, noLeakedSvg: true });
  await page.screenshot({ path: '/tmp/test-generator-cached-hover-fixed.png' });
  assert.deepEqual(errors, []);
  console.log(`Cached hover regression passed: 240 math questions, cached paint median ${median.toFixed(1)} ms; isolated math/diagram references, dark image theme, and full-test content preserved.`);
} finally {
  await browser?.close();
  await server.close();
}
