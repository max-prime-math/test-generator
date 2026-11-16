import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const rootArg = process.argv.slice(2).find(argument => !argument.startsWith('--'));
if (!rootArg) {
  console.error('Usage: node scripts/migrate-written-next-steps-to-indicators.mjs /path/to/TestGen [--apply]');
  process.exit(2);
}
const apply = process.argv.includes('--apply');
const root = path.resolve(rootArg);
const catalogPath = path.join(root, 'curriculum', 'catalog.json');
const languagePath = path.join(root, 'curriculum', 'comment-language.json');
const [catalog, language] = await Promise.all([
  readFile(catalogPath, 'utf8').then(JSON.parse),
  readFile(languagePath, 'utf8').then(JSON.parse),
]);

// Existing written recommendations were authored for these outcome-level skills.
// Choose the closest official indicator within that exact outcome placement.
const sectionTargets = {
  '10I.A.4': '10I.A.4.5',
  '10I.R.5': '10I.R.5.6',
  '10I.R.6': '10I.R.6.1',
  '10I.R.7': '10I.R.7.2',
  '10I.R.9': '10I.R.9.7',
  '12P.R.1': '12P.R.1.3',
  '12P.R.11': '12P.R.11.5',
  '12P.R.12': '12P.R.12.5',
  '12P.R.13': '12P.R.13.2',
  '12P.R.14': '12P.R.14.4',
  '12P.R.2': '12P.R.2.3',
  '12P.R.3': '12P.R.3.3',
  '12P.R.4': '12P.R.4.1',
  '12P.R.5': '12P.R.5.3',
  '12P.R.6': '12P.R.6.4',
  'MAT.9.1.A.5': '9.N.3.1',
  'MAT.9.1.A.6': '9.N.3.3',
  'ap-topic-2-2': 'CHA-2.B',
};

const sections = new Map();
for (const course of catalog.courses ?? []) for (const unit of course.units ?? []) for (const section of unit.sections ?? []) {
  sections.set(JSON.stringify([course.id, unit.id, section.id]), { course, unit, section });
}

const tokens = value => new Set(String(value).toLocaleLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, ' ').split(/\s+/)
  .filter(word => word.length > 2 && !['the', 'and', 'for', 'with', 'from', 'into', 'using', 'practice', 'review', 'how'].includes(word))
  .map(word => word.replace(/(ing|ed|es|s)$/u, '')));
function similarity(left, right) {
  const a = tokens(left), b = tokens(right);
  let shared = 0;
  for (const word of a) if (b.has(word)) shared++;
  return shared / Math.sqrt(Math.max(1, a.size * b.size));
}

const now = Date.now();
const decisions = [];
for (const [key, entry] of Object.entries(language.outcomes ?? {})) {
  if (!entry?.nextStep?.trim() || entry.nextStepIndicator) continue;
  const [classId, unitId, sectionId, indicatorId] = JSON.parse(key);
  const placement = sections.get(JSON.stringify([classId, unitId, sectionId]));
  const indicators = placement?.section?.indicators ?? [];
  let target = indicatorId ? indicators.find(indicator => indicator.id === indicatorId) : undefined;
  let reason = target ? 'same indicator' : '';
  if (!target && sectionTargets[sectionId]) {
    target = indicators.find(indicator => indicator.id === sectionTargets[sectionId]);
    if (target) reason = 'reviewed outcome mapping';
  }
  if (!target && indicators.length === 1) {
    target = indicators[0];
    reason = 'only indicator for outcome';
  }
  if (!target && indicators.length) {
    target = [...indicators].sort((left, right) => similarity(entry.nextStep, right.text) - similarity(entry.nextStep, left.text))[0];
    reason = 'closest indicator wording';
  }
  if (target) {
    entry.nextStepIndicator = { classId, unitId, sectionId, indicatorId: target.id };
    decisions.push({ key, previous: entry.nextStep, target: target.id, reason });
  } else {
    decisions.push({ key, previous: entry.nextStep, target: null, reason: 'no defensible indicator exists' });
  }
  delete entry.nextStep;
  entry.updatedAt = now;
}

const linked = decisions.filter(decision => decision.target);
const cleared = decisions.filter(decision => !decision.target);
for (const decision of decisions) console.log(`${decision.target ?? 'CLEARED'}\t${decision.reason}\t${decision.key}\t${decision.previous}`);
console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', linked: linked.length, cleared: cleared.length }, null, 2));
if (!apply || !decisions.length) process.exit(0);

language.updatedAt = now;
const stamp = new Date(now).toISOString().replaceAll(':', '-');
const backupDir = path.join(root, 'backups', `written-next-steps-before-${stamp}`);
await mkdir(backupDir, { recursive: true });
await copyFile(languagePath, path.join(backupDir, 'comment-language.json'));
await writeFile(languagePath, `${JSON.stringify(language, null, 2)}\n`);
console.log(`Backup: ${backupDir}`);
