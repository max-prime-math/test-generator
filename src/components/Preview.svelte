<!--
  Compiles Typst source to SVG in-browser and renders it directly in the DOM.
  Pages are shown with a drop shadow, dimmed during recompile.
  Default zoom mode is "fit to width" — scales dynamically with the container.
-->
<script lang="ts">
  import { compileSvg, compile, compileMultiple } from '../lib/typst/compiler';
  import { zipSync } from 'fflate';

  interface Props {
    source: string;
    questionSources?: string[];
  }

  let { source, questionSources = [] }: Props = $props();

  // ── Result state ─────────────────────────────────────────────────────────
  // Kept separate from compile-in-progress so the $effect never reads state
  // variables as dependencies (avoids infinite re-run loops).
  let svgResult  = $state<string | null>(null);
  let errorMsg   = $state<string | null>(null);
  let compiling  = $state(false);
  let showSource = $state(false);

  // ── Zoom ─────────────────────────────────────────────────────────────────
  let fitMode    = $state(true);
  let manualZoom = $state(1.0);
  let fitZoom    = $state(1.0);

  const ZOOM_STEP = 0.25;
  const ZOOM_MIN  = 0.25;
  const ZOOM_MAX  = 3.0;
  const PADDING   = 48; // 2 × 1.5rem padding in .svg-scroll

  /** Parse the SVG's natural width in CSS pixels from its width attribute. */
  function parseSvgWidthPx(svg: string): number {
    const m = svg.match(/<svg[^>]*\swidth="([^"]+)"/);
    if (!m) return 816;
    const raw = m[1].trim();
    if (raw.endsWith('pt')) return parseFloat(raw) * (96 / 72);
    if (raw.endsWith('px')) return parseFloat(raw);
    if (raw.endsWith('mm')) return parseFloat(raw) * (96 / 25.4);
    if (raw.endsWith('cm')) return parseFloat(raw) * (96 / 2.54);
    if (raw.endsWith('in')) return parseFloat(raw) * 96;
    return parseFloat(raw);
  }

  /**
   * Inject grey page-break bars into the SVG so multi-page documents have
   * visible separators.  Bars are inserted first (behind all content) so they
   * never cover typeset text.
   *
   * Page height is inferred from the Typst source (`paper: "…"` setting).
   */
  function injectPageBreaks(svg: string, src: string): string {
    // Determine page height in SVG user units (pt).
    const paperMatch = src.match(/paper:\s*"([^"]+)"/);
    const paper = paperMatch?.[1] ?? 'us-letter';
    const pageH = paper === 'a4' ? 841.89 : 792; // pt

    // Parse viewBox to get total SVG dimensions.
    const vbMatch = svg.match(/viewBox="([\d.e+-]+)\s+([\d.e+-]+)\s+([\d.e+-]+)\s+([\d.e+-]+)"/);
    if (!vbMatch) return svg;
    const vbW = parseFloat(vbMatch[3]);
    const vbH = parseFloat(vbMatch[4]);

    const rawPages = vbH / pageH;
    const numPages = Math.round(rawPages);

    // Each inter-page gap in SVG units (may be 0 or a small positive number).
    const gapUnit = numPages > 1 ? (vbH - numPages * pageH) / (numPages - 1) : 0;
    // Visual separator bar height: at least 8pt so it's clearly visible.
    const barH = Math.max(gapUnit, 8);
    const barY0 = gapUnit > 0
      ? -((barH - gapUnit) / 2)   // centre the bar over the existing gap
      : -(barH / 2);              // centre the bar over the page boundary

    // Build backgrounds + separators, inserted right after <svg …> so they
    // sit behind all typeset content.
    let injected = '';

    // White background for every page.
    for (let i = 0; i < numPages; i++) {
      const y = i * (pageH + gapUnit);
      injected += `<rect x="0" y="${y.toFixed(2)}" width="${vbW}" height="${pageH.toFixed(2)}" fill="white"/>`;
    }

    // Grey separator bars between pages.
    for (let i = 1; i < numPages; i++) {
      const y = i * pageH + (i - 1) * gapUnit + barY0;
      injected += `<rect x="0" y="${y.toFixed(2)}" width="${vbW}" height="${barH.toFixed(2)}" fill="#888" opacity="0.6"/>`;
    }

    return svg.replace(/(<svg[^>]*>)/, `$1${injected}`);
  }

  let svgWidthPx = $derived(svgResult ? parseSvgWidthPx(svgResult) : 816);
  let scrollEl   = $state<HTMLDivElement | null>(null);

  // Recalculate fitZoom whenever the container resizes or a new SVG arrives.
  $effect(() => {
    const el = scrollEl;
    const w  = svgWidthPx; // dependency: re-run when SVG changes

    if (!el) return;

    function calc() {
      fitZoom = Math.max(ZOOM_MIN, (el!.clientWidth - PADDING) / w);
    }

    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(el);
    return () => ro.disconnect();
  });

  let effectiveZoom = $derived(fitMode ? fitZoom : manualZoom);

  function zoomIn() {
    fitMode    = false;
    manualZoom = Math.min(ZOOM_MAX, +(manualZoom + ZOOM_STEP).toFixed(2));
  }
  function zoomOut() {
    fitMode    = false;
    manualZoom = Math.max(ZOOM_MIN, +(manualZoom - ZOOM_STEP).toFixed(2));
  }
  function zoomReset() {
    fitMode    = false;
    manualZoom = 1.0;
  }
  function enableFit() { fitMode = true; }

  // ── Compile effect ────────────────────────────────────────────────────────
  let lastSource = '';
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  $effect(() => {
    const src = source; // only dependency

    if (debounceTimer) clearTimeout(debounceTimer);
    compiling = true;

    debounceTimer = setTimeout(async () => {
      lastSource = src;
      const result = await compileSvg(src);

      if (src !== lastSource) return;

      compiling = false;
      if (result.svg) {
        svgResult = injectPageBreaks(result.svg, src);
        errorMsg  = null;
      } else {
        errorMsg  = result.error ?? 'Unknown error';
        svgResult = null;
      }
    }, 800);
  });

  function downloadSource() {
    const blob = new Blob([source], { type: 'text/plain' });
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = 'test.typ';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  let pdfBusy  = $state(false);
  let zipBusy  = $state(false);

  async function downloadPdf() {
    pdfBusy = true;
    const result = await compile(source);
    pdfBusy = false;
    if (!result.pdfUrl) return;
    const a = document.createElement('a');
    a.href = result.pdfUrl;
    a.download = 'test.pdf';
    a.click();
    setTimeout(() => URL.revokeObjectURL(result.pdfUrl!), 1000);
  }

  async function downloadZip() {
    if (!questionSources.length) return;
    zipBusy = true;
    const pdfs = await compileMultiple(questionSources);
    zipBusy = false;
    if (!pdfs.length) return;
    const files: Record<string, Uint8Array> = {};
    for (const { name, bytes } of pdfs) files[name] = bytes;
    const zipped = zipSync(files);
    const blob = new Blob([zipped], { type: 'application/zip' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'questions.zip';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function printPdf() {
    pdfBusy = true;
    const result = await compile(source);
    pdfBusy = false;
    if (!result.pdfUrl) return;
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;inset:0;width:0;height:0;opacity:0;';
    iframe.src = result.pdfUrl;
    document.body.appendChild(iframe);
    iframe.onload = () => {
      iframe.contentWindow?.print();
      setTimeout(() => {
        document.body.removeChild(iframe);
        URL.revokeObjectURL(result.pdfUrl!);
      }, 60000);
    };
  }

  let statusLabel  = $derived(compiling ? 'Compiling…' : errorMsg ? 'Error' : 'Preview');
  let displayPct   = $derived(Math.round(effectiveZoom * 100));
</script>

<div class="preview">
  <div class="toolbar">
    <span class="label">{statusLabel}</span>
    <div class="zoom-controls">
      <button
        class="ghost icon"
        onclick={zoomOut}
        disabled={!fitMode && manualZoom <= ZOOM_MIN}
        title="Zoom out"
      >−</button>
      <button class="ghost zoom-label" onclick={zoomReset} title="Reset to 100%">
        {displayPct}%
      </button>
      <button
        class="ghost icon"
        onclick={zoomIn}
        disabled={!fitMode && manualZoom >= ZOOM_MAX}
        title="Zoom in"
      >+</button>
      <button
        class="ghost fit-btn"
        class:active={fitMode}
        onclick={enableFit}
        title="Fit to width"
      >Fit</button>
    </div>
    <div class="actions">
      <button class="ghost" onclick={() => (showSource = !showSource)}>
        {showSource ? 'Hide source' : 'Show source'}
      </button>
      <button class="ghost" onclick={downloadSource}>Download .typ</button>
      <button class="ghost" onclick={downloadPdf} disabled={pdfBusy || zipBusy || !svgResult}>
        {pdfBusy ? 'Compiling…' : 'Download PDF'}
      </button>
      {#if questionSources.length > 0}
        <button class="ghost" onclick={downloadZip} disabled={pdfBusy || zipBusy || !svgResult}>
          {zipBusy ? 'Compiling…' : 'Download individually'}
        </button>
      {/if}
      <button class="ghost" onclick={printPdf} disabled={pdfBusy || zipBusy || !svgResult}>
        Print
      </button>
    </div>
  </div>

  <div class="content">
    {#if showSource}
      <pre class="source">{source}</pre>
    {:else if svgResult !== null}
      <div class="svg-scroll" class:stale={compiling} bind:this={scrollEl}>
        <div class="svg-page" style="zoom: {effectiveZoom}">
          {@html svgResult}
        </div>
      </div>
    {:else if errorMsg !== null}
      <div class="status column">
        <p class="error-title">Compilation error</p>
        <pre class="error-msg">{errorMsg}</pre>
        <button class="ghost" onclick={() => (showSource = true)}>Show Typst source</button>
      </div>
    {:else if compiling}
      <div class="status">
        <div class="spinner"></div>
        <span>Compiling…</span>
      </div>
    {:else}
      <div class="status">
        <span class="muted">Build a test to see a preview.</span>
      </div>
    {/if}
  </div>
</div>

<style>
  .preview {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    border-left: 1px solid var(--border);
  }

  .toolbar {
    display: flex;
    align-items: center;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--border);
    gap: 0.5rem;
    flex-shrink: 0;
  }

  .label {
    font-size: 12px;
    font-weight: 500;
    color: var(--text-2);
    flex: 1;
  }

  .zoom-controls {
    display: flex;
    align-items: center;
    gap: 0;
    margin-right: 0.25rem;
  }

  .zoom-controls .icon {
    font-size: 16px;
    font-weight: 600;
    line-height: 1;
    padding: 0.2rem 0.45rem;
    min-width: 0;
  }

  .zoom-label {
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    padding: 0.2rem 0.35rem;
    min-width: 3.2em;
    text-align: center;
  }

  .fit-btn {
    font-size: 11px;
    padding: 0.2rem 0.5rem;
    margin-left: 0.25rem;
  }

  .fit-btn.active {
    background: var(--primary);
    color: #fff;
    border-color: var(--primary);
  }

  .actions {
    display: flex;
    gap: 0.25rem;
  }

  .content {
    flex: 1;
    min-height: 0; /* allow flex child to shrink below content size */
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .svg-scroll {
    flex: 1;
    min-height: 0; /* critical: lets overflow-y: auto actually scroll */
    overflow-y: auto;
    overflow-x: auto;
    background: var(--bg-2);
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.5rem;
    transition: opacity 0.15s ease;
  }

  .svg-scroll.stale {
    opacity: 0.45;
  }

  .svg-page {
    /* Transparent so the grey container shows through any inter-page gaps
       in the SVG (Typst puts a small gap between pages). */
    background: transparent;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.22);
    border-radius: 2px;
    overflow: visible;
    line-height: 0;
  }

  .svg-page :global(svg) {
    display: block;
  }

  .status {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    flex: 1;
    color: var(--text-2);
  }

  .status.column {
    flex-direction: column;
    gap: 0.75rem;
    padding: 2rem;
    align-items: flex-start;
    justify-content: flex-start;
  }

  .muted { font-size: 13px; }

  .error-title {
    font-weight: 600;
    color: var(--danger);
  }

  .error-msg {
    font-size: 11px;
    max-width: 100%;
    white-space: pre-wrap;
    word-break: break-all;
    color: var(--text-2);
  }

  .source {
    padding: 1rem;
    font-size: 11px;
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-word;
    color: var(--text);
    overflow-y: auto;
    flex: 1;
    min-height: 0;
  }

  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid var(--border);
    border-top-color: var(--primary);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
