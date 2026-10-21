import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';

const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
let browser;
try {
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 950 });
  await page.evaluateOnNewDocument(() => localStorage.setItem('tg-tutorial-done-v1', '1'));
  await page.goto(`${server.resolvedUrls.local[0]}#/build`, { waitUntil: 'networkidle0' });

  assert.equal(await page.$eval('#t-page-columns', (select) => select.value), '1');
  assert.equal(await page.$eval('#t-orientation', (select) => select.value), 'portrait');
  assert.equal(await page.$('[aria-label="Vertical rule between test columns"]'), null);

  await page.select('#t-page-columns', '2');
  await page.select('#t-orientation', 'landscape');
  await page.waitForSelector('[aria-label="Vertical rule between test columns"]');
  await page.click('[aria-label="Vertical rule between test columns"]');

  const result = await page.evaluate(async () => {
    const { testEditor } = await import('/src/lib/test-editor.svelte.ts');
    const { defaultTestConfig } = await import('/src/lib/types.ts');
    const { generateAnswerKeyPage, generateIndividual, generateTypst } = await import('/src/lib/typst/template.ts');
    const { compile, compileSvg, queryValues } = await import('/src/lib/typst/compiler.ts');
    const questions = Array.from({ length: 18 }, (_, i) => ({
      id: `mc-${i}`,
      body: `Choose the correct value. #context [#metadata((label: "q-${i}", x: here().position().x / 1pt, page: here().page()))<layout-question>]`,
      choices: { A: '$1$', B: '$2$', C: '$3$', D: '$4$' },
      answer: 'A',
      points: 1,
      tags: [],
      createdAt: 1,
    }));
    const config = {
      ...defaultTestConfig('Page Layout'),
      pageColumns: testEditor.config.pageColumns,
      orientation: testEditor.config.orientation,
      columnRule: testEditor.config.columnRule,
      answerSpace: 0.25,
      showAnswerKey: true,
    };
    const source = generateTypst(config, questions);
    const keySource = generateAnswerKeyPage(config, questions);
    const individualSource = generateIndividual(config, questions.slice(0, 1))[0];
    const darkPreview = await compileSvg(`#set page(fill: rgb("1c1c1e"))\n#set text(fill: rgb("f5f5f7"))\n${source}`);
    if (darkPreview.error) throw new Error(darkPreview.error);
    const compiled = await compile(source);
    if (compiled.error) throw new Error(compiled.error);
    const size = compiled.pdfUrl ? (await (await fetch(compiled.pdfUrl)).arrayBuffer()).byteLength : 0;
    if (compiled.pdfUrl) URL.revokeObjectURL(compiled.pdfUrl);
    const positions = await queryValues(source, '<layout-question>');
    // Three short questions with explicit breaks must occupy consecutive columns,
    // including the transition from the right column to the next page's left column.
    const breakLayouts = [];
    for (const orientation of ['portrait', 'landscape']) {
      for (const pageColumns of [1, 2]) {
        const breakSource = generateTypst({
          ...config,
          orientation,
          pageColumns,
          answerSpace: 0,
          showAnswerKey: false,
          pageBreakAfter: { 'mc-0': { pagebreak: true, vfill: true }, 'mc-1': { pagebreak: true } },
        }, questions.slice(0, 3));
        breakLayouts.push({ orientation, pageColumns, positions: await queryValues(breakSource, '<layout-question>') });
      }
    }
    // Measure the actual typeset equation position, including inside answer-key columns.
    const marker = (label) => `#context [#metadata((x: here().position().x / 1pt))<${label}>]`;
    const mathQuestion = {
      id: 'math-indent',
      body: `#block[${marker('math-text')}Solve the equation.]\n\n$ ${marker('math-equation')} x^2 + 2 x + 1 = 0 $`,
      solution: `#block[${marker('math-text')}Factor the expression.]\n\n$ ${marker('math-equation')} (x + 1)^2 = 0 $`,
      points: 1, tags: [], createdAt: 1,
    };
    const mathLayouts = [];
    for (const orientation of ['portrait', 'landscape']) {
      for (const pageColumns of [1, 2]) {
        const mathConfig = { ...config, orientation, pageColumns, answerKeyColumns: pageColumns, showAnswerKey: false };
        for (const [kind, mathSource] of [
          ['test', generateTypst(mathConfig, [mathQuestion])],
          ['key', generateAnswerKeyPage(mathConfig, [mathQuestion])],
        ]) {
          const [text] = await queryValues(mathSource, '<math-text>');
          const [equation] = await queryValues(mathSource, '<math-equation>');
          if (!text || !equation) throw new Error(`${orientation} ${pageColumns}-column ${kind}: equation failed to render`);
          mathLayouts.push({ orientation, pageColumns, kind, indent: equation.x - text.x });
        }
      }
    }
    testEditor.checkpoint();
    return {
      breakLayouts,
      mathLayouts,
      config: {
        pageColumns: testEditor.config.pageColumns,
        orientation: testEditor.config.orientation,
        columnRule: testEditor.config.columnRule,
      },
      individualSource,
      darkSvg: darkPreview.svg,
      keySource,
      positions,
      size,
      source,
    };
  });

  assert.deepEqual(result.config, { pageColumns: 2, orientation: 'landscape', columnRule: true });
  assert.match(result.source, /flipped: true/);
  assert.match(result.source, /background: context layout/);
  assert.match(result.source, /line\(length: size\.height - 1in, angle: 90deg/);
  assert.match(result.source, /#columns\(2, gutter: 0\.35in\)/);
  assert.match(result.source, /#grid\(columns: \(1fr, 1fr\), column-gutter: 1\.5em/);
  assert.doesNotMatch(result.source, /#grid\(columns: \(1fr, 1fr, 1fr, 1fr\), column-gutter: 1\.5em/);
  assert.match(result.source, /#pagebreak\(\)\n#set page\(background: none\)\n\*Answer Key\*/);
  assert.match(result.keySource, /flipped: true/);
  assert.doesNotMatch(result.keySource, /background: context layout/);
  assert.match(result.individualSource, /flipped: true/);
  assert.doesNotMatch(result.individualSource, /background: context layout|#columns\(2,/);
  assert.ok(result.darkSvg, 'dark preview compiles');
  assert.match(result.darkSvg, /#1c1c1e/i, 'preview uses the dark page colour');
  assert.match(result.darkSvg, /#f5f5f7/i, 'preview uses contrasting light text');
  assert.doesNotMatch(result.darkSvg, /fill=["'](?:#fff(?:fff)?|white)["']/i, 'header mask must not leave white behind light title text');
  assert.ok(result.size > 1000, 'landscape two-column source compiles into a PDF');
  assert.equal(result.positions.length, 18, 'all MCQs render');
  assert.ok(Math.max(...result.positions.map((item) => item.x)) - Math.min(...result.positions.map((item) => item.x)) > 200, 'questions flow into both page columns');
  for (const { orientation, pageColumns, positions } of result.breakLayouts) {
    assert.equal(positions.length, 3, `${orientation}: all questions with explicit breaks render`);
    const [first, second, third] = positions;
    assert.equal(first.page, 1);
    if (pageColumns === 2) {
      assert.equal(second.page, first.page, `${orientation}: first break advances to the right column on the same page`);
      assert.ok(second.x - first.x > 150, `${orientation}: second question starts in the right column`);
      assert.equal(third.page, first.page + 1, `${orientation}: second break advances to the next page`);
      assert.ok(Math.abs(third.x - first.x) < 1, `${orientation}: third question starts in the left column`);
    } else {
      assert.equal(second.page, first.page + 1, `${orientation}: one-column mode keeps page breaks`);
      assert.equal(third.page, first.page + 2);
    }
  }
  for (const { orientation, pageColumns, kind, indent } of result.mathLayouts) {
    if (pageColumns === 2) {
      assert.ok(indent >= 0 && indent < 12, `${orientation} ${kind}: equation keeps a small column inset, got ${indent}pt`);
    } else {
      assert.ok(Math.abs(indent - 72) < 1, `${orientation} ${kind}: wide layout retains the one-inch indent, got ${indent}pt`);
    }
  }

  await page.reload({ waitUntil: 'networkidle0' });
  assert.equal(await page.$eval('#t-page-columns', (select) => select.value), '2', 'draft keeps the column layout');
  assert.equal(await page.$eval('#t-orientation', (select) => select.value), 'landscape', 'draft keeps the orientation');
  assert.equal(await page.$eval('[aria-label="Vertical rule between test columns"]', (input) => input.checked), true, 'draft keeps the divider');

  await page.select('#t-page-columns', '1');
  await page.waitForFunction(() => !document.querySelector('[aria-label="Vertical rule between test columns"]'));
  assert.equal(await page.evaluate(async () => (await import('/src/lib/test-editor.svelte.ts')).testEditor.config.columnRule), false, 'one-column mode clears the unused divider');

  console.log('Page layout passed: Build controls, persistence, landscape output, responsive MCQs, two-column flow, and optional divider.');
} finally {
  await browser?.close();
  await server.close();
}
