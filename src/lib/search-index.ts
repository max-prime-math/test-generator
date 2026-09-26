import type { Narrative, Question } from './types';
import { formatParts } from './question-format';

// Lowercased search text cached per object. Entries are revalidated by reference against the
// source fields, so replaced objects miss naturally and in-place edits never serve stale text.
type Slot = { parts: readonly unknown[]; text: string };
const slots = new WeakMap<object, Map<string, Slot>>();

function sameParts(a: readonly unknown[], b: readonly unknown[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Cache `build()` (already lowercased) on `owner` under `slot` until any of `parts` changes identity. */
export function cachedText(owner: object, slot: string, parts: readonly unknown[], build: () => string): string {
  let map = slots.get(owner);
  if (!map) slots.set(owner, (map = new Map()));
  const hit = map.get(slot);
  if (hit && sameParts(hit.parts, parts)) return hit.text;
  const text = build();
  map.set(slot, { parts, text });
  return text;
}

export function lowerText(owner: object, slot: string, text: string): string {
  return cachedText(owner, slot, [text], () => text.toLowerCase());
}

/** Lowercased fields the Bank fuzzy search scores, matching the text the uncached search used. */
export function questionSearchText(q: Question) {
  const tags = q.tags ?? [];
  return {
    get content() { return cachedText(q, 'content', [q.parts, q.body], () => (q.parts ? formatParts(q.parts) : q.body).toLowerCase()); },
    get body() { return lowerText(q, 'body', q.body); },
    get tags() { return cachedText(q, 'tags', [tags, tags.length], () => tags.join(' ').toLowerCase()); },
    get solution() { return lowerText(q, 'solution', q.solution ?? ''); },
    get answer() { return lowerText(q, 'answer', q.answer ?? ''); },
    /** Body, tags and id, as the Editor navigator substring search reads them. */
    get nav() { return cachedText(q, 'nav', [q.body, tags, tags.length, q.id], () => `${q.body} ${tags.join(' ')} ${q.id}`.toLowerCase()); },
  };
}

/** Lowercased narrative body/title with resolveQuestionNarrative's precedence rules. */
export function narrativeSearchText(q: Question, byId: Map<string, Narrative>): { body: string; title: string } {
  const narrativeId = q.narrativeId?.trim();
  const own = q.narrative ? cachedText(q, 'narrative', [q.narrative], () => q.narrative!.trim().toLowerCase()) : '';
  if (!narrativeId) return { body: own, title: '' };
  const shared = byId.get(narrativeId);
  const sharedBody = shared ? cachedText(shared, 'body', [shared.body], () => shared.body.trim().toLowerCase()) : '';
  const body = sharedBody || own;
  return { body, title: body && shared?.title ? lowerText(shared, 'title', shared.title) : '' };
}

export function narrativeIndex(list: Narrative[]): Map<string, Narrative> {
  const byId = new Map<string, Narrative>();
  for (const narrative of list) if (!byId.has(narrative.id)) byId.set(narrative.id, narrative);
  return byId;
}

/** fuzzyScore from ./fuzzy for text that is already lowercased; scores are identical. */
export function fuzzyScoreLower(q: string, t: string): number {
  if (!q) return 1;
  let qi = 0, score = 0, lastIdx = -1;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      if (ti === 0 || t[ti - 1] === ' ') score += 3;
      score += lastIdx === ti - 1 ? 2 : 1;
      lastIdx = ti;
      qi++;
    }
  }
  return qi === q.length ? score : 0;
}

/** fuzzyScoreMulti for a lowercased query and lowercased fields. */
export function fuzzyScoreMultiLower(query: string, fields: Array<{ text: string; weight: number }>): number {
  let total = 0;
  for (const field of fields) total += fuzzyScoreLower(query, field.text) * field.weight;
  return total;
}
