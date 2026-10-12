import type { GeneratedProblem, Generator } from '../../types.ts';
import type { Rng } from '../../rng.ts';
import { CATALOGS, generatorOutcomes, type ProblemType } from '../../catalog.ts';
import { reduce } from '../../format.ts';

type Spec = Pick<Generator, 'levels' | 'generate'> & Partial<Pick<Generator, 'points' | 'mcq' | 'title' | 'options'>>;

const entries = new Map<string, { classId: string; entry: ProblemType }>(
  CATALOGS.flatMap((c) => c.units.flatMap((u) => u.types.filter((t) => !t.uses).map((t) => [t.id, { classId: c.classId, entry: t }] as const))),
);

/**
 * A generator for a problem type written after a Kuta topic (kuta-topics.ts): id
 * `us-<entry>`, with the title, course, and outcome of its Manitoba catalogue entry.
 * A type beyond the outcomes keeps its entry's outcome for placement, and its tag.
 */
export function us(catalogId: string, spec: Spec): Generator {
  const found = entries.get(catalogId);
  if (!found) throw new Error(`No catalogue entry ${catalogId}`);
  const id = `us-${catalogId}`;
  const [primary] = found.entry.outcomes;
  return {
    id,
    title: spec.title ?? found.entry.title,
    classId: found.classId,
    unitId: primary.split('.')[1],
    outcomeId: primary,
    outcomes: generatorOutcomes(id, found.entry),
    ...(found.entry.tag ? { tag: found.entry.tag } : {}),
    catalogId,
    points: spec.points ?? 1,
    mcq: spec.mcq,
    options: spec.options,
    levels: spec.levels,
    generate: spec.generate,
  };
}

export const math = (text: string) => `$${text}$`;
export const block = (text: string) => `$ ${text} $`;

/** Distinct wrong answers, without the answer itself or blanks. */
export function wrong(answer: string, list: Array<string | null | undefined | false>): string[] {
  return [...new Set(list.filter((x): x is string => !!x && x !== answer))];
}

/**
 * A question in Kuta's style: an instruction printed once for the set ("Solve each equation.")
 * and a math item that changes. The body reads `<lead> $item$.`
 */
export function task(instruction: string, lead: string, item: string, rest: Omit<GeneratedProblem, 'body' | 'task'>, tail = '.'): GeneratedProblem {
  const shown = math(item);
  return { body: `${lead} ${shown}${tail}`, task: { instruction, item: shown }, ...rest };
}

/** A fraction as Typst math, as a mixed number when improper: `2 1/3` → `2 frac(1, 3)`. */
export function mixed(n: number, d: number): string {
  const f = reduce(n, d);
  if (f.d === 1) return String(f.n);
  const whole = Math.trunc(f.n / f.d), rem = Math.abs(f.n % f.d);
  if (whole === 0) return f.n < 0 ? `-${-f.n}/${f.d}` : `${f.n}/${f.d}`;
  return `${whole} ${rem}/${f.d}`;
}

/** A decimal without floating-point noise, trimmed: 2.50 → `2.5`. */
export function decimal(v: number, places = 6): string {
  const r = Number(v.toFixed(places));
  return Object.is(r, -0) ? '0' : String(r);
}

/** Round to a number of decimal places and show exactly that many: 3.1 → `3.10`. */
export function fixed(v: number, places: number): string {
  const r = Number(v.toFixed(places));
  return (Object.is(r, -0) ? 0 : r).toFixed(places);
}

/** A number with a sign only when negative, wrapped for substitution when negative. */
export const p = (v: number | string) => (String(v).startsWith('-') ? `(${v})` : String(v));

/** Pick k distinct items. */
export function sample<T>(rng: Rng, items: readonly T[], k: number): T[] {
  return rng.shuffle(items).slice(0, k);
}

/** Money: `$12.50` as Typst text (dollar sign escaped). */
export const money = (v: number) => `\\$${(Math.round(v * 100) / 100).toFixed(2)}`;

/** Common first names for word problems. */
export const NAMES = ['Ava', 'Noah', 'Maya', 'Liam', 'Priya', 'Owen', 'Zoe', 'Ethan', 'Leah', 'Jamal', 'Sofia', 'Ryan', 'Nadia', 'Caleb', 'Mei', 'Lucas'];
