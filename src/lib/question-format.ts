import type { Question, QuestionPart, QuestionParts } from './types.ts';

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
export function formatBody(
  stem: string,
  choices: Record<string, string>,
  options: { maxColumns?: number } = {},
): string {
  const letters = ['A', 'B', 'C', 'D', 'E'].filter(l => choices[l]);
  if (!letters.length) return stem;

  // Prefer a single row. With five choices, fall back to a compact two-row grid.
  // Long choices get fewer, wider columns so they never overlap or break mid-expression.
  const widest = Math.max(...letters.map(l => printedWidth(choices[l])));
  const preferred = letters.length <= 4 ? letters.length : 3;
  const naturalColumns = widest > 40 ? 1 : widest > 14 ? Math.min(2, preferred) : preferred;
  const maxColumns = Math.max(1, Math.floor(options.maxColumns ?? naturalColumns));
  const cols = Math.min(naturalColumns, maxColumns);
  // Inline math can extend beyond the normal font ascender/descender. Include its
  // full bounds when sizing each row so matrices and fractions cannot collide.
  const cells = letters.map(l => `[#set text(top-edge: "bounds", bottom-edge: "bounds")\n(${l}) ${choices[l]}]`).join(', ');
  const colDef = Array(cols).fill('1fr').join(', ');
  const grid = `#grid(columns: (${colDef}), column-gutter: 1.5em, row-gutter: 0.6em, ${cells})`;

  return `${stem}\n\n${grid}`;
}

function numberingForDepth(depth: number): string {
  return depth <= 1 ? '(a)' : depth === 2 ? '(i)' : '(1)';
}

function formatPointValue(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

function partPointLabel(item: QuestionPart, showPoints: boolean, scoreByPart: boolean): string {
  return showPoints && scoreByPart && Number.isFinite(item.points)
    ? ` #h(0.45em) _(${formatPointValue(item.points!)} ${item.points === 1 ? 'pt' : 'pts'})_`
    : '';
}

function formatEnumItem(item: QuestionPart, depth: number, showPoints: boolean, scoreByPart: boolean): string {
  const lines = item.body.trim().split('\n');
  const [first = '', ...rest] = lines;
  const pointLabel = partPointLabel(item, showPoints, scoreByPart);
  const out = [`+ ${first.trimEnd()}${pointLabel}`];
  for (const line of rest) {
    out.push(line.trim().length > 0 ? `  ${line}` : '  ');
  }

  if (item.parts?.items.length) {
    out.push(renderPartsList(item.parts, depth + 1, showPoints));
  }

  return out.join('\n');
}

function renderPartsList(parts: QuestionParts, depth = 1, showPoints = true): string {
  if (parts.layout === 'tasks') return renderPartsTasks(parts, depth, showPoints);
  const lines = ['#block['];
  lines.push(`  #set enum(numbering: "${numberingForDepth(depth)}", indent: 0pt, body-indent: 0.8em)`);
  for (const item of parts.items.filter((candidate) => !candidate.hidden)) {
    lines.push(`  ${formatEnumItem(item, depth, showPoints, parts.pointsMode === 'parts')}`);
  }
  lines.push(']');
  return lines.join('\n');
}

function roman(value: number): string {
  const numerals: Array<[number, string]> = [[10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
  let remaining = value;
  let result = '';
  for (const [amount, glyph] of numerals) while (remaining >= amount) { result += glyph; remaining -= amount; }
  return result;
}

function partLabel(index: number, depth: number): string {
  if (depth <= 1) return String.fromCharCode(97 + index);
  if (depth === 2) return roman(index + 1);
  return String(index + 1);
}

/** Typst grid equivalent of LaTeX tasks: row-major cells, read left to right. */
function renderPartsTasks(parts: QuestionParts, depth: number, showPoints: boolean): string {
  const items = parts.items.filter((item) => !item.hidden);
  if (!items.length) return '';
  const columns = Math.max(1, Math.min(4, Math.trunc(parts.columns ?? 2)));
  const cells = items.map((item, index) => {
    const nested = item.parts?.items.some((candidate) => !candidate.hidden)
      ? `\n${renderPartsList(item.parts, depth + 1, showPoints)}`
      : '';
    const content = `${item.body.trim()}${partPointLabel(item, showPoints, parts.pointsMode === 'parts')}${nested}`;
    return `  [#grid(columns: (auto, 1fr), column-gutter: 0.35em, align: top, [(${partLabel(index, depth)})], [${content}])]`;
  });
  return [
    '#block[',
    `#grid(columns: (${Array(columns).fill('1fr').join(', ')}${columns === 1 ? ',' : ''}), column-gutter: 1.2em, row-gutter: 0.7em, align: top,`,
    cells.join(',\n'),
    ')',
    ']',
  ].join('\n');
}

export function formatParts(parts: QuestionParts, includeStem = true, options: { showPoints?: boolean } = {}): string {
  const visibleItems = parts.items.filter((item) => !item.hidden);
  if (!includeStem) {
    return visibleItems.length ? renderPartsList(parts, 1, options.showPoints ?? true) : '';
  }
  const stem = parts.stem.trim();
  if (!visibleItems.length) return stem;
  const list = renderPartsList(parts, 1, options.showPoints ?? true);
  return stem ? `${stem}\n\n${list}` : list;
}

/**
 * Format a question's structured parts while remaining compatible with older
 * imports that kept the shared prompt in Question.body instead of parts.stem.
 */
export function formatQuestionParts(
  question: Pick<Question, 'body' | 'parts'>,
  includeStem = true,
  options: { showPoints?: boolean } = {},
): string {
  if (!question.parts) return question.body;
  if (!includeStem || question.parts.stem.trim()) return formatParts(question.parts, includeStem, options);
  return formatParts({ ...question.parts, stem: question.body }, true, options);
}

/** Sum visible part scores recursively. Hidden branches contribute nothing. */
export function questionPartsPointTotal(parts?: QuestionParts): number {
  if (!parts) return 0;
  return parts.items.reduce((sum, item) => {
    if (item.hidden) return sum;
    const own = Number.isFinite(item.points) && item.points! >= 0 ? item.points! : 0;
    return sum + own + questionPartsPointTotal(item.parts);
  }, 0);
}

/** Effective score even when an imported bank has not synchronized Question.points yet. */
export function questionPointValue(question: Pick<Question, 'points' | 'parts'>): number {
  if (question.parts?.pointsMode === 'parts') return questionPartsPointTotal(question.parts);
  return Number.isFinite(question.points) && question.points >= 0 ? question.points : 0;
}

/** Extract the stem from a body produced by formatBody (strips the trailing grid). */
export function stemOf(body: string): string {
  const idx = body.lastIndexOf('\n\n#grid(');
  return idx >= 0 ? body.slice(0, idx).trim() : body;
}
