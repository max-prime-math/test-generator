/**
 * Opt-in, local-only performance recorder. Records timings and counts only —
 * never question text, student data or image contents — in bounded buffers.
 */
const ENABLED_KEY = 'tg-perf-diagnostics-v1';
const MAX_SAMPLES = 200;
const MAX_LONG_TASKS = 100;

export interface PerfSample { name: string; ms: number; at: number }
interface Series { samples: number[]; total: number; count: number; max: number }

class PerfDiagnostics {
  #enabled = readEnabled();
  #series = new Map<string, Series>();
  #counters = new Map<string, number>();
  #longTasks: PerfSample[] = [];
  #observer: PerformanceObserver | null = null;
  #open = new Map<string, number>();

  constructor() { if (this.#enabled) this.#observe(); }

  get enabled(): boolean { return this.#enabled; }

  setEnabled(enabled: boolean): void {
    this.#enabled = enabled;
    try { if (enabled) localStorage.setItem(ENABLED_KEY, '1'); else localStorage.removeItem(ENABLED_KEY); } catch { /* In-memory only. */ }
    if (enabled) this.#observe();
    else { this.#observer?.disconnect(); this.#observer = null; this.clear(); }
  }

  /** Record one duration in milliseconds. */
  record(name: string, ms: number): void {
    if (!this.#enabled || !Number.isFinite(ms)) return;
    const series = this.#series.get(name) ?? { samples: [], total: 0, count: 0, max: 0 };
    series.samples.push(ms);
    if (series.samples.length > MAX_SAMPLES) series.samples.shift();
    series.total += ms; series.count += 1; series.max = Math.max(series.max, ms);
    this.#series.set(name, series);
  }

  /** Start a timer; the returned function records and returns the elapsed time. */
  start(name: string): () => number {
    if (!this.#enabled) return () => 0;
    const started = performance.now();
    return () => { const ms = performance.now() - started; this.record(name, ms); return ms; };
  }

  /** Begin a timing that a later, unrelated call finishes with `end(key)`. A new begin replaces an unfinished one. */
  begin(key: string): void { if (this.#enabled) this.#open.set(key, performance.now()); }
  end(key: string, name = key): void {
    const started = this.#open.get(key);
    if (started === undefined) return;
    this.#open.delete(key);
    this.record(name, performance.now() - started);
  }

  /** Measure until the browser has painted the next frame (visible feedback). */
  untilPaint(name: string): void {
    if (!this.#enabled) return;
    const done = this.start(name);
    requestAnimationFrame(() => setTimeout(done, 0));
  }

  count(name: string, by = 1): void {
    if (this.#enabled) this.#counters.set(name, (this.#counters.get(name) ?? 0) + by);
  }

  gauge(name: string, value: number): void {
    if (this.#enabled) this.#counters.set(`${name} (max)`, Math.max(this.#counters.get(`${name} (max)`) ?? 0, value));
  }

  clear(): void { this.#series.clear(); this.#counters.clear(); this.#longTasks = []; this.#open.clear(); }

  report() {
    const timings = Object.fromEntries([...this.#series].sort(([a], [b]) => a.localeCompare(b)).map(([name, series]) => {
      const sorted = [...series.samples].sort((a, b) => a - b);
      const pick = (q: number) => round(sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0);
      return [name, { count: series.count, p50: pick(0.5), p95: pick(0.95), max: round(series.max), mean: round(series.total / series.count) }];
    }));
    return {
      generatedAt: new Date().toISOString(),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      hardwareConcurrency: typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 0,
      timings,
      counters: Object.fromEntries(this.#counters),
      longTasks: { count: this.#longTasks.length, totalMs: round(this.#longTasks.reduce((sum, task) => sum + task.ms, 0)),
        recent: this.#longTasks.slice(-20).map(task => ({ ms: round(task.ms), at: round(task.at) })) },
    };
  }

  #observe(): void {
    if (this.#observer || typeof PerformanceObserver === 'undefined') return;
    try {
      this.#observer = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          this.#longTasks.push({ name: 'longtask', ms: entry.duration, at: entry.startTime });
          if (this.#longTasks.length > MAX_LONG_TASKS) this.#longTasks.shift();
          this.record('Main thread: long task', entry.duration);
        }
      });
      this.#observer.observe({ type: 'longtask', buffered: true });
    } catch { this.#observer = null; }
  }
}

function round(value: number): number { return Math.round(value * 10) / 10; }
function readEnabled(): boolean {
  try { return typeof localStorage !== 'undefined' && localStorage.getItem(ENABLED_KEY) === '1'; } catch { return false; }
}

export const perf = new PerfDiagnostics();
if (typeof window !== 'undefined') (window as unknown as { __tgPerf: PerfDiagnostics }).__tgPerf = perf;
