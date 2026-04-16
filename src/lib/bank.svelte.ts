import type { Question } from './types';
import { AP_CALC_BC_QUESTIONS } from './ap-calc-bc-questions';

const KEY = 'math-test-bank-v2';

function load(): Question[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]');
  } catch {
    return [];
  }
}

class QuestionBank {
  questions = $state<Question[]>(load());

  #save() {
    localStorage.setItem(KEY, JSON.stringify(this.questions));
  }

  add(data: Omit<Question, 'id' | 'createdAt'>) {
    this.questions.push({
      ...data,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
    });
    this.#save();
  }

  update(id: string, data: Partial<Omit<Question, 'id' | 'createdAt'>>) {
    const i = this.questions.findIndex((q) => q.id === id);
    if (i !== -1) {
      this.questions[i] = { ...this.questions[i], ...data };
      this.#save();
    }
  }

  remove(id: string) {
    this.questions = this.questions.filter((q) => q.id !== id);
    this.#save();
  }

  exportJson(): string {
    return JSON.stringify(this.questions, null, 2);
  }

  importJson(json: string): { imported: number; errors: number } {
    try {
      const items = JSON.parse(json);
      if (!Array.isArray(items)) throw new Error('Expected a JSON array');
      let imported = 0;
      let errors = 0;
      for (const item of items) {
        if (typeof item.body === 'string' && typeof item.points === 'number') {
          this.questions.push({
            id: typeof item.id === 'string' ? item.id : crypto.randomUUID(),
            body: item.body,
            solution: typeof item.solution === 'string' ? item.solution : undefined,
            points: item.points,
            tags: Array.isArray(item.tags) ? item.tags : [],
            classId: typeof item.classId === 'string' ? item.classId : undefined,
            unitId: typeof item.unitId === 'string' ? item.unitId : undefined,
            sectionId: typeof item.sectionId === 'string' ? item.sectionId : undefined,
            createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
          });
          imported++;
        } else {
          errors++;
        }
      }
      this.#save();
      return { imported, errors };
    } catch {
      return { imported: 0, errors: 1 };
    }
  }
}

export const bank = new QuestionBank();

// Seed AP Calculus BC questions on first run (empty bank)
if (bank.questions.length === 0) {
  for (const q of AP_CALC_BC_QUESTIONS) {
    bank.add(q);
  }
}
