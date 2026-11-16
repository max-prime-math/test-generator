import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const [rootArg, draftArg] = process.argv.slice(2);
if (!rootArg || !draftArg) throw new Error('Usage: node scripts/complete-parent-readable-language.mjs /path/to/TestGen /path/to/indicator-draft.json');
const root = path.resolve(rootArg);
const catalogPath = path.join(root, 'curriculum/catalog.json');
const languagePath = path.join(root, 'curriculum/comment-language.json');
const [catalog, language, draft] = await Promise.all([
  readFile(catalogPath, 'utf8').then(JSON.parse),
  readFile(languagePath, 'utf8').then(JSON.parse),
  readFile(draftArg, 'utf8').then(JSON.parse),
]);

const indicatorOverrides = {
  'FUN-6.F': 'integrate using linear partial fractions',
  '9.SS.1.1': 'explain circle properties involving chords, angles, tangents, and radii',
  '9.SS.1.4': "find an inscribed angle subtended by a circle's diameter",
  '9.SP.2.2': 'give an example where using a full population is appropriate',
  '9.SP.4.1': 'identify examples of probability used in the media',
  '9.SP.3.3': 'complete a data project, draw conclusions, and communicate the findings',
  '11P.R.5.5': 'use the discriminant to determine the number of real roots',
  '12P.T.1.2': 'explain the relationship between degrees and radians',
  '12P.P.2.2': 'calculate permutations using factorial notation',
  '10I.A.1.7': 'solve problems involving factors, multiples, and square or cube roots',
  '10I.M.1.1': 'choose and explain familiar benchmarks for linear measurements',
  '10I.R.9.7': 'solve a linear system using an appropriate method',
};

function lowerFirst(value) {
  const text = value.trim().replace(/[.!?]+$/u, '');
  return /^[A-Z][a-z]/.test(text) ? text[0].toLocaleLowerCase() + text.slice(1) : text;
}

function parentReadableOutcome(section) {
  let text = String(section.name).replace(/^\s*(?:\d+(?:\.\d+)*|P\.\d+)\s+/u, '').trim();
  text = text.replace(/^[\w.-]+:\s*/u, '');
  const support = text.match(/^(Prerequisite for|Extension of)\s+[^—]+—\s*(.+)$/u);
  if (support) return `${support[1] === 'Prerequisite for' ? 'review' : 'extend understanding of'} ${lowerFirst(support[2])}`;
  const exact = {
    'Introducing Calculus: Can Change Occur at an Instant?': 'understand instantaneous change',
    'Function Graphs and Transformations': 'graph and transform functions',
    'Trigonometric Functions': 'work with trigonometric functions',
    'Algebra, Exponential and Logarithmic Functions': 'work with algebraic, exponential, and logarithmic functions',
    'The Product Rule': 'differentiate products using the product rule',
    'The Quotient Rule': 'differentiate quotients using the quotient rule',
    'The Chain Rule': 'differentiate composite functions using the chain rule',
    'Implicit Differentiation': 'differentiate implicitly defined relations',
    'The Distributive Property': 'use the distributive property',
    'The Pythagorean Theorem': 'use the Pythagorean theorem',
    'Area': 'calculate area',
    'Approximations': 'estimate and approximate values',
    'Custom Limits and Continuity Drafts': 'work with limits and continuity',
  };
  if (exact[text]) return exact[text];
  text = text
    .replace(/^Demonstrate an understanding of\s+/iu, 'work with ')
    .replace(/^Introduction to\s+/iu, 'work with ')
    .replace(/^What Is a\s+/iu, 'understand ')
    .replace(/^What Is\s+/iu, 'understand ')
    .replace(/^Defining\s+/iu, 'define ')
    .replace(/^Differentiating\s+/iu, 'differentiate ')
    .replace(/^Derivatives of\s+/iu, 'differentiate ')
    .replace(/^Estimating\s+/iu, 'estimate ')
    .replace(/^Determining\s+/iu, 'determine ')
    .replace(/^Selecting\s+/iu, 'select ')
    .replace(/^Connecting\s+/iu, 'connect ')
    .replace(/^Exploring\s+/iu, 'explore ')
    .replace(/^Removing\s+/iu, 'remove ')
    .replace(/^Applying\s+/iu, 'apply ')
    .replace(/^Interpreting\s+/iu, 'interpret ')
    .replace(/^Solving\s+/iu, 'solve ')
    .replace(/^Finding\s+/iu, 'find ')
    .replace(/^Modeling\s+/iu, 'model ')
    .replace(/^Modelling\s+/iu, 'model ')
    .replace(/^Calculating\s+/iu, 'calculate ')
    .replace(/^Using\s+/iu, 'use ')
    .replace(/^Working with\s+/iu, 'work with ')
    .replace(/^Writing\s+/iu, 'write ')
    .replace(/^Adding\s+/iu, 'add ')
    .replace(/^Subtracting\s+/iu, 'subtract ')
    .replace(/^Multiplying\s+/iu, 'multiply ')
    .replace(/^Dividing\s+/iu, 'divide ')
    .replace(/^Relating\s+/iu, 'relate ')
    .replace(/^Matching\s+/iu, 'match ')
    .replace(/^Sketching\s+/iu, 'sketch ')
    .replace(/^Graphing\s+/iu, 'graph ')
    .replace(/^Representing\s+/iu, 'represent ')
    .replace(/^Expanding\s+/iu, 'expand ')
    .replace(/^Evaluating\s+/iu, 'evaluate ')
    .replace(/^Approximating\s+/iu, 'approximate ')
    .replace(/^Confirming\s+/iu, 'confirm ');
  return lowerFirst(text).replace(/\s+/g, ' ');
}

const draftByOfficial = new Map(draft.map(item => [String(item.officialText).trim(), lowerFirst(item.after)]));
const now = Date.now();
let indicators = 0, outcomes = 0;
for (const course of catalog.courses ?? []) {
  const contest = course.id === 'comc' || course.id.startsWith('cemc');
  for (const unit of course.units ?? []) for (const section of unit.sections ?? []) {
    const sectionKey = JSON.stringify([course.id, unit.id, section.id, null]);
    if (!contest && !language.outcomes[sectionKey]?.nickname) {
      language.outcomes[sectionKey] = { ...(language.outcomes[sectionKey] ?? {}), nickname: parentReadableOutcome(section), updatedAt: now };
      outcomes++;
    }
    for (const indicator of section.indicators ?? []) {
      const key = JSON.stringify([course.id, unit.id, section.id, indicator.id]);
      const entry = language.outcomes[key];
      if (!entry?.nickname) continue;
      const replacement = indicatorOverrides[indicator.id] ?? draftByOfficial.get(String(indicator.text).trim());
      if (!replacement || entry.nickname.length <= 90 || replacement === entry.nickname) continue;
      language.outcomes[key] = { ...entry, nickname: replacement, updatedAt: now };
      indicators++;
    }
  }
}

language.schemaVersion = 2;
language.updatedAt = now;
const backup = path.join(root, 'backups', `parent-readable-language-before-${new Date(now).toISOString().replaceAll(':', '-')}`);
await mkdir(backup, { recursive: true });
await copyFile(languagePath, path.join(backup, 'comment-language.json'));
await writeFile(languagePath, JSON.stringify(language, null, 2) + '\n');
console.log(JSON.stringify({ outcomes, indicators, backup }, null, 2));
