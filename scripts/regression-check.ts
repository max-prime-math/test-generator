import assert from 'node:assert/strict';
import { normalizeMiTeXOutput, stripDocumentWrappers } from '../src/lib/latex-normalize.ts';
import { stripLeadingAnswerLabel } from '../src/lib/ingest-helpers.ts';

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

console.log('regression checks passed');
