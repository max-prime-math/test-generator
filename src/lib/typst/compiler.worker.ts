// Keep this module free of UI/image-store imports: it runs in a dedicated
// worker, including the library's normal fonts and package-fetching pipeline.
import { $typst } from '@myriaddreamin/typst.ts';
import { loadFonts } from '@myriaddreamin/typst.ts/options.init';
// @ts-ignore — Vite emits these assets beside the worker bundle.
import compilerWasmUrl from '@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm?url';
// @ts-ignore
import rendererWasmUrl from '@myriaddreamin/typst-ts-renderer/pkg/typst_ts_renderer_bg.wasm?url';
import { documentFontUrls } from './font-assets';
import { formatError } from './diagnostics';
import type { CompilerRequest, CompilerResponse } from './worker-protocol';

let configured = false;
let initialized = false;
async function fetchWasm(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load a Typst WebAssembly file (HTTP ${response.status}).`);
  return response.arrayBuffer();
}

async function initialize(): Promise<void> {
  if (initialized) return;
  if (!configured) {
    $typst.setCompilerInitOptions({
      beforeBuild: [loadFonts(documentFontUrls)],
      getModule: () => fetchWasm(compilerWasmUrl),
    });
    $typst.setRendererInitOptions({ getModule: () => fetchWasm(rendererWasmUrl) });
    configured = true;
  }
  await $typst.pdf({ mainContent: '#set page(width: 1pt, height: 1pt)' });
  initialized = true;
}

// $typst.query skips compiling, so query a world that has been compiled first.
async function query(source: string, selector: string): Promise<unknown[]> {
  const compiler = await $typst.getCompiler();
  compiler.addSource('/tg-query.typ', source);
  return compiler.runWithWorld({ mainFilePath: '/tg-query.typ' }, async (world) => {
    await world.compile();
    return world.query({ selector, field: 'value' }) as Promise<unknown[]>;
  });
}

async function handle(job: CompilerRequest): Promise<void> {
  const response: CompilerResponse = { id: job.id };
  try {
    await initialize();
    if (job.kind !== 'initialize') {
      if (!job.document) throw new Error('Missing preview source.');
      for (const image of job.document.images) await $typst.mapShadow(image.path, image.bytes);
      if (job.kind === 'pdf') response.bytes = await $typst.pdf({ mainContent: job.document.source });
      else if (job.kind === 'query') response.values = await query(job.document.source, job.selector!);
      else response.svg = await $typst.svg({ mainContent: job.document.source });
    }
  } catch (error) {
    response.error = formatError(error, job.document?.missingImages);
    if (!initialized) response.compilerUnavailable = true;
    // A WebAssembly trap can leave the compiler unusable for following jobs.
    if (error instanceof WebAssembly.RuntimeError) response.resetWorker = true;
  } finally {
    // Release mounted images as soon as a job finishes, including failed ones.
    if (initialized && !response.resetWorker && job.document?.images.length) {
      try { await $typst.resetShadow(); }
      catch { response.resetWorker = true; }
    }
  }
  self.postMessage(response, { transfer: response.bytes ? [response.bytes.buffer as ArrayBuffer] : [] });
}

let queue: Promise<void> = Promise.resolve();
self.onmessage = ({ data }: MessageEvent<CompilerRequest>) => {
  queue = queue.then(() => handle(data)).catch(error => {
    self.postMessage({ id: data.id, error: formatError(error) } satisfies CompilerResponse);
  });
};
