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
      students: [{ id: 'ada', firstName: 'Ada', lastName: 'Student' }],
      enrollments: [{ id: 'enrollment', sectionId: 'p1', studentId: 'ada' }],
      assessments: [{ id: 'test', sectionId: 'p1', savedTestId: 'saved', savedTestName: 'Equation test', title: '', subtitle: '', testType: 'test', totalPoints: 6, bonusPoints: 0, administeredAt: now,
        selectedQuestionIds: ['q1', 'q2'], questionSnapshots: [
          { questionId: 'q1', label: '1', order: 0, points: 4, isBonus: false, classId: 'math', unitId: 'algebra', sectionId: 'A.1', indicators: ['A.1.1'], bodyPreview: 'Solve x + 3 = 8.' },
          { questionId: 'q2', label: '2', order: 1, points: 2, isBonus: false, classId: 'math', unitId: 'algebra', sectionId: 'A.1', indicators: ['A.1.2'], bodyPreview: 'Solve 2x + 1 = 7.' },
        ] }],
      scores: [{ id: 'score', sectionId: 'p1', assessmentId: 'test', studentId: 'ada', state: 'normal', points: 5, questionScores: [{ questionId: 'q1', points: 4 }, { questionId: 'q2', points: 1 }] }],
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
  const comments = await page.$eval('[aria-label="Student outcome comments"]', textarea => textarea.value);
  assert.equal(comments, 'Ada Student: Ada can solve one-step equations. Ada is challenged when asked to solve multi-step equations. Ada\'s next step is to practice the distributive property.');
  assert.ok(await page.evaluate(() => { const button = [...document.querySelectorAll('button')].find(item => item.textContent.trim() === 'Copy all comments'); button?.click(); return Boolean(button); }));
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(await page.evaluate(() => window.__copiedGradebookComments), comments);
  assert.match(await page.$eval('.copy-note', element => element.textContent), /Copied 1 comment/);
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
