import type { Class, Unit, Section } from './types';
import { mergeWorkspaceClasses } from './workspace-format';
import { createId } from './id';
import { bankWorkspaces } from './bank-workspaces.svelte';
import { bank } from './bank.svelte';

const KEY = 'math-test-custom-classes-v1';
const CATALOG_KEY = 'tg-class-catalog-v1';
const MEMBERSHIP_KEY = 'tg-bank-class-membership-v1';

function load(key = KEY): Class[] {
  try { const value = JSON.parse(localStorage.getItem(key) ?? '[]'); return Array.isArray(value) ? value : []; }
  catch { return []; }
}

// Bank curriculum stays separate from the shared Gradebook/test class catalog.
let _classes = $state<Class[]>(load());
// Older builds wrote the whole shared catalog into each bank. Keep its metadata,
// but recover membership from questions rather than showing those copied rows.
function loadMembership(): string[] {
  try {
    const stored = JSON.parse(localStorage.getItem(MEMBERSHIP_KEY) ?? 'null');
    if (Array.isArray(stored)) return stored;
    if (!localStorage.getItem(CATALOG_KEY)) return _classes.map(cls => cls.id);
    const questions = JSON.parse(localStorage.getItem('math-test-bank-v2') ?? '[]');
    return [...new Set<string>(questions.map((question: { classId?: string }) => question.classId).filter(Boolean))];
  } catch { return []; }
}
let _membership = $state<string[]>(loadMembership());
localStorage.setItem(MEMBERSHIP_KEY, JSON.stringify(_membership));
type CatalogClass = Class & { catalogNameOverride?: string };
let _catalog = $state<CatalogClass[]>(mergeWorkspaceClasses([...load(CATALOG_KEY), ..._classes]));
function withCatalogNames(classes: Class[]): CatalogClass[] {
  const overrides = new Map(_catalog.filter(cls => cls.catalogNameOverride).map(cls => [cls.id, cls.catalogNameOverride!]));
  return classes.map(cls => {
    const name = overrides.get(cls.id);
    return name ? { ...cls, name, catalogNameOverride: name } : cls;
  });
}
function remember(classes: Class[]) {
  // An explicit shared rename wins over older copies recovered from other banks.
  _catalog = withCatalogNames(mergeWorkspaceClasses([...classes, ..._catalog]));
  localStorage.setItem(CATALOG_KEY, JSON.stringify(_catalog));
}
remember([]);
const catalogReady = bankWorkspaces.readOtherBankValues(KEY).then(values => {
  remember(values.flatMap(value => JSON.parse(value) as Class[]));
});
catalogReady.catch(error => console.error('Could not load class catalog', error));
bankWorkspaces.participate({
  beforeLeave: () => catalogReady,
  apply: () => {
    _classes = load();
    _membership = loadMembership();
    localStorage.setItem(MEMBERSHIP_KEY, JSON.stringify(_membership));
    remember(_classes);
  },
});

function save() {
  _classes = withCatalogNames(_classes);
  remember(_classes);
  localStorage.setItem(KEY, JSON.stringify(_classes));
  localStorage.setItem(MEMBERSHIP_KEY, JSON.stringify(_membership));
}

export const customClasses = {
  /** Re-read the active bank's classes from storage (changes from the workspace folder). Classes in the bank's file belong to it. */
  reloadFromStorage(): void {
    _classes = load();
    _membership = [...new Set([..._membership, ..._classes.map(cls => cls.id)])];
    localStorage.setItem(MEMBERSHIP_KEY, JSON.stringify(_membership));
    remember(_classes);
  },

  get classes(): Class[] {
    const belonging = new Set([..._membership, ...bank.questions.map(question => question.classId)]);
    return withCatalogNames(mergeWorkspaceClasses([..._classes, ..._catalog])).filter(cls => belonging.has(cls.id));
  },
  get catalog(): Class[] { return _catalog; },

  importMany(classes: Class[]): number {
    const incoming = classes
      .filter((cls) => cls.id && cls.name)
      .map((cls) => ({
        id: cls.id,
        name: cls.name,
        units: Array.isArray(cls.units)
          ? cls.units.map((unit) => ({
              id: unit.id,
              name: unit.name,
              sections: Array.isArray(unit.sections)
                ? unit.sections.map((section) => ({ id: section.id, name: section.name }))
                : [],
            }))
          : [],
      }));
    if (incoming.length === 0) return 0;

    const incomingIds = new Set(incoming.map((cls) => cls.id));
    _membership = [...new Set([..._membership, ...incomingIds])];
    _classes = [
      ..._classes.filter((cls) => !incomingIds.has(cls.id)),
      ...incoming,
    ];
    save();
    return incoming.length;
  },

  add(name: string, bankScoped = true): Class {
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const existing = _catalog.find(cls => cls.name.toLowerCase() === name.trim().toLowerCase());
    if (existing) {
      if (bankScoped) {
        if (!_classes.some(cls => cls.id === existing.id)) _classes = [..._classes, existing];
        _membership = [...new Set([..._membership, existing.id])];
        save();
      }
      return existing;
    }
    const id = createId(`custom-${slug || 'class'}`);
    const cls: Class = { id, name: name.trim(), units: [] };
    if (bankScoped) {
      _classes = [..._classes, cls];
      _membership = [..._membership, cls.id];
      save();
    } else remember([cls]);
    return cls;
  },

  addUnit(classId: string, name: string, explicitId?: string): Unit {
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const id   = explicitId?.trim() || `${slug || 'unit'}-${Date.now()}`;
    const unit: Unit = { id, name: name.trim(), sections: [] };
    _classes = _classes.map((c) =>
      c.id === classId ? { ...c, units: [...c.units, unit] } : c
    );
    save();
    return unit;
  },

  addSection(classId: string, unitId: string, name: string, explicitId?: string): Section {
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const id   = explicitId?.trim() || `${slug || 'sec'}-${Date.now()}`;
    const sec: Section = { id, name: name.trim() };
    _classes = _classes.map((c) =>
      c.id !== classId ? c : {
        ...c,
        units: c.units.map((u) =>
          u.id !== unitId ? u : { ...u, sections: [...u.sections, sec] }
        ),
      }
    );
    save();
    return sec;
  },

  renameClass(classId: string, name: string) {
    if (!name.trim()) return;
    // Gradebook-created classes can belong only to the shared catalog.
    // Update both copies so a later bank save cannot restore the old name.
    _catalog = _catalog.map(c => c.id === classId ? { ...c, name: name.trim(), catalogNameOverride: name.trim() } : c);
    _classes = _classes.map((c) =>
      c.id === classId ? { ...c, name: name.trim() } : c
    );
    save();
  },

  renameUnit(classId: string, unitId: string, name: string) {
    if (!name.trim()) return;
    _classes = _classes.map((c) =>
      c.id !== classId ? c : {
        ...c,
        units: c.units.map((u) =>
          u.id === unitId ? { ...u, name: name.trim() } : u
        ),
      }
    );
    save();
  },

  renameSection(classId: string, unitId: string, sectionId: string, name: string) {
    if (!name.trim()) return;
    _classes = _classes.map((c) =>
      c.id !== classId ? c : {
        ...c,
        units: c.units.map((u) =>
          u.id !== unitId ? u : {
            ...u,
            sections: u.sections.map((s) =>
              s.id === sectionId ? { ...s, name: name.trim() } : s
            ),
          }
        ),
      }
    );
    save();
  },
};
