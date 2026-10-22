import { stemOf } from './question-format.ts';

export type SnippetPart = { kind: 'text' | 'math'; value: string };

const CONTENT_FUNCTIONS = new Set(['text', 'strong', 'emph', 'underline', 'smallcaps', 'super', 'sub', 'box', 'block', 'align', 'pad']);
const HIDDEN_FUNCTIONS = new Set(['hide', 'metadata']);
const STATEMENTS = new Set(['let', 'set', 'show', 'import', 'include']);
const LIMIT = 220;
const MAX_MATH = 600;

function commentEnd(source: string, start: number): number | null {
  if (source.startsWith('//', start)) {
    if (source[start - 1] === ':') return null;
    const end = source.indexOf('\n', start + 2);
    return end < 0 ? source.length : end + 1;
  }
  if (!source.startsWith('/*', start)) return null;
  let depth = 1;
  for (let i = start + 2; i < source.length; i++) {
    if (source.startsWith('/*', i)) { depth++; i++; }
    else if (source.startsWith('*/', i)) {
      if (--depth === 0) return i + 2;
      i++;
    }
  }
  return source.length;
}

/** Find the end of a Typst group without mistaking quoted or escaped delimiters for syntax. */
function groupEnd(source: string, start: number): number {
  const pairs: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
  const stack = [pairs[source[start]]];
  let quoted = false;
  for (let i = start + 1; i < source.length; i++) {
    const c = source[i];
    if (c === '\\') { i++; continue; }
    if (c === '"') { quoted = !quoted; continue; }
    if (quoted) continue;
    const comment = commentEnd(source, i);
    if (comment !== null) { i = comment - 1; continue; }
    if (c === '$') {
      const end = mathEnd(source, i);
      if (end !== -1) { i = end; continue; }
    }
    if (pairs[c]) stack.push(pairs[c]);
    else if (c === stack.at(-1)) stack.pop();
    if (!stack.length) return i + 1;
  }
  return source.length;
}

function mathEnd(source: string, start: number): number {
  let quoted = false;
  for (let i = start + 1; i < source.length; i++) {
    if (source[i] === '\\') { i++; continue; }
    if (source[i] === '"') quoted = !quoted;
    if (source[i] === '$' && !quoted) return i;
  }
  return -1;
}

function statementEnd(source: string, start: number): number {
  let quoted = false;
  for (let i = start; i < source.length; i++) {
    const c = source[i];
    if (c === '\\') { i++; continue; }
    if (c === '"') quoted = !quoted;
    if (quoted) continue;
    const comment = commentEnd(source, i);
    if (comment !== null) {
      if (source.startsWith('//', i)) return comment;
      i = comment - 1;
      continue;
    }
    if (c === '(' || c === '[' || c === '{') i = groupEnd(source, i) - 1;
    else if (c === '\n' || c === ';') return i + 1;
  }
  return source.length;
}

/** A short, readable stem. Math stays intact; drawing code and MCQ grids stay in the full preview. */
export function questionSnippet(body: string): SnippetPart[] {
  const source = stemOf(body).trim();
  const parts: SnippetPart[] = [];
  let length = 0;
  let truncated = false;
  const text = (value: string) => {
    value = value.replace(/\s+/g, ' ');
    const last = parts.at(-1);
    if (!last || (last.kind === 'text' && last.value.endsWith(' '))) value = value.trimStart();
    if (!value) return;
    const remaining = Math.max(0, LIMIT - length);
    if (value.length > remaining) { value = value.slice(0, remaining); truncated = true; }
    length += value.length;
    if (last?.kind === 'text') last.value += value;
    else parts.push({ kind: 'text', value });
  };

  function quotedEnd(fragment: string, start: number): number {
    for (let i = start + 1; i < fragment.length; i++) {
      if (fragment[i] === '\\') i++;
      else if (fragment[i] === '"') return i + 1;
    }
    return fragment.length;
  }

  function stringText(value: string) {
    text(value.replace(/\\(u\{[\da-f]+\}|[nrt"\\])/gi, (escaped, code: string) => {
      if (code.startsWith('u{')) {
        const point = parseInt(code.slice(2, -1), 16);
        return point <= 0x10ffff ? String.fromCodePoint(point) : escaped;
      }
      return ({ n: '\n', r: '\r', t: '\t', '"': '"', '\\': '\\' } as Record<string, string>)[code] ?? escaped;
    }));
  }

  // Only inspect content arguments of known formatting functions. Their named
  // styling options and arbitrary drawing/data arguments are not question text.
  function visitArguments(fragment: string, depth: number) {
    let start = 0;
    for (let i = 0; i <= fragment.length; i++) {
      const c = fragment[i];
      const comment = commentEnd(fragment, i);
      if (comment !== null) { i = comment - 1; continue; }
      if (c === '"') { i = quotedEnd(fragment, i) - 1; continue; }
      if (c === '(' || c === '[' || c === '{') { i = groupEnd(fragment, i) - 1; continue; }
      if (c !== ',' && i !== fragment.length) continue;
      const argument = fragment.slice(start, i).trim();
      if (argument.startsWith('[') && groupEnd(argument, 0) === argument.length) {
        visit(argument.slice(1, -1), depth + 1);
      } else if (argument.startsWith('"') && quotedEnd(argument, 0) === argument.length) {
        stringText(argument.slice(1, -1));
      }
      start = i + 1;
    }
  }

  // A context/code block can return readable content. Skip its setup statements
  // and function internals, extracting only explicit content and formatting calls.
  function visitCode(fragment: string, depth: number) {
    if (depth > 24) return;
    for (let i = 0; i < fragment.length && length < LIMIT;) {
      const c = fragment[i];
      const comment = commentEnd(fragment, i);
      if (comment !== null) { i = comment; continue; }
      if (c === '[') {
        const end = groupEnd(fragment, i);
        visit(fragment.slice(i + 1, end - 1), depth + 1);
        i = end;
      } else if (c === '"') {
        const end = quotedEnd(fragment, i);
        stringText(fragment.slice(i + 1, end - 1));
        i = end;
      } else {
        const name = fragment.slice(i).match(/^[a-zA-Z][\w.-]*/)?.[0];
        if (!name) { i++; continue; }
        if (STATEMENTS.has(name)) { i = statementEnd(fragment, i + name.length); continue; }
        let end = i + name.length;
        while (/\s/.test(fragment[end] ?? '') && end < fragment.length) end++;
        if (fragment[end] === '(') end = groupEnd(fragment, end);
        while (/\s/.test(fragment[end] ?? '') && end < fragment.length) end++;
        if (fragment[end] === '[') end = groupEnd(fragment, end);
        visit(`#${fragment.slice(i, end)}`, depth + 1);
        i = end;
      }
    }
  }

  function visit(fragment: string, depth = 0) {
    if (depth > 24) return;
    for (let i = 0; i < fragment.length;) {
      if (length >= LIMIT) { truncated = true; break; }
      const c = fragment[i];
      const comment = commentEnd(fragment, i);
      if (comment !== null) { i = comment; continue; }
      if (c === '\\' && i + 1 < fragment.length) { text(fragment[i + 1]); i += 2; continue; }
      if (c === '$') {
        const end = mathEnd(fragment, i);
        if (end !== -1) {
          const value = fragment.slice(i + 1, end).trim();
          if (value && value.length <= MAX_MATH) {
            parts.push({ kind: 'math', value });
            length += value.length;
          } else if (value) text(value);
          i = end + 1;
          continue;
        }
        // An unfinished equation remains readable and editable, without a dangling dollar sign.
        i++;
        continue;
      }
      if (c === '#') {
        if (fragment[i + 1] === '{') {
          const end = groupEnd(fragment, i + 1);
          visitCode(fragment.slice(i + 2, end - 1), depth + 1);
          i = end;
          continue;
        }
        const name = fragment.slice(i).match(/^#([a-zA-Z][\w.-]*)/)?.[1];
        if (name) {
          if (STATEMENTS.has(name)) {
            i = statementEnd(fragment, i + name.length + 1);
            continue;
          }
          let end = i + name.length + 1;
          while (/\s/.test(fragment[end] ?? '') && end < fragment.length) end++;
          if (fragment[end] === '(') {
            const close = groupEnd(fragment, end);
            if (CONTENT_FUNCTIONS.has(name)) visitArguments(fragment.slice(end + 1, close - 1), depth);
            end = close;
          }
          while (/\s/.test(fragment[end] ?? '') && end < fragment.length) end++;
          if (fragment[end] === '[' || fragment[end] === '{') {
            const close = groupEnd(fragment, end);
            if (fragment[end] === '[' && !HIDDEN_FUNCTIONS.has(name)) visit(fragment.slice(end + 1, close - 1), depth + 1);
            if (fragment[end] === '{' && name === 'context') visitCode(fragment.slice(end + 1, close - 1), depth + 1);
            end = close;
          } else if (name === 'context') {
            const expression = end;
            const call = fragment.slice(end).match(/^[a-zA-Z][\w.-]*/)?.[0];
            if (call) {
              end += call.length;
              while (fragment[end] === ' ' || fragment[end] === '\t') end++;
              if (fragment[end] === '(') end = groupEnd(fragment, end);
              while (fragment[end] === ' ' || fragment[end] === '\t') end++;
              if (fragment[end] === '[') end = groupEnd(fragment, end);
              visitCode(fragment.slice(expression, end), depth + 1);
            }
          }
          if (name === 'image') text('[Image]');
          if (name === 'linebreak' || name === 'parbreak') text(' ');
          i = end;
          continue;
        }
      }
      if (c === '<') {
        const label = fragment.slice(i).match(/^<[\w:.-]+>/)?.[0];
        if (label) { i += label.length; continue; }
      }
      if (c !== '*' && c !== '_' && c !== '`') text(c);
      i++;
    }
  }

  visit(source);
  // Normalize whitespace only after joining text, so spaces around equations are preserved.
  for (const part of parts) if (part.kind === 'text') part.value = part.value.replace(/\s+/g, ' ');
  if (parts[0]?.kind === 'text') parts[0].value = parts[0].value.trimStart();
  if (parts.at(-1)?.kind === 'text') parts.at(-1)!.value = parts.at(-1)!.value.trimEnd();
  if (truncated) {
    const last = parts.at(-1);
    if (last?.kind === 'text') last.value = last.value.trimEnd() + '…';
    else parts.push({ kind: 'text', value: '…' });
  }
  if (!parts.some(part => part.value)) return [{ kind: 'text', value: source ? 'Formatted question' : 'Empty question' }];
  return parts.filter(part => part.value);
}
