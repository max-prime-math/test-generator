import type { Generator } from '../../types.ts';
import { MB_30S_CATALOG, MB_40S_CATALOG, type CourseCatalog, type ProblemType } from '../../catalog.ts';

type Spec = Pick<Generator, 'levels' | 'generate'> & Partial<Pick<Generator, 'points' | 'mcq' | 'title'>>;

/**
 * A generator factory for one course's catalogue: each generator's id, title, and
 * outcome tags come from its catalogue entry, so the roadmap and the generator agree.
 */
function fromCatalog(catalog: CourseCatalog) {
  const entries = new Map<string, ProblemType>(catalog.units.flatMap((u) => u.types.map((t) => [t.id, t] as const)));
  return (catalogId: string, spec: Spec): Generator => {
    const entry = entries.get(catalogId);
    if (!entry) throw new Error(`No catalogue entry ${catalogId}`);
    const [primary] = entry.outcomes;
    return {
      id: `mb-${catalogId}`,
      title: spec.title ?? entry.title,
      classId: catalog.classId,
      unitId: primary.split('.')[1],
      outcomeId: primary,
      outcomes: entry.outcomes,
      catalogId,
      points: spec.points ?? 2,
      mcq: spec.mcq,
      levels: spec.levels,
      generate: spec.generate,
    };
  };
}

/** A Pre-Calculus 40S generator for one catalogue entry. */
export const pc40s = fromCatalog(MB_40S_CATALOG);
/** A Pre-Calculus 30S generator for one catalogue entry. */
export const pc30s = fromCatalog(MB_30S_CATALOG);

export const math = (text: string) => `$${text}$`;
/** Display math, for aligned multi-line working. */
export const block = (text: string) => `$ ${text} $`;
