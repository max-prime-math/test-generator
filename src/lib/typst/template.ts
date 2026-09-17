import type { Narrative, Question, TestConfig } from '../types.ts';
import { formatBody, formatParts, stemOf } from '../question-format.ts';
import { resolveQuestionNarrative, type ResolvedQuestionNarrative } from '../narrative-utils.ts';

const SIMPLE_PLOT_IMPORT = `#import "@preview/simple-plot:0.8.0": plot, line-plot\n`;

function needsSimplePlot(...texts: string[]): boolean {
  return texts.some(t => t.includes('plot('));
}

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

/**
 * Split a body into markup and Typst code regions: `#{ … }` blocks and the
 * argument list of a `#call(…)`. Strings and comments are skipped so braces or
 * parens inside them do not close a region early.
 */
function splitCodeSegments(text: string): BodySegment[] {
  const segments: BodySegment[] = [];
  let markupStart = 0;
  let index = 0;

  while (index < text.length) {
    if (text[index] !== '#') { index += 1; continue; }

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

    const end = scanCodeRegion(text, bodyStart, open);
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

function isBonusQuestion(q: Question, config: TestConfig): boolean {
  return config.bonusQuestionIds?.includes(q.id) ?? false;
}

function pointLabel(q: Question, config: TestConfig): string {
  const base = `${q.points} ${q.points === 1 ? 'pt' : 'pts'}`;
  return isBonusQuestion(q, config) ? `Bonus, out of ${base}` : base;
}

/**
 * Stable-sort: MCQs first, then FRQs, preserving relative order within each group.
 * Only applied when config.mcqFirst is true.
 */
export function sortQuestions(qs: Question[], config: TestConfig): Question[] {
  if (!config.mcqFirst) return qs;
  const mc  = qs.filter(q =>  isMCQ(q, config));
  const frq = qs.filter(q => !isMCQ(q, config));
  return [...mc, ...frq];
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

export function generatePreamble(config: TestConfig): string {
  const title        = esc(config.title || 'Math Test');
  const subtitle     = config.subtitle ? esc(config.subtitle) : '';
  const instructions = esc(config.instructions);
  const margin       = `${config.marginIn}in`;

  const leftText = subtitle ? `${title}: ${subtitle}` : title;
  const nameLine = config.showDate
    ? `${leftText} #h(1fr) Name: #underline[#h(2in)] #h(1em) Date: #underline[#h(1.5in)]`
    : `${leftText} #h(1fr) Name: #underline[#h(2in)]`;

  return `#set page(
  paper: "${config.paper}",
  margin: (top: ${margin}, bottom: ${margin}, left: ${margin}, right: ${margin}),
)
#set text(font: "New Computer Modern", size: ${config.fontSize}pt)
#set par(justify: false)

${nameLine}
#context line(length: 100%, stroke: 0.5pt + text.fill)
${instructions}`;
}

export function generateIndividual(config: TestConfig, questions: Question[], narrativeList: Narrative[] = []): string[] {
  const preamble = config.customPreamble !== undefined
    ? config.customPreamble
    : generatePreamble(config);

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

function buildAnswerKeyBody(questions: Question[], config: TestConfig): string {
  const items = questions.map((q, i) => ({
    num:         i + 1,
    mc:          isMCQ(q, config),
    answer:      effectiveAnswer(q, config),
    explanation: verboseSolution(q),
  }));

  const mcItems = items.filter(item => item.mc && item.answer);
  const parts: string[] = [];

  // Compact MCQ grid — shows only question number + correct letter
  if (mcItems.length) {
    const cols  = Math.min(mcItems.length, 8);
    const cells = mcItems.map(item => `[*${item.num}.* ${item.answer.toUpperCase()}]`).join(', ');
    const grid  = `#grid(columns: ${cols}, column-gutter: 1.5em, row-gutter: 0.4em, ${cells})`;
    parts.push(`*Multiple Choice Key*\n#v(0.3em)\n${grid}`);
  }

  // Verbose solutions — FRQs always; MCQs only if mcqFullSolutions is on
  const verboseItems = (config.mcqFullSolutions ? items : items.filter(i => !i.mc))
    .filter(item => item.explanation);
  if (verboseItems.length) {
    const body = verboseItems.map(item => `*${item.num}.* ${item.explanation}`).join('\n\n');
    parts.push(`*Solutions*\n#v(0.3em)\n${body}`);
  }

  if (!parts.length) return '';
  return parts.join('\n\n#v(0.6em)\n\n');
}

export function generateAnswerKeyPage(config: TestConfig, questions: Question[]): string | null {
  const body = buildAnswerKeyBody(sortQuestions(questions, config), config);
  if (!body) return null;

  const margin = `${config.marginIn}in`;
  const header = `*Answer Key*\n#v(0.3em)\n#context line(length: 100%, stroke: 0.5pt + text.fill)\n#v(0.6em)`;

  return `#set page(
  paper: "${config.paper}",
  margin: (top: ${margin}, bottom: ${margin}, left: ${margin}, right: ${margin}),
)
#set text(font: "New Computer Modern", size: ${config.fontSize}pt)
#set par(justify: false)

${header}

${body}`;
}

function generateAnswerKey(config: TestConfig, questions: Question[]): string {
  const body = buildAnswerKeyBody(questions, config);
  if (!body) return '';

  return `#pagebreak()
*Answer Key*
#v(0.3em)
#context line(length: 100%, stroke: 0.5pt + text.fill)
#v(0.6em)

${body}`;
}

function sharedNarrativeKey(narrative: ResolvedQuestionNarrative | null): string | null {
  if (!narrative?.shared) return null;
  return narrative.id ? `id:${narrative.id}` : `body:${narrative.body}`;
}

function renderNarrativeBlock(narrative: ResolvedQuestionNarrative): string {
  return `#block(width: 100%)[
  ${processBody(narrative.body)}
]`;
}

function bodyTextForAnalysis(q: Question): string {
  return q.parts ? formatParts(q.parts) : q.body;
}

export function generateTypst(config: TestConfig, questions: Question[], narrativeList: Narrative[] = []): string {
  const allBodies = questions.map((q) => {
    const narrative = resolveQuestionNarrative(q, narrativeList)?.body ?? '';
    return `${narrative} ${bodyTextForAnalysis(q)} ${q.graphTypst ?? ''} ${q.solution ?? ''} ${Object.values(q.choices ?? {}).join(' ')}`;
  }).join(' ');
  const plotImport = needsSimplePlot(allBodies) ? SIMPLE_PLOT_IMPORT : '';

  const preamble = config.customPreamble !== undefined
    ? config.customPreamble
    : plotImport + generatePreamble(config);

  const ordered = sortQuestions(questions, config);

  const questionParts: string[] = [];
  let activeSharedNarrativeKey: string | null = null;
  ordered.forEach((q, i) => {
    const num     = i + 1;
    const space   = config.answerSpaceOverrides[q.id] ?? config.answerSpace;
    const resolvedNarrative = resolveQuestionNarrative(q, narrativeList);
    const narrativeKey = sharedNarrativeKey(resolvedNarrative);
    if (resolvedNarrative?.shared && narrativeKey && narrativeKey !== activeSharedNarrativeKey) {
      questionParts.push(renderNarrativeBlock(resolvedNarrative));
      questionParts.push('#v(0.2em)');
    }
    activeSharedNarrativeKey = narrativeKey;
    const body    = renderBody(q, config, { narratives: narrativeList, includeNarrative: !resolvedNarrative?.shared });
    const label   = pointLabel(q, config);
    const ptsText = config.showPoints
      ? (config.pointsBold ? `*(${label})* ` : `(${label}) `)
      : '';

    questionParts.push(`#block(width: 100%)[
  #grid(
    columns: (auto, 1fr),
    column-gutter: 0.5em,
    align: top,
    [*${num}.*], [${ptsText}${body}],
  )
  #v(${space}cm)
]`);

    const layout = config.pageBreakAfter[q.id];
    if (layout?.vfill) questionParts.push('#v(1fr)');
    if (layout?.pagebreak) questionParts.push('#pagebreak()');
  });

  const questionBlocks = questionParts.join('\n\n');
  const answerKey = config.showAnswerKey ? generateAnswerKey(config, ordered) : '';

  return `${preamble}

#v(0.8em)

${questionBlocks || '_(No questions selected.)_'}

${answerKey}
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
  const plotImport = needsSimplePlot(allBodies) ? SIMPLE_PLOT_IMPORT : '';
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

  return `${plotImport}#set page(
  paper: "${paper}",
  margin: (top: ${margin}, bottom: ${margin}, left: ${margin}, right: ${margin}),
)
#set text(font: "New Computer Modern", size: ${config.fontSize}pt)
#set par(justify: false, leading: 0.55em)

= ${title}
#v(0.35em)
#context line(length: 100%, stroke: 0.5pt + text.fill)
#v(0.55em)

${questionBlocks || '_(No questions selected.)_'}
`;
}
