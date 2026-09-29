// Synthetic bank-switch benchmark with a connected workspace folder. Isolated
// browser profile and origin-private filesystem only; never reads host banks.
//   node scripts/bench-workspace-switch.mjs [--banks 8] [--questions 800] [--images 200]
//   node scripts/bench-workspace-switch.mjs --from ~/TestGen   (copies a real workspace's banks/ and tests/, never the gradebook, into the isolated browser; read-only)
import puppeteer from 'puppeteer';
import { createServer } from 'vite';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 ? Number(process.argv[i + 1]) : fallback; };
const BANKS = arg('--banks', 8), QUESTIONS = arg('--questions', 800), IMAGES = arg('--images', 200);

const fromIndex = process.argv.indexOf('--from');
const FROM = fromIndex > 0 ? process.argv[fromIndex + 1] : null;
const walk = dir => readdirSync(dir).flatMap(name => statSync(join(dir, name)).isDirectory() ? walk(join(dir, name)) : [join(dir, name)]);
const fixturePlugin = { name: 'bench-fixture', configureServer(server) {
  if (!FROM) return;
  server.middlewares.use('/__bench-list', (_req, res) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(walk(FROM).map(file => relative(FROM, file)).filter(path => /^(banks|tests)\//.test(path)))); });
  server.middlewares.use('/__bench-file', (req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').searchParams.get('path'));
    if (path.includes('..')) { res.statusCode = 400; res.end(); return; }
    res.end(readFileSync(join(FROM, path)));
  });
} };
const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error', plugins: [fixturePlugin] });
await server.listen();
let browser;
try {
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 1000 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('tg-tutorial-done-v1', '1');
    localStorage.setItem('tg-perf-diagnostics-v1', '1');
    window.confirm = () => true;
    Object.defineProperty(FileSystemDirectoryHandle.prototype, 'queryPermission', { configurable: true, value: async () => 'granted' });
    Object.defineProperty(FileSystemDirectoryHandle.prototype, 'requestPermission', { configurable: true, value: async () => 'granted' });
    window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('bench-workspace', { create: true });
  });
  await page.goto(server.resolvedUrls.local[0], { waitUntil: 'networkidle0' });
  if (FROM) await page.evaluate(async () => {
    const root = await window.showDirectoryPicker();
    const files = await (await fetch('/__bench-list')).json();
    for (let i = 0; i < files.length; i += 32) await Promise.all(files.slice(i, i + 32).map(async path => {
      let dir = root; const parts = path.split('/');
      for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part, { create: true });
      const writable = await (await dir.getFileHandle(parts.at(-1), { create: true })).createWritable();
      await writable.write(await (await fetch(`/__bench-file?path=${encodeURIComponent(path)}`)).arrayBuffer()); await writable.close();
    }));
  });
  else await page.evaluate(async ({ BANKS, QUESTIONS, IMAGES }) => {
    const { writeRepoFolder, writeText } = await import('/src/lib/folder-io.ts');
    const { exportAppDataToRepoEntries } = await import('/src/git/repoDataModel.ts');
    const root = await window.showDirectoryPicker();
    const banks = await root.getDirectoryHandle('banks', { create: true });
    for (let b = 0; b < BANKS; b++) {
      const images = Array.from({ length: IMAGES }, (_, i) => {
        const bytes = new Uint8Array(40_000); crypto.getRandomValues(bytes.subarray(0, 40_000));
        return { name: `img-${b}-${i}`, ext: 'jpg', bytes };
      });
      const questions = Array.from({ length: QUESTIONS }, (_, q) => ({ id: `b${b}-q${q}`, classId: 'bench-class', points: 2, createdAt: 1, tags: ['bench'],
        body: `Bank ${b} question ${q}: solve $x^2 + ${q % 17}x = ${q % 29}$.${q < IMAGES ? ` #image("/imgs/img-${b}-${q}.jpg")` : ''}`,
        images: q < IMAGES ? [`img-${b}-${q}`] : [], solution: 'Factor and solve.' }));
      const folder = await banks.getDirectoryHandle(`bank-${b}`, { create: true });
      await writeRepoFolder(folder, exportAppDataToRepoEntries({ questions, narratives: [], savedTests: [], images,
        customClasses: [{ id: 'bench-class', name: 'Bench class', units: [] }] }), 'absent');
      await writeText(folder, 'bank-name.json', JSON.stringify({ name: `Bench bank ${b}` }));
    }
  }, { BANKS, QUESTIONS, IMAGES });
  const t0 = Date.now();
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 600_000 }),
    page.evaluate(async () => { const { localWorkspace } = await import('/src/lib/local-workspace.svelte.ts'); await localWorkspace.chooseFolder(); }),
  ]);
  const settled = () => page.waitForFunction(async () => {
    const { localWorkspace } = await import('/src/lib/local-workspace.svelte.ts');
    await localWorkspace.idle();
    return localWorkspace.status === 'ready' && !localWorkspace.busy;
  }, { timeout: 600_000, polling: 100 });
  await settled();
  // Let the first autosave pass (which visits every bank) finish before timing.
  await new Promise(resolve => setTimeout(resolve, 6000));
  await settled();
  console.log(`Workspace ready in ${Date.now() - t0} ms (${FROM ? FROM : `${BANKS} banks x ${QUESTIONS} questions, ${IMAGES} images each`})`);
  await page.evaluate(async () => { const { perf } = await import('/src/lib/perf-diagnostics.ts'); perf.clear(); });

  const results = [];
  const targets = FROM ? ['default', 'pre-calculus-12-examview', 'cemc-ctmc', 'default'] : ['bank-1', 'bank-2', 'bank-1', 'bank-3'];
  for (const target of targets) {
    const start = Date.now();
    await page.select('select[aria-label="Current bank"]', target);
    await page.waitForFunction(async id => {
      const { bankWorkspaces } = await import('/src/lib/bank-workspaces.svelte.ts');
      return bankWorkspaces.activeBankId === id && !bankWorkspaces.switching;
    }, { timeout: 600_000, polling: 16 }, target);
    const switched = Date.now() - start;
    if (!FROM) await page.waitForFunction(id => document.querySelector('.card .body')?.textContent.startsWith(`Bank ${id.slice(-1)} `), { timeout: 600_000, polling: 16 }, target);
    const shown = Date.now() - start;
    // The next autosave pass after a switch; the bank selector is disabled while it runs.
    await new Promise(resolve => setTimeout(resolve, 3000));
    await settled();
    const counts = await page.evaluate(async () => {
      const { imageStore } = await import('/src/lib/image-store.svelte.ts');
      const db = await new Promise(resolve => { const r = indexedDB.open('test-generator'); r.onsuccess = () => resolve(r.result); });
      const stores = [...db.objectStoreNames];
      const bankStore = stores.find(name => /bank/i.test(name));
      const bankRecords = bankStore ? await new Promise(resolve => { const r = db.transaction(bankStore).objectStore(bankStore).count(); r.onsuccess = () => resolve(r.result); }) : null;
      db.close();
      return { activeImages: imageStore.names.length, bankImageRecords: bankRecords };
    });
    results.push({ target, switchedMs: switched, questionsShownMs: shown, settledMs: Date.now() - start - 3000, ...counts });
  }
  console.table(results);
  const report = await page.evaluate(async () => { const { perf } = await import('/src/lib/perf-diagnostics.ts'); return perf.report(); });
  const rows = Object.entries(report.timings ?? {}).filter(([name]) => /Bank switch|Folder|Workspace|Catalog|Image/.test(name))
    .map(([name, s]) => ({ name, count: s.count, p50: s.p50, max: s.max }));
  console.table(rows);
  if (errors.length) console.log('Page errors:', errors);
} finally {
  await browser?.close();
  await server.close();
}
