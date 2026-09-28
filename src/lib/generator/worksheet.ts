// A worksheet: an ordered list of sections, each one problem type with its own
// level, question type, options, and the exact questions chosen in its settings
// card (one seed per question). As in Kuta, the same type can appear in several
// sections with different settings.
import { GENERATORS, findGenerator, type GeneratedItem, type GeneratedQuestion } from './registry.ts';
import { deriveSeed, randomSeed } from './rng.ts';
import type { Question } from '../types.ts';
import type { Difficulty, GenOptions, ProblemFormat } from './types.ts';

/** One seed per question: the questions previewed in the settings card are exactly the ones added. */
export interface SectionDraft { seeds: number[]; difficulty: Difficulty; format: ProblemFormat; options: GenOptions }
export interface Section extends SectionDraft { id: string; generatorId: string }
export interface Plan { course: string; sections: Section[] }

export const PLAN_KEY = 'tg-generator-plan-v2';
const OLD_PLAN_KEY = 'tg-generator-plan-v1';
export const MAX_PER_SECTION = 30;

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

/** The worksheet's questions, ready to belong to a test (they are never added to a bank). */
export function testQuestions(items: PlannedItem[], questions: GeneratedQuestion[], now = Date.now()): Question[] {
  return items.map((p, i) => ({ ...questions[i], id: generatedQuestionId(p), createdAt: now,
    generatorItem: { generatorId: p.item.generatorId, difficulty: p.item.difficulty, seed: p.item.seed, format: p.format, options: { ...p.item.options } } }));
}
