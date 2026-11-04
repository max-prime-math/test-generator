import assert from 'node:assert/strict';
import type { Class } from '../src/lib/types.ts';
import {
  applyCurriculumLanguage,
  curriculumDefinitions,
  curriculumOutcomeKey,
  languageFromClasses,
  mergeCurriculumCatalog,
  mergeCurriculumLanguage,
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
    indicators: [{ id: 'P2.1', text: 'Model polynomial multiplication.', nickname: 'model polynomial multiplication' }],
  }] }],
};

const definitions = curriculumDefinitions([course]);
assert.equal(definitions[0].units[0].sections[0].nickname, undefined);
assert.equal(definitions[0].units[0].sections[0].indicators?.[0].nickname, undefined);

const language = languageFromClasses([course], 10);
const sectionKey = curriculumOutcomeKey('math-20s', 'algebra', 'P2', null);
const indicatorKey = curriculumOutcomeKey('math-20s', 'algebra', 'P2', 'P2.1');
assert.equal(language.outcomes[sectionKey].nickname, 'multiply polynomial expressions');
assert.equal(language.outcomes[sectionKey].nextStep, 'practice the distributive property');
assert.equal(language.outcomes[indicatorKey].nickname, 'model polynomial multiplication');
assert.deepEqual(applyCurriculumLanguage(definitions, language), [course]);

const older = { schemaVersion: 1 as const, updatedAt: 5, courses: [{ ...definitions[0], curriculumSource: { catalogId: 'manitoba-education', version: '2026-draft' } }] };
const newerCourse: Class = { id: 'math-20s', name: 'Mathematics 20S', units: [
  ...definitions[0].units,
  { id: 'functions', name: 'Functions', sections: [{ id: 'F1', name: 'Analyze functions.' }] },
] };
const mergedCatalog = mergeCurriculumCatalog(older, { schemaVersion: 1, updatedAt: 20, courses: [newerCourse] });
assert.equal(mergedCatalog.courses[0].name, 'Mathematics 20S');
assert.equal(mergedCatalog.courses[0].units.length, 2);
assert.deepEqual(mergedCatalog.courses[0].curriculumSource, { catalogId: 'manitoba-education', version: '2026-draft' });

const cleared = { schemaVersion: 1 as const, updatedAt: 30, outcomes: {
  [sectionKey]: { updatedAt: 30 },
} };
const mergedLanguage = mergeCurriculumLanguage(language, cleared);
assert.deepEqual(mergedLanguage.outcomes[sectionKey], { updatedAt: 30 });
assert.equal(mergedLanguage.outcomes[indicatorKey].nickname, 'model polynomial multiplication');

assert.deepEqual(parseCurriculumCatalog(stableCurriculumJson(mergedCatalog)), mergedCatalog);
assert.deepEqual(parseCurriculumLanguage(stableCurriculumJson(mergedLanguage)), mergedLanguage);

const dependencies = bankCurriculumDependencies([
  { id: 'q1', body: '', points: 1, tags: [], createdAt: 1, classId: 'math-20s', unitId: 'algebra', sectionId: 'P2', indicators: ['P2.2', 'P2.1'] },
  { id: 'q2', body: '', points: 1, tags: [], createdAt: 1, classId: 'math-20s', unitId: 'algebra', sectionId: 'P2', indicators: ['P2.1', 'P2.2'] },
] satisfies Question[]);
assert.deepEqual(dependencies.courses, [{ catalogId: 'testgen-local', version: 'unversioned', courseId: 'math-20s', references: [
  { unitId: 'algebra', sectionId: 'P2', indicatorIds: ['P2.1', 'P2.2'] },
] }]);
assert.deepEqual(parseBankCurriculumDependencies(JSON.stringify(dependencies)), dependencies);

console.log('shared curriculum library tests passed');
