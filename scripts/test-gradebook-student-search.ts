import assert from 'node:assert/strict';
import { studentSearchScore } from '../src/lib/gradebook-student-search.ts';

const student = { firstName: 'José', lastName: 'O’Connor', knownBy: 'Joey', sisId: '00123' };
for (const query of ['jose', 'joey', 'joey connor', 'connor jose', 'jse ocnr', 'josee', '00123']) {
  assert.notEqual(studentSearchScore(student, query), null, `Matches ${query}`);
}
assert.equal(studentSearchScore(student, '00124'), null, 'IDs do not match mistyped numbers');
assert.equal(studentSearchScore(student, 'unrelated'), null);
assert.ok(studentSearchScore(student, 'jose') > studentSearchScore({ ...student, firstName: 'Joseph' }, 'jose'), 'Exact names rank ahead of prefixes');
assert.ok(studentSearchScore(student, 'jose') > studentSearchScore(student, 'jse'), 'Exact names rank ahead of skipped letters');
console.log('gradebook student search tests passed');
