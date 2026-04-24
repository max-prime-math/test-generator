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

/** Render the full Typst body for a question, applying choice overrides if set. */
function renderBody(q: Question, config: TestConfig): string {
  const override = config.choiceOverrides?.[q.id];
  const choices  = override?.choices ?? q.choices;
  if (!choices || Object.keys(choices).length < 2) return processBody(q.body);
  // q.choices present → body is stem-only; absent → body has embedded grid, strip it first
  const rawStem = q.choices != null ? q.body : stemOf(q.body);
  return formatBody(processBody(rawStem), choices);
}

/** Resolve the effective solution letter for a question (respects choice overrides). */
function effectiveSolution(q: Question, config: TestConfig): string {
  return config.choiceOverrides?.[q.id]?.solution ?? q.solution ?? '';
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
  const numbered = questions
    .map((q, i) => ({ num: i + 1, sol: effectiveSolution(q, config).trim() }))
    .filter(q => q.sol);
  if (!numbered.length) return '';

  const isMC = (s: string) => /^[A-Ea-e]$/.test(s);
  const mc = numbered.filter(q => isMC(q.sol));
  const fr = numbered.filter(q => !isMC(q.sol));
  const mixed = mc.length > 0 && fr.length > 0;

  const parts: string[] = [];

  if (mc.length) {
    const cols  = Math.min(mc.length, 8);
    const cells = mc.map(q => `[*${q.num}.* ${q.sol.toUpperCase()}]`).join(', ');
    const grid  = `#grid(columns: ${cols}, column-gutter: 1.5em, row-gutter: 0.4em, ${cells})`;
    parts.push(mixed ? `*Multiple Choice*\n#v(0.3em)\n${grid}` : grid);
  }

  if (fr.length) {
    const frBody = fr.map(q => `*${q.num}.* ${q.sol}`).join('\n\n');
    parts.push(mixed ? `*Free Response*\n#v(0.3em)\n${frBody}` : frBody);
  }

  return parts.join('\n\n#v(0.6em)\n\n');
}

export function generateAnswerKeyPage(config: TestConfig, questions: Question[]): string | null {
  const body = buildAnswerKeyBody(questions, config);
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

  const questionBlocks = questions
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

  const answerKey = config.showAnswerKey ? generateAnswerKey(config, questions) : '';

  return `${preamble}

#v(0.8em)

${questionBlocks || '_(No questions selected.)_'}

${answerKey}
`;
}
