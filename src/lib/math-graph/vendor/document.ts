import { type Graph, validate } from "./model.ts";
import { latex } from "./latex.ts";
const START = "% MATH-GRAPH BEGIN v1";
const META = "% MATH-GRAPH MODEL ";
const BODY = "% MATH-GRAPH GENERATED";
const END = "% MATH-GRAPH END";
export interface Decoded {
  graph: Graph;
  start: number;
  end: number;
  modified: boolean;
}
export function region(g: Graph): string {
  validate(g);
  return `${START}\n${META}${JSON.stringify(g)}\n${BODY}\n${latex(g)}${END}`;
}
export function createDocument(g: Graph): string {
  return (
    "% Requires \\usepackage{pgfplots} and \\pgfplotsset{compat=1.18}.\n" +
    region(g) +
    "\n"
  );
}
export function readDocument(text: string): Decoded {
  if (text.length > 5_000_000)
    throw Error("Graph file exceeds the 5 MB limit.");
  const starts = [...text.matchAll(/^% MATH-GRAPH BEGIN[^\r\n]*\r?$/gm)];
  const ends = [...text.matchAll(/^% MATH-GRAPH END\r?$/gm)];
  if (starts.length !== 1 || ends.length !== 1)
    throw Error(
      "Expected exactly one Math Graph region. Arbitrary TikZ cannot be reopened visually.",
    );
  if (starts[0][0].trim() !== START)
    throw Error("Unsupported Math Graph region version.");
  const start = starts[0].index!,
    end = ends[0].index! + ends[0][0].replace(/\r$/, "").length;
  if (end <= start) throw Error("Malformed Math Graph region.");
  const block = text.slice(start, end).replace(/\r\n/g, "\n");
  const lines = block.split("\n");
  if (!lines[1]?.startsWith(META) || lines[2] !== BODY)
    throw Error("Missing or malformed graph metadata comments.");
  let data: unknown;
  try {
    data = JSON.parse(lines[1].slice(META.length));
  } catch {
    throw Error("Graph metadata is not valid JSON.");
  }
  const graph = validate(data);
  return {
    graph,
    start,
    end,
    modified: lines.slice(3, -1).join("\n") + "\n" !== latex(graph),
  };
}
export function replaceGraph(text: string, g: Graph, force = false): string {
  const d = readDocument(text);
  if (d.modified && !force)
    throw Error(
      "The generated region was edited manually. Restore it or explicitly regenerate from metadata.",
    );
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  return (
    text.slice(0, d.start) + region(g).replace(/\n/g, eol) + text.slice(d.end)
  );
}
