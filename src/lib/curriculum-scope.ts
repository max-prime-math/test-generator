import type { Class, Question } from './types.ts';

/** The canonical hierarchy reduced to placements a bank's questions actually reference. */
export function curriculumForQuestions(classes: Class[], questions: Pick<Question, 'classId' | 'unitId' | 'sectionId'>[]): Class[] {
  const sections = new Set(questions.filter(q => q.classId && q.unitId && q.sectionId)
    .map(q => JSON.stringify([q.classId, q.unitId, q.sectionId])));
  const units = new Set(questions.filter(q => q.classId && q.unitId).map(q => JSON.stringify([q.classId, q.unitId])));
  const courses = new Set(questions.flatMap(q => q.classId ? [q.classId] : []));
  return classes.filter(cls => courses.has(cls.id)).map(cls => ({
    ...cls,
    units: cls.units.filter(unit => units.has(JSON.stringify([cls.id, unit.id]))).map(unit => ({
      ...unit,
      sections: unit.sections.filter(section => sections.has(JSON.stringify([cls.id, unit.id, section.id]))),
    })),
  }));
}
