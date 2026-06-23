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
    images: ['diagram.png', 'assets/graph-one.svg', '/imgs/photo%201.jpg'],
  },
]));
assert.ok(bulkImportArray);
assert.equal(bulkImportArray?.error, null);
assert.equal(bulkImportArray?.questions.length, 1);
assert.equal(bulkImportArray?.questions[0].tagInput, 'limits, derivatives');
assert.deepEqual(bulkImportArray?.questions[0].images, ['diagram', 'graph-one', 'photo 1']);

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

const pqpImport = parseBulkImportJson(JSON.stringify({
  format: 'portable-question-package',
  version: '1.0',
  producer: { app: 'bnk-decoder', exportedAt: '2026-05-15T18:30:00Z' },
  assets: [
    {
      id: 'asset-1',
      kind: 'image',
      filename: 'diagram-1.png',
      storage: { mode: 'external', path: 'assets/diagram-1.png' },
    },
  ],
  questions: [
    {
      id: 'q-1',
      kind: 'mcq',
      content: {
        stem: { format: 'latex', text: 'What is $1+1$?' },
        solution: { format: 'latex', text: 'It equals $2$.' },
        choices: [
          { id: 'A', body: { format: 'latex', text: '$1$' } },
          { id: 'B', body: { format: 'latex', text: '$2$' } },
        ],
      },
      answer: { type: 'choice', value: 'B' },
      scoring: { points: 2 },
      classification: {
        questionType: 'mcq',
        tags: ['arithmetic', 'practice'],
        classId: 'demo-class',
        className: 'Demo Class',
        unitId: '1',
        unitName: 'Unit 1',
        sectionId: '1.1',
        sectionName: 'Section 1.1',
      },
      assets: ['asset-1'],
      extensions: {
        algorithmModel: {
          scope: { kind: 'question' },
          definitions: [
            {
              id: 'alg-1',
              name: 'a',
              kind: 'variable',
              rawExpression: 'range(-3,3)',
              sampleValue: '-1',
              dependencies: [],
              source: 'examview-algorithm',
            },
          ],
          sequence: [],
          source: 'examview-algorithm',
        },
        graphModel: {
          family: 'number-line',
          objects: [
            {
              id: 'ray-1',
              kind: 'ray',
              expression: 'x < -1',
              ray: {
                endpoint: '-1',
                direction: 'left',
                endpointStyle: 'hollow',
                labelStyle: 'coordinates',
              },
              samplePoints: [{ x: -1, y: 0 }],
            },
          ],
          rawExpressions: ['x < -1'],
          source: 'structured-object-heuristic',
        },
        graphTypst: 'Graph: number-line',
        decodeDiagnostics: [
          { level: 'info', code: 'GRAPH_RECOVERED', message: 'Recovered number-line ray.' },
        ],
      },
    },
  ],
}));
assert.ok(pqpImport);
assert.equal(pqpImport?.error, null);
assert.equal(pqpImport?.questions.length, 1);
assert.equal(pqpImport?.questions[0].body, 'What is $1+1$?');
assert.equal(pqpImport?.questions[0].answer, 'B');
assert.equal(pqpImport?.questions[0].points, 2);
assert.equal(pqpImport?.questions[0].tagInput, 'arithmetic, practice');
assert.equal(pqpImport?.questions[0].classId, 'demo-class');
assert.equal(pqpImport?.questions[0].className, 'Demo Class');
assert.equal(pqpImport?.questions[0].unitName, 'Unit 1');
assert.equal(pqpImport?.questions[0].sectionName, 'Section 1.1');
assert.equal(pqpImport?.questions[0].images?.[0], 'diagram-1');
assert.equal(pqpImport?.questions[0].algorithmModel?.definitions[0].name, 'a');
assert.equal(pqpImport?.questions[0].graphModel?.objects[0].kind, 'ray');
assert.equal(pqpImport?.questions[0].graphModel?.objects[0].ray?.endpoint, '-1');
assert.equal(pqpImport?.questions[0].graphTypst, 'Graph: number-line');
assert.equal(pqpImport?.questions[0].decodeDiagnostics?.[0].code, 'GRAPH_RECOVERED');

const pqpOutcomeImport = parseBulkImportJson(JSON.stringify({
  format: 'portable-question-package',
  version: '1.0',
  questions: [
    {
      id: 'q-outcome',
      kind: 'frq',
      content: {
        stem: { format: 'typst', text: 'Convert $25^(degree)$ to radians.' },
      },
      scoring: { points: 1 },
      classification: {
        classId: 'pre-calculus-40s',
        className: 'Pre-Calculus 40S',
        unitName: 'Outcome T',
        sectionName: 'T1',
        extensions: {
          curriculum: {
            outcomeCode: '12P.T.1',
            slo: 'Demonstrate an understanding of angles in standard position, expressed in degrees and radians.',
          },
        },
      },
    },
  ],
}));
assert.ok(pqpOutcomeImport);
assert.equal(pqpOutcomeImport?.error, null);
assert.equal(pqpOutcomeImport?.questions[0].classId, 'pre-calculus-40s');
assert.equal(pqpOutcomeImport?.questions[0].className, 'Pre-Calculus 40S');
assert.equal(pqpOutcomeImport?.questions[0].unitId, '12P.T');
assert.equal(pqpOutcomeImport?.questions[0].unitName, 'Outcome T');
assert.equal(pqpOutcomeImport?.questions[0].sectionId, '12P.T.1');
assert.equal(
  pqpOutcomeImport?.questions[0].sectionName,
  '12P.T.1: Demonstrate an understanding of angles in standard position, expressed in degrees and radians.',
);

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
