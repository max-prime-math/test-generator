/** Normalize MiTeX output into plain Typst math. */
export function normalizeMiTeXOutput(src: string): string {
  const cleaned = src
    .replace(/\\([(){}\[\]])/g, '$1')
    .replace(/\s*\\\[\s*/g, ' ')
    .replace(/\s*\\\]\s*/g, ' ')
    .replace(/\blr\s*\(\s*(?=[([{|])/g, '')
    .replace(/\bmitex([a-zA-Z]+)\(/g, '$1(')
    .replace(/\b(?:Bigg?|bigg?)\b/g, '')
    .replace(/\b([A-Za-z]+)\s+_/g, '$1_')
    .replace(/\b([A-Za-z]+)\s+\(/g, '$1(')
    .replace(/\(\s+/g, '(')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+\)/g, ')')
    .replace(/\s+,/g, ', ')
    .trim();

  let balance = 0;
  let result = '';
  for (const ch of cleaned) {
    if (ch === '(') {
      balance++;
      result += ch;
      continue;
    }
    if (ch === ')') {
      if (balance === 0) continue;
      balance--;
      result += ch;
      continue;
    }
    result += ch;
  }

  return result.trim();
}

/** Strip LaTeX document-level wrappers and preamble commands from pasted text. */
export function stripDocumentWrappers(src: string): string {
  return src
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (/^\\documentclass\b/i.test(trimmed)) return '';
      if (/^\\usepackage\b/i.test(trimmed)) return '';
      if (/^\\(?:title|author|date)\b/i.test(trimmed)) return '';
      if (/^\\(?:newcommand|renewcommand|providecommand|DeclareMathOperator)\b/i.test(trimmed)) return '';
      if (/^\\(?:sub)?section(?:\*?)\s*\{.*\}\s*$/i.test(trimmed)) return '';
      if (/^\\subsubsection(?:\*?)\s*\{.*\}\s*$/i.test(trimmed)) return '';
      if (/^\\begin\s*\{(?:center|flushleft|flushright)\}\s*$/i.test(trimmed)) return '';
      if (/^\\end\s*\{(?:center|flushleft|flushright)\}\s*$/i.test(trimmed)) return '';
      if (/^\\begin\s*\{document\}\s*$/i.test(trimmed)) return '';
      if (/^\\end\s*\{document\}\s*$/i.test(trimmed)) return '';
      return line;
    })
    .join('\n');
}
