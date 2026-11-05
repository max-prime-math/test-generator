import { assessmentTypeKey, scoreTotalPoints, studentKnownBy, GRADEBOOK_CATEGORIES } from './gradebook-model.ts';
import { calculateStudentGrade, gradePercent, gradePoints } from './gradebook-calculations.ts';
import { describeDroppedScorePolicy } from './gradebook-policies.ts';
import { matchesWorkState } from './gradebook-filters.ts';
import { indicatorLabel } from './achievement-indicators.ts';
import { sectionLabel } from './curriculum-labels.ts';
import type { Class, GradebookAssessment, GradebookData, GradebookStudentNote, TestType } from './types.ts';

export interface GradebookReportOptions {
  sectionId: string;
  studentIds: string[];
  assessmentIds?: string[];
  kind: 'progress' | 'missing' | 'outcomes';
  includeIncomplete: boolean;
  includeUngraded: boolean;
  includeNotes: boolean;
  includeInactive: boolean;
  generatedAt: number;
  /** Outcomes at or above this percentage are strengths; lower outcomes are weaknesses. */
  strengthThreshold?: number;
  /** Current curriculum names used to describe the frozen outcome ids on assessment questions. */
  curriculum?: Class[];
}
export type GradebookOutcomeStanding = 'strength' | 'weakness';
export interface GradebookOutcomeEvidence {
  assessmentId: string;
  assessmentName: string;
  date: number;
  questionId: string;
  questionLabel: string;
  bodyPreview: string;
  earned: number;
  possible: number;
  percent: number;
}
export interface GradebookOutcomeResult {
  id: string;
  label: string;
  /** Parent-readable verb phrase, preferring the curriculum nickname. */
  commentLabel: string;
  context: string;
  nextStep?: string;
  earned: number;
  possible: number;
  percent: number;
  standing: GradebookOutcomeStanding;
  /** True when this is the student's strongest/weakest result, used to keep both groups informative. */
  relative: boolean;
  evidence: GradebookOutcomeEvidence[];
}
export interface GradebookReport {
  studentId: string;
  studentName: string;
  studentFirstName: string;
  sisId: string;
  sectionName: string;
  term: string;
  inactive: boolean;
  kind: GradebookReportOptions['kind'];
  generatedAt: number;
  finalPercent: number | null;
  categories: { category: TestType; earned: number; possible: number; percent: number | null; weight: number; droppedCount: number }[];
  rows: { id: string; name: string; category: TestType; date: number; points: number | null; possible: number; percent: number | null; state: string; dropped: boolean }[];
  notes: Pick<GradebookStudentNote, 'text' | 'createdAt'>[];
  outcomes: GradebookOutcomeResult[];
  outcomeCoverage: { scoredQuestions: number; taggedQuestions: number };
  strengthThreshold: number;
  policy: string;
  limitedAssessments: boolean;
}
export const reportNumber = (value: number | null): string => value === null ? '—' : String(Number(value.toFixed(1)));
export const reportCategory = (value: string): string => value[0].toUpperCase() + value.slice(1);
export const reportDate = (value: number): string => new Date(value).toLocaleDateString();

interface OutcomeRef { key: string; id: string; label: string; commentLabel: string; context: string; nextStep?: string }
interface OutcomeCatalog {
  indicators: Map<string, OutcomeRef>;
  /** Legacy snapshots may lack placement; only genuinely unique ids are safe fallbacks. */
  uniqueIndicators: Map<string, OutcomeRef | null>;
  sections: Map<string, OutcomeRef>;
}

function withoutOutcomeCode(id: string, wording: string): string {
  const trimmed = wording.trim();
  if (!trimmed.startsWith(id)) return trimmed;
  return trimmed.slice(id.length).replace(/^\s*(?:—|–|-|:)?\s*/, '') || trimmed;
}

function outcomeCatalog(classes: Class[]): OutcomeCatalog {
  const indicators = new Map<string, OutcomeRef>();
  const uniqueIndicators = new Map<string, OutcomeRef | null>();
  const sections = new Map<string, OutcomeRef>();
  for (const cls of classes) for (const unit of cls.units) for (const section of unit.sections) {
    const context = `${cls.name} · ${unit.name}`;
    const sectionKey = `${cls.id}\u0000${unit.id}\u0000${section.id}`;
    sections.set(sectionKey, { key: `section:${sectionKey}`, id: section.id, label: sectionLabel(section),
      commentLabel: section.nickname || withoutOutcomeCode(section.id, section.name), context, nextStep: section.nextStep });
    for (const indicator of section.indicators ?? []) {
      const placementKey = `${sectionKey}\u0000${indicator.id}`;
      const ref: OutcomeRef = {
        key: `indicator:${placementKey}`,
        id: indicator.id,
        label: indicatorLabel(indicator),
        commentLabel: indicator.nickname || indicator.text,
        context: `${context} · ${sectionLabel(section)}`,
        nextStep: indicator.nextStep,
      };
      indicators.set(placementKey, ref);
      uniqueIndicators.set(indicator.id, uniqueIndicators.has(indicator.id) ? null : ref);
    }
  }
  return { indicators, uniqueIndicators, sections };
}

function questionOutcomes(
  snapshot: GradebookAssessment['questionSnapshots'][number],
  catalog: ReturnType<typeof outcomeCatalog>,
): OutcomeRef[] {
  if (snapshot.indicators?.length) return snapshot.indicators.map((id) => {
    const placementKey = `${snapshot.classId ?? ''}\u0000${snapshot.unitId ?? ''}\u0000${snapshot.sectionId ?? ''}\u0000${id}`;
    return catalog.indicators.get(placementKey) ?? catalog.uniqueIndicators.get(id) ?? ({
    key: `indicator:${id}`, id, label: id, commentLabel: id, context: 'Curriculum indicator',
    });
  });
  if (!snapshot.sectionId) return [];
  const lookup = `${snapshot.classId ?? ''}\u0000${snapshot.unitId ?? ''}\u0000${snapshot.sectionId}`;
  return [catalog.sections.get(lookup) ?? {
    key: `section:${lookup}`, id: snapshot.sectionId, label: snapshot.sectionId,
    commentLabel: snapshot.sectionId, context: 'Curriculum outcome',
  }];
}

function outcomeStanding(percent: number, strengthThreshold: number): GradebookOutcomeStanding {
  return percent >= strengthThreshold ? 'strength' : 'weakness';
}

function ensureOutcomeContrast(outcomes: GradebookOutcomeResult[]): void {
  if (outcomes.length < 2) return;
  const allPerfect = outcomes.every(outcome => outcome.percent === 100);
  const allZero = outcomes.every(outcome => outcome.percent === 0);
  if (allPerfect || allZero) return;
  if (!outcomes.some(outcome => outcome.standing === 'strength')) {
    const strongest = outcomes.reduce((best, outcome) => outcome.percent > best.percent
      || (outcome.percent === best.percent && outcome.possible > best.possible)
      || (outcome.percent === best.percent && outcome.possible === best.possible && outcome.id.localeCompare(best.id) < 0)
      ? outcome : best);
    strongest.standing = 'strength';
    strongest.relative = true;
  }
  if (!outcomes.some(outcome => outcome.standing === 'weakness')) {
    const weakest = outcomes.reduce((best, outcome) => outcome.percent < best.percent
      || (outcome.percent === best.percent && outcome.possible > best.possible)
      || (outcome.percent === best.percent && outcome.possible === best.possible && outcome.id.localeCompare(best.id) < 0)
      ? outcome : best);
    weakest.standing = 'weakness';
    weakest.relative = true;
  }
}

function buildOutcomeResults(
  assessments: GradebookAssessment[],
  scoreFor: (assessmentId: string) => GradebookData['scores'][number] | undefined,
  curriculum: Class[],
  strengthThreshold: number,
): { outcomes: GradebookOutcomeResult[]; coverage: GradebookReport['outcomeCoverage'] } {
  const catalog = outcomeCatalog(curriculum);
  const collected = new Map<string, { ref: OutcomeRef; evidence: GradebookOutcomeEvidence[] }>();
  let scoredQuestions = 0;
  let taggedQuestions = 0;
  for (const assessment of assessments) {
    const score = scoreFor(assessment.id);
    // Alternative is a replacement total: its retained original question detail is not evidence.
    if (score?.state !== 'normal' || !score.questionScores?.length) continue;
    const snapshots = new Map(assessment.questionSnapshots.map((snapshot) => [snapshot.questionId, snapshot]));
    for (const questionScore of score.questionScores) {
      if (questionScore.points === null) continue;
      const snapshot = snapshots.get(questionScore.questionId);
      if (!snapshot || snapshot.points <= 0 || snapshot.isBonus) continue;
      scoredQuestions++;
      const refs = questionOutcomes(snapshot, catalog);
      if (!refs.length) continue;
      taggedQuestions++;
      for (const ref of refs) {
        const result = collected.get(ref.key) ?? { ref, evidence: [] };
        result.evidence.push({
          assessmentId: assessment.id,
          assessmentName: assessment.savedTestName,
          date: assessment.administeredAt,
          questionId: snapshot.questionId,
          questionLabel: snapshot.label,
          bodyPreview: snapshot.bodyPreview ?? `Question ${snapshot.label}`,
          earned: questionScore.points,
          possible: snapshot.points,
          percent: (questionScore.points / snapshot.points) * 100,
        });
        collected.set(ref.key, result);
      }
    }
  }
  const standingOrder: Record<GradebookOutcomeStanding, number> = { strength: 0, weakness: 1 };
  const outcomes = [...collected.values()].map(({ ref, evidence }) => {
    const earned = evidence.reduce((sum, item) => sum + item.earned, 0);
    const possible = evidence.reduce((sum, item) => sum + item.possible, 0);
    const percent = possible > 0 ? earned / possible * 100 : 0;
    return { id: ref.id, label: ref.label, commentLabel: ref.commentLabel, context: ref.context, nextStep: ref.nextStep, earned, possible, percent,
      standing: outcomeStanding(percent, strengthThreshold), relative: false, evidence };
  });
  ensureOutcomeContrast(outcomes);
  outcomes.sort((left, right) => standingOrder[left.standing] - standingOrder[right.standing]
    || left.percent - right.percent || left.id.localeCompare(right.id));
  return { outcomes, coverage: { scoredQuestions, taggedQuestions } };
}

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
  const strengthThreshold = Number.isFinite(options.strengthThreshold) && options.strengthThreshold! >= 0 && options.strengthThreshold! <= 100
    ? options.strengthThreshold!
    : 70;
  for (const id of new Set(options.studentIds)) {
    const student = students.get(id), enrollment = enrollments.get(id);
    if (!student || !enrollment) continue;
    const inactive = !student.active || !enrollment.active;
    if (inactive && !options.includeInactive) continue;
    const scoreFor = (assessmentId: string) => scores.get(`${id}:${assessmentId}`);
    const totals = calculateStudentGrade(section, assessments, scoreFor);
    const rows = shown.filter(assessment => {
      if (options.kind !== 'missing') return true;
      const score = scoreFor(assessment.id);
      return score?.state === 'missing' || (options.includeIncomplete && score?.state === 'incomplete') || (options.includeUngraded && matchesWorkState(score, 'ungraded'));
    }).map(assessment => {
      const score = scoreFor(assessment.id);
      const ungraded = matchesWorkState(score, 'ungraded');
      return { id: assessment.id, name: assessment.savedTestName, category: assessmentTypeKey(assessment.testType), date: assessment.administeredAt,
        points: gradePoints(score, section), possible: scoreTotalPoints(score, assessment), percent: gradePercent(score, assessment, section),
        state: ungraded ? 'Ungraded' : score?.state === 'normal' ? 'Score' : reportCategory(score?.state ?? 'ungraded'), dropped: totals.droppedAssessmentIds.has(assessment.id) };
    });
    // Batch missing-work reports omit students with no matching work.
    if (options.kind === 'missing' && rows.length === 0) continue;
    const outcomeResult = options.kind === 'outcomes'
      ? buildOutcomeResults(shown, scoreFor, options.curriculum ?? [], strengthThreshold)
      : { outcomes: [], coverage: { scoredQuestions: 0, taggedQuestions: 0 } };
    const categories = GRADEBOOK_CATEGORIES.filter(category => assessments.some(item => assessmentTypeKey(item.testType) === category)).map(category => {
      const total = totals.categories.find(item => item.category === category)!;
      return { category, earned: total.earned, possible: total.possible, percent: total.percent, weight: total.weight, droppedCount: total.droppedAssessmentIds.size };
    });
    reports.push({ studentId: id, studentName: `${studentKnownBy(student)} ${student.lastName}`.trim(), studentFirstName: studentKnownBy(student), sisId: student.sisId ?? '',
      sectionName: section.name, term: section.termLabel ?? '', inactive, kind: options.kind, generatedAt: options.generatedAt,
      finalPercent: totals.finalPercent, categories, rows,
      notes: [...(notes.get(id) ?? [])].sort((a, b) => a.createdAt - b.createdAt).map(note => ({ text: note.text, createdAt: note.createdAt })),
      outcomes: outcomeResult.outcomes,
      outcomeCoverage: outcomeResult.coverage,
      strengthThreshold,
      policy: `Missing grades ${section.missingGradePolicy === 'zero' ? 'count as zero' : 'are excluded from totals'}. Ungraded, Excused, Absent, and Incomplete are excluded. ${describeDroppedScorePolicy(section.droppedScorePolicy)}. Drop policies keep at least one counted score per category. Dropped marks remain on record and are excluded from category and course totals.`,
      limitedAssessments: shown.length !== assessments.length || options.kind === 'missing',
    });
  }
  return reports;
}

export interface GradebookReportComment {
  studentId: string;
  studentName: string;
  text: string;
  finalPercent: number | null;
  outcomeBalance: 'no-strengths' | 'no-weaknesses' | null;
}

function commentPhrase(value: string): string {
  const phrase = value.trim().replace(/[.!?]+$/, '');
  return /^[A-Z][a-z]/.test(phrase) ? phrase[0].toLocaleLowerCase() + phrase.slice(1) : phrase;
}

function possessive(name: string): string {
  return /s$/i.test(name) ? `${name}'` : `${name}'s`;
}

/** One concise, parent-readable comment using the strongest and weakest evidence in the report. */
export function gradebookReportComment(report: GradebookReport): GradebookReportComment | null {
  if (report.kind !== 'outcomes' || !report.outcomes.length) return null;
  const strongest = report.outcomes.filter(outcome => outcome.standing === 'strength')
    .sort((a, b) => b.percent - a.percent || b.possible - a.possible || a.id.localeCompare(b.id))[0];
  const weakest = report.outcomes.filter(outcome => outcome.standing === 'weakness')
    .sort((a, b) => a.percent - b.percent || b.possible - a.possible || a.id.localeCompare(b.id))[0];
  const name = report.studentFirstName || report.studentName;
  const sentences: string[] = [];
  if (strongest) sentences.push(`${name} can ${commentPhrase(strongest.commentLabel)}.`);
  if (weakest) {
    const challenge = commentPhrase(weakest.commentLabel);
    sentences.push(`${name} is challenged when asked to ${challenge}.`);
    const nextStep = commentPhrase(weakest.nextStep || `review and practice how to ${challenge}`);
    sentences.push(`${possessive(name)} next step is to ${nextStep}.`);
  }
  return {
    studentId: report.studentId,
    studentName: report.studentName,
    text: sentences.join(' '),
    finalPercent: report.finalPercent,
    outcomeBalance: strongest ? (weakest ? null : 'no-weaknesses') : 'no-strengths',
  };
}

export function gradebookReportComments(reports: GradebookReport[]): GradebookReportComment[] {
  return reports.filter(report => report.kind === 'outcomes').map(report => gradebookReportComment(report) ?? {
    studentId: report.studentId,
    studentName: report.studentName,
    text: '',
    finalPercent: report.finalPercent,
    outcomeBalance: null,
  });
}

const spreadsheetCell = (value: string): string => value.replace(/[\t\r\n]+/g, ' ').trim();

/** A tab-separated report-card table that pastes into spreadsheet columns. */
export function gradebookReportCommentsText(comments: GradebookReportComment[]): string {
  const rows = comments.map(comment => [
    spreadsheetCell(comment.studentName),
    spreadsheetCell(comment.text),
    comment.finalPercent === null ? '—' : `${reportNumber(comment.finalPercent)}%`,
  ].join('\t'));
  return [['Student', 'Comment', 'Final grade'].join('\t'), ...rows].join('\n');
}

const escapeHtml = (value: string | number): string => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
function reportBody(report: GradebookReport): string {
  const percent = (value: number | null) => value === null ? '—' : `${reportNumber(value)}%`;
  const standingLabel = (standing: GradebookOutcomeStanding) => standing === 'strength' ? 'Strength' : 'Weakness';
  const title = report.kind === 'progress' ? 'Student progress report' : report.kind === 'missing' ? 'Missing-work report' : 'Curricular outcomes report';
  const outcomeSummary = report.kind === 'outcomes' ? `<section class="outcome-summary" aria-label="Outcome summary">
      <div><strong>${report.outcomes.filter(outcome => outcome.standing === 'strength').length}</strong><span>Strengths</span></div>
      <div><strong>${report.outcomes.filter(outcome => outcome.standing === 'weakness').length}</strong><span>Weaknesses</span></div>
    </section>
    <p class="small">Based on ${report.outcomeCoverage.taggedQuestions} of ${report.outcomeCoverage.scoredQuestions} entered, eligible question marks in this selection. Strength: ${reportNumber(report.strengthThreshold)}% or higher · Weakness: below ${reportNumber(report.strengthThreshold)}%. When one category would otherwise be empty, the strongest or weakest non-extreme outcome is shown as a relative comparison.</p>` : '';
  const outcomeCard = (outcome: GradebookOutcomeResult) => `<article class="outcome ${outcome.standing}"><header><div><p class="outcome-code">${escapeHtml(outcome.id)}</p><h3>${escapeHtml(outcome.label)}</h3><p class="small">${escapeHtml(outcome.context)}</p></div><div class="outcome-score"><strong>${percent(outcome.percent)}</strong><span>${reportNumber(outcome.earned)} / ${reportNumber(outcome.possible)}</span><b>${standingLabel(outcome.standing)}</b>${outcome.relative ? `<em>${outcome.standing === 'strength' ? 'Strongest result' : 'Weakest result'}</em>` : ''}</div></header>
    <table class="evidence"><caption>Question evidence (${outcome.evidence.length})</caption><thead><tr><th scope="col">Assessment / question</th><th scope="col">Question preview</th><th scope="col">Marks</th><th scope="col">Result</th></tr></thead><tbody>${outcome.evidence.map(item => `<tr><th scope="row">${escapeHtml(item.assessmentName)} · Q${escapeHtml(item.questionLabel)}<span class="small category">${escapeHtml(reportDate(item.date))}</span></th><td>${escapeHtml(item.bodyPreview)}</td><td>${reportNumber(item.earned)} / ${reportNumber(item.possible)}</td><td>${percent(item.percent)}</td></tr>`).join('')}</tbody></table></article>`;
  const outcomeGroup = (standing: GradebookOutcomeStanding, heading: string) => {
    const outcomes = report.outcomes.filter(outcome => outcome.standing === standing);
    return `<section class="outcome-group ${standing}"><h3>${heading}</h3>${outcomes.length ? outcomes.map(outcomeCard).join('') : `<p class="small">No ${heading.toLocaleLowerCase()} in this selection.</p>`}</section>`;
  };
  const outcomeDetails = report.kind === 'outcomes' ? `<section class="outcomes"><h2>Outcome evidence</h2>${report.outcomes.length
    ? `${outcomeGroup('strength', 'Strengths')}${outcomeGroup('weakness', 'Weaknesses')}`
    : `<div class="no-evidence"><strong>No outcome evidence is available.</strong><p>${report.outcomeCoverage.scoredQuestions ? 'The entered question marks are not linked to curricular outcomes. Tag the source questions, then add a new administered assessment to freeze those tags.' : 'Enter scores by question on an assessment whose questions have curricular outcome tags.'}</p></div>`}</section>` : '';
  return `<article class="student-report" data-student-id="${escapeHtml(report.studentId)}">
    <header><p class="eyebrow">${title}</p>
    <h1>${escapeHtml(report.studentName)}</h1><p>${escapeHtml(report.sectionName)}${report.term ? ` · ${escapeHtml(report.term)}` : ''}${report.sisId ? ` · ID: ${escapeHtml(report.sisId)}` : ''}${report.inactive ? ' · Inactive enrollment' : ''}</p>
    <p class="small">Generated ${escapeHtml(new Date(report.generatedAt).toLocaleString())}</p></header>
    <section class="grade"><span>Current course grade</span><strong>${percent(report.finalPercent)}</strong></section>
    <p class="small">Course and category totals use this section’s full assessment list and grading policies.${report.limitedAssessments ? ` The ${report.kind === 'outcomes' ? 'outcome evidence' : 'assignment list'} below uses only the selected work.` : ''}</p>
    ${outcomeSummary}
    ${outcomeDetails}
    ${report.kind !== 'outcomes' && report.categories.length ? `<table class="categories"><caption>Category totals</caption><thead><tr><th scope="col">Category</th><th scope="col">Earned / possible</th><th scope="col">Grade</th><th scope="col">Configured weight</th></tr></thead><tbody>${report.categories.map(category => `<tr><th scope="row">${escapeHtml(reportCategory(category.category))}${category.droppedCount ? `<span class="small category">${category.droppedCount} dropped</span>` : ''}</th><td>${reportNumber(category.earned)} / ${reportNumber(category.possible)}</td><td>${percent(category.percent)}</td><td>${reportNumber(category.weight)}%</td></tr>`).join('')}</tbody></table>` : ''}
    ${report.kind !== 'outcomes' ? `<table class="assignments"><caption>${report.kind === 'progress' ? 'Assessment results' : 'Work to follow up'}</caption><thead><tr><th scope="col">Assessment / category</th><th scope="col">Date</th><th scope="col">Marks</th><th scope="col">Percent</th><th scope="col">State</th></tr></thead><tbody>${report.rows.length ? report.rows.map(row => `<tr><th scope="row">${escapeHtml(row.name)}<span class="small category">${escapeHtml(reportCategory(row.category))}</span></th><td>${escapeHtml(reportDate(row.date))}</td><td>${reportNumber(row.points)} / ${reportNumber(row.possible)}</td><td>${percent(row.percent)}</td><td>${escapeHtml(row.state)}${row.dropped ? '<span class="dropped">Dropped</span>' : ''}</td></tr>`).join('') : '<tr><td colspan="5">No assessments in this selection.</td></tr>'}</tbody></table>` : ''}
    ${report.notes.length ? `<section class="report-notes"><h2>Teacher comments</h2>${report.notes.map(note => `<div class="note"><p class="small">${escapeHtml(reportDate(note.createdAt))}</p><p class="note-text">${escapeHtml(note.text)}</p></div>`).join('')}</section>` : ''}
    <footer><p>${escapeHtml(report.policy)}</p><p>Category weights apply where graded work exists; remaining weights are scaled proportionally. Bonus marks may raise a grade above 100%.</p>${report.kind === 'outcomes' ? '<p>Outcome evidence includes entered scores from original questions only. A question tagged to multiple outcomes contributes its full marks to each outcome summary. These evidence summaries do not change the course grade.</p>' : ''}</footer>
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
    .outcome-summary{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin:18px 0 8px}.outcome-summary div{border:1px solid #b9c5d0;border-radius:6px;padding:10px;display:flex;justify-content:space-between;align-items:baseline}.outcome-summary strong{font-size:20px}.outcome-summary span{font-size:11px;color:#526171}
    .outcomes>h2{margin-top:24px}.outcome-group>h3{font-size:15px;margin:20px 0 8px;padding-bottom:5px;border-bottom:2px solid #526171}.outcome-group.strength>h3{border-color:#287451}.outcome-group.weakness>h3{border-color:#9e3b31}.outcome{border:1px solid #b9c5d0;border-left:5px solid #526171;border-radius:6px;margin:14px 0;break-inside:avoid}.outcome.weakness{border-left-color:#9e3b31}.outcome.strength{border-left-color:#287451}.outcome>header{display:flex;justify-content:space-between;gap:18px;padding:12px}.outcome h3{font-size:14px;margin:2px 0}.outcome-code{font-weight:700;font-size:11px;margin:0}.outcome-score{text-align:right;min-width:100px}.outcome-score strong,.outcome-score span,.outcome-score b,.outcome-score em{display:block}.outcome-score strong{font-size:20px}.outcome-score span{font-size:11px}.outcome-score b{font-size:10px;margin-top:3px;text-transform:uppercase;letter-spacing:.04em}.outcome-score em{font-size:9px;color:#526171;font-style:normal}.evidence{margin:0}.evidence caption{padding:0 12px;font-size:11px;color:#526171}.evidence th:first-child{width:26%}.evidence th,.evidence td{padding:7px 12px}.evidence td:nth-last-child(-n+2){width:13%}.no-evidence{border:1px dashed #9aa8b5;padding:18px;border-radius:6px}.no-evidence p{margin-bottom:0}
    .dropped{display:block;font-weight:700;font-size:10px;margin-top:3px}.note-text{white-space:pre-wrap}.note{break-inside:avoid}.note p{margin:.35em 0}footer{border-top:1px solid #d4dce4;margin-top:20px;padding-top:8px}footer p{margin:.3em 0}
    @page{margin:14mm}@media print{body{font-size:11pt}.student-report{padding:0;max-width:none}table{font-size:9pt}header,.grade,.outcome-summary{break-inside:avoid}caption{break-after:avoid}}
  </style></head><body>${reports.map(reportBody).join('')}</body></html>`;
}
