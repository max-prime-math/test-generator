import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';

const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
let browser;
try {
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto(server.resolvedUrls.local[0], { waitUntil: 'networkidle0' });
  const result = await page.evaluate(async () => {
    const { WorkspaceCatalog } = await import('/src/lib/workspace-catalog.svelte.ts');
    const banks = Array.from({ length: 3 }, (_, index) => ({
      id: `catalog-${index}`, name: `Bank ${index}`, data: {
        questions: Array.from({ length: 60 }, (_, q) => ({ id: `q-${q}`, body: `Question ${q} #image("/imgs/diagram.svg")`,
          narrativeId: 'shared-id', images: ['diagram'], tags: [], points: 2, createdAt: 1 })),
        narratives: [{ id: 'shared-id', body: `Narrative ${index}`, createdAt: 1 }],
        customClasses: [{ id: `class-${index}`, name: `Class ${index}`, units: [] }], savedTests: [],
        images: [{ name: 'diagram', ext: 'svg', bytes: new TextEncoder().encode(`<svg>${index}</svg>`) }],
      },
    }));
    const catalog = new WorkspaceCatalog();
    await catalog.replace(banks);
    const originalId = catalog.questions[0].id;
    const untouched = catalog.questions[60];
    const originalSnapshot = catalog.snapshot();
    const edited = structuredClone(banks[0]);
    edited.name = 'Renamed bank';
    edited.data.questions[0].body = 'Changed #image("/imgs/diagram.svg")';
    edited.data.questions.splice(1, 1);
    edited.data.questions.push({ id: 'added', body: 'New question', points: 1, tags: [], createdAt: 2 });
    edited.data.images[0].bytes = new TextEncoder().encode('<svg>replacement</svg>');
    edited.data.narratives[0].body = 'Changed narrative';
    let hashes = 0;
    let beats = 0;
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    crypto.subtle.digest = async (...args) => { hashes++; return digest(...args); };
    const timer = setInterval(() => beats++, 0);
    await catalog.updateBank(edited);
    clearInterval(timer);
    crypto.subtle.digest = digest;
    const stable = originalId === catalog.questions[0].id;
    const untouchedStable = untouched === catalog.questions[60];
    const fresh = new WorkspaceCatalog();
    await fresh.replace([edited, ...banks.slice(1)]);
    const sortKeys = value => Array.isArray(value) ? value.map(sortKeys)
      : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sortKeys(value[key])])) : value;
    const normalize = value => JSON.stringify(sortKeys(value.snapshot()));
    const exact = normalize(catalog) === normalize(fresh);
    const restored = new WorkspaceCatalog();
    restored.restore(originalSnapshot);
    await restored.updateBank(edited);
    const cacheExact = normalize(restored) === normalize(fresh);
    delete originalSnapshot.imageNamesByBank;
    const legacy = new WorkspaceCatalog();
    legacy.restore(originalSnapshot);
    await legacy.updateBank(edited);
    const legacyExact = normalize(legacy) === normalize(fresh);
    return { hashes, beats, stable, untouchedStable, exact, cacheExact, legacyExact,
      removed: !Object.values(catalog.sources).some(source => source.bankId === edited.id && source.questionId === 'q-1'),
      imageCount: catalog.images.length };
  });
  assert.equal(result.hashes, 1, 'Only a newly added question needs a catalog ID hash');
  assert.ok(result.beats > 0, 'Catalog updates yield to input and painting');
  assert.equal(result.stable, true, 'Existing catalog IDs survive edits');
  assert.equal(result.untouchedStable, true, 'Other banks retain their question objects');
  assert.equal(result.exact, true, 'Incremental result matches a full rebuild including images/narratives/classes');
  assert.equal(result.cacheExact, true, 'Prepared cache can be updated incrementally');
  assert.equal(result.legacyExact, true, 'Older caches remain compatible');
  assert.equal(result.removed, true, 'Removed questions leave source lookup');
  assert.equal(result.imageCount, 3, 'Replaced image content does not retain stale catalog assets');
  console.log('Incremental catalog regression passed: stable IDs, untouched banks, new/deleted questions, image replacement, narrative edits, old/new caches and input yielding.');
} finally {
  await browser?.close();
  await server.close();
}
