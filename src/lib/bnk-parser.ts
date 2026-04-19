/**
 * ExamView .bnk file parser.
 *
 * Format: 16-byte header ("FSCBNK…") + zlib-compressed UTF-16 LE payload.
 * Questions are located by difficulty markers (Easy / Average / Difficult).
 * Variable definitions use null-byte separators: {meta_char}name\x00expr\x00sample\x00
 * The \x0f→variable mapping is given by a separate X-map section: \x00X\x00varname\x00
 */

export interface BnkVar {
  name: string;
  expression: string;
  sample: string;
}

export interface BnkQuestion {
  difficulty: 'Easy' | 'Average' | 'Difficult';
  section: string;
  topic: string;
  subtopic: string;
  choices: Record<string, string>;
  body: string;
  solution: string;
  points: number;
  variables: BnkVar[];
  varOrder: string[];
  rawBody: string;
  rawChoices: Record<string, string>;
  choiceFileOrder: string[];
  rawConstraints: string[];
}

export interface BnkBank {
  subject: string;
  title: string;
  sections: { id: string; name: string }[];
  questions: BnkQuestion[];
}

// ── Decompression ─────────────────────────────────────────────────────────────

async function zlibDecompress(bytes: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate');
  const writer = ds.writable.getWriter();
  const reader = ds.readable.getReader();
  writer.write(bytes);
  writer.close();

  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

// ── UTF-16 LE decoder ─────────────────────────────────────────────────────────

function decodeUtf16le(bytes: Uint8Array): string {
  const len = Math.floor(bytes.length / 2);
  const chars: string[] = [];
  for (let i = 0; i < len; i++) {
    const code = bytes[i * 2] | (bytes[i * 2 + 1] << 8);
    chars.push(String.fromCharCode(code));
  }
  return chars.join('');
}

// ── Typst-safe formatting ─────────────────────────────────────────────────────

function escapeTypst(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/\*/g, '\\*')
    .replace(/\$/g, '\\$')
    .replace(/@/g, '\\@')
    .replace(/#/g, '\\#')
    .replace(/_/g, '\\_')
    .replace(/</g, '\\<')
    .replace(/>/g, '\\>');
}

const BLANK = '#underline[#h(1.5em)]';

function toTypst(raw: string): string {
  return raw
    .split('\x0f')
    .map(seg => escapeTypst(seg.replace(/[^\x20-\x7e]/g, '')))
    .join(BLANK)
    .trim();
}

// Preserves \x0f for later variable substitution.
function toTypstRaw(raw: string): string {
  return raw
    .split('\x0f')
    .map(seg => escapeTypst(seg.replace(/[^\x20-\x7e]/g, '')))
    .join('\x0f')
    .trim();
}

// ── Question text extraction ──────────────────────────────────────────────────

function extractText(content: string, raw: boolean): string {
  const ansPos = content.indexOf('\x10');
  const pre = ansPos !== -1 ? content.slice(0, ansPos) : content.slice(0, 600);

  const runs = [...pre.matchAll(/[A-Za-z][a-z ,\.\?\!\x0f\-\(\)0-9\'"=+*$%]{15,}/g)];
  if (!runs.length) return '';
  const text = runs[runs.length - 1][0];
  return raw ? toTypstRaw(text) : toTypst(text);
}

// ── Answer choice extraction ──────────────────────────────────────────────────

function extractChoicesImpl(
  content: string,
  raw: boolean,
): { dict: Record<string, string>; fileOrder: string[] } {
  const ansPos = content.indexOf('\x10');
  if (ansPos === -1) return { dict: {}, fileOrder: [] };

  const section = content.slice(ansPos + 1, ansPos + 400);
  const dict: Record<string, string> = {};
  const fileOrder: string[] = [];

  for (const m of section.matchAll(/([A-D])\x11([^\x11\x10\x00]{0,100})\x11/g)) {
    const letter = m[1];
    const text = raw ? toTypstRaw(m[2]) : toTypst(m[2]);
    if (text) {
      dict[letter] = text;
      fileOrder.push(letter);
    }
  }
  return { dict, fileOrder };
}

// ── Body formatter ────────────────────────────────────────────────────────────

export function formatBody(stem: string, choices: Record<string, string>): string {
  const letters = ['A', 'B', 'C', 'D', 'E'].filter(l => choices[l]);
  if (!letters.length) return stem;

  const cols = letters.length >= 4 ? 2 : 1;
  const cells = letters.map(l => `[*(${l})* ${choices[l]}]`).join(', ');
  const colDef = Array(cols).fill('1fr').join(', ');
  const grid = `#grid(columns: (${colDef}), column-gutter: 1.5em, row-gutter: 0.6em, ${cells})`;

  return `${stem}\n\n${grid}`;
}

// ── Variable block parser ─────────────────────────────────────────────────────

export function parseVarBlock(content: string): {
  vars: BnkVar[];
  varOrder: string[];
  constraints: string[];
} {
  const varMap = new Map<string, BnkVar>();
  const constraintSet = new Set<string>();
  const CDCD = '\ucdcd';

  // Primary: variables with high-code metadata prefix char
  // Format: {meta_char ≥ U+0080}name\x00expression\x00sample\x00
  const DEF_RE = /[\u0080-\uffff]([A-Za-z_]\w{0,6})\x00([^\x00]{1,100})\x00([^\x00]{0,30})\x00/g;
  for (const m of content.matchAll(DEF_RE)) {
    const name = m[1];
    const expression = m[2].trim();
    const rawSample = m[3];
    // U+2013 (en dash) is used as a minus sign in sample values
    const sample = rawSample.replace(/\u2013/g, '-').replace(/[^\d.\-]/g, '') || '0';
    const afterEnd = content[(m.index ?? 0) + m[0].length];
    if (afterEnd === CDCD) {
      constraintSet.add(expression);
    } else {
      varMap.set(name, { name, expression, sample });
    }
  }

  // Fallback: variables with null metadata prefix (rare, e.g. t4 in some questions)
  // Only match expressions that contain arithmetic operators to exclude X-map entries
  const NULL_DEF_RE = /\x00([A-WYZa-z_]\w{0,6})\x00([^\x00]{2,100})\x00/g;
  for (const m of content.matchAll(NULL_DEF_RE)) {
    const name = m[1];
    const expression = m[2].trim();
    if (!varMap.has(name) && /[+\-*/^()]/.test(expression)) {
      const afterEnd = content[(m.index ?? 0) + m[0].length];
      if (afterEnd === CDCD) {
        constraintSet.add(expression);
      } else {
        varMap.set(name, { name, expression, sample: '0' });
      }
    }
  }

  // X-map: \x00X\x00varname\x00 entries give the \x0f → variable name mapping.
  // Stop if there's a gap > 1000 chars between entries (image binary data can
  // contain spurious matches far into the content).
  const varOrder: string[] = [];
  let lastXmapPos = -1;
  for (const m of content.matchAll(/\x00X\x00([A-Za-z_]\w{0,6})\x00/g)) {
    const pos = m.index ?? 0;
    if (lastXmapPos >= 0 && pos - lastXmapPos > 1000) break;
    varOrder.push(m[1]);
    lastXmapPos = pos;
  }

  // Standalone constraints: expression\x00\ucdcd (no pipe separators)
  let searchPos = 0;
  while (true) {
    const cdcdPos = content.indexOf(CDCD, searchPos);
    if (cdcdPos === -1) break;
    if (cdcdPos > 0 && content[cdcdPos - 1] === '\x00') {
      let start = cdcdPos - 2;
      while (start > 0 && content[start] !== '\x00') start--;
      if (content[start] === '\x00') start++;
      const candidate = content.slice(start, cdcdPos - 1)
        .replace(/[\u0080-\uffff]/g, '')
        .trim();
      if (candidate && !candidate.includes('|') && /[<>]/.test(candidate)) {
        constraintSet.add(candidate);
      }
    }
    searchPos = cdcdPos + 1;
  }

  return {
    vars: [...varMap.values()],
    varOrder,
    constraints: [...constraintSet],
  };
}

// ── Solution detection ────────────────────────────────────────────────────────

function detectSolution(
  varOrder: string[],
  bodyPhCount: number,
  fileOrder: string[],
): string {
  for (let j = 0; j < fileOrder.length; j++) {
    const idx = bodyPhCount + j;
    const name = varOrder[idx];
    if (name && name.toUpperCase() === 'ANS') return fileOrder[j];
  }
  return '';
}

// ── Main parser ───────────────────────────────────────────────────────────────

export async function parseBnk(buffer: ArrayBuffer): Promise<BnkBank> {
  const raw = new Uint8Array(buffer);

  const header = String.fromCharCode(...raw.slice(1, 7));
  if (header !== 'FSCBNK') {
    throw new Error('Not a valid ExamView bank file (missing FSCBNK header)');
  }

  const decompressed = await zlibDecompress(raw.slice(16));
  const text = decodeUtf16le(decompressed);

  const headerStrings = text
    .slice(0, 1500)
    .split('\x00')
    .map(s => s.replace(/[^\x20-\x7e]/g, '').trim())
    .filter(s => s.length > 4 && !/\.bmp$/i.test(s) && !/^Copyright/i.test(s));

  const title   = headerStrings[0] ?? 'Imported Bank';
  const subject = headerStrings.filter(s => s !== title).pop() ?? title;

  const Q_RE = /\uffff\uffff[\s\S]{1,40}?(Easy|Average|Difficult)\x00(Section \d+\.\d+)\x00[^\x00]{1,30}\x00([^\x00]{1,80})\x00([^\x00]{1,80})\x00/g;
  const matches = [...text.matchAll(Q_RE)];

  const questions: BnkQuestion[] = [];
  const sectionMap = new Map<string, string>();

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const difficulty = m[1] as BnkQuestion['difficulty'];
    const section    = m[2];
    const topic      = m[3];
    const subtopic   = m[4];

    if (!sectionMap.has(section)) sectionMap.set(section, topic);

    const endPos  = i + 1 < matches.length ? (matches[i + 1].index ?? text.length) : text.length;
    const content = text.slice((m.index ?? 0) + m[0].length, endPos);

    const points = difficulty === 'Easy' ? 2 : difficulty === 'Average' ? 4 : 6;

    const { vars, varOrder, constraints } = parseVarBlock(content);

    const { dict: rawChoices, fileOrder: choiceFileOrder } = extractChoicesImpl(content, true);
    const { dict: staticChoices } = extractChoicesImpl(content, false);

    if (vars.length > 0 && varOrder.length > 0) {
      const rawBody = extractText(content, true);
      if (!rawBody) continue;

      const staticStem = extractText(content, false);
      const body = formatBody(staticStem, staticChoices);

      const bodyPhCount = (rawBody.match(/\x0f/g) ?? []).length;
      const solution = detectSolution(varOrder, bodyPhCount, choiceFileOrder);

      questions.push({
        difficulty, section, topic, subtopic, points,
        choices: staticChoices,
        body,
        solution,
        variables: vars,
        varOrder,
        rawBody,
        rawChoices,
        choiceFileOrder,
        rawConstraints: constraints,
      });
    } else {
      const stem = extractText(content, false);
      if (!stem) continue;
      const body = formatBody(stem, staticChoices);

      // Still try to detect solution even for non-algorithmic questions
      const bodyPhCount = (stem.match(/\x0f/g) ?? []).length;
      const solution = detectSolution(varOrder, bodyPhCount, choiceFileOrder);

      questions.push({
        difficulty, section, topic, subtopic, points,
        choices: staticChoices,
        body,
        solution,
        variables: [],
        varOrder: [],
        rawBody: '',
        rawChoices: {},
        choiceFileOrder: [],
        rawConstraints: [],
      });
    }
  }

  const sections = [...sectionMap.entries()].map(([id, name]) => ({ id, name }));

  return { subject, title, sections, questions };
}
