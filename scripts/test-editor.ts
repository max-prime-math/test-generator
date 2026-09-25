import assert from 'node:assert/strict';
import { commitDraft, duplicateDraft, editDraft, importDraft, newDraft, questionData, rearrangeChoices, validateDraft, type EditorBank } from '../src/lib/editor/editor-model.ts';
import { loadSession, saveSession, type EditorSession } from '../src/lib/editor/editor-drafts.ts';
import { exportAppDataToRepoEntries, importRepoEntriesToAppData } from '../src/git/repoDataModel.ts';
import type { Question } from '../src/lib/types.ts';

const original: Question = { id: 'stable-id', body: 'Solve $x=2$.', points: 4, tags: ['algebra'], createdAt: 10, updatedAt: 20,
  choices: { A: '$1$', B: '$2$', C: '$3$' }, answer: 'B', solution: '$x=2$', checked: true, renderError: 'old error',
  algorithmSeed: 100, algorithmVariant: 2, graphTypst: '// graph', images: ['figure'] };
const calls: string[] = [];
const bank: EditorBank = {
  questions: [structuredClone(original)],
  add(data) { const question = { ...data, id: `new-${calls.length}`, createdAt: Date.now() }; calls.push('add'); this.questions.push(question); return question; },
  update(id, data) { calls.push('update'); this.questions = this.questions.map(q => q.id === id ? { ...q, ...data, updatedAt: Date.now() } : q); },
};
const draft = editDraft(original);
draft.fields.body = 'Solve $x=3$.';
assert.equal(original.body, 'Solve $x=2$.');
assert.deepEqual(validateDraft(draft), []);
assert.equal(commitDraft(draft, bank), original.id);
assert.deepEqual(calls, ['update']);
assert.equal(bank.questions[0].createdAt, original.createdAt);
assert.ok(bank.questions[0].updatedAt! > 20);
assert.equal(bank.questions[0].checked, undefined);
assert.equal(bank.questions[0].renderError, undefined);
assert.equal(bank.questions[0].algorithmSeed, 100);
assert.deepEqual(bank.questions[0].choices, original.choices);
assert.equal(bank.questions[0].answer, 'B');
assert.throws(() => commitDraft(draft, bank), /changed after/);
const copy = duplicateDraft(editDraft(bank.questions[0]));
assert.notEqual(copy.id, draft.id);
assert.equal(copy.sourceId, undefined);
assert.equal(copy.original?.algorithmSeed, undefined);
assert.equal(copy.original?.algorithmVariant, undefined);
const newId = commitDraft(copy, bank);
assert.notEqual(newId, original.id);
assert.ok(bank.questions[1].createdAt > original.createdAt);
copy.fields.choices!.A = 'changed';
assert.equal(bank.questions[1].choices!.A, '$1$');
const written = editDraft(bank.questions[0]);
written.mcq = false;
const writtenData = questionData(written);
assert.equal(writtenData.answer, undefined);
assert.equal(writtenData.choices, undefined);
assert.equal(writtenData.solution, '$x=2$');
assert.deepEqual(rearrangeChoices(original.choices!, 'B', ['C', 'A', 'B']), { choices: { A: '$3$', B: '$1$', C: '$2$' }, answer: 'C' });
assert.equal(rearrangeChoices(original.choices!, 'B', ['A', 'C']).answer, '');
const incomplete = newDraft({ classId: 'class', unitId: '1', sectionId: '1.1', points: undefined, tagInput: 'test' });
incomplete.fields.body = '$unfinished';
assert.ok(validateDraft(incomplete).length);
incomplete.fields.points = 0;
assert.deepEqual(validateDraft(incomplete), []); // invalid Typst is separate from save validation
incomplete.mcq = true;
incomplete.fields.choices = { A: '', B: 'text' };
assert.equal(validateDraft(incomplete).length, 2);
const storageMap = new Map<string, string>();
const storage = { getItem: (key: string) => storageMap.get(key) ?? null, setItem: (key: string, value: string) => { storageMap.set(key, value); } };
const session: EditorSession = { version: 1, defaults: { classId: 'class', unitId: '1', sectionId: '1.1', points: 3, tagInput: 'algebra' }, drafts: [incomplete], activeId: incomplete.id };
saveSession(storage, 'bank-a', session);
assert.deepEqual(loadSession(storage, 'bank-a'), session);
assert.equal(loadSession(storage, 'bank-b').drafts.length, 0);
const blank = newDraft(session.defaults);
assert.equal(blank.fields.sectionId, '1.1');
blank.fields.sectionId = '2';
assert.equal(session.defaults.sectionId, '1.1');
const multipart: Question = { id: 'parts', body: 'stem', points: 2, tags: [], createdAt: 1, parts: { stem: 'stem', items: [{ body: 'first' }, { body: 'second' }] } };
const partsDraft = editDraft(multipart);
assert.deepEqual(questionData(partsDraft).parts, multipart.parts);
partsDraft.fields.body += '\nAn edit';
assert.equal(questionData(partsDraft).parts, undefined);
const imported = importDraft({ body: 'stem', parts: multipart.parts, answer: '', solution: '', points: 2, tagInput: '', classId: '', unitId: '', sectionId: '', rawLatex: 'raw' });
assert.deepEqual(questionData(imported).parts, multipart.parts);
assert.equal('rawLatex' in questionData(imported), false);
const checkedOnly = editDraft(bank.questions[0]);
bank.questions[0].checked = true;
commitDraft(checkedOnly, bank);
const entries = exportAppDataToRepoEntries({ questions: bank.questions, narratives: [], customClasses: [], savedTests: [], images: [{ name: 'figure', ext: 'png', bytes: new Uint8Array([1, 2, 3]) }] });
const restored = importRepoEntriesToAppData(entries).appData;
const restoredOriginal = restored.questions.find(q => q.id === original.id)!;
assert.equal(restoredOriginal.id, original.id);
assert.deepEqual(restoredOriginal.choices, original.choices);
assert.equal(restoredOriginal.answer, 'B');
assert.equal(restoredOriginal.solution, '$x=2$');
console.log('Editor logic: identity, MCQ, drafts, defaults, duplication, parts, conflicts and repository round-trip passed.');
