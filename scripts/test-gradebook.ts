import assert from 'node:assert/strict';
import {
  createGradebookBackup,
  gradebookScoresCsv,
  parseGradebookBackup,
} from '../src/lib/gradebook-backup.ts';
import {
  assessmentScorePercent,
  compareStudents,
  createAssessmentSnapshot,
  createExternalAssessment,
  editGradebookAssessment,
  normalizeGradebookData,
  questionScoresLostByEdit,
  parseQuestionPoints,
  properCaseName,
  savedTestFitsSection,
  scoreCountsInTotal,
  studentListName,
} from '../src/lib/gradebook-model.ts';
import { parseRosterImport } from '../src/lib/gradebook-roster-import.ts';
import { defaultTestConfig, type GradebookScore, type Question, type SavedTest } from '../src/lib/types.ts';

function makeQuestion(): Question {
  return {
    id: 'q-1',
    body: 'Differentiate $x^2$.',
    points: 5,
    tags: ['derivatives'],
    classId: 'ap-calc',
    unitId: 'unit-1',
    sectionId: 'section-1',
    createdAt: 1,
  };
}

function makeSavedTest(): SavedTest {
  return {
    id: 'test-1',
    name: 'Derivative Quiz',
    classId: 'ap-calc',
    unitId: 'unit-1',
    testType: 'quiz',
    config: {
      ...defaultTestConfig('AP Calc'),
      subtitle: 'Derivative Quiz',
      selectedIds: ['q-1'],
      bonusQuestionIds: [],
    },
    createdAt: 2,
    updatedAt: 3,
  };
}

function testAssessmentSnapshotFreezesSavedTestAndQuestionData(): void {
  const question = makeQuestion();
  const savedTest = makeSavedTest();
  const assessment = createAssessmentSnapshot(savedTest, [question], 'section-a', {
    now: 10,
    administeredAt: 20,
  });

  savedTest.name = 'Edited Quiz';
  savedTest.config.selectedIds.push('q-2');
  question.points = 99;

  assert.equal(assessment.savedTestName, 'Derivative Quiz');
  assert.equal(assessment.testType, 'quiz');
  assert.deepEqual(assessment.selectedQuestionIds, ['q-1']);
  assert.equal(assessment.questionSnapshots[0].points, 5);
  assert.equal(assessment.totalPoints, 5);
  assert.equal(assessment.administeredAt, 20);
}

function testScorePercentAndStates(): void {
  const question = makeQuestion();
  const savedTest = makeSavedTest();
  const assessment = createAssessmentSnapshot(savedTest, [question], 'section-a', { now: 10 });
  const normalScore: GradebookScore = {
    id: 'score-1',
    sectionId: 'section-a',
    assessmentId: assessment.id,
    studentId: 'student-1',
    state: 'normal',
    points: 4,
    createdAt: 11,
    updatedAt: 11,
  };
  const excusedScore: GradebookScore = {
    ...normalScore,
    id: 'score-2',
    state: 'excused',
    points: null,
  };

  assert.equal(assessmentScorePercent(normalScore, assessment), 80);
  assert.equal(assessmentScorePercent(excusedScore, assessment), null);
  assert.equal(scoreCountsInTotal(normalScore), true);
  assert.equal(scoreCountsInTotal(excusedScore), false);
}

function testBonusQuestionsDoNotIncreaseDenominator(): void {
  const question = makeQuestion();
  const bonusQuestion: Question = {
    ...question,
    id: 'q-bonus',
    body: 'Bonus.',
    points: 2,
  };
  const savedTest = makeSavedTest();
  savedTest.config.selectedIds = ['q-1', 'q-bonus'];
  savedTest.config.bonusQuestionIds = ['q-bonus'];

  const assessment = createAssessmentSnapshot(savedTest, [question, bonusQuestion], 'section-a', { now: 10 });

  assert.equal(assessment.totalPoints, 5);
  assert.equal(assessment.bonusPoints, 2);
  assert.equal(assessment.questionSnapshots[1].isBonus, true);
}

function testNormalizeGradebookData(): void {
  const normalized = normalizeGradebookData({
    sections: [{ id: 'section-a', name: ' Period 2 ', linkedClassId: 'ap-calc', termLabel: '', archivedAt: 123 }],
    students: [{ id: 'student-1', sisId: '12345', firstName: 'Ada', lastName: 'Lovelace', active: true }],
    enrollments: [{ id: 'enroll-1', sectionId: 'section-a', studentId: 'student-1' }],
    assessments: [],
    scores: [{ id: 'score-1', sectionId: 'section-a', assessmentId: 'a-1', studentId: 'student-1', state: 'bogus', points: 7 }],
  });

  assert.equal(normalized.version, 1);
  assert.equal(normalized.sections[0].name, 'Period 2');
  assert.equal(normalized.sections[0].termLabel, null);
  assert.equal(normalized.sections[0].archivedAt, 123);
  assert.equal(normalizeGradebookData({ version: 1, sections: [{ id: 't', name: 'T', trashedAt: 456 }] }).sections[0].trashedAt, 456, 'the Trash state is kept');
  assert.equal(normalized.students[0].sisId, '12345');
  assert.equal(normalized.students[0].displayName, 'Ada Lovelace');
  assert.equal(normalized.enrollments[0].active, true);
  assert.equal(normalized.scores[0].state, 'normal');
}

function testGradebookBackupRoundTripAndCsv(): void {
  const data = normalizeGradebookData({
    sections: [{
      id: 'section-a',
      name: 'Period 2',
      linkedClassId: 'ap-calc',
      termLabel: 'S1',
      categoryWeights: { quiz: 20, test: 80 },
      createdAt: 1,
      updatedAt: 1,
    }],
    students: [{
      id: 'student-1',
      sisId: '12345',
      firstName: 'Ada',
      lastName: 'Lovelace',
      displayName: 'Ada Lovelace',
      email: 'ada@example.edu',
      active: true,
      createdAt: 2,
      updatedAt: 2,
    }],
    enrollments: [{
      id: 'enroll-1',
      sectionId: 'section-a',
      studentId: 'student-1',
      active: true,
      startedAt: 3,
      createdAt: 3,
      updatedAt: 3,
    }],
    assessments: [{
      id: 'assessment-1',
      sectionId: 'section-a',
      savedTestId: 'test-1',
      savedTestName: 'Derivative Quiz',
      title: 'AP Calc',
      subtitle: 'Derivative Quiz',
      testType: 'quiz',
      selectedQuestionIds: ['q-1'],
      questionSnapshots: [{ questionId: 'q-1', label: '1', order: 0, points: 5, isBonus: false }],
      totalPoints: 5,
      bonusPoints: 0,
      administeredAt: 4,
      createdAt: 4,
      updatedAt: 4,
    }],
    scores: [{
      id: 'score-1',
      sectionId: 'section-a',
      assessmentId: 'assessment-1',
      studentId: 'student-1',
      state: 'normal',
      points: 4.5,
      questionScores: [{ questionId: 'q-1', points: 4.5 }],
      createdAt: 5,
      updatedAt: 5,
    }],
    settings: { defaultScoreState: 'normal' },
  });

  const backup = createGradebookBackup(data, 100);
  const restored = parseGradebookBackup(JSON.stringify(backup));
  assert.equal(restored.sections[0].name, 'Period 2');
  assert.equal(restored.students[0].sisId, '12345');
  assert.equal(restored.assessments[0].questionSnapshots[0].points, 5);
  assert.equal(restored.scores[0].points, 4.5);

  const csv = gradebookScoresCsv(data);
  assert.match(csv, /sectionId,sectionName/);
  assert.match(csv, /Period 2/);
  assert.match(csv, /Ada Lovelace/);
  assert.match(csv, /Derivative Quiz/);
  assert.match(csv, /90/);
}

function testPowerSchoolRosterCsvImport(): void {
  const csv = [
    'Student_Number,LastFirst,Student Email,Expression,Term',
    '12345,"Lovelace, Ada",ada@example.edu,2(A),S1',
    '98765,"Hopper, Grace",grace@example.edu,2(A),S1',
  ].join('\n');

  const parsed = parseRosterImport(csv);

  assert.equal(parsed.students.length, 2);
  assert.equal(parsed.students[0].sisId, '12345');
  assert.equal(parsed.students[0].firstName, 'Ada');
  assert.equal(parsed.students[0].lastName, 'Lovelace');
  assert.equal(parsed.students[0].displayName, 'Ada Lovelace');
  assert.equal(parsed.students[0].email, 'ada@example.edu');
  assert.equal(parsed.students[0].sourceSection, '2(A)');
  assert.equal(parsed.students[0].sourceTerm, 'S1');
}

function testPowerSchoolRosterTsvImportWithFirstLastColumns(): void {
  const tsv = [
    'Student Number\tFirst Name\tLast Name\tEmail Address\tEnrollment Status',
    '100\tKatherine\tJohnson\tKatherine.Johnson@Example.edu\tActive',
    '101\tDorothy\tVaughan\tdorothy@example.edu\tDropped',
  ].join('\n');

  const parsed = parseRosterImport(tsv);

  assert.equal(parsed.students.length, 1);
  assert.equal(parsed.skippedRows, 1);
  assert.equal(parsed.students[0].sisId, '100');
  assert.equal(parsed.students[0].displayName, 'Katherine Johnson');
  assert.equal(parsed.students[0].email, 'katherine.johnson@example.edu');
}

function testRosterImportProperCasesNamesAndReadsKnownBy(): void {
  const csv = [
    'Student Number,First Name,Last Name,Known By',
    "1,JANE,O'BRIEN-SMITH,",
    '2,katherine,johnson,KATE',
    '3,Ryan,McKenna,',
  ].join('\n');

  const parsed = parseRosterImport(csv);

  assert.equal(parsed.students[0].firstName, 'Jane');
  assert.equal(parsed.students[0].lastName, "O'Brien-Smith");
  assert.equal(parsed.students[0].knownBy, undefined);
  assert.equal(parsed.students[1].firstName, 'Katherine');
  assert.equal(parsed.students[1].knownBy, 'Kate');
  assert.equal(parsed.students[1].displayName, 'Kate Johnson');
  // Mixed-case names are already intentional and are kept.
  assert.equal(parsed.students[2].lastName, 'McKenna');
}

function testProperCaseName(): void {
  assert.equal(properCaseName('MCDONALD'), 'Mcdonald');
  assert.equal(properCaseName('mary  ann'), 'Mary Ann');
  assert.equal(properCaseName('DeSouza'), 'DeSouza');
  assert.equal(properCaseName('ÉLODIE'), 'Élodie');
}

function testStudentNamesUseKnownByAndOrder(): void {
  const kate = { firstName: 'Katherine', lastName: 'Johnson', knownBy: 'Kate' };
  const ada = { firstName: 'Ada', lastName: 'Lovelace' };
  assert.equal(studentListName(kate, 'first-last'), 'Kate Johnson');
  assert.equal(studentListName(kate, 'last-first'), 'Johnson, Kate');
  assert.equal(studentListName({ firstName: 'Cher', lastName: '' }, 'last-first'), 'Cher');
  assert.ok(compareStudents(ada, kate, 'first') < 0);
  assert.ok(compareStudents(kate, ada, 'last') < 0);
}

function testLegacyDisplayNameBecomesKnownBy(): void {
  const data = normalizeGradebookData({
    students: [
      { id: 's1', firstName: 'Katherine', lastName: 'Johnson', displayName: 'Kate Johnson' },
      { id: 's2', firstName: 'Ada', lastName: 'Lovelace', displayName: 'Ada Lovelace' },
    ],
  });
  assert.equal(data.students[0].knownBy, 'Kate');
  assert.equal(data.students[1].knownBy, undefined);
  assert.equal(data.students[1].displayName, 'Ada Lovelace');
}

function testSavedTestsOnlyFitTheirCourseSection(): void {
  assert.equal(savedTestFitsSection({ classId: 'precalc-40s' }, { linkedClassId: 'precalc-40s' }), true);
  assert.equal(savedTestFitsSection({ classId: 'precalc-30s' }, { linkedClassId: 'precalc-40s' }), false);
  assert.equal(savedTestFitsSection({ classId: null }, { linkedClassId: 'precalc-40s' }), false);
  assert.equal(savedTestFitsSection({ classId: 'precalc-30s' }, { linkedClassId: null }), true);
}

function testGradingModeDefaultsToQuestions(): void {
  const byQuestion = createAssessmentSnapshot(makeSavedTest(), [makeQuestion()], 'section-1');
  const totalOnly = createAssessmentSnapshot(makeSavedTest(), [makeQuestion()], 'section-1', { gradingMode: 'total' });
  assert.equal(byQuestion.gradingMode, 'questions');
  assert.equal(totalOnly.gradingMode, 'total');
  const data = normalizeGradebookData({
    assessments: [
      { id: 'a1', sectionId: 's', savedTestId: 't' },
      { id: 'a2', sectionId: 's', savedTestId: 't', gradingMode: 'total' },
      { id: 'a3', sectionId: 's', savedTestId: 't', gradingMode: 'bogus' },
    ],
  });
  assert.deepEqual(data.assessments.map((assessment) => assessment.gradingMode), ['questions', 'total', 'questions']);
}

function testExternalAssessments(): void {
  const totalOnly = createExternalAssessment({ sectionId: 's', name: ' Lab 1 ', testType: 'assignment', totalPoints: 25, gradingMode: 'questions' }, 10);
  assert.equal(totalOnly.savedTestName, 'Lab 1');
  assert.equal(totalOnly.source, 'external');
  assert.equal(totalOnly.savedTestId, '');
  assert.equal(totalOnly.totalPoints, 25);
  assert.equal(totalOnly.gradingMode, 'total');
  assert.equal(totalOnly.questionSnapshots.length, 0);

  const byQuestion = createExternalAssessment({ sectionId: 's', name: 'Paper test', testType: 'test', totalPoints: 99, questionPoints: [2, 2, 3.5] }, 10);
  assert.equal(byQuestion.totalPoints, 7.5);
  assert.equal(byQuestion.gradingMode, 'questions');
  assert.deepEqual(byQuestion.questionSnapshots.map((snapshot) => snapshot.label), ['1', '2', '3']);

  const restored = normalizeGradebookData({ assessments: [totalOnly] });
  assert.equal(restored.assessments[0].source, 'external');
  assert.equal(restored.assessments[0].savedTestName, 'Lab 1');

  assert.deepEqual(parseQuestionPoints('2, 2 3.5;5'), [2, 2, 3.5, 5]);
  assert.equal(parseQuestionPoints('2, x'), undefined);
  assert.equal(parseQuestionPoints('2, 0'), undefined);
}

function testEditingAssessments(): void {
  const lab = createExternalAssessment({ sectionId: 's', name: 'Lab', testType: 'assignment', totalPoints: 25 }, 1);
  const quiz = createExternalAssessment({ sectionId: 's', name: 'Quiz', testType: 'quiz', totalPoints: 0, questionPoints: [2, 3, 5] }, 1);
  const score = (id: string, studentId: string, questionScores: Array<[string, number | null]>, points: number | null): GradebookScore => ({
    id, sectionId: 's', assessmentId: quiz.id, studentId, state: 'normal', points,
    questionScores: questionScores.map(([questionId, value]) => ({ questionId, points: value })), createdAt: 1, updatedAt: 1,
  });
  const data = normalizeGradebookData({
    assessments: [lab, quiz],
    scores: [
      score('a', 'st1', [['external-q1', 2], ['external-q3', 4]], 6),
      score('b', 'st2', [['external-q1', 1], ['external-q2', 3]], 4),
    ],
  });

  // A mistyped external total can be fixed; names, categories, and dates can change.
  const fixed = editGradebookAssessment(data, lab.id, { totalPoints: 30, name: ' Lab A ', testType: 'test', administeredAt: 5 }, 9);
  const fixedLab = fixed.assessments.find((assessment) => assessment.id === lab.id)!;
  assert.equal(fixedLab.totalPoints, 30);
  assert.equal(fixedLab.savedTestName, 'Lab A');
  assert.equal(fixedLab.testType, 'test');
  assert.equal(fixedLab.administeredAt, 5);

  // Dropping question 3 removes its scores and re-tallies totals.
  assert.equal(questionScoresLostByEdit(data, quiz.id, [2, 3]), 1);
  const trimmed = editGradebookAssessment(data, quiz.id, { questionPoints: [2, 3] }, 9);
  const trimmedQuiz = trimmed.assessments.find((assessment) => assessment.id === quiz.id)!;
  assert.equal(trimmedQuiz.totalPoints, 5);
  assert.deepEqual(trimmedQuiz.selectedQuestionIds, ['external-q1', 'external-q2']);
  assert.equal(trimmed.scores[0].points, 2);
  assert.deepEqual(trimmed.scores[0].questionScores, [{ questionId: 'external-q1', points: 2 }]);
  assert.equal(trimmed.scores[1], data.scores[1]);

  // Clearing the marks turns it into a total-only assessment.
  const totalOnly = editGradebookAssessment(data, quiz.id, { questionPoints: [], totalPoints: 12 }, 9);
  const totalQuiz = totalOnly.assessments.find((assessment) => assessment.id === quiz.id)!;
  assert.equal(totalQuiz.totalPoints, 12);
  assert.equal(totalQuiz.gradingMode, 'total');
  assert.deepEqual(totalOnly.scores.map((entry) => [entry.points, entry.questionScores]), [[6, undefined], [4, undefined]]);
}

function main(): void {
  testAssessmentSnapshotFreezesSavedTestAndQuestionData();
  testScorePercentAndStates();
  testBonusQuestionsDoNotIncreaseDenominator();
  testNormalizeGradebookData();
  testGradebookBackupRoundTripAndCsv();
  testPowerSchoolRosterCsvImport();
  testPowerSchoolRosterTsvImportWithFirstLastColumns();
  testRosterImportProperCasesNamesAndReadsKnownBy();
  testProperCaseName();
  testStudentNamesUseKnownByAndOrder();
  testLegacyDisplayNameBecomesKnownBy();
  testSavedTestsOnlyFitTheirCourseSection();
  testGradingModeDefaultsToQuestions();
  testExternalAssessments();
  testEditingAssessments();
  console.log('gradebook tests passed');
}

main();
