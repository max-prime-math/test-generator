import type { GraphDefaults } from '@bnk-decoder/question-model';

export interface GraphSpec {
  fn: string;
  domain: [number, number];
  xmin: number;
  xmax: number;
  ymin: number;
  ymax: number;
  asymptotes?: number[];
  xStep?: number;
  yStep?: number;
  width?: number;
  height?: number;
  showGrid?: boolean;
}

const PALETTE = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd'];

function safeExpr(expr: string): string {
  return expr
    .replace(/\^/g, '**')
    .replace(/\bln\(/g, 'log(')
    .replace(/\bpi\b/gi, 'PI')
    .replace(/\be\b(?!=)/g, 'E');
}

function evaluateFunction(expr: string, x: number): number {
  try {
    const fn = new Function('x', `with(Math){return ${safeExpr(expr)}}`);
    return fn(x) as number;
  } catch {
    return NaN;
  }
}

function isValid(v: number): boolean {
  return isFinite(v);
}

export function parseGraphSpec(raw: string): GraphSpec | null {
  const lines = raw.split('\n').map(l => l.trim()).filter(l => l);
  const spec: any = {};

  for (const line of lines) {
    const [key, ...valParts] = line.split(':');
    if (!key || !valParts.length) continue;
    const val = valParts.join(':').trim();

    if (key === 'fn') {
      spec.fn = val;
    } else if (key === 'domain') {
      const [a, b] = val.split(',').map(x => parseFloat(x.trim()));
      if (isFinite(a) && isFinite(b)) spec.domain = [a, b];
    } else if (key === 'window') {
      const [xmin, xmax, ymin, ymax] = val.split(',').map(x => parseFloat(x.trim()));
      if (isFinite(xmin) && isFinite(xmax) && isFinite(ymin) && isFinite(ymax)) {
        spec.xmin = xmin;
        spec.xmax = xmax;
        spec.ymin = ymin;
        spec.ymax = ymax;
      }
    } else if (key === 'asymptotes') {
      spec.asymptotes = val.split(',').map(x => parseFloat(x.trim())).filter(isFinite);
    } else if (key === 'x-step' || key === 'xStep') {
      const n = parseFloat(val);
      if (isFinite(n)) spec.xStep = n;
    } else if (key === 'y-step' || key === 'yStep') {
      const n = parseFloat(val);
      if (isFinite(n)) spec.yStep = n;
    } else if (key === 'width') {
      const n = parseFloat(val);
      if (isFinite(n)) spec.width = n;
    } else if (key === 'height') {
      const n = parseFloat(val);
      if (isFinite(n)) spec.height = n;
    } else if (key === 'grid') {
      spec.showGrid = val.toLowerCase() === 'true' || val === '1';
    }
  }

  if (!spec.fn || !spec.domain || spec.xmin === undefined) return null;
  return spec as GraphSpec;
}

export function generateGraphSvg(spec: GraphSpec, defaults: GraphDefaults): string {
  const w = spec.width ?? defaults.defaultWidth;
  const h = spec.height ?? defaults.defaultHeight;
  const xStep = spec.xStep ?? defaults.xStep;
  const yStep = spec.yStep ?? defaults.yStep;
  const showGrid = spec.showGrid !== false && defaults.showGrid;

  const CANVAS = 300;
  const PADDING = 40;
  const PLOT_W = CANVAS - 2 * PADDING;
  const PLOT_H = CANVAS - 2 * PADDING;

  function toSvg(x: number, y: number): [number, number] {
    const sx = PADDING + ((x - spec.xmin) / (spec.xmax - spec.xmin)) * PLOT_W;
    const sy = PADDING + ((spec.ymax - y) / (spec.ymax - spec.ymin)) * PLOT_H;
    return [sx, sy];
  }

  function isInWindow(x: number): boolean {
    return x >= spec.xmin && x <= spec.xmax;
  }

  const lines: string[] = [];
  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS} ${CANVAS}" width="${w}cm" height="${h}cm" style="background: white;">`
  );

  lines.push('<defs>');
  lines.push('<marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">');
  lines.push('<path d="M0,0 L0,6 L9,3 z" fill="black" />');
  lines.push('</marker>');
  lines.push('</defs>');

  // Grid
  if (showGrid) {
    const gridColor = defaults.gridColor || 'silver';
    for (let x = Math.ceil(spec.xmin / xStep) * xStep; x <= spec.xmax; x += xStep) {
      const [sx] = toSvg(x, 0);
      lines.push(
        `<line x1="${sx}" y1="${PADDING}" x2="${sx}" y2="${PADDING + PLOT_H}" stroke="${gridColor}" stroke-width="0.5" />`
      );
    }
    for (let y = Math.ceil(spec.ymin / yStep) * yStep; y <= spec.ymax; y += yStep) {
      const [, sy] = toSvg(0, y);
      lines.push(
        `<line x1="${PADDING}" y1="${sy}" x2="${PADDING + PLOT_W}" y2="${sy}" stroke="${gridColor}" stroke-width="0.5" />`
      );
    }
  }

  const [ax, ay] = toSvg(0, 0);
  const xEnd = PADDING + PLOT_W;
  const yStart = PADDING;

  lines.push(
    `<line x1="${Math.max(PADDING, Math.min(xEnd, ax))}" y1="${yStart}" x2="${Math.max(PADDING, Math.min(xEnd, ax))}" y2="${PADDING + PLOT_H}" stroke="black" stroke-width="${defaults.axisWeight}" />`
  );
  lines.push(
    `<line x1="${PADDING}" y1="${Math.max(PADDING, Math.min(PADDING + PLOT_H, ay))}" x2="${xEnd}" y2="${Math.max(PADDING, Math.min(PADDING + PLOT_H, ay))}" stroke="black" stroke-width="${defaults.axisWeight}" />`
  );

  if (ax < xEnd) {
    lines.push(
      `<polygon points="${xEnd},${ay} ${xEnd - 6},${ay - 4} ${xEnd - 6},${ay + 4}" fill="black" />`
    );
  }
  if (ay > PADDING) {
    lines.push(
      `<polygon points="${ax},${yStart} ${ax - 4},${yStart + 6} ${ax + 4},${yStart + 6}" fill="black" />`
    );
  }

  lines.push(`<text x="${xEnd - 8}" y="${ay + 16}" font-size="14" fill="black">x</text>`);
  lines.push(`<text x="${ax - 12}" y="${yStart + 8}" font-size="14" fill="black">y</text>`);

  // Tick marks and labels
  const labeledTicks: Record<string, boolean> = {};
  for (let x = Math.ceil(spec.xmin / xStep) * xStep; x <= spec.xmax; x += xStep) {
    if (Math.abs(x) < 1e-9) continue;
    const [sx, sy] = toSvg(x, 0);
    lines.push(
      `<line x1="${sx}" y1="${sy - 3}" x2="${sx}" y2="${sy + 3}" stroke="black" stroke-width="1" />`
    );
  }
  for (let y = Math.ceil(spec.ymin / yStep) * yStep; y <= spec.ymax; y += yStep) {
    if (Math.abs(y) < 1e-9) continue;
    const [sx, sy] = toSvg(0, y);
    lines.push(
      `<line x1="${sx - 3}" y1="${sy}" x2="${sx + 3}" y2="${sy}" stroke="black" stroke-width="1" />`
    );
  }

  // Label largest positive ticks
  for (let x = xStep; x <= spec.xmax; x += xStep) {
    const [sx, sy] = toSvg(x, 0);
    if (sx > PADDING && sx < xEnd) {
      lines.push(`<text x="${sx - 8}" y="${sy + 16}" font-size="12" text-anchor="middle" fill="black">${x.toFixed(0)}</text>`);
      break;
    }
  }
  for (let y = yStep; y <= spec.ymax; y += yStep) {
    const [sx, sy] = toSvg(0, y);
    if (sy > PADDING && sy < PADDING + PLOT_H) {
      lines.push(`<text x="${sx - 12}" y="${sy + 4}" font-size="12" text-anchor="end" fill="black">${y.toFixed(0)}</text>`);
      break;
    }
  }

  // Asymptotes
  if (spec.asymptotes && spec.asymptotes.length > 0) {
    for (const x of spec.asymptotes) {
      const [sx] = toSvg(x, 0);
      lines.push(
        `<line x1="${sx}" y1="${PADDING}" x2="${sx}" y2="${PADDING + PLOT_H}" stroke="${defaults.asymptoteColor}" stroke-width="1" stroke-dasharray="6,4" />`
      );
    }
  }

  // Function curves
  const fns = spec.fn.split(',').map(f => f.trim());
  for (let fi = 0; fi < fns.length; fi++) {
    const fn = fns[fi];
    const [domainStart, domainEnd] = spec.domain;
    const samples = 600;
    const points: Array<[number, number] | null> = [];

    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      const x = domainStart + t * (domainEnd - domainStart);
      const y = evaluateFunction(fn, x);

      if (!isValid(y)) {
        points.push(null);
      } else {
        points.push([x, y]);
      }
    }

    // Split into continuous segments
    const segments: Array<Array<[number, number]>> = [];
    let current: Array<[number, number]> = [];
    for (const p of points) {
      if (p === null) {
        if (current.length > 1) segments.push(current);
        current = [];
      } else {
        current.push(p);
      }
    }
    if (current.length > 1) segments.push(current);

    const color = PALETTE[fi % PALETTE.length];
    const strokeWidth = defaults.curveWeight;

    for (const seg of segments) {
      const pathData = seg
        .filter(([_, y]) => isInWindow(y) || y > spec.ymin - 10 && y < spec.ymax + 10)
        .map((pt, i) => {
          const [sx, sy] = toSvg(pt[0], pt[1]);
          return (i === 0 ? 'M' : 'L') + sx.toFixed(1) + ',' + sy.toFixed(1);
        })
        .join(' ');

      if (pathData) {
        let attrs = `d="${pathData}" stroke="${color}" stroke-width="${strokeWidth}" fill="none"`;

        if (domainStart < spec.xmin || domainEnd > spec.xmax) {
          attrs += ` marker-end="url(#arrow)" marker-start="url(#arrow)"`;
        } else if (seg[0][0] < spec.xmin) {
          attrs += ` marker-start="url(#arrow)"`;
        } else if (seg[seg.length - 1][0] > spec.xmax) {
          attrs += ` marker-end="url(#arrow)"`;
        }

        lines.push(`<path ${attrs} />`);
      }
    }
  }

  lines.push('</svg>');
  return lines.join('\n');
}
