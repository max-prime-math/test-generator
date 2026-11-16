import assert from 'node:assert/strict';
import fs from 'node:fs';
import { applyCurriculumLanguage, parseCurriculumCatalog, parseCurriculumLanguage } from '../src/lib/curriculum-library.ts';
import { buildGradebookReports, gradebookReportComment, type GradebookReportOptions } from '../src/lib/gradebook-reports.ts';
import { createAssessmentSnapshot, normalizeGradebookData } from '../src/lib/gradebook-model.ts';
import { defaultTestConfig, type Question, type SavedTest } from '../src/lib/types.ts';

const workspace = process.argv[2] ?? '/home/max/TestGen';
const catalog = parseCurriculumCatalog(fs.readFileSync(`${workspace}/curriculum/catalog.json`, 'utf8'));
const language = parseCurriculumLanguage(fs.readFileSync(`${workspace}/curriculum/comment-language.json`, 'utf8'));
const curriculum = applyCurriculumLanguage(catalog.courses, language);
const now = 1_800_000_000_000;

function render(label: string, placement: { classId: string; unitId: string; sectionId: string; indicatorId?: string }, earned: number) {
  const question: Question = { id: `q-${label}`, body: label, points: 4, tags: [], createdAt: now,
    classId: placement.classId, unitId: placement.unitId, sectionId: placement.sectionId,
    ...(placement.indicatorId ? { indicators: [placement.indicatorId] } : {}) };
  const test: SavedTest = { id: `test-${label}`, name: label, classId: placement.classId, unitId: placement.unitId, testType: 'test',
    config: { ...defaultTestConfig(label), selectedIds: [question.id] }, createdAt: now, updatedAt: now };
  const assessment = createAssessmentSnapshot(test, [question], 'section', { now, administeredAt: now });
  const data = normalizeGradebookData({
    sections: [{ id: 'section', name: 'Period 1', linkedClassId: placement.classId }],
    students: [{ id: 'john', firstName: 'John', lastName: 'Student' }],
    enrollments: [{ id: 'enrollment', sectionId: 'section', studentId: 'john' }],
    assessments: [assessment],
    scores: [{ id: `score-${label}`, sectionId: 'section', assessmentId: assessment.id, studentId: 'john', state: 'normal', points: earned,
      questionScores: [{ questionId: question.id, points: earned }], createdAt: now, updatedAt: now }],
  });
  const options: GradebookReportOptions = { sectionId: 'section', studentIds: ['john'], kind: 'outcomes', includeIncomplete: false,
    includeUngraded: false, includeNotes: false, includeInactive: false, generatedAt: now, curriculum };
  const comment = gradebookReportComment(buildGradebookReports(data, options)[0]);
  assert.ok(comment, `${label} produced no comment`);
  return comment.text;
}

const results = {
  linearStrength: render('linear-strength', {
    classId: 'manitoba-grade-9-mathematics-2026', unitId: 'mb9-course-1-patterns-and-relations', sectionId: 'MAT.9.1.B.3', indicatorId: '9.PR.3.5',
  }, 4),
  linearChallenge: render('linear-challenge', {
    classId: 'manitoba-grade-9-mathematics-2026', unitId: 'mb9-course-1-patterns-and-relations', sectionId: 'MAT.9.1.B.3', indicatorId: '9.PR.3.2',
  }, 1),
  surfaceArea: render('surface-area', {
    classId: 'manitoba-grade-9-mathematics-2026', unitId: 'mb9-course-2-shape-and-space', sectionId: 'MAT.9.2.C.1', indicatorId: '9.SS.2.2',
  }, 1),
  linearSystems: render('linear-systems', {
    classId: '3187ac3e-5992-4ad9-9d34-6291ddd6d7fd', unitId: 'linear-functions-and-systems', sectionId: '10I.R.9', indicatorId: '10I.R.9.5',
  }, 1),
  apCalculus: render('ap-calculus', {
    classId: 'ap-calculus-bc', unitId: 'ap-unit-2', sectionId: 'ap-topic-2-5', indicatorId: 'FUN-3.A',
  }, 1),
};

assert.equal(results.linearStrength, 'John can solve linear equations with rational coefficients.');
assert.match(results.linearChallenge, /John is challenged when asked to solve linear equations with rational coefficients\./);
assert.match(results.linearChallenge, /next step is to model equality preservation in linear equations\./);
assert.equal(results.surfaceArea,
  'John is challenged when calculating the surface area of composite objects. John\'s next step is to calculate the area of overlap between joined solids.');
assert.equal(results.linearSystems,
  'John is challenged when asked to solve systems of linear equations graphically and algebraically. John\'s next step is to solve a linear system algebraically and verify the solution.');
assert.equal(results.apCalculus,
  'John is challenged when asked to differentiate powers using the power rule. John\'s next step is to apply the power rule to differentiate a familiar function.');

// Even a narrow AP topic must produce a procedural indicator next step rather than restating it.
assert.ok(!/next step is to differentiate powers using the power rule/.test(results.apCalculus), 'AP next step must not repeat the challenge');

console.log(JSON.stringify(results, null, 2));
