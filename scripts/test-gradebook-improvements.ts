import assert from 'node:assert/strict';
import { finalGradePercent, gradePercent } from '../src/lib/gradebook-calculations.ts';
import { gradebookOverviewCsv, parseGradebookBackup, stringifyGradebookBackup } from '../src/lib/gradebook-backup.ts';
import { normalizeGradebookData } from '../src/lib/gradebook-model.ts';
import { parseGradePaste } from '../src/lib/gradebook-paste.ts';
import { previewRosterImport } from '../src/lib/gradebook-roster-preview.ts';
import { parseRosterImport } from '../src/lib/gradebook-roster-import.ts';
const data = normalizeGradebookData({
  sections: [{ id: 's', name: 'Section', missingGradePolicy: 'zero', categoryWeights: { test: 75, quiz: 25 } }],
  students: [{ id: 'a', firstName: 'Ada', lastName: 'Lee', sisId: '001' }],
  enrollments: [{ id: 'e', sectionId: 's', studentId: 'a' }],
  assessments: [{ id: 't', sectionId: 's', savedTestId: 'external-t', savedTestName: 'Test, one', testType: 'test', totalPoints: 100 }, { id: 'q', sectionId: 's', savedTestId: 'external-q', savedTestName: 'Quiz', testType: 'quiz', totalPoints: 10 }],
  scores: [{ id: 'st', sectionId: 's', studentId: 'a', assessmentId: 't', state: 'missing', points: null }, { id: 'sq', sectionId: 's', studentId: 'a', assessmentId: 'q', state: 'normal', points: 8 }],
});
const section = data.sections[0];
const scoreFor = (id: string) => data.scores.find(score => score.assessmentId === id);
assert.equal(finalGradePercent(section, data.assessments, scoreFor), 20);
assert.equal(gradePercent(data.scores[0], data.assessments[0], section), 0);
section.missingGradePolicy = 'exclude';
assert.equal(finalGradePercent(section, data.assessments, scoreFor), 80);
for (const state of ['excused', 'absent', 'incomplete'] as const) {
  data.scores[0].state = state;
  section.missingGradePolicy = 'zero';
  assert.equal(finalGradePercent(section, data.assessments, scoreFor), 80);
}
assert.equal(finalGradePercent(section, data.assessments, () => undefined), null);
assert.equal(parseGradebookBackup(stringifyGradebookBackup(data)).sections[0].missingGradePolicy, 'zero');
assert.equal(normalizeGradebookData({ sections: [{ id: 'legacy' }] }).sections[0].missingGradePolicy, 'exclude');
const csv = gradebookOverviewCsv(data, 's', { studentIds: ['a'], assessmentIds: ['q', 't'], display: 'percent' });
assert.match(csv, /Student,Student ID,Quiz \(%\),"Test, one \(%\)",Final grade \(%\)/);
assert.match(csv, /Ada Lee,001,80%,Incomplete,80%/);
assert.deepEqual(parseGradePaste('".5"\t2\r\n0\t\r\n', true), [[{ points: .5, state: 'normal' }, { points: 2, state: 'normal' }], [{ points: 0, state: 'normal' }, { points: null, state: 'normal' }]]);
assert.equal(parseGradePaste('Missing\nEXCUSED', false)[0][0].state, 'missing');
for (const invalid of ['1\tbad', '-1', '50%', 'Infinity', '1e3']) assert.throws(() => parseGradePaste(invalid, true));
assert.throws(() => parseGradePaste('Missing', true));
const roster = parseRosterImport('Name,Student ID\nAda Lee,001\nWrong Person,001\nAda Lee,002\nGrace Hopper,003\nGrace Hopper,004').students;
assert.deepEqual(previewRosterImport(data.students, roster).map(row => row.action), ['Update', 'Conflict', 'Conflict', 'Add', 'Conflict']);
const ambiguous = [{ ...data.students[0], sisId: undefined }, { ...data.students[0], id: 'duplicate', sisId: undefined }];
assert.equal(previewRosterImport(ambiguous, parseRosterImport('Name\nAda Lee').students)[0].action, 'Conflict');
console.log('Gradebook policy, calculation/export consistency, clipboard validation, and roster conflict tests passed.');
