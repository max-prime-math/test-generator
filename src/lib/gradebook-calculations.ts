import type { GradebookAssessment, GradebookData, GradebookScore, GradebookSection } from './types.ts';
import { assessmentTypeKey, GRADEBOOK_CATEGORIES } from './gradebook-model.ts';

export function gradePoints(score: GradebookScore | undefined, section: GradebookSection | null): number | null {
  if (score?.state === 'missing' && section?.missingGradePolicy === 'zero') return 0;
  return score?.state === 'normal' ? score.points : null;
}

export function gradePercent(score: GradebookScore | undefined, assessment: GradebookAssessment, section: GradebookSection | null): number | null {
  const points = gradePoints(score, section);
  return points !== null && assessment.totalPoints > 0 ? points / assessment.totalPoints * 100 : null;
}

export function finalGradePercent(section: GradebookSection, assessments: GradebookAssessment[], scoreFor: (assessmentId: string) => GradebookScore | undefined): number | null {
  let earned = 0, possible = 0, weighted = 0, weights = 0;
  for (const category of GRADEBOOK_CATEGORIES) {
    let categoryEarned = 0, categoryPossible = 0;
    for (const assessment of assessments.filter(item => assessmentTypeKey(item.testType) === category)) {
      const points = gradePoints(scoreFor(assessment.id), section);
      if (points === null || assessment.totalPoints <= 0) continue;
      categoryEarned += points;
      categoryPossible += assessment.totalPoints;
    }
    earned += categoryEarned;
    possible += categoryPossible;
    const weight = section.categoryWeights[category] ?? 0;
    if (categoryPossible > 0 && weight > 0) {
      weighted += categoryEarned / categoryPossible * 100 * weight;
      weights += weight;
    }
  }
  return weights > 0 ? weighted / weights : possible > 0 ? earned / possible * 100 : null;
}

export function sectionFinalPercent(data: GradebookData, section: GradebookSection, studentId: string): number | null {
  const scores = new Map(data.scores.filter(score => score.studentId === studentId).map(score => [score.assessmentId, score]));
  return finalGradePercent(section, data.assessments.filter(assessment => assessment.sectionId === section.id), id => scores.get(id));
}
