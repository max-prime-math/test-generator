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
    const { compile, compileSvg, queryValues } = await import('/src/lib/typst/compiler.ts');
    const { DOCUMENT_FONTS, documentFontRules } = await import('/src/lib/typst/document-fonts.ts');
    const source = `#set page(width: 6cm, height: auto, margin: 1cm)
#set text(font: "Patrick Hand", size: 16pt, fallback: false)
Patrick Hand 123`;
    const preview = await compileSvg(source);
    if (preview.error) throw new Error(preview.error);
    const pdf = await compile(source);
    if (pdf.error) throw new Error(pdf.error);
    const pdfSize = pdf.pdfUrl ? (await (await fetch(pdf.pdfUrl)).arrayBuffer()).byteLength : 0;
    if (pdf.pdfUrl) URL.revokeObjectURL(pdf.pdfUrl);
    const fontBlocks = DOCUMENT_FONTS.map(option => `#block[
${documentFontRules(option.id, 13)}
#set text(fallback: false)
*${option.label}* — Mathematics 012345 $integral_0^1 x^2 dif x = 1/3$
#context [#metadata((id: "${option.id}", wide: measure[WMWM 012345].width / 1pt, narrow: measure[iill 6789].width / 1pt))<tg-font-metrics>]
]`).join('\n\n');
    const gallery = `#set page(width: 16cm, height: auto, margin: 1cm)\n${fontBlocks}`;
    const galleryPreview = await compileSvg(gallery);
    if (galleryPreview.error) throw new Error(galleryPreview.error);
    const galleryPdf = await compile(gallery);
    if (galleryPdf.error) throw new Error(galleryPdf.error);
    const galleryPdfSize = galleryPdf.pdfUrl ? (await (await fetch(galleryPdf.pdfUrl)).arrayBuffer()).byteLength : 0;
    if (galleryPdf.pdfUrl) URL.revokeObjectURL(galleryPdf.pdfUrl);
    const metrics = await queryValues(gallery, '<tg-font-metrics>');
    let savedPdfSize = 0;
    if (savedSource) {
      const savedPdf = await compile(savedSource);
      if (savedPdf.error) throw new Error(savedPdf.error);
      savedPdfSize = savedPdf.pdfUrl ? (await (await fetch(savedPdf.pdfUrl)).arrayBuffer()).byteLength : 0;
      if (savedPdf.pdfUrl) URL.revokeObjectURL(savedPdf.pdfUrl);
    }
    return { fontCount: DOCUMENT_FONTS.length, galleryPdfSize, gallerySvg: galleryPreview.svg ?? '', metrics, pdfSize, savedPdfSize, svg: preview.svg ?? '' };
  }, savedTestSource);

  assert.ok(result.svg.length > 1_000, 'Patrick Hand renders in the browser preview');
  assert.ok(result.pdfSize > 1_000, 'Patrick Hand embeds in the browser PDF');
  assert.equal(result.fontCount, 12, 'the picker has the intended curated set');
  assert.equal(result.metrics.length, result.fontCount, 'every bundled text font was measured without falling out of the document');
  const distinctMetrics = new Set(result.metrics.map(metric => `${metric.wide.toFixed(3)}:${metric.narrow.toFixed(3)}`));
  assert.ok(distinctMetrics.size >= 10, `the bundled choices render as distinct typefaces (${distinctMetrics.size}: ${result.metrics.map(metric => `${metric.id}=${metric.wide.toFixed(3)}:${metric.narrow.toFixed(3)}`).join(', ')})`);
  assert.ok(result.gallerySvg.length > 10_000, 'all font specimens render in the browser preview');
  assert.ok(result.galleryPdfSize > 10_000, 'all font specimens embed in an exported PDF');
  if (savedTestSource) assert.ok(result.savedPdfSize > 1_000, 'the saved test exports with Patrick Hand');
  console.log(`typst fonts: ${result.fontCount} document choices rendered in preview and PDF; question-level Patrick Hand still rendered (${result.pdfSize} byte PDF)`);
} finally {
  await browser?.close();
  await server.close();
}
