import type { Class } from './types';

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
}

export const customClasses = new CustomClassStore();
