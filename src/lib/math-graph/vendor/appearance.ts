import { type Graph } from "./model.ts";

/** Worksheet conventions from ap-calc/style/calc.sty and gr-10-adv/math-defs.tex.
 * Missing appearance means the original boxed style, preserving old exports. */
export function worksheetStyle(g: Graph): boolean {
  return g.settings.appearance === "worksheet";
}
export const worksheetInk = {
  axisWidth: 1.2,
  gridWidth: 0.4,
  gridColor: "#808080",
};
export function ticks(min: number, max: number, spacing: number): number[] {
  const start = Math.ceil(min / spacing - 1e-10),
    end = Math.floor(max / spacing + 1e-10);
  return Array.from(
    { length: Math.max(0, Math.min(201, end - start + 1)) },
    (_, i) => Number(((start + i) * spacing).toPrecision(12)),
  );
}
/** v as a rational multiple of pi, [p, q] with q <= 12, or null. */
export function piFraction(v: number): [number, number] | null {
  if (!Number.isFinite(v) || v === 0) return null;
  const r = v / Math.PI;
  for (let q = 1; q <= 12; q++) {
    const p = Math.round(r * q);
    if (p !== 0 && Math.abs(r * q - p) < 1e-9 * Math.abs(p)) return [p, q];
  }
  return null;
}
/** Tick spacing typed as pi, pi/2, 2pi/3, ... labels that axis in multiples of pi. */
export function piAxis(g: Graph, axis: "x" | "y"): boolean {
  return piFraction(g.settings[`${axis}tick`]) !== null;
}
/** Text for a number that is a pi multiple, e.g. "3pi/2"; plain numbers are unchanged. */
export function piText(v: number, pi = "pi"): string {
  const f = piFraction(v);
  if (!f) return String(v);
  const [p, q] = f,
    sign = p < 0 ? "-" : "",
    n = Math.abs(p);
  return `${sign}${n === 1 ? "" : n}${pi}${q === 1 ? "" : `/${q}`}`;
}
/** Tick label as TeX math (without dollars) and as preview text. */
export function tickLabel(
  g: Graph,
  axis: "x" | "y",
  v: number,
): { tex: string; text: string } {
  const f = piAxis(g, axis) ? piFraction(v) : null;
  if (!f)
    return {
      tex: `\\pgfmathprintnumber{${Number(v.toPrecision(12))}}`,
      text: String(Number(v.toPrecision(12))),
    };
  const [p, q] = f,
    sign = p < 0 ? "-" : "",
    n = Math.abs(p),
    top = `${n === 1 ? "" : n}\\pi`;
  return {
    tex: sign + (q === 1 ? top : `\\frac{${top}}{${q}}`),
    text: piText(v, "π"),
  };
}
export function labeledTicks(g: Graph, axis: "x" | "y"): number[] {
  const s = g.settings,
    values = ticks(s[`${axis}min`], s[`${axis}max`], s[`${axis}tick`]);
  const mode = s.tickLabels ?? (worksheetStyle(g) ? "end" : "all");
  if (mode === "none") return [];
  // First tick only: the first positive tick in view, else the nonzero tick nearest zero.
  if (mode === "one") {
    const nonzero = values.filter((v) => v !== 0),
      first =
        nonzero.find((v) => v > 0) ??
        nonzero.reduce<number | undefined>(
          (best, v) =>
            best === undefined || Math.abs(v) < Math.abs(best) ? v : best,
          undefined,
        );
    return first === undefined ? [] : [first];
  }
  if (mode === "end") {
    const last = values.at(-1);
    return last === undefined || last === 0 ? [] : [last];
  }
  return worksheetStyle(g) ? values.filter((v) => v !== 0) : values;
}
/** PGFPlots places a middle axis on the nearest edge when zero is offscreen. */
export function axisCrossing(g: Graph) {
  const s = g.settings;
  return {
    x: Math.max(s.xmin, Math.min(s.xmax, 0)),
    y: Math.max(s.ymin, Math.min(s.ymax, 0)),
  };
}
