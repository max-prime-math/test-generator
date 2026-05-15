import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

type DraftQuestion = {
  body: string;
  answer: string;
  solution: string;
  choices?: Record<string, string>;
  points: number;
  tagInput: string;
  classId: string;
  unitId: string;
  sectionId: string;
  images?: string[];
  questionType?: string;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..');
const workspaceRoot = resolve(repoRoot, '..');
const decoderEntry = resolve(workspaceRoot, 'bnk-decoder/packages/bnk-core/src/index.ts');

async function loadDecoder() {
  try {
    return await import(pathToFileURL(decoderEntry).href);
  } catch (error) {
    throw new Error(
      `Could not load bnk-decoder from ${decoderEntry}. ` +
      'This bridge expects the sibling bnk-decoder repo to exist in the shared workspace.',
      { cause: error },
    );
  }
}

function usage(): never {
  console.error('Usage: npm run import:bnk -- <path-to-bnk> [output-file]');
  process.exit(1);
}

function resolveInputPath(rawPath: string): string {
  return isAbsolute(rawPath) ? rawPath : resolve(process.cwd(), rawPath);
}

function defaultOutputPath(inputPath: string): string {
  const base = basename(inputPath).replace(/\.[^.]+$/, '');
  return resolve(process.cwd(), `${base}.test-generator-import.json`);
}

function summarizeTypes(drafts: DraftQuestion[]): Record<string, number> {
  const counts = new Map<string, number>();
  for (const draft of drafts) {
    const key = draft.questionType || 'unknown';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries(counts);
}

const inputArg = process.argv[2];
if (!inputArg) usage();

const inputPath = resolveInputPath(inputArg);
const outputPath = resolveInputPath(process.argv[3] ?? defaultOutputPath(inputPath));

const decoder = await loadDecoder();
const bytes = readFileSync(inputPath);
const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const result = await decoder.decodeBnkFile(arrayBuffer, { filename: inputPath });
const drafts = decoder.toDraftQuestions(result) as DraftQuestion[];

const output = {
  source: {
    kind: 'bnk',
    label: basename(inputPath),
    originFiles: [inputPath],
  },
  producer: {
    app: 'bnk-decoder',
    exportedAt: new Date().toISOString(),
  },
  diagnostics: result.diagnostics,
  questions: drafts,
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);

console.log(`Decoded ${inputPath}`);
console.log(`Questions: ${result.stats.questionCount}`);
console.log(`Draft questions: ${drafts.length}`);
console.log(`Assets: ${result.stats.assetCount}`);
console.log(`Diagnostics: ${result.stats.diagnosticCount}`);
console.log(`Unsupported fragments: ${result.stats.unsupportedFragmentCount}`);
console.log(`Type histogram: ${JSON.stringify(summarizeTypes(drafts))}`);
console.log(`Wrote ${outputPath}`);
