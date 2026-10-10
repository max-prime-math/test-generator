import assert from 'node:assert/strict';
import { conflictCopyOf, isRecordPath, localRecords, syncBanks, type BankIO, type BanksSyncState, type LocalBank, type LocalBanks } from '../src/lib/banks-sync-core.ts';
import { isTombstone } from '../src/lib/gradebook-records.ts';
import { exportAppDataToRepoEntries, hashRepoDataContent, importRepoEntriesToAppData, type RepoAppData } from '../src/git/repoDataModel.ts';
import type { Question } from '../src/lib/types.ts';

// Question banks in a workspace folder shared by two computers through a lagging Drive.

let clock = 1_700_000_000_000;
const tick = () => (clock += 1000);
type Content = string | Uint8Array;
type Files = Map<string, { content: Content; version: number }>;
let versions = 0;
const same = (a: Content | undefined, b: Content | undefined) => a === b || (a instanceof Uint8Array && b instanceof Uint8Array && hashRepoDataContent(a) === hashRepoDataContent(b));

function bankIO(files: Files, failing = () => false): BankIO {
  const key = (id: string, path: string) => `banks/${id}/${path}`;
  return {
    async bankIds() { return [...new Set([...files.keys()].map(path => path.split('/')[1]))]; },
    async quick(id) { return [...files].filter(([path]) => /^banks\/[^/]+\/(manifest|bank-name|deleted)/.test(path) && path.split('/')[1] === id).map(([path, file]) => `${path}@${file.version}`).sort().join('|'); },
    async list(id) { return [...files].filter(([path]) => path.startsWith(`banks/${id}/`)).map(([path, file]) => ({ path: path.slice(`banks/${id}/`.length), stamp: String(file.version) })); },
    async read(id, path) { return files.get(key(id, path))?.content ?? null; },
    async stamp(id, path) { const file = files.get(key(id, path)); return file ? String(file.version) : null; },
    async write(id, path, content) { if (failing()) throw new Error('disk full'); files.set(key(id, path), { content, version: ++versions }); },
    async remove(id, path) { if (failing()) throw new Error('disk full'); files.delete(key(id, path)); },
  };
}

class Drive {
  #synced = new Map<string, Content>();
  a: Files; b: Files;
  constructor(a: Files, b: Files) { this.a = a; this.b = b; }
  sync() {
    for (const path of new Set([...this.a.keys(), ...this.b.keys(), ...this.#synced.keys()])) {
      const last = this.#synced.get(path);
      const x = this.a.get(path)?.content, y = this.b.get(path)?.content;
      if (same(x, y)) { if (x === undefined) this.#synced.delete(path); else this.#synced.set(path, x); continue; }
      const aChanged = !same(x, last), bChanged = !same(y, last);
      if (aChanged && bChanged && x !== undefined && y !== undefined) {
        const copy = path.replace(/(\.[a-z]+)$/, '$1.conflict1');
        for (const side of [this.a, this.b]) { side.set(path, { content: x, version: ++versions }); side.set(copy, { content: y, version: ++versions }); }
        this.#synced.set(path, x);
      } else if (aChanged) { if (x === undefined) { if (same(y, last)) this.b.delete(path); this.#synced.delete(path); } else { this.b.set(path, { content: x, version: ++versions }); this.#synced.set(path, x); } }
      else if (bChanged) { if (y === undefined) { if (same(x, last)) this.a.delete(path); this.#synced.delete(path); } else { this.a.set(path, { content: y, version: ++versions }); this.#synced.set(path, y); } }
    }
  }
}

type Bank = { name: string; data: RepoAppData; deletions: Map<string, number>; revision: number };
class Computer implements LocalBanks {
  banks = new Map<string, Bank>();
  state: BanksSyncState = {};
  conflicts: string[] = [];
  name: string; files: Files; failing: () => boolean;
  constructor(name: string, files: Files, failing = () => false) { this.name = name; this.files = files; this.failing = failing; }
  ids() { return [...this.banks.keys()]; }
  signature(id: string) { return String(this.banks.get(id)?.revision ?? ''); }
  hasDeletions(id: string) { return (this.banks.get(id)?.deletions.size ?? 0) > 0; }
  async read(id: string): Promise<LocalBank | null> { const bank = this.banks.get(id); return bank ? structuredClone({ name: bank.name, data: bank.data, deletions: bank.deletions }) : null; }
  async apply(id: string, name: string, data: RepoAppData) {
    const bank = this.banks.get(id);
    this.banks.set(id, { name, data: structuredClone(data), deletions: bank?.deletions ?? new Map(), revision: (bank?.revision ?? 0) + 1 });
  }
  settled(id: string, paths: string[]) { for (const path of paths) this.banks.get(id)?.deletions.delete(path); }
  async sync(fullScan: string | null = null) {
    const result = await syncBanks(bankIO(this.files, this.failing), this, this.state, { fullScan });
    this.state = result.state;
    for (const conflict of result.conflicts) {
      const lost = isTombstone(conflict.other) ? null : (conflict.other.value as { hash: string }).hash;
      if (lost) this.conflicts.push(`${conflict.bankId}/${conflict.key}@${lost}`);
    }
    return result;
  }
  #edit(id: string, change: (bank: Bank) => void) { const bank = this.banks.get(id); if (bank) { change(bank); bank.revision++; } }
  createBank(id: string) { this.banks.set(id, { name: `Bank ${id}`, data: { questions: [], narratives: [], customClasses: [], savedTests: [], images: [] }, deletions: new Map(), revision: 1 }); }
  addQuestion(bankId: string, withImage = false) {
    const at = tick();
    const id = `q-${this.name}-${at}`;
    this.#edit(bankId, bank => {
      const question: Question = { id, body: `Question ${at}`, points: 2, tags: [], createdAt: at, updatedAt: at };
      if (withImage) { question.images = [`img-${at}`]; bank.data.images!.push({ name: `img-${at}`, ext: 'png', bytes: new Uint8Array([at % 251, 1, 2]) }); }
      bank.data.questions.push(question);
    });
  }
  editQuestion(bankId: string, questionId: string, body: string) {
    this.#edit(bankId, bank => { const q = bank.data.questions.find(x => x.id === questionId); if (q) Object.assign(q, { body, updatedAt: tick() }); });
  }
  deleteQuestion(bankId: string, questionId: string) {
    this.#edit(bankId, bank => {
      if (!bank.data.questions.some(q => q.id === questionId)) return;
      bank.data.questions = bank.data.questions.filter(q => q.id !== questionId);
      bank.deletions.set(`questions/${questionId}.json`, tick());
    });
  }
  addNarrative(bankId: string) {
    const at = tick();
    this.#edit(bankId, bank => bank.data.narratives!.push({ id: `n-${this.name}-${at}`, title: `Passage ${at}`, body: 'Read this.', tags: [], createdAt: at, updatedAt: at } as never));
  }
  rename(bankId: string, name: string) { this.#edit(bankId, bank => { bank.name = name; }); }
}

/** A bank's records as hashes, for comparing two computers and the folder. */
const recordsOf = (bank: Bank) => JSON.stringify([...localRecords({ name: bank.name, data: bank.data, deletions: new Map() }).entries].map(([path, e]) => [path, isTombstone(e) ? null : (e.value as { hash: string }).hash]).sort());
const library = (computer: Computer) => JSON.stringify([...computer.banks].sort(([a], [b]) => a.localeCompare(b)).map(([id, bank]) => [id, recordsOf(bank)]));

/** The folder must stay readable by the strict bank reader older tabs and imports use. */
function strictlyValid(files: Files, id: string) {
  const prefix = `banks/${id}/`;
  const manifest = JSON.parse(files.get(`${prefix}manifest.json`)!.content as string) as { files: Array<{ path: string }> };
  const entries = manifest.files.map(file => ({ path: file.path, kind: 'file' as const, content: files.get(prefix + file.path)!.content }));
  entries.push({ path: 'manifest.json', kind: 'file', content: files.get(`${prefix}manifest.json`)!.content });
  return importRepoEntriesToAppData(entries).appData;
}

assert.equal(conflictCopyOf('questions/q1.json.conflict1'), 'questions/q1.json');
assert.equal(conflictCopyOf('questions/q1 (1).json'), 'questions/q1.json');
assert.equal(conflictCopyOf('images/a.png.conflict2'), 'images/a.png');
assert.equal(conflictCopyOf('manifest.json.conflict1'), null);
assert.ok(isRecordPath('bank-name.json') && !isRecordPath('questions/index.json'));

// ── An existing bank folder (written by the old app) is read as is, and left byte for byte. ──
{
  const files: Files = new Map();
  const data: RepoAppData = { questions: [{ id: 'q1', body: 'One', points: 1, tags: [], createdAt: 1, updatedAt: 2 }], narratives: [], customClasses: [], savedTests: [], images: [] };
  for (const entry of exportAppDataToRepoEntries(data, { generatedAt: '2000-01-01T00:00:00.000Z' })) files.set(`banks/old/${entry.path}`, { content: entry.content, version: ++versions });
  files.set('banks/old/bank-name.json', { content: JSON.stringify({ name: 'Old bank' }), version: ++versions });
  const before = new Map([...files].map(([path, file]) => [path, file.content]));
  const fresh = new Computer('fresh', files);
  const result = await fresh.sync();
  assert.deepEqual(fresh.banks.get('old')?.data.questions.map(q => q.body), ['One']);
  assert.equal(fresh.banks.get('old')?.name, 'Old bank');
  assert.deepEqual(result.wrote, [], 'nothing rewritten');
  for (const [path, content] of before) assert.ok(same(files.get(path)?.content, content), path);
}

// ── An emptied browser bank refills; a missing question file is restored; nothing is deleted. ──
{
  const files: Files = new Map();
  const home = new Computer('home', files);
  home.createBank('b'); home.addQuestion('b'); home.addQuestion('b', true);
  await home.sync();
  home.banks.get('b')!.data.questions = []; home.banks.get('b')!.revision++;
  await home.sync();
  assert.equal(home.banks.get('b')!.data.questions.length, 2, 'refilled from the folder');
  const questionFile = [...files.keys()].find(path => /questions\/q-/.test(path))!;
  files.delete(questionFile);
  await home.sync('b');
  assert.ok(files.has(questionFile), 'missing question file written again');
  strictlyValid(files, 'b');
}

// ── Removing most of a bank's questions in one go waits for a confirmation. ──
{
  const files: Files = new Map();
  const home = new Computer('home', files);
  home.createBank('big');
  for (let i = 0; i < 10; i++) home.addQuestion('big');
  await home.sync();
  for (const q of home.banks.get('big')!.data.questions.slice(0, 8)) home.deleteQuestion('big', q.id);
  const blocked = await syncBanks(bankIO(files), home, home.state);
  home.state = blocked.state;
  assert.deepEqual(blocked.blocked, [{ bankId: 'big', before: 10, after: 2 }]);
  const onDisk = () => [...files.keys()].filter(path => /questions\/q-/.test(path)).length;
  assert.equal(onDisk(), 10, 'nothing removed from the folder');
  assert.equal(home.banks.get('big')!.data.questions.length, 2, 'this browser keeps the deletion while it waits');
  const confirmed = await syncBanks(bankIO(files), home, home.state, { allowShrink: new Set(['big']) });
  home.state = confirmed.state;
  assert.equal(onDisk(), 2, 'removed once confirmed');
  assert.equal(home.banks.get('big')!.data.questions.length, 2);
  strictlyValid(files, 'big');
}

// ── Randomized: two computers, a lagging Drive, failing writes, thousands of edits. ──
let seed = 777;
const random = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = <V>(list: V[]): V | undefined => list[Math.floor(random() * list.length)];
const RUNS = Number(process.env.BANKS_SYNC_RUNS ?? 30);
let rounds = 0, copies = 0, conflicts = 0;
for (let run = 0; run < RUNS; run++) {
  const homeFiles: Files = new Map(), workFiles: Files = new Map();
  const drive = new Drive(homeFiles, workFiles);
  let failing = false;
  const home = new Computer('home', homeFiles, () => failing && random() < 0.25);
  const work = new Computer('work', workFiles);
  home.createBank('alpha'); home.addQuestion('alpha'); home.addQuestion('alpha', true);
  await home.sync(); drive.sync(); await work.sync();
  const created = new Set<string>(), deleted = new Set<string>();
  for (let step = 0; step < 120; step++) {
    rounds++;
    const computer = random() < 0.5 ? home : work;
    const bankId = pick(computer.ids());
    const question = bankId ? pick(computer.banks.get(bankId)!.data.questions) : undefined;
    const roll = random();
    if (!bankId) computer.createBank(`bank-${computer.name}-${step}`);
    else if (roll < 0.2) computer.addQuestion(bankId, random() < 0.3);
    else if (roll < 0.45 && question) computer.editQuestion(bankId, question.id, `Edited ${step} on ${computer.name}`);
    else if (roll < 0.5 && question) { computer.deleteQuestion(bankId, question.id); deleted.add(question.id); }
    else if (roll < 0.54) computer.addNarrative(bankId);
    else if (roll < 0.57) computer.rename(bankId, `Renamed ${step}`);
    else if (roll < 0.59) computer.createBank(`bank-${computer.name}-${step}`);
    else if (roll < 0.82) await computer.sync(random() < 0.3 ? bankId : null);
    else drive.sync();
    failing = random() < 0.2;
    for (const bank of computer.banks.values()) for (const q of bank.data.questions) created.add(q.id);
  }
  failing = false;
  // Every unshared version must survive, or be offered for review as the other side of a conflict.
  const unshared = (computer: Computer) => [...computer.banks].flatMap(([id, bank]) => {
    const base = new Map(computer.state[id]?.base ?? []);
    return [...localRecords({ name: bank.name, data: bank.data, deletions: new Map() }).entries]
      .filter(([path, entry]) => path.startsWith('questions/') && (entry.value as { hash: string }).hash !== ((base.get(path) as { value?: { hash: string } } | undefined)?.value?.hash))
      .map(([path, entry]) => `${id}/${path}@${(entry.value as { hash: string }).hash}`);
  });
  const held = [...unshared(home), ...unshared(work)];
  for (let i = 0; i < 5; i++) { for (const c of [home, work]) for (const id of c.ids()) await c.sync(id); drive.sync(); }
  assert.equal(library(home), library(work), `run ${run}: both computers agree`);
  const kept = new Set([...home.banks].flatMap(([id, bank]) => [...localRecords({ name: bank.name, data: bank.data, deletions: new Map() }).entries].map(([path, e]) => `${id}/${path}@${(e.value as { hash: string }).hash}`)));
  const reviewed = new Set([...home.conflicts, ...work.conflicts]);
  for (const version of held) assert.ok(kept.has(version) || reviewed.has(version), `run ${run}: an unshared edit vanished without review: ${version}`);
  const present = new Set([...home.banks.values()].flatMap(bank => bank.data.questions.map(q => q.id)));
  for (const id of created) assert.ok(present.has(id) || deleted.has(id), `run ${run}: question ${id} disappeared without being deleted`);
  for (const id of home.ids()) {
    const fromFolder = strictlyValid(homeFiles, id);
    assert.equal(recordsOf({ name: home.banks.get(id)!.name, data: { ...fromFolder, savedTests: [] }, deletions: new Map(), revision: 0 }), recordsOf(home.banks.get(id)!), `run ${run}: folder ${id} holds the bank`);
  }
  const check = new Computer('check', new Map(homeFiles));
  await check.sync();
  assert.equal(library(check), library(home), `run ${run}: a new computer gets the same banks`);
  const idle = await home.sync();
  for (const id of home.ids()) idle.wrote.push(...(await home.sync(id)).wrote);
  assert.deepEqual(idle.wrote, [], `run ${run}: nothing left to write`);
  copies += [...homeFiles.keys()].filter(path => path.includes('conflict')).length;
  conflicts += reviewed.size;
}
assert.ok(copies > 0, 'the runs included Drive conflict copies');

console.log(`Banks sync passed (${copies} Drive conflict copies, ${conflicts} versions offered for review): an old bank folder is read and left untouched; an emptied browser refills and a missing file is restored; ${rounds} random edits on two computers converged, the folder always strictly valid, nothing lost without review.`);
