import type { Class, Unit, Section } from './types';

const KEY = 'math-test-custom-classes-v1';

function load(): Class[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); }
  catch { return []; }
}

class CustomClassStore {
  classes = $state<Class[]>(load());

  #save() { localStorage.setItem(KEY, JSON.stringify(this.classes)); }

  add(name: string): Class {
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const id   = `custom-${slug || 'class'}-${Date.now()}`;
    const cls: Class = { id, name: name.trim(), units: [] };
    this.classes.push(cls);
    this.#save();
    return cls;
  }

  addUnit(classId: string, name: string): Unit {
    const cls = this.classes.find((c) => c.id === classId);
    if (!cls) throw new Error('Class not found');
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const id   = `${slug || 'unit'}-${Date.now()}`;
    const unit: Unit = { id, name: name.trim(), sections: [] };
    cls.units.push(unit);
    this.#save();
    return unit;
  }

  renameClass(classId: string, name: string) {
    const cls = this.classes.find((c) => c.id === classId);
    if (!cls || !name.trim()) return;
    cls.name = name.trim();
    this.#save();
  }

  renameUnit(classId: string, unitId: string, name: string) {
    const unit = this.classes.find((c) => c.id === classId)?.units.find((u) => u.id === unitId);
    if (!unit || !name.trim()) return;
    unit.name = name.trim();
    this.#save();
  }

  renameSection(classId: string, unitId: string, sectionId: string, name: string) {
    const unit = this.classes.find((c) => c.id === classId)?.units.find((u) => u.id === unitId);
    const sec  = unit?.sections.find((s) => s.id === sectionId);
    if (!sec || !name.trim()) return;
    sec.name = name.trim();
    this.#save();
  }

  addSection(classId: string, unitId: string, name: string): Section {
    const cls  = this.classes.find((c) => c.id === classId);
    const unit = cls?.units.find((u) => u.id === unitId);
    if (!unit) throw new Error('Unit not found');
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const id   = `${slug || 'sec'}-${Date.now()}`;
    const sec: Section = { id, name: name.trim() };
    unit.sections.push(sec);
    this.#save();
    return sec;
  }
}

export const customClasses = new CustomClassStore();
