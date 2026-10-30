import assert from 'node:assert/strict';
import {
  choiceOverridesByVersion,
  classSetPrintPlan,
  generateClassSet,
} from '../src/lib/class-set-print.ts';
import { defaultTestConfig, type Question } from '../src/lib/types.ts';

const questions: Question[] = [{
  id: 'mcq-1',
  body: 'Which value equals the expression?\n\n$ 2 + 2 $',
  points: 1,
  tags: [],
  createdAt: 1,
  choices: { A: '3', B: '4', C: '5' },
  answer: 'B',
  solution: 'B',
}];

const alternating = classSetPrintPlan({ copies: 30, versions: 2, order: 'alternating' });
assert.deepEqual(alternating.counts, [15, 15]);
assert.deepEqual(alternating.sequence.slice(0, 6), [0, 1, 0, 1, 0, 1]);

const grouped = classSetPrintPlan({ copies: 31, versions: 3, order: 'grouped' });
assert.deepEqual(grouped.counts, [11, 10, 10]);
assert.deepEqual(grouped.sequence, [
  ...Array(11).fill(0),
  ...Array(10).fill(1),
  ...Array(10).fill(2),
]);

const config = {
  ...defaultTestConfig('Math 10'),
  selectedIds: questions.map(question => question.id),
  choiceOverrides: {
    'mcq-1': { choices: { A: '4', B: '3', C: '5' }, solution: 'A' },
  },
};
const first = choiceOverridesByVersion(config, questions, 3);
const second = choiceOverridesByVersion(config, questions, 3);
assert.deepEqual(first, second, 'scrambles are stable when the print job is regenerated');
assert.deepEqual(first[0], config.choiceOverrides, 'Version A preserves the test currently shown to the teacher');
assert.equal(new Set(first.map(overrides => Object.values(overrides['mcq-1'].choices).join('|'))).size, 3);
for (const overrides of first) {
  assert.equal(overrides['mcq-1'].choices[overrides['mcq-1'].solution], '4', 'each version key follows its remapped correct choice');
}

const generated = generateClassSet({ copies: 5, versions: 2, order: 'grouped' }, config, questions);
assert.deepEqual(generated.plan.counts, [3, 2]);
assert.equal(generated.answerKeyCount, 1);
assert.equal(generated.source.match(/^#\[$/gm)?.length, 6, 'every paper and the combined key have an isolated Typst style scope');
assert.equal(generated.source.match(/#align\(right\)\[\*Version [AB]\*\]/g)?.length, 5);
assert.match(generated.source, /\*Multiple Choice Keys\*/);
assert.match(generated.source, /\*Version A\*\n#v\(0\.25em\)/);
assert.match(generated.source, /\*Version B\*\n#v\(0\.25em\)/);

const unlabeled = generateClassSet({
  copies: 2,
  versions: 2,
  order: 'alternating',
  showVersionLabel: false,
}, config, questions);
assert.doesNotMatch(unlabeled.source, /#align\(right\)\[\*Version [AB]\*\]/, 'paper labels can be hidden');
assert.match(unlabeled.source, /\*Version A\*\n#v\(0\.25em\)/, 'answer lists stay explicitly identified');
assert.match(unlabeled.source, /\*Version B\*\n#v\(0\.25em\)/);

const positions = [[{ num: '1', ans: 'A', page: 1, y: 100 }], [{ num: '1', ans: 'B', page: 1, y: 100 }]];
const withStrips = generateClassSet(
  { copies: 2, versions: 2, order: 'alternating' },
  { ...config, answerStrip: true },
  questions,
  [],
  positions,
);
assert.equal(withStrips.source.match(/#context tg-answer-strips/g)?.length, 1, 'all version strips share one answer-strip page');

console.log('Class-set print checks passed: distribution, deterministic scrambling, remapped keys, and document assembly.');
