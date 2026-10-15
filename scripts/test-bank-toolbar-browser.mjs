import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';

// Synthetic data in an isolated browser; never reads host banks or student data.
// Optional: BANK_TOOLBAR_SHOTS=<dir> saves bank-toolbar-{wide,narrow}.png there.
const shotDir = process.env.BANK_TOOLBAR_SHOTS;
const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
let browser;
try {
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('tg-tutorial-done-v1', '1');
    if (!localStorage.getItem('math-test-bank-v2')) {
      localStorage.setItem('math-test-bank-v2', JSON.stringify(Array.from({ length: 6 }, (_, i) => ({
        id: `toolbar-q-${i}`, body: `Solve $x + ${i} = ${i + 3}$.`, tags: ['toolbar'], points: 2, createdAt: 1 + i,
        ...(i % 2 ? { choices: { A: '$3$', B: '$4$' }, answer: 'A' } : {}),
      }))));
    }
  });

  for (const [name, width, height] of [['wide', 1440, 900], ['narrow', 390, 844]]) {
    await page.setViewport({ width, height });
    await page.goto(`${server.resolvedUrls.local[0]}#/bank`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('.actions-section');
    const labels = await page.$$eval('.actions-section button', buttons => buttons.map(b => b.textContent.trim()));
    assert.deepEqual(labels, ['Image library', 'Check', 'Questions', 'Curriculum'], `${name}: bank toolbar has its actions and view controls`);
    assert.equal(await page.$('.sidebar-images'), null, `${name}: sidebar Images section is gone`);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${name}: no horizontal page scroll`);
    if (shotDir) await page.screenshot({ path: `${shotDir}/bank-toolbar-${name}.png` });
  }

  await page.setViewport({ width: 1440, height: 900 });
  // Previewing a question from a dormant bank marks it render-checked in that bank, but must
  // neither switch banks nor replace the question list with a loading message.
  const bankIds = await page.evaluate(async () => {
    const { bankWorkspaces } = await import('/src/lib/bank-workspaces.svelte.ts');
    const first = bankWorkspaces.activeBankId;
    await bankWorkspaces.createBank('Other Bank');
    return {
      first,
      current: bankWorkspaces.activeBankId,
      firstUpdatedAt: bankWorkspaces.banks.find(bank => bank.id === first).updatedAt,
    };
  });
  await page.waitForFunction(() => document.querySelector('.card[data-qid="toolbar-q-0"]') && !document.querySelector('.list .empty'));
  await page.evaluate(() => {
    window.__bankLoadingFlashed = false;
    new MutationObserver(() => {
      if (document.querySelector('.list')?.textContent.includes('Loading selected banks')) window.__bankLoadingFlashed = true;
    }).observe(document.querySelector('.list'), { childList: true, subtree: true, characterData: true });
  });
  await page.click('.card[data-qid="toolbar-q-0"]');
  await page.waitForFunction(async first => (await (await import('/src/lib/bank-workspaces.svelte.ts')).bankWorkspaces.readBankSnapshot(first))?.questions[0]?.checked === true, {}, bankIds.first);
  assert.equal(await page.evaluate(() => window.__bankLoadingFlashed), false, 'cross-bank preview does not flash a loading screen');
  assert.equal(await page.evaluate(async () => (await import('/src/lib/bank-workspaces.svelte.ts')).bankWorkspaces.activeBankId), bankIds.current, 'cross-bank preview does not switch the current bank');
  const previewWrite = await page.evaluate(async first => {
    const { bankWorkspaces } = await import('/src/lib/bank-workspaces.svelte.ts');
    const snapshot = await bankWorkspaces.readBankSnapshot(first);
    return {
      questionUpdatedAt: snapshot?.questions[0]?.updatedAt ?? null,
      bankUpdatedAt: bankWorkspaces.banks.find(bank => bank.id === first)?.updatedAt ?? null,
    };
  }, bankIds.first);
  assert.equal(previewWrite.questionUpdatedAt, null, 'preview validation does not mark the question as edited');
  assert.equal(previewWrite.bankUpdatedAt, bankIds.firstUpdatedAt, 'preview validation does not mark the bank as edited');

  await page.evaluate(() => [...document.querySelectorAll('.actions-section button')].find(b => b.textContent.trim() === 'Image library').click());
  await page.waitForSelector('[role="dialog"][aria-label="Image library"]');

  assert.deepEqual(errors, []);
  console.log('Bank toolbar tests passed: actions and view controls, no sidebar Images section, cross-bank preview without loading flash or bank switch, library opens.');
} finally {
  await browser?.close();
  await server.close();
}
