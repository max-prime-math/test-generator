<script lang="ts">
  import { untrack } from 'svelte';
  import { displayMode, type DisplayModeQuestion, type DisplayModeRequest } from '../lib/display-mode.svelte';
  import { displayQuestionSource, hasDisplayAnswer } from '../lib/display-question';
  import { cancelPreview, compileSvg, previewConsumer } from '../lib/typst/compiler';
  import { imageStore } from '../lib/image-store.svelte';
  import { scanImageRefs } from '../lib/typst/image-shadow';

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
      *{box-sizing:border-box;-webkit-user-select:none;user-select:none}html,body{margin:0;width:100%;height:100%;background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,"Segoe UI",sans-serif}body{display:flex;flex-direction:column;overflow:hidden}
      .toolbar{position:sticky;top:0;z-index:5;display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;gap:12px;padding:10px 14px;border-bottom:1px solid var(--border);background:color-mix(in srgb,var(--surface) 94%,transparent);backdrop-filter:blur(12px)}
      .fullscreen-reveal{display:none}
      .title{min-width:0;font-size:14px;font-weight:650;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.controls{display:flex;align-items:center;gap:6px}.controls.end{justify-content:flex-end}
      button{width:38px;height:38px;padding:0;display:inline-flex;align-items:center;justify-content:center;border:1px solid transparent;border-radius:7px;background:transparent;color:inherit;cursor:pointer}button:hover:not(:disabled){background:color-mix(in srgb,var(--accent) 12%,transparent);border-color:var(--border)}button:focus-visible{outline:3px solid var(--accent);outline-offset:1px}button:disabled{opacity:.3;cursor:default}button[aria-pressed=true]{color:var(--accent);background:color-mix(in srgb,var(--accent) 14%,transparent)}button svg{width:21px;height:21px}
      button.title{width:max-content;max-width:100%;height:auto;justify-content:flex-start;padding:5px 7px;margin:-5px -7px;border-radius:6px;text-align:left}
      .counter,.zoom{font-size:13px;font-variant-numeric:tabular-nums;color:color-mix(in srgb,var(--text) 68%,transparent);white-space:nowrap}.zoom{min-width:48px;text-align:center}
      main{flex:1;min-height:0;display:flex;justify-content:center;padding:100px 100px 60px;overflow:auto;cursor:grab}.question-wrap{width:100%;height:max-content}.question svg{display:block;width:100%;height:auto}.status{margin:auto;color:color-mix(in srgb,var(--text) 65%,transparent);font-size:15px}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
      main.dragging{cursor:grabbing}
      :fullscreen .fullscreen-reveal{display:block;position:fixed;z-index:10;top:0;left:0;right:0;height:12px}
      :fullscreen .toolbar{position:fixed;z-index:9;top:0;left:0;right:0;transform:translateY(calc(-100% - 2px));transition:transform 180ms ease-out;will-change:transform}
      :fullscreen .fullscreen-reveal:hover + .toolbar,:fullscreen .toolbar:hover{transform:translateY(0)}
      @media(max-width:900px){main{padding:56px 32px 40px}}
      @media(max-width:680px){.toolbar{grid-template-columns:1fr auto}.title{grid-column:1/-1}.controls.end{grid-column:2}.toolbar>.controls:not(.end){grid-column:1;grid-row:2}.counter{display:none}main{padding:28px 16px 24px}}
    </style></head><body><div class="fullscreen-reveal" aria-hidden="true"></div><header class="toolbar"><button class="title" data-action="origin" aria-label="Return to ${title}" title="Return to this question in ${title}">${title}</button><div class="controls">
      <button data-action="previous" aria-label="Previous question" title="Previous question (double-click or Left arrow)">${icon('previous')}</button><span class="counter" aria-live="polite"></span><button data-action="next" aria-label="Next question" title="Next question (click or Right arrow)">${icon('next')}</button>
    </div><div class="controls end"><button data-action="zoom-out" aria-label="Zoom out" title="Zoom out (hold Ctrl or the right mouse button and scroll down, or press −)">${icon('minus')}</button><span class="zoom" aria-live="polite">100%</span><button data-action="zoom-in" aria-label="Zoom in" title="Zoom in (hold Ctrl or the right mouse button and scroll up, or press +)">${icon('plus')}</button><button data-action="theme" aria-label="Use dark theme" title="Use dark theme (T)" aria-pressed="false">${icon('theme')}</button><button data-action="answer" aria-label="Show answer" title="Show answer (right-click or A)" aria-pressed="false">${icon('answer')}</button><button data-action="fullscreen" aria-label="Enter fullscreen" title="Enter fullscreen (F)">${icon('fullscreen')}</button><button data-action="close" aria-label="Close display window" title="Close display window">${icon('close')}</button></div></header>
      <main><div class="question-wrap"><div class="status" role="status">Rendering question…</div><div class="question"></div></div></main><div class="sr-only" aria-live="assertive" data-announcer></div></body></html>`);
    doc.close();
  }

  function startSession(popup: Window, request: DisplayModeRequest, token: number): () => void {
    writeShell(popup, request);
    const doc = popup.document;
    let index = $state(Math.max(0, request.questions.findIndex(question => question.id === request.initialId)));
    let showAnswer = $state(false);
    let darkTheme = $state(false);
    const zoomLevels = [0.25, 0.35, 0.5, 0.7, 0.85, 1, 1.15, 1.35, 1.6, 2, 2.5, 3, 4, 5];
    let zoomIndex = $state(zoomLevels.indexOf(1));
    let clickTimer: ReturnType<typeof setTimeout> | null = null;
    let wheelTimer: ReturnType<typeof setTimeout> | null = null;
    let wheelDelta = 0;
    let rightPress: { scrolled: boolean } | null = null;
    let drag: { pointerId: number; x: number; y: number; scrollLeft: number; scrollTop: number; moved: boolean } | null = null;
    let suppressCanvasClick = false;
    const lastGood = new Map<string, { source: string; svg: string }>();
    const latestQuestions = new Map<string, DisplayModeQuestion>();
    let shown: { id: string; answer: boolean; svg: string } | undefined;
    let previousLayout = '';

    const element = <T extends Element>(selector: string) => doc.querySelector<T>(selector)!;
    const action = (name: string) => element<HTMLButtonElement>(`[data-action="${name}"]`);

    function updateControls(question: DisplayModeQuestion): void {
      action('previous').disabled = index === 0;
      action('next').disabled = index === request.questions.length - 1;
      action('answer').disabled = !hasDisplayAnswer(question);
      action('answer').setAttribute('aria-pressed', String(showAnswer));
      action('answer').setAttribute('aria-label', showAnswer ? 'Hide answer' : 'Show answer');
      action('answer').title = showAnswer ? 'Hide answer (A)' : 'Show answer (A)';
      element<HTMLElement>('.counter').textContent = `${index + 1} / ${request.questions.length}`;
      element<HTMLElement>('.zoom').textContent = `${Math.round(zoomLevels[zoomIndex] * 100)}%`;
      action('zoom-out').disabled = zoomIndex === 0;
      action('zoom-in').disabled = zoomIndex === zoomLevels.length - 1;
      action('theme').setAttribute('aria-pressed', String(darkTheme));
      action('theme').setAttribute('aria-label', darkTheme ? 'Use light theme' : 'Use dark theme');
      action('theme').title = darkTheme ? 'Use light theme (T)' : 'Use dark theme (T)';
    }

    function questionAtIndex() {
      const original = request.questions[index];
      const live = request.questionFor?.(original);
      if (live) latestQuestions.set(original.id, live);
      return latestQuestions.get(original.id) ?? original;
    }

    const questionEl = element<HTMLElement>('.question');
    const statusEl = element<HTMLElement>('.status');
    function showFrame(id: string, answer: boolean, svg: string) {
      if (shown?.svg !== svg) questionEl.innerHTML = svg;
      questionEl.hidden = false;
      statusEl.hidden = true;
      shown = { id, answer, svg };
    }

    const stopRendering = $effect.root(() => {
      $effect(() => {
        if (popup.closed) return;
        const id = request.questions[index].id;
        const question = questionAtIndex();
        const answer = showAnswer && hasDisplayAnswer(question);
        const colors = darkTheme ? DISPLAY_THEMES.dark : DISPLAY_THEMES.light;
        const source = displayQuestionSource(question, question.narrative ?? '', answer, colors, 18 * zoomLevels[zoomIndex]);
        const names = scanImageRefs(source);
        imageStore.revisionOf(names);
        const slot = `${id}:${answer}`;
        const layout = `${slot}:${zoomIndex}:${darkTheme}`;
        const delay = layout === previousLayout ? 150 : 0;
        previousLayout = layout;
        const cached = lastGood.get(slot);
        untrack(() => {
          updateControls(question);
          popup.document.title = `${index + 1} / ${request.questions.length} · ${request.title ?? 'Question display'}`;
        });
        // Reusing an earlier frame must never show a different question or reveal a hidden answer.
        if (shown?.id !== id || (!answer && shown.answer)) {
          if (cached) showFrame(id, answer, cached.svg);
          else {
            questionEl.replaceChildren();
            questionEl.hidden = true;
            shown = undefined;
          }
        }
        if (!names.length && cached?.source === source) {
          showFrame(id, answer, cached.svg);
          return;
        }
        statusEl.hidden = Boolean(shown);
        let cancelled = false;
        const obsolete = () => cancelled || token !== session || popup.closed;
        const timer = setTimeout(async () => {
          try {
            const images = await request.imagesFor?.(question, names) ?? [];
            if (obsolete()) return;
            const result = await compileSvg(source, { consumer, images, priority: 'interactive' });
            if (obsolete() || !result.svg) return;
            lastGood.delete(slot);
            lastGood.set(slot, { source, svg: result.svg });
            if (lastGood.size > 32) lastGood.delete(lastGood.keys().next().value!);
            showFrame(id, answer, result.svg);
          } catch { /* Keep the last successful presentation frame. */ }
          finally { if (!obsolete()) statusEl.hidden = true; }
        }, delay);
        return () => {
          cancelled = true;
          clearTimeout(timer);
          cancelPreview(consumer);
        };
      });
    });

    function move(delta: number): void {
      const next = Math.max(0, Math.min(request.questions.length - 1, index + delta));
      if (next === index) return;
      index = next;
      showAnswer = false;
    }
    function adjustZoom(delta: number): void {
      const next = Math.max(0, Math.min(zoomLevels.length - 1, zoomIndex + delta));
      if (next === zoomIndex) return;
      zoomIndex = next;
    }
    function toggleTheme(): void {
      darkTheme = !darkTheme;
      const colors = darkTheme ? DISPLAY_THEMES.dark : DISPLAY_THEMES.light;
      doc.documentElement.style.colorScheme = darkTheme ? 'dark' : 'light';
      doc.documentElement.style.setProperty('--bg', colors.bg);
      doc.documentElement.style.setProperty('--text', colors.text);
      doc.documentElement.style.setProperty('--surface', colors.surface);
      doc.documentElement.style.setProperty('--border', colors.border);
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
        case 'answer': showAnswer = !showAnswer; break;
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
      else if (event.key.toLowerCase() === 'a') { event.preventDefault(); if (!action('answer').disabled) showAnswer = !showAnswer; }
      else if (event.key.toLowerCase() === 't') { event.preventDefault(); toggleTheme(); }
      else if (event.key.toLowerCase() === 'f') { event.preventDefault(); void toggleFullscreen(); }
    }
    function onCanvasClick(event: MouseEvent): void {
      if (suppressCanvasClick) { suppressCanvasClick = false; event.preventDefault(); return; }
      if (event.detail !== 1) return;
      if (clickTimer) clearTimeout(clickTimer);
      clickTimer = setTimeout(() => { clickTimer = null; move(1); }, 240);
    }
    function onCanvasDoubleClick(event: MouseEvent): void {
      event.preventDefault();
      if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; }
      move(-1);
    }
    function toggleAnswer(): void {
      const question = questionAtIndex();
      if (!question || !hasDisplayAnswer(question)) return;
      showAnswer = !showAnswer;
    }
    function onCanvasContextMenu(event: MouseEvent): void {
      event.preventDefault();
      // Keyboard context-menu requests can still show the answer.
      if (event.button !== 2 && !rightPress) toggleAnswer();
    }
    function onCanvasMouseDown(event: MouseEvent): void {
      if (event.button === 2) rightPress = { scrolled: false };
    }
    function onMouseUp(event: MouseEvent): void {
      if (event.button !== 2 || !rightPress) return;
      const { scrolled } = rightPress;
      rightPress = null;
      // Some browsers fire contextmenu on press. Wait for release to know if this was a click.
      if (!scrolled && canvas.contains(event.target as Node)) toggleAnswer();
    }
    function cancelRightPress(): void { rightPress = null; }
    function onCanvasWheel(event: WheelEvent): void {
      if (!event.ctrlKey && !rightPress) return;
      event.preventDefault();
      if (!event.deltaY) return;
      if (rightPress) rightPress.scrolled = true;
      wheelDelta += event.deltaY;
      if (wheelTimer) clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => {
        const delta = wheelDelta;
        wheelDelta = 0;
        wheelTimer = null;
        if (delta) adjustZoom(delta < 0 ? 1 : -1);
      }, 70);
    }
    function onCanvasPointerDown(event: PointerEvent): void {
      if (event.button !== 0) return;
      drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY,
        scrollLeft: canvas.scrollLeft, scrollTop: canvas.scrollTop, moved: false };
      canvas.setPointerCapture(event.pointerId);
    }
    function onCanvasPointerMove(event: PointerEvent): void {
      if (!drag || drag.pointerId !== event.pointerId) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 5) return;
      if (!drag.moved) {
        drag.moved = true;
        canvas.classList.add('dragging');
        if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; }
      }
      event.preventDefault();
      canvas.scrollLeft = drag.scrollLeft - dx;
      canvas.scrollTop = drag.scrollTop - dy;
    }
    function finishCanvasDrag(event: PointerEvent, cancelled = false): void {
      if (!drag || drag.pointerId !== event.pointerId) return;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      suppressCanvasClick = drag.moved && !cancelled;
      drag = null;
      canvas.classList.remove('dragging');
    }
    function cancelCanvasDrag(event: PointerEvent): void { finishCanvasDrag(event, true); }
    function onFullscreenChange(): void {
      const active = Boolean(doc.fullscreenElement);
      action('fullscreen').setAttribute('aria-label', active ? 'Exit fullscreen' : 'Enter fullscreen');
      action('fullscreen').title = active ? 'Exit fullscreen (F)' : 'Enter fullscreen (F)';
    }
    doc.addEventListener('click', onClick);
    doc.addEventListener('keydown', onKeydown);
    doc.addEventListener('fullscreenchange', onFullscreenChange);
    popup.addEventListener('mouseup', onMouseUp);
    popup.addEventListener('blur', cancelRightPress);
    const canvas = element<HTMLElement>('main');
    canvas.addEventListener('click', onCanvasClick);
    canvas.addEventListener('dblclick', onCanvasDoubleClick);
    canvas.addEventListener('contextmenu', onCanvasContextMenu);
    canvas.addEventListener('mousedown', onCanvasMouseDown);
    canvas.addEventListener('wheel', onCanvasWheel, { passive: false });
    canvas.addEventListener('pointerdown', onCanvasPointerDown);
    canvas.addEventListener('pointermove', onCanvasPointerMove);
    canvas.addEventListener('pointerup', finishCanvasDrag);
    canvas.addEventListener('pointercancel', cancelCanvasDrag);
    canvas.addEventListener('pointercancel', cancelRightPress);
    const closed = () => displayMode.clear(popup);
    popup.addEventListener('pagehide', closed, { once: true });
    return () => {
      stopRendering();
      popup.removeEventListener('pagehide', closed);
      if (clickTimer) clearTimeout(clickTimer);
      if (wheelTimer) clearTimeout(wheelTimer);
      cancelPreview(consumer);
      doc.removeEventListener('click', onClick);
      doc.removeEventListener('keydown', onKeydown);
      doc.removeEventListener('fullscreenchange', onFullscreenChange);
      popup.removeEventListener('mouseup', onMouseUp);
      popup.removeEventListener('blur', cancelRightPress);
      canvas.removeEventListener('click', onCanvasClick);
      canvas.removeEventListener('dblclick', onCanvasDoubleClick);
      canvas.removeEventListener('contextmenu', onCanvasContextMenu);
      canvas.removeEventListener('mousedown', onCanvasMouseDown);
      canvas.removeEventListener('wheel', onCanvasWheel);
      canvas.removeEventListener('pointerdown', onCanvasPointerDown);
      canvas.removeEventListener('pointermove', onCanvasPointerMove);
      canvas.removeEventListener('pointerup', finishCanvasDrag);
      canvas.removeEventListener('pointercancel', cancelCanvasDrag);
      canvas.removeEventListener('pointercancel', cancelRightPress);
    };
  }

  $effect(() => {
    const request = displayMode.request;
    const popup = displayMode.popup;
    displayMode.revision;
    if (!request || !popup || popup.closed) return;
    const token = ++session;
    return untrack(() => startSession(popup, request, token));
  });

  $effect(() => () => cancelPreview(consumer));
</script>
