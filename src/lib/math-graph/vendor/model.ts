import { parse } from "./expression.ts";
/** Decoration at a function's domain endpoint. */
export type EndMark = "none" | "arrow" | "open" | "closed";
export interface Label {
  text: string;
  math: boolean;
}
export interface Style {
  color: string;
  width: number;
  dashed: boolean;
  visible: boolean;
}
interface Base extends Style {
  id: string;
}
export type GraphObject =
  | (Base & {
      type: "function";
      expression: string;
      min: number | null;
      max: number | null;
      start?: EndMark;
      end?: EndMark;
      exitArrows?: boolean;
    })
  | (Base & {
      type: "point";
      name: string;
      x: number;
      y: number;
      label: Label;
      open: boolean;
    })
  | (Base & {
      type: "line";
      vertical: boolean;
      m: number;
      b: number;
      exitArrows?: boolean;
    })
  | (Base & { type: "segment"; from: string; to: string });
export interface Graph {
  version: 1;
  settings: {
    appearance?: "worksheet" | "classic";
    tickLabels?: "all" | "one" | "end" | "none";
    /** Sample intervals per function before adaptive refinement. */
    samples?: number;
    angles?: "radians" | "degrees";
    /** Editing aid only: dragged points snap to multiples of snapStep. */
    snap?: boolean;
    snapStep?: number;
    /** Zoom re-picks this axis's tick spacing only while true; editing the spacing clears it. */
    xtickAuto?: boolean;
    ytickAuto?: boolean;
    xmin: number;
    xmax: number;
    ymin: number;
    ymax: number;
    xtick: number;
    ytick: number;
    grid: boolean;
    equal: boolean;
    width: number;
    height: number;
    xlabel: Label;
    ylabel: Label;
  };
  objects: GraphObject[];
}
export const style: Style = {
  color: "#000000",
  width: 0.8,
  dashed: false,
  visible: true,
};
export const defaultSamples = 160;
export const defaultSnapStep = 0.5;
export const label = (text: string): Label => ({ text, math: false });
export function initialGraph(): Graph {
  return {
    version: 1,
    settings: {
      appearance: "worksheet",
      tickLabels: "end",
      samples: defaultSamples,
      angles: "radians",
      snap: true,
      snapStep: defaultSnapStep,
      xmin: -5.2,
      xmax: 5.2,
      ymin: -5.2,
      ymax: 5.2,
      xtick: 1,
      ytick: 1,
      grid: true,
      equal: true,
      width: 10,
      height: 10,
      xlabel: { text: "x", math: true },
      ylabel: { text: "y", math: true },
    },
    objects: [],
  };
}
const number = (v: unknown, name: string, min = -1e6, max = 1e6) => {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max)
    throw Error(`${name} must be a finite number between ${min} and ${max}.`);
};
const string = (v: unknown, name: string, max = 500) => {
  if (typeof v !== "string" || v.length > max)
    throw Error(`${name} must be text (at most ${max} characters).`);
};
const bool = (v: unknown, name: string) => {
  if (typeof v !== "boolean") throw Error(`${name} must be true or false.`);
};
function checkLabel(v: Label, name: string) {
  if (!v || typeof v !== "object") throw Error(`Missing ${name}.`);
  string(v.text, name, 120);
  bool(v.math, name);
  // Deliberately small math-label language: symbols and simple fractions, no arbitrary TeX commands.
  if (v.math) {
    if (/[^a-zA-Z0-9\s\\{}_^+\-=().,|/]/.test(v.text))
      throw Error(`${name}: unsupported math-label character.`);
    const commands = v.text.match(/\\[a-zA-Z]+|\\[^a-zA-Z]/g) ?? [];
    if (
      commands.some(
        (c) =>
          ![
            "\\alpha",
            "\\beta",
            "\\theta",
            "\\pi",
            "\\Delta",
            "\\infty",
            "\\sin",
            "\\cos",
            "\\tan",
            "\\ln",
            "\\sqrt",
            "\\frac",
            "\\cdot",
            "\\pm",
          ].includes(c),
      )
    )
      throw Error(`${name}: unsupported math-label command.`);
    let depth = 0;
    for (const c of v.text) {
      if (c === "{") depth++;
      if (c === "}" && --depth < 0) throw Error(`${name}: unbalanced braces.`);
    }
    if (depth) throw Error(`${name}: unbalanced braces.`);
  }
}
export function validate(value: unknown): Graph {
  if (!value || typeof value !== "object")
    throw Error("Graph metadata must be an object.");
  const g = value as Graph;
  if (g.version !== 1)
    throw Error(
      `Unsupported graph metadata version: ${String(g.version)} (supported: 1).`,
    );
  if (!g.settings || !Array.isArray(g.objects) || g.objects.length > 100)
    throw Error(
      "Malformed graph: settings and up to 100 objects are required.",
    );
  const s = g.settings;
  if (
    s.appearance !== undefined &&
    !["worksheet", "classic"].includes(s.appearance)
  )
    throw Error("Unknown graph appearance.");
  if (
    s.tickLabels !== undefined &&
    !["all", "one", "end", "none"].includes(s.tickLabels)
  )
    throw Error("Unknown tick label mode.");
  if (s.samples !== undefined) {
    number(s.samples, "Resolution (samples)", 20, 1000);
    if (!Number.isInteger(s.samples))
      throw Error("Resolution (samples) must be a whole number.");
  }
  if (s.angles !== undefined && !["radians", "degrees"].includes(s.angles))
    throw Error("Angles must be radians or degrees.");
  if (s.snap !== undefined) bool(s.snap, "Snap");
  if (s.snapStep !== undefined) number(s.snapStep, "Snap step", 1e-4, 1e4);
  if (s.xtickAuto !== undefined) bool(s.xtickAuto, "Auto x tick");
  if (s.ytickAuto !== undefined) bool(s.ytickAuto, "Auto y tick");
  for (const k of ["xmin", "xmax", "ymin", "ymax"] as const) number(s[k], k);
  if (s.xmax - s.xmin < 1e-5 || s.ymax - s.ymin < 1e-5)
    throw Error("Axis maximum must exceed minimum by at least 0.00001.");
  number(s.xtick, "x tick", 1e-5);
  number(s.ytick, "y tick", 1e-5);
  if ((s.xmax - s.xmin) / s.xtick > 200 || (s.ymax - s.ymin) / s.ytick > 200)
    throw Error("Use at most 200 ticks per axis.");
  number(s.width, "Width (cm)", 2, 40);
  number(s.height, "Height (cm)", 2, 40);
  bool(s.grid, "Grid");
  bool(s.equal, "Equal scaling");
  checkLabel(s.xlabel, "x label");
  checkLabel(s.ylabel, "y label");
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const o of g.objects) {
    if (!o || typeof o !== "object") throw Error("Malformed graph object.");
    string(o.id, "Object ID", 80);
    if (!o.id || ids.has(o.id))
      throw Error("Object IDs must be nonempty and unique.");
    ids.add(o.id);
    if (typeof o.color !== "string" || !/^#[0-9a-f]{6}$/i.test(o.color))
      throw Error("Colour must be a six-digit hex code.");
    number(o.width, "Line width (pt)", 0.1, 6);
    bool(o.dashed, "Dashed");
    bool(o.visible, "Visibility");
    switch (o.type) {
      case "function":
        string(o.expression, "Expression");
        parse(o.expression);
        if (o.min !== null) number(o.min, "Domain minimum");
        if (o.max !== null) number(o.max, "Domain maximum");
        if (o.min !== null && o.max !== null && o.min >= o.max)
          throw Error("Function domain minimum must be less than maximum.");
        for (const mark of [o.start, o.end])
          if (
            mark !== undefined &&
            !["none", "arrow", "open", "closed"].includes(mark)
          )
            throw Error("Unknown endpoint style.");
        if (o.exitArrows !== undefined) bool(o.exitArrows, "Exit arrows");
        break;
      case "point":
        string(o.name, "Point name", 40);
        if (!o.name || names.has(o.name))
          throw Error("Point names must be nonempty and unique.");
        names.add(o.name);
        number(o.x, "Point x");
        number(o.y, "Point y");
        checkLabel(o.label, "Point label");
        bool(o.open, "Open marker");
        break;
      case "line":
        bool(o.vertical, "Vertical");
        number(o.m, "Slope");
        number(o.b, "Intercept / x constant");
        if (o.exitArrows !== undefined) bool(o.exitArrows, "Exit arrows");
        break;
      case "segment":
        string(o.from, "Segment start");
        string(o.to, "Segment end");
        break;
      default:
        throw Error("Unsupported graph object type.");
    }
  }
  for (const o of g.objects)
    if (
      o.type === "segment" &&
      (!g.objects.some((p) => p.type === "point" && p.id === o.from) ||
        !g.objects.some((p) => p.type === "point" && p.id === o.to))
    )
      throw Error("Segments must reference two existing points.");
  return g;
}
/** A 1, 2 or 5 x 10^k spacing giving at most 12 ticks across range. */
export function niceTick(range: number): number {
  const base = 10 ** Math.floor(Math.log10(range / 10));
  return [1, 2, 5, 10].map((v) => v * base).find((v) => range / v <= 12)!;
}
/** Whether zoom may re-pick an axis's tick spacing. Files without the flag count a
 * 1/2/5 x 10^k spacing as automatic and anything else (such as pi/2) as chosen. */
export function autoTick(g: Graph, axis: "x" | "y"): boolean {
  const s = g.settings,
    flag = s[`${axis}tickAuto`];
  if (flag !== undefined) return flag;
  const v = s[`${axis}tick`],
    mantissa = v / 10 ** Math.floor(Math.log10(v));
  return [1, 2, 5, 10].some((n) => Math.abs(mantissa - n) < 1e-9);
}
/** Equal scaling fits a smaller plotting rectangle inside the requested physical box. */
export function plotSize(g: Graph) {
  const s = g.settings;
  let width = s.width,
    height = s.height;
  if (s.equal) {
    const unit = Math.min(
      width / (s.xmax - s.xmin),
      height / (s.ymax - s.ymin),
    );
    width = unit * (s.xmax - s.xmin);
    height = unit * (s.ymax - s.ymin);
  }
  return { width, height };
}
