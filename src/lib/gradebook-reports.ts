import { assessmentTypeKey, scoreTotalPoints, studentKnownBy, GRADEBOOK_CATEGORIES } from './gradebook-model.ts';
import { finalGradePercent, gradePercent, gradePoints } from './gradebook-calculations.ts';
import { matchesWorkState } from './gradebook-filters.ts';
import type { GradebookData, GradebookStudentNote, TestType } from './types.ts';

export interface GradebookReportOptions {
  sectionId: string;
  studentIds: string[];
  assessmentIds?: string[];
  kind: 'progress' | 'missing';
  includeIncomplete: boolean;
  includeUngraded: boolean;
  includeNotes: boolean;
  includeInactive: boolean;
  generatedAt: number;
}
export interface GradebookReport {
  studentId: string;
  studentName: string;
  sisId: string;
  sectionName: string;
  term: string;
  inactive: boolean;
  kind: GradebookReportOptions['kind'];
  generatedAt: number;
  finalPercent: number | null;
  categories: { category: TestType; earned: number; possible: number; percent: number | null; weight: number }[];
  rows: { id: string; name: string; category: TestType; date: number; points: number | null; possible: number; percent: number | null; state: string }[];
  notes: Pick<GradebookStudentNote, 'text' | 'createdAt'>[];
  policy: string;
  limitedAssessments: boolean;
}
export const reportNumber = (value: number | null): string => value === null ? '—' : String(Number(value.toFixed(1)));
export const reportCategory = (value: string): string => value[0].toUpperCase() + value.slice(1);
export const reportDate = (value: number): string => new Date(value).toLocaleDateString();

/** All totals use the same calculation functions as Overview; report row selection never changes a course grade. */
export function buildGradebookReports(data: GradebookData, options: GradebookReportOptions): GradebookReport[] {
  const section = data.sections.find(item => item.id === options.sectionId);
  if (!section) return [];
  const assessments = data.assessments.filter(item => item.sectionId === section.id)
    .sort((a, b) => a.administeredAt - b.administeredAt || a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  const chosen = options.assessmentIds ? new Set(options.assessmentIds) : null;
  const shown = chosen ? assessments.filter(item => chosen.has(item.id)) : assessments;
  const students = new Map(data.students.map(student => [student.id, student]));
  const enrollments = new Map(data.enrollments.filter(enrollment => enrollment.sectionId === section.id).map(enrollment => [enrollment.studentId, enrollment]));
  const scores = new Map(data.scores.filter(score => score.sectionId === section.id).map(score => [`${score.studentId}:${score.assessmentId}`, score]));
  const notes = new Map<string, GradebookStudentNote[]>();
  if (options.includeNotes) for (const note of data.studentNotes ?? []) {
    if (note.sectionId !== section.id || note.trashedAt || !note.includeInReports) continue;
    notes.set(note.studentId, [...(notes.get(note.studentId) ?? []), note]);
  }
  const reports: GradebookReport[] = [];
  for (const id of new Set(options.studentIds)) {
    const student = students.get(id), enrollment = enrollments.get(id);
    if (!student || !enrollment) continue;
    const inactive = !student.active || !enrollment.active;
    if (inactive && !options.includeInactive) continue;
    const scoreFor = (assessmentId: string) => scores.get(`${id}:${assessmentId}`);
    const rows = shown.filter(assessment => {
      if (options.kind === 'progress') return true;
      const score = scoreFor(assessment.id);
      return score?.state === 'missing' || (options.includeIncomplete && score?.state === 'incomplete') || (options.includeUngraded && matchesWorkState(score, 'ungraded'));
    }).map(assessment => {
      const score = scoreFor(assessment.id);
      const ungraded = matchesWorkState(score, 'ungraded');
      return { id: assessment.id, name: assessment.savedTestName, category: assessmentTypeKey(assessment.testType), date: assessment.administeredAt,
        points: gradePoints(score, section), possible: scoreTotalPoints(score, assessment), percent: gradePercent(score, assessment, section),
        state: ungraded ? 'Ungraded' : score?.state === 'normal' ? 'Score' : reportCategory(score?.state ?? 'ungraded') };
    });
    // Batch missing-work reports omit students with no matching work.
    if (options.kind === 'missing' && rows.length === 0) continue;
    const categories = GRADEBOOK_CATEGORIES.filter(category => assessments.some(item => assessmentTypeKey(item.testType) === category)).map(category => {
      let earned = 0, possible = 0;
      for (const assessment of assessments.filter(item => assessmentTypeKey(item.testType) === category)) {
        const score = scoreFor(assessment.id), points = gradePoints(score, section), total = scoreTotalPoints(score, assessment);
        if (points !== null && total > 0) { earned += points; possible += total; }
      }
      return { category, earned, possible, percent: possible > 0 ? earned / possible * 100 : null, weight: section.categoryWeights[category] ?? 0 };
    });
    reports.push({ studentId: id, studentName: `${studentKnownBy(student)} ${student.lastName}`.trim(), sisId: student.sisId ?? '',
      sectionName: section.name, term: section.termLabel ?? '', inactive, kind: options.kind, generatedAt: options.generatedAt,
      finalPercent: finalGradePercent(section, assessments, scoreFor), categories, rows,
      notes: [...(notes.get(id) ?? [])].sort((a, b) => a.createdAt - b.createdAt).map(note => ({ text: note.text, createdAt: note.createdAt })),
      policy: `Missing grades ${section.missingGradePolicy === 'zero' ? 'count as zero' : 'are excluded from totals'}. Ungraded, Excused, Absent, and Incomplete are excluded.`,
      limitedAssessments: shown.length !== assessments.length || options.kind === 'missing',
    });
  }
  return reports;
}

const escapeHtml = (value: string | number): string => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
function reportBody(report: GradebookReport): string {
  const percent = (value: number | null) => value === null ? '—' : `${reportNumber(value)}%`;
  return `<article class="student-report" data-student-id="${escapeHtml(report.studentId)}">
    <header><p class="eyebrow">${report.kind === 'progress' ? 'Student progress report' : 'Missing-work report'}</p>
    <h1>${escapeHtml(report.studentName)}</h1><p>${escapeHtml(report.sectionName)}${report.term ? ` · ${escapeHtml(report.term)}` : ''}${report.sisId ? ` · ID: ${escapeHtml(report.sisId)}` : ''}${report.inactive ? ' · Inactive enrollment' : ''}</p>
    <p class="small">Generated ${escapeHtml(new Date(report.generatedAt).toLocaleString())}</p></header>
    <section class="grade"><span>Current course grade</span><strong>${percent(report.finalPercent)}</strong></section>
    <p class="small">Course and category totals include all assessments in this section.${report.limitedAssessments ? ' The assignment list below shows only the selected work.' : ''}</p>
    ${report.categories.length ? `<table class="categories"><caption>Category totals</caption><thead><tr><th scope="col">Category</th><th scope="col">Earned / possible</th><th scope="col">Grade</th><th scope="col">Configured weight</th></tr></thead><tbody>${report.categories.map(category => `<tr><th scope="row">${escapeHtml(reportCategory(category.category))}</th><td>${reportNumber(category.earned)} / ${reportNumber(category.possible)}</td><td>${percent(category.percent)}</td><td>${reportNumber(category.weight)}%</td></tr>`).join('')}</tbody></table>` : ''}
    <table class="assignments"><caption>${report.kind === 'progress' ? 'Assessment results' : 'Work to follow up'}</caption><thead><tr><th scope="col">Assessment / category</th><th scope="col">Date</th><th scope="col">Marks</th><th scope="col">Percent</th><th scope="col">State</th></tr></thead><tbody>${report.rows.length ? report.rows.map(row => `<tr><th scope="row">${escapeHtml(row.name)}<span class="small category">${escapeHtml(reportCategory(row.category))}</span></th><td>${escapeHtml(reportDate(row.date))}</td><td>${reportNumber(row.points)} / ${reportNumber(row.possible)}</td><td>${percent(row.percent)}</td><td>${escapeHtml(row.state)}</td></tr>`).join('') : '<tr><td colspan="5">No assessments in this selection.</td></tr>'}</tbody></table>
    ${report.notes.length ? `<section class="report-notes"><h2>Teacher comments</h2>${report.notes.map(note => `<div class="note"><p class="small">${escapeHtml(reportDate(note.createdAt))}</p><p class="note-text">${escapeHtml(note.text)}</p></div>`).join('')}</section>` : ''}
    <footer><p>${escapeHtml(report.policy)}</p><p>Category weights apply where graded work exists; remaining weights are scaled proportionally. Bonus marks may raise a grade above 100%.</p></footer>
  </article>`;
}

/** Standalone, escaped HTML: no scripts, remote assets, teacher-only notes or hidden roster data. */
export function gradebookReportsHtml(reports: GradebookReport[]): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Gradebook reports</title><style>
    *{box-sizing:border-box}body{margin:0;background:#fff;color:#17212b;font:14px/1.45 system-ui,-apple-system,sans-serif}
    .student-report{max-width:900px;margin:0 auto;padding:28px;overflow-wrap:anywhere;break-after:page}.student-report:last-child{break-after:auto}
    .eyebrow{text-transform:uppercase;letter-spacing:.08em;font-size:11px;color:#526171}h1{font-size:27px;margin:.2em 0}h2{font-size:16px}.small,footer{font-size:11px;color:#526171}
    header p{margin:.35em 0}.grade{display:flex;justify-content:space-between;align-items:center;border-block:2px solid #26394c;padding:12px 0;margin:20px 0 8px}.grade strong{font-size:24px}
    table{border-collapse:collapse;width:100%;margin:18px 0 24px;font-size:12px;table-layout:fixed}caption{text-align:left;font-weight:700;font-size:15px;margin-bottom:8px}th,td{text-align:left;vertical-align:top;padding:8px 5px;border-bottom:1px solid #d4dce4;overflow-wrap:anywhere}thead th{border-bottom:2px solid #26394c}thead{display:table-header-group}tr{break-inside:avoid}th:first-child{width:36%}tbody th{font-weight:500}.category{display:block;margin-top:3px}
    .note-text{white-space:pre-wrap}.note{break-inside:avoid}.note p{margin:.35em 0}footer{border-top:1px solid #d4dce4;margin-top:20px;padding-top:8px}footer p{margin:.3em 0}
    @page{margin:14mm}@media print{body{font-size:11pt}.student-report{padding:0;max-width:none}table{font-size:9pt}header,.grade{break-inside:avoid}caption{break-after:avoid}}
  </style></head><body>${reports.map(reportBody).join('')}</body></html>`;
}
