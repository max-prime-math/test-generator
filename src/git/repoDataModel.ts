import type { Class, Narrative, Question, SavedTest } from '../lib/types';
import type { StoredImage } from '../lib/image-store.svelte';
import { APP_VERSION } from '../lib/version.ts';

export const REPO_DATA_SCHEMA_VERSION = 1;
export const REPO_DATA_LAYOUT = 'test-generator-repo-worktree';
export const REPO_MANIFEST_PATH = 'manifest.json';

export const REPO_DATA_LIMITS = {
  maxFileCount: 2_048,
  maxPathLength: 180,
  maxSegmentLength: 96,
  maxTextFileBytes: 1_048_576,
  maxImageFileBytes: 10_485_760,
  maxTotalBytes: 52_428_800,
} as const;

const RESERVED_DEVICE_NAMES = new Set([
  'con',
  'prn',
  'aux',
  'nul',
  'com1',
  'com2',
  'com3',
  'com4',
  'com5',
  'com6',
  'com7',
  'com8',
  'com9',
  'lpt1',
  'lpt2',
  'lpt3',
  'lpt4',
  'lpt5',
  'lpt6',
  'lpt7',
  'lpt8',
  'lpt9',
]);

const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
  gif: 'image/gif',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  pdf: 'application/pdf',
  png: 'image/png',
  svg: 'image/svg+xml',
  webp: 'image/webp',
};

const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder('utf-8', { fatal: true });

export interface RepoDataEntry {
  path: string;
  kind: 'file';
  content: string | Uint8Array;
}

export interface RepoDataImage
  extends Pick<StoredImage, 'name' | 'ext' | 'bytes'>,
    Partial<Pick<StoredImage, 'mime' | 'size'>> {}

export interface RepoAppData {
  questions: Question[];
  narratives?: Narrative[];
  customClasses: Class[];
  savedTests: SavedTest[];
  images?: RepoDataImage[];
  demoQuestions?: Question[];
}

export interface RepoDataManifestFile {
  path: string;
  contentType: string;
  size: number;
  hash: string;
}

export interface RepoDataManifest {
  schemaVersion: typeof REPO_DATA_SCHEMA_VERSION;
  layout: typeof REPO_DATA_LAYOUT;
  generatedAt: string;
  appVersion: string | null;
  files: RepoDataManifestFile[];
  counts: {
    questions: number;
    customClasses: number;
    savedTests: number;
    images: number;
    narratives: number;
  };
}

export interface ExportRepoDataOptions {
  generatedAt?: string;
  appVersion?: string | null;
  includeDemoQuestions?: boolean;
}

export interface ImportRepoEntriesResult {
  appData: RepoAppData;
  manifest: RepoDataManifest;
}

interface QuestionIndexFile {
  version: 1;
  questions: Array<{
    id: string;
    filename: string;
    updatedAt: number | null;
    images: string[];
  }>;
}

interface TestsIndexFile {
  version: 1;
  tests: Array<{
    id: string;
    name: string;
    classId: string | null;
    unitId: string | null;
    testType: string | null;
    updatedAt: number;
    filename: string;
  }>;
}

interface NarrativeIndexFile {
  version: 1;
  narratives: Array<{
    id: string;
    filename: string;
    updatedAt: number | null;
    classId: string | null;
    unitId: string | null;
    sectionId: string | null;
  }>;
}

export function exportAppDataToRepoEntries(
  appData: RepoAppData,
  options: ExportRepoDataOptions = {},
): RepoDataEntry[] {
  const questions = sortById([
    ...appData.questions.map(sanitizeQuestion),
    ...(options.includeDemoQuestions ? (appData.demoQuestions ?? []).map(sanitizeQuestion) : []),
  ]);
  const narratives = sortById((appData.narratives ?? []).map(sanitizeNarrative));
  const customClasses = sortById(appData.customClasses.map(sanitizeClass));
  const savedTests = sortById(appData.savedTests.map(sanitizeSavedTest));
  const images = sortImages(appData.images ?? []);

  validateExportImageReferences(questions, images);
  validateNarrativeReferences(questions, narratives);

  const entries: RepoDataEntry[] = [
    {
      path: 'README.md',
      kind: 'file',
      content: buildReadme(),
    },
    {
      path: 'curriculum/custom-classes.json',
      kind: 'file',
      content: stableJson({
        version: 1,
        classes: customClasses,
      }),
    },
    {
      path: 'questions/index.json',
      kind: 'file',
      content: stableJson(buildQuestionsIndex(questions)),
    },
    {
      path: 'narratives/index.json',
      kind: 'file',
      content: stableJson(buildNarrativesIndex(narratives)),
    },
    {
      path: 'tests/index.json',
      kind: 'file',
      content: stableJson(buildTestsIndex(savedTests)),
    },
  ];

  for (const question of questions) {
    entries.push({
      path: questionFilename(question.id),
      kind: 'file',
      content: stableJson({
        version: 1,
        question,
      }),
    });
  }

  for (const narrative of narratives) {
    entries.push({
      path: narrativeFilename(narrative.id),
      kind: 'file',
      content: stableJson({
        version: 1,
        narrative,
      }),
    });
  }

  for (const test of savedTests) {
    entries.push({
      path: testFilename(test.id),
      kind: 'file',
      content: stableJson({
        version: 1,
        test,
      }),
    });
  }

  for (const image of images) {
    entries.push({
      path: imagePath(image),
      kind: 'file',
      content: image.bytes,
    });
  }

  const nonManifestEntries = sortEntries(entries);
  validateEntryPathSet(nonManifestEntries);
  const manifest = buildManifest(nonManifestEntries, {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    appVersion: options.appVersion === undefined ? APP_VERSION : options.appVersion,
    counts: {
      questions: questions.length,
      customClasses: customClasses.length,
      savedTests: savedTests.length,
      images: images.length,
      narratives: narratives.length,
    },
  });

  return sortEntries([
    ...nonManifestEntries,
    {
      path: REPO_MANIFEST_PATH,
      kind: 'file',
      content: stableJson(manifest),
    },
  ]);
}

export function importRepoEntriesToAppData(entries: RepoDataEntry[]): ImportRepoEntriesResult {
  const normalizedEntries = validateAndNormalizeEntries(entries);
  const manifest = parseManifest(readRequiredText(normalizedEntries, REPO_MANIFEST_PATH));
  validateManifest(normalizedEntries, manifest);

  const classesFile = parseJsonObject(readRequiredText(normalizedEntries, 'curriculum/custom-classes.json'), 'curriculum/custom-classes.json');
  if (classesFile.version !== 1 || !Array.isArray(classesFile.classes)) {
    throw new Error('Unsupported custom classes file');
  }
  const customClasses = classesFile.classes.map(validateClass);

  const questionsIndex = parseQuestionsIndex(readRequiredText(normalizedEntries, 'questions/index.json'));
  const testsIndex = parseTestsIndex(readRequiredText(normalizedEntries, 'tests/index.json'));
  const narrativesIndex = normalizedEntries.has('narratives/index.json')
    ? parseNarrativesIndex(readRequiredText(normalizedEntries, 'narratives/index.json'))
    : null;

  const questionFilenames = new Set(questionsIndex.questions.map((entry) => entry.filename));
  const testFilenames = new Set(testsIndex.tests.map((entry) => entry.filename));
  const narrativeFilenames = new Set(narrativesIndex?.narratives.map((entry) => entry.filename) ?? []);
  const actualQuestionFiles = [...normalizedEntries.keys()].filter((path) => path.startsWith('questions/') && path !== 'questions/index.json');
  const actualTestFiles = [...normalizedEntries.keys()].filter((path) => path.startsWith('tests/') && path !== 'tests/index.json');
  const actualNarrativeFiles = [...normalizedEntries.keys()].filter((path) => path.startsWith('narratives/') && path !== 'narratives/index.json');

  assertSameSet(actualQuestionFiles, questionFilenames, 'question files');
  assertSameSet(actualTestFiles, testFilenames, 'test files');
  if (narrativesIndex) {
    assertSameSet(actualNarrativeFiles, narrativeFilenames, 'narrative files');
  } else if (actualNarrativeFiles.length > 0) {
    throw new Error('Narrative files require narratives/index.json');
  }

  const questions = questionsIndex.questions.map((indexEntry) => {
    const raw = parseJsonObject(readRequiredText(normalizedEntries, indexEntry.filename), indexEntry.filename);
    if (raw.version !== 1 || !isPlainObject(raw.question)) {
      throw new Error(`Malformed question file: ${indexEntry.filename}`);
    }
    const question = validateQuestion(raw.question);
    if (question.id !== indexEntry.id) {
      throw new Error(`Question id mismatch in ${indexEntry.filename}`);
    }
    return question;
  });

  const savedTests = testsIndex.tests.map((indexEntry) => {
    const raw = parseJsonObject(readRequiredText(normalizedEntries, indexEntry.filename), indexEntry.filename);
    if (raw.version !== 1 || !isPlainObject(raw.test)) {
      throw new Error(`Malformed test file: ${indexEntry.filename}`);
    }
    const test = validateSavedTest(raw.test);
    if (test.id !== indexEntry.id) {
      throw new Error(`Saved test id mismatch in ${indexEntry.filename}`);
    }
    return test;
  });

  const narratives = narrativesIndex?.narratives.map((indexEntry) => {
    const raw = parseJsonObject(readRequiredText(normalizedEntries, indexEntry.filename), indexEntry.filename);
    if (raw.version !== 1 || !isPlainObject(raw.narrative)) {
      throw new Error(`Malformed narrative file: ${indexEntry.filename}`);
    }
    const narrative = validateNarrative(raw.narrative);
    if (narrative.id !== indexEntry.id) {
      throw new Error(`Narrative id mismatch in ${indexEntry.filename}`);
    }
    return narrative;
  }) ?? [];

  const images = [...normalizedEntries.values()]
    .filter((entry) => entry.path.startsWith('images/'))
    .map(importImageEntry)
    .sort((left, right) => compareStrings(imagePath(left), imagePath(right)));

  validateImportedImageReferences(questions, images);
  validateNarrativeReferences(questions, narratives);

  return {
    appData: {
      questions,
      narratives,
      customClasses,
      savedTests,
      images,
    },
    manifest,
  };
}

export function normalizeRepoPath(path: string): string {
  if (typeof path !== 'string' || path.length === 0) {
    throw new Error('Repo path must be a non-empty string');
  }
  if (path.length > REPO_DATA_LIMITS.maxPathLength) {
    throw new Error(`Repo path is too long: ${path}`);
  }
  if (path.includes('\0')) {
    throw new Error(`Repo path contains a NUL byte: ${path}`);
  }
  if (path.includes('\\')) {
    throw new Error(`Repo path cannot contain backslashes: ${path}`);
  }
  if (path.startsWith('/') || /^[a-zA-Z]:($|\/)/.test(path)) {
    throw new Error(`Repo path must be relative: ${path}`);
  }
  if (path.includes('//') || path.endsWith('/')) {
    throw new Error(`Repo path contains an empty segment: ${path}`);
  }

  const segments = path.split('/');
  for (const segment of segments) {
    validateRepoPathSegment(segment, path);
  }

  const decoded = safeDecodeURIComponent(path);
  if (decoded !== path) {
    if (decoded.includes('\0') || decoded.includes('\\') || decoded.startsWith('/') || decoded.includes('//')) {
      throw new Error(`Repo path contains encoded traversal or separators: ${path}`);
    }
    for (const segment of decoded.split('/')) {
      validateRepoPathSegment(segment, path);
    }
  }

  return segments.join('/');
}

export function isReservedRepoPath(path: string): boolean {
  try {
    normalizeRepoPath(path);
    return false;
  } catch {
    return true;
  }
}

export function hashRepoDataContent(content: string | Uint8Array): string {
  const bytes = typeof content === 'string' ? TEXT_ENCODER.encode(content) : content;
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a32:${hash.toString(16).padStart(8, '0')}`;
}

export function repoDataContentByteLength(content: string | Uint8Array): number {
  return typeof content === 'string' ? TEXT_ENCODER.encode(content).byteLength : content.byteLength;
}

function buildManifest(
  entries: RepoDataEntry[],
  options: Pick<RepoDataManifest, 'generatedAt' | 'appVersion' | 'counts'>,
): RepoDataManifest {
  return {
    schemaVersion: REPO_DATA_SCHEMA_VERSION,
    layout: REPO_DATA_LAYOUT,
    generatedAt: options.generatedAt,
    appVersion: options.appVersion,
    counts: options.counts,
    files: entries.map((entry) => ({
      path: entry.path,
      contentType: contentTypeForPath(entry.path),
      size: repoDataContentByteLength(entry.content),
      hash: hashRepoDataContent(entry.content),
    })),
  };
}

function buildReadme(): string {
  return [
    '# Test Generator Bank',
    '',
    'This repository stores Test Generator bank data as plain files for Git-backed sync.',
    'It intentionally excludes local drafts, render errors, validation check flags, credentials, tokens, and remote provider state.',
  ].join('\n');
}

function buildQuestionsIndex(questions: Question[]): QuestionIndexFile {
  return {
    version: 1,
    questions: questions.map((question) => ({
      id: question.id,
      filename: questionFilename(question.id),
      updatedAt: question.updatedAt ?? null,
      images: [...(question.images ?? [])].sort(),
    })),
  };
}

function buildNarrativesIndex(narratives: Narrative[]): NarrativeIndexFile {
  return {
    version: 1,
    narratives: narratives.map((narrative) => ({
      id: narrative.id,
      filename: narrativeFilename(narrative.id),
      updatedAt: narrative.updatedAt ?? null,
      classId: narrative.classId ?? null,
      unitId: narrative.unitId ?? null,
      sectionId: narrative.sectionId ?? null,
    })),
  };
}

function buildTestsIndex(tests: SavedTest[]): TestsIndexFile {
  return {
    version: 1,
    tests: tests.map((test) => ({
      id: test.id,
      name: test.name,
      classId: test.classId,
      unitId: test.unitId,
      testType: test.testType,
      updatedAt: test.updatedAt,
      filename: testFilename(test.id),
    })),
  };
}

function parseQuestionsIndex(raw: string): QuestionIndexFile {
  const index = parseJsonObject(raw, 'questions/index.json');
  if (index.version !== 1 || !Array.isArray(index.questions)) {
    throw new Error('Unsupported questions index');
  }
  const ids = new Set<string>();
  return {
    version: 1,
    questions: index.questions.map((entry, indexNumber) => {
      if (!isPlainObject(entry)) throw new Error('Malformed questions index entry');
      const id = requireString(entry.id, `questions[${indexNumber}].id`);
      if (ids.has(id)) throw new Error(`Duplicate question id: ${id}`);
      ids.add(id);
      const filename = normalizeRepoPath(requireString(entry.filename, `questions[${indexNumber}].filename`));
      if (filename !== questionFilename(id)) {
        throw new Error(`Unexpected question filename for ${id}`);
      }
      if (!Array.isArray(entry.images)) throw new Error(`Question index images must be an array for ${id}`);
      return {
        id,
        filename,
        updatedAt: entry.updatedAt === null ? null : requireNumber(entry.updatedAt, `questions[${indexNumber}].updatedAt`),
        images: entry.images.map((item, imageIndex) => requireString(item, `questions[${indexNumber}].images[${imageIndex}]`)),
      };
    }),
  };
}

function parseNarrativesIndex(raw: string): NarrativeIndexFile {
  const index = parseJsonObject(raw, 'narratives/index.json');
  if (index.version !== 1 || !Array.isArray(index.narratives)) {
    throw new Error('Unsupported narratives index');
  }
  const ids = new Set<string>();
  return {
    version: 1,
    narratives: index.narratives.map((entry, indexNumber) => {
      if (!isPlainObject(entry)) throw new Error('Malformed narratives index entry');
      const id = requireString(entry.id, `narratives[${indexNumber}].id`);
      if (ids.has(id)) throw new Error(`Duplicate narrative id: ${id}`);
      ids.add(id);
      const filename = normalizeRepoPath(requireString(entry.filename, `narratives[${indexNumber}].filename`));
      if (filename !== narrativeFilename(id)) {
        throw new Error(`Unexpected narrative filename for ${id}`);
      }
      return {
        id,
        filename,
        updatedAt: entry.updatedAt === null ? null : requireNumber(entry.updatedAt, `narratives[${indexNumber}].updatedAt`),
        classId: requireStringOrNull(entry.classId, `narratives[${indexNumber}].classId`),
        unitId: requireStringOrNull(entry.unitId, `narratives[${indexNumber}].unitId`),
        sectionId: requireStringOrNull(entry.sectionId, `narratives[${indexNumber}].sectionId`),
      };
    }),
  };
}

function parseTestsIndex(raw: string): TestsIndexFile {
  const index = parseJsonObject(raw, 'tests/index.json');
  if (index.version !== 1 || !Array.isArray(index.tests)) {
    throw new Error('Unsupported tests index');
  }
  const ids = new Set<string>();
  return {
    version: 1,
    tests: index.tests.map((entry, indexNumber) => {
      if (!isPlainObject(entry)) throw new Error('Malformed tests index entry');
      const id = requireString(entry.id, `tests[${indexNumber}].id`);
      if (ids.has(id)) throw new Error(`Duplicate saved test id: ${id}`);
      ids.add(id);
      const filename = normalizeRepoPath(requireString(entry.filename, `tests[${indexNumber}].filename`));
      if (filename !== testFilename(id)) {
        throw new Error(`Unexpected saved test filename for ${id}`);
      }
      return {
        id,
        name: requireString(entry.name, `tests[${indexNumber}].name`),
        classId: requireStringOrNull(entry.classId, `tests[${indexNumber}].classId`),
        unitId: requireStringOrNull(entry.unitId, `tests[${indexNumber}].unitId`),
        testType: requireStringOrNull(entry.testType, `tests[${indexNumber}].testType`),
        updatedAt: requireNumber(entry.updatedAt, `tests[${indexNumber}].updatedAt`),
        filename,
      };
    }),
  };
}

function parseManifest(raw: string): RepoDataManifest {
  const manifest = parseJsonObject(raw, REPO_MANIFEST_PATH);
  if (manifest.schemaVersion !== REPO_DATA_SCHEMA_VERSION) {
    throw new Error(`Unsupported repo data schema version: ${String(manifest.schemaVersion)}`);
  }
  if (manifest.layout !== REPO_DATA_LAYOUT) {
    throw new Error(`Unsupported repo data layout: ${String(manifest.layout)}`);
  }
  if (typeof manifest.generatedAt !== 'string') throw new Error('Repo manifest generatedAt must be a string');
  if (manifest.appVersion !== null && typeof manifest.appVersion !== 'string') {
    throw new Error('Repo manifest appVersion must be a string or null');
  }
  if (!Array.isArray(manifest.files)) throw new Error('Repo manifest files must be an array');
  if (!isPlainObject(manifest.counts)) throw new Error('Repo manifest counts must be an object');
  return {
    schemaVersion: REPO_DATA_SCHEMA_VERSION,
    layout: REPO_DATA_LAYOUT,
    generatedAt: manifest.generatedAt,
    appVersion: manifest.appVersion,
    counts: {
      questions: requireNumber(manifest.counts.questions, 'manifest.counts.questions'),
      customClasses: requireNumber(manifest.counts.customClasses, 'manifest.counts.customClasses'),
      savedTests: requireNumber(manifest.counts.savedTests, 'manifest.counts.savedTests'),
      images: requireNumber(manifest.counts.images, 'manifest.counts.images'),
      narratives: manifest.counts.narratives === undefined
        ? 0
        : requireNumber(manifest.counts.narratives, 'manifest.counts.narratives'),
    },
    files: manifest.files.map((file, index) => {
      if (!isPlainObject(file)) throw new Error('Malformed manifest file entry');
      const path = normalizeRepoPath(requireString(file.path, `manifest.files[${index}].path`));
      if (path === REPO_MANIFEST_PATH) throw new Error('Manifest cannot list itself');
      return {
        path,
        contentType: requireString(file.contentType, `manifest.files[${index}].contentType`),
        size: requireNumber(file.size, `manifest.files[${index}].size`),
        hash: requireString(file.hash, `manifest.files[${index}].hash`),
      };
    }),
  };
}

function validateManifest(entries: Map<string, RepoDataEntry>, manifest: RepoDataManifest): void {
  for (const requiredPath of ['README.md', 'curriculum/custom-classes.json', 'questions/index.json', 'tests/index.json']) {
    if (!entries.has(requiredPath)) {
      throw new Error(`Missing required repo file: ${requiredPath}`);
    }
  }

  const listedPaths = new Set<string>();
  for (const file of manifest.files) {
    if (listedPaths.has(file.path)) throw new Error(`Duplicate manifest path: ${file.path}`);
    listedPaths.add(file.path);
    const entry = entries.get(file.path);
    if (!entry) throw new Error(`Manifest lists missing file: ${file.path}`);
    const actualSize = repoDataContentByteLength(entry.content);
    const actualHash = hashRepoDataContent(entry.content);
    if (actualSize !== file.size) throw new Error(`Size mismatch for ${file.path}`);
    if (actualHash !== file.hash) throw new Error(`Hash mismatch for ${file.path}`);
    if (contentTypeForPath(file.path) !== file.contentType) {
      throw new Error(`Content type mismatch for ${file.path}`);
    }
  }

  for (const path of entries.keys()) {
    if (path === REPO_MANIFEST_PATH) continue;
    if (!listedPaths.has(path)) throw new Error(`Repo contains unmanifested file: ${path}`);
  }
}

function validateAndNormalizeEntries(entries: RepoDataEntry[]): Map<string, RepoDataEntry> {
  if (entries.length > REPO_DATA_LIMITS.maxFileCount) {
    throw new Error(`Repo contains too many files: ${entries.length}`);
  }

  const normalizedEntries = new Map<string, RepoDataEntry>();
  const normalizedKeys = new Map<string, string>();
  let totalBytes = 0;

  for (const entry of entries) {
    if (entry.kind !== 'file') {
      throw new Error(`Unsupported repo entry kind for ${String(entry.path)}`);
    }
    const path = normalizeRepoPath(entry.path);
    if (path !== entry.path) {
      throw new Error(`Repo path is not normalized: ${entry.path}`);
    }
    validateAllowedRepoPath(path);

    const duplicateKey = normalizedDuplicateKey(path);
    const duplicate = normalizedKeys.get(duplicateKey);
    if (duplicate) {
      throw new Error(`Duplicate normalized repo path: ${duplicate} and ${path}`);
    }
    normalizedKeys.set(duplicateKey, path);

    const size = repoDataContentByteLength(entry.content);
    totalBytes += size;
    if (totalBytes > REPO_DATA_LIMITS.maxTotalBytes) {
      throw new Error('Repo data exceeds total size limit');
    }
    validateEntrySize(path, size);

    normalizedEntries.set(path, { ...entry, path });
  }

  return normalizedEntries;
}

function validateEntryPathSet(entries: RepoDataEntry[]): void {
  validateAndNormalizeEntries(entries);
}

function validateAllowedRepoPath(path: string): void {
  if (
    path === 'README.md'
    || path === REPO_MANIFEST_PATH
    || path === 'curriculum/custom-classes.json'
    || path === 'questions/index.json'
    || path === 'narratives/index.json'
    || path === 'tests/index.json'
  ) {
    return;
  }
  if (/^questions\/[^/]+\.json$/.test(path) || /^narratives\/[^/]+\.json$/.test(path) || /^tests\/[^/]+\.json$/.test(path)) {
    return;
  }
  if (/^images\/[^/]+$/.test(path) && imageExtensionFromPath(path)) {
    return;
  }
  throw new Error(`Unexpected repo path: ${path}`);
}

function validateEntrySize(path: string, size: number): void {
  if (path.startsWith('images/')) {
    if (size > REPO_DATA_LIMITS.maxImageFileBytes) {
      throw new Error(`Image file exceeds size limit: ${path}`);
    }
    return;
  }
  if (size > REPO_DATA_LIMITS.maxTextFileBytes) {
    throw new Error(`Text file exceeds size limit: ${path}`);
  }
}

function normalizeRepoPathForId(id: string, kind: 'question' | 'narrative' | 'test'): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(id)) {
    throw new Error(`Unsafe ${kind} id for repo filename: ${id}`);
  }
  const filename = `${id}.json`;
  validateRepoPathSegment(filename, filename);
  return filename;
}

function questionFilename(id: string): string {
  return `questions/${normalizeRepoPathForId(id, 'question')}`;
}

function narrativeFilename(id: string): string {
  return `narratives/${normalizeRepoPathForId(id, 'narrative')}`;
}

function testFilename(id: string): string {
  return `tests/${normalizeRepoPathForId(id, 'test')}`;
}

function imagePath(image: Pick<RepoDataImage, 'name' | 'ext'>): string {
  const name = validateBareFilename(image.name, 'image name');
  const ext = image.ext.toLowerCase();
  if (!IMAGE_MIME_BY_EXTENSION[ext]) throw new Error(`Unsupported image extension: ${image.ext}`);
  return `images/${name}.${ext}`;
}

function importImageEntry(entry: RepoDataEntry): RepoDataImage {
  if (typeof entry.content === 'string') {
    throw new Error(`Image content must be binary: ${entry.path}`);
  }
  const filename = entry.path.slice('images/'.length);
  const dot = filename.lastIndexOf('.');
  if (dot <= 0) throw new Error(`Image filename must include an extension: ${entry.path}`);
  const name = validateBareFilename(filename.slice(0, dot), 'image name');
  const ext = filename.slice(dot + 1).toLowerCase();
  const mime = IMAGE_MIME_BY_EXTENSION[ext];
  if (!mime) throw new Error(`Unsupported image extension: ${entry.path}`);
  return {
    name,
    ext,
    mime,
    size: entry.content.byteLength,
    bytes: entry.content,
  };
}

function contentTypeForPath(path: string): string {
  if (path.endsWith('.json')) return 'application/json; charset=utf-8';
  if (path.endsWith('.md')) return 'text/markdown; charset=utf-8';
  const imageExt = imageExtensionFromPath(path);
  if (imageExt) return IMAGE_MIME_BY_EXTENSION[imageExt];
  throw new Error(`Unknown content type for path: ${path}`);
}

function imageExtensionFromPath(path: string): string | null {
  const filename = path.slice(path.lastIndexOf('/') + 1);
  const dot = filename.lastIndexOf('.');
  if (dot <= 0) return null;
  const ext = filename.slice(dot + 1).toLowerCase();
  return IMAGE_MIME_BY_EXTENSION[ext] ? ext : null;
}

function readRequiredText(entries: Map<string, RepoDataEntry>, path: string): string {
  const entry = entries.get(path);
  if (!entry) throw new Error(`Missing required repo file: ${path}`);
  if (typeof entry.content === 'string') return entry.content;
  try {
    return TEXT_DECODER.decode(entry.content);
  } catch {
    throw new Error(`Repo text file is not valid UTF-8: ${path}`);
  }
}

function parseJsonObject(raw: string, path: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    if (!isPlainObject(parsed)) throw new Error('not an object');
    return parsed;
  } catch (error) {
    throw new Error(`Invalid JSON in ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function sanitizeQuestion(question: Question): Question {
  const sanitized: Question = {
    id: question.id,
    narrative: question.narrative,
    narrativeId: question.narrativeId,
    body: question.body,
    parts: question.parts,
    algorithmModel: question.algorithmModel,
    algorithmEvaluation: question.algorithmEvaluation,
    graphModel: question.graphModel,
    graphTypst: question.graphTypst,
    decodeDiagnostics: question.decodeDiagnostics,
    questionType: question.questionType,
    answer: question.answer,
    solution: question.solution,
    choices: question.choices,
    points: question.points,
    tags: [...question.tags],
    images: question.images ? [...question.images] : undefined,
    classId: question.classId,
    unitId: question.unitId,
    sectionId: question.sectionId,
    createdAt: question.createdAt,
    updatedAt: question.updatedAt,
  };
  validateQuestion(sanitized);
  return stripUndefined(sanitized) as Question;
}

function sanitizeNarrative(narrative: Narrative): Narrative {
  const sanitized: Narrative = {
    id: narrative.id,
    title: narrative.title,
    body: narrative.body,
    tags: [...narrative.tags],
    classId: narrative.classId,
    unitId: narrative.unitId,
    sectionId: narrative.sectionId,
    createdAt: narrative.createdAt,
    updatedAt: narrative.updatedAt,
  };
  validateNarrative(sanitized);
  return stripUndefined(sanitized) as Narrative;
}

function sanitizeClass(cls: Class): Class {
  const sanitized: Class = {
    id: cls.id,
    name: cls.name,
    units: cls.units.map((unit) => ({
      id: unit.id,
      name: unit.name,
      sections: unit.sections.map((section) => ({
        id: section.id,
        name: section.name,
      })),
    })),
  };
  validateClass(sanitized);
  return sanitized;
}

function sanitizeSavedTest(test: SavedTest): SavedTest {
  const sanitized: SavedTest = {
    id: test.id,
    name: test.name,
    classId: test.classId,
    unitId: test.unitId,
    testType: test.testType,
    config: stripUndefined(test.config) as SavedTest['config'],
    createdAt: test.createdAt,
    updatedAt: test.updatedAt,
  };
  validateSavedTest(sanitized);
  return sanitized;
}

function validateQuestion(raw: unknown): Question {
  if (!isPlainObject(raw)) throw new Error('Question must be an object');
  const question = raw as Partial<Question>;
  requireSafeId(requireString(question.id, 'question.id'), 'question');
  requireString(question.body, `question(${question.id}).body`);
  requireNumber(question.points, `question(${question.id}).points`);
  requireNumber(question.createdAt, `question(${question.id}).createdAt`);
  if (!Array.isArray(question.tags) || !question.tags.every((tag) => typeof tag === 'string')) {
    throw new Error(`Question tags must be strings: ${question.id}`);
  }
  if (question.images !== undefined && (!Array.isArray(question.images) || !question.images.every((image) => typeof image === 'string'))) {
    throw new Error(`Question images must be strings: ${question.id}`);
  }
  if (question.updatedAt !== undefined) requireNumber(question.updatedAt, `question(${question.id}).updatedAt`);
  for (const optionalString of ['narrative', 'narrativeId', 'graphTypst', 'questionType', 'answer', 'solution', 'classId', 'unitId', 'sectionId'] as const) {
    if (question[optionalString] !== undefined) requireString(question[optionalString], `question(${question.id}).${optionalString}`);
  }
  if (question.parts !== undefined) validateQuestionParts(question.parts, `question(${question.id}).parts`);
  if (question.choices !== undefined) validateStringRecord(question.choices, `question(${question.id}).choices`);
  for (const field of ['algorithmModel', 'algorithmEvaluation', 'graphModel', 'decodeDiagnostics'] as const) {
    if (question[field] !== undefined) validateJsonValue(question[field], `question(${question.id}).${field}`);
  }
  rejectExecutableContent(question, `question(${question.id})`);
  return stripUndefined(question) as Question;
}

function validateNarrative(raw: unknown): Narrative {
  if (!isPlainObject(raw)) throw new Error('Narrative must be an object');
  const narrative = raw as Partial<Narrative>;
  requireSafeId(requireString(narrative.id, 'narrative.id'), 'narrative');
  requireString(narrative.title, `narrative(${narrative.id}).title`);
  requireString(narrative.body, `narrative(${narrative.id}).body`);
  requireNumber(narrative.createdAt, `narrative(${narrative.id}).createdAt`);
  if (!Array.isArray(narrative.tags) || !narrative.tags.every((tag) => typeof tag === 'string')) {
    throw new Error(`Narrative tags must be strings: ${narrative.id}`);
  }
  if (narrative.updatedAt !== undefined) requireNumber(narrative.updatedAt, `narrative(${narrative.id}).updatedAt`);
  for (const optionalString of ['classId', 'unitId', 'sectionId'] as const) {
    if (narrative[optionalString] !== undefined) requireString(narrative[optionalString], `narrative(${narrative.id}).${optionalString}`);
  }
  rejectExecutableContent(narrative, `narrative(${narrative.id})`);
  return stripUndefined(narrative) as Narrative;
}

function validateQuestionParts(raw: unknown, label: string): void {
  if (!isPlainObject(raw)) throw new Error(`${label} must be an object`);
  requireString(raw.stem, `${label}.stem`);
  if (!Array.isArray(raw.items)) throw new Error(`${label}.items must be an array`);
  for (let index = 0; index < raw.items.length; index += 1) {
    const item = raw.items[index];
    if (!isPlainObject(item)) throw new Error(`${label}.items[${index}] must be an object`);
    if (item.label !== undefined) requireString(item.label, `${label}.items[${index}].label`);
    requireString(item.body, `${label}.items[${index}].body`);
    if (item.parts !== undefined) validateQuestionParts(item.parts, `${label}.items[${index}].parts`);
  }
}

function validateClass(raw: unknown): Class {
  if (!isPlainObject(raw)) throw new Error('Class must be an object');
  const cls = raw as Partial<Class>;
  requireSafeId(requireString(cls.id, 'class.id'), 'class');
  requireString(cls.name, `class(${cls.id}).name`);
  if (!Array.isArray(cls.units)) throw new Error(`Class units must be an array: ${cls.id}`);
  for (const unit of cls.units) {
    if (!isPlainObject(unit)) throw new Error(`Class unit must be an object: ${cls.id}`);
    requireString(unit.id, `class(${cls.id}).unit.id`);
    requireString(unit.name, `class(${cls.id}).unit.name`);
    if (!Array.isArray(unit.sections)) throw new Error(`Unit sections must be an array: ${unit.id}`);
    for (const section of unit.sections) {
      if (!isPlainObject(section)) throw new Error(`Section must be an object: ${unit.id}`);
      requireString(section.id, `unit(${unit.id}).section.id`);
      requireString(section.name, `unit(${unit.id}).section.name`);
    }
  }
  return stripUndefined(cls) as Class;
}

function validateSavedTest(raw: unknown): SavedTest {
  if (!isPlainObject(raw)) throw new Error('Saved test must be an object');
  const test = raw as Partial<SavedTest>;
  requireSafeId(requireString(test.id, 'savedTest.id'), 'saved test');
  requireString(test.name, `savedTest(${test.id}).name`);
  requireStringOrNull(test.classId, `savedTest(${test.id}).classId`);
  requireStringOrNull(test.unitId, `savedTest(${test.id}).unitId`);
  requireStringOrNull(test.testType, `savedTest(${test.id}).testType`);
  requireNumber(test.createdAt, `savedTest(${test.id}).createdAt`);
  requireNumber(test.updatedAt, `savedTest(${test.id}).updatedAt`);
  if (!isPlainObject(test.config)) throw new Error(`Saved test config must be an object: ${test.id}`);
  validateJsonValue(test.config, `savedTest(${test.id}).config`);
  return stripUndefined(test) as SavedTest;
}

function validateJsonValue(value: unknown, label: string): void {
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
  ) {
    return;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      validateJsonValue(value[index], `${label}[${index}]`);
    }
    return;
  }
  if (isPlainObject(value)) {
    for (const [key, nested] of Object.entries(value)) {
      validateJsonValue(nested, `${label}.${key}`);
    }
    return;
  }
  throw new Error(`${label} must be JSON-serializable`);
}

function validateStringRecord(value: unknown, label: string): void {
  if (!isPlainObject(value)) throw new Error(`${label} must be an object`);
  for (const [key, nested] of Object.entries(value)) {
    if (typeof nested !== 'string') throw new Error(`${label}.${key} must be a string`);
  }
}

function validateExportImageReferences(questions: Question[], images: RepoDataImage[]): void {
  const imageTargets = buildImageTargetIndex(images);
  for (const question of questions) {
    for (const ref of question.images ?? []) {
      resolveImageReference(ref, imageTargets, `question(${question.id}).images`);
    }
  }
}

function validateImportedImageReferences(questions: Question[], images: RepoDataImage[]): void {
  validateExportImageReferences(questions, images);
}

function validateNarrativeReferences(questions: Question[], narratives: Narrative[]): void {
  const narrativeIds = new Set(narratives.map((narrative) => narrative.id));
  for (const question of questions) {
    const narrativeId = question.narrativeId?.trim();
    if (!narrativeId) continue;
    if (!narrativeIds.has(narrativeId) && !question.narrative?.trim()) {
      throw new Error(`Missing narrative target for question(${question.id}).narrativeId: ${narrativeId}`);
    }
  }
}

function buildImageTargetIndex(images: RepoDataImage[]): Map<string, string[]> {
  const targets = new Map<string, string[]>();
  for (const image of images) {
    const path = imagePath(image);
    const filename = path.slice('images/'.length);
    const stem = filename.slice(0, filename.lastIndexOf('.'));
    for (const key of [filename.toLowerCase(), stem.toLowerCase()]) {
      targets.set(key, [...(targets.get(key) ?? []), path]);
    }
  }
  return targets;
}

function resolveImageReference(ref: string, imageTargets: Map<string, string[]>, label: string): string {
  const filename = validateBareFilename(ref, label);
  const matches = imageTargets.get(filename.toLowerCase()) ?? [];
  if (matches.length === 0) {
    throw new Error(`Missing image target for ${label}: ${ref}`);
  }
  if (matches.length > 1) {
    throw new Error(`Ambiguous image target for ${label}: ${ref}`);
  }
  return matches[0];
}

function rejectExecutableContent(value: unknown, label: string): void {
  if (typeof value === 'string') {
    if (/<\s*(script|iframe|object|embed)\b/i.test(value) || /\bon[a-z]+\s*=/i.test(value) || /\bjavascript\s*:/i.test(value)) {
      throw new Error(`Executable markup is not allowed in ${label}`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectExecutableContent(item, `${label}[${index}]`));
    return;
  }
  if (isPlainObject(value)) {
    for (const [key, nested] of Object.entries(value)) {
      rejectExecutableContent(nested, `${label}.${key}`);
    }
  }
}

function validateRepoPathSegment(segment: string, fullPath: string): void {
  if (segment.length === 0) throw new Error(`Repo path contains an empty segment: ${fullPath}`);
  if (segment.length > REPO_DATA_LIMITS.maxSegmentLength) {
    throw new Error(`Repo path segment is too long: ${fullPath}`);
  }
  if (segment !== segment.trim()) {
    throw new Error(`Repo path segment has leading or trailing whitespace: ${fullPath}`);
  }
  if (segment === '.' || segment === '..') {
    throw new Error(`Repo path cannot contain dot segments: ${fullPath}`);
  }
  if (segment.toLowerCase() === '.git') {
    throw new Error(`Repo path cannot contain .git: ${fullPath}`);
  }
  if (/[\u0000-\u001f\u007f]/.test(segment)) {
    throw new Error(`Repo path contains control characters: ${fullPath}`);
  }
  const deviceName = segment.split('.')[0].toLowerCase();
  if (RESERVED_DEVICE_NAMES.has(deviceName)) {
    throw new Error(`Repo path contains a reserved device name: ${fullPath}`);
  }
}

function validateBareFilename(name: string, label: string): string {
  if (typeof name !== 'string' || !name) throw new Error(`${label} must be a non-empty filename`);
  if (name.includes('/') || name.includes('\\') || name.includes('\0') || name.includes(':')) {
    throw new Error(`${label} must not contain path separators or URL schemes`);
  }
  validateRepoPathSegment(name, name);
  return name;
}

function safeDecodeURIComponent(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    throw new Error(`Repo path contains malformed URL encoding: ${path}`);
  }
}

function normalizedDuplicateKey(path: string): string {
  return path.normalize('NFC').toLowerCase();
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJson(value), null, 2);
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!isPlainObject(value)) return value;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    const nested = value[key];
    if (nested !== undefined) sorted[key] = sortJson(nested);
  }
  return sorted;
}

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(stripUndefined) as T;
  }
  if (!isPlainObject(value)) return value;
  const cleaned: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    if (nested !== undefined) cleaned[key] = stripUndefined(nested);
  }
  return cleaned as T;
}

function sortEntries(entries: RepoDataEntry[]): RepoDataEntry[] {
  return [...entries].sort((left, right) => compareStrings(left.path, right.path));
}

function sortById<T extends { id: string }>(items: T[]): T[] {
  return [...items].sort((left, right) => compareStrings(left.id, right.id));
}

function sortImages(images: RepoDataImage[]): RepoDataImage[] {
  return [...images].sort((left, right) => compareStrings(imagePath(left), imagePath(right)));
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertSameSet(actualItems: string[], expectedItems: Set<string>, label: string): void {
  const actual = new Set(actualItems);
  if (actual.size !== actualItems.length) throw new Error(`Duplicate ${label}`);
  for (const item of actual) {
    if (!expectedItems.has(item)) throw new Error(`Unexpected ${label}: ${item}`);
  }
  for (const item of expectedItems) {
    if (!actual.has(item)) throw new Error(`Missing ${label}: ${item}`);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be a string`);
  return value;
}

function requireStringOrNull(value: unknown, label: string): string | null {
  if (value === null) return null;
  return requireString(value, label);
}

function requireNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} must be a finite number`);
  return value;
}

function requireSafeId(id: string, kind: string): string {
  const fileKind = kind === 'question' || kind === 'narrative' ? kind : 'test';
  normalizeRepoPathForId(id, fileKind);
  return id;
}
