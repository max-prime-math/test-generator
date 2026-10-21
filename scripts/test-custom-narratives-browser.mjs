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
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => void dialog.accept());
  await page.evaluateOnNewDocument(() => {
    if (sessionStorage.getItem('narrative-seeded')) return;
    sessionStorage.setItem('narrative-seeded', '1');
    localStorage.setItem('tg-tutorial-done-v1', '1');
    localStorage.setItem('math-test-bank-v2', JSON.stringify(Array.from({ length: 3 }, (_, i) => ({
      id: `q${i + 1}`, body: `Question ${i + 1}. #context [#metadata("q${i + 1}")<test-flow>]`,
      points: 2, tags: [], createdAt: 1, solution: 'An explanation.',
      ...(i < 2 ? { choices: { A: 'One', B: 'Two' }, answer: 'A' } : {}),
    }))));
  });
  await page.goto(`${server.resolvedUrls.local[0]}#/build`, { waitUntil: 'networkidle0' });
  const clickText = (text) => page.evaluate(text => {
    const button = [...document.querySelectorAll('button')].find(button => button.textContent.trim() === text && button.getClientRects().length);
    if (!button) throw new Error(`Button not found: ${text}`);
    button.click();
  }, text);
  const write = body => page.$eval('textarea[aria-label="Narrative"]', (area, body) => {
    area.value = body;
    area.dispatchEvent(new Event('input', { bubbles: true }));
  }, body);
  const saved = async () => {
    await page.waitForFunction(() => location.hash === '#/build');
    await page.waitForSelector('.narrative-item');
  };
  const flow = () => page.$$eval('.selected-list .sel-item', rows => rows.map(row => row.classList.contains('narrative-item') ? 'narrative' : row.querySelector('.sel-num').textContent.trim()));

  // Introductory narrative works before any questions, with the full editor tools.
  await clickText('+ Add narrative');
  await page.waitForSelector('textarea[aria-label="Narrative"]');
  assert.ok(await page.$('[aria-label="Narrative preview"]'));
  assert.ok(await page.evaluate(() => [...document.querySelectorAll('button')].some(b => b.textContent.includes('Add graph'))));
  assert.ok(await page.evaluate(() => [...document.querySelectorAll('button')].some(b => b.textContent.includes('Add picture'))));
  await clickText('Save for this test');
  assert.match(await page.$eval('[role="alert"]', element => element.textContent), /Write some narrative text/);
  const intro = '= Reference information\n\nUse this information throughout the test.\n#context [#metadata("intro")<test-flow>]';
  await write(intro);
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('textarea[aria-label="Narrative"]');
  assert.equal(await page.$eval('textarea[aria-label="Narrative"]', area => area.value), intro, 'unfinished narrative edit survives reload');
  await page.waitForSelector('.narrative-workspace .svg svg', { timeout: 60_000 });
  await clickText('Save for this test');
  await saved();
  assert.deepEqual(await flow(), ['narrative']);

  await page.click('#picker-tab-browse');
  await page.$$eval('input[aria-label="Include question in test"]', inputs => inputs.forEach(input => input.click()));
  await page.click('#picker-tab-selected');
  await page.waitForFunction(() => document.querySelectorAll('.sel-num').length === 3);
  await page.click('[aria-label="Add narrative after question 1"]');
  await page.waitForSelector('textarea[aria-label="Narrative"]');
  const passage = '*For the next questions:*\n\nEvaluate $x^2 + 2 x + 1$ using the table.\n\n#table(columns: 2, [x], [y], [1], [4])\n#context [#metadata("passage")<test-flow>]';
  await write(passage);
  await clickText('Save for this test');
  await saved();
  assert.deepEqual(await flow(), ['narrative', '1', 'narrative', '2', '3']);

  // Position controls allow a narrative to move independently of question numbering.
  await page.$$eval('[aria-label="Move narrative up"]', buttons => buttons[1].click());
  assert.deepEqual(await flow(), ['narrative', 'narrative', '1', '2', '3']);
  await page.$$eval('[aria-label="Move narrative down"]', buttons => buttons[1].click());
  assert.deepEqual(await flow(), ['narrative', '1', 'narrative', '2', '3']);

  // Cancelling both an existing edit and a newly inserted block is lossless.
  await page.$$eval('[aria-label="Edit narrative"]', buttons => buttons[1].click());
  await page.waitForSelector('textarea[aria-label="Narrative"]');
  await write('Cancelled changes');
  await clickText('Cancel');
  await saved();
  assert.ok(await page.$eval('.selected-list', list => list.textContent.includes('For the next questions')));
  await clickText('+ Add narrative');
  await page.waitForSelector('textarea[aria-label="Narrative"]');
  await clickText('Cancel');
  await saved();
  assert.equal((await page.$$('.narrative-item')).length, 2);

  const result = await page.evaluate(async () => {
    const { testEditor } = await import('/src/lib/test-editor.svelte.ts');
    const { testLibrary } = await import('/src/lib/test-library.svelte.ts');
    const { bank } = await import('/src/lib/bank.svelte.ts');
    const { generateTypst, generateAnswerKeyPage, questionLabels } = await import('/src/lib/typst/template.ts');
    const { compile, queryValues } = await import('/src/lib/typst/compiler.ts');
    const { createAssessmentSnapshot } = await import('/src/lib/gradebook-model.ts');
    const { imageStore } = await import('/src/lib/image-store.svelte.ts');
    const { readBrowserAppData } = await import('/src/git/repoDataBridge.ts');
    const { snapshotTest } = await import('/src/lib/workspace-format.ts');
    const { testHash } = await import('/src/lib/tests-sync-core.ts');
    const config = { ...JSON.parse(JSON.stringify(testEditor.config)), answerSpace: 0 };
    const sequence = await queryValues(generateTypst(config, bank.questions), '<test-flow>');
    const introOnly = await queryValues(generateTypst({ ...config, selectedIds: [], customNarratives: [config.customNarratives[0]] }, []), '<test-flow>');
    const longSource = generateTypst({ ...config, selectedIds: [], pageColumns: 2, customNarratives: [{
      id: 'long', afterQuestionId: null,
      body: '#context [#metadata(here().page())<long-narrative>]\n#lorem(1500)\n#context [#metadata(here().page())<long-narrative>]',
    }] }, []);
    const longPages = await queryValues(longSource, '<long-narrative>');
    const columnSource = generateTypst({ ...config, pageColumns: 2, columnRule: true }, bank.questions);
    const compiled = await compile(columnSource);
    if (compiled.error) throw new Error(compiled.error);
    const pdfSize = compiled.pdfUrl ? (await (await fetch(compiled.pdfUrl)).arrayBuffer()).byteLength : 0;
    if (compiled.pdfUrl) URL.revokeObjectURL(compiled.pdfUrl);
    await imageStore.put('passage-fixture', new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><circle cx="10" cy="10" r="8"/></svg>'), 'svg');
    testEditor.config.customNarratives[1].body += '\n#image("/imgs/passage-fixture.svg", width: 1cm)';
    if (!await testEditor.saveAs({ name: 'Narrative test', classId: null, unitId: null, testType: 'test' })) throw new Error(testEditor.error);
    const entry = testLibrary.get(testEditor.testId);
    const recaptured = snapshotTest(JSON.parse(JSON.stringify(entry)), await readBrowserAppData());
    const assessment = createAssessmentSnapshot(entry, bank.questions, 'section');
    const shared = bank.questions.slice(0, 2).map(q => ({ ...q, taskGroup: { id: 'shared', instructions: 'Calculate.', columns: 1 } }));
    const groupedLabels = [...questionLabels(shared, { ...config, customNarratives: [{ id: 'separator', afterQuestionId: 'q1', body: 'A new section.' }] }).values()];
    return {
      sequence, introOnly, longPages, pdfSize, key: generateAnswerKeyPage(config, bank.questions), groupedLabels,
      questionLabels: [...questionLabels(bank.questions, config).values()],
      selectedIds: [...entry.config.selectedIds],
      savedNarratives: JSON.parse(JSON.stringify(entry.config.customNarratives)),
      assessmentIds: assessment.selectedQuestionIds,
      assessmentTotal: assessment.totalPoints,
      stableImageSnapshot: testHash(entry) === testHash(recaptured.test),
      dirty: testEditor.dirty,
    };
  });
  assert.deepEqual(result.sequence, ['intro', 'q1', 'passage', 'q2', 'q3'], 'narratives render at the selected positions');
  assert.deepEqual(result.introOnly, ['intro'], 'a narrative can render before any questions are selected');
  assert.equal(result.longPages.length, 2);
  assert.ok(result.longPages[1] > result.longPages[0], 'long narratives flow across pages and columns');
  assert.ok(result.pdfSize > 1000, 'narratives with Typst headings, tables and math compile in a two-column PDF');
  assert.deepEqual(result.questionLabels, ['1', '2', '3']);
  assert.deepEqual(result.groupedLabels, ['1', '2'], 'narrative interrupts a shared group without acquiring a number');
  assert.doesNotMatch(result.key, /Reference information|For the next questions/);
  assert.equal(result.savedNarratives.length, 2);
  assert.match(result.savedNarratives[1].body, /\/imgs\/testasset-/, 'narrative pictures are frozen independently of their bank');
  assert.equal(result.stableImageSnapshot, true, 'frozen narrative image names do not create repeated folder-sync changes');
  assert.equal(result.dirty, false, 'image snapshot leaves the saved editor clean');
  assert.deepEqual(result.selectedIds, ['q1', 'q2', 'q3']);
  assert.deepEqual(result.assessmentIds, ['q1', 'q2', 'q3']);
  assert.equal(result.assessmentTotal, 6);

  await page.reload({ waitUntil: 'networkidle0' });
  await page.click('#picker-tab-selected');
  await page.waitForFunction(() => document.querySelectorAll('.narrative-item').length === 2);
  assert.deepEqual(await flow(), ['narrative', '1', 'narrative', '2', '3'], 'saved test retains narrative positions');
  await page.click('[aria-label="Remove from test"], [title="Remove from test"]');
  assert.equal((await page.$$('.narrative-item')).length, 2, 'removing a question retains its narrative');
  await page.$$eval('[aria-label="Remove narrative"]', buttons => buttons[1].click());
  assert.equal((await page.$$('.narrative-item')).length, 1);
  assert.deepEqual(errors, []);
  console.log('Custom narratives passed: insertion, Typst editor and preview, cancel/recovery, ordering, numbering, PDF, answer key, Gradebook and saved-test persistence.');
} finally {
  await browser?.close();
  await server.close();
}
