// A worksheet: an ordered list of sections, each one problem type with its own
// level, question type, options, and the exact questions chosen in its settings
// card (one seed per question). As in Kuta, the same type can appear in several
// sections with different settings.
import { GENERATORS, findGenerator, type GeneratedItem, type GeneratedQuestion } from './registry.ts';
import { deriveSeed, randomSeed } from './rng.ts';
import type { Question, TaskGroup } from '../types.ts';
import { taskItemBody } from '../typst/template.ts';
import type { Difficulty, GenOptions, ProblemFormat } from './types.ts';

/** One seed per question: the questions previewed in the settings card are exactly the ones added. */
export interface SectionDraft { seeds: number[]; difficulty: Difficulty; format: ProblemFormat; options: GenOptions }
/**
 * On the page a section is one numbered item: its instruction, then its questions lettered
 * a), b), … across `columns`. Unset `instructions` and `columns` follow the questions (see `sectionLayout`).
 */
export interface Section extends SectionDraft { id: string; generatorId: string; instructions?: string; columns?: number }
export interface Plan { course: string; sections: Section[] }

export const PLAN_KEY = 'tg-generator-plan-v2';
const OLD_PLAN_KEY = 'tg-generator-plan-v1';
export const MAX_PER_SECTION = 30;
export const MAX_COLUMNS = 4;

export const sectionId = () => Math.random().toString(36).slice(2, 10);

function cleanSection(raw: Partial<Section>): Section | null {
  if (!raw.seeds?.length) return null;
  const g = raw.generatorId ? findGenerator(raw.generatorId) : undefined;
  if (!g) return null;
  const difficulty = ([1, 2, 3] as const).find((d) => d === raw.difficulty) ?? 1;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : sectionId(),
    generatorId: g.id,
    seeds: (Array.isArray(raw.seeds) ? raw.seeds : []).filter((v): v is number => Number.isInteger(v) && v >= 0).slice(0, MAX_PER_SECTION),
    difficulty,
    format: raw.format === 'mcq' && g.mcq !== false ? 'mcq' : 'written',
    options: raw.options && typeof raw.options === 'object' ? Object.fromEntries(Object.entries(raw.options).filter(([, v]) => typeof v === 'string')) as GenOptions : {},
    ...(typeof raw.instructions === 'string' && raw.instructions.trim() ? { instructions: raw.instructions.trim() } : {}),
    ...(Number.isInteger(raw.columns) && raw.columns! >= 1 && raw.columns! <= MAX_COLUMNS ? { columns: raw.columns } : {}),
  };
}

/** The saved plan, or one migrated from the first version (a count per problem type). */
export function loadPlan(courses: string[], storage: Pick<Storage, 'getItem'> = localStorage): Plan {
  const fallback: Plan = { course: courses[0] ?? '', sections: [] };
  try {
    const saved = JSON.parse(storage.getItem(PLAN_KEY) ?? 'null') as Partial<Plan> | null;
    if (saved) {
      return {
        course: courses.includes(saved.course ?? '') ? saved.course! : fallback.course,
        sections: (saved.sections ?? []).map(cleanSection).filter((s): s is Section => !!s),
      };
    }
    const old = JSON.parse(storage.getItem(OLD_PLAN_KEY) ?? 'null') as { format?: string; course?: string; rows?: Record<string, { count?: number; difficulty?: number }> } | null;
    if (!old) return fallback;
    const format: ProblemFormat = old.format === 'mcq' ? 'mcq' : 'written';
    return {
      course: courses.includes(old.course ?? '') ? old.course! : fallback.course,
      sections: GENERATORS.filter((g) => (old.rows?.[g.id]?.count ?? 0) > 0)
        .map((g) => cleanSection({ generatorId: g.id, seeds: newSeeds(Math.min(MAX_PER_SECTION, old.rows![g.id].count ?? 1)), difficulty: old.rows![g.id].difficulty as Difficulty, format }))
        .filter((s): s is Section => !!s),
    };
  } catch {
    return fallback;
  }
}

export const newSeeds = (n: number) => Array.from({ length: n }, () => randomSeed());

export interface PlannedItem { item: GeneratedItem; format: ProblemFormat; sectionId: string; index: number }

/** Every question on the worksheet, in order. */
export function planItems(sections: Section[]): PlannedItem[] {
  return sections.flatMap((s) => s.seeds.map((seed, index) => ({
    item: { generatorId: s.generatorId, difficulty: s.difficulty, seed, options: { ...s.options } },
    format: s.format,
    sectionId: s.id,
    index,
  })));
}

/**
 * A stable id for a generated question: the same problem type, level, options, seed and
 * question type always give the same id, so adding a worksheet to a test twice does not
 * duplicate its questions.
 */
export function generatedQuestionId({ item, format }: Pick<PlannedItem, 'item' | 'format'>): string {
  const options = Object.entries(item.options ?? {}).sort(([a], [b]) => a.localeCompare(b));
  const key = JSON.stringify([item.generatorId, item.difficulty, format, options]);
  const hex = (n: number) => n.toString(16).padStart(8, '0');
  return `gen-${hex(deriveSeed(item.seed, key))}${hex(deriveSeed(item.seed ^ 0x5bd1e995, key))}`;
}

/**
 * The worksheet's questions, ready to belong to a test (they are never added to a bank).
 * With `sections`, each question carries its section's task group so the test prints the
 * section as one numbered item with lettered questions.
 */
export function testQuestions(items: PlannedItem[], questions: GeneratedQuestion[], sections: Section[] = [], now = Date.now()): Question[] {
  const groups = new Map<string, TaskGroup>();
  for (const section of sections) {
    const own = items.flatMap((p, i) => (p.sectionId === section.id ? [questions[i]] : []));
    if (!own.length) continue;
    const layout = sectionLayout(section, own);
    groups.set(section.id, { id: `gen-group-${section.id}`, instructions: layout.instructions, columns: layout.columns,
      ...(layout.strip ? { strip: layout.strip } : {}), ...(layout.stripEnd ? { stripEnd: layout.stripEnd } : {}) });
  }
  return items.map((p, i) => {
    const taskGroup = groups.get(p.sectionId);
    const { task: _, ...question } = questions[i];
    return { ...question, id: generatedQuestionId(p), createdAt: now, ...(taskGroup ? { taskGroup: { ...taskGroup } } : {}),
      generatorItem: { generatorId: p.item.generatorId, difficulty: p.item.difficulty, seed: p.item.seed, format: p.format, options: { ...p.item.options } } };
  });
}

/** "Factor completely: …": a short plain-word lead-in (no math, code, or numbers) ending in a colon. */
const LEAD_IN = /^([A-Z][^$#\n:0-9]{1,60}):\s+(?=\$)/;
/** "Evaluate $6^3$.": the same plain-word lead-in before a single expression and nothing else. */
const LEAD_WORDS = /^([A-Z][^$#\n:0-9]{1,60}?)\s+(?=\$[^$]+\$\.?$)/;
/** "Solve for $0 <= x < 2pi$: …": a lead-in with math in it, ending in a colon outside the math. */
const MATH_LEAD_IN = /^([A-Z](?:[^$#\n:]|\$[^$\n]+\$){1,100}?):\s+(?=\$)/;

type Layable = Pick<GeneratedQuestion, 'body' | 'choices' | 'task'>;
export interface SharedInstruction { instructions: string; strip?: string; stripEnd?: string }

/**
 * The instruction a section's questions share, and the text of each question that it
 * replaces. In order of preference:
 * - the generator's own `task`, when every question's body matches around its item;
 * - a lead-in every question starts with ("Factor completely: …", "Evaluate" before a lone
 *   expression, or "Solve for $n$: …"), which becomes the instruction;
 * - otherwise the questions stay whole under a general instruction.
 */
export function sharedInstruction(questions: Layable[]): SharedInstruction {
  const fromTask = taskInstruction(questions);
  if (fromTask) return fromTask;
  for (const pattern of [LEAD_IN, LEAD_WORDS, MATH_LEAD_IN]) {
    const leads = questions.map((q) => pattern.exec(q.body.trim()));
    const first = leads[0];
    if (first && leads.every((m) => m?.[0] === first[0]) && (pattern !== MATH_LEAD_IN || first[1].includes('$'))) {
      const rest = questions.map((q) => q.body.trim().slice(first[0].length));
      return { instructions: asInstruction(first[1], rest, first[0].trimEnd().endsWith(':')), strip: first[0] };
    }
  }
  const around = aroundOneExpression(questions) ?? aboveEachFigure(questions) ?? sharedSentences(questions);
  if (around) return around;
  const allMcq = questions.every((q) => q.choices && Object.keys(q.choices).length >= 2);
  return { instructions: allMcq ? 'Choose the best answer for each question.' : 'Answer each question.' };
}

/** The generators' shared `task`, when every body is the same text around its own item. */
function taskInstruction(questions: Layable[]): SharedInstruction | null {
  const first = questions[0]?.task;
  if (!first || !questions.every((q) => q.task?.instruction === first.instruction)) return null;
  // The item usually appears once; when it also occurs in the lead, its last place is the one that varies.
  for (const find of ['indexOf', 'lastIndexOf'] as const) {
    const parts = questions.map((q) => {
      const body = q.body.trim();
      const at = body[find](q.task!.item);
      return at < 0 ? null : { lead: body.slice(0, at), tail: body.slice(at + q.task!.item.length) };
    });
    const [p] = parts;
    if (p && parts.every((x) => x && x.lead === p.lead && x.tail === p.tail)) {
      return { instructions: first.instruction, ...(p.lead ? { strip: p.lead } : {}), ...(p.tail.trim() ? { stripEnd: p.tail } : {}) };
    }
  }
  return null;
}

/** Words that open an instruction or a question, so the expression they act on can become "each". */
const ASKS = /^(?:Write|Sketch|Graph|Draw|Convert|Find|Evaluate|Estimate|Describe|Simplify|State|Classify|Use|Verify|Determine|Express|Identify|Is|Are|Does|Do|Which|What|How|Where|For|Between|Given)\b/;

/**
 * "Describe how the graph of $y = 2x^2$ compares to the graph of $y = x^2$.": every question is the
 * same text around one expression, so the instruction reads "Describe how the graph of each compares
 * to the graph of $y = x^2$." and each lettered question keeps only its expression.
 */
function aroundOneExpression(questions: Layable[]): SharedInstruction | null {
  if (questions.length < 2) return null;
  const split = questions.map((q) => q.body.trim().split(/(\$[^$]*\$)/));
  const [first] = split;
  if (!split.every((parts) => parts.length === first.length)) return null;
  const differ = first.map((_, i) => split.some((parts) => parts[i] !== first[i]));
  const at = differ.indexOf(true);
  if (at < 0 || differ.lastIndexOf(true) !== at || !first[at].startsWith('$')) return null;
  const lead = first.slice(0, at).join('');
  const tail = first.slice(at + 1).join('');
  if (!ASKS.test(lead) || lead.includes('#') || !/\s$/.test(lead) || !/^(?:$|[\s.,?;:])/.test(tail)) return null;
  // The expression must be what the words act on: not a statement after a comma or colon
  // ("For a function, $f(2) = 5$."), the complement of "is" or "where", or a number with units.
  if (/[.?!,:;]\s$/.test(lead) && !/^\S+\s$/.test(lead)) return null;
  if (/\s(?:is|are|where|with|when)\s$/.test(lead) && !/^(?:Which|What|How|Where|Is|Are|Does|Do|Between|For (?:what|which))\b/.test(lead)) return null;
  if (/^\s(?:radians?|degrees?|mm|cm|m|km|in|ft|yd|mi|g|kg|mL|L)\b(?!\s(?:radical|slope|vertex|general|function|standard|simplest|terms))/.test(tail)) return null;
  // "does the system" → "does each system", "in the arithmetic sequence" → "in each arithmetic sequence";
  // otherwise the expression's place reads "each".
  const named = /\bthe((?: [a-z]+){1,3}) $/.exec(lead);
  const before = named && !/\b(?:of|for|to|in|on|at|from|by|with|as)$/.test(named[1]) ? `${lead.slice(0, named.index)}each${named[1]}` : `${lead}each`;
  const sentence = `${before}${tail}`.replace(/\s+([.,?;:])/g, '$1').trim();
  return { instructions: /[.?!]\)?$/.test(sentence) ? sentence : `${sentence}.`, strip: lead, ...(tail.trim() ? { stripEnd: tail } : {}) };
}

/** A figure the question shows: a graph, table, grid, or drawing in Typst code. */
const FIGURE = /\s#(?:box|block|grid|table|align|figure|stack|place|image|canvas|cetz)\b/;

/**
 * "Which equation matches the graph?" above a different graph in every question: the sentence
 * becomes the instruction ("Which equation matches each graph?") and each lettered question
 * keeps only its figure.
 */
function aboveEachFigure(questions: Layable[]): SharedInstruction | null {
  if (questions.length < 2) return null;
  // Everything before the figure's "#", including the space or blank line in front of it.
  const leads = questions.map((q) => {
    const body = q.body.trim();
    const at = body.search(FIGURE);
    return at > 0 ? body.slice(0, body.indexOf('#', at)) : null;
  });
  const [lead] = leads;
  const sentence = lead?.trim() ?? '';
  if (!lead || !leads.every((l) => l === lead) || !/[.?)]$/.test(sentence) || sentence.includes('#')) return null;
  const instructions = sentence.replace(/(?<=\s)the (graph|shape|table|line|scatterplot|bar|diagram|parabola|area model|number line)\b(?! of \$)/, 'each $1');
  return { instructions, strip: lead };
}

/**
 * "In right triangle $A B C$, $angle C = 90°$. Find …": every question opens with the same complete
 * sentences, which become the instruction; each lettered question keeps what follows.
 */
function sharedSentences(questions: Layable[]): SharedInstruction | null {
  if (questions.length < 2) return null;
  const bodies = questions.map((q) => q.body.trim());
  // Sentence ends outside math: ". ", "? " or "! " followed by more text.
  const ends = (body: string) => {
    const out: number[] = [];
    let inMath = false;
    for (let i = 0; i < body.length - 1; i++) {
      if (body[i] === '$') inMath = !inMath;
      else if (!inMath && /[.?!]/.test(body[i]) && /\s/.test(body[i + 1])) out.push(i + 1);
    }
    return out;
  };
  const shared = ends(bodies[0]).filter((end) => bodies.every((b) => b.slice(0, end) === bodies[0].slice(0, end) && /^\s+\S/.test(b.slice(end)))).at(-1);
  if (!shared) return null;
  const sentence = bodies[0].slice(0, shared);
  if (sentence.includes('#') || sentence.split(/\s+/).length < 4 || !/^[A-Z$]/.test(sentence)) return null;
  // The questions must differ after it; identical questions say nothing new.
  if (new Set(bodies.map((b) => b.slice(shared))).size < 2) return null;
  const lead = bodies[0].slice(0, shared) + bodies[0].slice(shared).match(/^\s+/)![0];
  if (!bodies.every((b) => b.startsWith(lead))) return null;
  const instructions = sentence.replace(/(?<=\s)the (system|graph|shape|table|line|relation|function|matrix|sequence|series)\b(?! of \$)/, 'each $1');
  return { instructions, strip: lead };
}

/** What each remaining question is, when it is a lone expression of one kind. */
function itemKind(rest: string[]): 'equation' | 'inequality' | 'system' | null {
  const kinds = rest.map((r) => {
    const m = /^\$([^$]+)\$\.?$/.exec(r.trim());
    if (!m) return null;
    if (/cases\(/.test(m[1])) return 'system';
    // "P(x) = …" and "y = …" name a function or relation; they are not equations to solve.
    if (/^\s*[A-Za-z](?:\([^)]*\))?\s*=/.test(m[1])) return null;
    if (/<|>|≤|≥/.test(m[1])) return 'inequality';
    return /=/.test(m[1]) ? 'equation' : null;
  });
  return kinds.every((k) => k && k === kinds[0]) ? kinds[0] : null;
}

/**
 * "Factor completely" → "Factor completely."; "Find the determinant of" → "Find the determinant of each.";
 * "Solve" before equations → "Solve each equation."; "Solve for $n$" → "For each equation, solve for $n$.".
 */
function asInstruction(lead: string, rest: string[] = [], colon = false): string {
  const text = lead.trim();
  const kind = colon ? itemKind(rest) : null;
  if (kind && /^Solve$/i.test(text)) return `Solve each ${kind}.`;
  if (kind && /\bthe identity\b/.test(text)) return `${text.replace(/\bthe identity\b/, 'each identity')}.`;
  if (kind && !/[.?!]$/.test(text)) return `For each ${kind}, ${text[0].toLowerCase()}${text.slice(1)}.`;
  if (/[.?!]$/.test(text)) return text;
  return /\s(?:of|for|to|with|from|in|on|at)$/i.test(text) ? `${text} each.` : `${text}.`;
}

/** How wide an item prints, roughly in characters: math and markup symbols count less than words. */
function printedWidth(text: string): number {
  const plain = text.replace(/\s+/g, ' ').trim();
  let width = 0;
  let inMath = false;
  for (const ch of plain) {
    if (ch === '$') { inMath = !inMath; continue; }
    width += inMath ? (/[A-Za-z0-9]/.test(ch) ? 0.8 : 0.5) : 1;
  }
  return width;
}

/**
 * Questions per row, as \tasks would choose: short items share a row, long ones get it
 * alone. Multiple-choice options print in one row under their question, so the whole row
 * of options counts; drawings need room, so they allow at most two.
 */
export function autoColumns(questions: Pick<GeneratedQuestion, 'body' | 'choices'>[], strip = '', stripEnd = ''): number {
  if (!questions.length) return 1;
  const bodies = questions.map((q) => taskItemBody(q.body, strip, stripEnd));
  // "(A) " plus the gap to the next option is about six characters.
  const choiceRow = (q: Pick<GeneratedQuestion, 'choices'>) => Object.values(q.choices ?? {}).reduce((sum, c) => sum + printedWidth(c) + 6, 0);
  const widest = Math.max(...questions.map((q, i) => Math.max(printedWidth(bodies[i]), choiceRow(q))));
  const cap = bodies.some((b) => b.includes('#')) ? 2 : MAX_COLUMNS;
  // About 15 cm of line at 11 pt: roughly 18, 24, and 36 characters fit 4, 3, and 2 columns.
  const fit = widest <= 18 ? 4 : widest <= 24 ? 3 : widest <= 36 ? 2 : 1;
  return Math.min(cap, fit);
}

/** A section's instruction and columns: the teacher's choices, or what its questions suggest. */
export function sectionLayout(section: Pick<Section, 'instructions' | 'columns'>, questions: Layable[]) {
  const shared = sharedInstruction(questions);
  const columns = autoColumns(questions, shared.strip, shared.stripEnd);
  return {
    instructions: section.instructions?.trim() || shared.instructions,
    autoInstructions: shared.instructions,
    strip: shared.strip,
    stripEnd: shared.stripEnd,
    columns: section.columns ?? columns,
    autoColumns: columns,
  };
}
