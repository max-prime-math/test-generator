import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';

// Compiles one problem per generator and level with the app's own Typst compiler
// (typst.ts in a worker), written and multiple choice, to catch markup that the
// Typst CLI accepts but the app's compiler version rejects.
const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
let browser;
try {
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => localStorage.setItem('tg-tutorial-done-v1', '1'));
  await page.goto(server.resolvedUrls.local[0], { waitUntil: 'networkidle0' });
  const result = await page.evaluate(async () => {
    const { GENERATORS, generateProblem, toQuestion } = await import('/src/lib/generator/registry.ts');
    const { formatBody } = await import('/src/lib/question-format.ts');
    const { compileSvg } = await import('/src/lib/typst/compiler.ts');
    const { autoImports } = await import('/src/lib/typst/auto-imports.ts');
    const failures = [];
    let compiled = 0;
    for (const g of GENERATORS) {
      for (const difficulty of [1, 2, 3]) {
        for (const format of ['written', 'mcq']) {
          const q = toQuestion({ generatorId: g.id, difficulty, seed: 1000 + difficulty }, format);
          const content = `${q.choices ? formatBody(q.body, q.choices) : q.body}\n\n${q.solution ?? ''}`;
          const source = `${autoImports(content)}#set page(width: 15cm, height: auto, margin: .5cm)\n${content}`;
          const out = await compileSvg(source);
          compiled++;
          if (out.error || !out.svg) failures.push(`${g.id} L${difficulty} ${format}: ${(out.error ?? 'no output').split('\n')[0]}`);
        }
      }
    }
    // Every option value, once per level, including the answer shown in red in the settings card.
    for (const g of GENERATORS.filter((x) => x.options?.length)) {
      for (const spec of g.options) {
        const values = spec.kind === 'toggle' ? ['yes', 'no'] : spec.choices.map((c) => c.value);
        for (const value of values) {
          for (const difficulty of [1, 2, 3]) {
            const item = { generatorId: g.id, difficulty, seed: 2000 + difficulty, options: { [spec.id]: value } };
            const q = toQuestion(item, 'mcq');
            const content = `${q.choices ? formatBody(q.body, q.choices) : q.body}\n\n${q.solution ?? ''}\n\n#text(fill: rgb("#d03a3a"))[${generateProblem(item).answer}]`;
            const out = await compileSvg(`${autoImports(content)}#set page(width: 15cm, height: auto, margin: .5cm)\n${content}`);
            compiled++;
            if (out.error || !out.svg) failures.push(`${g.id} ${spec.id}=${value} L${difficulty}: ${(out.error ?? 'no output').split('\n')[0]}`);
          }
        }
      }
    }
    return { compiled, failures };
  });
  assert.deepEqual(result.failures, [], `App compiler rejected:\n${result.failures.join('\n')}`);
  console.log(`Generator render test passed: ${result.compiled} problems compiled with the app's Typst compiler.`);
} finally {
  await browser?.close();
  await server.close();
}
