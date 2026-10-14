import assert from 'node:assert/strict';
import { indicatorIndex, indicatorLabel, normalizeIndicators, searchIndicators, swapMatches } from '../src/lib/achievement-indicators.ts';
import { sectionLabel } from '../src/lib/curriculum-labels.ts';
import { mergeWorkspaceClasses } from '../src/lib/workspace-format.ts';
import type { Class, Question } from '../src/lib/types.ts';

const cls: Class = {
  id: 'algebra', name: 'Algebra', units: [{ id: 'u', name: 'Radicals', sections: [
    { id: 'R.1', name: 'Simplify radicals', indicators: [{ id: 'R.1.1', text: 'Express an entire radical as a mixed radical.' }, { id: 'R.1.2', text: 'Rationalize a denominator.' }] },
    { id: 'R.2', name: 'Radical equations', indicators: [{ id: 'R.2.1', text: 'Solve a radical equation.' }] },
  ] }],
};
const index = indicatorIndex([cls]);
assert.equal(index.size, 3);
assert.equal(index.get('R.1.2')?.number, 2);
assert.deepEqual(searchIndicators(index, 'mixed radical').map(e => e.id), ['R.1.1']);
assert.deepEqual(searchIndicators(index, 'r.2').map(e => e.id), ['R.2.1']);

let n = 0;
const q = (fields: Partial<Question>): Question => ({ id: `q${++n}`, body: `Question ${n}`, points: 2, tags: [], createdAt: n, classId: 'algebra', unitId: 'u', ...fields });
const target = q({ sectionId: 'R.1', indicators: ['R.1.1'] });
const sameIndicatorMcq = q({ sectionId: 'R.1', indicators: ['R.1.1'], choices: { A: '1', B: '2' } });
const sameIndicator = q({ sectionId: 'R.1', indicators: ['R.1.1'], points: 3 });
const sameSection = q({ sectionId: 'R.1', indicators: ['R.1.2'] });
const untaggedSameSection = q({ sectionId: 'R.1' });
const otherClassSameIndicator = q({ classId: 'other', unitId: 'x', sectionId: 'y', indicators: ['R.1.1'] });
const unrelated = q({ sectionId: 'R.2', indicators: ['R.2.1'] });
const pool = [target, sameIndicatorMcq, sameIndicator, sameSection, untaggedSameSection, otherClassSameIndicator, unrelated];
const matches = swapMatches(target, pool, index);
// Same indicator first (same type, then closest points), then the same section; never itself or unrelated.
assert.deepEqual(matches.map(m => m.question.id), [otherClassSameIndicator.id, sameIndicator.id, sameIndicatorMcq.id, sameSection.id, untaggedSameSection.id]);
assert.deepEqual(matches.map(m => m.level), ['indicator', 'indicator', 'indicator', 'section', 'section']);
assert.deepEqual(swapMatches(target, pool, index, new Set([otherClassSameIndicator.id])).map(m => m.question.id)[0], sameIndicator.id);
// A question placed nowhere but tagged with an indicator still finds its section's questions.
assert.ok(swapMatches(q({ indicators: ['R.1.2'] }), pool, index).some(m => m.question.id === untaggedSameSection.id));

assert.deepEqual(normalizeIndicators([' R.1.1 ', 'R.1.1', 4, '']), ['R.1.1']);
assert.equal(normalizeIndicators([]), undefined);
assert.deepEqual(normalizeIndicators([{ id: 'R.1.2', text: 'Rationalize a denominator.' }, 'R.1.1']), ['R.1.2', 'R.1.1']);

// A section two banks share keeps the indicators either one lists.
const bare: Class = { ...cls, units: [{ ...cls.units[0], sections: [{ id: 'R.1', name: 'Simplify radicals' }] }] };
const merged = mergeWorkspaceClasses([bare, cls]);
assert.deepEqual(merged[0].units[0].sections[0].indicators?.map(i => i.id), ['R.1.1', 'R.1.2']);
assert.equal(bare.units[0].sections[0].indicators, undefined, 'merging does not change its inputs');
// Nicknames: shown in place of the wording, and a copy without one takes it from the other bank.
assert.equal(indicatorLabel({ text: 'Rationalize a denominator.', nickname: 'Rationalize' }), 'Rationalize');
assert.equal(indicatorLabel({ text: 'Rationalize a denominator.' }), 'Rationalize a denominator.');
assert.equal(sectionLabel({ id: 'R.1', name: 'Simplify radicals', nickname: 'Radicals' }), 'R.1 Radicals');
const nicknamed: Class = JSON.parse(JSON.stringify(cls));
nicknamed.units[0].sections[0].nickname = 'Radicals';
nicknamed.units[0].sections[0].indicators![1].nickname = 'Rationalize';
const mergedNames = mergeWorkspaceClasses([cls, nicknamed])[0].units[0].sections[0];
assert.equal(mergedNames.nickname, 'Radicals');
assert.deepEqual(mergedNames.indicators?.map(i => i.nickname), [undefined, 'Rationalize']);
assert.deepEqual(searchIndicators(indicatorIndex([nicknamed]), 'rationalize').map(e => e.id), ['R.1.2']);
console.log('achievement indicator tests passed');

// Generated questions carry the indicators of their problem type.
const { CATALOG_INDICATORS } = await import('../src/lib/generator/catalog-indicators.ts');
const { CATALOGS } = await import('../src/lib/generator/catalog.ts');
const { GENERATORS, toQuestion } = await import('../src/lib/generator/registry.ts');
const catalogIds = new Set(CATALOGS.flatMap(c => c.units.flatMap(u => u.types.map(t => t.id))));
for (const [id, ids] of Object.entries(CATALOG_INDICATORS)) {
  assert.ok(catalogIds.has(id), `${id} is a catalog problem type`);
  assert.ok(ids.length && ids.every(i => /^(9|10I|11P|12P)\.[A-Z]+\.\d+\.\d+$/.test(i)), `${id} has indicator ids`);
}
const tagged = GENERATORS.find(g => g.catalogId === '30s-rad-entire-to-mixed')!;
assert.deepEqual(toQuestion({ generatorId: tagged.id, difficulty: 1, seed: 7 }, 'written').indicators, ['11P.A.2.2']);
console.log('generator indicator tests passed');
