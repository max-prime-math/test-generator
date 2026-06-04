import assert from 'node:assert/strict';
import {
  exportAppDataToRepoEntries,
  hashRepoDataContent,
  importRepoEntriesToAppData,
  isReservedRepoPath,
  normalizeRepoPath,
  repoDataContentByteLength,
  REPO_DATA_LIMITS,
  REPO_MANIFEST_PATH,
  type RepoAppData,
  type RepoDataEntry,
} from '../src/git/repoDataModel.ts';
import { defaultTestConfig, type Question, type SavedTest } from '../src/lib/types.ts';

const question: Question = {
  id: 'q-1',
  narrative: 'Use the shared graph for this problem.',
  body: 'Find #math.lim_(x -> 0) f(x).',
  parts: {
    stem: 'Answer both parts.',
    items: [
      { label: 'a', body: 'Estimate from the graph.' },
      {
        label: 'b',
        body: 'Justify algebraically.',
        parts: {
          stem: 'Nested work',
          items: [
            { label: 'i', body: 'State the rule.' },
            { label: 'ii', body: 'Apply it.' },
          ],
        },
      },
    ],
  },
  algorithmModel: {
    scope: { kind: 'question' },
    definitions: [
      {
        id: 'alg-1',
        name: 'a',
        kind: 'variable',
        rawExpression: '2',
        dependencies: [],
        source: 'comment',
      },
    ],
    sequence: [
      {
        id: 'seq-1',
        order: 1,
        text: 'a = 2',
        kind: 'rule',
        ownerKind: 'question',
        definitionName: 'a',
        source: 'comment',
      },
    ],
    source: 'comment',
  },
  algorithmEvaluation: {
    entries: [{ name: 'a', status: 'resolved', value: '2' }],
    diagnostics: [{ level: 'info', code: 'sample', message: 'ok' }],
  },
  graphModel: {
    family: 'cartesian',
    objects: [
      {
        id: 'g-1',
        kind: 'function',
        expression: 'x^2',
        typstMath: 'x^2',
        latexMath: 'x^2',
        variables: ['x'],
        samplePoints: [{ x: 0, y: 0 }],
      },
    ],
    variables: { a: '2' },
    rawExpressions: ['y=x^2'],
    source: 'graph-comment',
  },
  graphTypst: '#graph(width: 4cm)',
  decodeDiagnostics: [{ level: 'warning', code: 'graph-check', message: 'Graph needs review' }],
  questionType: 'mcq',
  answer: 'B',
  solution: 'The answer is B.',
  choices: { A: '0', B: '1', C: '2', D: '3' },
  points: 2,
  tags: ['limits', 'graphs'],
  images: ['diagram'],
  classId: 'custom-calc',
  unitId: 'u-1',
  sectionId: 's-1',
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_001_000,
  renderError: 'transient typst failure',
  checked: true,
};

const savedTest: SavedTest = {
  id: 't-1',
  name: 'Limits Quiz',
  classId: 'custom-calc',
  unitId: 'u-1',
  testType: 'quiz',
  config: {
    ...defaultTestConfig('Calculus'),
    subtitle: 'Limits Quiz',
    date: 'June 2, 2026',
    selectedIds: ['q-1'],
    answerSpaceOverrides: { 'q-1': 5 },
    choiceOverrides: {
      'q-1': {
        choices: { A: '0', B: '1', C: '2', D: '3' },
        solution: 'The answer is B.',
      },
    },
    pageBreakAfter: { 'q-1': { pagebreak: true } },
  },
  createdAt: 1_700_000_002_000,
  updatedAt: 1_700_000_003_000,
};

const appData: RepoAppData = {
  questions: [question],
  customClasses: [
    {
      id: 'custom-calc',
      name: 'Custom Calculus',
      units: [
        {
          id: 'u-1',
          name: 'Limits',
          sections: [{ id: 's-1', name: 'Graphical Limits' }],
        },
      ],
    },
  ],
  savedTests: [savedTest],
  images: [
    {
      name: 'diagram',
      ext: 'png',
      mime: 'image/png',
      size: 4,
      bytes: new Uint8Array([137, 80, 78, 71]),
    },
  ],
  demoQuestions: [
    {
      ...question,
      id: 'demo-q',
      classId: 'ap-calc-bc',
      images: undefined,
      renderError: undefined,
      checked: undefined,
    },
  ],
};

const exportOptions = {
  generatedAt: '2026-06-02T12:00:00.000Z',
  appVersion: 'test-version',
};

function entryText(entries: RepoDataEntry[], path: string): string {
  const entry = entries.find((candidate) => candidate.path === path);
  assert.ok(entry, `missing ${path}`);
  assert.equal(typeof entry.content, 'string');
  return entry.content as string;
}

function entryBytes(entries: RepoDataEntry[], path: string): Uint8Array {
  const entry = entries.find((candidate) => candidate.path === path);
  assert.ok(entry, `missing ${path}`);
  assert.ok(entry.content instanceof Uint8Array);
  return entry.content;
}

function signature(entries: RepoDataEntry[]): string {
  return JSON.stringify(entries.map((entry) => ({
    path: entry.path,
    kind: entry.kind,
    content: typeof entry.content === 'string' ? entry.content : Array.from(entry.content),
  })));
}

function cloneEntries(entries: RepoDataEntry[]): RepoDataEntry[] {
  return entries.map((entry) => ({
    ...entry,
    content: typeof entry.content === 'string' ? entry.content : new Uint8Array(entry.content),
  }));
}

function replaceEntryContent(entries: RepoDataEntry[], path: string, content: string | Uint8Array): RepoDataEntry[] {
  const next = cloneEntries(entries).map((entry) => (entry.path === path ? { ...entry, content } : entry));
  refreshManifest(next);
  return next;
}

function removeEntry(entries: RepoDataEntry[], path: string): RepoDataEntry[] {
  const next = cloneEntries(entries).filter((entry) => entry.path !== path);
  const manifestEntry = next.find((entry) => entry.path === REPO_MANIFEST_PATH);
  assert.ok(manifestEntry && typeof manifestEntry.content === 'string');
  const manifest = JSON.parse(manifestEntry.content);
  manifest.files = manifest.files.filter((file: { path: string }) => file.path !== path);
  manifestEntry.content = JSON.stringify(manifest, null, 2);
  refreshManifest(next);
  return next;
}

function refreshManifest(entries: RepoDataEntry[]): void {
  const manifestEntry = entries.find((entry) => entry.path === REPO_MANIFEST_PATH);
  assert.ok(manifestEntry && typeof manifestEntry.content === 'string');
  const manifest = JSON.parse(manifestEntry.content);
  for (const file of manifest.files as Array<{ path: string; size: number; hash: string }>) {
    const entry = entries.find((candidate) => candidate.path === file.path);
    assert.ok(entry, `manifest references missing ${file.path}`);
    file.size = repoDataContentByteLength(entry.content);
    file.hash = hashRepoDataContent(entry.content);
  }
  manifestEntry.content = JSON.stringify(manifest, null, 2);
}

async function assertReject(label: string, fn: () => unknown): Promise<void> {
  try {
    await fn();
  } catch {
    return;
  }
  assert.fail(`${label} should have been rejected`);
}

const entries = exportAppDataToRepoEntries(appData, exportOptions);

assert.deepEqual(entries.map((entry) => entry.path), [
  'README.md',
  'curriculum/custom-classes.json',
  'images/diagram.png',
  'manifest.json',
  'questions/index.json',
  'questions/q-1.json',
  'tests/index.json',
  'tests/t-1.json',
]);

assert.equal(entryBytes(entries, 'images/diagram.png').byteLength, 4);
assert.ok(!entries.some((entry) => entry.path.includes('demo-q')));

const questionFile = JSON.parse(entryText(entries, 'questions/q-1.json'));
assert.equal(questionFile.question.choices.B, '1');
assert.equal(questionFile.question.parts.items[1].parts.items[0].body, 'State the rule.');
assert.equal(questionFile.question.graphModel.objects[0].expression, 'x^2');
assert.equal(questionFile.question.decodeDiagnostics[0].code, 'graph-check');
assert.equal('renderError' in questionFile.question, false);
assert.equal('checked' in questionFile.question, false);

const testFile = JSON.parse(entryText(entries, 'tests/t-1.json'));
assert.equal(testFile.test.name, 'Limits Quiz');
assert.deepEqual(testFile.test.config.selectedIds, ['q-1']);

const classesFile = JSON.parse(entryText(entries, 'curriculum/custom-classes.json'));
assert.equal(classesFile.classes[0].units[0].sections[0].name, 'Graphical Limits');

const roundTrip = importRepoEntriesToAppData(entries).appData;
const expectedQuestion = {
  ...question,
  renderError: undefined,
  checked: undefined,
};
delete (expectedQuestion as Partial<Question>).renderError;
delete (expectedQuestion as Partial<Question>).checked;
assert.deepEqual(roundTrip.questions, [expectedQuestion]);
assert.deepEqual(roundTrip.customClasses, appData.customClasses);
assert.deepEqual(roundTrip.savedTests, [savedTest]);
assert.equal(roundTrip.images?.[0].name, 'diagram');
assert.equal(roundTrip.images?.[0].ext, 'png');
assert.deepEqual(Array.from(roundTrip.images?.[0].bytes ?? []), [137, 80, 78, 71]);

const shuffledData: RepoAppData = {
  ...appData,
  questions: [...appData.questions].reverse(),
  customClasses: [...appData.customClasses].reverse(),
  savedTests: [...appData.savedTests].reverse(),
  images: [...(appData.images ?? [])].reverse(),
};
assert.equal(signature(entries), signature(exportAppDataToRepoEntries(shuffledData, exportOptions)));

assert.equal(normalizeRepoPath('questions/q-1.json'), 'questions/q-1.json');
assert.equal(isReservedRepoPath('/questions/q-1.json'), true);
assert.equal(isReservedRepoPath('questions/../q-1.json'), true);
assert.equal(isReservedRepoPath('questions/.git/config'), true);
assert.equal(isReservedRepoPath('questions/bad\\path.json'), true);
assert.equal(isReservedRepoPath('questions/%2e%2e/q-1.json'), true);
assert.equal(isReservedRepoPath('images/CON.png'), true);
assert.equal(isReservedRepoPath('images/ diagram.png'), true);

await assertReject('absolute path', () => importRepoEntriesToAppData([
  ...entries,
  { path: '/evil.json', kind: 'file', content: '{}' },
]));

await assertReject('.git path', () => importRepoEntriesToAppData([
  ...entries,
  { path: '.git/config', kind: 'file', content: 'x' },
]));

await assertReject('case-insensitive duplicate path', () => importRepoEntriesToAppData([
  ...entries,
  { path: 'readme.md', kind: 'file', content: 'duplicate' },
]));

await assertReject('oversized image blob', () => importRepoEntriesToAppData(
  replaceEntryContent(entries, 'images/diagram.png', new Uint8Array(REPO_DATA_LIMITS.maxImageFileBytes + 1)),
));

const unsupportedManifest = cloneEntries(entries);
const manifestEntry = unsupportedManifest.find((entry) => entry.path === REPO_MANIFEST_PATH);
assert.ok(manifestEntry && typeof manifestEntry.content === 'string');
manifestEntry.content = JSON.stringify({
  ...JSON.parse(manifestEntry.content),
  schemaVersion: 999,
}, null, 2);
await assertReject('unsupported schema version', () => importRepoEntriesToAppData(unsupportedManifest));

await assertReject('missing image reference target', () => importRepoEntriesToAppData(
  removeEntry(entries, 'images/diagram.png'),
));

const executableQuestionFile = JSON.parse(entryText(entries, 'questions/q-1.json'));
executableQuestionFile.question.body = '<script>alert(1)</script>';
await assertReject('executable rich content', () => importRepoEntriesToAppData(
  replaceEntryContent(entries, 'questions/q-1.json', JSON.stringify(executableQuestionFile, null, 2)),
));

const traversalQuestionFile = JSON.parse(entryText(entries, 'questions/q-1.json'));
traversalQuestionFile.question.images = ['../diagram.png'];
await assertReject('malicious image reference', () => importRepoEntriesToAppData(
  replaceEntryContent(entries, 'questions/q-1.json', JSON.stringify(traversalQuestionFile, null, 2)),
));

console.log('repo data model tests passed');
