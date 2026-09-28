// The Bank's Algorithmic filter shows only questions with New variant, and combines with
// the type filter and class tabs. Synthetic data in an isolated browser profile only.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';

const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 950 });
  const def = { id: 'alg-1', name: 'a', kind: 'variable', rawExpression: 'range(1,9)', sampleValue: '2', dependencies: [], source: 't' };
  const q = (id, algo, mcq, cls) => ({ id, createdAt: 1, checked: true, points: 1, tags: [], classId: cls, questionType: mcq ? 'mcq' : 'frq',
    body: `Question ${id}`, ...(mcq ? { choices: { A: '1', B: '2' }, answer: 'A' } : {}), ...(algo ? { algorithmModel: { definitions: [def] } } : {}) });
  const questions = [q('a1', true, true, 'c1'), q('a2', true, false, 'c1'), q('a3', true, false, 'c2'), q('p1', false, true, 'c1'), q('p2', false, false, 'c2')];
  await page.evaluateOnNewDocument((qs) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    const now = Date.now();
    localStorage.setItem('tg-tutorial-done-v1', '1');
    localStorage.setItem('tg-bank-workspaces-v1', JSON.stringify([{ id: 'b', name: 'B', gitRepoId: 'test-generator-bank-b', createdAt: now, updatedAt: now }]));
    localStorage.setItem('tg-active-bank-id-v1', 'b');
    localStorage.setItem('math-test-bank-v2', JSON.stringify(qs));
    localStorage.setItem('math-test-custom-classes-v1', JSON.stringify([{ id: 'c1', name: 'Class One', units: [] }, { id: 'c2', name: 'Class Two', units: [] }]));
  }, questions);
  await page.goto(`${server.resolvedUrls.local[0]}#/bank`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-qid="p2"]', { timeout: 60000 });
  const ids = () => page.$$eval('[data-qid]', (els) => els.map((e) => e.dataset.qid).filter((id) => /^[ap]\d$/.test(id)).sort().join(','));
  const click = (text) => page.evaluate((text) => [...document.querySelectorAll('.type-tabs button, .class-tabs button, button')].find((b) => b.textContent.trim() === text).click(), text);
  const settle = () => new Promise((r) => setTimeout(r, 300));
  assert.equal(await ids(), 'a1,a2,a3,p1,p2');
  await click('Algorithmic'); await settle();
  assert.equal(await ids(), 'a1,a2,a3', 'Algorithmic shows only algorithmic questions');
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('.type-tabs button')].find((b) => b.textContent.trim() === 'Algorithmic').classList.contains('active')), true);
  await click('MCQ'); await settle();
  assert.equal(await ids(), 'a1', 'combines with MCQ');
  await click('All Types'); await settle();
  await page.click('button[title="Show only Class Two"]'); await settle();
  assert.equal(await ids(), 'a3', 'combines with a class tab');
  await page.click('button[title="Show all classes"]'); await settle();
  await click('Algorithmic'); await settle();
  assert.equal(await ids(), 'a1,a2,a3,p1,p2', 'toggling off shows everything again');
  console.log('Algorithmic filter: all checks passed');
} finally { await browser.close(); await server.close(); }
