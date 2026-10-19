import type { GradebookAssessment, GradebookSection, SavedTest } from './types';

export type TestUsageMode = 'none' | 'any' | 'specific';

export interface TestUsageSelection {
  mode: TestUsageMode;
  classIds: string[];
  gradebookSectionIds: string[];
  savedTestIds: string[];
  assessmentIds: string[];
}

export interface TestUsageRecord {
  kind: 'saved-test' | 'assessment';
  id: string;
  name: string;
  classId: string | null;
  gradebookSectionId: string | null;
  gradebookSectionName: string | null;
  questionIds: string[];
  date: number;
}

export function emptyTestUsageSelection(): TestUsageSelection {
  return {
    mode: 'none',
    classIds: [],
    gradebookSectionIds: [],
    savedTestIds: [],
    assessmentIds: [],
  };
}

/** Active usage records that can participate in Build's "used on tests" filter. */
export function activeTestUsageRecords(
  savedTests: SavedTest[],
  sections: GradebookSection[],
  assessments: GradebookAssessment[],
  currentTestId: string | null,
): TestUsageRecord[] {
  const activeSections = new Map(
    sections
      .filter((section) => !section.archivedAt && !section.trashedAt)
      .map((section) => [section.id, section]),
  );

  const savedRecords: TestUsageRecord[] = savedTests
    .filter((test) => !test.archivedAt && test.id !== currentTestId)
    .map((test) => ({
      kind: 'saved-test' as const,
      id: test.id,
      name: test.name,
      classId: test.classId,
      gradebookSectionId: null,
      gradebookSectionName: null,
      questionIds: [...new Set(test.config.selectedIds)],
      date: test.updatedAt,
    }))
    .filter((record) => record.questionIds.length > 0);

  const assessmentRecords: TestUsageRecord[] = assessments.flatMap((assessment) => {
    const section = activeSections.get(assessment.sectionId);
    // External assessments use positional IDs such as "external-q1"; those do
    // not identify bank questions and must never hide an unrelated question.
    if (!section || assessment.source === 'external' || assessment.savedTestId === currentTestId) return [];
    const questionIds = assessment.selectedQuestionIds.length
      ? assessment.selectedQuestionIds
      : assessment.questionSnapshots.map((snapshot) => snapshot.questionId);
    if (!questionIds.length) return [];
    return [{
      kind: 'assessment' as const,
      id: assessment.id,
      name: assessment.savedTestName || assessment.title || 'Untitled assessment',
      classId: section.linkedClassId,
      gradebookSectionId: section.id,
      gradebookSectionName: section.name,
      questionIds: [...new Set(questionIds)],
      date: assessment.administeredAt,
    }];
  });

  return [...savedRecords, ...assessmentRecords];
}

export function questionIdsUsedBy(
  records: TestUsageRecord[],
  selection: TestUsageSelection,
): Set<string> {
  if (selection.mode === 'none') return new Set();
  const matching = selection.mode === 'any'
    ? records
    : records.filter((record) =>
        (record.classId != null && selection.classIds.includes(record.classId))
        || (record.gradebookSectionId != null && selection.gradebookSectionIds.includes(record.gradebookSectionId))
        || (record.kind === 'saved-test' && selection.savedTestIds.includes(record.id))
        || (record.kind === 'assessment' && selection.assessmentIds.includes(record.id))
      );
  return new Set(matching.flatMap((record) => record.questionIds));
}

export function testUsageSelectionCount(selection: TestUsageSelection): number {
  if (selection.mode === 'any') return 1;
  if (selection.mode === 'none') return 0;
  return selection.classIds.length
    + selection.gradebookSectionIds.length
    + selection.savedTestIds.length
    + selection.assessmentIds.length;
}
