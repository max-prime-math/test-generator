import assert from 'node:assert/strict';
import {
  absorbEntries, describeKey, entriesFromFiles, fromEntries, mergeEntries, parseRecordFile, placeEntries,
  stableJson, stringifyRecordFile, toEntries, toFiles, type Entries,
} from '../src/lib/gradebook-records.ts';
import { normalizeGradebookData } from '../src/lib/gradebook-model.ts';
import type { GradebookData } from '../src/lib/types.ts';

const T = 1_700_000_000_000;
function gradebook(): GradebookData {
  return normalizeGradebookData({
    version: 1,
    sections: [
      { id: 'p1', name: 'Period 1', categoryWeights: {}, createdAt: T, updatedAt: T },
      { id: 'p3', name: 'Period 3', categoryWeights: {}, createdAt: T, updatedAt: T },
    ],
    students: [
      { id: 'ada', firstName: 'Ada', lastName: 'Lee', createdAt: T, updatedAt: T },
      { id: 'bo', firstName: 'Bo', lastName: 'Chan', createdAt: T, updatedAt: T },
    ],
    enrollments: [
      { id: 'e1', sectionId: 'p1', studentId: 'ada', startedAt: T, createdAt: T, updatedAt: T },
      { id: 'e2', sectionId: 'p3', studentId: 'bo', startedAt: T, createdAt: T, updatedAt: T },
    ],
    assessments: [
      { id: 'u1', sectionId: 'p1', savedTestId: '', savedTestName: 'Unit 1 Test', title: '', subtitle: '', testType: 'test', selectedQuestionIds: [], questionSnapshots: [], totalPoints: 10, bonusPoints: 0, administeredAt: T, createdAt: T, updatedAt: T },
      { id: 'q2', sectionId: 'p3', savedTestId: '', savedTestName: 'Quiz 2', title: '', subtitle: '', testType: 'quiz', selectedQuestionIds: [], questionSnapshots: [], totalPoints: 5, bonusPoints: 0, administeredAt: T, createdAt: T, updatedAt: T },
    ],
    scores: [
      { id: 's1', sectionId: 'p1', assessmentId: 'u1', studentId: 'ada', state: 'normal', points: 8, createdAt: T, updatedAt: T },
    ],
    settings: { defaultScoreState: 'normal' },
  });
}
/** The same Gradebook, whatever order its lists are in. */
const canonical = (data: GradebookData) => stableJson(Object.fromEntries(Object.entries(data).map(([k, v]) => [k, Array.isArray(v) && k !== 'sections' ? [...v].sort((a, b) => stableJson(a).localeCompare(stableJson(b))) : v])));
const score = (data: GradebookData, assessmentId: string, studentId: string) => data.scores.find(s => s.assessmentId === assessmentId && s.studentId === studentId);
const setScore = (data: GradebookData, assessmentId: string, studentId: string, points: number, at: number, sectionId = 'p1') => {
  const existing = score(data, assessmentId, studentId);
  if (existing) Object.assign(existing, { points, updatedAt: at });
  else data.scores.push({ id: `s-${assessmentId}-${studentId}-${at}`, sectionId, assessmentId, studentId, state: 'normal', points, createdAt: at, updatedAt: at });
  return data;
};
/** Write entries to "files" and read them back, as the folder would hold them. */
const roundTrip = (entries: Entries): Entries => entriesFromFiles(new Map([...toFiles(entries)].map(([path, file]) => [path, parseRecordFile(stringifyRecordFile(file))])));

// Layout: small files, one per assessment, round-trips exactly.
{
  const data = gradebook();
  const files = toFiles(toEntries(data));
  assert.deepEqual([...files.keys()].sort(), [
    'sections/p1/assessments/u1.json', 'sections/p1/section.json',
    'sections/p3/assessments/q2.json', 'sections/p3/section.json',
    'settings.json', 'students.json',
  ]);
  assert.deepEqual(Object.keys(files.get('sections/p1/assessments/u1.json')!.records).sort(), ['assessment/u1', 'score/u1/ada']);
  assert.equal(canonical(fromEntries(roundTrip(toEntries(data)))), canonical(data), 'files hold the Gradebook exactly');
  assert.throws(() => parseRecordFile('{"format":"test-generator-gradebook-records","version":1,"rec'), 'a half-synced file is refused, not read as empty');
}

// Edits on two machines to different records both survive, even in the same file.
{
  const base = toEntries(gradebook());
  const home = setScore(gradebook(), 'u1', 'ada', 9, T + 10);                 // Period 1 at home
  const work = setScore(gradebook(), 'q2', 'bo', 4, T + 20, 'p3');            // Period 3 at work
  const { merged, conflicts } = mergeEntries(base, toEntries(home), roundTrip(toEntries(work)));
  const result = fromEntries(merged);
  assert.equal(score(result, 'u1', 'ada')!.points, 9);
  assert.equal(score(result, 'q2', 'bo')!.points, 4);
  assert.deepEqual(conflicts, []);
  // Same assessment file, different students.
  const homeSame = setScore(gradebook(), 'u1', 'ada', 7, T + 10);
  const workSame = setScore(gradebook(), 'u1', 'bo', 6, T + 20);
  const same = fromEntries(mergeEntries(base, toEntries(homeSame), toEntries(workSame)).merged);
  assert.deepEqual([score(same, 'u1', 'ada')!.points, score(same, 'u1', 'bo')!.points], [7, 6]);
}

// Both machines enter a first mark for the same student: one score, not two.
{
  const base = toEntries(gradebook());
  const home = setScore(gradebook(), 'u1', 'bo', 5, T + 10);
  const work = setScore(gradebook(), 'u1', 'bo', 6, T + 30);
  const { merged, conflicts } = mergeEntries(base, toEntries(home), toEntries(work));
  const result = fromEntries(merged);
  assert.equal(result.scores.filter(s => s.assessmentId === 'u1' && s.studentId === 'bo').length, 1);
  assert.equal(score(result, 'u1', 'bo')!.points, 6, 'the newer edit wins');
  assert.equal(conflicts.length, 1, 'and the other is kept for review');
  assert.equal(conflicts[0].otherSource, 'this browser');
  assert.equal((conflicts[0].other as { value: { points: number } }).value.points, 5);
  assert.equal(describeKey(conflicts[0].key, merged), "Bo Chan's score on Unit 1 Test");
}

// Missing is never deleted: an empty or partial copy on either side loses nothing.
{
  const full = toEntries(gradebook());
  const empty = toEntries(normalizeGradebookData(null));
  for (const [local, remote] of [[empty, full], [full, empty], [empty, new Map()]] as Array<[Entries, Entries]>) {
    const result = fromEntries(mergeEntries(full, local, remote).merged);
    assert.equal(result.students.length, 2);
    assert.equal(result.scores.length, 1);
    assert.equal(result.assessments.length, 2);
  }
  // A file that has not arrived yet (Period 3's quiz) keeps its records.
  const partial = new Map([...full].filter(([, e]) => e.file !== 'sections/p3/assessments/q2.json'));
  assert.equal(fromEntries(mergeEntries(full, full, partial).merged).assessments.length, 2);
}

// Deleting is explicit, and reaches the other machine as a tombstone.
{
  const base = toEntries(gradebook());
  const home = gradebook();
  home.assessments = home.assessments.filter(a => a.id !== 'u1');
  home.scores = home.scores.filter(s => s.assessmentId !== 'u1');
  const deletions = new Map([['assessment/u1', T + 50], ['score/u1/ada', T + 50]]);
  const { merged } = mergeEntries(base, toEntries(home), base, deletions);
  assert.equal(fromEntries(merged).assessments.length, 1);
  const file = toFiles(merged).get('sections/p1/assessments/u1.json')!;
  assert.deepEqual(file.deleted, { 'assessment/u1': T + 50, 'score/u1/ada': T + 50 });
  // The other machine, unchanged since, applies it.
  const work = fromEntries(mergeEntries(base, base, roundTrip(merged)).merged);
  assert.equal(work.assessments.length, 1);
  assert.equal(score(work, 'u1', 'ada'), undefined);
  // But a mark entered there in the meantime is not thrown away by the deletion.
  const busy = setScore(gradebook(), 'u1', 'ada', 10, T + 60);
  assert.equal(score(fromEntries(mergeEntries(base, toEntries(busy), roundTrip(merged)).merged), 'u1', 'ada')!.points, 10);
  // Re-enrolling after a deletion brings the student back.
  const back = toEntries(gradebook());
  assert.equal(fromEntries(mergeEntries(merged, back, merged).merged).assessments.length, 2);
}

// Section order and settings merge like any record.
{
  const base = toEntries(gradebook());
  const moved = gradebook();
  moved.sections.reverse();
  assert.deepEqual(fromEntries(mergeEntries(base, base, toEntries(moved)).merged).sections.map(s => s.id), ['p3', 'p1']);
}

// The old gradebook.json and conflict copies only add or update.
{
  const target = toEntries(gradebook());
  const old = gradebook();
  old.students = old.students.filter(s => s.id !== 'bo');                      // missing: left alone
  setScore(old, 'u1', 'ada', 3, T - 100);                                     // older: ignored
  setScore(old, 'q2', 'bo', 5, T + 5, 'p3');                                  // only there: added
  old.students[0] = { ...old.students[0], lastName: 'Lee-Smith', updatedAt: T + 99 }; // newer: replaces
  const replaced = absorbEntries(target, toEntries(old));
  const result = fromEntries(target);
  assert.equal(result.students.length, 2);
  assert.equal(score(result, 'u1', 'ada')!.points, 8);
  assert.equal(score(result, 'q2', 'bo')!.points, 5);
  assert.equal(result.students.find(s => s.id === 'ada')!.lastName, 'Lee-Smith');
  assert.deepEqual(replaced.map(([key]) => key), ['student/ada'], 'the replaced version is returned for safekeeping');
}

// A score follows its assessment if the assessment's section is fixed later.
{
  const data = gradebook();
  data.scores[0].sectionId = 'wrong';
  const placed = placeEntries(toEntries(data));
  assert.equal(placed.get('score/u1/ada')!.file, 'sections/p1/assessments/u1.json');
}

console.log('Gradebook record tests passed: layout round-trip, independent edits merge, one score per student, missing is never deleted, explicit tombstones, conflicts kept, old copies only add.');
