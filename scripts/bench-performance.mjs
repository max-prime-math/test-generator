// Synthetic, isolated responsiveness benchmark. Uses a fresh browser profile and
// generated data only; never reads real banks. Drives the UI through the DOM so
// the same script measures the app before and after performance changes.
//   node scripts/bench-performance.mjs [--label name] [--json out.json]
import puppeteer from 'puppeteer';
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';

const arg = name => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const label = arg('--label') ?? 'run';
const ACTIVE_QUESTIONS = 4_000, OTHER_QUESTIONS = 2_500, DRAFTS = 2_000, IMAGES = 250;

const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
server.middlewares.use('/bench-seed.html', (_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>seed</title>'); });
await server.listen();
const origin = server.resolvedUrls.local[0];
const results = { label, fixture: { banks: 4, questions: ACTIVE_QUESTIONS + 3 * OTHER_QUESTIONS, drafts: DRAFTS, imagesInImageBank: IMAGES } };
let browser;
const stats = values => {
  const sorted = [...values].sort((a, b) => a - b);
  const q = p => Math.round(sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0);
  return { n: values.length, p50: q(0.5), p95: q(0.95), max: Math.round(sorted.at(-1) ?? 0) };
};

try {
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 950 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  results.dialogs = [];
  page.on('dialog', dialog => { results.dialogs.push(dialog.message().slice(0, 300)); void dialog.dismiss(); });
  await page.evaluateOnNewDocument(() => {
    window.__lt = [];
    try { new PerformanceObserver(list => { for (const e of list.getEntries()) window.__lt.push({ at: e.startTime, ms: e.duration }); }).observe({ type: 'longtask', buffered: true }); } catch {}
  });

  // ── Seed ────────────────────────────────────────────────────────────────
  await page.goto(`${origin}bench-seed.html`);
  await page.evaluate(async ({ ACTIVE_QUESTIONS, OTHER_QUESTIONS, DRAFTS, IMAGES }) => {
    const text = (b, i) => `Bank ${b} question ${i}: Solve $x^2 + ${i % 97}x - ${(i * 7) % 53} = 0$ and explain each step. Tag ${i % 13}.`;
    const questions = (b, n) => Array.from({ length: n }, (_, i) => ({ id: `${b}-q-${i}`, body: text(b, i), points: 1 + (i % 5),
      tags: [`t${i % 13}`], classId: 'bench-class', createdAt: 1, checked: true, ...(i % 4 === 0 ? { choices: { A: '$1$', B: '$2$', C: '$3$', D: '$4$' }, answer: 'B' } : { solution: `Use the formula for ${i}.` }) }));
    const now = Date.now();
    const bank = id => ({ id, name: `Bench ${id.slice(-1).toUpperCase()}`, gitRepoId: `test-generator-bank-${id}`, createdAt: now, updatedAt: now });
    localStorage.setItem('tg-tutorial-done-v1', '1');
    localStorage.setItem('tg-perf-diagnostics-v1', '1');
    localStorage.setItem('tg-bank-workspaces-v1', JSON.stringify(['bench-a', 'bench-b', 'bench-c', 'bench-d'].map(bank)));
    localStorage.setItem('tg-active-bank-id-v1', 'bench-a');
    localStorage.setItem('math-test-bank-v2', JSON.stringify(questions('A', ACTIVE_QUESTIONS)));
    localStorage.setItem('math-test-custom-classes-v1', JSON.stringify([{ id: 'bench-class', name: 'Bench class', units: [] }]));
    const drafts = Array.from({ length: DRAFTS }, (_, i) => ({ id: `draft-${i}`, sourceId: i % 2 ? `A-q-${i}` : undefined, mcq: false,
      fields: { body: `Draft ${i}: evaluate $integral_0^${i % 9 + 1} x^2 dif x$.`, answer: '', solution: 'Work shown here.', questionType: 'frq', classId: 'bench-class', unitId: '', sectionId: '', points: 3, tagInput: 'draft' } }));
    localStorage.setItem('tg-editor-v1:bench-a', JSON.stringify({ version: 1, drafts, defaults: { classId: '', unitId: '', sectionId: '', points: 5, tagInput: '' }, activeId: null }));
    const open = (name, version, upgrade) => new Promise((resolve, reject) => { const r = version === undefined ? indexedDB.open(name) : indexedDB.open(name, version); r.onupgradeneeded = () => upgrade(r.result); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const done = tx => new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
    const snapshots = await open('test-generator-bank-snapshots', 1, db => db.createObjectStore('snapshots', { keyPath: 'key' }).createIndex('bankId', 'bankId'));
    let tx = snapshots.transaction('snapshots', 'readwrite');
    for (const id of ['bench-b', 'bench-c', 'bench-d']) {
      const letter = id.slice(-1).toUpperCase();
      const qs = questions(letter, OTHER_QUESTIONS);
      if (id === 'bench-d') qs.forEach((q, i) => { if (i < IMAGES) { q.body += `\n#image("/imgs/pic-${i}", width: 3cm)`; q.images = [`pic-${i}`]; } });
      for (const [name, value] of [['math-test-bank-v2', qs], ['math-test-custom-classes-v1', [{ id: 'bench-class', name: 'Bench class', units: [] }]], ['tg-narratives-v1', []]])
        tx.objectStore('snapshots').put({ key: `tg-bank:${id}:${name}`, bankId: id, name, value: JSON.stringify(value) });
    }
    await done(tx); snapshots.close();
    // Version-agnostic: the app may already have created or upgraded this database.
    let images = await open('test-generator', undefined, () => {});
    if (!images.objectStoreNames.contains('bankImages')) {
      const version = images.version + 1; images.close();
      images = await open('test-generator', version, db => {
        if (!db.objectStoreNames.contains('images')) db.createObjectStore('images', { keyPath: 'name' });
        db.createObjectStore('bankImages', { keyPath: 'id' }).createIndex('bankId', 'bankId');
      });
    }
    const padding = '<!--' + 'x'.repeat(120_000) + '-->';
    tx = images.transaction('bankImages', 'readwrite');
    for (let i = 0; i < IMAGES; i++) {
      const bytes = new TextEncoder().encode(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><circle cx="20" cy="20" r="${5 + i % 15}" fill="hsl(${i * 7},70%,50%)"/>${padding}</svg>`);
      tx.objectStore('bankImages').put({ id: `bench-d:pic-${i}`, bankId: 'bench-d', image: { name: `pic-${i}`, ext: 'svg', mime: 'image/svg+xml', size: bytes.byteLength, bytes } });
    }
    await done(tx); images.close();
  }, { ACTIVE_QUESTIONS, OTHER_QUESTIONS, DRAFTS, IMAGES });

  const longTasks = async since => page.evaluate(since => {
    const tasks = window.__lt.filter(t => t.at >= since);
    return { count: tasks.length, maxMs: Math.round(Math.max(0, ...tasks.map(t => t.ms))), totalMs: Math.round(tasks.reduce((s, t) => s + t.ms, 0)) };
  }, since);
  const now = () => page.evaluate(() => performance.now());

  // ── Cold startup ──────────────────────────────────────────────────────
  let started = Date.now();
  await page.goto(`${origin}#/bank`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.card', { timeout: 120_000 });
  results.coldStartToBankList = { ms: Date.now() - started, longTasks: await longTasks(0) };
  await page.waitForNetworkIdle({ idleTime: 500, timeout: 120_000 }).catch(() => {});

  // ── Question selection → highlighted, → preview ───────────────────────
  const selectTimes = [], previewTimes = [];
  for (let i = 1; i <= 10; i++) {
    const t = await page.evaluate(async index => {
      const cards = document.querySelectorAll('.card');
      const card = cards[index];
      const t0 = performance.now();
      card.click();
      await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
      const selected = card.classList.contains('selected') ? performance.now() - t0 : -1;
      const id = card.dataset.qid;
      await new Promise(resolve => {
        const check = () => {
          const svg = document.querySelector('.preview-svg:not(.stale) svg');
          const owner = document.querySelector('[data-preview-for]')?.getAttribute('data-preview-for');
          if (svg && (!owner || owner === id)) resolve(); else requestAnimationFrame(check);
        };
        check();
      });
      return { selected, preview: performance.now() - t0 };
    }, i * 3);
    selectTimes.push(t.selected); previewTimes.push(t.preview);
  }
  results.selectToHighlight = stats(selectTimes);
  results.selectToPreview = stats(previewTimes);

  // ── Rapid keyboard navigation ─────────────────────────────────────────
  let since = await now();
  await page.focus('.card.selected');
  const rapid = await page.evaluate(async () => {
    const t0 = performance.now();
    const target = document.activeElement;
    for (let i = 0; i < 15; i++) { target.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); await new Promise(r => setTimeout(r, 30)); }
    const tKeys = performance.now();
    const id = document.querySelector('.card.selected')?.dataset.qid;
    await new Promise(resolve => {
      const check = () => {
        const svg = document.querySelector('.preview-svg:not(.stale) svg');
        const owner = document.querySelector('[data-preview-for]')?.getAttribute('data-preview-for');
        if (svg && (!owner || owner === id)) resolve(); else requestAnimationFrame(check);
      };
      setTimeout(check, 0);
    });
    return { keysMs: Math.round(tKeys - t0), lastKeyToPreviewMs: Math.round(performance.now() - tKeys) };
  });
  results.rapidNavigation = { ...rapid, longTasks: await longTasks(since) };

  // ── Editor typing with thousands of drafts ────────────────────────────
  since = await now();
  started = Date.now();
  await page.evaluate(() => { location.hash = '#/editor'; });
  await page.waitForSelector('.draft-row .item', { timeout: 60_000 });
  results.editorOpen = { ms: Date.now() - started };
  // Draft selection → editable content (textarea shows that draft's text).
  const draftTimes = [];
  for (let i = 0; i < 10; i++) {
    draftTimes.push(await page.evaluate(async index => {
      const buttons = document.querySelectorAll('.draft-row .item');
      const button = buttons[index];
      const expected = button.querySelector('span')?.textContent.slice(0, 20) ?? '';
      const t0 = performance.now();
      button.click();
      await new Promise(resolve => { const check = () => document.querySelector('textarea')?.value.startsWith(expected) ? resolve() : requestAnimationFrame(check); check(); });
      return performance.now() - t0;
    }, i * 5 + 1));
  }
  results.draftSelectToEditable = stats(draftTimes);
  await page.click('.draft-row .item');
  await page.waitForSelector('textarea');
  await page.focus('textarea');
  await page.evaluate(() => {
    window.__keys = [];
    document.addEventListener('keydown', () => { const t0 = performance.now(); requestAnimationFrame(() => setTimeout(() => window.__keys.push(performance.now() - t0), 0)); }, true);
  });
  since = await now();
  await page.keyboard.type(' plus a note typed while previews render quickly', { delay: 15 });
  await new Promise(r => setTimeout(r, 600));
  results.editorKeyToPaint = { ...stats(await page.evaluate(() => window.__keys)), longTasks: await longTasks(since) };

  // ── Bank switching ────────────────────────────────────────────────────
  await page.evaluate(() => { location.hash = '#/bank'; });
  const switchTo = async (id, letter) => {
    const t0 = Date.now();
    await page.select('select[aria-label="Current bank"]', id);
    for (;;) {
      try {
        await page.waitForFunction(l => document.querySelector('.card .body')?.textContent.startsWith(`Bank ${l} `), { timeout: 60_000, polling: 16 }, letter);
        break;
      } catch (error) { if (!/context|detached|destroyed|navigation/i.test(error.message)) throw error; }
    }
    return Date.now() - t0;
  };
  since = await now();
  const switches = [];
  switches.push(['A→B', await switchTo('bench-b', 'B')]);
  switches.push(['B→D (250 images)', await switchTo('bench-d', 'D')]);
  switches.push(['D→C', await switchTo('bench-c', 'C')]);
  switches.push(['C→A (2,000 drafts)', await switchTo('bench-a', 'A')]);
  results.bankSwitch = Object.fromEntries(switches);
  results.bankSwitchLongTasks = await longTasks(0).catch(() => null);

  // Rapid switching: two changes back to back, the last one must win.
  try {
  const t0 = Date.now();
  await page.select('select[aria-label="Current bank"]', 'bench-b').catch(() => {});
  await page.select('select[aria-label="Current bank"]', 'bench-c').catch(() => {});
  for (;;) {
    try { await page.waitForFunction(() => document.querySelector('.card .body')?.textContent.startsWith('Bank C ') && document.querySelector('select[aria-label="Current bank"]').value === 'bench-c', { timeout: 120_000, polling: 16 }); break; }
    catch (error) { if (!/context|detached|destroyed|navigation/i.test(error.message)) throw error; }
  }
  results.rapidSwitchLastWins = { ms: Date.now() - t0, bank: await page.$eval('select[aria-label="Current bank"]', s => s.value) };
  } catch (error) { results.rapidSwitchLastWins = { failed: error.message.split('\n')[0] }; }
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.card', { timeout: 120_000 });

  // ── Image library initialization (image-heavy bank) ───────────────────
  await switchTo('bench-d', 'D');
  results.imageInit = await page.evaluate(async () => {
    const { imageStore } = await import('/src/lib/image-store.svelte.ts');
    const t0 = performance.now();
    await imageStore.init();
    return { ms: Math.round(performance.now() - t0), images: imageStore.names.length };
  });
  results.appReport = await page.evaluate(() => window.__tgPerf?.report?.() ?? null);
  results.pageErrors = errors;
} catch (error) {
  results.failure = error.message.split('\n')[0];
  process.exitCode = 1;
} finally {
  await browser?.close();
  await server.close();
}
console.log(JSON.stringify(results, null, 2));
const out = arg('--json');
if (out) writeFileSync(out, JSON.stringify(results, null, 2));
