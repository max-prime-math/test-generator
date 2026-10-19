import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';

const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
let browser;
try {
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 1000 });
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('tg-tutorial-done-v1', '1');
    localStorage.setItem('tg-test-tabs-enabled-v1', 'false');
  });
  await page.goto(`${server.resolvedUrls.local[0]}#/build`, { waitUntil: 'networkidle0' });

  const fixture = await page.evaluate(async () => {
    const { bank } = await import('/src/lib/bank.svelte.ts');
    const { customClasses } = await import('/src/lib/custom-classes.svelte.ts');
    const { appState } = await import('/src/lib/app-state.svelte.ts');
    const { testLibrary } = await import('/src/lib/test-library.svelte.ts');
    const { testEditor } = await import('/src/lib/test-editor.svelte.ts');
    const { gradebook } = await import('/src/lib/gradebook.svelte.ts');
    const { defaultTestConfig } = await import('/src/lib/types.ts');

    const course = customClasses.add('Usage Filter Algebra');
    const questions = [
      ['q-unused', 'Unused question'],
      ['q-saved', 'Saved-test question'],
      ['q-gradebook', 'Gradebook-only question'],
      ['q-archived', 'Archived-test question'],
      ['q-current', 'Current-test question'],
      ['q-old-section', 'Archived-section question'],
    ].map(([id, body]) => ({ id, body, solution: '', points: 1, tags: [], classId: course.id, createdAt: 1 }));
    bank.importJson(JSON.stringify(questions));

    const config = (title, selectedIds) => ({ ...defaultTestConfig(title), selectedIds });
    testLibrary.saveAs('Other active test', course.id, null, 'test', config('Other', ['q-saved']));
    const archived = testLibrary.saveAs('Archived saved test', course.id, null, 'test', config('Archived', ['q-archived']));
    testLibrary.archive(archived.id);

    const gradeSource = testLibrary.saveAs('Gradebook-only test', course.id, null, 'quiz', config('Gradebook', ['q-gradebook']));
    const activeSection = gradebook.createSection({ name: 'Period 2', linkedClassId: course.id });
    gradebook.createAssessmentFromSavedTest(gradeSource, questions, activeSection.id);
    testLibrary.archive(gradeSource.id);

    const oldSource = testLibrary.saveAs('Old section test', course.id, null, 'test', config('Old', ['q-old-section']));
    const oldSection = gradebook.createSection({ name: 'Last term', linkedClassId: course.id });
    gradebook.createAssessmentFromSavedTest(oldSource, questions, oldSection.id);
    gradebook.archiveSection(oldSection.id);
    testLibrary.archive(oldSource.id);

    const current = testLibrary.saveAs('Current build test', course.id, null, 'test', config('Current', ['q-current']));
    gradebook.createAssessmentFromSavedTest(current, questions, activeSection.id);
    await testEditor.open(current.id);
    appState.setLastClassId(course.id);
    return { className: course.name, sectionName: activeSection.name };
  });

  const bodies = () => page.$$eval('.picker-body', (items) => items.map((item) => item.textContent.trim()));
  await page.waitForFunction(() => document.querySelectorAll('.picker-item').length === 6);
  assert.deepEqual((await bodies()).sort(), [
    'Archived-section question',
    'Archived-test question',
    'Current-test question',
    'Gradebook-only question',
    'Saved-test question',
    'Unused question',
  ]);

  await page.click('#picker-filter-toggle');
  await page.waitForSelector('.usage-filter');
  await page.$$eval('.usage-modes input[type="radio"]', (inputs) => inputs[2].click());
  await page.waitForSelector('.usage-tree');
  const optionText = await page.$$eval('.usage-filter .usage-option', (items) => items.map((item) => item.textContent.replace(/\s+/g, ' ').trim()));
  assert.ok(optionText.some((text) => text.includes(fixture.className)), 'class hierarchy is present');
  assert.ok(optionText.some((text) => text.includes(fixture.sectionName)), 'Gradebook section hierarchy is present');
  assert.ok(optionText.some((text) => text.includes('Other active test')), 'active saved test is present');
  assert.ok(optionText.some((text) => text.includes('Gradebook-only test')), 'active Gradebook assessment is present');
  assert.ok(!optionText.some((text) => text.includes('Archived saved test')), 'archived saved tests are omitted');
  assert.ok(!optionText.some((text) => text.includes('Current build test')), 'current test and its Gradebook copy are omitted');

  await page.$$eval('.usage-modes input[type="radio"]', (inputs) => inputs[1].click());
  await page.waitForFunction(() => document.querySelector('.q-count')?.textContent.trim() === '4 q');
  assert.deepEqual((await bodies()).sort(), [
    'Archived-section question',
    'Archived-test question',
    'Current-test question',
    'Unused question',
  ]);
  await page.click('#picker-filters-done');
  await page.waitForSelector('[aria-label="Remove Not on any other active test filter"]');
  await page.click('[aria-label="Remove Not on any other active test filter"]');
  await page.waitForFunction(() => document.querySelector('.q-count')?.textContent.trim() === '6 q');

  await page.click('#picker-filter-toggle');
  await page.$$eval('.usage-modes input[type="radio"]', (inputs) => inputs[2].click());
  await page.waitForSelector('.usage-search');
  await page.type('.usage-search', 'Period 2');
  assert.ok(await page.evaluate((name) => [...document.querySelectorAll('.usage-parent')].some((item) => item.textContent.includes(name)), fixture.sectionName));
  await page.evaluate((name) => {
    const label = [...document.querySelectorAll('.usage-parent')].find((item) => item.textContent.includes(name));
    label?.querySelector('input')?.click();
  }, fixture.sectionName);
  await page.waitForFunction(() => document.querySelector('.q-count')?.textContent.trim() === '5 q');
  assert.ok(!(await bodies()).includes('Gradebook-only question'));
  assert.ok((await bodies()).includes('Saved-test question'));
  await page.click('#picker-filters-done');
  assert.match(await page.$eval('.filter-chip', (item) => item.textContent), /Not on: Period 2/);

  await page.click('#picker-tab-selected');
  assert.ok(await page.evaluate(() => [...document.querySelectorAll('.sel-body')].some((item) => item.textContent.includes('Current-test question'))), 'filter does not remove selected questions');

  const rendered = await page.evaluate(async () => {
    const { defaultTestConfig } = await import('/src/lib/types.ts');
    const { generateTypst } = await import('/src/lib/typst/template.ts');
    const { compile } = await import('/src/lib/typst/compiler.ts');
    const source = generateTypst(
      { ...defaultTestConfig('Boxes'), mcqAnswerBoxes: true, answerSpace: 0 },
      [
        { id: 'mcq', body: 'Choose.', choices: { A: 'One', B: 'Two' }, answer: 'A', points: 1, tags: [], createdAt: 1 },
        { id: 'frq', body: 'Explain.', solution: 'Because.', points: 1, tags: [], createdAt: 1 },
      ],
    );
    const result = await compile(source);
    const size = result.pdfUrl ? (await (await fetch(result.pdfUrl)).arrayBuffer()).byteLength : 0;
    if (result.pdfUrl) URL.revokeObjectURL(result.pdfUrl);
    return { source, error: result.error, size };
  });
  assert.match(rendered.source, /box\(width: 2\.25em, height: 2\.25em/);
  assert.match(rendered.source, /tg-box-space = box\(width: 2\.25em\)/);
  assert.equal(rendered.error, undefined);
  assert.ok(rendered.size > 1000, 'larger answer boxes compile into a PDF');

  console.log('Builder usage UI and larger MCQ answer boxes passed.');
} finally {
  await browser?.close();
  await server.close();
}
