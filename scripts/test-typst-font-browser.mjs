import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';

let savedTestSource = '';
if (process.env.TESTGEN_SAVED_TEST) {
  const { generateTypst } = await import('../src/lib/typst/template.ts');
  const saved = JSON.parse(readFileSync(process.env.TESTGEN_SAVED_TEST, 'utf8'));
  savedTestSource = generateTypst({ ...saved.test.config, showAnswerKey: false }, saved.test.questionSnapshots);
}

const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();

let browser;
try {
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.goto(server.resolvedUrls.local[0], { waitUntil: 'networkidle0' });

  const result = await page.evaluate(async (savedSource) => {
    const { compile, compileSvg } = await import('/src/lib/typst/compiler.ts');
    const source = `#set page(width: 6cm, height: auto, margin: 1cm)
#set text(font: "Patrick Hand", size: 16pt, fallback: false)
Patrick Hand 123`;
    const preview = await compileSvg(source);
    if (preview.error) throw new Error(preview.error);
    const pdf = await compile(source);
    if (pdf.error) throw new Error(pdf.error);
    const pdfSize = pdf.pdfUrl ? (await (await fetch(pdf.pdfUrl)).arrayBuffer()).byteLength : 0;
    if (pdf.pdfUrl) URL.revokeObjectURL(pdf.pdfUrl);
    let savedPdfSize = 0;
    if (savedSource) {
      const savedPdf = await compile(savedSource);
      if (savedPdf.error) throw new Error(savedPdf.error);
      savedPdfSize = savedPdf.pdfUrl ? (await (await fetch(savedPdf.pdfUrl)).arrayBuffer()).byteLength : 0;
      if (savedPdf.pdfUrl) URL.revokeObjectURL(savedPdf.pdfUrl);
    }
    return { pdfSize, savedPdfSize, svg: preview.svg ?? '' };
  }, savedTestSource);

  assert.ok(result.svg.length > 1_000, 'Patrick Hand renders in the browser preview');
  assert.ok(result.pdfSize > 1_000, 'Patrick Hand embeds in the browser PDF');
  if (savedTestSource) assert.ok(result.savedPdfSize > 1_000, 'the saved test exports with Patrick Hand');
  console.log(`typst font: Patrick Hand rendered (${result.pdfSize} byte PDF)`);
} finally {
  await browser?.close();
  await server.close();
}
