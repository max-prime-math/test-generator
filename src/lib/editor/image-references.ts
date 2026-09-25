import { imageKeyFromReference } from '../image-keys.ts';

const same = (path: string, key: string) => imageKeyFromReference(path).toLowerCase() === imageKeyFromReference(key).toLowerCase();
function rewriteSource(source: string, key: string, replacement: string): string {
  return source.replace(/"(\/imgs\/[^"\n]+)"|(#?image\s*\(\s*)"([^"\n]+)"/g,
    (full, virtual: string | undefined, prefix: string | undefined, path: string | undefined) =>
      same(virtual ?? path ?? '', key) ? `${prefix ?? ''}${JSON.stringify(replacement)}` : full)
    .replace(/(\\includegraphics(?:\[[^\]]*\])?\{)([^}]+)(\})/g,
      (full, prefix: string, path: string, suffix: string) => same(path, key) ? `${prefix}${replacement.replace(/^\/imgs\//, '')}${suffix}` : full);
}
/** Rewrites only image references/declarations, never arbitrary names or prose. */
export function rewriteImageReferences<T>(value: T, oldName: string, name: string, ext?: string): T {
  const path = `/imgs/${name}${ext ? `.${ext}` : ''}`;
  function visit(value: unknown, property = ''): unknown {
    if (typeof value === 'string') return ['images', 'imageReferences'].includes(property) && same(value, oldName) ? name : rewriteSource(value, oldName, path);
    if (Array.isArray(value)) return value.map(entry => visit(entry, property));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, visit(entry, key)]));
    return value;
  }
  return visit(value) as T;
}
export function usesImage(value: unknown, name: string): boolean {
  function visit(value: unknown, property = ''): boolean {
    if (typeof value === 'string') return (['images', 'imageReferences'].includes(property) && same(value, name)) || rewriteSource(value, name, '/imgs/__testgen_usage_probe__') !== value;
    if (Array.isArray(value)) return value.some(entry => visit(entry, property));
    return Boolean(value && typeof value === 'object' && Object.entries(value).some(([key, entry]) => visit(entry, key)));
  }
  return visit(value);
}

export interface ImageOccurrence {
  start: number; end: number; source: string; path: string; name: string;
  width: number; alignment: 'left' | 'center' | 'right'; simple: boolean;
  callStart: number; callEnd: number;
}
/** Find complete calls without stopping at parentheses inside strings/options. */
function closingParen(source: string, open: number): number {
  let depth = 0, quoted = false, escaped = false;
  for (let i = open; i < source.length; i++) {
    const c = source[i];
    if (quoted) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') quoted = false; continue; }
    if (c === '"') quoted = true;
    else if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return i;
  }
  return -1;
}
export function imageOccurrences(source: string): ImageOccurrence[] {
  const result: ImageOccurrence[] = [];
  for (const match of source.matchAll(/#?image\s*\(\s*"([^"\n]+)"/g)) {
    const path = match[1];
    if (/^[a-z]+:\/\//i.test(path)) continue;
    const callStart = match.index!;
    const callEnd = closingParen(source, source.indexOf('(', callStart)) + 1;
    if (!callEnd) continue;
    let start = callStart, end = callEnd;
    let alignment: ImageOccurrence['alignment'] = 'left';
    const before = source.slice(0, callStart);
    const wrapper = before.match(/#align\(\s*(center|left|right)\s*,\s*$/);
    if (wrapper && /^\s*\)/.test(source.slice(callEnd))) {
      start = callStart - wrapper[0].length;
      end = callEnd + source.slice(callEnd).match(/^\s*\)/)![0].length;
      alignment = wrapper[1] as ImageOccurrence['alignment'];
    }
    const call = source.slice(callStart, callEnd);
    const width = Number(call.match(/\bwidth:\s*([\d.]+)%/)?.[1] ?? 60);
    // Placement controls are offered for ordinary image calls with optional width.
    // Complex hand-written calls stay intact and remain editable in the source.
    const simple = /^(?:#)?image\s*\(\s*"[^"\n]+"\s*(?:,\s*width:\s*[\d.]+%\s*)?,?\s*\)$/.test(call) && (source[start] === '#' || Boolean(wrapper));
    result.push({ start, end, source: source.slice(start, end), path, name: imageKeyFromReference(path), width, alignment, simple, callStart, callEnd });
  }
  return result;
}
export function imageMarkup(name: string, width = 60, alignment: ImageOccurrence['alignment'] = 'center'): string {
  const size = Math.max(5, Math.min(100, Number.isFinite(width) ? width : 60));
  const call = `image(${JSON.stringify(`/imgs/${name}`)}, width: ${size}%)`;
  return alignment === 'left' ? `#${call}` : `#align(${alignment}, ${call})`;
}
export function replaceOccurrence(source: string, occurrence: ImageOccurrence, replacement: string): string {
  if (source.slice(occurrence.start, occurrence.end) !== occurrence.source) throw new Error('The source changed while editing this picture. Reopen its controls.');
  return source.slice(0, occurrence.start) + replacement + source.slice(occurrence.end);
}
export function replaceOccurrenceImage(source: string, occurrence: ImageOccurrence, name: string): string {
  const replacement = occurrence.source.replace(/(image\s*\(\s*)"[^"\n]+"/, (_match, prefix: string) => `${prefix}${JSON.stringify(`/imgs/${name}`)}`);
  return replaceOccurrence(source, occurrence, replacement);
}

/** Original literal references distinguish removed pictures from import-only declarations. */
export function referencedImageNames(value: unknown): string[] {
  const names = new Set<string>();
  function visit(value: unknown) {
    if (typeof value === 'string') {
      for (const match of value.matchAll(/"(\/imgs\/[^"\n]+)"|#?image\s*\(\s*"([^"\n]+)"/g)) {
        const key = imageKeyFromReference(match[1] ?? match[2]);
        if (key) names.add(key);
      }
    } else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') Object.values(value).forEach(visit);
  }
  visit(value); return [...names];
}
