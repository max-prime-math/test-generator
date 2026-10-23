import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { exportAppDataToRepoEntries, importRepoEntriesToAppData, normalizeRepoPath, REPO_DATA_LIMITS, type RepoAppData } from '../git/repoDataModel.ts';
import { referencedImageNames, rewriteImageReferences } from './editor/image-references.ts';
import { imageKeyFromReference } from './image-keys.ts';
import { firstById, snapshotTest, standaloneTestData } from './workspace-format.ts';
import { createId } from './id.ts';
import { defaultTestConfig, type SavedTest } from './types.ts';

export type ShareKind = 'bank' | 'tests';
export interface ShareItem { name: string; data: RepoAppData }
export interface SharePackage { kind: ShareKind; items: ShareItem[] }
export const SHARE_MAX_BYTES = 200 * 1024 * 1024;
const MAX_FILES = 65_000;

/** Sharing must fail visibly if a literal picture reference cannot travel. */
function checkImages(data: RepoAppData) {
  const available = new Set((data.images ?? []).map(image => image.name.toLowerCase()));
  const declared = data.questions.flatMap(question => question.images ?? []).map(imageKeyFromReference);
  const missing = [...new Set([...declared, ...referencedImageNames([data.questions, data.narratives, data.savedTests])])]
    .filter(name => !available.has(name.toLowerCase()));
  if (missing.length) throw new Error(`Missing pictures: ${missing.slice(0, 5).join(', ')}. Restore these files in the Image library, then try again.`);
}

/** One independent snapshot per test: the same question ID may have different content in each. */
export function portableTest(test: SavedTest, data: RepoAppData): ShareItem {
  const pool = firstById([...(test.config.ownQuestions ?? []), ...(test.questionSnapshots ?? []), ...data.questions]);
  const captured = snapshotTest({ ...test, questionSnapshots: undefined }, {
    ...data, questions: [...pool.values()],
    narratives: [...firstById([...(test.narrativeSnapshots ?? []), ...(data.narratives ?? [])]).values()],
  });
  // The snapshot now holds every selected question, including test-only edits.
  // Keep a single source of truth on the receiving computer.
  const { ownQuestions: _own, ...config } = captured.test.config;
  const frozen = { ...captured.test, config };
  return { name: test.name, data: standaloneTestData(frozen, captured.images, data.customClasses) };
}

function validateItem(kind: ShareKind, item: ShareItem) {
  if (typeof item.name !== 'string' || !item.name.trim() || item.name.length > 500) throw new Error('The ZIP contains an invalid name.');
  if (kind === 'bank') {
    if (item.data.savedTests.length) throw new Error('A bank ZIP cannot contain saved tests.');
  } else {
    if (item.data.savedTests.length !== 1) throw new Error('Each test in the ZIP must have its own content snapshot.');
    const test = item.data.savedTests[0];
    const config = test.config;
    const defaults = defaultTestConfig();
    for (const [key, fallback] of Object.entries(defaults)) {
      const value = (config as unknown as Record<string, unknown>)[key];
      if (value === undefined || typeof fallback === 'object') continue;
      if (typeof value !== typeof fallback || (typeof value === 'number' && !Number.isFinite(value))) throw new Error(`Test “${test.name}” has invalid settings: ${key}.`);
    }
    if (!Array.isArray(config.selectedIds) || config.selectedIds.some(id => typeof id !== 'string') || new Set(config.selectedIds).size !== config.selectedIds.length) {
      throw new Error(`Test “${test.name}” has an invalid question order.`);
    }
    const ids = new Set(item.data.questions.map(question => question.id));
    if (config.selectedIds.some(id => !ids.has(id))) throw new Error(`Test “${test.name}” is missing question content.`);
    for (const key of ['answerSpaceOverrides', 'choiceOverrides', 'pageBreakAfter'] as const) {
      if (config[key] !== undefined && (!config[key] || typeof config[key] !== 'object' || Array.isArray(config[key]))) throw new Error(`Test “${test.name}” has invalid layout settings.`);
    }
    if (config.bonusQuestionIds !== undefined && (!Array.isArray(config.bonusQuestionIds) || config.bonusQuestionIds.some(id => typeof id !== 'string'))) throw new Error(`Test “${test.name}” has invalid bonus questions.`);
    if (config.graphDefaults !== undefined) {
      if (!config.graphDefaults || typeof config.graphDefaults !== 'object' || Array.isArray(config.graphDefaults)) throw new Error(`Test “${test.name}” has invalid graph settings.`);
      for (const [key, fallback] of Object.entries(defaults.graphDefaults)) {
        const value = (config.graphDefaults as unknown as Record<string, unknown>)[key];
        if (value !== undefined && (typeof value !== typeof fallback || (typeof value === 'number' && !Number.isFinite(value)))) throw new Error(`Test “${test.name}” has invalid graph settings: ${key}.`);
      }
    }
    if (config.customNarratives !== undefined && (!Array.isArray(config.customNarratives) || config.customNarratives.some(n => !n || typeof n.id !== 'string' || typeof n.body !== 'string' || (n.afterQuestionId !== null && !ids.has(n.afterQuestionId))))) {
      throw new Error(`Test “${test.name}” has invalid narrative placement.`);
    }
  }
  checkImages(item.data);
}

export function encodeSharePackage(pack: SharePackage): Uint8Array {
  if (!['bank', 'tests'].includes(pack.kind) || !pack.items.length || pack.items.length > 1000 || (pack.kind === 'bank' && pack.items.length !== 1)) throw new Error('Choose a bank or at least one test to export.');
  const files: Record<string, Uint8Array> = Object.create(null);
  let total = 0;
  const items = pack.items.map((item, index) => {
    validateItem(pack.kind, item);
    const path = `items/${index}`;
    for (const entry of exportAppDataToRepoEntries(item.data)) {
      const bytes = typeof entry.content === 'string' ? strToU8(entry.content) : entry.content;
      total += bytes.byteLength;
      if (total > SHARE_MAX_BYTES) throw new Error('This ZIP would exceed 200 MB. Export fewer tests at a time.');
      files[`${path}/${entry.path}`] = bytes;
    }
    return { path, name: item.name };
  });
  files['testgen-share.json'] = strToU8(JSON.stringify({ format: 'testgen-share', version: 1, kind: pack.kind, exportedAt: new Date().toISOString(), items }));
  if (Object.keys(files).length > MAX_FILES) throw new Error('Too many files for one ZIP. Export fewer tests at a time.');
  return zipSync(files, { level: 6 });
}

export function decodeSharePackage(bytes: Uint8Array): SharePackage {
  if (bytes.byteLength > SHARE_MAX_BYTES) throw new Error('Choose a TestGen ZIP smaller than 200 MB.');
  let total = 0;
  const seen = new Set<string>();
  const files = unzipSync(bytes, { filter(file) {
    normalizeRepoPath(file.name);
    if (seen.has(file.name)) throw new Error('The ZIP contains duplicate files.');
    seen.add(file.name);
    total += file.originalSize;
    if (seen.size > MAX_FILES || total > SHARE_MAX_BYTES || file.originalSize > REPO_DATA_LIMITS.maxImageFileBytes) throw new Error('This ZIP is too large to import. Ask for a smaller export.');
    return true;
  } });
  const raw = files['testgen-share.json'];
  if (!raw) throw new Error('This is not a TestGen sharing ZIP. Use Export bank ZIP or Export tests ZIP in TestGen.');
  const manifest = JSON.parse(strFromU8(raw));
  if (manifest?.format !== 'testgen-share' || manifest.version !== 1 || !['bank', 'tests'].includes(manifest.kind) || !Array.isArray(manifest.items) || !manifest.items.length || manifest.items.length > 1000 || (manifest.kind === 'bank' && manifest.items.length !== 1)) throw new Error('Unsupported TestGen ZIP format.');
  const used = new Set(['testgen-share.json']);
  const items = manifest.items.map((item: { path: string; name: string }, index: number) => {
    if (!item || item.path !== `items/${index}`) throw new Error('Invalid item location in ZIP.');
    const prefix = `${item.path}/`;
    const entries = Object.entries(files).filter(([path]) => path.startsWith(prefix)).map(([path, content]) => {
      used.add(path);
      return { path: path.slice(prefix.length), kind: 'file' as const, content };
    });
    const data = importRepoEntriesToAppData(entries).appData;
    const result = { name: item.name, data };
    validateItem(manifest.kind, result);
    if (manifest.kind === 'tests') {
      // Read the package's top-level content, never trust a second, conflicting
      // embedded snapshot or a stale ownQuestions array from the sender.
      const test = data.savedTests[0];
      const { ownQuestions: _own, ...config } = test.config;
      const defaults = defaultTestConfig();
      data.savedTests = [{ ...test, config: { ...defaults, ...config, graphDefaults: { ...defaults.graphDefaults, ...config.graphDefaults } }, questionSnapshots: data.questions, narrativeSnapshots: data.narratives ?? [] }];
    }
    return result;
  });
  if (Object.keys(files).some(path => !used.has(path))) throw new Error('The ZIP contains unexpected files. Export it again from TestGen.');
  return { kind: manifest.kind, items };
}

/** Fresh IDs and image names ensure imports never overwrite a colleague's local work. */
export function prepareTestCopies(items: ShareItem[], existing: SavedTest[]): { tests: SavedTest[]; images: NonNullable<RepoAppData['images']> } {
  const names = new Set(existing.map(test => test.name));
  const images: NonNullable<RepoAppData['images']> = [];
  const tests = items.map(item => {
    let data = item.data;
    const namespace = createId();
    for (const [index, image] of (item.data.images ?? []).entries()) {
      const name = `testasset-${namespace}-${index}`;
      data = rewriteImageReferences(data, image.name, name, image.ext);
      images.push({ ...image, name });
    }
    const original = data.savedTests[0];
    const base = original.name.trim() || 'Imported test';
    let name = base;
    for (let n = 2; names.has(name); n++) name = `${base} (${n})`;
    names.add(name);
    return { ...original, id: createId(), name, archivedAt: undefined,
      createdAt: Date.now(), updatedAt: Date.now(), questionSnapshots: data.questions, narrativeSnapshots: data.narratives ?? [] };
  });
  return { tests, images };
}
