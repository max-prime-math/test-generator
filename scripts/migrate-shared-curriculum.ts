import { copyFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  curriculumDefinitions,
  curriculumOutcomeKey,
  mergeCurriculumCatalog,
  parseCurriculumCatalog,
  parseCurriculumLanguage,
  stableCurriculumJson,
  type CurriculumCatalogFile,
  type CurriculumLanguageEntry,
  type CurriculumLanguageFile,
} from '../src/lib/curriculum-library.ts';
import { mergeWorkspaceClasses } from '../src/lib/workspace-format.ts';
import type { Class } from '../src/lib/types.ts';
import { MB_10I } from '../src/lib/generator/outcomes.ts';

const args = process.argv.slice(2);
let write = false, root = '', preferredBank = '';
for (let index = 0; index < args.length; index++) {
  if (args[index] === '--write') write = true;
  else if (args[index] === '--prefer-bank') preferredBank = args[++index] ?? '';
  else if (!args[index].startsWith('--') && !root) root = args[index];
  else throw new Error(`Unknown argument: ${args[index]}`);
}
if (!root) throw new Error('Usage: node --experimental-strip-types scripts/migrate-shared-curriculum.ts <workspace-root> [--prefer-bank <bank-id>] [--write]');

const banksRoot = join(root, 'banks');
const bankNames = (await readdir(banksRoot, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
const sources: Array<{ bank: string; classes: Class[] }> = [];
for (const bank of bankNames) {
  const path = join(banksRoot, bank, 'curriculum', 'custom-classes.json');
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as { version?: number; classes?: Class[] };
    if (!Array.isArray(parsed.classes)) throw new Error('classes is not an array');
    sources.push({ bank, classes: parsed.classes.map(cls => ({ ...cls, curriculumSource: cls.curriculumSource ?? inferredSource(cls.id) })) });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error(`${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
// Built-in enrichment outcomes are canonical app curriculum even when no legacy bank copied them.
sources.push({ bank: 'testgen-generator', classes: [{ ...MB_10I, curriculumSource: { catalogId: 'manitoba-education', version: 'unversioned' } }] });
// Referenced local organization recovered from questions whose old bank copy omitted the unit.
sources.push({ bank: 'question-reference-recovery', classes: [{
  id: 'grade-9-advanced-math', name: 'Grade 9 Advanced Math', curriculumSource: { catalogId: 'testgen-local', version: 'unversioned' },
  units: [{ id: 'trigonometry', name: 'Trigonometry', sections: [] }],
}] });
if (!sources.length) throw new Error(`No bank curriculum files found under ${banksRoot}`);
if (preferredBank) {
  const at = sources.findIndex(source => source.bank === preferredBank);
  if (at < 0) throw new Error(`Preferred bank “${preferredBank}” has no curriculum file.`);
  sources.unshift(...sources.splice(at, 1));
}

function inferredSource(courseId: string): NonNullable<Class['curriculumSource']> {
  if (courseId === 'manitoba-grade-9-mathematics-2026') return { catalogId: 'manitoba-education', version: '2026-draft' };
  if (['pre-calculus-30s', 'pre-calculus-40s', 'mb-10i', 'mb-30s', 'grade-10-intro-math', 'intro-applied-pre-calculus-20s'].includes(courseId)) {
    return { catalogId: 'manitoba-education', version: 'unversioned' };
  }
  if (courseId === 'ap-calculus-ab' || courseId === 'ap-calculus-bc') return { catalogId: 'college-board-ap', version: 'unversioned' };
  if (courseId === 'comc' || courseId === 'cemc' || courseId.startsWith('cemc-')) return { catalogId: 'cemc', version: 'contest-archive' };
  return { catalogId: 'testgen-local', version: 'unversioned' };
}

const conflicts: string[] = [];
const resolved: string[] = [];
const seen = new Map<string, { wording: string; bank: string }>();
const languageSeen = new Map<string, { entry: Omit<CurriculumLanguageEntry, 'updatedAt'>; bank: string }>();
const now = Date.now();
for (const source of sources) for (const cls of source.classes) {
  compare(`course ${cls.id}`, cls.name, source.bank);
  for (const unit of cls.units) {
    compare(`unit ${cls.id}/${unit.id}`, unit.name, source.bank);
    for (const section of unit.sections) {
      compare(`outcome ${cls.id}/${unit.id}/${section.id}`, section.name, source.bank);
      harvest(curriculumOutcomeKey(cls.id, unit.id, section.id, null), section, source.bank);
      for (const indicator of section.indicators ?? []) {
        compare(`indicator ${cls.id}/${unit.id}/${section.id}/${indicator.id}`, indicator.text, source.bank);
        harvest(curriculumOutcomeKey(cls.id, unit.id, section.id, indicator.id), indicator, source.bank);
      }
    }
  }
}

function compare(key: string, wording: string, bank: string): void {
  const previous = seen.get(key);
  if (previous && previous.wording !== wording) {
    if (preferredBank && (previous.bank === preferredBank || bank === preferredBank)) {
      const chosen = bank === preferredBank ? { wording, bank } : previous;
      resolved.push(`${key}: chose “${chosen.wording}” from ${chosen.bank}`);
      seen.set(key, chosen);
    } else conflicts.push(`${key}: “${previous.wording}” (${previous.bank}) vs “${wording}” (${bank})`);
  }
  else if (!previous) seen.set(key, { wording, bank });
}

function harvest(key: string, value: { nickname?: string; nextStep?: string }, bank: string): void {
  const entry = { ...(value.nickname?.trim() ? { nickname: value.nickname.trim() } : {}), ...(value.nextStep?.trim() ? { nextStep: value.nextStep.trim() } : {}) };
  if (!entry.nickname && !entry.nextStep) return;
  const previous = languageSeen.get(key);
  if (previous && JSON.stringify(previous.entry) !== JSON.stringify(entry)) {
    if (preferredBank && (previous.bank === preferredBank || bank === preferredBank)) {
      const chosen = bank === preferredBank ? { entry, bank } : previous;
      resolved.push(`report language ${key}: chose ${JSON.stringify(chosen.entry)} from ${chosen.bank}`);
      languageSeen.set(key, chosen);
    } else conflicts.push(`report language ${key}: ${JSON.stringify(previous.entry)} (${previous.bank}) vs ${JSON.stringify(entry)} (${bank})`);
  } else if (!previous) languageSeen.set(key, { entry, bank });
}

if (conflicts.length) {
  console.error(`Found ${conflicts.length} curriculum conflicts; no files were written:`);
  for (const conflict of conflicts.slice(0, 50)) console.error(`- ${conflict}`);
  if (conflicts.length > 50) console.error(`- and ${conflicts.length - 50} more`);
  process.exitCode = 2;
} else {
  if (resolved.length) console.log(`Resolved ${resolved.length} duplicate definitions using preferred bank “${preferredBank}”.`);
  const importedCatalog: CurriculumCatalogFile = {
    schemaVersion: 1,
    updatedAt: now,
    courses: curriculumDefinitions(mergeWorkspaceClasses(sources.flatMap(source => source.classes))),
  };
  const importedLanguage: CurriculumLanguageFile = {
    schemaVersion: 1,
    updatedAt: now,
    outcomes: Object.fromEntries([...languageSeen].map(([key, value]) => [key, { ...value.entry, updatedAt: now }])),
  };
  const curriculumRoot = join(root, 'curriculum');
  const catalogPath = join(curriculumRoot, 'catalog.json');
  const languagePath = join(curriculumRoot, 'comment-language.json');
  const existingCatalog = await optional(catalogPath, parseCurriculumCatalog);
  const existingLanguage = await optional(languagePath, parseCurriculumLanguage);
  // A dependency-only workspace may no longer have any bank-owned curriculum
  // snapshots to re-read. Retrofit provenance onto the authoritative catalog
  // itself so this migration remains safe to rerun after that cleanup.
  const sourcedExistingCatalog = existingCatalog ? {
    ...existingCatalog,
    courses: existingCatalog.courses.map(course => ({
      ...course,
      curriculumSource: course.curriculumSource ?? inferredSource(course.id),
    })),
  } : null;
  const mergedCatalog = sourcedExistingCatalog
    ? mergeCurriculumCatalog(sourcedExistingCatalog, { ...importedCatalog, updatedAt: 0 })
    : importedCatalog;
  // This migration changes provenance even when labels and hierarchy do not
  // change. Give that change a real timestamp so folder reconciliation keeps it.
  const catalog: CurriculumCatalogFile = { ...mergedCatalog, updatedAt: now };
  const language: CurriculumLanguageFile = existingLanguage ? {
    schemaVersion: 1,
    updatedAt: Math.max(existingLanguage.updatedAt, importedLanguage.updatedAt),
    outcomes: { ...importedLanguage.outcomes, ...existingLanguage.outcomes },
  } : importedLanguage;
  console.log(`${write ? 'Writing' : 'Would write'} ${catalog.courses.length} shared courses and ${Object.keys(language.outcomes).length} report-language entries from ${sources.length} banks.`);
  console.log(`Bank curriculum files remain unchanged.`);
  if (write) {
    await mkdir(curriculumRoot, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupRoot = join(root, 'backups', `shared-curriculum-before-${stamp}`);
    if (existingCatalog || existingLanguage) {
      await mkdir(backupRoot, { recursive: true });
      if (existingCatalog) await copyFile(catalogPath, join(backupRoot, 'catalog.json'));
      if (existingLanguage) await copyFile(languagePath, join(backupRoot, 'comment-language.json'));
      console.log(`Previous shared files backed up to ${backupRoot}`);
    }
    await writeFile(catalogPath, stableCurriculumJson(catalog));
    await writeFile(languagePath, stableCurriculumJson(language));
    console.log(`Wrote ${catalogPath}`);
    console.log(`Wrote ${languagePath}`);
  }
}

async function optional<T>(path: string, parse: (text: string) => T): Promise<T | null> {
  try { await stat(path); return parse(await readFile(path, 'utf8')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}
