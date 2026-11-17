import assert from 'node:assert/strict';
import type { Class } from '../src/lib/types.ts';
import {
  applyCurriculumLanguage,
  curriculumDefinitions,
  equivalentCurriculumOutcomeKeys,
  curriculumOutcomeKey,
  languageFromClasses,
  mergeCurriculumCatalog,
  mergeCurriculumLanguage,
  overlayPendingCurriculumLanguage,
  parseCurriculumCatalog,
  parseCurriculumLanguage,
  stableCurriculumJson,
} from '../src/lib/curriculum-library.ts';
import { bankCurriculumDependencies, parseBankCurriculumDependencies } from '../src/lib/curriculum-dependencies.ts';
import type { Question } from '../src/lib/types.ts';

const course: Class = {
  id: 'math-20s', name: 'Pre-Calculus 20S', units: [{ id: 'algebra', name: 'Algebra', sections: [{
    id: 'P2', name: 'Demonstrate an understanding of polynomial multiplication',
    nickname: 'multiply polynomial expressions', nextStep: 'practice the distributive property',
    indicators: [
      { id: 'P2.1', text: 'Model polynomial multiplication.', nickname: 'model polynomial multiplication',
        nextStepIndicator: { classId: 'math-20s', unitId: 'algebra', sectionId: 'P2', indicatorId: 'P2.2' } },
      { id: 'P2.2', text: 'Multiply polynomial expressions concretely and symbolically.', nickname: 'multiply polynomials using models and symbols' },
    ],
  }] }],
};

const definitions = curriculumDefinitions([course]);
assert.equal(definitions[0].units[0].sections[0].nickname, undefined);
assert.equal(definitions[0].units[0].sections[0].indicators?.[0].nickname, undefined);
assert.equal(definitions[0].units[0].sections[0].indicators?.[0].nextStepIndicator, undefined);

const language = languageFromClasses([course], 10);
const sectionKey = curriculumOutcomeKey('math-20s', 'algebra', 'P2', null);
const indicatorKey = curriculumOutcomeKey('math-20s', 'algebra', 'P2', 'P2.1');
assert.equal(language.outcomes[sectionKey].nickname, 'multiply polynomial expressions');
assert.equal(language.outcomes[sectionKey].nextStep, 'practice the distributive property');
assert.equal(language.outcomes[indicatorKey].nickname, 'model polynomial multiplication');
assert.deepEqual(language.outcomes[indicatorKey].nextStepIndicator,
  { classId: 'math-20s', unitId: 'algebra', sectionId: 'P2', indicatorId: 'P2.2' });
assert.deepEqual(applyCurriculumLanguage(definitions, language), [course]);

const duplicateCourse: Class = {
  ...definitions[0], id: 'same-curriculum-other-bank', name: 'Same curriculum, another local course',
  units: [{ ...definitions[0].units[0], id: 'different-unit-id' }],
};
const duplicateKey = curriculumOutcomeKey(duplicateCourse.id, 'different-unit-id', 'P2', null);
const duplicateIndicatorKey = curriculumOutcomeKey(duplicateCourse.id, 'different-unit-id', 'P2', 'P2.1');
const languageWithNewerDuplicate = mergeCurriculumLanguage(language, { schemaVersion: 3, updatedAt: 20, outcomes: {
  [duplicateKey]: { nickname: 'newest shared outcome wording', nicknameUpdatedAt: 20, updatedAt: 20 },
  [duplicateIndicatorKey]: { nickname: 'newest shared indicator wording', nicknameUpdatedAt: 20, updatedAt: 20 },
} });
const equivalentCopies = applyCurriculumLanguage([...definitions, duplicateCourse], languageWithNewerDuplicate);
assert.equal(equivalentCopies[0].units[0].sections[0].nickname, 'newest shared outcome wording',
  'the newest nickname reaches an equivalent official outcome under another course placement');
assert.equal(equivalentCopies[0].units[0].sections[0].indicators?.[0].nickname, 'newest shared indicator wording',
  'the newest indicator nickname reaches an equivalent official indicator under another course placement');
assert.deepEqual(equivalentCurriculumOutcomeKeys([...definitions, duplicateCourse], definitions[0], 'algebra', 'P2', null).sort(),
  [sectionKey, duplicateKey].sort(), 'an edit is persisted to every equivalent official outcome placement');
assert.deepEqual(equivalentCurriculumOutcomeKeys([...definitions, duplicateCourse], definitions[0], 'algebra', 'P2', 'P2.1').sort(),
  [indicatorKey, duplicateIndicatorKey].sort(), 'an indicator edit is persisted to every equivalent official indicator placement');

const older = { schemaVersion: 1 as const, updatedAt: 5, courses: [{ ...definitions[0], curriculumSource: { catalogId: 'manitoba-education', version: '2026-draft' } }] };
const newerCourse: Class = { id: 'math-20s', name: 'Mathematics 20S', units: [
  ...definitions[0].units,
  { id: 'functions', name: 'Functions', sections: [{ id: 'F1', name: 'Analyze functions.' }] },
] };
const mergedCatalog = mergeCurriculumCatalog(older, { schemaVersion: 1, updatedAt: 20, courses: [newerCourse] });
assert.equal(mergedCatalog.courses[0].name, 'Mathematics 20S');
assert.equal(mergedCatalog.courses[0].units.length, 2);
assert.deepEqual(mergedCatalog.courses[0].curriculumSource, { catalogId: 'manitoba-education', version: '2026-draft' });

const cleared = { schemaVersion: 3 as const, updatedAt: 30, outcomes: {
  [sectionKey]: { updatedAt: 30 },
} };
const mergedLanguage = mergeCurriculumLanguage(language, cleared);
assert.deepEqual(mergedLanguage.outcomes[sectionKey], {
  updatedAt: 30, nicknameUpdatedAt: 30, nextStepUpdatedAt: 30, nextStepIndicatorUpdatedAt: 30,
});
assert.equal(mergedLanguage.outcomes[indicatorKey].nickname, 'model polynomial multiplication');

const separatelyEdited = mergeCurriculumLanguage({ schemaVersion: 3, updatedAt: 40, outcomes: {
  [sectionKey]: { nickname: 'multiply polynomials', nicknameUpdatedAt: 40, nextStep: 'old step', nextStepUpdatedAt: 10, updatedAt: 40 },
} }, { schemaVersion: 3, updatedAt: 35, outcomes: {
  [sectionKey]: { nickname: 'older nickname', nicknameUpdatedAt: 20, nextStep: 'use an area model', nextStepUpdatedAt: 35, updatedAt: 35 },
} });
assert.equal(separatelyEdited.outcomes[sectionKey].nickname, 'multiply polynomials');
assert.equal(separatelyEdited.outcomes[sectionKey].nextStep, 'use an area model', 'fields merge independently instead of one edit erasing another');

const staleCache = { schemaVersion: 3 as const, updatedAt: 999, outcomes: {
  [sectionKey]: { nickname: 'stale browser wording', nicknameUpdatedAt: 999, updatedAt: 999 },
} };
const sharedWorkspace = { schemaVersion: 3 as const, updatedAt: 50, outcomes: {
  [sectionKey]: { nickname: 'shared workspace wording', nicknameUpdatedAt: 50, updatedAt: 50 },
} };
assert.equal(overlayPendingCurriculumLanguage(sharedWorkspace, staleCache, []).outcomes[sectionKey].nickname, 'shared workspace wording',
  'an unedited stale localStorage cache cannot overwrite the connected workspace file');
assert.equal(overlayPendingCurriculumLanguage(sharedWorkspace, staleCache, [{ key: sectionKey, field: 'nickname' }]).outcomes[sectionKey].nickname,
  'stale browser wording', 'an explicit unsynced browser edit survives long enough to be written to the workspace');

assert.deepEqual(parseCurriculumCatalog(stableCurriculumJson(mergedCatalog)), mergedCatalog);
assert.deepEqual(parseCurriculumLanguage(stableCurriculumJson(mergedLanguage)), mergedLanguage);
const legacyLanguage = JSON.stringify({ ...mergedLanguage, schemaVersion: 2 });
assert.deepEqual(parseCurriculumLanguage(legacyLanguage), mergedLanguage);

const dependencies = bankCurriculumDependencies([
  { id: 'q1', body: '', points: 1, tags: [], createdAt: 1, classId: 'math-20s', unitId: 'algebra', sectionId: 'P2', indicators: ['P2.2', 'P2.1'] },
  { id: 'q2', body: '', points: 1, tags: [], createdAt: 1, classId: 'math-20s', unitId: 'algebra', sectionId: 'P2', indicators: ['P2.1', 'P2.2'] },
] satisfies Question[]);
assert.deepEqual(dependencies.courses, [{ catalogId: 'testgen-local', version: 'unversioned', courseId: 'math-20s', references: [
  { unitId: 'algebra', sectionId: 'P2', indicatorIds: ['P2.1', 'P2.2'] },
] }]);
assert.deepEqual(parseBankCurriculumDependencies(JSON.stringify(dependencies)), dependencies);

console.log('shared curriculum library tests passed');
