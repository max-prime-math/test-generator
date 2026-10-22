import { assessmentTypeKey } from './gradebook-model.ts';
import { finalGradePercent } from './gradebook-calculations.ts';
import { studentSearchScore } from './gradebook-student-search.ts';
import type { GradebookAssessment, GradebookData, GradebookFilterRules, GradebookScore, GradebookSection, GradebookStudent } from './types.ts';

export { DEFAULT_GRADEBOOK_FILTER, normalizeGradebookFilter } from './gradebook-filter-rules.ts';

export function filterAssessments(assessments: GradebookAssessment[], rules: GradebookFilterRules): GradebookAssessment[] {
  return rules.category === 'all' ? assessments : assessments.filter(assessment => assessmentTypeKey(assessment.testType) === rules.category);
}

export function matchesWorkState(score: GradebookScore | undefined, state: GradebookFilterRules['workState']): boolean {
  if (state === 'all') return true;
  if (state === 'ungraded') return !score || (score.state === 'normal' && score.points === null)
    || (score.state === 'alternative' && (score.points === null || !score.alternativeTotalPoints));
  return score?.state === state;
}

/** Build one score index for the whole roster; filtering never modifies marks or denominators. */
export function filterGradebookStudents(data: GradebookData, section: GradebookSection, students: GradebookStudent[], rules: GradebookFilterRules): GradebookStudent[] {
  const assessments = data.assessments.filter(assessment => assessment.sectionId === section.id);
  const shown = filterAssessments(assessments, rules);
  const scores = new Map(data.scores.filter(score => score.sectionId === section.id).map(score => [`${score.studentId}:${score.assessmentId}`, score]));
  return students.filter(student => {
    if (rules.studentQuery.trim() && studentSearchScore(student, rules.studentQuery) === null) return false;
    const scoreFor = (id: string) => scores.get(`${student.id}:${id}`);
    if (rules.workState !== 'all' && !shown.some(assessment => matchesWorkState(scoreFor(assessment.id), rules.workState))) return false;
    if (rules.belowPercent !== null) {
      const grade = finalGradePercent(section, assessments, scoreFor);
      if (grade === null || grade >= rules.belowPercent) return false;
    }
    return true;
  });
}
