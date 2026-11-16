import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? '');
if (!process.argv[2]) {
  console.error('Usage: node scripts/populate-indicator-report-language.mjs /path/to/TestGen');
  process.exit(2);
}

const catalogPath = path.join(root, 'curriculum', 'catalog.json');
const languagePath = path.join(root, 'curriculum', 'comment-language.json');
const [catalog, language] = await Promise.all([
  readFile(catalogPath, 'utf8').then(JSON.parse),
  readFile(languagePath, 'utf8').then(JSON.parse),
]);

/** Turn official curriculum prose into a concise verb phrase that follows “can” or “next step is to”. */
function parentReadableIndicator(text) {
  let phrase = String(text).replace(/\s+/g, ' ').trim().replace(/[.!?]+$/, '');
  phrase = phrase.replace(/^Determine,? with technology,? /i, 'use technology to determine ')
    .replace(/^Verify,? with examples,? /i, 'use examples to verify ')
    .replace(/^Explain,? using examples,? /i, 'use examples to explain ')
    .replace(/^Demonstrate an understanding of /i, 'show understanding of ')
    .replace(/^Provide examples of /i, 'give examples of ')
    .replace(/^Solve (?:a )?problems? that involves? /i, 'solve problems involving ')
    .replace(/\ba problem that involves\b/gi, 'problems involving')
    .replace(/\bproblems that involve\b/gi, 'problems involving')
    .replace(/\bconcretely, pictorially, and symbolically\b/gi, 'using models, pictures, and symbols')
    .replace(/\bconcrete, pictorial, and symbolic representations\b/gi, 'models, pictures, and symbols')
    .replace(/\bnumerical and algebraic examples\b/gi, 'number and algebra examples');
  return /^[A-Z][a-z]/.test(phrase) ? phrase[0].toLocaleLowerCase() + phrase.slice(1) : phrase;
}

language.schemaVersion = 2;
language.outcomes ??= {};
const now = Date.now();
let added = 0;
let preserved = 0;
let total = 0;
for (const course of catalog.courses ?? []) for (const unit of course.units ?? []) for (const section of unit.sections ?? []) {
  for (const indicator of section.indicators ?? []) {
    total++;
    const key = JSON.stringify([course.id, unit.id, section.id, indicator.id]);
    const current = language.outcomes[key] ?? {};
    if (typeof current.nickname === 'string' && current.nickname.trim()) {
      preserved++;
      continue;
    }
    language.outcomes[key] = { ...current, nickname: parentReadableIndicator(indicator.text), updatedAt: now };
    added++;
  }
}

if (!added) {
  console.log(`No changes needed; all ${total} indicator placements already have report nicknames.`);
  process.exit(0);
}

language.updatedAt = now;
const stamp = new Date(now).toISOString().replaceAll(':', '-');
const backupDir = path.join(root, 'backups', `indicator-report-language-before-${stamp}`);
await mkdir(backupDir, { recursive: true });
await copyFile(languagePath, path.join(backupDir, 'comment-language.json'));
await writeFile(languagePath, `${JSON.stringify(language, null, 2)}\n`);
console.log(`Added ${added} parent-readable indicator nicknames; preserved ${preserved} existing nicknames (${total} placements total).`);
console.log(`Backup: ${backupDir}`);
