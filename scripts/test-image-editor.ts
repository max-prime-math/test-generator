import assert from 'node:assert/strict';
import { recanvas, rotate, flipHorizontal, floodFill, History, rectFromPoints, extendRect, toImagePoint, editPolicy, outputFormat, copyName, rasterSize, parseHex, checkSize, WHITE, CLEAR, type Pixels, type RGBA } from '../src/lib/media/image-editor.ts';

const R: RGBA = [255, 0, 0, 255], G: RGBA = [0, 255, 0, 255], B: RGBA = [0, 0, 255, 255], K: RGBA = [0, 0, 0, 255];
function make(width: number, height: number, pixels: RGBA[]): Pixels { return { width, height, data: new Uint8ClampedArray(pixels.flat()) }; }
const at = (img: Pixels, x: number, y: number) => [...img.data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 4)];

// 3x2: R G B / K K K
const img = make(3, 2, [R, G, B, K, K, K]);
const right = rotate(img, 'right');
assert.equal(right.width, 2); assert.equal(right.height, 3);
assert.deepEqual(at(right, 1, 0), R); assert.deepEqual(at(right, 0, 0), K); assert.deepEqual(at(right, 1, 2), B);
const left = rotate(img, 'left');
assert.deepEqual(at(left, 0, 0), B); assert.deepEqual(at(left, 0, 2), R); assert.deepEqual(at(left, 1, 2), K);
assert.deepEqual(rotate(rotate(right, 'right'), 'right').data, rotate(img, 'left').data);
assert.deepEqual(rotate(right, 'left').data, img.data);
const flipped = flipHorizontal(img);
assert.deepEqual(at(flipped, 0, 0), B); assert.deepEqual(at(flipped, 2, 0), R);

const cropped = recanvas(img, { x: 1, y: 0, width: 2, height: 1 }, WHITE);
assert.deepEqual([cropped.width, cropped.height], [2, 1]); assert.deepEqual(at(cropped, 0, 0), G); assert.deepEqual(at(cropped, 1, 0), B);
const extended = recanvas(img, extendRect(3, 2, { top: 1, right: 2, bottom: 0, left: 1 }), WHITE);
assert.deepEqual([extended.width, extended.height], [6, 3]);
assert.deepEqual(at(extended, 0, 0), WHITE); assert.deepEqual(at(extended, 1, 1), R); assert.deepEqual(at(extended, 3, 2), K); assert.deepEqual(at(extended, 5, 2), WHITE);
const beyond = recanvas(img, { x: 2, y: -1, width: 3, height: 2 }, CLEAR); // crop rect dragged past the edge
assert.deepEqual(at(beyond, 0, 1), B); assert.deepEqual(at(beyond, 1, 1), CLEAR); assert.deepEqual(at(beyond, 0, 0), CLEAR);
assert.throws(() => recanvas(img, { x: 0, y: 0, width: 9000, height: 1 }, WHITE), /limited/);
assert.throws(() => checkSize(0, 5), /at least/);

// Flood fill stays inside the black border and respects tolerance.
const W: RGBA = [250, 250, 250, 255];
const box = make(4, 4, [K, K, K, K, K, WHITE, W, K, K, WHITE, WHITE, K, K, K, K, K]);
assert.equal(floodFill(box, 1, 1, R, 8), 4);
assert.deepEqual(at(box, 2, 1), R); assert.deepEqual(at(box, 0, 0), K);
assert.equal(floodFill(box, 1, 1, R, 8), 0);
const strict = make(2, 1, [WHITE, W]);
assert.equal(floodFill(strict, 0, 0, B, 0), 1);
const snake = make(5, 3, [WHITE, K, WHITE, WHITE, WHITE, WHITE, K, WHITE, K, WHITE, WHITE, WHITE, WHITE, K, WHITE]);
assert.equal(floodFill(snake, 0, 0, G, 0), 11);
assert.equal(floodFill(snake, -1, 0, G, 0), 0);

const history = new History<number[]>(3, 1000, v => v.length);
history.push([1]); history.push([2]); history.push([3]); history.push([4]);
assert.deepEqual(history.undoStack, [[2], [3], [4]]);
assert.deepEqual(history.undo([5]), [4]); assert.deepEqual(history.redo([4]), [5]);
assert.deepEqual(history.undo([5]), [4]); history.push([9]); assert.equal(history.canRedo, false);
const capped = new History<number[]>(30, 5, v => v.length);
capped.push([1, 1, 1]); capped.push([2, 2, 2]); assert.equal(capped.undoStack.length, 1);

assert.deepEqual(rectFromPoints({ x: 5.5, y: 1 }, { x: 1.2, y: 3.4 }), { x: 1, y: 1, width: 5, height: 3 });
assert.deepEqual(toImagePoint(150, 60, { left: 100, top: 50, width: 200, height: 100 }, 400, 200), { x: 100, y: 20 });
assert.deepEqual(parseHex('#ff0080'), [255, 0, 128, 255]);
assert.equal(outputFormat('jpeg').mime, 'image/jpeg'); assert.equal(outputFormat('jpg').ext, 'jpg'); assert.equal(outputFormat('webp').ext, 'png');
assert.deepEqual(editPolicy('scan', 'png'), { kind: 'raster', overwrite: true, converts: false, note: '' });
assert.equal(editPolicy('scan', 'gif').converts, true);
assert.equal(editPolicy('testasset-abc-scan', 'png').overwrite, false);
assert.equal(editPolicy('g', 'svg', '<svg><metadata id="math-graph-model">{}</metadata></svg>').kind, 'graph');
assert.equal(editPolicy('d', 'svg', '<svg/>').kind, 'svg'); assert.equal(editPolicy('d', 'pdf').kind, 'pdf');
const taken = new Set(['scan-edited']);
assert.equal(copyName('scan', n => taken.has(n)), 'scan-edited-2'); assert.equal(copyName('scan-edited', () => false), 'scan-edited');
assert.equal(copyName('testasset-fnv1a32-0123abcd-photo', () => false), 'photo-edited'); assert.equal(copyName('testasset-x', () => false), 'x-edited');
assert.deepEqual(rasterSize(100, 50), { width: 1600, height: 800 }); assert.deepEqual(rasterSize(3000, 2000), { width: 3000, height: 2000 });
console.log('Image editor logic passed: rotate/flip, crop/extend beyond edges, bounded flood fill, bounded history, pointer mapping, formats and save policy.');
