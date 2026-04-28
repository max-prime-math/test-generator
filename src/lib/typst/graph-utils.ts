/**
 * Shared utilities for graph compilation (Typst and SVG backends).
 */

export function generateTicks(min: number, max: number, step: number): number[] {
  const ticks: number[] = [];
  for (let t = Math.ceil(min / step) * step; t <= max; t += step) {
    ticks.push(Math.round(t * 1e10) / 1e10);
  }
  return ticks;
}
