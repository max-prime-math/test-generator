import type {
  GradebookAssessment,
  GradebookAssessmentQuestionSnapshot,
  GradebookData,
  GradebookGradingMode,
  GradebookScore,
  GradebookScoreState,
  GradebookSection,
  GradebookStudent,
  Question,
  SavedTest,
  TestType,
} from './types';
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
export const GRADEBOOK_CATEGORIES: TestType[] = ['quiz', 'test', 'assignment', 'exam', 'formative', 'worksheet', 'other'];
export const DEFAULT_CATEGORY_WEIGHTS: Record<TestType, number> = {
  quiz: 20,
  test: 40,
  assignment: 15,
  exam: 20,
  formative: 5,
  worksheet: 0,
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
            trashedAt: typeof section.trashedAt === 'number' ? section.trashedAt : undefined,
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
            const storedDisplayName = typeof student.displayName === 'string' ? student.displayName.trim() : '';
            const knownBy = typeof student.knownBy === 'string'
              ? cleanKnownBy(student.knownBy, firstName)
              : knownByFromLegacyDisplayName(storedDisplayName, firstName, lastName);
            return {
              id: student.id,
              sisId: typeof student.sisId === 'string' && student.sisId.trim() ? student.sisId.trim() : undefined,
              firstName,
              lastName,
              knownBy,
              displayName: formatStudentName(knownBy ?? firstName, lastName),
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
            source: assessment.source === 'external' ? 'external' as const : 'saved-test' as const,
            title: typeof assessment.title === 'string' ? assessment.title : '',
            subtitle: typeof assessment.subtitle === 'string' ? assessment.subtitle : '',
            testType: assessment.testType ?? null,
            selectedQuestionIds: Array.isArray(assessment.selectedQuestionIds)
              ? assessment.selectedQuestionIds.filter((id): id is string => typeof id === 'string')
              : [],
            questionSnapshots: normalizeQuestionSnapshots(assessment.questionSnapshots),
            gradingMode: normalizeGradingMode(assessment.gradingMode),
            totalPoints: typeof assessment.totalPoints === 'number' ? assessment.totalPoints : 0,
            bonusPoints: typeof assessment.bonusPoints === 'number' ? assessment.bonusPoints : sumPoints(normalizeQuestionSnapshots(assessment.questionSnapshots).filter((snapshot) => snapshot.isBonus)),
            administeredAt: typeof assessment.administeredAt === 'number' ? assessment.administeredAt : Date.now(),
            categoryId: typeof assessment.categoryId === 'string' ? assessment.categoryId : undefined,
            notes: typeof assessment.notes === 'string' ? assessment.notes : undefined,
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
  options: { administeredAt?: number; now?: number; gradingMode?: GradebookGradingMode } = {},
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

  return {
    id: createId('gradebook-assessment'),
    sectionId,
    savedTestId: savedTest.id,
    savedTestName: savedTest.name,
    source: 'saved-test',
    title: savedTest.config.title,
    subtitle: savedTest.config.subtitle,
    testType: savedTest.testType,
    selectedQuestionIds: [...savedTest.config.selectedIds],
    questionSnapshots: snapshots,
    gradingMode: normalizeGradingMode(options.gradingMode),
    totalPoints: sumPoints(snapshots.filter((snapshot) => !snapshot.isBonus)),
    bonusPoints: sumPoints(snapshots.filter((snapshot) => snapshot.isBonus)),
    administeredAt: options.administeredAt ?? now,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * An assessment made outside TestGen. Optional per-question marks allow
 * grading by question; without them it can only be graded as a total.
 */
export function createExternalAssessment(
  input: {
    sectionId: string;
    name: string;
    testType: TestType | null;
    totalPoints: number;
    questionPoints?: number[];
    administeredAt?: number;
    gradingMode?: GradebookGradingMode;
  },
  now = Date.now(),
): GradebookAssessment {
  const snapshots: GradebookAssessmentQuestionSnapshot[] = (input.questionPoints ?? []).map((points, index) => ({
    questionId: `external-q${index + 1}`,
    label: String(index + 1),
    order: index,
    points,
    isBonus: false,
  }));
  const name = input.name.trim() || 'External assessment';
  return {
    id: createId('gradebook-assessment'),
    sectionId: input.sectionId,
    savedTestId: '',
    savedTestName: name,
    source: 'external',
    title: name,
    subtitle: '',
    testType: input.testType,
    selectedQuestionIds: snapshots.map((snapshot) => snapshot.questionId),
    questionSnapshots: snapshots,
    gradingMode: snapshots.length > 0 ? normalizeGradingMode(input.gradingMode) : 'total',
    totalPoints: snapshots.length > 0 ? sumPoints(snapshots) : input.totalPoints,
    bonusPoints: 0,
    administeredAt: input.administeredAt ?? now,
    createdAt: now,
    updatedAt: now,
  };
}

export interface GradebookAssessmentEdit {
  name?: string;
  testType?: TestType | null;
  administeredAt?: number;
  /** External assessments only: the total when there are no question marks. */
  totalPoints?: number;
  /** External assessments only: one entry per question; [] grades it as a total. */
  questionPoints?: number[];
}

/**
 * Applies an edit to one assessment. Changing an external assessment's
 * question marks drops scores for removed questions and re-tallies each
 * student's total from the question scores that remain; clearing the marks
 * keeps totals and drops only the question detail.
 */
export function editGradebookAssessment(data: GradebookData, assessmentId: string, edit: GradebookAssessmentEdit, now = Date.now()): GradebookData {
  const current = data.assessments.find((assessment) => assessment.id === assessmentId);
  if (!current) return data;
  const next: GradebookAssessment = { ...current, updatedAt: now };
  if (edit.name !== undefined && edit.name.trim()) {
    next.savedTestName = edit.name.trim();
    if (current.source === 'external') next.title = next.savedTestName;
  }
  if (edit.testType !== undefined) next.testType = edit.testType;
  if (edit.administeredAt !== undefined) next.administeredAt = edit.administeredAt;

  let keptQuestionIds: Set<string> | null = null;
  if (current.source === 'external' && edit.questionPoints !== undefined) {
    next.questionSnapshots = edit.questionPoints.map((points, index) => ({
      questionId: `external-q${index + 1}`,
      label: String(index + 1),
      order: index,
      points,
      isBonus: false,
    }));
    next.selectedQuestionIds = next.questionSnapshots.map((snapshot) => snapshot.questionId);
    keptQuestionIds = new Set(next.selectedQuestionIds);
    if (next.questionSnapshots.length > 0) {
      next.totalPoints = sumPoints(next.questionSnapshots);
    } else {
      next.gradingMode = 'total';
      if (edit.totalPoints !== undefined) next.totalPoints = edit.totalPoints;
    }
  } else if (current.source === 'external' && edit.totalPoints !== undefined && current.questionSnapshots.length === 0) {
    next.totalPoints = edit.totalPoints;
  }

  const scores = keptQuestionIds === null
    ? data.scores
    : data.scores.map((score) => {
        if (score.assessmentId !== assessmentId || !score.questionScores?.length) return score;
        const questionScores = score.questionScores.filter((entry) => keptQuestionIds!.has(entry.questionId));
        if (questionScores.length === score.questionScores.length) return score;
        // Becoming total-only keeps each student's total; only the question detail goes.
        if (keptQuestionIds!.size === 0) return { ...score, questionScores: undefined, updatedAt: now };
        const entered = questionScores.filter((entry) => entry.points !== null);
        const points = entered.length > 0 ? entered.reduce((sum, entry) => sum + (entry.points ?? 0), 0) : null;
        return {
          ...score,
          questionScores: questionScores.length > 0 ? questionScores : undefined,
          points: score.state === 'normal' ? points : score.points,
          updatedAt: now,
        };
      });

  return {
    ...data,
    assessments: data.assessments.map((assessment) => (assessment.id === assessmentId ? next : assessment)),
    scores,
  };
}

/** How many students have a score recorded for a question the edit would remove. */
export function questionScoresLostByEdit(data: GradebookData, assessmentId: string, questionPoints: number[]): number {
  const kept = new Set(questionPoints.map((_, index) => `external-q${index + 1}`));
  return data.scores.filter((score) =>
    score.assessmentId === assessmentId
    && score.questionScores?.some((entry) => entry.points !== null && !kept.has(entry.questionId))
  ).length;
}

/** Reads marks like "2, 2, 3.5 5"; returns undefined when any entry is not a positive number. */
export function parseQuestionPoints(value: string): number[] | undefined {
  const parts = value.split(/[\s,;]+/).filter(Boolean);
  const points = parts.map(Number);
  return points.every((point) => Number.isFinite(point) && point > 0) ? points : undefined;
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

export function normalizeGradingMode(value: unknown): GradebookGradingMode {
  return value === 'total' ? 'total' : 'questions';
}

export type StudentNameOrder = 'first-last' | 'last-first';
export type StudentSortKey = 'first' | 'last';

/** The name a student goes by: their "Known by" name, or their first name. */
export function studentKnownBy(student: Pick<GradebookStudent, 'firstName' | 'knownBy'>): string {
  return student.knownBy?.trim() || student.firstName.trim();
}

export function studentListName(student: Pick<GradebookStudent, 'firstName' | 'lastName' | 'knownBy'>, order: StudentNameOrder): string {
  const first = studentKnownBy(student);
  const last = student.lastName.trim();
  if (order === 'last-first' && first && last) return `${last}, ${first}`;
  return formatStudentName(first, last);
}

export function compareStudents(
  left: Pick<GradebookStudent, 'firstName' | 'lastName' | 'knownBy'>,
  right: Pick<GradebookStudent, 'firstName' | 'lastName' | 'knownBy'>,
  sortBy: StudentSortKey,
): number {
  const leftFirst = studentKnownBy(left);
  const rightFirst = studentKnownBy(right);
  const byFirst = leftFirst.localeCompare(rightFirst, undefined, { sensitivity: 'base' });
  const byLast = left.lastName.localeCompare(right.lastName, undefined, { sensitivity: 'base' });
  return sortBy === 'first' ? byFirst || byLast : byLast || byFirst;
}

/** A known-by value equal to the first name adds nothing, so it is not stored. */
export function cleanKnownBy(value: string | undefined, firstName: string): string | undefined {
  const trimmed = value?.trim() ?? '';
  return trimmed && trimmed !== firstName.trim() ? trimmed : undefined;
}

/** Older records kept a free-form display name; "Kate Johnson" for Katherine Johnson means known by Kate. */
function knownByFromLegacyDisplayName(displayName: string, firstName: string, lastName: string): string | undefined {
  const suffix = ` ${lastName}`;
  if (!lastName || !displayName.endsWith(suffix)) return undefined;
  return cleanKnownBy(displayName.slice(0, -suffix.length), firstName);
}

/**
 * Title-cases names that arrive ALL CAPS or all lowercase ("O'BRIEN-SMITH" ->
 * "O'Brien-Smith"). Names that already mix cases are kept, since casing like
 * "McKenna" cannot be guessed.
 */
export function properCaseName(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (trimmed !== trimmed.toUpperCase() && trimmed !== trimmed.toLowerCase()) return trimmed;
  return trimmed.toLowerCase().replace(/(^|[\s'’\-.])(\p{L})/gu, (_, separator: string, letter: string) => separator + letter.toUpperCase());
}

export function hasMixedCase(value: string): boolean {
  return value !== value.toUpperCase() && value !== value.toLowerCase();
}

/** Sections linked to a course only take saved tests from that course. */
export function savedTestFitsSection(savedTest: Pick<SavedTest, 'classId'>, section: Pick<GradebookSection, 'linkedClassId'>): boolean {
  return !section.linkedClassId || savedTest.classId === section.linkedClassId;
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
