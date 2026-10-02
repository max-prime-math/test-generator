<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { bank } from '../lib/bank.svelte';
  import { gradebook } from '../lib/gradebook.svelte';
  import { gradebookOverviewCsv, gradebookScoresCsv, parseGradebookBackup, stringifyGradebookBackup } from '../lib/gradebook-backup';
  import {
    compareStudents,
    assessmentScorePercent,
    assessmentTypeKey,
    GRADEBOOK_CATEGORIES,
    parseQuestionPoints,
    questionScoresAbove,
    questionScoresLostByEdit,
    savedTestFitsSection,
    studentKnownBy,
    studentListName,
    type StudentSortKey,
  } from '../lib/gradebook-model';
  import { gradePoints, gradePercent, finalGradePercent } from '../lib/gradebook-calculations';
  import { previewRosterImport } from '../lib/gradebook-roster-preview';
  import { parseGradePaste } from '../lib/gradebook-paste';
  import { parseRosterImport } from '../lib/gradebook-roster-import';
  import { testLibrary } from '../lib/test-library.svelte';
  import { testEditor } from '../lib/test-editor.svelte';
  import { CLASSES, DEMO_CLASSES } from '../lib/curriculum';
  import { customClasses } from '../lib/custom-classes.svelte';
  import { workspaceCatalog } from '../lib/workspace-catalog.svelte';
  import { mergeWorkspaceClasses, firstById } from '../lib/workspace-format';
  import { bankWorkspaces } from '../lib/bank-workspaces.svelte';
  import { bankView } from '../lib/bank-switch-view.svelte';
  import { appState } from '../lib/app-state.svelte';
  import { appSettings } from '../lib/app-settings.svelte';
  import type { GradebookAssessment, GradebookGradingMode, GradebookScoreState, GradebookSection, GradebookStudent, SavedTest, TestType } from '../lib/types';

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
    studentSort: StudentSortKey;
    assessmentDisplay: 'points' | 'percent';
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
        studentSort: parsed?.studentSort === 'first' ? 'first' : 'last',
        assessmentDisplay: parsed?.assessmentDisplay === 'percent' ? 'percent' : 'points',
      };
    } catch {
      return {
        leftRailWidth: 260,
        rightRailWidth: 340,
        leftRailVisible: true,
        rightRailVisible: true,
        studentSort: 'last',
        assessmentDisplay: 'points',
      };
    }
  }

  const initialLayout = loadLayoutPrefs();

  let allClasses = $derived(mergeWorkspaceClasses([...(appState.demoMode ? [...CLASSES, ...DEMO_CLASSES] : CLASSES), ...customClasses.catalog, ...workspaceCatalog.classes]));
  let selectedSectionId = $state('');
  let selectedAssessmentId = $state('');
  let selectedStudentId = $state('');

  let sectionName = $state('');
  let sectionClassId = $state('');
  let termLabel = $state('');

  let firstName = $state('');
  let lastName = $state('');
  let knownBy = $state('');
  let email = $state('');

  let showAllCourses = $state(false);
  let otherBankTests = $state<SavedTest[]>([]);
  $effect(() => {
    // Refresh after a bank switch or a registry change; ignore results from an older request.
    bankView.activeBankId;
    bankView.banks;
    testLibrary.tests;
    let cancelled = false;
    bankWorkspaces.readOtherBankTests().then(tests => {
      if (!cancelled) otherBankTests = tests;
    }).catch(error => console.error('Could not load other banks’ saved tests', error));
    return () => { cancelled = true; };
  });
  let gradebookTests = $derived([...firstById([...testLibrary.tests, ...otherBankTests]).values()]);
  let savedTestId = $state('');
  let administeredDate = $state(formatDateInput(Date.now()));
  let externalName = $state('');
  let externalType = $state<TestType>('test');
  let externalTotal = $state('');
  let externalQuestions = $state('');
  let externalError = $state('');
  let assessmentEditOpen = $state(false);
  /** Changing what one question is out of, from its column heading in the grading grid. */
  let pointsEdit = $state<{ assessmentId: string; questionId: string; label: string; preview: string; value: string | number; cap: boolean; error: string } | null>(null);
  let pointsInput = $state<HTMLInputElement>();
  let pointsEditKey = $derived(pointsEdit ? `${pointsEdit.assessmentId}:${pointsEdit.questionId}` : '');
  $effect(() => {
    // Focus and select the value once when the dialog opens for a question.
    if (pointsEditKey && pointsInput) untrack(() => { pointsInput!.focus(); pointsInput!.select(); });
  });
  let editName = $state('');
  let editType = $state<TestType>('test');
  let editDate = $state('');
  let editTotal = $state('');
  let editQuestions = $state('');
  let editError = $state('');
  let gradebookMode = $state<'overview' | 'grading' | 'student'>('overview');
  let expandedStudentAssessmentId = $state('');
  let studentPickerOpen = $state(false);
  let studentSearch = $state('');
  let viewportWidth = $state(window.innerWidth);
  let expandedGradingAssessmentId = $state('');
  let studentSisId = $state('');

  let rosterImportInputEl: HTMLInputElement | undefined = $state();
  let gradebookRestoreInputEl: HTMLInputElement | undefined = $state();
  let rosterImportSummary = $state('');
  let rosterPreview = $state<{ sectionId: string; filename: string; parsed: ReturnType<typeof parseRosterImport> } | null>(null);
  let rosterPreviewRows = $derived(rosterPreview ? previewRosterImport(gradebook.students, rosterPreview.parsed.students) : []);
  let rosterImportDialog = $state<HTMLDialogElement>();
  let smallPaneOpen = $state(false);
  let drawerOpener: HTMLElement | null = null;
  let detailRail = $state<HTMLElement>();
  let pasteMessage = $state('');
  $effect(() => { if (viewportWidth > 1100) smallPaneOpen = false; });
  let rosterImportWarnings = $state<string[]>([]);
  let backupStatus = $state('');
  let leftRailWidth = $state(initialLayout.leftRailWidth);
  let rightRailWidth = $state(initialLayout.rightRailWidth);
  let leftRailVisible = $state(initialLayout.leftRailVisible);
  let rightRailVisible = $state(initialLayout.rightRailVisible);
  let studentSort = $state<StudentSortKey>(initialLayout.studentSort);
  let assessmentDisplay = $state<'points' | 'percent'>(initialLayout.assessmentDisplay);
  const SUMMARY_MODES = ['Mean', 'Median', 'Minimum', 'Maximum'] as const;
  let summaryMode = $state(0);
  let summaryLabel = $derived(summaryMode === 0 ? 'Average (mean)' : SUMMARY_MODES[summaryMode]);
  let overviewSort = $state('name');
  let overviewSortDirection = $state<'asc' | 'desc'>('asc');
  /** Letters typed in the grading grid jump to the student whose name starts with them. */
  let nameSearch = $state('');
  let nameSearchMiss = $state(false);
  let nameSearchTimer: ReturnType<typeof setTimeout> | undefined;
  let foundStudentId = $state('');
  let activeGradeRowId = $state('');
  let suppressNextRailClick = false;

  let activeSections = $derived(gradebook.sections.filter((section) => !section.archivedAt && !section.trashedAt));
  let archivedSections = $derived(gradebook.sections.filter((section) => section.archivedAt && !section.trashedAt));
  let trashedSections = $derived(gradebook.sections.filter((section) => section.trashedAt));
  let selectedSection = $derived(activeSections.find((section) => section.id === selectedSectionId) ?? null);
  let sectionStudents = $derived(selectedSectionId ? gradebook.studentsForSection(selectedSectionId, { includeInactive: true, sortBy: studentSort }) : []);
  let summaryStudents = $derived(sectionStudents.filter(student => studentActiveInSection(student)));
  let filteredStudents = $derived.by(() => {
    const query = studentSearch.trim().toLocaleLowerCase();
    const sections = query ? [selectedSection, ...activeSections.filter(section => section.id !== selectedSectionId)] : [selectedSection];
    return sections.flatMap(section => section ? gradebook.studentsForSection(section.id, { includeInactive: true, sortBy: studentSort })
      .filter(student => !query || [student.firstName, student.lastName, student.knownBy ?? '', student.sisId ?? '', `${student.firstName} ${student.lastName}`, `${student.lastName}, ${student.firstName}`, `${student.knownBy ?? student.firstName} ${student.lastName}`]
        .some(value => value.toLocaleLowerCase().includes(query)))
      .map(student => ({ student, section })) : []);
  });
  let availableTests = $derived(selectedSection ? gradebookTests.filter((test) => showAllCourses || savedTestFitsSection(test, selectedSection)) : []);
  let selectedSectionCourseName = $derived(
    selectedSection?.linkedClassId
      ? allClasses.find((cls) => cls.id === selectedSection.linkedClassId)?.name ?? selectedSection.linkedClassId
      : '',
  );
  let sectionAssessments = $derived(selectedSectionId ? gradebook.assessmentsForSection(selectedSectionId) : []);
  let overviewStudents = $derived([...sectionStudents].sort((left, right) => {
    const byName = compareStudents(left, right, studentSort);
    if (overviewSort === 'name') return overviewSortDirection === 'asc' ? byName : -byName;
    const assessment = sectionAssessments.find(assessment => assessment.id === overviewSort);
    const grade = (student: GradebookStudent) => overviewSort === 'total' ? studentFinalPercent(student)
      : assessment ? gradePercent(gradebook.scoreFor(assessment.id, student.id), assessment, selectedSection) : null;
    const leftGrade = grade(left);
    const rightGrade = grade(right);
    // Unrecorded and nonnumeric states stay at the bottom in either direction.
    if (leftGrade === null && rightGrade === null) return byName;
    if (leftGrade === null) return 1;
    if (rightGrade === null) return -1;
    return (overviewSortDirection === 'asc' ? leftGrade - rightGrade : rightGrade - leftGrade) || byName;
  }));
  let selectedAssessment = $derived(sectionAssessments.find((assessment) => assessment.id === selectedAssessmentId) ?? sectionAssessments[0] ?? null);
  // An assessment without questions (an external one entered by total) can only be graded as a total.
  let gradingByQuestion = $derived(selectedAssessment?.gradingMode !== 'total' && (selectedAssessment?.questionSnapshots.length ?? 0) > 0);
  let gradeColumnCount = $derived(
    selectedAssessment ? (gradingByQuestion ? selectedAssessment.questionSnapshots.length : 1) : 0,
  );
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
    if (!savedTestId || !availableTests.some((test) => test.id === savedTestId)) {
      savedTestId = availableTests[0]?.id ?? '';
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

  // The edit panel belongs to one assessment; switching assessments or views closes it.
  let selectedAssessmentKey = $derived(selectedAssessment?.id ?? '');
  $effect(() => {
    void selectedAssessmentKey;
    void gradebookMode;
    assessmentEditOpen = false;
  });

  $effect(() => {
    try {
      localStorage.setItem(GRADEBOOK_LAYOUT_KEY, JSON.stringify({
        leftRailWidth,
        rightRailWidth,
        leftRailVisible,
        rightRailVisible,
        studentSort,
        assessmentDisplay,
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

  function createCourse(forSelectedSection = false) {
    const name = window.prompt('New class name');
    if (!name?.trim()) return;
    const existing = allClasses.find(cls => cls.name.toLowerCase() === name.trim().toLowerCase());
    const course = existing ?? customClasses.add(name, false);
    if (forSelectedSection) updateSectionCourse(course.id);
    else sectionClassId = course.id;
  }

  function editSection() {
    if (!selectedSection) return;
    const name = window.prompt('Section name', selectedSection.name);
    if (!name?.trim()) return;
    const term = window.prompt('Term label (optional)', selectedSection.termLabel ?? '');
    if (term === null) return;
    gradebook.updateSection(selectedSection.id, { name, termLabel: term });
  }

  function removeSelectedStudentFromSection() {
    if (!selectedStudent || !selectedSectionId) return;
    if (!window.confirm(`Remove ${nameOf(selectedStudent)} from ${selectedSection?.name}? Their scores in this section will be deleted. Other sections keep their records. This cannot be undone.`)) return;
    gradebook.removeStudentFromSection(selectedSectionId, selectedStudent.id);
  }

  function sectionContents(section: GradebookSection): string {
    const studentCount = gradebook.studentsForSection(section.id, { includeInactive: true }).length;
    const assessmentCount = gradebook.assessmentsForSection(section.id).length;
    return [
      `${studentCount} roster ${studentCount === 1 ? 'entry' : 'entries'}`,
      `${assessmentCount} ${assessmentCount === 1 ? 'assessment' : 'assessments'}`,
    ].join(' and ');
  }

  /** Archive keeps a finished section; Trash is for sections you mean to delete. Both can be restored. */
  function putAwaySection(section: GradebookSection, where: 'archive' | 'trash') {
    const message = where === 'archive'
      ? `Archive "${section.name}"?\n\nIt leaves the active list, and its ${sectionContents(section)} are kept. Restore it from Archived at any time.`
      : `Move "${section.name}" to the Trash?\n\nIt leaves the active list. Its ${sectionContents(section)} are kept until you delete it for good from the Trash.`;
    if (!window.confirm(message)) return;
    const id = section.id;
    if (where === 'archive') gradebook.archiveSection(id); else gradebook.trashSection(id);
    if (selectedSectionId === id) {
      selectedSectionId = activeSections.find((candidate) => candidate.id !== id)?.id ?? '';
      selectedAssessmentId = '';
      selectedStudentId = '';
      gradebookMode = 'overview';
    }
  }

  function restoreSection(section: GradebookSection) {
    gradebook.restoreSection(section.id);
    selectedSectionId = section.id;
  }

  function deleteSectionForever(section: GradebookSection) {
    if (!window.confirm(`Delete "${section.name}" for good?\n\nIts ${sectionContents(section)}, and all of their scores, will be deleted. Students in other sections keep those records. This cannot be undone.`)) return;
    gradebook.deleteSectionForever(section.id);
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
      selectedSectionId = gradebook.sections.find((section) => !section.archivedAt && !section.trashedAt)?.id ?? '';
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
      sisId: studentSisId,
      firstName,
      lastName,
      knownBy,
      email,
      sectionId: selectedSectionId,
    });
    studentSisId = '';
    firstName = '';
    lastName = '';
    knownBy = '';
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
      rosterPreview = { sectionId: selectedSectionId, filename: file.name, parsed };
      await tick();
      rosterImportDialog?.showModal();
    } catch (error) {
      rosterImportSummary = 'Roster import failed.';
      rosterImportWarnings = [error instanceof Error ? error.message : String(error)];
    } finally {
      input.value = '';
    }
  }

  function confirmRosterImport() {
    if (!rosterPreview) return;
    const { sectionId, parsed } = rosterPreview;
    // Validate again on confirmation, so intervening changes cannot bypass conflicts.
    const rows = previewRosterImport(gradebook.students, parsed.students);
    const conflicts = rows.filter(row => row.action === 'Conflict');
    const result = gradebook.importRoster(sectionId, rows.filter(row => row.action !== 'Conflict').map(row => row.student));
    rosterImportSummary = `${result.created} created · ${result.updated} updated · ${result.enrolled} enrolled${result.reactivated ? ` · ${result.reactivated} reactivated` : ''}${parsed.skippedRows + result.skipped + conflicts.length ? ` · ${parsed.skippedRows + result.skipped + conflicts.length} skipped` : ''}`;
    const sections = new Set(parsed.students.map(student => student.sourceSection).filter(Boolean));
    rosterImportWarnings = [...parsed.warnings, ...conflicts.map(row => row.detail), ...(sections.size > 1 ? [`The file included ${sections.size} source sections; imported students were enrolled in the previewed section.`] : [])];
    rosterImportDialog?.close(); rosterPreview = null;
  }

  function cancelRosterImport() { rosterImportDialog?.close(); rosterPreview = null; }

  function exportOverviewCsv() {
    if (!selectedSection) return;
    downloadTextFile(`gradebook-overview-${formatFileDate(Date.now())}.csv`, gradebookOverviewCsv(gradebook.snapshot(), selectedSectionId, {
      studentIds: overviewStudents.map(student => student.id), assessmentIds: sectionAssessments.map(assessment => assessment.id), display: assessmentDisplay,
    }), 'text/csv;charset=utf-8');
  }

  async function openSmallPane(event: MouseEvent) {
    drawerOpener = event.currentTarget as HTMLElement;
    smallPaneOpen = true;
    await tick();
    detailRail?.querySelector<HTMLButtonElement>('button')?.focus();
  }

  async function hideDetails() {
    if (viewportWidth <= 1100) { smallPaneOpen = false; await tick(); drawerOpener?.focus(); }
    else rightRailVisible = false;
  }

  function handleWindowKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      if (rosterPreview) return;
      if (pointsEdit) { event.preventDefault(); pointsEdit = null; return; }
      if (smallPaneOpen) { event.preventDefault(); hideDetails(); return; }
    }
    if (smallPaneOpen && detailRail && event.key === 'Tab') {
      const controls = Array.from(detailRail.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]')).filter(element => element.getClientRects().length);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    const inGradeCell = (event.target as HTMLElement)?.matches('[data-grade-row]');
    if (gradebookMode === 'grading' && (inGradeCell || !(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)) && (event.ctrlKey || event.metaKey)) {
      const key = event.key.toLowerCase();
      if (key === 'z' || key === 'y') {
        event.preventDefault();
        if (key === 'y' || event.shiftKey) gradebook.redoScoreEdit(); else gradebook.undoScoreEdit();
      }
    }
  }

  function handleGradePaste(event: ClipboardEvent, rowIndex: number, columnIndex: number, questionMode = gradingByQuestion) {
    const text = event.clipboardData?.getData('text/plain');
    if (text === undefined || !selectedAssessment) return;
    event.preventDefault();
    try {
      const cells = parseGradePaste(text, questionMode);
      const columns = questionMode ? selectedAssessment.questionSnapshots.length : 1;
      if (rowIndex + cells.length > sectionStudents.length || cells.some(row => columnIndex + row.length > columns)) throw new Error('The pasted block extends beyond the score grid. Choose a starting cell with enough rows and score columns.');
      gradebook.beginScoreBatch();
      for (const [rowOffset, row] of cells.entries()) for (const [columnOffset, cell] of row.entries()) {
        const student = sectionStudents[rowIndex + rowOffset];
        if (questionMode) gradebook.updateQuestionScore({ sectionId: selectedSectionId, assessmentId: selectedAssessment.id, studentId: student.id, questionId: selectedAssessment.questionSnapshots[columnIndex + columnOffset].questionId, points: cell.points });
        else gradebook.updateScore({ sectionId: selectedSectionId, assessmentId: selectedAssessment.id, studentId: student.id, ...cell });
      }
      gradebook.finishScoreBatch(); gradebook.flush();
      pasteMessage = `Pasted ${cells.reduce((count, row) => count + row.length, 0)} scores. Undo reverses the whole paste.`;
    } catch (error) { pasteMessage = error instanceof Error ? error.message : String(error); }
  }

  function addAssessment() {
    if (!selectedSectionId || !savedTestId) return;
    const savedTest = availableTests.find(test => test.id === savedTestId);
    if (!savedTest) return;
    const assessment = gradebook.createAssessmentFromSavedTest(savedTest, bank.questions, selectedSectionId, {
      administeredAt: parseDateInput(administeredDate),
    });
    selectedAssessmentId = assessment.id;
    gradebookMode = 'grading';
  }

  function addExternalAssessment() {
    if (!selectedSectionId) return;
    const questionPoints = externalQuestions.trim() ? parseQuestionPoints(externalQuestions) : [];
    const total = Number(externalTotal);
    if (!externalName.trim()) externalError = 'Name the assessment.';
    else if (!questionPoints) externalError = 'Question marks must be positive numbers, like 2, 2, 3, 5.';
    else if (questionPoints.length === 0 && !(Number.isFinite(total) && total > 0)) externalError = 'Enter what the assessment is out of.';
    else externalError = '';
    if (externalError || !questionPoints) return;
    const assessment = gradebook.addExternalAssessment({
      sectionId: selectedSectionId,
      name: externalName,
      testType: externalType,
      totalPoints: total,
      questionPoints,
      administeredAt: parseDateInput(administeredDate),
    });
    externalName = '';
    externalTotal = '';
    externalQuestions = '';
    selectedAssessmentId = assessment.id;
    gradebookMode = 'grading';
  }

  function openAssessmentEdit(assessment: GradebookAssessment) {
    editName = assessment.savedTestName;
    editType = assessmentTypeKey(assessment.testType);
    editDate = formatDateInput(assessment.administeredAt);
    editTotal = String(assessment.totalPoints);
    editQuestions = assessment.questionSnapshots.map((snapshot) => formatPoints(snapshot.points)).join(', ');
    editError = '';
    assessmentEditOpen = true;
  }

  function saveAssessmentEdit(assessment: GradebookAssessment) {
    if (!editName.trim()) {
      editError = 'The assessment needs a name.';
      return;
    }
    const edit: Parameters<typeof gradebook.updateAssessment>[1] = {
      name: editName,
      testType: editType,
      administeredAt: parseDateInput(editDate),
    };
    if (assessment.source === 'external') {
      const questionPoints = editQuestions.trim() ? parseQuestionPoints(editQuestions) : [];
      const total = Number(editTotal);
      if (!questionPoints) {
        editError = 'Question marks must be positive numbers, like 2, 2, 3, 5.';
        return;
      }
      if (questionPoints.length === 0 && !(Number.isFinite(total) && total > 0)) {
        editError = 'Enter what the assessment is out of.';
        return;
      }
      const lost = questionScoresLostByEdit(gradebook.data, assessment.id, questionPoints);
      const who = `${lost} ${lost === 1 ? 'student has' : 'students have'}`;
      const consequence = questionPoints.length === 0
        ? `${who} question-by-question scores. Their totals are kept, but the question detail will be deleted.`
        : `${who} scores on questions this removes. Those question scores will be deleted and their totals re-added from the questions that remain.`;
      if (lost > 0 && !window.confirm(`${consequence}\n\nSave changes?`)) return;
      edit.questionPoints = questionPoints;
      edit.totalPoints = total;
    }
    gradebook.updateAssessment(assessment.id, edit);
    assessmentEditOpen = false;
  }

  function openPointsEdit(assessment: GradebookAssessment, snapshot: GradebookAssessment['questionSnapshots'][number]) {
    pointsEdit = { assessmentId: assessment.id, questionId: snapshot.questionId, label: snapshot.label, preview: snapshot.bodyPreview ?? '',
      value: formatPoints(snapshot.points), cap: true, error: '' };
  }

  /** The new value typed in the dialog, or null while it is not a number of zero or more. */
  function pointsEditValue(): number | null {
    // A number input's bound value is a number, or '' while empty.
    const raw = String(pointsEdit?.value ?? '').trim();
    const value = Number(raw);
    return raw !== '' && Number.isFinite(value) && value >= 0 ? value : null;
  }

  /** From a saved test, the test can change too; an external assessment has no test. */
  const hasSavedTest = (assessment: GradebookAssessment) => assessment.source !== 'external' && !!assessment.savedTestId;

  function savePointsEdit(assessment: GradebookAssessment, alsoTest: boolean) {
    if (!pointsEdit) return;
    const points = pointsEditValue();
    if (points === null) { pointsEdit.error = 'Enter what the question is out of: 0 or more.'; return; }
    const { questionId, label } = pointsEdit;
    const above = questionScoresAbove(gradebook.data, assessment.id, questionId, points);
    gradebook.setQuestionPoints(assessment.id, questionId, points, { capScores: above > 0 && pointsEdit.cap });
    const problem = alsoTest ? testEditor.setSavedTestQuestionPoints(assessment.savedTestId, questionId, points) : '';
    pointsEdit = null;
    const where = alsoTest && !problem ? `in the Gradebook and in “${testLibrary.get(assessment.savedTestId)?.name ?? assessment.savedTestName}”` : 'in the Gradebook';
    appState.showNotice(problem || `Question ${label} is now out of ${formatPoints(points)} ${where}.`, problem ? 8000 : 5000);
  }

  function removeAssessment(assessment: GradebookAssessment) {
    const scored = gradebook.scores.filter((score) =>
      score.assessmentId === assessment.id && (score.points !== null || score.state !== 'normal')
    ).length;
    const detail = scored > 0
      ? `This deletes ${scored} recorded ${scored === 1 ? 'score' : 'scores'} and cannot be undone.`
      : 'No scores have been recorded for it.';
    if (!window.confirm(`Remove "${assessment.savedTestName}" from this Gradebook section?\n\n${detail}`)) return;
    gradebook.deleteAssessment(assessment.id);
    selectedAssessmentId = '';
    gradebookMode = 'overview';
  }

  function updateScore(studentId: string, assessment: GradebookAssessment, pointsValue: string, state: GradebookScoreState) {
    gradebook.endScoreEdit();
    const parsed = pointsValue.trim() === '' ? null : Number(pointsValue);
    gradebook.updateScore({
      sectionId: assessment.sectionId,
      assessmentId: assessment.id,
      studentId,
      points: Number.isFinite(parsed) ? parsed : null,
      state,
    });
    gradebook.endScoreEdit();
  }

  /** Total-only entry: typing a number records a normal score, even over Missing/Excused. */
  function updateTotalScore(studentId: string, assessment: GradebookAssessment, value: string, commit: boolean) {
    const parsed = parseGradeInput(value, commit);
    if (parsed === undefined) return;
    gradebook.updateScore({
      sectionId: assessment.sectionId,
      assessmentId: assessment.id,
      studentId,
      points: parsed ?? null,
      state: 'normal',
    });
  }

  function setGradingMode(assessment: GradebookAssessment, mode: GradebookGradingMode) {
    if ((assessment.gradingMode ?? 'questions') === mode) return;
    if (mode === 'questions') {
      const totalsOnly = sectionStudents.filter((student) => {
        const score = gradebook.scoreFor(assessment.id, student.id);
        return score?.state === 'normal' && score.points !== null && !score.questionScores?.some((entry) => entry.points !== null);
      }).length;
      if (totalsOnly > 0 && !window.confirm(
        `${totalsOnly} ${totalsOnly === 1 ? 'student has a total' : 'students have totals'} without question scores. `
        + 'Their totals stay until you enter a question score for them, which replaces the total with the sum of their question scores.\n\nGrade by question?',
      )) return;
    }
    gradebook.setAssessmentGradingMode(assessment.id, mode);
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

  function studentFinalGrade(student: GradebookStudent): { primary: string } {
    const percent = studentFinalPercent(student);
    return { primary: percent === null ? '-' : `${roundGrade(percent)}%` };
  }

  function studentFinalPercent(student: GradebookStudent): number | null {
    return selectedSection ? finalGradePercent(selectedSection, sectionAssessments, id => gradebook.scoreFor(id, student.id)) : null;
  }

  function overviewScore(studentId: string, assessment: GradebookAssessment): string {
    const score = gradebook.scoreFor(assessment.id, studentId);
    if (score && score.state !== 'normal') return stateLabel(score.state);
    return (assessmentDisplay === 'percent' ? percentDisplay(studentId, assessment) : scoreDisplay(studentId, assessment)) || '-';
  }

  function cycleSummary() {
    summaryMode = (summaryMode + 1) % SUMMARY_MODES.length;
  }

  function summarize(values: Array<number | null>, percent = false): string {
    const numbers = values.filter((value): value is number => value !== null && Number.isFinite(value)).sort((a, b) => a - b);
    if (!numbers.length) return '-';
    const middle = Math.floor(numbers.length / 2);
    const value = summaryMode === 0 ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length
      : summaryMode === 1 ? (numbers[middle] + numbers[Math.ceil(numbers.length / 2) - 1]) / 2
      : summaryMode === 2 ? numbers[0] : numbers[numbers.length - 1];
    return `${roundGrade(value)}${percent ? '%' : ''}`;
  }

  function assessmentSummary(assessment: GradebookAssessment): string {
    return summarize(summaryStudents.map(student => {
      const score = gradebook.scoreFor(assessment.id, student.id);
      return assessmentDisplay === 'percent' ? gradePercent(score, assessment, selectedSection) : gradePoints(score, selectedSection);
    }), assessmentDisplay === 'percent');
  }

  function finalSummary(): string {
    return summarize(summaryStudents.map(studentFinalPercent), true);
  }

  function sortOverview(column: string) {
    if (overviewSort === column) overviewSortDirection = overviewSortDirection === 'asc' ? 'desc' : 'asc';
    else { overviewSort = column; overviewSortDirection = column === 'name' ? 'asc' : 'desc'; }
  }

  function overviewAriaSort(column: string): 'none' | 'ascending' | 'descending' {
    return overviewSort !== column ? 'none' : overviewSortDirection === 'asc' ? 'ascending' : 'descending';
  }

  function overviewSortIndicator(column: string): string {
    return overviewSort !== column ? '' : overviewSortDirection === 'asc' ? ' ↑' : ' ↓';
  }

  function searchClassName(section: GradebookSection): string {
    return allClasses.find(course => course.id === section.linkedClassId)?.name ?? section.name;
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
      const points = gradePoints(score, selectedSection);
      if (points === null || assessment.totalPoints <= 0) continue;
      earned += points;
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
    if (parsed === undefined) return;
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

  function chooseGradingAssessment(assessmentId: string) {
    expandedGradingAssessmentId = selectedAssessment?.id === assessmentId && expandedGradingAssessmentId !== assessmentId ? assessmentId : '';
    selectedAssessmentId = assessmentId;
    assessmentEditOpen = false;
    gradebookMode = 'grading';
  }

  function openStudentView(studentId: string) {
    selectedStudentId = studentId;
    expandedStudentAssessmentId = '';
    studentPickerOpen = false;
    gradebookMode = 'student';
  }

  function selectStudentInStudentView(studentId: string, sectionId = selectedSectionId) {
    selectedSectionId = sectionId;
    selectedStudentId = studentId;
    expandedStudentAssessmentId = '';
    studentPickerOpen = false;
  }

  function studentActiveInSection(student: GradebookStudent, sectionId = selectedSectionId): boolean {
    return student.active && gradebook.enrollments.some(entry => entry.sectionId === sectionId && entry.studentId === student.id && entry.active);
  }

  function updateSelectedStudent(input: Partial<Pick<GradebookStudent, 'sisId' | 'firstName' | 'lastName' | 'knownBy' | 'email' | 'active'>>) {
    if (!selectedStudent) return;
    gradebook.updateStudent(selectedStudent.id, input);
  }

  function archiveSelectedStudentInSection() {
    if (!selectedStudent || !selectedSectionId) return;
    if (!window.confirm(`Archive ${nameOf(selectedStudent)} in this section? Existing scores will stay in the gradebook.`)) return;
    gradebook.setEnrollmentActive(selectedSectionId, selectedStudent.id, false);
  }

  function deleteSelectedStudent() {
    if (!selectedStudent) return;
    const hasScores = gradebook.scores.some((score) => score.studentId === selectedStudent.id);
    const warning = hasScores
      ? `Delete ${nameOf(selectedStudent)} and all of their scores from every section in this gradebook? This cannot be undone.`
      : `Delete ${nameOf(selectedStudent)} from every section in this gradebook? This cannot be undone.`;
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

  /** Tab past the last question wraps to the next student's first question (Shift+Tab goes back), and around the grid. */
  function focusCyclingGradeCell(rowIndex: number, columnIndex: number, step: 1 | -1) {
    const columns = gradeColumnCount;
    const cells = columns * sectionStudents.length;
    if (cells === 0) return;
    const next = (rowIndex * columns + columnIndex + step + cells) % cells;
    focusGradeCell(Math.floor(next / columns), next % columns);
  }

  function focusRelativeGradeCell(rowIndex: number, columnIndex: number, rowDelta: number, columnDelta: number) {
    const maxRow = sectionStudents.length - 1;
    const maxColumn = gradeColumnCount - 1;
    const nextRow = Math.min(maxRow, Math.max(0, rowIndex + rowDelta));
    const nextColumn = Math.min(maxColumn, Math.max(0, columnIndex + columnDelta));
    focusGradeCell(nextRow, nextColumn);
  }

  function nameOf(student: GradebookStudent): string {
    return studentListName(student, appSettings.gradebookNameOrder);
  }

  function updateSectionCourse(classId: string) {
    if (!selectedSection) return;
    gradebook.updateSection(selectedSection.id, { linkedClassId: classId || null });
  }

  function searchKey(value: string): string {
    return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  }

  function findStudentIndexByName(query: string): number {
    const q = searchKey(query);
    const candidates = sectionStudents.map((student) => ({
      shown: searchKey(nameOf(student)),
      first: searchKey(studentKnownBy(student)),
      legalFirst: searchKey(student.firstName),
      last: searchKey(student.lastName),
    }));
    const tests: Array<(entry: typeof candidates[number]) => boolean> = [
      (entry) => entry.shown.startsWith(q),
      (entry) => entry.first.startsWith(q) || entry.last.startsWith(q) || entry.legalFirst.startsWith(q),
      (entry) => entry.shown.split(/[\s,'-]+/).some((word) => word.startsWith(q)),
    ];
    for (const test of tests) {
      const index = candidates.findIndex(test);
      if (index >= 0) return index;
    }
    return -1;
  }

  function clearNameSearch() {
    clearTimeout(nameSearchTimer);
    nameSearch = '';
    nameSearchMiss = false;
  }

  /** Letters (and spaces after the first letter) search names instead of going into a grade cell. */
  function handleNameSearchKey(event: KeyboardEvent): boolean {
    if (event.ctrlKey || event.metaKey || event.altKey || event.key.length !== 1) return false;
    const isLetter = /\p{L}/u.test(event.key);
    if (!isLetter && !(nameSearch && /[\s'-]/.test(event.key))) return false;
    event.preventDefault();
    nameSearch += event.key;
    clearTimeout(nameSearchTimer);
    nameSearchTimer = setTimeout(clearNameSearch, 1500);
    const index = findStudentIndexByName(nameSearch.trim());
    nameSearchMiss = index < 0;
    if (index < 0) return true;
    foundStudentId = sectionStudents[index].id;
    focusGradeCell(index, 0);
    return true;
  }

  function handleGradeCellFocus(event: FocusEvent & { currentTarget: HTMLInputElement }, studentId: string) {
    event.currentTarget.select();
    activeGradeRowId = studentId;
    if (foundStudentId && foundStudentId !== studentId) foundStudentId = '';
  }

  function handleGradeCellKeydown(event: KeyboardEvent, rowIndex: number, columnIndex: number) {
    if (event.ctrlKey || event.metaKey) return;
    if (handleNameSearchKey(event)) return;
    // Any other key (a grade, a move, Escape) ends the name search.
    if (nameSearch) clearNameSearch();
    if (event.key === 'Escape') return;
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
        focusCyclingGradeCell(rowIndex, columnIndex, event.shiftKey ? -1 : 1);
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

{#snippet rosterPanel()}
        <section class="panel roster-panel">
          <div class="panel-header">
            <div>
              <h2>Add Students</h2>
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
            <input bind:value={knownBy} placeholder="Known by" aria-label="Known by" />
            <input bind:value={studentSisId} placeholder="Student ID" aria-label="Student ID" />
            <input bind:value={email} placeholder="Email" aria-label="Email" type="email" />
            <button class="primary" type="submit">Add Student</button>
          </form>
          <p class="roster-hint">Select a student in the score grid to edit their details or active status.</p>
        </section>
{/snippet}

{#if rosterPreview}
  <dialog bind:this={rosterImportDialog} class="roster-preview-dialog" aria-labelledby="roster-preview-title" oncancel={(e) => { e.preventDefault(); cancelRosterImport(); }}>
    <h2 id="roster-preview-title">Review roster import</h2>
    <p>{rosterPreview.filename} → {gradebook.sections.find(section => section.id === rosterPreview?.sectionId)?.name}</p>
    <p>{rosterPreviewRows.filter(row => row.action === 'Add').length} to add · {rosterPreviewRows.filter(row => row.action === 'Update').length} to update · {rosterPreviewRows.filter(row => row.action === 'Conflict').length} conflicts</p>
    <p>Conflicting rows will be skipped. Correct their IDs or names in the source file before reimporting.</p>
    {#each rosterPreview.parsed.warnings as warning}<p>{warning}</p>{/each}
    <div class="roster-preview-scroll"><table>
      <thead><tr><th>Student</th><th>Student ID</th><th>Email</th><th>Action</th><th>Details</th></tr></thead>
      <tbody>{#each rosterPreviewRows as row}<tr class:danger-text={row.action === 'Conflict'}><td>{row.student.displayName}</td><td>{row.student.sisId ?? '-'}</td><td>{row.student.email ?? '-'}</td><td>{row.action}</td><td>{row.detail}</td></tr>{/each}</tbody>
    </table></div>
    <div class="preview-actions"><button class="ghost" onclick={cancelRosterImport}>Cancel</button><button class="primary" onclick={confirmRosterImport} disabled={!rosterPreviewRows.some(row => row.action !== 'Conflict')}>Import {rosterPreviewRows.filter(row => row.action !== 'Conflict').length} students</button></div>
  </dialog>
{/if}

<svelte:window bind:innerWidth={viewportWidth} onkeydown={handleWindowKeydown} />

<div
  class="gradebook"
  class:left-rail-hidden={!leftRailVisible}
  class:right-rail-hidden={!rightRailVisible}
  style:--left-rail-width={`${leftRailVisible ? leftRailWidth : 0}px`}
  style:--right-rail-width={`${rightRailVisible ? rightRailWidth : 0}px`}
>
  {#if leftRailVisible}
  <aside class="section-rail" inert={smallPaneOpen && viewportWidth <= 1100}>
    <div class="rail-header">
      <div>
        <h2>Gradebook</h2>
        <span>
          {activeSections.length} active
          {#if archivedSections.length > 0}
            · {archivedSections.length} archived
          {/if}
          {#if trashedSections.length > 0}
            · {trashedSections.length} in Trash
          {/if}
        </span>
      </div>
      <button class="rail-toggle" onclick={() => (leftRailVisible = false)} title="Hide sections">‹</button>
    </div>

    <form class="compact-form" onsubmit={(e) => { e.preventDefault(); createSection(); }}>
      <input bind:value={sectionName} placeholder="Period 2 AP Calc" aria-label="Section name" required />
      <select bind:value={sectionClassId} aria-label="Course">
        <option value="">No course</option>
        {#each allClasses as cls (cls.id)}
          <option value={cls.id}>{cls.name}</option>
        {/each}
      </select>
      <button class="ghost small" type="button" onclick={() => createCourse()}>＋ New class</button>
      <input bind:value={termLabel} placeholder="Term label" aria-label="Term label" />
      <button class="primary" type="submit">Add Section</button>
    </form>

    <div class="section-list">
      {#if activeSections.length === 0}
        <p class="empty">Create a course section to start a local roster.</p>
      {:else}
        {#each activeSections as section (section.id)}
          {@const linkedClass = allClasses.find((cls) => cls.id === section.linkedClassId)}
          <button
            class="section-item"
            class:active={section.id === selectedSectionId}
            onclick={() => (selectedSectionId = section.id)}
            title={section.name}
          >
            <span>{section.name}</span>
            <small>{section.termLabel || linkedClass?.name || 'Roster section'}</small>
          </button>
        {/each}
      {/if}
    </div>

    {#if archivedSections.length > 0}
      <details class="section-trash">
        <summary>Archived ({archivedSections.length})</summary>
        <div class="section-list">
          {#each archivedSections as section (section.id)}
            <div class="archived-section-item">
              <div>
                <span>{section.name}</span>
                <small>{section.termLabel || 'Archived section'}</small>
              </div>
              <button class="ghost small" onclick={() => restoreSection(section)}>Restore</button>
            </div>
          {/each}
        </div>
      </details>
    {/if}
    {#if trashedSections.length > 0}
      <details class="section-trash">
        <summary>Trash ({trashedSections.length})</summary>
        <div class="section-list">
          {#each trashedSections as section (section.id)}
            <div class="archived-section-item">
              <div>
                <span>{section.name}</span>
                <small>{section.termLabel || 'In the Trash'}</small>
              </div>
              <button class="ghost small" onclick={() => restoreSection(section)}>Restore</button>
              <button class="ghost small danger-text" onclick={() => deleteSectionForever(section)} aria-label={`Delete ${section.name} for good`}>Delete</button>
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

  <section class="work-area" inert={smallPaneOpen && viewportWidth <= 1100}>
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
        <p>Sections, rosters, assessments, and scores are shared across question banks.</p>
      </div>
    {:else}
      <div class="section-header">
        <div>
          <h1>{selectedSection.name}</h1>
          <button class="ghost small" onclick={editSection}>Edit section</button>
          <p class="section-meta">
            <span>{selectedSection.termLabel || 'No term label'}</span>
            <span aria-hidden="true">·</span>
            <select
              class="section-course-select"
              value={selectedSection.linkedClassId ?? ''}
              onchange={(e) => updateSectionCourse(e.currentTarget.value)}
              aria-label="Course for this section"
              title="Default course filter for saved tests"
            >
              <option value="">No course</option>
              {#each allClasses as cls (cls.id)}
                <option value={cls.id}>{cls.name}</option>
              {/each}
              {#if selectedSection.linkedClassId && !allClasses.some((cls) => cls.id === selectedSection.linkedClassId)}
                <option value={selectedSection.linkedClassId}>{selectedSection.linkedClassId}</option>
              {/if}
            </select>
            <button class="ghost small" onclick={() => createCourse(true)}>＋ New class</button>
          </p>
        </div>
        <div class="header-stat">
          <strong>{sectionStudents.filter(student => studentActiveInSection(student)).length}</strong>
          <span>active students</span>
        </div>
        <div class="header-stat">
          <strong>{sectionAssessments.length}</strong>
          <span>assessments</span>
        </div>
      </div>

      {#if viewportWidth <= 1100}<button class="ghost small drawer-open" onclick={openSmallPane}>{gradebookMode === 'overview' ? 'Roster & section' : gradebookMode === 'grading' ? 'Assessments' : 'Student details'}</button>{/if}
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
            <h2>Assessments</h2>
            <span>{sectionAssessments.length} saved snapshots</span>
          </div>
          <form class="assessment-form" onsubmit={(e) => { e.preventDefault(); addAssessment(); }}>
            <select bind:value={savedTestId} disabled={availableTests.length === 0} aria-label="Saved test">
              {#if availableTests.length === 0}
                <option value="">{!showAllCourses && selectedSectionCourseName ? `No saved ${selectedSectionCourseName} tests` : 'No saved tests'}</option>
              {:else}
                {#each availableTests as test (test.id)}
                  <option value={test.id}>{test.name}</option>
                {/each}
              {/if}
            </select>
            <input type="date" bind:value={administeredDate} aria-label="Administered date" />
            <button class="primary" type="submit" disabled={!savedTestId}>Add to Gradebook</button>
          </form>
          <label class="toggle-row">
            <input type="checkbox" bind:checked={showAllCourses} /> Show tests from all courses
          </label>
          <small class="assessment-scope">
            {!showAllCourses && selectedSectionCourseName
              ? `Showing saved tests from ${selectedSectionCourseName}.`
              : 'Showing saved tests from all courses and banks.'}
          </small>
          <details class="external-assessment">
            <summary>Add an external assessment</summary>
            <form class="external-form" onsubmit={(e) => { e.preventDefault(); addExternalAssessment(); }}>
              <input bind:value={externalName} placeholder="Name, e.g. Unit 3 Lab" aria-label="External assessment name" />
              <select bind:value={externalType} aria-label="External assessment category">
                {#each GRADEBOOK_CATEGORIES as category}
                  <option value={category}>{categoryLabel(category)}</option>
                {/each}
              </select>
              <input
                type="number"
                min="0"
                step="any"
                bind:value={externalTotal}
                placeholder="Out of"
                aria-label="Out of"
                disabled={externalQuestions.trim() !== ''}
                title={externalQuestions.trim() ? 'The total is the sum of the question marks' : ''}
              />
              <input
                bind:value={externalQuestions}
                placeholder="Question marks (optional): 2, 2, 3, 5"
                aria-label="Question marks"
                title="List each question's marks to grade by question"
              />
              <button class="primary" type="submit">Add External</button>
            </form>
            <small class="assessment-scope">
              Uses the date above. Without question marks it is graded as a total only.
            </small>
            {#if externalError}
              <small class="external-error" role="alert">{externalError}</small>
            {/if}
          </details>
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
                  <small>{assessment.source === 'external' ? 'External · ' : ''}{categoryLabel(assessmentTypeKey(assessment.testType))} · {assessmentTotalLabel(assessment)} · {formatDate(assessment.administeredAt)}</small>
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
          <label class="missing-policy"><span>Missing grades</span><select aria-label="Missing grades" value={selectedSection.missingGradePolicy ?? 'exclude'} onchange={(e) => selectedSection && gradebook.updateSection(selectedSection.id, { missingGradePolicy: e.currentTarget.value as 'exclude' | 'zero' })}><option value="exclude">Exclude from totals</option><option value="zero">Count as zero</option></select></label>
          <p class="roster-hint">Ungraded, Excused, Absent, and Incomplete grades are excluded. Only Missing follows this setting.</p>
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
<h2>Score Grid</h2><button class="ghost small" onclick={exportOverviewCsv}>Export Overview CSV</button>
          <div class="sort-toggle" role="group" aria-label="Assessment score display">
            <span>Show</span>
            <button class:active={assessmentDisplay === 'points'} aria-pressed={assessmentDisplay === 'points'} onclick={() => (assessmentDisplay = 'points')}>Points</button>
            <button class:active={assessmentDisplay === 'percent'} aria-pressed={assessmentDisplay === 'percent'} onclick={() => (assessmentDisplay = 'percent')}>Percentage</button>
          </div>
        </div>
        <div class="mobile-score-cards">
          {#if sectionStudents.length === 0}
            <p class="empty">No roster entries.</p>
          {:else}
            {#each overviewStudents as student (student.id)}
              {@const finalGrade = studentFinalGrade(student)}
              <article class="mobile-score-card" class:inactive={!studentActiveInSection(student)}>
                <button class="mobile-student-summary" onclick={() => openStudentView(student.id)}>
                  <span>
                    <strong>{nameOf(student)}</strong>
                  </span>
                  <span class="mobile-final-grade">
                    <strong>{finalGrade.primary}</strong>
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
                        <strong>{overviewScore(student.id, assessment)}</strong>
                      </button>
                    {/each}
                  </div>
                {/if}
              </article>
            {/each}
          {/if}
          <article class="mobile-score-card class-summary">
            <button class="mobile-student-summary" onclick={cycleSummary}>
              <strong>{summaryLabel}</strong><strong>{finalSummary()}</strong>
            </button>
            <div class="mobile-assessment-scores">
              {#each sectionAssessments as assessment (assessment.id)}
                <button class="mobile-assessment-score" onclick={cycleSummary}>
                  <span>{assessment.savedTestName}</span><strong>{assessmentSummary(assessment)}</strong>
                </button>
              {/each}
            </div>
          </article>
        </div>
        <div class="score-grid-wrap">
          <table class="score-grid">
            <thead>
              <tr>
                <th aria-sort={overviewAriaSort('name')}><button class="overview-column" onclick={() => sortOverview('name')} title="Sort by student name">Student{overviewSortIndicator('name')}</button></th>
                {#each sectionAssessments as assessment (assessment.id)}
                  <th aria-sort={overviewAriaSort(assessment.id)} title={assessment.savedTestName}><button class="overview-column" onclick={() => sortOverview(assessment.id)}>{assessment.savedTestName}{overviewSortIndicator(assessment.id)}</button></th>
                {/each}
                <th aria-sort={overviewAriaSort('total')}><button class="overview-column" onclick={() => sortOverview('total')} title="Sort by final grade">Total{overviewSortIndicator('total')}</button></th>
              </tr>
            </thead>
            <tbody>
              {#if sectionStudents.length === 0}
                <tr><td colspan={sectionAssessments.length + 2}>No roster entries.</td></tr>
              {:else}
                {#each overviewStudents as student (student.id)}
                  {@const finalGrade = studentFinalGrade(student)}
                  <tr class:inactive={!studentActiveInSection(student)}>
                    <th>
                      <button class="student-table-link" onclick={() => openStudentView(student.id)}>
                        {nameOf(student)}
                      </button>
                    </th>
                    {#each sectionAssessments as assessment (assessment.id)}
                      <td>
                        <button class="score-cell" onclick={() => { selectedAssessmentId = assessment.id; gradebookMode = 'grading'; }}>
                          <span>{overviewScore(student.id, assessment)}</span>
                        </button>
                      </td>
                    {/each}
                    <td class="total-cell">
                      <button class="student-total-link" onclick={() => openStudentView(student.id)}>
                        <span>{finalGrade.primary}</span>
                          </button>
                    </td>
                  </tr>
                {/each}
              {/if}
            </tbody>
            <tfoot>
              <tr class="class-summary" title="Grades included in totals for active students; click to change summary">
                <th scope="row"><button class="summary-cell" onclick={cycleSummary}>{summaryLabel}</button></th>
                {#each sectionAssessments as assessment (assessment.id)}
                  <td><button class="summary-cell" onclick={cycleSummary} aria-label={`${summaryLabel} for ${assessment.savedTestName}; change summary`}>{assessmentSummary(assessment)}</button></td>
                {/each}
                <td><button class="summary-cell" onclick={cycleSummary} aria-label={`${summaryLabel} final grade; change summary`}>{finalSummary()}</button></td>
              </tr>
            </tfoot>
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
              {#if nameSearch}
                <span class="name-search" class:miss={nameSearchMiss} aria-live="polite">
                  Find: {nameSearch}{nameSearchMiss ? ' · no match' : ''}
                </span>
              {/if}
              <div class="sort-toggle" role="group" aria-label="Record scores">
                <span>Entry</span>
                <button
                  class:active={gradingByQuestion}
                  aria-pressed={gradingByQuestion}
                  title={selectedAssessment.questionSnapshots.length > 0 ? 'Record a score for each question' : 'This assessment has no questions to grade'}
                  disabled={selectedAssessment.questionSnapshots.length === 0}
                  onclick={() => setGradingMode(selectedAssessment, 'questions')}
                >By question</button>
                <button
                  class:active={!gradingByQuestion}
                  aria-pressed={!gradingByQuestion}
                  title="Record one total score per student"
                  onclick={() => setGradingMode(selectedAssessment, 'total')}
                >Total only</button>
              </div>
              <div class="sort-toggle" role="group" aria-label="Sort students by">
                <span>Sort</span>
                <button class:active={studentSort === 'first'} aria-pressed={studentSort === 'first'} onclick={() => (studentSort = 'first')}>First</button>
                <button class:active={studentSort === 'last'} aria-pressed={studentSort === 'last'} onclick={() => (studentSort = 'last')}>Last</button>
              </div>
              <button
                class="ghost"
                aria-expanded={assessmentEditOpen}
                onclick={() => (assessmentEditOpen ? (assessmentEditOpen = false) : openAssessmentEdit(selectedAssessment))}
              >Edit</button>
              <button class="ghost" onclick={() => (gradebookMode = 'overview')}>Back to Overview</button>
            </div>
          </div>
          {#if assessmentEditOpen}
            {@const external = selectedAssessment.source === 'external'}
            <form class="assessment-edit" onsubmit={(e) => { e.preventDefault(); saveAssessmentEdit(selectedAssessment); }}>
              <label class="wide">
                <span>Name</span>
                <input bind:value={editName} />
              </label>
              <label>
                <span>Category</span>
                <select bind:value={editType}>
                  {#each GRADEBOOK_CATEGORIES as category}
                    <option value={category}>{categoryLabel(category)}</option>
                  {/each}
                </select>
              </label>
              <label>
                <span>Date</span>
                <input type="date" bind:value={editDate} />
              </label>
              {#if external}
                <label>
                  <span>Out of</span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    bind:value={editTotal}
                    disabled={editQuestions.trim() !== ''}
                    title={editQuestions.trim() ? 'The total is the sum of the question marks' : ''}
                  />
                </label>
                <label class="wide">
                  <span>Question marks (optional)</span>
                  <input bind:value={editQuestions} placeholder="2, 2, 3, 5" />
                </label>
              {:else}
                <small class="wide edit-note">
                  Question marks come from the saved test and stay frozen so past grades don't change.
                  Changing the saved test's type in Build also updates this category.
                </small>
              {/if}
              {#if editError}
                <small class="wide external-error" role="alert">{editError}</small>
              {/if}
              <div class="wide edit-actions">
                <button class="ghost danger-text" type="button" onclick={() => removeAssessment(selectedAssessment)}>Remove from Gradebook</button>
                <span></span>
                <button class="ghost" type="button" onclick={() => (assessmentEditOpen = false)}>Cancel</button>
                <button class="primary" type="submit">Save</button>
              </div>
            </form>
          {/if}
          <div class="score-history" role="group" aria-label="Score edit history">
            <button class="ghost small" onclick={() => gradebook.undoScoreEdit()} disabled={!gradebook.canUndo}>Undo</button>
            <button class="ghost small" onclick={() => gradebook.redoScoreEdit()} disabled={!gradebook.canRedo}>Redo</button>
            <small>Paste a column or block of point scores into the grid.</small>
          </div>
          {#if pasteMessage}<p role="status" class="paste-message">{pasteMessage}</p>{/if}
          <div class="mobile-score-entry-list">
            {#if sectionStudents.length === 0}
              <p class="empty">No roster entries.</p>
            {:else}
              {#each sectionStudents as student, studentIndex (student.id)}
                <div class="mobile-score-entry-card" class:inactive={!studentActiveInSection(student)}>
                  <button class="mobile-score-entry-name" onclick={() => openStudentView(student.id)}>
                    <strong>{nameOf(student)}</strong>
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
                      aria-label="Score for {nameOf(student)}"
                      onfocus={() => gradebook.endScoreEdit()}
                      onblur={() => gradebook.endScoreEdit()}
                      onpaste={(e) => handleGradePaste(e, studentIndex, 0, false)}
                      onchange={(e) => updateScore(student.id, selectedAssessment, e.currentTarget.value, scoreState(student.id, selectedAssessment))}
                    />
                  </label>
                  <label>
                    <span>State</span>
                    <select
                      value={scoreState(student.id, selectedAssessment)}
                      aria-label="Score state for {nameOf(student)}"
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
            <table class="grading-grid" class:total-only={!gradingByQuestion}>
              <thead>
                <tr>
                  <th>Student</th>
                  {#if gradingByQuestion}
                    {#each selectedAssessment.questionSnapshots as snapshot (snapshot.questionId)}
                      <th>
                        <button
                          class="question-head"
                          onclick={() => openPointsEdit(selectedAssessment, snapshot)}
                          title={`${snapshot.bodyPreview ? `${snapshot.bodyPreview}\n\n` : ''}Change what question ${snapshot.label} is out of`}
                          aria-label="Change what question {snapshot.label} is out of"
                        >
                          <span>Q{snapshot.label}</span>
                          <small>{snapshot.isBonus ? 'Bonus' : ''} / {formatPoints(snapshot.points)}</small>
                        </button>
                      </th>
                    {/each}
                    <th><span>Total</span><small>/{formatPoints(selectedAssessment.totalPoints)}</small></th>
                  {:else}
                    <th>
                      <span>Score</span>
                      <small>/ {selectedAssessment.totalPoints}</small>
                    </th>
                    <th>%</th>
                  {/if}
                  <th class="state-column">State</th>
                </tr>
              </thead>
              <tbody>
                {#if sectionStudents.length === 0}
                  <tr><td colspan={gradeColumnCount + 3}>No roster entries.</td></tr>
                {:else}
                  {#each sectionStudents as student, studentIndex (student.id)}
                    <tr
                      class:inactive={!studentActiveInSection(student)}
                      class:active-row={student.id === activeGradeRowId}
                      class:found-row={student.id === foundStudentId}
                    >
                      <th class="grading-name" title={`${student.firstName} ${student.lastName}`.trim()}>{nameOf(student)}</th>
                      {#if !gradingByQuestion}
                        <td class="grade-cell total-entry" onclick={() => focusGradeCell(studentIndex, 0)}>
                          <input
                            type="text"
                            inputmode="decimal"
                            autocomplete="off"
                            value={scoreInputValue(student.id, selectedAssessment)}
                            aria-label="Score for {nameOf(student)}"
                            data-grade-row={studentIndex}
                            data-grade-col={0}
                            onfocus={(e) => handleGradeCellFocus(e, student.id)}
                            onkeydown={(e) => handleGradeCellKeydown(e, studentIndex, 0)}
                            onpaste={(e) => handleGradePaste(e, studentIndex, 0)}
                            onblur={() => gradebook.endScoreEdit()}
                            oninput={(e) => updateTotalScore(student.id, selectedAssessment, e.currentTarget.value, false)}
                            onchange={(e) => updateTotalScore(student.id, selectedAssessment, e.currentTarget.value, true)}
                          />
                        </td>
                        <td class="total-cell">{percentDisplay(student.id, selectedAssessment) || '-'}</td>
                      {:else}
                      {#each selectedAssessment.questionSnapshots as snapshot, questionIndex (snapshot.questionId)}
                        <td class="grade-cell" onclick={() => focusGradeCell(studentIndex, questionIndex)}>
                          <input
                            type="text"
                            inputmode="decimal"
                            autocomplete="off"
                            value={questionScoreInputValue(student.id, selectedAssessment, snapshot.questionId)}
                            aria-label="Q{snapshot.label} score for {nameOf(student)}"
                            data-grade-row={studentIndex}
                            data-grade-col={questionIndex}
                            onfocus={(e) => handleGradeCellFocus(e, student.id)}
                            onkeydown={(e) => handleGradeCellKeydown(e, studentIndex, questionIndex)}
                            onpaste={(e) => handleGradePaste(e, studentIndex, questionIndex)}
                            onblur={() => gradebook.endScoreEdit()}
                            oninput={(e) => updateQuestionScore(student.id, selectedAssessment, snapshot.questionId, e.currentTarget.value)}
                            onchange={(e) => commitQuestionScore(student.id, selectedAssessment, snapshot.questionId, e.currentTarget.value)}
                          />
                        </td>
                      {/each}
                      <td class="total-cell">{scoreDisplay(student.id, selectedAssessment) || '-'}</td>
                      {/if}
                      <td>
                        <select
                          value={scoreState(student.id, selectedAssessment)}
                          aria-label="Score state for {nameOf(student)}"
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
          {#if pointsEdit && pointsEdit.assessmentId === selectedAssessment.id}
            {@const edit = pointsEdit}
            {@const newPoints = pointsEditValue()}
            {@const above = newPoints === null ? 0 : questionScoresAbove(gradebook.data, selectedAssessment.id, edit.questionId, newPoints)}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <div class="points-backdrop" role="presentation" onclick={() => (pointsEdit = null)}>
              <div class="points-dialog" role="dialog" aria-modal="true" aria-labelledby="points-title" tabindex="-1" onclick={(e) => e.stopPropagation()}>
                <h3 id="points-title">Question {edit.label}</h3>
                {#if edit.preview}<p class="points-preview">{edit.preview}</p>{/if}
                <label class="points-field">Out of
                  <input type="number" min="0" step="0.5" bind:value={edit.value} bind:this={pointsInput}
                    onkeydown={(e) => { if (e.key === 'Enter' && !hasSavedTest(selectedAssessment)) savePointsEdit(selectedAssessment, false); }} />
                </label>
                <p class="points-hint">Use 0 to leave the question out of the total, for example when the class skipped it.</p>
                {#if above > 0 && newPoints !== null}
                  <label class="points-cap"><input type="checkbox" bind:checked={edit.cap} /> Lower {above} {above === 1 ? 'student’s score' : 'students’ scores'} above {formatPoints(newPoints)} to {formatPoints(newPoints)}</label>
                {/if}
                {#if edit.error}<p class="points-error" role="alert">{edit.error}</p>{/if}
                {#if hasSavedTest(selectedAssessment)}
                  <p class="points-hint">Change it in this Gradebook only, or also in the saved test “{testLibrary.get(selectedAssessment.savedTestId)?.name ?? selectedAssessment.savedTestName}” so a reprint matches.</p>
                {/if}
                <div class="points-actions">
                  <button class="ghost" onclick={() => (pointsEdit = null)}>Cancel</button>
                  {#if hasSavedTest(selectedAssessment)}
                    <button onclick={() => savePointsEdit(selectedAssessment, false)}>Gradebook only</button>
                    <button class="primary" onclick={() => savePointsEdit(selectedAssessment, true)}
                      disabled={!testLibrary.get(selectedAssessment.savedTestId)}
                      title={testLibrary.get(selectedAssessment.savedTestId) ? 'Also change the question’s value in the saved test' : 'Open the source bank to also edit this saved test'}>Gradebook and test</button>
                  {:else}
                    <button class="primary" onclick={() => savePointsEdit(selectedAssessment, false)}>Save</button>
                  {/if}
                </div>
              </div>
            </div>
          {/if}
        </section>
      {:else if gradebookMode === 'student' && selectedStudent}
        {@const finalGrade = studentFinalGrade(selectedStudent)}
        <section class="student-view">
          <div class="student-summary">
            <div class="student-picker">
              <input class="student-search" type="search" bind:value={studentSearch}
                aria-label="Search students by name or ID" placeholder="Search student or student ID…"
                oninput={() => (studentPickerOpen = true)} onfocus={() => (studentPickerOpen = true)}
                onkeydown={(event) => {
                  if (event.key === 'Escape') studentPickerOpen = false;
                  if (event.key === 'Enter' && filteredStudents.length > 0) { event.preventDefault(); selectStudentInStudentView(filteredStudents[0].student.id, filteredStudents[0].section.id); }
                }} />
              <button
                class="student-picker-trigger"
                aria-expanded={studentPickerOpen}
                onclick={() => (studentPickerOpen = !studentPickerOpen)}
              >
                <span>
                  <strong>{nameOf(selectedStudent)}</strong>
                  <small>{selectedStudent.email || `${selectedStudent.lastName}, ${selectedStudent.firstName}`}</small>
                </span>
                <span class="picker-chevron">{studentPickerOpen ? '▴' : '▾'}</span>
              </button>
              {#if studentPickerOpen}
                <div class="student-picker-menu">
                  {#each filteredStudents as match (`${match.section.id}:${match.student.id}`)}
                    {@const student = match.student}
                    <button
                      class:active={student.id === selectedStudent.id && match.section.id === selectedSectionId}
                      class:inactive={!studentActiveInSection(student, match.section.id)}
                      onclick={() => selectStudentInStudentView(student.id, match.section.id)}
                    >
                      <span>{nameOf(student)}{match.section.id !== selectedSectionId ? ` (${searchClassName(match.section)})` : ''}</span>
                      <small>{student.sisId ? `ID: ${student.sisId}` : student.email || `${student.lastName}, ${student.firstName}`}</small>
                    </button>
                  {:else}
                    <p class="empty">No students match this name or ID.</p>
                  {/each}
                </div>
              {/if}
            </div>
            <div class="final-grade">
              <span>Final Grade</span>
              <strong>{finalGrade.primary}</strong>
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
                  <span>Known by</span>
                  <input
                    value={selectedStudent.knownBy ?? ''}
                    placeholder={selectedStudent.firstName}
                    onchange={(e) => updateSelectedStudent({ knownBy: e.currentTarget.value })}
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
                  Active across all sections
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
                <button class="ghost danger-text" onclick={removeSelectedStudentFromSection}>
                  Remove from this section
                </button>
                <button class="ghost danger-text" onclick={deleteSelectedStudent}>
                  Delete from all sections
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
                        {#if expandedStudentAssessmentId === assessment.id && (assessment.gradingMode === 'total' || assessment.questionSnapshots.length === 0) && !score?.questionScores?.some((entry) => entry.points !== null)}
                          <div class="student-assessment-detail">
                            <p class="total-only-note">Graded as a total only · {scoreDisplay(selectedStudent.id, assessment) || '-'} / {assessmentTotalLabel(assessment)}</p>
                          </div>
                        {:else if expandedStudentAssessmentId === assessment.id}
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

  {#if smallPaneOpen && viewportWidth <= 1100}<button class="drawer-backdrop" aria-label="Close details" onclick={hideDetails}></button>{/if}
  {#if (rightRailVisible && viewportWidth > 1100) || (smallPaneOpen && viewportWidth <= 1100)}
  <aside bind:this={detailRail} class="detail-rail" class:drawer={viewportWidth <= 1100} role={viewportWidth <= 1100 ? 'dialog' : undefined} aria-modal={viewportWidth <= 1100 ? true : undefined} aria-label="Gradebook details">
    {#if viewportWidth <= 1100}<button class="ghost drawer-close" onclick={hideDetails}>Close details</button>{/if}
    {#if gradebookMode === 'overview' && selectedSection}
        <div class="detail-header"><h2>Roster</h2><button class="rail-toggle" onclick={hideDetails} title="Hide roster">›</button></div>
        {@render rosterPanel()}
      <section class="panel section-removal">
        <div>
          <h2>Archive or delete this section</h2>
          <p>Archive a finished section to keep its roster and scores out of the way. Move a section to the Trash when you mean to delete it; it can be restored until you delete it for good.</p>
        </div>
        <div class="section-removal-actions">
          <button class="ghost" onclick={() => selectedSection && putAwaySection(selectedSection, 'archive')}>Archive section</button>
          <button class="ghost danger-text" onclick={() => selectedSection && putAwaySection(selectedSection, 'trash')}>Move to Trash</button>
        </div>
      </section>
    {:else if gradebookMode === 'student' && selectedStudent}
      <div class="detail-header">
        <div>
          <h2>{nameOf(selectedStudent)}</h2>
          <p>{studentFinalGrade(selectedStudent).primary}</p>
        </div>
        <button class="rail-toggle" onclick={hideDetails} title="Hide details">›</button>
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
    {:else if gradebookMode === 'grading'}
      <div class="detail-header">
        <div><h2>Assessments</h2><p>Select to grade; select again to show questions.</p></div>
        <button class="rail-toggle" onclick={hideDetails} title="Hide assessments">›</button>
      </div>
      <div class="grading-assessment-list">
        {#each sectionAssessments as assessment (assessment.id)}
          <div>
            <button class="assessment-item" class:active={assessment.id === selectedAssessment?.id}
              aria-expanded={expandedGradingAssessmentId === assessment.id}
              onclick={() => chooseGradingAssessment(assessment.id)}>
              <span>{assessment.savedTestName}</span>
              <small>{assessmentTotalLabel(assessment)} · {formatDate(assessment.administeredAt)}</small>
            </button>
            {#if expandedGradingAssessmentId === assessment.id}
              <div class="question-snapshots">
                {#each assessment.questionSnapshots as snapshot (snapshot.questionId)}
                  <div class="snapshot-row">
                    <span>{snapshot.label}</span>
                    <strong>{snapshot.isBonus ? 'Bonus' : ''} {snapshot.points} pts</strong>
                    <p>{snapshot.bodyPreview || (assessment.source === 'external' ? 'External question' : snapshot.questionId)}</p>
                  </div>
                {:else}
                  <p class="empty">Total-only assessment · {assessmentTotalLabel(assessment)}</p>
                {/each}
              </div>
            {/if}
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
  .score-section > .panel-header { flex-wrap: wrap; align-items: center; }
  .score-history { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin: 10px 0; }
  .score-history small, .paste-message { color: var(--text-2); }
  .missing-policy { display: grid; gap: 6px; margin-bottom: 8px; }
  .drawer-open { margin-bottom: 8px; }
  .drawer-backdrop { position: fixed; inset: 0; z-index: 30; border: 0; border-radius: 0; background: #0008; }
  .drawer-backdrop:hover { background: #0008; }
  .detail-rail.drawer { display: block; position: fixed; top: 0; right: 0; bottom: 0; width: min(400px, calc(100vw - 24px)); box-sizing: border-box; z-index: 31; padding: 12px 12px calc(12px + env(safe-area-inset-bottom)); box-shadow: -8px 0 24px #0003; }
  .drawer-close { display: block; margin: 0 0 12px auto; }
  .roster-preview-dialog { width: min(800px, calc(100vw - 40px)); max-height: calc(100dvh - 40px); box-sizing: border-box; padding: 20px; border: 1px solid var(--border); border-radius: 10px; background: var(--bg); color: var(--text); }
  .roster-preview-dialog::backdrop { background: #0008; }
  .roster-preview-scroll { overflow: auto; max-height: 45dvh; }
  .roster-preview-scroll table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .roster-preview-scroll th, .roster-preview-scroll td { text-align: left; padding: 8px; border-bottom: 1px solid var(--border); }
  .preview-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }

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
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
  }

  .assessment-form select {
    grid-column: 1 / -1;
  }

  .external-assessment {
    margin-bottom: 12px;
  }

  .assessment-edit {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px 10px;
    margin: 0 0 12px;
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg-2);
  }

  .assessment-edit label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    font-size: 12px;
    color: var(--text-2);
  }

  .assessment-edit .wide {
    grid-column: 1 / -1;
  }

  .danger-text {
    color: var(--danger);
  }

  .edit-note {
    color: var(--text-2);
    font-size: 12px;
  }

  .edit-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .edit-actions span {
    flex: 1;
  }

  .external-assessment summary {
    cursor: pointer;
    color: var(--text-2);
    font-size: 12px;
  }

  .external-form {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 7px;
    margin: 8px 0 4px;
  }

  .external-form input:first-child,
  .external-form input:nth-of-type(3) {
    grid-column: 1 / -1;
  }

  .external-form button {
    grid-column: 2;
  }

  .external-error {
    display: block;
    color: var(--danger);
    font-size: 12px;
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

  .roster-hint {
    margin: 10px 0 0;
    color: var(--text-2);
    font-size: 12px;
  }

  .overview-stack {
    display: contents;
  }

  .mobile-grade-controls,
  .mobile-score-cards,
  .mobile-score-entry-list {
    display: none;
  }

  .student-table-link,
  .student-total-link {
    width: 100%;
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    text-align: left;
  }

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
  .question-snapshots {
    display: grid;
    gap: 6px;
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


  .section-removal {
    display: grid;
    margin-top: 12px;
    gap: 12px;
  }

  .section-removal h2 {
    margin: 0 0 4px;
    font-size: 14px;
  }

  .section-removal p {
    margin: 0;
    max-width: 60ch;
    color: var(--text-2);
    font-size: 12px;
  }

  .section-removal-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
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
    grid-template-columns: minmax(0, 1fr) auto auto;
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
    grid-template-columns: minmax(0, 1fr);
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
    min-height: 64px;
    padding: 8px 12px;
    box-shadow: none;
    border-radius: 4px;
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
    padding: 8px;
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
    min-width: 0;
    border-collapse: collapse;
    font-size: 13px;
  }

  .grading-grid th,
  .grading-grid td {
    border-bottom: 1px solid var(--border);
    border-right: 1px solid var(--border);
    padding: 3px 6px;
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
    min-width: 140px;
  }

  .grading-grid thead th:first-child {
    left: 0;
    z-index: 2;
  }

  .grading-grid th.grading-name {
    position: sticky;
    left: 0;
    z-index: 1;
    max-width: 220px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 500;
  }

  .grading-grid tr.active-row th.grading-name {
    background: color-mix(in srgb, var(--primary) 10%, var(--bg));
  }

  .grading-grid tr.found-row th.grading-name {
    background: color-mix(in srgb, var(--primary) 28%, var(--bg));
    color: var(--text);
    font-weight: 700;
  }

  .grading-grid tr.active-row td {
    background: color-mix(in srgb, var(--primary) 4%, var(--bg));
  }

  .grading-grid select {
    width: 100%;
    min-width: 112px;
    padding: 4px 24px 4px 8px;
    font-size: 12px;
  }

  .grading-grid.total-only {
    width: auto;
    min-width: 0;
  }

  .grading-grid.total-only th.grading-name {
    min-width: 200px;
  }

  .grading-grid td.total-entry {
    width: 110px;
  }

  .total-only-note {
    margin: 0;
    color: var(--text-2);
    font-size: 12px;
  }

  .sort-toggle {
    display: inline-flex;
    align-items: center;
    gap: 0;
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
    font-size: 12px;
  }

  .sort-toggle span {
    padding: 4px 8px;
    color: var(--text-2);
    background: var(--bg-2);
  }

  .sort-toggle button {
    border: 0;
    border-left: 1px solid var(--border);
    border-radius: 0;
    padding: 4px 10px;
    background: var(--bg);
    color: var(--text-2);
    font-size: 12px;
  }

  .sort-toggle button.active {
    background: color-mix(in srgb, var(--primary) 16%, var(--bg));
    color: var(--text);
    font-weight: 600;
  }

  .name-search {
    align-self: center;
    padding: 3px 8px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--primary) 16%, var(--bg));
    font-size: 12px;
    white-space: nowrap;
  }

  .name-search.miss {
    background: color-mix(in srgb, var(--danger) 16%, var(--bg));
  }

  .section-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }

  .section-course-select {
    width: auto;
    max-width: 260px;
    padding: 2px 6px;
    font-size: 12px;
  }

  .assessment-scope {
    display: block;
    margin: -2px 0 8px;
    color: var(--text-2);
    font-size: 12px;
  }

  .grading-grid th span,
  .grading-grid th small {
    display: block;
  }

  .grading-grid td.grade-cell {
    min-width: 64px;
    height: 28px;
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
    min-height: 28px;
    margin: 0;
    padding: 3px 8px;
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

  .score-cell,
  .student-table-link,
  .student-total-link {
    border: 0;
    border-radius: 0;
    box-shadow: none;
  }

  .student-table-link,
  .student-total-link { padding: 4px 6px; }

  .score-grid tfoot th,
  .score-grid tfoot td,
  .score-grid tbody th,
  .score-grid tbody td,
  .score-grid thead th { padding: 0; }
  .score-grid button { padding: 8px 10px; min-height: 34px; white-space: nowrap; }
  .score-grid th:hover,
  .score-grid td:hover,
  .score-grid th:focus-within,
  .score-grid td:focus-within { background: var(--bg-3); }
  .score-grid .class-summary th,
  .score-grid .class-summary td { background: var(--bg-2); border-top: 2px solid var(--border); font-weight: 600; }
  .score-grid .class-summary th { text-align: left; }
  .summary-cell { width: 100%; border: 0; border-radius: 0; box-shadow: none; background: transparent; text-align: inherit; }
  .score-grid button:hover { background: transparent; }
  .score-grid button:focus-visible { outline-offset: -2px; }
  .overview-column { width: 100%; border-radius: 0; box-shadow: none; background: transparent; text-align: inherit; }
  .student-picker-menu span { white-space: normal; overflow-wrap: anywhere; }
  .grading-grid .state-column,
  .grading-grid tbody td:last-child {
    position: sticky;
    right: 0;
    min-width: 124px;
    z-index: 1;
  }
  .grading-grid thead .state-column { z-index: 2; }
  .student-edit-grid label.toggle-row { display: flex; grid-column: 1 / -1; white-space: normal; }
  .roster-panel .student-form { grid-template-columns: 1fr; }
  .student-search { margin-bottom: 6px; }
  .student-picker-trigger > span:first-child { min-width: 0; overflow-wrap: anywhere; }
  .grading-assessment-list { display: grid; gap: 10px; }
  .grading-assessment-list .assessment-item { width: 100%; text-align: left; }
  .grading-assessment-list .question-snapshots { margin-top: 6px; }

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
    .external-form,
    .assessment-edit,
    .student-layout,
    .category-total-grid {
      grid-template-columns: 1fr;
    }

    .external-form input:first-child,
    .external-form input:nth-of-type(3),
    .external-form button {
      grid-column: auto;
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

    .setup-grid .assessment-form,
    .compact-form {
      grid-template-columns: 1fr;
      align-items: stretch;
      width: 100%;
      min-width: 0;
    }

    .setup-grid .assessment-form select,
    .setup-grid .assessment-form input,
    .compact-form input,
    .compact-form select {
      width: 100%;
      min-width: 0;
      max-width: 100%;
      box-sizing: border-box;
    }

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
    .assessment-item {
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
    .mobile-assessment-score span,
    .mobile-assessment-score strong {
      display: block;
    }

    .mobile-student-summary strong {
      font-size: 16px;
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

    .mobile-score-entry-name strong {
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


    input,
    select,
    button {
      font-size: 16px;
    }
  }
  .question-head {
    display: grid;
    justify-items: center;
    gap: 1px;
    width: 100%;
    padding: 2px 4px;
    border: 1px solid transparent;
    border-radius: 4px;
    background: none;
    color: inherit;
    font: inherit;
    height: auto;
    min-height: 0;
    line-height: 1.25;
    white-space: nowrap;
    cursor: pointer;
  }

  .question-head:hover,
  .question-head:focus-visible {
    border-color: var(--border);
    background: var(--bg-2);
  }

  .points-backdrop {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: grid;
    place-items: center;
    padding: 16px;
    background: rgba(0, 0, 0, 0.35);
  }

  .points-dialog {
    display: grid;
    gap: 10px;
    width: min(26rem, 100%);
    padding: 16px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--bg);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.25);
  }

  .points-dialog h3 { margin: 0; font-size: 15px; }
  .points-preview { margin: 0; color: var(--text-2); font-size: 12px; max-height: 5.5em; overflow: auto; }
  .points-field { display: grid; gap: 4px; font-size: 12px; font-weight: 600; }
  .points-field input { width: 8rem; }
  .points-hint { margin: 0; color: var(--text-2); font-size: 12px; }
  .points-cap { display: flex; gap: 6px; align-items: center; font-size: 12px; }
  .points-cap input { width: auto; }
  .points-error { margin: 0; color: var(--danger); font-size: 12px; }
  .points-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
</style>
