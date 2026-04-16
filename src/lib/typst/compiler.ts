/**
 * Lazy-loading Typst compiler wrapper.
 *
 * Uses @myriaddreamin/typst.ts with the web-compiler WASM to compile Typst
 * source to PDF or SVG entirely in the browser — no server required.
 *
 * The compiler WASM (~28 MB) and renderer WASM (~1 MB) are loaded on first
 * use only, then cached for the life of the page.
 */

// Vite resolves these ?url imports to the bundled WASM file paths.
// @ts-ignore — non-standard Vite asset URL import
import compilerWasmUrl from '@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm?url';
// @ts-ignore
import rendererWasmUrl from '@myriaddreamin/typst-ts-renderer/pkg/typst_ts_renderer_bg.wasm?url';

export interface CompileResult {
  /** Object URL pointing to a PDF blob (must be revoked by caller when done). */
  pdfUrl?: string;
  error?: string;
}

export interface SvgResult {
  /** Raw SVG markup string for all pages. */
  svg?: string;
  error?: string;
}

// Tracks the in-flight initialization promise.
// Once initialization succeeds, initDone is set to true and we never
// call setCompilerInitOptions / setRendererInitOptions again (the library
// throws if called twice).
let initPromise: Promise<void> | null = null;
let initDone = false;

async function ensureInitialized(): Promise<void> {
  if (initDone) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const { $typst } = await import('@myriaddreamin/typst.ts');
    $typst.setCompilerInitOptions({
      getModule: () => fetch(compilerWasmUrl).then((r) => r.arrayBuffer()),
    });
    $typst.setRendererInitOptions({
      getModule: () => fetch(rendererWasmUrl).then((r) => r.arrayBuffer()),
    });
    // Warm up the compiler so the first real compile is fast.
    await $typst.pdf({ mainContent: '#set page(width: 1pt, height: 1pt)' }).catch(() => {});
    initDone = true;
  })();

  // If initialization itself fails, clear the promise so it can be retried.
  initPromise.catch(() => {
    initPromise = null;
  });

  return initPromise;
}

function formatError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  try { return JSON.stringify(e); } catch { return String(e); }
}

export async function compile(source: string): Promise<CompileResult> {
  try {
    await ensureInitialized();

    const { $typst } = await import('@myriaddreamin/typst.ts');
    const bytes = await $typst.pdf({ mainContent: source });

    if (!bytes || bytes.length === 0) {
      return { error: 'Compiler produced no output.' };
    }

    const blob = new Blob([bytes], { type: 'application/pdf' });
    const pdfUrl = URL.createObjectURL(blob);
    return { pdfUrl };
  } catch (e) {
    return { error: formatError(e) };
  }
}

export async function compileSvg(source: string): Promise<SvgResult> {
  try {
    await ensureInitialized();

    const { $typst } = await import('@myriaddreamin/typst.ts');
    const svg = await $typst.svg({ mainContent: source });

    if (!svg || svg.length === 0) {
      return { error: 'Compiler produced no output.' };
    }

    return { svg };
  } catch (e) {
    return { error: formatError(e) };
  }
}
