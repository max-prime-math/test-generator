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
  await page.evaluateOnNewDocument(() => localStorage.setItem('tg-tutorial-done-v1', '1'));
  await page.goto(`${server.resolvedUrls.local[0]}#/build`, { waitUntil: 'networkidle0' });
  await page.evaluate(async () => {
    const { testEditor } = await import('/src/lib/test-editor.svelte.ts');
    testEditor.config.showAnswerKey = true;
  });
  await page.waitForSelector('#t-answer-key-columns');
  assert.equal(await page.$eval('#t-answer-key-columns', select => select.value), '1');
  await page.select('#t-answer-key-columns', '2');
  await page.click('[aria-label="Keep each solution together"]');
  const result = await page.evaluate(async () => {
    const { testEditor } = await import('/src/lib/test-editor.svelte.ts');
    const { defaultTestConfig } = await import('/src/lib/types.ts');
    const { generateAnswerKeyPage, generateTypst } = await import('/src/lib/typst/template.ts');
    const { compile, queryValues } = await import('/src/lib/typst/compiler.ts');
    const questions = [
      ...Array.from({ length: 24 }, (_, i) => ({ id: `mc-${i}`, body: 'Choose the answer.', choices: { A: 'One', B: 'Two' }, answer: 'A', points: 1, tags: [], createdAt: 1 })),
      ...Array.from({ length: 12 }, (_, i) => ({ id: `fr-${i}`, body: 'Explain your reasoning.', solution: `#context [#metadata((label: "fr-${i}", x: here().position().x / 1pt, page: here().page()))<key-solution>] ` + 'This solution explains each step in the calculation. '.repeat(15) + `\n#parbreak()\n#context [#metadata((label: "fr-${i}", x: here().position().x / 1pt, page: here().page()))<key-solution-end>]`, points: 2, tags: [], createdAt: 1 })),
    ];
    const config = { ...defaultTestConfig(), answerSpace: 0, showAnswerKey: true, answerKeyColumns: testEditor.config.answerKeyColumns };
    const key = generateAnswerKeyPage(config, questions);
    const positions = questions.slice(0, 24).map((question, i) => ({ num: String(i + 1), ans: 'A', page: 1, y: 100 + i * 10 }));
    const stripKey = generateAnswerKeyPage({ ...config, answerStrip: true }, questions, [], positions);
    const combined = generateTypst(config, questions);
    const compiled = [];
    for (const source of [key, stripKey, combined]) {
      const pdf = await compile(source);
      if (pdf.error) throw new Error(pdf.error);
      compiled.push({ error: pdf.error, size: pdf.pdfUrl ? (await (await fetch(pdf.pdfUrl)).arrayBuffer()).byteLength : 0 });
      if (pdf.pdfUrl) URL.revokeObjectURL(pdf.pdfUrl);
    }
    const two = await queryValues(key, '<key-solution>');
    const oneSource = generateAnswerKeyPage({ ...config, answerKeyColumns: 1 }, questions);
    const one = await queryValues(oneSource, '<key-solution>');
    const keepConfig = { ...config, keepSolutionsTogether: testEditor.config.keepSolutionsTogether };
    const keptSource = generateAnswerKeyPage(keepConfig, questions);
    const keptStarts = await queryValues(keptSource, '<key-solution>');
    const keptEnds = await queryValues(keptSource, '<key-solution-end>');
    const oneKeptSource = generateAnswerKeyPage({ ...keepConfig, answerKeyColumns: 1 }, questions);
    const oneKeptStarts = await queryValues(oneKeptSource, '<key-solution>');
    const oneKeptEnds = await queryValues(oneKeptSource, '<key-solution-end>');
    const oversized = { ...questions.at(-1), solution: questions.at(-1).solution.replace('This solution explains each step in the calculation. '.repeat(15), 'This solution explains each step in the calculation. '.repeat(250)) };
    const oversizedSource = generateAnswerKeyPage(keepConfig, [oversized]);
    const oversizedStarts = await queryValues(oversizedSource, '<key-solution>');
    const oversizedEnds = await queryValues(oversizedSource, '<key-solution-end>');
    testEditor.checkpoint();
    return { keptSource, keptStarts, keptEnds, oneKeptStarts, oneKeptEnds, oversizedStarts, oversizedEnds, columns: config.answerKeyColumns, key, stripKey, oneSource, compiled, one, two };
  });
  assert.equal(result.columns, 2);
  assert.match(result.key, /#columns\(2, gutter: 1.5em\)/);
  assert.doesNotMatch(result.oneSource, /#columns\(2,/);
  assert.match(result.key, /max-columns: 3/);
  for (const pdf of result.compiled) { assert.equal(pdf.error, undefined); assert.ok(pdf.size > 1000); }
  assert.equal(result.two.length, 12, 'all solutions render');
  assert.equal(result.one.length, 12);
  assert.ok(Math.max(...result.two.map(item => item.x)) - Math.min(...result.two.map(item => item.x)) > 150, 'solutions flow into both columns');
  assert.ok(Math.max(...result.one.map(item => item.x)) - Math.min(...result.one.map(item => item.x)) < 50, 'one-column layout remains the default');
  assert.match(result.keptSource, /breakable: oversized/);
  for (const [starts, ends, columns] of [[result.keptStarts, result.keptEnds, 2], [result.oneKeptStarts, result.oneKeptEnds, 1]]) {
    assert.equal(starts.length, 12); assert.equal(ends.length, 12);
    for (const start of starts) {
      const end = ends.find(item => item.label === start.label);
      assert.equal(end.page, start.page, `solution ${start.label} stays on one page`);
      if (columns === 2) assert.equal(end.x > 300, start.x > 300, `solution ${start.label} stays in one column`);
    }
  }
  assert.ok(result.oversizedEnds[0].page > result.oversizedStarts[0].page, 'oversized solution can continue rather than being clipped');
  assert.match(result.stripKey, /\]\n\n#pagebreak\(\)\n#context tg-answer-strip/, 'answer strip stays outside columns');
  await page.reload({ waitUntil: 'networkidle0' });
  assert.equal(await page.$eval('#t-answer-key-columns', select => select.value), '2', 'draft keeps the selected layout');
  assert.equal(await page.$eval('[aria-label="Keep each solution together"]', input => input.checked), true);
  console.log('Answer key columns and keeping solutions together passed: Build toggle, draft persistence, real PDF compilation, both columns, and full-width answer strip.');
} finally { await browser?.close(); await server.close(); }
