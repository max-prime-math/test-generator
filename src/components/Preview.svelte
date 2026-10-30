<!--
  Compiles Typst source to SVG in-browser and renders it directly in the DOM.
  Pages are shown with a drop shadow, dimmed during recompile.
  Default zoom mode is "fit to width" — scales dynamically with the container.
-->
<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import { imageStore } from '../lib/image-store.svelte';
  import { cancelPreview, compileSvg, compile, ensureInitialized, previewConsumer } from '../lib/typst/compiler';
  import { scanImageRefs } from '../lib/typst/image-shadow';
  import { perf } from '../lib/perf-diagnostics';
  import { zipSync } from 'fflate';
  import { getThemeColors } from '../lib/theme-colors';
  import {
    classSetPrintPlan,
    versionLabel,
    type ClassSetOrder,
    type ClassSetPrintRequest,
  } from '../lib/class-set-print';

  const CLASS_SET_PREFERENCES_KEY = 'tg-class-set-print-preferences-v1';
  interface ClassSetPreferences { order: ClassSetOrder; showVersionLabel: boolean }

  function loadClassSetPreferences(): ClassSetPreferences {
    try {
      const stored = JSON.parse(localStorage.getItem(CLASS_SET_PREFERENCES_KEY) ?? 'null');
      return {
        order: stored?.order === 'grouped' ? 'grouped' : 'alternating',
        showVersionLabel: stored?.showVersionLabel !== false,
      };
    } catch { return { order: 'alternating', showVersionLabel: true }; }
  }

  function saveClassSetPreferences(preferences: ClassSetPreferences) {
    try { localStorage.setItem(CLASS_SET_PREFERENCES_KEY, JSON.stringify(preferences)); } catch { /* Printing still works when storage is unavailable. */ }
  }

  const initialClassSetPreferences = loadClassSetPreferences();

  interface PrintSectionOption {
    id: string;
    name: string;
    studentCount: number;
    recommended?: boolean;
  }

  interface Props {
    source: string;
    active?: boolean;
    testOnlySource?: string;
    answerKeySource?: string | null;
    combinedSource?: string;
    /** Builds the answer key for export once the test's pages are known; falls back to `answerKeySource`. */
    resolveAnswerKey?: () => Promise<string | null>;
    /** Builds a single PDF containing a paper per student followed by one key per version. */
    resolveClassSet?: (request: ClassSetPrintRequest) => Promise<string | null>;
    printSections?: PrintSectionOption[];
    classSetMcqCount?: number;
    /** Base name for downloaded files, e.g. "AP Calculus - Test 1". */
    fileName?: string;
    paper?: string;
    orientation?: 'portrait' | 'landscape';
    onAdjustLayout?: () => void;
  }

  let {
    source,
    active = true,
    testOnlySource,
    answerKeySource = null,
    combinedSource,
    resolveAnswerKey,
    resolveClassSet,
    printSections = [],
    classSetMcqCount = 0,
    fileName = 'Test',
    paper = 'us-letter',
    orientation = 'portrait',
    onAdjustLayout,
  }: Props = $props();

  // ── Result state ─────────────────────────────────────────────────────────
  // Kept separate from compile-in-progress so the $effect never reads state
  // variables as dependencies (avoids infinite re-run loops).
  let svgResult  = $state<string | null>(null);
  let errorMsg   = $state<string | null>(null);
  let compiling  = $state(false);
  let showSource    = $state(false);
  let printPreview  = $state(false);
  let copyFeedback  = $state(false);
  let copyTimer: ReturnType<typeof setTimeout> | null = null;

  async function copySource() {
    try {
      await navigator.clipboard.writeText(source);
      copyFeedback = true;
      if (copyTimer) clearTimeout(copyTimer);
      copyTimer = setTimeout(() => {
        copyFeedback = false;
      }, 2000);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  }

  // ── Theme tracking ───────────────────────────────────────────────────────────
  let currentTheme = $state(document.documentElement.getAttribute('data-theme') ?? 'auto');
  let prefersDark = $state(window.matchMedia('(prefers-color-scheme: dark)').matches);

  $effect(() => {
    const themeObs = new MutationObserver(() => {
      currentTheme = document.documentElement.getAttribute('data-theme') ?? 'auto';
    });
    themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => themeObs.disconnect();
  });

  $effect(() => {
    const darkModeObs = window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      prefersDark = e.matches;
    });
    // Clean up is implicit in Svelte 5
  });

  let effectiveSource = $derived.by(() => {
    if (printPreview) {
      return `#set page(fill: rgb("ffffff"))\n#set text(fill: rgb("000000"))\n${source}`;
    }
    const colors = getThemeColors(currentTheme, prefersDark);
    return `#set page(fill: rgb("${colors.bgTypst}"))\n#set text(fill: rgb("${colors.textTypst}"))\n${source}`;
  });
  let imageRevision = $derived(imageStore.revisionOf(scanImageRefs(effectiveSource)));

  // ── Zoom ─────────────────────────────────────────────────────────────────
  let fitMode    = $state(true);
  let manualZoom = $state(1.0);
  let fitZoom    = $state(1.0);

  const ZOOM_STEP = 0.25;
  const ZOOM_MIN  = 0.25;
  const ZOOM_MAX  = 3.0;
  const PADDING   = 48; // 2 × 1.5rem padding in .svg-scroll
  const PAPER_HEIGHTS_PT: Record<string, number> = {
    'us-letter': 11 * 72,
    'us-legal': 14 * 72,
    'us-ledger': 17 * 72,
    'a3': 1190.55,
    'a4': 841.89,
    'a5': 595.28,
    'b4': 1000.63,
    'b5': 708.66,
  };

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
  function injectPageBreaks(svg: string, src: string, bgColor: string, dark: boolean): string {
    // Determine page height in SVG user units (pt).
    const paperMatch = src.match(/paper:\s*"([^"]+)"/);
    const paper = paperMatch?.[1] ?? 'us-letter';
    const pageH = PAPER_HEIGHTS_PT[paper] ?? PAPER_HEIGHTS_PT['us-letter'];

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
    const pageFill = bgColor;
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
  const previewConsumerId = previewConsumer('build-document');
  let initialized = false;
  $effect(() => {
    if (!active || initialized) return;
    initialized = true;
    void ensureInitialized().catch(() => { initialized = false; });
  });

  let isDark = $derived(currentTheme !== 'auto'
    ? currentTheme.includes('dark') || currentTheme.includes('mocha') || currentTheme.includes('frappe') || currentTheme === 'dracula' || currentTheme === 'nord' || currentTheme === 'one-dark'
    : prefersDark);

  $effect(() => {
    if (!active) return;
    const src = effectiveSource;
    // Unrelated image uploads should not recompile the entire test.
    imageRevision;
    const pp = printPreview;
    const dark = isDark;
    const colors = getThemeColors(currentTheme, prefersDark);
    let cancelled = false;
    compiling = true;
    const done = perf.start('Build: edit to preview');

    const timer = setTimeout(async () => {
      const result = await compileSvg(src, { consumer: previewConsumerId });
      if (cancelled || result.cancelled) return;
      compiling = false;
      if (result.svg) {
        const bgColor = pp ? '#ffffff' : colors.bg;
        const darkMode = pp ? false : dark;
        svgResult = injectPageBreaks(result.svg, src, bgColor, darkMode);
        errorMsg = null;
        requestAnimationFrame(() => { if (!cancelled) done(); });
      } else {
        errorMsg = result.error ?? 'Unknown error';
      }
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      cancelPreview(previewConsumerId);
    };
  });

  let busy        = $state(false);
  let dropdownOpen = $state(false);
  let dropdownEl   = $state<HTMLDivElement | null>(null);
  type PrintOutput = 'test' | 'answer' | 'combined' | 'class-set';
  type CachedPrintPdf = { key: string; url: string; pages: number | null };
  const printCache = new Map<PrintOutput, CachedPrintPdf>();
  let printCacheRevision = $state(0);
  let printDialogOpen = $state(false);
  let printDialogEl = $state<HTMLDialogElement | null>(null);
  let printOutput = $state<PrintOutput>('test');
  let preparingPrint = $state<PrintOutput | null>(null);
  let openingPrint = $state(false);
  let printError = $state('');
  let printOpener: HTMLElement | null = null;
  let classSetTarget = $state('__custom__');
  let customClassSetCopies = $state(30);
  let classSetCopyAdjustment = $state(0);
  let classSetVersions = $state(2);
  let classSetOrder = $state<ClassSetOrder>(initialClassSetPreferences.order);
  let classSetShowVersionLabel = $state(initialClassSetPreferences.showVersionLabel);
  let classSetPrepareTimer: ReturnType<typeof setTimeout> | null = null;

  let selectedPrintSection = $derived(printSections.find(section => section.id === classSetTarget) ?? null);
  let classSetCopies = $derived(classSetTarget === '__custom__'
    ? Math.max(1, Math.min(500, Math.round(customClassSetCopies) || 1))
    : Math.max(1, Math.min(500, (selectedPrintSection?.studentCount ?? 0) + classSetCopyAdjustment)));
  let classSetCopyNote = $derived.by(() => {
    if (!selectedPrintSection) return 'Set the total number of papers.';
    const roster = `${selectedPrintSection.studentCount} active ${selectedPrintSection.studentCount === 1 ? 'student' : 'students'}`;
    if (classSetCopyAdjustment > 0) return `${roster} + ${classSetCopyAdjustment} extra ${classSetCopyAdjustment === 1 ? 'copy' : 'copies'}`;
    if (classSetCopyAdjustment < 0) return `${roster} − ${Math.abs(classSetCopyAdjustment)} for ${Math.abs(classSetCopyAdjustment) === 1 ? 'an absence' : 'absences'}`;
    return roster;
  });
  let classVersionMaximum = $derived(Math.max(1, Math.min(26, classSetCopies)));
  let currentClassSetPlan = $derived(classSetPrintPlan({
    copies: Math.max(1, classSetCopies),
    versions: classSetMcqCount ? Math.min(classSetVersions, classVersionMaximum) : 1,
    order: classSetOrder,
  }));

  const PAPER_LABELS: Record<string, string> = {
    'us-letter': 'US Letter', 'us-legal': 'US Legal', 'us-ledger': 'US Ledger / Tabloid',
    a3: 'A3', a4: 'A4', a5: 'A5', b4: 'B4', b5: 'B5',
  };

  function rawPrintSource(kind: PrintOutput): string | null {
    if (kind === 'test') return testOnlySource ?? source;
    if (kind === 'answer') return answerKeySource;
    if (kind === 'combined') return answerKeySource ? combinedSource ?? source : null;
    return null;
  }

  /** Pictures are part of the cache identity so replacing a file never prints an old copy. */
  function printCacheKey(kind: PrintOutput): string | null {
    const raw = kind === 'class-set'
      ? resolveClassSet && classSetCopies > 0
        ? `${testOnlySource ?? source}\u0000${answerKeySource ?? ''}\u0000${JSON.stringify(currentClassSetPlan)}\u0000${classSetShowVersionLabel}`
        : null
      : rawPrintSource(kind);
    if (!raw) return null;
    return `${imageStore.revisionOf(scanImageRefs(raw))}\u0000${raw}`;
  }

  function cachedPrintPdf(kind: PrintOutput): CachedPrintPdf | null {
    printCacheRevision;
    const entry = printCache.get(kind);
    return entry && entry.key === printCacheKey(kind) ? entry : null;
  }

  let selectedPrintPdf = $derived(cachedPrintPdf(printOutput));
  let printPaper = $derived(`${PAPER_LABELS[paper] ?? paper} · ${orientation === 'landscape' ? 'Landscape' : 'Portrait'}`);

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
    triggerDownload(URL.createObjectURL(blob), `${fileName}.typ`);
    dropdownOpen = false;
  }

  async function downloadTestPdf() {
    dropdownOpen = false;
    busy = true;
    const result = await compile(testOnlySource ?? source);
    busy = false;
    if (result.pdfUrl) triggerDownload(result.pdfUrl, `${fileName}.pdf`);
  }

  async function exportAnswerKeySource(): Promise<string | null> {
    if (!answerKeySource) return null;
    try { return (await resolveAnswerKey?.()) ?? answerKeySource; } catch { return answerKeySource; }
  }

  async function downloadAnswerKeyPdf() {
    if (!answerKeySource) return;
    dropdownOpen = false;
    busy = true;
    const keySource = await exportAnswerKeySource();
    const result = await compile(keySource ?? answerKeySource);
    busy = false;
    if (result.pdfUrl) triggerDownload(result.pdfUrl, `${fileName} - Answer Key.pdf`);
  }

  async function downloadCombinedPdf() {
    dropdownOpen = false;
    busy = true;
    const result = await compile(combinedSource ?? source);
    busy = false;
    if (result.pdfUrl) triggerDownload(result.pdfUrl, `${fileName} - With Answers.pdf`);
  }

  async function downloadAll() {
    dropdownOpen = false;
    busy = true;
    const keySource = await exportAnswerKeySource();
    const sources: [string, string][] = [
      [`${fileName}.pdf`, testOnlySource ?? source],
      ...(keySource ? [[`${fileName} - Answer Key.pdf`, keySource] as [string, string]] : []),
    ];
    const pdfs = await Promise.all(sources.map(([, src]) => compile(src)));
    busy = false;
    const files: Record<string, Uint8Array> = {};
    const typBytes = new TextEncoder().encode(source);
    files[`${fileName}.typ`] = typBytes;
    for (let i = 0; i < sources.length; i++) {
      const url = pdfs[i].pdfUrl;
      if (!url) continue;
      const res = await fetch(url);
      files[sources[i][0]] = new Uint8Array(await res.arrayBuffer());
      URL.revokeObjectURL(url);
    }
    const zipBytes = zipSync(files);
    const blob = new Blob([zipBytes.buffer as ArrayBuffer], { type: 'application/zip' });
    triggerDownload(URL.createObjectURL(blob), `${fileName}.zip`);
  }

  async function resolvedPrintSource(kind: PrintOutput): Promise<string | null> {
    if (kind === 'answer') return exportAnswerKeySource();
    if (kind === 'class-set') return resolveClassSet?.({
      copies: currentClassSetPlan.copies,
      versions: currentClassSetPlan.versions,
      order: currentClassSetPlan.order,
      showVersionLabel: classSetShowVersionLabel,
    }) ?? null;
    return rawPrintSource(kind);
  }

  /** Typst PDFs expose one `/Type /Page` object per page. Unknown is safer than a false count. */
  async function pdfPageCount(url: string): Promise<number | null> {
    try {
      const bytes = await (await fetch(url)).arrayBuffer();
      const count = new TextDecoder('latin1').decode(bytes).match(/\/Type\s*\/Page\b/g)?.length ?? 0;
      return count || null;
    } catch { return null; }
  }

  async function preparePrintOutput(kind: PrintOutput): Promise<CachedPrintPdf | null> {
    const key = printCacheKey(kind);
    if (!key) return null;
    const cached = printCache.get(kind);
    if (cached?.key === key) return cached;
    preparingPrint = kind;
    if (printOutput === kind) printError = '';
    const resolved = await resolvedPrintSource(kind);
    if (!resolved || key !== printCacheKey(kind)) {
      if (preparingPrint === kind) preparingPrint = null;
      return null;
    }
    const result = await compile(resolved);
    if (!result.pdfUrl) {
      if (printOutput === kind && key === printCacheKey(kind)) printError = result.error ?? 'The printable PDF could not be prepared.';
      if (preparingPrint === kind) preparingPrint = null;
      return null;
    }
    if (key !== printCacheKey(kind)) {
      URL.revokeObjectURL(result.pdfUrl);
      if (preparingPrint === kind) preparingPrint = null;
      return null;
    }
    const entry = { key, url: result.pdfUrl, pages: await pdfPageCount(result.pdfUrl) };
    const previous = printCache.get(kind);
    if (previous) URL.revokeObjectURL(previous.url);
    printCache.set(kind, entry);
    printCacheRevision++;
    if (preparingPrint === kind) preparingPrint = null;
    return entry;
  }

  async function openPrintDialog() {
    if (!active || printDialogOpen) return;
    printOpener = document.activeElement as HTMLElement | null;
    printOutput = 'test';
    const initialSection = printSections.find(section => section.recommended && section.studentCount > 0)
      ?? printSections.find(section => section.studentCount > 0);
    classSetTarget = initialSection?.id ?? '__custom__';
    classSetCopyAdjustment = 0;
    classSetVersions = classSetMcqCount && (initialSection?.studentCount ?? customClassSetCopies) > 1 ? 2 : 1;
    printError = '';
    printDialogOpen = true;
    dropdownOpen = false;
    await tick();
    printDialogEl?.showModal();
    printDialogEl?.querySelector<HTMLInputElement>('input[name="print-output"]:checked')?.focus();
    void preparePrintOutput(printOutput);
  }

  function closePrintDialog() {
    if (printDialogEl?.open) printDialogEl.close();
    printDialogOpen = false;
    const opener = printOpener;
    printOpener = null;
    void tick().then(() => { if (opener?.isConnected) opener.focus(); });
  }

  function choosePrintOutput(kind: PrintOutput) {
    printOutput = kind;
    printError = '';
    void preparePrintOutput(kind);
  }

  function updateClassSetTarget(target: string) {
    classSetTarget = target;
    classSetCopyAdjustment = 0;
    classSetVersions = Math.min(classSetVersions, Math.max(1, target === '__custom__'
      ? customClassSetCopies
      : printSections.find(section => section.id === target)?.studentCount ?? 1));
    classSetChanged();
  }

  function updateClassSetCopies(value: number) {
    const copies = Math.max(1, Math.min(500, Math.round(value) || 1));
    if (classSetTarget === '__custom__') customClassSetCopies = copies;
    else classSetCopyAdjustment = copies - (selectedPrintSection?.studentCount ?? 0);
    classSetChanged();
  }

  function adjustClassSetCopies(change: number) {
    updateClassSetCopies(classSetCopies + change);
  }

  function classSetChanged() {
    classSetVersions = classSetMcqCount ? Math.max(1, Math.min(classVersionMaximum, Math.round(classSetVersions) || 1)) : 1;
    saveClassSetPreferences({ order: classSetOrder, showVersionLabel: classSetShowVersionLabel });
    printError = '';
    if (classSetPrepareTimer) clearTimeout(classSetPrepareTimer);
    if (printOutput === 'class-set') {
      classSetPrepareTimer = setTimeout(() => {
        classSetPrepareTimer = null;
        void preparePrintOutput('class-set');
      }, 200);
    }
  }

  function printPdfUrl(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const iframe = document.createElement('iframe');
      iframe.title = 'Printable test PDF';
      iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none';
      const cleanup = () => iframe.remove();
      const timeout = setTimeout(() => { cleanup(); reject(new Error('The browser print dialog did not open. Download the PDF from Export and print it from your PDF viewer.')); }, 10_000);
      iframe.onload = () => {
        clearTimeout(timeout);
        try {
          const target = iframe.contentWindow;
          if (!target) throw new Error('The printable PDF could not be opened.');
          target.addEventListener('afterprint', cleanup, { once: true });
          target.focus();
          target.print();
          resolve();
          setTimeout(() => { if (iframe.isConnected) cleanup(); }, 60_000);
        } catch (cause) {
          cleanup();
          reject(cause instanceof Error ? cause : new Error(String(cause)));
        }
      };
      iframe.src = url;
      document.body.appendChild(iframe);
    });
  }

  async function printSelectedOutput() {
    openingPrint = true;
    printError = '';
    try {
      const entry = cachedPrintPdf(printOutput) ?? await preparePrintOutput(printOutput);
      if (!entry) return;
      await printPdfUrl(entry.url);
    } catch (cause) {
      printError = cause instanceof Error ? cause.message : String(cause);
    } finally { openingPrint = false; }
  }

  function handlePrintShortcut(event: KeyboardEvent) {
    if (!active || !(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== 'p') return;
    const otherModal = document.querySelector('[aria-modal="true"]:not(.print-dialog)');
    if (otherModal) return;
    event.preventDefault();
    if (printDialogOpen) {
      if (selectedPrintPdf && !openingPrint) void printSelectedOutput();
    } else void openPrintDialog();
  }

  function adjustPrintLayout() {
    closePrintDialog();
    onAdjustLayout?.();
  }

  onDestroy(() => {
    if (classSetPrepareTimer) clearTimeout(classSetPrepareTimer);
    for (const entry of printCache.values()) URL.revokeObjectURL(entry.url);
  });

  let displayPct   = $derived(Math.round(effectiveZoom * 100));
</script>

<svelte:window onclick={onWindowClick} onkeydown={handlePrintShortcut} />

<div class="preview">
  <div class="toolbar">
    <div class="tb-left">
      <button class="ghost" onclick={() => (showSource = !showSource)} title={showSource ? 'Switch to rendered preview' : 'View raw Typst source'}>
        {showSource ? 'Preview' : 'Source'}
      </button>
      {#if showSource}
        <button class="ghost copy-btn" class:copied={copyFeedback} onclick={copySource} title={copyFeedback ? 'Copied!' : 'Copy to clipboard'}>
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="4" y="5" width="7" height="7" rx="0.5"/>
            <path d="M5 4V3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-1"/>
          </svg>
        </button>
      {/if}
      {#if !showSource}
        <button
          class="ghost print-preview-btn"
          class:active={printPreview}
          onclick={() => (printPreview = !printPreview)}
          title="Print preview — render black on white regardless of theme"
        >
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
            <rect x="2.5" y="1.5" width="9" height="12" rx="1"/>
            <line x1="4.5" y1="5" x2="10.5" y2="5"/>
            <line x1="4.5" y1="7.5" x2="10.5" y2="7.5"/>
            <line x1="4.5" y1="10" x2="8" y2="10"/>
          </svg>
        </button>
      {/if}
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
      <button class="primary print-trigger" onclick={openPrintDialog} disabled={!svgResult} title="Choose what to print (Ctrl/Cmd+P)">
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6V2h8v4M4 11H2V6h12v5h-2M4 9h8v5H4z"/></svg>
        <span>Print</span>
      </button>
      <div class="dropdown" bind:this={dropdownEl}>
        <button class="ghost dropdown-trigger" onclick={() => dropdownOpen = !dropdownOpen} disabled={busy || !svgResult} title="Download the compiled test">
          {busy ? 'Compiling…' : 'Export'} ▾
        </button>
        {#if dropdownOpen}
          <div class="dropdown-menu">
            <button onclick={downloadTestPdf} title="Download the test as a PDF (no answer key)">Test PDF</button>
            {#if answerKeySource}
              <button onclick={downloadAnswerKeyPdf} title="Download just the answer key as a PDF">Answer Key PDF</button>
              <button onclick={downloadCombinedPdf} title="Download test and answer key as a single PDF">Test + Answer Key PDF</button>
            {/if}
            <div class="dropdown-divider"></div>
            <button onclick={downloadAll} title="Download test PDF, answer key PDF, and Typst source as a .zip">Everything (.zip)</button>
            <button onclick={downloadTyp} title="Download the raw Typst markup file — open in any Typst installation">Typst Source (.typ)</button>
          </div>
        {/if}
      </div>
    </div>
  </div>

  <div class="content">
    {#if showSource}
      <pre class="source">{source}</pre>
    {:else if svgResult !== null}
      {#if errorMsg}
        <details class="preview-error" role="alert">
          <summary>Preview could not update. Showing the last successful version.</summary>
          <pre class="error-msg">{errorMsg}</pre>
        </details>
      {/if}
      <div class="svg-scroll" class:stale={compiling || !!errorMsg} aria-busy={compiling} bind:this={scrollEl}>
        <div class="svg-page" style="zoom: {effectiveZoom}">
          {@html svgResult}
        </div>
      </div>
    {:else if errorMsg !== null}
      <div class="status column">
        <p class="error-title">Compilation error</p>
        <pre class="error-msg">{errorMsg}</pre>
        <button class="ghost" onclick={() => (showSource = true)} title="View the Typst source to diagnose the compilation error">Show Typst source</button>
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

{#if printDialogOpen}
  <dialog
    class="print-dialog"
    bind:this={printDialogEl}
    aria-labelledby="print-title"
    aria-modal="true"
    oncancel={(event) => { event.preventDefault(); closePrintDialog(); }}
  >
    <header>
      <div><h2 id="print-title">Print test</h2><p>{fileName}</p></div>
      <button class="ghost close-print" onclick={closePrintDialog} aria-label="Close print settings">✕</button>
    </header>

    <fieldset>
      <legend>What do you want to print?</legend>
      <label class="print-choice" class:selected={printOutput === 'test'}>
        <input type="radio" name="print-output" value="test" checked={printOutput === 'test'} onchange={() => choosePrintOutput('test')} />
        <span><strong>Student test</strong><small>Questions only—no answers.</small></span>
      </label>
      {#if answerKeySource}
        <label class="print-choice" class:selected={printOutput === 'answer'}>
          <input type="radio" name="print-output" value="answer" checked={printOutput === 'answer'} onchange={() => choosePrintOutput('answer')} />
          <span><strong>Answer key</strong><small>Answers and worked solutions only.</small></span>
        </label>
        <label class="print-choice" class:selected={printOutput === 'combined'}>
          <input type="radio" name="print-output" value="combined" checked={printOutput === 'combined'} onchange={() => choosePrintOutput('combined')} />
          <span><strong>Test + answer key</strong><small>The student test followed by its key.</small></span>
        </label>
      {/if}
      {#if resolveClassSet}
        <label class="print-choice" class:selected={printOutput === 'class-set'}>
          <input type="radio" name="print-output" value="class-set" checked={printOutput === 'class-set'} onchange={() => choosePrintOutput('class-set')} />
          <span><strong>Class set</strong><small>{answerKeySource ? 'One paper per student, followed by one combined answer key covering every version.' : 'One paper per student in the requested version order.'}</small></span>
        </label>
      {/if}
    </fieldset>

    {#if printOutput === 'class-set'}
      <section class="class-set-settings" aria-labelledby="class-set-title">
        <div class="class-set-heading">
          <div><h3 id="class-set-title">Class set</h3><p>The PDF contains every paper explicitly. Print one copy in the browser dialog.</p></div>
        </div>
        <div class="class-set-fields">
          <label>
            <span>Class</span>
            <select value={classSetTarget} onchange={(event) => updateClassSetTarget(event.currentTarget.value)}>
              {#each printSections as section (section.id)}
                <option value={section.id} disabled={section.studentCount === 0}>{section.name} — {section.studentCount} active {section.studentCount === 1 ? 'student' : 'students'}</option>
              {/each}
              <option value="__custom__">Custom paper count</option>
            </select>
          </label>
          <div class="copy-count-field">
            <span class="field-label">Student papers</span>
            <div class="copy-stepper" role="group" aria-label="Adjust student paper count">
              <button type="button" onclick={() => adjustClassSetCopies(-1)} disabled={classSetCopies <= 1} aria-label="Remove one student paper">−</button>
              <input
                type="number"
                min="1"
                max="500"
                step="1"
                value={classSetCopies}
                aria-label="Student papers"
                onchange={(event) => updateClassSetCopies(event.currentTarget.valueAsNumber)}
              />
              <button type="button" onclick={() => adjustClassSetCopies(1)} disabled={classSetCopies >= 500} aria-label="Add one student paper">+</button>
            </div>
            <small>{classSetCopyNote}</small>
          </div>
          <label>
            <span>MCQ versions</span>
            <input type="number" min="1" max={classVersionMaximum} step="1" bind:value={classSetVersions} onchange={classSetChanged} disabled={classSetMcqCount === 0 || classSetCopies < 2} />
            <small>{classSetMcqCount ? `${classSetMcqCount} multiple-choice ${classSetMcqCount === 1 ? 'question' : 'questions'} will be scrambled independently.` : 'This test has no multiple-choice choices to scramble.'}</small>
          </label>
        </div>

        <label class="version-label-option">
          <input type="checkbox" bind:checked={classSetShowVersionLabel} onchange={classSetChanged} />
          <span><strong>Print version label on student papers</strong><small>Shows Version A, Version B, and so on. Answer lists in the key always keep their version labels.</small></span>
        </label>

        <fieldset class="paper-order" disabled={currentClassSetPlan.versions < 2}>
          <legend>Paper order</legend>
          <label><input type="radio" name="class-set-order" value="alternating" checked={classSetOrder === 'alternating'} onchange={() => { classSetOrder = 'alternating'; classSetChanged(); }} /> <span><strong>Alternate versions</strong><small>A, B, A, B…</small></span></label>
          <label><input type="radio" name="class-set-order" value="grouped" checked={classSetOrder === 'grouped'} onchange={() => { classSetOrder = 'grouped'; classSetChanged(); }} /> <span><strong>Group by version</strong><small>All A papers, then all B papers…</small></span></label>
        </fieldset>

        <div class="version-distribution" aria-live="polite">
          <strong>{currentClassSetPlan.copies} student {currentClassSetPlan.copies === 1 ? 'paper' : 'papers'}</strong>
          <span>{#each currentClassSetPlan.counts as count, index}{#if index > 0} · {/if}Version {versionLabel(index)}: {count}{/each}</span>
          <small>{answerKeySource ? `One combined answer key follows, with ${currentClassSetPlan.versions} labeled version ${currentClassSetPlan.versions === 1 ? 'list' : 'lists'}.` : 'No answer key is available for the current test.'}</small>
        </div>
      </section>
    {/if}

    <section class="print-summary" aria-live="polite">
      <div><span>Paper</span><strong>{printPaper}</strong></div>
      <div><span>Pages</span><strong>{selectedPrintPdf?.pages ?? (preparingPrint === printOutput ? 'Preparing…' : '—')}</strong></div>
      <div><span>Status</span><strong class:ready={!!selectedPrintPdf}>{selectedPrintPdf ? 'Ready to print' : preparingPrint === printOutput ? 'Preparing PDF…' : printError ? 'Needs attention' : 'Not prepared'}</strong></div>
    </section>

    {#if compiling && !errorMsg}<p class="print-note">The on-screen preview is updating. The printable PDF is prepared separately.</p>{/if}
    {#if errorMsg}<p class="print-warning">The preview could not update. Printing uses the current document and stays unavailable if its PDF cannot compile.</p>{/if}
    {#if printError}<p class="print-error" role="alert">{printError}</p>{/if}

    <p class="printer-note">{printOutput === 'class-set' ? `Choose one copy in the browser dialog—the PDF already contains ${currentClassSetPlan.copies} student papers${answerKeySource ? ' and one combined answer-key section' : ''}. Use single-sided printing unless each paper has an even page count; separator pages are not added.` : 'Your browser’s next dialog controls copies, duplex printing, colour, scaling, and printer trays.'}</p>
    <footer>
      <button class="ghost" onclick={adjustPrintLayout}>Adjust layout</button>
      <span></span>
      <button class="ghost" onclick={closePrintDialog}>Cancel</button>
      <button class="primary" onclick={printSelectedOutput} disabled={!selectedPrintPdf || openingPrint}>
        {openingPrint ? 'Opening print…' : selectedPrintPdf ? printOutput === 'class-set' ? `Print class set (${selectedPrintPdf.pages ?? 'ready'}${selectedPrintPdf.pages ? ' pages' : ''})` : `Print ${selectedPrintPdf.pages ? `${selectedPrintPdf.pages} ${selectedPrintPdf.pages === 1 ? 'page' : 'pages'}` : 'now'}` : preparingPrint === printOutput ? printOutput === 'class-set' ? 'Preparing class set…' : 'Preparing…' : 'Print'}
      </button>
    </footer>
  </dialog>
{/if}

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

  .print-preview-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.2rem 0.4rem;
    color: var(--text-2);
  }
  .print-preview-btn.active {
    background: #fff;
    color: #000;
    border: 1px solid var(--border);
  }
  :global([data-theme="light"]) .print-preview-btn.active,
  :global(:root:not([data-theme])) .print-preview-btn.active {
    background: var(--bg-3);
    color: var(--text);
  }

  .copy-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.2rem 0.4rem;
    color: var(--text-2);
    transition: color 150ms;
  }
  .copy-btn.copied {
    color: var(--primary);
  }

  .tb-center { display: flex; align-items: center; justify-content: center; }
  .tb-right { display: flex; align-items: center; justify-content: flex-end; gap: 0.35rem; }

  .print-trigger { display: inline-flex; align-items: center; gap: .35rem; padding: .3rem .6rem; font-size: 12px; }
  .print-trigger svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; }

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

  .preview-error { flex-shrink: 0; max-height: 30%; overflow: auto; padding: .65rem 1rem; border-bottom: 1px solid var(--border); color: var(--danger); font-size: 12px; }

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

  .print-dialog {
    width: min(680px, calc(100vw - 2rem));
    max-height: calc(100dvh - 2rem);
    margin: auto;
    padding: 0;
    overflow: auto;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--bg);
    color: var(--text);
    box-shadow: 0 18px 60px #0006;
  }
  .print-dialog::backdrop { background: #0009; }
  .print-dialog header { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; padding: 1rem 1.1rem; border-bottom: 1px solid var(--border); }
  .print-dialog h2 { margin: 0; font-size: 18px; }
  .print-dialog header p { margin: .25rem 0 0; color: var(--text-2); font-size: 12px; overflow-wrap: anywhere; }
  .close-print { padding: .25rem .45rem; }
  .print-dialog fieldset { display: grid; gap: .55rem; margin: 0; padding: 1rem 1.1rem; border: 0; }
  .print-dialog legend { padding: 0; font-size: 12px; font-weight: 650; }
  .print-choice { display: flex; align-items: flex-start; gap: .7rem; padding: .75rem; border: 1px solid var(--border); border-radius: 8px; cursor: pointer; }
  .print-choice:hover { background: var(--bg-2); }
  .print-choice.selected { border-color: var(--primary); background: color-mix(in srgb, var(--primary) 9%, var(--bg)); }
  .print-choice input { width: auto; flex: 0 0 auto; margin-top: .15rem; accent-color: var(--primary); }
  .print-choice span { display: grid; gap: .18rem; }
  .print-choice strong { font-size: 13px; }
  .print-choice small { color: var(--text-2); font-size: 12px; }
  .class-set-settings { display: grid; gap: .8rem; margin: 0 1.1rem 1rem; padding: .9rem; border: 1px solid var(--border); border-radius: 9px; background: var(--bg-2); }
  .class-set-heading h3 { margin: 0; font-size: 14px; }
  .class-set-heading p { margin: .2rem 0 0; color: var(--text-2); font-size: 11px; }
  .class-set-fields { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(110px, .7fr); gap: .65rem; align-items: start; }
  .class-set-fields label, .copy-count-field { display: grid; gap: .3rem; min-width: 0; font-size: 11px; font-weight: 650; }
  .class-set-fields select { width: 100%; min-width: 0; }
  .class-set-fields small { color: var(--text-2); font-size: 10px; font-weight: 400; line-height: 1.35; }
  .copy-stepper { display: grid; grid-template-columns: 30px minmax(52px, 1fr) 30px; }
  .copy-stepper button, .copy-stepper input { min-width: 0; border-radius: 0; text-align: center; }
  .copy-stepper button { padding: .25rem; font-size: 16px; line-height: 1; }
  .copy-stepper button:first-child { border-radius: 6px 0 0 6px; }
  .copy-stepper button:last-child { border-radius: 0 6px 6px 0; }
  .copy-stepper input { width: 100%; border-inline: 0; }
  .version-label-option { display: flex; align-items: flex-start; gap: .55rem; padding: .65rem .7rem; border-radius: 7px; background: var(--bg); cursor: pointer; }
  .version-label-option input { width: auto; margin-top: .12rem; accent-color: var(--primary); }
  .version-label-option span { display: grid; gap: .12rem; }
  .version-label-option strong { font-size: 11px; }
  .version-label-option small { color: var(--text-2); font-size: 10px; font-weight: 400; line-height: 1.35; }
  .paper-order { display: grid; grid-template-columns: 1fr 1fr; gap: .5rem; margin: 0; padding: 0; border: 0; }
  .paper-order legend { grid-column: 1 / -1; margin-bottom: .15rem; font-size: 11px; font-weight: 650; }
  .paper-order label { display: flex; align-items: flex-start; gap: .45rem; padding: .55rem; border: 1px solid var(--border); border-radius: 7px; cursor: pointer; background: var(--bg); }
  .paper-order label:has(input:checked) { border-color: var(--primary); background: color-mix(in srgb, var(--primary) 8%, var(--bg)); }
  .paper-order input { width: auto; margin-top: .12rem; accent-color: var(--primary); }
  .paper-order span { display: grid; gap: .1rem; }
  .paper-order strong { font-size: 11px; }
  .paper-order small { color: var(--text-2); font-size: 10px; }
  .paper-order:disabled label { cursor: default; opacity: .65; }
  .version-distribution { display: grid; grid-template-columns: auto 1fr; gap: .2rem .75rem; align-items: baseline; padding: .6rem .7rem; border-radius: 7px; background: var(--bg); font-size: 11px; }
  .version-distribution span { color: var(--text-2); text-align: right; }
  .version-distribution small { grid-column: 1 / -1; color: var(--text-2); }
  .print-summary { display: grid; grid-template-columns: 1.35fr .65fr 1fr; margin: 0 1.1rem; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
  .print-summary div { display: grid; gap: .2rem; padding: .7rem; min-width: 0; }
  .print-summary div + div { border-left: 1px solid var(--border); }
  .print-summary span { color: var(--text-2); font-size: 11px; }
  .print-summary strong { font-size: 12px; overflow-wrap: anywhere; }
  .print-summary strong.ready { color: var(--success, #2e8b57); }
  .print-note, .print-warning, .print-error, .printer-note { margin: .75rem 1.1rem 0; font-size: 12px; line-height: 1.45; }
  .print-note, .printer-note { color: var(--text-2); }
  .print-warning { color: var(--warning, #a56800); }
  .print-error { color: var(--danger); }
  .print-dialog footer { display: grid; grid-template-columns: auto 1fr auto auto; align-items: center; gap: .55rem; padding: 1rem 1.1rem; margin-top: 1rem; border-top: 1px solid var(--border); }

  @media (max-width: 700px) {
    .print-trigger span { display: none; }
    .print-trigger { padding-inline: .45rem; }
    .print-summary { grid-template-columns: 1fr; }
    .print-summary div + div { border-left: 0; border-top: 1px solid var(--border); }
    .class-set-fields, .paper-order { grid-template-columns: 1fr; }
    .version-distribution { grid-template-columns: 1fr; }
    .version-distribution span { text-align: left; }
    .print-dialog footer { grid-template-columns: 1fr 1fr; }
    .print-dialog footer span { display: none; }
    .print-dialog footer button:first-child { grid-column: 1 / -1; }
  }
</style>
