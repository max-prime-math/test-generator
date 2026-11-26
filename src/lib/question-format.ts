import type { Question, QuestionPart, QuestionParts } from './types.ts';

const CHOICE_GRID_START = '\n\n#layout(size => {\n  let cells = (';

/** Fit MCQ choices in their actual Typst container, up to the requested count. */
export function formatBody(
  stem: string,
  choices: Record<string, string>,
  options: { maxColumns?: number } = {},
): string {
  const letters = ['A', 'B', 'C', 'D', 'E'].filter(letter => choices[letter]);
  if (!letters.length) return stem;

  // Include the full bounds of inline math when sizing each row.
  const cells = letters.map(letter => `[#set text(top-edge: "bounds", bottom-edge: "bounds")\n(${letter}) ${choices[letter]}]`).join(', ');
  const requested = options.maxColumns ?? letters.length;
  const limit = Math.min(letters.length, Number.isInteger(requested) && requested > 0 ? requested : letters.length);
  if (limit === 1) return `${stem}\n\n#grid(columns: (1fr,), row-gutter: 0.6em, ${cells})`;

  // Prefer equal spacing. If one column needs extra room, use the widest choice
  // in each column to see whether the same count can still fit across the row.
  // For a manual target, allow wrapping. Test with slightly more room so that a
  // measurement clamped to its available width does not count as fitting.
  return `${stem}${CHOICE_GRID_START}${cells},)
  let gutter = 1.5em.to-absolute()
  let widths = cells.map(cell => measure(cell, width: size.width).width)
  let tracks(count) = range(count).map(column => calc.max(..widths.slice(column).chunks(count).map(row => row.first())))
  let available(count) = size.width - gutter * (count - 1)
  let fits(count) = {
    let space = available(count)
    let width = space / count
    tracks(count).sum() <= space or (
      ${options.maxColumns !== undefined} and width > 0pt and
      cells.all(cell => measure(cell, width: width + 0.01pt).width <= width)
    )
  }
  let count = range(2, ${limit + 1}).rev().find(fits)
  let columns = if count == none { (1fr,) } else {
    let natural = tracks(count)
    let space = available(count)
    if natural.sum() > space or calc.max(..natural) <= space / count { (1fr,) * count }
    else { natural.map(width => width + (space - natural.sum()) / count) }
  }
  grid(columns: columns, column-gutter: gutter, row-gutter: 0.6em, ..cells)
})`;
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
  const out = [`+ ${first.trimEnd()}`];
  for (const line of rest) {
    out.push(line.trim().length > 0 ? `  ${line}` : '  ');
  }
  out[out.length - 1] += partPointLabel(item, showPoints, scoreByPart);

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
  const idx = Math.max(body.lastIndexOf(CHOICE_GRID_START), body.lastIndexOf('\n\n#grid('));
  return idx >= 0 ? body.slice(0, idx).trim() : body;
}
