import assert from 'node:assert/strict';
import { questionSnippet } from '../src/lib/question-snippet.ts';

const plain = (body: string) => questionSnippet(body).map(part => part.value).join('');
assert.equal(plain('A short question.'), 'A short question.');
assert.deepEqual(questionSnippet('Solve $x^2 + 1 = 5$.'), [
  { kind: 'text', value: 'Solve ' }, { kind: 'math', value: 'x^2 + 1 = 5' }, { kind: 'text', value: '.' },
]);
assert.equal(plain('A ticket costs \\$5. Use \\#1 and \\*2\\*.'), 'A ticket costs $5. Use #1 and *2*.');
assert.equal(plain('*Find* _the_ #underline[value] of $x$.'), 'Find the value of x.');
assert.equal(plain('Given #text(fill: rgb("red"))[*a nested* $x^2$], solve.'), 'Given a nested x^2, solve.');
assert.equal(plain('Inspect #image("/imgs/plot", width: 4cm), then find $x$.'), 'Inspect [Image], then find x.');
assert.equal(plain('Use this graph.\n#context { let data = (1, 2); data }'), 'Use this graph.');
assert.equal(plain('Pick one.\n\n#grid(columns: (1fr, 1fr), [A], [B])'), 'Pick one.');
assert.equal(plain('#let coefficient = 2\n\nSolve $x + 2 = 5$.'), 'Solve x + 2 = 5.');
assert.equal(plain('#let coefficient = 2\nSolve $x + 2 = 5$.'), 'Solve x + 2 = 5.');
assert.equal(plain('#let values = (\n  1, 2, 3,\n)\nUse the given values.'), 'Use the given values.');
assert.equal(plain('#context { let x = 1; x }'), 'Formatted question');
assert.equal(plain(''), 'Empty question');
assert.equal(plain('Fix $sqrt(x.'), 'Fix sqrt(x.');
assert.deepEqual(questionSnippet('Evaluate $text("$")$.'), [
  { kind: 'text', value: 'Evaluate ' }, { kind: 'math', value: 'text("$")' }, { kind: 'text', value: '.' },
]);
const expression = Array(90).fill('x').join(' + ');
assert.equal(questionSnippet(`Find $${expression}$ and explain.`).find(part => part.kind === 'math')?.value, expression, 'long equations are kept whole');
assert.ok(plain('A long question. '.repeat(100)).endsWith('…'));
assert.ok(plain('A long question. '.repeat(100)).length <= 221);
assert.ok(!questionSnippet(`$${'x+'.repeat(400)}x$`).some(part => part.kind === 'math'), 'very large expressions stay bounded');
console.log('Bank snippets passed: intact math, escaped and quoted delimiters, readable markup, images, grids, code blocks, and bounded excerpts.');
