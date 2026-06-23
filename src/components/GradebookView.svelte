<script lang="ts">
  import { bank } from '../lib/bank.svelte';
  import { gradebook } from '../lib/gradebook.svelte';
  import { gradebookScoresCsv, parseGradebookBackup, stringifyGradebookBackup } from '../lib/gradebook-backup';
  import { assessmentScorePercent, assessmentTypeKey, GRADEBOOK_CATEGORIES } from '../lib/gradebook-model';
  import { parseRosterImport } from '../lib/gradebook-roster-import';
  import { testLibrary } from '../lib/test-library.svelte';
  import { CLASSES, DEMO_CLASSES } from '../lib/curriculum';
  import { customClasses } from '../lib/custom-classes.svelte';
  import { appState } from '../lib/app-state.svelte';
  import type { GradebookAssessment, GradebookScoreState, GradebookSection, GradebookStudent, TestType } from '../lib/types';

  const SCORE_OPTIONS: Array<{ value: GradebookScoreState; label: string }> = [
    { value: 'normal', label: 'Score' },
    { value: 'missing', label: 'Missing' },
    { value: 'excused', label: 'Excused' },
    { value: 'absent', label: 'Absent' },
    { value: 'incomplete', label: 'Incomplete' },
  ];
  const GRADEBOOK_LAYOUT_KEY = 'tg-gradebook-layout-v1';
  const LEFT_RAIL_MIN = 220;
  const LEFT_RAIL_MAX = 440;
  const RIGHT_RAIL_MIN = 260;
  const RIGHT_RAIL_MAX = 560;

  type GradebookLayoutPrefs = {
    leftRailWidth: number;
    rightRailWidth: number;
    leftRailVisible: boolean;
    rightRailVisible: boolean;
  };

  function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  function loadLayoutPrefs(): GradebookLayoutPrefs {
    try {
      const parsed = JSON.parse(localStorage.getItem(GRADEBOOK_LAYOUT_KEY) ?? 'null') as Partial<GradebookLayoutPrefs> | null;
      return {
        leftRailWidth: clamp(Number(parsed?.leftRailWidth) || 260, LEFT_RAIL_MIN, LEFT_RAIL_MAX),
        rightRailWidth: clamp(Number(parsed?.rightRailWidth) || 340, RIGHT_RAIL_MIN, RIGHT_RAIL_MAX),
        leftRailVisible: parsed?.leftRailVisible !== false,
        rightRailVisible: parsed?.rightRailVisible !== false,
      };
    } catch {
      return {
        leftRailWidth: 260,
        rightRailWidth: 340,
        leftRailVisible: true,
        rightRailVisible: true,
      };
    }
  }

  const initialLayout = loadLayoutPrefs();

  let allClasses = $derived(appState.demoMode ? [...CLASSES, ...DEMO_CLASSES, ...customClasses.classes] : [...CLASSES, ...customClasses.classes]);
  let selectedSectionId = $state('');
  let selectedAssessmentId = $state('');
  let selectedStudentId = $state('');

  let sectionName = $state('');
  let sectionClassId = $state('');
  let termLabel = $state('');

  let firstName = $state('');
  let lastName = $state('');
  let displayName = $state('');
  let email = $state('');

  let savedTestId = $state('');
  let administeredDate = $state(formatDateInput(Date.now()));
  let gradebookMode = $state<'overview' | 'grading' | 'student'>('overview');
  let expandedStudentAssessmentId = $state('');
  let studentPickerOpen = $state(false);
  let rosterImportInputEl: HTMLInputElement | undefined = $state();
  let gradebookRestoreInputEl: HTMLInputElement | undefined = $state();
  let rosterImportSummary = $state('');
  let rosterImportWarnings = $state<string[]>([]);
  let backupStatus = $state('');
  let leftRailWidth = $state(initialLayout.leftRailWidth);
  let rightRailWidth = $state(initialLayout.rightRailWidth);
  let leftRailVisible = $state(initialLayout.leftRailVisible);
  let rightRailVisible = $state(initialLayout.rightRailVisible);
  let suppressNextRailClick = false;

  let activeSections = $derived(gradebook.sections.filter((section) => !section.archivedAt));
  let archivedSections = $derived(gradebook.sections.filter((section) => section.archivedAt));
  let selectedSection = $derived(activeSections.find((section) => section.id === selectedSectionId) ?? null);
  let sectionStudents = $derived(selectedSectionId ? gradebook.studentsForSection(selectedSectionId, { includeInactive: true }) : []);
  let sectionAssessments = $derived(selectedSectionId ? gradebook.assessmentsForSection(selectedSectionId) : []);
  let selectedAssessment = $derived(sectionAssessments.find((assessment) => assessment.id === selectedAssessmentId) ?? sectionAssessments[0] ?? null);
  let selectedStudent = $derived(sectionStudents.find((student) => student.id === selectedStudentId) ?? sectionStudents[0] ?? null);
  let selectedEnrollment = $derived(
    selectedStudent
      ? gradebook.enrollments.find((entry) => entry.sectionId === selectedSectionId && entry.studentId === selectedStudent.id) ?? null
      : null,
  );

  $effect(() => {
    if (!selectedSectionId || !activeSections.some((section) => section.id === selectedSectionId)) {
      selectedSectionId = activeSections[0]?.id ?? '';
    }
  });

  $effect(() => {
    if (!selectedAssessmentId || !sectionAssessments.some((assessment) => assessment.id === selectedAssessmentId)) {
      selectedAssessmentId = sectionAssessments[0]?.id ?? '';
    }
  });

  $effect(() => {
    if (!savedTestId || !testLibrary.tests.some((test) => test.id === savedTestId)) {
      savedTestId = testLibrary.tests[0]?.id ?? '';
    }
  });

  $effect(() => {
    if (!selectedStudentId || !sectionStudents.some((student) => student.id === selectedStudentId)) {
      selectedStudentId = sectionStudents[0]?.id ?? '';
    }
  });

  $effect(() => {
    if (gradebookMode !== 'student') studentPickerOpen = false;
  });

  $effect(() => {
    try {
      localStorage.setItem(GRADEBOOK_LAYOUT_KEY, JSON.stringify({
        leftRailWidth,
        rightRailWidth,
        leftRailVisible,
        rightRailVisible,
      }));
    } catch {
      // ignore storage failures
    }
  });

  function handleLeftRailResize(event: PointerEvent) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = leftRailWidth;
    let dragged = false;

    function onMove(moveEvent: PointerEvent) {
      const delta = moveEvent.clientX - startX;
      if (!dragged && Math.abs(delta) > 4) {
        dragged = true;
        suppressNextRailClick = true;
      }
      if (!dragged) return;
      leftRailVisible = true;
      leftRailWidth = clamp(startWidth + delta, LEFT_RAIL_MIN, LEFT_RAIL_MAX);
      if (leftRailWidth === LEFT_RAIL_MIN && delta < -54) leftRailVisible = false;
    }

    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (dragged) window.setTimeout(() => { suppressNextRailClick = false; }, 250);
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function handleRightRailResize(event: PointerEvent) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = rightRailWidth;
    let dragged = false;

    function onMove(moveEvent: PointerEvent) {
      const delta = startX - moveEvent.clientX;
      if (!dragged && Math.abs(delta) > 4) {
        dragged = true;
        suppressNextRailClick = true;
      }
      if (!dragged) return;
      rightRailVisible = true;
      rightRailWidth = clamp(startWidth + delta, RIGHT_RAIL_MIN, RIGHT_RAIL_MAX);
      if (rightRailWidth === RIGHT_RAIL_MIN && delta < -54) rightRailVisible = false;
    }

    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (dragged) window.setTimeout(() => { suppressNextRailClick = false; }, 250);
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function toggleLeftRailHandle() {
    if (suppressNextRailClick) {
      suppressNextRailClick = false;
      return;
    }
    leftRailVisible = !leftRailVisible;
  }

  function toggleRightRailHandle() {
    if (suppressNextRailClick) {
      suppressNextRailClick = false;
      return;
    }
    rightRailVisible = !rightRailVisible;
  }

  function handleRailToggleKeydown(event: KeyboardEvent, side: 'left' | 'right') {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    if (side === 'left') toggleLeftRailHandle();
    else toggleRightRailHandle();
  }

  function createSection() {
    const section = gradebook.createSection({
      name: sectionName,
      linkedClassId: sectionClassId || null,
      termLabel,
    });
    selectedSectionId = section.id;
    sectionName = '';
    sectionClassId = '';
    termLabel = '';
  }

  function moveSectionToTrash(section: GradebookSection) {
    const studentCount = gradebook.studentsForSection(section.id, { includeInactive: true }).length;
    const assessmentCount = gradebook.assessmentsForSection(section.id).length;
    const details = [
      `${studentCount} roster ${studentCount === 1 ? 'entry' : 'entries'}`,
      `${assessmentCount} ${assessmentCount === 1 ? 'assessment' : 'assessments'}`,
    ].join(' and ');
    const confirmed = window.confirm(
      `Move "${section.name}" to trash?\n\nIt will be hidden from the active gradebook, but ${details} and existing scores will stay recoverable.`,
    );
    if (!confirmed) return;
    const archivedId = section.id;
    gradebook.archiveSection(archivedId);
    if (selectedSectionId === archivedId) {
      const nextSection = activeSections.find((candidate) => candidate.id !== archivedId);
      selectedSectionId = nextSection?.id ?? '';
      selectedAssessmentId = '';
      selectedStudentId = '';
      gradebookMode = 'overview';
    }
  }

  function restoreSectionFromTrash(section: GradebookSection) {
    gradebook.restoreSection(section.id);
    selectedSectionId = section.id;
  }

  function backupGradebook() {
    const filename = `gradebook-backup-${formatFileDate(Date.now())}.json`;
    downloadTextFile(filename, stringifyGradebookBackup(gradebook.snapshot()), 'application/json');
    backupStatus = `Downloaded ${filename}.`;
  }

  function exportGradebookScoresCsv() {
    const filename = `gradebook-scores-${formatFileDate(Date.now())}.csv`;
    downloadTextFile(filename, gradebookScoresCsv(gradebook.snapshot()), 'text/csv;charset=utf-8');
    backupStatus = `Downloaded ${filename}.`;
  }

  function openGradebookRestore() {
    gradebookRestoreInputEl?.click();
  }

  async function handleGradebookRestoreFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const restored = parseGradebookBackup(await file.text());
      const warning = [
        `Restore gradebook backup from "${file.name}"?`,
        '',
        'This replaces the current local Gradebook sections, rosters, assessments, and scores in this browser.',
        'Question banks and saved tests are not changed.',
      ].join('\n');
      if (!window.confirm(warning)) return;
      gradebook.replaceFromJson(JSON.stringify(restored));
      selectedSectionId = gradebook.sections.find((section) => !section.archivedAt)?.id ?? '';
      selectedAssessmentId = '';
      selectedStudentId = '';
      expandedStudentAssessmentId = '';
      gradebookMode = 'overview';
      backupStatus = `Restored ${restored.sections.length} sections, ${restored.students.length} students, ${restored.assessments.length} assessments, and ${restored.scores.length} scores.`;
    } catch (error) {
      backupStatus = `Restore failed: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      input.value = '';
    }
  }

  function addStudent() {
    if (!selectedSectionId) return;
    gradebook.addStudent({
      firstName,
      lastName,
      displayName,
      email,
      sectionId: selectedSectionId,
    });
    firstName = '';
    lastName = '';
    displayName = '';
    email = '';
  }

  function openRosterImport() {
    if (!selectedSectionId) {
      window.alert('Create or select a Gradebook section before importing a roster.');
      return;
    }
    rosterImportInputEl?.click();
  }

  async function handleRosterImportFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !selectedSectionId) return;

    try {
      const parsed = parseRosterImport(await file.text());
      if (parsed.students.length === 0) {
        rosterImportSummary = 'No students were imported.';
        rosterImportWarnings = parsed.warnings;
        return;
      }
      const result = gradebook.importRoster(selectedSectionId, parsed.students);
      rosterImportSummary = [
        `${result.created} created`,
        `${result.updated} updated`,
        `${result.enrolled} enrolled`,
        result.reactivated > 0 ? `${result.reactivated} reactivated` : '',
        parsed.skippedRows + result.skipped > 0 ? `${parsed.skippedRows + result.skipped} skipped` : '',
      ].filter(Boolean).join(' · ');
      const sections = [...new Set(parsed.students.map((student) => student.sourceSection).filter(Boolean))];
      rosterImportWarnings = [
        ...parsed.warnings,
        ...(sections.length > 1 ? [`The file included ${sections.length} source sections; all imported students were enrolled in the selected section.`] : []),
      ];
    } catch (error) {
      rosterImportSummary = 'Roster import failed.';
      rosterImportWarnings = [error instanceof Error ? error.message : String(error)];
    } finally {
      input.value = '';
    }
  }

  function addAssessment() {
    if (!selectedSectionId || !savedTestId) return;
    const savedTest = testLibrary.get(savedTestId);
    if (!savedTest) return;
    const assessment = gradebook.createAssessmentFromSavedTest(savedTest, bank.questions, selectedSectionId, {
      administeredAt: parseDateInput(administeredDate),
    });
    selectedAssessmentId = assessment.id;
    gradebookMode = 'grading';
  }

  function updateScore(studentId: string, assessment: GradebookAssessment, pointsValue: string, state: GradebookScoreState) {
    const parsed = pointsValue.trim() === '' ? null : Number(pointsValue);
    gradebook.updateScore({
      sectionId: assessment.sectionId,
      assessmentId: assessment.id,
      studentId,
      points: Number.isFinite(parsed) ? parsed : null,
      state,
    });
  }

  function scoreDisplay(studentId: string, assessment: GradebookAssessment): string {
    const score = gradebook.scoreFor(assessment.id, studentId);
    if (!score) return '';
    if (score.state !== 'normal') return stateLabel(score.state);
    return score.points === null ? '' : `${score.points}`;
  }

  function scoreInputValue(studentId: string, assessment: GradebookAssessment): string {
    const score = gradebook.scoreFor(assessment.id, studentId);
    return score?.state === 'normal' && score.points !== null ? String(score.points) : '';
  }

  function scoreState(studentId: string, assessment: GradebookAssessment): GradebookScoreState {
    return gradebook.scoreFor(assessment.id, studentId)?.state ?? 'normal';
  }

  function percentDisplay(studentId: string, assessment: GradebookAssessment): string {
    const percent = assessmentScorePercent(gradebook.scoreFor(assessment.id, studentId), assessment);
    return percent === null ? '' : `${Math.round(percent)}%`;
  }

  function studentTotal(student: GradebookStudent): string {
    const final = studentFinalGrade(student);
    return final.primary;
  }

  function studentFinalGrade(student: GradebookStudent): { primary: string; detail: string } {
    const weighted = weightedStudentPercent(student);
    if (weighted !== null) {
      return {
        primary: `${roundGrade(weighted)}%`,
        detail: 'weighted final',
      };
    }

    let earned = 0;
    let possible = 0;
    for (const assessment of sectionAssessments) {
      const score = gradebook.scoreFor(assessment.id, student.id);
      if (!score || score.state !== 'normal' || score.points === null) continue;
      earned += score.points;
      possible += assessment.totalPoints;
    }
    if (possible <= 0) return { primary: '-', detail: 'no graded scores' };
    return {
      primary: `${roundGrade((earned / possible) * 100)}%`,
      detail: `${formatPoints(earned)}/${formatPoints(possible)} raw`,
    };
  }

  function weightedStudentPercent(student: GradebookStudent): number | null {
    if (!selectedSection) return null;
    let weightedSum = 0;
    let usedWeight = 0;
    for (const category of GRADEBOOK_CATEGORIES) {
      const assessments = sectionAssessments.filter((assessment) => assessmentTypeKey(assessment.testType) === category);
      const percents = assessments
        .map((assessment) => assessmentScorePercent(gradebook.scoreFor(assessment.id, student.id), assessment))
        .filter((percent): percent is number => percent !== null);
      if (percents.length === 0) continue;
      const weight = selectedSection.categoryWeights[category] ?? 0;
      if (weight <= 0) continue;
      weightedSum += (percents.reduce((sum, percent) => sum + percent, 0) / percents.length) * weight;
      usedWeight += weight;
    }
    return usedWeight > 0 ? weightedSum / usedWeight : null;
  }

  function categoryLabel(category: string): string {
    if (category === 'mcq') return 'Multiple Choice';
    return category.charAt(0).toUpperCase() + category.slice(1);
  }

  function updateCategoryWeight(category: typeof GRADEBOOK_CATEGORIES[number], value: string) {
    if (!selectedSection) return;
    const weight = Number(value);
    gradebook.updateSectionCategoryWeight(selectedSection.id, category, Number.isFinite(weight) ? weight : 0);
  }

  function studentCategorySummary(student: GradebookStudent, category: TestType) {
    const assessments = sectionAssessments.filter((assessment) => assessmentTypeKey(assessment.testType) === category);
    let earned = 0;
    let possible = 0;
    let count = 0;
    for (const assessment of assessments) {
      const score = gradebook.scoreFor(assessment.id, student.id);
      if (!score || score.state !== 'normal' || score.points === null) continue;
      earned += score.points;
      possible += assessment.totalPoints;
      count += 1;
    }
    return {
      category,
      assessments,
      earned,
      possible,
      count,
      weight: selectedSection?.categoryWeights[category] ?? 0,
      percent: possible > 0 ? (earned / possible) * 100 : null,
    };
  }

  function categoryTotalLabel(student: GradebookStudent, category: TestType): string {
    const summary = studentCategorySummary(student, category);
    if (summary.percent === null) return '-';
    return `${roundGrade(summary.percent)}%`;
  }

  function questionScoreInputValue(studentId: string, assessment: GradebookAssessment, questionId: string): string {
    const score = gradebook.scoreFor(assessment.id, studentId);
    const questionScore = score?.questionScores?.find((entry) => entry.questionId === questionId);
    return questionScore?.points === null || questionScore?.points === undefined ? '' : String(questionScore.points);
  }

  function updateQuestionScore(studentId: string, assessment: GradebookAssessment, questionId: string, value: string) {
    const parsed = parseGradeInput(value, false);
    if (parsed === undefined) return;
    gradebook.updateQuestionScore({
      sectionId: assessment.sectionId,
      assessmentId: assessment.id,
      studentId,
      questionId,
      points: parsed,
    });
  }

  function commitQuestionScore(studentId: string, assessment: GradebookAssessment, questionId: string, value: string) {
    const parsed = parseGradeInput(value, true);
    gradebook.updateQuestionScore({
      sectionId: assessment.sectionId,
      assessmentId: assessment.id,
      studentId,
      questionId,
      points: parsed === undefined ? null : parsed,
    });
  }

  function parseGradeInput(value: string, commit: boolean): number | null | undefined {
    const trimmed = value.trim();
    if (trimmed === '') return null;
    if (!commit && (trimmed === '.' || /^\d+\.$/.test(trimmed))) return undefined;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  function openStudentView(studentId: string) {
    selectedStudentId = studentId;
    expandedStudentAssessmentId = '';
    studentPickerOpen = false;
    gradebookMode = 'student';
  }

  function selectStudentInStudentView(studentId: string) {
    selectedStudentId = studentId;
    expandedStudentAssessmentId = '';
    studentPickerOpen = false;
  }

  function updateSelectedStudent(input: Partial<Pick<GradebookStudent, 'sisId' | 'firstName' | 'lastName' | 'displayName' | 'email' | 'active'>>) {
    if (!selectedStudent) return;
    gradebook.updateStudent(selectedStudent.id, input);
  }

  function archiveSelectedStudentInSection() {
    if (!selectedStudent || !selectedSectionId) return;
    if (!window.confirm(`Archive ${selectedStudent.displayName} in this section? Existing scores will stay in the gradebook.`)) return;
    gradebook.setEnrollmentActive(selectedSectionId, selectedStudent.id, false);
  }

  function deleteSelectedStudent() {
    if (!selectedStudent) return;
    const hasScores = gradebook.scores.some((score) => score.studentId === selectedStudent.id);
    const warning = hasScores
      ? `Delete ${selectedStudent.displayName} and all of their scores from this local gradebook? This cannot be undone.`
      : `Delete ${selectedStudent.displayName} from this local gradebook? This cannot be undone.`;
    if (!window.confirm(warning)) return;
    const deletedId = selectedStudent.id;
    gradebook.deleteStudent(deletedId);
    selectedStudentId = sectionStudents.find((student) => student.id !== deletedId)?.id ?? '';
    gradebookMode = sectionStudents.length > 1 ? 'student' : 'overview';
  }

  function toggleStudentAssessmentDetails(assessmentId: string) {
    expandedStudentAssessmentId = expandedStudentAssessmentId === assessmentId ? '' : assessmentId;
  }

  function questionScoreLabel(studentId: string, assessment: GradebookAssessment, questionId: string): string {
    const score = gradebook.scoreFor(assessment.id, studentId);
    const questionScore = score?.questionScores?.find((entry) => entry.questionId === questionId);
    return questionScore?.points === null || questionScore?.points === undefined ? '-' : formatPoints(questionScore.points);
  }

  function roundGrade(value: number): string {
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }

  function formatPoints(value: number): string {
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }

  function formatFileDate(timestamp: number): string {
    return new Date(timestamp).toISOString().slice(0, 10);
  }

  function downloadTextFile(filename: string, content: string, mimeType: string) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function focusGradeCell(rowIndex: number, columnIndex: number) {
    const selector = `[data-grade-row="${rowIndex}"][data-grade-col="${columnIndex}"]`;
    const input = document.querySelector<HTMLInputElement>(selector);
    if (!input) return;
    input.focus();
    input.select();
  }

  function focusRelativeGradeCell(rowIndex: number, columnIndex: number, rowDelta: number, columnDelta: number) {
    const maxRow = sectionStudents.length - 1;
    const maxColumn = selectedAssessment ? selectedAssessment.questionSnapshots.length - 1 : -1;
    const nextRow = Math.min(maxRow, Math.max(0, rowIndex + rowDelta));
    const nextColumn = Math.min(maxColumn, Math.max(0, columnIndex + columnDelta));
    focusGradeCell(nextRow, nextColumn);
  }

  function handleGradeCellKeydown(event: KeyboardEvent, rowIndex: number, columnIndex: number) {
    switch (event.key) {
      case 'ArrowUp':
        event.preventDefault();
        focusRelativeGradeCell(rowIndex, columnIndex, -1, 0);
        break;
      case 'ArrowDown':
        event.preventDefault();
        focusRelativeGradeCell(rowIndex, columnIndex, 1, 0);
        break;
      case 'ArrowLeft':
        event.preventDefault();
        focusRelativeGradeCell(rowIndex, columnIndex, 0, -1);
        break;
      case 'ArrowRight':
        event.preventDefault();
        focusRelativeGradeCell(rowIndex, columnIndex, 0, 1);
        break;
      case 'Enter':
        event.preventDefault();
        focusRelativeGradeCell(rowIndex, columnIndex, event.shiftKey ? -1 : 1, 0);
        break;
      case 'Tab':
        event.preventDefault();
        focusRelativeGradeCell(rowIndex, columnIndex, 0, event.shiftKey ? -1 : 1);
        break;
    }
  }

  function assessmentTotalLabel(assessment: GradebookAssessment): string {
    return assessment.bonusPoints > 0
      ? `${assessment.totalPoints} pts + ${assessment.bonusPoints} bonus`
      : `${assessment.totalPoints} pts`;
  }

  function stateLabel(state: GradebookScoreState): string {
    return SCORE_OPTIONS.find((option) => option.value === state)?.label ?? state;
  }

  function formatDate(timestamp: number): string {
    return new Date(timestamp).toLocaleDateString();
  }

  function formatDateInput(timestamp: number): string {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function parseDateInput(value: string): number {
    const parsed = new Date(`${value}T00:00:00`).getTime();
    return Number.isFinite(parsed) ? parsed : Date.now();
  }
</script>

<div
  class="gradebook"
  class:left-rail-hidden={!leftRailVisible}
  class:right-rail-hidden={!rightRailVisible}
  style:--left-rail-width={`${leftRailVisible ? leftRailWidth : 0}px`}
  style:--right-rail-width={`${rightRailVisible ? rightRailWidth : 0}px`}
>
  {#if leftRailVisible}
  <aside class="section-rail">
    <div class="rail-header">
      <div>
        <h2>Gradebook</h2>
        <span>
          {activeSections.length} active
          {#if archivedSections.length > 0}
            · {archivedSections.length} trashed
          {/if}
        </span>
      </div>
      <button class="rail-toggle" onclick={() => (leftRailVisible = false)} title="Hide sections">‹</button>
    </div>

    <form class="compact-form" onsubmit={(e) => { e.preventDefault(); createSection(); }}>
      <input bind:value={sectionName} placeholder="Period 2 AP Calc" aria-label="Section name" required />
      <select bind:value={sectionClassId} aria-label="Linked curriculum class">
        <option value="">No curriculum link</option>
        {#each allClasses as cls (cls.id)}
          <option value={cls.id}>{cls.name}</option>
        {/each}
      </select>
      <input bind:value={termLabel} placeholder="Term label" aria-label="Term label" />
      <button class="primary" type="submit">Add Section</button>
    </form>

    <div class="section-list">
      {#if activeSections.length === 0}
        <p class="empty">Create a course section to start a local roster.</p>
      {:else}
        {#each activeSections as section (section.id)}
          {@const linkedClass = allClasses.find((cls) => cls.id === section.linkedClassId)}
          <div class="section-item-row">
            <button
              class="section-item"
              class:active={section.id === selectedSectionId}
              onclick={() => (selectedSectionId = section.id)}
              title={section.name}
            >
              <span>{section.name}</span>
              <small>{section.termLabel || linkedClass?.name || 'Roster section'}</small>
            </button>
            <button
              class="section-trash-button"
              onclick={() => moveSectionToTrash(section)}
              title="Move section to trash"
              aria-label={`Move ${section.name} to trash`}
            >🗑</button>
          </div>
        {/each}
      {/if}
    </div>

    {#if archivedSections.length > 0}
      <details class="section-trash">
        <summary>Trash ({archivedSections.length})</summary>
        <div class="section-list">
          {#each archivedSections as section (section.id)}
            <div class="archived-section-item">
              <div>
                <span>{section.name}</span>
                <small>{section.termLabel || 'Trashed section'}</small>
              </div>
              <button class="ghost small" onclick={() => restoreSectionFromTrash(section)}>Restore</button>
            </div>
          {/each}
        </div>
      </details>
    {/if}

    <div class="gradebook-backup-panel">
      <div>
        <strong>Backup</strong>
        <small>Full restore uses JSON. CSV is for spreadsheet review.</small>
      </div>
      <div class="backup-actions">
        <button class="ghost small" type="button" onclick={backupGradebook}>Backup JSON</button>
        <button class="ghost small" type="button" onclick={openGradebookRestore}>Restore</button>
        <button class="ghost small" type="button" onclick={exportGradebookScoresCsv}>Scores CSV</button>
      </div>
      <input
        bind:this={gradebookRestoreInputEl}
        class="hidden-file"
        type="file"
        accept=".json,application/json"
        onchange={handleGradebookRestoreFile}
        aria-label="Restore Gradebook backup"
      />
      {#if backupStatus}
        <small>{backupStatus}</small>
      {/if}
    </div>
  </aside>
  {/if}

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="rail-resize rail-resize-left"
    role="button"
    tabindex="0"
    onpointerdown={handleLeftRailResize}
    onclick={toggleLeftRailHandle}
    onkeydown={(event) => handleRailToggleKeydown(event, 'left')}
    title={leftRailVisible ? 'Resize or hide sections' : 'Show sections'}
  >
    <span>{leftRailVisible ? '‹' : '›'}</span>
  </div>

  <section class="work-area">
    {#if !leftRailVisible || !rightRailVisible}
      <div class="pane-restore-bar">
        {#if !leftRailVisible}
          <button class="ghost small" onclick={() => (leftRailVisible = true)}>› Sections</button>
        {/if}
        {#if !rightRailVisible}
          <button class="ghost small" onclick={() => (rightRailVisible = true)}>Details ‹</button>
        {/if}
      </div>
    {/if}

    {#if selectedSection}
      <div class="mobile-grade-controls" aria-label="Mobile gradebook controls">
        <label>
          <span>Section</span>
          <select value={selectedSectionId} onchange={(e) => (selectedSectionId = e.currentTarget.value)}>
            {#each activeSections as section (section.id)}
              <option value={section.id}>{section.name}</option>
            {/each}
          </select>
        </label>
        {#if sectionAssessments.length > 0}
          <label>
            <span>Assessment</span>
            <select value={selectedAssessment?.id ?? ''} onchange={(e) => (selectedAssessmentId = e.currentTarget.value)}>
              {#each sectionAssessments as assessment (assessment.id)}
                <option value={assessment.id}>{assessment.savedTestName}</option>
              {/each}
            </select>
          </label>
        {/if}
      </div>
    {/if}

    {#if !selectedSection}
      <div class="blank-state">
        <h2>No gradebook section selected</h2>
        <p>Sections, rosters, assessments, and scores stay in this browser bank.</p>
      </div>
    {:else}
      <div class="section-header">
        <div>
          <h1>{selectedSection.name}</h1>
          <p>
            {selectedSection.termLabel || 'No term label'}
            {#if selectedSection.linkedClassId}
              · {allClasses.find((cls) => cls.id === selectedSection.linkedClassId)?.name ?? selectedSection.linkedClassId}
            {/if}
          </p>
        </div>
        <div class="header-stat">
          <strong>{sectionStudents.filter((student) => student.active).length}</strong>
          <span>active students</span>
        </div>
        <div class="header-stat">
          <strong>{sectionAssessments.length}</strong>
          <span>assessments</span>
        </div>
      </div>

      <div class="view-switch">
        <button class:active={gradebookMode === 'overview'} onclick={() => (gradebookMode = 'overview')}>Overview</button>
        <button class:active={gradebookMode === 'grading'} onclick={() => (gradebookMode = 'grading')} disabled={!selectedAssessment}>Grading</button>
        <button class:active={gradebookMode === 'student'} onclick={() => (gradebookMode = 'student')} disabled={!selectedStudent}>Student</button>
      </div>

      {#if gradebookMode === 'overview'}
      <div class="overview-stack">
      <div class="setup-grid">
        <section class="panel">
          <div class="panel-header">
            <div>
              <h2>Roster</h2>
              <span>{sectionStudents.length} students</span>
            </div>
            <button class="ghost small" type="button" onclick={openRosterImport} title="Import a PowerSchool roster CSV or TSV">Import Roster</button>
          </div>
          <input
            bind:this={rosterImportInputEl}
            class="hidden-file"
            type="file"
            accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
            onchange={handleRosterImportFile}
          />
          {#if rosterImportSummary}
            <div class="import-result">
              <strong>{rosterImportSummary}</strong>
              {#each rosterImportWarnings as warning}
                <small>{warning}</small>
              {/each}
            </div>
          {/if}
          <form class="student-form" onsubmit={(e) => { e.preventDefault(); addStudent(); }}>
            <input bind:value={firstName} placeholder="First" aria-label="First name" />
            <input bind:value={lastName} placeholder="Last" aria-label="Last name" />
            <input bind:value={displayName} placeholder="Display name" aria-label="Display name" />
            <input bind:value={email} placeholder="Email" aria-label="Email" type="email" />
            <button class="primary" type="submit">Add Student</button>
          </form>
          <div class="roster-list">
            {#if sectionStudents.length === 0}
              <p class="empty">No students in this section yet.</p>
            {:else}
              {#each sectionStudents as student (student.id)}
                {@const enrollment = gradebook.enrollments.find((entry) => entry.sectionId === selectedSectionId && entry.studentId === student.id)}
                <div class="roster-row" class:inactive={!student.active || !enrollment?.active}>
                  <button class="student-link" onclick={() => openStudentView(student.id)}>
                    <strong>{student.displayName}</strong>
                    <small>{student.email || `${student.lastName}, ${student.firstName}`}</small>
                  </button>
                  <label class="toggle-row">
                    <input
                      type="checkbox"
                      checked={Boolean(student.active && enrollment?.active)}
                      onchange={(e) => {
                        const active = e.currentTarget.checked;
                        gradebook.updateStudent(student.id, { active });
                        gradebook.setEnrollmentActive(selectedSectionId, student.id, active);
                      }}
                    />
                    Active
                  </label>
                </div>
              {/each}
            {/if}
          </div>
        </section>

        <section class="panel">
          <div class="panel-header">
            <h2>Assessments</h2>
            <span>{sectionAssessments.length} saved snapshots</span>
          </div>
          <form class="assessment-form" onsubmit={(e) => { e.preventDefault(); addAssessment(); }}>
            <select bind:value={savedTestId} disabled={testLibrary.tests.length === 0} aria-label="Saved test">
              {#if testLibrary.tests.length === 0}
                <option value="">No saved tests</option>
              {:else}
                {#each testLibrary.tests as test (test.id)}
                  <option value={test.id}>{test.name}</option>
                {/each}
              {/if}
            </select>
            <input type="date" bind:value={administeredDate} aria-label="Administered date" />
            <button class="primary" type="submit" disabled={!savedTestId}>Add to Gradebook</button>
          </form>
          <div class="assessment-list">
            {#if sectionAssessments.length === 0}
              <p class="empty">Add a saved test to freeze its question order and point values.</p>
            {:else}
              {#each sectionAssessments as assessment (assessment.id)}
                <button
                  class="assessment-item"
                  class:active={assessment.id === selectedAssessment?.id}
                  onclick={() => (selectedAssessmentId = assessment.id)}
                >
                  <span>{assessment.savedTestName}</span>
                  <small>{categoryLabel(assessmentTypeKey(assessment.testType))} · {assessmentTotalLabel(assessment)} · {formatDate(assessment.administeredAt)}</small>
                </button>
              {/each}
            {/if}
          </div>
        </section>

        <section class="panel weights-panel">
          <div class="panel-header">
            <h2>Category Weights</h2>
            <span>per course section</span>
          </div>
          <div class="weights-grid">
            {#each GRADEBOOK_CATEGORIES as category}
              <label>
                <span>{categoryLabel(category)}</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={selectedSection.categoryWeights[category] ?? 0}
                  onchange={(e) => updateCategoryWeight(category, e.currentTarget.value)}
                />
              </label>
            {/each}
          </div>
        </section>
      </div>

      <section class="score-section">
        <div class="panel-header">
          <h2>Score Grid</h2>
          <span>normal scores count toward the simple total</span>
        </div>
        <div class="mobile-score-cards">
          {#if sectionStudents.length === 0}
            <p class="empty">No roster entries.</p>
          {:else}
            {#each sectionStudents as student (student.id)}
              {@const finalGrade = studentFinalGrade(student)}
              <article class="mobile-score-card" class:inactive={!student.active}>
                <button class="mobile-student-summary" onclick={() => openStudentView(student.id)}>
                  <span>
                    <strong>{student.displayName}</strong>
                    <small>{student.email || `${student.lastName}, ${student.firstName}`}</small>
                  </span>
                  <span class="mobile-final-grade">
                    <strong>{finalGrade.primary}</strong>
                    <small>{finalGrade.detail}</small>
                  </span>
                </button>
                {#if sectionAssessments.length > 0}
                  <div class="mobile-assessment-scores">
                    {#each sectionAssessments as assessment (assessment.id)}
                      <button
                        class="mobile-assessment-score"
                        onclick={() => {
                          selectedAssessmentId = assessment.id;
                          gradebookMode = 'grading';
                        }}
                        title={assessment.savedTestName}
                      >
                        <span>{assessment.savedTestName}</span>
                        <strong>{scoreDisplay(student.id, assessment) || '-'}</strong>
                        <small>{percentDisplay(student.id, assessment) || stateLabel(scoreState(student.id, assessment))}</small>
                      </button>
                    {/each}
                  </div>
                {/if}
              </article>
            {/each}
          {/if}
        </div>
        <div class="score-grid-wrap">
          <table class="score-grid">
            <thead>
              <tr>
                <th>Student</th>
                {#each sectionAssessments as assessment (assessment.id)}
                  <th title={assessment.savedTestName}>{assessment.savedTestName}</th>
                {/each}
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {#if sectionStudents.length === 0}
                <tr><td colspan={sectionAssessments.length + 2}>No roster entries.</td></tr>
              {:else}
                {#each sectionStudents as student (student.id)}
                  {@const finalGrade = studentFinalGrade(student)}
                  <tr class:inactive={!student.active}>
                    <th>
                      <button class="student-table-link" onclick={() => openStudentView(student.id)}>
                        {student.displayName}
                      </button>
                    </th>
                    {#each sectionAssessments as assessment (assessment.id)}
                      <td>
                        <button class="score-cell" onclick={() => { selectedAssessmentId = assessment.id; gradebookMode = 'grading'; }}>
                          <span>{scoreDisplay(student.id, assessment) || '-'}</span>
                          <small>{percentDisplay(student.id, assessment)}</small>
                        </button>
                      </td>
                    {/each}
                    <td class="total-cell">
                      <button class="student-total-link" onclick={() => openStudentView(student.id)}>
                        <span>{finalGrade.primary}</span>
                        <small>{finalGrade.detail}</small>
                      </button>
                    </td>
                  </tr>
                {/each}
              {/if}
            </tbody>
          </table>
        </div>
      </section>
      </div>
      {:else if gradebookMode === 'grading' && selectedAssessment}
        <section class="grading-view">
          <div class="panel-header">
            <div>
              <h2>{selectedAssessment.savedTestName}</h2>
              <span>{categoryLabel(assessmentTypeKey(selectedAssessment.testType))} · {assessmentTotalLabel(selectedAssessment)}</span>
            </div>
            <div class="grading-actions">
              <button class="ghost" onclick={() => (gradebookMode = 'overview')}>Back to Overview</button>
            </div>
          </div>
          <div class="mobile-score-entry-list">
            {#if sectionStudents.length === 0}
              <p class="empty">No roster entries.</p>
            {:else}
              {#each sectionStudents as student (student.id)}
                <div class="mobile-score-entry-card" class:inactive={!student.active}>
                  <button class="mobile-score-entry-name" onclick={() => openStudentView(student.id)}>
                    <strong>{student.displayName}</strong>
                    <small>{student.lastName}, {student.firstName}</small>
                  </button>
                  <label>
                    <span>Score</span>
                    <input
                      type="number"
                      inputmode="decimal"
                      min="0"
                      step="0.5"
                      max={selectedAssessment.totalPoints}
                      value={scoreInputValue(student.id, selectedAssessment)}
                      aria-label="Score for {student.displayName}"
                      onchange={(e) => updateScore(student.id, selectedAssessment, e.currentTarget.value, scoreState(student.id, selectedAssessment))}
                    />
                  </label>
                  <label>
                    <span>State</span>
                    <select
                      value={scoreState(student.id, selectedAssessment)}
                      aria-label="Score state for {student.displayName}"
                      onchange={(e) => updateScore(student.id, selectedAssessment, scoreInputValue(student.id, selectedAssessment), e.currentTarget.value as GradebookScoreState)}
                    >
                      {#each SCORE_OPTIONS as option}
                        <option value={option.value}>{option.label}</option>
                      {/each}
                    </select>
                  </label>
                </div>
              {/each}
            {/if}
          </div>
          <div class="grading-grid-wrap">
            <table class="grading-grid">
              <thead>
                <tr>
                  <th>Student</th>
                  {#each selectedAssessment.questionSnapshots as snapshot (snapshot.questionId)}
                    <th title={snapshot.bodyPreview || snapshot.questionId}>
                      <span>Q{snapshot.label}</span>
                      <small>{snapshot.isBonus ? 'Bonus' : ''} / {snapshot.points}</small>
                    </th>
                  {/each}
                  <th>Total</th>
                  <th>State</th>
                </tr>
              </thead>
              <tbody>
                {#if sectionStudents.length === 0}
                  <tr><td colspan={selectedAssessment.questionSnapshots.length + 3}>No roster entries.</td></tr>
                {:else}
                  {#each sectionStudents as student, studentIndex (student.id)}
                    <tr class:inactive={!student.active}>
                      <th>
                        <span>{student.displayName}</span>
                        <small>{student.lastName}, {student.firstName}</small>
                      </th>
                      {#each selectedAssessment.questionSnapshots as snapshot, questionIndex (snapshot.questionId)}
                        <td class="grade-cell" onclick={() => focusGradeCell(studentIndex, questionIndex)}>
                          <input
                            type="text"
                            inputmode="decimal"
                            autocomplete="off"
                            value={questionScoreInputValue(student.id, selectedAssessment, snapshot.questionId)}
                            aria-label="Q{snapshot.label} score for {student.displayName}"
                            data-grade-row={studentIndex}
                            data-grade-col={questionIndex}
                            onfocus={(e) => e.currentTarget.select()}
                            onkeydown={(e) => handleGradeCellKeydown(e, studentIndex, questionIndex)}
                            oninput={(e) => updateQuestionScore(student.id, selectedAssessment, snapshot.questionId, e.currentTarget.value)}
                            onchange={(e) => commitQuestionScore(student.id, selectedAssessment, snapshot.questionId, e.currentTarget.value)}
                          />
                        </td>
                      {/each}
                      <td class="total-cell">{scoreDisplay(student.id, selectedAssessment) || '-'}</td>
                      <td>
                        <select
                          value={scoreState(student.id, selectedAssessment)}
                          aria-label="Score state for {student.displayName}"
                          onchange={(e) => updateScore(student.id, selectedAssessment, scoreInputValue(student.id, selectedAssessment), e.currentTarget.value as GradebookScoreState)}
                        >
                          {#each SCORE_OPTIONS as option}
                            <option value={option.value}>{option.label}</option>
                          {/each}
                        </select>
                      </td>
                    </tr>
                  {/each}
                {/if}
              </tbody>
            </table>
          </div>
        </section>
      {:else if gradebookMode === 'student' && selectedStudent}
        {@const finalGrade = studentFinalGrade(selectedStudent)}
        <section class="student-view">
          <div class="student-summary">
            <div class="student-picker">
              <button
                class="student-picker-trigger"
                aria-expanded={studentPickerOpen}
                onclick={() => (studentPickerOpen = !studentPickerOpen)}
              >
                <span>
                  <strong>{selectedStudent.displayName}</strong>
                  <small>{selectedStudent.email || `${selectedStudent.lastName}, ${selectedStudent.firstName}`}</small>
                </span>
                <span class="picker-chevron">{studentPickerOpen ? '▴' : '▾'}</span>
              </button>
              {#if studentPickerOpen}
                <div class="student-picker-menu">
                  {#each sectionStudents as student (student.id)}
                    <button
                      class:active={student.id === selectedStudent.id}
                      class:inactive={!student.active}
                      onclick={() => selectStudentInStudentView(student.id)}
                    >
                      <span>{student.displayName}</span>
                      <small>{student.email || `${student.lastName}, ${student.firstName}`}</small>
                    </button>
                  {/each}
                </div>
              {/if}
            </div>
            <div class="final-grade">
              <span>Final Grade</span>
              <strong>{finalGrade.primary}</strong>
              <small>{finalGrade.detail}</small>
            </div>
          </div>

          <div class="student-layout">
            <section class="panel">
              <div class="panel-header">
                <h2>Student Details</h2>
                <span>local roster record</span>
              </div>
              <div class="student-edit-grid">
                <label>
                  <span>First</span>
                  <input
                    value={selectedStudent.firstName}
                    onchange={(e) => updateSelectedStudent({ firstName: e.currentTarget.value })}
                  />
                </label>
                <label>
                  <span>Last</span>
                  <input
                    value={selectedStudent.lastName}
                    onchange={(e) => updateSelectedStudent({ lastName: e.currentTarget.value })}
                  />
                </label>
                <label>
                  <span>Display</span>
                  <input
                    value={selectedStudent.displayName}
                    onchange={(e) => updateSelectedStudent({ displayName: e.currentTarget.value })}
                  />
                </label>
                <label>
                  <span>Email</span>
                  <input
                    type="email"
                    value={selectedStudent.email ?? ''}
                    onchange={(e) => updateSelectedStudent({ email: e.currentTarget.value })}
                  />
                </label>
                <label>
                  <span>SIS ID</span>
                  <input
                    value={selectedStudent.sisId ?? ''}
                    onchange={(e) => updateSelectedStudent({ sisId: e.currentTarget.value })}
                  />
                </label>
                <label class="toggle-row student-active-toggle">
                  <input
                    type="checkbox"
                    checked={selectedStudent.active}
                    onchange={(e) => updateSelectedStudent({ active: e.currentTarget.checked })}
                  />
                  Active student
                </label>
                <label class="toggle-row student-active-toggle">
                  <input
                    type="checkbox"
                    checked={selectedEnrollment?.active !== false}
                    onchange={(e) => gradebook.setEnrollmentActive(selectedSectionId, selectedStudent.id, e.currentTarget.checked)}
                  />
                  Active in section
                </label>
              </div>
              <div class="student-danger-actions">
                <button class="ghost" onclick={archiveSelectedStudentInSection} disabled={selectedEnrollment?.active === false}>
                  Archive in Section
                </button>
                <button class="ghost danger-text" onclick={deleteSelectedStudent}>
                  Delete Student
                </button>
              </div>
            </section>

            <section class="panel category-overview">
              <div class="panel-header">
                <h2>Category Totals</h2>
                <span>normal numeric scores</span>
              </div>
              <div class="category-total-grid">
                {#each GRADEBOOK_CATEGORIES as category}
                  {@const summary = studentCategorySummary(selectedStudent, category)}
                  <div class="category-total">
                    <span>{categoryLabel(category)}</span>
                    <strong>{categoryTotalLabel(selectedStudent, category)}</strong>
                    <small>
                      {summary.percent === null
                        ? `${summary.weight}% weight · no scores`
                        : `${formatPoints(summary.earned)}/${formatPoints(summary.possible)} · ${summary.weight}% weight`}
                    </small>
                  </div>
                {/each}
              </div>
            </section>
          </div>

          <div class="student-category-list">
            {#each GRADEBOOK_CATEGORIES as category}
              {@const summary = studentCategorySummary(selectedStudent, category)}
              {#if summary.assessments.length > 0}
                <section class="panel student-category-section">
                  <div class="panel-header">
                    <div>
                      <h2>{categoryLabel(category)} Total: {categoryTotalLabel(selectedStudent, category)}</h2>
                      <span>
                        {summary.percent === null
                          ? `${summary.weight}% weight · no graded scores`
                          : `${formatPoints(summary.earned)}/${formatPoints(summary.possible)} across ${summary.count} scored`}
                      </span>
                    </div>
                  </div>
                  <div class="student-assessment-list">
                    {#each summary.assessments as assessment (assessment.id)}
                      {@const score = gradebook.scoreFor(assessment.id, selectedStudent.id)}
                      {@const percent = assessmentScorePercent(score, assessment)}
                      <div class="student-assessment-block">
                        <button
                          class="student-assessment-row"
                          aria-expanded={expandedStudentAssessmentId === assessment.id}
                          onclick={() => toggleStudentAssessmentDetails(assessment.id)}
                        >
                          <div>
                            <strong>{assessment.savedTestName}</strong>
                            <small>{formatDate(assessment.administeredAt)} · {assessmentTotalLabel(assessment)}</small>
                          </div>
                          <div>
                            <strong>{scoreDisplay(selectedStudent.id, assessment) || '-'}</strong>
                            <small>{percent === null ? stateLabel(score?.state ?? 'normal') : `${roundGrade(percent)}%`}</small>
                          </div>
                        </button>
                        {#if expandedStudentAssessmentId === assessment.id}
                          <div class="student-assessment-detail">
                            <table>
                              <thead>
                                <tr>
                                  <th>Question</th>
                                  <th>Score</th>
                                  <th>Out Of</th>
                                </tr>
                              </thead>
                              <tbody>
                                {#each assessment.questionSnapshots as snapshot (snapshot.questionId)}
                                  <tr>
                                    <th>
                                      Q{snapshot.label}
                                      {#if snapshot.isBonus}
                                        <small>Bonus</small>
                                      {/if}
                                    </th>
                                    <td>{questionScoreLabel(selectedStudent.id, assessment, snapshot.questionId)}</td>
                                    <td>{formatPoints(snapshot.points)}</td>
                                  </tr>
                                {/each}
                              </tbody>
                              <tfoot>
                                <tr>
                                  <th>Total</th>
                                  <td>{scoreDisplay(selectedStudent.id, assessment) || '-'}</td>
                                  <td>{assessmentTotalLabel(assessment)}</td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        {/if}
                      </div>
                    {/each}
                  </div>
                </section>
              {/if}
            {/each}
          </div>
        </section>
      {/if}
    {/if}
  </section>

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="rail-resize rail-resize-right"
    role="button"
    tabindex="0"
    onpointerdown={handleRightRailResize}
    onclick={toggleRightRailHandle}
    onkeydown={(event) => handleRailToggleKeydown(event, 'right')}
    title={rightRailVisible ? 'Resize or hide details' : 'Show details'}
  >
    <span>{rightRailVisible ? '›' : '‹'}</span>
  </div>

  {#if rightRailVisible}
  <aside class="detail-rail">
    {#if gradebookMode === 'student' && selectedStudent}
      <div class="detail-header">
        <div>
          <h2>{selectedStudent.displayName}</h2>
          <p>{studentFinalGrade(selectedStudent).primary} · {studentFinalGrade(selectedStudent).detail}</p>
        </div>
        <button class="rail-toggle" onclick={() => (rightRailVisible = false)} title="Hide details">›</button>
      </div>

      <div class="question-snapshots">
        {#each GRADEBOOK_CATEGORIES as category}
          {@const summary = studentCategorySummary(selectedStudent, category)}
          <div class="snapshot-row">
            <span>{categoryLabel(category).slice(0, 1)}</span>
            <strong>{categoryTotalLabel(selectedStudent, category)}</strong>
            <p>{categoryLabel(category)} · {summary.weight}% weight</p>
          </div>
        {/each}
      </div>
    {:else if selectedAssessment}
      <div class="detail-header">
        <div>
          <h2>{selectedAssessment.savedTestName}</h2>
          <p>{assessmentTotalLabel(selectedAssessment)} · {selectedAssessment.questionSnapshots.length} questions</p>
        </div>
        <button class="rail-toggle" onclick={() => (rightRailVisible = false)} title="Hide details">›</button>
      </div>

      <div class="question-snapshots">
        {#each selectedAssessment.questionSnapshots as snapshot (snapshot.questionId)}
          <div class="snapshot-row">
            <span>{snapshot.label}</span>
            <strong>{snapshot.isBonus ? 'Bonus' : ''} {snapshot.points} pts</strong>
            <p>{snapshot.bodyPreview || snapshot.questionId}</p>
          </div>
        {/each}
      </div>

      <div class="score-entry-list">
        {#each sectionStudents as student (student.id)}
          <div class="score-entry-row" class:inactive={!student.active}>
            <div class="student-name">
              <strong>{student.displayName}</strong>
              <small>{student.lastName}, {student.firstName}</small>
            </div>
            <input
              type="number"
              min="0"
              step="0.5"
              max={selectedAssessment.totalPoints}
              value={scoreInputValue(student.id, selectedAssessment)}
              aria-label="Score for {student.displayName}"
              onchange={(e) => updateScore(student.id, selectedAssessment, e.currentTarget.value, scoreState(student.id, selectedAssessment))}
            />
            <select
              value={scoreState(student.id, selectedAssessment)}
              aria-label="Score state for {student.displayName}"
              onchange={(e) => updateScore(student.id, selectedAssessment, scoreInputValue(student.id, selectedAssessment), e.currentTarget.value as GradebookScoreState)}
            >
              {#each SCORE_OPTIONS as option}
                <option value={option.value}>{option.label}</option>
              {/each}
            </select>
          </div>
        {/each}
      </div>
    {:else}
      <div class="blank-state detail-empty">
        <h2>No assessment</h2>
        <p>Add a saved test to a section to enter scores.</p>
      </div>
    {/if}
  </aside>
  {/if}
</div>

<style>
  .gradebook {
    display: grid;
    grid-template-columns: var(--left-rail-width) 10px minmax(0, 1fr) 10px var(--right-rail-width);
    grid-template-areas: "left left-resize work right-resize right";
    height: 100%;
    min-height: 0;
    background: var(--bg);
    color: var(--text);
  }

  .section-rail,
  .detail-rail {
    min-width: 0;
    overflow: auto;
    background: var(--bg-2);
    padding: 12px;
  }

  .section-rail {
    grid-area: left;
    border-right: 1px solid var(--border);
  }

  .detail-rail {
    grid-area: right;
    border-left: 1px solid var(--border);
  }

  .rail-resize {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 10px;
    background: var(--bg-2);
    color: var(--text-2);
    cursor: col-resize;
    touch-action: none;
    user-select: none;
    border-left: 1px solid var(--border);
    border-right: 1px solid var(--border);
  }

  .rail-resize:hover {
    background: var(--bg-3);
    color: var(--text);
  }

  .rail-resize-left {
    grid-area: left-resize;
  }

  .rail-resize-right {
    grid-area: right-resize;
  }

  .rail-resize span {
    font-size: 16px;
    line-height: 1;
    pointer-events: none;
  }

  .rail-toggle {
    flex: 0 0 auto;
    width: 26px;
    height: 26px;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg);
    color: var(--text-2);
    font-size: 17px;
    line-height: 1;
  }

  .rail-toggle:hover {
    color: var(--text);
    border-color: var(--primary);
  }

  .work-area {
    grid-area: work;
    min-width: 0;
    overflow: auto;
    padding: 14px;
  }

  .pane-restore-bar {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 10px;
  }

  .rail-header,
  .section-header,
  .panel-header,
  .detail-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 10px;
  }

  .rail-header > div,
  .detail-header > div {
    min-width: 0;
  }

  h1,
  h2 {
    font-size: 16px;
    line-height: 1.2;
    letter-spacing: 0;
  }

  h1 {
    font-size: 20px;
  }

  p,
  small,
  .rail-header span,
  .panel-header span,
  .header-stat span {
    color: var(--text-2);
    font-size: 12px;
  }

  .compact-form,
  .student-form,
  .assessment-form {
    display: grid;
    gap: 7px;
    margin-bottom: 12px;
  }

  .hidden-file {
    display: none;
  }

  .import-result {
    display: grid;
    gap: 2px;
    margin-bottom: 10px;
    padding: 8px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg-2);
    font-size: 12px;
  }

  .import-result small {
    display: block;
  }

  .student-form {
    grid-template-columns: repeat(4, minmax(0, 1fr)) auto;
    align-items: center;
  }

  .assessment-form {
    grid-template-columns: minmax(0, 1fr) 150px auto;
    align-items: center;
  }

  .view-switch {
    display: inline-flex;
    gap: 2px;
    padding: 3px;
    margin: 12px 0 0;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg-2);
  }

  .view-switch button {
    background: transparent;
    padding: 5px 12px;
  }

  .view-switch button.active {
    background: var(--bg);
    box-shadow: 0 0 0 1px var(--border);
  }

  .overview-stack {
    display: contents;
  }

  .mobile-grade-controls,
  .mobile-score-cards,
  .mobile-score-entry-list {
    display: none;
  }

  .student-link,
  .student-table-link,
  .student-total-link {
    width: 100%;
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    text-align: left;
  }

  .student-link:hover strong,
  .student-table-link:hover,
  .student-total-link:hover span {
    color: var(--primary);
  }

  .student-total-link {
    display: grid;
    gap: 1px;
  }

  .student-total-link span {
    font-weight: 700;
  }

  .section-list,
  .assessment-list,
  .roster-list,
  .score-entry-list,
  .question-snapshots {
    display: grid;
    gap: 6px;
  }

  .section-item-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 30px;
    gap: 4px;
    align-items: stretch;
  }

  .section-item,
  .assessment-item {
    display: grid;
    gap: 2px;
    width: 100%;
    padding: 8px;
    text-align: left;
    background: transparent;
    border: 1px solid transparent;
  }

  .section-item:hover,
  .assessment-item:hover,
  .section-item.active,
  .assessment-item.active {
    background: var(--bg);
    border-color: var(--border);
  }

  .section-item span,
  .assessment-item span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
  }

  .section-trash-button {
    display: inline-grid;
    place-items: center;
    width: 30px;
    height: 30px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 4px;
    background: transparent;
    color: var(--text-2);
    line-height: 1;
  }

  .section-trash-button:hover {
    color: #b91c1c;
    border-color: #fecaca;
    background: #fef2f2;
  }

  .section-trash {
    margin-top: 12px;
    padding-top: 10px;
    border-top: 1px solid var(--border);
  }

  .section-trash summary {
    cursor: pointer;
    color: var(--text-2);
    font-size: 12px;
    font-weight: 600;
  }

  .section-trash .section-list {
    margin-top: 8px;
  }

  .archived-section-item {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 6px;
    padding: 7px;
    border: 1px dashed var(--border);
    border-radius: 6px;
    background: var(--bg);
  }

  .archived-section-item div,
  .archived-section-item span,
  .archived-section-item small {
    min-width: 0;
  }

  .archived-section-item span,
  .archived-section-item small {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .archived-section-item span {
    font-weight: 600;
  }

  .gradebook-backup-panel {
    display: grid;
    gap: 7px;
    margin-top: 12px;
    padding-top: 10px;
    border-top: 1px solid var(--border);
  }

  .gradebook-backup-panel strong,
  .gradebook-backup-panel small {
    display: block;
  }

  .backup-actions {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 4px;
  }

  .backup-actions button {
    min-width: 0;
    padding-inline: 6px;
  }

  .blank-state {
    display: grid;
    place-content: center;
    min-height: 240px;
    text-align: center;
    gap: 6px;
  }

  .section-header {
    align-items: center;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--border);
  }

  .header-stat {
    min-width: 92px;
    padding: 8px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg-2);
    text-align: right;
  }

  .header-stat strong {
    display: block;
    font-size: 18px;
  }

  .setup-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.2fr) minmax(320px, 0.8fr);
    gap: 12px;
    margin: 12px 0;
  }

  .panel,
  .score-section,
  .grading-view {
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
    padding: 10px;
  }

  .weights-panel {
    grid-column: 1 / -1;
  }

  .weights-grid {
    display: grid;
    grid-template-columns: repeat(6, minmax(100px, 1fr));
    gap: 8px;
  }

  .weights-grid label {
    display: grid;
    gap: 4px;
  }

  .weights-grid span {
    color: var(--text-2);
    font-size: 12px;
  }

  .student-view {
    display: grid;
    gap: 12px;
    margin-top: 12px;
  }

  .student-summary {
    display: flex;
    align-items: stretch;
    justify-content: space-between;
    gap: 12px;
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
  }

  .student-picker {
    position: relative;
    min-width: 0;
    flex: 1;
  }

  .student-picker-trigger {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    width: 100%;
    min-height: 100%;
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    text-align: left;
  }

  .student-picker-trigger strong {
    display: block;
    font-size: 20px;
    line-height: 1.2;
  }

  .student-picker-trigger small {
    display: block;
    margin-top: 2px;
  }

  .picker-chevron {
    flex: 0 0 auto;
    color: var(--text-2);
    font-size: 14px;
  }

  .student-picker-menu {
    position: absolute;
    z-index: 5;
    top: calc(100% + 6px);
    left: 0;
    width: min(360px, 100%);
    max-height: 280px;
    overflow: auto;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.16);
  }

  .student-picker-menu button {
    display: grid;
    gap: 2px;
    width: 100%;
    padding: 8px 10px;
    border: 0;
    border-bottom: 1px solid var(--border);
    border-radius: 0;
    background: transparent;
    color: inherit;
    text-align: left;
  }

  .student-picker-menu button:last-child {
    border-bottom: 0;
  }

  .student-picker-menu button:hover,
  .student-picker-menu button.active {
    background: var(--bg-2);
  }

  .student-picker-menu span,
  .student-picker-menu small {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .final-grade {
    min-width: 160px;
    padding: 10px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg-2);
    text-align: right;
  }

  .final-grade span,
  .final-grade small,
  .student-edit-grid span,
  .category-total span {
    display: block;
    color: var(--text-2);
    font-size: 12px;
  }

  .final-grade strong {
    display: block;
    font-size: 30px;
    line-height: 1.05;
  }

  .student-layout {
    display: grid;
    grid-template-columns: minmax(280px, 0.8fr) minmax(0, 1.2fr);
    gap: 12px;
  }

  .student-edit-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .student-edit-grid label {
    display: grid;
    gap: 4px;
  }

  .student-active-toggle {
    align-self: end;
    min-height: 34px;
  }

  .student-danger-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid var(--border);
  }

  .category-total-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }

  .category-total {
    display: grid;
    gap: 2px;
    padding: 8px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg-2);
  }

  .category-total strong {
    font-size: 18px;
  }

  .student-category-list {
    display: grid;
    gap: 10px;
  }

  .student-assessment-list {
    display: grid;
    gap: 6px;
  }

  .student-assessment-block {
    display: grid;
    gap: 0;
  }

  .student-assessment-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(80px, auto);
    gap: 12px;
    align-items: center;
    width: 100%;
    padding: 8px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg-2);
    text-align: left;
  }

  .student-assessment-row:hover {
    border-color: var(--primary);
    background: color-mix(in srgb, var(--primary) 5%, var(--bg));
  }

  .student-assessment-row[aria-expanded="true"] {
    border-color: var(--primary);
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
    background: color-mix(in srgb, var(--primary) 6%, var(--bg));
  }

  .student-assessment-row > div:last-child {
    text-align: right;
  }

  .student-assessment-row strong,
  .student-assessment-row small {
    display: block;
  }

  .student-assessment-detail {
    overflow: auto;
    border: 1px solid var(--primary);
    border-top: 0;
    border-bottom-left-radius: 6px;
    border-bottom-right-radius: 6px;
    background: var(--bg);
  }

  .student-assessment-detail table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }

  .student-assessment-detail th,
  .student-assessment-detail td {
    padding: 6px 8px;
    border-top: 1px solid var(--border);
    text-align: right;
  }

  .student-assessment-detail th:first-child {
    text-align: left;
  }

  .student-assessment-detail thead th {
    background: var(--bg-2);
    color: var(--text-2);
    font-size: 12px;
    font-weight: 600;
  }

  .student-assessment-detail tfoot th,
  .student-assessment-detail tfoot td {
    font-weight: 700;
    background: var(--bg-2);
  }

  .student-assessment-detail small {
    display: inline;
    margin-left: 6px;
    color: var(--text-2);
    font-weight: 400;
  }

  .roster-row,
  .score-entry-row,
  .snapshot-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 10px;
    align-items: center;
    padding: 7px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg-2);
  }

  .roster-row strong,
  .student-name strong {
    display: block;
    font-size: 13px;
  }

  .roster-row small,
  .student-name small {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .toggle-row {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    color: var(--text-2);
    white-space: nowrap;
  }

  .toggle-row input {
    width: auto;
  }

  .inactive {
    opacity: 0.58;
  }

  .score-grid-wrap {
    overflow: auto;
    border: 1px solid var(--border);
    border-radius: 6px;
  }

  .score-grid {
    width: 100%;
    min-width: 680px;
    border-collapse: collapse;
    font-size: 13px;
  }

  .grading-view {
    margin-top: 12px;
  }

  .grading-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: flex-end;
  }

  .grading-grid-wrap {
    overflow: auto;
    border: 1px solid var(--border);
    border-radius: 6px;
  }

  .grading-grid {
    width: 100%;
    min-width: 820px;
    border-collapse: collapse;
    font-size: 13px;
  }

  .grading-grid th,
  .grading-grid td {
    border-bottom: 1px solid var(--border);
    border-right: 1px solid var(--border);
    padding: 6px;
    background: var(--bg);
    vertical-align: middle;
  }

  .grading-grid thead th {
    position: sticky;
    top: 0;
    z-index: 1;
    background: var(--bg-2);
  }

  .grading-grid tbody th {
    text-align: left;
    min-width: 170px;
  }

  .grading-grid th span,
  .grading-grid th small {
    display: block;
  }

  .grading-grid td.grade-cell {
    min-width: 72px;
    height: 34px;
    padding: 0;
  }

  .grading-grid td.grade-cell:focus-within {
    outline: 2px solid var(--primary);
    outline-offset: -2px;
    background: var(--bg-2);
  }

  .grading-grid .grade-cell input {
    display: block;
    width: 100%;
    height: 100%;
    min-height: 34px;
    margin: 0;
    padding: 6px 8px;
    border: 0;
    border-radius: 0;
    outline: 0;
    background: transparent;
    color: var(--text);
    font: inherit;
    text-align: right;
  }

  .score-grid th,
  .score-grid td {
    border-bottom: 1px solid var(--border);
    border-right: 1px solid var(--border);
    padding: 6px;
    vertical-align: middle;
    background: var(--bg);
  }

  .score-grid thead th {
    position: sticky;
    top: 0;
    z-index: 1;
    background: var(--bg-2);
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .score-grid tbody th {
    text-align: left;
    min-width: 160px;
  }

  .score-cell {
    display: grid;
    gap: 1px;
    min-width: 70px;
    width: 100%;
    padding: 4px 6px;
    background: transparent;
  }

  .score-cell span {
    font-weight: 600;
  }

  .total-cell {
    font-weight: 600;
    white-space: nowrap;
  }

  .snapshot-row {
    grid-template-columns: 28px 54px minmax(0, 1fr);
  }

  .snapshot-row p {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .score-entry-row {
    grid-template-columns: minmax(0, 1fr) 82px 112px;
  }

  .detail-empty {
    min-height: 100%;
  }

  .empty {
    padding: 10px;
    border: 1px dashed var(--border);
    border-radius: 6px;
    background: var(--bg);
  }

  @media (max-width: 1100px) {
    .gradebook {
      grid-template-columns: var(--left-rail-width) 10px minmax(0, 1fr);
      grid-template-areas: "left left-resize work";
    }

    .detail-rail,
    .rail-resize-right {
      display: none;
    }

    .setup-grid,
    .student-form,
    .assessment-form,
    .student-layout,
    .category-total-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 760px) {
    .gradebook {
      display: flex;
      flex-direction: column;
      overflow: auto;
      height: 100%;
      -webkit-overflow-scrolling: touch;
    }

    .section-rail,
    .work-area {
      overflow: visible;
    }

    .section-rail {
      display: block;
      order: 2;
      padding: 12px 12px calc(18px + env(safe-area-inset-bottom));
      background: var(--bg);
    }

    .rail-resize {
      display: none;
    }

    .section-rail {
      border-right: 0;
      border-top: 1px solid var(--border);
      border-bottom: 0;
    }

    .detail-rail {
      display: none;
    }

    .work-area {
      order: 1;
      padding: 10px;
    }

    .pane-restore-bar,
    .rail-toggle,
    .detail-header {
      display: none;
    }

    .mobile-grade-controls {
      position: sticky;
      top: 0;
      z-index: 4;
      display: grid;
      grid-template-columns: 1fr;
      gap: 8px;
      margin: -10px -10px 10px;
      padding: 10px;
      border-bottom: 1px solid var(--border);
      background: color-mix(in srgb, var(--bg) 94%, transparent);
      backdrop-filter: blur(10px);
    }

    .mobile-grade-controls label,
    .mobile-score-entry-card label {
      display: grid;
      gap: 4px;
      margin: 0;
    }

    .mobile-grade-controls span,
    .mobile-score-entry-card label span {
      color: var(--text-2);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    .mobile-grade-controls select,
    .mobile-score-entry-card input,
    .mobile-score-entry-card select {
      min-height: 44px;
      font-size: 16px;
    }

    .section-header {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      padding-bottom: 10px;
      margin-bottom: 10px;
    }

    .student-summary {
      display: grid;
    }

    .final-grade {
      text-align: left;
    }

    .student-edit-grid,
    .category-total-grid {
      grid-template-columns: 1fr;
    }

    .section-header > div:first-child {
      grid-column: 1 / -1;
    }

    .header-stat {
      min-width: 0;
      text-align: left;
    }

    .view-switch {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      width: 100%;
      margin: 0 0 10px;
      border-radius: 10px;
      background: var(--bg-2);
    }

    .view-switch button {
      min-height: 44px;
      padding: 0 6px;
      font-size: 14px;
    }

    .overview-stack {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .score-section {
      order: -1;
      margin: 0;
    }

    .setup-grid {
      margin: 0;
      gap: 10px;
      grid-template-columns: minmax(0, 1fr);
      width: 100%;
      min-width: 0;
    }

    .setup-grid > .panel {
      min-width: 0;
      max-width: 100%;
      box-sizing: border-box;
    }

    .weights-grid {
      grid-template-columns: repeat(auto-fit, minmax(128px, 1fr));
      gap: 8px;
      width: 100%;
      min-width: 0;
    }

    .weights-grid label {
      min-width: 0;
    }

    .weights-grid input {
      width: 100%;
      min-width: 0;
      box-sizing: border-box;
    }

    .setup-grid .student-form,
    .setup-grid .assessment-form,
    .compact-form {
      grid-template-columns: 1fr;
      align-items: stretch;
      width: 100%;
      min-width: 0;
    }

    .setup-grid .student-form input,
    .setup-grid .assessment-form select,
    .setup-grid .assessment-form input,
    .compact-form input,
    .compact-form select {
      width: 100%;
      min-width: 0;
      max-width: 100%;
      box-sizing: border-box;
    }

    .setup-grid .student-form button,
    .setup-grid .assessment-form button,
    .compact-form button {
      width: 100%;
      min-width: 0;
      white-space: normal;
      line-height: 1.15;
    }

    .panel,
    .score-section,
    .grading-view {
      border-radius: 8px;
      padding: 10px;
    }

    .panel-header {
      align-items: center;
    }

    .panel-header button,
    .backup-actions button,
    .student-danger-actions button,
    .student-assessment-row,
    .section-item,
    .assessment-item,
    .roster-row {
      min-height: 44px;
    }

    .mobile-score-cards {
      display: grid;
      gap: 10px;
    }

    .mobile-score-card {
      display: grid;
      gap: 8px;
      padding: 10px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--bg-2);
    }

    .mobile-student-summary {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(72px, auto);
      gap: 8px;
      align-items: center;
      width: 100%;
      min-height: 52px;
      padding: 0;
      background: transparent;
      text-align: left;
    }

    .mobile-student-summary span,
    .mobile-final-grade {
      min-width: 0;
    }

    .mobile-student-summary strong,
    .mobile-student-summary small,
    .mobile-assessment-score span,
    .mobile-assessment-score strong,
    .mobile-assessment-score small {
      display: block;
    }

    .mobile-student-summary strong {
      font-size: 16px;
    }

    .mobile-student-summary small {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .mobile-final-grade {
      text-align: right;
    }

    .mobile-final-grade strong {
      color: var(--primary);
      font-size: 20px;
      line-height: 1;
    }

    .mobile-assessment-scores {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }

    .mobile-assessment-score {
      min-width: 0;
      width: 100%;
      min-height: 70px;
      padding: 8px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--bg);
      text-align: left;
    }

    .mobile-assessment-score span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--text-2);
      font-size: 12px;
    }

    .mobile-assessment-score strong {
      margin-top: 4px;
      font-size: 18px;
    }

    .mobile-assessment-score small {
      min-height: 16px;
      font-size: 12px;
    }

    .score-grid-wrap {
      display: none;
    }

    .grading-view {
      margin-top: 0;
    }

    .grading-view > .panel-header {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
    }

    .grading-actions {
      display: grid;
      grid-template-columns: 1fr;
      justify-content: stretch;
    }

    .grading-view > .panel-header button {
      width: 100%;
    }

    .mobile-score-entry-list {
      display: grid;
      gap: 10px;
    }

    .mobile-score-entry-card {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(82px, 0.45fr) minmax(104px, 0.6fr);
      gap: 8px;
      align-items: end;
      padding: 10px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--bg-2);
    }

    .mobile-score-entry-name {
      display: grid;
      gap: 2px;
      width: 100%;
      min-height: 44px;
      padding: 0;
      background: transparent;
      text-align: left;
    }

    .mobile-score-entry-card input,
    .mobile-score-entry-card select {
      width: 100%;
      min-width: 0;
    }

    .mobile-score-entry-name strong,
    .mobile-score-entry-name small {
      display: block;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .grading-grid-wrap {
      display: none;
    }

    .student-layout,
    .student-summary,
    .student-category-list {
      gap: 10px;
    }

    .student-summary {
      padding: 10px;
    }

    .student-picker-trigger {
      min-height: 52px;
    }

    .student-picker-menu {
      position: fixed;
      inset: auto 10px 10px;
      width: auto;
      max-height: min(460px, 68vh);
      z-index: 20;
    }

    .student-picker-menu button {
      min-height: 50px;
    }

    .student-assessment-row {
      grid-column: 1 / -1;
      grid-template-columns: minmax(0, 1fr) auto;
      padding: 10px;
    }

    .backup-actions {
      grid-template-columns: 1fr;
    }

    .section-item-row {
      grid-template-columns: minmax(0, 1fr) 44px;
    }

    .section-trash-button {
      width: 44px;
      height: 44px;
    }

    input,
    select,
    button {
      font-size: 16px;
    }
  }
</style>
