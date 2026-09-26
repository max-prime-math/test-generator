/** Browser facade: all Typst WASM initialization and compilation runs in a worker. */
import { prepareImages, scanImageRefs } from './image-shadow';
import { formatError } from './diagnostics';
import { perf } from '../perf-diagnostics';
import type { CompilerRequest, CompilerResponse, PreparedDocument } from './worker-protocol';
export { parseTypstError, findDelimiterIssues } from './diagnostics';

export interface CompileResult { pdfUrl?: string; error?: string }
/** `cancelled` means a newer request from the same consumer replaced this one before it compiled. */
export interface SvgResult { svg?: string; error?: string; cancelled?: boolean }
export interface PreviewOptions { consumer?: string }

let worker: Worker | undefined;
let sequence = 0;
const inWorker = new Map<number, { resolve: (response: CompilerResponse) => void; reject: (reason: Error) => void }>();

function getWorker(): Worker {
  if (worker) return worker;
  const instance = new Worker(new URL('./compiler.worker.ts', import.meta.url), { type: 'module' });
  worker = instance;
  const failed = (message: string) => {
    instance.terminate();
    if (worker === instance) worker = undefined;
    for (const request of inWorker.values()) request.reject(new Error(message));
    inWorker.clear();
  };
  instance.onerror = (event) => failed(event.message || 'The preview worker stopped. Try previewing again.');
  instance.onmessageerror = () => failed('Could not read the preview worker response.');
  instance.onmessage = ({ data }: MessageEvent<CompilerResponse>) => {
    const request = inWorker.get(data.id);
    if (!request) return;
    inWorker.delete(data.id);
    if (data.error) request.reject(new Error(data.error));
    else request.resolve(data);
  };
  return instance;
}

function send(kind: CompilerRequest['kind'], document?: PreparedDocument): Promise<CompilerResponse> {
  return new Promise((resolve, reject) => {
    const instance = getWorker();
    const id = ++sequence;
    inWorker.set(id, { resolve, reject });
    try {
      instance.postMessage({ id, kind, document } satisfies CompilerRequest,
        document?.images.map(image => image.bytes.buffer as ArrayBuffer) ?? []);
    } catch (error) {
      inWorker.delete(id);
      reject(error);
    }
  });
}

// ── Scheduling ───────────────────────────────────────────────────────────────
// Jobs wait here, not in the worker, so a consumer's obsolete preview can be
// dropped before its images are read or compiled. One job runs at a time. PDF
// and batch jobs have no consumer and are never replaced.
interface Waiter { consumer?: string; resolve: (response: CompilerResponse | null) => void; reject: (reason: Error) => void }
interface Job { kind: CompilerRequest['kind']; source?: string; waiters: Waiter[] }
const queue: Job[] = [];
let running: Job | null = null;

function schedule(kind: CompilerRequest['kind'], source?: string, consumer?: string): Promise<CompilerResponse | null> {
  return new Promise((resolve, reject) => {
    if (consumer) cancelQueued(consumer);
    const waiter: Waiter = { consumer, resolve, reject };
    // Identical queued or running work is shared rather than compiled twice.
    const same = kind === 'svg' ? [running, ...queue].find(job => job?.kind === kind && job.source === source) : undefined;
    if (same) same.waiters.push(waiter);
    else queue.push({ kind, source, waiters: [waiter] });
    perf.gauge('Preview queue length', queue.length);
    void pump();
  });
}

/** Resolve a consumer's queued (not yet started) request as cancelled. Its running request, and every other consumer's, is untouched. */
export function cancelPreview(consumer: string): void { cancelQueued(consumer); }

function cancelQueued(consumer: string): void {
  for (let index = queue.length - 1; index >= 0; index--) {
    const job = queue[index];
    const kept = job.waiters.filter(waiter => {
      if (waiter.consumer !== consumer) return true;
      waiter.resolve(null);
      perf.count('Preview: obsolete requests skipped');
      return false;
    });
    job.waiters = kept;
    if (!kept.length) queue.splice(index, 1);
  }
}

async function pump(): Promise<void> {
  if (running) return;
  const job = queue.shift();
  if (!job) return;
  running = job;
  const done = perf.start(`Compile (${job.kind}) in worker`);
  try {
    const response = await send(job.kind, job.source === undefined ? undefined : await prepare(job.source));
    done();
    for (const waiter of job.waiters) waiter.resolve(response);
  } catch (error) {
    for (const waiter of job.waiters) waiter.reject(error instanceof Error ? error : new Error(String(error)));
  } finally {
    running = null;
    void pump();
  }
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
  await schedule('initialize');
}

export async function compile(source: string): Promise<CompileResult> {
  try {
    const response = await schedule('pdf', source);
    if (!response?.bytes?.length) return { error: 'Compiler produced no output.' };
    return { pdfUrl: URL.createObjectURL(new Blob([response.bytes.buffer as ArrayBuffer], { type: 'application/pdf' })) };
  } catch (error) { return { error: formatError(error) }; }
}

export async function compileMultiple(sources: string[]): Promise<{ name: string; bytes: Uint8Array }[]> {
  await ensureInitialized();
  const results: { name: string; bytes: Uint8Array }[] = [];
  for (let i = 0; i < sources.length; i++) {
    try {
      const response = await schedule('pdf', sources[i]);
      if (response?.bytes?.length) results.push({ name: `question-${String(i + 1).padStart(2, '0')}.pdf`, bytes: response.bytes });
    } catch { /* Preserve bulk export's behavior of skipping failed questions. */ }
  }
  return results;
}

// Image-free previews can be reused without maintaining a second image-version
// index. Image previews always reread assets so replacements cannot go stale.
const svgCache = new Map<string, string>();
let cacheCharacters = 0;
const MAX_CACHE_CHARACTERS = 4_000_000;

let consumers = 0;
/** A stable identity for one preview surface; its newer requests replace its queued older ones. */
export function previewConsumer(name: string): string { return `${name}#${++consumers}`; }

export async function compileSvg(source: string, options: PreviewOptions = {}): Promise<SvgResult> {
  const cacheable = scanImageRefs(source).length === 0;
  const cached = cacheable ? svgCache.get(source) : undefined;
  if (cached) {
    if (options.consumer) cancelQueued(options.consumer);
    svgCache.delete(source);
    svgCache.set(source, cached);
    perf.count('Preview: cache hits');
    return { svg: cached };
  }
  try {
    const response = await schedule('svg', source, options.consumer);
    if (!response) return { cancelled: true };
    const svg = response.svg;
    if (!svg) return { error: 'Compiler produced no output.' };
    if (cacheable && !svgCache.has(source) && source.length + svg.length <= MAX_CACHE_CHARACTERS) {
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
}

/** Test and diagnostics hook: queued jobs and whether one is running. */
export function previewQueueState(): { queued: number; running: boolean } {
  return { queued: queue.length, running: running !== null };
}
