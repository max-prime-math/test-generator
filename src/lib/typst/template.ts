import type { BubbleSheetMetadata, Question, TestConfig } from '../types.ts';
import { bubbleSheetLayout, BUBBLE_RADIUS_IN, REGISTRATION_MARKER_SIZE_IN, type BubblePoint } from '../bubble-sheet.ts';
import { effectiveAnswer, isMCQ, sortQuestions } from '../mcq.ts';
import { formatBody, formatParts, stemOf } from '../question-format.ts';

export { sortQuestions } from '../mcq.ts';

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

function processBody(body: string): string {
  return body
    .trim()
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split(/\n{2,}/)
    .map((para) => para.replace(/\n/g, '\\\n'))
    .join('\n\n');
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

function isBonusQuestion(q: Question, config: TestConfig): boolean {
  return config.bonusQuestionIds?.includes(q.id) ?? false;
}

function pointLabel(q: Question, config: TestConfig): string {
  const base = `${q.points} ${q.points === 1 ? 'pt' : 'pts'}`;
  return isBonusQuestion(q, config) ? `Bonus, out of ${base}` : base;
}

/** Render the full Typst body for a question, applying choice overrides if set. */
function renderBody(q: Question, config: TestConfig): string {
  const override = config.choiceOverrides?.[q.id];
  const choices  = override?.choices ?? q.choices;
  const parts = q.parts;
  let content = '';
  if (parts?.items.length) {
    const normalized = normalizeParts(parts);
    if (normalized) content = formatParts(normalized, !q.narrative);
  } else {
    content = processBody(q.body);
  }

  if (q.narrative?.trim()) {
    const narrative = processBody(q.narrative);
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

export function generateIndividual(config: TestConfig, questions: Question[]): string[] {
  const preamble = config.customPreamble !== undefined
    ? config.customPreamble
    : generatePreamble(config);

  return questions.map((q, i) => {
    const num     = i + 1;
    const space   = config.answerSpaceOverrides[q.id] ?? config.answerSpace;
    const body    = renderBody(q, config);
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

export function generateTypst(config: TestConfig, questions: Question[]): string {
  const allBodies = questions.map(q => `${q.narrative ?? ''} ${q.body} ${q.graphTypst ?? ''} ${q.solution ?? ''}`).join(' ');
  const plotImport = needsSimplePlot(allBodies) ? SIMPLE_PLOT_IMPORT : '';

  const preamble = config.customPreamble !== undefined
    ? config.customPreamble
    : plotImport + generatePreamble(config);

  const ordered = sortQuestions(questions, config);

  const questionParts: string[] = [];
  ordered.forEach((q, i) => {
    const num     = i + 1;
    const space   = config.answerSpaceOverrides[q.id] ?? config.answerSpace;
    const body    = renderBody(q, config);
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

function inch(value: number): string {
  return `${Number(value.toFixed(3))}in`;
}

function denormalizePoint(point: BubblePoint, page: { width: number; height: number }): { x: number; y: number } {
  return {
    x: point.x * page.width,
    y: point.y * page.height,
  };
}

function placeTypst(point: { x: number; y: number }, body: string): string {
  return `#place(top + left, dx: ${inch(point.x)}, dy: ${inch(point.y)})[${body}]`;
}

function bubbleTypst(center: { x: number; y: number }, filled = false): string {
  const topLeft = {
    x: center.x - BUBBLE_RADIUS_IN,
    y: center.y - BUBBLE_RADIUS_IN,
  };
  const fill = filled ? ', fill: black' : '';
  return placeTypst(topLeft, `#circle(radius: ${inch(BUBBLE_RADIUS_IN)}, stroke: 0.7pt + black${fill})`);
}

function textTypst(point: { x: number; y: number }, text: string, size = 8): string {
  return placeTypst(point, `#text(size: ${size}pt)[${escMeta(text)}]`);
}

function markerTypst(center: { x: number; y: number }): string {
  const topLeft = {
    x: center.x - REGISTRATION_MARKER_SIZE_IN / 2,
    y: center.y - REGISTRATION_MARKER_SIZE_IN / 2,
  };
  return placeTypst(
    topLeft,
    `#rect(width: ${inch(REGISTRATION_MARKER_SIZE_IN)}, height: ${inch(REGISTRATION_MARKER_SIZE_IN)}, fill: black)`,
  );
}

function generateBubbleSheetPageBody(config: TestConfig, metadata: BubbleSheetMetadata): string {
  const layout = bubbleSheetLayout(metadata, metadata.paper || config.paper);
  const page = layout.page;
  const at = (point: BubblePoint) => denormalizePoint(point, page);
  const formDigits = metadata.formCode.padStart(metadata.formCodeLength, '0').split('');
  const parts: string[] = [
    markerTypst(at(layout.markers.topLeft)),
    markerTypst(at(layout.markers.topRight)),
    markerTypst(at(layout.markers.bottomLeft)),
    textTypst({ x: 0.58, y: 0.32 }, 'Bubble Sheet', 18),
    textTypst({ x: 0.58, y: 0.62 }, metadata.subtitle ? `${metadata.title}: ${metadata.subtitle}` : metadata.title, 10),
    textTypst({ x: 0.58, y: 0.88 }, 'Fill bubbles completely with a dark pencil or pen. Do not mark more than one choice per question.', 8),
    textTypst({ x: 1.02, y: 1.18 }, `Form ID ${metadata.formCode}`, 9),
    textTypst({ x: Math.min(page.width - 3.85, 4.72), y: 1.18 }, 'Student code', 9),
    textTypst({ x: Math.min(page.width - 3.85, 4.72), y: 3.35 }, 'Use your roster or school ID code.', 7),
    textTypst({ x: 0.66, y: 3.78 }, 'Answers', 11),
  ];

  layout.formCode.forEach((column, columnIndex) => {
    const labelPoint = at({ x: column.bubbles[0].x, y: column.bubbles[0].y - 0.03 });
    parts.push(textTypst({ x: labelPoint.x - 0.025, y: labelPoint.y - 0.24 }, column.label, 6));
    column.bubbles.forEach((bubble, digit) => {
      const center = at(bubble);
      if (columnIndex === 0) parts.push(textTypst({ x: center.x - 0.3, y: center.y - 0.045 }, String(digit), 6));
      parts.push(bubbleTypst(center, formDigits[columnIndex] === String(digit)));
    });
  });

  layout.studentCode.forEach((column, columnIndex) => {
    const labelPoint = at({ x: column.bubbles[0].x, y: column.bubbles[0].y - 0.03 });
    parts.push(textTypst({ x: labelPoint.x - 0.025, y: labelPoint.y - 0.24 }, column.label, 6));
    column.bubbles.forEach((bubble, digit) => {
      const center = at(bubble);
      if (columnIndex === 0) parts.push(textTypst({ x: center.x - 0.3, y: center.y - 0.045 }, String(digit), 6));
      parts.push(bubbleTypst(center));
    });
  });

  const headerRows = new Set<number>();
  layout.questions.forEach((question) => {
    const label = at(question.labelPosition);
    const rowKey = Math.round(label.x * 10);
    if (!headerRows.has(rowKey)) {
      headerRows.add(rowKey);
      question.bubbles.forEach((bubble) => {
        const center = at(bubble.center);
        parts.push(textTypst({ x: center.x - 0.035, y: label.y - 0.34 }, bubble.choice, 7));
      });
    }
    parts.push(textTypst({ x: label.x, y: label.y - 0.055 }, question.label, 7));
    question.bubbles.forEach((bubble) => {
      parts.push(bubbleTypst(at(bubble.center)));
    });
  });

  return parts.join('\n');
}

export function generateBubbleSheetTypst(config: TestConfig, metadata: BubbleSheetMetadata): string {
  return `#set page(paper: "${metadata.paper || config.paper}", margin: 0in)
#set text(font: "New Computer Modern", size: 10pt)
#set par(justify: false)

${generateBubbleSheetPageBody(config, metadata)}
`;
}

export function generateTypstWithBubbleSheet(config: TestConfig, questions: Question[], metadata: BubbleSheetMetadata): string {
  const testSource = generateTypst({ ...config, showAnswerKey: false }, questions).trimEnd();
  return `${testSource}

#pagebreak()
${generateBubbleSheetTypst(config, metadata)}`;
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

export function generateBankReviewTypst(config: TestConfig, questions: Question[]): string {
  const allBodies = questions
    .map((q) => `${q.narrative ?? ''} ${q.body} ${q.graphTypst ?? ''} ${q.solution ?? ''} ${Object.values(q.choices ?? {}).join(' ')}`)
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
    const body = renderBody(q, reviewConfig);
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
