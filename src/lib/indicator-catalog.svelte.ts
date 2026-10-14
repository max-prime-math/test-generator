import { indicatorIndex, type IndicatorEntry } from './achievement-indicators';
import { customClasses } from './custom-classes.svelte';
import { workspaceCatalog } from './workspace-catalog.svelte';
import { mergeWorkspaceClasses } from './workspace-format';
import type { Class } from './types';

/** Achievement indicators from this bank's curriculum and the workspace's other banks. */
class IndicatorCatalog {
  classes = $derived<Class[]>(mergeWorkspaceClasses([...customClasses.classes, ...customClasses.catalog, ...workspaceCatalog.classes]));
  index = $derived<Map<string, IndicatorEntry>>(indicatorIndex(this.classes));
  get size() { return this.index.size; }
  get(id: string): IndicatorEntry | undefined { return this.index.get(id); }
  /** A section's indicators, from whichever bank lists them. */
  forSection(classId: string | undefined, unitId: string | undefined, sectionId: string | undefined): IndicatorEntry[] {
    if (!sectionId) return [];
    const found: IndicatorEntry[] = [];
    for (const entry of this.index.values()) {
      if (entry.section.id === sectionId && entry.unit.id === unitId && entry.cls.id === classId) found.push(entry);
    }
    return found;
  }
}

export const indicatorCatalog = new IndicatorCatalog();
