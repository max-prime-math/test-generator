/** Pure pixel and policy helpers for the Image Library viewer/editor. */
export interface Pixels { width: number; height: number; data: Uint8ClampedArray }
export interface Rect { x: number; y: number; width: number; height: number }
export interface Margins { top: number; right: number; bottom: number; left: number }
export type RGBA = [number, number, number, number];
export const WHITE: RGBA = [255, 255, 255, 255];
export const CLEAR: RGBA = [0, 0, 0, 0];
export const MAX_SIDE = 8192;
export const MAX_PIXELS = 40_000_000;

export function parseHex(hex: string, alpha = 255): RGBA {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = m ? parseInt(m[1], 16) : 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, alpha];
}
export function checkSize(width: number, height: number): void {
  if (width < 1 || height < 1) throw new Error('The image must be at least 1 pixel wide and tall.');
  if (width > MAX_SIDE || height > MAX_SIDE || width * height > MAX_PIXELS) throw new Error(`Images are limited to ${MAX_SIDE} pixels per side.`);
}
/** Integer rectangle covering both points (pixel cells), in any drag direction. */
export function rectFromPoints(a: { x: number; y: number }, b: { x: number; y: number }): Rect {
  const x = Math.floor(Math.min(a.x, b.x)), y = Math.floor(Math.min(a.y, b.y));
  return { x, y, width: Math.max(1, Math.ceil(Math.max(a.x, b.x)) - x), height: Math.max(1, Math.ceil(Math.max(a.y, b.y)) - y) };
}
export function clampRect(rect: Rect, width: number, height: number): Rect {
  const x = Math.max(0, Math.min(width, rect.x)), y = Math.max(0, Math.min(height, rect.y));
  return { x, y, width: Math.max(0, Math.min(width, rect.x + rect.width) - x), height: Math.max(0, Math.min(height, rect.y + rect.height) - y) };
}
export function extendRect(width: number, height: number, m: Margins): Rect {
  return { x: -m.left, y: -m.top, width: width + m.left + m.right, height: height + m.top + m.bottom };
}
/** Crop or extend: the result covers `rect`; areas outside the source are filled. */
export function recanvas(src: Pixels, rect: Rect, fill: RGBA): Pixels {
  checkSize(rect.width, rect.height);
  const data = new Uint8ClampedArray(rect.width * rect.height * 4);
  const out = new Uint32Array(data.buffer);
  out.fill(new Uint32Array(new Uint8ClampedArray(fill).buffer)[0]);
  const inner = clampRect(rect, src.width, src.height);
  for (let row = 0; row < inner.height; row++) {
    const from = ((inner.y + row) * src.width + inner.x) * 4;
    data.set(src.data.subarray(from, from + inner.width * 4), ((inner.y + row - rect.y) * rect.width + inner.x - rect.x) * 4);
  }
  return { width: rect.width, height: rect.height, data };
}
export function rotate(src: Pixels, direction: 'left' | 'right'): Pixels {
  const { width: w, height: h } = src;
  const from = new Uint32Array(src.data.buffer, src.data.byteOffset, w * h);
  const data = new Uint8ClampedArray(w * h * 4), to = new Uint32Array(data.buffer);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    // Right: (x, y) -> (h-1-y, x). Left: (x, y) -> (y, w-1-x). Output width is h.
    to[direction === 'right' ? x * h + (h - 1 - y) : (w - 1 - x) * h + y] = from[y * w + x];
  }
  return { width: h, height: w, data };
}
export function flipHorizontal(src: Pixels): Pixels {
  const { width: w, height: h } = src;
  const from = new Uint32Array(src.data.buffer, src.data.byteOffset, w * h);
  const data = new Uint8ClampedArray(w * h * 4), to = new Uint32Array(data.buffer);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) to[y * w + (w - 1 - x)] = from[y * w + x];
  return { width: w, height: h, data };
}
/** Scanline bucket fill of the region connected to (x, y) whose colour is within `tolerance` per channel. Mutates `img`. */
export function floodFill(img: Pixels, x: number, y: number, color: RGBA, tolerance = 32): number {
  const { width: w, height: h, data } = img;
  x = Math.floor(x); y = Math.floor(y);
  if (x < 0 || y < 0 || x >= w || y >= h) return 0;
  const s = (y * w + x) * 4, seed = [data[s], data[s + 1], data[s + 2], data[s + 3]];
  if (seed.every((v, i) => v === color[i])) return 0;
  const seen = new Uint8Array(w * h);
  const matches = (p: number) => !seen[p] && Math.abs(data[p * 4] - seed[0]) <= tolerance && Math.abs(data[p * 4 + 1] - seed[1]) <= tolerance
    && Math.abs(data[p * 4 + 2] - seed[2]) <= tolerance && Math.abs(data[p * 4 + 3] - seed[3]) <= tolerance;
  const stack = [x, y];
  let changed = 0;
  while (stack.length) {
    const py = stack.pop()!, px = stack.pop()!;
    if (!matches(py * w + px)) continue;
    let left = px, right = px;
    while (left > 0 && matches(py * w + left - 1)) left--;
    while (right < w - 1 && matches(py * w + right + 1)) right++;
    for (let cx = left; cx <= right; cx++) {
      const p = py * w + cx;
      seen[p] = 1; data.set(color, p * 4); changed++;
    }
    for (const ny of [py - 1, py + 1]) {
      if (ny < 0 || ny >= h) continue;
      let open = false;
      for (let cx = left; cx <= right; cx++) {
        const ok = matches(ny * w + cx);
        if (ok && !open) stack.push(cx, ny);
        open = ok;
      }
    }
  }
  return changed;
}
/** Bounded undo/redo of whole-canvas snapshots, limited by step count and total bytes. */
export class History<T> {
  undoStack: T[] = [];
  redoStack: T[] = [];
  limit: number; maxBytes: number; size: (value: T) => number;
  constructor(limit = 30, maxBytes = 300_000_000, size: (value: T) => number = () => 0) { this.limit = limit; this.maxBytes = maxBytes; this.size = size; }
  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }
  /** Record the state before a change. */
  push(before: T): void {
    this.undoStack.push(before); this.redoStack = [];
    this.#trim();
  }
  undo(current: T): T | undefined {
    const previous = this.undoStack.pop();
    if (previous !== undefined) this.redoStack.push(current);
    return previous;
  }
  redo(current: T): T | undefined {
    const next = this.redoStack.pop();
    if (next !== undefined) { this.undoStack.push(current); this.#trim(); }
    return next;
  }
  clear(): void { this.undoStack = []; this.redoStack = []; }
  #trim(): void {
    let bytes = [...this.undoStack, ...this.redoStack].reduce((sum, value) => sum + this.size(value), 0);
    while (this.undoStack.length > 1 && (this.undoStack.length > this.limit || bytes > this.maxBytes)) bytes -= this.size(this.undoStack.shift()!);
  }
}
/** Map a pointer position to image pixel coordinates; independent of zoom and devicePixelRatio. */
export function toImagePoint(clientX: number, clientY: number, box: { left: number; top: number; width: number; height: number }, width: number, height: number) {
  return { x: (clientX - box.left) * width / box.width, y: (clientY - box.top) * height / box.height };
}
export const isMathGraphSvg = (text: string) => text.includes('<metadata id="math-graph-model">');
export const isSnapshotImage = (name: string) => name.startsWith('testasset-');
/** PNG stays PNG, JPEG stays JPEG; other raster formats are written as PNG. */
export function outputFormat(ext: string): { ext: string; mime: string; quality?: number; alpha: boolean } {
  const lower = ext.toLowerCase();
  if (lower === 'jpg' || lower === 'jpeg') return { ext: lower, mime: 'image/jpeg', quality: 0.92, alpha: false };
  return { ext: 'png', mime: 'image/png', alpha: true };
}
export type EditKind = 'raster' | 'svg' | 'graph' | 'pdf';
export function editPolicy(name: string, ext: string, svgText = ''): { kind: EditKind; overwrite: boolean; converts: boolean; note: string } {
  const lower = ext.toLowerCase(), snapshot = isSnapshotImage(name);
  if (lower === 'pdf') return { kind: 'pdf', overwrite: false, converts: false, note: 'PDF files can be viewed but not edited here.' };
  if (lower === 'svg') return isMathGraphSvg(svgText)
    ? { kind: 'graph', overwrite: false, converts: false, note: 'This is a Math Graph. Edit it with “Edit graph” on the picture card in the question editor.' }
    : { kind: 'svg', overwrite: false, converts: false, note: 'SVG drawings are vector images. Edit a PNG copy to paint on it; the original stays unchanged.' };
  const converts = outputFormat(lower).ext !== lower;
  const note = snapshot ? 'This is a saved-test snapshot. Edits can only be saved as a copy.'
    : converts ? `${lower.toUpperCase()} images are saved as PNG. Saving updates references to the new file type.` : '';
  return { kind: 'raster', overwrite: !snapshot, converts, note };
}
/** A readable, unused name for a copy of `name`. */
export function copyName(name: string, taken: (name: string) => boolean): string {
  const stem = name.replace(/^testasset-(?:[a-z0-9]+-[0-9a-f]{8}-)?/, '').replace(/-edited(-\d+)?$/, '').replace(/^[^a-zA-Z0-9]+/, '').slice(0, 100) || 'image';
  let candidate = `${stem}-edited`, index = 2;
  while (taken(candidate)) candidate = `${stem}-edited-${index++}`;
  return candidate;
}
/** Raster size for an SVG copy: small drawings are upscaled so painting stays crisp. */
export function rasterSize(width: number, height: number, target = 1600, max = 4096): { width: number; height: number } {
  const w = width > 0 ? width : 1200, h = height > 0 ? height : Math.round(w * 0.75);
  const scale = Math.min(Math.max(1, target / Math.max(w, h)), max / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}
export function formatBytes(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
