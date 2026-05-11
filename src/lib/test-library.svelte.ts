import type { TestConfig, SavedTest } from './types';

const LIBRARY_KEY = 'tg-test-library-v1';
export const DRAFT_KEY = 'tg-test-draft-v1';

function loadLibrary(): SavedTest[] {
  try {
    return JSON.parse(localStorage.getItem(LIBRARY_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function loadDraft(): TestConfig | null {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null');
  } catch {
    return null;
  }
}

class TestLibrary {
  tests = $state<SavedTest[]>(loadLibrary());
  draft = $state<TestConfig | null>(loadDraft());

  #saveLibrary() {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(this.tests));
  }

  saveDraft(config: TestConfig): void {
    this.draft = config;
    localStorage.setItem(DRAFT_KEY, JSON.stringify(config));
  }

  clearDraft(): void {
    this.draft = null;
    localStorage.removeItem(DRAFT_KEY);
  }

  saveAs(name: string, classId: string | null, config: TestConfig): SavedTest {
    const entry: SavedTest = {
      id: crypto.randomUUID(),
      name: name.trim(),
      classId,
      config: JSON.parse(JSON.stringify(config)),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.tests = [...this.tests, entry];
    this.#saveLibrary();
    return entry;
  }

  update(id: string, config: TestConfig): void {
    this.tests = this.tests.map((t) =>
      t.id === id ? { ...t, config: JSON.parse(JSON.stringify(config)), updatedAt: Date.now() } : t
    );
    this.#saveLibrary();
  }

  rename(id: string, name: string): void {
    if (!name.trim()) return;
    this.tests = this.tests.map((t) =>
      t.id === id ? { ...t, name: name.trim(), updatedAt: Date.now() } : t
    );
    this.#saveLibrary();
  }

  delete(id: string): void {
    this.tests = this.tests.filter((t) => t.id !== id);
    this.#saveLibrary();
  }

  load(id: string): TestConfig | null {
    const entry = this.tests.find((t) => t.id === id);
    return entry ? JSON.parse(JSON.stringify(entry.config)) : null;
  }

  get(id: string): SavedTest | undefined {
    return this.tests.find((t) => t.id === id);
  }

  get byClass(): Map<string | null, SavedTest[]> {
    const map = new Map<string | null, SavedTest[]>();
    const sorted = [...this.tests].sort((a, b) => b.updatedAt - a.updatedAt);
    for (const t of sorted) {
      const bucket = map.get(t.classId) ?? [];
      bucket.push(t);
      map.set(t.classId, bucket);
    }
    return map;
  }

  exportJson(): string {
    return JSON.stringify(this.tests, null, 2);
  }

  mergeRemote(remote: SavedTest): void {
    const existing = this.tests.find((t) => t.id === remote.id);
    if (!existing || remote.updatedAt > existing.updatedAt) {
      this.tests = existing
        ? this.tests.map((t) => (t.id === remote.id ? remote : t))
        : [...this.tests, remote];
      this.#saveLibrary();
    }
  }
}

export const testLibrary = new TestLibrary();
