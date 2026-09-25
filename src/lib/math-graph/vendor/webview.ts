import {
  type Graph,
  type GraphObject,
  type Label,
  initialGraph,
  style,
  label,
  validate,
  defaultSamples,
  defaultSnapStep,
  type EndMark,
  autoTick,
  niceTick,
} from "./model.ts";
import { render, type Transform } from "./preview.ts";
import { constant } from "./expression.ts";
import { piText } from "./appearance.ts";
declare function acquireVsCodeApi(): {
  postMessage: (m: unknown) => void;
  getState: () => any;
  setState: (s: unknown) => void;
};
const api = acquireVsCodeApi();
const app = document.getElementById("app")!;
app.innerHTML = `<header><strong>Math Graph</strong><button id="source">Download .tkz</button><button id="save" class="primary">Use graph</button></header>
<div class="layout"><aside><div class="toolbar"><button id="add-function">+ Function</button><button id="add-point">+ Point</button><button id="add-line">+ Line</button><button id="add-segment">+ Segment</button></div><div id="objects"></div><details open><summary>Axes &amp; worksheet size</summary><div id="settings"></div></details><p class="hint"><span id="angle-hint">Radians</span> · powers: x^2 · implicit multiplication: 2x<br>sin, cos, tan, sqrt, abs, exp, ln, pi</p></aside><section class="plot-panel"><div id="status" role="status" aria-live="polite">Loading graph…</div><div id="recovery"><button id="reload" hidden>Discard local draft and reload</button><button id="regenerate" hidden>Regenerate from saved metadata…</button></div><canvas id="plot" aria-label="Interactive graph. Drag points to move them; drag background to pan; scroll to zoom." tabindex="0"></canvas><p class="hint">Drag the background to pan, scroll to zoom, or drag a point. Precise values are editable on the left. Use graph inserts into your question. Undo/Redo applies to graph changes.<br>Labels use browser typography; math labels show their TeX source here. The axis box fits inside the requested cm dimensions; labels add outer space.</p></section></div>`;
const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
let graph: Graph = initialGraph(),
  version = 0,
  loaded = false,
  blocked = false,
  dirty = false,
  pending: number | undefined,
  serial = 0,
  transform: Transform;
let timer: ReturnType<typeof setTimeout> | undefined;
const restored = api.getState();
let rawFields: Record<string, string> = restored?.rawFields ?? {};
/** Function and line cards start collapsed to their equation; this is view state only. */
const expanded = new Set<string>(restored?.expanded ?? []);
function status(message: string, error = false) {
  $("status").textContent = message;
  $("status").classList.toggle("error", error);
}
function persist() {
  api.setState({
    draft: dirty || pending !== undefined ? graph : null,
    version,
    rawFields,
    expanded: [...expanded],
  });
}
function draw() {
  if (loaded) transform = render($<HTMLCanvasElement>("plot"), graph);
}
function validateDraft() {
  try {
    validate(graph);
    return true;
  } catch (e) {
    status(String(e), true);
    return false;
  }
}
function changed(rebuild = false) {
  dirty = true;
  persist();
  if (blocked) {
    status(
      "Local draft retained. Resolve the document conflict before applying changes.",
      true,
    );
    if (rebuild) build();
    return;
  }
  if (validateDraft()) {
    rawFields = {};
    persist();
    draw();
    status("Updating graph…");
    clearTimeout(timer);
    timer = setTimeout(flush, 250);
  }
  if (rebuild) build();
}
function flush() {
  if (!loaded || blocked || pending !== undefined || !dirty || !validateDraft())
    return;
  pending = ++serial;
  dirty = false;
  api.postMessage({ type: "edit", graph, version, id: pending });
  persist();
}
function button(text: string, run: () => void) {
  const b = document.createElement("button");
  b.textContent = text;
  b.onclick = run;
  return b;
}
function row(parent: HTMLElement) {
  const r = document.createElement("div");
  r.className = "row";
  parent.append(r);
  return r;
}
function field(
  parent: HTMLElement,
  title: string,
  value: string | number | null,
  onInput: (v: string) => void,
  type = "text",
) {
  const l = document.createElement("label");
  l.textContent = title;
  const i = document.createElement("input");
  i.type = type;
  const key =
    (parent.closest<HTMLElement>(".card")?.dataset.id ?? "settings") +
    ":" +
    title;
  i.value = rawFields[key] ?? (value === null ? "" : String(value));
  i.setAttribute("aria-label", title);
  i.addEventListener("input", () => {
    rawFields[key] = i.value;
    onInput(i.value);
    changed();
  });
  l.append(i);
  parent.append(l);
  return i;
}
/** Arrow-button step: the snap step while snapping, otherwise 0.1. */
const nudge = () =>
  graph.settings.snap ? (graph.settings.snapStep ?? defaultSnapStep) : 0.1;
/** Adds up/down buttons (and arrow keys) that move to the next multiple of step. */
function stepper(
  input: HTMLInputElement,
  title: string,
  step: () => number,
  blank = () => 0,
) {
  const wrap = document.createElement("span");
  wrap.className = "stepper";
  input.replaceWith(wrap);
  const spin = document.createElement("span");
  spin.className = "spin";
  const go = (direction: 1 | -1) => {
    const size = step(),
      current = input.value.trim() === "" ? blank() : constant(input.value);
    if (!Number.isFinite(current) || !(size > 0)) return;
    const q = current / size,
      next = direction > 0 ? Math.floor(q + 1e-9) + 1 : Math.ceil(q - 1e-9) - 1;
    input.value = piText(Number((next * size).toPrecision(12)));
    input.dispatchEvent(new Event("input"));
  };
  for (const [text, direction, name] of [
    ["▲", 1, "Increase"],
    ["▼", -1, "Decrease"],
  ] as const) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = text;
    b.tabIndex = -1;
    b.setAttribute("aria-label", `${name} ${title}`);
    b.onmousedown = (e) => e.preventDefault();
    b.onclick = () => go(direction);
    spin.append(b);
  }
  input.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    go(e.key === "ArrowUp" ? 1 : -1);
  });
  wrap.append(input, spin);
  return input;
}
function numeric(
  parent: HTMLElement,
  title: string,
  value: number | null,
  onInput: (v: number) => void,
  step: () => number = nudge,
) {
  // Accepts constants such as pi/2 or 2pi/3; pi multiples display as typed.
  const i = field(parent, title, value === null ? null : piText(value), (v) =>
    onInput(constant(v)),
  );
  i.inputMode = "decimal";
  return stepper(i, title, step);
}
function check(
  parent: HTMLElement,
  title: string,
  value: boolean,
  onInput: (v: boolean) => void,
) {
  const l = document.createElement("label"),
    i = document.createElement("input");
  i.type = "checkbox";
  i.checked = value;
  i.onchange = () => {
    onInput(i.checked);
    changed();
  };
  l.append(i, document.createTextNode(" " + title));
  parent.append(l);
  return i;
}
function select(
  parent: HTMLElement,
  title: string,
  value: string,
  options: [string, string][],
  onInput: (v: string) => void,
) {
  const l = document.createElement("label");
  l.textContent = title;
  const input = document.createElement("select");
  input.setAttribute("aria-label", title);
  for (const [key, text] of options) {
    const o = document.createElement("option");
    o.value = key;
    o.textContent = text;
    input.append(o);
  }
  input.value = value;
  input.onchange = () => {
    onInput(input.value);
    changed(true);
  };
  l.append(input);
  parent.append(l);
}
function labelField(parent: HTMLElement, title: string, l: Label) {
  const r = row(parent);
  r.classList.add("label-row");
  field(r, title, l.text, (v) => (l.text = v));
  check(r, "TeX math", l.math, (v) => (l.math = v));
}
function build() {
  const objects = $("objects");
  objects.replaceChildren();
  if (!graph.objects.length) {
    const empty = document.createElement("p");
    empty.className = "hint";
    empty.id = "empty-graph";
    empty.textContent = "Blank graph. Add a function, point, or line to begin.";
    objects.append(empty);
  }
  for (const o of graph.objects) {
    const card = document.createElement("div");
    card.className = "card";
    card.dataset.id = o.id;
    const head = document.createElement("div");
    head.className = "card-title";
    const remove = button("×", () => {
      if (
        o.type === "point" &&
        graph.objects.some(
          (p) => p.type === "segment" && (p.from === o.id || p.to === o.id),
        )
      ) {
        status("Remove segments attached to this point first.", true);
        return;
      }
      graph.objects = graph.objects.filter((p) => p.id !== o.id);
      expanded.delete(o.id);
      changed(true);
    });
    remove.className = "remove";
    remove.setAttribute("aria-label", "Delete " + o.type);
    card.append(head);
    // Functions and lines collapse to their equation; the rest sits behind the toggle.
    let body: HTMLElement = card;
    if (o.type === "function" || o.type === "line") {
      const open = expanded.has(o.id),
        toggle = button(open ? "▾" : "▸", () => {
          if (open) expanded.delete(o.id);
          else expanded.add(o.id);
          persist();
          build();
        });
      toggle.className = "toggle";
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", `More ${o.type} options`);
      head.classList.add("equation");
      head.append(toggle);
      if (o.type === "function")
        field(head, "y =", o.expression, (v) => (o.expression = v));
      else if (o.vertical) numeric(head, "x =", o.b, (v) => (o.b = v));
      else {
        numeric(head, "y =", o.m, (v) => (o.m = v));
        numeric(head, "x +", o.b, (v) => (o.b = v));
      }
      const show = document.createElement("input");
      show.type = "checkbox";
      show.checked = o.visible;
      show.title = "Show";
      show.setAttribute("aria-label", "Show");
      show.onchange = () => {
        o.visible = show.checked;
        changed();
      };
      head.append(show, remove);
      if (!open) {
        objects.append(card);
        continue;
      }
      body = document.createElement("div");
      body.className = "card-body";
      card.append(body);
    } else {
      const title = document.createElement("strong");
      title.textContent =
        o.type === "point"
          ? `Point ${o.name}`
          : o.type[0].toUpperCase() + o.type.slice(1);
      head.append(title);
      check(head, "Show", o.visible, (v) => (o.visible = v));
      head.append(remove);
    }
    if (o.type === "function") {
      const r = row(body);
      for (const [title, key, edge] of [
        ["Domain min (blank = axis)", "min", "xmin"],
        ["Domain max (blank = axis)", "max", "xmax"],
      ] as const)
        stepper(
          field(
            r,
            title,
            o[key] === null ? null : piText(o[key]),
            (v) => (o[key] = v.trim() === "" ? null : constant(v)),
          ),
          title,
          nudge,
          () => graph.settings[edge],
        );
      const ends: [string, string][] = [
        ["none", "None"],
        ["arrow", "Arrow"],
        ["open", "Open circle"],
        ["closed", "Filled circle"],
      ];
      const e = row(body);
      select(
        e,
        "Left end",
        o.start ?? "none",
        ends,
        (v) => (o.start = v as EndMark),
      );
      select(
        e,
        "Right end",
        o.end ?? "none",
        ends,
        (v) => (o.end = v as EndMark),
      );
      check(
        body,
        "Arrows where it leaves the graph",
        o.exitArrows ?? false,
        (v) => (o.exitArrows = v),
      );
    } else if (o.type === "point") {
      field(card, "Name", o.name, (v) => (o.name = v));
      const r = row(card);
      numeric(r, "x", o.x, (v) => (o.x = v));
      numeric(r, "y", o.y, (v) => (o.y = v));
      labelField(card, "Label", o.label);
      check(card, "Open marker", o.open, (v) => (o.open = v));
    } else if (o.type === "line") {
      select(
        body,
        "Equation",
        o.vertical ? "vertical" : "slope",
        [
          ["slope", "y = mx + b"],
          ["vertical", "x = c"],
        ],
        (v) => (o.vertical = v === "vertical"),
      );
      check(
        body,
        "Arrows where it leaves the graph",
        o.exitArrows ?? false,
        (v) => (o.exitArrows = v),
      );
    } else {
      const points = graph.objects
        .filter((p) => p.type === "point")
        .map((p) => [p.id, p.name] as [string, string]);
      select(card, "From point", o.from, points, (v) => (o.from = v));
      select(card, "To point", o.to, points, (v) => (o.to = v));
    }
    const r = row(body);
    field(r, "Colour", o.color, (v) => (o.color = v), "color");
    numeric(
      r,
      "Width (pt)",
      o.width,
      (v) => (o.width = v),
      () => 0.1,
    );
    check(body, "Dashed", o.dashed, (v) => (o.dashed = v));
    objects.append(card);
  }
  const parent = $("settings");
  parent.replaceChildren();
  const s = graph.settings;
  select(
    parent,
    "Graph style",
    s.appearance ?? "classic",
    [
      ["worksheet", "Worksheet"],
      ["classic", "Classic boxed"],
    ],
    (v) => {
      s.appearance = v as "worksheet" | "classic";
      s.tickLabels = v === "worksheet" ? "end" : "all";
    },
  );
  select(
    parent,
    "Number labels",
    s.tickLabels ?? (s.appearance === "worksheet" ? "end" : "all"),
    [
      ["all", "Every unit"],
      ["one", "First tick only"],
      ["end", "Highest visible value"],
      ["none", "None"],
    ],
    (v) => (s.tickLabels = v as "all" | "one" | "end" | "none"),
  );
  select(
    parent,
    "Angles",
    s.angles ?? "radians",
    [
      ["radians", "Radians"],
      ["degrees", "Degrees"],
    ],
    (v) => (s.angles = v as "radians" | "degrees"),
  );
  $("angle-hint").textContent = s.angles === "degrees" ? "Degrees" : "Radians";
  numeric(
    parent,
    "Resolution (samples)",
    s.samples ?? defaultSamples,
    (v) => (s.samples = v),
    () => 10,
  );
  const snapRow = row(parent);
  check(snapRow, "Snap when dragging", s.snap ?? false, (v) => (s.snap = v));
  numeric(
    snapRow,
    "Snap step",
    s.snapStep ?? defaultSnapStep,
    (v) => (s.snapStep = v),
    () => 0.1,
  );
  const autos: Partial<Record<"x" | "y", HTMLInputElement>> = {};
  for (const pair of [
    ["xmin", "xmax"],
    ["ymin", "ymax"],
    ["xtick", "ytick"],
    ["width", "height"],
  ] as const) {
    const r = row(parent);
    for (const k of pair)
      numeric(
        r,
        (
          {
            width: "Width (cm)",
            height: "Height (cm)",
            xtick: "x tick",
            ytick: "y tick",
          } as Record<string, string>
        )[k] ?? k,
        s[k],
        (v) => {
          s[k] = v;
          // A spacing chosen by hand (typed or stepped) is kept when zooming.
          if (k === "xtick" || k === "ytick") {
            const axis = k[0] as "x" | "y";
            s[`${axis}tickAuto`] = false;
            if (autos[axis]) autos[axis]!.checked = false;
          }
        },
      );
    if (pair[0] === "xtick") {
      const a = row(parent);
      for (const axis of ["x", "y"] as const)
        autos[axis] = check(
          a,
          `Auto ${axis} tick`,
          autoTick(graph, axis),
          (v) => {
            s[`${axis}tickAuto`] = v;
            if (v)
              s[`${axis}tick`] = niceTick(s[`${axis}max`] - s[`${axis}min`]);
            build();
          },
        );
    }
  }
  const r = row(parent);
  check(r, "Grid", s.grid, (v) => (s.grid = v));
  check(r, "Equal axis scaling", s.equal, (v) => (s.equal = v));
  labelField(parent, "x axis label", s.xlabel);
  labelField(parent, "y axis label", s.ylabel);
}
function add(type: GraphObject["type"]) {
  if (!loaded || blocked) return;
  const base = {
    ...style,
    id: crypto.randomUUID(),
  };
  let o: GraphObject;
  if (type === "function")
    o = { ...base, type, expression: "sin(x)", min: null, max: null };
  else if (type === "point") {
    let n = 1;
    while (graph.objects.some((p) => p.type === "point" && p.name === `P${n}`))
      n++;
    o = {
      ...base,
      type,
      name: `P${n}`,
      x: 0,
      y: 0,
      label: label(`P${n}`),
      open: false,
    };
  } else if (type === "line")
    o = { ...base, type, vertical: false, m: 1, b: 0 };
  else {
    const p = graph.objects.filter((p) => p.type === "point");
    if (p.length < 2) {
      status("Add two points before creating a segment.", true);
      return;
    }
    o = { ...base, type, from: p[0].id, to: p[1].id };
  }
  graph.objects.push(o);
  changed(true);
}
for (const type of ["function", "point", "line", "segment"] as const)
  $("add-" + type).onclick = () => add(type);
$("source").onclick = () => api.postMessage({ type: "source" });
let saveRequested = false;
$("save").onclick = () => {
  if (blocked || !validateDraft()) {
    status("Resolve the graph error before saving your visual draft.", true);
    return;
  }
  saveRequested = true;
  flush();
  if (pending === undefined) {
    api.postMessage({ type: "save" });
    saveRequested = false;
  }
};
$("reload").onclick = () => {
  dirty = false;
  blocked = false;
  api.setState(null);
  api.postMessage({ type: "reload" });
};
$("regenerate").onclick = () => {
  if (pending === undefined) {
    pending = ++serial;
    api.postMessage({ type: "regenerate", version, id: pending });
  }
};
window.addEventListener("message", (event) => {
  const msg = event.data;
  if (msg.type !== "document" && msg.type !== "error") return;
  const ack = msg.ack !== undefined && msg.ack === pending;
  if (ack) pending = undefined;
  if (msg.type === "error") {
    blocked = true;
    dirty = true;
    persist();
    status(msg.message, true);
    $("reload").hidden = false;
    return;
  }
  if (msg.resetDraft) {
    rawFields = {};
    dirty = false;
    graph = msg.graph;
    build();
  }
  const first = !loaded;
  loaded = true;
  if (!first && !ack && (dirty || pending !== undefined)) {
    blocked = true;
    status(
      "The source changed while a local draft was pending. Your draft is retained. Discard it and reload to use the document version.",
      true,
    );
    $("reload").hidden = false;
    return;
  }
  version = msg.version;
  blocked = msg.modified;
  $("regenerate").hidden = !msg.modified;
  $("reload").hidden = !msg.modified;
  if (first && restored?.draft) {
    graph = restored.draft;
    dirty = true;
    build();
    if (restored.version !== version) {
      blocked = true;
      status(
        "Recovered a local draft from a different document version. Discard and reload to use the current file.",
        true,
      );
      $("reload").hidden = false;
      return;
    }
  } else if (!ack) {
    rawFields = {};
    graph = msg.graph;
    build();
  }
  if (validateDraft()) draw();
  if (blocked)
    status(
      "Manual changes detected inside the generated region. Visual changes are blocked. Open the source or explicitly regenerate from saved metadata.",
      true,
    );
  else if (dirty) flush();
  else status("Graph ready · use Undo/Redo or insert into the question.");
  persist();
  if (saveRequested && !dirty && pending === undefined && !blocked) {
    api.postMessage({ type: "save" });
    saveRequested = false;
  }
});
const canvas = $<HTMLCanvasElement>("plot");
let drag:
  | {
      pixel: [number, number];
      /** Graph units per pixel when the drag began; panning keeps the scale. */
      unit: [number, number];
      original: Graph;
      point?: string;
    }
  | undefined;
const local = (e: MouseEvent) => {
  const r = canvas.getBoundingClientRect();
  return [e.clientX - r.left, e.clientY - r.top] as [number, number];
};
canvas.onpointerdown = (e) => {
  if (!loaded || blocked || !validateDraft()) return;
  const p = local(e);
  if (
    p[0] < transform.left ||
    p[0] > transform.left + transform.width ||
    p[1] < transform.top ||
    p[1] > transform.top + transform.height
  )
    return;
  const point = graph.objects.find(
    (o) =>
      o.type === "point" &&
      o.visible &&
      Math.hypot(...transform.toPixel(o.x, o.y).map((v, i) => v - p[i])) < 12,
  );
  const s = graph.settings;
  drag = {
    pixel: p,
    unit: [
      (s.xmax - s.xmin) / transform.width,
      (s.ymax - s.ymin) / transform.height,
    ],
    original: structuredClone(graph),
    point: point?.id,
  };
  canvas.setPointerCapture(e.pointerId);
};
canvas.onpointermove = (e) => {
  if (!drag) return;
  const pixel = local(e),
    s = graph.settings,
    step = s.snapStep ?? defaultSnapStep,
    snap = (v: number) => (s.snap ? Math.round(v / step) * step : v);
  if (drag.point) {
    const [x, y] = transform.toGraph(...pixel);
    const p = graph.objects.find((o) => o.id === drag!.point);
    if (p?.type === "point") {
      p.x = Number(snap(x).toPrecision(8));
      p.y = Number(snap(y).toPrecision(8));
    }
  } else {
    // Snap the distance moved, not the limits, so padding like -5.2..5.2 survives.
    const old = drag.original.settings,
      dx = snap((drag.pixel[0] - pixel[0]) * drag.unit[0]),
      dy = snap((pixel[1] - drag.pixel[1]) * drag.unit[1]),
      at = (v: number) => Number(v.toPrecision(12));
    s.xmin = at(old.xmin + dx);
    s.xmax = at(old.xmax + dx);
    s.ymin = at(old.ymin + dy);
    s.ymax = at(old.ymax + dy);
    if (
      Math.max(
        Math.abs(s.xmin),
        Math.abs(s.xmax),
        Math.abs(s.ymin),
        Math.abs(s.ymax),
      ) > 1e6
    )
      Object.assign(s, old);
  }
  draw();
};
canvas.onpointerup = () => {
  if (drag) {
    drag = undefined;
    changed(true);
  }
};
canvas.onpointercancel = () => {
  if (drag) {
    graph = drag.original;
    drag = undefined;
    draw();
    build();
  }
};
canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    if (!loaded || blocked || !validateDraft()) return;
    const old = structuredClone(graph),
      s = graph.settings,
      [x, y] = transform.toGraph(...local(e)),
      factor = Math.exp(Math.max(-0.3, Math.min(0.3, e.deltaY * 0.001)));
    s.xmin = x + (s.xmin - x) * factor;
    s.xmax = x + (s.xmax - x) * factor;
    s.ymin = y + (s.ymin - y) * factor;
    s.ymax = y + (s.ymax - y) * factor;
    // Only automatic spacings follow the zoom; chosen ones (such as pi/2) stay.
    if (autoTick(old, "x")) s.xtick = niceTick(s.xmax - s.xmin);
    if (autoTick(old, "y")) s.ytick = niceTick(s.ymax - s.ymin);
    try {
      validate(graph);
      changed(true);
    } catch (err) {
      graph = old;
      // e.g. a chosen pi/2 spacing would need more than 200 ticks at this zoom.
      status(`Zoom stopped: ${String(err).replace(/^Error: /, "")}`, true);
    }
  },
  { passive: false },
);
new ResizeObserver(() => {
  if (loaded && validateDraft()) draw();
}).observe(canvas);
api.postMessage({ type: "ready" });
