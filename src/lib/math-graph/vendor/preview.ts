import { type Graph, plotSize } from "./model.ts";
import {
  worksheetStyle,
  worksheetInk,
  ticks,
  labeledTicks,
  tickLabel,
  piAxis,
  axisCrossing,
} from "./appearance.ts";
import { type XY, arrowSize, decorate, decorated, paths } from "./geometry.ts";
export interface Transform {
  left: number;
  top: number;
  width: number;
  height: number;
  toPixel: (x: number, y: number) => [number, number];
  toGraph: (x: number, y: number) => [number, number];
}
export function render(canvas: HTMLCanvasElement, g: Graph): Transform {
  const rect = canvas.getBoundingClientRect(),
    dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);
  return drawGraph(ctx, g, rect);
}

/** The same drawing operations drive Canvas interaction and vector SVG export. */
export interface DrawingContext {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  lineCap: CanvasLineCap;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void;
  closePath(): void;
  arc(x: number, y: number, r: number, start: number, end: number): void;
  rect(x: number, y: number, width: number, height: number): void;
  clip(): void;
  fill(): void;
  stroke(): void;
  fillRect(x: number, y: number, width: number, height: number): void;
  strokeRect(x: number, y: number, width: number, height: number): void;
  fillText(text: string, x: number, y: number): void;
  setLineDash(dash: number[]): void;
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  rotate(angle: number): void;
}
export function drawGraph(ctx: DrawingContext, g: Graph, rect: { width: number; height: number }): Transform {
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, rect.width, rect.height);
  const s = g.settings,
    box = plotSize(g),
    scale = Math.max(
      1,
      Math.min((rect.width - 100) / s.width, (rect.height - 90) / s.height),
    );
  const width = box.width * scale,
    height = box.height * scale,
    left = (rect.width - width) / 2,
    top = (rect.height - height) / 2;
  const toPixel = (x: number, y: number): [number, number] => [
    left + ((x - s.xmin) / (s.xmax - s.xmin)) * width,
    top + height - ((y - s.ymin) / (s.ymax - s.ymin)) * height,
  ];
  const toGraph = (x: number, y: number): [number, number] => [
    s.xmin + ((x - left) / width) * (s.xmax - s.xmin),
    s.ymin + ((top + height - y) / height) * (s.ymax - s.ymin),
  ];
  const stroke = (a: [number, number], b: [number, number]) => {
    ctx.beginPath();
    ctx.moveTo(...a);
    ctx.lineTo(...b);
    ctx.stroke();
  };
  const pt = (scale * 2.54) / 72.27;
  if (worksheetStyle(g)) {
    const cross = axisCrossing(g),
      [axisX, axisY] = toPixel(cross.x, cross.y);
    const xs = ticks(s.xmin, s.xmax, s.xtick),
      ys = ticks(s.ymin, s.ymax, s.ytick);
    ctx.lineWidth = worksheetInk.gridWidth * pt;
    ctx.strokeStyle = worksheetInk.gridColor;
    ctx.setLineDash([0, pt]);
    ctx.lineCap = "round";
    if (s.grid) {
      for (const x of xs) {
        const px = toPixel(x, 0)[0];
        stroke([px, top], [px, top + height]);
      }
      for (const y of ys) {
        const py = toPixel(0, y)[1];
        stroke([left, py], [left + width, py]);
      }
    }
    ctx.setLineDash([]);
    ctx.lineCap = "butt";
    ctx.strokeStyle = "#000000";
    ctx.fillStyle = "#000000";
    ctx.lineWidth = worksheetInk.axisWidth * pt;
    stroke([left, axisY], [left + width, axisY]);
    stroke([axisX, top + height], [axisX, top]);
    const arrow = (x: number, y: number, vertical: boolean) => {
      ctx.beginPath();
      ctx.moveTo(x, y);
      if (vertical) {
        ctx.lineTo(x - 2.2 * pt, y + 5 * pt);
        ctx.lineTo(x, y + 3.8 * pt);
        ctx.lineTo(x + 2.2 * pt, y + 5 * pt);
      } else {
        ctx.lineTo(x - 5 * pt, y - 2.2 * pt);
        ctx.lineTo(x - 3.8 * pt, y);
        ctx.lineTo(x - 5 * pt, y + 2.2 * pt);
      }
      ctx.closePath();
      ctx.fill();
    };
    arrow(left + width, axisY, false);
    arrow(axisX, top, true);
    ctx.font = `${10 * pt}px Georgia, serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (const x of labeledTicks(g, "x"))
      ctx.fillText(tickLabel(g, "x", x).text, toPixel(x, 0)[0], axisY + 4 * pt);
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (const y of labeledTicks(g, "y"))
      ctx.fillText(tickLabel(g, "y", y).text, axisX - 4 * pt, toPixel(0, y)[1]);
    ctx.font = `${s.xlabel.math ? "italic " : ""}${10 * pt}px Georgia, serif`;
    // PGFPlots' middle-axis defaults: x above the arrow tip, y to the right of it.
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.fillText(s.xlabel.text, left + width, axisY - 3 * pt);
    ctx.font = `${s.ylabel.math ? "italic " : ""}${10 * pt}px Georgia, serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(s.ylabel.text, axisX + 4 * pt, top);
    ctx.font = `${10 * pt}px Georgia, serif`;
    ctx.textBaseline = "alphabetic";
  } else {
    ctx.font = "12px system-ui";
    ctx.lineWidth = 1;
    const labelled = (axis: "x" | "y", v: number) =>
        labeledTicks(g, axis).some(
          (t) => Math.abs(t - v) <= 1e-9 * Math.max(1, Math.abs(v)),
        ),
      tickText = (axis: "x" | "y", v: number) =>
        piAxis(g, axis)
          ? tickLabel(g, axis, v).text
          : Number(v.toPrecision(5)).toString();
    for (
      let i = Math.ceil(s.xmin / s.xtick);
      i <= Math.floor(s.xmax / s.xtick) &&
      i - Math.ceil(s.xmin / s.xtick) <= 200;
      i++
    ) {
      const x = i * s.xtick,
        px = toPixel(x, 0)[0];
      if (s.grid) {
        ctx.strokeStyle = "#e5e7eb";
        stroke([px, top], [px, top + height]);
      }
      ctx.fillStyle = "#444";
      ctx.textAlign = "center";
      if (labelled("x", x))
        ctx.fillText(tickText("x", x), px, top + height + 18);
    }
    for (
      let i = Math.ceil(s.ymin / s.ytick);
      i <= Math.floor(s.ymax / s.ytick) &&
      i - Math.ceil(s.ymin / s.ytick) <= 200;
      i++
    ) {
      const y = i * s.ytick,
        py = toPixel(0, y)[1];
      if (s.grid) {
        ctx.strokeStyle = "#e5e7eb";
        stroke([left, py], [left + width, py]);
      }
      ctx.fillStyle = "#444";
      ctx.textAlign = "right";
      if (labelled("y", y)) ctx.fillText(tickText("y", y), left - 8, py + 4);
    }
    ctx.strokeStyle = "#555";
    ctx.strokeRect(left, top, width, height);
    ctx.fillStyle = "#222";
    ctx.textAlign = "center";
    ctx.fillText(s.xlabel.text, left + width / 2, top + height + 40);
    ctx.save();
    ctx.translate(left - 40, top + height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(s.ylabel.text, 0, 0);
    ctx.restore();
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top, width, height);
  ctx.clip();
  // Physical pt widths track the requested cm scale, as in the TeX output.
  const polyline = (line: XY[]) => {
    ctx.beginPath();
    line.forEach(([x, y], i) => {
      const p = toPixel(x, y);
      if (i === 0) ctx.moveTo(...p);
      else ctx.lineTo(...p);
    });
    ctx.stroke();
  };
  // Approximates TikZ's default "to" tip, which <-> uses in the notes.
  const arrowHead = (line: XY[], atEnd: boolean) => {
    const ordered = atEnd ? line : [...line].reverse(),
      tip = toPixel(...ordered[ordered.length - 1]);
    let back = tip;
    for (let i = ordered.length - 2; i >= 0; i--) {
      back = toPixel(...ordered[i]);
      if (Math.hypot(back[0] - tip[0], back[1] - tip[1]) > 3 * pt) break;
    }
    const len = Math.hypot(back[0] - tip[0], back[1] - tip[1]);
    if (!len) return;
    const ux = (tip[0] - back[0]) / len,
      uy = (tip[1] - back[1]) / len,
      size = arrowSize(ctx.lineWidth / pt) * pt;
    ctx.save();
    ctx.setLineDash([]);
    ctx.lineCap = "round";
    ctx.beginPath();
    for (const side of [-1, 1]) {
      const bx = tip[0] - ux * size - uy * side * size * 0.75,
        by = tip[1] - uy * size + ux * side * size * 0.75;
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(
        tip[0] - ux * size * 0.25,
        tip[1] - uy * size * 0.25,
        tip[0],
        tip[1],
      );
    }
    ctx.stroke();
    ctx.restore();
  };
  const endpoints: (() => void)[] = [];
  let pointsStarted = false;
  for (const o of [
    ...g.objects.filter((o) => o.type !== "point"),
    ...g.objects.filter((o) => o.type === "point"),
  ]) {
    if (o.type === "point" && !pointsStarted) {
      pointsStarted = true;
      // PGFPlots does not clip markers, so circles on the edge stay whole.
      ctx.restore();
      endpoints.forEach((draw) => draw());
    }
    if (!o.visible) continue;
    ctx.strokeStyle = o.color;
    ctx.lineWidth = o.width * pt;
    ctx.setLineDash(o.dashed ? [3 * pt, 3 * pt] : []);
    if (o.type === "point") {
      const [x, y] = toPixel(o.x, o.y);
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(x, y, 2.5 * pt, 0, Math.PI * 2);
      ctx.fillStyle = o.open ? "white" : o.color;
      ctx.fill();
      ctx.stroke();
      if (o.label.text) {
        ctx.fillStyle = "#222";
        ctx.textAlign = "left";
        ctx.fillText(o.label.text, x + 4 * pt, y - 4 * pt);
      }
    } else if (decorated(o)) {
      const d = decorate(g, o);
      for (const piece of d.pieces) {
        polyline(piece.points);
        if (piece.arrowStart) arrowHead(piece.points, false);
        if (piece.arrowEnd) arrowHead(piece.points, true);
      }
      for (const m of d.marks)
        endpoints.push(() => {
          const [x, y] = toPixel(m.x, m.y);
          ctx.setLineDash([]);
          ctx.strokeStyle = o.color;
          ctx.lineWidth = o.width * pt;
          ctx.beginPath();
          ctx.arc(x, y, 2.5 * pt, 0, Math.PI * 2);
          ctx.fillStyle = m.open ? "white" : o.color;
          ctx.fill();
          ctx.stroke();
        });
    } else paths(g, o).forEach(polyline);
  }
  if (!pointsStarted) {
    ctx.restore();
    endpoints.forEach((draw) => draw());
  }
  return { left, top, width, height, toPixel, toGraph };
}
