import type { Question, TestConfig } from '../types';

/** Escape plain-text config values for use in Typst markup mode. */
function esc(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/#/g, '\\#')
    .replace(/\$/g, '\\$')
    .replace(/@/g, '\\@');
}

/**
 * Convert user-entered newlines into Typst line breaks.
 *
 * In Typst markup mode a single newline is just whitespace. We replace each
 * single newline with a Typst forced line break (`\` immediately before the
 * newline) so that the user's visual structure (part a / part b, etc.) is
 * preserved. Double newlines (paragraph breaks) are left alone.
 */
function processBody(body: string): string {
  return body
    .trim()
    .replace(/\r\n/g, '\n')          // normalise CRLF
    .split(/\n{2,}/)                  // split on paragraph breaks
    .map((para) => para.replace(/\n/g, '\\\n'))  // single newline → Typst line break
    .join('\n\n');                    // restore paragraph breaks
}

/**
 * Generate the Typst preamble: page settings, title block, name/date line,
 * and instructions. Everything that appears before the question blocks.
 *
 * Exported so the UI can pre-fill the custom preamble textarea.
 */
export function generatePreamble(config: TestConfig): string {
  const title        = esc(config.title || 'Math Test');
  const subtitle     = config.subtitle ? esc(config.subtitle) : '';
  const date         = esc(config.date);
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

/** One Typst source per selected question, using the same page/text settings. */
export function generateIndividual(config: TestConfig, questions: Question[]): string[] {
  const preamble = config.customPreamble !== undefined
    ? config.customPreamble
    : generatePreamble(config);

  return questions.map((q, i) => {
    const num   = i + 1;
    const space = config.answerSpaceOverrides[q.id] ?? config.answerSpace;
    const body  = processBody(q.body);
    const label = `${q.points} ${q.points === 1 ? 'pt' : 'pts'}`;
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

/** Standalone answer key page (page settings + answers only, no test header). */
export function generateAnswerKeyPage(config: TestConfig, questions: Question[]): string | null {
  const margin = `${config.marginIn}in`;
  const numbered = questions
    .map((q, i) => ({ num: i + 1, sol: q.solution?.trim() ?? '' }))
    .filter(q => q.sol);
  if (!numbered.length) return null;

  const isMC = (s: string) => /^[A-Ea-e]$/.test(s);
  const mc = numbered.filter(q => isMC(q.sol));
  const fr = numbered.filter(q => !isMC(q.sol));

  let body = `*Answer Key*\n#v(0.3em)\n#context line(length: 100%, stroke: 0.5pt + text.fill)\n#v(0.75em)\n\n`;
  if (mc.length) {
    const cells = mc.map(q => `[*${q.num}.* ${q.sol.toUpperCase()}]`).join(', ');
    body += `#grid(columns: 5, column-gutter: 2em, row-gutter: 0.5em, ${cells})`;
  }
  if (fr.length) {
    if (mc.length) body += '\n\n#v(0.75em)\n\n';
    body += fr.map(q => `*${q.num}.* ${q.sol}`).join('\n\n');
  }

  return `#set page(
  paper: "${config.paper}",
  margin: (top: ${margin}, bottom: ${margin}, left: ${margin}, right: ${margin}),
)
#set text(font: "New Computer Modern", size: ${config.fontSize}pt)
#set par(justify: false)

${body}`;
}

function generateAnswerKey(questions: Question[]): string {
  const numbered = questions.map((q, i) => ({ num: i + 1, sol: q.solution?.trim() ?? '' }))
    .filter(q => q.sol);
  if (!numbered.length) return '';

  const isMC = (s: string) => /^[A-Ea-e]$/.test(s);
  const mc = numbered.filter(q => isMC(q.sol));
  const fr = numbered.filter(q => !isMC(q.sol));

  const header = `#pagebreak()
*Answer Key*
#v(0.3em)
#context line(length: 100%, stroke: 0.5pt + text.fill)
#v(0.75em)`;

  let body = '';

  if (mc.length) {
    const cells = mc.map(q => `[*${q.num}.* ${q.sol.toUpperCase()}]`).join(', ');
    body += `#grid(columns: 5, column-gutter: 2em, row-gutter: 0.5em, ${cells})`;
  }

  if (fr.length) {
    if (mc.length) body += '\n\n#v(0.75em)\n\n';
    body += fr.map(q => `*${q.num}.* ${q.sol}`).join('\n\n');
  }

  return `${header}\n\n${body}`;
}

export function generateTypst(config: TestConfig, questions: Question[]): string {
  const preamble = config.customPreamble !== undefined
    ? config.customPreamble
    : generatePreamble(config);

  const questionBlocks = questions
    .map((q, i) => {
      const num   = i + 1;
      const space = config.answerSpaceOverrides[q.id] ?? config.answerSpace;
      const body  = processBody(q.body);

      // Points label sits at the start of the body column
      const label   = `${q.points} ${q.points === 1 ? 'pt' : 'pts'}`;
      const ptsText = config.showPoints
        ? (config.pointsBold ? `*(${label})* ` : `(${label}) `)
        : '';

      // Two-column grid: auto-width number | 1fr body
      // This keeps continuation lines and (a)/(b) parts indented under the
      // body text, not hanging back to the question number column.
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

  const answerKey = config.showAnswerKey ? generateAnswerKey(questions) : '';

  return `${preamble}

#v(0.8em)

${questionBlocks || '_(No questions selected.)_'}

${answerKey}
`;
}
