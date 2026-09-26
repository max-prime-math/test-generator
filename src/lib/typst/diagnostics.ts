/**
 * Parse the raw Rust Debug-format SourceDiagnostic array that the Typst WASM
 * throws on compile failure into a compact, human-readable string.
 *
 * Input example:
 *   [SourceDiagnostic { severity: Error, span: Span(123), message: "unclosed delimiter", trace: [], hints: [] }]
 * Output:
 *   Unclosed delimiter
 */
export function parseTypstError(raw: string): string {
  // Extract all message: "..." values (handle \" escapes inside)
  const messages: string[] = [];
  const msgRe = /\bmessage:\s*"((?:[^"\\]|\\.)*)"/g;
  let m: RegExpExecArray | null;
  while ((m = msgRe.exec(raw)) !== null) {
    const msg = m[1].replace(/\\"/g, '"').replace(/\\n/g, ' ').replace(/\\\\/g, '\\').trim();
    if (msg && !messages.includes(msg)) messages.push(msg);
  }

  // Extract non-empty hints: ["..."] blocks
  const hints: string[] = [];
  const hintBlockRe = /\bhints:\s*\[([^\]]+)\]/g;
  while ((m = hintBlockRe.exec(raw)) !== null) {
    const strRe = /"((?:[^"\\]|\\.)*)"/g;
    let sm: RegExpExecArray | null;
    while ((sm = strRe.exec(m[1])) !== null) {
      const h = sm[1].replace(/\\"/g, '"').trim();
      if (h && !hints.includes(h)) hints.push(h);
    }
  }

  if (messages.length === 0) return raw; // not a known format — return as-is

  const lines = messages.map(msg => msg.charAt(0).toUpperCase() + msg.slice(1));
  hints.forEach(h => lines.push(`Hint: ${h}`));
  return lines.join('\n');
}

export function formatError(e: unknown): string {
  const raw = e instanceof Error ? e.message : typeof e === 'string' ? e : (() => { try { return JSON.stringify(e); } catch { return String(e); } })();
  return parseTypstError(raw);
}

/**
 * Scan Typst source for unmatched delimiters and return a human-readable
 * location string with a code-snippet pointer, or null if nothing is found.
 *
 * Handles: $ (math toggle), ( [ { ) ] }
 * Skips:   // line comments, `raw` spans
 */
export function findDelimiterIssues(source: string): string | null {
  const srcLines = source.split('\n');

  function lineCol(offset: number): { line: number; col: number } {
    let line = 1, col = 1;
    for (let k = 0; k < offset && k < source.length; k++) {
      if (source[k] === '\n') { line++; col = 1; } else { col++; }
    }
    return { line, col };
  }

  function snippet(line: number, col: number): string {
    const text = srcLines[line - 1] ?? '';
    const ptr  = ' '.repeat(Math.max(0, col - 1)) + '^';
    return `  ${text}\n  ${ptr}`;
  }

  const stack: { ch: string; offset: number }[] = [];
  const closes: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
  let mathOpen: number | null = null;
  let i = 0;

  while (i < source.length) {
    const ch = source[i];

    // skip // line comments
    if (ch === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') i++;
      continue;
    }

    // skip `raw` spans (backtick-delimited, no nesting)
    if (ch === '`') {
      i++;
      while (i < source.length && source[i] !== '`') i++;
      i++;
      continue;
    }

    // $ toggles math mode
    if (ch === '$') {
      if (mathOpen === null) mathOpen = i;
      else mathOpen = null;
      i++;
      continue;
    }

    if ('([{'.includes(ch)) {
      stack.push({ ch, offset: i });
    } else if (')]}'.includes(ch)) {
      const expected = closes[ch];
      if (stack.length > 0 && stack[stack.length - 1].ch === expected) {
        stack.pop();
      } else {
        const { line, col } = lineCol(i);
        return `Line ${line}, col ${col}: unexpected '${ch}'\n${snippet(line, col)}`;
      }
    }

    i++;
  }

  if (mathOpen !== null) {
    const { line, col } = lineCol(mathOpen);
    return `Line ${line}, col ${col}: unclosed math delimiter ($)\n${snippet(line, col)}`;
  }
  if (stack.length > 0) {
    const { ch, offset } = stack[0];
    const { line, col } = lineCol(offset);
    return `Line ${line}, col ${col}: unclosed '${ch}'\n${snippet(line, col)}`;
  }

  return null;
}
