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
    localStorage.setItem('tg-gradebook-v1', JSON.stringify({
      sections: [{ id: 'section', name: 'Period 1' }, { id: 'second', name: 'Period 2' }],
      students: [
        { id: 'ada', firstName: 'Ada', lastName: 'Lee', sisId: '001', active: true },
        { id: 'grace', firstName: 'Grace', lastName: 'Hopper', active: true },
        { id: 'jose', firstName: 'José', lastName: 'O’Connor', knownBy: 'Joey', sisId: '09009', active: true },
      ],
      enrollments: [
        ...['ada', 'grace'].map(id => ({ id: `enroll-${id}`, sectionId: 'section', studentId: id, active: true })),
        { id: 'enroll-jose', sectionId: 'second', studentId: 'jose', active: true },
      ],
    }));
  });
  await page.goto(`${server.resolvedUrls.local[0]}#/gradebook`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.score-grid');
  const click = text => page.evaluate(text => [...document.querySelectorAll('.view-switch button')].find(button => button.textContent.trim() === text).click(), text);
  await page.evaluate(async () => {
    const { gradebook } = await import('/src/lib/gradebook.svelte.ts');
    gradebook.addExternalAssessment({ sectionId: 'section', name: 'Test A', testType: 'test', totalPoints: 10 });
  });
  await click('Student');
  await page.waitForFunction(() => document.activeElement?.classList.contains('student-search'));
  assert.equal(await page.$('.student-edit-grid'), null, 'Student tab starts without a selected student');
  assert.equal(await page.$('.final-grade'), null);
  await page.keyboard.type('grc hpr');
  await page.waitForFunction(() => document.querySelectorAll('.student-picker-menu button').length === 1);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('.student-picker-trigger strong')?.textContent === 'Grace Hopper');
  assert.deepEqual(await page.$$eval('.category-total > span', elements => elements.map(el => el.textContent)), ['Test']);
  assert.equal(await page.$$eval('.detail-rail .snapshot-row', elements => elements.length), 1, 'Only populated category in right rail');
  assert.equal(await page.$$eval('.student-category-section', elements => elements.length), 1);

  await click('Overview');
  await click('Student');
  await page.waitForFunction(() => document.activeElement?.classList.contains('student-search'));
  assert.equal(await page.$('.student-edit-grid'), null, 'Re-entering Student tab also starts with a fresh picker');
  assert.match(await page.$eval('.student-picker-menu .active', button => button.textContent), /Grace Hopper/);
  await page.keyboard.press('ArrowDown');
  assert.match(await page.$eval('.student-picker-menu .active', button => button.textContent), /Ada Lee/);
  await page.keyboard.press('ArrowUp');
  assert.match(await page.$eval('.student-picker-menu .active', button => button.textContent), /Grace Hopper/);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('.student-picker-trigger strong')?.textContent === 'Ada Lee');
  await page.keyboard.press('Enter');
  assert.equal(await page.$eval('.student-picker-trigger strong', element => element.textContent), 'Ada Lee', 'Enter after selection does not choose a different student from the closed picker');
  await page.click('.student-search');
  await page.keyboard.type('jose');
  await page.waitForFunction(() => document.querySelector('.student-picker-menu')?.textContent.includes('Joey O’Connor (Period 2)'));
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('.student-picker-trigger strong')?.textContent === 'Joey O’Connor');
  assert.equal(await page.$$eval('.category-total, .detail-rail .snapshot-row, .student-category-section', elements => elements.length), 0, 'No empty categories for a class without assessments');

  await click('Overview');
  await page.click('.student-table-link');
  await page.waitForSelector('.student-edit-grid');
  assert.equal(await page.$eval('.student-picker-trigger strong', el => el.textContent), 'Joey O’Connor', 'Overview name opens that student directly');
  assert.deepEqual(errors, []);
  console.log('gradebook student browser tests passed');
} finally {
  await browser?.close();
  await server.close();
}
