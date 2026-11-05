import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { zipSync, strToU8 } from 'fflate';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';

const directory = await mkdtemp(path.join(tmpdir(), 'testgen-pqp-zip-'));
const supplied = process.argv[2];
let file, expected;
if (supplied) {
  file = path.resolve(supplied);
  const report = JSON.parse(await readFile(path.join(path.dirname(file), 'validation-report.json'), 'utf8'));
  expected = { questions: report.questions, images: report.images };
} else {
  file = path.join(directory, 'course.zip');
  expected = { questions: 1, images: 1 };
  const pqp = { format: 'portable-question-package', version: '1.0', source: { label: 'PQP browser course' }, classes: [{ id: 'course', name: 'Course', units: [] }],
    questions: [{ id: 'pqp-q1', kind: 'frq', content: { stem: { text: 'Read #image("/imgs/diagram.png").' }, solution: { text: '$2$' } }, scoring: { points: 3 }, classification: { classId: 'course', tags: [] }, assets: ['diagram'] }],
    assets: [{ id: 'diagram', kind: 'image', filename: 'diagram.png', storage: { mode: 'inline-base64', base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS1sAAAAASUVORK5CYII=' } }],
    extensions: { sourceNotes: ' '.repeat(11 * 1024 * 1024) },
  };
  const json = strToU8(JSON.stringify(pqp));
  await writeFile(file, zipSync({ 'all.pqp.json': json, 'sittings/one.pqp.json': json }));
}
const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
let browser;
try {
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewport({ width: 1440, height: 950 });
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('tg-tutorial-done-v1', '1');
    if (localStorage.getItem('pqp-fixture')) return;
    localStorage.setItem('pqp-fixture', '1');
    localStorage.setItem('math-test-bank-v2', JSON.stringify([{ id: 'original', body: 'Keep my existing question.', points: 2, tags: [], createdAt: 1 }]));
    localStorage.setItem('tg-gradebook-v1', JSON.stringify({ private: 'Keep my student records.' }));
  });
  await page.goto(`${server.resolvedUrls.local[0]}#/bank`, { waitUntil: 'networkidle0' });
  const before = await page.evaluate(() => ({ bank: localStorage.getItem('math-test-bank-v2'), gradebook: localStorage.getItem('tg-gradebook-v1') }));
  const click = async name => {
    const button = await page.evaluateHandle(name => [...document.querySelectorAll('button')].find(el => el.getClientRects().length && el.textContent.trim() === name), name);
    assert.ok(button.asElement(), `Button exists: ${name}`);
    await button.asElement().click(); await button.dispose();
  };
  const read = async () => {
    await click('Import bank ZIP');
    await page.waitForSelector('dialog input[type="file"]');
    await (await page.$('dialog input[type="file"]')).uploadFile(file);
    await page.waitForFunction(() => document.querySelector('dialog [role="alert"]') || document.querySelector('dialog [role="status"]')?.textContent.includes('ZIP checked'), { timeout: 90_000 });
    assert.match(await page.$eval('dialog', el => el.textContent), new RegExp(`${expected.questions} questions`));
    assert.match(await page.$eval('dialog', el => el.textContent), new RegExp(`${expected.images} pictures`));
    assert.equal(await page.$('dialog [role="alert"]'), null);
  };
  await read();
  assert.deepEqual(await page.evaluate(() => ({ bank: localStorage.getItem('math-test-bank-v2'), gradebook: localStorage.getItem('tg-gradebook-v1') })), before, 'reading a ZIP does not change existing work');
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => document.activeElement.textContent.trim()), 'Import bank ZIP', 'cancel restores focus');
  await read();
  const name = await page.$eval('dialog input[maxlength]', el => el.value);
  await click('Import as new bank');
  await page.waitForFunction(() => document.querySelector('dialog [role="alert"]') || document.querySelector('dialog [role="status"]')?.textContent.includes('separate bank'), { timeout: 90_000 });
  await click('Done');
  const verify = async () => page.evaluate(async name => {
    const { bankWorkspaces } = await import('/src/lib/bank-workspaces.svelte.ts');
    const entry = bankWorkspaces.banks.find(bank => bank.name === name);
    const data = await bankWorkspaces.readBankSnapshot(entry.id);
    return { questions: data.questions.length, images: data.images.length, classes: data.customClasses.length,
      uniqueIds: new Set(data.questions.map(question => question.id)).size,
      bank: localStorage.getItem('math-test-bank-v2'), gradebook: localStorage.getItem('tg-gradebook-v1') };
  }, name);
  const result = await verify();
  assert.equal(result.questions, expected.questions);
  assert.equal(result.uniqueIds, expected.questions);
  assert.equal(result.images, expected.images);
  assert.ok(result.classes > 0);
  assert.equal(result.bank, before.bank);
  assert.equal(result.gradebook, before.gradebook);
  await page.reload({ waitUntil: 'networkidle0' });
  assert.deepEqual(await verify(), result, 'new bank and pictures survive reload');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ...expected, savedAsSeparateBank: true, survivesReload: true, existingWorkPreserved: true }));
} finally {
  await browser?.close(); await server.close(); await rm(directory, { recursive: true, force: true });
}
