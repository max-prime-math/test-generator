import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';

const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
server.middlewares.use('/portable-image-test.html', (_request, response) => {
  response.setHeader('Content-Type', 'text/html');
  response.end('<!doctype html><title>Portable test image regression</title>');
});
await server.listen();
let browser;
try {
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.goto(`${server.resolvedUrls.local[0]}portable-image-test.html`);
  const result = await page.evaluate(async () => {
    const { imageStore } = await import('/src/lib/image-store.svelte.ts');
    const { defaultTestConfig } = await import('/src/lib/types.ts');
    const { generateTypst, generateAnswerKeyPage, generateIndividual } = await import('/src/lib/typst/template.ts');
    const { compile } = await import('/src/lib/typst/compiler.ts');
    const { scanImageRefs } = await import('/src/lib/typst/image-shadow.ts');
    await imageStore.init();
    // The receiving computer has only the namespaced image included with the test.
    const frozen = 'testasset-fnv1a32-12345678-unit-circle-diagram';
    await imageStore.put(frozen, new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="40" fill="none" stroke="black"/></svg>'), 'svg');
    const question = {
      id: 'circle', body: 'Identify this diagram.\n\n#image("/imgs/unit-circle-diagram", width: 1cm)',
      solution: 'A unit circle.\n\n#image("/imgs/unit-circle-diagram", width: 1cm)',
      points: 1, tags: [], createdAt: 1, images: [frozen, `${frozen}.svg`],
    };
    const before = JSON.stringify(question);
    const config = { ...defaultTestConfig('Portable diagrams'), showAnswerKey: true, answerSpace: 0 };
    const sources = [generateTypst(config, [question]), generateAnswerKeyPage(config, [question]), generateIndividual(config, [question])[0]];
    const documents = [];
    for (const source of sources) {
      const compiled = await compile(source);
      const bytes = compiled.pdfUrl ? (await (await fetch(compiled.pdfUrl)).arrayBuffer()).byteLength : 0;
      if (compiled.pdfUrl) URL.revokeObjectURL(compiled.pdfUrl);
      documents.push({ refs: scanImageRefs(source), error: compiled.error, bytes });
    }
    return { documents, frozen, originalImagePresent: imageStore.has('unit-circle-diagram'), unchanged: before === JSON.stringify(question) };
  });
  assert.equal(result.originalImagePresent, false);
  assert.equal(result.unchanged, true, 'rendering does not mutate the saved test');
  for (const document of result.documents) {
    assert.deepEqual(document.refs, [result.frozen], 'original image references resolve to this question’s included snapshot');
    assert.equal(document.error, undefined);
    assert.ok(document.bytes > 1000, 'combined test, separate key, and individual question all compile on a fresh computer');
  }
  console.log('Portable test images passed: legacy extensionless body/solution references compile using only included images, without mutating the test.');
} finally {
  await browser?.close();
  await server.close();
}
