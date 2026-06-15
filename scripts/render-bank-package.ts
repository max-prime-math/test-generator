import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { generateTypst } from '../src/lib/typst/template.ts';
import { defaultTestConfig, type Question } from '../src/lib/types.ts';

interface ExportedImage {
  name: string;
  ext: string;
  data: string;
}

interface BankPackage {
  format?: string;
  source?: {
    label?: string;
  };
  questions?: Question[];
  images?: ExportedImage[];
}

function usage(): never {
  console.error('Usage: npm run render:bank -- <test-generator-import.json> [out-dir]');
  process.exit(1);
}

function safeStem(name: string): string {
  return basename(name).replace(/\.[^.]+$/, '').replace(/[^\w .-]+/g, '-').trim() || 'question-bank';
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function decodeBase64(data: string): Uint8Array {
  return Buffer.from(data, 'base64');
}

function imageMap(images: ExportedImage[] = []): Map<string, string> {
  const map = new Map<string, string>();
  for (const image of images) {
    if (!image.name || !image.ext || !image.data) continue;
    map.set(image.name, image.ext.toLowerCase());
  }
  return map;
}

function writeImages(outDir: string, images: ExportedImage[] = []): Map<string, string> {
  const refs = new Map<string, string>();
  if (images.length === 0) return refs;

  const imageDir = join(outDir, 'imgs');
  mkdirSync(imageDir, { recursive: true });
  for (const image of images) {
    const inputExt = image.ext?.toLowerCase();
    if (!image.name || !inputExt || !image.data) continue;

    const bytes = decodeBase64(image.data);
    if (inputExt === 'bmp') {
      const bmpPath = join(imageDir, `${image.name}.bmp`);
      const pngPath = join(imageDir, `${image.name}.png`);
      writeFileSync(bmpPath, bytes);
      const converted = spawnSync('magick', [bmpPath, pngPath], {
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
      });
      if (converted.status === 0 && existsSync(pngPath)) {
        refs.set(image.name, 'png');
        continue;
      }
    }

    writeFileSync(join(imageDir, `${image.name}.${inputExt}`), bytes);
    refs.set(image.name, inputExt);
  }
  return refs;
}

function rewriteImageRefs(source: string, refs: Map<string, string>): string {
  let rewritten = source;
  for (const [name, ext] of refs) {
    const escapedName = escapeRegExp(name);
    const escapedExt = escapeRegExp(ext);
    rewritten = rewritten.replace(
      new RegExp(`(["'])/imgs/${escapedName}(?:\\.${escapedExt})?\\1`, 'g'),
      `$1imgs/${name}.${ext}$1`,
    );
  }
  return rewritten;
}

function compileTypst(typPath: string, pdfPath: string): string | null {
  if (!existsSync(typPath)) return `Typst source not found: ${typPath}`;
  const result = spawnSync('typst', ['compile', typPath, pdfPath], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) return result.error.message;
  if (result.status !== 0) return result.stderr || result.stdout || `typst exited ${result.status}`;
  return null;
}

const inputPath = process.argv[2] ? resolve(process.argv[2]) : '';
if (!inputPath) usage();

const parsed = JSON.parse(readFileSync(inputPath, 'utf8')) as BankPackage | Question[];
const pkg: BankPackage = Array.isArray(parsed) ? { questions: parsed } : parsed;
const questions = Array.isArray(pkg.questions) ? pkg.questions : [];
if (questions.length === 0) {
  throw new Error('Input package does not contain stored Test Generator questions.');
}

const defaultOutDir = join(process.cwd(), 'reports/rendered-bank-packages', safeStem(inputPath));
const outDir = process.argv[3] ? resolve(process.argv[3]) : defaultOutDir;
mkdirSync(outDir, { recursive: true });

const title = pkg.source?.label?.replace(/\.bnk$/i, '') || safeStem(inputPath);
const config = defaultTestConfig(title);
config.instructions = '';
config.mcqFirst = false;
config.showPoints = false;
config.answerSpace = 0;
config.showAnswerKey = false;
config.fontSize = 10;

const refs = writeImages(outDir, pkg.images);
const source = rewriteImageRefs(generateTypst(config, questions), refs);
const typPath = join(outDir, `${safeStem(inputPath)}.typ`);
const pdfPath = join(outDir, `${safeStem(inputPath)}.pdf`);
const reportPath = join(outDir, `${safeStem(inputPath)}.render-report.json`);

writeFileSync(typPath, source);
const compileError = compileTypst(typPath, pdfPath);

const report = {
  inputPath,
  outDir,
  typPath,
  pdfPath: compileError ? undefined : pdfPath,
  questionCount: questions.length,
  imageCount: refs.size,
  compileError,
};

writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(`Rendered ${inputPath}`);
console.log(`Questions: ${questions.length}`);
console.log(`Images: ${refs.size}`);
console.log(`Typst: ${typPath}`);
if (compileError) {
  console.log(`PDF compile failed: ${compileError}`);
  process.exitCode = 1;
} else {
  console.log(`PDF: ${pdfPath}`);
}
console.log(`Report: ${reportPath}`);
