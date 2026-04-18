/**
 * ExamView .bnk file parser.
 *
 * Format: 16-byte header ("FSCBNK…") + zlib-compressed UTF-16 LE payload.
 * Questions are located by difficulty markers (Easy / Average / Difficult).
 * Variable placeholders (\x0f) become Typst underline blanks — algorithmic
 * evaluation (real computed values) is deferred to a future phase.
 */

export interface BnkQuestion {
  difficulty: 'Easy' | 'Average' | 'Difficult';
  section: string;    // e.g. "Section 1.1"
  topic: string;      // e.g. "Arithmetic Sequences"
  subtopic: string;   // e.g. "nth term"
  choices: Record<string, string>; // A/B/C/D raw text (with ___ placeholders)
  body: string;       // Typst-formatted body ready for the bank
  points: number;     // 2 / 4 / 6 by difficulty
}

export interface BnkBank {
  title: string;
  sections: { id: string; name: string }[]; // unique sections in order
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

// Escape Typst markup special characters in plain prose text
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

// Convert a raw BNK string (may contain \x0f placeholders and non-printable
// chars) into a Typst-safe string with blanks rendered as underlines.
function toTypst(raw: string): string {
  return raw
    .split('\x0f')
    .map(seg => escapeTypst(seg.replace(/[^\x20-\x7e]/g, '').trim()))
    .join(BLANK)
    .trim();
}

// ── Question text extraction ──────────────────────────────────────────────────

function extractQuestionText(content: string): string {
  const ansPos = content.indexOf('\x10');
  const pre = ansPos !== -1 ? content.slice(0, ansPos) : content.slice(0, 600);

  // Find the last run of readable English text (with possible \x0f blanks)
  const runs = [...pre.matchAll(/[A-Za-z][a-z ,\.\?\!\x0f\-\(\)0-9\'"=+*$%]{15,}/g)];
  if (!runs.length) return '';
  return toTypst(runs[runs.length - 1][0]);
}

// ── Answer choice extraction ──────────────────────────────────────────────────

function extractChoices(content: string): Record<string, string> {
  const ansPos = content.indexOf('\x10');
  if (ansPos === -1) return {};

  const section = content.slice(ansPos + 1, ansPos + 400);
  const choices: Record<string, string> = {};

  for (const m of section.matchAll(/([A-D])\x11([^\x11\x10\x00]{0,100})\x11/g)) {
    const text = toTypst(m[2]);
    if (text) choices[m[1]] = text;
  }
  return choices;
}

// ── Body formatter ────────────────────────────────────────────────────────────

function formatBody(stem: string, choices: Record<string, string>): string {
  const letters = ['A', 'B', 'C', 'D'].filter(l => choices[l]);
  if (!letters.length) return stem;

  // 2-column grid for 4 choices, single column otherwise
  const cols = letters.length === 4 ? 2 : 1;
  const cells = letters.map(l => `[*(${l})* ${choices[l]}]`).join(', ');
  const colDef = Array(cols).fill('1fr').join(', ');
  const grid = `#grid(columns: (${colDef}), column-gutter: 1.5em, row-gutter: 0.6em, ${cells})`;

  return `${stem}\n\n${grid}`;
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

  // Extract the bank title from the start of the payload
  const titleMatch = text.match(/^[\s\S]{0,40}?([\x20-\x7e]{10,})/);
  const title = titleMatch ? titleMatch[1].trim() : 'Imported Bank';

  // Locate each question block by its leading difficulty marker
  const Q_RE = /\uffff\uffff[\s\S]{1,40}?(Easy|Average|Difficult)\x00(Section \d+\.\d+)\x00[^\x00]{1,30}\x00([^\x00]{1,80})\x00([^\x00]{1,80})\x00/g;
  const matches = [...text.matchAll(Q_RE)];

  const questions: BnkQuestion[] = [];
  const sectionMap = new Map<string, string>(); // section id → topic name

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const difficulty = m[1] as BnkQuestion['difficulty'];
    const section    = m[2];
    const topic      = m[3];
    const subtopic   = m[4];

    if (!sectionMap.has(section)) sectionMap.set(section, topic);

    const endPos  = i + 1 < matches.length ? (matches[i + 1].index ?? text.length) : text.length;
    const content = text.slice((m.index ?? 0) + m[0].length, endPos);

    const stem    = extractQuestionText(content);
    if (!stem) continue;

    const choices = extractChoices(content);
    const body    = formatBody(stem, choices);
    const points  = difficulty === 'Easy' ? 2 : difficulty === 'Average' ? 4 : 6;

    questions.push({ difficulty, section, topic, subtopic, choices, body, points });
  }

  const sections = [...sectionMap.entries()].map(([id, name]) => ({ id, name }));

  return { title, sections, questions };
}
