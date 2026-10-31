import assert from 'node:assert/strict';
import { defaultTestConfig, type Question } from '../src/lib/types.ts';
import { DOCUMENT_FONTS, documentFontRules } from '../src/lib/typst/document-fonts.ts';
import { generateAnswerKeyPage, generateBankReviewTypst, generateTypst, generateVersionedAnswerKeyPage } from '../src/lib/typst/template.ts';

assert.equal(DOCUMENT_FONTS.length, 12);
assert.equal(new Set(DOCUMENT_FONTS.map(option => option.id)).size, DOCUMENT_FONTS.length);
assert.match(documentFontRules(undefined, 11), /font: "New Computer Modern"/);
assert.match(documentFontRules('unknown-font', 11), /font: "New Computer Modern"/, 'unknown saved values recover to the legacy default');

const question: Question = {
  id: 'font-q',
  body: '#block[#set text(font: "Patrick Hand")\nLocal handwritten work: -5x = 6]',
  solution: 'A complete solution with $x = 11$.',
  points: 2,
  tags: [],
  createdAt: 1,
};
const config = {
  ...defaultTestConfig('Font test'),
  documentFont: 'stix-two-text',
  selectedIds: [question.id],
  showAnswerKey: true,
};
const expectedText = '#set text(font: "STIX Two Text", size: 11pt)';
const expectedMath = '#show math.equation: set text(font: "STIX Two Math")';
const documents = [
  generateTypst(config, [question]),
  generateAnswerKeyPage(config, [question])!,
  generateVersionedAnswerKeyPage([{ label: 'A', config }], [question])!,
  generateBankReviewTypst(config, [question]),
];
for (const source of documents) {
  assert.ok(source.includes(expectedText), 'the selected text font reaches every document path');
  assert.ok(source.includes(expectedMath), 'the selected math font reaches every document path');
}
const test = documents[0];
assert.match(test, /#set text\(font: "Patrick Hand"\)/, 'question-level font overrides remain in the generated document');
assert.ok(test.indexOf('STIX Two Text') < test.indexOf('Patrick Hand'), 'the question override is downstream of the document default');

console.log('Document fonts passed: 12 choices, legacy fallback, all output paths, matching math, and local question overrides.');
