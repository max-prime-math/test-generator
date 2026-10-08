import type {
  GradebookAssessment,
  GradebookData,
  GradebookEnrollment,
  GradebookGradingMode,
  GradebookScore,
  GradebookScoreState,
  GradebookSection,
  GradebookStudent,
  TestType,
  Question,
  SavedTest,
} from './types';
import {
  mergeLegacyGradebooks,
  cleanKnownBy,
  cloneGradebookData,
  createExternalAssessment,
  editGradebookAssessment,
  setAssessmentQuestionPoints,
  type GradebookAssessmentEdit,
  compareStudents,
  createAssessmentSnapshot,
  DEFAULT_CATEGORY_WEIGHTS,
  formatStudentName,
  hasMixedCase,
  GRADEBOOK_STORAGE_KEY,
  normalizeCategoryWeights,
  normalizeGradebookData,
  type StudentSortKey,
} from './gradebook-model';
import type { ParsedRosterStudent } from './gradebook-roster-import';
import { findMatchingStudentIndex, previewRosterImport } from './gradebook-roster-preview';
import { createId } from './id';
import { bankWorkspaces } from './bank-workspaces.svelte';
import { WORKSPACE_MODE_KEY } from './workspace-format';
import { appSettings } from './app-settings.svelte';

function loadGradebook(): GradebookData {
  try {
    return normalizeGradebookData(JSON.parse(localStorage.getItem(GRADEBOOK_STORAGE_KEY) ?? 'null'));
  } catch {
    return normalizeGradebookData(null);
  }
}

/** Score entry saves after a short pause so typing never waits on a full localStorage write. */
const SAVE_DELAY_MS = 400;

function scoreKey(assessmentId: string, studentId: string): string {
  return `${assessmentId}\u0000${studentId}`;
}

type ScoreEdit = { before: GradebookScore | null; after: GradebookScore; key: string };
const cloneScore = (score: GradebookScore): GradebookScore => JSON.parse(JSON.stringify(score));
const scoreContent = (score: GradebookScore | null) => JSON.stringify(score && [score.state, score.points, score.alternativeTotalPoints, score.questionScores, score.comment]);

class GradebookStore {
  data = $state<GradebookData>(loadGradebook());
  #undo: ScoreEdit[][] = [];
  #redo: ScoreEdit[][] = [];
  #batch: ScoreEdit[] | null = null;
  #coalesceKey: string | null = null;
  historyRevision = $state(0);
  get canUndo(): boolean { this.historyRevision; return this.#undo.length > 0; }
  get canRedo(): boolean { this.historyRevision; return this.#redo.length > 0; }

  endScoreEdit(): void { this.#coalesceKey = null; }
  beginScoreBatch(): void { this.endScoreEdit(); this.#batch = []; }
  finishScoreBatch(): void {
    if (this.#batch?.length) this.#undo.push(this.#batch);
    if (this.#undo.length > 100) this.#undo.shift();
    this.#batch = null;
    this.#redo = [];
    this.endScoreEdit();
    this.historyRevision++;
  }

  #clearHistory(): void {
    this.#undo = []; this.#redo = []; this.#batch = null;
    this.endScoreEdit(); this.historyRevision++;
  }

  #recordScore(before: GradebookScore | null, after: GradebookScore, editKey: string): void {
    if (scoreContent(before) === scoreContent(after)) return;
    const edit = { before, after: cloneScore(after), key: scoreKey(after.assessmentId, after.studentId) };
    if (this.#batch) {
      const previous = this.#batch.find(item => item.key === edit.key);
      if (previous) previous.after = edit.after; else this.#batch.push(edit);
    } else {
      const previous = this.#undo.at(-1);
      if (this.#coalesceKey === editKey && previous?.length === 1 && previous[0].key === edit.key) previous[0].after = edit.after;
      else this.#undo.push([edit]);
      this.#coalesceKey = editKey;
      if (this.#undo.length > 100) this.#undo.shift();
    }
    this.#redo = []; this.historyRevision++;
  }

  #restoreScoreEdits(edits: ScoreEdit[], forward: boolean): void {
    const keys = new Set(edits.map(edit => edit.key));
    this.data.scores = this.scores.filter(score => !keys.has(scoreKey(score.assessmentId, score.studentId)));
    for (const edit of edits) {
      const score = forward ? edit.after : edit.before;
      if (score) this.data.scores.push(cloneScore(score));
    }
    this.endScoreEdit(); this.historyRevision++;
    this.#scheduleSave();
  }
  undoScoreEdit(): void {
    const edits = this.#undo.pop();
    if (!edits) return;
    this.#restoreScoreEdits(edits, false); this.#redo.push(edits);
  }
  redoScoreEdit(): void {
    const edits = this.#redo.pop();
    if (!edits) return;
    this.#restoreScoreEdits(edits, true); this.#undo.push(edits);
  }

  #saveTimer: ReturnType<typeof setTimeout> | null = null;
  // Rebuilt only when scores are added or removed; point edits happen in place.
  #scoreIndex = $derived(new Map(this.data.scores.map((score) => [scoreKey(score.assessmentId, score.studentId), score])));

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', () => this.flush());
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') this.flush();
      });
    }
  }

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

  #save(preserveHistory = false): void {
    if (!preserveHistory) this.#clearHistory();
    this.#cancelScheduledSave();
    localStorage.setItem(GRADEBOOK_STORAGE_KEY, JSON.stringify(this.data));
  }

  #scheduleSave(): void {
    this.#cancelScheduledSave();
    this.#saveTimer = setTimeout(() => this.#save(true), SAVE_DELAY_MS);
  }

  #cancelScheduledSave(): void {
    if (this.#saveTimer === null) return;
    clearTimeout(this.#saveTimer);
    this.#saveTimer = null;
  }

  /** Writes any pending score edits now. */
  flush(): void {
    if (this.#saveTimer !== null) this.#save(true);
  }

  /** Replaces live data from storage, dropping any pending write of the old data. */
  reload(): void {
    this.#cancelScheduledSave();
    this.#clearHistory();
    this.data = loadGradebook();
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

  /** Move an active section to another active section's position; array order is persisted in backups too. */
  moveSection(id: string, targetId: string): void {
    const sections = [...this.sections];
    const from = sections.findIndex(section => section.id === id && !section.archivedAt && !section.trashedAt);
    const to = sections.findIndex(section => section.id === targetId && !section.archivedAt && !section.trashedAt);
    if (from < 0 || to < 0 || from === to) return;
    const [section] = sections.splice(from, 1);
    sections.splice(to, 0, section);
    this.data = { ...this.data, sections };
    this.#save();
  }

  updateSection(id: string, input: Partial<Pick<GradebookSection, 'name' | 'linkedClassId' | 'termLabel' | 'archivedAt' | 'categoryWeights' | 'missingGradePolicy'>>): void {
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
              missingGradePolicy: input.missingGradePolicy ?? section.missingGradePolicy ?? 'exclude',
              categoryWeights: input.categoryWeights !== undefined ? normalizeCategoryWeights(input.categoryWeights) : section.categoryWeights,
              archivedAt: includesArchivedAt ? input.archivedAt : section.archivedAt,
              updatedAt: now,
            }
          : section,
      ),
    };
    this.#save();
  }

  /** Archive, trash or restore a section. A section is in at most one of the archive and the Trash. */
  #setSectionState(id: string, state: 'active' | 'archived' | 'trashed'): void {
    const now = Date.now();
    this.data = {
      ...this.data,
      sections: this.sections.map((section) =>
        section.id === id
          ? {
              ...section,
              archivedAt: state === 'archived' ? section.archivedAt ?? now : undefined,
              trashedAt: state === 'trashed' ? section.trashedAt ?? now : undefined,
              updatedAt: now,
            }
          : section,
      ),
    };
    this.#save();
  }

  archiveSection(id: string): void { this.#setSectionState(id, 'archived'); }
  trashSection(id: string): void { this.#setSectionState(id, 'trashed'); }
  restoreSection(id: string): void { this.#setSectionState(id, 'active'); }

  /**
   * Delete a section for good: its roster entries, assessments and their scores. Students
   * enrolled in no other section go too; students in other sections keep those records.
   */
  deleteSectionForever(id: string): void {
    const assessmentIds = new Set(this.assessments.filter((assessment) => assessment.sectionId === id).map((assessment) => assessment.id));
    const enrollments = this.enrollments.filter((enrollment) => enrollment.sectionId !== id);
    const enrolled = new Set(enrollments.map((enrollment) => enrollment.studentId));
    const leaving = new Set(this.enrollments.filter((enrollment) => enrollment.sectionId === id && !enrolled.has(enrollment.studentId)).map((enrollment) => enrollment.studentId));
    this.data = {
      ...this.data,
      sections: this.sections.filter((section) => section.id !== id),
      students: this.students.filter((student) => !leaving.has(student.id)),
      enrollments,
      assessments: this.assessments.filter((assessment) => !assessmentIds.has(assessment.id)),
      scores: this.scores.filter((score) => score.sectionId !== id && !assessmentIds.has(score.assessmentId) && !leaving.has(score.studentId)),
    };
    this.#save();
  }

  addStudent(input: {
    sisId?: string;
    firstName: string;
    lastName: string;
    knownBy?: string;
    email?: string;
    sectionId?: string;
  }): GradebookStudent {
    const now = Date.now();
    const firstName = input.firstName.trim();
    const lastName = input.lastName.trim();
    const knownBy = cleanKnownBy(input.knownBy, firstName);
    const student: GradebookStudent = {
      id: createId('gradebook-student'),
      sisId: input.sisId?.trim() || undefined,
      firstName,
      lastName,
      knownBy,
      displayName: formatStudentName(knownBy ?? firstName, lastName),
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

  /** Names are saved exactly as typed so hand-fixed casing like "McKenna" sticks. */
  updateStudent(id: string, input: Partial<Pick<GradebookStudent, 'sisId' | 'firstName' | 'lastName' | 'knownBy' | 'email' | 'active'>>): void {
    const now = Date.now();
    this.data = {
      ...this.data,
      students: this.students.map((student) => {
        if (student.id !== id) return student;
        const firstName = input.firstName !== undefined ? input.firstName.trim() : student.firstName;
        const lastName = input.lastName !== undefined ? input.lastName.trim() : student.lastName;
        const knownBy = cleanKnownBy(input.knownBy !== undefined ? input.knownBy : student.knownBy, firstName);
        return {
          ...student,
          sisId: input.sisId !== undefined ? input.sisId.trim() || undefined : student.sisId,
          firstName,
          lastName,
          knownBy,
          displayName: formatStudentName(knownBy ?? firstName, lastName),
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

    const preview = previewRosterImport(this.students, importedStudents);
    skipped += preview.filter(row => row.action === 'Conflict').length;
    for (const { student: imported } of preview.filter(row => row.action !== 'Conflict')) {
      const importedFirst = imported.firstName.trim();
      const importedLast = imported.lastName.trim();
      if (!importedFirst && !importedLast && !imported.displayName.trim()) {
        skipped += 1;
        continue;
      }

      const existingIndex = findMatchingStudentIndex(students, imported);
      let studentId: string;
      if (existingIndex >= 0) {
        const existing = students[existingIndex];
        studentId = existing.id;
        const importedKnownBy = existing.knownBy && importedFirst.toLocaleLowerCase() === existing.knownBy.toLocaleLowerCase();
        const firstName = importedKnownBy ? existing.firstName : keepEditedCasing(importedFirst, existing.firstName);
        const lastName = keepEditedCasing(importedLast, existing.lastName);
        const knownBy = cleanKnownBy(keepEditedCasing(imported.knownBy?.trim() ?? '', existing.knownBy ?? ''), firstName);
        students[existingIndex] = {
          ...existing,
          sisId: imported.sisId?.trim() || existing.sisId,
          firstName,
          lastName,
          knownBy,
          displayName: formatStudentName(knownBy ?? firstName, lastName),
          email: imported.email?.trim() || existing.email,
          active: true,
          updatedAt: now,
        };
        updated += 1;
      } else {
        studentId = createId('gradebook-student');
        const knownBy = cleanKnownBy(imported.knownBy, importedFirst);
        students.push({
          id: studentId,
          sisId: imported.sisId?.trim() || undefined,
          firstName: importedFirst,
          lastName: importedLast,
          knownBy,
          displayName: formatStudentName(knownBy ?? importedFirst, importedLast),
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

  /** Remove only this section's enrollment and scores, keeping the student in other sections. */
  removeStudentFromSection(sectionId: string, studentId: string): void {
    this.data = {
      ...this.data,
      enrollments: this.enrollments.filter(entry => entry.sectionId !== sectionId || entry.studentId !== studentId),
      scores: this.scores.filter(score => score.sectionId !== sectionId || score.studentId !== studentId),
    };
    this.#save();
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
    options: { administeredAt?: number; gradingMode?: GradebookGradingMode } = {},
  ): GradebookAssessment {
    const assessment = createAssessmentSnapshot(savedTest, savedTest.questionSnapshots ?? questions, sectionId, {
      ...options,
      gradingMode: options.gradingMode ?? appSettings.gradebookGradingMode,
    });
    this.data = {
      ...this.data,
      assessments: [...this.assessments, assessment],
    };
    this.#save();
    return assessment;
  }

  addExternalAssessment(input: Omit<Parameters<typeof createExternalAssessment>[0], 'gradingMode'>): GradebookAssessment {
    const assessment = createExternalAssessment({ ...input, gradingMode: appSettings.gradebookGradingMode });
    this.data = { ...this.data, assessments: [...this.assessments, assessment] };
    this.#save();
    return assessment;
  }

  updateAssessment(assessmentId: string, edit: GradebookAssessmentEdit): void {
    this.data = editGradebookAssessment(this.data, assessmentId, edit);
    this.#save();
  }

  /** Change what one question is out of; see setAssessmentQuestionPoints. */
  setQuestionPoints(assessmentId: string, questionId: string, points: number, options: { capScores?: boolean } = {}): void {
    this.data = setAssessmentQuestionPoints(this.data, assessmentId, questionId, points, options);
    this.#save();
  }

  /** Removes the assessment and every score recorded for it. */
  deleteAssessment(assessmentId: string): void {
    this.data = {
      ...this.data,
      assessments: this.assessments.filter((assessment) => assessment.id !== assessmentId),
      scores: this.scores.filter((score) => score.assessmentId !== assessmentId),
    };
    this.#save();
  }

  /** Switching modes keeps every recorded score; totals already reflect question scores. */
  setAssessmentGradingMode(assessmentId: string, gradingMode: GradebookGradingMode): void {
    const now = Date.now();
    this.data = {
      ...this.data,
      assessments: this.assessments.map((assessment) =>
        assessment.id === assessmentId ? { ...assessment, gradingMode, updatedAt: now } : assessment,
      ),
    };
    this.#save();
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
    alternativeTotalPoints?: number | null;
    comment?: string;
  }): GradebookScore {
    const now = Date.now();
    const points = input.state === 'normal' || input.state === 'alternative' ? input.points : null;
    const existing = this.scoreFor(input.assessmentId, input.studentId);
    // A typed total that no longer matches the question scores replaces them.
    const questionTotal = existing?.questionScores ? sumQuestionScores(existing.questionScores) : null;
    const keepsQuestionScores = input.state !== 'normal' || points === questionTotal;
    const changes = {
      sectionId: input.sectionId,
      state: input.state,
      alternativeTotalPoints: input.state === 'alternative'
        ? (input.alternativeTotalPoints === undefined ? existing?.alternativeTotalPoints : input.alternativeTotalPoints)
        : undefined,
      points,
      questionScores: keepsQuestionScores ? existing?.questionScores : undefined,
      comment: input.comment?.trim() || undefined,
      gradedAt: (input.state === 'normal' || input.state === 'alternative') && points !== null ? now : existing?.gradedAt,
      updatedAt: now,
    };
    return this.#writeScore(input.assessmentId, input.studentId, existing, changes, now);
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
    else if (questionScores[scoreIndex].points === input.points && existing?.state === 'normal') return existing;
    else questionScores[scoreIndex] = nextQuestionScore;
    const total = sumQuestionScores(questionScores);
    const changes = {
      sectionId: input.sectionId,
      state: 'normal' as const,
      alternativeTotalPoints: undefined,
      points: total,
      questionScores,
      gradedAt: total === null ? existing?.gradedAt : now,
      updatedAt: now,
    };
    return this.#writeScore(input.assessmentId, input.studentId, existing, changes, now, `${scoreKey(input.assessmentId, input.studentId)}:${input.questionId}`);
  }

  /**
   * Edits an existing score in place so only the cells showing it re-render;
   * a new score is appended. Either way the write to storage is deferred.
   */
  #writeScore(
    assessmentId: string,
    studentId: string,
    existing: GradebookScore | undefined,
    changes: Partial<GradebookScore>,
    now: number,
    editKey = scoreKey(assessmentId, studentId),
  ): GradebookScore {
    if (existing && scoreContent(existing) === scoreContent({ ...existing, ...changes })) return existing;
    const before = existing ? cloneScore(existing) : null;
    if (existing) {
      Object.assign(existing, changes);
      this.#recordScore(before, existing, editKey);
      this.#scheduleSave();
      return existing;
    }
    const score: GradebookScore = {
      id: createId('gradebook-score'),
      sectionId: changes.sectionId ?? '',
      assessmentId,
      studentId,
      state: changes.state ?? 'normal',
      points: changes.points ?? null,
      createdAt: now,
      updatedAt: now,
      ...changes,
    };
    this.data.scores.push(score);
    this.#recordScore(before, score, editKey);
    this.#scheduleSave();
    return this.scoreFor(assessmentId, studentId) ?? score;
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

  studentsForSection(sectionId: string, options: { includeInactive?: boolean; sortBy?: StudentSortKey } = {}): GradebookStudent[] {
    const studentIds = new Set(
      this.enrollments
        .filter((enrollment) => enrollment.sectionId === sectionId && (options.includeInactive || enrollment.active))
        .map((enrollment) => enrollment.studentId),
    );
    return this.students
      .filter((student) => studentIds.has(student.id) && (options.includeInactive || student.active))
      .sort((left, right) => compareStudents(left, right, options.sortBy ?? 'last'));
  }

  assessmentsForSection(sectionId: string): GradebookAssessment[] {
    return this.assessments
      .filter((assessment) => assessment.sectionId === sectionId)
      .sort((left, right) => left.administeredAt - right.administeredAt || left.createdAt - right.createdAt);
  }

  scoreFor(assessmentId: string, studentId: string): GradebookScore | undefined {
    return this.#scoreIndex.get(scoreKey(assessmentId, studentId));
  }

  exportJson(): string {
    return JSON.stringify(this.data, null, 2);
  }

  replaceFromJson(json: string): void {
    this.#cancelScheduledSave();
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

/** Keeps a hand-edited mixed-case name ("McKenna") when a re-import only differs by case. */
function keepEditedCasing(imported: string, existing: string): string {
  if (!imported) return existing;
  if (hasMixedCase(existing) && imported.toLowerCase() === existing.toLowerCase()) return existing;
  return imported;
}

function sumQuestionScores(questionScores: NonNullable<GradebookScore['questionScores']>): number | null {
  const entered = questionScores.filter((score) => score.points !== null);
  if (entered.length === 0) return null;
  return entered.reduce((sum, score) => sum + (score.points ?? 0), 0);
}

export const gradebook = new GradebookStore();
// One-time migration preserves every bank's legacy copy for recovery.
const MIGRATION_KEY = 'tg-gradebook-independent-v1';
const migration = (async () => {
  if (localStorage.getItem(MIGRATION_KEY)) return;
  // A connected workspace already owns its gradebook; old bank copies are recovery
  // material and must not be imported into a different workspace.
  if (localStorage.getItem(WORKSPACE_MODE_KEY)) {
    localStorage.setItem(MIGRATION_KEY, 'true');
    return;
  }
  gradebook.flush();
  await bankWorkspaces.preserveLegacyValue(GRADEBOOK_STORAGE_KEY, gradebook.exportJson());
  const legacy = (await bankWorkspaces.readOtherBankValues(GRADEBOOK_STORAGE_KEY))
    .map(text => normalizeGradebookData(JSON.parse(text)));
  gradebook.flush();
  gradebook.replaceFromJson(JSON.stringify(mergeLegacyGradebooks(gradebook.snapshot(), legacy)));
  localStorage.setItem(MIGRATION_KEY, 'true');
})();
migration.catch(error => console.error('Gradebook migration failed; legacy copies are retained', error));
// Bank switching must wait for migration, but never replaces the shared gradebook.
bankWorkspaces.participate({
  beforeLeave: async () => { await migration; gradebook.flush(); },
  apply: () => gradebook.reload(),
});
