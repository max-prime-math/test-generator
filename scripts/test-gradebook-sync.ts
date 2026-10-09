import assert from 'node:assert/strict';
import { emptySyncState, syncOnce, type FolderIO, type LocalSide, type SyncState } from '../src/lib/gradebook-sync-core.ts';
import { recordKey, stableJson, toEntries } from '../src/lib/gradebook-records.ts';
import { normalizeGradebookData } from '../src/lib/gradebook-model.ts';
import { stringifyGradebookBackup } from '../src/lib/gradebook-backup.ts';
import type { GradebookData } from '../src/lib/types.ts';

// Two computers, each with its own copy of a Drive folder, and the app open on both.

let clock = 1_700_000_000_000;
const tick = () => (clock += 1000);

type Files = Map<string, { text: string; version: number }>;
let versions = 0;
function folder(files: Files, failWrites: () => boolean = () => false): FolderIO {
  return {
    async list() { return [...files].map(([path, file]) => ({ path, stamp: String(file.version) })); },
    async read(path) { return files.get(path)?.text ?? null; },
    async write(path, text) {
      if (failWrites()) throw new Error('disk full');
      files.set(path, { text, version: ++versions });
    },
  };
}

/** Drive between the two copies: changes on one side copy across; both changed → a conflict copy. */
class Drive {
  #synced = new Map<string, string>();
  a: Files; b: Files;
  constructor(a: Files, b: Files) { this.a = a; this.b = b; }
  sync(): void {
    for (const path of new Set([...this.a.keys(), ...this.b.keys()])) {
      const last = this.#synced.get(path);
      const x = this.a.get(path)?.text, y = this.b.get(path)?.text;
      if (x === y) { if (x !== undefined) this.#synced.set(path, x); continue; }
      const aChanged = x !== last, bChanged = y !== last;
      if (aChanged && bChanged && x !== undefined && y !== undefined) {
        // Like rclone bisync: both kept, one under a conflict name, on both sides.
        for (const side of [this.a, this.b]) { side.set(path, { text: x, version: ++versions }); side.set(`${path}.conflict1`, { text: y, version: ++versions }); }
        this.#synced.set(path, x);
      } else if (aChanged && x !== undefined) { this.b.set(path, { text: x, version: ++versions }); this.#synced.set(path, x); }
      else if (bChanged && y !== undefined) { this.a.set(path, { text: y, version: ++versions }); this.#synced.set(path, y); }
    }
  }
}

class Machine implements LocalSide {
  data: GradebookData;
  deletions = new Map<string, number>();
  state: SyncState = emptySyncState();
  conflicts = 0;
  name: string; files: Files; failing: () => boolean;
  constructor(name: string, files: Files, data: GradebookData, failing = () => false) {
    this.name = name; this.files = files; this.failing = failing; this.data = structuredClone(data);
  }
  read() { return { data: structuredClone(this.data), deletions: new Map(this.deletions) }; }
  apply(data: GradebookData) { this.data = data; }
  settled(keys: string[]) { for (const key of keys) this.deletions.delete(key); }
  /** Edited since the last sync, so a pass may not be skipped. */
  dirty = true;
  async sync() {
    const result = await syncOnce(folder(this.files, this.failing), this.state, this, clock, { localUnchanged: !this.dirty });
    this.dirty = false;
    this.state = result.state;
    this.conflicts += result.conflicts.length;
    return result;
  }
  #delete(kind: Parameters<typeof recordKey>[0], value: object) { this.deletions.set(recordKey(kind, value as Record<string, unknown>), tick()); }

  setScore(assessmentId: string, studentId: string, points: number) {
    this.dirty = true;
    const assessment = this.data.assessments.find(a => a.id === assessmentId);
    if (!assessment) return;
    const at = tick();
    const score = this.data.scores.find(s => s.assessmentId === assessmentId && s.studentId === studentId);
    if (score) Object.assign(score, { points, updatedAt: at });
    else this.data.scores.push({ id: `score-${this.name}-${at}`, sectionId: assessment.sectionId, assessmentId, studentId, state: 'normal', points, createdAt: at, updatedAt: at });
  }
  addStudent(sectionId: string) {
    this.dirty = true;
    const at = tick();
    const id = `student-${this.name}-${at}`;
    this.data.students.push({ id, firstName: 'New', lastName: `Student ${at}`, displayName: '', active: true, createdAt: at, updatedAt: at });
    this.data.enrollments.push({ id: `enroll-${id}`, sectionId, studentId: id, active: true, startedAt: at, createdAt: at, updatedAt: at });
    return id;
  }
  addAssessment(sectionId: string) {
    this.dirty = true;
    const at = tick();
    const id = `assessment-${this.name}-${at}`;
    this.data.assessments.push({ id, sectionId, savedTestId: '', savedTestName: `Quiz ${at}`, title: '', subtitle: '', testType: 'quiz', selectedQuestionIds: [], questionSnapshots: [], totalPoints: 10, bonusPoints: 0, administeredAt: at, createdAt: at, updatedAt: at });
    return id;
  }
  deleteAssessment(id: string) {
    this.dirty = true;
    for (const a of this.data.assessments.filter(a => a.id === id)) this.#delete('assessment', a);
    for (const s of this.data.scores.filter(s => s.assessmentId === id)) this.#delete('score', s);
    this.data.assessments = this.data.assessments.filter(a => a.id !== id);
    this.data.scores = this.data.scores.filter(s => s.assessmentId !== id);
  }
  removeFromSection(sectionId: string, studentId: string) {
    this.dirty = true;
    for (const e of this.data.enrollments.filter(e => e.sectionId === sectionId && e.studentId === studentId)) this.#delete('enrollment', e);
    for (const s of this.data.scores.filter(s => s.sectionId === sectionId && s.studentId === studentId)) this.#delete('score', s);
    this.data.enrollments = this.data.enrollments.filter(e => !(e.sectionId === sectionId && e.studentId === studentId));
    this.data.scores = this.data.scores.filter(s => !(s.sectionId === sectionId && s.studentId === studentId));
  }
  renameSection(id: string, name: string) {
    this.dirty = true;
    const section = this.data.sections.find(s => s.id === id);
    if (section) Object.assign(section, { name, updatedAt: tick() });
  }
}

const start = normalizeGradebookData({
  version: 1,
  sections: ['p1', 'p2', 'p3'].map(id => ({ id, name: id, categoryWeights: {}, createdAt: clock, updatedAt: clock })),
  students: Array.from({ length: 12 }, (_, i) => ({ id: `s${i}`, firstName: `S${i}`, lastName: 'X', createdAt: clock, updatedAt: clock })),
  enrollments: Array.from({ length: 12 }, (_, i) => ({ id: `e${i}`, sectionId: `p${(i % 3) + 1}`, studentId: `s${i}`, startedAt: clock, createdAt: clock, updatedAt: clock })),
  assessments: ['p1', 'p2', 'p3'].map(sectionId => ({ id: `a-${sectionId}`, sectionId, savedTestId: '', savedTestName: `Test ${sectionId}`, title: '', subtitle: '', testType: 'test', selectedQuestionIds: [], questionSnapshots: [], totalPoints: 10, bonusPoints: 0, administeredAt: clock, createdAt: clock, updatedAt: clock })),
  scores: [],
  settings: { defaultScoreState: 'normal' },
});

/** Everything both copies should hold, compared without regard to list order. */
const content = (data: GradebookData) => stableJson([...toEntries(data)].map(([key, e]) => [key, 'value' in e ? e.value : null]).sort(([a], [b]) => String(a).localeCompare(String(b))));

async function settle(home: Machine, work: Machine, drive: Drive) {
  for (let i = 0; i < 4; i++) { await home.sync(); drive.sync(); await work.sync(); drive.sync(); }
}

// ── Moving from gradebook.json: the folder and this browser's copy are combined, nothing dropped. ──
{
  const files: Files = new Map();
  const fromFolder = structuredClone(start);
  fromFolder.scores.push({ id: 'old', sectionId: 'p1', assessmentId: 'a-p1', studentId: 's0', state: 'normal', points: 7, createdAt: clock, updatedAt: clock });
  const legacyText = stringifyGradebookBackup(fromFolder, clock);
  files.set('gradebook.json', { text: legacyText, version: ++versions });
  const browserOnly = structuredClone(start);
  browserOnly.scores.push({ id: 'only-here', sectionId: 'p2', assessmentId: 'a-p2', studentId: 's1', state: 'normal', points: 9, createdAt: clock + 5, updatedAt: clock + 5 });
  const machine = new Machine('work', files, browserOnly);
  await machine.sync();
  assert.deepEqual(machine.data.scores.map(s => s.points).sort(), [7, 9], 'grades only in the browser and only in gradebook.json both kept');
  assert.equal(files.get('gradebook.json')!.text, legacyText, 'gradebook.json is left exactly as it was');
  assert.ok(files.has('records/sections/p2/assessments/a-p2.json'));
  // An old tab later writes gradebook.json again: its new mark is picked up.
  const oldTab = structuredClone(fromFolder);
  oldTab.scores[0] = { ...oldTab.scores[0], points: 6, updatedAt: clock + 50 };
  files.set('gradebook.json', { text: stringifyGradebookBackup(oldTab), version: ++versions });
  await machine.sync();
  assert.equal(machine.data.scores.find(s => s.studentId === 's0')!.points, 6);
  // And a second machine whose browser was wiped gets everything from the folder.
  const fresh = new Machine('fresh', files, normalizeGradebookData(null));
  await fresh.sync();
  assert.equal(content(fresh.data), content(machine.data));
}

// ── Switching to a different workspace never copies this browser's students into it. ──
{
  const shared: Files = new Map();
  const other = structuredClone(start);
  other.students = [{ id: 'theirs', firstName: 'Their', lastName: 'Student', displayName: '', active: true, createdAt: clock, updatedAt: clock }];
  other.enrollments = [];
  other.scores = [];
  const owner = new Machine('owner', shared, other);
  await owner.sync();
  const before = new Map([...shared].map(([path, file]) => [path, file.text]));
  const visitor = new Machine('visitor', shared, start);
  visitor.deletions.set('student/s0', clock);
  const result = await syncOnce(folder(shared), emptySyncState(), visitor, clock, { adoptFolder: true });
  assert.deepEqual(visitor.data.students.map(s => s.id), ['theirs'], 'the browser shows the folder\'s Gradebook');
  assert.deepEqual(result.wrote, [], 'and writes nothing into it');
  assert.deepEqual(new Map([...shared].map(([path, file]) => [path, file.text])), before);
  assert.equal(visitor.deletions.size, 0, 'deletions from the other workspace are dropped, not applied here');
}

// ── A half-synced file is neither read as empty nor overwritten. ──
{
  const files: Files = new Map();
  const home = new Machine('home', files, start);
  await home.sync();
  const path = 'records/sections/p1/section.json';
  const whole = files.get(path)!.text;
  files.set(path, { text: whole.slice(0, 40), version: ++versions });
  home.setScore('a-p1', 's0', 5);
  const result = await home.sync();
  assert.ok(result.problems.some(problem => problem.startsWith(path)));
  assert.equal(files.get(path)!.text, whole.slice(0, 40), 'not overwritten while unreadable');
  assert.equal(home.data.enrollments.filter(e => e.sectionId === 'p1').length, 4, 'its records are kept');
  files.set(path, { text: whole, version: ++versions });
  assert.deepEqual((await home.sync()).problems, []);
}

// ── Randomized: two machines, a lagging Drive, failing writes, thousands of edits. ──
let seed = 12345;
const random = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = <V>(list: V[]): V | undefined => list[Math.floor(random() * list.length)];
let rounds = 0;
const RUNS = Number(process.env.GRADEBOOK_SYNC_RUNS ?? 40);
let conflictCopies = 0, conflictsReviewed = 0;
for (let run = 0; run < RUNS; run++) {
  const homeFiles: Files = new Map(), workFiles: Files = new Map();
  const drive = new Drive(homeFiles, workFiles);
  let failing = false;
  const home = new Machine('home', homeFiles, start, () => failing && random() < 0.3);
  const work = new Machine('work', workFiles, start);
  await home.sync(); drive.sync(); await work.sync();
  const created = new Set<string>(toEntries(start).keys());
  const deleted = new Set<string>();
  for (let step = 0; step < 150; step++) {
    rounds++;
    const machine = random() < 0.5 ? home : work;
    const sectionId = pick(['p1', 'p2', 'p3'])!;
    const roll = random();
    const before = new Set(toEntries(machine.data).keys());
    if (roll < 0.55) {
      const assessment = pick(machine.data.assessments.filter(a => a.sectionId === sectionId));
      const student = pick(machine.data.enrollments.filter(e => e.sectionId === sectionId));
      if (assessment && student) machine.setScore(assessment.id, student.studentId, Math.floor(random() * 11));
    } else if (roll < 0.65) machine.addStudent(sectionId);
    else if (roll < 0.72) machine.addAssessment(sectionId);
    else if (roll < 0.77) { const a = pick(machine.data.assessments); if (a) machine.deleteAssessment(a.id); }
    else if (roll < 0.82) { const e = pick(machine.data.enrollments); if (e) machine.removeFromSection(e.sectionId, e.studentId); }
    else if (roll < 0.86) machine.renameSection(sectionId, `Renamed ${step}`);
    else if (roll < 0.94) await machine.sync();
    else drive.sync();
    failing = random() < 0.2;
    const after = new Set(toEntries(machine.data).keys());
    for (const key of after) created.add(key);
    for (const key of before) if (!after.has(key)) deleted.add(key);
  }
  failing = false;
  await settle(home, work, drive);
  conflictCopies += [...homeFiles.keys()].filter(path => path.includes('.conflict')).length;
  conflictsReviewed += home.conflicts + work.conflicts;
  assert.equal(content(home.data), content(work.data), `run ${run}: both computers agree`);
  const present = new Set(toEntries(home.data).keys());
  for (const key of created) assert.ok(present.has(key) || deleted.has(key), `run ${run}: ${key} disappeared without being deleted`);
  // The folder holds exactly what the app shows.
  const check = new Machine('check', new Map(homeFiles), normalizeGradebookData(null));
  await check.sync();
  assert.equal(content(check.data), content(home.data), `run ${run}: the folder matches`);
  // Settled: another round writes nothing.
  assert.deepEqual((await home.sync()).wrote, [], `run ${run}: nothing left to write`);
  assert.equal(home.deletions.size + work.deletions.size, 0, `run ${run}: every deletion reached the folder`);
}

assert.ok(conflictCopies > 0 && conflictsReviewed > 0, 'the runs included Drive conflict copies and edits on both sides');
console.log(`Gradebook sync tests passed (${conflictCopies} Drive conflict copies, ${conflictsReviewed} same-record conflicts kept for review): moving from gradebook.json keeps both copies and leaves it untouched; half-synced files are left alone; ${rounds} random edits on two computers over a lagging Drive with failing writes and conflict copies converged with nothing lost.`);
