import assert from 'node:assert/strict';
import { graphSvg, graphFromSvg } from '../src/lib/math-graph/svg.ts';
import { initialGraph, style } from '../src/lib/math-graph/vendor/model.ts';
import { readDocument, createDocument } from '../src/lib/math-graph/vendor/document.ts';
import { imageOccurrences, imageMarkup, replaceOccurrence, replaceOccurrenceImage, rewriteImageReferences, usesImage, referencedImageNames } from '../src/lib/editor/image-references.ts';
import { exportAppDataToRepoEntries, importRepoEntriesToAppData } from '../src/git/repoDataModel.ts';

const graph = initialGraph();
graph.objects = [
  { ...style, id: 'f', type: 'function', expression: '1/x', min: null, max: null, exitArrows: true },
  { ...style, id: 'p', type: 'point', name: 'P', x: 1, y: 1, open: true, label: { text: '<P & Q>', math: false } },
];
const svg = graphSvg(graph);
assert.match(svg, /<path/); assert.match(svg, /clipPath/); assert.match(svg, /<text/);
assert.match(svg, /&lt;P &amp; Q&gt;/);
assert.doesNotMatch(svg, /NaN|Infinity|<script/);
assert.deepEqual(graphFromSvg(svg), graph);
assert.equal(graphFromSvg('<svg></svg>'), null);
assert.deepEqual(readDocument(createDocument(graph)).graph, graph);
assert.throws(() => graphSvg({ ...graph, version: 99 }), /Unsupported/);
const blank = graphSvg(initialGraph()); assert.match(blank, /<path/);
const classic = initialGraph(); classic.settings.appearance = 'classic'; assert.match(graphSvg(classic), /rotate\(-90\)/);
const marks = initialGraph(); marks.objects = [{ ...style, id: 'curve', type: 'function', expression: 'x^2', min: -1, max: 1, start: 'open', end: 'closed' }];
assert.match(graphSvg(marks), /a[\d.]+ [\d.]+ 0 1 0/);

const source = 'Before\n#align(center, image("/imgs/photo.png", width: 60%))\nAfter\n#image("/imgs/photo-2", width: 40%)';
const occurrences = imageOccurrences(source);
assert.equal(occurrences.length, 2);
assert.equal(occurrences[0].name, 'photo'); assert.equal(occurrences[0].alignment, 'center');
assert.equal(occurrences[0].simple, true);
assert.equal(replaceOccurrence(source, occurrences[0], imageMarkup('next', 45, 'right')), 'Before\n#align(right, image("/imgs/next", width: 45%))\nAfter\n#image("/imgs/photo-2", width: 40%)');
assert.match(replaceOccurrenceImage(source, occurrences[0], 'replacement'), /image\("\/imgs\/replacement", width: 60%/);
assert.throws(() => replaceOccurrence('different source', occurrences[0], ''), /source changed/);
const complex = imageOccurrences('#box(image("/imgs/photo", width: calc(2, 3), alt: "A (test)"))')[0];
assert.equal(complex.simple, false);
assert.match(complex.source, /alt: "A \(test\)"\)$/);
assert.equal(imageOccurrences('#image("https://example.test/p.png")').length, 0);
const data = { body: source, images: ['photo', 'photo-2'], tags: ['photo'], solution: '\\includegraphics[width=2cm]{photo.png}', parts: { body: '#image("photo.png")' }, choices: { A: '#image("/imgs/photo.png")' } };
assert.equal(usesImage(data, 'PHOTO'), true); assert.equal(usesImage(data, 'missing'), false);
const renamed = rewriteImageReferences(data, 'photo', 'new-photo', 'svg');
assert.match(renamed.body, /\/imgs\/new-photo.svg/); assert.match(renamed.body, /\/imgs\/photo-2/);
assert.deepEqual(renamed.images, ['new-photo', 'photo-2']); assert.deepEqual(renamed.tags, ['photo']);
assert.match(renamed.solution, /\{new-photo.svg\}/);
assert.match(renamed.parts.body, /\/imgs\/new-photo.svg/);
assert.deepEqual(referencedImageNames(data).sort(), ['photo', 'photo-2']);
const image = { name: 'graph', ext: 'svg', bytes: new TextEncoder().encode(svg) };
const entries = exportAppDataToRepoEntries({ questions: [{ id: 'graph-q', body: imageMarkup('graph'), images: ['graph'], points: 3, tags: [], createdAt: 1 }], customClasses: [], narratives: [], savedTests: [], images: [image] });
const restored = importRepoEntriesToAppData(entries).appData;
assert.deepEqual(graphFromSvg(new TextDecoder().decode(restored.images![0].bytes)), graph);
console.log('Media logic passed: vector export, graph metadata/TKZ/repository round-trips, placement, occurrence replacement, safe rename and usage detection.');
