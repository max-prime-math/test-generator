import type {
  GradebookAssessment,
  GradebookAssessmentQuestionSnapshot,
  GradebookData,
  GradebookScore,
  GradebookScoreState,
  GradebookStudent,
  Question,
  SavedTest,
  TestType,
} from './types';
import {
  createBubbleSheetMetadata,
  normalizeBubbleSheetMetadata,
  withBubbleSheetStudentCodes,
} from './bubble-sheet.ts';
import { createId } from './id.ts';

export const GRADEBOOK_STORAGE_KEY = 'tg-gradebook-v1';

export const DEFAULT_GRADEBOOK_DATA: GradebookData = {
  version: 1,
  sections: [],
  students: [],
  enrollments: [],
  assessments: [],
  scores: [],
  settings: {
    defaultScoreState: 'normal',
  },
};

const SCORE_STATES = new Set<GradebookScoreState>(['normal', 'missing', 'excused', 'absent', 'incomplete']);
export const GRADEBOOK_CATEGORIES: TestType[] = ['quiz', 'test', 'assignment', 'exam', 'formative', 'other'];
export const DEFAULT_CATEGORY_WEIGHTS: Record<TestType, number> = {
  quiz: 20,
  test: 40,
  assignment: 15,
  exam: 20,
  formative: 5,
  other: 0,
};

export function cloneGradebookData(data: GradebookData): GradebookData {
  return JSON.parse(JSON.stringify(data)) as GradebookData;
}

export function normalizeGradebookData(raw: unknown): GradebookData {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return cloneGradebookData(DEFAULT_GRADEBOOK_DATA);
  }

  const item = raw as Partial<GradebookData>;
  return {
    version: 1,
    sections: Array.isArray(item.sections)
      ? item.sections
          .filter((section) => section && typeof section === 'object' && typeof section.id === 'string')
          .map((section) => ({
            id: section.id,
            name: typeof section.name === 'string' && section.name.trim() ? section.name.trim() : 'Untitled Section',
            linkedClassId: typeof section.linkedClassId === 'string' ? section.linkedClassId : null,
            termLabel: typeof section.termLabel === 'string' && section.termLabel.trim() ? section.termLabel.trim() : null,
            categoryWeights: normalizeCategoryWeights(section.categoryWeights),
            archivedAt: typeof section.archivedAt === 'number' ? section.archivedAt : undefined,
            createdAt: typeof section.createdAt === 'number' ? section.createdAt : Date.now(),
            updatedAt: typeof section.updatedAt === 'number' ? section.updatedAt : Date.now(),
          }))
      : [],
    students: Array.isArray(item.students)
      ? item.students
          .filter((student) => student && typeof student === 'object' && typeof student.id === 'string')
          .map((student) => {
            const firstName = typeof student.firstName === 'string' ? student.firstName.trim() : '';
            const lastName = typeof student.lastName === 'string' ? student.lastName.trim() : '';
            const displayName = typeof student.displayName === 'string' && student.displayName.trim()
              ? student.displayName.trim()
              : formatStudentName(firstName, lastName);
            return {
              id: student.id,
              sisId: typeof student.sisId === 'string' && student.sisId.trim() ? student.sisId.trim() : undefined,
              firstName,
              lastName,
              displayName,
              email: typeof student.email === 'string' && student.email.trim() ? student.email.trim() : undefined,
              active: student.active !== false,
              createdAt: typeof student.createdAt === 'number' ? student.createdAt : Date.now(),
              updatedAt: typeof student.updatedAt === 'number' ? student.updatedAt : Date.now(),
            };
          })
      : [],
    enrollments: Array.isArray(item.enrollments)
      ? item.enrollments
          .filter((enrollment) =>
            enrollment
            && typeof enrollment === 'object'
            && typeof enrollment.id === 'string'
            && typeof enrollment.sectionId === 'string'
            && typeof enrollment.studentId === 'string'
          )
          .map((enrollment) => ({
            id: enrollment.id,
            sectionId: enrollment.sectionId,
            studentId: enrollment.studentId,
            active: enrollment.active !== false,
            startedAt: typeof enrollment.startedAt === 'number' ? enrollment.startedAt : Date.now(),
            endedAt: typeof enrollment.endedAt === 'number' ? enrollment.endedAt : undefined,
            createdAt: typeof enrollment.createdAt === 'number' ? enrollment.createdAt : Date.now(),
            updatedAt: typeof enrollment.updatedAt === 'number' ? enrollment.updatedAt : Date.now(),
          }))
      : [],
    assessments: Array.isArray(item.assessments)
      ? item.assessments
          .filter((assessment) =>
            assessment
            && typeof assessment === 'object'
            && typeof assessment.id === 'string'
            && typeof assessment.sectionId === 'string'
            && typeof assessment.savedTestId === 'string'
          )
          .map((assessment) => ({
            id: assessment.id,
            sectionId: assessment.sectionId,
            savedTestId: assessment.savedTestId,
            savedTestName: typeof assessment.savedTestName === 'string' ? assessment.savedTestName : 'Saved Test',
            title: typeof assessment.title === 'string' ? assessment.title : '',
            subtitle: typeof assessment.subtitle === 'string' ? assessment.subtitle : '',
            testType: assessment.testType ?? null,
            selectedQuestionIds: Array.isArray(assessment.selectedQuestionIds)
              ? assessment.selectedQuestionIds.filter((id): id is string => typeof id === 'string')
              : [],
            questionSnapshots: normalizeQuestionSnapshots(assessment.questionSnapshots),
            totalPoints: typeof assessment.totalPoints === 'number' ? assessment.totalPoints : 0,
            bonusPoints: typeof assessment.bonusPoints === 'number' ? assessment.bonusPoints : sumPoints(normalizeQuestionSnapshots(assessment.questionSnapshots).filter((snapshot) => snapshot.isBonus)),
            administeredAt: typeof assessment.administeredAt === 'number' ? assessment.administeredAt : Date.now(),
            categoryId: typeof assessment.categoryId === 'string' ? assessment.categoryId : undefined,
            notes: typeof assessment.notes === 'string' ? assessment.notes : undefined,
            bubbleSheet: normalizeBubbleSheetMetadata(assessment.bubbleSheet),
            createdAt: typeof assessment.createdAt === 'number' ? assessment.createdAt : Date.now(),
            updatedAt: typeof assessment.updatedAt === 'number' ? assessment.updatedAt : Date.now(),
          }))
      : [],
    scores: Array.isArray(item.scores)
      ? item.scores
          .filter((score) =>
            score
            && typeof score === 'object'
            && typeof score.id === 'string'
            && typeof score.sectionId === 'string'
            && typeof score.assessmentId === 'string'
            && typeof score.studentId === 'string'
          )
          .map((score) => ({
            id: score.id,
            sectionId: score.sectionId,
            assessmentId: score.assessmentId,
            studentId: score.studentId,
            state: SCORE_STATES.has(score.state as GradebookScoreState) ? score.state as GradebookScoreState : 'normal',
            points: typeof score.points === 'number' && Number.isFinite(score.points) ? score.points : null,
            questionScores: Array.isArray(score.questionScores)
              ? score.questionScores
                  .filter((entry) => entry && typeof entry.questionId === 'string')
                  .map((entry) => ({
                    questionId: entry.questionId,
                    points: typeof entry.points === 'number' && Number.isFinite(entry.points) ? entry.points : null,
                  }))
              : undefined,
            comment: typeof score.comment === 'string' ? score.comment : undefined,
            gradedAt: typeof score.gradedAt === 'number' ? score.gradedAt : undefined,
            createdAt: typeof score.createdAt === 'number' ? score.createdAt : Date.now(),
            updatedAt: typeof score.updatedAt === 'number' ? score.updatedAt : Date.now(),
          }))
      : [],
    settings: {
      defaultScoreState: SCORE_STATES.has(item.settings?.defaultScoreState as GradebookScoreState)
        ? item.settings?.defaultScoreState as GradebookScoreState
        : 'normal',
    },
  };
}

export function createAssessmentSnapshot(
  savedTest: SavedTest,
  questions: Question[],
  sectionId: string,
  options: { administeredAt?: number; now?: number; students?: GradebookStudent[] } = {},
): GradebookAssessment {
  const now = options.now ?? Date.now();
  const questionMap = new Map(questions.map((question) => [question.id, question]));
  const snapshots: GradebookAssessmentQuestionSnapshot[] = savedTest.config.selectedIds
    .map((id, index) => {
      const question = questionMap.get(id);
      return {
        questionId: id,
        label: String(index + 1),
        order: index,
        points: question?.points ?? 0,
        isBonus: savedTest.config.bonusQuestionIds?.includes(id) ?? false,
        classId: question?.classId,
        unitId: question?.unitId,
        sectionId: question?.sectionId,
        bodyPreview: question ? summarizeQuestion(question) : undefined,
      };
    });
  const savedBubbleSheet = normalizeBubbleSheetMetadata(savedTest.bubbleSheet);
  const generatedBubbleSheet = savedBubbleSheet ?? createBubbleSheetMetadata({
    config: savedTest.config,
    questions: savedTest.config.selectedIds
      .map((id) => questionMap.get(id))
      .filter((question): question is Question => Boolean(question)),
    formId: savedTest.id,
    now,
  });
  const bubbleSheet = generatedBubbleSheet
    ? withBubbleSheetStudentCodes(generatedBubbleSheet, options.students ?? [])
    : undefined;

  return {
    id: createId('gradebook-assessment'),
    sectionId,
    savedTestId: savedTest.id,
    savedTestName: savedTest.name,
    title: savedTest.config.title,
    subtitle: savedTest.config.subtitle,
    testType: savedTest.testType,
    selectedQuestionIds: [...savedTest.config.selectedIds],
    questionSnapshots: snapshots,
    totalPoints: sumPoints(snapshots.filter((snapshot) => !snapshot.isBonus)),
    bonusPoints: sumPoints(snapshots.filter((snapshot) => snapshot.isBonus)),
    administeredAt: options.administeredAt ?? now,
    bubbleSheet,
    createdAt: now,
    updatedAt: now,
  };
}

export function assessmentScorePercent(score: GradebookScore | undefined, assessment: GradebookAssessment): number | null {
  if (!score || score.state !== 'normal' || score.points === null || assessment.totalPoints <= 0) return null;
  return (score.points / assessment.totalPoints) * 100;
}

export function scoreCountsInTotal(score: GradebookScore | undefined): boolean {
  return Boolean(score && score.state === 'normal' && score.points !== null);
}

export function formatStudentName(firstName: string, lastName: string): string {
  const name = `${firstName.trim()} ${lastName.trim()}`.trim();
  return name || 'Unnamed Student';
}

function normalizeQuestionSnapshots(value: unknown): GradebookAssessmentQuestionSnapshot[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((snapshot) => snapshot && typeof snapshot === 'object' && typeof snapshot.questionId === 'string')
    .map((snapshot, index) => ({
      questionId: snapshot.questionId,
      label: typeof snapshot.label === 'string' && snapshot.label.trim() ? snapshot.label.trim() : String(index + 1),
      order: typeof snapshot.order === 'number' ? snapshot.order : index,
      points: typeof snapshot.points === 'number' && Number.isFinite(snapshot.points) ? snapshot.points : 0,
      isBonus: snapshot.isBonus === true,
      classId: typeof snapshot.classId === 'string' ? snapshot.classId : undefined,
      unitId: typeof snapshot.unitId === 'string' ? snapshot.unitId : undefined,
      sectionId: typeof snapshot.sectionId === 'string' ? snapshot.sectionId : undefined,
      bodyPreview: typeof snapshot.bodyPreview === 'string' ? snapshot.bodyPreview : undefined,
    }));
}

function summarizeQuestion(question: Question): string {
  const raw = question.parts?.stem || question.body || question.narrative || '';
  return raw.replace(/\s+/g, ' ').trim().slice(0, 160);
}

function sumPoints(snapshots: GradebookAssessmentQuestionSnapshot[]): number {
  return snapshots.reduce((sum, snapshot) => sum + snapshot.points, 0);
}

export function normalizeCategoryWeights(value: unknown): Partial<Record<TestType, number>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...DEFAULT_CATEGORY_WEIGHTS };
  const weights: Partial<Record<TestType, number>> = {};
  for (const category of GRADEBOOK_CATEGORIES) {
    const raw = (value as Partial<Record<TestType, unknown>>)[category];
    const numeric = Number(raw);
    weights[category] = Number.isFinite(numeric) && numeric >= 0 ? numeric : DEFAULT_CATEGORY_WEIGHTS[category];
  }
  return weights;
}

export function assessmentTypeKey(testType: TestType | null | undefined): TestType {
  return testType && GRADEBOOK_CATEGORIES.includes(testType) ? testType : 'other';
}
