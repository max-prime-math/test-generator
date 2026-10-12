import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';

// The U.S.-style courses and the Kuta-style worksheet features: the course picker lists
// Pre-Algebra to Calculus, "Save versions" saves one test per version with new numbers,
// and Build offers "Shuffle order" and a first question number. Synthetic data only.
const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
const url = server.resolvedUrls.local[0];
let browser;
try {
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('tg-tutorial-done-v1', '1');
    localStorage.setItem('tg-generator-experimental-enabled-v1', 'true');
    if (!sessionStorage.getItem('seeded')) {
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('math-test-bank-v2', '[]');
      localStorage.setItem('tg-test-library-v1', '[]');
      localStorage.setItem('tg-generator-plan-v2', JSON.stringify({
        course: 'us-alg1',
        sections: [{ id: 's1', generatorId: 'us-a1-literal', seeds: [1, 2, 3], difficulty: 2, format: 'written', options: {} }],
      }));
    }
  });
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${url}#/generate`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.generator .sheet .card');

  const courses = await page.$$eval('select[aria-label="Course"] option', (os) => os.map((o) => o.textContent.trim()));
  for (const name of ['Pre-Algebra', 'Algebra 1', 'Algebra 2', 'Precalculus', 'Calculus']) assert.ok(courses.includes(name), `course ${name} is listed`);
  // Algebra 1 lists Kuta's chapters, including reused Manitoba generators.
  const groups = await page.$$eval('.generator details summary', (els) => els.map((e) => e.textContent));
  assert.ok(groups.some((g) => g.includes('Linear Equations and Inequalities')));

  // Save 3 versions: three saved tests, each with the worksheet's 3 questions; version A keeps its seeds.
  await page.select('.versions select', '3');
  await page.evaluate(() => [...document.querySelectorAll('.versions button')].find((b) => b.textContent.includes('Save versions')).click());
  await page.waitForFunction(() => /Saved 3 versions/.test(document.querySelector('.generator .notice')?.textContent ?? ''));
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('tg-test-library-v1')));
  assert.equal(saved.length, 3);
  assert.deepEqual(saved.map((t) => t.name.replace(/^.* – /, '')), ['Version A', 'Version B', 'Version C']);
  for (const t of saved) assert.equal(t.config.ownQuestions.length, 3);
  assert.deepEqual(saved[0].config.ownQuestions.map((q) => q.generatorItem.seed), [1, 2, 3]);
  assert.notDeepEqual(saved[1].config.ownQuestions.map((q) => q.generatorItem.seed), [1, 2, 3]);

  // Build: add the worksheet to a new test, then shuffle the order and set the first question number.
  await page.click('.add-to-trigger');
  await page.evaluate(() => [...document.querySelectorAll('.add-to .menu button')].find((b) => b.textContent.includes('New test')).click());
  // Adding a worksheet that reaches the test opens Build.
  await page.waitForSelector('#t-start');
  const draftIds = () => page.evaluate(() => JSON.parse(localStorage.getItem('tg-test-draft-v1') ?? '{}').selectedIds ?? []);
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Shuffle order'));
  const before = await draftIds();
  assert.equal(before.length, 3);
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Shuffle order').click());
  await page.waitForFunction(async (n) => (JSON.parse(localStorage.getItem('tg-test-draft-v1') ?? '{}').selectedIds ?? []).length === n, {}, 3);
  assert.deepEqual([...(await draftIds())].sort(), [...before].sort(), 'shuffling keeps every question');
  await page.$eval('#t-start', (el) => { el.value = '21'; el.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('tg-test-draft-v1') ?? '{}').startNumber === 21);
  assert.deepEqual(errors, []);
  console.log('Versions browser test passed: U.S. courses listed, 3 versions saved, Build shuffle order kept every question, first question number stored.');
} finally {
  await browser?.close();
  await server.close();
}
