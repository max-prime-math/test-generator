import type { Question, TestConfig } from '../types';

/** Escape plain-text config values for use in Typst markup mode. */
function esc(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/#/g, '\\#')
    .replace(/\$/g, '\\$')
    .replace(/@/g, '\\@');
}

export function generateTypst(config: TestConfig, questions: Question[]): string {
  const title        = esc(config.title || 'Math Test');
  const subtitle     = config.subtitle ? esc(config.subtitle) : '';
  const date         = esc(config.date);
  const instructions = esc(config.instructions);

  const questionBlocks = questions
    .map((q, i) => {
      const num = i + 1;
      let pts = '';
      if (config.showPoints) {
        const label = `${q.points} ${q.points === 1 ? 'pt' : 'pts'}`;
        pts = config.pointsBold ? ` *(${label})*` : ` (${label})`;
      }
      return `#block(width: 100%)[
  *${num}.*${pts} ${q.body.trim()}

  #v(${config.answerSpace}cm)
]`;
    })
    .join('\n\n');

  const margin = `${config.marginIn}in`;

  return `\
#set page(
  paper: "${config.paper}",
  margin: (top: ${margin}, bottom: ${margin}, left: ${margin}, right: ${margin}),
)
#set text(font: "New Computer Modern", size: ${config.fontSize}pt)
#set par(justify: false)

#align(center)[
  #text(${config.fontSize + 7}pt, weight: "bold")[${title}]
${subtitle ? `  #v(0.3em)\n  #text(${config.fontSize + 2}pt)[${subtitle}]\n` : ''}\
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
