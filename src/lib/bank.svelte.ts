import type { Question } from './types';

const KEY = 'math-test-bank-v1';

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

// Seed sample questions when the bank is empty (first run only)
if (bank.questions.length === 0) {
  const samples: Omit<Question, 'id' | 'createdAt'>[] = [
    {
      body: 'Find the derivative of $f(x) = x^3 - 4x^2 + 7x - 2$.',
      solution: '$f\'(x) = 3x^2 - 8x + 7$',
      points: 5,
      tags: ['calculus', 'derivatives'],
    },
    {
      body: 'Evaluate the definite integral $ integral_0^2 (3x^2 - 2x + 1) dif x $.',
      solution: '$[x^3 - x^2 + x]_0^2 = (8 - 4 + 2) - 0 = 6$',
      points: 8,
      tags: ['calculus', 'integrals'],
    },
    {
      body: 'Find all real solutions to $2x^2 - 5x - 3 = 0$.',
      solution: 'Using the quadratic formula: $x = frac(5 plus.minus sqrt(25 + 24), 4) = frac(5 plus.minus 7, 4)$, so $x = 3$ or $x = -1/2$.',
      points: 6,
      tags: ['algebra', 'quadratics'],
    },
    {
      body: 'Evaluate $lim_(x -> 0) frac(sin(3x), x)$.',
      solution: '$lim_(x -> 0) frac(sin(3x), x) = 3 lim_(x -> 0) frac(sin(3x), 3x) = 3 dot 1 = 3$',
      points: 6,
      tags: ['calculus', 'limits'],
    },
    {
      body: 'Determine whether the series $ sum_(n=1)^infinity frac(1, n^2) $ converges or diverges. Justify your answer.',
      solution: 'Converges by the $p$-series test since $p = 2 > 1$.',
      points: 8,
      tags: ['calculus', 'series'],
    },
    {
      body: 'Let $f(x) = e^(x^2)$. Find $f\'(x)$ and $f\'\'(x)$.',
      solution: '$f\'(x) = 2x e^(x^2)$. By the product rule: $f\'\'(x) = 2e^(x^2) + 4x^2 e^(x^2) = (2 + 4x^2)e^(x^2)$.',
      points: 8,
      tags: ['calculus', 'derivatives'],
    },
    {
      body: 'Solve the system of equations:\n  $ 3x - 2y = 7 $\n  $ x + 4y = 5 $',
      solution: 'From the second equation, $x = 5 - 4y$. Substituting: $3(5 - 4y) - 2y = 7 \\Rightarrow 15 - 14y = 7 \\Rightarrow y = 4/7$, $x = 5 - 16/7 = 19/7$.',
      points: 7,
      tags: ['algebra', 'systems'],
    },
    {
      body: 'Prove that $sin^2 theta + cos^2 theta = 1$ using the unit circle definition of sine and cosine.',
      solution: 'A point on the unit circle satisfies $x^2 + y^2 = 1$. Since $cos theta = x$ and $sin theta = y$ by definition, substituting gives $cos^2 theta + sin^2 theta = 1$.',
      points: 6,
      tags: ['trigonometry', 'proofs'],
    },
    {
      body: 'Find the area enclosed by $y = x^2$ and $y = 2x + 3$.',
      solution: 'Intersections: $x^2 = 2x + 3 \\Rightarrow x = -1, 3$. Area $= integral_(-1)^3 (2x + 3 - x^2) dif x = [x^2 + 3x - x^3/3]_(-1)^3 = (9 + 9 - 9) - (1 - 3 + 1/3) = 32/3$.',
      points: 10,
      tags: ['calculus', 'integrals', 'area'],
    },
    {
      body: 'Use logarithmic differentiation to find $frac(dif y, dif x)$ if $y = x^(sin x)$.',
      solution: '$ln y = sin x ln x$. Differentiating: $frac(1, y) frac(dif y, dif x) = cos x ln x + frac(sin x, x)$. Thus $frac(dif y, dif x) = x^(sin x) (cos x ln x + frac(sin x, x))$.',
      points: 9,
      tags: ['calculus', 'derivatives'],
    },
  ];

  for (const q of samples) {
    bank.add(q);
  }
}
