<!--
  Compiles Typst source to SVG in-browser and renders it directly in the DOM.
  Pages are shown with a drop shadow, dimmed during recompile.
  Default zoom mode is "fit to width" — scales dynamically with the container.
-->
<script lang="ts">
  import { compileSvg, compile } from '../lib/typst/compiler';
  import { zipSync } from 'fflate';

  interface Props {
    source: string;
    testOnlySource?: string;
    answerKeySource?: string | null;
    combinedSource?: string;
  }

  let { source, testOnlySource, answerKeySource = null, combinedSource }: Props = $props();

  // ── Result state ─────────────────────────────────────────────────────────
  // Kept separate from compile-in-progress so the $effect never reads state
  // variables as dependencies (avoids infinite re-run loops).
  let svgResult  = $state<string | null>(null);
  let errorMsg   = $state<string | null>(null);
  let compiling  = $state(false);
  let showSource = $state(false);

  // ── Dark mode ─────────────────────────────────────────────────────────────
  function checkDark(): boolean {
    const t = document.documentElement.getAttribute('data-theme');
    return t === 'dark' || (t !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }
  let isDark = $state(checkDark());
  let darkUserSet = $state(false);

  $effect(() => {
    const obs = new MutationObserver(() => { if (!darkUserSet) isDark = checkDark(); });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  });

  function toggleDark() { darkUserSet = true; isDark = !isDark; }

  let effectiveSource = $derived(isDark
    ? `#set page(fill: rgb("#1c1c1e"))\n#set text(fill: rgb("#f0f0f0"))\n${source}`
    : source);

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
  function injectPageBreaks(svg: string, src: string, dark: boolean): string {
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

    // Page backgrounds injected right after <svg> (behind content).
    const pageFill = dark ? '#1c1c1e' : 'white';
    let bgRects = '';
    for (let i = 0; i < numPages; i++) {
      const y = i * (pageH + gapUnit);
      bgRects += `<rect x="0" y="${y.toFixed(2)}" width="${vbW}" height="${pageH.toFixed(2)}" fill="${pageFill}"/>`;
    }

    // Separator bars injected before </svg> (on top of content) so Typst's
    // own page fill rectangles can't cover them.
    const barFill  = dark ? '#6e6e73' : '#888';
    const barAlpha = dark ? '0.85' : '0.7';
    let barRects = '';
    for (let i = 1; i < numPages; i++) {
      const y = i * pageH + (i - 1) * gapUnit + barY0;
      barRects += `<rect x="0" y="${y.toFixed(2)}" width="${vbW}" height="${barH.toFixed(2)}" fill="${barFill}" opacity="${barAlpha}"/>`;
    }

    return svg
      .replace(/(<svg[^>]*>)/, `$1${bgRects}`)
      .replace(/<\/svg>/, `${barRects}</svg>`);
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
    const src  = effectiveSource; // reacts to source + isDark
    const dark = isDark;

    if (debounceTimer) clearTimeout(debounceTimer);
    compiling = true;

    debounceTimer = setTimeout(async () => {
      lastSource = src;
      const result = await compileSvg(src);

      if (src !== lastSource) return;

      compiling = false;
      if (result.svg) {
        svgResult = injectPageBreaks(result.svg, src, dark);
        errorMsg  = null;
      } else {
        errorMsg  = result.error ?? 'Unknown error';
        svgResult = null;
      }
    }, 800);
  });

  let busy        = $state(false);
  let dropdownOpen = $state(false);
  let dropdownEl   = $state<HTMLDivElement | null>(null);

  function onWindowClick(e: MouseEvent) {
    if (dropdownEl && !dropdownEl.contains(e.target as Node)) dropdownOpen = false;
  }

  function triggerDownload(url: string, filename: string) {
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function downloadTyp() {
    const blob = new Blob([source], { type: 'text/plain' });
    triggerDownload(URL.createObjectURL(blob), 'test.typ');
    dropdownOpen = false;
  }

  async function downloadTestPdf() {
    dropdownOpen = false;
    busy = true;
    const result = await compile(testOnlySource ?? source);
    busy = false;
    if (result.pdfUrl) triggerDownload(result.pdfUrl, 'test.pdf');
  }

  async function downloadAnswerKeyPdf() {
    if (!answerKeySource) return;
    dropdownOpen = false;
    busy = true;
    const result = await compile(answerKeySource);
    busy = false;
    if (result.pdfUrl) triggerDownload(result.pdfUrl, 'answer-key.pdf');
  }

  async function downloadCombinedPdf() {
    dropdownOpen = false;
    busy = true;
    const result = await compile(combinedSource ?? source);
    busy = false;
    if (result.pdfUrl) triggerDownload(result.pdfUrl, 'test-with-answers.pdf');
  }

  async function downloadAll() {
    dropdownOpen = false;
    busy = true;
    const sources: [string, string][] = [
      ['test.pdf', testOnlySource ?? source],
      ...(answerKeySource ? [['answer-key.pdf', answerKeySource] as [string, string]] : []),
    ];
    const pdfs = await Promise.all(sources.map(([, src]) => compile(src)));
    busy = false;
    const files: Record<string, Uint8Array> = {};
    const typBytes = new TextEncoder().encode(source);
    files['test.typ'] = typBytes;
    for (let i = 0; i < sources.length; i++) {
      const url = pdfs[i].pdfUrl;
      if (!url) continue;
      const res = await fetch(url);
      files[sources[i][0]] = new Uint8Array(await res.arrayBuffer());
      URL.revokeObjectURL(url);
    }
    const blob = new Blob([zipSync(files)], { type: 'application/zip' });
    triggerDownload(URL.createObjectURL(blob), 'test.zip');
  }

  async function printPdf() {
    busy = true;
    const result = await compile(testOnlySource ?? source);
    busy = false;
    if (!result.pdfUrl) return;
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;inset:0;width:0;height:0;opacity:0;';
    iframe.src = result.pdfUrl;
    document.body.appendChild(iframe);
    iframe.onload = () => {
      iframe.contentWindow?.print();
      setTimeout(() => { document.body.removeChild(iframe); URL.revokeObjectURL(result.pdfUrl!); }, 60000);
    };
  }

  let displayPct   = $derived(Math.round(effectiveZoom * 100));
</script>

<svelte:window onclick={onWindowClick} />

<div class="preview">
  <div class="toolbar">
    <div class="tb-left">
      <button class="ghost" onclick={() => (showSource = !showSource)}>
        {showSource ? 'Preview' : 'Source'}
      </button>
      <button class="ghost icon-btn" onclick={toggleDark} title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}>
        {isDark ? '☀' : '☾'}
      </button>
    </div>
    <div class="tb-center">
      {#if !showSource}
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
      {/if}
    </div>
    <div class="tb-right">
      <div class="dropdown" bind:this={dropdownEl}>
        <button class="ghost dropdown-trigger" onclick={() => dropdownOpen = !dropdownOpen} disabled={busy || !svgResult}>
          {busy ? 'Compiling…' : 'Export'} ▾
        </button>
        {#if dropdownOpen}
          <div class="dropdown-menu">
            <button onclick={downloadTestPdf}>Test PDF</button>
            {#if answerKeySource}
              <button onclick={downloadAnswerKeyPdf}>Answer Key PDF</button>
              <button onclick={downloadCombinedPdf}>Test + Answer Key PDF</button>
            {/if}
            <div class="dropdown-divider"></div>
            <button onclick={downloadAll}>Everything (.zip)</button>
            <button onclick={downloadTyp}>Typst Source (.typ)</button>
            <div class="dropdown-divider"></div>
            <button onclick={printPdf} disabled={busy || !svgResult}>Print</button>
          </div>
        {/if}
      </div>
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
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    padding: 0.4rem 0.75rem;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .tb-left { display: flex; align-items: center; gap: 0.25rem; }
  .tb-center { display: flex; align-items: center; justify-content: center; }
  .tb-right { display: flex; align-items: center; justify-content: flex-end; }

  .icon-btn {
    font-size: 14px;
    padding: 0.2rem 0.45rem;
  }

  .zoom-controls {
    display: flex;
    align-items: center;
    gap: 0;
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

  .dropdown {
    position: relative;
  }

  .dropdown-menu {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: 0 4px 16px rgba(0,0,0,0.15);
    min-width: 200px;
    z-index: 100;
    display: flex;
    flex-direction: column;
    padding: 4px;
    gap: 1px;
  }

  .dropdown-menu button {
    text-align: left;
    font-size: 13px;
    padding: 6px 10px;
    border-radius: 4px;
    background: none;
    border: none;
    color: var(--text);
    cursor: pointer;
    width: 100%;
  }

  .dropdown-menu button:hover { background: var(--bg-2); }

  .dropdown-divider {
    height: 1px;
    background: var(--border);
    margin: 3px 0;
  }
</style>
