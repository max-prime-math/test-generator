/** Detect and strip a leading MCQ answer label from a solution line. */
export function stripLeadingAnswerLabel(line: string): { letter: string; text: string } {
  const trimmed = line.trim();
  if (!trimmed) return { letter: '', text: '' };

  const single = /^\(?([A-Ea-e])\)?\.?\s*$/.exec(trimmed);
  if (single) return { letter: single[1].toUpperCase(), text: '' };

  const inline = /^\(?([A-Ea-e])\)?\.?\s+(.*)$/.exec(trimmed);
  if (inline) return { letter: inline[1].toUpperCase(), text: inline[2].trim() };

  return { letter: '', text: trimmed };
}

function formatEnumItem(body: string): string {
  const lines = body.trim().split('\n');
  if (lines.length === 0) return '+';
  const [first, ...rest] = lines;
  const out = [`+ ${first.trimEnd()}`];
  for (const line of rest) {
    out.push(line.trim().length > 0 ? `  ${line}` : '  ');
  }
  return out.join('\n');
}

type ExamListLevel = 'parts' | 'subparts' | 'subsubparts';

const EXAM_LIST_SPECS: Record<ExamListLevel, { marker: string; numbering: string }> = {
  parts: { marker: 'part', numbering: '(a)' },
  subparts: { marker: 'subpart', numbering: '(i)' },
  subsubparts: { marker: 'subsubpart', numbering: '(1)' },
};

function convertExamListBlock(text: string, level: ExamListLevel): string {
  const { marker, numbering } = EXAM_LIST_SPECS[level];
  const re = new RegExp(String.raw`\\begin\s*\{${level}\}([\s\S]*?)\\end\s*\{${level}\}`, 'gi');
  return text.replace(re, (_, body: string) => renderExamList(body, marker, numbering));
}

function renderExamList(body: string, marker: string, numbering: string): string {
  const markerRe = new RegExp(String.raw`^\s*\\${marker}\b(?:\s*\[[^\]]*\])?\s*(.*)$`, 'i');
  const lines = body.split('\n');
  const prefix: string[] = [];
  const items: string[][] = [];
  let current: string[] | null = null;

  for (const line of lines) {
    const m = markerRe.exec(line);
    if (m) {
      current = [];
      items.push(current);
      if (m[1]?.trim()) current.push(m[1].trimEnd());
      continue;
    }

    if (current) current.push(line);
    else prefix.push(line);
  }

  if (items.length === 0) return body;

  const listBody = [
    '#block[',
    `  #set enum(numbering: "${numbering}", indent: 0pt, body-indent: 0.8em)`,
    ...items.map((item) => `  ${formatEnumItem(item.join('\n'))}`),
    ']',
  ].join('\n');

  const intro = prefix.join('\n').trim();
  return [intro, listBody].filter(Boolean).join('\n\n');
}

/**
 * Convert exam-class `parts`/`subparts`/`subsubparts` environments into
 * nested Typst numbered lists.
 */
export function convertPartsEnvironment(text: string): string {
  let out = text;
  out = convertExamListBlock(out, 'subsubparts');
  out = convertExamListBlock(out, 'subparts');
  out = convertExamListBlock(out, 'parts');
  return out;
}

/** Convert LaTeX line breaks into Typst line breaks outside math mode. */
export function convertLatexLineBreaks(text: string): string {
  return text.replace(/\\\\(?:\*?\s*(?:\[[^\]]*\])?)?/g, '#linebreak()');
}
