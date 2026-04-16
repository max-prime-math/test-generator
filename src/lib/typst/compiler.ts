/**
 * Lazy-loading Typst compiler wrapper.
 *
 * Uses @myriaddreamin/typst.ts with the web-compiler WASM to compile Typst
 * source to PDF entirely in the browser — no server required.
 *
 * The WASM module (~28 MB) is loaded on first use only, then cached for the
 * life of the page.
 */

// Vite resolves this ?url import to the bundled WASM file path.
// @ts-ignore — non-standard Vite asset URL import
import compilerWasmUrl from '@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm?url';

export interface CompileResult {
  /** Object URL pointing to a PDF blob (must be revoked by caller when done). */
  pdfUrl?: string;
  error?: string;
}

let initPromise: Promise<void> | null = null;

async function ensureInitialized(): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const { $typst } = await import('@myriaddreamin/typst.ts');
    $typst.setCompilerInitOptions({
      getModule: () => fetch(compilerWasmUrl).then((r) => r.arrayBuffer()),
    });
    // Warm up by doing a trivial compile so the first real compile is fast.
    await $typst.pdf({ mainContent: '' }).catch(() => {});
  })();

  return initPromise;
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
    // Reset so a retry can succeed after a transient failure
    initPromise = null;
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
