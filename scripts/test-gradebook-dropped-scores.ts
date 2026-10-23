import assert from 'node:assert/strict';
import { calculateStudentGrade, finalGradePercent } from '../src/lib/gradebook-calculations.ts';
import { normalizeGradebookData } from '../src/lib/gradebook-model.ts';
import { GRADEBOOK_CATEGORIES, normalizeDroppedScorePolicy } from '../src/lib/gradebook-policies.ts';
import { gradebookOverviewCsv, gradebookScoresCsv, stringifyGradebookBackup, parseGradebookBackup } from '../src/lib/gradebook-backup.ts';
import { buildGradebookReports, gradebookReportsHtml } from '../src/lib/gradebook-reports.ts';
import { filterGradebookStudents, DEFAULT_GRADEBOOK_FILTER } from '../src/lib/gradebook-filters.ts';
import { toEntries, fromEntries, mergeEntries } from '../src/lib/gradebook-records.ts';

const data = normalizeGradebookData({
  sections: [{ id: 's', name: 'Math', categoryWeights: Object.fromEntries(GRADEBOOK_CATEGORIES.map(category => [category, category === 'quiz' || category === 'test' ? 50 : 0])) }],
  students: [{ id: 'ada', firstName: 'Ada', lastName: 'Lee' }],
  enrollments: [{ id: 'e', sectionId: 's', studentId: 'ada' }],
  assessments: [
    { id: 'small', sectionId: 's', savedTestName: 'Small quiz', totalPoints: 10, testType: 'quiz', administeredAt: 1 },
    { id: 'big', sectionId: 's', savedTestName: 'Big quiz', totalPoints: 100, testType: 'quiz', administeredAt: 2 },
    { id: 'high', sectionId: 's', savedTestName: 'High quiz', totalPoints: 10, testType: 'quiz', administeredAt: 3 },
    { id: 'test', sectionId: 's', savedTestName: 'Test', totalPoints: 100, testType: 'test', administeredAt: 4 },
  ].map(item => ({ ...item, savedTestId: '', source: 'external' })),
  scores: [4, 30, 9, 80].map((points, i) => ({ id: `score-${i}`, sectionId: 's', studentId: 'ada', assessmentId: ['small', 'big', 'high', 'test'][i], points, state: 'normal' })),
});
const section = data.sections[0], assessments = data.assessments;
const scoreFor = (id: string) => data.scores.find(score => score.assessmentId === id);
const originalScores = JSON.stringify(data.scores), originalAssessments = JSON.stringify(assessments);
const near = (actual: number | null, expected: number) => assert.ok(actual !== null && Math.abs(actual - expected) < 1e-9, `${actual} ≈ ${expected}`);
const grade = () => calculateStudentGrade(section, assessments, scoreFor);
near(grade().finalPercent, (43 / 120 * 100 + 80) / 2);
section.droppedScorePolicy = { quiz: 1, test: 99 };
let result = grade();
assert.deepEqual([...result.droppedAssessmentIds], ['big'], 'rank percentages, not raw earned points; keep the single test');
near(result.finalPercent, 72.5);
const extraTests = [40, 70].map((points, i) => ({ assessment: { ...assessments[3], id: `extra-test-${i}` }, score: { ...data.scores[3], assessmentId: `extra-test-${i}`, points } }));
const independent = calculateStudentGrade({ ...section, droppedScorePolicy: { quiz: 1, test: 2 } }, [...assessments, ...extraTests.map(item => item.assessment)], id => extraTests.find(item => item.assessment.id === id)?.score ?? scoreFor(id));
assert.deepEqual([...independent.droppedAssessmentIds].sort(), ['big', 'extra-test-0', 'extra-test-1'], 'test and quiz counts apply independently');
near(independent.finalPercent, 72.5);
assert.deepEqual(result.categories.find(item => item.category === 'quiz')!.earned, 13);
assert.equal(result.categories.find(item => item.category === 'quiz')!.possible, 20);
assert.equal(result.categories.find(item => item.category === 'quiz')!.count, 2);
section.droppedScorePolicy.quiz = 99;
result = grade();
assert.deepEqual([...result.droppedAssessmentIds].sort(), ['big', 'small']);
near(result.finalPercent, 85);
near(calculateStudentGrade(section, assessments, id => id === 'small' ? scoreFor(id) : undefined).finalPercent, 40);
assert.equal(calculateStudentGrade(section, assessments, () => undefined).finalPercent, null);
section.droppedScorePolicy = { quiz: 1 };
const pointsWeights = { ...section, categoryWeights: {} };
near(finalGradePercent(pointsWeights, assessments, scoreFor), 93 / 120 * 100);

const big = scoreFor('big')!;
const savedBig = structuredClone(big);
big.state = 'missing'; big.points = null;
section.missingGradePolicy = 'exclude';
assert.deepEqual([...grade().droppedAssessmentIds], ['small'], 'excluded missing work does not consume a drop');
section.missingGradePolicy = 'zero';
assert.deepEqual([...grade().droppedAssessmentIds], ['big'], 'missing-as-zero is eligible');
assert.equal(calculateStudentGrade(section, assessments, id => id === 'big' ? big : undefined).finalPercent, 0, 'the keep-one floor retains a sole missing-as-zero mark');
for (const state of ['excused', 'absent', 'incomplete'] as const) {
  big.state = state;
  assert.deepEqual([...grade().droppedAssessmentIds], ['small']);
}
big.state = 'alternative'; big.points = 18; big.alternativeTotalPoints = 20;
assert.deepEqual([...grade().droppedAssessmentIds], ['small'], 'alternative percentages use the individual denominator');
near(grade().categories.find(item => item.category === 'quiz')!.percent, 90);
big.alternativeTotalPoints = 0;
assert.deepEqual([...grade().droppedAssessmentIds], ['small'], 'unfinished alternative scores are ineligible');
Object.assign(big, savedBig); delete big.alternativeTotalPoints;
const high = scoreFor('high')!;
high.points = 15;
assert.deepEqual([...grade().droppedAssessmentIds], ['big']);
near(grade().categories.find(item => item.category === 'quiz')!.percent, 95);
high.points = 9;

// Ties remain stable when lists are reordered and across machines.
const tied = assessments.filter(item => item.testType === 'quiz').map(item => ({ ...item, administeredAt: 1, createdAt: 1 }));
const tiedGrade = (list: typeof tied) => calculateStudentGrade(section, list, id => ({ ...scoreFor(id)!, points: tied.find(item => item.id === id)!.totalPoints / 2 }));
assert.deepEqual([...tiedGrade(tied).droppedAssessmentIds], ['big']);
assert.deepEqual([...tiedGrade(tied.toReversed()).droppedAssessmentIds], ['big']);
assert.deepEqual(normalizeDroppedScorePolicy({ quiz: -1, test: 1.5, exam: Infinity, other: 2, nonsense: 1 }), { other: 2 });
assert.deepEqual(normalizeGradebookData({ sections: [{ id: 'old' }] }).sections[0].droppedScorePolicy, {});

const options = { sectionId: 's', studentIds: ['ada'], kind: 'progress' as const, includeIncomplete: false, includeUngraded: false, includeNotes: false, includeInactive: false, generatedAt: 1 };
const reports = buildGradebookReports(data, { ...options, assessmentIds: ['big'] });
near(reports[0].finalPercent, 72.5);
assert.equal(reports[0].categories.find(item => item.category === 'quiz')!.droppedCount, 1);
assert.equal(reports[0].rows[0].dropped, true);
assert.equal(reports[0].rows[0].points, 30, 'printed score retains raw marks');
assert.match(gradebookReportsHtml(reports), /Dropped/);
assert.match(gradebookOverviewCsv(data, 's', { studentIds: ['ada'], assessmentIds: ['big'], display: 'points' }), /30 \(Dropped\),72.5%/);
const rawCsv = gradebookScoresCsv(data).split('\n').map(line => line.split(','));
const dropIndex = rawCsv[0].indexOf('droppedByPolicy');
assert.equal(rawCsv.find(row => row[10] === 'big')![dropIndex], 'true');
assert.equal(rawCsv.find(row => row[10] === 'small')![dropIndex], 'false');
assert.ok(rawCsv.every(row => row.length === rawCsv[0].length));
const emptyCsv = gradebookScoresCsv({ ...data, assessments: [], scores: [] }).split('\n').map(line => line.split(','));
assert.equal(emptyCsv[1].length, emptyCsv[0].length);
assert.equal(filterGradebookStudents(data, section, data.students, { ...DEFAULT_GRADEBOOK_FILTER, belowPercent: 70 }).length, 0, 'grade filters use adjusted final grades');
big.state = 'missing'; big.points = null;
assert.equal(buildGradebookReports(data, { ...options, kind: 'missing' })[0].rows[0].dropped, true, 'dropped missing work keeps its recorded state');
Object.assign(big, savedBig);
section.previousDroppedScorePolicy = { quiz: 2 };
const backup = parseGradebookBackup(stringifyGradebookBackup(data));
assert.deepEqual(backup.sections[0].droppedScorePolicy, { quiz: 1 });
assert.deepEqual(backup.sections[0].previousDroppedScorePolicy, { quiz: 2 });
assert.deepEqual(fromEntries(toEntries(data)).sections[0].droppedScorePolicy, { quiz: 1 });
const home = structuredClone(data), school = structuredClone(data);
home.sections[0].droppedScorePolicy = { quiz: 2 }; home.sections[0].updatedAt += 10;
school.scores[0].points = 10; school.scores[0].updatedAt += 20;
const merged = mergeEntries(toEntries(data), toEntries(home), toEntries(school));
assert.equal(merged.conflicts.length, 0);
assert.deepEqual(fromEntries(merged.merged).sections[0].droppedScorePolicy, { quiz: 2 });
school.sections[0].droppedScorePolicy = { test: 1 }; school.sections[0].updatedAt += 30;
assert.equal(mergeEntries(toEntries(data), toEntries(home), toEntries(school)).conflicts.length, 1, 'competing policies retain section conflict review');
section.droppedScorePolicy = {};
near(grade().finalPercent, (43 / 120 * 100 + 80) / 2);
assert.equal(JSON.stringify(data.scores), originalScores, 'policies never edit score records');
assert.equal(JSON.stringify(assessments), originalAssessments, 'policies never change administered snapshots');
console.log('Dropped-score logic passed: percentage ranking, weighted/points totals, keep-one floor, states, alternatives, bonuses, ties, unchanged marks, reports, CSV, filters, backups and record merges.');
