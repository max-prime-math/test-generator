import type { Generator } from '../../types.ts';
import { MB_40S_CATALOG, type ProblemType } from '../../catalog.ts';

const entries = new Map<string, ProblemType>(MB_40S_CATALOG.units.flatMap((u) => u.types.map((t) => [t.id, t] as const)));

type Spec = Pick<Generator, 'levels' | 'generate'> & Partial<Pick<Generator, 'points' | 'mcq' | 'title'>>;

/**
 * A Pre-Calculus 40S generator for one catalogue entry: its id, title, and
 * outcome tags come from `catalog.ts`, so the roadmap and the generator agree.
 */
export function pc40s(catalogId: string, spec: Spec): Generator {
  const entry = entries.get(catalogId);
  if (!entry) throw new Error(`No catalogue entry ${catalogId}`);
  const [primary] = entry.outcomes;
  return {
    id: `mb-${catalogId}`,
    title: spec.title ?? entry.title,
    classId: MB_40S_CATALOG.classId,
    unitId: primary.split('.')[1],
    outcomeId: primary,
    outcomes: entry.outcomes,
    catalogId,
    points: spec.points ?? 2,
    mcq: spec.mcq,
    levels: spec.levels,
    generate: spec.generate,
  };
}

export const math = (text: string) => `$${text}$`;
/** Display math, for aligned multi-line working. */
export const block = (text: string) => `$ ${text} $`;
