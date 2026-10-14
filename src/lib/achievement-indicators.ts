// Achievement indicators: metadata on a question naming what it assesses. A bank's curriculum
// lists each section's indicators; a question stores their ids. They do not place a question
// (class, unit and section do that); they let a test swap a question for another that
// assesses the same thing.
import type { AchievementIndicator, Class, Question, Section, Unit } from './types.ts';

export interface IndicatorEntry extends AchievementIndicator {
  cls: Class;
  unit: Unit;
  section: Section;
  /** 1-based position in its section's list. */
  number: number;
}

/** Every indicator in these classes, in curriculum order. An id two classes share is listed once, from the first. */
export function indicatorIndex(classes: Class[]): Map<string, IndicatorEntry> {
  const index = new Map<string, IndicatorEntry>();
  for (const cls of classes) for (const unit of cls.units) for (const section of unit.sections) {
    (section.indicators ?? []).forEach((indicator, i) => {
      if (!index.has(indicator.id)) index.set(indicator.id, { ...indicator, cls, unit, section, number: i + 1 });
    });
  }
  return index;
}

/** What to show for an indicator: its nickname when it has one, otherwise its full wording. */
export const indicatorLabel = (indicator: Pick<AchievementIndicator, 'text' | 'nickname'>): string => indicator.nickname || indicator.text;

/** Indicators matching every word of the query, by id, wording or section. */
export function searchIndicators(index: Map<string, IndicatorEntry>, query: string, limit = 40): IndicatorEntry[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const found: IndicatorEntry[] = [];
  for (const entry of index.values()) {
    const text = `${entry.id} ${entry.text} ${entry.nickname ?? ''} ${entry.section.id} ${entry.section.name} ${entry.section.nickname ?? ''}`.toLowerCase();
    if (words.every((word) => text.includes(word))) found.push(entry);
    if (found.length >= limit) break;
  }
  return found;
}

/** The section that lists an indicator, as a `class/unit/section` key. */
const sectionKey = (entry: IndicatorEntry) => `${entry.cls.id}/${entry.unit.id}/${entry.section.id}`;

/** Sections a question belongs to: its own placement, and the sections listing its indicators. */
function questionSections(question: Question, index: Map<string, IndicatorEntry>): Set<string> {
  const sections = new Set<string>();
  if (question.sectionId) sections.add(`${question.classId}/${question.unitId}/${question.sectionId}`);
  for (const id of question.indicators ?? []) {
    const entry = index.get(id);
    if (entry) sections.add(sectionKey(entry));
  }
  return sections;
}

export interface SwapMatch {
  question: Question;
  /** indicator: shares an indicator. section: same section (or outcome), different indicators. */
  level: 'indicator' | 'section';
  shared: string[];
}

const isMcq = (q: Question) => Boolean(q.choices && Object.keys(q.choices).length);

/**
 * Questions that could stand in for `target` on another version of a test: first those sharing an
 * indicator, then those in the same section. Within each, the same question type and the closest
 * point value come first.
 */
export function swapMatches(target: Question, pool: Iterable<Question>, index: Map<string, IndicatorEntry>,
  exclude: ReadonlySet<string> = new Set()): SwapMatch[] {
  const indicators = new Set(target.indicators ?? []);
  const sections = questionSections(target, index);
  const matches: SwapMatch[] = [];
  for (const question of pool) {
    if (question.id === target.id || exclude.has(question.id)) continue;
    const shared = (question.indicators ?? []).filter((id) => indicators.has(id));
    if (shared.length) matches.push({ question, level: 'indicator', shared });
    else if ([...questionSections(question, index)].some((key) => sections.has(key))) matches.push({ question, level: 'section', shared });
  }
  const rank = (match: SwapMatch) => [
    match.level === 'indicator' ? 0 : 1,
    -match.shared.length,
    isMcq(match.question) === isMcq(target) ? 0 : 1,
    Math.abs(match.question.points - target.points),
  ];
  return matches.sort((a, b) => {
    const x = rank(a), y = rank(b);
    const i = x.findIndex((value, k) => value !== y[k]);
    return i === -1 ? 0 : x[i] - y[i];
  });
}

/** Indicator ids from imported data (ids, or `{ id, text }` objects): trimmed, once each; undefined when there are none. */
export function normalizeIndicators(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const raw = value.map((item) => (item && typeof item === 'object' ? (item as { id?: unknown }).id : item));
  const ids = [...new Set(raw.filter((id): id is string => typeof id === 'string').map((id) => id.trim()).filter(Boolean))];
  return ids.length ? ids : undefined;
}
