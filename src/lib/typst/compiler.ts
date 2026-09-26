/** Browser facade: all Typst WASM initialization and compilation runs in a worker. */
import { prepareImages, scanImageRefs } from './image-shadow';
import { formatError } from './diagnostics';
import type { CompilerRequest, CompilerResponse, PreparedDocument } from './worker-protocol';
export { parseTypstError, findDelimiterIssues } from './diagnostics';

export interface CompileResult { pdfUrl?: string; error?: string }
export interface SvgResult { svg?: string; error?: string }

let worker: Worker | undefined;
let sequence = 0;
const pending = new Map<number, {
  resolve: (response: CompilerResponse) => void;
  reject: (reason: Error) => void;
}>();

function getWorker(): Worker {
  if (worker) return worker;
  const instance = new Worker(new URL('./compiler.worker.ts', import.meta.url), { type: 'module' });
  worker = instance;
  const failed = (message: string) => {
    instance.terminate();
    if (worker === instance) worker = undefined;
    for (const request of pending.values()) request.reject(new Error(message));
    pending.clear();
  };
  instance.onerror = (event) => failed(event.message || 'The preview worker stopped. Try previewing again.');
  instance.onmessageerror = () => failed('Could not read the preview worker response.');
  instance.onmessage = ({ data }: MessageEvent<CompilerResponse>) => {
    const request = pending.get(data.id);
    if (!request) return;
    pending.delete(data.id);
    if (data.error) request.reject(new Error(data.error));
    else request.resolve(data);
  };
  return instance;
}

function request(kind: CompilerRequest['kind'], document?: PreparedDocument): Promise<CompilerResponse> {
  return new Promise((resolve, reject) => {
    const instance = getWorker();
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    try {
      instance.postMessage({ id, kind, document } satisfies CompilerRequest,
        document?.images.map(image => image.bytes.buffer as ArrayBuffer) ?? []);
    } catch (error) {
      pending.delete(id);
      reject(error);
    }
  });
}

// Resolve only the requested images on the UI side, where the existing image
// store handles workspace names and case matching. Never send the whole bank.
async function prepare(source: string): Promise<PreparedDocument> {
  const images: PreparedDocument['images'] = [];
  const prepared = await prepareImages({
    resetShadow() {},
    mapShadow(path, bytes) { images.push({ path, bytes }); },
  }, source);
  return { source: prepared, images };
}

export async function ensureInitialized(): Promise<void> {
  await request('initialize');
}

export async function compile(source: string): Promise<CompileResult> {
  try {
    const { bytes } = await request('pdf', await prepare(source));
    if (!bytes?.length) return { error: 'Compiler produced no output.' };
    return { pdfUrl: URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' })) };
  } catch (error) { return { error: formatError(error) }; }
}

export async function compileMultiple(sources: string[]): Promise<{ name: string; bytes: Uint8Array }[]> {
  await ensureInitialized();
  const results: { name: string; bytes: Uint8Array }[] = [];
  for (let i = 0; i < sources.length; i++) {
    try {
      const { bytes } = await request('pdf', await prepare(sources[i]));
      if (bytes?.length) results.push({ name: `question-${String(i + 1).padStart(2, '0')}.pdf`, bytes });
    } catch { /* Preserve bulk export's behavior of skipping failed questions. */ }
  }
  return results;
}

// Image-free previews can be reused without maintaining a second image-version
// index. Image previews always reread assets so replacements cannot go stale.
const svgCache = new Map<string, string>();
const svgPending = new Map<string, Promise<SvgResult>>();
let cacheCharacters = 0;
const MAX_CACHE_CHARACTERS = 4_000_000;

export async function compileSvg(source: string): Promise<SvgResult> {
  const cacheable = scanImageRefs(source).length === 0;
  const cached = cacheable ? svgCache.get(source) : undefined;
  if (cached) {
    svgCache.delete(source);
    svgCache.set(source, cached);
    return { svg: cached };
  }
  if (cacheable && svgPending.has(source)) return svgPending.get(source)!;
  const render = (async (): Promise<SvgResult> => {
    try {
      const { svg } = await request('svg', await prepare(source));
      if (!svg) return { error: 'Compiler produced no output.' };
      if (cacheable && source.length + svg.length <= MAX_CACHE_CHARACTERS) {
        svgCache.set(source, svg);
        cacheCharacters += source.length + svg.length;
        while (svgCache.size > 24 || cacheCharacters > MAX_CACHE_CHARACTERS) {
          const oldest = svgCache.keys().next().value!;
          cacheCharacters -= oldest.length + svgCache.get(oldest)!.length;
          svgCache.delete(oldest);
        }
      }
      return { svg };
    } catch (error) { return { error: formatError(error) }; }
  })();
  if (cacheable) svgPending.set(source, render);
  try { return await render; }
  finally { if (cacheable) svgPending.delete(source); }
}
