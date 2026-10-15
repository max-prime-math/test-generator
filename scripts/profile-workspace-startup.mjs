import puppeteer from 'puppeteer';
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';

// Synthetic data in an isolated browser; never reads host banks or student data.
// Profiles a warm reload of a workspace of BANKS banks x QUESTIONS questions (with images).
// Real-workspace scale (~28 banks, ~14,700 questions, ~8,100 images; first open takes minutes):
//   BANKS=28 QUESTIONS=525 IMAGES=290 IMAGE_BYTES=25000 node scripts/profile-workspace-startup.mjs
// PROFILE_OUT=<file>.cpuprofile saves a CPU profile of the second reload (open it in Chrome DevTools).
const BANKS = Number(process.env.BANKS ?? 12), QUESTIONS = Number(process.env.QUESTIONS ?? 300), IMAGES = Number(process.env.IMAGES ?? 15), IMAGE_BYTES = Number(process.env.IMAGE_BYTES ?? 40_000);
const profileOut = process.env.PROFILE_OUT;
const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
let browser;
try {
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'], protocolTimeout: 0 });
  const page = await browser.newPage();
  page.on('pageerror', error => console.log('pageerror', error.message));
  await page.setViewport({ width: 1450, height: 1000 });
  page.setDefaultTimeout(0); page.setDefaultNavigationTimeout(0);
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('tg-tutorial-done-v1', '1');
    window.confirm = () => true;
    Object.defineProperty(FileSystemDirectoryHandle.prototype, 'queryPermission', { configurable: true, value: async () => 'granted' });
    Object.defineProperty(FileSystemDirectoryHandle.prototype, 'requestPermission', { configurable: true, value: async () => 'granted' });
    window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('profile-fixture', { create: true });
    window.__fileReads = 0;
    const getFile = FileSystemFileHandle.prototype.getFile;
    FileSystemFileHandle.prototype.getFile = function (...args) { window.__fileReads++; return getFile.apply(this, args); };
    window.__longTasks = [];
    new PerformanceObserver(list => { for (const e of list.getEntries()) window.__longTasks.push(e.duration); }).observe({ type: 'longtask', buffered: true });
    window.__phases = [];
    let last = '';
    const t0 = performance.now();
    const poll = async () => {
      try {
        const { localWorkspace } = await import('/src/lib/local-workspace.svelte.ts');
        const p = localWorkspace.loadingProgress;
        const label = p ? `${p.phase}${p.detail ? ' · ' + p.detail : ''}` : `(idle, status ${localWorkspace.status})`;
        if (label !== last) { window.__phases.push([Math.round(performance.now() - t0), label]); last = label; }
      } catch {}
      setTimeout(poll, 20);
    };
    addEventListener('DOMContentLoaded', poll);
  });
  await page.goto(server.resolvedUrls.local[0], { waitUntil: 'networkidle0' });
  console.log(`Building fixture: ${BANKS} banks x ${QUESTIONS} questions, ${IMAGES} images each…`);
  await page.evaluate(async (BANKS, QUESTIONS, IMAGES, IMAGE_BYTES) => {
    const { writeRepoFolder, writeText } = await import('/src/lib/folder-io.ts');
    const { exportAppDataToRepoEntries } = await import('/src/git/repoDataModel.ts');
    const root = await window.showDirectoryPicker();
    const banks = await root.getDirectoryHandle('banks', { create: true });
    const filler = 'x'.repeat(IMAGE_BYTES);
    for (let b = 0; b < BANKS; b++) {
      const id = `profile-${b}`;
      const data = {
        questions: Array.from({ length: QUESTIONS }, (_, i) => ({
          id: `p${b}-q-${i}`, classId: 'math-20-1', unitId: 'u1', points: 2, tags: ['algebra', 'unit-1'], createdAt: 1,
          body: `Question ${b}-${i}: Solve for $x$ in $${i}x + 3 = ${i + 7}$. Show all your work and justify each step.${i < IMAGES ? ` #image("/imgs/fig-${b}-${i}.svg")` : ''}`,
          solution: `Subtract 3 then divide by ${i}: $x = 4/${i}$.`,
          images: i < IMAGES ? [`fig-${b}-${i}`] : [],
        })),
        narratives: [], customClasses: [], savedTests: [],
        images: Array.from({ length: IMAGES }, (_, i) => ({ name: `fig-${b}-${i}`, ext: 'svg', bytes: new TextEncoder().encode(`<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><!-- ${filler} --><text x="2" y="15">${i}</text></svg>`) })),
      };
      const folder = await banks.getDirectoryHandle(id, { create: true });
      await writeRepoFolder(folder, exportAppDataToRepoEntries(data), 'absent');
      await writeText(folder, 'bank-name.json', JSON.stringify({ name: `Profile bank ${b}` }));
    }
  }, BANKS, QUESTIONS, IMAGES, IMAGE_BYTES);
  const ready = () => page.waitForFunction(async () => {
    const { localWorkspace } = await import('/src/lib/local-workspace.svelte.ts');
    return localWorkspace.status === 'ready' && !localWorkspace.busy;
  }, { timeout: 600000, polling: 100 });
  let t = Date.now();
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0' }),
    page.evaluate(async () => (await import('/src/lib/local-workspace.svelte.ts')).localWorkspace.chooseFolder()),
  ]);
  await ready();
  console.log(`First open of the folder: ${Date.now() - t} ms`);
  await new Promise(r => setTimeout(r, 4000)); // let the post-open save settle

  await page.evaluate(async () => {
    const { bankWorkspaces } = await import('/src/lib/bank-workspaces.svelte.ts');
    localStorage.setItem('tg-bank-corpus-selection-v1', JSON.stringify(bankWorkspaces.banks.map(bank => bank.id)));
    location.hash = '/bank';
  });
  for (const run of [1, 2]) {
    const client = await page.createCDPSession();
    if (profileOut && run === 2) { await client.send('Profiler.enable'); await client.send('Profiler.setSamplingInterval', { interval: 500 }); await client.send('Profiler.start'); }
    t = Date.now();
    await page.reload({ waitUntil: 'domcontentloaded' });
    const tDom = Date.now() - t;
    await page.waitForFunction(async () => (await import('/src/lib/workspace-catalog.svelte.ts')).workspaceCatalog.questions.length > 0, { timeout: 600000, polling: 50 });
    const tCatalog = Date.now() - t;
    await page.waitForFunction(() => document.querySelectorAll('.list .card').length > 0 && !document.querySelector('.list .empty'), { timeout: 600000, polling: 50 });
    const tBankList = Date.now() - t;
    await ready();
    const tReady = Date.now() - t;
    if (profileOut && run === 2) { const { profile } = await client.send('Profiler.stop'); writeFileSync(profileOut, JSON.stringify(profile)); }
    const info = await page.evaluate(async () => ({
      phases: window.__phases, fileReads: window.__fileReads,
      longTasks: window.__longTasks.length, longest: Math.round(Math.max(0, ...window.__longTasks)), blocked: Math.round(window.__longTasks.reduce((a, b) => a + b, 0)),
      questions: (await import('/src/lib/workspace-catalog.svelte.ts')).workspaceCatalog.questions.length,
      catalogImages: (await import('/src/lib/workspace-catalog.svelte.ts')).workspaceCatalog.images.length,
      storeImages: (await import('/src/lib/image-store.svelte.ts')).imageStore.names.length,
    }));
    console.log(`\nReload ${run}: DOM ${tDom} ms, catalog visible ${tCatalog} ms, bank list (all banks) ${tBankList} ms, workspace ready ${tReady} ms (${info.questions} questions, ${info.catalogImages} catalog images, ${info.storeImages} in active store, ${info.fileReads} file reads)`);
    console.log(`  main thread: ${info.longTasks} long tasks, ${info.blocked} ms blocked, longest ${info.longest} ms`);
    for (const [ms, label] of info.phases) console.log(`  ${String(ms).padStart(6)} ms  ${label}`);
  }
} finally {
  await browser?.close();
  await server.close();
}
