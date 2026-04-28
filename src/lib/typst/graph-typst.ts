import type { GraphDefaults } from '@bnk-decoder/question-model';

const COLORS = ['blue', 'red', 'green', 'orange', 'purple'];

function transformExprToTypst(expr: string): string {
  // Transform math functions to use calc module
  let result = expr;

  // Replace functions first (but not ones already prefixed with calc.)
  result = result
    .replace(/(?<!calc\.)sin\(/g, 'calc.sin(')
    .replace(/(?<!calc\.)cos\(/g, 'calc.cos(')
    .replace(/(?<!calc\.)tan\(/g, 'calc.tan(')
    .replace(/(?<!calc\.)sqrt\(/g, 'calc.sqrt(')
    .replace(/(?<!calc\.)abs\(/g, 'calc.abs(')
    .replace(/(?<!calc\.)ln\(/g, 'calc.ln(')
    .replace(/(?<!calc\.)log\(/g, 'calc.log(')
    .replace(/(?<!calc\.)exp\(/g, 'calc.exp(')
    .replace(/(?<!calc\.)pow\(/g, 'calc.pow(')
    .replace(/(?<!calc\.)floor\(/g, 'calc.floor(')
    .replace(/(?<!calc\.)ceil\(/g, 'calc.ceil(')
    .replace(/(?<!calc\.)round\(/g, 'calc.round(')
    .replace(/(?<!calc\.)min\(/g, 'calc.min(')
    .replace(/(?<!calc\.)max\(/g, 'calc.max(');

  // Powers: replace x^n with calc.pow(x, n)
  result = result.replace(/([a-zA-Z_]|\))\^(\d+)/g, 'calc.pow($1, $2)');

  return result;
}

export function generateGraphTypst(
  spec: any,
  defaults: GraphDefaults,
  graphIndex: number
): string {
  const width = spec.width ?? defaults.defaultWidth;
  const height = spec.height ?? defaults.defaultHeight;
  const xStep = spec.xStep ?? defaults.xStep;
  const yStep = spec.yStep ?? defaults.yStep;

  const functions = spec.fn.split(',').map((f: string) => f.trim());

  // Build xtick and ytick arrays
  const xticks: number[] = [];
  const yticks: number[] = [];
  for (let x = Math.ceil(spec.xmin / xStep) * xStep; x <= spec.xmax; x += xStep) {
    if (Math.abs(x) > 1e-9) xticks.push(x);
  }
  for (let y = Math.ceil(spec.ymin / yStep) * yStep; y <= spec.ymax; y += yStep) {
    if (Math.abs(y) > 1e-9) yticks.push(y);
  }

  // Build the simple-plot code (on single line to avoid line-continuation issues)
  let plotCode = '#plot(';
  plotCode += `xmin: ${spec.xmin}, xmax: ${spec.xmax}, ymin: ${spec.ymin}, ymax: ${spec.ymax}, width: ${width}, height: ${height}, xlabel: $x$, ylabel: $y$`;

  if (defaults.showGrid && xticks.length > 0) {
    plotCode += `, xtick: (${xticks.join(', ')})`;
  }

  if (defaults.showGrid && yticks.length > 0) {
    plotCode += `, ytick: (${yticks.join(', ')})`;
  }

  if (defaults.showGrid) {
    plotCode += `, show-grid: "major"`;
  }

  // Add function plots
  for (let i = 0; i < functions.length; i++) {
    const fn = transformExprToTypst(functions[i]);
    const color = COLORS[i % COLORS.length];
    plotCode += `, (fn: x => ${fn}, stroke: ${color} + 1.5pt, samples: 200)`;
  }

  plotCode += ')';

  return plotCode;
}
