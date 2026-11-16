import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? '');
if (!process.argv[2]) {
  console.error('Usage: node scripts/repair-grade9-report-language.mjs /path/to/TestGen');
  process.exit(2);
}

const catalogPath = path.join(root, 'curriculum', 'catalog.json');
const languagePath = path.join(root, 'curriculum', 'comment-language.json');
const [catalog, language] = await Promise.all([
  readFile(catalogPath, 'utf8').then(JSON.parse),
  readFile(languagePath, 'utf8').then(JSON.parse),
]);

// Parent-readable action phrases for the Manitoba Grade 9 draft outcomes. These
// complete both “can …” and “when asked to …” in curricular report comments.
const nicknames = {
  'MAT.9.1.A.1': 'work with powers that have integral bases and whole-number exponents',
  'MAT.9.1.A.2': 'use prime factorization, greatest common factors, least common multiples, and divisibility',
  'MAT.9.1.A.3': 'apply the laws of exponents to integral bases and whole-number exponents',
  'MAT.9.1.A.4': 'evaluate integer expressions using the order of operations, including powers',
  'MAT.9.1.A.5': 'compare and order rational numbers',
  'MAT.9.1.A.6': 'perform operations with rational numbers',
  'MAT.9.1.B.1': 'generalize linear patterns using equations',
  'MAT.9.1.B.2': 'graph and analyze linear relations, including slope, intercepts, and predictions',
  'MAT.9.1.B.3': 'solve basic linear equations with rational coefficients',
  'MAT.9.1.B.4': 'work with polynomials of degree at most two',
  'MAT.9.1.B.5': 'add and subtract polynomial expressions of degree at most two',
  'MAT.9.1.B.6': 'solve extended linear-equation forms with integer coefficients',
  'MAT.9.1.C.1': 'solve and justify problems using circle properties',
  'MAT.9.1.D.1': 'analyze bias and social considerations in data collection and presentation',
  'MAT.9.1.D.2': 'select and justify a population or sample',
  'MAT.9.1.D.3': 'explain the role of probability in society',
  'MAT.9.1.E.1': 'calculate gross and net earnings and deductions',
  'MAT.9.1.E.2': 'analyze factors that influence personal spending decisions',
  'MAT.9.1.E.3': 'compare payment methods and access to credit when making spending decisions',
  'MAT.9.1.E.4': 'compare financial service providers, products, and services',
  'MAT.9.1.E.5': 'create budgets and set saving habits and financial goals',
  'MAT.9.2.A.1': 'calculate square roots of positive rational perfect squares',
  'MAT.9.2.A.2': 'approximate square roots of positive rational non-perfect squares',
  'MAT.9.2.A.3': 'apply integer exponents, including negative exponents, to natural-number bases',
  'MAT.9.2.A.4': 'express place values from 0.001 to 1,000,000 using exponential notation',
  'MAT.9.2.A.5': 'evaluate rational-number expressions using the order of operations, including powers',
  'MAT.9.2.B.1': 'represent and analyze exponential patterns and relations',
  'MAT.9.2.B.2': 'solve extended linear-equation forms with rational coefficients',
  'MAT.9.2.B.3': 'solve and represent single-variable linear inequalities',
  'MAT.9.2.B.4': 'multiply and divide polynomial expressions by monomials and binomials',
  'MAT.9.2.C.1': 'calculate the surface area of composite three-dimensional objects',
  'MAT.9.2.C.2': 'analyze the similarity of polygons',
  'MAT.9.2.C.3': 'draw and interpret scale diagrams',
  'MAT.9.2.C.4': 'identify line and rotational symmetry',
  'MAT.9.2.D.1': 'plan and carry out data collection, display, and analysis',
  'MAT.9.2.D.2': 'determine sample spaces and theoretical probabilities for two dependent events',
  'MAT.9.2.D.3': 'experiment with dependent events and compare probabilities',
  'MAT.9.2.E.1': 'analyze how education and career choices affect future income and lifestyle',
  'MAT.9.2.E.2': 'compare borrowing options and their financial effects',
  'MAT.9.2.E.3': 'make informed credit and repayment decisions and explain credit scores',
  'MAT.9.2.E.4': 'compare investments by returns, tax, volatility, and fraud risk',
  'MAT.9.2.E.5': 'calculate investment growth or loss using simple and compound interest',
};

language.schemaVersion ??= 1;
language.outcomes ??= {};
const now = Date.now();
let added = 0;
let preserved = 0;
for (const course of catalog.courses ?? []) for (const unit of course.units ?? []) for (const section of unit.sections ?? []) {
  const nickname = nicknames[section.id];
  if (!nickname) continue;
  const key = JSON.stringify([course.id, unit.id, section.id, null]);
  const current = language.outcomes[key] ?? {};
  if (typeof current.nickname === 'string' && current.nickname.trim()) {
    preserved++;
    continue;
  }
  language.outcomes[key] = { ...current, nickname, updatedAt: now };
  added++;
}

if (!added) {
  console.log(`No changes needed; preserved ${preserved} existing Grade 9 nicknames.`);
  process.exit(0);
}

language.updatedAt = now;
const stamp = new Date(now).toISOString().replaceAll(':', '-');
const backupDir = path.join(root, 'backups', `curriculum-report-language-before-${stamp}`);
await mkdir(backupDir, { recursive: true });
await copyFile(languagePath, path.join(backupDir, 'comment-language.json'));
await writeFile(languagePath, `${JSON.stringify(language, null, 2)}\n`);
console.log(`Added ${added} Grade 9 report-language nicknames; preserved ${preserved} existing nicknames.`);
console.log(`Backup: ${backupDir}`);
