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
    localStorage.setItem('tg-tutorial-done-v1', '1');
    localStorage.setItem('tg-gradebook-experimental-enabled-v1', 'true');
    const ids = ['zero', 'three', 'nine', 'inactive', 'excused', 'ungraded'];
    localStorage.setItem('tg-gradebook-v1', JSON.stringify({
      sections: [{ id: 'section', name: 'Summary class' }],
      students: ids.map(id => ({ id, firstName: id, lastName: 'Student', active: id !== 'inactive' })),
      enrollments: ids.map(id => ({ id: `enrollment-${id}`, studentId: id, sectionId: 'section', active: true })),
    }));
  });
  await page.goto(`${server.resolvedUrls.local[0]}#/gradebook`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.score-grid tfoot');
  const row = () => page.$$eval('.score-grid tfoot button', buttons => buttons.map(button => button.textContent.trim()));
  assert.deepEqual(await row(), ['Average (mean)', '-']);
  await page.evaluate(async () => {
    const { gradebook } = await import('/src/lib/gradebook.svelte.ts');
    const assessment = gradebook.addExternalAssessment({ sectionId: 'section', name: 'Test', testType: 'test', totalPoints: 10 });
    for (const [studentId, points] of [['zero', 0], ['three', 3], ['nine', 9], ['inactive', 10]]) {
      gradebook.updateScore({ sectionId: 'section', assessmentId: assessment.id, studentId, points, state: 'normal' });
    }
    gradebook.updateScore({ sectionId: 'section', assessmentId: assessment.id, studentId: 'excused', points: 8, state: 'excused' });
  });
  await page.waitForFunction(() => document.querySelector('.score-grid tfoot td')?.textContent === '40%');
  assert.deepEqual(await row(), ['Average (mean)', '40%', '4']);
  for (const [label, score, final] of [['Median', '3', '30%'], ['Minimum', '0', '0%'], ['Maximum', '9', '90%'], ['Average (mean)', '4', '40%']]) {
    await page.click('.score-grid tfoot td button');
    assert.deepEqual(await row(), [label, final, score]);
  }
  await page.evaluate(() => [...document.querySelectorAll('[aria-label="Assessment score display"] button')].find(button => button.textContent === 'Percentage').click());
  assert.deepEqual(await row(), ['Average (mean)', '40%', '40%']);
  await page.evaluate(async () => {
    const { gradebook } = await import('/src/lib/gradebook.svelte.ts');
    const student = gradebook.addStudent({ firstName: 'Fourth', lastName: 'Student', sectionId: 'section' });
    gradebook.updateScore({ sectionId: 'section', assessmentId: gradebook.assessments[0].id, studentId: student.id, points: 1, state: 'normal' });
  });
  await page.waitForFunction(() => document.querySelector('.score-grid tfoot td')?.textContent === '32.5%');
  await page.click('.score-grid tfoot th button');
  assert.deepEqual(await row(), ['Median', '20%', '20%'], 'even median averages the two central scores');
  assert.ok(await page.$('.detail-rail .section-removal'), 'section actions are in the right pane');
  assert.equal(await page.$('.overview-stack .section-removal'), null);
  await page.click('[title="Hide roster"]');
  assert.equal(await page.$('.section-removal'), null, 'section actions hide with the right pane');
  await page.setViewport({ width: 390, height: 844 });
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.mobile-score-cards')).display !== 'none');
  assert.match(await page.$eval('.mobile-score-cards .class-summary', element => element.textContent), /Median/);
  await page.click('.mobile-score-cards .class-summary .mobile-student-summary');
  assert.match(await page.$eval('.mobile-score-cards .class-summary', element => element.textContent), /Minimum/);
  assert.deepEqual(errors, []);
  console.log('Gradebook summary: mean, odd/even median, min/max, zero and excluded scores, display toggle, mobile, and right-pane section actions passed.');
} finally {
  await browser?.close();
  await server.close();
}
