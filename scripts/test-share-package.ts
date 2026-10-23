import assert from 'node:assert/strict';
import { zipSync, unzipSync, strToU8 } from 'fflate';
import { encodeSharePackage, decodeSharePackage, portableTest, prepareTestCopies } from '../src/lib/share-package.ts';
import { bankOnlyData } from '../src/lib/workspace-format.ts';
import { defaultTestConfig, type SavedTest } from '../src/lib/types.ts';
import type { RepoAppData } from '../src/git/repoDataModel.ts';

const svg = strToU8('<svg xmlns="http://www.w3.org/2000/svg"><metadata id="math-graph-model">{"expressions":["x^2"]}</metadata></svg>');
const data: RepoAppData = {
  questions: [{ id: 'q1', body: 'Use the graph. #image("/imgs/graph.svg")', points: 3, tags: ['quadratics'], images: ['graph'], narrativeId: 'n1', classId: 'math', unitId: 'u1', sectionId: 's1', indicators: ['i1'], createdAt: 1,
    taskGroup: { id: 'task', instructions: 'Solve.', columns: 2 }, graphTypst: '#rect()',
  }, { id: 'q2', body: 'Second question', points: 5, tags: [], createdAt: 2 }],
  narratives: [{ id: 'n1', title: 'Context', body: '#image("/imgs/photo.png")', tags: [], createdAt: 1 }],
  customClasses: [{ id: 'math', name: 'Math', units: [{ id: 'u1', name: 'Quadratics', sections: [{ id: 's1', name: 'Graphs', indicators: [{ id: 'i1', text: 'Interpret a graph', nickname: 'Read graph' }] }] }] }],
  images: [{ name: 'graph', ext: 'svg', bytes: svg }, { name: 'photo', ext: 'png', bytes: new Uint8Array([1, 2, 3]) }, { name: 'header', ext: 'svg', bytes: svg }, { name: 'unused-private', ext: 'png', bytes: new Uint8Array([99]) }],
  savedTests: [],
};
const test: SavedTest = { id: 'test1', name: 'Unit test', classId: 'math', unitId: 'u1', testType: 'test', createdAt: 1, updatedAt: 2,
  config: { ...defaultTestConfig('Math'), selectedIds: ['q2', 'q1'], answerSpaceOverrides: { q1: 7 }, bonusQuestionIds: ['q2'], pageBreakAfter: { q2: { pagebreak: true } }, pageColumns: 2,
    choiceOverrides: { q1: { choices: { A: '#image("/imgs/photo.png")', B: 'Other' }, solution: 'A' } },
    customNarratives: [{ id: 'intro', body: 'Instructions #image("/imgs/photo.png")', afterQuestionId: null }],
    instructions: 'Look at #image("HEADER.svg")', ownQuestions: [{ ...data.questions[0], body: 'Edited for this test #image("graph.svg")', images: ['GRAPH.svg'], points: 9 }],
  },
};
data.savedTests = [test];
const before = JSON.stringify(data);
const bank = decodeSharePackage(encodeSharePackage({ kind: 'bank', items: [{ name: 'Teaching bank', data: bankOnlyData(data) }] }));
assert.equal(bank.items[0].data.savedTests.length, 0);
assert.deepEqual(bank.items[0].data.questions[0].taskGroup, data.questions[0].taskGroup);
assert.deepEqual(bank.items[0].data.customClasses, data.customClasses);
assert.deepEqual(bank.items[0].data.images!.find(image => image.name === 'graph')!.bytes, svg);
assert.equal(bank.items[0].data.images!.some(image => image.name === 'unused-private'), false);

const second = { ...test, id: 'test2', name: 'Variant', config: { ...test.config, ownQuestions: [{ ...data.questions[0], body: 'Independent variant', points: 12 }] } };
const pack = decodeSharePackage(encodeSharePackage({ kind: 'tests', items: [portableTest(test, data), portableTest(second, data)] }));
assert.equal(pack.items.length, 2);
assert.equal(pack.items[0].data.questions.find(q => q.id === 'q1')!.points, 9);
assert.equal(pack.items[1].data.questions.find(q => q.id === 'q1')!.points, 12, 'shared question IDs retain each test’s own edits');
assert.equal(pack.items[0].data.savedTests[0].config.ownQuestions, undefined);
const copies = prepareTestCopies(pack.items, [test]);
assert.deepEqual(copies.tests.map(t => t.name), ['Unit test (2)', 'Variant']);
assert.notEqual(copies.tests[0].id, test.id);
assert.deepEqual(copies.tests[0].config.selectedIds, ['q2', 'q1']);
assert.equal(copies.tests[0].config.answerSpaceOverrides.q1, 7);
assert.equal(copies.tests[0].config.pageBreakAfter.q2.pagebreak, true);
assert.equal(copies.tests[0].config.pageColumns, 2);
assert.deepEqual(copies.tests[0].config.bonusQuestionIds, ['q2']);
const copiedGraph = copies.images.find(image => image.ext === 'svg')!;
assert.deepEqual(copiedGraph.bytes, svg, 'editable graph metadata travels byte for byte');
assert.match(copies.tests[0].questionSnapshots!.find(q => q.id === 'q1')!.body, new RegExp(copiedGraph.name));
assert.match(copies.tests[0].config.instructions, /testasset-/);
assert.equal(pack.items[0].data.images!.length, 3, 'pictures used only in test settings are included');
assert.match(copies.tests[0].config.choiceOverrides.q1.choices.A, /testasset-/);
assert.equal(new Set(copies.images.map(image => image.name)).size, copies.images.length, 'imported assets have independent names');
assert.equal(JSON.stringify(data), before, 'sharing does not change source content');

assert.throws(() => encodeSharePackage({ kind: 'bank', items: [{ name: 'broken', data: { ...data, savedTests: [], images: [] } }] }), /Missing pictures/);
assert.throws(() => portableTest({ ...test, config: { ...test.config, selectedIds: ['missing'] } }, data), /missing question/);
assert.throws(() => encodeSharePackage({ kind: 'bank', items: [{ name: 'wrong scope', data }] }), /cannot contain saved tests/);
const malformed = portableTest(test, data);
malformed.data.savedTests[0].config.bonusQuestionIds = 3 as unknown as string[];
assert.throws(() => encodeSharePackage({ kind: 'tests', items: [malformed] }), /invalid bonus/);
const archive = encodeSharePackage({ kind: 'tests', items: [portableTest(test, data)] });
const files = unzipSync(archive);
files['items/0/images/extra.svg'] = svg;
assert.throws(() => decodeSharePackage(zipSync(files)), /manifest|Unexpected|Unlisted/i, 'unlisted files are rejected');
assert.throws(() => decodeSharePackage(zipSync({ '../escape': strToU8('bad') })), /path|segment/i);
assert.throws(() => decodeSharePackage(zipSync({ 'readme.txt': strToU8('not TestGen') })), /not a TestGen/);
const corrupt = unzipSync(archive);
corrupt['items/0/questions/q1.json'] = strToU8('{}');
assert.throws(() => decodeSharePackage(zipSync(corrupt)), /hash|size|manifest/i, 'corrupted content is rejected before import');
console.log('ZIP bank/test round trips, independent test snapshots, layout, graph bytes, collision handling, missing assets, and invalid ZIP checks passed.');
