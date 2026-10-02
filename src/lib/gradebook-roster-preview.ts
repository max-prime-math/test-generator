import type { GradebookStudent } from './types.ts';
import type { ParsedRosterStudent } from './gradebook-roster-import.ts';

const normalize = (value: string) => value.normalize('NFKC').replace(/[’‘]/g, "'").trim().replace(/\s+/g, ' ').toLocaleLowerCase();
const sameName = (student: GradebookStudent, row: ParsedRosterStudent) =>
  normalize(student.lastName) === normalize(row.lastName) &&
  [student.firstName, student.knownBy ?? ''].filter(Boolean).some(name => normalize(name) === normalize(row.firstName));

export function findMatchingStudentIndex(students: GradebookStudent[], row: ParsedRosterStudent): number {
  const id = row.sisId?.trim();
  if (id) {
    const index = students.findIndex(student => student.sisId === id);
    if (index >= 0) return index;
  }
  const email = row.email?.trim().toLocaleLowerCase();
  if (email) {
    const index = students.findIndex(student => student.email?.toLocaleLowerCase() === email);
    if (index >= 0) return index;
  }
  return students.findIndex(student => sameName(student, row));
}

export interface RosterPreviewRow {
  student: ParsedRosterStudent;
  action: 'Add' | 'Update' | 'Conflict';
  detail: string;
}

/** Simulate in file order so duplicate/conflicting rows within a file are checked too. */
export function previewRosterImport(existing: GradebookStudent[], imported: ParsedRosterStudent[]): RosterPreviewRow[] {
  const students = existing.map(student => ({ ...student }));
  return imported.map((row, index) => {
    const id = row.sisId?.trim();
    const matchingId = id ? students.filter(student => student.sisId === id) : [];
    const names = students.filter(student => sameName(student, row));
    const matchIndex = findMatchingStudentIndex(students, row);
    const match = students[matchIndex];
    const conflict = matchingId.length > 1 ? `Student ID ${id} belongs to multiple records.`
      : matchingId.length && !sameName(matchingId[0], row) ? `Student ID ${id} belongs to ${matchingId[0].displayName}.`
      : !matchingId.length && names.length > 1 ? 'Multiple students have this name; provide a matching student ID.'
      : id && match?.sisId && match.sisId !== id ? `The matched student already has ID ${match.sisId}.`
      : '';
    if (conflict) return { student: row, action: 'Conflict', detail: conflict };
    if (match) {
      students[matchIndex] = { ...match, sisId: id || match.sisId, email: row.email || match.email };
      return { student: row, action: 'Update', detail: `Merge details with ${match.displayName}; existing scores are kept.` };
    }
    students.push({ ...row, id: `preview-${index}`, active: true, createdAt: 0, updatedAt: 0 });
    return { student: row, action: 'Add', detail: 'Create student and enroll in this section.' };
  });
}
