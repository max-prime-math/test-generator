import assert from 'node:assert/strict';
import {
  createGradebookBackup,
  gradebookScoresCsv,
  parseGradebookBackup,
} from '../src/lib/gradebook-backup.ts';
import {
  assessmentScorePercent,
  createAssessmentSnapshot,
  normalizeGradebookData,
  scoreCountsInTotal,
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

function main(): void {
  testAssessmentSnapshotFreezesSavedTestAndQuestionData();
  testScorePercentAndStates();
  testBonusQuestionsDoNotIncreaseDenominator();
  testNormalizeGradebookData();
  testGradebookBackupRoundTripAndCsv();
  testPowerSchoolRosterCsvImport();
  testPowerSchoolRosterTsvImportWithFirstLastColumns();
  console.log('gradebook tests passed');
}

main();
