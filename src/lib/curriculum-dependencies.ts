import type { Class, Question } from './types.ts';

export interface BankCurriculumReference {
  unitId?: string;
  sectionId?: string;
  indicatorIds?: string[];
}

export interface BankCurriculumDependency {
  catalogId: string;
  version: string;
  courseId: string;
  references: BankCurriculumReference[];
}

export interface BankCurriculumDependenciesFile {
  schemaVersion: 1;
  /** Definitions resolve from the workspace catalog; portable exports also carry a legacy snapshot. */
  catalog: 'workspace';
  courses: BankCurriculumDependency[];
}

/** Derive a bank's shared-curriculum dependencies exclusively from its question references. */
export function bankCurriculumDependencies(questions: Question[], classes: Class[] = []): BankCurriculumDependenciesFile {
  const courses = new Map<string, Map<string, BankCurriculumReference>>();
  const sources = new Map(classes.map(cls => [cls.id, cls.curriculumSource]));
  for (const question of questions) {
    if (!question.classId) continue;
    const references = courses.get(question.classId) ?? new Map<string, BankCurriculumReference>();
    const reference: BankCurriculumReference = {
      ...(question.unitId ? { unitId: question.unitId } : {}),
      ...(question.sectionId ? { sectionId: question.sectionId } : {}),
      ...(question.indicators?.length ? { indicatorIds: [...new Set(question.indicators)].sort() } : {}),
    };
    const key = JSON.stringify([reference.unitId ?? null, reference.sectionId ?? null, reference.indicatorIds ?? []]);
    references.set(key, reference);
    courses.set(question.classId, references);
  }
  return {
    schemaVersion: 1,
    catalog: 'workspace',
    courses: [...courses].sort(([left], [right]) => left.localeCompare(right)).map(([courseId, references]) => ({
      catalogId: sources.get(courseId)?.catalogId ?? 'testgen-local',
      version: sources.get(courseId)?.version ?? 'unversioned',
      courseId,
      references: [...references.values()].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
    })),
  };
}

export function parseBankCurriculumDependencies(text: string): BankCurriculumDependenciesFile {
  const parsed = JSON.parse(text) as Partial<BankCurriculumDependenciesFile>;
  if (parsed.schemaVersion !== 1 || parsed.catalog !== 'workspace' || !Array.isArray(parsed.courses)) {
    throw new Error('Unsupported bank curriculum dependencies file.');
  }
  for (const course of parsed.courses) {
    if (!course || typeof course.catalogId !== 'string' || !course.catalogId || typeof course.version !== 'string' || !course.version
      || typeof course.courseId !== 'string' || !course.courseId || !Array.isArray(course.references)) {
      throw new Error('Malformed bank curriculum dependency.');
    }
    for (const reference of course.references) {
      if (!reference || typeof reference !== 'object'
        || (reference.unitId !== undefined && typeof reference.unitId !== 'string')
        || (reference.sectionId !== undefined && typeof reference.sectionId !== 'string')
        || (reference.indicatorIds !== undefined && (!Array.isArray(reference.indicatorIds) || !reference.indicatorIds.every(id => typeof id === 'string')))) {
        throw new Error(`Malformed curriculum reference for ${course.courseId}.`);
      }
    }
  }
  return parsed as BankCurriculumDependenciesFile;
}
