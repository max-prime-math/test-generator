import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Question } from '../src/lib/types.ts';

type TestGeneratorQuestion = Question & {
  images?: string[];
  questionType?: string;
};

type DecodedAssetLike = {
  id: string;
  kind: string;
  filename?: string;
  mimeType?: string;
  bytes: Uint8Array;
};

type ExportedImage = {
  name: string;
  ext: string;
  mime?: string;
  size: number;
  data: string;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..');
const workspaceRoot = resolve(repoRoot, '..');
const decoderEntry = resolve(workspaceRoot, 'bnk-decoder/packages/bnk-core/src/index.ts');
const supportedImageExtensions = new Set(['png', 'jpg', 'jpeg', 'svg', 'webp', 'gif', 'bmp', 'pdf']);

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

function splitFilename(name: string): { stem: string; ext: string } {
  const last = name.split(/[/\\]/).pop() ?? name;
  const i = last.lastIndexOf('.');
  if (i <= 0) return { stem: last, ext: '' };
  return { stem: last.slice(0, i), ext: last.slice(i + 1).toLowerCase() };
}

function imageExtensionFromAsset(asset: DecodedAssetLike): string {
  const filenameExt = asset.filename ? splitFilename(asset.filename).ext : '';
  if (filenameExt) return filenameExt;
  switch (asset.mimeType) {
    case 'image/png': return 'png';
    case 'image/jpeg': return 'jpg';
    case 'image/svg+xml': return 'svg';
    case 'image/webp': return 'webp';
    case 'image/gif': return 'gif';
    case 'image/bmp': return 'bmp';
    case 'application/pdf': return 'pdf';
    default: return '';
  }
}

function imageNameFromAsset(asset: DecodedAssetLike): string {
  if (asset.filename) {
    const { stem } = splitFilename(asset.filename);
    if (stem) return stem;
  }
  return asset.id;
}

function exportedImagesFromAssets(assets: DecodedAssetLike[]): ExportedImage[] {
  return assets
    .filter((asset) => asset.kind === 'image')
    .map((asset) => {
      const ext = imageExtensionFromAsset(asset);
      return {
        name: imageNameFromAsset(asset),
        ext,
        mime: asset.mimeType,
        size: asset.bytes.byteLength,
        data: Buffer.from(asset.bytes).toString('base64'),
      };
    })
    .filter((image) => image.name && image.ext && supportedImageExtensions.has(image.ext));
}

function summarizeTypes(questions: TestGeneratorQuestion[]): Record<string, number> {
  const counts = new Map<string, number>();
  for (const question of questions) {
    const key = question.questionType || 'unknown';
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
const questions = decoder.toTestGeneratorQuestions(result) as TestGeneratorQuestion[];
const customClasses = typeof decoder.toTestGeneratorCustomClasses === 'function'
  ? decoder.toTestGeneratorCustomClasses(result)
  : [];
const images = exportedImagesFromAssets(result.assets as DecodedAssetLike[]);

const output = {
  format: 'test-generator-question-bank',
  version: 2,
  exportedAt: new Date().toISOString(),
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
  questions,
  customClasses,
  images,
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);

console.log(`Decoded ${inputPath}`);
console.log(`Questions: ${result.stats.questionCount}`);
console.log(`TestGen questions: ${questions.length}`);
console.log(`Custom classes: ${customClasses.length}`);
console.log(`Assets: ${result.stats.assetCount}`);
console.log(`Importable images: ${images.length}`);
console.log(`Diagnostics: ${result.stats.diagnosticCount}`);
console.log(`Unsupported fragments: ${result.stats.unsupportedFragmentCount}`);
console.log(`Type histogram: ${JSON.stringify(summarizeTypes(questions))}`);
console.log(`Wrote ${outputPath}`);
