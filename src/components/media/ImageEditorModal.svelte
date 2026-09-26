<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { portal } from '../../lib/portal';
  import { imageStore } from '../../lib/image-store.svelte';
  import { imageUsage, usageCount, replaceImage } from '../../lib/editor/image-library';
  import { History, editPolicy, outputFormat, copyName, rasterSize, checkSize, toImagePoint, rectFromPoints, recanvas, extendRect, rotate, flipHorizontal, floodFill, parseHex, formatBytes, WHITE, CLEAR, type Pixels, type Rect } from '../../lib/media/image-editor';
  type Tool = 'hand' | 'pencil' | 'eraser' | 'line' | 'rect' | 'fill' | 'crop';
  type Point = { x: number; y: number };
  let { name, onclose, onsaved }: { name: string; onclose: () => void; onsaved?: (name: string) => void } = $props();
  const TOOLS: [Tool, string][] = [['hand', 'Pan'], ['pencil', 'Brush'], ['eraser', 'Eraser'], ['line', 'Line'], ['rect', 'Rectangle'], ['fill', 'Fill'], ['crop', 'Crop']];
  const SWATCHES = [['#000000', 'Black'], ['#ffffff', 'White'], ['#dc2626', 'Red'], ['#2563eb', 'Blue']];
  let target = $state(untrack(() => name));
  let ext = $state(''), size = $state(0), uses = $state(0), width = $state(0), height = $state(0), zoom = $state(1);
  let policy = $state<ReturnType<typeof editPolicy> | null>(null);
  let raster = $state(false), copyOnly = $state(false), dirty = $state(false), busy = $state(false);
  let url = $state(''), message = $state(''), error = $state('');
  let tool = $state<Tool>('hand'), color = $state('#000000'), brush = $state(4), filled = $state(true), tolerance = $state(32), transparent = $state(false);
  let crop = $state<Rect | null>(null), draft = $state<{ a: Point; b: Point } | null>(null);
  let extendOpen = $state(false), margins = $state({ top: 0, right: 0, bottom: 0, left: 0 });
  let steps = $state({ undo: 0, redo: 0 }), dragging = $state(false);
  let dialog: HTMLDivElement, stage: HTMLDivElement, canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D;
  const history = new History<Pixels>(30, 300_000_000, p => p.data.byteLength);
  let out = $derived(outputFormat(copyOnly ? 'png' : ext));
  let canOverwrite = $derived(raster && !copyOnly && Boolean(policy?.overwrite));
  let fill = $derived(transparent && out.alpha ? CLEAR : WHITE);
  onMount(() => {
    const previous = document.activeElement as HTMLElement | null;
    ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    dialog.focus();
    void load();
    const wheel = (e: WheelEvent) => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); setZoom(zoom * (e.deltaY < 0 ? 1.25 : 0.8)); } };
    stage.addEventListener('wheel', wheel, { passive: false });
    return () => { stage.removeEventListener('wheel', wheel); if (url) URL.revokeObjectURL(url); previous?.focus?.(); };
  });
  async function load() {
    try {
      const image = await imageStore.get(target);
      if (!image) throw new Error('The image could not be found.');
      ext = image.ext; size = image.size; uses = usageCount(imageUsage(image.name));
      policy = editPolicy(image.name, image.ext, image.ext === 'svg' ? new TextDecoder().decode(image.bytes) : '');
      const blob = new Blob([image.bytes as BlobPart], { type: image.mime });
      if (policy.kind === 'raster') {
        const bitmap = await createImageBitmap(blob);
        checkSize(bitmap.width, bitmap.height);
        canvas.width = width = bitmap.width; canvas.height = height = bitmap.height;
        ctx.drawImage(bitmap, 0, 0); bitmap.close(); raster = true;
      } else {
        url = URL.createObjectURL(blob);
        if (policy.kind !== 'pdf') { const img = await decoded(url); width = img.naturalWidth; height = img.naturalHeight; }
      }
      await tick(); fit();
    } catch (e) { error = e instanceof Error ? e.message : String(e); }
  }
  async function decoded(src: string) { const img = new Image(); img.src = src; await img.decode(); return img; }
  async function editCopy() {
    const img = await decoded(url), next = rasterSize(img.naturalWidth, img.naturalHeight);
    canvas.width = width = next.width; canvas.height = height = next.height;
    ctx.drawImage(img, 0, 0, width, height);
    raster = copyOnly = dirty = true; tool = 'pencil';
    message = 'Editing a PNG copy. Use “Save as copy” to keep it; the SVG stays unchanged.';
    await tick(); fit();
  }
  function setZoom(value: number) { zoom = Math.min(16, Math.max(0.02, value)); }
  function fit() {
    if (!stage || !width || !height) return;
    setZoom(Math.min(8, (stage.clientWidth - 48) / width, (stage.clientHeight - 48) / height));
  }
  const pixels = (): Pixels => ctx.getImageData(0, 0, canvas.width, canvas.height);
  function show(p: Pixels) {
    if (canvas.width !== p.width || canvas.height !== p.height) { canvas.width = width = p.width; canvas.height = height = p.height; }
    const data = ctx.createImageData(p.width, p.height); data.data.set(p.data); ctx.putImageData(data, 0, 0);
  }
  function changed(before: Pixels) {
    history.push(before); dirty = true; message = '';
    steps = { undo: history.undoStack.length, redo: 0 };
  }
  function apply(change: (p: Pixels) => Pixels | null) {
    try {
      const before = pixels(), after = change(before);
      if (!after) return;
      changed(before); show(after); crop = null; extendOpen = false;
    } catch (e) { message = e instanceof Error ? e.message : String(e); }
  }
  function step(direction: 'undo' | 'redo') {
    const restored = history[direction](pixels());
    if (!restored) return;
    show(restored); dirty = true; crop = null;
    steps = { undo: history.undoStack.length, redo: history.redoStack.length };
  }
  function pen(erasing = tool === 'eraser') {
    ctx.globalCompositeOperation = erasing && transparent && out.alpha ? 'destination-out' : 'source-over';
    ctx.strokeStyle = ctx.fillStyle = erasing ? '#ffffff' : color;
    ctx.lineWidth = brush; ctx.lineCap = ctx.lineJoin = 'round';
  }
  function segment(a: Point, b: Point) { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
  let active: { id: number; start: Point; last: Point; scroll: Point; client: Point } | null = null;
  const point = (e: PointerEvent): Point => toImagePoint(e.clientX, e.clientY, canvas.getBoundingClientRect(), canvas.width, canvas.height);
  function down(e: PointerEvent) {
    if (active || busy || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (e.target === stage && (e.offsetX > stage.clientWidth || e.offsetY > stage.clientHeight)) return;
    stage.setPointerCapture(e.pointerId); e.preventDefault();
    const p = point(e);
    active = { id: e.pointerId, start: p, last: p, scroll: { x: stage.scrollLeft, y: stage.scrollTop }, client: { x: e.clientX, y: e.clientY } }; dragging = true;
    if (!raster || tool === 'hand') return;
    if (tool === 'fill') {
      apply(before => { const next = { width: before.width, height: before.height, data: before.data.slice() }; return floodFill(next, p.x, p.y, parseHex(color), tolerance) ? next : null; });
      active = null; dragging = false;
    } else if (tool === 'crop') crop = null;
    else if (tool === 'line' || tool === 'rect') draft = { a: p, b: p };
    else { changed(pixels()); pen(); ctx.beginPath(); ctx.arc(p.x, p.y, brush / 2, 0, Math.PI * 2); ctx.fill(); }
  }
  function move(e: PointerEvent) {
    if (!active || e.pointerId !== active.id) return;
    if (!raster || tool === 'hand') { stage.scrollLeft = active.scroll.x - (e.clientX - active.client.x); stage.scrollTop = active.scroll.y - (e.clientY - active.client.y); return; }
    const p = point(e);
    if (tool === 'pencil' || tool === 'eraser') {
      pen();
      for (const event of e.getCoalescedEvents?.() ?? [e]) { const q = point(event); segment(active.last, q); active.last = q; }
    } else if (draft) draft = { a: draft.a, b: p };
    else if (tool === 'crop') crop = rectFromPoints(active.start, p);
  }
  function up(e: PointerEvent, cancelled = false) {
    if (!active || e.pointerId !== active.id) return;
    const a = draft?.a, b = draft && point(e);
    active = null; draft = null; dragging = false;
    ctx.globalCompositeOperation = 'source-over';
    if (cancelled || !a || !b) { if (crop && (crop.width < 2 || crop.height < 2)) crop = null; return; }
    apply(before => {
      pen(false);
      if (tool === 'line') segment(a, b);
      else {
        const r = rectFromPoints(a, b);
        if (filled) ctx.fillRect(r.x, r.y, r.width, r.height);
        else ctx.strokeRect(r.x + brush / 2, r.y + brush / 2, Math.max(0, r.width - brush), Math.max(0, r.height - brush));
      }
      return pixels();
    });
  }
  function cropExtends(r: Rect) { return r.x < 0 || r.y < 0 || r.x + r.width > width || r.y + r.height > height; }
  function requestClose() {
    if (busy) return;
    if (dirty && !confirm('Discard unsaved changes to this image?')) return;
    onclose();
  }
  function key(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (crop || extendOpen || draft) { crop = null; extendOpen = false; draft = null; } else requestClose(); return; }
    if (e.key === 'Tab') return trap(e);
    const typing = e.target instanceof HTMLInputElement && !['range', 'checkbox', 'color', 'button'].includes(e.target.type);
    if (!raster || typing || busy) return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && (k === 'z' || k === 'y')) { e.preventDefault(); step(k === 'y' || e.shiftKey ? 'redo' : 'undo'); }
    else if (e.key === 'Enter' && crop && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); const r = crop; apply(p => recanvas(p, r, fill)); }
  }
  function trap(e: KeyboardEvent) {
    const items = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href], [tabindex="0"]')).filter(el => el.offsetParent !== null);
    const first = items[0], last = items.at(-1);
    if (!first || !last) return;
    const current = document.activeElement;
    if (!dialog.contains(current) || current === dialog) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
    else if (e.shiftKey && current === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && current === last) { e.preventDefault(); first.focus(); }
  }
  async function encode(): Promise<Uint8Array> {
    let source = canvas;
    if (!out.alpha) {
      source = document.createElement('canvas'); source.width = width; source.height = height;
      const flat = source.getContext('2d')!; flat.fillStyle = '#ffffff'; flat.fillRect(0, 0, width, height); flat.drawImage(canvas, 0, 0);
    }
    const blob = await new Promise<Blob | null>(resolve => source.toBlob(resolve, out.mime, out.quality));
    if (!blob) throw new Error('The image could not be encoded.');
    return new Uint8Array(await blob.arrayBuffer());
  }
  async function save(copy: boolean) {
    if (busy || !raster) return;
    if (!copy && policy?.converts && !confirm(`Save ${imageStore.displayName(target)} as PNG? The file type changes to .png and every reference is updated.`)) return;
    busy = true; message = '';
    try {
      const bytes = await encode(), format = out;
      if (copy) {
        const next = copyName(target, n => imageStore.has(n));
        await imageStore.put(next, bytes, format.ext);
        target = next; copyOnly = false; onsaved?.(next);
        message = `Saved a copy as ${imageStore.displayName(next)}. References were not changed.`;
      } else if (format.ext === ext) await imageStore.put(target, bytes, ext);
      else await replaceImage(target, new File([bytes as BlobPart], `${target}.${format.ext}`, { type: format.mime }));
      if (!copy) message = `Saved ${imageStore.displayName(target)}.`;
      ext = format.ext; size = bytes.byteLength; dirty = false;
      policy = editPolicy(target, ext); uses = usageCount(imageUsage(target));
    } catch (e) { message = e instanceof Error ? e.message : String(e); } finally { busy = false; }
  }
</script>
<svelte:window onkeydown={key} />
<div class="viewer-overlay" use:portal>
  <div class="viewer" role="dialog" aria-modal="true" aria-labelledby="image-viewer-title" tabindex="-1" bind:this={dialog}>
    <header>
      <div class="title">
        <strong id="image-viewer-title">{imageStore.displayName(target)}{copyOnly ? ' (PNG copy)' : ''}</strong>
        <span class="meta">{width && height ? `${width} × ${height} px · ` : ''}{formatBytes(size)}{dirty ? ' · unsaved changes' : ''}</span>
      </div>
      <div class="group" role="group" aria-label="Zoom">
        <button aria-label="Zoom out" title="Zoom out" onclick={() => setZoom(zoom / 1.25)}>−</button>
        <button aria-label="Actual size" title="Actual size (100%)" onclick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button>
        <button aria-label="Zoom in" title="Zoom in" onclick={() => setZoom(zoom * 1.25)}>+</button>
        <button onclick={fit}>Fit</button>
      </div>
      <div class="group">
        {#if raster}
          <button class="primary" disabled={busy || !dirty || !canOverwrite} title={canOverwrite ? `Overwrite this shared file (${uses} uses)` : 'This image can only be saved as a copy'} onclick={() => save(false)}>Save</button>
          <button disabled={busy} onclick={() => save(true)}>Save as copy</button>
        {:else if policy?.kind === 'svg'}<button onclick={editCopy}>Edit as PNG copy</button>{/if}
        <button onclick={requestClose} disabled={busy}>Close</button>
      </div>
    </header>
    {#if raster}
      <div class="toolbar" role="toolbar" aria-label="Editing tools">
        <div class="group">{#each TOOLS as [id, label] (id)}<button class:on={tool === id} aria-pressed={tool === id} onclick={() => { tool = id; crop = null; }}>{label}</button>{/each}</div>
        {#if ['pencil', 'eraser', 'line', 'rect'].includes(tool) && !(tool === 'rect' && filled)}<label class="inline">Size <input type="range" min="1" max="64" aria-label="Brush size" bind:value={brush} /><span class="num">{brush}</span></label>{/if}
        {#if ['pencil', 'line', 'rect', 'fill'].includes(tool)}
          <div class="group swatches">{#each SWATCHES as [value, label] (value)}<button class="swatch" class:on={color === value} aria-label={label} title={label} style:background={value} onclick={() => color = value}></button>{/each}<input type="color" aria-label="Custom colour" bind:value={color} /></div>
        {/if}
        {#if tool === 'rect'}<label class="inline"><input type="checkbox" bind:checked={filled} /> Filled</label>{/if}
        {#if tool === 'fill'}<label class="inline">Tolerance <input type="range" min="0" max="128" aria-label="Fill tolerance" bind:value={tolerance} /><span class="num">{tolerance}</span></label>{/if}
        {#if (tool === 'eraser' || tool === 'crop') && out.alpha}<label class="inline"><input type="checkbox" bind:checked={transparent} /> {tool === 'eraser' ? 'Erase to transparent' : 'Transparent new area'}</label>{/if}
        <div class="group">
          <button aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!steps.undo} onclick={() => step('undo')}>↶</button>
          <button aria-label="Redo" title="Redo (Ctrl+Shift+Z)" disabled={!steps.redo} onclick={() => step('redo')}>↷</button>
          <button aria-label="Rotate left" title="Rotate 90° left" onclick={() => apply(p => rotate(p, 'left'))}>⟲</button>
          <button aria-label="Rotate right" title="Rotate 90° right" onclick={() => apply(p => rotate(p, 'right'))}>⟳</button>
          <button aria-label="Flip horizontal" title="Flip horizontal" onclick={() => apply(flipHorizontal)}>⇋</button>
          <button class:on={extendOpen} aria-expanded={extendOpen} onclick={() => extendOpen = !extendOpen}>Extend…</button>
        </div>
      </div>
      {#if extendOpen}
        <form class="subbar" onsubmit={e => { e.preventDefault(); apply(p => recanvas(p, extendRect(p.width, p.height, margins), fill)); margins = { top: 0, right: 0, bottom: 0, left: 0 }; }}>
          <span>Add margins (px)</span>
          {#each ['top', 'right', 'bottom', 'left'] as const as side (side)}<label class="inline">{side[0].toUpperCase() + side.slice(1)} <input class="margin" type="number" min="0" max="4000" aria-label={`Extend ${side}`} bind:value={margins[side]} /></label>{/each}
          {#if out.alpha}<label class="inline"><input type="checkbox" bind:checked={transparent} /> Transparent</label>{/if}
          <button class="primary" type="submit">Apply</button>
        </form>
      {/if}
      {#if crop && tool === 'crop' && !dragging}
        <div class="subbar">
          <span>Selection {crop.width} × {crop.height} px{cropExtends(crop) ? ` · extends the canvas with ${fill === CLEAR ? 'transparency' : 'white'}` : ''}</span>
          <button class="primary" onclick={() => { const r = crop!; apply(p => recanvas(p, r, fill)); }}>{cropExtends(crop) ? 'Apply crop / extend' : 'Crop'}</button>
          <button onclick={() => crop = null}>Cancel</button>
        </div>
      {/if}
    {/if}
    {#if error}<p class="note error" role="alert">{error}</p>
    {:else if message || (policy?.note && !copyOnly)}<p class="note" role="status">{message || policy?.note}</p>{/if}
    <div class="stage" class:draw={raster && tool !== 'hand'} bind:this={stage} onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={e => up(e, true)} role="presentation">
      <div class="board" class:hidden={policy?.kind === 'pdf'} class:pixelated={zoom >= 2} style:width={`${width * zoom}px`} style:height={`${height * zoom}px`}>
        <canvas bind:this={canvas} class:hidden={!raster} aria-label={`Image ${imageStore.displayName(target)}`}></canvas>
        {#if !raster && url && policy?.kind !== 'pdf'}<img src={url} alt={imageStore.displayName(target)} draggable="false" />{/if}
        {#if raster && width}
          <svg class="overlay" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
            {#if draft && tool === 'line'}<line x1={draft.a.x} y1={draft.a.y} x2={draft.b.x} y2={draft.b.y} stroke={color} stroke-width={brush} stroke-linecap="round" />{/if}
            {#if draft && tool === 'rect'}{@const r = rectFromPoints(draft.a, draft.b)}<rect x={r.x} y={r.y} width={r.width} height={r.height} fill={filled ? color : 'none'} stroke={filled ? 'none' : color} stroke-width={brush} opacity=".7" />{/if}
            {#if crop}<rect class="crop" x={crop.x} y={crop.y} width={crop.width} height={crop.height} />{/if}
          </svg>
        {/if}
      </div>
      {#if policy?.kind === 'pdf'}<p class="pdf">PDF files can’t be shown in the image viewer. <a href={url} target="_blank" rel="noopener">Open the PDF in a new tab</a>.</p>{/if}
    </div>
  </div>
</div>
<style>
  .viewer-overlay { position: fixed; inset: 0; z-index: 300; padding: 1rem; background: #000a; display: grid; place-items: center; }
  .viewer { width: min(1400px, 100%); height: 100%; display: flex; flex-direction: column; background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; outline: none; }
  header, .toolbar, .subbar { display: flex; flex-wrap: wrap; align-items: center; gap: .4rem .75rem; padding: .5rem .75rem; border-bottom: 1px solid var(--border); }
  header { justify-content: space-between; }
  .title { display: grid; min-width: 0; flex: 1 1 200px; } .title strong { overflow-wrap: anywhere; font-size: 14px; }
  .meta, .subbar span, .note, label { color: var(--text-2); font-size: 12px; }
  .group { display: flex; flex-wrap: wrap; gap: .25rem; align-items: center; }
  .toolbar { background: var(--bg-2); } .toolbar button, .subbar button, header button { padding: 4px 9px; }
  button.on { background: var(--primary); color: #fff; }
  .inline { display: inline-flex; align-items: center; gap: .3rem; white-space: nowrap; } .inline input[type=range] { width: 90px; } .num { min-width: 2ch; font-variant-numeric: tabular-nums; }
  .swatch { width: 22px; height: 22px; padding: 0; border: 1px solid var(--border); } .swatch.on { outline: 2px solid var(--primary); outline-offset: 1px; background-image: none; }
  input[type=color] { width: 30px; height: 24px; padding: 0 2px; }
  .margin { width: 5.5em; padding: 2px 4px; }
  .note { margin: 0; padding: .4rem .75rem; border-bottom: 1px solid var(--border); } .note.error { color: var(--danger); }
  .stage { flex: 1; min-height: 0; overflow: auto; display: grid; padding: 24px; touch-action: none; cursor: grab; background: var(--bg-2); user-select: none; }
  .stage.draw { cursor: crosshair; }
  .board { margin: auto; position: relative; box-shadow: 0 0 0 1px var(--border); background: repeating-conic-gradient(#d4d4d8 0 25%, #fff 0 50%) 0 0 / 16px 16px; }
  .board canvas, .board img, .overlay { position: absolute; inset: 0; width: 100%; height: 100%; }
  .board img { object-fit: fill; pointer-events: none; }
  .pixelated canvas { image-rendering: pixelated; }
  .hidden { display: none; }
  .overlay { overflow: visible; pointer-events: none; }
  .overlay * { vector-effect: non-scaling-stroke; }
  .overlay line, .overlay rect:not(.crop) { vector-effect: none; }
  .crop { fill: #2563eb22; stroke: #2563eb; stroke-width: 1.5; stroke-dasharray: 6 4; }
  .pdf { margin: auto; color: var(--text-2); font-size: 13px; } .pdf a { color: var(--primary); }
  @media (max-width: 700px) { .viewer-overlay { padding: 0; } .viewer { border-radius: 0; border: 0; } .stage { padding: 12px; } }
</style>
