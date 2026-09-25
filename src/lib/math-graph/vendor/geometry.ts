import { evaluate, parse } from "./expression.ts";
import { type EndMark, type Graph, type GraphObject, defaultSamples, plotSize } from "./model.ts";
export type XY = [number, number];
/** Adaptive sampling with conservative breaks at unresolved jumps/poles. This is
 * numerical, not symbolic: features narrower than the sampling resolution can be missed. */
export function paths(g: Graph, o: GraphObject): XY[][] {
  const s = g.settings;
  if (o.type === "point") return [];
  if (o.type === "segment") {
    const a = g.objects.find((p) => p.id === o.from),
      b = g.objects.find((p) => p.id === o.to);
    return a?.type === "point" && b?.type === "point"
      ? [
          [
            [a.x, a.y],
            [b.x, b.y],
          ],
        ]
      : [];
  }
  if (o.type === "line")
    return o.vertical
      ? [
          [
            [o.b, s.ymin],
            [o.b, s.ymax],
          ],
        ]
      : [
          [
            [s.xmin, o.m * s.xmin + o.b],
            [s.xmax, o.m * s.xmax + o.b],
          ],
        ];
  const expr = parse(o.expression),
    low = Math.max(s.xmin, o.min ?? s.xmin),
    high = Math.min(s.xmax, o.max ?? s.xmax);
  if (low >= high) return [];
  const span = s.ymax - s.ymin;
  const degrees = s.angles === "degrees";
  const f = (x: number) => evaluate(expr, x, degrees);
  const valid = (y: number) =>
    Number.isFinite(y) && y >= s.ymin - span * 2 && y <= s.ymax + span * 2;
  const out: XY[][] = [];
  let current: XY[] = [];
  function split() {
    if (current.length > 1) out.push(current);
    current = [];
  }
  function edge(a: XY, b: XY, depth: number) {
    const mx = (a[0] + b[0]) / 2,
      my = f(mx),
      mid: XY = [mx, my];
    const finite =
      Number.isFinite(a[1]) && Number.isFinite(b[1]) && Number.isFinite(my);
    const error = finite ? Math.abs(my - (a[1] + b[1]) / 2) : Infinity;
    const suspicious =
      !finite || error > span * 0.001 || Math.abs(a[1] - b[1]) > span * 0.12;
    // Entirely offscreen samples on one side need no further refinement.
    const outside =
      (a[1] > s.ymax + 2 * span &&
        b[1] > s.ymax + 2 * span &&
        my > s.ymax + 2 * span) ||
      (a[1] < s.ymin - 2 * span &&
        b[1] < s.ymin - 2 * span &&
        my < s.ymin - 2 * span);
    if (outside || [a[1], b[1], my].every(Number.isNaN)) {
      split();
      return;
    }
    if (suspicious && depth < 8) {
      edge(a, mid, depth + 1);
      edge(mid, b, depth + 1);
      return;
    }
    if (
      !valid(a[1]) ||
      !valid(b[1]) ||
      !valid(my) ||
      error > span * 0.015 ||
      Math.abs(a[1] - b[1]) > span * 0.3
    ) {
      split();
      return;
    }
    if (!current.length) current.push(a);
    else if (current[current.length - 1][0] !== a[0]) {
      split();
      current.push(a);
    }
    current.push(b);
  }
  const n = s.samples ?? defaultSamples;
  const xs = Array.from(
    { length: n + 1 },
    (_, i) => low + ((high - low) * i) / n,
  );
  if (low < 0 && high > 0) xs.push(0);
  xs.sort((a, b) => a - b);
  for (let i = 1; i < xs.length; i++) {
    const a = xs[i - 1],
      b = xs[i];
    if (a !== b) edge([a, f(a)], [b, f(b)], 0);
  }
  split();
  return out;
}
export interface Piece {
  points: XY[];
  arrowStart: boolean;
  arrowEnd: boolean;
}
export interface Decorated {
  pieces: Piece[];
  marks: { x: number; y: number; open: boolean }[];
}
export function decorated(o: GraphObject): boolean {
  if (o.type === "line") return !!o.exitArrows;
  return (
    o.type === "function" &&
    (!!o.exitArrows ||
      (o.start ?? "none") !== "none" ||
      (o.end ?? "none") !== "none")
  );
}
/** Clips a curve exactly at the top and bottom of the viewport so arrows and
 * endpoint circles sit on the curve itself. Crossings of functions are solved by
 * bisection on the function, not interpolated between samples. */
export function decorate(g: Graph, o: GraphObject): Decorated {
  const s = g.settings,
    raw = paths(g, o).filter((p) => p.length > 1),
    out: Decorated = { pieces: [], marks: [] };
  if (o.type !== "function" && o.type !== "line") return out;
  const exits = !!o.exitArrows,
    start: EndMark = o.type === "function" ? (o.start ?? "none") : "none",
    end: EndMark = o.type === "function" ? (o.end ?? "none") : "none";
  if (o.type === "line" && o.vertical) {
    if (o.b >= s.xmin && o.b <= s.xmax)
      out.pieces = raw.map((points) => ({
        points,
        arrowStart: exits,
        arrowEnd: exits,
      }));
    return insetArrows(g, o, out);
  }
  let f: ((x: number) => number) | undefined;
  if (o.type === "function") {
    const e = parse(o.expression),
      degrees = s.angles === "degrees";
    f = (x) => evaluate(e, x, degrees);
  }
  // Tolerance keeps endpoints that sit on an edge from being lost to rounding.
  const eps = 1e-9 * (s.ymax - s.ymin),
    inside = (p: XY) => p[1] >= s.ymin - eps && p[1] <= s.ymax + eps;
  const level = (p: XY) => (p[1] > s.ymax ? s.ymax : s.ymin);
  const cross = (a: XY, b: XY, y: number): XY => {
    const value =
      f ?? ((x: number) => a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]));
    let lo = a[0],
      hi = b[0];
    const below = value(lo) < y;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (value(mid) < y === below) lo = mid;
      else hi = mid;
    }
    return [(lo + hi) / 2, y];
  };
  const spans: { points: XY[]; startCut: boolean; endCut: boolean }[] = [];
  for (const path of raw) {
    let current: XY[] = [],
      startCut = false;
    const close = (endCut: boolean) => {
      if (current.length > 1) spans.push({ points: current, startCut, endCut });
      current = [];
    };
    if (inside(path[0])) current = [path[0]];
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1],
        b = path[i];
      if (inside(a) && inside(b)) current.push(b);
      else if (inside(a)) {
        current.push(cross(a, b, level(b)));
        close(true);
      } else if (inside(b)) {
        current = [cross(a, b, level(a)), b];
        startCut = true;
      } else if (level(a) !== level(b)) {
        const enter = cross(a, b, level(a));
        current = [enter, cross(enter, b, level(b))];
        startCut = true;
        close(true);
      }
    }
    close(false);
  }
  const first = raw[0]?.[0],
    last = raw.at(-1)?.at(-1),
    edge = (x: number) =>
      Math.abs(x - s.xmin) < 1e-9 * (s.xmax - s.xmin) ||
      Math.abs(x - s.xmax) < 1e-9 * (s.xmax - s.xmin);
  for (const span of spans) {
    const a = span.points[0],
      b = span.points[span.points.length - 1];
    const isFirst = !span.startCut && a === first,
      isLast = !span.endCut && b === last;
    const exitA = span.startCut || edge(a[0]),
      exitB = span.endCut || edge(b[0]);
    const circleA = isFirst && (start === "open" || start === "closed"),
      circleB = isLast && (end === "open" || end === "closed");
    out.pieces.push({
      points: span.points,
      arrowStart:
        (isFirst && start === "arrow") || (exits && exitA && !circleA),
      arrowEnd: (isLast && end === "arrow") || (exits && exitB && !circleB),
    });
    if (circleA) out.marks.push({ x: a[0], y: a[1], open: start === "open" });
    if (circleB) out.marks.push({ x: b[0], y: b[1], open: end === "open" });
  }
  return insetArrows(g, o, out, f);
}
/** Arrowhead size in pt for a line width, shared with the preview's drawing. */
export const arrowSize = (width: number) => 1.6 + 2.2 * width;
/** Pulls arrowed ends back along the curve until the whole arrowhead (a disk of
 * arrowSize around the tip) lies inside the axis box, so clipping never crops it. */
function insetArrows(
  g: Graph,
  o: GraphObject,
  d: Decorated,
  f?: (x: number) => number,
): Decorated {
  const s = g.settings,
    box = plotSize(g),
    cm = (arrowSize(o.width) * 2.54) / 72.27,
    mx = (cm * (s.xmax - s.xmin)) / box.width,
    my = (cm * (s.ymax - s.ymin)) / box.height;
  const clear = (p: XY) =>
    p[0] >= s.xmin + mx &&
    p[0] <= s.xmax - mx &&
    p[1] >= s.ymin + my &&
    p[1] <= s.ymax - my;
  // Points between a (clear) and b follow the curve itself, not the chord.
  const along = (a: XY, b: XY, t: number): XY => {
    const x = a[0] + (b[0] - a[0]) * t;
    return f && a[0] !== b[0] ? [x, f(x)] : [x, a[1] + (b[1] - a[1]) * t];
  };
  const trim = (points: XY[]): XY[] => {
    let i = points.length - 1;
    while (i >= 0 && !clear(points[i])) i--;
    if (i < 0 || i === points.length - 1) return points;
    const a = points[i],
      b = points[i + 1];
    let lo = 0,
      hi = 1;
    for (let k = 0; k < 50; k++) {
      const mid = (lo + hi) / 2;
      if (clear(along(a, b, mid))) lo = mid;
      else hi = mid;
    }
    return [...points.slice(0, i + 1), along(a, b, lo)];
  };
  for (const piece of d.pieces) {
    // A straight line has only its two edge points; its midpoint gives trim a clear point.
    if (piece.points.length === 2 && (piece.arrowStart || piece.arrowEnd)) {
      const [a, b] = piece.points;
      piece.points = [a, along(a, b, 0.5), b];
    }
    if (piece.arrowEnd) piece.points = trim(piece.points);
    if (piece.arrowStart)
      piece.points = trim([...piece.points].reverse()).reverse();
  }
  return d;
}
