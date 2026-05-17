export interface QuestionPart {
  label?: string;
  body: string;
  parts?: QuestionParts;
}

export interface QuestionParts {
  stem: string;
  items: QuestionPart[];
}

/** Typst grid layout for MCQ choices. */
export function formatBody(stem: string, choices: Record<string, string>): string {
  const letters = ['A', 'B', 'C', 'D', 'E'].filter(l => choices[l]);
  if (!letters.length) return stem;

  // Prefer a single row. With five choices, fall back to a compact two-row grid.
  const cols = letters.length <= 4 ? letters.length : 3;
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
