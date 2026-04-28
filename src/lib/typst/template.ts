import type { Question, TestConfig } from '../types';
import { formatBody, stemOf } from '../question-format';

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
    .split(/\n{2,}/)
    .map((para) => para.replace(/\n/g, '\\\n'))
    .join('\n\n');
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
function renderBody(q: Question, config: TestConfig): string {
  const override = config.choiceOverrides?.[q.id];
  const choices  = override?.choices ?? q.choices;
  if (!choices || Object.keys(choices).length < 2) return processBody(q.body);
  // q.choices present → body is stem-only; absent → body has embedded grid, strip it first
  const rawStem = q.choices != null ? q.body : stemOf(q.body);
  return formatBody(processBody(rawStem), choices);
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

  return `#import "@preview/simple-plot:0.3.0": plot
#set page(
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
    const label   = `${q.points} ${q.points === 1 ? 'pt' : 'pts'}`;
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
  const preamble = config.customPreamble !== undefined
    ? config.customPreamble
    : generatePreamble(config);

  const ordered = sortQuestions(questions, config);

  const questionBlocks = ordered
    .map((q, i) => {
      const num     = i + 1;
      const space   = config.answerSpaceOverrides[q.id] ?? config.answerSpace;
      const body    = renderBody(q, config);
      const label   = `${q.points} ${q.points === 1 ? 'pt' : 'pts'}`;
      const ptsText = config.showPoints
        ? (config.pointsBold ? `*(${label})* ` : `(${label}) `)
        : '';

      return `#block(width: 100%)[
  #grid(
    columns: (auto, 1fr),
    column-gutter: 0.5em,
    align: top,
    [*${num}.*], [${ptsText}${body}],
  )
  #v(${space}cm)
]`;
    })
    .join('\n\n');

  const answerKey = config.showAnswerKey ? generateAnswerKey(config, ordered) : '';

  return `${preamble}

#v(0.8em)

${questionBlocks || '_(No questions selected.)_'}

${answerKey}
`;
}
