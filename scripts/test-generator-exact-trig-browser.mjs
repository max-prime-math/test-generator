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
  await page.setViewport({ width: 1440, height: 1000 });
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('tg-tutorial-done-v1', '1');
    localStorage.setItem('tg-generator-experimental-enabled-v1', 'true');
  });
  await page.goto(`${server.resolvedUrls.local[0]}#/generate`, { waitUntil: 'networkidle0' });
  // Compile every declared option, each level, both answer formats; include all new exam examples and solution steps.
  const render = await page.evaluate(async () => {
    const { EXACT_TRIG_GENERATORS } = await import('/src/lib/generator/generators/pc40s/exact-trig.ts');
    const { toQuestion } = await import('/src/lib/generator/registry.ts');
    const { formatBody } = await import('/src/lib/question-format.ts');
    const { compileSvg } = await import('/src/lib/typst/compiler.ts');
    const { autoImports } = await import('/src/lib/typst/auto-imports.ts');
    const failures = [], sources = [];
    for (const generator of EXACT_TRIG_GENERATORS) {
      const cases = [{}, ...generator.options.flatMap(spec => spec.choices.map(choice => ({ [spec.id]: choice.value })))];
      for (const difficulty of [1, 2, 3]) for (const options of cases) for (const format of ['written', 'mcq']) {
        const q = toQuestion({ generatorId: generator.id, difficulty, seed: 2000 + difficulty, options }, format);
        const content = `${q.choices ? formatBody(q.body, q.choices) : q.body}\n\n${q.solution}`;
        const out = await compileSvg(`${autoImports(content)}#set page(width: 18cm, height: auto, margin: 1cm)\n${content}`);
        if (out.error || !out.svg) failures.push(`${generator.id} L${difficulty} ${JSON.stringify(options)} ${format}: ${out.error ?? 'no SVG'}`);
        sources.push(q);
      }
    }
    return { failures, count: sources.length };
  });
  assert.deepEqual(render.failures, []);
  const rendered = (selector, n) => page.waitForFunction((s, k) => document.querySelectorAll(`${s} .svg svg`).length === k && !document.querySelector(`${s} pre`), { timeout: 60000 }, selector, n);
  const cardButton = label => page.evaluate(l => [...document.querySelectorAll('.type-card button')].find(b => b.textContent.trim() === l).click(), label);
  const open = async title => {
    await page.evaluate(t => [...document.querySelectorAll('.generator .type')].find(b => b.querySelector('.gen-title').textContent === t).click(), title);
    await page.waitForSelector('.type-card');
    await page.$eval('.type-card .count input', el => { el.value = '1'; el.dispatchEvent(new Event('change', { bubbles: true })); });
    await rendered('.type-card .samples .card', 1);
  };
  const option = async (group, label) => {
    await page.evaluate((g, l) => [...document.querySelector(`[aria-label="${g}"]`).querySelectorAll('label')].find(el => el.textContent.trim() === l).querySelector('input').click(), group, label);
    await rendered('.type-card .samples .card', 1);
  };
  await page.select('.generator .rail-controls select', 'mb-40s');
  await open('Evaluate compound exact trigonometric expressions');
  await option('Exam example', 'June 2026 · Q25');
  assert.ok(await page.$$eval('.type-card .option.inactive input', inputs => inputs.length > 0 && inputs.every(input => input.disabled)), 'fixed references disable practice settings');
  await option('Exam example', 'Practice variants');
  assert.equal(await page.$$eval('.type-card .option.inactive input', inputs => inputs.length), 0, 'practice settings become available again');
  await option('Exam example', 'June 2026 · Q25');
  await cardButton('Add 1');
  await page.waitForFunction(() => !document.querySelector('.type-card'));
  await rendered('.generator .sheet .card', 1);
  await open('Exact sum and difference ratios from two given ratios and quadrants');
  await option('Exam example', 'June 2025 · Q35');
  await page.screenshot({ path: '/tmp/testgen-exact-two-angle-card.png' });
  await cardButton('Add 1');
  await page.waitForFunction(() => !document.querySelector('.type-card'));
  await rendered('.generator .sheet .card', 2);
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('tg-generator-plan-v2')));
  assert.deepEqual(before.sections.map(s => s.options.example), ['2026-jun-q25', '2025-jun-q35']);
  await page.reload({ waitUntil: 'networkidle0' });
  await rendered('.generator .sheet .card', 2);
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('tg-generator-plan-v2'))), before, 'new family settings and seeds persist across reload');
  await page.screenshot({ path: '/tmp/testgen-exact-trig-worksheet.png' });
  await page.click('.generator .bar .add-to-trigger');
  await page.evaluate(() => [...document.querySelectorAll('.generator .bar [role="menuitem"]')].find(b => b.textContent.includes('New test')).click());
  await page.waitForFunction(() => location.hash === '#/build' && document.querySelectorAll('.selected-list .sel-item').length === 2);
  const draft = await page.evaluate(() => JSON.parse(localStorage.getItem('tg-test-draft-v1')));
  const [compound, twoAngle] = draft.ownQuestions;
  assert.match(compound.solution, /\*Answer:\* \$0\$/);
  assert.match(twoAngle.body, /a\).*cos\(alpha \+ beta\)/s);
  assert.match(twoAngle.body, /b\).*sec\(alpha \+ beta\)/s);
  assert.match(twoAngle.solution, /48 \+ 5sqrt\(33\)/);
  assert.match(twoAngle.solution, /4368 - 455sqrt\(33\)/);
  assert.equal(twoAngle.generatorItem.options.example, '2025-jun-q35');
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('math-test-bank-v2') ?? '[]')), []);
  assert.deepEqual(errors, []);
  console.log(`Exact trig browser checks passed: ${render.count} compiled questions/solutions, both settings cards, exam examples, worksheet reload and transfer to Build.`);
} finally { await browser?.close(); await server.close(); }
