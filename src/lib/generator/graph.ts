// Coordinate graphs for generated problems, drawn with Typst builtins only (no
// package downloads). Curves are sampled here and emitted as polylines, so the
// same seed always draws the same picture. Lines take the surrounding text
// colour, which keeps graphs readable in dark-themed previews.

export type Pt = [x: number, y: number];

export interface Curve {
  /** A function to sample, or explicit points. */
  f?: (x: number) => number;
  points?: Pt[];
  /** Sampled domain; defaults to the window. */
  domain?: [number, number];
  dashed?: boolean;
  /** Drawn lighter, e.g. the original graph behind a transformed one. */
  faint?: boolean;
  /** An arrowhead at the last point, e.g. to show a direction of rotation. */
  arrow?: boolean;
}

export interface Dot { x: number; y: number; open?: boolean }

export interface GraphSpec {
  xMin: number; xMax: number; yMin: number; yMax: number;
  /** Grid spacing; defaults to 1. */
  xStep?: number; yStep?: number;
  /** Axis numbers every this many units; defaults to a spacing that avoids crowding. */
  xLabelStep?: number; yLabelStep?: number;
  /** Axis labels in place of numbers, e.g. for radian axes: [[value, typst math]]. */
  xTicks?: Array<[number, string]>;
  /** Size in centimetres. */
  width?: number; height?: number;
  curves?: Curve[];
  dots?: Dot[];
  /** Draw the grid and the axis numbers; both default to true. */
  grid?: boolean;
  numbers?: boolean;
  /** Dashed asymptote lines. */
  vertical?: number[];
  horizontal?: number[];
}

const cm = (v: number) => `${(Math.round(v * 100) / 100).toFixed(2)}cm`;

function labelStep(range: number, step: number): number {
  let k = step;
  while (range / k > 10) k *= 2;
  return k;
}

function fmt(v: number): string {
  const r = Math.round(v * 1000) / 1000;
  return r < 0 ? `−${-r}` : String(r);
}

/** Split sampled points into drawable runs, breaking at gaps and at jumps across asymptotes. */
function runs(curve: Curve, spec: GraphSpec): Pt[][] {
  if (curve.points) return [curve.points];
  const [a, b] = curve.domain ?? [spec.xMin, spec.xMax];
  const n = 240;
  const span = spec.yMax - spec.yMin;
  const out: Pt[][] = [];
  let run: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const x = a + ((b - a) * i) / n;
    const y = curve.f!(x);
    const prev = run[run.length - 1];
    const bad = !Number.isFinite(y) || Math.abs(y) > span * 50;
    const jump = prev && Math.abs(y - prev[1]) > span * 3;
    if (bad || jump) {
      if (run.length > 1) out.push(run);
      run = bad ? [] : [[x, y]];
      continue;
    }
    run.push([x, y]);
  }
  if (run.length > 1) out.push(run);
  return out;
}

/** Typst markup for a graph, as a `#box(...)` that can go anywhere in a question. */
export function graphTypst(spec: GraphSpec): string {
  const w = spec.width ?? 6, h = spec.height ?? 6;
  const xs = spec.xStep ?? 1, ys = spec.yStep ?? 1;
  const sx = (x: number) => (w * (x - spec.xMin)) / (spec.xMax - spec.xMin);
  const sy = (y: number) => h * (1 - (y - spec.yMin) / (spec.yMax - spec.yMin));
  const clampX = Math.min(Math.max(0, spec.xMin), spec.xMax);
  const clampY = Math.min(Math.max(0, spec.yMin), spec.yMax);
  const ax = sx(clampX), ay = sy(clampY);
  const parts: string[] = [];

  for (let x = Math.ceil(spec.xMin / xs) * xs; spec.grid !== false && x <= spec.xMax + 1e-9; x += xs) {
    parts.push(`place(line(start: (${cm(sx(x))}, 0cm), end: (${cm(sx(x))}, ${cm(h)}), stroke: grid))`);
  }
  for (let y = Math.ceil(spec.yMin / ys) * ys; spec.grid !== false && y <= spec.yMax + 1e-9; y += ys) {
    parts.push(`place(line(start: (0cm, ${cm(sy(y))}), end: (${cm(w)}, ${cm(sy(y))}), stroke: grid))`);
  }
  parts.push(`place(line(start: (0cm, ${cm(ay)}), end: (${cm(w)}, ${cm(ay)}), stroke: axis))`);
  parts.push(`place(line(start: (${cm(ax)}, 0cm), end: (${cm(ax)}, ${cm(h)}), stroke: axis))`);

  const xTicks = spec.numbers === false ? [] : spec.xTicks ?? (() => {
    const k = spec.xLabelStep ?? labelStep(spec.xMax - spec.xMin, xs);
    const ticks: Array<[number, string]> = [];
    for (let x = Math.ceil(spec.xMin / k) * k; x <= spec.xMax + 1e-9; x += k) if (Math.abs(x) > 1e-9) ticks.push([x, `"${fmt(x)}"`]);
    return ticks;
  })();
  for (const [x, label] of xTicks) {
    if (x <= spec.xMin || x >= spec.xMax) continue;
    parts.push(`place(dx: ${cm(sx(x) - 1)}, dy: ${cm(ay + 0.08)}, box(width: 2cm, align(center, text(size: 7pt, $${label}$))))`);
  }
  const k = spec.yLabelStep ?? labelStep(spec.yMax - spec.yMin, ys);
  for (let y = Math.ceil(spec.yMin / k) * k; spec.numbers !== false && y <= spec.yMax + 1e-9; y += k) {
    if (Math.abs(y) < 1e-9 || y <= spec.yMin || y >= spec.yMax) continue;
    parts.push(`place(dx: ${cm(ax - 2.08)}, dy: ${cm(sy(y) - 0.15)}, box(width: 2cm, align(right, text(size: 7pt, "${fmt(y)}"))))`);
  }

  for (const x of spec.vertical ?? []) {
    parts.push(`place(line(start: (${cm(sx(x))}, 0cm), end: (${cm(sx(x))}, ${cm(h)}), stroke: (paint: ink, thickness: 0.7pt, dash: "dashed")))`);
  }
  for (const y of spec.horizontal ?? []) {
    parts.push(`place(line(start: (0cm, ${cm(sy(y))}), end: (${cm(w)}, ${cm(sy(y))}), stroke: (paint: ink, thickness: 0.7pt, dash: "dashed")))`);
  }

  for (const curve of spec.curves ?? []) {
    const stroke = curve.faint
      ? '(paint: faint, thickness: 1pt, dash: "dashed")'
      : curve.dashed ? '(paint: ink, thickness: 1.1pt, dash: "dashed")' : '(paint: ink, thickness: 1.3pt)';
    for (const run of runs(curve, spec)) {
      const segments = run.map(([x, y], i) => `curve.${i === 0 ? 'move' : 'line'}((${cm(sx(x))}, ${cm(sy(y))}))`).join(', ');
      parts.push(`place(curve(stroke: ${stroke}, ${segments}))`);
      if (curve.arrow && run.length > 1) {
        // A filled triangle along the direction of the last segment, in page (cm) coordinates.
        const [x1, y1] = run[run.length - 2], [x2, y2] = run[run.length - 1];
        const ex = sx(x2), ey = sy(y2);
        const dx = ex - sx(x1), dy = ey - sy(y1);
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len, uy = dy / len, size = 0.2;
        const back = [ex - ux * size, ey - uy * size];
        const left = [back[0] - uy * size * 0.55, back[1] + ux * size * 0.55];
        const right = [back[0] + uy * size * 0.55, back[1] - ux * size * 0.55];
        parts.push(`place(polygon(fill: ink, (${cm(ex)}, ${cm(ey)}), (${cm(left[0])}, ${cm(left[1])}), (${cm(right[0])}, ${cm(right[1])})))`);
      }
    }
  }

  for (const dot of spec.dots ?? []) {
    const r = 0.09;
    parts.push(`place(dx: ${cm(sx(dot.x) - r)}, dy: ${cm(sy(dot.y) - r)}, circle(radius: ${cm(r)}, stroke: 1pt + ink, fill: ${dot.open ? 'bg' : 'ink'}))`);
  }

  // The frame clips curves at the window; the context reads the text colour for ink.
  return `#box(inset: (left: 0.5cm, bottom: 0.4cm), context {
  let ink = text.fill
  let faint = ink.transparentize(45%)
  let grid = 0.35pt + ink.transparentize(82%)
  let axis = 0.8pt + ink
  let bg = page.fill
  if bg == none or bg == auto { bg = white }
  box(width: ${cm(w)}, height: ${cm(h)}, {
    place(box(width: ${cm(w)}, height: ${cm(h)}, clip: true, {
      ${parts.filter((p) => !p.includes('box(width: 2cm')).join('\n      ')}
    }))
    ${parts.filter((p) => p.includes('box(width: 2cm')).join('\n    ')}
  })
})`;
}
