/**
 * ExamView .bnk file parser.
 *
 * Format: 16-byte header ("FSCBNK…") + zlib-compressed UTF-16 LE payload.
 * Questions are located by difficulty markers (Easy / Average / Difficult).
 * Variable placeholders (\x0f) are replaced with ___ — algorithmic evaluation
 * is deferred to a future phase (see roadmap).
 */

export interface BnkQuestion {
  difficulty: 'Easy' | 'Average' | 'Difficult';
  section: string;    // e.g. "Section 1.1"
  topic: string;      // e.g. "Arithmetic Sequences"
  subtopic: string;   // e.g. "nth term"
  text: string;       // question stem with ___ placeholders
  choices: Record<string, string>; // A/B/C/D for MC questions
  body: string;       // formatted body (text + choices) ready for the bank
  points: number;     // 2 / 4 / 6 by difficulty
}

export interface BnkBank {
  title: string;
  questions: BnkQuestion[];
}

// ── Decompression ─────────────────────────────────────────────────────────────

async function zlibDecompress(bytes: Uint8Array): Promise<Uint8Array> {
  // 'deflate' = RFC 1950 zlib wrapper (78 DA … header), which is what ExamView uses
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

// ── Text helpers ──────────────────────────────────────────────────────────────

const PLACEHOLDER = /\x0f/g;
const PRINTABLE    = /[^\x20-\x7e_]/g;

function clean(s: string): string {
  return s.replace(PLACEHOLDER, '___').replace(PRINTABLE, '').trim();
}

// ── Question text extraction ──────────────────────────────────────────────────

function extractQuestionText(content: string): string {
  const ansPos = content.indexOf('\x10');
  const pre = ansPos !== -1 ? content.slice(0, ansPos) : content.slice(0, 600);

  // Find the last run of readable English text (with possible \x0f blanks)
  const runs = [...pre.matchAll(/[A-Za-z][a-z ,\.\?\!\x0f\-\(\)0-9\'"=+*$%]{15,}/g)];
  if (!runs.length) return '';
  return clean(runs[runs.length - 1][0]);
}

// ── Answer choice extraction ──────────────────────────────────────────────────

function extractChoices(content: string): Record<string, string> {
  const ansPos = content.indexOf('\x10');
  if (ansPos === -1) return {};

  const section = content.slice(ansPos + 1, ansPos + 400);
  const choices: Record<string, string> = {};

  for (const m of section.matchAll(/([A-D])\x11([^\x11\x10\x00]{0,100})\x11/g)) {
    const text = clean(m[2]);
    if (text) choices[m[1]] = text;
  }
  return choices;
}

// ── Body formatter ────────────────────────────────────────────────────────────

function formatBody(text: string, choices: Record<string, string>): string {
  if (!Object.keys(choices).length) return text;

  const letters = ['A', 'B', 'C', 'D'].filter(l => choices[l]);
  const choiceLines = letters.map(l => `*(${l})* ${choices[l]}`).join('  #h(2em)  ');
  return `${text}\n\n${choiceLines}`;
}

// ── Main parser ───────────────────────────────────────────────────────────────

export async function parseBnk(buffer: ArrayBuffer): Promise<BnkBank> {
  const raw = new Uint8Array(buffer);

  // Verify magic header
  const header = String.fromCharCode(...raw.slice(1, 7));
  if (header !== 'FSCBNK') {
    throw new Error('Not a valid ExamView bank file (missing FSCBNK header)');
  }

  // Decompress zlib payload starting at byte 16
  const decompressed = await zlibDecompress(raw.slice(16));
  const text = new TextDecoder('utf-16-le').decode(decompressed);

  // Extract the bank title from the start of the payload
  const titleMatch = text.match(/^[\s\S]{0,40}?([\x20-\x7e]{10,})/);
  const title = titleMatch ? titleMatch[1].trim() : 'Imported Bank';

  // Locate each question block by its leading difficulty marker
  const Q_RE = /\uffff\uffff[\s\S]{1,40}?(Easy|Average|Difficult)\x00(Section \d+\.\d+)\x00[^\x00]{1,30}\x00([^\x00]{1,80})\x00([^\x00]{1,80})\x00/g;
  const matches = [...text.matchAll(Q_RE)];

  const questions: BnkQuestion[] = [];

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const difficulty = m[1] as BnkQuestion['difficulty'];
    const section    = m[2];
    const topic      = m[3];
    const subtopic   = m[4];

    const endPos  = i + 1 < matches.length ? (matches[i + 1].index ?? text.length) : text.length;
    const content = text.slice((m.index ?? 0) + m[0].length, endPos);

    const qText   = extractQuestionText(content);
    if (!qText) continue;

    const choices = extractChoices(content);
    const body    = formatBody(qText, choices);
    const points  = difficulty === 'Easy' ? 2 : difficulty === 'Average' ? 4 : 6;

    questions.push({ difficulty, section, topic, subtopic, text: qText, choices, body, points });
  }

  return { title, questions };
}
