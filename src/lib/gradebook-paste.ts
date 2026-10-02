import { parseDelimitedRows } from './gradebook-roster-import.ts';
import type { GradebookScoreState } from './types.ts';

export interface PastedGrade { points: number | null; state: GradebookScoreState }
/** Validate the complete rectangle before writing any cells. */
export function parseGradePaste(text: string, questionMode: boolean): PastedGrade[][] {
  const rows = parseDelimitedRows(text.replace(/\r?\n$/, ''), '\t');
  const states = ['missing', 'excused', 'absent', 'incomplete'];
  return rows.map((row, rowIndex) => row.map((cell, colIndex) => {
    const value = cell.trim();
    if (!questionMode && states.includes(value.toLowerCase())) return { points: null, state: value.toLowerCase() as GradebookScoreState };
    if (!value) return { points: null, state: 'normal' };
    if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value) || !Number.isFinite(Number(value))) {
      throw new Error(`Invalid score at pasted row ${rowIndex + 1}, column ${colIndex + 1}: “${value}”. Use numeric point scores${questionMode ? '' : ' or Missing, Excused, Absent, Incomplete'}.`);
    }
    return { points: Number(value), state: 'normal' };
  }));
}
