import assert from 'node:assert/strict';
import { contentImages, snapshotTest } from '../src/lib/workspace-format.ts';
import { hashRepoDataContent } from '../src/git/repoDataModel.ts';
import { defaultTestConfig, type Question } from '../src/lib/types.ts';

// The fast image-reference scans give exactly what the original per-image searches gave.
function contentImagesBefore(questions: Question[], narratives: never[], images: Array<{ name: string; ext: string; bytes: Uint8Array }>) {
  const content = JSON.stringify([questions, narratives]);
  const declared = new Set(questions.flatMap(q => q.images ?? []));
  const seen = new Set<string>();
  return images.filter(image => { const key = JSON.stringify([image.name, image.ext]); if (seen.has(key)) return false; seen.add(key); return true; })
    .filter(image => declared.has(image.name) || content.includes(`/imgs/${image.name}.${image.ext}`) || content.includes(`{${image.name}}`) || content.includes(`{${image.name}.${image.ext}}`));
}
function rewriteBefore(questions: Question[], images: Array<{ name: string; ext: string; bytes: Uint8Array }>) {
  const replacements = new Map(images.map(image => [image.name, image.name.startsWith('testasset-') ? image.name : `testasset-${hashRepoDataContent(image.bytes).replace(/[^a-zA-Z0-9]/g, '-')}-${image.name.slice(-35)}`]));
  const rewrite = (value: unknown): unknown => {
    if (typeof value === 'string') {
      if (replacements.has(value)) return replacements.get(value);
      let text = value;
      for (const image of images) {
        const name = replacements.get(image.name)!;
        text = text.replaceAll(`/imgs/${image.name}.${image.ext}`, `/imgs/${name}.${image.ext}`).replaceAll(`{${image.name}}`, `{${name}}`).replaceAll(`{${image.name}.${image.ext}}`, `{${name}.${image.ext}}`);
        if (text === `${image.name}.${image.ext}`) text = `${name}.${image.ext}`;
      }
      return text;
    }
    if (Array.isArray(value)) return value.map(rewrite);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rewrite(v)]));
    return value;
  };
  return rewrite(questions);
}

let seed = 99;
const random = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = <V>(list: V[]) => list[Math.floor(random() * list.length)];
const names = ['graph', 'graph-2', 'tikz-export-2 (1)', 'a', 'ab', 'testasset-fnv1a32-060c69af-graph', 'IMG_0001', 'img.v2', 'q{1}', 'x'];
for (let run = 0; run < 2000; run++) {
  const images = Array.from({ length: 1 + Math.floor(random() * 6) }, () => ({ name: pick(names), ext: pick(['png', 'svg', 'jpg']), bytes: new Uint8Array([Math.floor(random() * 255)]) }));
  const refs = () => Array.from({ length: Math.floor(random() * 4) }, () => {
    const image = pick(images.concat([{ name: pick(names), ext: 'png', bytes: new Uint8Array() }]));
    return pick([`/imgs/${image.name}.${image.ext}`, `{${image.name}}`, `{${image.name}.${image.ext}}`, `${image.name}.${image.ext}`, `{ ${image.name} }`, '{', '/imgs/']);
  }).join(pick([' ', '', '\\n', '"']));
  const questions: Question[] = Array.from({ length: 1 + Math.floor(random() * 4) }, (_, i) => ({ id: `q${i}`, body: `Body ${refs()} $x$ ${refs()}`, solution: refs(), points: 1, tags: [], createdAt: 1,
    ...(random() < 0.2 ? { images: [pick(names)] } : {}) }));
  assert.deepEqual(contentImages(questions, [], images).map(i => `${i.name}.${i.ext}`), contentImagesBefore(questions, [], images).map(i => `${i.name}.${i.ext}`), `run ${run}: contentImages`);
  const captured = snapshotTest({ id: 't', name: 'T', classId: null, unitId: null, testType: null, config: { ...defaultTestConfig(), selectedIds: questions.map(q => q.id) }, createdAt: 0, updatedAt: 0 }, { questions, narratives: [], customClasses: [], savedTests: [], images });
  const used = contentImagesBefore(questions, [], images);
  assert.deepEqual(captured.test.questionSnapshots, rewriteBefore(questions, used), `run ${run}: snapshot rewrite`);
}
console.log('Image reference scans passed: 2,000 random cases identical to the original per-image searches.');
