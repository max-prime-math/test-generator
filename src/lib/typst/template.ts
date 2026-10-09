import type { Narrative, Question, TestConfig } from '../types.ts';
import { formatBody, formatParts, stemOf } from '../question-format.ts';
import { resolveQuestionNarrative } from '../narrative-utils.ts';
import { autoImports } from './auto-imports.ts';

/** Escape plain-text config values for use in Typst markup mode. */
function esc(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/#/g, '\\#')
    .replace(/\$/g, '\\$')
    .replace(/@/g, '\\@');
}

interface BodySegment {
  text: string;
  code: boolean;
}

/** Keywords that put Typst into code mode without an immediate bracket. */
const CODE_KEYWORDS = [
  'let', 'set', 'show', 'import', 'include',
  'if', 'else', 'for', 'while', 'context', 'return',
];

const KEYWORD_MARKER = new RegExp(`^#(?:${CODE_KEYWORDS.join('|')})(?![A-Za-z0-9_-])`);

/**
 * Split a body into markup and Typst code regions: `#{ … }` blocks, the
 * argument list of a `#call(…)`, and `#let`/`#show`/… keyword statements.
 * Strings and comments are skipped so braces or parens inside them do not
 * close a region early.
 */
function splitCodeSegments(text: string): BodySegment[] {
  const segments: BodySegment[] = [];
  let markupStart = 0;
  let index = 0;

  while (index < text.length) {
    if (text[index] !== '#') { index += 1; continue; }

    // `#let f(x) = …` and friends stay in code mode past their first bracket,
    // so they run to the end of the statement rather than to a closing pair.
    let end = -1;
    if (KEYWORD_MARKER.test(text.slice(index))) {
      end = scanCodeStatement(text, index);
    } else {
      let open: '{' | '(' = '{';
      let bodyStart = -1;
      if (text[index + 1] === '{') {
        open = '{';
        bodyStart = index + 2;
      } else {
        const call = /^#[A-Za-z_][A-Za-z0-9_.-]*\(/.exec(text.slice(index));
        if (call) {
          open = '(';
          bodyStart = index + call[0].length;
        }
      }
      if (bodyStart < 0) { index += 1; continue; }
      end = scanCodeRegion(text, bodyStart, open);
    }
    if (end < 0) { index += 1; continue; }
    // Only regions that actually span lines need protecting; keeping the rest
    // as markup preserves the original line-break behaviour exactly.
    if (!text.slice(index, end).includes('\n')) { index = end; continue; }

    if (markupStart < index) segments.push({ text: text.slice(markupStart, index), code: false });
    segments.push({ text: text.slice(index, end), code: true });
    markupStart = end;
    index = end;
  }

  if (markupStart < text.length) segments.push({ text: text.slice(markupStart), code: false });
  return segments;
}

const CLOSING_BRACKET: Record<string, string> = { '{': '}', '(': ')', '[': ']' };

/**
 * Index just past the bracket closing a code region opened at `start`, or -1
 * when the brackets never balance. Strings and comments are skipped whole.
 */
function scanCodeRegion(text: string, start: number, open: '{' | '('): number {
  const expected = [CLOSING_BRACKET[open]];
  let index = start;

  while (index < text.length && expected.length > 0) {
    const char = text[index];

    if (char === '"') {
      index += 1;
      while (index < text.length && text[index] !== '"') index += text[index] === '\\' ? 2 : 1;
      index += 1;
    } else if (char === '/' && text[index + 1] === '/') {
      const newline = text.indexOf('\n', index);
      index = newline < 0 ? text.length : newline;
    } else if (char === '/' && text[index + 1] === '*') {
      const closing = text.indexOf('*/', index + 2);
      index = closing < 0 ? text.length : closing + 2;
    } else if (CLOSING_BRACKET[char]) {
      expected.push(CLOSING_BRACKET[char]);
      index += 1;
    } else if (char === '}' || char === ')' || char === ']') {
      if (expected.at(-1) !== char) return -1;
      expected.pop();
      index += 1;
    } else {
      index += 1;
    }
  }

  return expected.length === 0 ? index : -1;
}

/**
 * Index just past a keyword statement starting at `start`. The statement ends
 * at the first line break reached outside any bracket, so a binding whose value
 * spans lines — `#let f(..) = grid(\n … \n)` — is kept whole. The terminating
 * newline is consumed so no line break is emitted against the statement.
 */
function scanCodeStatement(text: string, start: number): number {
  const stack: string[] = [];
  let index = start;

  while (index < text.length) {
    const char = text[index];

    if (char === '"') {
      index += 1;
      while (index < text.length && text[index] !== '"') index += text[index] === '\\' ? 2 : 1;
      index += 1;
    } else if (char === '/' && text[index + 1] === '/') {
      const newline = text.indexOf('\n', index);
      if (newline < 0) return text.length;
      index = newline;
    } else if (char === '/' && text[index + 1] === '*') {
      const closing = text.indexOf('*/', index + 2);
      index = closing < 0 ? text.length : closing + 2;
    } else if (CLOSING_BRACKET[char]) {
      stack.push(CLOSING_BRACKET[char]);
      index += 1;
    } else if (char === '}' || char === ')' || char === ']') {
      if (stack.at(-1) !== char) return -1;
      stack.pop();
      index += 1;
    } else if (char === '\n' && stack.length === 0) {
      return index + 1;
    } else {
      index += 1;
    }
  }

  return stack.length === 0 ? text.length : -1;
}

/** Turn authored single newlines into explicit Typst line breaks. */
function breakMarkupLines(markup: string): string {
  return markup
    .split(/\n{2,}/)
    .map((para) => para.replace(/\n/g, '\\\n'))
    .join('\n\n');
}

function processBody(body: string): string {
  const text = body.trim().replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const segments = splitCodeSegments(text);

  return segments
    .map((segment, position) => {
      if (segment.code) return segment.text;
      let markup = breakMarkupLines(segment.text);
      // A line break directly against a code block would render as a stray
      // blank line, and `\` is invalid immediately before code.
      if (segments[position + 1]?.code) markup = markup.replace(/\\\n$/, '\n');
      return markup;
    })
    .join('')
    .trim();
}

function shouldAppendGraphTypst(body: string, graphTypst?: string): boolean {
  const graph = graphTypst?.trim();
  if (!graph) return false;
  return !(/Recovered graph/i.test(graph) && /Recovered graph/i.test(body));
}

function normalizeParts(parts?: Question['parts']): Question['parts'] | undefined {
  if (!parts) return undefined;
  return {
    stem: processBody(parts.stem),
    items: parts.items.map((part) => ({
      label: part.label,
      body: processBody(part.body),
      parts: part.parts ? normalizeParts(part.parts) : undefined,
    })),
  };
}

/**
 * The correct answer letter for a question, respecting choice scrambling.
 * Falls back to legacy behaviour where q.solution held a bare letter.
 */
function effectiveAnswer(q: Question, config: TestConfig): string {
  const override = config.choiceOverrides?.[q.id]?.solution;
  if (override) return override;
  if (q.answer) return q.answer;
  // Backward compat: old questions stored the letter directly in solution
  if (q.solution && /^[A-Ea-e]$/.test(q.solution.trim())) return q.solution.trim().toUpperCase();
  return '';
}

function isMCQ(q: Question, config: TestConfig): boolean {
  return (q.choices != null && Object.keys(q.choices).length >= 2) || !!effectiveAnswer(q, config);
}

/** Where a multiple-choice question landed in the compiled test, read back for the answer key. */
export interface McqPosition { num: string; ans: string; page: number; y: number }
export const MCQ_POSITION_SELECTOR = '<tg-mcq-pos>';
const MCQ_POSITIONS_QUERY = 'query(<tg-mcq-pos>).map(m => m.value)';

function typstStr(s: string): string {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * Each MCQ records its page and height, so the key can give one row per page and
 * the answer strip can sit each answer level with its question.
 */
const MCQ_MARK_DEFS = `#let tg-mark(num, ans) = context [#metadata((num: num, ans: ans, page: here().page(), y: here().position().y / 1pt))<tg-mcq-pos>]
#let tg-box = context box(width: 1.5em, height: 1.5em, stroke: 0.6pt + text.fill)
#let tg-box-space = box(width: 1.5em)`;

function mcqMark(label: string, q: Question, config: TestConfig): string {
  const answer = isMCQ(q, config) ? effectiveAnswer(q, config) : '';
  return answer ? `#tg-mark(${typstStr(label)}, ${typstStr(answer.toUpperCase())})` : '';
}

/** One row per test page when positions are known, otherwise rows of eight. */
const MCQ_KEY_DEFS = `#let tg-mcq-key(items, max-columns: none) = {
  let paged = items.len() > 0 and items.all(i => "page" in i)
  let rows = if paged { items.map(i => i.page).dedup().map(p => items.filter(i => i.page == p)) } else { items.chunks(8) }
  if max-columns != none { rows = rows.fold((), (all, row) => all + row.chunks(max-columns)) }
  let cols = calc.max(1, ..rows.map(r => r.len()))
  let col = if cols > 9 { 1fr } else { auto }
  let cells = rows.map(r => {
    let lead = if paged { (text(size: 0.8em, fill: gray)[p.#r.at(0).page],) } else { () }
    lead + r.map(i => [*#i.num.* #i.ans]) + ([],) * (cols - r.len())
  }).flatten()
  grid(columns: (if paged { (auto,) } else { () }) + (col,) * cols, column-gutter: if max-columns == none { 1.5em } else { 0.75em }, row-gutter: 0.4em, ..cells)
}
#let tg-answer-strip(items, margin-left, margin-top) = {
  let pages = items.map(i => i.page).dedup()
  let column = 0.75in
  align(right, text(size: 0.8em, fill: gray)[Answer strip: hold behind the test with column p.~N showing beside page N.])
  for (k, p) in pages.enumerate() {
    let dx = 0.2in - margin-left + k * column
    place(top + left, dx: dx, dy: 0.15in - margin-top, text(size: 0.8em, fill: gray)[p.#p])
    for i in items.filter(i => i.page == p) {
      place(top + left, dx: dx, dy: i.y * 1pt - margin-top, [*#i.num.* #i.ans])
    }
  }
  place(top + left, dx: 0.2in - margin-left + pages.len() * column - 0.15in, dy: -margin-top,
    line(length: page.height, angle: 90deg, stroke: (paint: gray, thickness: 0.4pt, dash: "dashed")))
}`;

function mcqPositionsLiteral(positions: McqPosition[]): string {
  const items = positions.map((p) => `(num: ${typstStr(p.num)}, ans: ${typstStr(p.ans)}, page: ${Math.trunc(p.page)}, y: ${Number(p.y) || 0})`);
  return `(${items.join(', ')}${items.length === 1 ? ',' : ''})`;
}

function isBonusQuestion(q: Question, config: TestConfig): boolean {
  return config.bonusQuestionIds?.includes(q.id) ?? false;
}

/** Mark value of a test: bonus questions are extra credit, so they are excluded. */
export function pointsTotal(questions: Question[], config: TestConfig): number {
  return questions
    .filter((q) => !isBonusQuestion(q, config))
    .reduce((sum, q) => sum + (Number.isFinite(q.points) ? q.points : 0), 0);
}

function formatPoints(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

/**
 * The printed total, with `{total}` replaced by the number. Text without the
 * token gets the number appended, and no text at all prints the number alone.
 */
function combineTotal(text: string, number: string): string {
  if (!text) return number;
  return text.includes('{total}') ? text.replaceAll('{total}', number) : `${text} ${number}`;
}

function pointsTotalLabel(config: TestConfig, total: number): string {
  return combineTotal(esc(config.pointsTotalText?.trim() ?? ''), formatPoints(total));
}

/** The same label as plain text, for showing the wording in the builder. */
export function pointsTotalPreview(config: TestConfig, total: number): string {
  return combineTotal(config.pointsTotalText?.trim() ?? '', formatPoints(total));
}

function pointLabel(q: Question, config: TestConfig): string {
  const base = `${q.points} ${q.points === 1 ? 'pt' : 'pts'}`;
  return isBonusQuestion(q, config) ? `Bonus, out of ${base}` : base;
}

/** A numbered item on the test: one question, or questions sharing a lead, lettered a), b), …. */
export interface TestItem {
  number: number;
  questions: Question[];
  /** The shared instruction or narrative (Typst markup), printed once; set when two or more questions share it. */
  lead?: string;
}

/** The text a question shares with its neighbours: its Generate instruction, or else its narrative. */
export function questionLead(q: Question, narrativeList: Narrative[] = []): string | null {
  const instructions = q.taskGroup?.instructions.trim();
  if (instructions) return instructions;
  return resolveQuestionNarrative(q, narrativeList)?.body.trim() || null;
}

/**
 * Consecutive questions with the same instruction or narrative form one numbered item, which
 * states it once and letters the questions — whatever the questions are or where they came from
 * (e.g. Easy, Medium, and Hard sections of one outcome). A question on its own prints as usual.
 */
export function groupTestItems(questions: Question[], narrativeList: Narrative[] = []): TestItem[] {
  const runs: Array<{ key: string | null; lead: string | null; questions: Question[] }> = [];
  for (const q of questions) {
    const lead = questionLead(q, narrativeList);
    const key = lead ? lead.replace(/\s+/g, ' ') : null;
    const last = runs.at(-1);
    if (key && last?.key === key) last.questions.push(q);
    else runs.push({ key, lead, questions: [q] });
  }
  return runs.map((run, i) => ({
    number: i + 1,
    questions: run.questions,
    ...(run.lead && run.questions.length > 1 ? { lead: run.lead } : {}),
  }));
}

/** a, b, …, z, aa, ab, … */
export function taskLetter(index: number): string {
  let n = index + 1;
  let out = '';
  while (n > 0) { n -= 1; out = String.fromCharCode(97 + (n % 26)) + out; n = Math.floor(n / 26); }
  return out;
}

/** Printed labels by question id, e.g. "3" or "4b", in test order. */
export function questionLabels(questions: Question[], config: TestConfig, narrativeList: Narrative[] = []): Map<string, string> {
  const labels = new Map<string, string>();
  for (const item of groupTestItems(sortQuestions(questions, config, narrativeList), narrativeList)) {
    item.questions.forEach((q, i) => labels.set(q.id, item.lead ? `${item.number}${taskLetter(i)}` : String(item.number)));
  }
  return labels;
}

/**
 * What prints after a grouped question's letter: its body without the group's shared
 * lead-in, and without the full stop after a lone expression ("a) 6³", not "a) 6³.").
 */
export function taskItemBody(body: string, strip?: string, stripEnd?: string): string {
  const trimmed = body.trim();
  const start = strip ?? '';
  const end = stripEnd?.trim() ? stripEnd.trimEnd() : '';
  if ((!start && !end) || !trimmed.startsWith(start) || !trimmed.endsWith(end) || trimmed.length < start.length + end.length) return body;
  return trimmed.slice(start.length, trimmed.length - end.length).trim().replace(/^(\$[^$]+\$)\.$/, '$1');
}

/** A lettered question without the lead its item states once. */
function taskItemQuestion(q: Question): Question {
  return q.taskGroup ? { ...q, body: taskItemBody(q.body, q.taskGroup.strip, q.taskGroup.stripEnd) } : q;
}

/** Questions per row: a Generate section's setting, otherwise one. */
function taskColumns(q: Question): number {
  return q.taskGroup ? Math.max(1, Math.min(4, Math.round(q.taskGroup.columns) || 1)) : 1;
}

/**
 * Stable-sort: MCQs first, then FRQs, preserving relative order within each group.
 * Questions sharing a lead move as a unit, which counts as multiple choice when all its questions are.
 * Only applied when config.mcqFirst is true.
 */
export function sortQuestions(qs: Question[], config: TestConfig, narrativeList: Narrative[] = []): Question[] {
  if (!config.mcqFirst) return qs;
  const units = groupTestItems(qs, narrativeList).map((item) => item.questions);
  const unitIsMcq = (unit: Question[]) => unit.every((q) => isMCQ(q, config));
  return [...units.filter(unitIsMcq), ...units.filter((unit) => !unitIsMcq(unit))].flat();
}

/** Render the full Typst body for a question, applying choice overrides if set. */
function renderBody(
  q: Question,
  config: TestConfig,
  options: { narratives?: Narrative[]; includeNarrative?: boolean } = {},
): string {
  const override = config.choiceOverrides?.[q.id];
  const choices  = override?.choices ?? q.choices;
  const parts = q.parts;
  const resolvedNarrative = resolveQuestionNarrative(q, options.narratives ?? []);
  const hasNarrative = Boolean(resolvedNarrative?.body.trim());
  let content = '';
  if (parts?.items.length) {
    const normalized = normalizeParts(parts);
    if (normalized) content = formatParts(normalized, !hasNarrative);
  } else {
    content = processBody(q.body);
  }

  if (options.includeNarrative !== false && resolvedNarrative?.body.trim()) {
    const narrative = processBody(resolvedNarrative.body);
    content = content ? `${narrative}\n\n${content}` : narrative;
  }

  const graphTypst = q.graphTypst?.trim();
  if (shouldAppendGraphTypst(content, graphTypst)) {
    content = content ? `${content}\n\n${graphTypst}` : graphTypst ?? '';
  }

  if (!choices || Object.keys(choices).length < 2) return content;
  // q.choices present means body is stem-only; absent means body may have an embedded grid.
  const stem = q.choices != null ? content : processBody(stemOf(content));
  return formatBody(stem, choices);
}

/** Written explanation for a question (never a bare letter). */
function verboseSolution(q: Question): string {
  const s = q.solution?.trim() ?? '';
  // Single-letter solutions are legacy answer storage — not an explanation
  return /^[A-Ea-e]$/.test(s) ? '' : s;
}

/**
 * The page setting for page numbers at the bottom of each page. Outside is the right on odd
 * (front) pages and the left on even (back) pages, as in a double-sided booklet; inside is the reverse.
 */
export function pageNumberFooter(config: Pick<TestConfig, 'pageNumbers'>): string {
  const placement = config.pageNumbers ?? 'none';
  if (placement === 'none') return '';
  if (placement === 'centre') return '\n  footer: context align(center, counter(page).display("1")),';
  const [odd, even] = placement === 'outside' ? ['right', 'left'] : ['left', 'right'];
  return `\n  footer: context align(if calc.odd(here().page()) { ${odd} } else { ${even} }, counter(page).display("1")),`;
}

/** Display math flush left with a 1in indent from the text edge, like LaTeX fleqn; empty when centred. */
export function displayMathRules(config: Pick<TestConfig, 'flushLeftMath'>): string {
  if (config.flushLeftMath === false) return '';
  return `#show math.equation.where(block: true): set align(left)
#show math.equation.where(block: true): it => pad(left: 1in, it)
`;
}

export function generatePreamble(config: TestConfig, total: number | null = null): string {
  const title        = esc(config.title || 'Math Test');
  const subtitle     = config.subtitle ? esc(config.subtitle) : '';
  const instructions = esc(config.instructions);
  const margin       = `${config.marginIn}in`;

  const showTotal = config.showPointsTotal && total !== null;
  const totalLabel = showTotal ? pointsTotalLabel(config, total) : '';
  const headerTotal = showTotal && config.pointsTotalPlacement === 'header' ? ` #h(1em) ${totalLabel}` : '';
  const instructionsTotal = showTotal && config.pointsTotalPlacement === 'instructions'
    ? `\n\n${totalLabel}`
    : '';

  const leftText = (subtitle ? `${title}: ${subtitle}` : title) + headerTotal;
  const nameLine = config.showDate
    ? `${leftText} #h(1fr) Name: #underline[#h(2in)] #h(1em) Date: #underline[#h(1.5in)]`
    : `${leftText} #h(1fr) Name: #underline[#h(2in)]`;

  return `#set page(
  paper: "${config.paper}",
  margin: (top: ${margin}, bottom: ${margin}, left: ${margin}, right: ${margin}),${pageNumberFooter(config)}
)
#set text(font: "New Computer Modern", size: ${config.fontSize}pt)
#set par(justify: false)
${displayMathRules(config)}
${nameLine}
#context line(length: 100%, stroke: 0.5pt + text.fill)
${instructions}${instructionsTotal}`;
}

export function generateIndividual(config: TestConfig, questions: Question[], narrativeList: Narrative[] = []): string[] {
  const preamble = config.customPreamble !== undefined
    ? config.customPreamble
    : generatePreamble(config, pointsTotal(questions, config));

  return questions.map((q, i) => {
    const num     = i + 1;
    const space   = config.answerSpaceOverrides[q.id] ?? config.answerSpace;
    const body    = renderBody(q, config, { narratives: narrativeList });
    const label   = pointLabel(q, config);
    const ptsText = config.showPoints
      ? (config.pointsBold ? `*(${label})* ` : `(${label}) `)
      : '';

    return `${preamble}

#v(0.8em)

#block(width: 100%)[
  #grid(
    columns: (auto, 1fr),
    column-gutter: 0.5em,
    align: top,
    [*${num}.*], [${ptsText}${body}],
  )
  #v(${space}cm)
]`;
  });
}

/**
 * `questions` are in test order. `positions` is Typst code for the MCQ positions:
 * a live query when the test is in the same document, or values read back from
 * the compiled test. Without positions the key falls back to rows of eight.
 */
function buildAnswerKeyBody(questions: Question[], config: TestConfig, narrativeList: Narrative[] = [], positions: string | null = null): string {
  const labels = questionLabels(questions, { ...config, mcqFirst: false }, narrativeList);
  const items = questions.map((q, i) => ({
    num:         labels.get(q.id) ?? String(i + 1),
    mc:          isMCQ(q, config),
    answer:      effectiveAnswer(q, config),
    explanation: verboseSolution(q),
  }));

  const mcItems = items.filter(item => item.mc && item.answer);
  const parts: string[] = [];

  // Compact MCQ grid — only question number + correct letter, one row per test page
  if (mcItems.length) {
    const items = positions ?? `(${mcItems.map(item => `(num: ${typstStr(item.num)}, ans: ${typstStr(item.answer.toUpperCase())})`).join(', ')},)`;
    parts.push(`*Multiple Choice Key*\n#v(0.3em)\n#context tg-mcq-key(${items}${config.answerKeyColumns === 2 ? ", max-columns: 3" : ""})`);
  }

  // Verbose solutions — FRQs always; MCQs only if mcqFullSolutions is on
  const verboseItems = (config.mcqFullSolutions ? items : items.filter(i => !i.mc))
    .filter(item => item.explanation);
  if (verboseItems.length) {
    const body = verboseItems.map(item => config.keepSolutionsTogether
      ? `#tg-solution[*${item.num}.* ${item.explanation}]`
      : `*${item.num}.* ${item.explanation}`).join('\n\n');
    parts.push(`*Solutions*\n#v(0.3em)\n${body}`);
  }

  if (!parts.length) return '';
  const strip = config.answerStrip && mcItems.length && positions
    ? `\n\n#pagebreak()\n#context tg-answer-strip(${positions}, ${config.marginIn}in, ${config.marginIn}in)`
    : '';
  const content = parts.join('\n\n#v(0.6em)\n\n');
  const body = config.answerKeyColumns === 2 ? `#columns(2, gutter: 1.5em)[\n${content}\n]` : content;
  // Measure at the actual column width; oversized solutions must remain breakable.
  const solutionDefs = config.keepSolutionsTogether ? `
#let tg-solution(body) = context layout(size => {
  let height = measure(block(width: size.width, body)).height
  let oversized = if page.height == auto { true } else { height > page.height - ${config.marginIn * 2}in }
  block(width: 100%, breakable: oversized, body)
})` : '';
  return `${MCQ_KEY_DEFS}${solutionDefs}\n\n${body}${strip}`;
}

/**
 * The answer key as its own document. It cannot see the test's pages, so `positions`
 * (read back from the compiled test) supply the per-page key rows and the answer strip.
 */
export function generateAnswerKeyPage(config: TestConfig, questions: Question[], narrativeList: Narrative[] = [], positions: McqPosition[] | null = null): string | null {
  const body = buildAnswerKeyBody(sortQuestions(questions, config, narrativeList), config, narrativeList,
    positions?.length ? mcqPositionsLiteral(positions) : null);
  if (!body) return null;

  const margin = `${config.marginIn}in`;
  const header = `*Answer Key*\n#v(0.3em)\n#context line(length: 100%, stroke: 0.5pt + text.fill)\n#v(0.6em)`;

  return `#set page(
  paper: "${config.paper}",
  margin: (top: ${margin}, bottom: ${margin}, left: ${margin}, right: ${margin}),${pageNumberFooter(config)}
)
#set text(font: "New Computer Modern", size: ${config.fontSize}pt)
#set par(justify: false)
${displayMathRules(config)}
${header}

${body}`;
}

function generateAnswerKey(config: TestConfig, questions: Question[], narrativeList: Narrative[] = []): string {
  const body = buildAnswerKeyBody(questions, config, narrativeList, MCQ_POSITIONS_QUERY);
  if (!body) return '';

  return `#pagebreak()
*Answer Key*
#v(0.3em)
#context line(length: 100%, stroke: 0.5pt + text.fill)
#v(0.6em)

${body}`;
}

/**
 * Questions sharing a lead: the number and the lead once, then each question lettered and
 * placed across its columns, row by row. Questions from Generate sections with different
 * column settings each get their own rows, lettering on from one to the next. Each question keeps its own answer
 * space; the item's points print once, as a total.
 */
function renderTaskGroup(
  item: TestItem,
  config: TestConfig,
  narrativeList: Narrative[],
  pointsText: (label: string) => string,
  boxes = false,
): string {
  const total = item.questions.reduce((sum, q) => sum + (Number.isFinite(q.points) ? q.points : 0), 0);
  const rows: Array<{ columns: number; cells: string[] }> = [];
  item.questions.forEach((q, i) => {
    const space = config.answerSpaceOverrides[q.id] ?? config.answerSpace;
    const body = renderBody(taskItemQuestion(q), config, { narratives: narrativeList, includeNarrative: false });
    const bonus = isBonusQuestion(q, config) ? '_(Bonus)_ ' : '';
    const mark = mcqMark(`${item.number}${taskLetter(i)}`, q, config);
    const box = boxes && isMCQ(q, config) ? '[#tg-box], ' : '';
    const cell = `  [#grid(columns: (${box ? 'auto, ' : ''}auto, 1fr), column-gutter: 0.4em, align: top, ${box}[${mark}${taskLetter(i)})], [${bonus}${body}])
  #v(${space}cm)]`;
    const columns = taskColumns(q);
    const last = rows.at(-1);
    // Questions flow on in one grid; a change in columns starts the next.
    if (last && last.columns === columns) last.cells.push(cell);
    else rows.push({ columns, cells: [cell] });
  });
  const grids = rows.map(({ columns, cells }) => `  #pad(left: 1.2em)[#grid(
    columns: (${Array(columns).fill('1fr').join(', ')}${columns === 1 ? ',' : ''}),
    column-gutter: 1.2em,
    row-gutter: 0.7em,
    align: top,
${cells.join(',\n')},
  )]`).join('\n  #v(0.7em)\n');
  return `#block(width: 100%)[
  #grid(
    columns: (${boxes ? 'auto, ' : ''}auto, 1fr),
    column-gutter: 0.5em,
    align: top,
    ${boxes ? '[#tg-box-space], ' : ''}[*${item.number}.*], [${pointsText(`${formatPoints(total)} ${total === 1 ? 'pt' : 'pts'}`)}${processBody(item.lead ?? '')}],
  )
  #v(0.35em)
${grids}
]`;
}

function bodyTextForAnalysis(q: Question): string {
  return q.parts ? formatParts(q.parts) : q.body;
}

export function generateTypst(config: TestConfig, questions: Question[], narrativeList: Narrative[] = []): string {
  const allBodies = questions.map((q) => {
    const narrative = resolveQuestionNarrative(q, narrativeList)?.body ?? '';
    return `${narrative} ${q.taskGroup?.instructions ?? ''} ${bodyTextForAnalysis(q)} ${q.graphTypst ?? ''} ${q.solution ?? ''} ${Object.values(q.choices ?? {}).join(' ')}`;
  }).join(' ');
  const packageImports = autoImports(allBodies);

  const total = pointsTotal(questions, config);
  const preamble = config.customPreamble !== undefined
    ? config.customPreamble
    : packageImports + generatePreamble(config, total);

  const ordered = sortQuestions(questions, config, narrativeList);
  // Answer boxes, with matching space before other questions so numbers stay aligned.
  const boxes = !!config.mcqAnswerBoxes && ordered.some((q) => isMCQ(q, config));

  const questionParts: string[] = [];
  const pointsText = (label: string) => (config.showPoints ? (config.pointsBold ? `*(${label})* ` : `(${label}) `) : '');
  const layoutAfter = (q: Question) => {
    const layout = config.pageBreakAfter[q.id];
    if (layout?.vfill) questionParts.push('#v(1fr)');
    if (layout?.pagebreak) questionParts.push('#pagebreak()');
  };
  for (const item of groupTestItems(ordered, narrativeList)) {
    const num = item.number;
    if (item.lead) {
      questionParts.push(renderTaskGroup(item, config, narrativeList, pointsText, boxes));
      layoutAfter(item.questions.at(-1)!);
      continue;
    }
    const q = item.questions[0];
    const space   = config.answerSpaceOverrides[q.id] ?? config.answerSpace;
    const body    = renderBody(q, config, { narratives: narrativeList });
    const ptsText = pointsText(pointLabel(q, config));
    const box = boxes ? (isMCQ(q, config) ? '[#tg-box], ' : '[#tg-box-space], ') : '';

    questionParts.push(`#block(width: 100%)[
  #grid(
    columns: (${box ? 'auto, ' : ''}auto, 1fr),
    column-gutter: 0.5em,
    align: top,
    ${box}[${mcqMark(String(num), q, config)}*${num}.*], [${ptsText}${body}],
  )
  #v(${space}cm)
]`);
    layoutAfter(q);
  }

  const questionBlocks = questionParts.join('\n\n');
  const answerKey = config.showAnswerKey ? generateAnswerKey(config, ordered, narrativeList) : '';
  const endTotal = config.showPointsTotal && config.pointsTotalPlacement === 'end' && ordered.length > 0
    ? `#v(0.6em)\n#align(right)[${pointsTotalLabel(config, total)}]\n`
    : '';

  return `${preamble}
${MCQ_MARK_DEFS}

#v(0.8em)

${questionBlocks || '_(No questions selected.)_'}

${endTotal}${answerKey}
`;
}

function escMeta(s: string): string {
  return esc(s)
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\*/g, '\\*');
}

function tagValue(tags: string[], prefix: string): string {
  const match = tags.find((tag) => tag.toLowerCase().startsWith(`${prefix.toLowerCase()}:`));
  return match?.slice(match.indexOf(':') + 1).trim() ?? '';
}

function reviewTopicTags(q: Question): string[] {
  const tags = q.tags ?? [];
  const systemValues = new Set([
    'examview',
    q.classId,
    q.unitId,
    q.sectionId,
  ].filter((value): value is string => Boolean(value)).map((value) => value.toLowerCase()));

  return tags
    .map((tag) => tag.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .filter((tag) => !systemValues.has(tag.toLowerCase()))
    .filter((tag) => !/^(?:difficulty|reference):/i.test(tag))
    .filter((tag) => !/^ans=/i.test(tag));
}

function bankReviewMetadata(q: Question, config: TestConfig): string {
  const answer = effectiveAnswer(q, config) || verboseSolution(q);
  const difficulty = tagValue(q.tags ?? [], 'difficulty');
  const reference = tagValue(q.tags ?? [], 'reference');
  const topics = reviewTopicTags(q);
  const topic = topics.slice(-2).join(' | ');
  const type = q.questionType ?? '';

  const items = [
    ['ANS', answer],
    ['DIF', difficulty],
    ['REF', reference],
    ['TOP', topic],
    ['TYPE', type],
  ].filter(([, value]) => value);

  if (!items.length) return '';
  const line = items
    .map(([label, value]) => `*${label}:* ${escMeta(value)}`)
    .join(' #h(1em) ');
  return `#text(size: 8pt)[${line}]`;
}

export function generateBankReviewTypst(config: TestConfig, questions: Question[], narrativeList: Narrative[] = []): string {
  const allBodies = questions
    .map((q) => {
      const narrative = resolveQuestionNarrative(q, narrativeList)?.body ?? '';
      return `${narrative} ${bodyTextForAnalysis(q)} ${q.graphTypst ?? ''} ${q.solution ?? ''} ${Object.values(q.choices ?? {}).join(' ')}`;
    })
    .join(' ');
  const packageImports = autoImports(allBodies);
  const title = escMeta(config.title || 'Question Bank');
  const paper = config.paper || 'us-letter';
  const margin = `${config.marginIn}in`;
  const reviewConfig: TestConfig = {
    ...config,
    mcqFirst: false,
    showPoints: false,
    answerSpace: 0,
    showAnswerKey: false,
  };

  const questionBlocks = questions.map((q, i) => {
    const body = renderBody(q, reviewConfig, { narratives: narrativeList });
    const metadata = bankReviewMetadata(q, reviewConfig);
    const metadataBlock = metadata ? `\n  #v(0.15em)\n  #pad(left: 1.6em)[${metadata}]` : '';

    return `#block(width: 100%)[
  #grid(
    columns: (auto, 1fr),
    column-gutter: 0.45em,
    align: top,
    [*${i + 1}.*], [${body}],
  )${metadataBlock}
]`;
  }).join('\n\n#v(0.45em)\n\n');

  return `${packageImports}#set page(
  paper: "${paper}",
  margin: (top: ${margin}, bottom: ${margin}, left: ${margin}, right: ${margin}),
)
#set text(font: "New Computer Modern", size: ${config.fontSize}pt)
#set par(justify: false, leading: 0.55em)
${displayMathRules(config)}
= ${title}
#v(0.35em)
#context line(length: 100%, stroke: 0.5pt + text.fill)
#v(0.55em)

${questionBlocks || '_(No questions selected.)_'}
`;
}
