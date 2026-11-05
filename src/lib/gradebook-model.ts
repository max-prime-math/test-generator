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
import { normalizeGradebookFilter } from './gradebook-filter-rules.ts';
import { GRADEBOOK_CATEGORIES, normalizeDroppedScorePolicy } from './gradebook-policies.ts';
import { groupTestItems, sortQuestions } from './typst/template.ts';
import { narrativeBreaks } from './test-narratives.ts';
export { GRADEBOOK_CATEGORIES } from './gradebook-policies.ts';

export const GRADEBOOK_STORAGE_KEY = 'tg-gradebook-v1';

/** Merge legacy bank gradebooks by stable ID, keeping the newest copy of a record.
 * Do not merge students by names or SIS IDs: different banks may represent different people.
 * Enrollment and score pairs are unique even when forks generated different IDs.
 * The current gradebook wins timestamp ties and supplies the settings.
 */
export function mergeLegacyGradebooks(current: GradebookData, legacy: GradebookData[]): GradebookData {
  const merge = <T extends { id: string; updatedAt?: number }>(groups: T[][], key: (record: T) => string = record => record.id): T[] => {
    const records = new Map<string, T>();
    for (const group of groups) for (const record of group) {
      const id = key(record);
      const previous = records.get(id);
      if (!previous || (record.updatedAt ?? 0) > (previous.updatedAt ?? 0)) records.set(id, record);
    }
    return [...records.values()];
  };
  return {
    ...current,
    sections: merge([current.sections, ...legacy.map(data => data.sections)]),
    students: merge([current.students, ...legacy.map(data => data.students)]),
    enrollments: merge([current.enrollments, ...legacy.map(data => data.enrollments)], record => JSON.stringify([record.sectionId, record.studentId])),
    assessments: merge([current.assessments, ...legacy.map(data => data.assessments)]),
    scores: merge([current.scores, ...legacy.map(data => data.scores)], record => JSON.stringify([record.assessmentId, record.studentId])),
    studentNotes: merge([current.studentNotes ?? [], ...legacy.map(data => data.studentNotes ?? [])]),
    savedFilters: merge([current.savedFilters ?? [], ...legacy.map(data => data.savedFilters ?? [])]),
  };
}

export const DEFAULT_GRADEBOOK_DATA: GradebookData = {
  version: 1,
  sections: [],
  students: [],
  enrollments: [],
  assessments: [],
  scores: [],
  studentNotes: [],
  savedFilters: [],
  settings: {
    defaultScoreState: 'normal',
  },
};

const SCORE_STATES = new Set<GradebookScoreState>(['normal', 'missing', 'excused', 'absent', 'incomplete', 'alternative']);
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
            missingGradePolicy: section.missingGradePolicy === 'zero' ? 'zero' : 'exclude',
            droppedScorePolicy: normalizeDroppedScorePolicy(section.droppedScorePolicy),
            previousDroppedScorePolicy: section.previousDroppedScorePolicy === undefined ? undefined : normalizeDroppedScorePolicy(section.previousDroppedScorePolicy),
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
            bonusPoints: typeof assessment.bonusPoints === 'number' ? assessment.bonusPoints : sumBonusPoints(normalizeQuestionSnapshots(assessment.questionSnapshots)),
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
            alternativeTotalPoints: typeof score.alternativeTotalPoints === 'number' && Number.isFinite(score.alternativeTotalPoints) && score.alternativeTotalPoints > 0 ? score.alternativeTotalPoints : undefined,
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
    studentNotes: Array.isArray(item.studentNotes) ? item.studentNotes
      .filter(note => note && typeof note.id === 'string' && typeof note.studentId === 'string' && typeof note.sectionId === 'string' && typeof note.text === 'string')
      .map(note => ({ id: note.id, sectionId: note.sectionId, studentId: note.studentId, text: note.text,
        includeInReports: note.includeInReports === true, trashedAt: typeof note.trashedAt === 'number' ? note.trashedAt : undefined,
        previous: note.previous && typeof note.previous.text === 'string' ? { text: note.previous.text, includeInReports: note.previous.includeInReports === true } : undefined,
        createdAt: typeof note.createdAt === 'number' ? note.createdAt : 0, updatedAt: typeof note.updatedAt === 'number' ? note.updatedAt : 0 })) : [],
    savedFilters: Array.isArray(item.savedFilters) ? item.savedFilters
      .filter(filter => filter && typeof filter.id === 'string' && typeof filter.sectionId === 'string' && typeof filter.name === 'string')
      .map(filter => ({ id: filter.id, sectionId: filter.sectionId, name: filter.name, rules: normalizeGradebookFilter(filter.rules),
        previous: filter.previous && typeof filter.previous.name === 'string' ? { name: filter.previous.name, rules: normalizeGradebookFilter(filter.previous.rules) } : undefined,
        trashedAt: typeof filter.trashedAt === 'number' ? filter.trashedAt : undefined,
        createdAt: typeof filter.createdAt === 'number' ? filter.createdAt : 0, updatedAt: typeof filter.updatedAt === 'number' ? filter.updatedAt : 0 })) : [],
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
  const selected = savedTest.config.selectedIds.map(id => questionMap.get(id) ?? ({
    id, body: '', points: 0, tags: [], createdAt: 0,
  } satisfies Question));
  const narratives = savedTest.narrativeSnapshots ?? [];
  const ordered = sortQuestions(selected, savedTest.config, narratives);
  const bonusIds = new Set(savedTest.config.bonusQuestionIds ?? []);
  // Gradebook columns match the numbered items teachers and students see on the printed test.
  // Generated 7a–c therefore freezes as one column labelled 7, out of their combined points.
  const snapshots: GradebookAssessmentQuestionSnapshot[] = groupTestItems(
    ordered,
    narratives,
    savedTest.config.startNumber ?? 1,
    narrativeBreaks(savedTest.config),
  ).map((item, index) => {
    const first = item.questions[0];
    const points = item.questions.reduce((sum, question) => sum + (Number.isFinite(question.points) ? question.points : 0), 0);
    const bonusPoints = item.questions.filter(question => bonusIds.has(question.id))
      .reduce((sum, question) => sum + (Number.isFinite(question.points) ? question.points : 0), 0);
    const indicators = [...new Set(item.questions.flatMap(question => question.indicators ?? []))];
    const bodyPreview = [item.lead, ...item.questions.map(summarizeQuestion)].filter(Boolean).join(' ').slice(0, 160);
    return {
      questionId: first.id,
      ...(item.questions.length > 1 ? { memberQuestionIds: item.questions.map(question => question.id) } : {}),
      label: String(item.number),
      order: index,
      points,
      isBonus: item.questions.every(question => bonusIds.has(question.id)),
      ...(bonusPoints > 0 && bonusPoints < points ? { bonusPoints } : {}),
      classId: first.classId,
      unitId: first.unitId,
      sectionId: first.sectionId,
      indicators: indicators.length ? indicators : undefined,
      bodyPreview: bodyPreview || undefined,
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
    totalPoints: sumRegularPoints(snapshots),
    bonusPoints: sumBonusPoints(snapshots),
    administeredAt: options.administeredAt ?? now,
    createdAt: now,
    updatedAt: now,
  };
}

export function regroupMatchingSavedTestAssessments(
  data: GradebookData,
  savedTest: SavedTest,
  questions: Question[],
  now = Date.now(),
): { data: GradebookData; count: number } {
  const selected = savedTest.config.selectedIds;
  const questionMap = new Map(questions.map(question => [question.id, question]));
  const bonusIds = new Set(savedTest.config.bonusQuestionIds ?? []);
  let count = 0;
  const regrouped = new Map<string, GradebookAssessment>();

  for (const assessment of data.assessments) {
    if (assessment.source === 'external' || assessment.savedTestId !== savedTest.id
      || assessment.questionSnapshots.length <= 1
      || assessment.selectedQuestionIds.length !== selected.length
      || assessment.selectedQuestionIds.some((id, index) => id !== selected[index])) continue;
    const oldById = new Map(assessment.questionSnapshots.map(snapshot => [snapshot.questionId, snapshot]));
    // Only repair an assessment whose frozen IDs, marks and bonus status still match this saved
    // test. A genuinely older administered version remains frozen and untouched.
    const compatible = selected.every(id => {
      const old = oldById.get(id), question = questionMap.get(id);
      return old && question && old.points === question.points && old.isBonus === bonusIds.has(id);
    });
    if (!compatible) continue;
    const fresh = createAssessmentSnapshot(savedTest, questions, assessment.sectionId, {
      administeredAt: assessment.administeredAt,
      now,
      gradingMode: assessment.gradingMode,
    });
    if (fresh.questionSnapshots.length >= assessment.questionSnapshots.length
      || fresh.totalPoints !== assessment.totalPoints
      || fresh.bonusPoints !== assessment.bonusPoints) continue;
    regrouped.set(assessment.id, {
      ...assessment,
      questionSnapshots: fresh.questionSnapshots,
      totalPoints: fresh.totalPoints,
      bonusPoints: fresh.bonusPoints,
      updatedAt: now,
    });
    count++;
  }
  if (!count) return { data, count: 0 };

  const scores = data.scores.map(score => {
    const assessment = regrouped.get(score.assessmentId);
    if (!assessment || !score.questionScores) return score;
    const old = new Map(score.questionScores.map(entry => [entry.questionId, entry.points]));
    const represented = new Set<string>();
    const questionScores = assessment.questionSnapshots.flatMap(snapshot => {
      const ids = snapshot.memberQuestionIds ?? [snapshot.questionId];
      ids.forEach(id => represented.add(id));
      const values = ids.filter(id => old.has(id)).map(id => old.get(id) ?? null);
      if (!values.length) return [];
      const entered = values.filter((value): value is number => value !== null);
      return [{ questionId: snapshot.questionId, points: entered.length ? entered.reduce((sum, value) => sum + value, 0) : null }];
    });
    for (const entry of score.questionScores) if (!represented.has(entry.questionId)) questionScores.push(entry);
    return { ...score, questionScores, updatedAt: now };
  });
  return {
    data: {
      ...data,
      assessments: data.assessments.map(assessment => regrouped.get(assessment.id) ?? assessment),
      scores,
    },
    count,
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
    next.questionSnapshots = edit.questionPoints.map((points, index) => {
      const questionId = `external-q${index + 1}`;
      const previous = current.questionSnapshots.find((snapshot) => snapshot.questionId === questionId);
      return {
        ...previous,
        questionId,
        label: String(index + 1),
        order: index,
        points,
        isBonus: previous?.isBonus ?? false,
      };
    });
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

/**
 * Change what one question is out of, e.g. to 0 when the class skipped it, and re-total the
 * assessment. With `capScores`, question scores above the new value are lowered to it and each
 * student's total is re-added from their question scores.
 */
export function setAssessmentQuestionPoints(
  data: GradebookData,
  assessmentId: string,
  questionId: string,
  points: number,
  options: { capScores?: boolean } = {},
  now = Date.now(),
): GradebookData {
  const current = data.assessments.find((assessment) => assessment.id === assessmentId);
  if (!current || !current.questionSnapshots.some((snapshot) => snapshot.questionId === questionId)) return data;
  if (!Number.isFinite(points) || points < 0) return data;
  const questionSnapshots = current.questionSnapshots.map((snapshot) => (snapshot.questionId === questionId ? {
    ...snapshot,
    points,
    ...(snapshot.bonusPoints !== undefined ? { bonusPoints: Math.min(snapshot.bonusPoints, points) } : {}),
  } : snapshot));
  const next: GradebookAssessment = {
    ...current,
    questionSnapshots,
    totalPoints: sumRegularPoints(questionSnapshots),
    bonusPoints: sumBonusPoints(questionSnapshots),
    updatedAt: now,
  };
  const scores = !options.capScores ? data.scores : data.scores.map((score) => {
    if (score.assessmentId !== assessmentId) return score;
    const entry = score.questionScores?.find((candidate) => candidate.questionId === questionId);
    if (!entry || entry.points === null || entry.points <= points) return score;
    const questionScores = score.questionScores!.map((candidate) => (candidate === entry ? { ...candidate, points } : candidate));
    const entered = questionScores.filter((candidate) => candidate.points !== null);
    return {
      ...score,
      questionScores,
      points: score.state === 'normal' ? entered.reduce((sum, candidate) => sum + (candidate.points ?? 0), 0) : score.points,
      updatedAt: now,
    };
  });
  return {
    ...data,
    assessments: data.assessments.map((assessment) => (assessment.id === assessmentId ? next : assessment)),
    scores,
  };
}

/**
 * Assign curriculum metadata to one external assessment question. This edits only the
 * administered Gradebook snapshot; there is no bank question or saved test to update.
 */
export function setExternalAssessmentQuestionCurriculum(
  data: GradebookData,
  assessmentId: string,
  questionId: string,
  input: Pick<GradebookAssessmentQuestionSnapshot, 'classId' | 'unitId' | 'sectionId' | 'indicators'>,
  now = Date.now(),
): GradebookData {
  const current = data.assessments.find((assessment) => assessment.id === assessmentId);
  if (!current || current.source !== 'external') return data;
  const target = current.questionSnapshots.find((snapshot) => snapshot.questionId === questionId);
  if (!target) return data;
  const clean = (value: string | undefined): string | undefined => value?.trim() || undefined;
  const classId = clean(input.classId);
  const unitId = classId ? clean(input.unitId) : undefined;
  const sectionId = unitId ? clean(input.sectionId) : undefined;
  const indicatorIds = [...new Set((input.indicators ?? []).map((id) => id.trim()).filter(Boolean))];
  const indicators = indicatorIds.length ? indicatorIds : undefined;
  const sameIndicators = (target.indicators ?? []).length === (indicators ?? []).length
    && (target.indicators ?? []).every((id, index) => id === indicators?.[index]);
  if (target.classId === classId && target.unitId === unitId && target.sectionId === sectionId && sameIndicators) return data;
  const questionSnapshots = current.questionSnapshots.map((snapshot) => snapshot.questionId === questionId ? {
    ...snapshot,
    classId,
    unitId,
    sectionId,
    indicators,
  } : snapshot);
  return {
    ...data,
    assessments: data.assessments.map((assessment) => assessment.id === assessmentId
      ? { ...assessment, questionSnapshots, updatedAt: now }
      : assessment),
  };
}

/** How many students have a score on this question above `points`. */
export function questionScoresAbove(data: GradebookData, assessmentId: string, questionId: string, points: number): number {
  return data.scores.filter((score) =>
    score.assessmentId === assessmentId
    && score.questionScores?.some((entry) => entry.questionId === questionId && entry.points !== null && entry.points > points)
  ).length;
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

/** The denominator actually used for this student's assessment. */
export function scoreTotalPoints(score: GradebookScore | undefined, assessment: GradebookAssessment): number {
  return score?.state === 'alternative' ? score.alternativeTotalPoints ?? 0 : assessment.totalPoints;
}

export function assessmentScorePercent(score: GradebookScore | undefined, assessment: GradebookAssessment): number | null {
  const total = scoreTotalPoints(score, assessment);
  if (!scoreCountsInTotal(score) || total <= 0) return null;
  return (score!.points! / total) * 100;
}

export function scoreCountsInTotal(score: GradebookScore | undefined): boolean {
  return Boolean(score && score.points !== null && (score.state === 'normal'
    || (score.state === 'alternative' && Number.isFinite(score.alternativeTotalPoints) && (score.alternativeTotalPoints ?? 0) > 0)));
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
    .map((snapshot, index) => {
      const indicators = Array.isArray(snapshot.indicators)
        ? [...new Set((snapshot.indicators as unknown[]).filter((id): id is string => typeof id === 'string').map((id) => id.trim()).filter(Boolean))]
        : undefined;
      return {
        questionId: snapshot.questionId,
        memberQuestionIds: Array.isArray(snapshot.memberQuestionIds)
          ? snapshot.memberQuestionIds.filter((id: unknown): id is string => typeof id === 'string')
          : undefined,
        label: typeof snapshot.label === 'string' && snapshot.label.trim() ? snapshot.label.trim() : String(index + 1),
        order: typeof snapshot.order === 'number' ? snapshot.order : index,
        points: typeof snapshot.points === 'number' && Number.isFinite(snapshot.points) ? snapshot.points : 0,
        isBonus: snapshot.isBonus === true,
        bonusPoints: typeof snapshot.bonusPoints === 'number' && Number.isFinite(snapshot.bonusPoints)
          ? Math.max(0, Math.min(snapshot.points, snapshot.bonusPoints))
          : undefined,
        classId: typeof snapshot.classId === 'string' ? snapshot.classId : undefined,
        unitId: typeof snapshot.unitId === 'string' ? snapshot.unitId : undefined,
        sectionId: typeof snapshot.sectionId === 'string' ? snapshot.sectionId : undefined,
        indicators,
        bodyPreview: typeof snapshot.bodyPreview === 'string' ? snapshot.bodyPreview : undefined,
      };
    });
}

function summarizeQuestion(question: Question): string {
  const raw = question.parts?.stem || question.body || question.narrative || '';
  return raw.replace(/\s+/g, ' ').trim().slice(0, 160);
}

function sumPoints(snapshots: GradebookAssessmentQuestionSnapshot[]): number {
  return snapshots.reduce((sum, snapshot) => sum + snapshot.points, 0);
}

function snapshotBonusPoints(snapshot: GradebookAssessmentQuestionSnapshot): number {
  return snapshot.isBonus ? snapshot.points : Math.max(0, Math.min(snapshot.points, snapshot.bonusPoints ?? 0));
}

function sumBonusPoints(snapshots: GradebookAssessmentQuestionSnapshot[]): number {
  return snapshots.reduce((sum, snapshot) => sum + snapshotBonusPoints(snapshot), 0);
}

function sumRegularPoints(snapshots: GradebookAssessmentQuestionSnapshot[]): number {
  return snapshots.reduce((sum, snapshot) => sum + snapshot.points - snapshotBonusPoints(snapshot), 0);
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
