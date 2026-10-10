// Question banks kept in a workspace folder shared by two computers, end to end in the app.
// Two browser profiles stand for "work" and "home"; this script plays Drive between their folders.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';

const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
const url = server.resolvedUrls.local[0];
let browser;
try {
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const errors = [];

  async function computer(name) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ width: 1400, height: 900 });
    page.on('pageerror', error => errors.push(`${name}: ${error.message}`));
    page.on('dialog', dialog => void dialog.accept());
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(FileSystemDirectoryHandle.prototype, 'queryPermission', { configurable: true, value: async () => 'granted' });
      Object.defineProperty(FileSystemDirectoryHandle.prototype, 'requestPermission', { configurable: true, value: async () => 'granted' });
      window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('TestGen', { create: true });
      localStorage.setItem('tg-tutorial-done-v1', '1');
    });
    await page.goto(`${url}#/bank`, { waitUntil: 'networkidle0' });
    return page;
  }
  const waitReady = (page) => page.waitForFunction(async () => {
    const { localWorkspace } = await import('/src/lib/local-workspace.svelte.ts');
    return localWorkspace.status === 'ready' && !localWorkspace.busy;
  }, { timeout: 30000, polling: 200 });
  const bodies = (page) => page.evaluate(async () => {
    const { bank } = await import('/src/lib/bank.svelte.ts');
    return Object.fromEntries(bank.questions.map(q => [q.id, q.body]));
  });
  const syncNow = (page) => page.evaluate(async () => { await (await import('/src/lib/local-workspace.svelte.ts')).localWorkspace.saveNow(); });

  // Work: a browser bank with four questions becomes a new workspace.
  const work = await computer('work');
  await work.evaluate(async () => {
    const { bank } = await import('/src/lib/bank.svelte.ts');
    for (const id of ['a', 'b', 'c', 'd']) bank.questions = [...bank.questions, { id: `q-${id}`, body: `Question ${id}`, points: 2, tags: [], createdAt: 1 }];
    await (await import('/src/lib/local-workspace.svelte.ts')).localWorkspace.chooseFolder();
  });
  await waitReady(work);
  await syncNow(work);

  // Drive: changed files and deletions copy across; changed on both → a conflict copy.
  const files = (page) => page.evaluate(async () => {
    const out = {};
    const walk = async (dir, prefix) => {
      for await (const [name, handle] of dir.entries()) {
        if (handle.kind === 'directory') await walk(handle, `${prefix}${name}/`);
        else out[`${prefix}${name}`] = Array.from(new Uint8Array(await (await handle.getFile()).arrayBuffer())).join(',');
      }
    };
    await walk(await window.showDirectoryPicker(), '');
    return out;
  });
  const apply = (page, changes) => page.evaluate(async (changes) => {
    for (const [path, bytes] of Object.entries(changes)) {
      let dir = await window.showDirectoryPicker();
      const parts = path.split('/');
      for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part, { create: true });
      if (bytes === null) { await dir.removeEntry(parts.at(-1)).catch(() => undefined); continue; }
      const writable = await (await dir.getFileHandle(parts.at(-1), { create: true })).createWritable();
      await writable.write(new Uint8Array(bytes ? bytes.split(',').map(Number) : []));
      await writable.close();
    }
  }, changes);
  const synced = new Map();
  let home;
  async function drive() {
    const a = await files(work), b = home ? await files(home) : {};
    const toWork = {}, toHome = {};
    for (const path of new Set([...Object.keys(a), ...Object.keys(b), ...synced.keys()])) {
      const x = a[path], y = b[path], last = synced.get(path);
      if (x === y) { if (x === undefined) synced.delete(path); else synced.set(path, x); continue; }
      const aChanged = x !== last, bChanged = y !== last;
      if (aChanged && bChanged && x !== undefined && y !== undefined) {
        toHome[path] = x; toWork[`${path}.conflict1`] = y; toHome[`${path}.conflict1`] = y; synced.set(path, x);
      } else if (aChanged) { if (x === undefined) { toHome[path] = null; synced.delete(path); } else { toHome[path] = x; synced.set(path, x); } }
      else if (bChanged) { if (y === undefined) { toWork[path] = null; synced.delete(path); } else { toWork[path] = y; synced.set(path, y); } }
    }
    await apply(work, toWork);
    if (home) await apply(home, toHome);
    return toHome;
  }

  // Home: a fresh browser connects to the existing workspace and gets the bank.
  home = await computer('home');
  await apply(home, await files(work));
  for (const [path, value] of Object.entries(await files(work))) synced.set(path, value);
  await Promise.all([
    home.waitForNavigation({ waitUntil: 'networkidle0' }),
    home.evaluate(async () => { await (await import('/src/lib/local-workspace.svelte.ts')).localWorkspace.chooseFolder(); }),
  ]);
  await waitReady(home);
  assert.deepEqual(await bodies(home), { 'q-a': 'Question a', 'q-b': 'Question b', 'q-c': 'Question c', 'q-d': 'Question d' });

  // Edits to different questions on each computer reach the other without anyone doing anything.
  const edit = (page, id, body) => page.evaluate(async ({ id, body }) => (await import('/src/lib/bank.svelte.ts')).bank.update(id, { body }), { id, body });
  await edit(work, 'q-a', 'A edited at work');
  await edit(home, 'q-b', 'B edited at home');
  await syncNow(work); await syncNow(home);
  await drive();
  const waitBodies = (page, expected) => page.waitForFunction(async (expected) => {
    const { bank } = await import('/src/lib/bank.svelte.ts');
    return Object.entries(expected).every(([id, body]) => (body === null ? !bank.questions.some(q => q.id === id) : bank.questions.find(q => q.id === id)?.body === body));
  }, { timeout: 20000, polling: 300 }, expected);
  await waitBodies(work, { 'q-a': 'A edited at work', 'q-b': 'B edited at home' });
  await waitBodies(home, { 'q-a': 'A edited at work', 'q-b': 'B edited at home' });

  // The same question edited on both before Drive caught up: the newer edit is kept on both, and
  // the other is offered for review where it lost; choosing it spreads.
  await edit(work, 'q-c', 'C edited at work');
  await new Promise(r => setTimeout(r, 30));
  await edit(home, 'q-c', 'C edited at home');
  await syncNow(work); await syncNow(home); await drive(); await syncNow(work); await syncNow(home); await drive(); await syncNow(work); await syncNow(home);
  await waitBodies(work, { 'q-c': 'C edited at home' });
  await waitBodies(home, { 'q-c': 'C edited at home' });
  const review = await work.evaluate(async () => (await import('/src/lib/banks-folder-sync.svelte.ts')).banksFolderSync.review.map(item => ({ kept: item.kept, other: item.other })));
  assert.deepEqual(review, [{ kept: 'C edited at home', other: 'C edited at work' }]);
  await work.evaluate(async () => {
    const { banksFolderSync } = await import('/src/lib/banks-folder-sync.svelte.ts');
    const [item] = banksFolderSync.review;
    await item.restore(); banksFolderSync.dismiss(item);
  });
  await syncNow(work); await drive();
  await waitBodies(home, { 'q-c': 'C edited at work' });

  // Deleting a question on one computer removes it on the other.
  await home.evaluate(async () => (await import('/src/lib/bank.svelte.ts')).bank.remove('q-d'));
  await syncNow(home); await drive();
  await waitBodies(work, { 'q-d': null });

  // A bank created at home and added to the workspace appears at work.
  await home.evaluate(async () => {
    const { bankWorkspaces } = await import('/src/lib/bank-workspaces.svelte.ts');
    const { bank } = await import('/src/lib/bank.svelte.ts');
    await bankWorkspaces.createBank('Home bank');
    bank.add({ body: 'Made at home', points: 1, tags: [] });
    await (await import('/src/lib/local-workspace.svelte.ts')).localWorkspace.addActiveBank();
  });
  await syncNow(home); await drive();
  await work.waitForFunction(async () => {
    const { bankWorkspaces } = await import('/src/lib/bank-workspaces.svelte.ts');
    const { workspaceCatalog } = await import('/src/lib/workspace-catalog.svelte.ts');
    return bankWorkspaces.banks.some(b => b.name === 'Home bank') && workspaceCatalog.questions.some(q => q.body === 'Made at home');
  }, { timeout: 20000, polling: 300 });

  // Every bank folder stays readable by the strict bank reader.
  const valid = await work.evaluate(async () => {
    const { readRepoFolder } = await import('/src/lib/folder-io.ts');
    const { importRepoEntriesToAppData } = await import('/src/git/repoDataModel.ts');
    const banks = await (await window.showDirectoryPicker()).getDirectoryHandle('banks');
    const out = {};
    for await (const [name, dir] of banks.entries()) out[name] = importRepoEntriesToAppData(await readRepoFolder(dir)).appData.questions.length;
    return out;
  });
  assert.equal(Object.values(valid).length, 2);

  assert.deepEqual(errors, []);
  console.log('Banks folder sync passed: a new workspace from work; a fresh browser at home gets the bank; edits on each computer reach the other on their own; the same question edited on both keeps the newer and offers the other, and the choice spreads; deletions spread; a bank created at home appears at work; folders stay strictly valid.');
} finally {
  await browser?.close();
  await server.close();
}
