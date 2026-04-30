import type { Question } from './types';
import { AP_CALC_BC_QUESTIONS } from './ap-calc-bc-questions';
import { appState } from './app-state.svelte';
import { DEMO_CLASS_IDS } from './curriculum';

const KEY = 'math-test-bank-v2';
const DEMO_KEY = 'math-test-demo-bank-v1';

function load(): Question[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]');
  } catch {
    return [];
  }
}

function loadDemo(): Question[] {
  try {
    return JSON.parse(localStorage.getItem(DEMO_KEY) ?? '[]');
  } catch {
    return [];
  }
}

class QuestionBank {
  userQuestions = $state<Question[]>(load());
  demoQuestions = $state<Question[]>(loadDemo());

  constructor() {
    if (this.demoQuestions.length === 0) {
      this.demoQuestions = AP_CALC_BC_QUESTIONS.map((q) => ({
        ...q,
        id: crypto.randomUUID(),
        createdAt: Date.now(),
      }));
      this.#saveDemo();
    }

    const migrated = this.userQuestions.filter((q) => DEMO_CLASS_IDS.has(q.classId ?? ''));
    if (migrated.length > 0) {
      const knownDemoIds = new Set(this.demoQuestions.map((q) => q.id));
      this.demoQuestions = [
        ...this.demoQuestions,
        ...migrated.filter((q) => !knownDemoIds.has(q.id)),
      ];
      this.userQuestions = this.userQuestions.filter((q) => !DEMO_CLASS_IDS.has(q.classId ?? ''));
      this.#saveUser();
      this.#saveDemo();
    }
  }

  get questions(): Question[] {
    return appState.demoMode
      ? [...this.userQuestions, ...this.demoQuestions]
      : this.userQuestions;
  }

  set questions(next: Question[]) {
    if (appState.demoMode) {
      const demoIds = new Set(this.demoQuestions.map((q) => q.id));
      this.userQuestions = next.filter((q) => !demoIds.has(q.id) && !DEMO_CLASS_IDS.has(q.classId ?? ''));
      this.demoQuestions = next.filter((q) => demoIds.has(q.id) || DEMO_CLASS_IDS.has(q.classId ?? ''));
      this.#saveUser();
      this.#saveDemo();
      return;
    }

    this.userQuestions = next.filter((q) => !DEMO_CLASS_IDS.has(q.classId ?? ''));
    this.#saveUser();
  }

  #saveUser() {
    localStorage.setItem(KEY, JSON.stringify(this.userQuestions));
  }

  #saveDemo() {
    localStorage.setItem(DEMO_KEY, JSON.stringify(this.demoQuestions));
  }

  #findQuestionLocation(id: string) {
    const userIdx = this.userQuestions.findIndex((q) => q.id === id);
    if (userIdx !== -1) return { bucket: 'user' as const, index: userIdx };
    const demoIdx = this.demoQuestions.findIndex((q) => q.id === id);
    if (demoIdx !== -1) return { bucket: 'demo' as const, index: demoIdx };
    return null;
  }

  add(data: Omit<Question, 'id' | 'createdAt'>) {
    const question = {
      ...data,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
    };
    if (DEMO_CLASS_IDS.has(data.classId ?? '')) {
      this.demoQuestions = [...this.demoQuestions, question];
      this.#saveDemo();
    } else {
      this.userQuestions = [...this.userQuestions, question];
      this.#saveUser();
    }
  }

  update(id: string, data: Partial<Omit<Question, 'id' | 'createdAt'>>) {
    const loc = this.#findQuestionLocation(id);
    if (!loc) return;

    if (loc.bucket === 'user') {
      const next = [...this.userQuestions];
      next[loc.index] = { ...next[loc.index], ...data, updatedAt: Date.now() };
      this.userQuestions = next;
      this.#saveUser();
    } else {
      const next = [...this.demoQuestions];
      next[loc.index] = { ...next[loc.index], ...data, updatedAt: Date.now() };
      this.demoQuestions = next;
      this.#saveDemo();
    }
  }

  remove(id: string) {
    const loc = this.#findQuestionLocation(id);
    if (!loc) return;

    if (loc.bucket === 'user') {
      this.userQuestions = this.userQuestions.filter((q) => q.id !== id);
      this.#saveUser();
    } else {
      this.demoQuestions = this.demoQuestions.filter((q) => q.id !== id);
      this.#saveDemo();
    }
  }

  exportJson(): string {
    return JSON.stringify(this.userQuestions, null, 2);
  }

  importJson(json: string): { imported: number; errors: number } {
    try {
      const items = JSON.parse(json);
      if (!Array.isArray(items)) throw new Error('Expected a JSON array');
      let imported = 0;
      let errors = 0;
      for (const item of items) {
        if (typeof item.body === 'string' && typeof item.points === 'number') {
          const question = {
            id: typeof item.id === 'string' ? item.id : crypto.randomUUID(),
            body: item.body,
            answer: typeof item.answer === 'string' ? item.answer : undefined,
            solution: typeof item.solution === 'string' ? item.solution : undefined,
            choices: item.choices && typeof item.choices === 'object' ? item.choices : undefined,
            points: item.points,
            tags: Array.isArray(item.tags) ? item.tags : [],
            images: Array.isArray(item.images) ? item.images.filter((x: unknown) => typeof x === 'string') : undefined,
            questionType: typeof item.questionType === 'string' ? item.questionType : undefined,
            classId: typeof item.classId === 'string' ? item.classId : undefined,
            unitId: typeof item.unitId === 'string' ? item.unitId : undefined,
            sectionId: typeof item.sectionId === 'string' ? item.sectionId : undefined,
            createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
            updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : undefined,
          };
          if (DEMO_CLASS_IDS.has(question.classId ?? '')) {
            this.demoQuestions = [...this.demoQuestions, question];
            this.#saveDemo();
          } else {
            this.userQuestions = [...this.userQuestions, question];
            this.#saveUser();
          }
          imported++;
        } else {
          errors++;
        }
      }
      return { imported, errors };
    } catch {
      return { imported: 0, errors: 1 };
    }
  }
}

export const bank = new QuestionBank();
