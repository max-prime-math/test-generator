// Fuzzy search scoring algorithm
// Returns a score > 0 if all query characters appear in target in order; 0 if no match.
// Higher scores indicate better matches (consecutive characters, word boundaries, etc).
export function fuzzyScore(query: string, target: string): number {
  if (!query) return 1;
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  let qi = 0;
  let score = 0;
  let lastIdx = -1;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      // Consecutive character (penalty is lower score, not subtraction)
      const isConsecutive = lastIdx === ti - 1;
      // Word boundary bonus (after space or at start)
      const isWordBoundary = ti === 0 || t[ti - 1] === ' ';

      if (isWordBoundary) score += 3;
      if (isConsecutive) score += 2;
      else score += 1;

      lastIdx = ti;
      qi++;
    }
  }

  // No match if not all query characters found
  return qi === q.length ? score : 0;
}

// Weighted fuzzy scoring across multiple fields
export function fuzzyScoreMulti(query: string, fields: Array<{ text: string; weight: number }>): number {
  let totalScore = 0;
  for (const field of fields) {
    totalScore += fuzzyScore(query, field.text) * field.weight;
  }
  return totalScore;
}

// Generic fuzzy filter helper
export function fuzzyFilter<T>(
  query: string,
  items: T[],
  getTexts: (item: T) => Array<{ text: string; weight: number }>
): T[] {
  if (!query.trim()) return items;

  const scored = items.map((item) => ({
    item,
    score: fuzzyScoreMulti(query.trim(), getTexts(item)),
  }));

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.item);
}
