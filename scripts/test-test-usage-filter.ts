import assert from 'node:assert/strict';
import {
  activeTestUsageRecords,
  emptyTestUsageSelection,
  questionIdsUsedBy,
  type TestUsageSelection,
} from '../src/lib/test-usage-filter.ts';
import { defaultTestConfig, type GradebookAssessment, type GradebookSection, type SavedTest } from '../src/lib/types.ts';

const savedTest = (id: string, classId: string | null, questionIds: string[], archivedAt?: number): SavedTest => ({
  id,
  name: id,
  classId,
  unitId: null,
  testType: 'test',
  config: { ...defaultTestConfig(), selectedIds: questionIds },
  createdAt: 1,
  updatedAt: 2,
  archivedAt,
});

const section = (id: string, linkedClassId: string | null, state: 'active' | 'archived' | 'trashed' = 'active'): GradebookSection => ({
  id,
  name: id,
  linkedClassId,
  termLabel: null,
  categoryWeights: {},
  archivedAt: state === 'archived' ? 10 : undefined,
  trashedAt: state === 'trashed' ? 10 : undefined,
  createdAt: 1,
  updatedAt: 2,
});

const assessment = (id: string, sectionId: string, savedTestId: string, questionIds: string[]): GradebookAssessment => ({
  id,
  sectionId,
  savedTestId,
  savedTestName: id,
  title: id,
  subtitle: '',
  testType: 'test',
  selectedQuestionIds: questionIds,
  questionSnapshots: questionIds.map((questionId, order) => ({ questionId, label: String(order + 1), order, points: 1, isBonus: false })),
  totalPoints: questionIds.length,
  bonusPoints: 0,
  administeredAt: 3,
  createdAt: 3,
  updatedAt: 3,
});

const savedTests = [
  savedTest('saved-a', 'class-a', ['q-a', 'q-shared']),
  savedTest('saved-current', 'class-a', ['q-current']),
  savedTest('saved-archived', 'class-b', ['q-archived'], 10),
  savedTest('saved-unclassified', null, ['q-unclassified']),
];
const sections = [
  section('section-b', 'class-b'),
  section('section-archived', 'class-c', 'archived'),
  section('section-trashed', 'class-c', 'trashed'),
];
const assessments = [
  assessment('assessment-b', 'section-b', 'saved-b', ['q-shared', 'q-b']),
  assessment('assessment-current', 'section-b', 'saved-current', ['q-current-copy']),
  assessment('assessment-archived', 'section-archived', 'saved-c', ['q-old']),
  assessment('assessment-trashed', 'section-trashed', 'saved-d', ['q-trash']),
  assessment('assessment-empty', 'section-b', '', []),
  { ...assessment('assessment-external', 'section-b', '', ['q-a']), source: 'external' as const },
];

const records = activeTestUsageRecords(savedTests, sections, assessments, 'saved-current');
assert.deepEqual(records.map((record) => `${record.kind}:${record.id}`), [
  'saved-test:saved-a',
  'saved-test:saved-unclassified',
  'assessment:assessment-b',
]);

const ids = (selection: TestUsageSelection) => [...questionIdsUsedBy(records, selection)].sort();
assert.deepEqual(ids({ ...emptyTestUsageSelection(), mode: 'any' }), ['q-a', 'q-b', 'q-shared', 'q-unclassified']);
assert.deepEqual(ids({ ...emptyTestUsageSelection(), mode: 'specific', classIds: ['class-a'] }), ['q-a', 'q-shared']);
assert.deepEqual(ids({ ...emptyTestUsageSelection(), mode: 'specific', classIds: ['class-b'] }), ['q-b', 'q-shared']);
assert.deepEqual(ids({ ...emptyTestUsageSelection(), mode: 'specific', gradebookSectionIds: ['section-b'] }), ['q-b', 'q-shared']);
assert.deepEqual(ids({ ...emptyTestUsageSelection(), mode: 'specific', savedTestIds: ['saved-unclassified'] }), ['q-unclassified']);
assert.deepEqual(ids({ ...emptyTestUsageSelection(), mode: 'specific', assessmentIds: ['assessment-b'] }), ['q-b', 'q-shared']);
assert.deepEqual(ids({
  ...emptyTestUsageSelection(),
  mode: 'specific',
  savedTestIds: ['saved-a'],
  assessmentIds: ['assessment-b'],
}), ['q-a', 'q-b', 'q-shared']);
assert.deepEqual(ids(emptyTestUsageSelection()), []);

console.log('Test-usage filtering passed: active-only records, current-test exclusion, any/specific modes, and union scopes.');
