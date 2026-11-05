<script lang="ts">
  import { displayMode, type DisplayModeQuestion, type DisplayModeRequest } from '../lib/display-mode.svelte';
  import { displayQuestionSource, hasDisplayAnswer } from '../lib/display-question';
  import { cancelPreview, compileSvg, previewConsumer } from '../lib/typst/compiler';

  const consumer = previewConsumer('question-display');
  const DISPLAY_THEMES = {
    light: { bg: '#ffffff', text: '#111111', surface: '#f4f4f5', border: '#d4d4d8', bgTypst: 'ffffff', textTypst: '111111' },
    dark: { bg: '#111111', text: '#f8f8f8', surface: '#202020', border: '#454545', bgTypst: '111111', textTypst: 'f8f8f8' },
  } as const;
  let session = 0;

  function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
  }

  function icon(name: 'previous' | 'next' | 'minus' | 'plus' | 'theme' | 'answer' | 'fullscreen' | 'close'): string {
    const paths = {
      previous: '<path d="m15 18-6-6 6-6"/>',
      next: '<path d="m9 18 6-6-6-6"/>',
      minus: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4M8 11h6"/>',
      plus: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4M8 11h6M11 8v6"/>',
      theme: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 0 0 16Z"/>',
      answer: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/>',
      fullscreen: '<path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/>',
      close: '<path d="m6 6 12 12M18 6 6 18"/>',
    };
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
  }

  function writeShell(popup: Window, request: DisplayModeRequest): void {
    const colors = DISPLAY_THEMES.light;
    const title = escapeHtml(request.title ?? 'Question display');
    const doc = popup.document;
    doc.open();
    doc.write(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>
      :root{color-scheme:light;--bg:${colors.bg};--text:${colors.text};--surface:${colors.surface};--border:${colors.border};--accent:#2563eb}
      *{box-sizing:border-box}html,body{margin:0;min-height:100%;background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,"Segoe UI",sans-serif}body{display:flex;flex-direction:column;min-height:100vh}
      .toolbar{position:sticky;top:0;z-index:5;display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;gap:12px;padding:10px 14px;border-bottom:1px solid var(--border);background:color-mix(in srgb,var(--surface) 94%,transparent);backdrop-filter:blur(12px)}
      .title{min-width:0;font-size:14px;font-weight:650;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.controls{display:flex;align-items:center;gap:6px}.controls.end{justify-content:flex-end}
      button{width:38px;height:38px;padding:0;display:inline-flex;align-items:center;justify-content:center;border:1px solid transparent;border-radius:7px;background:transparent;color:inherit;cursor:pointer}button:hover:not(:disabled){background:color-mix(in srgb,var(--accent) 12%,transparent);border-color:var(--border)}button:focus-visible{outline:3px solid var(--accent);outline-offset:1px}button:disabled{opacity:.3;cursor:default}button[aria-pressed=true]{color:var(--accent);background:color-mix(in srgb,var(--accent) 14%,transparent)}button svg{width:21px;height:21px}
      button.title{width:max-content;max-width:100%;height:auto;justify-content:flex-start;padding:5px 7px;margin:-5px -7px;border-radius:6px;text-align:left}
      .counter,.zoom{font-size:13px;font-variant-numeric:tabular-nums;color:color-mix(in srgb,var(--text) 68%,transparent);white-space:nowrap}.zoom{min-width:48px;text-align:center}
      main{flex:1;display:flex;justify-content:center;padding:100px 100px 60px;overflow:auto}.question-wrap{width:100%;height:max-content}.question svg{display:block;width:100%;height:auto}.status{margin:auto;color:color-mix(in srgb,var(--text) 65%,transparent);font-size:15px}.status.error{max-width:680px;white-space:pre-wrap;color:#d14343}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
      @media(max-width:900px){main{padding:56px 32px 40px}}
      @media(max-width:680px){.toolbar{grid-template-columns:1fr auto}.title{grid-column:1/-1}.controls.end{grid-column:2}.toolbar>.controls:not(.end){grid-column:1;grid-row:2}.counter{display:none}main{padding:28px 16px 24px}}
    </style></head><body><header class="toolbar"><button class="title" data-action="origin" aria-label="Return to ${title}" title="Return to this question in ${title}">${title}</button><div class="controls">
      <button data-action="previous" aria-label="Previous question" title="Previous question (Left arrow)">${icon('previous')}</button><span class="counter" aria-live="polite"></span><button data-action="next" aria-label="Next question" title="Next question (Right arrow)">${icon('next')}</button>
    </div><div class="controls end"><button data-action="zoom-out" aria-label="Zoom out" title="Zoom out">${icon('minus')}</button><span class="zoom" aria-live="polite">100%</span><button data-action="zoom-in" aria-label="Zoom in" title="Zoom in">${icon('plus')}</button><button data-action="theme" aria-label="Use dark theme" title="Use dark theme" aria-pressed="false">${icon('theme')}</button><button data-action="answer" aria-label="Show answer" title="Show answer" aria-pressed="false">${icon('answer')}</button><button data-action="fullscreen" aria-label="Enter fullscreen" title="Enter fullscreen">${icon('fullscreen')}</button><button data-action="close" aria-label="Close display window" title="Close display window">${icon('close')}</button></div></header>
      <main><div class="question-wrap"><div class="status" role="status">Rendering question…</div><div class="question"></div></div></main><div class="sr-only" aria-live="assertive" data-announcer></div></body></html>`);
    doc.close();
  }

  function startSession(popup: Window, request: DisplayModeRequest, token: number): () => void {
    writeShell(popup, request);
    const doc = popup.document;
    let index = Math.max(0, request.questions.findIndex(question => question.id === request.initialId));
    let showAnswer = false;
    let darkTheme = false;
    const zoomLevels = [0.7, 0.85, 1, 1.15, 1.35, 1.6, 2];
    let zoomIndex = 2;
    let renderToken = 0;
    const cache = new Map<string, string>();

    const element = <T extends Element>(selector: string) => doc.querySelector<T>(selector)!;
    const action = (name: string) => element<HTMLButtonElement>(`[data-action="${name}"]`);

    function updateControls(question: DisplayModeQuestion): void {
      action('previous').disabled = index === 0;
      action('next').disabled = index === request.questions.length - 1;
      action('answer').disabled = !hasDisplayAnswer(question);
      action('answer').setAttribute('aria-pressed', String(showAnswer));
      action('answer').setAttribute('aria-label', showAnswer ? 'Hide answer' : 'Show answer');
      action('answer').title = showAnswer ? 'Hide answer' : 'Show answer';
      element<HTMLElement>('.counter').textContent = `${index + 1} / ${request.questions.length}`;
      element<HTMLElement>('.zoom').textContent = `${Math.round(zoomLevels[zoomIndex] * 100)}%`;
      action('zoom-out').disabled = zoomIndex === 0;
      action('zoom-in').disabled = zoomIndex === zoomLevels.length - 1;
      action('theme').setAttribute('aria-pressed', String(darkTheme));
      action('theme').setAttribute('aria-label', darkTheme ? 'Use light theme' : 'Use dark theme');
      action('theme').title = darkTheme ? 'Use light theme' : 'Use dark theme';
    }

    async function render(): Promise<void> {
      const question = request.questions[index];
      if (!question || popup.closed || token !== session) return;
      const currentRender = ++renderToken;
      const narrative = request.narrativeFor?.(question) ?? question.narrative ?? '';
      updateControls(question);
      const key = `${question.id}:${showAnswer}:${zoomLevels[zoomIndex]}:${darkTheme}`;
      const questionEl = element<HTMLElement>('.question');
      const statusEl = element<HTMLElement>('.status');
      const cached = cache.get(key);
      if (cached) {
        questionEl.innerHTML = cached;
        questionEl.hidden = false;
        statusEl.hidden = true;
        return;
      }
      questionEl.hidden = true;
      statusEl.hidden = false;
      statusEl.className = 'status';
      statusEl.textContent = 'Rendering question…';
      const colors = darkTheme ? DISPLAY_THEMES.dark : DISPLAY_THEMES.light;
      try {
        const images = await request.imagesFor?.(question) ?? [];
        if (currentRender !== renderToken || token !== session) return;
        const result = await compileSvg(displayQuestionSource(question, narrative, showAnswer, colors, 18 * zoomLevels[zoomIndex]), { consumer, images, priority: 'interactive' });
        if (currentRender !== renderToken || token !== session || result.cancelled || popup.closed) return;
        if (!result.svg) throw new Error(result.error ?? 'This question could not be rendered.');
        cache.set(key, result.svg);
        questionEl.innerHTML = result.svg;
        questionEl.hidden = false;
        statusEl.hidden = true;
        popup.document.title = `${index + 1} / ${request.questions.length} · ${request.title ?? 'Question display'}`;
      } catch (error) {
        if (currentRender !== renderToken || token !== session || popup.closed) return;
        statusEl.className = 'status error';
        statusEl.textContent = error instanceof Error ? error.message : String(error);
      }
    }

    function move(delta: number): void {
      const next = Math.max(0, Math.min(request.questions.length - 1, index + delta));
      if (next === index) return;
      index = next;
      showAnswer = false;
      void render();
    }
    function adjustZoom(delta: number): void {
      const next = Math.max(0, Math.min(zoomLevels.length - 1, zoomIndex + delta));
      if (next === zoomIndex) return;
      zoomIndex = next;
      void render();
    }
    function toggleTheme(): void {
      darkTheme = !darkTheme;
      const colors = darkTheme ? DISPLAY_THEMES.dark : DISPLAY_THEMES.light;
      doc.documentElement.style.colorScheme = darkTheme ? 'dark' : 'light';
      doc.documentElement.style.setProperty('--bg', colors.bg);
      doc.documentElement.style.setProperty('--text', colors.text);
      doc.documentElement.style.setProperty('--surface', colors.surface);
      doc.documentElement.style.setProperty('--border', colors.border);
      void render();
    }
    async function toggleFullscreen(): Promise<void> {
      try {
        if (doc.fullscreenElement) await doc.exitFullscreen();
        else await doc.documentElement.requestFullscreen();
      } catch {
        element<HTMLElement>('[data-announcer]').textContent = 'Fullscreen is not available in this browser window.';
      }
    }
    function onClick(event: Event): void {
      const button = (event.target as Element).closest<HTMLButtonElement>('[data-action]');
      if (!button || button.disabled) return;
      switch (button.dataset.action) {
        case 'previous': move(-1); break;
        case 'next': move(1); break;
        case 'zoom-out': adjustZoom(-1); break;
        case 'zoom-in': adjustZoom(1); break;
        case 'theme': toggleTheme(); break;
        case 'answer': showAnswer = !showAnswer; void render(); break;
        case 'origin':
          window.focus();
          void request.onLocate?.(request.questions[index]);
          break;
        case 'fullscreen': void toggleFullscreen(); break;
        case 'close': popup.close(); break;
      }
    }
    function onKeydown(event: KeyboardEvent): void {
      if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1); }
      else if (event.key === 'ArrowRight') { event.preventDefault(); move(1); }
      else if (event.key === '+' || event.key === '=') { event.preventDefault(); adjustZoom(1); }
      else if (event.key === '-') { event.preventDefault(); adjustZoom(-1); }
      else if (event.key.toLowerCase() === 'a') { event.preventDefault(); if (!action('answer').disabled) { showAnswer = !showAnswer; void render(); } }
    }
    function onFullscreenChange(): void {
      const active = Boolean(doc.fullscreenElement);
      action('fullscreen').setAttribute('aria-label', active ? 'Exit fullscreen' : 'Enter fullscreen');
      action('fullscreen').title = active ? 'Exit fullscreen' : 'Enter fullscreen';
    }
    doc.addEventListener('click', onClick);
    doc.addEventListener('keydown', onKeydown);
    doc.addEventListener('fullscreenchange', onFullscreenChange);
    void render();
    return () => {
      renderToken += 1;
      cancelPreview(consumer);
      doc.removeEventListener('click', onClick);
      doc.removeEventListener('keydown', onKeydown);
      doc.removeEventListener('fullscreenchange', onFullscreenChange);
    };
  }

  $effect(() => {
    const request = displayMode.request;
    const popup = displayMode.popup;
    displayMode.revision;
    if (!request || !popup || popup.closed) return;
    const token = ++session;
    return startSession(popup, request, token);
  });

  $effect(() => () => cancelPreview(consumer));
</script>
