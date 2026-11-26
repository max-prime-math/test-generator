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
  assert.equal(await page.$eval('#t-mcq-choice-columns', (select) => select.value), 'auto');
  await page.select('#t-mcq-choice-columns', '3');
  assert.equal(await page.$eval('#t-orientation', (select) => select.value), 'portrait');
  assert.equal(await page.$('[aria-label="Vertical rule between test columns"]'), null);

  await page.select('#t-page-columns', '2');
  await page.select('#t-orientation', 'landscape');
  await page.waitForSelector('[aria-label="Vertical rule between test columns"]');
  await page.click('[aria-label="Vertical rule between test columns"]');
  for (const selector of ['#t-keep-questions-together', '#t-answer-space-fill']) {
    assert.equal(await page.$eval(selector, input => input.checked), false);
    await page.focus(selector);
    await page.keyboard.press('Space');
    assert.equal(await page.$eval(selector, input => input.checked), true);
    await page.click('button[aria-label="Undo"]');
    assert.equal(await page.$eval(selector, input => input.checked), false);
    await page.click('button[aria-label="Redo"]');
    assert.equal(await page.$eval(selector, input => input.checked), true);
  }
  assert.equal(await page.$eval('#t-space', input => input.disabled), true);

  const result = await page.evaluate(async () => {
    const { testEditor } = await import('/src/lib/test-editor.svelte.ts');
    const { defaultTestConfig } = await import('/src/lib/types.ts');
    const { generateAnswerKeyPage, generateIndividual, generateTypst, generateVersionedAnswerKeyPage } = await import('/src/lib/typst/template.ts');
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
      subtitle: 'Test 4',
      pageColumns: testEditor.config.pageColumns,
      orientation: testEditor.config.orientation,
      columnRule: testEditor.config.columnRule,
      mcqChoiceColumns: testEditor.config.mcqChoiceColumns,
      answerSpace: 0.25,
      showAnswerKey: true,
    };
    const source = generateTypst(config, questions);
    const keySource = generateAnswerKeyPage(config, questions);
    const versionedKeySource = generateVersionedAnswerKeyPage([{ label: 'A', config }, { label: 'B', config }], questions);
    const individualSource = generateIndividual(config, questions.slice(0, 1))[0];
    const darkPreview = await compileSvg(`#set page(fill: rgb("1c1c1e"))\n#set text(fill: rgb("f5f5f7"))\n${source}`);
    if (darkPreview.error) throw new Error(darkPreview.error);
    const compiled = await compile(source);
    if (compiled.error) throw new Error(compiled.error);
    const size = compiled.pdfUrl ? (await (await fetch(compiled.pdfUrl)).arrayBuffer()).byteLength : 0;
    if (compiled.pdfUrl) URL.revokeObjectURL(compiled.pdfUrl);
    const positions = await queryValues(source, '<layout-question>');
    const testQuestion = (id, body) => ({ id, body, points: 1, tags: [], createdAt: 1 });
    const positionMarker = (id) => `#context [#metadata((id: "${id}", x: here().position().x / 1pt, y: here().position().y / 1pt, page: here().page()))<question-position>]`;
    const readPositions = async (source) => Object.fromEntries(
      (await queryValues(source, '<question-position>')).map(({ id, ...position }) => [id, position]),
    );
    const keepLayouts = [];
    for (const orientation of ['portrait', 'landscape']) {
      for (const pageColumns of [1, 2]) {
        const layoutConfig = { ...config, orientation, pageColumns, answerSpace: 0, showAnswerKey: false };
        const lines = orientation === 'portrait' ? 22 : 15;
        const longBody = (label, count) => `${positionMarker(`${label}-start`)}Begin.\n\n${'Show your work.\n\n'.repeat(count)}${positionMarker(`${label}-end`)}End.`;
        const fitting = [testQuestion('first', longBody('first', lines)), testQuestion('next', longBody('next', lines))];
        const split = await readPositions(generateTypst(layoutConfig, fitting));
        const keepConfig = { ...layoutConfig, keepQuestionsTogether: testEditor.config.keepQuestionsTogether };
        const kept = await readPositions(generateTypst(keepConfig, fitting));
        const oversized = await readPositions(generateTypst(keepConfig, [testQuestion('too-tall', longBody('too-tall', 90))]));
        keepLayouts.push({ pageColumns, split, kept, oversized });
      }
    }
    const fillSource = generateTypst({
      ...config, answerSpace: 4, answerSpaceFill: testEditor.config.answerSpaceFill,
      keepQuestionsTogether: testEditor.config.keepQuestionsTogether, showAnswerKey: false,
      answerSpaceOverrides: { fixed: 4 },
      pageBreakAfter: { fixed: { pagebreak: true } },
    }, ['a', 'b', 'fixed', 'next-column'].map(id => testQuestion(id, `${positionMarker(id)}Show your work.`)));
    const fillPositions = await readPositions(fillSource);
    const fillPreview = await compileSvg(fillSource);
    if (fillPreview.error) throw new Error(fillPreview.error);
    const fillPdf = await compile(fillSource);
    if (fillPdf.error) throw new Error(fillPdf.error);
    if (fillPdf.pdfUrl) URL.revokeObjectURL(fillPdf.pdfUrl);
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
      keepLayouts,
      fillPositions,
      fillSource,
      mathLayouts,
      config: {
        pageColumns: testEditor.config.pageColumns,
        orientation: testEditor.config.orientation,
        columnRule: testEditor.config.columnRule,
      },
      individualSource,
      darkSvg: darkPreview.svg,
      keySource,
      versionedKeySource,
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
  assert.match(result.source, /#pagebreak\(\)\n#set page\(background: none\)\n#strong\("Page Layout: Test 4 — Answer Key"\)/);
  assert.match(result.keySource, /#strong\("Page Layout: Test 4 — Answer Key"\)/);
  assert.match(result.versionedKeySource, /#strong\("Page Layout: Test 4 — Answer Key"\)/);
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
  for (const { pageColumns, split, kept, oversized } of result.keepLayouts) {
    const sameRegion = (a, b) => a.page === b.page && Math.abs(a.x - b.x) < 60;
    assert.ok(!sameRegion(split['next-start'], split['next-end']), 'the fixture splits when keep-together is off');
    assert.ok(sameRegion(kept['next-start'], kept['next-end']), 'a fitting question stays in one region');
    assert.ok(!sameRegion(kept['first-start'], kept['next-start']), 'the fitting question moves to the next region');
    assert.equal(kept['next-start'].page, pageColumns === 1 ? 2 : 1);
    assert.ok(oversized['too-tall-end'].page > oversized['too-tall-start'].page, 'an oversized question can continue');
  }
  const { a, b, fixed, 'next-column': nextColumn } = result.fillPositions;
  assert.ok(b.y - a.y > 100, 'flexible space expands after the first question');
  assert.ok(Math.abs((b.y - a.y) - (fixed.y - b.y)) < 1, 'flexible spaces share the remaining height evenly');
  assert.equal(nextColumn.page, a.page);
  assert.ok(nextColumn.x - fixed.x > 150, 'an explicit break still advances to the next column');
  assert.match(result.fillSource, /#v\(4cm\)\n\]\n\n#colbreak\(\)/, 'the fixed override keeps its length even when it equals the old default');
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
  assert.equal(await page.$eval('#t-mcq-choice-columns', (select) => select.value), '3', 'draft keeps the MCQ layout target');
  assert.equal(await page.$eval('#t-orientation', (select) => select.value), 'landscape', 'draft keeps the orientation');
  assert.equal(await page.$eval('[aria-label="Vertical rule between test columns"]', (input) => input.checked), true, 'draft keeps the divider');
  assert.equal(await page.$eval('#t-keep-questions-together', input => input.checked), true, 'draft keeps question grouping');
  assert.equal(await page.$eval('#t-answer-space-fill', input => input.checked), true, 'draft keeps flexible answer space');

  await page.select('#t-page-columns', '1');
  await page.waitForFunction(() => !document.querySelector('[aria-label="Vertical rule between test columns"]'));
  assert.equal(await page.evaluate(async () => (await import('/src/lib/test-editor.svelte.ts')).testEditor.config.columnRule), false, 'one-column mode clears the unused divider');

  await page.evaluate(async () => {
    const { testEditor } = await import('/src/lib/test-editor.svelte.ts');
    const questions = ['first-mcq', 'second-mcq', 'written'].map((id, index) => ({
      id, body: `Question ${index + 1}`, points: 1, tags: [], createdAt: 1,
      choices: index === 2 ? undefined : Object.fromEntries(['A', 'B', 'C', 'D'].map((letter, i) => [
        letter, `#context [#metadata((id: "${id}-${letter}", x: here().position().x / 1pt))<choice-position>] $${i + 1}$`,
      ])),
    }));
    testEditor.addQuestions(questions.map(q => q.id), questions);
  });
  await page.click('#picker-tab-selected');
  const firstChoices = '[data-display-question-id="first-mcq"] .sel-choice-columns select';
  const secondChoices = '[data-display-question-id="second-mcq"] .sel-choice-columns select';
  await page.waitForSelector(firstChoices, { visible: true });
  const answerSpace = '[data-display-question-id="first-mcq"] .space-value input';
  const fillButton = '[data-display-question-id="first-mcq"] .space-fill';
  assert.equal(await page.$eval(answerSpace, input => input.value), '');
  await page.type(answerSpace, '4');
  assert.equal(await page.$eval(fillButton, button => button.getAttribute('aria-pressed')), 'false');
  assert.equal(await page.$eval(answerSpace, input => input.value), '4');
  await page.click(fillButton);
  assert.equal(await page.$eval(fillButton, button => button.getAttribute('aria-pressed')), 'true');
  assert.equal(await page.$eval(answerSpace, input => input.value), '');
  assert.equal(await page.$eval(firstChoices, select => select.selectedOptions[0].textContent), 'Use test setting (3)');
  assert.equal(await page.$('[data-display-question-id="written"] .sel-choice-columns'), null);
  await page.select(firstChoices, '1');
  await page.click('button[aria-label="Undo"]');
  assert.equal(await page.$eval(firstChoices, select => select.value), 'test');
  await page.click('button[aria-label="Redo"]');
  assert.equal(await page.$eval(firstChoices, select => select.value), '1');
  assert.equal(await page.$eval(secondChoices, select => select.value), 'test');

  const choicePositions = () => page.evaluate(async () => {
    const { testEditor } = await import('/src/lib/test-editor.svelte.ts');
    const { generateTypst } = await import('/src/lib/typst/template.ts');
    const { queryValues } = await import('/src/lib/typst/compiler.ts');
    const source = generateTypst(testEditor.config, testEditor.config.ownQuestions);
    const markers = await queryValues(source, '<choice-position>');
    return Object.fromEntries(markers.map(({ id, x }) => [id, x]));
  });
  const manual = await choicePositions();
  assert.equal(Object.keys(manual).length, 8);
  assert.ok(Math.abs(manual['first-mcq-A'] - manual['first-mcq-B']) < 1, 'only the overridden question stacks its choices');
  assert.ok(manual['second-mcq-B'] - manual['second-mcq-A'] > 50, 'the other question still uses the test-wide layout');
  assert.ok(Math.abs(manual['second-mcq-D'] - manual['second-mcq-A']) < 1, 'the inherited three-column layout starts D on the next row');
  await page.select(firstChoices, 'auto');
  const automatic = await choicePositions();
  assert.ok(automatic['first-mcq-D'] - automatic['first-mcq-C'] > 50, 'per-question Auto can exceed the test-wide target');
  assert.ok(Math.abs(automatic['second-mcq-D'] - automatic['second-mcq-A']) < 1);

  const savedTestId = await page.evaluate(async () => {
    const { testEditor } = await import('/src/lib/test-editor.svelte.ts');
    if (!await testEditor.saveAs({ name: 'MCQ choice layout', classId: null, unitId: null, testType: 'quiz' })) {
      throw new Error(testEditor.error || testEditor.recoveryError || 'Could not save the test');
    }
    return testEditor.testId;
  });
  assert.ok(savedTestId);
  await page.reload({ waitUntil: 'networkidle0' });
  assert.deepEqual(await page.evaluate(async id => {
    const { testLibrary } = await import('/src/lib/test-library.svelte.ts');
    const { mcqChoiceColumns, mcqChoiceColumnOverrides, keepQuestionsTogether, answerSpaceFill } = testLibrary.get(id).config;
    return { mcqChoiceColumns, mcqChoiceColumnOverrides: { ...mcqChoiceColumnOverrides }, keepQuestionsTogether, answerSpaceFill };
  }, savedTestId), { mcqChoiceColumns: 3, mcqChoiceColumnOverrides: { 'first-mcq': 'auto' }, keepQuestionsTogether: true, answerSpaceFill: true });
  await page.click('#picker-tab-selected');
  assert.equal(await page.$eval(firstChoices, select => select.value), 'auto', 'the question override survives reload');
  await page.select(firstChoices, 'test');
  const inherited = await choicePositions();
  assert.ok(Math.abs(inherited['first-mcq-D'] - inherited['first-mcq-A']) < 1, 'clearing the override restores the test layout');

  await page.select(firstChoices, '2');
  await page.evaluate(async () => {
    const { testEditor } = await import('/src/lib/test-editor.svelte.ts');
    const original = testEditor.config.ownQuestions.find(question => question.id === 'first-mcq');
    testEditor.replaceQuestion(original.id, [{ ...original, id: 'replacement-mcq', body: 'Replacement question' }]);
  });
  const replacementChoices = '[data-display-question-id="replacement-mcq"] .sel-choice-columns select';
  await page.waitForSelector(replacementChoices);
  assert.equal(await page.$eval(replacementChoices, select => select.value), '2', 'replacement keeps the test layout for its position');
  assert.equal(await page.$eval(secondChoices, select => select.value), 'test');

  console.log('Page layout passed: question grouping, flexible and fixed answer space, preview and PDF, persistence, MCQ controls, and column flow.');
} finally {
  await browser?.close();
  await server.close();
}
