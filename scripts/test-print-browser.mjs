import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';

const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
let browser;
try {
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('tg-tutorial-done-v1', '1');
    localStorage.setItem('math-test-bank-v2', JSON.stringify([{
      id: 'print-q1', body: 'Evaluate.\n\n$ 2 + 2 $', points: 1, tags: [], createdAt: 1,
      choices: { A: '3', B: '4', C: '5' }, answer: 'B', solution: 'B',
    }]));
    const now = 1;
    const students = Array.from({ length: 30 }, (_, index) => ({
      id: `student-${index + 1}`,
      firstName: `Student ${index + 1}`,
      lastName: 'Example',
      displayName: `Student ${index + 1} Example`,
      active: true,
      createdAt: now,
      updatedAt: now,
    }));
    localStorage.setItem('tg-gradebook-v1', JSON.stringify({
      version: 1,
      sections: [
        { id: 'period-1', name: 'Period 1', linkedClassId: null, termLabel: null, categoryWeights: {}, createdAt: now, updatedAt: now },
        { id: 'period-2', name: 'Period 2', linkedClassId: 'ap-calc-bc', termLabel: null, categoryWeights: {}, createdAt: now, updatedAt: now },
      ],
      students,
      enrollments: students.flatMap((student, index) => (index < 2 ? ['period-1', 'period-2'] : ['period-2'])
        .map(sectionId => ({
          id: `enrollment-${sectionId}-${student.id}`, sectionId, studentId: student.id,
          active: true, startedAt: now, createdAt: now, updatedAt: now,
        }))),
      assessments: [], scores: [], studentNotes: [], savedFilters: [],
      settings: { defaultScoreState: 'normal' },
    }));
  });
  await page.goto(`${server.resolvedUrls.local[0]}#/build`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('input[aria-label="Include question in test"]');
  await page.click('input[aria-label="Include question in test"]');
  await page.waitForFunction(() => !document.querySelector('.print-trigger')?.disabled, { timeout: 60_000 });
  await page.evaluate(() => {
    const label = [...document.querySelectorAll('label')].find(element => element.textContent.includes('Answer strip page'));
    label?.querySelector('input')?.click();
  });
  assert.equal(await page.evaluate(async () => {
    const { testEditor } = await import('/src/lib/test-editor.svelte.ts');
    return testEditor.saveAs({ name: 'Saved Calculus Test', classId: 'ap-calc-bc', unitId: null, testType: 'test' });
  }), true);
  await page.evaluate(async () => {
    const { gradebook } = await import('/src/lib/gradebook.svelte.ts');
    gradebook.archiveSection('period-1');
    gradebook.archiveSection('period-2');
  });

  const started = performance.now();
  await page.click('.print-trigger');
  await page.waitForSelector('.print-dialog[open]');
  assert.ok(performance.now() - started < 750, 'The print sheet opens without waiting for PDF compilation');
  assert.equal(await page.$eval('input[name="print-output"]:checked', input => input.value), 'test');
  assert.ok(await page.$eval('.print-choice input', input => input.getBoundingClientRect().width < 30), 'Radio controls remain compact beside their labels');
  assert.match(await page.$eval('.print-summary', element => element.textContent), /US Letter.*Portrait/s);

  const waitReady = () => page.waitForFunction(() => document.querySelector('.print-summary strong.ready')?.textContent === 'Ready to print', { timeout: 60_000 });
  const expectPageCount = async count => {
    await waitReady();
    assert.equal(await page.$eval('.print-summary div:nth-child(2) strong', el => el.textContent), String(count));
  };
  await waitReady();
  assert.match(await page.$eval('.print-summary', element => element.textContent), /Pages\d+/);

  for (const output of ['answer', 'combined']) {
    await page.click(`input[name="print-output"][value="${output}"]`);
    await waitReady();
    assert.equal(await page.$eval('input[name="print-output"]:checked', input => input.value), output);
  }

  await page.click('input[name="print-output"][value="class-set"]');
  const classSelect = '.class-set-settings select';
  assert.equal(await page.$eval(classSelect, select => select.value), '__custom__');
  const restoreSection = id => page.evaluate(async id => {
    const { gradebook } = await import('/src/lib/gradebook.svelte.ts');
    gradebook.restoreSection(id);
  }, id);
  const waitForClass = id => page.waitForFunction((selector, id) => document.querySelector(selector)?.value === id, {}, classSelect, id);
  await restoreSection('period-1');
  await waitForClass('period-1');
  await expectPageCount(4);
  await restoreSection('period-2');
  await waitForClass('period-2');
  await page.select(classSelect, 'period-1');
  assert.equal(await page.$eval('input[aria-label="Student papers"]', input => input.value), '2');
  await page.select(classSelect, 'period-2');
  assert.match(await page.$eval('.class-set-settings select', element => element.textContent), /Period 2 — 30 active students/);
  assert.match(await page.$eval('.version-distribution', element => element.textContent), /30 student papers.*Version A: 15.*Version B: 15.*One combined answer key.*2 labeled version lists/s);
  assert.match(await page.$eval('.printer-note', element => element.textContent), /Choose one copy.*30 student papers/);
  await page.click('button[aria-label="Remove one student paper"]');
  assert.equal(await page.$eval('input[aria-label="Student papers"]', input => input.value), '29');
  assert.match(await page.$eval('.copy-count-field small', element => element.textContent), /30 active students − 1 for an absence/);
  await page.click('button[aria-label="Add one student paper"]');
  await page.click('button[aria-label="Add one student paper"]');
  assert.equal(await page.$eval('input[aria-label="Student papers"]', input => input.value), '31');
  assert.match(await page.$eval('.copy-count-field small', element => element.textContent), /30 active students \+ 1 extra copy/);
  await page.click('button[aria-label="Remove one student paper"]');
  const versionLabelToggle = '.version-label-option input[type="checkbox"]';
  assert.equal(await page.$eval(versionLabelToggle, input => input.checked), true);
  await page.click(versionLabelToggle);
  assert.equal(await page.$eval(versionLabelToggle, input => input.checked), false);
  await expectPageCount(32);

  const keyToggle = '.class-set-answer-options label:first-child input';
  const stripToggle = '.class-set-answer-options label:last-child input';
  assert.equal(await page.$eval(keyToggle, input => input.checked), true);
  assert.equal(await page.$eval(stripToggle, input => input.checked), true, 'the strip starts with the Build setting');
  await page.focus(keyToggle);
  await page.keyboard.press('Space');
  await expectPageCount(31);
  assert.doesNotMatch(await page.$eval('.version-distribution', el => el.textContent), /combined answer key/);
  assert.match(await page.$eval('.version-distribution', el => el.textContent), /answer strip page/);
  await page.click(stripToggle);
  await expectPageCount(30);
  await page.click(keyToggle);
  await expectPageCount(31);
  assert.deepEqual(await page.evaluate(async () => {
    const { testEditor } = await import('/src/lib/test-editor.svelte.ts');
    return { key: testEditor.config.showAnswerKey, strip: testEditor.config.answerStrip };
  }), { key: false, strip: true }, 'print toggles leave the Build settings intact');
  await page.click(stripToggle);
  await expectPageCount(32);
  assert.ok(await page.$('.print-dialog[open]'));

  await page.click('input[name="class-set-order"][value="grouped"]');
  await waitReady();
  assert.equal(await page.$eval('input[name="class-set-order"]:checked', input => input.value), 'grouped');

  const versions = '.class-set-fields label input[type="number"]';
  const copies = 'input[aria-label="Student papers"]';
  const setNumber = (selector, value) => page.$eval(selector, (input, value) => {
    input.value = String(value);
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
  await setNumber(versions, 3);
  await page.select('.class-set-settings select', '__custom__');
  await setNumber(copies, 1);
  assert.equal(await page.$eval(versions, input => input.value), '1');
  await setNumber(copies, 7);
  assert.equal(await page.$eval(versions, input => input.value), '3', 'a small print job does not overwrite the remembered preference');
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('tg-class-set-print-preferences-v1'))), {
    order: 'grouped', showVersionLabel: false, versions: 3, customCopies: 7,
  });

  await page.evaluate(() => [...document.querySelectorAll('.print-dialog button')].find(button => button.textContent.trim() === 'Adjust layout').click());
  await page.waitForFunction(() => !document.querySelector('.print-dialog') && document.activeElement?.id === 't-paper');
  await page.click('.print-trigger');
  await page.waitForSelector('.print-dialog[open]');
  await page.click('.close-print');
  await page.waitForFunction(() => !document.querySelector('.print-dialog'));
  await page.waitForFunction(() => document.activeElement?.classList.contains('print-trigger'));
  await page.keyboard.down('Control');
  await page.keyboard.press('p');
  await page.keyboard.up('Control');
  await page.waitForSelector('.print-dialog[open]');
  assert.equal(await page.$eval('input[name="print-output"]:checked', input => input.value), 'test', 'Ctrl/Cmd+P opens the safe student-test default');
  await page.click('input[name="print-output"][value="class-set"]');
  assert.equal(await page.$eval(classSelect, select => select.value), 'period-2', 'the saved test defaults to its linked course roster');
  await page.setViewport({ width: 390, height: 760 });
  const narrow = await page.$eval('.print-dialog', dialog => {
    const box = dialog.getBoundingClientRect();
    return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: innerWidth, height: innerHeight, scrollWidth: dialog.scrollWidth, clientWidth: dialog.clientWidth };
  });
  assert.ok(narrow.left >= 0 && narrow.right <= narrow.width && narrow.top >= 0 && narrow.bottom <= narrow.height, 'The print sheet fits the narrow viewport');
  assert.ok(narrow.scrollWidth <= narrow.clientWidth, 'The print sheet has no horizontal overflow');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('.print-dialog'));

  await page.click('.dropdown-trigger');
  assert.equal(await page.$$eval('.dropdown-menu button', buttons => buttons.some(button => button.textContent.trim() === 'Print')), false, 'Export stays focused on downloads');
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForFunction(() => !document.querySelector('.print-trigger')?.disabled, { timeout: 60_000 });
  await page.click('.print-trigger');
  await page.waitForSelector('.print-dialog[open]');
  await page.click('input[name="print-output"][value="class-set"]');
  assert.equal(await page.$eval('input[name="class-set-order"]:checked', input => input.value), 'grouped', 'paper order survives a reload');
  assert.equal(await page.$eval(versionLabelToggle, input => input.checked), false, 'version-label preference survives a reload');
  assert.equal(await page.$eval(versions, input => input.value), '3', 'MCQ version count survives a reload');
  assert.equal(await page.$eval(copies, input => input.value), '30', 'a Gradebook class starts from its roster');
  await page.select('.class-set-settings select', '__custom__');
  assert.equal(await page.$eval(copies, input => input.value), '7', 'custom paper count survives a reload');
  assert.deepEqual(errors, []);
  console.log('Print browser checks passed: class-set answer toggles, page counts, persistent versions and custom copies, and print/export safety.');
} catch (error) {
  console.error(error);
  if (browser) {
    const pages = await browser.pages();
    const page = pages.at(-1);
    if (page) await page.screenshot({ path: '/tmp/testgen-print-failure.png' });
  }
  process.exitCode = 1;
} finally {
  await browser?.close();
  await server.close();
}
