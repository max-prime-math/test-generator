import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.argv[2];
if (!root) throw new Error('Supply the TestGen workspace path');
const file = path.join(root, 'curriculum/comment-language.json');
const data = JSON.parse(await readFile(file, 'utf8'));

const outcomes = {
  'extension-of:MAT.9.1.B.2': 'extend skills with graphs, slopes, intercepts, and predictions',
  '10I.M.4': 'use trigonometric ratios to solve right-triangle problems',
  '11P.R.11': 'graph and analyze reciprocal functions',
  '11P.R.4': 'analyze quadratic functions in standard form',
  '11P.R.3': 'analyze quadratic functions in vertex form',
  '11P.R.6': 'solve systems containing linear and quadratic equations',
  '12P.T.3': 'use the six trigonometric ratios in degrees and radians',
  '12P.T.5': 'solve trigonometric equations algebraically and graphically',
  '12P.T.6': 'prove trigonometric identities',
  '12P.P.4': 'expand powers using the binomial theorem',
  '12P.P.3': 'calculate combinations and use them to solve problems',
  '11P.R.2': 'graph and analyze absolute value functions',
  '12A.P.2': 'solve probability problems involving overlapping or separate events',
  'A6': 'analyze the period, amplitude, and asymptotes of trigonometric graphs',
  'F2': 'convert conic equations between general and standard form',
  '10I.A.1': 'work with prime factors, common factors, multiples, and roots',
  '10I.A.5': 'factor polynomials using common factors and trinomial patterns',
  '10I.R.6': 'connect different forms of linear equations to their graphs',
  '10I.M.3': 'solve surface-area and volume problems involving three-dimensional objects',
  '10I.R.3': 'work with slope, rates of change, and parallel or perpendicular lines',
  '10I.R.4': 'represent linear relations with words, tables, graphs, and equations',
  '10I.R.7': 'write linear equations from graphs, points, slopes, or scatterplots',
  '10I.R.9': 'solve systems of linear equations graphically and algebraically',
  '10I.A.2': 'represent, compare, and simplify irrational numbers',
  '10I.A.4': 'multiply polynomial expressions',
  '10I.R.10': 'solve problems involving distance and midpoint',
  '10I.R.5': 'analyze intercepts, slope, domain, and range of linear graphs',
  '10I.M.2': 'convert between SI and imperial measurements',
  '10I.M.1': 'solve linear-measurement problems using SI and imperial units',
  '12A.L.1': 'solve numerical and logic puzzles using reasoning strategies',
};

const indicators = {
  'FUN-6.F': 'integrate using linear partial fractions',
  '9.SS.1.1': 'explain circle properties involving chords, angles, tangents, and radii',
  '9.SS.1.4': "find an inscribed angle subtended by a circle's diameter",
  '9.SP.1.2': 'explain how bias, ethics, privacy, cost, and timing can influence data',
  '9.SP.2.2': 'give an example where using a full population is appropriate',
  '9.SP.2.3': 'explain why a full population cannot be used in a given situation',
  '9.SP.2.4': 'judge whether a sample can represent the full population',
  '9.SP.4.1': 'identify examples of probability used in the media',
  '9.SP.3.3': 'complete a data project, draw conclusions, and communicate the findings',
  '9.PR.4.8': 'compare how linear equations and linear inequalities are solved',
  '9.PR.4.9': 'compare solutions of linear equations and inequalities',
  '9.PR.4.10': 'verify an inequality solution by substitution',
  '11P.A.3.3': 'verify solutions to radical equations by substitution',
  '11P.A.6.3': 'identify extraneous solutions to rational equations',
  '11P.A.4.1': 'compare equivalent forms of rational expressions and rational numbers',
  '11P.T.2.6': 'find exact trigonometric ratios using reference angles',
  '11P.T.3.6': 'explain when an ambiguous triangle has zero, one, or two solutions',
  '11P.R.3.8': 'explain how a and q affect the number of x-intercepts',
  '11P.R.5.5': 'use the discriminant to determine the number of real roots',
  '11P.R.6.7': 'solve systems containing linear and quadratic equations',
  '11P.R.9.5': 'find terms and the common difference in an arithmetic sequence',
  '11P.R.10.4': 'find terms and the common ratio in a geometric sequence',
  '12P.T.1.2': 'explain the relationship between degrees and radians',
  '12P.T.4.9': 'write a sine or cosine equation from its graph',
  '12P.R.13.2': 'graph a transformed square-root function and state its domain and range',
  '12P.R.1.1': 'graph sums, differences, products, and quotients of functions',
  '12P.R.1.2': 'write sums, differences, products, and quotients of functions',
  '12P.P.2.2': 'calculate permutations using factorial notation',
  '10I.A.1.7': 'solve problems involving factors, multiples, and square or cube roots',
  '9.N.6.2': 'approximate a non-perfect square root using technology',
  '10I.A.3.3': 'apply exponent laws to expressions',
  '10I.R.2.4': 'explain how to recognize functions from graphs or ordered pairs',
  '10I.M.1.1': 'choose and explain familiar benchmarks for linear measurements',
  '10I.R.9.7': 'solve a linear system using an appropriate method',
};

const placementIndicators = {
  'ap-topic-1-6\u0000LIM-1.E': 'determine limits using algebraic simplification',
  'ap-topic-1-7\u0000AP-MP-1.C': 'select an appropriate procedure for evaluating a limit',
  'ap-topic-1-8\u0000LIM-1.E': 'determine limits using the squeeze theorem',
  'ap-topic-1-14\u0000LIM-2.D': 'connect infinite limits to vertical asymptotes',
  'ap-topic-1-15\u0000LIM-2.D': 'connect end behavior to horizontal asymptotes',
  'ap-topic-2-5\u0000FUN-3.A': 'differentiate powers using the power rule',
  'ap-topic-2-6\u0000FUN-3.A': 'differentiate sums, differences, and constant multiples',
  'ap-topic-2-8\u0000FUN-3.B': 'differentiate products using the product rule',
  'ap-topic-2-9\u0000FUN-3.B': 'differentiate quotients using the quotient rule',
  'ap-topic-3-5\u0000AP-MP-1.C': 'select an appropriate differentiation procedure',
  '12P.R.1\u000012P.R.1.3': 'find the domain and range of combined functions',
};

const now = Date.now();
let changed = 0;
for (const [key, entry] of Object.entries(data.outcomes)) {
  const [, , sectionId, indicatorId] = JSON.parse(key);
  const replacement = indicatorId === null ? outcomes[sectionId] : placementIndicators[`${sectionId}\u0000${indicatorId}`] ?? indicators[indicatorId];
  if (replacement && replacement !== entry.nickname) {
    entry.nickname = replacement;
    entry.updatedAt = now;
    changed++;
  } else if (indicatorId === null && /^confirm Continuity/u.test(entry.nickname ?? '')) {
    entry.nickname = entry.nickname.replace(/^confirm Continuity/u, 'verify continuity');
    entry.updatedAt = now;
    changed++;
  }
  if (indicatorId === null && sectionId === '10I.R.5' && entry.nextStepIndicator?.indicatorId === '10I.R.5.6') {
    entry.nextStepIndicator.indicatorId = '10I.R.5.1';
    entry.updatedAt = now;
    changed++;
  }
}
const backup = path.join(root, 'backups', `parent-readable-polish-before-${new Date(now).toISOString().replaceAll(':', '-')}`);
await mkdir(backup, { recursive: true });
await copyFile(file, path.join(backup, 'comment-language.json'));
data.updatedAt = now;
await writeFile(file, JSON.stringify(data, null, 2) + '\n');
console.log(JSON.stringify({ changed, backup }, null, 2));
