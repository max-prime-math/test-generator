import assert from 'node:assert/strict';
import { createAssessmentSnapshot, createExternalAssessment, normalizeGradebookData, setExternalAssessmentQuestionCurriculum } from '../src/lib/gradebook-model.ts';
import { buildGradebookReports, gradebookReportComment, gradebookReportComments, gradebookReportCommentsText, gradebookReportsHtml, reportNumber, type GradebookReportOptions } from '../src/lib/gradebook-reports.ts';
import { defaultTestConfig, type Class, type Question, type SavedTest } from '../src/lib/types.ts';

const T = 1_800_000_000_000;
const curriculum: Class[] = [{
  id: 'math', name: 'Mathematics', units: [{ id: 'algebra', name: 'Algebra', sections: [{
    id: 'A.1', name: 'Solve linear equations', nickname: 'solve linear equations', indicators: [
      { id: 'A.1.1', text: 'Solve one-step equations.', nickname: 'solve one-step equations' },
      { id: 'A.1.2', text: 'Solve multi-step equations.', nickname: 'solve multi-step equations', nextStep: 'practice the distributive property' },
      { id: 'A.1.3', text: 'Check a solution by substitution.', nickname: 'check solutions by substitution' },
    ],
  }, { id: 'A.2', name: 'Graph linear relations', nickname: 'graph linear relations', indicators: [
    { id: 'A.2.1', text: 'Plot points from a table of values.', nickname: 'plot points from a table of values' },
    { id: 'A.2.2', text: 'Determine the slope of a line.', nickname: 'determine the slope of a line' },
    { id: 'A.2.3', text: 'Write the equation of a line.', nickname: 'write the equation of a line' },
  ] }] }],
}];
const question = (id: string, points: number, fields: Partial<Question> = {}): Question => ({
  id, body: `Question <${id}>`, points, tags: [], createdAt: T, classId: 'math', unitId: 'algebra', sectionId: 'A.1', ...fields,
});
const questions = [
  question('q1', 4, { indicators: ['A.1.1'] }),
  question('q2', 2, { indicators: ['A.1.1', 'A.1.2'] }),
  question('q3', 5, { sectionId: 'A.2', indicators: ['A.2.1'] }),
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
assert.equal(report.outcomes.length, 2);
assert.deepEqual(report.outcomeCoverage, { scoredQuestions: 4, taggedQuestions: 3 }, 'coverage exposes scored questions without curriculum tags');
const equations = report.outcomes.find(outcome => outcome.id === 'A.1')!;
assert.equal(equations.commentLabel, 'solve linear equations');
assert.equal(equations.earned, 5);
assert.equal(equations.possible, 6);
assert.equal(equations.standing, 'strength');
assert.deepEqual(equations.evidence.map(item => item.questionLabel), ['1', '2']);
assert.deepEqual(equations.evidence[1].indicators.map(item => item.indicatorId), ['A.1.1', 'A.1.2'], 'outcome evidence retains exact question indicators');
assert.ok(!report.outcomes.some(outcome => outcome.evidence.some(item => item.questionId === 'q5')), 'bonus questions do not supply curricular evidence');
const graphing = report.outcomes.find(outcome => outcome.id === 'A.2')!;
assert.equal(graphing.label, 'A.2 graph linear relations');
assert.equal(graphing.percent, 60);
assert.equal(graphing.standing, 'weakness');
assert.ok(!report.outcomes.some(outcome => outcome.evidence.some(item => item.assessmentId === alternative.id)), 'replacement totals exclude retained original question detail');
assert.equal(JSON.stringify(data), before, 'reporting never changes assessments or scores');
const comment = gradebookReportComment(report)!;
assert.equal(comment.text, 'Ada can solve linear equations. Ada is challenged when asked to graph linear relations. Ada\'s next step is to plot points from a table of values.');
assert.equal(comment.finalPercent, report.finalPercent);
assert.equal(gradebookReportCommentsText([comment]), `Student\tComment\tFinal grade\nAda Lovelace\t${comment.text}\t75%`);

const linkedNextStepCurriculum = structuredClone(curriculum);
linkedNextStepCurriculum.push({
  id: 'foundations', name: 'Mathematical Foundations', units: [{ id: 'checking', name: 'Checking Work', sections: [{
    id: 'F.1', name: 'Verify solutions', indicators: [{ id: 'F.1.1', text: 'Check a solution by substitution.', nickname: 'check solutions by substitution' }],
  }] }],
});
const linkedChallenge = linkedNextStepCurriculum[0].units[0].sections[0];
linkedChallenge.nextStepIndicator = { classId: 'foundations', unitId: 'checking', sectionId: 'F.1', indicatorId: 'F.1.1' };
const [linkedNextStepReport] = buildGradebookReports(data, { ...options, curriculum: linkedNextStepCurriculum });
assert.equal(gradebookReportComment(linkedNextStepReport)?.text,
  comment.text,
  'a manually linked fallback does not override the indicator attached to the weak question');

const nounPhraseComment = gradebookReportComment({
  ...report,
  outcomes: report.outcomes.map(outcome => outcome.id === 'A.2'
    ? { ...outcome, commentLabel: 'Surface area of composite three-dimensional objects', nextStepCandidates: [
        { reference: { classId: 'math', unitId: 'algebra', sectionId: 'A.2', indicatorId: 'A.2.1' }, label: 'identify the exposed faces of a composite object' },
      ], evidence: outcome.evidence.map(evidence => ({ ...evidence, indicators: [{ classId: 'math', unitId: 'algebra', sectionId: 'A.2', indicatorId: 'A.2.1' }] })) }
    : outcome),
})!;
assert.equal(nounPhraseComment.text,
  'Ada can solve linear equations. Ada is challenged when asked about surface area of composite three-dimensional objects. Ada\'s next step is to identify the exposed faces of a composite object.',
  'topic-style outcome headings remain grammatical without pretending they are verb phrases');

const activityPhraseComment = gradebookReportComment({
  ...report,
  outcomes: report.outcomes.map(outcome => outcome.id === 'A.2'
    ? { ...outcome, commentLabel: 'calculating surface area of composite three-dimensional objects', nextStepCandidates: [
        { reference: { classId: 'math', unitId: 'algebra', sectionId: 'A.2', indicatorId: 'A.2.1' }, label: 'calculate the area of overlap between joined solids' },
      ], evidence: outcome.evidence.map(evidence => ({ ...evidence, indicators: [{ classId: 'math', unitId: 'algebra', sectionId: 'A.2', indicatorId: 'A.2.1' }] })) }
    : outcome),
})!;
assert.equal(activityPhraseComment.text,
  'Ada can solve linear equations. Ada is challenged when calculating surface area of composite three-dimensional objects. Ada\'s next step is to calculate the area of overlap between joined solids.',
  'activity-style outcome language flows directly after "when"');

const weakIndicatorReport = structuredClone(report);
const weakOutcome = weakIndicatorReport.outcomes.find(outcome => outcome.id === 'A.2')!;
weakOutcome.nextStepCandidates = [
  { reference: { classId: 'math', unitId: 'algebra', sectionId: 'A.2', indicatorId: 'A.2.1' }, label: 'plot points from a table of values' },
  { reference: { classId: 'math', unitId: 'algebra', sectionId: 'A.2', indicatorId: 'A.2.2' }, label: 'determine the slope of a line' },
];
weakOutcome.evidence = [
  { ...weakOutcome.evidence[0], questionId: 'strong-indicator', earned: 4, possible: 5, percent: 80,
    indicators: [{ classId: 'math', unitId: 'algebra', sectionId: 'A.2', indicatorId: 'A.2.1' }] },
  { ...weakOutcome.evidence[0], questionId: 'weak-indicator', earned: 1, possible: 5, percent: 20,
    indicators: [{ classId: 'math', unitId: 'algebra', sectionId: 'A.2', indicatorId: 'A.2.2' }] },
];
assert.match(gradebookReportComment(weakIndicatorReport)!.text, /next step is to determine the slope of a line\.$/,
  'the weakest represented question-level indicator becomes the next step');

const fallbackReport = structuredClone(report);
const fallbackOutcome = fallbackReport.outcomes.find(outcome => outcome.id === 'A.2')!;
fallbackOutcome.evidence.forEach(evidence => evidence.indicators = []);
const reopened = gradebookReportComment(fallbackReport)!.text;
assert.equal(gradebookReportComment(structuredClone(fallbackReport))!.text, reopened,
  'reopening the same student, assessment scope, and outcome keeps the fallback stable');
const studentFallbacks = new Set(Array.from({ length: 24 }, (_, index) => {
  const copy = structuredClone(fallbackReport); copy.studentId = `student-${index}`;
  return gradebookReportComment(copy)!.text.match(/next step is to (.+)\.$/)?.[1];
}));
assert.ok(studentFallbacks.size > 1, 'different students are not forced to receive the same fallback indicator');
const outcomeFallbacks = new Set(Array.from({ length: 24 }, (_, index) => {
  const copy = structuredClone(fallbackReport);
  copy.outcomes.find(outcome => outcome.id === 'A.2')!.curriculumKey = `outcome-${index}`;
  return gradebookReportComment(copy)!.text.match(/next step is to (.+)\.$/)?.[1];
}));
assert.ok(outcomeFallbacks.size > 1, 'different outcomes are not forced to receive the same fallback indicator');

const repeatedCandidateReport = structuredClone(report);
const repeatedOutcome = repeatedCandidateReport.outcomes.find(outcome => outcome.id === 'A.2')!;
repeatedOutcome.nextStepCandidates = [
  { reference: { classId: 'math', unitId: 'algebra', sectionId: 'A.2', indicatorId: 'same' }, label: 'graph linear relations' },
  { reference: { classId: 'math', unitId: 'algebra', sectionId: 'A.2', indicatorId: 'useful' }, label: 'plot points from a table of values' },
];
repeatedOutcome.evidence[0].indicators = [
  { classId: 'math', unitId: 'algebra', sectionId: 'A.2', indicatorId: 'same' },
  { classId: 'math', unitId: 'algebra', sectionId: 'A.2', indicatorId: 'useful' },
];
assert.match(gradebookReportComment(repeatedCandidateReport)!.text, /next step is to plot points from a table of values\.$/,
  'a candidate that merely repeats the challenge is skipped');

const noIndicatorReport = structuredClone(report);
const noIndicatorOutcome = noIndicatorReport.outcomes.find(outcome => outcome.id === 'A.2')!;
noIndicatorOutcome.nextStepCandidates = [];
noIndicatorOutcome.nextStep = undefined;
noIndicatorOutcome.evidence.forEach(evidence => evidence.indicators = []);
assert.match(gradebookReportComment(noIndicatorReport)!.text,
  /next step is to identify the key information and complete the first step of the problem\.$/,
  'an outcome with no indicators receives a concrete non-repeating fallback');

const boundActionReport = structuredClone(noIndicatorReport);
boundActionReport.outcomes.find(outcome => outcome.id === 'A.2')!.commentLabel = 'bound a function between two functions with the same limit';
assert.match(gradebookReportComment(boundActionReport)!.text, /challenged when asked to bound a function/,
  'action recognition covers verbs used by the reviewed curriculum language');
const alternatingTopicReport = structuredClone(noIndicatorReport);
alternatingTopicReport.outcomes.find(outcome => outcome.id === 'A.2')!.commentLabel = 'alternating series error bounds';
assert.match(gradebookReportComment(alternatingTopicReport)!.text, /challenged when asked about alternating series error bounds/,
  'an -ing adjective in a topic phrase is not mistaken for an activity');

const external = createExternalAssessment({ sectionId: 'section', name: 'Paper quiz', testType: 'quiz', totalPoints: 0, questionPoints: [4] }, T);
const externalTagged = setExternalAssessmentQuestionCurriculum(normalizeGradebookData({ assessments: [external] }), external.id, 'external-q1', {
  classId: 'math', unitId: 'algebra', sectionId: 'A.1', indicators: ['A.1.1'],
}, T + 1).assessments[0];
const externalData = normalizeGradebookData({
  sections: data.sections, students: data.students, enrollments: data.enrollments, assessments: [externalTagged],
  scores: [{ id: 'external-score', sectionId: 'section', assessmentId: external.id, studentId: 'student', state: 'normal', points: 3,
    questionScores: [{ questionId: 'external-q1', points: 3 }] }],
});
const [externalReport] = buildGradebookReports(externalData, { ...options, assessmentIds: [external.id] });
assert.equal(externalReport.outcomes[0].id, 'A.1', 'manually assigned external-question indicators become outcome evidence');
assert.equal(externalReport.outcomes[0].percent, 75);
assert.equal(externalReport.outcomes[0].evidence[0].assessmentName, 'Paper quiz');

const sharedCodeAssessment = structuredClone(assessment);
sharedCodeAssessment.id = 'shared-code-assessment';
sharedCodeAssessment.questionSnapshots = [
  { questionId: 'left', label: '1', order: 0, points: 1, isBonus: false, classId: 'left-course', unitId: 'u', sectionId: 's', indicators: ['SHARED.1'] },
  { questionId: 'right', label: '2', order: 1, points: 1, isBonus: false, classId: 'right-course', unitId: 'u', sectionId: 's', indicators: ['SHARED.1'] },
];
const sharedCodeData = normalizeGradebookData({
  sections: data.sections, students: data.students, enrollments: data.enrollments,
  assessments: [sharedCodeAssessment],
  scores: [{ id: 'shared-code-score', sectionId: 'section', assessmentId: sharedCodeAssessment.id, studentId: 'student', state: 'normal', points: 1,
    questionScores: [{ questionId: 'left', points: 1 }, { questionId: 'right', points: 0 }] }],
});
const sharedCodeCurriculum: Class[] = ['left', 'right'].map(side => ({
  id: `${side}-course`, name: `${side} course`, units: [{ id: 'u', name: 'Unit', sections: [{ id: 's', name: 'Section', nickname: `${side} skill`, indicators: [
    { id: 'SHARED.1', text: `${side} outcome`, nickname: `${side} skill` },
  ] }] }],
}));
const sharedCodeOutcomes = buildGradebookReports(sharedCodeData, { ...options, assessmentIds: [sharedCodeAssessment.id], curriculum: sharedCodeCurriculum })[0].outcomes;
assert.equal(sharedCodeOutcomes.length, 2, 'the same indicator code in two courses remains two canonical outcomes');
assert.deepEqual(sharedCodeOutcomes.map(outcome => outcome.commentLabel).sort(), ['left skill', 'right skill']);

const limited = buildGradebookReports(data, { ...options, assessmentIds: [alternative.id] })[0];
assert.deepEqual(limited.outcomes, []);
assert.deepEqual(limited.outcomeCoverage, { scoredQuestions: 0, taggedQuestions: 0 });
const [limitedCommentRow] = gradebookReportComments([limited]);
assert.equal(limitedCommentRow.text, '', 'students without outcome evidence retain a spreadsheet row without invented comment text');
assert.equal(gradebookReportCommentsText([limitedCommentRow]), 'Student\tComment\tFinal grade\nAda Lovelace\t\t75%');
const lowerThreshold = buildGradebookReports(data, { ...options, strengthThreshold: 50 })[0];
assert.equal(lowerThreshold.strengthThreshold, 50);
assert.equal(lowerThreshold.outcomes.filter(outcome => outcome.standing === 'strength').length, 1);
const relativeWeakness = lowerThreshold.outcomes.find(outcome => outcome.standing === 'weakness')!;
assert.equal(relativeWeakness.id, 'A.2', 'the weakest outcome supplies contrast when every result meets the threshold');
assert.equal(relativeWeakness.relative, true);

const higherThreshold = buildGradebookReports(data, { ...options, strengthThreshold: 90 })[0];
const relativeStrength = higherThreshold.outcomes.find(outcome => outcome.standing === 'strength')!;
assert.equal(relativeStrength.id, 'A.1', 'the strongest outcome supplies contrast when no result meets the threshold');
assert.equal(relativeStrength.relative, true);

function reportAt(questionPoints: Record<string, number>, strengthThreshold = options.strengthThreshold) {
  const copy = normalizeGradebookData(structuredClone(data));
  const score = copy.scores.find(item => item.id === 'score')!;
  for (const questionScore of score.questionScores ?? []) if (questionScore.questionId in questionPoints) {
    questionScore.points = questionPoints[questionScore.questionId];
  }
  return buildGradebookReports(copy, { ...options, strengthThreshold })[0];
}
const perfect = reportAt({ q1: 4, q2: 2, q3: 5 });
assert.ok(perfect.outcomes.every(outcome => outcome.standing === 'strength' && !outcome.relative), 'all-perfect evidence remains strengths-only');
assert.equal(gradebookReportComment(perfect)?.outcomeBalance, 'no-weaknesses');
const zero = reportAt({ q1: 0, q2: 0, q3: 0 });
assert.ok(zero.outcomes.every(outcome => outcome.standing === 'weakness' && !outcome.relative), 'all-zero evidence remains weaknesses-only');
assert.equal(gradebookReportComment(zero)?.outcomeBalance, 'no-strengths');
const equal = reportAt({ q1: 2, q2: 1, q3: 2.5 });
assert.ok(equal.outcomes.every(outcome => outcome.percent === 50 && outcome.standing === 'weakness' && !outcome.relative), 'equal non-extreme results stay together instead of becoming both strengths and weaknesses');
assert.equal(gradebookReportComment(equal)?.outcomeBalance, 'no-strengths');
const tiedStrongest = reportAt({ q1: 3.2, q2: 1.6, q3: 3 }, 90);
assert.deepEqual(tiedStrongest.outcomes.filter(outcome => outcome.standing === 'strength').map(outcome => reportNumber(outcome.percent)), ['80'], 'the strongest outcome supplies relative contrast');
assert.deepEqual(tiedStrongest.outcomes.filter(outcome => outcome.standing === 'weakness').map(outcome => reportNumber(outcome.percent)), ['60']);
const tiedWeakest = reportAt({ q1: 3.6, q2: 1.2, q3: 3 }, 50);
assert.deepEqual(tiedWeakest.outcomes.filter(outcome => outcome.standing === 'strength').map(outcome => reportNumber(outcome.percent)), ['80']);
assert.deepEqual(tiedWeakest.outcomes.filter(outcome => outcome.standing === 'weakness').map(outcome => reportNumber(outcome.percent)), ['60'], 'the weakest outcome supplies relative contrast');
for (const result of [report, lowerThreshold, higherThreshold, perfect, zero, equal, tiedStrongest, tiedWeakest]) {
  const strengthPercents = new Set(result.outcomes.filter(outcome => outcome.standing === 'strength').map(outcome => reportNumber(outcome.percent)));
  assert.ok(result.outcomes.filter(outcome => outcome.standing === 'weakness').every(outcome => !strengthPercents.has(reportNumber(outcome.percent))), 'the same displayed result is never both a strength and a weakness');
}

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
assert.match(relativeHtml, /all outcomes tied for strongest or weakest are shown as a relative comparison\. Equal results stay together/);

console.log('Gradebook curricular outcome reports passed: frozen tags, per-question evidence, parent-readable comments and next steps, bonus exclusion, threshold and relative contrast, perfect/zero exceptions, fallback outcomes, coverage, state exclusions, filtering, escaping, and read-only calculations.');
