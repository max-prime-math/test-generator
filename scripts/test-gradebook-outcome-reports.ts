import assert from 'node:assert/strict';
import { createAssessmentSnapshot, normalizeGradebookData } from '../src/lib/gradebook-model.ts';
import { buildGradebookReports, gradebookReportComment, gradebookReportCommentsText, gradebookReportsHtml, type GradebookReportOptions } from '../src/lib/gradebook-reports.ts';
import { defaultTestConfig, type Class, type Question, type SavedTest } from '../src/lib/types.ts';

const T = 1_800_000_000_000;
const curriculum: Class[] = [{
  id: 'math', name: 'Mathematics', units: [{ id: 'algebra', name: 'Algebra', sections: [{
    id: 'A.1', name: 'Solve linear equations', nickname: 'solve linear equations', indicators: [
      { id: 'A.1.1', text: 'Solve one-step equations.', nickname: 'solve one-step equations' },
      { id: 'A.1.2', text: 'Solve multi-step equations.', nickname: 'solve multi-step equations', nextStep: 'practice the distributive property' },
    ],
  }, { id: 'A.2', name: 'Graph linear relations' }] }],
}];
const question = (id: string, points: number, fields: Partial<Question> = {}): Question => ({
  id, body: `Question <${id}>`, points, tags: [], createdAt: T, classId: 'math', unitId: 'algebra', sectionId: 'A.1', ...fields,
});
const questions = [
  question('q1', 4, { indicators: ['A.1.1'] }),
  question('q2', 2, { indicators: ['A.1.1', 'A.1.2'] }),
  question('q3', 5, { sectionId: 'A.2' }),
  question('q4', 3, { classId: undefined, unitId: undefined, sectionId: undefined }),
  question('q5', 1, { indicators: ['A.1.1'] }),
];
const savedTest: SavedTest = {
  id: 'test-template', name: 'Algebra <test>', classId: 'math', unitId: 'algebra', testType: 'test',
  config: { ...defaultTestConfig('Algebra test'), selectedIds: questions.map(item => item.id), bonusQuestionIds: ['q5'] }, createdAt: T, updatedAt: T,
};
const assessment = createAssessmentSnapshot(savedTest, questions, 'section', { now: T, administeredAt: T });
assert.deepEqual(assessment.questionSnapshots[1].indicators, ['A.1.1', 'A.1.2']);
questions[1].indicators!.push('CHANGED-LATER');
assert.deepEqual(assessment.questionSnapshots[1].indicators, ['A.1.1', 'A.1.2'], 'administered outcome tags are frozen');

const alternative = createAssessmentSnapshot(savedTest, questions, 'section', { now: T + 1, administeredAt: T + 1 });
alternative.id = 'alternative-assessment';
const data = normalizeGradebookData({
  sections: [{ id: 'section', name: 'Period 1', linkedClassId: 'math' }],
  students: [{ id: 'student', firstName: 'Ada', lastName: 'Lovelace' }],
  enrollments: [{ id: 'enrollment', sectionId: 'section', studentId: 'student' }],
  assessments: [assessment, alternative],
  scores: [
    { id: 'score', sectionId: 'section', assessmentId: assessment.id, studentId: 'student', state: 'normal', points: 8,
      questionScores: [{ questionId: 'q1', points: 4 }, { questionId: 'q2', points: 1 }, { questionId: 'q3', points: 3 }, { questionId: 'q4', points: 0 }, { questionId: 'q5', points: 1 }] },
    { id: 'alternative-score', sectionId: 'section', assessmentId: alternative.id, studentId: 'student', state: 'alternative', points: 10, alternativeTotalPoints: 10,
      questionScores: [{ questionId: 'q1', points: 0 }] },
  ],
});
assert.deepEqual(data.assessments[0].questionSnapshots[1].indicators, ['A.1.1', 'A.1.2']);

const options: GradebookReportOptions = {
  sectionId: 'section', studentIds: ['student'], assessmentIds: [assessment.id, alternative.id], kind: 'outcomes',
  includeIncomplete: false, includeUngraded: false, includeNotes: false, includeInactive: false, generatedAt: T, curriculum,
};
const before = JSON.stringify(data);
const [report] = buildGradebookReports(data, options);
assert.equal(report.outcomes.length, 3);
assert.deepEqual(report.outcomeCoverage, { scoredQuestions: 4, taggedQuestions: 3 }, 'coverage exposes scored questions without curriculum tags');
const oneStep = report.outcomes.find(outcome => outcome.id === 'A.1.1')!;
assert.equal(oneStep.label, 'solve one-step equations');
assert.equal(oneStep.earned, 5);
assert.equal(oneStep.possible, 6);
assert.equal(oneStep.standing, 'strength');
assert.deepEqual(oneStep.evidence.map(item => item.questionLabel), ['1', '2']);
assert.ok(!report.outcomes.some(outcome => outcome.evidence.some(item => item.questionId === 'q5')), 'bonus questions do not supply curricular evidence');
const multiStep = report.outcomes.find(outcome => outcome.id === 'A.1.2')!;
assert.equal(multiStep.percent, 50, 'a multi-tagged question supplies full evidence to each tag');
assert.equal(multiStep.standing, 'weakness');
const graphing = report.outcomes.find(outcome => outcome.id === 'A.2')!;
assert.equal(graphing.label, 'A.2 Graph linear relations');
assert.equal(graphing.percent, 60);
assert.equal(graphing.standing, 'weakness');
assert.ok(!report.outcomes.some(outcome => outcome.evidence.some(item => item.assessmentId === alternative.id)), 'replacement totals exclude retained original question detail');
assert.equal(JSON.stringify(data), before, 'reporting never changes assessments or scores');
const comment = gradebookReportComment(report)!;
assert.equal(comment.text, 'Ada can solve one-step equations. Ada is challenged when asked to solve multi-step equations. Ada\'s next step is to practice the distributive property.');
assert.equal(gradebookReportCommentsText([comment]), `Ada Lovelace: ${comment.text}`);

const limited = buildGradebookReports(data, { ...options, assessmentIds: [alternative.id] })[0];
assert.deepEqual(limited.outcomes, []);
assert.deepEqual(limited.outcomeCoverage, { scoredQuestions: 0, taggedQuestions: 0 });
const lowerThreshold = buildGradebookReports(data, { ...options, strengthThreshold: 50 })[0];
assert.equal(lowerThreshold.strengthThreshold, 50);
assert.equal(lowerThreshold.outcomes.filter(outcome => outcome.standing === 'strength').length, 2);
const relativeWeakness = lowerThreshold.outcomes.find(outcome => outcome.standing === 'weakness')!;
assert.equal(relativeWeakness.id, 'A.1.2', 'the weakest outcome supplies contrast when every result meets the threshold');
assert.equal(relativeWeakness.relative, true);

const higherThreshold = buildGradebookReports(data, { ...options, strengthThreshold: 90 })[0];
const relativeStrength = higherThreshold.outcomes.find(outcome => outcome.standing === 'strength')!;
assert.equal(relativeStrength.id, 'A.1.1', 'the strongest outcome supplies contrast when no result meets the threshold');
assert.equal(relativeStrength.relative, true);

function reportAt(questionPoints: Record<string, number>) {
  const copy = normalizeGradebookData(structuredClone(data));
  const score = copy.scores.find(item => item.id === 'score')!;
  for (const questionScore of score.questionScores ?? []) if (questionScore.questionId in questionPoints) {
    questionScore.points = questionPoints[questionScore.questionId];
  }
  return buildGradebookReports(copy, options)[0];
}
const perfect = reportAt({ q1: 4, q2: 2, q3: 5 });
assert.ok(perfect.outcomes.every(outcome => outcome.standing === 'strength' && !outcome.relative), 'all-perfect evidence remains strengths-only');
const zero = reportAt({ q1: 0, q2: 0, q3: 0 });
assert.ok(zero.outcomes.every(outcome => outcome.standing === 'weakness' && !outcome.relative), 'all-zero evidence remains weaknesses-only');

const html = gradebookReportsHtml([report]);
assert.match(html, /Curricular outcomes report/);
assert.match(html, /Strength: 70% or higher · Weakness: below 70%/);
assert.match(html, /Algebra &lt;test&gt; · Q2/);
assert.match(html, /Question &lt;q2&gt;/);
assert.ok(!html.includes('Question <q2>'));
assert.match(html, /Weaknesses/);
assert.match(html, /These evidence summaries do not change the course grade/);
const relativeHtml = gradebookReportsHtml([lowerThreshold]);
assert.match(relativeHtml, /Weakest result/);
assert.match(relativeHtml, /strongest or weakest non-extreme outcome is shown as a relative comparison/);

console.log('Gradebook curricular outcome reports passed: frozen tags, per-question evidence, parent-readable comments and next steps, bonus exclusion, threshold and relative contrast, perfect/zero exceptions, fallback outcomes, coverage, state exclusions, filtering, escaping, and read-only calculations.');
