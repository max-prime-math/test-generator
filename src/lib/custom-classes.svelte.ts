import type { Class, Unit, Section } from './types';

const KEY = 'math-test-custom-classes-v1';

function load(): Class[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); }
  catch { return []; }
}

// Module-level $state — reliably tracked across component boundaries
let _classes = $state<Class[]>(load());

function save() {
  localStorage.setItem(KEY, JSON.stringify(_classes));
}

export const customClasses = {
  get classes(): Class[] { return _classes; },

  add(name: string): Class {
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const id   = `custom-${slug || 'class'}-${Date.now()}`;
    const cls: Class = { id, name: name.trim(), units: [] };
    _classes = [..._classes, cls];
    save();
    return cls;
  },

  addUnit(classId: string, name: string): Unit {
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const id   = `${slug || 'unit'}-${Date.now()}`;
    const unit: Unit = { id, name: name.trim(), sections: [] };
    _classes = _classes.map((c) =>
      c.id === classId ? { ...c, units: [...c.units, unit] } : c
    );
    save();
    return unit;
  },

  addSection(classId: string, unitId: string, name: string): Section {
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const id   = `${slug || 'sec'}-${Date.now()}`;
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
