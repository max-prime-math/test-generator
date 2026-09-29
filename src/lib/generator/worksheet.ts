// A worksheet: an ordered list of sections, each one problem type with its own
// level, question type, options, and the exact questions chosen in its settings
// card (one seed per question). As in Kuta, the same type can appear in several
// sections with different settings.
import { GENERATORS, findGenerator, type GeneratedItem, type GeneratedQuestion } from './registry.ts';
import { deriveSeed, randomSeed } from './rng.ts';
import type { Question, TaskGroup } from '../types.ts';
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
    groups.set(section.id, { id: `gen-group-${section.id}`, instructions: layout.instructions, columns: layout.columns, ...(layout.strip ? { strip: layout.strip } : {}) });
  }
  return items.map((p, i) => {
    const taskGroup = groups.get(p.sectionId);
    return { ...questions[i], id: generatedQuestionId(p), createdAt: now, ...(taskGroup ? { taskGroup: { ...taskGroup } } : {}),
      generatorItem: { generatorId: p.item.generatorId, difficulty: p.item.difficulty, seed: p.item.seed, format: p.format, options: { ...p.item.options } } };
  });
}

/** "Factor completely: …": a short plain-word lead-in (no math, code, or numbers) ending in a colon. */
const LEAD_IN = /^([A-Z][^$#\n:0-9]{1,60}):\s+(?=\$)/;
/** "Evaluate $6^3$.": the same plain-word lead-in before a single expression and nothing else. */
const LEAD_WORDS = /^([A-Z][^$#\n:0-9]{1,60}?)\s+(?=\$[^$]+\$\.?$)/;

/**
 * The instruction a section's questions share. When every question starts with the same
 * lead-in ("Factor completely: …", or "Evaluate" before a lone expression), that becomes
 * the instruction and each question keeps only what follows. Otherwise questions stay
 * whole under a general instruction.
 */
export function sharedInstruction(questions: Pick<GeneratedQuestion, 'body' | 'choices'>[]): { instructions: string; strip?: string } {
  for (const pattern of [LEAD_IN, LEAD_WORDS]) {
    const leads = questions.map((q) => pattern.exec(q.body.trim()));
    const first = leads[0];
    if (first && leads.every((m) => m?.[0] === first[0])) {
      return { instructions: asInstruction(first[1]), strip: first[0] };
    }
  }
  const allMcq = questions.every((q) => q.choices && Object.keys(q.choices).length >= 2);
  return { instructions: allMcq ? 'Choose the best answer for each question.' : 'Answer each question.' };
}

/** "Find the determinant of" → "Find the determinant of each."; "Factor completely" → "Factor completely." */
function asInstruction(lead: string): string {
  const text = lead.trim();
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
export function autoColumns(questions: Pick<GeneratedQuestion, 'body' | 'choices'>[], strip = ''): number {
  if (!questions.length) return 1;
  const bodies = questions.map((q) => (strip && q.body.trim().startsWith(strip) ? q.body.trim().slice(strip.length) : q.body));
  // "(A) " plus the gap to the next option is about six characters.
  const choiceRow = (q: Pick<GeneratedQuestion, 'choices'>) => Object.values(q.choices ?? {}).reduce((sum, c) => sum + printedWidth(c) + 6, 0);
  const widest = Math.max(...questions.map((q, i) => Math.max(printedWidth(bodies[i]), choiceRow(q))));
  const cap = bodies.some((b) => b.includes('#')) ? 2 : MAX_COLUMNS;
  // About 15 cm of line at 11 pt: roughly 18, 24, and 36 characters fit 4, 3, and 2 columns.
  const fit = widest <= 18 ? 4 : widest <= 24 ? 3 : widest <= 36 ? 2 : 1;
  return Math.min(cap, fit);
}

/** A section's instruction and columns: the teacher's choices, or what its questions suggest. */
export function sectionLayout(section: Pick<Section, 'instructions' | 'columns'>, questions: Pick<GeneratedQuestion, 'body' | 'choices'>[]) {
  const shared = sharedInstruction(questions);
  const columns = autoColumns(questions, shared.strip);
  return {
    instructions: section.instructions?.trim() || shared.instructions,
    autoInstructions: shared.instructions,
    strip: shared.strip,
    columns: section.columns ?? columns,
    autoColumns: columns,
  };
}
