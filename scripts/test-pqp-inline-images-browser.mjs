import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';

const input = resolve(process.argv[2] ?? '../bnk-decoder/reports/rea-examview/native-publisher-dual-YtJbgT/native-publisher-dual-chapter03.pqp.json');
if (!existsSync(input)) throw new Error(`PQP fixture not found: ${input}`);
const fixture = JSON.parse(readFileSync(input, 'utf8'));
const expectedQuestions = fixture.questions.length;
const expectedImages = fixture.assets.filter((asset) => asset.storage?.mode === 'inline-base64').length;
const expectedAlgorithms = fixture.questions.filter((question) => question.extensions?.algorithmModel).length;
const expectedQuestionsWithImages = fixture.questions.filter((question) => question.assets?.length).length;
const expectedQuestionsWithChoices = fixture.questions.filter((question) => question.content?.choices?.length).length;
const expectedNarratives = fixture.questions
  .filter((question) => question.content?.narrative?.text)
  .map((question) => ({
    narrative: question.content.narrative.text,
    narrativeId: question.narrativeId,
  }));

const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
let browser;
try {
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH
    || (existsSync('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe')
      ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
      : undefined);
  browser = await puppeteer.launch({ headless: true, executablePath, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 1000 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('tg-tutorial-done-v1', '1');
    window.confirm = () => true;
  });
  await page.goto(`${server.resolvedUrls.local[0]}#/editor`, { waitUntil: 'networkidle0' });

  const clicked = await page.evaluate(() => {
    const button = [...document.querySelectorAll('.editor-workspace .actions button')]
      .find((candidate) => candidate.textContent.trim() === 'Bulk Entry / Import');
    button?.click();
    return Boolean(button);
  });
  assert.ok(clicked, 'Bulk Entry / Import button is available');
  const chooser = await page.waitForSelector('.import-file-row input[type=file]');
  await chooser.uploadFile(input);
  await page.waitForFunction(() => document.querySelector('.paste-area')?.value.includes('portable-question-package'));

  const continued = await page.evaluate(() => {
    const button = [...document.querySelectorAll('.stage1-modal footer button')]
      .find((candidate) => candidate.textContent.trim() === 'Continue →');
    button?.click();
    return Boolean(button);
  });
  assert.ok(continued, 'PQP import can continue');
  await page.waitForSelector('.stage2-modal', { timeout: 120000 });
  assert.equal(await page.$('.stage-images-modal'), null, 'embedded images skip the upload step');
  assert.equal(await page.$$eval('.stage2-modal .q-card', (cards) => cards.length), expectedQuestions);
  assert.equal(await page.$$eval('.stage2-modal .badge-img-missing', (badges) => badges.length), 0);

  const imageState = await page.evaluate(async () => {
    const { imageStore } = await import('/src/lib/image-store.svelte.ts');
    await imageStore.init();
    const first = imageStore.names[0];
    const stored = first ? await imageStore.get(first) : undefined;
    return { count: imageStore.names.length, first, firstBytes: stored?.bytes.byteLength ?? 0 };
  });
  assert.equal(imageState.count, expectedImages);
  if (expectedImages > 0) {
    assert.ok(imageState.first);
    assert.ok(imageState.firstBytes > 0);
  }

  const staged = await page.evaluate(() => {
    const button = [...document.querySelectorAll('.stage2-modal footer button')]
      .find((candidate) => candidate.textContent.includes('Stage in Editor'));
    button?.click();
    return Boolean(button);
  });
  assert.ok(staged, 'questions can be staged in Editor');
  await page.waitForFunction(async (count) => {
    const { editor } = await import('/src/lib/editor/editor-state.svelte.ts');
    return editor.session.drafts.length === count;
  }, { timeout: 120000 }, expectedQuestions);
  const imported = await page.evaluate(async () => {
    const { editor } = await import('/src/lib/editor/editor-state.svelte.ts');
    const drafts = editor.session.drafts;
    return {
      count: drafts.length,
      withImages: drafts.filter((draft) => draft.fields.images?.length).length,
      withNarratives: drafts.filter((draft) => draft.fields.narrative).length,
      withChoices: drafts.filter((draft) => draft.fields.choices).length,
      algorithmic: drafts.filter((draft) => draft.fields.algorithmModel).length,
      narratives: drafts
        .filter((draft) => draft.fields.narrative)
        .map((draft) => ({ narrative: draft.fields.narrative, narrativeId: draft.fields.narrativeId })),
    };
  });
  assert.equal(imported.count, expectedQuestions);
  assert.equal(imported.algorithmic, expectedAlgorithms);
  assert.equal(imported.withImages, expectedQuestionsWithImages);
  assert.equal(imported.withChoices, expectedQuestionsWithChoices);
  assert.deepEqual(imported.narratives, expectedNarratives);
  const variantProblems = await page.evaluate(async () => {
    const { editor } = await import('/src/lib/editor/editor-state.svelte.ts');
    const { calculateAlgorithmicQuestionVariant } = await import('/src/lib/algorithm-variant.ts');
    const problems = [];
    for (const draft of editor.session.drafts.filter((candidate) => candidate.fields.algorithmModel)) {
      for (let seed = 1; seed <= 25; seed += 1) {
        const result = calculateAlgorithmicQuestionVariant(draft.fields, seed);
        const warning = result.diagnostics.find((item) => item.level !== 'info');
        const unresolved = result.updates.algorithmEvaluation?.entries.filter((entry) => entry.status !== 'resolved') ?? [];
        if (warning || unresolved.length) {
          problems.push({ seed, warning: warning?.message, unresolved: unresolved.map((entry) => entry.name) });
          break;
        }
      }
    }
    return problems;
  });
  assert.deepEqual(variantProblems, []);
  const compileProblems = await page.evaluate(async () => {
    const { editor } = await import('/src/lib/editor/editor-state.svelte.ts');
    const { imageStore } = await import('/src/lib/image-store.svelte.ts');
    const { calculateAlgorithmicQuestionVariant } = await import('/src/lib/algorithm-variant.ts');
    const { compileSvg } = await import('/src/lib/typst/compiler.ts');
    const problems = [];
    const source = (fields) => `#set page(width: 16cm, height: auto, margin: .4cm)\n${[
      fields.narrative,
      fields.body,
      ...Object.values(fields.choices ?? {}),
      fields.solution,
    ].filter(Boolean).join('\n\n')}`;
    for (const [index, draft] of editor.session.drafts.entries()) {
      const original = await compileSvg(source(draft.fields));
      if (original.error) problems.push({ index: index + 1, original: original.error });
      if (!draft.fields.algorithmModel) continue;
      const definitions = draft.fields.algorithmModel.definitions ?? [];
      const conditional = definitions.find((definition) => definition.name.startsWith('examview_equation_'));
      const selectorName = conditional?.rawExpression?.match(/^if\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/)?.[1];
      const selector = definitions.find((definition) => definition.name === selectorName);
      const domain = selector?.rawExpression?.match(/^rand\(\s*(\d+)\s*\)$/i);
      const required = domain ? Number(domain[1]) : 1;
      const seen = new Set();
      const rejected = new Set();
      for (let seed = 1; seed <= Math.max(1, required * 100) && seen.size < required; seed += 1) {
        const result = calculateAlgorithmicQuestionVariant(draft.fields, seed);
        const selected = selectorName
          ? result.updates.algorithmEvaluation?.entries.find((entry) => entry.name === selectorName)?.value
          : 'single';
        if (selected === undefined || seen.has(selected)) continue;
        seen.add(selected);
        for (const generated of result.images ?? []) {
          await imageStore.put(generated.name, new TextEncoder().encode(generated.svg), 'svg');
        }
        const rendered = await compileSvg(source({ ...draft.fields, ...result.updates }));
        if (rendered.error) problems.push({ index: index + 1, seed, selector: selected, variant: rendered.error });
      }
      if (selectorName && seen.size < required) {
        for (let value = 1; value <= required; value += 1) {
          if (seen.has(String(value))) continue;
          const forced = {
            ...draft.fields,
            algorithmModel: {
              ...draft.fields.algorithmModel,
              definitions: draft.fields.algorithmModel.definitions.map((definition) => ({
                ...definition,
                ...(definition.name === selectorName ? { rawExpression: String(value) } : {}),
              })),
            },
          };
          const result = calculateAlgorithmicQuestionVariant(forced, 1);
          if (result.diagnostics.some((item) => item.code === 'ALGORITHM_CONDITIONS_NOT_SATISFIED')) {
            rejected.add(String(value));
            continue;
          }
          for (const generated of result.images ?? []) {
            await imageStore.put(generated.name, new TextEncoder().encode(generated.svg), 'svg');
          }
          const rendered = await compileSvg(source({ ...forced, ...result.updates }));
          if (rendered.error) problems.push({ index: index + 1, selector: value, variant: rendered.error });
          seen.add(String(value));
        }
      }
      if (seen.size + rejected.size !== required) problems.push({
        index: index + 1, selector: selectorName,
        branches: `${seen.size} compiled + ${rejected.size} rejected / ${required}`,
      });
    }
    return problems;
  });
  assert.deepEqual(compileProblems, []);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ input, images: imageState.count, ...imported }, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
