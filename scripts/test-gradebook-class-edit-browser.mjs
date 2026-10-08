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
    if (localStorage.getItem('class-edit-fixture')) return;
    localStorage.setItem('class-edit-fixture', '1');
    localStorage.setItem('tg-tutorial-done-v1', '1');
    localStorage.setItem('tg-gradebook-experimental-enabled-v1', 'true');
    localStorage.setItem('tg-bank-workspaces-v1', JSON.stringify(['default', 'other'].map(id => ({ id, name: id, gitRepoId: id, createdAt: 1, updatedAt: 1 }))));
    localStorage.setItem('tg-active-bank-id-v1', 'default');
    localStorage.setItem('tg-class-catalog-v1', JSON.stringify([{ id: 'custom-course', name: 'Calculus', units: [] }]));
    localStorage.setItem('tg-bank:other:math-test-custom-classes-v1', JSON.stringify([{ id: 'custom-course', name: 'Calculus', units: [] }]));
    localStorage.setItem('tg-bank:other:tg-bank-class-membership-v1', JSON.stringify(['custom-course']));
    localStorage.setItem('tg-gradebook-v1', JSON.stringify({
      sections: ['Period 1', 'Period 2', 'Period 3'].map((name, i) => ({ id: `p${i + 1}`, name, linkedClassId: 'custom-course' })),
    }));
  });
  await page.goto(`${server.resolvedUrls.local[0]}#/gradebook`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.section-item');
  const order = () => page.$$eval('.active-section-list .section-item > span', elements => elements.map(element => element.textContent));
  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('tg-gradebook-v1')));
  const clickText = text => page.evaluate(text => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === text).click(), text);
  const fill = (label, value) => page.$eval(`[aria-label="${label}"]`, (input, value) => { input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); }, value);

  await page.click('[aria-label="Move Period 1 down"]');
  assert.deepEqual(await order(), ['Period 2', 'Period 1', 'Period 3']);
  await page.focus('.section-item.active');
  await page.keyboard.down('Alt');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.up('Alt');
  assert.deepEqual(await order(), ['Period 2', 'Period 3', 'Period 1']);
  assert.deepEqual((await stored()).sections.map(section => section.id), ['p2', 'p3', 'p1']);
  await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('.active-section-list .section-item')];
    const transfer = new DataTransfer();
    buttons[2].dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: transfer }));
    buttons[0].dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer }));
    buttons[0].dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  });
  assert.deepEqual(await order(), ['Period 1', 'Period 2', 'Period 3']);
  await page.click('[aria-label="Move Period 3 up"]');
  await page.reload({ waitUntil: 'networkidle0' });
  assert.deepEqual(await order(), ['Period 1', 'Period 3', 'Period 2']);

  await clickText('Edit section');
  await fill('Edit section name', 'Honors Period 1');
  await fill('Edit section term', 'Fall 2026');
  await fill('Edit course name', 'Advanced Calculus');
  await clickText('Save section');
  assert.equal((await stored()).sections[0].name, 'Honors Period 1');
  assert.equal((await stored()).sections[0].termLabel, 'Fall 2026');
  assert.equal((await stored()).sections[0].linkedClassId, 'custom-course');
  assert.equal(await page.$eval('[aria-label="Course for this section"] option:checked', option => option.textContent), 'Advanced Calculus');
  await page.reload({ waitUntil: 'networkidle0' });
  assert.equal(await page.$eval('.section-header h1', element => element.textContent), 'Honors Period 1');
  assert.equal(await page.$eval('[aria-label="Course for this section"] option:checked', option => option.textContent), 'Advanced Calculus');
  await page.evaluate(async () => {
    const { bankWorkspaces } = await import('/src/lib/bank-workspaces.svelte.ts');
    await bankWorkspaces.switchBank('other');
    if (bankWorkspaces.switchError) throw new Error(bankWorkspaces.switchError);
  });
  assert.equal(await page.$eval('[aria-label="Course for this section"] option:checked', option => option.textContent), 'Advanced Calculus', 'stale bank metadata must not undo a shared rename');
  assert.equal(await page.evaluate(async () => (await import('/src/lib/custom-classes.svelte.ts')).customClasses.classes.find(course => course.id === 'custom-course').name), 'Advanced Calculus', 'bank class lists use the shared name too');
  await page.reload({ waitUntil: 'networkidle0' });
  assert.equal(await page.$eval('[aria-label="Course for this section"] option:checked', option => option.textContent), 'Advanced Calculus');
  await clickText('Edit section');
  await fill('Edit course name', 'Calculus Honors');
  await clickText('Save section');
  await page.evaluate(async () => {
    const { bankWorkspaces } = await import('/src/lib/bank-workspaces.svelte.ts');
    const { customClasses } = await import('/src/lib/custom-classes.svelte.ts');
    customClasses.importMany([{ id: 'custom-course', name: 'Old imported name', units: [{ id: 'new-unit', name: 'New unit', sections: [] }] }]);
    await bankWorkspaces.switchBank('default');
    if (bankWorkspaces.switchError) throw new Error(bankWorkspaces.switchError);
  });
  await page.reload({ waitUntil: 'networkidle0' });
  assert.equal(await page.$eval('[aria-label="Course for this section"] option:checked', option => option.textContent), 'Calculus Honors', 'latest deliberate rename survives imports, bank switches, and reloads');
  assert.equal(await page.evaluate(async () => (await import('/src/lib/custom-classes.svelte.ts')).customClasses.catalog.find(course => course.id === 'custom-course').units[0].name), 'New unit', 'name overrides preserve imported curriculum');
  await clickText('Edit section');
  await fill('Edit section name', 'Discard me');
  await clickText('Cancel');
  assert.equal((await stored()).sections[0].name, 'Honors Period 1');
  await clickText('Edit section');
  await page.select('[aria-label="Edit section course"]', '');
  await clickText('Save section');
  assert.equal((await stored()).sections[0].linkedClassId, null);
  assert.deepEqual(errors, []);
  console.log('Gradebook class editing passed: drag, buttons, keyboard order, reload, shared course rename across stale banks/imports, section details, cancel, and unlink.');
} finally {
  await browser?.close();
  await server.close();
}
