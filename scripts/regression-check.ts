import assert from 'node:assert/strict';
import { formatBody } from '../src/lib/question-format.ts';
import { cleanupResidualMath, normalizeMiTeXOutput, stripDocumentWrappers } from '../src/lib/latex-normalize.ts';
import { convertLatexLineBreaks, convertPartsEnvironment, stripLeadingAnswerLabel } from '../src/lib/ingest-helpers.ts';
import { parseBulkImportJson } from '../src/lib/bulk-import.ts';

const wrapped = String.raw`\documentclass{article}
\usepackage{amsmath}
\begin{document}
\begin{center}
\section{Intro}
If $f \bigg(x\bigg)$ is defined, then $B i g$ and $b i g g$ should not leak.
\end{center}
\end{document}`;

const stripped = stripDocumentWrappers(wrapped);
assert.ok(!stripped.includes('\\documentclass'));
assert.ok(!stripped.includes('\\usepackage'));
assert.ok(!stripped.includes('\\begin{document}'));
assert.ok(!stripped.includes('\\end{document}'));
assert.ok(!stripped.includes('\\begin{center}'));
assert.ok(!stripped.includes('\\section{Intro}'));

const normalized = normalizeMiTeXOutput(String.raw`lr((frac(mitexsqrt(2 x + 5 ) - mitexsqrt(x + 7 ),x - 2 ))) B i g bigg`);
assert.equal(normalized, '(frac(sqrt(2 x + 5) - sqrt(x + 7),x - 2)) B i g');

const labeled = stripLeadingAnswerLabel('B Need to have $lim_(x -> 2) f(x) = f(2) = k$.');
assert.equal(labeled.letter, 'B');
assert.equal(labeled.text, 'Need to have $lim_(x -> 2) f(x) = f(2) = k$.');

const escaped = cleanupResidualMath(normalizeMiTeXOutput(String.raw`\left( \frac{1}{2} \right) \int_(pi \/4)^(pi \/2) frac(cos x, sin x) d x`));
assert.equal(escaped, '(frac(1, 2)) integral_(pi /4)^(pi /2) frac(cos x, sin x) d x');

const fourChoiceBody = formatBody('stem', { A: 'one', B: 'two', C: 'three', D: 'four' });
assert.ok(fourChoiceBody.includes('columns: (1fr, 1fr, 1fr, 1fr)'));

const fiveChoiceBody = formatBody('stem', { A: 'one', B: 'two', C: 'three', D: 'four', E: 'five' });
assert.ok(fiveChoiceBody.includes('columns: (1fr, 1fr, 1fr)'));

const bulkImportArray = parseBulkImportJson(JSON.stringify([
  {
    body: 'Find $x$.',
    answer: '',
    solution: 'x = 2',
    points: 3,
    tagInput: 'limits, derivatives',
    classId: 'ap-calc-bc',
    unitId: '1',
    sectionId: '1.1',
    images: ['diagram'],
  },
]));
assert.ok(bulkImportArray);
assert.equal(bulkImportArray?.error, null);
assert.equal(bulkImportArray?.questions.length, 1);
assert.equal(bulkImportArray?.questions[0].tagInput, 'limits, derivatives');

const bulkImportObject = parseBulkImportJson(JSON.stringify({
  source: 'example.json',
  questions: [
    {
      body: 'What is $1+1$?',
      points: '2',
      tags: ['arithmetic', 'practice'],
      solution: '',
    },
  ],
}));
assert.ok(bulkImportObject);
assert.equal(bulkImportObject?.questions.length, 1);
assert.equal(bulkImportObject?.questions[0].points, 2);
assert.equal(bulkImportObject?.questions[0].tagInput, 'arithmetic, practice');

const partsConverted = convertPartsEnvironment(String.raw`\begin{parts}
Show work.
\part First line
Second line

\part Second item
\end{parts}`);
assert.ok(partsConverted.includes('#block['));
assert.ok(partsConverted.includes('#set enum(numbering: "(a)"'));
assert.ok(partsConverted.includes('Show work.'));
assert.ok(partsConverted.includes('+ First line'));
assert.ok(partsConverted.includes('+ Second item'));

const solutionPartsConverted = convertPartsEnvironment(String.raw`Because:
\begin{parts}
\part First
\part Second
\end{parts}`);
assert.ok(solutionPartsConverted.includes('Because:'));
assert.ok(solutionPartsConverted.includes('+ First'));
assert.ok(solutionPartsConverted.includes('+ Second'));

const nestedPartsConverted = convertPartsEnvironment(String.raw`\begin{parts}
\part Outer one
\begin{subparts}
\subpart Inner i
\subpart Inner ii
\end{subparts}
\part Outer two
\end{parts}`);
assert.ok(nestedPartsConverted.includes('numbering: "(a)"'));
assert.ok(nestedPartsConverted.includes('numbering: "(i)"'));
assert.ok(nestedPartsConverted.includes('+ Outer one'));
assert.ok(nestedPartsConverted.includes('+ Inner i'));
assert.ok(nestedPartsConverted.includes('+ Outer two'));

assert.equal(convertLatexLineBreaks(String.raw`Line 1\\Line 2`), 'Line 1#linebreak()Line 2');
assert.equal(convertLatexLineBreaks(String.raw`Line 1\\[0.5em]Line 2`), 'Line 1#linebreak()Line 2');

console.log('regression checks passed');
