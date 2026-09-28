// Bank variant controls: New variant (random or typed seed), the Variant menu (earlier variants
// and the original), deleting and clearing old variants, and persistence across a reload.
// Synthetic data in an isolated browser profile only.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';

const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 950 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const question = {
    id: 'algo', createdAt: 1, checked: true, points: 1, tags: [], questionType: 'frq',
    body: 'Solve $x + 5 = 12$.', solution: '$x = 7$',
    algorithmModel: {
      scope: { kind: 'question' }, sequence: [], source: 'test',
      definitions: [
        { id: 'a', name: 'a', kind: 'variable', rawExpression: 'range(2,40)', sampleValue: '5', dependencies: [], source: 'test' },
        { id: 'x', name: 'x_ans', kind: 'variable', rawExpression: 'range(3,30)', sampleValue: '7', dependencies: [], source: 'test' },
        { id: 'b', name: 'b', kind: 'variable', rawExpression: 'a+x_ans', sampleValue: '12', dependencies: ['a', 'x_ans'], source: 'test' },
      ],
      slots: [
        { name: 'a', field: 'body', text: '5', occurrence: 0 },
        { name: 'b', field: 'body', text: '12', occurrence: 0 },
        { name: 'x_ans', field: 'solution', text: '7', occurrence: 0 },
      ],
    },
  };
  await page.evaluateOnNewDocument((q) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    const now = Date.now();
    localStorage.setItem('tg-tutorial-done-v1', '1');
    localStorage.setItem('tg-bank-workspaces-v1', JSON.stringify([{ id: 'b', name: 'B', gitRepoId: 'test-generator-bank-b', createdAt: now, updatedAt: now }]));
    localStorage.setItem('tg-active-bank-id-v1', 'b');
    localStorage.setItem('math-test-bank-v2', JSON.stringify([q]));
  }, question);
  await page.goto(`${server.resolvedUrls.local[0]}#/bank`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-qid="algo"]', { timeout: 60000 });
  await page.click('[data-qid="algo"]');
  await page.waitForSelector('.variant-control select');

  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('math-test-bank-v2'))[0]);
  const options = () => page.$$eval('.variant-control option', (els) => els.map((e) => e.textContent.trim()));
  const selected = () => page.$eval('.variant-control select', (el) => el.value);
  const settle = () => new Promise((resolve) => setTimeout(resolve, 300));
  const newVariant = async () => { await page.evaluate(() => [...document.querySelectorAll('.preview-actions button')].find((b) => b.textContent.trim() === 'New variant').click()); await settle(); };
  const choose = async (value) => { await page.select('.variant-control select', value); await settle(); };

  assert.deepEqual(await options(), ['Original (imported values)']);
  assert.equal(await selected(), 'original');
  assert.equal(await page.$eval('.preview-actions', (el) => el.textContent.includes('Random seed')), false, 'one New variant button');

  await newVariant();
  const first = await stored();
  assert.equal(first.algorithmHistory.length, 1);
  assert.notEqual(first.body, question.body);
  assert.equal(await selected(), String(first.algorithmSeed));

  // A typed seed is used (Enter works), then the field clears for the next random variant.
  await page.type('.seed-control input', '12345');
  await page.keyboard.press('Enter');
  await settle();
  const second = await stored();
  assert.equal(second.algorithmSeed, 12345);
  assert.deepEqual(second.algorithmHistory, [first.algorithmSeed, 12345]);
  assert.equal(await page.$eval('.seed-control input', (el) => el.value), '');
  assert.deepEqual(await options(), ['Original (imported values)', `Variant 1 · seed ${first.algorithmSeed}`, 'Variant 2 · seed 12345']);

  // Back to variant 1 exactly, then to the original.
  await choose(String(first.algorithmSeed));
  assert.equal((await stored()).body, first.body);
  assert.equal((await stored()).solution, first.solution);
  await choose('original');
  const original = await stored();
  assert.equal(original.body, question.body);
  assert.equal(original.solution, question.solution);
  assert.equal(original.algorithmSeed, undefined);
  assert.equal(original.algorithmHistory.length, 2, 'showing the original keeps the history');

  // Delete one old variant, then clear the rest.
  await choose('12345');
  await page.evaluate(() => { document.querySelector('.variant-manager').open = true; });
  const deleteButtons = await page.$$eval('.variant-manager li button', (els) => els.map((b) => b.disabled));
  assert.deepEqual(deleteButtons, [false, true], 'the variant being shown can’t be deleted');
  await page.evaluate(() => document.querySelector('.variant-manager li button:not([disabled])').click());
  await settle();
  assert.deepEqual((await stored()).algorithmHistory, [12345]);
  await newVariant();
  await newVariant();
  assert.equal((await stored()).algorithmHistory.length, 3);
  await page.evaluate(() => { document.querySelector('.variant-manager').open = true; });
  await page.evaluate(() => [...document.querySelectorAll('.variant-manager button')].find((b) => b.textContent.trim() === 'Clear old variants').click());
  await settle();
  const cleared = await stored();
  assert.deepEqual(cleared.algorithmHistory, [cleared.algorithmSeed]);

  // The card button makes a random variant too.
  await page.evaluate(() => [...document.querySelectorAll('[data-qid="algo"] button')].find((b) => b.textContent.trim() === 'New variant').click());
  await settle();
  assert.equal((await stored()).algorithmHistory.length, 2);

  // The history survives a reload.
  const before = await stored();
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-qid="algo"]', { timeout: 60000 });
  await page.click('[data-qid="algo"]');
  await page.waitForSelector('.variant-control select');
  assert.equal((await options()).length, 1 + before.algorithmHistory.length);
  assert.equal(await selected(), String(before.algorithmSeed));

  // A graph question: variants redraw the graph; Original points back at the stored picture.
  const graphQuestion = {
    id: 'graph-q', createdAt: 2, checked: true, points: 1, tags: [], questionType: 'frq',
    body: 'Graph of $y = (x - 2)^2$:\n\n#image("/imgs/orig-graph", width: 2in)', images: ['orig-graph'],
    algorithmModel: {
      scope: { kind: 'question' }, sequence: [], source: 'test',
      definitions: [{ id: 'h', name: 'h', kind: 'variable', rawExpression: 'range(-5,5)', sampleValue: '2', dependencies: [], source: 'test' }],
      slots: [{ name: 'h', field: 'body', text: '2', occurrence: 0 }],
      graphs: [{ image: 'orig-graph', graph: { version: 1, settings: { appearance: 'worksheet', tickLabels: 'all', xmin: -9.5, xmax: 9.5, ymin: -9.5, ymax: 9.5, xtick: 1, ytick: 1, grid: true, equal: false, width: 5, height: 5, xlabel: { text: 'x', math: true }, ylabel: { text: 'y', math: true } },
        objects: [{ id: 'f', type: 'function', expression: '(x - h)^2', min: '-inf', max: 'inf', color: '#ff0000', width: 1.4, dashed: false, visible: true }] } }],
    },
  };
  await page.evaluate(async (q) => {
    const { imageStore } = await import('/src/lib/image-store.svelte.ts');
    const { bank } = await import('/src/lib/bank.svelte.ts');
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#ddd"/></svg>';
    await imageStore.put('orig-graph', new TextEncoder().encode(svg), 'svg');
    bank.userQuestions = [...bank.userQuestions, q];
  }, graphQuestion);
  await page.waitForSelector('[data-qid="graph-q"]');
  await page.click('[data-qid="graph-q"]');
  await page.waitForSelector('.variant-control select');
  await newVariant();
  const graphStored = () => page.evaluate(() => JSON.parse(localStorage.getItem('math-test-bank-v2')).find((q) => q.id === 'graph-q'));
  const redrawn = (await graphStored()).body.match(/\/imgs\/([\w-]+)/)[1];
  assert.match(redrawn, /^orig-graph-g[0-9a-f]{8}$/, 'the variant uses a redrawn graph');
  assert.equal(await page.evaluate(async (name) => (await import('/src/lib/image-store.svelte.ts')).imageStore.has(name), redrawn), true);
  await choose('original');
  assert.equal((await graphStored()).body, graphQuestion.body, 'Original points back at the stored picture');

  // A question calculated before seeds were saved: values but no seed.
  await page.evaluate(async () => {
    const { bank } = await import('/src/lib/bank.svelte.ts');
    const q = bank.userQuestions.find((item) => item.id === 'algo');
    bank.update('algo', { algorithmSeed: undefined, algorithmHistory: undefined, algorithmEvaluation: q.algorithmEvaluation ?? { entries: [{ name: 'a', status: 'resolved', value: '9' }], diagnostics: [] } });
  });
  await page.click('[data-qid="graph-q"]');
  await page.click('[data-qid="algo"]');
  await settle();
  assert.equal(await selected(), 'current');
  assert.deepEqual(await options(), ['Current values (seed not recorded)', 'Original (imported values)']);
  await choose('original');
  assert.equal((await stored()).body, question.body);

  assert.deepEqual(errors, []);
  console.log('Bank variant tests passed: New variant (random and typed seed), variant menu, original (text and picture), delete, clear, card button, reload.');
} finally {
  await browser.close();
  await server.close();
}
