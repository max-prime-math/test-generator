import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const workspace = process.argv[2] ?? '/home/max/TestGen';
const catalog = JSON.parse(fs.readFileSync(path.join(workspace, 'curriculum/catalog.json'), 'utf8'));
const language = JSON.parse(fs.readFileSync(path.join(workspace, 'curriculum/comment-language.json'), 'utf8'));
const key = (classId, unitId, sectionId, indicatorId) => JSON.stringify([classId, unitId, sectionId, indicatorId]);
const excluded = (course) => /cemc|comc/i.test(`${course.id} ${course.name}`);
const placements = new Map();
const expected = [];
const normalized = (value) => value.toLowerCase().replace(/\b(?:the|a|an|to)\b/gu, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();

assert.equal(language.schemaVersion, 3, 'current app requires curriculum language schema 3');
for (const course of catalog.courses) for (const unit of course.units) for (const section of unit.sections) {
  const sectionKey = key(course.id, unit.id, section.id, null);
  placements.set(sectionKey, { course, unit, section, indicator: null });
  if (!excluded(course)) expected.push(sectionKey);
  for (const indicator of section.indicators ?? []) {
    const indicatorKey = key(course.id, unit.id, section.id, indicator.id);
    placements.set(indicatorKey, { course, unit, section, indicator });
    if (!excluded(course)) expected.push(indicatorKey);
  }
}

let outcomes = 0;
let indicators = 0;
let links = 0;
for (const placementKey of expected) {
  const placement = placements.get(placementKey);
  const entry = language.outcomes[placementKey];
  assert.ok(entry, `missing language entry ${placementKey}`);
  assert.equal(typeof entry.nickname, 'string', `missing nickname ${placementKey}`);
  assert.ok(entry.nickname.trim(), `blank nickname ${placementKey}`);
  assert.equal(entry.nickname, entry.nickname.trim(), `nickname has surrounding whitespace ${placementKey}`);
  assert.ok(!/[\r\n•]/u.test(entry.nickname), `nickname contains a newline or bullet ${placementKey}`);
  assert.ok(!/[.!?]$/u.test(entry.nickname), `nickname has trailing punctuation ${placementKey}`);
  assert.ok(entry.nickname.length <= 90, `nickname exceeds 90 characters ${placementKey}: ${entry.nickname.length}`);
  assert.equal(entry.nextStep, undefined, `legacy written nextStep remains ${placementKey}`);
  for (const clock of ['nicknameUpdatedAt', 'nextStepUpdatedAt', 'nextStepIndicatorUpdatedAt']) {
    assert.ok(Number.isFinite(entry[clock]) && entry[clock] >= 0, `missing ${clock} ${placementKey}`);
  }
  if (placement.indicator) indicators++; else outcomes++;
  if (entry.nextStepIndicator) {
    links++;
    assert.equal(placement.indicator, null, `indicator-level next-step link remains ${placementKey}`);
    const ref = entry.nextStepIndicator;
    const targetKey = key(ref.classId, ref.unitId, ref.sectionId, ref.indicatorId);
    const target = placements.get(targetKey);
    assert.ok(target?.indicator, `unresolved nextStepIndicator ${placementKey} -> ${targetKey}`);
    assert.equal(target.course.id, ref.classId);
    assert.equal(target.unit.id, ref.unitId);
    assert.equal(target.section.id, ref.sectionId);
    assert.equal(target.indicator.id, ref.indicatorId);
    const targetNickname = language.outcomes[targetKey]?.nickname;
    assert.ok(targetNickname, `linked indicator lacks a nickname ${targetKey}`);
    const sourcePlacement = JSON.parse(placementKey);
    assert.deepEqual([ref.classId, ref.unitId, ref.sectionId], sourcePlacement.slice(0, 3),
      `fallback indicator does not belong to its challenged outcome ${placementKey}`);
    assert.notEqual(normalized(targetNickname), normalized(entry.nickname), `fallback merely repeats its challenge ${placementKey}`);
  }
}

const liveKeys = Object.keys(language.outcomes);
assert.equal(liveKeys.length, expected.length, 'language file has missing, excluded, or orphan entries');
for (const placementKey of liveKeys) assert.ok(expected.includes(placementKey), `orphan or excluded language entry ${placementKey}`);

const findNickname = (classId, unitId, sectionId, indicatorId = null) => language.outcomes[key(classId, unitId, sectionId, indicatorId)]?.nickname;
assert.equal(findNickname('manitoba-grade-9-mathematics-2026', 'mb9-course-1-patterns-and-relations', 'MAT.9.1.B.3'),
  'solve linear equations with rational coefficients');
assert.equal(findNickname('manitoba-grade-9-mathematics-2026', 'mb9-course-2-shape-and-space', 'MAT.9.2.C.1'),
  'calculating the surface area of composite objects');
assert.equal(findNickname('3187ac3e-5992-4ad9-9d34-6291ddd6d7fd', 'linear-functions-and-systems', '10I.R.9', '10I.R.9.5'),
  'solve a linear system algebraically and verify the solution');

console.log(JSON.stringify({ schemaVersion: language.schemaVersion, outcomes, indicators, links,
  nicknames: expected.length, writtenNextSteps: 0, maxNicknameLength: Math.max(...expected.map(item => language.outcomes[item].nickname.length)) }, null, 2));
