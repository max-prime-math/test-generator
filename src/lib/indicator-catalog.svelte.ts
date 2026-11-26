import { indicatorIndex, type IndicatorEntry } from './achievement-indicators';
import { customClasses } from './custom-classes.svelte';
import { workspaceCatalog } from './workspace-catalog.svelte';
import { mergeWorkspaceClasses } from './workspace-format';
import type { Class } from './types';

/** Granular outcomes (e.g. achievement indicators or learning objectives) from loaded curricula. */
class IndicatorCatalog {
  classes = $derived<Class[]>(mergeWorkspaceClasses([...customClasses.classes, ...customClasses.catalog, ...workspaceCatalog.classes]));
  index = $derived<Map<string, IndicatorEntry>>(indicatorIndex(this.classes));
  get size() { return this.index.size; }
  get(id: string): IndicatorEntry | undefined { return this.index.get(id); }
  /** A section's indicators, including ids that are intentionally reused by another section (as in AP learning objectives). */
  forSection(classId: string | undefined, unitId: string | undefined, sectionId: string | undefined): IndicatorEntry[] {
    if (!sectionId) return [];
    const cls = this.classes.find((candidate) => candidate.id === classId);
    const unit = cls?.units.find((candidate) => candidate.id === unitId);
    const section = unit?.sections.find((candidate) => candidate.id === sectionId);
    if (!cls || !unit || !section) return [];
    return (section.indicators ?? []).map((indicator, index) => ({
      ...indicator, cls, unit, section, number: index + 1,
    }));
  }
}

export const indicatorCatalog = new IndicatorCatalog();
