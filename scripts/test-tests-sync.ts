import assert from 'node:assert/strict';
import {
  emptyTestsSyncState, otherVersion, syncTests, testHash, TEST_FILE, TEST_FILE_FORMAT,
  type FolderEntry, type LocalTests, type TestsIO, type TestsSyncState, type Tombstone,
} from '../src/lib/tests-sync-core.ts';
import { stableJson } from '../src/lib/gradebook-records.ts';
import { defaultTestConfig, type SavedTest } from '../src/lib/types.ts';

// Saved tests in a workspace folder shared by two computers through a lagging Drive.

let clock = 1_700_000_000_000;
const tick = () => (clock += 1000);
type Files = Map<string, { text: string; version: number }>;
let versions = 0;

function testsIO(files: Files, failing = () => false): TestsIO {
  const set = (path: string, text: string) => { if (failing()) throw new Error('disk full'); files.set(path, { text, version: ++versions }); };
  return {
    async scan() {
      const folders = new Map<string, FolderEntry>();
      for (const [path, file] of files) {
        const match = /^(tests\/[^/]+\/([^/]+))\/(.+)$/.exec(path);
        if (!match) continue;
        const [, folder, id, name] = match;
        const entry = folders.get(folder) ?? { folder, id, stamp: null, deleted: null, extras: [] };
        if (name === TEST_FILE) entry.stamp = String(file.version);
        else if (name === 'deleted.json') entry.deleted = JSON.parse(file.text);
        else if (name === 'legacy-test.json') entry.extras.push({ source: 'legacy', stamp: String(file.version) });
        else if (/^test.*\.json/.test(name)) entry.extras.push({ source: name, stamp: String(file.version) });
        folders.set(folder, entry);
      }
      return [...folders.values()];
    },
    async read(folder) { return parse(files.get(`${folder}/${TEST_FILE}`)!.text); },
    async readExtra(folder, source) { return parse(files.get(`${folder}/${source === 'legacy' ? 'legacy-test.json' : source}`)!.text); },
    async write(folder, test) {
      const frozen = { ...test, questionSnapshots: test.questionSnapshots ?? [] };
      set(`${folder}/${TEST_FILE}`, JSON.stringify({ format: TEST_FILE_FORMAT, version: 1, test: frozen, images: [] }));
      files.delete(`${folder}/deleted.json`);
      return { stamp: String(files.get(`${folder}/${TEST_FILE}`)!.version), test: frozen };
    },
    async tombstone(folder, info: Tombstone) {
      const current = files.get(`${folder}/${TEST_FILE}`);
      set(`${folder}/deleted.json`, JSON.stringify({ ...info, ...(current ? { hash: testHash(parse(current.text)) } : {}) }));
    },
    async readMerged(folder) {
      // A sync tool may have made conflict copies of merged.json too: read them all.
      return [...files].filter(([path]) => path.startsWith(`${folder}/merged.json`)).flatMap(([, file]) => JSON.parse(file.text) as string[]);
    },
    async addMerged(folder, key) {
      const path = `${folder}/merged.json`;
      const list = files.has(path) ? JSON.parse(files.get(path)!.text) as string[] : [];
      if (!list.includes(key)) set(path, JSON.stringify([...list, key]));
    },
    folderFor: test => `tests/${test.classId ?? '_unclassified'}/${test.id}`,
  };
}
const parse = (text: string): SavedTest => { const file = JSON.parse(text); if (file.format !== TEST_FILE_FORMAT) throw new Error('not a test file'); return file.test; };

/** Drive: changes and deletions copy across; changed on both → a conflict copy, like rclone. */
class Drive {
  #synced = new Map<string, string>();
  a: Files; b: Files;
  constructor(a: Files, b: Files) { this.a = a; this.b = b; }
  sync() {
    for (const path of new Set([...this.a.keys(), ...this.b.keys(), ...this.#synced.keys()])) {
      const last = this.#synced.get(path);
      const x = this.a.get(path)?.text, y = this.b.get(path)?.text;
      if (x === y) { if (x === undefined) this.#synced.delete(path); else this.#synced.set(path, x); continue; }
      const aChanged = x !== last, bChanged = y !== last;
      if (aChanged && bChanged && x !== undefined && y !== undefined) {
        const copy = path.replace(/\.json$/, '.json.conflict1');
        for (const side of [this.a, this.b]) { side.set(path, { text: x, version: ++versions }); side.set(copy, { text: y, version: ++versions }); }
        this.#synced.set(path, x);
      } else if (aChanged) { if (x === undefined) { if (y === last) this.b.delete(path); } else this.b.set(path, { text: x, version: ++versions }); this.#synced.set(path, x ?? y!); if (x === undefined && y === last) this.#synced.delete(path); }
      else if (bChanged) { if (y === undefined) { if (x === last) this.a.delete(path); } else this.a.set(path, { text: y, version: ++versions }); this.#synced.set(path, y ?? x!); if (y === undefined && x === last) this.#synced.delete(path); }
    }
  }
}

class Computer implements LocalTests {
  tests: SavedTest[] = [];
  deletions = new Set<string>();
  editing = new Set<string>();
  state: TestsSyncState = emptyTestsSyncState();
  notices: string[] = [];
  dirty = true;
  name: string; files: Files; failing: () => boolean;
  constructor(name: string, files: Files, failing = () => false) { this.name = name; this.files = files; this.failing = failing; }
  read() { return { tests: structuredClone(this.tests), deletions: new Set(this.deletions), editing: new Set(this.editing) }; }
  put(test: SavedTest) { this.tests = [...this.tests.filter(t => t.id !== test.id), structuredClone(test)]; }
  remove(id: string) { this.tests = this.tests.filter(t => t.id !== id); }
  saved(test: SavedTest) { if (this.tests.some(t => t.id === test.id && testHash(t) === testHash(test))) this.put(test); }
  settled(ids: string[]) { for (const id of ids) this.deletions.delete(id); }
  async sync() {
    const result = await syncTests(testsIO(this.files, this.failing), this.state, this, { localUnchanged: !this.dirty });
    this.dirty = false;
    this.state = result.state;
    this.notices.push(...result.notices);
    return result;
  }
  create(classId: string | null) {
    const at = tick();
    const test: SavedTest = { id: `test-${this.name}-${at}`, name: `Test ${at}`, classId, unitId: null, testType: 'quiz', config: { ...defaultTestConfig(`Test ${at}`), selectedIds: [] }, createdAt: at, updatedAt: at };
    this.tests.push(test); this.dirty = true;
    return test;
  }
  edit(id: string, change: (test: SavedTest) => void) {
    const test = this.tests.find(t => t.id === id);
    if (!test) return;
    change(test); test.updatedAt = tick(); this.dirty = true;
  }
  delete(id: string) { if (!this.tests.some(t => t.id === id)) return; this.tests = this.tests.filter(t => t.id !== id); this.deletions.add(id); this.editing.delete(id); this.dirty = true; }
}

/** A test's content without its name, which "(other version)" changes. */
const content = (test: SavedTest) => stableJson({ classId: test.classId, config: test.config, testType: test.testType });
const library = (computer: Computer) => stableJson(computer.tests.map(t => [t.id, testHash(t)]).sort());

// ── Moving from the old layout: a folder with only old-layout files gets test.json; content kept. ──
{
  const files: Files = new Map();
  const old: SavedTest = { id: 'old-test', name: 'Unit 1', classId: 'pc40s', unitId: null, testType: 'test', config: { ...defaultTestConfig('Unit 1'), selectedIds: ['q1'] }, createdAt: clock, updatedAt: clock };
  files.set('tests/pc40s/old-test/legacy-test.json', { text: JSON.stringify({ format: TEST_FILE_FORMAT, version: 1, test: old, images: [] }), version: ++versions });
  const fresh = new Computer('fresh', files);
  await fresh.sync();
  assert.deepEqual(fresh.tests.map(t => t.name), ['Unit 1']);
  assert.ok(files.has('tests/pc40s/old-test/test.json'), 'test.json written beside the old files');
  assert.ok(files.has('tests/pc40s/old-test/legacy-test.json'), 'old files left alone');
  // A browser whose copy differs (edited while the old sync was stalled): with no shared history
  // to say which came first, both are kept — the newer under the test's name.
  const browser = new Computer('browser', new Map([...files].filter(([path]) => !path.endsWith('/test.json'))));
  browser.tests = [{ ...old, config: { ...old.config, selectedIds: ['q1', 'q2'] }, updatedAt: clock + 9 }];
  await browser.sync();
  assert.deepEqual(browser.tests.map(t => [t.name, t.config.selectedIds]).sort(), [['Unit 1 (other version)', ['q1']], ['Unit 1', ['q1', 'q2']]]);
}

// ── An emptied browser refills; a missing folder is restored; nothing is removed. ──
{
  const files: Files = new Map();
  const home = new Computer('home', files);
  home.create('pc40s'); home.create(null);
  await home.sync();
  home.tests = []; home.dirty = true;
  await home.sync();
  assert.equal(home.tests.length, 2, 'refilled from the folder');
  for (const path of [...files.keys()].filter(path => path.includes('_unclassified'))) files.delete(path);
  await home.sync();
  assert.equal([...files.keys()].filter(path => path.includes('_unclassified') && path.endsWith('test.json')).length, 1, 'missing folder written again');
}

// ── Randomized: two computers, a lagging Drive, failing writes, open tests with unsaved edits. ──
let seed = 4242;
const random = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = <V>(list: V[]): V | undefined => list[Math.floor(random() * list.length)];
const RUNS = Number(process.env.TESTS_SYNC_RUNS ?? 40);
let rounds = 0, copies = 0, conflictFiles = 0;
for (let run = 0; run < RUNS; run++) {
  const homeFiles: Files = new Map(), workFiles: Files = new Map();
  const drive = new Drive(homeFiles, workFiles);
  let failing = false;
  const home = new Computer('home', homeFiles, () => failing && random() < 0.3);
  const work = new Computer('work', workFiles);
  for (let i = 0; i < 3; i++) home.create(pick(['pc40s', 'calc', null])!);
  await home.sync(); drive.sync(); await work.sync();
  const created = new Set<string>(home.tests.map(t => t.id));
  const deleted = new Set<string>();
  for (let step = 0; step < 120; step++) {
    rounds++;
    const computer = random() < 0.5 ? home : work;
    const test = pick(computer.tests);
    const roll = random();
    if (roll < 0.12) created.add(computer.create(pick(['pc40s', 'calc', null])!).id);
    else if (roll < 0.45 && test) computer.edit(test.id, t => { t.config = { ...t.config, selectedIds: [...t.config.selectedIds, `q${step}`] }; });
    else if (roll < 0.52 && test) computer.edit(test.id, t => { t.name = `Renamed ${step}`; });
    else if (roll < 0.58 && test) computer.edit(test.id, t => { t.classId = pick(['pc40s', 'calc', null])!; });
    else if (roll < 0.62 && test) { computer.delete(test.id); deleted.add(test.id); }
    else if (roll < 0.67 && test) { if (computer.editing.has(test.id)) computer.editing.delete(test.id); else computer.editing.add(test.id); }
    else if (roll < 0.85) await computer.sync();
    else drive.sync();
    failing = random() < 0.2;
    for (const t of computer.tests) created.add(t.id);
  }
  failing = false;
  home.editing.clear(); work.editing.clear(); home.dirty = work.dirty = true;
  // Every edit not yet shared must survive — under its own name or as "(other version)" — even if
  // the other computer deleted that test. (A version already shared may be replaced by a later edit.)
  const unshared = (computer: Computer) => computer.tests.filter(t => computer.state.base[t.id]?.hash !== testHash(t));
  const held = new Set([...unshared(home), ...unshared(work)].map(content));
  for (let i = 0; i < 5; i++) { await home.sync(); drive.sync(); await work.sync(); drive.sync(); }
  assert.equal(library(home), library(work), `run ${run}: both computers agree`);
  const kept = new Set(home.tests.map(content));
  for (const version of held) assert.ok(kept.has(version), `run ${run}: an unshared edit was lost`);
  const present = new Set(home.tests.map(t => t.id));
  for (const id of created) assert.ok(present.has(id) || deleted.has(id) || id.includes('-v-'), `run ${run}: ${id} disappeared without being deleted`);
  const check = new Computer('check', new Map(homeFiles));
  await check.sync();
  assert.equal(library(check), library(home), `run ${run}: the folder holds exactly the library`);
  assert.deepEqual((await home.sync()).wrote, [], `run ${run}: nothing left to write`);
  assert.equal(home.deletions.size + work.deletions.size, 0, `run ${run}: every deletion settled`);
  copies += home.tests.filter(t => t.id.includes('-v-')).length;
  conflictFiles += [...homeFiles.keys()].filter(path => path.includes('conflict')).length;
}
assert.ok(copies > 0 && conflictFiles > 0, 'the runs included edits on both computers and Drive conflict copies');

// A copy made on both computers from the same version is one test, not two.
{
  const test: SavedTest = { id: 't', name: 'T', classId: null, unitId: null, testType: null, config: defaultTestConfig('T'), createdAt: 1, updatedAt: 2 };
  assert.equal(otherVersion(test).id, otherVersion(structuredClone(test)).id);
  assert.equal(otherVersion(otherVersion(test)).name, 'T (other version)');
}

console.log(`Tests sync passed (${copies} "other version" copies kept, ${conflictFiles} Drive conflict copies): the old layout moves into test.json and is left alone; an emptied browser refills; a missing folder is restored; ${rounds} random edits on two computers converged with no version lost.`);
