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
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.evaluateOnNewDocument(() => {
    if (window !== window.top) return;
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.__copiedGradebookComments = text; } } });
    const now = Date.now();
    localStorage.setItem('tg-tutorial-done-v1', '1');
    localStorage.setItem('tg-gradebook-experimental-enabled-v1', 'true');
    localStorage.setItem('tg-class-catalog-v1', JSON.stringify([{ id: 'math', name: 'Mathematics', units: [{ id: 'algebra', name: 'Algebra', sections: [{ id: 'A.1', name: 'Linear equations', indicators: [{ id: 'A.1.1', text: 'Solve one-step equations.', nickname: 'solve one-step equations' }, { id: 'A.1.2', text: 'Solve multi-step equations.', nickname: 'solve multi-step equations', nextStep: 'practice the distributive property' }] }] }] }]));
    localStorage.setItem('tg-gradebook-v1', JSON.stringify({
      sections: [{ id: 'p1', name: 'Period 1', linkedClassId: 'math' }],
      students: [{ id: 'ada', firstName: 'Ada', lastName: 'Student' }, { id: 'grace', firstName: 'Grace', lastName: 'Hopper' }, { id: 'linus', firstName: 'Linus', lastName: 'Torvalds' }],
      enrollments: [{ id: 'enrollment-ada', sectionId: 'p1', studentId: 'ada' }, { id: 'enrollment-grace', sectionId: 'p1', studentId: 'grace' }, { id: 'enrollment-linus', sectionId: 'p1', studentId: 'linus' }],
      assessments: [{ id: 'test', sectionId: 'p1', savedTestId: 'saved', savedTestName: 'Equation test', title: '', subtitle: '', testType: 'test', totalPoints: 6, bonusPoints: 0, administeredAt: now,
        selectedQuestionIds: ['q1', 'q2'], questionSnapshots: [
          { questionId: 'q1', label: '1', order: 0, points: 4, isBonus: false, classId: 'math', unitId: 'algebra', sectionId: 'A.1', indicators: ['A.1.1'], bodyPreview: 'Solve x + 3 = 8.' },
          { questionId: 'q2', label: '2', order: 1, points: 2, isBonus: false, classId: 'math', unitId: 'algebra', sectionId: 'A.1', indicators: ['A.1.2'], bodyPreview: 'Solve 2x + 1 = 7.' },
        ] }],
      scores: [
        { id: 'score-ada', sectionId: 'p1', assessmentId: 'test', studentId: 'ada', state: 'normal', points: 5, questionScores: [{ questionId: 'q1', points: 4 }, { questionId: 'q2', points: 1 }] },
        { id: 'score-grace', sectionId: 'p1', assessmentId: 'test', studentId: 'grace', state: 'normal', points: 6, questionScores: [{ questionId: 'q1', points: 4 }, { questionId: 'q2', points: 2 }] },
        { id: 'score-linus', sectionId: 'p1', assessmentId: 'test', studentId: 'linus', state: 'normal', points: 0, questionScores: [{ questionId: 'q1', points: 0 }, { questionId: 'q2', points: 0 }] },
      ],
    }));
  });
  await page.goto(`${server.resolvedUrls.local[0]}#/gradebook`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.score-grid');
  const before = await page.evaluate(() => localStorage.getItem('tg-gradebook-v1'));
  const opened = await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find(item => item.textContent.trim() === 'Print student reports');
    button?.click(); return Boolean(button);
  });
  assert.ok(opened);
  await page.waitForSelector('dialog[aria-label="Gradebook reports"][open]');
  await page.select('[aria-label="Report type"]', 'outcomes');
  await page.select('[aria-label="Preview report student"]', 'ada');
  const preview = async () => {
    const frame = await (await page.$('.report-preview')).contentFrame();
    await frame.waitForSelector('.outcomes');
    return frame;
  };
  let frame = await preview();
  const text = await frame.$eval('body', body => body.innerText);
  assert.match(text, /Curricular outcomes report/i);
  assert.match(text, /A\.1\.1/);
  assert.match(text, /solve one-step equations/);
  assert.match(text, /Equation test · Q1/);
  assert.match(text, /Solve x \+ 3 = 8/);
  assert.match(text, /Strength/);
  assert.match(text, /Weaknesses/);
  assert.equal(await page.$eval('[aria-label="Strength threshold percentage"]', input => input.value), '70');
  assert.match(text, /2 of 2/);
  assert.equal(await frame.$$eval('.outcome', elements => elements.length), 2);
  assert.equal(await frame.$$eval('.evidence tbody tr', elements => elements.length), 2);
  assert.deepEqual(await page.$$eval('[aria-label="Student report card comments"] thead th', cells => cells.map(cell => cell.textContent.trim())), ['Student', 'Comment', 'Final grade']);
  const row = await page.$eval('[aria-label="Copy Ada Student\'s comment"]', button => [...button.closest('tr').querySelectorAll('td')].map(cell => cell.textContent.trim()));
  const comment = 'Ada can solve one-step equations. Ada is challenged when asked to solve multi-step equations. Ada\'s next step is to practice the distributive property.';
  assert.deepEqual(row, ['Ada Student', comment, '83.3%']);
  const graceComment = 'Grace can solve one-step equations.';
  const linusComment = 'Linus is challenged when asked to solve one-step equations. Linus\' next step is to review and practice how to solve one-step equations.';
  assert.match(await page.$eval('.comment-table tr.no-weaknesses', row => row.textContent), /Grace Hopper.*No weaknesses/s);
  assert.match(await page.$eval('.comment-table tr.no-strengths', row => row.textContent), /Linus Torvalds.*No strengths/s);
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('button')].some(button => button.textContent.trim() === 'Write custom comment' && button.closest('tr')?.textContent.includes('Ada Student'))), false, 'mixed rows do not offer a custom override');
  if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/gradebook-report-table-highlights.png` });
  await page.click('[aria-label="Copy Ada Student\'s comment"]');
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(await page.evaluate(() => window.__copiedGradebookComments), comment);
  assert.match(await page.$eval('.copy-note', element => element.textContent), /Copied Ada Student's comment/);
  assert.ok(await page.$eval('[aria-label="Copy Ada Student\'s comment"]', button => button.classList.contains('copied')));
  await page.click('[aria-label="Copy Ada Student\'s final grade"]');
  assert.equal(await page.evaluate(() => window.__copiedGradebookComments), '83.3%');
  assert.ok(await page.evaluate(() => { const button = [...document.querySelectorAll('button')].find(item => item.textContent.trim() === 'Copy whole table'); button?.click(); return Boolean(button); }));
  await new Promise(resolve => setTimeout(resolve, 50));
  const wholeTable = await page.evaluate(() => window.__copiedGradebookComments);
  assert.match(wholeTable, new RegExp(`Ada Student\\t${comment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\t83\\.3%`));
  assert.match(wholeTable, new RegExp(`Grace Hopper\\t${graceComment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\t100%`));
  assert.match(wholeTable, new RegExp(`Linus Torvalds\\t${linusComment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\t0%`));
  assert.match(await page.$eval('.copy-note', element => element.textContent), /Copied 3 student rows with column headings/);

  const customComment = 'Grace consistently demonstrates excellent understanding and confidently applies these skills in new situations.';
  await page.evaluate(() => {
    const row = document.querySelector('[aria-label="Copy Grace Hopper\'s comment"]').closest('tr');
    [...row.querySelectorAll('button')].find(button => button.textContent.trim() === 'Write custom comment').click();
  });
  await page.$eval('[aria-label="Custom comment for Grace Hopper"]', (textarea, value) => { textarea.value = value; textarea.dispatchEvent(new Event('input', { bubbles: true })); }, customComment);
  await page.evaluate(() => {
    const row = document.querySelector('[aria-label="Custom comment for Grace Hopper"]').closest('tr');
    [...row.querySelectorAll('button')].find(button => button.textContent.trim() === 'Save custom comment').click();
  });
  await page.click('[aria-label="Copy Grace Hopper\'s comment"]');
  assert.equal(await page.evaluate(() => window.__copiedGradebookComments), customComment);
  await page.evaluate(() => [...document.querySelectorAll('button')].find(item => item.textContent.trim() === 'Copy whole table').click());
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.match(await page.evaluate(() => window.__copiedGradebookComments), new RegExp(`Grace Hopper\\t${customComment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\t100%`), 'whole-table copy uses the custom comment');
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('tg-gradebook-report-comment-drafts-v1'))), { p1: { grace: customComment } });
  await page.click('[aria-label="Close reports"]');
  await page.waitForSelector('dialog[aria-label="Gradebook reports"]', { hidden: true });
  await page.evaluate(() => [...document.querySelectorAll('button')].find(item => item.textContent.trim() === 'Print student reports').click());
  await page.waitForSelector('dialog[aria-label="Gradebook reports"][open]');
  await page.select('[aria-label="Report type"]', 'outcomes');
  await page.select('[aria-label="Preview report student"]', 'ada');
  assert.equal(await page.$eval('[aria-label="Copy Grace Hopper\'s comment"]', button => button.textContent.trim()), customComment, 'the section-scoped browser draft is restored when reports reopen');
  assert.match(await page.$eval('[aria-label="Copy Grace Hopper\'s comment"]', button => button.closest('tr').textContent), /Custom comment/);
  await page.evaluate(() => {
    const row = document.querySelector('[aria-label="Copy Grace Hopper\'s comment"]').closest('tr');
    [...row.querySelectorAll('button')].find(button => button.textContent.trim() === 'Use generated').click();
  });
  assert.equal(await page.$eval('[aria-label="Copy Grace Hopper\'s comment"]', button => button.textContent.trim()), graceComment);
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('tg-gradebook-report-comment-drafts-v1'))), {}, 'Use generated removes the browser draft');
  await page.$eval('[aria-label="Strength threshold percentage"]', input => { input.value = '50'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  frame = await preview();
  assert.equal(await frame.$$eval('.outcome.strength', elements => elements.length), 1, 'a non-perfect report retains its strongest outcome');
  assert.equal(await frame.$$eval('.outcome.weakness', elements => elements.length), 1, 'the weakest outcome supplies contrast when every result meets the cutoff');
  assert.match(await frame.$eval('body', body => body.innerText), /Weakest result/);
  assert.equal(await page.evaluate(() => localStorage.getItem('tg-gradebook-v1')), before, 'preview leaves the persisted gradebook unchanged');
  await page.setViewport({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  frame = await preview();
  assert.ok(await frame.$('.outcome-summary'));
  assert.deepEqual(errors, []);
  console.log('Gradebook curricular outcome report browser flow passed: discoverable report type, named outcomes, exact question evidence, classifications, read-only preview, and mobile layout.');
} finally {
  await browser?.close();
  await server.close();
}
