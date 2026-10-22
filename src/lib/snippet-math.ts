import { compileSvg, previewQueueState } from './typst/compiler';

type Listener = (svg: string) => void;
type Job = { expression: string; listeners: Set<Listener> };
const pending = new Map<string, Job>();
const cache = new Map<string, string>();
let cacheCharacters = 0;
let running: Job | null = null;
let scheduled = false;

function schedule() {
  if (running || scheduled || !pending.size) return;
  scheduled = true;
  const run = () => { scheduled = false; void pump(); };
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(run, { timeout: 500 });
  else window.setTimeout(run, 100);
}

async function pump() {
  if (running || !pending.size) return;
  // Submit one equation at a time, yielding to selected previews, checks and exports.
  const state = previewQueueState();
  if (state.running || state.queued) {
    scheduled = true;
    window.setTimeout(() => { scheduled = false; schedule(); }, 100);
    return;
  }
  const [expression, job] = pending.entries().next().value!;
  running = job;
  try {
    const result = await compileSvg(`#set page(width: auto, height: auto, margin: 1pt, fill: none)
#set text(size: 15pt, fill: rgb("000000"))
$${expression}$`);
    // Inline equations need only drawing data. Omit the renderer's document scripts,
    // global styles and selection overlays, and let neutral ink follow the card theme.
    const svg = (result.svg ?? '')
      .replace(/<(script|style|foreignObject)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
      .replace(/\b(fill|stroke)="(?:#000(?:000)?|black)"/gi, '$1="currentColor"');
    if (expression.length + svg.length <= 2_000_000) {
      cache.set(expression, svg);
      cacheCharacters += expression.length + svg.length;
      while (cache.size > 128 || cacheCharacters > 2_000_000) {
        const oldest = cache.keys().next().value!;
        cacheCharacters -= oldest.length + cache.get(oldest)!.length;
        cache.delete(oldest);
      }
    }
    for (const listener of job.listeners) listener(svg);
  } finally {
    if (pending.get(expression) === job) pending.delete(expression);
    running = null;
    schedule();
  }
}

/** Shared, bounded math cache. Discard requests when their cards leave the viewport. */
export function requestSnippetMath(expression: string, listener: Listener): () => void {
  if (cache.has(expression)) {
    const svg = cache.get(expression)!;
    cache.delete(expression);
    cache.set(expression, svg);
    listener(svg);
    return () => {};
  }
  let job = pending.get(expression);
  if (!job) {
    job = { expression, listeners: new Set() };
    pending.set(expression, job);
  }
  const requested = job;
  requested.listeners.add(listener);
  schedule();
  return () => {
    requested.listeners.delete(listener);
    if (!requested.listeners.size && running !== requested && pending.get(expression) === requested) pending.delete(expression);
  };
}
