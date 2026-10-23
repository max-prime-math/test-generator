import type { GradebookAssessment, GradebookData, GradebookScore, GradebookSection, TestType } from './types.ts';
import { assessmentTypeKey, GRADEBOOK_CATEGORIES, scoreCountsInTotal, scoreTotalPoints } from './gradebook-model.ts';
import { normalizeDroppedScorePolicy } from './gradebook-policies.ts';

export function gradePoints(score: GradebookScore | undefined, section: GradebookSection | null): number | null {
  if (score?.state === 'missing' && section?.missingGradePolicy === 'zero') return 0;
  return scoreCountsInTotal(score) ? score!.points : null;
}

export function gradePercent(score: GradebookScore | undefined, assessment: GradebookAssessment, section: GradebookSection | null): number | null {
  const points = gradePoints(score, section);
  const total = scoreTotalPoints(score, assessment);
  return points !== null && total > 0 ? points / total * 100 : null;
}

export interface GradebookCategoryGrade {
  category: TestType;
  earned: number;
  possible: number;
  count: number;
  eligibleCount: number;
  percent: number | null;
  weight: number;
  droppedAssessmentIds: Set<string>;
}
export interface GradebookStudentGrade {
  finalPercent: number | null;
  categories: GradebookCategoryGrade[];
  droppedAssessmentIds: Set<string>;
}

/** Dropping is a derived inclusion decision; recorded points, states and question scores remain intact. */
export function calculateStudentGrade(section: GradebookSection, assessments: GradebookAssessment[], scoreFor: (assessmentId: string) => GradebookScore | undefined): GradebookStudentGrade {
  let earned = 0, possible = 0, weighted = 0, weights = 0;
  const policy = normalizeDroppedScorePolicy(section.droppedScorePolicy);
  const droppedAssessmentIds = new Set<string>();
  const categories: GradebookCategoryGrade[] = [];
  for (const category of GRADEBOOK_CATEGORIES) {
    let categoryEarned = 0, categoryPossible = 0;
    const eligible = assessments.filter(item => assessmentTypeKey(item.testType) === category).flatMap(assessment => {
      const score = scoreFor(assessment.id);
      const points = gradePoints(score, section);
      const total = scoreTotalPoints(score, assessment);
      return points !== null && Number.isFinite(points) && Number.isFinite(total) && total > 0 ? [{ assessment, points, total }] : [];
    });
    const dropCount = Math.min(policy[category] ?? 0, Math.max(0, eligible.length - 1));
    // Stable chronological tie-breaks keep the same exclusions across sort orders and computers.
    const dropped = new Set(dropCount ? eligible.slice().sort((a, b) => a.points / a.total - b.points / b.total
      || a.assessment.administeredAt - b.assessment.administeredAt || a.assessment.createdAt - b.assessment.createdAt
      || (a.assessment.id < b.assessment.id ? -1 : a.assessment.id > b.assessment.id ? 1 : 0)).slice(0, dropCount).map(item => item.assessment.id) : []);
    for (const id of dropped) droppedAssessmentIds.add(id);
    for (const item of eligible) {
      if (dropped.has(item.assessment.id)) continue;
      categoryEarned += item.points;
      categoryPossible += item.total;
    }
    earned += categoryEarned;
    possible += categoryPossible;
    const weight = section.categoryWeights[category] ?? 0;
    categories.push({ category, earned: categoryEarned, possible: categoryPossible, count: eligible.length - dropped.size,
      eligibleCount: eligible.length, percent: categoryPossible > 0 ? categoryEarned / categoryPossible * 100 : null, weight, droppedAssessmentIds: dropped });
    if (categoryPossible > 0 && weight > 0) {
      weighted += categoryEarned / categoryPossible * 100 * weight;
      weights += weight;
    }
  }
  return { finalPercent: weights > 0 ? weighted / weights : possible > 0 ? earned / possible * 100 : null, categories, droppedAssessmentIds };
}

export function finalGradePercent(section: GradebookSection, assessments: GradebookAssessment[], scoreFor: (assessmentId: string) => GradebookScore | undefined): number | null {
  return calculateStudentGrade(section, assessments, scoreFor).finalPercent;
}

export function sectionFinalPercent(data: GradebookData, section: GradebookSection, studentId: string): number | null {
  const scores = new Map(data.scores.filter(score => score.studentId === studentId).map(score => [score.assessmentId, score]));
  return finalGradePercent(section, data.assessments.filter(assessment => assessment.sectionId === section.id), id => scores.get(id));
}
