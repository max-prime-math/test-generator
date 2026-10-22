import { stemOf } from './question-format.ts';

export type SnippetPart = { kind: 'text' | 'math'; value: string };

const CONTENT_FUNCTIONS = new Set(['text', 'strong', 'emph', 'underline', 'smallcaps', 'super', 'sub', 'box', 'block', 'align', 'pad']);
const LIMIT = 220;
const MAX_MATH = 600;

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
    if (c === '(' || c === '[' || c === '{') i = groupEnd(source, i) - 1;
    else if (c === '\n') return i + 1;
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
    if (!value) return;
    const remaining = Math.max(0, LIMIT - length);
    if (value.length > remaining) { value = value.slice(0, remaining); truncated = true; }
    length += value.length;
    const last = parts.at(-1);
    if (last?.kind === 'text') last.value += value;
    else parts.push({ kind: 'text', value });
  };

  function visit(fragment: string, depth = 0) {
    if (depth > 8) return;
    for (let i = 0; i < fragment.length;) {
      if (length >= LIMIT) { truncated = true; break; }
      const c = fragment[i];
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
        const name = fragment.slice(i).match(/^#([a-zA-Z][\w.-]*)/)?.[1];
        if (name) {
          if (['let', 'set', 'show', 'import', 'include'].includes(name)) {
            i = statementEnd(fragment, i + name.length + 1);
            continue;
          }
          let end = i + name.length + 1;
          while (fragment[end] === ' ' || fragment[end] === '\t') end++;
          if (fragment[end] === '(') end = groupEnd(fragment, end);
          while (fragment[end] === ' ' || fragment[end] === '\t') end++;
          if (fragment[end] === '[' || fragment[end] === '{') {
            const close = groupEnd(fragment, end);
            if (fragment[end] === '[' && CONTENT_FUNCTIONS.has(name)) visit(fragment.slice(end + 1, close - 1), depth + 1);
            end = close;
          }
          if (name === 'image') text('[Image]');
          if (name === 'linebreak' || name === 'parbreak') text(' ');
          i = end;
          continue;
        }
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
