import type { Question, TestConfig } from '../types';

/** Escape a string for use as Typst literal content (not markup). */
function esc(s: string): string {
  // In Typst, these characters have special meaning in markup mode:
  // _ * ` < > @ \ # $ [ ]
  // Since question bodies are already Typst markup, we don't escape them.
  // This function is only for config values (title, date, etc.) that are
  // plain text, not markup.
  return s
    .replace(/\\/g, '\\\\')
    .replace(/#/g, '\\#')
    .replace(/\$/g, '\\$')
    .replace(/@/g, '\\@');
}

export function generateTypst(config: TestConfig, questions: Question[]): string {
  const title = esc(config.title || 'Math Test');
  const subtitle = config.subtitle ? esc(config.subtitle) : '';
  const date = esc(config.date);
  const instructions = esc(config.instructions);

  const questionBlocks = questions
    .map((q, i) => {
      const num = i + 1;
      const pts = config.showPoints
        ? ` _(${q.points} ${q.points === 1 ? 'pt' : 'pts'})_`
        : '';
      // Plain paragraph — no enum syntax, no risk of numbering conflicts
      return `#block(width: 100%)[
  *${num}.*${pts} ${q.body.trim()}

  #v(${config.answerSpace}cm)
]`;
    })
    .join('\n\n');

  return `\
#set page(
  paper: "us-letter",
  margin: (top: 1in, bottom: 1in, left: 1in, right: 1in),
)
#set text(font: "New Computer Modern", size: 11pt)
#set par(justify: false)

#align(center)[
  #text(18pt, weight: "bold")[${title}]
${subtitle ? `  #v(0.3em)\n  #text(13pt)[${subtitle}]\n` : ''}\
  #v(0.3em)
  ${date}
]

#v(0.5em)
#line(length: 100%)
#v(0.5em)

Name: #underline[#h(3in)] #h(1fr) Date: #underline[#h(1.5in)]

#v(1em)

_${instructions}_

#v(0.8em)

${questionBlocks || '_(No questions selected.)_'}
`;
}
