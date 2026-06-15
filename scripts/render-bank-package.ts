import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { generateBankReviewTypst, generateTypst } from '../src/lib/typst/template.ts';
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

type RenderStyle = 'test' | 'bank-review';

function usage(): never {
  console.error('Usage: npm run render:bank -- [--bank|--style bank-review] <test-generator-import.json> [out-dir]');
  process.exit(1);
}

function parseRenderStyle(raw: string): RenderStyle {
  if (raw === 'bank' || raw === 'bank-review' || raw === 'review') return 'bank-review';
  if (raw === 'test' || raw === 'compact') return 'test';
  throw new Error(`Unknown render style: ${raw}`);
}

function parseArgs(argv: string[]): { inputPath: string; outDir?: string; style: RenderStyle } {
  const positional: string[] = [];
  let style: RenderStyle = 'test';

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--bank' || arg === '--review') {
      style = 'bank-review';
      continue;
    }
    if (arg === '--test' || arg === '--compact') {
      style = 'test';
      continue;
    }
    if (arg === '--style') {
      const value = argv[++i];
      if (!value) usage();
      style = parseRenderStyle(value);
      continue;
    }
    if (arg.startsWith('--style=')) {
      style = parseRenderStyle(arg.slice('--style='.length));
      continue;
    }
    if (arg === '-h' || arg === '--help') usage();
    if (arg.startsWith('--')) throw new Error(`Unknown option: ${arg}`);
    positional.push(arg);
  }

  if (!positional[0]) usage();
  return {
    inputPath: resolve(positional[0]),
    outDir: positional[1] ? resolve(positional[1]) : undefined,
    style,
  };
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

const args = parseArgs(process.argv.slice(2));
const inputPath = args.inputPath;

const parsed = JSON.parse(readFileSync(inputPath, 'utf8')) as BankPackage | Question[];
const pkg: BankPackage = Array.isArray(parsed) ? { questions: parsed } : parsed;
const questions = Array.isArray(pkg.questions) ? pkg.questions : [];
if (questions.length === 0) {
  throw new Error('Input package does not contain stored Test Generator questions.');
}

const defaultOutDir = join(process.cwd(), 'reports/rendered-bank-packages', safeStem(inputPath));
const outDir = args.outDir ?? defaultOutDir;
mkdirSync(outDir, { recursive: true });

const title = pkg.source?.label?.replace(/\.bnk$/i, '') || safeStem(inputPath);
const config = defaultTestConfig(title);
config.instructions = '';
config.mcqFirst = false;
config.showPoints = false;
config.answerSpace = 0;
config.showAnswerKey = false;
config.fontSize = 10;
if (args.style === 'bank-review') {
  config.fontSize = 9.5;
  config.marginIn = 0.55;
}

const refs = writeImages(outDir, pkg.images);
const renderedSource = args.style === 'bank-review'
  ? generateBankReviewTypst(config, questions)
  : generateTypst(config, questions);
const source = rewriteImageRefs(renderedSource, refs);
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
  style: args.style,
  questionCount: questions.length,
  imageCount: refs.size,
  compileError,
};

writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(`Rendered ${inputPath}`);
console.log(`Questions: ${questions.length}`);
console.log(`Images: ${refs.size}`);
console.log(`Style: ${args.style}`);
console.log(`Typst: ${typPath}`);
if (compileError) {
  console.log(`PDF compile failed: ${compileError}`);
  process.exitCode = 1;
} else {
  console.log(`PDF: ${pdfPath}`);
}
console.log(`Report: ${reportPath}`);
