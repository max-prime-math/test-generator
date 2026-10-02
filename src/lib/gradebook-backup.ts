import { gradePoints, gradePercent, finalGradePercent } from './gradebook-calculations.ts';
import type { GradebookData } from './types.ts';
import { assessmentScorePercent, cloneGradebookData, normalizeGradebookData } from './gradebook-model.ts';

export const GRADEBOOK_BACKUP_KIND = 'test-generator-gradebook-backup';

export interface GradebookBackupFile {
  kind: typeof GRADEBOOK_BACKUP_KIND;
  version: 1;
  exportedAt: number;
  data: GradebookData;
}

export function createGradebookBackup(data: GradebookData, exportedAt = Date.now()): GradebookBackupFile {
  return {
    kind: GRADEBOOK_BACKUP_KIND,
    version: 1,
    exportedAt,
    data: cloneGradebookData(data),
  };
}

export function stringifyGradebookBackup(data: GradebookData, exportedAt = Date.now()): string {
  return JSON.stringify(createGradebookBackup(data, exportedAt), null, 2);
}

export function parseGradebookBackup(text: string): GradebookData {
  const parsed = JSON.parse(text) as unknown;
  if (
    parsed
    && typeof parsed === 'object'
    && !Array.isArray(parsed)
    && (parsed as { kind?: unknown }).kind === GRADEBOOK_BACKUP_KIND
  ) {
    return normalizeGradebookData((parsed as { data?: unknown }).data);
  }
  return normalizeGradebookData(parsed);
}

export function gradebookScoresCsv(data: GradebookData): string {
  const normalized = normalizeGradebookData(data);
  const rows: string[][] = [[
    'sectionId',
    'sectionName',
    'sectionArchivedAt',
    'studentId',
    'sisId',
    'firstName',
    'lastName',
    'displayName',
    'email',
    'enrollmentActive',
    'assessmentId',
    'assessmentName',
    'assessmentType',
    'administeredAt',
    'baseTotalPoints',
    'bonusPoints',
    'scoreState',
    'scorePoints',
    'scorePercent',
    'questionScoresJson',
  ]];

  for (const section of normalized.sections) {
    const enrollments = normalized.enrollments.filter((enrollment) => enrollment.sectionId === section.id);
    const assessments = normalized.assessments.filter((assessment) => assessment.sectionId === section.id);
    for (const enrollment of enrollments) {
      const student = normalized.students.find((candidate) => candidate.id === enrollment.studentId);
      if (!student) continue;
      if (assessments.length === 0) {
        rows.push([
          section.id,
          section.name,
          section.archivedAt ? new Date(section.archivedAt).toISOString() : '',
          student.id,
          student.sisId ?? '',
          student.firstName,
          student.lastName,
          student.displayName,
          student.email ?? '',
          String(enrollment.active),
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
        ]);
        continue;
      }

      for (const assessment of assessments) {
        const score = normalized.scores.find((candidate) =>
          candidate.assessmentId === assessment.id && candidate.studentId === student.id
        );
        const percent = assessmentScorePercent(score, assessment);
        rows.push([
          section.id,
          section.name,
          section.archivedAt ? new Date(section.archivedAt).toISOString() : '',
          student.id,
          student.sisId ?? '',
          student.firstName,
          student.lastName,
          student.displayName,
          student.email ?? '',
          String(enrollment.active),
          assessment.id,
          assessment.savedTestName || assessment.title,
          assessment.testType ?? '',
          new Date(assessment.administeredAt).toISOString(),
          String(assessment.totalPoints),
          String(assessment.bonusPoints),
          score?.state ?? '',
          score?.points === null || score?.points === undefined ? '' : String(score.points),
          percent === null ? '' : String(Math.round(percent * 100) / 100),
          score?.questionScores ? JSON.stringify(score.questionScores) : '',
        ]);
      }
    }
  }

  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

function csvCell(value: string): string {
  if (!/[",\n\r]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

/** One section in Overview order, ready to open as a spreadsheet. */
export function gradebookOverviewCsv(data: GradebookData, sectionId: string, options: { studentIds: string[]; assessmentIds: string[]; display: 'points' | 'percent' }): string {
  const section = data.sections.find(item => item.id === sectionId);
  if (!section) throw new Error('Select a section to export.');
  const assessments = options.assessmentIds.map(id => data.assessments.find(item => item.id === id && item.sectionId === sectionId)).filter((item): item is NonNullable<typeof item> => Boolean(item));
  const grades = new Map(data.scores.filter(score => score.sectionId === sectionId).map(score => [`${score.studentId}:${score.assessmentId}`, score]));
  const format = (value: number | null, percent = false) => value === null ? '' : `${Number.isInteger(value) ? value : value.toFixed(1)}${percent ? '%' : ''}`;
  const rows = [['Student', 'Student ID', ...assessments.map(assessment => `${assessment.savedTestName} (${options.display === 'percent' ? '%' : `/${assessment.totalPoints}`})`), 'Final grade (%)']];
  for (const id of options.studentIds) {
    const student = data.students.find(item => item.id === id);
    if (!student || !data.enrollments.some(item => item.sectionId === sectionId && item.studentId === id)) continue;
    rows.push([student.displayName, student.sisId ?? '', ...assessments.map(assessment => {
      const score = grades.get(`${id}:${assessment.id}`);
      if (score && score.state !== 'normal') return score.state.charAt(0).toUpperCase() + score.state.slice(1);
      return format(options.display === 'percent' ? gradePercent(score, assessment, section) : gradePoints(score, section), options.display === 'percent');
    }), format(finalGradePercent(section, data.assessments.filter(assessment => assessment.sectionId === sectionId), assessmentId => grades.get(`${id}:${assessmentId}`)), true)]);
  }
  return rows.map(row => row.map(csvCell).join(',')).join('\n');
}
