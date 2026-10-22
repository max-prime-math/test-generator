import { DEFAULT_GRADEBOOK_FILTER, normalizeGradebookFilter } from './gradebook-filter-rules';
import type { GradebookFilterRules } from './types';

interface View { rules: GradebookFilterRules; savedId: string; savedAt?: number }
const key = 'tg-gradebook-overview-filters-v1';
function load(): Record<string, View> {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? '{}');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    return Object.fromEntries(Object.entries(raw).map(([id, value]) => {
      const view = value as Partial<View> | null;
      return [id, { rules: normalizeGradebookFilter(view?.rules), savedId: typeof view?.savedId === 'string' ? view.savedId : '', savedAt: view?.savedAt }];
    }));
  } catch { return {}; }
}
class GradebookViews {
  views = $state<Record<string, View>>(load());
  forSection(id: string): View { return this.views[id] ?? { rules: { ...DEFAULT_GRADEBOOK_FILTER }, savedId: '' }; }
  set(id: string, view: View): void {
    this.views[id] = { ...view, rules: normalizeGradebookFilter(view.rules) };
    try { localStorage.setItem(key, JSON.stringify(this.views)); } catch { /* Saved filters still live in the Gradebook. */ }
  }
}
export const gradebookViews = new GradebookViews();
