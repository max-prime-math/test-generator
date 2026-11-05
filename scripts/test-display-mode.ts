import assert from 'node:assert/strict';
import { displayQuestionContent, displayQuestionSource, hasDisplayAnswer } from '../src/lib/display-question.ts';

const question = {
  id: 'q-1',
  body: 'What is $2 + 2$?',
  narrative: 'Use the information in the diagram.',
  choices: { A: '3', B: '4', C: '5' },
  answer: 'B',
  solution: '$2 + 2 = 4$.',
  graphTypst: '#rect(width: 1cm, height: 1cm)',
};

const student = displayQuestionContent(question, question.narrative, false);
assert.ok(student.startsWith('Use the information in the diagram.\n\nWhat is $2 + 2$?'), 'narrative precedes the question');
assert.ok(student.includes('#grid('), 'multiple-choice options are included');
assert.ok(student.includes('#rect(width: 1cm, height: 1cm)'), 'question graph is included');
assert.ok(!student.includes('*Answer:*'), 'answer starts hidden');
assert.ok(!student.includes('*Solution:*'), 'solution starts hidden');

const teacher = displayQuestionContent(question, question.narrative, true);
assert.ok(teacher.includes('*Answer:* B'), 'show answer includes the correct choice');
assert.ok(teacher.includes('*Solution:*\n$2 + 2 = 4$.'), 'show answer includes the solution');
assert.equal(hasDisplayAnswer(question), true);
assert.equal(hasDisplayAnswer({ id: 'q-2', body: 'Sketch a line.' }), false);

const enlarged = displayQuestionSource(question, question.narrative, false, { bgTypst: 'ffffff', textTypst: '111111' }, 27);
assert.ok(enlarged.includes('size: 27pt'), 'zoom changes the rendered Typst font size');
assert.ok(enlarged.includes('fill: rgb("ffffff")'), 'the selected display theme controls the rendered page');

const recoveredGraph = displayQuestionContent({
  id: 'q-3',
  body: 'Recovered graph: #image("graph.svg")',
  graphTypst: 'Recovered graph: #image("graph.svg")',
}, '', false);
assert.equal(recoveredGraph.match(/Recovered graph/g)?.length, 1, 'a recovered graph is not duplicated');

console.log('display mode content tests passed');
