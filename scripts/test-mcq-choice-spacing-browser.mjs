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
    const trig = String.raw`$frac(pi ,3 )+ frac(pi ,2 ) n \, quad  frac(2  pi ,3 )+ frac(pi ,2 ) n \, n$ an integer`;
    const prose = 'This answer has several words and can wrap across lines inside a narrower column.';
    const cases = [
      ...[
        ['matrices', '$mat(1; 2; 3; 4; 5)$'],
        ['nested fractions', '$frac(1, frac(2, frac(3, 4)))$'],
        ['mixed heights', null],
      ].flatMap(([name, choice]) => [['portrait', 1], ['portrait', 2], ['landscape', 2]]
        .map(([orientation, pageColumns]) => ({ name, choice, orientation, pageColumns }))),
      { name: 'short choices', choice: '$1$', expected: 5 },
      { name: 'aligned trig choices', choice: trig, expected: 2 },
      { name: 'trig in a page column', choice: trig, pageColumns: 2, expected: 1 },
      { name: 'one column target', choice: trig, target: 1, expected: 1 },
      { name: 'wide text Auto', choice: prose, expected: 1 },
      { name: 'wide text manual', choice: prose, target: 3, expected: 3 },
      { name: 'picture choices', picture: 'graph', expected: 2 },
      { name: 'renamed picture choices', picture: 'graph-long-generated-name-0bcb9dd2', expected: 2 },
      { name: 'wide pictures with manual target', picture: 'graph', target: 5, expected: 2 },
    ];
    const results = [];
    for (const { name, choice, orientation = 'portrait', pageColumns = 1, expected, target, picture } of cases) {
      const images = picture ? [{
        name: picture, ext: 'svg',
        bytes: new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="100"><rect width="240" height="100" fill="gray"/></svg>'),
      }] : [];
      const body = picture ? `#image("/imgs/${picture}.svg", width: 2.40in)` : choice;
      const choices = Object.fromEntries(['A', 'B', 'C', 'D', 'E'].map((letter, i) => [letter, body ?? (i % 2 ? '$1$' : '$mat(1; 2; 3; 4; 5)$')]));
      let source = generateTypst({ ...defaultTestConfig('Tall choices'), orientation, pageColumns, mcqChoiceColumns: target, answerSpace: 0 }, [
        { id: 'tall', body: 'Choose the correct expression.', choices, points: 1, tags: [], createdAt: 1 },
      ]);
      // Colour choices so their rendered bounding boxes can be compared.
      colours.forEach((colour, i) => {
        source = source.replace(`(${String.fromCharCode(65 + i)}) `, `#set text(fill: rgb("${colour.slice(1)}"))\n(${String.fromCharCode(65 + i)}) `);
      });
      const rendered = await compileSvg(source, { images });
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
      results.push({ name, orientation, pageColumns, bounds, expected });
    }
    return results;
  });
  for (const { name, orientation, pageColumns, bounds, expected } of results) {
    if (expected) {
      assert.ok(bounds.slice(1, expected).every((box, i) => box.left > bounds[i].right), `${name}: the first ${expected} choices fit side by side`);
      if (expected < bounds.length) {
        assert.ok(Math.abs(bounds[expected].left - bounds[0].left) < 2, `${name}: choice ${expected + 1} starts a new row`);
      }
    }
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
  console.log('MCQ layout passed: automatic fit, manual wrapping and fallback, images, and tall choices without overlapping rows.');
} finally {
  await browser?.close();
  await server.close();
}
