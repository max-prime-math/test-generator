// Keep this module free of UI/image-store imports: it runs in a dedicated
// worker, including the library's normal fonts and package-fetching pipeline.
import { $typst } from '@myriaddreamin/typst.ts';
// @ts-ignore — Vite emits these assets beside the worker bundle.
import compilerWasmUrl from '@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm?url';
// @ts-ignore
import rendererWasmUrl from '@myriaddreamin/typst-ts-renderer/pkg/typst_ts_renderer_bg.wasm?url';
import { formatError } from './diagnostics';
import type { CompilerRequest, CompilerResponse } from './worker-protocol';

let configured = false;
let initialized = false;
async function initialize(): Promise<void> {
  if (initialized) return;
  if (!configured) {
    $typst.setCompilerInitOptions({ getModule: () => fetch(compilerWasmUrl).then(response => response.arrayBuffer()) });
    $typst.setRendererInitOptions({ getModule: () => fetch(rendererWasmUrl).then(response => response.arrayBuffer()) });
    configured = true;
  }
  await $typst.pdf({ mainContent: '#set page(width: 1pt, height: 1pt)' });
  initialized = true;
}

async function handle(job: CompilerRequest): Promise<void> {
  const response: CompilerResponse = { id: job.id };
  try {
    await initialize();
    if (job.kind !== 'initialize') {
      if (!job.document) throw new Error('Missing preview source.');
      // The compiler owns one virtual filesystem. Complete each render before
      // clearing it for the next job, even when previews and exports overlap.
      await $typst.resetShadow();
      for (const image of job.document.images) await $typst.mapShadow(image.path, image.bytes);
      if (job.kind === 'pdf') response.bytes = await $typst.pdf({ mainContent: job.document.source });
      else response.svg = await $typst.svg({ mainContent: job.document.source });
    }
  } catch (error) { response.error = formatError(error); }
  self.postMessage(response, { transfer: response.bytes ? [response.bytes.buffer as ArrayBuffer] : [] });
}

let queue: Promise<void> = Promise.resolve();
self.onmessage = ({ data }: MessageEvent<CompilerRequest>) => {
  queue = queue.then(() => handle(data)).catch(error => {
    self.postMessage({ id: data.id, error: formatError(error) } satisfies CompilerResponse);
  });
};
