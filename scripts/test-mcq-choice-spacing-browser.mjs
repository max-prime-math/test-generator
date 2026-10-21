import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';

const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
server.middlewares.use('/mcq-spacing-test.html', (_request, response) => {
  response.setHeader('Content-Type', 'text/html');
  response.end('<!doctype html><title>MCQ spacing regression</title>');
});
await server.listen();
let browser;
try {
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.goto(`${server.resolvedUrls.local[0]}mcq-spacing-test.html`);
  const results = await page.evaluate(async () => {
    const { defaultTestConfig } = await import('/src/lib/types.ts');
    const { generateTypst } = await import('/src/lib/typst/template.ts');
    const { compileSvg } = await import('/src/lib/typst/compiler.ts');
    const colours = ['#cc0000', '#00aa00', '#0000cc', '#aa00aa', '#00aaaa'];
    const results = [];
    for (const [name, choice] of [
      ['matrices', '$mat(1; 2; 3; 4; 5)$'],
      ['nested fractions', '$frac(1, frac(2, frac(3, 4)))$'],
      ['mixed heights', null],
    ]) {
      for (const [orientation, pageColumns] of [['portrait', 1], ['portrait', 2], ['landscape', 2]]) {
        const choices = Object.fromEntries(['A', 'B', 'C', 'D', 'E'].map((letter, i) => [letter, choice ?? (i % 2 ? '$1$' : '$mat(1; 2; 3; 4; 5)$')]));
        let source = generateTypst({ ...defaultTestConfig('Tall choices'), orientation, pageColumns, answerSpace: 0 }, [
          { id: 'tall', body: 'Choose the correct expression.', choices, points: 1, tags: [], createdAt: 1 },
        ]);
        // Colour choices after formatting so instrumentation cannot affect width heuristics.
        colours.forEach((colour, i) => {
          source = source.replace(`(${String.fromCharCode(65 + i)}) `, `#set text(fill: rgb("${colour.slice(1)}"))\n(${String.fromCharCode(65 + i)}) `);
        });
        const rendered = await compileSvg(source);
        if (!rendered.svg) throw new Error(rendered.error ?? 'No rendered SVG');
        document.body.innerHTML = rendered.svg;
        const bounds = colours.map((colour) => {
          const rgb = `rgb(${[1, 3, 5].map((offset) => parseInt(colour.slice(offset, offset + 2), 16)).join(', ')})`;
          const elements = [...document.querySelectorAll('svg *')].filter((element) => getComputedStyle(element).fill === rgb);
          const boxes = elements.map((element) => element.getBoundingClientRect()).filter((box) => box.width && box.height);
          if (!boxes.length) throw new Error(`Missing rendered choice ${colour}`);
          return {
            left: Math.min(...boxes.map((box) => box.left)),
            right: Math.max(...boxes.map((box) => box.right)),
            top: Math.min(...boxes.map((box) => box.top)),
            bottom: Math.max(...boxes.map((box) => box.bottom)),
          };
        });
        results.push({ name, orientation, pageColumns, bounds });
      }
    }
    return results;
  });
  for (const { name, orientation, pageColumns, bounds } of results) {
    for (let i = 0; i < bounds.length; i++) {
      for (let j = i + 1; j < bounds.length; j++) {
        const a = bounds[i];
        const b = bounds[j];
        const horizontalOverlap = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        if (horizontalOverlap > 1) {
          assert.ok(b.top - a.bottom >= 3, `${name}, ${orientation}, ${pageColumns} column(s): choices ${i + 1} and ${j + 1} need a visible vertical gap; got ${(b.top - a.bottom).toFixed(2)}px`);
        }
      }
    }
  }
  console.log('Tall MCQ choices passed: matrices, nested fractions, mixed heights, and portrait/landscape column layouts have no overlapping rows.');
} finally {
  await browser?.close();
  await server.close();
}
