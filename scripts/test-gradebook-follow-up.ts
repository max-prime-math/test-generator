import assert from 'node:assert/strict';
import { normalizeGradebookData, mergeLegacyGradebooks } from '../src/lib/gradebook-model.ts';
import { DEFAULT_GRADEBOOK_FILTER, normalizeGradebookFilter, filterGradebookStudents, filterAssessments } from '../src/lib/gradebook-filters.ts';
import { buildGradebookReports, gradebookReportsHtml, type GradebookReportOptions } from '../src/lib/gradebook-reports.ts';
import { parseGradebookBackup, stringifyGradebookBackup } from '../src/lib/gradebook-backup.ts';
import { fromEntries, mergeEntries, toEntries, toFiles, placeEntries } from '../src/lib/gradebook-records.ts';
import { syncOnce, emptySyncState, type FolderIO, type LocalSide } from '../src/lib/gradebook-sync-core.ts';
import type { GradebookData } from '../src/lib/types.ts';

const T = 1_700_000_000_000;
const data = normalizeGradebookData({
  sections: [{ id: 'p1', name: 'Period <1>', termLabel: 'Fall', categoryWeights: { test: 60, assignment: 40, exam: 0 }, missingGradePolicy: 'exclude' }, { id: 'p2', name: 'Other class' }],
  students: ['ada', 'ben', 'jo', 'inactive'].map(id => ({ id, firstName: id === 'ada' ? '<script>alert(1)</script>' : id, lastName: 'Student', active: id !== 'inactive' })),
  enrollments: ['ada', 'ben', 'jo', 'inactive'].map(id => ({ id: `e-${id}`, sectionId: 'p1', studentId: id, active: true })),
  assessments: [
    { id: 'test', sectionId: 'p1', savedTestId: '', savedTestName: 'Test <one>', testType: 'test', totalPoints: 10, administeredAt: T },
    { id: 'hw', sectionId: 'p1', savedTestId: '', savedTestName: 'Homework', testType: 'assignment', totalPoints: 20, administeredAt: T + 1 },
    { id: 'bonus', sectionId: 'p1', savedTestId: '', savedTestName: 'Bonus test', testType: 'exam', totalPoints: 10, bonusPoints: 5, administeredAt: T + 2 },
    { id: 'other', sectionId: 'p2', savedTestId: '', savedTestName: 'Hidden assessment', testType: 'test', totalPoints: 100 },
  ],
  scores: [
    { id: 'a-test', sectionId: 'p1', assessmentId: 'test', studentId: 'ada', points: 8, state: 'normal' },
    { id: 'a-hw', sectionId: 'p1', assessmentId: 'hw', studentId: 'ada', points: null, state: 'missing' },
    { id: 'a-bonus', sectionId: 'p1', assessmentId: 'bonus', studentId: 'ada', points: 15, state: 'normal' },
    { id: 'b-test', sectionId: 'p1', assessmentId: 'test', studentId: 'ben', points: 4, alternativeTotalPoints: 5, state: 'alternative' },
    { id: 'b-hw', sectionId: 'p1', assessmentId: 'hw', studentId: 'ben', points: 10, state: 'normal' },
    { id: 'j-hw', sectionId: 'p1', assessmentId: 'hw', studentId: 'jo', points: null, state: 'incomplete' },
  ],
  studentNotes: [
    { id: 'private', sectionId: 'p1', studentId: 'ada', text: 'PRIVATE NOTE', includeInReports: false, createdAt: T, updatedAt: T },
    { id: 'shared', sectionId: 'p1', studentId: 'ada', text: 'Great progress <img onerror="alert(1)">', includeInReports: true, createdAt: T + 1, updatedAt: T + 1, previous: { text: 'PRIVATE PREVIOUS VERSION', includeInReports: false } },
    { id: 'trash', sectionId: 'p1', studentId: 'ada', text: 'TRASHED NOTE', includeInReports: true, trashedAt: T, createdAt: T, updatedAt: T },
    { id: 'other-note', sectionId: 'p2', studentId: 'ada', text: 'OTHER SECTION NOTE', includeInReports: true, createdAt: T, updatedAt: T },
  ],
  savedFilters: [{ id: 'f1', sectionId: 'p1', name: 'Missing homework', rules: { workState: 'missing', category: 'assignment' }, createdAt: T, updatedAt: T }],
});
const snapshot = JSON.stringify(data);
const students = data.students;
const section = data.sections[0];
const ids = (result: { id: string }[]) => result.map(item => item.id);
assert.deepEqual(ids(filterGradebookStudents(data, section, students, { ...DEFAULT_GRADEBOOK_FILTER, workState: 'missing' })), ['ada']);
assert.deepEqual(ids(filterGradebookStudents(data, section, students, { ...DEFAULT_GRADEBOOK_FILTER, workState: 'missing', category: 'test' })), []);
assert.deepEqual(ids(filterGradebookStudents(data, section, students, { ...DEFAULT_GRADEBOOK_FILTER, workState: 'incomplete' })), ['jo']);
assert.deepEqual(ids(filterGradebookStudents(data, section, students, { ...DEFAULT_GRADEBOOK_FILTER, belowPercent: 50 })), [], 'Ungraded students are not failing students');
assert.deepEqual(ids(filterGradebookStudents(data, { ...section, missingGradePolicy: 'zero' }, students, { ...DEFAULT_GRADEBOOK_FILTER, belowPercent: 50 })), ['ada']);
assert.deepEqual(ids(filterGradebookStudents(data, section, students, { ...DEFAULT_GRADEBOOK_FILTER, category: 'test', workState: 'ungraded' })), ['jo', 'inactive']);
assert.deepEqual(ids(filterGradebookStudents(data, section, students, { ...DEFAULT_GRADEBOOK_FILTER, studentQuery: 'ben', belowPercent: 70 })), ['ben']);
assert.deepEqual(ids(filterAssessments(data.assessments.filter(a => a.sectionId === section.id), { ...DEFAULT_GRADEBOOK_FILTER, category: 'assignment' })), ['hw']);
assert.deepEqual(normalizeGradebookFilter({ workState: 'other', category: 'bad', belowPercent: Infinity }), DEFAULT_GRADEBOOK_FILTER);

const options: GradebookReportOptions = { sectionId: 'p1', studentIds: students.map(student => student.id), kind: 'progress', includeIncomplete: false, includeUngraded: false, includeNotes: true, includeInactive: false, generatedAt: T };
const reports = buildGradebookReports(data, options);
assert.equal(reports.length, 3, 'Inactive enrollment is omitted unless explicitly included');
assert.equal(reports[0].finalPercent, 80);
assert.equal(reports[1].finalPercent, 68, 'Alternative assessment uses its student-specific denominator');
assert.equal(reports[2].finalPercent, null);
assert.equal(reports[0].rows.find(row => row.id === 'bonus')!.percent, 150, 'Bonus marks are not clamped');
assert.equal(reports[1].rows.find(row => row.id === 'test')!.possible, 5);
assert.equal(reports[2].rows.find(row => row.id === 'test')!.state, 'Ungraded');
assert.deepEqual(reports[0].notes.map(note => note.text), ['Great progress <img onerror="alert(1)">']);
const missing = buildGradebookReports(data, { ...options, kind: 'missing' });
assert.deepEqual(missing.map(report => report.studentId), ['ada']);
assert.deepEqual(missing[0].rows.map(row => row.id), ['hw']);
const missingAndIncomplete = buildGradebookReports(data, { ...options, kind: 'missing', includeIncomplete: true });
assert.deepEqual(missingAndIncomplete.map(report => report.studentId), ['ada', 'jo']);
const allWork = buildGradebookReports(data, { ...options, kind: 'missing', includeUngraded: true });
assert.equal(allWork.length, 3);
assert.equal(buildGradebookReports(data, { ...options, includeInactive: true }).length, 4);
const limited = buildGradebookReports(data, { ...options, assessmentIds: ['hw'] });
assert.equal(limited[0].finalPercent, 80, 'Narrowing the printed assignment list never recalculates the course grade');
const zeros = buildGradebookReports({ ...data, sections: [{ ...section, missingGradePolicy: 'zero' }] }, options);
assert.equal(zeros[0].finalPercent, 48);
assert.equal(zeros[0].rows.find(row => row.id === 'hw')!.percent, 0);
const html = gradebookReportsHtml(reports);
assert.equal((html.match(/<article class="student-report"/g) ?? []).length, 3);
for (const secret of ['PRIVATE NOTE', 'PRIVATE PREVIOUS VERSION', 'TRASHED NOTE', 'OTHER SECTION NOTE', 'Hidden assessment']) assert.ok(!html.includes(secret), secret);
assert.ok(!html.includes('<script>') && !html.includes('<img '));
assert.ok(html.includes('&lt;script&gt;') && html.includes('&lt;img '));
assert.equal(buildGradebookReports(data, { ...options, includeNotes: false })[0].notes.length, 0);
assert.equal(JSON.stringify(data), snapshot, 'Reports and filters never mutate grades, notes, tests or snapshots');

// Notes, versions, saved filters and Trash survive backups and record-based folder sync.
const backup = parseGradebookBackup(stringifyGradebookBackup(data));
assert.deepEqual(backup.studentNotes, data.studentNotes);
assert.deepEqual(backup.savedFilters, data.savedFilters);
const roundTrip = fromEntries(toEntries(data));
assert.deepEqual(roundTrip.studentNotes?.map(note => note.id).sort(), data.studentNotes!.map(note => note.id).sort());
assert.deepEqual(roundTrip.savedFilters, data.savedFilters);
assert.ok(toFiles(toEntries(data)).has('sections/p1/notes/shared.json'));
assert.ok(toFiles(toEntries(data)).has('sections/p1/filters/f1.json'));
const moved = new Map(toEntries(data));
const note = moved.get('note/shared')!;
assert.ok('value' in note);
if ('value' in note) note.value.sectionId = 'p2';
assert.equal(placeEntries(moved).get('note/shared')!.file, 'sections/p2/notes/shared.json');
const home = structuredClone(data), school = structuredClone(data);
home.studentNotes!.push({ id: 'home-note', sectionId: 'p1', studentId: 'ada', text: 'Home note', includeInReports: false, createdAt: T + 10, updatedAt: T + 10 });
school.studentNotes!.push({ id: 'school-note', sectionId: 'p1', studentId: 'ada', text: 'School note', includeInReports: true, createdAt: T + 20, updatedAt: T + 20 });
school.savedFilters![0].name = 'Homework follow-up'; school.savedFilters![0].updatedAt = T + 20;
const merged = fromEntries(mergeEntries(toEntries(data), toEntries(home), toEntries(school)).merged);
assert.equal(merged.studentNotes!.length, data.studentNotes!.length + 2);
assert.equal(merged.savedFilters![0].name, 'Homework follow-up');
home.studentNotes![0].text = 'First edit'; home.studentNotes![0].updatedAt = T + 30;
school.studentNotes![0].text = 'Second edit'; school.studentNotes![0].updatedAt = T + 40;
const conflict = mergeEntries(toEntries(data), toEntries(home), toEntries(school));
assert.equal(conflict.conflicts.length, 1, 'Conflicting edits to one note are kept for review');
assert.equal(fromEntries(conflict.merged).studentNotes!.find(note => note.id === 'private')!.text, 'Second edit');
assert.deepEqual(mergeLegacyGradebooks(normalizeGradebookData(null), [data]).studentNotes, data.studentNotes);

let version = 0;
const files = new Map<string, { text: string; version: number }>();
const io: FolderIO = {
  async list() { return [...files].map(([path, file]) => ({ path, stamp: String(file.version) })); },
  async read(path) { return files.get(path)?.text ?? null; },
  async write(path, text) { files.set(path, { text, version: ++version }); },
};
let local = structuredClone(data);
const machine: LocalSide = { read: () => ({ data: local, deletions: new Map() }), apply: result => local = result, settled: () => {} };
const synced = await syncOnce(io, emptySyncState(), machine, T);
assert.ok(synced.wrote.includes('records/sections/p1/notes/shared.json'));
const remoteNotesFile = files.get('records/sections/p1/notes/shared.json')!;
const remote = JSON.parse(remoteNotesFile.text);
remote.records['note/shared'].text = 'Note edited on the other computer'; remote.records['note/shared'].updatedAt = T + 100;
files.set('records/sections/p1/notes/shared.json', { text: JSON.stringify(remote), version: ++version });
const received = await syncOnce(io, synced.state, machine, T + 101);
assert.equal(received.problems.length, 0);
assert.equal(local.studentNotes!.find(note => note.id === 'shared')!.text, 'Note edited on the other computer', 'New note files are read as live records, not one-time conflict copies');
assert.deepEqual(normalizeGradebookData({ sections: [] }).studentNotes, []);
console.log('Gradebook follow-up logic passed: policy-consistent reports/filters, alternative and bonus scores, separate missing/ungraded, note privacy and escaping, backups, recovery versions, independent note merges, conflict retention and live folder sync.');
