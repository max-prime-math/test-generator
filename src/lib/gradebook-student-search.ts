import type { GradebookStudent } from './types';

function normalize(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase().replace(/['’]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function oneEditApart(left: string, right: string): boolean {
  if (Math.abs(left.length - right.length) > 1) return false;
  let a = 0;
  let b = 0;
  let edits = 0;
  while (a < left.length && b < right.length) {
    if (left[a] === right[b]) { a++; b++; continue; }
    if (++edits > 1) return false;
    if (left.length >= right.length) a++;
    if (right.length >= left.length) b++;
  }
  return edits + Number(a < left.length || b < right.length) <= 1;
}

function tokenScore(query: string, candidate: string): number {
  if (candidate === query) return 100;
  if (candidate.startsWith(query)) return 80;
  if (candidate.includes(query)) return 60;
  // Keep numeric IDs literal; fuzzy names support omitted letters and one typo.
  if (/\d/.test(query)) return 0;
  if (query.length >= 4 && oneEditApart(query, candidate)) return 35;
  let index = 0;
  for (const letter of candidate) if (letter === query[index]) index++;
  return index === query.length ? 20 : 0;
}

/** Higher scores rank exact names ahead of prefixes, partial names, and fuzzy matches. */
export function studentSearchScore(student: Pick<GradebookStudent, 'firstName' | 'lastName' | 'knownBy' | 'sisId'>, query: string): number | null {
  const normalized = normalize(query);
  if (!normalized) return 0;
  const names = [student.firstName, student.lastName, student.knownBy ?? '', student.sisId ?? ''].map(normalize);
  const words = names.flatMap(name => name.split(' ')).filter(Boolean);
  let score = 0;
  for (const token of normalized.split(' ')) {
    const best = Math.max(0, ...words.map(word => tokenScore(token, word)));
    if (best === 0) return null;
    score += best;
  }
  const fullNames = [
    `${student.firstName} ${student.lastName}`,
    `${student.lastName} ${student.firstName}`,
    `${student.knownBy || student.firstName} ${student.lastName}`,
  ].map(normalize);
  return score + (fullNames.includes(normalized) ? 100 : 0);
}
