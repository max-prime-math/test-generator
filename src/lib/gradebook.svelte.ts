import type {
  GradebookAssessment,
  GradebookData,
  GradebookEnrollment,
  GradebookScore,
  GradebookScoreState,
  GradebookSection,
  GradebookStudent,
  TestType,
  Question,
  SavedTest,
} from './types';
import {
  cloneGradebookData,
  createAssessmentSnapshot,
  DEFAULT_CATEGORY_WEIGHTS,
  formatStudentName,
  GRADEBOOK_STORAGE_KEY,
  normalizeCategoryWeights,
  normalizeGradebookData,
} from './gradebook-model';
import type { ParsedRosterStudent } from './gradebook-roster-import';
import { createId } from './id';

function loadGradebook(): GradebookData {
  try {
    return normalizeGradebookData(JSON.parse(localStorage.getItem(GRADEBOOK_STORAGE_KEY) ?? 'null'));
  } catch {
    return normalizeGradebookData(null);
  }
}

class GradebookStore {
  data = $state<GradebookData>(loadGradebook());

  get sections(): GradebookSection[] {
    return this.data.sections;
  }

  get students(): GradebookStudent[] {
    return this.data.students;
  }

  get enrollments(): GradebookEnrollment[] {
    return this.data.enrollments;
  }

  get assessments(): GradebookAssessment[] {
    return this.data.assessments;
  }

  get scores(): GradebookScore[] {
    return this.data.scores;
  }

  #save(): void {
    localStorage.setItem(GRADEBOOK_STORAGE_KEY, JSON.stringify(this.data));
  }

  createSection(input: { name: string; linkedClassId?: string | null; termLabel?: string | null }): GradebookSection {
    const now = Date.now();
    const section: GradebookSection = {
      id: createId('gradebook-section'),
      name: input.name.trim() || 'Untitled Section',
      linkedClassId: input.linkedClassId || null,
      termLabel: input.termLabel?.trim() || null,
      categoryWeights: { ...DEFAULT_CATEGORY_WEIGHTS },
      createdAt: now,
      updatedAt: now,
    };
    this.data = { ...this.data, sections: [...this.sections, section] };
    this.#save();
    return section;
  }

  updateSection(id: string, input: Partial<Pick<GradebookSection, 'name' | 'linkedClassId' | 'termLabel' | 'archivedAt' | 'categoryWeights'>>): void {
    const now = Date.now();
    const includesArchivedAt = Object.prototype.hasOwnProperty.call(input, 'archivedAt');
    this.data = {
      ...this.data,
      sections: this.sections.map((section) =>
        section.id === id
          ? {
              ...section,
              name: input.name !== undefined ? input.name.trim() || section.name : section.name,
              linkedClassId: input.linkedClassId !== undefined ? input.linkedClassId || null : section.linkedClassId,
              termLabel: input.termLabel !== undefined ? input.termLabel?.trim() || null : section.termLabel,
              categoryWeights: input.categoryWeights !== undefined ? normalizeCategoryWeights(input.categoryWeights) : section.categoryWeights,
              archivedAt: includesArchivedAt ? input.archivedAt : section.archivedAt,
              updatedAt: now,
            }
          : section,
      ),
    };
    this.#save();
  }

  archiveSection(id: string): void {
    const now = Date.now();
    this.data = {
      ...this.data,
      sections: this.sections.map((section) =>
        section.id === id
          ? { ...section, archivedAt: section.archivedAt ?? now, updatedAt: now }
          : section,
      ),
    };
    this.#save();
  }

  restoreSection(id: string): void {
    const now = Date.now();
    this.data = {
      ...this.data,
      sections: this.sections.map((section) =>
        section.id === id
          ? { ...section, archivedAt: undefined, updatedAt: now }
          : section,
      ),
    };
    this.#save();
  }

  addStudent(input: {
    sisId?: string;
    firstName: string;
    lastName: string;
    displayName?: string;
    email?: string;
    sectionId?: string;
  }): GradebookStudent {
    const now = Date.now();
    const firstName = input.firstName.trim();
    const lastName = input.lastName.trim();
    const student: GradebookStudent = {
      id: createId('gradebook-student'),
      sisId: input.sisId?.trim() || undefined,
      firstName,
      lastName,
      displayName: input.displayName?.trim() || formatStudentName(firstName, lastName),
      email: input.email?.trim() || undefined,
      active: true,
      createdAt: now,
      updatedAt: now,
    };
    const enrollments = input.sectionId
      ? [...this.enrollments, createEnrollment(input.sectionId, student.id, now)]
      : this.enrollments;
    this.data = {
      ...this.data,
      students: [...this.students, student],
      enrollments,
    };
    this.#save();
    return student;
  }

  updateStudent(id: string, input: Partial<Pick<GradebookStudent, 'sisId' | 'firstName' | 'lastName' | 'displayName' | 'email' | 'active'>>): void {
    const now = Date.now();
    this.data = {
      ...this.data,
      students: this.students.map((student) => {
        if (student.id !== id) return student;
        const firstName = input.firstName !== undefined ? input.firstName.trim() : student.firstName;
        const lastName = input.lastName !== undefined ? input.lastName.trim() : student.lastName;
        return {
          ...student,
          sisId: input.sisId !== undefined ? input.sisId.trim() || undefined : student.sisId,
          firstName,
          lastName,
          displayName: input.displayName !== undefined
            ? input.displayName.trim() || formatStudentName(firstName, lastName)
            : student.displayName,
          email: input.email !== undefined ? input.email.trim() || undefined : student.email,
          active: input.active !== undefined ? input.active : student.active,
          updatedAt: now,
        };
      }),
    };
    this.#save();
  }

  importRoster(sectionId: string, importedStudents: ParsedRosterStudent[]): {
    created: number;
    updated: number;
    enrolled: number;
    reactivated: number;
    skipped: number;
  } {
    const now = Date.now();
    let created = 0;
    let updated = 0;
    let enrolled = 0;
    let reactivated = 0;
    let skipped = 0;
    const students = [...this.students];
    const enrollments = [...this.enrollments];

    for (const imported of importedStudents) {
      const firstName = imported.firstName.trim();
      const lastName = imported.lastName.trim();
      const displayName = imported.displayName.trim() || formatStudentName(firstName, lastName);
      if (!displayName) {
        skipped += 1;
        continue;
      }

      const existingIndex = findMatchingStudentIndex(students, imported);
      let studentId: string;
      if (existingIndex >= 0) {
        const existing = students[existingIndex];
        studentId = existing.id;
        students[existingIndex] = {
          ...existing,
          sisId: imported.sisId?.trim() || existing.sisId,
          firstName: firstName || existing.firstName,
          lastName: lastName || existing.lastName,
          displayName,
          email: imported.email?.trim() || existing.email,
          active: true,
          updatedAt: now,
        };
        updated += 1;
      } else {
        studentId = createId('gradebook-student');
        students.push({
          id: studentId,
          sisId: imported.sisId?.trim() || undefined,
          firstName,
          lastName,
          displayName,
          email: imported.email?.trim() || undefined,
          active: true,
          createdAt: now,
          updatedAt: now,
        });
        created += 1;
      }

      const enrollmentIndex = enrollments.findIndex((enrollment) => enrollment.sectionId === sectionId && enrollment.studentId === studentId);
      if (enrollmentIndex >= 0) {
        if (enrollments[enrollmentIndex].active === false) reactivated += 1;
        enrollments[enrollmentIndex] = {
          ...enrollments[enrollmentIndex],
          active: true,
          endedAt: undefined,
          updatedAt: now,
        };
      } else {
        enrollments.push(createEnrollment(sectionId, studentId, now));
        enrolled += 1;
      }
    }

    this.data = { ...this.data, students, enrollments };
    this.#save();
    return { created, updated, enrolled, reactivated, skipped };
  }

  deleteStudent(id: string): void {
    this.data = {
      ...this.data,
      students: this.students.filter((student) => student.id !== id),
      enrollments: this.enrollments.filter((enrollment) => enrollment.studentId !== id),
      scores: this.scores.filter((score) => score.studentId !== id),
    };
    this.#save();
  }

  enrollStudent(sectionId: string, studentId: string): void {
    const existing = this.enrollments.find((enrollment) => enrollment.sectionId === sectionId && enrollment.studentId === studentId);
    const now = Date.now();
    if (existing) {
      this.data = {
        ...this.data,
        enrollments: this.enrollments.map((enrollment) =>
          enrollment.id === existing.id
            ? { ...enrollment, active: true, endedAt: undefined, updatedAt: now }
            : enrollment,
        ),
      };
    } else {
      this.data = {
        ...this.data,
        enrollments: [...this.enrollments, createEnrollment(sectionId, studentId, now)],
      };
    }
    this.#save();
  }

  setEnrollmentActive(sectionId: string, studentId: string, active: boolean): void {
    const now = Date.now();
    this.data = {
      ...this.data,
      enrollments: this.enrollments.map((enrollment) =>
        enrollment.sectionId === sectionId && enrollment.studentId === studentId
          ? { ...enrollment, active, endedAt: active ? undefined : now, updatedAt: now }
          : enrollment,
      ),
    };
    this.#save();
  }

  createAssessmentFromSavedTest(
    savedTest: SavedTest,
    questions: Question[],
    sectionId: string,
    options: { administeredAt?: number } = {},
  ): GradebookAssessment {
    const assessment = createAssessmentSnapshot(savedTest, questions, sectionId, {
      ...options,
      students: this.studentsForSection(sectionId, { includeInactive: true }),
    });
    this.data = {
      ...this.data,
      assessments: [...this.assessments, assessment],
    };
    this.#save();
    return assessment;
  }

  updateAssessmentsForSavedTest(
    savedTestId: string,
    input: Partial<Pick<GradebookAssessment, 'testType'>>,
  ): number {
    let updatedCount = 0;
    const now = Date.now();
    const assessments = this.assessments.map((assessment) => {
      if (assessment.savedTestId !== savedTestId) return assessment;
      updatedCount += 1;
      return {
        ...assessment,
        testType: input.testType !== undefined ? input.testType : assessment.testType,
        updatedAt: now,
      };
    });
    if (updatedCount === 0) return 0;
    this.data = { ...this.data, assessments };
    this.#save();
    return updatedCount;
  }

  updateScore(input: {
    sectionId: string;
    assessmentId: string;
    studentId: string;
    points: number | null;
    state: GradebookScoreState;
    comment?: string;
  }): GradebookScore {
    const now = Date.now();
    const existing = this.scores.find((score) =>
      score.assessmentId === input.assessmentId && score.studentId === input.studentId
    );
    const points = input.state === 'normal' ? input.points : null;
    const nextScore: GradebookScore = existing
      ? {
          ...existing,
          sectionId: input.sectionId,
          state: input.state,
          points,
          comment: input.comment?.trim() || undefined,
          gradedAt: input.state === 'normal' && points !== null ? now : existing.gradedAt,
          updatedAt: now,
        }
      : {
          id: createId('gradebook-score'),
          sectionId: input.sectionId,
          assessmentId: input.assessmentId,
          studentId: input.studentId,
          state: input.state,
          points,
          comment: input.comment?.trim() || undefined,
          gradedAt: input.state === 'normal' && points !== null ? now : undefined,
          createdAt: now,
          updatedAt: now,
        };

    this.data = {
      ...this.data,
      scores: existing
        ? this.scores.map((score) => (score.id === existing.id ? nextScore : score))
        : [...this.scores, nextScore],
    };
    this.#save();
    return nextScore;
  }

  updateQuestionScore(input: {
    sectionId: string;
    assessmentId: string;
    studentId: string;
    questionId: string;
    points: number | null;
  }): GradebookScore {
    const now = Date.now();
    const existing = this.scoreFor(input.assessmentId, input.studentId);
    const questionScores = existing?.questionScores ? [...existing.questionScores] : [];
    const scoreIndex = questionScores.findIndex((entry) => entry.questionId === input.questionId);
    const nextQuestionScore = { questionId: input.questionId, points: input.points };
    if (scoreIndex === -1) questionScores.push(nextQuestionScore);
    else questionScores[scoreIndex] = nextQuestionScore;
    const total = sumQuestionScores(questionScores);
    const nextScore: GradebookScore = existing
      ? {
          ...existing,
          sectionId: input.sectionId,
          state: 'normal',
          points: total,
          questionScores,
          gradedAt: total === null ? existing.gradedAt : now,
          updatedAt: now,
        }
      : {
          id: createId('gradebook-score'),
          sectionId: input.sectionId,
          assessmentId: input.assessmentId,
          studentId: input.studentId,
          state: 'normal',
          points: total,
          questionScores,
          gradedAt: total === null ? undefined : now,
          createdAt: now,
          updatedAt: now,
        };

    this.data = {
      ...this.data,
      scores: existing
        ? this.scores.map((score) => (score.id === existing.id ? nextScore : score))
        : [...this.scores, nextScore],
    };
    this.#save();
    return nextScore;
  }

  updateSectionCategoryWeight(sectionId: string, category: TestType, weight: number): void {
    const section = this.sections.find((candidate) => candidate.id === sectionId);
    if (!section) return;
    this.updateSection(sectionId, {
      categoryWeights: {
        ...section.categoryWeights,
        [category]: Math.max(0, Number.isFinite(weight) ? weight : 0),
      },
    });
  }

  studentsForSection(sectionId: string, options: { includeInactive?: boolean } = {}): GradebookStudent[] {
    const studentIds = new Set(
      this.enrollments
        .filter((enrollment) => enrollment.sectionId === sectionId && (options.includeInactive || enrollment.active))
        .map((enrollment) => enrollment.studentId),
    );
    return this.students
      .filter((student) => studentIds.has(student.id) && (options.includeInactive || student.active))
      .sort((left, right) => left.lastName.localeCompare(right.lastName) || left.firstName.localeCompare(right.firstName));
  }

  assessmentsForSection(sectionId: string): GradebookAssessment[] {
    return this.assessments
      .filter((assessment) => assessment.sectionId === sectionId)
      .sort((left, right) => right.administeredAt - left.administeredAt || right.createdAt - left.createdAt);
  }

  scoreFor(assessmentId: string, studentId: string): GradebookScore | undefined {
    return this.scores.find((score) => score.assessmentId === assessmentId && score.studentId === studentId);
  }

  exportJson(): string {
    return JSON.stringify(this.data, null, 2);
  }

  replaceFromJson(json: string): void {
    this.data = normalizeGradebookData(JSON.parse(json));
    this.#save();
  }

  snapshot(): GradebookData {
    return cloneGradebookData(this.data);
  }
}

function createEnrollment(sectionId: string, studentId: string, now: number): GradebookEnrollment {
  return {
    id: createId('gradebook-enrollment'),
    sectionId,
    studentId,
    active: true,
    startedAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

function findMatchingStudentIndex(students: GradebookStudent[], imported: ParsedRosterStudent): number {
  const sisId = imported.sisId?.trim();
  if (sisId) {
    const index = students.findIndex((student) => student.sisId === sisId);
    if (index >= 0) return index;
  }

  const email = imported.email?.trim().toLowerCase();
  if (email) {
    const index = students.findIndex((student) => student.email?.toLowerCase() === email);
    if (index >= 0) return index;
  }

  const firstName = imported.firstName.trim().toLowerCase();
  const lastName = imported.lastName.trim().toLowerCase();
  if (firstName || lastName) {
    return students.findIndex((student) =>
      student.firstName.trim().toLowerCase() === firstName
      && student.lastName.trim().toLowerCase() === lastName
    );
  }

  return -1;
}

function sumQuestionScores(questionScores: NonNullable<GradebookScore['questionScores']>): number | null {
  const entered = questionScores.filter((score) => score.points !== null);
  if (entered.length === 0) return null;
  return entered.reduce((sum, score) => sum + (score.points ?? 0), 0);
}

export const gradebook = new GradebookStore();
