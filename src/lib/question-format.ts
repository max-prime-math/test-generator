export interface QuestionPart {
  label?: string;
  body: string;
  parts?: QuestionParts;
}

export interface QuestionParts {
  stem: string;
  items: QuestionPart[];
}

/**
 * Roughly how wide a choice prints, in characters: Typst function names and
 * delimiters count little, and a drawn graph counts as a fixed small width.
 */
function printedWidth(choice: string): number {
  if (/context\s*\{/.test(choice)) {
    // A drawn graph: size the columns from its width, so wide drawings such as number lines get fewer columns.
    const cm = Number(choice.match(/box\(width: ([\d.]+)cm, height/)?.[1] ?? 3.4);
    return cm <= 4 ? 14 : cm <= 7.5 ? 30 : 50;
  }
  // A picture prints as wide as its width argument, not as long as its file name (redrawn
  // graphs have longer names than the pictures they replace).
  const IMAGE_CALL = /#?image\(\s*"[^"]*"\s*(?:,\s*width:\s*([\d.]+)\s*(in|cm|mm|pt|%))?[^)]*\)/g;
  if (IMAGE_CALL.test(choice)) {
    const perCm: Record<string, number> = { in: 2.54, cm: 1, mm: 0.1, pt: 2.54 / 72 };
    choice = choice.replace(IMAGE_CALL, (_call, size?: string, unit?: string) => {
      const cm = size && unit && unit !== '%' ? Number(size) * perCm[unit] : 3.4;
      return 'x'.repeat(cm <= 4 ? 14 : cm <= 7.5 ? 30 : 50);
    });
  }
  // A matrix prints as wide as its widest row, not as long as its source.
  const text = choice.replace(/mat\((?:delim: "."|, |augment: #\d+)*([^()]*(?:\([^()]*\)[^()]*)*)\)/g, (_, body: string) => {
    const rows = body.split(';').map((r) => r.split(',').map((e) => e.trim().replace(/[()"]/g, '')));
    const width = Math.max(...rows.map((r) => r.reduce((n, e) => n + e.length + 2, 0)));
    return 'x'.repeat(width);
  });
  return text
    .replace(/attach\(\w+, bl: ([^,]+), br: ([^)]+)\)/g, '$1C$2')
    .replace(/\b(sqrt|root|dot|times|thin|quad|attach|frac)\b/g, 'x')
    .replace(/[$"\\(){}_^]/g, '')
    .length;
}

/** Typst grid layout for MCQ choices. */
export function formatBody(stem: string, choices: Record<string, string>): string {
  const letters = ['A', 'B', 'C', 'D', 'E'].filter(l => choices[l]);
  if (!letters.length) return stem;

  // Prefer a single row. With five choices, fall back to a compact two-row grid.
  // Long choices get fewer, wider columns so they never overlap or break mid-expression.
  const widest = Math.max(...letters.map(l => printedWidth(choices[l])));
  const preferred = letters.length <= 4 ? letters.length : 3;
  const cols = widest > 40 ? 1 : widest > 14 ? Math.min(2, preferred) : preferred;
  const cells = letters.map(l => `[(${l}) ${choices[l]}]`).join(', ');
  const colDef = Array(cols).fill('1fr').join(', ');
  const grid = `#grid(columns: (${colDef}), column-gutter: 1.5em, row-gutter: 0.6em, ${cells})`;

  return `${stem}\n\n${grid}`;
}

function numberingForDepth(depth: number): string {
  return depth <= 1 ? '(a)' : depth === 2 ? '(i)' : '(1)';
}

function formatEnumItem(item: QuestionPart, depth: number): string {
  const lines = item.body.trim().split('\n');
  const [first = '', ...rest] = lines;
  const out = [`+ ${first.trimEnd()}`];
  for (const line of rest) {
    out.push(line.trim().length > 0 ? `  ${line}` : '  ');
  }

  if (item.parts?.items.length) {
    out.push(renderPartsList(item.parts, depth + 1));
  }

  return out.join('\n');
}

function renderPartsList(parts: QuestionParts, depth = 1): string {
  const lines = ['#block['];
  lines.push(`  #set enum(numbering: "${numberingForDepth(depth)}", indent: 0pt, body-indent: 0.8em)`);
  for (const item of parts.items) {
    lines.push(`  ${formatEnumItem(item, depth)}`);
  }
  lines.push(']');
  return lines.join('\n');
}

export function formatParts(parts: QuestionParts, includeStem = true): string {
  if (!includeStem) {
    return renderPartsList(parts, 1);
  }
  const stem = parts.stem.trim();
  if (!parts.items.length) return stem;
  const list = renderPartsList(parts, 1);
  return stem ? `${stem}\n\n${list}` : list;
}

/** Extract the stem from a body produced by formatBody (strips the trailing grid). */
export function stemOf(body: string): string {
  const idx = body.lastIndexOf('\n\n#grid(');
  return idx >= 0 ? body.slice(0, idx).trim() : body;
}
