import { copyFile, mkdir, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { bankCurriculumDependencies } from '../src/lib/curriculum-dependencies.ts';
import { parseCurriculumCatalog } from '../src/lib/curriculum-library.ts';
import { hashRepoDataContent, repoDataContentByteLength } from '../src/git/repoDataModel.ts';
import type { Class, Question } from '../src/lib/types.ts';

const args = process.argv.slice(2);
const write = args.includes('--write');
const verifyOnly = args.includes('--verify');
const root = args.find(arg => !arg.startsWith('--'));
if (!root) throw new Error('Usage: node --experimental-strip-types scripts/migrate-bank-curriculum-dependencies.ts <workspace-root> [--write|--verify]');

const catalog = parseCurriculumCatalog(await readFile(join(root, 'curriculum', 'catalog.json'), 'utf8'));
const banksRoot = join(root, 'banks');
const bankNames = (await readdir(banksRoot, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
const REFERENCE_FIXES: Record<string, Record<string, Partial<Pick<Question, 'classId' | 'unitId' | 'sectionId' | 'indicators'>>>> = {
  'pre-calculus-12-examview': {
    'pc12-chapter-03-q046': { sectionId: '12P.R.12' },
    'pc12-chapter-03-q056': { sectionId: '12P.R.12' },
    'pc12-chapter-03-q058': { sectionId: '12P.R.12' },
  },
};
const audited: Array<{ bank: string; questions: Question[]; legacy: Class[]; emptySections: number; emptyUnits: number; emptyCourses: number }> = [];
const problems: string[] = [];

for (const bank of bankNames) {
  const bankRoot = join(banksRoot, bank);
  const index = JSON.parse(await readFile(join(bankRoot, 'questions', 'index.json'), 'utf8')) as { questions?: Array<{ filename: string }> };
  const questions: Question[] = [];
  for (const entry of index.questions ?? []) {
    const parsed = JSON.parse(await readFile(join(bankRoot, entry.filename), 'utf8')) as { question?: Question };
    if (!parsed.question) problems.push(`${bank}/${entry.filename}: missing question`);
    else {
      Object.assign(parsed.question, REFERENCE_FIXES[bank]?.[parsed.question.id] ?? {});
      questions.push(parsed.question);
    }
  }
  const legacyPath = join(bankRoot, 'curriculum', 'custom-classes.json');
  const legacyFile = await optionalText(legacyPath);
  const legacy = legacyFile ? (JSON.parse(legacyFile) as { classes?: Class[] }).classes ?? [] : [];
  const usedCourses = new Set(questions.flatMap(q => q.classId ? [q.classId] : []));
  const usedUnits = new Set(questions.filter(q => q.classId && q.unitId).map(q => JSON.stringify([q.classId, q.unitId])));
  const usedSections = new Set(questions.filter(q => q.classId && q.unitId && q.sectionId).map(q => JSON.stringify([q.classId, q.unitId, q.sectionId])));
  let emptySections = 0, emptyUnits = 0, emptyCourses = 0;
  for (const cls of legacy) {
    if (!usedCourses.has(cls.id)) emptyCourses++;
    for (const unit of cls.units) {
      if (!usedUnits.has(JSON.stringify([cls.id, unit.id]))) emptyUnits++;
      for (const section of unit.sections) if (!usedSections.has(JSON.stringify([cls.id, unit.id, section.id]))) emptySections++;
    }
  }
  validateReferences(bank, questions, catalog.courses, problems);
  audited.push({ bank, questions, legacy, emptySections, emptyUnits, emptyCourses });
}

if (problems.length) {
  console.error(`Found ${problems.length} unresolved question curriculum references; no files were changed:`);
  for (const problem of problems.slice(0, 100)) console.error(`- ${problem}`);
  if (problems.length > 100) console.error(`- and ${problems.length - 100} more`);
  process.exitCode = 2;
} else if (verifyOnly) {
  for (const item of audited) await verifyBank(item.bank);
  console.log(`Verified all ${audited.length} dependency-only bank manifests and file hashes.`);
} else {
  const totals = audited.reduce((sum, item) => ({ sections: sum.sections + item.emptySections, units: sum.units + item.emptyUnits, courses: sum.courses + item.emptyCourses }), { sections: 0, units: 0, courses: 0 });
  const fixCount = Object.values(REFERENCE_FIXES).reduce((sum, fixes) => sum + Object.keys(fixes).length, 0);
  console.log(`${write ? 'Migrating' : 'Would migrate'} ${audited.length} banks with ${audited.reduce((sum, item) => sum + item.questions.length, 0)} questions and ${fixCount} reviewed reference corrections.`);
  console.log(`Dependency-only banks remove ${totals.sections} empty legacy sections, ${totals.units} empty units, and ${totals.courses} empty courses from bank-owned metadata.`);
  for (const item of audited.filter(item => item.emptySections || item.emptyUnits || item.emptyCourses)) {
    console.log(`- ${item.bank}: ${item.emptySections} empty sections, ${item.emptyUnits} empty units, ${item.emptyCourses} empty courses`);
  }
  if (write) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupRoot = join(root, 'backups', `bank-curriculum-before-${stamp}`);
    for (const item of audited) await migrateBank(item, backupRoot);
    for (const item of audited) await verifyBank(item.bank);
    console.log(`Legacy curriculum and manifests backed up to ${backupRoot}`);
    console.log(`Verified all ${audited.length} dependency-only bank manifests and file hashes.`);
  }
}

async function migrateBank(item: typeof audited[number], backupRoot: string): Promise<void> {
  const bankRoot = join(banksRoot, item.bank);
  const curriculumRoot = join(bankRoot, 'curriculum');
  const legacyPath = join(curriculumRoot, 'custom-classes.json');
  const dependenciesPath = join(curriculumRoot, 'dependencies.json');
  const manifestPath = join(bankRoot, 'manifest.json');
  const backupBank = join(backupRoot, item.bank);
  await mkdir(join(backupBank, 'curriculum'), { recursive: true });
  await copyIfPresent(legacyPath, join(backupBank, 'curriculum', 'custom-classes.json'));
  await copyIfPresent(dependenciesPath, join(backupBank, 'curriculum', 'dependencies.json'));
  await copyIfPresent(manifestPath, join(backupBank, 'manifest.json'));

  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
    generatedAt?: string; counts?: { customClasses?: number }; files?: Array<{ path: string; contentType: string; size: number; hash: string }>;
  };
  if (!Array.isArray(manifest.files) || !manifest.counts) throw new Error(`${item.bank}: malformed manifest`);
  const fixes = REFERENCE_FIXES[item.bank] ?? {};
  if (Object.keys(fixes).length) {
    const indexPath = join(bankRoot, 'questions', 'index.json');
    const index = JSON.parse(await readFile(indexPath, 'utf8')) as { questions: Array<{ id: string; filename: string; updatedAt: number | null }> };
    const now = Date.now();
    let indexChanged = false;
    for (const question of item.questions.filter(question => fixes[question.id])) {
      const entry = index.questions.find(candidate => candidate.id === question.id);
      if (!entry) throw new Error(`${item.bank}/${question.id}: missing index entry`);
      const questionPath = join(bankRoot, entry.filename);
      const wrapper = JSON.parse(await readFile(questionPath, 'utf8')) as { version: number; question: Question };
      if (matchesFix(wrapper.question, fixes[question.id])) continue;
      if (!indexChanged) await copyIfPresent(indexPath, join(backupBank, 'questions', 'index.json'));
      await copyIfPresent(questionPath, join(backupBank, entry.filename));
      wrapper.question = { ...wrapper.question, ...fixes[question.id], updatedAt: now };
      question.updatedAt = now;
      entry.updatedAt = now;
      indexChanged = true;
      const questionText = `${JSON.stringify(wrapper, null, 2)}\n`;
      await writeFile(questionPath, questionText);
      replaceManifestFile(manifest.files, entry.filename, questionText);
    }
    if (indexChanged) {
      const indexText = `${JSON.stringify(index, null, 2)}\n`;
      await writeFile(indexPath, indexText);
      replaceManifestFile(manifest.files, 'questions/index.json', indexText);
    }
  }

  const dependencies = bankCurriculumDependencies(item.questions, catalog.courses);
  const text = `${JSON.stringify(dependencies, null, 2)}\n`;
  await mkdir(curriculumRoot, { recursive: true });
  await writeFile(dependenciesPath, text);
  manifest.files = manifest.files.filter(file => !['curriculum/custom-classes.json', 'curriculum/dependencies.json'].includes(file.path));
  manifest.files.push({ path: 'curriculum/dependencies.json', contentType: 'application/json; charset=utf-8',
    size: repoDataContentByteLength(text), hash: hashRepoDataContent(text) });
  manifest.files.sort((left, right) => left.path.localeCompare(right.path));
  manifest.counts.customClasses = 0;
  manifest.generatedAt = new Date().toISOString();
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  if (await exists(legacyPath)) await unlink(legacyPath);
}

async function verifyBank(bank: string): Promise<void> {
  const bankRoot = join(banksRoot, bank);
  const manifest = JSON.parse(await readFile(join(bankRoot, 'manifest.json'), 'utf8')) as {
    counts?: { customClasses?: number }; files?: Array<{ path: string; size: number; hash: string }>;
  };
  if (manifest.counts?.customClasses !== 0 || !manifest.files?.some(file => file.path === 'curriculum/dependencies.json')
    || manifest.files.some(file => file.path === 'curriculum/custom-classes.json') || await exists(join(bankRoot, 'curriculum', 'custom-classes.json'))) {
    throw new Error(`${bank}: dependency-only curriculum migration is incomplete`);
  }
  for (const file of manifest.files) {
    const bytes = await readFile(join(bankRoot, file.path));
    const content = file.path.startsWith('images/') ? new Uint8Array(bytes) : bytes.toString('utf8');
    if (repoDataContentByteLength(content) !== file.size || hashRepoDataContent(content) !== file.hash) {
      throw new Error(`${bank}/${file.path}: manifest hash or size mismatch`);
    }
  }
}

function replaceManifestFile(files: Array<{ path: string; contentType: string; size: number; hash: string }>, path: string, text: string): void {
  const file = files.find(candidate => candidate.path === path);
  if (!file) throw new Error(`Manifest does not list ${path}`);
  file.size = repoDataContentByteLength(text);
  file.hash = hashRepoDataContent(text);
}

function matchesFix(question: Question, fix: Partial<Pick<Question, 'classId' | 'unitId' | 'sectionId' | 'indicators'>>): boolean {
  return Object.entries(fix).every(([key, value]) => JSON.stringify(question[key as keyof Question]) === JSON.stringify(value));
}

function validateReferences(bank: string, questions: Question[], courses: Class[], out: string[]): void {
  const byCourse = new Map(courses.map(course => [course.id, course]));
  for (const question of questions) {
    if (!question.classId) continue;
    const course = byCourse.get(question.classId);
    if (!course) { out.push(`${bank}/${question.id}: unknown course ${question.classId}`); continue; }
    if (!question.unitId) continue;
    const unit = course.units.find(candidate => candidate.id === question.unitId);
    if (!unit) { out.push(`${bank}/${question.id}: unknown unit ${question.classId}/${question.unitId}`); continue; }
    if (!question.sectionId) continue;
    const section = unit.sections.find(candidate => candidate.id === question.sectionId);
    if (!section) { out.push(`${bank}/${question.id}: unknown outcome ${question.classId}/${question.unitId}/${question.sectionId}`); continue; }
    const indicators = new Set(section.indicators?.map(indicator => indicator.id) ?? []);
    for (const indicator of question.indicators ?? []) if (!indicators.has(indicator)) {
      out.push(`${bank}/${question.id}: unknown indicator ${indicator} in ${question.classId}/${question.unitId}/${question.sectionId}`);
    }
  }
}

async function optionalText(path: string): Promise<string | null> {
  try { return await readFile(path, 'utf8'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}
async function exists(path: string): Promise<boolean> { try { await stat(path); return true; } catch { return false; } }
async function copyIfPresent(from: string, to: string): Promise<void> {
  if (!await exists(from)) return;
  await mkdir(dirname(to), { recursive: true });
  await copyFile(from, to);
}
